/**
 * RAG (Retrieval-Augmented Generation) модуль для Verdia
 * 
 * Семантический поиск по базе законодательства РФ в Supabase pgvector.
 * Используется для обогащения промптов AI точными текстами статей закона.
 */

import { createClient } from '@supabase/supabase-js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export interface LawArticleMatch {
  id: string;
  code_slug: string;
  code_name: string;
  article_number: string;
  article_title: string;
  section_path: string | null;
  content_chunk: string;
  source_url: string | null;
  similarity: number;
}

let supabaseAdmin: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn('[RAG] SUPABASE_SERVICE_ROLE_KEY not configured, RAG disabled');
    return null;
  }

  supabaseAdmin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return supabaseAdmin;
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[RAG] OPENAI_API_KEY not configured, cannot generate embeddings');
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      console.error('[RAG] OpenAI embedding error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('[RAG] Embedding generation failed:', error);
    return null;
  }
}

/**
 * Поиск релевантных статей законодательства по запросу пользователя
 */
export async function searchLawArticles(
  query: string,
  options: {
    matchCount?: number;
    matchThreshold?: number;
    codeSlug?: string;
  } = {}
): Promise<LawArticleMatch[]> {
  const { matchCount = 5, matchThreshold = 0.3, codeSlug } = options;

  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const embedding = await generateEmbedding(query);
  if (!embedding) return [];

  try {
    const functionName = codeSlug ? 'match_law_articles_by_code' : 'match_law_articles';
    const params: Record<string, unknown> = {
      query_embedding: JSON.stringify(embedding),
      match_threshold: matchThreshold,
      match_count: matchCount,
    };

    if (codeSlug) {
      params.target_code_slug = codeSlug;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(functionName, params);

    if (error) {
      console.error('[RAG] Vector search error:', error.message);
      return [];
    }

    return (data || []) as LawArticleMatch[];
  } catch (error) {
    console.error('[RAG] Search failed:', error);
    return [];
  }
}

/**
 * Форматирует найденные статьи в контекст для промпта AI
 */
export function formatLawContext(articles: LawArticleMatch[]): string {
  if (articles.length === 0) return '';

  const lines = ['\n\nРЕЛЕВАНТНЫЕ СТАТЬИ ЗАКОНОДАТЕЛЬСТВА (из базы данных):'];

  for (const article of articles) {
    lines.push(`\n--- ${article.code_name}, ст. ${article.article_number}. ${article.article_title} ---`);
    if (article.section_path) {
      lines.push(`[${article.section_path}]`);
    }
    lines.push(article.content_chunk);
    if (article.source_url) {
      lines.push(`Источник: ${article.source_url}`);
    }
  }

  lines.push('\nВАЖНО: Используй тексты статей выше для точных цитат. Не выдумывай содержание статей.');

  return lines.join('\n');
}

/**
 * Полный RAG pipeline: поиск + форматирование
 * Возвращает контекст для добавления в промпт AI
 */
export async function getLawContext(
  query: string,
  options?: {
    matchCount?: number;
    matchThreshold?: number;
    codeSlug?: string;
  }
): Promise<{ context: string; articles: LawArticleMatch[] }> {
  const articles = await searchLawArticles(query, options);
  const context = formatLawContext(articles);

  if (articles.length > 0) {
    console.log(`[RAG] Found ${articles.length} relevant articles:`);
    articles.forEach(a => {
      console.log(`  - ${a.code_name}, ст. ${a.article_number} (similarity: ${a.similarity.toFixed(3)})`);
    });
  } else {
    console.log('[RAG] No relevant articles found');
  }

  return { context, articles };
}

// ─── Objection Templates ─────────────────────────────────────────────────────

export interface ObjectionTemplateMatch {
  id: string;
  category: string;
  court_type: string;
  stage: string;
  title: string;
  key_arguments: string;
  prayer: string;
  legal_references: string | null;
  similarity: number;
}

/**
 * Поиск похожих образцов возражений (few-shot context для генерации)
 */
export async function searchObjectionTemplates(
  query: string,
  options: {
    matchCount?: number;
    matchThreshold?: number;
    category?: string;
  } = {}
): Promise<ObjectionTemplateMatch[]> {
  const { matchCount = 3, matchThreshold = 0.3, category } = options;

  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const embedding = await generateEmbedding(query);
  if (!embedding) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('match_objection_templates', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_category: category ?? null,
    });

    if (error) {
      console.error('[RAG] Template search error:', error.message);
      return [];
    }

    return (data || []) as ObjectionTemplateMatch[];
  } catch (error) {
    console.error('[RAG] Template search failed:', error);
    return [];
  }
}

/**
 * Форматирует найденные шаблоны как few-shot контекст для промпта генерации
 */
export function formatTemplatesContext(templates: ObjectionTemplateMatch[]): string {
  if (templates.length === 0) return '';

  const lines = ['\n\nПОХОЖИЕ ОБРАЗЦЫ ВОЗРАЖЕНИЙ (используй как ориентир структуры и доводов, не копируй дословно):'];

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    lines.push(`\n--- Образец ${i + 1}: ${t.title} ---`);
    lines.push(`Категория: ${t.category} | Суд: ${t.court_type} | Стадия: ${t.stage}`);
    lines.push('Ключевые доводы:');
    lines.push(t.key_arguments);
    lines.push(`Просительная часть: ${t.prayer}`);
    if (t.legal_references) {
      lines.push(`Нормы права: ${t.legal_references}`);
    }
  }

  lines.push('\nВАЖНО: Это только ориентиры. Адаптируй доводы под конкретные факты дела. Не копируй формулировки дословно.');

  return lines.join('\n');
}

/**
 * Полный pipeline поиска шаблонов + форматирование
 */
export async function getTemplatesContext(
  query: string,
  options?: { matchCount?: number; matchThreshold?: number; category?: string }
): Promise<{ context: string; templates: ObjectionTemplateMatch[] }> {
  const templates = await searchObjectionTemplates(query, options);
  const context = formatTemplatesContext(templates);

  if (templates.length > 0) {
    console.log(`[RAG] Found ${templates.length} similar objection templates`);
  }

  return { context, templates };
}

// ─── System Health ────────────────────────────────────────────────────────────

/**
 * Проверяет, доступна ли RAG-система (есть ли данные в базе)
 */
export async function isRagAvailable(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  if (!process.env.OPENAI_API_KEY) return false;

  try {
    const { count, error } = await supabase
      .from('law_articles')
      .select('*', { count: 'exact', head: true });

    if (error) return false;
    return (count || 0) > 0;
  } catch {
    return false;
  }
}
