# Phase 437 — Port 0x3080 (OTG_CSR) Bitfield Map

Total I/O sites: 106 (53 reads, 53 writes)
LD BC,0x3080 sites: 53
Distinct functions: 39

## Bitfield Map

| Bit | Role | Writers | Actions |
|-----|------|---------|---------|
| 7 | see details | 0x012456, 0x01270D, 0x041056, 0x0412E4 | RES, SET |
| 6 | see details | 0x0127E9, 0x012DC5, 0x0413B9, 0x041969 | SET, RES |
| 5 | see details | 0x012372, 0x01247E, 0x040F72, 0x04107E, 0x041EB6 | RES, SET |
| 4 | see details | 0x012372, 0x01247E, 0x040F72, 0x04107E, 0x041EB6 | SET, RES |
| 3 | (read-only or unused) | — | — |
| 2 | see details | 0x008D46, 0x008D6F, 0x0090C2, 0x0090EB, 0x0093D3, 0x0099AB, 0x00EFA0, 0x00F062, 0x00F0A4, 0x012D13, 0x02BB4B, 0x02BBCB, 0x02BC0D, 0x036D5B, 0x036D84, 0x038D47, 0x038D70, 0x041670, 0x0418B7, 0x042914, 0x0493A2 | SET, RES |
| 1 | see details | 0x00B9BD, 0x012BE3, 0x012D13, 0x041852, 0x0418B7 | SET, RES |
| 0 | see details | 0x00B9BD, 0x0129CD, 0x012BE3, 0x012DC5, 0x0415C7, 0x041852, 0x041969 | SET, RES |

## All I/O Sites

