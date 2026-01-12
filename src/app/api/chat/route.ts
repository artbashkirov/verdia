import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiChatCompletion } from '@/lib/openai';
import { DOCUMENT_GENERATION_PROMPT, CHAT_CONTINUATION_PROMPT } from '@/lib/prompts';
import type { UserProfile } from '@/types/database';

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
Теперь пользователь может уточнить детали, согласиться на подготовку документов или запросить помощь представителя.

ПРАВИЛА:
1. Если пользователь соглашается на документы ("да", "согласен", "хочу", "давай", "составь", "подготовь") - переходи к генерации документов
2. Отвечай кратко и по существу
3. Ссылайся на предыдущий анализ, если это уместно
4. Если вопрос выходит за рамки гражданского процесса РФ, вежливо сообщи об этом
5. После создания документов - ОБЯЗАТЕЛЬНО предложи помощь представителя в суде

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

// Check if asking about representative
function isRepresentativeRequest(message: string): boolean {
  const repPatterns = [
    /представител/i,
    /адвокат/i,
    /юрист/i,
    /помо[щг].*суд/i,
    /участ.*заседан/i,
  ];
  return repPatterns.some(p => p.test(message));
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
    
    if (!generationId || !message) {
      console.error('Chat API: Missing required fields', { generationId: !!generationId, message: !!message });
      return NextResponse.json(
        { error: 'Не указан ID чата или сообщение' },
        { status: 400 }
      );
    }

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
      .select('role, content')
      .eq('generation_id', generationId)
      .order('created_at', { ascending: true });

    // Determine message type
    const shouldGenerateDocuments = isDocumentRequest(message) || isAgreement(message);
    const isRepRequest = isRepresentativeRequest(message);

    // Build context from original generation
    const contextSummary = `
Изначальный вопрос: "${gen.query}"

Краткий ответ: ${gen.response?.shortAnswer?.title || ''} ${gen.response?.shortAnswer?.content || ''}

Прогноз успеха: ${gen.response?.probability?.percentage || '?'}% (${gen.response?.probability?.level || 'неизвестно'})

Рекомендации: ${gen.response?.recommendations?.join('; ') || 'см. анализ'}

Правовые основания: ${gen.response?.legalAnalysis?.bases?.join('; ') || 'см. анализ'}

Предполагаемый суд: ${gen.response?.courtPrediction?.predictedCourt?.name || 'определяется по месту регистрации ответчика'}
`;

    // Handle representative request
    if (isRepRequest) {
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'user',
        content: message,
      } as any);

      const repResponse = `**Помощь представителя в суде**

Я могу помочь подобрать квалифицированного юриста для представительства ваших интересов в суде.

**Что включает услуга:**
1. Подбор юриста по вашей категории дела
2. Подготовка к судебному заседанию
3. Представительство в суде
4. Подготовка апелляции при необходимости

**Стоимость:** от 15 000 ₽ (зависит от сложности дела)

Для подбора представителя, пожалуйста, укажите:
- Ваш город
- Желаемую дату первого заседания (если известна)

_Услуга станет доступна после оплаты подготовки документов._`;

      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'assistant',
        content: repResponse,
        documents: [],
      } as any);

      return NextResponse.json({
        message: repResponse,
        documents: [],
        showRepresentativeOffer: true,
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
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content.slice(0, 500),
          });
        });
      }

      messages.push({ role: 'user', content: message });

      // Save user message
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'user',
        content: message,
        documents: [],
      } as any);

      // Generate documents using Gemini
      const responseText = await geminiChatCompletion(messages, { maxTokens: 5000, jsonMode: true });
      
      console.log('🔍 Gemini raw response length:', responseText.length);
      console.log('🔍 Gemini response (first 1000 chars):', responseText.slice(0, 1000));
      
      let parsed;
      try {
        // Remove markdown code block wrappers if present
        let cleanedText = responseText
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

      // Add representative offer to the message (отдельно, чтобы документы показывались между ними)
      const representativeText = `

**Нужна помощь представителя в суде?**

После подготовки ${documents.length === 1 ? 'документа' : 'документов'} я могу помочь найти квалифицированного юриста для представительства ваших интересов в судебном заседании. Напишите "нужен представитель" или "помощь в суде", чтобы узнать подробнее.`;

      const fullMessage = assistantMessage + representativeText;

      // Save assistant message with documents
      console.log('💾 Saving message with documents:', documents.length);
      const { error: insertError } = await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'assistant',
        content: fullMessage,
        documents: documents.length > 0 ? documents : [],
      } as any);
      
      if (insertError) {
        console.error('❌ Error saving message with documents:', insertError);
      } else {
        console.log('✅ Message with documents saved successfully');
      }

      return NextResponse.json({
        message: fullMessage,
        documents: documents,
        paymentRequired: true,
        price: parsed.price || 500,
        showRepresentativeOffer: true,
      });

    } else {
      // Regular chat flow
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        { role: 'user', content: `Контекст моего вопроса:\n${contextSummary}` },
        { role: 'assistant', content: 'Понял. Чем могу помочь?' },
      ];

      if (previousMessages && previousMessages.length > 0) {
        (previousMessages as Array<{ role: string; content: string }>).forEach(msg => {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          });
        });
      }

      messages.push({ role: 'user', content: message });

      // Save user message
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'user',
        content: message,
        documents: [],
      } as any);

      // Generate response
      let assistantMessage = await geminiChatCompletion(messages, { maxTokens: 1500 }) || 'Извините, произошла ошибка.';

      // Check if this looks like a question about documents and add offer
      if (/что дальше|как подать|следующ|документ|куда обращ/i.test(message)) {
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
    const normalizedMessages = (messages || []).map((msg: any) => {
      let documents = msg.documents;
      
      // Handle different formats from database
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
      
      return {
        ...msg,
        documents: documents || [],
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
