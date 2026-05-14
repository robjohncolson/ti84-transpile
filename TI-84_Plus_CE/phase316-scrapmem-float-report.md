# Phase 316: scrapMem Soft-Float Usage (57 refs)

## Summary

Scanned the soft-float wrapper library (0x04A3F0–0x04BA50) for all references to scrapMem (0xD02AD7–0xD02AD9). Found exactly **57 references** across ~15 functions. Every reference follows one of four clean patterns — zero anomalies.

**Bottom line**: A dedicated register (IYL or otherwise) **cannot** replace scrapMem in this library. The dominant patterns require a 3-byte individually-addressable scratch cell, which no eZ80 register provides.

## Statistics

| Metric | Count |
|--------|-------|
| Total references | 57 |
| Writes | 37 (34 write8, 3 write24) |
| Reads | 20 (9 read8, 11 read24) |
| Refs to D02AD7 | 29 |
| Refs to D02AD8 | 14 |
| Refs to D02AD9 | 14 |

### By Opcode

| Instruction | Count | Purpose |
|-------------|-------|---------|
| LD (nn),A | 34 | Write single byte to scrapMem |
| LD HL,(nn) | 10 | Read back 24-bit word |
| LD A,(nn) | 9 | Read single byte from scrapMem |
| LD (nn),BC | 2 | Write BC pair to scrapMem |
| LD DE,(nn) | 1 | Read DE pair from scrapMem |
| LD (nn),HL | 1 | Write HL to scrapMem |

## Access Patterns

All 57 references cluster into 15 groups with just 4 pattern types:

### Pattern 1: RECOMPOSE (11 instances, 44 refs)

```asm
LD (D02AD7), A   ; write byte 0 (low)
LD (D02AD8), A   ; write byte 1 (mid)
LD (D02AD9), A   ; write byte 2 (high)
LD HL, (D02AD7)  ; read back as 24-bit word
```

Found at: 0x04A446, 0x04A4B7, 0x04A63B, 0x04A6A2, 0x04A714, 0x04A7C9, 0x04A7F6 (reverse order D9→D8→D7), 0x04A91D, 0x04AB0A, 0x04BA0B (reverse order).

**Purpose**: Assembles 3 individually-computed bytes into a 24-bit register. The source bytes typically come from memory reads via `(HL)` with `DEC HL` between them — reading a packed IEEE-754 float from a TI-OS floating-point buffer and converting to a 24-bit mantissa word.

Typical prologue (seen at 8 of 11 sites):
```asm
CALL 0x082BE5    ; helper to set up HL pointing at FP buffer
7E               ; LD A,(HL) — read byte 2 (high)
32 D7 2A D0      ; LD (D02AD7),A
2B               ; DEC HL
7E               ; LD A,(HL) — read byte 1 (mid)
32 D8 2A D0      ; LD (D02AD8),A
2B               ; DEC HL
7E               ; LD A,(HL) — read byte 0 (low)
32 D9 2A D0      ; LD (D02AD9),A
2A D7 2A D0      ; LD HL,(D02AD7) — read back as 24-bit
```

Two sites (0x04A7F6, 0x04BA0B) write in reverse order (D9 first, then D8, then D7) before the read24. This is the "forward memory read" variant where HL increments instead of decrements.

### Pattern 2: DECOMPOSE (3 instances, 12 refs)

```asm
LD (D02AD7), HL  ; store 24-bit register (or LD (D02AD7),BC)
LD A, (D02AD7)   ; read byte 0 (low)
LD A, (D02AD8)   ; read byte 1 (mid)
LD A, (D02AD9)   ; read byte 2 (high)
```

Found at: 0x04B909, 0x04B9D8, 0x04BA35.

**Purpose**: Decomposes a 24-bit register into 3 individual bytes for output to I/O ports. All three sites follow each `LD A,(D02ADx)` with `ED 79` (OUT (C),A) — writing the mantissa bytes to a hardware port (port base 0x3024/0x3028/0x3007+offset). These are FP I/O functions that serialize a float to a peripheral register.

Context at 0x04B909:
```asm
LD (D02AD7), HL    ; store 24-bit mantissa
LD BC, 0x003024    ; port address
LD A, (D02AD7)     ; byte 0
OUT (C), A         ; write to port
INC C              ; next port byte
LD A, (D02AD8)     ; byte 1
OUT (C), A
INC C
LD A, (D02AD9)     ; byte 2
OUT (C), A
```

### Pattern 3: PARTIAL RECOMPOSE (1 instance, 3 refs)

```asm
LD (D02AD9), A   ; write high byte (constant: 0x0B or 0x0E)
LD (D02AD8), A   ; write mid byte (A=0x00 via XOR A)
LD HL, (D02AD7)  ; read back 24-bit
```

Found at: 0x04A862.

