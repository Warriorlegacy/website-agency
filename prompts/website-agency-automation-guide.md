---
title: "The Autonomous Website Agency"
subtitle: "An End-to-End Blueprint: Lead Scraping to Closed Deal, Zero Manual Touch"
author: "Build Guide"
date: "September 2026"
---

# 1. What This System Actually Does

This is a blueprint for a pipeline that finds local businesses with no website (or a bad one), builds them a real working demo site before you ever speak to them, reaches out by email and voice, books the meeting, sends the contract, and takes payment — with a central decision-making agent ("Hermes") running the whole sequence instead of you.

"Fully autonomous" is used carefully in this doc. Every stage below **can** run without a human in the loop technically. A short, honest section (Section 9) flags the two or three places where running with zero oversight creates real legal or financial exposure, so you can decide where you're comfortable removing the checkpoint. That's a risk call for you to make, not a lecture — the rest of the document assumes you want maximum autonomy and builds toward it.

## 1.1 The Pipeline at a Glance

```
[Google Places API] --> [Scraper + No-Website Filter] --> [Enrichment: email, category]
        |
        v
   [Supabase: leads table]  <---------------------------------+
        |                                                      |
        v                                                      |
   HERMES ORCHESTRATOR (Claude agent, reads lead state,        |
   decides next action, writes result back) --------------------+
        |
   -----+---------------------------------------------------------
   |              |                    |                    |
   v              v                    v                    v
[MVP Auto-      [Cold Email        [AI Voice           [Meeting
 Generator]      Engine]            Cold-Call Agent]     Booker]
   |              |                    |                    |
   +--------------+--------------------+--------------------+
                          |
                          v
             [Proposal + Payment Link + e-Sign]
                          |
                 +--------+--------+
                 v                 v
          [Won: Onboarding]  [Lost: Nurture sequence, retry in 90 days]
```

Everything writes its result back into one Supabase table. Hermes reads that table on a timer (or on webhook events) and decides what happens to each lead next. Nothing needs to be triggered by hand.

---

# 2. Tech Stack (built around free-tier-first, self-hosted tools)

| Layer | Tool | Why |
|---|---|---|
| Orchestration / workflow | **n8n** (self-hosted on a $5-6/mo VPS, e.g. Hetzner/Oracle free tier) | Visual workflow engine, free, holds all the glue logic between steps |
| Lead database / CRM | **Supabase** (Postgres, free tier) | You already run on this; one `leads` table is the single source of truth |
| Lead sourcing | **Google Places API (New)** + **Apify "Google Maps Scraper"** actor as backup | Places API is ToS-compliant and cheap (~$17/1000 requests, first $200/mo free via Google Cloud credit); Apify is a fallback for fields Places doesn't expose |
| Email finding / validation | **Hunter.io** (free tier: 25 searches/mo) or **Apollo.io** free tier | Attach a real inbox to each business lead |
| Orchestrator "brain" | **Claude API (Sonnet)**, called via n8n's HTTP node | Reads lead state, decides next best action, drafts personalized copy |
| MVP site generation | **Next.js template + Claude-generated copy**, deployed via **Vercel REST API** to a subdomain per lead | This is the differentiator: the lead gets a live link, not a mockup image |
| Screenshot for email | **Playwright** (headless, run in n8n/Python step) | Embeds a real screenshot of their new site directly in the cold email |
| Cold email sending | **Smartlead** or **Instantly.ai** (paid, ~$30-40/mo, handles warmup + deliverability) — or self-hosted via **Zoho Mail** + n8n if you want zero-cost and can manage warmup manually | Warmup and rotation matter more than the tool; skipping this burns your domain |
| AI voice cold-calling | **Vapi** or **Bland.ai** (usage-based, ~$0.05-0.15/min) + **Twilio** number | Both support function-calling so the voice agent can check a calendar and book directly |
| Meeting booking | **Cal.com** (self-hosted, free) | API-first, easy for both the email agent and voice agent to hit |
| Proposal + contract | Auto-generated PDF (same Pandoc/LaTeX approach used for your other document builds) + **Razorpay Payment Links API** for the deposit | A paid deposit link functions as the client's acceptance in most small-agency workflows, no separate e-sign tool required |
| Monitoring | **Supabase** logs table + a daily digest sent to your own WhatsApp via **WhatsApp Cloud API** | You still see everything, you just don't have to do anything |

