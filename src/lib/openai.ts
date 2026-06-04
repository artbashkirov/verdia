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
  /** Конкретная модель: для gemini — slug Replicate (`google/gemini-3.1-pro`),
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
        model: model || process.env.GEMINI_MODEL || 'google/gemini-3-flash',
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
  /**
   * Метка качества ответа. Когда AI выдумал данные, которых не было
   * в исходных документах, мы помечаем результат как hallucination_detected
   * и UI показывает honest fallback вместо лжи.
   */
  _quality?: 'ok' | 'low_ocr' | 'hallucination_detected';
}

/**
 * Извлекает «факты» из исходного текста документов: имена собственные
 * (русские/английские слова с заглавной буквы длиной ≥6 ИЛИ полностью
 * в КАПСЕ длиной ≥4) и числа (включая суммы вида «2 000 000»).
 * Используется анти-галлюцинационным детектором, чтобы проверить, что
 * caseTitle/summary AI основаны на реальном тексте документов.
 *
 * Минимальная длина 6 для смешанного регистра — отсекаем общие слова
 * типа «Анализ», «Первый», «Второй», которые часто стоят в начале
 * предложений и не являются именами собственными.
 */
function extractFactsFromText(text: string): {
  properNouns: Set<string>;
  numbers: Set<string>;
} {
  const properNouns = new Set<string>();
  const numbers = new Set<string>();

  if (!text) return { properNouns, numbers };

  // Очищаем плейсхолдеры — они не содержат фактов документа.
  const cleaned = text
    .replace(/\[OCR-system:[\s\S]*?\]/g, ' ')
    .replace(/--- (?:НАЧАЛО|КОНЕЦ) ДОКУМЕНТА ---/g, ' ')
    .replace(/\[Прикреплён документ:[^\]]*\]/g, ' ');

  // (1) Русские имена/названия в смешанном регистре (минимум 6 букв,
  //     чтобы отсечь «Анализ», «Первый», «Документ» и т.п.).
  const properNounMixed = /[А-ЯЁ][а-яё]{5,}/g;
  let m: RegExpExecArray | null;
  while ((m = properNounMixed.exec(cleaned)) !== null) {
    properNouns.add(m[0].toLowerCase());
  }

  // (2) Полностью КАПС-слова, минимум 4 буквы (АЙТМАГАМБЕТОВ, ГАЗПРОМ,
  //     ИФНС, ОГРН). В OCR-выводах часто встречаются. Без этой ветки
  //     детектор не видел имена из шапок документов и давал false
  //     positive на summary AI («айтмагамбетова» помечен как hallucination,
  //     хотя в OCR явно «АЙТМАГАМБЕТОВ»).
  const properNounCaps = /[А-ЯЁ]{4,}/g;
  while ((m = properNounCaps.exec(cleaned)) !== null) {
    properNouns.add(m[0].toLowerCase());
  }

  // (3) Английские слова в смешанном регистре (Instagram, Apple, …).
  const englishMixed = /[A-Z][a-z]{5,}/g;
  while ((m = englishMixed.exec(cleaned)) !== null) {
    properNouns.add(m[0].toLowerCase());
  }

  // (4) Английские КАПС-слова длиной ≥4 (HTTP, JSON, GAZPROM, NASA).
  const englishCaps = /[A-Z]{4,}/g;
  while ((m = englishCaps.exec(cleaned)) !== null) {
    properNouns.add(m[0].toLowerCase());
  }

  // Числа: «2 000 000», «350000», «244 760,49», «1/3», «212-ФЗ».
  // Берём только серьёзные числа (≥3 знака), чтобы не ловить «25 числа».
  const numberRe = /\d[\d\s,.\-/]*\d/g;
  while ((m = numberRe.exec(cleaned)) !== null) {
    const normalized = m[0].replace(/\s+/g, '');
    if (normalized.replace(/\D/g, '').length >= 3) {
      numbers.add(normalized);
    }
  }

  return { properNouns, numbers };
}

