# Phase 25AC - Recall Offset Investigation: Which 42.0 Copies Survive ParseInp

## Date

2026-04-22

## Objective

Investigate whether ParseInp's variable recall returns 0.0 because:
- (a) Allocator activity during ParseInp overwrites the 9 bytes at DE, or
- (b) The variable data is at a different offset from DE (e.g., DE+2 past a VAT header).

We write 42.0 BCD to DE, DE-9, DE+9, and DE+2, then run ParseInp and check which copies survived.

## Setup

- Cold boot -> `MEM_INIT` -> `CreateReal("A")` -> write `42.0` BCD to DE, DE-9, DE+9, DE+2 -> re-seed OP1 with `A` -> `ParseInp("2+3")`.
- Timer IRQ disabled with `createPeripheralBus({ timerInterrupt: false })`.
- MEM_INIT entry: `0x09dee0`
- CreateReal entry: `0x08238a`
- ParseInp entry: `0x099914`
- Variable seed in OP1: `00 41 00 00 00 00 00 00 00`
- Stored 42.0 bytes: `00 81 42 00 00 00 00 00 00`
- Token buffer bytes: `32 70 33 3f`
- Token pointers seeded to begPC=curPC=`0xd00800`, endPC=`0xd00804`.

## Verdict

- OP1 outcome: unchanged_variable_name
- Summary: ParseInp termination=missing_block finalPc=0xffffff; in 273 steps; with errNo=0x88; and OP1 stayed as the variable name A..
- Found-path-like result (<=300 steps and errNo=0x00): false
- errNo after ParseInp: `0x88`
- ParseInp step count: 273
- OP1 post-call bytes: `00 41 00 00 00 00 00 00 00`
- OP1 decoded after ParseInp: 0

## Memory Dump Analysis

### Before ParseInp

```text
BEFORE ParseInp: memory region [0xd1a86f..0xd1a89b] (DE=0xd1a881)
  0xd1a86f ( DE-18): f2 ff 7f ff ff ff ff ff ff
  0xd1a878 (  DE-9): 00 81 42 00 00 00 00 00 00
  0xd1a881 (  DE+0): 00 81 00 81 42 00 00 00 00
  0xd1a88a (  DE+9): 00 00 42 00 00 00 00 00 00
  0xd1a893 ( DE+18): 00 00 00 00 00 00 00 00 00
  42.0 pattern checks:
    DE-9   @ 0xd1a878: [00 81 42 00 00 00 00 00 00] match=true decoded=42
    DE     @ 0xd1a881: [00 81 00 81 42 00 00 00 00] match=false decoded=0.8142
    DE+2   @ 0xd1a883: [00 81 42 00 00 00 00 00 00] match=true decoded=42
    DE+9   @ 0xd1a88a: [00 00 42 00 00 00 00 00 00] match=false decoded=4.2e-128
```

### After ParseInp

```text
AFTER ParseInp: memory region [0xd1a86f..0xd1a89b] (DE=0xd1a881)
  0xd1a86f ( DE-18): ba 1d 06 ff ff ff ff ff ff
  0xd1a878 (  DE-9): ff ff ff ff ff ff 00 00 00
  0xd1a881 (  DE+0): 00 81 00 81 42 00 00 00 00
  0xd1a88a (  DE+9): 00 00 00 00 00 00 00 00 00
  0xd1a893 ( DE+18): 00 00 00 00 00 00 00 00 00
  42.0 pattern checks:
    DE-9   @ 0xd1a878: [ff ff ff ff ff ff 00 00 00] match=false decoded=-1.66666665e+128
    DE     @ 0xd1a881: [00 81 00 81 42 00 00 00 00] match=false decoded=0.8142
    DE+2   @ 0xd1a883: [00 81 42 00 00 00 00 00 00] match=true decoded=42
    DE+9   @ 0xd1a88a: [00 00 00 00 00 00 00 00 00] match=false decoded=0
```

### 42.0 Copy Survival Analysis

- DE-9 @ 0xd1a878: OVERWRITTEN — bytes=[ff ff ff ff ff ff 00 00 00] decoded=-1.66666665e+128
- DE @ 0xd1a881: OVERWRITTEN — bytes=[00 81 00 81 42 00 00 00 00] decoded=0.8142
- DE+2 @ 0xd1a883: SURVIVED — bytes=[00 81 42 00 00 00 00 00 00] decoded=42
- DE+9 @ 0xd1a88a: OVERWRITTEN — bytes=[00 00 00 00 00 00 00 00 00] decoded=0

