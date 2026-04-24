# Phase 25AN - Workspace Pointer Overlap Investigation

## Date

2026-04-24

## Objective

1. Dump workspace pointers (iMathPtr1-5, asm_data_ptr1-2, editSym, begPC, curPC, endPC, OPBase, pTemp, progPtr) at the moment compaction fires, to determine whether the LDDR block move region overlaps the cx block (0xD007CA-0xD007E1).
2. Statically disassemble 0x05840B and 0x058423 to determine if compaction is called from the ENTER path and whether it fires before or after ParseInp.

## Setup

- Cold boot -> kernel init -> post-init -> MEM_INIT
- Timer IRQs disabled
- cx seed: cxMain=0x058241, cxCurApp=0x40
- Keyboard: ENTER via key matrix + kbdKey + kbdGetKy + kbdScanCode + 0xD0146D
- Parser: tokenized "2+3" at userMem
- CoorMon budget: 25000 steps

## Part A: Workspace Pointer Dump

### Pre-CoorMon State

Workspace pointers: iMathPtr1=0x000000 iMathPtr2=0x000000 iMathPtr3=0x000000 iMathPtr4=0x000000 iMathPtr5=0x000000 asm_data_ptr1=0x000000 asm_data_ptr2=0x000000 editSym=0x000000 begPC=0xD1A881 curPC=0xD1A881 endPC=0xD1A885 OPBase=0xD3FFFF pTemp=0xD3FFFF progPtr=0xD3FFFF
cx block: [41 82 05 19 8B 05 7E 8B 05 BC 82 05 A9 8B 05 01 8C 05 00 00 00 00 40 00]

### CoorMon Result

- Termination: `max_steps`
- Steps: `25000`
- Final PC: `0x080130`
- Loops forced: `1`
- Missing block: `false`

### Compaction Detection

**Compaction detected** at step 605, PC=0x05E3D6

Workspace pointers at compaction entry:

| Pointer | Address | Value |
|---------|---------|-------|
| iMathPtr1 | 0xD0066F | 0x000000 |
| iMathPtr2 | 0xD00672 | 0x000000 |
| iMathPtr3 | 0xD00675 | 0x000000 |
| iMathPtr4 | 0xD00678 | 0x000000 |
| iMathPtr5 | 0xD0067B | 0x000000 |
| asm_data_ptr1 | 0xD0067E | 0x000000 |
| asm_data_ptr2 | 0xD00681 | 0x000000 |
| editSym | 0xD0244E | 0x000000 |
| begPC | 0xD02317 | 0xD1A881 |
| curPC | 0xD0231A | 0xD1A881 |
| endPC | 0xD0231D | 0xD1A885 |
| OPBase | 0xD02590 | 0xD3FFFF |
| pTemp | 0xD0259A | 0xD3FFFF |
| progPtr | 0xD0259D | 0xD3FFFF |

cx block at compaction entry: `[41 82 05 19 8B 05 7E 8B 05 BC 82 05 A9 8B 05 01 8C 05 00 00 00 00 40 00]`

No workspace pointers overlap the cx block at compaction entry.

### Post-CoorMon State

Workspace pointers: iMathPtr1=0x000000 iMathPtr2=0x000000 iMathPtr3=0x01049E iMathPtr4=0x000000 iMathPtr5=0x000000 asm_data_ptr1=0x000000 asm_data_ptr2=0x000000 editSym=0x000000 begPC=0x000000 curPC=0x000000 endPC=0x000000 OPBase=0x000000 pTemp=0x000000 progPtr=0x000000
cx block: [00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]

### Address Hit Summary

| Address | Label | Hit Count | Steps |
|---------|-------|-----------|-------|
| 0x058241 | HomeHandler | 1 | 3019 |
| 0x0585E9 | second-pass ENTER handler | 0 | - |
| 0x05840B | step 23 setup helper | 0 | - |
| 0x058423 | compaction chain start | 1 | 18723 |
| 0x05E3A2 | compaction entry | 1 | 18740 |
| 0x05E7F7 | compaction mid | 1 | 18724 |
| 0x07FF7B | compaction mid | 1 | 18725 |
| 0x08384F | compaction mid | 1 | 18731 |
| 0x05E836 | compaction mid | 1 | 18741 |
| 0x0831A4 | LDDR cx-zeroing | 1 | 18742 |
| 0x099211 | expression evaluation | 0 | - |
| 0x099914 | ParseInp | 0 | - |
| 0x0973C8 | ENTER key path | 0 | - |

## Part B: Static Disassembly

### 0x05840B (step 23 setup helper)

