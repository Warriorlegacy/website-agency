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
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; }
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
  const wonValue = closedWon * 1500;

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

// ─── Format Summary ──────────────────────────────────────────────────────────
function formatSummary(stats) {
  const stageEmojis = {
    'DISCOVERED': '🔍',
    'AUDITED': '📊',
    'DEMO_GENERATED': '🎨',
    'OUTREACH_DRAFTED': '✉️',
    'CONTACTED': '📤',
    'MEETING_SCHEDULED': '📅',
    'CLOSED_WON': '🏆',
    'CLOSED_LOST': '❌'
  };

  const stageLines = Object.entries(stats.stages)
    .map(([stage, count]) => `  ${stageEmojis[stage] || '•'} ${stage}: ${count}`)
    .join('\n');

  const deltaEmoji = stats.today.totalActions >= stats.yesterday.totalActions ? '📈' : '📉';

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
❌ Closed Lost: ${stats.conversion.closedLost}

—
Powered by Apex AI Web Studio 🚀`;
}

function formatMarkdownReport(stats) {
  const summary = formatSummary(stats);
  return `# Daily Agency Report — ${stats.date}

\`\`\`
${summary}
\`\`\`

## Raw Stats
\`\`\`json
${JSON.stringify(stats, null, 2)}
\`\`\`
`;
}

// ─── Telegram Sender ─────────────────────────────────────────────────────────
async function sendTelegram(message, config) {
  const botToken = config.notifications?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config.notifications?.telegram?.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error('Telegram bot not configured');

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Telegram ${res.status}: ${err.slice(0, 200)}`);
  }

  return await res.json();
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
