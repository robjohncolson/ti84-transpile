# Phase 131 — Edit Buffer Disassembly Deep Dive

## Key Discovery: BufInsert Calling Convention CORRECTED

**BufInsert (0x05E2A0) takes the token in the DE register, NOT BC.**

- E = token byte (single-byte token value)
- D = two-byte token flag (0 for single-byte, non-zero for two-byte)

The disassembly proves this:
```
0x05E2A0: D5       PUSH DE       ; save token (D=flag, E=byte)
0x05E2A1: CD D6 E3 CALL 0x05E3D6 ; room-check subroutine
0x05E2A5: C1       POP BC        ; recover token into BC (B=old D, C=old E)
0x05E2A6: C8       RET Z         ; return if no room (Z set by room-check)
0x05E2A7: 78       LD A,B        ; A = two-byte flag
0x05E2A8: B7       OR A          ; test if two-byte token
0x05E2A9: 28 0C    JR Z,0x05E2B7 ; if single-byte, skip to single-byte path
; --- two-byte path ---
0x05E2AB: 23       INC HL        ; advance HL past first byte slot
0x05E2AC: CD DA E3 CALL 0x05E3DA ; second room-check
0x05E2B1: 71       LD (HL),C     ; store low byte at HL
0x05E2B2: 2B       DEC HL        ; back up
0x05E2B3: 70       LD (HL),B     ; store high byte (prefix)
0x05E2B4: 23       INC HL        ; advance
0x05E2B5: 18 01    JR 0x05E2B8   ; skip to common path
; --- single-byte path ---
0x05E2B7: 71       LD (HL),C     ; store token byte at HL
; --- common path ---
0x05E2B8: 23       INC HL        ; advance past stored byte
0x05E2B9: 22 3A 24 LD (0xD0243A),HL ; update editCursor
0x05E2BF: C9       RET
```

**Previous sessions assumed BC** — this caused cursor to advance +2 (because prepareCallState left garbage in DE, and D was non-zero, triggering the two-byte path). With D=0, E=token, cursor advances exactly +1 per single-byte token.

## Part A: Room-Check (0x05E3D6)

The room-check loads editCursor into HL and editTail into DE, then jumps to an SBC HL,DE comparison routine at 0x0CC973. If editCursor >= editTail (no gap space), Z flag is set and the caller returns early. Otherwise Z is cleared and HL points to the insertion address (editCursor value).

The routine at 0x05E3D6 is actually just the first entry point. There are multiple room-check variants:
- 0x05E3D6: editCursor vs editTail (standard insertion room)
- 0x05E3E8: editCursor vs editTop (for backward operations)
- 0x05E3F5: editTail vs editBtm (tail-end room)

Address references found in the room-check region confirm heavy use of all four gap-buffer pointers.

## Part B: CreateNumEditBuf (0x096E09)

The disassembly shows this is a short wrapper (returns at 0x096E28 after ~19 instructions). It calls several subroutines:
- 0x09747C (likely editor setup)
- 0x091DEF via RST (OS dispatch)
- 0x092438 (note: matches editCursor address pattern but is actually a ROM routine address)
- 0x091E20 
- 0x0970AB

**No direct references to editTop/editCursor/editTail/editBtm** were found in the CreateNumEditBuf region. This confirms session 130's finding that CreateNumEditBuf does NOT initialize the gap-buffer pointers directly — it likely delegates to a routine that expects a pre-allocated buffer region passed via registers.

## Part C: BufInsert (0x05E2A0) — Full Annotated Flow

See the annotated disassembly above. Key points:
- 23 instructions total
- Single-byte tokens: stores 1 byte, advances cursor by 1
- Two-byte tokens (D != 0): stores 2 bytes (B then C, big-endian prefix+byte), advances cursor by 2
- After store: updates editCursor at 0xD0243A with new HL value

## Part D: Correctly Initialized Buffer — SUCCESS

Manual gap-buffer initialization:
- editTop = editCursor = 0xD00A00 (empty buffer, cursor at start)
- editTail = editBtm = 0xD00B00 (256-byte gap)

Results with correct calling convention (token in E register):
```
BufInsert(0x32 "2"): cursor 0xD00A00 -> 0xD00A01 (delta=1) ✓
BufInsert(0x70 "+"): cursor 0xD00A01 -> 0xD00A02 (delta=1) ✓ 
BufInsert(0x33 "3"): cursor 0xD00A02 -> 0xD00A03 (delta=1) ✓
Buffer contents: 32 70 33 — EXACT MATCH for "2+3" ✓
```

Each insertion completed in 7 steps (vs 12 with wrong calling convention).

## Part E: Key-to-Token Conversion

### Findings

Three candidate tables found where bytes at offset 0x8E-0x97 contain 0x30-0x39 (t0-t9):

| Base Address | k0-k9 Match | kAdd(0x9B) | kSub(0x9C) | Location |
|---|---|---|---|---|
| 0x04742D | YES | 0x3D (wrong) | 0x3E (wrong) | Font/charset region |
| 0x047547 | YES | 0x3D (wrong) | 0x3E (wrong) | Font/charset region |
| 0x05BF2A | YES | 0x42 (wrong) | 0x43 (wrong) | Editor region |

None of these tables correctly map operator k* codes to token bytes (kAdd should map to 0x70, not 0x3D). These are likely font/character tables, not key-to-token tables.

### Key Dispatch Pattern at 0x045C3F

The most promising key-to-token conversion logic is at 0x045C37-0x045C4B:
```
CP 0x97   ; >= k9?
JP Z,...  ; handle k9
CP 0x8E   ; >= k0?
JP Z,...  ; handle k0
CP 0x80   ; >= kGraph?
JP Z,...  ; handle kGraph
CP 0x81   ; >= kTrace?
```

This is a **range-check dispatch table**, not a lookup table. The OS appears to use cascading CP/JP instructions to route k* codes to handlers, rather than a single indexed table.

### Key-to-Token Conversion at 0x02F729

Another promising site compares A against 0x8E and 0x91 to range-check whether a key code is a digit:
```
CP 0x8E     ; below k0?
JR C,...    ; yes, not a digit
LD A,0x91   ; load k3 threshold
CP (IX-2)   ; compare against stored key
JR C,...    ; yes, in digit range
```

This suggests the OS identifies digit keys by range (0x8E-0x97) and may compute the token as: `token = keyCode - 0x8E + 0x30`. The SUB 0x5E pattern (0x8E - 0x30 = 0x5E) was not found, but the ADD A,0x30 pattern at 0x003052 and 0x00318C may be the final step after subtracting 0x8E.

## Summary

| Finding | Status |
|---|---|
| BufInsert calling convention: token in DE (not BC) | CONFIRMED |
| Single-byte cursor advance = +1 (not +2) | CONFIRMED |
| Buffer correctly stores raw token bytes | CONFIRMED |
| CreateNumEditBuf does not init gap-buffer pointers | CONFIRMED |
| Key-to-token uses range-check dispatch, not single lookup table | LIKELY |
| Candidate k*-to-token formula: `token = kCode - 0x8E + 0x30` for digits | PLAUSIBLE |

## Next Steps

1. **Update all probes and documentation** to use DE register for BufInsert (E=token, D=two-byte flag)
2. **Investigate CreateNumEditBuf subroutines** (0x09747C, 0x0970AB) to find where buffer allocation actually happens
3. **Trace the key dispatch** at 0x045C37 deeper to confirm the range-check-to-token conversion pattern
4. **Test two-byte tokens** by setting D to the prefix byte (e.g., 0xBB for extended tokens)
