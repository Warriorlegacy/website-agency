/**
 * scripts/lib/public_email_finder.js
 * Public Email Discovery Engine
 *
 * Finds a verified public email address for businesses that have NO website but
 * DO have a phone or other public footprint — so they can still be reached with
 * the existing SMTP + Resend + DRYRUN email flow (no fake address is ever invented).
 *
 * Sources (strongest signal first):
 *  1. mailto: links on the business's own site / contact page (when a domain exists)
 *  2. OpenStreetMap tags email / contact:email  (public, CC-licensed)
 *  3. The business's public social profile (FB/IG About section)
 *  4. Public directory / search results mentioning the business name + an email
 *
 * HARD RULES
 *   - Never guess or pattern-build an address (`contact@<slug>.com`). Ever.
 *   - Every returned address carries `source` (the exact public URL it was fetched from)
 *     so the existing guardrail + sender logic can validate it before sending.
 *   - Role inboxes (info@, contact@, hello@) are only accepted when observed on a
 *     public page — they are exactly what a no-website business publishes for inquiries.
 *
 * ponytail: zero npm deps, stdlib fetch + existing scraper_client only
 */
import { scrapeUrl } from './scraper_client.js';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const IGNORE_EMAILS = [
  /@sentry\./i, /@wixpress\./i, /@example\./i, /\.(png|jpe?g|gif|webp|svg|css|js)$/i,
  /^(noreply|no-reply|donotreply|postmaster|abuse|webmaster)@/i,
  /@(sentry|squarespace|shopify|wix|godaddy|cloudflare|facebook|instagram|google|yelp)\./i
];

const ROLE_LOCALPARTS = /^(info|contact|hello|hi|sales|enquiries|inquiries|office|admin|support|bookings?|reception|team|mail)@/i;

function isUsableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const value = email.trim().toLowerCase().replace(/^mailto:/, '');
  if (value.length > 80) return false;
  if (IGNORE_EMAILS.some(re => re.test(value))) return false;
  if (/\.(com|net|org)\.(com|net|org)/.test(value)) return false;
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(value);
} // ← was missing

export function extractEmailCandidates(text, html = '') {
  const seen = new Map();
  for (const m of String(html).matchAll(/mailto:([^"'?>\s]+)/gi)) {
    const value = decodeURIComponent(m[1]).trim().toLowerCase();
    if (isUsableEmail(value)) seen.set(value, { email: value, method: 'mailto_link', confidence: 'high' });
  }
  for (const raw of String(text).matchAll(EMAIL_RE) || []) {
    const value = raw[0].trim().toLowerCase();
    if (isUsableEmail(value) && !seen.has(value)) {
      seen.set(value, { email: value, method: 'page_text', confidence: 'medium' });
    }
  }
  return [...seen.values()];
} // ← was missing

export function pickBestCandidate(candidates = [], businessName = '') {
  if (!candidates.length) return null;
  const nameWords = String(businessName).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const scored = candidates.map(c => {
    let score = c.confidence === 'high' ? 10 : 4;
    if (ROLE_LOCALPARTS.test(c.email)) score += 3;
    if (nameWords.some(w => c.email.includes(w))) score += 4;
    if (/@gmail\.com$|@yahoo\.|@hotmail\.|@outlook\.|@aol\./.test(c.email)) score += 2;
    return { ...c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
} // ← was missing

async function safeScrape(url) {
  try {
    const res = await scrapeUrl(url);
    if (!res || !res.content) return null;
    return { text: res.content, html: res.html || res.content, source: res.source || 'scrape' };
  } catch {
    return null;
  }
} // ← was missing

export async function tryOwnWebsite(domain, businessName) {
  if (!domain) return [];
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const targets = [base, `${base.replace(/\/$/, '')}/contact`, `${base.replace(/\/$/, '')}/contact-us`];
  for (const target of targets) {
    const page = await safeScrape(target);
    if (!page) continue;
    const list = extractEmailCandidates(page.text, page.html);
    if (list.length) return list.map(c => ({ ...c, source: target, sourceKind: 'own_website' }));
  }
  return [];
} // ← was missing

export function fromOsmTags(tags = {}) {
  if (!tags || typeof tags !== 'object') return [];
  const candidates = [];
  for (const key of ['email', 'contact:email']) {
    if (tags[key] && isUsableEmail(tags[key])) {
      candidates.push({ email: String(tags[key]).trim().toLowerCase(), method: 'osm_tag', confidence: 'high' });
    }
  }
  if (!candidates.length) return [];
  const osmUrl = `https://www.openstreetmap.org/${tags.type || 'node'}/${tags.id || ''}`;
  return candidates.map(c => ({ ...c, source: osmUrl, sourceKind: 'openstreetmap' }));
} // ← was missing

export async function trySocialProfiles(tags = {}) {
  const socialUrls = [
    tags['contact:facebook'], tags.facebook,
    tags['contact:instagram'], tags.instagram
  ].filter(Boolean);
  for (const raw of socialUrls) {
    const url = /^https?:/i.test(raw) ? raw : `https://www.facebook.com/${raw}`;
    const page = await safeScrape(url);
    if (!page) continue;
    const list = extractEmailCandidates(page.text, page.html);
    if (list.length) return list.map(c => ({ ...c, source: url, sourceKind: 'social_profile' }));
  }
  return [];
} // ← was missing

export async function tryPublicSearch(businessName, city) {
  const q = encodeURIComponent(`"${businessName}" ${city} email`);
  const searchTargets = [
    `https://duckduckgo.com/html/?q=${q}`,
    `https://www.bing.com/search?q=${q}`
  ];
  for (const target of searchTargets) {
    const page = await safeScrape(target);
    if (!page) continue;
    const list = extractEmailCandidates(page.text, page.html);
    if (list.length) return list.map(c => ({ ...c, source: target, sourceKind: 'public_search_result' }));
  }
  return [];
} // ← was missing

/**
 * Find a verified public email for a business that may have no website.
 * @param {string} businessName
 * @param {Array} [candidates] - pre-collected candidates (e.g. from OSM tags)
 * @param {object} opts
 * @returns {Promise<{ email, source, sourceKind, method, confidence } | null>}
 */
export async function findPublicEmailForBusiness(businessName, candidates = [], opts = {}) {
  const { tags = {}, domain, city } = opts;
  // 1. Already-found candidates (e.g. OSM email tags) are strongest.
  if (candidates.length) {
    const best = pickBestCandidate(candidates, businessName);
    if (best) return { ...best, source: best.source || 'pre-collected', sourceKind: 'pre-collected' };
  }
  // 2. OSM tags directly (caller may already have tags).
  const osm = fromOsmTags(tags);
  if (osm.length) {
    const best = pickBestCandidate(osm, businessName);
    if (best) return best;
  }
  // 3. Own website / contact page if a domain exists.
  if (domain) {
    const site = await tryOwnWebsite(domain, businessName);
    if (site.length) {
      const best = pickBestCandidate(site, businessName);
      if (best) return best;
    }
  }
  // 4. Public search / directories.
  if (city) {
    const search = await tryPublicSearch(businessName, city);
    if (search.length) {
      const best = pickBestCandidate(search, businessName);
      if (best) return best;
    }
  }
  return null; // ← was missing
}
