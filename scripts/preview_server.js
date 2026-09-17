import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { auditWebsite, slugify } from './audit_engine.js';
import { generateDemoSite } from './demo_generator.js';
import { generateOutreachSequence } from './outreach_generator.js';
import { runHermes } from './hermes.js';
import { sendEmail, composeEmail } from './lib/email_sender.js';
import { harvestGoogleMapsLeads, autoHarvestAndIngest } from './lib/google_maps_scraper.js';
import { placeVoiceCall } from './lib/voice_caller.js';
import { sendClosingProposal, confirmDealWon } from './lib/closing_engine.js';
import { runAutopilotCycle } from './autopilot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DEMOS_DIR = path.join(ROOT_DIR, 'demos');
const PROSPECTS_DIR = path.join(ROOT_DIR, 'prospects');
const OUTREACH_DIR = path.join(ROOT_DIR, 'outreach');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const INTERACTIONS_FILE = path.join(ROOT_DIR, 'interactions.json');
const PROPOSALS_DIR = path.join(ROOT_DIR, 'proposals');

// ─── SSE Client Registry ─────────────────────────────────────────────────────
const sseClients = new Set();

function broadcastLog(line) {
  const data = `data: ${line}\n\n`;
  for (const client of sseClients) {
    try { client.write(data); } catch { sseClients.delete(client); }
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=UTF-8',
  '.csv': 'text/csv; charset=UTF-8'
};

function loadPipeline() {
  if (!fs.existsSync(PIPELINE_FILE)) {
    return { agency_name: "Apex AI Web Studio", last_updated: new Date().toISOString(), prospects: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8'));
  } catch {
    return { agency_name: "Apex AI Web Studio", last_updated: new Date().toISOString(), prospects: [] };
  }
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
    pipeline_value_usd: pipeline.prospects.filter(p => p.stage !== 'CLOSED_LOST').length * 1500
  };
  pipeline.pipeline_summary = summary;
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(pipeline, null, 2), 'utf-8');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

export function startPreviewServer(port = 3030) {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${port}`);
    let reqPath = parsedUrl.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    // ==========================================
    // REST API ENDPOINTS
    // ==========================================
    if (reqPath.startsWith('/api/')) {
      try {

        // ── SSE: Live Log Stream ───────────────────────────────────────────────
        if (reqPath === '/api/logs' && req.method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=UTF-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          });
          res.write('data: {"msg":"Log stream connected"}\n\n');
          sseClients.add(res);
          req.on('close', () => sseClients.delete(res));
          return;
        }

        // ── Auto Pipeline Runner ───────────────────────────────────────────────
        if (reqPath === '/api/run' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const autoRunnerPath = path.join(__dirname, 'auto_runner.js');
          const args = [];
          if (body.leads) args.push(`--leads=${body.leads}`);
          if (body.city) args.push(`--city=${body.city}`);
          if (body.niche) args.push(`--niche=${body.niche}`);

          const child = spawn(process.execPath, [autoRunnerPath, ...args], {
            cwd: ROOT_DIR,
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe']
          });

          const startMsg = JSON.stringify({ ts: new Date().toISOString(), icon: '🚀', msg: 'Auto pipeline started', args });
          broadcastLog(startMsg);

          child.stdout.on('data', chunk => {
            const lines = chunk.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
              broadcastLog(line);
              process.stdout.write(line + '\n');
            }
          });
          child.stderr.on('data', chunk => {
            const line = JSON.stringify({ ts: new Date().toISOString(), icon: '⚠️', msg: chunk.toString().trim() });
            broadcastLog(line);
          });
          child.on('close', code => {
            const done = JSON.stringify({ ts: new Date().toISOString(), icon: code === 0 ? '✅' : '❌', msg: `Pipeline process exited (code ${code})` });
            broadcastLog(done);
          });

          sendJson(res, 202, { success: true, msg: 'Pipeline started. Subscribe to /api/logs for live updates.' });
          return;
        }

        // ── Config GET / POST ──────────────────────────────────────────────────
        if (reqPath === '/api/config') {
          if (req.method === 'GET') {
            const cfg = loadConfig();
            // Never expose raw API keys in response — mask them
            const safe = { ...cfg, groqApiKey: cfg.groqApiKey ? '***' : '', serpApiKey: cfg.serpApiKey ? '***' : '' };
            sendJson(res, 200, safe);
            return;
          }
          if (req.method === 'POST') {
            const body = await parseJsonBody(req);
            const existing = loadConfig();
            // Merge — only overwrite groqApiKey if sent non-masked
            if (body.groqApiKey && body.groqApiKey !== '***') existing.groqApiKey = body.groqApiKey;
            if (body.serpApiKey && body.serpApiKey !== '***') existing.serpApiKey = body.serpApiKey;
            const safe = ['agencyName','agencyOwner','agencyEmail','agencyPhone','targetCities','targetNiches','leadsPerRun','scrapeDelayMs'];
            for (const k of safe) { if (body[k] !== undefined) existing[k] = body[k]; }
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2), 'utf-8');
            sendJson(res, 200, { success: true });
            return;
          }
        }

        if (reqPath === '/api/pipeline' && req.method === 'GET') {
          const pipeline = loadPipeline();
          sendJson(res, 200, pipeline);
          return;
        }

        if (reqPath.startsWith('/api/prospect/') && req.method === 'GET') {
          const slug = reqPath.replace('/api/prospect/', '').trim();
          const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
          if (fs.existsSync(prospectFile)) {
            const data = JSON.parse(fs.readFileSync(prospectFile, 'utf-8'));
            const outreachFile = path.join(OUTREACH_DIR, `${slug}.md`);
            if (fs.existsSync(outreachFile)) {
              data.outreachMarkdown = fs.readFileSync(outreachFile, 'utf-8');
            }
            sendJson(res, 200, { success: true, prospect: data });
          } else {
            sendJson(res, 404, { success: false, error: 'Prospect not found' });
          }
          return;
        }

        if (reqPath === '/api/audit' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          if (!body.businessName || !body.url) {
            sendJson(res, 400, { success: false, error: 'businessName and url are required' });
            return;
          }
          const audit = await auditWebsite(body);
          
          const pipeline = loadPipeline();
          const slug = audit.slug;
          const existingIdx = pipeline.prospects.findIndex(p => p.slug === slug);
          const record = {
            slug,
            businessName: audit.businessName,
            url: audit.url,
            niche: audit.niche,
            city: audit.city,
            ownerName: audit.ownerName,
            ownerEmail: audit.ownerEmail,
            phone: audit.phone,
            overallScore: audit.overallScore,
            stage: 'AUDITED',
            demoPath: `/demos/${slug}/index.html`,
            outreachPath: `/outreach/${slug}.md`,
            lastAction: new Date().toISOString()
          };
          if (existingIdx >= 0) pipeline.prospects[existingIdx] = record;
          else pipeline.prospects.push(record);
          savePipeline(pipeline);

          sendJson(res, 200, { success: true, audit });
          return;
        }

        if (reqPath === '/api/generate-demo' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const slug = slugify(body.businessName || body.slug);
          const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
          let prospectData = body;
          if (fs.existsSync(prospectFile)) {
            prospectData = { ...JSON.parse(fs.readFileSync(prospectFile, 'utf-8')), ...body };
          }
          const demo = generateDemoSite(prospectData, body.template || null);

          const pipeline = loadPipeline();
          const p = pipeline.prospects.find(item => item.slug === slug);
          if (p && p.stage === 'AUDITED') {
            p.stage = 'DEMO_GENERATED';
            p.lastAction = new Date().toISOString();
            savePipeline(pipeline);
          }

          sendJson(res, 200, { success: true, demo });
          return;
        }

        if (reqPath === '/api/generate-outreach' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const slug = slugify(body.businessName || body.slug);
          const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
          let prospectData = body;
          if (fs.existsSync(prospectFile)) {
            prospectData = { ...JSON.parse(fs.readFileSync(prospectFile, 'utf-8')), ...body };
          }
          const outreach = generateOutreachSequence(prospectData, body.demoUrl || null);
          const outreachContent = fs.readFileSync(outreach.outreachPath, 'utf-8');

          const pipeline = loadPipeline();
          const p = pipeline.prospects.find(item => item.slug === slug);
          if (p && ['AUDITED', 'DEMO_GENERATED'].includes(p.stage)) {
            p.stage = 'OUTREACH_DRAFTED';
            p.lastAction = new Date().toISOString();
            savePipeline(pipeline);
          }

          sendJson(res, 200, { success: true, outreach, markdown: outreachContent });
          return;
        }

        if (reqPath === '/api/run-all' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          if (!body.businessName || !body.url) {
            sendJson(res, 400, { success: false, error: 'businessName and url are required' });
            return;
          }
          const audit = await auditWebsite(body);
          const demo = generateDemoSite(audit, body.template || null);
          const outreach = generateOutreachSequence(audit);
          const outreachContent = fs.readFileSync(outreach.outreachPath, 'utf-8');

          const pipeline = loadPipeline();
          const slug = audit.slug;
          const existingIdx = pipeline.prospects.findIndex(p => p.slug === slug);
          const record = {
            slug,
            businessName: audit.businessName,
            url: audit.url,
            niche: audit.niche,
            city: audit.city,
            ownerName: audit.ownerName,
            ownerEmail: audit.ownerEmail,
            phone: audit.phone,
            overallScore: audit.overallScore,
            stage: 'OUTREACH_DRAFTED',
            demoPath: demo.relativeUrl,
            outreachPath: `/outreach/${slug}.md`,
            lastAction: new Date().toISOString()
          };
          if (existingIdx >= 0) pipeline.prospects[existingIdx] = record;
          else pipeline.prospects.push(record);
          savePipeline(pipeline);

          sendJson(res, 200, { success: true, audit, demo, outreach, markdown: outreachContent, record });
          return;
        }

        if (reqPath === '/api/update-stage' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const { slug, stage } = body;
          const pipeline = loadPipeline();
          const p = pipeline.prospects.find(item => item.slug === slug);
          if (!p) {
            sendJson(res, 404, { success: false, error: 'Prospect not found' });
            return;
          }
          p.stage = stage;
          p.lastAction = new Date().toISOString();
          savePipeline(pipeline);
          sendJson(res, 200, { success: true, prospect: p, summary: pipeline.pipeline_summary });
          return;
        }

        if (reqPath === '/api/delete-prospect' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const { slug } = body;
          const pipeline = loadPipeline();
          pipeline.prospects = pipeline.prospects.filter(item => item.slug !== slug);
          savePipeline(pipeline);
          sendJson(res, 200, { success: true, summary: pipeline.pipeline_summary });
          return;
        }

        // CSV Export
        if (reqPath === '/api/export-csv' && req.method === 'GET') {
          const pipeline = loadPipeline();
          const headers = ['Business Name', 'Website URL', 'Vertical', 'City', 'Owner Name', 'Owner Email', 'Phone', 'Audit Score', 'Stage', 'Last Updated'];
          const rows = pipeline.prospects.map(p => [
            `"${p.businessName || ''}"`,
            `"${p.url || ''}"`,
            `"${p.niche || ''}"`,
            `"${p.city || ''}"`,
            `"${p.ownerName || ''}"`,
            `"${p.ownerEmail || ''}"`,
            `"${p.phone || ''}"`,
            `"${p.overallScore || 4}/10"`,
            `"${p.stage || 'DISCOVERED'}"`,
            `"${p.lastAction || ''}"`
          ].join(','));
          const csvContent = [headers.join(','), ...rows].join('\n');
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=UTF-8',
            'Content-Disposition': `attachment; filename="agency_leads_${new Date().toISOString().slice(0,10)}.csv"`
          });
          res.end(csvContent);
          return;
        }

        // CSV Batch Import
        if (reqPath === '/api/import-csv' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const rawLines = (body.csvText || '').split(/\r?\n/).filter(l => l.trim().length > 0);
          if (rawLines.length <= 1) {
            sendJson(res, 400, { success: false, error: 'No data rows found in CSV' });
            return;
          }
          const imported = [];
          const pipeline = loadPipeline();
          // Skip header row
          for (let i = 1; i < rawLines.length; i++) {
            const cols = rawLines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
            const [name, url, niche, city, owner, email, phone] = cols;
            if (name && url) {
              const slug = slugify(name);
              const record = {
                slug,
                businessName: name,
                url,
                niche: niche || 'trade',
                city: city || 'Local Area',
                ownerName: owner || 'Business Owner',
                ownerEmail: email || `contact@${slug}.com`,
                phone: phone || '(555) 234-5678',
                overallScore: 4,
                stage: 'DISCOVERED',
                lastAction: new Date().toISOString()
              };
              const exIdx = pipeline.prospects.findIndex(p => p.slug === slug);
              if (exIdx >= 0) pipeline.prospects[exIdx] = record;
              else pipeline.prospects.push(record);
              imported.push(record);
            }
          }
          savePipeline(pipeline);
          sendJson(res, 200, { success: true, count: imported.length, pipeline });
          return;
        }

        // ── Hermes Orchestrator ──────────────────────────────────────────────────
        if (reqPath === '/api/hermes' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const dryRun = body.dryRun || false;
          const targetSlug = body.slug || null;
          broadcastLog(JSON.stringify({ ts: new Date().toISOString(), icon: '🏛️', msg: `Hermes started${dryRun ? ' [DRY RUN]' : ''}` }));
          try {
            const result = await runHermes({ dryRun, targetSlug });
            broadcastLog(JSON.stringify({ ts: new Date().toISOString(), icon: '✅', msg: `Hermes complete — ${result.actionsCount} actions on ${result.total} leads` }));
            sendJson(res, 200, { success: true, ...result });
          } catch (err) {
            broadcastLog(JSON.stringify({ ts: new Date().toISOString(), icon: '❌', msg: `Hermes error: ${err.message}` }));
            sendJson(res, 500, { success: false, error: err.message });
          }
          return;
        }

        // ── Interactions History ─────────────────────────────────────────────────
        if (reqPath.startsWith('/api/interactions/') && req.method === 'GET') {
          const slug = reqPath.replace('/api/interactions/', '').trim();
          let interactions = [];
          try {
            if (fs.existsSync(INTERACTIONS_FILE)) {
              interactions = JSON.parse(fs.readFileSync(INTERACTIONS_FILE, 'utf-8'));
            }
          } catch {}
          const leadInteractions = slug === 'all' ? interactions : interactions.filter(i => i.lead_slug === slug);
          sendJson(res, 200, { success: true, interactions: leadInteractions });
          return;
        }

        // ── Send Email for Lead ──────────────────────────────────────────────────
        if (reqPath === '/api/send-email' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const slug = slugify(body.businessName || body.slug);
          const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
          let prospectData = body;
          if (fs.existsSync(prospectFile)) {
            prospectData = { ...JSON.parse(fs.readFileSync(prospectFile, 'utf-8')), ...body };
          }

          const dryRun = body.dryRun || false;
          const email = composeEmail({
            to: body.to || prospectData.ownerEmail || `contact@${slug}.com`,
            subject: body.subject || `Quick redesign idea for ${prospectData.businessName}`,
            body: body.body || `Hi ${prospectData.ownerName || 'there'},\n\nI noticed your website and built a quick modern redesign demo. Would love to get your thoughts!`,
            demoUrl: body.demoUrl || `/demos/${slug}/index.html`,
            agencyName: 'Apex AI Web Studio'
          });

          const result = await sendEmail(email, { dryRun, leadSlug: slug });
          sendJson(res, 200, { success: true, result });
          return;
        }

        // ── Proposals ──────────────────────────────────────────────────────────
        if (reqPath.startsWith('/api/proposal/') && req.method === 'GET') {
          const slug = reqPath.replace('/api/proposal/', '').trim();
          const proposalFile = path.join(PROPOSALS_DIR, `${slug}.html`);
          if (fs.existsSync(proposalFile)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
            fs.createReadStream(proposalFile).pipe(res);
          } else {
            sendJson(res, 404, { success: false, error: 'Proposal not found' });
          }
          return;
        }

        // ── Google Maps Auto-Scraper Endpoint ──────────────────────────────────
        if (reqPath === '/api/scrape-maps' && req.method === 'POST') {
          const body = await parseBody(req);
          const { niche = 'restaurant', city = 'Austin, TX', count = 5 } = body;
          const leads = await harvestGoogleMapsLeads({ niche, city, count, filterOnlyNoOrBadWebsite: true });
          const pipeline = loadPipeline();
          for (const lead of leads) {
            pipeline.prospects.push(lead);
          }
          savePipeline(pipeline);
          sendJson(res, 200, { success: true, count: leads.length, leads });
          return;
        }

        // ── AI Voice Call Endpoint ─────────────────────────────────────────────
        if (reqPath === '/api/call-lead' && req.method === 'POST') {
          const body = await parseBody(req);
          const { slug, simulate = true } = body;
          const pipeline = loadPipeline();
          const p = pipeline.prospects.find(item => item.slug === slug);
          if (!p) {
            sendJson(res, 404, { success: false, error: `Prospect not found: ${slug}` });
            return;
          }
          const callResult = await placeVoiceCall(p, { simulate });
          sendJson(res, 200, { success: true, callResult });
          return;
        }

        // ── Close Deal (CLOSED_WON) Endpoint ───────────────────────────────────
        if (reqPath === '/api/close-deal' && req.method === 'POST') {
          const body = await parseBody(req);
          const { slug, package: pkg = 'growth', amount = 750 } = body;
          const result = await confirmDealWon(slug, { package: pkg, amount });
          sendJson(res, 200, { success: true, result });
          return;
        }

        // ── Autopilot Cycle Endpoint ──────────────────────────────────────────
        if (reqPath === '/api/autopilot/cycle' && req.method === 'POST') {
          const body = await parseBody(req);
          const { dryRun = false } = body;
          const result = await runAutopilotCycle({ dryRun });
          sendJson(res, 200, { success: true, result });
          return;
        }

        // ── Payment Webhook Listener ──────────────────────────────────────────
        if (reqPath === '/api/webhooks/payment' && req.method === 'POST') {
          const body = await parseBody(req);
          const slug = body.leadSlug || body.slug || body.metadata?.lead_slug;
          if (!slug) {
            sendJson(res, 400, { success: false, error: 'Missing leadSlug in webhook payload' });
            return;
          }
          const result = await confirmDealWon(slug, {
            package: body.package || 'growth',
            amount: body.amount ? body.amount / 100 : 750
          });
          sendJson(res, 200, { success: true, message: 'Payment confirmed and deal closed', result });
          return;
        }

      } catch (apiErr) {
        console.error('API Error:', apiErr);
        sendJson(res, 500, { success: false, error: apiErr.message });
        return;
      }
    }

    // SPA & Static Files
    if (reqPath === '/' || reqPath === '/index.html') {
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        fs.createReadStream(indexPath).pipe(res);
        return;
      }
    }

    let filePath = path.join(PUBLIC_DIR, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(ROOT_DIR, reqPath);
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'text/plain; charset=UTF-8';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(port, () => {
    console.log(`\n🚀 Apex AI Web Studio running at: http://localhost:${port}`);
  });

  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = parseInt(process.argv[2], 10) || 3030;
  startPreviewServer(port);
}
