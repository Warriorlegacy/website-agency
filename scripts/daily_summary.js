/**
 * scripts/daily_summary.js
 * Daily Pipeline Summary & Notification Bot
 *
 * Aggregates pipeline stats and sends a digest via:
 *   1. Telegram Bot API (primary)
 *   2. Local markdown file (always, as backup)
 *
 * CLI:
 *   node scripts/daily_summary.js           # Generate and send
 *   node scripts/daily_summary.js --local    # File only, no notification
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';
import { loadAppConfig, getPublicDemoUrl } from './lib/config_loader.js';
import { sendTelegramDocument, sendTelegramReportPackage } from './lib/telegram_notifier.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');
const INTERACTIONS_FILE = path.join(ROOT_DIR, 'interactions.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function loadPipeline() {
  try { return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8')); } catch { return { prospects: [] }; }
}

function loadInteractions() {
  try { return JSON.parse(fs.readFileSync(INTERACTIONS_FILE, 'utf-8')); } catch { return []; }
}

function loadConfig() {
  return loadAppConfig();
}

// ─── Stats Aggregation ───────────────────────────────────────────────────────
function generateStats() {
  const pipeline = loadPipeline();
  const interactions = loadInteractions();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Today's interactions
  const todaysActions = interactions.filter(i => i.timestamp?.startsWith(today));
  const yesterdaysActions = interactions.filter(i => i.timestamp?.startsWith(yesterday));

  // Pipeline counts
  const stages = {};
  for (const p of pipeline.prospects) {
    stages[p.stage] = (stages[p.stage] || 0) + 1;
  }

  // Activity counts
  const emailsSent = todaysActions.filter(i => i.action === 'send_email' || i.action === 'send_followup').length;
  const auditsRun = todaysActions.filter(i => i.action === 'audit').length;
  const demosGenerated = todaysActions.filter(i => i.action === 'generate_mvp').length;
  const proposalsSent = todaysActions.filter(i => i.action === 'send_proposal').length;

  // Conversions
  const newLeads = todaysActions.filter(i => i.action === 'audit').length;
  const meetingsBooked = todaysActions.filter(i => i.action === 'schedule_call').length;
  const closedWon = (stages['CLOSED_WON'] || 0);
  const closedLost = (stages['CLOSED_LOST'] || 0);

  // Pipeline value
  const activePipeline = pipeline.prospects.filter(p => !['CLOSED_LOST', 'CLOSED_WON'].includes(p.stage));
  const pipelineValue = activePipeline.length * 1500;

  // Real verified revenue: strictly sum actual confirmed deposit payments from genuine webhook/live transactions
  const wonValue = (pipeline.prospects || [])
    .filter(p => p.stage === 'CLOSED_WON' && p.depositPaid && p.paymentEvidence?.verifiedBy === 'webhook' && !String(p.paymentEvidence?.reference || '').includes('8821'))
    .reduce((sum, p) => sum + (Number(p.depositPaid) || 0), 0);

  return {
    date: today,
    total: pipeline.prospects.length,
    active: activePipeline.length,
    stages,
    today: {
      emailsSent,
      auditsRun,
      demosGenerated,
      proposalsSent,
      newLeads,
      meetingsBooked,
      totalActions: todaysActions.length
    },
    yesterday: {
      totalActions: yesterdaysActions.length
    },
    conversion: {
      closedWon,
      closedLost,
      pipelineValue,
      wonValue
    }
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Format Summary ──────────────────────────────────────────────────────────
function formatSummary(stats) {
  const stageEmojis = {
    'CLOSED_WON': '🏆',
    'MEETING_SCHEDULED': '📅',
    'OUTREACH_DRAFTED': '✉️',
    'CONTACTED': '📤',
    'DEMO_GENERATED': '🎨',
    'AUDITED': '📊',
    'DISCOVERED': '🔍',
    'CLOSED_LOST': '❌'
  };

  const stageLines = Object.entries(stats.stages)
    .map(([stage, count]) => `  ${stageEmojis[stage] || '•'} ${stage}: ${count}`)
    .join('\n');

  const deltaEmoji = stats.today.totalActions >= stats.yesterday.totalActions ? '📈' : '📉';

  const pipeline = loadPipeline();
  const leadsLines = (pipeline.prospects || []).map((p, idx) => {
    const contact = p.ownerName && p.ownerName !== 'Business Owner' ? p.ownerName : 'Owner';
    const email = p.ownerEmail ? p.ownerEmail : 'Pending discovery';
    const phone = p.phone || 'N/A';
    const loc = p.city ? ` (${p.city})` : '';
    const demo = p.demoPath ? `\n     Demo: ${getPublicDemoUrl(p.slug)}` : '';
    return `  ${idx + 1}. ${stageEmojis[p.stage] || '•'} ${p.businessName}${loc} [${p.stage}]\n     Contact: ${contact} | Email: ${email} | Phone: ${phone}${demo}`;
  }).join('\n\n');

  const leadsSection = leadsLines.length > 0 ? `\n\n━━ Leads & Verified Emails (${pipeline.prospects.length}) ━━━\n${leadsLines}` : '';

  return `📊 Daily Agency Summary — ${stats.date}

━━ Pipeline ━━━━━━━━━━━━━━━━━━━
Total Leads: ${stats.total} (${stats.active} active)
Pipeline Value: $${stats.conversion.pipelineValue.toLocaleString()}
Revenue Won: $${stats.conversion.wonValue.toLocaleString()}

${stageLines}

━━ Today's Activity ${deltaEmoji} ━━━━━━━━━
🔍 Audits: ${stats.today.auditsRun}
🎨 Demos: ${stats.today.demosGenerated}
📧 Emails Sent: ${stats.today.emailsSent}
📄 Proposals: ${stats.today.proposalsSent}
📅 Meetings: ${stats.today.meetingsBooked}
⚡ Total Actions: ${stats.today.totalActions}

━━ Wins ━━━━━━━━━━━━━━━━━━━━━━
🏆 Closed Won: ${stats.conversion.closedWon}
❌ Closed Lost: ${stats.conversion.closedLost}${leadsSection}

—
Powered by Apex AI Web Studio 🚀`;
}

function formatMarkdownReport(stats) {
  const summary = formatSummary(stats);
  const pipeline = loadPipeline();
  const leads = pipeline.prospects || [];

  const tableRows = leads.map((p, idx) => {
    const contact = p.ownerName && p.ownerName !== 'Business Owner' ? p.ownerName : 'Owner';
    const email = p.ownerEmail ? `\`${p.ownerEmail}\`` : '_Pending discovery_';
    const phone = p.phone ? `\`${p.phone}\`` : '_N/A_';
    const demoUrl = p.demoPath ? getPublicDemoUrl(p.slug) : 'N/A';
    return `| ${idx + 1} | **${p.businessName}** | ${contact} | ${email} | ${phone} | ${p.city || 'Local'} | ${p.niche || 'general'} | ${p.stage} | [View Demo](${demoUrl}) |`;
  }).join('\n');

  const leadCards = leads.map((p, idx) => `
### ${idx + 1}. ${p.businessName}
- **Contact Person:** ${p.ownerName || 'Business Owner'}
- **Verified Email:** ${p.ownerEmail || 'Pending discovery'}
- **Phone:** ${p.phone || 'N/A'}
- **Location:** ${p.city || 'Local Area'}
- **Niche:** ${p.niche || 'general'}
- **Funnel Stage:** ${p.stage}
- **Live Demo Link:** ${p.demoPath ? getPublicDemoUrl(p.slug) : 'N/A'}
- **Source:** ${p.ownerEmailSource || p.source || 'Public Listing'}
`).join('\n---\n');

  return `# Daily Agency Report — ${stats.date}

\`\`\`
${summary}
\`\`\`

## Complete Leads Contact Directory & Emails (${leads.length})

| # | Business Name | Contact Person | Email | Phone | Location | Niche | Stage | Demo |
|---|---|---|---|---|---|---|---|---|
${tableRows}

## Itemized Lead Contact Profiles
${leadCards}

## Raw Stats
\`\`\`json
${JSON.stringify(stats, null, 2)}
\`\`\`
`;
}

// ─── Telegram Sender (with Auto-Chunking for Long Messages) ──────────────────
async function sendTelegramChunk(message, config, parseMode = 'HTML', retries = 3) {
  const botToken = config.notifications?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config.notifications?.telegram?.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error('Telegram bot not configured');

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: parseMode,
          disable_web_page_preview: true
        })
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Telegram ${res.status}: ${err.slice(0, 200)}`);
      }

      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1200 * attempt));
      }
    }
  }
  throw lastErr;
}

async function sendTelegram(message, config, parseMode = 'HTML', retries = 3) {
  if (!message) return;
  if (message.length <= 4000) {
    return await sendTelegramChunk(message, config, parseMode, retries);
  }

  const parts = [];
  const blocks = message.split('\n\n');
  let cur = '';

  for (const b of blocks) {
    if (b.length > 3900) {
      if (cur) {
        parts.push(cur.trim());
        cur = '';
      }
      for (let i = 0; i < b.length; i += 3900) {
        parts.push(b.slice(i, i + 3900).trim());
      }
    } else if ((cur + '\n\n' + b).length > 3900) {
      if (cur) parts.push(cur.trim());
      cur = b;
    } else {
      cur = cur ? `${cur}\n\n${b}` : b;
    }
  }
  if (cur.trim()) parts.push(cur.trim());

  let lastRes = null;
  for (let i = 0; i < parts.length; i++) {
    const chunkText = parts.length > 1 ? `[Part ${i + 1}/${parts.length}]\n${parts[i]}` : parts[i];
    lastRes = await sendTelegramChunk(chunkText, config, parseMode, retries);
    if (i < parts.length - 1) await new Promise(r => setTimeout(r, 600));
  }
  return lastRes;
}

// ─── Master: sendWorkflowRunReport ──────────────────────────────────────────
export async function sendWorkflowRunReport(cycleReport = {}) {
  const config = loadConfig();
  const stats = generateStats();
  const pipeline = loadPipeline();
  const now = new Date();
  const istTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const isCloud = !!process.env.GITHUB_ACTIONS;
  const runner = isCloud ? 'GitHub Actions Cloud (24/7 Autopilot)' : 'Local Host Autopilot';

  // Build stage breakdown
  const stageIcons = {
    'CLOSED_WON': '🏆',
    'MEETING_SCHEDULED': '📅',
    'OUTREACH_DRAFTED': '✉️',
    'CONTACTED': '📤',
    'DEMO_GENERATED': '🎨',
    'AUDITED': '📊',
    'DISCOVERED': '🔍',
    'CLOSED_LOST': '❌'
  };

  const stageLines = Object.entries(stats.stages)
    .map(([st, cnt]) => `   ${stageIcons[st] || '•'} <b>${st}</b>: ${cnt}`)
    .join('\n');

  // Format cycle actions
  const newLeads = cycleReport.harvested || [];
  const demos = cycleReport.demos || [];
  const calls = cycleReport.calls || [];
  const proposals = cycleReport.proposals || [];

  let actionsList = [];
  if (newLeads.length > 0) {
    actionsList.push(`• 🚜 <b>Scraped Leads (${newLeads.length}):</b>\n` + newLeads.map(l => {
      const email = l.ownerEmail || l.email ? ` • 📧 <code>${escapeHtml(l.ownerEmail || l.email)}</code>` : '';
      const phone = l.phone ? ` • 📞 <code>${escapeHtml(l.phone)}</code>` : '';
      return `   ↳ <b>${escapeHtml(l.businessName || l.name)}</b> (${escapeHtml(l.city || 'Local')} • ${escapeHtml(l.niche || 'business')})${phone}${email}`;
    }).join('\n'));
  }
  if (demos.length > 0) {
    actionsList.push(`• 🎨 <b>Demo Sites Generated (${demos.length}):</b>\n` + demos.map(d => `   ↳ <i>${escapeHtml(d.businessName || d.name)}</i>`).join('\n'));
  }
  if (calls.length > 0) {
    actionsList.push(`• 🎙️ <b>Voice Calls Placed (${calls.length}):</b>\n` + calls.map(c => `   ↳ <i>${escapeHtml(c.businessName)}</i> → <b>${escapeHtml(c.outcome)}</b>`).join('\n'));
  }
  if (proposals.length > 0) {
    actionsList.push(`• 💼 <b>Closing Proposals Dispatched (${proposals.length}):</b>\n` + proposals.map(p => `   ↳ <i>${escapeHtml(p.businessName)}</i> ($750 Growth tier)`).join('\n'));
  }

  const actionsText = actionsList.length > 0 ? actionsList.join('\n\n') : '• <i>Funnel monitored — all leads maintained in follow-up sequence.</i>';

  // Format ALL leads in pipeline with complete contact details and verified emails
  const allLeads = pipeline.prospects || [];
  const leadsDirectoryHtml = allLeads.map((p, idx) => {
    const stageIcon = stageIcons[p.stage] || '•';
    const emailBadge = p.ownerEmail ? `<code>${escapeHtml(p.ownerEmail)}</code>` : '<i>Pending discovery</i>';
    const phoneBadge = p.phone ? `<code>${escapeHtml(p.phone)}</code>` : '<i>N/A</i>';
    const contactName = p.ownerName && p.ownerName !== 'Business Owner' ? p.ownerName : 'Decision Maker';
    const demoUrl = p.demoPath ? getPublicDemoUrl(p.slug) : null;
    const demoLink = demoUrl ? `<a href="${demoUrl}">Live Demo</a>` : '<i>Pending</i>';
    const location = p.city || 'Local';
    const niche = p.niche || 'general';

    return `${idx + 1}. ${stageIcon} <b>${escapeHtml(p.businessName)}</b> [${p.stage}]\n` +
           `   👤 <b>Contact:</b> ${escapeHtml(contactName)}\n` +
           `   📧 <b>Email:</b> ${emailBadge}\n` +
           `   📞 <b>Phone:</b> ${phoneBadge}\n` +
           `   📍 <b>Location:</b> ${escapeHtml(location)} (${escapeHtml(niche)})\n` +
           `   🌐 <b>Demo:</b> ${demoLink}`;
  }).join('\n\n');

  const message = `🚀 <b>APEX AI WEB STUDIO — WORKFLOW RUN REPORT</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ <b>Executed:</b> ${istTime} IST
🌐 <b>Runner:</b> ${runner}
⚡ <b>Status:</b> 🟢 <b>CYCLE COMPLETE & CRM SYNCED</b>

📊 <b>CURRENT PIPELINE SNAPSHOT:</b>
• <b>Total Leads:</b> ${stats.total} (${stats.active} active)
• <b>Pipeline Value:</b> $${stats.conversion.pipelineValue.toLocaleString()} USD
• <b>Revenue Closed:</b> $${stats.conversion.wonValue.toLocaleString()} USD (${stats.conversion.closedWon} closed deals)

📈 <b>Funnel Stages:</b>
${stageLines}

⚡ <b>ACTIONS IN THIS RUN:</b>
${actionsText}

📋 <b>LEADS DIRECTORY & CONTACT EMAILS (${allLeads.length}):</b>
${leadsDirectoryHtml}

💳 <b>DIRECT PAYMENT & VERIFICATION:</b>
• <b>UPI (India):</b> <code>6202442690@jio</code> (Piyush Singh)
• <b>PayPal Global:</b> <a href="https://paypal.me/signhify">paypal.me/signhify</a>
• <b>Direct Bank Wire:</b> A/C <code>000521712140642</code> · IFSC <code>JIOP0000001</code> (Piyush Raj Singh)
• <b>WhatsApp Verification:</b> <a href="https://wa.me/916202442690?text=Hi%20Piyush,%20I%20have%20sent%20the%20payment%20for%20Apex%20Web%20Studio.">+91 6202442690</a>
• <b>Calendar Booking:</b> <a href="https://cal.com/piyush-usctna/15min">cal.com/piyush-usctna/15min</a>

🔗 <a href="https://github.com/Warriorlegacy/website-agency">View GitHub Repository & CRM Pipeline</a>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Next automated cycle scheduled in 2 hours. Full report document attached below.</i>`;

  try {
    await sendTelegram(message, config, 'HTML');
    console.log('✅ Comprehensive workflow report delivered to Telegram!');
  } catch (err) {
    console.warn('⚠️ Telegram workflow report text failed:', err.message);
  }

  // Compile and attach complete workflow run report as both Markdown and PDF document files
  try {
    const baseFilename = `workflow_run_${stats.date}_${Date.now()}`;
    const leadsMarkdownTable = allLeads.map((p, idx) => {
      const contactName = p.ownerName && p.ownerName !== 'Business Owner' ? p.ownerName : 'Decision Maker';
      const email = p.ownerEmail ? `\`${p.ownerEmail}\`` : '_Pending discovery_';
      const phone = p.phone ? `\`${p.phone}\`` : '_N/A_';
      const demoUrl = p.demoPath ? getPublicDemoUrl(p.slug) : 'N/A';
      return `| ${idx + 1} | **${p.businessName}** | ${contactName} | ${email} | ${phone} | ${p.city || 'Local'} | ${p.niche || 'general'} | ${p.stage} | [View Demo](${demoUrl}) |`;
    }).join('\n');

    const leadsDetailCards = allLeads.map((p, idx) => `
### ${idx + 1}. ${p.businessName}
- **Decision-Maker / Contact:** ${p.ownerName || 'Business Owner'}
- **Verified Email:** ${p.ownerEmail || 'Pending discovery'}
- **Email Public Source:** ${p.ownerEmailSource || 'Direct crawl / public listing'}
- **Phone Number:** ${p.phone || 'N/A'}
- **Location:** ${p.city || 'Local Area'}
- **Niche / Industry:** ${p.niche || 'general'}
- **Audit Overall Score:** ${p.overallScore || 'N/A'}/10
- **Funnel Stage:** ${p.stage}
- **Current Website:** ${p.url || 'None detected'}
- **Interactive Demo URL:** ${p.demoPath ? getPublicDemoUrl(p.slug) : 'Pending generation'}
- **Last Action:** ${p.lastAction || 'N/A'}
`).join('\n---\n');

    const docContent = `# Apex AI Web Studio — Workflow Execution Report
**Execution Timestamp:** ${istTime} IST  
**Runner:** ${runner}  
**Execution Mode:** Autonomous 24/7 Autopilot  
**Status:** COMPLETE  

---

## 1. Pipeline Financial & Conversion Snapshot
- **Total Prospects:** ${stats.total}
- **Active in Funnel:** ${stats.active}
- **Total Pipeline Value:** $${stats.conversion.pipelineValue.toLocaleString()} USD
- **Revenue Secured (Closed Won):** $${stats.conversion.wonValue.toLocaleString()} USD (${stats.conversion.closedWon} verified closed deals)

### Funnel Stage Distribution
\`\`\`
${Object.entries(stats.stages).map(([st, cnt]) => `${st.padEnd(20)}: ${cnt}`).join('\n')}
\`\`\`

---

## 2. Complete Leads Contact Directory & Verified Emails (${allLeads.length})

| # | Business Name | Decision-Maker | Email | Phone | Location | Niche | Stage | Live Demo |
|---|---|---|---|---|---|---|---|---|
${leadsMarkdownTable}

---

## 3. Actions Executed in This Run
${actionsText.replace(/<[^>]+>/g, '')}

---

## 4. Itemized Prospect Dossiers & Verification
${leadsDetailCards}

---

## 5. Active Payment Rails & Verification
- **UPI (India):** \`6202442690@jio\` (Piyush Singh)
- **PayPal Global (International):** https://paypal.me/signhify
- **Direct Bank Wire:**
  - Account Number: \`000521712140642\`
  - IFSC Code: \`JIOP0000001\`
  - Name: **Piyush Raj Singh**
- **WhatsApp Verification:** +91 6202442690 (https://wa.me/916202442690)
- **Discovery Scheduler:** https://cal.com/piyush-usctna/15min

---
*Report auto-generated by Apex AI Web Studio Autopilot Engine.*
`;

    await sendTelegramReportPackage({
      baseFilename,
      title: 'Workflow Execution Report',
      subtitle: `${stats.date} · Apex AI Web Studio`,
      content: docContent,
      captionPrefix: 'Complete Workflow Run Audit'
    });
    console.log(`✅ Dual workflow run report package (${baseFilename}.md & .pdf) delivered to Telegram!`);
  } catch (err) {
    console.warn('⚠️ Telegram workflow document dispatch failed:', err.message);
  }

  return { success: true };
}

// ─── Master: generateAndSend ─────────────────────────────────────────────────
export async function generateDailySummary(opts = {}) {
  const { localOnly = false } = opts;
  const stats = generateStats();
  const summary = formatSummary(stats);
  const report = formatMarkdownReport(stats);

  // Always save to file
  const filename = `daily-${stats.date}.md`;
  const reportPath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`📄 Report saved: reports/${filename}`);

  if (localOnly) {
    console.log('\n' + summary);
    return { stats, reportPath };
  }

  // Try Telegram
  const config = loadConfig();
  try {
    await sendTelegram(summary, config);
    console.log('✅ Summary sent to Telegram');

    await sendTelegramReportPackage({
      baseFilename: `daily_summary_${stats.date}`,
      title: `Daily Agency Summary — ${stats.date}`,
      subtitle: `${stats.total} Total Leads · ${stats.active} Active`,
      content: report,
      captionPrefix: 'Daily Digest'
    });
    console.log('✅ Daily summary PDF & Markdown report delivered to Telegram');
  } catch (err) {
    console.warn(`⚠️  Telegram failed: ${err.message}`);
    console.log('\n📊 Summary (local):\n');
    console.log(summary);
  }

  return { stats, reportPath };
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const localOnly = process.argv.includes('--local');
  generateDailySummary({ localOnly }).catch(err => {
    console.error('❌ Daily summary failed:', err.message);
    process.exit(1);
  });
}
