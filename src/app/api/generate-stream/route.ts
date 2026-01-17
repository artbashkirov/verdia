import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateLegalResponse } from '@/lib/openai';
import { searchCourtCases } from '@/lib/court-search';
import type { UserProfile, PersonType } from '@/types/database';

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

export async function POST(request: NextRequest) {
  // Parse JSON before creating stream (request body can only be read once)
  let query: string;
  let defendantName: string | undefined;
  let defendantLocation: string | undefined;
  try {
    const body = await request.json();
    query = body.query;
    defendantName = body.defendantName;
    defendantLocation = body.defendantLocation;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  if (!query) {
    return new Response(JSON.stringify({ error: 'Query required' }), { status: 400 });
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

        const parties = extractParties(query);
        
        // Use provided defendant info or extracted from query
        const finalDefendantName = defendantName || parties.defendantName;
        const finalDefendantLocation = defendantLocation || parties.defendantLocation || 'Москва';
        
        // Step 2: Search court cases
        const searchResults = await searchCourtCases(query, {
          maxResults: 5,
          defendantName: finalDefendantName,
          defendantLocation: finalDefendantLocation,
          plaintiffLocation: userProfile?.registration_city,
        });
        
        const { cases, stats, courtInfo, category } = searchResults;
        
        // Debug: log stats to verify they're correct
        console.log('Search results stats:', {
          total: stats.total,
          satisfied: stats.satisfied,
          partial: stats.partial,
          rejected: stats.rejected,
          casesWithResult: stats.casesWithResult,
          percentage: stats.percentage
        });
        
        // Step 3: Send court cases immediately
        sendEvent('courtCases', {
          cases: cases.slice(0, 5).map((c, i) => ({
            id: i + 1,
            title: c.title,
            url: c.url,
            court: c.court,
            isSearchLink: c.isSearchLink,
          })),
          stats: {
            total: cases.length,
            percentage: stats.percentage,
          },
          courtInfo: courtInfo?.name,
        });

        // Step 4: Update status - preparing response
        sendEvent('status', { stage: 'analyzing', message: 'Готовлю ответ (примерно 30 секунд)...' });

        // Build enhanced query with plaintiff context
        const plaintiffContext = formatPlaintiffContext(userProfile);
        
        const enhancedSearchResults = {
          ...searchResults,
          plaintiffContext,
        };

        // Step 5: Generate AI response
        const responseJson = await generateLegalResponse(
          query + plaintiffContext, 
          enhancedSearchResults
        );
        
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
        } catch {
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

        // Step 9.6: Send defendant analysis
        if (response.defendantAnalysis) {
          sendEvent('defendantAnalysis', response.defendantAnalysis);
        }

        // Step 10: Send recommendations
        if (response.recommendations) {
          sendEvent('recommendations', response.recommendations);
        }

        // Step 10.5: Send clarification request if defendant not specified
        if (!finalDefendantName) {
          const defendantPlaceholder = getDefendantPlaceholder(query);
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
            title: query.slice(0, 100),
            generation_id: generationId,
          });
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

