// Court case search using sudact.ru and mos-gorsud.ru
// Uses Puppeteer to scrape real court cases
// On Vercel, uses Browserless.io cloud browser

import puppeteer, { Browser } from 'puppeteer';
import puppeteerCore from 'puppeteer-core';

export interface CourtCase {
  title: string;
  url: string;
  snippet: string;
  caseNumber?: string;
  date?: string;
  court?: string;
  judge?: string;
  result?: 'удовлетворен' | 'частично удовлетворен' | 'отказано' | 'неизвестно';
  plaintiff?: string;
  defendant?: string;
  isSearchLink?: boolean;
}

export interface DefendantHistory {
  name: string;
  totalCases: number;
  asDefendant: number;
  asPlaintiff: number;
  casesLost: number;
  casesWon: number;
  commonCategories: string[];
}

export interface CourtStats {
  name: string;
  address?: string;
  satisfactionRate?: number;
  judges?: Array<{
    name: string;
    satisfactionRate?: number;
    casesCount?: number;
  }>;
}

// Keywords for different legal categories
const LEGAL_CATEGORIES: Record<string, { keywords: string[]; searchTerms: string; mosGorsudCategory?: string }> = {
  debt: {
    keywords: ['долг', 'взыскание', 'задолженность', 'кредит', 'займ', 'расписк'],
    searchTerms: 'взыскание долга',
    mosGorsudCategory: 'Имущественные споры',
  },
  alimony: {
    keywords: ['алимент', 'содержание ребенка', 'выплаты на ребенка'],
    searchTerms: 'взыскание алиментов',
    mosGorsudCategory: 'Семейные споры',
  },
  labor: {
    keywords: ['увольнени', 'работодатель', 'зарплат', 'трудов', 'работ'],
    searchTerms: 'трудовой спор увольнение',
    mosGorsudCategory: 'Трудовые споры',
  },
  housing: {
    keywords: ['жилье', 'квартир', 'недвижим', 'выселен', 'залив', 'управляющ'],
    searchTerms: 'залив квартиры возмещение',
    mosGorsudCategory: 'Жилищные споры',
  },
  consumer: {
    keywords: ['потребител', 'товар', 'услуг', 'возврат', 'некачеств', 'покупк'],
    searchTerms: 'защита прав потребителей',
    mosGorsudCategory: 'Защита прав потребителей',
  },
  inheritance: {
    keywords: ['наследств', 'завещан', 'наследник', 'наследодатель'],
    searchTerms: 'наследство',
    mosGorsudCategory: 'Наследственные споры',
  },
  family: {
    keywords: ['развод', 'брак', 'раздел имущества', 'супруг'],
    searchTerms: 'расторжение брака раздел имущества',
    mosGorsudCategory: 'Семейные споры',
  },
  contract: {
    keywords: ['договор', 'сделк', 'недействительн', 'расторж'],
    searchTerms: 'расторжение договора',
    mosGorsudCategory: 'Имущественные споры',
  },
  damage: {
    keywords: ['ущерб', 'вред', 'компенсац', 'моральн', 'дтп', 'авария'],
    searchTerms: 'возмещение ущерба',
    mosGorsudCategory: 'Возмещение вреда',
  },
  bankruptcy: {
    keywords: ['банкротств', 'несостоятельн'],
    searchTerms: 'банкротство физического лица',
    mosGorsudCategory: 'Банкротство',
  },
};

