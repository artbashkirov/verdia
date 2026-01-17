# 📋 Документ контекста проекта Verdia

Этот документ содержит полный контекст проекта для AI-ассистентов и разработчиков.

---

## 🎯 Описание проекта

**Verdia** — это юридический AI-ассистент для граждан РФ, помогающий в подготовке юридических документов с анализом судебной практики.

### Основные возможности

1. **AI-анализ юридических ситуаций** — пользователь описывает проблему, AI анализирует и даёт структурированный ответ
2. **Поиск судебной практики** — автоматический поиск релевантных судебных дел
3. **Оценка вероятности успеха** — расчёт шансов на удовлетворение иска
4. **Генерация документов** — автоматическое создание исковых заявлений, претензий, ходатайств
5. **Экспорт в DOCX** — скачивание готовых документов

### Целевая аудитория

- Физические лица (граждане РФ)
- Индивидуальные предприниматели
- Юридические лица

---

## 🛠 Технологический стек

### Frontend
| Технология | Версия | Назначение |
|------------|--------|------------|
| **Next.js** | 16.1.1 | React-фреймворк с App Router |
| **React** | 19.2.0 | Библиотека UI |
| **TypeScript** | 5.x | Типизированный JavaScript |
| **Tailwind CSS** | 4.x | CSS-фреймворк |
| **Lucide React** | 0.562.0 | Иконки |

### Backend & API
| Технология | Назначение |
|------------|------------|
| **Next.js API Routes** | HTTP эндпоинты |
| **Supabase** | База данных (PostgreSQL), аутентификация |
| **OpenAI API** | AI генерация (GPT-4o, GPT-4o-mini) |
| **Puppeteer** | Парсинг судебных решений |

### Инфраструктура
| Компонент | Назначение |
|-----------|------------|
| **VPS** (193.227.240.206) | Production сервер |
| **Nginx** | Reverse proxy, SSL |
| **PM2** | Менеджер процессов |
| **GitHub Actions** | CI/CD автодеплой |
| **Vercel** | Альтернативный хостинг |

---

