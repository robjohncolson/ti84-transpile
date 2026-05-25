# Phase 440 - D1407F USB State Trace

## Summary

- **Target**: D1407F (last unmapped byte in D1407C-D1407F block)
- Raw literal hits: 12
- Indexed references via IX/IY base+offset: 0
- Unique memory references: 12 (6 writes, 6 reads, 0 read+write, 0 address-loads)
- Unique logical site families after mirror grouping: 7
- Written values: 0x00, 0x01
- **Classification**: boolean flag
- **Interpretation**: Only 0x00 and 0x01 are written. This is a boolean flag.

## Relationship to Known D1407x Variables

| Known Variable | Co-access Count |
| --- | ---: |
| D1407C (pipe-pending) | 0 |
| D1407D (co-written with D1407C) | 0 |
| D1407E (pipe-active) | 2 |
| D14080 (transfer-pending) | 2 |

## Counts

| Kind | Count |
| --- | ---: |
| Writes | 6 |
| Reads | 6 |
| Read+Write | 0 |
| Address-loads | 0 |
| Indexed refs | 0 |
| Logical site families | 7 |

## ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 5 |
| 0x02xxxx | 2 |
| 0x04xxxx | 3 |
| other | 2 |

## Full Reference Table

| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Port I/O |
| --- | --- | --- | --- | --- | --- | --- |
| 0x00987B | WRITE | LD (D1407F),A | 0x0096CB (after RET fallback) | 0x00 (XOR A) | 0xD14040, 0xD1407B | - |
| 0x00A859 | WRITE | LD (D1407F),A | 0x00A82D (after RET fallback) | 0x01 (LD A,imm) | 0xD1403E, 0xD14040, 0xD140A6, 0xD140B2 | - |
| 0x00F491 | READ | LD A,(D1407F) | 0x00F2FD (PUSH IX) | OR A; JR NZ | 0xD1408B | - |
| 0x00F8CA | READ | LD A,(D1407F) | 0x00F2FD (PUSH IX) | OR A; JR NZ | 0xD1408B | - |
| 0x00FD1D | WRITE | LD (D1407F),A | 0x00FBD1 (CALL __frameset) | 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1407B, 0xD1407E, 0xD14080, 0xD14081, 0xD1408D | - |
| 0x014485 | READ | LD A,(D1407F) | 0x013FB8 (PUSH IX) | OR A; JR Z | 0xD1403E | - |
| 0x0144E5 | READ | LD A,(D1407F) | 0x013FB8 (PUSH IX) | OR A; JR NZ | - | - |
| 0x02AC81 | WRITE | LD (D1407F),A | 0x02AC49 (after RET fallback) | 0x01 (LD A,imm) | 0xD1403E, 0xD14040, 0xD140A6, 0xD140B2 | - |
| 0x02C287 | WRITE | LD (D1407F),A | 0x02BFEF (PUSH IX) | 0x00 (XOR A) | 0xD14079, 0xD1407A, 0xD1407B, 0xD1407E, 0xD14080, 0xD14081, 0xD1408D | - |
| 0x047DC0 | READ | LD A,(D1407F) | 0x047C8A (PUSH IX) | OR A; JR Z | 0xD1403E | - |
| 0x047E20 | READ | LD A,(D1407F) | 0x047C8A (PUSH IX) | OR A; JR NZ | - | - |
| 0x049246 | WRITE | LD (D1407F),A | 0x04908C (after RET fallback) | 0x00 (XOR A) | 0xD14059, 0xD1407B | - |

## Logical Site Families

| Lead Site | Mirrors | Type | Nearby D140xx | Port I/O |
| --- | --- | --- | --- | --- |
| 0x00987B | - | WRITE | 0xD14040, 0xD1407B | - |
| 0x00A859 | 0x02AC81 | WRITE | 0xD1403E, 0xD14040, 0xD140A6, 0xD140B2 | - |
| 0x00F491 | 0x00F8CA | READ | 0xD1408B | - |
| 0x00FD1D | 0x02C287 | WRITE | 0xD14079, 0xD1407A, 0xD1407B, 0xD1407E, 0xD14080, 0xD14081, 0xD1408D | - |
| 0x014485 | 0x047DC0 | READ | 0xD1403E | - |
| 0x0144E5 | 0x047E20 | READ | - | - |
| 0x049246 | - | WRITE | 0xD14059, 0xD1407B | - |

## Co-access Frequency (+/-20 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD1407B | 4 |
| 0xD1403E | 4 |
| 0xD14040 | 3 |
| 0xD140A6 | 2 |
| 0xD140B2 | 2 |
| 0xD1408B | 2 |
| 0xD14079 | 2 |
| 0xD1407A | 2 |
| 0xD1407E | 2 |
| 0xD14080 | 2 |
| 0xD14081 | 2 |
| 0xD1408D | 2 |
| 0xD14059 | 1 |

## Read Gates

| Site | Type | Gate |
| --- | --- | --- |
| 0x00F491 | READ | OR A; JR NZ |
| 0x00F8CA | READ | OR A; JR NZ |
| 0x014485 | READ | OR A; JR Z |
| 0x0144E5 | READ | OR A; JR NZ |
| 0x047DC0 | READ | OR A; JR Z |
| 0x047E20 | READ | OR A; JR NZ |

## Write Pattern Analysis

- Set sites (write 1): 2 — 0x00A859, 0x02AC81
- Clear sites (write 0): 4 — 0x00987B, 0x00FD1D, 0x02C287, 0x049246
- Unknown-value writes: 0 — none
- Read+Write (INC/DEC): 0 — none

## Lifecycle

- **Set sites**: 0x00A859 in 0x00A82D (after RET fallback); 0x02AC81 in 0x02AC49 (after RET fallback)
- **Clear sites**: 0x00987B in 0x0096CB (after RET fallback); 0x00FD1D in 0x00FBD1 (CALL __frameset); 0x02C287 in 0x02BFEF (PUSH IX); 0x049246 in 0x04908C (after RET fallback)
- **Read/gate sites**: 0x00F491 [OR A; JR NZ]; 0x00F8CA [OR A; JR NZ]; 0x014485 [OR A; JR Z]; 0x0144E5 [OR A; JR NZ]; 0x047DC0 [OR A; JR Z]; 0x047E20 [OR A; JR NZ]

## Conclusion

D1407F has 12 reference sites in the ROM.
Classification: **boolean flag**.
Only values 0x00 and 0x01 are written, confirming boolean semantics.
