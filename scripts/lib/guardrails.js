/**
 * scripts/lib/guardrails.js
 * HARD-RULE ENFORCEMENT LAYER (single source of truth)
 *
 * Implements the non-negotiable rules from AGENTS.md:
 *   1. Zero Falsification  — no invented businesses, phones, emails, ratings, meetings, revenue.
 *   2. Public-data sourcing — only publicly published inquiry contacts.
 *   3. CAN-SPAM / GDPR     — physical address + 1-click opt-out on EVERY email, max 2 follow-ups.
 *   4. Value-first framing  — outreach must lead with the demo link + 2 concrete fixes.
 *   5. No automated blasting — outbound requires explicit human approval; no silent sends.
 *
 * Every other module MUST import from here rather than re-implementing these checks.
 * ponytail: zero npm deps, stdlib only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');
export const OPT_OUT_FILE = path.join(ROOT_DIR, 'outreach', 'opt-outs.json');

export const MAX_FOLLOW_UPS = 2;              // AGENTS.md rule 3
export const STAGES = [
  'DISCOVERED', 'AUDITED', 'DEMO_GENERATED', 'OWNER_LOCATED',
  'OUTREACH_DRAFTED', 'APPROVED', 'CONTACTED', 'MEETING_SCHEDULED',
  'PAYMENT_PENDING', 'CLOSED_WON', 'CLOSED_LOST'
];
// ── 1. Fabrication Detection ─────────────────────────────────────────────────

/**
 * Reservable / non-routable domains that can never belong to a real prospect.
 * Sending to these is always a fabrication artifact.
 */
const BLOCKED_EMAIL_DOMAINS = new Set([
  'test', 'invalid', 'example', 'localhost', 'local', 'internal',
  'example.com', 'example.org', 'example.net', 'test.com', 'test.org',
  'domain.com', 'domain.net', 'yourdomain.com', 'youragency.com',
  'email.com', 'mail.com', 'sample.com', 'fake.com', 'acme.com',
  'company.com', 'mysite.com', 'site.com', 'website.com'
]);

/** Local-part patterns that indicate a machine-generated contact. */
const BLOCKED_LOCAL_PARTS = new Set(['contact', 'info', 'noreply', 'no-reply', 'test', 'user', 'admin']);

/**
 * True when an email is syntactically valid AND could plausibly be a real inbox.
 * `contact@<slug>.com` style guesses are rejected: they are fabricated unless the
 * address was actually observed on a public page (see `observedOn` requirement).
 */
export function isSendableEmail(email, opts = {}) {
  if (!email || typeof email !== 'string') return { ok: false, reason: 'missing email' };
  const value = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(value)) return { ok: false, reason: 'not a valid email syntax' };

  const [local, domain] = value.split('@');
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return { ok: false, reason: `reserved/fake domain (${domain})` };
  if (/\.(test|invalid|example|local|localhost)$/.test(domain)) {
    return { ok: false, reason: `non-routable TLD (.${domain.split('.').pop()})` };
  }

  // A guessed generic mailbox is fabrication unless explicitly sourced.
  if (BLOCKED_LOCAL_PARTS.has(local) && !opts.observedOn) {
    return { ok: false, reason: `guessed generic mailbox (${local}@) with no public source` };
  }
  if (!opts.observedOn && !opts.confirmed) {
    return { ok: false, reason: 'no public source recorded for this address (rule 2: public data only)' };
  }
  return { ok: true, reason: 'validated' };
}

/** Reject search queries, directory pages and national chains masquerading as prospects. */
const JUNK_NAME_PATTERNS = [
  /^(what|who|where|when|why|how|best|top|cheap|near)\b/i,
  /\?$/,
  /\b(best|top)\b.*\b(restaurants?|dentists?|plumbers?|salons?|gyms?)\b/i,
  /^(restaurants?|dentists?|plumbers?|salons?|gyms?|doctors?|lawyers?|cafes?|shops?)$/i,
  /^(yelp|google|maps|directory|listing|search results?|near me)$/i,
  /^https?:\/\//i
];

const NATIONAL_CHAINS = new Set([
  'starbucks', 'mcdonalds', "mcdonald's", 'subway', 'burger king', 'wendys', "wendy's",
  'arbys', "arby's", 'taco bell', 'kfc', 'dominos', "domino's", 'pizza hut',
  'walgreens', 'cvs', 'rite aid', 'walmart', 'target', 'costco', '7-eleven',
  'dunkin', 'dunkin donuts', 'chipotle', 'panera', 'popeyes',
  'first watch', 'ihop', 'dennys', "denny's", 'applebee\'s', 'chilis', "chili's",
  'olive garden', 'red lobster', 'outback steakhouse', 'little caesars', 'papa john\'s',
  'jersey mike\'s', 'firehouse subs', 'sonic drive-in', 'dairy queen'
]);

