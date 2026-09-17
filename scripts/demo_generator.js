import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const DEMOS_DIR = path.join(__dirname, '..', 'demos');

if (!fs.existsSync(DEMOS_DIR)) {
  fs.mkdirSync(DEMOS_DIR, { recursive: true });
}

const NICHE_CONTENT = {
  trade: {
    template: 'trade_contractor.html',
    title: 'Plumbing & Mechanical Services',
    services: [
      { title: 'Emergency 24/7 Repairs', desc: 'Rapid response for urgent pipe bursts, water leaks, and heating failures.', icon: '⚡' },
      { title: 'System Installation & Upgrades', desc: 'High-efficiency modern equipment installations with guaranteed parts & labor warranty.', icon: '🛠️' },
      { title: 'Comprehensive Safety Inspection', desc: 'Preventative diagnostic checks using video cameras and pressure testing.', icon: '🔍' },
      { title: 'Maintenance & Servicing', desc: 'Scheduled seasonal tune-ups to keep your home running smoothly all year round.', icon: '🛡️' }
    ],
    reviews: [
      { name: 'Sarah Jenkins', loc: 'Homeowner', text: 'Arrived within 30 minutes on a Sunday morning! Fixed our burst pipe quickly and charged exactly what was quoted. Extremely professional.', stars: '★★★★★' },
      { name: 'David Miller', loc: 'Local Business Owner', text: 'Top-notch work. Cleaned up everything afterwards and explained the whole repair clearly. The only contractor we trust now.', stars: '★★★★★' }
    ]
  },
  medical: {
    template: 'medical_dental.html',
    title: 'Family Dental & Health Care',
    services: [
      { title: 'Preventative & Routine Exams', desc: 'Comprehensive digital scanning, cleanings, and proactive wellness diagnostics.', icon: '🩺' },
      { title: 'Restorative & Cosmetic Care', desc: 'Natural-looking aesthetic enhancements, crowns, and painless restorative procedures.', icon: '✨' },
      { title: 'Same-Day Emergency Care', desc: 'Prompt relief and priority appointments for sudden dental and medical discomfort.', icon: '🚨' },
      { title: 'Pediatric & Family Wellness', desc: 'Gentle, anxiety-free care tailored for children, teens, and adults.', icon: '👨‍👩‍👧' }
    ],
    reviews: [
      { name: 'Dr. Rebecca Adams', loc: 'Patient of 4 Years', text: 'The gentlest care I have ever experienced. The staff is welcoming, and there was virtually zero wait time in the clinic.', stars: '★★★★★' },
      { name: 'Michael Thornton', loc: 'Local Resident', text: 'State of the art clinic! They explained all my treatment options with zero pressure. Highly recommend to everyone in the area.', stars: '★★★★★' }
    ]
  },
  restaurant: {
    template: 'restaurant_dining.html',
    title: 'Artisan Dining & Pizzeria',
    services: [
      { title: 'Wood-Fired Signature Pizzas', desc: 'Slow-fermented artisan dough, San Marzano tomato sauce, and imported fresh mozzarella.', price: '$18 – $24' },
      { title: 'Handcrafted Fresh Pastas', desc: 'Daily hand-rolled ribbons of pasta tossed in rich slow-simmered sauces.', price: '$19 – $28' },
      { title: 'Farm-Fresh Salads & Antipasti', desc: 'Locally sourced heirloom produce, cured meats, and extra virgin olive oils.', price: '$12 – $16' },
      { title: 'Artisan Desserts & Gelato', desc: 'Classic house-made tiramisu, cannoli, and seasonal Italian fruit gelatos.', price: '$8 – $12' }
    ],
    reviews: [
      { name: 'Elena Rostova', loc: 'Food Enthusiast', text: 'Without a doubt the best crust and authentic flavors in town! Perfect atmosphere and incredible service every single visit.', stars: '★★★★★' },
      { name: 'Marcus Vance', loc: 'Verified Patron', text: 'Ordered takeout on a Friday night—it arrived piping hot and tasted like a 5-star restaurant meal. A true neighborhood gem.', stars: '★★★★★' }
    ]
  },
  professional: {
    template: 'professional_legal.html',
    title: 'Legal Counsel & Strategic Advisory',
    services: [
      { title: 'Commercial & Corporate Law', desc: 'Strategic contract drafting, regulatory compliance, mergers, and corporate restructuring.', icon: '📜' },
      { title: 'Dispute Resolution & Litigation', desc: 'Aggressive, high-stakes advocacy in state and federal courts with proven track records.', icon: '⚖️' },
      { title: 'Asset Protection & Estate Planning', desc: 'Comprehensive trusts, succession blueprints, and wealth preservation strategies.', icon: '🏛️' },
      { title: 'Real Estate & Land Transactions', desc: 'Complex property acquisitions, commercial leases, and zoning approvals.', icon: '🏢' }
    ],
    reviews: [
      { name: 'Arthur Pendelton', loc: 'Managing Director', text: 'Their counsel was instrumental in resolving our complex transaction smoothly. Decisive, razor-sharp, and always accessible.', stars: '★★★★★' },
      { name: 'Claire Montgomery', loc: 'Private Client', text: 'Handled our sensitive estate planning with absolute professionalism and clarity. We now have total peace of mind.', stars: '★★★★★' }
    ]
  },
  salon: {
    template: 'salon_beauty.html',
    title: 'Premium Beauty & Wellness Studio',
    services: [
      { title: 'Precision Haircuts & Styling', desc: 'Expert cuts, blowouts, and creative styling tailored to your face shape and lifestyle.', icon: '💇‍♀️' },
      { title: 'Color & Highlights', desc: 'Balayage, ombré, full color, and corrective treatments using premium professional products.', icon: '🎨' },
      { title: 'Luxury Spa Facials', desc: 'Deep-cleansing, anti-aging, and hydrating facials using clinical-grade serums and masks.', icon: '💆‍♀️' },
      { title: 'Nails & Beauty', desc: 'Gel manicures, pedicures, nail art, and beauty treatments in a relaxing environment.', icon: '💅' }
    ],
    reviews: [
      { name: 'Jessica Rivera', loc: 'Regular Client', text: 'My hair has never looked better! The stylists really listen and always deliver exactly what I envision. Absolutely love this place.', stars: '★★★★★' },
      { name: 'Priya Sharma', loc: 'First-Time Visitor', text: 'Came for a facial and left feeling like a completely new person. The ambiance is gorgeous and the staff is incredibly warm.', stars: '★★★★★' }
    ]
  },
  fitness: {
    template: 'fitness_gym.html',
    title: 'Premium Fitness & Training Center',
    services: [
      { title: 'Personal Training', desc: 'One-on-one sessions with certified coaches. Custom programs built for your body, your goals.', icon: '🏋️' },
      { title: 'Group HIIT Classes', desc: 'High-energy interval training that torches fat and builds functional strength in 45 minutes.', icon: '🔥' },
      { title: 'Yoga & Mobility', desc: 'Vinyasa flow, power yoga, and stretch sessions to improve flexibility and recover faster.', icon: '🧘' },
      { title: 'Strength & Conditioning', desc: 'Olympic lifting, powerlifting, and sport-specific strength programs for all levels.', icon: '💪' }
    ],
    reviews: [
      { name: 'James Rodriguez', loc: 'Member — 2 Years', text: 'Best gym I have ever been to. The coaches actually care about your progress. Down 40 lbs and stronger than ever.', stars: '★★★★★' },
      { name: 'Anita Desai', loc: 'New Member', text: 'Joined for the free trial and immediately signed up. The energy is incredible and the facility is spotless.', stars: '★★★★★' }
    ]
  }
};

