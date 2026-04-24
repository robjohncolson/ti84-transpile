# Phase 25AS - Pointer Watchpoint on ENTER Handler

## Date

2026-04-24T10:07:24.079Z

## Setup

- Entry: `0x0585E9` with `A=0x05`
- Budget: `50000` block steps
- MEM_INIT: `return_hit`, steps=`18`
- Allocator seed: `FPSbase=0xD1A881 FPS=0xD1A881 OPBase=0xD3FFFF OPS=0xD3FFFF pTempCnt=0x00000000 pTemp=0xD3FFFF progPtr=0xD3FFFF newDataPtr=0xD1A881`
- Watched pointers: OPBase @ `0xD02590`, OPS @ `0xD02593`, pTemp @ `0xD0259A`, progPtr @ `0xD0259D`
- Seeded value: `0xD3FFFF`

## Run Result

- Termination: `max_steps`
- Steps: `50000`
- Final PC: `0x08008A`
- Loops forced: `0`
- Missing block observed: `false`

## Post-Run Allocator State

`FPSbase=0x01049E FPS=0x01049E OPBase=0x000000 OPS=0x000000 pTempCnt=0x00000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000`

## Pointer Change Events

Total change events: **8**

| # | Step | PC | Pointer | Old Value | New Value | SP | Active Call | Recent PCs |
|---|------|----|---------|-----------|-----------|----|------------|------------|
| 1 | 294 | `0x082105` | OPBase | `0xD3FFFF` | `0xD3FFF6` | `0xD1A845` | unknown | 0x07F8C8, 0x07F974, 0x08235D, 0x0820ED, 0x082105 |
| 2 | 295 | `0x082114` | pTemp | `0xD3FFFF` | `0xD3FFF6` | `0xD1A845` | unknown | 0x07F974, 0x08235D, 0x0820ED, 0x082105, 0x082114 |
| 3 | 313 | `0x08214F` | OPS | `0xD3FFFF` | `0xD3FFF6` | `0xD1A842` | unknown | 0x080093, 0x080096, 0x082126, 0x082128, 0x08214F |
| 4 | 313 | `0x08214F` | progPtr | `0xD3FFFF` | `0xD3FFF6` | `0xD1A842` | unknown | 0x080093, 0x080096, 0x082126, 0x082128, 0x08214F |
| 5 | 390 | `0x04C990` | OPBase | `0xD3FFF6` | `0x000000` | `0xD1A857` | unknown | 0x05E836, 0x0831A4, 0x0831E5, 0x083214, 0x04C990 |
| 6 | 390 | `0x04C990` | OPS | `0xD3FFF6` | `0x000000` | `0xD1A857` | unknown | 0x05E836, 0x0831A4, 0x0831E5, 0x083214, 0x04C990 |
| 7 | 390 | `0x04C990` | pTemp | `0xD3FFF6` | `0x000000` | `0xD1A857` | unknown | 0x05E836, 0x0831A4, 0x0831E5, 0x083214, 0x04C990 |
| 8 | 390 | `0x04C990` | progPtr | `0xD3FFF6` | `0x000000` | `0xD1A857` | unknown | 0x05E836, 0x0831A4, 0x0831E5, 0x083214, 0x04C990 |

## Known Call Target Visit Order

| Step | PC | Label |
|------|----|-------|
| 6 | `0x058D54` | call_058D54 |
| 16 | `0x058BA3` | call_058BA3 |
| 18 | `0x058B5C` | call_058B5C |
| 21 | `0x03FBF9` | call_03FBF9 |
| 24 | `0x05840B` | call_05840B |
| 28 | `0x05E7D8` | call_05E7D8 |
| 36 | `0x058212` | call_058212 |
| 58 | `0x0921CB` | history_manager |
| 101 | `0x058C65` | empty_ENTER_path |
| 490 | `0x082754` | allocator_core |
| 513 | `0x082745` | VAT_walker_loop |

## Analysis

### Zeroing Events by Active Call

**unknown**: zeroed OPBase, OPS, pTemp, progPtr at step(s) 390, 390, 390, 390

### Non-Zero Changes

- step 294: OPBase changed to `0xD3FFF6` at PC `0x082105` (active: unknown)
- step 295: pTemp changed to `0xD3FFF6` at PC `0x082114` (active: unknown)
- step 313: OPS changed to `0xD3FFF6` at PC `0x08214F` (active: unknown)
- step 313: progPtr changed to `0xD3FFF6` at PC `0x08214F` (active: unknown)

