# Phase595 populator gate static analysis

ROM: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ROM.rom

## 0x07F81D disassembly
0x07F81D  CD 07 FA 07     CALL 0x07FA07
0x07F821  18 0E           JR 0x07F831
0x07F823  CD 7A 86 06     CALL 0x06867A
0x07F827  18 08           JR 0x07F831
0x07F829  CD D6 FD 07     CALL 0x07FDD6
0x07F82D  CD D0 FD 07     CALL 0x07FDD0
0x07F831  3A FA 05 D0     LD A,(0xD005FA)
0x07F835  B7              OR A
0x07F836  CC CF FA 07     CALL Z,0x07FACF
0x07F83A  3A 05 06 D0     LD A,(0xD00605)
0x07F83E  B7              OR A
0x07F83F  CC D5 FA 07     CALL Z,0x07FAD5
0x07F843  3A F8 05 D0     LD A,(0xD005F8)
0x07F847  B7              OR A
0x07F848  3A 03 06 D0     LD A,(0xD00603)
0x07F84C  FA 6D F8 07     JP M,0x07F86D
0x07F850  E6 80           AND 0x80
0x07F852  20 2F           JR NZ,0x07F883
0x07F854  CD 37 00 08     CALL 0x080037
0x07F858  21 05 06 D0     LD HL,0xD00605
0x07F85C  11 FA 05 D0     LD DE,0xD005FA
0x07F860  20 21           JR NZ,0x07F883
0x07F862  06 07           LD B,0x07
0x07F864  1A              LD A,(DE)
0x07F865  BE              CP (HL)  ; CARRY-RISK CP
0x07F866  C0              RET NZ
0x07F867  23              INC HL
0x07F868  13              INC DE
0x07F869  10 F9           DJNZ 0x07F864
0x07F86B  18 16           JR 0x07F883
0x07F86D  E6 80           AND 0x80
0x07F86F  28 10           JR Z,0x07F881
0x07F871  21 F9 05 D0     LD HL,0xD005F9
0x07F875  3A 04 06 D0     LD A,(0xD00604)
0x07F879  96              SUB (HL)  ; CARRY-RISK SUB
0x07F87A  23              INC HL
0x07F87B  11 05 06 D0     LD DE,0xD00605
0x07F87F  18 DF           JR 0x07F860
0x07F881  D6 01           SUB 0x01  ; CARRY-RISK SUB
0x07F883  F5              PUSH AF
0x07F884  3A F9 05 D0     LD A,(0xD005F9)
0x07F888  B7              OR A
0x07F889  CC C2 FA 07     CALL Z,0x07FAC2
0x07F88D  3A 04 06 D0     LD A,(0xD00604)
0x07F891  B7              OR A
0x07F892  CC AF FA 07     CALL Z,0x07FAAF
0x07F896  F1              POP AF
0x07F897  C9              RET

## Absolute RAM references in 0x07F81D
- 0xD005F8: read
- 0xD005F9: pointer, read
- 0xD005FA: read, pointer
- 0xD00603: read
- 0xD00604: read, read
- 0xD00605: read, pointer, pointer

## Carry conclusion
0x07F81D validates two seven-byte descriptor records at D005F8-D005FE and D00603-D00609, with the descriptor class/length bytes at D005F9/D00604 and type/sign bytes at D005F8/D00603. It first initializes missing descriptor fields via helper calls when D005FA, D00605, D005F9, or D00604 are zero.

Carry is clear when the two descriptor records compare as compatible: if D00603 is negative, D00604 must be at least D005F9 and the remaining compared bytes must match; if D00603 is non-negative, bit 7 must be clear and the seven bytes at D00605 and D005FA must match. Carry is set on the failing compare path: CP (HL) at 0x07F865 can return NZ, or SUB (HL) at 0x07F879 / SUB 0x01 at 0x07F881 can leave carry set when the D00604/D005F9 ordering check underflows.