## 📁 Структура проекта

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Группа роутов авторизации
│   │   ├── login/               # Вход
│   │   ├── register/            # Регистрация
│   │   ├── verify/              # Подтверждение email
│   │   ├── forgot-password/     # Восстановление пароля
│   │   ├── reset-password/      # Сброс пароля
│   │   ├── privacy/             # Политика конфиденциальности
│   │   └── terms/               # Условия использования
│   ├── (chat)/                   # Группа роутов чата
│   │   ├── chat/                # Главная страница чата
│   │   │   └── [id]/           # Страница конкретного чата
│   │   ├── faq/                 # FAQ
│   │   └── profile/             # Профиль пользователя
│   ├── api/                      # API эндпоинты
│   │   ├── chat/                # Обработка чат-запросов
│   │   ├── generate/            # Генерация ответов
│   │   ├── generate-stream/     # Стриминг ответов
│   │   ├── search/              # Поиск судебной практики
│   │   └── refine-search/       # Уточнение поиска
│   └── auth/callback/            # OAuth callback
│
├── components/                   # React компоненты
│   ├── icons/                   # SVG иконки
│   │   ├── Icons.tsx           # Все иконки
│   │   └── Logo.tsx            # Логотип
│   ├── layout/                  # Layout компоненты
│   │   ├── AuthLayout.tsx      # Layout для auth страниц
│   │   ├── ChatInput.tsx       # Поле ввода чата
│   │   ├── Sidebar.tsx         # Боковая панель (десктоп)
│   │   ├── MobileSidebar.tsx   # Боковая панель (мобилка)
│   │   ├── MobileHeader.tsx    # Заголовок (мобилка)
│   │   └── ScrollbarHandler.tsx # Управление скроллбаром
│   └── ui/                      # UI компоненты
│       ├── Button.tsx          # Кнопка
│       ├── Input.tsx           # Поле ввода
│       ├── Checkbox.tsx        # Чекбокс
│       └── MarkdownRenderer.tsx # Рендер markdown
│
├── lib/                         # Утилиты и библиотеки
│   ├── supabase/               # Supabase клиенты
│   │   ├── client.ts          # Клиентский SDK
│   │   ├── server.ts          # Серверный SDK
│   │   └── middleware.ts      # Middleware для auth
│   ├── openai.ts              # OpenAI интеграция
│   ├── prompts.ts             # AI промпты
│   ├── court-search.ts        # Поиск судебной практики
│   ├── docx-generator.ts      # Генерация DOCX
│   ├── theme-context.tsx      # Контекст темы (light/dark)
│   ├── example-queries.ts     # Примеры запросов
│   └── use-stream-generation.ts # Хук для стриминга
│
├── types/                       # TypeScript типы
│   ├── index.ts               # Экспорт типов
│   └── database.ts            # Типы базы данных
│
└── middleware.ts                # Next.js middleware
```

---

## 🗃 Модели данных

### User (Пользователь)
```typescript
interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  plan: 'free' | 'pro';
  created_at: string;
  updated_at: string;
}
```

### UserProfile (Профиль истца)
```typescript
interface UserProfile {
  id: string;
  user_id: string;
  person_type: 'individual' | 'entrepreneur' | 'legal_entity';
  // Для физлица
  full_name?: string;
  passport_series?: string;
  passport_number?: string;
  passport_issued_by?: string;
  passport_issue_date?: string;
  birth_date?: string;
  // Для ИП
  ogrnip?: string;
  inn_individual?: string;
  // Для юрлица
  company_name?: string;
  company_form?: string;
  ogrn?: string;
  inn_legal?: string;
  kpp?: string;
  // Адреса
  registration_address?: string;
  registration_city?: string;
  registration_region?: string;
  actual_address?: string;
  // Контакты
  phone?: string;
  email_contact?: string;
  // Банковские реквизиты (опционально)
  bank_name?: string;
  bank_bik?: string;
  bank_account?: string;
  bank_corr_account?: string;
}
```

### Generation (AI-генерация)
```typescript
interface Generation {
  id: string;
  user_id: string;
  query: string;
  response: GenerationResponse;
  created_at: string;
}

interface GenerationResponse {
  courtCases: CourtCase[];
  shortAnswer: {
    title: string;
    content: string;
    probability?: { percentage: number; level: string; };
  };
  legalAnalysis: {
    title: string;
    intro: string;
    points: string[];
    bases: string[];
  };
  practiceAnalysis: {
    intro: string;
    satisfied: { title: string; points: string[]; };
    rejected: { title: string; points: string[]; };
  };
  probability: {
    percentage?: number;
    level: string;
    positiveFactors?: string[];
    negativeFactors?: string[];
  };
  recommendations: string[];
  documents: Document[];
}
```

### ChatHistoryItem (История чатов)
```typescript
interface ChatHistoryItem {
  id: string;
  title: string;
  user_id: string;
  generation_id?: string | null;
  created_at: string;
}
```

---

## 🎨 Дизайн-система

### Цветовая палитра

#### Light Theme
| CSS-переменная | Значение | Использование |
|----------------|----------|---------------|
| `--background` | `#ffffff` | Фон страницы |
| `--foreground` | `#040308` | Основной текст |
| `--secondary-text` | `#808080` | Второстепенный текст |
| `--primary` | `#212121` | Основной цвет кнопок |
| `--accent` | `#312ecb` | Акцентный цвет |
| `--link-color` | `#312ecb` | Цвет ссылок |
| `--gray-100` | `#f3f3f3` | Светло-серый фон |
| `--gray-200` | `#d9d9d9` | Обводки |
| `--border-color` | `rgba(0,0,0,0.2)` | Границы |
| `--input-bg` | `#ffffff` | Фон полей ввода |

