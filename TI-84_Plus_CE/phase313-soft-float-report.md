# Phase 313 - Soft-float decode

## Summary

- The compiler helper family behind vectors `0x00026C..0x000290` is **not** the TI OS 9-byte OP1/OP2 real format used by the higher-level math ROM calls. It is a separate **4-byte IEEE-754 single-precision** helper bank.
- Operands are passed split across a 24-bit pair plus a high byte:
  - lhs = `BC` low 24 bits + `A` high byte
  - rhs = `HL` low 24 bits + `E` high byte
- `_fadd` and `_fmul` both call the shared unpacker at `0x0034A7`. `_fcmp` does **not**; it compares packed words through `0x0023AD` and returns flags only.
- The unpackers flush exponent-0 inputs to zero, so subnormals are effectively treated as `0.0`.

## Float format

The byte layout reconstructed from `_fpunpack` (`0x0034A7`), `_fpunpack_rhs` (`0x0034CC`), and the `FLTMAX` literal (`0x003565`) matches standard little-endian IEEE-754 single precision:

| Byte | Bits | Meaning |
| --- | --- | --- |
| `byte0` | `7..0` | fraction bits `7..0` |
| `byte1` | `7..0` | fraction bits `15..8` |
| `byte2` | `7` | exponent bit `0` |
| `byte2` | `6..0` | fraction bits `22..16` |
| `byte3` | `7` | sign |
| `byte3` | `6..0` | exponent bits `7..1` |

Equivalent packed word:

- `sign = byte3.bit7`
- `exponent = ((byte3 & 0x7F) << 1) | (byte2 >> 7)`
- `fraction = ((byte2 & 0x7F) << 16) | (byte1 << 8) | byte0`

The vector `FLTMAX` at `0x000294` jumps to the literal bytes `FF FF 7F 7F`, which decode as `0x7F7FFFFF`. That is the canonical IEEE-754 `FLT_MAX`, which confirms the format.

## `_fpunpack` and `_fppack`

### `_fpunpack` at `0x0034A7`

This helper unpacks the first operand from `BC+A`.

Key steps:

1. `RLC (IX-1)` / `SCF` / `RR (IX-1)` operates on the saved top byte of `BC`.
   - original `byte2.bit7` is captured into carry
   - `byte2.bit7` is then forced to `1`, restoring the hidden leading bit
2. `RL A` shifts the 7 exponent-high bits in `A` left and injects the saved low exponent bit from carry.
   - result: `A = full 8-bit exponent`
   - carry out: original sign bit from `A.bit7`
3. `RL D` stores that sign bit in `D.bit0`.
4. If the rebuilt exponent is zero, the routine clears `BC` and the sign, so exponent-0 inputs become `0.0`.

### `_fpunpack_rhs` at `0x0034CC`

This is the mirrored unpacker for the second operand in `HL+E`.

Instead of rotating the saved top byte first, it uses `ADD HL,HL` to shift the low 24 bits left once and pull `byte2.bit7` into carry. `RL E` then rebuilds the full exponent in `E`, with the sign coming out through carry and being written into `D.bit0`.

### `_fppack` at `0x0034EE`

`_fppack` is the inverse helper:

- input mantissa: `A:BC`
- input exponent: `E`
- input sign: `D.bit0`

It normalizes the mantissa, rounds, detects underflow/overflow, and repacks the exponent/sign split back into:

- `BC` low 24 bits
- `A` high byte

This helper is the common exit path for `_fadd`, `_fdiv`, `_fmul`, `_ltof`, and the commented `_ultof` wrapper.

## `_fadd` at `0x003569`

`_fadd` is a classic exponent-align / add-subtract / normalize routine.

Observed structure:

1. Unpack lhs through `_fpunpack`.
2. Save lhs sign in carry and exponent in `AF`.
3. Unpack rhs through `_fpunpack_rhs`.
4. Compare exponents and swap the two operand tuples if needed so `A/BC` is always the operand with the **smaller** exponent.
5. Compute the exponent delta in `A`.
   - the shift loop at `0x003593..0x0035A4` right-shifts the smaller mantissa (`BC`) until the exponents match
   - if the delta is too large, the smaller operand is discarded and the larger operand is repacked directly
6. Use the sign-combination state in `D` to choose:
   - same-sign add path at `0x0035BB`
   - opposite-sign subtract path at `0x0035B6`
7. Feed the carry/borrow into `A` with `ADC A,A`, copy the result mantissa into `BC`, then call `_fppack`.

So the effective algorithm is:

- unpack
- align smaller operand
- add or subtract mantissas
- normalize / repack

## `_fmul` at `0x00372B`

`_fmul` is a 24x24-bit multiply with explicit partial products.

High-level flow:

1. Unpack lhs, save its mantissa on the stack, keep `exp(lhs)` in `C` and `sign(lhs)` in `A`.
2. Unpack rhs.
3. `XOR D` computes `sign(lhs) XOR sign(rhs)`.
4. Build the exponent seed as:

   - `exp(lhs) + exp(rhs) - 0x80`

   The `0x80` subtract is the multiply-side normalization bias; the stored format itself is still normal IEEE single precision.

5. The block at `0x00376D..0x0037C8` performs the mantissa multiply with repeated `MLT` instructions:
   - multiply byte pairs
   - accumulate cross terms into 24-bit stack scratch
   - fold the high carry bits back into the top byte
