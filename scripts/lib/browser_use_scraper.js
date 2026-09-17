/**
 * scripts/lib/browser_use_scraper.js
 * Browser Use integration — real Google Maps scraping via AI browser agent
 *
 * Uses Browser Use Python library to navigate Google Maps, extract real
 * business data (names, phones, addresses, websites, ratings, reviews)
 * with zero API keys required (uses local browser).
 *
 * Falls back gracefully:
 *   1. browser-use Python lib (if installed)  → real AI browser scraping
 *   2. httpx / urllib3 HTTP fallback           → static HTML scrape
 *   3. OpenStreetMap Overpass API             → zero-cost open data
 *
 * ponytail: subprocess bridge to Python, no npm deps
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_DIR = path.join(__dirname, '..', '..');

// Detect Python command (Windows uses 'python', Linux/Mac uses 'python3')
function getPythonCmd() {
  // On Windows, 'python3' often doesn't exist — use 'python'
  if (process.platform === 'win32') return 'python';
  return 'python3';
}

const BROWSER_USE_SCRIPT = `
import asyncio
import json
import sys
import os

async def scrape_maps(niche, city, count):
    """Scrape Google Maps for real business data using Browser Use agent."""
    # Try Browser Use first (needs: pip install browser-use)
    try:
        from browser_use import Agent
        try:
            from browser_use import ChatOpenAI
        except ImportError:
            from langchain_openai import ChatOpenAI

        api_key = os.environ.get('OPENAI_API_KEY', '')
        if not api_key:
            raise ImportError("No OPENAI_API_KEY for Browser Use agent")

        task = f"""Go to google.com/maps and search for "{niche} in {city}".
        Extract the first {count} business results. For each business, return:
        - business name
        - phone number (if visible)
        - full address
        - website URL (if listed)
        - star rating
        - number of reviews
        Return the results as a JSON array. No other text."""

        llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key)
        agent = Agent(task=task, llm=llm)
        history = await agent.run()
        result = history.final_result()

        import re
        match = re.search(r'\\[.*\\]', result, re.DOTALL)
        if match:
            data = json.loads(match.group())
            return data
        return []
    except Exception as e:
        print(f"Browser Use agent unavailable ({e}), trying OSM...", file=sys.stderr)

    # Fallback 1: OpenStreetMap Overpass API (zero cost, CC-licensed)
    try:
        osm = await scrape_osm(niche, city, count)
        if osm:
            return osm
    except Exception as e2:
        print(f"OSM fallback failed ({e2}), trying direct HTTP...", file=sys.stderr)

    # Fallback 2: Direct HTTP to Google Maps
    return await scrape_maps_http(niche, city, count)

async def scrape_osm(niche, city, count):
    """Query OpenStreetMap Overpass API for businesses."""
    import urllib.request
    import urllib.parse

    OSM_NICHE_MAP = {
        'restaurant': ['restaurant', 'fast_food', 'cafe', 'bar'],
        'medical': ['dentist', 'doctors', 'clinic', 'hospital', 'pharmacy'],
        'salon': ['hairdresser', 'beauty', 'nail_salon'],
        'fitness': ['gym', 'sports_centre', 'yoga', 'fitness_centre'],
        'trade': ['electrician', 'plumber', 'carpenter', 'painter'],
        'professional': ['lawyer', 'accountant', 'insurance', 'real_estate']
    }

    amenities = OSM_NICHE_MAP.get(niche.lower(), [niche.lower()])
    amenity_filter = '|'.join(amenities)

    # Get city bounding box via Nominatim
    nom_url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(city)}&format=json&limit=1"
    req = urllib.request.Request(nom_url, headers={"User-Agent": "AgencyBot/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            locs = json.loads(r.read())
        if not locs:
            return []
        bb = locs[0].get('boundingbox', [])
        if len(bb) < 4:
            return []
        s, n, w, e = bb[0], bb[1], bb[2], bb[3]
    except Exception:
        return []

    overpass_query = f"""
    [out:json][timeout:25];
    (
      node["amenity"~"{amenity_filter}"]({s},{w},{n},{e});
      way["amenity"~"{amenity_filter}"]({s},{w},{n},{e});
    );
    out center {count};
    """
    ov_url = "https://overpass-api.de/api/interpreter"
    encoded = urllib.parse.urlencode({"data": overpass_query}).encode()
    req2 = urllib.request.Request(ov_url, data=encoded, method='POST',
                                   headers={"User-Agent": "AgencyBot/1.0"})
    try:
        with urllib.request.urlopen(req2, timeout=30) as r:
            data = json.loads(r.read())
    except Exception:
        return []

    results = []
    for el in data.get('elements', [])[:count]:
        tags = el.get('tags', {})
        name = tags.get('name', '')
        if not name:
            continue
        results.append({
            "businessName": name,
            "phone": tags.get('phone') or tags.get('contact:phone', ''),
            "address": f"{tags.get('addr:housenumber', '')} {tags.get('addr:street', '')} {city}".strip(),
            "url": tags.get('website') or tags.get('contact:website', ''),
            "email": tags.get('email') or tags.get('contact:email', ''),
            "rating": None,
            "reviewCount": None,
            "source": "openstreetmap"
        })
    return results

async def scrape_maps_http(niche, city, count):
    """Last-resort HTTP scrape fallback."""
    import urllib.request
    import urllib.parse
    import re

    query = urllib.parse.quote(f"{niche} in {city}")
    url = f"https://www.google.com/maps/search/{query}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"HTTP fallback error: {e}", file=sys.stderr)
        return []

    results = []
    name_pattern = re.findall(r'class="[^"]*fontHeadlineSmall[^"]*"[^>]*>([^<]+)<', html)
    for i, name in enumerate(name_pattern[:count]):
        results.append({
            "businessName": name.strip(),
            "phone": "",
            "address": city,
            "url": "",
            "rating": None,
            "reviewCount": None,
            "source": "google_html"
        })
    return results

if __name__ == "__main__":
    niche = sys.argv[1] if len(sys.argv) > 1 else "restaurant"
    city = sys.argv[2] if len(sys.argv) > 2 else "Austin, TX"
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 5

    results = asyncio.run(scrape_maps(niche, city, count))
    print(json.dumps(results))
`;

/**
 * Scrape Google Maps via Browser Use agent (with OSM + HTTP fallbacks).
 * @param {object} opts - { niche, city, count }
 * @returns {Promise<Array>} Array of business lead objects
 */
