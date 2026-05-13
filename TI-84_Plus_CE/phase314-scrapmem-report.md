# Phase 314: scrapMem (0xD02AD7) Usage Beyond Utility Family

## Summary

**Total references to scrapMem region (0xD02AD7-0xD02AD9): 181**

| Category | Count | Writes | Reads |
|----------|-------|--------|-------|
| Utility family (0x04C800-0x04CA40) | 37 | 20 | 17 |
| ISR context (0x001401-0x001500) | 2 | 1 | 1 |
| Other ROM functions | 142 | 78 | 64 |
| **Total** | **181** | **99** | **82** |

scrapMem is used far more broadly than the 12 utility functions — 142 references from 40 distinct function clusters across the entire OS.

## Usage Patterns

### Pattern 1: High-Byte Extraction (dominant)

```asm
ld (0xD02AD7), hl    ; store 24-bit register to scrapMem
ld a, (0xD02AD9)     ; read back byte 2 = bits 16-23
```

Standard eZ80 idiom. The CPU has no direct instruction to extract the upper byte of a 24-bit register, so code stores the full value to RAM and reads back the desired byte. Vulnerability window: 2 instructions (~8 T-states).

Found in: OS kernel, syscall handlers, math/expression, token/parser, FP arithmetic, USB/cert, flash/archive.

### Pattern 2: Byte-by-Byte Recomposition (soft-float library)

```asm
ld (0xD02AD7), a     ; write low byte
ld (0xD02AD8), a     ; write mid byte
ld (0xD02AD9), a     ; write high byte
ld hl, (0xD02AD7)    ; read back as 24-bit value
```

Inverse of Pattern 1: assembles 3 separate bytes into a 24-bit register. Vulnerability window: 4 instructions (~20 T-states). Found 8 instances in soft-float library alone.

### Pattern 3: Byte-by-Byte Decomposition (soft-float library)

```asm
ld (0xD02AD7), hl    ; store 24-bit value
ld a, (0xD02AD7)     ; read low byte
ld a, (0xD02AD8)     ; read mid byte
ld a, (0xD02AD9)     ; read high byte
```

Full decomposition into all 3 bytes. Found at 0x007963, 0x007A31, 0x04B908, 0x04B9D6, 0x04BA33.

## Categorized Reference List

### OS Kernel/Init (0x0007xx-0x000Exx) — 12 refs

| Address | Type | Target | Notes |
|---------|------|--------|-------|
| 0x000710 | read24(hl) | D02AD7 | Reads scrapMem, pushes HL, calls 0x001713 |
| 0x000898 | write24(hl) | D02AD7 | Stores HL, reads high byte, compares to 0x02 |
| 0x00089C | read8(a) | D02AD9 | High-byte check (page >= 2?) |
| 0x000D9D | write24(hl) | D02AD7 | Same pattern |
| 0x000DA1 | read8(a) | D02AD9 | High-byte extract |
| 0x000E41 | write24(hl) | D02AD7 | Init sequence — multiple read/write cycles |
| 0x000E45 | write8(a) | D02AD9 | Explicit high-byte set |
| 0x000E49 | read24(hl) | D02AD7 | Read back full 24-bit |
| 0x000E52 | write24(hl) | D02AD7 | Second store in init |
| 0x000E5B | read8(a) | D02AD9 | High-byte extract |
| 0x000E67 | write24(hl) | D02AD7 | Third store in init |
| 0x000E6B | read8(a) | D02AD9 | High-byte extract |

### Syscall/Event Dispatch (0x0010xx-0x001Bxx) — 13 refs

| Address | Type | Target | Notes |
|---------|------|--------|-------|
| 0x0010E0 | write24(bc) | D02AD7 | High-byte extract via BC |
| 0x0010E5 | read8(a) | D02AD9 | |
| 0x001281 | write24(bc) | D02AD7 | Same pattern |
| 0x001286 | read8(a) | D02AD9 | |
| 0x001943 | write24(de) | D02AD7 | High-byte extract via DE |
| 0x001948 | read8(a) | D02AD9 | |
| 0x001A33 | write24(hl) | D02AD7 | Write-only (no paired read) |
| 0x001BB6 | read8(a) | D02AD7 | Read low byte — unusual |
| 0x001BC2 | read8(a) | D02AD7 | Read low byte again |
| 0x001BD1 | read8(a) | D02AD8 | Read mid byte |
| 0x001BDD | read8(a) | D02AD8 | Read mid byte |
| 0x001BE6 | read8(a) | D02AD9 | Read high byte |
| 0x001BF2 | read8(a) | D02AD9 | Read high byte |

