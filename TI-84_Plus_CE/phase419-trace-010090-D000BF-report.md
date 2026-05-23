# Phase 419: Trace 0x010090 + Map D000BF LCD/DMA Control Byte

## Part A: 0x010090 Function Trace

- **Address range**: 0x010090-0x01021F
- **Size**: 400 bytes
- **Instructions**: 126
- **CALL targets**: 5
- **Branch targets**: 21
- **Port I/O**: 0

### Disassembly

```text
0x010090  01 FC 77 D1         LD BC,0xD177FC
0x010094  2A DB 77 D1         LD HL,(0xD177DB) ; D177DB
0x010098  09                  [add-pair] {"pc":65688,"length":1,"nextPc":65689,"tag":"add-pair","dest":"hl","src":"bc","mode":"adl","modePrefix":null}
0x010099  7E                  [ld-reg-ind] {"pc":65689,"length":1,"nextPc":65690,"tag":"ld-reg-ind","dest":"a","src":"hl","mode":"adl","modePrefix":null}
0x01009A  FE 1F               CP 0x1F
0x01009C  C2 29 01 01         JP NZ,0x010129
0x0100A0  01 1F 00 00         LD BC,0x00001F
0x0100A4  2A D8 77 D1         LD HL,(0xD177D8) ; D177D8
0x0100A8  B7                  OR A
0x0100A9  ED 42               [sbc-pair] {"pc":65705,"length":2,"nextPc":65707,"tag":"sbc-pair","src":"bc","mode":"adl","modePrefix":null}
0x0100AB  30 0F               JR NC,0x0100BC
0x0100AD  ED 4B D8 77 D1      LD BC,(0xD177D8) ; D177D8
0x0100B2  03                  INC BC
0x0100B3  ED 43 D8 77 D1      [ld-mem-pair] {"pc":65715,"length":5,"nextPc":65720,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x0100B8  C3 1F 02 01         JP 0x01021F
0x0100BC  01 0C 00 00         LD BC,0x00000C
0x0100C0  2A DB 77 D1         LD HL,(0xD177DB) ; D177DB
0x0100C4  B7                  OR A
0x0100C5  ED 42               [sbc-pair] {"pc":65733,"length":2,"nextPc":65735,"tag":"sbc-pair","src":"bc","mode":"adl","modePrefix":null}
0x0100C7  20 48               JR NZ,0x010111
0x0100C9  01 01 00 00         LD BC,0x000001
0x0100CD  ED 43 DB 77 D1      [ld-mem-pair] {"pc":65741,"length":5,"nextPc":65746,"tag":"ld-mem-pair","addr":13727707,"pair":"bc","mode":"adl","modePrefix":null}
0x0100D2  ED 4B DE 77 D1      LD BC,(0xD177DE)
0x0100D7  03                  INC BC
0x0100D8  ED 43 DE 77 D1      [ld-mem-pair] {"pc":65752,"length":5,"nextPc":65757,"tag":"ld-mem-pair","addr":13727710,"pair":"bc","mode":"adl","modePrefix":null}
0x0100DD  ED 4B DE 77 D1      LD BC,(0xD177DE)
0x0100E2  21 63 00 00         LD HL,0x000063
0x0100E6  B7                  OR A
0x0100E7  ED 42               [sbc-pair] {"pc":65767,"length":2,"nextPc":65769,"tag":"sbc-pair","src":"bc","mode":"adl","modePrefix":null}
0x0100E9  30 16               JR NC,0x010101
0x0100EB  FD 2A CC 77 D1      LD IY,(0xD177CC)
0x0100F0  ED 03 64            [lea] {"pc":65776,"length":3,"nextPc":65779,"tag":"lea","dest":"bc","base":"iy","displacement":100,"mode":"adl","modePrefix":null}
0x0100F3  ED 43 CC 77 D1      [ld-mem-pair] {"pc":65779,"length":5,"nextPc":65784,"tag":"ld-mem-pair","addr":13727692,"pair":"bc","mode":"adl","modePrefix":null}
0x0100F8  01 00 00 00         LD BC,0x000000
0x0100FC  ED 43 DE 77 D1      [ld-mem-pair] {"pc":65788,"length":5,"nextPc":65793,"tag":"ld-mem-pair","addr":13727710,"pair":"bc","mode":"adl","modePrefix":null}
0x010101  ED 4B DE 77 D1      LD BC,(0xD177DE)
0x010106  2A CC 77 D1         LD HL,(0xD177CC)
0x01010A  09                  [add-pair] {"pc":65802,"length":1,"nextPc":65803,"tag":"add-pair","dest":"hl","src":"bc","mode":"adl","modePrefix":null}
0x01010B  22 CF 77 D1         LD (0xD177CF),HL
0x01010F  18 0B               JR 0x01011C
0x010111  ED 4B DB 77 D1      LD BC,(0xD177DB) ; D177DB
0x010116  03                  INC BC
0x010117  ED 43 DB 77 D1      [ld-mem-pair] {"pc":65815,"length":5,"nextPc":65820,"tag":"ld-mem-pair","addr":13727707,"pair":"bc","mode":"adl","modePrefix":null}
0x01011C  01 01 00 00         LD BC,0x000001
0x010120  ED 43 D8 77 D1      [ld-mem-pair] {"pc":65824,"length":5,"nextPc":65829,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x010125  C3 1F 02 01         JP 0x01021F
0x010129  2A DB 77 D1         LD HL,(0xD177DB) ; D177DB
0x01012D  09                  [add-pair] {"pc":65837,"length":1,"nextPc":65838,"tag":"add-pair","dest":"hl","src":"bc","mode":"adl","modePrefix":null}
0x01012E  7E                  [ld-reg-ind] {"pc":65838,"length":1,"nextPc":65839,"tag":"ld-reg-ind","dest":"a","src":"hl","mode":"adl","modePrefix":null}
0x01012F  B7                  OR A
0x010130  ED 62               [sbc-pair] {"pc":65840,"length":2,"nextPc":65842,"tag":"sbc-pair","src":"hl","mode":"adl","modePrefix":null}
0x010132  6F                  LD L,A
0x010133  B7                  OR A
0x010134  01 1E 00 00         LD BC,0x00001E
0x010138  ED 42               [sbc-pair] {"pc":65848,"length":2,"nextPc":65850,"tag":"sbc-pair","src":"bc","mode":"adl","modePrefix":null}
0x01013A  20 30               JR NZ,0x01016C
0x01013C  2A D8 77 D1         LD HL,(0xD177D8) ; D177D8
0x010140  B7                  OR A
0x010141  ED 42               [sbc-pair] {"pc":65857,"length":2,"nextPc":65859,"tag":"sbc-pair","src":"bc","mode":"adl","modePrefix":null}
0x010143  30 0F               JR NC,0x010154
0x010145  ED 4B D8 77 D1      LD BC,(0xD177D8) ; D177D8
0x01014A  03                  INC BC
0x01014B  ED 43 D8 77 D1      [ld-mem-pair] {"pc":65867,"length":5,"nextPc":65872,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x010150  C3 1F 02 01         JP 0x01021F
0x010154  ED 4B DB 77 D1      LD BC,(0xD177DB) ; D177DB
0x010159  03                  INC BC
0x01015A  ED 43 DB 77 D1      [ld-mem-pair] {"pc":65882,"length":5,"nextPc":65887,"tag":"ld-mem-pair","addr":13727707,"pair":"bc","mode":"adl","modePrefix":null}
0x01015F  01 01 00 00         LD BC,0x000001
0x010163  ED 43 D8 77 D1      [ld-mem-pair] {"pc":65891,"length":5,"nextPc":65896,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x010168  C3 1F 02 01         JP 0x01021F
0x01016C  01 1C 00 00         LD BC,0x00001C
0x010170  2A D8 77 D1         LD HL,(0xD177D8) ; D177D8
0x010174  B7                  OR A
0x010175  ED 42               [sbc-pair] {"pc":65909,"length":2,"nextPc":65911,"tag":"sbc-pair","src":"bc","mode":"adl","modePrefix":null}
0x010177  30 0F               JR NC,0x010188
0x010179  ED 4B D8 77 D1      LD BC,(0xD177D8) ; D177D8
0x01017E  03                  INC BC
0x01017F  ED 43 D8 77 D1      [ld-mem-pair] {"pc":65919,"length":5,"nextPc":65924,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x010184  C3 1F 02 01         JP 0x01021F
0x010188  2A D8 77 D1         LD HL,(0xD177D8) ; D177D8
0x01018C  B7                  OR A
0x01018D  ED 42               [sbc-pair] {"pc":65933,"length":2,"nextPc":65935,"tag":"sbc-pair","src":"bc","mode":"adl","modePrefix":null}
0x01018F  20 7A               JR NZ,0x01020B
0x010191  2A CF 77 D1         LD HL,(0xD177CF)
0x010195  01 90 01 00         LD BC,0x000190
0x010199  CD F0 22 00         CALL 0x0022F0
0x01019D  CD C2 21 00         CALL 0x0021C2
0x0101A1  20 0D               JR NZ,0x0101B0
0x0101A3  ED 4B D8 77 D1      LD BC,(0xD177D8) ; D177D8
0x0101A8  03                  INC BC
0x0101A9  ED 43 D8 77 D1      [ld-mem-pair] {"pc":65961,"length":5,"nextPc":65966,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x0101AE  18 6F               JR 0x01021F
0x0101B0  2A CF 77 D1         LD HL,(0xD177CF)
0x0101B4  01 64 00 00         LD BC,0x000064
0x0101B8  CD F0 22 00         CALL 0x0022F0
0x0101BC  CD C2 21 00         CALL 0x0021C2
0x0101C0  20 16               JR NZ,0x0101D8
0x0101C2  ED 4B DB 77 D1      LD BC,(0xD177DB) ; D177DB
0x0101C7  03                  INC BC
0x0101C8  ED 43 DB 77 D1      [ld-mem-pair] {"pc":65992,"length":5,"nextPc":65997,"tag":"ld-mem-pair","addr":13727707,"pair":"bc","mode":"adl","modePrefix":null}
0x0101CD  01 01 00 00         LD BC,0x000001
0x0101D1  ED 43 D8 77 D1      [ld-mem-pair] {"pc":66001,"length":5,"nextPc":66006,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x0101D6  18 47               JR 0x01021F
0x0101D8  3A CF 77 D1         LD A,(0xD177CF)
0x0101DC  E6 03               AND 0x03
0x0101DE  B7                  OR A
0x0101DF  ED 62               [sbc-pair] {"pc":66015,"length":2,"nextPc":66017,"tag":"sbc-pair","src":"hl","mode":"adl","modePrefix":null}
0x0101E1  6F                  LD L,A
0x0101E2  CD C2 21 00         CALL 0x0021C2
0x0101E6  20 0D               JR NZ,0x0101F5
0x0101E8  ED 4B D8 77 D1      LD BC,(0xD177D8) ; D177D8
0x0101ED  03                  INC BC
0x0101EE  ED 43 D8 77 D1      [ld-mem-pair] {"pc":66030,"length":5,"nextPc":66035,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x0101F3  18 2A               JR 0x01021F
0x0101F5  ED 4B DB 77 D1      LD BC,(0xD177DB) ; D177DB
0x0101FA  03                  INC BC
0x0101FB  ED 43 DB 77 D1      [ld-mem-pair] {"pc":66043,"length":5,"nextPc":66048,"tag":"ld-mem-pair","addr":13727707,"pair":"bc","mode":"adl","modePrefix":null}
0x010200  01 01 00 00         LD BC,0x000001
0x010204  ED 43 D8 77 D1      [ld-mem-pair] {"pc":66052,"length":5,"nextPc":66057,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x010209  18 14               JR 0x01021F
0x01020B  ED 4B DB 77 D1      LD BC,(0xD177DB) ; D177DB
0x010210  03                  INC BC
0x010211  ED 43 DB 77 D1      [ld-mem-pair] {"pc":66065,"length":5,"nextPc":66070,"tag":"ld-mem-pair","addr":13727707,"pair":"bc","mode":"adl","modePrefix":null}
0x010216  01 01 00 00         LD BC,0x000001
0x01021A  ED 43 D8 77 D1      [ld-mem-pair] {"pc":66074,"length":5,"nextPc":66079,"tag":"ld-mem-pair","addr":13727704,"pair":"bc","mode":"adl","modePrefix":null}
0x01021F  C9                  RET
```

