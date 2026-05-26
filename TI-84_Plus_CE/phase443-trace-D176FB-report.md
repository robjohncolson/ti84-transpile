# Phase 443 - Trace D176FB Report

## Key Findings

- There are `34` literal `D176FB` hits in the 4 MB ROM: `30` writes and `4` reads.
- `D176FB` behaves as a 1-byte boolean side-flag, not a counter or enum.
- Write values are only `0x00` and `0x01`.
  - `18` sites clear it to `0x00`.
  - `11` sites force `0x01`.
  - `1` site (`0x03CD68`) stores a computed boolean, but the computed value is still only `0x00` or `0x01`.
- The four readers never do arithmetic or range tests on `D176FB`; they only do `OR A` and branch away when the byte is nonzero.
- `0x011576` does **not** read `D176FB` directly. Callers set `D176FB = 1` before entering the `0x011576` worker family, and the actual gating shows up later in the four external reader sites.

## Full Reference Inventory

### Reads (4)

- `0x009434` - `LD A,(0xD176FB)` then `OR A ; JR NZ`
- `0x00F274` - `LD A,(0xD176FB)` then `OR A ; JP NZ`
- `0x02BF29` - `LD A,(0xD176FB)` then `OR A ; JP NZ`
- `0x042999` - `LD A,(0xD176FB)` then `OR A ; JR NZ`

### Writes that force `0x01` (11)

- `0x00E726`
- `0x00F481`
- `0x00FB93`
- `0x00FEC1`
- `0x013753`
- `0x0137B5`
- `0x0137D0`
- `0x0138B6`
- `0x0138D1`
- `0x03B970`
- `0x048590`

### Computed boolean write (1)

- `0x03CD68`
  - The surrounding code first stores either `BC = 1` or `BC = 0` into `(IX-19)`, then does `LD A,(IX-19)` and `LD (0xD176FB),A`.
  - So this site still writes only a boolean `0` or `1`.

### Writes that clear to `0x00` (18)

- `0x00AA46`
- `0x00B8B7`
- `0x00F164`
- `0x00F2F0`
- `0x00FBF2`
- `0x0150E5`
- `0x02BCCF`
- `0x02BFAA`
- `0x02C0D9`
- `0x047EEA`
- `0x048450`
- `0x049746`
- `0x04D574`
- `0x04DC2C`
- `0x04DFB3`
- `0x04E00E`
- `0x04E025`
- `0x064AFE`

## Value Characterization

`D176FB` is a boolean side-flag.

Evidence:

- Every direct reader is `LD A,(D176FB)` followed by `OR A` and a zero/nonzero branch.
- No reader compares it against values other than zero.
- No site uses `INC`, `DEC`, `ADD`, `CP n`, table indexing, or multi-byte transfers on `D176FB`.
- The only non-constant writer (`0x03CD68`) still writes a computed `0` or `1`.

The correct model is:

- `0x00` = clear / inactive / no deferred side condition armed
- `0x01` = side condition armed, acknowledged, or deferred follow-up pending

## What It Gates

### Reader behavior

| Read site | Branch on nonzero | Observed effect |
| --- | --- | --- |
| `0x009434` | `JR NZ,0x0094B5` | The helper returns its pre-zeroed local `(IX-3)` value immediately instead of calling `0x009394` / `0x0093D3`. This is a null-return short circuit. |
| `0x042999` | `JR NZ,0x042A1A` | Mirror of `0x009434`: it returns the pre-zeroed local immediately and skips `0x0428D5` / `0x042914`. |
| `0x00F274` | `JP NZ,0x00EF8E` | Aborts the protocol helper before later checks on `D140B2`, `D140AF`, and `D177B8`, and before the deeper cleanup / delivery continuation. |
| `0x02BF29` | `JP NZ,0x02B9CC` | Mirror of `0x00F274`: same early-exit role in the banked link/USB path. |

### Behavioral interpretation

When `D176FB` is `1`:

1. Two query-style helpers (`0x009434`, `0x042999`) return a null/zero result immediately.
2. Two protocol/link helpers (`0x00F274`, `0x02BF29`) exit early before continuing normal transport-side work.

