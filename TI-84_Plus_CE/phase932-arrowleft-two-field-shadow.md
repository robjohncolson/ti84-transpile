# Phase 932: ArrowLeft Two-Field Shadow Adjudication

Probe: `probe-phase932-arrowleft-two-field-shadow.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase932-arrowleft-two-field-shadow.mjs`

## Result

- Probe execution: **PASS**.
- Both independent routes inserted exact `31 32 33 00`, reached the preserved `0x001879` ArrowLeft pre-stop in 7,511 steps, and reported zero page errors.
- The temporary candidate captured exactly the first PHASE931 tuple at `0x05E453`: `D0243A=0xD1A8CE`, `D0243D=0xD2A83D`. It replayed those two 24-bit fields exactly once at `0x001879`.
- Candidate cursor-relative mismatches changed 8 -> 1. Every hardware-normalized field now matches except the already-postponed `D02A29 cursor-pixel-offset`.
- Absolute comparison rows are byte-for-byte semantically unchanged between baseline and candidate; no absolute or relative regression was introduced.

| Route | At stop D0243A | Shadow tuple | Replay PC/count | Final D0243A | Final D0243D | Relative mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline | 0xD1A8CD | - | - | 0xD1A8CF | 0xD2A83C | 8: D0243A cursor-from-line-base, TOKEN[cursor-3], TOKEN[cursor-2], TOKEN[cursor-1], TOKEN[cursor+0], D0243D-cursor, D02440-cursor, D02A29 cursor-pixel-offset |
| Two-field candidate | 0xD1A8CD | 0xD1A8CE / 0xD2A83D @ 0x05E453 | 0x001879 / 1 | 0xD1A8CE | 0xD2A83D | 1: D02A29 cursor-pixel-offset |

## Adjudication

The combined narrow shadow is sufficient for the active ArrowLeft descriptor blocker. Before replay, the route had advanced to `D0243A=0xD1A8CD` and `D0243D=0xD2A83C`; replay restored the first OS-produced one-byte LEFT tuple, ending at `D0243A=0xD1A8CE` and `D0243D=0xD2A83D`. The normalized `D0243D-cursor` row is now 0x00FF6F on both browser and hardware.

This is report-only evidence. Disk `browser-shell.html` was not edited, so the conditional browser integration remains a separate next priority with its required browser replay, normalized PHASE922, and golden gates.

## Regression checks

- Exact final token buffer: `31 32 33 00`.
- Candidate absolute mismatches (6): D010EF, D010FE, D02587, D0258A, D0258D, D025A0.
- Baseline absolute mismatches (6): D010EF, D010FE, D02587, D0258A, D0258D, D025A0.
- Candidate relative mismatches (1): D02A29 cursor-pixel-offset.

## Scope

Only this new probe, this report, and the handoff are persisted. The two-field candidate exists only in the served temporary browser response. `browser-shell.html`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and `follow-alongs/` are untouched.

