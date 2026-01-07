import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiChatCompletion } from '@/lib/openai';
import { DOCUMENT_GENERATION_PROMPT, CHAT_CONTINUATION_PROMPT } from '@/lib/prompts';

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
      return NextResponse.json(
        { error: 'Необходима авторизация' },
        { status: 401 }
      );
    }

    const { generationId, message } = await request.json();
    
    if (!generationId || !message) {
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
      } as any);

      return NextResponse.json({
        message: repResponse,
        documents: [],
        showRepresentativeOffer: true,
      });
    }

    // Handle document generation
    if (shouldGenerateDocuments) {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: DOCUMENT_GENERATION_PROMPT },
        { role: 'user', content: contextSummary },
        { role: 'assistant', content: 'Понял контекст. Готов создать документы.' },
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
      } as any);

      // Generate documents using Gemini
      const responseText = await geminiChatCompletion(messages, { maxTokens: 5000, jsonMode: true });
      
      let parsed;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          parsed = { message: responseText.trim(), documents: [] };
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError, 'Response:', responseText.slice(0, 500));
        parsed = { message: responseText.trim() || 'Документы готовы.', documents: [] };
      }

      const assistantMessage = parsed.message || 'Документы готовы для скачивания.';
      const documents = parsed.documents || [];

      // Add representative offer to the message
      const fullMessage = `${assistantMessage}

---

**Нужна помощь представителя в суде?**

После подготовки документов я могу помочь найти квалифицированного юриста для представительства ваших интересов в судебном заседании. Напишите "нужен представитель" или "помощь в суде", чтобы узнать подробнее.`;

      // Save assistant message
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'assistant',
        content: fullMessage,
      } as any);

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
      } as any);

      // Generate response
      let assistantMessage = await geminiChatCompletion(messages, { maxTokens: 1500 }) || 'Извините, произошла ошибка.';

      // Check if this looks like a question about documents and add offer
      if (/что дальше|как подать|следующ|документ|куда обращ/i.test(message)) {
        assistantMessage += `\n\n---\n\n**Хотите, чтобы я подготовил необходимые документы?**\n\nМогу составить исковое заявление, претензию или ходатайство на основе вашей ситуации. Напишите "да" или "составь документы", чтобы начать.`;
      }

      // Save assistant message
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'assistant',
        content: assistantMessage,
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
      .select('id, role, content, created_at')
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

    return NextResponse.json({ messages: messages || [] });

  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка' },
      { status: 500 }
    );
  }
}
