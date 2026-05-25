# Phase 441 - D14038 USB State Trace

## Summary

- Raw literal hits: 19
- Indexed references via IX/IY base+offset: 0
- Unique references after dedup: 19 (5 writes, 14 reads, 0 read+write, 0 address-loads)
- Logical mirror families after bank deduplication: 19
- Written values: 0x01 -> boolean

- **Classification**: boolean flag

## Counts

| Kind | Count |
| --- | ---: |
| Writes | 5 |
| Reads | 14 |
| Read+Write (INC/DEC) | 0 |
| Address-loads | 0 |
| Indexed refs | 0 |
| Mirror families | 19 |

## ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 1 |
| 0x04xxxx | 1 |
| 0x0Bxxxx | 5 |
| other | 12 |

## Mirror Families

| Lead Site | Mirrors | Kind | Nearby D140xx (+/-32) | Nearby Port I/O |
| --- | --- | --- | --- | --- |
| 0x0097CD | - | WRITE 0x01 (LD A,imm) | 0xD1407B, 0xD1407C, 0xD14084 | IN A,(0x313D), OUT (0x313D),A |
| 0x014D62 | - | READ | - | - |
| 0x014DAB | - | READ | 0xD1407B, 0xD1407C, 0xD1408D | - |
| 0x014DB0 | - | READ | 0xD1407B, 0xD1407C, 0xD1408D | - |
| 0x014DB6 | - | WRITE unknown | 0xD1407B, 0xD1407C, 0xD1408D | - |
| 0x014DD0 | - | READ | 0xD1407B, 0xD1407C, 0xD14081, 0xD1408D | - |
| 0x014E66 | - | READ | 0xD14077 | - |
| 0x014F42 | - | WRITE unknown | - | - |
| 0x0151BE | - | READ | - | - |
| 0x0151E2 | - | READ | - | - |
| 0x015218 | - | READ | - | - |
| 0x03356A | - | READ | - | - |
| 0x033573 | - | READ | - | - |
| 0x04918E | - | WRITE 0x01 (LD A,imm) | 0xD1407B, 0xD1407C, 0xD14084 | IN A,(0x313D), OUT (0x313D),A |
| 0x0BCC2E | - | READ | - | - |
| 0x0BCC81 | - | READ | 0xD1407B, 0xD1407C, 0xD1408D | - |
| 0x0BCC86 | - | READ | 0xD1407B, 0xD1407C, 0xD1408D | - |
| 0x0BCC8C | - | WRITE unknown | 0xD1407B, 0xD1407C, 0xD1408D | - |
| 0x0BCCA6 | - | READ | 0xD1407B, 0xD1407C, 0xD14081, 0xD1408D | - |

## Full Reference Table

| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Nearby D1407x | Port I/O | Context |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0x0097CD | WRITE | LD (D14038),BC | 0x0094C4 (CALL __frameset) | 0x01 (LD A,imm) | 0xD1407B, 0xD1407C, 0xD14084 | 0xD1407B, 0xD1407C | IN A,(0x313D), OUT (0x313D),A | `01 00 00 00 ed 43 38 40 d1 01 3d 31 00 ed 78 cb d7 ed 79 78 fe 31 28 01 cf 79 fe 3d` |
| 0x014D62 | READ | LD HL,(D14038) | 0x014D4C (CALL __frameset) | JR C | - | - | - | `0a b7 20 44 2a 38 40 d1 dd 31 06 fd 07 06 b7 ed 42 dd 2f fd dd 31 06 fd 07 03 dd 27` |
| 0x014DAB | READ | LD BC,(D14038) | 0x014D4C (CALL __frameset) | JR C | 0xD1407B, 0xD1407C, 0xD1408D | 0xD1407B, 0xD1407C | - | `f9 dd e1 c9 ed 4b 38 40 d1 ed 4b 38 40 d1 03 ed 43 38 40 d1 3a 7b 40 d1 b7 20 0e 3a` |
| 0x014DB0 | READ | LD BC,(D14038) | 0x014D4C (CALL __frameset) | JR C | 0xD1407B, 0xD1407C, 0xD1408D | 0xD1407B, 0xD1407C | - | `4b 38 40 d1 ed 4b 38 40 d1 03 ed 43 38 40 d1 3a 7b 40 d1 b7 20 0e 3a 8d 40 d1 b7 20` |
| 0x014DB6 | WRITE | LD (D14038),BC | 0x014D4C (CALL __frameset) | unknown | 0xD1407B, 0xD1407C, 0xD1408D | 0xD1407B, 0xD1407C | - | `38 40 d1 03 ed 43 38 40 d1 3a 7b 40 d1 b7 20 0e 3a 8d 40 d1 b7 20 57 3a 7c 40 d1 b7` |
| 0x014DD0 | READ | LD BC,(D14038) | 0x014D4C (CALL __frameset) | JR C | 0xD1407B, 0xD1407C, 0xD14081, 0xD1408D | 0xD1407B, 0xD1407C | - | `d1 b7 28 50 ed 4b 38 40 d1 21 d0 07 00 b7 ed 42 30 42 3a b8 77 d1 fe 40 30 3a cd b6` |
| 0x014E66 | READ | LD BC,(D14038) | 0x014E45 (PUSH AF; DI) | JR C | 0xD14077 | 0xD14077 | - | `43 05 44 d1 ed 4b 38 40 d1 ed 43 0b 44 d1 f1 e2 76 4e 01 fb 3e 01 32 0e 44 d1 dd f9` |
| 0x014F42 | WRITE | LD (D14038),BC | 0x014E83 (PUSH AF; DI) | unknown | - | - | - | `01 00 00 00 ed 43 38 40 d1 c5 01 00 c0 00 c5 cd 21 71 00 c1 c1 01 00 00 00 c5 01 00` |
| 0x0151BE | READ | LD BC,(D14038) | 0x0150C6 (CALL __frameset) | JR C | - | - | - | `43 c0 76 d1 ed 4b 38 40 d1 ed 43 c6 76 d1 af 32 ca 76 d1 3e 01 32 c9 76 d1 c9 ed 57` |
| 0x0151E2 | READ | LD BC,(D14038) | 0x0151D6 (PUSH AF; DI) | JR C | - | - | - | `43 c3 76 d1 ed 4b 38 40 d1 ed 43 c6 76 d1 af 32 ca 76 d1 3e 01 32 c9 76 d1 f1 e2 fd` |
| 0x015218 | READ | LD BC,(D14038) | 0x0151FE (CALL __frameset0) | JR C | - | - | - | `43 70 77 d1 ed 4b 38 40 d1 ed 43 76 77 d1 af 32 7a 77 d1 3e 01 32 79 77 d1 dd f9 dd` |
| 0x03356A | READ | LD BC,(D14038) | 0x032E6A (PUSH IY) | JR C | - | - | - | `fd 36 03 43 ed 4b 38 40 d1 af 5f c5 e1 ed 4b 38 40 d1 af cd cc 01 00 dd 31 06 fd 2f` |
| 0x033573 | READ | LD BC,(D14038) | 0x032E6A (PUSH IY) | JR C | - | - | - | `af 5f c5 e1 ed 4b 38 40 d1 af cd cc 01 00 dd 31 06 fd 2f 04 fd 73 07 01 10 5a 00 c5` |
| 0x04918E | WRITE | LD (D14038),BC | 0x048D7A (PUSH AF; DI) | 0x01 (LD A,imm) | 0xD1407B, 0xD1407C, 0xD14084 | 0xD1407B, 0xD1407C | IN A,(0x313D), OUT (0x313D),A | `01 00 00 00 ed 43 38 40 d1 01 3d 31 00 ed 78 cb d7 ed 79 78 fe 31 28 01 cf 79 fe 3d` |
| 0x0BCC2E | READ | LD HL,(D14038) | 0x0BCC13 (after RET fallback) | JR C | - | - | - | `0a b7 20 4e 2a 38 40 d1 dd 31 06 fd 07 06 b7 ed 42 dd 2f fd dd 31 06 fd 07 03 dd 27` |
| 0x0BCC81 | READ | LD BC,(D14038) | 0x0BCC81 (after RET fallback) | JR C | 0xD1407B, 0xD1407C, 0xD1408D | 0xD1407B, 0xD1407C | - | `f9 dd e1 c9 ed 4b 38 40 d1 ed 4b 38 40 d1 03 ed 43 38 40 d1 3a 7b 40 d1 b7 20 0e 3a` |
| 0x0BCC86 | READ | LD BC,(D14038) | 0x0BCC81 (after RET fallback) | JR C | 0xD1407B, 0xD1407C, 0xD1408D | 0xD1407B, 0xD1407C | - | `4b 38 40 d1 ed 4b 38 40 d1 03 ed 43 38 40 d1 3a 7b 40 d1 b7 20 0e 3a 8d 40 d1 b7 20` |
| 0x0BCC8C | WRITE | LD (D14038),BC | 0x0BCC81 (after RET fallback) | unknown | 0xD1407B, 0xD1407C, 0xD1408D | 0xD1407B, 0xD1407C | - | `38 40 d1 03 ed 43 38 40 d1 3a 7b 40 d1 b7 20 0e 3a 8d 40 d1 b7 20 65 3a 7c 40 d1 b7` |
| 0x0BCCA6 | READ | LD BC,(D14038) | 0x0BCC81 (after RET fallback) | JR C | 0xD1407B, 0xD1407C, 0xD14081, 0xD1408D | 0xD1407B, 0xD1407C | - | `d1 b7 28 5e ed 4b 38 40 d1 21 d0 07 00 b7 ed 42 30 50 3a b8 77 d1 fe 40 30 48 cd e8` |

