# Phase 25AR - Corrected Allocator Pointers + History Recall

## Date

2026-04-24T09:19:04.616Z

## Setup

- Entry: `0x0585E9` with `A=0x05`, `B=0x05`
- Budget: `500000` block steps (no early stop after ParseInp)
- MEM_INIT: `return_hit`, steps=`18`, finalPc=`0xFFFFF6`
- Allocator seed (CORRECTED): `FPSbase=0xD1A881 FPS=0xD1A881 OPBase=0xD3FFFF OPS=0xD3FFFF pTempCnt=0x00000000 pTemp=0xD3FFFF progPtr=0xD3FFFF newDataPtr=0xD1A881 scratch=0xD1A881`
- History entry @ `0xD0150B`: [04 00 72 70 73 3F]
- History end ptr @ `0xD01508`: `0xD01511` [11 15 D0]
- numLastEntries before run: `0x01 (1)`
- Error frame @ `0xD1A86C`: [FE FF FF D1 1D 06]
- Tokenized input @ `0xD1A881`: `72 70 73 3F`

## Corrected Pointer Addresses

| Pointer | Address | Value |
|---------|---------|-------|
| FPSbase | `0xD0258A` | `0xD1A881` |
| FPS | `0xD0258D` | `0xD1A881` |
| OPBase | `0xD02590` | `0xD3FFFF` |
| OPS | `0xD02593` | `0xD3FFFF` |
| pTempCnt | `0xD02596` | `0x00000000` (4 bytes) |
| pTemp | `0xD0259A` | `0xD3FFFF` |
| progPtr | `0xD0259D` | `0xD3FFFF` |
| newDataPtr | `0xD025A0` | `0xD1A881` |

## Run Result

- Termination: `max_steps`
- Steps: `500000`
- Final PC: `0x082745`
- Final mode: `adl`
- Loops forced: `0`
- Missing block observed: `false`
- ParseInp reached: `false`
- ParseInp first step: `n/a`
- Unique PCs: `269`

## Key PC Hits

| PC | Label | Hit? | First Step | Hit Count |
|----|-------|------|------------|-----------|
| `0x0921CB` | history manager | YES | 58 | 1 |
| `0x058C65` | empty ENTER path | YES | 101 | 1 |
| `0x058693` | common tail | NO | - | 0 |
| `0x0586E3` | ParseInp call site | NO | - | 0 |
| `0x099910` | 0x099910 trampoline | NO | - | 0 |
| `0x099914` | ParseInp entry | NO | - | 0 |
| `0x082745` | VAT walker loop | YES | 513 | 22704 |
| `0x082754` | allocator core | YES | 490 | 22705 |
| `0x083865` | FindSym loop | NO | - | 0 |

## Output State

- OP1 bytes @ `0xD005F8`: [00 00 00 00 00 00 00 00 00]
- OP1 decoded: `0`
- errNo: `0x00`
- numLastEntries after run: `0x00 (0)`
- SP: `0xD1A85D`
- Post-run allocator pointers: `FPSbase=0x01049E FPS=0x01049E OPBase=0x000000 OPS=0x000000 pTempCnt=0x00000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 scratch=0xFEFB62`

## First 100 Block PCs

