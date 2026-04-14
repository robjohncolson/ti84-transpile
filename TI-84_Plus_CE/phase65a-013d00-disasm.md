# Phase 65A: Static Disassembly of `0x013d00`

## 1. Disassembly of First Reachable Blocks

Traversal method: BFS from `013d00:adl`, following lifted `branch` / `fallthrough` / `call` / `call-return` exits in exit-list order. The walk stopped after reaching the known character-print entry `0x0059c6`, so only 4 blocks were visited.

Traversal order:

```text
0x013d00:adl -> 0x005ba6:adl -> 0x013d11:adl -> 0x0059c6:adl
```

### Block 1: `0x013d00:adl`

- Reached from: entry
- Instructions:
  - `0x013d00  ld a, i`
  - `0x013d02  push af`
  - `0x013d03  di`
  - `0x013d04  push iy`
  - `0x013d06  push ix`
  - `0x013d08  ld iy, 0xd00080`
  - `0x013d0d  call 0x005ba6`
- Exit edges:
  - `call -> 0x005ba6:adl`
  - `call-return -> 0x013d11:adl`

### Block 2: `0x005ba6:adl`

- Reached from: `0x013d00` via `call`
- Instructions:
  - `0x005ba6  push hl`
  - `0x005ba7  ld hl, 0x000000`
  - `0x005bab  ld (0xd00595), hl`
  - `0x005baf  pop hl`
  - `0x005bb0  ret`
- Exit edges:
  - `return`

### Block 3: `0x013d11:adl`

- Reached from: `0x013d00` via `call-return`
- Instructions:
  - `0x013d11  res 3, (iy+5)`
  - `0x013d15  ld a, 0x20`
  - `0x013d17  ld b, 0x0e`
  - `0x013d19  call 0x0059c6`
- Exit edges:
  - `call -> 0x0059c6:adl`
  - `call-return -> 0x013d1d:adl`

### Block 4: `0x0059c6:adl`

- Reached from: `0x013d11` via `call`
- Instructions:
  - `0x0059c6  push af`
  - `0x0059c7  push hl`
  - `0x0059c8  cp 0xd6`
  - `0x0059ca  jr nz, 0x0059d6`
- Exit edges:
  - `branch nz -> 0x0059d6:adl`
  - `fallthrough -> 0x0059cc:adl`

Stop condition hit here: `0x0059c6` is the known char-print entry.

## 2. Nearby ROM Strings and Immediates

### Literal immediates seen in the BFS-visited blocks

| PC | Instruction | Interpretation | ASCII dump |
| --- | --- | --- | --- |
| `0x005ba7` | `ld hl, 0x000000` | ROM pointer, but not a human string | `..~[.X.\"` |
| `0x013d15` | `ld a, 0x20` | printable character literal | `' '` |

### Additional nearby literal loads in the same `0x013dxx` screen family

These are not in the first 4 BFS blocks because the walk intentionally stopped at `0x0059c6`, but they are the strongest nearby string clues.

| PC | Instruction | ASCII dump |
| --- | --- | --- |
| `0x013d23` | `ld hl, 0x013d3b` | ` Validating OS...` |
| `0x013da7` | `ld hl, 0x013dbf` | `Waiting...               ` |

### Printable ASCII clusters in `0x013b00` to `0x013f00`

| Address | Raw printable cluster | Notes |
| --- | --- | --- |
| `0x013d3a` | `L Validating OS...` | The leading `L` is the `jr` displacement byte from `0x013d39`; the actual string start used by code is `0x013d3b`. |
| `0x013d4f` | ` Calculator will restart` | Looks like the next line of the same validation family. |
| `0x013d68` | ` when validation is` | Continuation text. |
| `0x013d7c` | ` complete.` | Completes the sentence: "Calculator will restart when validation is complete." |
| `0x013dbe` | `]Waiting...               ` | The leading `]` is almost certainly a preceding code byte; code later uses `0x013dbf`. |
| `0x013ddb` | `The OS is invalid, please` | Strong invalid-OS warning text. |
| `0x013df5` | `load the latest OS at` | Warning continuation. |
| `0x013e0b` | `education.ti.com` | Download/recovery URL. |
| `0x013e43` | `q#p*&w` | Probably a false-positive printable run inside code bytes, not a real string. |

