# Phase 563: Decode 0x0A23AB -- Alternate Rendering Entry

## Scope

Decode 0x0A23AB through 0x0A23E4 (58 bytes). This is the "alternate rendering entry" called from 0x0A239E (clear render flags), flowing into 0x0A23C0 (PRE-RENDER SETUP).

## Key Finding: TWO DISTINCT FUNCTIONS

The 58-byte range contains **two separate functions** that do NOT share a linear flow:

### Function 1: 0x0A23AB -- INTERRUPT-SAFE RENDER WRAPPER (21 bytes)

```
0a23ab  PUSH BC                    ; save BC
0a23ac  LD B, A                    ; save char in B
0a23ad  LD A, I                    ; read interrupt state (sets P/V flag)
0a23af  JP PE, 0x0A23B5           ; if interrupts were enabled, skip redundant read
0a23b3  LD A, I                    ; re-read (interrupt edge case workaround)
0a23b5  PUSH AF                    ; save interrupt state on stack
0a23b6  LD A, B                    ; restore char from B
0a23b7  DI                         ; disable interrupts
0a23b8  EXX                        ; switch to alternate register set
0a23b9  PUSH HL                    ; save HL'
0a23ba  PUSH DE                    ; save DE'
0a23bb  PUSH BC                    ; save BC'
0a23bc  EXX                        ; switch back to main registers
0a23bd  PUSH HL                    ; save HL (main)
0a23be  JR 0x0A2400               ; jump FORWARD to 0x0A2400 (actual render logic)
```

**Purpose**: This is the interrupt-safe prologue for character rendering. It:
1. Saves the character (in A) into B temporarily
2. Records whether interrupts were enabled (LD A,I sets P/V)
3. Disables interrupts (DI)
4. Saves all alternate registers (HL', DE', BC') and main HL
5. Jumps to 0x0A2400 for the actual render body

The `LD A,I` / `JP PE` / `LD A,I` pattern is a well-known eZ80 idiom to reliably detect whether interrupts were enabled (the P/V flag from `LD A,I` can be corrupted by an interrupt arriving between the instruction and the flag test).

**Note**: This function does NOT fall through into 0x0A23C0. The `JR 0x0A2400` at 0x23BE jumps past the PRE-RENDER SETUP entirely.

### Function 2: 0x0A23C0 -- PRE-RENDER SETUP / GLYPH SIZE SELECT (37 bytes)

```
0a23c0  LD L, A                    ; L = char code (passed in A)
0a23c1  BIT 2, (IY+0x32)          ; test flag at 0xD000B2 bit 2
0a23c5  JR NZ, 0x0A23CD           ; if set -> large font path
0a23c7  BIT 6, (IY+0x32)          ; test flag at 0xD000B2 bit 6
0a23cb  JR Z, 0x0A23DC            ; if clear -> small font path
--- LARGE FONT PATH (bit 2 set OR bit 6 set): ---
0a23cd  LD H, 0x1C                ; H = 28 (large glyph stride)
0a23cf  MLT HL                    ; HL = char * 28 (glyph data offset)
0a23d1  CALL 0x07BF3E             ; glyph data loader (known)
0a23d5  LD HL, 0xD005A4           ; point to render-width variable
0a23d9  LD (HL), 0x0C             ; set render width = 12 pixels
0a23db  RET
--- SMALL FONT PATH (bit 2 clear AND bit 6 clear): ---
0a23dc  LD H, 0x19                ; H = 25 (small glyph stride)
0a23de  MLT HL                    ; HL = char * 25 (glyph data offset)
0a23e0  CALL 0x0A5424             ; alternate glyph loader
0a23e4  RET
```

**Purpose**: Selects font size based on IY+0x32 flags, computes the glyph data offset, and loads glyph data.

## RAM Addresses

| Address | Meaning |
|---------|---------|
| 0xD000B2 | IY+0x32: font/render flags (bit 2 = large font A, bit 6 = large font B) |
| 0xD005A4 | Render width variable (set to 12 for large font) |

## Call Targets

| Address | Type | Label |
|---------|------|-------|
| 0x0A23B5 | JP PE | internal (skip redundant LD A,I) |
| 0x0A2400 | JR | **RENDER BODY** (new target, not previously decoded) |
| 0x0A23CD | JR NZ | large font path (internal) |
| 0x0A23DC | JR Z | small font path (internal) |
| 0x07BF3E | CALL | glyph data loader (known) |
| 0x0A5424 | CALL | alternate glyph loader (new target) |

## IY Flag References

| Offset | Absolute | Bits | Meaning |
|--------|----------|------|---------|
| IY+0x32 | 0xD000B2 | bit 2 | Large font flag A (28-byte glyph stride, 12px width) |
| IY+0x32 | 0xD000B2 | bit 6 | Large font flag B (same path as bit 2) |

## Interpretation

1. **0x0A23AB is NOT a "pre-render setup alternate entry"** -- it is the **interrupt-safe render wrapper** that saves context and jumps to 0x0A2400.

2. **0x0A23C0 is a separate entry point** -- the PRE-RENDER SETUP that selects large vs small font based on IY+0x32 flags. It is called independently (not via fall-through from 0x0A23AB).

3. **Font size selection**:
   - Large: glyph stride = 28 bytes, render width = 12px, loader = 0x07BF3E
   - Small: glyph stride = 25 bytes, render width not explicitly set here, loader = 0x0A5424

4. **New targets for future decoding**:
   - 0x0A2400: The actual render body (jumped to from the interrupt-safe wrapper)
   - 0x0A5424: The small-font glyph loader

## Session 552 Correction

Previous sessions described 0x0A23AB as falling through into 0x0A23C0. This is incorrect -- the `JR 0x0A2400` at offset +0x13 (address 0x0A23BE) jumps past 0x0A23C0 entirely. These are two co-located but independent functions sharing the same address range.
