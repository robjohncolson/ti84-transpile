# Phase 322 Heap Allocator Report: `0x00E06D`

Generated from raw `TI-84_Plus_CE/ROM.rom` bytes using `decodeInstruction(..., "adl")`, plus direct ROM-wide scans for `CALL 0x00E06D` (`CD 6D E0 00`) and `JP 0x00E06D` (`C3 6D E0 00`).

## 1. Summary

`0x00E06D` is not a general variable-size heap allocator. It is a selector-driven slab allocator with two fixed pools:

- Selector `0` allocates from a `16`-entry pool of `0x20`-byte blocks.
- Selector `2` allocates from a `6`-entry pool of `0x400`-byte blocks.

Key facts:

- Input parameter: low byte of the stack argument at `IX+6`.
- Supported selector values: `0` and `2`.
- No caller-supplied size parameter exists.
- Return value: `HL = allocated pointer` on success, `HL = 0` on failure or unsupported selector.
- Allocation state bytes use `1 = free`, `2 = allocated`.
- Strategy: linear first-free scan over fixed-size slot-status arrays. No free list, no coalescing, no best-fit logic.

## 2. Full Annotated Disassembly of `0x00E06D`

### 2.1 Prologue and selector switch

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E06D` | `21 FE FF FF` | `ld hl, 0xfffffe` | Reserve 2 bytes of local stack space for a 16-bit slot index. |
| `0x00E071` | `CD 97 21 00` | `call 0x002197` | ZDS II `__frameset`; establishes the IX frame. |
| `0x00E075` | `DD 7E 06` | `ld a, (ix+6)` | Load the selector argument from the caller stack frame. |
| `0x00E078` | `B7` | `or a` | Normalize flags and clear carry before zeroing HL. |
| `0x00E079` | `ED 62` | `sbc hl, hl` | `HL = 0`. |
| `0x00E07B` | `6F` | `ld l, a` | Zero-extend selector into `HL` for the switch helper. |
| `0x00E07C` | `CD 1B 21 00` | `call 0x00211B` | Call the scanning `_seqcase` helper. It consumes the inline table below. |

Inline `_seqcase` table at `0x00E080`:

- `0x00E080-0x00E081`: count = `0x0002`
- `0x00E082`: key `0x00` -> `0x00E09E`
- `0x00E086`: key `0x02` -> `0x00E169`
- default -> `0x00E1C4`

So the selector mapping is:

- `0` -> type-0 pool allocator
- `2` -> type-2 pool allocator
- anything else -> fail / return null

### 2.2 Selector `0`: initialize scan index

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E09E` | `DD 36 FE 00` | `ld (ix-2), 0x00` | Initialize local slot index low byte to `0`. |
| `0x00E0A2` | `DD 36 FF 00` | `ld (ix-1), 0x00` | Initialize local slot index high byte to `0`. |
| `0x00E0A6` | `18 E5` | `jr 0x00E08D` | Enter the slot-scan loop. |

