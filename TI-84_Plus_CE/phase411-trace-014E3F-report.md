# Phase 411: Trace of 0x014E3F (Notification State Installer)

**Date**: 2026-05-23
**Target**: 0x014E3F — notification state installation routine
**Known from session 410**: Called by 0x00F636 during notification delivery. Saves state to D14408/D1440B, sets lock D1440E=1.

---

## 1. Disassembly of 0x014E3F

Function spans 0x014e3f to 0x014e81 (66 bytes). RET found: true.

```
0x014e3f:  CD 8A 21 00           CALL 0x00218a                  ; call 0x00218a
0x014e43:  ED 57                 ED 57                          
0x014e45:  F5                    PUSH AF                        
0x014e46:  F3                    DI                             
0x014e47:  AF                    XOR A                          
0x014e48:  32 0E 44 D1           LD (0xd1440e),A                ; RAM write 0xd1440e
0x014e4c:  CD F8 4E 01           CALL 0x014ef8                  ; call 0x014ef8
0x014e50:  AF                    XOR A                          
0x014e51:  32 0F 44 D1           LD (0xd1440f),A                ; RAM write 0xd1440f
0x014e55:  DD 07                 IX-prefix 07                   
0x014e57:  06 ED                 LD B,0xed                      
0x014e59:  43                    LD B,E                         
0x014e5a:  08                    EX AF,AF'                      
0x014e5b:  44                    LD B,H                         
0x014e5c:  D1                    POP DE                         
0x014e5d:  01 00 00 00           LD BC,0x000000                 
0x014e61:  ED 43 05 44 D1        LD (0xd14405),BC               ; RAM write 0xd14405
0x014e66:  ED 4B 38 40 D1        LD BC,(0xd14038)               ; RAM read 0xd14038
0x014e6b:  ED 43 0B 44 D1        LD (0xd1440b),BC               ; RAM write 0xd1440b
0x014e70:  F1                    POP AF                         
0x014e71:  E2 76 4E 01           JP PO,0x014e76                 
0x014e75:  FB                    EI                             
0x014e76:  3E 01                 LD A,0x01                      
0x014e78:  32 0E 44 D1           LD (0xd1440e),A                ; RAM write 0xd1440e
0x014e7c:  DD F9                 IX-prefix F9                   
0x014e7e:  DD E1                 POP IX                         
0x014e80:  C9                    RET                            
```

### RAM Accesses (direct absolute addressing)

| Address | Instruction | Access |
|---------|-------------|--------|
| 0x014e48 | `LD (0xd1440e),A` | WRITE |
| 0x014e51 | `LD (0xd1440f),A` | WRITE |
| 0x014e61 | `LD (0xd14405),BC` | WRITE |
| 0x014e66 | `LD BC,(0xd14038)` | READ |
| 0x014e6b | `LD (0xd1440b),BC` | WRITE |
| 0x014e78 | `LD (0xd1440e),A` | WRITE |

### CALL Targets

| Site | Target |
|------|--------|
| 0x014e3f | `CALL 0x00218a` |
| 0x014e4c | `CALL 0x014ef8` |

### Port I/O

| Site | Instruction |
|------|-------------|
| (none) | - |

### Branch Structure

| Site | Instruction | Note |
|------|-------------|------|
| (none) | - | - |

---

## 2. Callers of 0x014E3F

Found **29** reference(s) in the ROM.

