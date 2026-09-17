/**
 * scripts/lib/telegram_notifier.js
 * Real-Time Agency Telegram Event Dispatcher
 *
 * Dispatches instant, beautifully formatted alerts directly to Telegram for:
 *   1. Data Scraping & Lead Generation (Google Maps / OSM)
 *   2. Demo Website Scaffolded
 *   3. Outbound AI Voice Calls & Meetings Booked
 *   4. Proposals Delivered (with direct UPI payment & WhatsApp verification links)
 *   5. Client Deals Closed Won (Deposit Secured)
 *   6. Complete 24/7 Autopilot Workflow Run Cycles
 *
 * ponytail: zero npm deps, stdlib fetch only
 */
import dns from 'dns';
import { loadAppConfig } from './config_loader.js';
import { buildPdfDocument } from './pdf_generator.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

/**
 * Core send helper for text messages
 */
export async function sendTelegramAlert(htmlMessage, retries = 2) {
  const config = loadAppConfig();
  const botToken = config.notifications?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config.notifications?.telegram?.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return false;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: htmlMessage,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        console.warn(`⚠️ Telegram dispatch HTTP ${res.status}: ${err.slice(0, 150)}`);
        if (attempt < retries) await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      return true;
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      console.warn(`⚠️ Telegram dispatch network error: ${err.message}`);
      return false;
    }
  }
  return false;
}

/**
 * Core send helper for document files (.md, .pdf, .json, .html, .txt)
 */
export async function sendTelegramDocument(filename, content, caption = '', retries = 2) {
  const config = loadAppConfig();
  const botToken = config.notifications?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config.notifications?.telegram?.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return false;
  }

  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const mimeType = isPdf ? 'application/pdf' : (filename.toLowerCase().endsWith('.json') ? 'application/json' : 'text/markdown');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const blob = new Blob([content], { type: mimeType });
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('document', blob, filename);
      if (caption) {
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
      }

      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
        method: 'POST',
        body: form
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        console.warn(`⚠️ Telegram document dispatch HTTP ${res.status}: ${err.slice(0, 150)}`);
        if (attempt < retries) await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      return true;
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      console.warn(`⚠️ Telegram document dispatch error: ${err.message}`);
      return false;
    }
  }
  return false;
}

/**
 * Deliver dual document package: both Markdown (.md) and PDF (.pdf)
 */
export async function sendTelegramReportPackage(opts = {}) {
  const {
    baseFilename,
    title = 'Apex AI Agency Report',
    subtitle = '',
    content = '',
    captionPrefix = 'Attached Report'
  } = opts;

  // 1. Deliver .md document
  const mdFilename = `${baseFilename}.md`;
  await sendTelegramDocument(mdFilename, content, `📄 <b>${captionPrefix} (Markdown):</b> <code>${mdFilename}</code>`);

  // Small delay to prevent rate congestion
  await new Promise(r => setTimeout(r, 600));

  // 2. Compile & Deliver .pdf document
  try {
    const pdfBuffer = buildPdfDocument({
      title,
      subtitle,
      author: 'Apex AI Web Studio',
      content
    });
    const pdfFilename = `${baseFilename}.pdf`;
    await sendTelegramDocument(pdfFilename, pdfBuffer, `📕 <b>${captionPrefix} (Official PDF):</b> <code>${pdfFilename}</code>`);
  } catch (err) {
    console.warn(`⚠️ PDF dispatch failed for ${baseFilename}: ${err.message}`);
  }
}

/**
 * 1. Data Scraping & Lead Generation Alert + Document File
 */
