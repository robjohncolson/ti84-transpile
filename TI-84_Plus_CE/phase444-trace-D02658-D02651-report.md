=== Phase 444: Trace D02658 and D02651 (Timer ISR Countdown Targets) ===
ROM: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ROM.rom
Scan date: 2026-05-25T20:18:06.935Z

============================================================
=== D02658 (0xD02658) — 24-bit ===
============================================================

Total references: 4
  Reads:   2
  Writes:  2
  Unknown: 0

Write value summary:
  0x000026: 1
  DEC HL (decrement): 1

Read gate summary:
  0x001787  RET NC
  0x001ADE  RET NC

--- Reference Table ---

0x00177D  WRITE    LD (0xD02658),HL
  function:  0x001778 (after RET fallback)
  value:     0x000026
  co-access: -
  D0xxxx:    0xD02658
  context:   C9 3E 07 C9 E5 21 26 00 00 22 [58] [26] [D0] E1 C9 FB 76 00 E5 2A 58 26 D0

0x001787  READ     LD HL,(0xD02658)
  function:  0x001783 (after RET fallback)
  value:     RET NC
  co-access: -
  D0xxxx:    0xD02658
  context:   58 26 D0 E1 C9 FB 76 00 E5 2A [58] [26] [D0] 7D B4 28 03 3E 01 B7 E1 C9 06

0x001ADE  READ     LD HL,(0xD02658)
  function:  0x001A4B (after RET fallback)
  value:     RET NC
  co-access: 0xD02651, 0xD0301B
  D0xxxx:    0xD0053F, 0xD02651, 0xD02658, 0xD02AD7, 0xD0301B
  context:   50 28 01 CF 79 FE 08 20 FA 2A [58] [26] [D0] 2B 22 58 26 D0 3A 51 26 D0 3D

0x001AE3  WRITE    LD (0xD02658),HL
  function:  0x001A4B (after RET fallback)
  value:     DEC HL (decrement)
  co-access: 0xD02651, 0xD0301B
  D0xxxx:    0xD0053F, 0xD02651, 0xD02658, 0xD02AD7, 0xD0301B
  context:   FE 08 20 FA 2A 58 26 D0 2B 22 [58] [26] [D0] 3A 51 26 D0 3D FE FF CA 32 1A

--- Grouped by Function ---

0x001778 (after RET fallback)
  sites:  0x00177D[WRITE]
  D0xx:   0xD02658

0x001783 (after RET fallback)
  sites:  0x001787[READ]
  D0xx:   0xD02658

0x001A4B (after RET fallback)
  sites:  0x001ADE[READ], 0x001AE3[WRITE]
  D0xx:   0xD0053F, 0xD02651, 0xD02658, 0xD02AD7, 0xD0301B

