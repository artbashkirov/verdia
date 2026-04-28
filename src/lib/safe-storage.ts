/**
 * Безопасные обёртки над localStorage / sessionStorage.
 *
 * Зачем:
 * - В Safari Private Mode `setItem` бросает QuotaExceededError даже на пустом
 *   хранилище.
 * - В некоторых WebView (Telegram/Instagram/VK) localStorage может быть отключён
 *   или работать с урезанной квотой.
 * - В SSR-окружении `localStorage` отсутствует — обращение бросит ReferenceError.
 *
 * Все ошибки тут проглатываются и логируются как `console.warn`, чтобы исключение
 * никогда не «всплыло» в React-дерево и не сломало рендер.
 *
 * Использовать вместо прямых обращений к `localStorage.*` / `sessionStorage.*`
 * во всех клиентских компонентах.
 */

type StorageKind = 'local' | 'session';

function getStorage(kind: StorageKind): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch (err) {
    console.warn(`[safe-storage] ${kind}Storage недоступен:`, err);
    return null;
  }
}

export function safeGet(key: string, kind: StorageKind = 'local'): string | null {
  const storage = getStorage(kind);
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (err) {
    console.warn(`[safe-storage] getItem(${key}) failed:`, err);
    return null;
  }
}

export function safeSet(key: string, value: string, kind: StorageKind = 'local'): boolean {
  const storage = getStorage(kind);
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch (err) {
    // QuotaExceededError, SecurityError, другие
    console.warn(`[safe-storage] setItem(${key}) failed:`, err);
    return false;
  }
}

export function safeRemove(key: string, kind: StorageKind = 'local'): void {
  const storage = getStorage(kind);
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch (err) {
    console.warn(`[safe-storage] removeItem(${key}) failed:`, err);
  }
}

/**
 * Безопасная сериализация JSON в storage.
 * Возвращает true при успехе.
 */
export function safeSetJson(key: string, value: unknown, kind: StorageKind = 'local'): boolean {
  try {
    const serialized = JSON.stringify(value);
    return safeSet(key, serialized, kind);
  } catch (err) {
    console.warn(`[safe-storage] setJson(${key}) serialize failed:`, err);
    return false;
  }
}

/**
 * Безопасное чтение JSON из storage. Возвращает fallback при ошибке.
 */
export function safeGetJson<T>(key: string, fallback: T, kind: StorageKind = 'local'): T {
  const raw = safeGet(key, kind);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[safe-storage] getJson(${key}) parse failed:`, err);
    return fallback;
  }
}