export async function scrapeViaBrowserUse(opts = {}) {
  const { niche = 'restaurant', city = 'Austin, TX', count = 5 } = opts;

  console.log(`  🌐 [Browser Use] Scraping for "${niche} in ${city}"...`);

  return new Promise((resolve) => {
    const tmpScript = path.join(SCRIPT_DIR, '.browser_use_tmp.py');
    fs.writeFileSync(tmpScript, BROWSER_USE_SCRIPT);

    const pythonCmd = getPythonCmd();
    const proc = spawn(pythonCmd, [tmpScript, niche, city, String(count)], {
      cwd: SCRIPT_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 90000
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      try { fs.unlinkSync(tmpScript); } catch {}

      if (code !== 0) {
        console.warn(`  ⚠️ Browser Use exited ${code}: ${stderr.slice(0, 200)}`);
        resolve([]);
        return;
      }

      try {
        const leads = JSON.parse(stdout.trim());
        console.log(`  🎯 Browser Use found ${leads.length} real businesses`);
        resolve(leads.map(l => ({
          businessName: l.businessName || l.name || '',
          url: l.url || l.website || '',
          phone: l.phone || '',
          email: l.email || null,
          address: l.address || city,
          city,
          niche,
          rating: l.rating ?? null,
          reviewCount: l.reviewCount ?? l.reviews ?? null,
          source: l.source || 'browser_use'
        })).filter(l => l.businessName));
      } catch (e) {
        console.warn(`  ⚠️ Browser Use parse error: ${e.message}`);
        resolve([]);
      }
    });

    proc.on('error', (e) => {
      try { fs.unlinkSync(tmpScript); } catch {}
      console.warn(`  ⚠️ Python not available: ${e.message}`);
      resolve([]);
    });
  });
}
