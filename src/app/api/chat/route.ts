import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatCompletion, getAIProvider } from '@/lib/openai';
import { getLawContext } from '@/lib/rag';
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
  appendAttachmentMarkersToQuery,
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
    const contextSummary = `
Изначальный вопрос: "${gen.query}"

Краткий ответ: ${gen.response?.shortAnswer?.title || ''} ${gen.response?.shortAnswer?.content || ''}

Прогноз успеха: ${gen.response?.probability?.percentage || '?'}% (${gen.response?.probability?.level || 'неизвестно'})

Рекомендации: ${gen.response?.recommendations?.join('; ') || 'см. анализ'}

Правовые основания: ${gen.response?.legalAnalysis?.bases?.join('; ') || 'см. анализ'}

Предполагаемый суд: ${gen.response?.courtPrediction?.predictedCourt?.name || 'определяется по месту регистрации ответчика'}
`;

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

      // Add previous chat context
      if (previousMessages && previousMessages.length > 0) {
        const recentMessages = (previousMessages as Array<{ role: string; content: string }>).slice(-4);
        recentMessages.forEach((msg) => {
          // Из истории убираем скрытый блок с JSON-вложением — оставляем
          // только видимый текст + AI-видимый маркер документа. Полный
          // текст документа уже подмешан выше для текущего сообщения
          // через `messageForAi`; для прошлых — обрезаем до 500 символов
          // (как и раньше), чтобы не раздувать промпт.
          const visible = parseAttachmentsFromMessage(msg.content).visibleContent;
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

      if (previousMessages && previousMessages.length > 0) {
        (previousMessages as Array<{ role: string; content: string }>).forEach(msg => {
          // Прошлые сообщения отдаём AI как есть (вложение там уже
          // закодировано как видимый маркер + скрытый блок). HTML-комментарий
          // не мешает LLM понимать структуру.
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