/**
 * Whitelisted общие юридические/географические слова — их игнорируем
 * при проверке галлюцинаций, потому что они появляются у AI «по
 * умолчанию», даже если в документе их буквально нет.
 */
const COMMON_LEGAL_TERMS = new Set([
  // Целиком слова
  'москва', 'россия', 'россии', 'российской', 'российская', 'российский',
  'федерации', 'федерация', 'федеральный', 'федеральная',
  'кодекс', 'кодекса', 'кодексу', 'кодексом',
  'закон', 'закона', 'закону', 'законом', 'законе',
  'статья', 'статьи', 'статье', 'статью', 'статьёй', 'статьей',
  'пункт', 'пункта', 'пункту', 'пунктом',
  'часть', 'части', 'частью',
  'договор', 'договора', 'договору', 'договором', 'договоре',
  'договоры', 'договоров',
  'истец', 'истца', 'истцу', 'истцом',
  'ответчик', 'ответчика', 'ответчику', 'ответчиком',
  'документ', 'документа', 'документу', 'документом',
  'документы', 'документов', 'документам',
  'право', 'права', 'праву', 'правом', 'правовой', 'правовая',
  'правовое', 'правовые',
  'исковое', 'исковая', 'исковой', 'исковом', 'исковую',
  'юридический', 'юридическая', 'юридическое', 'юридические',
  'отказ', 'отказа', 'отказе',
  'удовлетворение', 'удовлетворено', 'удовлетворить',
  'физическое', 'физического', 'физическому',
  'анализ', 'анализа', 'анализе',
  'первый', 'первого', 'второй', 'второго', 'третий', 'третьего',
  'четвёртый', 'четвертый', 'пятый',
  // Общеупотребительные слова, часто появляющиеся в саммари AI как
  // «существительные с большой буквы в начале предложения». Без них
  // детектор галлюцинаций давал false-positive на нормальные саммари
  // (видели «имя «задолженность»» и т.п.).
  'задолженность', 'задолженности', 'задолженностью',
  'образовалась', 'образовался', 'образование',
  'индивидуального', 'индивидуальный', 'индивидуальная', 'индивидуальные',
  'предпринимателя', 'предприниматель', 'предпринимателей',
  'деятельности', 'деятельность', 'деятельностью',
  'качестве', 'качества', 'качество',
  'страховых', 'страховые', 'страховой', 'страховая', 'страхование',
  'взносам', 'взносы', 'взносов', 'взносами',
  'налоговая', 'налоговой', 'налоговую', 'налоговый', 'налоговая',
  'налогов', 'налогам', 'налоги', 'налоге',
  'инспекция', 'инспекции', 'инспекцию',
  'требование', 'требования', 'требованию', 'требованием',
  'судебный', 'судебная', 'судебное', 'судебные', 'судебного',
  'приказ', 'приказа', 'приказу', 'приказом',
  'возражение', 'возражения', 'возражений', 'возражениях',
  'заявление', 'заявления', 'заявлению', 'заявлением',
  'административный', 'административная', 'административное', 'административные',
  'административного', 'административному',
  'районный', 'районного', 'районному', 'районным',
  'мировым', 'мировой', 'мировому',
  'отменен', 'отменён', 'отменено', 'отменена',
  'периоды', 'период', 'периода', 'периоду', 'периодом',
  'связи', 'связь', 'связью',
  'общую', 'общая', 'общий', 'общего', 'общему', 'общее',
  'ранее', 'позднее',
  'материалы', 'материалов', 'материалах',
  // Префиксы 5 букв — добавлены автоматически детектором
  'москв', 'россий', 'россии', 'федер',
  'гпк', 'апк', 'упк', 'кгрф', 'нкрф',
  'нк', 'тк', 'гк', 'ук',
  'кодек', 'закон', 'зако',
  'стать', 'пункт', 'часть',
  'догов', 'истец', 'ответ', 'судеб',
  'докум', 'право', 'право',
  'иско', 'юрид', 'отказ', 'удовл',
  'физи', 'анали', 'перво', 'второ', 'треть',
  // Префиксы общеупотребительных
  'задол', 'образ', 'индив', 'предп', 'деяте', 'качес',
  'страх', 'взнос', 'налог', 'инспе', 'требо',
  'прика', 'возра', 'заявл', 'админ', 'район',
  'мирово', 'мировы', 'отмен', 'перио', 'мате',
  // Общеупотребительные слова, часто стоящие в начале предложений в
  // саммари AI с большой буквы. Без них детектор ловит false-positive
  // на нормальные ответы («имя «Остальные»», «имя «Полностью»» и т.п.).
  'остальные', 'остальной', 'остальная', 'остальное', 'остальных',
  'другие', 'другая', 'другой', 'другое', 'других', 'другими',
  'такие', 'такая', 'такой', 'такое', 'таких', 'такими',
  'наименование', 'наименования', 'наименовании', 'наименований',
  'обстоятельства', 'обстоятельство', 'обстоятельствами', 'обстоятельств',
  'основной', 'основная', 'основное', 'основные', 'основных', 'основным',
  'разные', 'разный', 'разная', 'разное', 'разных',
  'определенный', 'определенная', 'определенное', 'определенные',
  'определённый', 'определённая', 'определённое', 'определённые',
  'являются', 'является', 'являлся', 'являлась', 'явилось',
  'содержат', 'содержит', 'содержал', 'содержится', 'содержатся',
  'отсутствует', 'отсутствуют', 'отсутствовал', 'отсутствует',
  'неизвестно', 'неизвестна', 'неизвестен', 'неизвестны',
  'известно', 'известна', 'известен', 'известны',
  'распознать', 'распознан', 'распознано', 'распознаны',
  'распознанные', 'распознанный', 'распознанная',
  'нераспознанный', 'нераспознанная', 'нераспознанные', 'нераспознанных',
  'указаны', 'указана', 'указано', 'указан', 'указанные', 'указанная',
  'указанное', 'указанный', 'указанных', 'указанным', 'указании',
  'фрагмент', 'фрагменте', 'фрагмента', 'фрагменты', 'фрагментах',
  'частично', 'частичный', 'частичная', 'частичные',
  'полностью', 'полные', 'полная', 'полный', 'полное', 'полных',
  'согласно', 'согласный', 'согласное',
  'наличие', 'наличия', 'наличием',
  'отсутствие', 'отсутствия', 'отсутствием',
  'данные', 'данных', 'данным', 'данными', 'данное', 'данная', 'данный',
  'прочитан', 'прочитано', 'прочитаны', 'прочитанные',
  'возможно', 'возможна', 'возможен', 'возможны',
  'невозможно', 'невозможна', 'невозможен', 'невозможны',
  'необходимо', 'необходима', 'необходим', 'необходимы',
  'некоторые', 'некоторый', 'некоторая', 'некоторое', 'некоторых',
  'каждый', 'каждая', 'каждое', 'каждые', 'каждого',
  'однако', 'поэтому', 'следовательно', 'таким образом',
  'остается', 'остаётся', 'остаются', 'оставаться',
  'предъявлены', 'предъявлена', 'предъявлено', 'предъявлен',
  'предъявить', 'предъявления',
  'взыскать', 'взыскание', 'взыскания', 'взыскании', 'взыскивает',
  'предусмотрено', 'предусмотрены', 'предусмотрена', 'предусмотрен',
  'установлено', 'установлены', 'установлена', 'установлен',
  // Префиксы 5 букв
  'остал', 'други', 'такие', 'наиме', 'обсто', 'основ', 'разне',
  'опред', 'являю', 'содер', 'отсут', 'неизв', 'извес',
  'распо', 'указа', 'фраго', 'части', 'полно', 'согла', 'налич',
  'прочи', 'возмо', 'невоз', 'необх', 'некот', 'кажды',
  'однак', 'поэто', 'следо', 'остае', 'остаё', 'предъ',
  'взыск', 'предус', 'устан',
]);