| Address | Type | Surrounding Bytes |
|---------|------|-------------------|
| 0x0004fc | JP | `01 C3 F8 4E 01 C3 3F 4E 01 C3 A0 4F 01 C3 CC` |
| 0x008b1a | CALL | `01 B0 04 00 C5 CD 3F 4E 01 C1 40 01 82 30 ED` |
| 0x008dfb | CALL | `01 D0 07 00 C5 CD 3F 4E 01 C1 40 01 30 30 ED` |
| 0x00c12f | CALL | `4B 10 44 D1 C5 CD 3F 4E 01 C1 01 C8 31 00 ED` |
| 0x00c252 | CALL | `4B 10 44 D1 C5 CD 3F 4E 01 C1 01 C8 31 00 ED` |
| 0x00ccce | CALL | `D1 DD 07 06 C5 CD 3F 4E 01 C1 40 01 30 30 ED` |
| 0x00dabd | CALL | `01 14 00 00 C5 CD 3F 4E 01 C1 40 01 10 30 ED` |
| 0x00db3c | CALL | `01 14 00 00 C5 CD 3F 4E 01 C1 40 01 10 30 ED` |
| 0x00db97 | CALL | `01 32 00 00 C5 CD 3F 4E 01 C1 40 01 15 30 ED` |
| 0x00dbe6 | CALL | `01 32 00 00 C5 CD 3F 4E 01 C1 40 01 15 30 ED` |
| 0x00dc3f | CALL | `01 32 00 00 C5 CD 3F 4E 01 C1 40 01 15 30 ED` |
| 0x00dc8e | CALL | `01 32 00 00 C5 CD 3F 4E 01 C1 40 01 15 30 ED` |
| 0x00dd0e | CALL | `01 D0 07 00 C5 CD 3F 4E 01 C1 40 01 31 30 ED` |
| 0x00ddac | CALL | `01 E8 03 00 C5 CD 3F 4E 01 C1 40 01 31 30 ED` |
| 0x00de62 | CALL | `01 14 00 00 C5 CD 3F 4E 01 C1 40 01 30 30 ED` |
| 0x00e701 | CALL | `07 DD 07 0C C5 CD 3F 4E 01 C1 DD 36 FC 00 ED` |
| 0x00f591 | CALL | `FD FD 07 0F C5 CD 3F 4E 01 C1 01 38 31 00 ED` |
| 0x00f696 | CALL | `4B 10 44 D1 C5 CD 3F 4E 01 C1 40 01 4A 31 ED` |
| 0x00f7ee | CALL | `4B 10 44 D1 C5 CD 3F 4E 01 C1 01 3A 31 00 ED` |
| 0x00fa46 | CALL | `4B 10 44 D1 C5 CD 3F 4E 01 C1 3A B8 77 D1 FE` |
| 0x0123d3 | CALL | `2A DD 07 06 C5 CD 3F 4E 01 C1 40 01 10 30 ED` |
| 0x0125a3 | CALL | `01 E8 03 00 C5 CD 3F 4E 01 C1 40 01 82 30 ED` |
| 0x01264d | CALL | `01 B0 04 00 C5 CD 3F 4E 01 C1 40 01 82 30 ED` |
| 0x0126be | CALL | `01 2C 01 00 C5 CD 3F 4E 01 C1 40 01 30 30 ED` |
| 0x0128a8 | CALL | `01 DC 05 00 C5 CD 3F 4E 01 C1 40 01 82 30 ED` |
| 0x0128ce | CALL | `01 2C 01 00 C5 CD 3F 4E 01 C1 3A 73 40 D1 B7` |
| 0x0129ce | CALL | `01 DC 05 00 C5 CD 3F 4E 01 C1 40 01 82 30 ED` |
| 0x012a75 | CALL | `01 24 13 00 C5 CD 3F 4E 01 C1 40 01 82 30 ED` |
| 0x014fcf | CALL | `01 DD 07 06 C5 CD 3F 4E 01 C1 3A 7E 00 00 FE` |

---

## 3. Notification RAM Reference Map

| RAM Address | Label | Readers | Writers | Total |
|-------------|-------|---------|---------|-------|
| 0xd14073 | D14073 (enabled flag) | 40 | 12 | 52 |
| 0xd14084 | D14084 (busy flag) | 5 | 22 | 27 |
| 0xd1440e | D1440E (lock) | 1 | 67 | 68 |
| 0xd1440f | D1440F (delivery status) | 51 | 2 | 53 |
| 0xd14408 | D14408 (block pointer) | 0 | 1 | 1 |
| 0xd1440b | D1440B | 0 | 1 | 1 |
| 0xd14410 | D14410 (callback param) | 12 | 12 | 24 |
| 0xd177b7 | D177B7 (sentinel 0x55) | 75 | 16 | 91 |

### Top References per Address

#### D14073 (enabled flag) (0xd14073) — 40R / 12W

| Type | Site | Opcode | Context |
|------|------|--------|---------|
| R | 0x008ab1 | LD A,(nn) | `B7 20 1D 3A 73 40 D1 B7 C2 E1 8B` |
| W | 0x008b3f | LD (nn),A | `D1 3E 01 32 73 40 D1 01 00 00 00` |
| W | 0x009a26 | LD (nn),A | `11 3E 01 32 73 40 D1 CD 13 2D 01` |
| R | 0x009bd5 | LD A,(nn) | `FA 18 41 3A 73 40 D1 B7 20 36 40` |
| R | 0x00f0f7 | LD A,(nn) | `AF 6F 00 3A 73 40 D1 B7 20 0A 3E` |

*47 additional references omitted.*

#### D14084 (busy flag) (0xd14084) — 5R / 22W

| Type | Site | Opcode | Context |
|------|------|--------|---------|
| W | 0x0097ec | LD (nn),A | `6F 00 AF 32 84 40 D1 C3 8B 98 00` |
| W | 0x009b0e | LD (nn),A | `10 3E 01 32 84 40 D1 3A 46 40 D1` |
| W | 0x009b26 | LD (nn),A | `10 3E 01 32 84 40 D1 3A 46 40 D1` |
| W | 0x00ee7d | LD (nn),A | `40 D1 AF 32 84 40 D1 3A 2D 77 D1` |
| W | 0x00f037 | LD (nn),A | `C1 3E 01 32 84 40 D1 AF 32 74 40` |

