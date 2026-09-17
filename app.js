/**
 * Apex AI Web Studio - Production-Ready Frontend Controller
 */

// Application State
const state = {
  activeView: 'dashboard',
  pipeline: { prospects: [], pipeline_summary: {} },
  activeProspect: null,
  activeTouch: 'email',
  activeViewport: 'desktop',
  searchQuery: '',
  groqApiKey: localStorage.getItem('apex_groq_api_key') || '',
  isLoading: false
};

// API Client — auto-detects local vs cloud
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? ''
  : 'https://apex-webstudio-api.piyushrajsingh092.workers.dev';

const api = {
  async getPipeline() {
    try {
      const res = await fetch(`${API_BASE}/api/prospects`);
      if (res.ok) {
        const data = await res.json();
        return { agency_name: "Apex AI Web Studio", prospects: data.prospects || [], pipeline_summary: {} };
      }
    } catch {}
    try {
      const fallback = await fetch('/pipeline.json');
      if (fallback.ok) return await fallback.json();
    } catch {}
    return { agency_name: "Apex AI Web Studio", prospects: [], pipeline_summary: {} };
  },

  async getProspect(slug) {
    const res = await fetch(`${API_BASE}/api/prospects/${slug}`);
    return await res.json();
  },

  async runAudit(data) {
    const res = await fetch(`${API_BASE}/api/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, apiKey: state.groqApiKey })
    });
    return await res.json();
  },

  async generateDemo(data) {
    const res = await fetch(`${API_BASE}/api/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async generateOutreach(data) {
    const res = await fetch(`${API_BASE}/api/outreach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async runAll(data) {
    const res = await fetch(`${API_BASE}/api/prospects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, stage: 'DISCOVERED' })
    });
    return await res.json();
  },

  async updateStage(slug, stage) {
    const res = await fetch(`${API_BASE}/api/prospects/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage })
    });
    return await res.json();
  },

  async deleteProspect(slug) {
    const res = await fetch(`${API_BASE}/api/prospects/${slug}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  async importCsv(csvText) {
    const res = await fetch(`${API_BASE}/api/prospects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText })
    });
    return await res.json();
  }
};

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚡'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Navigation View Switcher
function setView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${viewName}`);
  });

  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'studio') renderStudio();
  if (viewName === 'outreach') renderOutreach();
  if (viewName === 'crm') renderKanban();
}

// Initialize Application
async function initApp() {
  setupEventListeners();
  if (state.groqApiKey) {
    document.getElementById('inputGroqApiKey').value = state.groqApiKey;
    document.getElementById('headerEngineStatus').innerText = 'Groq AI Neural Pipeline Active';
  }
  await refreshPipeline();
  setView('dashboard');
}

async function refreshPipeline() {
  try {
    state.pipeline = await api.getPipeline();
    if (state.pipeline.prospects.length > 0 && !state.activeProspect) {
      state.activeProspect = state.pipeline.prospects[0];
    }
    updateKPIs();
    populateSelectDropdowns();
  } catch (err) {
    console.error('Failed to load pipeline:', err);
  }
}

// Update Top KPI Counters
function updateKPIs() {
  const summary = state.pipeline.pipeline_summary || {};
  const prospects = state.pipeline.prospects || [];
  
  document.getElementById('kpiTotalProspects').innerText = prospects.length;
  document.getElementById('kpiDemosBuilt').innerText = prospects.filter(p => p.stage !== 'DISCOVERED' && p.stage !== 'AUDITED').length;
  document.getElementById('kpiPipelineValue').innerText = `$${(summary.pipeline_value_usd || prospects.length * 1500).toLocaleString()}`;
  
  if (prospects.length > 0) {
    const avg = (prospects.reduce((acc, p) => acc + (p.overallScore || 4), 0) / prospects.length).toFixed(1);
    document.getElementById('kpiAvgScore').innerHTML = `${avg}<span class="sub-unit">/10</span>`;
  }
}

