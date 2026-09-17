/**
 * scripts/cloudflare_worker.js
 * Cloudflare Worker API for Apex AI Web Studio
 * Runs 24/7 on Cloudflare's edge — works even when your PC is off.
 *
 * Endpoints:
 *   GET  /api/prospects         — List all prospects
 *   GET  /api/prospects/:slug   — Get one prospect
 *   POST /api/prospects         — Create/update prospect
 *   PATCH /api/prospects/:slug  — Update stage
 *   POST /api/audit             — Run website audit
 *   POST /api/demo              — Generate demo site
 *   POST /api/outreach          — Generate outreach
 *   POST /api/hermes            — Run Hermes orchestrator
 *   GET  /api/status            — Pipeline summary
 *   GET  /api/health            — Health check
 *
 * ponytail: single-file worker, no npm deps, D1 for storage
 */

export default {
  // ─── HTTP HANDLER ────────────────────────────────────────────────
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
        status: 204
      });
    }

    try {
      // Health check
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
      }

      // Pipeline summary
      if (path === '/api/status' && method === 'GET') {
        const summary = await getPipelineSummary(env);
        return jsonResponse(summary);
      }

      // List prospects
      if (path === '/api/prospects' && method === 'GET') {
        const prospects = await env.DB.prepare('SELECT * FROM prospects ORDER BY created_at DESC').all();
        return jsonResponse({ prospects: prospects.results });
      }

      // Get single prospect
      if (path.startsWith('/api/prospects/') && method === 'GET') {
        const slug = path.split('/').pop();
        const row = await env.DB.prepare('SELECT * FROM prospects WHERE slug = ?').bind(slug).first();
        if (!row) return jsonResponse({ error: 'Not found' }, 404);
        return jsonResponse(row);
      }

      // Create/update prospect
      if (path === '/api/prospects' && method === 'POST') {
        const body = await request.json();
        const result = await upsertProspect(env, body);
        return jsonResponse(result);
      }

      // Update stage
      if (path.startsWith('/api/prospects/') && method === 'PATCH') {
        const slug = path.split('/').pop();
        const { stage } = await request.json();
        await env.DB.prepare('UPDATE prospects SET stage = ?, last_action = ? WHERE slug = ?')
          .bind(stage, new Date().toISOString(), slug).run();
        return jsonResponse({ slug, stage, updated: true });
      }

      // Run audit
      if (path === '/api/audit' && method === 'POST') {
        const { businessName, url: siteUrl, niche, city } = await request.json();
        const audit = await runAudit(businessName, siteUrl, niche, city);
        return jsonResponse(audit);
      }

      // Generate demo
      if (path === '/api/demo' && method === 'POST') {
        const { slug, template } = await request.json();
        const demo = await generateDemo(slug, template, env);
        return jsonResponse(demo);
      }

      // Generate outreach
      if (path === '/api/outreach' && method === 'POST') {
        const { slug } = await request.json();
        const outreach = await generateOutreach(slug, env);
        return jsonResponse(outreach);
      }

      // Run Hermes
      if (path === '/api/hermes' && method === 'POST') {
        const { dryRun } = await request.json().catch(() => ({}));
        const result = await runHermes(env, dryRun);
        return jsonResponse(result);
      }

      return jsonResponse({ error: 'Not found', path }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  },

  // ─── CRON HANDLER (autopilot) ───────────────────────────────────
  async scheduled(event, env) {
    console.log(`[CRON] Autopilot triggered at ${new Date().toISOString()}`);
    try {
      await runHermes(env, false);
      console.log('[CRON] Autopilot completed successfully');
    } catch (e) {
      console.error('[CRON] Autopilot error:', e.message);
    }
  }
};

// ─── HELPERS ────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    }
  });
}

function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function getPipelineSummary(env) {
  const rows = await env.DB.prepare('SELECT stage, COUNT(*) as count FROM prospects GROUP BY stage').all();
  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM prospects').first();
  const summary = { total_prospects: total?.count || 0 };
  for (const r of rows.results) {
    summary[r.stage.toLowerCase()] = r.count;
  }
  summary.pipeline_value_usd = (summary.discovered || 0) * 1500 + (summary.audited || 0) * 1500 +
    (summary.demo_generated || 0) * 1500 + (summary.outreach_drafted || 0) * 1500;
  return summary;
}