### CALL Targets

| Address | Target | Condition |
| --- | --- | --- |
| 0x010199 | 0x0022F0 | unconditional |
| 0x01019D | 0x0021C2 | unconditional |
| 0x0101B8 | 0x0022F0 | unconditional |
| 0x0101BC | 0x0021C2 | unconditional |
| 0x0101E2 | 0x0021C2 | unconditional |

### RAM Reads

| Address | Source | Register |
| --- | --- | --- |
| 0x010094 | 0xD177DB D177DB | hl |
| 0x0100A4 | 0xD177D8 D177D8 | hl |
| 0x0100AD | 0xD177D8 D177D8 | bc |
| 0x0100C0 | 0xD177DB D177DB | hl |
| 0x0100D2 | 0xD177DE  | bc |
| 0x0100DD | 0xD177DE  | bc |
| 0x0100EB | 0xD177CC  | iy |
| 0x010101 | 0xD177DE  | bc |
| 0x010106 | 0xD177CC  | hl |
| 0x010111 | 0xD177DB D177DB | bc |
| 0x010129 | 0xD177DB D177DB | hl |
| 0x01013C | 0xD177D8 D177D8 | hl |
| 0x010145 | 0xD177D8 D177D8 | bc |
| 0x010154 | 0xD177DB D177DB | bc |
| 0x010170 | 0xD177D8 D177D8 | hl |
| 0x010179 | 0xD177D8 D177D8 | bc |
| 0x010188 | 0xD177D8 D177D8 | hl |
| 0x010191 | 0xD177CF  | hl |
| 0x0101A3 | 0xD177D8 D177D8 | bc |
| 0x0101B0 | 0xD177CF  | hl |
| 0x0101C2 | 0xD177DB D177DB | bc |
| 0x0101D8 | 0xD177CF  | a |
| 0x0101E8 | 0xD177D8 D177D8 | bc |
| 0x0101F5 | 0xD177DB D177DB | bc |
| 0x01020B | 0xD177DB D177DB | bc |