export function isJunkBusinessName(name) {
  if (!name || typeof name !== 'string') return { junk: true, reason: 'missing business name' };
  const clean = name.trim();
  if (clean.length < 3) return { junk: true, reason: 'name too short' };
  if (clean.length > 80) return { junk: true, reason: 'name too long (likely a query string)' };
  const lower = clean.toLowerCase();
  if (NATIONAL_CHAINS.has(lower)) return { junk: true, reason: 'national chain / franchise HQ — not a local buyer' };
  for (const re of JUNK_NAME_PATTERNS) {
    if (re.test(clean)) return { junk: true, reason: `matches junk pattern ${re}` };
  }
  if (/\b(llc|inc|co|ltd|corp)\b/i.test(clean) && clean.split(/\s+/).length > 8) {
    return { junk: true, reason: 'suspiciously long corporate string' };
  }
  return { junk: false, reason: 'acceptable local business name' };
}

/** True when a lead record carries machine-invented data. */
export function isSyntheticLead(lead = {}) {
  if (!lead || typeof lead !== 'object') return true;
  if (lead.isSynthetic === true) return true;
  const source = String(lead.source || '').toLowerCase();
  if (source.includes('synthetic') || source.includes('mock') || source.includes('demo_data')) return true;
  if (lead.phone && /^\(555\)/.test(String(lead.phone).trim())) return true;
  if (lead.ownerEmail && /\.(test|invalid|example)$/i.test(String(lead.ownerEmail))) return true;
  return false;
}

/** Assertion helper — throws so a bad record can never travel further downstream. */
export function assertNotSynthetic(lead, context = 'lead') {
  if (isSyntheticLead(lead)) {
    throw new Error(`[GUARDRAIL] Refusing synthetic/fabricated ${context} "${lead?.businessName || lead?.slug || 'unknown'}" (rule 1: zero falsification)`);
  }
  return true;
}

export function assertCleanLead(lead, context = 'lead') {
  assertNotSynthetic(lead, context);
  const nameCheck = isJunkBusinessName(lead.businessName);
  if (nameCheck.junk) {
    throw new Error(`[GUARDRAIL] Refusing ${context} with junk name "${lead.businessName}" — ${nameCheck.reason}`);
  }
  return true;
}
// ─── 2. Opt-Out Registry (GDPR / CAN-SPAM honoured immediately) ──────────────

export function loadOptOuts() {
  try {
    if (fs.existsSync(OPT_OUT_FILE)) {
      const data = JSON.parse(fs.readFileSync(OPT_OUT_FILE, 'utf-8'));
      return Array.isArray(data) ? data : (data.optOuts || []);
    }
  } catch {}
  return [];
}

export function saveOptOuts(list) {
  const dir = path.dirname(OPT_OUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OPT_OUT_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), optOuts: list }, null, 2), 'utf-8');
}

/** Records a permanent suppression. Called by reply classifier, webhooks and operators. */
export function recordOptOut(identifier, reason = 'recipient requested stop') {
  if (!identifier) return false;
  const key = String(identifier).toLowerCase().trim();
  const list = loadOptOuts();
  if (list.some(o => String(o.identifier).toLowerCase() === key)) return true;
  list.push({
    identifier: key,
    kind: key.includes('@') ? 'email' : 'slug',
    reason,
    optedOutAt: new Date().toISOString()
  });
  saveOptOuts(list);
  return true;
}

export function isOptedOut({ slug, email } = {}) {
  const list = loadOptOuts();
  const s = String(slug || '').toLowerCase();
  const e = String(email || '').toLowerCase();
  return list.some(o => {
    const id = String(o.identifier).toLowerCase();
    return (s && o.kind === 'slug' && id === s) || (e && o.kind === 'email' && id === e);
  });
}

// ─── 3. Outreach Content Compliance ──────────────────────────────────────────

/** Tokens that prove an email carries a working 1-click opt-out. */
const OPT_OUT_TOKENS = ['reply stop', 'unsubscribe', 'opt out', 'opt-out', 'stop following'];
/** Tokens that prove a physical/registered address is present. */
const ADDRESS_TOKENS = ['registered address', 'business address', 'address:', '·', 'suite', 'street', 'st,', 'ave'];

/**
 * Verifies a composed outreach message satisfies CAN-SPAM / GDPR (rule 3)
 * and leads with the live demo + 2 concrete fixes (rule 4).
 */