### 2.3 Selector `0`: slot-scan loop header

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E08D` | `49 01 10 00` | `lis ld bc, 0x000010` | Loop bound = `16` slots in pool 0. |
| `0x00E091` | `DD 27 FE` | `ld hl, (ix-2)` | Load the current 16-bit slot index. |
| `0x00E094` | `B7` | `or a` | Clear carry before compare. |
| `0x00E095` | `40 ED 42` | `sis sbc hl, bc` | Compare `index - 16` in 16-bit mode. |
| `0x00E098` | `38 0E` | `jr c, 0x00E0A8` | If `index < 16`, inspect the slot. |
| `0x00E09A` | `C3 C4 E1 00` | `jp 0x00E1C4` | Otherwise the pool is exhausted: fail. |

### 2.4 Selector `0`: inspect status byte and claim a free slot

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E0A8` | `DD 07 FE` | `ld bc, (ix-2)` | Load the 16-bit slot index into `BC`. |
| `0x00E0AB` | `CD 6B 27 00` | `call 0x00276B` | Zero-extend the 16-bit index into `HL`. |
| `0x00E0AF` | `01 5C 40 D1` | `ld bc, 0xd1405c` | Base of pool-0 status bytes. |
| `0x00E0B3` | `09` | `add hl, bc` | `HL = &D1405C[index]`. |
| `0x00E0B4` | `7E` | `ld a, (hl)` | Read slot state byte. |
| `0x00E0B5` | `B7` | `or a` | Prepare for compare. |
| `0x00E0B6` | `ED 62` | `sbc hl, hl` | `HL = 0`. |
| `0x00E0B8` | `6F` | `ld l, a` | Copy state into `HL`. |
| `0x00E0B9` | `B7` | `or a` | Clear carry before subtracting `1`. |
| `0x00E0BA` | `01 01 00 00` | `ld bc, 0x000001` | Constant `1`, meaning "free". |
| `0x00E0BE` | `ED 42` | `sbc hl, bc` | Test whether `state == 1`. |
| `0x00E0C0` | `C2 4C E1 00` | `jp nz, 0x00E14C` | If not free, advance to the next slot. |
| `0x00E0C4` | `DD 07 FE` | `ld bc, (ix-2)` | Reload slot index. |
| `0x00E0C7` | `CD 6B 27 00` | `call 0x00276B` | Zero-extend index again. |
| `0x00E0CB` | `01 5C 40 D1` | `ld bc, 0xd1405c` | Status array base again. |
| `0x00E0CF` | `09` | `add hl, bc` | `HL = &D1405C[index]`. |
| `0x00E0D0` | `36 02` | `ld (hl), 0x02` | Mark slot allocated (`2`). |

