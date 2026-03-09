#!/usr/bin/env node

/**
 * Скрапер законодательства с sudact.ru
 * Парсит кодексы РФ и сохраняет статьи в JSON для последующей загрузки в Supabase
 * 
 * Запуск: node scripts/scrape-laws.mjs [--code gk-rf-chast1] [--output data/laws]
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'https://sudact.ru';

// VPS proxy for fetching pages (sudact.ru may be inaccessible locally)
const VPS_SCRAPER_URL = process.env.VPS_SCRAPER_URL || 'http://193.227.240.206:3001';
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || 'verdia_scraper_2026_secret_xyz789';

const CODES = [
  { slug: 'gk-rf-chast1', name: 'Гражданский кодекс РФ (часть 1)', path: '/law/gk-rf-chast1/' },
  { slug: 'gk-rf-chast2', name: 'Гражданский кодекс РФ (часть 2)', path: '/law/gk-rf-chast2/' },
  { slug: 'gk-rf-chast3', name: 'Гражданский кодекс РФ (часть 3)', path: '/law/gk-rf-chast3/' },
  { slug: 'gk-rf-chast4', name: 'Гражданский кодекс РФ (часть 4)', path: '/law/gk-rf-chast4/' },
  { slug: 'gpk-rf', name: 'Гражданский процессуальный кодекс РФ', path: '/law/gpk-rf/' },
  { slug: 'tk-rf', name: 'Трудовой кодекс РФ', path: '/law/tk-rf/' },
  { slug: 'sk-rf', name: 'Семейный кодекс РФ', path: '/law/sk-rf/' },
  { slug: 'zhk-rf', name: 'Жилищный кодекс РФ', path: '/law/zhk-rf/' },
  { slug: 'koap', name: 'КоАП РФ', path: '/law/koap/' },
  { slug: 'zemelnyi-kodeks', name: 'Земельный кодекс РФ', path: '/law/zemelnyi-kodeks/' },
  { slug: 'nk-rf-chast1', name: 'Налоговый кодекс РФ (часть 1)', path: '/law/nk-rf-chast1/' },
  { slug: 'nk-rf-chast2', name: 'Налоговый кодекс РФ (часть 2)', path: '/law/nk-rf-chast2/' },
  { slug: 'konstitutsiia', name: 'Конституция РФ', path: '/law/konstitutsiia/' },
  // Популярные ФЗ
  { slug: 'zpp', name: 'Закон о защите прав потребителей', path: '/law/zakon-rf-ot-07021992-n-2300-1-o/' },
  { slug: 'fz-bankrotstvo', name: 'ФЗ о несостоятельности (банкротстве)', path: '/law/federalnyi-zakon-ot-26102002-n-127-fz-o/' },
  { slug: 'fz-ispolnit', name: 'ФЗ об исполнительном производстве', path: '/law/federalnyi-zakon-ot-02102007-n-229-fz-ob/' },
  { slug: 'fz-osago', name: 'ФЗ об ОСАГО', path: '/law/federalnyi-zakon-ot-25042002-n-40-fz-s/' },
];

const DELAY_MS = 1500;
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPageDirect(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.5',
        },
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt < retries) await sleep(DELAY_MS * attempt);
    }
  }
  return null;
}

async function fetchPageViaVps(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(`${VPS_SCRAPER_URL}/fetch-page`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': SCRAPER_API_KEY,
        },
        body: JSON.stringify({ url }),
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`VPS proxy HTTP ${response.status}`);
      const data = await response.json();
      return data.html || data.content || null;
    } catch (error) {
      console.error(`  VPS proxy attempt ${attempt}/${retries}: ${error.message}`);
      if (attempt < retries) await sleep(DELAY_MS * attempt);
    }
  }
  return null;
}

async function fetchPage(url, retries = MAX_RETRIES) {
  // Try direct first, fall back to VPS proxy
  console.log(`  Fetching: ${url.replace(BASE_URL, '')}`);
  let html = await fetchPageDirect(url, 1);
  if (html) return html;
  
  console.log(`  Direct fetch failed, trying VPS proxy...`);
  html = await fetchPageViaVps(url, retries);
  return html;
}

/**
 * Парсит страницу оглавления кодекса и извлекает URL всех статей
 */
