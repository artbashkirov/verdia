import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateLegalResponse } from '@/lib/openai';
import { searchCourtCases, searchDefendantHistory } from '@/lib/court-search';
import type { UserProfile, PersonType } from '@/types/database';

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
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Check authentication
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          sendEvent('error', { message: 'Необходима авторизация' });
          controller.close();
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
        
        // Step 2.5: If defendant name provided, search defendant history
        let defendantHistory = null;
        if (finalDefendantName) {
          sendEvent('status', { stage: 'searching_defendant', message: `Ищу судебные дела с участием ${finalDefendantName}...` });
          defendantHistory = await searchDefendantHistory(finalDefendantName);
        }

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
          defendantHistory: defendantHistory ? {
            name: defendantHistory.name,
            totalCases: defendantHistory.totalCases,
            casesLost: defendantHistory.casesLost,
          } : null,
        });

        // Build enhanced query with plaintiff and defendant context
        const plaintiffContext = formatPlaintiffContext(userProfile);
        const defendantContext = defendantHistory 
          ? `\n\nИНФОРМАЦИЯ ОБ ОТВЕТЧИКЕ:
Наименование: ${defendantHistory.name}
Всего дел с участием: ${defendantHistory.totalCases}
Проигранных дел (как ответчик): ${defendantHistory.casesLost}
${defendantHistory.commonCategories?.length ? `Частые категории дел: ${defendantHistory.commonCategories.join(', ')}` : ''}`
          : '';
        
        const enhancedSearchResults = {
          ...searchResults,
          plaintiffContext,
          defendantContext,
          defendantHistory,
        };

        // Step 5: Generate AI response
        const responseJson = await generateLegalResponse(
          query + plaintiffContext + defendantContext, 
          enhancedSearchResults
        );
        
        let response;
        try {
          response = JSON.parse(responseJson);
          
          // Check if AI needs clarification
          if (response.clarificationNeeded) {
            sendEvent('clarification', {
              question: response.clarificationQuestion,
              options: response.options || [],
            });
            controller.close();
            return;
          }
          
          // Ensure probability
          if (response.probability && typeof response.probability.percentage !== 'number') {
            response.probability.percentage = stats.percentage;
          }
        } catch {
          sendEvent('error', { message: 'Ошибка обработки ответа' });
          controller.close();
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
          sendEvent('clarificationRequest', {
            type: 'defendant',
            message: 'Для более точного анализа укажите данные ответчика',
            fields: [
              { key: 'defendantName', label: 'Наименование ответчика', placeholder: 'ООО "Ромашка" или ФИО' },
              { key: 'defendantLocation', label: 'Город регистрации', placeholder: 'Москва' },
            ],
            hint: 'Если вы укажете ответчика, я найду все судебные дела с его участием и скорректирую прогноз успеха',
          });
        }

        // Step 11: Save to database
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: generation } = await (supabase.from('generations') as any)
          .insert({
            user_id: user.id,
            query: query,
            response: response,
          })
          .select()
          .single();

        if (generation) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('chat_history') as any).insert({
            user_id: user.id,
            title: query.slice(0, 100),
            generation_id: generation.id,
          });
        }

        // Step 12: Send complete event with ID
        sendEvent('complete', {
          id: generation?.id,
          query,
        });

      } catch (error) {
        console.error('Stream error:', error);
        sendEvent('error', { 
          message: error instanceof Error ? error.message : 'Произошла ошибка' 
        });
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