### 2.5 Selector `0`: compute block pointer and initialize block header

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E0D2` | `DD 07 FE` | `ld bc, (ix-2)` | Reload slot index. |
| `0x00E0D5` | `CD 6B 27 00` | `call 0x00276B` | Zero-extend to `HL`. |
| `0x00E0D9` | `29` | `add hl, hl` | Multiply by 2. |
| `0x00E0DA` | `29` | `add hl, hl` | Multiply by 4. |
| `0x00E0DB` | `29` | `add hl, hl` | Multiply by 8. |
| `0x00E0DC` | `29` | `add hl, hl` | Multiply by 16. |
| `0x00E0DD` | `29` | `add hl, hl` | Multiply by 32. |
| `0x00E0DE` | `ED 4B 1A 40 D1` | `ld bc, (0xd1401a)` | Load pool-0 payload base pointer. |
| `0x00E0E3` | `09` | `add hl, bc` | `HL = D1401A + index*0x20`. |
| `0x00E0E4` | `22 AC 40 D1` | `ld (0xd140ac), hl` | Save current allocated-block pointer in a global scratch/current-pointer slot. |
| `0x00E0E8` | `FD 2A AC 40 D1` | `ld iy, (0xd140ac)` | Load that pointer into `IY`. |
| `0x00E0ED` | `FD 7E 00` | `ld a, (iy+0)` | Read byte 0 of the new block. |
| `0x00E0F0` | `CB C7` | `set 0, a` | Set bit 0 in byte 0. |
| `0x00E0F2` | `FD 2A AC 40 D1` | `ld iy, (0xd140ac)` | Reload the block pointer. |
| `0x00E0F7` | `FD 77 00` | `ld (iy+0), a` | Store updated byte 0. |
| `0x00E0FA` | `FD 2A AC 40 D1` | `ld iy, (0xd140ac)` | Reload the block pointer. |
| `0x00E0FF` | `FD 7E 04` | `ld a, (iy+4)` | Read byte 4. |
| `0x00E102` | `CB C7` | `set 0, a` | Set bit 0 in byte 4. |
| `0x00E104` | `FD 2A AC 40 D1` | `ld iy, (0xd140ac)` | Reload the block pointer. |
| `0x00E109` | `FD 77 04` | `ld (iy+4), a` | Store updated byte 4. |
| `0x00E10C` | `FD 2A AC 40 D1` | `ld iy, (0xd140ac)` | Reload the block pointer. |
| `0x00E111` | `FD 7E 08` | `ld a, (iy+8)` | Read byte 8. |
| `0x00E114` | `CB BF` | `res 7, a` | Clear bit 7 in byte 8. |
| `0x00E116` | `FD 2A AC 40 D1` | `ld iy, (0xd140ac)` | Reload the block pointer. |
| `0x00E11B` | `FD 77 08` | `ld (iy+8), a` | Store updated byte 8. |
| `0x00E11E` | `FD 2A AC 40 D1` | `ld iy, (0xd140ac)` | Reload the block pointer. |
| `0x00E123` | `ED 23 08` | `lea hl, iy+8` | Point at block offset `+8`. |
| `0x00E126` | `23` | `inc hl` | Move to block byte `+9`. |
| `0x00E127` | `7E` | `ld a, (hl)` | Read byte `+9`. |
| `0x00E128` | `E6 73` | `and 0x73` | Clear selected control bits. |
| `0x00E12A` | `F6 83` | `or 0x83` | Force the control pattern `0x83` into the masked byte. |
| `0x00E12C` | `FD 2A AC 40 D1` | `ld iy, (0xd140ac)` | Reload the block pointer. |
| `0x00E131` | `ED 23 08` | `lea hl, iy+8` | Recompute pointer to offset `+8`. |
| `0x00E134` | `23` | `inc hl` | Move to byte `+9`. |
| `0x00E135` | `77` | `ld (hl), a` | Store updated byte `+9`. |
| `0x00E136` | `FD 2A AC 40 D1` | `ld iy, (0xd140ac)` | Reload the block pointer. |
| `0x00E13B` | `01 00 00 00` | `ld bc, 0x000000` | Zero constant. |
| `0x00E13F` | `FD 0F 0C` | `ld (iy+12), bc` | Zero the 24-bit field at offset `+0x0C`. |
| `0x00E142` | `FD 36 0F 00` | `ld (iy+15), 0x00` | Zero byte `+0x0F`. |
| `0x00E146` | `2A AC 40 D1` | `ld hl, (0xd140ac)` | Load the final return pointer into `HL`. |
| `0x00E14A` | `18 7B` | `jr 0x00E1C7` | Return success. |

### 2.6 Selector `0`: advance to next slot

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E14C` | `DD 27 FE` | `ld hl, (ix-2)` | Load slot index. |
| `0x00E14F` | `23` | `inc hl` | `index++`. |
| `0x00E150` | `DD 75 FE` | `ld (ix-2), l` | Store low byte. |
| `0x00E153` | `DD 74 FF` | `ld (ix-1), h` | Store high byte. |
| `0x00E156` | `C3 8D E0 00` | `jp 0x00E08D` | Repeat the scan loop. |

### 2.7 Selector `2`: initialize scan index

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E169` | `DD 36 FE 00` | `ld (ix-2), 0x00` | Initialize local slot index low byte to `0`. |
| `0x00E16D` | `DD 36 FF 00` | `ld (ix-1), 0x00` | Initialize local slot index high byte to `0`. |
| `0x00E171` | `18 E7` | `jr 0x00E15A` | Enter the second pool's scan loop. |

### 2.8 Selector `2`: slot-scan loop header

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E15A` | `49 01 06 00` | `lis ld bc, 0x000006` | Loop bound = `6` slots in pool 2. |
| `0x00E15E` | `DD 27 FE` | `ld hl, (ix-2)` | Load current slot index. |
| `0x00E161` | `B7` | `or a` | Clear carry before compare. |
| `0x00E162` | `40 ED 42` | `sis sbc hl, bc` | Compare `index - 6` in 16-bit mode. |
| `0x00E165` | `38 0C` | `jr c, 0x00E173` | If `index < 6`, inspect the slot. |
| `0x00E167` | `18 5B` | `jr 0x00E1C4` | Otherwise the pool is exhausted: fail. |

