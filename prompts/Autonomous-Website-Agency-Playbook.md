# The Autonomous Website Agency Playbook
### Google Maps → Lead → Auto-Built MVP → Outreach → Signed Client, With No Manual Steps

*Prepared for: a solo/small website agency wanting to run its entire outbound funnel on autopilot.*

---

## 0. How to read this

You mentioned running this through your "Hermes agent." I don't know the exact framework behind that name, so this guide is written so it plugs into **any** LLM-based orchestrator — a self-hosted model (e.g. Nous Hermes running via Ollama/vLLM), Claude/GPT via API, or a no-code AI-agent node in n8n/Make. Wherever you see "the agent," swap in whatever you're actually running — the architecture doesn't change.

Also, one honest note up front: **true zero-human-interference is achievable for 90–95% of the funnel, but full autonomy on the calling stage runs into real regulation in India (TRAI/DND), and full autonomy on contracts/payments is a business-risk decision, not just a technical one.** Section 7 covers exactly where the line is and what a safe version of "hands-off" looks like. Everything else below can genuinely run unattended.

---

## 1. System overview

```
[1] Google Maps Scraper (nightly, by city + category)
        │
        ▼
[2] Lead DB + Enrichment  (website check, email/phone find, quality score)
        │
        ▼
[3] MVP Auto-Builder  →  deploys a live demo site per lead (yourbrand-demo.com/leadslug)
        │
        ▼
[4] Outreach Engine
        ├─ Cold Email sequence (references their new demo site)
        └─ AI Voice Calling (only for warm/opted-in leads — see §6)
        │
        ▼
[5] Reply / Call-Outcome Classifier  (LLM-based intent detection)
        ├─ Interested  → [6] Auto-scheduler → Proposal → E-sign → Payment link → Onboarding
        ├─ Objection   → Nurture branch / handled reply
        └─ No response → Follow-up cadence (3–5 touches) → Archive
        │
        ▼
[7] Daily summary pinged to you (Telegram/WhatsApp/Slack) — read-only, no action needed
```

The whole thing is a **state machine per lead**, driven by an orchestrator that owns the "what happens next" decision. Below is each stage, then the orchestration layer, then the parts that genuinely need a human circuit-breaker.

---

## 2. Stage-by-stage build

### 2.1 Lead sourcing (Google Maps scraping)

Two credible routes, both still active and widely used in 2026:

| Tool | Best for | Notes |
|---|---|---|
| **Apify** (Google Maps Scraper actors) | Developer-owned pipelines, scheduling, API access | Pay-per-result; can be triggered via API from your orchestrator; handles pagination beyond the ~120-result map limit by tiling search areas |
| **Outscraper** | No-code / fastest to start | Point-and-click by city+category, built-in email verification and enrichment add-ons |
| **Official Google Places API** | Lowest legal ambiguity | Quota-based, ~60 results per query — fine for smaller/targeted runs, harder to scale to thousands of leads/day |

**What to pull per business:** name, category, address, phone, website (or absence of one), rating, review count, a handful of recent review snippets (for sentiment, not for republishing verbatim), opening hours, and photos.

**Filtering logic** (this is where your ICP lives): businesses with *no website*, or a website that fails a basic quality check (see 2.2), in your target categories (salons, clinics, gyms, restaurants, contractors, retail — whatever you sell into) and cities. Schedule this as a nightly job so new territory gets added automatically without you running anything manually.

### 2.2 Enrichment & scoring

- **Website audit:** if they have a site, run it through Google PageSpeed Insights API or a simple HTTP check (mobile-responsive? HTTPS? last-modified date?). Score 0–100; anything under your threshold becomes a lead.
- **Contact enrichment:** Google Maps listings often include the phone directly; for email, use Hunter.io or Apollo.io against the business domain, or fall back to a generic `info@`/`contact@` guess-and-verify.
- **AI qualification pass:** have the agent score each lead 1–10 based on category value, review count (proxy for revenue), and site-quality gap — so your outreach prioritizes the businesses most likely to convert first.

Store all of this in one place — Airtable, Postgres, or Google Sheets if you're starting scrappy — as your single source of truth. This table *is* the lead lifecycle (see §4).

### 2.3 MVP auto-generation — your actual differentiator

This is the strongest lever in the whole system, because "here's a live site built for your business" converts far better than a generic pitch email.

1. **Template library:** build 6–10 solid templates by niche (restaurant, salon, clinic, gym, contractor, retail, professional services) in Next.js or Astro. Design them once, well.
2. **Auto-fill:** feed the scraped data (name, category, address, hours, photos, services implied by category) into an LLM prompt that writes the hero tagline, about section, and service list *in your template's voice*. Don't copy review text verbatim into the site — have the agent paraphrase sentiment ("loved for their weekend brunch," not a lifted quote) to avoid reproducing content that isn't yours.
3. **Auto-deploy:** push each generated site to a unique subdomain via the Vercel or Netlify API (e.g. `demo.youragency.com/rajus-salon`). This is scriptable end-to-end — no manual deploy click needed.
4. **Screenshot for the email:** use a screenshot API (urlbox.io, screenshotone) to grab the homepage as an image to embed inline in your cold email — recipients engage with a visual far more than a bare link.
5. Add a "Claim this site" button on the demo that feeds straight into your scheduler (§2.6).

