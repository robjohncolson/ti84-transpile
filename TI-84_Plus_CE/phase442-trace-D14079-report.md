# Phase 442 - D14079 & D1407A USB State Trace

## Overview

Last 2 unmapped bytes in the D14070-D1407F USB state block.
Known: bulk-cleared alongside D14078 on disconnect at 0x00FD04 and 0x02C22E.

---
## D14079

### Summary

- Raw literal hits: 14
- Indexed references: 0
- Total unique references: 14 (12 writes, 2 reads, 0 address-loads, 0 read+write)
- Written values: 0x00, 0x01 -> **boolean**

### ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 2 |
| 0x01xxxx | 9 |
| 0x02xxxx | 1 |
| 0x03xxxx | 1 |
| 0x04xxxx | 1 |

### Co-access Frequency (+/-30 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD14079 | 14 |
| 0xD14078 | 10 |
| 0xD1407A | 6 |
| 0xD14073 | 4 |
| 0xD1407B | 2 |
| 0xD1407C | 2 |
| 0xD1407E | 2 |
| 0xD1407F | 2 |
| 0xD14080 | 2 |
| 0xD1408B | 2 |

### Port I/O Summary

- No nearby port accesses found.

### Full Reference Table

| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Context |
| --- | --- | --- | --- | --- | --- | --- |
| 0x00DA81 | WRITE | LD (D14079),A | 0x00D9F2 (CALL __frameset) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A | 7a 40 d1 af 32 79 40 d1 3e 01 dd f9 dd e1 c9 cd 8a 21 00 dd 7e 06 fe 01 |
| 0x00FD09 | WRITE | LD (D14079),A | 0x00FC77 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1407B, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080 | 78 40 d1 af 32 79 40 d1 af 32 7a 40 d1 af 32 7b 40 d1 af 32 7e 40 d1 af |
| 0x013127 | WRITE | LD (D14079),A | 0x013095 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1408B | 9a 6f 00 af 32 79 40 d1 af 32 78 40 d1 af 32 7a 40 d1 af 32 95 77 d1 cd |
| 0x0133FA | WRITE | LD (D14079),A | 0x01337B (CALL __frameset) | 0x01 (LD A,imm) | 0xD14073, 0xD14079 | 18 12 3e 01 32 79 40 d1 18 0a 01 00 00 00 c5 cd c2 50 01 c1 dd f9 dd e1 |
| 0x0135C6 | WRITE | LD (D14079),A | 0x013413 (CALL __frameset) | 0x01 (LD A,imm) | 0xD14073, 0xD14079 | 18 06 3e 01 32 79 40 d1 dd f9 dd e1 c9 21 fb ff ff cd 97 21 00 01 00 00 |
| 0x0136B6 | WRITE | LD (D14079),A | 0x0135D3 (CALL __frameset) | 0x01 (LD A,imm) | 0xD14073, 0xD14078, 0xD14079 | 18 06 3e 01 32 79 40 d1 dd f9 dd e1 c9 cd 8a 21 00 dd 07 06 cd 6b 27 00 |
| 0x0136F1 | WRITE | LD (D14079),A | 0x0136BF (CALL __frameset0) | 0x01 (LD A,imm) | 0xD14073, 0xD14079 | 18 06 3e 01 32 79 40 d1 dd f9 dd e1 c9 ff ff 21 fe ff ff cd 97 21 00 dd |
| 0x0137C7 | READ | LD A,(D14079) | 0x013700 (CALL __frameset) | OR A; JR Z | 0xD14078, 0xD14079 | c3 35 37 01 3a 79 40 d1 b7 28 0f 3e 01 32 fb 76 d1 af 32 79 40 d1 c3 2b |
| 0x0137D5 | WRITE | LD (D14079),A | 0x013700 (CALL __frameset) | 0x00 (XOR A) | 0xD14079 | fb 76 d1 af 32 79 40 d1 c3 2b 37 01 dd 27 fe dd f9 dd e1 c9 21 fe ff ff |
| 0x0138C3 | READ | LD A,(D14079) | 0x0137E9 (CALL __frameset) | OR A; JR Z | 0xD14078, 0xD14079 | c3 1d 38 01 3a 79 40 d1 b7 28 19 af 32 79 40 d1 3e 01 32 fb 76 d1 cd 6a |
| 0x0138CB | WRITE | LD (D14079),A | 0x0137E9 (CALL __frameset) | 0x00 (XOR A) | 0xD14078, 0xD14079 | b7 28 19 af 32 79 40 d1 3e 01 32 fb 76 d1 cd 6a 10 01 dd 75 fe dd 74 ff |
| 0x02C273 | WRITE | LD (D14079),A | 0x02C175 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1407B, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080 | 78 40 d1 af 32 79 40 d1 af 32 7a 40 d1 af 32 7b 40 d1 af 32 7e 40 d1 af |
| 0x03A8A2 | WRITE | LD (D14079),A | 0x03A80F (after RET fallback) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A | 7a 40 d1 af 32 79 40 d1 3e 01 dd f9 dd e1 c9 cd 30 01 00 dd 7e 06 fe 01 |
| 0x041CB3 | WRITE | LD (D14079),A | 0x041C21 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1408B | c8 03 00 af 32 79 40 d1 af 32 78 40 d1 af 32 7a 40 d1 af 32 95 77 d1 cd |

