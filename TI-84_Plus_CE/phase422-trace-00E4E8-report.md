# Phase 422: Trace Report for `0x00E4E8`

## Summary

`0x00E4E8` is **not** a checksum helper and it does **not** scan for a packet signature. It stages a small field block from `IY+24..27`, normalizes a word from `IY+26/IY+27`, optionally complements that word inside a `0x03FF` domain, then attaches the shared `D141EC` byte stream to a nested work record.

The function ends at `0x00E582`; `0x00E583` is the next routine.

| Field | Value |
|---|---|
| Start | `0x00E4E8` |
| End | `0x00E582` |
| Size | `155` bytes |
| Direct callers | `0x00E882`, `0x00FF75` |
| Port I/O | none |
| Calls | `0x002197`, `0x0021C2`, `0x0022F9` |

## What It Matches / Validates

The helper performs three tests:

1. It builds `fieldWord = ((IY+27 & 0x7F) << 8) | IY+26`.
2. It checks whether `fieldWord` is zero.
3. On the zero case, it checks whether `(IY+25 & 0x03) == 1`.

Behavior:

- If `fieldWord != 0`, it always transforms the value to `0x03FF - fieldWord`.
- If `fieldWord == 0` and `(IY+25 & 0x03) == 1`, it also produces `0x03FF`.
- If `fieldWord == 0` and `(IY+25 & 0x03) != 1`, it leaves the value at `0`.

That means the routine is better described as a **field normalizer / mode-sensitive complement helper** than a "data matcher." The `0x03FF` constant strongly suggests a bounded 10-bit domain, although that part is an inference from the arithmetic.

After the arithmetic step, it gates the return value on a shared byte:

- It seeds a downstream pointer with `0xD141EC`, advances that pointer to `0xD141ED`, and reads the first byte there.
- If `D141ED != 0`, the function clears `D141ED` and returns `HL = 0`.
- If `D141ED == 0`, the function returns the staged/complemented `fieldWord`.

## Inputs

Direct reads:

- `IY+24` - copied out, then cleared
- `IY+25` - low two bits select the zero-case behavior
- `IY+26` - low byte of `fieldWord`
- `IY+27` - high byte of `fieldWord`, with bit 7 stripped before use
- `D141ED` - read through a pointer seeded from `D141EC`

Pointer chain used by the routine:

- `work = *(frame+6)` via `LD IX,(IX+6)` at `0x00E4F0`
- `firstNested = *(work+6)` via `LD IX,(IX+6)` at `0x00E546`
- `secondNested = *(firstNested+6)` via `LD IX,(IX+6)` at `0x00E54F`

Observed callers:

- `0x00FF75` is the phase-421 `0x00FE10` common tail.
- `0x00E882` is a nearby sibling helper that stores the returned `HL` into its own local word and compares that result with another field at `IX+18`.

The second stack word pushed by both callers is not directly dereferenced inside `0x00E4E8`; the code body only follows the argument loaded by `LD IX,(IX+6)`.

## Outputs

Register result:

- `HL = transformed fieldWord` when `D141ED == 0`
- `HL = 0` when `D141ED != 0` (after clearing that byte)

Memory writes:

- `work[-3] = fieldWord` or `0x03FF - fieldWord`
- `firstNested[-7] = old IY+24`
- `IY+24 = 0`
- `secondNested[-6] = 0xD141EC`
- `secondNested[-10] = 0xD141EC`
- `D141ED = 0` on the nonzero-byte path

Flags:

- Both return paths leave `Z = 1` and `C = 0`.
- In practice the caller should treat `HL` as the meaningful output; the flags are not distinguishing success vs. failure here.

## Call Targets

- `0x002197` - stack-frame helper that allocates a 10-byte local frame
- `0x0021C2` - 24-bit compare-against-zero helper
- `0x0022F9` - left-shift helper used to place the high byte at bit position 8

## RAM / Field Map

Absolute RAM:

- `0xD141EC` - shared transfer/source byte-stream base
- `0xD141ED` - first byte in that shared stream; read every call and cleared on the nonzero path

IY-relative fields used by this helper:

- `IY+24` - pending tag/status byte exported to the nested record
- `IY+25` - mode byte; only the low two bits are tested
- `IY+26` - low field byte
- `IY+27` - high field byte with bit 7 treated as a flag

## Interpretation

The helper acts like a **small transfer-field staging routine**:

- It converts a two-byte field into a normalized word.
- It handles a mode-dependent inversion around `0x03FF`.
- It exports one side byte (`IY+24`) into a nested record.
- It hooks that nested record up to the shared `D141EC` buffer and uses `D141ED` as a one-byte gate.

So, for the TI-Link engine question: `0x00E4E8` is much closer to **field staging / normalization plus shared-buffer hookup** than to header validation or checksum calculation.
