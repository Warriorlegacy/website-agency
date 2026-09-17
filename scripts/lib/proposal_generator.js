/**
 * scripts/lib/proposal_generator.js
 * Auto-Generate Professional HTML Proposals
 *
 * Creates personalized proposals with:
 *   - Executive summary from audit data
 *   - Demo site link + key improvements
 *   - 3 package tiers with pricing
 *   - Payment CTA button
 *   - Timeline and terms
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PACKAGES } from './payment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');
const PROPOSALS_DIR = path.join(ROOT_DIR, 'proposals');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');

if (!fs.existsSync(PROPOSALS_DIR)) {
  fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
}

function loadAgencyConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return cfg.agency || {};
  } catch {
    return {};
  }
}

// ─── Proposal HTML Generator ─────────────────────────────────────────────────
/**
 * Generate a professional HTML proposal for a lead.
 *
 * @param {object} opts
 * @param {object} opts.prospect - Full prospect/audit data
 * @param {string} opts.demoUrl - Live demo URL
 * @param {string} opts.paymentUrl - Payment link (optional)
 * @param {string} opts.bookingLink - Meeting booking link
 * @param {string} opts.recommendedPackage - 'starter' | 'growth' | 'premium'
 * @returns {{proposalPath: string, slug: string}}
 */