function parseTableOfContents(html, codePath) {
  const articles = [];
  // Match all article links: /law/code-slug/.../statia-NUMBER/
  const linkRegex = /href="(\/law\/[^"]*\/statia-[^"]*\/)"/g;
  let match;
  const seen = new Set();
  
  while ((match = linkRegex.exec(html)) !== null) {
    const path = match[1];
    if (seen.has(path)) continue;
    seen.add(path);
    
    // Extract article number from URL
    const numMatch = path.match(/statia-([^/]+)\/?$/);
    if (numMatch) {
      articles.push({
        path,
        url: `${BASE_URL}${path}`,
        articleNum: numMatch[1].replace(/_\d+$/, '').replace(/_/g, '.'),
      });
    }
  }
  
  return articles;
}

/**
 * Убирает HTML-теги и преобразует в чистый текст
 */
function htmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Парсит страницу отдельной статьи и извлекает текст
 */
function parseArticlePage(rawHtml, articleNum) {
  const text = htmlToText(rawHtml);
  
  // Find article title
  let title = '';
  const escapedNum = articleNum.replace('.', '\\.');
  const titleMatch = text.match(
    new RegExp(`Статья\\s+${escapedNum}[^.]*\\.\\s*([^\\n.]+)`, 'i')
  );
  if (titleMatch) {
    title = titleMatch[1].trim().replace(/\s+/g, ' ');
  }
  
  let content = '';
  
  // Find the article text between its heading and "Судебная практика" or next article link
  const headingPattern = new RegExp(
    `Статья\\s+${escapedNum}[^\\n]*\\n`,
    'i'
  );
  const headingMatch = text.match(headingPattern);
  
  if (headingMatch) {
    const startIdx = headingMatch.index + headingMatch[0].length;
    
    const endMarkers = [
      'Судебная практика по статье',
      'Судебная практика',
      '← Статья',
      'Страницы←',
    ];
    
    let endIdx = text.length;
    for (const marker of endMarkers) {
      const idx = text.indexOf(marker, startIdx);
      if (idx !== -1 && idx < endIdx) {
        endIdx = idx;
      }
    }
    
    content = text.substring(startIdx, endIdx);
  }
  
  if (!content) {
    // Fallback: find numbered paragraphs that look like law text
    const paragraphs = [];
    const pRegex = /^(\d+)\.\s+(.+)/gm;
    let pMatch;
    while ((pMatch = pRegex.exec(text)) !== null) {
      if (pMatch[2].includes('Решение №') || pMatch[2].includes('районный суд')) continue;
      paragraphs.push(pMatch[0]);
    }
    if (paragraphs.length > 0) {
      content = paragraphs.join('\n\n');
    }
  }
  
  // Clean up
  content = content
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\|.*\|$/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/Свернуть все[\s\S]*?Развернуть/g, '')
    .replace(/Найти\s*[∨∧]/g, '')
    .replace(/Отправить на e-mail[\s\S]*$/g, '')
    .trim();
  
  // Extract section path
  let sectionPath = '';
  const sectionParts = [];
  const sectionPatterns = [
    /(?:^|\n)(Раздел\s+[IVXLC]+[^.\n]*)/g,
    /(?:^|\n)(Подраздел\s+\d+[^.\n]*)/g,
    /(?:^|\n)(Глава\s+\d+[^.\n]*)/g,
  ];
  for (const regex of sectionPatterns) {
    let sMatch;
    while ((sMatch = regex.exec(rawHtml)) !== null) {
      const part = htmlToText(sMatch[1]).trim();
      if (part && !sectionParts.includes(part) && part.length < 200) {
        sectionParts.push(part);
      }
    }
  }
  // Also try from link text
  const linkSectionRegex = />(Раздел[^<]+|Подраздел[^<]+|Глава[^<]+)</g;
  let lsMatch;
  while ((lsMatch = linkSectionRegex.exec(rawHtml)) !== null) {
    const part = lsMatch[1].trim();
    if (part && !sectionParts.includes(part) && part.length < 200) {
      sectionParts.push(part);
    }
  }
  if (sectionParts.length > 0) {
    sectionPath = sectionParts.slice(0, 3).join(' > ');
  }
  
  return { title, content, sectionPath };
}

/**
 * Нарезает текст на чанки по ~800 токенов (~3200 символов)
 * Разбивает по пунктам статьи (1., 2., 3. ...) или по абзацам
 */
function chunkContent(content, maxChars = 1500) {
  if (content.length <= maxChars) {
    return [content];
  }
  
  const chunks = [];
  // Try to split by numbered paragraphs first
  const paragraphs = content.split(/\n(?=\d+\.\s)/);
  
  let currentChunk = '';
  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + para;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [content];
}

