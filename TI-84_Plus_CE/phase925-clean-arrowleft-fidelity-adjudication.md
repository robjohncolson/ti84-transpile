# Phase 925: Clean ArrowLeft fidelity adjudication

Probe rerun: `probe-phase922-browser-123-left-cursor-relative-audit.mjs`  
Command: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase922-browser-123-left-cursor-relative-audit.mjs`

## Result

- The watchdog completed the probe normally. The probe exits 1 because the LEFT oracle still mismatches; it did not time out or crash.
- The pre-LEFT route is now clean: Digit1, Digit2, and Digit3 each terminate at `post_insert_gate_stop`. Their step counts are 7,526, 4,824, and 4,508, and the browser buffer is exactly `31 32 33 00` with `D0243A=0xD1A8CF` (browser line base `0xD1A8CC`, offset +3).
- ArrowLeft terminates at the existing `0x001879` `control_pre_stop` after 7,511 steps.
- The first OS cursor change is observed at `0x05E453` (previous block `0x05E26C`, observed block 2,187). This is the expected one-byte left movement from the clean base+3 start.
- By the time the route reaches `0x001879`, the OS-visible cursor is `0xD1A8CD` (browser base+1). The browser control-stop callback then rewrites it to the saved pre-key cursor `0xD1A8CF` (base+3).
- The hardware capture ends at `0xD1A8D1` relative to its own line base `0xD1A8CF`, or offset +2. The browser therefore misses the hardware cursor by +1 after normalization.

## Owner adjudication

The first directly controlled mismatch is the browser's ArrowLeft cursor-restoration policy, not the clean digit prefix and not the `0x001879` pre-stop itself:

1. `shouldRestoreColdbootEditCursorAtControlStop()` enables restoration for ArrowLeft at `0x001879`.
2. The key handler snapshots `cursorBefore` before running LEFT (`0xD1A8CF`, base+3).
3. At the control pre-stop it reads the live OS cursor (`0xD1A8CD`, base+1), writes the saved pre-key cursor back to `D0243A`, and records `controlStopCursorRestored=true`.
4. The fresh probe output exposes the exact write as `0xD1A8CD -> 0xD1A8CF`.

This explains why the valid first movement at `0x05E453` does not survive to the browser-visible result: the callback deliberately discards it and restores the pre-key value.

The evidence does **not** authorize deleting the restoration. With the write suppressed, the bounded route would expose the already-observed base+1 pre-stop value, which is also one byte away from the hardware base+2 result. The smallest candidate for a future browser fix is to preserve the first valid one-byte LEFT result (base+2) across the control stop instead of restoring the pre-key base+3 value, but that candidate needs an observation-only shadow validation before any disk edit.

GitNexus could not resolve the inline HTML symbol `shouldRestoreColdbootEditCursorAtControlStop`; its graph risk is `UNKNOWN`, with no graph-resolved callers or processes. Direct source inspection shows one call in the coldboot Preserve Display key-dispatch path. Any future browser edit remains gated by `probe-browser-shell-replay-verify.mjs`, the normalized `123 LEFT` audit, and the 26/26 golden regression.

## Fresh bounded evidence

| stage | termination / owner | steps / block | cursor | normalized cursor |
|---|---|---:|---|---:|
| after Digit1 | `post_insert_gate_stop` | 7,526 | `0xD1A8CD` | +1 |
| after Digit2 | `post_insert_gate_stop` | 4,824 | `0xD1A8CE` | +2 |
| after Digit3 | `post_insert_gate_stop` | 4,508 | `0xD1A8CF` | +3 |
| first LEFT move | `0x05E453` (prev `0x05E26C`) | block 2,187 | one byte left | +2 |
| LEFT control stop before browser write | `0x001879` | 7,511 | `0xD1A8CD` | +1 |
| LEFT control stop after browser write | browser cursor restoration | same callback | `0xD1A8CF` | +3 |
| real-hardware final | capture-relative oracle | - | `0xD1A8D1` on base `0xD1A8CF` | +2 |

The final normalized audit reports eight cursor-relative mismatches. Four non-layout absolute mismatches remain the already-known Phase-6 VAT-pointer baseline differences; `D010EF` and `D010FE` are the known three-byte session-layout shift. None of those fields is the first LEFT-route divergence.

No runtime, decoder, peripheral, transpiler, ROM artifact, browser-shell, scheduler, or `follow-alongs/` file was changed.
