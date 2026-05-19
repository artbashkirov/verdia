import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateLegalResponse } from '@/lib/openai';
import { searchCourtCases } from '@/lib/court-search';
import { getLawContext } from '@/lib/rag';
import { exampleQueries } from '@/lib/example-queries';
import type { UserProfile, PersonType } from '@/types/database';
import {
  encodeAttachmentsForPrompt,
  normalizeAttachmentsFromBody,
  appendAttachmentMarkersToQuery,
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

      try {
        // Check authentication
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          sendEvent('error', { message: 'Необходима авторизация' });
          closeController();
          return;
        }

        // Check if user already has a generation with the same query (within last 24 hours)
        // This prevents duplicate entries when user clicks the same question multiple times
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
          // If we found an existing generation, redirect to it instead of creating a new one
          if (existingGeneration.response) {
            // Generation is complete - send complete event to redirect
            sendEvent('complete', { 
              id: existingGeneration.id, 
              query, 
              existing: true 
            });
            closeController();
            return;
          } else {
            // Generation is in progress - redirect to it (user can wait there)
            sendEvent('complete', { 
              id: existingGeneration.id, 
              query, 
              inProgress: true 
            });
            closeController();
            return;
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
        
        const generationId = initialGeneration?.id;

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

        // AI получает текст документов с лимитом 12K символов на каждый
        // (≈3 страницы юридического текста — обычно достаточно для сути).
        // Полные 30K на 3 файла = 90K символов, gpt-4o-mini тогда генерирует
        // ответ ~60+ секунд и часто упирается в таймауты Cloudflare Worker.
        const AI_CHARS_PER_DOC = 12000;
        const attachmentContext = attachments.length
          ? encodeAttachmentsForPrompt(attachments, AI_CHARS_PER_DOC)
          : '';

        const aiBaseQuery = attachments.length
          ? (userQuery || 'Проанализируй прикреплённые документы и определи суть дела')
          : query;

        const enhancedSearchResults = {
          ...searchResults,
          plaintiffContext,
        };

        // Для запросов с документами: ПЕРВЫМ пробуем быструю надёжную
        // модель (gpt-4o, ~15-25с). Если она упадёт — fallback ниже
        // деградирует до дефолтной (gemini-flash / gpt-4o-mini).
        //
        // Gemini 3 Pro/2.5 Pro reasoning-модели могут отвечать 2-5 минут
        // на большом контексте, и Cloudflare Worker часто рвёт соединение
        // по 30-секундному CPU-лимиту. Включить можно явно через env:
        //   DOCS_AI_MODEL=google/gemini-3-pro  (медленно, дорого, но топ)
        //   DOCS_AI_MODEL=gpt-4o               (по умолчанию — быстро)
        //   DOCS_AI_MODEL=gpt-4.1              (новее, ещё быстрее)
        const docsModel = process.env.DOCS_AI_MODEL || 'gpt-4o';
        const docsProvider: 'openai' | 'gemini' =
          docsModel.startsWith('google/') || docsModel.startsWith('gemini')
            ? 'gemini'
            : 'openai';

        const aiOptions = attachments.length
          ? { forceProvider: docsProvider, model: docsModel }
          : undefined;

        const aiPrompt =
          aiBaseQuery + plaintiffContext + attachmentContext + lawContext;

        // Защищаем стрим от подвисания. Если AI не ответил за заданное
        // время — отдаём пользователю чёткую ошибку вместо вечного спиннера.
        const AI_TIMEOUT_MS = attachments.length ? 180_000 : 90_000;
        const runAi = async (opts?: typeof aiOptions): Promise<string> => {
          return generateLegalResponse(aiPrompt, enhancedSearchResults, opts);
        };

        const responseJson = await Promise.race<string>([
          runAi(aiOptions).catch(async (err: unknown) => {
            // Если усиленная модель недоступна (404 / провайдер не настроен),
            // не валим весь запрос — деградируем до дефолтной модели и
            // продолжаем. Пользователь получит ответ, пусть и упрощённый.
            const message = err instanceof Error ? err.message : String(err);
            if (
              aiOptions &&
              (message.includes('404') ||
                message.includes('not configured') ||
                message.includes('Worker proxy error'))
            ) {
              console.warn(
                '[generate-stream] strong model failed, falling back to default:',
                message,
              );
              return runAi(undefined);
            }
            throw err;
          }),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error('AI_TIMEOUT')),
              AI_TIMEOUT_MS,
            ),
          ),
        ]).catch((err: unknown) => {
          if (err instanceof Error && err.message === 'AI_TIMEOUT') {
            console.error('[generate-stream] AI timeout after', AI_TIMEOUT_MS, 'ms', {
              generationId,
              attachmentsCount: attachments.length,
              promptChars:
                aiBaseQuery.length +
                plaintiffContext.length +
                attachmentContext.length +
                lawContext.length,
            });
            throw new Error(
              attachments.length
                ? 'Ответ занимает слишком много времени. Попробуйте отправить меньше документов или сократить запрос.'
                : 'Ответ занимает слишком много времени. Попробуйте переформулировать запрос.',
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
        sendEvent('error', { 
          message: error instanceof Error ? error.message : 'Произошла ошибка' 
        });
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