Everything above is chosen to fit a near-zero fixed cost until the pipeline is actually producing calls and replies — the only recurring costs are the VPS (~$5/mo) and Cal.com/Supabase/n8n stay free at this scale.

---

# 3. Phase 1 — Lead Sourcing

**Goal:** a list of local businesses, in a chosen city/niche, that have no website or an outdated one — the exact buyer for a website agency.

1. Call the Places API "Text Search" or "Nearby Search" endpoint for a niche + area (e.g. `"dentists in Lucknow"`, `"interior designers in Indore"`).
2. Pull `place_id`, `displayName`, `formattedAddress`, `nationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount`.
3. Filter: keep rows where `websiteUri` is empty, OR where the domain resolves but returns a template-looking / dead / non-HTTPS site (a cheap heuristic: fetch the homepage, check for a valid TLS cert, page size, and whether it was last modified years ago via the `Last-Modified` header).
4. De-duplicate against your Supabase `leads` table so you never scrape the same business twice.
5. Write each qualifying row into Supabase with `status = 'sourced'`.

Use the Places API as the primary path rather than raw HTML scraping of Google Maps — it's the ToS-compliant route and it's actually cheaper once you factor in proxy costs for scraping at volume. Keep Apify/Outscraper only as a fallback for anything Places doesn't return (e.g. Instagram handles listed on the profile).

---

# 4. Phase 2 — Enrichment

For every sourced lead:

- Run the business name + domain (if any) through Hunter.io/Apollo to find a real decision-maker email, not just a generic `info@`.
- Validate the email with NeverBounce/ZeroBounce (free tier covers low volume) — this alone protects your sender reputation more than almost anything else in this stack.
- Have Claude classify the business niche and write a one-line "hook" — e.g. *"family-run bakery, 4.7 rating, 210 reviews, no website"* — this becomes the personalization variable for both the email and the voice script.
- Update `status = 'enriched'`.

---

# 5. Phase 3 — The MVP Auto-Generator (the differentiator)

This is the step that makes the outreach convert far better than a generic pitch: the lead receives a link to *their own* live demo site before they've spoken to anyone.

1. Maintain 4-5 clean Next.js templates (one per common niche: restaurant, clinic, salon, professional services, retail).
2. For each lead, pick the closest-matching template and have Claude generate the actual copy — headline, about section, services list — using the enrichment data (business name, niche, city, review highlights).
3. Deploy programmatically via the **Vercel REST API** (`POST /v13/deployments`) to a subdomain like `businessname.yourdemoagency.app`. This can be scripted entirely — no manual "New Project" click needed.
4. Run a headless Playwright screenshot of the deployed homepage.
5. Save `mvp_url` and the screenshot path back to the lead's row. `status = 'mvp_ready'`.