async function upsertProspect(env, data) {
  const slug = data.slug || slugify(data.businessName);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO prospects (slug, business_name, url, niche, city, owner_name, owner_email, phone, stage, overall_score, demo_path, outreach_path, created_at, last_action)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      business_name=excluded.business_name, url=excluded.url, niche=excluded.niche, city=excluded.city,
      owner_name=excluded.owner_name, owner_email=excluded.owner_email, phone=excluded.phone,
      stage=excluded.stage, overall_score=excluded.overall_score, demo_path=excluded.demo_path,
      outreach_path=excluded.outreach_path, last_action=excluded.last_action
  `).bind(slug, data.businessName || '', data.url || '', data.niche || '', data.city || '',
    data.ownerName || null, data.ownerEmail || null, data.phone || null,
    data.stage || 'DISCOVERED', data.overallScore || null,
    data.demoPath || null, data.outreachPath || null, now, now).run();
  return { slug, created: true };
}

// ─── AUDIT ENGINE (Cloudflare-compatible) ─────────────────────────

async function runAudit(businessName, url, niche, city) {
  const slug = slugify(businessName);
  let designScore = 5, mobileScore = 5, speedScore = 5, seoScore = 5, conversionScore = 5;

  if (url && url !== 'https://example.com') {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
      const html = await res.text();

      // Design heuristics
      const hasViewport = html.includes('viewport');
      const hasModernFont = /font-family.*?(Inter|Poppins|Outfit|Manrope)/i.test(html);
      const hasGradient = /linear-gradient|radial-gradient/.test(html);
      const hasFlexbox = /display:\s*flex|display:\s*grid/.test(html);
      mobileScore = hasViewport ? 8 : 4;
      designScore = (hasModernFont ? 2 : 0) + (hasGradient ? 2 : 0) + (hasFlexbox ? 2 : 0) + 4;

      // SEO
      const hasTitle = /<title[^>]*>[^<]+<\/title>/i.test(html);
      const hasMetaDesc = /meta.*?description/i.test(html);
      const hasH1 = /<h1/i.test(html);
      const hasSchema = /application\/ld\+json/.test(html);
      seoScore = (hasTitle ? 2 : 0) + (hasMetaDesc ? 2 : 0) + (hasH1 ? 2 : 0) + (hasSchema ? 2 : 0) + 2;

      // Speed (rough: page size)
      speedScore = html.length < 50000 ? 8 : html.length < 200000 ? 6 : 4;

      // Conversion
      const hasCTA = /call.to.action|book.now|get.quote|contact|sign.up/i.test(html);
      const hasForm = /<form/i.test(html);
      conversionScore = (hasCTA ? 3 : 0) + (hasForm ? 3 : 0) + 4;
    } catch {
      // Can't reach site — assume outdated
      speedScore = 3;
    }
  }

  const overallScore = Math.round((designScore + mobileScore + speedScore + seoScore + conversionScore) / 5);

  const audit = {
    slug, businessName, url, niche, city,
    designScore, mobileScore, speedScore, seoScore, conversionScore, overallScore,
    topIssues: [
      overallScore < 5 ? 'Website appears outdated or unreachable' : 'Design could be more modern',
      !url ? 'No website found — prime opportunity' : 'Missing conversion elements',
      'Mobile experience needs improvement'
    ],
    quickWins: [
      'Modern responsive redesign with mobile-first approach',
      'Add prominent call-to-action and contact form',
      'Implement local SEO with Google Business Profile integration'
    ],
    timestamp: new Date().toISOString()
  };

  return audit;
}

// ─── DEMO GENERATOR (Cloudflare KV) ──────────────────────────────

const DEMO_TEMPLATES = {
  restaurant: (name, city) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} | Modern Dining Experience</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}:root{--primary:#1a1a2e;--accent:#e94560;--text:#f5f5f5;--bg:#0f0f23}body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text)}.hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;background:linear-gradient(135deg,var(--primary),var(--bg));padding:2rem}.hero h1{font-family:'Playfair Display',serif;font-size:clamp(2.5rem,6vw,5rem);margin-bottom:1rem}.hero h1 span{color:var(--accent)}.hero p{font-size:1.2rem;opacity:.8;margin-bottom:2rem;max-width:500px;margin-inline:auto}.btn{display:inline-block;padding:1rem 2.5rem;background:var(--accent);color:#fff;text-decoration:none;border-radius:50px;font-weight:600;transition:transform .2s}.btn:hover{transform:scale(1.05)}section{padding:5rem 2rem;text-align:center}section h2{font-family:'Playfair Display',serif;font-size:2rem;margin-bottom:2rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2rem;max-width:1000px;margin:0 auto}.card{background:rgba(255,255,255,.05);border-radius:16px;padding:2rem;border:1px solid rgba(255,255,255,.1)}.card h3{margin-bottom:.5rem;color:var(--accent)}footer{text-align:center;padding:3rem;opacity:.6;font-size:.9rem}</style></head><body><div class="hero"><div><h1><span>${name}</span></h1><p>Experience the finest dining in ${city}. Fresh ingredients, exceptional flavors, unforgettable moments.</p><a href="#menu" class="btn">View Menu</a></div></div><section id="menu"><h2>Our Specialties</h2><div class="grid"><div class="card"><h3>Chef's Selection</h3><p>Curated seasonal dishes crafted with locally sourced ingredients.</p></div><div class="card"><h3>Craft Cocktails</h3><p>Handcrafted drinks paired perfectly with every dish.</p></div><div class="card"><h3>Private Events</h3><p>Host your special occasions in our elegant private dining room.</p></div></div></section><footer>© 2026 ${name} · ${city}</footer></body></html>`,
  medical: (name, city) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} | Modern Dental Care</title><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}:root{--primary:#0ea5e9;--bg:#f8fafc;--text:#1e293b;--card:#fff}body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--text)}.hero{min-height:60vh;display:flex;align-items:center;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;padding:4rem 2rem}.hero-content{max-width:600px;margin:0 auto;text-align:center}.hero h1{font-size:clamp(2rem,5vw,3.5rem);margin-bottom:1rem}.hero p{font-size:1.1rem;opacity:.9;margin-bottom:2rem}.btn{display:inline-block;padding:1rem 2.5rem;background:#fff;color:var(--primary);text-decoration:none;border-radius:50px;font-weight:600}.services{padding:5rem 2rem;text-align:center}h2{font-size:2rem;margin-bottom:2rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:2rem;max-width:1000px;margin:0 auto}.card{background:var(--card);border-radius:16px;padding:2rem;box-shadow:0 4px 20px rgba(0,0,0,.05)}.card h3{color:var(--primary);margin-bottom:.5rem}footer{text-align:center;padding:3rem;opacity:.6}</style></head><body><div class="hero"><div class="hero-content"><h1>${name}</h1><p>Modern dental care for the whole family. Advanced technology, gentle touch, beautiful results.</p><a href="#services" class="btn">Book Appointment</a></div></div><section class="services" id="services"><h2>Our Services</h2><div class="grid"><div class="card"><h3>General Dentistry</h3><p>Comprehensive checkups, cleanings, and preventive care.</p></div><div class="card"><h3>Cosmetic Dentistry</h3><p>Teeth whitening, veneers, and smile makeovers.</p></div><div class="card"><h3>Emergency Care</h3><p>Same-day appointments for dental emergencies.</p></div></div></section><footer>© 2026 ${name} · ${city}</footer></body></html>`,
  trade: (name, city) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} | Trusted ${city} Contractors</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}:root{--primary:#f59e0b;--bg:#111827;--text:#f9fafb}body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text)}.hero{min-height:80vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem;background:linear-gradient(135deg,#1f2937,#111827)}.hero h1{font-size:clamp(2rem,5vw,4rem);margin-bottom:1rem}.hero h1 span{color:var(--primary)}.hero p{font-size:1.1rem;opacity:.7;margin-bottom:2rem;max-width:500px;margin-inline:auto}.btn{display:inline-block;padding:1rem 2.5rem;background:var(--primary);color:#000;text-decoration:none;border-radius:8px;font-weight:600;font-size:1rem}.services{padding:5rem 2rem;text-align:center}h2{font-size:2rem;margin-bottom:2rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:2rem;max-width:1000px;margin:0 auto}.card{background:rgba(255,255,255,.05);border-radius:12px;padding:2rem;border:1px solid rgba(255,255,255,.1)}.card h3{color:var(--primary);margin-bottom:.5rem}footer{text-align:center;padding:3rem;opacity:.5;font-size:.9rem}</style></head><body><div class="hero"><div><h1><span>${name}</span></h1><p>Professional ${city} contractors. Licensed, insured, and trusted by hundreds of homeowners.</p><a href="#contact" class="btn">Get Free Quote</a></div></div><section class="services" id="contact"><h2>What We Do</h2><div class="grid"><div class="card"><h3>Residential</h3><p>Home repairs, renovations, and custom builds.</p></div><div class="card"><h3>Commercial</h3><p>Office fitouts, maintenance, and tenant improvements.</p></div><div class="card"><h3>Emergency</h3><p>24/7 emergency repair services.</p></div></div></section><footer>© 2026 ${name} · ${city}</footer></body></html>`
};

