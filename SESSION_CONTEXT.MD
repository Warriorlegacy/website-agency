# SESSION_CONTEXT.MD — AI Website Agency System State

> **System Name:** Apex AI Web Studio — Autonomous "Show Don't Tell" Website Redesign Agency  
> **Workspace Root:** `d:\website_agency`  
> **Last Updated:** 2026-09-17  
> **Operational Status:** 🟢 Production Ready — Full Zero-Touch Autopilot, Google Maps Auto-Scraper, AI Voice Cold-Calling, and Autonomous Closing Engine Active  

---

## 1. Executive Summary & Agency Philosophy

Apex AI Web Studio operates on a **"Show Don't Tell"** consultative model for local business website redesigns. Instead of cold-pitching generic marketing promises, the system:
1. **Auto-Harvester:** Discovers local businesses on Google Maps / Places operating with **no website** or **outdated/unresponsive websites**.
2. **Audit Engine:** Conducts a rigorous **5-Point Technical & Visual Audit** (Design, Mobile Responsiveness, Page Speed, SEO & Discoverability, Conversion Architecture).
3. **Demo Generator:** Auto-scaffolds a **bespoke, modern, high-converting one-page demo website** tailored specifically to the prospect's niche and branding.
4. **Outreach Drafter:** Identifies verified public decision-makers and drafts a hyper-personalized **3-touch outreach sequence** with embedded demo links and screenshots.
5. **Cold Email Engine:** Dispatches personalized outreach leading with the pre-built demo site and 2 high-impact fixes.
6. **AI Voice Cold-Calling Engine:** Places conversational AI phone calls to business owners, handles objections, and checks calendar availability.
7. **Client Closing Engine:** Auto-generates **custom interactive proposals** ($750 Starter, $1,500 Growth, $3,000 Premium) with embedded Stripe & Razorpay 50% deposit checkout links.
8. **Automated Onboarding:** Upon deposit receipt, transitions lead to `CLOSED_WON` and auto-scaffolds client kickoff briefs and onboarding packages.
9. **24/7 Autopilot Daemon:** Orchestrates the entire lifecycle continuously in the background with zero user intervention required.

### Hard Rules & Compliance Safeguards
- **Zero Falsification:** No fake metrics, artificial Google review counts, or manufactured endorsements.
- **Strict Public Data Sourcing:** Only publicly advertised contact info is collected (no private/gated databases).
- **CAN-SPAM / GDPR Compliant:** Every message includes an explicit physical address placeholder and a 1-click opt-out notice (`Reply STOP and I won't follow up`). Maximum 2 follow-ups before marking `CLOSED_LOST`.
- **Calling Guardrails:** Voice calls strictly respect business hours (09:00 - 18:00 local time) and a 48-hour cooldown period between touches.

---

## 2. Completed Milestones & Full Autonomous Architecture

| Component | Status | Description |
|-----------|--------|-------------|
| **Google Maps Auto-Harvester (`scripts/lib/google_maps_scraper.js`)** | ✅ Built | Multi-source local business search (Google Places API, OpenStreetMap Overpass API, SerpAPI, Jina) with no-website & outdated site filtering. |
| **AI Voice Cold-Calling Engine (`scripts/lib/voice_caller.js`)** | ✅ Built | Outbound voice calling integrating Vapi.ai, Bland.ai, Twilio, and a dual-agent conversational simulator with Cal.com booking tools. |
| **Autonomous Closing Engine (`scripts/lib/closing_engine.js`)** | ✅ Built | Auto-proposal delivery, Stripe/Razorpay 50% deposit links, payment webhook confirmation, and client kickoff package generation (`CLOSED_WON`). |
| **24/7 Autopilot Daemon (`scripts/autopilot.js`)** | ✅ Built | Master continuous loop orchestrating harvest → audit → demo → email → voice call → close → daily digest without human intervention. |
| **Hermes Orchestrator Integration (`scripts/hermes.js`)** | ✅ Built | Central autonomous AI engine evaluating lead states and triggering next pipeline actions including voice calls and deal closing. |
| **Interactions Audit Log (`interactions.json`)** | ✅ Built | Structured event ledger recording timestamps, triggers, decisions, call transcripts, and outcomes. |
| **Reply Classifier (`scripts/lib/reply_classifier.js`)** | ✅ Built | AI intent classification for incoming replies (`interested`, `objection`, `unsubscribe`, `out_of_office`). |
| **Email Sending Engine (`scripts/lib/email_sender.js`)** | ✅ Built | Production email dispatcher with Resend API, SMTP fallback, and dry-run safety modes. |
| **Screenshot Engine (`scripts/lib/screenshot.js`)** | ✅ Built | Automated visual demo capture supporting ScreenshotOne, urlbox, and responsive SVG mockups. |
| **Proposal Generator (`scripts/lib/proposal_generator.js` & `templates/proposal.html`)** | ✅ Built | Glassmorphic interactive client proposals featuring 3 pricing tiers and deposit checkout links. |
| **Payment Integrations (`scripts/lib/payment.js`)** | ✅ Built | Razorpay and Stripe payment link generation for 50% upfront deposits. |
| **Meeting Scheduler (`scripts/lib/scheduler.js`)** | ✅ Built | Cal.com API integration and Calendly direct booking link generator. |
| **Daily Summary Bot (`scripts/daily_summary.js`)** | ✅ Built | Pipeline digest notifier supporting Telegram Bot API with Markdown file fallback. |
| **6 Niche Templates (`templates/`)** | ✅ Built | Trade/Contractor, Medical/Dental, Restaurant/Cafe, Professional/Legal, Salon/Beauty, and Fitness/Gym. |
| **Master CLI (`scripts/agency_cli.js`)** | ✅ Updated | 16 unified CLI commands including `autopilot`, `scrape-maps`, `call`, and `close-deal`. |
| **Preview Server & API (`scripts/preview_server.js`)** | ✅ Updated | 23 REST API endpoints + Server-Sent Events live log streaming. |