## 0x044A40-0x044B60 hexdump
0x044A40  0D FA 07 23 23 CD 78 F9 07 FD CB 14 EE CD 2F 51
0x044A50  04 FD CB 14 AE CD 46 FA 07 CD 49 53 04 C4 A8 53
0x044A60  04 CD C2 4F 04 C3 9D 49 04 CD 32 C7 06 C2 3F 4D
0x044A70  04 21 69 1E D0 CD E6 4C 04 CD F5 52 04 CD 2A 53
0x044A80  04 3E FF 32 03 06 D0 CD 57 53 04 28 06 CD C2 29
0x044A90  08 18 08 FD CB 04 4E C2 1F 4B 04 CD C2 29 08 CD
0x044AA0  19 50 04 CD 9E 52 04 FD CB 03 EE CD 49 53 04 C4
0x044AB0  74 F2 06 FD CB 18 B6 21 CE 24 D0 CD 2E 4F 04 CD
0x044AC0  9B 53 04 CD 2D 50 04 CD 57 53 04 28 12 CD AC F8
0x044AD0  07 CD E9 16 0B CD 14 F9 07 CD 5C 53 04 18 2A CD
0x044AE0  44 53 04 28 0C CD 3D 2B 08 CD 08 2B 08 FD CB 03
0x044AF0  AE FD CB 14 EE CD 16 51 04 FD CB 14 AE CD 46 FA
0x044B00  07 CD 49 53 04 C4 A8 53 04 CD C2 4F 04 CD 0A 50
0x044B10  04 CD 17 52 04 30 A8 CD 8A 50 04 30 82 18 84 21
0x044B20  01 00 00 40 22 70 25 FD CB 03 EE CD EC 4F 04 20
0x044B30  39 CD 17 52 04 38 0E CD 46 FA 07 CD 49 53 04 C4
0x044B40  A8 53 04 18 E6 ED 5B 6D 25 D0 21 12 00 00 19 CD
0x044B50  90 F7 07 22 8D 25 D0 CD 49 53 04 C4 74 F2 06 FD

## 0x044A6E table
0x044A6E is not the start of a 3-byte pointer-entry table in this ROM image. It is the first byte of the 24-bit operand for the instruction at 0x044A6D: C2 3F 4D 04, decoded as JP NZ,0x044D3F. Interpreting 0x044A6E as packed pointers produces immediate garbage after entry 0 because the following bytes are executable code.

Misaligned 3-byte interpretation from 0x044A6E, shown to reject the table hypothesis:
00: 0x044A6E -> 0x044D3F
01: 0x044A71 -> 0x1E6921
02: 0x044A74 -> 0xE6CDD0
03: 0x044A77 -> 0xCD044C
04: 0x044A7A -> 0x0452F5
05: 0x044A7D -> 0x532ACD
06: 0x044A80 -> 0xFF3E04
07: 0x044A83 -> 0x060332
08: 0x044A86 -> 0x57CDD0
09: 0x044A89 -> 0x280453
10: 0x044A8C -> 0xC2CD06
11: 0x044A8F -> 0x180829
12: 0x044A92 -> 0xCBFD08
13: 0x044A95 -> 0xC24E04
14: 0x044A98 -> 0x044B1F
15: 0x044A9B -> 0x29C2CD
16: 0x044A9E -> 0x19CD08
17: 0x044AA1 -> 0xCD0450
18: 0x044AA4 -> 0x04529E
19: 0x044AA7 -> 0x03CBFD
20: 0x044AAA -> 0x49CDEE
21: 0x044AAD -> 0xC40453
22: 0x044AB0 -> 0x06F274
23: 0x044AB3 -> 0x18CBFD
24: 0x044AB6 -> 0xCE21B6
25: 0x044AB9 -> 0xCDD024
26: 0x044ABC -> 0x044F2E
27: 0x044ABF -> 0x539BCD
28: 0x044AC2 -> 0x2DCD04
29: 0x044AC5 -> 0xCD0450
30: 0x044AC8 -> 0x045357
31: 0x044ACB -> 0xCD1228
32: 0x044ACE -> 0x07F8AC
33: 0x044AD1 -> 0x16E9CD
34: 0x044AD4 -> 0x14CD0B
35: 0x044AD7 -> 0xCD07F9
36: 0x044ADA -> 0x04535C
37: 0x044ADD -> 0xCD2A18
38: 0x044AE0 -> 0x045344
39: 0x044AE3 -> 0xCD0C28

