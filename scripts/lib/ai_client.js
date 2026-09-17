/**
 * scripts/lib/ai_client.js
 * Production BYOK Multi-Provider AI Client
 *
 * Supports: Groq · OpenAI · Anthropic · Google Gemini · OpenRouter · Custom (any OpenAI-compat)
 * Interface: aiComplete(prompt, opts) → string
 *
 * ponytail: zero npm deps, stdlib fetch only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAppConfig } from './config_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, '..', '..', 'config.json');

// ─── Provider Registry ────────────────────────────────────────────────────────
export const PROVIDERS = {
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    format: 'openai',
    defaultModel: 'qwen/qwen3.8-27b',
    models: [
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b'
    ],
    supportsJsonMode: true,
    freeTier: true
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    format: 'openai',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    supportsJsonMode: true,
    freeTier: false
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    format: 'anthropic',
    defaultModel: 'claude-3-5-haiku-20241022',
    models: [
      'claude-3-5-haiku-20241022',
      'claude-3-5-sonnet-20241022',
      'claude-opus-4-5',
      'claude-3-opus-20240229'
    ],
    supportsJsonMode: false, // uses prefilling instead
    freeTier: false
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    format: 'gemini',
    defaultModel: 'gemini-2.5-flash',
    models: [
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ],
    supportsJsonMode: true, // via responseMimeType
    freeTier: true
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    format: 'openai',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    models: [
      'meta-llama/llama-3.3-70b-instruct',
      'anthropic/claude-3-haiku',
      'google/gemini-flash-1.5',
      'mistralai/mistral-7b-instruct',
      'nousresearch/hermes-3-llama-3.1-70b'
    ],
    supportsJsonMode: true,
    freeTier: true // some free models
  },
  custom: {
    name: 'Custom Endpoint',
    baseUrl: '', // set via config.ai.customEndpoint
    format: 'openai', // assume OpenAI-compat (Ollama, LM Studio, Together, etc.)
    defaultModel: 'llama3',
    models: [], // user-defined
    supportsJsonMode: false,
    freeTier: true
  }
};

// ─── Config Loader ────────────────────────────────────────────────────────────
function loadAiConfig() {
  try {
    const cfg = loadAppConfig();
    if (cfg.ai) return cfg.ai;
  } catch {}
  return { provider: 'groq', model: 'qwen/qwen3.8-27b', keys: {}, fallbackProviders: ['gemini', 'groq'] };
}

function getApiKey(aiConfig, provider) {
  return (
    aiConfig?.keys?.[provider] ||
    process.env[`${provider.toUpperCase()}_API_KEY`] ||
    process.env.GROQ_API_KEY || // universal fallback
    ''
  );
}

// ─── OpenAI-Compatible Request (Groq, OpenAI, OpenRouter, Custom) ─────────────
async function callOpenAICompat({ baseUrl, apiKey, model, prompt, jsonMode, temperature = 0.15, maxTokens = 2048 }) {
  const messages = [{ role: 'user', content: prompt }];
  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://apex-ai-web.studio',
      'X-Title': 'Apex AI Web Studio'
    },
    body: JSON.stringify(body)
  }, 30000);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from provider');
  return content;
}

// ─── Anthropic Native Request ─────────────────────────────────────────────────
async function callAnthropic({ apiKey, model, prompt, temperature = 0.15, maxTokens = 2048 }) {
  // Prefix with JSON instruction for structured output
  const systemPrompt = 'You are an expert web consultant. Respond only with valid JSON when asked for JSON output.';

  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  }, 30000);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.content?.[0]?.text;
  if (!content) throw new Error('Empty response from Anthropic');
  return content;
}

// ─── Google Gemini Native Request ─────────────────────────────────────────────
async function callGemini({ apiKey, model, prompt, jsonMode, temperature = 0.15, maxTokens = 2048 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig = {
    temperature,
    maxOutputTokens: maxTokens
  };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig
    })
  }, 30000);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');
  return content;
}

// ─── Fetch with Timeout ───────────────────────────────────────────────────────
async function fetchWithTimeout(url, opts, ms = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Core: Provider-Agnostic Complete ────────────────────────────────────────
/**
 * Calls the configured AI provider.
 * @param {string} prompt - The user prompt
 * @param {object} opts
 * @param {boolean} opts.jsonMode - Request JSON output
 * @param {number}  opts.temperature
 * @param {number}  opts.maxTokens
 * @param {object}  opts.aiConfigOverride - Override config (for testing)
 * @returns {Promise<string>} Raw text response
 */
