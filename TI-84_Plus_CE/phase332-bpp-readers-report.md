# Phase 332 — BPP Flag Reader Map

Generated: 2026-05-15T12:05:32.425Z

## Summary

- **Total readers found**: 36
- **Total writers found**: 2
- **Subsystems**: 4

### Access pattern breakdown

- BIT 2,(IY+70): 29
- LD A,(D000C6): 6
- LD HL,D000C6 (indirect, no prefix): 1

## Readers by Subsystem

### Text rendering (14)

| Address | Pattern | Prologue | Context after |
|---------|---------|----------|---------------|
| 0x052796 | BIT 2,(IY+70) | n/a | `20 01 29 19 ed 4b e3 2f d0 09 dd 2f` |
| 0x0527c4 | BIT 2,(IY+70) | n/a | `20 06 cd f0 53 05 18 01 71 cb 86 23` |
| 0x0527d4 | BIT 2,(IY+70) | n/a | `20 01 23 dd 2f ee dd 27 f1 2b dd 2f` |
| 0x052819 | BIT 2,(IY+70) | n/a | `20 01 29 19 ed 4b e3 2f d0 09 dd 2f` |
| 0x052847 | BIT 2,(IY+70) | n/a | `20 06 cd f0 53 05 18 01 71 cb 86 23` |
| 0x052857 | BIT 2,(IY+70) | n/a | `20 01 23 dd 2f ee dd 27 f1 2b dd 2f` |
| 0x052add | LD A,(D000C6) | 0x052ad4 | `cb 57 28 09 fd 7e 06 fe 08 c2 d3 2c` |
| 0x052bfa | LD A,(D000C6) | n/a | `cb 57 20 01 29 dd 2f eb dd 27 0c dd` |
| 0x052ce8 | LD A,(D000C6) | 0x052ce3 | `cb 57 20 62 fd 7e 06 fe 01 20 35 ed` |
| 0x052d81 | LD A,(D000C6) | n/a | `cb 57 20 51 fd 7e 08 b7 20 2d fd 27` |
| 0x053cf7 | BIT 2,(IY+70) | n/a | `20 01 29 dd 2f cd 2a e0 2f d0 dd 07` |
| 0x053d10 | BIT 2,(IY+70) | n/a | `20 01 29 19 ed 4b e3 2f d0 09 dd 2f` |
| 0x053da4 | BIT 2,(IY+70) | n/a | `20 0f 40 ed 4b ac 26 3a f4 05 d0 cd` |
| 0x053e41 | BIT 2,(IY+70) | n/a | `20 0f 40 ed 4b ac 26 3a f4 05 d0 cd` |

### Pixel writing (12)

| Address | Pattern | Prologue | Context after |
|---------|---------|----------|---------------|
| 0x05440a | LD A,(D000C6) | n/a | `cb 57 20 01 29 dd 07 fd 09 47 cb c6` |
| 0x0544cf | BIT 2,(IY+70) | 0x05449a | `20 02 ed 42 dd 2f fd dd 07 09 2a e0` |
| 0x0544e9 | BIT 2,(IY+70) | n/a | `20 01 09 ed 4b e3 2f d0 09 dd 2f fa` |
| 0x05452b | BIT 2,(IY+70) | n/a | `20 01 03 18 dd dd 27 fd 09 dd 2f fa` |
| 0x054c31 | BIT 2,(IY+70) | n/a | `20 0d 71 23 13 70 2b 13 dd 07 f7 0b` |
| 0x054c5a | BIT 2,(IY+70) | n/a | `20 02 ed 42 dd 2f fd dd 07 09 2a e0` |
| 0x054c74 | BIT 2,(IY+70) | n/a | `20 01 09 ed 4b e3 2f d0 09 dd 2f fa` |
| 0x054cb0 | BIT 2,(IY+70) | n/a | `20 08 cd f0 53 05 23 23 18 02 71 23` |
| 0x054e87 | BIT 2,(IY+70) | n/a | `20 01 09 ed 4b e3 2f d0 09 dd 2f f3` |
| 0x054f02 | BIT 2,(IY+70) | n/a | `20 0f 40 ed 4b aa 26 3a f4 05 d0 cd` |
| 0x054f4e | BIT 2,(IY+70) | n/a | `20 0a 3a f4 05 d0 cd f0 53 05 18 01` |
| 0x054f7e | BIT 2,(IY+70) | n/a | `20 01 23 dd 2f f0 c3 d0 4e 05 dd 7e` |

### LCD / VRAM / mode-switch (9)