export function generateProposal(opts = {}) {
  const { prospect, demoUrl, paymentUrl, bookingLink, recommendedPackage = 'growth' } = opts;
  const agency = loadAgencyConfig();

  const {
    businessName = 'Your Business',
    slug = 'proposal',
    city = 'Local Area',
    ownerName = 'Business Owner',
    niche = 'trade',
    overallScore = 4,
    dimensions = {},
    biggestOpportunity = ''
  } = prospect || {};

  const agencyName = agency.name || 'Apex AI Web Studio';
  const agencyEmail = agency.email || 'hello@youragency.com';
  const agencyPhone = agency.phone || '(555) 234-5678';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build improvement bullets from audit
  const improvements = [];
  if (dimensions.mobile?.problems?.[0]) improvements.push({ icon: '📱', text: `Mobile: ${dimensions.mobile.quickFix || dimensions.mobile.problems[0]}` });
  if (dimensions.speed?.problems?.[0]) improvements.push({ icon: '⚡', text: `Speed: ${dimensions.speed.quickFix || dimensions.speed.problems[0]}` });
  if (dimensions.seo?.problems?.[0]) improvements.push({ icon: '🔍', text: `SEO: ${dimensions.seo.quickFix || dimensions.seo.problems[0]}` });
  if (dimensions.conversion?.problems?.[0]) improvements.push({ icon: '📈', text: `Conversion: ${dimensions.conversion.quickFix || dimensions.conversion.problems[0]}` });
  if (dimensions.design?.problems?.[0]) improvements.push({ icon: '🎨', text: `Design: ${dimensions.design.quickFix || dimensions.design.problems[0]}` });

  if (improvements.length === 0) {
    improvements.push(
      { icon: '📱', text: 'Mobile-responsive design with tap-to-call functionality' },
      { icon: '⚡', text: 'Optimized load speed under 3 seconds' },
      { icon: '🔍', text: 'Local SEO setup targeting your city keywords' },
      { icon: '📈', text: 'Conversion-focused layout with clear CTAs' }
    );
  }

  const improvementsHtml = improvements.map(i =>
    `<div style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
      <span style="font-size: 20px; flex-shrink: 0;">${i.icon}</span>
      <span style="font-size: 14px; color: #475569; line-height: 1.5;">${i.text}</span>
    </div>`
  ).join('\n');

  // Package cards
  const packageCards = Object.entries(PACKAGES).map(([key, pkg]) => {
    const isRecommended = key === recommendedPackage;
    const borderColor = isRecommended ? '#6366f1' : '#e2e8f0';
    const bgColor = isRecommended ? '#f8f7ff' : '#ffffff';
    const badge = isRecommended ? '<div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">★ Recommended</div>' : '';

    const deliverablesList = pkg.deliverables.map(d =>
      `<div style="display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; color: #475569;">
        <span style="color: #10b981; font-weight: 700;">✓</span> ${d}
      </div>`
    ).join('\n');

    return `<div style="flex: 1; min-width: 260px; background: ${bgColor}; border: 2px solid ${borderColor}; border-radius: 16px; padding: 28px; ${isRecommended ? 'transform: scale(1.02); box-shadow: 0 8px 32px rgba(99,102,241,0.15);' : ''}">
      ${badge}
      <h3 style="font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">${pkg.name}</h3>
      <div style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 12px 0 4px;">$${pkg.price.toLocaleString()}</div>
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 16px;">50% deposit: $${pkg.deposit.toLocaleString()} upfront</div>
      <p style="font-size: 13px; color: #64748b; margin-bottom: 16px; line-height: 1.5;">${pkg.description}</p>
      <div style="margin-bottom: 16px;">${deliverablesList}</div>
      <div style="font-size: 12px; color: #94a3b8; padding-top: 12px; border-top: 1px solid #e2e8f0;">📅 Timeline: ${pkg.timeline}</div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Website Proposal for ${businessName} — ${agencyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 24px; }
    @media print { body { background: white; } .container { padding: 0; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 48px; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0;">
      <div>
        <div style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">${agencyName}</div>
        <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">${agencyEmail} · ${agencyPhone}</div>
      </div>
      <div style="text-align: right; font-size: 13px; color: #94a3b8;">
        <div>Proposal Date: ${date}</div>
        <div>Prepared for: ${ownerName}</div>
      </div>
    </div>

    <!-- Title -->
    <div style="text-align: center; margin-bottom: 48px;">
      <div style="display: inline-block; background: linear-gradient(135deg, #ede9fe, #e0e7ff); padding: 6px 20px; border-radius: 20px; font-size: 12px; font-weight: 600; color: #6366f1; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 16px;">Website Redesign Proposal</div>
      <h1 style="font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; margin-bottom: 12px;">A Modern Website for ${businessName}</h1>
      <p style="font-size: 16px; color: #64748b; max-width: 600px; margin: 0 auto;">A custom-built, mobile-first web presence designed to convert ${city} visitors into customers.</p>
    </div>

    <!-- Current Score -->
    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; margin-bottom: 32px; text-align: center;">
      <div style="font-size: 13px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px;">Current Website Audit Score</div>
      <div style="font-size: 64px; font-weight: 800; color: ${overallScore <= 4 ? '#ef4444' : overallScore <= 6 ? '#f59e0b' : '#10b981'};">${overallScore}<span style="font-size: 24px; color: #94a3b8;">/10</span></div>
      ${biggestOpportunity ? `<p style="font-size: 14px; color: #64748b; max-width: 600px; margin: 16px auto 0; line-height: 1.6;">${biggestOpportunity}</p>` : ''}
    </div>

    <!-- Live Demo -->
    ${demoUrl ? `
    <div style="background: linear-gradient(135deg, #1e1b4b, #312e81); border-radius: 16px; padding: 32px; margin-bottom: 32px; text-align: center; color: white;">
      <div style="font-size: 13px; font-weight: 600; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px;">Your Live Demo Is Ready</div>
      <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 16px;">We already built a preview for ${businessName}</h2>
      <a href="${demoUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 20px rgba(99,102,241,0.4);">👉 View Your Live Demo</a>
    </div>` : ''}

    <!-- Key Improvements -->
    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; margin-bottom: 32px;">
      <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 20px;">Key Improvements Included</h2>
      ${improvementsHtml}
    </div>

    <!-- Packages -->
    <div style="margin-bottom: 32px;">
      <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 20px; text-align: center;">Choose Your Package</h2>
      <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
        ${packageCards}
      </div>
    </div>

    <!-- Payment Options: UPI, PayPal Global & Direct Bank Wire -->
    <div style="background: white; border: 2px solid #10b981; border-radius: 20px; padding: 36px; text-align: center; margin-bottom: 32px; box-shadow: 0 10px 30px rgba(16,185,129,0.1);">
      <div style="display: inline-block; background: #ecfdf5; color: #059669; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">
        ⚡ Instant Deposit Activation (Global & India)
      </div>
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">Pay 50% Deposit & Confirm Subscription</h2>
      <p style="font-size: 14px; color: #64748b; max-width: 580px; margin: 0 auto 24px;">
        Pay securely via UPI (India), PayPal (International / US / UK / Global), or Direct Bank Wire. Send your confirmation screenshot on WhatsApp for instant onboarding.
      </p>

      <div style="display: flex; justify-content: center; align-items: stretch; gap: 24px; flex-wrap: wrap; margin-bottom: 28px; text-align: left;">
        <!-- Option 1: UPI & QR Code -->
        <div style="flex: 1; min-width: 250px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px;">
          <div style="font-size: 12px; font-weight: 700; color: #059669; text-transform: uppercase; margin-bottom: 8px;">Option 1: UPI (GPay / PhonePe / Paytm)</div>
          <div style="text-align: center; margin: 12px 0;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`upi://pay?pa=6202442690@jio&pn=Piyush%20Singh&am=${PACKAGES[recommendedPackage]?.depositINR || 62500}&cu=INR&tn=${encodeURIComponent(businessName + ' Website Deposit')}`)}" alt="UPI QR Code" style="width: 160px; height: 160px; display: inline-block; border-radius: 8px;">
          </div>
          <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">UPI ID</div>
          <div style="font-size: 15px; font-weight: 800; color: #0f172a; font-family: monospace; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-top: 4px;">6202442690@jio</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 6px;">Payee: <strong>Piyush Singh</strong></div>
          <div style="font-size: 16px; font-weight: 800; color: #059669; margin-top: 8px;">₹${(PACKAGES[recommendedPackage]?.depositINR || 62500).toLocaleString('en-IN')}</div>
        </div>

        <!-- Option 2: PayPal Global -->
        <div style="flex: 1; min-width: 250px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="font-size: 12px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 8px;">Option 2: PayPal Global (USD / Credit Card)</div>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 16px;">
              Ideal for international clients paying via Credit Card, Debit Card, or PayPal Balance in USD.
            </p>
            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Deposit Amount</div>
            <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 4px 0 16px;">
              $${(PACKAGES[recommendedPackage]?.deposit || 750)} <span style="font-size: 13px; color: #64748b; font-weight: normal;">USD</span>
            </div>
          </div>
          <a href="https://paypal.me/signhify/${(PACKAGES[recommendedPackage]?.deposit || 750)}USD" target="_blank" style="display: block; text-align: center; background: #0070ba; color: white; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(0,112,186,0.3);">
            💳 Pay via PayPal.me/signhify
          </a>
        </div>

        <!-- Option 3: Direct Bank Wire -->
        <div style="flex: 1; min-width: 250px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px;">
          <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 8px;">Option 3: Direct Bank Wire (IMPS / NEFT)</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Account Holder:</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">Piyush Raj Singh</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Account Number:</div>
          <div style="font-size: 14px; font-weight: 800; font-family: monospace; color: #0f172a; background: #fff; padding: 4px 8px; border-radius: 6px; border: 1px dashed #cbd5e1; display: inline-block;">000521712140642</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 8px;">IFSC Code:</div>
          <div style="font-size: 14px; font-weight: 800; font-family: monospace; color: #0f172a; background: #fff; padding: 4px 8px; border-radius: 6px; border: 1px dashed #cbd5e1; display: inline-block;">JIOP0000001</div>
        </div>
      </div>

      <!-- WhatsApp Screenshot Verification Button -->
      <div style="max-width: 480px; margin: 0 auto;">
        <a href="https://wa.me/916202442690?text=${encodeURIComponent(`Hi Piyush, I have completed the website deposit payment for ${businessName}. Attached is my payment screenshot for confirmation.`)}" target="_blank" style="display: flex; align-items: center; justify-content: center; gap: 8px; background: #25D366; color: white; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(37,211,102,0.4);">
          <span>📲 Submit Screenshot on WhatsApp (+91 6202442690)</span>
        </a>
        <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
          🔒 Subscription and project kickoff confirmed immediately upon screenshot receipt.
        </div>
      </div>
    </div>

    <!-- Booking / Alternative CTA -->
    ${bookingLink ? `
    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 32px;">
      <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Want to review the demo with us first?</h3>
      <p style="font-size: 13px; color: #64748b; margin-bottom: 16px;">Schedule a quick 10-minute walkthrough call with our design team.</p>
      <a href="${bookingLink}" target="_blank" style="display: inline-block; background: white; border: 2px solid #6366f1; color: #6366f1; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; font-size: 14px;">📅 Pick a Time on Calendar</a>
    </div>` : ''}

    <!-- Terms -->
    <div style="font-size: 12px; color: #94a3b8; line-height: 1.6; text-align: center;">
      <p><strong>Terms:</strong> 50% deposit required to begin. Remaining 50% due upon live domain launch. All designs include 2 rounds of revisions. This proposal is valid for 30 days.</p>
      <p style="margin-top: 8px;">${agencyName} · ${agencyEmail} · +91 6202442690</p>
    </div>
  </div>
</body>
</html>`;

  const proposalPath = path.join(PROPOSALS_DIR, `${slug}.html`);
  fs.writeFileSync(proposalPath, html, 'utf-8');
  console.log(`  📄 Proposal generated: proposals/${slug}.html`);

  return { proposalPath, slug, relativePath: `/proposals/${slug}.html` };
}

// ─── CLI Test ─────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('\n📄 Proposal Generator Test\n');
  const result = generateProposal({
    prospect: {
      businessName: "Rossi's Pizzeria",
      slug: 'rossis-pizzeria',
      city: 'Austin, TX',
      ownerName: 'Marco Rossi',
      niche: 'restaurant',
      overallScore: 3,
      dimensions: {
        mobile: { score: 2, problems: ['Not mobile responsive'], quickFix: 'Add responsive breakpoints' },
        speed: { score: 4, problems: ['Slow image loading'], quickFix: 'Compress and lazy-load images' },
        seo: { score: 3, problems: ['Missing meta description'], quickFix: 'Add targeted meta tags' },
        conversion: { score: 2, problems: ['No click-to-call'], quickFix: 'Add tap-to-call CTA' },
        design: { score: 3, problems: ['Outdated layout'], quickFix: 'Modern single-column design' }
      },
      biggestOpportunity: "A mobile-first redesign could capture 30% more walk-in traffic from Austin-area search."
    },
    demoUrl: 'https://demo.agency.com/rossis-pizzeria',
    bookingLink: 'https://cal.com/youragency/discovery-call',
    recommendedPackage: 'growth'
  });
  console.log('✅ Result:', result);
}
