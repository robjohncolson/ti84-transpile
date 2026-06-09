# Phase596 cxMain home launcher static probe

ROM: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ROM.rom

## Job 1: 0x044800-0x0448D0 ADL disassembly
0x044800  07                rlca {"pc":280576,"length":1,"nextPc":280577,"tag":"rlca","mode":"adl","modePrefix":null}
0x044801  11 09 00 00       LD DE,0x09
0x044805  19                add-pair {"pc":280581,"length":1,"nextPc":280582,"tag":"add-pair","dest":"hl","src":"de","mode":"adl","modePrefix":null}
0x044806  22 8D 25 D0       LD (0xD0258D),HL
0x04480A  CD 49 53 04       CALL 0x045349
0x04480E  C4 74 F2 06       CALL NZ,0x06F274
0x044812  FD CB 18 B6       indexed-cb-res {"pc":280594,"length":4,"nextPc":280598,"tag":"indexed-cb-res","bit":6,"indexRegister":"iy","displacement":24,"mode":"adl","modePrefix":null}
0x044816  3E 07             LD A,0x07
0x044818  CD 4E 53 04       CALL 0x04534E
0x04481C  40 2A 70 25       LD HL,(0x002570)
0x044820  23                INC HL
0x044821  18 97             JR 0x0447BA
0x044823  3E 03             LD A,0x03
0x044825  CD 4E 53 04       CALL 0x04534E
0x044829  3A 71 14 D0       LD A,(0xD01471)
0x04482D  3D                DEC A
0x04482E  20 10             JR NZ,0x044840
0x044830  3A 26 23 D0       LD A,(0xD02326)
0x044834  32 27 23 D0       LD (0xD02327),A
0x044838  CD 44 53 04       CALL 0x045344
0x04483C  C4 CA 52 04       CALL NZ,0x0452CA
0x044840  CD 2A 4F 04       CALL 0x044F2A
0x044844  CD 9B 53 04       CALL 0x04539B
0x044848  CD 44 53 04       CALL 0x045344
0x04484C  C4 61 29 08       CALL NZ,0x082961
0x044850  CD BE 50 04       CALL 0x0450BE
0x044854  CD D3 50 04       CALL 0x0450D3
0x044858  CD 0D FA 07       CALL 0x07FA0D
0x04485C  CD A2 50 04       CALL 0x0450A2
0x044860  11 0E 06 D0       LD DE,0xD0060E
0x044864  CD 78 F9 07       CALL 0x07F978
0x044868  CD FA F8 07       CALL 0x07F8FA
0x04486C  2A F9 1F D0       LD HL,(0xD01FF9)
0x044870  CD FB F9 07       CALL 0x07F9FB
0x044874  FD CB 14 EE       indexed-cb-set {"pc":280692,"length":4,"nextPc":280696,"tag":"indexed-cb-set","bit":5,"indexRegister":"iy","displacement":20,"mode":"adl","modePrefix":null}
0x044878  FD CB 40 FE       indexed-cb-set {"pc":280696,"length":4,"nextPc":280700,"tag":"indexed-cb-set","bit":7,"indexRegister":"iy","displacement":64,"mode":"adl","modePrefix":null}
0x04487C  CD 2F 51 04       CALL 0x04512F
0x044880  FD CB 14 AE       indexed-cb-res {"pc":280704,"length":4,"nextPc":280708,"tag":"indexed-cb-res","bit":5,"indexRegister":"iy","displacement":20,"mode":"adl","modePrefix":null}
0x044884  CD C2 4F 04       CALL 0x044FC2
0x044888  C3 CA 47 04       JP 0x0447CA  ; hard boundary
0x04488C  CD 37 C7 06       CALL 0x06C737
0x044890  CA 69 4A 04       JP Z,0x044A69  ; JP Z,home-entry site
0x044894  21 84 1E D0       LD HL,0xD01E84
0x044898  CD E6 4C 04       CALL 0x044CE6
0x04489C  CD F5 52 04       CALL 0x0452F5
0x0448A0  3E FF             LD A,0xFF
0x0448A2  32 03 06 D0       LD (0xD00603),A
0x0448A6  CD 57 53 04       CALL 0x045357
0x0448AA  28 06             JR Z,0x0448B2
0x0448AC  CD C2 29 08       CALL 0x0829C2
0x0448B0  18 08             JR 0x0448BA
0x0448B2  FD CB 04 4E       indexed-cb-bit {"pc":280754,"length":4,"nextPc":280758,"tag":"indexed-cb-bit","bit":1,"indexRegister":"iy","displacement":4,"mode":"adl","modePrefix":null}
0x0448B6  C2 91 49 04       JP NZ,0x044991
0x0448BA  CD 61 29 08       CALL 0x082961
0x0448BE  CD 61 29 08       CALL 0x082961
0x0448C2  CD 19 50 04       CALL 0x045019
0x0448C6  CD B4 52 04       CALL 0x0452B4
0x0448CA  CD 57 53 04       CALL 0x045357
0x0448CE  20 18             JR NZ,0x0448E8