export function checkOutreachCompliance(text, { demoUrl, requireDemo = true } = {}) {
  const body = String(text || '');
  const lower = body.toLowerCase();
  const missing = [];

  if (!OPT_OUT_TOKENS.some(t => lower.includes(t))) {
    missing.push('one-click opt-out statement (e.g. "Reply STOP and I won\'t follow up")');
  }
  if (!ADDRESS_TOKENS.some(t => lower.includes(t))) {
    missing.push('physical/registered business address');
  }
  if (/\[(your|insert|tbd)\b[^\]]*\]/i.test(body)) {
    missing.push('unfilled placeholder text');
  }
  if (requireDemo && demoUrl && !body.includes(demoUrl)) {
    missing.push('live demo link (value-first framing)');
  }
  if (requireDemo && !/\b1\.\s/.test(body)) {
    missing.push('at least 2 numbered concrete fixes');
  }
  if (!/\b2\.\s/.test(body)) {
    missing.push('a second concrete fix (value-first framing)');
  }
  return { ok: missing.length === 0, missing };
}

// ─── 4. Touch Limits & Calling Windows ──────────────────────────────────────

export function countOutboundTouches(interactions = [], slug) {
  return (interactions || []).filter(i =>
    i.lead_slug === slug && i.direction === 'outbound' && ['email', 'sms', 'voice_ai', 'linkedin'].includes(i.channel)
  ).length;
}

/**
 * A lead may only be dialled when it is warm/opted-in (playbook §6 — cold at
 * scale is the highest regulatory risk), inside the lead's local calling window,
 * not suppressed, and under the 48h cooldown.
 */
export function canPlaceCall(lead, interactions = [], opts = {}) {
  const { now = new Date(), ignoreQuietHours = false, minStaticHours = 48 } = opts;
  if (!lead?.phone) return { ok: false, reason: 'no verified phone number on record' };
  if (isOptedOut({ slug: lead.slug })) return { ok: false, reason: 'lead is on the opt-out list' };

  const leadInteractions = (interactions || []).filter(i => i.lead_slug === lead.slug);
  // Warm = replied positively, booked, or explicitly requested a call.
  const warm = leadInteractions.some(i =>
    i.warmLead === true || i.outcome === 'interested' || i.outcome === 'callback_requested' ||
    i.action === 'inbound_reply' || i.action === 'meeting_booked'
  ) || lead.consentToCall === true || ['MEETING_SCHEDULED', 'PAYMENT_PENDING'].includes(lead.stage);

  if (!warm && !opts.allowColdCall) {
    return { ok: false, reason: 'cold calling disabled — lead is not warm/opted-in (playbook §6 TRAI/DND guardrail)' };
  }

  const lastCall = [...leadInteractions].reverse().find(i => i.action === 'voice_call' || i.channel === 'voice_ai');
  if (lastCall) {
    const hours = (now.getTime() - new Date(lastCall.timestamp).getTime()) / 3600000;
    if (hours < minStaticHours) {
      return { ok: false, reason: `voice cooldown active — last call ${hours.toFixed(1)}h ago (need ${minStaticHours}h)` };
    }
  }

  if (!ignoreQuietHours && !isBusinessHoursFor(lead, now)) {
    return { ok: false, reason: `outside ${lead.city || 'local'} business hours (09:00–18:00 local)` };
  }
  return { ok: true, reason: 'call permitted' };
}

const TZ_BY_STATE = {
  TX: 'America/Chicago', IL: 'America/Chicago', TN: 'America/Chicago', CO: 'America/Denver',
  FL: 'America/New_York', NY: 'America/New_York', GA: 'America/New_York', WA: 'America/Los_Angeles',
  CA: 'America/Los_Angeles', AZ: 'America/Phoenix', NV: 'America/Los_Angeles', MA: 'America/New_York'
};

export function inferTimezone(lead = {}) {
  const city = String(lead.city || '');
  const state = (city.match(/\b([A-Z]{2})\b\s*$/) || [])[1];
  return TZ_BY_STATE[state] || 'America/Chicago';
}

/** Business hours evaluated in the LEAD's local timezone, not the operator's. */
export function isBusinessHoursFor(lead, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: inferTimezone(lead), hour: 'numeric', hour12: false, weekday: 'short'
    }).formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '12', 10);
    const weekday = parts.find(p => p.type === 'weekday')?.value || 'Mon';
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    return hour >= 9 && hour < 18;
  } catch {
    const h = now.getHours();
    return h >= 9 && h < 18;
  }
}

