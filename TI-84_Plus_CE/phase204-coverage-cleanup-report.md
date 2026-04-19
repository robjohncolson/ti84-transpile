# Phase 204 Coverage Cleanup Report

Date: 2026-04-18

## Seed Update

- Phase 200 seed file pattern is still active via `TI-84_Plus_CE/phase200-seeds.txt`.
- Already present before this pass: `0x083B98`, `0x05AC04`, `0x09D22C`.
- Missing documented seed added: `0x035D3B`.
- Added six more live top-gap CODE? seeds from the current `audit-true-uncovered.mjs` output:
  - `0x0B16AB` (`62` bytes)
  - `0x0AF099` (`60` bytes)
  - `0x060915` (`59` bytes)
  - `0x03E103` (`57` bytes)
  - `0x071CE0` (`57` bytes)
  - `0x08DDBF` (`57` bytes)

## Top 10 CODE? Gaps Before Phase 204

| Rank | Address | Length |
| --- | --- | ---: |
| 1 | `0x0B16AB` | 62 |
| 2 | `0x0AF099` | 60 |
| 3 | `0x060915` | 59 |
| 4 | `0x03E103` | 57 |
| 5 | `0x071CE0` | 57 |
| 6 | `0x08DDBF` | 57 |
| 7 | `0x04563C` | 56 |
| 8 | `0x057A43` | 55 |
| 9 | `0x07802E` | 55 |
| 10 | `0x0158FA` | 54 |

## Metrics

True coverage here follows the Phase 200 reframing: `coveredBytes / 729,489` non-erased ROM bytes.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Seed count | 49,965 | 49,972 | +7 |
| Blocks | 143,526 | 143,547 | +21 |
| Covered bytes | 699,583 | 699,697 | +114 |
| Reported coverage | 16.6794% | 16.6821% | +0.0027 pp |
| True coverage | 95.9004% | 95.9160% | +0.0156 pp |
| Uncovered non-erased ranges | 3,419 | 3,419 | +0 |
| Uncovered non-erased bytes | 45,917 | 45,803 | -114 |
| CODE? bytes in audit | 13,513 | 13,287 | -226 |

## Golden Regression

- Requested command path from the task, `node TI-84_Plus_CE/probe-golden-regression.mjs`, is stale in this checkout and fails with `MODULE_NOT_FOUND`.
- Repository docs already point to `node TI-84_Plus_CE/probe-phase99d-home-verify.mjs` as the maintained golden-regression harness, so that probe was used instead.
- Result: PASS
  - `bestMatch=row39 col2`
  - `decoded="Normal Float Radian       "`
  - `26/26` exact matches
  - `Normal`, `Float`, `Radian`: `3/3 PASS`
  - `fg=1004`

## Artifacts Regenerated

- `TI-84_Plus_CE/ROM.transpiled.js`
- `TI-84_Plus_CE/ROM.transpiled.report.json`
- `TI-84_Plus_CE/phase204-coverage-cleanup-report.md`
