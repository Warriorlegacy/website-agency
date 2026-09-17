/**
 * scripts/lib/reply_classifier.js
 * AI-Powered Email Reply & Intent Classification
 *
 * Classifies inbound replies into actionable intents:
 *   interested | objection | not_now | wrong_contact | unsubscribe
 *
 * Uses configured AI provider with heuristic fallback.
 * ponytail: zero npm deps
 */
import { fileURLToPath } from 'url';
import { aiComplete, parseAiJson } from './ai_client.js';

// ─── Heuristic Keywords ──────────────────────────────────────────────────────
const INTENT_KEYWORDS = {
  interested: [
    'interested', 'love it', 'looks great', 'looks good', 'impressive',
    'let\'s talk', 'let\'s chat', 'tell me more', 'schedule', 'book',
    'call me', 'when can', 'how much', 'pricing', 'sounds good',
    'yes', 'absolutely', 'definitely', 'set up a call', 'demo looks',
    'i like', 'i love', 'want to discuss', 'next steps', 'move forward'
  ],
  objection: [
    'too expensive', 'not in the budget', 'can\'t afford', 'already have',
    'working with someone', 'have a developer', 'not right now', 'bad timing',
    'maybe later', 'not a priority', 'we just launched', 'just redesigned',
    'happy with current', 'no budget', 'cost too much', 'we already',
    'nephew builds', 'friend does', 'brother-in-law'
  ],
  not_now: [
    'not now', 'not at this time', 'busy', 'swamped', 'follow up later',
    'reach out next', 'in a few months', 'after the holidays', 'next quarter',
    'year end', 'maybe next year', 'revisit', 'touch base later',
    'check back', 'not the right time'
  ],
  wrong_contact: [
    'wrong person', 'not the owner', 'don\'t work there', 'no longer',
    'left the company', 'closed', 'out of business', 'retired',
    'wrong email', 'wrong number', 'not my business', 'moved'
  ],
  unsubscribe: [
    'stop', 'unsubscribe', 'remove me', 'opt out', 'opt-out',
    'don\'t contact', 'do not contact', 'no more emails', 'stop emailing',
    'take me off', 'remove from list', 'never contact', 'spam',
    'leave me alone', 'fuck off', 'piss off'
  ]
};

// ─── Objection Sub-types ─────────────────────────────────────────────────────
const OBJECTION_TYPES = {
  price: ['expensive', 'budget', 'afford', 'cost', 'cheap', 'price', 'money'],
  timing: ['timing', 'busy', 'later', 'now', 'month', 'quarter', 'year', 'holiday'],
  existing_vendor: ['already have', 'working with', 'developer', 'agency', 'someone else', 'nephew', 'friend', 'brother']
};

// ─── Heuristic Classifier ────────────────────────────────────────────────────
function classifyHeuristic(text) {
  const lower = text.toLowerCase().trim();

  // Check unsubscribe first (highest priority — compliance)
  for (const kw of INTENT_KEYWORDS.unsubscribe) {
    if (lower.includes(kw)) {
      return { intent: 'unsubscribe', confidence: 0.9, method: 'heuristic' };
    }
  }

  // Score each intent
  const scores = {};
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    scores[intent] = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[intent]++;
    }
  }

  // Find winner
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === 0) {
    return { intent: 'not_now', confidence: 0.3, method: 'heuristic_default' };
  }

  const winner = sorted[0][0];
  const confidence = Math.min(0.85, 0.4 + sorted[0][1] * 0.15);

  const result = { intent: winner, confidence, method: 'heuristic' };

  // Identify objection sub-type
  if (winner === 'objection') {
    for (const [type, keywords] of Object.entries(OBJECTION_TYPES)) {
      if (keywords.some(kw => lower.includes(kw))) {
        result.objectionType = type;
        break;
      }
    }
  }

  return result;
}

