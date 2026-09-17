# SESSION_CONTEXT.MD — AI Website Agency System State

> **System Name:** Apex AI Web Studio — Autonomous "Show Don't Tell" Website Redesign Agency  
> **Workspace Root:** `d:\website_agency`  
> **Last Updated:** 2026-09-17  
> **Operational Status:** 🟢 Production Ready — Autonomous 24/7 Autopilot via GitHub Actions Cloud & Cloudflare Edge Cron (Runs continuously even with PC turned off)

---

## 1. Executive Summary & Agency Philosophy

Apex AI Web Studio operates on a **"Show Don't Tell"** consultative model for local business website redesigns. Instead of cold-pitching generic marketing promises, the system:
1. **Auto-Harvester:** Discovers local businesses on Google Maps / OpenStreetMap operating with **no website** or **outdated/unresponsive websites**.
2. **Strict Real Email Verification:** Enforces that **ONLY clients with verified, publicly published inquiry emails** are captured into the pipeline CRM. Zero synthetic or guessed `contact@` addresses permitted.
3. **Audit Engine:** Conducts a rigorous **5-Point Technical & Visual Audit** (Design, Mobile Responsiveness, Page Speed, SEO & Discoverability, Conversion Architecture).
4. **Demo Generator:** Auto-scaffolds a **bespoke, modern, high-converting one-page demo website** tailored specifically to the prospect's niche and branding.
5. **Outreach Drafter:** Identifies verified public decision-makers and drafts a hyper-personalized **3-touch outreach sequence** with embedded demo links, actionable fixes, and registered contact details.
6. **Cold Email Engine:** Dispatches personalized outreach leading with the pre-built live demo site and 2 concrete fixes via Gmail SMTP / Resend API.
7. **AI Voice Cold-Calling Engine:** Places conversational AI phone calls to business owners via Pipecat / Vapi framework, handles objections, and checks calendar availability.
8. **Client Closing Engine:** Auto-generates **custom interactive proposals** ($750 Starter, $1,500 Growth, $3,000 Premium) with embedded Stripe, UPI, PayPal deposit checkout links.
9. **Automated Onboarding:** Upon deposit receipt, transitions lead to `CLOSED_WON` and auto-scaffolds client kickoff briefs and onboarding packages.
10. **24/7 Autopilot Daemon:** Orchestrates the entire lifecycle continuously via GitHub Actions workflows (every 2 hours) and Cloudflare Workers cron triggers — **runs even when your PC is off**.
11. **Comprehensive Telegram Reporting:** Delivers an exhaustive workflow execution report (formatted Telegram HTML text + dual Markdown & PDF audit packages) after **every single automated cycle**.

### Hard Rules & Compliance Safeguards
- **Zero Falsification (Strictly Enforced):** No fake metrics, artificial review counts, or simulated closed-won deals. Revenue is calculated strictly from confirmed, webhook-verified client deposit payments (`$0.00 USD` until an authentic deposit is received).
- **Strict Public Data Sourcing:** Only publicly advertised contact info is collected (no private/gated databases).
- **CAN-SPAM / GDPR Compliant:** Every message includes an explicit registered physical address (`Apex AI Web Studio, India`), direct contact channels, and a 1-click opt-out notice (`Reply STOP and I will never follow up again`). Maximum 2 follow-ups before marking `CLOSED_LOST`.
- **Calling Guardrails:** Voice calls strictly respect business hours (09:00 - 18:00 local time) and a 48-hour cooldown period between touches.

---

## 2. Completed Milestones & Full Autonomous Architecture

