# Phase 607 Decode: 0x08DDxx Key2-Only Cluster

ROM: `ROM.rom` (4194304 bytes)

## 0x08DDxx key2-only cluster

Range: 0x08DD60-0x08DDA0 (end exclusive)

```asm
0x08DD60  2A 3A 24 D0    LD HL,(0xD0243A) ; mem: 0xD0243A
0x08DD64  CD EC E3 05    CALL 0x05E3EC ; call: 0x05E3EC
0x08DD68  11 00 00 00    LD DE,0x000000
0x08DD6C  28 0C          JR Z,0x08DD7A ; conditional branch: 0x08DD7A
0x08DD6E  2B             DEC HL
0x08DD6F  CD EC E3 05    CALL 0x05E3EC ; call: 0x05E3EC
0x08DD73  16 00          LD D,0x00
0x08DD75  5E             LD E,(HL)
0x08DD76  20 04          JR NZ,0x08DD7C ; conditional branch: 0x08DD7C
0x08DD78  F6 01          OR 0x01
0x08DD7A  7B             LD A,E
0x08DD7B  C9             RET
0x08DD7C  E5             PUSH HL
0x08DD7D  2B             DEC HL
0x08DD7E  CD 64 00 08    CALL 0x080064 ; call: 0x080064
0x08DD82  E1             POP HL
0x08DD83  20 F3          JR NZ,0x08DD78 ; conditional branch: 0x08DD78
0x08DD85  2B             DEC HL
0x08DD86  56             LD D,(HL)
0x08DD87  F6 01          OR 0x01
0x08DD89  7A             LD A,D
0x08DD8A  37             SCF
0x08DD8B  C9             RET
0x08DD8C  21 BF DD 08    LD HL,0x08DDBF
0x08DD90  06 13          LD B,0x13
0x08DD92  7B             LD A,E
0x08DD93  BE             CP (HL)
0x08DD94  23             INC HL
0x08DD95  20 07          JR NZ,0x08DD9E ; conditional branch: 0x08DD9E
0x08DD97  7A             LD A,D
0x08DD98  BE             CP (HL)
0x08DD99  23             INC HL
0x08DD9A  20 03          JR NZ,0x08DD9F ; conditional branch: 0x08DD9F
0x08DD9C  7E             LD A,(HL)
0x08DD9D  C9             RET
0x08DD9E  23             INC HL
0x08DD9F  23             INC HL
```

## 0x05CA18 key2-only blocks

Range: 0x05CA18-0x05CA2B (end exclusive)

```asm
0x05CA18  2A 3D 24 D0    LD HL,(0xD0243D) ; mem: 0xD0243D
0x05CA1C  23             INC HL
0x05CA1D  7E             LD A,(HL)
0x05CA1E  FE 6F          CP 0x6F
0x05CA20  20 04          JR NZ,0x05CA26 ; conditional branch: 0x05CA26
0x05CA22  3E 7B          LD A,0x7B
0x05CA24  18 E9          JR 0x05CA0F ; branch: 0x05CA0F
0x05CA26  CD 96 E6 08    CALL 0x08E696 ; call: 0x08E696
0x05CA2A  18 04          JR 0x05CA30 ; branch: 0x05CA30
```

## 0x08E63E key2-only display branch

Range: 0x08E63E-0x08E776 (end exclusive)

