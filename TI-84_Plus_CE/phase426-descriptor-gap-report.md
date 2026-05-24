# Phase 426: Descriptor `+8/+9` Gap Report

## Summary

- Raw ROM scan found `241` direct IY-relative write sites that touch descriptor offsets `+8` or `+9`.
- Direct sites split `139` writes to `+8` and `102` writes to `+9`.
- A second pass found `25` HL-indirect writeback sequences rooted at `LEA HL, IY+8/9`; all `25` land on effective offset `+9` via `LEA HL, IY+8 ; INC HL ; LD (HL), ...`.
- In the descriptor/slab neighborhood `0x00CB00-0x00EE00`, there are `23` relevant sites total:
  - `14` direct IY-relative writes
  - `9` HL-indirect `+9` writebacks
- There are no raw `+8/+9` writes inside either adjacent constructor body:
  - `0x00CB7B..0x00CBE8`
  - `0x00CBE9..0x00CC70`
- The first neighborhood hit is `0x00CF39`, so the missing bytes are filled later by descriptor-management code, not by the two constructors themselves.

## Major clusters

| Range | What clusters there |
| --- | --- |
| `0x00CF39..0x00D264` | earliest descriptor-cluster hits; `+9` is updated through HL-indirect writebacks and `+8` is bit-toggled directly on the `D13FFC / D13FFF / D14002` descriptor triplet |
| `0x00D4BB` | lone direct immediate store to `+9` (`LD (IY+9),0`) |
| `0x00E11B..0x00E131` | slab allocator / fresh-node init touches both bytes on `D140AC` |
| `0x00E76E..0x00E80A` | runtime toggles bit 7 of `+8` on `D14008` and `D14011` |
| `0x00EBE8..0x00EC11` | post-build/runtime cleanup updates `+9` and sets bit 0 of `+8` |
| `0x03BD4C..0x03D233` and nearby `0x03CF..0x03D2` | mirror copies of the same descriptor logic in the bank-3 duplicate region |

Outside the descriptor subsystem, the densest unrelated raw clusters are at `0x0159DD..0x015A91`, `0x052D24..0x052E0C`, `0x08C345..0x08C60F`, `0x092670..0x0927C1`, and `0x0B79D8..0x0B7B0E`.

## Descriptor-cluster write sites

### HL-indirect writes to effective `IY+9`

| Addr | Bytes | Decoded |
| --- | --- | --- |
| `0x00CF39` | `ed 23 08 23 77` | `lea hl, iy+8 ; inc hl ; ld (hl), a` |
| `0x00CF8C` | `ed 23 08 23 77` | `lea hl, iy+8 ; inc hl ; ld (hl), a` |
| `0x00CFAB` | `ed 23 08 23 77` | `lea hl, iy+8 ; inc hl ; ld (hl), a` |
| `0x00CFC1` | `ed 23 08 23 77` | `lea hl, iy+8 ; inc hl ; ld (hl), a` |
| `0x00D092` | `ed 23 08 23 77` | `lea hl, iy+8 ; inc hl ; ld (hl), a` |
| `0x00D22C` | `ed 23 08 23 77` | `lea hl, iy+8 ; inc hl ; ld (hl), a` |
| `0x00E131` | `ed 23 08 23 77` | `lea hl, iy+8 ; inc hl ; ld (hl), a` |
| `0x00EBE8` | `ed 23 08 23 77` | `lea hl, iy+8 ; inc hl ; ld (hl), a` |
| `0x00EC11` | `ed 23 08 23 77` | `lea hl, iy+8 ; inc hl ; ld (hl), a` |

Observed bit patterns around those writebacks:

- `0x00CF26..0x00CF39`: `AND 0xFC`, then `SET 1` before the writeback
- `0x00CF76..0x00CF8C`: `AND 0xFC`, then `SET 0`
- `0x00CF98..0x00CFAB`: `AND 0xFC`, then write low two bits as `00`
- `0x00CFB0..0x00CFC1`: clear bit 7 and write back
- `0x00D081..0x00D092`: clear bit 7 and write back
- `0x00E123..0x00E131`: `AND 0x73`, then `OR 0x83`
- `0x00EBE1..0x00EBE8`: `AND 0xFC`
- `0x00EC0A..0x00EC11`: `SET 0`

That is strong evidence that byte `+9` is a mode/state field, not pointer payload.

### Direct writes to `IY+8`

