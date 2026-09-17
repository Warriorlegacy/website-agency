/**
 * scripts/lib/config_loader.js
 * Unified Configuration Loader
 *
 * Merges in order of priority:
 *   1. Environment Variables (process.env)
 *   2. config.local.json (Local overrides, git-ignored)
 *   3. config.json (Base project config)
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const LOCAL_CONFIG_FILE = path.join(ROOT_DIR, 'config.local.json');

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function deepMerge(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else if (source[key] !== undefined && source[key] !== '') {
        output[key] = source[key];
      }
    });
  }
  return output;
}

export function loadAppConfig() {
  let config = {};

  // 1. Base config.json
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️ Failed to parse config.json:', err.message);
  }

  // 2. Inject Environment Variables (e.g. GitHub Actions cloud secrets)
  if (!config.ai) config.ai = { keys: {} };
  if (!config.ai.keys) config.ai.keys = {};
  if (process.env.GROQ_API_KEY) config.ai.keys.groq = process.env.GROQ_API_KEY;
  if (process.env.GEMINI_API_KEY) config.ai.keys.gemini = process.env.GEMINI_API_KEY;
  if (process.env.OPENAI_API_KEY) config.ai.keys.openai = process.env.OPENAI_API_KEY;
  if (process.env.ANTHROPIC_API_KEY) config.ai.keys.anthropic = process.env.ANTHROPIC_API_KEY;

  if (!config.email) config.email = {};
  if (process.env.RESEND_API_KEY) config.email.resendApiKey = process.env.RESEND_API_KEY;

  if (!config.scheduling) config.scheduling = {};
  if (process.env.CAL_API_KEY) config.scheduling.calcomApiKey = process.env.CAL_API_KEY;

  if (!config.notifications) config.notifications = { telegram: {} };
  if (!config.notifications.telegram) config.notifications.telegram = {};
  if (process.env.TELEGRAM_BOT_TOKEN) config.notifications.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (process.env.TELEGRAM_CHAT_ID) config.notifications.telegram.chatId = process.env.TELEGRAM_CHAT_ID;

  if (!config.voiceCalling) config.voiceCalling = { keys: {} };
  if (!config.voiceCalling.keys) config.voiceCalling.keys = {};
  if (process.env.VAPI_API_KEY) {
    config.voiceCalling.keys.vapiApiKey = process.env.VAPI_API_KEY;
    if (!config.voiceCalling.provider || config.voiceCalling.provider === 'simulation') {
      config.voiceCalling.provider = 'vapi';
    }
  }
  if (process.env.VAPI_ASSISTANT_ID) config.voiceCalling.keys.vapiAssistantId = process.env.VAPI_ASSISTANT_ID;
  if (process.env.VAPI_PHONE_NUMBER_ID) config.voiceCalling.keys.vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (process.env.BLAND_API_KEY) config.voiceCalling.keys.blandApiKey = process.env.BLAND_API_KEY;

  // 3. Local config.local.json (Highest precedence for local developer overrides)
  try {
    if (fs.existsSync(LOCAL_CONFIG_FILE)) {
      const local = JSON.parse(fs.readFileSync(LOCAL_CONFIG_FILE, 'utf-8'));
      config = deepMerge(config, local);
    }
  } catch {}

  return config;
}

/**
 * Returns public HTTPS demo URL for a prospect slug
 */
export function getPublicDemoUrl(slug) {
  const config = loadAppConfig();
  const baseUrl = config.agency?.demoBaseUrl || 'https://warriorlegacy.github.io/website-agency/demos';
  return `${baseUrl.replace(/\/$/, '')}/${slug}/index.html`;
}
