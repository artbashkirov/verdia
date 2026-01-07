import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchDefendantHistory, searchCourtCases, getCourtStats } from '@/lib/court-search';
import type { UserProfile } from '@/types/database';

// API for refined search with defendant information
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

    const { generationId, defendantName, defendantLocation, defendantInn } = await request.json();
    
    if (!generationId || !defendantName) {
      return NextResponse.json(
        { error: 'Не указан ID или наименование ответчика' },
        { status: 400 }
      );
    }

    // Get original generation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: generation, error: genError } = await (supabase.from('generations') as any)
      .select('query, response')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single();

    if (genError || !generation) {
      return NextResponse.json(
        { error: 'Запрос не найден' },
        { status: 404 }
      );
    }

    // Get user profile for plaintiff location
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const userProfile = profileData as UserProfile | null;

    // Search defendant history
    const defendantHistory = await searchDefendantHistory(defendantName);
    
    // Get court info based on defendant location
    const courtInfo = await getCourtStats(defendantLocation || 'Москва');
    
    // Search additional cases with defendant
    const additionalCases = await searchCourtCases(defendantName, {
      maxResults: 5,
      defendantName,
      defendantLocation: defendantLocation || 'Москва',
    });

    // Build refined analysis
    const refinedAnalysis = {
      defendantName,
      defendantLocation: defendantLocation || 'Москва',
      defendantHistory: defendantHistory ? {
        name: defendantHistory.name,
        totalCases: defendantHistory.totalCases,
        asDefendant: defendantHistory.asDefendant,
        casesLost: defendantHistory.casesLost,
        casesWon: defendantHistory.casesWon,
        commonCategories: defendantHistory.commonCategories,
      } : null,
      predictedCourt: courtInfo ? {
        name: courtInfo.name,
        address: courtInfo.address,
        satisfactionRate: courtInfo.satisfactionRate,
        judges: courtInfo.judges,
      } : null,
      additionalCases: additionalCases.cases.slice(0, 5).map((c, i) => ({
        id: i + 1,
        title: c.title,
        url: c.url,
        court: c.court,
        result: c.result,
        date: c.date,
      })),
      updatedProbability: calculateUpdatedProbability(
        generation.response?.probability?.percentage || 65,
        defendantHistory,
        courtInfo
      ),
      recommendations: generateDefendantRecommendations(defendantHistory, courtInfo),
    };

    // Save defendant to saved_defendants for future use
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('saved_defendants') as any).upsert({
      user_id: user.id,
      name: defendantName,
      defendant_type: detectDefendantType(defendantName),
      inn: defendantInn,
      registration_city: defendantLocation,
      court_cases_count: defendantHistory?.totalCases || 0,
      cases_lost_count: defendantHistory?.casesLost || 0,
      last_search_at: new Date().toISOString(),
      search_results: {
        cases: refinedAnalysis.additionalCases,
        total_cases: defendantHistory?.totalCases || 0,
        satisfaction_rate: additionalCases.stats.percentage,
        last_updated: new Date().toISOString(),
      },
    }, { onConflict: 'user_id,name', ignoreDuplicates: false });

    // Update the generation with defendant info
    const updatedResponse = {
      ...generation.response,
      defendantAnalysis: refinedAnalysis,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('generations') as any)
      .update({ response: updatedResponse })
      .eq('id', generationId);

    return NextResponse.json(refinedAnalysis);

  } catch (error) {
    console.error('Refine search error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при уточнении поиска' },
      { status: 500 }
    );
  }
}

// Detect defendant type from name
function detectDefendantType(name: string): 'individual' | 'entrepreneur' | 'legal_entity' {
  if (/ООО|ПАО|АО|ЗАО|НКО|ГУП|МУП/i.test(name)) return 'legal_entity';
  if (/ИП/i.test(name)) return 'entrepreneur';
  return 'individual';
}

// Calculate updated probability based on defendant history
function calculateUpdatedProbability(
  baseProbability: number,
  defendantHistory: { casesLost: number; totalCases: number } | null,
  courtInfo: { satisfactionRate?: number } | null
): { percentage: number; level: string; adjustment: string } {
  let adjusted = baseProbability;
  let adjustment = '';

  // Adjust based on defendant's loss rate
  if (defendantHistory && defendantHistory.totalCases > 0) {
    const lossRate = defendantHistory.casesLost / defendantHistory.totalCases;
    if (lossRate > 0.7) {
      adjusted += 10;
      adjustment = 'Ответчик часто проигрывает дела (+10%)';
    } else if (lossRate < 0.3) {
      adjusted -= 10;
      adjustment = 'Ответчик редко проигрывает дела (-10%)';
    }
  }

  // Adjust based on court satisfaction rate
  if (courtInfo?.satisfactionRate) {
    if (courtInfo.satisfactionRate > 0.7) {
      adjusted += 5;
      adjustment += adjustment ? ', благоприятный суд (+5%)' : 'Благоприятный суд (+5%)';
    } else if (courtInfo.satisfactionRate < 0.5) {
      adjusted -= 5;
      adjustment += adjustment ? ', строгий суд (-5%)' : 'Строгий суд (-5%)';
    }
  }

  // Clamp to valid range
  adjusted = Math.max(10, Math.min(95, adjusted));

  // Determine level
  let level = 'средняя';
  if (adjusted >= 71) level = 'высокая';
  else if (adjusted >= 51) level = 'выше средней';
  else if (adjusted < 31) level = 'низкая';

  return {
    percentage: Math.round(adjusted),
    level,
    adjustment: adjustment || 'Без изменений',
  };
}

// Generate recommendations based on defendant history
function generateDefendantRecommendations(
  defendantHistory: { casesLost: number; totalCases: number; commonCategories?: string[] } | null,
  courtInfo: { name: string; judges?: Array<{ name: string; satisfactionRate?: number }> } | null
): string[] {
  const recommendations: string[] = [];

  if (defendantHistory) {
    if (defendantHistory.casesLost > 0) {
      recommendations.push(
        `Ответчик уже проигрывал ${defendantHistory.casesLost} из ${defendantHistory.totalCases} дел - используйте эти решения как прецеденты`
      );
    }
    if (defendantHistory.totalCases === 0) {
      recommendations.push(
        'Ответчик ранее не участвовал в судебных делах - это может быть как плюсом, так и минусом'
      );
    }
  }

  if (courtInfo) {
    recommendations.push(
      `Дело будет рассматриваться в ${courtInfo.name}`
    );
    if (courtInfo.judges && courtInfo.judges.length > 0) {
      const bestJudge = courtInfo.judges.reduce((a, b) => 
        (a.satisfactionRate || 0) > (b.satisfactionRate || 0) ? a : b
      );
      if (bestJudge.satisfactionRate && bestJudge.satisfactionRate > 0.6) {
        recommendations.push(
          `Если возможно, стремитесь к судье ${bestJudge.name} (${Math.round(bestJudge.satisfactionRate * 100)}% удовлетворённых исков)`
        );
      }
    }
  }

  return recommendations;
}

// GET endpoint to fetch saved defendants
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: defendants, error } = await (supabase.from('saved_defendants') as any)
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching defendants:', error);
      return NextResponse.json(
        { error: 'Ошибка загрузки ответчиков' },
        { status: 500 }
      );
    }

    return NextResponse.json({ defendants: defendants || [] });

  } catch (error) {
    console.error('Get defendants error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка' },
      { status: 500 }
    );
  }
}

