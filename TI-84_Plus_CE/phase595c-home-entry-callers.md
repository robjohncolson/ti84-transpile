# Phase595c home entry callers

ROM: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ROM.rom

## 0x044940-0x044A75 ADL disassembly
0x044940  CD FA F8 07     CALL 0x07F8FA
0x044944  CD 14 2B 08     CALL 0x082B14
0x044948  2A ED 1F D0     LD HL,(0xD01FED)
0x04494C  CD FB F9 07     CALL 0x07F9FB
0x044950  F1              POP AF
0x044951  20 06           JR NZ,0x044959
0x044953  21 F8 05 D0     LD HL,0xD005F8
0x044957  CB F6           bit-set-ind {"pc":280919,"length":2,"nextPc":280921,"tag":"bit-set-ind","bit":6,"indirectRegister":"hl","mode":"adl","modePrefix":null}
0x044959  CD 3D 2B 08     CALL 0x082B3D
0x04495D  FD CB 14 EE     indexed-cb-set {"pc":280925,"length":4,"nextPc":280929,"tag":"indexed-cb-set","bit":5,"indexRegister":"iy","displacement":20,"mode":"adl","modePrefix":null}
0x044961  CD 2F 51 04     CALL 0x04512F
0x044965  FD CB 14 AE     indexed-cb-res {"pc":280933,"length":4,"nextPc":280937,"tag":"indexed-cb-res","bit":5,"indexRegister":"iy","displacement":20,"mode":"adl","modePrefix":null}
0x044969  CD 46 FA 07     CALL 0x07FA46
0x04496D  CD 49 53 04     CALL 0x045349
0x044971  C4 A8 53 04     CALL NZ,0x0453A8
0x044975  CD C2 4F 04     CALL 0x044FC2
0x044979  CD 0A 50 04     CALL 0x04500A
0x04497D  CD 1D 52 04     CALL 0x04521D
0x044981  D2 E8 48 04     JP NC,0x0448E8
0x044985  CD 8A 50 04     CALL 0x04508A
0x044989  D2 C2 48 04     JP NC,0x0448C2
0x04498D  C3 C6 48 04     JP 0x0448C6  ; HARD BOUNDARY JP 0xC3, next=0x044991
0x044991  21 01 00 00     LD HL,0x01
0x044995  40 22 70 25     LD HL,(0x002570)
0x044999  FD CB 03 EE     indexed-cb-set {"pc":280985,"length":4,"nextPc":280989,"tag":"indexed-cb-set","bit":5,"indexRegister":"iy","displacement":3,"mode":"adl","modePrefix":null}
0x04499D  CD EC 4F 04     CALL 0x044FEC
0x0449A1  20 2B           JR NZ,0x0449CE
0x0449A3  CD 1D 52 04     CALL 0x04521D
0x0449A7  30 F4           JR NC,0x04499D
0x0449A9  ED 5B 6D 25 D0  LD DE,(0xD0256D)
0x0449AE  21 12 00 00     LD HL,0x12
0x0449B2  19              add-pair {"pc":281010,"length":1,"nextPc":281011,"tag":"add-pair","dest":"hl","src":"de","mode":"adl","modePrefix":null}
0x0449B3  CD 90 F7 07     CALL 0x07F790
0x0449B7  22 8D 25 D0     LD HL,(0xD0258D)
0x0449BB  CD 49 53 04     CALL 0x045349
0x0449BF  C4 74 F2 06     CALL NZ,0x06F274
0x0449C3  FD CB 18 B6     indexed-cb-res {"pc":281027,"length":4,"nextPc":281031,"tag":"indexed-cb-res","bit":6,"indexRegister":"iy","displacement":24,"mode":"adl","modePrefix":null}
0x0449C7  40 2A 70 25     LD HL,(0x002570)
0x0449CB  23              INC HL
0x0449CC  18 C7           JR 0x044995
0x0449CE  21 C8 24 D0     LD HL,0xD024C8
0x0449D2  CD 2E 4F 04     CALL 0x044F2E
0x0449D6  3A 71 14 D0     LD A,(0xD01471)
0x0449DA  3D              DEC A
0x0449DB  20 08           JR NZ,0x0449E5
0x0449DD  CD 44 53 04     CALL 0x045344
0x0449E1  C4 B4 52 04     CALL NZ,0x0452B4
0x0449E5  CD 9B 53 04     CALL 0x04539B
0x0449E9  CD 44 53 04     CALL 0x045344
0x0449ED  C4 61 29 08     CALL NZ,0x082961
0x0449F1  CD CC 50 04     CALL 0x0450CC
0x0449F5  CD E0 C4 09     CALL 0x09C4E0
0x0449F9  F5              PUSH AF
0x0449FA  CD F7 1D 09     CALL 0x091DF7
0x0449FE  CD C7 00 08     CALL 0x0800C7
0x044A02  CD 74 98 09     CALL 0x099874
0x044A06  CD 44 53 04     CALL 0x045344
0x044A0A  C4 61 29 08     CALL NZ,0x082961
0x044A0E  CD BE 50 04     CALL 0x0450BE
0x044A12  3A 71 14 D0     LD A,(0xD01471)
0x044A16  3D              DEC A
0x044A17  87              ADD A
0x044A18  11 0E 06 D0     LD DE,0xD0060E
0x044A1C  CD DB 50 04     CALL 0x0450DB
0x044A20  D5              PUSH DE
0x044A21  11 19 06 D0     LD DE,0xD00619
0x044A25  CD 78 F9 07     CALL 0x07F978
0x044A29  CD FA F8 07     CALL 0x07F8FA
0x044A2D  2A ED 1F D0     LD HL,(0xD01FED)
0x044A31  CD FB F9 07     CALL 0x07F9FB
0x044A35  D1              POP DE
0x044A36  F1              POP AF
0x044A37  20 06           JR NZ,0x044A3F
0x044A39  21 F8 05 D0     LD HL,0xD005F8
0x044A3D  CB F6           bit-set-ind {"pc":281149,"length":2,"nextPc":281151,"tag":"bit-set-ind","bit":6,"indirectRegister":"hl","mode":"adl","modePrefix":null}
0x044A3F  CD 0D FA 07     CALL 0x07FA0D
0x044A43  23              INC HL
0x044A44  23              INC HL
0x044A45  CD 78 F9 07     CALL 0x07F978
0x044A49  FD CB 14 EE     indexed-cb-set {"pc":281161,"length":4,"nextPc":281165,"tag":"indexed-cb-set","bit":5,"indexRegister":"iy","displacement":20,"mode":"adl","modePrefix":null}
0x044A4D  CD 2F 51 04     CALL 0x04512F
0x044A51  FD CB 14 AE     indexed-cb-res {"pc":281169,"length":4,"nextPc":281173,"tag":"indexed-cb-res","bit":5,"indexRegister":"iy","displacement":20,"mode":"adl","modePrefix":null}
0x044A55  CD 46 FA 07     CALL 0x07FA46
0x044A59  CD 49 53 04     CALL 0x045349
0x044A5D  C4 A8 53 04     CALL NZ,0x0453A8
0x044A61  CD C2 4F 04     CALL 0x044FC2
0x044A65  C3 9D 49 04     JP 0x04499D  ; HARD BOUNDARY JP 0xC3, next=0x044A69
0x044A69  CD 32 C7 06     CALL 0x06C732
0x044A6D  C2 3F 4D 04     JP NZ,0x044D3F
0x044A71  21 69 1E D0     LD HL,0xD01E69

