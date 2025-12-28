# Настройка переменных окружения

## Быстрая настройка

Запустите интерактивный скрипт:
```bash
npm run setup-env
```

Скрипт попросит вас ввести:
1. `NEXT_PUBLIC_SUPABASE_URL` - URL вашего проекта Supabase
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` - публичный ключ Supabase
3. `OPENAI_API_KEY` - ключ OpenAI (опционально)

## Ручная настройка

1. Откройте файл `.env.local` в корне проекта
2. Замените placeholder значения на реальные:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ваш-проект.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_реальный_ключ
OPENAI_API_KEY=ваш_openai_ключ
```

## Где взять Supabase credentials

1. Перейдите на [supabase.com/dashboard](https://supabase.com/dashboard)
2. Выберите ваш проект (или создайте новый)
3. Перейдите в **Settings** (шестеренка внизу слева) → **API**
4. Скопируйте:
   - **Project URL** → это `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → это `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Важно после настройки

1. **Перезапустите dev сервер** (остановите и запустите заново `npm run dev`)
2. **Настройте Redirect URLs в Supabase:**
   - Перейдите в **Authentication** → **URL Configuration** → **Redirect URLs**
   - Добавьте: `http://localhost:3000/auth/callback`
   - Для production добавьте ваш домен: `https://ваш-домен.com/auth/callback`

## Проверка подключения

После настройки проверьте подключение:
```bash
npm run check-supabase
```

