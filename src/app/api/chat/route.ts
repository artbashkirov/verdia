import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  chatCompletion,
  getAIProvider,
  analyzeDocuments,
  buildLowOcrTriageResult,
} from '@/lib/openai';
import { getLawContext, getTemplatesContext } from '@/lib/rag';
import { DOCUMENT_GENERATION_PROMPT } from '@/lib/prompts';
import {
  NEXT_STEPS_QUESTION_MARKER,
  buildNextStepsQuestion,
  buildTemplateBlock,
  detectDocumentType,
} from '@/lib/next-steps-templates';
import type { UserProfile } from '@/types/database';
import {
  encodeAttachmentsInMessage,
  encodeAttachmentsForPrompt,
  parseAttachmentsFromMessage,
  normalizeAttachmentsFromBody,
  buildEffectiveMessageWithAttachments,
  toAttachmentMetaList,
  type ChatAttachment,
} from '@/types/chat-attachment';

// Format plaintiff info for document generation
function formatPlaintiffForDocuments(profile: UserProfile | null): string {
  if (!profile) return '';
  
  let context = '\n\nДАННЫЕ ИСТЦА ДЛЯ ДОКУМЕНТОВ:\n';
  
  if (profile.person_type === 'individual') {
    if (profile.full_name) context += `ФИО: ${profile.full_name}\n`;
    if (profile.passport_series && profile.passport_number) {
      context += `Паспорт: ${profile.passport_series} ${profile.passport_number}`;
      if (profile.passport_issued_by) context += `, выдан ${profile.passport_issued_by}`;
      if (profile.passport_issue_date) context += ` ${profile.passport_issue_date}`;
      context += '\n';
    }
    if (profile.registration_address) context += `Адрес регистрации: ${profile.registration_address}\n`;
    if (profile.phone) context += `Телефон: ${profile.phone}\n`;
    if (profile.email_contact) context += `Email: ${profile.email_contact}\n`;
  } else if (profile.person_type === 'entrepreneur') {
    if (profile.full_name) context += `ИП ${profile.full_name}\n`;
    if (profile.ogrnip) context += `ОГРНИП: ${profile.ogrnip}\n`;
    if (profile.inn_individual) context += `ИНН: ${profile.inn_individual}\n`;
    if (profile.registration_address) context += `Адрес: ${profile.registration_address}\n`;
  } else if (profile.person_type === 'legal_entity') {
    if (profile.company_form && profile.company_name) {
      context += `${profile.company_form} "${profile.company_name}"\n`;
    }
    if (profile.ogrn) context += `ОГРН: ${profile.ogrn}\n`;
    if (profile.inn_legal) context += `ИНН: ${profile.inn_legal}\n`;
    if (profile.kpp) context += `КПП: ${profile.kpp}\n`;
    if (profile.registration_address) context += `Юридический адрес: ${profile.registration_address}\n`;
  }
  
  // Bank details if available
  if (profile.bank_name && profile.bank_account) {
    context += `\nБанковские реквизиты:\n`;
    context += `Банк: ${profile.bank_name}\n`;
    if (profile.bank_bik) context += `БИК: ${profile.bank_bik}\n`;
    context += `Р/с: ${profile.bank_account}\n`;
    if (profile.bank_corr_account) context += `К/с: ${profile.bank_corr_account}\n`;
  }
  
  return context;
}

const CHAT_SYSTEM_PROMPT = `Ты - Verdia, юридический AI-ассистент для граждан России. 
Ты уже предоставил пользователю юридическую консультацию с анализом судебной практики и прогнозом успеха.
Теперь пользователь может уточнить детали или согласиться на подготовку документов.

ПРАВИЛА:
1. Если пользователь соглашается на документы ("да", "согласен", "хочу", "давай", "составь", "подготовь") - переходи к генерации документов
2. Отвечай кратко и по существу
3. Ссылайся на предыдущий анализ, если это уместно
4. Если вопрос выходит за рамки гражданского процесса РФ, вежливо сообщи об этом

ФОРМАТИРОВАНИЕ:
- Используй **жирный текст** для важных терминов
- Используй нумерованные списки (1. 2. 3.) для пошаговых инструкций
- Разделяй абзацы пустой строкой

Стиль: профессиональный, но дружелюбный и доступный.`;

