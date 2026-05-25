# Phase 440 - D1407D USB State Trace

## Summary

- Raw literal hits: 6
- Indexed references via IX/IY base+offset: 0
- Unique memory references: 6 (4 writes, 2 reads, 0 address-loads, 0 read+write, 0 unknown)
- Unique logical site families after mirror grouping: 4
- Written values: 0x00, 0x01 -> boolean

## Counts

| Kind | Count |
| --- | ---: |
| Writes | 4 |
| Reads | 2 |
| Address-loads | 0 |
| Read+Write | 0 |
| Unknown | 0 |
| Indexed refs | 0 |
| Logical site families | 4 |

## ROM Bank Distribution

| Bank | Count |
| --- | ---: |
| 0x00xxxx | 3 |
| 0x02xxxx | 2 |
| 0x04xxxx | 1 |

## Full Reference Table

| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx (+/-20) | Nearby Port I/O | Context |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x00980B | WRITE | LD (D1407D),A | 0x0096CB (after RET fallback) | 0x01 (LD A,imm) | 0xD1407C, 0xD1408C | IN A,(0x3120), OUT (0x3120),A | 32 7c 40 d1 32 7d 40 d1 01 20 31 00 ed 78 cb 97 ed 79 78 fe |
| 0x00EFA5 | READ | LD A,(D1407D) | 0x00EFA0 (after RET fallback) | OR A; JR Z | 0xD14059 | - | dd 36 fe 01 3a 7d 40 d1 b7 28 09 af 32 7d 40 d1 cd 97 4f 01 |
| 0x00EFAD | WRITE | LD (D1407D),A | 0x00EFA0 (after RET fallback) | 0x00 (XOR A) | - | - | b7 28 09 af 32 7d 40 d1 cd 97 4f 01 01 05 50 00 ed 78 cb ef |
| 0x02BAA0 | READ | LD A,(D1407D) | 0x02B806 (after RET fallback) | OR A; JR Z | - | - | 00 b7 28 29 3a 7d 40 d1 b7 28 0d af 32 7d 40 d1 cd f0 04 00 |
| 0x02BAA8 | WRITE | LD (D1407D),A | 0x02B806 (after RET fallback) | 0x00 (XOR A) | - | - | b7 28 0d af 32 7d 40 d1 cd f0 04 00 cd 7b ca 04 01 05 50 00 |
| 0x0491CC | WRITE | LD (D1407D),A | 0x04908C (after RET fallback) | 0x01 (LD A,imm) | 0xD1407C, 0xD1408C | IN A,(0x3120), OUT (0x3120),A | 32 7c 40 d1 32 7d 40 d1 01 20 31 00 ed 78 cb 97 ed 79 78 fe |

## Logical Site Families

| Lead Site | Mirrors | Type | Value / Gate | Nearby D140xx | Nearby Port I/O |
| --- | --- | --- | --- | --- | --- |
| 0x00980B | 0x0491CC | WRITE | 0x01 (LD A,imm) | 0xD1407C, 0xD1408C | IN A,(0x3120), OUT (0x3120),A |
| 0x00EFA5 | - | READ | OR A; JR Z | 0xD14059 | - |
| 0x00EFAD | 0x02BAA8 | WRITE | 0x00 (XOR A) | - | - |
| 0x02BAA0 | - | READ | OR A; JR Z | - | - |

## Co-access Frequency (+/-20 bytes)

| D140xx byte | Count |
| --- | ---: |
| 0xD1407C | 2 |
| 0xD1408C | 2 |
| 0xD14059 | 1 |

## Write Sites Detail

| Site | Function | Value | D1407C co-write? | Nearby D140xx | Nearby Port I/O |
| --- | --- | --- | --- | --- | --- |
| 0x00980B | 0x0096CB (after RET fallback) | 0x01 (LD A,imm) | YES | 0xD1407C, 0xD1408C | IN A,(0x3120), OUT (0x3120),A |
| 0x00EFAD | 0x00EFA0 (after RET fallback) | 0x00 (XOR A) | no | - | - |
| 0x02BAA8 | 0x02B806 (after RET fallback) | 0x00 (XOR A) | no | - | - |
| 0x0491CC | 0x04908C (after RET fallback) | 0x01 (LD A,imm) | YES | 0xD1407C, 0xD1408C | IN A,(0x3120), OUT (0x3120),A |

## Read Gates

| Site | Function | Gate | Nearby D140xx |
| --- | --- | --- | --- |
| 0x00EFA5 | 0x00EFA0 (after RET fallback) | OR A; JR Z | 0xD14059 |
| 0x02BAA0 | 0x02B806 (after RET fallback) | OR A; JR Z | - |

## Analysis

- D1407C co-write sites: 2 of 4 write sites also touch D1407C within +/-20 bytes
- Classification: **boolean** (only 0x00 and 0x01 values observed)

## Lifecycle

- Set sites (value=1): 0x00980B, 0x0491CC
- Clear sites (value=0): 0x00EFAD, 0x02BAA8
- Read sites: 0x00EFA5, 0x02BAA0

## Conclusion

D1407D is co-written with D1407C at pipe-initiation sites (confirmed at 0x009807 bus-reset handler). 
It is a boolean flag (only 0/1 written). 
Total references: 6. The co-access pattern with D1407C (pipe-pending) and proximity to port 0x3120 suggests D1407D is part of the USB pipe state machine, likely a companion flag in the PENDING->ACTIVE lifecycle.