---
## D1407A

### Summary

- Raw literal hits: 13
- Indexed references: 0
- Total unique references: 13 (11 writes, 2 reads, 0 address-loads, 0 read+write)
- Written values: 0x00, 0x01 -> **boolean**

### ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 2 |
| 0x01xxxx | 8 |
| 0x02xxxx | 1 |
| 0x03xxxx | 1 |
| 0x04xxxx | 1 |

### Co-access Frequency (+/-30 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD1407A | 13 |
| 0xD14078 | 6 |
| 0xD14079 | 6 |
| 0xD1407B | 2 |
| 0xD1407C | 2 |
| 0xD1407E | 2 |
| 0xD1407F | 2 |
| 0xD14080 | 2 |
| 0xD14081 | 2 |
| 0xD1408B | 2 |
| 0xD14073 | 1 |

### Port I/O Summary

- No nearby port accesses found.

### Full Reference Table

| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Context |
| --- | --- | --- | --- | --- | --- | --- |
| 0x00DA7C | WRITE | LD (D1407A),A | 0x00D9F2 (CALL __frameset) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A | 78 40 d1 af 32 7a 40 d1 af 32 79 40 d1 3e 01 dd f9 dd e1 c9 cd 8a 21 00 |
| 0x00FD0E | WRITE | LD (D1407A),A | 0x00FC77 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1407B, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080, 0xD14081 | 79 40 d1 af 32 7a 40 d1 af 32 7b 40 d1 af 32 7e 40 d1 af 32 7f 40 d1 af |
| 0x011FBB | WRITE | LD (D1407A),A | 0x011F20 (CALL __frameset) | 0x01 (LD A,imm) | 0xD14073, 0xD1407A | 18 0d 3e 01 32 7a 40 d1 01 00 00 00 dd 0f fd 2a f2 76 d1 cd c2 21 00 c2 |
| 0x012042 | WRITE | LD (D1407A),A | 0x011F20 (CALL __frameset) | 0x01 (LD A,imm) | 0xD1407A | 0f fd 3e 01 32 7a 40 d1 c3 ea 21 01 3a b8 77 d1 fe 0b 28 58 3a b8 77 d1 |
| 0x0122FA | WRITE | LD (D1407A),A | 0x0121F3 (CALL __frameset) | 0x01 (LD A,imm) | 0xD1407A | 18 3e 3e 01 32 7a 40 d1 18 36 dd 07 06 ed 43 f2 76 d1 01 03 00 00 dd 27 |
| 0x013131 | WRITE | LD (D1407A),A | 0x013095 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1408B | 78 40 d1 af 32 7a 40 d1 af 32 95 77 d1 cd 5e 29 01 fe 01 20 2d cd c2 2a |
| 0x013767 | READ | LD A,(D1407A) | 0x013700 (CALL __frameset) | OR A; JR Z | 0xD1407A | 74 ff 18 76 3a 7a 40 d1 b7 28 39 af 32 7a 40 d1 ed 4b 92 77 d1 c5 cd bc |
| 0x01376F | WRITE | LD (D1407A),A | 0x013700 (CALL __frameset) | 0x00 (XOR A) | 0xD1407A | b7 28 39 af 32 7a 40 d1 ed 4b 92 77 d1 c5 cd bc 55 01 c1 dd 75 fe dd 74 |
| 0x01386B | READ | LD A,(D1407A) | 0x0137E9 (CALL __frameset) | OR A; JR Z | 0xD1407A | c1 c1 18 78 3a 7a 40 d1 b7 28 3b af 32 7a 40 d1 ed 4b 92 77 d1 c5 cd bc |
| 0x013873 | WRITE | LD (D1407A),A | 0x0137E9 (CALL __frameset) | 0x00 (XOR A) | 0xD1407A | b7 28 3b af 32 7a 40 d1 ed 4b 92 77 d1 c5 cd bc 55 01 c1 dd 75 fe dd 74 |
| 0x02C278 | WRITE | LD (D1407A),A | 0x02C175 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1407B, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080, 0xD14081 | 79 40 d1 af 32 7a 40 d1 af 32 7b 40 d1 af 32 7e 40 d1 af 32 7f 40 d1 af |
| 0x03A89D | WRITE | LD (D1407A),A | 0x03A80F (after RET fallback) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A | 78 40 d1 af 32 7a 40 d1 af 32 79 40 d1 3e 01 dd f9 dd e1 c9 cd 30 01 00 |
| 0x041CBD | WRITE | LD (D1407A),A | 0x041C21 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1408B | 78 40 d1 af 32 7a 40 d1 af 32 95 77 d1 cd 2e 15 04 fe 01 20 2d cd 49 17 |