## Candidate function entries
Last hard boundary before 0x044A69: 0x044A65 JP 0x04499D.
Inferred containing-function entry for 0x044A69: 0x044A69.
- 0x044940
- 0x044991
- 0x044A69 (entry after last hard boundary)
- 0x044A69 (included as explicit scan target)

## Whole-ROM references to 0x044940
Pattern: 40 49 04; hits=0
- none

## Whole-ROM references to 0x044991
Pattern: 91 49 04; hits=1
- hit 0x0448B7: JP operand via 0x0448B6 JP NZ,0x044991
  0x0448B3  CB 04           rotate-reg {"pc":280755,"length":2,"nextPc":280757,"tag":"rotate-reg","op":"rlc","reg":"h","mode":"adl","modePrefix":null}
  0x0448B5  4E              LD C,(HL)
  0x0448B6  C2 91 49 04     JP NZ,0x044991
  0x0448BA  CD 61 29 08     CALL 0x082961
  0x0448BE  CD 61 29 08     CALL 0x082961

## Whole-ROM references to 0x044A69
Pattern: 69 4A 04; hits=1
- hit 0x044891: JP operand via 0x044890 JP Z,0x044A69
  0x04488D  37              SCF
  0x04488E  C7              rst {"pc":280718,"length":1,"nextPc":280719,"tag":"rst","target":0,"fallthrough":280719,"terminates":true,"mode":"adl","modePrefix":null}
  0x04488F  06 CA           LD B,0xCA
  0x044891  69              LD L,C
  0x044892  4A              LD C,D
  0x044893  04              INC B
  0x044894  21 84 1E D0     LD HL,0xD01E84
  0x044898  CD E6 4C 04     CALL 0x044CE6