--- Key Site Disassembly ---

  --- 0x00177D (WRITE) ---
  0x00176E  01 C9 3E 00        LD BC,0x003EC9
  0x001772  06 06              LD B,0x06
  0x001774  C9                 RET
  0x001775  3E 07              LD A,0x07
  0x001777  C9                 RET
  0x001778  E5                 PUSH HL
  0x001779  21 26 00 00        LD HL,0x000026
  0x00177D  22 58 26 D0        LD (0xD02658),HL <<<
  0x001781  E1                 POP HL
  0x001782  C9                 RET
  0x001783  FB                 EI
  0x001784  76                 HALT
  0x001785  00                 NOP
  0x001786  E5                 PUSH HL
  0x001787  2A 58 26 D0        LD HL,(0xD02658)
  0x00178B  7D                 LD A,L
  0x00178C  B4                 OR H
  0x00178D  28 03              JR Z,0x001792
  0x00178F  3E 01              LD A,0x01

  --- 0x001787 (READ) ---
  0x001778  E5                 PUSH HL
  0x001779  21 26 00 00        LD HL,0x000026
  0x00177D  22 58 26 D0        LD (0xD02658),HL
  0x001781  E1                 POP HL
  0x001782  C9                 RET
  0x001783  FB                 EI
  0x001784  76                 HALT
  0x001785  00                 NOP
  0x001786  E5                 PUSH HL
  0x001787  2A 58 26 D0        LD HL,(0xD02658) <<<
  0x00178B  7D                 LD A,L
  0x00178C  B4                 OR H
  0x00178D  28 03              JR Z,0x001792
  0x00178F  3E 01              LD A,0x01
  0x001791  B7                 OR A
  0x001792  E1                 POP HL
  0x001793  C9                 RET
  0x001794  06 F8              LD B,0xF8
  0x001796  CD 78 17 00        CALL 0x001778
  0x00179A  CD 96 12 00        CALL 0x001296

  --- 0x001ADE (READ) ---
  0x001ACF  3E 10              LD A,0x10
  0x001AD1  ED 79              [out-reg]
  0x001AD3  78                 LD A,B
  0x001AD4  FE 50              CP 0x50
  0x001AD6  28 01              JR Z,0x001AD9
  0x001AD8  CF                 [rst]
  0x001AD9  79                 LD A,C
  0x001ADA  FE 08              CP 0x08
  0x001ADC  20 FA              JR NZ,0x001AD8
  0x001ADE  2A 58 26 D0        LD HL,(0xD02658) <<<
  0x001AE2  2B                 DEC HL
  0x001AE3  22 58 26 D0        LD (0xD02658),HL
  0x001AE7  3A 51 26 D0        LD A,(0xD02651)
  0x001AEB  3D                 DEC A
  0x001AEC  FE FF              CP 0xFF
  0x001AEE  CA 32 1A 00        JP Z,0x001A32

  --- 0x001AE3 (WRITE) ---
  0x001AD4  FE 50              CP 0x50
  0x001AD6  28 01              JR Z,0x001AD9
  0x001AD8  CF                 [rst]
  0x001AD9  79                 LD A,C
  0x001ADA  FE 08              CP 0x08
  0x001ADC  20 FA              JR NZ,0x001AD8
  0x001ADE  2A 58 26 D0        LD HL,(0xD02658)
  0x001AE2  2B                 DEC HL
  0x001AE3  22 58 26 D0        LD (0xD02658),HL <<<
  0x001AE7  3A 51 26 D0        LD A,(0xD02651)
  0x001AEB  3D                 DEC A
  0x001AEC  FE FF              CP 0xFF
  0x001AEE  CA 32 1A 00        JP Z,0x001A32
  0x001AF2  32 51 26 D0        LD (0xD02651),A
  0x001AF6  C3 32 1A 00        JP 0x001A32

============================================================
=== D02651 (0xD02651) — 8-bit ===
============================================================

Total references: 4
  Reads:   2
  Writes:  2
  Unknown: 0

Write value summary:
  DEC A (decrement): 1
  ?: 1

Read gate summary:
  0x001AE7  RET NC
  0x03D038  RET NC

--- Reference Table ---

0x001AE7  READ     LD A,(0xD02651)
  function:  0x001A4B (after RET fallback)
  value:     RET NC
  co-access: 0xD02658, 0xD0301B
  D0xxxx:    0xD0053F, 0xD02651, 0xD02658, 0xD02AD7, 0xD0301B
  context:   2A 58 26 D0 2B 22 58 26 D0 3A [51] [26] [D0] 3D FE FF CA 32 1A 00 32 51 26

0x001AF2  WRITE    LD (0xD02651),A
  function:  0x001A4B (after RET fallback)
  value:     DEC A (decrement)
  co-access: 0xD02658, 0xD0301B
  D0xxxx:    0xD0053F, 0xD02651, 0xD02658, 0xD02AD7, 0xD0301B
  context:   26 D0 3D FE FF CA 32 1A 00 32 [51] [26] [D0] C3 32 1A 00 CD A6 58 01 28 01

0x03D038  READ     LD A,(0xD02651)
  function:  0x03CF6F (after RET fallback)
  value:     RET NC
  co-access: 0xD0E0C2, 0xD0E0C3
  D0xxxx:    0xD00080, 0xD00590, 0xD00591, 0xD02651, 0xD02AD7
  context:   50 28 01 CF 79 FE 08 20 FA 3A [51] [26] [D0] D6 01 38 04 32 51 26 D0 FD CB

