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
  _fileName: string
): Promise<ParsedDocument> {
  const base64 = buffer.toString('base64');
  const dataUri = `data:${mimeType};base64,${base64}`;

  try {
    const text = await extractTextFromImageViaAI(dataUri);
    return { text };
  } catch (error) {
    console.error('Image OCR error:', error);
    throw new Error('Не удалось распознать текст на изображении.');
  }
}

async function extractTextFromImageViaAI(dataUri: string): Promise<string> {
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
      model: 'google/gemini-2.5-flash',
      input: {
        prompt: `Ты — OCR-система. Извлеки весь текст с этого изображения документа. 
Верни только текст документа, без комментариев. 
Если на изображении нет текста, верни "Текст не обнаружен".
Сохраняй структуру текста (абзацы, списки) насколько это возможно.`,
        image: dataUri,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini Vision API error: ${response.status}`);
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