```text
     1: 0x0585E9
     2: 0x0585F8
     3: 0x0585F9
     4: 0x058602
     5: 0x058608
     6: 0x058D54
     7: 0x058EC6
     8: 0x058D58
     9: 0x0800A8
    10: 0x0800AE
    11: 0x080259
    12: 0x0800B2
    13: 0x058D60
    14: 0x058D89
    15: 0x05860C
    16: 0x058BA3
    17: 0x058610
    18: 0x058B5C
    19: 0x058B6E
    20: 0x058614
    21: 0x03FBF9
    22: 0x03FC06
    23: 0x058618
    24: 0x05840B
    25: 0x0800B8
    26: 0x05840F
    27: 0x058410
    28: 0x05E7D8
    29: 0x05E27E
    30: 0x05E35A
    31: 0x04C973
    32: 0x05E282
    33: 0x05E7DC
    34: 0x058414
    35: 0x05861C
    36: 0x058212
    37: 0x0800B8
    38: 0x058216
    39: 0x05821D
    40: 0x05E3E3
    41: 0x05E3F5
    42: 0x04C973
    43: 0x05E3E7
    44: 0x05E3E8
    45: 0x04C973
    46: 0x058221
    47: 0x058621
    48: 0x0581AE
    49: 0x0800B8
    50: 0x0581B2
    51: 0x0581B4
    52: 0x05E872
    53: 0x0581B8
    54: 0x058626
    55: 0x099211
    56: 0x099219
    57: 0x05862A
    58: 0x0921CB
    59: 0x08384B
    60: 0x07FF81
    61: 0x07FF99
    62: 0x04C940
    63: 0x07FF9D
    64: 0x08384F
    65: 0x0820CD
    66: 0x0820E1
    67: 0x0820E6
    68: 0x083856
    69: 0x082BE2
    70: 0x08386A
    71: 0x0838C8
    72: 0x0921CF
    73: 0x0921D5
    74: 0x080197
    75: 0x04C916
    76: 0x04C940
    77: 0x08019D
    78: 0x0921DB
    79: 0x092FDD
    80: 0x092FE3
    81: 0x04C90D
    82: 0x092FE7
    83: 0x092FE1
    84: 0x0921E2
    85: 0x0921F1
    86: 0x09227F
    87: 0x092FDD
    88: 0x092284
    89: 0x092FDD
    90: 0x092FE3
    91: 0x04C90D
    92: 0x092FE7
    93: 0x092FE1
    94: 0x09228B
    95: 0x04C973
    96: 0x092294
    97: 0x092296
    98: 0x0921F8
    99: 0x05862F
   100: 0x058632
```

## Last 50 Block PCs

```text
499951: 0x08012D
499952: 0x080130
499953: 0x0827AA
499954: 0x08277C
499955: 0x08278D
499956: 0x082799
499957: 0x082745
499958: 0x04C876
499959: 0x082750
499960: 0x0821B2
499961: 0x082754
499962: 0x082756
499963: 0x082772
499964: 0x08279E
499965: 0x080084
499966: 0x080087
499967: 0x08008A
499968: 0x080090
499969: 0x080093
499970: 0x080096
499971: 0x0827A5
499972: 0x0827A6
499973: 0x08012D
499974: 0x080130
499975: 0x0827AA
499976: 0x08277C
499977: 0x08278D
499978: 0x082799
499979: 0x082745
499980: 0x04C876
499981: 0x082750
499982: 0x0821B2
499983: 0x082754
499984: 0x082756
499985: 0x082772
499986: 0x08279E
499987: 0x080084
499988: 0x080087
499989: 0x08008A
499990: 0x080090
499991: 0x080093
499992: 0x080096
499993: 0x0827A5
499994: 0x0827A6
499995: 0x08012D
499996: 0x080130
499997: 0x0827AA
499998: 0x08277C
499999: 0x08278D
500000: 0x082799
```

## Console Output

