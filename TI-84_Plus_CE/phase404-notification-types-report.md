# Phase 404 - Notification Type Semantics

ROM: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ROM.rom
Decoder: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ez80-decoder.js

## Executive Summary

- Total CALL 0x049CCA sites found: 166
- Total JP 0x049CCA sites found: 1
- Combined caller count: 167
- Callers with resolved type: 158
- Callers with unknown type: 9
- Distinct notification types observed: 13
- Extraction methods: unknown, stack-double-push, partial-payload-only

## 1. Notification Type Frequency Table

| Rank | Type | Label | Count | Classification | Sample Callers |
| --- | --- | --- | --- | --- | --- |
| 1 | 0x11 | Stat / List Editor | 27 | BLOCK (heavyweight modal) | 0x02C333, 0x031D0A, 0x0366AF, 0x0367A3, 0x036AD4, ... |
| 2 | 0x03 | Window / Format | 26 | ALLOW (lightweight) | 0x02BF6D, 0x02BF92, 0x02C0EF, 0x02C147, 0x02D1D4, ... |
| 3 | 0x00 | switch / generic | 25 | DEFAULT (allow path) | 0x02A82A, 0x02B84E, 0x02B934, 0x02B953, 0x02BB98, ... |
| 4 | 0x13 | Graph Active | 15 | BLOCK (heavyweight modal) | 0x02DF44, 0x02E032, 0x02F320, 0x03691C, 0x0369FF, ... |
| 5 | 0x02 | Y= | 11 | ALLOW (lightweight) | 0x02C111, 0x02C2DD, 0x03669B, 0x0366F8, 0x03670C, ... |
| 6 | 0x10 | Menu / Dialog | 11 | BLOCK (heavyweight modal) | 0x02C12B, 0x02C2FF, 0x02C311, 0x031E64, 0x034A66, ... |
| 7 | 0x18 | Apps / Memory | 11 | ALLOW (lightweight) | 0x0323FE, 0x032479, 0x036CD3, 0x036CE5, 0x037E6E, ... |
| 8 | ??? | (could not resolve) | 9 | N/A | 0x0222A0, 0x0387B8, 0x038B0A, 0x038BA0, 0x03E32F, ... |
| 9 | 0x15 | Distribution / Finance | 9 | BLOCK (heavyweight modal) | 0x02F61E, 0x031EC5, 0x0371C8, 0x0371EB, 0x0371FD, ... |
| 10 | 0x17 | Program Editor | 6 | ALLOW (lightweight) | 0x031856, 0x031C40, 0x031C52, 0x031D30, 0x036C14, ... |
| 11 | 0x12 | Matrix Editor | 5 | BLOCK (heavyweight modal) | 0x02C2A4, 0x0414FC, 0x041521, 0x04968E, 0x0496F0 |
| 12 | 0x16 | Catalog | 5 | BLOCK (heavyweight modal) | 0x036B5A, 0x037275, 0x03765F, 0x037671, 0x03774B |
| 13 | 0x01 | Home Screen | 4 | ALLOW (lightweight) | 0x038CF2, 0x042870, 0x042882, 0x048015 |
| 14 | 0x14 | Table | 3 | BLOCK (heavyweight modal) | 0x036885, 0x070FF5, 0x071298 |

### Payload Distribution (for resolved callers)

| Payload | Count | Possible Meaning |
| --- | --- | --- |
| 0x01 | 21 | small index |
| 0x84 | 15 | key/scan code 0x84 |
| 0x06 | 12 | small index |
| 0x86 | 8 | key/scan code 0x86 |
| 0x98 | 7 | key/scan code 0x98 |
| 0xBD | 7 | key/scan code 0xBD |
| 0x8C | 6 | key/scan code 0x8C |
| 0x80 | 5 | key/scan code 0x80 |
| 0x97 | 4 | key/scan code 0x97 |
| 0xA7 | 4 | key/scan code 0xA7 |
| 0x09 | 3 | small index |
| 0xA2 | 3 | key/scan code 0xA2 |
| 0x0A | 2 | small index |
| 0x44 | 2 | key/scan code 0x44 |
| 0x81 | 2 | key/scan code 0x81 |

## 2. Caller Region Distribution

| Region | Address Range | Caller Count |
| --- | --- | --- |
| system services | - | 26 |
| key/event handling | - | 118 |
| editor/display | - | 12 |
| graph/apps | - | 11 |

## 3. Deep Dive: Top 3 Notification Types

### Type 0x11 — Stat / List Editor (27 callers)

**Classification**: BLOCK (heavyweight modal)
**Common payloads**: 0x84, 0x86, 0x83, 0x85

Region breakdown:
- system services: 1
- key/event handling: 22
- graph/apps: 4

