# Phase 424: Static Trace of `0x00E06D`

## Result

`0x00E06D` is the slab **alloc** counterpart to the selector-driven free helper at `0x00E1CC`. The exact function span is `0x00E06D..0x00E1CB` (`351` bytes). The earlier `~641`-byte estimate was too large because it bled into the next function at `0x00E1CC`.

The allocator is not variable-size and it does not use a packed bitmap. It dispatches on a selector byte (`0` or `2`), then performs a linear first-fit scan over one-byte slot-state arrays:

- selector `0`: `D1405C[0..15]`, block size `0x20`, return pointer `D1401A + index * 0x20`
- selector `2`: `D1406C[0..5]`, block size `0x400`, return pointer `D14020 + index * 0x400`

State encoding is:

- `1` = free
- `2` = allocated

## Exact Byte Range

| Field | Value |
| --- | --- |
| Start | `0x00E06D` |
| End | `0x00E1CB` |
| Size | `351` bytes |
| Scan window used to find the end | `0x00E06D..0x00E38C` (`800` bytes) |
| Inline dispatch table | `0x00E080..0x00E08C` |
| Next function | `0x00E1CC` (`free`) |
| Port I/O inside `0x00E06D` | none |

The end is the common epilogue `DD F9 DD E1 C9` at `0x00E1C7..0x00E1CB`, immediately followed by the free-helper prologue at `0x00E1CC`.

## Selector Dispatch

After the prologue and `__frameset`, the function loads the low byte at `IX+6` and dispatches through `_seqcase` at `0x00211B`.

| Selector | Target | Meaning |
| --- | --- | --- |
| `0x00` | `0x00E09E` | allocate a `0x20`-byte descriptor slab from the selector-0 pool |
| `0x02` | `0x00E169` | allocate a `0x400`-byte backing slab from the selector-2 pool |
| default | `0x00E1C4` | return `HL = 0` |

## CALL Targets

| Target | Role in `0x00E06D` |
| --- | --- |
| `0x002197` | `__frameset`; builds the IX-based local frame (`IX-2` holds the slot index) |
| `0x00211B` | `_seqcase`; dispatches selector `0` vs `2` via the inline table |
| `0x00276B` | zero-extends the 16-bit local slot index from `BC` into `HL` before array indexing |
| `0x0022F9` | shifts `HL` left by `A` bits; here `A = 0x0A`, so the selector-2 path computes `index * 0x400` |

No other CALL targets occur inside the allocator body.

## RAM Variables Read/Written

### Absolute D1xxxx accesses

| Address | Access | Purpose |
| --- | --- | --- |
| `D1401A` | read | selector-0 pool base; used in `returnPtr = D1401A + index * 0x20` |
| `D14020` | read | selector-2 pool base; used in `returnPtr = D14020 + index * 0x400` |
| `D140AC` | write then read | scratch/current-pointer slot used to cache the return pointer before block-field writes or return |

### Derived indexed accesses

| Base | Access | Purpose |
| --- | --- | --- |
| `D1405C + index` | read, then write `2` | selector-0 slot-state array (`16` entries) |
| `D1406C + index` | read, then write `2` | selector-2 slot-state array (`6` entries) |

### Derived writes to the returned selector-0 slab

The selector-0 success path writes into the newly allocated `0x20`-byte block itself:

- `+0x00`: set bit `0`
- `+0x04`: set bit `0`
- `+0x08`: clear bit `7`
- `+0x09`: rewrite as `(old & 0x73) | 0x83`
- `+0x0C..+0x0E`: zero a 24-bit field
- `+0x0F`: zero

The selector-2 success path does not initialize the payload beyond caching the pointer in `D140AC`.

## Allocation Algorithm

### Selector `0` path (`0x00E09E`)

1. Initialize local `slotIndex = 0`.
2. Loop while `slotIndex < 16`.
3. Read `D1405C[slotIndex]`.
4. If the state byte is not `1`, increment `slotIndex` and continue.
5. Otherwise write `D1405C[slotIndex] = 2`.
6. Compute the return pointer as `D1401A + slotIndex * 0x20`.
7. Cache that pointer in `D140AC`.
8. Initialize the first `0x10` bytes of the descriptor slab as described above.
9. Load `HL = *(D140AC)` and return.

If no slot matches, the function falls through to the common failure path and returns `HL = 0`.

### Selector `2` path (`0x00E169`)

1. Initialize local `slotIndex = 0`.
2. Loop while `slotIndex < 6`.
3. Read `D1406C[slotIndex]`.
4. If the state byte is not `1`, increment `slotIndex` and continue.
5. Otherwise write `D1406C[slotIndex] = 2`.
6. Compute the return pointer as `D14020 + (slotIndex << 10)` = `D14020 + slotIndex * 0x400`.
7. Cache that pointer in `D140AC`.
8. Load `HL = *(D140AC)` and return.

If no slot matches, the function returns `HL = 0`.

### Strategy

The allocator uses **linear first-fit** scanning. It does not:

- take a size argument
- split or coalesce blocks
- maintain a free list
- use packed bit tests

Despite earlier notes calling `D1406C` a “bitmap,” the code treats both `D1405C` and `D1406C` as one-byte-per-slot state arrays.

## Direct Callers

Direct `CALL 0x00E06D` sites in the ROM:

| Call site | Selector | Immediate post-call use |
| --- | --- | --- |
| `0x00CE7D` | `0` | stores `HL` in `D13FFC` |
| `0x00CE9C` | `0` | stores `HL` in `D13FFF` |
| `0x00CEDC` | `0` | stores `HL` in `D14002` |
| `0x00DFFF` | `0` | stores `HL` in a local and null-checks it |
| `0x00E369` | `2` | stores `HL` in `D141BE` during pool bootstrap |
| `0x00EBB4` | `0` | stores `HL` in a local and jumps to error `2` if null |
| `0x010F9F` | `2` | wrapper return path after a port-status gate |

Direct jump thunk:

- `0x000508`: low-ROM `JP 0x00E06D`

### Port note

`0x00E06D` itself performs no `IN` or `OUT` instructions. The only nearby hardware gate is in the selector-2 wrapper at `0x010F8C`, which performs `IN A,(0x3082)` and checks bit `4` before it pushes selector `2` and calls the allocator at `0x010F9F`.

## Relationship to `0x00E1CC` Free

`0x00E1CC` is the direct inverse of this function at the slot-selection level:

- both dispatch on the same selector values (`0` and `2`)
- both use the same pool geometry
- both derive selector-0 slot indexes with shift `5`
- both derive selector-2 slot indexes with shift `10`
- alloc writes state `2`, free writes state `1`

The payload behavior is intentionally asymmetric:

- selector `0` alloc seeds descriptor/header fields, while selector `0` free wipes the full `0x20` bytes
- selector `2` alloc only returns the `0x400` slab pointer, while selector `2` free only flips the state byte back to `1`

So the two functions are symmetric in **pool selection, slot math, and state-byte ownership**, but not in **payload initialization**.
