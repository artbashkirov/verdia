import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateLegalResponse, analyzeDocuments } from '@/lib/openai';
import { searchCourtCases } from '@/lib/court-search';
import { getLawContext } from '@/lib/rag';
import { exampleQueries } from '@/lib/example-queries';
import type { UserProfile, PersonType } from '@/types/database';
import {
  encodeAttachmentsForPrompt,
  encodeAttachmentsInMessage,
  normalizeAttachmentsFromBody,
  type ChatAttachment,
} from '@/types/chat-attachment';

// Check if query is an example question and return its ID (1-based)
function getExampleQuestionId(query: string): number | null {
  const index = exampleQueries.findIndex(q => q === query);
  return index !== -1 ? index + 1 : null;
}

// Determine if the query is about individual (physical person) or legal entity
function getDefendantPlaceholder(query: string): { namePlaceholder: string; label: string } {
  const lowerQuery = query.toLowerCase();
  
  // Keywords indicating individual person as defendant
  const individualKeywords = [
    'алименты', 'развод', 'раздел имущества', 'супруг', 'бывший муж', 'бывшая жена',
    'наследство', 'наследник', 'завещание', 'родительские права', 'ребёнок', 'ребенок',
    'отцовство', 'материнство', 'опека', 'усыновление',
    'сосед', 'соседи', 'залив от соседа',
    'расписка', 'долг по расписке', 'займ между',
    'избиение', 'побои', 'клевета', 'оскорбление',
  ];
  
  // Check for individual keywords
  const isIndividual = individualKeywords.some(keyword => lowerQuery.includes(keyword));
  
  if (isIndividual) {
    return {
      namePlaceholder: 'Петров Алексей Сергеевич',
      label: 'ФИО ответчика'
    };
  }
  
  // Default to legal entity (most common in consumer protection, labor disputes with companies, etc.)
  return {
    namePlaceholder: 'ООО "Ромашка" или ФИО',
    label: 'Наименование ответчика'
  };
}

// Extract defendant info from query
function extractParties(query: string) {
  const result: { 
    defendantName?: string; 
    defendantLocation?: string;
    defendantType?: PersonType;
    defendantInn?: string;
  } = {};
  
  const defendantPatterns = [
    /(?:против|ответчик|к)\s+(?:ООО|ИП|АО|ПАО|ЗАО)\s*[«"]?([^»".,]+)[»"]?/i,
    /(?:ООО|ИП|АО|ПАО|ЗАО)\s*[«"]?([^»".,]+)[»"]?/i,
  ];
  
  for (const pattern of defendantPatterns) {
    const match = query.match(pattern);
    if (match) {
      result.defendantName = match[0].trim();
      // Detect defendant type
      if (/ООО/i.test(result.defendantName)) result.defendantType = 'legal_entity';
      else if (/ИП/i.test(result.defendantName)) result.defendantType = 'entrepreneur';
      else if (/АО|ПАО|ЗАО/i.test(result.defendantName)) result.defendantType = 'legal_entity';
      break;
    }
  }
  
  // Try to extract INN
  const innMatch = query.match(/ИНН\s*:?\s*(\d{10,12})/i);
  if (innMatch) {
    result.defendantInn = innMatch[1];
  }
  
  result.defendantLocation = 'Москва';
  return result;
}

// Format plaintiff info for AI context
function formatPlaintiffContext(profile: UserProfile | null): string {
  if (!profile) return '';
  
  let context = '\n\nИНФОРМАЦИЯ ОБ ИСТЦЕ:\n';
  
  if (profile.person_type === 'individual') {
    if (profile.full_name) context += `ФИО: ${profile.full_name}\n`;
    if (profile.registration_address) context += `Адрес регистрации: ${profile.registration_address}\n`;
    if (profile.registration_city) context += `Город: ${profile.registration_city}\n`;
  } else if (profile.person_type === 'entrepreneur') {
    if (profile.full_name) context += `ИП: ${profile.full_name}\n`;
    if (profile.ogrnip) context += `ОГРНИП: ${profile.ogrnip}\n`;
    if (profile.inn_individual) context += `ИНН: ${profile.inn_individual}\n`;
  } else if (profile.person_type === 'legal_entity') {
    if (profile.company_form && profile.company_name) {
      context += `Организация: ${profile.company_form} "${profile.company_name}"\n`;
    }
    if (profile.ogrn) context += `ОГРН: ${profile.ogrn}\n`;
    if (profile.inn_legal) context += `ИНН: ${profile.inn_legal}\n`;
  }
  
  if (profile.registration_region) {
    context += `Регион регистрации: ${profile.registration_region}\n`;
  }
  
  return context;
}

