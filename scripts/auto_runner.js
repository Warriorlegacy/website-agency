/**
 * scripts/auto_runner.js
 * Production Autonomous Pipeline Orchestrator
 *
 * Pipeline: findLeads → scrapeContacts → auditWebsite → generateDemo → generateOutreach → CRM
 *
 * All steps use real production APIs:
 *   - Lead discovery: Google Places / SerpAPI / Jina Search
 *   - Scraping: Jina Reader (free) / Firecrawl
 *   - AI analysis: BYOK multi-provider (Groq / OpenAI / Anthropic / Gemini / Custom)
 *   - Contact extraction: AI-powered from /contact, /about pages
 *
 * Usage:
 *   node scripts/auto_runner.js
 *   node scripts/auto_runner.js --leads=5 --niche=medical --city="Miami, FL"
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findLeads } from './lib/lead_finder.js';
import { extractContactInfo } from './lib/contact_extractor.js';
import { getActiveProvider } from './lib/ai_client.js';
import { auditWebsite } from './audit_engine.js';
import { generateDemoSite } from './demo_generator.js';
import { generateOutreachSequence } from './outreach_generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');

// ─── JSON Log Emitter ─────────────────────────────────────────────────────────
// Outputs structured JSON lines parseable by the SSE dashboard
function emit(obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
  process.stdout.write(line + '\n');
}

// ─── Config Loader ────────────────────────────────────────────────────────────
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; }
}

function loadPipeline() {
  if (!fs.existsSync(PIPELINE_FILE)) {
    return { agency_name: 'Apex AI Web Studio', last_updated: new Date().toISOString(), prospects: [] };
  }
  try { return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8')); } catch {
    return { agency_name: 'Apex AI Web Studio', last_updated: new Date().toISOString(), prospects: [] };
  }
}

function savePipeline(pipeline) {
  pipeline.last_updated = new Date().toISOString();
  const p = pipeline.prospects;
  pipeline.pipeline_summary = {
    total_prospects: p.length,
    discovered: p.filter(x => x.stage === 'DISCOVERED').length,
    audited: p.filter(x => x.stage === 'AUDITED').length,
    demo_generated: p.filter(x => x.stage === 'DEMO_GENERATED').length,
    outreach_drafted: p.filter(x => x.stage === 'OUTREACH_DRAFTED').length,
    contacted: p.filter(x => x.stage === 'CONTACTED').length,
    meeting_scheduled: p.filter(x => x.stage === 'MEETING_SCHEDULED').length,
    closed_won: p.filter(x => x.stage === 'CLOSED_WON').length,
    closed_lost: p.filter(x => x.stage === 'CLOSED_LOST').length,
    pipeline_value_usd: p.filter(x => !['CLOSED_LOST'].includes(x.stage)).length * (loadConfig()?.pipeline?.pipelineValuePerLead || 1500)
  };
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(pipeline, null, 2), 'utf-8');
}

// ─── Delay ────────────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Parse CLI args ───────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => args.find(a => a.startsWith(`--${flag}=`))?.split('=').slice(1).join('=');
  return {
    leadsOverride: parseInt(get('leads') || '0') || null,
    cityOverride: get('city') || null,
    nicheOverride: get('niche') || null
  };
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────
async function runAutoPipeline() {
  const cfg = loadConfig();
  const pipelineCfg = cfg.pipeline || cfg; // support both new and legacy format
  const scraperKeys = cfg.scraping?.keys || {};
  const { leadsOverride, cityOverride, nicheOverride } = parseArgs();

  const leadsPerRun = leadsOverride || pipelineCfg.leadsPerRun || 5;
  const targetCities = cityOverride ? [cityOverride] : (pipelineCfg.targetCities || ['Austin, TX']);
  const targetNiches = nicheOverride ? [nicheOverride] : (pipelineCfg.targetNiches || ['restaurant', 'trade']);
  const scrapeDelayMs = pipelineCfg.scrapeDelayMs || 1500;
  const extractContact = pipelineCfg.extractContactInfo !== false;

  const activeAi = getActiveProvider();

  emit({
    icon: '🚀', msg: 'AUTO PIPELINE STARTED',
    leadsPerRun, targetCities, targetNiches,
    aiProvider: activeAi.name, aiModel: activeAi.model,
    aiKeyPresent: activeAi.hasKey
  });

  if (!activeAi.hasKey) {
    emit({ icon: '⚠️', msg: `No AI key configured for "${activeAi.name}" — audits will use heuristic engine. Add key to config.json → ai.keys.${activeAi.provider}` });
  }

  const pipeline = loadPipeline();
  const existingSlugs = pipeline.prospects.map(p => p.slug);

  let stats = { discovered: 0, contacted_enriched: 0, audited: 0, demos: 0, outreach: 0, errors: 0 };

  // ── STEP 1: Discover leads ─────────────────────────────────────────────────
  emit({ icon: '🕵️', msg: 'STEP 1: Discovering leads...' });
  console.log('\n🕵️  PRODUCTION LEAD DISCOVERY');
  console.log(`   Niches: ${targetNiches.join(', ')}`);
  console.log(`   Cities: ${targetCities.join(', ')}`);
  console.log(`   Target: ${leadsPerRun} new leads\n`);

  const rawLeads = [];
  for (const city of targetCities) {
    for (const niche of targetNiches) {
      const needed = leadsPerRun - rawLeads.length;
      if (needed <= 0) break;
      try {
        const found = await findLeads({
          niche, city,
          count: Math.ceil(needed / (targetNiches.length * targetCities.length)) + 2,
          excludeSlugs: existingSlugs
        });
        rawLeads.push(...found);
        emit({ icon: '✅', msg: `Discovered ${found.length} leads in ${city}/${niche}`, source: found[0]?.source });
      } catch (err) {
        emit({ icon: '❌', msg: `Lead discovery failed for ${city}/${niche}: ${err.message}` });
        stats.errors++;
      }
      await delay(scrapeDelayMs);
    }
    if (rawLeads.length >= leadsPerRun) break;
  }

  const newLeads = rawLeads.slice(0, leadsPerRun);
  stats.discovered = newLeads.length;
  emit({ icon: '📊', msg: `Discovery complete: ${newLeads.length} new leads`, count: newLeads.length });

  if (newLeads.length === 0) {
    emit({ icon: '🏁', msg: 'No new leads found. Pipeline complete.', ...stats });
    return;
  }

  // ── STEP 2-5: Process each lead ────────────────────────────────────────────
  for (const lead of newLeads) {
    const slug = lead.slug;
    emit({ icon: '🔍', msg: `Processing: ${lead.businessName} (${lead.city})`, slug, source: lead.source });

    try {
      // ── STEP 2: Contact Enrichment ─────────────────────────────────────────
      let ownerName = lead.ownerName || 'Business Owner';
      let ownerEmail = lead.ownerEmail || '';
      let phone = lead.phone || '';

      if (extractContact && lead.url && !lead.isSynthetic) {
        emit({ icon: '📞', msg: `Extracting contact info from ${lead.url}...`, slug });
        try {
          const contact = await extractContactInfo(lead.url, lead.businessName, { jinaKey: scraperKeys.jina || '' });
          if (contact.ownerName && contact.ownerName !== 'Business Owner') ownerName = contact.ownerName;
          if (contact.ownerEmail) ownerEmail = contact.ownerEmail;
          if (contact.phone) phone = contact.phone;
          if (contact.source !== 'none' && contact.source !== 'error') {
            stats.contacted_enriched++;
            emit({ icon: '✅', msg: `Contact extracted (${contact.source}): ${ownerName}${ownerEmail ? ' · ' + ownerEmail : ''}`, slug });
          }
        } catch (contactErr) {
          emit({ icon: '⚠️', msg: `Contact extraction skipped: ${contactErr.message}`, slug });
        }
        await delay(Math.round(scrapeDelayMs * 0.7));
      }

      // ── STEP 3: Audit ──────────────────────────────────────────────────────
      emit({ icon: '🧠', msg: `Auditing ${lead.businessName}...`, slug });
      const audit = await auditWebsite({
        businessName: lead.businessName,
        url: lead.url,
        niche: lead.niche,
        city: lead.city,
        ownerName,
        ownerEmail,
        phone
      });
      stats.audited++;
      emit({ icon: '✅', msg: `Audit complete: score ${audit.overallScore}/10 via ${audit.engine}`, slug, score: audit.overallScore });

      // Update pipeline record (AUDITED)
      {
        const existing = pipeline.prospects.findIndex(p => p.slug === slug);
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
          engine: audit.engine,
          source: lead.source,
          stage: 'AUDITED',
          demoPath: `/demos/${slug}/index.html`,
          outreachPath: `/outreach/${slug}.md`,
          lastAction: new Date().toISOString()
        };
        if (existing >= 0) pipeline.prospects[existing] = record;
        else pipeline.prospects.push(record);
        savePipeline(pipeline);
      }

      await delay(scrapeDelayMs);

      // ── STEP 4: Demo Generation ────────────────────────────────────────────
      emit({ icon: '🎨', msg: `Generating demo site for ${lead.businessName}...`, slug });
      const demo = generateDemoSite(audit, null);
      stats.demos++;
      emit({ icon: '✅', msg: `Demo generated: ${demo.relativeUrl}`, slug });

      // Update stage
      {
        const p = pipeline.prospects.find(x => x.slug === slug);
        if (p) { p.stage = 'DEMO_GENERATED'; p.lastAction = new Date().toISOString(); savePipeline(pipeline); }
      }

      // ── STEP 5: Outreach Generation ────────────────────────────────────────
      emit({ icon: '✍️', msg: `Drafting outreach for ${lead.businessName}...`, slug });
      generateOutreachSequence(audit, demo.relativeUrl);
      stats.outreach++;
      emit({ icon: '✅', msg: `Outreach drafted: outreach/${slug}.md`, slug });

      // Update stage → OUTREACH_DRAFTED
      {
        const p = pipeline.prospects.find(x => x.slug === slug);
        if (p) { p.stage = 'OUTREACH_DRAFTED'; p.lastAction = new Date().toISOString(); savePipeline(pipeline); }
      }

    } catch (err) {
      emit({ icon: '❌', msg: `Lead "${lead.businessName}" failed: ${err.message}`, slug });
      stats.errors++;
    }

    await delay(scrapeDelayMs);
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  savePipeline(pipeline);
  const valuePerLead = pipelineCfg.pipelineValuePerLead || 1500;
  emit({
    icon: '🏁', msg: 'AUTO PIPELINE COMPLETE',
    ...stats,
    totalPipelineValue: `$${((stats.outreach) * valuePerLead).toLocaleString()}`
  });
  console.log(`\n✅ Pipeline complete: ${stats.discovered} discovered, ${stats.contacted_enriched} contacts extracted, ${stats.audited} audited, ${stats.demos} demos, ${stats.outreach} outreach. Errors: ${stats.errors}\n`);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
runAutoPipeline().catch(err => {
  emit({ icon: '💥', msg: `Fatal pipeline error: ${err.message}` });
  console.error(err);
  process.exit(1);
});
