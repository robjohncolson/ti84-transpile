# Phase 202f: LCD Re-initialization Routine Map

**Date**: 2026-04-20 (updated with full ADL-mode analysis)
**ROM region**: 0x005BB1 - 0x0060F6 (full routine including SPI tail)
**Mode**: ADL (24-bit) primary analysis; z80 overlay noted
**LCD controller base**: 0xF80000 (PL111-compatible)
**Prior context**: [phase202c-lcd-init-report.md](./phase202c-lcd-init-report.md), [phase202e-upbase-writer-scan-report.md](./phase202e-upbase-writer-scan-report.md)

## Key Finding: LCD Controller at 0xF80000

The TI-84 Plus CE maps its PL111 LCD controller at **0xF80000**, not 0xE00000 as previously assumed. This is confirmed by direct memory-mapped register writes throughout this routine. The PL111 register offsets match the standard ARM PL111 specification:

| Address    | PL111 Offset | Register Name  | Purpose                          |
|------------|-------------|----------------|----------------------------------|
| 0xF80000   | +0x00       | LCDTiming0     | Horizontal timing                |
| 0xF80004   | +0x04       | LCDTiming1     | Vertical timing                  |
| 0xF80008   | +0x08       | LCDTiming2     | Clock and signal polarity        |
| 0xF80010   | +0x10       | LCDUPbase      | Upper panel base address         |
| 0xF80014   | +0x14       | LCDLPbase      | Lower panel base (read here)     |
| 0xF80018   | +0x18       | LCDControl     | (not directly written in this routine) |

## Callers

- **0x00190B** (post-OS-init): calls 0x005BB1 after OS data structures are ready
- **0x000384** (reset vector): calls 0x005BB1 as part of hardware cold-boot

## Routine Boundaries

| Boundary     | Address  | Evidence                                         |
|--------------|----------|--------------------------------------------------|
| Preceding routine | 0x005B96-0x005BB0 | Ends with `ret` at 0x005BB0; separate VRAM fill |
| **Entry**    | 0x005BB1 | Called from 0x00190B and 0x000384                |
| LCD reg init | 0x005BC9 | PL111 timing register programming               |
| SPI panel init | 0x005C44 | Port 0x50xx/0x40xx SPI command sequence        |
| Post-SPI     | 0x005CF1 | Port config and power sequencing                 |
| Extended SPI | 0x005D35 | Second SPI sequence (port 0xD0xx)                |
| SPI tail     | 0x005D7A-0x005F88 | SPI commands via call 0x0060F7/0x0060FA      |
| JP to tail   | 0x005F88 | `jp 0x006094`                                    |
| Tail + ret   | 0x006094-0x0060F6 | Final polling/return logic                   |
| **End**      | 0x0060F6 | `ret` instruction                                |

The full routine spans **0x005BB1 to 0x0060F6** (~1350 bytes).

## Routine Structure (4 major sections)

1. **0x005BB1-0x005C40**: Preamble and PL111 register setup
2. **0x005C44-0x005CF0**: SPI port sequencing (port 0x50xx, 0x40xx)
3. **0x005CF1-0x005F88**: Power sequencing + extended SPI commands (port 0xD0xx, bit-banged via 0xD018)
4. **0x005F8C-0x0060F6**: SPI tail commands and return

---

## Section 1: PL111 Register Setup (0x005BB1-0x005C40)

### block_005bb1_adl (ENTRY POINT)

```
ld iy, 0xD00080          ; IY = OS flags base
res 7, (iy+66)           ; Clear flag bit 7 at (IY+0x42)
in0 a, (0x03)            ; Read port 0x03 (clock/power status)
bit 4, a                 ; Test bit 4
jp z, 0x005C44           ; If bit 4 = 0, skip LCD register init -> SPI panel init
; fall through to 0x005BC3
```

**Decision point**: Bit 4 of port 0x03 determines whether PL111 timing registers need programming. If zero (LCD controller already initialized or not present?), skip directly to SPI panel commands.

### block_005bc3_adl (Delay call)

```
call 0x0158DE            ; Hardware settle delay, returns Z flag
; returns to 0x005BC7
jr z, 0x005C44           ; If delay indicates skip, go to SPI section
; fall through to 0x005BC9
```

### block_005bc9_adl (Main LCD register programming - FIRST PASS)