// Populate Dropdowns in Studio and Outreach views
function populateSelectDropdowns() {
  const prospects = state.pipeline.prospects || [];
  const studioSelect = document.getElementById('studioProspectSelector');
  const outreachSelect = document.getElementById('outreachProspectSelector');

  const optionsHtml = prospects.map(p => `
    <option value="${p.slug}" ${state.activeProspect && state.activeProspect.slug === p.slug ? 'selected' : ''}>
      ${p.businessName} (${p.niche} · ${p.city})
    </option>
  `).join('');

  if (studioSelect) studioSelect.innerHTML = optionsHtml || '<option value="">No prospects available</option>';
  if (outreachSelect) outreachSelect.innerHTML = optionsHtml || '<option value="">No prospects available</option>';
}

// Render Dashboard View with Search Filter
function renderDashboard() {
  const tbody = document.getElementById('dashboardTableBody');
  let prospects = state.pipeline.prospects || [];

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    prospects = prospects.filter(p => 
      (p.businessName || '').toLowerCase().includes(q) ||
      (p.city || '').toLowerCase().includes(q) ||
      (p.niche || '').toLowerCase().includes(q)
    );
  }

  if (prospects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px; color: var(--text-muted);">No matching prospects found.</td></tr>`;
    return;
  }

  tbody.innerHTML = prospects.map(p => {
    const scoreClass = (p.overallScore || 4) <= 4 ? 'low' : (p.overallScore || 4) <= 6 ? 'mid' : 'high';
    return `
      <tr>
        <td><strong>${p.businessName}</strong><br><small style="color:var(--text-muted); font-size:0.75rem;">${p.url || ''}</small></td>
        <td><span style="text-transform:capitalize;">${p.niche}</span></td>
        <td>${p.city}</td>
        <td><span class="score-pill ${scoreClass}">${p.overallScore || '4'}/10</span></td>
        <td><span class="stage-badge ${p.stage}">${p.stage.replace('_', ' ')}</span></td>
        <td>
          <button class="btn-secondary sm" onclick="launchStudioFor('${p.slug}')">🖥️ View Demo</button>
          <button class="btn-primary sm" onclick="launchOutreachFor('${p.slug}')">✉️ Outreach</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.launchStudioFor = async (slug) => {
  const p = state.pipeline.prospects.find(item => item.slug === slug);
  if (p) state.activeProspect = p;
  setView('studio');
};

window.launchOutreachFor = async (slug) => {
  const p = state.pipeline.prospects.find(item => item.slug === slug);
  if (p) state.activeProspect = p;
  setView('outreach');
};

// Render 5-Point Audit Results
function displayAuditResults(audit) {
  document.getElementById('auditEmptyState').classList.add('hidden');
  document.getElementById('auditDetailsBox').classList.remove('hidden');

  document.getElementById('auditOverallScore').innerText = audit.overallScore || 4;
  document.getElementById('auditResultBusinessTitle').innerText = audit.businessName;
  document.getElementById('auditResultUrl').innerText = audit.url;
  document.getElementById('auditBiggestOpportunity').innerText = audit.biggestOpportunity || 'Optimizing mobile tap-to-call will significantly boost inquiries.';

  const dims = audit.dimensions || {};
  if (dims.design) {
    document.getElementById('dimScoreDesign').innerText = `${dims.design.score}/10`;
    document.getElementById('dimProblemsDesign').innerHTML = `<ul>${dims.design.problems.map(p => `<li>${p}</li>`).join('')}</ul>`;
  }
  if (dims.mobile) {
    document.getElementById('dimScoreMobile').innerText = `${dims.mobile.score}/10`;
    document.getElementById('dimProblemsMobile').innerHTML = `<ul>${dims.mobile.problems.map(p => `<li>${p}</li>`).join('')}</ul>`;
  }
  if (dims.speed) {
    document.getElementById('dimScoreSpeed').innerText = `${dims.speed.score}/10`;
    document.getElementById('dimProblemsSpeed').innerHTML = `<ul>${dims.speed.problems.map(p => `<li>${p}</li>`).join('')}</ul>`;
  }
  if (dims.seo) {
    document.getElementById('dimScoreSeo').innerText = `${dims.seo.score}/10`;
    document.getElementById('dimProblemsSeo').innerHTML = `<ul>${dims.seo.problems.map(p => `<li>${p}</li>`).join('')}</ul>`;
  }
  if (dims.conversion) {
    document.getElementById('dimScoreConversion').innerText = `${dims.conversion.score}/10`;
    document.getElementById('dimProblemsConversion').innerHTML = `<ul>${dims.conversion.problems.map(p => `<li>${p}</li>`).join('')}</ul>`;
  }
}

// Render Studio View
function renderStudio() {
  if (!state.activeProspect) {
    if (state.pipeline.prospects.length > 0) {
      state.activeProspect = state.pipeline.prospects[0];
    } else {
      return;
    }
  }

  const p = state.activeProspect;
  const demoUrl = `/demos/${p.slug}/index.html`;
  const iframe = document.getElementById('demoIframe');
  const addressBar = document.getElementById('simulatorAddressBar');
  const openExternalBtn = document.getElementById('btnOpenDemoExternal');

  iframe.src = demoUrl;
  addressBar.innerText = `🔒 https://preview.apexwebstudio.com/demo/${p.slug}`;
  openExternalBtn.href = demoUrl;

  const selector = document.getElementById('studioProspectSelector');
  if (selector) selector.value = p.slug;
}

// Render Outreach Composer View
async function renderOutreach() {
  if (!state.activeProspect) {
    if (state.pipeline.prospects.length > 0) {
      state.activeProspect = state.pipeline.prospects[0];
    } else {
      return;
    }
  }

  const p = state.activeProspect;
  const selector = document.getElementById('outreachProspectSelector');
  if (selector) selector.value = p.slug;

  const firstName = p.ownerName && p.ownerName !== 'Business Owner' ? p.ownerName.split(' ')[0] : 'there';
  const demoUrl = `${API_BASE}/demos/${p.slug}/index.html`;

  let subject = `Quick redesign idea for ${p.businessName}`;
  let body = '';

  if (state.activeTouch === 'email') {
    document.getElementById('outreachTouchTitle').innerText = `Touch 1: Value-First Cold Email`;
    document.getElementById('outreachTouchDesc').innerText = `Compliment the business, point out 2 specific fixes, and attach the free live interactive demo.`;
    document.getElementById('subjectLineGroup').classList.remove('hidden');
    document.getElementById('outreachSubjectLine').value = subject;
    body = `Hi ${firstName},

I was looking at local businesses in ${p.city} and really love what ${p.businessName} has built in our community.

While checking out your website, I noticed a couple of quick things that might be costing you calls and bookings from mobile visitors:
1. Mobile Navigation: The phone number and booking buttons are hard to tap on mobile devices.
2. Lead Capture: Missing a frictionless tap-to-call action bar above the fold.

To show you what's possible, I put together a quick, modern, mobile-first preview of what a refreshed site for ${p.businessName} could look like:

👉 Live Interactive Demo: ${demoUrl}

No pressure or sales pitch at all — if you like the direction, I'd love to chat for 5 minutes. If not, please feel free to keep the ideas and feedback!

Wishing you a fantastic week ahead.

Best regards,

Piyush / Apex AI Web Studio
Website Redesign & Conversion Specialists
[Your Phone / Portfolio Link]
[Registered Agency Physical Address Placeholder, ${p.city}]

(Reply STOP and I will never follow up again.)`;
  } else if (state.activeTouch === 'dm') {
    document.getElementById('outreachTouchTitle').innerText = `Touch 2: LinkedIn / Instagram Teaser`;
    document.getElementById('outreachTouchDesc').innerText = `Short, friendly, value-first message for direct messaging.`;
    document.getElementById('subjectLineGroup').classList.add('hidden');
    body = `Hey ${firstName}! Big fan of what you guys are doing with ${p.businessName} here in ${p.city}. I specialize in upgrading local business websites and actually built a quick modern mobile preview of yours to show what's possible — mind if I drop the link over? Totally zero pressure, just thought it might be useful! 🙂`;
  } else if (state.activeTouch === 'followup') {
    document.getElementById('outreachTouchTitle').innerText = `Touch 3: Polite Follow-Up (Sent Day 4)`;
    document.getElementById('outreachTouchDesc').innerText = `Gentle reminder, zero hard sell.`;
    document.getElementById('subjectLineGroup').classList.remove('hidden');
    document.getElementById('outreachSubjectLine').value = `Re: Quick redesign idea for ${p.businessName}`;
    body = `Hi ${firstName},

Just floating this back to the top of your inbox in case it got buried!

Here is the modern preview link again:
👉 ${demoUrl}

If the timing isn't right or you're completely happy with your current setup, no worries whatsoever — I'll leave it here.

Have a great rest of your week!

Best,
Piyush
(Reply STOP to opt out)`;
  } else if (state.activeTouch === 'script') {
    document.getElementById('outreachTouchTitle').innerText = `📞 5-Minute Discovery Call & Closing Script`;
    document.getElementById('outreachTouchDesc').innerText = `Step-by-step framework to present the demo and secure a 50% upfront deposit.`;
    document.getElementById('subjectLineGroup').classList.add('hidden');
    body = `1. The Icebreaker & Goal Discovery:
   "Thanks for hopping on, ${firstName}! Before I pull up the screen, what is the #1 thing you wish your current website was doing better for ${p.businessName}?"
   (Listen: More phone calls? More bookings? Modern trust?)

2. The Demo Reveal:
   "Got it. Here is the modern version I scaffolded for you..." [Share screen with ${demoUrl}].

3. Problem → Solution Contrast:
   "The main thing I addressed is [their goal]. On the current site, mobile visitors struggle to tap-to-call. Here, it's instant one-touch calling with high-trust local badges."

4. Timeline & Action:
   "I can have this fully customized with your real photos, staff bios, and domain in about 5 business days. Would you like me to get this set up for you?"

5. Package Selection:
   - Starter Package ($750): One-page responsive site, tap-to-call, speed optimized.
   - Growth Package ($1,500): Multi-page site, contact forms, local Google SEO setup.
   - 50% upfront deposit to kick off production.`;
  }

  const textarea = document.getElementById('outreachBodyText');
  textarea.value = body;
  document.getElementById('outreachCharCount').innerText = `${body.length} characters`;
}

// Render Pipeline CRM Kanban Board
function renderKanban() {
  const stages = ['DISCOVERED', 'AUDITED', 'DEMO_GENERATED', 'OUTREACH_DRAFTED', 'CONTACTED', 'MEETING_SCHEDULED', 'CLOSED_WON'];
  const prospects = state.pipeline.prospects || [];

  stages.forEach(stage => {
    const col = document.getElementById(`col-${stage}`);
    const countBadge = document.getElementById(`count-${stage}`);
    const filtered = prospects.filter(p => p.stage === stage);
    
    if (countBadge) countBadge.innerText = filtered.length;
    if (col) {
      if (filtered.length === 0) {
        col.innerHTML = `<div style="text-align:center; padding: 30px 10px; color: var(--text-dim); font-size: 0.8rem;">No leads</div>`;
      } else {
        col.innerHTML = filtered.map(p => `
          <div class="lead-card" onclick="selectLead('${p.slug}')">
            <div class="lead-card-head">
              <span class="lead-name">${p.businessName}</span>
              <span class="lead-score">${p.overallScore || 4}/10</span>
            </div>
            <div class="lead-sub">${p.niche} · ${p.city}</div>
            <div class="lead-actions">
              <span class="lead-value">$1,500</span>
              <div class="card-btn-row">
                <button class="btn-advance" onclick="event.stopPropagation(); advanceLeadStage('${p.slug}', '${stage}')">Next →</button>
                <button class="btn-delete-lead" onclick="event.stopPropagation(); removeLead('${p.slug}')">✕</button>
              </div>
            </div>
          </div>
        `).join('');
      }
    }
  });
}

window.selectLead = (slug) => {
  const p = state.pipeline.prospects.find(item => item.slug === slug);
  if (p) {
    state.activeProspect = p;
    setView('studio');
  }
};

window.advanceLeadStage = async (slug, currentStage) => {
  const stages = ['DISCOVERED', 'AUDITED', 'DEMO_GENERATED', 'OUTREACH_DRAFTED', 'CONTACTED', 'MEETING_SCHEDULED', 'CLOSED_WON'];
  const currentIdx = stages.indexOf(currentStage);
  if (currentIdx < stages.length - 1) {
    const nextStage = stages[currentIdx + 1];
    await api.updateStage(slug, nextStage);
    showToast(`Lead advanced to ${nextStage}`, 'success');
    await refreshPipeline();
    renderKanban();
  }
};

window.removeLead = async (slug) => {
  if (confirm(`Remove lead [${slug}] from pipeline?`)) {
    await api.deleteProspect(slug);
    showToast(`Lead ${slug} deleted`, 'info');
    await refreshPipeline();
    renderKanban();
  }
};

// Event Listeners Setup
function setupEventListeners() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  });

  // Search Filter
  document.getElementById('dashboardSearch').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderDashboard();
  });

  // Quick Action in Dashboard
  document.getElementById('btnQuickAudit').addEventListener('click', async () => {
    const url = document.getElementById('quickUrl').value.trim();
    if (!url) {
      showToast('Please enter a target URL', 'error');
      return;
    }
    const businessName = url.replace(/https?:\/\/(www\.)?/, '').split('.')[0];
    const capitalized = businessName.charAt(0).toUpperCase() + businessName.slice(1) + ' Services';
    
    showToast(`Scanning and building demo for ${capitalized}...`, 'info');
    const res = await api.runAll({ businessName: capitalized, url, niche: 'trade', city: 'Local Area' });
    if (res.success) {
      showToast('Demo and outreach generated successfully!', 'success');
      await refreshPipeline();
      state.activeProspect = res.record;
      setView('studio');
    }
  });

  // Refresh Dashboard
  document.getElementById('btnRefreshDashboard').addEventListener('click', async () => {
    await refreshPipeline();
    renderDashboard();
    showToast('Dashboard metrics updated');
  });

  // 5-Point Audit Form
  document.getElementById('auditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      businessName: document.getElementById('auditBusinessName').value.trim(),
      url: document.getElementById('auditUrl').value.trim(),
      niche: document.getElementById('auditNiche').value,
      city: document.getElementById('auditCity').value.trim() || 'Austin, TX',
      ownerName: document.getElementById('auditOwnerName').value.trim(),
      ownerEmail: document.getElementById('auditOwnerEmail').value.trim(),
      phone: document.getElementById('auditPhone').value.trim() || '(555) 234-5678'
    };

    showToast(`Executing 5-Point Deep Audit for ${data.businessName}...`, 'info');
    const res = await api.runAudit(data);
    if (res.success) {
      displayAuditResults(res.audit);
      showToast('Audit complete!', 'success');
      await refreshPipeline();
      state.activeProspect = state.pipeline.prospects.find(p => p.slug === res.audit.slug);
    }
  });

  document.getElementById('btnLaunchDemoFromAudit').addEventListener('click', async () => {
    if (state.activeProspect) {
      showToast('Scaffolding modern demo site...', 'info');
      await api.generateDemo({ slug: state.activeProspect.slug, template: state.activeProspect.niche });
      await refreshPipeline();
      setView('studio');
    }
  });

  // Demo Studio Viewport Switcher
  document.querySelectorAll('.viewport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.viewport-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const viewport = btn.dataset.viewport;
      const frame = document.getElementById('deviceFrame');
      frame.className = `device-frame ${viewport}`;
      state.activeViewport = viewport;
    });
  });

  document.getElementById('studioProspectSelector').addEventListener('change', (e) => {
    const p = state.pipeline.prospects.find(item => item.slug === e.target.value);
    if (p) {
      state.activeProspect = p;
      renderStudio();
    }
  });

  document.getElementById('btnRebuildDemo').addEventListener('click', async () => {
    if (!state.activeProspect) return;
    const template = document.getElementById('studioTemplateSelector').value;
    showToast(`Regenerating demo using [${template}] template...`, 'info');
    await api.generateDemo({ slug: state.activeProspect.slug, template });
    renderStudio();
    showToast('Demo regenerated successfully!', 'success');
  });

  document.getElementById('btnGoToOutreach').addEventListener('click', () => {
    setView('outreach');
  });

  // Outreach Touch Selector
  document.querySelectorAll('.touch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.touch-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTouch = btn.dataset.touch;
      renderOutreach();
    });
  });

  document.getElementById('outreachProspectSelector').addEventListener('change', (e) => {
    const p = state.pipeline.prospects.find(item => item.slug === e.target.value);
    if (p) {
      state.activeProspect = p;
      renderOutreach();
    }
  });

  document.getElementById('btnCopyOutreach').addEventListener('click', () => {
    const text = document.getElementById('outreachBodyText').value;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Outreach copy copied to clipboard!', 'success');
    });
  });

  document.getElementById('btnMarkAsContacted').addEventListener('click', async () => {
    if (state.activeProspect) {
      await api.updateStage(state.activeProspect.slug, 'CONTACTED');
      showToast(`Marked ${state.activeProspect.businessName} as CONTACTED!`, 'success');
      await refreshPipeline();
    }
  });

  // Quick Launch Modal
  document.getElementById('btnQuickLaunch').addEventListener('click', () => {
    document.getElementById('quickAddModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseModal').addEventListener('click', () => {
    document.getElementById('quickAddModal').classList.add('hidden');
  });

  document.getElementById('modalAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      businessName: document.getElementById('modalName').value.trim(),
      url: document.getElementById('modalUrl').value.trim(),
      niche: document.getElementById('modalNiche').value,
      city: document.getElementById('modalCity').value.trim() || 'Austin, TX',
      ownerName: document.getElementById('modalOwner').value.trim(),
      ownerEmail: document.getElementById('modalEmail').value.trim()
    };
    document.getElementById('quickAddModal').classList.add('hidden');
    showToast(`Executing full pipeline for ${data.businessName}...`, 'info');
    const res = await api.runAll(data);
    if (res.success) {
      showToast('Prospect added, audited, and demo scaffolded!', 'success');
      await refreshPipeline();
      state.activeProspect = res.record;
      setView('studio');
    }
  });

  // AI Settings Modal
  document.getElementById('btnAiSettings').addEventListener('click', () => {
    document.getElementById('aiSettingsModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseAiModal').addEventListener('click', () => {
    document.getElementById('aiSettingsModal').classList.add('hidden');
  });

  document.getElementById('btnSaveAiKey').addEventListener('click', () => {
    const key = document.getElementById('inputGroqApiKey').value.trim();
    state.groqApiKey = key;
    if (key) {
      localStorage.setItem('apex_groq_api_key', key);
      document.getElementById('headerEngineStatus').innerText = 'Groq AI Neural Pipeline Active';
      showToast('Groq API Key saved successfully!', 'success');
    } else {
      localStorage.removeItem('apex_groq_api_key');
      document.getElementById('headerEngineStatus').innerText = 'Heuristic Rules Engine Active';
      showToast('API Key cleared. Using heuristic rules engine.', 'info');
    }
    document.getElementById('aiSettingsModal').classList.add('hidden');
  });

  // CSV Import Modal
  document.getElementById('btnImportCsvModal').addEventListener('click', () => {
    document.getElementById('csvImportModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseCsvModal').addEventListener('click', () => {
    document.getElementById('csvImportModal').classList.add('hidden');
  });

  document.getElementById('btnSubmitCsvImport').addEventListener('click', async () => {
    const csvText = document.getElementById('csvImportText').value.trim();
    if (!csvText) {
      showToast('Please paste CSV data', 'error');
      return;
    }
    const res = await api.importCsv(csvText);
    if (res.success) {
      showToast(`Imported ${res.count} leads to pipeline!`, 'success');
      document.getElementById('csvImportModal').classList.add('hidden');
      await refreshPipeline();
      renderDashboard();
    } else {
      showToast(`Import error: ${res.error}`, 'error');
    }
  });

  // Export JSON
  document.getElementById('btnExportCrmJson').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.pipeline, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `agency_pipeline_${new Date().toISOString().slice(0,10)}.json`);
    dlAnchor.click();
    showToast('Pipeline exported to JSON');
  });
}

document.addEventListener('DOMContentLoaded', initApp);