## References to known context 0x058241 and 0x044D3F
### 0x058241 hits=3
- hit 0x0620C5: CALL operand via 0x0620C4 CALL 0x058241
  0x0620C1  E0              RET PO
  0x0620C2  07              rlca {"pc":401602,"length":1,"nextPc":401603,"tag":"rlca","mode":"adl","modePrefix":null}
  0x0620C3  D0              RET NC
  0x0620C4  CD 41 82 05     CALL 0x058241
  0x0620C8  C3 3D C3 08     JP 0x08C33D
  0x0620CC  47              LD B,A
- hit 0x08C8D0: LD operand via 0x08C8CF LD HL,0x058241
  0x08C8CC  E0              RET PO
  0x08C8CD  07              rlca {"pc":575693,"length":1,"nextPc":575694,"tag":"rlca","mode":"adl","modePrefix":null}
  0x08C8CE  D0              RET NC
  0x08C8CF  21 41 82 05     LD HL,0x058241
  0x08C8D3  FD 7E 12        ld-reg-ixd {"pc":575699,"length":3,"nextPc":575702,"tag":"ld-reg-ixd","dest":"a","indexRegister":"iy","displacement":18,"mode":"adl","modePrefix":null}
  0x08C8D6  F5              PUSH AF
  0x08C8D7  3E 40           LD A,0x40
- hit 0x08C958: data
  0x08C954  19              add-pair {"pc":575828,"length":1,"nextPc":575829,"tag":"add-pair","dest":"hl","src":"de","mode":"adl","modePrefix":null}
  0x08C955  ED 27           ld-pair-ind {"pc":575829,"length":2,"nextPc":575831,"tag":"ld-pair-ind","pair":"hl","src":"hl","mode":"adl","modePrefix":null}
  0x08C957  C9              RET
  0x08C958  41              LD B,C
  0x08C959  82              ADD D
  0x08C95A  05              DEC B
  0x08C95B  55              LD D,L
  0x08C95C  D7              rst {"pc":575836,"length":1,"nextPc":575837,"tag":"rst","target":16,"fallthrough":575837,"terminates":true,"mode":"adl","modePrefix":null}
  0x08C95D  03              INC BC
  0x08C95E  A7              AND A
  0x08C95F  0C              INC C