// ─── AI-Powered Classifier ───────────────────────────────────────────────────
async function classifyWithAI(text) {
  const prompt = `You are classifying an email reply from a business owner who received a cold outreach email offering website redesign services.

Reply text:
---
${text.slice(0, 2000)}
---

Classify the reply intent. Return ONLY this JSON:
{
  "intent": "interested" | "objection" | "not_now" | "wrong_contact" | "unsubscribe",
  "confidence": 0.0-1.0,
  "objectionType": "price" | "timing" | "existing_vendor" | null,
  "suggestedResponse": "A brief 1-2 sentence recommended reply approach",
  "summary": "One line summary of what the person said"
}

Rules:
- "unsubscribe" if they explicitly ask to stop or use hostile language
- "interested" if they want to learn more, see pricing, or schedule a call
- "objection" if they push back but haven't said stop — these are still alive
- "wrong_contact" if this person isn't the decision-maker or business is closed
- "not_now" for vague/non-committal responses or just "thanks"
- Set objectionType only when intent is "objection"`;

  const response = await aiComplete(prompt, { jsonMode: true, temperature: 0.1, maxTokens: 512 });
  const parsed = parseAiJson(response);
  if (!parsed?.intent) throw new Error('Invalid AI classification response');
  parsed.method = 'ai';
  return parsed;
}

// ─── Master: classifyReply ───────────────────────────────────────────────────
/**
 * Classify an inbound email/message reply.
 *
 * @param {string} text - The reply text content
 * @param {object} opts
 * @param {boolean} opts.aiOnly - Skip heuristics, use AI only
 * @returns {Promise<{intent, confidence, method, objectionType?, suggestedResponse?, summary?}>}
 */
export async function classifyReply(text, opts = {}) {
  if (!text || text.trim().length < 3) {
    return { intent: 'not_now', confidence: 0.1, method: 'empty' };
  }

  // Always run heuristics first (free, instant)
  const heuristic = classifyHeuristic(text);

  // If heuristic is very confident (unsubscribe, strong signal), return immediately
  if (heuristic.confidence >= 0.85) {
    return heuristic;
  }

  // Try AI classification for richer analysis
  try {
    const aiResult = await classifyWithAI(text);
    return aiResult;
  } catch (err) {
    console.warn(`[reply_classifier] AI failed (${err.message}), using heuristic`);
    return heuristic;
  }
}

// ─── Objection Response Library ──────────────────────────────────────────────
export const OBJECTION_RESPONSES = {
  price: {
    framework: 'Value reframe',
    template: (name, businessName) =>
      `Hi ${name}, totally understand — budget matters. The way I think about it: if the new site brings in even 2-3 extra calls a month for ${businessName}, it pays for itself in the first month. Happy to walk through the ROI if helpful!`
  },
  timing: {
    framework: 'Future anchor',
    template: (name) =>
      `Hi ${name}, completely get it — timing is everything. I'll check back in a couple months. In the meantime, the demo site I built is yours to reference whenever you're ready. No pressure at all!`
  },
  existing_vendor: {
    framework: 'Non-threatening comparison',
    template: (name, businessName) =>
      `Hi ${name}, that's great that ${businessName} has someone! No intention to step on toes. The demo was more to show what a modern mobile-first approach looks like — feel free to share it with your current developer for inspiration. Either way, wishing you continued success!`
  }
};

// ─── CLI Test ─────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const testCases = [
    { text: 'This looks amazing! Can we set up a call this week?', expected: 'interested' },
    { text: 'Too expensive for us right now, maybe next year', expected: 'objection' },
    { text: 'Thanks but we just had our website redone', expected: 'objection' },
    { text: 'STOP sending me emails', expected: 'unsubscribe' },
    { text: 'I no longer work at this business', expected: 'wrong_contact' },
    { text: 'Interesting, let me think about it', expected: 'not_now' }
  ];

  const isTest = process.argv.includes('--test');
  console.log('\n🧠 Reply Classifier Test Suite\n');

  for (const tc of testCases) {
    const result = isTest
      ? classifyHeuristic(tc.text)  // Quick heuristic-only test
      : await classifyReply(tc.text);
    const match = result.intent === tc.expected ? '✅' : '❌';
    console.log(`${match} "${tc.text.slice(0, 50)}..." → ${result.intent} (${result.confidence.toFixed(2)}) [${result.method}]`);
  }
}
