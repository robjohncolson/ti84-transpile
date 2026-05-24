# Phase 427 - Trace 0x00CB14 Caller and BC Source

**Session**: 427  
**Date**: 2026-05-24  
**Probe**: `probe-phase427-trace-CB14-caller.mjs`

## Summary

The `LD (D14017),BC` at `0x00CB14` is inside the helper at `0x00CAF4..0x00CB7A`, and `BC` is **not** coming from `malloc` or any allocator return value.

Static disassembly shows this exact sequence:

1. `0x00CAFC`: `LD BC,0xD1443F`
2. `0x00CB03`: `LD BC,0xFFFFE0`
3. `0x00CB07`: `LD HL,(IX-3)` where `(IX-3)` still holds `0xD1443F`
4. `0x00CB0A`: `CALL 0x0021A7`
5. `0x00CB0E`: save aligned `HL` back to `(IX-3)`
6. `0x00CB11`: `LD BC,(IX-3)`
7. `0x00CB14`: `LD (D14017),BC`

The helper at `0x0021A7` performs a 24-bit bitwise `AND` between `HL` and `BC`, so this is an align-down helper:

- `0xD1443F & 0xFFFFE0 = 0xD14420`

Therefore the actual BC value written at `0x00CB14` is:

- **`BC = 0xD14420`**

This is a **fixed RAM workspace address**, not a dynamic allocation.

## Function Containing 0x00CB14

- **Entry point**: `0x00CAF4`
- **Exit**: `0x00CB7A`
- **Size**: `0x87` bytes (`135` bytes)
- **Prologue**: `LD HL,0xFFFFFD ; CALL 0x002197`
- **Epilogue**: `LD SP,IX ; POP IX ; RET`

### Purpose

This function is the layout helper that carves one fixed RAM workspace into the four descriptor/slab globals:

- `D14017` master pool base
- `D1401A` selector-0 slab base
- `D1401D` selector-0 slab end / sentinel
- `D14020` selector-2 slab base

It writes those four globals in order:

- `0x00CB14`: `LD (D14017),BC`
- `0x00CB27`: `LD (D1401A),BC`
- `0x00CB53`: `LD (D1401D),BC`
- `0x00CB66`: `LD (D14020),BC`

## How BC Is Loaded Before The Four Stores

The preamble proves that `BC` is derived locally from literals, not from a call result:

- `0x00CAFC`: load fixed candidate address `0xD1443F`
- `0x00CB03`: load alignment mask `0xFFFFE0`
- `0x00CB0A`: call `0x0021A7`
- `0x00CB11`: reload `BC` from the aligned local temporary

The only call before `0x00CB14` is `0x0021A7`, and that helper does masking/alignment rather than allocation. So the BC source is:

- **fixed literal RAM address**
- **aligned downward to a 0x20 boundary**

It is **not**:

- a malloc result
- a pointer returned in BC by another subsystem
- a copy from an existing global

## Static Values Derived By The Helper

Using the literals embedded in `0x00CAF4..0x00CB7A`, the written geometry is:

| Global | Static value | Derivation |
| --- | --- | --- |
| `D14017` | `0xD14420` | `0xD1443F & 0xFFFFE0` |
| `D1401A` | `0xD145A0` | `D14017 + 0x180` |
| `D1401D` | `0xD15000` | align-down of `0xD157A0` with `0xFFF000` |
| `D14020` | `0xD15400` | `D1401D + 0x400` |

The function also advances a final local cursor to:

- `0xD16C00 = D14020 + 0x1800`

but that end marker is not stored to a named global in this helper.

## Call Chain

### Direct caller of the 0x00CAF4 helper

There is exactly one direct primary-bank call into `0x00CAF4`:

- `0x00CC75`: `CALL 0x00CAF4`

That call sits inside the wrapper function:

- **`0x00CC71..0x00CD7A`** (`266` bytes)

This wrapper immediately performs the broader init work around the layout helper:

- calls `0x00CAF4` first
- clears `D14014`
- clears the `D13FED` connection-table region
- later gates `CALL 0x00E2EB` (pool bootstrap)
- then calls `0x00DE8B`

So the direct chain to the store is:

- caller -> `0x00CC71` -> `0x00CAF4` -> `0x00CB14`

### Direct callers of wrapper 0x00CC71

Static CALL-reference search found three direct callers of `0x00CC71`:

- `0x008A52`
- `0x008EB5`
- `0x0126F5`

Each pushes three immediate BC arguments before the call:

| Call site | Immediates pushed before `CALL 0x00CC71` |
| --- | --- |
| `0x008A52` | `0x000000`, `0x000002`, `0x0007D0` |
| `0x008EB5` | `0x000000`, `0x000001`, `0x00012C` |
| `0x0126F5` | `0x000000`, `0x000001`, `0x0003E8` |

No direct `JP` thunks to `0x00CAF4` or `0x00CC71` were found in the primary scan.

## Answer To The Prompted Questions

### The function containing 0x00CB14: entry point, total size, purpose

- Entry: `0x00CAF4`
- Size: `135` bytes
- Purpose: compute and store the fixed descriptor/slab workspace geometry

### How BC is loaded before the four pool-pointer writes

`BC` comes from a fixed literal (`0xD1443F`) that is aligned by `CALL 0x0021A7` using mask `0xFFFFE0`, then reloaded from a local temporary just before `0x00CB14`.

### Whether BC is a malloc result, fixed RAM address, or something else

It is a **fixed RAM address**, specifically an aligned form of the literal `0xD1443F`.

### All callers of this function

- Direct caller of `0x00CAF4`: `0x00CC75` inside wrapper `0x00CC71`
- Direct callers of wrapper `0x00CC71`: `0x008A52`, `0x008EB5`, `0x0126F5`

### The actual BC value if determinable from static analysis

Yes. It is statically determinable:

- **`BC = 0xD14420`** at `0x00CB14`

## Bottom Line

The master pool base written at `0x00CB14` is not allocated at runtime. The code hard-codes a RAM candidate (`0xD1443F`), aligns it down to `0xD14420`, and then builds the rest of the slab geometry from that fixed base. The init wrapper at `0x00CC71` is the only direct caller of the layout helper, and that wrapper itself has three direct callers in the primary ROM.
