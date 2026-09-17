import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getPublicDemoUrl } from './lib/config_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTREACH_DIR = path.join(__dirname, '..', 'outreach');
const PROSPECTS_DIR = path.join(__dirname, '..', 'prospects');

if (!fs.existsSync(OUTREACH_DIR)) {
  fs.mkdirSync(OUTREACH_DIR, { recursive: true });
}

/**
 * Generates full multi-touch personalized outreach copy
 */
export function generateOutreachSequence(prospectData, demoUrl = null) {
  const { businessName, slug, city, ownerName, ownerEmail, phone, dimensions, biggestOpportunity, overallScore } = prospectData;
  const firstName = ownerName && ownerName !== 'Business Owner' ? ownerName.split(' ')[0] : 'there';
  const effectiveDemoUrl = demoUrl || getPublicDemoUrl(slug);

  console.log(`\n✍️ Drafting personalized outreach for [${businessName}] (Owner: ${ownerName || 'Unknown'})...`);

  // Extract top issues (preferring real visual audit if captured)
  const visualIssue = prospectData.visualAudit?.layoutIssues?.[0] || null;
  const mobileIssue = visualIssue || dimensions?.mobile?.problems?.[0] || 'The site is not optimized for mobile taps and quick calling.';
  const conversionIssue = dimensions?.conversion?.problems?.[0] || 'Phone numbers are not tap-to-call on smartphones.';

  const socialSummary = prospectData.socialProfiles
    ? Object.entries(prospectData.socialProfiles).filter(([k, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';

  const outreachMarkdown = `# Outreach Sequence: ${businessName}

**Prospect Details:**
- **Business**: ${businessName}
- **Owner / Decision-Maker**: ${ownerName || 'Business Owner'}
- **Target Email**: ${ownerEmail || 'Pending verification'}
- **Phone**: ${phone || 'N/A'}
- **City / Market**: ${city}
- **Audit Overall Score**: ${overallScore || 4}/10
- **Visual Responsiveness**: ${prospectData.visualAudit ? (prospectData.visualAudit.hasHorizontalScroll ? '⚠️ Mobile Horizontal Overflow Detected' : '✅ Mobile Layout Audited') : 'Standard Heuristic'}
${socialSummary ? `- **Social Profiles**: ${socialSummary}\n` : ''}- **Live Demo Link**: ${effectiveDemoUrl}

---

## 📧 Touch 1: Cold Email (Value-First / Gift Demo)
**Subject**: Quick redesign idea for ${businessName}

Hi ${firstName},

I was looking at local businesses in ${city} and really love what ${businessName} has built in our community.

While checking out your website, I noticed a couple of quick things that might be costing you calls and bookings from mobile visitors:
1. **Mobile Experience**: ${mobileIssue}
2. **Lead Capture**: ${conversionIssue}

To show you what's possible, I put together a quick, modern, mobile-first preview of what a refreshed site for ${businessName} could look like:

👉 **Live Interactive Demo**: ${effectiveDemoUrl}

No pressure or sales pitch at all — if you like the direction, I'd love to chat for 5 minutes. If not, please feel free to keep the ideas and feedback!

Wishing you a fantastic week ahead.

Best regards,

**Piyush / Apex AI Web Studio**  
*Website Redesign & Conversion Specialists*  
[Your Phone / Portfolio Link]  
[Registered Agency Physical Address Placeholder, ${city}]  

*(Reply STOP and I will never follow up again.)*

---

## 💬 Touch 2: LinkedIn / Instagram DM
**Target Platform**: ${prospectData.socialProfiles?.linkedin ? `LinkedIn (${prospectData.socialProfiles.linkedin})` : `LinkedIn (Owner: ${ownerName})`} or ${prospectData.socialProfiles?.instagram ? `Instagram (${prospectData.socialProfiles.instagram})` : `Instagram (@${slug})`}

> "Hey ${firstName}! Big fan of what you guys are doing with ${businessName} here in ${city}. I specialize in upgrading local business websites and actually built a quick modern mobile preview of yours to show what's possible — mind if I drop the link over? Totally zero pressure, just thought it might be useful! 🙂"

---

## 🔁 Touch 3: Polite Follow-Up (Sent 3–4 Days Later)
**Subject**: Re: Quick redesign idea for ${businessName}

Hi ${firstName},

Just floating this back to the top of your inbox in case it got buried! 

Here is the modern preview link again:  
👉 ${effectiveDemoUrl}

If the timing isn't right or you're completely happy with your current setup, no worries whatsoever — I'll leave it here.

Have a great rest of your week!

Best,  
**Piyush**  
*(Reply STOP to opt out)*

---

## 📞 Live Call & Closing Cheat Sheet (5-Step Framework)

1. **The Icebreaker & Goal Discovery**:
   - *"Thanks for hopping on, ${firstName}! Before I pull up the screen, what is the #1 thing you wish your current website was doing better for ${businessName}?"*
   - *(Listen and take notes: More phone calls? More bookings? Modern trust?)*

2. **The Demo Reveal**:
   - *"Got it. Here is the modern version I scaffolded for you..."* [Share screen with demo].

3. **Problem → Solution Contrast**:
   - *"The main thing I addressed is [their goal]. On the current site, ${mobileIssue.toLowerCase()} Here, it's instant tap-to-call with high-trust local badges."*

4. **Timeline & Action**:
   - *"I can have this fully customized with your real photos, staff bios, and domain in about 5 business days. Would you like me to get this set up for you?"*

5. **Package Selection & Deposit**:
   - **Starter Package ($750)**: One-page modern responsive site, tap-to-call, speed optimized.
   - **Growth Package ($1,500)**: Multi-page site, contact forms, local Google SEO setup.
   - **Payment Protocol**: 50% upfront deposit to kick off production, 50% upon live domain launch.

---
*Draft generated autonomously by AI Website Agency on ${new Date().toLocaleDateString()}*
`;

  const outreachFile = path.join(OUTREACH_DIR, `${slug}.md`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      fs.writeFileSync(outreachFile, outreachMarkdown, 'utf-8');
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      const waitTill = Date.now() + 150;
      while (Date.now() < waitTill) {}
    }
  }

  console.log(`✅ Outreach drafts generated successfully!`);
  console.log(`📁 File: [outreach/${slug}.md]`);

  return {
    slug,
    outreachPath: outreachFile
  };
}

// Direct CLI test execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const slug = process.argv[2] || "rossis-pizzeria";
  const prospectFile = path.join(PROSPECTS_DIR, `${slug}.json`);
  let prospectData;
  if (fs.existsSync(prospectFile)) {
    prospectData = JSON.parse(fs.readFileSync(prospectFile, 'utf-8'));
  } else {
    prospectData = {
      businessName: "Rossi's Pizzeria",
      slug: "rossis-pizzeria",
      city: "Austin, TX",
      ownerName: "Marco Rossi",
      ownerEmail: "marco@rossispizza.com",
      overallScore: 4
    };
  }
  generateOutreachSequence(prospectData);
}