| # | I/O addr | Type | Function | RMW | Bits affected |
|---|----------|------|----------|-----|---------------|
| 1 | 0x008D5A | IN | 0x008D46 |  | (read) |
| 2 | 0x008D5E | OUT | 0x008D46 | yes | SET 2 |
| 3 | 0x008D7D | IN | 0x008D6F |  | (read) |
| 4 | 0x008D81 | OUT | 0x008D6F | yes | RES 2 |
| 5 | 0x0090D6 | IN | 0x0090C2 |  | (read) |
| 6 | 0x0090DA | OUT | 0x0090C2 | yes | SET 2 |
| 7 | 0x0090F9 | IN | 0x0090EB |  | (read) |
| 8 | 0x0090FD | OUT | 0x0090EB | yes | RES 2 |
| 9 | 0x0093FD | IN | 0x0093D3 |  | (read) |
| 10 | 0x009401 | OUT | 0x0093D3 | yes | RES 2 |
| 11 | 0x0099E5 | IN | 0x0099AB |  | (read) |
| 12 | 0x0099E9 | OUT | 0x0099AB | yes | RES 2 |
| 13 | 0x00B9C1 | IN | 0x00B9BD |  | (read) |
| 14 | 0x00B9C5 | OUT | 0x00B9BD | yes | SET 0 |
| 15 | 0x00B9D6 | IN | 0x00B9BD |  | (read) |
| 16 | 0x00B9DA | OUT | 0x00B9BD | yes | SET 1 |
| 17 | 0x00EFED | IN | 0x00EFA0 |  | (read) |
| 18 | 0x00EFF1 | OUT | 0x00EFA0 | yes | SET 2 |
| 19 | 0x00F07B | IN | 0x00F062 |  | (read) |
| 20 | 0x00F07F | OUT | 0x00F062 | yes | RES 2 |
| 21 | 0x00F0CD | IN | 0x00F0A4 |  | (read) |
| 22 | 0x00F0D1 | OUT | 0x00F0A4 | yes | RES 2 |
| 23 | 0x012380 | IN | 0x012372 |  | (read) |
| 24 | 0x012384 | OUT | 0x012372 | yes | RES 5 |
| 25 | 0x012395 | IN | 0x012372 |  | (read) |
| 26 | 0x012399 | OUT | 0x012372 | yes | SET 4 |
| 27 | 0x01245E | IN | 0x012456 |  | (read) |
| 28 | 0x012462 | OUT | 0x012456 | yes | RES 7 |
| 29 | 0x012488 | IN | 0x01247E |  | (read) |
| 30 | 0x01248C | OUT | 0x01247E | yes | SET 5 |
| 31 | 0x01249D | IN | 0x01247E |  | (read) |
| 32 | 0x0124A1 | OUT | 0x01247E | yes | RES 4 |
| 33 | 0x01273E | IN | 0x01270D |  | (read) |
| 34 | 0x012742 | OUT | 0x01270D | yes | SET 7 |
| 35 | 0x012842 | IN | 0x0127E9 |  | (read) |
| 36 | 0x012846 | OUT | 0x0127E9 | yes | SET 6 |
| 37 | 0x01285E | IN | 0x0127E9 |  | (read) |
| 38 | 0x012862 | OUT | 0x0127E9 | yes | RES 6 |
| 39 | 0x012A1D | IN | 0x0129CD |  | (read) |
| 40 | 0x012A21 | OUT | 0x0129CD | yes | SET 0 |
| 41 | 0x012C10 | IN | 0x012BE3 |  | (read) |
| 42 | 0x012C14 | OUT | 0x012BE3 | yes | RES 1 |
| 43 | 0x012C25 | IN | 0x012BE3 |  | (read) |
| 44 | 0x012C29 | OUT | 0x012BE3 | yes | RES 0 |
| 45 | 0x012D44 | IN | 0x012D13 |  | (read) |
| 46 | 0x012D48 | OUT | 0x012D13 | yes | RES 1 |
| 47 | 0x012D59 | IN | 0x012D13 |  | (read) |
| 48 | 0x012D5D | OUT | 0x012D13 | yes | RES 2 |
| 49 | 0x012DDB | IN | 0x012DC5 |  | (read) |
| 50 | 0x012DDF | OUT | 0x012DC5 | yes | RES 6 |
| 51 | 0x012DF2 | IN | 0x012DC5 |  | (read) |
| 52 | 0x012DF6 | OUT | 0x012DC5 | yes | RES 0 |
| 53 | 0x02BB52 | IN | 0x02BB4B |  | (read) |
| 54 | 0x02BB56 | OUT | 0x02BB4B | yes | SET 2 |
| 55 | 0x02BBE4 | IN | 0x02BBCB |  | (read) |
| 56 | 0x02BBE8 | OUT | 0x02BBCB | yes | RES 2 |
| 57 | 0x02BC36 | IN | 0x02BC0D |  | (read) |
| 58 | 0x02BC3A | OUT | 0x02BC0D | yes | RES 2 |
| 59 | 0x036D6F | IN | 0x036D5B |  | (read) |
| 60 | 0x036D73 | OUT | 0x036D5B | yes | SET 2 |
| 61 | 0x036D92 | IN | 0x036D84 |  | (read) |
| 62 | 0x036D96 | OUT | 0x036D84 | yes | RES 2 |
| 63 | 0x038D5B | IN | 0x038D47 |  | (read) |
| 64 | 0x038D5F | OUT | 0x038D47 | yes | SET 2 |
| 65 | 0x038D7E | IN | 0x038D70 |  | (read) |
| 66 | 0x038D82 | OUT | 0x038D70 | yes | RES 2 |
| 67 | 0x040F80 | IN | 0x040F72 |  | (read) |
| 68 | 0x040F84 | OUT | 0x040F72 | yes | RES 5 |
| 69 | 0x040F95 | IN | 0x040F72 |  | (read) |
| 70 | 0x040F99 | OUT | 0x040F72 | yes | SET 4 |
| 71 | 0x04105E | IN | 0x041056 |  | (read) |
| 72 | 0x041062 | OUT | 0x041056 | yes | RES 7 |
| 73 | 0x041088 | IN | 0x04107E |  | (read) |
| 74 | 0x04108C | OUT | 0x04107E | yes | SET 5 |
| 75 | 0x04109D | IN | 0x04107E |  | (read) |
| 76 | 0x0410A1 | OUT | 0x04107E | yes | RES 4 |
| 77 | 0x041315 | IN | 0x0412E4 |  | (read) |
| 78 | 0x041319 | OUT | 0x0412E4 | yes | SET 7 |
| 79 | 0x041412 | IN | 0x0413B9 |  | (read) |
| 80 | 0x041416 | OUT | 0x0413B9 | yes | SET 6 |
| 81 | 0x04142E | IN | 0x0413B9 |  | (read) |
| 82 | 0x041432 | OUT | 0x0413B9 | yes | RES 6 |
| 83 | 0x041617 | IN | 0x0415C7 |  | (read) |
| 84 | 0x04161B | OUT | 0x0415C7 | yes | SET 0 |
| 85 | 0x041722 | IN | 0x041670 |  | (read) |
| 86 | 0x041726 | OUT | 0x041670 | yes | RES 2 |
| 87 | 0x04187F | IN | 0x041852 |  | (read) |
| 88 | 0x041883 | OUT | 0x041852 | yes | RES 1 |
| 89 | 0x041894 | IN | 0x041852 |  | (read) |
| 90 | 0x041898 | OUT | 0x041852 | yes | RES 0 |
| 91 | 0x0418E8 | IN | 0x0418B7 |  | (read) |
| 92 | 0x0418EC | OUT | 0x0418B7 | yes | RES 1 |
| 93 | 0x0418FD | IN | 0x0418B7 |  | (read) |
| 94 | 0x041901 | OUT | 0x0418B7 | yes | RES 2 |
| 95 | 0x04197F | IN | 0x041969 |  | (read) |
| 96 | 0x041983 | OUT | 0x041969 | yes | RES 6 |
| 97 | 0x041996 | IN | 0x041969 |  | (read) |
| 98 | 0x04199A | OUT | 0x041969 | yes | RES 0 |
| 99 | 0x041F54 | IN | 0x041EB6 |  | (read) |
| 100 | 0x041F58 | OUT | 0x041EB6 | yes | SET 5 |
| 101 | 0x041F69 | IN | 0x041EB6 |  | (read) |
| 102 | 0x041F6D | OUT | 0x041EB6 | yes | RES 4 |
| 103 | 0x04293E | IN | 0x042914 |  | (read) |
| 104 | 0x042942 | OUT | 0x042914 | yes | RES 2 |
| 105 | 0x0493D1 | IN | 0x0493A2 |  | (read) |
| 106 | 0x0493D5 | OUT | 0x0493A2 | yes | RES 2 |

