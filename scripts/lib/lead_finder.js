/**
 * scripts/lib/lead_finder.js
 * Production Lead Discovery Engine
 *
 * Sources (in priority order):
 *   1. Google Places API   — real business data (name, phone, website, rating)
 *   2. SerpAPI             — Google Maps results
 *   3. Jina Search         — web search + Firecrawl/Jina directory scraping
 *   4. Synthetic           — last resort: realistic business names when all fail
 *
 * ponytail: zero npm deps, stdlib fetch only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { searchViaJina, scrapeViaJina, scrapeViaFirecrawl } from './scraper_client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, '..', '..', 'config.json');

// ─── Config ───────────────────────────────────────────────────────────────────
function loadLeadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (cfg.leadFinder) return cfg.leadFinder;
    return {
      primarySource: 'jina_search',
      keys: {
        googlePlaces: cfg.googlePlacesApiKey || '',
        serpApi: cfg.serpApiKey || ''
      }
    };
  } catch {
    return { primarySource: 'jina_search', keys: {} };
  }
}

function loadScraperKeys() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return {
      firecrawl: cfg.scraping?.keys?.firecrawl || cfg.firecrawlApiKey || '',
      jina: cfg.scraping?.keys?.jina || cfg.jinaApiKey || ''
    };
  } catch { return {}; }
}

// ─── Fetch Helper ─────────────────────────────────────────────────────────────
async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Slugify ──────────────────────────────────────────────────────────────────
export function slugifyBusiness(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

// ─── Source 1: Google Places API ─────────────────────────────────────────────
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
async function findViaGooglePlaces(niche, city, count, apiKey) {
  if (!apiKey) throw new Error('Google Places API key not configured');

  const query = encodeURIComponent(`${niche} in ${city}`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}&type=${googlePlaceType(niche)}`;

  const res = await fetchWithTimeout(url, {}, 10000);
  if (!res.ok) throw new Error(`Google Places HTTP ${res.status}`);

  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places error: ${data.status} — ${data.error_message || ''}`);
  }

  const results = (data.results || []).slice(0, count);
  const leads = [];

  for (const place of results) {
    // Fetch place details for website + phone + contact
    let website = '';
    let phone = '';
    let address = place.formatted_address || city;

    if (place.place_id) {
      try {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=website,formatted_phone_number,formatted_address&key=${apiKey}`;
        const detailRes = await fetchWithTimeout(detailUrl, {}, 8000);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          website = detail.result?.website || '';
          phone = detail.result?.formatted_phone_number || '';
          address = detail.result?.formatted_address || address;
        }
      } catch {}
    }

    leads.push({
      businessName: place.name,
      url: website || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + city)}`,
      phone: phone || '',
      address,
      city,
      niche,
      rating: place.rating || null,
      reviewCount: place.user_ratings_total || 0,
      placeId: place.place_id || '',
      ownerName: 'Business Owner',
      ownerEmail: '',
      source: 'google_places',
      slug: slugifyBusiness(place.name)
    });
  }

  console.log(`  ✅ [Google Places] Found ${leads.length} real businesses`);
  return leads;
}

function googlePlaceType(niche) {
  const m = {
    restaurant: 'restaurant',
    medical: 'health',
    trade: 'plumber|electrician|contractor',
    professional: 'lawyer|accountant'
  };
  return m[niche] || 'establishment';
}

// ─── Source 2: SerpAPI (Google Maps Engine) ───────────────────────────────────
// Docs: https://serpapi.com/google-maps-api
async function findViaSerpApi(niche, city, count, apiKey) {
  if (!apiKey) throw new Error('SerpAPI key not configured');

  const params = new URLSearchParams({
    engine: 'google_maps',
    q: `${niche} in ${city}`,
    api_key: apiKey,
    type: 'search',
    num: String(Math.min(count, 20))
  });

  const res = await fetchWithTimeout(`https://serpapi.com/search?${params}`, {}, 15000);
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(`SerpAPI: ${data.error}`);

  const places = data.local_results || data.places_results || [];
  const leads = places.slice(0, count).map(p => ({
    businessName: p.title || p.name,
    url: p.website || p.link || '',
    phone: p.phone || '',
    address: p.address || city,
    city,
    niche,
    rating: p.rating || null,
    reviewCount: p.reviews || 0,
    ownerName: 'Business Owner',
    ownerEmail: '',
    source: 'serpapi',
    slug: slugifyBusiness(p.title || p.name || 'business')
  })).filter(l => l.businessName);

  console.log(`  ✅ [SerpAPI] Found ${leads.length} businesses`);
  return leads;
}

// ─── Source 3: Jina Search + Directory Scraping ──────────────────────────────
// Uses Jina to search for "[niche] [city] site:yelp.com" etc.
async function findViaJinaSearch(niche, city, count, keys) {
  const query = `best ${niche} businesses in ${city} contact website`;
  console.log(`  🔍 [Jina Search] Searching: "${query}"...`);

  const results = await searchViaJina(query, keys.jina || '');
  const leads = [];
  const seen = new Set();

  for (const r of results.slice(0, 20)) {
    if (!r.url || seen.has(r.url)) continue;
    if (r.url.includes('yelp.com/biz/') || r.url.includes('yellowpages.com/') || r.url.match(/\.(gov|edu|org|wikipedia)$/)) continue;

    // Skip obvious directories, keep business sites
    const titleLower = (r.title || '').toLowerCase();
    if (titleLower.includes('yelp') || titleLower.includes('yellowpages') || titleLower.includes('tripadvisor')) continue;

    const name = extractBusinessName(r.title, niche, city);
    if (!name) continue;
    seen.add(r.url);

    leads.push({
      businessName: name,
      url: r.url,
      phone: '',
      address: city,
      city,
      niche,
      rating: null,
      reviewCount: 0,
      ownerName: 'Business Owner',
      ownerEmail: '',
      snippet: r.snippet || '',
      source: 'jina_search',
      slug: slugifyBusiness(name)
    });
    if (leads.length >= count) break;
  }

  // If not enough from search, also try scraping Yelp directory via Jina
  if (leads.length < count) {
    const yelpLeads = await findViaYelpJina(niche, city, count - leads.length, keys);
    leads.push(...yelpLeads);
  }

  console.log(`  ✅ [Jina Search] Found ${leads.length} leads`);
  return leads;
}

function extractBusinessName(title, niche, city) {
  if (!title) return null;
  // Remove city name and generic suffixes from title
  let name = title
    .replace(/\s*[-|–—·]\s*.+$/, '') // strip "- City" or "| Yelp" suffixes
    .replace(new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
    .replace(/\b(restaurant|plumber|dentist|lawyer|inc|llc|ltd|co)\b/gi, m => m) // keep business words
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length < 3 || name.length > 70) return null;
  if (/^(home|index|welcome|about|contact|menu|services?)$/i.test(name)) return null;
  return name;
}

// ─── Source 3b: Yelp via Jina Reader ─────────────────────────────────────────
async function findViaYelpJina(niche, city, count, keys) {
  const nicheMap = {
    restaurant: 'restaurants', medical: 'dentists',
    trade: 'plumbing', professional: 'lawyers'
  };
  const category = nicheMap[niche] || niche;
  const citySlug = city.toLowerCase().replace(/,?\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const yelpUrl = `https://www.yelp.com/search?find_desc=${category}&find_loc=${encodeURIComponent(city)}`;

  try {
    let content;
    const firecrawlKey = keys.firecrawl || '';

    if (firecrawlKey) {
      // Use Firecrawl to get structured extraction from Yelp
      const result = await scrapeViaFirecrawl(yelpUrl, firecrawlKey, {
        type: 'object',
        properties: {
          businesses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                phone: { type: 'string' },
                address: { type: 'string' },
                website: { type: 'string' },
                rating: { type: 'number' }
              }
            }
          }
        }
      });
      if (result.extract?.businesses?.length) {
        return result.extract.businesses.slice(0, count).map(b => ({
          businessName: b.name,
          url: b.website || '',
          phone: b.phone || '',
          address: b.address || city,
          city, niche,
          rating: b.rating || null,
          ownerName: 'Business Owner', ownerEmail: '',
          source: 'firecrawl_yelp',
          slug: slugifyBusiness(b.name)
        })).filter(l => l.businessName);
      }
      content = result.markdown;
    } else {
      // Use Jina Reader (free) to read Yelp
      content = await scrapeViaJina(yelpUrl, keys.jina || '');
    }

    // Parse business names from markdown content
    return parseBusinessesFromYelpMarkdown(content, niche, city, count);
  } catch (err) {
    console.warn(`  ⚠️  Yelp scrape failed: ${err.message}`);
    return [];
  }
}

function parseBusinessesFromYelpMarkdown(markdown, niche, city, count) {
  const leads = [];
  const seen = new Set();

  // Yelp markdown has business names as headers or bold text
  const patterns = [
    /^#+\s+(\d+\.\s+)?([A-Z][a-zA-Z0-9\s'&\-]{3,50})/gm,          // ## 1. Business Name
    /\*\*([A-Z][a-zA-Z0-9\s'&\-\.]{3,50})\*\*/g,                    // **Business Name**
    /^\d+\.\s+([A-Z][a-zA-Z0-9\s'&\-\.]{3,50})/gm                   // 1. Business Name
  ];

  const NOISE = /^(restaurants?|dentists?|plumbers?|lawyers?|top|best|local|near|yelp|home|all|more|search|find|open|closed|business|service|review|photo|map|filter|sort|category|add|write|see|click|page|login|sign)$/i;
  const phoneRegex = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;
  const phones = [...(markdown.matchAll(phoneRegex))].map(m => m[0]);

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(markdown)) !== null) {
      const raw = m[m.length - 1].trim(); // last capture group
      if (!raw || NOISE.test(raw) || seen.has(raw) || raw.length < 4 || raw.length > 60) continue;
      if (/\?|\!|http/.test(raw)) continue;
      seen.add(raw);
      leads.push({
        businessName: raw,
        url: '',
        phone: phones[leads.length] || '',
        address: city, city, niche,
        ownerName: 'Business Owner', ownerEmail: '',
        source: 'yelp_jina',
        slug: slugifyBusiness(raw)
      });
      if (leads.length >= count) break;
    }
    if (leads.length >= count) break;
  }

  return leads;
}

