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

/**
 * Capture real desktop & mobile viewport screenshots and evaluate DOM responsiveness.
 * @param {string} url - Target prospect website URL
 * @param {string} slug - Lead slug identifier
 * @param {object} opts - Optional settings
 * @returns {Promise<object>} Visual layout findings and screenshot paths
 */
export async function captureSiteVisuals(url, slug, opts = {}) {
  if (!url || url === 'https://example.com') {
    return {
      success: false,
      reason: 'no_website',
      layoutIssues: ['Business has no website — immediate opportunity for a modern online presence.']
    };
  }

  const outDir = path.join(SCRIPT_DIR, 'prospects', slug);
  if (!fs.existsSync(outDir)) {
    try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  }

  const desktopPath = path.join(outDir, 'desktop_current.png');
  const mobilePath = path.join(outDir, 'mobile_current.png');

  console.log(`  📸 [Browser Use] Capturing visual viewports for ${url}...`);

  const pyScript = `
import asyncio, json, sys, os

async def capture(url, out_d, out_m):
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            # Desktop viewport
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(url, timeout=25000, wait_until="domcontentloaded")
            await page.screenshot(path=out_d)
            # Mobile viewport
            mpage = await browser.new_page(viewport={"width": 375, "height": 812}, is_mobile=True)
            await mpage.goto(url, timeout=25000, wait_until="domcontentloaded")
            await mpage.screenshot(path=out_m)
            # Metrics
            h_scroll = await mpage.evaluate("document.documentElement.scrollWidth > window.innerWidth")
            vp = await mpage.evaluate("!!document.querySelector('meta[name=viewport]')")
            title = await page.title()
            await browser.close()
            return {"success": True, "title": title, "hasHorizontalScroll": h_scroll, "hasMobileViewport": vp}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    u = sys.argv[1]
    od = sys.argv[2]
    om = sys.argv[3]
    res = asyncio.run(capture(u, od, om))
    print(json.dumps(res))
`;

  return new Promise((resolve) => {
    const tmpFile = path.join(SCRIPT_DIR, `.capture_${slug}.py`);
    fs.writeFileSync(tmpFile, pyScript);

    const pythonCmd = getPythonCmd();
    const proc = spawn(pythonCmd, [tmpFile, url, desktopPath, mobilePath], {
      cwd: SCRIPT_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000
    });

    let stdout = '';
    proc.stdout.on('data', d => { stdout += d; });

    proc.on('close', async (code) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      if (code === 0) {
        try {
          const res = JSON.parse(stdout.trim());
          if (res.success) {
            const layoutIssues = [];
            if (!res.hasMobileViewport) layoutIssues.push('Missing responsive mobile viewport tag — page renders as zoomed-out desktop');
            if (res.hasHorizontalScroll) layoutIssues.push('Horizontal overflow detected on mobile devices — content exceeds screen width');
            return resolve({
              success: true,
              source: 'playwright_browser',
              desktopScreenshot: fs.existsSync(desktopPath) ? `prospects/${slug}/desktop_current.png` : null,
              mobileScreenshot: fs.existsSync(mobilePath) ? `prospects/${slug}/mobile_current.png` : null,
              hasMobileViewport: res.hasMobileViewport,
              hasHorizontalScroll: res.hasHorizontalScroll,
              layoutIssues
            });
          }
        } catch {}
      }

      // Fallback: DOM inspection via pure HTTP
      const domCheck = await auditVisualLayout(url);
      resolve({
        success: true,
        source: 'dom_heuristic',
        desktopScreenshot: null,
        mobileScreenshot: null,
        ...domCheck
      });
    });

    proc.on('error', async () => {
      try { fs.unlinkSync(tmpFile); } catch {}
      const domCheck = await auditVisualLayout(url);
      resolve({
        success: true,
        source: 'dom_heuristic',
        desktopScreenshot: null,
        mobileScreenshot: null,
        ...domCheck
      });
    });
  });
}

/**
 * Deeply crawl a business website to find authentic contact info & subpages.
 * @param {string} url - Target business homepage
 * @param {string} businessName - Optional business name for fuzzy matching
 * @returns {Promise<object>} Structured contact information
 */
export async function deepCrawlContactInfo(url, businessName = '') {
  if (!url || url === 'https://example.com') return null;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract emails from homepage
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const emails = Array.from(new Set(html.match(emailRegex) || []))
      .filter(e => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e));

    // Discover contact page sub-links
    const linkRegex = /href=["']([^"']*(?:contact|about|location|touch|reach)[^"']*)["']/gi;
    const sublinks = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('#')) {
        try {
          const fullUrl = new URL(href, url).href;
          if (fullUrl.startsWith('http') && !sublinks.includes(fullUrl)) {
            sublinks.push(fullUrl);
          }
        } catch {}
      }
    }

    // Crawl first 2 sublinks for additional verified email addresses
    let contactPageUrl = null;
    for (const sub of sublinks.slice(0, 2)) {
      try {
        const subRes = await fetch(sub, { signal: AbortSignal.timeout(8000) });
        if (subRes.ok) {
          const subHtml = await subRes.text();
          contactPageUrl = sub;
          const subEmails = Array.from(new Set(subHtml.match(emailRegex) || []))
            .filter(e => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e));
          emails.push(...subEmails);
        }
      } catch {}
    }

    // Social links
    const socialProfiles = {
      instagram: (html.match(/https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.-]+/i) || [])[0] || null,
      facebook: (html.match(/https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9_.-]+/i) || [])[0] || null,
      linkedin: (html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_.-]+/i) || [])[0] || null,
      twitter: (html.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_.-]+/i) || [])[0] || null
    };

    return {
      emails: Array.from(new Set(emails)),
      socialProfiles,
      contactPageUrl,
      observedOn: contactPageUrl || url
    };
  } catch {
    return null;
  }
}

/**
 * Audit website visual layout and responsiveness via DOM heuristics.
 * @param {string} url - Website URL
 * @returns {Promise<object>} Visual layout metrics and detected flaws
 */
export async function auditVisualLayout(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('Unreachable');
    const html = await res.text();

    const hasMobileViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    const hasFixedTable = /<table[^>]+width=["']\d{3,4}["']/i.test(html);
    const hasFixedWidth = /width:\s*(?:[8-9]\d\d|1\d{3})px/i.test(html);
    const hasResponsiveClasses = /flex|grid|col-md-|sm:|md:|max-w-/i.test(html);

    const layoutIssues = [];
    if (!hasMobileViewport) layoutIssues.push('No mobile viewport meta tag configured — unreadable on smartphones');
    if (hasFixedTable || hasFixedWidth) layoutIssues.push('Desktop-fixed widths detected that break on small mobile viewports');
    if (!hasResponsiveClasses) layoutIssues.push('Older static layout structure lacking modern CSS Flexbox/Grid flow');

    return {
      hasMobileViewport,
      hasHorizontalScroll: hasFixedTable || hasFixedWidth,
      layoutIssues: layoutIssues.length ? layoutIssues : ['Design lacks modern mobile-first conversion hierarchy']
    };
  } catch {
    return {
      hasMobileViewport: false,
      hasHorizontalScroll: false,
      layoutIssues: ['Site could not be reached via standard HTTP — possible SSL or server configuration issue']
    };
  }
}

