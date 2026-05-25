import { CaseDocumentType } from '@/types/database';

export interface ParsedDocument {
  text: string;
  pageCount?: number;
  metadata?: Record<string, unknown>;
}

const SUPPORTED_MIME_TYPES: Record<string, CaseDocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'text/plain': 'text',
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function getDocumentType(mimeType: string): CaseDocumentType | null {
  return SUPPORTED_MIME_TYPES[mimeType] || null;
}

export function isSupportedMimeType(mimeType: string): boolean {
  return mimeType in SUPPORTED_MIME_TYPES;
}

export function validateFileSize(size: number): boolean {
  return size <= MAX_FILE_SIZE;
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParsedDocument> {
  const docType = getDocumentType(mimeType);

  if (!docType) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  switch (docType) {
    case 'pdf':
      return parsePDF(buffer);
    case 'docx':
      return parseDOCX(buffer);
    case 'image':
      return parseImage(buffer, mimeType, fileName);
    case 'text':
      return parseText(buffer);
    default:
      throw new Error(`Unsupported document type: ${docType}`);
  }
}

async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return {
      text: data.text.trim(),
      pageCount: data.numpages,
      metadata: {
        info: data.info,
      },
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Не удалось прочитать PDF файл. Возможно, файл поврежден или защищен паролем.');
  }
}

async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value.trim(),
    };
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error('Не удалось прочитать DOCX файл. Возможно, файл поврежден.');
  }
}