Decoded instructions covering the same region:
0x044A69  CD 32 C7 06     CALL 0x06C732
0x044A6D  C2 3F 4D 04     JP NZ,0x044D3F
0x044A71  21 69 1E D0     LD HL,0xD01E69
0x044A75  CD E6 4C 04     CALL 0x044CE6
0x044A79  CD F5 52 04     CALL 0x0452F5
0x044A7D  CD 2A 53 04     CALL 0x04532A
0x044A81  3E FF           LD A,0xFF
0x044A83  32 03 06 D0     LD (0xD00603),A
0x044A87  CD 57 53 04     CALL 0x045357
0x044A8B  28 06           JR Z,0x044A93
0x044A8D  CD C2 29 08     CALL 0x0829C2
0x044A91  18 08           JR 0x044A9B
0x044A93  FD CB 04 4E     indexed-cb-bit {"pc":281235,"length":4,"nextPc":281239,"tag":"indexed-cb-bit","bit":1,"indexRegister":"iy","displacement":4,"mode":"adl","modePrefix":null}
0x044A97  C2 1F 4B 04     JP NZ,0x044B1F
0x044A9B  CD C2 29 08     CALL 0x0829C2
0x044A9F  CD 19 50 04     CALL 0x045019
0x044AA3  CD 9E 52 04     CALL 0x04529E
0x044AA7  FD CB 03 EE     SET 5,(IY+3)
0x044AAB  CD 49 53 04     CALL 0x045349
0x044AAF  C4 74 F2 06     CALL NZ,0x06F274
0x044AB3  FD CB 18 B6     RES 6,(IY+24)
0x044AB7  21 CE 24 D0     LD HL,0xD024CE
0x044ABB  CD 2E 4F 04     CALL 0x044F2E
0x044ABF  CD 9B 53 04     CALL 0x04539B
0x044AC3  CD 2D 50 04     CALL 0x04502D
0x044AC7  CD 57 53 04     CALL 0x045357
0x044ACB  28 12           JR Z,0x044ADF
0x044ACD  CD AC F8 07     CALL 0x07F8AC
0x044AD1  CD E9 16 0B     CALL 0x0B16E9
0x044AD5  CD 14 F9 07     CALL 0x07F914
0x044AD9  CD 5C 53 04     CALL 0x04535C
0x044ADD  18 2A           JR 0x044B09
0x044ADF  CD 44 53 04     CALL 0x045344
0x044AE3  28 0C           JR Z,0x044AF1
0x044AE5  CD 3D 2B 08     CALL 0x082B3D
0x044AE9  CD 08 2B 08     CALL 0x082B08
0x044AED  FD CB 03 AE     RES 5,(IY+3)
0x044AF1  FD CB 14 EE     SET 5,(IY+20)
0x044AF5  CD 16 51 04     CALL 0x045116
0x044AF9  FD CB 14 AE     RES 5,(IY+20)

## refs to 0x044A6E
- none

## refs to 0x044D3F
- hit 0x044A6E
  0x044A6A  32 C7 06 C2     LD (0xC206C7),A
  0x044A6E  3F              CCF
  0x044A6F  4D              LD C,L
  0x044A70  04              INC B
  0x044A71  21 69 1E D0     LD HL,0xD01E69
  0x044A75  CD E6 4C 04     CALL 0x044CE6

## Plausible normal caller chain
The static byte search found no whole-ROM little-endian references to 0x044A6E, which supports the finding that it is not a separately indexed table base. The only 0x044D3F little-endian hit is at 0x044A6E as the operand of JP NZ,0x044D3F at 0x044A6D. The most plausible real caller chain is therefore direct code flow into 0x044A69, CALL 0x06C732, then conditional branch JP NZ,0x044D3F; the normal path reaches the populator when the 0x06C732 predicate returns NZ.
