/**
 * scripts/lib/screenshot.js
 * Demo Site Screenshot Service
 *
 * Captures homepage screenshots of deployed demo sites for email embedding.
 * Priority: ScreenshotOne API → urlbox.io → Placeholder card generator
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, '..', '..', 'config.json');
const DEMOS_DIR = path.join(__dirname, '..', '..', 'demos');

function loadScreenshotConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return cfg.screenshot || {};
  } catch {
    return {};
  }
}

// ─── Provider 1: ScreenshotOne API ───────────────────────────────────────────
async function captureViaScreenshotOne(url, apiKey) {
  const params = new URLSearchParams({
    access_key: apiKey,
    url,
    viewport_width: '1280',
    viewport_height: '800',
    device_scale_factor: '2',
    format: 'png',
    block_ads: 'true',
    block_cookie_banners: 'true',
    cache: 'true',
    cache_ttl: '86400'
  });

  const res = await fetch(`https://api.screenshotone.com/take?${params}`, { method: 'GET' });
  if (!res.ok) throw new Error(`ScreenshotOne ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new Error('Screenshot too small — likely failed');
  return buffer;
}

// ─── Provider 2: urlbox.io ───────────────────────────────────────────────────
async function captureViaUrlbox(url, apiKey) {
  const params = new URLSearchParams({
    url,
    width: '1280',
    height: '800',
    retina: 'true',
    format: 'png',
    block_ads: 'true'
  });

  const res = await fetch(`https://api.urlbox.io/v1/${apiKey}/png?${params}`, { method: 'GET' });
  if (!res.ok) throw new Error(`urlbox ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new Error('Screenshot too small');
  return buffer;
}

// ─── Provider 3: SVG Placeholder Card ────────────────────────────────────────
function generatePlaceholderCard(businessName, demoUrl) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e1b4b;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#312e81;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#6366f1" />
      <stop offset="100%" style="stop-color:#8b5cf6" />
    </linearGradient>
  </defs>
  <rect width="1280" height="800" fill="url(#bg)" rx="16"/>
  <!-- Browser chrome -->
  <rect x="40" y="40" width="1200" height="720" rx="12" fill="#0f0e1a" stroke="#3730a3" stroke-width="1"/>
  <rect x="40" y="40" width="1200" height="44" rx="12" fill="#1e1b4b"/>
  <circle cx="72" cy="62" r="6" fill="#ef4444" opacity="0.8"/>
  <circle cx="94" cy="62" r="6" fill="#f59e0b" opacity="0.8"/>
  <circle cx="116" cy="62" r="6" fill="#10b981" opacity="0.8"/>
  <rect x="200" y="52" width="680" height="20" rx="10" fill="#312e81"/>
  <text x="540" y="67" font-family="system-ui, sans-serif" font-size="11" fill="#818cf8" text-anchor="middle">${demoUrl || 'demo.youragency.com'}</text>
  <!-- Content area -->
  <text x="640" y="320" font-family="system-ui, sans-serif" font-size="42" fill="white" text-anchor="middle" font-weight="700">${businessName || 'Your Business'}</text>
  <text x="640" y="370" font-family="system-ui, sans-serif" font-size="18" fill="#a5b4fc" text-anchor="middle">Modern Website Preview — Click to View Live Demo</text>
  <rect x="500" y="410" width="280" height="50" rx="8" fill="url(#accent)"/>
  <text x="640" y="442" font-family="system-ui, sans-serif" font-size="16" fill="white" text-anchor="middle" font-weight="600">👉 View Live Demo</text>
  <!-- Decorative elements -->
  <rect x="120" y="520" width="320" height="160" rx="8" fill="#1e1b4b" stroke="#3730a3" stroke-width="0.5"/>
  <rect x="480" y="520" width="320" height="160" rx="8" fill="#1e1b4b" stroke="#3730a3" stroke-width="0.5"/>
  <rect x="840" y="520" width="320" height="160" rx="8" fill="#1e1b4b" stroke="#3730a3" stroke-width="0.5"/>
</svg>`;

  // Convert SVG to a data URI that can be used as an image
  return Buffer.from(svg, 'utf-8');
}

// ─── Master: captureScreenshot ───────────────────────────────────────────────
/**
 * Capture a screenshot of a demo site.
 *
 * @param {string} url - URL of the demo site to screenshot
 * @param {string} slug - Lead slug for file naming
 * @param {string} businessName - For placeholder card
 * @returns {Promise<{path: string, source: string}>}
 */
export async function captureScreenshot(url, slug, businessName = '') {
  const cfg = loadScreenshotConfig();
  const outDir = path.join(DEMOS_DIR, slug);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const screenshotPath = path.join(outDir, 'screenshot.png');

  // Try real screenshot providers
  const providers = [];
  if (cfg.screenshotOneKey) providers.push({ name: 'screenshotone', fn: () => captureViaScreenshotOne(url, cfg.screenshotOneKey) });
  if (cfg.urlboxKey) providers.push({ name: 'urlbox', fn: () => captureViaUrlbox(url, cfg.urlboxKey) });

  for (const provider of providers) {
    try {
      const buffer = await provider.fn();
      fs.writeFileSync(screenshotPath, buffer);
      console.log(`  📸 Screenshot captured via ${provider.name}: demos/${slug}/screenshot.png`);
      return { path: screenshotPath, source: provider.name };
    } catch (err) {
      console.warn(`  ⚠️  ${provider.name} failed: ${err.message}`);
    }
  }

  // Fallback: SVG placeholder card
  const svgPath = path.join(outDir, 'screenshot.svg');
  const svgBuffer = generatePlaceholderCard(businessName, url);
  fs.writeFileSync(svgPath, svgBuffer);
  console.log(`  📸 Placeholder card generated: demos/${slug}/screenshot.svg`);
  return { path: svgPath, source: 'placeholder' };
}

// ─── CLI Test ─────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2] || 'https://example.com';
  const slug = process.argv[3] || 'test-business';
  console.log(`\n📸 Screenshot Test — URL: ${url}\n`);
  captureScreenshot(url, slug, 'Test Business')
    .then(r => console.log('✅ Result:', r))
    .catch(e => console.error('❌', e.message));
}