// ─── 5. Payment Verification (never invent revenue) ─────────────────────────

/**
 * A deal may only reach CLOSED_WON with verified payment evidence.
 * Agent-inferred or assumed payments are NEVER accepted.
 */
export function verifyPayment(paymentDetails = {}) {
  if (!paymentDetails || typeof paymentDetails !== 'object') {
    return { verified: false, reason: 'no payment details supplied', evidence: null };
  }
  const { provider, reference, amount, currency, verifiedBy, confirmedAt } = paymentDetails;

  if (!provider) return { verified: false, reason: 'missing payment provider', evidence: null };
  if (!reference || String(reference).trim().length < 4) {
    return { verified: false, reason: 'missing or too-short provider transaction reference', evidence: null };
  }
  if (!amount || Number(amount) <= 0) {
    return { verified: false, reason: 'missing/invalid amount', evidence: null };
  }
  const allowedVerifiers = ['webhook', 'gateway_api', 'operator'];
  if (!allowedVerifiers.includes(verifiedBy)) {
    return {
      verified: false,
      reason: `verifiedBy must be one of ${allowedVerifiers.join('|')} — agent/auto claims are not proof of payment`,
      evidence: null
    };
  }
  return {
    verified: true,
    reason: 'payment evidence present',
    evidence: {
      provider, reference: String(reference), amount: Number(amount),
      currency: currency || 'USD', verifiedBy,
      confirmedAt: confirmedAt || new Date().toISOString()
    }
  };
}

// ─── 6. Human-Approval Gate (rule 5: no automated blasting) ─────────────────

/** Outbound channels that must never fire without an explicit operator approval record. */
export const APPROVAL_REQUIRED_ACTIONS = ['send_email', 'send_followup', 'send_proposal', 'place_call'];

export function isApprovedForOutreach(lead = {}) {
  if (lead.approvedForOutreach === true && lead.approvedBy) {
    return { ok: true, reason: `approved by ${lead.approvedBy} at ${lead.approvedAt || 'unknown time'}` };
  }
  return { ok: false, reason: 'no operator approval recorded (rule 5: drafts require human review before send)' };
}

export function requireEnvOrConfig(allowFlag) {
  return allowFlag === true || String(process.env.AGENCY_ALLOW_UNATTENDED_SEND || '').toLowerCase() === 'true';
}

// ─── Self-test ───────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = [];
  const t = (name, actual, expected) => results.push({ name, pass: actual === expected, actual, expected });

  t('reject .test email', isSendableEmail('james@apexelectric.test').ok, false);
  t('reject guessed contact@', isSendableEmail('contact@rossispizza.com').ok, false);
  t('accept sourced owner email', isSendableEmail('marco@rossispizza.com', { observedOn: 'https://rossispizza.com/contact' }).ok, true);
  t('reject (555) phone lead', isSyntheticLead({ businessName: 'A Co', phone: '(555) 123-4567' }), true);
  t('reject synthetic source', isSyntheticLead({ businessName: 'A Co', source: 'synthetic' }), true);
  t('reject query name', isJunkBusinessName('What are the best restaurants with outdoor seating?').junk, true);
  t('reject chain', isJunkBusinessName('Starbucks').junk, true);
  t('accept local name', isJunkBusinessName("Rossi's Pizzeria").junk, false);
  t('compliance catches missing opt-out', checkOutreachCompliance('Hi there, buy now').ok, false);
  t('compliance passes full email', checkOutreachCompliance(
    'Hi,\n1. Mobile fix\n2. Speed fix\nDemo: https://x.com/d\nReply STOP and I won\'t follow up.\nApex AI Web Studio · 123 Main Street, Suite 4',
    { demoUrl: 'https://x.com/d' }).ok, true);
  t('payment without reference fails', verifyPayment({ provider: 'upi', amount: 750, verifiedBy: 'webhook' }).verified, false);
  t('payment with webhook ref passes', verifyPayment({ provider: 'upi', reference: 'UPI-8891XX', amount: 750, verifiedBy: 'webhook' }).verified, true);
  t('agent-claimed payment rejected', verifyPayment({ provider: 'upi', reference: 'UPI-8891XX', amount: 750, verifiedBy: 'agent' }).verified, false);
  t('unapproved send blocked', isApprovedForOutreach({ slug: 'x' }).ok, false);
  t('approved send allowed', isApprovedForOutreach({ slug: 'x', approvedForOutreach: true, approvedBy: 'Piyush' }).ok, true);

  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` (got ${r.actual}, want ${r.expected})`}`);
  console.log(`\n${results.length - failed.length}/${results.length} guardrail assertions passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}


