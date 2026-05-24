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

  // Двухступенчатый OCR: сначала быстрая модель (gemini-2.5-flash). Если
  // она вернула пустоту или явный отказ — пробуем pro-модель. Часто Flash
  // не справляется со снимками с искажением (фото документа под углом
  // на сиденье машины — пример из практики), а Pro вытягивает.
  const FAST_MODEL = 'google/gemini-2.5-flash';
  const STRONG_MODEL = 'google/gemini-2.5-pro';

  try {
    console.log(`[OCR] start fast model for "${fileName}" (${Math.round(buffer.length / 1024)}KB)`);
    const fastText = await extractTextFromImageViaAI(dataUri, FAST_MODEL);
    const fastClean = sanitizeOcrText(fastText);

    if (fastClean) {
      console.log(`[OCR] fast model OK for "${fileName}": ${fastClean.length} chars`);
      return { text: fastClean };
    }

    console.warn(`[OCR] fast model returned empty for "${fileName}", trying strong model`);
    const strongText = await extractTextFromImageViaAI(dataUri, STRONG_MODEL);
    const strongClean = sanitizeOcrText(strongText);

    if (strongClean) {
      console.log(`[OCR] strong model OK for "${fileName}": ${strongClean.length} chars`);
      return { text: strongClean };
    }

    console.warn(`[OCR] both models returned empty for "${fileName}"`);
    return { text: '' };
  } catch (error) {
    console.error(`[OCR] error for "${fileName}":`, error);
    // Пробуем strong как полный fallback. Если и он упал — отдаём пусто
    // (выше в upload-роуте превратится в «опишите содержимое в сообщении»).
    try {
      console.warn(`[OCR] retrying with strong model after error for "${fileName}"`);
      const fallbackText = await extractTextFromImageViaAI(dataUri, STRONG_MODEL);
      const fallbackClean = sanitizeOcrText(fallbackText);
      if (fallbackClean) {
        console.log(`[OCR] strong fallback OK for "${fileName}": ${fallbackClean.length} chars`);
        return { text: fallbackClean };
      }
    } catch (fallbackErr) {
      console.error(`[OCR] strong fallback also failed for "${fileName}":`, fallbackErr);
    }
    throw new Error('Не удалось распознать текст на изображении.');
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

  // Явные «модель сдалась» — считаем пустым, попробуем сильнее.
  const refusalPatterns = [
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

async function extractTextFromImageViaAI(
  dataUri: string,
  model: string,
): Promise<string> {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  const workerSecret = process.env.CLOUDFLARE_WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    throw new Error('Gemini Vision not configured');
  }

  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': workerSecret,
    },
    body: JSON.stringify({
      model,
      input: {
        // Более настойчивый промпт: даже если фото плохое, надо вытащить
        // максимум текста. Старая версия слишком легко отказывалась.
        prompt: `Ты — OCR-система. Внимательно изучи это изображение документа и извлеки ВЕСЬ видимый текст.

ПРАВИЛА:
- Выведи только сам текст документа, без своих комментариев и вступлений.
- Сохраняй структуру: абзацы, списки, заголовки.
- Даже если фото нечёткое, под углом, с тенью или плохим освещением — извлеки максимум того, что можешь разобрать.
- Если часть текста совсем не читается, просто пропусти её, а остальное верни.
- НЕ возвращай "Текст не обнаружен", если хоть что-то читаемо.
- Только если буквально пустое изображение или сплошной шум — верни "OCR_FAILED".`,
        image: dataUri,
      },
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `Gemini Vision API error: ${response.status} ${bodyText.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const output = data.output;

  if (Array.isArray(output)) {
    return output.join('').trim();
  }
  if (typeof output === 'string') {
    return output.trim();
  }

  throw new Error('Unexpected Gemini Vision response format');
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