### RAM Writes

| Address | Target | Register |
| --- | --- | --- |
| 0x01010B | 0xD177CF  | hl |

### Branch Targets

| Address | Type | Target | Condition |
| --- | --- | --- | --- |
| 0x01009C | jp-conditional | 0x010129 | nz |
| 0x0100AB | jr-conditional | 0x0100BC | nc |
| 0x0100B8 | jp | 0x01021F | unconditional |
| 0x0100C7 | jr-conditional | 0x010111 | nz |
| 0x0100E9 | jr-conditional | 0x010101 | nc |
| 0x01010F | jr | 0x01011C | unconditional |
| 0x010125 | jp | 0x01021F | unconditional |
| 0x01013A | jr-conditional | 0x01016C | nz |
| 0x010143 | jr-conditional | 0x010154 | nc |
| 0x010150 | jp | 0x01021F | unconditional |
| 0x010168 | jp | 0x01021F | unconditional |
| 0x010177 | jr-conditional | 0x010188 | nc |
| 0x010184 | jp | 0x01021F | unconditional |
| 0x01018F | jr-conditional | 0x01020B | nz |
| 0x0101A1 | jr-conditional | 0x0101B0 | nz |
| 0x0101AE | jr | 0x01021F | unconditional |
| 0x0101C0 | jr-conditional | 0x0101D8 | nz |
| 0x0101D6 | jr | 0x01021F | unconditional |
| 0x0101E6 | jr-conditional | 0x0101F5 | nz |
| 0x0101F3 | jr | 0x01021F | unconditional |
| 0x010209 | jr | 0x01021F | unconditional |

## Part B: D000BF Reference Map

- **Total references**: 59
- **Byte reads** (LD A,(D000BF)): 0
- **Byte writes** (LD (D000BF),A): 0
- **IY-relative bit ops** (IY+0x3F): 59
- **Pair loads**: 0

### All References (sorted by address)

| Address | Instruction | Type |
| --- | --- | --- |
| 0x007AE8 | BIT 3,(IY+0x3F) | test |
| 0x01028F | SET 5,(IY+0x3F) | set |
| 0x025AAF | RES 7,(IY+0x3F) | clear |
| 0x02FE27 | BIT 5,(IY+0x3F) | test |
| 0x03D0DC | SET 5,(IY+0x3F) | set |
| 0x03F0C5 | RES 0,(IY+0x3F) | clear |
| 0x03F0CC | SET 0,(IY+0x3F) | set |
| 0x03F0D0 | RES 1,(IY+0x3F) | clear |
| 0x03F0D7 | SET 1,(IY+0x3F) | set |
| 0x03F0EC | SET 2,(IY+0x3F) | set |
| 0x03F0F2 | RES 2,(IY+0x3F) | clear |
| 0x03FEAF | SET 4,(IY+0x3F) | set |
| 0x03FEB7 | BIT 2,(IY+0x3F) | test |
| 0x040C33 | BIT 6,(IY+0x3F) | test |
| 0x056BD6 | RES 5,(IY+0x3F) | clear |
| 0x056BDC | RES 5,(IY+0x3F) | clear |
| 0x056BFD | BIT 6,(IY+0x3F) | test |
| 0x056C06 | SET 4,(IY+0x3F) | set |
| 0x056C68 | RES 4,(IY+0x3F) | clear |
| 0x056CC6 | BIT 6,(IY+0x3F) | test |
| 0x056DDF | SET 2,(IY+0x3F) | set |
| 0x056DF3 | SET 2,(IY+0x3F) | set |
| 0x056E0E | RES 2,(IY+0x3F) | clear |
| 0x056E1A | SET 2,(IY+0x3F) | set |
| 0x056E37 | RES 0,(IY+0x3F) | clear |
| 0x056E3B | RES 1,(IY+0x3F) | clear |
| 0x056E47 | RES 1,(IY+0x3F) | clear |
| 0x056E54 | SET 1,(IY+0x3F) | set |
| 0x056E58 | SET 0,(IY+0x3F) | set |
| 0x056F8C | SET 2,(IY+0x3F) | set |
| 0x05700D | BIT 0,(IY+0x3F) | test |
| 0x057014 | BIT 1,(IY+0x3F) | test |
| 0x05701F | BIT 2,(IY+0x3F) | test |
| 0x05702A | RES 6,(IY+0x3F) | clear |
| 0x05702F | SET 6,(IY+0x3F) | set |
| 0x057092 | BIT 4,(IY+0x3F) | test |
| 0x0570B7 | BIT 4,(IY+0x3F) | test |
| 0x057494 | SET 2,(IY+0x3F) | set |
| 0x0575A7 | BIT 2,(IY+0x3F) | test |
| 0x0575CA | BIT 2,(IY+0x3F) | test |
| 0x08A6B3 | SET 7,(IY+0x3F) | set |
| 0x08A6D8 | RES 7,(IY+0x3F) | clear |
| 0x08A7A9 | RES 7,(IY+0x3F) | clear |
| 0x08AB46 | SET 7,(IY+0x3F) | set |
| 0x08ADD6 | SET 3,(IY+0x3F) | set |
| 0x08ADDD | RES 3,(IY+0x3F) | clear |
| 0x08AFDC | BIT 6,(IY+0x3F) | test |
| 0x08B0FD | RES 7,(IY+0x3F) | clear |
| 0x08B127 | RES 7,(IY+0x3F) | clear |
| 0x08B30B | BIT 7,(IY+0x3F) | test |
| 0x08B320 | BIT 7,(IY+0x3F) | test |
| 0x08B38D | BIT 7,(IY+0x3F) | test |
| 0x08B395 | BIT 7,(IY+0x3F) | test |
| 0x08C82D | RES 7,(IY+0x3F) | clear |
| 0x0B6E54 | RES 7,(IY+0x3F) | clear |
| 0x0B7203 | BIT 7,(IY+0x3F) | test |
| 0x0B7218 | BIT 7,(IY+0x3F) | test |
| 0x0B729A | BIT 7,(IY+0x3F) | test |
| 0x0B72A2 | BIT 7,(IY+0x3F) | test |