#### Caller at 0x02C333 (CALL)

- Region: system services
- Extraction method: stack-double-push
- Type: 0x11
- Payload: 0x84

```text
  ; --- before ---
0x02C31F  28 08             JR Z, 0x02C329
0x02C321  3A B8 77 D1       LD A, (0xD177B8)
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
0x02C33E  B7                OR A
0x02C33F  ED 62             SBC HL, HL
```

#### Caller at 0x031D0A (CALL)

- Region: key/event handling
- Extraction method: stack-double-push
- Type: 0x11
- Payload: 0x84

```text
  ; --- before ---
0x031CF5  C1                POP BC
0x031CF6  C1                POP BC
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

#### Caller at 0x0366AF (CALL)

- Region: key/event handling
- Extraction method: stack-double-push
- Type: 0x11
- Payload: 0x86

```text
  ; --- before ---
0x03669B  CD CA 9C 04       CALL 0x049CCA
0x03669F  C1                POP BC
0x0366A0  C1                POP BC
0x0366A1  C3 15 68 03       JP 0x036815
0x0366A5  01 11 00 00       LD BC, 0x000011
0x0366A9  C5                PUSH BC
0x0366AA  01 86 00 00       LD BC, 0x000086
0x0366AE  C5                PUSH BC
0x0366AF  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x0366B3  C1                POP BC
0x0366B4  C1                POP BC
0x0366B5  C3 15 68 03       JP 0x036815
```

#### Caller at 0x0367A3 (CALL)

- Region: key/event handling
- Extraction method: stack-double-push
- Type: 0x11
- Payload: 0x83

```text
  ; --- before ---
0x03678F  01 D0 07 00       LD BC, 0x0007D0
0x036793  C5                PUSH BC
0x036794  CD 7B E0 04       CALL 0x04E07B
0x036798  C1                POP BC
0x036799  01 11 00 00       LD BC, 0x000011
0x03679D  C5                PUSH BC
0x03679E  01 83 00 00       LD BC, 0x000083
0x0367A2  C5                PUSH BC
0x0367A3  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x0367A7  C1                POP BC
0x0367A8  C1                POP BC
0x0367A9  F1                POP AF
0x0367AA  E2 AF 67 03       JP PO, 0x0367AF
0x0367AE  FB                EI
0x0367AF  18 64             JR 0x036815
```

### Type 0x03 — Window / Format (26 callers)

**Classification**: ALLOW (lightweight)
**Common payloads**: 0x0A, 0x06, 0x09, 0x11, 0x10, 0x0F, 0x0C, 0x0E, 0x0B, 0x0D

Region breakdown:
- system services: 6
- key/event handling: 10
- editor/display: 10

#### Caller at 0x02BF6D (CALL)

- Region: system services
- Extraction method: stack-double-push
- Type: 0x03
- Payload: 0x0A

```text
  ; --- before ---
0x02BF5B  CD 6E 20 05       CALL 0x05206E
0x02BF5F  C1                POP BC
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
0x02BF79  20 1D             JR NZ, 0x02BF98
0x02BF7B  01 08 00 00       LD BC, 0x000008
```

#### Caller at 0x02BF92 (CALL)

- Region: system services
- Extraction method: stack-double-push
- Type: 0x03
- Payload: 0x0A

```text
  ; --- before ---
0x02BF80  CD 6E 20 05       CALL 0x05206E
0x02BF84  C1                POP BC
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
0x02BF9E  20 60             JR NZ, 0x02C000
0x02BFA0  CD 20 04 00       CALL 0x000420
```

#### Caller at 0x02C0EF (CALL)

- Region: system services
- Extraction method: stack-double-push
- Type: 0x03
- Payload: 0x06

```text
  ; --- before ---
0x02C0D9  32 FB 76 D1       LD (0xD176FB), A
0x02C0DD  3A B8 77 D1       LD A, (0xD177B8)
0x02C0E1  FE 40             CP 0x40
0x02C0E3  30 12             JR NC, 0x02C0F7
0x02C0E5  01 03 00 00       LD BC, 0x000003
0x02C0E9  C5                PUSH BC
0x02C0EA  01 06 00 00       LD BC, 0x000006
0x02C0EE  C5                PUSH BC
0x02C0EF  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02C0F3  C1                POP BC
0x02C0F4  C1                POP BC
0x02C0F5  18 56             JR 0x02C14D
```

#### Caller at 0x02C147 (CALL)

- Region: system services
- Extraction method: stack-double-push
- Type: 0x03
- Payload: 0x06

```text
  ; --- before ---