/**
 * Проверяет triage-ответ AI на галлюцинации. Если в caseTitle или summary
 * упомянуты имена собственных или суммы, которых НЕТ ни в одном из
 * исходных документов — это галлюцинация, и мы возвращаем список
 * подозрительных строк. Пустой массив = всё ок.
 *
 * Сравнение имён — по префиксам (5 первых букв), чтобы быть
 * устойчивым к падежам: «Иванов» из документа и «Иванова» в ответе
 * AI имеют общий префикс «ивано» и не считаются галлюцинацией.
 * Числа сравниваются точно (после нормализации пробелов).
 */
function detectHallucinations(
  triage: { caseTitle: string; summary: string },
  sourceText: string,
): string[] {
  const facts = extractFactsFromText(sourceText);
  // Если в исходных документах вообще нет фактов (только плейсхолдеры) —
  // ЛЮБОЕ конкретное имя/число в ответе AI = галлюцинация.
  const sourceHasFacts = facts.properNouns.size > 0 || facts.numbers.size > 0;

  const aiCombined = `${triage.caseTitle}\n${triage.summary}`;
  const aiFacts = extractFactsFromText(aiCombined);

  // Эвристика для AI-текста: исключаем proper-nouns-кандидаты, которые
  // стоят в начале предложения и не выглядят как имя собственное
  // (типичные окончания фамилий: -ов/-ова/-ев/-ева/-ин/-ина/-ский/-ская/
  // -цов/-цова/-енко/-юк и т.п.). «Остальные», «Полностью», «Указанные»
  // и т.п. — обычные слова, AI просто начинает с них предложение.
  const sentenceStartWords = new Set<string>();
  const sentenceStartRe = /(?:^|[.!?]\s+)([А-ЯЁ][а-яё]{5,})/g;
  let sm: RegExpExecArray | null;
  while ((sm = sentenceStartRe.exec(aiCombined)) !== null) {
    sentenceStartWords.add(sm[1].toLowerCase());
  }
  const looksLikeSurname = (word: string): boolean => {
    return /(?:ов|ова|ев|ева|ин|ина|ын|ына|ский|ская|цов|цова|енко|юк|чук|швили|идзе|оглу|оглы)$/.test(
      word,
    );
  };

  // Префиксы 5 букв от каждого имени в исходнике — для устойчивости
  // к падежам и склонениям.
  const PREFIX_LEN = 5;
  const sourcePrefixes = new Set<string>();
  for (const name of facts.properNouns) {
    if (name.length >= PREFIX_LEN) {
      sourcePrefixes.add(name.slice(0, PREFIX_LEN));
    } else {
      // короткие имена (Москва, ГПК) добавляем целиком
      sourcePrefixes.add(name);
    }
  }

  const hallucinations: string[] = [];

  for (const name of aiFacts.properNouns) {
    const prefix = name.length >= PREFIX_LEN ? name.slice(0, PREFIX_LEN) : name;

    // Общие юридические термины — пропускаем.
    if (COMMON_LEGAL_TERMS.has(prefix) || COMMON_LEGAL_TERMS.has(name)) {
      continue;
    }

    // Слово стоит в начале предложения и не имеет типичных окончаний
    // фамилий/географических названий — это обычное слово с большой
    // буквы из-за позиции, не имя собственное. Пропускаем.
    if (sentenceStartWords.has(name) && !looksLikeSurname(name)) {
      continue;
    }

    // Префикс имени должен встречаться в исходных документах.
    if (!sourcePrefixes.has(prefix)) {
      hallucinations.push(`имя «${name}»`);
    }
  }

  // Готовим набор «голых цифр» исходных чисел — для быстрого матча
  // по содержанию (а не по форматированию пробелами/запятыми).
  const sourceDigitsOnly = new Set<string>();
  for (const sourceNum of facts.numbers) {
    sourceDigitsOnly.add(sourceNum.replace(/\D/g, ''));
  }

  // Помощник: число matches с источником целиком (по голым цифрам).
  const numberMatchesSource = (num: string): boolean => {
    if (facts.numbers.has(num)) return true;
    const digitsOnly = num.replace(/\D/g, '');
    return sourceDigitsOnly.has(digitsOnly);
  };

  for (const num of aiFacts.numbers) {
    // Слишком короткие числа (год, дата, № статьи) — игнорируем,
    // они часто общие. Проверяем только большие суммы (5+ знаков).
    const digitsOnly = num.replace(/\D/g, '');
    if (digitsOnly.length < 5) continue;

    if (numberMatchesSource(num)) continue;

    // Диапазон вида «2022-2024» или «01.01.2022-31.12.2024»: разбиваем
    // по дефису/слэшу и проверяем компоненты независимо. AI часто
    // схлопывает упомянутые в документе годы «2022, 2023, 2024» в
    // диапазон «2022-2024», и это НЕ галлюцинация.
    if (/[-/]/.test(num)) {
      const parts = num.split(/[-/]/).filter((p) => p.length > 0);
      if (parts.length >= 2) {
        const allPartsMatch = parts.every((part) => {
          const partDigits = part.replace(/\D/g, '');
          // Слишком короткие куски не валидируем строго (это могут быть
          // месяцы/дни в датах). Если кусок ≥ 3 цифр — должен присутствовать.
          if (partDigits.length < 3) return true;
          return sourceDigitsOnly.has(partDigits);
        });
        if (allPartsMatch) continue;
      }
    }

    hallucinations.push(`число «${num}»`);
  }

  if (!sourceHasFacts && (aiFacts.properNouns.size > 0 || aiFacts.numbers.size > 0)) {
    hallucinations.push('(в документах нет фактов, а в ответе AI они появились)');
  }

  return hallucinations;
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

  // Для triage предпочитаем Gemini 3.1 Pro вместо дефолтного flash:
  // на длинных промптах с несколькими документами flash выдумывает
  // имена/суммы (наблюдали в проде «Уведомление ООО Промтехсервис»
  // вместо реального налогового иска к Жеребцову). Pro точнее на
  // такой нагрузке. Один вызов на чат — стоимость не критична.
  //
  // НО: воркер у каждого деплоя свой, и не все воркеры знают
  // 'google/gemini-3.1-pro'. Если воркер вернул 404 / unsupported —
  // автоматически откатываемся на дефолтную модель воркера (без
  // model-override). Лучше получить ответ от flash, чем не получить
  // вообще ничего из-за 404. Anti-hallucination guard ниже всё равно
  // отсечёт выдумки flash.
  const PREFERRED_MODEL = options.model ?? 'google/gemini-3.1-pro';
  const triageOptions: CallAIOptions = {
    forceProvider: options.forceProvider ?? 'gemini',
    model: PREFERRED_MODEL,
  };

  const isModelUnsupportedError = (err: unknown): boolean => {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      msg.includes('404') ||
      msg.includes('not be found') ||
      msg.includes('not found') ||
      msg.includes('unsupported') ||
      msg.includes('unknown model')
    );
  };

  let raw = '';
  try {
    // 3500 токенов — достаточно для подробного breakdown 3-х документов
    // с suggestedActions и missingInfo. Раньше было 1800, при котором AI
    // обрезал ответ и иногда заполнял пропуски галлюцинациями.
    raw = await callAI(prompt, DOCUMENT_TRIAGE_PROMPT, 3500, true, triageOptions);
  } catch (err) {
    if (isModelUnsupportedError(err) && !options.model) {
      console.warn(
        '[analyzeDocuments] preferred model unsupported by worker, falling back to default:',
        { preferred: PREFERRED_MODEL, error: err instanceof Error ? err.message : String(err) },
      );
      try {
        raw = await callAI(prompt, DOCUMENT_TRIAGE_PROMPT, 3500, true, {
          forceProvider: triageOptions.forceProvider,
          // НЕ передаём model — воркер использует свою дефолтную.
        });
      } catch (fallbackErr) {
        console.error('[analyzeDocuments] fallback also failed:', fallbackErr);
        throw fallbackErr;
      }
    } else {
      console.error('[analyzeDocuments] AI call failed:', err);
      throw err;
    }
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

  const sanitized: DocumentTriageResult = {
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
    _quality: 'ok',
  };

  // === ANTI-HALLUCINATION GUARD ===
  // Сравниваем имена/суммы из caseTitle+summary с тем, что реально есть
  // в исходных документах. Если AI упомянул что-то, чего нет ни в одном —
  // это галлюцинация. Юридический сервис обязан быть честным: лучше
  // «не смог уверенно проанализировать», чем красивая выдуманная история.
  const hallucinations = detectHallucinations(
    { caseTitle: sanitized.caseTitle, summary: sanitized.summary },
    attachmentsText,
  );

  if (hallucinations.length > 0) {
    console.warn('[analyzeDocuments] HALLUCINATION DETECTED — replacing with safe fallback', {
      caseTitle: sanitized.caseTitle,
      summary: sanitized.summary,
      problems: hallucinations.slice(0, 15),
      // Помогает разобрать false positives на проде:
      sourceTextSample: attachmentsText.slice(0, 400),
      sourceTextLen: attachmentsText.length,
    });

    // Затираем заведомо выдуманные поля. Оставляем documentBreakdown
    // (там per-file разбор обычно правдивый) и suggestedActions.
    sanitized.caseTitle = 'Не удалось уверенно проанализировать документы';
    sanitized.summary =
      'AI попытался разобрать присланные документы, но его выводы содержат сведения, которых нет в исходном тексте. Это могло произойти из-за нечёткого фото, повёрнутой страницы или плохого освещения.\n\n' +
      'Чтобы избежать ошибок, я не буду делать выводы по этим документам. Пожалуйста, перешлите более чёткие копии (сверху, при хорошем свете, без бликов и наклона) или текстовые версии файлов.';
    sanitized.missingInfo = [
      'Документы не удалось надёжно распознать. Нужны более чёткие копии или текстовые версии файлов.',
    ];
    sanitized.userQuestions = [];
    sanitized.suggestedActions = [
      {
        id: 'retake_photos',
        label: 'Перезагрузить документы',
        description:
          'Сфотографируйте каждую страницу сверху, при хорошем освещении, без бликов и наклона — или пришлите PDF/DOCX',
        needsCases: false,
        needsLaw: false,
        actionPrompt:
          'Подскажи пользователю, как сделать качественное фото юридического документа для распознавания.',
      },
    ];
    sanitized._quality = 'hallucination_detected';
  }

  return sanitized;
}

