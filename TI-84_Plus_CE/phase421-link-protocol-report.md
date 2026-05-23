# Phase 421: Link Protocol Handler Trace Report

## Context

Session 420 decoded the parent legacy TI-Link ISR at `0x0094C0`. Its bit-0 / bit-1 service paths call two deeper helpers:

- `0x00ED77` - handshake slot selector
- `0x00FE10` - transfer dispatcher

This pass traced both helpers directly from `ROM.rom`.

## Function 1: `0x00ED77` - handshake slot selector

| Field | Value |
|---|---|
| Start | `0x00ED77` |
| End | `0x00EE1A` |
| Size | `164` bytes |
| Port I/O | none |
| Calls | `0x002197`, `0x0021C2` |

### RAM and descriptor fields

- `D13FED` is treated as a 5-entry table of 24-bit descriptor pointers. The loop walks `D13FED + index*3` for `index = 0..4`.
- Each non-null descriptor is tested at:
  - `descriptor + 0x09`: primary match key / context pointer
  - `descriptor + 0x08`: flag byte, where bit 7 must be clear
- `D14014` is the primary live context pointer being matched.
- `D141E2` is a secondary latched context pointer used by a second gated compare path.

### Behavior

This routine does not touch the serial ports. The actual `0x3014` interrupt acknowledge and `0x3030` polling already happened in `0x0094C0`. At this layer the "handshake" is a software descriptor match:

1. Start with slot index `0`.
2. Load `descriptor = *(D13FED + index*3)`.
3. Skip null descriptors.
4. If `descriptor+9 == D14014` and the pointed object at `D14014` has bit 7 clear in its `+8` flag byte, return the slot index.
5. Otherwise, if `D141E2 == D14014`, re-run the same test using `D141E2`.
6. Increment the slot index and retry until `index == 5`.
7. Fall through with `A = 0`.

### Key finding

`0x00ED77` returns `A = 0` both when slot `0` matches and when no slot matches. That makes slot `0` behave like the default / fallback class. The caller therefore has to rely on the downstream descriptor null-check in `0x00FE10`, not on the return value alone.

## Function 2: `0x00FE10` - transfer dispatcher

| Field | Value |
|---|---|
| Start | `0x00FE10` |
| End | `0x01008D` |
| Size | `638` bytes |
| Port I/O | `IN A,(0x3030)` only |
| Calls | `0x002197`, `0x0021C2`, `0x002288`, `0x00276B`, `0x0022F9`, `0x00229D`, `0x00E1CC`, `0x00E4E8` |

### Absolute RAM touched

Reads:

- `D13FE7` - active descriptor pointer
- `D141EA` - link RX status latch
- `D1440F` - notification delivery status
- `D177B7` - USB/link initialized sentinel (`0x55`)
- `D14005`, `D14008`, `D1400B`, `D1400E` - shared display/cursor state used by the event-cluster tail

Writes:

- `D176FB = 1` on the deferred path
- `D1440E = 0` to clear the notification lock
- `D1400B` / `D1400E` updated through the common tail
- `D14076 = 0` on every return

### Descriptor field map inferred from indexed accesses

| Offset | Use |
|---|---|
| `+0` | callback pointer, loaded into `IY` and invoked via `CALL 0x002288` |
| `+8` | flag byte, bit 7 cleared before dispatch |
| `+9` | primary context pointer, also used by `0x00ED77` |
| `+12` | secondary working pointer |
| `+18` | size / start field |
| `+21` | size / limit field |
| `+27` | staged disposition/state written by `0x00FE10` |

### Behavior

`0x00FE10` consumes the slot number returned by `0x00ED77`, then dispatches only the transfer-capable descriptor classes:

1. Use the input slot number to fetch a descriptor pointer from `D13FED`.
2. Reject null descriptors and out-of-range slot values (`>= 5`).
3. Continue only for input slots `1` and `4`. Slots `0`, `2`, and `3` exit immediately.
4. Cache the descriptor's `+9` and `+12` pointers into local temporaries.
5. If the selected descriptor pointer matches `D13FE7`, clear bit 7 at `descriptor+8`, load the callback at `descriptor+0`, and dispatch it through `0x002288`.
6. Otherwise, set `D176FB = 1` and classify the transfer into local codes `0`, `1`, `2`, or `4` using:
   - `descriptor+8` bit 7
   - live `0x3030` bit 0
   - `D141EA`
   - `D1440F`
   - `D177B7 == 0x55`
   - null / non-null tests on the descriptor-linked pointers
7. Enter a common tail that:
   - clears `D1440E`
   - reworks `D1400B` / `D1400E` through `0x00E1CC` and `0x00E4E8`
   - writes a translated disposition value into `descriptor+27`
   - clears `D14076`

### Transfer types handled

There are two different "type" layers in this function:

- Input slot types from `0x00ED77`: only slot `1` and slot `4` are serviced here.
- Output disposition codes written to `descriptor+27`:
  - local `0` -> stored `0`
  - local `1` -> stored `3`
  - local `2` -> stored `5`
  - local `4` -> stored `7`

So `0x00FE10` is not a five-way hardware transfer engine. It is a two-slot dispatcher that translates the matched descriptor into one of four software disposition codes.

## Handshake and protocol interpretation

- `0x00ED77` and `0x00FE10` are not the low-level serial bit-bang handshake handlers. The parent ISR `0x0094C0` already owns the `0x3014` acknowledge loop and the `0x3030` / `0x3031` hardware tests.
- `0x00ED77` is the software slot-selector that decides which runtime descriptor best matches the current link context.
- `0x00FE10` is the descriptor dispatcher. Its only direct hardware observation is a read of `0x3030` bit 0.
- The callback/event shape matches the earlier `0x00F000-0x00FFFF` event-cluster work from phase 316 and the notification lock/status work from phases 410-416.

## Connection to `D176F8` and `D17795`

- Neither routine writes `D176F8` or `D17795` directly.
- `0x00FE10` does write `D176FB = 1`, and phase 412 / 416 showed `D176FB` is the nearby notification/ack side-flag that frequently travels with the `D176F8` protocol cluster.
- The values written to `descriptor+27` are `0`, `3`, `5`, and `7`. Those overlap exactly with meaningful `D17795` state values identified in phase 417:
  - `0` = idle
  - `3` = negotiating
  - `5` = active
  - `7` = extended-path state
- That means `0x00FE10` looks like an upstream state-staging layer. It prepares per-descriptor state in a `D17795`-compatible encoding, but the actual FSM writes still happen downstream in the `0x0120AA` / `0x0132xx` / `0x0135xx` worker family traced in phases 409, 411, and 417.

## Practical call-chain summary

The effective software flow is:

`0x0094C0` IRQ bit ack / port polling
-> `0x00ED77` slot select (`0..4`, with `0` as default)
-> `0x00FE10` slot `1` / `4` dispatch and disposition staging
-> callback pointer at `descriptor+0` via `0x002288`
-> downstream link workers that actually mutate `D176F8` and `D17795`

## Key RAM variables to keep in mind

- `D14049`: only used by the parent ISR `0x0094C0`, not by these two callees.
- `D14014` / `D141E2`: live and latched context pointers used by the slot selector.
- `D13FED` / `D13FE7`: runtime descriptor table and active descriptor pointer.
- `D141EA`: link RX status latch that biases deferred dispatch.
- `D1440E` / `D1440F`: notification lock and delivery-status bytes.
- `D176FB`: notification/ack flag set by the deferred path.
- `D176F8` / `D17795`: downstream FSM bytes; not touched directly here, but fed indirectly by the descriptor callback chain.