Hard boundary before 0x044890: 0x044888 JP 0x0447CA; next=0x04488C
Hard boundary after 0x044890: none in window
Containing-function entry inferred for 0x044890: 0x04488C

### Candidate entries and whole-ROM references
#### 0x044800 refs=0 codeRefs=0
- none
#### 0x04488C refs=1 codeRefs=1
- hit 0x04461F: JP operand via 0x04461E JP Z,0x04488C
  0x044619  04                INC B
  0x04461A  CD 3C C7 06       CALL 0x06C73C
  0x04461E  CA 8C 48 04       JP Z,0x04488C
  0x044622  CD 0F 53 04       CALL 0x04530F
  0x044626  CD 61 29 08       CALL 0x082961

## Job 2: D007CA cxMain writer scan
### 0x05CC31 LD (D007CA),HL
Stored value: HL=0x05CD71 from 0x05CC2D LD HL,0x05CD71
0x05CC21  FE 1F             CP 0x1F
0x05CC23  28 08             JR Z,0x05CC2D
0x05CC25  FE 5A             CP 0x5A
0x05CC27  38 E0             JR C,0x05CC09
0x05CC29  C3 31 C6 08       JP 0x08C631
0x05CC2D  21 71 CD 05       LD HL,0x05CD71
0x05CC31  22 CA 07 D0       LD (0xD007CA),HL
0x05CC35  CD D6 74 08       CALL 0x0874D6
### 0x0601B4 LD (D007CA),HL
Stored value: HL=0x05FFEF from 0x0601B0 LD HL,0x05FFEF
0x0601A4  B3                OR E
0x0601A5  FF                rst {"pc":393637,"length":1,"nextPc":393638,"tag":"rst","target":56,"fallthrough":393638,"terminates":true,"mode":"adl","modePrefix":null}
0x0601A6  05                DEC B
0x0601A7  CD 82 C7 08       CALL 0x08C782
0x0601AB  CD 34 14 06       CALL 0x061434
0x0601AF  C0                RET NZ
0x0601B0  21 EF FF 05       LD HL,0x05FFEF
0x0601B4  22 CA 07 D0       LD (0xD007CA),HL
0x0601B8  C9                RET
0x0601B9  CD A3 01 06       CALL 0x0601A3
### 0x06B432 LD (D007CA),HL
Stored value: HL=0x06B4E8 from 0x06B42E LD HL,0x06B4E8
0x06B422  FE 1F             CP 0x1F
0x06B424  20 BC             JR NZ,0x06B3E2
0x06B426  CD D6 74 08       CALL 0x0874D6
0x06B42A  32 1C 08 D0       LD (0xD0081C),A
0x06B42E  21 E8 B4 06       LD HL,0x06B4E8
0x06B432  22 CA 07 D0       LD (0xD007CA),HL
0x06B436  3E 05             LD A,0x05
0x06B438  32 13 08 D0       LD (0xD00813),A
### 0x080EB7 LD (D007CA),HL
Stored value: HL=0x080FB7 from 0x080EB3 LD HL,0x080FB7
0x080EA7  3F                CCF
0x080EA8  19                add-pair {"pc":528040,"length":1,"nextPc":528041,"tag":"add-pair","dest":"hl","src":"de","mode":"adl","modePrefix":null}
0x080EA9  08                ex-af {"pc":528041,"length":1,"nextPc":528042,"tag":"ex-af","mode":"adl","modePrefix":null}
0x080EAA  FD CB 0C A6       indexed-cb-res {"pc":528042,"length":4,"nextPc":528046,"tag":"indexed-cb-res","bit":4,"indexRegister":"iy","displacement":12,"mode":"adl","modePrefix":null}
0x080EAE  97                SUB A
0x080EAF  32 95 05 D0       LD (0xD00595),A
0x080EB3  21 B7 0F 08       LD HL,0x080FB7
0x080EB7  22 CA 07 D0       LD (0xD007CA),HL
0x080EBB  21 A7 0D 08       LD HL,0x080DA7
### 0x081018 LD (D007CA),HL
Stored value: HL=0x0810E8 from 0x081014 LD HL,0x0810E8
0x081008  CD 20 1E 06       CALL 0x061E20
0x08100C  CD 47 19 08       CALL 0x081947
0x081010  CD 6B 13 08       CALL 0x08136B
0x081014  21 E8 10 08       LD HL,0x0810E8
0x081018  22 CA 07 D0       LD (0xD007CA),HL
0x08101C  21 29 10 08       LD HL,0x081029
### 0x081100 LD (D007CA),HL
Stored value: HL=0x08149F from 0x0810FC LD HL,0x08149F
0x0810F0  D0                RET NC
0x0810F1  0A                LD A,(BC)
0x0810F2  FD CB 0C A6       indexed-cb-res {"pc":528626,"length":4,"nextPc":528630,"tag":"indexed-cb-res","bit":4,"indexRegister":"iy","displacement":12,"mode":"adl","modePrefix":null}
0x0810F6  3E 09             LD A,0x09
0x0810F8  32 95 05 D0       LD (0xD00595),A
0x0810FC  21 9F 14 08       LD HL,0x08149F
0x081100  22 CA 07 D0       LD (0xD007CA),HL
0x081104  21 A5 CA 0A       LD HL,0x0ACAA5
### 0x0813E0 LD (D007CA),HL
Stored value: HL=0x08149F from 0x0813DC LD HL,0x08149F
0x0813D0  D8                RET C
0x0813D1  FD CB 0C A6       indexed-cb-res {"pc":529361,"length":4,"nextPc":529365,"tag":"indexed-cb-res","bit":4,"indexRegister":"iy","displacement":12,"mode":"adl","modePrefix":null}
0x0813D5  F5                PUSH AF
0x0813D6  3E 09             LD A,0x09
0x0813D8  32 95 05 D0       LD (0xD00595),A
0x0813DC  21 9F 14 08       LD HL,0x08149F
0x0813E0  22 CA 07 D0       LD (0xD007CA),HL
0x0813E4  21 A5 CA 0A       LD HL,0x0ACAA5
### 0x09D327 LD (D007CA),HL
Stored value: HL=0x09D32D from 0x09D323 LD HL,0x09D32D
0x09D317  E6 CD             AND 0xCD
0x09D319  F9                ld-sp-hl {"pc":643865,"length":1,"nextPc":643866,"tag":"ld-sp-hl","mode":"adl","modePrefix":null}
0x09D31A  FB                ei {"pc":643866,"length":1,"nextPc":643867,"tag":"ei","mode":"adl","modePrefix":null}
0x09D31B  03                INC BC
0x09D31C  78                LD A,B
0x09D31D  CD 30 E6 05       CALL 0x05E630
0x09D321  B7                OR A
0x09D322  C9                RET
0x09D323  21 2D D3 09       LD HL,0x09D32D
0x09D327  22 CA 07 D0       LD (0xD007CA),HL
0x09D32B  18 E3             JR 0x09D310
0x09D32D  FD CB 16 7E       indexed-cb-bit {"pc":643885,"length":4,"nextPc":643889,"tag":"indexed-cb-bit","bit":7,"indexRegister":"iy","displacement":22,"mode":"adl","modePrefix":null}
### 0x09D33D LD (D007CA),HL
Stored value: HL=0x09D22C from 0x09D339 LD HL,0x09D22C
0x09D32D  FD CB 16 7E       indexed-cb-bit {"pc":643885,"length":4,"nextPc":643889,"tag":"indexed-cb-bit","bit":7,"indexRegister":"iy","displacement":22,"mode":"adl","modePrefix":null}
0x09D331  20 18             JR NZ,0x09D34B
0x09D333  FD CB 1D 4E       indexed-cb-bit {"pc":643891,"length":4,"nextPc":643895,"tag":"indexed-cb-bit","bit":1,"indexRegister":"iy","displacement":29,"mode":"adl","modePrefix":null}
0x09D337  20 0C             JR NZ,0x09D345
0x09D339  21 2C D2 09       LD HL,0x09D22C
0x09D33D  22 CA 07 D0       LD (0xD007CA),HL
0x09D341  C3 2C D2 09       JP 0x09D22C
### 0x09D353 LD (D007CA),HL
Stored value: HL=0x09D22C from 0x09D34F LD HL,0x09D22C
0x09D343  D2 09 FE 7F       JP NC,0x7FFE09
0x09D347  20 D4             JR NZ,0x09D31D
0x09D349  18 04             JR 0x09D34F
0x09D34B  FE DA             CP 0xDA
0x09D34D  20 CE             JR NZ,0x09D31D
0x09D34F  21 2C D2 09       LD HL,0x09D22C
0x09D353  22 CA 07 D0       LD (0xD007CA),HL
0x09D357  C9                RET
0x09D358  C9                RET
0x09D359  FD CB 1E FE       indexed-cb-set {"pc":643929,"length":4,"nextPc":643933,"tag":"indexed-cb-set","bit":7,"indexRegister":"iy","displacement":30,"mode":"adl","modePrefix":null}
### 0x0AB767 LD (D007CA),HL
Stored value: HL=0x0AB83D from 0x0AB763 LD HL,0x0AB83D
0x0AB757  00                NOP
0x0AB758  00                NOP
0x0AB759  00                NOP
0x0AB75A  40 22 44 24       LD HL,(0x002444)
0x0AB75E  97                SUB A
0x0AB75F  32 55 24 D0       LD (0xD02455),A
0x0AB763  21 3D B8 0A       LD HL,0x0AB83D
0x0AB767  22 CA 07 D0       LD (0xD007CA),HL
0x0AB76B  CD 3A C1 0A       CALL 0x0AC13A
### 0x0AB8E7 LD (D007CA),HL
Stored value: HL=0x0ABA44 from 0x0AB8E3 LD HL,0x0ABA44
0x0AB8D7  46                LD B,(HL)
0x0AB8D8  C0                RET NZ
0x0AB8D9  47                LD B,A
0x0AB8DA  CD 42 C2 0A       CALL 0x0AC242
0x0AB8DE  CA 4D B8 0A       JP Z,0x0AB84D
0x0AB8E2  78                LD A,B
0x0AB8E3  21 44 BA 0A       LD HL,0x0ABA44
0x0AB8E7  22 CA 07 D0       LD (0xD007CA),HL
0x0AB8EB  C3 44 BA 0A       JP 0x0ABA44
### 0x0ABA7D LD (D007CA),HL
Stored value: HL=0x0AC035 from 0x0ABA79 LD HL,0x0AC035
0x0ABA6D  08                ex-af {"pc":703085,"length":1,"nextPc":703086,"tag":"ex-af","mode":"adl","modePrefix":null}
0x0ABA6E  B7                OR A
0x0ABA6F  CA 9F CC 0A       JP Z,0x0ACC9F
0x0ABA73  18 96             JR 0x0ABA0B
0x0ABA75  CD D1 D0 0A       CALL 0x0AD0D1
0x0ABA79  21 35 C0 0A       LD HL,0x0AC035
0x0ABA7D  22 CA 07 D0       LD (0xD007CA),HL
0x0ABA81  21 EB CB 0A       LD HL,0x0ACBEB
### 0x0ABB09 LD (D007CA),HL
Stored value: HL=0x0AB83D from 0x0ABB05 LD HL,0x0AB83D
0x0ABAF9  24                INC H
0x0ABAFA  CD 72 C7 0A       CALL 0x0AC772
0x0ABAFE  20 11             JR NZ,0x0ABB11
0x0ABB00  21 55 24 D0       LD HL,0xD02455
0x0ABB04  35                DEC (HL)
0x0ABB05  21 3D B8 0A       LD HL,0x0AB83D
0x0ABB09  22 CA 07 D0       LD (0xD007CA),HL
0x0ABB0D  C3 01 BE 0A       JP 0x0ABE01
### 0x0ABE84 LD (D007CA),HL
Stored value: HL=0x0AB83D from 0x0ABE80 LD HL,0x0AB83D
0x0ABE74  C3 E1 BD 0A       JP 0x0ABDE1
0x0ABE78  CD 21 B7 0A       CALL 0x0AB721
0x0ABE7C  CD 84 C6 08       CALL 0x08C684
0x0ABE80  21 3D B8 0A       LD HL,0x0AB83D
0x0ABE84  22 CA 07 D0       LD (0xD007CA),HL
0x0ABE88  21 03 CC 0A       LD HL,0x0ACC03
### 0x0ACC8A LD (D007CA),HL
Stored value: HL=0x0ACCDD from 0x0ACC86 LD HL,0x0ACCDD
0x0ACC7A  29                add-pair {"pc":707706,"length":1,"nextPc":707707,"tag":"add-pair","dest":"hl","src":"hl","mode":"adl","modePrefix":null}
0x0ACC7B  08                ex-af {"pc":707707,"length":1,"nextPc":707708,"tag":"ex-af","mode":"adl","modePrefix":null}
0x0ACC7C  CD 20 F9 07       CALL 0x07F920
0x0ACC80  F1                POP AF
0x0ACC81  CD 3A 2C 08       CALL 0x082C3A
0x0ACC85  C9                RET
0x0ACC86  21 DD CC 0A       LD HL,0x0ACCDD
0x0ACC8A  22 CA 07 D0       LD (0xD007CA),HL
0x0ACC8E  21 C7 CB 0A       LD HL,0x0ACBC7
### 0x0B1D4D LD (D007CA),HL
Stored value: HL=0x0B1D3B from 0x0B1D49 LD HL,0x0B1D3B
0x0B1D3D  C2 19 D1 0A       JP NZ,0x0AD119
0x0B1D41  CD 90 1B 0B       CALL 0x0B1B90
0x0B1D45  C3 3A 19 0B       JP 0x0B193A
0x0B1D49  21 3B 1D 0B       LD HL,0x0B1D3B
0x0B1D4D  22 CA 07 D0       LD (0xD007CA),HL
0x0B1D51  21 70 1B 0B       LD HL,0x0B1B70
### 0x0B48EC LD (D007CA),HL
Stored value: HL=0x0B4DAE from 0x0B48E8 LD HL,0x0B4DAE
0x0B48DC  6D                LD L,L
0x0B48DD  09                add-pair {"pc":739549,"length":1,"nextPc":739550,"tag":"add-pair","dest":"hl","src":"bc","mode":"adl","modePrefix":null}
0x0B48DE  C9                RET
0x0B48DF  F1                POP AF
0x0B48E0  CD D1 D0 0A       CALL 0x0AD0D1
0x0B48E4  CD C9 3A 0B       CALL 0x0B3AC9
0x0B48E8  21 AE 4D 0B       LD HL,0x0B4DAE
0x0B48EC  22 CA 07 D0       LD (0xD007CA),HL
0x0B48F0  CD 60 D0 0A       CALL 0x0AD060
### 0x0B6170 LD (D007CA),HL
Stored value: HL=0x0B62D8 from 0x0B616C LD HL,0x0B62D8
0x0B6160  C3 2A D9 0A       JP 0x0AD92A
0x0B6164  CD 37 61 0B       CALL 0x0B6137
0x0B6168  FD CB 0C A6       indexed-cb-res {"pc":745832,"length":4,"nextPc":745836,"tag":"indexed-cb-res","bit":4,"indexRegister":"iy","displacement":12,"mode":"adl","modePrefix":null}
0x0B616C  21 D8 62 0B       LD HL,0x0B62D8
0x0B6170  22 CA 07 D0       LD (0xD007CA),HL
0x0B6174  21 EB CB 0A       LD HL,0x0ACBEB

