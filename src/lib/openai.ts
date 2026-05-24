import OpenAI from 'openai';
import type { CourtCase, DefendantHistory, CourtStats } from './court-search';

// AI Provider type
export type AIProvider = 'openai' | 'gemini';

// Get current AI provider from env
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === 'openai') return 'openai';
  if (provider === 'gemini') return 'gemini';
  
  // Auto-detect: prefer Gemini (main for claim analysis) if configured, else OpenAI
  if (process.env.CLOUDFLARE_WORKER_URL) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';
  
  // Default: Gemini — основная нейросеть для анализа исков
  return 'gemini';
}

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

// Helper function to call OpenAI directly
async function callOpenAI(
  prompt: string,
  systemPrompt?: string,
  maxTokens: number = 3000,
  jsonMode: boolean = false,
  model?: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const client = getOpenAI();

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const response = await client.chat.completions.create({
      model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
      ...(jsonMode && { response_format: { type: 'json_object' } }),
    });
    
    const result = response.choices[0]?.message?.content || '';
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[callOpenAI] Response (first 500 chars):', result.slice(0, 500));
    }
    
    return result;
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
}

// Universal function to call AI (Gemini — основная для анализа исков, или OpenAI)
export interface CallAIOptions {
  /** Принудительно использовать конкретного провайдера, минуя getAIProvider(). */
  forceProvider?: AIProvider;
  /** Конкретная модель: для gemini — slug Replicate (`google/gemini-2.5-pro`),
   *  для openai — id из API (`gpt-4o`). Перебивает env-переменные. */
  model?: string;
}

export async function callAI(
  prompt: string,
  systemPrompt?: string,
  maxTokens: number = 3000,
  jsonMode: boolean = false,
  options: CallAIOptions = {},
): Promise<string> {
  const provider = options.forceProvider ?? getAIProvider();

  console.log(`[callAI] Using provider: ${provider}${options.model ? ` model=${options.model}` : ''}`);

  if (provider === 'openai') {
    return callOpenAI(prompt, systemPrompt, maxTokens, jsonMode, options.model);
  } else {
    return callGemini(prompt, systemPrompt, maxTokens, options.model);
  }
}

// Helper function for OpenAI chat completions
async function openaiChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: { maxTokens?: number; temperature?: number; jsonMode?: boolean } = {}
): Promise<string> {
  const { maxTokens = 4000, temperature = 0.7, jsonMode = false } = options;
  
  const client = getOpenAI();
  
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(jsonMode && { response_format: { type: 'json_object' } }),
    });
    
    const result = response.choices[0]?.message?.content || '';
    console.log('OpenAI response (first 500 chars):', result.slice(0, 500));
    return result;
  } catch (error) {
    console.error('OpenAI chat completion error:', error);
    throw error;
  }
}

