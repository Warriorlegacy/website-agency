/**
 * scripts/audit_engine.js
 * Production Website Audit Engine
 *
 * Uses: ai_client.js (BYOK multi-provider) + scraper_client.js (Jina/Firecrawl)
 * Runs: 5-dimension analysis (Design, Mobile, Speed, SEO, Conversion)
 * Returns: structured audit JSON saved to prospects/{slug}.json
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeUrl } from './lib/scraper_client.js';
import { aiComplete, parseAiJson } from './lib/ai_client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROSPECTS_DIR = path.join(__dirname, '..', 'prospects');

if (!fs.existsSync(PROSPECTS_DIR)) {
  fs.mkdirSync(PROSPECTS_DIR, { recursive: true });
}

// ─── Slugify ──────────────────────────────────────────────────────────────────
export function slugify(text) {
  return (text || 'lead')
    .toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

// ─── URL normalizer ───────────────────────────────────────────────────────────
function normalizeUrl(url) {
  let u = (url || '').trim();
  if (!u || u === 'https://example.com') return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

// ─── AI-Powered Audit (via ai_client) ────────────────────────────────────────
async function runAiAudit({ businessName, url, niche, city, pageContent }) {
  const pageSection = pageContent
    ? `\n\nWebsite content (${pageContent.source || 'scraped'}, first 3000 chars):\n---\n${pageContent.content.slice(0, 3000)}\n---`
    : '\n\nNote: Website could not be fetched; analyze based on the business type and typical patterns.';

  const prompt = `You are a senior web consultant and CRO (conversion rate optimization) specialist.

Audit the following business website across 5 dimensions:

Business: ${businessName}
URL: ${url || '(no website)'}
Industry: ${niche}
Location: ${city}
${pageSection}

Rate each dimension 1-10 (1=critical failure, 10=excellent). Identify 2 specific problems and 1 actionable fix per dimension.

Return ONLY this JSON (no markdown, no preamble):
{
  "overallScore": number,
  "engine": "AI Audit",
  "dimensions": {
    "design": {
      "score": number,
      "problems": ["specific problem 1", "specific problem 2"],
      "quickFix": "one concrete action"
    },
    "mobile": {
      "score": number,
      "problems": ["specific problem 1", "specific problem 2"],
      "quickFix": "one concrete action"
    },
    "speed": {
      "score": number,
      "problems": ["specific problem 1", "specific problem 2"],
      "quickFix": "one concrete action"
    },
    "seo": {
      "score": number,
      "problems": ["specific problem 1", "specific problem 2"],
      "quickFix": "one concrete action"
    },
    "conversion": {
      "score": number,
      "problems": ["specific problem 1", "specific problem 2"],
      "quickFix": "one concrete action"
    }
  },
  "biggestOpportunity": "1-2 sentence specific opportunity statement mentioning business name, city, and estimated impact"
}`;

  const response = await aiComplete(prompt, { jsonMode: true, temperature: 0.2, maxTokens: 1200 });
  return parseAiJson(response);
}

// ─── Heuristic Fallback Audit ─────────────────────────────────────────────────
function runHeuristicAudit({ businessName, url, niche, city, pageContent }) {
  const text = pageContent?.content || '';
  const isLive = text.length > 100;

  const hasViewport = /name=.viewport./i.test(text);
  const hasTitle = /<title/i.test(text) || text.toLowerCase().includes('title');
  const hasMetaDesc = /name=.description./i.test(text);
  const hasH1 = /<h1/i.test(text);
  const hasTelLink = /href=.tel:/i.test(text) || /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(text);
  const hasForm = /<form/i.test(text) || /contact\s*form|book\s*a|request\s*a/i.test(text);
  const hasSsl = (url || '').startsWith('https://');
  const hasOldMarkup = /<table[^>]*layout|<embed|<frameset|<font/i.test(text);
  const textLen = text.length;

  const designScore = isLive ? (hasOldMarkup ? 2 : 4) : 3;
  const mobileScore = isLive ? (hasViewport ? 5 : 2) : 3;
  const speedScore = isLive ? (textLen < 30000 ? 6 : 4) : 4;
  const seoScore = (hasTitle ? 2 : 0) + (hasMetaDesc ? 2 : 0) + (hasH1 ? 2 : 0) + (hasSsl ? 1 : 0) + 1;
  const conversionScore = (hasTelLink ? 3 : 1) + (hasForm ? 2 : 1);
  const overallScore = Math.round((designScore + mobileScore + speedScore + seoScore + conversionScore) / 5);

  return {
    overallScore: Math.max(1, Math.min(10, overallScore)),
    engine: 'Heuristic Engine',
    dimensions: {
      design: {
        score: designScore,
        problems: [
          hasOldMarkup ? 'Uses legacy table-based layout — outdated and non-responsive.' : 'Visual hierarchy lacks modern trust signals and conversion-focused elements.',
          'No clear value proposition above the fold visible within 5 seconds of landing.'
        ],
        quickFix: 'Deploy a modern single-column layout with hero section, social proof badges, and clear CTA buttons.'
      },
      mobile: {
        score: mobileScore,
        problems: [
          hasViewport ? 'Touch targets are too small; mobile navigation is difficult to use.' : 'Missing viewport meta tag — site loads as a zoomed-out desktop page on phones.',
          'No sticky bottom bar for immediate click-to-call on mobile devices.'
        ],
        quickFix: 'Add responsive breakpoints and a fixed mobile CTA bar with one-tap calling.'
      },
      speed: {
        score: speedScore,
        problems: [
          'Uncompressed images and render-blocking scripts delay page load beyond 3 seconds.',
          'Large unused CSS/JS bundles increase Time to Interactive.'
        ],
        quickFix: 'Switch to static HTML/CSS delivery with lazy-loaded images and deferred scripts.'
      },
      seo: {
        score: Math.max(1, Math.min(10, seoScore)),
        problems: [
          hasMetaDesc ? `Meta description isn't geo-targeted for "${niche} in ${city}".` : `Missing meta description — Google replaces it with random page content, reducing CTR.`,
          hasH1 ? 'H1 heading lacks service + city keyword combination for local SEO.' : 'No H1 tag — critical for search engine understanding of page topic.'
        ],
        quickFix: `Add LocalBusiness Schema.org JSON-LD markup and optimize H1 for "${niche} ${city}".`
      },
      conversion: {
        score: Math.max(1, Math.min(10, conversionScore)),
        problems: [
          hasTelLink ? 'Phone numbers are styled as plain text rather than prominent click-to-call buttons.' : 'Phone numbers are plain text — unclickable on mobile, losing dozens of calls per month.',
          'No above-fold quote form or consultation booking widget to capture visitor intent.'
        ],
        quickFix: 'Add one primary CTA button (call or book) in the hero and a short 3-field inquiry form.'
      }
    },
    biggestOpportunity: `By deploying a modern mobile-first site with click-to-call and a local SEO foundation, ${businessName} could capture 25–40% more inbound leads from ${city} searchers — turning their website from a brochure into a lead generation engine.`
  };
}

// ─── Master: auditWebsite ─────────────────────────────────────────────────────
/**
 * Full production audit of a business website.
 *
 * @param {object} opts
 * @param {string} opts.businessName
 * @param {string} opts.url
 * @param {string} opts.niche
 * @param {string} opts.city
 * @param {string} opts.ownerName
 * @param {string} opts.ownerEmail
 * @param {string} opts.phone
 * @returns {Promise<AuditResult>}
 */
