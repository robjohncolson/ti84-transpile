# Phase 441 - D14078 USB State Trace

## Summary

- Target address: 0xD14078
- Raw literal hits: 11
- Indexed references via IX/IY base+offset: 0
- Unique direct memory references: 11 (9 writes, 2 reads, 0 address-loads, 0 read+write, 0 unknown)
- Logical mirror families after bank deduplication: 11
- Written values: 0x00, 0x01 -> boolean

> Note: Session 434 reported that 0x00FBD1 (USB event demultiplexer) "clears D14078-D1408D endpoint config on disconnect", suggesting D14078 may be the start of an endpoint config sub-block.

## Counts

| Kind | Count |
| --- | ---: |
| Writes | 9 |
| Reads | 2 |
| Address-loads | 0 |
| Read+Write | 0 |
| Indexed refs | 0 |
| Mirror families | 11 |

## ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 2 |
| 0x02xxxx | 1 |
| 0x04xxxx | 1 |
| other | 7 |

## Mirror Families

| Lead Site | Mirrors | Kind | Nearby D140xx (+/-20) | Nearby Port I/O |
| --- | --- | --- | --- | --- |
| 0x00DA77 | - | WRITE 0x00 (XOR A) | 0xD14079, 0xD1407A | - |
| 0x00FD04 | - | WRITE 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1407B, 0xD1407C | - |
| 0x01312C | - | WRITE 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1408B | - |
| 0x01369D | - | WRITE 0x01 (LD A,imm) | 0xD14073 | - |
| 0x0137A7 | - | READ | - | - |
| 0x0137AF | - | WRITE 0x00 (XOR A) | - | - |
| 0x0138AD | - | READ | - | - |
| 0x0138BB | - | WRITE 0x00 (XOR A) | 0xD14079 | - |
| 0x02C26E | - | WRITE 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1407B, 0xD1407C | - |
| 0x03A898 | - | WRITE 0x00 (XOR A) | 0xD14079, 0xD1407A | - |
| 0x041CB8 | - | WRITE 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1408B | - |

## Full Reference Table

| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Nearby Port I/O | Context |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x00DA77 | WRITE | LD (D14078),A | 0x00D9F2 (CALL __frameset) | 0x00 (XOR A) | 0xD14079, 0xD1407A | - | `32 01 c1 af 32 78 40 d1 af 32 7a 40 d1 af 32 79 40 d1 3e 01 dd f9 dd e1` |
| 0x00FD04 | WRITE | LD (D14078),A | 0x00FC77 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1407B, 0xD1407C | - | `7c 40 d1 af 32 78 40 d1 af 32 79 40 d1 af 32 7a 40 d1 af 32 7b 40 d1 af` |
| 0x01312C | WRITE | LD (D14078),A | 0x013095 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1408B | - | `79 40 d1 af 32 78 40 d1 af 32 7a 40 d1 af 32 95 77 d1 cd 5e 29 01 fe 01` |
| 0x01369D | WRITE | LD (D14078),A | 0x0135D3 (CALL __frameset) | 0x01 (LD A,imm) | 0xD14073 | - | `18 1f 3e 01 32 78 40 d1 18 17 cd d4 51 01 3a 73 40 d1 b7 28 06 cd 6a 10` |
| 0x0137A7 | READ | LD A,(D14078) | 0x013700 (CALL __frameset) | OR A; JR Z | - | - | `01 c1 18 8e 3a 78 40 d1 b7 28 19 af 32 78 40 d1 3e 01 32 fb 76 d1 cd 76` |
| 0x0137AF | WRITE | LD (D14078),A | 0x013700 (CALL __frameset) | 0x00 (XOR A) | - | - | `b7 28 19 af 32 78 40 d1 3e 01 32 fb 76 d1 cd 76 15 01 dd 75 fe dd 74 ff` |
| 0x0138AD | READ | LD A,(D14078) | 0x0137E9 (CALL __frameset) | OR A; JR Z | - | - | `c3 27 38 01 3a 78 40 d1 b7 28 0f 3e 01 32 fb 76 d1 af 32 78 40 d1 c3 1d` |
| 0x0138BB | WRITE | LD (D14078),A | 0x0137E9 (CALL __frameset) | 0x00 (XOR A) | 0xD14079 | - | `fb 76 d1 af 32 78 40 d1 c3 1d 38 01 3a 79 40 d1 b7 28 19 af 32 79 40 d1` |
| 0x02C26E | WRITE | LD (D14078),A | 0x02C175 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1407B, 0xD1407C | - | `7c 40 d1 af 32 78 40 d1 af 32 79 40 d1 af 32 7a 40 d1 af 32 7b 40 d1 af` |
| 0x03A898 | WRITE | LD (D14078),A | 0x03A80F (after RET fallback) | 0x00 (XOR A) | 0xD14079, 0xD1407A | - | `1e 04 c1 af 32 78 40 d1 af 32 7a 40 d1 af 32 79 40 d1 3e 01 dd f9 dd e1` |
| 0x041CB8 | WRITE | LD (D14078),A | 0x041C21 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1408B | - | `79 40 d1 af 32 78 40 d1 af 32 7a 40 d1 af 32 95 77 d1 cd 2e 15 04 fe 01` |

## Write Values Observed

- `0x00 (XOR A)` at 0x00DA77
- `0x00 (XOR A)` at 0x00FD04
- `0x00 (XOR A)` at 0x01312C
- `0x01 (LD A,imm)` at 0x01369D
- `0x00 (XOR A)` at 0x0137AF
- `0x00 (XOR A)` at 0x0138BB
- `0x00 (XOR A)` at 0x02C26E
- `0x00 (XOR A)` at 0x03A898
- `0x00 (XOR A)` at 0x041CB8

## Read Patterns

| Site | Mnemonic | Gate Pattern |
| --- | --- | --- |
| 0x0137A7 | LD A,(D14078) | OR A; JR Z |
| 0x0138AD | LD A,(D14078) | OR A; JR Z |

## Co-access Frequency (+/-20 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD14079 | 7 |
| 0xD1407A | 6 |
| 0xD1407B | 2 |
| 0xD1407C | 2 |
| 0xD1408B | 2 |
| 0xD14073 | 1 |

## Port I/O Summary

- No nearby 0x30xx/0x31xx port accesses found within +/-32 byte window.

## Classification

- D14078 is a **boolean** flag (only 0x00 and 0x01 written).
- Total references: 11 (9W / 2R / 0AL / 0RW)

## Conclusion

- D14078 has 11 total reference sites across 11 mirror families.
- Most frequent co-accessed D140xx bytes: 0xD14079 (7x), 0xD1407A (6x), 0xD1407B (2x).
- Suggested semantic name: needs manual analysis of the access patterns above.