### Bit Usage Summary

| Bit | BIT (test) | SET | RES |
| --- | --- | --- | --- |
| 0 | 1 | 2 | 2 |
| 1 | 1 | 2 | 3 |
| 2 | 4 | 6 | 2 |
| 3 | 1 | 1 | 1 |
| 4 | 2 | 2 | 1 |
| 5 | 1 | 2 | 2 |
| 6 | 4 | 1 | 1 |
| 7 | 8 | 2 | 7 |

### Context Snippets

#### 0x007AE8: BIT 3,(IY+0x3F)

```text
    0x007AE1  00                  NOP
    0x007AE2  FD 21 80 00 D0      LD IY,0xD00080
    0x007AE7  AF                  XOR A
>>> 0x007AE8  FD CB 3F 5E         BIT 3,(IY+63)
    0x007AEC  C8                  RET Z
    0x007AED  3C                  INC A
    0x007AEE  C9                  RET
```

#### 0x01028F: SET 5,(IY+0x3F)

```text
    0x010284  32 D6 77 D1         LD (0xD177D6),A
    0x010288  FD E5               PUSH IY
    0x01028A  FD 21 80 00 D0      LD IY,0xD00080
>>> 0x01028F  FD CB 3F EE         SET 5,(IY+63)
    0x010293  FD E1               POP IY
    0x010295  2A C0 77 D1         LD HL,(0xD177C0)
    0x010299  CD C2 21 00         CALL 0x0021C2
```

#### 0x025AAF: RES 7,(IY+0x3F)

```text
    0x025AA9  F9                  [ld-sp-hl] {"pc":154281,"length":1,"nextPc":154282,"tag":"ld-sp-hl","mode":"adl","modePrefix":null}
    0x025AAA  07                  [rlca] {"pc":154282,"length":1,"nextPc":154283,"tag":"rlca","mode":"adl","modePrefix":null}
    0x025AAB  FD CB 2A 8E         RES 1,(IY+42)
>>> 0x025AAF  FD CB 3F BE         RES 7,(IY+63)
    0x025AB3  FD CB 34 BE         RES 7,(IY+52)
    0x025AB7  21 09 27 D0         LD HL,0xD02709
    0x025ABB  CD 02 28 0A         CALL 0x0A2802
```

#### 0x02FE27: BIT 5,(IY+0x3F)

```text
    0x02FE21  AF                  XOR A
    0x02FE22  C9                  RET
    0x02FE23  FD CB 16 C6         SET 0,(IY+22)
>>> 0x02FE27  FD CB 3F 6E         BIT 5,(IY+63)
    0x02FE2B  C4 DC 6B 05         CALL NZ,0x056BDC
    0x02FE2F  CD 40 0D 04         CALL 0x040D40
    0x02FE33  FD CB 41 5E         BIT 3,(IY+65)
```

#### 0x03D0DC: SET 5,(IY+0x3F)

```text
    0x03D0D4  18 0A               JR 0x03D0E0
    0x03D0D6  FD CB 51 7E         BIT 7,(IY+81)
    0x03D0DA  28 04               JR Z,0x03D0E0
>>> 0x03D0DC  FD CB 3F EE         SET 5,(IY+63)
    0x03D0E0  E1                  POP HL
    0x03D0E1  22 D7 2A D0         LD (0xD02AD7),HL
    0x03D0E5  FD 21 80 00 D0      LD IY,0xD00080
```

#### 0x03F0C5: RES 0,(IY+0x3F)

```text
    0x03F0BD  28 1C               JR Z,0x03F0DB
    0x03F0BF  FE 04               CP 0x04
    0x03F0C1  D2 2C 1D 06         JP NC,0x061D2C
>>> 0x03F0C5  FD CB 3F 86         RES 0,(IY+63)
    0x03F0C9  3D                  DEC A
    0x03F0CA  28 0F               JR Z,0x03F0DB
    0x03F0CC  FD CB 3F C6         SET 0,(IY+63)
```

#### 0x03F0CC: SET 0,(IY+0x3F)

```text
    0x03F0C5  FD CB 3F 86         RES 0,(IY+63)
    0x03F0C9  3D                  DEC A
    0x03F0CA  28 0F               JR Z,0x03F0DB
>>> 0x03F0CC  FD CB 3F C6         SET 0,(IY+63)
    0x03F0D0  FD CB 3F 8E         RES 1,(IY+63)
    0x03F0D4  3D                  DEC A
    0x03F0D5  28 04               JR Z,0x03F0DB
```

#### 0x03F0D0: RES 1,(IY+0x3F)

```text
    0x03F0C9  3D                  DEC A
    0x03F0CA  28 0F               JR Z,0x03F0DB
    0x03F0CC  FD CB 3F C6         SET 0,(IY+63)
>>> 0x03F0D0  FD CB 3F 8E         RES 1,(IY+63)
    0x03F0D4  3D                  DEC A
    0x03F0D5  28 04               JR Z,0x03F0DB
    0x03F0D7  FD CB 3F CE         SET 1,(IY+63)
```

#### 0x03F0D7: SET 1,(IY+0x3F)

```text
    0x03F0D0  FD CB 3F 8E         RES 1,(IY+63)
    0x03F0D4  3D                  DEC A
    0x03F0D5  28 04               JR Z,0x03F0DB
>>> 0x03F0D7  FD CB 3F CE         SET 1,(IY+63)
    0x03F0DB  3A A8 08 D0         LD A,(0xD008A8)
    0x03F0DF  B7                  OR A
    0x03F0E0  28 14               JR Z,0x03F0F6
```

#### 0x03F0EC: SET 2,(IY+0x3F)

```text
    0x03F0E4  28 0C               JR Z,0x03F0F2
    0x03F0E6  FE 18               CP 0x18
    0x03F0E8  C2 2C 1D 06         JP NZ,0x061D2C
>>> 0x03F0EC  FD CB 3F D6         SET 2,(IY+63)
    0x03F0F0  18 04               JR 0x03F0F6
    0x03F0F2  FD CB 3F 96         RES 2,(IY+63)
    0x03F0F6  3A A9 08 D0         LD A,(0xD008A9)
```

#### 0x03F0F2: RES 2,(IY+0x3F)

