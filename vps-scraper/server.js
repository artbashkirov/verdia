const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.SCRAPER_API_KEY || 'your-secret-key-here';

// Файл для кэша
const CACHE_FILE = '/opt/verdia-scraper/cache.json';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа

app.use(cors());
app.use(express.json());

// Загрузка кэша
let cache = {};
try {
  if (fs.existsSync(CACHE_FILE)) {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log('Cache loaded:', Object.keys(cache).length, 'entries');
  }
} catch (e) {
  console.log('No cache file, starting fresh');
}

// Сохранение кэша
function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('Failed to save cache:', e.message);
  }
}

const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

app.get('/health', (req, res) => res.json({ status: 'ok', cacheSize: Object.keys(cache).length }));

// Определение результата из полного текста решения
function detectResult(text) {
  const t = text.toLowerCase();
  
  // Ищем в конце документа (резолютивная часть)
  const lastPart = t.slice(-3000);
  
  // Частично удовлетворен
  if (lastPart.includes('частично удовлетворить') || lastPart.includes('удовлетворить частично') || 
      lastPart.includes('частично удовлетворены') || lastPart.includes('удовлетворены частично') ||
      lastPart.includes('удовлетворить в части')) {
    return 'частично удовлетворен';
  }
  
  // Отказано
  if (lastPart.includes('в иске отказать') || lastPart.includes('в удовлетворении отказать') || 
      lastPart.includes('в удовлетворении иска отказать') || lastPart.includes('в иске отказано') ||
      lastPart.includes('в удовлетворении отказано') || lastPart.includes('оставить без удовлетворения') ||
      lastPart.includes('исковые требования оставить без удовлетворения') ||
      lastPart.includes('не подлежит удовлетворению') || lastPart.includes('отказать в удовлетворении')) {
    return 'отказано';
  }
  
  // Удовлетворен
  if (lastPart.includes('иск удовлетворить') || lastPart.includes('исковые требования удовлетворить') || 
      lastPart.includes('удовлетворить исковые требования') || lastPart.includes('удовлетворить иск') ||
      lastPart.includes('взыскать с ответчика') || lastPart.includes('взыскать в пользу истца') ||
      lastPart.includes('иск удовлетворен') || lastPart.includes('требования удовлетворены') ||
      lastPart.includes('исковые требования подлежат удовлетворению')) {
    return 'удовлетворен';
  }
  
  return 'неизвестно';
}

// Получить кэшированный результат или null
function getCached(searchTerms) {
  const key = searchTerms.toLowerCase().trim();
  const cached = cache[key];
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log('Cache HIT for:', key);
    return cached.data;
  }
  return null;
}

// Сохранить в кэш
function setCache(searchTerms, data) {
  const key = searchTerms.toLowerCase().trim();
  cache[key] = { data, timestamp: Date.now() };
  saveCache();
  console.log('Cached:', key);
}

