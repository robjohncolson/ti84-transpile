# Phase 936: Narrow Numeric D02A29 Browser Integration

Date: 2026-07-11  
Session: codex auto-session 1008

## Result

PHASE935's proven policy is integrated into disk `browser-shell.html`. At the existing successful post-insert return `0x0013DA`, only `Digit1`, `Digit2`, and `Digit3` advance the two-byte `D02A29` cursor-pixel offset by `0x000C`. Control keys, numpad aliases, letters, and variable-width tokens are outside this predicate. The closed `0x08F54B` engine path and all existing pre-stops remain unchanged.

## Mandatory gates

### Browser replay

Command:

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-browser-shell-replay-verify.mjs
```

Result: exit 0 with `pass:true`. Phase 6 halted after 47,298 steps, captured the VAT snapshot, and reported `errors: []`.

### PHASE922 normalized `123 LEFT` audit

Command:

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase922-browser-123-left-cursor-relative-audit.mjs
```

The probe retained its documented legacy top-level exit 1, but the applicable disk-route evidence passed:

- Digit1, Digit2, and Digit3 terminated at `post_insert_gate_stop` after 7,526 / 4,558 / 4,492 steps.
- The entry buffer progressed to exact `31 32 33 00`.
- `D02A29` checkpoints were `0x000C -> 0x0018 -> 0x0024`; ArrowLeft left the field at `0x0024`.
- ArrowLeft terminated at the preserved `0x001879` control pre-stop after 7,511 steps.
- Page errors were `[]`, and cursor-relative mismatches were empty.
- The six absolute mismatches remained the established set: `D010EF`, `D010FE`, `D02587`, `D0258A`, `D0258D`, and `D025A0`.

### Golden regression

Command:

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase99d-home-verify.mjs
```

Result: exit 0. Both status-dot assertions passed, the best decode remained row 39 / column 2, and `Normal`, `Float`, and `Radian` all passed.

## Conclusion

The narrow numeric policy is integrated and passes all required gates. The next listed priority, PHASE937, may audit that the disk policy stays inactive for a bounded nonnumeric insert and canonical control-key routes while retaining these numeric checkpoints.
