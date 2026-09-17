/**
 * scripts/lib/email_finder.js
 * Public Email Discovery Engine
 *
 * Finds an email address that a business has PUBLISHED for inquiries, so that a
 * no-website prospect can still be reached with a "Show Don't Tell" cold email.
 *
 * Sources, strongest signal first:
 *   1. mailto: links on the business's own site / contact page
 *   2. OpenStreetMap tags           — email / contact:email   (public, CC-licensed)
 *   3. The business's public social profile (Facebook / Instagram "About" section)
 *   4. Public directory listings    — Yelp / BBB / YellowPages / Yellowbot
 *   5. Public business registry text mentioning the business name + an email
 *
 * HARD RULES
 *   - We never guess or pattern-build an address (`contact@<slug>.com`). Ever.
 *   - Every returned address carries `source` (the exact public URL it was read
 *     from) so `guardrails.isSendableEmail({ observedOn })` can validate it.
 *   - Role mailboxes (info@, contact@, hello@) are only accepted when they were
 *     actually observed on a public page.
 *
 * ponytail: zero npm deps, stdlib fetch only
 */
import { scrapeUrl } from './scraper_client.js';

// ─── Extraction ──────────────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Addresses that are never a business's inquiry inbox. */
const IGNORE_EMAILS = [
  /@sentry\./i, /@wixpress\./i, /@example\./i, /\.(png|jpe?g|gif|webp|svg|css|js)$/i,
  /^(noreply|no-reply|donotreply|postmaster|abuse|webmaster)@/i,
  /@(sentry|squarespace|shopify|wix|godaddy|cloudflare|facebook|instagram|google|yelp)\./i
];

/** Generic inquiry inboxes — accepted only with a real observed source. */
const ROLE_LOCALPARTS = /^(info|contact|hello|hi|sales|enquiries|inquiries|office|admin|support|bookings?|reception|team|mail)@/i;

function isUsableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const value = email.trim().toLowerCase().replace(/^mailto:/, '');
  if (value.length > 80) return false;
  if (IGNORE_EMAILS.some(re => re.test(value))) return false;
  if (/\.(com|net|org)\.(com|net|org)/.test(value)) return false;
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(value);
}

/** Pull every candidate address out of a page, preferring mailto: links. */
export function extractEmails(text, html = '') {
  const found = new Map();
  const mailtoMatches = String(html).matchAll(/mailto:([^"'?>\s]+)/gi);
  for (const m of mailtoMatches) {
    const email = decodeURIComponent(m[1]).trim().toLowerCase();
    if (isUsableEmail(email)) found.set(email, { email, method: 'mailto_link', confidence: 'high' });
  }
  for (const raw of String(text).matchAll(EMAIL_RE) || []) {
    const email = raw[0].trim().toLowerCase();
    if (isUsableEmail(email) && !found.has(email)) {
      found.set(email, { email, method: 'page_text', confidence: 'medium' });
    }
  }
  return [...found.values()];
}

/** Rank candidates: prefer non-role owner-style mailboxes but accept a published role inbox. */
export function pickBestEmail(candidates = [], businessName = '') {
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
}

async function safeScrape(url) {
  try {
    const res = await scrapeUrl(url);
    if (!res || !res.content) return null;
    return { content: res.content, html: res.html || res.content, method: res.source || 'scrape' };
  } catch {
    return null;
  }
}