function resolveNiche(nicheKey = 'trade') {
  const key = (nicheKey || '').toLowerCase();
  if (key.includes('plumb') || key.includes('electric') || key.includes('hvac') || key.includes('roof') || key.includes('contract') || key.includes('trade')) return 'trade';
  if (key.includes('dent') || key.includes('medic') || key.includes('clinic') || key.includes('doctor') || key.includes('physio')) return 'medical';
  if (key.includes('pizza') || key.includes('restaur') || key.includes('food') || key.includes('cafe') || key.includes('bistro') || key.includes('dining') || key.includes('baker')) return 'restaurant';
  if (key.includes('law') || key.includes('legal') || key.includes('cpa') || key.includes('account') || key.includes('estate') || key.includes('consult')) return 'professional';
  if (key.includes('salon') || key.includes('beauty') || key.includes('hair') || key.includes('barber') || key.includes('spa') || key.includes('nail') || key.includes('medspa')) return 'salon';
  if (key.includes('gym') || key.includes('fitness') || key.includes('yoga') || key.includes('crossfit') || key.includes('martial') || key.includes('boxing') || key.includes('pilates')) return 'fitness';
  return 'trade';
}

/**
 * Interactive Client-Side Modal & Toast Script injected into all demo sites
 */
const INTERACTIVE_DEMO_SCRIPT = `
<script>
  // Interactive Demo Script
  document.addEventListener('DOMContentLoaded', () => {
    // Add Click listener to any non-tel CTA
    document.querySelectorAll('a[href="#services"], a[href="#menu"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  });
</script>
`;