| Address | Bytes | Instruction |
|---------|-------|-------------|
| 0x05840B | cd b8 00 08 | call 0x0800B8 |
| 0x05840F | c0 | ret nz |
| 0x058410 | cd d8 e7 05 | call 0x05E7D8 |
| 0x058414 | c9 | ret |
| 0x058415 | fd cb 49 5e | [indexed-cb-bit] |
| 0x058419 | 28 08 | jr z, 0x058423 |
| 0x05841B | 3e 40 | ld a, 0x40 |
| 0x05841D | cd 9c 2d 09 | call 0x092D9C |
| 0x058421 | 18 04 | jr 0x058427 |
| 0x058423 | cd f7 e7 05 | call 0x05E7F7 |
| 0x058427 | fd cb 15 56 | [indexed-cb-bit] |
| 0x05842B | fd cb 15 96 | [indexed-cb-res] |
| 0x05842F | c4 0e e6 05 | call nz, 0x05E60E |
| 0x058433 | c9 | ret |
| 0x058434 | 21 00 00 00 | ld hl, 0x000000 |
| 0x058438 | 40 22 5a 11 | sis ld hl, (0x00115A) |
| 0x05843C | 3a 85 26 d0 | ld a, (0xD02685) |
| 0x058440 | 32 50 11 d0 | ld (0xD01150), a |
| 0x058444 | 21 02 00 00 | ld hl, 0x000002 |
| 0x058448 | 40 22 4e 11 | sis ld hl, (0x00114E) |
| 0x05844C | 67 | ld h, a |
| 0x05844D | 3e e8 | ld a, 0xe8 |
| 0x05844F | 94 | sub h |
| 0x058450 | 32 53 11 d0 | ld (0xD01153), a |
| 0x058454 | 21 37 01 00 | ld hl, 0x000137 |
| 0x058458 | 40 22 51 11 | sis ld hl, (0x001151) |

**Result: 0x05840B does NOT directly call/jump to 0x058423 in the disassembled range.**

### 0x058423 (compaction chain start)

| Address | Bytes | Instruction |
|---------|-------|-------------|
| 0x058423 | cd f7 e7 05 | call 0x05E7F7 |
| 0x058427 | fd cb 15 56 | [indexed-cb-bit] |
| 0x05842B | fd cb 15 96 | [indexed-cb-res] |
| 0x05842F | c4 0e e6 05 | call nz, 0x05E60E |
| 0x058433 | c9 | ret |
| 0x058434 | 21 00 00 00 | ld hl, 0x000000 |
| 0x058438 | 40 22 5a 11 | sis ld hl, (0x00115A) |
| 0x05843C | 3a 85 26 d0 | ld a, (0xD02685) |
| 0x058440 | 32 50 11 d0 | ld (0xD01150), a |
| 0x058444 | 21 02 00 00 | ld hl, 0x000002 |
| 0x058448 | 40 22 4e 11 | sis ld hl, (0x00114E) |
| 0x05844C | 67 | ld h, a |
| 0x05844D | 3e e8 | ld a, 0xe8 |
| 0x05844F | 94 | sub h |
| 0x058450 | 32 53 11 d0 | ld (0xD01153), a |
| 0x058454 | 21 37 01 00 | ld hl, 0x000137 |
| 0x058458 | 40 22 51 11 | sis ld hl, (0x001151) |
| 0x05845C | c9 | ret |
| 0x05845D | 21 92 2a d0 | ld hl, 0xD02A92 |
| 0x058461 | cb 46 | bit 0, (hl) |
| 0x058463 | ca b6 1d 06 | jp z, 0x061DB6 |
| 0x058467 | 21 a9 8b 05 | ld hl, 0x058BA9 |
| 0x05846B | 22 d6 07 d0 | ld hl, (0xD007D6) |
| 0x05846F | cd fe ed 06 | call 0x06EDFE |

### 0x058618 (ENTER handler context)

| Address | Bytes | Instruction |
|---------|-------|-------------|
| 0x058618 | cd 0b 84 05 | call 0x05840B |
| 0x05861C | fb | ei |
| 0x05861D | cd 12 82 05 | call 0x058212 |
| 0x058621 | f5 | push af |
| 0x058622 | cd ae 81 05 | call 0x0581AE |
| 0x058626 | cd 11 92 09 | call 0x099211 |
| 0x05862A | fb | ei |
| 0x05862B | cd cb 21 09 | call 0x0921CB |
| 0x05862F | f1 | pop af |
| 0x058630 | 20 38 | jr nz, 0x05866A |
| 0x058632 | 3a 0b 1d d0 | ld a, (0xD01D0B) |
| 0x058636 | b7 | or a |
| 0x058637 | ca 65 8c 05 | jp z, 0x058C65 |
| 0x05863B | cd b8 00 08 | call 0x0800B8 |
| 0x05863F | 28 0a | jr z, 0x05864B |
| 0x058641 | cd 81 ff 07 | call 0x07FF81 |
| 0x058645 | cd c6 81 05 | call 0x0581C6 |
| 0x058649 | 18 14 | jr 0x05865F |
| 0x05864B | cd 4b 38 08 | call 0x08384B |
| 0x05864F | cd 6a e8 05 | call 0x05E86A |
| 0x058653 | cd ae e3 05 | call 0x05E3AE |