```
ld hl, 0x02000B
ld (0xF80004), hl         ; LCDTiming1 = 0x02000B
ld hl, 0x001828
ld (0xF80000), hl         ; LCDTiming0 = 0x001828
ld hl, 0x00000C
ld (0xF80008), hl         ; LCDTiming2 = 0x00000C (step 1)
nop
ld hl, 0x000040
ld (0xF80008), hl         ; LCDTiming2 = 0x000040 (step 2 - overwrite)
in0 a, (0x0A)             ; Read port 0x0A
set 2, a                  ; Set bit 2
out0 (0x0A), a            ; Enable LCD clock
call 0x015AEC             ; Further init subroutine
; returns to 0x005BF6
```

**First-pass register writes**:

| Step | Register       | Address  | Value      |
|------|----------------|----------|------------|
| 1    | LCDTiming1     | 0xF80004 | 0x02000B   |
| 2    | LCDTiming0     | 0xF80000 | 0x001828   |
| 3a   | LCDTiming2     | 0xF80008 | 0x00000C   |
| 3b   | LCDTiming2     | 0xF80008 | 0x000040   |

### block_005bf6_adl (Port I/O + triple delay)

```
in0 a, (0x07)             ; Read port 0x07
set 4, a                  ; Set bit 4
out0 (0x07), a            ; Write port 0x07 (backlight/power)
ld a, (0xF9000C)          ; Read MMIO at 0xF9000C
res 6, a                  ; Clear bit 6
ld (0xF9000C), a          ; Write back
call 0x0061C2             ; Delay #1 (checks port 0x03 bit 4)
call 0x0061C2             ; Delay #2
call 0x0061C2             ; Delay #3
; falls through to 0x005C14
```

### block_005c14_adl (LCD register programming - SECOND PASS + upbase write)

```
ld hl, 0x00182B
ld (0xF80000), hl         ; LCDTiming0 = 0x00182B (updated from 0x1828)
ld hl, 0x00000C
ld (0xF80008), hl         ; LCDTiming2 = 0x00000C (step 1)
nop
ld hl, 0x000040
ld (0xF80008), hl         ; LCDTiming2 = 0x000040 (step 2)
nop; nop; nop
ld hl, 0x000021
ld (0xF80010), hl         ; *** LCDUPbase = 0x000021 ***
ld hl, 0x000100
ld (0xF80008), hl         ; LCDTiming2 = 0x000100 (final value)
ld a, (0xF80014)          ; Read LCDLPbase
; falls through to 0x005C44
```

**Second-pass register writes**:

| Step | Register       | Address  | Value      | Notes                        |
|------|----------------|----------|------------|------------------------------|
| 1    | LCDTiming0     | 0xF80000 | 0x00182B   | Changed from 0x1828          |
| 2a   | LCDTiming2     | 0xF80008 | 0x00000C   | Same two-step pattern        |
| 2b   | LCDTiming2     | 0xF80008 | 0x000040   |                              |
| 3    | **LCDUPbase**  | 0xF80010 | **0x000021** | NOT a VRAM address (see below) |
| 4    | LCDTiming2     | 0xF80008 | 0x000100   | Final polarity config        |
| 5    | LCDLPbase      | 0xF80014 | (read)     |                              |

### Analysis: The 0x000021 UPbase Write

The value 0x000021 written to LCDUPbase (0xF80010) is **NOT a VRAM address**. VRAM on the TI-84 Plus CE is at 0xD40000 (256KB). The value 0x000021 is far too small to be a valid framebuffer pointer.

This is an **LCD control/configuration value**, likely encoding:
- Bit 5 (0x20) = LCD power enable or dual-panel mode
- Bit 0 (0x01) = LCD enable
- Or: a PL111 LCDControl-like value temporarily written to the UPbase register during init sequencing

The actual VRAM base address (0xD40000) is written to LCDUPbase later in the OS, after the LCD panel SPI init completes and the framebuffer is ready.

---

## Section 2: SPI Panel Init (0x005C44-0x005CF0)

### block_005c44_adl (SPI preamble)

```
ld a, 0x03
out0 (0x00), a            ; Port 0x00 = 0x03 (SPI mode select)
ld bc, 0x00500C            ; B=0x50, C=0x0C
in a, (c)                 ; Read port 0x500C
set 4, a                  ; Set bit 4
out (c), a                ; Write port 0x500C (SPI chip select assert)
; SANITY CHECK: cp B, 0x50 -> RST 0x08 if wrong
; SANITY CHECK: cp C, 0x0C -> RST 0x08 if wrong
```

### Port 0x5004 init (0x005C5E)

```
ld c, 0x04                ; Switch to port 0x5004
in a, (c)                 ; Read port 0x5004
set 4, a                  ; Set bit 4
out (c), a                ; Write (second chip select)
; SANITY CHECK: B=0x50, C=0x04
```

