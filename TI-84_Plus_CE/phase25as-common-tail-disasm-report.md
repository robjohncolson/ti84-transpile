# Phase 25AS - Common Tail Disassembly + Pre-ParseInp Analysis

## Date

2026-04-24T10:10:42.715Z

## Overview

Static disassembly of the three key code regions before ParseInp,
plus a 10K-step runtime trace of the common tail at 0x058693.

## Console Output

```text
=== Phase 25AS: Common-Tail Disassembly + Runtime Trace ===

═══════════════════════════════════════════════════
PART 1: STATIC DISASSEMBLY (ROM bytes, no execution)
═══════════════════════════════════════════════════

─── 0x058693–0x058700: Common Tail ───

0x058693  97                    SUB A,A
0x058694  32 8D 05 D0           LD (0xD0058D),A
0x058698  FD CB 0C F6           SET 6,(IY+12)
0x05869C  FD CB 00 EE           SET 5,(IY+0)
0x0586A0  CD 76 8C 05           CALL 0x058C76
0x0586A4  FB                    EI
0x0586A5  CD 61 29 08           CALL 0x082961
0x0586A9  CD 5E 21 09           CALL 0x09215E
0x0586AD  40 ED 53 8C 26        SIS LD (0x00268C),DE
0x0586B2  40 22 8E 26           SIS LD (0x00268E),HL
0x0586B6  CD 02 29 08           CALL 0x082902
0x0586BA  3E 02                 LD A,0x02
0x0586BC  FD CB 34 66           BIT 4,(IY+52)
0x0586C0  C4 B3 39 02           CALL NZ,0x0239B3
0x0586C4  FD CB 45 86           RES 0,(IY+69)
0x0586C8  FD CB 45 CE           SET 1,(IY+69)
0x0586CC  20 25                 JR NZ,0x0586F3 (d=37)
0x0586CE  FD CB 49 B6           RES 6,(IY+73)
0x0586D2  CD D1 1F 0A           CALL 0x0A1FD1
0x0586D6  FD CB 02 8E           RES 1,(IY+2)
0x0586DA  FD CB 44 96           RES 2,(IY+68)
0x0586DE  FB                    EI
0x0586DF  CD DD 27 0A           CALL 0x0A27DD
0x0586E3  CD 10 99 09           CALL 0x099910
0x0586E7  FD CB 08 8E           RES 1,(IY+8)
0x0586EB  21 00 00 00           LD HL,0x000000
0x0586EF  40 22 AC 26           SIS LD (0x0026AC),HL
0x0586F3  CD 2A 82 05           CALL 0x05822A
0x0586F7  FD CB 0C B6           RES 6,(IY+12)
0x0586FB  CD 23 36 08           CALL 0x083623
0x0586FF  CD 64 37 08           CALL 0x083764

  Annotations:
    0x0586A0: CALL 0x058C76
    0x0586A5: CALL 0x082961
    0x0586A9: CALL 0x09215E
    0x0586B6: CALL 0x082902
    0x0586BC: BIT 4,(IY+52)
    0x0586C0: CALL NZ,0x0239B3
    0x0586CC: JR NZ,0x0586F3 (d=37)
    0x0586D2: CALL 0x0A1FD1
    0x0586DF: CALL 0x0A27DD
    0x0586E3: CALL 0x099910
    0x0586F3: CALL 0x05822A
    0x0586FB: CALL 0x083623
    0x0586FF: CALL 0x083764

─── Check 0x0586CC: JR NZ that could skip ParseInp ───
0x0586CC  20 25                 JR NZ,0x0586F3 (d=37)
0x0586CE  FD CB 49 B6           RES 6,(IY+73)
0x0586D2  CD D1 1F 0A           CALL 0x0A1FD1

─── Bytes around 0x0586C6–0x0586D0 (bit test + branch) ───
0x0586C6  45                    LD B,L
0x0586C7  86                    ADD A,(HL)
0x0586C8  FD CB 45 CE           SET 1,(IY+69)
0x0586CC  20 25                 JR NZ,0x0586F3 (d=37)
0x0586CE  FD CB 49 B6           RES 6,(IY+73)
0x0586D2  CD D1 1F 0A           CALL 0x0A1FD1

─── 0x082961: Function disassembly (~200 bytes) ───

0x082961  21 F8 05 D0           LD HL,0xD005F8
0x082965  E5                    PUSH HL
0x082966  21 09 00 00           LD HL,0x000009
0x08296A  CD B5 2B 08           CALL 0x082BB5
0x08296E  E1                    POP HL
0x08296F  ED 5B 8D 25 D0        LD DE,(0xD0258D)
0x082974  CD 78 F9 07           CALL 0x07F978
0x082978  ED 53 8D 25 D0        LD (0xD0258D),DE
0x08297D  C9                    RET

  CALLs in 0x082961:
    0x08296A: CALL 0x082BB5
    0x082974: CALL 0x07F978

─── 0x09215E: Function disassembly (~150 bytes) ───

0x09215E  CD B8 00 08           CALL 0x0800B8
0x092162  28 13                 JR Z,0x092177 (d=19)
0x092164  C5                    PUSH BC
0x092165  40 ED 5B 80 26        SIS LD DE,(0x002680)
0x09216A  40 ED 4B 82 26        SIS LD BC,(0x002682)
0x09216F  CD 1E 21 09           CALL 0x09211E
0x092173  C5                    PUSH BC
0x092174  E1                    POP HL
0x092175  C1                    POP BC
0x092176  C9                    RET

  CALLs in 0x09215E:
    0x09215E: CALL 0x0800B8
    0x09216F: CALL 0x09211E

─── 0x0586E3: ParseInp call site ───
0x0586E0  DD 27                 DB DD/FD,0x27
0x0586E2  0A                    LD A,(BC)
0x0586E3  CD 10 99 09           CALL 0x099910
0x0586E7  FD CB 08 8E           RES 1,(IY+8)
0x0586EB  21 00 00 00           LD HL,0x000000
0x0586EF  40 22 AC 26           SIS LD (0x0026AC),HL

═══════════════════════════════════════════════════
PART 2: RUNTIME TRACE of 0x058693 (10K steps)
═══════════════════════════════════════════════════

Cold boot complete.
MEM_INIT: term=return_hit steps=18 finalPc=0xFFFFF6
Allocator pointers seeded (correct ti84pceg.inc addresses).
Error frame @ 0xD1A86C
(IY+52) = mem[0xD000B4] BEFORE run: 0x00 → bit 4 = 0
  If bit 4 is SET → JR NZ at 0x0586CC will SKIP ParseInp
  If bit 4 is CLEAR → JR NZ falls through → ParseInp reached

Run result: term=max_steps steps=10000 finalPc=0x0A2B51
Loops forced: 0
Missing blocks: false
Unique PCs visited: 66
ParseInp reached: false

(IY+52) = mem[0xD000B4] AFTER run: 0x00 → bit 4 = 0

─── Call/Jump Log (PC changes > 16 bytes) ───
  step      2: 0x058693 → 0x058C76
  step      3: 0x058C76 → 0x0586A4
  step      4: 0x0586A4 → 0x082961
  step      5: 0x082961 → 0x082BB5
  step      6: 0x082BB5 → 0x082266
  step      7: 0x082266 → 0x04C92E
  step      8: 0x04C92E → 0x08226B
  step      9: 0x08226B → 0x0820B5
  step     10: 0x0820B5 → 0x0820C8
  step     11: 0x0820C8 → 0x08226F
  step     12: 0x08226F → 0x082BB9
  step     13: 0x082BB9 → 0x08296E
  step     14: 0x08296E → 0x07F978
  step     15: 0x07F978 → 0x082978
  step     16: 0x082978 → 0x0586A9
  step     17: 0x0586A9 → 0x09215E
  step     18: 0x09215E → 0x0800B8
  step     19: 0x0800B8 → 0x092162
  step     20: 0x092162 → 0x092177
  step     21: 0x092177 → 0x092FC1
  step     22: 0x092FC1 → 0x08384B
  step     23: 0x08384B → 0x07FF81
  step     24: 0x07FF81 → 0x07FF99
  step     25: 0x07FF99 → 0x04C940
  step     26: 0x04C940 → 0x07FF9D
  step     27: 0x07FF9D → 0x08384F
  step     28: 0x08384F → 0x0820CD
  step     29: 0x0820CD → 0x0820E1
  step     31: 0x0820E6 → 0x083856
  step     32: 0x083856 → 0x082BE2
  step     33: 0x082BE2 → 0x08386A
  step     34: 0x08386A → 0x0838C8
  step     35: 0x0838C8 → 0x092FC5
  step     36: 0x092FC5 → 0x09217B
  step     37: 0x09217B → 0x04C90D
  step     38: 0x04C90D → 0x092180
  step     39: 0x092180 → 0x0BD19F
  step     40: 0x0BD19F → 0x05E386
  step     41: 0x05E386 → 0x04C973
  step     42: 0x04C973 → 0x05E38A
  step     44: 0x05E38B → 0x080064
  step     45: 0x080064 → 0x05E394
  step     46: 0x05E394 → 0x0BD1A9
  step     48: 0x0BD1AB → 0x0A2A45
  step     49: 0x0A2A45 → 0x0A2A68
  step     50: 0x0A2A68 → 0x0A2AF9
  step     51: 0x0A2AF9 → 0x0A2B16
  step     52: 0x0A2B16 → 0x0A2B51
  step     53: 0x0A2B51 → 0x0A2A49
  step     54: 0x0A2A49 → 0x0BD1B1
  step     56: 0x0BD1A5 → 0x05E386
  step     57: 0x05E386 → 0x04C973
  step     58: 0x04C973 → 0x05E38A
  step     60: 0x05E38B → 0x080064
  step     61: 0x080064 → 0x05E394
  step     62: 0x05E394 → 0x0BD1A9
  step     64: 0x0BD1AB → 0x0A2A45
  step     65: 0x0A2A45 → 0x0A2A68
  step     66: 0x0A2A68 → 0x0A2AF9
  step     67: 0x0A2AF9 → 0x0A2B16
  step     68: 0x0A2B16 → 0x0A2B51
  step     69: 0x0A2B51 → 0x0A2A49
  step     70: 0x0A2A49 → 0x0BD1B1
  step     72: 0x0BD1A5 → 0x05E386
  step     73: 0x05E386 → 0x04C973
  step     74: 0x04C973 → 0x05E38A
  step     76: 0x05E38B → 0x080064
  step     77: 0x080064 → 0x05E394
  step     78: 0x05E394 → 0x0BD1A9
  step     80: 0x0BD1AB → 0x0A2A45
  step     81: 0x0A2A45 → 0x0A2A68
  step     82: 0x0A2A68 → 0x0A2AF9
  step     83: 0x0A2AF9 → 0x0A2B16
  step     84: 0x0A2B16 → 0x0A2B51
  step     85: 0x0A2B51 → 0x0A2A49
  step     86: 0x0A2A49 → 0x0BD1B1
  step     88: 0x0BD1A5 → 0x05E386
  step     89: 0x05E386 → 0x04C973
  step     90: 0x04C973 → 0x05E38A
  step     92: 0x05E38B → 0x080064
  step     93: 0x080064 → 0x05E394
  step     94: 0x05E394 → 0x0BD1A9
  step     96: 0x0BD1AB → 0x0A2A45
  step     97: 0x0A2A45 → 0x0A2A68
  step     98: 0x0A2A68 → 0x0A2AF9
  step     99: 0x0A2AF9 → 0x0A2B16
  step    100: 0x0A2B16 → 0x0A2B51
  step    101: 0x0A2B51 → 0x0A2A49
  step    102: 0x0A2A49 → 0x0BD1B1
  step    104: 0x0BD1A5 → 0x05E386
  step    105: 0x05E386 → 0x04C973
  step    106: 0x04C973 → 0x05E38A
  step    108: 0x05E38B → 0x080064
  step    109: 0x080064 → 0x05E394
  step    110: 0x05E394 → 0x0BD1A9
  step    112: 0x0BD1AB → 0x0A2A45
  step    113: 0x0A2A45 → 0x0A2A68
  step    114: 0x0A2A68 → 0x0A2AF9
  step    115: 0x0A2AF9 → 0x0A2B16
  step    116: 0x0A2B16 → 0x0A2B51
  step    117: 0x0A2B51 → 0x0A2A49
  step    118: 0x0A2A49 → 0x0BD1B1
  step    120: 0x0BD1A5 → 0x05E386
  step    121: 0x05E386 → 0x04C973
  step    122: 0x04C973 → 0x05E38A
  step    124: 0x05E38B → 0x080064
  step    125: 0x080064 → 0x05E394
  step    126: 0x05E394 → 0x0BD1A9
  step    128: 0x0BD1AB → 0x0A2A45
  step    129: 0x0A2A45 → 0x0A2A68
  step    130: 0x0A2A68 → 0x0A2AF9
  step    131: 0x0A2AF9 → 0x0A2B16
  step    132: 0x0A2B16 → 0x0A2B51
  step    133: 0x0A2B51 → 0x0A2A49
  step    134: 0x0A2A49 → 0x0BD1B1
  step    136: 0x0BD1A5 → 0x05E386
  step    137: 0x05E386 → 0x04C973
  step    138: 0x04C973 → 0x05E38A
  step    140: 0x05E38B → 0x080064
  step    141: 0x080064 → 0x05E394
  step    142: 0x05E394 → 0x0BD1A9
  step    144: 0x0BD1AB → 0x0A2A45
  step    145: 0x0A2A45 → 0x0A2A68
  step    146: 0x0A2A68 → 0x0A2AF9
  step    147: 0x0A2AF9 → 0x0A2B16
  step    148: 0x0A2B16 → 0x0A2B51
  step    149: 0x0A2B51 → 0x0A2A49
  step    150: 0x0A2A49 → 0x0BD1B1
  step    152: 0x0BD1A5 → 0x05E386
  step    153: 0x05E386 → 0x04C973
  step    154: 0x04C973 → 0x05E38A
  step    156: 0x05E38B → 0x080064
  step    157: 0x080064 → 0x05E394
  step    158: 0x05E394 → 0x0BD1A9
  step    160: 0x0BD1AB → 0x0A2A45
  step    161: 0x0A2A45 → 0x0A2A68
  step    162: 0x0A2A68 → 0x0A2AF9
  step    163: 0x0A2AF9 → 0x0A2B16
  step    164: 0x0A2B16 → 0x0A2B51
  step    165: 0x0A2B51 → 0x0A2A49
  step    166: 0x0A2A49 → 0x0BD1B1
  step    168: 0x0BD1A5 → 0x05E386
  step    169: 0x05E386 → 0x04C973
  step    170: 0x04C973 → 0x05E38A
  step    172: 0x05E38B → 0x080064
  step    173: 0x080064 → 0x05E394
  step    174: 0x05E394 → 0x0BD1A9
  step    176: 0x0BD1AB → 0x0A2A45
  step    177: 0x0A2A45 → 0x0A2A68
  step    178: 0x0A2A68 → 0x0A2AF9
  step    179: 0x0A2AF9 → 0x0A2B16
  step    180: 0x0A2B16 → 0x0A2B51
  step    181: 0x0A2B51 → 0x0A2A49
  step    182: 0x0A2A49 → 0x0BD1B1
  step    184: 0x0BD1A5 → 0x05E386
  step    185: 0x05E386 → 0x04C973
  step    186: 0x04C973 → 0x05E38A
  step    188: 0x05E38B → 0x080064
  step    189: 0x080064 → 0x05E394
  step    190: 0x05E394 → 0x0BD1A9
  step    192: 0x0BD1AB → 0x0A2A45
  step    193: 0x0A2A45 → 0x0A2A68
  step    194: 0x0A2A68 → 0x0A2AF9
  step    195: 0x0A2AF9 → 0x0A2B16
  step    196: 0x0A2B16 → 0x0A2B51
  step    197: 0x0A2B51 → 0x0A2A49
  step    198: 0x0A2A49 → 0x0BD1B1
  step    200: 0x0BD1A5 → 0x05E386
  step    201: 0x05E386 → 0x04C973
  step    202: 0x04C973 → 0x05E38A
  step    204: 0x05E38B → 0x080064
  step    205: 0x080064 → 0x05E394
  step    206: 0x05E394 → 0x0BD1A9
  step    208: 0x0BD1AB → 0x0A2A45
  step    209: 0x0A2A45 → 0x0A2A68
  step    210: 0x0A2A68 → 0x0A2AF9
  step    211: 0x0A2AF9 → 0x0A2B16
  step    212: 0x0A2B16 → 0x0A2B51
  step    213: 0x0A2B51 → 0x0A2A49
  step    214: 0x0A2A49 → 0x0BD1B1
  step    216: 0x0BD1A5 → 0x05E386
  step    217: 0x05E386 → 0x04C973
  step    218: 0x04C973 → 0x05E38A
  step    220: 0x05E38B → 0x080064
  step    221: 0x080064 → 0x05E394
  step    222: 0x05E394 → 0x0BD1A9
  step    224: 0x0BD1AB → 0x0A2A45
  step    225: 0x0A2A45 → 0x0A2A68
  step    226: 0x0A2A68 → 0x0A2AF9
  step    227: 0x0A2AF9 → 0x0A2B16
  step    228: 0x0A2B16 → 0x0A2B51
  step    229: 0x0A2B51 → 0x0A2A49
  step    230: 0x0A2A49 → 0x0BD1B1
  step    232: 0x0BD1A5 → 0x05E386
  step    233: 0x05E386 → 0x04C973
  step    234: 0x04C973 → 0x05E38A
  step    236: 0x05E38B → 0x080064
  step    237: 0x080064 → 0x05E394
  step    238: 0x05E394 → 0x0BD1A9
  step    240: 0x0BD1AB → 0x0A2A45
  step    241: 0x0A2A45 → 0x0A2A68
  step    242: 0x0A2A68 → 0x0A2AF9
  step    243: 0x0A2AF9 → 0x0A2B16
  step    244: 0x0A2B16 → 0x0A2B51
  step    245: 0x0A2B51 → 0x0A2A49
  step    246: 0x0A2A49 → 0x0BD1B1
  step    248: 0x0BD1A5 → 0x05E386
  step    249: 0x05E386 → 0x04C973
  step    250: 0x04C973 → 0x05E38A
  step    252: 0x05E38B → 0x080064
  step    253: 0x080064 → 0x05E394
  step    254: 0x05E394 → 0x0BD1A9
  step    256: 0x0BD1AB → 0x0A2A45
  step    257: 0x0A2A45 → 0x0A2A68
  step    258: 0x0A2A68 → 0x0A2AF9
  step    259: 0x0A2AF9 → 0x0A2B16
  step    260: 0x0A2B16 → 0x0A2B51
  step    261: 0x0A2B51 → 0x0A2A49
  step    262: 0x0A2A49 → 0x0BD1B1
  step    264: 0x0BD1A5 → 0x05E386
  step    265: 0x05E386 → 0x04C973
  step    266: 0x04C973 → 0x05E38A
  step    268: 0x05E38B → 0x080064
  step    269: 0x080064 → 0x05E394
  step    270: 0x05E394 → 0x0BD1A9
  step    272: 0x0BD1AB → 0x0A2A45
  step    273: 0x0A2A45 → 0x0A2A68
  step    274: 0x0A2A68 → 0x0A2AF9
  step    275: 0x0A2AF9 → 0x0A2B16
  step    276: 0x0A2B16 → 0x0A2B51
  step    277: 0x0A2B51 → 0x0A2A49
  step    278: 0x0A2A49 → 0x0BD1B1
  step    280: 0x0BD1A5 → 0x05E386
  step    281: 0x05E386 → 0x04C973
  step    282: 0x04C973 → 0x05E38A
  step    284: 0x05E38B → 0x080064
  step    285: 0x080064 → 0x05E394
  step    286: 0x05E394 → 0x0BD1A9
  step    288: 0x0BD1AB → 0x0A2A45
  step    289: 0x0A2A45 → 0x0A2A68
  step    290: 0x0A2A68 → 0x0A2AF9
  step    291: 0x0A2AF9 → 0x0A2B16
  step    292: 0x0A2B16 → 0x0A2B51
  step    293: 0x0A2B51 → 0x0A2A49
  step    294: 0x0A2A49 → 0x0BD1B1
  step    296: 0x0BD1A5 → 0x05E386
  step    297: 0x05E386 → 0x04C973
  step    298: 0x04C973 → 0x05E38A
  step    300: 0x05E38B → 0x080064
  step    301: 0x080064 → 0x05E394
  step    302: 0x05E394 → 0x0BD1A9
  step    304: 0x0BD1AB → 0x0A2A45
  step    305: 0x0A2A45 → 0x0A2A68
  step    306: 0x0A2A68 → 0x0A2AF9
  step    307: 0x0A2AF9 → 0x0A2B16
  step    308: 0x0A2B16 → 0x0A2B51
  step    309: 0x0A2B51 → 0x0A2A49
  step    310: 0x0A2A49 → 0x0BD1B1
  step    312: 0x0BD1A5 → 0x05E386
  step    313: 0x05E386 → 0x04C973
  step    314: 0x04C973 → 0x05E38A
  step    316: 0x05E38B → 0x080064
  step    317: 0x080064 → 0x05E394
  step    318: 0x05E394 → 0x0BD1A9
  step    320: 0x0BD1AB → 0x0A2A45
  step    321: 0x0A2A45 → 0x0A2A68
  step    322: 0x0A2A68 → 0x0A2AF9
  step    323: 0x0A2AF9 → 0x0A2B16
  step    324: 0x0A2B16 → 0x0A2B51
  step    325: 0x0A2B51 → 0x0A2A49
  step    326: 0x0A2A49 → 0x0BD1B1
  step    328: 0x0BD1A5 → 0x05E386
  step    329: 0x05E386 → 0x04C973
  step    330: 0x04C973 → 0x05E38A
  step    332: 0x05E38B → 0x080064
  step    333: 0x080064 → 0x05E394
  step    334: 0x05E394 → 0x0BD1A9
  step    336: 0x0BD1AB → 0x0A2A45
  step    337: 0x0A2A45 → 0x0A2A68
  step    338: 0x0A2A68 → 0x0A2AF9
  step    339: 0x0A2AF9 → 0x0A2B16
  step    340: 0x0A2B16 → 0x0A2B51
  step    341: 0x0A2B51 → 0x0A2A49
  step    342: 0x0A2A49 → 0x0BD1B1
  step    344: 0x0BD1A5 → 0x05E386
  step    345: 0x05E386 → 0x04C973
  step    346: 0x04C973 → 0x05E38A
  step    348: 0x05E38B → 0x080064
  step    349: 0x080064 → 0x05E394
  step    350: 0x05E394 → 0x0BD1A9
  step    352: 0x0BD1AB → 0x0A2A45
  step    353: 0x0A2A45 → 0x0A2A68
  step    354: 0x0A2A68 → 0x0A2AF9
  step    355: 0x0A2AF9 → 0x0A2B16
  step    356: 0x0A2B16 → 0x0A2B51
  step    357: 0x0A2B51 → 0x0A2A49
  step    358: 0x0A2A49 → 0x0BD1B1
  step    360: 0x0BD1A5 → 0x05E386
  step    361: 0x05E386 → 0x04C973
  step    362: 0x04C973 → 0x05E38A

─── Key Address Presence in Trace ───
  [HIT]  0x058693 common tail entry
  [HIT]  0x058C76 flag helper
  [HIT]  0x082961 fn 0x082961 (pre-ParseInp call 1)
  [HIT]  0x09215E fn 0x09215E (pre-ParseInp call 2)
  [MISS] 0x082902 fn 0x082902
  [MISS] 0x0A1FD1 fn 0x0A1FD1
  [MISS] 0x0A27DD fn 0x0A27DD
  [MISS] 0x0586CC JR NZ branch point
  [MISS] 0x0586E3 ParseInp call site
  [MISS] 0x0586F3 JR NZ target (skip ParseInp)
  [MISS] 0x099910 ParseInp trampoline 0x099910
  [MISS] 0x099914 ParseInp entry 0x099914
  [HIT]  0x0BD19F LCD/display loop entry
  [HIT]  0x0A2A45 display subroutine
  [MISS] 0x083865 FindSym loop

```