export async function aiComplete(prompt, opts = {}) {
  const { jsonMode = false, temperature = 0.15, maxTokens = 2048, aiConfigOverride } = opts;
  const aiConfig = aiConfigOverride || loadAiConfig();

  const provider = aiConfig.provider || 'groq';
  const providerDef = PROVIDERS[provider] || PROVIDERS.groq;
  const model = aiConfig.model || providerDef.defaultModel;
  const apiKey = getApiKey(aiConfig, provider);

  // Determine base URL (custom endpoint may override)
  let baseUrl = providerDef.baseUrl;
  if (provider === 'custom' && aiConfig.customEndpoint) {
    baseUrl = aiConfig.customEndpoint.replace(/\/+$/, ''); // strip trailing slash
  }

  const callArgs = { baseUrl, apiKey, model, prompt, jsonMode, temperature, maxTokens };

  try {
    switch (providerDef.format) {
      case 'openai':
        return await callOpenAICompat(callArgs);
      case 'anthropic':
        return await callAnthropic({ apiKey, model, prompt, temperature, maxTokens });
      case 'gemini':
        return await callGemini({ apiKey, model, prompt, jsonMode: jsonMode && providerDef.supportsJsonMode, temperature, maxTokens });
      default:
        return await callOpenAICompat(callArgs);
    }
  } catch (primaryErr) {
    // Fallback cascade
    const fallbacks = aiConfig.fallbackProviders || [];
    for (const fb of fallbacks) {
      if (fb === provider) continue;
      const fbDef = PROVIDERS[fb];
      if (!fbDef) continue;
      const fbKey = getApiKey(aiConfig, fb);
      if (!fbKey) continue;
      console.error(`[ai_client] Primary provider "${provider}" failed (${primaryErr.message}). Trying fallback: "${fb}"`);
      try {
        const fbArgs = { baseUrl: fbDef.baseUrl, apiKey: fbKey, model: fbDef.defaultModel, prompt, jsonMode, temperature, maxTokens };
        switch (fbDef.format) {
          case 'openai': return await callOpenAICompat(fbArgs);
          case 'anthropic': return await callAnthropic({ apiKey: fbKey, model: fbDef.defaultModel, prompt, temperature, maxTokens });
          case 'gemini': return await callGemini({ apiKey: fbKey, model: fbDef.defaultModel, prompt, jsonMode, temperature, maxTokens });
          default: return await callOpenAICompat(fbArgs);
        }
      } catch (fbErr) {
        console.error(`[ai_client] Fallback "${fb}" also failed: ${fbErr.message}`);
      }
    }
    throw primaryErr; // all providers failed
  }
}

/**
 * Parse JSON from AI response — handles markdown fencing
 */
export function parseAiJson(text) {
  if (!text) return null;
  // Strip markdown code fences
  const stripped = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Try to find JSON block inside text
    const jsonMatch = stripped.match(/\{[\s\S]+\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch {}
    }
    return null;
  }
}

/**
 * Returns the current effective provider + model for display
 */
export function getActiveProvider() {
  const cfg = loadAiConfig();
  const provider = cfg.provider || 'groq';
  const def = PROVIDERS[provider] || PROVIDERS.groq;
  return {
    provider,
    name: def.name,
    model: cfg.model || def.defaultModel,
    hasKey: !!getApiKey(cfg, provider)
  };
}

// ─── CLI Test ─────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isTest = process.argv.includes('--test');
  const active = getActiveProvider();
  console.log(`\n⚡ AI Client Test — Provider: ${active.name} | Model: ${active.model} | Key: ${active.hasKey ? '✅' : '❌ NOT SET'}\n`);
  if (!active.hasKey) {
    console.log('Set a key in config.json under ai.keys to run a live test.');
    process.exit(0);
  }
  aiComplete('Say "AI client operational" and nothing else.')
    .then(r => console.log('✅ Response:', r))
    .catch(e => { console.error('❌', e.message); process.exit(1); });
}
