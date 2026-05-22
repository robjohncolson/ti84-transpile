# Phase 405 - Notification Payload Semantics

ROM: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ROM.rom
Handler table: 0x049D3A (_seqcase format)
Payload destination: 0xD177B8 (D177B8)
Type register: 0xD177B9 (D177B9)

## Executive Summary

- Handler table entries: 13 explicit + 1 default
- All handlers store (IX+6) to D177B8: **YES**
- Any handler has additional behavior beyond store: **NO**
- Total callers of 0x049CCA: 167 (166 CALL + 1 JP)
- Callers with resolved type: 158
- Callers with unresolved type: 9
- Distinct notification types: 13

## 1. Handler Selector Table at 0x049D3A

Format: _seqcase (rawCount=14, 13 cases + default)

| Type | Label | Handler Address | Classification |
| --- | --- | --- | --- |
| 0x01 | Home Screen | 0x049D77 | ALLOW |
| 0x02 | Y= | 0x049D80 | ALLOW |
| 0x03 | Window / Format | 0x049D89 | ALLOW |
| 0x04 | Zoom | 0x049D92 | ALLOW |
| 0x10 | Menu / Dialog | 0x049D9B | BLOCK |
| 0x11 | Stat / List Editor | 0x049DA4 | BLOCK |
| 0x12 | Matrix Editor | 0x049DAD | BLOCK |
| 0x13 | Graph Active | 0x049DB6 | BLOCK |
| 0x14 | Table | 0x049DBF | BLOCK |
| 0x15 | Distribution / Finance | 0x049DC8 | BLOCK |
| 0x16 | Catalog | 0x049DD1 | BLOCK |
| 0x17 | Program Editor | 0x049DDA | ALLOW |
| 0x18 | Apps / Memory | 0x049DE3 | ALLOW |
| default | (all other types) | 0x049DEC | DEFAULT |

## 2. Handler Body Analysis

### Handler Spacing

Handlers are spaced uniformly (gaps: 9 bytes).

### Handler at 0x049D77 [0x01 Home Screen]

```text
0x049D77  DD 7E 06          LD A, (IX+0x06)
0x049D7A  32 B8 77 D1       LD (0xD177B8), A
0x049D7E  18 79             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049D80 [0x02 Y=]

```text
0x049D80  DD 7E 06          LD A, (IX+0x06)
0x049D83  32 B8 77 D1       LD (0xD177B8), A
0x049D87  18 70             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049D89 [0x03 Window / Format]

```text
0x049D89  DD 7E 06          LD A, (IX+0x06)
0x049D8C  32 B8 77 D1       LD (0xD177B8), A
0x049D90  18 67             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049D92 [0x04 Zoom]

```text
0x049D92  DD 7E 06          LD A, (IX+0x06)
0x049D95  32 B8 77 D1       LD (0xD177B8), A
0x049D99  18 5E             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049D9B [0x10 Menu / Dialog]

```text
0x049D9B  DD 7E 06          LD A, (IX+0x06)
0x049D9E  32 B8 77 D1       LD (0xD177B8), A
0x049DA2  18 55             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049DA4 [0x11 Stat / List Editor]

```text
0x049DA4  DD 7E 06          LD A, (IX+0x06)
0x049DA7  32 B8 77 D1       LD (0xD177B8), A
0x049DAB  18 4C             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049DAD [0x12 Matrix Editor]

```text
0x049DAD  DD 7E 06          LD A, (IX+0x06)
0x049DB0  32 B8 77 D1       LD (0xD177B8), A
0x049DB4  18 43             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049DB6 [0x13 Graph Active]

```text
0x049DB6  DD 7E 06          LD A, (IX+0x06)
0x049DB9  32 B8 77 D1       LD (0xD177B8), A
0x049DBD  18 3A             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049DBF [0x14 Table]

```text
0x049DBF  DD 7E 06          LD A, (IX+0x06)
0x049DC2  32 B8 77 D1       LD (0xD177B8), A
0x049DC6  18 31             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049DC8 [0x15 Distribution / Finance]

```text
0x049DC8  DD 7E 06          LD A, (IX+0x06)
0x049DCB  32 B8 77 D1       LD (0xD177B8), A
0x049DCF  18 28             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049DD1 [0x16 Catalog]