// ─── Source 4: Synthetic (Last Resort) ───────────────────────────────────────
const SYNTHETIC_DB = {
  restaurant: [
    ['Oak & Ember Bistro', '(512) 445-7832', 'oakemberbistro.com'],
    ['Harvest Table Kitchen', '(512) 332-9148', 'harvesttablekitchen.com'],
    ['The Blue Plate Café', '(512) 887-4231', 'blueplatecafe.com'],
    ['Canyon Ridge Steakhouse', '(512) 664-2890', 'canyonridgesteakhouse.com'],
    ['Solstice Farm-to-Table', '(512) 773-4512', 'solsticeft.com'],
    ['Copper Kettle Diner', '(512) 338-6790', 'copperkettlediner.com']
  ],
  medical: [
    ['Summit Dental Studio', '(512) 445-2100', 'summitdentalstudio.com'],
    ['Lakeside Family Medicine', '(512) 332-8850', 'lakesidefamilymed.com'],
    ['Prestige Orthodontics', '(512) 667-5523', 'prestigeortho.com'],
    ['Clearview Eye Center', '(512) 774-3390', 'clearvieweyecenter.com'],
    ['Beacon Health Clinic', '(512) 889-1200', 'beaconhealthclinic.com']
  ],
  trade: [
    ['Summit Peak Plumbing', '(512) 445-3322', 'summitpeakplumbing.com'],
    ['Ironclad Electric', '(512) 338-7755', 'ironcladelectric.com'],
    ['Precision HVAC Services', '(512) 662-5544', 'precisionhvac.com'],
    ['Apex Roofing Pros', '(512) 774-2288', 'apexroofingpros.com'],
    ['BlueStar Landscaping', '(512) 887-6611', 'bluestarlandscaping.com']
  ],
  professional: [
    ['Whitmore & Associates Law', '(512) 445-1234', 'whitmorelegal.com'],
    ['Thornfield CPA Group', '(512) 332-4567', 'thornfieldcpa.com'],
    ['Meridian Business Consulting', '(512) 665-7890', 'meridianconsult.com'],
    ['Atlas Financial Planning', '(512) 774-2345', 'atlasfinancial.com'],
    ['Sterling HR Solutions', '(512) 887-5678', 'sterlinghr.com']
  ]
};

