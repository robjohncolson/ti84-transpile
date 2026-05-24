# Phase 423: Link TX/RX Drain Primitive Report

## Summary

- `0x00DB66..0x00DC0D` and `0x00DC0E..0x00DCB5` are exact function boundaries, each `0xA8` bytes (`168` decimal).
- The two helpers are structurally identical siblings. The only meaningful differences are the controlled bit on port `0x3010` and the status bit polled on port `0x3015`.
- Static evidence does **not** show any payload-byte transmit or receive loop. There are no accesses to link data ports like `0x3030`/`0x3031`, no RAM FIFO walks, and no per-byte buffer reads or writes.
- Best interpretation: these are per-direction control-line arm/drain helpers.
  - `arg == 1`: assert a direction bit on `0x3010`, then wait for the corresponding `0x3015` status bit to rise.
  - `arg == 0`: clear that direction bit, then wait for the corresponding `0x3015` status bit to fall.
  - any other nonzero arg: return immediately.
- In the forced-disconnect path from `0x00DA8C(0)`, only the `arg == 0` branches are used, so "drain" here means "deassert this direction and wait for its status latch to go idle."

## Function 1: `0x00DB66..0x00DC0D`

This is the helper used when `0x00DA8C(0)` sees `0x3010 bit5` still set.

| Field | Value |
| --- | --- |
| Start | `0x00DB66` |
| End | `0x00DC0D` |
| Size | `0xA8` bytes (`168`) |
| Control port/bit | `0x3010 bit5` |
| Status port/bit | `0x3015 bit7` |
| CALL targets | `0x00218A`, `0x014E3F` |
| Absolute RAM reads | `D1440F`, `D177B7` |
| Absolute RAM writes | `D1440E` |

### Port I/O

- `.SIS LD BC,0x3010` / `LD BC,0x3010`
- `IN A,(C)` to read the current control-bit state
- `SET 5,A` or `RES 5,A`
- `OUT (C),A` to commit the new control-bit state
- `.SIS LD BC,0x3015`
- `IN A,(C)` plus `AND 0x80` to poll status bit 7

There is no other hardware I/O in the routine.

### RAM usage

- `LD A,(D1440F)` reads the shared notification-delivery status byte.
- `LD A,(D177B7)` reads the USB/link initialized sentinel and compares it to `0x55`.
- `LD (D1440E),A` clears the notification lock byte before return.

No other `0xD00000+` addresses are touched.

### CALL targets

- `0x00218A` at `0x00DB66`: stack-frame helper / prologue stub.
- `0x014E3F` at `0x00DB97` and `0x00DBE6`: always reached after `LD BC,0x0032; PUSH BC`.

### Control flow

1. `0x00DB6A`: load the stacked argument from `(IX+0x06)`.
2. `0x00DB6D..0x00DB6F`: compare to `1`.
3. `arg == 1` path (`0x00DB71..0x00DBBA`):
   - read `0x3010`, test bit 5
   - if bit 5 is already set, return immediately
   - otherwise set bit 5 and write it back
   - verify `B == 0x30` and `C == 0x10`; otherwise `RST 0x08`
   - push `0x0032` and call `0x014E3F`
   - poll `0x3015 bit7` until it becomes `1`
   - the loop also breaks if `D1440F != 0` or `D177B7 != 0x55`
   - clear `D1440E` and return
4. `arg == 0` path (`0x00DBBC..0x00DC09`):
   - if the argument is nonzero, return immediately
   - read `0x3010`, test bit 5
   - if bit 5 is already clear, return immediately
   - otherwise clear bit 5 and write it back
   - run the same BC assertion
   - push `0x0032` and call `0x014E3F`
   - poll `0x3015 bit7` until it becomes `0`
   - the same `D1440F` / `D177B7` break conditions apply
   - clear `D1440E` and return

### What "TX drain" means here

Static evidence does not support "send one byte" or "flush a RAM transmit buffer":

- there is no data register access
- there is no loop over memory or descriptor tables
- there is no staging of a payload byte in `A`, `HL`, `DE`, or `BC`

The helper only toggles `0x3010 bit5` and waits on `0x3015 bit7`. The safest interpretation is:

