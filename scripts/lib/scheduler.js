/**
 * scripts/lib/scheduler.js
 * Meeting Scheduling Integration (Cal.com API)
 *
 * Features:
 *   - Check availability for a date range
 *   - Create bookings directly via API
 *   - Generate booking links for leads
 *
 * ponytail: zero npm deps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, '..', '..', 'config.json');

function loadSchedulingConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    const scheduling = cfg.scheduling || {};
    return {
      ...scheduling,
      calcomApiKey: scheduling.calcomApiKey || process.env.CAL_API_KEY || ''
    };
  } catch {
    return { calcomApiKey: process.env.CAL_API_KEY || '' };
  }
}

// ─── Cal.com API Client ──────────────────────────────────────────────────────
async function calcomRequest(endpoint, opts = {}) {
  const cfg = loadSchedulingConfig();
  if (!cfg.calcomApiKey) throw new Error('Cal.com API key not configured');

  const baseUrl = cfg.calcomBaseUrl || 'https://api.cal.com/v1';
  const url = `${baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${cfg.calcomApiKey}`;

  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...opts.headers
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Cal.com ${res.status}: ${errText.slice(0, 200)}`);
  }

  return res.json();
}

// ─── Get Available Slots ─────────────────────────────────────────────────────
/**
 * Get available time slots for a given date range.
 *
 * @param {object} opts
 * @param {string} opts.startDate - ISO date string (e.g., '2026-09-20')
 * @param {string} opts.endDate - ISO date string
 * @param {number} opts.eventTypeId - Cal.com event type ID
 * @returns {Promise<{slots: Array<{time: string, available: boolean}>}>}
 */
export async function getAvailability({ startDate, endDate, eventTypeId } = {}) {
  const cfg = loadSchedulingConfig();
  const evtId = eventTypeId || cfg.defaultEventTypeId;
  if (!evtId) throw new Error('No eventTypeId configured');

  const start = startDate || new Date().toISOString().split('T')[0];
  const end = endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const data = await calcomRequest(`/availability?dateFrom=${start}&dateTo=${end}&eventTypeId=${evtId}`);
  return data;
}

// ─── Create a Booking ────────────────────────────────────────────────────────
/**
 * Create a booking for a lead.
 *
 * @param {object} opts
 * @param {string} opts.name - Lead/attendee name
 * @param {string} opts.email - Lead email
 * @param {string} opts.startTime - ISO datetime string
 * @param {number} opts.eventTypeId
 * @param {string} opts.notes - Optional notes
 * @returns {Promise<{bookingId, startTime, meetingUrl}>}
 */
export async function createBooking({ name, email, startTime, eventTypeId, notes } = {}) {
  const cfg = loadSchedulingConfig();
  const evtId = eventTypeId || cfg.defaultEventTypeId;
  if (!evtId) throw new Error('No eventTypeId configured');

  const data = await calcomRequest('/bookings', {
    method: 'POST',
    body: {
      eventTypeId: evtId,
      start: startTime,
      responses: {
        name,
        email,
        notes: notes || 'Booked via Apex AI Web Studio autonomous pipeline'
      },
      metadata: {},
      timeZone: cfg.timezone || 'Asia/Kolkata',
      language: 'en'
    }
  });

  return {
    bookingId: data.id || data.uid,
    startTime: data.startTime,
    endTime: data.endTime,
    meetingUrl: data.metadata?.videoCallUrl || data.meetingUrl || null,
    status: data.status
  };
}

// ─── Generate Booking Link ───────────────────────────────────────────────────
/**
 * Generate a shareable booking link for a lead.
 * This creates a pre-filled Cal.com link.
 *
 * @param {object} opts
 * @param {string} opts.name - Lead name (pre-fill)
 * @param {string} opts.email - Lead email (pre-fill)
 * @param {string} opts.businessName - For notes
 * @returns {string} Booking URL
 */
export function generateBookingLink({ name, email, businessName } = {}) {
  const cfg = loadSchedulingConfig();
  const baseUrl = cfg.calcomBookingUrl || cfg.bookingUrl || 'https://cal.com/youragency/discovery-call';

  const params = new URLSearchParams();
  if (name) params.set('name', name);
  if (email) params.set('email', email);
  if (businessName) params.set('notes', `Discovery call for ${businessName}`);

  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

// ─── Fallback: Simple Calendly Link ──────────────────────────────────────────
export function generateCalendlyLink({ name, email } = {}) {
  const cfg = loadSchedulingConfig();
  const url = cfg.calendlyUrl || 'https://calendly.com/youragency/discovery-call';

  const params = new URLSearchParams();
  if (name) params.set('name', name);
  if (email) params.set('email', email);

  const query = params.toString();
  return query ? `${url}?${query}` : url;
}

// ─── Master: getBookingLink ──────────────────────────────────────────────────
/**
 * Get the best available booking link for a lead.
 * Uses Cal.com if configured, falls back to Calendly, then a generic placeholder.
 */
export function getBookingLink(leadData = {}) {
  const cfg = loadSchedulingConfig();

  if (cfg.calcomApiKey || cfg.calcomBookingUrl) {
    return generateBookingLink({
      name: leadData.ownerName,
      email: leadData.ownerEmail,
      businessName: leadData.businessName
    });
  }

  if (cfg.calendlyUrl) {
    return generateCalendlyLink({
      name: leadData.ownerName,
      email: leadData.ownerEmail
    });
  }

  return `https://youragency.com/book-a-call?name=${encodeURIComponent(leadData.ownerName || '')}&email=${encodeURIComponent(leadData.ownerEmail || '')}`;
}

// ─── CLI Test ─────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('\n📅 Scheduler Test\n');
  const link = getBookingLink({ ownerName: 'Marco Rossi', ownerEmail: 'marco@test.com', businessName: "Rossi's Pizzeria" });
  console.log(`✅ Booking link: ${link}`);
}
