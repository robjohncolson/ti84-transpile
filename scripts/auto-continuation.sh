#!/usr/bin/env bash
# Auto-continuation launcher for TI-84 ROM transpilation work.
# Linux port of scripts/auto-continuation.bat (the Windows Task Scheduler
# original that ran sessions 1-445). Designed to run via:
#   - manual trigger:  bash scripts/auto-continuation.sh
#   - crontab at user-chosen cadence (suggest 2h — see scripts/README-automation.md)
#
# Each run starts a fresh headless Claude Code session that reads
# .auto-continuation-prompt.md, dispatches implementation work, verifies
# results, updates CONTINUATION_PROMPT_CODEX.md, and commits+pushes to master.
#
# PID-file lock prevents overlap. Logs to logs/auto-continuation-runner.log.
# `touch .auto-continuation-disabled` at repo root stops the loop.
# `--dry-run` (or AUTO_CONTINUATION_DRY_RUN=1) skips only the claude
# invocation — lock, secret gate, and push backstop still run.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOCK=/tmp/ti84-auto-continuation.lock
LOGDIR="$REPO/logs"
RUNLOG="$LOGDIR/auto-continuation-runner.log"
PROMPT="$REPO/.auto-continuation-prompt.md"
KILLSWITCH="$REPO/.auto-continuation-disabled"

DRY_RUN="${AUTO_CONTINUATION_DRY_RUN:-0}"
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

mkdir -p "$LOGDIR"

# rotate runner log at 2 MB
if [ -f "$RUNLOG" ] && [ "$(stat -c %s "$RUNLOG" 2>/dev/null || echo 0)" -gt 2097152 ]; then
  mv "$RUNLOG" "$RUNLOG.1"
fi

# Kill switch — stops the loop without editing crontab (the Windows original
# used `schtasks /change /tn TI84-AutoContinuation /disable` for this).
if [ -f "$KILLSWITCH" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) cycle skipped (kill switch present: $KILLSWITCH)" >> "$RUNLOG"
  exit 0
fi

# Portable lock (no flock dependency). PID file + liveness check.
if [ -f "$LOCK" ]; then
  prev=$(cat "$LOCK" 2>/dev/null)
  if [ -n "$prev" ] && kill -0 "$prev" 2>/dev/null; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) cycle skipped (pid $prev still running)" >> "$RUNLOG"
    exit 0
  fi
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

{
  echo "===== $(date -u +%Y-%m-%dT%H:%M:%SZ) auto-continuation session start ====="
  start=$(date +%s)

  cd "$REPO" || exit 1

  if [ ! -f "$PROMPT" ]; then
    echo "FATAL: prompt missing at $PROMPT"
    exit 1
  fi

  # Same flags as the Windows .bat: Opus with Sonnet fallback, $25/session
  # budget cap, no session persistence. The prompt drives the whole cycle
  # (dispatch, verify, handoff update, commit, push).
  if [ "$DRY_RUN" = "1" ]; then
    echo "dry-run: skipping claude invocation"
  else
    claude -p "$(cat "$PROMPT")" \
      --dangerously-skip-permissions \
      --model claude-opus-4-6 \
      --fallback-model claude-sonnet-4-6 \
      --no-session-persistence \
      --max-budget-usd 25
    echo "claude exited with code $?"
  fi

  # Secret gate (shared implementation; canonical copy lives in
  # jetson/scripts/secret-gate.sh). A headless session reading logs or a sibling
  # repo will happily quote a credential it found into the handoff file. Refuse
  # to publish rather than push a secret to a public repo; the cycle's work
  # stays committed locally for triage.
  if ! bash "${REPO}/scripts/secret-gate.sh"; then
    dur=$(( $(date +%s) - start ))
    echo "===== auto-continuation session done in ${dur}s (push blocked) ====="
    echo
    exit 0
  fi

  # Push backstop — the session pushes itself in its Step 9, but if it ran out
  # of budget or context first, the commit strands locally. Best-effort,
  # non-fatal (see the jetson repo: the same bug bit its codex loops).
  if git push origin HEAD; then
    echo "push: ok"
  else
    echo "push: FAILED (non-fatal) — backlog will drain next cycle"
  fi

  dur=$(( $(date +%s) - start ))
  echo "===== auto-continuation session done in ${dur}s ====="
  echo
} >> "$RUNLOG" 2>&1
