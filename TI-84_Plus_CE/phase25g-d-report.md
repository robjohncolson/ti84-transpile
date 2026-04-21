# Phase 25G-d Report

## Scope

- Goal: establish the real index formula for the ROM scan-code translation table at `0x09F79B`.
- Requested key injection: `keyMatrix[3] = 0xFD`, raw matrix code `0x31`.
- Note: the task text calls this the `1` key, but [`keyboard-matrix.md`](./keyboard-matrix.md) labels `keyMatrix[3]:bit1` as `2`.

## Findings

- Boot reached HALT after `3025` steps at `0x0019B5`.
- The requested ISR/event-loop run from `0x000038` executed `17` blocks, halted at `0x0019B6`, and did **not** reach `0x00B608`.
- The ISR/event-loop stage performed **zero** reads from `0x09F79B..0x09F87E`.
- A live call to the working raw scanner at `0x0159C0` captured raw scan code `0x31` for the requested matrix position.
- Converting that live raw code to the compact ROM lookup index gives `0x1A`.
- Driving the ROM lookup entry at `0x02FF0B` with `A=0x1A` produced repeated reads from `0x09F7B5`, which is `0x09F79B + 0x1A`.
- The byte read at offset `0x1A` was `0x90`.

## Table Reads Observed

All observed reads came from the lookup stage, not the ISR/event-loop stage.

| Address | Offset | Value | Caller PC |
| --- | --- | --- | --- |
| `0x09F7B5` | `0x1A` | `0x90` | `0x0302EB` |
| `0x09F7B5` | `0x1A` | `0x90` | `0x02FF6D` |
| `0x09F7B5` | `0x1A` | `0x90` | `0x02FFAE` |
| `0x09F7B5` | `0x1A` | `0x90` | `0x02FFBF` |
| `0x09F7B5` | `0x1A` | `0x90` | `0x02FFDE` |

## Inferred Index Formula

For the requested raw matrix code `0x31`, the table offset is **not** identity.

`f(0x31) = 0x1A`

The observed mapping matches the flattened matrix formula:

```text
offset = ((raw >> 4) * 8) + (raw & 0x0F) + 1
```

For `raw = 0x31`:

```text
group = 0x3
bit   = 0x1
offset = (3 * 8) + 1 + 1 = 26 = 0x1A
```

## Interpretation

- The ROM table at `0x09F79B` is indexed by the compact `_GetCSC`-style slot, not by raw `(group << 4) | bit`.
- In this ROM snapshot, the ISR keyboard branch only acknowledges the interrupt and returns; it does not itself reach the translation-table read.
- The first real table access for the requested live key position is the compact slot `0x1A`, whose no-modifier byte is `0x90`.

## Bottom Line

- Reached `0x00B608`: **no**
- Event-loop table reads: **none**
- Live raw scan captured: **`0x31`**
- Actual table offset used for that raw key position: **`0x1A`**
- Real index formula: **`offset = ((raw >> 4) * 8) + (raw & 0x0F) + 1`**
