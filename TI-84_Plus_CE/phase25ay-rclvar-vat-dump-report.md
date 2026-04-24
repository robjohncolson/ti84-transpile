# Phase 25AY — RclVarSym-after-ParseInp VAT/DE Investigation

## Date

2026-04-24

## Objective

Investigate why RclVarSym fails after ParseInp in the StoAns pipeline.
Hypothesis: ParseInp FP stack overlaps/clobbers the Ans data area.

## Scenario A: Control — CreateReal("A")+42.0 → RclVarSym("A")

**Result: PASS** — recalled 42.0

```text
--- Scenario A: Control CreateReal("A")+42.0 → RclVarSym("A") ---
MEM_INIT: returned to 0x7ffff6 steps=18 errNo=0x00
post-MEM_INIT: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
CreateReal("A"): returned to 0x7ffff2 errNo=0x00 DE=0xd1a881
Wrote 42.0 BCD at DE=0xd1a881: [00 81 42 00 00 00 00 00 00]
post-CreateReal: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
RclVarSym("A"): returned to 0x7ffffe errNo=0x00 steps=43 DE=0xd00601
RclVarSym("A") OP1 post: [00 81 42 00 00 00 00 00 00] decoded=42
Scenario A verdict: PASS — recalled 42.0
```

## Scenario B: Full pipeline + VAT/Ans dump before/after ParseInp

**Result: FAIL** — OP1=9.100106565850001e-18

- Ans data changed by ParseInp: true
- VAT region changed by ParseInp: true
- progPtr region changed by ParseInp: true
- FPS changed by ParseInp: true
- Ans data BEFORE: [00 00 00 00 00 00 00 00 00]
- Ans data AFTER:  [00 80 50 00 00 00 00 00 00]
- VAT BEFORE: [00 00 00 00 00 00 00 00 00 72 d1 a8 81 00 00 00]
- VAT AFTER:  [00 00 00 00 00 00 00 00 70 00 8a 9a 09 fe ff 7f]
- FPS BEFORE: 0xd1a88a
- FPS AFTER:  0xd1a881

```text
--- Scenario B: Full pipeline + VAT/Ans dump before/after ParseInp ---
MEM_INIT: returned to 0x7ffff6 steps=18 errNo=0x00
post-MEM_INIT: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
CreateReal("Ans"): returned to 0x7ffff2 errNo=0x00 DE=0xd1a881
Ans data slot at DE=0xd1a881
post-CreateReal: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
BEFORE ParseInp:
  Ans data [0xd1a881..+9]: [00 00 00 00 00 00 00 00 00]
  VAT region [0xd3fff0..+16]: [00 00 00 00 00 00 00 00 00 72 d1 a8 81 00 00 00]
  progPtr=0xd3fff6 region [0xd3ffee..+24]: [00 00 00 00 00 00 00 00 00 00 00 72 d1 a8 81 00 00 00 ff ff ff ff ff ff]
  FPS=0xd1a88a FPSbase=0xd1a88a
ParseInp: returned to 0x7ffffe steps=903 errNo=0x8d
ParseInp OP1 post: [00 80 50 00 00 00 00 00 00] decoded=5
AFTER ParseInp:
  Ans data [0xd1a881..+9]: [00 80 50 00 00 00 00 00 00]
  VAT region [0xd3fff0..+16]: [00 00 00 00 00 00 00 00 70 00 8a 9a 09 fe ff 7f]
  progPtr=0xd3fff6 region [0xd3ffee..+24]: [00 00 00 00 00 00 00 00 00 00 70 00 8a 9a 09 fe ff 7f ff ff ff ff ff ff]
  FPS=0xd1a881 FPSbase=0xd1a88a
  post-ParseInp: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a881 OPBase=0xd3fff6 OPS=0xd40002 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d
DIFF: ansDataChanged=true vatChanged=true progPtrRegionChanged=true fpsChanged=true
WARNING: FPS=0xd1a881 overlaps/adjacent to Ans data at 0xd1a881..0xd1a889
  FPS/Ans overlap region [0xd1a881..+18]: [00 80 50 00 00 00 00 00 00 00 80 20 00 00 00 00 00 00]
Reset allocator to post-CreateReal: FPS=0xd1a88a FPSbase=0xd1a88a OPS=0xd3fff6
RclVarSym("Ans"): returned to 0x7ffffe errNo=0x8d steps=44 DE=0xd00601
RclVarSym("Ans") OP1 post: [00 70 00 8a 9a 09 fe ff 7f] decoded=9.100106565850001e-18
Scenario B verdict: FAIL — OP1=9.100106565850001e-18 DE=0xd00601
```