### 2.4 Outreach — cold email

- **Sending infra:** Instantly, Smartlead, or Lemlist are the three mature platforms in 2026 for this. Smartlead tends to win on per-mailbox cost for agencies; Instantly bundles a lead database and easier setup; Lemlist adds LinkedIn as a channel. Any of the three will do domain warm-up for you — buy 2–3 lookalike sending domains, let them warm for ~2 weeks before your first real send, and never send cold from your main business domain.
- **Sequence (3–4 touches):**
  1. Intro + the demo link/screenshot ("built this for [Business] — take a look")
  2. Follow-up naming one specific gap it fixes (no online booking, not mobile-friendly, etc.)
  3. Light social proof / a specific outcome another client saw
  4. Break-up email ("I'll close this out unless you want the link")
- **Personalization:** the agent writes touch 1's opening line per-lead from the scraped data (their category, city, a paraphrased review theme) rather than a single generic template — this is what keeps deliverability and reply rates healthy at volume.

### 2.5 Outreach — AI voice calling

Platforms worth knowing: **Vapi** and **Retell AI** (developer-built, most customizable), **Bland AI** (built for high-volume dialing), **Synthflow** (no-code, full-stack). All of them can dial, hold a natural conversation, qualify, handle basic objections, and book directly onto a calendar without a human on the line.

**Read §6 before wiring this up** — calling in India carries real regulatory weight in 2026 that email doesn't, and the compliant path changes how you should sequence this stage.

### 2.6 Reply & call-outcome handling

Run every inbound reply and call transcript through an LLM classifier: *Interested / Objection / Not now / Wrong contact / Unsubscribe*. Route automatically:
- **Interested** → send a Cal.com/Calendly link (or skip straight to the proposal if the demo already sold them)
- **Objection** → the agent replies addressing the specific objection (price, timing, "we already have someone") using a small library of response frameworks
- **No response after full sequence** → move to a long-cycle nurture list (monthly check-in) instead of dropping the lead entirely

### 2.7 Closing — scheduling, proposal, e-sign, payment

1. **Scheduling:** Cal.com or Calendly, embedded in the "interested" reply.
2. **Proposal:** auto-generate from a template merged with lead data and your package tiers, sent via PandaDoc or DocuSign for e-signature.
3. **Payment:** on the signature webhook firing, auto-generate and send a payment link — Razorpay is the natural choice for Indian clients, Stripe if you're taking international work.
4. **Onboarding:** on payment confirmation, trigger a welcome email + intake form (Typeform/Google Form) and auto-create a project card in Notion/Trello/Airtable.

### 2.8 You, the human

At the end of each day, the system sends you one summary message (Telegram/WhatsApp bot is easiest) — leads found, emails sent, calls made, replies, deals closed. Read-only. No action required unless something's flagged (see §7).

---

## 3. The orchestration layer ("Hermes")

Two workable patterns:

- **n8n or Make.com as the backbone**, with an AI Agent node as the reasoning layer wherever judgment is needed (personalization copy, reply classification, objection handling). This is the fastest path to something working, and it's the pattern most agencies are actually running in 2026 — deterministic workflow for the reliable 80%, an LLM plugged in at the specific decision points.
- **A custom agent (LangGraph/CrewAI + your model of choice)** if you want the orchestrator itself to reason about sequencing — e.g., deciding whether a lead is worth a follow-up call versus dropping it. More flexible, more to maintain.

Either way, give the agent a small, explicit toolset rather than open-ended freedom:

```
scrape_leads(city, category)
enrich_lead(lead_id)
generate_mvp(lead_id)
send_email(lead_id, sequence_step)
classify_reply(text) → intent
place_call(lead_id)          # only for leads meeting §6's consent bar
send_proposal(lead_id)
send_payment_link(lead_id)
notify_owner(summary)
```

Every action is logged against the lead record — that log is what makes "no manual interference" auditable rather than a black box.

---

## 4. Lead lifecycle (the state machine)

| State | Trigger to enter | Trigger to advance |
|---|---|---|
| `NEW` | Scraper finds it | Enrichment completes |
| `ENRICHED` | Contact + score attached | MVP built |
| `MVP_READY` | Demo site deployed | First email sent |
| `EMAILED` | Sequence running | Reply received / sequence exhausted |
| `WARM` | Positive reply or call opt-in | Call placed or meeting booked |
| `ENGAGED` | Meeting booked / live conversation | Proposal sent |
| `PROPOSAL_SENT` | Contract out for signature | Signed / declined |
| `WON` | Signature + payment received | Onboarding triggered |
| `LOST` / `NURTURE` | No response or explicit no | Re-entry after N months |