### SPI command sequence via port 0x4000-0x4019 (0x005C71-0x005CF0)

BC is loaded to 0x004000 and C is incremented to write sequential port addresses. Each group is followed by a B=0x40 sanity check (RST 0x08 = error trap if corrupted).

| Port    | Value | C after |
|---------|-------|---------|
| 0x4000  | 0x38  | 0x00    |
| 0x4001  | 0x03  | 0x01    |
| *verify B=0x40* | | |
| 0x4002  | 0x0A  | 0x02    |
| 0x4003  | 0x1F  | 0x03    |
| 0x4004  | 0x3F  | 0x04    |
| *verify B=0x40* | | |
| 0x4005  | 0x09  | 0x05    |
| 0x4006  | 0x02  | 0x06    |
| 0x4007  | 0x04  | 0x07    |
| *verify B=0x40* | | |
| 0x4008  | 0x02  | 0x08    |
| 0x4009  | 0x78  | 0x09    |
| 0x400A  | 0xEF  | 0x0A    |
| 0x400B  | 0x00  | 0x0B    |
| *verify B=0x40* | | |
| 0x4010  | 0x00  | 0x10 (jump) |
| 0x4011  | 0x00  | 0x11    |
| 0x4012  | 0xD4  | 0x12    |
| *verify B=0x40* | | |
| 0x4019  | 0x09  | 0x19 (jump) |
| 0x4018  | 0x2D  | 0x18 (dec) |
| *verify B=0x40, C=0x18* | | |

---

## Section 3: Post-SPI Power Sequencing (0x005CF1-0x005D7A+)

### block_005cf1_adl (Port 0x07 + conditional backlight)

```
in0 a, (0x07)             ; Read port 0x07
set 2, a                  ; Set bit 2
out0 (0x07), a            ; Write port 0x07
in0 a, (0x03)             ; Read port 0x03
bit 4, a                  ; Test bit 4
jr z, 0x005D0D            ; If zero -> skip conditional logic
```

### block_005d00_adl (Conditional backlight path)

```
bit 7, (iy+66)            ; Test (IY+0x42) bit 7
jr z, 0x005D0D            ; If zero -> common path
in0 a, (0x09)             ; Read port 0x09
and 0xEF                  ; Clear bit 4
jr 0x005D10               ; Jump to common set-bit-2 path
```

### block_005d0d_adl - block_005d27_adl (Power sequencing)

```
in0 a, (0x09)             ; Read port 0x09
set 2, a                  ; Set bit 2
out0 (0x09), a            ; Write port 0x09
call 0x0061E3             ; Delay (A=1)
in0 a, (0x09)             ; Read port 0x09
res 2, a                  ; Clear bit 2
out0 (0x09), a            ; Write port 0x09
ld a, 0x05
call 0x0061E5             ; Parameterized delay (A=5)
in0 a, (0x09)             ; Read port 0x09
set 2, a                  ; Set bit 2
out0 (0x09), a            ; Write port 0x09
ld a, 0x0C
call 0x0061E5             ; Parameterized delay (A=0x0C)
```

### Extended SPI via port 0xD000-0xD019 (0x005D35-0x005D7A+)

Second SPI command sequence targeting port base 0xD0xx:

| Port    | Value | Notes                          |
|---------|-------|--------------------------------|
| 0xD006  | 0x02  | *verify B=0xD0*                |
| 0xD001  | 0x18  |                                |
| 0xD000  | 0x0B  | *verify B=0xD0*                |
| 0xD004  | 0x0B  |                                |
| 0xD005  | 0x00  | (xor a)                        |
| 0xD008  | 0x0C  | *verify B=0xD0, C=0x08*        |
| 0xD009  | 0x01  | *verify B=0xD0*                |

Then continues with SPI writes through helpers at 0x0060F7 and 0x0060FA.

---

## Section 4: SPI Tail (0x005D7A-0x0060F6)

From 0x005D7A onwards, the routine sends LCD panel commands via two SPI byte-send subroutines:
- **0x0060F7** (`spi_send_cmd`): OR A clears carry flag = command mode, then bit-bangs byte via port 0xD018
- **0x0060FA** (`spi_send_data`): SCF sets carry flag = data mode, then bit-bangs byte via port 0xD018

These helpers rotate the byte left 3 bits at a time and output 3 nibbles to port 0xD018 (bit-banged SPI). The routine at 0x005F88 jumps to 0x006094 for final cleanup, ending with `ret` at **0x0060F6**.

---

## Helper Subroutines