---
## Combined Analysis

### Shared Clear Sites

Sites that clear both D14079 and D1407A (and typically D14078):

| D14079 site | D1407A site | Distance |
| --- | --- | --- |
| 0x00DA81 | 0x00DA7C | 5 bytes |
| 0x00FD09 | 0x00FD0E | 5 bytes |
| 0x013127 | 0x013131 | 10 bytes |
| 0x02C273 | 0x02C278 | 5 bytes |
| 0x03A8A2 | 0x03A89D | 5 bytes |
| 0x041CB3 | 0x041CBD | 10 bytes |

### Classification

- **D14079**: Boolean (0/1 only)
- **D1407A**: Boolean (0/1 only)

### Semantic Assessment

Based on the reference patterns:

- **D14079**: 12 write sites, 2 read sites.
  - Strict boolean behavior (only 0x00 and 0x01 written).
  - Top co-accessed bytes: 0xD14079, 0xD14078, 0xD1407A, 0xD14073, 0xD1407B

- **D1407A**: 11 write sites, 2 read sites.
  - Strict boolean behavior (only 0x00 and 0x01 written).
  - Top co-accessed bytes: 0xD1407A, 0xD14078, 0xD14079, 0xD1407B, 0xD1407C

### D14070-D1407F Block Now Complete

| Offset | Address | Semantic Name | Refs |
| --- | --- | --- | ---: |
| +0 | D14070 | transfer-direction | - |
| +1 | D14071 | (reserved/unused) | - |
| +2 | D14072 | physical-connection flag | 19 |
| +3 | D14073 | dual-banked endpoint state | 12 |
| +4 | D14074 | (unused) | - |
| +5 | D14075 | callback-pending flag | 6 |
| +6 | D14076 | poll retry counter | 15 |
| +7 | D14077 | timer-enable flag | 6 |
| +8 | D14078 | endpoint-configured / deferred-ready-pending | 11 |
| +9 | D14079 | (this trace) | 14 |
| +A | D1407A | (this trace) | 13 |
| +B | D1407B | SOF-received flag | 19 |
| +C | D1407C | pipe-pending flag | 17 |
| +D | D1407D | bus-reset notification | 6 |
| +E | D1407E | pipe-active flag | 28 |
| +F | D1407F | transfer-active flag | 12 |
