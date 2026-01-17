const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.SCRAPER_API_KEY || 'verdia_scraper_2026_secret_xyz789';

// Файл для кэша
const CACHE_FILE = '/opt/verdia-scraper/cache.json';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа

app.use(cors());
app.use(express.json());

// Глобальный браузер для переиспользования
let globalBrowser = null;
let browserLastUsed = 0;
const BROWSER_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 минут

// Получить или создать браузер
async function getBrowser() {
  if (globalBrowser && globalBrowser.isConnected()) {
    browserLastUsed = Date.now();
    return globalBrowser;
  }
  
  console.log('Launching new browser...');
  globalBrowser = await puppeteer.launch({ 
    headless: 'new', 
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage', 
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--single-process',
    ]
  });
  browserLastUsed = Date.now();
  return globalBrowser;
}

// Закрыть браузер если не используется
setInterval(async () => {
  if (globalBrowser && Date.now() - browserLastUsed > BROWSER_IDLE_TIMEOUT) {
    console.log('Closing idle browser...');
    await globalBrowser.close().catch(() => {});
    globalBrowser = null;
  }
}, 60000);

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

app.get('/health', (req, res) => res.json({ status: 'ok', cacheSize: Object.keys(cache).length, browserActive: !!globalBrowser }));

// Определение результата из текста решения
function detectResult(text) {
  if (!text || text.length < 100) return 'неизвестно';
  
  const t = text.toLowerCase();
  // Ищем в последних 10000 символах (резолютивная часть может быть дальше)
  const lastPart = t.slice(-10000);
  // Также проверяем весь текст для некоторых паттернов
  const fullText = t;
  
  // Частично удовлетворен (проверяем первым - более специфичный паттерн)
  const partialPatterns = [
    'частично удовлетворить', 'удовлетворить частично', 'частично удовлетворены',
    'удовлетворены частично', 'удовлетворить в части', 'частичному удовлетворению',
    'исковые требования удовлетворить частично', 'иск удовлетворить частично',
    'удовлетворить исковые требования частично', 'частично удовлетворено',
    'удовлетворено частично', 'в части удовлетворить', 'требования удовлетворить частично',
  ];
  for (const p of partialPatterns) {
    if (lastPart.includes(p)) return 'частично удовлетворен';
  }
  
  // Отказано
  const rejectedPatterns = [
    'в иске отказать', 'в удовлетворении отказать', 'в удовлетворении иска отказать',
    'в иске отказано', 'в удовлетворении отказано', 'оставить без удовлетворения',
    'не подлежит удовлетворению', 'отказать в удовлетворении', 'отказать в иске',
    'исковые требования оставить без удовлетворения', 'в удовлетворении исковых требований отказать',
    'иск оставить без удовлетворения', 'отказать в удовлетворении исковых требований',
    'в удовлетворении заявленных требований отказать', 'заявленные требования оставить без удовлетворения',
    'исковое заявление оставить без удовлетворения', 'в удовлетворении искового заявления отказать',
    'в полном объеме отказать', 'полностью отказать', 'отказать полностью',
    'отказать в полном объеме', 'требования истца оставить без удовлетворения',
  ];
  for (const p of rejectedPatterns) {
    if (lastPart.includes(p)) return 'отказано';
  }
  
  // Удовлетворен (проверяем последним)
  const satisfiedPatterns = [
    'иск удовлетворить', 'исковые требования удовлетворить', 'удовлетворить исковые требования',
    'удовлетворить иск', 'иск удовлетворен', 'требования удовлетворены',
    'взыскать с ответчика', 'взыскать в пользу истца', 'исковое заявление удовлетворить',
    'удовлетворить исковое заявление', 'заявленные требования удовлетворить',
    'удовлетворить заявленные требования', 'требования истца удовлетворить',
    'удовлетворить требования истца', 'исковые требования подлежат удовлетворению',
    'иск подлежит удовлетворению', 'включить в наследственную массу',
    'признать право собственности', 'обязать ответчика', 'расторгнуть договор',
    'признать недействительным', 'восстановить на работе', 'выселить из жилого помещения',
    // Наследственные дела
    'установить факт принятия наследства', 'факт принятия наследства установить',
    'признать принявшим наследство', 'признать наследником', 'обязать нотариуса выдать',
    'обязать выдать свидетельство о праве на наследство', 'свидетельство о праве на наследство выдать',
    'признать право на наследство', 'восстановить срок для принятия наследства',
    'срок для принятия наследства восстановить', 'наследственную массу включить',
    // Жилищные и семейные дела
    'определить порядок пользования', 'определить место жительства ребенка',
    'установить порядок общения', 'лишить родительских прав', 'ограничить в родительских правах',
    'расторгнуть брак', 'брак расторгнуть', 'взыскать алименты', 'алименты взыскать',
    // Трудовые споры
    'взыскать заработную плату', 'восстановить в должности', 'признать увольнение незаконным',
    // Общие позитивные исходы
    'заявление удовлетворить', 'жалобу удовлетворить', 'апелляционную жалобу удовлетворить',
  ];
  
  for (const p of satisfiedPatterns) {
    if (lastPart.includes(p)) {
      const idx = lastPart.indexOf(p);
      const context = lastPart.slice(Math.max(0, idx - 100), idx + p.length + 100);
      // Проверяем, что рядом нет отрицания
      if (!context.includes('отказ') && !context.includes('не подлежит') && !context.includes('без удовлетворения')) {
        return 'удовлетворен';
      }
    }
  }
  
  // Дополнительная проверка по ключевым словам в резолютивной части
  // Ищем секцию "РЕШИЛ" или "ОПРЕДЕЛИЛ"
  const resolveMatch = fullText.match(/(?:решил|определил|постановил)[\s\S]{0,3000}$/i);
  if (resolveMatch) {
    const resolveText = resolveMatch[0].toLowerCase();
    
    // Проверяем частичное удовлетворение
    if (resolveText.includes('частично')) return 'частично удовлетворен';
    
    // Проверяем отказ
    if (resolveText.includes('отказать') || resolveText.includes('без удовлетворения')) {
      return 'отказано';
    }
    
    // Проверяем удовлетворение
    if (resolveText.includes('удовлетворить') || resolveText.includes('взыскать') || 
        resolveText.includes('признать') || resolveText.includes('обязать') ||
        resolveText.includes('включить') || resolveText.includes('выселить') ||
        resolveText.includes('установить факт') || resolveText.includes('восстановить') ||
        resolveText.includes('расторгнуть') || resolveText.includes('определить порядок') ||
        resolveText.includes('лишить родительских') || resolveText.includes('ограничить')) {
      return 'удовлетворен';
    }
  }
  
  return 'неизвестно';
}