// Helper function to call Gemini via Cloudflare Worker proxy
// Worker proxies requests to Replicate API from a non-blocked region
async function callGemini(
  prompt: string,
  systemPrompt?: string,
  maxTokens: number = 3000,
  model?: string,
): Promise<string> {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL?.trim();
  const workerSecret = process.env.CLOUDFLARE_WORKER_SECRET?.trim();
  
  // Детальное логирование для отладки
  if (process.env.NODE_ENV === 'development') {
    const allCloudflareKeys = Object.keys(process.env).filter(k => k.includes('CLOUDFLARE'));
    console.log('[callGemini] Environment check:', {
      hasWorkerUrl: !!workerUrl,
      hasWorkerSecret: !!workerSecret,
      workerUrlLength: workerUrl?.length || 0,
      workerSecretLength: workerSecret?.length || 0,
      workerUrlValue: workerUrl || 'undefined',
      workerSecretPreview: workerSecret ? `${workerSecret.substring(0, 3)}***` : 'undefined',
      nodeEnv: process.env.NODE_ENV,
      isServer: typeof window === 'undefined',
      allCloudflareEnvKeys: allCloudflareKeys,
      cloudflareValues: allCloudflareKeys.reduce((acc, key) => {
        acc[key] = process.env[key] ? 'present' : 'missing';
        return acc;
      }, {} as Record<string, string>),
    });
  }
  
  // Мягкая проверка - не выбрасываем ошибку сразу, даем возможность работать
  if (!workerUrl || workerUrl.length === 0 || !workerSecret || workerSecret.length === 0) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const envHint = isDevelopment
      ? 'Перезапустите dev-сервер после добавления переменных в .env.local (npm run dev)'
      : 'На VPS установите переменные через процесс-менеджер (pm2) или .env.production';
    const errorMsg = `CLOUDFLARE_WORKER_URL and CLOUDFLARE_WORKER_SECRET must be set. ${envHint}`;
    console.error('[callGemini] Configuration error:', {
      workerUrl: workerUrl ? 'present but empty' : 'not set',
      workerSecret: workerSecret ? 'present but empty' : 'not set',
      isDevelopment,
      nodeEnv: process.env.NODE_ENV,
      allEnvKeys: Object.keys(process.env).filter(k => k.includes('CLOUDFLARE')),
    });
    
    // В development режиме выбрасываем ошибку, чтобы пользователь увидел проблему
    throw new Error(errorMsg);
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
        model: model || process.env.GEMINI_MODEL || 'google/gemini-2.5-flash',
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

// Helper function for Gemini chat completions (converts messages to prompt)
async function geminiChatCompletionInternal(
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

// Universal chat completion function (chooses provider automatically)
export async function chatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: { maxTokens?: number; temperature?: number; jsonMode?: boolean } = {}
): Promise<string> {
  const provider = getAIProvider();
  
  console.log(`[chatCompletion] Using provider: ${provider}`);
  
  if (provider === 'openai') {
    return openaiChatCompletion(messages, options);
  } else {
    return geminiChatCompletionInternal(messages, options);
  }
}

// Legacy export for backward compatibility
export async function geminiChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: { maxTokens?: number; temperature?: number; jsonMode?: boolean } = {}
): Promise<string> {
  // Use universal function instead
  return chatCompletion(messages, options);
}

/**
 * Результат быстрого первичного анализа пользовательских документов.
 * Используется только когда есть прикреплённые файлы — даёт пользователю
 * понимание, что именно прислал AI, и список конкретных следующих действий.
 */
export interface DocumentTriageAction {
  id: string;
  label: string;
  description: string;
  needsCases: boolean;
  needsLaw: boolean;
  actionPrompt: string;
}

export interface DocumentTriageResult {
  caseTitle: string;
  summary: string;
  documentBreakdown: Array<{
    fileName: string;
    type: string;
    summary: string;
  }>;
  documentType: string;
  suggestedActions: DocumentTriageAction[];
  missingInfo: string[];
  userQuestions: string[];
  /** Маркер для UI: чтобы отличить triage от полного анализа. */
  _mode: 'document-triage';
}

/**
 * Быстрый первичный анализ прикреплённых документов. Не делает поиск
 * судебной практики и не генерирует итоговый ответ — это задача второго
 * шага (после того как пользователь выберет действие).
 */