### Plain LE refs to D007CA
- hit 0x02380F prev=0x11 prev2=0x02: LD operand via 0x02380E LD DE,0xD007CA
- hit 0x0250E7 prev=0x21 prev2=0xC9: LD operand via 0x0250E6 LD HL,0xD007CA
- hit 0x0250FF prev=0x11 prev2=0xD0: LD operand via 0x0250FE LD DE,0xD007CA
- hit 0x0257F1 prev=0x21 prev2=0x8E: LD operand via 0x0257F0 LD HL,0xD007CA
- hit 0x025AF2 prev=0x11 prev2=0xC9: LD operand via 0x025AF1 LD DE,0xD007CA
- hit 0x03D9A1 prev=0x2A prev2=0x05: LD operand via 0x03D9A0 LD HL,(0xD007CA)
- hit 0x04ED08 prev=0x11 prev2=0xD0: LD operand via 0x04ED07 LD DE,0xD007CA
- hit 0x04EEA7 prev=0x21 prev2=0xD0: LD operand via 0x04EEA6 LD HL,0xD007CA
- hit 0x05CC32 prev=0x22 prev2=0x05: LD operand via 0x05CC31 LD (0xD007CA),HL
- hit 0x0601B5 prev=0x22 prev2=0x05: LD operand via 0x0601B4 LD (0xD007CA),HL
- hit 0x06B433 prev=0x22 prev2=0x06: LD operand via 0x06B432 LD (0xD007CA),HL
- hit 0x07AD36 prev=0x11 prev2=0x00: LD operand via 0x07AD35 LD DE,0xD007CA
- hit 0x07AD53 prev=0x11 prev2=0x00: LD operand via 0x07AD52 LD DE,0xD007CA
- hit 0x07AD5A prev=0x2A prev2=0xC9: LD operand via 0x07AD59 LD HL,(0xD007CA)
- hit 0x080DF0 prev=0x2A prev2=0xAE: LD operand via 0x080DEF LD HL,(0xD007CA)
- hit 0x080EB8 prev=0x22 prev2=0x08: LD operand via 0x080EB7 LD (0xD007CA),HL
- hit 0x081019 prev=0x22 prev2=0x08: LD operand via 0x081018 LD (0xD007CA),HL
- hit 0x081032 prev=0x2A prev2=0x08: LD operand via 0x081031 LD HL,(0xD007CA)
- hit 0x081101 prev=0x22 prev2=0x08: LD operand via 0x081100 LD (0xD007CA),HL
- hit 0x0813E1 prev=0x22 prev2=0x08: LD operand via 0x0813E0 LD (0xD007CA),HL
- hit 0x085D12 prev=0x2A prev2=0xD5: LD operand via 0x085D11 LD HL,(0xD007CA)
- hit 0x08669E prev=0x2A prev2=0x1B: LD operand via 0x08669D LD HL,(0xD007CA)
- hit 0x088534 prev=0x2A prev2=0x08: LD operand via 0x088533 LD HL,(0xD007CA)
- hit 0x08A9FC prev=0x2A prev2=0xC9: LD operand via 0x08A9FB LD HL,(0xD007CA)
- hit 0x08C736 prev=0x2A prev2=0xE5: LD operand via 0x08C735 LD HL,(0xD007CA)
- hit 0x08C783 prev=0x11 prev2=0x27: LD operand via 0x08C782 LD DE,0xD007CA
- hit 0x09D06D prev=0x2A prev2=0xD5: LD operand via 0x09D06C LD HL,(0xD007CA)
- hit 0x09D07A prev=0x2A prev2=0x0B: LD operand via 0x09D079 LD HL,(0xD007CA)
- hit 0x09D328 prev=0x22 prev2=0x09: LD operand via 0x09D327 LD (0xD007CA),HL
- hit 0x09D33E prev=0x22 prev2=0x09: LD operand via 0x09D33D LD (0xD007CA),HL
- hit 0x09D354 prev=0x22 prev2=0x09: LD operand via 0x09D353 LD (0xD007CA),HL
- hit 0x0AB6FB prev=0x2A prev2=0x05: LD operand via 0x0AB6FA LD HL,(0xD007CA)
- hit 0x0AB768 prev=0x22 prev2=0x0A: LD operand via 0x0AB767 LD (0xD007CA),HL
- hit 0x0AB8E8 prev=0x22 prev2=0x0A: LD operand via 0x0AB8E7 LD (0xD007CA),HL
- hit 0x0ABA7E prev=0x22 prev2=0x0A: LD operand via 0x0ABA7D LD (0xD007CA),HL
- hit 0x0ABB0A prev=0x22 prev2=0x0A: LD operand via 0x0ABB09 LD (0xD007CA),HL
- hit 0x0ABE85 prev=0x22 prev2=0x0A: LD operand via 0x0ABE84 LD (0xD007CA),HL
- hit 0x0ACC8B prev=0x22 prev2=0x0A: LD operand via 0x0ACC8A LD (0xD007CA),HL
- hit 0x0B1B96 prev=0x2A prev2=0xC9: LD operand via 0x0B1B95 LD HL,(0xD007CA)
- hit 0x0B1D4E prev=0x22 prev2=0x0B: LD operand via 0x0B1D4D LD (0xD007CA),HL
- hit 0x0B3BCD prev=0x2A prev2=0x0B: LD operand via 0x0B3BCC LD HL,(0xD007CA)
- hit 0x0B48ED prev=0x22 prev2=0x0B: LD operand via 0x0B48EC LD (0xD007CA),HL
- hit 0x0B4E44 prev=0x2A prev2=0xD2: LD operand via 0x0B4E43 LD HL,(0xD007CA)
- hit 0x0B5514 prev=0x2A prev2=0x08: LD operand via 0x0B5513 LD HL,(0xD007CA)
- hit 0x0B6171 prev=0x22 prev2=0x0B: LD operand via 0x0B6170 LD (0xD007CA),HL
- hit 0x0BC4A8 prev=0x21 prev2=0xEB: LD operand via 0x0BC4A7 LD HL,0xD007CA
- hit 0x0BC4BC prev=0x11 prev2=0x19: LD operand via 0x0BC4BB LD DE,0xD007CA

