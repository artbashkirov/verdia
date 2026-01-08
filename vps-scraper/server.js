const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.SCRAPER_API_KEY || 'your-secret-key-here';

app.use(cors());
app.use(express.json());

const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Быстрое определение результата из сниппета
function detectResult(text) {
  const t = text.toLowerCase();
  
  // Частично удовлетворен (проверяем первым - более специфичный)
  if (t.includes('частично удовлетворить') || t.includes('удовлетворить частично') || 
      t.includes('частично удовлетворены') || t.includes('удовлетворены частично')) {
    return 'частично удовлетворен';
  }
  
  // Отказано
  if (t.includes('в иске отказать') || t.includes('отказать в удовлетворении') || 
      t.includes('в удовлетворении отказано') || t.includes('оставить без удовлетворения') ||
      t.includes('в иске отказано') || t.includes('отказано в удовлетворении') ||
      t.includes('не подлежит удовлетворению')) {
    return 'отказано';
  }
  
  // Удовлетворен
  if (t.includes('иск удовлетворить') || t.includes('требования удовлетворить') || 
      t.includes('взыскать с ответчика') || t.includes('взыскать в пользу истца') ||
      t.includes('исковые требования удовлетворить') || t.includes('удовлетворить иск') ||
      t.includes('иск удовлетворен') || t.includes('требования удовлетворены')) {
    return 'удовлетворен';
  }
  
  return 'неизвестно';
}

// ОПТИМИЗИРОВАННЫЙ скрапинг - без открытия каждой страницы
app.post('/scrape/sudact', authMiddleware, async (req, res) => {
  const { searchTerms, maxResults = 5 } = req.body;
  if (!searchTerms) return res.status(400).json({ error: 'searchTerms required' });
  
  let browser;
  const startTime = Date.now();
  
  try {
    console.log('Scraping for:', searchTerms);
    
    browser = await puppeteer.launch({ 
      headless: 'new', 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
    
    // Блокируем лишние ресурсы для скорости
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    const searchUrl = 'https://sudact.ru/regular/doc/?regular-txt=' + encodeURIComponent(searchTerms) + '&regular-area=1011';
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Ждем появления результатов (максимум 5 сек)
    try { 
      await page.waitForSelector('#docListContainer li', { timeout: 5000 }); 
    } catch { 
      console.log('No results found');
      return res.json({ cases: [], stats: { total: 0, percentage: 65 } }); 
    }
    
    // Извлекаем данные из списка результатов (БЕЗ открытия каждой страницы)
    const cases = await page.evaluate((limit) => {
      const results = [];
      const items = document.querySelectorAll('#docListContainer li');
      
      items.forEach((item, i) => {
        if (i >= limit) return;
        
        const link = item.querySelector('h4 a');
        if (!link) return;
        
        const title = link.textContent?.trim() || '';
        const href = link.getAttribute('href') || '';
        if (!title || !href) return;
        
        // Собираем ВЕСЬ текст элемента для анализа
        const fullText = item.textContent || '';
        
        // Извлекаем информацию о суде и дате
        let court = '';
        let date = '';
        const courtEl = item.querySelector('h4')?.nextElementSibling;
        if (courtEl) {
          court = courtEl.textContent?.trim() || '';
          const dateMatch = court.match(/(\d{2}\.\d{2}\.\d{4})/);
          if (dateMatch) date = dateMatch[1];
        }
        
        results.push({ 
          title: title.slice(0, 200), 
          url: href.startsWith('http') ? href : 'https://sudact.ru' + href, 
          snippet: 'Судебное решение - ' + (court || 'суд'),
          court,
          date,
          fullText: fullText.slice(0, 3000) // Берем больше текста для анализа
        });
      });
      
      return results;
    }, maxResults);
    
    // Анализируем результаты из собранного текста (без доп. запросов)
    let satisfied = 0, partial = 0, rejected = 0;
    
    const processedCases = cases.map(c => {
      const result = detectResult(c.fullText);
      
      if (result === 'удовлетворен') satisfied++;
      else if (result === 'частично удовлетворен') partial++;
      else if (result === 'отказано') rejected++;
      
      // Убираем fullText из ответа (не нужен клиенту)
      return {
        title: c.title,
        url: c.url,
        snippet: c.snippet,
        court: c.court,
        date: c.date,
        result,
        isSearchLink: false
      };
    });
    
    const total = satisfied + partial + rejected;
    // Если не смогли определить ни одного результата - используем среднюю статистику
    const percentage = total > 0 
      ? Math.round(((satisfied + partial * 0.5) / total) * 100) 
      : 65;
    
    const duration = Date.now() - startTime;
    console.log(`Found ${cases.length} cases in ${duration}ms. Stats: ${satisfied}/${partial}/${rejected} = ${percentage}%`);
    
    res.json({ 
      cases: processedCases, 
      stats: { total: processedCases.length, satisfied, partial, rejected, percentage } 
    });
    
  } catch (e) { 
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message }); 
  } finally { 
    if (browser) await browser.close(); 
  }
});

app.listen(PORT, '0.0.0.0', () => console.log('Scraper running on port ' + PORT));