| Addr | Bytes | Decoded | Nearby behavior |
| --- | --- | --- | --- |
| `0x00D0A6` | `fd 77 08` | `ld (iy+8), a` | after `RES 7,A`, writes back to `D13FFC+8` |
| `0x00D0B8` | `fd 77 08` | `ld (iy+8), a` | after `SET 7,A`, writes back to `D13FFF+8` |
| `0x00D0CA` | `fd 77 08` | `ld (iy+8), a` | after `SET 7,A`, writes back to `D14002+8` |
| `0x00D131` | `fd 77 08` | `ld (iy+8), a` | after `RES 7,A`, writes back to `D13FFC+8` |
| `0x00D143` | `fd 77 08` | `ld (iy+8), a` | after `SET 7,A`, writes back to `D13FFF+8` |
| `0x00D240` | `fd 77 08` | `ld (iy+8), a` | after `RES 7,A`, writes back to `D13FFC+8` |
| `0x00D252` | `fd 77 08` | `ld (iy+8), a` | after `SET 7,A`, writes back to `D14002+8` |
| `0x00D264` | `fd 77 08` | `ld (iy+8), a` | after `SET 7,A`, writes back to `D13FFF+8` |
| `0x00E11B` | `fd 77 08` | `ld (iy+8), a` | allocator clears bit 7 on `D140AC+8` |
| `0x00E76E` | `fd 77 08` | `ld (iy+8), a` | sets bit 7 on `D14008+8` |
| `0x00E79A` | `fd 77 08` | `ld (iy+8), a` | second path that also sets bit 7 on `D14008+8` |
| `0x00E80A` | `fd 77 08` | `ld (iy+8), a` | clears bit 7 on `D14011+8` |
| `0x00EBF5` | `fd 77 08` | `ld (iy+8), a` | sets bit 0 on current node `+8` |

The neighborhood never writes arbitrary immediates to `+8`; every hit is a read/modify/write on bits `7` or `0`.

### Direct write to `IY+9`

| Addr | Bytes | Decoded | Nearby behavior |
| --- | --- | --- | --- |
| `0x00D4BB` | `fd 36 09 00` | `ld (iy+9), 0x00` | explicit zero-init path after `PUSH HL / POP IY` |

This is the only direct `+9` store in the descriptor neighborhood. Every other `+9` update in the same cluster is HL-indirect and bit-oriented.

## What this means for the descriptor gap

The two-byte gap is not unclaimed memory. The ROM treats it as runtime metadata and initializes it outside the two adjacent constructors:

- `+8` behaves like a status/ownership byte.
  - Only bits `7` and `0` are touched in the descriptor cluster.
  - The allocator path at `0x00E0D9` clears bit `7` (`0x00E11B`).
  - Later control paths set/clear bit `7` on specific live descriptor globals (`0x00D0A6..0x00D264`, `0x00E76E`, `0x00E79A`, `0x00E80A`).
  - Teardown/finalization sets bit `0` at `0x00EBF5`.
- `+9` behaves like a mode/type/state byte.
  - Low bits are repeatedly normalized with `AND 0xFC`, then written back with `SET 0`, `SET 1`, or `00`.
  - Bit `7` is also cleared/set in the same byte via HL-indirect read/modify/write.
  - The allocator path at `0x00E123..0x00E131` writes a masked form `((old & 0x73) | 0x83)`, which looks like a default control-state pattern, not payload.

## Hypothesis

- Descriptor byte `+8` is a per-node flags byte used for ownership/activation:
  - bit `7` looks like a selected/active/high-priority marker
  - bit `0` looks like a valid/armed/processed marker
- Descriptor byte `+9` is a per-node mode byte:
  - low two bits appear to encode a small subtype/state value
  - bit `7` acts like an additional control flag
  - middle bits are preserved across some transitions, so they likely hold persistent state rather than transient pointer data

So the real answer to the `+8/+9` gap is:

- `0x00CB7B` and `0x00CBE9` do not initialize those two bytes.
- The first descriptor-subsystem code that clearly does is the later builder/orchestrator block starting at `0x00CF26`, plus the slab allocator path at `0x00E0D9`.
- Those bytes are runtime state fields, not omitted pointer bytes from the static constructor pair.

## Probe

Companion probe:

- `TI-84_Plus_CE/probe-phase426-descriptor-gap.mjs`

Run:

```bash
node TI-84_Plus_CE/probe-phase426-descriptor-gap.mjs
```
