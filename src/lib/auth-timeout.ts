/**
 * Утилита для безопасного получения текущего пользователя из браузерного
 * Supabase-клиента с таймаутом.
 *
 * Зачем:
 * - На мобильных Safari / Android Chrome / в WebView (Telegram, Instagram, VK)
 *   браузерный supabase-клиент иногда зависает на refresh-токене и
 *   `getUser()` никогда не резолвится.
 * - Без таймаута это приводит к "вечному спиннеру" в Sidebar, на login-странице
 *   и в других местах, где UI ждёт ответа от auth.
 *
 * Решение: Promise.race с явным таймаутом. Если таймаут сработал — отдаём
 * `{ user: null, error: { message: 'auth timeout' } }`, и компонент сам решает,
 * что показать (форму логина, кэш, ретрай и т.д.).
 *
 * Этот же паттерн уже используется в `src/lib/supabase/middleware.ts`.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';

const DEFAULT_TIMEOUT_MS = 5000;

export interface AuthResult {
  user: User | null;
  error: { message: string } | null;
  timedOut: boolean;
}

/**
 * Получает текущего пользователя из браузерного клиента с таймаутом.
 *
 * @param supabase — браузерный Supabase-клиент
 * @param timeoutMs — таймаут в миллисекундах (по умолчанию 5000)
 */
export async function getUserWithTimeout(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<AuthResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const getUserPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('auth timeout')),
        timeoutMs
      );
    });

    const result = (await Promise.race([
      getUserPromise,
      timeoutPromise,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ])) as { data: { user: User | null }; error: any };

    if (timeoutId) clearTimeout(timeoutId);

    if (result.error) {
      return {
        user: null,
        error: { message: result.error.message || 'auth error' },
        timedOut: false,
      };
    }

    return {
      user: result.data.user,
      error: null,
      timedOut: false,
    };
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : 'auth unknown error';
    const timedOut = message === 'auth timeout';

    if (!timedOut) {
      console.error('[auth-timeout] getUser failed:', message);
    } else {
      console.warn('[auth-timeout] getUser timed out after', timeoutMs, 'ms');
    }

    return {
      user: null,
      error: { message },
      timedOut,
    };
  }
}