```text
    0x03F0E8  C2 2C 1D 06         JP NZ,0x061D2C
    0x03F0EC  FD CB 3F D6         SET 2,(IY+63)
    0x03F0F0  18 04               JR 0x03F0F6
>>> 0x03F0F2  FD CB 3F 96         RES 2,(IY+63)
    0x03F0F6  3A A9 08 D0         LD A,(0xD008A9)
    0x03F0FA  FE 80               CP 0x80
    0x03F0FC  28 12               JR Z,0x03F110
```

#### 0x03FEAF: SET 4,(IY+0x3F)

```text
    0x03FEAB  D5                  PUSH DE
    0x03FEAC  E5                  PUSH HL
    0x03FEAD  FD E5               PUSH IY
>>> 0x03FEAF  FD CB 3F E6         SET 4,(IY+63)
    0x03FEB3  11 00 00 00         LD DE,0x000000
    0x03FEB7  FD CB 3F 56         BIT 2,(IY+63)
    0x03FEBB  28 01               JR Z,0x03FEBE
```

#### 0x03FEB7: BIT 2,(IY+0x3F)

```text
    0x03FEAD  FD E5               PUSH IY
    0x03FEAF  FD CB 3F E6         SET 4,(IY+63)
    0x03FEB3  11 00 00 00         LD DE,0x000000
>>> 0x03FEB7  FD CB 3F 56         BIT 2,(IY+63)
    0x03FEBB  28 01               JR Z,0x03FEBE
    0x03FEBD  1C                  INC E
    0x03FEBE  D5                  PUSH DE
```

#### 0x040C33: BIT 6,(IY+0x3F)

```text
    0x040C26  21 54 C7 08         LD HL,0x08C754
    0x040C2A  CD EF 1D 06         CALL 0x061DEF
    0x040C2E  ED 73 FA 07 D0      [ld-mem-pair] {"pc":265262,"length":5,"nextPc":265267,"tag":"ld-mem-pair","addr":13633530,"pair":"sp","mode":"adl","modePrefix":null}
>>> 0x040C33  FD CB 3F 76         BIT 6,(IY+63)
    0x040C37  FD CB 43 8E         RES 1,(IY+67)
    0x040C3B  CD 41 0C 04         CALL 0x040C41
    0x040C3F  18 15               JR 0x040C56
```

#### 0x056BD6: RES 5,(IY+0x3F)

```text
    0x056BCC  32 91 05 D0         LD (0xD00591),A
    0x056BD0  FD CB 1B E6         SET 4,(IY+27)
    0x056BD4  18 10               JR 0x056BE6
>>> 0x056BD6  FD CB 3F AE         RES 5,(IY+63)
    0x056BDA  18 0F               JR 0x056BEB
    0x056BDC  FD CB 3F AE         RES 5,(IY+63)
    0x056BE0  CD 11 71 02         CALL 0x027111
```

#### 0x056BDC: RES 5,(IY+0x3F)

```text
    0x056BD4  18 10               JR 0x056BE6
    0x056BD6  FD CB 3F AE         RES 5,(IY+63)
    0x056BDA  18 0F               JR 0x056BEB
>>> 0x056BDC  FD CB 3F AE         RES 5,(IY+63)
    0x056BE0  CD 11 71 02         CALL 0x027111
    0x056BE4  38 DF               JR C,0x056BC5
    0x056BE6  FD CB 09 56         BIT 2,(IY+9)
```

#### 0x056BFD: BIT 6,(IY+0x3F)

```text
    0x056BF7  C0                  RET NZ
    0x056BF8  CD 1D BF 08         CALL 0x08BF1D
    0x056BFC  C0                  RET NZ
>>> 0x056BFD  FD CB 3F 76         BIT 6,(IY+63)
    0x056C01  C8                  RET Z
    0x056C02  ED 57               [ld-special] {"pc":355330,"length":2,"nextPc":355332,"tag":"ld-special","dest":"a","src":"i","mode":"adl","modePrefix":null}
    0x056C04  F5                  PUSH AF
```

#### 0x056C06: SET 4,(IY+0x3F)

```text
    0x056C02  ED 57               [ld-special] {"pc":355330,"length":2,"nextPc":355332,"tag":"ld-special","dest":"a","src":"i","mode":"adl","modePrefix":null}
    0x056C04  F5                  PUSH AF
    0x056C05  F3                  DI
>>> 0x056C06  FD CB 3F E6         SET 4,(IY+63)
    0x056C0A  11 24 06 D0         LD DE,0xD00624
    0x056C0E  CD 80 70 05         CALL 0x057080
    0x056C12  11 2F 06 D0         LD DE,0xD0062F
```

#### 0x056C68: RES 4,(IY+0x3F)

```text
    0x056C5C  CD 18 27 0A         CALL 0x0A2718
    0x056C60  21 3C 01 00         LD HL,0x00013C
    0x056C64  40 22 7F 01         LD (0x00017F),HL
>>> 0x056C68  FD CB 3F A6         RES 4,(IY+63)
    0x056C6C  F1                  POP AF
    0x056C6D  E2 72 6C 05         JP PO,0x056C72
    0x056C71  FB                  EI
```

#### 0x056CC6: BIT 6,(IY+0x3F)

```text
    0x056CBC  FE 0D               CP 0x0D
    0x056CBE  CA 1D 70 05         JP Z,0x05701D
    0x056CC2  CD C2 FA 07         CALL 0x07FAC2
>>> 0x056CC6  FD CB 3F 76         BIT 6,(IY+63)
    0x056CCA  C8                  RET Z
    0x056CCB  3E 10               LD A,0x10
    0x056CCD  32 FA 05 D0         LD (0xD005FA),A
```

#### 0x056DDF: SET 2,(IY+0x3F)

```text
    0x056DD7  C3 02 29 08         JP 0x082902
    0x056DDB  FD 7E 3F            LD A,(IX+63)
    0x056DDE  F5                  PUSH AF
>>> 0x056DDF  FD CB 3F D6         SET 2,(IY+63)
    0x056DE3  CD 5D 6E 05         CALL 0x056E5D
    0x056DE7  F1                  POP AF
    0x056DE8  FD 77 3F            LD (IX+63),A
```

#### 0x056DF3: SET 2,(IY+0x3F)

```text
    0x056DEB  C3 14 72 05         JP 0x057214
    0x056DEF  FD 7E 3F            LD A,(IX+63)
    0x056DF2  F5                  PUSH AF
>>> 0x056DF3  FD CB 3F D6         SET 2,(IY+63)
    0x056DF7  CD 5D 6E 05         CALL 0x056E5D
    0x056DFB  CD 0B 6F 05         CALL 0x056F0B
    0x056DFF  F1                  POP AF
```