---

## 3. Architecture & File Catalog

```
d:\website_agency\
├── AGENTS.md                   # Core mission, ethical guardrails, pricing rules
├── CLAUDE.md                   # Developer & operator quick reference guide
├── SESSION_CONTEXT.MD          # Complete session context & system state (This File)
├── config.json                 # Agency config: AI keys, scrapers, voice, email, payments, targets
├── package.json                # Project dependencies & npm scripts (type: module)
├── pipeline.json               # Local CRM database tracking prospect lifecycle & metadata
├── interactions.json           # Audit log of all autonomous and manual outreach actions
├── vercel.json                 # Vercel deployment configuration
├── public/
│   ├── index.html              # Modern dark-mode web dashboard UI
│   ├── app.js                  # Frontend SPA controller (real-time logs, pipeline CRUD)
│   └── styles.css              # Custom CSS design system (glassmorphism, status badges)
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
│   ├── hermes.js               # Central AI decision orchestrator
│   ├── audit_engine.js         # 5-dimension technical & heuristic website auditor
│   ├── demo_generator.js       # Production-ready one-page modern demo site generator
│   ├── outreach_generator.js   # 3-touch hyper-personalized outreach drafter
│   ├── preview_server.js       # Zero-dependency local preview web server + REST API
│   ├── agency_cli.js           # Unified CLI interface (16 commands)
│   ├── auto_runner.js          # Batch pipeline runner
│   ├── daily_summary.js        # Telegram & markdown daily pipeline reporting bot
│   └── lib/                    # Reusable service libraries
│       ├── google_maps_scraper.js # Google Maps & OSM Overpass auto-harvester
│       ├── voice_caller.js     # AI Voice Cold-Calling Engine (Vapi / Bland / Simulator)
│       ├── closing_engine.js   # Autonomous client closing & deposit confirmation
│       ├── ai_client.js        # Multi-provider AI (Groq, OpenAI, Claude, Gemini, OpenRouter)
│       ├── contact_extractor.js# AI & heuristic extractor for owner names & emails
│       ├── lead_finder.js      # Multi-source scraper (Jina, SerpAPI, Google Places, Yelp)
│       ├── scraper_client.js   # Robust page scraper (Jina Reader, Firecrawl, Direct fetch)
│       ├── email_sender.js     # Email delivery engine (Resend API + SMTP + Dry Run)
│       ├── reply_classifier.js # AI reply classification engine
│       ├── screenshot.js       # Site screenshot & responsive mockup generator
│       ├── payment.js          # Razorpay & Stripe deposit link generator
│       ├── scheduler.js        # Cal.com & Calendly meeting link generator
│       └── proposal_generator.js# Proposal builder with pricing tiers ($750/$1500/$3000)
├── clients/                    # Auto-generated client onboarding packages & kickoff briefs
├── demos/                      # Auto-generated client demo sites (<slug>/index.html)
├── outreach/                   # Auto-generated markdown outreach sequences (<slug>.md)
├── proposals/                  # Auto-generated HTML client proposals (<slug>-proposal.html)
├── prospects/                  # Detailed audit results in JSON (<slug>.json)
└── reports/                    # Generated summary digests & pipeline reports
```

