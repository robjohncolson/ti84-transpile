# Phase 429 — D141E6 Config/Mode Source Trace

## Summary

D141E6 has **15 total references** in the ROM: **11 reads, 4 writes**. No IMM loads.
Adjacent bytes D141E5 (8 refs: 6R/2W) and D141E7 (8 refs: 2R/6W) were also traced.

## D141E6 Write Sites (4 total)

All 4 writes use `LD (nn),A` — storing register A into D141E6.

### Site 1: 0x00DD61 — USB/Link init path A

```
0x00DD61: LD (D141E6),A
Context: ED 78 06 06 CD 75 25 00 E6 03 32 [E6 41 D1] 3E 01 DD F9 DD E1 C9
```

- Reads port 0x06 via `IN A,(C)` (BC=0x0630, port 0x0630)
- Calls 0x002575 (_lshru — logical shift right)
- Masks result with `AND 0x03`
- Stores masked value to D141E6
- Then loads A=1 and returns (DD F9 = LD SP,IX; DD E1 = POP IX; C9 = RET)

**Value written**: bits 1:0 of port 0x0630 >> 6, i.e., the top 2 bits of USB port register 0x0630, masked to 0x00..0x03.

### Site 2: 0x00DDF9 — USB/Link init path B

```
0x00DDF9: LD (D141E6),A
Context: ED 78 06 06 CD 75 25 00 E6 03 32 [E6 41 D1] 01 14 00 00 C5 CD A0 4F 01
```

- Identical preamble: IN A,(C) from port 0x0630, call _lshru, AND 0x03
- After the store, pushes 0x000014 (20 decimal) and calls 0x014FA0
- This is a second entry point into the same init logic, with a follow-up call

**Value written**: Same as Site 1 — top 2 bits of port 0x0630, masked to 0x00..0x03.

### Site 3: 0x03AB82 — Mirror of Site 1

```
0x03AB82: LD (D141E6),A
Context: ED 78 06 06 CD 04 01 00 E6 03 32 [E6 41 D1] 3E 01 DD F9 DD E1 C9
```

- Mirror copy of Site 1 at 0x03xxxx. Same logic: IN from port, shift, mask, store, return.
- The _lshru call target is 0x000104 instead of 0x002575 (different ROM bank mirror routing).

### Site 4: 0x03AC1A — Mirror of Site 2

```
0x03AC1A: LD (D141E6),A
Context: ED 78 06 06 CD 04 01 00 E6 03 32 [E6 41 D1] 01 14 00 00 C5 CD 00 05 00
```

- Mirror copy of Site 2 at 0x03xxxx. Same logic with mirrored call targets.

## D141E6 Read Sites (11 total)

### 0x00DE9D..0x00DF3F — post-bootstrap field initializer (4 reads)

These are the 4 known reads in the 0x00DE8B function. Each follows the same pattern:
```
3A [E6 41 D1]    ; LD A,(D141E6)
87 87 87 87      ; ADD A,A × 4  (= SHL 4, i.e., A << 4)
CB F7            ; SET 6,A  (or similar bit op)
```
The value from D141E6 (0..3) is shifted left 4 bits and combined with bit 6 to produce the descriptor +5 mode byte.

### 0x039A3A — single read in event-struct access cluster

```
3A [E6 41 D1] 87 87 87 87 4F 78 B1
```
Same shift-left-4 pattern, then OR'd with another register.

### 0x03ACBE..0x03ADC2 — mirror of post-bootstrap initializer (6 reads)

Mirror copies of the 0x00DE8B function, with 6 reads instead of 4 (2 additional reads referencing D1300x-range descriptor bases instead of D13Fxx).

## D141E5 Write Sites (2 total)

- **0x00D700**: `LD A,(D14097); LD (D141E5),A` — copies port/config byte D14097 into D141E5
- **0x03A4B8**: Mirror of above

## D141E7 Write Sites (6 total)

- **0x00DCF0, 0x00DD8A**: Store `A=1` into D141E7 after calling 0x00DA8C. Part of USB init — sets a "USB active" flag.
- **0x0095F9**: Clears D141E7 to 0 (`AF; LD (D141E7),A` = XOR A; store) — conditional on port 0x3031 bit 0.
- **0x03AB11, 0x03ABAB**: Mirrors of 0x00DCF0/0x00DD8A.
- **0x048F99**: Mirror of 0x0095F9.

## Assessment

### When is D141E6 set?

D141E6 is set **during USB/Link hardware initialization**, not during general boot. The two unique write sites (0x00DD61 and 0x00DDF9) are in the USB subsystem init — they read a hardware port register and extract configuration bits.

### What value gets written?

The value is always: **top 2 bits of USB port register 0x0630, right-shifted and masked to 0x03**. This gives a value in the range 0x00..0x03, representing one of 4 USB speed/mode configurations:

| Value | Likely meaning |
|-------|---------------|
| 0x00  | No connection / low-speed |
| 0x01  | Full-speed USB |
| 0x02  | High-speed USB |
| 0x03  | Reserved / alternate mode |

### How is D141E6 consumed?

All 11 read sites use the same pattern: `LD A,(D141E6); ADD A,A; ADD A,A; ADD A,A; ADD A,A` — shifting the 2-bit value left by 4 positions to place it in bits 5:4 of the descriptor mode byte. This encodes the USB speed/mode into the upper nibble of descriptor +5.

### ROM mirroring

Sites 1-2 (0x00DDxx) have exact mirrors at 0x03ABxx-0x03ACxx. This is the standard TI-84 CE ROM dual-bank pattern where USB/Link code exists in both the main ROM bank and the mirror bank.

### Key functions

| Address | Role |
|---------|------|
| 0x00DD61 | USB init path A — writes D141E6, returns |
| 0x00DDF9 | USB init path B — writes D141E6, continues to 0x014FA0 |
| 0x00DE8B | Post-bootstrap field init — reads D141E6 × 4 |
| 0x002575 / 0x000104 | _lshru — logical shift right utility |
| Port 0x0630 | USB hardware register (source of the config bits) |