#### 0x056E0E: RES 2,(IY+0x3F)

```text
    0x056E04  21 0C 00 00         LD HL,0x00000C
    0x056E08  CD 1F 6E 05         CALL 0x056E1F
    0x056E0C  20 05               JR NZ,0x056E13
>>> 0x056E0E  FD CB 3F 96         RES 2,(IY+63)
    0x056E12  C9                  RET
    0x056E13  29                  [add-pair] {"pc":355859,"length":1,"nextPc":355860,"tag":"add-pair","dest":"hl","src":"hl","mode":"adl","modePrefix":null}
    0x056E14  CD 79 C9 04         CALL 0x04C979
```

#### 0x056E1A: SET 2,(IY+0x3F)

```text
    0x056E13  29                  [add-pair] {"pc":355859,"length":1,"nextPc":355860,"tag":"add-pair","dest":"hl","src":"hl","mode":"adl","modePrefix":null}
    0x056E14  CD 79 C9 04         CALL 0x04C979
    0x056E18  20 5B               JR NZ,0x056E75
>>> 0x056E1A  FD CB 3F D6         SET 2,(IY+63)
    0x056E1E  C9                  RET
    0x056E1F  E5                  PUSH HL
    0x056E20  CD 82 01 08         CALL 0x080182
```

#### 0x056E37: RES 0,(IY+0x3F)

```text
    0x056E2D  21 01 00 00         LD HL,0x000001
    0x056E31  CD 1F 6E 05         CALL 0x056E1F
    0x056E35  20 09               JR NZ,0x056E40
>>> 0x056E37  FD CB 3F 86         RES 0,(IY+63)
    0x056E3B  FD CB 3F 8E         RES 1,(IY+63)
    0x056E3F  C9                  RET
    0x056E40  23                  INC HL
```

#### 0x056E3B: RES 1,(IY+0x3F)

```text
    0x056E31  CD 1F 6E 05         CALL 0x056E1F
    0x056E35  20 09               JR NZ,0x056E40
    0x056E37  FD CB 3F 86         RES 0,(IY+63)
>>> 0x056E3B  FD CB 3F 8E         RES 1,(IY+63)
    0x056E3F  C9                  RET
    0x056E40  23                  INC HL
    0x056E41  CD 79 C9 04         CALL 0x04C979
```

#### 0x056E47: RES 1,(IY+0x3F)

```text
    0x056E40  23                  INC HL
    0x056E41  CD 79 C9 04         CALL 0x04C979
    0x056E45  20 06               JR NZ,0x056E4D
>>> 0x056E47  FD CB 3F 8E         RES 1,(IY+63)
    0x056E4B  18 0B               JR 0x056E58
    0x056E4D  23                  INC HL
    0x056E4E  CD 79 C9 04         CALL 0x04C979
```

#### 0x056E54: SET 1,(IY+0x3F)

```text
    0x056E4D  23                  INC HL
    0x056E4E  CD 79 C9 04         CALL 0x04C979
    0x056E52  20 21               JR NZ,0x056E75
>>> 0x056E54  FD CB 3F CE         SET 1,(IY+63)
    0x056E58  FD CB 3F C6         SET 0,(IY+63)
    0x056E5C  C9                  RET
    0x056E5D  CD C5 75 05         CALL 0x0575C5
```

#### 0x056E58: SET 0,(IY+0x3F)

```text
    0x056E4E  CD 79 C9 04         CALL 0x04C979
    0x056E52  20 21               JR NZ,0x056E75
    0x056E54  FD CB 3F CE         SET 1,(IY+63)
>>> 0x056E58  FD CB 3F C6         SET 0,(IY+63)
    0x056E5C  C9                  RET
    0x056E5D  CD C5 75 05         CALL 0x0575C5
    0x056E61  CD 61 29 08         CALL 0x082961
```

#### 0x056F8C: SET 2,(IY+0x3F)

```text
    0x056F87  C9                  RET
    0x056F88  FD 7E 3F            LD A,(IX+63)
    0x056F8B  F5                  PUSH AF
>>> 0x056F8C  FD CB 3F D6         SET 2,(IY+63)
    0x056F90  CD C5 75 05         CALL 0x0575C5
    0x056F94  FD E5               PUSH IY
    0x056F96  21 03 06 D0         LD HL,0xD00603
```

#### 0x05700D: BIT 0,(IY+0x3F)

```text
    0x057003  CD 90 74 05         CALL 0x057490
    0x057007  C3 31 73 05         JP 0x057331
    0x05700B  3E 01               LD A,0x01
>>> 0x05700D  FD CB 3F 46         BIT 0,(IY+63)
    0x057011  28 13               JR Z,0x057026
    0x057013  3C                  INC A
    0x057014  FD CB 3F 4E         BIT 1,(IY+63)
```

#### 0x057014: BIT 1,(IY+0x3F)

```text
    0x05700D  FD CB 3F 46         BIT 0,(IY+63)
    0x057011  28 13               JR Z,0x057026
    0x057013  3C                  INC A
>>> 0x057014  FD CB 3F 4E         BIT 1,(IY+63)
    0x057018  28 0C               JR Z,0x057026
    0x05701A  3C                  INC A
    0x05701B  18 09               JR 0x057026
```

#### 0x05701F: BIT 2,(IY+0x3F)

```text
    0x05701A  3C                  INC A
    0x05701B  18 09               JR 0x057026
    0x05701D  3E 0C               LD A,0x0C
>>> 0x05701F  FD CB 3F 56         BIT 2,(IY+63)
    0x057023  28 01               JR Z,0x057026
    0x057025  87                  ADD A
    0x057026  C3 AE 72 05         JP 0x0572AE
```

#### 0x05702A: RES 6,(IY+0x3F)

```text
    0x057023  28 01               JR Z,0x057026
    0x057025  87                  ADD A
    0x057026  C3 AE 72 05         JP 0x0572AE
>>> 0x05702A  FD CB 3F B6         RES 6,(IY+63)
    0x05702E  C9                  RET
    0x05702F  FD CB 3F F6         SET 6,(IY+63)
    0x057033  C9                  RET
```

#### 0x05702F: SET 6,(IY+0x3F)

```text
    0x057026  C3 AE 72 05         JP 0x0572AE
    0x05702A  FD CB 3F B6         RES 6,(IY+63)
    0x05702E  C9                  RET
>>> 0x05702F  FD CB 3F F6         SET 6,(IY+63)
    0x057033  C9                  RET
    0x057034  FD 7E 3F            LD A,(IX+63)
    0x057037  F5                  PUSH AF
```

#### 0x057092: BIT 4,(IY+0x3F)

