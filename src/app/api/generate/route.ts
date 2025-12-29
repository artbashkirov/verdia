import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateLegalResponse } from '@/lib/openai';
import { searchCourtCases } from '@/lib/court-search';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Необходима авторизация' },
        { status: 401 }
      );
    }

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return NextResponse.json(
        { error: 'Конфигурация сервера не завершена. Обратитесь к администратору.' },
        { status: 500 }
      );
    }

    // Get query from request
    const { query } = await request.json();
    
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Запрос не может быть пустым' },
        { status: 400 }
      );
    }

    // Step 1: Search court cases (real cases from sudact.ru or fallback search links)
    console.log('Searching court cases for:', query);
    const courtCases = await searchCourtCases(query);
    const hasRealCases = courtCases.some(c => !c.isSearchLink);
    console.log(`Found ${courtCases.length} cases (real: ${hasRealCases})`);

    // Step 2: Generate legal response with AI
    console.log('Generating legal response...');
    const responseJson = await generateLegalResponse(query, courtCases);
    
    // Parse JSON response
    let response;
    try {
      response = JSON.parse(responseJson);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return NextResponse.json(
        { error: 'Ошибка обработки ответа AI' },
        { status: 500 }
      );
    }

    // Step 3: Save generation to database
    // First, try to insert - if fails due to user not existing, that's OK
    const { data: generation, error: dbError } = await supabase
      .from('generations')
      .insert({
        user_id: user.id,
        query: query,
        response: response,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error (non-fatal):', dbError.message);
      // Return response anyway - user can still see the result
      return NextResponse.json({
        id: null,
        query,
        response,
      });
    }

    // Step 4: Create chat history entry
    if (generation) {
      const { error: historyError } = await supabase
        .from('chat_history')
        .insert({
          user_id: user.id,
          title: query.slice(0, 100),
          generation_id: generation.id,
        });
      
      if (historyError) {
        console.error('Chat history error (non-fatal):', historyError.message);
      }
    }

    return NextResponse.json({
      id: generation?.id,
      query,
      response,
    });

  } catch (error) {
    console.error('Generation error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Произошла ошибка при генерации ответа';
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        errorMessage = 'Ошибка конфигурации API. Обратитесь к администратору.';
      } else if (error.message.includes('rate limit') || error.message.includes('429')) {
        errorMessage = 'Превышен лимит запросов. Попробуйте позже.';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorMessage = 'Ошибка сети. Проверьте подключение к интернету.';
      } else {
        errorMessage = error.message || errorMessage;
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