## Pointer Transitions (CreateReal -> pre-ParseInp -> post-ParseInp)

- newDataPtr: afterCreate=0xd1a88a -> beforeParse=0xd1a88a -> afterParse=0xd1a88a (total delta 0)
- OPBase: afterCreate=0xd3fff6 -> beforeParse=0xd3fff6 -> afterParse=0xd3fff6 (total delta 0)
- OPS: afterCreate=0xd3fff6 -> beforeParse=0xd3fff6 -> afterParse=0xd3ffec (total delta -10)
- FPSbase: afterCreate=0xd1a88a -> beforeParse=0xd1a88a -> afterParse=0xd1a88a (total delta 0)
- FPS: afterCreate=0xd1a88a -> beforeParse=0xd1a88a -> afterParse=0xd1a893 (total delta 9)
- pTemp: afterCreate=0xd3fff6 -> beforeParse=0xd3fff6 -> afterParse=0xd3fff6 (total delta 0)
- progPtr: afterCreate=0xd3fff6 -> beforeParse=0xd3fff6 -> afterParse=0xd3fff6 (total delta 0)

## Stage 0: Boot

- Boot result: steps=3025 term=halt lastPc=0x0019b5
- Post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000

## Stage 1: MEM_INIT

- Call frame @ `0xd1a86f`: `f6 ff 7f`
- Outcome: returned to 0x7ffff6
- Steps: 18
- errNo after MEM_INIT: `0x00`
- Post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000

## Stage 2: CreateReal("A") + Write 42.0 to Multiple Offsets

- OP1 pre-call @ `0xd005f8`: `00 41 00 00 00 00 00 00 00`
- Pre-call pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
- Main return frame @ `0xd1a86f`: `f2 ff 7f`
- Error frame @ `0xd1a869`: `00 00 00 fa ff 7f`
- Outcome: returned to 0x7ffff2
- Steps: 231
- errNo after CreateReal: `0x00`
- Registers after CreateReal: A/F=`0x41 / 0x40` HL/DE=`0xd3ffff / 0xd1a881` SP=`0xd1a872`
- OP1 post-call @ `0xd005f8`: `00 00 00 81 a8 d1 41 00 00`
- OP1 decoded after CreateReal: 8.2093141e-130
- Post-CreateReal pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
- OPBase movement: 0xd3ffff -> 0xd3fff6 (delta -9)
- newDataPtr movement: 0xd1a881 -> 0xd1a88a (delta +9)
- DE data pointer: `0xd1a881`
- Write locations: DE=0xd1a881, DE-9=0xd1a878, DE+9=0xd1a88a, DE+2=0xd1a883

## Stage 3: ParseInp("2+3")

- Tokens @ `0xd00800`: `32 70 33 3f`
- OP1 pre-call @ `0xd005f8`: `00 41 00 00 00 00 00 00 00`
- Pre-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
- Main return frame @ `0xd1a86f`: `fe ff 7f`
- Error frame @ `0xd1a869`: `00 00 00 fa ff 7f`
- Outcome: termination=missing_block finalPc=0xffffff
- Steps: 273
- errNo after ParseInp: `0x88`
- Registers after ParseInp: A/F=`0x00 / 0x42` HL/DE=`0x000000 / 0x000001` SP=`0xd1a875`
- OP1 post-call @ `0xd005f8`: `00 41 00 00 00 00 00 00 00`
- OP1 decoded after ParseInp: 0
- OP1 classification: OP1 stayed as the variable name A.
- Post-ParseInp pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a893 OPBase=0xd3fff6 OPS=0xd3ffec pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x88 begPC=0xd1a883 curPC=0xd1a884 endPC=0xd22982
- ParseInp milestones: none

## Recent PCs