export async function auditWebsite({ businessName, url, niche = 'general', city = 'Local', ownerName = '', ownerEmail = '', phone = '' }) {
  const cleanUrl = normalizeUrl(url);
  const slug = slugify(businessName);
  console.log(`\n🔍 Auditing [${businessName}] (${cleanUrl || 'no URL'})...`);

  // Step 1: Scrape website content (Jina first, free)
  let pageContent = null;
  if (cleanUrl) {
    try {
      pageContent = await scrapeUrl(cleanUrl);
      console.log(`   📄 Page scraped via ${pageContent.source} (${pageContent.content.length} chars)`);
    } catch (err) {
      console.warn(`   ⚠️  Page scrape failed: ${err.message}`);
    }
  }

  // Step 2: AI-powered audit (uses configured provider via ai_client)
  let auditData = null;
  try {
    auditData = await runAiAudit({ businessName, url: cleanUrl, niche, city, pageContent });
    if (!auditData?.dimensions) throw new Error('Incomplete AI response');
  } catch (err) {
    console.warn(`   ⚠️  AI audit failed (${err.message}), using heuristics`);
    auditData = runHeuristicAudit({ businessName, url: cleanUrl, niche, city, pageContent });
  }

  // Step 3: Build full audit record
  const auditResult = {
    businessName,
    slug,
    url: cleanUrl || `https://${slug}.com`,
    niche,
    city,
    ownerName: ownerName || 'Business Owner',
    ownerEmail: ownerEmail || '',
    phone: phone || '',
    auditDate: new Date().toISOString(),
    liveSiteDetected: Boolean(pageContent),
    scrapeSource: pageContent?.source || 'none',
    engine: auditData.engine || 'AI Audit',
    overallScore: auditData.overallScore,
    dimensions: auditData.dimensions,
    biggestOpportunity: auditData.biggestOpportunity
  };

  // Save to prospects/
  const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
  fs.writeFileSync(prospectFile, JSON.stringify(auditResult, null, 2), 'utf-8');
  console.log(`✅ Audit completed and saved to [prospects/${slug}.json]`);

  return auditResult;
}