// ПОЛНЫЙ скрапинг с открытием каждой страницы
app.post('/scrape/sudact', authMiddleware, async (req, res) => {
  const { searchTerms, maxResults = 5 } = req.body;
  if (!searchTerms) return res.status(400).json({ error: 'searchTerms required' });
  
  // Проверяем кэш
  const cached = getCached(searchTerms);
  if (cached) {
    return res.json(cached);
  }
  
  let browser;
  const startTime = Date.now();
  
  try {
    console.log('Scraping for:', searchTerms);
    
    browser = await puppeteer.launch({ 
      headless: 'new', 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0');
    
    // Блокируем картинки и стили для скорости
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    const searchUrl = 'https://sudact.ru/regular/doc/?regular-txt=' + encodeURIComponent(searchTerms) + '&regular-area=1011';
    console.log('Opening search page...');
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    try { 
      await page.waitForSelector('#docListContainer li h4 a', { timeout: 8000 }); 
    } catch { 
      console.log('No results found');
      const emptyResult = { cases: [], stats: { total: 0, satisfied: 0, partial: 0, rejected: 0, percentage: 0 } };
      setCache(searchTerms, emptyResult);
      return res.json(emptyResult); 
    }
    
    // Собираем ссылки на дела
    const caseLinks = await page.evaluate((limit) => {
      const results = [];
      const items = document.querySelectorAll('#docListContainer li');
      
      items.forEach((item, i) => {
        if (i >= limit) return;
        const link = item.querySelector('h4 a');
        if (!link) return;
        const title = link.textContent?.trim() || '';
        const href = link.getAttribute('href') || '';
        if (!title || !href) return;
        
        let court = '';
        const courtEl = item.querySelector('h4')?.nextElementSibling;
        if (courtEl) court = courtEl.textContent?.trim() || '';
        
        results.push({ 
          title: title.slice(0, 200), 
          url: href.startsWith('http') ? href : 'https://sudact.ru' + href,
          court
        });
      });
      return results;
    }, maxResults);
    
    console.log('Found', caseLinks.length, 'cases, opening each to get verdict...');
    
    // Открываем каждое дело и определяем результат
    const cases = [];
    let satisfied = 0, partial = 0, rejected = 0;
    
    for (let i = 0; i < caseLinks.length; i++) {
      const caseInfo = caseLinks[i];
      let result = 'неизвестно';
      
      try {
        console.log(`Opening case ${i + 1}/${caseLinks.length}: ${caseInfo.title.slice(0, 50)}...`);
        await page.goto(caseInfo.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Ждем загрузки контента
        await page.waitForSelector('.b-doc-content, .doc-content, article', { timeout: 5000 }).catch(() => {});
        
        // Извлекаем текст решения
        const fullText = await page.evaluate(() => {
          const content = document.querySelector('.b-doc-content, .doc-content, article, main');
          return content ? content.textContent : document.body.textContent;
        });
        
        if (fullText && fullText.length > 500) {
          result = detectResult(fullText);
        }
        
        console.log(`  Result: ${result}`);
        
      } catch (e) {
        console.log(`  Error opening case: ${e.message}`);
      }
      
      if (result === 'удовлетворен') satisfied++;
      else if (result === 'частично удовлетворен') partial++;
      else if (result === 'отказано') rejected++;
      
      cases.push({
        title: caseInfo.title,
        url: caseInfo.url,
        court: caseInfo.court,
        snippet: 'Судебное решение - ' + (caseInfo.court || 'суд'),
        result,
        isSearchLink: false
      });
    }
    
    const totalWithResult = satisfied + partial + rejected;
    const percentage = totalWithResult > 0 
      ? Math.round(((satisfied + partial * 0.5) / totalWithResult) * 100) 
      : 0; // 0 если нет данных, а не 65
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`Done in ${duration}s. Stats: ${satisfied} satisfied, ${partial} partial, ${rejected} rejected = ${percentage}%`);
    
    const response = { 
      cases, 
      stats: { 
        total: cases.length, 
        satisfied, 
        partial, 
        rejected, 
        percentage,
        hasData: totalWithResult > 0
      } 
    };
    
    // Кэшируем результат
    setCache(searchTerms, response);
    
    res.json(response);
    
  } catch (e) { 
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message }); 
  } finally { 
    if (browser) await browser.close(); 
  }
});

// Очистка кэша
app.post('/cache/clear', authMiddleware, (req, res) => {
  cache = {};
  saveCache();
  res.json({ status: 'ok', message: 'Cache cleared' });
});

// Статистика кэша
app.get('/cache/stats', authMiddleware, (req, res) => {
  const entries = Object.keys(cache).length;
  const oldestEntry = Object.values(cache).reduce((min, c) => Math.min(min, c.timestamp), Date.now());
  res.json({ 
    entries, 
    oldestAge: Math.round((Date.now() - oldestEntry) / 1000 / 60) + ' minutes'
  });
});

app.listen(PORT, '0.0.0.0', () => console.log('Scraper running on port ' + PORT));
