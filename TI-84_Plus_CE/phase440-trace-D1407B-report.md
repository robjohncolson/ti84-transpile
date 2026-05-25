# Phase 440 - D1407B USB State Trace

## Summary

- Raw literal hits: 19
- Indexed references via IX/IY base+offset: 0
- Unique memory references: 19 (13 writes, 6 reads, 0 read+write, 0 address-loads)
- Unique logical site families after mirror grouping: 12
- Written values: 0x00, 0x01 -> boolean

- **Classification**: Boolean flag (0/1 only)

## Counts

| Kind | Count |
| --- | ---: |
| Writes | 13 |
| Reads | 6 |
| Read+Write | 0 |
| Address-loads | 0 |
| Indexed refs | 0 |
| Logical site families | 12 |

## ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 6 |
| 0x02xxxx | 2 |
| 0x04xxxx | 6 |
| 0x0Bxxxx | 2 |
| other | 3 |

## Full Reference Table

| # | Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx (+/-20) | Nearby Port I/O |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0x0097C5 | WRITE | LD (D1407B),A | 0x0096CB (after RET fallback) | 0x01 (LD A,imm) | 0xD14038, 0xD1407C | IN A,(0x313D), OUT (0x313D),A |
| 2 | 0x00987F | READ | LD A,(D1407B) | 0x0096CB (after RET fallback) | OR A; JR Z | 0xD1407C, 0xD1407F | - |
| 3 | 0x009887 | WRITE | LD (D1407B),A | 0x0096CB (after RET fallback) | 0x00 (XOR A) | 0xD1407C, 0xD1407E, 0xD1407F | - |
| 4 | 0x00988B | READ | LD A,(D1407B) | 0x0096CB (after RET fallback) | OR A; JR NZ | 0xD1407C, 0xD1407E, 0xD1407F | - |
| 5 | 0x00EE78 | WRITE | LD (D1407B),A | 0x00EE1B (after RET fallback) | unknown | 0xD14084 | IN A,(0x3114), OUT (0x3114),A |
| 6 | 0x00FD13 | WRITE | LD (D1407B),A | 0x00FBD1 (CALL __frameset) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080 | - |
| 7 | 0x012FDD | WRITE | LD (D1407B),A | 0x012FD7 (after RET fallback) | 0x00 (XOR A) | 0xD14073, 0xD14082 | - |
| 8 | 0x014DBB | READ | LD A,(D1407B) | 0x0149A3 (PUSH IX) | OR A; JR NZ | 0xD14038, 0xD1407C, 0xD1408D | - |
| 9 | 0x014E16 | WRITE | LD (D1407B),A | 0x0149A3 (PUSH IX) | 0x00 (XOR A) | 0xD14081 | - |
| 10 | 0x02B8D2 | WRITE | LD (D1407B),A | 0x02B806 (after RET fallback) | unknown | 0xD14084 | IN A,(0x3114), OUT (0x3114),A |
| 11 | 0x02C27D | WRITE | LD (D1407B),A | 0x02BFEF (PUSH IX) | 0x00 (XOR A) | 0xD14078, 0xD14079, 0xD1407A, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080 | - |
| 12 | 0x041B6B | WRITE | LD (D1407B),A | 0x041B65 (after RET fallback) | 0x00 (XOR A) | 0xD14073, 0xD14082, 0xD14086 | - |
| 13 | 0x041D8F | WRITE | LD (D1407B),A | 0x041BA9 (after RET fallback) | 0x00 (XOR A) | 0xD1407C, 0xD1407E, 0xD14081 | IN A,(0x3100), OUT (0x3100),A |
| 14 | 0x049186 | WRITE | LD (D1407B),A | 0x04908C (after RET fallback) | 0x01 (LD A,imm) | 0xD14038, 0xD1407C | IN A,(0x313D), OUT (0x313D),A |
| 15 | 0x04924A | READ | LD A,(D1407B) | 0x04908C (after RET fallback) | OR A; JR Z | 0xD14059, 0xD1407C, 0xD1407F | - |
| 16 | 0x049252 | WRITE | LD (D1407B),A | 0x04908C (after RET fallback) | 0x00 (XOR A) | 0xD1407C, 0xD1407E, 0xD1407F | - |
| 17 | 0x049256 | READ | LD A,(D1407B) | 0x04908C (after RET fallback) | OR A; JR NZ | 0xD1407C, 0xD1407E, 0xD1407F | - |
| 18 | 0x0BCC91 | READ | LD A,(D1407B) | 0x0BCC81 (after RET fallback) | OR A; JR NZ | 0xD14038, 0xD1407C, 0xD1408D | - |
| 19 | 0x0BCCFA | WRITE | LD (D1407B),A | 0x0BCC81 (after RET fallback) | 0x00 (XOR A) | 0xD14081 | - |