## Write Values Observed

- `0x0097CD`: LD (D14038),BC -> 0x01 (LD A,imm)
- `0x014DB6`: LD (D14038),BC -> unknown
- `0x014F42`: LD (D14038),BC -> unknown
- `0x04918E`: LD (D14038),BC -> 0x01 (LD A,imm)
- `0x0BCC8C`: LD (D14038),BC -> unknown

## Read Patterns

| Site | Mnemonic | Gate Pattern |
| --- | --- | --- |
| 0x014D62 | LD HL,(D14038) | JR C |
| 0x014DAB | LD BC,(D14038) | JR C |
| 0x014DB0 | LD BC,(D14038) | JR C |
| 0x014DD0 | LD BC,(D14038) | JR C |
| 0x014E66 | LD BC,(D14038) | JR C |
| 0x0151BE | LD BC,(D14038) | JR C |
| 0x0151E2 | LD BC,(D14038) | JR C |
| 0x015218 | LD BC,(D14038) | JR C |
| 0x03356A | LD BC,(D14038) | JR C |
| 0x033573 | LD BC,(D14038) | JR C |
| 0x0BCC2E | LD HL,(D14038) | JR C |
| 0x0BCC81 | LD BC,(D14038) | JR C |
| 0x0BCC86 | LD BC,(D14038) | JR C |
| 0x0BCCA6 | LD BC,(D14038) | JR C |

## Co-access Frequency (D140xx, +/-32 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD1407B | 10 |
| 0xD1407C | 10 |
| 0xD1408D | 8 |
| 0xD14084 | 2 |
| 0xD14081 | 2 |
| 0xD14077 | 1 |

## D1407x Co-access (SOF/pipe-pending group, +/-32 bytes)

| D1407x byte | Count | Known role |
| --- | ---: | --- |
| 0xD1407B | 10 | SOF-received flag |
| 0xD1407C | 10 | pipe-pending flag |
| 0xD14077 | 1 | unmapped |

## Port I/O Summary

| Port op | Count |
| --- | ---: |
| IN A,(0x313D) | 2 |
| OUT (0x313D),A | 2 |

## Relationship to D1407B (SOF) and D1407C (pipe-pending)

- D1407B co-accessed at 10/19 sites: 0x0097CD, 0x014DAB, 0x014DB0, 0x014DB6, 0x014DD0, 0x04918E, 0x0BCC81, 0x0BCC86, 0x0BCC8C, 0x0BCCA6
- D1407C co-accessed at 10/19 sites: 0x0097CD, 0x014DAB, 0x014DB0, 0x014DB6, 0x014DD0, 0x04918E, 0x0BCC81, 0x0BCC86, 0x0BCC8C, 0x0BCCA6

### Co-access patterns:

- `0x0097CD` (WRITE LD (D14038),BC): co-accessed with D1407B, D1407C
- `0x014DAB` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x014DB0` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x014DB6` (WRITE LD (D14038),BC): co-accessed with D1407B, D1407C
- `0x014DD0` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x04918E` (WRITE LD (D14038),BC): co-accessed with D1407B, D1407C
- `0x0BCC81` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x0BCC86` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x0BCC8C` (WRITE LD (D14038),BC): co-accessed with D1407B, D1407C
- `0x0BCCA6` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x0097CD` (WRITE LD (D14038),BC): co-accessed with D1407B, D1407C
- `0x014DAB` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x014DB0` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x014DB6` (WRITE LD (D14038),BC): co-accessed with D1407B, D1407C
- `0x014DD0` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x04918E` (WRITE LD (D14038),BC): co-accessed with D1407B, D1407C
- `0x0BCC81` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x0BCC86` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C
- `0x0BCC8C` (WRITE LD (D14038),BC): co-accessed with D1407B, D1407C
- `0x0BCCA6` (READ LD BC,(D14038)): co-accessed with D1407B, D1407C

## Conclusion

- Total references: 19
- Classification: boolean flag
- Value range: 0x01
- D14038 sits in the D14000-D1404F sub-block, separate from the D14070-D1407F pipe state group.
- Suggested semantic name and role hypothesis will be refined based on reference analysis above.