// Максимум символов из каждого документа, которые мы подмешиваем в
// семантический поиск (court cases + RAG). Полный текст уйдёт в AI-промпт
// отдельно; здесь важны только ключевые слова, иначе embedding-модель
// упадёт по токенам, а sudact.ru не сможет распарсить такой запрос.
const SEARCH_DOC_CHARS = 1500;

function buildSearchableQuery(userText: string, list: ChatAttachment[]): string {
  const cleanedUser = (userText || '').trim();
  if (!list.length) return cleanedUser;

  const excerpts = list
    .map((att) => (att.extractedText || '').trim().slice(0, SEARCH_DOC_CHARS))
    .filter(Boolean)
    .join('\n\n');

  if (!excerpts) return cleanedUser;
  if (!cleanedUser) return excerpts;
  return `${cleanedUser}\n\n${excerpts}`;
}

function buildChatTitle(userText: string, list: ChatAttachment[]): string {
  const cleanedUser = (userText || '').trim();
  if (cleanedUser) return cleanedUser.slice(0, 100);
  if (list.length === 1) {
    return `Анализ документа: ${list[0].fileName}`.slice(0, 100);
  }
  if (list.length > 1) {
    return `Анализ документов (${list.length})`;
  }
  return 'Новый запрос';
}

export async function POST(request: NextRequest) {
  let userQuery: string;
  let defendantName: string | undefined;
  let defendantLocation: string | undefined;
  let useCachedResponse: boolean = false;
  let attachments: ChatAttachment[] = [];
  try {
    const body = await request.json();
    userQuery = typeof body.query === 'string' ? body.query : '';
    defendantName = body.defendantName;
    defendantLocation = body.defendantLocation;
    useCachedResponse = body.useCachedResponse || false;
    attachments = normalizeAttachmentsFromBody(body);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  userQuery = (userQuery || '').trim();
  // chatTitle — то, что видит пользователь и хранится в БД как `query`.
  // Без маркеров «📎 file.jpg · 184 КБ» — иначе вверху страницы и в
  // сайдбаре висит мусор. Сами вложения отдельно лежат в chat_messages.
  // searchableQuery — выжимка для семантического поиска.
  const chatTitle = buildChatTitle(userQuery, attachments);
  const searchableQuery = buildSearchableQuery(userQuery, attachments);

  if (!chatTitle && attachments.length === 0) {
    return new Response(JSON.stringify({ error: 'Query required' }), { status: 400 });
  }

  // В легаси-коде ниже использовалось одно имя `query` для всего сразу.
  // Чтобы не переписывать десятки обращений, оставляем алиас на chatTitle
  // — это и то, что попадёт в БД, и то, что отрисуется в <h1>.
  const query = chatTitle;

  // If using cached response, just create generation record and return ID
  if (useCachedResponse) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            console.error('Error sending event:', e);
          }
        };

        try {
          const supabase = await createClient();
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          
          if (authError || !user) {
            sendEvent('error', { message: 'Необходима авторизация' });
            controller.close();
            return;
          }

          // Check if user already has a generation with the same query (within last 24 hours)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existingGeneration } = await (supabase.from('generations') as any)
            .select('id, response, created_at')
            .eq('user_id', user.id)
            .eq('query', query)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (existingGeneration) {
            // If we found an existing generation, redirect to it
            sendEvent('complete', { 
              id: existingGeneration.id, 
              query, 
              cached: true,
              existing: true 
            });
            controller.close();
            return;
          }

          // Get cached response from DB
          const questionId = getExampleQuestionId(query);
          let cachedResponse = null;
          
          if (questionId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: cache } = await (supabase.from('cached_responses') as any)
              .select('response')
              .eq('question_id', questionId)
              .single();
            
            if (cache) {
              cachedResponse = cache.response;
            }
          }

          // Create generation record with cached response
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: generation } = await (supabase.from('generations') as any)
            .insert({
              user_id: user.id,
              query: query,
              response: cachedResponse,
            })
            .select()
            .single();

          if (generation?.id) {
            // Create chat history entry
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('chat_history') as any).insert({
              user_id: user.id,
              title: chatTitle,
              generation_id: generation.id,
            });

            sendEvent('complete', { id: generation.id, query, cached: true });
          } else {
            sendEvent('error', { message: 'Не удалось создать запись' });
          }
        } catch (error) {
          console.error('Cached response error:', error);
          sendEvent('error', { message: 'Произошла ошибка' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  const encoder = new TextEncoder();
  
  // Create a readable stream
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      
      const sendEvent = (event: string, data: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          console.error('Error sending event:', e);
        }
      };
      
      const closeController = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch (e) {
            // Already closed, ignore
          }
        }
      };

      // Поднимаем эти переменные в скоуп start(), чтобы catch-блок мог
      // записать ошибку в БД даже если падение случилось до их инициализации.
      let generationId: string | undefined;
      let courtCasesDataForError: Array<unknown> = [];

      try {
        // Check authentication
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          sendEvent('error', { message: 'Необходима авторизация' });
          closeController();
          return;
        }

        // Запросы с вложениями всегда уникальны (другой набор файлов = другой
        // контекст), поэтому ниже дубли проверяются только для текстовых
        // запросов. Триаж по документам уйдёт по своей ветке.
        if (attachments.length === 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existingGeneration } = await (supabase.from('generations') as any)
            .select('id, response, created_at')
            .eq('user_id', user.id)
            .eq('query', query)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (existingGeneration) {
            const createdAtMs = new Date(existingGeneration.created_at).getTime();
            const ageMs = Date.now() - createdAtMs;
            // Зомби-чат: запись есть, но ответа нет, и прошло уже >2 минут.
            // Не редиректим на него (там вечный лоадер), а создаём новый
            // чат и попутно помечаем зомби как failed, чтобы он не мешал.
            const STALE_THRESHOLD_MS = 2 * 60 * 1000;
            const isZombie = !existingGeneration.response && ageMs > STALE_THRESHOLD_MS;

            if (isZombie) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase.from('generations') as any)
                  .update({
                    response: {
                      _status: 'failed',
                      error: 'Генерация прервалась (таймаут или ошибка сервера).',
                    },
                  })
                  .eq('id', existingGeneration.id);
              } catch (markErr) {
                console.warn('[generate-stream] failed to mark zombie generation:', markErr);
              }
            } else if (existingGeneration.response) {
              sendEvent('complete', {
                id: existingGeneration.id,
                query,
                existing: true,
              });
              closeController();
              return;
            } else {
              // Свежая «в процессе» — редиректим на неё, пользователь
              // увидит результат той же самой генерации.
              sendEvent('complete', {
                id: existingGeneration.id,
                query,
                inProgress: true,
              });
              closeController();
              return;
            }
          }
        }

        // Step 0: Load user profile for plaintiff info
        let userProfile: UserProfile | null = null;
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        if (profileData) {
          userProfile = profileData as UserProfile;
        }

        // Step 0.5: Create generation record immediately so it appears in sidebar
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: initialGeneration } = await (supabase.from('generations') as any)
          .insert({
            user_id: user.id,
            query: query,
            response: null, // Will be updated with full response later
          })
          .select()
          .single();
        
        generationId = initialGeneration?.id;

        // ===================================================================
        // ВЕТКА A: ДОКУМЕНТЫ — БЫСТРЫЙ TRIAGE БЕЗ ПОИСКА ДЕЛ
        // ===================================================================
        // Если пользователь прислал документы, мы НЕ запускаем обычный полный
        // флоу (поиск sudact + RAG + полный анализ практики). Документ сам
        // диктует контекст: пока неизвестно, что человек хочет сделать с этим
        // документом (возразить? обжаловать? найти риски?), поиск похожих
        // дел и анализ практики бессмысленны и медленны.
        //
        // Вместо этого делаем 1 вызов AI — быстрый первичный анализ + список
        // конкретных действий, из которых пользователь выберет следующий шаг.
        // Поиск дел и полная генерация уйдут в /api/document-action.
        if (attachments.length > 0) {
          sendEvent('status', {
            stage: 'analyzing',
            message: 'Анализирую документы (15–30 секунд)...',
          });

          // На triage даём AI больше текста на файл (≈4 стр.), всё равно
          // дел не ищем и общий промпт остаётся компактным.
          const TRIAGE_CHARS_PER_DOC = 14000;
          const attachmentContext = encodeAttachmentsForPrompt(
            attachments,
            TRIAGE_CHARS_PER_DOC,
          );

          // Та же логика выбора модели, что и в полном флоу — env
          // DOCS_AI_MODEL может переключить на gemini-3-pro и т.п.
          const docsModel = process.env.DOCS_AI_MODEL || 'gpt-4o';
          const docsProvider: 'openai' | 'gemini' =
            docsModel.startsWith('google/') || docsModel.startsWith('gemini')
              ? 'gemini'
              : 'openai';

          const TRIAGE_TIMEOUT_MS = 120_000;

          const runTriage = (forceDefault = false) =>
            analyzeDocuments(
              userQuery || '',
              attachmentContext,
              forceDefault
                ? undefined
                : { forceProvider: docsProvider, model: docsModel },
            );

          let triage;
          try {
            triage = await Promise.race([
              runTriage().catch(async (err: unknown) => {
                // Fallback на дефолтную модель, если усиленная не настроена/404.
                const msg = err instanceof Error ? err.message : String(err);
                if (
                  msg.includes('404') ||
                  msg.includes('not configured') ||
                  msg.includes('Worker proxy error')
                ) {
                  console.warn(
                    '[generate-stream/triage] strong model failed, falling back:',
                    msg,
                  );
                  return runTriage(true);
                }
                throw err;
              }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error('AI_TIMEOUT')),
                  TRIAGE_TIMEOUT_MS,
                ),
              ),
            ]);
          } catch (err) {
            if (err instanceof Error && err.message === 'AI_TIMEOUT') {
              console.error(
                '[generate-stream/triage] timeout after',
                TRIAGE_TIMEOUT_MS,
                'ms',
              );
              throw new Error(
                'Анализ документов занимает слишком много времени. Попробуйте отправить меньше документов.',
              );
            }
            throw err;
          }

          // Заголовок чата теперь — это caseTitle от AI. Перезаписываем
          // как саму запись generations.query, так и chat_history.title,
          // чтобы в сайдбаре и в шапке появилась суть дела вместо
          // «Проанализируй прикреплённые документы».
          const triageTitle = triage.caseTitle || chatTitle;

          if (generationId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('generations') as any)
              .update({
                query: triageTitle,
                response: {
                  ...triage,
                  // На клиенте по этому маркеру отрисовывается отдельный
                  // triage-layout (без секций «практика» / «вероятность»).
                  _mode: 'document-triage',
                  _status: 'complete',
                },
              })
              .eq('id', generationId);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('chat_history') as any).insert({
              user_id: user.id,
              title: triageTitle,
              generation_id: generationId,
            });

            // Сохраняем первое user-сообщение с приложенными документами
            // прямо в chat_messages. Текст пользователя обычно пустой
            // (он просто прислал файлы), но сами файлы — с extractedText —
            // нужны последующим /api/chat-вызовам, чтобы под выбранное
            // действие (возражение, апелляция, ...) AI имел полный текст
            // исходных документов, а не только triage-выжимку.
            const initialUserText = userQuery || '';
            const encodedInitialMessage = encodeAttachmentsInMessage(
              initialUserText,
              attachments,
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('chat_messages') as any).insert({
              generation_id: generationId,
              user_id: user.id,
              role: 'user',
              content: encodedInitialMessage,
              documents: [],
            });
          }

          // Отдаём фронту единое событие — у нас новая схема ответа.
          sendEvent('documentTriage', {
            ...triage,
            chatTitle: triageTitle,
          });
          sendEvent('complete', {
            id: generationId,
            query: triageTitle,
          });
          closeController();
          return;
        }

        // ===================================================================
        // ВЕТКА B: ОБЫЧНЫЙ ФЛОУ — ТЕКСТОВЫЙ ЗАПРОС БЕЗ ДОКУМЕНТОВ
        // ===================================================================

        // Step 1: Send "searching" status
        sendEvent('status', { stage: 'searching', message: 'Ищу судебные дела...' });

        // Ответчика ищем и в тексте пользователя, и в документах — ИНН/ООО
        // часто упоминаются только в самом договоре/претензии.
        const parties = extractParties(searchableQuery);

        const finalDefendantName = defendantName || parties.defendantName;
        const finalDefendantLocation = defendantLocation || parties.defendantLocation || 'Москва';

        // Поиск дел и закона ведём по searchableQuery (короткая выжимка из
        // документов + текст пользователя), иначе sudact и embedding не
        // справятся с многокилобайтным телом.
        const [searchResults, ragResult] = await Promise.all([
          searchCourtCases(searchableQuery, {
            maxResults: 5,
            defendantName: finalDefendantName,
            defendantLocation: finalDefendantLocation,
            plaintiffLocation: userProfile?.registration_city,
          }),
          getLawContext(searchableQuery, { matchCount: 5, matchThreshold: 0.3 }).catch(err => {
            console.error('[RAG] Error (non-fatal):', err);
            return { context: '', articles: [] };
          }),
        ]);
        
        const { cases, stats, courtInfo, category } = searchResults;
        const lawContext = ragResult.context;
        
        // Debug: log stats to verify they're correct
        console.log('Search results stats:', {
          total: stats.total,
          satisfied: stats.satisfied,
          partial: stats.partial,
          rejected: stats.rejected,
          casesWithResult: stats.casesWithResult,
          percentage: stats.percentage
        });
        
        // Prepare court cases data (used both for SSE and DB)
        const courtCasesData = cases.slice(0, 5).map((c, i) => ({
          id: i + 1,
          title: c.title,
          url: c.url,
          court: c.court || '',
          isSearchLink: c.isSearchLink || false,
        }));
        courtCasesDataForError = courtCasesData;

        // Step 3: Send court cases immediately via SSE
        sendEvent('courtCases', {
          cases: courtCasesData,
          stats: {
            total: cases.length,
            percentage: stats.percentage,
          },
          courtInfo: courtInfo?.name,
        });

        // Step 3.5: Save court cases to DB immediately (partial state)
        // This allows users who leave and return to see the found cases
        if (generationId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('generations') as any)
            .update({ 
              response: { 
                courtCases: courtCasesData,
                _status: 'generating' // Mark as in-progress
              } 
            })
            .eq('id', generationId);
        }

        // Step 4: Update status - preparing response
        sendEvent('status', { stage: 'analyzing', message: 'Готовлю ответ (примерно 30 секунд)...' });

        // Build enhanced query with plaintiff context + RAG law context
        const plaintiffContext = formatPlaintiffContext(userProfile);

        // В этой ветке вложений нет — они ушли в triage выше.
        const aiPrompt = query + plaintiffContext + lawContext;
        const enhancedSearchResults = {
          ...searchResults,
          plaintiffContext,
        };

        // Защищаем стрим от подвисания. Если AI не ответил за заданное
        // время — отдаём пользователю чёткую ошибку вместо вечного спиннера.
        const AI_TIMEOUT_MS = 90_000;

        const responseJson = await Promise.race<string>([
          generateLegalResponse(aiPrompt, enhancedSearchResults),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS),
          ),
        ]).catch((err: unknown) => {
          if (err instanceof Error && err.message === 'AI_TIMEOUT') {
            console.error('[generate-stream] AI timeout after', AI_TIMEOUT_MS, 'ms', {
              generationId,
              promptChars: aiPrompt.length,
            });
            throw new Error(
              'Ответ занимает слишком много времени. Попробуйте переформулировать запрос.',
            );
          }
          throw err;
        });
        
        let response;
        try {
          response = JSON.parse(responseJson);

          // Check if AI needs clarification
          if (response.clarificationNeeded) {
            // Delete the incomplete generation record since we need clarification
            if (generationId) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase.from('generations') as any)
                .delete()
                .eq('id', generationId);
            }
            sendEvent('clarification', {
              question: response.clarificationQuestion,
              options: response.options || [],
            });
            closeController();
            return;
          }
          
          // Ensure probability with full stats info - ВСЕГДА используем реальные данные из stats
          // Устанавливаем процент только если есть дела с известным результатом
          const probabilityPercentage = stats.casesWithResult > 0 ? stats.percentage : 0;
          const probabilityLevel = stats.casesWithResult > 0 && stats.percentage > 0
            ? (stats.percentage >= 95 ? 'максимальная' 
              : stats.percentage >= 80 ? 'очень высокая'
              : stats.percentage >= 65 ? 'высокая'
              : stats.percentage >= 51 ? 'выше средней'
              : stats.percentage >= 35 ? 'средняя'
              : stats.percentage >= 20 ? 'ниже средней'
              : 'низкая')
            : 'недостаточно данных';
          
          // Создаем или обновляем probability объект с реальными данными
          if (!response.probability) {
            response.probability = {
              level: probabilityLevel,
              positiveFactors: [],
              negativeFactors: [],
            };
          }
          // Всегда перезаписываем реальными данными из статистики (не доверяем AI)
          response.probability.percentage = probabilityPercentage;
          response.probability.totalCases = stats.total;
          response.probability.casesWithResult = stats.casesWithResult;
          response.probability.satisfied = stats.satisfied;
          response.probability.partial = stats.partial;
          response.probability.rejected = stats.rejected;
          response.probability.unknown = stats.total - stats.casesWithResult;
          response.probability.level = probabilityLevel;
          
          console.log('Updated response.probability with stats:', {
            percentage: response.probability.percentage,
            totalCases: response.probability.totalCases,
            casesWithResult: response.probability.casesWithResult,
            satisfied: response.probability.satisfied,
            partial: response.probability.partial,
            rejected: response.probability.rejected,
            unknown: response.probability.unknown,
            level: response.probability.level
          });
          
          // Also update shortAnswer.probability if present - ВСЕГДА перезаписываем реальными данными
          if (response.shortAnswer) {
            if (!response.shortAnswer.probability) {
              response.shortAnswer.probability = {
                percentage: probabilityPercentage,
                level: probabilityLevel,
              };
            }
            // Всегда перезаписываем реальными данными из статистики (не доверяем AI)
            response.shortAnswer.probability.percentage = probabilityPercentage;
            response.shortAnswer.probability.totalCases = stats.total;
            response.shortAnswer.probability.casesWithResult = stats.casesWithResult;
            response.shortAnswer.probability.satisfied = stats.satisfied;
            response.shortAnswer.probability.partial = stats.partial;
            response.shortAnswer.probability.rejected = stats.rejected;
            response.shortAnswer.probability.unknown = stats.total - stats.casesWithResult;
            response.shortAnswer.probability.level = probabilityLevel;
            
            console.log('Updated response.shortAnswer.probability with stats:', {
              percentage: response.shortAnswer.probability.percentage,
              totalCases: response.shortAnswer.probability.totalCases,
              casesWithResult: response.shortAnswer.probability.casesWithResult,
              satisfied: response.shortAnswer.probability.satisfied,
              partial: response.shortAnswer.probability.partial,
              rejected: response.shortAnswer.probability.rejected,
              unknown: response.shortAnswer.probability.unknown,
              level: response.shortAnswer.probability.level
            });
          }
        } catch (parseError) {
          // ВАЖНО: без логирования здесь невозможно понять, ЧТО именно сломалось.
          // Логируем тип ошибки, сообщение и первые 500 символов сырого ответа,
          // чтобы воспроизвести и починить (битый JSON / обрезанный AI-ответ / etc).
          const errMessage = parseError instanceof Error ? parseError.message : String(parseError);
          const rawPreview = typeof responseJson === 'string'
            ? responseJson.slice(0, 500)
            : '<non-string response>';
          console.error('[generate-stream] AI response parse failed:', {
            error: errMessage,
            rawPreview,
            generationId,
          });
          sendEvent('error', { message: 'Ошибка обработки ответа' });
          closeController();
          return;
        }

        // Step 6: Send short answer first (fastest feedback)
        if (response.shortAnswer) {
          sendEvent('shortAnswer', response.shortAnswer);
        }

        // Step 7: Send legal analysis
        if (response.legalAnalysis) {
          sendEvent('legalAnalysis', response.legalAnalysis);
        }

        // Step 8: Send practice analysis
        if (response.practiceAnalysis) {
          sendEvent('practiceAnalysis', response.practiceAnalysis);
        }

        // Step 9: Send probability
        if (response.probability) {
          sendEvent('probability', response.probability);
        }

        // Step 9.5: Send court prediction (judges, court)
        if (response.courtPrediction) {
          sendEvent('courtPrediction', response.courtPrediction);
        }

        // Step 9.7: ВАЖНО - Перезаписываем courtCases реальными данными от VPS scraper
        // AI может сгенерировать свои URL (часто mos-gorsud.ru), но мы используем реальные с sudact.ru
        response.courtCases = cases.slice(0, 5).map((c, i) => ({
          id: i + 1,
          title: c.title,
          url: c.url,
          court: c.court || '',
          isSearchLink: c.isSearchLink || false,
        }));

        // Step 10: Send recommendations
        if (response.recommendations) {
          sendEvent('recommendations', response.recommendations);
        }

        // Step 10.5: Send clarification request if defendant not specified
        if (!finalDefendantName) {
          const defendantPlaceholder = getDefendantPlaceholder(searchableQuery);
          sendEvent('clarificationRequest', {
            type: 'defendant',
            message: 'Для более точного анализа укажите данные ответчика',
            fields: [
              { key: 'defendantName', label: defendantPlaceholder.label, placeholder: defendantPlaceholder.namePlaceholder },
              { key: 'defendantLocation', label: 'Город регистрации', placeholder: 'Москва' },
            ],
            hint: 'Если вы укажете ответчика, я найду все судебные дела с его участием и скорректирую прогноз успеха',
          });
        }

        // Step 11: Update generation record with full response
        if (generationId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('generations') as any)
            .update({ response })
            .eq('id', generationId);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('chat_history') as any).insert({
            user_id: user.id,
            title: chatTitle,
            generation_id: generationId,
          });
        }

        // Step 11.5: Save to cache if this was an example question
        const exampleQuestionId = getExampleQuestionId(query);
        if (exampleQuestionId) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('cached_responses') as any)
              .upsert({
                question_id: exampleQuestionId,
                question_text: query,
                response: response,
                court_cases: cases.slice(0, 5).map((c, i) => ({
                  id: i + 1,
                  title: c.title,
                  url: c.url,
                  court: c.court,
                  isSearchLink: c.isSearchLink,
                })),
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                hit_count: 0,
                last_hit_at: null,
              }, {
                onConflict: 'question_id',
              });
            console.log(`Cached response for example question #${exampleQuestionId}`);
          } catch (cacheError) {
            // Don't fail if caching fails - just log
            console.error('Failed to cache response:', cacheError);
          }
        }

        // Step 12: Send complete event with ID
        sendEvent('complete', {
          id: generationId,
          query,
        });

      } catch (error) {
        console.error('Stream error:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Произошла ошибка';

        // Помечаем generation как failed в БД, чтобы при перезагрузке
        // страницы пользователь увидел ошибку, а не вечный лоадер
        // (раньше тут оставалась запись с response = null = «зомби»).
        if (generationId) {
          try {
            const supabaseForError = await createClient();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabaseForError.from('generations') as any)
              .update({
                response: {
                  _status: 'failed',
                  error: errorMessage,
                  // Сохраняем уже найденные дела, чтобы при ретрае не пропали.
                  courtCases: courtCasesDataForError,
                },
              })
              .eq('id', generationId);
          } catch (markErr) {
            console.error('[generate-stream] failed to write error status:', markErr);
          }
        }

        sendEvent('error', { message: errorMessage });
      } finally {
        closeController();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