## Logical Site Families

| Lead Site | Mirrors | Type | Nearby D140xx | Nearby Port I/O |
| --- | --- | --- | --- | --- |
| 0x0097C5 | 0x049186 | WRITE | 0xD14038, 0xD1407C | IN A,(0x313D), OUT (0x313D),A |
| 0x00987F | - | READ | 0xD1407C, 0xD1407F | - |
| 0x009887 | 0x049252 | WRITE | 0xD1407C, 0xD1407E, 0xD1407F | - |
| 0x00988B | 0x049256 | READ | 0xD1407C, 0xD1407E, 0xD1407F | - |
| 0x00EE78 | 0x02B8D2 | WRITE | 0xD14084 | IN A,(0x3114), OUT (0x3114),A |
| 0x00FD13 | 0x02C27D | WRITE | 0xD14078, 0xD14079, 0xD1407A, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080 | - |
| 0x012FDD | - | WRITE | 0xD14073, 0xD14082 | - |
| 0x014DBB | 0x0BCC91 | READ | 0xD14038, 0xD1407C, 0xD1408D | - |
| 0x014E16 | 0x0BCCFA | WRITE | 0xD14081 | - |
| 0x041B6B | - | WRITE | 0xD14073, 0xD14082, 0xD14086 | - |
| 0x041D8F | - | WRITE | 0xD1407C, 0xD1407E, 0xD14081 | IN A,(0x3100), OUT (0x3100),A |
| 0x04924A | - | READ | 0xD14059, 0xD1407C, 0xD1407F | - |

## Co-access Frequency (+/-20 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD1407C | 13 |
| 0xD1407F | 8 |
| 0xD1407E | 7 |
| 0xD14038 | 4 |
| 0xD14081 | 3 |
| 0xD14084 | 2 |
| 0xD14078 | 2 |
| 0xD14079 | 2 |
| 0xD1407A | 2 |
| 0xD14080 | 2 |
| 0xD14073 | 2 |
| 0xD14082 | 2 |
| 0xD1408D | 2 |
| 0xD14086 | 1 |
| 0xD14059 | 1 |

## Write Sites

| Site | Mnemonic | Value | Function | Co-accessed D140xx |
| --- | --- | --- | --- | --- |
| 0x0097C5 | LD (D1407B),A | 0x01 (LD A,imm) | 0x0096CB (after RET fallback) | 0xD14038, 0xD1407C |
| 0x009887 | LD (D1407B),A | 0x00 (XOR A) | 0x0096CB (after RET fallback) | 0xD1407C, 0xD1407E, 0xD1407F |
| 0x00EE78 | LD (D1407B),A | unknown | 0x00EE1B (after RET fallback) | 0xD14084 |
| 0x00FD13 | LD (D1407B),A | 0x00 (XOR A) | 0x00FBD1 (CALL __frameset) | 0xD14078, 0xD14079, 0xD1407A, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080 |
| 0x012FDD | LD (D1407B),A | 0x00 (XOR A) | 0x012FD7 (after RET fallback) | 0xD14073, 0xD14082 |
| 0x014E16 | LD (D1407B),A | 0x00 (XOR A) | 0x0149A3 (PUSH IX) | 0xD14081 |
| 0x02B8D2 | LD (D1407B),A | unknown | 0x02B806 (after RET fallback) | 0xD14084 |
| 0x02C27D | LD (D1407B),A | 0x00 (XOR A) | 0x02BFEF (PUSH IX) | 0xD14078, 0xD14079, 0xD1407A, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080 |
| 0x041B6B | LD (D1407B),A | 0x00 (XOR A) | 0x041B65 (after RET fallback) | 0xD14073, 0xD14082, 0xD14086 |
| 0x041D8F | LD (D1407B),A | 0x00 (XOR A) | 0x041BA9 (after RET fallback) | 0xD1407C, 0xD1407E, 0xD14081 |
| 0x049186 | LD (D1407B),A | 0x01 (LD A,imm) | 0x04908C (after RET fallback) | 0xD14038, 0xD1407C |
| 0x049252 | LD (D1407B),A | 0x00 (XOR A) | 0x04908C (after RET fallback) | 0xD1407C, 0xD1407E, 0xD1407F |
| 0x0BCCFA | LD (D1407B),A | 0x00 (XOR A) | 0x0BCC81 (after RET fallback) | 0xD14081 |