---

## 5. Tech stack summary

| Function | Tool options | Rough cost |
|---|---|---|
| Maps scraping | Apify, Outscraper | $40–150/mo |
| Contact enrichment | Hunter.io, Apollo.io | $0–50/mo |
| MVP hosting/deploy | Vercel, Netlify (API-driven) | Free–$20/mo |
| Cold email | Instantly, Smartlead, Lemlist | $37–100/mo + domains |
| AI voice calling | Vapi, Retell AI, Bland AI, Synthflow | $0.05–0.30/min |
| Orchestration | n8n (self-host free / cloud $20+), Make.com | $0–100/mo |
| Data store | Airtable, Postgres | Free–$20/mo |
| Scheduling | Cal.com, Calendly | Free–$15/mo |
| Contracts/e-sign | PandaDoc, DocuSign | $19–49/mo |
| Payments | Razorpay (India), Stripe (global) | ~2% per transaction |
| LLM (the "brain") | Claude/GPT API, or self-hosted Hermes/Llama | $20–150/mo depending on volume |

**Ballpark all-in:** ₹20,000–₹55,000/month (~$250–650) to run a genuinely autonomous engine — far below the cost of a single SDR, and it never sleeps.

---

## 6. Compliance — read this before you flip the switch

**India-specific (as of 2026), for calling:**
- TRAI requires businesses making promotional calls to **register as a telemarketer** and route those calls through the designated **140-series** numbers — ordinary 10-digit numbers used for bulk promotional calling is itself a violation.
- Every call list must be **scrubbed against the NCPR/DND registry** before dialing, and DND applies even to a proprietor's personal mobile — "it's B2B" doesn't exempt you.
- Calls are only permitted **9am–9pm**.
- Under the DPDPA, you need a lawful basis/consent for processing personal data (including a scraped phone number), and any "stop calling me" request must be honored immediately.
- Enforcement has sharpened: 5+ unique complaints against a sender within 10 days can trigger automatic suspension of outgoing service.

**What this means practically:** pure unsolicited cold *calling* at scale is the highest-risk stage in this whole pipeline. The lower-risk, still-fully-automatable path is to **make email the cold first touch, and reserve AI voice calling for leads who've already opted in** — replied positively to an email, filled a form, or clicked "book a call" on the demo site. That gives you a lawful basis for the call and sidesteps most of the unsolicited-communication exposure, while still keeping calling in the loop as your engine's closing tool.

**Elsewhere:**
- Respect Google's terms and `robots.txt` posture when scraping — using the official Places API where feasible reduces this risk; third-party scrapers carry more exposure but are commonly used for lead gen.
- If you ever email or call outside India, CAN-SPAM (US) and GDPR (EU) apply and have their own unsubscribe/consent requirements.
- Disclosure: there's no blanket Indian legal requirement today for an AI voice agent to announce itself on a live call, but norms are shifting fast — building in a simple "you're speaking with an AI assistant for [Agency]" opener costs you nothing and insulates you from reputational risk as rules tighten.

None of this blocks the build — it just tells you where the "fully unattended" version needs a guardrail instead of a green light.

---

## 7. The honest take on "zero interference"

Fully autonomous is realistic for: scraping, MVP generation, email sequencing, reply classification, warm-lead calling, scheduling, proposal generation, and payment-link sending. Recommended guardrails rather than full blind autonomy:

- **Spend caps** on ad/tool usage so a bug can't run up a bill overnight.
- **A kill switch** — one command that pauses all outbound activity.
- **Light review on contracts** for the first few weeks (skim, don't rewrite) until you trust the proposal template completely — a contract is a binding document, and that's a business-risk call, not just an automation one.
- **The daily summary ping** from §2.8 is your entire "interference" — reading a message, not doing work.

Once you've watched it run clean for a few weeks, you can remove even the contract review step if you're comfortable with the template.

---

## 8. Build roadmap

1. **Phase 1 (1–2 weeks):** scraping → enrichment → MVP builder → cold email. Close deals manually once someone replies. Prove the demo-site angle converts.
2. **Phase 2:** wire in the AI voice agent for warm/opted-in leads only.
3. **Phase 3:** automate proposal → e-sign → payment → onboarding.
4. **Phase 4:** full loop live, orchestrator handling branching and follow-ups, daily summary dashboard, then scale to more cities/categories.

---

## 9. Next steps

If it's useful, I can build out any single piece of this next — the n8n workflow JSON, the MVP-generator prompt + template structure, the cold email sequence copy, or the AI voice agent's call-flow script. Just say which one.
