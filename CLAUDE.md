# AI Website Agency — Quick Reference Guide

## Architecture
- `scripts/hermes.js`: **Hermes Orchestrator** — central AI brain that auto-advances leads through the pipeline.
- `scripts/audit_engine.js`: 5-Point heuristic & technical website analyzer.
- `scripts/demo_generator.js`: Automated modern HTML5 demo site generator (6 niche templates).
- `scripts/outreach_generator.js`: 3-touch hyper-personalized outreach drafter.
- `scripts/preview_server.js`: Zero-dependency local web preview server + REST API.
- `scripts/agency_cli.js`: Master CLI tool with 12 commands.
- `scripts/auto_runner.js`: Batch pipeline runner (discover → audit → demo → outreach).
- `scripts/daily_summary.js`: Daily stats digest (Telegram + file).

## Library Modules (`scripts/lib/`)
- `ai_client.js`: Multi-provider AI (Groq/OpenAI/Anthropic/Gemini/OpenRouter).
- `contact_extractor.js`: AI-powered contact info extraction.
- `lead_finder.js`: Multi-source lead discovery (Jina/SerpAPI/Google Places/Yelp).
- `scraper_client.js`: Web scraping (Jina Reader/Firecrawl/Direct).
- `email_sender.js`: Email dispatch (Resend API → SMTP → dry-run).
- `reply_classifier.js`: AI reply intent classification (interested/objection/unsubscribe).
- `screenshot.js`: Demo site screenshot capture (ScreenshotOne/urlbox/SVG placeholder).
- `payment.js`: Payment link generation (Razorpay + Stripe).
- `scheduler.js`: Meeting scheduling (Cal.com/Calendly).
- `proposal_generator.js`: Professional HTML proposal generator with 3 package tiers.

## Key CLI Commands
```bash
# Full pipeline for a business:
node scripts/agency_cli.js run-all "Rossi's Pizzeria" "http://rossispizza.test" "restaurant" "Austin, TX" "Marco Rossi" "marco@rossispizza.test" "restaurant"

# Pipeline CRM status:
node scripts/agency_cli.js status

# Individual operations:
node scripts/agency_cli.js audit <slug>
node scripts/agency_cli.js demo <slug> [template]
node scripts/agency_cli.js outreach <slug>
node scripts/agency_cli.js send <slug> [--dry-run]
node scripts/agency_cli.js proposal <slug> [starter|growth|premium]

# Orchestrator:
node scripts/agency_cli.js hermes [--dry-run] [--slug=<slug>]

# Daily summary:
node scripts/agency_cli.js summary [--local]

# Preview server:
node scripts/agency_cli.js serve 3030

# Update stage:
node scripts/agency_cli.js set-stage <slug> <CONTACTED|MEETING_SCHEDULED|CLOSED_WON|CLOSED_LOST>

# Auto pipeline batch:
npm run auto
```

## Available Templates
- `trade`: Plumbers, Electricians, HVAC, Roofers, Landscapers, Home Improvement.
- `medical`: Dentists, Chiropractors, Physiotherapy, MedSpas, Optometrists.
- `restaurant`: Cafes, Pizzerias, Fine Dining, Diners, Bakeries.
- `professional`: Law Firms, CPA / Accountants, Real Estate Agencies, Consultants.
- `salon`: Hair Salons, Barbershops, Beauty Studios, Nail Salons, Day Spas.
- `fitness`: Gyms, Yoga Studios, CrossFit Boxes, Martial Arts, Pilates Studios.

## Package Tiers
- **Starter ($750)**: Single-page site, mobile-responsive, tap-to-call, speed-optimized.
- **Growth ($1,500)**: Multi-page, contact form, local SEO, Google Business Profile.
- **Premium ($3,000)**: Full site, booking engine, payment integration, copywriting, support.

## REST API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pipeline` | Full pipeline data |
| GET | `/api/prospect/:slug` | Single prospect detail |
| GET | `/api/config` | Agency config (masked keys) |
| POST | `/api/config` | Update config |
| POST | `/api/audit` | Run audit for a business |
| POST | `/api/generate-demo` | Generate demo site |
| POST | `/api/generate-outreach` | Draft outreach |
| POST | `/api/run-all` | Full pipeline (audit → demo → outreach) |
| POST | `/api/run` | Launch auto pipeline runner |
| POST | `/api/hermes` | Run Hermes orchestrator |
| POST | `/api/send-email` | Send email for a lead |
| POST | `/api/update-stage` | Update pipeline stage |
| POST | `/api/delete-prospect` | Remove from pipeline |
| GET | `/api/interactions/:slug` | Lead interaction history |
| GET | `/api/proposal/:slug` | View generated proposal |
| GET | `/api/export-csv` | Export leads as CSV |
| POST | `/api/import-csv` | Import leads from CSV |
| GET | `/api/logs` | SSE live log stream |