## By Function

### 0x008D46 — 1R 1W
Bits: SET 2

### 0x008D6F — 1R 1W
Bits: RES 2

### 0x0090C2 — 1R 1W
Bits: SET 2

### 0x0090EB — 1R 1W
Bits: RES 2

### 0x0093D3 — 1R 1W
Bits: RES 2

### 0x0099AB — 1R 1W
Bits: RES 2

### 0x00B9BD — 2R 2W
Bits: SET 0, SET 1

### 0x00EFA0 — 1R 1W
Bits: SET 2

### 0x00F062 — 1R 1W
Bits: RES 2

### 0x00F0A4 — 1R 1W
Bits: RES 2

### 0x012372 — 2R 2W
Bits: RES 5, SET 4

### 0x012456 — 1R 1W
Bits: RES 7

### 0x01247E — 2R 2W
Bits: SET 5, RES 4

### 0x01270D — 1R 1W
Bits: SET 7

### 0x0127E9 — 2R 2W
Bits: SET 6, RES 6

### 0x0129CD — 1R 1W
Bits: SET 0

### 0x012BE3 — 2R 2W
Bits: RES 1, RES 0

### 0x012D13 — 2R 2W
Bits: RES 1, RES 2

### 0x012DC5 — 2R 2W
Bits: RES 6, RES 0

### 0x02BB4B — 1R 1W
Bits: SET 2

### 0x02BBCB — 1R 1W
Bits: RES 2

### 0x02BC0D — 1R 1W
Bits: RES 2

### 0x036D5B — 1R 1W
Bits: SET 2

### 0x036D84 — 1R 1W
Bits: RES 2

### 0x038D47 — 1R 1W
Bits: SET 2

### 0x038D70 — 1R 1W
Bits: RES 2

### 0x040F72 — 2R 2W
Bits: RES 5, SET 4

