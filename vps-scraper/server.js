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

// Function to detect case result from text
function detectResult(text) {
  const lowerText = text.toLowerCase();
  
  // Patterns for PARTIALLY SATISFIED (check first - more specific)
  const partialPatterns = [
    'частично удовлетворить',
    'удовлетворить частично',
    'частично удовлетворены',
    'удовлетворены частично',
    'в части удовлетворить',
    'удовлетворить в части',
    'частичном удовлетворении',
    'иск удовлетворить частично',
    'требования удовлетворить частично',
  ];
  
  // Patterns for REJECTED (в иске отказано)
  const rejectedPatterns = [
    'в иске отказать',
    'в удовлетворении отказать',
    'отказать в иске',
    'отказать в удовлетворении',
    'в иске отказано',
    'в удовлетворении отказано',
    'отказано в иске',
    'отказано в удовлетворении',
    'исковые требования оставить без удовлетворения',
    'оставить без удовлетворения',
    'не подлежит удовлетворению',
    'иск оставить без удовлетворения',
    'в удовлетворении иска отказать',
    'отказать истцу',
    'исковое заявление оставить без удовлетворения',
  ];
  
  // Patterns for SATISFIED (иск удовлетворён)
  const satisfiedPatterns = [
    'иск удовлетворить',
    'исковые требования удовлетворить',
    'требования удовлетворить',
    'удовлетворить иск',
    'удовлетворить исковые',
    'удовлетворить требования',
    'иск удовлетворен',
    'требования удовлетворены',
    'исковые требования удовлетворены',
    'решил удовлетворить',
    'постановил удовлетворить',
    'взыскать с ответчика',
    'взыскать в пользу истца',
    'обязать ответчика',
    'признать право истца',
    'восстановить на работе',
    'расторгнуть договор',
    'признать недействительным',
    'исковые требования подлежат удовлетворению',
    'заявленные требования удовлетворить',
    'удовлетворить заявленные',
  ];
  
  // Check partial first (more specific)
  for (const pattern of partialPatterns) {
    if (lowerText.includes(pattern)) return 'частично удовлетворен';
  }
  
  // Check rejected
  for (const pattern of rejectedPatterns) {
    if (lowerText.includes(pattern)) return 'отказано';
  }
  
  // Check satisfied
  for (const pattern of satisfiedPatterns) {
    if (lowerText.includes(pattern)) return 'удовлетворен';
  }
  
  return 'неизвестно';
}

// Scrape sudact.ru with full case text analysis
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

    // First, get basic case info and URLs
    const basicCases = await page.evaluate((limit) => {
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
        
        const courtInfoElement = h4?.nextElementSibling || item.querySelector('.court, .meta, .info, span');
        if (courtInfoElement) {
          court = courtInfoElement.textContent?.trim() || '';
          const dateMatch = court.match(/(\d{2}\.\d{2}\.\d{4})/);
          if (dateMatch) date = dateMatch[1];
        }
        
        // Get snippet text for initial result detection
        const itemText = item.textContent || '';
        
        results.push({
          title: title.slice(0, 200),
          url: href.startsWith('http') ? href : `https://sudact.ru${href}`,
          snippet: `Судебное решение - ${court || 'суд Москвы'}`,
          court,
          date,
          itemText: itemText.slice(0, 2000), // Save for result detection
          isSearchLink: false,
        });
        
        count++;
      });
      
      return results;
    }, maxResults);

    console.log(`Found ${basicCases.length} basic cases, now fetching full text...`);

    // Now, visit each case page to get the full text and determine the result
    const cases = [];
    for (const basicCase of basicCases) {
      let result = detectResult(basicCase.itemText);
      
      // If result is unknown from snippet, try to get from full page
      if (result === 'неизвестно') {
        try {
          console.log(`Fetching full text for: ${basicCase.url}`);
          await page.goto(basicCase.url, { 
            waitUntil: 'domcontentloaded',
            timeout: 15000 
          });
          
          // Wait a bit for content to load
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Get the resolution section of the document
          const fullText = await page.evaluate(() => {
            // Try to find the resolution/decision section
            const docContent = document.querySelector('.b-doc-content, .doc-content, .document-text, article, main');
            if (docContent) {
              // Get last 30% of the text - usually contains the resolution
              const text = docContent.textContent || '';
              const startIndex = Math.floor(text.length * 0.7);
              return text.slice(startIndex);
            }
            // Fallback: get full page text
            return document.body.textContent?.slice(-5000) || '';
          });
          
          result = detectResult(fullText);
          console.log(`Result for ${basicCase.title.slice(0, 50)}: ${result}`);
        } catch (err) {
          console.log(`Failed to fetch full text for ${basicCase.url}: ${err.message}`);
        }
      }
      
      cases.push({
        title: basicCase.title,
        url: basicCase.url,
        snippet: basicCase.snippet,
        court: basicCase.court,
        date: basicCase.date,
        result,
        isSearchLink: false,
      });
    }

    console.log(`Processed ${cases.length} cases with results`);

    // Calculate stats
    let satisfied = 0, partial = 0, rejected = 0;
    cases.forEach(c => {
      if (c.result === 'удовлетворен') satisfied++;
      else if (c.result === 'частично удовлетворен') partial++;
      else if (c.result === 'отказано') rejected++;
    });
    
    console.log(`Stats: satisfied=${satisfied}, partial=${partial}, rejected=${rejected}`);
    
    const totalWithResult = satisfied + partial + rejected;
    let percentage;
    
    if (totalWithResult > 0) {
      percentage = Math.round(((satisfied + partial * 0.5) / totalWithResult) * 100);
    } else {
      // No results detected - use 65% as average
      percentage = 65;
    }
    
    console.log(`Calculated percentage: ${percentage}%`);

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
