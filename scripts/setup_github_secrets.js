#!/usr/bin/env node
/**
 * scripts/setup_github_secrets.js
 * One-time setup: push all API keys as GitHub Actions secrets
 * using the GitHub CLI (gh).
 *
 * Usage:
 *   node scripts/setup_github_secrets.js
 *
 * Prerequisites:
 *   gh auth login   (authenticate with GitHub CLI once)
 *   npm install -g gh  or install from https://cli.github.com
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadConfig(file) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf-8')); } catch { return {}; }
}

// Load both configs — local overrides base
const base  = loadConfig('config.json');
const local = loadConfig('config.local.json');
const cfg   = { ...base, ...local };

const SECRETS = {
  // AI
  GROQ_API_KEY:        cfg.ai?.keys?.groq        || '',
  GEMINI_API_KEY:      cfg.ai?.keys?.gemini       || '',
  OPENAI_API_KEY:      cfg.ai?.keys?.openai        || '',
  ANTHROPIC_API_KEY:   cfg.ai?.keys?.anthropic     || '',
  OPENROUTER_API_KEY:  cfg.ai?.keys?.openrouter    || '',

  // Email
  RESEND_API_KEY:      cfg.email?.resendApiKey    || '',
  SMTP_USER:           cfg.email?.smtp?.user       || '',
  SMTP_PASS:           cfg.email?.smtp?.pass       || '',
  GMAIL_USER:          cfg.email?.smtp?.user       || '',
  GMAIL_PASS:          cfg.email?.smtp?.pass       || '',

  // Scheduling
  CAL_API_KEY:         cfg.scheduling?.calcomApiKey || '',

  // Notifications
  TELEGRAM_BOT_TOKEN:  cfg.notifications?.telegram?.botToken || '',
  TELEGRAM_CHAT_ID:    cfg.notifications?.telegram?.chatId   || '',

  // Voice Calling
  VAPI_API_KEY:        cfg.voiceCalling?.keys?.vapiApiKey       || '',
  VAPI_ASSISTANT_ID:   cfg.voiceCalling?.keys?.vapiAssistantId  || '',
  VAPI_PHONE_NUMBER_ID: cfg.voiceCalling?.keys?.vapiPhoneNumberId || '',
  BLAND_API_KEY:       cfg.voiceCalling?.keys?.blandApiKey      || '',
  TWILIO_ACCOUNT_SID:  cfg.voiceCalling?.keys?.twilioAccountSid || '',
  TWILIO_AUTH_TOKEN:   cfg.voiceCalling?.keys?.twilioAuthToken  || '',
  TWILIO_PHONE_NUMBER: cfg.voiceCalling?.keys?.twilioPhoneNumber || '',

  // Payments
  RAZORPAY_KEY_ID:     cfg.payments?.razorpayKeyId    || '',
  RAZORPAY_KEY_SECRET: cfg.payments?.razorpayKeySecret || '',
  STRIPE_SECRET_KEY:   cfg.payments?.stripeSecretKey   || '',

  // Integrations
  BROWSER_USE_API_KEY: cfg.integrations?.browserUse?.cloudApiKey || '',
  CARTESIA_API_KEY:    cfg.integrations?.pipecat?.cartesiaApiKey  || '',
  DEEPGRAM_API_KEY:    cfg.integrations?.pipecat?.deepgramApiKey  || '',
  POSTIZ_API_KEY:      cfg.integrations?.postiz?.apiKey           || '',
  ANYTHINGLLM_API_KEY: cfg.integrations?.anythingllm?.apiKey      || '',

  // Screenshots
  SCREENSHOT_ONE_KEY:  cfg.screenshot?.screenshotOneKey || '',
  URLBOX_KEY:          cfg.screenshot?.urlboxKey         || '',
};

console.log('\n🔑 Apex AI Web Studio — GitHub Secrets Setup\n');
console.log('Repository: https://github.com/Warriorlegacy/website-agency\n');

let set = 0, skipped = 0, failed = 0;

for (const [name, value] of Object.entries(SECRETS)) {
  if (!value) {
    console.log(`  ⚪ SKIP     ${name} (empty)`);
    skipped++;
    continue;
  }

  try {
    execSync(
      `gh secret set ${name} --repo Warriorlegacy/website-agency`,
      {
        input: value,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8'
      }
    );
    console.log(`  ✅ SET      ${name}`);
    set++;
  } catch (e) {
    console.error(`  ❌ FAILED   ${name}: ${e.stderr?.slice(0, 100) || e.message}`);
    failed++;
  }
}

console.log(`\n📊 Done — ${set} set, ${skipped} skipped, ${failed} failed`);

if (failed > 0) {
  console.log('\n💡 If "gh: command not found", install GitHub CLI:');
  console.log('   https://cli.github.com/\n');
  console.log('Then authenticate: gh auth login\n');
} else {
  console.log('\n✅ All secrets pushed! GitHub Actions workflows will now run fully.\n');
  console.log('🔗 View secrets: https://github.com/Warriorlegacy/website-agency/settings/secrets/actions\n');
}