export async function notifyLeadsHarvested(leads = [], meta = {}) {
  if (!leads || leads.length === 0) return;
  const count = leads.length;
  const city = meta.city || leads[0]?.city || 'Target Market';
  const niche = meta.niche || leads[0]?.niche || 'Local Businesses';
  const dateStr = new Date().toISOString().split('T')[0];

  const leadList = leads.slice(0, 5).map(l => {
    const phone = l.phone ? ` • 📞 <code>${l.phone}</code>` : '';
    const rating = l.rating ? ` (${l.rating}⭐)` : '';
    return `• 🏢 <b>${l.businessName}</b>${rating}${phone}\n   <i>${l.opportunityHook || 'No modern mobile website listed'}</i>`;
  }).join('\n\n');

  const extra = count > 5 ? `\n<i>...and ${count - 5} more qualified leads</i>` : '';

  const message = `🚜 <b>NEW LEADS HARVESTED FROM GOOGLE MAPS</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 <b>Category:</b> ${niche.toUpperCase()} in ${city}
📥 <b>Qualified Leads:</b> ${count} high-opportunity prospects

${leadList}${extra}

⚡ <i>Full scraped dataset document attached below.</i>`;

  await sendTelegramAlert(message);

  // Generate & deliver full scraped leads markdown document
  const docRows = leads.map((l, idx) => {
    return `### ${idx + 1}. ${l.businessName}
- **Category / Niche:** ${l.niche || niche}
- **City / Market:** ${l.city || city}
- **Address:** ${l.address || 'Local market'}
- **Phone:** ${l.phone || 'N/A'}
- **Rating:** ${l.rating || 'N/A'} ⭐ (${l.reviewCount || 0} reviews)
- **Current URL:** ${l.url || 'None (No website detected)'}
- **Opportunity Hook:** ${l.opportunityHook || 'Needs mobile-first conversion website'}
- **Source:** ${l.source || 'google_places'}
`;
  }).join('\n---\n\n');

  const docContent = `# Data Scraping & Lead Generation Report
**Generated:** ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST  
**Target:** ${niche.toUpperCase()} in ${city}  
**Total Leads Discovered:** ${count}  

---

${docRows}

---
*Report auto-generated by Apex AI Web Studio Auto-Harvester.*
`;

  const docFilename = `leads_${niche.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${dateStr}`;
  return await sendTelegramReportPackage({
    baseFilename: docFilename,
    title: `Leads Discovery Report — ${niche.toUpperCase()}`,
    subtitle: `${count} Qualified Prospects in ${city}`,
    content: docContent,
    captionPrefix: 'Scraped Leads'
  });
}

/**
 * 2. Demo Website Built Alert + Document (MD + PDF)
 */
