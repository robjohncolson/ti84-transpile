#!/usr/bin/env node
/**
 * run-probe.mjs — hard wall-clock watchdog for TI-84 ROM probes.
 *
 * WHY THIS EXISTS
 * Probes are synchronous eZ80 step-loops. A lifted block can enter a JS-level
 * infinite loop *inside a single cpu.step()*, so the probe's own `maxSteps`
 * budget never fires — control never returns to the loop that checks it. An
 * in-process setTimeout can't save us either: the blocked event loop never runs
 * the timer. The only reliable cap is OUT OF PROCESS — run the probe as a child
 * and tree-kill it from a parent whose event loop is free.
 *
 * On 2026-05-31 probe-phase482-decode-cursor-render.mjs ran ~6h / 21,800s of CPU
 * as an orphan because nothing enforced a wall-clock cap (the harness's Bash-tool
 * timeout does NOT cascade to a child on Windows, and a backgrounded probe
 * escapes the tool timeout entirely). This wrapper closes that hole.
 *
 * USAGE (timeout(1) model — wrapper flags come BEFORE the probe path):
 *   node scripts/run-probe.mjs [--max-time <seconds>] <probe.mjs> [probe args...]
 *
 * Everything from the probe path onward is forwarded to the probe verbatim, so
 * the probe's own flags (even a literal `--max-time`) are never intercepted.
 * Default cap: 180s. Override with --max-time <sec> (before the path) or the
 * PROBE_MAX_TIME env var.
 *
 * IMPORTANT: keep --max-time STRICTLY BELOW the Bash-tool timeout you invoke this
 * with (e.g. cap 180s under a 300s tool timeout) so THIS wrapper fires first and
 * reaps the child. If the tool kills the wrapper first, on Windows the child is
 * NOT auto-killed and you get another orphan.
 *
 * SAFETY PROPERTIES (hardened after adversarial review 2026-05-31)
 *   - The kill is ASYNC (spawned taskkill), so a slow/hung kill cannot freeze
 *     the watchdog's own event loop.
 *   - A force-exit backstop guarantees the wrapper terminates within
 *     KILL_GRACE_MS of the cap even if the kill or the child 'exit' never lands —
 *     the watchdog can never itself become the orphan it prevents.
 *   - taskkill /T (Windows) / process-group kill (POSIX) reap grandchildren
 *     (probes execSync gunzip/node at startup). Single-process kill is only a
 *     last resort if taskkill cannot even launch.
 *
 * EXIT CODES
 *   <child code>  normal completion (propagated)
 *   124           hard wall-clock timeout (matches coreutils `timeout`)
 *   128           child terminated by a signal (POSIX; on Windows kills surface
 *                 as exit codes, so this branch is POSIX-only in practice)
 *   125           usage / spawn error (bad flag, missing probe, exec failure)
 *   130           wrapper itself interrupted (SIGINT/SIGTERM/SIGHUP)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

const MAX_TIME_CEILING_SEC = 600; // upper clamp: guards setTimeout 32-bit overflow + runaway caps
const KILL_GRACE_MS = 8000; // after a timeout kill, force wrapper exit even if the child never signals

const argv = process.argv.slice(2);

function fail(msg) {
  console.error(`[run-probe] ${msg}`);
  process.exit(125);
}

// --- parse args (timeout(1) model) ---
// Wrapper flags are recognized ONLY before the probe path. The first bare token
// is the probe path; everything after it is forwarded to the probe verbatim.
let probePath = null;
let maxTimeSec = Number(process.env.PROBE_MAX_TIME) || 180;
const passThrough = [];

for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (probePath) {
    passThrough.push(a); // once we have the probe, forward the rest untouched
    continue;
  }
  if (a === '--max-time') {
    maxTimeSec = Number(argv[i + 1]);
    i += 1;
    continue;
  }
  if (a.startsWith('--max-time=')) {
    maxTimeSec = Number(a.slice('--max-time='.length));
    continue;
  }
  if (a === '--') {
    continue; // optional separator before the probe path
  }
  if (!a.startsWith('-')) {
    probePath = a;
    continue;
  }
  fail(`unknown wrapper flag before probe path: ${a}`);
}

if (!probePath) {
  fail('usage: node scripts/run-probe.mjs [--max-time <sec>] <probe.mjs> [probe args...]');
}
if (!Number.isFinite(maxTimeSec) || maxTimeSec <= 0) {
  fail(`invalid --max-time: ${maxTimeSec}`);
}
if (maxTimeSec > MAX_TIME_CEILING_SEC) {
  fail(`--max-time ${maxTimeSec}s exceeds ceiling ${MAX_TIME_CEILING_SEC}s — pick a smaller cap`);
}
if (!fs.existsSync(probePath)) {
  fail(`probe not found: ${probePath}`);
}

// --- spawn the probe ---
// POSIX: make the child its own process-group leader so we can kill the whole
// group (the loop's destination is a Jetson/Linux host). Windows uses taskkill /T.
const spawnOpts = { stdio: 'inherit', windowsHide: true };
if (process.platform !== 'win32') {
  spawnOpts.detached = true;
}

const startedAt = Date.now();
const child = spawn(process.execPath, [probePath, ...passThrough], spawnOpts);

let timedOut = false;
let finished = false;

// Single terminal exit — every termination path funnels through here exactly once.
function done(code) {
  if (finished) return;
  finished = true;
  process.exit(code);
}

// Async, non-blocking tree-kill. A slow/hung kill must NEVER freeze our event loop
// (that would just move the orphan up one process level — the bug we're fixing).
function killTree(pid) {
  if (!Number.isInteger(pid)) return;
  if (process.platform === 'win32') {
    // taskkill /T /F reaps the whole tree (verified to kill gunzip/node grandchildren).
    try {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      // taskkill missing/failed to launch — last resort (single-process, won't reap
      // grandchildren, but the backstop timer still guarantees the wrapper exits).
      killer.on('error', () => {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
      });
    } catch {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
    return;
  }
  // POSIX: child leads its own group (detached) — negative pid kills the group + grandchildren.
  try {
    process.kill(-pid, 'SIGKILL');
    return;
  } catch {
    /* fall through */
  }
  try {
    child.kill('SIGKILL');
  } catch {
    /* already gone */
  }
}

