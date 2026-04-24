# Phase 25AQ - History Buffer Seed + Recall Path to ParseInp

## Date

2026-04-24T08:10:29.316Z

## Setup

- Entry: `0x0585E9` with `A=0x05`, `B=0x05`
- MEM_INIT: `return_hit`, steps=`18`
- cxMain: `0x058241`, cxCurApp: `0x40`
- userMem tokens @ `0xD1A881`: `72 70 73 3F`
- Error frame @ `0xD1A86C`: [FE FF FF D1 1D 06]
- History entry @ `0xD0150B`: [04 00 72 70 73 3F]
- History end ptr @ `0xD01508`: 0xD01511
- numLastEntries: 1

## Part A: Disassembly

### History entry read path (0x092294-0x0922C0)

```text
0x092294  20 0c              jr nz, 0x0922A2
0x092296  d1                 pop de
0x092297  ed 53 08 15 d0     ld (0xD01508), de
0x09229C  21 0b 1d d0        ld hl, 0xD01D0B
0x0922A0  35                 dec (hl)
0x0922A1  c9                 ret
0x0922A2  eb                 ex de, hl
0x0922A3  2a 08 15 d0        ld hl, (0xD01508)
0x0922A7  b7                 or a
0x0922A8  ed 52              sbc hl, de
0x0922AA  e5                 push hl
0x0922AB  c1                 pop bc
0x0922AC  e1                 pop hl
0x0922AD  eb                 ex de, hl
0x0922AE  ed b0              ldir
0x0922B0  18 e5              jr 0x092297
0x0922B2  3a 81 00 d0        ld a, (0xD00081)
0x0922B6  f5                 push af
0x0922B7  cd 54 8d 05        call 0x058D54
0x0922BB  cd f9 fb 03        call 0x03FBF9
0x0922BF  3a 95 05 d0        ld a, (0xD00595)
```

### Sub-function 0x092FDD (0x092FDD-0x092FFD)

```text
0x092FDD  21 0b 15 d0        ld hl, 0xD0150B
0x092FE1  3d                 dec a
0x092FE2  c8                 ret z
0x092FE3  cd 0d c9 04        call 0x04C90D
0x092FE7  19                 add hl, de
0x092FE8  18 f7              jr 0x092FE1
0x092FEA  cd f3 2f 09        call 0x092FF3
0x092FEE  cd 59 ce 09        call 0x09CE59
0x092FF2  c9                 ret
0x092FF3  fd cb 49 9e        indexed-cb-res
0x092FF7  ed 4b 0b 1d d0     ld bc, (0xD01D0B)
0x092FFC  06 00              ld b, 0x00
```

### Sub-function 0x092FCB (0x092FCB-0x092FDD)

```text
0x092FCB  11 e6 08 d0        ld de, 0xD008E6
0x092FCF  01 02 00 00        ld bc, 0x000002
0x092FD3  ed b0              ldir
0x092FD5  40 ed 4b e6 08     sis ld bc, (0x0008E6)
0x092FDA  ed b0              ldir
0x092FDC  c9                 ret
```

### Sub-function 0x092FB6 (0x092FB6-0x092FCB)

```text
0x092FB6  21 f0 08 d0        ld hl, 0xD008F0
0x092FBA  40 ed 5b e8 08     sis ld de, (0x0008E8)
0x092FBF  19                 add hl, de
0x092FC0  c9                 ret
0x092FC1  cd 4b 38 08        call 0x08384B
0x092FC5  eb                 ex de, hl
0x092FC6  c9                 ret
0x092FC7  cd dd 2f 09        call 0x092FDD
```

## Part B: ENTER Handler with Seeded History

- Termination: `max_steps`
- Steps: `100000`
- Final PC: `0x082754`
- Loops forced: `0`
- Missing blocks: `false`

### Key PC Hits

| PC | Label | Hit? | Step |
|----|-------|------|------|
| `0x058693` | common_tail_0x058693 | NO | - |
| `0x0586E3` | ParseInp_call_0x0586E3 | NO | - |
| `0x099910` | trampoline_0x099910 | NO | - |
| `0x099914` | ParseInp_0x099914 | NO | - |
| `0x0921CB` | history_mgr_0x0921CB | YES | 58 |

### Post-Run State

- OP1: `[00 00 00 00 00 00 00 00 00]`
- errNo: `0x00`
- ParseInp reached: `false`
- SP: `0xD1A85A`

## Console Output