#### Dark Theme
| CSS-переменная | Значение |
|----------------|----------|
| `--background` | `#131314` |
| `--foreground` | `#ffffff` |
| `--secondary-text` | `#9a9a9a` |
| `--input-bg` | `#1E1E1F` |
| `--border-color` | `rgba(255,255,255,0.1)` |

### Типографика

#### Мобильные устройства (по умолчанию)
| Элемент | Размер | Line-height |
|---------|--------|-------------|
| **H1** | `20px` | `28px` |
| **H2** | `18px` | `24px` |
| **Body** | `16px` | `24px` |
| **Мелкий текст** | `13px` | `16px` |
| **Метки** | `11px` | `14px` |

#### Десктоп (lg: prefix)
| Элемент | Размер | Line-height |
|---------|--------|-------------|
| **H1** | `32px` | `40px` |
| **H2** | `24px` | `30px` |
| **Body** | `16px` | `24px` |
| **Мелкий текст** | `14px` | `16px` |
| **Метки** | `12px` | `14px` |

### Примеры использования типографики

```tsx
// H1 заголовок
<h1 className="text-[20px] lg:text-[32px] leading-[28px] lg:leading-[40px]">
  Заголовок
</h1>

// H2 подзаголовок
<h2 className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px]">
  Подзаголовок
</h2>

// Основной текст
<p className="text-[16px] leading-[24px]">
  Основной текст
</p>

// Ссылка / мелкий текст
<a className="text-[13px] lg:text-[14px] leading-[16px]">
  Ссылка
</a>
```

### Компоненты

#### ChatInput (Поле ввода)
- Высота: `56px`
- Скругления: `20px`
- Обводка: `1px solid #CCCCCC`

#### Sidebar (Боковая панель)
- Цвет фона: `#17181A`
- Ширина: `280px` (десктоп)

---

## 🔄 Потоки данных

### 1. Пользователь отправляет запрос

```
1. ChatInput → POST /api/generate-stream
2. API извлекает данные профиля истца из Supabase
3. API отправляет запрос в OpenAI (GPT-4o)
4. Стриминг ответа через ReadableStream
5. Ответ сохраняется в таблицу generations
6. Создаётся запись в chat_history
7. UI рендерит ответ с анимацией
```

### 2. Генерация документов

```
1. Пользователь запрашивает документы
2. POST /api/generate с контекстом
3. OpenAI генерирует текст документов
4. docx-generator создаёт DOCX файлы
5. Файлы скачиваются через file-saver
```

### 3. Аутентификация

```
1. Supabase Auth (email/password)
2. Next.js Middleware проверяет сессию
3. Защищённые роуты: /chat/*, /profile/*
4. Публичные роуты: /login, /register
```

---

## 🤖 AI-промпты

### Основной промпт (SYSTEM_PROMPT)

AI отвечает в формате JSON со следующей структурой:

```json
{
  "courtCases": [{ "id": 1, "title": "...", "url": "..." }],
  "shortAnswer": {
    "title": "Описательный заголовок ситуации",
    "content": "Объяснение 2-3 предложения",
    "probability": { "percentage": 65, "level": "выше средней" }
  },
  "legalAnalysis": {
    "title": "Заголовок анализа",
    "intro": "Вводное предложение",
    "points": ["Пункт 1", "Пункт 2"],
    "bases": ["ст. XX ГК РФ"]
  },
  "practiceAnalysis": {
    "intro": "Анализ практики",
    "satisfied": { "title": "Когда удовлетворяют", "points": ["..."] },
    "rejected": { "title": "Когда отказывают", "points": ["..."] }
  },
  "probability": {
    "percentage": 65,
    "level": "выше средней",
    "positiveFactors": ["Фактор 1"],
    "negativeFactors": ["Фактор 1"]
  },
  "recommendations": ["Рекомендация 1", "Рекомендация 2"],
  "courtPrediction": {
    "predictedCourt": {
      "name": "Название суда",
      "reason": "Объяснение подсудности"
    }
  }
}
```