## Read Gates

| Site | Mnemonic | Gate | Function |
| --- | --- | --- | --- |
| 0x00987F | LD A,(D1407B) | OR A; JR Z | 0x0096CB (after RET fallback) |
| 0x00988B | LD A,(D1407B) | OR A; JR NZ | 0x0096CB (after RET fallback) |
| 0x014DBB | LD A,(D1407B) | OR A; JR NZ | 0x0149A3 (PUSH IX) |
| 0x04924A | LD A,(D1407B) | OR A; JR Z | 0x04908C (after RET fallback) |
| 0x049256 | LD A,(D1407B) | OR A; JR NZ | 0x04908C (after RET fallback) |
| 0x0BCC91 | LD A,(D1407B) | OR A; JR NZ | 0x0BCC81 (after RET fallback) |

## Lifecycle Analysis

### Set sites (value=1): 2

- 0x0097C5: LD (D1407B),A in 0x0096CB (after RET fallback), co-accessed: 0xD14038, 0xD1407C, ports: IN A,(0x313D), OUT (0x313D),A
- 0x049186: LD (D1407B),A in 0x04908C (after RET fallback), co-accessed: 0xD14038, 0xD1407C, ports: IN A,(0x313D), OUT (0x313D),A

### Clear sites (value=0): 9

- 0x009887: LD (D1407B),A in 0x0096CB (after RET fallback), co-accessed: 0xD1407C, 0xD1407E, 0xD1407F, ports: -
- 0x00FD13: LD (D1407B),A in 0x00FBD1 (CALL __frameset), co-accessed: 0xD14078, 0xD14079, 0xD1407A, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080, ports: -
- 0x012FDD: LD (D1407B),A in 0x012FD7 (after RET fallback), co-accessed: 0xD14073, 0xD14082, ports: -
- 0x014E16: LD (D1407B),A in 0x0149A3 (PUSH IX), co-accessed: 0xD14081, ports: -
- 0x02C27D: LD (D1407B),A in 0x02BFEF (PUSH IX), co-accessed: 0xD14078, 0xD14079, 0xD1407A, 0xD1407C, 0xD1407E, 0xD1407F, 0xD14080, ports: -
- 0x041B6B: LD (D1407B),A in 0x041B65 (after RET fallback), co-accessed: 0xD14073, 0xD14082, 0xD14086, ports: -
- 0x041D8F: LD (D1407B),A in 0x041BA9 (after RET fallback), co-accessed: 0xD1407C, 0xD1407E, 0xD14081, ports: IN A,(0x3100), OUT (0x3100),A
- 0x049252: LD (D1407B),A in 0x04908C (after RET fallback), co-accessed: 0xD1407C, 0xD1407E, 0xD1407F, ports: -
- 0x0BCCFA: LD (D1407B),A in 0x0BCC81 (after RET fallback), co-accessed: 0xD14081, ports: -

### Unknown-value writes: 2

- 0x00EE78: LD (D1407B),A in 0x00EE1B (after RET fallback), co-accessed: 0xD14084
- 0x02B8D2: LD (D1407B),A in 0x02B806 (after RET fallback), co-accessed: 0xD14084

## Key Relationships

- D1407C co-access: 13/19 sites
- D1407E co-access: 7/19 sites

## Conclusion

- D1407B is a **boolean** flag: only values 0x00 and 0x01 are written.
- 19 total references (13 W, 6 R, 0 RW, 0 addr-load).
- Most co-accessed D140xx neighbors: 0xD1407C (13x), 0xD1407F (8x), 0xD1407E (7x), 0xD14038 (4x), 0xD14081 (3x).
- Heavily co-accessed with D1407C (13 sites) and D1407E (7 sites), consistent with the pipe state group.
- Based on the known context: at 0x0097BC, D1407B=1 is set when D1407C is clear (SOF acknowledgement); at 0x009892, D1407B being set triggers teardown of D1407E/D17796/D140B2.
- Suggested name: **usb_sof_received** or **usb_frame_sync** — a Start-of-Frame acknowledgement flag that gates pipe teardown.
