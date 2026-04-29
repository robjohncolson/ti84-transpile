# Phase 129 — Graph Subsystem Re-Investigation: IPoint Direct Call

**Date**: 2026-04-29
**Probe**: `probe-phase129-graph-render.mjs`
**Status**: IPoint WORKS — pixels successfully written to plotSScreen with correct seeding

## Key Findings

### 1. IPoint (0x07B451) Successfully Writes Pixels

With **drawMode=1** (normal draw) and **small pixel coordinates** (X=10, Y=10), IPoint correctly:
- Passes the bounds-check at 0x07B793
- Computes the plotSScreen offset (HL=0x1B8E for pixel 10,10)
- Writes a color nibble (0xF0) to plotSScreen[0x1B8E] at address 0xD0AFF4
- Returns normally in 47 steps

**drawMode=2** (XOR/thick mode) also writes pixels successfully (53 steps, 1 byte changed).

### 2. drawMode Semantics Decoded

| drawMode (A register) | Behavior | Pixels Written |
|------------------------|----------|----------------|
| 0 | **Erase** — clears pixel (writes color 0x00) | 0 (no visible change on empty buffer) |
| 1 | **Normal draw** — writes pen color | 1 |
| 2 | **XOR/overlay** — reads existing pixel, composites | 1 |

The OS DECrements drawMode internally. With drawMode=0, after DEC A=-1, the code branches to the erase path at 0x07B635 which writes A=0x00 to 0xD02A60 (pen color temp), resulting in invisible pixels. With drawMode=1, after DEC A=0, the code takes the draw path and uses the actual drawColorCode.

**For graph rendering, the OS calls IPoint with A=1 (draw mode).**

### 3. Bounds-Check at 0x07B793 — `.SIS` 16-bit Reads

The bounds-check uses `.SIS`-prefixed instructions for 16-bit reads:

```
07B793: PUSH AF; PUSH HL
07B795: BIT 2,(IY+2Bh)          ; check graph split flag
07B799: JR NZ, skip_bounds      ; if split mode, skip to alternate check
07B79B: .SIS LD HL,(0x1501)     ; HL = 16-bit read from 0xD01501 (pixWide_m_2 = Y limit)
07B79F: OR A                    ; clear carry
07B7A0: SBC HL,DE               ; HL = Y_limit - Y_pixel
07B7A2: JR C, bail              ; if Y > Y_limit, out of bounds
07B7A4: .SIS LD HL,(0x14FE)     ; HL = 16-bit read from 0xD014FE (pixWideP = X limit)
07B7A8: LD A,C                  ; A = low byte of BC (X pixel)
07B7A9: CP L                    ; compare X_low with X_limit_low
07B7AA: JR NC, bail             ; if X_low >= X_limit_low, out of bounds
07B7AC: POP HL; POP AF; OR A; RET ; success (carry clear)
07B7B0: POP HL; POP AF; SCF; RET  ; fail (carry set)
```

**MBASE is correctly 0xD0** at the bounds-check in all scenarios. The `.SIS` prefix and MBASE compositing work correctly in the transpiler.

**X bounds issue**: The X comparison is only 8-bit (`CP L`), comparing the low byte of the X coordinate against the low byte of pixWideP. With pixWideP=320 (0x0140), L=0x40, so any X >= 64 fails. This means either:
- pixWideP should store a value where the low byte exceeds the max X coordinate (e.g., for graph area width 265 = 0x109, L=0x09)
- Or the real OS uses different coordinate scaling before reaching this check

For this probe, using X=10 bypasses this issue.

### 4. RAM Seeding Requirements for IPoint

| Address | Name | Required Value | Purpose |
|---------|------|----------------|---------|
| 0xD014FE | pixWideP | 16-bit width | X bounds limit (`.SIS` 16-bit read) |
| 0xD01501 | pixWide_m_2 | 16-bit height | Y bounds limit (`.SIS` 16-bit read) |
| 0xD026AE | drawColorCode | 16-bit color | Pen color (read at 0x07B50F) |
| 0xD000B5 | hookflags3 (IY+35h) | bit 7 = 0 | Hook bypass flag |
| 0xD00082 | grfModeFlags (IY+2h) | bit 4 = 1 | Function graph mode |

**Also auto-seeded during IPoint execution:**
- 0xD02AC8: drawMode byte (from A register)
- 0xD02AD4: mode byte (0=point, 1=line)
- 0xD02A60: pen color temp (copied from drawColorCode at 0x07B513)

### 5. Pixel Write Mechanism (0x07B7CC-0x07B7F5)