- MEM_INIT: `0x09dee0 0x08a98f 0x08a999 0x07f976 0x09df0c 0x09df12 0x000600 0x0138ec 0x09df18 0x09df29 0x04c9ea 0x04c8b4 0x04c9ee 0x04c9f4 0x04c896 0x04c9f8 0x09df2e 0x7ffff6`
- CreateReal: `0x082120 0x082122 0x080080 0x07f7bd 0x080084 0x080087 0x08008a 0x080090 0x080093 0x080096 0x082126 0x082128 0x08214f 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x082159 0x08215f 0x07f7bd 0x082163 0x08012d 0x080130 0x082167 0x082173 0x08217e 0x082182 0x082186 0x082198 0x04c990 0x08219c 0x0827c3 0x0827df 0x082823 0x08282d 0x0827e7 0x082823 0x08282d 0x0827ef 0x082823 0x08282d 0x0827f7 0x082823 0x08282d 0x0827ff 0x082823 0x08282d 0x082807 0x082823 0x08282d 0x08280f 0x082823 0x08282d 0x082817 0x082823 0x08282d 0x08281f 0x08282d 0x0821a3 0x08237e 0x082344 0x7ffff2`
- ParseInp: `0x080051 0x03d1be 0x080055 0x080059 0x099962 0x09bbad 0x09bbaf 0x099966 0x09996a 0x099970 0x099974 0x09997c 0x099986 0x09998a 0x099990 0x099994 0x09999a 0x09999e 0x0999a4 0x0999aa 0x0999ae 0x0999b4 0x0999b8 0x0999be 0x0999c4 0x0999c8 0x0999ce 0x0999d4 0x0999da 0x0999e0 0x0999e4 0x0999ea 0x0999f0 0x0999f6 0x0999fc 0x099a00 0x099a06 0x099a08 0x099a0e 0x099a12 0x099a7a 0x061d1a 0x061d24 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba 0x0000bb 0x0000bc 0x002920 0x002bed 0x002cf7 0x002d00 0x0021c2 0x002d08 0x002d0a 0x002943 0xffffff`

## Console Output

