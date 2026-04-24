# Phase 25AR - numLastEntries=2 + Direct Common-Tail

## Date

2026-04-24T09:24:55.592Z

---

## Scenario A: numLastEntries=2 + ENTER handler

### Setup

- Entry: `0x0585E9` with `A=0x05`, `B=0x05`
- Budget: `500000` block steps
- MEM_INIT: `return_hit`, steps=`18`
- numLastEntries seeded: `2` (expect decrement to 1 -> recall path)
- History entry 1 @ `0xD0150B`: [04 00 72 70 73 3F]
- History entry 2 @ `0xD01511`: [04 00 72 70 73 3F]
- History end ptr: `0xD01517`
- Error frame @ `0xD1A86C`: [FE FF FF D1 1D 06]

### Run Result

- Termination: `max_steps`
- Steps: `500000`
- Final PC: `0x082745`
- Loops forced: `0`
- Missing block: `false`
- **ParseInp reached: `false`**
- Unique PCs: `162`

### Key PC Hits

| PC | Label | Hit? | First Step | Count |
|----|-------|------|------------|-------|
| `0x0921CB` | history manager | YES | 58 | 1 |
| `0x058C65` | empty ENTER path | NO | - | 0 |
| `0x058693` | common tail | NO | - | 0 |
| `0x0586E3` | ParseInp call site | NO | - | 0 |
| `0x099910` | 0x099910 trampoline | NO | - | 0 |
| `0x099914` | ParseInp entry | NO | - | 0 |
| `0x082745` | VAT walker loop | YES | 249 | 22716 |

### Output State

- OP1: [00 00 00 00 00 00 00 00 00] = `0`
- errNo: `0x00`
- numLastEntries after: `0`
- SP: `0xD1A860`
- Post-run allocator: `FPSbase=0x01049E FPS=0x01049E OPBase=0x000000 OPS=0x000000 pTempCnt=0x00000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 scratch=0xFEFB62`

### First 100 Block PCs

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
    97: 0x0922A2
    98: 0x092297
    99: 0x0921F8
   100: 0x05862F