| Component | Status | Description |
|-----------|--------|-------------|
| **Truthful Financial Accounting** | ✅ Fixed | Zero-falsification enforced. Reset mock `CLOSED_WON` deals (`rossis-pizzeria`, `cool-heat-mechanical-systems-inc`). Revenue strictly sums genuine webhook-confirmed deposits (`$0 USD` currently). |
| **Email Guardrail & Template Engine** | ✅ Fixed | Removed all forbidden placeholder tokens (`[Your Phone...]`) from `outreach_generator.js` and all 13 `outreach/*.md` files. Added defensive sanitization in `email_sender.js`. |
| **Outreach Extraction Regex** | ✅ Fixed | Fixed heading emoji regex in `hermes.js` (`## 📧 Touch 1`) so drafted emails are cleanly parsed with subjects, live demo links, and concrete fixes. |
| **Instant Funnel Cascading** | ✅ Built | Upgraded `hermes.js` with multi-step cascading: newly audited leads immediately generate demo websites, draft outreach, and dispatch emails in the same 2-hour cycle. |
| **Live Lead Outreach** | ✅ Dispatched | Verified cold outreach emails sent via SMTP to all 4 qualified leads (`omni-dental-group`, `rossis-pizzeria`, `bright-smile-dental`, `vance-sterling-law`). |
| **Google Maps Auto-Harvester (`scripts/lib/google_maps_scraper.js`)** | ✅ Built | Multi-source local business search (Google Places API, OpenStreetMap Overpass API, SerpAPI, Jina). Real email verification and OSM niche validation active. |
| **AI Voice Cold-Calling Engine (`scripts/lib/voice_caller.js`)** | ✅ Built | Outbound voice calling integrating Vapi.ai, Bland.ai, Twilio, and a dual-agent conversational simulator with Cal.com booking tools. |
| **Autonomous Closing Engine (`scripts/lib/closing_engine.js`)** | ✅ Built | Auto-proposal delivery, Stripe/Razorpay 50% deposit links, payment webhook confirmation, and client kickoff package generation (`CLOSED_WON`). |
| **24/7 Autopilot Daemon (`scripts/autopilot.js`)** | ✅ Built | Master continuous loop orchestrating harvest → audit → demo → email → voice call → close → daily digest without human intervention. |
| **Hermes Orchestrator Integration (`scripts/hermes.js`)** | ✅ Upgraded | Central autonomous AI engine evaluating lead states and cascading pipeline actions end-to-end. |
| **Interactions Audit Log (`interactions.json`)** | ✅ Active | Structured event ledger recording timestamps, triggers, decisions, call transcripts, and live SMTP message IDs. |
| **Email Sending Engine (`scripts/lib/email_sender.js`)** | ✅ Active | Live Gmail SMTP (`rajpiyush092@gmail.com`) via Port 587 STARTTLS + Resend API fallback. Verified live message delivery. |
| **Dual PDF & MD Delivery Engine (`scripts/lib/pdf_generator.js`)** | ✅ Active | Zero-npm pure JS PDF 1.4 compiler generating formatted executive reports with truthful financial metrics attached to Telegram. |
| **Payment Rails (`scripts/lib/closing_engine.js`)** | ✅ Active | Multi-rail checkout: UPI (`6202442690@jio`), PayPal (`paypal.me/signhify`), Bank Wire (`JIOP0000001`), WhatsApp (`+91 6202442690`). |
| **6 Niche Templates (`templates/`)** | ✅ Built | Trade/Contractor, Medical/Dental, Restaurant/Cafe, Professional/Legal, Salon/Beauty, and Fitness/Gym. |
| **Master CLI (`scripts/agency_cli.js`)** | ✅ Active | 22 unified CLI commands including autopilot, scrape-maps, call, close-deal, and integrations. |
| **Automated Test Suite (`scripts/self_test.js`)** | ✅ Passing | 45/45 tests passing covering guardrails, pipeline integrity, payment evidence, and module loads. |

---

## 3. Architecture & File Catalog

```
d:\website_agency\
├── AGENTS.md                   # Core mission, ethical guardrails, pricing rules
├── CLAUDE.md                   # Developer & operator quick reference guide
├── SESSION_CONTEXT.MD          # Complete session context & system state (This File)
├── config.json                 # Base agency configuration
├── config.local.json           # Local development secrets (git-ignored)
├── package.json                # Project dependencies & npm scripts (type: module)
├── pipeline.json               # CRM database tracking prospect lifecycle & metadata (10 prospects)
├── interactions.json           # Audit log of all autonomous and manual outreach actions
├── wrangler.toml               # Cloudflare Workers config (D1, KV, cron)
├── public/
│   ├── index.html              # Dark-mode agency web dashboard UI
│   ├── app.js                  # Frontend SPA controller
│   ├── styles.css              # Custom CSS design system
│   └── demos/                  # Public demo mirrors for GitHub Pages / Cloudflare
├── templates/                  # Production HTML5 demo site templates
│   ├── trade_contractor.html   # Plumbers, electricians, HVAC, roofers, landscapers
│   ├── medical_dental.html     # Dentists, clinics, chiropractors, medspas
│   ├── restaurant_cafe.html    # Restaurants, bistros, pizzerias, cafes
│   ├── professional_legal.html # Law firms, CPAs, wealth managers, consultancies
│   ├── salon_beauty.html       # Hair salons, day spas, barbershops, nail studios
│   ├── fitness_gym.html        # Gyms, CrossFit, yoga, pilates, martial arts
│   └── proposal.html           # Interactive HTML proposal template with payment links
├── scripts/
│   ├── autopilot.js            # 24/7 Autonomous Agency Autopilot Daemon
│   ├── hermes.js               # Central AI decision orchestrator (with instant cascading)
│   ├── audit_engine.js         # 5-dimension technical & heuristic website auditor
│   ├── demo_generator.js       # Production-ready one-page modern demo site generator
│   ├── outreach_generator.js   # 3-touch hyper-personalized outreach drafter (compliant)
│   ├── preview_server.js       # Zero-dependency local preview web server + REST API
│   ├── agency_cli.js           # Unified CLI interface (22 commands)
│   ├── daily_summary.js        # Telegram & markdown daily pipeline reporting bot
│   ├── self_test.js            # Comprehensive 45-point test harness
│   └── lib/                    # Reusable service libraries
│       ├── email_sender.js     # Live SMTP & Resend email delivery engine
│       ├── guardrails.js       # Strict CAN-SPAM/GDPR & zero-falsification enforcement
│       ├── google_maps_scraper.js # Google Maps & OSM Overpass auto-harvester
│       ├── voice_caller.js     # AI Voice Cold-Calling Engine
│       ├── closing_engine.js   # Autonomous client closing & deposit confirmation
│       ├── ai_client.js        # Multi-provider AI (Groq, Gemini, OpenAI)
│       ├── pdf_generator.js    # Pure-JS PDF report generator
│       ├── telegram_notifier.js# Multi-part Telegram reporting & document uploader
│       ├── config_loader.js    # Multi-tier configuration loader
│       ├── browser_use_scraper.js  # Browser Use integration
│       ├── pipecat_caller.js       # Pipecat voice calling integration
│       ├── postiz_scheduler.js     # Postiz social media scheduling
│       ├── anythingllm_client.js   # AnythingLLM client intelligence RAG
│       └── cline_scheduler.js      # Cline scheduled agent tasks
├── demos/                      # Auto-generated client demo sites (<slug>/index.html)
├── outreach/                   # Auto-generated compliant markdown outreach (<slug>.md)
├── proposals/                  # Auto-generated HTML client proposals (<slug>-proposal.html)
├── prospects/                  # Detailed audit results in JSON (<slug>.json)
└── reports/                    # Generated summary digests & pipeline reports
```

