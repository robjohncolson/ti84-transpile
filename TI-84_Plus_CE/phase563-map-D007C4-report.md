# Phase 563: ROM Reference Map for D007C4-D007C9 (Cursor-Save Bytes)

## Overview

Scanned the full 4MB ROM for all 3-byte little-endian references to D007C4-D007C9.
These 6 bytes sit immediately before D007CA (cxMain context handler table start)
and are saved/restored by the scroll setup routine at 0x0A2802.

## Hit Counts

| Address | Reads | Writes | Total | Notes |
|---------|-------|--------|-------|-------|
| D007C4  |   2   |   1    |   3   | Saved/restored as 24-bit via LD (nn),HL / LD HL,(nn) |
| D007C5  |   0   |   0    |   0   | Part of D007C4 24-bit word (middle byte) |
| D007C6  |   0   |   0    |   0   | Part of D007C4 24-bit word (high byte) |
| D007C7  |   2   |   3    |   5   | Most active single byte |
| D007C8  |   2   |   2    |   4   | |
| D007C9  |   1   |   2    |   3   | |

**Total real references: 15** (0 false positives)

## Subsystem Breakdown

| Subsystem | Count | Address Range |
|-----------|-------|---------------|
| OS_DISPLAY (0x0Axxxx) | 8 | Display/text rendering |
| OS_DISPLAY_HIGH (0x0Bxxxx) | 4 | Display high-level (cursor save) |
| OS_MATH/FPU (0x08xxxx) | 3 | OS core / math |

## Detailed Reference Map

### D007C4-D007C6: curSavePos (24-bit cursor position pointer)

Written as a 24-bit word via `LD (nn),HL` — stores the curPos pointer (D00595).
Read back as byte via `LD A,(nn)` and written to D00595.

| Offset | Subsystem | Instruction | Context |
|--------|-----------|-------------|---------|
| 0x0866AC | OS_MATH/FPU | LD A,(D007C4) | Reads saved byte, stores to D00595 |
| 0x0A29CA | OS_DISPLAY | LD A,(D007C4) | Reads saved byte, stores to D00595, then CALL 0x0A237E |
| 0x0BA5E9 | OS_DISPLAY_HIGH | LD (D007C4),HL | Saves HL from (D00595) — full 24-bit curPos save |

**Semantic**: D007C4 = **curSaveRow** (low byte of saved cursor position from D00595=curRow)

### D007C7: curSaveWinTop (saved window-top / text page indicator)

Mirrors D02504 (text page / window top). Written in 3 places, read in 2.

| Offset | Subsystem | Instruction | Context |
|--------|-----------|-------------|---------|
| 0x084E25 | OS_MATH/FPU | LD (D007C7),A | Saves A from D02504 |
| 0x0A280F | OS_DISPLAY | LD (D007C7),A | Saves A from D02504 (scroll setup) |
| 0x0BA5F1 | OS_DISPLAY_HIGH | LD (D007C7),A | Saves A from D02504 (cursor save routine) |
| 0x0A2859 | OS_DISPLAY | LD A,(D007C7) | Restores to D02504 (scroll restore) |
| 0x0A29BA | OS_DISPLAY | LD A,(D007C7) | Restores to D02504 |

**Semantic**: D007C7 = **curSaveWinTop** (saved D02504 text window top line)

### D007C8: curSaveScroll (saved scroll state from D00092)

Mirrors D00092 (scroll flags / cursor mode byte).

| Offset | Subsystem | Instruction | Context |
|--------|-----------|-------------|---------|
| 0x0A2817 | OS_DISPLAY | LD (D007C8),A | Saves A from D00092 |
| 0x0BA5F9 | OS_DISPLAY_HIGH | LD (D007C8),A | Saves A from D00092 |
| 0x08629F | OS_MATH/FPU | LD A,(D007C8) | Restores to D00092 |
| 0x0A29A5 | OS_DISPLAY | LD A,(D007C8) | Restores to D00092 |

**Semantic**: D007C8 = **curSaveScrollFlags** (saved D00092 scroll/cursor mode)

### D007C9: curSaveFlags (saved display flags, bit 4 from D00085)

Written as `A & 0x10` from D00085 (display control flags), restored with OR into D00085.

| Offset | Subsystem | Instruction | Context |
|--------|-----------|-------------|---------|
| 0x0A2821 | OS_DISPLAY | LD (D007C9),A | Saves (D00085 AND 0x10) |
| 0x0BA603 | OS_DISPLAY_HIGH | LD (D007C9),A | Saves (D00085 AND 0x10) |
| 0x0A29AD | OS_DISPLAY | LD A,(D007C9) | Restores: AND 0xEF, OR into (D00085) |

**Semantic**: D007C9 = **curSaveDispBit4** (saved bit 4 of D00085 display control)

## Proposed Semantic Names

| Address | Name | Size | Mirrors |
|---------|------|------|---------|
| D007C4 | curSavePos | 3 bytes (24-bit) | D00595 (curRow/curCol pointer) |
| D007C7 | curSaveWinTop | 1 byte | D02504 (text window top) |
| D007C8 | curSaveScrollFlags | 1 byte | D00092 (scroll/cursor mode) |
| D007C9 | curSaveDispBit4 | 1 byte | D00085 bit 4 (display control) |

## Key Findings

1. **D007C4 is a 24-bit pointer save** — not 3 independent bytes. D007C5 and D007C6 are the middle and high bytes written via `LD (D007C4),HL`. This stores the full cursor position pointer.

2. **Three save routines exist**:
   - 0x0A280F (scroll setup at 0x0A2802) — saves all 4 fields
   - 0x0BA5E9 (cursor save in OS_DISPLAY_HIGH) — saves all 4 fields (identical sequence)
   - 0x084E25 (OS core) — saves only D007C7

3. **Two restore paths**:
   - 0x0A2859 (scroll restore) — restores D007C7 only
   - 0x0A29A5-0x0A29CA (full restore) — restores all 4 fields back to their mirrors

4. **The 6 bytes are really 4 logical fields**: one 24-bit pointer + three 8-bit flag saves.

5. **No LITERAL references** — no code loads these addresses into registers for indirect access. All access is direct LD A,(nn) / LD (nn),A / LD (nn),HL.