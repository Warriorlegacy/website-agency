/**
 * scripts/lib/cline_scheduler.js
 * Cline integration — scheduled autonomous agent runs
 *
 * Uses Cline CLI to run scheduled agent sessions for recurring tasks:
 * daily lead harvesting, pipeline evaluation, outreach follow-ups,
 * and system health checks.
 *
 * Cline CLI usage: cline --headless --json "<prompt>"
 *
 * ponytail: subprocess calls to Cline CLI, no npm deps
 */
import { spawn } from 'child_process';
import { loadAppConfig } from './config_loader.js';

/**
 * Run a Cline agent task in headless/JSON mode.
 * @param {string} prompt - The task prompt for Cline
 * @param {object} opts - { workspace, timeout }
 * @returns {Promise<object>} Task result
 */
export async function runClineTask(prompt, opts = {}) {
  const cfg = loadAppConfig();
  const clineConfig = cfg.integrations?.cline || {};
  const workspace = opts.workspace || clineConfig.workspace || process.cwd();
  const timeout = opts.timeout || 180000;

  console.log(`  🤖 [Cline] Running: "${prompt.slice(0, 80)}..."`);

  return new Promise((resolve) => {
    // Try headless JSON mode first (Cline ≥1.x), fall back to simple prompt
    const args = ['--headless', '--json', prompt];

    const proc = spawn('cline', args, {
      cwd: workspace,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
      env: { ...process.env, ...clineConfig.env }
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.warn(`  ⚠️ Cline exited ${code}`);
        resolve({ status: 'error', exitCode: code, stderr: stderr.slice(0, 500) });
        return;
      }

      // Try to parse JSON output from Cline --json mode
      let parsed = null;
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {}

      console.log(`  ✅ Cline task completed`);
      resolve({ status: 'completed', output: parsed || stdout.slice(0, 2000) });
    });

    proc.on('error', (e) => {
      // Cline not installed — run the shell command directly as fallback
      console.warn(`  ⚠️ Cline CLI not available (${e.message}) — running command directly`);
      const directArgs = prompt.trim().split(/\s+/);
      const cmd = directArgs.shift();
      const fallback = spawn(cmd, directArgs, {
        cwd: workspace,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout
      });
      let fbOut = '', fbErr = '';
      fallback.stdout.on('data', (d) => { fbOut += d; });
      fallback.stderr.on('data', (d) => { fbErr += d; });
      fallback.on('close', (c) => {
        resolve({ status: c === 0 ? 'completed_direct' : 'error', output: fbOut.slice(0, 2000), stderr: fbErr.slice(0, 500) });
      });
      fallback.on('error', () => {
        resolve({ status: 'unavailable', error: e.message });
      });
    });
  });
}

/**
 * Schedule a batch of Cline tasks sequentially.
 * @param {Array} tasks - Array of { name, prompt }
 * @returns {Promise<Array>} Results
 */
export async function scheduleClineTasks(tasks = []) {
  const results = [];
  for (const task of tasks) {
    console.log(`  📅 Running: ${task.name}`);
    const result = await runClineTask(task.prompt);
    results.push({ name: task.name, ...result });
    // Brief pause between tasks to avoid resource spikes
    await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

/**
 * Default autonomous tasks for the agency — used by the daily cron.
 */
export const AUTONOMOUS_TASKS = [
  {
    name: 'daily-lead-harvest',
    prompt: 'node scripts/agency_cli.js scrape-maps restaurant "Austin, TX" 5',
    description: 'Harvest new restaurant leads from Austin, TX'
  },
  {
    name: 'pipeline-evaluation',
    prompt: 'node scripts/agency_cli.js hermes --dry-run',
    description: 'Dry-run Hermes to evaluate pipeline state'
  },
  {
    name: 'system-health',
    prompt: 'node scripts/agency_cli.js selfcheck',
    description: 'Verify all agency systems are operational'
  },
  {
    name: 'daily-summary',
    prompt: 'node scripts/agency_cli.js summary --local',
    description: 'Generate and send daily pipeline digest'
  }
];
