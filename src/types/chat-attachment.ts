/**
 * Документ, прикреплённый пользователем к сообщению в чате.
 *
 * Файл НЕ сохраняется на диск/Storage — мы извлекаем текст на сервере
 * и передаём его в AI-промпт как контекст.
 */
export interface ChatAttachment {
  fileName: string;
  mimeType: string;
  size: number;
  extractedText: string;
}

/** Метаданные вложения для UI (без extractedText). */
export type ChatAttachmentMeta = Pick<ChatAttachment, 'fileName' | 'mimeType' | 'size'>;

/** Максимум файлов за одно сообщение. */
export const MAX_CHAT_ATTACHMENTS = 10;

/** Жёсткий лимит на хранение извлечённого текста одного файла. */
const MAX_STORED_TEXT_CHARS = 30000;

const ATTACHMENT_BLOCK_START = '<!--ATTACHMENT_DATA_START-->';
const ATTACHMENT_BLOCK_END = '<!--ATTACHMENT_DATA_END-->';
const ATTACHMENT_JSON_RE = new RegExp(
  `${ATTACHMENT_BLOCK_START}([\\s\\S]*?)${ATTACHMENT_BLOCK_END}`,
  'g',
);

function truncate(text: string, max = MAX_STORED_TEXT_CHARS): string {
  const trimmed = (text || '').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}\n\n[…документ обрезан для экономии контекста…]`;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} КБ`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} МБ`;
}

export function isValidChatAttachment(value: unknown): value is ChatAttachment {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ChatAttachment).fileName === 'string' &&
    typeof (value as ChatAttachment).mimeType === 'string' &&
    typeof (value as ChatAttachment).size === 'number' &&
    typeof (value as ChatAttachment).extractedText === 'string'
  );
}

/** Нормализует `attachment` / `attachments` из тела запроса. */
export function normalizeAttachmentsFromBody(body: unknown): ChatAttachment[] {
  if (!body || typeof body !== 'object') return [];

  const record = body as Record<string, unknown>;
  const result: ChatAttachment[] = [];

  if (Array.isArray(record.attachments)) {
    for (const item of record.attachments) {
      if (isValidChatAttachment(item)) result.push(item);
    }
  }

  if (result.length === 0 && isValidChatAttachment(record.attachment)) {
    result.push(record.attachment);
  }

  return result.slice(0, MAX_CHAT_ATTACHMENTS);
}

export function buildEffectiveMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[],
): string {
  const trimmed = (message || '').trim();
  if (trimmed) return trimmed;
  if (attachments.length === 1) {
    return `Проанализируй прикреплённый документ: ${attachments[0].fileName}`;
  }
  if (attachments.length > 1) {
    return `Проанализируй прикреплённые документы (${attachments.length})`;
  }
  return '';
}

function formatVisibleAttachmentLine(attachment: ChatAttachmentMeta): string {
  return `📎 ${attachment.fileName} · ${formatAttachmentSize(attachment.size)}`;
}

export function encodeAttachmentForPrompt(
  attachment: ChatAttachment,
  maxChars = MAX_STORED_TEXT_CHARS,
): string {
  const truncated = truncate(attachment.extractedText, maxChars);
  const sizeKb = Math.max(1, Math.round(attachment.size / 1024));
  return `\n\n[Прикреплён документ: ${attachment.fileName} · ${sizeKb} КБ]\n${
    truncated
      ? `--- НАЧАЛО ДОКУМЕНТА ---\n${truncated}\n--- КОНЕЦ ДОКУМЕНТА ---`
      : '(текст не удалось извлечь)'
  }`;
}

export function encodeAttachmentsForPrompt(
  attachments: ChatAttachment[],
  maxCharsPerDoc?: number,
): string {
  return attachments
    .map((item) => encodeAttachmentForPrompt(item, maxCharsPerDoc))
    .join('');
}

/** @deprecated используйте encodeAttachmentsInMessage */
export function encodeAttachmentInMessage(
  userText: string,
  attachment: ChatAttachment | null | undefined,
): string {
  return encodeAttachmentsInMessage(userText, attachment ? [attachment] : []);
}

export function encodeAttachmentsInMessage(
  userText: string,
  attachments: ChatAttachment[],
): string {
  const text = (userText || '').trim();
  if (!attachments.length) return text;

  const truncatedAttachments = attachments.map((attachment) => ({
    ...attachment,
    extractedText: truncate(attachment.extractedText),
  }));

  const visibleLines = attachments.map((attachment) => formatVisibleAttachmentLine(attachment));
  const payload = JSON.stringify(truncatedAttachments);
  const hiddenBlock = `${ATTACHMENT_BLOCK_START}${payload}${ATTACHMENT_BLOCK_END}`;

  const visibleContent = text
    ? `${text}\n\n${visibleLines.join('\n')}`
    : visibleLines.join('\n');
  return `${visibleContent}\n\n${hiddenBlock}`;
}

/** @deprecated используйте stripAttachmentsSuffix */
export function stripAttachmentSuffix(
  content: string,
  attachment: ChatAttachmentMeta | null | undefined,
): string {
  return stripAttachmentsSuffix(content, attachment ? [attachment] : []);
}

export function stripAttachmentsSuffix(
  content: string,
  attachments: ChatAttachmentMeta[],
): string {
  if (!content || !attachments.length) return content || '';

  let result = content;
  for (const attachment of attachments) {
    const visibleLine = formatVisibleAttachmentLine(attachment);
    result = result
      .split(`\n\n${visibleLine}`).join('')
      .split(`\n${visibleLine}`).join('')
      .split(visibleLine).join('');
  }
  return result.trim();
}

export interface ParsedMessageWithAttachments {
  visibleContent: string;
  attachments: ChatAttachment[];
  /** Первое вложение — для обратной совместимости со старым UI/API. */
  attachment: ChatAttachment | null;
  textForAi: string;
}

/** @deprecated alias */
export type ParsedMessageWithAttachment = ParsedMessageWithAttachments;

function parseAttachmentsPayload(raw: string): ChatAttachment[] {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed.filter(isValidChatAttachment);
  }
  if (isValidChatAttachment(parsed)) {
    return [parsed];
  }
  return [];
}

export function parseAttachmentsFromMessage(content: string): ParsedMessageWithAttachments {
  if (!content) {
    return { visibleContent: '', attachments: [], attachment: null, textForAi: '' };
  }

  const attachments: ChatAttachment[] = [];
  const matches = [...content.matchAll(ATTACHMENT_JSON_RE)];

  for (const match of matches) {
    try {
      attachments.push(...parseAttachmentsPayload(match[1]));
    } catch (err) {
      console.warn('[chat-attachment] failed to parse attachment JSON:', err);
    }
  }

  const visibleContent = content.replace(ATTACHMENT_JSON_RE, '').trimEnd();
  const textForAi = stripAttachmentsSuffix(visibleContent, attachments);

  return {
    visibleContent,
    attachments,
    attachment: attachments[0] ?? null,
    textForAi,
  };
}

/** @deprecated используйте parseAttachmentsFromMessage */
export function parseAttachmentFromMessage(content: string): ParsedMessageWithAttachments {
  return parseAttachmentsFromMessage(content);
}

export function toAttachmentMetaList(attachments: ChatAttachment[]): ChatAttachmentMeta[] {
  return attachments.map(({ fileName, mimeType, size }) => ({ fileName, mimeType, size }));
}

export function appendAttachmentMarkersToQuery(
  query: string,
  attachments: ChatAttachmentMeta[],
): string {
  if (!attachments.length) return query;
  const markers = attachments.map((item) => formatVisibleAttachmentLine(item)).join('\n');
  if (query.trim()) {
    return `${query.trim()}\n\n${markers}`;
  }
  if (attachments.length === 1) {
    return `Проанализируй прикреплённый документ\n\n${markers}`;
  }
  return `Проанализируй прикреплённые документы (${attachments.length})\n\n${markers}`;
}

/** Сериализует вложения для sessionStorage (главная → /chat/new). */
export function serializeAttachmentsForSession(attachments: ChatAttachment[]): string | null {
  try {
    return JSON.stringify(attachments);
  } catch (err) {
    console.error('[chat-attachment] serialize failed:', err);
    return null;
  }
}

/** Читает вложения из sessionStorage (новый ключ + legacy single). */
export function parseAttachmentsFromSession(raw: string | null): ChatAttachment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(isValidChatAttachment).slice(0, MAX_CHAT_ATTACHMENTS);
    }
    if (isValidChatAttachment(parsed)) {
      return [parsed];
    }
  } catch (err) {
    console.error('[chat-attachment] parse session failed:', err);
  }
  return [];
}