const OWNER_NAMES = ['Robert Miller', 'Sarah Chen', 'James Wilson', 'Maria Gonzalez', 'David Park', 'Jennifer Smith', 'Michael Torres', 'Emily Johnson'];

function generateSyntheticLeads(niche, city, count) {
  const pool = SYNTHETIC_DB[niche] || SYNTHETIC_DB.trade;
  const results = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const [name, phone, domain] = pool[i];
    const cityName = city.split(',')[0].toLowerCase().replace(/\s+/g, '');
    results.push({
      businessName: name,
      url: `https://www.${domain}`,
      phone,
      address: `${100 + i * 50} Main St, ${city}`,
      city,
      niche,
      rating: (3.5 + Math.random() * 1.5).toFixed(1),
      reviewCount: Math.floor(Math.random() * 150) + 20,
      ownerName: OWNER_NAMES[i % OWNER_NAMES.length],
      ownerEmail: `contact@${domain}`,
      source: 'synthetic',
      slug: slugifyBusiness(name),
      isSynthetic: true
    });
  }
  return results;
}

// ─── Master: findLeads ────────────────────────────────────────────────────────
/**
 * Discover real local businesses for a niche + city.
 * Cascades through configured sources.
 *
 * @param {object} opts
 * @param {string} opts.niche
 * @param {string} opts.city
 * @param {number} opts.count
 * @param {string[]} opts.excludeSlugs - Already in pipeline
 * @returns {Promise<Lead[]>}
 */
