# Phase 75: Token Helper Hunt (Partial — CC manual)

## Goal

Find the "print token by code" helper that walks the TI-BASIC token table at 0x0a0450 (discovered Phase 74) to render mode names like "Normal", "Float", "Radian" on the home status bar.

## Scan Results

### Direct loads of token-table base addresses

- Searched for `ld hl, 0x0a0440` through `ld hl, 0x0a04f0` — **0 real hits**
- The only hits are `jr nz, 0x0a0452` / `jr nz, 0x0a0461` — **these are spurious**, they're token table bytes being decoded as instructions (the decoder interprets the token data as code)

**Implication**: No code directly loads 0x0a0450 as an HL base. Token table access must be:
- Via an indirect helper accessed by BCALL (rst 0x08)
- Via offset computation from another base
- Via a function that sequentially walks the table from some other anchor

### Mode state RAM reads

170 instructions in the lifted code read from 0xD00080-0xD000FF. Sampling shows the hottest bytes:
- `0xD0008A` — writes: 0x0992ce, 0x0992d2 / 0x058b9b / 0x05b171 — appears to be a counter or temporary
- `0xD00085` — 0x0a281a, 0x05e89c, 0x05e8a2 — likely a display mode flag
- `0xD00092` — 0x0a2812, 0x0a29a8 — another mode byte
- `0xD0008e` — 0x0a654e, 0x058d49, 0x058d4f — likely a flag
- `0xD00081` — 0x0922b2
- `0xD000C6` — 0x052d81, 0x05529b — already known (Phase 71: the flag-check helper at 0x08c308)

Many of these reads are in the 0x0axxxx range (same ROM page as the token table) — **0x0a2812, 0x0a281a, 0x0a29a8, 0x0a654e** look especially interesting because they cluster near the token table base 0x0a0450.

### Blocks with mode-read AND text-call

**Zero blocks** contain both a mode-state read (0xD00080-0xD0008F) AND a text call (0x0a1cac or 0x0059c6) in the same basic block. This means the rendering path is split across multiple blocks — likely:
1. Block A reads mode state → stores in register / RAM temp
2. Block B computes offset into table
3. Block C calls a lookup helper
4. Block D calls char-print

The helper + caller are in SEPARATE functions, which is why a naive single-block scan doesn't find them.

## Next Approaches to Try

### Approach 1: Search for "length-prefixed string walker"

A function that reads `(hl)` for length, then loops `djnz` while printing `(hl+n)` chars is the signature shape. Scan for blocks matching:
```asm
ld b, (hl)        ; or ld a,(hl); ld b,a
inc hl
; followed by a loop with call 0x0059c6 and djnz
```

### Approach 2: Scan for offset-indexed table access in 0x0axxxx

Functions in 0x0a2xxx-0x0a6xxx that read 0xD00080+ RAM variables are mode handlers in the same ROM region as the token table. Pick a few and disassemble forward to see if they call a token-print helper.

### Approach 3: Find BCALL dispatches to 0x0axxxx region

The jump table at 0x020104 dispatches BCALLs. If a slot in the JT targets 0x0a03xx-0x0a05xx, that slot IS the public token-print BCALL. Scan the JT for targets in that range.

### Approach 4: Trace from TEST mode's 0x028f02 backward

Phase 74 found that 0x028f02 is a labeled-item print helper used by TEST mode. The home screen likely has a similar helper that uses the tokenized table instead of plain strings. Trace 0x028f02's callees to understand the pattern, then look for a sibling function.

## Status

Phase 75 is a PARTIAL investigation. We identified that:
- Direct token-table access doesn't exist in the lifted code (no `ld hl, 0x0a0450`)
- Mode state is read heavily from 0xD0008X range, especially 0x8A, 0x85, 0x8E, 0x92
- The home-screen rendering path is split across multiple blocks that need to be linked via deeper analysis

Phase 76 should pursue Approach 1 (find the length-prefixed string walker signature) or Approach 3 (JT slot scan for token-print helpers).
