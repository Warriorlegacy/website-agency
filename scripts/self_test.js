/**
 * scripts/self_test.js
 * Agency-wide verification suite.
 *
 * Runs three layers of checks:
 *   1. MODULE LOAD   — every engine imports cleanly (catches syntax/import breakage)
 *   2. GUARDRAILS    — fabrication, compliance, opt-out and payment rules hold
 *   3. PIPELINE      — no synthetic/junk records are in the CRM; no unverified revenue
 *
 * Usage: node scripts/self_test.js [--json]
 * Exit code 0 = all green.
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const results = [];
function record(group, name, pass, detail = '') {
  results.push({ group, name, pass, detail });
}

// ─── 1. Module load checks ───────────────────────────────────────────────────
const MODULES = [
  'scripts/lib/guardrails.js',
  'scripts/lib/free_stack.js',
  'scripts/lib/config_loader.js',
  'scripts/lib/ai_client.js',
  'scripts/lib/anythingllm_client.js',
  'scripts/lib/email_sender.js',
  'scripts/lib/google_maps_scraper.js',
  'scripts/lib/voice_caller.js',
  'scripts/lib/pipecat_caller.js',
  'scripts/lib/browser_use_scraper.js',
  'scripts/lib/postiz_scheduler.js',
  'scripts/lib/cline_scheduler.js',
  'scripts/lib/closing_engine.js',
  'scripts/lib/payment.js',
  'scripts/lib/reply_classifier.js',
  'scripts/lib/scheduler.js',
  'scripts/lib/screenshot.js',
  'scripts/audit_engine.js',
  'scripts/demo_generator.js',
  'scripts/outreach_generator.js',
  'scripts/hermes.js',
  'scripts/autopilot.js',
  'scripts/daily_summary.js',
  'scripts/preview_server.js'
];

for (const rel of MODULES) {
  const abs = path.join(ROOT_DIR, rel);
  if (!fs.existsSync(abs)) {
    record('module-load', rel, false, 'file missing');
    continue;
  }
  // node --check works for CJS; for ESM use dynamic import in a child process.
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify('file:///' + abs.replace(/\\/g, '/'))})`], {
    encoding: 'utf-8', timeout: 25000
  });
  const stderr = (probe.stderr || '').split('\n').filter(l => /Error|SyntaxError|Cannot find/.test(l)).slice(0, 2).join(' | ');
  record('module-load', rel, probe.status === 0, stderr);
}

// ─── 2. Guardrail rule checks ────────────────────────────────────────────────
const G = await import('./lib/guardrails.js');

record('guardrails', 'blocks non-routable .test email',
  G.isSendableEmail('james@apexelectric.test').ok === false);
record('guardrails', 'blocks guessed generic mailbox without a public source',
  G.isSendableEmail('contact@rossispizza.com').ok === false);
record('guardrails', 'allows a publicly-sourced address',
  G.isSendableEmail('marco@rossispizza.com', { observedOn: 'https://rossispizza.com/contact' }).ok === true);
record('guardrails', 'detects (555) placeholder phone',
  G.isSyntheticLead({ businessName: 'X Co', phone: '(555) 123-4567' }) === true);
record('guardrails', 'detects synthetic source tag',
  G.isSyntheticLead({ businessName: 'X Co', source: 'synthetic' }) === true);
record('guardrails', 'rejects search-query business names',
  G.isJunkBusinessName('What are the best restaurants with outdoor seating?').junk === true);
record('guardrails', 'rejects national chains',
  G.isJunkBusinessName('Starbucks').junk === true);
record('guardrails', 'accepts a genuine local business',
  G.isJunkBusinessName("Rossi's Pizzeria").junk === false);
record('guardrails', 'compliance flags email with no opt-out',
  G.checkOutreachCompliance('Hi, buy now').ok === false);
const goodEmail = "Hi Marco,\n1. Mobile tap-to-call\n2. 3x faster load\nDemo: https://x.com/d\nReply STOP and I won't follow up.\nApex AI Web Studio · 12 Main Street, Suite 3";
record('guardrails', 'compliance passes a fully compliant email',
  G.checkOutreachCompliance(goodEmail, { demoUrl: 'https://x.com/d' }).ok === true);
record('guardrails', 'rejects payment with no transaction reference',
  G.verifyPayment({ provider: 'upi', amount: 750, verifiedBy: 'webhook' }).verified === false);
record('guardrails', 'rejects agent-asserted payment',
  G.verifyPayment({ provider: 'upi', reference: 'UPI-1234', amount: 750, verifiedBy: 'agent' }).verified === false);
record('guardrails', 'accepts webhook-verified payment',
  G.verifyPayment({ provider: 'upi', reference: 'UPI-1234', amount: 750, verifiedBy: 'webhook' }).verified === true);
record('guardrails', 'blocks outbound without operator approval',
  G.isApprovedForOutreach({ slug: 'x' }).ok === false);
record('guardrails', 'max follow-up limit is 2 (AGENTS.md rule 3)',
  G.MAX_FOLLOW_UPS === 2);
// ─── 3. Pipeline data integrity ──────────────────────────────────────────────
const pipelinePath = path.join(ROOT_DIR, 'pipeline.json');
if (!fs.existsSync(pipelinePath)) {
  record('pipeline', 'pipeline.json exists', false, 'missing file');
} else {
  const pipeline = JSON.parse(fs.readFileSync(pipelinePath, 'utf-8'));
  const prospects = pipeline.prospects || [];
  record('pipeline', 'pipeline.json parses', true, `${prospects.length} prospects`);

  const synthetic = prospects.filter(p => G.isSyntheticLead(p));
  record('pipeline', 'no synthetic/fabricated leads in CRM', synthetic.length === 0,
    synthetic.map(p => p.businessName).join(', '));

  const junk = prospects.filter(p => G.isJunkBusinessName(p.businessName).junk);
  record('pipeline', 'no junk/query/chain records in CRM', junk.length === 0,
    junk.map(p => `${p.businessName} [${G.isJunkBusinessName(p.businessName).reason}]`).join('; '));

  const dupes = prospects.map(p => p.slug).filter((s, i, a) => a.indexOf(s) !== i);
  record('pipeline', 'no duplicate slugs', dupes.length === 0, dupes.join(', '));

  const badEmails = prospects.filter(p => p.ownerEmail && !G.isSendableEmail(p.ownerEmail, { observedOn: p.ownerEmailSource }).ok);
  record('pipeline', 'no unverifiable owner emails stored', badEmails.length === 0,
    badEmails.map(p => `${p.slug}:${p.ownerEmail}`).join('; '));

  const wonWithoutProof = prospects.filter(p =>
    p.stage === 'CLOSED_WON' && !(p.paymentEvidence && p.paymentEvidence.reference));
  record('pipeline', 'no CLOSED_WON deal lacks verified payment evidence', wonWithoutProof.length === 0,
    wonWithoutProof.map(p => p.slug).join(', '));
}

// ─── Report ──────────────────────────────────────────────────────────────────
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ results, passed: results.filter(r => r.pass).length, total: results.length }, null, 2));
} else {
  let currentGroup = '';
  for (const r of results) {
    if (r.group !== currentGroup) { currentGroup = r.group; console.log(`\n── ${currentGroup.toUpperCase()} ──`); }
    const detail = r.detail ? (r.pass ? ` (${r.detail})` : `\n     ↳ ${r.detail}`) : '';
    console.log(`${r.pass ? '✅' : '❌'} ${r.name}${detail}`);
  }
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
}

process.exit(results.some(r => !r.pass) ? 1 : 0);