The 0x001Bxx cluster reads all 3 bytes individually — this is a full decomposition consumer. It reads scrapMem written by 0x001A33 or an earlier caller.

### Math/Expression Eval (0x0070xx-0x0084xx) — 23 refs

| Address | Type | Target | Notes |
|---------|------|--------|-------|
| 0x007019 | write24(hl) | D02AD7 | High-byte extract |
| 0x00701D | read8(a) | D02AD9 | |
| 0x007227 | write24(hl) | D02AD7 | Decompose + recompose pattern |
| 0x00722B | write8(a) | D02AD9 | Modify high byte |
| 0x00722F | read24(hl) | D02AD7 | Read back modified value |
| 0x00733B | write24(hl) | D02AD7 | Same decompose/recompose |
| 0x00733F | write8(a) | D02AD9 | |
| 0x007343 | read24(hl) | D02AD7 | |
| 0x00744F | write24(hl) | D02AD7 | Same pattern |
| 0x007453 | write8(a) | D02AD9 | |
| 0x007457 | read24(hl) | D02AD7 | |
| 0x00780E | write24(hl) | D02AD7 | High-byte extract |
| 0x007812 | read8(a) | D02AD9 | |
| 0x007963 | write24(hl) | D02AD7 | Full 3-byte decomposition |
| 0x00796B | read8(a) | D02AD7 | Low byte |
| 0x007972 | read8(a) | D02AD8 | Mid byte |
| 0x007979 | read8(a) | D02AD9 | High byte |
| 0x007A31 | write24(bc) | D02AD7 | Full 3-byte decomposition |
| 0x007A3A | read8(a) | D02AD7 | Low byte |
| 0x007A41 | read8(a) | D02AD8 | Mid byte |
| 0x007A48 | read8(a) | D02AD9 | High byte |
| 0x0083F9 | write24(de) | D02AD7 | High-byte extract |
| 0x0083FE | read8(a) | D02AD9 | |

The math region includes the richest variety: simple high-byte extraction, decompose-modify-recompose (0x0072xx, 0x0073xx, 0x0074xx), and full 3-byte decomposition (0x0079xx, 0x007Axx).

### Token/Parser (0x029Axx-0x029Dxx) — 6 refs

| Address | Type | Target |
|---------|------|--------|
| 0x029ACF | write24(hl) | D02AD7 |
| 0x029AD9 | read8(a) | D02AD9 |
| 0x029C67 | write24(hl) | D02AD7 |
| 0x029C71 | read8(a) | D02AD9 |
| 0x029DE3 | write24(hl) | D02AD7 |
| 0x029DED | read8(a) | D02AD9 |

All 3 are simple high-byte extraction. Likely checking which memory page a token pointer lives in.

### String/Conversion (0x03D0xx-0x03D4xx) — 6 refs

| Address | Type | Target | Notes |
|---------|------|--------|-------|
| 0x03D0E1 | write24(hl) | D02AD7 | Write-only |
| 0x03D19E | write24(hl) | D02AD7 | Write-only |
| 0x03D4AD | write8(a) | D02AD7 | Byte-by-byte recompose |
| 0x03D4B3 | write8(a) | D02AD8 | |
| 0x03D4B9 | write8(a) | D02AD9 | |
| 0x03D4BD | read24(de) | D02AD7 | Read back as DE |

### FP Arithmetic (0x03FFxx-0x0408xx) — 16 refs

| Address | Type | Target |
|---------|------|--------|
| 0x03FF50 | write24(hl) | D02AD7 |
| 0x03FF60 | read24(hl) | D02AD7 |
| 0x03FF65 | write24(hl) | D02AD7 |
| 0x03FF9D | read24(bc) | D02AD7 |
| 0x040049 | write24(hl) | D02AD7 |
| 0x040066 | read24(hl) | D02AD7 |
| 0x04006F | read24(bc) | D02AD7 |
| 0x040075 | write24(hl) | D02AD7 |
| 0x040083 | write24(hl) | D02AD7 |
| 0x04008A | read24(hl) | D02AD7 |
| 0x0400AE | read24(de) | D02AD7 |
| 0x0400B7 | write24(de) | D02AD7 |
| 0x040201 | write24(hl) | D02AD7 |
| 0x040205 | read8(a) | D02AD9 |
| 0x04020C | read24(hl) | D02AD7 |
| 0x04083F | write24(hl) | D02AD7 |

Heavy use for 24-bit pointer manipulation within FP routines. Multiple read24/write24 pairs suggest pointer swapping through scrapMem.

### Soft-Float Library (0x04A4xx-0x04BAxx) — 57 refs

