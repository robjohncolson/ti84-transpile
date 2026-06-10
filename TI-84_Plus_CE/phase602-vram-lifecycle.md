# Phase 602 VRAM Lifecycle

Probe: `probe-phase602-vram-zero-tracker.mjs`. Boots from `0x09DD62`, paints through `0x058241`, injects the `2` key, runs the outer loop from `0x08C331` with return `0x0019B5` pushed.

## VRAM Lifecycle Timeline

| Block | Steps | VRAM px | PC | Event |
|-------|-------|---------|----|-------|
| 0 | 0 | 1348 | — | Post-paint baseline |
| 500–40500 | 500–40500 | 1357 | 0x001C3C loop | Stable home screen (key dispatch, OS idle) |
| 41000–44000 | 41K–44K | 1354 → 22 | 0x09EFDE | Screen clear in progress (erasing old content) |
| 44500 | 44500 | 36 | 0x000719 | Clear nearly complete, residual pixels |
| 48000–50000 | 48K–50K | 50 → 145 | 0x0A255F/258B | MathPrint re-render begins |
| 50500–82500 | 50.5K–82.5K | 149 → 1466 | 0x0A25xx | MathPrint glyph rendering (rising) |
| 82500 | 82500 | **1466** | 0x0A255F | **Pre-wipe peak** |
| 84825 | 84825 | — | 0x0018F8 | **1st bulk init (0x0018F8)** — wipes RAM including VRAM |
| **85000** | **85000** | **0** | **0x00611D** | **TRANSITION: VRAM goes to zero** (D007CA=0x000000) |
| 88000–94000 | 88K–94K | 129 → 3040 | 0x005Bxx | LCD redraw (status bar + home screen) |
| 94500–174500 | 94.5K–174.5K | 3031 | 0x006D38/6D64 | Stable plateau — cursor blink / key poll loop |
| 175000–254500 | 175K–254.5K | 3039 | 0x000BFE/0B72 | Second stable plateau — slightly more pixels (cursor state change) |
| 255000 | 255K | 3042 | 0x005B16 | LCD redraw starts |
| 255500 | 255.5K | 258 | 0x005974 | Screen wipe in progress |
| 257500–263000 | 257.5K–263K | 521 → 3355 | 0x005xxx | Full re-render |
| **264500** | **264500** | **3364** | **0x000E9D** | **Global peak VRAM** |
| 274953 | 274953 | — | 0x0018F8 | **2nd bulk init (0x0018F8)** — second RAM wipe |
| **275000** | **275000** | **0** | **0x006145** | VRAM zeroed again by second wipe |
| 276820 | 276820 | 0 | 0x0019B5 | **Halt** — natural termination |

## Wipe Events

Two hits of the bulk memory initializer at `0x0018F8`:

1. **Block 84,825**: Wipes RAM (82KB+8KB+255B+37B + integrity check). VRAM drops from 1466 to 0. D007CA zeroed. This occurs inside `cxMain` during context re-initialization after the key dispatch completes.

2. **Block 274,953**: Second identical wipe. VRAM drops from ~3353 to 0. This fires during the post-dispatch teardown, just before the run halts at `0x0019B5`.

## Key Findings

- **Double wipe confirmed**: `0x0018F8` fires exactly twice (blocks 84,825 and 274,953). Both times, VRAM is collateral damage of a bulk RAM clear — not a targeted display operation.
- **Pre-wipe peak**: 1466 px at block 82,500 (MathPrint rendering of the '2' character).
- **Global peak**: 3364 px at block 264,500 — full home screen with status bar, entry line, and MathPrint glyphs.
- **Final state**: 0 px. The second wipe at block 274,953 zeroes VRAM just before halt. This is an artifact of the lifted run boundary (the OS would normally re-render after `0x0018F8`).
- **Cursor blink visible**: Two distinct stable plateaus at 3031 px (blocks 94.5K–174.5K) and 3039 px (blocks 175K–254.5K), differing by 8 pixels — consistent with cursor on/off toggling.
- **Screen clear at 0x09EFDE**: The pre-wipe render cycle includes a progressive screen clear (blocks 41K–44K) that sweeps VRAM from 1357 down to 22 px before re-rendering the updated display.
- **Termination**: Natural halt at `0x0019B5` after 276,820 steps.

## Raw Probe Output

```
Phase 602: VRAM zero tracker — find where VRAM goes from non-zero to zero
Post-paint VRAM: 1348 non-white pixels
Pre-outer-loop VRAM: 1348 non-white pixels
*** TRANSITION DETECTED at block 85000: VRAM went from 1466 to 0 ***
    PC=0x00611D, cpu.pc=0x00611D
    Peak was 1466 at block 82500
    Bulk init (0x0018F8) recent=true, total hits=1
    D007CA=0x000000, SP=0xD1A872

Execution: 276820 steps, termination=halt, lastPc=0x0019B5
Final VRAM: 0 non-white pixels
Peak VRAM: 3364 non-white pixels at block 264500
Bulk init (0x0018F8) total hits: 2

=== JSON SUMMARY ===
{
  "ok": true,
  "vramAfterPaint": 1348,
  "peakCount": 3364,
  "peakStep": 264500,
  "transition": {
    "block": 85000,
    "pc": "0x00611D",
    "cpuPc": "0x00611D",
    "peakCount": 1466,
    "peakStep": 82500,
    "bulkInitRecent": true,
    "bulkInitHitsSoFar": 1,
    "d007ca": "0x000000",
    "sp": "0xD1A872",
    "lastBulkInitBlock": 84825
  },
  "bulkInitHits": [
    { "block": 84825, "pc": "0x0018F8" },
    { "block": 274953, "pc": "0x0018F8" }
  ],
  "sampleCount": 553,
  "executionSteps": 276820,
  "termination": "halt",
  "lastPc": "0x0019B5",
  "finalVram": 0
}
```
