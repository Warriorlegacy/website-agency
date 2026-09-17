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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAppConfig } from './config_loader.js';
import { aiComplete } from './ai_client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');
const PLAYBOOK_PATH = path.join(ROOT_DIR, 'prompts', 'Autonomous-Website-Agency-Playbook.md');

let cachedPlaybookContext = null;
function getPlaybookContext() {
  if (cachedPlaybookContext !== null) return cachedPlaybookContext;
  try {
    if (fs.existsSync(PLAYBOOK_PATH)) {
      cachedPlaybookContext = fs.readFileSync(PLAYBOOK_PATH, 'utf-8').slice(0, 4000);
    }
  } catch {}
  cachedPlaybookContext = cachedPlaybookContext || '';
  return cachedPlaybookContext;
}

/**
 * Query AnythingLLM for a chat completion (with built-in Playbook RAG fallback).
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

  if (apiKey) {
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

      if (res.ok) {
        const data = await res.json();
        const text = data.textResponse || data.response;
        if (text) return text;
      }
    } catch (e) {
      // Remote AnythingLLM unreachable — fall through to Playbook RAG
    }
  }

  // Built-in RAG Brain: query with Agency Playbook context
  try {
    const playbook = getPlaybookContext();
    const systemPrompt = `You are the Apex AI Web Studio Intelligence Engine. Use this agency playbook context:\n${playbook}\n\nTask: ${prompt}`;
    return await aiComplete(systemPrompt, { temperature: 0.3, maxTokens: 1000 });
  } catch (err) {
    console.warn(`  ⚠️ RAG Brain fallback error: ${err.message}`);
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

/**
 * Handle a sales objection using the Agency Playbook knowledge base.
 * @param {string} objection - The client objection (e.g. "We already have a web guy")
 * @param {object} prospect - Prospect info
 * @returns {Promise<string>} Strategic reply script following the Playbook rules
 */
export async function handleObjectionViaPlaybook(objection, prospect = {}) {
  const prompt = `Prospect: ${prospect.businessName || 'Local Business'} (${prospect.city || 'Local Area'})
Niche: ${prospect.niche || 'service'}
Objection: "${objection}"

Using the Agency Playbook rules:
1. Empathize & Validate: Never argue. Acknowledge their position.
2. Reframe with Value: Anchor back to the free interactive demo link (${prospect.demoUrl || 'pre-built live demo'}).
3. Low friction call-to-action: Ask for zero commitment, offer to leave the link for future reference or 5-minute review.
4. Keep under 100 words. Polite, confident, professional. Include CAN-SPAM compliant opt-out.

Write the exact reply response text.`;

  return await queryAnythingLLM(prompt);
}

/**
 * Generate a deep strategic client dossier using Playbook RAG.
 * @param {object} prospect - Prospect data
 * @param {object} audit - Audit data
 * @returns {Promise<object|null>} Structured dossier
 */
export async function generateClientDossier(prospect, audit = {}) {
  const prompt = `Generate a 1-page executive sales dossier for:
Business: ${prospect.businessName}
Niche: ${prospect.niche}
Location: ${prospect.city}
Audit Score: ${audit.overallScore || 4}/10

Return JSON format:
{
  "recommendedTier": "starter" | "growth" | "premium",
  "recommendedPriceUSD": 750 | 1500 | 3000,
  "keyPitchAngle": "string",
  "anticipatedObjection": "string",
  "winningResponse": "string",
  "roiProjection": "string"
}
Return ONLY valid JSON.`;

  const res = await queryAnythingLLM(prompt);
  if (!res) return null;
  try {
    const match = res.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return null;
}

