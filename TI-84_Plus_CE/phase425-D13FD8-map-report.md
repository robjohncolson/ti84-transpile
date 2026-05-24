# Phase 425 — D13FD8 / D13FDE Descriptor Base Map

**Session**: 425  
**Date**: 2026-05-24  
**Probe**: `probe-phase425-map-D13FD8.mjs`

## Summary

D13FD8 and D13FDE are best understood as alternate 24-bit pointer-table bases inside the same descriptor pool that also contains the primary D13FED connection table. They are not independent RAM islands.

- `D13FDE = D13FD8 + 0x06`, so it starts exactly two 3-byte entries after D13FD8.
- `D13FED = D13FD8 + 0x15 = D13FDE + 0x0F`, so D13FED starts 7 entries after D13FD8 and 5 entries after D13FDE.
- Caller A (`0x00CD7B–0x00D2EC`) is the 5-entry builder and uses `D13FD8 + 3*slot`.
- Caller B (`0x00EB31–0x00ED76`) is the smaller single-descriptor builder; it still uses the same 3-byte-stride addressing idiom, but roots it at `D13FDE`.

The practical consequence is that the D13FDE window overlaps the broader D13FD8 window rather than defining a separate storage format.

## Total Reference Counts

Prior static mapping from phase 319 established the full absolute-reference totals for the two bases:

| Address | Total refs | READ | WRITE | IMM | Meaning |
| --- | ---: | ---: | ---: | ---: | --- |
| `D13FD8` | 56 | 49 | 2 | 5 | Pointer slot plus 5 immediate base-load uses |
| `D13FDE` | 53 | 28 | 2 | 23 | Pointer slot plus a heavier set of immediate base-load uses |

For descriptor-pool usage specifically, phase 317 separated out the immediate base loads:

| Address | Descriptor-base load refs | Interpretation |
| --- | ---: | --- |
| `D13FD8` | 5 | Root used by the 5-entry Caller A builder family |
| `D13FDE` | 23 | Alternate root used by Caller B plus related mirrored/link-handler families |
| `D13FED` | 24 | Primary 5-slot live connection table used by `0x00ED77` / `0x00FE10` |

### Inter-base bytes: `D13FD9` through `D13FDD`

The new phase 425 probe scans these explicitly so the byte-level picture is complete. The prior phase 319 mapping already suggested the following high-signal outcome:

- `D13FDB` is the only clearly intentional hit in the gap region. It has 42 immediate references and behaves as the companion computed-base literal paired with the D13FD8 family.
- `D13FDA` produced one ambiguous hit in phase 319 and may simply be a coincidental byte pattern in code.
- `D13FD9`, `D13FDC`, and `D13FDD` were not called out as materially referenced in the earlier region-wide mapping and are expected to be sparse or absent.

## Who Initializes And Populates The Bases

There are two different questions here: who writes the base variables themselves, and who fills the descriptor-pointer slots that hang off those bases.

### Base-variable initialization

Phase 319 identified the direct writes to the two base variables:

- `0x00E385` / `0x03B55D`: `LD (D13FD8),BC`, with `BC <- (D14017)`.
- `0x00E3EB` / `0x03B5C3`: `LD (D13FDE),HL`, with `HL = (D14017) + 0x80`.

These sit inside the same D13FD8/D13FDE setup block. The companion write at `0x00E30B` / `0x03B4C5` stores `D13FEA`, which reinforces that this is a broader region-initialization family rather than ad hoc one-off traffic.

### Descriptor-slot population

The actual table contents are then populated by the two builder families traced in phase 424:

- **Caller A**: `0x00CD7B–0x00D2EC`
  - 3 slab allocations via `0x00E06D`
  - 5 calls to `0x00CB7B`
  - 5 calls to `0x00CBE9`
  - final sibling-walker handoff through `*(D13FD8 + 3*slot)`
- **Caller B**: `0x00EB31–0x00ED76`
  - 1 slab allocation via `0x00E06D`
  - 1 call to `0x00CB7B`
  - copy/build loop at `0x00EC65–0x00ED0F`
  - final sibling-walker handoff through `*(D13FDE + 3*slot)`

So the base variables are initialized by the `0x00E3xx` / `0x03B5xx` setup block, while the pointed-to descriptor/node slots are populated downstream by the descriptor builders.

## Relationship Between D13FD8 And D13FDE

The key structural fact is the `0x06`-byte separation:

```text
D13FD8   entry 0
D13FDB   entry 1
D13FDE   entry 2
D13FE1   entry 3
D13FE4   entry 4
```

That means:

- a 5-entry table rooted at `D13FD8` spans `D13FD8..D13FE6`
- `D13FDE` lands inside that span as entry index 2
- Caller B's root is therefore an overlapping sub-window into the same 3-byte-entry pool, not a new format

This matches the phase 317 conclusion that the broader region is one contiguous array of 24-bit pointers, with multiple code paths choosing different roots:

- `D13FD8`: index `-7` relative to `D13FED`
- `D13FDE`: index `-5` relative to `D13FED`
- `D13FED`: primary runtime base

## Relationship To The D13FED Connection Table

Phase 421 and phase 423 showed that `D13FED` is the live 5-slot connection table used by:

- `0x00ED77` — handshake slot selector
- `0x00FE10` — transfer dispatcher

Those routines treat `D13FED` as a table of 24-bit descriptor pointers and compare each selected descriptor against:

- `D14014` — live context/session pointer
- `D141E2` — latched context/session pointer
- `D13FE7` — active descriptor pointer

So the clean relationship is:

- `D13FD8` / `D13FDE`: upstream staging or builder-oriented windows into the pool
- `D13FED`: downstream live connection table used by the runtime link/USB dispatcher

This is why the two systems feel related but not identical. They share entry width, overlap in address space, and feed the same descriptor/node family, but they are consumed by different parts of the call chain.

## Descriptor Table Entry Format

The indexed access pattern is consistent:

```text
slot_ptr = *(base + 3*slot)
```

That gives a confirmed entry width of **3 bytes per slot** for D13FD8, D13FDE, and D13FED.

There are two layers to the structure:

### Layer 1: table slot

Each slot is a 24-bit pointer.

### Layer 2: pointed object

Two related consumers show what that pointer leads to:

- **`0x00E583` sibling-walker callers** (`D13FD8` / `D13FDE` roots):
  - the slot points at a selector-0 slab-chain / sibling node
  - node bytes `+0..+2` encode the next-sibling pointer
  - bit 0 of byte `+0` is the terminal-node marker

- **`0x00ED77` / `0x00FE10` runtime dispatcher** (`D13FED` root):
  - `+0`: callback pointer
  - `+8`: flag byte, bit 7 = busy/in-use gate
  - `+9`: primary context/session pointer
  - `+12`: secondary working pointer
  - `+18`: size/start field
  - `+21`: size/limit field
  - `+27`: staged disposition/state

The phase 425 probe exists to enumerate the exact site list around the alternate roots, but the underlying layout is already clear: the roots all index the same 3-byte pointer pool, and the pointed objects belong to the same link/descriptor pipeline.

## What The New Probe Should Confirm

- how the exact D13FD8 and D13FDE site lists split between pure base loads, direct reads, and direct writes
- whether any real field accesses hit `D13FD9`, `D13FDC`, or `D13FDD`
- how much of the D13FDE traffic belongs to Caller B itself versus the mirrored link-handler families
- whether every D13FD8/D13FDE base load is still consistent with the `base + 3*slot` interpretation