---

## 4. The 7-Stage Pipeline Lifecycle

```mermaid
stateDiagram-v2
    [*] --> DISCOVERED: Harvested via Google Maps / OSM (No-website or outdated filter)
    DISCOVERED --> AUDITED: 5-Point Technical & Heuristic Audit
    AUDITED --> DEMO_GENERATED: Niche-tailored modern HTML5 site built
    DEMO_GENERATED --> OWNER_LOCATED: Decision maker, phone & email extracted
    OWNER_LOCATED --> OUTREACH_DRAFTED: 3-touch sequence & call script ready
    OUTREACH_DRAFTED --> CONTACTED: Outreach dispatched via Cold Email
    CONTACTED --> MEETING_SCHEDULED: Lead books demo call / replies positively
    CONTACTED --> VOICE_CALLED: Autonomous AI voice call placed during business hours
    VOICE_CALLED --> MEETING_SCHEDULED: Call outcome: Meeting agreed or booked on Cal.com
    VOICE_CALLED --> PROPOSAL_SENT: Call outcome: Client requests proposal & pricing
    MEETING_SCHEDULED --> CLOSED_WON: 50% deposit paid via Stripe/Razorpay link
    CONTACTED --> CLOSED_LOST: Max 5 touches reached or lead opts out
    VOICE_CALLED --> CLOSED_LOST: Explicit opt-out / not interested
```

---

## 5. Master CLI Command Reference

All commands run through `node scripts/agency_cli.js <command>` or `npm run <script>`:

| Command | Arguments | Description |
|---------|-----------|-------------|
| `autopilot` | `[--loop] [--dry-run] [--interval=15] [--force-call]` | **Run 24/7 Autonomous Agency Autopilot** (Zero manual touch). |
| `scrape-maps`| `<niche> <city> [count]` | **Auto-harvest local leads from Google Maps / OSM**. |
| `call` | `<slug> [--simulate\|--live]` | **Place AI Voice cold call to business owner**. |
| `close-deal` | `<slug> [starter\|growth\|premium]` | **Confirm deposit payment, mark CLOSED_WON & scaffold client kit**. |
| `run-all` | `<name> <url> <niche> [city] [owner] [email] [template]` | Run full end-to-end pipeline for a single business. |
| `hermes` | `[--dry-run] [--slug=<slug>]` | Launch central autonomous AI decision orchestrator. |
| `audit` | `<slug> [url]` | Run technical & heuristic audit on a prospect. |
| `demo` | `<slug> [template]` | Generate or regenerate modern demo website. |
| `outreach` | `<slug>` | Draft 3-touch email sequence and phone script. |
| `send` | `<slug> [--dry-run]` | Send drafted outreach email via Resend or SMTP. |
| `proposal` | `<slug> [starter\|growth\|premium]` | Generate client proposal HTML with deposit payment links. |
| `summary` | `[--local]` | Generate daily pipeline summary (Telegram or local file). |
| `status` | — | Display formatted CRM pipeline table in terminal. |
| `set-stage` | `<slug> <stage>` | Update pipeline status for a prospect. |
| `serve` | `[port]` | Start local web dashboard & API server (default: 3030). |
| `selfcheck` | — | Run end-to-end automated system self-check test suite. |

---

## 6. REST API Endpoints & Web Dashboard

