/**
 * Парсер образцов возражений с peoplleandlaw.ru
 *
 * Что делает:
 * 1. Скачивает список ссылок на образцы возражений
 * 2. Для каждого образца: скачивает текст
 * 3. Отправляет в OpenAI — извлечь структурированные данные (категория, доводы, просительная часть)
 * 4. Генерирует embedding для поиска
 * 5. Записывает в Supabase objection_templates
 *
 * Запуск:
 *   npx tsx scripts/parse-objection-templates.ts
 *
 * Переменные окружения (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually (no dotenv dependency)
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const BASE_URL = 'https://peoplleandlaw.ru';
const OBJECTION_INDEX = `${BASE_URL}/vozrazhenie`;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Verdia-Legal-Bot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractLinks(html: string, base: string): string[] {
  const matches = [...html.matchAll(/href="([^"]+vozrazhenie[^"]+)"/gi)];
  const links = matches
    .map((m) => {
      const href = m[1];
      if (href.startsWith('http')) return href;
      if (href.startsWith('/')) return `${base}${href}`;
      return `${base}/${href}`;
    })
    .filter((l) => l !== OBJECTION_INDEX && !l.includes('#'));
  return [...new Set(links)];
}

// ─── OpenAI ─────────────────────────────────────────────────────────────────

async function openAiChat(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1500,
      temperature: 0,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
      dimensions: 1536,
    }),
  });
  const data = await res.json();
  return data.data?.[0]?.embedding ?? null;
}

// ─── Extraction via AI ───────────────────────────────────────────────────────

interface TemplateData {
  category: string;
  court_type: string;
  stage: string;
  title: string;
  key_arguments: string;
  prayer: string;
  legal_references: string;
}

const EXTRACT_PROMPT = `Ты — юридический аналитик. Проанализируй текст образца возражения и верни JSON.

Категории (выбери одну):
- debt (долг, кредит, ЖКХ, займ)
- alimony (алименты)
- divorce (расторжение брака)
- property (право собственности, раздел имущества, наследство)
- eviction (выселение, снятие с учёта)
- insurance_dtp (ДТП, страховое возмещение)
- labor (трудовые споры, восстановление на работе)
- damage (возмещение ущерба)
- other (другое)

Тип суда: general | arbitration | magistrate
Стадия: first_instance | appeal | cassation | supervisory

Верни строго JSON:
{
  "category": "...",
  "court_type": "...",
  "stage": "...",
  "title": "Краткое описание сути (1 предложение)",
  "key_arguments": "Ключевые доводы ответчика, каждый с новой строки начиная с '- '",
  "prayer": "Просительная часть дословно",
  "legal_references": "Упомянутые статьи законов через запятую или пустая строка"
}`;

async function extractTemplate(text: string): Promise<TemplateData | null> {
  const truncated = text.slice(0, 4000);
  const raw = await openAiChat([
    { role: 'system', content: EXTRACT_PROMPT },
    { role: 'user', content: truncated },
  ]);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as TemplateData;
  } catch {
    console.warn('  JSON parse error:', raw.slice(0, 200));
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Fetching index page...');
  const indexHtml = await fetchPage(OBJECTION_INDEX);
  const links = extractLinks(indexHtml, BASE_URL);
  console.log(`📋 Found ${links.length} template links`);

  let saved = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < links.length; i++) {
    const url = links[i];
    console.log(`\n[${i + 1}/${links.length}] ${url}`);

    try {
      // Check if already saved
      const { count } = await supabase
        .from('objection_templates')
        .select('*', { count: 'exact', head: true })
        .eq('source_url', url);

      if ((count ?? 0) > 0) {
        console.log('  ⏭ Already exists, skipping');
        skipped++;
        continue;
      }

      await sleep(1000); // polite delay

      const html = await fetchPage(url);
      const text = extractText(html);

      if (text.length < 100) {
        console.log('  ⚠ Text too short, skipping');
        skipped++;
        continue;
      }

      // Extract structured data via AI
      const template = await extractTemplate(text);
      if (!template) {
        console.log('  ❌ Failed to extract template');
        errors++;
        continue;
      }

      console.log(`  📁 Category: ${template.category} | Court: ${template.court_type} | Stage: ${template.stage}`);
      console.log(`  📝 ${template.title}`);

      // Generate embedding for: title + category + key_arguments
      const embeddingInput = `${template.title}\n${template.category}\n${template.key_arguments}`;
      const embedding = await generateEmbedding(embeddingInput);
      if (!embedding) {
        console.log('  ❌ Failed to generate embedding');
        errors++;
        continue;
      }

      // Save to Supabase
      const { error } = await supabase.from('objection_templates').insert({
        category: template.category,
        court_type: template.court_type,
        stage: template.stage,
        title: template.title,
        key_arguments: template.key_arguments,
        prayer: template.prayer,
        legal_references: template.legal_references || null,
        full_text: text.slice(0, 10000),
        embedding: JSON.stringify(embedding),
        source_url: url,
      });

      if (error) {
        console.log('  ❌ Supabase insert error:', error.message);
        errors++;
      } else {
        console.log('  ✅ Saved');
        saved++;
      }

      await sleep(500);
    } catch (err) {
      console.log('  ❌ Error:', err instanceof Error ? err.message : err);
      errors++;
    }
  }

  console.log('\n─────────────────────────────────');
  console.log(`✅ Saved:   ${saved}`);
  console.log(`⏭ Skipped: ${skipped}`);
  console.log(`❌ Errors:  ${errors}`);
  console.log(`📦 Total:   ${links.length}`);
}

main().catch(console.error);
