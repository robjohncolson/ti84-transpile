# Capture Analysis Task — validate 3 new ground-truth RAM dumps

You are doing **static binary analysis only** (no transpile, no probes, no browser). Read-only
on the `.bin` files — NEVER modify them. Self-contained: assume no prior context beyond this doc.

## Background

This repo lifts the TI-84 Plus CE OS ROM (v5.8.2.0029) to JS and validates the lift against
**real-hardware RAM dumps** captured from a CEmu-WASM emulator running the *exact same ROM*.
A dump is bytes `0xD00000..0xD657FF` (RAM), **415,744 bytes**, so **file offset `i` = address
`0xD00000 + i`**. These are ground truth: address values line up 1:1.

Five dumps live in `TI-84_Plus_CE/captures/` (all 415,744 bytes):

| File | Intended state | Session |
|---|---|---|
| `realram-home-digit3-D00000-D657FF.bin` | home, typed `3` (before CLEAR) | 2026-06-25 (reference, pristine) |
| `realram-home-afterCLEAR-D00000-D657FF.bin` | same, after CLEAR | 2026-06-25 (reference, pristine) |
| `realram-home-2plus3-enter-D00000-D657FF.bin` | typed `2+3`, pressed ENTER | 2026-07-09 (NEW) |
| `realram-home-alpha-A-D00000-D657FF.bin` | typed letter `A` (ALPHA) | 2026-07-09 (NEW) |
| `realram-home-123-left-D00000-D657FF.bin` | typed `123`, pressed ◄ (left) | 2026-07-09 (NEW) |

**Known problem with the 3 NEW dumps:** they were captured back-to-back **without clearing the
edit line between them**, on a home screen that already had computation history. A quick decode
showed two symptoms: (1) the edit-buffer base moved from `0xD1A8CC` (pristine reference) to
`0xD1A8CA` this session; (2) the `123-left` buffer actually reads `"A123"` — a stray `A` carried
over from the `alpha-A` capture. Your job is to characterize this rigorously and decide if the
new dumps are still usable as oracles for auditing the browser transpile (whose coldboot always
produces a **pristine** home at base `0xD1A8CC`).

## Edit tokens

The edit buffer stores these keys ASCII-compatibly: digits `0x30..0x39` (`'0'..'9'`), letters
`0x41..0x5A` (`'A'..'Z'`), `+` = `0x70`. A NUL (`0x00`) terminates.

## Fields to decode (all little-endian; widths in bytes)

Edit context:
- `D0243A` (3) editCursor (points one past last char in the edit buffer — names the base)
- `D0243D` (3) editTail
- `D02440` (3) editBtm
- `D02A29` (2) cursor column/pixel offset

OS state (should be stable across keypresses on a live home):
- `D007CA` (3) cxMain vector — expect `0x0585E9`
- `D008E0` (3) errSP anchor — expect `~0xD1A86C`
- `D010EF` (3), `D010FE` (3), `D010F4` (1) — "D010 mirror" — pristine expect `0xD2A83E`, `0xD1A8CC`, `0x1F`
- `D02587`/`D0258A`/`D0258D` (3 each) tempMem/FPSbase/FPS — expect `~0xD2A8E2`
- `D02590`/`D02593`/`D0259A` (3 each) — expect `~0xD3FE81`
- `D0259D` (3) — expect `~0xD3FECD`
- `D025A0` (3) newDataPtr — expect `~0xD2A8A4`
- `D025C5` (3) heap size — expect `~0x0C0000`
- `D0301B` (3) RAM-integrity magic — expect `0x5AA55A`

Reference values already confirmed:
- digit3: `D0243A=0xD1A8CD`, `D0243D=0xD2A83E`, `D02A29=0x000C`, `'3'` (`0x33`) at `0xD1A8CC`.
- afterCLEAR: `D0243A=0xD1A8CC`, `D0243D=0xD2A83E`, `D02A29=0x0000`, `'3'` still at `0xD1A8CC`.

## Do this

1. **Decode all 5 dumps.** For each: the fields above; and the edit buffer — locate the base
   from `D0243A`, dump ~16 bytes around it, decode the ASCII token string. Present as small tables.
2. **Quantify the base shift.** Establish the exact edit-buffer base per dump from cursor + buffer
   content. Confirm whether the 3 new dumps are exactly 2 bytes below the references, or something else.
3. **Root-cause the shift.** Diff the new dumps against `digit3`/`afterCLEAR` across the OS-state
   fields (esp. the free-mem/VAT pointers `D02587/D0258A/D0258D/D025A0/D025C5` and the VAT block)
   plus any home-history region, to identify what structurally pushed the edit buffer down. Report
   the specific fields that differ and whether they plausibly explain a 2-byte edit-base shift
   (e.g., accumulated home-screen history / an extra allocation below the edit buffer).
4. **Confirm contamination.** Verify `123-left` is really `"A123"`; confirm `2plus3-enter` and
   `alpha-A` are clean (empty line / single `A` respectively).
5. **Decide usability.** The browser transpile boots a *pristine* home (base `0xD1A8CC`, no history).
   For each new dump, decide if it can still serve as an oracle:
   - If the only difference is the edit-base offset + benign history, define a **cursor-relative
     alignment**: which fields must be compared *relative to the `D0243A` cursor* vs which stay
     *absolute*. Give the exact recipe.
   - If contamination/history makes a dump unusable as-is, say so and specify a clean re-capture.

## Deliverables (BOTH, and keep them SMALL)

- `TI-84_Plus_CE/captures/CAPTURE-ANALYSIS.md` — concise report of findings (small tables only;
  **never** dump full buffers; hard-cap the file well under 1 MB).
- `TI-84_Plus_CE/captures/oracle-spec.json` — machine-usable per-key oracle for a future audit
  probe: for each new key an object with the anchor field (`D0243A`), and a `fields` array of
  `{name, addr | cursorOffset, width, expected, mode: "absolute"|"cursor-relative"}`.
- End the report with a one-line **VERDICT** per new dump:
  `USABLE_ABSOLUTE` / `USABLE_CURSOR_RELATIVE` / `NEEDS_RECAPTURE` + one-sentence reason.

You may write and run a node decode script (e.g. `TI-84_Plus_CE/analyze-captures.mjs`).

## Hard constraint — bounded output

This repo has a strict size rule: a runaway analysis once wrote a 349 MB report and broke every
git push for two days; the auto-commit supervisor now **deletes any changed file >50 MB before
committing**. Keep the report and JSON in the KB range. Do not paste raw RAM regions wholesale.
