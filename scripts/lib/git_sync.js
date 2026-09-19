/**
 * scripts/lib/git_sync.js
 * Resilient Git Synchronization & Push Engine
 *
 * Prevents race conditions and non-fast-forward push failures in CI/CD runners
 * and local environments when multiple workflows run concurrently.
 *
 * Features:
 *   1. Intelligent Pipeline CRM merging (deduplicates prospects by slug, retains higher stage)
 *   2. Exponential backoff retry loop on git push (up to 3 attempts)
 *   3. Automatic rebase against origin/main before pushing
 *   4. Safe stash / pop fallback if working directory is dirty
 *
 * ponytail: zero npm dependencies
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');

const STAGE_ORDER = [
  'DISCOVERED',
  'AUDITED',
  'DEMO_GENERATED',
  'OUTREACH_DRAFTED',
  'CONTACTED',
  'MEETING_SCHEDULED',
  'CLOSED_WON',
  'CLOSED_LOST'
];

function runCmd(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_EDITOR: 'true',
        GIT_TERMINAL_PROMPT: '0'
      },
      ...opts
    }).trim();
  } catch (err) {
    const errorMsg = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`Command failed [${cmd}]: ${errorMsg}`);
  }
}

/**
 * Merges two pipeline objects safely, keeping highest progression stage for prospects.
 */
export function mergePipelines(localPipeline, remotePipeline) {
  const merged = { ...localPipeline };
  const prospectMap = new Map();

  // Ingest remote first
  for (const p of remotePipeline?.prospects || []) {
    if (p.slug) prospectMap.set(p.slug, { ...p });
  }

  // Ingest local, updating with higher progression or newer data
  for (const localP of localPipeline?.prospects || []) {
    if (!localP.slug) continue;
    if (!prospectMap.has(localP.slug)) {
      prospectMap.set(localP.slug, { ...localP });
    } else {
      const existing = prospectMap.get(localP.slug);
      const existingStageIdx = STAGE_ORDER.indexOf(existing.stage);
      const localStageIdx = STAGE_ORDER.indexOf(localP.stage);

      const target = localStageIdx >= existingStageIdx ? { ...existing, ...localP } : { ...localP, ...existing };
      // Preserve demoPath and outreachPath if present in either
      target.demoPath = localP.demoPath || existing.demoPath || target.demoPath;
      target.outreachPath = localP.outreachPath || existing.outreachPath || target.outreachPath;
      target.ownerEmail = localP.ownerEmail || existing.ownerEmail || target.ownerEmail;
      prospectMap.set(localP.slug, target);
    }
  }

  merged.prospects = Array.from(prospectMap.values());
  merged.last_updated = new Date().toISOString();
  merged.pipeline_summary = {
    total_prospects: merged.prospects.length,
    discovered: merged.prospects.filter(p => p.stage === 'DISCOVERED').length,
    audited: merged.prospects.filter(p => p.stage === 'AUDITED').length,
    demo_generated: merged.prospects.filter(p => p.stage === 'DEMO_GENERATED').length,
    outreach_drafted: merged.prospects.filter(p => p.stage === 'OUTREACH_DRAFTED').length,
    contacted: merged.prospects.filter(p => p.stage === 'CONTACTED').length,
    meeting_scheduled: merged.prospects.filter(p => p.stage === 'MEETING_SCHEDULED').length,
    closed_won: merged.prospects.filter(p => p.stage === 'CLOSED_WON').length,
    closed_lost: merged.prospects.filter(p => p.stage === 'CLOSED_LOST').length,
    pipeline_value_usd: merged.prospects.filter(p => !['CLOSED_LOST', 'CLOSED_WON'].includes(p.stage)).length * 1500
  };

  return merged;
}

/**
 * Resiliently stages, commits, rebases, and pushes CRM data with backoff.
 */
