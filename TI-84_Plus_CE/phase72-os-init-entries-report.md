# Phase 72: OS Init Dispatch Entry Probes

## Summary

- Boot baseline captured immediately after `0x000000` and before any manual OS init rerun.
- Boot result: 8804 steps, `halt` at `0x0019b5`.
- Boot watch state: callback=`0x015ad9`, sysFlag=`0x00`, deepInit=`0x7f`, D0058C=`0x00`.

## Per-Variant Summary

### Variant A

- Entry 0x08c331 ran 691 steps and terminated as `missing_block` at `0xffffff`.
- VRAM writes: 76800. Bounding box: `r0-239 c0-319`. Unique blocks: 160.
- Final CPU: A=0x00 HL=0xff0820 BC=0x000000 DE=0xa10c5b IX=0xd1a85d IY=0xffffff SP=0xd1a853.
- Watched RAM: callback 0x015ad9 -> 0xffffff; sysFlag 0x00 -> 0xff; deepInit 0x7f -> 0xff; d0058c 0x00 -> 0xff.

### Variant B

- Entry 0x08c366 ran 813 steps and terminated as `missing_block` at `0xffffff`.
- VRAM writes: 76800. Bounding box: `r0-239 c0-319`. Unique blocks: 175.
- Final CPU: A=0x00 HL=0xff0820 BC=0x000000 DE=0xa10c5b IX=0xd1a854 IY=0xffffff SP=0xd1a84a.
- Watched RAM: callback 0x015ad9 -> 0xffffff; sysFlag 0x00 -> 0xff; deepInit 0x7f -> 0xff; d0058c 0x00 -> 0xff.

### Variant C

- Entry 0x08c33d ran 681 steps and terminated as `missing_block` at `0xffffff`.
- VRAM writes: 76800. Bounding box: `r0-239 c0-319`. Unique blocks: 150.
- Final CPU: A=0x00 HL=0xff0820 BC=0x000000 DE=0xa10c5b IX=0xd1a854 IY=0xffffff SP=0xd1a84a.
- Watched RAM: callback 0x015ad9 -> 0xffffff; sysFlag 0x00 -> 0xff; deepInit 0x7f -> 0xff; d0058c 0x00 -> 0xff.


## Comparison Table

| Variant | Entry | Steps | Termination | Last PC | VRAM writes | BBox | Unique blocks | callback | sysFlag | deepInit | D0058C |
| --- | --- | ---: | --- | --- | ---: | --- | ---: | --- | --- | --- | --- |
| `A` | `0x08c331` | 691 | `missing_block` | `0xffffff` | 76800 | `r0-239 c0-319` | 160 | `0xffffff` | `0xff` | `0xff` | `0xff` |
| `B` | `0x08c366` | 813 | `missing_block` | `0xffffff` | 76800 | `r0-239 c0-319` | 175 | `0xffffff` | `0xff` | `0xff` | `0xff` |
| `C` | `0x08c33d` | 681 | `missing_block` | `0xffffff` | 76800 | `r0-239 c0-319` | 150 | `0xffffff` | `0xff` | `0xff` | `0xff` |

## First 15 Blocks

- A: 0x08c331, 0x05c634, 0x05c67c, 0x08c339, 0x06ce73, 0x06ce7f, 0x06ce7b, 0x06c8ab, 0x08c33d, 0x0a349a, 0x0a349f, 0x0a32f9, 0x0a3301, 0x08c308, 0x0a331e
- B: 0x08c366, 0x08c38a, 0x08c3a0, 0x05c634, 0x05c67c, 0x08c3a8, 0x0a27dd, 0x0a27e7, 0x03d1c3, 0x03d1c9, 0x0a32f9, 0x0a32ff, 0x08c308, 0x0a331e, 0x0a336f
- C: 0x08c33d, 0x0a349a, 0x0a349f, 0x0a32f9, 0x0a3301, 0x08c308, 0x0a331e, 0x0a336f, 0x0a3383, 0x0a338a, 0x0a33fb, 0x0a3408, 0x0a3404, 0x0a340f, 0x0a3392

## Rank By VRAM Writes

| Rank | Variant | Entry | VRAM writes | BBox | Unique blocks | Termination |
| ---: | --- | --- | ---: | --- | ---: | --- |
| 1 | `B` | `0x08c366` | 76800 | `r0-239 c0-319` | 175 | `missing_block` |
| 2 | `A` | `0x08c331` | 76800 | `r0-239 c0-319` | 160 | `missing_block` |
| 3 | `C` | `0x08c33d` | 76800 | `r0-239 c0-319` | 150 | `missing_block` |

## First Rendered Row Hex Dump

- Variant A: row 0, cols 0-31.

```text
ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff
```

- Variant B: row 0, cols 0-31.

```text
ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff
```

- Variant C: row 0, cols 0-31.

```text
ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff
```


## Verdict

- Baseline A (0x08c331) produced 76800 VRAM writes and 160 unique blocks.
- Neither Variant B nor Variant C unlocked rendering beyond Variant A.
- Browser-shell button recommendation: btnP72_A -> showScreen(0x08c331, 'adl', 'P72 A 08c331', 200000); btnP72_B -> showScreen(0x08c366, 'adl', 'P72 B 08c366', 200000); btnP72_C -> showScreen(0x08c33d, 'adl', 'P72 C 08c33d', 200000).
