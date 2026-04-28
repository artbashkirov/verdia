'use client';

/**
 * Глобальный тостер на основе sonner.
 *
 * Используется для:
 * - сетевых ошибок (отправка сообщения провалилась, поллинг упал и т.п.);
 * - ошибок при скачивании документов;
 * - ошибок системных действий (очистка истории, операции с делами).
 *
 * Inline-ошибки (например, валидация формы) остаются как есть — тосты
 * их дублируют только для глобальных/транзитивных ошибок.
 *
 * Использование:
 *   import { toast } from 'sonner';
 *   toast.error('Не удалось отправить сообщение');
 *   toast.success('Документ скачан');
 *   toast.message('Информация');
 */

import { Toaster } from 'sonner';

export function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      richColors
      theme="light"
      closeButton={false}
      duration={4000}
      expand={false}
      visibleToasts={3}
    />
  );
}
