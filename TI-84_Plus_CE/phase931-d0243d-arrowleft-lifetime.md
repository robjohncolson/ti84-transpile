# Phase 931: D0243D ArrowLeft Owner/Lifetime

Probe: `probe-phase931-d0243d-arrowleft-lifetime.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase931-d0243d-arrowleft-lifetime.mjs`

## Result

- Probe execution: **PASS**.
- Both bounded routes inserted exact `31 32 33 00`, reached the preserved `0x001879` control pre-stop in 7,511 steps, and reported zero page errors.
- Baseline and PHASE930-style cursor-shadow routes have the same complete `D0243D` lifetime: two decrements by the same `0x05E26C` block, both returning through `0x05E453`. The first pass (block 2187) produces `0xD2A83D`; the second pass (block 4424) produces `0xD2A83C` before the route later reaches `0x001879`.
- With the candidate final cursor `0xD1A8CE`, the hardware-normalized `D0243D-cursor` delta `0x00FF6F` requires raw `D0243D=0xD2A83D`. The first transition is therefore the first hardware-compatible one-byte value.

## Complete bounded D0243D timeline

| # | Block | Owner PC | Observed/return PC | Before | After |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 2187 | 0x05E26C | 0x05E453 | 0xD2A83E | 0xD2A83D |
| 2 | 4424 | 0x05E26C | 0x05E453 | 0xD2A83D | 0xD2A83C |

The two rows come from the lifted block at `0x05E26C`: it stores the incoming `HL` to `D0243A`, loads `D0243D`, decrements `HL`, copies the displaced byte through the gap, writes the decremented `HL` back to `D0243D`, and returns. Its first invocation creates the valid one-byte LEFT tuple; its second invocation advances both pointers one byte farther before the pre-stop.

## Why cursor-only replay remains one byte short

| Route | Final D0243A | Final D0243D | D0243D-cursor actual | Hardware oracle | Match |
| --- | --- | --- | --- | --- | --- |
| Baseline | 0xD1A8CF | 0xD2A83C | 0x00FF6D | 0x00FF6F | NO |
| Cursor shadow | 0xD1A8CE | 0xD2A83C | 0x00FF6E | 0x00FF6F | NO |

PHASE930 replays only the first valid `D0243A` value at `0x001879`. It does not replay `D0243D`, so the second `0x05E26C` decrement survives. The final candidate tuple is therefore `D0243A=0xD1A8CE`, `D0243D=0xD2A83C`: normalized delta `0x00FF6E`, exactly one below hardware's `0x00FF6F`. An equally narrow combined probe-local shadow may now use the first `D0243D=0xD2A83D` observed at `0x05E453`; no disk patch is made here.

## Scope

Only this new probe, this report, and the handoff are persisted. The candidate exists only in the served temporary browser response. `browser-shell.html`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and `follow-alongs/` are untouched.