### 0x041056 — 1R 1W
Bits: RES 7

### 0x04107E — 2R 2W
Bits: SET 5, RES 4

### 0x0412E4 — 1R 1W
Bits: SET 7

### 0x0413B9 — 2R 2W
Bits: SET 6, RES 6

### 0x0415C7 — 1R 1W
Bits: SET 0

### 0x041670 — 1R 1W
Bits: RES 2

### 0x041852 — 2R 2W
Bits: RES 1, RES 0

### 0x0418B7 — 2R 2W
Bits: RES 1, RES 2

### 0x041969 — 2R 2W
Bits: RES 6, RES 0

### 0x041EB6 — 2R 2W
Bits: SET 5, RES 4

### 0x042914 — 1R 1W
Bits: RES 2

### 0x0493A2 — 1R 1W
Bits: RES 2

## Detailed Instruction Traces

### 0x008D5A (IN) — function ~0x008D46

```
0x008D56: 01 80 30 00 ed 78
```

### 0x008D5E (OUT) — function ~0x008D46

```
0x008D56: 01 80 30 00 ed 78 cb d7 ed 79
```

Decoded operations:
  - SET 2,A at 0x008D5C

### 0x008D7D (IN) — function ~0x008D6F

```
0x008D79: 01 80 30 00 ed 78
```

### 0x008D81 (OUT) — function ~0x008D6F

```
0x008D79: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x008D7F

### 0x0090D6 (IN) — function ~0x0090C2

```
0x0090D2: 01 80 30 00 ed 78
```

### 0x0090DA (OUT) — function ~0x0090C2

```
0x0090D2: 01 80 30 00 ed 78 cb d7 ed 79
```

Decoded operations:
  - SET 2,A at 0x0090D8

### 0x0090F9 (IN) — function ~0x0090EB

```
0x0090F5: 01 80 30 00 ed 78
```

### 0x0090FD (OUT) — function ~0x0090EB

```
0x0090F5: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x0090FB

### 0x0093FD (IN) — function ~0x0093D3

```
0x0093F9: 01 80 30 00 ed 78
```

### 0x009401 (OUT) — function ~0x0093D3

```
0x0093F9: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x0093FF

### 0x0099E5 (IN) — function ~0x0099AB

```
0x0099E1: 01 80 30 00 ed 78
```

### 0x0099E9 (OUT) — function ~0x0099AB

```
0x0099E1: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x0099E7

### 0x00B9C1 (IN) — function ~0x00B9BD

```
0x00B9BD: 01 80 30 00 ed 78
```

### 0x00B9C5 (OUT) — function ~0x00B9BD

```
0x00B9BD: 01 80 30 00 ed 78 cb c7 ed 79
```

Decoded operations:
  - SET 0,A at 0x00B9C3

### 0x00B9D6 (IN) — function ~0x00B9BD

```
0x00B9D2: 01 80 30 00 ed 78
```

### 0x00B9DA (OUT) — function ~0x00B9BD

```
0x00B9D2: 01 80 30 00 ed 78 cb cf ed 79
```

Decoded operations:
  - SET 1,A at 0x00B9D8

### 0x00EFED (IN) — function ~0x00EFA0

```
0x00EFE9: 01 80 30 00 ed 78
```

### 0x00EFF1 (OUT) — function ~0x00EFA0

```
0x00EFE9: 01 80 30 00 ed 78 cb d7 ed 79
```

Decoded operations:
  - SET 2,A at 0x00EFEF

### 0x00F07B (IN) — function ~0x00F062

```
0x00F077: 01 80 30 00 ed 78
```

### 0x00F07F (OUT) — function ~0x00F062

```
0x00F077: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x00F07D

### 0x00F0CD (IN) — function ~0x00F0A4

```
0x00F0C9: 01 80 30 00 ed 78
```

### 0x00F0D1 (OUT) — function ~0x00F0A4

```
0x00F0C9: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x00F0CF

### 0x012380 (IN) — function ~0x012372

```
0x01237C: 01 80 30 00 ed 78
```

### 0x012384 (OUT) — function ~0x012372

