# Phase 933: ArrowLeft Browser Integration

Disk change: `browser-shell.html`  
Verification commands:

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-browser-shell-replay-verify.mjs
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase922-browser-123-left-cursor-relative-audit.mjs
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase99d-home-verify.mjs
```

## Result

- **PASS**: PHASE932's narrow ArrowLeft-only two-field shadow/replay is integrated on disk.
- The shell captures the first valid tuple at `0x05E453` only when the live cursor is exactly one byte left of the pre-key cursor. For the clean `123 LEFT` route, it captured `D0243A=0xD1A8CE` and `D0243D=0xD2A83D`.
- At the preserved `0x001879` pre-stop, the live tuple was `D0243A=0xD1A8CD` and `D0243D=0xD2A83C`. The shell replayed the captured tuple exactly once, producing final `D0243A=0xD1A8CE` and `D0243D=0xD2A83D`.
- The input buffer remained exact: `31 32 33 00`. Digit1, Digit2, and Digit3 each reached `post_insert_gate_stop`; LEFT reached `control_pre_stop` in 7,511 steps with zero page errors.
- All nine cursor-relative PHASE922 rows match the hardware capture except the postponed `D02A29 cursor-pixel-offset` (`0x0000` browser versus `0x0024` hardware). `D0243D-cursor` now matches exactly at `0x00FF6F`.
- The six absolute mismatches are the same known PHASE932 baseline set: `D010EF`, `D010FE`, `D02587`, `D0258A`, `D0258D`, and `D025A0`. No new absolute or relative mismatch appeared.

## Gates

- Browser replay verify: `pass:true`, Phase 6 halted after 47,298 steps, VAT snapshot captured, no page errors.
- PHASE922 normalized audit: the route and comparisons satisfy the PHASE933 requirement. Its legacy top-level `pass:false`/exit 1 is expected because `cleanExecution` still asserts the superseded pre-fix Digit3/LEFT max-step behavior; the generated comparison rows are the evidence used here.
- Golden home regression: 26/26 PASS (`Normal Float Radian`, both status-dot checks, and all decode assertions passed).

The stable replay fields and all existing `0x0A229D` / `0x001879` control pre-stops remain unchanged.