```text
    0x05708E  7E                  [ld-reg-ind] {"pc":356494,"length":1,"nextPc":356495,"tag":"ld-reg-ind","dest":"a","src":"hl","mode":"adl","modePrefix":null}
    0x05708F  B7                  OR A
    0x057090  28 11               JR Z,0x0570A3
>>> 0x057092  FD CB 3F 66         BIT 4,(IY+63)
    0x057096  20 06               JR NZ,0x05709E
    0x057098  FE 2F               CP 0x2F
    0x05709A  20 02               JR NZ,0x05709E
```

#### 0x0570B7: BIT 4,(IY+0x3F)

```text
    0x0570B3  7E                  [ld-reg-ind] {"pc":356531,"length":1,"nextPc":356532,"tag":"ld-reg-ind","dest":"a","src":"hl","mode":"adl","modePrefix":null}
    0x0570B4  B7                  OR A
    0x0570B5  28 19               JR Z,0x0570D0
>>> 0x0570B7  FD CB 3F 66         BIT 4,(IY+63)
    0x0570BB  20 0E               JR NZ,0x0570CB
    0x0570BD  FE 3A               CP 0x3A
    0x0570BF  20 04               JR NZ,0x0570C5
```

#### 0x057494: SET 2,(IY+0x3F)

```text
    0x05748C  C3 46 1D 06         JP 0x061D46
    0x057490  FD 7E 3F            LD A,(IX+63)
    0x057493  F5                  PUSH AF
>>> 0x057494  FD CB 3F D6         SET 2,(IY+63)
    0x057498  CD C5 75 05         CALL 0x0575C5
    0x05749C  CD D9 F7 05         CALL 0x05F7D9
    0x0574A0  CD C4 F8 0A         CALL 0x0AF8C4
```

#### 0x0575A7: BIT 2,(IY+0x3F)

```text
    0x05759B  CD D8 6C 05         CALL 0x056CD8
    0x05759F  21 1C 2B D0         LD HL,0xD02B1C
    0x0575A3  CD FB F9 07         CALL 0x07F9FB
>>> 0x0575A7  FD CB 3F 56         BIT 2,(IY+63)
    0x0575AB  CC 2C 74 05         CALL Z,0x05742C
    0x0575AF  CD 61 29 08         CALL 0x082961
    0x0575B3  21 25 2B D0         LD HL,0xD02B25
```

#### 0x0575CA: BIT 2,(IY+0x3F)

```text
    0x0575C4  C9                  RET
    0x0575C5  D5                  PUSH DE
    0x0575C6  11 80 00 00         LD DE,0x000080
>>> 0x0575CA  FD CB 3F 56         BIT 2,(IY+63)
    0x0575CE  28 01               JR Z,0x0575D1
    0x0575D0  1C                  INC E
    0x0575D1  FD E5               PUSH IY
```

#### 0x08A6B3: SET 7,(IY+0x3F)

```text
    0x08A6AA  CD 83 2A 02         CALL 0x022A83
    0x08A6AE  CD 66 2A 02         CALL 0x022A66
    0x08A6B2  C9                  RET
>>> 0x08A6B3  FD CB 3F FE         SET 7,(IY+63)
    0x08A6B7  CD 70 AB 08         CALL 0x08AB70
    0x08A6BB  97                  SUB A
    0x08A6BC  CD 42 AD 08         CALL 0x08AD42
```

#### 0x08A6D8: RES 7,(IY+0x3F)

```text
    0x08A6D0  28 0A               JR Z,0x08A6DC
    0x08A6D2  CD AE A7 08         CALL 0x08A7AE
    0x08A6D6  28 04               JR Z,0x08A6DC
>>> 0x08A6D8  FD CB 3F BE         RES 7,(IY+63)
    0x08A6DC  AF                  XOR A
    0x08A6DD  32 DF 08 D0         LD (0xD008DF),A
    0x08A6E1  4F                  LD C,A
```

#### 0x08A7A9: RES 7,(IY+0x3F)

```text
    0x08A7A6  1A                  [ld-reg-ind] {"pc":567206,"length":1,"nextPc":567207,"tag":"ld-reg-ind","dest":"a","src":"de","mode":"adl","modePrefix":null}
    0x08A7A7  1B                  DEC DE
    0x08A7A8  1C                  INC E
>>> 0x08A7A9  FD CB 3F BE         RES 7,(IY+63)
    0x08A7AD  C9                  RET
    0x08A7AE  3A E0 07 D0         LD A,(0xD007E0)
    0x08A7B2  FE 45               CP 0x45
```

#### 0x08AB46: SET 7,(IY+0x3F)

```text
    0x08AB3A  CD 20 A6 08         CALL 0x08A620
    0x08AB3E  CD 81 AB 08         CALL 0x08AB81
    0x08AB42  CD 55 76 05         CALL 0x057655
>>> 0x08AB46  FD CB 3F FE         SET 7,(IY+63)
    0x08AB4A  3E FF               LD A,0xFF
    0x08AB4C  32 9A 06 D0         LD (0xD0069A),A
    0x08AB50  CD 56 AD 08         CALL 0x08AD56
```

#### 0x08ADD6: SET 3,(IY+0x3F)

```text
    0x08ADCF  B8                  CP B
    0x08ADD0  28 0F               JR Z,0x08ADE1
    0x08ADD2  FD CB 40 E6         SET 4,(IY+64)
>>> 0x08ADD6  FD CB 3F DE         SET 3,(IY+63)
    0x08ADDA  B7                  OR A
    0x08ADDB  20 04               JR NZ,0x08ADE1
    0x08ADDD  FD CB 3F 9E         RES 3,(IY+63)
```

#### 0x08ADDD: RES 3,(IY+0x3F)

```text
    0x08ADD6  FD CB 3F DE         SET 3,(IY+63)
    0x08ADDA  B7                  OR A
    0x08ADDB  20 04               JR NZ,0x08ADE1
>>> 0x08ADDD  FD CB 3F 9E         RES 3,(IY+63)
    0x08ADE1  18 3F               JR 0x08AE22
    0x08ADE3  FE 04               CP 0x04
    0x08ADE5  20 2A               JR NZ,0x08AE11
```

#### 0x08AFDC: BIT 6,(IY+0x3F)

```text
    0x08AFD4  20 0B               JR NZ,0x08AFE1
    0x08AFD6  CD 1D BF 08         CALL 0x08BF1D
    0x08AFDA  20 05               JR NZ,0x08AFE1
>>> 0x08AFDC  FD CB 3F 76         BIT 6,(IY+63)
    0x08AFE0  C0                  RET NZ
    0x08AFE1  32 00 25 D0         LD (0xD02500),A
    0x08AFE5  CD 83 2A 02         CALL 0x022A83
```

#### 0x08B0FD: RES 7,(IY+0x3F)