### 2.9 Selector `2`: inspect status byte and claim a free slot

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E173` | `DD 07 FE` | `ld bc, (ix-2)` | Load slot index. |
| `0x00E176` | `CD 6B 27 00` | `call 0x00276B` | Zero-extend index into `HL`. |
| `0x00E17A` | `01 6C 40 D1` | `ld bc, 0xd1406c` | Base of pool-2 status bytes. |
| `0x00E17E` | `09` | `add hl, bc` | `HL = &D1406C[index]`. |
| `0x00E17F` | `7E` | `ld a, (hl)` | Read slot state byte. |
| `0x00E180` | `B7` | `or a` | Prepare for compare. |
| `0x00E181` | `ED 62` | `sbc hl, hl` | `HL = 0`. |
| `0x00E183` | `6F` | `ld l, a` | Copy state into `HL`. |
| `0x00E184` | `B7` | `or a` | Clear carry before subtracting `1`. |
| `0x00E185` | `01 01 00 00` | `ld bc, 0x000001` | Constant `1`, meaning "free". |
| `0x00E189` | `ED 42` | `sbc hl, bc` | Test whether `state == 1`. |
| `0x00E18B` | `20 2B` | `jr nz, 0x00E1B8` | If not free, advance to the next slot. |
| `0x00E18D` | `DD 07 FE` | `ld bc, (ix-2)` | Reload slot index. |
| `0x00E190` | `CD 6B 27 00` | `call 0x00276B` | Zero-extend it. |
| `0x00E194` | `01 6C 40 D1` | `ld bc, 0xd1406c` | Status-array base again. |
| `0x00E198` | `09` | `add hl, bc` | `HL = &D1406C[index]`. |
| `0x00E199` | `36 02` | `ld (hl), 0x02` | Mark slot allocated (`2`). |

### 2.10 Selector `2`: compute block pointer

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E19B` | `DD 07 FE` | `ld bc, (ix-2)` | Reload slot index. |
| `0x00E19E` | `CD 6B 27 00` | `call 0x00276B` | Zero-extend to `HL`. |
| `0x00E1A2` | `ED 4B 20 40 D1` | `ld bc, (0xd14020)` | Load pool-2 payload base pointer. |
| `0x00E1A7` | `3E 0A` | `ld a, 0x0a` | Shift count `10`. |
| `0x00E1A9` | `CD F9 22 00` | `call 0x0022F9` | Multiply `HL` by `2^10 = 0x400` (slot size). |
| `0x00E1AD` | `09` | `add hl, bc` | `HL = D14020 + index*0x400`. |
| `0x00E1AE` | `22 AC 40 D1` | `ld (0xd140ac), hl` | Save the result pointer in the global scratch/current-pointer slot. |
| `0x00E1B2` | `2A AC 40 D1` | `ld hl, (0xd140ac)` | Reload it into `HL`. |
| `0x00E1B6` | `18 0F` | `jr 0x00E1C7` | Return success. |

