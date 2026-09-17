/**
 * scripts/lib/payment.js
 * Payment Link Auto-Generation
 *
 * Supports: Razorpay Payment Links (India) + Stripe Payment Links (global)
 * Auto-generates a payment link for the selected package deposit.
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, '..', '..', 'config.json');

// ─── Package Definitions ─────────────────────────────────────────────────────
export const PACKAGES = {
  starter: {
    name: 'Starter Package',
    price: 750,
    deposit: 375,  // 50% upfront
    currency: 'USD',
    currencyINR: 62500,
    depositINR: 31250,
    description: 'High-converting single-page responsive site, mobile-optimized, tap-to-call, speed-optimized',
    deliverables: [
      'Modern responsive one-page website',
      'Mobile-first design with tap-to-call',
      'Speed optimization (under 3s load)',
      'Basic SEO meta tags',
      'Contact form integration',
      'Domain setup assistance'
    ],
    timeline: '5 business days'
  },
  growth: {
    name: 'Growth Package',
    price: 1500,
    deposit: 750,
    currency: 'USD',
    currencyINR: 125000,
    depositINR: 62500,
    description: 'Multi-page site with contact forms, local SEO, Google Business Profile connection',
    deliverables: [
      'Multi-page responsive website (up to 5 pages)',
      'Contact form with email notifications',
      'Local SEO meta setup + schema markup',
      'Google Business Profile optimization',
      'Google Maps embed',
      'Social media links integration',
      '30 days of post-launch support'
    ],
    timeline: '10 business days'
  },
  premium: {
    name: 'Premium Package',
    price: 3000,
    deposit: 1500,
    currency: 'USD',
    currencyINR: 250000,
    depositINR: 125000,
    description: 'Full site with booking engine, payment integration, content copywriting, ongoing support',
    deliverables: [
      'Full custom website (up to 10 pages)',
      'Online booking/appointment engine',
      'Payment integration (Razorpay/Stripe)',
      'Professional copywriting for all pages',
      'Advanced SEO with content strategy',
      'Google Analytics + Search Console setup',
      'Social media integration',
      '90 days of ongoing support + revisions'
    ],
    timeline: '15-20 business days'
  }
};

function loadPaymentConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return cfg.payments || {};
  } catch {
    return {};
  }
}

// ─── Razorpay Payment Link ───────────────────────────────────────────────────
async function createRazorpayLink({ businessName, email, phone, packageKey, amount, currency }) {
  const cfg = loadPaymentConfig();
  if (!cfg.razorpayKeyId || !cfg.razorpayKeySecret) {
    throw new Error('Razorpay keys not configured');
  }

  const auth = Buffer.from(`${cfg.razorpayKeyId}:${cfg.razorpayKeySecret}`).toString('base64');

  const body = {
    amount: amount * 100, // Razorpay uses paise
    currency: currency || 'INR',
    accept_partial: false,
    description: `${PACKAGES[packageKey]?.name || 'Website'} — 50% Deposit for ${businessName}`,
    customer: {
      name: businessName,
      email: email || '',
      contact: phone || ''
    },
    notify: { sms: !!phone, email: !!email },
    reminder_enable: true,
    notes: {
      business: businessName,
      package: packageKey,
      type: 'deposit'
    },
    callback_url: cfg.callbackUrl || '',
    callback_method: 'get',
    expire_by: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  };

  const res = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Razorpay ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    provider: 'razorpay',
    paymentUrl: data.short_url,
    paymentId: data.id,
    amount,
    currency
  };
}

// ─── Stripe Payment Link ─────────────────────────────────────────────────────
async function createStripeLink({ businessName, packageKey, amount, currency }) {
  const cfg = loadPaymentConfig();
  if (!cfg.stripeSecretKey) {
    throw new Error('Stripe secret key not configured');
  }

  // Create a Price first
  const priceParams = new URLSearchParams({
    'unit_amount': String(amount * 100),
    'currency': (currency || 'usd').toLowerCase(),
    'product_data[name]': `${PACKAGES[packageKey]?.name || 'Website'} — 50% Deposit`,
    'product_data[description]': `Website design deposit for ${businessName}`
  });

  const priceRes = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: priceParams.toString()
  });

  if (!priceRes.ok) throw new Error(`Stripe Price creation failed: ${priceRes.status}`);
  const priceData = await priceRes.json();

  // Create Payment Link
  const linkParams = new URLSearchParams({
    'line_items[0][price]': priceData.id,
    'line_items[0][quantity]': '1',
    'after_completion[type]': 'redirect',
    'after_completion[redirect][url]': cfg.successUrl || 'https://youragency.com/thank-you',
    'metadata[business]': businessName,
    'metadata[package]': packageKey
  });

  const linkRes = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: linkParams.toString()
  });

  if (!linkRes.ok) throw new Error(`Stripe Payment Link failed: ${linkRes.status}`);
  const linkData = await linkRes.json();

  return {
    provider: 'stripe',
    paymentUrl: linkData.url,
    paymentId: linkData.id,
    amount,
    currency: currency || 'USD'
  };
}

// ─── UPI & WhatsApp Payment Engine ───────────────────────────────────────────
/**
 * Generates a direct UPI payment intent, dynamic QR code, and WhatsApp confirmation link.
 */
