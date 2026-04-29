# Phase 130 — Edit Buffer Integration Report

**Date**: 2026-04-29  
**Probe**: `probe-phase130-edit-buffer.mjs`  
**Predecessor**: Phase 129 (edit buffer system mapped)

---

## Task 1: CreateNumEditBuf (0x096E09)

**Result**: RETURNED in 259 steps, but did NOT initialize the main gap-buffer pointers.

- editTop, editCursor, editTail, editBtm all remain 0x000000 after the call.
- editSym was set to 0xFFFFF7 (likely garbage/uninitialized pointer).
- editDat remains 0x000000.

**Analysis**: CreateNumEditBuf (0x096E09) appears to be a higher-level routine that calls several subroutines (0x09747C, 0x061DEF RST, 0x082438, 0x061E20, 0x0970AB) but does not directly set editTop/editCursor/editTail/editBtm. It may rely on a pre-existing buffer allocation, or it may initialize a different kind of edit buffer (e.g., numeric input field) that uses different state variables. The routine completed without stalling, suggesting it ran its expected code path but the gap-buffer pointers are set by a different init path (possibly through the home-screen context setup that we can't reach due to the MMIO busy-wait).

---

## Task 2: BufInsert (0x05E2A0) — with manual buffer

Since CreateNumEditBuf failed to init pointers, the fallback manual gap-buffer was used:
- editTop = 0xD00A00
- editCursor = 0xD00A00 (empty)
- editTail = 0xD00AFF (gap fills entire 255-byte region)
- editBtm = 0xD00AFF

**Result**: ALL 3 BufInsert calls RETURNED (12 steps each). Cursor advanced consistently.

| Token | Label | Steps | Cursor Before | Cursor After | Delta |
|-------|-------|-------|---------------|--------------|-------|
| 0x32  | '2'   | 12    | 0xD00A00      | 0xD00A02     | +2    |
| 0x70  | '+'   | 12    | 0xD00A02      | 0xD00A04     | +2    |
| 0x33  | '3'   | 12    | 0xD00A04      | 0xD00A06     | +2    |

**KEY FINDING — Cursor advances by 2 per single-byte token**, not 1. This is unexpected for a gap buffer storing single-byte tokens. The BufInsert disassembly shows:

1. PUSH DE, CALL room-check (0x05E3D6), POP BC
2. RET Z if no room
3. Check B (high byte of token): if B=0 → single-byte path (JR Z to 0x05E2B7)
4. Single-byte path: `LD (HL),C; INC HL; LD (0xD0243A),HL` — stores C at (HL), increments, updates editCursor

The +2 advancement suggests the room-check subroutine at 0x05E3D6 may also modify HL/editCursor, or the initial HL load reads editCursor and adds an offset. This needs further disassembly of 0x05E3D6.

**Buffer contents after 3 inserts**: `A8 81 0A FF 0A FF` (6 bytes from editTop to editCursor).

The bytes do NOT match the expected token sequence (0x32, 0x70, 0x33). The data `0A FF` repeats — `0x0AFF` is suspiciously close to `0xD00AFF` (editTail/editBtm low bytes). This suggests BufInsert may be writing pointer metadata rather than raw token bytes, or the room-check modifies buffer state in a way that corrupts the token write location.

**Hypothesis**: The room check at 0x05E3D6 likely reads editCursor into HL, then checks `editTail - editCursor >= needed_bytes`. If the gap is large enough, it may set HL to the correct write position. The +2 per token could indicate:
- Tokens are stored with a 1-byte length prefix (length + token = 2 bytes)
- Or the room check returns HL pointing 1 byte past editCursor
- Or there's an endianness/addressing issue with our manual buffer seed

**Next step**: Disassemble 0x05E3D6 (room check) in detail to understand the HL setup before the `LD (HL),C` instruction.

---

## Task 3: BufClr (0x0ADAC3)

**Result**: RETURNED in 351 steps, but did NOT reset editCursor to editTop.

- Before: editTop=0xD00A00, editCursor=0xD00A06
- After:  editTop=0xD00A00, editCursor=0xD00A06 (no change)

**Analysis**: BufClr (0x0ADAC3) ran for 351 steps and returned, but had no effect on the buffer pointers. Session 129 noted the same behavior: "returned 351 steps but didn't init pointers — needs pre-initialized buffer." BufClr likely operates on a different buffer concept (e.g., clearing the display edit line, resetting IY flags) rather than directly manipulating the gap-buffer pointers. The actual buffer-clearing may be done by setting editCursor = editTop and editTail = editBtm directly, which is what the OS does during context initialization rather than through BufClr.

---

## Task 5: ParseInp from Edit Buffer

**Result**: STALLED at PC=0x000000 after 37 steps. Missing block at 0x58C35B (known stack/IX corruption pattern).

ParseInp was given:
- begPC/curPC = 0xD00A00 (editTop)
- endPC = 0xD00A0D
- Token stream: `A8 81 0A FF 0A FF D8 5C 0A FF 0A FF 3F`

The token stream is garbage (buffer contents from BufInsert are not valid tokens), so ParseInp cannot parse it. The 0x58C35B missing block is the same crash seen in session 73 — it indicates stack corruption from an invalid code path.

**OP1**: All zeros (no result computed).

---

## Summary of Findings

| Test | Status | Key Finding |
|------|--------|-------------|
| CreateNumEditBuf | Returned, no pointer init | Does not set editTop/editCursor/editTail/editBtm |
| Manual buffer init | Used as fallback | editTop=0xD00A00, gap buffer manually seeded |
| BufInsert ×3 | All returned (12 steps each) | Cursor advances +2 per single-byte token; buffer data ≠ expected tokens |
| BufClr | Returned, no cursor reset | Does not modify gap-buffer pointers |
| ParseInp | Stalled (garbage tokens) | Cannot parse — buffer contains wrong data |

## Root Cause

BufInsert runs and returns successfully, but the data written to the buffer is not the raw token bytes. The cursor advances by 2 per token instead of 1. The room-check subroutine at 0x05E3D6 likely sets up HL in a way we don't fully understand yet, possibly writing to a different offset or including metadata bytes.

## Next Steps

1. **Disassemble 0x05E3D6** (BufInsert room check) — understand how it sets HL before the `LD (HL),C` write instruction. This will reveal why cursor advances by 2 and why the written data doesn't match tokens.
2. **Check if BufInsert uses editCursor directly** or derives the write address from another pointer (editDat?).
3. **Try reading buffer at editTop+1 positions** — tokens might be at odd offsets if there's a metadata byte at even positions.
4. **Investigate the actual OS edit-buffer init path** — the home-screen context setup (which we can't reach due to MMIO stall) likely calls a different init routine than CreateNumEditBuf. Consider tracing what pointers the OS sets before reaching the home handler.
5. **Alternative approach**: Skip the edit buffer entirely for expression evaluation. The direct ParseInp approach (manually seeding begPC/curPC/endPC with a token array in RAM) already works perfectly (session 84+). The edit buffer is primarily needed for the interactive home-screen experience, not for headless evaluation.
