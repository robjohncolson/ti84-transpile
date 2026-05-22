# Phase 407: Notification Readers Report

## Scan Results

- **LD A,(0xD177B8)** payload readers: 200
- **LD A,(0xD177B9)** type readers: 12
- **Total readers**: 212
- **Pages with readers**: 26

## Top 10 Clusters

| Page | Address Range | Payload | Type | Total | Pattern | CP Values |
|------|---------------|---------|------|-------|---------|----------|
| 0x049000 | 0x49627..0x49ED1 | 35 | 5 | 40 | payload discriminator | 0xC3, 0xFF, 0x55 |
| 0x008000 | 0x845F..0x8FCF | 22 | 5 | 27 | payload discriminator | 0xC3 |
| 0x02B000 | 0x2B82E..0x2BF98 | 19 | 0 | 19 | payload discriminator | 0x02, 0x40, 0x01 |
| 0x012000 | 0x1204A..0x12D78 | 15 | 0 | 15 | payload discriminator | 0x0B, 0x0D, 0x99, 0x9A, 0x96, 0x97, 0xFF, 0x30, 0x10 |
| 0x00F000 | 0xF1E1..0xFDEB | 13 | 0 | 13 | payload discriminator | 0x40, 0x55, 0xC0, 0x01, 0x31, 0x4C |
| 0x009000 | 0x9058..0x93DF | 10 | 1 | 11 | zero-test gate | - |
| 0x00E000 | 0xEE42..0xEFDF | 11 | 0 | 11 | payload discriminator | 0x02, 0xC3, 0xC0, 0x30, 0x80 |
| 0x02C000 | 0x2C0DD..0x2C36F | 9 | 0 | 9 | payload discriminator | 0x40, 0x80, 0xFF, 0x01, 0x31, 0x4C |
| 0x037000 | 0x3705F..0x376CC | 7 | 0 | 7 | payload discriminator | 0x8F, 0x8E |
| 0x038000 | 0x3880F..0x38E6A | 7 | 0 | 7 | payload discriminator | 0xFF |

## All Pages

| Page | Payload | Type | Total |
|------|---------|------|-------|
| 0x049000 | 35 | 5 | 40 |
| 0x008000 | 22 | 5 | 27 |
| 0x02B000 | 19 | 0 | 19 |
| 0x012000 | 15 | 0 | 15 |
| 0x00F000 | 13 | 0 | 13 |
| 0x009000 | 10 | 1 | 11 |
| 0x00E000 | 11 | 0 | 11 |
| 0x02C000 | 9 | 0 | 9 |
| 0x037000 | 7 | 0 | 7 |
| 0x038000 | 7 | 0 | 7 |
| 0x041000 | 7 | 0 | 7 |
| 0x042000 | 6 | 1 | 7 |
| 0x071000 | 7 | 0 | 7 |
| 0x063000 | 6 | 0 | 6 |
| 0x013000 | 5 | 0 | 5 |
| 0x036000 | 5 | 0 | 5 |
| 0x04D000 | 5 | 0 | 5 |
| 0x00A000 | 2 | 0 | 2 |
| 0x015000 | 2 | 0 | 2 |
| 0x014000 | 1 | 0 | 1 |
| 0x031000 | 1 | 0 | 1 |
| 0x047000 | 1 | 0 | 1 |
| 0x048000 | 1 | 0 | 1 |
| 0x064000 | 1 | 0 | 1 |
| 0x070000 | 1 | 0 | 1 |
| 0x0BC000 | 1 | 0 | 1 |

## Key Findings

- Notification readers are spread across 26 4KB pages
- Top cluster is at 0x049000 with 40 readers
- Unique CP comparison values found: 0x01, 0x02, 0x0B, 0x0D, 0x10, 0x30, 0x31, 0x40, 0x4C, 0x55, 0x80, 0x8E, 0x8F, 0x96, 0x97, 0x99, 0x9A, 0xC0, 0xC3, 0xFF

### Cluster Categories (Top 10)

- **payload discriminator**: 9 cluster(s)
- **zero-test gate**: 1 cluster(s)

## Method

Scanned entire 4MB ROM for byte patterns:
- LD A,(0xD177B8): 3A B8 77 D1
- LD A,(0xD177B9): 3A B9 77 D1

For each reader, disassembled the next 30 bytes looking for CP, JR, JP, CALL, OR A, and RET instructions.
