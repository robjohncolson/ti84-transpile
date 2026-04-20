# Phase 202F Reverse Walk Report

This report was built from:

- Raw ROM bytes `0x005bed..0x005c2c` in `TI-84_Plus_CE/ROM.rom`
- A fresh transpile run via `node scripts/transpile-ti84-rom.mjs`
- Grep plus streamed exit-scan of `TI-84_Plus_CE/ROM.transpiled.js`

## Decode Mode Note

The raw bytes only line up with the `0x005c2d` short-store candidate when decoded in `z80` mode. The same bytes also participate in an ADL LCD/MMIO init block, so the `z80` view below should be treated as a reverse-walk of the short-store interpretation, not proof that the ROM intended this region to execute in `z80` mode.

## Raw Reverse Walk: `0x005bed..0x005c2c` (`z80` decode)

| Address | Hex bytes | Mnemonic |
|---|---|---|
| `0x005bed` | `cb d7` | `set 2, a` |
| `0x005bef` | `ed 39 0a` | `out0 (0x0a), a` |
| `0x005bf2` | `cd ec 5a` | `call 0x005aec` |
| `0x005bf5` | `01 ed 38` | `ld bc, 0x0038ed` |
| `0x005bf8` | `07` | `rlca` |
| `0x005bf9` | `cb e7` | `set 4, a` |
| `0x005bfb` | `ed 39 07` | `out0 (0x07), a` |
| `0x005bfe` | `3a 0c 00` | `ld a, (0x00000c)` |
| `0x005c01` | `f9` | `ld sp, hl` |
| `0x005c02` | `cb b7` | `res 6, a` |
| `0x005c04` | `32 0c 00` | `ld (0x00000c), a` |
| `0x005c07` | `f9` | `ld sp, hl` |
| `0x005c08` | `cd c2 61` | `call 0x0061c2` |
| `0x005c0b` | `00` | `nop` |
| `0x005c0c` | `cd c2 61` | `call 0x0061c2` |
| `0x005c0f` | `00` | `nop` |
| `0x005c10` | `cd c2 61` | `call 0x0061c2` |
| `0x005c13` | `00` | `nop` |
| `0x005c14` | `21 2b 18` | `ld hl, 0x00182b` |
| `0x005c17` | `00` | `nop` |
| `0x005c18` | `22 00 00` | `ld (0x000000), hl` |
| `0x005c1b` | `f8` | `ret m` |
| `0x005c1c` | `21 0c 00` | `ld hl, 0x00000c` |
| `0x005c1f` | `00` | `nop` |
| `0x005c20` | `22 08 00` | `ld (0x000008), hl` |
| `0x005c23` | `f8` | `ret m` |
| `0x005c24` | `00` | `nop` |
| `0x005c25` | `21 40 00` | `ld hl, 0x000040` |
| `0x005c28` | `00` | `nop` |
| `0x005c29` | `22 08 00` | `ld (0x000008), hl` |
| `0x005c2c` | `f8` | `ret m` |

## Target-Site Decode

The short-store site itself decodes as:

| Address | Hex bytes | Mnemonic |
|---|---|---|
| `0x005c2d` | `00` | `nop` |
| `0x005c2e` | `00` | `nop` |
| `0x005c2f` | `00` | `nop` |
| `0x005c30` | `21 21 00` | `ld hl, 0x000021` |
| `0x005c33` | `00` | `nop` |
| `0x005c34` | `22 10 00` | `ld (0x000010), hl` |

The secondary candidate is structurally identical:

| Address | Hex bytes | Mnemonic |
|---|---|---|
| `0x006290` | `21 21 00` | `ld hl, 0x000021` |
| `0x006293` | `00` | `nop` |
| `0x006294` | `22 10 00` | `ld (0x000010), hl` |

## Caller Search

### Grep Spot Checks

`rg` on `0x005c2d`, `0x005c34`, `0x006294`, and `0x005c[0-3][0-9]` found:

- The block definitions for the local ADL/Z80 slices
- Two non-control-flow literal references:
  - `0x04ddb2`: `ld bc, 0x005c08`
  - `0x0ae1d6`: `ld hl, 0x005c02`

No text matches for direct `call`/`jp`/`jr` targets to `0x005c2d`, `0x005c34`, or `0x006294` were found.

### Complete Lifted Exit Scan

Streaming the `PRELIFTED_BLOCKS` exit metadata found no external `call`/`jump` edges into the target instructions. The only inbound edges in the `0x005c00-0x005c40` range are internal continuation edges:

| Target | Source block | Edge type |
|---|---|---|
| `0x005c0b` | `0x005bf5:z80` | `call-return` |
| `0x005c0c` | `0x005bf6:adl` | `call-return` |
| `0x005c0f` | `0x005c0b:z80` | `call-return` |
| `0x005c10` | `0x005c0c:adl` | `call-return` |
| `0x005c13` | `0x005c0f:z80` | `call-return` |
| `0x005c14` | `0x005c10:adl` | `call-return` |
| `0x005c1c` | `0x005c13:z80` | `fallthrough` |
| `0x005c24` | `0x005c1c:z80` | `fallthrough` |
| `0x005c2d` | `0x005c24:z80` | `fallthrough` |
| `0x005c38` | `0x005c2d:z80` | `fallthrough` |
| `0x005c40` | `0x005c38:z80` | `fallthrough` |

For the secondary candidate:

| Target | Source block | Edge type |
|---|---|---|
| `0x00628d` | `0x006284:z80` | `fallthrough` |

Exact-target summary:

- `0x005c2d`: no direct external callers; only `0x005c24:z80 -> 0x005c2d` fallthrough
- `0x005c34`: **NO CALLERS FOUND**
- `0x006294`: **NO CALLERS FOUND**

## HL Value Before The Store

Immediately before both short-store candidates, the ROM loads:

- `0x005c30`: `ld hl, 0x000021`
- `0x006290`: `ld hl, 0x000021`

So the value written by the short-store interpretation is:

- `HL = 0x000021`

No `ld hl, 0xd40000` or similar framebuffer-looking value appears in the 64-byte reverse-walk window.

## Routine Purpose Insight

The reverse-walk does **not** support the idea that this site is loading a VRAM framebuffer base into `HL`.

What the bytes suggest instead:

- The short-store interpretation writes `0x000021`, not a framebuffer address
- The surrounding bytes naturally align with an ADL LCD/MMIO init sequence:
  - `ld (0xf80000), hl`
  - `ld (0xf80008), hl`
  - `ld (0xf80010), hl`
  - `out0 (0x0a), a`
  - `out0 (0x07), a`
  - repeated `call 0x0061c2`
- The secondary candidate at `0x006294` is the same pattern duplicated later

Practical conclusion:

- If `MBASE` truly were `0xE0` at `0x005c34`, the store would still only write low 16 bits `0x0021`, which does not look like a framebuffer base
- The stronger static read is that `0x005c2d` and `0x006294` are Z80 re-decodes of an LCD register-programming region, not evidence of `HL = 0xD40000`
