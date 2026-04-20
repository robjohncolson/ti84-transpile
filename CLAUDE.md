# CLAUDE.md

TI-84 Plus CE ROM transpilation + browser shell. Extracted from `apstats-live-worksheet` on 2026-04-19 to decouple transpile auto-sessions from the student-facing GH Pages deploy.

## What This Repo Is

A research project that lifts the TI-84 Plus CE OS ROM (eZ80 machine code) into runnable JavaScript, plus a browser shell that boots the lifted code with a real keyboard + LCD. Goal: enough OS coverage to render the home screen, accept keys, and trace OS internals (graph renderer, FPU, ISR dispatch, event loop).

**Status snapshot**: 95.92% true coverage of non-erased ROM bytes. Golden regression (`probe-phase99d-home-verify.mjs`) passing 26/26. See `CONTINUATION_PROMPT_CODEX.md` for the live state — that file is the handoff between sessions.

## Files

| Path | Purpose |
|------|---------|
| `CONTINUATION_PROMPT_CODEX.md` | **Read this first.** Live state + next priorities + key addresses |
| `TI-84_Plus_CE/ROM.rom` | TI-84 Plus CE OS 5.8.2.0029, 4 MB |
| `TI-84_Plus_CE/ROM.transpiled.js.gz` | Lifted JS (16 MB compressed; gunzip to ~214 MB). Regenerate via `scripts/transpile-ti84-rom.mjs` |
| `TI-84_Plus_CE/cpu-runtime.js` | eZ80 runtime + memory (write-protects ROM addresses < 0x400000) |
| `TI-84_Plus_CE/ez80-decoder.js` | Instruction decoder |
| `TI-84_Plus_CE/peripherals.js` | LCD/keyboard/timer MMIO |
| `TI-84_Plus_CE/browser-shell.html` | Browser frontend (live at `https://robjohncolson.github.io/ti84-transpile/TI-84_Plus_CE/browser-shell.html`) |
| `TI-84_Plus_CE/test-harness.mjs` | 25-test regression harness |
| `TI-84_Plus_CE/probe-phase99d-home-verify.mjs` | Golden regression: home-screen render, 26 cells, status dots |
| `TI-84_Plus_CE/audit-true-uncovered.mjs` | True coverage audit (use this, not `coveragePercent`) |
| `TI-84_Plus_CE/coverage-analyzer.mjs` | Gap analysis |
| `TI-84_Plus_CE/phase*-report.md` | One report per phase (~126 reports) |
| `TI-84_Plus_CE/keyboard-matrix.md`, `PHASE25_SPEC.md`, `PHASE25G_SPEC.md`, `AUTO_FRONTIER_SPEC.md` | Specs |
| `scripts/transpile-ti84-rom.mjs` | Lift the ROM to JS (~2s) |
| `scripts/auto-continuation.bat` | Launcher for the auto-continuation schtask |
| `.auto-continuation-prompt.md` | Wrapper prompt the schtask pipes into headless Claude |

## How To Regenerate

```bash
node scripts/transpile-ti84-rom.mjs                      # ~2s
node TI-84_Plus_CE/test-harness.mjs                      # 25-test harness
node TI-84_Plus_CE/probe-phase99d-home-verify.mjs        # golden regression
node TI-84_Plus_CE/audit-true-uncovered.mjs              # true-coverage audit
node TI-84_Plus_CE/coverage-analyzer.mjs                 # gap analysis
( cd TI-84_Plus_CE && gzip -kf -9 ROM.transpiled.js )    # regenerate .gz
```

`ROM.transpiled.js` is gitignored (~214 MB). The `.gz` is committed.

## Continuation Workflow (Default Operating Mode)

When the user says "go for it", "keep going", or invokes the auto-continuation loop:

