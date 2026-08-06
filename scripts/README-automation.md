# Auto-Continuation Automation (Linux)

> **Read this first.** `auto-continuation.bat` and the Claude prompt it wraps were
> **retired on 2026-06-11 to save Claude credits**. The loop that actually ran
> afterwards — auto-sessions through 2026-07-13 — is `auto-continuation-codex.ps1`,
> a Codex tick supervisor with a wrapper-owned golden-regression commit gate, and
> its schtask is currently Disabled. This script is a faithful bash port of the
> *retired Claude* launcher, so running it resumes the expensive mechanism, not
> the current one. If you want the Linux loop to match what Windows actually does,
> port the ps1's tick supervisor instead. Ported anyway because the Surface is the
> always-on machine now and having the launcher on Linux is a prerequisite either way.

`scripts/auto-continuation.sh` is the Linux port of `scripts/auto-continuation.bat`,
the Windows Task Scheduler launcher that drove auto-sessions 1-445. Each run
starts one fresh headless Claude Code session that reads
`.auto-continuation-prompt.md`, works the priority list in
`CONTINUATION_PROMPT_CODEX.md`, verifies results, appends a session entry, and
commits+pushes to master. Session numbering lives in the handoff file itself —
the headless session reads the latest entry and increments it, so the runner
tracks nothing.

## Install (crontab — NOT installed yet, do this yourself)

The crontab entry has deliberately **not** been installed. When you are ready
to resume the loop, run `crontab -e` and add:

```
0 */2 * * * PATH=/home/mrcolson/.local/bin:/home/mrcolson/.nvm/versions/node/v24.16.0/bin:/usr/local/bin:/usr/bin:/bin /home/mrcolson/repos/ti84-transpile/scripts/auto-continuation.sh
```

The inline `PATH=` matters: cron's default PATH has neither `claude`
(`~/.local/bin`) nor `node` (nvm — bump the version segment when you upgrade
node). 2h is the calibrated steady-state cadence from the Windows run
(~1.17% of weekly budget per session; see the pacing header in
`CONTINUATION_PROMPT_CODEX.md`). To retune pacing, edit the cron schedule —
e.g. `0 * * * *` for hourly during a final-day push.

## Stop / start without touching crontab

```bash
touch /home/mrcolson/repos/ti84-transpile/.auto-continuation-disabled   # pause
rm    /home/mrcolson/repos/ti84-transpile/.auto-continuation-disabled   # resume
```

Do this before any human session edits `CONTINUATION_PROMPT_CODEX.md`, same as
the old `schtasks /disable` rule.

## Dry run

```bash
bash scripts/auto-continuation.sh --dry-run    # or AUTO_CONTINUATION_DRY_RUN=1
```

Skips only the claude invocation — lock, secret gate, and push backstop still
run (so a dry run will push any stranded local commits).

## Logs

Everything appends to `logs/auto-continuation-runner.log` (gitignored),
rotated to `.log.1` at 2 MB. One overlapping-run guard: a PID-file lock at
`/tmp/ti84-auto-continuation.lock` with a liveness check, so a crashed run
never wedges the loop.

## Secret gate

Before pushing, the runner scans `git diff -U0 origin/HEAD..HEAD` additions
for credential shapes (JWT `eyJhbGciOiJ...`, `sk-...`, `ghp_...`, `AKIA...`)
and refuses to push if any match — the commit stays local for triage. Same
logic as `jetson/scripts/synthesis-cycle.sh`, which grew it after a
service_role JWT nearly shipped in two cycles there.

## How the Windows original differed

| | Windows (`auto-continuation.bat`) | Linux (`auto-continuation.sh`) |
|---|---|---|
| Scheduler | schtask `\TI84-AutoContinuation`, daily trigger + repeat interval | crontab entry (above) |
| Pause | `schtasks /change /tn TI84-AutoContinuation /disable` | `.auto-continuation-disabled` kill-switch file |
| Retune interval | `schtasks /change ... /ri <minutes>` | edit crontab schedule |
| Invocation | `type prompt \| claude --print --permission-mode bypassPermissions ...` | `claude -p "$(cat prompt)" --dangerously-skip-permissions ...` — same model (`claude-opus-4-6`), fallback (`claude-sonnet-4-6`), `--no-session-persistence`, `--max-budget-usd 25` |
| Logs | one `logs/auto-session-<timestamp>.log` per run, unbounded | single rotating runner log |
| Overlap guard | none (relied on 2h >> ~20 min sessions) | PID-file lock + liveness check |
| Secret gate | none | JWT/sk-/ghp_/AKIA scan before push |
| Push | session's Step 9 only | session's Step 9, plus best-effort runner backstop for budget/context-truncated sessions |
| Repo path | hardcoded `C:\Users\rober\...` | resolved from the script's own location |

## Known gap before re-enabling

`.auto-continuation-prompt.md` and `CLAUDE.md` still contain Windows paths:
the repo at `C:/Users/rober/Downloads/Projects/school/ti84-transpile` and the
Codex dispatcher at `C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py`.
On this machine the dispatcher lives at
`/home/mrcolson/repos/Agent/runner/cross-agent.py`. Until those references are
updated, a headless session will fail its Codex dispatch step and fall back to
Sonnet subagents (or write a BLOCKED entry). Update the prompt paths before
installing the crontab entry.
