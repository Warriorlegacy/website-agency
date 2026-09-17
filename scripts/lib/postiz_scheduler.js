/**
 * scripts/lib/postiz_scheduler.js
 * Postiz integration — social media scheduling for client demo showcases
 *
 * Uses Postiz self-hosted API to auto-schedule social media posts showcasing
 * generated demo sites across Instagram, LinkedIn, X, TikTok, etc.
 *
 * ponytail: direct HTTP calls to Postiz API, no npm deps
 */
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

  if (!apiKey) {
    console.log('  📱 [Postiz] No API key configured — skipping social post');
    return { status: 'skipped', reason: 'no_api_key' };
  }

  const { slug, businessName, niche, demoUrl, city } = opts;

  const captions = {
    restaurant: `🍽️ Just built a modern website redesign for ${businessName} in ${city}! Mobile-first, fast, and designed to convert. Check it out: ${demoUrl}`,
    medical: `🏥 New project spotlight: ${businessName} in ${city} got a complete website overhaul. Patient-friendly, SEO-optimized, and blazing fast: ${demoUrl}`,
    trade: `🔧 Another happy client: ${businessName} in ${city} now has a website that works as hard as they do. Tap-to-call, mobile-first: ${demoUrl}`,
    professional: `⚖️ Professional web design for ${businessName} in ${city}. Clean, trustworthy, conversion-focused: ${demoUrl}`,
    salon: `💇‍♀️ Beauty meets technology: ${businessName} in ${city} now has a stunning online presence: ${demoUrl}`,
    fitness: `💪 ${businessName} in ${city} just leveled up their digital game. Modern, fast, member-friendly: ${demoUrl}`
  };

  const caption = captions[niche] || `🚀 New website redesign for ${businessName}! ${demoUrl}`;

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
        schedule_date: new Date(Date.now() + 3600000).toISOString(),
        integration_ids: postiz.integrationIds || []
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`  ⚠️ Postiz API error: ${err.slice(0, 200)}`);
      return { status: 'error', error: err.slice(0, 200) };
    }

    const data = await res.json();
    console.log(`  📱 [Postiz] Scheduled social post for ${businessName}`);
    return { status: 'scheduled', postId: data.id, caption };
  } catch (e) {
    console.warn(`  ⚠️ Postiz connection failed: ${e.message}`);
    return { status: 'error', error: e.message };
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
