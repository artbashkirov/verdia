// Court case search using sudact.ru
// Uses Puppeteer to scrape real court cases

import puppeteer from 'puppeteer-core';

export interface CourtCase {
  title: string;
  url: string;
  snippet: string;
  caseNumber?: string;
  date?: string;
  court?: string;
  isSearchLink?: boolean;
}

// Keywords for different legal categories
const LEGAL_CATEGORIES: Record<string, { keywords: string[]; searchTerms: string }> = {
  debt: {
    keywords: ['долг', 'взыскание', 'задолженность', 'кредит', 'займ', 'расписк'],
    searchTerms: 'взыскание долга',
  },
  alimony: {
    keywords: ['алимент', 'содержание ребенка', 'выплаты на ребенка'],
    searchTerms: 'взыскание алиментов',
  },
  labor: {
    keywords: ['увольнени', 'работодатель', 'зарплат', 'трудов', 'работ'],
    searchTerms: 'трудовой спор увольнение',
  },
  housing: {
    keywords: ['жилье', 'квартир', 'недвижим', 'выселен', 'залив', 'управляющ'],
    searchTerms: 'залив квартиры возмещение',
  },
  consumer: {
    keywords: ['потребител', 'товар', 'услуг', 'возврат', 'некачеств', 'покупк'],
    searchTerms: 'защита прав потребителей',
  },
  inheritance: {
    keywords: ['наследств', 'завещан', 'наследник', 'наследодатель'],
    searchTerms: 'наследство',
  },
  family: {
    keywords: ['развод', 'брак', 'раздел имущества', 'супруг'],
    searchTerms: 'расторжение брака раздел имущества',
  },
  contract: {
    keywords: ['договор', 'сделк', 'недействительн', 'расторж'],
    searchTerms: 'расторжение договора',
  },
  damage: {
    keywords: ['ущерб', 'вред', 'компенсац', 'моральн', 'дтп', 'авария'],
    searchTerms: 'возмещение ущерба',
  },
  bankruptcy: {
    keywords: ['банкротств', 'несостоятельн'],
    searchTerms: 'банкротство физического лица',
  },
};

