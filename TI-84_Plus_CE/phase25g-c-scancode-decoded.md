# Phase 25G-c — Scan Code Translation Table Decode

## Source

- ROM offset `0x09F79B`, length 228 bytes (57 entries × 4 modifier planes).
- Dictionary: inline mapping provided by parent agent (CC), not from web research.
- Decoder: `TI-84_Plus_CE/phase25g-c-decode.mjs`.
- Raw stdout: `TI-84_Plus_CE/phase25g-c-decode.out`.

## Legend

- **scancode** — the 1-byte index into the plane (0x01..0x39), treated as a candidate `(row<<4)|col` value for cross-referencing the keyboard matrix.
- **row / col** — high/low nibble of scancode (`scancode >> 4`, `scancode & 0x0F`).
- **physical label** — best-effort mapping from scancode to TI-84 CE key via the inline label table. See caveat below.
- **token byte** — raw ROM byte at `0x09F79B + plane*57 + (scancode-1)`.
- **decoded name** — dictionary lookup; bytes not in the dictionary fall through to their ASCII literal or `tok:0xNN`.

## ⚠ Caveat: physical-label alignment is unverified

The 57-entry × 4-plane layout does NOT align cleanly with the keyboard matrix scan-code convention (`(groupIdx<<4) | bit`). Several rows show obviously wrong pairings in the NONE plane (e.g. scancode 0x17 APPS → 0x38 '8', scancode 0x32 '2' key → 0x44 'D'). Candidate explanations:

1. The table is indexed by a **compact enum** (0..56), not by raw scancode; the "scancode" column here is a sequential counter, not the true scan code.
2. The table uses a **different row/col packing** than the keypad MMIO matrix.
3. There is a small **prefix header** before the 228-byte payload that shifts the alignment.

Recommend a follow-up phase (25G-d) that cross-checks against live keyboard input: feed a known scan code, trace which byte of this table the OS reads, and establish the real index formula before trusting the physical-label column.

## Decoded tables

See `TI-84_Plus_CE/phase25g-c-decode.out` for the full 4-table markdown dump (247 lines). Reproduced there so this report stays readable.

## Byte-value frequency (all 228 bytes)

- **144 unique bytes** appear in the 228-byte table.
- Most frequent: `0x00` ×36 (fall-through / unassigned slot).
- Next: `0x09` ×4 (ENTER), followed by a long tail of `0x01`, `0x02`, `0x0A`, `0x2E`, `0x31`, `0x35`, `0x44`, `0x45`, `0x48`, `0x49`, `0x5A` each ×3.
- High-byte tokens `0xB0..0xFF` are dense — these are the TI-OS internal token codes that were NOT pre-mapped in the inline dictionary and show up as `tok:0xNN`.

## Undecoded bytes (fell through to `tok:0xNN` or hex literal)

All bytes in the 0x94..0x9F, 0xA0..0xAF (except dictionary hits), 0xB0..0xFF ranges, plus any bytes in 0x01..0x08, 0x12..0x2F, 0x3A..0x40, 0x46..0x4F, 0x5B..0x60, 0x7B..0x7F that weren't in the dictionary. Total undecoded unique bytes: ~120 of the 144 unique values (~83%).

Best guess: the `0x94..0xFF` range is TI-OS internal-token space (PI, INV, SIN, COS, ..., and two-byte extended tokens with leading 0xBB/0xEF). A complete decode requires the TI-OS token tables in `toksys.inc` or the WikiTI token reference, which was explicitly out of scope for this inline-dictionary retry.

## Next action

Phase 25G-d: verify table indexing by feeding a known scan code through the OS event loop and observing which table byte is loaded. Until that is confirmed, treat the physical-label column in `phase25g-c-decode.out` as advisory only.