0x03D040  WRITE    LD (0xD02651),A
  function:  0x03CF6F (after RET fallback)
  value:     ?
  co-access: 0xD0E0C2, 0xD0E0C3
  D0xxxx:    0xD00080, 0xD00590, 0xD00591, 0xD02651, 0xD02AD7
  context:   FA 3A 51 26 D0 D6 01 38 04 32 [51] [26] [D0] FD CB 12 46 C4 C3 D1 03 FD CB

--- Grouped by Function ---

0x001A4B (after RET fallback)
  sites:  0x001AE7[READ], 0x001AF2[WRITE]
  D0xx:   0xD0053F, 0xD02651, 0xD02658, 0xD02AD7, 0xD0301B

0x03CF6F (after RET fallback)
  sites:  0x03D038[READ], 0x03D040[WRITE]
  D0xx:   0xD00080, 0xD00590, 0xD00591, 0xD02651, 0xD02AD7

--- Key Site Disassembly ---

  --- 0x001AE7 (READ) ---
  0x001AD8  CF                 [rst]
  0x001AD9  79                 LD A,C
  0x001ADA  FE 08              CP 0x08
  0x001ADC  20 FA              JR NZ,0x001AD8
  0x001ADE  2A 58 26 D0        LD HL,(0xD02658)
  0x001AE2  2B                 DEC HL
  0x001AE3  22 58 26 D0        LD (0xD02658),HL
  0x001AE7  3A 51 26 D0        LD A,(0xD02651) <<<
  0x001AEB  3D                 DEC A
  0x001AEC  FE FF              CP 0xFF
  0x001AEE  CA 32 1A 00        JP Z,0x001A32
  0x001AF2  32 51 26 D0        LD (0xD02651),A
  0x001AF6  C3 32 1A 00        JP 0x001A32
  0x001AFA  CD A6 58 01        CALL 0x0158A6

  --- 0x001AF2 (WRITE) ---
  0x001AE3  22 58 26 D0        LD (0xD02658),HL
  0x001AE7  3A 51 26 D0        LD A,(0xD02651)
  0x001AEB  3D                 DEC A
  0x001AEC  FE FF              CP 0xFF
  0x001AEE  CA 32 1A 00        JP Z,0x001A32
  0x001AF2  32 51 26 D0        LD (0xD02651),A <<<
  0x001AF6  C3 32 1A 00        JP 0x001A32
  0x001AFA  CD A6 58 01        CALL 0x0158A6
  0x001AFE  28 01              JR Z,0x001B01
  0x001B00  C7                 [rst]
  0x001B01  F3                 DI
  0x001B02  21 00 00 00        LD HL,0x000000

  --- 0x03D038 (READ) ---
  0x03D029  3E 10              LD A,0x10
  0x03D02B  ED 79              [out-reg]
  0x03D02D  78                 LD A,B
  0x03D02E  FE 50              CP 0x50
  0x03D030  28 01              JR Z,0x03D033
  0x03D032  CF                 [rst]
  0x03D033  79                 LD A,C
  0x03D034  FE 08              CP 0x08
  0x03D036  20 FA              JR NZ,0x03D032
  0x03D038  3A 51 26 D0        LD A,(0xD02651) <<<
  0x03D03C  D6 01              SUB 0x01
  0x03D03E  38 04              JR C,0x03D044
  0x03D040  32 51 26 D0        LD (0xD02651),A
  0x03D044  FD CB 12 46        [indexed-cb-bit]
  0x03D048  C4 C3 D1 03        CALL NZ,0x03D1C3

  --- 0x03D040 (WRITE) ---
  0x03D031  01 CF 79 FE        LD BC,0xFE79CF
  0x03D035  08                 [ex-af]
  0x03D036  20 FA              JR NZ,0x03D032
  0x03D038  3A 51 26 D0        LD A,(0xD02651)
  0x03D03C  D6 01              SUB 0x01
  0x03D03E  38 04              JR C,0x03D044
  0x03D040  32 51 26 D0        LD (0xD02651),A <<<
  0x03D044  FD CB 12 46        [indexed-cb-bit]
  0x03D048  C4 C3 D1 03        CALL NZ,0x03D1C3
  0x03D04C  FD CB 12 56        [indexed-cb-bit]
  0x03D050  C2 E0 D0 03        JP NZ,0x03D0E0