0x02C133  40 01 82 30       SIS LD BC, 0x003082
0x02C137  ED 78             in-reg
0x02C139  E6 10             AND 0x10
0x02C13B  28 10             JR Z, 0x02C14D
0x02C13D  01 03 00 00       LD BC, 0x000003
0x02C141  C5                PUSH BC
0x02C142  01 06 00 00       LD BC, 0x000006
0x02C146  C5                PUSH BC
0x02C147  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02C14B  C1                POP BC
0x02C14C  C1                POP BC
0x02C14D  01 10 41 00       LD BC, 0x004110
0x02C151  C5                PUSH BC
0x02C152  CD 6E 20 05       CALL 0x05206E
0x02C156  C1                POP BC
```

### Type 0x00 — switch / generic (25 callers)

**Classification**: DEFAULT (allow path)
**Common payloads**: 0x05, 0x01, 0x03, 0x04, 0x02

Region breakdown:
- system services: 8
- key/event handling: 17

#### Caller at 0x02A82A (CALL)

- Region: system services
- Extraction method: stack-double-push
- Type: 0x00
- Payload: 0x05

```text
  ; --- before ---
0x02A813  32 B2 40 D1       LD (0xD140B2), A
0x02A817  C9                RET
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
0x02A835  20 2D             JR NZ, 0x02A864
0x02A837  AF                XOR A
```

#### Caller at 0x02B84E (CALL)

- Region: system services
- Extraction method: stack-double-push
- Type: 0x00
- Payload: 0x01

```text
  ; --- before ---
0x02B83B  28 07             JR Z, 0x02B844
0x02B83D  AF                XOR A
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
0x02B85A  CB C7             bit-set
0x02B85C  ED 79             out-reg
```

#### Caller at 0x02B934 (CALL)

- Region: system services
- Extraction method: stack-double-push
- Type: 0x00
- Payload: 0x03

```text
  ; --- before ---
0x02B91F  32 72 40 D1       LD (0xD14072), A
0x02B923  18 05             JR 0x02B92A
0x02B925  AF                XOR A
0x02B926  32 72 40 D1       LD (0xD14072), A
0x02B92A  01 00 00 00       LD BC, 0x000000
0x02B92E  C5                PUSH BC
0x02B92F  01 03 00 00       LD BC, 0x000003
0x02B933  C5                PUSH BC
0x02B934  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02B938  C1                POP BC
0x02B939  C1                POP BC
0x02B93A  3A 91 40 D1       LD A, (0xD14091)
0x02B93E  B7                OR A
0x02B93F  20 2D             JR NZ, 0x02B96E
0x02B941  3A B8 77 D1       LD A, (0xD177B8)
```

#### Caller at 0x02B953 (CALL)

- Region: system services
- Extraction method: stack-double-push
- Type: 0x00
- Payload: 0x04

```text
  ; --- before ---
0x02B93F  20 2D             JR NZ, 0x02B96E
0x02B941  3A B8 77 D1       LD A, (0xD177B8)
0x02B945  FE 03             CP 0x03
0x02B947  20 25             JR NZ, 0x02B96E
0x02B949  01 00 00 00       LD BC, 0x000000
0x02B94D  C5                PUSH BC
0x02B94E  01 04 00 00       LD BC, 0x000004
0x02B952  C5                PUSH BC
0x02B953  CD CA 9C 04       CALL 0x049CCA
  ; --- after ---
