# Phase 421 - 0x0075F7 USB Init/Delay Helper Trace

## Function boundary

- Start: `0x0075F7`
- End: `0x007618` (`RET`)
- Size: `0x22` bytes (`34` bytes)
- Static direct callers found in ROM: `0x00C9DE` only

## What it is

`0x0075F7` is not a busy-wait or delay helper.

It is a very small hardware-sequencing helper:

1. Build a standard `IX` stack frame.
2. Load `BC = 0x3124`.
3. Read the low byte of the caller-pushed argument from `(IX+6)`.
4. Mask it with `0x07`.
5. `OUT (C),A` to port `0x3124`.
6. Sanity-check that `B == 0x31` and `C == 0x24`, trapping through `RST 0x08` if the port selector is wrong.
7. Return.

There is no port polling, no decrement loop, no `DJNZ`, and no timer-style delay pattern.

## Meaning of the `BC = 7` parameter

At `0x00C9D9..0x00C9DE`, the caller does:

- `LD BC,0x000007`
- `PUSH BC`
- `CALL 0x0075F7`

Inside `0x0075F7`, only the low byte of that stacked value is consumed, via `LD A,(IX+6)` followed by `AND 0x07`.

That means:

- `BC = 7` is not a loop count.
- `BC = 7` is not a delay multiplier.
- `BC = 7` is a 3-bit control value/select field for port `0x3124`.

In this call site, the helper emits `0x07` directly to `0x3124`.

## Ports and RAM accessed

### Port I/O

| Port | Access | Value | Notes |
| --- | --- | --- | --- |
| `0x3124` | write | `(stack_arg_low & 0x07)` | with caller `BC=7`, the write becomes `0x07` |

### RAM / stack accesses

| Location | Access | Notes |
| --- | --- | --- |
| `(IX+6)` | read | low byte of the caller-pushed `BC` argument |
| stack via `PUSH IX` / `POP IX` | save/restore | normal frame setup/teardown only |

No absolute RAM variables are read or written by this function.

## Loops and control flow

The only backward branch is:

- `0x007614: JR NZ,0x007610`

That branch does not implement waiting. It just loops back into the `RST 0x08` trap path if `C != 0x24`, so it is a selector-integrity check, not a delay loop.

## Best-fit interpretation

`0x0075F7` is a one-register USB/link controller helper used by the larger `0x00C9A0` reset sequence to program port `0x3124` with a 3-bit mode value. The phase 420 caller passes `7`, so the reset path is selecting mode/value `0x07` before continuing with the larger `0x314C` / `0x313x` / `0x310x` re-init sequence.
