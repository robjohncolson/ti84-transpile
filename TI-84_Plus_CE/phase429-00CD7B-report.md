# Phase 429: `0x00CD7B` Descriptor Table Builder

## Summary

`0x00CD7B..0x00D2EC` is a separate 1394-byte function that sits immediately after `0x00CC71`. The exact boundary matters: `0x00CC71` ends at `0x00CD7A`, so `0x00CD7B` is the next function in ROM, not a fall-through tail of the wrapper.

This routine is not loop-driven. It is a fixed-shape builder with:

1. a top-level request-type dispatch,
2. a second request-code dispatch that collapses many request forms into selector `1`, `2`, or `3`,
3. a rollback-safe slab-allocation phase for `D13FFC / D13FFF / D14002`,
4. one of three unrolled constructor branches,
5. one final handoff to the sibling walker at `0x00E583`.

The practical result is:

- `selector 2` builds a **2-descriptor** live set (`D13FFC` + `D13FFF`)
- `selector 1` and `selector 3` build a **3-descriptor** live set (`D13FFC` + `D13FFF` + `D14002`)

There are **no backward `JR`/`JP` branches** in the reachable code. The “how many entries?” question is answered by dispatch, not by iteration.

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x00CD7B` |
| End | `0x00D2EC` |
| Size | `1394` bytes (`0x572`) |
| Prologue | `LD HL,-3 ; CALL 0x002197` |
| Epilogue | `LD A,(IX-2) ; LD SP,IX ; POP IX ; RET` |
| Port I/O in body | none |
| Backward branches | none |

## Direct CALL Targets

| Target | Role | Count |
| --- | --- | ---: |
| `0x002197` | stack frame setup | 1 |
| `0x00211B` | sparse `_seqcase` helper | 1 |
| `0x0021C2` | zero/null check | 3 |
| `0x0025E8` | post-walk predicate/helper | 1 |
| `0x002623` | dense `_seqcase` helper | 4 |
| `0x00276B` | 24-bit pack/convert helper | 2 |
| `0x0027E8` | copy/helper | 3 |
| `0x00CB7B` | descriptor tail constructor | 5 |
| `0x00CBE9` | descriptor header/link constructor | 5 |
| `0x00E06D` | slab allocator (`selector 0`) | 3 |
| `0x00E1CC` | slab free (`selector 0`) | 3 |
| `0x00E583` | sibling walker | 1 |

## Dispatch Structure

### 1. Top-level request-type dispatch

At `0x00CD8F..0x00CDAB`, the function reads packet byte `0`, shifts right five times, masks with `3`, and dispatches through a dense `_seqcase` table:

| Selector source | Meaning | Target |
| --- | --- | --- |
| `((packet[0] >> 5) & 3) == 0` | type family 0 | `0x00CDC0` |
| `== 1` | type family 1 | `0x00CE0C` |
| `== 2` | type family 2 | `0x00CE49` |
| default (`== 3`) | unsupported / no-build | `0x00CE6B` |

### 2. Request-code normalization

The branch bodies do not build descriptors directly. They normalize many request forms into one local selector byte at `IX-1`.

#### Type family 0: dense `bRequest` table

`0x00CDCA` uses a 12-entry dense table on packet byte `1`.

- values `{0, 6, 8, 10}` set `IX-1 = 1`
- values `{1, 3, 5, 9, 11}` set `IX-1 = 2`
- value `{7}` sets `IX-1 = 3`
- values `{2, 4}` and the default path leave `IX-1 = 0`

#### Type family 1: sparse `bRequest` table

`0x00CE16` uses a 6-entry sparse table:

- keys `{0x01, 0x02, 0x03}` set `IX-1 = 1`
- key `{0x0A}` sets `IX-1 = 2`
- keys `{0x09, 0x0B}` set `IX-1 = 3`
- default leaves `IX-1 = 0`

#### Type family 2: direct compares

`0x00CE49..0x00CE67` compares packet byte `1` against `0xFF`, `0xF9`, and `0xF8`.

- any of those three values sets `IX-1 = 2`
- otherwise `IX-1` stays `0`

### 3. What actually determines the descriptor count?

The count is determined entirely by the normalized selector:

- `IX-1 == 2`: build **2 live descriptors**
- `IX-1 == 1` or `IX-1 == 3`: build **3 live descriptors**
- `IX-1 == 0`: **do not build**

This is enforced at `0x00CED0..0x00CEE0`:

- `D13FFC` is always allocated first
- `D13FFF` is always allocated second
- `D14002` is allocated only if `IX-1 != 2`

There is no runtime loop over “N descriptors.” The builder is fully unrolled.

## Slab Allocator Usage (`0x00E06D`)

All three allocation call sites push `BC = 0` before `CALL 0x00E06D`, so this function is always using the selector-0 slab pool:

| Site | Destination global | Meaning |
| --- | --- | --- |
| `0x00CE7D` | `D13FFC` | primary live descriptor |
| `0x00CE9C` | `D13FFF` | secondary live descriptor |
| `0x00CEDC` | `D14002` | tertiary live descriptor, only when `IX-1 != 2` |

Each allocation is checked immediately with `0x0021C2`.

### Failure / rollback paths

- if `D13FFC` allocation fails: return immediately
- if `D13FFF` allocation fails:
  - free `D13FFC` via `0x00E1CC`
  - zero `D13FFC`
  - return
- if `D14002` allocation fails:
  - free `D13FFC`
  - free `D13FFF`
  - zero both globals
  - return

So the allocator usage is cleanly nested and rollback-safe.

## Node Constructor Usage

The function contains **five** call sites to `0x00CB7B` and **five** call sites to `0x00CBE9`, but any single invocation only executes one selector branch:

### `0x00CB7B` sites

- `0x00CFF2`
- `0x00D00E`
- `0x00D0E5`
- `0x00D162`
- `0x00D1A8`

### `0x00CBE9` sites

- `0x00D021`
- `0x00D033`
- `0x00D0F8`
- `0x00D1BB`
- `0x00D1CD`

### Branch-local constructor counts

| Selector | Entry block | `0x00CB7B` calls | `0x00CBE9` calls | Live descriptor set |
| --- | --- | ---: | ---: | --- |
| `1` | `0x00CFE2` | 2 | 2 | `D13FFC`, `D13FFF`, `D14002` |
| `2` | `0x00D0D5` | 1 | 1 | `D13FFC`, `D13FFF` |
| `3` | `0x00D14E` | 2 | 2 | `D13FFC`, `D13FFF`, `D14002` |

That is the clearest answer to “how many descriptor entries does it build?”:

- the live slab set is **2 or 3 descriptors**
- the constructor pass count is **2 or 4 calls total**, depending on selector

## Descriptor Table Bases Referenced

### Direct D1xxxx accesses inside the body

The body directly reads/writes only four D1xxxx locations:

| Address | Role |
| --- | --- |
| `D13FFC` | primary live descriptor pointer |
| `D13FFF` | secondary live descriptor pointer |
| `D14002` | tertiary live descriptor pointer |
| `D141BE` | descriptor/config source buffer |

There are **no direct `LD (D13FDE)` / `LD (D13FE1)` accesses** in the builder body.

### Indirect descriptor-table base selection

The descriptor-table base array appears only once, in the sibling-walker handoff at `0x00D26B..0x00D295`:

```text
0x00D27C  LD A,(IX+6)
0x00D283  3 * A
0x00D287  LD BC,0xD13FD8
0x00D28B  ADD HL,BC
0x00D28C  LD BC,(HL)
```

So the code computes:

```text
slot_addr = D13FD8 + 3 * arg0
slot_ptr  = *(slot_addr)
```

That means the runtime-selected table slot can land on:

- `D13FD8`
- `D13FDB`
- `D13FDE`
- `D13FE1`
- and later 3-byte entries in the same pointer array

The function therefore references `D13FDE` and friends **indirectly through the `D13FD8` base**, not through hard-coded loads/stores.

## Overall Architecture

The architecture is best described as:

1. decode request family from packet byte `0`
2. decode request code from packet byte `1`
3. normalize that into selector `1/2/3/0`
4. allocate 2 or 3 selector-0 slabs into `D13FFC / D13FFF / D14002`
5. run one of three unrolled constructor branches
6. hand the completed structure to `0x00E583`
7. run a small post-walk dispatch (`0x00D2AE`) for selectors `1` and `2`

### Post-walk dispatch

`0x00D2AE` is another dense `_seqcase`:

- selector `1` -> `0x00D2C3`
- selector `2` -> `0x00D2C3`
- selector `3` -> immediate epilogue
- default -> immediate epilogue

So only selectors `1` and `2` execute the extra `0x0025E8 / 0x00276B / 0x0027E8` tail.

## Bottom Line

`0x00CD7B` is a **switch-driven, fully unrolled descriptor builder**.

- It does **not** contain a loop that builds `N` entries.
- It chooses between **no build**, a **2-descriptor** build, and two different **3-descriptor** builds.
- It uses `0x00E06D` purely as a selector-0 slab allocator for the live globals `D13FFC / D13FFF / D14002`.
- It uses `0x00CB7B` and `0x00CBE9` as paired constructors in branch-specific, fixed call patterns.
- It references the wider descriptor-table base array through the single computed base `D13FD8 + 3 * arg0` before calling `0x00E583`.

## Probe

Companion probe:

- `TI-84_Plus_CE/probe-phase429-trace-00CD7B.mjs`

Run:

```bash
node TI-84_Plus_CE/probe-phase429-trace-00CD7B.mjs
```
