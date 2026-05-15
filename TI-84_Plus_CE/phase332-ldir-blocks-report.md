# Phase 332: LDIR Source Blocks at `0x05550C` and `0x055519`

## Raw blocks

| Mode | ROM range | 13 bytes |
| --- | --- | --- |
| 16bpp | `0x05550C..0x055518` | `40 01 00 F0 00 00 10 80 02 00 00 00 D4` |
| 8bpp | `0x055519..0x055525` | `40 01 00 F0 00 00 08 40 01 00 00 2C D5` |

## Decoded field map

The copied RAM region `D02FD9..D02FE5` is a 5-field descriptor, not 13 unrelated bytes:

| Offset(s) | RAM | 16bpp | 8bpp | Meaning | Evidence |
| --- | --- | --- | --- | --- | --- |
| `+0..+2` | `D02FD9..D02FDB` | `0x000140` = `320` | `0x000140` = `320` | display width | Blocks such as `0x055086`, `0x052B49`, `0x053BDF`, and `0x0555AF` subtract this from candidate X values and reject out-of-range writes. |
| `+3..+5` | `D02FDC..D02FDE` | `0x0000F0` = `240` | `0x0000F0` = `240` | display height | Blocks such as `0x052FF4`, `0x0542BB`, `0x0548E2`, and `0x0556E3` compare or subtract this against Y or row counters. |
| `+6` | `D02FDF` | `0x10` | `0x08` | mode / bpp byte | `0x05569E` does `LD A,(D02FDF)` then `CP 0x08`; the `== 0x08` path seeds one byte before `LDIR`, the other path seeds two bytes. |
| `+7..+9` | `D02FE0..D02FE2` | `0x000280` = `640` | `0x000140` = `320` | row stride in bytes | Blocks such as `0x054E7A`, `0x05501F`, `0x0556D4`, and `0x0556EA` feed this into row-offset math helpers. |
| `+10..+12` | `D02FE3..D02FE5` | `0xD40000` | `0xD52C00` | VRAM base | Blocks such as `0x055033`, `0x054C24`, `0x053D18`, and `0x0556DC` add this after byte offsets are computed. |

## Byte-level annotation

- `+0 = 0x40`, `+1 = 0x01`, `+2 = 0x00`: width little-endian bytes.
- `+3 = 0xF0`, `+4 = 0x00`, `+5 = 0x00`: height little-endian bytes.
- `+6 = 0x10` or `0x08`: bpp discriminator.
- `+7..+9`: stride little-endian bytes.
- `+10..+12`: VRAM base little-endian bytes.

There are no standalone reader sites for `D02FDA/B`, `D02FDD/E`, `D02FE1/2`, or `D02FE4/5`. Those bytes are only consumed as part of 24-bit field loads from `D02FD9`, `D02FDC`, `D02FE0`, and `D02FE3`.

## Field-by-field diff

- Width: unchanged at `320`.
- Height: unchanged at `240`.
- Mode byte: changes from `0x10` to `0x08`.
- Stride: changes from `640` to `320`.
- VRAM base: changes from `0xD40000` to `0xD52C00`.

Only the mode byte, stride, and base address change between the two records. The descriptor is therefore "same panel geometry, different pixel packing and framebuffer bank."

## Scaling record comparison

The 48 bytes at `0x05320F` are not the same structure.

They decode as four 12-byte records:

- Record 0: `[0x053182, 0x053182, 0x053182, 0x053182]`
- Record 1: `[0x053183, 0x053188, 0x053191, 0x053196]`
- Record 2: `[0x05319F, 0x0531A8, 0x0531B5, 0x0531BE]`
- Record 3: `[0x0531CB, 0x0531D8, 0x0531ED, 0x0531FA]`

Session 331 already mapped those four fields as:

- horizontal width kernel pointer
- vertical height kernel pointer
- horizontal repeat kernel pointer
- vertical repeat kernel pointer

So the scaling table is a font-scaler pointer table, not an LCD geometry descriptor. The only similarity is that both formats use 24-bit chunks.

## Conclusion

`0x05550C` and `0x055519` are alternate LCD/VRAM descriptor blobs copied into `D02FD9..D02FE5`.

- `0x05550C` = 16bpp: `320x240`, mode `0x10`, stride `640`, base `0xD40000`
- `0x055519` = 8bpp: `320x240`, mode `0x08`, stride `320`, base `0xD52C00`

The lifted JS reader behavior supports the field map directly, especially the `D02FDF == 0x08` branch at `0x05569E`, which makes the mode byte an observed bpp discriminator rather than a guess.