```
0x01237C: 01 80 30 00 ed 78 cb af ed 79
```

Decoded operations:
  - RES 5,A at 0x012382

### 0x012395 (IN) — function ~0x012372

```
0x012391: 01 80 30 00 ed 78
```

### 0x012399 (OUT) — function ~0x012372

```
0x012391: 01 80 30 00 ed 78 cb e7 ed 79
```

Decoded operations:
  - SET 4,A at 0x012397

### 0x01245E (IN) — function ~0x012456

```
0x01245A: 01 80 30 00 ed 78
```

### 0x012462 (OUT) — function ~0x012456

```
0x01245A: 01 80 30 00 ed 78 cb bf ed 79
```

Decoded operations:
  - RES 7,A at 0x012460

### 0x012488 (IN) — function ~0x01247E

```
0x012484: 01 80 30 00 ed 78
```

### 0x01248C (OUT) — function ~0x01247E

```
0x012484: 01 80 30 00 ed 78 cb ef ed 79
```

Decoded operations:
  - SET 5,A at 0x01248A

### 0x01249D (IN) — function ~0x01247E

```
0x012499: 01 80 30 00 ed 78
```

### 0x0124A1 (OUT) — function ~0x01247E

```
0x012499: 01 80 30 00 ed 78 cb a7 ed 79
```

Decoded operations:
  - RES 4,A at 0x01249F

### 0x01273E (IN) — function ~0x01270D

```
0x01273A: 01 80 30 00 ed 78
```

### 0x012742 (OUT) — function ~0x01270D

```
0x01273A: 01 80 30 00 ed 78 cb ff ed 79
```

Decoded operations:
  - SET 7,A at 0x012740

### 0x012842 (IN) — function ~0x0127E9

```
0x01283E: 01 80 30 00 ed 78
```

### 0x012846 (OUT) — function ~0x0127E9

```
0x01283E: 01 80 30 00 ed 78 cb f7 ed 79
```

Decoded operations:
  - SET 6,A at 0x012844

### 0x01285E (IN) — function ~0x0127E9

```
0x01285A: 01 80 30 00 ed 78
```

### 0x012862 (OUT) — function ~0x0127E9

```
0x01285A: 01 80 30 00 ed 78 cb b7 ed 79
```

Decoded operations:
  - RES 6,A at 0x012860

### 0x012A1D (IN) — function ~0x0129CD

```
0x012A19: 01 80 30 00 ed 78
```

### 0x012A21 (OUT) — function ~0x0129CD

```
0x012A19: 01 80 30 00 ed 78 cb c7 ed 79
```

Decoded operations:
  - SET 0,A at 0x012A1F

### 0x012C10 (IN) — function ~0x012BE3

```
0x012C0C: 01 80 30 00 ed 78
```

### 0x012C14 (OUT) — function ~0x012BE3

```
0x012C0C: 01 80 30 00 ed 78 cb 8f ed 79
```

Decoded operations:
  - RES 1,A at 0x012C12

### 0x012C25 (IN) — function ~0x012BE3

```
0x012C21: 01 80 30 00 ed 78
```

### 0x012C29 (OUT) — function ~0x012BE3

```
0x012C21: 01 80 30 00 ed 78 cb 87 ed 79
```

Decoded operations:
  - RES 0,A at 0x012C27

### 0x012D44 (IN) — function ~0x012D13

```
0x012D40: 01 80 30 00 ed 78
```

### 0x012D48 (OUT) — function ~0x012D13

```
0x012D40: 01 80 30 00 ed 78 cb 8f ed 79
```

Decoded operations:
  - RES 1,A at 0x012D46

### 0x012D59 (IN) — function ~0x012D13

```
0x012D55: 01 80 30 00 ed 78
```

### 0x012D5D (OUT) — function ~0x012D13