```text
=== Phase 25AC: Recall offset investigation — which 42.0 copies survive ParseInp ===
boot: steps=3025 term=halt lastPc=0x0019b5
post-boot pointers: tempMem=0x000000 FPSbase=0x000000 FPS=0x000000 OPBase=0x000000 OPS=0x000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000

=== STAGE 1: MEM_INIT ===
MEM_INIT outcome: returned to 0x7ffff6
MEM_INIT steps=18 errNo=0x00
post-MEM_INIT pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000

=== STAGE 2: CreateReal("A") + write 42.0 to multiple offsets ===
CreateReal OP1 pre-call @ 0xd005f8: [00 41 00 00 00 00 00 00 00]
CreateReal pre-call pointers: tempMem=0xd1a881 FPSbase=0xd1a881 FPS=0xd1a881 OPBase=0xd3ffff OPS=0xd3ffff pTemp=0xd3ffff progPtr=0xd3ffff newDataPtr=0xd1a881 errSP=0x000000 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
CreateReal main return @ 0xd1a86f: [f2 ff 7f]
CreateReal err frame @ 0xd1a869: [00 00 00 fa ff 7f]
CreateReal outcome: returned to 0x7ffff2
CreateReal errNo=0x00 DE=0xd1a881
CreateReal post-call OP1 @ 0xd005f8: [00 00 00 81 a8 d1 41 00 00] decoded=8.2093141e-130
CreateReal post-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0x000000 curPC=0x000000 endPC=0x000000
newDataPtr movement: 0xd1a881 -> 0xd1a88a (delta +9)

Writing 42.0 BCD [00 81 42 00 00 00 00 00 00] to multiple offsets:
  DE @ 0xd1a881: written
  DE-9 @ 0xd1a878: written
  DE+9 @ 0xd1a88a: written
  DE+2 @ 0xd1a883: written

=== MEMORY DUMP: BEFORE ParseInp ===
BEFORE ParseInp: memory region [0xd1a86f..0xd1a89b] (DE=0xd1a881)
  0xd1a86f ( DE-18): f2 ff 7f ff ff ff ff ff ff
  0xd1a878 (  DE-9): 00 81 42 00 00 00 00 00 00
  0xd1a881 (  DE+0): 00 81 00 81 42 00 00 00 00
  0xd1a88a (  DE+9): 00 00 42 00 00 00 00 00 00
  0xd1a893 ( DE+18): 00 00 00 00 00 00 00 00 00
  42.0 pattern checks:
    DE-9   @ 0xd1a878: [00 81 42 00 00 00 00 00 00] match=true decoded=42
    DE     @ 0xd1a881: [00 81 00 81 42 00 00 00 00] match=false decoded=0.8142
    DE+2   @ 0xd1a883: [00 81 42 00 00 00 00 00 00] match=true decoded=42
    DE+9   @ 0xd1a88a: [00 00 42 00 00 00 00 00 00] match=false decoded=4.2e-128

=== STAGE 3: ParseInp("2+3") ===
ParseInp tokens @ 0xd00800: [32 70 33 3f]
ParseInp OP1 pre-call @ 0xd005f8: [00 41 00 00 00 00 00 00 00]
ParseInp pre-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a88a OPBase=0xd3fff6 OPS=0xd3fff6 pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x00 begPC=0xd00800 curPC=0xd00800 endPC=0xd00804
ParseInp main return @ 0xd1a86f: [fe ff 7f]
ParseInp err frame @ 0xd1a869: [00 00 00 fa ff 7f]
ParseInp outcome: termination=missing_block finalPc=0xffffff
ParseInp errNo=0x88 steps=273
ParseInp OP1 post-call @ 0xd005f8: [00 41 00 00 00 00 00 00 00] decoded=0
ParseInp OP1 classification: OP1 stayed as the variable name A.
ParseInp post-call pointers: tempMem=0xd1a88a FPSbase=0xd1a88a FPS=0xd1a893 OPBase=0xd3fff6 OPS=0xd3ffec pTemp=0xd3fff6 progPtr=0xd3fff6 newDataPtr=0xd1a88a errSP=0xd1a869 errNo=0x88 begPC=0xd1a883 curPC=0xd1a884 endPC=0xd22982

=== MEMORY DUMP: AFTER ParseInp ===
AFTER ParseInp: memory region [0xd1a86f..0xd1a89b] (DE=0xd1a881)
  0xd1a86f ( DE-18): ba 1d 06 ff ff ff ff ff ff
  0xd1a878 (  DE-9): ff ff ff ff ff ff 00 00 00
  0xd1a881 (  DE+0): 00 81 00 81 42 00 00 00 00
  0xd1a88a (  DE+9): 00 00 00 00 00 00 00 00 00
  0xd1a893 ( DE+18): 00 00 00 00 00 00 00 00 00
  42.0 pattern checks:
    DE-9   @ 0xd1a878: [ff ff ff ff ff ff 00 00 00] match=false decoded=-1.66666665e+128
    DE     @ 0xd1a881: [00 81 00 81 42 00 00 00 00] match=false decoded=0.8142
    DE+2   @ 0xd1a883: [00 81 42 00 00 00 00 00 00] match=true decoded=42
    DE+9   @ 0xd1a88a: [00 00 00 00 00 00 00 00 00] match=false decoded=0

=== 42.0 COPY SURVIVAL ANALYSIS ===
- DE-9 @ 0xd1a878: OVERWRITTEN — bytes=[ff ff ff ff ff ff 00 00 00] decoded=-1.66666665e+128
- DE @ 0xd1a881: OVERWRITTEN — bytes=[00 81 00 81 42 00 00 00 00] decoded=0.8142
- DE+2 @ 0xd1a883: SURVIVED — bytes=[00 81 42 00 00 00 00 00 00] decoded=42
- DE+9 @ 0xd1a88a: OVERWRITTEN — bytes=[00 00 00 00 00 00 00 00 00] decoded=0

=== POINTER TRANSITIONS ===
- newDataPtr: afterCreate=0xd1a88a -> beforeParse=0xd1a88a -> afterParse=0xd1a88a (total delta 0)
- OPBase: afterCreate=0xd3fff6 -> beforeParse=0xd3fff6 -> afterParse=0xd3fff6 (total delta 0)
- OPS: afterCreate=0xd3fff6 -> beforeParse=0xd3fff6 -> afterParse=0xd3ffec (total delta -10)
- FPSbase: afterCreate=0xd1a88a -> beforeParse=0xd1a88a -> afterParse=0xd1a88a (total delta 0)
- FPS: afterCreate=0xd1a88a -> beforeParse=0xd1a88a -> afterParse=0xd1a893 (total delta 9)
- pTemp: afterCreate=0xd3fff6 -> beforeParse=0xd3fff6 -> afterParse=0xd3fff6 (total delta 0)
- progPtr: afterCreate=0xd3fff6 -> beforeParse=0xd3fff6 -> afterParse=0xd3fff6 (total delta 0)
```