export async function notifyDemoGenerated(prospect, demoUrl) {
  if (!prospect) return;
  const message = `🎨 <b>MODERN DEMO SITE GENERATED</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 <b>Business:</b> ${prospect.businessName} (${prospect.city} • ${prospect.niche})
🌐 <b>Live Demo:</b> ${demoUrl || `http://localhost:3030/demos/${prospect.slug}/index.html`}
⭐ <b>Rating:</b> ${prospect.rating || 4.5} stars (${prospect.reviewCount || 10} reviews)
📱 <b>Phone:</b> <code>${prospect.phone || 'N/A'}</code>

✉️ <i>Hyper-personalized 3-touch outreach sequence drafted. Documents attached below.</i>`;

  await sendTelegramAlert(message);

  const docContent = `# Demo Website Specification — ${prospect.businessName}
**Generated:** ${new Date().toISOString()}  
**Business Name:** ${prospect.businessName}  
**City:** ${prospect.city}  
**Niche:** ${prospect.niche}  
**Phone:** ${prospect.phone || 'N/A'}  
**Live Demo Preview:** ${demoUrl || `http://localhost:3030/demos/${prospect.slug}/index.html`}  

## Built Features & Optimizations
1. Mobile-First Responsive Layout with Fixed Tap-To-Call CTA
2. Speed Optimization: Sub-2.0s DOM Load Time
3. Local SEO Meta Tags & Schema.org JSON-LD
4. Conversion Architecture: Direct booking & lead capture form
5. Hero Section tailored for ${prospect.niche} inquiries in ${prospect.city}
`;

  return await sendTelegramReportPackage({
    baseFilename: `demo_${prospect.slug}`,
    title: `Demo Site Specification — ${prospect.businessName}`,
    subtitle: `${prospect.city} · ${prospect.niche}`,
    content: docContent,
    captionPrefix: 'Demo Site Brief'
  });
}

/**
 * 3. Meeting Scheduled / Voice Call Alert + Document (MD + PDF)
 */
export async function notifyMeetingScheduled(prospect, details = {}) {
  if (!prospect) return;
  const message = `📅 <b>MEETING / DEMO REVIEW SCHEDULED!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 <b>Client:</b> ${prospect.businessName}
👤 <b>Decision Maker:</b> ${prospect.ownerName || 'Owner'}
📞 <b>Phone:</b> <code>${prospect.phone || 'N/A'}</code>
📧 <b>Email:</b> ${prospect.ownerEmail || 'N/A'}
🎙️ <b>Channel:</b> AI Voice Pre-Sales Consultant
📋 <b>Notes:</b> ${details.summary || 'Agreed to review demo and walkthrough proposal'}

🔗 <a href="https://cal.com/piyush-usctna/15min">View Cal.com Booking Calendar</a>`;

  await sendTelegramAlert(message);

  const docContent = `# Discovery Meeting & Demo Review Brief — ${prospect.businessName}
**Scheduled Time:** ${new Date().toISOString()}  
**Client:** ${prospect.businessName}  
**Contact:** ${prospect.ownerName || 'Owner'}  
**Phone:** ${prospect.phone || 'N/A'}  
**Email:** ${prospect.ownerEmail || 'N/A'}  
**Booking Link:** https://cal.com/piyush-usctna/15min  

## Call Notes & Pre-Discovery
${details.summary || 'Client agreed to live demo walkthrough and proposal review.'}

## Target Proposal Package
- Recommended Package: Growth ($1,500 Total / $750 50% Deposit)
- Payment Rails: UPI (6202442690@jio), PayPal (paypal.me/signhify), Bank Wire (000521712140642)
`;

  return await sendTelegramReportPackage({
    baseFilename: `meeting_${prospect.slug}`,
    title: `Meeting & Demo Review Brief — ${prospect.businessName}`,
    subtitle: prospect.ownerName || 'Decision Maker',
    content: docContent,
    captionPrefix: 'Meeting Brief'
  });
}

/**
 * 4. Client Proposal Dispatched Alert + Document Files (MD + PDF)
 */
export async function notifyProposalDispatched(prospect, opts = {}) {
  if (!prospect) return;
  const pkg = opts.packageTier || 'growth';
  const amountUSD = pkg === 'starter' ? 375 : (pkg === 'premium' ? 1500 : 750);
  const amountINR = (amountUSD * 83.33).toLocaleString('en-IN', { maximumFractionDigits: 0 });

  const message = `💼 <b>CLOSING PROPOSAL DISPATCHED</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 <b>Prospect:</b> ${prospect.businessName}
📦 <b>Package:</b> ${pkg.toUpperCase()} (50% Deposit: ₹${amountINR} / $${amountUSD} USD)
📄 <b>Proposal Link:</b> http://localhost:3030/proposals/${prospect.slug}.html

💳 <b>PAYMENT DETAILS INVOICED:</b>
1. <b>UPI (India):</b> <code>6202442690@jio</code> (Piyush Singh)
2. <b>PayPal Global:</b> <a href="https://paypal.me/signhify/${amountUSD}USD">paypal.me/signhify/${amountUSD}USD</a>
3. <b>Direct Bank Wire:</b> A/C <code>000521712140642</code> · IFSC <code>JIOP0000001</code>
📲 <b>WhatsApp Verification:</b> <a href="https://wa.me/916202442690?text=Hi%20Piyush,%20I%20have%20completed%20payment%20for%20${encodeURIComponent(prospect.businessName)}">+91 6202442690</a>

<i>Formal proposal documents (MD & PDF) delivered below.</i>`;

  await sendTelegramAlert(message);

  const docContent = `# Client Website Proposal — ${prospect.businessName}
**Date:** ${new Date().toLocaleDateString()}  
**Client:** ${prospect.businessName} (${prospect.city})  
**Package:** ${pkg.toUpperCase()}  
**Contract Value:** $${amountUSD * 2} USD  
**50% Deposit Required:** ₹${amountINR} ($${amountUSD} USD)  

---

## Scope of Deliverables
1. Custom Modern Responsive Website on Custom Domain with SSL
2. High-converting Mobile Architecture with Tap-to-Call
3. Speed Optimization (< 2.0s page load)
4. Local SEO Foundation & Google Business Profile Integration
5. Contact Form & Lead Capture Routing

---

## Approved Payment Methods
- **UPI (GPay / PhonePe / Paytm):** \`6202442690@jio\` (Piyush Singh)
- **PayPal Global (USD / Credit Card):** https://paypal.me/signhify/${amountUSD}USD
- **Direct Bank Wire:**
  - Account Number: \`000521712140642\`
  - IFSC Code: \`JIOP0000001\`
  - Account Holder: **Piyush Raj Singh**

---

## Instant Verification & Kickoff
Submit deposit screenshot to WhatsApp: **+91 6202442690**  
Direct WhatsApp Link: https://wa.me/916202442690?text=Deposit%20Confirmed%20for%20${encodeURIComponent(prospect.businessName)}
`;

  return await sendTelegramReportPackage({
    baseFilename: `proposal_${prospect.slug}`,
    title: `Website Proposal — ${prospect.businessName}`,
    subtitle: `${pkg.toUpperCase()} Package ($${amountUSD * 2} USD)`,
    content: docContent,
    captionPrefix: 'Proposal Document'
  });
}

