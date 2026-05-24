# Phase 427 - 0x002553 Helper Report

## Summary

`0x002553` is not a division routine. It is a small ZDS II runtime helper that performs a 32-bit logical right shift on the value passed in `A:BC`, using `L` as the shift count, and returns the shifted result back in `A:BC`.

That changes the interpretation of the four `CALL 0x002553` sites inside `0x00E2EB`: they are not computing `pool_size / entry_count`. They are extracting address bytes from the already-computed table bases so those bytes can be packed into the descriptor headers.

## Function Boundaries And Size

- Previous helper ends at `0x002552` with `RET`.
- The true start is the next byte, `0x002553`.
- The helper body runs through `0x002574`.
- Total size: `0x22` bytes = 34 bytes.

Block layout:

| Range | Role |
| --- | --- |
| `0x002553..0x00255F` | prologue and register repack |
| `0x002561..0x002569` | shift loop |
| `0x00256B..0x002574` | epilogue and result repack |

## Calling Convention

- Input operand: `A:BC` as one 32-bit unsigned value.
- Input shift count: `L`.
- `HL` is saved and restored; only the original `L` value is consumed.
- Return value: the shifted 32-bit result comes back in `A:BC`.

Returned byte layout:

| Register | Returned bits |
| --- | --- |
| `C` | result bits `7..0` |
| `B` | result bits `15..8` |
| `BC` hidden upper byte | result bits `23..16` |
| `A` | result bits `31..24` |

So callers that only read `C` are computing:

`((input32 >> L) & 0xFF)`

The odd-looking `PUSH AF / DEC SP / PUSH BC / INC SP / POP AF` sequence is just a stack trick to expose the hidden top byte of the 24-bit `BC` register so the routine can shift a full 32-bit quantity even though only `B` and `C` are directly addressable as 8-bit registers.

## Division Algorithm Used

None. There is no division algorithm here.

The loop body is:

```asm
SRL A
RR  C
RR  H
RR  L
DJNZ 0x002561
```

The routine sets `B = L`, then does `INC B` and enters through the `DJNZ` tail so the shift body executes exactly `L` times. This is a plain repeated logical-right-shift across a 32-bit lane.

Equivalent C:

```c
uint32_t helper(uint32_t x, uint8_t shift) {
  return x >> shift;
}
```

There is no subtract/compare/remainder state anywhere in `0x002553`, so there is no quotient or remainder output.

## Return Value Location

- Full 32-bit return value: `A:BC`
- Most callers in this subsystem only care about `C`
- No remainder register exists because this is not division

## What The Four `0x00E2EB` Calls Actually Compute

The earlier part of `0x00E2EB` already does the real pool partitioning explicitly:

- `D13FD8 = root`
- `D13FDB = root + 0x40`
- `D13FDE = root + 0x80`
- `D13FE1 = root + 0xC0`

So by the time `0x002553` is called, the table bases already exist. The helper is only being used to extract byte 1 and byte 2 of those pointers.

### Call 1: `0x00E46D`

- Setup: `BC <- *(D13FDB)` and `A <- 0`, `L <- 8`
- Computation: `C = ((*(D13FDB) >> 8) & 0xFF)`
- Store: `(*(D13FD8) + 1) = C`

Meaning: descriptor A header byte 1 gets the middle byte of descriptor B's base pointer.

### Call 2: `0x00E482`

- Setup: `BC <- *(D13FDB)` and `A <- 0`, `L <- 16`
- Computation: `C = ((*(D13FDB) >> 16) & 0xFF)`
- Store: `(*(D13FD8) + 2) = C`

Meaning: descriptor A header byte 2 gets the high byte of descriptor B's base pointer.

### Call 3: `0x00E4B3`

- Setup: `BC <- *(D13FD8)` and `A <- 0`, `L <- 8`
- Computation: `C = ((*(D13FD8) >> 8) & 0xFF)`
- Store: `(*(D13FDB) + 1) = C`

Meaning: descriptor B header byte 1 gets the middle byte of descriptor A's base pointer.

### Call 4: `0x00E4CB`

- Setup: `BC <- *(D13FD8)` and `A <- 0`, `L <- 16`
- Computation: `C = ((*(D13FD8) >> 16) & 0xFF)`
- Store: `(*(D13FDB) + 2) = C`

Meaning: descriptor B header byte 2 gets the high byte of descriptor A's base pointer.

## The Computed Values

There is no `pool_size / entry_count` result anywhere in these four calls.

The concrete values being computed are:

| Call | Value extracted |
| --- | --- |
| `0x00E46D` | byte 1 of `root + 0x40` |
| `0x00E482` | byte 2 of `root + 0x40` |
| `0x00E4B3` | byte 1 of `root` |
| `0x00E4CB` | byte 2 of `root` |

This matches the surrounding code exactly:

- byte 0 is handled separately with `AND 0xE0` / `OR`
- bytes 1 and 2 come from `0x002553` with shifts 8 and 16

So the 4-byte descriptor header is being used as a compact pointer-plus-flags format:

- byte 0: low pointer high bits plus flags
- byte 1: pointer bits `15..8`
- byte 2: pointer bits `23..16`
- byte 3: cleared to `0`

## Other Callers Of `0x002553`

There are two ways the ROM reaches this helper:

1. Direct `CALL 0x002553`
2. `CALL 0x0001EC`, where `0x0001EC` is a vector stub: `JP 0x002553`

### Direct calls

- Direct call count: 6
- Sites: `0x00E46D`, `0x00E482`, `0x00E4B3`, `0x00E4CB`, `0x0153BE`, `0x01541D`

Representative non-descriptor example:

- `0x0153BE` and `0x01541D` in the display-region helper shift the 32-bit state `D17721:D1771E` right by 8, then store the full returned `A:BC` back into `D17721` and `D1771E`.

That only makes sense if `0x002553` returns a shifted 32-bit value, which is another confirmation that this is a shift helper and not a divider.

### Calls through vector `0x0001EC`

- Vector call count: 17
- Sites: `0x02EB3B`, `0x033C7F`, `0x033C93`, `0x033CA7`, `0x033DF8`, `0x033E0C`, `0x033E20`, `0x03B6A8`, `0x03B6BD`, `0x03B6EE`, `0x03B706`, `0x065DE0`, `0x071547`, `0x072BA8`, `0x072C23`, `0x072C6A`, `0x072CC1`

Representative examples:

- `0x02EB3B`: shift `D17721:D1771E` right by 16, then write returned `C/B` to `D17756/D17757`
- `0x033C7F`: shift a 32-bit `IX` argument right by 24, then store returned `C` into `(IY+0x11)`
- `0x072BA8`: shift a 32-bit `IX` local right by 27 as part of a packed-field extraction path

## Bottom Line

`0x002553` is a 32-bit logical-right-shift runtime helper, not a division helper.

Inside `0x00E2EB`, the four calls do pointer-byte extraction after the `+0x40/+0x80/+0xC0` table partitioning has already happened. The table partitioning arithmetic is explicit in the parent function; `0x002553` just helps pack the resulting pointer values into descriptor headers.