```

### Last 50 Block PCs

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

---

## Scenario B: Direct common-tail call @ 0x058693

### Setup

- Entry: `0x058693` (common tail, bypasses ENTER handler)
- Budget: `50000` block steps
- MEM_INIT: `return_hit`, steps=`18`
- Tokens "2+3\n" @ `0xD1A881`: [72 70 73 3F]
- Error frame @ `0xD1A869`: [FE FF FF D1 1D 06]
- FAKE_RET pushed as return address
- OP1 cleared to zeros

### Run Result

- Termination: `max_steps`
- Steps: `50000`
- Final PC: `0x0A2A49`
- Loops forced: `0`
- Missing block: `false`
- **ParseInp reached: `false`**
- Unique PCs: `73`

### Key PC Hits

| PC | Label | Hit? | First Step | Count |
|----|-------|------|------------|-------|
| `0x058693` | common tail | YES | 1 | 1 |
| `0x0586E3` | ParseInp call site | NO | - | 0 |
| `0x099910` | 0x099910 trampoline | NO | - | 0 |
| `0x099914` | ParseInp entry | NO | - | 0 |
| `0x082745` | VAT walker loop | NO | - | 0 |
| `0x082961` | 0x082961 parse handler | YES | 4 | 1 |
| `0x09215E` | 0x09215E FindSym | YES | 17 | 1 |
| `0x0A27DD` | 0x0A27DD MemChk | NO | - | 0 |

### Output State

- OP1: [05 23 00 00 00 00 00 00 00] = `0`
- errNo: `0x00`
- SP: `0xD1A854`
- Post-run allocator: `FPSbase=0xD1A881 FPS=0xD1A88A OPBase=0xD3FFFF OPS=0xD3FFFF pTempCnt=0x00000000 pTemp=0xD3FFFF progPtr=0xD3FFFF newDataPtr=0xD1A881 scratch=0xD1A881`

### First 100 Block PCs

```text
     1: 0x058693
     2: 0x058C76
     3: 0x0586A4
     4: 0x082961
     5: 0x082BB5
     6: 0x082266
     7: 0x04C92E
     8: 0x08226B
     9: 0x0820B5
    10: 0x0820C8
    11: 0x08226F
    12: 0x082BB9
    13: 0x08296E
    14: 0x07F978
    15: 0x082978
    16: 0x0586A9
    17: 0x09215E
    18: 0x0800B8
    19: 0x092162
    20: 0x092177
    21: 0x092FC1
    22: 0x08384B
    23: 0x07FF81
    24: 0x07FF99
    25: 0x04C940
    26: 0x07FF9D
    27: 0x08384F
    28: 0x0820CD
    29: 0x0820E1
    30: 0x0820E6
    31: 0x083856
    32: 0x082BE2
    33: 0x08386A
    34: 0x0838C8
    35: 0x092FC5
    36: 0x09217B
    37: 0x04C90D
    38: 0x092180
    39: 0x0BD19F
    40: 0x05E386
    41: 0x04C973
    42: 0x05E38A
    43: 0x05E38B
    44: 0x080064
    45: 0x05E394
    46: 0x0BD1A9
    47: 0x0BD1AB
    48: 0x0A2A45
    49: 0x0A2A68
    50: 0x0A2AF9
    51: 0x0A2B16
    52: 0x0A2B51
    53: 0x0A2A49
    54: 0x0BD1B1
    55: 0x0BD1A5
    56: 0x05E386
    57: 0x04C973
    58: 0x05E38A
    59: 0x05E38B
    60: 0x080064
    61: 0x05E394
    62: 0x0BD1A9
    63: 0x0BD1AB
    64: 0x0A2A45
    65: 0x0A2A68
    66: 0x0A2AF9
    67: 0x0A2B16
    68: 0x0A2B51
    69: 0x0A2A49
    70: 0x0BD1B1
    71: 0x0BD1A5
    72: 0x05E386
    73: 0x04C973
    74: 0x05E38A
    75: 0x05E38B
    76: 0x080064
    77: 0x05E394
    78: 0x0BD1A9
    79: 0x0BD1AB
    80: 0x0A2A45
    81: 0x0A2A68
    82: 0x0A2AF9
    83: 0x0A2B16
    84: 0x0A2B51
    85: 0x0A2A49
    86: 0x0BD1B1
    87: 0x0BD1A5
    88: 0x05E386
    89: 0x04C973
    90: 0x05E38A
    91: 0x05E38B
    92: 0x080064
    93: 0x05E394
    94: 0x0BD1A9
    95: 0x0BD1AB
    96: 0x0A2A45
    97: 0x0A2A68
    98: 0x0A2AF9
    99: 0x0A2B16
   100: 0x0A2B51
```

### Last 50 Block PCs

```text
 49951: 0x0A2B16
 49952: 0x0A2B51
 49953: 0x0A2A49
 49954: 0x0BD1B1
 49955: 0x0BD1A5
 49956: 0x05E386
 49957: 0x04C973
 49958: 0x05E38A
 49959: 0x05E38B
 49960: 0x080064
 49961: 0x05E394
 49962: 0x0BD1A9
 49963: 0x0BD1AB
 49964: 0x0A2A45
 49965: 0x0A2A68
 49966: 0x0A2AF9
 49967: 0x0A2B16
 49968: 0x0A2B51
 49969: 0x0A2A49
 49970: 0x0BD1B1
 49971: 0x0BD1A5
 49972: 0x05E386
 49973: 0x04C973
 49974: 0x05E38A
 49975: 0x05E38B
 49976: 0x080064
 49977: 0x05E394
 49978: 0x0BD1A9
 49979: 0x0BD1AB
 49980: 0x0A2A45
 49981: 0x0A2A68
 49982: 0x0A2AF9
 49983: 0x0A2B16
 49984: 0x0A2B51
 49985: 0x0A2A49
 49986: 0x0BD1B1
 49987: 0x0BD1A5
 49988: 0x05E386
 49989: 0x04C973
 49990: 0x05E38A
 49991: 0x05E38B
 49992: 0x080064
 49993: 0x05E394
 49994: 0x0BD1A9
 49995: 0x0BD1AB
 49996: 0x0A2A45
 49997: 0x0A2A68
 49998: 0x0A2AF9
 49999: 0x0A2B16
 50000: 0x0A2B51
```

---

## Full Console Output

```text
=== Phase 25AR: numLastEntries=2 + Direct Common-Tail ===

========================================
=== SCENARIO A: numLastEntries=2 + ENTER handler ===
========================================