// Документы, для которых имеет смысл подтягивать образцы возражений
// (key_arguments + prayer + legal_references из нашей базы шаблонов).
// Для исков/претензий/договоров образцы не нужны — там логика другая.
function isObjectionLikeDocument(
  message: string,
  documentType: string | undefined,
): boolean {
  const text = (message || '').toLowerCase();
  const textPatterns = [
    /возражени/i,
    /отзыв/i,
    /апелляц/i,
    /кассац/i,
    /\bжалоб/i,
    /обжалов/i,
    /против иска/i,
    /отказать в иск/i,
  ];
  if (textPatterns.some((re) => re.test(text))) return true;

  // По типу документа из triage: получили иск/решение/постановление — скорее всего
  // следующее действие будет защитительным.
  const objectionDocTypes = new Set([
    'claim_against_user',
    'court_decision',
    'administrative_decision',
    'pretension_received',
  ]);
  return !!documentType && objectionDocTypes.has(documentType);
}

// Check if message is a document generation request
function isDocumentRequest(message: string): boolean {
  const docPatterns = [
    /документ/i,
    /заявлени/i,
    /иск(?:овое)?/i,
    /претензи/i,
    /ходатайств/i,
    /возражени/i,
    /создай/i,
    /сгенерируй/i,
    /напиши/i,
    /составь/i,
    /подготов/i,
  ];
  return docPatterns.some(p => p.test(message));
}

// Check if message is agreeing to document creation
function isAgreement(message: string): boolean {
  const agreementPatterns = [
    /^да\b/i,
    /^согласен/i,
    /^хочу\b/i,
    /^давай/i,
    /^конечно/i,
    /^да,?\s*пожалуйста/i,
    /^ok\b/i,
    /^ок\b/i,
    /^хорошо/i,
  ];
  return agreementPatterns.some(p => p.test(message.trim()));
}