```asm
0x08E63E  C6 BF          ADD A, 0xBF
0x08E640  D5             PUSH DE
0x08E641  11 00 00 00    LD DE,0x000000
0x08E645  D6 1F          SUB 0x1F
0x08E647  5F             LD E,A
0x08E648  87             ADD A, A
0x08E649  83             ADD A, E
0x08E64A  5F             LD E,A
0x08E64B  19             ADD HL,DE
0x08E64C  D1             POP DE
0x08E64D  ED 27          ED 0x27
0x08E64F  E5             PUSH HL
0x08E650  21 00 00 00    LD HL,0x000000
0x08E654  C9             RET
0x08E655  96             SUB (HL)
0x08E656  E6 08          AND 0x08
0x08E658  DE E7          SBC A, 0xE7
0x08E65A  08 E4 E9       EX AF,AF'
0x08E65D  08 12 E8       EX AF,AF'
0x08E660  08 E7 EA       EX AF,AF'
0x08E663  08 9B E9       EX AF,AF'
0x08E666  08 31 EA       EX AF,AF'
0x08E669  08 6B EA       EX AF,AF'
0x08E66C  08 D9 E8       EX AF,AF'
0x08E66F  08 70 EA       EX AF,AF'
0x08E672  08 40 EC       EX AF,AF'
0x08E675  08 25 EA       EX AF,AF'
0x08E678  08 50 EE       EX AF,AF'
0x08E67B  08 EF EE       EX AF,AF'
0x08E67E  08 F5 EE       EX AF,AF'
0x08E681  08 1A ED       EX AF,AF'
0x08E684  08 CD 90       EX AF,AF'
0x08E687  E6 08          AND 0x08
0x08E689  C8             RET Z
0x08E68A  FE 28          CP 0x28
0x08E68C  C8             RET Z
0x08E68D  FE 29          CP 0x29
0x08E68F  C9             RET
0x08E690  FE 7B          CP 0x7B
0x08E692  C8             RET Z
0x08E693  FE 7D          CP 0x7D
0x08E695  C9             RET
0x08E696  FE 27          CP 0x27
0x08E698  20 18          JR NZ,0x08E6B2 ; conditional branch: 0x08E6B2
0x08E69A  21 7E E9 08    LD HL,0x08E97E
0x08E69E  FD             RST 0x38
0x08E69F  CB 44          BIT 0,H
0x08E6A1  5E             LD E,(HL)
0x08E6A2  20 0A          JR NZ,0x08E6AE ; conditional branch: 0x08E6AE
0x08E6A4  21 65 E9 08    LD HL,0x08E965
0x08E6A8  3E 0C          LD A,0x0C
0x08E6AA  C3 65 E7 08    JP 0x08E765 ; jump: 0x08E765
0x08E6AE  C3 63 E7 08    JP 0x08E763 ; jump: 0x08E763
0x08E6B2  FE 22          CP 0x22
0x08E6B4  20 0C          JR NZ,0x08E6C2 ; conditional branch: 0x08E6C2
0x08E6B6  06 7C          LD B,0x7C
0x08E6B8  FD             RST 0x38
0x08E6B9  CB 32          SLL D
0x08E6BB  D6 78          SUB 0x78
0x08E6BD  CD E9 23 0A    CALL 0x0A23E9 ; call: 0x0A23E9
0x08E6C1  C9             RET
0x08E6C2  FE 21          CP 0x21
0x08E6C4  28 F0          JR Z,0x08E6B6 ; conditional branch: 0x08E6B6
0x08E6C6  FE 25          CP 0x25
0x08E6C8  06 DB          LD B,0xDB
0x08E6CA  28 EC          JR Z,0x08E6B8 ; conditional branch: 0x08E6B8
0x08E6CC  FE 6F          CP 0x6F
0x08E6CE  28 04          JR Z,0x08E6D4 ; conditional branch: 0x08E6D4
0x08E6D0  FE 2B          CP 0x2B
0x08E6D2  20 6F          JR NZ,0x08E743 ; conditional branch: 0x08E743
0x08E6D4  40             LD B,B
0x08E6D5  ED 5B 33 2A 7A  LD DE,(0x7A2A33) ; mem: 0x7A2A33
0x08E6DA  B7             OR A
0x08E6DB  20 D9          JR NZ,0x08E6B6 ; conditional branch: 0x08E6B6
0x08E6DD  7B             LD A,E
0x08E6DE  06 0B          LD B,0x0B
0x08E6E0  FD             RST 0x38
0x08E6E1  CB 44          BIT 0,H
0x08E6E3  5E             LD E,(HL)
0x08E6E4  28 02          JR Z,0x08E6E8 ; conditional branch: 0x08E6E8
0x08E6E6  06 0F          LD B,0x0F
0x08E6E8  B8             CP B
0x08E6E9  30 CB          JR NC,0x08E6B6 ; conditional branch: 0x08E6B6
0x08E6EB  40             LD B,B
0x08E6EC  2A D2 08 E5    LD HL,(0xE508D2) ; mem: 0xE508D2
0x08E6F0  3E 20          LD A,0x20
0x08E6F2  CD E9 23 0A    CALL 0x0A23E9 ; call: 0x0A23E9
0x08E6F6  3E 06          LD A,0x06
0x08E6F8  FD             RST 0x38
0x08E6F9  CB 44          BIT 0,H
0x08E6FB  5E             LD E,(HL)
0x08E6FC  CC E9 23 0A    CALL Z,0x0A23E9 ; conditional call: 0x0A23E9
0x08E700  E1             POP HL
0x08E701  40             LD B,B
0x08E702  22 D2 08 FD    LD (0xFD08D2),HL ; mem: 0xFD08D2
0x08E706  CB 44          BIT 0,H
0x08E708  5E             LD E,(HL)
0x08E709  28 2C          JR Z,0x08E737 ; conditional branch: 0x08E737
0x08E70B  3A D5 08 D0    LD A,(0xD008D5) ; mem: 0xD008D5
0x08E70F  21 50 11 D0    LD HL,0xD01150
0x08E713  96             SUB (HL)
0x08E714  32 56 11 D0    LD (0xD01156),A ; mem: 0xD01156
0x08E718  AF             XOR A
0x08E719  32 57 11 D0    LD (0xD01157),A ; mem: 0xD01157
0x08E71D  40             LD B,B
0x08E71E  2A D2 08 40    LD HL,(0x4008D2) ; mem: 0x4008D2
0x08E722  ED 5B 4E 11 B7  LD DE,(0xB7114E) ; mem: 0xB7114E
0x08E727  52             LD D,D
0x08E728  ED 52          SBC HL,DE
0x08E72A  40             LD B,B
0x08E72B  22 54 11 40    LD (0x401154),HL ; mem: 0x401154
0x08E72F  ED 5B 33 2A C3  LD DE,(0xC32A33) ; mem: 0xC32A33
0x08E734  B8             CP B
0x08E735  EE 08          XOR 0x08
0x08E737  3E 20          LD A,0x20
0x08E739  CD E9 23 0A    CALL 0x0A23E9 ; call: 0x0A23E9
0x08E73D  06 C1          LD B,0xC1
0x08E73F  C3 BC E6 08    JP 0x08E6BC ; jump: 0x08E6BC
0x08E743  FE 26          CP 0x26
0x08E745  06 1D          LD B,0x1D
0x08E747  CA B8 E6 08    JP Z,0x08E6B8 ; conditional branch: 0x08E6B8
0x08E74B  FE 28          CP 0x28
0x08E74D  06 6C          LD B,0x6C
0x08E74F  CA BC E6 08    JP Z,0x08E6BC ; conditional branch: 0x08E6BC
0x08E753  FE 29          CP 0x29
0x08E755  06 C6          LD B,0xC6
0x08E757  CA BC E6 08    JP Z,0x08E6BC ; conditional branch: 0x08E6BC
0x08E75B  21 76 E7 08    LD HL,0x08E776
0x08E75F  FD             RST 0x38
0x08E760  CB 32          SLL D
0x08E762  D6 3E          SUB 0x3E
0x08E764  0E 11          LD C,0x11
0x08E766  A1             AND C
0x08E767  05             DEC B
0x08E768  D0             RET NC
0x08E769  D5             PUSH DE
0x08E76A  01 1D 00 00    LD BC,0x00001D
0x08E76E  ED B0          LDIR
0x08E770  E1             POP HL
0x08E771  CD 9E 23 0A    CALL 0x0A239E ; call: 0x0A239E
0x08E775  C9             RET
```