The server (`node scripts/agency_cli.js serve 3030` or `npm start`) exposes a full REST API and powers the web dashboard at `http://localhost:3030`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scrape-maps` | Harvests Google Maps leads for a niche & city. |
| `POST` | `/api/call-lead` | Places outbound AI voice call (live or simulated). |
| `POST` | `/api/close-deal` | Confirms deposit and marks lead as `CLOSED_WON`. |
| `POST` | `/api/autopilot/cycle`| Triggers an autonomous autopilot cycle. |
| `POST` | `/api/webhooks/payment`| Webhook listener for Stripe / Razorpay deposit receipts. |
| `GET` | `/api/pipeline` | Returns full pipeline lead list and aggregate counts. |
| `GET` | `/api/prospect/:slug` | Returns prospect audit report, outreach draft, and metadata. |
| `GET` | `/api/config` | Returns agency configuration (API keys masked for security). |
| `POST` | `/api/config` | Updates agency configuration keys and preferences. |
| `POST` | `/api/audit` | Triggers a live audit for a prospect URL. |
| `POST` | `/api/generate-demo` | Scaffolds modern demo website from selected template. |
| `POST` | `/api/generate-outreach` | Drafts personalized outreach messages. |
| `POST` | `/api/run-all` | Executes full pipeline in sequence (Audit → Demo → Outreach). |
| `POST` | `/api/run` | Launches batch auto-runner process. |
| `POST` | `/api/hermes` | Runs Hermes autonomous orchestrator cycle. |
| `POST` | `/api/send-email` | Dispatches approved outreach email. |
| `POST` | `/api/update-stage` | Updates prospect stage in `pipeline.json`. |
| `POST` | `/api/delete-prospect` | Deletes a prospect from the pipeline. |
| `GET` | `/api/interactions/:slug`| Retrieves logged interaction history for a prospect. |
| `GET` | `/api/proposal/:slug` | Fetches generated proposal HTML or triggers generation. |
| `GET` | `/api/export-csv` | Exports active pipeline leads to CSV. |
| `POST` | `/api/import-csv` | Imports leads from uploaded CSV format. |
| `GET` | `/api/logs` | Server-Sent Events (SSE) stream for live terminal/dashboard logs. |

---

## 7. Package Tiers & Pricing Standards

- **Starter Package ($750):** 1-page mobile-first responsive site, tap-to-call, quote request form, < 2.0s load time, 50% deposit ($375).
- **Growth Package ($1,500):** Multi-page site (5 pages), contact form, Local SEO metadata, Google Business Profile connection, 50% deposit ($750).
- **Premium Package ($3,000):** Full web application, booking engine / menu ordering, Stripe/Razorpay payment integration, custom copywriting, 50% deposit ($1,500).

---

## 8. Verification & Test Results

1. **Google Maps Scraper Test (`node scripts/agency_cli.js scrape-maps restaurant "Austin, TX" 2`):**
   - Harvested and qualified `bella-napoli-trattoria` and `blue-harbor-seafood-bar` with no-website hook.
   - **Result:** Code 0 (Success).
2. **AI Voice Calling Simulator Test (`node scripts/agency_cli.js call summit-peak-plumbing --simulate`):**
   - Simulated 4-turn telephone dialogue, handled cost objection, and agreed to demo review.
   - **Result:** Code 0 (Success).
3. **Deal Closing Test (`node scripts/agency_cli.js close-deal rossis-pizzeria growth`):**
   - Successfully marked `rossis-pizzeria` as `CLOSED_WON`, logged deposit payment ($750), and generated `clients/rossis-pizzeria/kickoff_brief.md` & `onboarding.json`.
   - **Result:** Code 0 (Success).
4. **24/7 Autopilot Cycle (`node scripts/autopilot.js --dry-run`):**
   - Harvested quota, Hermes evaluated 7 active leads, AI voice caller initiated calls to 3 businesses, closed deals progressed.
   - **Result:** Code 0 (Success).
5. **System Self-Check (`node scripts/agency_cli.js selfcheck`):**
   - Full end-to-end self-check passed 100%.
   - **Result:** Code 0 (Success).

---

## 9. Direct UPI & WhatsApp Payment Verification Workflow

The agency uses a zero-fee, high-converting direct UPI payment & WhatsApp verification workflow:
- **Official UPI ID:** `6202442690@jio`
- **Payee Name:** Piyush Singh
- **WhatsApp Verification Number:** `+91 6202442690`
- **Workflow:**
  1. Proposal pages dynamically generate a UPI payment QR code + GPay/PhonePe deep link for the exact deposit amount (₹31,250 Starter / ₹62,500 Growth / ₹1,25,000 Premium).
  2. Client scans the QR code or taps to pay on their phone.
  3. Client taps the green **"📲 Send Screenshot on WhatsApp"** button, opening WhatsApp with a pre-filled confirmation text to `+91 6202442690`.
  4. The operator confirms the transaction screenshot and issues the subscription/project kickoff confirmation (`node scripts/agency_cli.js close-deal <slug> [package]`).

---

## 10. 24/7 Autonomous Cloud Deployment (Runs When PC is OFF)

The agency is deployed and actively running in the cloud for **100% free** using GitHub Actions:
- **Public GitHub Repository:** [https://github.com/Warriorlegacy/website-agency](https://github.com/Warriorlegacy/website-agency)
- **Unlimited Free Minutes:** As a public repository, GitHub Actions provides **unlimited standard runner minutes** with zero minute caps and zero rate limits.
- **Schedule:** Runs every 2 hours continuously (`0 */2 * * *`) on Ubuntu runners in the cloud even when your PC is turned off.
- **Live Cloud Verification:** Run `35207845535` completed with `SUCCESS` in 55 seconds. Harvested 3 new leads, built demo site for Apex Electrical Solutions, executed AI voice calling with auto-fallback to Gemini, committed changes back to repository, and delivered live Telegram digest to Piyush.
- **Configured GitHub Repository Secrets:**
  - `GROQ_API_KEY`: Primary high-speed LLM (`qwen/qwen3.8-27b`)
  - `GEMINI_API_KEY`: Automatic failover LLM (`gemini-2.5-flash`)
  - `RESEND_API_KEY`: Verified email delivery engine
  - `CAL_API_KEY`: Cal.com API v2 meeting scheduler
  - `VAPI_API_KEY`: Vapi.ai private API key for AI voice calling
  - `VAPI_ASSISTANT_ID`: SIGNHIFY Outbound Agent (`65e7ac0a-6c30-43f1-b947-d1b27dc8cafc`)
  - `TELEGRAM_BOT_TOKEN`: APEX_STUDIO bot dispatcher
  - `TELEGRAM_CHAT_ID`: Direct notification recipient (`8800893070`)
- **Automated Telegram Workflow Reports:** Dispatches a complete, rich HTML report to Piyush's Telegram on **every single workflow run** (run timing, pipeline health, scraped leads, generated demos, voice calls & outcomes, proposals, UPI ID `6202442690@jio`, and WhatsApp link), with an automated failure alert step if any step fails.

### How to Trigger or Monitor Cloud Runs
- **Web UI:** Go to [Actions tab on GitHub](https://github.com/Warriorlegacy/website-agency/actions) -> `24/7 Autonomous Agency Autopilot` -> `Run workflow`.
- **CLI:**
  ```bash
  gh workflow run autopilot.yml --repo Warriorlegacy/website-agency
  gh run list --repo Warriorlegacy/website-agency
  ```

### How to Run Locally
```bash
# Continuous background mode (runs every 15 minutes)
npm run autopilot

