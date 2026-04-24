# Phase 25AZ - Fix RclVarSym-after-ParseInp via OPS Reset

## Date

2026-04-24T22:10:44.928Z

## Objective

Fix RclVarSym returning garbage after ParseInp by addressing the OPS-overwrites-VAT root cause.
Two approaches tested:
- **Approach A**: Post-ParseInp cleanup — reset OPS/FPS, re-create Ans, write saved result.
- **Approach B**: Higher progPtr — move OPBase/OPS higher to give OPS headroom.

## Results

| Approach | Result | OP1 bytes | OP1 decoded | Notes |
|:---------|:-------|:----------|:------------|:------|
| A: Post-ParseInp cleanup | PASS | `00 80 50 00 00 00 00 00 00` | 5 | OP1=5.0 after OPS reset + re-create |
| B: Higher progPtr | FAIL | `00 00 72 d1 a8 81 00 00 00` | 7.3320881e-128 | OP1=7.3320881e-128 != 5.0 |

## Console Output

```text
=== Phase 25AZ: Fix RclVarSym-after-ParseInp via OPS Reset ===

========================================
=== APPROACH A: Post-ParseInp cleanup + re-create Ans ===
========================================

--- Boot ---
boot: steps=3025 term=halt

--- MEM_INIT ---
MEM_INIT outcome: returned to 0x7ffff6 steps=18 errNo=0x00
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
saved MEM_INIT baseline: OPBase=0xd3ffff FPSbase=0xd1a881

--- CreateReal(Ans) ---
CreateReal(Ans) OP1=[00 72 00 00 00 00 00 00 00]
CreateReal(Ans) outcome: returned to 0x7ffff2 DE=0xd1a881 errNo=0x00
post-CreateReal pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
Ans data slot @ 0xd1a881
post-CreateReal FPS=0xd1a88a FPSbase=0xd1a88a

--- ParseInp("2+3") ---
ParseInp tokens @ 0xd00800: [32 70 33 3f]
ParseInp begPC=0xd00800 endPC=0xd00804
ParseInp outcome: returned to 0x7ffffe steps=903 errNo=0x8d
ParseInp OP1=[00 80 50 00 00 00 00 00 00] decoded=5
post-ParseInp pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a881 OPBase=0xd3fff6 OPS=0xd3fff9 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
saved OP1 result: [00 80 50 00 00 00 00 00 00] decoded=5
VAT @ 0xD3FFF0 BEFORE fix: [00 8a 9a 09 fe ff 7f 00 00 72 d1 a8 81 00 00 00]
reset OPS to post-CreateReal OPBase=0xd3fff6
reset FPS=0xd1a88a FPSbase=0xd1a88a

--- Re-CreateReal(Ans) to rebuild VAT ---
CreateReal(Ans) OP1=[00 72 00 00 00 00 00 00 00]
CreateReal(Ans) outcome: returned to 0x7ffff2 DE=0xd1a88a errNo=0x00
post-CreateReal pointers: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a893 OPBase=0xd3ffed OPS=0xd3ffed pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x00 begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
new Ans data slot @ 0xd1a88a
wrote saved OP1 [00 80 50 00 00 00 00 00 00] into Ans data @ 0xd1a88a
VAT @ 0xD3FFF0 AFTER fix: [72 d1 a8 8a 00 00 00 00 00 72 d1 a8 81 00 00 00]

--- RclVarSym(Ans) after fix ---
RclVarSym(Ans) OP1 pre-call=[00 72 00 00 00 00 00 00 00]
RclVarSym(Ans) outcome: returned to 0x7fffea steps=43 errNo=0x00
RclVarSym(Ans) OP1=[00 80 50 00 00 00 00 00 00] decoded=5
post-RclVarSym pointers: tempMem=0xd1a893 FPSbase=0xd1a893 FPS=0xd1a893 OPBase=0xd3ffed OPS=0xd3ffed pTemp=0xd3ffed progPtr=0xd3ffed newDataPtr=0xd1a893 errSP=0xd1a869 errNo=0x00 begPC=0xd00800 curPC=0xd00804 endPC=0xd00804

Approach A: RclVarSym OP1=[00 80 50 00 00 00 00 00 00] decoded=5 expected=5.0
Approach A: PASS

========================================
=== APPROACH B: Higher progPtr for OPS headroom ===
========================================

--- Boot ---
boot: steps=3025 term=halt

--- MEM_INIT ---
MEM_INIT outcome: returned to 0x7ffff6 steps=18 errNo=0x00
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
override OPBase=0xd40040 OPS=0xd40040 pTemp=0xd40060 progPtr=0xd40060
post-override pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd40040 OPS=0xd40040 pTemp=0xd40060 progPtr=0xd40060 newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000

--- CreateReal(Ans) ---
CreateReal(Ans) OP1=[00 72 00 00 00 00 00 00 00]
CreateReal(Ans) outcome: returned to 0x7ffff2 DE=0xd1a881 errNo=0x00
post-CreateReal pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd40037 OPS=0xd40037 pTemp=0xd40057 progPtr=0xd40057 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
Ans data slot @ 0xd1a881
VAT @ 0xD3FFF0 BEFORE ParseInp: [00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]

--- ParseInp("2+3") ---
ParseInp tokens @ 0xd00800: [32 70 33 3f]
ParseInp begPC=0xd00800 endPC=0xd00804
ParseInp outcome: returned to 0x7ffffe steps=898 errNo=0x8d
ParseInp OP1=[00 80 50 00 00 00 00 00 00] decoded=5
post-ParseInp pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a881 OPBase=0xd40037 OPS=0xd4003a pTemp=0xd40057 progPtr=0xd40057 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804
VAT @ 0xD3FFF0 AFTER ParseInp: [00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]
VAT survived ParseInp: true

--- RclVarSym(Ans) ---
RclVarSym(Ans) OP1 pre-call=[00 72 00 00 00 00 00 00 00]
RclVarSym(Ans) outcome: returned to 0x7fffea steps=39 errNo=0x8d
RclVarSym(Ans) OP1=[00 00 72 d1 a8 81 00 00 00] decoded=7.3320881e-128
post-RclVarSym pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a881 OPBase=0xd40037 OPS=0xd4003a pTemp=0xd40057 progPtr=0xd40057 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d begPC=0xd00800 curPC=0xd00804 endPC=0xd00804

Approach B: VAT survived=true OP1=[00 00 72 d1 a8 81 00 00 00] decoded=7.3320881e-128 expected=5.0
Approach B: FAIL

========================================
=== FINAL SUMMARY ===
========================================
Approach A (post-ParseInp cleanup + re-create): PASS — OP1=5.0 after OPS reset + re-create
  OP1=[00 80 50 00 00 00 00 00 00] decoded=5
Approach B (higher progPtr for OPS headroom):   FAIL — OP1=7.3320881e-128 != 5.0
  OP1=[00 00 72 d1 a8 81 00 00 00] decoded=7.3320881e-128 vatSurvived=true
```
