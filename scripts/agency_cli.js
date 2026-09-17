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
        to: prospectData.ownerEmail || `contact@${slug}.com`,
        subject,
        body,
        demoUrl: `http://localhost:3030/demos/${slug}/index.html`,
        agencyName: 'Apex AI Web Studio'
      });

      const result = await sendEmail(email, { dryRun, leadSlug: slug });
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
  scrape-maps <niche> <city> [count]                                      Auto-harvest leads from Google Maps
  call <slug> [--simulate|--live]                                         Place AI voice cold call to owner
  close-deal <slug> [starter|growth|premium]                              Confirm deposit payment & mark CLOSED_WON
  run-all <name> <url> <niche> <city> [owner] [email] [template] [phone]   Execute end-to-end audit, demo, and outreach
  audit <name> [url] [niche] [city]                                       Run 5-point website audit only
  demo <slug> [template]                                                  Generate modern HTML5 demo site
  outreach <slug>                                                         Draft multi-touch outreach sequence
  status                                                                  Print pipeline CRM table
  set-stage <slug> <STAGE>                                                Update lead status in pipeline.json
  serve [port]                                                            Start local web preview server (default: 3030)
  selfcheck                                                               Run automated self-check tests
  hermes [--dry-run] [--slug=<slug>]                                      Run Hermes AI orchestrator
  summary [--local]                                                       Generate daily pipeline summary
  send <slug> [--dry-run]                                                 Send outreach email for a lead
  proposal <slug> [starter|growth|premium]                                Generate proposal document
      `);
  }
}

main().catch(err => {
  console.error('❌ Error executing CLI command:', err);
  process.exit(1);
});
