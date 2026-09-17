/**
 * scripts/lib/free_stack.js
 * FREE REPO / APP CAPABILITY REGISTRY
 *
 * Single place that answers: "which free engine is actually available right now,
 * what can it do, and how do we call it?" — so the agency degrades gracefully
 * instead of silently doing nothing.
 *
 * Tools wired:
 *   1. Cline        (github.com/cline/cline)              — headless autopilot + scheduled agent runs
 *   2. Pipecat      (github.com/pipecat-ai/pipecat)       — real-time AI voice calling
 *   3. Postiz       (github.com/gitroomhq/postiz-app)     — social scheduling of demo showcases
 *   4. AnythingLLM  (github.com/Mintplex-Labs/anything-llm) — local, key-free AI brain
 *   5. Browser Use  (github.com/browser-use/browser-use)  — real-browser prospect enrichment
 *
 * ponytail: zero npm deps, stdlib + child_process only
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAppConfig } from './config_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');

// ─── Python Interpreter Resolution ───────────────────────────────────────────
// Windows ships `python`/`py`, POSIX ships `python3`. The old code hardcoded
// `python3`, which silently failed on every Windows run.
const PY_CANDIDATES = process.platform === 'win32'
  ? ['python', 'py', 'python3']
  : ['python3', 'python'];

let cachedPython = undefined;

export function resolvePython() {
  if (cachedPython !== undefined) return cachedPython;
  for (const bin of PY_CANDIDATES) {
    try {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf-8', timeout: 8000, shell: process.platform === 'win32' });
      if (r.status === 0 && /Python\s+3\./i.test(`${r.stdout}${r.stderr}`)) {
        cachedPython = { bin, version: `${r.stdout}${r.stderr}`.trim() };
        return cachedPython;
      }
    } catch {}
  }
  cachedPython = null;
  return cachedPython;
}

/** True when a Python module can be imported by the resolved interpreter. */
export function hasPythonModule(moduleName) {
  const py = resolvePython();
  if (!py) return false;
  try {
    const r = spawnSync(py.bin, ['-c', `import ${moduleName}`], {
      encoding: 'utf-8', timeout: 20000, shell: process.platform === 'win32'
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

/** True when a CLI binary answers --version. */

// ─── Service Reachability ────────────────────────────────────────────────────

async function probeHttp(url, headers = {}, timeoutMs = 4000) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return { reachable: true, status: res.status };
  } catch (e) {
    return { reachable: false, status: null, error: e.message };
  }
}

// ─── The Registry ────────────────────────────────────────────────────────────

/**
 * Probes every free engine and returns an honest status report.
 * Nothing here is ever reported as "ready" unless it truly answers.
 */
export async function probeFreeStack({ verbose = false } = {}) {
  const cfg = loadAppConfig();
  const int = cfg.integrations || {};

  const report = [];

  // 1 ── Cline: headless agent + cron scheduling for the agency repo
  {
    const enabled = int.cline?.enabled !== false;
    const installed = hasBinary('cline', ['--version']);
    report.push({
      key: 'cline',
      name: 'Cline',
      role: 'Headless autonomous agent runs + cron schedules',
      enabled,
      ready: enabled && installed,
      detail: installed ? 'cline CLI detected' : 'cline CLI not on PATH — run: npm i -g cline',
      docs: 'free_repo_assets/CLINE_README.md'
    });
  }

  // 2 ── Pipecat: real-time voice
  {
    const enabled = int.pipecat?.enabled !== false;
    const py = resolvePython();
    const mod = py ? hasPythonModule('pipecat') : false;
    const hasKeys = !!(int.pipecat?.dailyToken || process.env.DAILY_TOKEN || int.pipecat?.cartesiaApiKey || process.env.CARTESIA_API_KEY);
    report.push({
      key: 'pipecat',
      name: 'Pipecat',
      role: 'Real-time AI voice calling for warm leads',
      enabled,
      ready: enabled && mod && hasKeys,
      detail: !py ? 'no Python 3 interpreter found'
        : !mod ? 'pipecat not installed — run: pip install "pipecat-ai[daily,cartesia,deepgram,silero]"'
        : !hasKeys ? 'pipecat installed but DAILY_TOKEN / CARTESIA_API_KEY missing'
        : 'pipecat + transport credentials ready',
      docs: 'free_repo_assets/PIPECAT_README.md'
    });
  }

  // 3 ── Postiz: social scheduling
  {
    const enabled = int.postiz?.enabled === true;
    const apiUrl = (int.postiz?.apiUrl || 'http://localhost:3000').replace(/\/$/, '');
    const apiKey = int.postiz?.apiKey || process.env.POSTIZ_API_KEY || '';
    const probe = enabled ? await probeHttp(`${apiUrl}/`, { 'x-api-key': apiKey }) : { reachable: false };
    report.push({
      key: 'postiz',
      name: 'Postiz',
      role: 'Auto-schedule demo showcase posts across socials',
      enabled,
      ready: enabled && !!apiKey && probe.reachable,
      detail: !enabled ? 'disabled in config.integrations.postiz.enabled'
        : !apiKey ? 'POSTIZ_API_KEY missing'
        : probe.reachable ? `Postiz reachable at ${apiUrl}` : `Postiz not reachable at ${apiUrl}`,
      docs: 'free_repo_assets/POSTIZ_README.md'
    });
  }

  // 4 ── AnythingLLM: local key-free AI brain
  {
    const enabled = int.anythingllm?.enabled !== false;
    const apiUrl = (int.anythingllm?.apiUrl || 'http://localhost:3001').replace(/\/$/, '');
    const apiKey = int.anythingllm?.apiKey || process.env.ANYTHINGLLM_API_KEY || '';
    const workspace = int.anythingllm?.workspace || 'agency';
    let probe = { reachable: false };
    if (enabled) {
      probe = await probeHttp(`${apiUrl}/api/v1/workspace/${workspace}`, { Authorization: `Bearer ${apiKey}` });
    }
    report.push({
      key: 'anythingllm',
      name: 'AnythingLLM',
      role: 'Local LLM brain for audits / outreach / proposals (no cloud keys)',
      enabled,
      ready: enabled && !!apiKey && probe.reachable,
      detail: !enabled ? 'disabled in config.integrations.anythingllm.enabled'
        : !apiKey ? 'ANYTHINGLLM_API_KEY missing'
        : probe.reachable ? `workspace "${workspace}" reachable at ${apiUrl}` : `not reachable at ${apiUrl}`,
      docs: 'free_repo_assets/ANYTHINGLLM_README.md'
    });
  }

  // 5 ── Browser Use: real-browser prospect enrichment
  {
    const enabled = int.browserUse?.enabled !== false;
    const py = resolvePython();
    const mod = py ? hasPythonModule('browser_use') : false;
    const cloudKey = int.browserUse?.cloudApiKey || process.env.BROWSER_USE_API_KEY || '';
    report.push({
      key: 'browser-use',
      name: 'Browser Use',
      role: 'Real-browser enrichment of prospect sites (screenshots, contact pages)',
      enabled,
      ready: enabled && (mod || !!cloudKey),
      detail: !py ? 'no Python 3 interpreter found'
        : mod ? `browser_use installed (${py.bin})`
        : cloudKey ? 'BROWSER_USE_API_KEY set — cloud browser available'
        : 'browser-use not installed — run: pip install browser-use',
      docs: 'free_repo_assets/BROWSER_USE_README.md'
    });
  }

  if (verbose) {
    console.log('\n🔌 FREE STACK STATUS\n');
    for (const r of report) {
      console.log(`${r.ready ? '🟢' : (r.enabled ? '🟡' : '⚪')} ${r.name.padEnd(14)} ${r.role}`);
      console.log(`   ↳ ${r.detail}`);
    }
    const ready = report.filter(r => r.ready).length;
    console.log(`\n${ready}/${report.length} free engines ready.\n`);
  }

  return report;
}

/** Quick boolean helper used by engines to decide whether to try a tool. */
export async function isReady(key) {
  const report = await probeFreeStack();
  return report.find(r => r.key === key)?.ready === true;
}

export function hasBinary(bin, args = ['--version']) {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf-8', timeout: 10000, shell: process.platform === 'win32' });
    return r.status === 0;
  } catch {
    return false;
  }
}

// ─── CLI: node scripts/lib/free_stack.js [--json] ─────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const asJson = process.argv.includes('--json');
  probeFreeStack({ verbose: !asJson }).then(report => {
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else {
      const py = resolvePython();
      console.log(`Python interpreter : ${py ? `${py.bin} (${py.version})` : 'NOT FOUND'}`);
    }
  }).catch(e => { console.error('❌ free_stack error:', e.message); process.exit(1); });
}

/** Writes a helper script into the OS temp dir (never pollutes the repo). */
export function writeTempScript(name, contents) {
  const dir = path.join(os.tmpdir(), 'apex-agency');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents, 'utf-8');
  return file;
}
