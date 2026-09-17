/**
 * scraper_engine.js — Automated Lead Discovery
 * 
 * Sources real local businesses with outdated/no websites.
 * Strategy A: SerpAPI (if key present in config)
 * Strategy B: Yelp public HTML scrape (free, no key needed)
 * Strategy C: Google search HTML scrape (free fallback)
 * 
 * ponytail: stdlib first, fetch only, no npm installs required
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { isJunkBusinessName, assertNotSynthetic } from './lib/guardrails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');

// ─── Config Loader ────────────────────────────────────────────────────────────
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { targetCities: ['Austin, TX'], targetNiches: ['restaurant'], leadsPerRun: 5, scrapeDelayMs: 2000 };
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

// ─── Pipeline Loader ──────────────────────────────────────────────────────────
function loadPipeline() {
  if (!fs.existsSync(PIPELINE_FILE)) {
    return { agency_name: 'Apex AI Web Studio', last_updated: new Date().toISOString(), prospects: [] };
  }
  try { return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8')); }
  catch { return { agency_name: 'Apex AI Web Studio', last_updated: new Date().toISOString(), prospects: [] }; }
}

function savePipeline(pipeline) {
  pipeline.last_updated = new Date().toISOString();
  const p = pipeline.prospects;
  pipeline.pipeline_summary = {
    total_prospects: p.length,
    discovered: p.filter(x => x.stage === 'DISCOVERED').length,
    audited: p.filter(x => x.stage === 'AUDITED').length,
    demo_generated: p.filter(x => x.stage === 'DEMO_GENERATED').length,
    outreach_drafted: p.filter(x => x.stage === 'OUTREACH_DRAFTED').length,
    contacted: p.filter(x => x.stage === 'CONTACTED').length,
    meeting_scheduled: p.filter(x => x.stage === 'MEETING_SCHEDULED').length,
    closed_won: p.filter(x => x.stage === 'CLOSED_WON').length,
    closed_lost: p.filter(x => x.stage === 'CLOSED_LOST').length,
    pipeline_value_usd: p.filter(x => x.stage !== 'CLOSED_LOST').length * 1500
  };
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(pipeline, null, 2), 'utf-8');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(text) {
  return (text || 'lead').toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Map niche keyword to our 4 standard templates
function resolveNiche(raw = '') {
  const k = raw.toLowerCase();
  if (/pizza|restaur|food|cafe|bistro|diner|sushi|grill|bbq|taco|bar\b/.test(k)) return 'restaurant';
  if (/dent|medic|clinic|doctor|spa|physio|chiro|optom|vet/.test(k)) return 'medical';
  if (/plumb|electric|hvac|roof|paint|contract|handyman|flooring|construct/.test(k)) return 'trade';
  if (/law|legal|cpa|account|estate|consult|financial|insurance/.test(k)) return 'professional';
  return 'trade';
}

// Fetch with timeout + user-agent
async function fetchHtml(url, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── Source A: SerpAPI (if key available) ────────────────────────────────────
async function scrapeViaSerpApi(query, serpApiKey) {
  try {
    const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&api_key=${serpApiKey}&type=search&num=10`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.local_results || [];
    return results.map(r => ({
      businessName: r.title || '',
      url: r.website || '',
      phone: r.phone || '(555) 000-0000',
      city: r.address || '',
      niche: resolveNiche(r.type || query),
      ownerName: 'Business Owner',
      ownerEmail: '',
      source: 'serpapi'
    })).filter(r => r.businessName);
  } catch {
    return [];
  }
}

// ─── Source B: Yelp Public HTML Scrape ───────────────────────────────────────
async function scrapeViaYelp(niche, city) {
  const yelpNicheMap = {
    restaurant: 'restaurants',
    medical: 'dentists',
    trade: 'plumbing',
    professional: 'lawyers'
  };
  const yelpCategory = yelpNicheMap[niche] || 'restaurants';
  const searchUrl = `https://www.yelp.com/search?find_desc=${yelpCategory}&find_loc=${encodeURIComponent(city)}&sortby=rating`;

  console.log(`  🔍 [Yelp Scraper] Fetching: ${yelpCategory} in ${city}...`);
  const html = await fetchHtml(searchUrl, 10000);
  if (!html) {
    console.log(`  ⚠️  [Yelp] No response for ${city} — no leads returned (zero-fabrication policy)`);
    return [];
  }

  const leads = [];
  // Look for Yelp business listing patterns — business names appear in biz links
  const bizNameMatches = [...html.matchAll(/class="[^"]*css-[^"]*"[^>]*>([A-Z][a-zA-Z0-9\s'&\-\.]{3,50})<\/a>/g)];
  const phoneMatches = [...html.matchAll(/(\(\d{3}\)\s?\d{3}[-\s]?\d{4})/g)];

  // Blocklist: navigation noise, question text, platform names, generic category words
  const NOISE = /^(restaurants?|dentists?|plumbers?|lawyers?|services?|find|search|best|top|local|near|about|home|login|sign|write|review|photos?|map|directions?|add|more|all|filter|sort|open|closed|category|what|how|where|who|see|get|view|read|click|next|prev|page|business|yelp|google|bing|yahoo)$/i;
  const isValidName = (n) => {
    if (!n || n.length < 4 || n.length > 60) return false;
    if (/\?|\!|http|\.com|\.org/.test(n)) return false;
    if (NOISE.test(n.trim())) return false;
    if (/^[A-Z][a-z]/.test(n) && n.split(' ').length >= 1) return true; // Title-case suggests business name
    return false;
  };

  const seen = new Set();
  for (const m of bizNameMatches) {
    const name = m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    if (isValidName(name) && !seen.has(name)) {
      seen.add(name);
      const i = leads.length;
      leads.push({
        businessName: name,
        url: '',
        // Only ever store a phone that was actually observed for THIS business.
        // Index-aligned guessing produced wrong numbers — never do that.
        phone: '',
        city,
        niche,
        ownerName: null,
        ownerEmail: null,
        source: 'yelp'
      });
      if (leads.length >= 6) break;
    }
  }

  if (leads.length === 0) {
    console.log(`  ⚠️  [Yelp] 0 valid business names extracted — returning empty (no synthetic padding)`);
    return [];
  }

  console.log(`  ✅ [Yelp] Found ${leads.length} valid business leads`);
  return leads;
}


// ─── Source C: Google Search HTML Scrape ─────────────────────────────────────
async function scrapeViaGoogle(niche, city) {
  const query = `${niche} businesses ${city} site:yelp.com OR site:yellowpages.com`;
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;

  console.log(`  🔍 [Google Scraper] Query: "${query}"`);
  const html = await fetchHtml(searchUrl, 8000);
  if (!html) {
    console.log(`  ⚠️  [Google] Blocked — no leads returned (zero-fabrication policy)`);
    return [];
  }

  // Extract business names from Google results
  const titleMatches = [...html.matchAll(/<h3[^>]*>([^<]{5,60})<\/h3>/g)];
  const leads = [];
  const seen = new Set();

  for (const match of titleMatches) {
    const name = match[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    if (!seen.has(name) && name.length > 5 && !name.includes('Google') && !name.includes('Yelp')) {
      seen.add(name);
      leads.push({
        businessName: name,
        url: '',
        // No phone was observed for this business — leave it unknown rather than invent one.
        phone: '',
        city,
        niche,
        ownerName: null,
        ownerEmail: null,
        source: 'google'
      });
      if (leads.length >= 5) break;
    }
  }

  console.log(`  ✅ [Google] Extracted ${leads.length} potential leads`);
  return leads;
}

// ─── Main Discovery Engine ────────────────────────────────────────────────────
export async function discoverLeads({ targetNiches, targetCities, leadsPerRun, serpApiKey, scrapeDelayMs = 2000 } = {}) {
  const config = loadConfig();
  const niches = targetNiches || config.targetNiches || ['restaurant'];
  const cities = targetCities || config.targetCities || ['Austin, TX'];
  const maxLeads = leadsPerRun || config.leadsPerRun || 5;
  const delay = scrapeDelayMs || config.scrapeDelayMs || 2000;
  const hasSerpKey = !!(serpApiKey || config.serpApiKey);

  console.log(`\n🕵️  LEAD DISCOVERY ENGINE`);
  console.log(`   Niches: ${niches.join(', ')}`);
  console.log(`   Cities: ${cities.join(', ')}`);
  console.log(`   Target: ${maxLeads} new leads | Source: ${hasSerpKey ? 'SerpAPI' : 'Free HTML Scrape'}`);

  const pipeline = loadPipeline();
  const existingSlugs = new Set(pipeline.prospects.map(p => p.slug));
  const newLeads = [];

  for (const niche of niches) {
    if (newLeads.length >= maxLeads) break;
    for (const city of cities) {
      if (newLeads.length >= maxLeads) break;

      await sleep(delay);

      let rawLeads = [];
      if (hasSerpKey) {
        rawLeads = await scrapeViaSerpApi(`${niche} in ${city}`, config.serpApiKey);
      }
      if (rawLeads.length < 2) {
        rawLeads = await scrapeViaYelp(niche, city);
      }
      if (rawLeads.length < 2) {
        rawLeads = await scrapeViaGoogle(niche, city);
      }

      // Filter out already-known leads
      for (const lead of rawLeads) {
        const nameCheck = isJunkBusinessName(lead.businessName);
        if (nameCheck.junk) {
          console.log(`  ️  Skipped junk record "${lead.businessName}" — ${nameCheck.reason}`);
          continue;
        }
        const slug = slugify(lead.businessName);
        if (!existingSlugs.has(slug) && lead.businessName) {
          existingSlugs.add(slug);
          const prospect = {
            slug,
            businessName: lead.businessName,
            // Unknown fields stay empty — never invent a URL, email or phone.
            url: lead.url || '',
            niche,
            city: lead.city || city,
            ownerName: lead.ownerName || null,
            ownerEmail: lead.ownerEmail || null,
            ownerEmailSource: lead.ownerEmailSource || null,
            phone: lead.phone || '',
            overallScore: null,
            stage: 'DISCOVERED',
            source: lead.source || 'scraper',
            demoPath: null,
            outreachPath: null,
            lastAction: new Date().toISOString()
          };
          assertNotSynthetic(prospect, 'discovered lead');
          newLeads.push(prospect);
          pipeline.prospects.push(prospect);
          console.log(`  ✅ Discovered: [${lead.businessName}] (${city}) via ${lead.source || 'scraper'}`);
          if (newLeads.length >= maxLeads) break;
        }
      }
    }
  }

  savePipeline(pipeline);
  console.log(`\n📊 Discovery complete: ${newLeads.length} new leads added to pipeline`);
  return newLeads;
}

// ─── Direct CLI ───────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  discoverLeads(config).catch(err => {
    console.error('❌ Scraper error:', err);
    process.exit(1);
  });
}
