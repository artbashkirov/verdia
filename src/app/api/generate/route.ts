import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateLegalResponse } from '@/lib/openai';
import { searchCourtCases } from '@/lib/court-search';

// Extract defendant and plaintiff info from query
function extractParties(query: string): { defendantName?: string; plaintiffLocation?: string; defendantLocation?: string } {
  const result: { defendantName?: string; plaintiffLocation?: string; defendantLocation?: string } = {};
  
  // Try to extract defendant name (company or person)
  // Patterns: "против ООО/ИП/АО X", "ответчик X", "компания X"
  const defendantPatterns = [
    /(?:против|ответчик|к)\s+(?:ООО|ИП|АО|ПАО|ЗАО|ФГУП|МУП)\s*[«"]?([^»".,]+)[»"]?/i,
    /(?:против|ответчик|к)\s+(?:компани[яи]|организаци[яи]|банк[аеу]?)\s*[«"]?([^»".,]+)[»"]?/i,
    /(?:ООО|ИП|АО|ПАО|ЗАО)\s*[«"]?([^»".,]+)[»"]?/i,
  ];
  
  for (const pattern of defendantPatterns) {
    const match = query.match(pattern);
    if (match) {
      result.defendantName = match[0].trim();
      break;
    }
  }
  
  // Try to extract locations
  const locationPatterns = [
    /(?:зарегистрирован|находится|адрес[еу]?|г\.|город)\s*([А-Яа-яЁё\s]+?)(?:[,.]|$)/i,
    /(?:москв|питер|санкт-петербург|екатеринбург|новосибирск)/i,
  ];
  
  for (const pattern of locationPatterns) {
    const match = query.match(pattern);
    if (match) {
      const location = match[1] || match[0];
      if (!result.defendantLocation) {
        result.defendantLocation = location.trim();
      }
      break;
    }
  }
  
  // Default to Moscow if no location specified
  if (!result.defendantLocation) {
    result.defendantLocation = 'Москва';
  }
  
  return result;
}

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

    // Check API key
    if (!process.env.OPENAI_API_KEY && !process.env.REPLICATE_API_TOKEN) {
      console.error('API keys not configured');
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

    // Extract parties information from query
    const parties = extractParties(query);
    console.log('Extracted parties:', parties);

    // Step 1: Comprehensive court search (5-10 cases from sudact.ru and mos-gorsud.ru)
    console.log('Starting comprehensive court search for:', query);
    
    const searchResults = await searchCourtCases(query, {
      maxResults: 10,
      defendantName: parties.defendantName,
      plaintiffLocation: parties.plaintiffLocation,
      defendantLocation: parties.defendantLocation,
    });
    
    const { cases, stats, courtInfo, defendantHistory, searchTerms, category } = searchResults;
    
    console.log(`Search complete: ${cases.length} cases found`);
    console.log(`Stats: ${stats.percentage}% satisfaction rate (${stats.satisfied} satisfied, ${stats.partial} partial, ${stats.rejected} rejected)`);
    if (courtInfo) {
      console.log(`Court: ${courtInfo.name}`);
    }
    if (defendantHistory) {
      console.log(`Defendant history: ${defendantHistory.totalCases} total cases`);
    }

    // Step 2: Generate legal response with AI using all collected data
    console.log('Generating comprehensive legal response...');
    const responseJson = await generateLegalResponse(query, searchResults);
    
    // Parse JSON response
    let response;
    try {
      response = JSON.parse(responseJson);
      
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
      }
      
      // Ensure nextSteps is present
      if (!response.nextSteps) {
        response.nextSteps = {
          documentOffer: {
            text: 'Хотите, чтобы я составил для вас необходимые документы (исковое заявление, претензию или ходатайство)?',
            documentTypes: ['исковое заявление', 'претензия'],
            estimatedCost: 'от 500 ₽',
          },
          representativeOffer: {
            text: 'Также могу помочь найти представителя для участия в судебном заседании.',
            note: 'Услуга доступна после оплаты подготовки документов',
          },
        };
      }
      
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return NextResponse.json(
        { error: 'Ошибка обработки ответа AI' },
        { status: 500 }
      );
    }

    // Step 3: Save generation to database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: generation, error: dbError } = await (supabase.from('generations') as any)
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
        searchStats: {
          casesFound: cases.length,
          satisfactionRate: stats.percentage,
          courtInfo: courtInfo?.name,
        },
      });
    }

    // Step 4: Create chat history entry
    if (generation) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: historyError } = await (supabase.from('chat_history') as any)
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
      searchStats: {
        casesFound: cases.length,
        satisfactionRate: stats.percentage,
        courtInfo: courtInfo?.name,
        category,
      },
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