## Scenario C: Higher userMem base (0xD1A8C0)

**Result: FAIL** — OP1=9.100106565850001e-18
- Ans data addr: 0xd1a881

```text
--- Scenario C: Higher userMem base (0xD1A8C0) ---
MEM_INIT: returned to 0x7ffff6 steps=18 errNo=0x00
post-MEM_INIT (default): tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00
Overrode tempMem/FPSbase/FPS to 0xd1a8c0
CreateReal("Ans"): returned to 0x7ffff2 errNo=0x00 DE=0xd1a881
Ans data slot at DE=0xd1a881 (expected near 0xd1a8c0)
post-CreateReal: tempMem=0xd1a8c9 FPSbase=0xd1a8c9 FPS=0xd1a8c9 OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00
ParseInp: returned to 0x7ffffe steps=903 errNo=0x8d
ParseInp OP1 post: [00 80 50 00 00 00 00 00 00] decoded=5
post-ParseInp: tempMem=0xd1a8c9 FPSbase=0xd1a8c9 FPS=0xd1a8c0 OPBase=0xd3fff6 OPS=0xd40002 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x8d
Ans data after ParseInp [0xd1a881..+9]: [00 00 00 00 00 00 00 00 00] decoded=0
FPS after ParseInp: 0xd1a8c0 — overlap with Ans at 0xd1a881? NO
RclVarSym("Ans"): returned to 0x7ffffe errNo=0x8d steps=44 DE=0xd00601
RclVarSym("Ans") OP1 post: [00 70 00 8a 9a 09 fe ff 7f] decoded=9.100106565850001e-18
Scenario C verdict: FAIL — OP1=9.100106565850001e-18 DE=0xd00601
```

## Scenario D: FPS preservation after ParseInp

**Result: FAIL** — still fails: OP1=9.100106565850001e-18
- Ans data clobbered by ParseInp: false
- FPS restore alone fixes recall: false
- FPS+data restore fixes recall: null

```text
--- Scenario D: FPS preservation after ParseInp ---
MEM_INIT: returned to 0x7ffff6 steps=18 errNo=0x00
CreateReal("Ans"): returned to 0x7ffff2 errNo=0x00 DE=0xd1a881
post-CreateReal FPS=0xd1a88a FPSbase=0xd1a88a ansDataAddr=0xd1a881
ParseInp: returned to 0x7ffffe steps=903 errNo=0x8d
ParseInp OP1 post: [00 80 50 00 00 00 00 00 00] decoded=5
FPS before ParseInp: 0xd1a88a → after: 0xd1a881 (delta=-9)
FPSbase before ParseInp: 0xd1a88a → after: 0xd1a88a (delta=0)
Ans data before FPS restore [0xd1a881]: [00 80 50 00 00 00 00 00 00] decoded=5
Restored FPS=0xd1a88a FPSbase=0xd1a88a OPS=0xd3fff6
Ans data after FPS restore [0xd1a881]: [00 80 50 00 00 00 00 00 00]
Ans data was clobbered by ParseInp: false
RclVarSym("Ans") [FPS restored only]: returned to 0x7ffffe errNo=0x8d steps=44 DE=0xd00601
RclVarSym("Ans") [FPS restored only] OP1 post: [00 70 00 8a 9a 09 fe ff 7f] decoded=9.100106565850001e-18
Scenario D verdict (FPS only): FAIL — OP1=9.100106565850001e-18
```

## Summary

| Scenario | Result | Notes |
|----------|--------|-------|
| A: Control (var A=42.0) | PASS | recalled 42.0 |
| B: Full pipeline + dumps | FAIL | OP1=9.100106565850001e-18 |
| C: Higher userMem base | FAIL | OP1=9.100106565850001e-18 |
| D: FPS preservation | FAIL | still fails: OP1=9.100106565850001e-18 |

## Conclusion

The control path works but the full pipeline fails, confirming ParseInp interference.
ParseInp clobbers the Ans data area — the FP stack overlaps the Ans data slot.



Neither FPS nor data restoration fixes the issue — the problem may be in the VAT entry itself.
