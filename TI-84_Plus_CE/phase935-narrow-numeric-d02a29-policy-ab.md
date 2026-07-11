# Phase 935: Narrow Numeric D02A29 Policy A/B

Probe: `probe-phase935-narrow-numeric-d02a29-policy-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase935-narrow-numeric-d02a29-policy-ab.mjs`

## Result

- Probe execution: **PASS**.
- Baseline reproduced the clean disk route with `D02A29` checkpoints `0x0000` -> `0x0000` -> `0x0000` -> `0x0000`.
- The temporary numeric-only policy advanced `D02A29` exactly once at the successful post-insert return `0x0013DA` for Digit1/2/3. Candidate checkpoints are `0x000C` -> `0x0018` -> `0x0024` -> `0x0024`, matching the real `123 LEFT` progression required by the handoff.
- ArrowLeft did not run the policy: the event log contains exactly 3 digit events, and the field remained `0x0024` through the preserved `0x001879` pre-stop.
- Exact `31 32 33 00`, all three `post_insert_gate_stop` terminations, zero page errors, and the ArrowLeft `control_pre_stop` were preserved.
- All PHASE933 normalized rows are unchanged except the intended `D02A29 cursor-pixel-offset` correction from `0x0000` mismatch to `0x0024` match. Candidate relative mismatches: **none**. The known absolute mismatch set remains exactly: `D010EF`, `D010FE`, `D02587`, `D0258A`, `D0258D`, `D025A0`.

## Bounded A/B evidence

| Key | Baseline termination | Candidate termination | Baseline D02A29 | Candidate D02A29 | Candidate buffer[0..3] | Control stop | Page errors |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| 1 | post_insert_gate_stop | post_insert_gate_stop | 0x0000 | 0x000C | 0x31 0x00 0x00 0x00 | - | 0 |
| 2 | post_insert_gate_stop | post_insert_gate_stop | 0x0000 | 0x0018 | 0x31 0x32 0x00 0x00 | - | 0 |
| 3 | post_insert_gate_stop | post_insert_gate_stop | 0x0000 | 0x0024 | 0x31 0x32 0x33 0x00 | - | 0 |
| LEFT | control_pre_stop | control_pre_stop | 0x0000 | 0x0024 | 0x31 0x32 0x33 0x00 | 0x001879 | 0 |

Policy event log:

| Code | PC | Before | After |
| --- | --- | --- | --- |
| Digit1 | 0x0013DA | 0x0000 | 0x000C |
| Digit2 | 0x0013DA | 0x000C | 0x0018 |
| Digit3 | 0x0013DA | 0x0018 | 0x0024 |

## Adjudication

The narrow browser policy passes the requested A/B. Its predicate is limited to Digit1/2/3 and fires only when the existing post-insert gate reaches its successful return; it neither enters nor reopens the closed `0x08F54B` engine path. The next listed priority may conditionally integrate this exact proven predicate on disk, subject to the browser replay, PHASE922 normalized audit, and golden gates.

## Scope

This probe serves temporary baseline and candidate browser copies. Disk `browser-shell.html`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and `follow-alongs/` are untouched.