```text
=== Phase 25AR: Corrected allocator pointers + history recall ===

Cold boot complete.
MEM_INIT: term=return_hit steps=18 finalPc=0xFFFFF6
Allocator re-seed (CORRECTED): FPSbase=0xD1A881 FPS=0xD1A881 OPBase=0xD3FFFF OPS=0xD3FFFF pTempCnt=0x00000000 pTemp=0xD3FFFF progPtr=0xD3FFFF newDataPtr=0xD1A881 scratch=0xD1A881
Error frame @ 0xD1A86C: [FE FF FF D1 1D 06]
History entry @ 0xD0150B: [04 00 72 70 73 3F]
History end ptr @ 0xD01508: [11 15 D0] = 0xD01511
numLastEntries before run = 1

Running ENTER handler @ 0x0585E9 with A=0x05, B=0x05, budget=500000
(ParseInp will NOT be stopped early — full budget applies)

Run result: term=max_steps steps=500000 finalPc=0x082745 loopsForced=0
Missing blocks: false
ParseInp reached: false
Unique PCs: 269

=== Key PC Hits ===
  [HIT]  0x0921CB history manager @ step 58 (count=1)
  [HIT]  0x058C65 empty ENTER path @ step 101 (count=1)
  [MISS] 0x058693 common tail
  [MISS] 0x0586E3 ParseInp call site
  [MISS] 0x099910 0x099910 trampoline
  [MISS] 0x099914 ParseInp entry
  [HIT]  0x082745 VAT walker loop @ step 513 (count=22704)
  [HIT]  0x082754 allocator core @ step 490 (count=22705)
  [MISS] 0x083865 FindSym loop

OP1 @ 0xD005F8: [00 00 00 00 00 00 00 00 00]
OP1 decoded: 0
errNo @ 0xD008DF: 0x00
numLastEntries after run: 0
SP: 0xD1A85D
Post-run allocator: FPSbase=0x01049E FPS=0x01049E OPBase=0x000000 OPS=0x000000 pTempCnt=0x00000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 scratch=0xFEFB62

=== First 100 Block PCs ===
     1: 0x0585E9
     2: 0x0585F8
     3: 0x0585F9
     4: 0x058602
     5: 0x058608
     6: 0x058D54
     7: 0x058EC6
     8: 0x058D58
     9: 0x0800A8
    10: 0x0800AE
    11: 0x080259
    12: 0x0800B2
    13: 0x058D60
    14: 0x058D89
    15: 0x05860C
    16: 0x058BA3
    17: 0x058610
    18: 0x058B5C
    19: 0x058B6E
    20: 0x058614
    21: 0x03FBF9
    22: 0x03FC06
    23: 0x058618
    24: 0x05840B
    25: 0x0800B8
    26: 0x05840F
    27: 0x058410
    28: 0x05E7D8
    29: 0x05E27E
    30: 0x05E35A
    31: 0x04C973
    32: 0x05E282
    33: 0x05E7DC
    34: 0x058414
    35: 0x05861C
    36: 0x058212
    37: 0x0800B8
    38: 0x058216
    39: 0x05821D
    40: 0x05E3E3
    41: 0x05E3F5
    42: 0x04C973
    43: 0x05E3E7
    44: 0x05E3E8
    45: 0x04C973
    46: 0x058221
    47: 0x058621
    48: 0x0581AE
    49: 0x0800B8
    50: 0x0581B2
    51: 0x0581B4
    52: 0x05E872
    53: 0x0581B8
    54: 0x058626
    55: 0x099211
    56: 0x099219
    57: 0x05862A
    58: 0x0921CB
    59: 0x08384B
    60: 0x07FF81
    61: 0x07FF99
    62: 0x04C940
    63: 0x07FF9D
    64: 0x08384F
    65: 0x0820CD
    66: 0x0820E1
    67: 0x0820E6
    68: 0x083856
    69: 0x082BE2
    70: 0x08386A
    71: 0x0838C8
    72: 0x0921CF
    73: 0x0921D5
    74: 0x080197
    75: 0x04C916
    76: 0x04C940
    77: 0x08019D
    78: 0x0921DB
    79: 0x092FDD
    80: 0x092FE3
    81: 0x04C90D
    82: 0x092FE7
    83: 0x092FE1
    84: 0x0921E2
    85: 0x0921F1
    86: 0x09227F
    87: 0x092FDD
    88: 0x092284
    89: 0x092FDD
    90: 0x092FE3
    91: 0x04C90D
    92: 0x092FE7
    93: 0x092FE1
    94: 0x09228B
    95: 0x04C973
    96: 0x092294
    97: 0x092296
    98: 0x0921F8
    99: 0x05862F
   100: 0x058632

=== Last 50 Block PCs ===
499951: 0x08012D
499952: 0x080130
499953: 0x0827AA
499954: 0x08277C
499955: 0x08278D
499956: 0x082799
499957: 0x082745
499958: 0x04C876
499959: 0x082750
499960: 0x0821B2
499961: 0x082754
499962: 0x082756
499963: 0x082772
499964: 0x08279E
499965: 0x080084
499966: 0x080087
499967: 0x08008A
499968: 0x080090
499969: 0x080093
499970: 0x080096
499971: 0x0827A5
499972: 0x0827A6
499973: 0x08012D
499974: 0x080130
499975: 0x0827AA
499976: 0x08277C
499977: 0x08278D
499978: 0x082799
499979: 0x082745
499980: 0x04C876
499981: 0x082750
499982: 0x0821B2
499983: 0x082754
499984: 0x082756
499985: 0x082772
499986: 0x08279E
499987: 0x080084
499988: 0x080087
499989: 0x08008A
499990: 0x080090
499991: 0x080093
499992: 0x080096
499993: 0x0827A5
499994: 0x0827A6
499995: 0x08012D
499996: 0x080130
499997: 0x0827AA
499998: 0x08277C
499999: 0x08278D
500000: 0x082799

```
