# Phase 924 — Narrow Debounce-Drain Fix

## Scope

PHASE923 showed that the browser post-insert drain accepted the first `0x03F9B0` handoff when `D0058B` was zero even though `D000C3` bit 2 remained set. This phase changes only `runColdbootPostInsertFirstZeroDrain()` in `browser-shell.html`: first-zero acceptance now requires both `D0058B === 0` and `(D000C3 & 0x04) === 0`. It does not write or clear `D000C3`.

GitNexus could not resolve the inline HTML function or file, so graph risk was `UNKNOWN` with no graph-resolved callers or processes. Direct source inspection found one caller, `finishPendingColdbootPostInsertFirstZeroDrain()`, on the browser coldboot replay path.

## Watchdog Results

All commands were run in the foreground through `scripts/run-probe.mjs --max-time 180`.

| Probe | Process result | Relevant result |
| --- | --- | --- |
| `probe-browser-shell-replay-verify.mjs` | exit 0, `pass: true` | Browser replay gate passed; no page errors. |
| `probe-phase921-browser-2plus3-enter-cursor-relative-audit.mjs` | exit 0, `pass: true` | The plus-conditioned route remains divergent: Digit3 max-steps at 300,000 and leaves `32 9E 33 31`; ENTER is still downstream of that pre-ENTER duplication. |
| `probe-phase922-browser-123-left-cursor-relative-audit.mjs` | exit 1, `pass: false` | The PHASE924 prerequisite passed: Digit1/2/3 each reached `post_insert_gate_stop`; Digit3 took 4,508 steps and the buffer was exactly `31 32 33 00`. The overall audit remains false only because LEFT ends at the existing `0x001879` control pre-stop with cursor restored to base+3 instead of the hardware base+2. |
| `probe-phase99d-home-verify.mjs` | exit 0 | Golden home verification passed all 26 assertions, including `Normal Float Radian`. |

## Adjudication

The narrow predicate is sufficient for the consecutive `123` sequence and removes the repeated Digit3 insert that previously blocked a clean LEFT comparison. PHASE925 is therefore runnable from a clean base+3 cursor.

The fix is not a universal resolution for every Digit3 predecessor: PHASE921 still duplicates after `2+`. That route remains a separate pre-ENTER integration blocker and must not be misclassified as an ENTER-key failure.