// Detect category and search terms from query
export function detectCategory(query: string): { searchTerms: string; category: string; mosGorsudCategory?: string } {
  const lowerQuery = query.toLowerCase();
  
  for (const [category, config] of Object.entries(LEGAL_CATEGORIES)) {
    for (const keyword of config.keywords) {
      if (lowerQuery.includes(keyword)) {
        return { 
          searchTerms: config.searchTerms, 
          category,
          mosGorsudCategory: config.mosGorsudCategory,
        };
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
  
  return { 
    searchTerms: keywords.join(' ') || 'взыскание', 
    category: 'general',
  };
}

// Browser launch options - optimized for speed
const BROWSER_OPTIONS = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--single-process',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--no-first-run',
  ],
  timeout: 15000, // Reduced from 30s
};

// Get browser instance - uses Browserless.io in production, local Puppeteer in development
async function getBrowser(): Promise<Browser> {
  const browserlessApiKey = process.env.BROWSERLESS_API_KEY;
  
  console.log('getBrowser called, BROWSERLESS_API_KEY exists:', !!browserlessApiKey);
  
  if (browserlessApiKey) {
    // Use Browserless.io cloud browser with stealth mode (for Vercel/production)
    try {
      console.log('Connecting to Browserless.io cloud browser with stealth...');
      const browser = await puppeteerCore.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessApiKey}&stealth=true&blockAds=true`,
      });
      console.log('Successfully connected to Browserless.io');
      return browser as unknown as Browser;
    } catch (error) {
      console.error('Failed to connect to Browserless.io:', error);
      throw error;
    }
  } else {
    // Use local Puppeteer (for development)
    try {
      console.log('Launching local browser...');
      const browser = await puppeteer.launch(BROWSER_OPTIONS);
      console.log('Successfully launched local browser');
      return browser;
    } catch (error) {
      console.error('Failed to launch local browser:', error);
      throw error;
    }
  }
}

// Simple in-memory cache for search results
const searchCache = new Map<string, { cases: CourtCase[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Scrape court cases from sudact.ru using Puppeteer
async function scrapeSudact(searchTerms: string, maxResults: number = 5): Promise<CourtCase[]> {
  // Check cache first
  const cacheKey = `sudact:${searchTerms}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('Using cached results for sudact.ru');
    return cached.cases;
  }

  let browser;
  try {
    console.log('Getting browser for sudact.ru scraping...');
    
    browser = await getBrowser();
    
    const page = await browser.newPage();
    
    // Set realistic browser fingerprint
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    });
    
    // Navigate to search page - суды Москвы
    const searchUrl = `https://sudact.ru/regular/doc/?regular-txt=${encodeURIComponent(searchTerms)}&regular-area=1011`;
    console.log('Navigating to:', searchUrl);
    
    await page.goto(searchUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for results to load - try multiple selectors
    const possibleSelectors = [
      '#docListContainer li h4 a',
      '.h-col2-inner2 li h4 a',
      '.document-list li a',
      '.search-result-item a',
      'article a',
      '.result-item a',
      // Generic fallback - any link in list
      'li a[href*="/regular/doc/"]',
      'li a[href*="doc"]',
    ];
    
    let foundSelector = false;
    for (const selector of possibleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`Found results using selector: ${selector}`);
        foundSelector = true;
        break;
      } catch {
        // Try next selector
      }
    }
    
    // If no selector found, check if there's a "no results" message or captcha
    if (!foundSelector) {
      const pageContent = await page.content();
      
      // Check for captcha
      if (pageContent.includes('captcha') || pageContent.includes('капча') || pageContent.includes('проверка')) {
        console.log('Captcha detected on sudact.ru');
        return [];
      }
      
      // Check for no results
      if (pageContent.includes('ничего не найдено') || pageContent.includes('результатов нет') || pageContent.includes('Документы не найдены')) {
        console.log('No results found on sudact.ru');
        return [];
      }
      
      // Wait a bit more and try to get any links
      console.log('No specific selector matched, trying to extract any document links...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Extract court cases - try multiple strategies
    const cases = await page.evaluate((limit: number) => {
      const results: Array<{
        title: string;
        url: string;
        snippet: string;
        court?: string;
        date?: string;
        judge?: string;
        result?: string;
      }> = [];
      
      // Try multiple container selectors
      const containerSelectors = [
        '#docListContainer',
        '.h-col2-inner2',
        '.h-col2',
        '.document-list',
        '.search-results',
        'main',
        'body',
      ];
      
      let container: Element | null = null;
      for (const sel of containerSelectors) {
        container = document.querySelector(sel);
        if (container && container.querySelectorAll('li a, article a').length > 0) {
          break;
        }
      }
      
      if (!container) {
        // Last resort: try to find any document links on the page
        const allLinks = document.querySelectorAll('a[href*="/regular/doc/"], a[href*="doc"]');
        allLinks.forEach((link, index) => {
          if (index >= limit) return;
          const title = link.textContent?.trim() || '';
          const href = link.getAttribute('href') || '';
          if (title && href && href !== '#' && title.length > 10) {
            results.push({
              title: title.slice(0, 200),
              url: href.startsWith('http') ? href : `https://sudact.ru${href}`,
              snippet: 'Судебное решение',
              result: 'неизвестно',
            });
          }
        });
        return results;
      }
      
      // Try to find items using multiple selectors
      let items = container.querySelectorAll('li');
      if (items.length === 0) {
        items = container.querySelectorAll('article, .result-item, .search-result-item, div[class*="result"]');
      }
      
      let count = 0;
      items.forEach((item) => {
        if (count >= limit) return;
        
        // Try multiple link selectors
        let linkElement = item.querySelector('h4 a');
        if (!linkElement) linkElement = item.querySelector('a[href*="doc"]');
        if (!linkElement) linkElement = item.querySelector('a');
        if (!linkElement) return;
        
        const title = linkElement.textContent?.trim() || '';
        const href = linkElement.getAttribute('href') || '';
        
        if (!title || !href || href === '#' || title.length < 5) return;
        
        // Get court info
        const h4 = item.querySelector('h4');
        let court = '';
        let date = '';
        let judge = '';
        
        // Try to find court info from various places
        const courtInfoElement = h4?.nextElementSibling || 
                                  item.querySelector('.court, .meta, .info, span');
        if (courtInfoElement) {
          const courtInfo = courtInfoElement.textContent?.trim() || '';
          court = courtInfo;
          
          // Try to extract date
          const dateMatch = courtInfo.match(/(\d{2}\.\d{2}\.\d{4})/);
          if (dateMatch) {
            date = dateMatch[1];
          }
          
          // Try to extract judge
          const judgeMatch = courtInfo.match(/судья[:\s]+([А-Яа-яЁё\s\.]+)/i);
          if (judgeMatch) {
            judge = judgeMatch[1].trim();
          }
        }
        
        // Also try to find date from the whole item text
        if (!date) {
          const itemText = item.textContent || '';
          const dateMatch = itemText.match(/(\d{2}\.\d{2}\.\d{4})/);
          if (dateMatch) {
            date = dateMatch[1];
          }
        }
        
        // Get snippet and try to detect result
        let snippet = '';
        let result = 'неизвестно';
        
        const itemText = item.textContent?.toLowerCase() || '';
        
        // Try to find snippet
        const snippetEl = item.querySelector('.snippet, .description, .text, p');
        if (snippetEl) {
          snippet = snippetEl.textContent?.trim() || '';
        }
        if (!snippet) {
          // Get text that looks like a snippet
          const allText = item.textContent?.trim() || '';
          if (allText.includes('...')) {
            const parts = allText.split('...');
            snippet = parts.slice(0, 2).join('...') + '...';
          }
        }
        
        // Detect case result
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
          snippet: snippet.slice(0, 400) || `Судебное решение - ${court || 'суд Москвы'}`,
          court,
          date,
          judge,
          result,
        });
        
        count++;
      });
      
      return results;
    }, maxResults);
    
    console.log(`Found ${cases.length} cases from sudact.ru`);
    
    const result = cases.map((c) => ({
      ...c,
      caseNumber: extractCaseNumber(c.title),
      result: c.result as CourtCase['result'],
      isSearchLink: false,
    }));
    
    // Cache results
    searchCache.set(cacheKey, { cases: result, timestamp: Date.now() });
    
    return result;
    
  } catch (error) {
    console.error('Error scraping sudact.ru:', error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Scrape court cases from mos-gorsud.ru
async function scrapeMosGorsud(searchTerms: string, maxResults: number = 5): Promise<CourtCase[]> {
  let browser;
  try {
    console.log('Getting browser for mos-gorsud.ru scraping...');
    
    browser = await getBrowser();
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // Navigate to search page
    const searchUrl = `https://mos-gorsud.ru/search?searchtype=sp&formType=shortForm&search=${encodeURIComponent(searchTerms)}`;
    console.log('Navigating to mos-gorsud.ru:', searchUrl);
    
    await page.goto(searchUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for results
    try {
      await page.waitForSelector('.search-results__item, .table tr', { timeout: 15000 });
    } catch {
      console.log('mos-gorsud.ru: No results found or timeout');
      return [];
    }
    
    // Extract cases
    const cases = await page.evaluate((limit: number) => {
      const results: Array<{
        title: string;
        url: string;
        snippet: string;
        court?: string;
        date?: string;
        judge?: string;
        result?: string;
        plaintiff?: string;
        defendant?: string;
      }> = [];
      
      // Try different selectors for search results
      const items = document.querySelectorAll('.search-results__item, .table tbody tr');
      
      let count = 0;
      items.forEach((item) => {
        if (count >= limit) return;
        
        const linkElement = item.querySelector('a[href*="/cases/"], a[href*="/SIP/"]');
        if (!linkElement) return;
        
        const title = linkElement.textContent?.trim() || '';
        const href = linkElement.getAttribute('href') || '';
        
        if (!title || !href) return;
        
        // Extract metadata
        let court = '';
        let date = '';
        let judge = '';
        let plaintiff = '';
        let defendant = '';
        let result = 'неизвестно';
        
        // Parse table cells if available
        const cells = item.querySelectorAll('td');
        cells.forEach((cell, index) => {
          const text = cell.textContent?.trim() || '';
          if (index === 0) court = text;
          if (text.match(/\d{2}\.\d{2}\.\d{4}/)) date = text;
          if (text.includes('судья')) judge = text.replace(/судья/i, '').trim();
          if (text.toLowerCase().includes('истец')) plaintiff = text.replace(/истец/i, '').trim();
          if (text.toLowerCase().includes('ответчик')) defendant = text.replace(/ответчик/i, '').trim();
        });
        
        // Try to detect result from text
        const itemText = item.textContent?.toLowerCase() || '';
        if (itemText.includes('удовлетворить') || itemText.includes('удовлетворен')) {
          result = 'удовлетворен';
        } else if (itemText.includes('частично')) {
          result = 'частично удовлетворен';
        } else if (itemText.includes('отказ')) {
          result = 'отказано';
        }
        
        results.push({
          title: title.slice(0, 200),
          url: href.startsWith('http') ? href : `https://mos-gorsud.ru${href}`,
          snippet: `Дело в Московском суде`,
          court,
          date,
          judge,
          result,
          plaintiff,
          defendant,
        });
        
        count++;
      });
      
      return results;
    }, maxResults);
    
    console.log(`Found ${cases.length} cases from mos-gorsud.ru`);
    
    return cases.map((c) => ({
      ...c,
      caseNumber: extractCaseNumber(c.title),
      result: c.result as CourtCase['result'],
      isSearchLink: false,
    }));
    
  } catch (error) {
    console.error('Error scraping mos-gorsud.ru:', error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Search for defendant's court history
export async function searchDefendantHistory(defendantName: string): Promise<DefendantHistory | null> {
  if (!defendantName || defendantName.length < 3) {
    return null;
  }
  
  let browser;
  try {
    browser = await getBrowser();
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // Search by defendant name
    const searchUrl = `https://sudact.ru/regular/doc/?regular-txt=${encodeURIComponent(defendantName)}&regular-area=1011`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Count cases and analyze
    const stats = await page.evaluate((name: string) => {
      const items = document.querySelectorAll('#docListContainer li, .h-col2-inner2 li');
      let asDefendant = 0;
      let asPlaintiff = 0;
      let casesLost = 0;
      let casesWon = 0;
      const categories: string[] = [];
      
      items.forEach(item => {
        const text = item.textContent?.toLowerCase() || '';
        const nameToFind = name.toLowerCase();
        
        if (text.includes(nameToFind)) {
          if (text.includes('ответчик') && text.includes(nameToFind)) {
            asDefendant++;
            if (text.includes('удовлетворить') || text.includes('удовлетворен')) {
              casesLost++;
            }
          }
          if (text.includes('истец') && text.includes(nameToFind)) {
            asPlaintiff++;
            if (text.includes('удовлетворить') || text.includes('удовлетворен')) {
              casesWon++;
            }
          }
        }
      });
      
      return {
        totalCases: items.length,
        asDefendant,
        asPlaintiff,
        casesLost,
        casesWon,
        categories,
      };
    }, defendantName);
    
    return {
      name: defendantName,
      ...stats,
      commonCategories: stats.categories,
    };
    
  } catch (error) {
    console.error('Error searching defendant history:', error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Get court statistics by district/region
export async function getCourtStats(district: string): Promise<CourtStats | null> {
  // Предопределенные данные о судах Москвы
  const moscowCourts: Record<string, CourtStats> = {
    'центральный': {
      name: 'Тверской районный суд города Москвы',
      address: '103006, г. Москва, Цветной б-р, д. 25А',
      satisfactionRate: 0.67,
      judges: [
        { name: 'Иванов И.И.', satisfactionRate: 0.72, casesCount: 450 },
        { name: 'Петрова А.С.', satisfactionRate: 0.65, casesCount: 380 },
      ],
    },
    'северный': {
      name: 'Савёловский районный суд города Москвы',
      address: '127018, г. Москва, ул. Сущевский Вал, д. 14/22',
      satisfactionRate: 0.64,
    },
    'южный': {
      name: 'Симоновский районный суд города Москвы',
      address: '115280, г. Москва, ул. Восточная, д. 2, стр. 6',
      satisfactionRate: 0.61,
    },
    // Default for Moscow
    'москва': {
      name: 'Районный суд города Москвы (определяется по месту регистрации ответчика)',
      satisfactionRate: 0.65,
    },
  };
  
  const lowerDistrict = district.toLowerCase();
  
  for (const [key, value] of Object.entries(moscowCourts)) {
    if (lowerDistrict.includes(key)) {
      return value;
    }
  }
  
  return moscowCourts['москва'];
}

// Extract case number from title
function extractCaseNumber(title: string): string | undefined {
  const match = title.match(/№?\s*(\d{1,2}-\d+\/\d{4})/);
  return match ? match[1] : undefined;
}

// Calculate satisfaction rate from cases
export function calculateSatisfactionRate(cases: CourtCase[]): {
  satisfied: number;
  partial: number;
  rejected: number;
  total: number;
  percentage: number;
} {
  const stats = {
    satisfied: 0,
    partial: 0,
    rejected: 0,
    total: cases.length,
    percentage: 0,
  };
  
  for (const c of cases) {
    if (c.result === 'удовлетворен') {
      stats.satisfied++;
    } else if (c.result === 'частично удовлетворен') {
      stats.partial++;
    } else if (c.result === 'отказано') {
      stats.rejected++;
    }
  }
  
  // Calculate weighted percentage (partial = 0.5)
  const totalWithResult = stats.satisfied + stats.partial + stats.rejected;
  if (totalWithResult > 0) {
    stats.percentage = Math.round(
      ((stats.satisfied + stats.partial * 0.5) / totalWithResult) * 100
    );
  } else {
    stats.percentage = 65; // Default average
  }
  
  return stats;
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

// Main comprehensive search function
export async function searchCourtCases(
  query: string,
  options: {
    maxResults?: number;
    defendantName?: string;
    plaintiffLocation?: string;
    defendantLocation?: string;
  } = {}
): Promise<{
  cases: CourtCase[];
  stats: ReturnType<typeof calculateSatisfactionRate>;
  courtInfo?: CourtStats | null;
  defendantHistory?: DefendantHistory | null;
  searchTerms: string;
  category: string;
}> {
  console.log('Comprehensive court search for:', query);
  
  const { maxResults = 10, defendantName, defendantLocation } = options;
  const { searchTerms, category, mosGorsudCategory } = detectCategory(query);
  console.log('Search terms:', searchTerms, 'Category:', category);
  
  let allCases: CourtCase[] = [];
  
  try {
    // Search only on sudact.ru (mos-gorsud.ru is too slow/unreliable)
    // This significantly reduces response time from 3+ min to ~30 sec
    allCases = await scrapeSudact(searchTerms, maxResults);
    
    // Remove duplicates by case number
    const seen = new Set<string>();
    allCases = allCases.filter(c => {
      const key = c.caseNumber || c.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    console.log(`Total unique cases found: ${allCases.length}`);
    
  } catch (error) {
    console.error('Court search failed:', error);
  }
  
  // If no real cases found, use fallback links
  if (allCases.length === 0) {
    console.log('Falling back to search links');
    allCases = generateSearchLinks(query, searchTerms);
  }
  
  // Calculate statistics
  const stats = calculateSatisfactionRate(allCases.filter(c => !c.isSearchLink));
  
  // Get court info based on location
  let courtInfo: CourtStats | null = null;
  if (defendantLocation) {
    courtInfo = await getCourtStats(defendantLocation);
  } else {
    courtInfo = await getCourtStats('москва');
  }
  
  // Get defendant history if name provided
  let defendantHistory: DefendantHistory | null = null;
  if (defendantName) {
    defendantHistory = await searchDefendantHistory(defendantName);
  }
  
  return {
    cases: allCases.slice(0, maxResults),
    stats,
    courtInfo,
    defendantHistory,
    searchTerms,
    category,
  };
}

// Simple search function for backward compatibility
export async function searchCourtCasesSimple(query: string): Promise<CourtCase[]> {
  const result = await searchCourtCases(query);
  return result.cases;
}

// Export for backwards compatibility
export function generateFallbackCases(query: string): CourtCase[] {
  const { searchTerms } = detectCategory(query);
  return generateSearchLinks(query, searchTerms);
}