---

## 4. Current Pipeline Snapshot (Verified Real Data)

```json
{
  "total_prospects": 10,
  "discovered": 0,
  "audited": 0,
  "demo_generated": 0,
  "outreach_drafted": 0,
  "contacted": 10,
  "meeting_scheduled": 0,
  "closed_won": 0,
  "closed_lost": 0,
  "pipeline_value_usd": 15000,
  "revenue_secured_usd": 0
}
```

### Qualified Leads with Verified Email Outreach:
1. **Omni Dental Group** (`operations@omnidentalgroup.com`):
   - Location: Austin, TX | Niche: Medical/Dental
   - Audit Score: 2/10
   - Demo URL: `https://warriorlegacy.github.io/website-agency/demos/omni-dental-group/index.html`
   - Outreach: Email dispatched via SMTP (`smtp-1789664319656`). Stage: `CONTACTED`.
2. **Rossi's Pizzeria** (`marco@rossispizza.com`):
   - Location: Austin, TX | Niche: Restaurant
   - Audit Score: 3/10
   - Demo URL: `https://warriorlegacy.github.io/website-agency/demos/rossis-pizzeria/index.html`
   - Outreach: Email dispatched via SMTP (`smtp-1789664356055`). Stage: `CONTACTED`.
3. **Bright Smile Dental** (`sarah@brightsmilemiami.com`):
   - Location: Miami, FL | Niche: Medical/Dental
   - Audit Score: 3/10
   - Demo URL: `https://warriorlegacy.github.io/website-agency/demos/bright-smile-dental/index.html`
   - Outreach: Email dispatched via SMTP (`smtp-1789664372303`). Stage: `CONTACTED`.
4. **Vance & Sterling Law** (`avance@vancestlaw.com`):
   - Location: Chicago, IL | Niche: Professional/Legal
   - Audit Score: 3/10
   - Demo URL: `https://warriorlegacy.github.io/website-agency/demos/vance-sterling-law/index.html`
   - Outreach: Email dispatched via SMTP (`smtp-1789664376359`). Stage: `CONTACTED`.

---

## 5. 24/7 Cloud Autopilot & GitHub Actions Workflows

The agency operates autonomously 24/7/365 in the cloud via GitHub Actions:
- **`autopilot.yml` (`0 */2 * * *`):** Runs every 2 hours on the dot. Ingests leads, audits, builds demos, drafts copy, sends emails, calls leads, syncs CRM state back to the repository with `[skip ci]`, and delivers Telegram PDF/MD reports.
- **`daily-harvest.yml` (`30 3 * * *`):** Daily 9:00 AM IST lead scraping & executive morning brief.
- **`outreach.yml` (`0 7 * * 1-5`):** Weekday business hours outreach dispatcher.
- **`selfcheck-deploy.yml`:** Automated test suite (45 checks) and GitHub Pages deployment on every commit.

### Cloud Deployment Details:
- **GitHub Repository:** `Warriorlegacy/website-agency` (Branch: `main`)
- **Public Website & Demos:** `https://warriorlegacy.github.io/website-agency`
- **Latest Verified Run:** Run ID `35250203600` (Success, committed `51d686e`)
- **Telegram Reporting:** Direct PDF and Markdown document delivery to Chat ID `8800893070` via `@APEXweb_STUDIO_BOT`
