# Phase 929 — Narrow Browser Predicate Patch

## Scope

PHASE928 adjudicated the preserved `0x001879` pre-wipe stop as a safe normal drain outcome. This phase changes only `runColdbootPostInsertFirstZeroDrain()` in `browser-shell.html`: accepting the `0x03F9B0` first-zero handoff now requires all three observed conditions:

- `D0058B === 0`
- `(D000C3 & 0x04) === 0`
- `(D0009B & 0x40) === 0`

The predicate only reads RAM. It does not clear or restore any field, and the existing `0x001879` / `0x0018F8` guard remains unchanged.

GitNexus could not resolve the inline HTML function, so graph risk is `UNKNOWN`: zero graph-resolved direct callers and no affected indexed process could be established. The indexed process search only returned unrelated `runFrom` runtime flows. Direct source inspection keeps the change within the browser coldboot post-insert drain.

## Watchdog Results

Every probe was run in the foreground through `scripts/run-probe.mjs --max-time 180`.

| Probe | Process result | Relevant result |
| --- | --- | --- |
| `probe-browser-shell-replay-verify.mjs` | exit 0, `pass: true` | Mandatory browser replay gate passed in 139.6 s with no errors; Phase 6 halted after 47,298 steps and captured the VAT snapshot. |
| `probe-phase921-browser-2plus3-enter-cursor-relative-audit.mjs` | exit 1, stale historical oracle | The patch removed the behavior that this probe's pass condition expects. `2`, `+`, and `3` each reached `post_insert_gate_stop`; Digit3 took 4,572 steps and the buffer was exactly `32 9E 33 00`. ENTER then reached the preserved `0x001879` `control_pre_stop` in 7,966 steps. The probe reports false because it still requires the old repeated-Digit3/max-steps signature. |
| `probe-phase927-d0009b-conditioned-handoff-ab.mjs` | exit 1 before scenarios | Its source instrumentation hard-codes the old two-clause predicate as an exact replacement marker (lines 54-57). With the committed three-clause predicate, `window.__phase927` is never installed and the probe times out waiting for instrumentation. This is a harness incompatibility, not a measured route failure. |
| `probe-phase922-browser-123-left-cursor-relative-audit.mjs` | exit 1, known LEFT oracle mismatch | The normalization prerequisite passed: `1`, `2`, and `3` each inserted once and reached `post_insert_gate_stop`; the buffer was exactly `31 32 33 00`. LEFT still reaches the preserved `0x001879` control pre-stop and exhibits the already-carried base+3 restoration mismatch instead of the hardware base+2 cursor. |
| `probe-phase99d-home-verify.mjs` | exit 0 | Golden home verification passed all 26 assertions, including `Normal Float Radian`. |

The historical probes regenerate their committed reports when run; those generated changes were discarded after recording the watchdog output so this tick remains within its allowed scope.

## Adjudication

The disk predicate implements the PHASE927/928 narrow policy without mutating RAM. The browser replay and golden gates pass. The plus-conditioned pre-ENTER blocker is resolved: the formerly duplicated Digit3 now inserts exactly once, and ENTER reaches the existing pre-wipe guard. Clean `123` normalization also remains correct.

The ArrowLeft base+3-to-base+2 fidelity mismatch is unchanged and remains the next conditional frontier. PHASE927's old A/B harness must not be treated as a regression gate without first making its source marker compatible with the finalized predicate.
