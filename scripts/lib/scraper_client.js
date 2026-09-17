/**
 * scripts/lib/scraper_client.js
 * Production Multi-Provider Web Scraper
 *
 * Priority: Jina AI Reader (free) → Firecrawl (free tier) → Direct fetch
 * Returns clean markdown content for any URL — no npm deps, stdlib fetch only
 *
 * Jina Reader:  r.jina.ai/{url}          — FREE, no key needed
 * Jina Search:  s.jina.ai/{query}        — free tier with optional key
 * Firecrawl:    api.firecrawl.dev/v1     — 500 credits/month free
 * Direct:       raw fetch + HTML strip   — always available
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, '..', '..', 'config.json');

// ─── Config ───────────────────────────────────────────────────────────────────
function loadScraperConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (cfg.scraping) return cfg.scraping;
    // Legacy flat format
    return {
      primaryScraper: 'jina',
      keys: {
        firecrawl: cfg.firecrawlApiKey || '',
        jina: cfg.jinaApiKey || ''
      }
    };
  } catch {
    return { primaryScraper: 'jina', keys: {} };
  }
}

// ─── Fetch with Timeout ───────────────────────────────────────────────────────
async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ApexAIBot/1.0)',
        ...opts.headers
      }
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Provider 1: Jina AI Reader ───────────────────────────────────────────────
// Completely free. Converts any public URL to clean, LLM-ready markdown.
// Docs: https://jina.ai/reader/
export async function scrapeViaJina(url, jinaApiKey = '') {
  const encodedUrl = encodeURIComponent(url);
  const jinaUrl = `https://r.jina.ai/${encodedUrl}`;

  const headers = {
    'Accept': 'text/plain',
    'X-Return-Format': 'markdown',
    'X-Timeout': '10'
  };
  if (jinaApiKey) {
    headers['Authorization'] = `Bearer ${jinaApiKey}`;
  }

  const res = await fetchWithTimeout(jinaUrl, { headers }, 20000);
  if (!res.ok) throw new Error(`Jina Reader HTTP ${res.status} for ${url}`);

  const text = await res.text();
  if (!text || text.length < 100) throw new Error('Jina returned empty content');
  return text;
}

// ─── Provider 1b: Jina AI Search ─────────────────────────────────────────────
// Web search → list of URLs + snippets. Free tier with or without key.
// Docs: https://jina.ai/search/
export async function searchViaJina(query, jinaApiKey = '') {
  const encodedQuery = encodeURIComponent(query);
  const jinaUrl = `https://s.jina.ai/${encodedQuery}`;

  const headers = {
    'Accept': 'application/json',
    'X-Return-Format': 'json'
  };
  if (jinaApiKey) {
    headers['Authorization'] = `Bearer ${jinaApiKey}`;
  }

  const res = await fetchWithTimeout(jinaUrl, { headers }, 20000);
  if (!res.ok) throw new Error(`Jina Search HTTP ${res.status}`);

  const text = await res.text();
  // Jina returns either JSON or structured text depending on Accept header
  try {
    const data = JSON.parse(text);
    // Jina response: { data: [ { url, title, description, content } ] }
    return (data?.data || data?.results || []).map(r => ({
      url: r.url,
      title: r.title || '',
      snippet: r.description || r.content?.slice(0, 300) || ''
    }));
  } catch {
    // Parse text format: Title\nURL\nSnippet blocks
    const blocks = text.split(/\n\n+/);
    return blocks.map(b => {
      const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
      const urlLine = lines.find(l => l.startsWith('http'));
      return { url: urlLine || '', title: lines[0] || '', snippet: lines.slice(2).join(' ') };
    }).filter(r => r.url);
  }
}

// ─── Provider 2: Firecrawl v1 ─────────────────────────────────────────────────
// 500 free credits/month. Renders JS, extracts structured data.
// Docs: https://docs.firecrawl.dev/api-reference/endpoint/scrape
export async function scrapeViaFirecrawl(url, firecrawlApiKey, extractSchema = null) {
  if (!firecrawlApiKey) throw new Error('Firecrawl API key not configured');

  const body = {
    url,
    formats: extractSchema ? ['markdown', 'extract'] : ['markdown'],
    actions: [],
    waitFor: 1000,
    timeout: 15000
  };

  if (extractSchema) {
    body.extract = {
      schema: extractSchema,
      prompt: 'Extract the requested information from this business website page.'
    };
  }

  const res = await fetchWithTimeout('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firecrawlApiKey}`
    },
    body: JSON.stringify(body)
  }, 30000);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Firecrawl ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.success) throw new Error(`Firecrawl failed: ${data.error || 'unknown'}`);

  return {
    markdown: data.data?.markdown || '',
    extract: data.data?.extract || null,
    metadata: data.data?.metadata || {}
  };
}

// ─── Provider 3: Direct Fetch + HTML Strip ────────────────────────────────────
// Always available. Strips HTML tags to get readable text.
export async function scrapeViaDirectFetch(url) {
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  }, 10000);

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();

  // Strip HTML to readable text
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000);

  if (text.length < 50) throw new Error('Page content too short or blocked');
  return text;
}

// ─── Master: scrapeUrl (cascading providers) ──────────────────────────────────
/**
 * Scrape a URL and return clean text content.
 * Tries providers in priority order, returns first success.
 *
 * @param {string} url
 * @param {object} opts
 * @param {object} opts.extractSchema - Optional Firecrawl extraction schema
 * @param {boolean} opts.preferFirecrawl - Force Firecrawl first
 * @returns {Promise<{content: string, source: string, extract?: object}>}
 */
export async function scrapeUrl(url, opts = {}) {
  const cfg = loadScraperConfig();
  const jinaKey = cfg.keys?.jina || process.env.JINA_API_KEY || '';
  const firecrawlKey = cfg.keys?.firecrawl || process.env.FIRECRAWL_API_KEY || '';
  const { extractSchema, preferFirecrawl } = opts;

  const providers = [];

  // Order based on config + available keys
  if (preferFirecrawl && firecrawlKey) {
    providers.push('firecrawl');
    providers.push('jina');
  } else {
    providers.push('jina'); // always try Jina first (free)
    if (firecrawlKey) providers.push('firecrawl');
  }
  providers.push('direct'); // always fallback

  for (const provider of providers) {
    try {
      switch (provider) {
        case 'jina': {
          const content = await scrapeViaJina(url, jinaKey);
          return { content, source: 'jina' };
        }
        case 'firecrawl': {
          const result = await scrapeViaFirecrawl(url, firecrawlKey, extractSchema);
          return { content: result.markdown, source: 'firecrawl', extract: result.extract, metadata: result.metadata };
        }
        case 'direct': {
          const content = await scrapeViaDirectFetch(url);
          return { content, source: 'direct' };
        }
      }
    } catch (err) {
      console.warn(`[scraper] ${provider} failed for ${url}: ${err.message}`);
    }
  }

  throw new Error(`All scrapers failed for ${url}`);
}

// ─── CLI Test ─────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const testUrl = process.argv[2] || 'https://example.com';
  console.log(`\n🔍 Scraper Test — URL: ${testUrl}\n`);
  scrapeUrl(testUrl)
    .then(r => {
      console.log(`✅ Source: ${r.source} | Length: ${r.content.length} chars`);
      console.log('\n--- Content Preview (first 500 chars) ---');
      console.log(r.content.slice(0, 500));
    })
    .catch(e => { console.error('❌', e.message); process.exit(1); });
}