Cost per MVP at this scale is close to zero (Vercel's free tier covers hundreds of low-traffic preview deployments).

---

# 6. Phase 4 — Cold Email Engine

- Trigger: any lead with `status = 'mvp_ready'`.
- Claude drafts a short, specific email referencing the business by name, the one-line hook from enrichment, and the MVP link + embedded screenshot. Keep it under 120 words — a personalized short email consistently outperforms a long pitch.
- Send through your warmed sending domain (Smartlead/Instantly handle rotation across multiple inboxes so volume doesn't tank deliverability).
- Parse replies via webhook: a positive reply moves the lead to `status = 'replied_positive'` and hands off to the meeting booker; a bounce or negative reply updates status accordingly; no reply after 4 days triggers Phase 5.
- Always include a one-line unsubscribe/opt-out — this is a compliance requirement, not optional (more in Section 9).

---

# 7. Phase 5 — AI Voice Cold-Calling Agent

- Trigger: `status = 'mvp_ready'` with no email reply after N days, or a lead flagged as phone-preferred.
- Build the agent in Vapi/Bland with a script built around: confirm you're speaking to the right business, reference the MVP link you already sent ("I emailed you a working preview of a new site for [business] — did you get a chance to look?"), handle 2-3 common objections, and end with a calendar function-call to book a slot on Cal.com if interested.
- Give the agent a **function tool** for `check_availability` and `book_meeting` hitting your Cal.com API directly, so a "yes" on the call becomes a booked meeting with zero extra steps.
- Log the full transcript back to Supabase against the lead for Hermes and for your own audit trail.
- `status` moves to `called_no_answer`, `called_not_interested`, or `meeting_booked`.

---

# 8. Phase 6 — Proposal, Payment, Onboarding

- Trigger: `status = 'meeting_booked'` and the meeting has passed (pull outcome from a short post-call form or the voice agent's own summary if the "meeting" was actually just a longer qualifying call).
- Auto-generate a one-page proposal PDF (reuse your existing Pandoc pipeline) with a fixed productized price for the site package — a fixed menu of 2-3 packages keeps this stage scriptable; bespoke scoping is the one place a human usually still adds real value.
- Generate a Razorpay Payment Link for the deposit and send it with the proposal.
- On payment webhook success: create the client's project record, send a WhatsApp confirmation via the Cloud API, and kick off your build pipeline. `status = 'won'`.
- No payment after 5 days: move to a long-term nurture sequence (`status = 'nurture'`), re-touch every 30-60 days.

---

# 9. Hermes — The Orchestrator Agent

Hermes is the one component that ties every phase together. Instead of hard-coding "if X then Y" for every case, it's a Claude agent with tool access that reads a lead's full state and decides the single next action, then calls the tool for that action (send email, place call, generate MVP, etc.). Run it on a schedule (every 15-30 minutes via n8n cron) over every lead that isn't in a terminal state.

**Core system prompt (starting point — refine as you see real lead data):**

```
You are Hermes, the sole outreach and sales-sequencing agent for a
website design agency. You will be given one lead's full record:
business info, current status, contact history, and any call
transcripts or email replies on file.

Decide the single next action for this lead from this list only:
generate_mvp, send_email, place_call, send_proposal, send_payment_link,
move_to_nurture, mark_lost, no_action_yet.

Rules:
- Never contact a lead more than once in 48 hours.
- Never call a lead who has explicitly asked not to be contacted —
  check the do_not_contact flag before every action.
- Prefer email before voice on the first outreach.
- If a lead has been contacted 5 times with no positive signal,
  return move_to_nurture.
- Always return a one-sentence reason for your chosen action, and
  nothing else outside the JSON.

Respond only with JSON: {"action": "...", "reason": "..."}
```

Hermes' output is parsed by n8n, which routes to the corresponding workflow (the ones built in Phases 3-6). This keeps Hermes cheap to run (one short call per lead per cycle) while every heavy-lift step — copywriting, voice conversation, PDF generation — stays in its own dedicated workflow.

---

# 10. Supabase Schema (starting point)

```sql
create table leads (
  id uuid primary key default gen_random_uuid(),
  business_name text,
  category text,
  phone text,
  email text,
  address text,
  place_id text unique,
  has_website boolean,
  mvp_url text,
  status text default 'sourced',
  contact_count int default 0,
  do_not_contact boolean default false,
  last_contacted_at timestamptz,
  notes text,
  source text default 'google_places',
  created_at timestamptz default now()
);

create table interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  channel text, -- 'email' | 'call' | 'system'
  direction text, -- 'outbound' | 'inbound'
  content text,
  created_at timestamptz default now()
);
```

`status` values in order: `sourced -> enriched -> mvp_ready -> emailed -> called -> meeting_booked -> won | lost | nurture`.

---

# 11. Cost Reality Check (ballpark, per 1,000 leads/month)

| Item | Approx. cost |
|---|---|
| Places API lookups | $15-20 |
| Email finding + validation | $0 (free tiers cover this volume) to $50 |
| Vercel + Supabase hosting | $0 (free tier) |
| n8n VPS | $5-6/mo flat |
| Cold email tool (warmup + sending) | $30-40/mo |
| Voice agent (Vapi/Bland) + Twilio, at ~2 min avg call, 30% call rate | $30-45 |
| Claude API calls (Hermes + copy + MVP text) | $10-20 |
| **Rough total** | **~$100-150/month for 1,000 leads worked end to end** |

This scales roughly linearly — the fixed cost (n8n VPS) is the only piece that doesn't grow with volume.

---

# 12. Compliance — Read Before You Flip the "No Human" Switch

This is factual context to help you decide where to keep a checkpoint, not legal advice (I'm not a lawyer, and rules vary by state/city too) — check current requirements before running at scale:

- **Cold calling in India**: TRAI's Telecom Commercial Communications Customer Preference Regulations (TCCCPR) require telemarketers to register and to scrub call lists against the National Do Not Call (NDNC) registry for numbers registered as such. This applies most clearly to bulk consumer-facing calling; business outreach to a business's own listed number is generally lower-risk than mass consumer dialing, but the registration requirement is worth checking against your actual call volume before scaling the voice agent past a handful of calls a day.
- **Bulk SMS/WhatsApp**: commercial SMS in India requires DLT (Distributed Ledger Technology) registration of your sender ID and message templates with the telecom operators. WhatsApp's own Business Platform policies additionally restrict unsolicited outbound marketing templates without opt-in.
- **Cold email**: India doesn't have a CAN-SPAM-style law as strict as the US/EU, but if any leads are outside India, CAN-SPAM (US) and GDPR (EU) both require a working opt-out/unsubscribe link and accurate sender info — already built into Phase 4 above.
- **Google Places/Maps data**: using the official Places API keeps you inside Google's terms; scraping the Maps website directly (rather than calling the API) is against Google's ToS and is the more legally exposed path even though it's technically easier to script.
- **Payment + contract**: a payment-link-as-acceptance flow is common for small productized deals, but for larger contract values a proper e-signed agreement (Zoho Sign, DocuSign) is safer if a dispute ever arises.

None of this blocks building the system — it just tells you which pieces (bulk voice calling, bulk SMS) benefit from registering properly before you scale volume, versus pieces (email, MVP generation, Places-API sourcing) that are lower-risk to run at full autonomy from day one.

---

# 13. Rollout Plan

**Days 1-15 — Foundation**
Build the Supabase schema, the Places API sourcing script, and the enrichment step. Manually review the first 50 leads to sanity-check filtering quality before automating fully.

**Days 16-30 — MVP + Email**
Build the Next.js templates and the Vercel auto-deploy script. Wire up the cold email engine on a warmed-up domain. Run this alone (no voice yet) on a small batch and watch reply rates.

**Days 31-60 — Voice + Booking**
Add the Vapi/Bland voice agent and Cal.com integration. Start with voice only on leads that already got an email and didn't reply, at low daily volume, while you confirm call quality and calendar booking work end to end.

**Days 61-90 — Hermes + Full Loop**
Wire in the Hermes orchestrator so lead progression stops needing any manual trigger. Add the proposal/payment/onboarding automation. By day 90 the full loop — scrape to closed deal — should be running on its own schedule, with your only involvement being the daily WhatsApp digest and spot-checking a handful of transcripts a week.

---

# 14. What to Build First If You Only Do One Thing

If you build nothing else from this doc, build Phase 3 (the MVP auto-generator) and Phase 4 (the personalized email). A local business that opens an email and finds a real, working website already built for them — not a mockup, not a pitch deck — is a dramatically stronger opener than any script a cold call can deliver, and it's the one piece of this pipeline your competitors almost certainly aren't doing.