**Result: 0x058618 does NOT reference 0x058423 in the disassembled range.**

## Timing Analysis

Compaction (0x058423) fires at step 18723 but ParseInp was not reached within the budget.

## Console Output

```text
=== Phase 25AN: Workspace Pointer Overlap Investigation ===

boot: steps=3025 term=halt
MEM_INIT: term=return_hit steps=18 finalPc=0x7FFFF6

=== Seeding State ===
pre-CoorMon workspace: iMathPtr1=0x000000 iMathPtr2=0x000000 iMathPtr3=0x000000 iMathPtr4=0x000000 iMathPtr5=0x000000 asm_data_ptr1=0x000000 asm_data_ptr2=0x000000 editSym=0x000000 begPC=0xD1A881 curPC=0xD1A881 endPC=0xD1A885 OPBase=0xD3FFFF pTemp=0xD3FFFF progPtr=0xD3FFFF
pre-CoorMon cx block: [41 82 05 19 8B 05 7E 8B 05 BC 82 05 A9 8B 05 01 8C 05 00 00 00 00 40 00]

=== Part A: CoorMon Trace (budget=25000) ===
COMPACTION DETECTED at step 605, PC=0x05E3D6
  workspace: iMathPtr1=0x000000 iMathPtr2=0x000000 iMathPtr3=0x000000 iMathPtr4=0x000000 iMathPtr5=0x000000 asm_data_ptr1=0x000000 asm_data_ptr2=0x000000 editSym=0x000000 begPC=0xD1A881 curPC=0xD1A881 endPC=0xD1A885 OPBase=0xD3FFFF pTemp=0xD3FFFF progPtr=0xD3FFFF
  cx block: [41 82 05 19 8B 05 7E 8B 05 BC 82 05 A9 8B 05 01 8C 05 00 00 00 00 40 00]

CoorMon: term=max_steps steps=25000 finalPc=0x080130 loopsForced=1
compaction detected: true
compaction step: 605
compaction PC: 0x05E3D6
workspace at compaction: iMathPtr1=0x000000 iMathPtr2=0x000000 iMathPtr3=0x000000 iMathPtr4=0x000000 iMathPtr5=0x000000 asm_data_ptr1=0x000000 asm_data_ptr2=0x000000 editSym=0x000000 begPC=0xD1A881 curPC=0xD1A881 endPC=0xD1A885 OPBase=0xD3FFFF pTemp=0xD3FFFF progPtr=0xD3FFFF
cx block at compaction: [41 82 05 19 8B 05 7E 8B 05 BC 82 05 A9 8B 05 01 8C 05 00 00 00 00 40 00]
No workspace pointer overlaps the cx block.
post-CoorMon workspace: iMathPtr1=0x000000 iMathPtr2=0x000000 iMathPtr3=0x01049E iMathPtr4=0x000000 iMathPtr5=0x000000 asm_data_ptr1=0x000000 asm_data_ptr2=0x000000 editSym=0x000000 begPC=0x000000 curPC=0x000000 endPC=0x000000 OPBase=0x000000 pTemp=0x000000 progPtr=0x000000
post-CoorMon cx block: [00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00]

Address hit summary:
  0x058241 HomeHandler: 3019
  0x0585E9 second-pass ENTER handler: not hit
  0x05840B step 23 setup helper: not hit
  0x058423 compaction chain start: 18723
  0x05E3A2 compaction entry: 18740
  0x05E7F7 compaction mid: 18724
  0x07FF7B compaction mid: 18725
  0x08384F compaction mid: 18731
  0x05E836 compaction mid: 18741
  0x0831A4 LDDR cx-zeroing: 18742
  0x099211 expression evaluation: not hit
  0x099914 ParseInp: not hit
  0x0973C8 ENTER key path: not hit

=== Part B: Static Disassembly ===

Disassembly of 0x05840B (step 23 setup helper):
  0x05840B: cd b8 00 08          call 0x0800B8
  0x05840F: c0                   ret nz
  0x058410: cd d8 e7 05          call 0x05E7D8
  0x058414: c9                   ret
  0x058415: fd cb 49 5e          [indexed-cb-bit]
  0x058419: 28 08                jr z, 0x058423
  0x05841B: 3e 40                ld a, 0x40
  0x05841D: cd 9c 2d 09          call 0x092D9C
  0x058421: 18 04                jr 0x058427
  0x058423: cd f7 e7 05          call 0x05E7F7
  0x058427: fd cb 15 56          [indexed-cb-bit]
  0x05842B: fd cb 15 96          [indexed-cb-res]
  0x05842F: c4 0e e6 05          call nz, 0x05E60E
  0x058433: c9                   ret
  0x058434: 21 00 00 00          ld hl, 0x000000
  0x058438: 40 22 5a 11          sis ld hl, (0x00115A)
  0x05843C: 3a 85 26 d0          ld a, (0xD02685)
  0x058440: 32 50 11 d0          ld (0xD01150), a
  0x058444: 21 02 00 00          ld hl, 0x000002
  0x058448: 40 22 4e 11          sis ld hl, (0x00114E)
  0x05844C: 67                   ld h, a
  0x05844D: 3e e8                ld a, 0xe8
  0x05844F: 94                   sub h
  0x058450: 32 53 11 d0          ld (0xD01153), a
  0x058454: 21 37 01 00          ld hl, 0x000137
  0x058458: 40 22 51 11          sis ld hl, (0x001151)

Disassembly of 0x058423 (compaction chain start):
  0x058423: cd f7 e7 05          call 0x05E7F7
  0x058427: fd cb 15 56          [indexed-cb-bit]
  0x05842B: fd cb 15 96          [indexed-cb-res]
  0x05842F: c4 0e e6 05          call nz, 0x05E60E
  0x058433: c9                   ret
  0x058434: 21 00 00 00          ld hl, 0x000000
  0x058438: 40 22 5a 11          sis ld hl, (0x00115A)
  0x05843C: 3a 85 26 d0          ld a, (0xD02685)
  0x058440: 32 50 11 d0          ld (0xD01150), a
  0x058444: 21 02 00 00          ld hl, 0x000002
  0x058448: 40 22 4e 11          sis ld hl, (0x00114E)
  0x05844C: 67                   ld h, a
  0x05844D: 3e e8                ld a, 0xe8
  0x05844F: 94                   sub h
  0x058450: 32 53 11 d0          ld (0xD01153), a
  0x058454: 21 37 01 00          ld hl, 0x000137
  0x058458: 40 22 51 11          sis ld hl, (0x001151)
  0x05845C: c9                   ret
  0x05845D: 21 92 2a d0          ld hl, 0xD02A92
  0x058461: cb 46                bit 0, (hl)
  0x058463: ca b6 1d 06          jp z, 0x061DB6
  0x058467: 21 a9 8b 05          ld hl, 0x058BA9
  0x05846B: 22 d6 07 d0          ld hl, (0xD007D6)
  0x05846F: cd fe ed 06          call 0x06EDFE

NOT FOUND: 0x05840B does NOT directly call/jump to 0x058423 in the disassembled range

Disassembly of 0x058618 (ENTER handler context):
  0x058618: cd 0b 84 05          call 0x05840B
  0x05861C: fb                   ei
  0x05861D: cd 12 82 05          call 0x058212
  0x058621: f5                   push af
  0x058622: cd ae 81 05          call 0x0581AE
  0x058626: cd 11 92 09          call 0x099211
  0x05862A: fb                   ei
  0x05862B: cd cb 21 09          call 0x0921CB
  0x05862F: f1                   pop af
  0x058630: 20 38                jr nz, 0x05866A
  0x058632: 3a 0b 1d d0          ld a, (0xD01D0B)
  0x058636: b7                   or a
  0x058637: ca 65 8c 05          jp z, 0x058C65
  0x05863B: cd b8 00 08          call 0x0800B8
  0x05863F: 28 0a                jr z, 0x05864B
  0x058641: cd 81 ff 07          call 0x07FF81
  0x058645: cd c6 81 05          call 0x0581C6
  0x058649: 18 14                jr 0x05865F
  0x05864B: cd 4b 38 08          call 0x08384B
  0x05864F: cd 6a e8 05          call 0x05E86A
  0x058653: cd ae e3 05          call 0x05E3AE
NOT FOUND: 0x058618 does NOT reference 0x058423 in the disassembled range

=== Timing Analysis ===
Compaction (0x058423) fires at step 18723 but ParseInp was not reached
```