```text
    0x08B0F5  20 0E               JR NZ,0x08B105
    0x08B0F7  3E 40               LD A,0x40
    0x08B0F9  32 E0 07 D0         LD (0xD007E0),A
>>> 0x08B0FD  FD CB 3F BE         RES 7,(IY+63)
    0x08B101  C3 A3 58 04         JP 0x0458A3
    0x08B105  FE 5A               CP 0x5A
    0x08B107  20 08               JR NZ,0x08B111
```

#### 0x08B127: RES 7,(IY+0x3F)

```text
    0x08B11F  20 18               JR NZ,0x08B139
    0x08B121  3E 40               LD A,0x40
    0x08B123  32 E0 07 D0         LD (0xD007E0),A
>>> 0x08B127  FD CB 3F BE         RES 7,(IY+63)
    0x08B12B  CD F2 6C 04         CALL 0x046CF2
    0x08B12F  3E FF               LD A,0xFF
    0x08B131  CD 06 6D 04         CALL 0x046D06
```

#### 0x08B30B: BIT 7,(IY+0x3F)

```text
    0x08B302  CD D3 B3 08         CALL 0x08B3D3
    0x08B306  F1                  POP AF
    0x08B307  FD CB 05 DE         SET 3,(IY+5)
>>> 0x08B30B  FD CB 3F 7E         BIT 7,(IY+63)
    0x08B30F  28 31               JR Z,0x08B342
    0x08B311  18 17               JR 0x08B32A
    0x08B313  DD 7E 07            LD A,(IX+7)
```

#### 0x08B320: BIT 7,(IY+0x3F)

```text
    0x08B316  FD CB 05 DE         SET 3,(IY+5)
    0x08B31A  FD CB 05 CE         SET 1,(IY+5)
    0x08B31E  E6 0F               AND 0x0F
>>> 0x08B320  FD CB 3F 7E         BIT 7,(IY+63)
    0x08B324  28 1C               JR Z,0x08B342
    0x08B326  CD 72 BE 08         CALL 0x08BE72
    0x08B32A  CD F8 B3 08         CALL 0x08B3F8
```

#### 0x08B38D: BIT 7,(IY+0x3F)

```text
    0x08B383  CD D3 B3 08         CALL 0x08B3D3
    0x08B387  18 04               JR 0x08B38D
    0x08B389  CD 72 BE 08         CALL 0x08BE72
>>> 0x08B38D  FD CB 3F 7E         BIT 7,(IY+63)
    0x08B391  CC 80 BC 08         CALL Z,0x08BC80
    0x08B395  FD CB 3F 7E         BIT 7,(IY+63)
    0x08B399  C4 91 BC 08         CALL NZ,0x08BC91
```

#### 0x08B395: BIT 7,(IY+0x3F)

```text
    0x08B389  CD 72 BE 08         CALL 0x08BE72
    0x08B38D  FD CB 3F 7E         BIT 7,(IY+63)
    0x08B391  CC 80 BC 08         CALL Z,0x08BC80
>>> 0x08B395  FD CB 3F 7E         BIT 7,(IY+63)
    0x08B399  C4 91 BC 08         CALL NZ,0x08BC91
    0x08B39D  DD CB 07 6E         BIT 5,(IX+7)
    0x08B3A1  28 28               JR Z,0x08B3CB
```

#### 0x08C82D: RES 7,(IY+0x3F)

```text
    0x08C825  D6 40               SUB 0x40
    0x08C827  20 04               JR NZ,0x08C82D
    0x08C829  FD CB 0C B6         RES 6,(IY+12)
>>> 0x08C82D  FD CB 3F BE         RES 7,(IY+63)
    0x08C831  CD 4B C9 08         CALL 0x08C94B
    0x08C835  F1                  POP AF
    0x08C836  E5                  PUSH HL
```

#### 0x0B6E54: RES 7,(IY+0x3F)

```text
    0x0B6E4C  28 0A               JR Z,0x0B6E58
    0x0B6E4E  CD D8 72 0B         CALL 0x0B72D8
    0x0B6E52  28 04               JR Z,0x0B6E58
>>> 0x0B6E54  FD CB 3F BE         RES 7,(IY+63)
    0x0B6E58  AF                  XOR A
    0x0B6E59  32 DF 08 D0         LD (0xD008DF),A
    0x0B6E5D  4F                  LD C,A
```

#### 0x0B7203: BIT 7,(IY+0x3F)

```text
    0x0B71FA  CD D3 B3 08         CALL 0x08B3D3
    0x0B71FE  F1                  POP AF
    0x0B71FF  FD CB 05 DE         SET 3,(IY+5)
>>> 0x0B7203  FD CB 3F 7E         BIT 7,(IY+63)
    0x0B7207  28 31               JR Z,0x0B723A
    0x0B7209  18 17               JR 0x0B7222
    0x0B720B  DD 7E 07            LD A,(IX+7)
```

#### 0x0B7218: BIT 7,(IY+0x3F)

```text
    0x0B720E  FD CB 05 DE         SET 3,(IY+5)
    0x0B7212  FD CB 05 CE         SET 1,(IY+5)
    0x0B7216  E6 0F               AND 0x0F
>>> 0x0B7218  FD CB 3F 7E         BIT 7,(IY+63)
    0x0B721C  28 1C               JR Z,0x0B723A
    0x0B721E  CD 72 BE 08         CALL 0x08BE72
    0x0B7222  CD F8 B3 08         CALL 0x08B3F8
```

#### 0x0B729A: BIT 7,(IY+0x3F)

```text
    0x0B7290  CD D3 B3 08         CALL 0x08B3D3
    0x0B7294  18 04               JR 0x0B729A
    0x0B7296  CD 72 BE 08         CALL 0x08BE72
>>> 0x0B729A  FD CB 3F 7E         BIT 7,(IY+63)
    0x0B729E  CC F4 72 0B         CALL Z,0x0B72F4
    0x0B72A2  FD CB 3F 7E         BIT 7,(IY+63)
    0x0B72A6  C4 05 73 0B         CALL NZ,0x0B7305
```

#### 0x0B72A2: BIT 7,(IY+0x3F)

```text
    0x0B7296  CD 72 BE 08         CALL 0x08BE72
    0x0B729A  FD CB 3F 7E         BIT 7,(IY+63)
    0x0B729E  CC F4 72 0B         CALL Z,0x0B72F4
>>> 0x0B72A2  FD CB 3F 7E         BIT 7,(IY+63)
    0x0B72A6  C4 05 73 0B         CALL NZ,0x0B7305
    0x0B72AA  DD CB 07 6E         BIT 5,(IX+7)
    0x0B72AE  28 20               JR Z,0x0B72D0
```

## Analysis

See report for full analysis (written by probe, then enriched manually).
