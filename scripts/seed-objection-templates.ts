/**
 * Seed-скрипт для таблицы objection_templates.
 *
 * Читает все *.json файлы из data/objection-templates/, генерирует embedding
 * для каждого (через OpenAI text-embedding-3-small) и делает UPSERT в Supabase
 * по ключу (category, title), чтобы повторный запуск не плодил дубли.
 *
 * Каждый JSON-файл должен содержать:
 *   {
 *     "category": "tax" | "debt" | "alimony" | "divorce" | "property" |
 *                 "eviction" | "insurance_dtp" | "insurance_other" |
 *                 "labor" | "inheritance" | "damage" | "other",
 *     "court_type": "general" | "arbitration" | "magistrate",   // default 'general'
 *     "stage": "first_instance" | "appeal" | "cassation" | "supervisory",
 *     "title": "Заголовок ситуации",
 *     "key_arguments": "Текст ключевых доводов (многострочный)",
 *     "prayer": "Просительная часть",
 *     "legal_references": "Ссылки на нормы права (опционально)"
 *   }
 *
 * Запуск:
 *   npx tsx scripts/seed-objection-templates.ts
 *
 * Переменные окружения (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Load .env.local manually (no dotenv dependency) ──────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY in .env.local (нужен для embeddings)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Types ────────────────────────────────────────────────────────────────────

interface ObjectionTemplateInput {
  category: string;
  court_type?: string;
  stage?: string;
  title: string;
  key_arguments: string;
  prayer: string;
  legal_references?: string;
  full_text?: string;
}

// ── OpenAI embedding ─────────────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const vec = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) {
    throw new Error('OpenAI response: no embedding vector');
  }
  return vec as number[];
}

// ── Upsert one template ──────────────────────────────────────────────────────

async function upsertTemplate(
  tpl: ObjectionTemplateInput,
  sourceFile: string,
): Promise<void> {
  if (!tpl.category || !tpl.title || !tpl.key_arguments || !tpl.prayer) {
    throw new Error(
      `[${sourceFile}] Missing required fields: category/title/key_arguments/prayer`,
    );
  }

  const courtType = tpl.court_type || 'general';
  const stage = tpl.stage || 'first_instance';

  console.log(`\n→ ${sourceFile}`);
  console.log(`  category=${tpl.category} court_type=${courtType} stage=${stage}`);
  console.log(`  title="${tpl.title.slice(0, 80)}${tpl.title.length > 80 ? '…' : ''}"`);

  // 1. Find existing by (category, title) — UPSERT on natural key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: selectErr } = await (supabase
    .from('objection_templates') as any)
    .select('id')
    .eq('category', tpl.category)
    .eq('title', tpl.title)
    .maybeSingle();

  if (selectErr) {
    throw new Error(`select failed: ${selectErr.message}`);
  }

  // 2. Generate embedding
  const embeddingInput = [tpl.title, tpl.category, tpl.key_arguments]
    .filter(Boolean)
    .join('\n');
  console.log(`  generating embedding (${embeddingInput.length} chars)…`);
  const embedding = await generateEmbedding(embeddingInput);
  console.log(`  embedding ok (dim=${embedding.length})`);

  const row = {
    category: tpl.category,
    court_type: courtType,
    stage,
    title: tpl.title,
    key_arguments: tpl.key_arguments,
    prayer: tpl.prayer,
    legal_references: tpl.legal_references ?? null,
    full_text: tpl.full_text ?? null,
    embedding: JSON.stringify(embedding),
    source_url: null as string | null,
  };

  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabase
      .from('objection_templates') as any)
      .update(row)
      .eq('id', existing.id);
    if (updErr) throw new Error(`update failed: ${updErr.message}`);
    console.log(`  ✓ UPDATED id=${existing.id}`);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ins, error: insErr } = await (supabase
      .from('objection_templates') as any)
      .insert(row)
      .select('id')
      .single();
    if (insErr) throw new Error(`insert failed: ${insErr.message}`);
    console.log(`  ✓ INSERTED id=${ins?.id}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dir = path.resolve(process.cwd(), 'data/objection-templates');
  if (!fs.existsSync(dir)) {
    console.error(`❌ Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.warn(`⚠️  No *.json files in ${dir}`);
    return;
  }

  console.log(`Found ${files.length} template file(s) in ${dir}`);

  let ok = 0;
  let failed = 0;
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const raw = fs.readFileSync(full, 'utf-8');
      const tpl = JSON.parse(raw) as ObjectionTemplateInput;
      await upsertTemplate(tpl, file);
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ✗ FAILED ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone. ok=${ok} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