const timer = setTimeout(() => {
  // Guard against the PID-reuse window: if the child already exited, do nothing
  // (its exit handler owns termination; killing a recycled pid could hit a stranger).
  if (finished || child.exitCode !== null) return;
  timedOut = true;
  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.error(
    `\n[run-probe] HARD TIMEOUT after ${secs}s (cap ${maxTimeSec}s) — ` +
      `killing ${probePath} (pid ${child.pid}) and its tree.`,
  );
  killTree(child.pid);
  // Backstop: exit the wrapper even if the kill or the child 'exit' event never
  // completes. The watchdog must never itself become the orphan it prevents.
  setTimeout(() => {
    console.error(`[run-probe] kill unconfirmed after ${KILL_GRACE_MS}ms — forcing wrapper exit 124.`);
    done(124);
  }, KILL_GRACE_MS);
}, maxTimeSec * 1000);

child.on('error', (err) => {
  clearTimeout(timer);
  console.error(`[run-probe] failed to spawn probe: ${err.message}`);
  done(125);
});

child.on('exit', (code, signal) => {
  if (timedOut) {
    done(124); // killed by our cap (fast path; backstop becomes a no-op)
    return;
  }
  clearTimeout(timer);
  if (signal) {
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.error(`[run-probe] ${probePath} terminated by signal ${signal} after ${secs}s.`);
    done(128);
    return;
  }
  done(code ?? 0);
});

// If THIS wrapper is asked to stop, take the child down with it (best effort).
// (A Windows tool-timeout uses TerminateProcess, which is NOT a catchable signal —
//  that is why --max-time must stay below the tool timeout so the cap fires first.)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    killTree(child.pid);
    setTimeout(() => done(130), 500); // let the async kill launch, then exit regardless
  });
}
