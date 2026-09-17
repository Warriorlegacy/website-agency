/**
 * scripts/autopilot.js
 * The 24/7 Autonomous Agency Autopilot Daemon
 *
 * Runs the entire agency end-to-end without requiring any manual touch:
 *   1. Auto-Harvester: Scrapes Google Maps for no-website & outdated businesses
 *   2. Audit Engine: Evaluates 5 dimensions of technical & conversion quality
 *   3. Demo Generator: Builds customized modern HTML5 one-page demo sites
 *   4. Outreach Drafter: Prepares personalized 3-touch emails and call scripts
 *   5. Email Sender: Dispatches cold outreach with live demo link & screenshots
 *   6. AI Voice Caller: Places conversational phone calls to owners during business hours
 *   7. Closing Engine: Sends proposals, deposit links, and confirms CLOSED_WON deals
 *   8. Summary Bot: Dispatches daily pipeline digests to Telegram or file
 *
 * Usage:
 *   node scripts/autopilot.js                      # Run single full cycle
 *   node scripts/autopilot.js --dry-run            # Preview actions without executing
 *   node scripts/autopilot.js --loop --interval=15 # Run continuously every 15 minutes
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';
import { autoHarvestAndIngest } from './lib/google_maps_scraper.js';
import { runHermes } from './hermes.js';
import { placeVoiceCall } from './lib/voice_caller.js';
import { sendClosingProposal } from './lib/closing_engine.js';
import { generateDailySummary, sendWorkflowRunReport } from './daily_summary.js';
import { loadAppConfig } from './lib/config_loader.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const INTERACTIONS_FILE = path.join(ROOT_DIR, 'interactions.json');

function loadConfig() {
  return loadAppConfig();
}

function loadPipeline() {
  try { return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8')); } catch { return { prospects: [] }; }
}

function loadInteractions() {
  try { return JSON.parse(fs.readFileSync(INTERACTIONS_FILE, 'utf-8')); } catch { return []; }
}

function isBusinessHours() {
  const hour = new Date().getHours();
  // Safe calling window: 9:00 AM to 6:00 PM
  return hour >= 9 && hour < 18;
}

function log(icon, msg) {
  const line = `[${new Date().toISOString()}] ${icon} ${msg}`;
  console.log(line);
  return line;
}

// ─── Main Autonomous Cycle ───────────────────────────────────────────────────
export async function runAutopilotCycle(opts = {}) {
  const { dryRun = false } = opts;
  const cfg = loadConfig();
  const pipeline = loadPipeline();

  log('🚀', `======================================================`);
  log('⚡', `AUTONOMOUS AGENCY AUTOPILOT CYCLE STARTING${dryRun ? ' [DRY RUN]' : ''}`);
  log('🚀', `======================================================`);

  // ── PHASE 1: Auto-Harvester (Google Maps & Local Scraping) ──
  const cycleReport = {
    harvested: [],
    demos: [],
    calls: [],
    proposals: []
  };

  const initialSlugs = new Set(pipeline.prospects.map(p => p.slug));
  const demosDir = path.join(ROOT_DIR, 'demos');
  const initialDemos = new Set(fs.existsSync(demosDir) ? fs.readdirSync(demosDir) : []);

  const activeCount = pipeline.prospects.filter(p => !['CLOSED_WON', 'CLOSED_LOST'].includes(p.stage)).length;
  const minActiveTarget = cfg.autopilot?.minActiveTarget || 8;
  const harvestQuota = opts.harvestCount || (activeCount < minActiveTarget ? (minActiveTarget - activeCount) : 0);

  if (harvestQuota > 0) {
    log('🚜', `Harvesting ${harvestQuota} fresh leads from live Maps & OpenStreetMap...`);
    if (!dryRun) {
      await autoHarvestAndIngest({ maxLeads: harvestQuota });
    } else {
      log('🏜️', `[DRY RUN] Would harvest ${harvestQuota} leads from Google Maps`);
    }
  } else {
    log('📊', `Pipeline healthy: ${activeCount} active prospects currently in funnel.`);
  }

  // ── PHASE 2: Hermes Orchestrator (Audit, Demo, Email, Progress) ──
  log('🏛️', `Running Hermes central decision cycle...`);
  const hermesResult = await runHermes({ dryRun });
  log('✅', `Hermes executed ${hermesResult.actionsCount} automated actions.`);

  // Detect newly harvested leads and newly generated demos
  const midPipeline = loadPipeline();
  cycleReport.harvested = midPipeline.prospects.filter(p => !initialSlugs.has(p.slug));
  if (fs.existsSync(demosDir)) {
    cycleReport.demos = fs.readdirSync(demosDir).filter(d => !initialDemos.has(d)).map(slug => ({ businessName: slug }));
  }

  // ── PHASE 3: Autonomous AI Voice Calling Engine ──
  const voiceEnabled = cfg.autopilot?.autoCall !== false;
  if (voiceEnabled) {
    if (isBusinessHours() || opts.ignoreQuietHours) {
      log('📞', `Checking for leads ready for AI Voice cold-calling...`);
      const refreshedPipeline = loadPipeline();
      const interactions = loadInteractions();

      // Find leads that are CONTACTED (emailed) or DEMO_GENERATED with phone, not contacted in last 48h
      const callCandidates = refreshedPipeline.prospects.filter(p => {
        if (!p.phone || p.do_not_contact) return false;
        if (!['CONTACTED', 'DEMO_GENERATED', 'OUTREACH_DRAFTED'].includes(p.stage)) return false;

        const leadInteractions = interactions.filter(i => i.lead_slug === p.slug);
        const lastCall = leadInteractions.filter(i => i.action === 'voice_call').pop();
        if (lastCall) {
          const hoursSinceCall = (Date.now() - new Date(lastCall.timestamp).getTime()) / (1000 * 60 * 60);
          if (hoursSinceCall < 48) return false; // Cooldown
        }
        return true;
      });

      log('📱', `Found ${callCandidates.length} eligible leads for voice outreach.`);

      for (const candidate of callCandidates.slice(0, 3)) { // Max 3 calls per cycle to maintain pacing
        log('🎙️', `Initiating autonomous voice call to ${candidate.businessName} (${candidate.phone})...`);
        if (!dryRun) {
          try {
            const callResult = await placeVoiceCall(candidate, { simulate: cfg.voiceCalling?.simulateFallback !== false });
            log('✅', `Voice call completed for ${candidate.businessName} — Outcome: ${callResult.outcome || 'completed'}`);
            cycleReport.calls.push({
              businessName: candidate.businessName,
              outcome: callResult.outcome || 'completed'
            });

            if (callResult.outcome === 'meeting_scheduled') {
              candidate.stage = 'MEETING_SCHEDULED';
              candidate.lastAction = new Date().toISOString();
            } else if (callResult.outcome === 'send_proposal') {
              log('💼', `Call outcome requested proposal — auto-dispatching closing proposal for ${candidate.businessName}...`);
              await sendClosingProposal(candidate, { packageTier: 'growth' });
            }
          } catch (err) {
            log('⚠️', `Voice call failed for ${candidate.businessName}: ${err.message}`);
          }
        } else {
          log('🏜️', `[DRY RUN] Would call ${candidate.businessName} (${candidate.phone}) via AI Voice Agent`);
        }
      }
    } else {
      log('🌙', `Outside business hours (09:00 - 18:00). Voice calling paused for compliance.`);
    }
  }

  // ── PHASE 4: Autonomous Client Closing & Proposals ──
  const refreshedPipeline = loadPipeline();
  const readyForProposal = refreshedPipeline.prospects.filter(p => p.stage === 'MEETING_SCHEDULED' && !p.proposalSent);

  for (const lead of readyForProposal) {
    log('💼', `Auto-generating proposal and deposit checkout link for ${lead.businessName}...`);
    if (!dryRun) {
      await sendClosingProposal(lead, { packageTier: 'growth' });
      lead.proposalSent = true;
      lead.lastAction = new Date().toISOString();
      cycleReport.proposals.push({
        businessName: lead.businessName
      });
    } else {
      log('🏜️', `[DRY RUN] Would send proposal and payment link to ${lead.businessName}`);
    }
  }

  // Save any state updates
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(refreshedPipeline, null, 2), 'utf-8');

  // ── PHASE 5: Comprehensive Telegram Workflow Run Report ──
  try {
    log('📱', `Dispatching comprehensive workflow run report to Telegram...`);
    await sendWorkflowRunReport(cycleReport);
  } catch (err) {
    log('⚠️', `Failed to send Telegram workflow report: ${err.message}`);
  }

  log('🏁', `AUTOPILOT CYCLE COMPLETE — All active leads evaluated & progressed.`);
  return { success: true, cycleReport };
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const loop = args.includes('--loop');
  const ignoreQuietHours = args.includes('--force-call');
  const harvestArg = args.find(a => a.startsWith('--harvest='));
  const harvestCount = harvestArg ? parseInt(harvestArg.split('=')[1], 10) : (args.includes('--harvest') || args.includes('--force-harvest') ? 2 : 0);
  const intervalArg = args.find(a => a.startsWith('--interval='));
  const intervalMin = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 15;

  if (loop) {
    console.log(`\n🤖 APEX 24/7 AUTONOMOUS AGENCY AUTOPILOT ACTIVATED`);
    console.log(`   Running cycle every ${intervalMin} minutes${dryRun ? ' [DRY RUN]' : ''}\n`);

    const run = async () => {
      try {
        await runAutopilotCycle({ dryRun, ignoreQuietHours, harvestCount });
      } catch (err) {
        console.error(`❌ Autopilot cycle error:`, err);
      }
      setTimeout(run, intervalMin * 60 * 1000);
    };
    run();
  } else {
    runAutopilotCycle({ dryRun, ignoreQuietHours, harvestCount }).catch(err => {
      console.error('❌ Fatal Autopilot Error:', err);
      process.exit(1);
    });
  }
}
