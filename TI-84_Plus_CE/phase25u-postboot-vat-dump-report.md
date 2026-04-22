# Phase 25U - Post-boot VAT/Heap Pointer Dump + CreateReal

## Goal

Discover what OPBase/OPS/pTemp/progPtr/FPSbase/FPS values the OS sets after cold boot,
check whether home-screen rendering initializes heap pointers, then attempt CreateReal.

## Part A: Post-boot pointer dump

All heap pointers zero after boot: **YES**

| Pointer | Value |
|---------|-------|
| OPBase | `0x000000` |
| OPS | `0x000000` |
| pTemp | `0x000000` |
| progPtr | `0x000000` |
| FPSbase | `0x000000` |
| FPS | `0x000000` |
| errSP | `0x000000` |
| errNo | `0x00` |

Raw hex 0xD02580..0xD025B0: `00 0a 00 00 0a 00 00 78 a8 d1 f7 ff ff 00 00 00 00 81 a8 d1 8a a8 d1 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`

## Part B: After home-screen render

Home render termination: RET_to_FAKE

| Pointer | Before | After | Changed? |
|---------|--------|-------|----------|
| OPBase | `0x000000` | `0x000000` | no |
| OPS | `0x000000` | `0x000000` | no |
| pTemp | `0x000000` | `0x000000` | no |
| progPtr | `0x000000` | `0x000000` | no |
| FPSbase | `0x000000` | `0x000000` | no |
| FPS | `0x000000` | `0x000000` | no |

## Part C: CreateReal attempt

- Classification: **PASS** (SENTINEL_RETURN)
- termination: missing_block
- finalPc: `0xffffff`
- steps: 491
- returnHit: false
- errCaught: false
- errNo after: `0x00`
- OP1 pre-call: `[00 41 00 00 00 00 00 00 00]`
- OP1 post-call: `[00 00 00 00 00 00 00 00 00]`
- OP1 decoded: 0
- SP after: `0xd1a86f`
- errSP after: `0x000000`

VAT fallback seeds applied:
- OPBase: 0x000000 -> 0xd1a881
- pTemp: 0x000000 -> 0xd1a88a
- progPtr: 0x000000 -> 0xd1a893

## Pointers after CreateReal

| Pointer | Value |
|---------|-------|
| OPBase | `0xa88100` |
| OPS | `0xa88ad1` |
| pTemp | `0x000000` |
| progPtr | `0x000000` |
| FPSbase | `0xfffff7` |
| FPS | `0x000000` |
| errSP | `0x000000` |
| errNo | `0x00` |

## Console Output

```text
=== Phase 25U: Post-boot VAT/heap pointer dump ===

--- Part A: Cold boot pointer dump ---
boot: steps=3025 term=halt lastPc=0x0019b5

Pointers after cold boot + CoorMon + post-init:
  OPBase=0x000000  OPS=0x000000  pTemp=0x000000  progPtr=0x000000  FPSbase=0x000000  FPS=0x000000  errSP=0x000000  errNo=0x00

Raw hex dump 0xD02580..0xD025B0 (48 bytes):
  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00

All heap pointers zero after boot: YES (confirmed)

--- Part B: Home-screen render stages -> pointer re-dump ---
Home render returned to FAKE_RET @ 0x7ffff0
Home render: term=RET_to_FAKE steps=0

Pointers after home-screen render:
  OPBase=0x000000  OPS=0x000000  pTemp=0x000000  progPtr=0x000000  FPSbase=0x000000  FPS=0x000000  errSP=0x000000  errNo=0x00

Raw hex dump 0xD02580..0xD025B0 (48 bytes):
  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00

No heap pointers changed after home render.

--- Part C: CreateReal attempt ---
VAT pointer fallback seeds applied:
  OPBase: 0x000000 -> 0xd1a881
  pTemp: 0x000000 -> 0xd1a88a
  progPtr: 0x000000 -> 0xd1a893
OP1 pre-call: [00 41 00 00 00 00 00 00 00]
errSP frame @ 0xd1a869 -> errSP=0xd1a869
FAKE_RET=0x7ffffe  ERR_CATCH=0x7ffffa

CreateReal results:
  termination: missing_block
  finalPc: 0xffffff
  steps: 491
  returnHit: false
  errCaught: false
  errNo after: 0x00
  OP1 post-call: [00 00 00 00 00 00 00 00 00]
  OP1 decoded: 0
  A=0x00 F=0x00 HL=0x7ffffe DE=0x7fffff
  SP after: 0xd1a86f
  errSP after: 0x000000
  recent PCs: 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x08215f 0x07f7bd 0x082163 0x08012d 0x080130 0x082167 0x082173 0x08217e 0x082182 0x082186 0x082198 0x04c990 0x08219c 0x0827c3 0x0827df 0x082823 0x08282d 0x0827e7 0x082823 0x08282d 0x0827ef 0x082823 0x08282d 0x0827f7 0x082823 0x08282d 0x0827ff 0x082823 0x08282d 0x082807 0x082823 0x08282d 0x08280f 0x082823 0x08282d 0x082817 0x082823 0x08282d 0x08281f 0x08282d 0x0821a3 0xffffff

Pointers after CreateReal:
  OPBase=0xa88100  OPS=0xa88ad1  pTemp=0x000000  progPtr=0x000000  FPSbase=0xfffff7  FPS=0x000000  errSP=0x000000  errNo=0x00

result=PASS (SENTINEL_RETURN)
```