## Job 3: 0x058BB0-0x058CD0 ADL disassembly
0x058BB0  B6                OR (HL)
0x058BB1  3E 0E             LD A,0x0E
0x058BB3  CD 13 1E 09       CALL 0x091E13
0x058BB7  CD EC 00 08       CALL 0x0800EC
0x058BBB  CD 10 CE 09       CALL 0x09CE10
0x058BBF  CD 3A 22 0A       CALL 0x0A223A
0x058BC3  CD 65 8C 05       CALL 0x058C65
0x058BC7  FD CB 0C AE       indexed-cb-res {"pc":363463,"length":4,"nextPc":363467,"tag":"indexed-cb-res","bit":5,"indexRegister":"iy","displacement":12,"mode":"adl","modePrefix":null}
0x058BCB  CD 4B 38 08       CALL 0x08384B
0x058BCF  CD 1B 29 02       CALL 0x02291B
0x058BD3  CD B8 00 08       CALL 0x0800B8
0x058BD7  28 1B             JR Z,0x058BF4
0x058BD9  EB                ex-de-hl {"pc":363481,"length":1,"nextPc":363482,"tag":"ex-de-hl","mode":"adl","modePrefix":null}
0x058BDA  FD CB 20 E6       indexed-cb-set {"pc":363482,"length":4,"nextPc":363486,"tag":"indexed-cb-set","bit":4,"indexRegister":"iy","displacement":32,"mode":"adl","modePrefix":null}
0x058BDE  CD 85 CA 08       CALL 0x08CA85
0x058BE2  FD CB 20 A6       indexed-cb-res {"pc":363490,"length":4,"nextPc":363494,"tag":"indexed-cb-res","bit":4,"indexRegister":"iy","displacement":32,"mode":"adl","modePrefix":null}
0x058BE6  38 10             JR C,0x058BF8
0x058BE8  CD E6 8D 0A       CALL 0x0A8DE6
0x058BEC  CD F2 83 05       CALL 0x0583F2
0x058BF0  C3 BA 83 05       JP 0x0583BA  ; hard boundary
0x058BF4  CD 83 92 09       CALL 0x099283
0x058BF8  DA 42 1D 06       JP C,0x061D42
0x058BFC  CD 0E E6 05       CALL 0x05E60E
0x058C00  C9                RET  ; hard boundary
0x058C01  CD B8 00 08       CALL 0x0800B8
0x058C05  28 10             JR Z,0x058C17
0x058C07  21 C0 06 D0       LD HL,0xD006C0
0x058C0B  38 05             JR C,0x058C12
0x058C0D  CD 13 6C 08       CALL 0x086C13
0x058C11  C9                RET  ; hard boundary
0x058C12  CD 4E 28 0A       CALL 0x0A284E
0x058C16  C9                RET  ; hard boundary
0x058C17  38 21             JR C,0x058C3A
0x058C19  3A 95 05 D0       LD A,(0xD00595)
0x058C1D  80                ADD B
0x058C1E  D6 09             SUB 0x09
0x058C20  FE 01             CP 0x01
0x058C22  F8                RET M
0x058C23  47                LD B,A
0x058C24  21 95 05 D0       LD HL,0xD00595
0x058C28  CD 06 21 0A       CALL 0x0A2106
0x058C2C  CD 59 02 08       CALL 0x080259
0x058C30  28 04             JR Z,0x058C36
0x058C32  CD 73 8E 05       CALL 0x058E73
0x058C36  35                DEC (HL)
0x058C37  10 EF             djnz {"pc":363575,"length":2,"nextPc":363577,"tag":"djnz","target":363560,"fallthrough":363577,"terminates":true,"mode":"adl","modePrefix":null}
0x058C39  C9                RET  ; hard boundary
0x058C3A  CD 20 83 09       CALL 0x098320
0x058C3E  CD FE 29 0A       CALL 0x0A29FE
0x058C42  CD 87 E7 05       CALL 0x05E787
0x058C46  C9                RET  ; hard boundary
0x058C47  CD 4B 38 08       CALL 0x08384B
0x058C4B  D4 7D 26 08       CALL NC,0x08267D
0x058C4F  21 00 00 00       LD HL,0x00
0x058C53  CD 48 24 08       CALL 0x082448
0x058C57  CD 96 8D 05       CALL 0x058D96
0x058C5B  CD 22 82 05       CALL 0x058222
0x058C5F  3E 40             LD A,0x40
0x058C61  32 E0 07 D0       LD (0xD007E0),A  ; LD (D007E0),A confirmed mode write
0x058C65  CD A8 00 08       CALL 0x0800A8
0x058C69  C0                RET NZ
0x058C6A  CD 83 8C 05       CALL 0x058C83
0x058C6E  CD B8 00 08       CALL 0x0800B8
0x058C72  C4 EE 83 05       CALL NZ,0x0583EE
0x058C76  FD CB 0C EE       indexed-cb-set {"pc":363638,"length":4,"nextPc":363642,"tag":"indexed-cb-set","bit":5,"indexRegister":"iy","displacement":12,"mode":"adl","modePrefix":null}
0x058C7A  FD CB 05 A6       indexed-cb-res {"pc":363642,"length":4,"nextPc":363646,"tag":"indexed-cb-res","bit":4,"indexRegister":"iy","displacement":5,"mode":"adl","modePrefix":null}
0x058C7E  FD CB 45 8E       indexed-cb-res {"pc":363646,"length":4,"nextPc":363650,"tag":"indexed-cb-res","bit":1,"indexRegister":"iy","displacement":69,"mode":"adl","modePrefix":null}
0x058C82  C9                RET  ; hard boundary
0x058C83  CD FF 8C 05       CALL 0x058CFF
0x058C87  CD 7B FF 07       CALL 0x07FF7B
0x058C8B  CD 4F 38 08       CALL 0x08384F
0x058C8F  22 4E 24 D0       LD (0xD0244E),HL
0x058C93  FD CB 46 7E       indexed-cb-bit {"pc":363667,"length":4,"nextPc":363671,"tag":"indexed-cb-bit","bit":7,"indexRegister":"iy","displacement":70,"mode":"adl","modePrefix":null}
0x058C97  FD CB 46 BE       indexed-cb-res {"pc":363671,"length":4,"nextPc":363675,"tag":"indexed-cb-res","bit":7,"indexRegister":"iy","displacement":70,"mode":"adl","modePrefix":null}
0x058C9B  F5                PUSH AF
0x058C9C  CC 4D E8 05       CALL Z,0x05E84D
0x058CA0  F1                POP AF
0x058CA1  C4 6A E8 05       CALL NZ,0x05E86A
0x058CA5  FD CB 0C B6       indexed-cb-res {"pc":363685,"length":4,"nextPc":363689,"tag":"indexed-cb-res","bit":6,"indexRegister":"iy","displacement":12,"mode":"adl","modePrefix":null}
0x058CA9  FD CB 09 86       indexed-cb-res {"pc":363689,"length":4,"nextPc":363693,"tag":"indexed-cb-res","bit":0,"indexRegister":"iy","displacement":9,"mode":"adl","modePrefix":null}
0x058CAD  CD B8 00 08       CALL 0x0800B8
0x058CB1  C8                RET Z
0x058CB2  CD 72 E8 05       CALL 0x05E872
0x058CB6  FD CB 20 A6       indexed-cb-res {"pc":363702,"length":4,"nextPc":363706,"tag":"indexed-cb-res","bit":4,"indexRegister":"iy","displacement":32,"mode":"adl","modePrefix":null}
0x058CBA  CD BB D0 08       CALL 0x08D0BB
0x058CBE  30 0E             JR NC,0x058CCE
0x058CC0  CD 8E 8D 05       CALL 0x058D8E
0x058CC4  CD 7B FF 07       CALL 0x07FF7B
0x058CC8  CD BB D0 08       CALL 0x08D0BB
0x058CCC  38 53             JR C,0x058D21
0x058CCE  FD CB 20 D6       indexed-cb-set {"pc":363726,"length":4,"nextPc":363730,"tag":"indexed-cb-set","bit":2,"indexRegister":"iy","displacement":32,"mode":"adl","modePrefix":null}