async function parseImage(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParsedDocument> {
  const base64 = buffer.toString('base64');
  const dataUri = `data:${mimeType};base64,${base64}`;

  // === АРХИТЕКТУРА: СПЕЦИАЛИЗИРОВАННАЯ OCR (НЕ vision-LLM) ===
  //
  // ПОЧЕМУ НЕ Gemini Vision: vision-LLM (Gemini Flash/Pro, GPT-4o)
  // обучены ГЕНЕРИРОВАТЬ текст. На нечётком фото они «дорисовывают»
  // правдоподобное содержимое — мы наблюдали галлюцинации типа
  // «школа №487, форум unity.com» и «справка Иванова из ГАЗПРОМа»
  // вместо реальных юр.документов. Для юр.сервиса это категорически
  // неприемлемо.
  //
  // РЕШЕНИЕ: GLM-OCR (lucataco/glm-ocr на Replicate) — это
  // СПЕЦИАЛИЗИРОВАННАЯ OCR-модель (0.9B параметров, encoder-decoder),
  // не general-purpose LLM. Архитектурно она не умеет «выдумывать»:
  // её задача — извлекать символы. Score 94.62 на OmniDocBench V1.5,
  // поддерживает русский. Цена ~$0.0077 за фото (~129 фото на $1).
  //
  // Если на фото действительно нечитаемо — модель вернёт пусто или
  // короткий мусор, и наш sanitize отфильтрует это.
  //
  // Дальше extractedText уходит в Gemini 3.1 Pro (triage/анализ) как
  // раньше — он уже не может галлюцинировать, потому что у него на
  // входе либо реальный текст, либо пусто.
  const OCR_MODEL = 'lucataco/glm-ocr';
  const sizeKB = Math.round(buffer.length / 1024);

  try {
    console.log(`[OCR] start glm-ocr for "${fileName}" (${sizeKB}KB)`);
    const raw = await extractTextFromImageViaAI(dataUri, OCR_MODEL);
    const clean = sanitizeOcrText(raw);
    console.log(`[OCR] glm-ocr result for "${fileName}":`, {
      rawLen: raw.length,
      cleanLen: clean.length,
      preview: clean.slice(0, 200),
    });

    if (!clean) {
      console.warn(`[OCR] glm-ocr returned empty/insufficient for "${fileName}"`);
      return { text: '' };
    }

    return { text: clean };
  } catch (error) {
    console.error(`[OCR] glm-ocr failed for "${fileName}":`, error);
    // Не бросаем — возвращаем пусто. UI/triage увидит, что текст
    // не извлечён, и попросит пользователя прислать копию получше.
    // Это лучше, чем рубить весь upload 422-ошибкой.
    return { text: '' };
  }
}

/**
 * Чистит ответ OCR-модели от служебных фраз и определяет, действительно
 * ли в результате есть полезный текст. Раньше «Текст не обнаружен» или
 * markdown-обёртка попадали в extractedText как valid result и triage
 * считал, что в документе ничего нет.
 */
function sanitizeOcrText(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';

  // Снимаем markdown-обёртки ```...```
  const stripped = text
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // На случай, если модель всё же что-то напишет вместо OCR
  // (мало вероятно для GLM-OCR — это специализированная модель,
  // не LLM, — но защита не помешает).
  const refusalPatterns = [
    /^OCR_UNREADABLE\b/i,
    /^OCR_FAILED\b/i,
    /^текст\s+не\s+обнаружен\.?$/i,
    /^на\s+изображении\s+нет\s+текста\.?$/i,
    /^не\s+удалось\s+распознать/i,
    /^no\s+text\s+(detected|found)\.?$/i,
    /^i\s+(can'?t|cannot)\s+(see|read|extract)/i,
  ];
  if (refusalPatterns.some((re) => re.test(stripped))) return '';

  // Слишком короткий ответ (< 10 символов) — почти наверняка отказ.
  if (stripped.length < 10) return '';

  return stripped;
}

/**
 * Per-request таймаут для одного OCR-вызова. GLM-OCR warm отрабатывает
 * за 5–35 сек, но cold start (первый запрос после простоя) — до 2-3 минут
 * (надо поднять GPU-инстанс на T4). Берём 180 с запасом — лучше пользователю
 * подождать минуту, чем получить пустой OCR и переснимать страницу.
 *
 * Warm-инстанс держится 5-10 минут после последнего запроса, поэтому
 * длинная пауза будет только на самом первом фото — последующие быстрые.
 */
const OCR_REQUEST_TIMEOUT_MS = 180_000;
const REPLICATE_POLL_INTERVAL_MS = 2000;

/**
 * Кеш `latest_version.id` для community-моделей на 30 минут. Чтобы при
 * каждом фото не дёргать GET /v1/models/{owner}/{name}.
 */
const versionCache = new Map<string, { versionId: string | null; fetchedAt: number }>();
const VERSION_CACHE_TTL_MS = 30 * 60 * 1000;

async function resolveLatestReplicateVersion(
  model: string,
  token: string,
): Promise<string | null> {
  const cached = versionCache.get(model);
  if (cached && Date.now() - cached.fetchedAt < VERSION_CACHE_TTL_MS) {
    return cached.versionId;
  }

  const res = await fetch(`https://api.replicate.com/v1/models/${model}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Replicate models GET failed: ${res.status} ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { latest_version?: { id?: string } | null };
  const versionId = data?.latest_version?.id ?? null;
  versionCache.set(model, { versionId, fetchedAt: Date.now() });
  return versionId;
}

/**
 * Извлекает чистый текст из output Replicate API. Output может прийти как
 * строка, массив строк (некоторые модели стримят токенами) или объект —
 * для всех вариантов возвращаем строку.
 */
function extractOutputText(output: unknown): string {
  if (output == null) return '';
  if (typeof output === 'string') return output.trim();
  if (Array.isArray(output)) return output.map((x) => (typeof x === 'string' ? x : '')).join('').trim();
  if (typeof output === 'object') {
    // На всякий: пробуем популярные поля
    const obj = output as Record<string, unknown>;
    const candidates = ['text', 'output', 'result', 'content'];
    for (const key of candidates) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (Array.isArray(v)) return extractOutputText(v);
    }
  }
  return '';
}

interface ReplicatePrediction {
  status?: string;
  output?: unknown;
  error?: string | null;
  urls?: { get?: string };
}

/**
 * Прямой вызов Replicate. Используем на dev/CI где REPLICATE_API_TOKEN
 * доступен и нет блокировок. Резолвит latest version, шлёт `/v1/predictions`,
 * поллит до завершения.
 */
async function callReplicateDirect(
  model: string,
  input: Record<string, unknown>,
  signal: AbortSignal,
): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN not set');

  // Резолвим версию. Для community-моделей нужен `{owner}/{name}:{version_id}`,
  // для official моделей с latest_version=null — просто `owner/name`.
  let versionId: string | null = null;
  try {
    versionId = await resolveLatestReplicateVersion(model, token);
  } catch (err) {
    console.warn(`[OCR] resolveLatestReplicateVersion failed for ${model}:`, err);
    // Падаем на использование model как версии — Replicate сам разрулит
    // (для official моделей это работает)
  }
  const version = versionId ? `${model}:${versionId}` : model;

  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    signal,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait', // подождать до ~60s ответа inline, потом отдать в любом виде
    },
    body: JSON.stringify({ version, input }),
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    throw new Error(
      `Replicate predictions POST failed: ${createRes.status} ${body.slice(0, 200)}`,
    );
  }

  let prediction = (await createRes.json()) as ReplicatePrediction;

  // Если Prefer: wait не дождался — поллим
  while (
    prediction.status &&
    prediction.status !== 'succeeded' &&
    prediction.status !== 'failed' &&
    prediction.status !== 'canceled' &&
    prediction.urls?.get
  ) {
    await new Promise((r) => setTimeout(r, REPLICATE_POLL_INTERVAL_MS));
    if (signal.aborted) throw new Error('aborted');
    const pollRes = await fetch(prediction.urls.get, {
      signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => '');
      throw new Error(`Replicate poll failed: ${pollRes.status} ${body.slice(0, 200)}`);
    }
    prediction = (await pollRes.json()) as ReplicatePrediction;
  }

  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    throw new Error(
      `Replicate prediction ${prediction.status}: ${prediction.error || 'unknown'}`,
    );
  }

  return extractOutputText(prediction.output);
}

/**
 * Вызов через Cloudflare Worker — нужен на VPS в РФ, где прямой доступ
 * к api.replicate.com заблокирован. Worker сам резолвит community-версии
 * (см. cloudflare-worker/replicate-proxy.js).
 */
async function callReplicateViaWorker(
  model: string,
  input: Record<string, unknown>,
  signal: AbortSignal,
): Promise<string> {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  const workerSecret = process.env.CLOUDFLARE_WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    throw new Error('Neither REPLICATE_API_TOKEN nor CLOUDFLARE_WORKER_URL configured');
  }

  const res = await fetch(workerUrl, {
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': workerSecret,
    },
    body: JSON.stringify({ model, input }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Worker error: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { output?: unknown };
  return extractOutputText(data?.output);
}

/**
 * Сетевая ошибка direct-вызова к Replicate из РФ — соединение рвётся
 * (ECONNRESET, UND_ERR_SOCKET, fetch failed). Не стоит этим грузить
 * пользователя — переключаемся на Cloudflare Worker автоматически.
 */
function looksLikeNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message || '';
  const causeMsg = (err as { cause?: { message?: string; code?: string } }).cause?.message || '';
  const causeCode = (err as { cause?: { message?: string; code?: string } }).cause?.code || '';
  const combined = `${msg} ${causeMsg} ${causeCode}`;
  return /fetch failed|ECONNRESET|UND_ERR_SOCKET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|other side closed/i.test(
    combined,
  );
}

async function extractTextFromImageViaAI(
  dataUri: string,
  model: string,
): Promise<string> {
  // GLM-OCR — специализированная OCR-модель. Принимает image + mode.
  // Mode `text` = general-purpose OCR с reading order. Подходит для юр.
  // документов (есть formula/table/custom режимы, но для триажа нужен
  // обычный текст — структуру разберёт triage AI выше).
  const input = { image: dataUri, mode: 'text' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OCR_REQUEST_TIMEOUT_MS);

  // Принудительно ходить только через worker, если REPLICATE_FORCE_WORKER=1.
  // Полезно когда направление direct точно недоступно (например, dev в РФ),
  // чтобы не тратить ~30 сек на TCP-таймаут перед fallback'ом.
  const forceWorker = process.env.REPLICATE_FORCE_WORKER === '1';
  const hasToken = !!process.env.REPLICATE_API_TOKEN;
  const hasWorker = !!process.env.CLOUDFLARE_WORKER_URL && !!process.env.CLOUDFLARE_WORKER_SECRET;
  const tryDirectFirst = hasToken && !forceWorker;

  try {
    if (tryDirectFirst) {
      try {
        console.log(`[OCR] channel=direct model=${model}`);
        return await callReplicateDirect(model, input, controller.signal);
      } catch (directErr) {
        // Сетевую ошибку молча проглатываем и идём через worker.
        // Логические ошибки (404, 422 от Replicate и т.п.) пробрасываем.
        if (!looksLikeNetworkError(directErr) || !hasWorker) throw directErr;
        console.warn(
          `[OCR] direct failed (network), falling back to worker for ${model}:`,
          directErr instanceof Error ? directErr.message : directErr,
        );
      }
    }

    if (!hasWorker) {
      throw new Error('OCR transport unavailable: no REPLICATE_API_TOKEN reachable and no worker configured');
    }
    console.log(`[OCR] channel=worker model=${model}`);
    return await callReplicateViaWorker(model, input, controller.signal);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`OCR timeout after ${OCR_REQUEST_TIMEOUT_MS}ms (model=${model})`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseText(buffer: Buffer): Promise<ParsedDocument> {
  const text = buffer.toString('utf-8').trim();
  return Promise.resolve({ text });
}

export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

export function getMimeTypeFromExtension(ext: string): string | null {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    txt: 'text/plain',
  };
  return map[ext] || null;
}

/** Safari/WebView иногда отдают пустой `file.type` — определяем по расширению. */
export function resolveFileMimeType(fileName: string, mimeType: string): string | null {
  const normalized = (mimeType || '').trim().toLowerCase();
  if (normalized === 'image/jpg') {
    return 'image/jpeg';
  }
  if (normalized && isSupportedMimeType(normalized)) {
    return normalized;
  }
  const fromExtension = getMimeTypeFromExtension(getFileExtension(fileName));
  if (fromExtension && isSupportedMimeType(fromExtension)) {
    return fromExtension;
  }
  return null;
}