# Or single-pass execution
npm run autopilot:once

# Or test in dry-run mode
node scripts/autopilot.js --dry-run
```

---

## 11. Real-Time Telegram Event Dispatcher & Alert Matrix

All critical pipeline activities deliver instant, beautifully formatted HTML alerts directly to Piyush's Telegram (`chatId: 8800893070` via `@APEXweb_STUDIO_BOT`):

| Pipeline Event | Trigger Location | Telegram Alert Contents |
|----------------|------------------|-------------------------|
| **🚜 Data Scraping & Lead Generation** | `scripts/lib/google_maps_scraper.js` (`notifyLeadsHarvested`) | Scraped business names, category/niche, city, star ratings, phone numbers, and opportunity hooks. |
| **🎨 Demo Website Scaffolded** | `scripts/hermes.js` (`notifyDemoGenerated`) | Client name, niche, rating, phone, live demo preview URL, and outreach sequence confirmation. |
| **📅 Meeting / Demo Review Booked** | `scripts/lib/voice_caller.js` (`notifyMeetingScheduled`) | Decision maker name, phone, AI call summary/notes, and Cal.com booking link. |
| **💼 Closing Proposal Dispatched** | `scripts/lib/closing_engine.js` (`notifyProposalDispatched`) | Chosen package tier ($750/$1500/$3000), 50% deposit amount (USD & INR), custom proposal link, UPI ID `6202442690@jio`, and WhatsApp verification link. |
| **🏆 Client Deal Closed Won** | `scripts/lib/closing_engine.js` (`notifyDealClosedWon`) | Deposit confirmed, total contract value, client kickoff brief link, and onboarding package path. |
| **🚀 Full Workflow Run Digest** | `scripts/autopilot.js` & `scripts/daily_summary.js` (`sendWorkflowRunReport`) | Comprehensive end-of-run digest: execution timestamp (IST), cloud runner status, full CRM funnel snapshot, active leads, pipeline & won revenue, run actions delta, UPI payment details, and GitHub commit link. |
| **🚨 Workflow Failure Watchdog** | `.github/workflows/autopilot.yml` (`if: failure()`) | Immediate alert if any cloud autopilot step encounters an unhandled fatal error. |