```
0x012D55: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x012D5B

### 0x012DDB (IN) — function ~0x012DC5

```
0x012DD7: 01 80 30 00 ed 78
```

### 0x012DDF (OUT) — function ~0x012DC5

```
0x012DD7: 01 80 30 00 ed 78 cb b7 ed 79
```

Decoded operations:
  - RES 6,A at 0x012DDD

### 0x012DF2 (IN) — function ~0x012DC5

```
0x012DEE: 01 80 30 00 ed 78
```

### 0x012DF6 (OUT) — function ~0x012DC5

```
0x012DEE: 01 80 30 00 ed 78 cb 87 ed 79
```

Decoded operations:
  - RES 0,A at 0x012DF4

### 0x02BB52 (IN) — function ~0x02BB4B

```
0x02BB4E: 01 80 30 00 ed 78
```

### 0x02BB56 (OUT) — function ~0x02BB4B

```
0x02BB4E: 01 80 30 00 ed 78 cb d7 ed 79
```

Decoded operations:
  - SET 2,A at 0x02BB54

### 0x02BBE4 (IN) — function ~0x02BBCB

```
0x02BBE0: 01 80 30 00 ed 78
```

### 0x02BBE8 (OUT) — function ~0x02BBCB

```
0x02BBE0: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x02BBE6

### 0x02BC36 (IN) — function ~0x02BC0D

```
0x02BC32: 01 80 30 00 ed 78
```

### 0x02BC3A (OUT) — function ~0x02BC0D

```
0x02BC32: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x02BC38

### 0x036D6F (IN) — function ~0x036D5B

```
0x036D6B: 01 80 30 00 ed 78
```

### 0x036D73 (OUT) — function ~0x036D5B

```
0x036D6B: 01 80 30 00 ed 78 cb d7 ed 79
```

Decoded operations:
  - SET 2,A at 0x036D71

### 0x036D92 (IN) — function ~0x036D84

```
0x036D8E: 01 80 30 00 ed 78
```

### 0x036D96 (OUT) — function ~0x036D84

```
0x036D8E: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x036D94

### 0x038D5B (IN) — function ~0x038D47

```
0x038D57: 01 80 30 00 ed 78
```

### 0x038D5F (OUT) — function ~0x038D47

```
0x038D57: 01 80 30 00 ed 78 cb d7 ed 79
```

Decoded operations:
  - SET 2,A at 0x038D5D

### 0x038D7E (IN) — function ~0x038D70

```
0x038D7A: 01 80 30 00 ed 78
```

### 0x038D82 (OUT) — function ~0x038D70

```
0x038D7A: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x038D80

### 0x040F80 (IN) — function ~0x040F72

```
0x040F7C: 01 80 30 00 ed 78
```

### 0x040F84 (OUT) — function ~0x040F72

```
0x040F7C: 01 80 30 00 ed 78 cb af ed 79
```

Decoded operations:
  - RES 5,A at 0x040F82

### 0x040F95 (IN) — function ~0x040F72

```
0x040F91: 01 80 30 00 ed 78
```

### 0x040F99 (OUT) — function ~0x040F72

```
0x040F91: 01 80 30 00 ed 78 cb e7 ed 79
```

Decoded operations:
  - SET 4,A at 0x040F97

### 0x04105E (IN) — function ~0x041056

```
0x04105A: 01 80 30 00 ed 78
```

### 0x041062 (OUT) — function ~0x041056

```
0x04105A: 01 80 30 00 ed 78 cb bf ed 79
```

Decoded operations:
  - RES 7,A at 0x041060

### 0x041088 (IN) — function ~0x04107E

```
0x041084: 01 80 30 00 ed 78
```

### 0x04108C (OUT) — function ~0x04107E

```
0x041084: 01 80 30 00 ed 78 cb ef ed 79
```

Decoded operations:
  - SET 5,A at 0x04108A

### 0x04109D (IN) — function ~0x04107E

```
0x041099: 01 80 30 00 ed 78
```

### 0x0410A1 (OUT) — function ~0x04107E

```
0x041099: 01 80 30 00 ed 78 cb a7 ed 79
```

Decoded operations:
  - RES 4,A at 0x04109F

### 0x041315 (IN) — function ~0x0412E4

```
0x041311: 01 80 30 00 ed 78
```

### 0x041319 (OUT) — function ~0x0412E4

```
0x041311: 01 80 30 00 ed 78 cb ff ed 79
```

Decoded operations:
  - SET 7,A at 0x041317

### 0x041412 (IN) — function ~0x0413B9

```
0x04140E: 01 80 30 00 ed 78
```

### 0x041416 (OUT) — function ~0x0413B9

```
0x04140E: 01 80 30 00 ed 78 cb f7 ed 79
```

Decoded operations:
  - SET 6,A at 0x041414

### 0x04142E (IN) — function ~0x0413B9

```
0x04142A: 01 80 30 00 ed 78
```

### 0x041432 (OUT) — function ~0x0413B9

```
0x04142A: 01 80 30 00 ed 78 cb b7 ed 79
```

Decoded operations:
  - RES 6,A at 0x041430

### 0x041617 (IN) — function ~0x0415C7

```
0x041613: 01 80 30 00 ed 78
```

### 0x04161B (OUT) — function ~0x0415C7

```
0x041613: 01 80 30 00 ed 78 cb c7 ed 79
```

Decoded operations:
  - SET 0,A at 0x041619

### 0x041722 (IN) — function ~0x041670

```
0x04171E: 01 80 30 00 ed 78
```

### 0x041726 (OUT) — function ~0x041670

```
0x04171E: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x041724

