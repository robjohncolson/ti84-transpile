# Phase 602 Entry Line Analysis

## Purpose

This session investigates why, after injecting only the `2` key, the entry line contains the expected `2` glyph at columns 14-23 and an additional `8`-shaped glyph at columns 26-35.

## Probe

New probe:

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase602-entry-line-detail.mjs
```

The probe follows the standard boot recipe:

1. Boots the OS from `0x09DD62` with the halt-block return address `0x0019B5`.
2. Paints the status bar from `0x058241` with timer interrupts enabled.
3. Injects only the `2` key:
   - matrix group `3`, bit `1`
   - raw scan code `D00587 = 0x1A`
   - translated key code `D0058E = 0x90`
   - pending key bytes `D0058C = 0x90`, `D0058D = 0x90`
   - key flags at `D00080` and `D0009F`
4. Runs the outer loop step by step.
5. Captures detailed state every 1,000 steps from outer-loop step 270,000 through 280,000, plus one final capture at halt or at the final non-halt sample.

## Captured Data

Each capture prints:

- `D0058E`, confirming the translated key code still reflects the injected key.
- The 24-bit value stored at `D0231A`.
- The 24-bit value stored at `D0243A`.
- Rows 219-240 across all 320 columns.
- For every row, the exact non-white column ranges.
- A 320-character pixel map for every row, where `#` is non-white and `.` is white.
- 64 bytes from the address stored at `D0231A`.
- 64 bytes from the address stored at `D0243A`.

## Expected Interpretation

The key discriminator is the edit-buffer dump:

- If the buffer contains only the `2` token/code and no `8` token/code, the extra glyph is not a second processed key.
- If `D0058E` remains `0x90`, that confirms the outer loop processed only the injected `2` key.
- If the second glyph appears in VRAM while the edit buffer contains only one token, likely causes are MathPrint layout, cursor rendering, or stale display state.
- If the byte stream at the edit cursor contains both a `2` token and an `8` token, the issue is upstream of rendering and the injected/pending key path is producing two entry tokens.

## Findings

This report file was created with the probe, but the probe was not executed in this subagent run because the subagent instruction explicitly says to apply patches, write the result file, and exit immediately without running verification commands, tests, or lint checks.

Run the probe command above to fill in the final observed pixel ranges and edit-buffer bytes.