async function scrapeCode(code, outputDir) {
  console.log(`\n📖 Скрапинг: ${code.name} (${code.slug})`);
  console.log(`   URL: ${BASE_URL}${code.path}`);
  
  const outputFile = join(outputDir, `${code.slug}.json`);
  
  // Check if already scraped
  if (existsSync(outputFile)) {
    try {
      const existing = JSON.parse(readFileSync(outputFile, 'utf8'));
      if (existing.articles && existing.articles.length > 0) {
        console.log(`   ⏭  Уже загружено (${existing.articles.length} статей). Пропускаю.`);
        console.log(`   Для повторного скрапинга удалите файл: ${outputFile}`);
        return existing.articles;
      }
    } catch { /* file corrupted, re-scrape */ }
  }
  
  // Step 1: Get table of contents
  const tocHtml = await fetchPage(`${BASE_URL}${code.path}`);
  if (!tocHtml) {
    console.error(`   ❌ Не удалось загрузить оглавление`);
    return [];
  }
  
  const articleLinks = parseTableOfContents(tocHtml, code.path);
  console.log(`   📋 Найдено ${articleLinks.length} статей`);
  
  if (articleLinks.length === 0) {
    console.error(`   ⚠️  Статьи не найдены. Возможно, структура страницы изменилась.`);
    return [];
  }
  
  // Step 2: Scrape each article
  const articles = [];
  let scraped = 0;
  let failed = 0;
  
  for (const link of articleLinks) {
    await sleep(DELAY_MS);
    
    const html = await fetchPage(link.url);
    if (!html) {
      failed++;
      continue;
    }
    
    const { title, content, sectionPath } = parseArticlePage(html, link.articleNum);
    
    if (!content || content.length < 20) {
      console.log(`   ⚠️  Ст. ${link.articleNum}: пустое содержимое, пропускаю`);
      failed++;
      continue;
    }
    
    const chunks = chunkContent(content);
    
    for (let i = 0; i < chunks.length; i++) {
      articles.push({
        code_slug: code.slug,
        code_name: code.name,
        article_number: link.articleNum,
        article_title: title || `Статья ${link.articleNum}`,
        section_path: sectionPath,
        content: content,
        content_chunk: chunks[i],
        chunk_index: i,
        source_url: link.url,
      });
    }
    
    scraped++;
    if (scraped % 20 === 0) {
      console.log(`   📄 ${scraped}/${articleLinks.length} статей обработано...`);
    }
  }
  
  console.log(`   ✅ Готово: ${scraped} статей, ${articles.length} чанков, ${failed} ошибок`);
  
  // Save to file
  writeFileSync(outputFile, JSON.stringify({ 
    code: code.slug,
    name: code.name,
    scraped_at: new Date().toISOString(),
    total_articles: scraped,
    total_chunks: articles.length,
    articles 
  }, null, 2));
  console.log(`   💾 Сохранено: ${outputFile}`);
  
  return articles;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let targetCode = null;
  let outputDir = join(__dirname, '..', 'data', 'laws');
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--code' && args[i + 1]) {
      targetCode = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    }
  }
  
  // Create output directory
  mkdirSync(outputDir, { recursive: true });
  
  console.log('🏛️  Скрапер законодательства sudact.ru');
  console.log(`📂 Выходная директория: ${outputDir}`);
  
  const codesToScrape = targetCode 
    ? CODES.filter(c => c.slug === targetCode)
    : CODES;
  
  if (codesToScrape.length === 0) {
    console.error(`❌ Кодекс "${targetCode}" не найден. Доступные:`);
    CODES.forEach(c => console.log(`   - ${c.slug}: ${c.name}`));
    process.exit(1);
  }
  
  console.log(`📚 Кодексов к обработке: ${codesToScrape.length}`);
  
  let totalArticles = 0;
  let totalChunks = 0;
  
  for (const code of codesToScrape) {
    const articles = await scrapeCode(code, outputDir);
    totalArticles += new Set(articles.map(a => `${a.code_slug}:${a.article_number}`)).size;
    totalChunks += articles.length;
  }
  
  console.log(`\n🎉 Итого: ${totalArticles} статей, ${totalChunks} чанков`);
  console.log(`\nСледующий шаг: node scripts/index-laws.mjs`);
}

main().catch(console.error);
