# Phase 441 - D14077 USB State Trace

## Summary

- Target address: 0xD14077
- Raw literal hits: 6
- Indexed references via IX/IY base+offset: 0
- Unique direct memory references: 6 (2 writes, 4 reads, 0 address-loads, 0 read+write, 0 unknown)
- Logical mirror families after bank deduplication: 6
- Written values: 0x00, 0x01 -> boolean

## Counts

| Kind | Count |
| --- | ---: |
| Writes | 2 |
| Reads | 4 |
| Address-loads | 0 |
| Read+Write | 0 |
| Indexed refs | 0 |
| Mirror families | 6 |

## ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 1 |
| other | 5 |

## Mirror Families

| Lead Site | Mirrors | Kind | Nearby D140xx (+/-20) | Nearby Port I/O |
| --- | --- | --- | --- | --- |
| 0x00CCA6 | - | READ | 0xD14014 | - |
| 0x014E85 | - | READ | - | - |
| 0x014EED | - | WRITE 0x00 (XOR A) | - | - |
| 0x014EF8 | - | READ | - | - |
| 0x014F92 | - | WRITE 0x01 (LD A,imm) | - | - |
| 0x0390D9 | - | READ | 0xD14014 | IN A,(0x3040) |

## Full Reference Table

| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Nearby Port I/O | Context |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x00CCA6 | READ | LD A,(D14077) | 0x00CC71 (CALL __frameset0) | OR A; JR NZ | 0xD14014 | - | `28 00 c1 c1 3a 77 40 d1 b7 20 04 cd 97 4f 01 dd 7e 09 b7 20 0a 01 32 00` |
| 0x014E85 | READ | LD A,(D14077) | 0x014E83 (PUSH AF; DI) | OR A; JR Z | - | - | `ed 57 f5 f3 3a 77 40 d1 b7 28 65 01 04 50 00 ed 78 cb 9f ed 79 78 fe 50` |
| 0x014EED | WRITE | LD (D14077),A | 0x014E83 (PUSH AF; DI) | 0x00 (XOR A) | - | - | `30 20 fa af 32 77 40 d1 f1 e2 f7 4e 01 fb c9 3a 77 40 d1 b7 c2 96 4f 01` |
| 0x014EF8 | READ | LD A,(D14077) | 0x014E83 (PUSH AF; DI) | OR A; JP NZ | - | - | `4e 01 fb c9 3a 77 40 d1 b7 c2 96 4f 01 01 08 50 00 3e 08 ed 79 78 fe 50` |
| 0x014F92 | WRITE | LD (D14077),A | 0x014E83 (PUSH AF; DI) | 0x01 (LD A,imm) | - | - | `20 fa 3e 01 32 77 40 d1 c9 cd 81 4e 01 cd f8 4e 01 c9 cd 8a 21 00 fd 21` |
| 0x0390D9 | READ | LD A,(D14077) | 0x0390A4 (after RET fallback) | OR A; JR NZ | 0xD14014 | IN A,(0x3040) | `00 00 c1 c1 3a 77 40 d1 b7 20 04 cd f0 04 00 dd 7e 09 b7 20 0a 01 32 00` |

## Write Values Observed

- `0x00 (XOR A)` at 0x014EED
- `0x01 (LD A,imm)` at 0x014F92

## Read Patterns

| Site | Mnemonic | Gate Pattern |
| --- | --- | --- |
| 0x00CCA6 | LD A,(D14077) | OR A; JR NZ |
| 0x014E85 | LD A,(D14077) | OR A; JR Z |
| 0x014EF8 | LD A,(D14077) | OR A; JP NZ |
| 0x0390D9 | LD A,(D14077) | OR A; JR NZ |

## Co-access Frequency (+/-20 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD14014 | 2 |

## Port I/O Summary

| Port op | Count |
| --- | ---: |
| IN A,(0x3040) | 1 |

## Classification

- D14077 is a **boolean** flag (only 0x00 and 0x01 written).
- Total references: 6 (2W / 4R / 0AL / 0RW)

## Conclusion

- D14077 has 6 total reference sites across 6 mirror families.
- Most frequent co-accessed D140xx bytes: 0xD14014 (2x).
- Suggested semantic name: needs manual analysis of the access patterns above.