async function generateDemo(slug, template, env) {
  const row = await env.DB.prepare('SELECT * FROM prospects WHERE slug = ?').bind(slug).first();
  if (!row) return { error: 'Prospect not found' };

  const niche = row.niche || 'trade';
  const tmpl = DEMO_TEMPLATES[niche] || DEMO_TEMPLATES.trade;
  const html = tmpl(row.business_name, row.city);

  // Store in KV
  await env.DEMOS.put(`demos/${slug}/index.html`, html, {
    metadata: { contentType: 'text/html' }
  });

  await env.DB.prepare('UPDATE prospects SET stage = ?, demo_path = ?, last_action = ? WHERE slug = ?')
    .bind('DEMO_GENERATED', `/demos/${slug}/index.html`, new Date().toISOString(), slug).run();

  return { slug, demoPath: `/demos/${slug}/index.html`, template: niche };
}

// ─── OUTREACH GENERATOR ──────────────────────────────────────────

async function generateOutreach(slug, env) {
  const row = await env.DB.prepare('SELECT * FROM prospects WHERE slug = ?').bind(slug).first();
  if (!row) return { error: 'Prospect not found' };

  const calUrl = 'https://cal.com/piyush-usctna/15min';
  const demoUrl = `https://apex-webstudio.pages.dev/demos/${slug}/index.html`;

  const touch1 = `Subject: Free website redesign for ${row.business_name}

Hi ${row.owner_name || 'there'},

I noticed ${row.business_name} in ${row.city} and built a quick website redesign demo for you.

Here's what I improved:
1. Modern mobile-first design (your current site isn't mobile-friendly)
2. Faster loading speed and better SEO

→ Live demo: ${demoUrl}

Would love your honest feedback. If you like it, we can discuss making it permanent.

Best,
Piyush Singh
Apex AI Web Studio
+91 6202442690

Reply STOP and I won't follow up.`;

  const touch2 = `Subject: Quick follow-up on your ${row.business_name} demo

Hi ${row.owner_name || 'there'},

Just checking if you had a chance to see the demo site I built for ${row.business_name}?

It's live here: ${demoUrl}

I can have this live on your domain in 5-7 days. Happy to jump on a quick 15-min call to walk you through it:
${calUrl}

— Piyush`;

  const outreach = { slug, touch1, touch2, calUrl, demoUrl };

  await env.OUTREACH.put(`outreach/${slug}.md`, `# Outreach: ${row.business_name}\n\n## Touch 1\n${touch1}\n\n## Touch 2\n${touch2}`);
  await env.DB.prepare('UPDATE prospects SET stage = ?, outreach_path = ?, last_action = ? WHERE slug = ?')
    .bind('OUTREACH_DRAFTED', `/outreach/${slug}.md`, new Date().toISOString(), slug).run();

  return outreach;
}