## Conclusion

The primary zeroing culprit is **unknown** — first zeroing event at step 390 (PC `0x04C990`).
Pointer(s) zeroed: OPBase, OPS, pTemp, progPtr.

## Console Output

```text
=== Phase 25AS: Pointer Watchpoint on ENTER Handler ===

Cold boot complete.
MEM_INIT: term=return_hit steps=18 finalPc=0xFFFFF6
Allocator re-seed (CORRECTED): FPSbase=0xD1A881 FPS=0xD1A881 OPBase=0xD3FFFF OPS=0xD3FFFF pTempCnt=0x00000000 pTemp=0xD3FFFF progPtr=0xD3FFFF newDataPtr=0xD1A881
Error frame @ 0xD1A86C: [FE FF FF D1 1D 06]
History seed: entry @ 0xD0150B: [04 00 72 70 73 3F]

Running ENTER handler @ 0x0585E9 with pointer watchpoints
  Watching: OPBase @ 0xD02590, OPS @ 0xD02593, pTemp @ 0xD0259A, progPtr @ 0xD0259D
  Seeded value: 0xD3FFFF
  Budget: 50000 block steps

  [CHANGE] step=294 PC=0x082105 OPBase: 0xD3FFFF -> 0xD3FFF6 SP=0xD1A845 active=unknown
  [CHANGE] step=295 PC=0x082114 pTemp: 0xD3FFFF -> 0xD3FFF6 SP=0xD1A845 active=unknown
  [CHANGE] step=313 PC=0x08214F OPS: 0xD3FFFF -> 0xD3FFF6 SP=0xD1A842 active=unknown
  [CHANGE] step=313 PC=0x08214F progPtr: 0xD3FFFF -> 0xD3FFF6 SP=0xD1A842 active=unknown
  [CHANGE] step=390 PC=0x04C990 OPBase: 0xD3FFF6 -> 0x000000 SP=0xD1A857 active=unknown
  [CHANGE] step=390 PC=0x04C990 OPS: 0xD3FFF6 -> 0x000000 SP=0xD1A857 active=unknown
  [CHANGE] step=390 PC=0x04C990 pTemp: 0xD3FFF6 -> 0x000000 SP=0xD1A857 active=unknown
  [CHANGE] step=390 PC=0x04C990 progPtr: 0xD3FFF6 -> 0x000000 SP=0xD1A857 active=unknown

Run result: term=max_steps steps=50000 finalPc=0x08008A loopsForced=0
Missing blocks: false

Post-run allocator: FPSbase=0x01049E FPS=0x01049E OPBase=0x000000 OPS=0x000000 pTempCnt=0x00000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000

=== Pointer Change Events: 8 total ===
  step=294 PC=0x082105 OPBase: 0xD3FFFF -> 0xD3FFF6 SP=0xD1A845 call=unknown
  step=295 PC=0x082114 pTemp: 0xD3FFFF -> 0xD3FFF6 SP=0xD1A845 call=unknown
  step=313 PC=0x08214F OPS: 0xD3FFFF -> 0xD3FFF6 SP=0xD1A842 call=unknown
  step=313 PC=0x08214F progPtr: 0xD3FFFF -> 0xD3FFF6 SP=0xD1A842 call=unknown
  step=390 PC=0x04C990 OPBase: 0xD3FFF6 -> 0x000000 SP=0xD1A857 call=unknown
  step=390 PC=0x04C990 OPS: 0xD3FFF6 -> 0x000000 SP=0xD1A857 call=unknown
  step=390 PC=0x04C990 pTemp: 0xD3FFF6 -> 0x000000 SP=0xD1A857 call=unknown
  step=390 PC=0x04C990 progPtr: 0xD3FFF6 -> 0x000000 SP=0xD1A857 call=unknown

=== Known Call Target Visit Order ===
  step=6 0x058D54 call_058D54
  step=16 0x058BA3 call_058BA3
  step=18 0x058B5C call_058B5C
  step=21 0x03FBF9 call_03FBF9
  step=24 0x05840B call_05840B
  step=28 0x05E7D8 call_05E7D8
  step=36 0x058212 call_058212
  step=58 0x0921CB history_manager
  step=101 0x058C65 empty_ENTER_path
  step=490 0x082754 allocator_core
  step=513 0x082745 VAT_walker_loop

```