```
07B7CC: LD C,A           ; C = nibble mask (0xF0 or 0x0F)
07B7CD: LD A,(0xD02A60)  ; A = saved pen color
07B7D1: LD B,A           ; B = pen color
07B7D2: LD DE,0xD09466   ; DE = plotSScreen base
07B7D6: BIT 3,(IY+3Ch)   ; check alternate buffer flag
07B7DA: JR Z, use_main   ; if not set, use main buffer
07B7DC: LD DE,0xD0EA1F   ; else use alternate buffer
07B7E0: ADD HL,DE         ; HL = buffer + pixel offset
07B7E1: LD A,B            ; A = pen color
07B7E2: BIT 7,C           ; check which nibble
07B7E4: JP Z, no_shift    ; if high nibble, no shift needed
07B7E8: SLA A (x4)        ; shift color to high nibble
07B7F0: LD B,A            ; B = shifted color
07B7F1: LD A,(HL)         ; read current pixel byte
07B7F2: OR C              ; set mask bits
07B7F3: XOR C             ; clear mask bits (A = pixel & ~mask)
07B7F4: OR B              ; apply color (A = (pixel & ~mask) | color)
07B7F5: LD (HL),A         ; write pixel byte back
```

The pixel format is 4bpp (4 bits per pixel), with two pixels per byte. The mask (C=0xF0 or 0x0F) selects which nibble, and the color is OR'd into the cleared nibble. plotSScreen (0xD09466, 21945 bytes) uses this packed format: 320 pixels wide / 2 = 160 bytes per row, 240 rows would need 38400 bytes, but the actual buffer is 21945 bytes which covers ~137 rows (the graph viewport height).

### 6. Session 127 ".SIS Hypothesis" Fully Confirmed Resolved

The `.SIS` prefix at 0x07B793 is handled correctly by the transpiler. The bounds-check reads 16-bit values, not 24-bit, and the MBASE compositing produces the correct RAM addresses (0xD01501, 0xD014FE). The previous ".SIS blocker" from session 127 is not a real blocker.

## Scenario Results

| Scenario | Coords | drawMode | Seeded | Steps | Pixels Changed | Result |
|----------|--------|----------|--------|-------|----------------|--------|
| B | 160,120 | 0 | No | 13 | 0 | Bail at bounds (Y > 0) |
| A | 160,120 | 0 | Yes | 14 | 0 | Bail at bounds (X_low >= pixWideP_low) |
| C | 10,10 | 0 | Yes | 48 | 0 | Erase mode (writes 0x00, no visible change) |
| D | 10,10 | 1 | Yes | 47 | 1 | SUCCESS: 0xF0 written to plotSScreen[0x1B8E] |
| E | 10,10 | 2 | Yes | 53 | 1 | SUCCESS: 0xF0 written to plotSScreen[0x1B8E] |

## Execution Flow (Scenario D — Success Path)

```
0x07B451  IPoint entry: LD (0xD02AC8),A (save drawMode=1)
0x07B466  Hook check: BIT 7,(IY+35h) = 0, continue
0x07B46B  Push BC,DE (save pixel coords)
0x07B504  Push HL, check IFF status
0x07B50D  DI, read drawColorCode (0x1F), save to 0xD02A60
0x07B793  Bounds-check: pixWide_m_2=240, X=10, Y=10 — PASS
0x07B51B  Post-bounds: check hookflags3, skip hook call
0x07B541  Check graph split flag (IY+3Ch bit 0)
0x07B54A  Check graph mode flag (IY+2h bit 1)
0x07B556  Call pixel offset calculator at 0x07B75F
0x07B75F  → 0x07B767: compute byte offset in plotSScreen
0x07B778  → 0x07B788: returns nibble mask (0x0F or 0xF0), offset in HL
0x07B55A  Push AF, check graph split flag (IY+2Bh bit 2)
0x07B562  .SIS LD HL,(0x14FC): load pixel width with offset
0x07B57A  Compute scaled coordinates, multiply/add
0x07B591  Continue offset computation
0x07B5B6  Check draw mode counter
0x07B5BC  INC B, DJNZ loop (draw mode processing)
0x07B5C4  DJNZ again
0x07B5C6  JP 0x07B62B (draw path, A=1 → nonzero)
0x07B62B  POP AF, OR A: A=1, NZ → load FG color from (0xD026AC)
0x07B677  DE = drawFGColor = 0x001F (blue)
0x07B682  Load plotSScreen byte address into BC
0x07B688  A = DE_low = 0x1F (pen color)
0x07B694  Compute final pixel address
0x07B7CC  C = mask, A = pen color from (0xD02A60) = 0x1F, B = 0x1F
0x07B7E0  HL = plotSScreen + 0x1B8E = 0xD0AFF4
0x07B7E8  SLA A x4 (shift to high nibble): A = 0xF0
0x07B6A6  Write pixel: LD (HL),A → plotSScreen[0x1B8E] = 0xF0
0x07B6BA  Cleanup, restore registers
0x07B30E  Return path
```

## Next Steps

1. **Fix the X bounds check for larger coordinates**: Investigate what the real OS sets pixWideP to (probably the graph viewport width, not 320), and whether coordinates are in a different scale by the time they reach the bounds check.

2. **Test ILine (0x07B245)**: ILine shares the same core as IPoint but with modeByte=1. Call with A=1, BC=start, DE=end to draw a line.

3. **Build a graph render loop**: Now that IPoint works, build a loop that evaluates Y=X for each X pixel and calls IPoint for each (X, Y) point, seeding the proper graph window parameters.