export async function findLeads({ niche = 'restaurant', city = 'Austin, TX', count = 5, excludeSlugs = [] } = {}) {
  const cfg = loadLeadConfig();
  const scraperKeys = loadScraperKeys();
  const googleKey = cfg.keys?.googlePlaces || process.env.GOOGLE_PLACES_API_KEY || '';
  const serpKey = cfg.keys?.serpApi || process.env.SERP_API_KEY || '';
  const jinaKey = scraperKeys.jina || process.env.JINA_API_KEY || '';

  let allLeads = [];
  const excludeSet = new Set(excludeSlugs);

  // Determine which sources to try based on configured keys
  const sources = [];
  if (googleKey) sources.push('google_places');
  if (serpKey) sources.push('serpapi');
  sources.push('jina_search'); // Always try Jina Search (free)
  sources.push('synthetic'); // Last resort

  for (const source of sources) {
    if (allLeads.length >= count) break;
    const needed = count - allLeads.length;

    try {
      let discovered = [];
      switch (source) {
        case 'google_places':
          console.log(`  🗺️  [Google Places] Searching "${niche}" in ${city}...`);
          discovered = await findViaGooglePlaces(niche, city, needed + 5, googleKey);
          break;
        case 'serpapi':
          console.log(`  🗺️  [SerpAPI] Searching "${niche}" in ${city}...`);
          discovered = await findViaSerpApi(niche, city, needed + 5, serpKey);
          break;
        case 'jina_search':
          discovered = await findViaJinaSearch(niche, city, needed + 5, { jina: jinaKey, firecrawl: scraperKeys.firecrawl });
          break;
        case 'synthetic':
          console.log(`  ⚠️  Using synthetic fallback for ${city}/${niche} (no real source available)`);
          discovered = generateSyntheticLeads(niche, city, needed + 2);
          break;
      }

      // Deduplicate + filter already-in-pipeline
      const filtered = discovered.filter(l => {
        const slug = l.slug || slugifyBusiness(l.businessName);
        if (excludeSet.has(slug)) return false;
        excludeSet.add(slug);
        return true;
      });

      allLeads.push(...filtered);
    } catch (err) {
      console.warn(`  ⚠️  Source "${source}" failed: ${err.message}`);
    }
  }

  return allLeads.slice(0, count);
}

// ─── CLI Test ─────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const niche = process.argv.find(a => a.startsWith('--niche='))?.split('=')[1] || 'restaurant';
  const city = process.argv.find(a => a.startsWith('--city='))?.split('=')[1] || 'Austin, TX';
  const count = parseInt(process.argv.find(a => a.startsWith('--count='))?.split('=')[1] || '3');

  console.log(`\n🕵️  Lead Finder Test — Niche: ${niche} | City: ${city} | Count: ${count}\n`);
  findLeads({ niche, city, count }).then(leads => {
    console.log(`\n✅ Found ${leads.length} leads:\n`);
    leads.forEach((l, i) => {
      console.log(`  ${i + 1}. [${l.source}] ${l.businessName}`);
      console.log(`     URL: ${l.url || '—'} | Phone: ${l.phone || '—'} | Rating: ${l.rating || '—'}`);
    });
  }).catch(e => { console.error('❌', e.message); process.exit(1); });
}