// Affirmative response to the "хотите расскажу что дальше" follow-up.
// Используется ТОЛЬКО когда последнее сообщение ассистента было этим вопросом —
// иначе "да" по-прежнему попадает в isAgreement и триггерит генерацию документов.
function isAffirmativeForNextSteps(message: string): boolean {
  if (isAgreement(message)) return true;
  return /расскаж|дальше|подать|следующи|инструкц/i.test(message);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Chat API: Auth error', authError);
      return NextResponse.json(
        { error: 'Необходима авторизация' },
        { status: 401 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('Chat API: JSON parse error', parseError);
      return NextResponse.json(
        { error: 'Неверный формат запроса' },
        { status: 400 }
      );
    }

    const { generationId, message } = body;

    const attachments = normalizeAttachmentsFromBody(body);

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const effectiveMessage = buildEffectiveMessageWithAttachments(trimmedMessage, attachments);

    if (!generationId || !effectiveMessage) {
      console.error('Chat API: Missing required fields', {
        generationId: !!generationId,
        message: !!effectiveMessage,
      });
      return NextResponse.json(
        { error: 'Не указан ID чата или сообщение' },
        { status: 400 }
      );
    }

    const messageForStorage = encodeAttachmentsInMessage(effectiveMessage, attachments);
    const messageForAi = attachments.length
      ? `${effectiveMessage}${encodeAttachmentsForPrompt(attachments)}`
      : effectiveMessage;

    // Get the original generation for context
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .select('query, response')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single();

    if (genError || !generation) {
      return NextResponse.json(
        { error: 'Чат не найден' },
        { status: 404 }
      );
    }

    const gen = generation as { query: string; response: any };
    if (!gen.query || !gen.response) {
      return NextResponse.json(
        { error: 'Неверный формат данных чата' },
        { status: 400 }
      );
    }

    // Get previous messages in this chat
    const { data: previousMessages = [] } = await supabase
      .from('chat_messages')
      .select('role, content, documents')
      .eq('generation_id', generationId)
      .order('created_at', { ascending: true });

    type PrevMsg = { role: string; content: string; documents?: Array<{ title: string; content: string }> | null };
    const prevMsgs = (previousMessages || []) as PrevMsg[];

    // Determine if user is responding to the "что делать дальше" follow-up question.
    // Это должно проверяться ДО isAgreement, иначе "да" триггернет повторную генерацию документов.
    const lastAssistantMsg = [...prevMsgs].reverse().find(m => m.role === 'assistant');
    const wasFollowUpQuestion = !!lastAssistantMsg && NEXT_STEPS_QUESTION_MARKER.test(lastAssistantMsg.content);
    const wantsNextSteps = wasFollowUpQuestion && isAffirmativeForNextSteps(effectiveMessage);

    // Determine message type — анализируем именно текст пользователя
    // (без приклеенного документа), иначе любой загруженный файл будет
    // ошибочно классифицироваться как запрос на генерацию иска.
    const shouldGenerateDocuments = !wantsNextSteps && (isDocumentRequest(effectiveMessage) || isAgreement(effectiveMessage));

    // Build context from original generation
    // Для triage-чатов (когда первый запрос был «прислал документы, без
    // вопроса») генерация хранит другой формат — без shortAnswer/legalAnalysis,
    // зато с caseTitle и summary. Контекст-промпт переключаем отдельно,
    // иначе AI получит вереницу «(пусто) (пусто) (пусто)» и сгенерирует
    // болванку, не привязанную к делу.
    const isTriageChat = gen.response?._mode === 'document-triage';
    const contextSummary = isTriageChat
      ? `
Тип задачи: пользователь прислал документ(ы), и мы провели первичный анализ.
Заголовок дела: ${gen.response?.caseTitle || gen.query}
Краткая суть: ${gen.response?.summary || '(не определена)'}
Тип документа: ${gen.response?.documentType || 'unknown'}
${Array.isArray(gen.response?.documentBreakdown) && gen.response.documentBreakdown.length > 0
  ? `Что в документах:\n${gen.response.documentBreakdown
      .map((d: { fileName: string; type: string; summary: string }) =>
        `- ${d.type || 'Документ'} (${d.fileName}): ${d.summary || '-'}`,
      )
      .join('\n')}`
  : ''}
${Array.isArray(gen.response?.missingInfo) && gen.response.missingInfo.length > 0
  ? `Чего не хватает в материалах:\n- ${gen.response.missingInfo.join('\n- ')}`
  : ''}

ВАЖНО для тебя: полный текст исходных документов пользователя приложен ниже
в его первом сообщении (внутри блока с маркерами «📎»). Опирайся на конкретные
факты, имена, даты и суммы оттуда. НЕ выдумывай данные. Если для качественного
ответа не хватает информации — задай уточняющий вопрос пользователю, а не
выдавай шаблон с плейсхолдерами.
`
      : `
Изначальный вопрос: "${gen.query}"

Краткий ответ: ${gen.response?.shortAnswer?.title || ''} ${gen.response?.shortAnswer?.content || ''}

Прогноз успеха: ${gen.response?.probability?.percentage || '?'}% (${gen.response?.probability?.level || 'неизвестно'})

Рекомендации: ${gen.response?.recommendations?.join('; ') || 'см. анализ'}

Правовые основания: ${gen.response?.legalAnalysis?.bases?.join('; ') || 'см. анализ'}

Предполагаемый суд: ${gen.response?.courtPrediction?.predictedCourt?.name || 'определяется по месту регистрации ответчика'}
`;

    // Handle: пользователь прислал новые документы в triage-чат.
    // Запускаем повторный triage с УЧЁТОМ ВСЕХ файлов (старые из истории
    // + новые из текущего сообщения). Без этой ветки исходное сообщение
    // «Проанализируй прикреплённые документы» матчилось на isDocumentRequest()
    // (там есть слово «документ»), и система сразу выдавала шаблонные
    // возражения, не перечитывая новые страницы. Это путало пользователя.
    if (attachments.length > 0 && isTriageChat) {
      // Собираем ВСЕ предыдущие attachments из чата (у них уже есть
      // extractedText, OCR не нужен) + только что присланные.
      const previousAttachments: ChatAttachment[] = [];
      for (const m of prevMsgs) {
        const parsed = parseAttachmentsFromMessage(m.content);
        for (const att of parsed.attachments) {
          if (att && att.extractedText) {
            previousAttachments.push(att);
          }
        }
      }

      // Дедуп: пользователь часто прикладывает один и тот же файл повторно
      // (например, тестируя). Ключ — `fileName + size`: уникален для
      // реальных разных файлов, но устойчив к двойной отправке. Сохраняем
      // ПЕРВОЕ вхождение (старое, у него уже есть валидный extractedText),
      // дубль из новой пачки игнорируем.
      const dedupedAttachments: ChatAttachment[] = [];
      const seenKeys = new Set<string>();
      for (const att of [...previousAttachments, ...attachments]) {
        const key = `${att.fileName}__${att.size}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        dedupedAttachments.push(att);
      }
      const allAttachments = dedupedAttachments;
      const uniqueNewCount = attachments.filter((att) => {
        const key = `${att.fileName}__${att.size}`;
        // Если этот ключ есть среди previousAttachments — это дубль
        return !previousAttachments.some(
          (prev) => `${prev.fileName}__${prev.size}` === key,
        );
      }).length;

      const allOcrFailed = allAttachments.every((a) => {
        const t = (a.extractedText ?? '').trim();
        return !t || t.startsWith('[OCR-system:');
      });

      type TriageResult = Awaited<ReturnType<typeof analyzeDocuments>>;
      let triage: TriageResult;
      if (allOcrFailed) {
        triage = buildLowOcrTriageResult(
          allAttachments.map((a) => ({ fileName: a.fileName })),
        );
      } else {
        const TRIAGE_CHARS_PER_DOC = 14000;
        const TRIAGE_TIMEOUT_MS = 120_000;
        const attachmentContext = encodeAttachmentsForPrompt(
          allAttachments,
          TRIAGE_CHARS_PER_DOC,
        );
        try {
          triage = await Promise.race([
            analyzeDocuments(effectiveMessage, attachmentContext),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('AI_TIMEOUT')), TRIAGE_TIMEOUT_MS),
            ),
          ]);
        } catch (err) {
          console.error('[chat/triage] FAILED', {
            generationId,
            error: err instanceof Error ? err.message : String(err),
          });
          // Сохраняем user message с файлами, но возвращаем понятную ошибку,
          // чтобы клиент не зависал и не получил мусорный ответ.
          await supabase.from('chat_messages').insert({
            generation_id: generationId as string,
            user_id: user.id,
            role: 'user',
            content: messageForStorage,
            documents: [],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
          return NextResponse.json(
            {
              error:
                err instanceof Error && err.message === 'AI_TIMEOUT'
                  ? 'Анализ занял слишком много времени. Попробуйте прислать меньше документов сразу.'
                  : 'Не удалось проанализировать документы. Попробуйте ещё раз.',
            },
            { status: 502 },
          );
        }
      }

      // Сохраняем user-сообщение с новыми attachments
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'user',
        content: messageForStorage,
        documents: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // Готовим ассистент-ответ: короткий текст + triage-объект внутри
      // documents с маркером type='triage'. Фронт распознаёт его и
      // рендерит DocumentTriageView прямо в чате (mini-triage),
      // оставляя исходный triage сверху без изменений.
      //
      // Текст ответа должен честно отражать, сколько НОВЫХ уникальных
      // файлов добавилось (а не сколько было прислано — пользователь
      // может повторно прикладывать одни и те же страницы).
      let assistantText: string;
      if (previousAttachments.length === 0) {
        assistantText = 'Готов общий анализ присланных материалов.';
      } else if (uniqueNewCount === 0) {
        // Все присланные файлы уже были в чате
        assistantText = `Эти файлы уже были в материалах — анализ обновлён по тем же ${allAttachments.length} документам.`;
      } else {
        const fileWord =
          uniqueNewCount === 1 ? 'нового файла' : `новых файлов (${uniqueNewCount})`;
        assistantText = `Обновил анализ с учётом ${fileWord}. Всего в материалах сейчас ${allAttachments.length}.`;
      }

      const triageDocPayload = {
        type: 'triage',
        ...triage,
      };

      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'assistant',
        content: assistantText,
        documents: [triageDocPayload],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      return NextResponse.json({
        message: assistantText,
        documents: [triageDocPayload],
      });
    }

    // Handle "что делать дальше" follow-up
    if (wantsNextSteps) {
      // Find the most recent assistant message that has documents attached.
      const lastDocsMsg = [...prevMsgs].reverse().find(
        m => m.role === 'assistant' && Array.isArray(m.documents) && m.documents.length > 0
      );
      const docs = (lastDocsMsg?.documents || []) as Array<{ title: string; content: string }>;
      const docTitles = docs.map(d => d.title || '');
      const docTypes = [...new Set(docTitles.map(detectDocumentType))];

      const templateBlock = buildTemplateBlock(docTitles);

      // Сгенерировать AI-секцию "Особенности вашего случая" на основе контекста
      // дела + найденных в RAG статей закона. Если RAG/AI не сработают —
      // оставляем только статический шаблон.
      let customSection = '';
      try {
        const ragQuery = `${gen.query} — что делать после получения документа: ${docTypes.join(', ')}`;
        const { context: lawContext, articles } = await getLawContext(ragQuery, {
          matchCount: 4,
          matchThreshold: 0.3,
        });

        if (articles.length > 0) {
          const customPrompt = `Ты юридический ассистент. Дай 2-3 коротких пункта "Особенности вашего случая" — что важно учесть именно в этой ситуации помимо общих процессуальных шагов.

КОНТЕКСТ ДЕЛА: ${gen.query}
ТИПЫ ДОКУМЕНТОВ: ${docTypes.join(', ')}
${lawContext}

ТРЕБОВАНИЯ:
- Только маркированный список из 2-3 пунктов.
- Каждый пункт со ссылкой на КОНКРЕТНУЮ статью закона из контекста выше (например, "ст. 22 Закона о защите прав потребителей").
- Никаких вводных фраз, заголовков и заключений — только сами пункты.
- Не выдумывай статьи, которых нет в контексте.
- Если в контексте недостаточно данных для конкретики — верни ровно одну пустую строку.`;

          const aiText = await chatCompletion(
            [{ role: 'system', content: customPrompt }],
            { maxTokens: 600 }
          );
          customSection = (aiText || '').trim();
        }
      } catch (err) {
        console.error('[NextSteps] RAG/AI custom section failed (non-fatal):', err);
      }

      const finalMessage = customSection
        ? `${templateBlock}\n\n**Особенности вашего случая:**\n\n${customSection}`
        : templateBlock;

      // Save user message
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'user',
        content: messageForStorage,
        documents: [],
      } as any);

      // Save assistant message with the next-steps response
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'assistant',
        content: finalMessage,
        documents: [],
      } as any);

      return NextResponse.json({
        message: finalMessage,
        documents: [],
      });
    }

    // Handle document generation
    if (shouldGenerateDocuments) {
      // Load user profile for plaintiff data
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      const userProfile = profileData as UserProfile | null;
      const plaintiffContext = formatPlaintiffForDocuments(userProfile);
      
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: DOCUMENT_GENERATION_PROMPT },
        { role: 'user', content: contextSummary + plaintiffContext },
        { role: 'assistant', content: 'Понял контекст и данные истца. Готов создать документы.' },
      ];

      // Для triage-чатов сначала отдельно подмешиваем ПОЛНЫЙ текст всех
      // приложенных документов из первого user-сообщения — без него AI
      // не сможет составить конкретный документ (выдаст болванку с
      // плейсхолдерами). Для обычных чатов это не нужно: там есть
      // shortAnswer/legalAnalysis в contextSummary.
      if (isTriageChat) {
        const allAttachments: ChatAttachment[] = [];
        for (const m of prevMsgs) {
          const parsed = parseAttachmentsFromMessage(m.content);
          for (const att of parsed.attachments) {
            if (att && att.extractedText) {
              allAttachments.push(att);
            }
          }
        }
        if (allAttachments.length > 0) {
          // 14K символов на документ ≈ 4 страницы юридического текста.
          // Если документов 3+ — итого ~45K симв., gpt-4o справляется.
          const docsBlock = encodeAttachmentsForPrompt(allAttachments, 14000);
          messages.push({
            role: 'user',
            content: `Вот исходные документы пользователя (полный текст):${docsBlock}`,
          });
          messages.push({
            role: 'assistant',
            content: 'Документы получены. Опираюсь на них при подготовке ответа.',
          });
        }
      }

      // ── RAG: нормы права + образцы возражений ─────────────────────────
      // Без этого AI цитирует статьи и реквизиты актов «по памяти» —
      // получаются ошибки в формулах пени, периодах моратория и т.п.
      // (См. замечания юриста по делу Жеребцова.)
      //
      // 1. getLawContext — ВСЕГДА: норм цитировать нужно в любом документе.
      // 2. getTemplatesContext — только для возражений/жалоб/апелляций,
      //    где у нас есть свои образцы с ключевыми доводами.
      //
      // Best-effort: если RAG упал/тайм-аут — генерируем без него, чтобы
      // не блокировать пользователя.
      try {
        const ragStart = Date.now();
        const ragQuery = [
          isTriageChat ? gen.response?.caseTitle || '' : gen.query || '',
          messageForAi || '',
        ]
          .filter(Boolean)
          .join('. ')
          .slice(0, 1000);

        const docType = isTriageChat
          ? (gen.response?.documentType as string | undefined)
          : undefined;
        const wantTemplates = isObjectionLikeDocument(messageForAi, docType);

        // Параллельно. Таймаут 8 сек на каждый источник — иначе UX страдает.
        const RAG_TIMEOUT_MS = 8000;
        const withTimeout = <T>(p: Promise<T>, fallback: T): Promise<T> =>
          Promise.race([
            p,
            new Promise<T>((resolve) =>
              setTimeout(() => resolve(fallback), RAG_TIMEOUT_MS),
            ),
          ]);

        const [lawResult, templatesResult] = await Promise.all([
          withTimeout(
            getLawContext(ragQuery, { matchCount: 5, matchThreshold: 0.3 }),
            { context: '', articles: [] as Array<{ code_name: string; article_number: string }> },
          ),
          wantTemplates
            ? withTimeout(
                getTemplatesContext(ragQuery, { matchCount: 3, matchThreshold: 0.3 }),
                { context: '', templates: [] },
              )
            : Promise.resolve({ context: '', templates: [] }),
        ]);

        const lawArticlesCount = lawResult.articles?.length || 0;
        const templatesCount = (templatesResult as { templates?: unknown[] }).templates?.length || 0;
        const elapsed = Date.now() - ragStart;

        console.log(
          `[docs/rag] law_articles=${lawArticlesCount} templates=${templatesCount} elapsed_ms=${elapsed} wantTemplates=${wantTemplates}`,
        );

        if (lawResult.context && lawResult.context.trim()) {
          messages.push({
            role: 'user',
            content: `=== БАЗА НПА (релевантные статьи из нашей базы знаний) ===\n${lawResult.context.trim()}\n\nПравило: ссылаться на нормы можно ТОЛЬКО если они присутствуют в этом блоке. Если нужной статьи здесь нет — не цитируй её реквизиты, а либо обходи без точной ссылки, либо помечай как требующую проверки юристом.`,
          });
          messages.push({
            role: 'assistant',
            content: 'Принял нормы. Буду цитировать только перечисленные статьи.',
          });
        }

        if (templatesResult.context && templatesResult.context.trim()) {
          messages.push({
            role: 'user',
            content: `=== ОБРАЗЦЫ ВОЗРАЖЕНИЙ (для ориентира по структуре и доводам) ===\n${templatesResult.context.trim()}\n\nПравило: используй образцы как ориентир структуры и набора доводов. НЕ копируй формулировки дословно — это чужие дела с другими сторонами. Каждый довод адаптируй под факты из приложенных документов.`,
          });
          messages.push({
            role: 'assistant',
            content: 'Образцы понял, использую только как структурный ориентир.',
          });
        }
      } catch (ragErr) {
        // Best-effort: не валим генерацию документа из-за проблем с RAG.
        console.error('[docs/rag] failed (non-fatal):', ragErr);
      }

      // Add previous chat context (visible-only). Полный текст документов
      // уже подмешан выше; здесь только текстовая переписка пользователя.
      if (previousMessages && previousMessages.length > 0) {
        const recentMessages = (previousMessages as Array<{ role: string; content: string }>).slice(-4);
        recentMessages.forEach((msg) => {
          const visible = parseAttachmentsFromMessage(msg.content).visibleContent;
          if (!visible.trim()) return;
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: visible.slice(0, 500),
          });
        });
      }

      messages.push({ role: 'user', content: messageForAi });

      // Save user message
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'user',
        content: messageForStorage,
        documents: [],
      } as any);

      // Generate documents using AI (Gemini — основная, или OpenAI по настройке)
      // 12000 tokens — safe headroom for full исковое заявление (~6-9k tokens)
      // to prevent JSON truncation that produces empty documents fallback.
      const responseText = await chatCompletion(messages, { maxTokens: 12000, jsonMode: true });
      
      console.log(`🔍 [${getAIProvider()}] raw response length:`, responseText.length);
      console.log(`🔍 [${getAIProvider()}] response (first 1000 chars):`, responseText.slice(0, 1000));
      
      let parsed;
      try {
        // Remove markdown code block wrappers if present
        const cleanedText = responseText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        
        // Try to find JSON object
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
          console.log('✅ Parsed JSON successfully. Documents count:', parsed.documents?.length || 0);
          if (parsed.documents && parsed.documents.length > 0) {
            console.log('📄 First document keys:', Object.keys(parsed.documents[0]));
            console.log('📄 First document has content?', !!parsed.documents[0].content);
          }
        } else {
          console.warn('⚠️ No JSON object found in response');
          parsed = { message: 'Документы готовы.', documents: [] };
        }
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        console.error('❌ Response (first 500 chars):', responseText.slice(0, 500));
        parsed = { message: 'Документы готовы.', documents: [] };
      }

      let assistantMessage = parsed.message || '';
      let documents = parsed.documents || [];

      console.log('📋 Documents before validation:', documents.length);
      
      // Validate documents - ensure they have content field
      documents = documents.map((doc: any, index: number) => {
        if (!doc.content && doc.title) {
          console.warn(`⚠️ Document ${index} missing content field, title: ${doc.title}`);
          console.warn(`⚠️ Document ${index} has keys:`, Object.keys(doc));
          // If content is missing, try to use description or create placeholder
          return {
            ...doc,
            content: doc.description || doc.text || `Содержимое документа "${doc.title}" недоступно.`,
          };
        }
        return doc;
      }).filter((doc: any) => doc && doc.title); // Remove invalid documents
      
      console.log('✅ Documents after validation:', documents.length);

      // Формируем сообщение с правильным числом
      if (!assistantMessage) {
        if (documents.length === 1) {
          assistantMessage = 'Документ готов для скачивания.';
        } else if (documents.length > 1) {
          assistantMessage = 'Документы готовы для скачивания.';
        } else {
          assistantMessage = 'Документы готовы.';
        }
      }

      // Save assistant message with documents
      console.log('💾 Saving message with documents:', documents.length);
      const { error: insertError } = await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'assistant',
        content: assistantMessage,
        documents: documents.length > 0 ? documents : [],
      } as any);
      
      if (insertError) {
        console.error('❌ Error saving message with documents:', insertError);
      } else {
        console.log('✅ Message with documents saved successfully');
      }

      // Follow-up question: предлагаем рассказать, что делать дальше
      // (только если документы реально сгенерированы).
      if (documents.length > 0) {
        const followUp = buildNextStepsQuestion(documents.length);
        const { error: followUpError } = await supabase.from('chat_messages').insert({
          generation_id: generationId as string,
          user_id: user.id,
          role: 'assistant',
          content: followUp,
          documents: [],
        } as any);

        if (followUpError) {
          console.error('❌ Error saving follow-up question:', followUpError);
        }
      }

      return NextResponse.json({
        message: assistantMessage,
        documents: documents,
        paymentRequired: true,
        price: parsed.price || 500,
      });

    } else {
      // Regular chat flow — enrich with RAG law context
      let lawContext = '';
      try {
        // Для RAG-поиска берём только текст пользователя (без полного
        // тела документа) — иначе embedding теряет фокус на вопросе.
        const ragResult = await getLawContext(effectiveMessage, { matchCount: 3, matchThreshold: 0.35 });
        lawContext = ragResult.context;
      } catch (err) {
        console.error('[RAG] Chat error (non-fatal):', err);
      }

      const systemWithRag = lawContext
        ? CHAT_SYSTEM_PROMPT + lawContext
        : CHAT_SYSTEM_PROMPT;

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemWithRag },
        { role: 'user', content: `Контекст моего вопроса:\n${contextSummary}` },
        { role: 'assistant', content: 'Понял. Чем могу помочь?' },
      ];

      // В triage-чате AI должен иметь полный текст приложенных документов,
      // иначе ответы будут общими. Подмешиваем их перед историей.
      if (isTriageChat) {
        const allAttachments: ChatAttachment[] = [];
        for (const m of prevMsgs) {
          const parsed = parseAttachmentsFromMessage(m.content);
          for (const att of parsed.attachments) {
            if (att && att.extractedText) {
              allAttachments.push(att);
            }
          }
        }
        if (allAttachments.length > 0) {
          const docsBlock = encodeAttachmentsForPrompt(allAttachments, 14000);
          messages.push({
            role: 'user',
            content: `Вот исходные документы пользователя (полный текст):${docsBlock}`,
          });
          messages.push({
            role: 'assistant',
            content: 'Документы получены. Опираюсь на них при ответе.',
          });
        }
      }

      if (previousMessages && previousMessages.length > 0) {
        (previousMessages as Array<{ role: string; content: string }>).forEach(msg => {
          // Прошлые сообщения отдаём AI как есть (вложение там уже
          // закодировано как видимый маркер + скрытый блок).
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          });
        });
      }

      messages.push({ role: 'user', content: messageForAi });

      // Save user message
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'user',
        content: messageForStorage,
        documents: [],
      } as any);

      // Generate response using AI (Gemini — основная, или OpenAI по настройке)
      let assistantMessage = await chatCompletion(messages, { maxTokens: 1500 }) || 'Извините, произошла ошибка.';

      // Check if this looks like a question about documents and add offer
      if (/что дальше|как подать|следующ|документ|куда обращ/i.test(effectiveMessage)) {
        assistantMessage += `\n\n**Хотите, чтобы я подготовил необходимые документы?**\n\nМогу составить исковое заявление, претензию или ходатайство на основе вашей ситуации. Напишите "да" или "составь документы", чтобы начать.`;
      }

      // Save assistant message (no documents for regular chat)
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'assistant',
        content: assistantMessage,
        documents: [],
      } as any);

      return NextResponse.json({
        message: assistantMessage,
        documents: [],
      });
    }

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при обработке сообщения' },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch chat messages
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Необходима авторизация' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const generationId = searchParams.get('generationId');

    if (!generationId) {
      return NextResponse.json(
        { error: 'Не указан ID чата' },
        { status: 400 }
      );
    }

    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('id, role, content, documents, created_at')
      .eq('generation_id', generationId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return NextResponse.json(
        { error: 'Ошибка загрузки сообщений' },
        { status: 500 }
      );
    }

    // Normalize documents field - ensure it's always an array
    // Plus extract attached file metadata из скрытого блока: для UI важно
    // показать «скрепку» с именем файла, а скрытый JSON (с полным текстом
    // документа) клиенту отдавать не нужно — это и трафик, и лишние данные.
    const normalizedMessages = (messages || []).map((msg: any) => {
      let documents = msg.documents;

      if (!documents) {
        documents = [];
      } else if (typeof documents === 'string') {
        try {
          documents = JSON.parse(documents);
        } catch (e) {
          console.warn('Failed to parse documents string:', e);
          documents = [];
        }
      } else if (!Array.isArray(documents)) {
        documents = [];
      }

      const parsed = parseAttachmentsFromMessage(
        typeof msg.content === 'string' ? msg.content : '',
      );

      const attachmentsForClient = toAttachmentMetaList(parsed.attachments);

      return {
        ...msg,
        content: parsed.visibleContent,
        documents: documents || [],
        attachments: attachmentsForClient,
        attachment: attachmentsForClient[0] ?? null,
      };
    });

    return NextResponse.json({ messages: normalizedMessages });

  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка' },
      { status: 500 }
    );
  }
}