export async function analyzeDocuments(
  userQuery: string,
  attachmentsText: string,
  options: CallAIOptions = {},
): Promise<DocumentTriageResult> {
  const { DOCUMENT_TRIAGE_PROMPT } = await import('./prompts');

  const prompt = `Запрос пользователя: ${userQuery || '(пользователь не написал текст, только прислал документы)'}

${attachmentsText}

Проведи первичный анализ. Верни JSON по схеме из системного промпта.`;

  // Полное логирование — мы видели случаи, когда AI выдумывал контент,
  // несуществующий в документе. Чтобы быстро ловить, какая часть пайплайна
  // даёт галлюцинацию (OCR? prompt? сам AI?), пишем длины каждого блока
  // и первые/последние символы — это поможет на проде по логам разобрать
  // конкретный кейс без переотправки документов.
  const docDelimiters = attachmentsText.match(/--- НАЧАЛО ДОКУМЕНТА ---/g) || [];
  const ocrFailureMarkers = (attachmentsText.match(/\[OCR-system:/g) || []).length;
  console.log('[analyzeDocuments] sending to AI:', {
    userQueryLen: userQuery.length,
    attachmentsTextLen: attachmentsText.length,
    docsWithContent: docDelimiters.length,
    docsWithOcrFailure: ocrFailureMarkers,
    promptHeadPreview: prompt.slice(0, 300),
    promptTailPreview: prompt.slice(-300),
  });

  let raw = '';
  try {
    // 3500 токенов — достаточно для подробного breakdown 3-х документов
    // с suggestedActions и missingInfo. Раньше было 1800, при котором AI
    // обрезал ответ и иногда заполнял пропуски галлюцинациями.
    raw = await callAI(prompt, DOCUMENT_TRIAGE_PROMPT, 3500, true, options);
  } catch (err) {
    console.error('[analyzeDocuments] AI call failed:', err);
    throw err;
  }

  console.log('[analyzeDocuments] AI raw response:', {
    rawLen: raw.length,
    rawPreview: raw.slice(0, 600),
  });

  // AI иногда оборачивает JSON в markdown — берём первый { … } блок.
  const match = raw.match(/\{[\s\S]*\}/);
  const jsonString = match ? match[0] : raw;

  let parsed: Partial<DocumentTriageResult>;
  try {
    parsed = JSON.parse(jsonString) as Partial<DocumentTriageResult>;
  } catch (err) {
    console.error('[analyzeDocuments] JSON parse failed:', err, 'raw:', raw.slice(0, 500));
    throw new Error('AI вернул некорректный ответ при анализе документов');
  }

  // Жёстко санитизируем результат — UI не должен падать, если AI пропустил поле.
  return {
    caseTitle:
      typeof parsed.caseTitle === 'string' && parsed.caseTitle.trim()
        ? parsed.caseTitle.trim()
        : 'Анализ документов',
    summary:
      typeof parsed.summary === 'string'
        ? parsed.summary.trim()
        : '',
    documentBreakdown: Array.isArray(parsed.documentBreakdown)
      ? parsed.documentBreakdown
          .filter((d): d is DocumentTriageResult['documentBreakdown'][number] =>
            !!d && typeof d === 'object',
          )
          .map((d) => ({
            fileName: typeof d.fileName === 'string' ? d.fileName : '',
            type: typeof d.type === 'string' ? d.type : 'Документ',
            summary: typeof d.summary === 'string' ? d.summary : '',
          }))
      : [],
    documentType:
      typeof parsed.documentType === 'string' ? parsed.documentType : 'unknown',
    suggestedActions: Array.isArray(parsed.suggestedActions)
      ? parsed.suggestedActions
          .filter((a): a is DocumentTriageAction => !!a && typeof a === 'object')
          .map((a, i) => ({
            id:
              typeof a.id === 'string' && a.id.trim()
                ? a.id
                : `action_${i + 1}`,
            label: typeof a.label === 'string' ? a.label : 'Действие',
            description: typeof a.description === 'string' ? a.description : '',
            needsCases: a.needsCases !== false,
            needsLaw: a.needsLaw !== false,
            actionPrompt:
              typeof a.actionPrompt === 'string' ? a.actionPrompt : '',
          }))
          .slice(0, 6)
      : [],
    missingInfo: Array.isArray(parsed.missingInfo)
      ? parsed.missingInfo.filter((m): m is string => typeof m === 'string').slice(0, 5)
      : [],
    userQuestions: Array.isArray(parsed.userQuestions)
      ? parsed.userQuestions.filter((m): m is string => typeof m === 'string').slice(0, 3)
      : [],
    _mode: 'document-triage',
  };
}

export async function generateSearchQuery(userQuery: string): Promise<string> {
  const { SEARCH_QUERY_PROMPT } = await import('./prompts');
  
  try {
    const result = await callAI(userQuery, SEARCH_QUERY_PROMPT, 50, false);
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
      casesWithResult: number;
      percentage: number;
    };
    courtInfo?: CourtStats | null;
    defendantHistory?: DefendantHistory | null;
    searchTerms: string;
    category: string;
  },
  options: CallAIOptions = {},
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
ИСТОЧНИК: ${stats.casesWithResult} из ${stats.total} дел с известным результатом
${courtInfo ? `СУД: ${courtInfo.name}` : ''}

НАЙДЕННЫЕ ДЕЛА:
${courtCasesFormatted.map(c => `- ${c.title} [${c.result}]`).join('\n')}

ВАЖНО:
- probability.percentage = ${stats.percentage} (это реальные данные из анализа ${stats.casesWithResult} из ${stats.total} дел)
- Если percentage = 0, значит не удалось определить исходы дел
- Ответ строго в формате JSON`;

  try {
    const result = await callAI(context, SYSTEM_PROMPT, 2500, true, options);

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
      casesWithResult: 0,
      percentage: 65,
    },
    courtInfo: null,
    defendantHistory: null,
    searchTerms: userQuery,
    category: 'general',
  };
  
  return generateLegalResponse(userQuery, searchResults);
}