0x02B957  C1                POP BC
0x02B958  C1                POP BC
0x02B959  01 14 31 00       LD BC, 0x003114
0x02B95D  ED 78             in-reg
0x02B95F  CB 87             bit-res
0x02B961  ED 79             out-reg
```

## 4. Allow/Block Classification Summary

Based on the _seqcase exit guard at 0x0499D8 (session 403):

| Type | Label | Exit Guard | Meaning |
| --- | --- | --- | --- |
| 0x00 | switch / generic | DEFAULT (allow path) | 25 caller(s) |
| 0x01 | Home Screen | ALLOW (lightweight) | 4 caller(s) |
| 0x02 | Y= | ALLOW (lightweight) | 11 caller(s) |
| 0x03 | Window / Format | ALLOW (lightweight) | 26 caller(s) |
| 0x10 | Menu / Dialog | BLOCK (heavyweight modal) | 11 caller(s) |
| 0x11 | Stat / List Editor | BLOCK (heavyweight modal) | 27 caller(s) |
| 0x12 | Matrix Editor | BLOCK (heavyweight modal) | 5 caller(s) |
| 0x13 | Graph Active | BLOCK (heavyweight modal) | 15 caller(s) |
| 0x14 | Table | BLOCK (heavyweight modal) | 3 caller(s) |
| 0x15 | Distribution / Finance | BLOCK (heavyweight modal) | 9 caller(s) |
| 0x16 | Catalog | BLOCK (heavyweight modal) | 5 caller(s) |
| 0x17 | Program Editor | ALLOW (lightweight) | 6 caller(s) |
| 0x18 | Apps / Memory | ALLOW (lightweight) | 11 caller(s) |

## 5. Callers With Unresolved Type

9 callers could not be resolved to an immediate type value.
These likely load the type from a register or RAM address computed at runtime.

#### 0x0222A0 (JP) — system services

```text
0x022288  C3 23 BC 04       JP 0x04BC23
0x02228C  C3 3D BC 04       JP 0x04BC3D
0x022290  C3 57 BC 04       JP 0x04BC57
0x022294  C3 71 BC 04       JP 0x04BC71
0x022298  C3 8B BC 04       JP 0x04BC8B
0x02229C  C3 DA D3 0B       JP 0x0BD3DA
0x0222A0  C3 CA 9C 04       JP 0x049CCA
```

#### 0x0387B8 (CALL) — key/event handling

```text
0x0387AA  DD 34 F9          inc-ixd
0x0387AD  01 18 00 00       LD BC, 0x000018
0x0387B1  C5                PUSH BC
0x0387B2  DD 4E F9          LD C, (IX-0x07)
0x0387B5  06 00             LD B, 0x00
0x0387B7  C5                PUSH BC
0x0387B8  CD CA 9C 04       CALL 0x049CCA
```

#### 0x038B0A (CALL) — key/event handling

```text
0x038AFC  DD 34 FF          inc-ixd
0x038AFF  01 18 00 00       LD BC, 0x000018
0x038B03  C5                PUSH BC
0x038B04  DD 4E FF          LD C, (IX-0x01)
0x038B07  06 00             LD B, 0x00
0x038B09  C5                PUSH BC
0x038B0A  CD CA 9C 04       CALL 0x049CCA
```

#### 0x038BA0 (CALL) — key/event handling

```text
0x038B92  DD 34 FF          inc-ixd
0x038B95  01 18 00 00       LD BC, 0x000018
0x038B99  C5                PUSH BC
0x038B9A  DD 4E FF          LD C, (IX-0x01)
0x038B9D  06 00             LD B, 0x00
0x038B9F  C5                PUSH BC
0x038BA0  CD CA 9C 04       CALL 0x049CCA
```

#### 0x03E32F (CALL) — key/event handling

```text
0x03E31F  11 00 00 00       LD DE, 0x000000
0x03E323  20 08             JR NZ, 0x03E32D
0x03E325  01 FF 00 00       LD BC, 0x0000FF
0x03E329  11 10 00 00       LD DE, 0x000010
0x03E32D  D5                PUSH DE
0x03E32E  C5                PUSH BC
0x03E32F  CD CA 9C 04       CALL 0x049CCA
```

#### 0x03E365 (CALL) — key/event handling

```text
0x03E357  01 13 00 00       LD BC, 0x000013
0x03E35B  11 98 00 00       LD DE, 0x000098
0x03E35F  CB 7F             bit-test
0x03E361  28 0C             JR Z, 0x03E36F
0x03E363  C5                PUSH BC
0x03E364  D5                PUSH DE
0x03E365  CD CA 9C 04       CALL 0x049CCA
```

#### 0x0411B3 (CALL) — key/event handling

```text
0x0411A5  32 0E 44 D1       LD (0xD1440E), A
0x0411A9  DD 4E FE          LD C, (IX-0x02)
0x0411AC  06 00             LD B, 0x00
0x0411AE  C5                PUSH BC
0x0411AF  DD 4E FC          LD C, (IX-0x04)
0x0411B2  C5                PUSH BC
0x0411B3  CD CA 9C 04       CALL 0x049CCA
```

#### 0x04125D (CALL) — key/event handling

```text
0x04124F  32 0E 44 D1       LD (0xD1440E), A
0x041253  DD 4E FE          LD C, (IX-0x02)
0x041256  06 00             LD B, 0x00
0x041258  C5                PUSH BC
0x041259  DD 4E FC          LD C, (IX-0x04)
0x04125C  C5                PUSH BC
0x04125D  CD CA 9C 04       CALL 0x049CCA
```

#### 0x049CFE (CALL) — key/event handling

```text
0x049CF1  3A B9 77 D1       LD A, (0xD177B9)
0x049CF5  4F                LD C, A
0x049CF6  06 00             LD B, 0x00
0x049CF8  C5                PUSH BC
0x049CF9  01 00 00 00       LD BC, 0x000000
0x049CFD  C5                PUSH BC
0x049CFE  CD CA 9C 04       CALL 0x049CCA
```

Report also written to: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\phase404-notification-types-report.md
