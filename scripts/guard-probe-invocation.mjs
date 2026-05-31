#!/usr/bin/env node
/**
 * PreToolUse guard — blocks BARE or BACKGROUNDED TI-84 ROM probe runs.
 *
 * The prose rule ("always run probes through scripts/run-probe.mjs, never bare,
 * never run_in_background") is easy for a long-context or token-pressured session
 * to rationalize around. This hook turns that rule into a mechanical wall so the
 * 2026-05-31 6h-orphan incident cannot recur via a forgotten wrapper.
 *
 * Reads the PreToolUse payload JSON on stdin. Exit 2 + a stderr message => Claude
 * Code blocks the tool call and feeds the message back to the model. Exit 0 =>
 * allow. We fail OPEN (exit 0) on any parse problem so the guard can never wedge
 * an otherwise-valid session.
 *
 * Detection (works for both the Bash and PowerShell tools, which carry `command`):
 *   isProbeExec  — `node ... probe-<name>.mjs` within one simple-command segment
 *                  (the [^&|;] class keeps it from matching across && / | / ;).
 *                  Deliberately does NOT match `run-probe.mjs` (basename has
 *                  `probe.` not `probe-`), so the wrapper itself is never flagged.
 *   usesWrapper  — the command goes through scripts/run-probe.mjs.
 */

import process from 'node:process';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let payload = {};
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    process.exit(0); // can't parse — don't interfere
  }

  const input = payload.tool_input || {};
  const cmd = typeof input.command === 'string' ? input.command : '';
  if (!cmd) process.exit(0);

  const isProbeExec = /\bnode(?:\.exe)?\b[^&|;\n]*\bprobe-[\w.-]*\.mjs/.test(cmd);
  const usesWrapper = /\brun-probe\.mjs\b/.test(cmd);
  const bg = input.run_in_background === true;

  const how =
    'Run it as: node scripts/run-probe.mjs --max-time 180 <probe.mjs> ' +
    '(FOREGROUND, Bash timeout: 300000). A bare/backgrounded probe can infinite-loop ' +
    'inside a single cpu.step() and orphan for hours (incident 2026-05-31).';

  if (isProbeExec && !usesWrapper) {
    process.stderr.write(`[probe-guard] BLOCKED: bare probe invocation. ${how}\n`);
    process.exit(2);
  }
  if (bg && (isProbeExec || usesWrapper)) {
    process.stderr.write(`[probe-guard] BLOCKED: probes must run in the FOREGROUND, not run_in_background. ${how}\n`);
    process.exit(2);
  }
  process.exit(0);
});