| Address | Pattern | Prologue | Context after |
|---------|---------|----------|---------------|
| 0x05502c | BIT 2,(IY+70) | 0x05502a | `20 01 09 ed 4b e3 2f d0 09 dd 2f f2` |
| 0x0550a7 | BIT 2,(IY+70) | 0x05507e | `20 0f 40 ed 4b aa 26 3a f4 05 d0 cd` |
| 0x0550f3 | BIT 2,(IY+70) | n/a | `20 0a 3a f4 05 d0 cd f0 53 05 18 01` |
| 0x055126 | BIT 2,(IY+70) | n/a | `20 01 23 dd 2f ef c3 75 50 05 dd 7e` |
| 0x055220 | BIT 2,(IY+70) | n/a | `28 0a 3e 2d cd 80 52 05 fd cb 46 96` |
| 0x05529b | LD A,(D000C6) | n/a | `cb 57 28 0e 21 00 2c d5 11 00 00 d4` |
| 0x0553a5 | BIT 2,(IY+70) | n/a | `20 10 09 40 ed 4b ac 26 3a f4 05 d0` |
| 0x0556f7 | BIT 2,(IY+70) | n/a | `20 0c 36 ff 23 13 0b 36 ff 2b 13 0b` |
| 0x05575a | BIT 2,(IY+70) | 0x055743 | `20 06 21 0c 55 05 18 04 21 19 55 05` |

### Graph / helper (1)

| Address | Pattern | Prologue | Context after |
|---------|---------|----------|---------------|
| 0x08c309 | LD HL,D000C6 (indirect, no prefix) | n/a | `cb 56 e1 c9 47 e6 f0 0f 0f 0f 0f cd 28 c3 08 77` |

## Writers

| Address | Pattern |
|---------|---------|
| 0x05527b | SET 2,(IY+70) |
| 0x05522c | RES 2,(IY+70) |

## JSON Export

```json
{
  "readers": [
    {
      "address": "0x052796",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x0527c4",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x0527d4",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x052819",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x052847",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x052857",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x052add",
      "pattern": "LD A,(D000C6)",
      "subsystem": "Text rendering",
      "prologueAddr": "0x052ad4"
    },
    {
      "address": "0x052bfa",
      "pattern": "LD A,(D000C6)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x052ce8",
      "pattern": "LD A,(D000C6)",
      "subsystem": "Text rendering",
      "prologueAddr": "0x052ce3"
    },
    {
      "address": "0x052d81",
      "pattern": "LD A,(D000C6)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x053cf7",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x053d10",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x053da4",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x053e41",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Text rendering",
      "prologueAddr": null
    },
    {
      "address": "0x05440a",
      "pattern": "LD A,(D000C6)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x0544cf",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": "0x05449a"
    },
    {
      "address": "0x0544e9",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x05452b",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x054c31",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x054c5a",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x054c74",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x054cb0",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x054e87",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x054f02",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x054f4e",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x054f7e",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "Pixel writing",
      "prologueAddr": null
    },
    {
      "address": "0x05502c",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "LCD / VRAM / mode-switch",
      "prologueAddr": "0x05502a"
    },
    {
      "address": "0x0550a7",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "LCD / VRAM / mode-switch",
      "prologueAddr": "0x05507e"
    },
    {
      "address": "0x0550f3",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "LCD / VRAM / mode-switch",
      "prologueAddr": null
    },
    {
      "address": "0x055126",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "LCD / VRAM / mode-switch",
      "prologueAddr": null
    },
    {
      "address": "0x055220",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "LCD / VRAM / mode-switch",
      "prologueAddr": null
    },
    {
      "address": "0x05529b",
      "pattern": "LD A,(D000C6)",
      "subsystem": "LCD / VRAM / mode-switch",
      "prologueAddr": null
    },
    {
      "address": "0x0553a5",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "LCD / VRAM / mode-switch",
      "prologueAddr": null
    },
    {
      "address": "0x0556f7",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "LCD / VRAM / mode-switch",
      "prologueAddr": null
    },
    {
      "address": "0x05575a",
      "pattern": "BIT 2,(IY+70)",
      "subsystem": "LCD / VRAM / mode-switch",
      "prologueAddr": "0x055743"
    },
    {
      "address": "0x08c309",
      "pattern": "LD HL,D000C6 (indirect, no prefix)",
      "subsystem": "Graph / helper",
      "prologueAddr": null
    }
  ],
  "writers": [
    {
      "address": "0x05527b",
      "pattern": "SET 2,(IY+70)"
    },
    {
      "address": "0x05522c",
      "pattern": "RES 2,(IY+70)"
    }
  ]
}
```