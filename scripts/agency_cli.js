import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditWebsite, slugify } from './audit_engine.js';
import { generateDemoSite } from './demo_generator.js';
import { generateOutreachSequence } from './outreach_generator.js';
import { startPreviewServer } from './preview_server.js';
import { runHermes } from './hermes.js';
import { generateDailySummary } from './daily_summary.js';
import { sendEmail, composeEmail } from './lib/email_sender.js';
import { generateProposal } from './lib/proposal_generator.js';
import { harvestGoogleMapsLeads, autoHarvestAndIngest } from './lib/google_maps_scraper.js';
import { placeVoiceCall } from './lib/voice_caller.js';
import { sendClosingProposal, confirmDealWon } from './lib/closing_engine.js';
import { runAutopilotCycle } from './autopilot.js';
import { notifyLeadsHarvested } from './lib/telegram_notifier.js';
import { scrapeViaBrowserUse, captureSiteVisuals, deepCrawlContactInfo } from './lib/browser_use_scraper.js';
import { isSendableEmail } from './lib/guardrails.js';
import { placeVoiceCall as pipecatCall } from './lib/pipecat_caller.js';
import { scheduleDemoShowcase, scheduleBatchShowcases } from './lib/postiz_scheduler.js';
import { generateAuditViaLLM, generateOutreachViaLLM, handleObjectionViaPlaybook, generateClientDossier } from './lib/anythingllm_client.js';
import { runClineTask } from './lib/cline_scheduler.js';
import { loadAppConfig } from './lib/config_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');
const PROSPECTS_DIR = path.join(ROOT_DIR, 'prospects');

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
  // Recalculate summary metrics
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