/**
 * Compiles and generates a modern HTML demo site
 */
export function generateDemoSite(prospectData, requestedTemplate = null) {
  const { businessName, slug, niche, city, phone, ownerEmail, customTitle, customAccent } = prospectData;
  const nicheKey = requestedTemplate ? requestedTemplate.toLowerCase() : resolveNiche(niche);
  const nicheData = NICHE_CONTENT[nicheKey] || NICHE_CONTENT['trade'];

  console.log(`\n🎨 Generating demo site for [${businessName}] using [${nicheData.template}]...`);

  const templatePath = path.join(TEMPLATES_DIR, nicheData.template);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf-8');

  // Build service cards
  let servicesHtml = '';
  if (nicheKey === 'restaurant') {
    servicesHtml = nicheData.services.map(s => `
      <div class="menu-item">
        <div>
          <div class="item-header">
            <span class="item-name">${s.title}</span>
            <span class="item-price">${s.price}</span>
          </div>
          <p class="item-desc">${s.desc}</p>
        </div>
        <span class="item-badge">Chef's Special</span>
      </div>
    `).join('\n');
  } else if (nicheKey === 'fitness') {
    servicesHtml = nicheData.services.map(s => `
      <div class="program-card">
        <div class="program-icon">${s.icon}</div>
        <div class="program-name">${s.title}</div>
        <div class="program-desc">${s.desc}</div>
        <div class="program-meta"><span class="program-tag">All Levels</span></div>
      </div>
    `).join('\n');
  } else {
    servicesHtml = nicheData.services.map(s => `
      <div class="service-card">
        <div class="service-icon">${s.icon}</div>
        <h3>${s.title}</h3>
        <p>${s.desc}</p>
      </div>
    `).join('\n');
  }

  // Build reviews
  const reviewsHtml = nicheData.reviews.map(r => `
    <div class="review-card">
      <div class="stars">${r.stars}</div>
      <p class="review-text">"${r.text}"</p>
      <div class="reviewer">${r.name}</div>
      <div class="reviewer-meta">${r.loc} · ${city || 'Local'}</div>
    </div>
  `).join('\n');

  // Inject placeholders
  htmlContent = htmlContent
    .replaceAll('{{BUSINESS_NAME}}', businessName || 'Apex Business')
    .replaceAll('{{NICHE_TITLE}}', customTitle || nicheData.title)
    .replaceAll('{{CITY}}', city || 'Local Area')
    .replaceAll('{{PHONE}}', phone || '(555) 234-5678')
    .replaceAll('{{EMAIL}}', ownerEmail || `contact@${slug}.com`)
    .replaceAll('{{SERVICES_CARDS}}', servicesHtml)
    .replaceAll('{{REVIEWS_CARDS}}', reviewsHtml);

  // Inject interactive script before </body>
  if (htmlContent.includes('</body>')) {
    htmlContent = htmlContent.replace('</body>', `${INTERACTIVE_DEMO_SCRIPT}\n</body>`);
  }

  // Target directory
  const targetDir = path.join(DEMOS_DIR, slug);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const demoFilePath = path.join(targetDir, 'index.html');
  fs.writeFileSync(demoFilePath, htmlContent, 'utf-8');

  console.log(`✅ Demo website generated: [demos/${slug}/index.html]`);

  return {
    slug,
    demoPath: demoFilePath,
    relativeUrl: `/demos/${slug}/index.html`,
    templateUsed: nicheData.template
  };
}