| Address  | Name           | Purpose                                           |
|----------|----------------|---------------------------------------------------|
| 0x0158DE | delay_0158de   | Hardware settle delay, returns Z flag              |
| 0x015AEC | init_015aec    | Unknown init (called after timing reg setup)       |
| 0x0061C2 | delay_0061c2   | Timed delay: pushes DE/HL, checks port 0x03 bit 4 |
| 0x0061E3 | delay_0061e3   | Short delay with A=1                               |
| 0x0061E5 | delay_0061e5   | Parameterized delay (A = count)                    |
| 0x0060F7 | spi_send_cmd   | SPI byte send (OR A = command, carry clear)        |
| 0x0060FA | spi_send_data  | SPI byte send (SCF = data, carry set)              |

## Port I/O Summary

| Port           | Direction | Purpose                                    |
|----------------|-----------|--------------------------------------------|
| 0x00           | OUT       | System control (set to 0x03)               |
| 0x03           | IN        | Clock/power status (bit 4 = LCD present)   |
| 0x07           | IN/OUT    | Power control (bit 4 = backlight?, bit 2)  |
| 0x09           | IN/OUT    | Power sequencing (bit 2 toggle, bit 4)     |
| 0x0A           | IN/OUT    | LCD clock enable (bit 2)                   |
| 0x500C         | IN/OUT    | SPI chip select #1 (bit 4)                 |
| 0x5004         | IN/OUT    | SPI chip select #2 (bit 4)                 |
| 0x4000-0x4019  | OUT       | LCD panel SPI registers (first sequence)   |
| 0xD000-0xD019  | OUT       | LCD panel SPI registers (second sequence)  |
| 0xD018         | OUT       | Bit-banged SPI data out (via 0x0060F7/FA)  |
| 0xF9000C       | R/W       | Unknown MMIO (bit 6 cleared during init)   |

## Mode Overlay Note

This byte range is mode-overloaded. The same bytes decode differently in z80 mode vs ADL mode:

- In **ADL mode**: 24-bit addresses like `ld (0xF80010), hl` store to PL111 MMIO registers
- In **z80 mode**: the same bytes decode as 16-bit stores like `ld (0x0010), hl` where MBASE maps to the LCD register space

The `0xF8` bytes that are the high bytes of 24-bit ADL immediates decode as `ret m` in z80 mode, creating apparent return instructions inside what is actually a straight-line setup sequence.

## Transpiler Seed Audit

All blocks in the investigated range (0x005BB1-0x005D7A and beyond through 0x0060F6) are present in the transpiled JS. No missing seed addresses were found.

Confirmed present in transpiled JS:
- Entry: block_005bb1_adl through block_005bf6_adl
- LCD reg init: block_005c14_adl (contains the 0x005C34 upbase write)
- SPI panel: block_005c44_adl through block_005cec_adl
- Power seq: block_005cf1_adl through block_005d1e_adl
- Extended SPI: block_005d35_adl through block_005d7a_adl
- Helpers: block_0060f7_adl, block_0060fa_adl, block_0060f6_adl, block_0061c2_adl, block_0061e3_adl, block_0061e5_adl

Subroutine targets verified present:
- 0x0158DE, 0x015AEC, 0x0061C2, 0x0061E3, 0x0061E5, 0x0060F7, 0x0060FA

**New seed addresses needed: none.**

## Summary

1. The LCD re-init routine at 0x005BB1 spans to 0x0060F6 (~1350 bytes) and is a comprehensive LCD hardware initialization that programs PL111 timing registers AND sends SPI commands to the physical LCD panel controller.
2. The LCD controller base is definitively at **0xF80000** (not 0xE00000).
3. The 0x000021 value written to LCDUPbase is an **LCD control value, NOT a VRAM address**. The real VRAM base (0xD40000) is written to LCDUPbase elsewhere in the OS.
4. The routine has four major sections: (a) PL111 register programming (0x005BC9-0x005C40), (b) SPI panel init via ports 0x50xx/0x40xx (0x005C44-0x005CF0), (c) power sequencing + extended SPI via port 0xD0xx (0x005CF1-0x005F88), and (d) SPI tail + return (0x005F8C-0x0060F6).
5. Port 0x03 bit 4 is the key decision point -- it determines whether PL111 timing registers need reprogramming.
6. All blocks in the investigated range are present in the transpiled JS. No new seed addresses needed.
7. The PL111 timing register write uses a two-pass pattern: first pass writes initial values, then after three delay calls, second pass writes slightly adjusted values (LCDTiming0 changes from 0x1828 to 0x182B).
