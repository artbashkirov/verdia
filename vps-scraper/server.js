const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.SCRAPER_API_KEY || 'verdia_scraper_2026_secret_xyz789';

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

// УЛУЧШЕННОЕ определение результата из полного текста решения
function detectResult(text) {
  if (!text || text.length < 100) {
    return 'неизвестно';
  }
  
  const t = text.toLowerCase();
  
  // Ищем в конце документа (резолютивная часть) - последние 5000 символов
  const lastPart = t.slice(-5000);
  
  // Также проверяем весь текст для более надёжного определения
  const fullText = t;
  
  // === ЧАСТИЧНО УДОВЛЕТВОРЕН ===
  const partialPatterns = [
    'частично удовлетворить',
    'удовлетворить частично',
    'частично удовлетворены',
    'удовлетворены частично',
    'удовлетворить в части',
    'исковые требования удовлетворить частично',
    'иск удовлетворить частично',
    'требования истца удовлетворить частично',
    'удовлетворить исковые требования частично',
    'удовлетворить иск частично',
    'исковые требования подлежат частичному удовлетворению',
    'частичному удовлетворению',
  ];
  
  for (const pattern of partialPatterns) {
    if (lastPart.includes(pattern)) {
      return 'частично удовлетворен';
    }
  }
  
  // === ОТКАЗАНО ===
  const rejectedPatterns = [
    'в иске отказать',
    'в удовлетворении отказать',
    'в удовлетворении иска отказать',
    'в иске отказано',
    'в удовлетворении отказано',
    'оставить без удовлетворения',
    'исковые требования оставить без удовлетворения',
    'не подлежит удовлетворению',
    'отказать в удовлетворении',
    'в удовлетворении исковых требований отказать',
    'в удовлетворении требований отказать',
    'исковые требования не подлежат удовлетворению',
    'в иске к ответчику отказать',
    'отказать в иске',
    'иск оставить без удовлетворения',
    'требования истца оставить без удовлетворения',
    'исковое заявление оставить без удовлетворения',
    'решил: в иске отказать',
    'решил: отказать',
    'р е ш и л : в иске отказать',
    'р е ш и л : отказать',
  ];
  
  for (const pattern of rejectedPatterns) {
    if (lastPart.includes(pattern)) {
      return 'отказано';
    }
  }
  
  // === УДОВЛЕТВОРЕН ===
  const satisfiedPatterns = [
    'иск удовлетворить',
    'исковые требования удовлетворить',
    'удовлетворить исковые требования',
    'удовлетворить иск',
    'иск удовлетворен',
    'требования удовлетворены',
    'исковые требования подлежат удовлетворению',
    'требования истца удовлетворить',
    'взыскать с ответчика',
    'взыскать в пользу истца',
    'обязать ответчика',
    'признать право истца',
    'решил: взыскать',
    'решил: удовлетворить',
    'р е ш и л : взыскать',
    'р е ш и л : удовлетворить',
    'исковое заявление удовлетворить',
    'заявленные требования удовлетворить',
  ];
  
  for (const pattern of satisfiedPatterns) {
    if (lastPart.includes(pattern)) {
      // Дополнительная проверка - не было ли это отказом
      const contextStart = lastPart.indexOf(pattern);
      const context = lastPart.slice(Math.max(0, contextStart - 50), contextStart + pattern.length + 50);
      if (!context.includes('отказ') && !context.includes('не подлежит')) {
        return 'удовлетворен';
      }
    }
  }
  
  // === ДОПОЛНИТЕЛЬНЫЕ ПРОВЕРКИ ПО ВСЕМУ ТЕКСТУ ===
  // Ищем резолютивную часть
  const resolutionMarkers = ['р е ш и л', 'решил:', 'суд решил', 'решение'];
  let resolutionStart = -1;
  
  for (const marker of resolutionMarkers) {
    const idx = fullText.lastIndexOf(marker);
    if (idx > fullText.length - 3000 && idx > resolutionStart) {
      resolutionStart = idx;
    }
  }
  
  if (resolutionStart > 0) {
    const resolution = fullText.slice(resolutionStart);
    
    // Проверяем резолютивную часть
    if (resolution.includes('частично')) {
      return 'частично удовлетворен';
    }
    if (resolution.includes('отказать') || resolution.includes('без удовлетворения')) {
      return 'отказано';
    }
    if (resolution.includes('взыскать') || resolution.includes('удовлетворить')) {
      return 'удовлетворен';
    }
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

// УЛУЧШЕННЫЙ скрапинг с открытием каждой страницы
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
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ]
    });
    
    const page = await browser.newPage();
    
    // Улучшенные заголовки для обхода блокировок
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    });
    
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
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Ждём загрузки результатов
    try { 
      await page.waitForSelector('#docListContainer li h4 a', { timeout: 10000 }); 
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
        let date = '';
        const courtEl = item.querySelector('h4')?.nextElementSibling;
        if (courtEl) {
          const courtText = courtEl.textContent?.trim() || '';
          court = courtText;
          // Извлекаем дату
          const dateMatch = courtText.match(/(\d{2}\.\d{2}\.\d{4})/);
          if (dateMatch) date = dateMatch[1];
        }
        
        results.push({ 
          title: title.slice(0, 200), 
          url: href.startsWith('http') ? href : 'https://sudact.ru' + href,
          court,
          date
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
        await page.goto(caseInfo.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        // Ждем загрузки контента - пробуем разные селекторы
        await page.waitForSelector('.b-doc-content, .doc-content, article, .document-text, #document', { timeout: 8000 }).catch(() => {});
        
        // Даём странице время на рендеринг
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // УЛУЧШЕННОЕ извлечение текста решения
        const fullText = await page.evaluate(() => {
          // Пробуем разные селекторы
          const selectors = [
            '.b-doc-content',
            '.doc-content', 
            '.document-text',
            '#document',
            'article',
            '.text-justify',
            '[itemprop="articleBody"]',
            'main',
          ];
          
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent && el.textContent.length > 1000) {
              return el.textContent;
            }
          }
          
          // Если ничего не нашли, берём весь body
          return document.body.textContent || '';
        });
        
        console.log(`  Text length: ${fullText.length} chars`);
        
        if (fullText && fullText.length > 500) {
          result = detectResult(fullText);
          
          // Логируем найденные ключевые слова для отладки
          if (result === 'неизвестно') {
            const lastPart = fullText.toLowerCase().slice(-2000);
            if (lastPart.includes('решил')) {
              console.log(`  Found "решил" but could not determine result`);
            }
          }
        } else {
          console.log(`  Text too short, cannot determine result`);
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
        date: caseInfo.date,
        snippet: 'Судебное решение - ' + (caseInfo.court || 'суд'),
        result,
        isSearchLink: false
      });
    }
    
    const totalWithResult = satisfied + partial + rejected;
    const percentage = totalWithResult > 0 
      ? Math.round(((satisfied + partial * 0.5) / totalWithResult) * 100) 
      : null; // null если не удалось определить результаты
    
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
