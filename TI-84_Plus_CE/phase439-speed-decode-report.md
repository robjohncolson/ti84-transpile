# Phase 439 — Port 0x3082 Speed-Decode Analysis

## Summary

- **92** port 0x3082 (OTG_CSR) read sites found
- **4** speed-decode sites (AND + RRA + SET 2,A + CP 0x30)
- **4** stores to D141E6 (speed enum variable)
- **11** loads from D141E6

## Bit Access Frequency

| Bit | Count | Likely Role |
|-----|-------|-------------|
| 0 | 9 | |
| 1 | 30 | |
| 2 | 0 | |
| 3 | 33 | |
| 4 | 22 | |
| 5 | 24 | |
| 6 | 4 | |
| 7 | 0 | |

## Sites Grouped by AND Mask

### AND 0x08 (24 sites)

- IN A,(C) @ 0x008532
- IN A,(C) @ 0x008b86
- IN A,(C) @ 0x008d50
- IN A,(C) @ 0x0090cc
- IN A,(C) @ 0x012514
- IN A,(C) @ 0x012533
- IN A,(C) @ 0x0128b1
- IN A,(C) @ 0x012a7e
- IN A,(C) @ 0x012ae1
- IN A,(C) @ 0x013053
- IN A,(C) @ 0x0367ba
- IN A,(C) @ 0x036d65
- IN A,(C) @ 0x03707c
- IN A,(C) @ 0x0370d6
- IN A,(C) @ 0x037197
- IN A,(C) @ 0x0371d4
- IN A,(C) @ 0x0376f5
- IN A,(C) @ 0x038bc2
- IN A,(C) @ 0x038d51
- IN A,(C) @ 0x041481
- IN A,(C) @ 0x04167a
- IN A,(C) @ 0x041768
- IN A,(C) @ 0x041bdf
- IN A,(C) @ 0x0497a9

### AND 0x20 (21 sites)

- IN A,(C) @ 0x0098fb
- IN A,(C) @ 0x00eee8
- IN A,(C) @ 0x00f01b
- IN A,(C) @ 0x00f113
- IN A,(C) @ 0x00fc9d
- IN A,(C) @ 0x00fd63
- IN A,(C) @ 0x012d28
- IN A,(C) @ 0x012dd1
- IN A,(C) @ 0x012ed7
- IN A,(C) @ 0x02b912
- IN A,(C) @ 0x02bb80
- IN A,(C) @ 0x02bc7c
- IN A,(C) @ 0x02c19b
- IN A,(C) @ 0x02c2cd
- IN A,(C) @ 0x02f6aa
- IN A,(C) @ 0x031dbf
- IN A,(C) @ 0x0418cc
- IN A,(C) @ 0x041975
- IN A,(C) @ 0x041a7b
- IN A,(C) @ 0x04899b
- IN A,(C) @ 0x0492cf

### AND 0x10 (12 sites)

- IN A,(C) @ 0x008b23
- IN A,(C) @ 0x0090a8
- IN A,(C) @ 0x009a1e
- IN A,(C) @ 0x010f94
- IN A,(C) @ 0x010ffd
- IN A,(C) @ 0x0127a8
- IN A,(C) @ 0x012caa
- IN A,(C) @ 0x02c137
- IN A,(C) @ 0x036757
- IN A,(C) @ 0x038d2d
- IN A,(C) @ 0x041374
- IN A,(C) @ 0x04940a

### AND 0x02 (12 sites)

- IN A,(C) @ 0x00f0ae
- IN A,(C) @ 0x012587
- IN A,(C) @ 0x0125ac
- IN A,(C) @ 0x012632
- IN A,(C) @ 0x012656
- IN A,(C) @ 0x0129d7
- IN A,(C) @ 0x02bc17
- IN A,(C) @ 0x04115e
- IN A,(C) @ 0x041183
- IN A,(C) @ 0x041209
- IN A,(C) @ 0x04122d
- IN A,(C) @ 0x0415d1

### AND 0x02 + AND 0x02 (6 sites)

- IN A,(C) @ 0x00f09a
- IN A,(C) @ 0x012577
- IN A,(C) @ 0x012622
- IN A,(C) @ 0x02bc03
- IN A,(C) @ 0x04114e
- IN A,(C) @ 0x0411f9

### AND 0x03 + AND 0x41 (4 sites)

- IN A,(C) @ 0x00dd57
- IN A,(C) @ 0x00ddef
- IN A,(C) @ 0x03ab78
- IN A,(C) @ 0x03ac10

### AND 0x10 + AND 0x08 (3 sites)

- IN A,(C) @ 0x00fc50
- IN A,(C) @ 0x013047
- IN A,(C) @ 0x041bd3

### no AND (raw read) (2 sites)

- IN A,(C) @ 0x006ef7
- IN A,(C) @ 0x04af1d

### AND 0x20 + AND 0x10 + AND 0x08 (2 sites)

- IN A,(C) @ 0x009aad
- IN A,(C) @ 0x04949e

### AND 0x08 + AND 0x02 (2 sites)

- IN A,(C) @ 0x00f090
- IN A,(C) @ 0x02bbf9

