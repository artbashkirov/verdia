#!/usr/bin/env node

/**
 * Индексация законодательства: генерация embeddings и загрузка в Supabase pgvector
 * 
 * Читает JSON-файлы из data/laws/, генерирует embeddings через OpenAI,
 * и загружает в таблицу law_articles в Supabase.
 * 
 * Запуск: node scripts/index-laws.mjs [--code gk-rf-chast1] [--batch-size 50]
 * 
 * Требования:
 *   - OPENAI_API_KEY в .env.local (для embeddings)
 *   - NEXT_PUBLIC_SUPABASE_URL в .env.local
 *   - SUPABASE_SERVICE_ROLE_KEY в .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars from .env.local
const envPath = join(__dirname, '..', '.env.local');
const envVars = {};

try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  });
} catch {
  console.error('❌ Не удалось прочитать .env.local');
  process.exit(1);
}

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = envVars.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY обязательны в .env.local');
  process.exit(1);
}

if (!OPENAI_KEY) {
  console.error('❌ OPENAI_API_KEY обязателен в .env.local (для генерации embeddings)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Генерирует embeddings через OpenAI API
 * Батчит до 2048 inputs за раз (лимит OpenAI)
 */
async function generateEmbeddings(texts, batchSize = 100) {
  const allEmbeddings = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} ${JSON.stringify(error)}`);
    }
    
    const data = await response.json();
    const embeddings = data.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
    
    allEmbeddings.push(...embeddings);
    
    if (i + batchSize < texts.length) {
      process.stdout.write(`  Embeddings: ${allEmbeddings.length}/${texts.length}\r`);
      await sleep(200);
    }
  }
  
  console.log(`  Embeddings: ${allEmbeddings.length}/${texts.length} ✅`);
  return allEmbeddings;
}

/**
 * Формирует текст для embedding: заголовок + контекст + содержимое
 * Это помогает получить более точные результаты поиска
 */
function buildEmbeddingText(article) {
  const parts = [];
  
  parts.push(`${article.code_name}`);
  
  if (article.section_path) {
    parts.push(article.section_path);
  }
  
  parts.push(`Статья ${article.article_number}. ${article.article_title}`);
  parts.push(article.content_chunk);
  
  return parts.join('\n');
}

async function indexCode(codeSlug, dataDir, batchSize) {
  const filePath = join(dataDir, `${codeSlug}.json`);
  
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    console.error(`  ❌ Файл не найден: ${filePath}`);
    return { indexed: 0, skipped: 0 };
  }
  
  const articles = data.articles;
  if (!articles || articles.length === 0) {
    console.log(`  ⚠️  Нет статей в файле`);
    return { indexed: 0, skipped: 0 };
  }
  
  console.log(`  📄 ${articles.length} чанков из ${data.total_articles} статей`);
  
  // Check what's already indexed
  const { data: existing } = await supabase
    .from('law_articles')
    .select('article_number, chunk_index')
    .eq('code_slug', codeSlug);
  
  const existingSet = new Set(
    (existing || []).map(e => `${e.article_number}:${e.chunk_index}`)
  );
  
  const toIndex = articles.filter(
    a => !existingSet.has(`${a.article_number}:${a.chunk_index}`)
  );
  
  if (toIndex.length === 0) {
    console.log(`  ⏭  Все ${articles.length} чанков уже проиндексированы`);
    return { indexed: 0, skipped: articles.length };
  }
  
  console.log(`  🆕 ${toIndex.length} новых чанков (${existingSet.size} уже есть)`);
  
  // Generate embeddings
  const textsForEmbedding = toIndex.map(buildEmbeddingText);
  
  let embeddings;
  try {
    embeddings = await generateEmbeddings(textsForEmbedding, batchSize);
  } catch (error) {
    console.error(`  ❌ Ошибка генерации embeddings: ${error.message}`);
    return { indexed: 0, skipped: existingSet.size };
  }
  
  // Upload to Supabase in batches
  let uploaded = 0;
  const uploadBatchSize = 50;
  
  for (let i = 0; i < toIndex.length; i += uploadBatchSize) {
    const batch = toIndex.slice(i, i + uploadBatchSize);
    const batchEmbeddings = embeddings.slice(i, i + uploadBatchSize);
    
    const rows = batch.map((article, j) => ({
      code_slug: article.code_slug,
      code_name: article.code_name,
      article_number: article.article_number,
      article_title: article.article_title,
      section_path: article.section_path || null,
      content: article.content,
      content_chunk: article.content_chunk,
      chunk_index: article.chunk_index,
      embedding: JSON.stringify(batchEmbeddings[j]),
      source_url: article.source_url,
    }));
    
    const { error } = await supabase
      .from('law_articles')
      .upsert(rows, { 
        onConflict: 'code_slug,article_number,chunk_index',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error(`  ❌ Ошибка загрузки батча: ${error.message}`);
      continue;
    }
    
    uploaded += batch.length;
    process.stdout.write(`  Загружено: ${uploaded}/${toIndex.length}\r`);
  }
  
  console.log(`  ✅ Загружено: ${uploaded}/${toIndex.length}`);
  return { indexed: uploaded, skipped: existingSet.size };
}

async function main() {
  const args = process.argv.slice(2);
  
  let targetCode = null;
  let batchSize = 50;
  const dataDir = join(__dirname, '..', 'data', 'laws');
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--code' && args[i + 1]) {
      targetCode = args[i + 1];
      i++;
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      batchSize = parseInt(args[i + 1]);
      i++;
    }
  }
  
  console.log('🔍 Индексация законодательства в Supabase pgvector');
  console.log(`📂 Директория данных: ${dataDir}`);
  console.log(`🧠 Модель embeddings: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS}d)`);
  
  // Get list of available code files
  let codeFiles;
  try {
    codeFiles = readdirSync(dataDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    console.error(`❌ Директория ${dataDir} не найдена. Сначала запустите: node scripts/scrape-laws.mjs`);
    process.exit(1);
  }
  
  if (targetCode) {
    codeFiles = codeFiles.filter(f => f === targetCode);
    if (codeFiles.length === 0) {
      console.error(`❌ Файл для кодекса "${targetCode}" не найден`);
      process.exit(1);
    }
  }
  
  console.log(`📚 Кодексов к индексации: ${codeFiles.length}\n`);
  
  let totalIndexed = 0;
  let totalSkipped = 0;
  
  for (const code of codeFiles) {
    console.log(`\n📖 ${code}`);
    const { indexed, skipped } = await indexCode(code, dataDir, batchSize);
    totalIndexed += indexed;
    totalSkipped += skipped;
  }
  
  console.log(`\n🎉 Итого: ${totalIndexed} проиндексировано, ${totalSkipped} пропущено`);
  
  // Check total count
  const { count } = await supabase
    .from('law_articles')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 Всего в базе: ${count} записей`);
}

main().catch(console.error);
