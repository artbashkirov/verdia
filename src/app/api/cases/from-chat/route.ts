import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
    }

    const body = await request.json();
    const { generationId, title, description } = body;

    if (!generationId) {
      return NextResponse.json({ error: 'Не указан ID чата' }, { status: 400 });
    }

    const { data: generation, error: genError } = await supabase
      .from('generations')
      .select('id, query, response')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single();

    if (genError || !generation) {
      return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
    }

    const gen = generation as { id: string; query: string; response: Record<string, unknown> | null };
    const caseTitle = title || gen.query?.slice(0, 100) || 'Новое дело из чата';
    const caseDescription = description || gen.query || '';

    const { data: newCase, error: caseError } = await supabase
      .from('cases')
      .insert({
        user_id: user.id,
        title: caseTitle,
        description: caseDescription,
        case_type: 'objection',
        status: 'draft',
        source_chat_id: gen.id,
        analysis: {},
        entities: {},
        missing_info: [],
        similar_cases: [],
        probability: {},
      })
      .select()
      .single();

    if (caseError || !newCase) {
      console.error('Error creating case from chat:', caseError);
      return NextResponse.json({ error: 'Ошибка создания дела' }, { status: 500 });
    }

    const caseRecord = newCase as { id: string };

    // Copy chat context as initial system message in the case
    const contextParts: string[] = [];
    if (gen.query) {
      contextParts.push(`Исходный вопрос: ${gen.query}`);
    }
    if (gen.response) {
      const resp = gen.response as Record<string, unknown>;
      const shortAnswer = resp.shortAnswer as { title?: string; content?: string } | undefined;
      if (shortAnswer) {
        if (shortAnswer.title) contextParts.push(`Ответ: ${shortAnswer.title}`);
        if (shortAnswer.content) contextParts.push(shortAnswer.content);
      }
      const recommendations = resp.recommendations as string[] | undefined;
      if (recommendations && recommendations.length > 0) {
        contextParts.push(`Рекомендации: ${recommendations.join('; ')}`);
      }
    }

    if (contextParts.length > 0) {
      await supabase.from('case_messages').insert({
        case_id: caseRecord.id,
        user_id: user.id,
        role: 'system',
        content: `Дело создано на основе консультации.\n\n${contextParts.join('\n\n')}`,
        message_type: 'analysis',
        attached_documents: [],
      });
    }

    // Copy chat messages if any
    const { data: chatMessages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('generation_id', generationId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(20);

    if (chatMessages && chatMessages.length > 0) {
      const messagesToInsert = (chatMessages as Array<{ role: string; content: string }>).map(
        (msg) => ({
          case_id: caseRecord.id,
          user_id: user.id,
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
          message_type: 'message' as const,
          attached_documents: [],
        })
      );

      await supabase.from('case_messages').insert(messagesToInsert);
    }

    return NextResponse.json({ case: newCase });
  } catch (error) {
    console.error('Error in from-chat:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
