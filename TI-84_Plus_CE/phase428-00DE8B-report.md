# Phase 428 - 0x00DE8B Post-Boot Descriptor Finalizer

## Function Boundaries

- Start: `0x00DE8B`
- End: `0x00DF72`
- Size: `232` bytes (`94` decoded instructions)
- Shape: straight-line body with one conditional forward branch at `0x00DF5C`

The byte at `0x00DE8A` is a `RET`, so `0x00DE8B` is a clean function entry. The wrapper at `0x00CC71` calls it immediately after `CALL 0x00E2EB`:

```text
0x00CD6C  CALL 0x00E2EB
0x00CD70  CALL 0x00DE8B
0x00CD74  LD A,0x01
```

So this routine is the final post-bootstrap step in the descriptor subsystem init chain.

## What It Initializes

`0x00DE8B` revisits the descriptor-root pointers created by `0x00E2EB` and patches a small set of header/status bytes in each root descriptor.

### Root A pair (`D13FD8` and `D13FDB`)

For the root pointed to by `*(D13FD8)` and the companion root pointed to by `*(D13FDB)`:

1. Read byte `+4`, clear bit 7, write it back.
2. Read `D141E6`, shift it left four times, then `SET 6,A`.
3. Store that derived value into byte `+5`.
4. Store `0x08` into byte `+7`.
5. Store `0x40` into byte `+11`.

### Root B pair (`D13FDE` and `D13FE1`)

For the root pointed to by `*(D13FDE)` and the companion root pointed to by `*(D13FE1)`:

1. Read byte `+4`, clear bit 7, write it back.
2. Read `D141E6`, shift it left four times.
3. Store that value into byte `+5`.
4. Store `0x40` into byte `+11`.

Unlike the A-side pair, the B-side pair does **not** force bit 6 in byte `+5`, and it does **not** write byte `+7`.

## Meaning Of The `D141E6` Input

The only non-descriptor RAM input is `D141E6`, read four times at:

- `0x00DE9D`
- `0x00DEDA`
- `0x00DF0E`
- `0x00DF3F`

Nearby code just before this function stores `D141E6` as:

```text
IN A,(0x3082)
CALL 0x002575
AND 0x03
LD (0xD141E6),A
```

So `D141E6` is a 2-bit mode/channel selector captured earlier from hardware state. `0x00DE8B` packs that selector into the upper nibble of descriptor byte `+5`, with an extra `bit 6` force for the A-side pair.

## Connection To Known Descriptor Addresses

### Directly referenced

- `D13FD8`: loaded repeatedly as the primary A-side descriptor root pointer
- `D13FDE`: loaded repeatedly as the primary B-side descriptor root pointer

### Indirect companion roots

- `D13FDB`: loaded as an immediate pointer slot, then dereferenced with `LD IY,(HL)`
- `D13FE1`: same pattern as `D13FDB`

### Not referenced here

- `D14017`
- `D1401A`
- `D1401D`
- `D14020`
- `D13FED`
- `D14014`

That means `0x00DE8B` does not allocate memory, carve pools, or clear the connection table. Those steps already happened earlier in `0x00CAF4`, `0x00CC71`, and `0x00E2EB`. This routine is strictly a post-bootstrap descriptor/header fixup plus line-arming step.

## Tail Hardware Logic

The final block at `0x00DF54..0x00DF72` performs a small hardware handshake:

1. Read port `0x3015`.
2. Mask with `0x10`.
3. If bit 4 is clear, call `0x00DA8C(1)`.
4. Always call `0x00DB66(1)`.

Based on earlier decodes:

- `0x00DA8C(1)` is the global link-control assert/arm helper.
- `0x00DB66(1)` is the TX-side control-bit assert helper.

So after rewriting the descriptor roots, `0x00DE8B` arms the link hardware into its active post-init state.

## CALL Targets

`0x00DE8B` has only two calls:

| Target | Role | Site |
| --- | --- | --- |
| `0x00DA8C` | global link-control assert/arm helper | `0x00DF63` |
| `0x00DB66` | TX-side control-line assert helper | `0x00DF6D` |

Both are called with stacked argument `1`.

## Conditional Logic And Error Paths

There is no local error return, null check, or allocation failure path in this function.

The only branch is:

```text
0x00DF58  IN A,(C)
0x00DF5A  AND 0x10
0x00DF5C  JR NZ,0x00DF68
```

If the masked status bit is already set, the function skips `0x00DA8C(1)` and goes straight to `0x00DB66(1)`. Otherwise it performs both helper calls.

Any waiting, timeout, or port-failure behavior lives inside those helpers, not in `0x00DE8B` itself.

## Bottom Line

`0x00DE8B` is not another allocator or bootstrap routine. It is the descriptor subsystem's final polish step:

- clears bit 7 in descriptor byte `+4`
- writes a mode/class byte derived from `D141E6` into `+5`
- stamps `0x08` into `+7` for the A-side pair only
- stamps `0x40` into `+11` for all four roots
- then arms the link-control helpers

In other words, `0x00E2EB` builds the descriptor roots, and `0x00DE8B` marks them active and pushes the hardware side into the ready state.