## 0x08FC15 key2-only block

Range: 0x08FC15-0x08FC27 (end exclusive)

```asm
0x08FC15  40             LD B,B
0x08FC16  2A 23 2A 11    LD HL,(0x112A23) ; mem: 0x112A23
0x08FC1A  0C             INC C
0x08FC1B  00             NOP
0x08FC1C  00             NOP
0x08FC1D  52             LD D,D
0x08FC1E  19             ADD HL,DE
0x08FC1F  CD 92 09 09    CALL 0x090992 ; call: 0x090992
0x08FC23  28 01          JR Z,0x08FC26 ; conditional branch: 0x08FC26
0x08FC25  2B             DEC HL
0x08FC26  40             LD B,B
```

## 0x0908F1 key2 stuck context

Range: 0x090900-0x090960 (end exclusive)

```asm
0x090900  FE 6D          CP 0x6D
0x090902  D8             RET C
0x090903  FE 70          CP 0x70
0x090905  D0             RET NC
0x090906  BF             CP A
0x090907  C9             RET
0x090908  7A             LD A,D
0x090909  FE EF          CP 0xEF
0x09090B  20 07          JR NZ,0x090914 ; conditional branch: 0x090914
0x09090D  7B             LD A,E
0x09090E  FE 2D          CP 0x2D
0x090910  20 02          JR NZ,0x090914 ; conditional branch: 0x090914
0x090912  BF             CP A
0x090913  C9             RET
0x090914  F6 01          OR 0x01
0x090916  C9             RET
0x090917  23             INC HL
0x090918  CD DC F3 08    CALL 0x08F3DC ; call: 0x08F3DC
0x09091C  C8             RET Z
0x09091D  D5             PUSH DE
0x09091E  ED 5B 3A 24 D0  LD DE,(0xD0243A) ; mem: 0xD0243A
0x090923  CD 73 C9 04    CALL 0x04C973 ; call: 0x04C973
0x090927  D1             POP DE
0x090928  C0             RET NZ
0x090929  2A 3D 24 D0    LD HL,(0xD0243D) ; mem: 0xD0243D
0x09092D  C9             RET
0x09092E  2B             DEC HL
0x09092F  CD DC F3 08    CALL 0x08F3DC ; call: 0x08F3DC
0x090933  C8             RET Z
0x090934  D5             PUSH DE
0x090935  ED 5B 3D 24 D0  LD DE,(0xD0243D) ; mem: 0xD0243D
0x09093A  1B             DEC DE
0x09093B  CD 73 C9 04    CALL 0x04C973 ; call: 0x04C973
0x09093F  D1             POP DE
0x090940  C0             RET NZ
0x090941  2A 3A 24 D0    LD HL,(0xD0243A) ; mem: 0xD0243A
0x090945  2B             DEC HL
0x090946  C9             RET
0x090947  40             LD B,B
0x090948  01 0E 00 CD    LD BC,0xCD000E
0x09094C  92             SUB D
0x09094D  09             ADD HL,BC
0x09094E  09             ADD HL,BC
0x09094F  C8             RET Z
0x090950  0E 0A          LD C,0x0A
0x090952  C9             RET
0x090953  40             LD B,B
0x090954  11 07 00 CD    LD DE,0xCD0007
0x090958  92             SUB D
0x090959  09             ADD HL,BC
0x09095A  09             ADD HL,BC
0x09095B  C8             RET Z
0x09095C  11 05 00 00    LD DE,0x000005
```

