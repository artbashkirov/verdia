import OpenAI from 'openai';
import type { CourtCase, DefendantHistory, CourtStats } from './court-search';

// Lazy initialization for OpenAI client to avoid build-time errors
let openaiInstance: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    const buildApiKey = apiKey || 'sk-000000000000000000000000000000000000000000000000';
    openaiInstance = new OpenAI({
      apiKey: buildApiKey,
    });
  }
  return openaiInstance;
}

// Export OpenAI instance with lazy initialization using Proxy
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const instance = getOpenAI();
    const value = instance[prop as keyof OpenAI];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});

// Helper function to call Gemini via Cloudflare Worker proxy
// Worker proxies requests to Replicate API from a non-blocked region
async function callGemini(prompt: string, systemPrompt?: string, maxTokens: number = 3000): Promise<string> {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  const workerSecret = process.env.CLOUDFLARE_WORKER_SECRET;
  
  if (!workerUrl || !workerSecret) {
    throw new Error('CLOUDFLARE_WORKER_URL and CLOUDFLARE_WORKER_SECRET must be set');
  }

  try {
    const fullPrompt = systemPrompt 
      ? `${systemPrompt}\n\n---\n\nUser: ${prompt}`
      : prompt;
    
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': workerSecret,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        input: {
          prompt: fullPrompt,
          max_tokens: maxTokens,
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Worker proxy error: ${response.status} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    // Handle Replicate output format
    const output = data.output;
    if (Array.isArray(output)) {
      return output.join('');
    }
    return String(output || '');
  } catch (error) {
    console.error('Gemini API error (via Worker proxy):', error);
    throw error;
  }
}

// Helper function for chat completions (used by chat route)
export async function geminiChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: { maxTokens?: number; temperature?: number; jsonMode?: boolean } = {}
): Promise<string> {
  const { maxTokens = 4000, jsonMode = false } = options;
  
  // Convert messages to a single prompt for Gemini
  let prompt = '';
  let systemContent = '';
  
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemContent += msg.content + '\n\n';
    } else if (msg.role === 'user') {
      prompt += `User: ${msg.content}\n\n`;
    } else if (msg.role === 'assistant') {
      prompt += `Assistant: ${msg.content}\n\n`;
    }
  }
  
  if (jsonMode) {
    systemContent += '\n\nВАЖНО: Верни ответ СТРОГО в формате JSON. Начни ответ с { и закончи с }. Никакого текста до или после JSON.';
    prompt += 'Assistant (JSON): ';
  } else {
    prompt += 'Assistant: ';
  }
  
  const result = await callGemini(prompt, systemContent, maxTokens);
  console.log('Gemini response (first 500 chars):', result.slice(0, 500));
  return result;
}

export async function generateSearchQuery(userQuery: string): Promise<string> {
  const { SEARCH_QUERY_PROMPT } = await import('./prompts');
  
  try {
    const result = await callGemini(userQuery, SEARCH_QUERY_PROMPT, 50);
    return result.trim() || userQuery;
  } catch (error) {
    console.error('Search query generation error:', error);
    return userQuery;
  }
}

// Enhanced legal response generation with full court data
export async function generateLegalResponse(
  userQuery: string, 
  searchResults: {
    cases: CourtCase[];
    stats: {
      satisfied: number;
      partial: number;
      rejected: number;
      total: number;
      percentage: number;
    };
    courtInfo?: CourtStats | null;
    defendantHistory?: DefendantHistory | null;
    searchTerms: string;
    category: string;
  }
): Promise<string> {
  const { SYSTEM_PROMPT } = await import('./prompts');
  
  const { cases, stats, courtInfo, defendantHistory, searchTerms, category } = searchResults;
  
  // Format court cases - compact version for speed
  const courtCasesFormatted = cases.slice(0, 5).map((c, i) => ({
    id: i + 1,
    title: c.title.slice(0, 100),
    url: c.url,
    court: c.court || '',
    result: c.result || 'неизвестно',
    isSearchLink: c.isSearchLink ?? true,
  }));
  
  const hasRealCases = cases.some(c => !c.isSearchLink);
  
  // Build context for generation
  const context = `ЗАПРОС: "${userQuery}"
КАТЕГОРИЯ: ${category}
СТАТИСТИКА: ${stats.percentage}% успешных (${stats.satisfied} удовлетворено, ${stats.partial} частично, ${stats.rejected} отказано)
${courtInfo ? `СУД: ${courtInfo.name}` : ''}

НАЙДЕННЫЕ ДЕЛА:
${courtCasesFormatted.map(c => `- ${c.title} [${c.result}]`).join('\n')}

ВАЖНО:
- probability.percentage = ${stats.percentage} (это реальные данные из анализа дел)
- Если percentage = 0, значит не удалось определить исходы дел
- Ответ строго в формате JSON`;

  try {
    const result = await callGemini(context, SYSTEM_PROMPT, 2500);
    
    // Try to extract JSON from response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    return result || '{}';
  } catch (error) {
    console.error('Legal response generation error:', error);
    throw error;
  }
}

// Legacy function for backward compatibility
export async function generateLegalResponseSimple(
  userQuery: string, 
  courtCases: Array<{ 
    title: string; 
    url: string; 
    snippet: string; 
    court?: string;
    caseNumber?: string;
    isSearchLink?: boolean;
  }>
): Promise<string> {
  // Convert to new format
  const searchResults = {
    cases: courtCases.map(c => ({
      ...c,
      result: 'неизвестно' as const,
    })),
    stats: {
      satisfied: 0,
      partial: 0,
      rejected: 0,
      total: courtCases.length,
      percentage: 65,
    },
    courtInfo: null,
    defendantHistory: null,
    searchTerms: userQuery,
    category: 'general',
  };
  
  return generateLegalResponse(userQuery, searchResults);
}