// Получить кэшированный результат
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
}

// Создать страницу с настройками
async function createPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });
  
  // Блокируем тяжёлые ресурсы
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });
  
  return page;
}

// Открыть страницу дела и определить результат
async function scrapeCasePage(browser, caseInfo) {
  let page;
  try {
    page = await createPage(browser);
    await page.goto(caseInfo.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Быстрая проверка наличия контента
    await page.waitForSelector('.b-doc-content, .doc-content, article', { timeout: 5000 }).catch(() => {});
    
    const fullText = await page.evaluate(() => {
      const selectors = ['.b-doc-content', '.doc-content', 'article', 'main'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.length > 1000) {
          return el.textContent;
        }
      }
      return document.body.textContent || '';
    });
    
    const result = fullText.length > 500 ? detectResult(fullText) : 'неизвестно';
    
    return { ...caseInfo, result, snippet: 'Судебное решение - ' + (caseInfo.court || 'суд'), isSearchLink: false };
  } catch (e) {
    console.log(`Error scraping ${caseInfo.title.slice(0, 30)}...: ${e.message}`);
    return { ...caseInfo, result: 'неизвестно', snippet: 'Судебное решение', isSearchLink: false };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ОПТИМИЗИРОВАННЫЙ скрапинг с ПАРАЛЛЕЛЬНЫМ открытием страниц
app.post('/scrape/sudact', authMiddleware, async (req, res) => {
  const { searchTerms, maxResults = 5 } = req.body;
  if (!searchTerms) return res.status(400).json({ error: 'searchTerms required' });
  
  // Проверяем кэш
  const cached = getCached(searchTerms);
  if (cached) return res.json(cached);
  
  const startTime = Date.now();
  let mainPage;
  
  try {
    console.log('Scraping for:', searchTerms);
    const browser = await getBrowser();
    
    mainPage = await createPage(browser);
    
    const searchUrl = 'https://sudact.ru/regular/doc/?regular-txt=' + encodeURIComponent(searchTerms) + '&regular-area=1011';
    console.log('Opening search page...');
    await mainPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    // Ждём загрузки результатов
    try { 
      await mainPage.waitForSelector('#docListContainer li h4 a', { timeout: 8000 }); 
    } catch { 
      console.log('No results found - NOT caching empty result');
      // НЕ кэшируем пустые результаты - это может быть временная проблема с сайтом
      const emptyResult = { cases: [], stats: { total: 0, satisfied: 0, partial: 0, rejected: 0, percentage: 0 } };
      return res.json(emptyResult); 
    }
    
    // Собираем ссылки на дела
    const caseLinks = await mainPage.evaluate((limit) => {
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
          court,
        });
      });
      return results;
    }, maxResults);
    
    console.log('Found', caseLinks.length, 'cases, scraping sequentially...');
    
    // Закрываем главную страницу
    await mainPage.close().catch(() => {});
    mainPage = null;
    
    // ПОСЛЕДОВАТЕЛЬНОЕ открытие страниц (одна за одной)
    const cases = [];
    
    for (const caseInfo of caseLinks) {
      const result = await scrapeCasePage(browser, caseInfo);
      cases.push(result);
      console.log(`  Case ${cases.length}/${caseLinks.length}: ${result.result}`);
    }
    
    // Подсчёт статистики
    let satisfied = 0, partial = 0, rejected = 0;
    for (const c of cases) {
      if (c.result === 'удовлетворен') satisfied++;
      else if (c.result === 'частично удовлетворен') partial++;
      else if (c.result === 'отказано') rejected++;
    }
    
    const totalWithResult = satisfied + partial + rejected;
    const percentage = totalWithResult > 0 
      ? Math.round(((satisfied + partial * 0.5) / totalWithResult) * 100) 
      : 0;
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`Done in ${duration}s. Stats: ${satisfied}/${partial}/${rejected} = ${percentage}% (${totalWithResult} из ${cases.length} дел)`);
    
    const response = { 
      cases, 
      stats: { total: cases.length, satisfied, partial, rejected, casesWithResult: totalWithResult, percentage, hasData: totalWithResult > 0 } 
    };
    
    setCache(searchTerms, response);
    res.json(response);
    
  } catch (e) { 
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message }); 
  } finally { 
    if (mainPage) await mainPage.close().catch(() => {});
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
  res.json({ entries, browserActive: !!globalBrowser });
});

app.listen(PORT, '0.0.0.0', () => console.log('Scraper running on port ' + PORT));
