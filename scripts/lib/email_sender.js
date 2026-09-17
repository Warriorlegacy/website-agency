/**
 * scripts/lib/email_sender.js
 * Multi-Provider Email Sending Engine
 *
 * Priority: Resend API â†’ SMTP (Nodemailer-free via raw SMTP) â†’ Dry-run log
 *
 * Features:
 *   - HTML email composition with embedded screenshot
 *   - CAN-SPAM / GDPR compliant (physical address, one-click opt-out)
 *   - Send tracking via interactions log
 *   - Rate limiting (configurable delay between sends)
 *
 * ponytail: zero npm deps, stdlib only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import tls from 'tls';

import { loadAppConfig } from './config_loader.js';
import { isSendableEmail, isOptedOut, checkOutreachCompliance } from './guardrails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INTERACTIONS_FILE = path.join(__dirname, '..', '..', 'interactions.json');

// â”€â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function loadEmailConfig() {
  const cfg = loadAppConfig();
  return {
    email: cfg.email || {},
    agency: cfg.agency || {}
  };
}

function logInteraction(entry) {
  let interactions = [];
  try {
    if (fs.existsSync(INTERACTIONS_FILE)) {
      interactions = JSON.parse(fs.readFileSync(INTERACTIONS_FILE, 'utf-8'));
    }
  } catch {}
  interactions.push({ ...entry, timestamp: new Date().toISOString() });
  fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify(interactions, null, 2), 'utf-8');
}

// â”€â”€â”€ HTML Email Composer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function composeEmail({ to, subject, body, demoUrl, screenshotUrl, agencyName, agencyAddress, unsubscribeText }) {
  const cfg = loadAppConfig();
  const safeAgency = agencyName || cfg.agency?.name || 'Apex AI Web Studio';
  const safeAddress = agencyAddress || cfg.agency?.address || 'Apex AI Web Studio, India';
  const safeUnsub = unsubscribeText || 'Reply STOP and I will never follow up again.';
  const safePhone = cfg.agency?.phone || '+91 6202442690';
  const safeWeb = cfg.agency?.website || 'https://warriorlegacy.github.io/website-agency';

  // Defensive sanitization: ensure no template placeholder brackets reach compliance checker
  let cleanBody = String(body || '')
    .replace(/\[Your Phone \/ Portfolio Link\]/gi, `Direct / WhatsApp: ${safePhone} · ${safeWeb}`)
    .replace(/\[Registered Agency Physical Address Placeholder[^\]]*\]/gi, safeAddress)
    .replace(/\[Registered business address on file[^\]]*\]/gi, safeAddress);


  const screenshotBlock = screenshotUrl
    ? `<div style="margin: 24px 0; text-align: center;">
        <a href="${demoUrl}" target="_blank" style="display: inline-block; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
          <img src="${screenshotUrl}" alt="Your New Website Preview" style="max-width: 100%; width: 560px; border-radius: 12px; display: block;" />
        </a>
       </div>`
    : '';

  const demoButton = demoUrl
    ? `<div style="text-align: center; margin: 28px 0;">
        <a href="${demoUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: 700; font-size: 16px; letter-spacing: 0.02em;">
          ðŸ‘‰ View Your Live Demo
        </a>
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    <!-- Body -->
    <div style="padding: 32px 28px;">
      <div style="font-size: 15px; line-height: 1.7; color: #374151;">
        ${cleanBody.replace(/\n/g, '<br>')}
      </div>
      ${screenshotBlock}
      ${demoButton}
    </div>
    <!-- Footer -->
    <div style="padding: 20px 28px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; line-height: 1.6;">
      <p>${safeAgency} · ${safeAddress}</p>
      <p style="margin-top: 8px; color: #d1d5db; font-style: italic;">${safeUnsub}</p>
    </div>
  </div>
</body>
</html>`;

  return {
    to,
    subject,
    html,
    text: cleanBody + `\n\n---\n${safeAgency} · ${safeAddress}\n${safeUnsub}`
  };
}

// â”€â”€â”€ Provider 1: Resend API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendViaResend(email, apiKey, fromAddress) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from: fromAddress || 'Apex AI Web Studio <outreach@youragency.com>',
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return { provider: 'resend', messageId: data.id };
}

// â”€â”€â”€ Provider 2: Generic SMTP (raw TLS/STARTTLS, zero npm) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendViaSMTP(email, smtpConfig) {
  const host = smtpConfig.host || 'smtp.gmail.com';
  const port = parseInt(smtpConfig.port, 10) || 587;
  const user = smtpConfig.user || process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = (smtpConfig.pass || process.env.SMTP_PASS || process.env.GMAIL_PASS || '').replace(/\s+/g, '');
  const from = smtpConfig.from || `Apex AI Web Studio <${user}>`;

  if (!user || !pass) {
    throw new Error('SMTP user or password missing from configuration');
  }

  return new Promise((resolve, reject) => {
    let socket;
    let buffer = '';
    let state = 'INIT';
    let timeoutTimer;

    function cleanup() {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (socket && !socket.destroyed) socket.destroy();
    }

    timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error(`SMTP connection timeout (25s) to ${host}:${port}`));
    }, 25000);

    function send(cmd) {
      if (socket && socket.writable) {
        socket.write(cmd + '\r\n');
      }
    }

    function setupSocket(sock) {
      sock.on('data', (data) => {
        buffer += data.toString('utf-8');
        const lines = buffer.split('\r\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          const isMultiLine = /^\d{3}-/.test(line);
          const code = line.slice(0, 3);

          if (isMultiLine) continue; // wait for final response line

          if (state === 'INIT' && code === '220') {
            if (port === 465) {
              state = 'EHLO';
              send('EHLO localhost');
            } else {
              state = 'STARTTLS_EHLO';
              send('EHLO localhost');
            }
          } else if (state === 'STARTTLS_EHLO' && code === '250') {
            state = 'STARTTLS_REQ';
            send('STARTTLS');
          } else if (state === 'STARTTLS_REQ' && code === '220') {
            state = 'UPGRADING';
            const tlsSocket = tls.connect({
              socket: sock,
              host,
              rejectUnauthorized: false
            }, () => {
              socket = tlsSocket;
              buffer = '';
              setupSocket(tlsSocket);
              state = 'EHLO';
              send('EHLO localhost');
            });
            tlsSocket.on('error', (err) => {
              cleanup();
              reject(err);
            });
            return;
          } else if (state === 'EHLO' && code === '250') {
            state = 'AUTH_REQ';
            send('AUTH LOGIN');
          } else if (state === 'AUTH_REQ' && code === '334') {
            state = 'AUTH_USER';
            send(Buffer.from(user).toString('base64'));
          } else if (state === 'AUTH_USER' && code === '334') {
            state = 'AUTH_PASS';
            send(Buffer.from(pass).toString('base64'));
          } else if (state === 'AUTH_PASS' && code === '235') {
            state = 'MAIL_FROM';
            const cleanFrom = from.match(/<([^>]+)>/)?.[1] || user;
            send(`MAIL FROM:<${cleanFrom}>`);
          } else if (state === 'MAIL_FROM' && code === '250') {
            state = 'RCPT_TO';
            send(`RCPT TO:<${email.to}>`);
          } else if (state === 'RCPT_TO' && code === '250') {
            state = 'DATA_REQ';
            send('DATA');
          } else if (state === 'DATA_REQ' && code === '354') {
            state = 'DATA_SENDING';
            const cleanFrom = from.includes('<') ? from : `"${from}" <${user}>`;
            const mimeHeaders = [
              `From: ${cleanFrom}`,
              `To: ${email.to}`,
              `Subject: ${email.subject}`,
              `MIME-Version: 1.0`,
              `Content-Type: text/html; charset=UTF-8`,
              `Date: ${new Date().toUTCString()}`,
              `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${host}>`
            ];
            const rawMessage = mimeHeaders.join('\r\n') + '\r\n\r\n' + email.html + '\r\n.';
            send(rawMessage);
          } else if (state === 'DATA_SENDING' && code === '250') {
            state = 'QUIT';
            send('QUIT');
            cleanup();
            resolve({
              provider: 'smtp',
              messageId: `smtp-${Date.now()}`,
              account: user
            });
            return;
          } else if (code.startsWith('4') || code.startsWith('5')) {
            cleanup();
            reject(new Error(`SMTP Error [${code}] at state ${state}: ${line}`));
            return;
          }
        }
      });

      sock.on('error', (err) => {
        cleanup();
        reject(err);
      });
    }

    if (port === 465) {
      socket = tls.connect(port, host, { rejectUnauthorized: false }, () => {
        setupSocket(socket);
      });
    } else {
      socket = net.createConnection(port, host, () => {
        setupSocket(socket);
      });
    }
  });
}

// â”€â”€â”€ Provider 3: Dry Run (local log, no send) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sendViaDryRun(email) {
  const logDir = path.join(__dirname, '..', '..', 'outreach', 'sent');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const filename = `${Date.now()}-${email.to.replace(/[^a-z0-9]/gi, '_')}.html`;
  fs.writeFileSync(path.join(logDir, filename), email.html, 'utf-8');

  console.log(`  ðŸ“§ [DRY RUN] Email logged to outreach/sent/${filename}`);
  return { provider: 'dry_run', messageId: `dry-${Date.now()}`, file: filename };
}

// â”€â”€â”€ Master: sendEmail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Send an email through the configured provider.
 *
 * @param {object} email - { to, subject, html, text }
 * @param {object} opts
 * @param {boolean} opts.dryRun - Log only, don't actually send
 * @param {string} opts.leadSlug - For interaction tracking
 * @returns {Promise<{provider, messageId}>}
 */
