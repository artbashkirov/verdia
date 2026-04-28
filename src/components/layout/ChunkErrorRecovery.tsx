'use client';

/**
 * Safety-net против ChunkLoadError при деплое.
 *
 * Контекст:
 * - Next.js при `npm run build` создаёт чанки `_next/static/chunks/*.js`
 *   с хешем в имени (например, `app-abc123.js`).
 * - Старые чанки физически удаляются с диска при новом билде.
 * - Если у пользователя открыта вкладка дольше деплоя, и SPA пытается
 *   догрузить старый чанк — приходит 404, страница ломается на полпути:
 *   текст без CSS, нерабочие интерактивные элементы.
 *
 * Первая (и основная) линия защиты — серверная: deploy.yml сохраняет
 * старые чанки и мерджит их в новый `.next/static/` после билда
 * (см. `.github/workflows/deploy.yml`). Старые вкладки догружают
 * свои файлы, новые — свои. Чанков-архив живёт 14 дней.
 *
 * Второй слой — этот компонент. Он ловит ChunkLoadError на клиенте
 * (если по любой причине чанка нет — например, вкладка открыта 15+ дней,
 * или race condition в копировании, или CDN-кеш) и автоматически
 * делает hard reload: пользователь получает свежую версию SPA вместо
 * сломанного экрана.
 *
 * Меры предосторожности от петли reload:
 * - reload вызывается не чаще раза в 30 секунд (sessionStorage timestamp);
 * - если уже был reload в этой сессии и снова ChunkLoadError → значит
 *   проблема не во временном рассинхроне, а в чём-то более глубоком,
 *   тогда логируем и молча замолкаем (бесконечный reload-loop хуже,
 *   чем один сломанный экран).
 */

import { useEffect } from 'react';

const RELOAD_COOLDOWN_MS = 30_000;
const RELOAD_FLAG_KEY = 'chunk-error-reloaded-at';

function isChunkLoadError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('chunkloaderror') ||
    lower.includes('loading chunk') ||
    lower.includes('loading css chunk') ||
    lower.includes('failed to fetch dynamically imported module') ||
    /\b\w+_next\/static\b.*\b(404|failed|error)\b/.test(lower)
  );
}

function tryReload(): void {
  try {
    const lastReloadStr = sessionStorage.getItem(RELOAD_FLAG_KEY);
    const lastReload = lastReloadStr ? Number(lastReloadStr) : 0;
    const now = Date.now();
    if (Number.isFinite(lastReload) && now - lastReload < RELOAD_COOLDOWN_MS) {
      console.warn(
        '[ChunkErrorRecovery] reload skipped — already reloaded',
        Math.round((now - lastReload) / 1000),
        'sec ago. Probably a real bug, not a stale-chunk issue.'
      );
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(now));
  } catch {
  }

  console.warn('[ChunkErrorRecovery] ChunkLoadError detected, reloading…');
  window.location.reload();
}

export function ChunkErrorRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.message) || isChunkLoadError(event.error?.message)) {
        tryReload();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as unknown;
      let message: string | undefined;
      if (typeof reason === 'string') {
        message = reason;
      } else if (reason && typeof reason === 'object' && 'message' in reason) {
        message = String((reason as { message: unknown }).message);
      }
      if (isChunkLoadError(message)) {
        tryReload();
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