```text
=== Phase 25AQ: History Buffer Seed + Recall Path to ParseInp ===

=== Part A: Disassembly ===

--- History entry read path (0x092294-0x0922C0) ---
0x092294  20 0c              jr nz, 0x0922A2
0x092296  d1                 pop de
0x092297  ed 53 08 15 d0     ld (0xD01508), de
0x09229C  21 0b 1d d0        ld hl, 0xD01D0B
0x0922A0  35                 dec (hl)
0x0922A1  c9                 ret
0x0922A2  eb                 ex de, hl
0x0922A3  2a 08 15 d0        ld hl, (0xD01508)
0x0922A7  b7                 or a
0x0922A8  ed 52              sbc hl, de
0x0922AA  e5                 push hl
0x0922AB  c1                 pop bc
0x0922AC  e1                 pop hl
0x0922AD  eb                 ex de, hl
0x0922AE  ed b0              ldir
0x0922B0  18 e5              jr 0x092297
0x0922B2  3a 81 00 d0        ld a, (0xD00081)
0x0922B6  f5                 push af
0x0922B7  cd 54 8d 05        call 0x058D54
0x0922BB  cd f9 fb 03        call 0x03FBF9
0x0922BF  3a 95 05 d0        ld a, (0xD00595)

--- Sub-function 0x092FDD (0x092FDD-0x092FFD) ---
0x092FDD  21 0b 15 d0        ld hl, 0xD0150B
0x092FE1  3d                 dec a
0x092FE2  c8                 ret z
0x092FE3  cd 0d c9 04        call 0x04C90D
0x092FE7  19                 add hl, de
0x092FE8  18 f7              jr 0x092FE1
0x092FEA  cd f3 2f 09        call 0x092FF3
0x092FEE  cd 59 ce 09        call 0x09CE59
0x092FF2  c9                 ret
0x092FF3  fd cb 49 9e        indexed-cb-res
0x092FF7  ed 4b 0b 1d d0     ld bc, (0xD01D0B)
0x092FFC  06 00              ld b, 0x00

--- Sub-function 0x092FCB (0x092FCB-0x092FDD) ---
0x092FCB  11 e6 08 d0        ld de, 0xD008E6
0x092FCF  01 02 00 00        ld bc, 0x000002
0x092FD3  ed b0              ldir
0x092FD5  40 ed 4b e6 08     sis ld bc, (0x0008E6)
0x092FDA  ed b0              ldir
0x092FDC  c9                 ret

--- Sub-function 0x092FB6 (0x092FB6-0x092FCB) ---
0x092FB6  21 f0 08 d0        ld hl, 0xD008F0
0x092FBA  40 ed 5b e8 08     sis ld de, (0x0008E8)
0x092FBF  19                 add hl, de
0x092FC0  c9                 ret
0x092FC1  cd 4b 38 08        call 0x08384B
0x092FC5  eb                 ex de, hl
0x092FC6  c9                 ret
0x092FC7  cd dd 2f 09        call 0x092FDD

=== Part B: Seeded History Run ===

Cold boot complete.
MEM_INIT: term=return_hit steps=18 finalPc=0xFFFFF6
Error frame @ 0xD1A86C: [FE FF FF D1 1D 06]
History entry @ 0xD0150B: [04 00 72 70 73 3F]
History end ptr @ 0xD01508: [11 15 D0] = 0xD01511
numLastEntries = 1

Running ENTER handler @ 0x0585E9 with A=0x05, B=0x05, budget=100000

Run result: term=max_steps steps=100000 finalPc=0x082754 loopsForced=0
Missing blocks: false

=== Key PC Hits ===
  [MISS] 0x058693 common_tail_0x058693
  [MISS] 0x0586E3 ParseInp_call_0x0586E3
  [MISS] 0x099910 trampoline_0x099910
  [MISS] 0x099914 ParseInp_0x099914
  [HIT]  0x0921CB history_mgr_0x0921CB @ step 58

OP1 @ 0xD005F8: [00 00 00 00 00 00 00 00 00]
errNo @ 0xD008DF: 0x00
ParseInp reached: false

=== First 50 Block PCs ===
     0: 0x0585E9
     1: 0x0585F8
     2: 0x0585F9
     3: 0x058602
     4: 0x058608
     5: 0x058D54
     6: 0x058EC6
     7: 0x058D58
     8: 0x0800A8
     9: 0x0800AE
    10: 0x080259
    11: 0x0800B2
    12: 0x058D60
    13: 0x058D89
    14: 0x05860C
    15: 0x058BA3
    16: 0x058610
    17: 0x058B5C
    18: 0x058B6E
    19: 0x058614
    20: 0x03FBF9
    21: 0x03FC06
    22: 0x058618
    23: 0x05840B
    24: 0x0800B8
    25: 0x05840F
    26: 0x058410
    27: 0x05E7D8
    28: 0x05E27E
    29: 0x05E35A
    30: 0x04C973
    31: 0x05E282
    32: 0x05E7DC
    33: 0x058414
    34: 0x05861C
    35: 0x058212
    36: 0x0800B8
    37: 0x058216
    38: 0x05821D
    39: 0x05E3E3
    40: 0x05E3F5
    41: 0x04C973
    42: 0x05E3E7
    43: 0x05E3E8
    44: 0x04C973
    45: 0x058221
    46: 0x058621
    47: 0x0581AE
    48: 0x0800B8
    49: 0x0581B2

=== Last 30 Block PCs ===
   470: 0x0825DB
   471: 0x0825C5
   472: 0x0825D1
   473: 0x0825D9
   474: 0x0825DB
   475: 0x0825CD
   476: 0x0825D9
   477: 0x0825DB
   478: 0x083237
   479: 0x0826FD
   480: 0x0824D6
   481: 0x082717
   482: 0x082732
   483: 0x08273D
   484: 0x04C876
   485: 0x082750
   486: 0x0821B2
   487: 0x0821B4
   488: 0x0821B7
   489: 0x082754
   490: 0x082756
   491: 0x08275C
   492: 0x082C0B
   493: 0x04C8A3
   494: 0x082C10
   495: 0x08276E
   496: 0x082774
   497: 0x08279E
   498: 0x080084
   499: 0x080087

=== Post-Run Memory State ===
numLastEntries: 0
History end ptr: 0x000000
History buf first 10 bytes: [00 00 00 00 00 00 00 00 00 00]
SP: 0xD1A85A
Stack top 12 bytes: [00 00 00 00 00 00 00 00 00 00 00 00]

```