Cold boot complete.
MEM_INIT: term=return_hit steps=18 finalPc=0xFFFFF6
Allocator re-seed (CORRECTED): FPSbase=0xD1A881 FPS=0xD1A881 OPBase=0xD3FFFF OPS=0xD3FFFF pTempCnt=0x00000000 pTemp=0xD3FFFF progPtr=0xD3FFFF newDataPtr=0xD1A881 scratch=0xD1A881
Error frame @ 0xD1A86C: [FE FF FF D1 1D 06]
History entry 1 @ 0xD0150B: [04 00 72 70 73 3F]
History entry 2 @ 0xD01511: [04 00 72 70 73 3F]
History end ptr @ 0xD01508: [17 15 D0] = 0xD01517
numLastEntries before run = 2
Running ENTER handler @ 0x0585E9 with A=0x05, B=0x05, budget=500000

Run result: term=max_steps steps=500000 finalPc=0x082745 loopsForced=0
Missing blocks: false
ParseInp reached: false
Unique PCs: 162

--- Key PC Hits (Scenario A) ---
  [HIT]  0x0921CB history manager @ step 58 (count=1)
  [MISS] 0x058C65 empty ENTER path
  [MISS] 0x058693 common tail
  [MISS] 0x0586E3 ParseInp call site
  [MISS] 0x099910 0x099910 trampoline
  [MISS] 0x099914 ParseInp entry
  [HIT]  0x082745 VAT walker loop @ step 249 (count=22716)

OP1 @ 0xD005F8: [00 00 00 00 00 00 00 00 00]
OP1 decoded: 0
errNo @ 0xD008DF: 0x00
numLastEntries after run: 0
SP: 0xD1A860
Post-run allocator: FPSbase=0x01049E FPS=0x01049E OPBase=0x000000 OPS=0x000000 pTempCnt=0x00000000 pTemp=0x000000 progPtr=0x000000 newDataPtr=0x000000 scratch=0xFEFB62

--- First 100 Block PCs (Scenario A) ---
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
    97: 0x0922A2
    98: 0x092297
    99: 0x0921F8
   100: 0x05862F

--- Last 50 Block PCs (Scenario A) ---
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


========================================
=== SCENARIO B: Direct common-tail call @ 0x058693 ===
========================================

Cold boot complete.
MEM_INIT: term=return_hit steps=18 finalPc=0xFFFFF6
Allocator re-seed (CORRECTED): FPSbase=0xD1A881 FPS=0xD1A881 OPBase=0xD3FFFF OPS=0xD3FFFF pTempCnt=0x00000000 pTemp=0xD3FFFF progPtr=0xD3FFFF newDataPtr=0xD1A881 scratch=0xD1A881
Error frame @ 0xD1A869: [FE FF FF D1 1D 06]
Tokenized input @ 0xD1A881: [72 70 73 3F]
begPC=0xD1A881 curPC=0xD1A881 endPC=0xD1A885
OP1 cleared: [00 00 00 00 00 00 00 00 00]
SP=0xD1A869
Calling common tail DIRECTLY @ 0x058693, budget=50000

Run result: term=max_steps steps=50000 finalPc=0x0A2A49 loopsForced=0
Missing blocks: false
ParseInp reached: false
Unique PCs: 73

--- Key PC Hits (Scenario B) ---
  [HIT]  0x058693 common tail @ step 1 (count=1)
  [MISS] 0x0586E3 ParseInp call site
  [MISS] 0x099910 0x099910 trampoline
  [MISS] 0x099914 ParseInp entry
  [MISS] 0x082745 VAT walker loop
  [HIT]  0x082961 0x082961 parse handler @ step 4 (count=1)
  [HIT]  0x09215E 0x09215E FindSym @ step 17 (count=1)
  [MISS] 0x0A27DD 0x0A27DD MemChk

OP1 @ 0xD005F8: [05 23 00 00 00 00 00 00 00]
OP1 decoded: 0
errNo @ 0xD008DF: 0x00
SP: 0xD1A854
Post-run allocator: FPSbase=0xD1A881 FPS=0xD1A88A OPBase=0xD3FFFF OPS=0xD3FFFF pTempCnt=0x00000000 pTemp=0xD3FFFF progPtr=0xD3FFFF newDataPtr=0xD1A881 scratch=0xD1A881

