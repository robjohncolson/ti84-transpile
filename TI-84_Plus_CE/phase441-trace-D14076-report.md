# Phase 441 - D14076 USB State Trace

## Summary

- Target: `D14076` (0xD14076)
- Raw literal hits: 15
- Indexed references via IX/IY base+offset: 0
- Unique direct memory references: 15 (10 writes, 5 reads, 0 read+write, 0 address-loads)
- Logical mirror families after bank deduplication: 15
- Written values: 0x00
- Classification: **boolean (0/1)**

## Counts

| Kind | Count |
| --- | ---: |
| Writes | 10 |
| Reads | 5 |
| Read+Write | 0 |
| Address-loads | 0 |
| Indexed refs | 0 |
| Mirror families | 15 |

## ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 6 |
| 0x01xxxx | 1 |
| 0x03xxxx | 7 |
| 0x04xxxx | 1 |

## Mirror Families

| Lead Site | Mirrors | Kind | Nearby D140xx (+/-20) | Nearby Port I/O |
| --- | --- | --- | --- | --- |
| 0x0099F7 | - | WRITE 0x00 (XOR A) | 0xD14072 | IN A,(0x3080), OUT (0x3080),A |
| 0x00E741 | - | READ | - | - |
| 0x00E746 | - | READ | - | - |
| 0x00E74B | - | WRITE unknown | - | - |
| 0x00FAE6 | - | READ | - | - |
| 0x00FB0E | - | WRITE 0x00 (XOR A) | - | - |
| 0x010085 | - | WRITE 0x00 (XOR A) | - | IN A,(0x0077) |
| 0x0322FB | - | WRITE 0x00 (XOR A) | - | - |
| 0x0323A3 | - | WRITE 0x00 (XOR A) | - | - |
| 0x03B98B | - | READ | - | - |
| 0x03B990 | - | READ | - | - |
| 0x03B995 | - | WRITE unknown | - | - |
| 0x03C80D | - | WRITE 0x00 (XOR A) | - | - |
| 0x03CF29 | - | WRITE 0x00 (XOR A) | 0xD14089 | - |
| 0x0493E3 | - | WRITE 0x00 (XOR A) | 0xD14072 | IN A,(0x3080), OUT (0x3080),A |

## Full Reference Table

| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Nearby Port I/O | Context |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x0099F7 | WRITE | LD (D14076),A | 0x0094C4 (CALL __frameset) | 0x00 (XOR A) | 0xD14072 | IN A,(0x3080), OUT (0x3080),A | `80 20 fa af 32 76 40 d1 af 32 72 40 d1 01 10 00 00 c5 cd 2d 32 01 c1 cd` |
| 0x00E741 | READ | LD A,(D14076) | 0x00E587 (CALL __frameset) | JR NC | - | - | `00 23 36 00 3a 76 40 d1 47 3a 76 40 d1 3c 32 76 40 d1 40 01 30 30 ed 78` |
| 0x00E746 | READ | LD A,(D14076) | 0x00E587 (CALL __frameset) | JR NC | - | - | `76 40 d1 47 3a 76 40 d1 3c 32 76 40 d1 40 01 30 30 ed 78 e6 01 20 06 3e` |
| 0x00E74B | WRITE | LD (D14076),A | 0x00E587 (CALL __frameset) | unknown | - | - | `76 40 d1 3c 32 76 40 d1 40 01 30 30 ed 78 e6 01 20 06 3e 01 c3 19 e9 00` |
| 0x00FAE6 | READ | LD A,(D14076) | 0x00F5B4 (CALL __frameset) | OR A; JR Z | - | - | `ff b7 20 2e 3a 76 40 d1 b7 28 27 3a 0f 44 d1 b7 20 15 3a b7 77 d1 fe 55` |
| 0x00FB0E | WRITE | LD (D14076),A | 0x00F5B4 (CALL __frameset) | 0x00 (XOR A) | - | - | `36 ff 01 af 32 76 40 d1 18 d2 dd 7e ff fe 01 20 0c 01 03 00 00 dd 31 06` |
| 0x010085 | WRITE | LD (D14076),A | 0x01001B (PUSH IY) | 0x00 (XOR A) | - | IN A,(0x0077) | `fd 2f 1b af 32 76 40 d1 dd f9 dd e1 c9 ff ff 01 fc 77 d1 2a db 77 d1 09` |
| 0x0322FB | WRITE | LD (D14076),A | 0x03207A (PUSH AF; DI) | 0x00 (XOR A) | - | - | `fd 0f 1b af 32 76 40 d1 dd 31 fd fd 27 00 cd 38 01 00 28 0f dd 31 fd fd` |
| 0x0323A3 | WRITE | LD (D14076),A | 0x03207A (PUSH AF; DI) | 0x00 (XOR A) | - | - | `ff 18 b3 af 32 76 40 d1 01 10 57 00 c5 cd 2f 20 05 c1 dd f9 dd e1 c9 21` |
| 0x03B98B | READ | LD A,(D14076) | 0x03B7BD (after RET fallback) | JR NC | - | - | `00 23 36 00 3a 76 40 d1 47 3a 76 40 d1 3c 32 76 40 d1 40 01 30 30 ed 78` |
| 0x03B990 | READ | LD A,(D14076) | 0x03B7BD (after RET fallback) | JR NC | - | - | `76 40 d1 47 3a 76 40 d1 3c 32 76 40 d1 40 01 30 30 ed 78 e6 01 20 06 3e` |
| 0x03B995 | WRITE | LD (D14076),A | 0x03B7BD (after RET fallback) | unknown | - | - | `76 40 d1 3c 32 76 40 d1 40 01 30 30 ed 78 e6 01 20 06 3e 01 c3 e0 bb 03` |
| 0x03C80D | WRITE | LD (D14076),A | 0x03C7AD (after RET fallback) | 0x00 (XOR A) | - | - | `ff 18 ab af 32 76 40 d1 01 04 5a 00 c5 cd 2f 20 05 c1 dd f9 dd e1 c9 21` |
| 0x03CF29 | WRITE | LD (D14076),A | 0x03CEB7 (PUSH IY) | 0x00 (XOR A) | 0xD14089 | - | `fd 2f 1b af 32 76 40 d1 3a 89 40 d1 b7 28 11 3a 89 40 d1 b7 28 2f dd 31` |
| 0x0493E3 | WRITE | LD (D14076),A | 0x048D7A (PUSH AF; DI) | 0x00 (XOR A) | 0xD14072 | IN A,(0x3080), OUT (0x3080),A | `80 20 fa af 32 76 40 d1 af 32 72 40 d1 01 10 00 00 c5 cd 95 1e 04 c1 cd` |

## Write Values Observed

- `0x00 (XOR A)`: 0x0099F7, 0x00FB0E, 0x010085, 0x0322FB, 0x0323A3, 0x03C80D, 0x03CF29, 0x0493E3
- `unknown`: 0x00E74B, 0x03B995

## Read Patterns

| Site | Mnemonic | Gate |
| --- | --- | --- |
| 0x00E741 | LD A,(D14076) | JR NC |
| 0x00E746 | LD A,(D14076) | JR NC |
| 0x00FAE6 | LD A,(D14076) | OR A; JR Z |
| 0x03B98B | LD A,(D14076) | JR NC |
| 0x03B990 | LD A,(D14076) | JR NC |

## Co-access Frequency (+/-20 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD14072 | 2 |
| 0xD14089 | 1 |

## Port I/O Summary

| Port op | Count |
| --- | ---: |
| IN A,(0x3080) | 2 |
| OUT (0x3080),A | 2 |
| IN A,(0x0077) | 1 |

## Conclusion

- Total references: 15
- Classification: boolean (0/1)
- Write sites: 10
- Read sites: 5
- Most frequent co-access: 0xD14072 (2 times)
- Suggested semantic name: (to be determined from probe output)
