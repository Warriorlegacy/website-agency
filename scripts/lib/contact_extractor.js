/**
 * scripts/lib/contact_extractor.js
 * Production Contact Information Extractor
 *
 * Given a business website URL:
 *   1. Fetches /contact, /about, /team, /staff pages via Jina Reader (free)
 *   2. Sends content to configured AI provider
 *   3. Returns: ownerName, ownerEmail, phone, linkedin, facebook, instagram
 *
 * ponytail: zero npm deps
 */
import { scrapeViaJina } from './scraper_client.js';
import { aiComplete, parseAiJson } from './ai_client.js';

const CONTACT_PAGES = ['/contact', '/about', '/team', '/staff', '/about-us', '/contact-us', '/our-team'];

// ─── Find Contact URL ─────────────────────────────────────────────────────────
function normalizeBase(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.replace(/\/$/, '');
  }
}

// ─── Extract Emails from text ─────────────────────────────────────────────────
function extractEmailsFromText(text) {
  const matches = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)];
  return [...new Set(matches.map(m => m[0].toLowerCase()))]
    .filter(e => !e.includes('example.com') && !e.includes('domain.com') && !e.includes('@sentry'));
}

// ─── Extract Phones from text ─────────────────────────────────────────────────
function extractPhonesFromText(text) {
  const matches = [...text.matchAll(/(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})/g)];
  return [...new Set(matches.map(m => m[0]))];
}

// ─── Fetch Contact Pages ──────────────────────────────────────────────────────
async function fetchContactContent(baseUrl, jinaKey = '') {
  const contents = [];

  for (const page of CONTACT_PAGES) {
    const url = baseUrl + page;
    try {
      const content = await scrapeViaJina(url, jinaKey);
      if (content && content.length > 100) {
        contents.push({ url, content: content.slice(0, 3000) });
        if (contents.length >= 2) break; // Two pages is plenty
      }
    } catch {
      // Try next page silently
    }
  }

  // Also fetch homepage if no contact pages found
  if (contents.length === 0) {
    try {
      const content = await scrapeViaJina(baseUrl, jinaKey);
      if (content) contents.push({ url: baseUrl, content: content.slice(0, 3000) });
    } catch {}
  }

  return contents;
}

// ─── AI-Based Contact Extraction ─────────────────────────────────────────────
async function extractWithAI(combinedContent, businessName) {
  const prompt = `You are extracting contact information for a local business called "${businessName}".

Here is the content from their website:
---
${combinedContent.slice(0, 4000)}
---

Extract and return a JSON object with these exact fields:
{
  "ownerName": "Full name of the business owner or primary contact (string, or null if not found)",
  "ownerEmail": "Primary contact email address (string, or null if not found)",
  "phone": "Primary phone number in standard US format like (512) 445-7832 (string, or null)",
  "secondaryEmail": "Secondary email if any (string, or null)",
  "linkedin": "LinkedIn profile URL (string, or null)",
  "facebook": "Facebook page URL (string, or null)",
  "instagram": "Instagram URL or handle (string, or null)",
  "ownerTitle": "Owner's job title like 'Owner', 'CEO', 'Founder' (string, or null)"
}

Rules:
- Only extract information explicitly present in the text
- Do NOT fabricate or guess contact details
- For ownerName: prefer the actual person's name over a generic company name
- For phone: only include if it looks like a real US business phone number
- Return ONLY the JSON object, no markdown fences`;

  const response = await aiComplete(prompt, { jsonMode: true, temperature: 0.05, maxTokens: 512 });
  return parseAiJson(response);
}

// ─── Master: extractContactInfo ───────────────────────────────────────────────
/**
 * Extract owner contact information from a business website.
 *
 * @param {string} url - Business website URL
 * @param {string} businessName - Business name for AI context
 * @param {object} opts
 * @param {string} opts.jinaKey - Optional Jina API key
 * @returns {Promise<ContactInfo>}
 */
export async function extractContactInfo(url, businessName, opts = {}) {
  if (!url || url === 'https://example.com') {
    return { ownerName: 'Business Owner', ownerEmail: '', phone: '', source: 'none' };
  }

  const baseUrl = normalizeBase(url);
  const jinaKey = opts.jinaKey || '';

  try {
    // Step 1: Fetch contact pages
    const pages = await fetchContactContent(baseUrl, jinaKey);

    if (pages.length === 0) {
      return { ownerName: 'Business Owner', ownerEmail: '', phone: '', source: 'no_pages' };
    }

    const combinedContent = pages.map(p => `[Page: ${p.url}]\n${p.content}`).join('\n\n---\n\n');

    // Step 2: Quick heuristic extraction (no AI cost)
    const emails = extractEmailsFromText(combinedContent);
    const phones = extractPhonesFromText(combinedContent);

    // Step 3: Try AI extraction for richer data
    let aiResult = null;
    try {
      aiResult = await extractWithAI(combinedContent, businessName);
    } catch (aiErr) {
      console.warn(`  [contact] AI extraction failed for ${businessName}: ${aiErr.message}`);
    }

    // Merge: prefer AI result, fallback to heuristics
    return {
      ownerName: aiResult?.ownerName || 'Business Owner',
      ownerEmail: aiResult?.ownerEmail || emails[0] || '',
      phone: aiResult?.phone || phones[0] || '',
      secondaryEmail: aiResult?.secondaryEmail || emails[1] || '',
      ownerTitle: aiResult?.ownerTitle || 'Owner',
      linkedin: aiResult?.linkedin || '',
      facebook: aiResult?.facebook || '',
      instagram: aiResult?.instagram || '',
      source: aiResult ? 'ai' : 'heuristic',
      pagesScanned: pages.map(p => p.url)
    };

  } catch (err) {
    console.warn(`  [contact] Extraction failed for ${url}: ${err.message}`);
    return { ownerName: 'Business Owner', ownerEmail: '', phone: '', source: 'error', error: err.message };
  }
}

// ─── CLI Test ─────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2] || 'https://example.com';
  const name = process.argv[3] || 'Test Business';
  console.log(`\n📞 Contact Extractor Test — URL: ${url}\n`);
  extractContactInfo(url, name)
    .then(r => { console.log('✅ Result:', JSON.stringify(r, null, 2)); })
    .catch(e => { console.error('❌', e.message); process.exit(1); });
}