### AND 0x10 + AND 0x10 + AND 0x08 (2 sites)

- IN A,(C) @ 0x01303d
- IN A,(C) @ 0x041bc9

### AND 0x01 (1 sites)

- IN A,(C) @ 0x0340c7

### AND 0x10 + AND 0x20 (1 sites)

- IN A,(C) @ 0x04898f

## Speed-Decode Sites

### IN @ 0x008d50

```
Raw: ed 78 e6 08 20 1f 01 80 30 00 ed 78 cb d7 ed 79 78 fe 30 28 01 cf 79 fe 80 20 fa 01 07 00 00 c5 cd a0 4f 01 c1 cd 27 85
AND masks: 0x08
Patterns: AND 0x08 (bit 3), RRA, SET 2,A, CP 0x30
```

### IN @ 0x0090cc

```
Raw: ed 78 e6 08 20 1f 01 80 30 00 ed 78 cb d7 ed 79 78 fe 30 28 01 cf 79 fe 80 20 fa 01 07 00 00 c5 cd a0 4f 01 c1 cd 27 85
AND masks: 0x08
Patterns: AND 0x08 (bit 3), RRA, SET 2,A, CP 0x30
```

### IN @ 0x036d65

```
Raw: ed 78 e6 08 20 1f 01 80 30 00 ed 78 cb d7 ed 79 78 fe 30 28 01 cf 79 fe 80 20 fa 01 07 00 00 c5 cd 00 05 00 c1 cd 9e 97
AND masks: 0x08
Patterns: AND 0x08 (bit 3), RRA, SET 2,A, CP 0x30
```

### IN @ 0x038d51

```
Raw: ed 78 e6 08 20 1f 01 80 30 00 ed 78 cb d7 ed 79 78 fe 30 28 01 cf 79 fe 80 20 fa 01 07 00 00 c5 cd 00 05 00 c1 cd 9e 97
AND masks: 0x08
Patterns: AND 0x08 (bit 3), RRA, SET 2,A, CP 0x30
```

## D141E6 Store Sites

- LD (D141E6),A @ 0x00dd61
- LD (D141E6),A @ 0x00ddf9
- LD (D141E6),A @ 0x03ab82
- LD (D141E6),A @ 0x03ac1a

## D141E6 Load Sites

- LD A,(D141E6) @ 0x00de9d
- LD A,(D141E6) @ 0x00deda
- LD A,(D141E6) @ 0x00df0e
- LD A,(D141E6) @ 0x00df3f
- LD A,(D141E6) @ 0x039a3a
- LD A,(D141E6) @ 0x03acbe
- LD A,(D141E6) @ 0x03acfb
- LD A,(D141E6) @ 0x03ad2f
- LD A,(D141E6) @ 0x03ad60
- LD A,(D141E6) @ 0x03ad91
- LD A,(D141E6) @ 0x03adc2

## Key Finding: Speed-Decode Pattern Reinterpreted

The AND 0x08 + SET 2 + CP 0x30 pattern does NOT decode speed from port 0x3082.
Instead:

1. Port 0x3082 bit 3 is read as a **status gate** (e.g., VBUS valid / session valid)
2. If bit 3 = 0, the code **writes** to port 0x3080 (OTG control register), setting bit 2
3. If bit 3 = 1, the write is skipped (desired state already active)
4. The SET 2 + OUT + verify sequence operates on **port 0x3080**, not 0x3082
5. The CP 0x30 and CP 0x80 are register-value sanity checks (B=0x30, C=0x80), not data comparisons

## Actual Speed Enum: D141E6 via AND 0x03

The real speed classification uses **bits 1:0** of port 0x3082:

```
IN A,(C)           ; read port 0x3082
LD B,6             ; delay parameter
CALL 0x002575      ; stabilization delay
AND 0x03           ; extract bits 1:0
LD (D141E6),A      ; store speed enum
```

| D141E6 value | Bits 1:0 | USB Speed |
|-------------|----------|-----------|
| 0x00 | 00 | High Speed (480 Mbps) |
| 0x01 | 01 | Full Speed (12 Mbps) |
| 0x02 | 10 | Low Speed (1.5 Mbps) |
| 0x03 | 11 | Reserved / disconnected |

All 11 D141E6 load sites multiply by 16 (4x ADD A,A) before using as table offset,
indexing into USB descriptor/configuration tables sized by speed.

## Port 0x3082 Bit Map

| Bit | Sites | Role |
|-----|-------|------|
| 0 | 9 | Speed enum LSB (AND 0x01 or part of AND 0x03) |
| 1 | 30 | Speed enum MSB / device-attached (AND 0x02 or part of AND 0x03) |
| 2 | 0 | (unused in direct tests) |
| 3 | 33 | VBUS valid / session gate (AND 0x08) — gates writes to port 0x3080 |
| 4 | 22 | Connection state / bus event (AND 0x10) |
| 5 | 24 | Physical connection flag (AND 0x20) |
| 6 | 4 | (tested via AND 0xC0, role unclear) |
| 7 | 0 | (unused in direct tests) |