1. **Pick up state**: Read `CONTINUATION_PROMPT_CODEX.md` first. Latest "Next-Session Priorities" section is the active list. Then `git log --oneline | head -10` for recent commits.
2. **Default to parallel Codex dispatch**: Use the cross-agent.py runner for any file-writing, probe-running, or disassembly work. CC focuses on investigation, analysis, and orchestration. Give Codex self-contained prompts with exact addresses, reference commits, file paths, and calling-convention details — it has NO conversation context. **Default posture: spawn 3-4 Codex agents in parallel** for independent priorities. Only serialize when a task depends on another task's output.
3. **At every pause** (after a phase completes, before picking the next target): run `/context` AND **update `CONTINUATION_PROMPT_CODEX.md`** with what just ran (artifacts, findings, next-phase priorities). Keep the "last updated" header current. Both steps are non-negotiable — the file is the only handoff mechanism.
4. **Continue or stop based on context**: < 70% of 1M → proceed to next priority without asking. ≥ 70% → make sure `CONTINUATION_PROMPT_CODEX.md` is fully up-to-date, then stop and hand off.
5. **Auto-continuation schtask**: `\TI84-AutoContinuation` fires `scripts/auto-continuation.bat` every 12h (midnight + noon local). Disable with `schtasks /change /tn \TI84-AutoContinuation /disable` if a human session is editing this file. Re-enable with `/enable`. Logs in `logs/` (gitignored).

**Do NOT** ask for approval between reasonable next-phase targets. The user delegated that judgment. Only stop for: (a) context ≥ 70%, (b) genuinely ambiguous fork, (c) destructive operation not previously authorized.

## Cross-Agent Dispatch (Codex)

```bash
python "C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py" \
  --direction cc-to-codex --task-type implement \
  --prompt "<self-contained task: exact addresses, file paths, calling conventions>" \
  --working-dir "C:/Users/rober/Downloads/Projects/school/ti84-transpile" \
  --timeout 600
```

**Constraints**:
- Codex tasks ≤10 min each — 15-min timeouts kill broader tasks. Split big investigations into (a) find X / (b) use X.
- Sonnet fallback via Agent tool when Codex stalls with 0-byte output.
- CC verifies every deliverable (re-run probes) before committing.

## Important Constraints

- **Don't revert dirty worktree files** without checking — many unrelated modifications sit in the tree intentionally.
- **Stay with 1:1-ish bytecode lift** — widen decoder, improve CFG discovery, improve instruction semantics, add runtime helpers only to support lifted blocks. Do NOT rewrite as a high-level emulator.
- **Disable timer IRQ for OS init probes**: `createPeripheralBus({ timerInterrupt: false })`. Default 200-tick IRQ hijacks init via 0x1713 → 0x67F8 → 0x1c33 infinite loop.
- **ROM write-protect essential**: `cpu-runtime.js` `write8/16/24` silently drop writes where `addr < 0x400000`.
- **Keyboard matrix (SDK-authoritative)**: `keyMatrix[N] = SDK Group(7-N)`. Scan code = `(idx << 4) | bit`. 63/64 active; DOWN = 0x00 collides with no-key. Full map in `TI-84_Plus_CE/keyboard-matrix.md`.
- **`mem.fill(val, start, length)` is WRONG** — it's `(val, start, END)`. Always use `start + length`.
- **GH Pages source**: `master:/`. Browser shell URL: `https://robjohncolson.github.io/ti84-transpile/TI-84_Plus_CE/browser-shell.html`.

## Sibling Repo

The TI-84 **trainer** (separate project, real CEmu WASM + native state machine for keystroke training) lives in `C:/Users/rober/Downloads/Projects/school/follow-alongs/ti84-trainer-v2/`. That repo also hosts the AP Stats worksheets and study guide. **Do not modify anything in `follow-alongs` from a transpile session** — that was the GH Pages collision that motivated this split.

## Code Style

Write extremely easy to consume code. Optimize for how easy the code is to read. Make the code skimmable. Avoid cleverness. Use early returns.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ti84-transpile** (2087 symbols, 2543 relationships, 43 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/ti84-transpile/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ti84-transpile/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ti84-transpile/clusters` | All functional areas |
| `gitnexus://repo/ti84-transpile/processes` | All execution flows |
| `gitnexus://repo/ti84-transpile/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