### 0x04187F (IN) — function ~0x041852

```
0x04187B: 01 80 30 00 ed 78
```

### 0x041883 (OUT) — function ~0x041852

```
0x04187B: 01 80 30 00 ed 78 cb 8f ed 79
```

Decoded operations:
  - RES 1,A at 0x041881

### 0x041894 (IN) — function ~0x041852

```
0x041890: 01 80 30 00 ed 78
```

### 0x041898 (OUT) — function ~0x041852

```
0x041890: 01 80 30 00 ed 78 cb 87 ed 79
```

Decoded operations:
  - RES 0,A at 0x041896

### 0x0418E8 (IN) — function ~0x0418B7

```
0x0418E4: 01 80 30 00 ed 78
```

### 0x0418EC (OUT) — function ~0x0418B7

```
0x0418E4: 01 80 30 00 ed 78 cb 8f ed 79
```

Decoded operations:
  - RES 1,A at 0x0418EA

### 0x0418FD (IN) — function ~0x0418B7

```
0x0418F9: 01 80 30 00 ed 78
```

### 0x041901 (OUT) — function ~0x0418B7

```
0x0418F9: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x0418FF

### 0x04197F (IN) — function ~0x041969

```
0x04197B: 01 80 30 00 ed 78
```

### 0x041983 (OUT) — function ~0x041969

```
0x04197B: 01 80 30 00 ed 78 cb b7 ed 79
```

Decoded operations:
  - RES 6,A at 0x041981

### 0x041996 (IN) — function ~0x041969

```
0x041992: 01 80 30 00 ed 78
```

### 0x04199A (OUT) — function ~0x041969

```
0x041992: 01 80 30 00 ed 78 cb 87 ed 79
```

Decoded operations:
  - RES 0,A at 0x041998

### 0x041F54 (IN) — function ~0x041EB6

```
0x041F50: 01 80 30 00 ed 78
```

### 0x041F58 (OUT) — function ~0x041EB6

```
0x041F50: 01 80 30 00 ed 78 cb ef ed 79
```

Decoded operations:
  - SET 5,A at 0x041F56

### 0x041F69 (IN) — function ~0x041EB6

```
0x041F65: 01 80 30 00 ed 78
```

### 0x041F6D (OUT) — function ~0x041EB6

```
0x041F65: 01 80 30 00 ed 78 cb a7 ed 79
```

Decoded operations:
  - RES 4,A at 0x041F6B

### 0x04293E (IN) — function ~0x042914

```
0x04293A: 01 80 30 00 ed 78
```

### 0x042942 (OUT) — function ~0x042914

```
0x04293A: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x042940

### 0x0493D1 (IN) — function ~0x0493A2

```
0x0493CD: 01 80 30 00 ed 78
```

### 0x0493D5 (OUT) — function ~0x0493A2

```
0x0493CD: 01 80 30 00 ed 78 cb 97 ed 79
```

Decoded operations:
  - RES 2,A at 0x0493D3