### 0x044D3F hits=1
- hit 0x044A6E: JP operand via 0x044A6D JP NZ,0x044D3F
  0x044A6A  32 C7 06 C2     LD (0xC206C7),A
  0x044A6E  3F              CCF
  0x044A6F  4D              LD C,L
  0x044A70  04              INC B
  0x044A71  21 69 1E D0     LD HL,0xD01E69
  0x044A75  CD E6 4C 04     CALL 0x044CE6

## 0x058241-0x0582D0 ADL disassembly
0x058241  21 00 00 00     LD HL,0x00
0x058245  40 22 AC 26     LD HL,(0x0026AC)
0x058249  FD CB 52 BE     indexed-cb-res {"pc":361033,"length":4,"nextPc":361037,"tag":"indexed-cb-res","bit":7,"indexRegister":"iy","displacement":82,"mode":"adl","modePrefix":null}
0x05824D  3E 03           LD A,0x03
0x05824F  FD CB 34 66     indexed-cb-bit {"pc":361039,"length":4,"nextPc":361043,"tag":"indexed-cb-bit","bit":4,"indexRegister":"iy","displacement":52,"mode":"adl","modePrefix":null}
0x058253  C4 B3 39 02     CALL NZ,0x0239B3
0x058257  C0              RET NZ
0x058258  FD CB 29 56     indexed-cb-bit {"pc":361048,"length":4,"nextPc":361052,"tag":"indexed-cb-bit","bit":2,"indexRegister":"iy","displacement":41,"mode":"adl","modePrefix":null}
0x05825C  28 04           JR Z,0x058262
0x05825E  CD 18 38 02     CALL 0x023818
0x058262  FD 7E 3C        ld-reg-ixd {"pc":361058,"length":3,"nextPc":361061,"tag":"ld-reg-ixd","dest":"a","indexRegister":"iy","displacement":60,"mode":"adl","modePrefix":null}
0x058265  E6 F4           AND 0xF4
0x058267  FD 77 3C        ld-ixd-reg {"pc":361063,"length":3,"nextPc":361066,"tag":"ld-ixd-reg","indexRegister":"iy","displacement":60,"src":"a","mode":"adl","modePrefix":null}
0x05826A  FD CB 14 BE     indexed-cb-res {"pc":361066,"length":4,"nextPc":361070,"tag":"indexed-cb-res","bit":7,"indexRegister":"iy","displacement":20,"mode":"adl","modePrefix":null}
0x05826E  CD C2 00 08     CALL 0x0800C2
0x058272  CD A3 8B 05     CALL 0x058BA3
0x058276  32 5B 26 D0     LD (0xD0265B),A
0x05827A  32 06 25 D0     LD (0xD02506),A
0x05827E  CD 22 82 05     CALL 0x058222
0x058282  FD CB 1C 76     indexed-cb-bit {"pc":361090,"length":4,"nextPc":361094,"tag":"indexed-cb-bit","bit":6,"indexRegister":"iy","displacement":28,"mode":"adl","modePrefix":null}
0x058286  C2 2C 8A 05     JP NZ,0x058A2C
0x05828A  FD CB 09 7E     indexed-cb-bit {"pc":361098,"length":4,"nextPc":361102,"tag":"indexed-cb-bit","bit":7,"indexRegister":"iy","displacement":9,"mode":"adl","modePrefix":null}
0x05828E  C0              RET NZ
0x05828F  FD CB 45 BE     indexed-cb-res {"pc":361103,"length":4,"nextPc":361107,"tag":"indexed-cb-res","bit":7,"indexRegister":"iy","displacement":69,"mode":"adl","modePrefix":null}
0x058293  FD CB 0C 7E     indexed-cb-bit {"pc":361107,"length":4,"nextPc":361111,"tag":"indexed-cb-bit","bit":7,"indexRegister":"iy","displacement":12,"mode":"adl","modePrefix":null}
0x058297  C2 83 84 05     JP NZ,0x058483
0x05829B  FD CB 0C 76     indexed-cb-bit {"pc":361115,"length":4,"nextPc":361119,"tag":"indexed-cb-bit","bit":6,"indexRegister":"iy","displacement":12,"mode":"adl","modePrefix":null}
0x05829F  C0              RET NZ
0x0582A0  FD CB 09 86     indexed-cb-res {"pc":361120,"length":4,"nextPc":361124,"tag":"indexed-cb-res","bit":0,"indexRegister":"iy","displacement":9,"mode":"adl","modePrefix":null}
0x0582A4  FD CB 08 8E     indexed-cb-res {"pc":361124,"length":4,"nextPc":361128,"tag":"indexed-cb-res","bit":1,"indexRegister":"iy","displacement":8,"mode":"adl","modePrefix":null}
0x0582A8  CD AA DC 09     CALL 0x09DCAA
0x0582AC  CD 23 36 08     CALL 0x083623
0x0582B0  CD 64 37 08     CALL 0x083764
0x0582B4  CD 49 8D 05     CALL 0x058D49
0x0582B8  CD 22 BF 08     CALL 0x08BF22
0x0582BC  FD CB 4A A6     indexed-cb-res {"pc":361148,"length":4,"nextPc":361152,"tag":"indexed-cb-res","bit":4,"indexRegister":"iy","displacement":74,"mode":"adl","modePrefix":null}
0x0582C0  FD CB 05 9E     indexed-cb-res {"pc":361152,"length":4,"nextPc":361156,"tag":"indexed-cb-res","bit":3,"indexRegister":"iy","displacement":5,"mode":"adl","modePrefix":null}
0x0582C4  FD CB 47 8E     indexed-cb-res {"pc":361156,"length":4,"nextPc":361160,"tag":"indexed-cb-res","bit":1,"indexRegister":"iy","displacement":71,"mode":"adl","modePrefix":null}
0x0582C8  FD CB 49 B6     indexed-cb-res {"pc":361160,"length":4,"nextPc":361164,"tag":"indexed-cb-res","bit":6,"indexRegister":"iy","displacement":73,"mode":"adl","modePrefix":null}
0x0582CC  FD CB 25 AE     indexed-cb-res {"pc":361164,"length":4,"nextPc":361168,"tag":"indexed-cb-res","bit":5,"indexRegister":"iy","displacement":37,"mode":"adl","modePrefix":null}