/**
 * CLI Execution Handler
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  console.log(`\n======================================================`);
  console.log(`  ⚡ APEX AI WEB STUDIO — AUTONOMOUS AGENCY CLI ⚡  `);
  console.log(`======================================================`);

  switch (command) {
    case 'run-all': {
      const businessName = args[1];
      const url = args[2];
      const niche = args[3] || 'trade';
      const city = args[4] || 'Austin, TX';
      const ownerName = args[5] || '';
      const ownerEmail = args[6] || '';
      const template = args[7] || null;
      const phone = args[8] || '(555) 234-5678';

      if (!businessName || !url) {
        console.error('❌ Error: Missing parameters.');
        console.log('Usage: node scripts/agency_cli.js run-all <businessName> <url> [niche] [city] [ownerName] [ownerEmail] [template] [phone]');
        process.exit(1);
      }

      console.log(`\n🚀 Executing full autonomous pipeline for: ${businessName}`);
      
      // Step 1: Audit
      const audit = await auditWebsite({ businessName, url, niche, city, ownerName, ownerEmail, phone });
      
      // Step 2: Demo Generation
      const demo = generateDemoSite(audit, template);

      // Step 3: Outreach Generation
      const outreach = generateOutreachSequence(audit);

      // Step 4: Update Pipeline CRM
      const pipeline = loadPipeline();
      const slug = audit.slug;
      const existingIdx = pipeline.prospects.findIndex(p => p.slug === slug);
      const prospectRecord = {
        slug,
        businessName,
        url,
        niche,
        city,
        ownerName: audit.ownerName,
        ownerEmail: audit.ownerEmail,
        phone: audit.phone,
        overallScore: audit.overallScore,
        stage: 'OUTREACH_DRAFTED',
        demoPath: demo.relativeUrl,
        outreachPath: `/outreach/${slug}.md`,
        lastAction: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        pipeline.prospects[existingIdx] = prospectRecord;
      } else {
        pipeline.prospects.push(prospectRecord);
      }
      savePipeline(pipeline);

      console.log(`\n✨ Full pipeline complete!`);
      console.log(`📊 Pipeline stage set to: OUTREACH_DRAFTED`);
      console.log(`🖥️  Local Demo: http://localhost:3030/demos/${slug}/index.html`);
      console.log(`✉️  Outreach Draft: outreach/${slug}.md`);
      break;
    }

    case 'audit': {
      const slugOrName = args[1];
      if (!slugOrName) {
        console.log('Usage: node scripts/agency_cli.js audit <businessName>');
        return;
      }
      await auditWebsite({ businessName: slugOrName, url: args[2] || 'https://example.com', niche: args[3] || 'trade', city: args[4] || 'Local' });
      break;
    }

    case 'demo': {
      const slug = slugify(args[1]);
      const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
      if (!fs.existsSync(prospectFile)) {
        console.error(`❌ Prospect file not found: prospects/${slug}.json. Run audit first.`);
        return;
      }
      const prospectData = JSON.parse(fs.readFileSync(prospectFile, 'utf-8'));
      generateDemoSite(prospectData, args[2] || null);
      break;
    }

    case 'outreach': {
      const slug = slugify(args[1]);
      const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
      if (!fs.existsSync(prospectFile)) {
        console.error(`❌ Prospect file not found: prospects/${slug}.json. Run audit first.`);
        return;
      }
      const prospectData = JSON.parse(fs.readFileSync(prospectFile, 'utf-8'));
      generateOutreachSequence(prospectData);
      break;
    }

    case 'status': {
      const pipeline = loadPipeline();
      console.log(`\n📋 AGENCY PIPELINE STATUS:`);
      console.log(`Total Leads: ${pipeline.pipeline_summary?.total_prospects || 0} | Estimated Pipeline Value: $${(pipeline.pipeline_summary?.pipeline_value_usd || 0).toLocaleString()}\n`);
      
      if (pipeline.prospects.length === 0) {
        console.log('No prospects in pipeline yet. Use `run-all` to add a new prospect.');
      } else {
        console.table(pipeline.prospects.map(p => ({
          Business: p.businessName,
          Niche: p.niche,
          City: p.city,
          Owner: p.ownerName,
          Score: `${p.overallScore}/10`,
          Stage: p.stage
        })));
      }
      break;
    }

    case 'set-stage': {
      const slug = slugify(args[1]);
      const newStage = (args[2] || '').toUpperCase();
      const validStages = ['DISCOVERED', 'AUDITED', 'DEMO_GENERATED', 'OUTREACH_DRAFTED', 'CONTACTED', 'MEETING_SCHEDULED', 'CLOSED_WON', 'CLOSED_LOST'];
      
      if (!slug || !validStages.includes(newStage)) {
        console.log(`Usage: node scripts/agency_cli.js set-stage <slug> <${validStages.join('|')}>`);
        return;
      }

      const pipeline = loadPipeline();
      const prospect = pipeline.prospects.find(p => p.slug === slug);
      if (!prospect) {
        console.error(`❌ Prospect ${slug} not found in pipeline.json`);
        return;
      }
      prospect.stage = newStage;
      prospect.lastAction = new Date().toISOString();
      savePipeline(pipeline);
      console.log(`✅ Prospect [${slug}] stage updated to: ${newStage}`);
      break;
    }

    case 'serve': {
      const port = parseInt(args[1], 10) || 3030;
      startPreviewServer(port);
      break;
    }

    case 'selfcheck': {
      console.log('🧪 Running automated self-check test suite...');
      const sample = {
        businessName: "Summit Peak Plumbing",
        url: "http://example.com/summit",
        niche: "trade",
        city: "Denver, CO",
        ownerName: "Robert Miller",
        ownerEmail: "robert@summitplumbing.test",
        phone: "(303) 555-0144"
      };

      const audit = await auditWebsite(sample);
      if (!audit || audit.overallScore === undefined) throw new Error('Audit engine selfcheck failed');

      const demo = generateDemoSite(audit, 'trade');
      if (!fs.existsSync(demo.demoPath)) throw new Error('Demo generation selfcheck failed');

      const outreach = generateOutreachSequence(audit);
      if (!fs.existsSync(outreach.outreachPath)) throw new Error('Outreach generation selfcheck failed');

      console.log('✅ ALL ENGINES PASSED SELF-CHECK (Audit, Demo Builder, Outreach Generator, Pipeline CRM)');
      break;
    }

    case 'hermes': {
      const dryRun = args.includes('--dry-run');
      const slugArg = args.find(a => a.startsWith('--slug='));
      const targetSlug = slugArg ? slugArg.split('=')[1] : null;
      console.log(`\n🏛️ Running Hermes Orchestrator${dryRun ? ' [DRY RUN]' : ''}...\n`);
      await runHermes({ dryRun, targetSlug });
      break;
    }

    case 'summary': {
      const localOnly = args.includes('--local') || !args[1];
      console.log(`\n📊 Generating daily summary...\n`);
      await generateDailySummary({ localOnly });
      break;
    }

    case 'send': {
      const slug = slugify(args[1]);
      const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
      if (!fs.existsSync(prospectFile)) {
        console.error(`❌ Prospect file not found: prospects/${slug}.json. Run audit first.`);
        return;
      }
      const prospectData = JSON.parse(fs.readFileSync(prospectFile, 'utf-8'));
      const dryRun = args.includes('--dry-run');
      const outreachFile = path.join(ROOT_DIR, 'outreach', `${slug}.md`);

      const recipient = prospectData.ownerEmail;
      if (!recipient) {
        console.error(`❌ No verified owner email on record for [${slug}].`);
        console.error(`   Locate a publicly published address first (AGENTS.md rule 2) and set prospects/${slug}.json -> ownerEmail + ownerEmailSource.`);
        return;
      }

      let body = `Hi ${prospectData.ownerName || 'there'},\n\nI noticed your website and built a quick redesign demo. Would love your thoughts!`;
      let subject = `Quick redesign idea for ${prospectData.businessName}`;
      if (fs.existsSync(outreachFile)) {
        const md = fs.readFileSync(outreachFile, 'utf-8');
        const emailMatch = md.match(/##\s*(?:Email|Touch)\s*(?:1|One)[^\n]*\n([\s\S]*?)(?=##|$)/i);
        if (emailMatch) body = emailMatch[1].trim();
        const subjectMatch = md.match(/Subject:\s*(.+)/i);
        if (subjectMatch) subject = subjectMatch[1].trim();
      }

      const email = composeEmail({
        to: recipient,
        subject,
        body,
        demoUrl: `http://localhost:3030/demos/${slug}/index.html`,
        agencyName: 'Apex AI Web Studio'
      });

      const result = await sendEmail(email, {
        dryRun,
        leadSlug: slug,
        observedOn: prospectData.ownerEmailSource,
        recipientConfirmed: prospectData.ownerEmailConfirmed === true,
        demoUrl: `http://localhost:3030/demos/${slug}/index.html`
      });
      console.log(`\n✅ Email ${dryRun ? 'logged (dry run)' : 'sent'} via ${result.provider}`);
      break;
    }

    case 'proposal': {
      const slug = slugify(args[1]);
      const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
      if (!fs.existsSync(prospectFile)) {
        console.error(`❌ Prospect file not found: prospects/${slug}.json. Run audit first.`);
        return;
      }
      const prospectData = JSON.parse(fs.readFileSync(prospectFile, 'utf-8'));
      const pkg = args[2] || 'growth';
      const result = generateProposal({
        prospect: prospectData,
        demoUrl: `http://localhost:3030/demos/${slug}/index.html`,
        recommendedPackage: pkg
      });
      console.log(`\n✅ Proposal generated: ${result.proposalPath}`);
      break;
    }

    // ─── FREE TOOL INTEGRATIONS ──────────────────────────────────────

    case 'scrape-browser': {
      const niche = args[1] || 'restaurant';
      const city = args[2] || 'Austin, TX';
      const count = parseInt(args[3] || '5', 10);
      console.log(`\n🌐 [Browser Use] Scraping Google Maps for ${count} leads...`);
      const leads = await scrapeViaBrowserUse({ niche, city, count });
      const pipeline = loadPipeline();
      for (const lead of leads) {
        pipeline.prospects.push({
          ...lead,
          stage: 'DISCOVERED',
          createdAt: new Date().toISOString(),
          lastAction: new Date().toISOString()
        });
      }
      savePipeline(pipeline);
      console.log(`✅ Added ${leads.length} Browser Use leads to pipeline`);
      break;
    }

    case 'call-ai': {
      const slug = slugify(args[1]);
      const pipeline = loadPipeline();
      const p = pipeline.prospects.find(item => item.slug === slug);
      if (!p) { console.error(`❌ Prospect not found: ${slug}`); return; }
      console.log(`\n📞 [Pipecat] Calling ${p.businessName}...`);
      const callResult = await pipecatCall(p);
      console.log(`✅ Call ${callResult.status}: ${callResult.outcome}`);
      if (callResult.transcript) {
        console.log('\nTranscript:');
        callResult.transcript.forEach(t => console.log(`  ${t.turn}: ${t.text}`));
      }
      break;
    }

    case 'social-post': {
      const slug = args[1];
      if (slug) {
        const pipeline = loadPipeline();
        const p = pipeline.prospects.find(item => item.slug === slug);
        if (!p) { console.error(`❌ Prospect not found: ${slug}`); return; }
        const demoUrl = p.demoPath || `https://warriorlegacy.github.io/website-agency/demos/${slug}/index.html`;
        const result = await scheduleDemoShowcase({ slug, businessName: p.businessName, niche: p.niche, demoUrl, city: p.city });
        console.log(`✅ Social post: ${result.status}`);
      } else {
        const pipeline = loadPipeline();
        const demos = pipeline.prospects.filter(p => p.stage === 'DEMO_GENERATED' || p.stage === 'OUTREACH_DRAFTED');
        const results = await scheduleBatchShowcases(demos);
        console.log(`✅ Scheduled ${results.filter(r => r.status === 'scheduled').length}/${results.length} social posts`);
      }
      break;
    }

    case 'llm-audit': {
      const url = args[1];
      const niche = args[2] || 'trade';
      const city = args[3] || 'Local';
      if (!url) { console.log('Usage: node scripts/agency_cli.js llm-audit <url> [niche] [city]'); return; }
      console.log(`\n🧠 [AnythingLLM] Auditing ${url}...`);
      const audit = await generateAuditViaLLM({ businessName: url, url, niche, city });
      if (audit) {
        console.log(`✅ LLM Audit Score: ${audit.overallScore}/10`);
        console.log(`  Design: ${audit.designScore} | Mobile: ${audit.mobileScore} | Speed: ${audit.speedScore}`);
        console.log(`  SEO: ${audit.seoScore} | Conversion: ${audit.conversionScore}`);
        if (audit.topIssues) console.log('  Top Issues:', audit.topIssues);
      } else {
        console.log('⚠️ AnythingLLM not available — using heuristic fallback');
      }
      break;
    }

    case 'objection': {
      const slug = slugify(args[1]);
      const objectionText = args.slice(2).join(' ');
      if (!slug || !objectionText) {
        console.log('Usage: node scripts/agency_cli.js objection <slug> "<objection text>"');
        return;
      }
      const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
      let prospect = { businessName: slug, city: 'Local Area' };
      if (fs.existsSync(prospectFile)) {
        try { prospect = JSON.parse(fs.readFileSync(prospectFile, 'utf-8')); } catch {}
      }
      console.log(`\n🧠 [AnythingLLM Playbook] Resolving objection for [${prospect.businessName}]:`);
      console.log(`   Objection: "${objectionText}"`);
      const reply = await handleObjectionViaPlaybook(objectionText, prospect);
      console.log(`\n📋 Playbook Recommended Script:\n----------------------------------------\n${reply}\n----------------------------------------`);
      break;
    }

    case 'dossier': {
      const slug = slugify(args[1]);
      if (!slug) {
        console.log('Usage: node scripts/agency_cli.js dossier <slug>');
        return;
      }
      const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
      if (!fs.existsSync(prospectFile)) {
        console.error(`❌ Prospect not found: ${slug}`);
        return;
      }
      const prospect = JSON.parse(fs.readFileSync(prospectFile, 'utf-8'));
      console.log(`\n🧠 [AnythingLLM Playbook] Generating sales intelligence dossier for [${prospect.businessName}]...`);
      const dossier = await generateClientDossier(prospect, prospect);
      if (dossier) {
        const dossierFile = path.join(PROSPECTS_DIR, `${slug}_dossier.json`);
        fs.writeFileSync(dossierFile, JSON.stringify(dossier, null, 2), 'utf-8');
        console.log(`✅ Strategic Sales Dossier Created at: prospects/${slug}_dossier.json`);
        console.log(`   Recommended Package: ${dossier.recommendedTier?.toUpperCase()} ($${dossier.recommendedPriceUSD})`);
        console.log(`   Winning Pitch Angle: ${dossier.keyPitchAngle}`);
        console.log(`   Anticipated Pushback: ${dossier.anticipatedObjection}`);
        console.log(`   Response Play: ${dossier.winningResponse}`);
      } else {
        console.warn('⚠️ Could not generate dossier.');
      }
      break;
    }

    case 'cline-run': {
      const prompt = args.slice(1).join(' ') || 'Run agency selfcheck';
      console.log(`\n🤖 [Cline] Running: "${prompt}"`);
      const result = await runClineTask(prompt);
      console.log(`✅ Cline: ${result.status}`);
      if (result.output) console.log(result.output.slice(0, 500));
      break;
    }

    case 'integrations': {
      const cfg = loadAppConfig();
      const int = cfg.integrations || {};
      console.log('\n🔌 FREE TOOL INTEGRATIONS STATUS:\n');
      const tools = [
        { name: 'Browser Use', key: 'browserUse', desc: 'Google Maps scraping via AI browser' },
        { name: 'Pipecat', key: 'pipecat', desc: 'Real-time AI voice calling' },
        { name: 'Postiz', key: 'postiz', desc: 'Social media scheduling' },
        { name: 'AnythingLLM', key: 'anythingllm', desc: 'Local AI brain for audits/proposals' },
        { name: 'Cline', key: 'cline', desc: 'Scheduled autonomous agent runs' }
      ];
      for (const t of tools) {
        const cfg = int[t.key] || {};
        const enabled = cfg.enabled ? '✅ ON' : '❌ OFF';
        const hasKey = cfg.apiKey || cfg.cloudApiKey || cfg.dailyToken;
        console.log(`  ${enabled}  ${t.name.padEnd(15)} ${t.desc}${hasKey ? '' : ' (no API key)'}`);
      }
      console.log('\nConfigure in config.json → integrations section');
      break;
    }

    case 'autopilot': {
      const dryRun = args.includes('--dry-run');
      const loop = args.includes('--loop');
      const ignoreQuietHours = args.includes('--force-call');
      const intervalArg = args.find(a => a.startsWith('--interval='));
      const intervalMin = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 15;

      if (loop) {
        console.log(`\n🤖 Launching 24/7 Autopilot daemon (Interval: ${intervalMin}m)...`);
        const run = async () => {
          await runAutopilotCycle({ dryRun, ignoreQuietHours });
          setTimeout(run, intervalMin * 60 * 1000);
        };
        await run();
      } else {
        await runAutopilotCycle({ dryRun, ignoreQuietHours });
      }
      break;
    }

    case 'scrape-maps': {
      const niche = args[1] || 'restaurant';
      const city = args[2] || 'Austin, TX';
      const count = parseInt(args[3] || '5', 10);
      console.log(`\n🚜 Scraping Google Maps for ${count} leads in [${niche}] (${city})...`);
      const results = await harvestGoogleMapsLeads({ niche, city, count, filterOnlyNoOrBadWebsite: true });
      const pipeline = loadPipeline();
      for (const lead of results) {
        pipeline.prospects.push(lead);
      }
      savePipeline(pipeline);
      console.log(`\n✅ Successfully added ${results.length} qualified leads to pipeline CRM!`);
      if (results.length > 0) {
        try {
          await notifyLeadsHarvested(results, { niche, city });
          console.log(`📱 Dispatched real-time leads report document to Telegram.`);
        } catch {}
      }
      break;
    }

    case 'enrich-browser': {
      const slug = slugify(args[1]);
      const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
      if (!fs.existsSync(prospectFile)) {
        console.error(`❌ Prospect not found: ${slug}`);
        return;
      }
      const prospectData = JSON.parse(fs.readFileSync(prospectFile, 'utf-8'));
      console.log(`\n🌐 Running Browser-Use deep enrichment for [${prospectData.businessName}] (${prospectData.url})...`);

      const visuals = await captureSiteVisuals(prospectData.url, slug);
      console.log(`📸 Visual Audit Source: ${visuals.source}`);
      if (visuals.layoutIssues?.length > 0) {
        console.log(`   Layout Issues: ${visuals.layoutIssues.join('; ')}`);
      }

      const contact = await deepCrawlContactInfo(prospectData.url, prospectData.businessName);
      if (contact?.emails?.length > 0) {
        console.log(`✉️  Found public emails: ${contact.emails.join(', ')}`);
        for (const em of contact.emails) {
          const check = isSendableEmail(em, { observedOn: contact.observedOn });
          if (check.ok && !prospectData.ownerEmail) {
            prospectData.ownerEmail = em;
            prospectData.emailSource = contact.observedOn;
            console.log(`   Assigned verified email: ${em} (observed on ${contact.observedOn})`);
            break;
          }
        }
      }
      if (contact?.socialProfiles) {
        prospectData.socialProfiles = { ...(prospectData.socialProfiles || {}), ...contact.socialProfiles };
      }
      prospectData.visualAudit = visuals;
      fs.writeFileSync(prospectFile, JSON.stringify(prospectData, null, 2), 'utf-8');

      const pipeline = loadPipeline();
      const pIdx = pipeline.prospects.findIndex(p => p.slug === slug);
      if (pIdx >= 0) {
        if (prospectData.ownerEmail) pipeline.prospects[pIdx].ownerEmail = prospectData.ownerEmail;
        savePipeline(pipeline);
      }
      console.log(`✅ Enrichment complete! Updated [prospects/${slug}.json]`);
      break;
    }

    case 'call': {
      const slug = slugify(args[1]);
      const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
      const pipeline = loadPipeline();
      const p = pipeline.prospects.find(item => item.slug === slug);
      let prospectData = p || {};
      if (fs.existsSync(prospectFile)) {
        prospectData = { ...JSON.parse(fs.readFileSync(prospectFile, 'utf-8')), ...prospectData };
      }
      if (!prospectData.businessName) {
        console.error(`❌ Prospect not found: ${slug}`);
        return;
      }
      const simulate = args.includes('--simulate') || !args.includes('--live');
      console.log(`\n📞 Placing ${simulate ? 'simulated' : 'live'} AI voice call to ${prospectData.businessName}...`);
      const callResult = await placeVoiceCall(prospectData, { simulate });
      console.log(`\n✅ Call completed! Outcome: ${callResult.outcome || 'finished'}`);
      break;
    }

    case 'close-deal': {
      const slug = slugify(args[1]);
      const pkg = args[2] || 'growth';
      const amount = pkg === 'starter' ? 375 : (pkg === 'premium' ? 1500 : 750);
      console.log(`\n🎉 Closing deal for prospect [${slug}] on package [${pkg.toUpperCase()}]...`);
      const result = await confirmDealWon(slug, { package: pkg, amount });
      console.log(`\n✅ Deal CLOSED_WON! Client onboarding packet created at: ${result.clientFolder}`);
      break;
    }

    default:
      console.log(`
Available Commands:
  autopilot [--loop] [--dry-run] [--interval=15] [--force-call]          Run 24/7 Autonomous Agency Autopilot
  scrape-maps <niche> <city> [count]                                      Auto-harvest leads from Google Maps (OSM)
  scrape-browser <niche> <city> [count]                                   Scrape via Browser Use (AI browser agent)
  enrich-browser <slug>                                                   Visual layout audit & deep contact crawl via Browser Use
  call <slug> [--simulate|--live]                                         Place AI voice cold call (simulation)
  call-ai <slug>                                                          Place AI voice call via Pipecat
  close-deal <slug> [starter|growth|premium]                              Confirm deposit payment & mark CLOSED_WON
  run-all <name> <url> <niche> <city> [owner] [email] [template] [phone]   Execute end-to-end audit, demo, and outreach
  audit <name> [url] [niche] [city]                                       Run 5-point website audit only
  llm-audit <url> [niche] [city]                                          Audit via AnythingLLM (local AI)
  objection <slug> "<text>"                                               Handle client objection via Playbook RAG (AnythingLLM)
  dossier <slug>                                                          Synthesize 1-page strategic sales dossier (AnythingLLM)
  demo <slug> [template]                                                  Generate modern HTML5 demo site
  outreach <slug>                                                         Draft multi-touch outreach sequence
  social-post [slug]                                                      Schedule social media post (Postiz)
  status                                                                  Print pipeline CRM table
  set-stage <slug> <STAGE>                                                Update lead status in pipeline.json
  serve [port]                                                            Start local web preview server (default: 3030)
  selfcheck                                                               Run automated self-check tests
  hermes [--dry-run] [--slug=<slug>]                                      Run Hermes AI orchestrator
  summary [--local]                                                       Generate daily pipeline summary
  send <slug> [--dry-run]                                                 Send outreach email for a lead
  proposal <slug> [starter|growth|premium]                                Generate proposal document
  cline-run <prompt>                                                      Run Cline autonomous agent task
  integrations                                                            Show free tool integration status
      `);
  }
}

main().catch(err => {
  console.error('❌ Error executing CLI command:', err);
  process.exit(1);
});
