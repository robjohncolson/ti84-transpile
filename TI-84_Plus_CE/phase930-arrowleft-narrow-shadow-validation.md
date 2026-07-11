# Phase 930: ArrowLeft Narrow Shadow Validation

Probe: `probe-phase930-arrowleft-narrow-shadow-validation.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase930-arrowleft-narrow-shadow-validation.mjs`

## Result

- Probe execution: **PASS**.
- Both independent pages inserted exact `31 32 33 00` and reached the existing `0x001879` control pre-stop for ArrowLeft with zero page errors.
- Baseline reproduced PHASE925: the OS first moved `D0243A` from base+3 to base+2 at `0x05E453`, continued to base+1 by the stop, and the disk policy restored base+3.
- The probe-only candidate shadowed only the first valid base+2 cursor at `0x05E453` and replayed that one 24-bit value at `0x001879`. It did not remove the pre-stop, clear flags, restore any other field, or edit disk `browser-shell.html`.
- Candidate final cursor offset is +2, matching the real-hardware oracle (+2). Cursor-relative mismatches changed 8 -> 2.

| Route | Cursor before LEFT | First OS cursor | At stop before replay | Shadow | After replay | Final offset | Relative mismatches |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| Baseline | 0xD1A8CF | 0xD1A8CE @ 0x05E453 | 0xD1A8CD | - @ - | 0xD1A8CF | +3 | 8 |
| Candidate | 0xD1A8CF | 0xD1A8CE @ 0x05E453 | 0xD1A8CD | 0xD1A8CE @ 0x05E453 | 0xD1A8CE | +2 | 2 |

## Adjudication

The narrow shadow/replay fixes the final cursor displacement but is not a complete edit-line fidelity fix. Remaining cursor-relative mismatches: D0243D-cursor, D02A29 cursor-pixel-offset.

The candidate is locally validated as the smallest cursor-policy correction: its captured value is exactly the first OS-produced one-byte LEFT result, its capture PC is `0x05E453`, and the replay happens only at the already-preserved `0x001879` stop. A disk patch should remain deferred until the remaining cursor-relative fields are explained or included by an equally narrow, evidence-backed shadow.

Absolute mismatches remain baseline/session-layout or Phase-6 state differences: D010EF, D010FE, D02587, D0258A, D0258D, D025A0.

## Scope

Only this new probe, this report, and the handoff are persisted. `browser-shell.html`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and `follow-alongs/` are untouched. GitNexus could not resolve the inline browser helper or the new probe helpers; pre-edit risk was `UNKNOWN` with zero graph-resolved direct callers/processes.

