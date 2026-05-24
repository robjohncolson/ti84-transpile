# Phase 432: `0x0391DC` Parallel Descriptor Builder

## Summary

`0x0391DC..0x0397B1` is a 1494-byte parallel copy of the `0x00CD7B` USB descriptor builder. The important result is that the **allocation / constructor / sibling-walker half is still the same shape** as `0x00CD7B`; the extra 100 bytes sit almost entirely in the **request-normalization front end**.

After resolving low ROM wrapper calls and `0x03xxxx` mirrors, `0x0391DC` hits the same downstream helper set and the same call-count profile as `0x00CD7B`:

- `__frameset` x1
- sparse switch x1
- dense switch x4
- zero/null check x3
- post-walk predicate x1
- u24 pack helper x2
- copy/helper x3
- tail-field constructor x5
- header/link constructor x5
- slab allocator x3
- slab free x3
- sibling walker x1

So this is not a fundamentally different builder. It is the same builder core with a richer selector-decoding front half.

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x0391DC` |
| End | `0x0397B1` |
| Size | `1494` bytes (`0x5D6`) |
| Reference builder | `0x00CD7B..0x00D2EC` |
| Size delta vs `0x00CD7B` | `+100` bytes |
| Port I/O in body | none |
| New absolute RAM refs vs `0x00CD7B` | none |

The reachable walk ends cleanly at `RET` `0x0397B1`. This matches the earlier D141BE survey, which already tagged the function as `0x0391DC-0x0397B1 (1494 bytes)`.

## Call Target Comparison

### Raw `0x0391DC` call targets

| Raw target | Role |
| --- | --- |
| `0x0000A4` | wrapper for `0x0027E8` |
| `0x000124` | wrapper for `0x00211B` |
| `0x00012C` | wrapper for `0x002197` |
| `0x000138` | wrapper for `0x0021C2` |
| `0x000204` | wrapper for `0x0025E8` |
| `0x000210` | wrapper for `0x002623` |
| `0x000264` | wrapper for `0x00276B` |
| `0x038F55` | `0x03xxxx` role-equivalent of `0x00CB7B` |
| `0x038FC3` | `0x03xxxx` role-equivalent of `0x00CBE9` |
| `0x03AF39` | `0x03xxxx` role-equivalent of `0x00E06D` |
| `0x03B2ED` | `0x03xxxx` role-equivalent of `0x00E1CC` |
| `0x03B7BD` | `0x03xxxx` role-equivalent of `0x00E583` |

### What actually changed

- The **shared low utilities** are still the same utilities as `0x00CD7B`, but reached through low wrapper entries like `0x000210 -> 0x002623`.
- The **high ROM helpers** are the expected `0x03xxxx` siblings:
  - `0x038F55` instead of `0x00CB7B`
  - `0x038FC3` instead of `0x00CBE9`
  - `0x03AF39` instead of `0x00E06D`
  - `0x03B2ED` instead of `0x00E1CC`
  - `0x03B7BD` instead of `0x00E583`
- There are **no new downstream helper families** beyond those wrappers/mirrors.

The direct role match is supported by structure:

- `0x038F55` consumes the D141BE-backed source data and fills tail fields, which matches the `0x00CB7B` tail-field constructor role.
- `0x038FC3` back-fills header/link bytes between descriptor nodes, matching the `0x00CBE9` header/link constructor role.
- `0x03AF39` / `0x03B2ED` / `0x03B7BD` line up with the allocator / free / walker positions exactly.

## Dispatch Structure

## 1. Top-level request-family dispatch is unchanged in shape

`0x03920C` uses a 3-entry dense table (default to no-build), just like `0x00CD7B`.

| Case | Target |
| --- | --- |
| `0x00` | `0x039221` |
| `0x01` | `0x039273` |
| `0x02` | `0x0392D6` |
| default | `0x039330` |

So the builder still starts by classifying packet byte `0` into three handled families plus a default no-build exit.

## 2. Type-family-0 dense table is effectively unchanged

At `0x03922B`, the 12-entry dense `bRequest` table maps to the same selector outcomes as `0x00CD7B`:

- selector `1`: cases `0, 6, 8, 10`
- selector `2`: cases `1, 3, 5, 9, 11`
- selector `3`: case `7`
- no-build: cases `2, 4`, plus default

So family 0 is not where the 100-byte growth comes from.

## 3. Type-family-1 sparse table is expanded

At `0x03927D`, the sparse request table grows from **6 entries** in `0x00CD7B` to **11 entries** here.

### `0x00CD7B`

- `0x01, 0x02, 0x03 -> selector 1`
- `0x0A -> selector 2`
- `0x09, 0x0B -> selector 3`

### `0x0391DC`

- `0x00 -> selector 3`
- `0x01, 0x02, 0x03 -> selector 1`
- `0x09 -> selector 3`
- `0x0A -> selector 2`
- `0x0B -> selector 3`
- `0x20 -> selector 3`
- `0x22 -> selector 2`
- `0xFE -> selector 1`
- `0xFF -> selector 2`

That alone adds 5 more sparse entries, or 20 bytes of inline table payload.

## 4. Type-family-2 logic is much richer

This is the biggest functional difference.

### `0x00CD7B`

Type family 2 only checked packet byte `1` against:

- `0xFF`
- `0xF9`
- `0xF8`

If matched, it set selector `2`; otherwise the selector stayed `0` and the function bailed out.

### `0x0391DC`

Type family 2 now checks:

- `0xFF`
- `0xF9`
- `0xF7`
- `0xF8`

If one of those matches, it still takes selector `2`.

If none of them match, the code no longer falls straight to no-build. Instead it runs a fallback classifier:

1. seed selector `2`
2. test packet byte `0` bit `7`
3. if bit `7` is set, promote to selector `1`
4. else test packet bytes `6` and `7`
5. if either is non-zero, promote to selector `3`
6. otherwise keep selector `2`

That extra fallback path is real new logic, not just a larger table.

## 5. The downstream constructor switch is unchanged in shape

At `0x039492`, the builder still dispatches through a 3-entry dense selector table with base `1`:

- selector `1 -> 0x0394A7`
- selector `2 -> 0x03959A`
- selector `3 -> 0x039613`
- default -> `0x039730`

The post-walk tail at `0x039773` is also the same pattern as `0x00CD7B`:

- selector `1` and `2` share `0x039788`
- selector `3` and default exit at `0x0397AA`

So there are **no extra constructor-stage handlers** and **no larger final selector tables**.

## Where The Extra 100 Bytes Went

The extra 100 bytes are best explained as:

- a larger sparse family-1 request table
- the new family-2 literal `0xF7` check
- the new family-2 fallback classifier that inspects packet byte `0` bit `7` and packet bytes `6`/`7`

They are **not** explained by:

- extra slab allocations
- extra constructor branches
- extra post-walk handlers
- new port I/O
- new RAM structures

The allocation / construction half still follows the same fixed-shape pattern:

- allocate `D13FFC`
- allocate `D13FFF`
- optionally allocate `D14002`
- run one of three unrolled constructor branches
- call the sibling walker once
- optionally run the same post-walk helper tail

## RAM and Port References

`0x0391DC` touches the same absolute RAM set already known from `0x00CD7B`:

- `D13FD8` as the descriptor pointer-array base
- `D13FFC`
- `D13FFF`
- `D14002`
- `D141BE`

There are **no new D1xxxx addresses** in the function body, and there is **no port I/O** in the function body.

## Bottom Line

`0x0391DC` is a real parallel descriptor-builder copy, but not a new architecture.

- The **builder core is the same** as `0x00CD7B`.
- The **callee family is the same after wrapper/mirror resolution**.
- The **3-builder-branch constructor stage is unchanged**.
- The extra 100 bytes are concentrated in the **selector-normalization front end**, especially:
  - the larger type-family-1 sparse table
  - the richer type-family-2 fallback logic

So the best summary is:

> `0x0391DC` is `0x00CD7B` with a broader USB request classifier, not with extra downstream descriptor-construction cases.