// ─── HERMES ORCHESTRATOR ─────────────────────────────────────────

async function runHermes(env, dryRun = false) {
  const prospects = await env.DB.prepare('SELECT * FROM prospects ORDER BY created_at DESC').all();
  const actions = [];

  for (const p of prospects.results) {
    if (p.stage === 'DISCOVERED' && p.url && !dryRun) {
      actions.push({ slug: p.slug, action: 'audit', from: 'DISCOVERED' });
      if (!dryRun) {
        const audit = await runAudit(p.business_name, p.url, p.niche, p.city);
        await env.DB.prepare('UPDATE prospects SET stage = ?, overall_score = ?, last_action = ? WHERE slug = ?')
          .bind('AUDITED', audit.overallScore, new Date().toISOString(), p.slug).run();
      }
    }
    if (p.stage === 'AUDITED' && !dryRun) {
      actions.push({ slug: p.slug, action: 'demo', from: 'AUDITED' });
      if (!dryRun) await generateDemo(p.slug, null, env);
    }
    if (p.stage === 'DEMO_GENERATED' && !dryRun) {
      actions.push({ slug: p.slug, action: 'outreach', from: 'DEMO_GENERATED' });
      if (!dryRun) await generateOutreach(p.slug, env);
    }
  }

  return { actionsCount: actions.length, actions, dryRun, timestamp: new Date().toISOString() };
}