6. The final `SLA C / ADC HL,HL / ADC A,A` sequence folds the remaining extra bits into the `A:BC` mantissa expected by `_fppack`.
7. `_fppack` performs the final normalization and repacking.

This is a straightforward schoolbook multiply on restored 24-bit significands.

## `_fcmp` at `0x0035C8`

`_fcmp` is shorter than the arithmetic helpers because it never unpacks into normalized significands.

Flow:

1. Call `0x0023AD`.
   - that helper compares the packed 32-bit tuples directly
   - its flags behave like a subtraction of `rhs - lhs`
2. If `Z=1`, return immediately for equality.
3. Otherwise, `_fcmp` rewrites the saved `F` byte:
   - it uses the rhs sign byte (`E`) and the raw overflow/sign state from `0x0023AD`
   - it flips bit 7 of `F` when needed so callers can use normal signed branches (`JP M`, `JP P`, `JR Z`, and so on)
4. Return with the final comparison result in `AF`.

Important correction to the session-312 guess:

- `_fcmp` does **not** contain `CALL 0x0034A7`
- the direct `_fpunpack` call check is:
  - `_fadd`: yes
  - `_fmul`: yes
  - `_fcmp`: no

## `_fdiv`, `_fsub`, `_fneg`, and the nearby wrappers

### `_fdiv` at `0x0035E5`

`_fdiv` unpacks both operands, XORs the signs, and seeds the exponent with:

- `0x96 + exp(lhs) - exp(rhs)`

It then runs a restoring-division loop at `0x003614..0x00362A`:

- `HL/A` holds the shifting remainder
- `BC` is the divisor mantissa
- `IY` accumulates quotient bits
- `IX` tracks the exponent / iteration state

After the loop it rounds the quotient and calls `_fppack`.

### `_fsub` at `0x0037FC`

`_fsub` is only a sign-flip wrapper:

1. save `AF`
2. `E ^= 0x80`
3. call `_fadd`
4. restore `E`
5. restore `AF`

So subtract is implemented as add-with-negated-rhs.

### `_fneg` at `0x0037EB`

`_fneg` toggles the sign bit in the high byte and leaves exact zero canonicalized as positive zero.

### `_ltof` at `0x003704` and commented `_ultof` at `0x00380D`

Both are thin front-ends to `_fppack`:

- `_ltof` handles signed input first
- the vector slot at `0x000280` is commented out as `_ultof` in `ti84pceg.inc`, and its target `0x00380D` is an unsigned wrapper that loads `D=0`, `E=0x96`, then calls `_fppack`

## Soft-float entry points found

Core arithmetic / packing family in the vector bank:

| Vector | Name | Target | Notes |
| --- | --- | --- | --- |
| `0x00026C` | `_fppack` | `0x0034EE` | normalize + repack helper |
| `0x000270` | `_fadd` | `0x003569` | add |
| `0x000274` | `_fcmp` | `0x0035C8` | compare, flags only |
| `0x000278` | `_fdiv` | `0x0035E5` | divide |
| `0x00027C` | `_ftol` | `0x003663` | float to signed long |
| `0x000280` | `_ultof` (commented in include) | `0x00380D` | unsigned long to float wrapper |
| `0x000284` | `_ltof` | `0x003704` | signed long to float |
| `0x000288` | `_fmul` | `0x00372B` | multiply |
| `0x00028C` | `_fneg` | `0x0037EB` | negate |
| `0x000290` | `_fsub` | `0x0037FC` | subtract via `_fadd` |
| `0x000294` | `FLTMAX` | `0x003565` | literal `0x7F7FFFFF`, not code |

Additional float/vector-bank entries nearby:

| Vector | Name | Target |
| --- | --- | --- |
| `0x000298` | `sqrtf` | `0x003818` |
| `0x00029C` | `_frbtof` | `0x00388B` |
| `0x0002A0` | `_frftob` | `0x0038A9` |
| `0x0002A4` | `_frftoub` | `0x0038ED` |
| `0x0002A8` | `_frftoi` | `0x0038BA` |
| `0x0002AC` | `_frftoui` | `0x003931` |
| `0x0002B0` | `_frftos` | `0x0038D8` |
| `0x0002B4` | `_frftous` | `0x00396D` |
| `0x0002B8` | `_fritof` | `0x00399C` |
| `0x0002BC` | `_fruitof` | `0x0039E1` |
| `0x0002C0` | `_frstof` | `0x0039BD` |
| `0x0002C4` | `_frubtof` | `0x0039C7` |
| `0x0002C8` | `_frustof` | `0x003A05` |

## Bottom line

The compiler soft-float helpers are a compact IEEE single-precision runtime:

- packed format: standard 32-bit IEEE single, little-endian
- register ABI: `BC+A` and `HL+E`
- unpack path: `_fpunpack` / `_fpunpack_rhs`
- repack path: `_fppack`
- arithmetic:
  - `_fadd` = align + add/sub + repack
  - `_fmul` = 24x24 partial-product multiply + repack
  - `_fdiv` = restoring divide + repack
  - `_fsub` = rhs sign-flip + `_fadd`
  - `_fcmp` = packed compare + flag fixup

The one material correction to the prior intuition is `_fcmp`: it never calls `_fpunpack` directly.