4. **Investigate the 4bpp format**: plotSScreen uses 4 bits per pixel. The TI-84 CE LCD is 16bpp (RGB565), so there must be a palette lookup or color expansion when copying plotSScreen to the LCD framebuffer. Finding this copy routine is needed for browser display.

## Full Probe Output

```
=== Phase 129: Graph Subsystem Re-Investigation — IPoint Direct Call ===

--- Task 0: IPoint disassembly (0x07B451 - 0x07B500) ---
  0x07B451: 32 C8 2A             ld-mem-reg
  0x07B454: D0                   ret-conditional
  0x07B455: F5                   push
  0x07B456: 3E 00                ld-reg-imm
  0x07B458: 32 D4 2A             ld-mem-reg
  0x07B45B: D0                   ret-conditional
  0x07B45C: F1                   pop
  0x07B45D: F5                   push
  0x07B45E: FD CB 35 7E          indexed-cb-bit
  0x07B462: C4 9E 3A             call-conditional
  0x07B465: 02                   ld-ind-reg
  0x07B466: 28 03                jr-conditional
  0x07B468: F1                   pop
  0x07B469: C9                   ret
  0x07B46A: F5                   push
  0x07B46B: C5                   push
  0x07B46C: D5                   push
  0x07B46D: FD CB 14 6E          indexed-cb-bit
  0x07B471: CA 04 B5             jp-conditional
  0x07B474: 07                   rlca
  0x07B475: 3A BE 24             ld-reg-mem
  0x07B478: D0                   ret-conditional
  0x07B479: FE 01                alu-imm
  0x07B47B: 28 16                jr-conditional
  [... truncated for brevity ...]

--- Bounds-check region disassembly (0x07B780 - 0x07B820) ---
  0x07B793: F5                   push
  0x07B794: E5                   push
  0x07B795: FD CB 2B 56          indexed-cb-bit
  0x07B799: 20 1B                jr-conditional
  0x07B79B: 40 2A 01 15          ld-pair-mem      ; .SIS LD HL,(0x1501) → read16(0xD01501)
  0x07B79F: B7                   alu-reg           ; OR A (clear carry)
  0x07B7A0: ED 52                sbc-pair          ; SBC HL,DE (Y bounds)
  0x07B7A2: 38 0C                jr-conditional    ; JR C,bail
  0x07B7A4: 40 2A FE 14          ld-pair-mem      ; .SIS LD HL,(0x14FE) → read16(0xD014FE)
  0x07B7A8: 79                   ld-reg-reg        ; LD A,C
  0x07B7A9: BD                   alu-reg           ; CP L
  0x07B7AA: 30 04                jr-conditional    ; JR NC,bail
  0x07B7AC: E1                   pop
  0x07B7AD: F1                   pop
  0x07B7AE: B7                   alu-reg           ; OR A (carry=0 = success)
  0x07B7AF: C9                   ret
  0x07B7B0: E1                   pop
  0x07B7B1: F1                   pop
  0x07B7B2: 37                   scf               ; carry=1 = fail
  0x07B7B3: C9                   ret

=== Scenario B: IPoint WITHOUT graph RAM seeding ===
--- Scenario B (unseeded) ---
  Result: returnHit=true steps=13 finalPC=0x7FFFFE
  plotSScreen changed bytes: 0
  MBASE at bounds-check: 0xD0
  Bail reason: Y(120) > pixWide_m_2(0), SBC HL,DE sets carry

=== Scenario A: IPoint WITH fully seeded graph RAM ===
--- Scenario A (seeded) ---
  Result: returnHit=true steps=14 finalPC=0x7FFFFE
  plotSScreen changed bytes: 0
  MBASE at bounds-check: 0xD0
  Bail reason: X_low(0xA0=160) >= pixWideP_low(0x40=64), CP L sets NC

=== Scenario C: drawMode=0 (erase), X=10, Y=10 ===
  Result: returnHit=true steps=48 finalPC=0x7FFFFE
  plotSScreen changed bytes: 0
  Passes bounds check, reaches pixel write, but writes 0x00 (erase mode)

=== Scenario D: drawMode=1 (draw), X=10, Y=10 ===
  Result: returnHit=true steps=47 finalPC=0x7FFFFE
  plotSScreen changed bytes: 1
  SUCCESS: plotSScreen[0x1B8E] = 0xF0 (high nibble colored)

=== Scenario E: drawMode=2 (XOR), X=10, Y=10 ===
  Result: returnHit=true steps=53 finalPC=0x7FFFFE
  plotSScreen changed bytes: 1
  SUCCESS: plotSScreen[0x1B8E] = 0xF0

=== Summary ===
  All scenarios reach bounds-check with MBASE=0xD0 (correct)
  Scenarios D,E write pixels to plotSScreen with drawMode >= 1
  No missing blocks (all PRELIFTED_BLOCKS present for IPoint path)
  IPoint is fully functional with proper RAM seeding and drawMode=1
```