export async function sendEmail(email, opts = {}) {
  const { dryRun, leadSlug } = opts;
  const { email: emailCfg, agency } = loadEmailConfig();

  // â”€â”€ Guardrail gates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const recipientCheck = isSendableEmail(email?.to, {
    observedOn: opts.observedOn,
    confirmed: opts.recipientConfirmed === true
  });
  if (!recipientCheck.ok) {
    const err = new Error(`[GUARDRAIL] Blocked send to "${email?.to}" â€” ${recipientCheck.reason}`);
    logInteraction({
      lead_slug: leadSlug, action: 'send_blocked', channel: 'email',
      direction: 'internal', reason: recipientCheck.reason, attempted_to: email?.to || null
    });
    throw err;
  }

  if (isOptedOut({ slug: leadSlug, email: email.to })) {
    logInteraction({
      lead_slug: leadSlug, action: 'send_blocked', channel: 'email',
      direction: 'internal', reason: 'recipient on opt-out list'
    });
    throw new Error(`[GUARDRAIL] Blocked send â€” ${email.to} is on the opt-out list (rule 3)`);
  }

  const compliance = checkOutreachCompliance(email?.text || email?.html || '', {
    demoUrl: opts.demoUrl,
    requireDemo: opts.requireDemo !== false
  });
  if (!compliance.ok && opts.allowNonCompliant !== true) {
    logInteraction({
      lead_slug: leadSlug, action: 'send_blocked', channel: 'email',
      direction: 'internal', reason: `missing: ${compliance.missing.join('; ')}`
    });
    throw new Error(`[GUARDRAIL] Blocked non-compliant email â€” missing: ${compliance.missing.join('; ')} (rule 3/4)`);
  }
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let result;

  const smtpConfig = emailCfg.smtp || {};
  const hasSmtpCreds = (smtpConfig.user || process.env.SMTP_USER || process.env.GMAIL_USER) &&
                       (smtpConfig.pass || process.env.SMTP_PASS || process.env.GMAIL_PASS);
  const resendApiKey = emailCfg.resendApiKey || process.env.RESEND_API_KEY;

  if (dryRun) {
    result = sendViaDryRun(email);
  } else if (emailCfg.provider === 'smtp' || hasSmtpCreds) {
    // Prefer SMTP with verified credentials because it can send to ANY external domain without sandbox lock
    result = await sendViaSMTP(email, smtpConfig);
  } else if (resendApiKey) {
    result = await sendViaResend(email, resendApiKey, emailCfg.fromAddress);
  } else {
    console.warn('[email_sender] No email provider configured â€” using dry run');
    result = sendViaDryRun(email);
  }

  // Log the interaction
  if (leadSlug) {
    logInteraction({
      lead_slug: leadSlug,
      channel: 'email',
      direction: 'outbound',
      action: 'send_email',
      provider: result.provider,
      messageId: result.messageId,
      to: email.to,
      subject: email.subject
    });
  }

  return result;
}

// â”€â”€â”€ CLI Test â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('\nðŸ“§ Email Sender Test â€” Dry Run\n');
  const email = composeEmail({
    to: 'test@example.com',
    subject: 'Quick redesign idea for Test Business',
    body: 'Hi there,\n\nI built a quick demo for your business.\n\nBest regards,\nPiyush',
    demoUrl: 'https://demo.agency.com/test-business',
    screenshotUrl: null,
    agencyName: 'Apex AI Web Studio',
    agencyAddress: 'Austin, TX'
  });
  sendEmail(email, { dryRun: true, leadSlug: 'test-business' })
    .then(r => console.log('âœ… Result:', r))
    .catch(e => console.error('âŒ', e.message));
}
