# Phase 70: Home Screen Intersection Hunt — IMPORTANT CORRECTION

## Executive Summary

**Phase 69's interpretation of 0x046878 and 0x03dc1b was wrong.** They are NOT "bottom status bar renderer" and "top header bar renderer". They are mid-function PCs that happen to render **solid-color rectangles** at those screen positions — not text rendering functions.

## Evidence

### The render sizes are exact multiples of 320 (screen width)

- **0x046878**: 12,800 px = **40 rows × 320 cols** exactly. Bbox r179-218 c0-319 = 40×320 = 12800 cells.
- **0x03dc1b**: 5,440 px = **17 rows × 320 cols** exactly. Bbox r0-16 c0-319 = 17×320 = 5440 cells.

Real text rendering is SPARSE (most pixels untouched between glyphs) — we saw this in Phase 65B where 0x013d11 wrote only 16,320 px inside a 288×196 bbox (28.9% fill ratio). Solid multiples of 320 mean **every single cell in the bbox was written** — i.e. a rectangle fill, not text.

### Neither 0x046878 nor 0x03dc1b is a function entry

- 0x046878 is inside block 0x04685c (which contains `ld hl, 0x0004e0 ; call 0x0a1cac`).
- 0x03dc1b is inside block 0x03dc11 (which contains `ld a, 0x01 ; call 0x0a1cac`).
- Phase 69's `findFunctionEntry` fallback to `heuristic='caller'` meant the backward RET scan found nothing, so the caller PC itself was used as the entry.

### Block 0x03dc11 is reached only via `0x03dc0d: call 0x0a2032 (call-return)`

- 0x03dbf8 (function entry containing 0x03dc11) has **zero** incoming references in the lifted call graph
- Neither instruction targets nor block exits point to 0x03dbf8
- Unreachable by static analysis — only reachable via the Phase 69 probe's direct jump to 0x03dc1b
- The 5440 px render is what happens when you inject execution mid-function with an uninitialized stack

### Block 0x04685c has a 10-hop backward chain to function entry 0x045c07

- Path: `0x045c07 → 0x045c0b → 0x045c0f → 0x045c15 → 0x045c1b → 0x045c21 → 0x045c27 → 0x045c2d → 0x04684c → 0x046850 → 0x04685c`
- 0x045c07 has 1 direct caller: `0x045bff: call 0x045c07`
- 0x045bff is in function 0x045b79, which has 3 callers (all internal jumps): 0x045b68, 0x045c03, 0x046943 — an internal state-machine loop
- 0x045b79's callers are all inside 0x045bxx-0x046xxx region → internal dispatch

## Intersection Result

**No common parent exists** in the lifted call graph between:
- Functions calling 0x045c07 (bottom-bar fill area)
- Functions containing 0x03dbf8 (top-bar fill area)

This means the top and bottom bars are NOT rendered by a single home-screen parent. They're filled by separate helpers.

## What Phase 69 Actually Found

The 12,800 and 5,440 render sizes are the **background-fill steps** for parts of a larger UI. The actual text ("NORMAL FLOAT AUTO REAL RADIAN MP" on the bottom, battery/time on top) comes from separate rendering passes AFTER the rectangle fill. We never saw those passes because the probes hit max_steps or missing_block before reaching them.

## Recommended Pivots

### Pivot 1: Find the rectangle-fill primitive

- 0x04685c calls `0x046aff` (block 0x046850 exits via `call 0x046aff`)
- The rectangle fill likely lives in a simple helper like 0x046aff — find it and understand its calling convention
- Once understood, the rectangle fill is cheap; the interesting code is the text layer that runs AFTER the fill

### Pivot 2: Look for real top/bottom text renderers

- TI-OS top status bar contains: "NORMAL FLOAT AUTO REAL RADIAN MP" + battery indicator
- TI-OS bottom status bar on home screen: `$` (cursor prompt) or similar
- Scan ROM for string literals matching these patterns ("NORMAL", "FLOAT", "AUTO", "REAL", "RADIAN", "MP", "DEGREE") near `call 0x0a1cac` or `call 0x0059c6` sites

### Pivot 3: Probe the Phase 71 OS-init state-resume entries

- 0x08c366 (JT slot 21 target) — the state-resume entry for OS init
- 0x08c33d — the "post-stage-1 init" entry

These are the real dispatch entries for OS init. If invoked correctly, they might cascade into the home-screen render path.

## Conclusion

The Phase 69 finding was valuable but misinterpreted. 0x046878 + 0x03dc1b are rectangle-fill helpers, not home-screen renderers. The home screen hunt continues via Phase 72-73: find the real text renderers for the top/bottom bars OR probe the Phase 71 state-resume entries.
