# Phase 562: Decode 0x0A237E - TEXT BUFFER POINTER CALCULATOR

## Summary

**0x0A237E** is a 32-byte utility function that computes a pointer into the OS text buffer at D006C0. It is NOT an alternate glyph rendering path - it is a **text buffer address calculator** used to find the memory location for a given (row, column) position.

**Rating: 3.5 stars** (small utility, fully decoded, clear purpose)

## Annotated Disassembly

### Function 0x0A237E - TEXT BUFFER POINTER (32 bytes)

```
0a237e  f5              PUSH AF              ; save registers
0a237f  c5              PUSH BC
0a2380  d5              PUSH DE
0a2381  3a 95 05 d0     LD A, (0xD00595)     ; A = row/column-limit (max columns per row)
0a2385  cd 37 2a 0a     CALL 0x0A2A37        ; compute row offset -> HL (row * width)
0a2389  e5              PUSH HL              ; BC = row offset
0a238a  c1              POP BC
0a238b  3a 96 05 d0     LD A, (0xD00596)     ; A = current column index
0a238f  21 00 00 00     LD HL, 0x000000      ; HL = 0
0a2393  6f              LD L, A              ; HL = column (zero-extended)
0a2394  11 c0 06 d0     LD DE, 0xD006C0      ; DE = text buffer base
0a2398  19              ADD HL, DE           ; HL = D006C0 + column
0a2399  09              ADD HL, BC           ; HL = D006C0 + column + row_offset
0a239a  d1              POP DE               ; restore registers
0a239b  c1              POP BC
0a239c  f1              POP AF
0a239d  c9              RET                  ; return pointer in HL
```

**Semantics**: `HL = D006C0 + column + row_offset(D00595)`

The function computes: `text_buffer_base + current_column + row_pitch_offset`

### Adjacent Function 0x0A239E - CLEAR RENDER FLAGS (12 bytes)

```
0a239e  cd ab 23 0a     CALL 0x0A23AB        ; call the pre-render entry
0a23a2  fd cb 32 b6     RES 6, (IY+0x32)     ; clear IY+0x32 bit 6
0a23a6  fd cb 32 96     RES 2, (IY+0x32)     ; clear IY+0x32 bit 2
0a23aa  c9              RET
```

This is a wrapper that performs rendering (via 0x0A23AB) then clears two flags in IY+0x32 (offset 0x32 from IY base D00080 = D000B2). Bits 6 and 2 are likely "needs render" / "dirty" flags.

## Relationship to Neighbors

| Address | Function | Relationship |
|---------|----------|-------------|
| 0x0A22DA | SELECT IMMEDIATE VS DEFERRED | Earlier in ROM, unrelated |
| **0x0A237E** | **TEXT BUFFER POINTER** | **This function** |
| 0x0A239E | CLEAR RENDER FLAGS | Separate function, calls 0x0A23AB |
| 0x0A23AB | PRE-RENDER ENTRY | Called by 0x0A239E, flows into 0x0A23C0 |
| 0x0A23C0 | PRE-RENDER SETUP (28B) | MLT glyph offset |
| 0x0A23E5 | BLIT LOOP (~512B) | Main rendering loop |

## Classification

0x0A237E is a **standalone utility function**, not an alternate entry point for the glyph renderer. It:
- Does NOT call or jump to 0x0A23C0 or 0x0A23E5
- Does NOT access VRAM or LCD registers
- Has no IY flag references
- Simply computes a RAM pointer and returns it

It is likely called by the text output system to determine where in the text buffer (D006C0+) to store a character code before rendering.

## CALL/JP Targets

| Type | Target | Description |
|------|--------|-------------|
| CALL | 0x0A2A37 | ROW OFFSET calculator (known from session 560) |

## RAM Addresses

| Address | Usage |
|---------|-------|
| D00595 | Column limit / row width parameter |
| D00596 | Current column index |
| D006C0 | Text buffer base address (computed target) |

## IY Flag References

From 0x0A239E (adjacent function):
- IY+0x32 bit 6: render dirty flag (cleared after render)
- IY+0x32 bit 2: render pending flag (cleared after render)

(IY base = D00080, so IY+0x32 = D000B2)

## Key Insight

The initial hypothesis that 0x0A237E is an "alternate glyph path" was incorrect. It is a **text buffer pointer calculator** - a small utility that maps (row, column) coordinates to a byte address in the text state buffer starting at D006C0. The actual alternate rendering paths begin at 0x0A23AB and 0x0A239E.