*22 additional references omitted.*

#### D1440E (lock) (0xd1440e) — 1R / 67W

| Type | Site | Opcode | Context |
|------|------|--------|---------|
| W | 0x008b39 | LD (nn),A | `28 E7 AF 32 0E 44 D1 3E 01 32 73` |
| W | 0x008e39 | LD (nn),A | `28 C8 AF 32 0E 44 D1 CD B6 6E 00` |
| W | 0x008e7e | LD (nn),A | `8F 00 AF 32 0E 44 D1 01 10 00 00` |
| W | 0x00c2fd | LD (nn),A | `44 D1 AF 32 0E 44 D1 2A 10 44 D1` |
| W | 0x00c929 | LD (nn),A | `ED 0F AF 32 0E 44 D1 DD 31 FD FD` |

*63 additional references omitted.*

#### D1440F (delivery status) (0xd1440f) — 51R / 2W

| Type | Site | Opcode | Context |
|------|------|--------|---------|
| R | 0x008b29 | LD A,(nn) | `10 20 0F 3A 0F 44 D1 B7 20 08 3A` |
| R | 0x008e22 | LD A,(nn) | `76 00 00 3A 0F 44 D1 B7 20 0F 3A` |
| R | 0x00c1d4 | LD A,(nn) | `1B 18 1B 3A 0F 44 D1 B7 20 0A 3A` |
| R | 0x00c2e2 | LD A,(nn) | `D1 18 1A 3A 0F 44 D1 B7 20 0A 3A` |
| R | 0x00cce3 | LD A,(nn) | `3B 40 D1 3A 0F 44 D1 B7 20 08 3A` |

*48 additional references omitted.*

#### D14408 (block pointer) (0xd14408) — 0R / 1W

| Type | Site | Opcode | Context |
|------|------|--------|---------|
| W | 0x014e58 | LD (nn),BC | `DD 07 06 ED 43 08 44 D1 01 00 00` |

#### D1440B (0xd1440b) — 0R / 1W

| Type | Site | Opcode | Context |
|------|------|--------|---------|
| W | 0x014e6b | LD (nn),BC | `38 40 D1 ED 43 0B 44 D1 F1 E2 76` |

#### D14410 (callback param) (0xd14410) — 12R / 12W

| Type | Site | Opcode | Context |
|------|------|--------|---------|
| W | 0x00befc | LD (nn),BC | `FD 07 0F ED 43 10 44 D1 DD 31 06` |
| R | 0x00bf63 | LD HL,(nn) | `23 36 00 2A 10 44 D1 CD C2 21 00` |
| R | 0x00bf79 | LD HL,(nn) | `0E 18 7C 2A 10 44 D1 CD C2 21 00` |
| W | 0x00bf8b | LD (nn),BC | `FD 07 0F ED 43 10 44 D1 18 E7 40` |
| R | 0x00bfb4 | LD IY,(nn) | `76 00 00 FD 2A 10 44 D1 ED 03 FF` |

*19 additional references omitted.*

#### D177B7 (sentinel 0x55) (0xd177b7) — 75R / 16W

| Type | Site | Opcode | Context |
|------|------|--------|---------|
| W | 0x00133f | LD (nn),A | `88 D1 AF 32 B7 77 D1 32 BB 77 D1` |
| W | 0x00161e | LD (nn),A | `28 DA AF 32 B7 77 D1 FD E5 CD 9E` |
| W | 0x0018fd | LD (nn),A | `ED B0 AF 32 B7 77 D1 3E 95 32 8F` |
| R | 0x008b30 | LD A,(nn) | `B7 20 08 3A B7 77 D1 FE 55 28 E7` |
| R | 0x008e16 | LD A,(nn) | `20 0D FB 3A B7 77 D1 FE 55 20 02` |

*86 additional references omitted.*

---

## 4. Cross-Reference Summary

### Known Function Calls From 0x014E3F
- 0x00218a: unknown
- 0x014ef8: unknown

### Notification Subsystem Access Hotspots

The most-referenced RAM addresses (by total read+write count):
1. **0xd177b7** (D177B7 (sentinel 0x55)): 75R + 16W = 91 total
1. **0xd1440e** (D1440E (lock)): 1R + 67W = 68 total
1. **0xd1440f** (D1440F (delivery status)): 51R + 2W = 53 total
1. **0xd14073** (D14073 (enabled flag)): 40R + 12W = 52 total
1. **0xd14084** (D14084 (busy flag)): 5R + 22W = 27 total
1. **0xd14410** (D14410 (callback param)): 12R + 12W = 24 total
1. **0xd14408** (D14408 (block pointer)): 0R + 1W = 1 total
1. **0xd1440b** (D1440B): 0R + 1W = 1 total

---

*Generated by probe-phase411-trace-014E3F.mjs*
