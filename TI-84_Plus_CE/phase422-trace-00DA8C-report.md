# Phase 422: Trace of `0x00DA8C` (Legacy Link Disconnect Helper)

## Summary

- `0x00DA8C` spans `0x00DA8C..0x00DB65` (`0xDA` bytes / `218` decimal) and ends at the `RET` at `0x00DB65`.
- The session-420 ISR caller at `0x0095AA` always pushes `0`, so the live disconnect path is the `arg == 0` branch.
- `arg == 0` does not directly clear protocol bytes like `D176F8`, `D177BB`, or `D141EA`. Instead it tears down control bits on `0x3010`, optionally clears bits `5` and `4` through sibling helpers, arms the notification installer `0x014E3F`, and finally clears `D1440E` when the port transition completes.
- All immediate callers found in ROM push only `0` or `1`, so the routine is a two-mode control-line helper: `0` = deassert/disconnect, `1` = assert/arm.

## Function Boundary

| Item | Value |
| --- | --- |
| Start | `0x00DA8C` |
| End | `0x00DB65` |
| Size | `0xDA` bytes (`218`) |
| Exit | `RET` at `0x00DB65` |

## Disconnect Cleanup Path (`arg == 0`)

This is the path used by the parent legacy ISR `0x0094C0`.

1. Reject any nonzero argument other than `1`; only `0` and `1` are serviced.
2. Read `0x3010 bit0`. If it is already clear, return immediately.
3. If `0x3010 bit5` is set, call `0x00DB66(0)`:
   - clear `0x3010 bit5`
   - call `0x014E3F` with stacked code `0x0032`
   - poll `0x3015 bit7`
   - abort the poll if `D1440F != 0` or `D177B7 != 0x55`
   - on success, clear `D1440E`
4. If `0x3010 bit4` is set, call `0x00DC0E(0)`:
   - clear `0x3010 bit4`
   - call `0x014E3F` with stacked code `0x0032`
   - poll `0x3015 bit6`
   - use the same `D1440F` / `D177B7` break conditions
   - on success, clear `D1440E`
5. Clear `0x3010 bit0`.
6. Call `0x014E3F` with stacked code `0x0014`.
7. Poll `0x3010 bit0` until it reads back clear. While waiting, exit the loop if `D1440F != 0` or `D177B7 != 0x55`.
8. On the clean-success path, execute `XOR A; LD (D1440E),A` and return.

## Assert/Arm Sibling Path (`arg == 1`)

- If `0x3010 bit0` is already set, return.
- Otherwise set `0x3010 bit0`, call `0x014E3F(0x0014)`, then poll until bit0 reads back set.
- This is the mirror of the disconnect path and explains why callers only use arguments `0` and `1`.

## State Variables Cleared Or Modified

### Direct in `0x00DA8C`

| Address | Access | Meaning |
| --- | --- | --- |
| `D1440E` | write | notification lock cleared on successful completion |
| `D1440F` | read | notification delivery-status byte; breaks wait loops when nonzero |
| `D177B7` | read | USB/link sentinel; loops continue only while it stays `0x55` |

### Indirect through `0x014E3F`

Using the phase 411 trace of `0x014E3F`:

| Address | Access | Effect |
| --- | --- | --- |
| `D14408` | write | stores the stacked event / notification code (`0x14` or `0x32`) |
| `D14405` | write | cleared to `0` |
| `D1440B` | write | snapshot of `D14038` |
| `D1440E` | write | cleared before install, then re-armed to `1` |
| `D1440F` | write | cleared to `0` |

### Not touched directly

- No direct writes to `D176F8`, `D176FB`, `D177BB`, `D17795`, `D17796`, `D141EA`, `D141E7`, `D141E8`, or `D141EB` occur inside `0x00DA8C`.
- The parent ISR `0x0094C0` performs the protocol-side follow-up after return: it clears `D141EA` and calls `0x01322D(2)`.

## Ports Touched

### Direct in `0x00DA8C`

| Port | Access | Bits used | Role |
| --- | --- | --- | --- |
| `0x3010` | read-modify-write + poll | `bit0`, `bit4`, `bit5` | global USB/link control port; disconnect path clears bit5, clears bit4, then clears bit0 |

### Indirect via nested helpers

| Port | Helper | Bits used | Role |
| --- | --- | --- | --- |
| `0x3010` | `0x00DB66` | `bit5` | clear or set auxiliary control bit 5 |
| `0x3010` | `0x00DC0E` | `bit4` | clear or set auxiliary control bit 4 |
| `0x3015` | `0x00DB66` | `bit7` | completion/status poll for the bit5 helper |
| `0x3015` | `0x00DC0E` | `bit6` | completion/status poll for the bit4 helper |

No `0x3030` or `0x3031` I/O occurs inside `0x00DA8C`; those live in the caller-side ISR logic.

## CALL Targets

| Target | Role | Sites in `0x00DA8C` |
| --- | --- | --- |
| `0x00218A` | stack-frame helper | `0x00DA8C` |
| `0x014E3F` | notification state installer | `0x00DABD`, `0x00DB3C` |
| `0x00DB66` | bit5 helper: toggle `0x3010 bit5`, poll `0x3015 bit7`, install code `0x32` | `0x00DB08` |
| `0x00DC0E` | bit4 helper: toggle `0x3010 bit4`, poll `0x3015 bit6`, install code `0x32` | `0x00DB1D` |

## Direct Caller Pattern

Immediate call-site scan found only two stacked argument values:

- `0x000000` — disconnect / deassert mode
- `0x000001` — assert / arm mode

The session-420 path is `0x0095AA`, where `0x0094C0` pushes `0` and calls `0x00DA8C` only after:

- `0x3030 bit1` reports RX-ready
- `0x3030 bit0` reports not-busy

That makes `0x00DA8C(0)` the control-port half of the legacy disconnect sequence.

## Relationship To The Other Two ISR Callees

- `0x00ED77` is the descriptor / slot matcher for data-bearing link traffic.
- `0x00FE10` is the transfer dispatcher that stages per-descriptor disposition and notification flags.
- `0x00DA8C` does neither of those jobs. It is the control-port teardown helper reached from the `0x0094C0` bit-2 status-change branch when `0x3030 bit1` reports RX-ready and `0x3030 bit0` says the line is not busy.
- After `0x00DA8C(0)` returns, `0x0094C0` performs the software-side cleanup that `0x00DA8C` itself does not do:
  - `D141EA = 0`
  - `CALL 0x01322D(2)`

## Bottom Line

`0x00DA8C` is the legacy link disconnect control helper, but its cleanup is narrow and hardware-facing:

- it deasserts `0x3010 bit0`
- it optionally drops auxiliary `0x3010 bit5` and `bit4` first
- it arms notification / event records through `0x014E3F` using codes `0x14` and `0x32`
- it clears `D1440E` when the hardware poll succeeds

It does not directly reset the higher-level protocol bytes; that happens in the surrounding ISR after the helper returns.
