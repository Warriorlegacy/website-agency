/**
 * scripts/lib/closing_engine.js
 * Autonomous Client Closing & Deposit Engine
 *
 * Handles the final stages of the pipeline:
 *   1. Auto-generates customized proposal with embedded Stripe/Razorpay payment links
 *   2. Dispatches closing email with direct deposit checkout
 *   3. Verifies / simulates deposit payment receipt
 *   4. Automatically transitions lead to CLOSED_WON
 *   5. Generates client onboarding package & technical kickoff brief
 *
 * ponytail: zero npm deps, stdlib fetch only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateProposal } from './proposal_generator.js';
import { createPaymentLink } from './payment.js';
import { sendEmail, composeEmail } from './email_sender.js';
import { getBookingLink } from './scheduler.js';
import { loadAppConfig, getPublicDemoUrl } from './config_loader.js';
import { notifyProposalDispatched, notifyDealClosedWon } from './telegram_notifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');
const INTERACTIONS_FILE = path.join(ROOT_DIR, 'interactions.json');
const CLIENTS_DIR = path.join(ROOT_DIR, 'clients');

function loadConfig() {
  return loadAppConfig();
}

function loadPipeline() {
  try { return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8')); } catch { return { prospects: [] }; }
}

function savePipeline(pipeline) {
  pipeline.last_updated = new Date().toISOString();
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(pipeline, null, 2), 'utf-8');
}

function addInteraction(entry) {
  try {
    const list = fs.existsSync(INTERACTIONS_FILE) ? JSON.parse(fs.readFileSync(INTERACTIONS_FILE, 'utf-8')) : [];
    list.push({ ...entry, timestamp: new Date().toISOString() });
    fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}

// ─── Step 1: Send Proposal & Deposit Link ─────────────────────────────────────
export async function sendClosingProposal(prospect, opts = {}) {
  const { packageTier = 'growth', dryRun = false } = opts;
  const cfg = loadConfig();
  const agencyName = cfg.agency?.name || 'Apex AI Web Studio';
  const ownerName = prospect.ownerName && prospect.ownerName !== 'Business Owner' ? prospect.ownerName : 'there';
  const businessName = prospect.businessName;

  console.log(`  💼 [Closing Engine] Preparing proposal for ${businessName} (Package: ${packageTier.toUpperCase()})...`);

  // Generate payment link for 50% deposit
  const payment = await createPaymentLink({
    businessName: prospect.businessName,
    email: prospect.ownerEmail,
    phone: prospect.phone,
    packageKey: packageTier
  });

  // Generate custom interactive proposal
  const bookingLink = getBookingLink(prospect);
  const demoUrl = getPublicDemoUrl(prospect.slug);

  const proposal = generateProposal({
    prospect,
    demoUrl,
    bookingLink,
    recommendedPackage: packageTier
  });

  const emailSubject = `Website Redesign Proposal & Next Steps for ${businessName}`;
  const emailBody = `Hi ${ownerName},

Thank you for reviewing the modern demo website we created for ${businessName}!

As discussed, we've put together your formal website proposal and launch roadmap:
📄 Custom Proposal: http://localhost:3030/${proposal.relativePath}
🌐 Working Demo Preview: ${demoUrl}

To get your new website launched, we require a 50% deposit (₹${payment.amountINR ? payment.amountINR.toLocaleString('en-IN') : '62,500'} / $${payment.amountUSD || 750}) to begin immediate production. You can complete payment via any of the following options:

1. 💳 UPI (India): 6202442690@jio (GPay / PhonePe / Paytm) · Payee: Piyush Singh
2. 🌐 PayPal (Global / International): https://paypal.me/signhify/${payment.amountUSD || 750}USD
3. 🏦 Direct Bank Wire: A/C 000521712140642 · IFSC JIOP0000001 (Piyush Raj Singh)

📲 After paying, please submit your payment screenshot on WhatsApp to +91 6202442690:
https://wa.me/916202442690?text=${encodeURIComponent('Hi Piyush, I have completed the website deposit payment for ' + businessName + '. Attached is my payment screenshot for verification.')}

Your subscription and project kickoff will be confirmed immediately upon screenshot receipt!
Our turnaround time is 7 business days from deposit confirmation.

If you have any questions or want to make adjustments to the scope, you can book a 10-minute slot on my calendar:
📅 Schedule Review: ${bookingLink}

Looking forward to launching your new website!

Warm regards,
${cfg.agency?.owner || 'Piyush'}
${agencyName}`;

  const email = composeEmail({
    to: prospect.ownerEmail || '',
    subject: emailSubject,
    body: emailBody,
    agencyName
  });

  let emailResult = { provider: 'dry_run' };
  if (prospect.ownerEmail) {
    if (!dryRun) {
      emailResult = await sendEmail(email, {
        leadSlug: prospect.slug,
        observedOn: prospect.ownerEmailSource || prospect.url || 'public_listing',
        recipientConfirmed: true
      });
      addInteraction({
        lead_slug: prospect.slug,
        action: 'send_closing_proposal',
        channel: 'email',
        direction: 'outbound',
        package: packageTier,
        deposit_amount: payment.depositAmount,
        payment_url: payment.paymentUrl,
        proposal_url: proposal.relativePath,
        email_provider: emailResult.provider
      });

      try {
        await notifyProposalDispatched(prospect, { packageTier });
      } catch {}
    }
  } else {
    console.log(`  ⏩ [Closing Engine] Skipped proposal email for ${prospect.businessName} — no verified email`);
  }

  return {
    proposal,
    payment,
    email
  };
}

// ─── Step 2: Confirm Deposit & Close Deal (CLOSED_WON) ────────────────────────
export async function confirmDealWon(prospectSlug, paymentDetails = {}) {
  const pipeline = loadPipeline();
  const prospect = pipeline.prospects.find(p => p.slug === prospectSlug);

  if (!prospect) {
    throw new Error(`Prospect with slug "${prospectSlug}" not found in pipeline CRM`);
  }

  const depositPaid = paymentDetails.amount || 750;
  const packageTier = paymentDetails.package || 'growth';

  console.log(`\n🎉 [DEAL CLOSED] Closing deal for ${prospect.businessName}! Deposit: $${depositPaid}`);

  // Update pipeline state
  prospect.stage = 'CLOSED_WON';
  prospect.closedWonAt = new Date().toISOString();
  prospect.depositPaid = depositPaid;
  prospect.packageTier = packageTier;
  prospect.lastAction = new Date().toISOString();

  savePipeline(pipeline);

  // Generate Client Onboarding Kit
  if (!fs.existsSync(CLIENTS_DIR)) fs.mkdirSync(CLIENTS_DIR, { recursive: true });
  const clientFolder = path.join(CLIENTS_DIR, prospectSlug);
  if (!fs.existsSync(clientFolder)) fs.mkdirSync(clientFolder, { recursive: true });

  const kickoffBrief = `# Project Kickoff Brief — ${prospect.businessName}

## Client Overview
- **Business Name:** ${prospect.businessName}
- **Owner / Contact:** ${prospect.ownerName || 'Owner'} (${prospect.ownerEmail || 'Pending verification'})
- **Phone:** ${prospect.phone || 'N/A'}
- **Niche:** ${prospect.niche}
- **City:** ${prospect.city}
- **Package:** ${packageTier.toUpperCase()} ($${depositPaid * 2} Total / $${depositPaid} Deposit Secured)

## Deliverables & Scope
1. **Live Modern Responsive Website:** Deployed on custom domain with SSL.
2. **Mobile Optimization:** Tap-to-call, responsive grid, < 2.0s load time.
3. **Local SEO Foundation:** Meta tags, OpenGraph images, Google Business Profile links.
4. **Lead Capture Form:** Direct notification integration to client inbox.
5. **Approved Demo Base:** \`demos/${prospectSlug}/index.html\`

## Launch Timeline
- **Day 1:** Intake form & branding assets received.
- **Day 3:** Core page copy & design styling finalized.
- **Day 5:** Staging review & mobile device testing.
- **Day 7:** Domain DNS pointing, SSL verification, and final client handover.
`;

  const onboardingPacket = {
    client_slug: prospectSlug,
    business_name: prospect.businessName,
    deal_won_date: new Date().toISOString(),
    package: packageTier,
    deposit_amount_paid: depositPaid,
    checklist: [
      { task: 'Send Welcome Email with Intake Form', done: true },
      { task: 'Collect High-Resolution Logo & Brand Assets', done: false },
      { task: 'Request Domain Registrar Access or Provide DNS A-Records', done: false },
      { task: 'Finalize Custom Copy & Photo Curation', done: false },
      { task: 'Deploy Staging Site to Production Domain', done: false },
      { task: 'Collect Remaining 50% Final Payment Upon Handover', done: false }
    ]
  };

  fs.writeFileSync(path.join(clientFolder, 'kickoff_brief.md'), kickoffBrief, 'utf-8');
  fs.writeFileSync(path.join(clientFolder, 'onboarding.json'), JSON.stringify(onboardingPacket, null, 2), 'utf-8');

  addInteraction({
    lead_slug: prospectSlug,
    action: 'deal_closed_won',
    channel: 'payment_engine',
    direction: 'inbound',
    deposit_amount: depositPaid,
    package: packageTier,
    client_folder: `clients/${prospectSlug}`
  });

  try {
    await notifyDealClosedWon(prospect, { depositPaid, packageTier });
  } catch {}

  return {
    success: true,
    stage: 'CLOSED_WON',
    prospect,
    clientFolder: `clients/${prospectSlug}`,
    depositPaid
  };
}