So the practical effect is:

- `D176FB = 1` suppresses normal query / poll / cleanup behavior in several surrounding helper families.
- It marks that the USB/link pipeline is in a deferred or acknowledged side-path where those helpers should stand down.

## Same-Function D17xxx Co-Access Map

The most informative same-function D17xxx companions are:

| Function family | D176FB site(s) | Other D17xxx addresses accessed in the same function |
| --- | --- | --- |
| `0x00AA14` boot/init cluster | `0x00AA46` | `D176A8`, `D176C9`, `D176CB`, `D176CE`, `D176F2`, `D176F5`, `D176F8`, `D1771A`, `D17726`, `D17779` |
| `0x00E587` producer | `0x00E726` | `D177B7` |
| `0x00F023` protocol gate / cleanup | `0x00F164`, `0x00F274`, `0x00F2F0` | `D177B7`, `D177B8`, `D177BA` |
| `0x00FBD1` connect/reset helper | `0x00FBF2` | `D1772D`, `D177B8` |
| `0x00FE14` deferred descriptor-dispatch family | `0x00FEC1` | `D177B7` |
| `0x013700` sibling helper A | `0x013753`, `0x0137B5`, `0x0137D0` | `D176F2`, `D17787`, `D1778A`, `D17792`, `D17795` |
| `0x0137E9` sibling helper B | `0x0138B6`, `0x0138D1` | `D176DD`, `D176F2`, `D17783`, `D17786`, `D17787`, `D1778A`, `D17792` |
| `0x0150C2` completion dispatcher | `0x0150E5` | `D176BD`, `D176F2`, `D176FC`, `D1772D` |
| `0x02BD52` mirrored protocol gate | `0x02BF29`, `0x02BFAA` | `D176F8`, `D17768`, `D17769`, `D177B7`, `D177B8`, `D177BA`, `D177BB` |
| `0x02C0B8` connect/reset mirror | `0x02C0D9` | `D1772D`, `D177B8` |
| `0x03CC6A` computed boolean writer | `0x03CD68` | `D177B7` |
| `0x047FB8` sequencer family | `0x048450`, `0x048590` | `D176FA`, `D17726`, `D177B8` |
| `0x049701` reset/setup helper | `0x049746` | `D1778F`, `D17792`, `D17796`, `D177B8` |
| `0x04D4EF` cleanup family | `0x04D574` | `D176F8`, `D1770A`, `D17726`, `D17731`, `D177BB` |
| `0x04DBBF` cleanup sibling | `0x04DC2C` | `D17726`, `D17731` |
| `0x04DC36` state-`0x10` cleanup family | `0x04DFB3`, `0x04E00E`, `0x04E025` | `D176A8`, `D176CB`, `D176CE`, `D176F2`, `D176F8`, `D1771A`, `D17725`, `D17726`, `D177BB` |
| `0x06449F` late cleanup family | `0x064AFE` | `D176EF`, `D17700`, `D1770A`, `D17725`, `D17726`, `D17797` |

The densest clusters are the `D176F2` / `D176F8` / `D17795` protocol state family and the `D17792` staged-argument family. That is the strongest evidence that `D176FB` is a side-flag in the same USB event-processing cluster, not an unrelated global.

## When It Is Set

The `0x01` writers fall into a few clear buckets:

- `0x00E726` and `0x03B970`
  - After clearing bit 7 in `(IY+0x10)`, these routines set `D176FB = 1`.
- `0x00F481`
  - Related syscall / acknowledgment path. Phase 410 already tied this family to notification response/completion.
- `0x00FB93`
  - Sets `D176FB = 1` when a local `(IX-3)` pointer is null.
- `0x00FEC1`
  - The deferred descriptor-dispatch path from the `0x00FE14` family sets `D176FB = 1` before classifying transfer disposition.
- `0x013753`
  - Immediate worker-A path: if `D14073 != 0` and `D176F2` is null, set `D176FB = 1` and jump into the READY-promotion continuation.
- `0x0137B5`
  - `D14078` consume path A: clear `D14078`, set `D176FB = 1`, call `0x011576`.