- `arg == 1`: arm/assert the TX-side control bit and wait until hardware reports the TX-side status bit high
- `arg == 0`: drop that control bit and wait until the TX-side status bit goes low

So in forced disconnect cleanup, "draining TX" means "request TX idle/flush completion and wait for the TX status latch to clear." The helper itself does not serialize a byte.

## Function 2: `0x00DC0E..0x00DCB5`

This is the helper used when `0x00DA8C(0)` sees `0x3010 bit4` still set.

| Field | Value |
| --- | --- |
| Start | `0x00DC0E` |
| End | `0x00DCB5` |
| Size | `0xA8` bytes (`168`) |
| Control port/bit | `0x3010 bit4` |
| Status port/bit | `0x3015 bit6` |
| CALL targets | `0x00218A`, `0x014E3F` |
| Absolute RAM reads | `D1440F`, `D177B7` |
| Absolute RAM writes | `D1440E` |

### Port I/O

- `.SIS LD BC,0x3010` / `LD BC,0x3010`
- `IN A,(C)` to read the current control-bit state
- `SET 4,A` or `RES 4,A`
- `OUT (C),A` to commit the new control-bit state
- `.SIS LD BC,0x3015`
- `IN A,(C)` plus `AND 0x40` to poll status bit 6

There is no other hardware I/O in the routine.

### RAM usage

Identical to `0x00DB66`:

- reads `D1440F`
- reads `D177B7`
- writes `D1440E`

No other `0xD00000+` RAM is accessed.

### CALL targets

- `0x00218A` at `0x00DC0E`
- `0x014E3F` at `0x00DC3F` and `0x00DC8E`, both times with stacked `BC = 0x0032`

### Control flow

The logic is byte-for-byte parallel to `0x00DB66`, with only the masks changed:

1. `arg == 1` path:
   - test `0x3010 bit4`
   - if already set, return
   - otherwise set bit 4, verify BC, call `0x014E3F(0x0032)`
   - poll `0x3015 bit6` until it becomes `1`
   - break early if `D1440F != 0` or `D177B7 != 0x55`
   - clear `D1440E` and return
2. `arg == 0` path:
   - reject any nonzero arg other than `1`
   - if `0x3010 bit4` is already clear, return
   - otherwise clear bit 4, verify BC, call `0x014E3F(0x0032)`
   - poll `0x3015 bit6` until it becomes `0`
   - use the same `D1440F` / `D177B7` break conditions
   - clear `D1440E` and return

### What "RX drain" means here

Again, there is no byte-receive logic in the helper:

- no byte is read from a data port
- no buffer pointer is advanced
- no absolute RAM FIFO is drained

So this is not "receive a byte" in the literal sense. It is the RX-side mirror of the TX helper:

- `arg == 1`: arm/assert the RX-side control bit and wait for the RX-side status bit to rise
- `arg == 0`: clear that control bit and wait for the RX-side status bit to fall

In the disconnect cleanup path, "draining RX" therefore means "drop the RX-ready/armed state and wait until the RX-side status latch goes idle." The helper does not consume buffered receive bytes itself.

## Shared observations

- Both helpers restore `IX` and return through the same three-instruction epilogue: `LD SP,IX; POP IX; RET`.
- Both helpers use the same event/notification callout:
  - `LD BC,0x0032`
  - `PUSH BC`
  - `CALL 0x014E3F`
- Both helpers clear `D1440E` after leaving the poll loop, regardless of whether the loop ended because the status bit reached the requested state or because `D1440F` / `D177B7` forced an early exit.
- Both helpers are symmetric hardware-facing wrappers around the `0x3010`/`0x3015` pair. The byte-level legacy serial protocol work lives elsewhere, notably the parent ISR at `0x0094C0` and its higher-level link workers.

## Bottom line

The phase-422 caller names were directionally useful but a little too literal. From the ROM bytes alone:

- `0x00DB66` is a TX-side control-bit arm/drain helper
- `0x00DC0E` is an RX-side control-bit arm/drain helper
- neither helper moves payload bytes

The disconnect cleanup at `0x00DA8C(0)` uses the `arg == 0` halves of these routines to deassert any still-armed TX/RX side conditions and wait for their corresponding `0x3015` status bits to go idle before the outer helper finally drops `0x3010 bit0`.