### CALL/JP/JR targets in cxMain pre-handler window
- 0x058253 call-conditional: 0x0239B3 (CALL NZ,0x0239B3)
- 0x05825C jr-conditional: 0x058262 (JR Z,0x058262)
- 0x05825E call: 0x023818 (CALL 0x023818)
- 0x05826E call: 0x0800C2 (CALL 0x0800C2)
- 0x058272 call: 0x058BA3 (CALL 0x058BA3)
- 0x05827E call: 0x058222 (CALL 0x058222)
- 0x058286 jp-conditional: 0x058A2C (JP NZ,0x058A2C)
- 0x058297 jp-conditional: 0x058483 (JP NZ,0x058483)
- 0x0582A8 call: 0x09DCAA (CALL 0x09DCAA)
- 0x0582AC call: 0x083623 (CALL 0x083623)
- 0x0582B0 call: 0x083764 (CALL 0x083764)
- 0x0582B4 call: 0x058D49 (CALL 0x058D49)
- 0x0582B8 call: 0x08BF22 (CALL 0x08BF22)

## Conclusion
Function entry containing 0x044A69: 0x044A69.
Direct code references to 0x044A69:
- 0x044890 JP operand: JP Z,0x044A69

Direct code references to 0x044A69:
- 0x044890 JP operand: JP Z,0x044A69

The 0x058241-0x0582D0 window has no direct CALL/JP/JR target in the 0x044Axx region. The plausible static chain remains known driveable entry 0x058241 / CoorMon 0x08BF22 / event-loop dispatch into an indirect or table-driven path, then straight-line execution through 0x044A69 to 0x044A69 and conditional JP NZ,0x044D3F.