## 0x091BF2 key2-only block

Range: 0x091BF2-0x091BFD (end exclusive)

```asm
0x091BF2  CD 60 DD 08    CALL 0x08DD60 ; call: 0x08DD60
0x091BF6  28 54          JR Z,0x091C4C ; conditional branch: 0x091C4C
0x091BF8  CD F4 0E 09    CALL 0x090EF4 ; call: 0x090EF4
0x091BFC  20 4E          JR NZ,0x091C4C ; conditional branch: 0x091C4C
```

## Caller Analysis For 0x08DD60

Exact CALL pattern `CD 60 DD 08`: 0x0566DD, 0x08D310, 0x08D727, 0x091BF2
Exact JP pattern `C3 60 DD 08`: none found

No JR/JP conditional patterns resolving to 0x08DD60 were found in the scanned neighborhoods.

## Analysis: 0x08DDxx Cluster

The 0x08DDxx cluster is dominated by the following control and memory references:

- `0x08DD60  2A 3A 24 D0    LD HL,(0xD0243A) ; mem: 0xD0243A`
- `0x08DD64  CD EC E3 05    CALL 0x05E3EC ; call: 0x05E3EC`
- `0x08DD6C  28 0C          JR Z,0x08DD7A ; conditional branch: 0x08DD7A`
- `0x08DD6F  CD EC E3 05    CALL 0x05E3EC ; call: 0x05E3EC`
- `0x08DD76  20 04          JR NZ,0x08DD7C ; conditional branch: 0x08DD7C`
- `0x08DD7E  CD 64 00 08    CALL 0x080064 ; call: 0x080064`
- `0x08DD83  20 F3          JR NZ,0x08DD78 ; conditional branch: 0x08DD78`
- `0x08DD95  20 07          JR NZ,0x08DD9E ; conditional branch: 0x08DD9E`
- `0x08DD9A  20 03          JR NZ,0x08DD9F ; conditional branch: 0x08DD9F`

Interpretation should be tied to the branch targets above: direct exits are routing decisions, while absolute memory loads/stores are likely state or display/OS flag checks.

## Analysis: 0x090927 Loop Context

Backward branches in the 0x090927 context:

- `0x090918  CD DC F3 08    CALL 0x08F3DC ; call: 0x08F3DC`
- `0x090923  CD 73 C9 04    CALL 0x04C973 ; call: 0x04C973`
- `0x09092F  CD DC F3 08    CALL 0x08F3DC ; call: 0x08F3DC`
- `0x09093B  CD 73 C9 04    CALL 0x04C973 ; call: 0x04C973`

A backward conditional branch breaks when its named condition becomes false; for example `JR Z` exits when Z clears, and `JR NZ` exits when Z sets. The instruction immediately before the branch normally identifies the compared register, input port, or memory-backed flag.

## Notes

- Decode is eZ80 ADL-oriented for 24-bit immediate CALL/JP/LD addresses.
- DD/FD indexed forms are reported conservatively by prefix when not needed for control-flow analysis.
- Confirm semantic names by correlating absolute memory references and branch targets with the session trace.