Containing-function entry inferred for 0x058C61: 0x058C47
Hard boundary before 0x058C61: 0x058C46 RET; next=0x058C47
Hard boundary after 0x058C61: 0x058C82 RET
Value in A at 0x058C61: A=0x40 from 0x058C5F LD A,0x40

### CALL/JP/JR targets in containing function
- 0x058C47 call: 0x08384B (CALL 0x08384B)
- 0x058C4B call-conditional: 0x08267D (CALL NC,0x08267D)
- 0x058C53 call: 0x082448 (CALL 0x082448)
- 0x058C57 call: 0x058D96 (CALL 0x058D96)
- 0x058C5B call: 0x058222 (CALL 0x058222)
- 0x058C65 call: 0x0800A8 (CALL 0x0800A8)
- 0x058C6A call: 0x058C83 (CALL 0x058C83)
- 0x058C6E call: 0x0800B8 (CALL 0x0800B8)
- 0x058C72 call-conditional: 0x0583EE (CALL NZ,0x0583EE)

References D007CA in containing function: no
References 0x044xxx in containing function: no

### Whole-ROM refs to mode function entry 0x058C47
- hit 0x021589: JP operand via 0x021588 JP 0x058C47
  0x021583  0A                LD A,(BC)
  0x021584  C3 9C E8 05       JP 0x05E89C
  0x021588  C3 47 8C 05       JP 0x058C47
  0x02158C  C3 63 E2 09       JP 0x09E263
  0x021590  C3 7E E1 0A       JP 0x0AE17E
- hit 0x09DEBF: CALL operand via 0x09DEBE CALL 0x058C47
  0x09DEB9  0A                LD A,(BC)
  0x09DEBA  CD FA CF 0B       CALL 0x0BCFFA
  0x09DEBE  CD 47 8C 05       CALL 0x058C47
  0x09DEC2  CD 7E E1 0A       CALL 0x0AE17E
  0x09DEC6  CD C2 D2 0B       CALL 0x0BD2C2

## Ranked candidates and conclusion
1. 0x04488C: 1 code refs, 1 total refs (contains 0x044890)
2. 0x044800: 0 code refs, 0 total refs

Most plausible static drive-able entry: 0x058C47 for context setup, because it writes 0xD007E0 with A=0x40 from 0x058C5F LD A,0x40 and has 2 code reference(s).
The local 0x058C47 function does not reference D007CA and does not directly reference 0x044xxx, so the static launcher chain likely uses an outer caller or table/event dispatch to combine D007CA setup with this home-mode write before reaching 0x04488C and the conditional 0x044890 -> 0x044A69 jump.
D007CA setup candidates are the direct writer sites listed above; rank the ones storing 0x044xxx values highest if present.