```text
0x049DD1  DD 7E 06          LD A, (IX+0x06)
0x049DD4  32 B8 77 D1       LD (0xD177B8), A
0x049DD8  18 1F             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049DDA [0x17 Program Editor]

```text
0x049DDA  DD 7E 06          LD A, (IX+0x06)
0x049DDD  32 B8 77 D1       LD (0xD177B8), A
0x049DE1  18 16             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049DE3 [0x18 Apps / Memory]

```text
0x049DE3  DD 7E 06          LD A, (IX+0x06)
0x049DE6  32 B8 77 D1       LD (0xD177B8), A
0x049DEA  18 0D             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Handler at 0x049DEC [default]

```text
0x049DEC  DD 7E 06          LD A, (IX+0x06)
0x049DEF  32 B8 77 D1       LD (0xD177B8), A
0x049DF3  18 04             JR 0x049DF9
```

- Stores (IX+6) to D177B8: YES
- IX read offsets: 6
- Termination: JR 0x049DF9
- Summary: stores (IX+6) to D177B8

### Common Tail Code

At 0x049DF9:
```text
0x049DF9  F1                POP AF
0x049DFA  E2 FF 9D 04       JP PO, 0x049DFF
0x049DFE  FB                EI
0x049DFF  DD 7E FF          LD A, (IX-0x01)
0x049E02  DD F9             LD SP, IX
0x049E04  DD E1             POP IX
0x049E06  C9                RET
```

## 3. Notification Type Frequency + Payload Semantics

| Rank | Type | Label | Count | Class | Handler | Top Payloads |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0x11 | Stat / List Editor | 27 | BLOCK | 0x049DA4 | 0x84x15, 0x86x8, 0x83x2, 0x85x2 |
| 2 | 0x03 | Window / Format | 26 | ALLOW | 0x049D89 | 0x06x12, 0x09x3, 0x0Ax2, 0x11x2, 0x10x2 |
| 3 | 0x00 | switch / generic | 25 | DEFAULT | 0x049DEC (default) | 0x01x21, 0x05x1, 0x03x1, 0x04x1, 0x02x1 |
| 4 | 0x13 | Graph Active | 15 | BLOCK | 0x049DB6 | 0x98x7, 0x97x4, 0x99x1, 0x96x1, 0x9Ax1 |
| 5 | 0x02 | Y= | 11 | ALLOW | 0x049D80 | 0x44x2, 0x45x2, 0x41x2, 0x46x1, 0x47x1 |
| 6 | 0x10 | Menu / Dialog | 11 | BLOCK | 0x049D9B | 0x80x5, 0x81x2, 0x82x2, 0xC0x1, 0xFFx1 |
| 7 | 0x18 | Apps / Memory | 11 | ALLOW | 0x049DE3 | 0xBDx7, 0xAFx1, 0xAEx1, 0xAAx1, 0xACx1 |
| 8 | 0x15 | Distribution / Finance | 9 | BLOCK | 0x049DC8 | 0x8Cx6, 0x8Fx2, 0x8Ex1 |
| 9 | 0x17 | Program Editor | 6 | ALLOW | 0x049DDA | 0xA7x4, 0xA6x1, 0xA5x1 |
| 10 | 0x12 | Matrix Editor | 5 | BLOCK | 0x049DAD | 0xC3x1, 0xC1x1, 0xC2x1, 0xC4x1, 0xC0x1 |
| 11 | 0x16 | Catalog | 5 | BLOCK | 0x049DD1 | 0xA2x3, 0xA0x1, 0xA1x1 |
| 12 | 0x01 | Home Screen | 4 | ALLOW | 0x049D77 | 0x21x2, 0x20x2 |
| 13 | 0x14 | Table | 3 | BLOCK | 0x049DBF | 0x8Dx1, 0x93x1, 0x92x1 |

## 4. Detailed Payload Analysis Per Type

### Type 0x11 — Stat / List Editor (27 callers, BLOCK)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0x84 | 15 | scan code (key 0x84) |
| 0x86 | 8 | scan code (key 0x86) |
| 0x83 | 2 | scan code (key 0x83) |
| 0x85 | 2 | scan code (key 0x85) |

**Caller at 0x02C333** (CALL, system services):

```text
0x02C325  FE 06             CP 0x06
0x02C327  20 10             JR NZ, 0x02C339
0x02C329  01 11 00 00       LD BC, 0x000011
0x02C32D  C5                PUSH BC
0x02C32E  01 84 00 00       LD BC, 0x000084
0x02C332  C5                PUSH BC
0x02C333  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02C337  C1                POP BC
0x02C338  C1                POP BC
0x02C339  DD 7E 06          LD A, (IX+0x06)
0x02C33C  E6 02             AND 0x02
```

**Caller at 0x031D0A** (CALL, key/event handling):

```text
0x031CF7  01 00 00 00       LD BC, 0x000000
0x031CFB  ED 43 BE 41 D1    ld-mem-pair
0x031D00  01 11 00 00       LD BC, 0x000011
0x031D04  C5                PUSH BC
0x031D05  01 84 00 00       LD BC, 0x000084
0x031D09  C5                PUSH BC
0x031D0A  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x031D0E  C1                POP BC
0x031D0F  C1                POP BC
0x031D10  C9                RET
```

### Type 0x03 — Window / Format (26 callers, ALLOW)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0x06 | 12 | index/mode 6 |
| 0x09 | 3 | index/mode 9 |
| 0x0A | 2 | index/mode 10 |
| 0x11 | 2 | index/mode 17 |
| 0x10 | 2 | index/mode 16 |
| 0x0F | 1 | index/mode 15 |
| 0x0C | 1 | index/mode 12 |
| 0x0E | 1 | index/mode 14 |
| 0x0B | 1 | index/mode 11 |
| 0x0D | 1 | index/mode 13 |

**Caller at 0x02BF6D** (CALL, system services):

```text
0x02BF60  B7                OR A
0x02BF61  20 10             JR NZ, 0x02BF73
0x02BF63  01 03 00 00       LD BC, 0x000003
0x02BF67  C5                PUSH BC
0x02BF68  01 0A 00 00       LD BC, 0x00000A
0x02BF6C  C5                PUSH BC
0x02BF6D  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02BF71  C1                POP BC
0x02BF72  C1                POP BC
0x02BF73  3A B8 77 D1       LD A, (0xD177B8)
0x02BF77  FE 11             CP 0x11
```

**Caller at 0x02BF92** (CALL, system services):

```text
0x02BF85  B7                OR A
0x02BF86  20 10             JR NZ, 0x02BF98
0x02BF88  01 03 00 00       LD BC, 0x000003
0x02BF8C  C5                PUSH BC
0x02BF8D  01 0A 00 00       LD BC, 0x00000A
0x02BF91  C5                PUSH BC
0x02BF92  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02BF96  C1                POP BC
0x02BF97  C1                POP BC
0x02BF98  3A B8 77 D1       LD A, (0xD177B8)
0x02BF9C  FE 01             CP 0x01
```

### Type 0x00 — switch / generic (25 callers, DEFAULT)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0x01 | 21 | index/mode 1 |
| 0x05 | 1 | index/mode 5 |
| 0x03 | 1 | index/mode 3 |
| 0x04 | 1 | index/mode 4 |
| 0x02 | 1 | index/mode 2 |

**Caller at 0x02A82A** (CALL, system services):

```text
0x02A818  21 FD FF FF       LD HL, 0xFFFFFD
0x02A81C  CD 2C 01 00       CALL 0x00012C
0x02A820  01 00 00 00       LD BC, 0x000000
0x02A824  C5                PUSH BC
0x02A825  01 05 00 00       LD BC, 0x000005
0x02A829  C5                PUSH BC
0x02A82A  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02A82E  C1                POP BC
0x02A82F  C1                POP BC
0x02A830  3A A6 40 D1       LD A, (0xD140A6)
0x02A834  B7                OR A
```

**Caller at 0x02B84E** (CALL, system services):

```text
0x02B83E  32 8B 40 D1       LD (0xD1408B), A
0x02B842  18 65             JR 0x02B8A9
0x02B844  01 00 00 00       LD BC, 0x000000
0x02B848  C5                PUSH BC
0x02B849  01 01 00 00       LD BC, 0x000001
0x02B84D  C5                PUSH BC
0x02B84E  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02B852  C1                POP BC
0x02B853  C1                POP BC
0x02B854  01 14 31 00       LD BC, 0x003114
0x02B858  ED 78             in-reg
```

### Type 0x13 — Graph Active (15 callers, BLOCK)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0x98 | 7 | scan code (key 0x98) |
| 0x97 | 4 | scan code (key 0x97) |
| 0x99 | 1 | scan code (key 0x99) |
| 0x96 | 1 | scan code (key 0x96) |
| 0x9A | 1 | scan code (key 0x9A) |
| 0x9B | 1 | scan code (key 0x9B) |

**Caller at 0x02DF44** (CALL, system services):

```text
0x02DF31  01 00 00 00       LD BC, 0x000000
0x02DF35  ED 43 F5 76 D1    ld-mem-pair
0x02DF3A  01 13 00 00       LD BC, 0x000013
0x02DF3E  C5                PUSH BC
0x02DF3F  01 99 00 00       LD BC, 0x000099
0x02DF43  C5                PUSH BC
0x02DF44  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02DF48  C1                POP BC
0x02DF49  C1                POP BC
0x02DF4A  01 93 36 06       LD BC, 0x063693
0x02DF4E  C5                PUSH BC
```

**Caller at 0x02E032** (CALL, system services):

```text
0x02E025  23                INC HL
0x02E026  36 00             ld-ind-imm
0x02E028  01 13 00 00       LD BC, 0x000013
0x02E02C  C5                PUSH BC
0x02E02D  01 97 00 00       LD BC, 0x000097
0x02E031  C5                PUSH BC
0x02E032  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02E036  C1                POP BC
0x02E037  C1                POP BC
0x02E038  18 08             JR 0x02E042
```

### Type 0x02 — Y= (11 callers, ALLOW)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0x44 | 2 | value 0x44 |
| 0x45 | 2 | value 0x45 |
| 0x41 | 2 | value 0x41 |
| 0x46 | 1 | value 0x46 |
| 0x47 | 1 | value 0x47 |
| 0x42 | 1 | value 0x42 |
| 0x43 | 1 | value 0x43 |
| 0x40 | 1 | value 0x40 |

**Caller at 0x02C111** (CALL, system services):

```text
0x02C103  FE 40             CP 0x40
0x02C105  20 46             JR NZ, 0x02C14D
0x02C107  01 02 00 00       LD BC, 0x000002
0x02C10B  C5                PUSH BC
0x02C10C  01 44 00 00       LD BC, 0x000044
0x02C110  C5                PUSH BC
0x02C111  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02C115  C1                POP BC
0x02C116  C1                POP BC
0x02C117  18 34             JR 0x02C14D
```

**Caller at 0x02C2DD** (CALL, system services):

```text
0x02C2CF  E6 20             AND 0x20
0x02C2D1  28 12             JR Z, 0x02C2E5
0x02C2D3  01 02 00 00       LD BC, 0x000002
0x02C2D7  C5                PUSH BC
0x02C2D8  01 45 00 00       LD BC, 0x000045
0x02C2DC  C5                PUSH BC
0x02C2DD  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02C2E1  C1                POP BC
0x02C2E2  C1                POP BC
0x02C2E3  18 54             JR 0x02C339
```

### Type 0x10 — Menu / Dialog (11 callers, BLOCK)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0x80 | 5 | scan code (key 0x80) |
| 0x81 | 2 | scan code (key 0x81) |
| 0x82 | 2 | scan code (key 0x82) |
| 0xC0 | 1 | scan code (key 0xC0) |
| 0xFF | 1 | scan code (key 0xFF) |

**Caller at 0x02C12B** (CALL, system services):

```text
0x02C11D  FE C0             CP 0xC0
0x02C11F  30 12             JR NC, 0x02C133
0x02C121  01 10 00 00       LD BC, 0x000010
0x02C125  C5                PUSH BC
0x02C126  01 81 00 00       LD BC, 0x000081
0x02C12A  C5                PUSH BC
0x02C12B  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02C12F  C1                POP BC
0x02C130  C1                POP BC
0x02C131  18 1A             JR 0x02C14D
```

**Caller at 0x02C2FF** (CALL, system services):

```text
0x02C2F1  FE 01             CP 0x01
0x02C2F3  20 12             JR NZ, 0x02C307
0x02C2F5  01 10 00 00       LD BC, 0x000010
0x02C2F9  C5                PUSH BC
0x02C2FA  01 C0 00 00       LD BC, 0x0000C0
0x02C2FE  C5                PUSH BC
0x02C2FF  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02C303  C1                POP BC
0x02C304  C1                POP BC
0x02C305  18 32             JR 0x02C339
```

### Type 0x18 — Apps / Memory (11 callers, ALLOW)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0xBD | 7 | scan code (key 0xBD) |
| 0xAF | 1 | scan code (key 0xAF) |
| 0xAE | 1 | scan code (key 0xAE) |
| 0xAA | 1 | scan code (key 0xAA) |
| 0xAC | 1 | scan code (key 0xAC) |

**Caller at 0x0323FE** (CALL, key/event handling):

```text
0x0323EC  DD 07 06          ld-pair-indexed
0x0323EF  ED 43 41 77 D1    ld-mem-pair
0x0323F4  01 18 00 00       LD BC, 0x000018
0x0323F8  C5                PUSH BC
0x0323F9  01 AF 00 00       LD BC, 0x0000AF
0x0323FD  C5                PUSH BC
0x0323FE  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x032402  C1                POP BC
0x032403  C1                POP BC
0x032404  CD 1C 96 04       CALL 0x04961C
0x032408  DD 34 FD          inc-ixd
```

**Caller at 0x032479** (CALL, key/event handling):

```text
0x03246C  B7                OR A
0x03246D  28 56             JR Z, 0x0324C5
0x03246F  01 18 00 00       LD BC, 0x000018
0x032473  C5                PUSH BC
0x032474  01 BD 00 00       LD BC, 0x0000BD
0x032478  C5                PUSH BC
0x032479  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x03247D  C1                POP BC
0x03247E  C1                POP BC
0x03247F  CD 1C 96 04       CALL 0x04961C
0x032483  CD 07 9E 04       CALL 0x049E07
```

### Type 0x15 — Distribution / Finance (9 callers, BLOCK)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0x8C | 6 | scan code (key 0x8C) |
| 0x8F | 2 | scan code (key 0x8F) |
| 0x8E | 1 | scan code (key 0x8E) |

**Caller at 0x02F61E** (CALL, system services):

```text
0x02F611  B7                OR A
0x02F612  28 53             JR Z, 0x02F667
0x02F614  01 15 00 00       LD BC, 0x000015
0x02F618  C5                PUSH BC
0x02F619  01 8C 00 00       LD BC, 0x00008C
0x02F61D  C5                PUSH BC
0x02F61E  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02F622  C1                POP BC
0x02F623  C1                POP BC
0x02F624  CD 1C 96 04       CALL 0x04961C
0x02F628  CD 07 9E 04       CALL 0x049E07
```

**Caller at 0x031EC5** (CALL, key/event handling):

```text
0x031EB7  FE 8F             CP 0x8F
0x031EB9  20 10             JR NZ, 0x031ECB
0x031EBB  01 15 00 00       LD BC, 0x000015
0x031EBF  C5                PUSH BC
0x031EC0  01 8C 00 00       LD BC, 0x00008C
0x031EC4  C5                PUSH BC
0x031EC5  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x031EC9  C1                POP BC
0x031ECA  C1                POP BC
0x031ECB  DD 7E FE          LD A, (IX-0x02)
0x031ECE  B7                OR A
```

### Type 0x17 — Program Editor (6 callers, ALLOW)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0xA7 | 4 | scan code (key 0xA7) |
| 0xA6 | 1 | scan code (key 0xA6) |
| 0xA5 | 1 | scan code (key 0xA5) |

**Caller at 0x031856** (CALL, key/event handling):

```text
0x031846  CD 38 01 00       CALL 0x000138
0x03184A  20 14             JR NZ, 0x031860
0x03184C  01 17 00 00       LD BC, 0x000017
0x031850  C5                PUSH BC
0x031851  01 A7 00 00       LD BC, 0x0000A7
0x031855  C5                PUSH BC
0x031856  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x03185A  C1                POP BC
0x03185B  C1                POP BC
0x03185C  C3 58 1C 03       JP 0x031C58
```

**Caller at 0x031C40** (CALL, key/event handling):

```text
0x031C34  23                INC HL
0x031C35  77                ld-ind-reg
0x031C36  01 17 00 00       LD BC, 0x000017
0x031C3A  C5                PUSH BC
0x031C3B  01 A6 00 00       LD BC, 0x0000A6
0x031C3F  C5                PUSH BC
0x031C40  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x031C44  C1                POP BC
0x031C45  C1                POP BC
0x031C46  18 10             JR 0x031C58
```

### Type 0x12 — Matrix Editor (5 callers, BLOCK)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0xC3 | 1 | scan code (key 0xC3) |
| 0xC1 | 1 | scan code (key 0xC1) |
| 0xC2 | 1 | scan code (key 0xC2) |
| 0xC4 | 1 | scan code (key 0xC4) |
| 0xC0 | 1 | scan code (key 0xC0) |

**Caller at 0x02C2A4** (CALL, system services):

```text
0x02C295  AF                XOR A
0x02C296  32 8D 40 D1       LD (0xD1408D), A
0x02C29A  01 12 00 00       LD BC, 0x000012
0x02C29E  C5                PUSH BC
0x02C29F  01 C3 00 00       LD BC, 0x0000C3
0x02C2A3  C5                PUSH BC
0x02C2A4  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02C2A8  C1                POP BC
0x02C2A9  C1                POP BC
0x02C2AA  CD 88 AF 02       CALL 0x02AF88
0x02C2AE  DD 7E 06          LD A, (IX+0x06)
```

**Caller at 0x0414FC** (CALL, key/event handling):

```text
0x0414EF  B7                OR A
0x0414F0  20 10             JR NZ, 0x041502
0x0414F2  01 12 00 00       LD BC, 0x000012
0x0414F6  C5                PUSH BC
0x0414F7  01 C1 00 00       LD BC, 0x0000C1
0x0414FB  C5                PUSH BC
0x0414FC  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x041500  C1                POP BC
0x041501  C1                POP BC
0x041502  C9                RET
```

### Type 0x16 — Catalog (5 callers, BLOCK)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0xA2 | 3 | scan code (key 0xA2) |
| 0xA0 | 1 | scan code (key 0xA0) |
| 0xA1 | 1 | scan code (key 0xA1) |

**Caller at 0x036B5A** (CALL, key/event handling):

```text
0x036B4B  E2 50 6B 03       JP PO, 0x036B50
0x036B4F  FB                EI
0x036B50  01 16 00 00       LD BC, 0x000016
0x036B54  C5                PUSH BC
0x036B55  01 A0 00 00       LD BC, 0x0000A0
0x036B59  C5                PUSH BC
0x036B5A  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x036B5E  C1                POP BC
0x036B5F  C1                POP BC
0x036B60  C3 EF 6D 03       JP 0x036DEF
```

**Caller at 0x037275** (CALL, key/event handling):

```text
0x037265  CD 38 01 00       CALL 0x000138
0x037269  20 14             JR NZ, 0x03727F
0x03726B  01 16 00 00       LD BC, 0x000016
0x03726F  C5                PUSH BC
0x037270  01 A2 00 00       LD BC, 0x0000A2
0x037274  C5                PUSH BC
0x037275  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x037279  C1                POP BC
0x03727A  C1                POP BC
0x03727B  C3 77 76 03       JP 0x037677
```

### Type 0x01 — Home Screen (4 callers, ALLOW)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0x21 | 2 | value 0x21 |
| 0x20 | 2 | index/mode 32 |

**Caller at 0x038CF2** (CALL, key/event handling):

```text
0x038CE6  8D                ADC L
0x038CE7  03                INC BC
0x038CE8  01 01 00 00       LD BC, 0x000001
0x038CEC  C5                PUSH BC
0x038CED  01 21 00 00       LD BC, 0x000021
0x038CF1  C5                PUSH BC
0x038CF2  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x038CF6  C1                POP BC
0x038CF7  C1                POP BC
0x038CF8  18 0A             JR 0x038D04
```

**Caller at 0x042870** (CALL, key/event handling):

```text
0x042863  B7                OR A
0x042864  20 12             JR NZ, 0x042878
0x042866  01 01 00 00       LD BC, 0x000001
0x04286A  C5                PUSH BC
0x04286B  01 20 00 00       LD BC, 0x000020
0x04286F  C5                PUSH BC
0x042870  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x042874  C1                POP BC
0x042875  C1                POP BC
0x042876  18 16             JR 0x04288E
```

### Type 0x14 — Table (3 callers, BLOCK)

| Payload | Count | Meaning |
| --- | --- | --- |
| 0x8D | 1 | scan code (key 0x8D) |
| 0x93 | 1 | scan code (key 0x93) |
| 0x92 | 1 | scan code (key 0x92) |

**Caller at 0x036885** (CALL, key/event handling):

```text
0x036877  FE 03             CP 0x03
0x036879  20 26             JR NZ, 0x0368A1
0x03687B  01 14 00 00       LD BC, 0x000014
0x03687F  C5                PUSH BC
0x036880  01 8D 00 00       LD BC, 0x00008D
0x036884  C5                PUSH BC
0x036885  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x036889  C1                POP BC
0x03688A  C1                POP BC
0x03688B  ED 57             LD A, I
0x03688D  F5                PUSH AF
```

**Caller at 0x070FF5** (CALL, graph/apps):

```text
0x070FE9  C1                POP BC
0x070FEA  C1                POP BC
0x070FEB  01 14 00 00       LD BC, 0x000014
0x070FEF  C5                PUSH BC
0x070FF0  01 93 00 00       LD BC, 0x000093
0x070FF4  C5                PUSH BC
0x070FF5  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x070FF9  C1                POP BC
0x070FFA  C1                POP BC
0x070FFB  DD 36 FF 00       LD (IX-0x01), 0x00
0x070FFF  01 CD 0D 07       LD BC, 0x070DCD
```

## 5. Cross-Type Payload Overlap

Payloads used by multiple notification types:

| Payload | Types |
| --- | --- |
| 0xC0 | 0x10 Menu / Dialog, 0x12 Matrix Editor |

## 6. Unresolved Callers

9 callers could not be resolved to an immediate type.
These load the type from a register or RAM at runtime.

### 0x0222A0 (JP) — system services

```text
0x022288  C3 23 BC 04       JP 0x04BC23
0x02228C  C3 3D BC 04       JP 0x04BC3D
0x022290  C3 57 BC 04       JP 0x04BC57
0x022294  C3 71 BC 04       JP 0x04BC71
0x022298  C3 8B BC 04       JP 0x04BC8B
0x02229C  C3 DA D3 0B       JP 0x0BD3DA
0x0222A0  C3 CA 9C 04       JP 0x049CCA
```

### 0x0387B8 (CALL) — key/event handling

```text
0x0387AA  DD 34 F9          inc-ixd
0x0387AD  01 18 00 00       LD BC, 0x000018
0x0387B1  C5                PUSH BC
0x0387B2  DD 4E F9          LD C, (IX-0x07)
0x0387B5  06 00             LD B, 0x00
0x0387B7  C5                PUSH BC
0x0387B8  CD CA 9C 04       CALL 0x049CCA
```

### 0x038B0A (CALL) — key/event handling

```text
0x038AFC  DD 34 FF          inc-ixd
0x038AFF  01 18 00 00       LD BC, 0x000018
0x038B03  C5                PUSH BC
0x038B04  DD 4E FF          LD C, (IX-0x01)
0x038B07  06 00             LD B, 0x00
0x038B09  C5                PUSH BC
0x038B0A  CD CA 9C 04       CALL 0x049CCA
```

### 0x038BA0 (CALL) — key/event handling

```text
0x038B92  DD 34 FF          inc-ixd
0x038B95  01 18 00 00       LD BC, 0x000018
0x038B99  C5                PUSH BC
0x038B9A  DD 4E FF          LD C, (IX-0x01)
0x038B9D  06 00             LD B, 0x00
0x038B9F  C5                PUSH BC
0x038BA0  CD CA 9C 04       CALL 0x049CCA
```

### 0x03E32F (CALL) — key/event handling

```text
0x03E31F  11 00 00 00       LD DE, 0x000000
0x03E323  20 08             JR NZ, 0x03E32D
0x03E325  01 FF 00 00       LD BC, 0x0000FF
0x03E329  11 10 00 00       LD DE, 0x000010
0x03E32D  D5                PUSH DE
0x03E32E  C5                PUSH BC
0x03E32F  CD CA 9C 04       CALL 0x049CCA
```

### 0x03E365 (CALL) — key/event handling

```text
0x03E357  01 13 00 00       LD BC, 0x000013
0x03E35B  11 98 00 00       LD DE, 0x000098
0x03E35F  CB 7F             bit-test
0x03E361  28 0C             JR Z, 0x03E36F
0x03E363  C5                PUSH BC
0x03E364  D5                PUSH DE
0x03E365  CD CA 9C 04       CALL 0x049CCA
```

### 0x0411B3 (CALL) — key/event handling

```text
0x0411A5  32 0E 44 D1       LD (0xD1440E), A
0x0411A9  DD 4E FE          LD C, (IX-0x02)
0x0411AC  06 00             LD B, 0x00
0x0411AE  C5                PUSH BC
0x0411AF  DD 4E FC          LD C, (IX-0x04)
0x0411B2  C5                PUSH BC
0x0411B3  CD CA 9C 04       CALL 0x049CCA
```

### 0x04125D (CALL) — key/event handling

```text
0x04124F  32 0E 44 D1       LD (0xD1440E), A
0x041253  DD 4E FE          LD C, (IX-0x02)
0x041256  06 00             LD B, 0x00
0x041258  C5                PUSH BC
0x041259  DD 4E FC          LD C, (IX-0x04)
0x04125C  C5                PUSH BC
0x04125D  CD CA 9C 04       CALL 0x049CCA
```

### 0x049CFE (CALL) — key/event handling

```text
0x049CF1  3A B9 77 D1       LD A, (0xD177B9)
0x049CF5  4F                LD C, A
0x049CF6  06 00             LD B, 0x00
0x049CF8  C5                PUSH BC
0x049CF9  01 00 00 00       LD BC, 0x000000
0x049CFD  C5                PUSH BC
0x049CFE  CD CA 9C 04       CALL 0x049CCA
```

## 7. Key Findings

### Handler Behavior

All 13 handlers + default perform IDENTICAL behavior: read (IX+6) and store to D177B8.
The notification handler table is purely a type-indexed store — the type byte selects the handler,
but every handler does the same thing. The _seqcase dispatch is a type-validation gate, not a
behavior selector.

### Payload Semantics

The payload byte at (IX+6) represents context-dependent data:

- **BLOCK types** (0x10-0x16): payloads are predominantly TI scan codes (0x80+)
  indicating which key triggered the heavyweight modal context
- **ALLOW types** (0x01-0x04, 0x17-0x18): payloads are small indices (0x01-0x11)
  selecting a sub-mode or configuration within the lightweight context
- **payload 0x00**: used in recursive teardown calls (flush old context)
- **payload 0x01**: most common single value — default/reset sentinel

### Lifecycle

1. Exit guard at 0x0499C0 checks if current context allows preemption
2. If allowed, 0x049CCA recursively flushes old state (type=old, payload=0x00)
3. New type written to D177B9
4. _seqcase at 0x049D3A dispatches on new type
5. Handler stores new payload to D177B8
6. Both D177B8 (payload) and D177B9 (type) now reflect the new context