### Шкала вероятности

| Диапазон | Уровень |
|----------|---------|
| 0% | Недостаточно данных |
| 1-19% | Низкая |
| 20-34% | Ниже средней |
| 35-50% | Средняя |
| 51-64% | Выше средней |
| 65-79% | Высокая |
| 80-94% | Очень высокая |
| 95-100% | Максимальная |

---

## 🔐 Переменные окружения

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# OpenAI
OPENAI_API_KEY=sk-...

# VPS Scraper (опционально)
VPS_SCRAPER_URL=http://193.227.240.206:3001
```

---

## 🚀 Команды разработки

```bash
# Установка зависимостей
npm install

# Запуск dev-сервера
npm run dev

# Сборка production
npm run build

# Запуск production
npm start

# Линтинг
npm run lint

# Проверка Supabase
npm run check-supabase
```

---

## 📦 Деплой

### VPS (основной) — автоматический через GitHub Actions

**Файл:** `.github/workflows/deploy.yml`

**Триггер:** Push в ветку `main`

**Процесс:**
```bash
1. GitHub Actions подключается к VPS по SSH
   - host: ${{ secrets.VPS_HOST }}
   - key: ${{ secrets.VPS_SSH_KEY }}

2. Выполняются команды на VPS:
   cd /opt/verdia-app
   git pull origin main
   npm install --production=false
   npm run build
   pm2 restart verdia --update-env
   pm2 save
```

**GitHub Secrets (настроены в репозитории):**
- `VPS_HOST` — IP адрес VPS сервера
- `VPS_SSH_KEY` — Приватный SSH ключ для подключения

**На VPS:**
- Путь приложения: `/opt/verdia-app`
- Процесс-менеджер: PM2
- Имя процесса: `verdia`
- Reverse proxy: Nginx

**Полезные команды на VPS:**
```bash
# Подключение
ssh root@<VPS_HOST>

# Проверка статуса
pm2 list
pm2 logs verdia --lines 50

# Ручной перезапуск
pm2 restart verdia --update-env

# Проверка текущего коммита
cd /opt/verdia-app && git log -1 --oneline
```

### Vercel (альтернативный)

1. Push в репозиторий
2. Vercel автоматически собирает и деплоит

---

## ⚠️ Важные правила для AI-ассистента

1. **НЕ изменять дизайн** без явного указания пользователя:
   - Отступы, шрифты, цвета, размеры
   - Любые визуальные аспекты

2. **Соблюдать типографику** из TYPOGRAPHY_STANDARDS.md

3. **При работе с Figma** — делать pixel perfect дизайн

4. **Коммиты в GitHub** — только с разрешения пользователя

5. **Завершать текущую задачу** перед началом новой

---

## 📊 Таблицы Supabase

### public.users
Пользователи системы

### public.user_profiles
Профили истцов (данные для документов)

### public.generations
AI-генерации ответов

### public.chat_history
История чатов пользователя

### public.saved_defendants
Сохранённые ответчики

---

## 🔗 Внешние сервисы

| Сервис | URL | Назначение |
|--------|-----|------------|
| **Supabase** | supabase.com | БД, Auth |
| **OpenAI** | openai.com | AI API |
| **sudact.ru** | sudact.ru | Судебная практика |
| **mos-gorsud.ru** | mos-gorsud.ru | Московские суды |

---

## 📄 Связанная документация

- `ARCHITECTURE.md` — Полная архитектура проекта
- `TECH_STACK.md` — Технологический стек
- `DESIGN_STYLES.md` — Дизайн-стили
- `TYPOGRAPHY_STANDARDS.md` — Стандарты типографики
- `.github/workflows/deploy.yml` — GitHub Actions деплой

---

*Документ обновлён: 2026-01-17*
