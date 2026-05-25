# Phase 441 - D14075 USB State Trace

## Summary

- Target: `D14075` (0xD14075)
- Raw literal hits: 6
- Indexed references via IX/IY base+offset: 0
- Unique direct memory references: 6 (4 writes, 2 reads, 0 read+write, 0 address-loads)
- Logical mirror families after bank deduplication: 6
- Written values: 0x00, 0x01
- Classification: **boolean (0/1)**

## Counts

| Kind | Count |
| --- | ---: |
| Writes | 4 |
| Reads | 2 |
| Read+Write | 0 |
| Address-loads | 0 |
| Indexed refs | 0 |
| Mirror families | 6 |

## ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 2 |
| 0x01xxxx | 1 |
| 0x04xxxx | 3 |

## Mirror Families

| Lead Site | Mirrors | Kind | Nearby D140xx (+/-20) | Nearby Port I/O |
| --- | --- | --- | --- | --- |
| 0x0085B5 | - | WRITE 0x00 (XOR A) | 0xD14089 | - |
| 0x009ACF | - | READ | 0xD14044, 0xD14082, 0xD14085 | - |
| 0x013002 | - | WRITE 0x01 (LD A,imm) | 0xD14085, 0xD14086, 0xD14087 | - |
| 0x041B8E | - | WRITE 0x01 (LD A,imm) | 0xD14085, 0xD14086, 0xD14087 | - |
| 0x0494C0 | - | READ | 0xD14044, 0xD14082, 0xD14085 | - |
| 0x04984D | - | WRITE 0x00 (XOR A) | 0xD14089 | - |

## Full Reference Table

| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Nearby Port I/O | Context |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x0085B5 | WRITE | LD (D14075),A | 0x0084E4 (PUSH AF; DI) | 0x00 (XOR A) | 0xD14089 | - | `01 c1 c1 af 32 75 40 d1 01 00 08 00 c5 cd 2d 32 01 c1 c9 af 32 89 40 d1` |
| 0x009ACF | READ | LD A,(D14075) | 0x0094C4 (CALL __frameset) | OR A; JR NZ | 0xD14044, 0xD14082, 0xD14085 | - | `32 85 40 d1 3a 75 40 d1 b7 20 10 01 01 00 00 c5 01 00 00 00 c5 cd 56 24` |
| 0x013002 | WRITE | LD (D14075),A | 0x012F66 (PUSH IY) | 0x01 (LD A,imm) | 0xD14085, 0xD14086, 0xD14087 | - | `40 d1 3e 01 32 75 40 d1 cd 18 91 00 18 10 01 00 00 00 c5 01 01 00 00 c5` |
| 0x041B8E | WRITE | LD (D14075),A | 0x041B65 (after RET fallback) | 0x01 (LD A,imm) | 0xD14085, 0xD14086, 0xD14087 | - | `40 d1 3e 01 32 75 40 d1 cd 9e 8d 03 18 10 01 00 00 00 c5 01 01 00 00 c5` |
| 0x0494C0 | READ | LD A,(D14075) | 0x048D7A (PUSH AF; DI) | OR A; JR NZ | 0xD14044, 0xD14082, 0xD14085 | - | `32 85 40 d1 3a 75 40 d1 b7 20 10 01 01 00 00 c5 01 00 00 00 c5 cd 56 10` |
| 0x04984D | WRITE | LD (D14075),A | 0x04975B (PUSH AF; DI) | 0x00 (XOR A) | 0xD14089 | - | `04 c1 c1 af 32 75 40 d1 01 00 08 00 c5 cd 95 1e 04 c1 c9 af 32 89 40 d1` |

## Write Values Observed

- `0x00 (XOR A)`: 0x0085B5, 0x04984D
- `0x01 (LD A,imm)`: 0x013002, 0x041B8E

## Read Patterns

| Site | Mnemonic | Gate |
| --- | --- | --- |
| 0x009ACF | LD A,(D14075) | OR A; JR NZ |
| 0x0494C0 | LD A,(D14075) | OR A; JR NZ |

## Co-access Frequency (+/-20 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD14085 | 4 |
| 0xD14089 | 2 |
| 0xD14044 | 2 |
| 0xD14082 | 2 |
| 0xD14086 | 2 |
| 0xD14087 | 2 |

## Port I/O Summary

- No nearby 0x30xx/0x31xx port accesses found within +/-32 byte window.

## Conclusion

- Total references: 6
- Classification: boolean (0/1)
- Write sites: 4
- Read sites: 2
- Most frequent co-access: 0xD14085 (4 times)
- Suggested semantic name: (to be determined from probe output)
