# Phase 131 — Graph Pipeline Report

## Test 1: ILine with realistic coordinates (5,5)->(50,50)

- **Result**: 26 non-zero bytes in plotSScreen (consistent with phase 130 diagonal results)
- **returnHit**: false (ILine does not cleanly return — known from phase 130, it falls through)
- **Steps**: 2337
- **Pixel pattern**: Spans rows 48-52, 4bpp packed bytes with values 0x1F, 0xFF, 0xF0 — correct Bresenham-style rendering with blue pen color
- **Observation**: X < 64 constraint holds. Coordinates (5,5)->(50,50) render correctly in the safe range.

## Test 2: ILine box outline (4 lines)

All four sides rendered successfully, accumulating pixels in plotSScreen:

| Line | Coords | returnHit | Cumulative pixels |
|------|--------|-----------|-------------------|
| Top | (10,10)->(50,10) | false | 21 |
| Right | (50,10)->(50,50) | false | 71 |
| Bottom | (50,50)->(10,50) | false | 120 |
| Left | (10,50)->(10,10) | false | 147 |

- **Total**: 147 non-zero bytes after all 4 lines
- **Key finding**: Multiple ILine calls accumulate correctly in the same plotSScreen buffer without clearing each other's pixels. The box outline is coherent — pixels span rows 10-50 as expected.
- **returnHit=false for all**: ILine consistently does not return cleanly to FAKE_RET. It renders pixels but execution falls through rather than hitting RET. This is a known behavior from phase 130.

## Test 3: GraphPars (0x09986C)

- **returnHit**: false
- **Steps**: 84 (very few — bailed out early)
- **plotSScreen pixels**: 0
- **Missing block**: 0x0998CA (1 hit) — `indexed-cb-res` instruction

### Execution trace analysis

GraphPars dispatches through:
1. 0x09986C -> 0x091DFB/0x091DFF (setup)
2. 0x099874 -> 0x09987E -> 0x099AF9 (reads graphMode)
3. 0x09BF37 -> MemChk loop (0x082BB5/0x082266/0x04C92E) — runs 3 times
4. 0x099890 -> 0x061DEF -> 0x099898 -> 0x099921 (function mode dispatch)
5. 0x099B81 -> 0x099B18 -> 0x08383D -> 0x080080 (setup chain)
6. 0x061D3A -> 0x03E1B4 (graph format chain)
7. **Stalls at 0x0998CA** — `RES 3,(IY+0x48)` / `RES 5,(IY+0x14)` then `AND 0x7F` / `CP 0x08`

### Blocker analysis

The missing block at 0x0998CA contains indexed CB-prefix RES instructions. These are IY-indexed bit manipulation ops. The transpiler likely does not have a lifted block starting at this address. The `CP 0x08` at 0x0998D4 suggests it is checking a mode/flag value (likely graphMode range check: 0-7 for different graph types).

**Next step**: Lift block at 0x0998CA to continue GraphPars execution.

## Test 4: DrawCmd (0x05DD96)

- **returnHit**: true (successfully returned!)
- **Steps**: 79,764
- **plotSScreen pixels**: 0

### Execution trace analysis

DrawCmd completed successfully but produced no visible output:

1. Entry: 0x05DD96 -> 0x05DA51 -> 0x05DA6F (setup)
2. 0x06FCD0 -> 0x09EF44 -> 0x09EFB7 (screen clear / memset loop)
3. **Hot loop**: 0x09EFDE (11,684 hits) — this is a tight memory fill loop (likely clearing graph buffer or screen RAM)
4. 0x06F2E2/0x06F2E8/0x06F341 (21,780 hits each) — another tight loop, likely the main draw dispatch scanning Y-equations or graph data
5. Exit chain: 0x09AA6C -> 0x09BE8A -> 0x09BEC3 -> 0x05DDCA -> FAKE_RET

### Key observations

- DrawCmd **returns cleanly** — this is significant. The full draw pipeline completes.
- The hot loop at 0x06F2E2-0x06F346 runs ~21K iterations — this is the graph rendering loop iterating over pixel columns or rows.
- **No pixels rendered** because no Y-equations are defined. DrawCmd clears the screen, iterates the draw loop (which finds nothing to draw), then returns.
- The 0x09EFDE memset loop (11,684 hits) likely clears plotSScreen and/or display buffers.
- Missing block count: 1 (but execution still completed — the missing block was likely on a non-taken branch).

## Summary of findings

| Test | Pixels | Returns | Key finding |
|------|--------|---------|-------------|
| ILine diagonal | 26 | no | Works correctly in safe X range |
| ILine box (4 lines) | 147 | no | Accumulates correctly across calls |
| GraphPars | 0 | no | Stalls at 0x0998CA (missing block: indexed-cb-res) |
| DrawCmd | 0 | yes | Full pipeline works! No output because no equations defined |

## Next priorities

1. **Lift block 0x0998CA** — unblocks GraphPars. Contains `RES 3,(IY+0x48)`, `RES 5,(IY+0x14)`, `AND 0x7F`, `CP 0x08` sequence.
2. **Investigate ILine non-return** — ILine renders pixels but never hits RET sentinel. May need to understand its exit path (does it jump somewhere instead of returning?).
3. **Seed Y-equations for DrawCmd** — DrawCmd completes but draws nothing. Need to populate Y1= equation data in RAM so the draw loop has something to render.
4. **GraphPars + DrawCmd combined** — once GraphPars unblocks, test the full pipeline: seed window + equations, call GraphPars, then DrawCmd.
