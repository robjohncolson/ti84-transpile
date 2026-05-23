# Phase 419: Trace 0x014D48 Shared Notification Channel Scanner

## Summary

- `0x014D48..0x014DAA` is a 99-byte helper shared by the USB/link worker at `0x014DAB`.
- `0x014DAB` calls it three times with the three known notification-channel blocks:
  - Channel 1: `0xD14405`
  - Channel 2: `0xD17770`
  - Channel 3: `0xD176C0`
- Its behavior is a generic "armed channel scanner": check the channel flags, compare the global rolling counter against per-channel state, mark completion, and optionally dispatch a callback.

## Input Register

- Caller-side argument register: `BC`.
  - `0x014E20`, `0x014E2A`, and `0x014E34` each do `LD BC,<channel_base> ; PUSH BC ; CALL 0x014D48`.
- Effective in-function channel pointer register: `IY`.
  - Every meaningful field access in `0x014D48` is against `+0/+3/+6/+9/+10` using `FD`-prefixed indexed instructions.
  - The local decoder also prints a repeated `DD 31 06` opcode before each cluster of field accesses, but that exact reading is not trustworthy here because the function still exits through the standard IX-frame epilogue `LD SP,IX ; POP IX ; RET`.
  - The stable conclusion is that the helper operates over one active channel block at offsets `+0/+3/+6/+9/+10`, and `0x014DAB` supplies that block handle from `BC`.

## Function Range

- Start: `0x014D48`
- End: `0x014DAA`
- Size: `0x63` bytes (99 decimal)
- RET: `0x014DAA`

## Disassembly-Derived Logic

1. Prologue:
   - `LD HL,0xFFFFFD`
   - `CALL 0x002197`
   - This is the standard 3-byte local-frame setup.
2. Channel armed/completed gates:
   - Read `channel_base + 0x09`
   - If zero, return immediately
   - Read `channel_base + 0x0A`
   - If non-zero, return immediately
3. Counter/threshold compare:
   - Load `HL = (0xD14038)` (global rolling counter)
   - Load `BC = channel_base + 0x06`
   - `elapsed = D14038 - *(channel_base + 0x06)`
   - Load `BC = channel_base + 0x03`
   - Compare `elapsed` against `*(channel_base + 0x03)`
   - If carry is set after the second subtract, return
4. Success path:
   - Write `1` to `channel_base + 0x0A`
   - Load `HL = *(channel_base + 0x00)`
   - `CALL 0x0021C2` to null-check `HL`
   - If null:
     - write `0` to `channel_base + 0x09`
     - return
   - If non-null:
     - load `IY = *(channel_base + 0x00)`
     - `CALL 0x002288`
     - return

## What It Checks

- `channel_base + 0x09`: active/armed flag
  - zero means "nothing pending"
- `channel_base + 0x0A`: completion/status flag
  - non-zero means "already completed"
- `channel_base + 0x06`: prior snapshot of `D14038`
  - used as the start value for the elapsed calculation
- `channel_base + 0x03`: 24-bit compare operand
  - the helper subtracts it from the elapsed value and returns while the result is still negative/carry
  - this is timeout-like behavior, even though earlier staging traces had only identified this slot as a stored per-channel parameter
- `channel_base + 0x00`: callback pointer slot
  - null means "mark complete and clear active flag without dispatch"
  - non-null means "dispatch callback through `JP (IY)`"

## Success vs Failure

- Fails early when:
  - the active flag is clear
  - the completion flag is already set
  - the elapsed counter has not yet reached the value in `channel_base + 0x03`
- Succeeds when:
  - active is set
  - completion is clear
  - elapsed has reached/exceeded the compare operand
- On success:
  - `channel_base + 0x0A` is set to `1`
  - if `channel_base + 0x00` is non-null, the callback is invoked through `0x002288`
  - if `channel_base + 0x00` is null, `channel_base + 0x09` is cleared to `0`

## RAM Accesses

Global:

- `0xD14038`
  - read once as the master rolling counter

Channel-relative:

| Offset | Access | Role in `0x014D48` |
| --- | --- | --- |
| `+0x00` | read | Callback pointer slot; null-checked and, if non-null, loaded into `IY` before `CALL 0x002288` |
| `+0x03` | read | 24-bit compare operand used in the elapsed-vs-threshold subtract |
| `+0x06` | read | 24-bit `D14038` snapshot used to compute elapsed time |
| `+0x09` | read, write | Active/armed flag; read at entry, cleared on the null-callback path |
| `+0x0A` | read, write | Completion/status flag; read at entry, set to `1` on success |

Concrete addresses per channel:

| Channel | Base | `+0x00` | `+0x03` | `+0x06` | `+0x09` | `+0x0A` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `0xD14405` | `0xD14405` | `0xD14408` | `0xD1440B` | `0xD1440E` | `0xD1440F` |
| 2 | `0xD17770` | `0xD17770` | `0xD17773` | `0xD17776` | `0xD17779` | `0xD1777A` |
| 3 | `0xD176C0` | `0xD176C0` | `0xD176C3` | `0xD176C6` | `0xD176C9` | `0xD176CA` |

## Call Targets

- `0x002197`
  - standard IX-frame helper / prologue
- `0x0021C2`
  - `HL == 0` null-check helper
- `0x002288`
  - shared `JP (IY)` indirect-call trampoline

## Connection To The Known Channel Blocks

Channel 2 (`0xD17770`) and Channel 3 (`0xD176C0`) already had staging functions decoded earlier:

- Channel 2 staging (`0x0151FE`) populates:
  - `+0x00 = 0x015185`
  - `+0x03 = caller-supplied 24-bit value`
  - `+0x06 = D14038`
  - `+0x0A = 0`
  - `+0x09 = 1`
- Channel 3 staging (`0x0151A7`) populates:
  - `+0x00 = 0x01516F`
  - `+0x03 = value copied from D176CB`
  - `+0x06 = D14038`
  - `+0x0A = 0`
  - `+0x09 = 1`

`0x014D48` is the shared follow-up scanner for exactly that layout:

- it ignores inactive entries
- it ignores entries already marked complete
- it compares the global counter against the staged `+0x06` and `+0x03` fields
- it flips `+0x0A = 1`
- it either dispatches the staged callback at `+0x00` or clears `+0x09` if no callback is installed

Channel 1 (`0xD14405`) uses the same slot layout but is populated by `0x014E3F` instead of the Channel 2/3 staging helpers:

- `0x014E3F` writes:
  - `+0x03 = D14408` (saved block pointer)
  - `+0x06 = D1440B` (`D14038` snapshot)
  - `+0x00 = 0`
  - `+0x0A = 0`
  - `+0x09 = 1`

That means Channel 1 participates in the same generic scan, but its callback slot is explicitly null, so the "null callback -> clear active flag" path is the only possible completion path inside `0x014D48`.

## Bottom Line

`0x014D48` is the shared notification-channel scanner for the three RAM blocks at `D14405`, `D17770`, and `D176C0`. It treats all three as the same 11-byte layout:

- `+0x00` callback pointer
- `+0x03` 24-bit compare operand
- `+0x06` start/context snapshot
- `+0x09` active flag
- `+0x0A` completion flag

Its job is:

1. Wait until a channel is active and not yet complete.
2. Compare the global rolling counter `D14038` against the per-channel `+0x06/+0x03` state.
3. Mark the channel complete.
4. Dispatch the callback if one exists; otherwise clear the active flag directly.
