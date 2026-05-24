# Phase 426 - Trace D14017 Master Pool Source

**Session**: 426  
**Date**: 2026-05-24  
**Probe**: `probe-phase426-trace-D14017.mjs`

## Summary

`D14017` is not written by the slab allocator and it is not initialized in the boot-time low-ROM window. The only primary write is:

- `0x00CB14`: `LD (D14017),BC`

with a mirrored copy at:

- `0x038EBC`: `LD (D14017),BC`

That write sits inside the `0x00CAF4..0x00CB7A` layout helper, which runs in the `0x00C900..0x00CC00` USB-init window and establishes the slab geometry before pool bootstrap and before descriptor-base copies.

## D14017 Reference Count

Static ROM scan results for the primary bank:

| Address | Total refs | READ | WRITE | Meaning |
| --- | ---: | ---: | ---: | --- |
| `D14017` | 15 | 13 | 2 | Master workspace / descriptor pool root |
| `D14014` | 13 | 3 | 10 | Live context / session pointer |
| `D14011` | 44 | 40 | 4 | Sibling-walker live pointer |
| `D1401A` | 12 | 10 | 2 | Selector-0 slab base |
| `D1401D` | 8 | 6 | 2 | Selector-0 slab end / sentinel |
| `D14020` | 10 | 8 | 2 | Selector-2 slab base |

For `D14017` specifically, the write inventory is:

| Write site | Instruction | Region |
| --- | --- | --- |
| `0x00CB14` | `LD (D14017),BC` | primary layout helper |
| `0x038EBC` | `LD (D14017),BC` | `0x03xxxx` mirror |

There are **no** `D14017` writes:

- below `0x002000` (no boot-time low-ROM write)
- inside `0x006E00..0x007700`
- inside `0x00E06D..0x00E1CB` (slab alloc)
- inside `0x00E37E..0x00E43F` (descriptor init)

## Initialization Chain

### 1. Layout helper seeds `D14017` first

The relevant helper starts at `0x00CAF4` and reaches the first store at `0x00CB14`:

1. `0x00CAFC`: load candidate root `0xD1443F`
2. `0x00CB0A`: call alignment helper `0x0021A7`
3. `0x00CB14`: write aligned result to `D14017`

From there, the same helper derives the rest of the slab geometry directly from that root:

- `0x00CB27`: `D1401A = D14017 + 0x180`
- `0x00CB53`: `D1401D = align(D1401A + 0x200, 0x20)` via the second `0x0021A7` call
- `0x00CB66`: `D14020 = D1401D + 0x400`

So `D14017` is the **master source** for the slab layout. The pool-base variables are downstream products of the `D14017` write, not independent initializers.

### 2. Pre-bootstrap init clears live state

Immediately afterward, the `0x00CC75` chain does the early zeroing work:

- `0x00CC91`: `D14014 = 0`
- `0x00CC9B..0x00CCA0`: clears the `D13FED` live descriptor-table region

This reinforces that the `0x00CB14` write belongs to the same setup path that prepares the USB/descriptor subsystem, not to generic early boot.

### 3. Pool bootstrap consumes `D14017`

The gate at `0x00CD6C` calls `0x00E2EB`, which **reads** `D14017` but does not write it.

Key bootstrap operations inside `0x00E2EB`:

- `0x00E2F8`: read `D14017`
- zero-fill `0x780` bytes at that base
- `0x00E304`: read `D1401D`
- `0x00E309`: copy `D1401D -> D13FEA`
- `0x00E327..0x00E338`: seed `D1405C[0..15] = 1`
- `0x00E351..0x00E362`: seed `D1406C[0..5] = 1`
- `0x00E369`: call `0x00E06D` with selector `2`
- `0x00E36E`: store the bootstrap selector-2 block in `D141BE`

This means the ordering is:

1. write `D14017`
2. derive `D1401A` / `D1401D` / `D14020`
3. bootstrap the pools using those bases

### 4. Descriptor init copies from `D14017`

Only after bootstrap does the descriptor-base init read `D14017`:

- `0x00E37E`: `LD BC,(D14017)`
- `0x00E383`: `LD (D13FD8),BC`
- `0x00E388`: `LD IY,(D14017)`
- `0x00E394`: store `D13FDB = D14017 + 0x40`
- `0x00E3E1`: `LD HL,(D14017)`
- `0x00E3EA`: `LD (D13FDE),HL` after `+0x80`
- `0x00E3EE`: `LD HL,(D14017)`
- `0x00E3FC`: store `D13FE1 = D14017 + 0xC0`

So the `0x00E383` and `0x00E3EA` descriptor-base writes are pure consumers of the root established at `0x00CB14`.

## Answer To The Prompted Questions

### Which functions write `D14017`?

Only the layout helper writes it:

- primary: `0x00CAF4..0x00CB7A`, store at `0x00CB14`
- mirror: `0x038E94..0x038F22`, store at `0x038EBC`

No other write site appeared in the 4 MB scan.

### Does `D14017` get written before or after slab pool init?

**Before.** The `D14017` store at `0x00CB14` happens earlier in the same helper than the slab-base stores:

- `0x00CB14`: write `D14017`
- `0x00CB27`: write `D1401A`
- `0x00CB53`: write `D1401D`
- `0x00CB66`: write `D14020`

So `D14017` is the root input to slab-pool init.

### Is it USB init, slab init, or boot?

It is best described as **USB / descriptor-subsystem init in the `0x00C9xx..0x00CCxx` window**, with the slab layout work embedded inside it.

- not boot-time low ROM
- not allocator-local state
- yes: part of the `0x00CC75`-adjacent init chain that immediately precedes pool bootstrap and descriptor construction

### Does `0x00E06D` write `D14017`?

No.

`0x00E06D` never references `D14017`. Its direct global usage is limited to:

- `D1401A` read
- `D14020` read
- `D1405C` / `D1406C` slot-state writes
- `D140AC` scratch writes

Its connection to `D14017` is only indirect: `D14017` is used earlier to derive the pool bases that `0x00E06D` later consumes.

## Related Variables

The companion scan helps separate the roles of the neighboring globals:

- `D14014` is mostly a **write target**. It is zeroed at `0x00CC91`, then written again by the smaller caller-B path at `0x00EBFC` and `0x00EC20`, and later read by the `0x00ED77` live-descriptor selector family.
- `D14011` is a **walker state variable**, not a pool-root variable. Its writes are later at `0x00E61E` and `0x00E675`, after slab/bootstrap work is already done.
- `D1401A`, `D1401D`, and `D14020` are the actual allocator-facing bases/sentinels, but all three are downstream of the `D14017` master write.

## Bottom Line

`D14017` is the master pool-source variable for this subsystem, and it is initialized exactly once in the primary bank at `0x00CB14`. That happens inside the `0x00CAF4..0x00CB7A` layout helper, before any slab bootstrap and before descriptor-base registration.

The init order is:

1. write `D14017`
2. derive `D1401A`, `D1401D`, `D14020`
3. `0x00E2EB` zero-fills / seeds the slab pools
4. `0x00E383` and `0x00E3EA` copy `D14017` into `D13FD8` and `D13FDE`

So the answer is: **`D14017` is set during the `0x00C9xx..0x00CCxx` USB/descriptor init path, immediately before slab pool init, and not by the allocator itself.**
