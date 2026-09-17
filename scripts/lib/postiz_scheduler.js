/**
 * scripts/lib/postiz_scheduler.js
 * Postiz integration — social media scheduling for client demo showcases
 *
 * Uses Postiz self-hosted API to auto-schedule social media posts showcasing
 * generated demo sites across Instagram, LinkedIn, X, TikTok, etc.
 *
 * ponytail: direct HTTP calls to Postiz API, no npm deps
 */
import fs from 'fs';
import path from 'path';
import { loadAppConfig } from './config_loader.js';

/**
 * Post a demo showcase to social media via Postiz.
 * @param {object} opts - { slug, businessName, niche, demoUrl, city }
 * @returns {Promise<object>} Post result
 */
export async function scheduleDemoShowcase(opts = {}) {
  const cfg = loadAppConfig();
  const postiz = cfg.integrations?.postiz || {};
  const apiUrl = postiz.apiUrl || 'http://localhost:3000';
  const apiKey = postiz.apiKey || '';

  const { slug, businessName, niche, demoUrl, city } = opts;

  const captions = {
    restaurant: `🍽️ Just built a modern website redesign for ${businessName} in ${city}! Mobile-first, fast, and designed to convert. Check it out: ${demoUrl} #WebDesign #RestaurantMarketing`,
    medical: `🏥 New project spotlight: ${businessName} in ${city} got a complete website overhaul. Patient-friendly, SEO-optimized, and blazing fast: ${demoUrl} #HealthcareWeb #DentalDesign`,
    trade: `🔧 Another happy client: ${businessName} in ${city} now has a website that works as hard as they do. Tap-to-call, mobile-first: ${demoUrl} #ContractorMarketing #LocalSEO`,
    professional: `⚖️ Professional web design for ${businessName} in ${city}. Clean, trustworthy, conversion-focused: ${demoUrl} #LegalMarketing #WebDevelopment`,
    salon: `💇‍♀️ Beauty meets technology: ${businessName} in ${city} now has a stunning online presence: ${demoUrl} #SalonMarketing #WebDesign`,
    fitness: `💪 ${businessName} in ${city} just leveled up their digital game. Modern, fast, member-friendly: ${demoUrl} #GymMarketing #FitnessBusiness`
  };

  const caption = captions[niche] || `🚀 New website redesign for ${businessName} in ${city}! Mobile-first, sub-second load times: ${demoUrl} #WebDesign #SmallBusiness`;
  const platforms = ['linkedin', 'x', 'instagram'];
  const postItem = {
    id: `post_${slug}_${Date.now()}`,
    slug,
    businessName,
    niche,
    city,
    demoUrl,
    caption,
    platforms,
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    status: 'queued',
    createdAt: new Date().toISOString()
  };

  // Always persist to local showcase queue
  try {
    const queueFile = path.join(process.cwd(), 'outreach', 'social_queue.json');
    let queue = [];
    if (fs.existsSync(queueFile)) {
      try { queue = JSON.parse(fs.readFileSync(queueFile, 'utf-8')); } catch {}
    }
    const idx = queue.findIndex(q => q.slug === slug);
    if (idx >= 0) queue[idx] = postItem;
    else queue.push(postItem);
    fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
    console.log(`  📱 [Postiz] Staged social showcase for ${businessName} in outreach/social_queue.json`);
  } catch (e) {
    console.warn(`  ⚠️ Postiz queue error: ${e.message}`);
  }

  if (!apiKey) {
    return { status: 'queued_locally', id: postItem.id, caption };
  }

  try {
    const res = await fetch(`${apiUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        content: caption,
        platforms: ['linkedin', 'x'],
        schedule_date: postItem.scheduledAt,
        integration_ids: postiz.integrationIds || []
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`  ⚠️ Postiz API returned ${res.status}: ${err.slice(0, 200)}`);
      return { status: 'queued_locally', reason: 'api_unreachable', caption };
    }

    const data = await res.json();
    console.log(`  📱 [Postiz] Live scheduled social post for ${businessName} (ID: ${data.id})`);
    return { status: 'scheduled', postId: data.id, caption };
  } catch (e) {
    console.warn(`  ⚠️ Postiz remote connection failed: ${e.message} — queued locally`);
    return { status: 'queued_locally', caption };
  }
}

/**
 * Schedule a batch of demo showcases.
 * @param {Array} leads - Array of lead objects
 * @returns {Promise<Array>} Results per lead
 */
export async function scheduleBatchShowcases(leads = []) {
  const results = [];
  for (const lead of leads) {
    const demoUrl = lead.demoUrl || `https://warriorlegacy.github.io/website-agency/demos/${lead.slug}/index.html`;
    const result = await scheduleDemoShowcase({
      slug: lead.slug,
      businessName: lead.businessName,
      niche: lead.niche,
      demoUrl,
      city: lead.city
    });
    results.push({ slug: lead.slug, ...result });
  }
  return results;
}
