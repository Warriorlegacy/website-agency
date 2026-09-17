/**
 * scripts/hermes.js
 * Hermes — The Autonomous Agency Orchestrator
 *
 * The central "brain" of the system. Reads all leads from pipeline.json,
 * evaluates each lead's state and interaction history, and decides the
 * next action using AI judgment.
 *
 * Actions:
 *   audit          → Run 5-dimension audit
 *   generate_mvp   → Build demo site
 *   draft_outreach  → Generate outreach sequence
 *   send_email     → Send first outreach email
 *   send_followup  → Send follow-up email
 *   send_proposal  → Generate and send proposal
 *   schedule_call  → Send booking link
 *   move_to_nurture → Park lead for future
 *   mark_lost      → Close as lost
 *   no_action      → Skip (too recent, or already in good state)
 *
 * CLI:
 *   node scripts/hermes.js              # Single pass
 *   node scripts/hermes.js --dry-run    # Log decisions without executing
 *   node scripts/hermes.js --loop --interval=30  # Continuous
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { aiComplete, parseAiJson } from './lib/ai_client.js';
import { auditWebsite, slugify } from './audit_engine.js';
import { generateDemoSite } from './demo_generator.js';
import { generateOutreachSequence } from './outreach_generator.js';
import { sendEmail, composeEmail } from './lib/email_sender.js';
import { findPublicEmailForBusiness } from './lib/public_email_finder.js';
import { generateProposal } from './lib/proposal_generator.js';
import { getBookingLink } from './lib/scheduler.js';
import { captureScreenshot } from './lib/screenshot.js';
import { placeVoiceCall } from './lib/voice_caller.js';
import { sendClosingProposal, confirmDealWon } from './lib/closing_engine.js';
import { loadAppConfig, getPublicDemoUrl } from './lib/config_loader.js';
import { notifyDemoGenerated } from './lib/telegram_notifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');
const INTERACTIONS_FILE = path.join(ROOT_DIR, 'interactions.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const PROSPECTS_DIR = path.join(ROOT_DIR, 'prospects');
const OUTREACH_DIR = path.join(ROOT_DIR, 'outreach');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadPipeline() {
  try { return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8')); } catch { return { prospects: [] }; }
}

function savePipeline(pipeline) {
  pipeline.last_updated = new Date().toISOString();
  const summary = {
    total_prospects: pipeline.prospects.length,
    discovered: pipeline.prospects.filter(p => p.stage === 'DISCOVERED').length,
    audited: pipeline.prospects.filter(p => p.stage === 'AUDITED').length,
    demo_generated: pipeline.prospects.filter(p => p.stage === 'DEMO_GENERATED').length,
    outreach_drafted: pipeline.prospects.filter(p => p.stage === 'OUTREACH_DRAFTED').length,
    contacted: pipeline.prospects.filter(p => p.stage === 'CONTACTED').length,
    meeting_scheduled: pipeline.prospects.filter(p => p.stage === 'MEETING_SCHEDULED').length,
    closed_won: pipeline.prospects.filter(p => p.stage === 'CLOSED_WON').length,
    closed_lost: pipeline.prospects.filter(p => p.stage === 'CLOSED_LOST').length,
    pipeline_value_usd: pipeline.prospects.filter(p => !['CLOSED_LOST', 'CLOSED_WON'].includes(p.stage)).length * 1500
  };
  pipeline.pipeline_summary = summary;
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(pipeline, null, 2), 'utf-8');
}

function loadInteractions() {
  try { return JSON.parse(fs.readFileSync(INTERACTIONS_FILE, 'utf-8')); } catch { return []; }
}

function addInteraction(entry) {
  const interactions = loadInteractions();
  interactions.push({ ...entry, timestamp: new Date().toISOString() });
  fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify(interactions, null, 2), 'utf-8');
}

function loadConfig() {
  return loadAppConfig();
}

function getLeadInteractions(slug) {
  return loadInteractions().filter(i => i.lead_slug === slug);
}

function getLastInteractionTime(slug) {
  const interactions = getLeadInteractions(slug);
  if (interactions.length === 0) return null;
  return new Date(interactions[interactions.length - 1].timestamp);
}

function hoursSinceLastAction(slug) {
  const lastTime = getLastInteractionTime(slug);
  if (!lastTime) return Infinity;
  return (Date.now() - lastTime.getTime()) / (1000 * 60 * 60);
}

function log(icon, msg) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), icon, msg });
  console.log(entry);
  return entry;
}

// ─── Decision Engine ─────────────────────────────────────────────────────────
const STAGE_ACTIONS = {
  'DISCOVERED': ['audit'],
  'AUDITED': ['generate_mvp'],
  'DEMO_GENERATED': ['draft_outreach'],
  'OUTREACH_DRAFTED': ['send_email'],
  'CONTACTED': ['send_followup', 'place_call', 'send_proposal', 'schedule_call', 'move_to_nurture', 'mark_lost'],
  'MEETING_SCHEDULED': ['send_proposal', 'close_deal', 'no_action'],
  'CLOSED_WON': [],
  'CLOSED_LOST': []
};

/**
 * Rule-based decision engine. Uses deterministic rules first,
 * then AI for ambiguous contacted/meeting states.
 */
