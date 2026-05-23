# Phase 422: Trace of 0x00E1CC

## Result

`0x00E1CC` is not the TI-Link transfer engine inner loop. The bytes decode as a selector-driven free helper, reached through `_seqcase` and shared with earlier allocator work from phase 322.

Inside `0x00FE10`, the call at `0x00FFD6` is a cleanup step in the block-walk tail:

- the caller reconstructs a successor value into `D1400E` from bytes `+0..+2` of the current selector-0 block,
- pushes `*(D1400B)` as the block pointer,
- pushes selector `0`,
- calls `0x00E1CC`,
- then replaces `D1400B` with `D1400E` and continues the walk until `D1400B == D14005` or null.

So the callee is a node recycler. The block semantics seen in `0x00FE10` belong to the caller, not to `0x00E1CC`.

## Function bounds

| Field | Value |
| --- | --- |
| Start | `0x00E1CC` |
| End | `0x00E2EA` |
| Size | `287` bytes |
| Inline dispatch table | `13` bytes at `0x00E1E5..0x00E1F1` |
| Port I/O | none |
| Direct CALL targets | `0x002197`, `0x00211B`, `0x002330`, `0x00276B`, `0x0023AD`, `0x00245A`, `0x00238F` |
| Direct callers | `0x00CEBA`, `0x00CEFA`, `0x00CF0B`, `0x00E8F8`, `0x00FFD6`, `0x01100C` |

## Selector table

The function starts with `_seqcase` at `0x00211B` over the selector byte from `IX+6`:

| Selector | Target | Meaning |
| --- | --- | --- |
| `0x00` | `0x00E1F2` | free a selector-0 slab |
| `0x02` | `0x00E294` | free a selector-2 slab |
| default | `0x00E2E6` | return without doing anything |

## Block format

`0x00E1CC` does not parse a transfer descriptor or payload header. It only consumes:

- `IX+6`: selector (`0` or `2`)
- `IX+9`: base pointer of the block to free

What it infers from that pointer:

- selector `0` blocks are fixed-size `0x20`-byte slabs in the pool rooted at `D1401A`
- selector `2` blocks are fixed-size `0x400`-byte slabs in the pool rooted at `D14020`

What fields it reads from each block:

- none

What interior bytes it writes:

- selector `0`: wipes the whole slab as 16 consecutive 16-bit cells at offsets `+0x00 .. +0x1E`
- selector `2`: no interior writes at all

Cross-reference to `0x00FE10`:

- the caller reads bytes `+0`, `+1`, and `+2` of the current selector-0 block before freeing it,
- those bytes are used to synthesize `D1400E`,
- `0x00E1CC` itself never inspects those bytes.

## Behavior by selector

### Selector `0` path at `0x00E1F2`

1. Read `D1401A` and `D1401D`.
2. Reject the pointer if `ptr < D1401A` or `ptr >= D1401D`.
3. Compute `index = (ptr - D1401A) >> 5`.
4. Reject the pointer if `index >= 16`.
5. Write `D1405C[index] = 1`.
6. Zero the slab as 16 two-byte cells:
   - compare loop index against `16` via `0x0023AD`
   - compute byte offset `index * 2` via `0x00245A`
   - write `0x00` to both bytes
   - increment the 24-bit loop index via `0x00238F`

This is a full-block wipe, not a partial cleanup.

### Selector `2` path at `0x00E294`

1. Read `D14020`.
2. Reject the pointer if `ptr < D14020` or `ptr >= D14020 + 0x1800`.
3. Compute `index = (ptr - D14020) >> 10`.
4. Reject the pointer if `index >= 6`.
5. Write `D1406C[index] = 1`.

No payload bytes are cleared in this path.

## Data flow

This routine is RAM-to-RAM metadata maintenance only.

- RAM reads:
  - `D1401A` selector-0 pool base
  - `D1401D` selector-0 pool end sentinel
  - `D14020` selector-2 pool base
- RAM writes:
  - `D1405C[index] = 1` for selector `0`
  - the entire selector-0 slab payload is zeroed
  - `D1406C[index] = 1` for selector `2`
- Port I/O:
  - none

There is no `port -> RAM`, `RAM -> port`, or `RAM -> RAM payload copy` path here. The only iterative data motion is the selector-0 wipe loop.

## Partial transfer handling

None.

The routine has no concept of transfer length, partial packet state, retry count, or link hardware status. The only loop is the 16-iteration zeroing pass for selector-0 slabs, and that pass always clears the full `0x20` bytes.

## CALL targets

| Target | Label | Role in 0x00E1CC |
| --- | --- | --- |
| `0x002197` | `__frameset` | allocate a 9-byte local frame |
| `0x00211B` | `_seqcase sparse dispatcher` | branch on selector value |
| `0x002330` | 24-bit right-shift helper | divide pointer delta by `0x20` or `0x400` |
| `0x00276B` | zero-extend BC -> HL helper | turn the slot index into an addressable offset |
| `0x0023AD` | 24-bit limit compare helper | test wipe index against `16` |
| `0x00245A` | 24-bit scale helper | compute `wipeIndex * 2` |
| `0x00238F` | 24-bit add-immediate helper | increment the wipe index |

## RAM addresses

| Address | Label | Used for |
| --- | --- | --- |
| `D1401A` | selector-0 pool base | lower bound and base for slot-index calculation |
| `D1401D` | selector-0 pool end sentinel | upper bound check for selector `0` |
| `D14020` | selector-2 pool base | lower bound and base for slot-index calculation |
| `D1405C` | selector-0 free bitmap | `D1405C[index] = 1` on free |
| `D1406C` | selector-2 free bitmap | `D1406C[index] = 1` on free |
| `D1400B` | current selector-0 block pointer | caller-side argument source in `0x00FE10` |
| `D1400E` | successor pointer/value | caller-side successor built before free in `0x00FE10` |
| `D14005` | list terminator / display parameter | caller-side loop terminator in `0x00FE10` |

## Port addresses

No ports are touched by `0x00E1CC`.

Caller-side note:

- `0x01100C` is gated by `IN A,(0x3082)` bit 4 before it calls `0x00E1CC` with selector `2`.
- `0x00FFD6` in `0x00FE10` is not port-driven; its only hardware reads in the surrounding function are earlier `0x3030` status checks, not part of `0x00E1CC`.

## 0x00FE10 calling convention

The exact pre-call setup at `0x00FFD6` is:

```text
0x00FFC7  LD (D1400E),HL      ; successor/value derived from current block bytes +0..+2
0x00FFCB  LD BC,(D1400B)      ; current selector-0 block pointer
0x00FFD0  PUSH BC             ; arg1 = ptr
0x00FFD1  LD BC,0x000000
0x00FFD5  PUSH BC             ; arg0 = selector 0
0x00FFD6  CALL 0x00E1CC
```

After return:

```text
0x00FFDC  LD BC,(D1400E)
0x00FFE1  LD (D1400B),BC
```

This confirms that `0x00E1CC` is freeing a processed selector-0 node in the dispatcher tail. It is not the code that moves TI-Link bytes.