Taken together, the nearby string pool reads like a boot-time OS validation / invalid-OS warning screen family:

```text
 Validating OS...
 Calculator will restart
 when validation is
 complete.

Waiting...

The OS is invalid, please
load the latest OS at
education.ti.com
```

## 3. Caller Scan of `0x013d00`

Scan method:

- lifted scan: all `PRELIFTED_BLOCKS` instructions with `instruction.target === 0x013d00`
- raw scan: literal direct opcodes `0xCD` / `0xC3` / `0xCA` / ... followed by little-endian target bytes `00 3D 01`
- function-entry attribution: Phase 60 `findFunctionEntry()` backward scan
- jump-table check: `0x020104 + slot * 4`

### Raw findings

- Raw direct callers found: `0x000721`, `0x013e35`
- All raw opcode hits were `0xCD` (`call`)
- No raw `jp` / conditional-`jp` rows target `0x013d00`

### Lifted findings

- Unique lifted caller PCs found: `0x000721`, `0x013e35`
- `0x013e35` appears in two overlapping lifted blocks (`0x013e2c` and `0x013e2f`), but it is one real caller PC

### Merged direct-caller table

| Caller PC | Kind | Source(s) | Containing function entry | Jump-table row? | Notes |
| --- | --- | --- | --- | --- | --- |
| `0x000721` | `call` | lifted + raw | `0x000721` | no | Early boot/startup path. Raw backscan found no preceding `ret` in the scan window, so the entry falls back to the caller itself. |
| `0x013e35` | `call` | lifted + raw | `0x013e23` | no | Raw backscan finds the preceding `ret` at `0x013e22`, so the containing function entry is `0x013e23`. |

### Immediate caller context

- `0x000721`
  - lifted block body: `call 0x013d00`
  - immediate neighborhood:
    - previous block `0x000719`: `jp nz, 0x0019be`
    - next block `0x000725`: `ld hl, 0x000000 ; call 0x0158a6`
  - This looks like boot/setup logic, not a UI jump-table dispatch.

- `0x013e35`
  - containing function `0x013e23` starts with:
    - `xor a`
    - `ld (0xd176c9), a`
    - `call 0x015151`
  - then:
    - `0x013e2c  ld hl, 0xd17726`
    - `0x013e30  ld (hl), 0x00`
    - `0x013e32  inc hl`
    - `0x013e33  ld (hl), 0x00`
    - `0x013e35  call 0x013d00`
  - This caller is also a dedicated validation/recovery flow, not a menu dispatcher.

### Jump-table result

No direct caller lies in the jump-table region rooted at `0x020104`. No `0x020104 + slot * 4` row points directly at `0x013d00`.

## 4. Hypothesis

`0x013d00` is most likely **something else**: a **boot-time OS validation status renderer**, specifically the routine that draws the `" Validating OS..."` phase of the validation / recovery screen family.

Why this is the best fit:

- The function shape is a dedicated text-screen stub:
  - save registers / `di`
  - set `IY = 0xd00080`
  - call `0x005ba6` to reset cursor/state
  - load `A = 0x20` and call the known char printer `0x0059c6`
- The immediate continuation right after the stopped BFS path uses:
  - `ld de, 0x000004`
  - `ld hl, 0x013d3b`
  - `ld b, 0x05`
  - `call 0x0059e9`
  - which is exactly the shape of a string-render loop seeded with the `" Validating OS..."` literal.
- The adjacent string pool is overwhelmingly specific:
  - `Validating OS...`
  - `Calculator will restart when validation is complete.`
  - `Waiting...`
  - `The OS is invalid, please load the latest OS at education.ti.com`
- The direct callers reinforce a boot/recovery role:
  - one caller is in early boot code (`0x000721`)
  - the other is a sibling validation/recovery function (`0x013e23`)
  - there are no menu jump-table callers

So the strongest label is:

```text
Not Home / Program Editor / Catalog / About.
Best match: boot-time OS validation / invalid-OS warning screen family.
Specific role of 0x013d00: render the "Validating OS..." status screen.
```