async function decideAction(prospect) {
  const { slug, stage, businessName } = prospect;
  const hoursSince = hoursSinceLastAction(slug);
  const interactions = getLeadInteractions(slug);
  const touchCount = interactions.filter(i => i.direction === 'outbound').length;

  // Terminal states
  if (['CLOSED_WON', 'CLOSED_LOST'].includes(stage)) {
    return { action: 'no_action', reason: `Lead is ${stage}` };
  }

  // Cooldown: don't act if last action was less than 48h ago for contacted leads
  if (stage === 'CONTACTED' && hoursSince < 48) {
    return { action: 'no_action', reason: `Cooling down — last touch ${hoursSince.toFixed(0)}h ago (need 48h)` };
  }

  // Max touches before nurture
  if (touchCount >= 5 && stage === 'CONTACTED') {
    return { action: 'move_to_nurture', reason: `${touchCount} touches sent, moving to nurture` };
  }

  // Deterministic pipeline progression
  switch (stage) {
    case 'DISCOVERED':
      return { action: 'audit', reason: 'New lead — running 5-dimension audit' };
    case 'AUDITED':
      return { action: 'generate_mvp', reason: 'Audit complete — generating demo site' };
    case 'DEMO_GENERATED':
      return { action: 'draft_outreach', reason: 'Demo ready — drafting outreach sequence' };
    case 'OUTREACH_DRAFTED':
      return { action: 'send_email', reason: 'Outreach drafted — sending initial email' };
  }

  // For CONTACTED/MEETING states, use AI judgment
  if (['CONTACTED', 'MEETING_SCHEDULED'].includes(stage)) {
    try {
      return await decideWithAI(prospect, interactions, touchCount);
    } catch (err) {
      // Fallback: deterministic
      if (stage === 'CONTACTED') {
        const hasBeenCalled = interactions.some(i => i.action === 'voice_call');
        if (prospect.phone && !hasBeenCalled) {
          return { action: 'place_call', reason: 'Email sent previously — placing follow-up AI voice cold call' };
        }
        if (touchCount < 3) {
          return { action: 'send_followup', reason: `AI unavailable — sending follow-up #${touchCount + 1}` };
        }
      }
      if (stage === 'MEETING_SCHEDULED') {
        return { action: 'send_proposal', reason: 'Meeting scheduled — sending interactive proposal with deposit link' };
      }
      return { action: 'no_action', reason: `AI decision failed: ${err.message}` };
    }
  }

  return { action: 'no_action', reason: 'No applicable action' };
}

async function decideWithAI(prospect, interactions, touchCount) {
  const prompt = `You are Hermes, the autonomous decision engine for a website redesign agency.

Lead: ${prospect.businessName} (${prospect.city || 'unknown city'})
Stage: ${prospect.stage}
Audit Score: ${prospect.overallScore || 'N/A'}/10
Total Outbound Touches: ${touchCount}
Hours Since Last Action: ${hoursSinceLastAction(prospect.slug).toFixed(0)}

Interaction History:
${interactions.slice(-5).map(i => `  ${i.timestamp} | ${i.action} | ${i.channel || 'system'}`).join('\n') || '  (none)'}

Available actions for this stage: ${STAGE_ACTIONS[prospect.stage]?.join(', ') || 'none'}

Rules:
- Max 2 follow-ups before considering nurture
- Never contact more than once in 48 hours
- If MEETING_SCHEDULED, send proposal
- If reply was "interested", schedule a call
- If 3+ touches with no reply, move to nurture

Return JSON: { "action": "one_of_the_available_actions", "reason": "brief explanation" }`;

  const response = await aiComplete(prompt, { jsonMode: true, temperature: 0.1, maxTokens: 256 });
  const parsed = parseAiJson(response);
  if (!parsed?.action) throw new Error('Invalid AI decision');
  return parsed;
}

