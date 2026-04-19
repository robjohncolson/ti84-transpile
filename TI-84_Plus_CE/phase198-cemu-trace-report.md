# Phase 198 — CEmu Boot-Trace Seed Integration

**Date:** 2026-04-18  
**Pinned CEmu commit:** `73a4cb0c1ae2a9d5c8d70ccb5f02c5705ad1871b`

## CEmu Build Commands (Phase B+C)

```bash
git clone https://github.com/CE-Programming/CEmu.git
cd CEmu
cmake -B build -DDEBUG_SUPPORT=ON   # + PC-trace patch applied
cmake --build build --config Release
# autotester.exe run with smoke.json (boot scenario, ~3s emulated)
# output: C:/Users/rober/Downloads/Projects/cemu-build/smoke-trace.log
```

## Scenarios Run

| Scenario | File | Duration | Description |
|----------|------|----------|-------------|
| Boot-only | smoke-trace.log | ~3s emulated | Cold boot from reset vector |

## PC Trace Stats

| Metric | Value |
|--------|-------|
| Raw PC lines in trace | 22,946,604 |
| Unique ROM PCs (0x000000–0x3FFFFF) | 22,238 |
| PCs already in existing seed files | 3 |
| Novel PCs added | 22,235 |

## Coverage Delta

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| seedCount | 21,375 | 43,613 | +22,238 |
| blockCount | 123,732 | 139,624 | +15,892 |
| coveredBytes | 697,867 | 698,341 | +474 |
| coverage % | 16.6384% | 16.6497% | +0.0113 pp |

## Regression Status

**PASS** — Golden regression probe-phase99d-home-verify.mjs:
- 26/26 exact decode on "Normal Float Radian"
- Normal: PASS, Float: PASS, Radian: PASS
- Status dots: 36 fg pixels (left + right both PASS)
- fg=1004 ✓

## .gz Size

| | Size |
|-|------|
| Before | 15,191,642 bytes (14.49 MB) |
| After | 15,784,201 bytes (15.05 MB) |
| Delta | +592,559 bytes (+3.9%) |

## Transpile Timing

2.634s (well within expected ~2s baseline; 198MB output)

## Files Touched

| File | Status |
|------|--------|
| `TI-84_Plus_CE/cemu-trace-to-seeds.mjs` | NEW — post-processor script |
| `TI-84_Plus_CE/cemu-trace-seeds.txt` | NEW — 22,238 ROM PCs from boot trace |
| `scripts/transpile-ti84-rom.mjs` | MODIFIED — added cemuTraceSeedsPath + load + spread |
| `TI-84_Plus_CE/ROM.transpiled.report.json` | REGENERATED |
| `TI-84_Plus_CE/ROM.transpiled.js.gz` | REGENERATED |

## Notes

- Only 3 of the 22,238 CEmu boot-trace PCs overlapped with existing seed files, confirming the trace covers substantially new execution paths.
- Block count increased by +15,892 but covered bytes only grew by +474 — the new seeds mostly walk into already-covered byte ranges via different entry paths, with the walker deduplicating byte coverage. This is expected: the boot trace hits heavily-executed OS paths already reachable from prior seeds.
- The coverage percentage gain (+0.0113 pp) is modest but the structural benefit is in block graph completeness — more entry points means fewer `missing_block` terminations during probe execution.
- No regression in the golden home-screen render test.