--- First 100 Block PCs (Scenario B) ---
     1: 0x058693
     2: 0x058C76
     3: 0x0586A4
     4: 0x082961
     5: 0x082BB5
     6: 0x082266
     7: 0x04C92E
     8: 0x08226B
     9: 0x0820B5
    10: 0x0820C8
    11: 0x08226F
    12: 0x082BB9
    13: 0x08296E
    14: 0x07F978
    15: 0x082978
    16: 0x0586A9
    17: 0x09215E
    18: 0x0800B8
    19: 0x092162
    20: 0x092177
    21: 0x092FC1
    22: 0x08384B
    23: 0x07FF81
    24: 0x07FF99
    25: 0x04C940
    26: 0x07FF9D
    27: 0x08384F
    28: 0x0820CD
    29: 0x0820E1
    30: 0x0820E6
    31: 0x083856
    32: 0x082BE2
    33: 0x08386A
    34: 0x0838C8
    35: 0x092FC5
    36: 0x09217B
    37: 0x04C90D
    38: 0x092180
    39: 0x0BD19F
    40: 0x05E386
    41: 0x04C973
    42: 0x05E38A
    43: 0x05E38B
    44: 0x080064
    45: 0x05E394
    46: 0x0BD1A9
    47: 0x0BD1AB
    48: 0x0A2A45
    49: 0x0A2A68
    50: 0x0A2AF9
    51: 0x0A2B16
    52: 0x0A2B51
    53: 0x0A2A49
    54: 0x0BD1B1
    55: 0x0BD1A5
    56: 0x05E386
    57: 0x04C973
    58: 0x05E38A
    59: 0x05E38B
    60: 0x080064
    61: 0x05E394
    62: 0x0BD1A9
    63: 0x0BD1AB
    64: 0x0A2A45
    65: 0x0A2A68
    66: 0x0A2AF9
    67: 0x0A2B16
    68: 0x0A2B51
    69: 0x0A2A49
    70: 0x0BD1B1
    71: 0x0BD1A5
    72: 0x05E386
    73: 0x04C973
    74: 0x05E38A
    75: 0x05E38B
    76: 0x080064
    77: 0x05E394
    78: 0x0BD1A9
    79: 0x0BD1AB
    80: 0x0A2A45
    81: 0x0A2A68
    82: 0x0A2AF9
    83: 0x0A2B16
    84: 0x0A2B51
    85: 0x0A2A49
    86: 0x0BD1B1
    87: 0x0BD1A5
    88: 0x05E386
    89: 0x04C973
    90: 0x05E38A
    91: 0x05E38B
    92: 0x080064
    93: 0x05E394
    94: 0x0BD1A9
    95: 0x0BD1AB
    96: 0x0A2A45
    97: 0x0A2A68
    98: 0x0A2AF9
    99: 0x0A2B16
   100: 0x0A2B51

--- Last 50 Block PCs (Scenario B) ---
 49951: 0x0A2B16
 49952: 0x0A2B51
 49953: 0x0A2A49
 49954: 0x0BD1B1
 49955: 0x0BD1A5
 49956: 0x05E386
 49957: 0x04C973
 49958: 0x05E38A
 49959: 0x05E38B
 49960: 0x080064
 49961: 0x05E394
 49962: 0x0BD1A9
 49963: 0x0BD1AB
 49964: 0x0A2A45
 49965: 0x0A2A68
 49966: 0x0A2AF9
 49967: 0x0A2B16
 49968: 0x0A2B51
 49969: 0x0A2A49
 49970: 0x0BD1B1
 49971: 0x0BD1A5
 49972: 0x05E386
 49973: 0x04C973
 49974: 0x05E38A
 49975: 0x05E38B
 49976: 0x080064
 49977: 0x05E394
 49978: 0x0BD1A9
 49979: 0x0BD1AB
 49980: 0x0A2A45
 49981: 0x0A2A68
 49982: 0x0A2AF9
 49983: 0x0A2B16
 49984: 0x0A2B51
 49985: 0x0A2A49
 49986: 0x0BD1B1
 49987: 0x0BD1A5
 49988: 0x05E386
 49989: 0x04C973
 49990: 0x05E38A
 49991: 0x05E38B
 49992: 0x080064
 49993: 0x05E394
 49994: 0x0BD1A9
 49995: 0x0BD1AB
 49996: 0x0A2A45
 49997: 0x0A2A68
 49998: 0x0A2AF9
 49999: 0x0A2B16
 50000: 0x0A2B51

```
