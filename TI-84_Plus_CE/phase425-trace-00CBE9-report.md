# Phase 425: Trace of `0x00CBE9`

## Summary

- Exact function span: `0x00CBE9..0x00CC70` (`0x88` bytes / `136` decimal).
- `0x00CBE9` is a distinct function that starts immediately after the `RET` ending `0x00CB7B` at `0x00CBE8`.
- Direct callers: `0x00D021`, `0x00D033`, `0x00D0F8`, `0x00D1BB`, `0x00D1CD`. All 5 are inside `0x00CD7B`; `0x00EB31` never calls it.
- Internal calls: `0x002197` once (`__frameset`) and `0x002330` twice (24-bit right-shift / byte-extract helper).
- No absolute `D1xxxx` RAM references and no port I/O occur inside the body. The helper works through frame locals plus indirect `IY+offset` writes.

## Boundary and Relation to `0x00CB7B`

| Function | Range | Size | Notes |
| --- | --- | --- | --- |
| `0x00CB7B` | `0x00CB7B..0x00CBE8` | `110` bytes | primary constructor |
| `0x00CBE9` | `0x00CBE9..0x00CC70` | `136` bytes | secondary constructor |

`0x00CB7B` ends with `DD F9 DD E1 C9` at `0x00CBE4..0x00CBE8`. `0x00CBE9` begins on the very next byte with its own prologue (`LD HL,-6; CALL 0x002197`). So these routines are adjacent in ROM but do not share a fall-through tail, tail-call, or any overlapping instructions.

The functional split is clear from the offsets they write:

- `0x00CB7B` fills the later/tail part of the node: `+0x0A`, `+0x0B`, `+0x0C..+0x0F`, then zeroes `+0x10..+0x1F`.
- `0x00CBE9` fills the earlier/header part of the same node: `+0x00..+0x05` plus `+0x08..+0x09`.

That matches the caller pattern: the large multi-entry builder `0x00CD7B` calls `0x00CB7B` and then `0x00CBE9`, while the smaller single-entry builder `0x00EB31` only needs `0x00CB7B`.

## Stack Frame and Arguments

`0x00CBE9` allocates a 6-byte local frame:

```text
0x00CBE9  21 FA FF FF    LD HL,0xFFFFFA
0x00CBED  CD 97 21 00    CALL 0x002197
```

That gives:

- `IX+6`: first stacked 24-bit argument.
- `IX+9`: second stacked 24-bit argument.
- `IX-3` and `IX-6`: two 24-bit locals used near the end of the routine.

Under the project’s current decoder and existing `ROM.transpiled.js` lift, the repeated `DD 31 xx` forms are interpreted as `LD IX,(IX+disp)` / `LD IX,(IX-disp)`. With that interpretation:

- the first stacked 24-bit argument at `IX+6` is repeatedly rebound into `IX` and becomes the routine’s working base/source pointer;
- later reads at `DD 7E 09` / `DD 27 09` become effective reads from `sourceBase+9` and `*(u24*)(sourceBase+9)`, not from the raw frame slot;
- `IY` is the output cursor/destination base, because all final field writes use `FD xx` / `LEA ... IY+...` forms;
- the local slots `IX-3` and `IX-6` are only used to spill two IY-derived pointers.

Observed call sites always push two 24-bit descriptor pointers before calling:

| Call site | Push sequence before `CALL 0x00CBE9` |
| --- | --- |
| `0x00D021` | `*(D13FFF)`, then `*(D13FFC)` |
| `0x00D033` | `*(D14002)`, then `*(D13FFF)` |
| `0x00D0F8` | `*(D13FFF)`, then `*(D13FFC)` |
| `0x00D1BB` | `*(D14002)`, then `*(D13FFC)` |
| `0x00D1CD` | `*(D13FFF)`, then `*(D14002)` |

So the caller is definitely pairing existing descriptor nodes from the `D13FFC / D13FFF / D14002` triplet when it invokes this helper.

## Writes Performed by `0x00CBE9`

Using the project’s current decode for the `DD 31` family, `0x00CBE9` writes these output-node bytes:

| Offset | Write pattern | Sites |
| --- | --- | --- |
| `+0x00` | `(old & 0x1F) | srcByte` | `0x00CBF4..0x00CC00` |
| `+0x01` | `((src24 >> 8) & 0xFF)` via `CALL 0x002330` with `A=0x08` | `0x00CC03..0x00CC0F` |
| `+0x02` | `((src24 >> 16) & 0xFF)` via `CALL 0x002330` with `A=0x10` | `0x00CC12..0x00CC1E` |
| `+0x03` | `0x00` | `0x00CC21..0x00CC27` |
| `+0x04` | `(old & 0x1F) | srcByte` | `0x00CC29..0x00CC38` |
| `+0x05` | copy of byte `+0x01` | `0x00CC3B..0x00CC47` |
| `+0x08` | copy of byte `+0x02` | `0x00CC57..0x00CC63` |
| `+0x09` | `0x00` | `0x00CC64..0x00CC6A` |

Notably, this helper does **not** touch `+0x06` or `+0x07`.

The simplest structural reading is:

- `0x00CB7B` builds the back half of each 0x20-byte descriptor node;
- `0x00CBE9` back-fills the header/front-matter bytes used only in the multi-node/table-builder path.

That is consistent with `0x00EB31` skipping `0x00CBE9` entirely.

## CALL Targets

| Target | Identity | Why it is called |
| --- | --- | --- |
| `0x002197` | `__frameset` | reserves the 6-byte frame and installs the `IX` stack frame |
| `0x002330` | 24-bit right-shift / byte-extract helper | extracts byte lanes from the 24-bit source value at shifts `8` and `16` |

There are no other direct calls inside `0x00CBE9`.

## RAM Variables Read/Written

Inside the body of `0x00CBE9` itself:

- absolute RAM reads: none
- absolute RAM writes: none
- local stack writes: `IX-3` and `IX-6`
- output writes: indirect through `IY+offset`

At the call sites, the only direct RAM sources passed into the helper are the three descriptor-pointer globals:

- `D13FFC`
- `D13FFF`
- `D14002`

So `0x00CBE9` operates on the same descriptor triplet already identified in the earlier USB/pipe reports, but it does so entirely through caller-supplied pointers rather than direct `D1xxxx` accesses.

## Overall Conclusion

`0x00CBE9` is a real secondary constructor, not an alternate entry into `0x00CB7B`.

Its job is to populate the **header bytes** that `0x00CB7B` leaves untouched:

- merge/update the two flag bytes at `+0x00` and `+0x04`;
- derive and store byte fields at `+0x01`, `+0x02`, `+0x05`, and `+0x08`;
- zero `+0x03` and `+0x09`.

That division explains the call graph:

- `0x00CD7B` needs both constructors because it builds a multi-descriptor table and therefore needs both the node tail (`0x00CB7B`) and the node header (`0x00CBE9`);
- `0x00EB31` only needs `0x00CB7B`, which is why it never calls `0x00CBE9`.