### 2.11 Selector `2`: advance to next slot

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E1B8` | `DD 27 FE` | `ld hl, (ix-2)` | Load slot index. |
| `0x00E1BB` | `23` | `inc hl` | `index++`. |
| `0x00E1BC` | `DD 75 FE` | `ld (ix-2), l` | Store low byte. |
| `0x00E1BF` | `DD 74 FF` | `ld (ix-1), h` | Store high byte. |
| `0x00E1C2` | `18 96` | `jr 0x00E15A` | Repeat the scan loop. |

### 2.12 Common failure and epilogue

| Address | Bytes | Instruction | Purpose |
|---|---|---|---|
| `0x00E1C4` | `B7` | `or a` | Clear carry. |
| `0x00E1C5` | `ED 62` | `sbc hl, hl` | Force `HL = 0` for a null return. |
| `0x00E1C7` | `DD F9` | `ld sp, ix` | Tear down the stack frame. |
| `0x00E1C9` | `DD E1` | `pop ix` | Restore caller IX. |
| `0x00E1CB` | `C9` | `ret` | Return to caller. |

## 3. Allocation Algorithm

### Selector `0`

- Local slot index starts at `0`.
- Loop bound is `16`.
- Slot state bytes live at `D1405C[index]`.
- A free slot is identified by state byte `1`.
- Allocated state is written as `2`.
- The returned address is:
  - `D1401A + index * 0x20`
- The allocator then initializes the first `0x10` bytes of the block:
  - sets bit 0 at offsets `+0` and `+4`
  - clears bit 7 at offset `+8`
  - rewrites byte `+9` as `(old & 0x73) | 0x83`
  - zeros the 24-bit field at `+0x0C`
  - zeros byte `+0x0F`

This pool is used by the `D13FFC` / `D13FFF` / `D14002` pointer triplet, so these are descriptor-like blocks rather than raw buffers.

### Selector `2`

- Local slot index starts at `0`.
- Loop bound is `6`.
- Slot state bytes live at `D1406C[index]`.
- A free slot is identified by state byte `1`.
- Allocated state is written as `2`.
- The returned address is:
  - `D14020 + index * 0x400`
- No per-block header initialization is done here beyond caching the pointer in `D140AC`.

This looks like a fixed set of `0x400`-byte backing buffers.

### Overall strategy

- This is a slab allocator with two hard-coded classes.
- It does a linear first-free scan in each class.
- There is no size argument, no block splitting, no merge/coalesce, and no free list.

## 4. Heap Metadata RAM Addresses

### Pool-selection metadata

- `D1405C`: selector-`0` slot-state array, 16 entries
- `D1406C`: selector-`2` slot-state array, 6 entries
- Slot-state values:
  - `1` = free
  - `2` = allocated

### Payload base pointers

- `D1401A`: selector-`0` payload base
- `D14020`: selector-`2` payload base

### Other related globals

- `D1401D`: upper-bound/sentinel used by the selector-`0` free path for pointer validation
- `D14017`: overall workspace/pool base used by the init routine at `0x00E2EB`
- `D140AC`: global scratch/current-pointer slot used during allocation and block initialization
- `D141BE`: bootstrap selector-`2` allocation created by `0x00E2EB`
- `D13FEA`: copy of `D1401D` made during `0x00E2EB`
- `D13FFC`, `D13FFF`, `D14002`: three selector-`0` descriptor pointers allocated by the `0x00CE7D/9C/DC` caller cluster

## 5. Heap Region Boundaries

### Exact active allocator geometry

These boundaries are directly implied by the allocator itself:

- Selector `0`:
  - block size = `0x20`
  - slot count = `16`
  - active address set = `D1401A + n*0x20`, `n = 0..15`
  - active span = `D1401A .. D1401A + 0x200`

- Selector `2`:
  - block size = `0x400`
  - slot count = `6`
  - active address set = `D14020 + n*0x400`, `n = 0..5`
  - active span = `D14020 .. D14020 + 0x1800`

### Validation bounds used by free

The free routine uses:

- selector `0`: `[D1401A, D1401D)`
- selector `2`: `[D14020, D14020 + 0x1800)`

`D1401D` is definitely the selector-`0` upper sentinel for free-time validation, but this investigation did not fully prove whether it is the exact end of the 16-slot pool or a coarser aligned bound derived by the layout helper at `0x00CB00`. The actual allocatable capacity is still exactly `16 * 0x20 = 0x200` bytes.

## 6. Related Functions

### `0x00E1CC` — free / deallocate

This is the direct counterpart to `0x00E06D`.

- Same selector argument at `IX+6`
- Same selector table shape:
  - `0` -> case at `0x00E1F2`
  - `2` -> case at `0x00E294`
  - default -> `0x00E2E6` return

Behavior:

- Selector `0`:
  - validate `ptr` (arg at `IX+9`) against `D1401A` / `D1401D`
  - compute `index = (ptr - D1401A) >> 5`
  - reject if `index >= 16`
  - write `D1405C[index] = 1`
  - zero the `0x20`-byte block as 16 two-byte cells

- Selector `2`:
  - validate `ptr` against `D14020 .. D14020 + 0x1800`
  - compute `index = (ptr - D14020) >> 10`
  - reject if `index >= 6`
  - write `D1406C[index] = 1`
  - no payload wipe is performed here

Direct callers found for `0x00E1CC`:

- `0x00CEBA`
- `0x00CEFA`
- `0x00CF0B`
- `0x00E8F8`
- `0x00FFD6`
- `0x01100C`
- low-ROM jump thunk at `0x000504`

### `0x00E2EB` — pool init / bootstrap

Direct caller found:

- `0x00CD6C`

Behavior:

- zero-fill `0x780` bytes at the address stored in `D14017`
- copy `D1401D` into `D13FEA`
- set every selector-`0` status byte in `D1405C[0..15]` to `1`
- set every selector-`2` status byte in `D1406C[0..5]` to `1`
- allocate one selector-`2` block by calling `0x00E06D` with selector `2`
- store that bootstrap block in `D141BE`

This strongly suggests the allocator is part of a small USB/TI-Connect CE memory subsystem with a shared backing buffer plus descriptor blocks.

### `0x00CB00` — layout helper for pool globals

This routine is not an allocator itself, but it sets up the base pointers used by the allocator family:

- `D14017`
- `D1401A`
- `D1401D`
- `D14020`

It aligns and derives these addresses before `0x00E2EB` seeds the status arrays.

## 7. Complete Caller List for `0x00E06D`

Direct `CALL 0x00E06D` scan hits:

| Call site | Selector pushed | Immediate post-call use | Subsystem / role |
|---|---:|---|---|
| `0x00CE7D` | `0` | Stores `HL` to `D13FFC` | TI-Connect CE / USB descriptor triplet setup |
| `0x00CE9C` | `0` | Stores `HL` to `D13FFF` | TI-Connect CE / USB descriptor triplet setup |
| `0x00CEDC` | `0` | Stores `HL` to `D14002` | TI-Connect CE / USB descriptor triplet setup |
| `0x00DFFF` | `0` | Stores `HL` to local `IX-3`; fails if null | USB/TI-Connect CE helper |
| `0x00E369` | `2` | Stores `HL` to `D141BE` | Internal allocator bootstrap inside `0x00E2EB` |
| `0x00EBB4` | `0` | Stores `HL` to local `IX-3`; returns error `2` if null | USB/TI-Connect CE helper |
| `0x010F9F` | `2` | Returns `HL` from a wrapper gated by port `0x3082` bit 4 | USB controller path |

Direct `JP 0x00E06D` scan hit:

| Jump site | Role |
|---|---|
| `0x000508` | Low-ROM jump-table / thunk entry to the allocator |

## 8. Answers to the Prompt's Key Questions

- Input parameters:
  - selector/class at `IX+6`
  - supported values are `0` and `2`
  - there is no size parameter
- Return value:
  - `HL = pointer` on success
  - `HL = 0` on failure / unsupported selector
- Heap metadata:
  - `D1405C`, `D1406C` are the slot-state arrays
  - `D1401A`, `D14020` are the payload bases
  - `D140AC` is a scratch/current-pointer global used during allocation
- Allocation strategy:
  - fixed-size slab allocator
  - linear first-free scan
- Corresponding free:
  - yes, `0x00E1CC`
- Heap region:
  - selector `0`: `16 * 0x20`
  - selector `2`: `6 * 0x400`