============================================================
=== Adjacent Address Scan (D02652-D0265A) ===
============================================================

D02652: 0 hits

D02653: 0 hits

D02654: 0 hits

D02655: 7 hits at 0x0278E8, 0x02791F, 0x027937, 0x02795A, 0x02795F, 0x0279A3, 0x0279B1
  0x0278E7  READ     LD HL,(0xD02655)
  0x02791D  WRITE    LD (0xD02655),BC
  0x027936  READ     LD HL,(0xD02655)
  0x027958  READ     LD DE,(0xD02655)
  0x02795E  WRITE    LD (0xD02655),HL
  0x0279A2  READ     LD HL,(0xD02655)
  0x0279B0  WRITE    LD (0xD02655),HL

D02656: 0 hits

D02657: 0 hits

D02659: 0 hits

D0265A: 0 hits

============================================================
=== Timer ISR (0x001ACF) Disassembly ===
============================================================
0x001ACF  3E 10              LD A,0x10
0x001AD1  ED 79              [out-reg]
0x001AD3  78                 LD A,B
0x001AD4  FE 50              CP 0x50
0x001AD6  28 01              JR Z,0x001AD9
0x001AD8  CF                 [rst]
0x001AD9  79                 LD A,C
0x001ADA  FE 08              CP 0x08
0x001ADC  20 FA              JR NZ,0x001AD8
0x001ADE  2A 58 26 D0        LD HL,(0xD02658)
0x001AE2  2B                 DEC HL
0x001AE3  22 58 26 D0        LD (0xD02658),HL
0x001AE7  3A 51 26 D0        LD A,(0xD02651)
0x001AEB  3D                 DEC A
0x001AEC  FE FF              CP 0xFF
0x001AEE  CA 32 1A 00        JP Z,0x001A32
0x001AF2  32 51 26 D0        LD (0xD02651),A
0x001AF6  C3 32 1A 00        JP 0x001A32
0x001AFA  CD A6 58 01        CALL 0x0158A6
0x001AFE  28 01              JR Z,0x001B01
0x001B00  C7                 [rst]
0x001B01  F3                 DI
0x001B02  21 00 00 00        LD HL,0x000000
0x001B06  22 1B 30 D0        LD (0xD0301B),HL
0x001B0A  31 7E A8 D1        LD SP,0xD1A87E
0x001B0E  01 05 10 00        LD BC,0x001005
0x001B12  3E 04              LD A,0x04
0x001B14  ED 79              [out-reg]
0x001B16  78                 LD A,B
0x001B17  FE 10              CP 0x10
0x001B19  C2 B5 19 00        JP NZ,0x0019B5
0x001B1D  3E 03              LD A,0x03

============================================================
=== D02658 Init Function (0x001778) Disassembly ===
============================================================
0x001773  06 C9              LD B,0xC9
0x001775  3E 07              LD A,0x07
0x001777  C9                 RET
0x001778  E5                 PUSH HL
0x001779  21 26 00 00        LD HL,0x000026
0x00177D  22 58 26 D0        LD (0xD02658),HL
0x001781  E1                 POP HL
0x001782  C9                 RET
0x001783  FB                 EI
0x001784  76                 HALT
0x001785  00                 NOP
0x001786  E5                 PUSH HL
0x001787  2A 58 26 D0        LD HL,(0xD02658)
0x00178B  7D                 LD A,L
0x00178C  B4                 OR H
0x00178D  28 03              JR Z,0x001792
0x00178F  3E 01              LD A,0x01
0x001791  B7                 OR A
0x001792  E1                 POP HL
0x001793  C9                 RET
0x001794  06 F8              LD B,0xF8