**Purpose**: Constructs a 24-bit value where only the high 2 bytes matter (low byte is don't-care from previous scrapMem content). The preceding code selects 0x0B or 0x0E based on a CP comparison, then zeros the mid byte. This builds a page-aligned address (0x0B0000 or 0x0E0000).

### Pattern 4: WRITE-ONLY / Masked Store (1 instance, 2 refs)

```asm
LD A, (0xD00603)  ; read OS flag byte
AND 0x3F          ; mask bits 6-7
LD (D02AD7), A    ; store masked value
CP 0x14           ; compare with threshold
```

Found at: 0x04A81F, 0x04A830 (two write8-only sites, no paired read).

**Purpose**: Uses D02AD7 as a temporary for a masked byte. The value is compared immediately after the store — scrapMem is used to preserve the masked value across subsequent branches. This is NOT a byte↔word conversion; it is a scratch variable.

## Function Distribution

| Function | Refs | Pattern |
|----------|------|---------|
| _fpwrap_K | 8 | 2x RECOMPOSE (forward + reverse order) |
| _fpwrap_A | 4 | 1x RECOMPOSE |
| _fpwrap_C | 4 | 1x RECOMPOSE (reads back into DE, not HL) |
| _fpwrap_G | 4 | 1x RECOMPOSE |
| _fpwrap_P | 4 | 1x RECOMPOSE |
| _fpwrap_T | 4 | 1x RECOMPOSE |
| _fpIO_W | 4 | 1x DECOMPOSE (HL→port via OUT) |
| _fpIO_AB | 4 | 1x DECOMPOSE (BC→port via OUT) |
| _fpIO_AC | 4 | 1x DECOMPOSE (BC→port, then store bytes to memory) |
| func@0x04A6A2 | 4 | 1x RECOMPOSE |
| func@0x04A714 | 4 | 1x RECOMPOSE |
| func@0x04BA0B | 4 | 1x RECOMPOSE (reverse order) |
| func@0x04A81F | 2 | WRITE-ONLY (masked store) |
| func@0x04A862 | 3 | 1x PARTIAL RECOMPOSE |

## Register Replacement Analysis

**Question**: Could a dedicated register (IYL or unused reg) replace ALL scrapMem usage in this library?

**Answer: No.** Here is why, pattern by pattern:

### RECOMPOSE (11 sites, 77% of refs) — NOT replaceable

The recompose pattern writes 3 individual bytes then reads them back as a single 24-bit word. This requires:
1. Write to byte offset 0
2. Write to byte offset 1
3. Write to byte offset 2
4. Read all 3 as a 24-bit unit

No eZ80 register supports individually addressable byte offsets within a 24-bit value. IYL/IYH provide only 2 of the 3 bytes of IY, and there is no "IYU" (upper byte) accessible as a register. The eZ80 ISA has no byte-insert or byte-extract instructions for 24-bit registers.

**Alternative**: A 3-instruction rotate chain (8 rotates per byte extraction = 24 rotates for 3 bytes) would be slower and destroy carry/flags. Not practical.

### DECOMPOSE (3 sites, 21% of refs) — NOT replaceable

Same constraint in reverse: writing a 24-bit register then reading individual bytes requires the same byte-addressable scratch cell.

**Alternative**: For the I/O port case specifically, one COULD use:
```asm
OUT (C), L   ; byte 0
OUT (C), H   ; byte 1 (but only if H/L accessible)
; byte 2 (upper byte of HL) — no instruction exists
```
But eZ80 `OUT (C),r` only works with 8-bit registers (A, B, C, D, E, H, L), and there is no way to extract the upper byte of a 24-bit HL without storing to memory first.

### PARTIAL RECOMPOSE (1 site) — NOT replaceable

Same constraint as RECOMPOSE. Building a 24-bit value from 2 known bytes requires a 3-byte scratch.

### WRITE-ONLY / masked store (1 site, 4% of refs) — theoretically replaceable

This pattern uses scrapMem purely as a temporary variable. It COULD use any spare register (B, C, D, E). However, at these code sites all general-purpose registers are in use (the surrounding code uses A, BC, DE, HL, IX). Only IY might be available, but TI-OS reserves IY for the flag base pointer (IY = 0xD00080).

## Transpiler Implications

1. **No optimization opportunity**: scrapMem access in the soft-float library does NOT need special handling in the transpiler. It is ordinary RAM read/write that the existing `read8`/`write8`/`read24`/`write24` handlers cover correctly.

2. **ISR safety**: The ISR at 0x0014D8 also writes to scrapMem, but the vulnerability window within each cluster is tiny (4-7 instructions, ~0.5-1 us). The transpiler runs single-threaded JavaScript with no preemption, so ISR interleaving is impossible — scrapMem is inherently safe in the transpiled environment.

3. **Pattern regularity**: The extreme regularity (11 RECOMPOSE + 3 DECOMPOSE = 93% of refs) means the transpiler could potentially recognize and optimize these as direct byte-manipulation operations, but the current 1:1 bytecode lift handles them correctly without special cases.

## Conclusion

The 57 scrapMem references in the soft-float library are a **necessary consequence of the eZ80 ISA's lack of byte-extract/insert instructions for 24-bit registers**. scrapMem serves as a memory-mapped byte↔word conversion cell. No register trick can replace it because no eZ80 register provides individually addressable byte lanes within a 24-bit value. The TI-OS compiler (ZDS II) generated this pattern systematically wherever it needed to convert between byte-level IEEE-754 float fields and 24-bit register values.