// ─── Action Executors ────────────────────────────────────────────────────────
async function executeAction(prospect, decision, pipeline, dryRun = false) {
  const { action, reason } = decision;
  const { slug, businessName } = prospect;

  log('🧠', `[${businessName}] Decision: ${action} — ${reason}`);

  if (dryRun) {
    log('🏜️', `[DRY RUN] Would execute: ${action}`);
    addInteraction({ lead_slug: slug, action: `dry_run:${action}`, channel: 'system', reason });
    return;
  }

  const p = pipeline.prospects.find(item => item.slug === slug);

  switch (action) {
    case 'audit': {
      try {
        const prospectData = { businessName, url: prospect.url, niche: prospect.niche, city: prospect.city };
        const audit = await auditWebsite(prospectData);
        if (p) {
          Object.assign(p, { overallScore: audit.overallScore, stage: 'AUDITED', lastAction: new Date().toISOString() });
        }
        addInteraction({ lead_slug: slug, action: 'audit', channel: 'system', result: `Score: ${audit.overallScore}/10` });
        log('✅', `[${businessName}] Audited — Score: ${audit.overallScore}/10`);
      } catch (err) {
        log('❌', `[${businessName}] Audit failed: ${err.message}`);
        addInteraction({ lead_slug: slug, action: 'audit_failed', channel: 'system', error: err.message });
      }
      break;
    }

    case 'generate_mvp': {
      try {
        const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
        let prospectData = prospect;
        if (fs.existsSync(prospectFile)) {
          prospectData = { ...JSON.parse(fs.readFileSync(prospectFile, 'utf-8')), ...prospect };
        }
        const demo = generateDemoSite(prospectData);
        if (p) {
          p.stage = 'DEMO_GENERATED';
          p.demoPath = demo.relativeUrl;
          p.lastAction = new Date().toISOString();
        }
        addInteraction({ lead_slug: slug, action: 'generate_mvp', channel: 'system', result: demo.relativeUrl });
        log('✅', `[${businessName}] Demo generated: ${demo.relativeUrl}`);
        try {
          await notifyDemoGenerated(prospectData, getPublicDemoUrl(slug));
        } catch {}
      } catch (err) {
        log('❌', `[${businessName}] Demo generation failed: ${err.message}`);
      }
      break;
    }

    case 'draft_outreach': {
      try {
        const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
        let prospectData = prospect;
        if (fs.existsSync(prospectFile)) {
          prospectData = { ...JSON.parse(fs.readFileSync(prospectFile, 'utf-8')), ...prospect };
        }
        generateOutreachSequence(prospectData);
        if (p) {
          p.stage = 'OUTREACH_DRAFTED';
          p.lastAction = new Date().toISOString();
        }
        addInteraction({ lead_slug: slug, action: 'draft_outreach', channel: 'system' });
        log('✅', `[${businessName}] Outreach sequence drafted`);
      } catch (err) {
        log('❌', `[${businessName}] Outreach draft failed: ${err.message}`);
      }
      break;
    }

    case 'send_email':
    case 'send_followup': {
      try {
        const outreachFile = path.join(OUTREACH_DIR, `${slug}.md`);
        let emailBody = `Hi ${prospect.ownerName || 'there'},\n\nI noticed your website and built a quick modern redesign demo for ${businessName}. Would love to get your thoughts!\n\nBest regards`;
        let emailSubject = `Quick redesign idea for ${businessName}`;

        if (fs.existsSync(outreachFile)) {
          const md = fs.readFileSync(outreachFile, 'utf-8');
          // Extract first email from outreach markdown
          const emailMatch = md.match(/##\s*(?:Email|Touch)\s*(?:1|One)[^\n]*\n([\s\S]*?)(?=##|$)/i);
          if (emailMatch) {
            emailBody = emailMatch[1].trim();
            const subjectMatch = md.match(/Subject:\s*(.+)/i);
            if (subjectMatch) emailSubject = subjectMatch[1].trim();
          }

          // For follow-ups, try to find Email 2 or 3
          if (action === 'send_followup') {
            const touchCount = getLeadInteractions(slug).filter(i => i.action === 'send_email' || i.action === 'send_followup').length;
            const followupMatch = md.match(new RegExp(`##\\s*(?:Email|Touch)\\s*(?:${touchCount + 1})[^\\n]*\\n([\\s\\S]*?)(?=##|$)`, 'i'));
            if (followupMatch) emailBody = followupMatch[1].trim();
          }
        }

        // Ensure recipient has a verified real public email
        let targetEmail = prospect.ownerEmail;
        let targetSource = prospect.ownerEmailSource;
        if (!targetEmail) {
          const emailLookup = await findPublicEmailForBusiness(businessName, [], {
            domain: prospect.url,
            city: prospect.city
          });
          if (emailLookup && emailLookup.email) {
            targetEmail = emailLookup.email;
            targetSource = emailLookup.source;
            prospect.ownerEmail = targetEmail;
            prospect.ownerEmailSource = targetSource;
            if (p) {
              p.ownerEmail = targetEmail;
              p.ownerEmailSource = targetSource;
            }
          }
        }

        if (!targetEmail) {
          log('⏩', `[${businessName}] Skipping email — no verified public email found for owner.`);
          break;
        }

        // Build and send email
        const demoUrl = prospect.demoPath ? getPublicDemoUrl(slug) : null;
        const email = composeEmail({
          to: targetEmail,
          subject: emailSubject,
          body: emailBody,
          demoUrl,
          agencyName: loadConfig().agency?.name || 'Apex AI Web Studio'
        });

        const result = await sendEmail(email, {
          leadSlug: slug,
          observedOn: targetSource || prospect.url || 'public_listing',
          recipientConfirmed: true
        });

        if (p && p.stage === 'OUTREACH_DRAFTED') {
          p.stage = 'CONTACTED';
          p.lastAction = new Date().toISOString();
        }
        addInteraction({ lead_slug: slug, action, channel: 'email', direction: 'outbound', provider: result.provider });
        log('✅', `[${businessName}] Email sent via ${result.provider}`);
      } catch (err) {
        log('❌', `[${businessName}] Email send failed: ${err.message}`);
      }
      break;
    }

    case 'send_proposal': {
      try {
        const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
        let prospectData = prospect;
        if (fs.existsSync(prospectFile)) {
          prospectData = { ...JSON.parse(fs.readFileSync(prospectFile, 'utf-8')), ...prospect };
        }

        const targetEmail = prospect.ownerEmail;
        if (!targetEmail) {
          log('⏩', `[${businessName}] Skipping proposal email — no verified public email found.`);
          break;
        }

        const bookingLink = getBookingLink(prospectData);
        const proposal = generateProposal({
          prospect: prospectData,
          demoUrl: prospect.demoPath ? getPublicDemoUrl(slug) : null,
          bookingLink,
          recommendedPackage: 'growth'
        });

        const email = composeEmail({
          to: targetEmail,
          subject: `Your website proposal is ready — ${businessName}`,
          body: `Hi ${prospect.ownerName || 'there'},\n\nGreat news! Based on our audit, I've put together a detailed proposal for ${businessName}'s new website.\n\nYou can view your custom proposal here:\n${proposal.relativePath}\n\nOr book a quick call to walk through it:\n${bookingLink}\n\nLooking forward to hearing from you!`,
          agencyName: loadConfig().agency?.name || 'Apex AI Web Studio'
        });

        const result = await sendEmail(email, {
          leadSlug: slug,
          observedOn: prospect.ownerEmailSource || prospect.url || 'public_listing',
          recipientConfirmed: true
        });
        addInteraction({ lead_slug: slug, action: 'send_proposal', channel: 'email', direction: 'outbound', proposalPath: proposal.relativePath });
        log('✅', `[${businessName}] Proposal sent`);
      } catch (err) {
        log('❌', `[${businessName}] Proposal send failed: ${err.message}`);
      }
      break;
    }

    case 'schedule_call': {
      const targetEmail = prospect.ownerEmail;
      if (!targetEmail) {
        log('⏩', `[${businessName}] Skipping booking email — no verified public email found.`);
        break;
      }

      const bookingLink = getBookingLink(prospect);
      const email = composeEmail({
        to: targetEmail,
        subject: `Let's chat about ${businessName}'s new website`,
        body: `Hi ${prospect.ownerName || 'there'},\n\nI'd love to walk you through the demo I built for ${businessName}. Pick a time that works for you:\n\n${bookingLink}\n\nLooking forward to connecting!`,
        agencyName: loadConfig().agency?.name || 'Apex AI Web Studio'
      });

      try {
        const result = await sendEmail(email, {
          leadSlug: slug,
          observedOn: prospect.ownerEmailSource || prospect.url || 'public_listing',
          recipientConfirmed: true
        });
        if (p) { p.stage = 'MEETING_SCHEDULED'; p.lastAction = new Date().toISOString(); }
        addInteraction({ lead_slug: slug, action: 'schedule_call', channel: 'email', direction: 'outbound', bookingLink });
        log('✅', `[${businessName}] Booking link sent`);
      } catch (err) {
        log('❌', `[${businessName}] Schedule send failed: ${err.message}`);
      }
      break;
    }

    case 'move_to_nurture': {
      if (p) { p.stage = 'CLOSED_LOST'; p.lastAction = new Date().toISOString(); }
      addInteraction({ lead_slug: slug, action: 'move_to_nurture', channel: 'system', reason });
      log('📦', `[${businessName}] Moved to nurture/closed`);
      break;
    }

    case 'place_call': {
      try {
        log('🎙️', `[${businessName}] Calling via AI Voice Agent (${prospect.phone || 'No phone'})...`);
        const callResult = await placeVoiceCall(prospect);
        if (callResult.outcome === 'meeting_scheduled') {
          if (p) { p.stage = 'MEETING_SCHEDULED'; p.lastAction = new Date().toISOString(); }
        }
        log('✅', `[${businessName}] Voice call finished — Outcome: ${callResult.outcome || 'completed'}`);
      } catch (err) {
        log('⚠️', `[${businessName}] Voice call failed: ${err.message}`);
      }
      break;
    }

    case 'close_deal': {
      try {
        log('🎉', `[${businessName}] Confirming deposit & closing deal...`);
        await confirmDealWon(slug, { package: 'growth', amount: 750 });
        log('✅', `[${businessName}] Deal successfully CLOSED_WON! Client kickoff generated.`);
      } catch (err) {
        log('❌', `[${businessName}] Deal closing error: ${err.message}`);
      }
      break;
    }

    case 'mark_lost': {
      if (p) { p.stage = 'CLOSED_LOST'; p.lastAction = new Date().toISOString(); }
      addInteraction({ lead_slug: slug, action: 'mark_lost', channel: 'system', reason });
      log('❌', `[${businessName}] Marked CLOSED_LOST`);
      break;
    }

    case 'no_action':
    default: {
      // No action needed — just log
      break;
    }
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────────────
async function runHermes(opts = {}) {
  const { dryRun = false, targetSlug = null } = opts;
  const pipeline = loadPipeline();

  log('🏛️', `Hermes started — ${pipeline.prospects.length} leads in pipeline${dryRun ? ' [DRY RUN]' : ''}`);

  const activeProspects = targetSlug
    ? pipeline.prospects.filter(p => p.slug === targetSlug)
    : pipeline.prospects.filter(p => !['CLOSED_WON', 'CLOSED_LOST'].includes(p.stage));

  let actionsCount = 0;

  for (const prospect of activeProspects) {
    try {
      const decision = await decideAction(prospect);

      if (decision.action !== 'no_action') {
        await executeAction(prospect, decision, pipeline, dryRun);
        actionsCount++;
      } else {
        log('⏸️', `[${prospect.businessName}] Skipped — ${decision.reason}`);
      }
    } catch (err) {
      log('⚠️', `[${prospect.businessName}] Error: ${err.message}`);
    }
  }

  // Save pipeline state after all actions
  savePipeline(pipeline);

  log('🏛️', `Hermes complete — ${actionsCount} actions taken on ${activeProspects.length} active leads`);
  return { actionsCount, total: activeProspects.length };
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const loop = args.includes('--loop');
  const intervalArg = args.find(a => a.startsWith('--interval='));
  const intervalMin = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 30;
  const slugArg = args.find(a => a.startsWith('--slug='));
  const targetSlug = slugArg ? slugArg.split('=')[1] : null;

  if (loop) {
    console.log(`\n🏛️ Hermes continuous mode — running every ${intervalMin} minutes${dryRun ? ' [DRY RUN]' : ''}\n`);
    const run = async () => {
      await runHermes({ dryRun, targetSlug });
      setTimeout(run, intervalMin * 60 * 1000);
    };
    run();
  } else {
    runHermes({ dryRun, targetSlug }).catch(err => {
      console.error('❌ Hermes fatal error:', err.message);
      process.exit(1);
    });
  }
}

export { runHermes };