// Detect search terms from query
function detectSearchTerms(query: string): string {
  const lowerQuery = query.toLowerCase();
  
  for (const [, config] of Object.entries(LEGAL_CATEGORIES)) {
    for (const keyword of config.keywords) {
      if (lowerQuery.includes(keyword)) {
        return config.searchTerms;
      }
    }
  }
  
  // Extract keywords from query
  const stopWords = new Set([
    'как', 'можно', 'ли', 'и', 'в', 'на', 'за', 'по', 'с', 'от', 'для', 'при', 
    'если', 'что', 'это', 'мне', 'мой', 'моя', 'мои', 'нужно', 'хочу', 'могу',
    'через', 'суд', 'подать', 'иск', 'заявление'
  ]);
  
  const keywords = query
    .toLowerCase()
    .replace(/[.,!?;:()"\-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word))
    .slice(0, 3);
  
  return keywords.join(' ') || 'взыскание';
}

// Try to find Chrome executable
function findChromePath(): string | null {
  const possiblePaths = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  
  for (const chromePath of possiblePaths) {
    try {
      const fs = require('fs');
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

// Scrape court cases from sudact.ru using Puppeteer
async function scrapeSudact(searchTerms: string): Promise<CourtCase[]> {
  const chromePath = findChromePath();
  
  if (!chromePath) {
    console.log('Chrome not found, skipping browser scraping');
    return [];
  }
  
  let browser;
  try {
    console.log('Launching browser for sudact.ru scraping...');
    
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      timeout: 30000,
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // Navigate to search page
    const searchUrl = `https://sudact.ru/regular/doc/?regular-txt=${encodeURIComponent(searchTerms)}&regular-area=1011`;
    console.log('Navigating to:', searchUrl);
    
    await page.goto(searchUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for results to load - use multiple possible selectors
    try {
      await page.waitForSelector('#docListContainer li h4 a', { timeout: 15000 });
    } catch {
      // Try alternative selector
      await page.waitForSelector('.h-col2-inner2 li h4 a', { timeout: 10000 });
    }
    
    // Extract court cases
    const cases = await page.evaluate(() => {
      const results: Array<{
        title: string;
        url: string;
        snippet: string;
        court?: string;
      }> = [];
      
      // Try different container selectors
      const container = document.querySelector('#docListContainer') || 
                        document.querySelector('.h-col2-inner2') ||
                        document.querySelector('.h-col2');
      
      if (!container) {
        console.log('Container not found');
        return results;
      }
      
      // Get all list items within the results container
      const items = container.querySelectorAll('li');
      
      let count = 0;
      items.forEach((item) => {
        if (count >= 5) return; // Only take first 5
        
        const linkElement = item.querySelector('h4 a');
        if (!linkElement) return;
        
        const title = linkElement.textContent?.trim() || '';
        const href = linkElement.getAttribute('href') || '';
        
        if (!title || !href || href === '#') return;
        
        // Get court info - it's in a div right after h4
        const h4 = item.querySelector('h4');
        let court = '';
        if (h4 && h4.nextElementSibling) {
          court = h4.nextElementSibling.textContent?.trim() || '';
        }
        
        // Get snippet - it's the text content of the li, excluding children text
        let snippet = '';
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim();
          if (text && text.length > 50 && text.includes('...')) {
            snippet = text;
            break;
          }
        }
        
        results.push({
          title: title.slice(0, 150),
          url: href.startsWith('http') ? href : `https://sudact.ru${href}`,
          snippet: snippet.slice(0, 300) || `Судебное решение - ${court}`,
          court,
        });
        
        count++;
      });
      
      return results;
    });
    
    console.log(`Found ${cases.length} cases from sudact.ru`);
    
    return cases.map((c, i) => ({
      ...c,
      caseNumber: extractCaseNumber(c.title),
      isSearchLink: false,
    }));
    
  } catch (error) {
    console.error('Error scraping sudact.ru:', error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Extract case number from title
function extractCaseNumber(title: string): string | undefined {
  const match = title.match(/№?\s*(\d{1,2}-\d+\/\d{4})/);
  return match ? match[1] : undefined;
}

// Generate fallback search links
function generateSearchLinks(query: string, searchTerms: string): CourtCase[] {
  return [
    {
      title: `Поиск судебных решений: "${searchTerms}"`,
      url: `https://sudact.ru/regular/doc/?regular-txt=${encodeURIComponent(searchTerms)}&regular-area=1011`,
      snippet: 'Нажмите для поиска судебных актов по вашему запросу на sudact.ru (суды Москвы)',
      isSearchLink: true,
    },
    {
      title: `Судебная практика на mos-gorsud.ru`,
      url: `https://mos-gorsud.ru/search?searchtype=sp&formType=shortForm&search=${encodeURIComponent(searchTerms)}`,
      snippet: 'Официальный портал судов общей юрисдикции города Москвы',
      isSearchLink: true,
    },
    {
      title: 'Интерактивный помощник суда',
      url: 'https://help.mos-gorsud.ru',
      snippet: 'Помощь в подготовке документов для суда на официальном портале',
      isSearchLink: true,
    },
  ];
}

// Main search function
export async function searchCourtCases(query: string): Promise<CourtCase[]> {
  console.log('Searching court cases for:', query);
  
  const searchTerms = detectSearchTerms(query);
  console.log('Search terms:', searchTerms);
  
  try {
    // Try to scrape real cases
    const cases = await scrapeSudact(searchTerms);
    
    if (cases.length > 0) {
      console.log(`Returning ${cases.length} real court cases`);
      return cases;
    }
  } catch (error) {
    console.error('Court scraping failed:', error);
  }
  
  // Fallback to search links
  console.log('Falling back to search links');
  return generateSearchLinks(query, searchTerms);
}

// Export for backwards compatibility
export function generateFallbackCases(query: string): CourtCase[] {
  const searchTerms = detectSearchTerms(query);
  return generateSearchLinks(query, searchTerms);
}
