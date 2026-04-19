# Phase 199 — CEmu Scenario Matrix Seed Expansion

**Date:** 2026-04-18
**Builds on:** Phase 198 (boot-only trace)

## Scenarios Run (Autotester + patched CEmu, commit 73a4cb0c...)

| Scenario | JSON | Trace log | Unique PCs |
|----------|------|-----------|------------|
| Boot-only | smoke.json | smoke-trace.log | 22,238 |
| MODE | scenario-mode.json | mode-trace.log | 23,966 |
| Y= | scenario-yequ.json | yequ-trace.log | 23,689 |
| GRAPH | scenario-graph.json | graph-trace.log | 24,418 |
| CLEAR | scenario-clear.json | clear-trace.log | 22,556 |
| 2+3 ENTER | scenario-arith.json | arith-trace.log | 24,722 |

All 5 new scenarios: boot → sendCSC|<key> → delay → cleanup. Autotester `valid_keys` is lowercase (`mode`, `y=`, `graph`, `clear`, `enter`, `+`, digits); Codex-style PascalCase labels errored.

## Post-processor Change

`TI-84_Plus_CE/cemu-trace-to-seeds.mjs` now globs every `*-trace.log` in `cemu-build/` instead of only `smoke-trace.log`. Union across all 6 traces.

## PC Trace Stats

| Metric | Value |
|--------|-------|
| Raw PC lines across 6 traces | 147,859,649 |
| Unique ROM PCs (0x000000–0x3FFFFF) | 28,580 |
| Already in existing seed files | 3 |
| Novel PCs vs prior seeds | 28,577 |
| Delta vs Phase 198 (boot-only) | +6,342 unique ROM PCs |

## Coverage Delta vs Phase 198

| Metric | Phase 198 | Phase 199 | Delta |
|--------|-----------|-----------|-------|
| seedCount | 43,613 | 49,955 | +6,342 |
| blockCount | 139,624 | 143,436 | **+3,812** |
| coveredBytes | 698,341 | 698,408 | +67 |
| coverage % | 16.6497% | 16.6513% | +0.0016 pp |

## Regression Status

**PASS** — `probe-phase99d-home-verify.mjs`: 26/26 exact decode on "Normal Float Radian"; Normal, Float, Radian all PASS; bestMatch row39 col2 fg=1004.

## .gz Size

| | Size |
|-|------|
| Phase 198 | 15,784,201 bytes (15.05 MB) |
| Phase 199 | 17,214,039 bytes (16.42 MB) |
| Delta | +1,429,838 bytes (+9.1%) |

## Honest Read

- **Byte coverage gain is marginal (+0.0016 pp).** Same pattern as Phase 198: new entry points mostly walk into already-covered byte ranges through alternative paths; the walker dedupes.
- **The structural win is +3,812 new basic blocks.** Block graph is materially denser, which should reduce `missing_block` terminations during probe execution.
- **The "scenarios unlock several pp" hypothesis did not pan out.** The dominant uncovered code regions (math library interior, graphing engine loops, editor inner state machines) likely need richer scenarios with actual computation — enter a function + graph it, run 1-VarStats on a list, chain ans+1 operations — not just single-keypress hits that fall through to the same shared helpers.

## Files Touched

| File | Status |
|------|--------|
| `cemu-build/scenario-mode.json` | NEW |
| `cemu-build/scenario-yequ.json` | NEW |
| `cemu-build/scenario-graph.json` | NEW |
| `cemu-build/scenario-clear.json` | NEW |
| `cemu-build/scenario-arith.json` | NEW |
| `cemu-build/run-trace-DE.ps1` | NEW |
| `cemu-build/run-trace-FGH.ps1` | NEW |
| `cemu-build/mode-trace.log` (+4 more) | NEW (gitignored, outside repo) |
| `TI-84_Plus_CE/cemu-trace-to-seeds.mjs` | MODIFIED (glob `*-trace.log`) |
| `TI-84_Plus_CE/cemu-trace-seeds.txt` | REGENERATED (22,238 → 28,580 PCs) |
| `TI-84_Plus_CE/ROM.transpiled.report.json` | REGENERATED |
| `TI-84_Plus_CE/ROM.transpiled.js.gz` | REGENERATED |
| `TI-84_Plus_CE/phase199-scenario-matrix-report.md` | NEW (this file) |

## Next Session — Strategy Fork

Seeds-from-traces is hitting diminishing returns. Three options for Phase 200:

1. **Richer scenarios** — graph an actual function, run a stat test, chain arithmetic (ans+1 loop). Higher effort, may still be marginal if the shared-helper pattern holds.
2. **Pivot to static CF discovery** — lean into decoder completeness and jump-table walkers instead of dynamic traces.
3. **Accept the wall** — 16.65% is enough to land the 4-stage home composite + keyboard; focus remaining Phase 200+ budget on feature work (more apps reachable, error banners, FPU ops) rather than chasing coverage %.