/**
 * Безопасный fallback-результат, когда у нас ВСЕ файлы — нечитаемые фото
 * (OCR не справился). В этом случае мы вообще не вызываем AI — нечего
 * анализировать, любой ответ был бы выдумкой.
 */
export function buildLowOcrTriageResult(
  attachments: Array<{ fileName: string }>,
): DocumentTriageResult {
  return {
    caseTitle: 'Не удалось распознать текст на фотографиях',
    summary:
      `Я получил ${attachments.length} файл(ов), но OCR-система не смогла извлечь текст ни из одного из них. ` +
      'Обычно так бывает, когда фото нечёткое, под углом, с тенью или плохим освещением.\n\n' +
      'Пожалуйста, переснимите страницы сверху, при хорошем свете, без бликов и наклона — или пришлите PDF/DOCX вместо фотографий.',
    documentBreakdown: attachments.map((a) => ({
      fileName: a.fileName,
      type: 'Нечитаемое фото',
      summary: 'Текст на этом фото не распознан. Нужна более чёткая копия.',
    })),
    documentType: 'unknown',
    suggestedActions: [
      {
        id: 'retake_photos',
        label: 'Перезагрузить документы',
        description:
          'Сфотографируйте каждую страницу сверху, при хорошем освещении, без бликов и наклона — или пришлите PDF/DOCX',
        needsCases: false,
        needsLaw: false,
        actionPrompt:
          'Подскажи пользователю, как сделать качественное фото юридического документа для распознавания.',
      },
    ],
    missingInfo: attachments.map((a) => `Файл «${a.fileName}» нужно переснять — текст не распознан.`),
    userQuestions: [],
    _mode: 'document-triage',
    _quality: 'low_ocr',
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