- `0x0137D0`
  - `D14079` consume path A: set `D176FB = 1`, clear `D14079`, then rejoin the same worker family through `0x01372B`.
- `0x0138B6`
  - `D14078` consume path B: set `D176FB = 1`, clear `D14078`, then jump into the shared `0x01381D -> 0x011576` path.
- `0x0138D1`
  - `D14079` consume path B: clear `D14079`, set `D176FB = 1`, then call `0x01106A` in the same worker family.
- `0x048590`
  - Sequencer promotion path: after a `D176F2` null-check, it sets `D176FB = 1` and seeds `D1771A = 0x00000B`.
- `0x03CD68`
  - Computed boolean writer: stores a derived `0` or `1` before continuing a `0x3030`-observing path.

## When It Is Cleared

Clear sites cluster just as strongly:

- Boot / init
  - `0x00AA46`
- Completion dispatcher
  - `0x0150E5` unconditionally clears `D176FB` on every `0x0150C2` dispatch
- Connect / reset / setup helpers
  - `0x00FBF2`, `0x02C0D9`, `0x047EEA`, `0x048450`, `0x049746`
- Protocol / transport cleanup
  - `0x00F164`, `0x00F2F0`, `0x02BCCF`, `0x02BFAA`, `0x04D574`, `0x04DC2C`, `0x064AFE`
- State-`0x10` cleanup family
  - `0x00B8B7`, `0x04DFB3`, `0x04E00E`, `0x04E025`

This gives the lifecycle:

1. A producer or deferred worker sets `D176FB = 1`.
2. Query / protocol helpers treat the flag as "do not continue normal path".
3. Completion / connect / teardown helpers clear it back to `0`.

## `0x011576`: What The Worker Actually Does

### First ~80 bytes

```text
0x011576  LD HL,0xFFFFF5
0x01157A  CALL 0x002197
0x01157E  LD (IX-2),0x00
0x011582  LD (IX-1),0xF0
0x011586  LD BC,0x000000
0x01158A  LD (IX-8),BC
0x01158D  LD HL,(0xD1776D)
0x011591  CALL 0x0021C2
0x011595  JR NZ,0x0115A1
0x011597  PUSH BC
0x011598  CALL 0x010F8C
0x01159C  POP BC
0x01159D  LD (0xD1776D),HL
0x0115A1  LD BC,(0xD1776D)
0x0115A6  LD (IX-8),BC
0x0115A9  LD HL,(IX-8)
0x0115AC  CALL 0x0021C2
0x0115B0  JP Z,0x011674
0x0115B4  LD HL,(0xD17792)
0x0115B8  CALL 0x0021C2
0x0115BC  JR Z,0x0115C8
0x0115BE  LD HL,(0xD1778F)
0x0115C2  CALL 0x0021C2
0x0115C6  JR NZ,0x0115CC
0x0115C8  CALL 0x011017
0x0115CC  LD A,0x04
```

### Role of `0x011576`

The larger function continues past the 80-byte window and does the important state promotion work:

- Writes `D17795 = 0x04`
- Clears / scrubs:
  - `D17787`
  - `D1778A`
  - `D1778B`
  - `D1778E`
  - `D1777F`
  - `D17782`
  - `D1777B`
  - `D1777E`
- Special-cases `D176F2` states `0x000003`, `0x00CCCC`, and `0x00CCCD`, and clears `D176F2` to `0` for those cases
- Compares `D17792` against `D176CB`
- Chooses the larger of the two
- Pushes that chosen 24-bit value into `0x0155BC`

So `0x011576` is best described as a READY-promotion / staged-argument validation worker in the USB/link event pipeline.

## Final Interpretation

`D176FB` is best modeled as a boolean "acknowledged / deferred follow-up armed" side-flag in the `D176F2` / `D176F8` / `D17795` USB state cluster.

The important nuance is:

- Setting `D176FB = 1` before `0x011576` does **not** change `0x011576` internally.
- Instead, it marks the surrounding infrastructure so that the four external reader families short-circuit normal query / protocol behavior until the dispatcher or teardown helpers clear the flag again.

That makes `D176FB` a software gate around the USB event-processing chain, not the main state byte itself.
