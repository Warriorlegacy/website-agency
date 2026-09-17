/**
 * scripts/lib/anythingllm_client.js
 * AnythingLLM integration — local AI brain for audits, proposals, and outreach
 *
 * Connects to a self-hosted AnythingLLM instance for LLM-powered tasks
 * (website audits, proposal generation, outreach drafting) without
 * requiring any cloud API keys.
 *
 * ponytail: direct HTTP calls to AnythingLLM REST API, no npm deps
 */
import { loadAppConfig } from './config_loader.js';

/**
 * Query AnythingLLM for a chat completion.
 * @param {string} prompt - The user prompt
 * @param {object} opts - { workspace, mode }
 * @returns {Promise<string>} LLM response text
 */
export async function queryAnythingLLM(prompt, opts = {}) {
  const cfg = loadAppConfig();
  const allm = cfg.integrations?.anythingllm || {};
  const apiUrl = allm.apiUrl || 'http://localhost:3001';
  const apiKey = allm.apiKey || '';
  const workspace = allm.workspace || 'agency';

  if (!apiKey) {
    console.log('  🧠 [AnythingLLM] No API key configured — using heuristic fallback');
    return null;
  }

  try {
    const res = await fetch(`${apiUrl}/api/v1/workspace/${workspace}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        message: prompt,
        mode: opts.mode || 'chat'
      })
    });

    if (!res.ok) {
      console.warn(`  ⚠️ AnythingLLM API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.textResponse || data.response || null;
  } catch (e) {
    console.warn(`  ⚠️ AnythingLLM connection failed: ${e.message}`);
    return null;
  }
}

/**
 * Generate a website audit using AnythingLLM.
 * @param {object} prospect - { businessName, url, niche, city }
 * @returns {Promise<object|null>} Audit results or null if unavailable
 */
export async function generateAuditViaLLM(prospect) {
  const prompt = `Analyze this website for a ${prospect.niche} business named "${prospect.businessName}" in ${prospect.city}.
URL: ${prospect.url || 'No website (this is the opportunity!)'}

Provide a JSON audit with these fields:
- designScore (1-10): visual design quality
- mobileScore (1-10): mobile responsiveness
- speedScore (1-10): page load performance
- seoScore (1-10): SEO optimization
- conversionScore (1-10): conversion architecture
- overallScore (1-10): average
- topIssues: array of 3 critical issues
- quickWins: array of 3 quick improvement wins

Return ONLY valid JSON, no other text.`;

  const response = await queryAnythingLLM(prompt);
  if (!response) return null;

  try {
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return null;
}

/**
 * Generate outreach copy using AnythingLLM.
 * @param {object} prospect - Lead data
 * @returns {Promise<string|null>} Outreach text or null
 */
export async function generateOutreachViaLLM(prospect) {
  const prompt = `Write a short, personalized cold email for ${prospect.businessName} in ${prospect.city}.
They are a ${prospect.niche} business with an outdated website.
Lead with value: mention a free demo site we built for them.
Include 2 specific improvements we'd make.
Keep it under 150 words. Professional but warm tone.
Include opt-out: "Reply STOP and I won't follow up."
Include placeholder for physical address.`;

  return await queryAnythingLLM(prompt);
}

/**
 * Generate a proposal using AnythingLLM.
 * @param {object} prospect - Lead data
 * @param {string} tier - 'starter' | 'growth' | 'premium'
 * @returns {Promise<string|null>} Proposal text or null
 */
export async function generateProposalViaLLM(prospect, tier = 'growth') {
  const prompt = `Write a professional website redesign proposal for ${prospect.businessName} in ${prospect.city}.
They are a ${prospect.niche} business.
Package: ${tier} ($${tier === 'starter' ? '750' : tier === 'growth' ? '1,500' : '3,000'}).
Include: scope of work, timeline (5-7 days), deliverables, and payment terms (50% deposit).
Keep it concise and compelling. No fluff.`;

  return await queryAnythingLLM(prompt);
}
