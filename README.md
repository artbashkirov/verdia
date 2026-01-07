# Verdia - Юридический AI-ассистент

![Verdia](https://img.shields.io/badge/Verdia-AI%20Legal%20Assistant-black)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-38bdf8)

Сервис для подготовки исковых заявлений, ходатайств с анализом судебной практики и оценкой вероятности удовлетворения иска.

## 🚀 Возможности

- **Анализ проблемы** - AI анализирует вашу юридическую ситуацию
- **Поиск судебной практики** - поиск релевантных решений на mos-gorsud.ru
- **Генерация документов** - автоматическое создание исковых заявлений и ходатайств
- **Оценка вероятности** - приблизительная оценка шансов на успех

## 🛠 Технологии

- **Frontend**: Next.js 15, React 19, TypeScript
- **Стилизация**: Tailwind CSS 4
- **База данных**: Supabase (PostgreSQL)
- **AI**: OpenAI API (ChatGPT)
- **Источник данных**: mos-gorsud.ru

## 📦 Установка

```bash
# Клонирование репозитория
git clone https://github.com/your-username/verdia.git
cd verdia

# Установка зависимостей
npm install

# Настройка переменных окружения
cp env.example .env.local
# Заполните .env.local вашими ключами

# Запуск dev-сервера
npm run dev
```

## 🔑 Переменные окружения

Создайте файл `.env.local` в корне проекта:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI (будет добавлено позже)
OPENAI_API_KEY=your_openai_api_key
```

### ⚠️ Важно: Настройка Supabase для локальной разработки

После настройки `.env.local`:

1. **Настройте Email Authentication:**
   - Откройте панель Supabase: https://supabase.com/dashboard
   - Выберите ваш проект → **Authentication** → **Providers** → **Email**
   - Убедитесь, что Email включен
   - В разделе **Email Auth Settings**:
     - ⚠️ **Для разработки (рекомендуется)**: Отключите **"Enable email confirmations"** — пользователи смогут входить сразу после регистрации без подтверждения email
     - ✅ **Для продакшена**: Включите **"Enable email confirmations"** и настройте SMTP (см. пункт 2)
   - **Важно**: По умолчанию Supabase использует встроенный email сервис, который может быть ограничен. Для продакшена настройте SMTP.

2. **Настройте SMTP (рекомендуется для продакшена):**
   - В панели Supabase: **Authentication** → **Settings** → **SMTP Settings**
   - Настройте SMTP сервер (Gmail, SendGrid, Mailgun и т.д.)
   - Без настройки SMTP письма могут не доставляться или попадать в спам

3. **Добавьте redirect URL в настройках Supabase:**
   - **Authentication** → **URL Configuration**
   - В разделе **Redirect URLs** добавьте:
     - `http://localhost:3000/auth/callback` (для локальной разработки)
     - `http://127.0.0.1:3000/auth/callback` (альтернативный вариант)
     - `https://your-vercel-app.vercel.app/auth/callback` (для Vercel деплоя)
     - `https://your-domain.com/auth/callback` (для кастомного домена, если есть)
   - В разделе **Site URL** укажите: `http://localhost:3000` (для разработки)
   - Сохраните изменения

4. **Проверьте подключение:**
   ```bash
   node scripts/check-supabase.js
   ```

5. **Перезапустите dev-сервер** после изменения `.env.local`:
   ```bash
   npm run dev
   ```

## 🚀 Деплой на Vercel

Проект настроен для деплоя на Vercel. Подробные инструкции смотрите в [VERCEL_SETUP.md](./VERCEL_SETUP.md).

### Быстрый старт (через веб-интерфейс - рекомендуемый способ):

1. **Перейдите на [vercel.com](https://vercel.com)** и войдите через GitHub
2. **Нажмите "Add New Project"** и выберите репозиторий `verdia`
3. **Нажмите "Deploy"** (настройки определятся автоматически)

4. **Настройте переменные окружения** (подробная инструкция в [VERCEL_SETUP.md](./VERCEL_SETUP.md)):
   - В панели Vercel: **Settings** → **Environment Variables**
   - Добавьте переменные:
     - `NEXT_PUBLIC_SUPABASE_URL` - URL вашего Supabase проекта
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - публичный ключ Supabase
     - `OPENAI_API_KEY` - ключ OpenAI API
   - ⚠️ **Важно**: Выберите все три окружения (Production, Preview, Development)
   - После добавления сделайте **Redeploy** проекта

4. **Для продакшн деплоя**:
   ```bash
   vercel --prod
   ```

### Настройка домена (REG.RU)

После деплоя можно подключить кастомный домен из REG.RU к проекту на Vercel:

#### 1. Добавьте домен в Vercel

1. Откройте **Vercel Dashboard** → ваш проект → **Settings** → **Domains**
2. Нажмите **Add Domain**
3. Введите ваш домен (например, `example.com` или `www.example.com`)
4. Vercel покажет IP-адрес или CNAME, который нужно добавить в DNS

#### 2. Настройте DNS-записи в REG.RU

1. Войдите в **REG.RU** → **Мои домены** → выберите домен → **DNS-серверы и зона**

2. **Для корневого домена (example.com):**
   - Добавьте **A-запись**:
     - Имя: `@` (или оставьте пустым)
     - Тип: `A`
     - Значение: IP-адрес из Vercel (обычно `76.76.21.21`)
     - TTL: `3600`

3. **Для поддомена www (www.example.com):**
   - Добавьте **CNAME-запись**:
     - Имя: `www`
     - Тип: `CNAME`
     - Значение: `cname.vercel-dns.com` (или значение из Vercel)
     - TTL: `3600`

4. Сохраните изменения и подождите 5-30 минут для распространения DNS

#### 3. Обновите Redirect URL в Supabase

После подключения домена добавьте новый redirect URL в Supabase:

1. **Supabase Dashboard** → ваш проект → **Authentication** → **URL Configuration**
2. Добавьте в **Redirect URLs**:
   - `https://ваш-домен.com/auth/callback`
   - `https://www.ваш-домен.com/auth/callback` (если используете www)
3. Сохраните изменения

#### 4. Проверьте работу

- Дождитесь распространения DNS (обычно 5-30 минут)
- Vercel автоматически выпустит SSL-сертификат
- Убедитесь, что сайт открывается по новому домену
- Проверьте, что HTTPS работает (замок в адресной строке)

**Важно:** DNS-изменения могут распространяться до 48 часов, но обычно работают быстрее.

### 📧 Решение проблем с email подтверждением

Если письма с подтверждением не приходят:

1. **Проверьте папку "Спам"** в вашем почтовом ящике
2. **Проверьте настройки Email Auth** в Supabase Dashboard:
   - Убедитесь, что "Enable email confirmations" включен
   - Проверьте, что SMTP настроен (или используйте встроенный сервис)
3. **Проверьте логи Supabase:**
   - В панели Supabase: **Logs** → **Auth Logs**
   - Посмотрите, отправляются ли письма
4. **Для разработки можно временно отключить подтверждение email:**
   - **Authentication** → **Providers** → **Email** → **Email Auth Settings**
   - Отключите **"Enable email confirmations"**
   - Пользователи смогут входить сразу после регистрации

## 🗃 База данных

SQL-схема для Supabase находится в файле `supabase/schema.sql`.

### Таблицы:

- **users** - пользователи (id, email, first_name, last_name, plan)
- **generations** - сгенерированные ответы (id, user_id, query, response)
- **chat_history** - история чатов (id, user_id, title, generation_id)

## 📱 Страницы

| Путь | Описание |
|------|----------|
| `/login` | Страница входа |
| `/register` | Регистрация |
| `/verify` | Подтверждение email |
| `/chat` | Главная страница чата |
| `/chat/[id]` | Страница с ответом |

## 🎨 Структура проекта

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Страницы авторизации
│   │   ├── login/
│   │   ├── register/
│   │   └── verify/
│   └── (chat)/            # Страницы чата
│       └── chat/
├── components/            # React компоненты
│   ├── icons/            # SVG иконки
│   ├── layout/           # Layout компоненты
│   └── ui/               # UI компоненты
├── lib/                  # Утилиты и клиенты
└── types/                # TypeScript типы
```

## 🔜 Roadmap

- [ ] Подключение OpenAI API
- [ ] Парсинг mos-gorsud.ru
- [ ] Генерация документов (DOCX)
- [ ] Система оплаты
- [ ] Личный кабинет
- [ ] История генераций

## 📄 Лицензия

MIT

---

Разработано с ❤️ для тех, кто хочет защитить свои права