/**
 * 5. Client Closed Won Alert (Deposit Received) + Document Files (MD + PDF)
 */
export async function notifyDealClosedWon(prospect, opts = {}) {
  if (!prospect) return;
  const depositPaid = opts.depositPaid || 750;
  const packageTier = opts.packageTier || 'growth';
  const totalContract = depositPaid * 2;
  const depositINR = (depositPaid * 83.33).toLocaleString('en-IN', { maximumFractionDigits: 0 });

  const message = `🎉 🏆 <b>CLIENT DEAL CLOSED WON!</b> 🏆 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 <b>Client:</b> <b>${prospect.businessName}</b>
📦 <b>Package:</b> ${packageTier.toUpperCase()}
💰 <b>50% Deposit Secured:</b> ₹${depositINR} ($${depositPaid} USD)
💵 <b>Total Contract Value:</b> $${totalContract} USD
👤 <b>Contact:</b> ${prospect.ownerName || 'Owner'} (${prospect.phone || 'Phone verified'})

📁 <b>Kickoff Deliverables Generated:</b>
• <code>clients/${prospect.slug}/kickoff_brief.md</code>
• <code>clients/${prospect.slug}/onboarding.json</code>

🚀 <i>Client Kickoff & Onboarding Documents (MD & PDF) attached below!</i>`;

  await sendTelegramAlert(message);

  const docContent = `# Client Kickoff & Onboarding Package — ${prospect.businessName}
**Status:** CLOSED_WON  
**Date Closed:** ${new Date().toISOString()}  
**Client:** ${prospect.businessName} (${prospect.city})  
**Package:** ${packageTier.toUpperCase()}  
**Deposit Secured:** ₹${depositINR} ($${depositPaid} USD)  
**Total Value:** $${totalContract} USD  

---

## Onboarding Checklist
- [x] Deposit Payment Verified via WhatsApp (+91 6202442690)
- [ ] Welcome Email with Brand Assets Request Sent
- [ ] Domain DNS Configuration Received
- [ ] Final Copy & Content Review Completed
- [ ] Mobile & Speed QA Pass
- [ ] Live Domain Deployment & SSL Active
- [ ] Remaining 50% Final Payment Received

---
*Generated by Apex AI Web Studio Autonomous Closing Engine.*
`;

  return await sendTelegramReportPackage({
    baseFilename: `closed_deal_${prospect.slug}`,
    title: `Client Kickoff & Onboarding — ${prospect.businessName}`,
    subtitle: `${packageTier.toUpperCase()} Package ($${totalContract} USD)`,
    content: docContent,
    captionPrefix: 'Closed Deal Onboarding'
  });
}
