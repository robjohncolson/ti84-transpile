# Phase 418: USB ISR Handler Traces (`0x009B35`, `0x014DAB`)

## Executive Summary

- Exact caller scan found only one direct caller for each routine:
  - `0x001A87 -> CALL 0x009B35`
  - `0x001AB3 -> CALL 0x014DAB`
  - no direct `JP` references were found for either target.
- `0x009B35` is a **masked-source service helper**, not a display path. It temporarily clears FTINTC enable bit 5 in `0x5005`, branches on `usbInited (D177B7) == 0x55`, samples USB/link status bytes from `0x3084/0x3085` or `0x3014/0x3015`, and hands off to deeper service routines before re-enabling bit 5 and returning.
- `0x014DAB` is a **stateful USB/link worker** behind byte0/bit3. It does no direct FTINTC ack itself; instead it increments `D14038`, tests gate bytes `D1407B/D1408D/D1407C/D177B8/D14081`, optionally calls low-level helpers `0x006EB6`, `0x006FAF`, and `0x006F4D`, then runs the shared helper `0x014D48` over three RAM records and returns.

## `0x009B35`

Reachable body: `0x009B35..0x009C16` (`0xE2` bytes, ends in `RET`).

Direct RAM reads:

- `D177B7` (`usbInited` sentinel)
- `D14043`, `D14047` (sample bytes)
- `D14042`, `D14046` (mask words)
- `D14044`, `D14048` (masked result bytes)
- `D14073` (enabled flag)
- `D14049` (alternate sample byte)

Direct RAM writes:

- `D14047`, `D14043` from ports `0x3084`, `0x3085`
- `D14044`, `D14048` after mask/AND reduction
- `D14049`, `D14045` from ports `0x3014`, `0x3015`

Direct port I/O:

- `0x5005`: read, clear bit 5, later set bit 5 again
- `0x3084`, `0x3085`: read live status bytes
- `0x3014`, `0x3015`: alternate status bytes on the non-`usbInited` path

Direct subcalls:

- `0x00745D`, `0x00747D`: tiny wrappers that write a byte argument back to ports `0x3085` / `0x3084`
- `0x0098D2`: reached only when masked status in `D14044` or `D14048` is nonzero
- `0x0094C0`: alternate branch when `D177B7 != 0x55` and `D14073 == 0`
- `0x0096CB`: alternate branch when `D177B7 != 0x55` and `D14073 != 0`

Behavior summary:

1. Disable byte1/bit5 retriggering by clearing bit 5 in FTINTC enable register `0x5005`.
2. If `D177B7 == 0x55` (`usbInited`), service the `0x3084/0x3085` pair:
   - sample both ports into `D14047` / `D14043`
   - replay each sample back through `0x00747D` / `0x00745D`
   - AND the samples with masks from `D14046` / `D14042`
   - if either masked result is nonzero, call `0x0098D2`
3. If `D177B7 != 0x55`, fall into the alternate status path:
   - if `D14073 == 0`, sample `0x3014/0x3015`, and call `0x0094C0` when `D14049 != 0`
   - if `D14073 != 0`, call `0x0096CB`
4. Re-enable bit 5 in `0x5005` and return.

Best-fit label:

- **byte1/bit5 masked-source USB/link status service helper**

This matches the earlier Phase 59 observation that the bit5 path is bookkeeping/service work, not rendering. The key new detail is that it is not only masking the interrupt source; it also samples hardware status and conditionally escalates into deeper USB/link routines.

## `0x014DAB`

Reachable body: `0x014DAB..0x014E3E` (`0x94` bytes, ends in `RET`).

Direct RAM reads:

- `D14038` (rolling counter)
- `D1407B`, `D1408D`, `D1407C` (front-end gate bytes)
- `D177B8` (notification payload/state byte)
- `D14081` (late gate byte)

Direct RAM writes:

- `D14038` incremented every invocation
- `D1407B` cleared on the deep path
- `D14081` set to `1` on the deep path

Direct port I/O:

- none inside `0x014DAB` itself
- the ISR already acknowledged `0x5008` before calling this worker

Direct subcalls:

- `0x006EB6`: reads `IN0 A,(0x0F)` and returns `1` when bit 6 is set, else `0`
- `0x006FAF`: low-level hardware helper using low ports `0x03/0x0C/0x0A`
- `0x006F4D`: low-level hardware helper using low ports `0x07/0x09/0x0C/0x0A`
- `0x014D48`: shared record/timer helper, invoked three times with:
  - `BC = 0xD14405`
  - `BC = 0xD17770`
  - `BC = 0xD176C0`

Gate sequence:

1. Increment `D14038`.
2. If `D1407B != 0`, skip the early-zero gate chain.
3. Otherwise:
   - if `D1408D != 0`, go straight to the common tail
   - if `D1407C == 0`, go straight to the common tail
4. Compare `D14038` against `0x07D0`:
   - `D14038 <= 0x07D0` goes straight to the common tail
   - only `D14038 > 0x07D0` reaches the deeper path
5. Check `D177B8`:
   - `D177B8 >= 0x40` goes straight to the common tail
   - only `D177B8 < 0x40` reaches `0x006EB6`
6. Call `0x006EB6`:
   - zero return goes straight to the common tail
   - nonzero return continues
7. If `D14081 != 0`, go straight to the common tail.
8. Deep path only:
   - call `0x006FAF`
   - call `0x006F4D(1)` once
   - clear `D1407B`
   - set `D14081 = 1`
9. Common tail:
   - call `0x014D48` three times on `D14405`, `D17770`, and `D176C0`
   - return

Cross-check against earlier dynamic traces:

- Phase 61 already showed the threshold split at `D14038 > 0x07D0`.
- Phase 66 showed that `D177B8` is the second gate: values below `0x40` unlock `0x014DE6+`, while `0xFF` does not.
- Those dynamic results line up exactly with the static body decoded here.

Best-fit label:

- **byte0/bit3 USB/link state-gated notification/timeout worker**

It is not a raw port-ack ISR body and not a display trampoline. It looks like a deferred USB/link state machine worker: it counts invocations, tests staged RAM gates, optionally performs a deeper hardware handshake, then advances three RAM-resident records through the shared `0x014D48` helper.

## Bottom Line

- `0x009B35` belongs on the **USB/link masked-status service** side of the subsystem. Its main job is to suppress retriggering, sample status ports, and escalate into deeper USB routines depending on `usbInited` and `D14073`.
- `0x014DAB` belongs on the **USB/link deferred worker / notification side**. Its main job is to manage thresholds and staged state, optionally run deeper helper calls, and refresh three callback/record slots via `0x014D48`.

Generated from static ROM decoding in `TI-84_Plus_CE/probe-phase418-trace-usb-handlers.mjs`, with dynamic behavior cross-checked against the existing Phase 59 / 61 / 66 trace reports.
