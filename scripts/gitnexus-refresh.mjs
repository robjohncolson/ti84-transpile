#!/usr/bin/env node
// Background GitNexus index refresh — keeps the code-intelligence graph fresh
// without ever blocking a commit or an auto-continuation tick.
//
// Entry points:
//   node scripts/gitnexus-refresh.mjs            Hook mode (PostToolUse): reads the
//                                                hook JSON on stdin and refreshes only
//                                                when the tool call was a git commit/merge.
//   node scripts/gitnexus-refresh.mjs --now      Unconditional refresh — called by the
//                                                Codex supervisor right after it pushes.
//   node scripts/gitnexus-refresh.mjs --worker   The detached worker (internal): runs
//                                                analyze, then always drops the lock.
//
// --now / hook mode spawn the --worker DETACHED and return immediately. The worker
// runs `gitnexus analyze` synchronously and removes the lock in a finally, so cleanup
// can't be defeated by shell-quoting quirks.
//
// Scope is set by .gitnexusignore (engine only, not the 2,154 probes). --max-file-size
// 1024 keeps the 872 KB transpiler in scope. --embeddings is a ~2s no-op when the index
// is up to date and only embeds when engine code actually changed. --skip-agents-md keeps
// volatile stat lines out of CLAUDE.md/AGENTS.md so the worktree stays clean between ticks.
//
// A 15-minute lockfile prevents two analyze runs from overlapping — concurrent runs are
// what corrupted the LadybugDB checkpoint that this whole fix addresses.

import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..');
const lockFile = resolve(repoRoot, '.gitnexus_refresh.lock');
const metaFile = resolve(repoRoot, '.gitnexus/meta.json');
const STALE_MINUTES = 15;
const ANALYZE = 'npx --no-install gitnexus analyze --max-file-size 1024 --embeddings --skip-agents-md';

// True when the graph is non-empty but its embeddings were dropped. This happens
// when something ran a plain `gitnexus analyze` (no --embeddings) that did real
// incremental work — it drops embeddings AND advances the commit stamp to HEAD.
// After that, an incremental `--embeddings` run no-ops ("already up to date") and
// does NOT regenerate them, so semantic search stays dead until a full re-index.
function embeddingsMissing() {
  try {
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    return (meta?.stats?.nodes ?? 0) > 0 && (meta?.stats?.embeddings ?? 0) === 0;
  } catch {
    return false;
  }
}

// --- Worker: the detached child. Runs analyze, then always releases the lock. -----
if (process.argv.includes('--worker')) {
  try {
    // Force a full re-index (`-f`) when embeddings are missing so they regenerate;
    // otherwise stay incremental (a ~2s no-op when nothing in-scope changed).
    const cmd = embeddingsMissing() ? `${ANALYZE} -f` : ANALYZE;
    execSync(cmd, { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    // Swallow: a failed refresh must never wedge the lock or crash loudly in the
    // background. The next refresh retries; status/doctor surface real problems.
  } finally {
    rmSync(lockFile, { force: true });
  }
  process.exit(0);
}

function refreshAlreadyRunning() {
  if (!existsSync(lockFile)) return false;
  const ageMinutes = (Date.now() - statSync(lockFile).mtimeMs) / 60000;
  return ageMinutes < STALE_MINUTES;
}

function launchRefresh() {
  if (refreshAlreadyRunning()) return;
  writeFileSync(lockFile, `${process.pid} ${new Date().toISOString()}`);
  const child = spawn(process.execPath, [thisFile, '--worker'], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

// --now: skip the git-commit check (the supervisor already knows it committed).
if (process.argv.includes('--now')) {
  launchRefresh();
  process.exit(0);
}

// Hook mode: refresh only after a git commit/merge, so ordinary Bash calls are free.
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  let command = '';
  try {
    command = JSON.parse(stdin || '{}')?.tool_input?.command || '';
  } catch {
    command = '';
  }
  if (/git\s+(commit|merge)\b/.test(command)) launchRefresh();
  process.exit(0);
});

// Safety net: never hang if no stdin arrives.
setTimeout(() => process.exit(0), 2000).unref();
