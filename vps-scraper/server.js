const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3001;

// API Key for security
const API_KEY = process.env.SCRAPER_API_KEY || 'your-secret-key-here';

app.use(cors());
app.use(express.json());

// Auth middleware
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Scrape sudact.ru
app.post('/scrape/sudact', authMiddleware, async (req, res) => {
  const { searchTerms, maxResults = 5 } = req.body;
  
  if (!searchTerms) {
    return res.status(400).json({ error: 'searchTerms required' });
  }

  let browser;
  try {
    console.log(`Scraping sudact.ru for: ${searchTerms}`);
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    const searchUrl = `https://sudact.ru/regular/doc/?regular-txt=${encodeURIComponent(searchTerms)}&regular-area=1011`;
    console.log('Navigating to:', searchUrl);

    await page.goto(searchUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Wait for results
    try {
      await page.waitForSelector('#docListContainer li h4 a', { timeout: 10000 });
    } catch {
      console.log('No results found or timeout');
      return res.json({ cases: [], stats: { total: 0, percentage: 65 } });
    }

    // Extract cases
    const cases = await page.evaluate((limit) => {
      const results = [];
      const items = document.querySelectorAll('#docListContainer li, .h-col2-inner2 li');
      
      let count = 0;
      items.forEach((item) => {
        if (count >= limit) return;
        
        const linkElement = item.querySelector('h4 a') || item.querySelector('a[href*="doc"]');
        if (!linkElement) return;
        
        const title = linkElement.textContent?.trim() || '';
        const href = linkElement.getAttribute('href') || '';
        
        if (!title || !href || href === '#' || title.length < 5) return;
        
        // Get court info
        const h4 = item.querySelector('h4');
        let court = '';
        let date = '';
        let result = 'неизвестно';
        
        const courtInfoElement = h4?.nextElementSibling || item.querySelector('.court, .meta, .info, span');
        if (courtInfoElement) {
          court = courtInfoElement.textContent?.trim() || '';
          const dateMatch = court.match(/(\d{2}\.\d{2}\.\d{4})/);
          if (dateMatch) date = dateMatch[1];
        }
        
        // Detect result
        const itemText = item.textContent?.toLowerCase() || '';
        if (itemText.includes('удовлетворить') || itemText.includes('удовлетворен')) {
          result = 'удовлетворен';
        } else if (itemText.includes('частично')) {
          result = 'частично удовлетворен';
        } else if (itemText.includes('отказать') || itemText.includes('отказано')) {
          result = 'отказано';
        }
        
        results.push({
          title: title.slice(0, 200),
          url: href.startsWith('http') ? href : `https://sudact.ru${href}`,
          snippet: `Судебное решение - ${court || 'суд Москвы'}`,
          court,
          date,
          result,
          isSearchLink: false,
        });
        
        count++;
      });
      
      return results;
    }, maxResults);

    console.log(`Found ${cases.length} cases`);

    // Calculate stats
    let satisfied = 0, partial = 0, rejected = 0;
    cases.forEach(c => {
      if (c.result === 'удовлетворен') satisfied++;
      else if (c.result === 'частично удовлетворен') partial++;
      else if (c.result === 'отказано') rejected++;
    });
    
    const totalWithResult = satisfied + partial + rejected;
    const percentage = totalWithResult > 0 
      ? Math.round(((satisfied + partial * 0.5) / totalWithResult) * 100)
      : 65;

    res.json({
      cases,
      stats: {
        total: cases.length,
        satisfied,
        partial,
        rejected,
        percentage,
      },
    });

  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Scraper API running on port ${PORT}`);
});