export async function syncAndPush(opts = {}) {
  const {
    commitMessage = `chore(crm): 🤖 automated sync — ${new Date().toISOString()}`,
    files = [
      'pipeline.json',
      'interactions.json',
      'prospects/',
      'demos/',
      'public/demos/',
      'outreach/',
      'proposals/',
      'clients/',
      'reports/'
    ],
    maxRetries = 3
  } = opts;

  console.log('🔄 [GitSync] Starting resilient CRM repository synchronization...');

  // 1. Stage requested files
  for (const f of files) {
    const fullPath = path.join(ROOT_DIR, f);
    if (fs.existsSync(fullPath)) {
      try {
        runCmd(`git add "${f}"`);
      } catch {}
    }
  }

  // 2. Check if there are staged changes
  let hasStaged = false;
  try {
    const diff = runCmd('git diff --staged --name-only');
    hasStaged = Boolean(diff && diff.length > 0);
  } catch {
    hasStaged = false;
  }

  let committed = false;
  if (hasStaged) {
    // 3. Commit locally
    runCmd(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
    console.log(`✅ [GitSync] Local commit created: "${commitMessage}"`);
    committed = true;
  }

  // Check if we have unpushed commits ahead of upstream
  let isAhead = false;
  try {
    const aheadCount = runCmd('git rev-list @{u}..HEAD --count');
    isAhead = parseInt(aheadCount, 10) > 0;
  } catch {
    // Fallback: check status for ahead message
    try {
      const statusOut = runCmd('git status');
      isAhead = statusOut.includes('Your branch is ahead of');
    } catch {
      isAhead = true;
    }
  }

  if (!committed && !isAhead) {
    console.log('ℹ️ [GitSync] No changes to commit or push.');
    return { committed: false, pushed: false };
  }

  // 4. Resilient Push Loop with Rebase
  let attempt = 0;
  let delayMs = 2000;

  while (attempt < maxRetries) {
    attempt++;
    try {
      console.log(`🚀 [GitSync] Pushing to remote (Attempt ${attempt}/${maxRetries})...`);
      // Try pull --rebase with autostash first
      try {
        runCmd('git pull --rebase --autostash origin main --strategy-option=theirs');
      } catch (pullErr) {
        console.warn(`  ⚠️ Rebase conflict encountered: ${pullErr.message}. Checking rebase status...`);
        const isRebasing = fs.existsSync(path.join(ROOT_DIR, '.git', 'rebase-merge')) ||
                           fs.existsSync(path.join(ROOT_DIR, '.git', 'rebase-apply'));
        if (isRebasing) {
          if (fs.existsSync(PIPELINE_FILE)) {
            try {
              let remotePipelineRaw = '';
              try {
                remotePipelineRaw = runCmd('git show :3:pipeline.json');
              } catch {
                remotePipelineRaw = runCmd('git show origin/main:pipeline.json');
              }
              const remotePipeline = JSON.parse(remotePipelineRaw);
              const localPipeline = JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8'));
              const merged = mergePipelines(localPipeline, remotePipeline);
              fs.writeFileSync(PIPELINE_FILE, JSON.stringify(merged, null, 2), 'utf-8');
              runCmd('git add pipeline.json');
              runCmd('git -c core.editor=true rebase --continue');
            } catch (mergeErr) {
              console.warn(`  ⚠️ Conflict auto-merge failed: ${mergeErr.message}. Aborting rebase...`);
              try { runCmd('git rebase --abort'); } catch {}
              throw mergeErr;
            }
          } else {
            try { runCmd('git rebase --abort'); } catch {}
          }
        }
      }

      runCmd('git push origin main');
      console.log('🎉 [GitSync] Successfully pushed updates to origin/main!');
      return { committed: true, pushed: true };
    } catch (pushErr) {
      console.warn(`⚠️ [GitSync] Push attempt ${attempt} failed: ${pushErr.message}`);
      if (attempt < maxRetries) {
        console.log(`⏳ Waiting ${delayMs / 1000}s before retrying...`);
        await new Promise(r => setTimeout(r, delayMs));
        delayMs *= 2;
      } else {
        throw new Error(`[GitSync] Failed to push after ${maxRetries} attempts: ${pushErr.message}`);
      }
    }
  }

  return { committed: true, pushed: false };
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const msg = process.argv.slice(2).join(' ') || `chore(crm): 🤖 automated sync [skip ci]`;
  syncAndPush({ commitMessage: msg })
    .then(res => {
      console.log('✨ [GitSync] Result:', res);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ [GitSync] Fatal Error:', err.message);
      process.exit(1);
    });
}
