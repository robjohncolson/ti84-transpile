# Phase 934: D02A29 Writer/Owner Audit

Probe: `probe-phase934-d02a29-writer-owner-audit.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase934-d02a29-writer-owner-audit.mjs`

## Result

- Probe execution: **PASS**.
- The bounded disk route inserted exact `31 32 33 00`; all three digit routes stopped at the existing post-insert gate, and ArrowLeft stopped at the preserved `0x001879` control pre-stop with zero page errors.
- Across all four active routes, wrapped CPU `read8/read16/read24/write8/write16/write24` recorded **0 reads/writes overlapping `D02A29..D02A2A`**. The field stayed `0x0000` from the pre-sequence state through ArrowLeft, while the real `123 LEFT` capture is `0x0024`.
- None of the 21 bounded owner/entry PCs was reached, and there were 0 visits anywhere in `0x08DF00..0x08F7FF`. This rules out a writer that ran but was later undone: the renderer/measurement family never runs on this harness route.
- Raw ROM bytes contain the direct short-address `LD (0x002A29),HL` opcode at exactly 14 sites: `0x08DF54`, `0x08DFDD`, `0x08ED73`, `0x08EE0D`, `0x08F006`, `0x08F0B8`, `0x08F0D4`, `0x08F10E`, `0x08F551`, `0x08F5A4`, `0x08F6A5`, `0x08F6FE`, `0x08F70F`, `0x08F7C5`.
- The first missing functional writer is `0x08F551` in the closed `0x08F54B` text-measure/render block: `HL = old D02A29 + DE`, then `LD (0x002A29),HL`. The real one-digit `Digit3` capture is `0x000C` and the real `123 LEFT` capture is `0x0024`, consistent with three 12-pixel glyph advances. This audit names the absent path but does not enter, patch, or force it.

## Bounded route evidence

| Key | Termination | Steps | Control stop | D02A29 | CPU accesses | 08DF00..08F7FF hits | Page errors |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
| 1 | post_insert_gate_stop | 7,526 | - | 0x0000 | 0 | 0 | 0 |
| 2 | post_insert_gate_stop | 4,558 | - | 0x0000 | 0 | 0 | 0 |
| 3 | post_insert_gate_stop | 4,492 | - | 0x0000 | 0 | 0 | 0 |
| LEFT | control_pre_stop | 7,511 | 0x001879 | 0x0000 | 0 | 0 | 0 |

All dynamic access arrays and relevant-owner hit maps are empty. The browser shell's coldboot seed writes `D02A29=0` before this bounded key sequence begins; no OS block reads or writes either byte afterward.

## Static owner adjudication

The fourteen direct writer sites separate into initialization/save-restore and live measurement/update families. For the active mismatch, `0x08F551` is the first semantically relevant owner because the `0x08F54B` block reads the current accumulator, adds the incoming glyph advance in `DE`, and stores the sum. The route's existing post-insert and control pre-stops occur without entering that family, so forcing `D02A29=0x0024` would mask an intentionally absent downstream measurement pass rather than repair a writer that executed incorrectly.

The closed `0x08F54B` engine thread remains closed. A future fix, if authorized, should be a narrow browser policy derived from the already-inserted token bytes and should be validated as a probe-local A/B before any disk edit.

## Scope

Only this new probe, this report, and the handoff are persisted. `browser-shell.html`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and `follow-alongs/` are untouched.

