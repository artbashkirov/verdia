# 🚀 Быстрая шпаргалка: Переменные окружения на Vercel

## Где добавить переменные:

1. **Войдите на [vercel.com](https://vercel.com)**
2. **Выберите проект `verdia`**
3. **Settings** → **Environment Variables**

## Какие переменные добавить:

### 1. NEXT_PUBLIC_SUPABASE_URL
**Где найти:**
- [supabase.com/dashboard](https://supabase.com/dashboard) → ваш проект → **Settings** → **API** → **Project URL**
- Пример: `https://xxxxxxxxxxxxx.supabase.co`

### 2. NEXT_PUBLIC_SUPABASE_ANON_KEY  
**Где найти:**
- [supabase.com/dashboard](https://supabase.com/dashboard) → ваш проект → **Settings** → **API** → **anon/public key**
- Это длинная строка, начинается примерно так: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 3. OPENAI_API_KEY
**Где найти:**
- [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Создайте ключ и скопируйте (начинается с `sk-`)

## ⚠️ Обязательно:
- ✅ Добавьте для всех окружений: **Production**, **Preview**, **Development**
- ✅ После добавления сделайте **Redeploy** проекта

## После настройки:
1. Перейдите в **Deployments**
2. Найдите последний деплой → ⋯ → **Redeploy**
3. Или сделайте новый commit и push в GitHub

---

📖 **Подробная инструкция:** см. [VERCEL_SETUP.md](./VERCEL_SETUP.md)