export function createUpiPaymentLink(opts = {}) {
  const { businessName = 'Valued Client', packageKey = 'growth' } = opts;
  const cfg = loadPaymentConfig();
  const upiCfg = cfg.upi || {};
  const upiId = upiCfg.upiId || '6202442690@jio';
  const payeeName = upiCfg.payeeName || 'Piyush Singh';
  const whatsappNumber = upiCfg.whatsappIntl || '916202442690';
  const pkg = PACKAGES[packageKey] || PACKAGES.growth;

  const note = encodeURIComponent(`${pkg.name} Deposit - ${businessName}`);
  const upiIntentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${pkg.depositINR}&cu=INR&tn=${note}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(upiIntentUrl)}`;

  const whatsappMsg = encodeURIComponent(`Hi Piyush, I have completed the website deposit payment of ₹${pkg.depositINR.toLocaleString('en-IN')} for ${businessName}. Attached is my payment screenshot for confirmation.`);
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMsg}`;

  return {
    provider: 'upi',
    upiId,
    payeeName,
    package: pkg.name,
    depositAmount: pkg.depositINR,
    amount: pkg.depositINR,
    amountINR: pkg.depositINR,
    amountUSD: pkg.deposit,
    currency: 'INR',
    paymentUrl: upiIntentUrl,
    qrCodeUrl,
    whatsappUrl,
    whatsappNumber: upiCfg.whatsappNumber || '6202442690',
    instructions: `Pay ₹${pkg.depositINR.toLocaleString('en-IN')} via GPay / PhonePe / Paytm / BHIM to UPI ID: ${upiId} and send screenshot to WhatsApp: +91 ${upiCfg.whatsappNumber || '6202442690'}`
  };
}

// ─── Master: createPaymentLink ───────────────────────────────────────────────
/**
 * Create a payment link for a package deposit.
 *
 * @param {object} opts
 * @param {string} opts.businessName
 * @param {string} opts.email
 * @param {string} opts.phone
 * @param {string} opts.packageKey - 'starter' | 'growth' | 'premium'
 * @param {string} opts.preferredProvider - 'upi' | 'razorpay' | 'stripe' | 'auto'
 * @returns {Promise<{provider, paymentUrl, paymentId, amount, currency}>}
 */
export async function createPaymentLink(opts = {}) {
  const { businessName, email, phone, packageKey = 'starter', preferredProvider = 'auto' } = opts;
  const pkg = PACKAGES[packageKey];
  if (!pkg) throw new Error(`Unknown package: ${packageKey}`);

  const cfg = loadPaymentConfig();

  // If UPI requested or configured as primary
  if (preferredProvider === 'upi' || cfg.preferredMethod === 'upi') {
    const upiResult = createUpiPaymentLink({ businessName, packageKey });
    console.log(`  📱 UPI payment intent generated: ${upiResult.upiId} (₹${upiResult.amountINR})`);
    return upiResult;
  }

  const providers = [];
  if (preferredProvider === 'razorpay' || (preferredProvider === 'auto' && cfg.razorpayKeyId)) {
    providers.push({
      name: 'razorpay',
      fn: () => createRazorpayLink({ businessName, email, phone, packageKey, amount: pkg.depositINR, currency: 'INR' })
    });
  }
  if (preferredProvider === 'stripe' || preferredProvider === 'auto' && cfg.stripeSecretKey) {
    providers.push({
      name: 'stripe',
      fn: () => createStripeLink({ businessName, packageKey, amount: pkg.deposit, currency: 'USD' })
    });
  }

  for (const provider of providers) {
    try {
      const result = await provider.fn();
      console.log(`  💳 Payment link created via ${provider.name}: ${result.paymentUrl}`);
      return result;
    } catch (err) {
      console.warn(`  ⚠️  ${provider.name} payment link failed: ${err.message}`);
    }
  }

  // Fallback to UPI
  return createUpiPaymentLink({ businessName, packageKey });
}

// ─── CLI Test ─────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('\n💳 Payment Link Test\n');
  console.log('Available packages:');
  for (const [key, pkg] of Object.entries(PACKAGES)) {
    console.log(`  ${key}: $${pkg.price} (₹${pkg.currencyINR}) — Deposit: $${pkg.deposit}`);
  }
  createPaymentLink({ businessName: 'Test Business', packageKey: 'starter' })
    .then(r => console.log('\n✅ Result:', r))
    .catch(e => console.error('❌', e.message));
}