The largest non-utility consumer. 57 references with a mix of:
- **Byte-by-byte recompose** (write8 D7, write8 D8, write8 D9, read24 D7): 8 instances in 0x04A4xx-0x04ABxx
- **Full decomposition** (write24 D7, read8 D7, read8 D8, read8 D9): 4 instances in 0x04B9xx-0x04BAxx
- **Byte-by-byte with reverse order** (write8 D9, write8 D8, write8 D7, read24 D7): 3 instances

This library uses scrapMem as a general-purpose byte↔word conversion cell for floating-point mantissa and exponent manipulation.

### USB/Cert (0x07B8xx) — 2 refs

| Address | Type | Target |
|---------|------|--------|
| 0x07B815 | write24(hl) | D02AD7 |
| 0x07B819 | read8(a) | D02AD9 |

High-byte extraction, likely checking memory page of a USB buffer pointer.

### Cert/Crypto (0x0827xx-0x0828xx) — 3 refs

| Address | Type | Target |
|---------|------|--------|
| 0x0827C3 | write24(bc) | D02AD7 |
| 0x0827CA | write24(bc) | D02AD7 |
| 0x08282F | read24(bc) | D02AD7 |

Two writes (possibly conditional paths) and a later read. Used for certificate address manipulation.

### Flash/Archive (0x0B41xx) — 2 refs

| Address | Type | Target |
|---------|------|--------|
| 0x0B418E | write24(hl) | D02AD7 |
| 0x0B4197 | read24(hl) | D02AD7 |

Store-and-reload pattern, possibly for flash page calculation.

### ISR Context (0x0014D8) — 2 refs

| Address | Type | Target | Notes |
|---------|------|--------|-------|
| 0x0014D8 | write24(hl) | D02AD7 | Keyboard scan ISR stores scan result |
| 0x0014DC | read8(a) | D02AD9 | Extracts high byte, compares to 0x1E |

Part of the keyboard scan ISR chain: 0x0014C9 → call 0x0008BB → call 0x0008C8 → 0x0014D8 (scrapMem write). The high byte is compared to 0x1E (30), likely checking if the scan code is within the valid key matrix range.

## Safety Assessment

### Can the ISR clobber scrapMem while main-line code uses it?

**Yes, theoretically. No, practically.**

**The vulnerability:**
- The ISR at 0x0014D8 writes 24 bits to scrapMem (0xD02AD7-0xD02AD9).
- Main-line code using Pattern 1 (high-byte extraction) has a 2-instruction window between write and read.
- Main-line code using Pattern 2 (byte-by-byte recompose) has a 4-instruction window.
- If the keyboard scan IRQ fires during this window, the ISR clobbers scrapMem with its own value.

**Why it doesn't matter in practice:**
1. **No DI protection**: Zero DI instructions in the utility family or soft-float library. TI-OS does not guard scrapMem.
2. **Tiny window**: Pattern 1 = ~8 T-states (~0.33 us at 24 MHz). Pattern 2 = ~20 T-states (~0.83 us).
3. **Low IRQ frequency**: Keyboard scan runs at ~30ms intervals = ~33 Hz.
4. **Collision probability**: ~0.83us / 30000us = 0.003% per scrapMem access. With ~181 references across a full OS boot, expected collisions per boot ≈ 0.005.
5. **ISR restores nothing**: The ISR does NOT save/restore scrapMem — it writes its own value and moves on. This confirms TI-OS treats scrapMem as a fire-and-forget scratch cell.

### Are there nested call chains?

**Yes.** The 0x001Bxx cluster reads scrapMem bytes that were written by a caller earlier in the chain (likely 0x001A33). If any function in between the write at 0x001A33 and the reads at 0x001Bxx also uses scrapMem for its own purposes, the original value would be lost.

However, the TI-OS calling convention appears to assume scrapMem is **caller-saved** — each function that needs it writes its own value immediately before reading it back. No function relies on scrapMem being preserved across a CALL.

The one exception is the 0x001Bxx block which reads without a preceding local write. This implies the 0x001A33 → 0x001Bxx path has no intermediate scrapMem users, or the caller guarantees this.

### Transpiler implications

For the browser-shell transpilation:
1. scrapMem access does not need special handling — it is ordinary RAM read/write.
2. No need to add DI/EI emulation around scrapMem.
3. The single-threaded JS execution model naturally prevents ISR clobbering (our timer IRQ is synchronous).
4. The 0x001Bxx stale-read pattern works correctly because JS is single-threaded.

## Probe

Run `node TI-84_Plus_CE/probe-phase314-scrapmem.mjs` to reproduce these findings from the raw ROM binary.
