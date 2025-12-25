import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { openai } from '@/lib/openai';

const CHAT_SYSTEM_PROMPT = `Ты - Verdia, юридический AI-ассистент для граждан России. 
Ты уже предоставил пользователю юридическую консультацию по его запросу.
Теперь пользователь хочет уточнить детали или задать дополнительные вопросы.

ПРАВИЛА:
1. Отвечай кратко и по существу
2. Ссылайся на предыдущий анализ, если это уместно
3. Если вопрос выходит за рамки гражданского процесса РФ, вежливо сообщи об этом
4. Используй простой и понятный язык
5. При необходимости указывай конкретные статьи законов

ФОРМАТИРОВАНИЕ:
- Используй **жирный текст** для важных терминов
- Используй нумерованные списки (1. 2. 3.) для пошаговых инструкций
- Разделяй абзацы пустой строкой

Стиль: профессиональный, но дружелюбный и доступный.`;

const DOCUMENT_GENERATION_PROMPT = `Ты - Verdia, юридический AI-ассистент. 
Пользователь просит создать юридический документ. Ты ДОЛЖЕН вернуть JSON с документами.

КОНТЕКСТ:
- Изначальный запрос пользователя и твой анализ предоставлены ниже
- Используй информацию из анализа для создания релевантных документов

ФОРМАТ ОТВЕТА (строго JSON):
{
  "message": "Краткое сообщение пользователю (1-2 предложения)",
  "documents": [
    {
      "title": "Название документа",
      "content": "ПОЛНЫЙ текст документа"
    }
  ]
}

ТРЕБОВАНИЯ К ДОКУМЕНТАМ:
1. Создавай ПОЛНЫЕ документы с правильной структурой
2. Используй плейсхолдеры: [ФИО], [АДРЕС], [ДАТА], [СУММА] и т.д.
3. Включай все необходимые разделы

Структура искового заявления:
"""
В [НАИМЕНОВАНИЕ СУДА]

Истец: [ФИО]
Адрес: [АДРЕС]
Телефон: [ТЕЛЕФОН]

Ответчик: [ФИО/НАИМЕНОВАНИЕ]
Адрес: [АДРЕС]

ИСКОВОЕ ЗАЯВЛЕНИЕ
о [предмет иска]

[Обстоятельства дела - 3-5 абзацев]

На основании изложенного, руководствуясь ст. [статьи],

ПРОШУ:
1. [Требование 1]
2. [Требование 2]

Приложения:
1. Копия искового заявления
2. Квитанция об уплате госпошлины
3. [Другие документы]

Дата: _______________
Подпись: _____________ / [ФИО] /
"""

ВАЖНО: Возвращай ТОЛЬКО валидный JSON без дополнительного текста!`;

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

    // Ensure generation has required fields
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

    // Check if this is a document generation request
    const isDocumentRequest = /документ|заявлени|иск|претензи|ходатайств|создай|сгенерируй|напиши|составь/i.test(message);

    // Build context from original generation
    const contextSummary = `
Изначальный вопрос: "${gen.query}"

Краткий ответ: ${gen.response?.shortAnswer?.title || ''} ${gen.response?.shortAnswer?.content || ''}

Рекомендации: ${gen.response?.recommendations?.join('; ') || 'см. анализ'}

Правовые основания: ${gen.response?.legalAnalysis?.bases?.join('; ') || 'см. анализ'}
`;

    if (isDocumentRequest) {
      // Document generation flow
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: DOCUMENT_GENERATION_PROMPT },
        { role: 'user', content: contextSummary },
        { role: 'assistant', content: 'Понял контекст. Готов создать документы.' },
      ];

      // Add previous chat context if exists
      if (previousMessages && previousMessages.length > 0) {
        const recentMessages = (previousMessages as Array<{ role: string; content: string }>).slice(-4); // Last 4 messages for context
        recentMessages.forEach((msg) => {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content.slice(0, 500), // Truncate long messages
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

      // Generate documents
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = { message: 'Произошла ошибка при генерации документов. Попробуйте еще раз.', documents: [] };
      }

      const assistantMessage = parsed.message || 'Документы готовы для скачивания.';
      const documents = parsed.documents || [];

      // Save assistant message (without document content to keep it clean)
      await supabase.from('chat_messages').insert({
        generation_id: generationId as string,
        user_id: user.id,
        role: 'assistant',
        content: assistantMessage,
      } as any);

      return NextResponse.json({
        message: assistantMessage,
        documents: documents,
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

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const assistantMessage = completion.choices[0]?.message?.content || 'Извините, произошла ошибка.';

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
