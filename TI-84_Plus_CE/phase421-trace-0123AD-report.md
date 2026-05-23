# Phase 421: Trace of `0x0123AD`

## Summary

- Function boundary: `0x0123AD..0x0123FF` (`0x53` bytes / `83` decimal).
- Direct hardware work is limited to `0x3010`: read, `SET 1`, write, then on the nonzero-argument path re-read and poll bit 1.
- There are **no direct `0x31xx` writes** in `0x0123AD`, so it does not itself program USB endpoint/FIFO registers.
- The two session-420 callers (`0x009987` from `0x0098D2` and `0x012502` from `0x012456`) both push `0x000000`, so they only use the short path that skips the installer call.
- Other ROM callers push `0x000032`, which takes the longer path through `0x014E3F` and a `0x3010`/`D1440F`/`D177B7` poll loop.

## Function Boundaries

| Item | Value |
| --- | --- |
| Start | `0x0123AD` |
| End | `0x0123FF` |
| Size | `0x53` bytes (`83` decimal) |
| Exit | `RET` at `0x0123FF` |

The function is a single contiguous block. The bytes at `0x012401+` belong to the next routine and are not part of this trace.

## What Endpoints It Configures

Direct `0x31xx` endpoint writes: **none**.

The only direct port work inside `0x0123AD` is:

| Port | Access pattern | Meaning |
| --- | --- | --- |
| `0x3010` | `IN A,(C)` -> `SET 1,A` -> `OUT (C),A` | raises bit 1 before any installer logic |
| `0x3010` | `.SIS LD BC,0x3010` -> `IN A,(C)` -> `AND 0x02` | polls bit 1 after the optional `0x014E3F` call |

Because the function never touches the endpoint families already identified elsewhere (`0x316x`, `0x318x`, `0x31A8..0x31AF`), no endpoint number can be assigned to it. The best fit is a **global controller/notification helper**, not a per-endpoint setup routine.

## Teardown-Only Or Bidirectional

It is **not teardown-only globally**, but the split is not endpoint setup vs endpoint teardown.

Observed control flow:

1. Always set bit 1 on `0x3010`.
2. Load `HL` from `(IX+6)` and call `0x0021C2`.
3. If the stacked argument is zero, jump straight to `LD A,0x01` and return.
4. If the stacked argument is nonzero:
   - push that value in `BC`
   - call `0x014E3F`
   - poll `0x3010 bit1`
   - if bit 1 clears, clear `D1440E` and return `A=1`
   - otherwise read `D1440F` and `D177B7`; while `D1440F == 0` and `D177B7 == 0x55`, loop back and poll again
   - if the loop exits with bit 1 still high, return `A=0`

That gives two modes:

- `arg == 0`: short controller-bit path, used by the two session-420 callers.
- `arg != 0`: installer/poll path, used by other ROM sites that pass `0x0032`.

So the routine is **bifurcated**, but the long path is an install/wait wrapper around `0x014E3F`, not direct endpoint programming.

## Direct Caller Pattern

Direct `CALL 0x0123AD` sites found in ROM:

| Caller | Stacked arg | Notes |
| --- | --- | --- |
| `0x009987` | `0x000000` | from `0x0098D2` connect/recovery path |
| `0x00B7E4` | `0x000000` | short path |
| `0x00CCBC` | `0x000032` | installer path |
| `0x00DD3D` | `0x000032` | installer path |
| `0x00DDD8` | `0x000032` | installer path |
| `0x00FCE7` | `0x000000` | short path |
| `0x00FDD0` | `0x000000` | short path |
| `0x012502` | `0x000000` | from `0x012456` OTG host->device transition |
| `0x012787` | `0x000032` | installer path |
| `0x012DC6` | `0x000000` | short path |

The session-420 assumption was correct only for those two specific callers: both of them use the zero-argument fast path.

## CALL Targets And Likely Roles

| Target | Role | Evidence |
| --- | --- | --- |
| `0x00218A` | stack-frame helper | Standard prologue helper seen across ZDS-generated routines |
| `0x0021C2` | HL null-check helper | Called immediately after `LD HL,(IX+6)`; known helper that sets Z when `HL == 0` |
| `0x014E3F` | notification state installer | Known phase-411 routine that clears `D1440E/D1440F`, calls `0x014EF8`, snapshots `D14038`, then sets `D1440E=1` |

The important consequence is that the long path is tied to the notification subsystem, not endpoint register families.

## RAM Variables Accessed

| Address | Access | Role in `0x0123AD` |
| --- | --- | --- |
| `D1440F` | read | delivery/status byte checked after the installer call; nonzero exits the poll path with `A=0` |
| `D177B7` | read | sentinel checked against `0x55`; while equal and `D1440F == 0`, the routine loops back to poll `0x3010` again |
| `D1440E` | write | notification lock cleared only on the `0x3010 bit1 == 0` success path |

Notably absent:

- no direct reads/writes of endpoint descriptor RAM
- no `D14082`/`D14083`-style state latches
- no port-shadow bytes in the `D1404x` mask family

## Conclusion

`0x0123AD` is **not** the missing endpoint configuration routine.

What it actually does is:

- raise bit 1 on the global control port `0x3010`
- optionally invoke the notification-state installer `0x014E3F` when passed a nonzero stacked argument
- poll the same `0x3010` bit together with `D1440F` and `D177B7`
- clear the notification lock `D1440E` on the clean-success path

So the function is better described as a **controller/notification arm-or-wait helper**. The actual USB endpoint setup still has to live elsewhere.
