# Phase 62: 0x0059c6 Caller Probe

## Summary

- Probed 10 caller anchors from the Phase 60 0x0059c6 family.
- Each caller was run twice: `baseline` and `HL=0`.
- 14 probe variant(s) wrote to VRAM.
- 6 probe variant(s) used the caller PC directly because `findFunctionEntry()` fell back to the supplied address.

## Per-Caller Results

| Caller PC | Variant | Function Entry | Steps | Termination | VRAM writes | BBox | Unique blocks | Verdict | Highlight |
| --- | --- | --- | ---: | --- | ---: | --- | ---: | --- | --- |
| **`0x0015c7`** | `baseline` | `0x0015c7` | 5000 | `max_steps` | 9265 | `r37-92 c0-313` | 97 | `renders something` | `render, deep` |
| **`0x0015c7`** | `HL=0` | `0x0015c7` | 5000 | `max_steps` | 9265 | `r37-92 c0-313` | 97 | `renders something` | `render, deep` |
| **`0x0015e1`** | `baseline` | `0x0015e1` | 5000 | `max_steps` | 10976 | `r37-92 c2-313` | 80 | `renders something` | `render, deep` |
| **`0x0015e1`** | `HL=0` | `0x0015e1` | 5000 | `max_steps` | 10976 | `r37-92 c2-313` | 80 | `renders something` | `render, deep` |
| **`0x0017dd`** | `baseline` | `0x0017d9` | 103 | `missing_block` | 224 | `r37-52 c0-13` | 28 | `renders something` | `render, deep` |
| **`0x0017dd`** | `HL=0` | `0x0017d9` | 103 | `missing_block` | 224 | `r37-52 c0-13` | 28 | `renders something` | `render, deep` |
| **`0x0059f3`** | `baseline` | `0x0059e9` | 105 | `missing_block` | 224 | `r18-33 c180-193` | 31 | `renders something` | `render, deep` |
| **`0x0059f3`** | `HL=0` | `0x0059e9` | 105 | `missing_block` | 224 | `r18-33 c180-193` | 31 | `renders something` | `render, deep` |
| `0x005a35` | `baseline` | `0x005a20` | 3 | `missing_block` | 0 | `none` | 3 | `noop` | `-` |
| `0x005a35` | `HL=0` | `0x005a20` | 3 | `missing_block` | 0 | `none` | 3 | `noop` | `-` |
| **`0x00ee88`** | `baseline` | `0x00ee1b` | 109 | `halt` | 0 | `none` | 102 | `noop` | `deep` |
| **`0x00ee88`** | `HL=0` | `0x00ee1b` | 109 | `halt` | 0 | `none` | 102 | `noop` | `deep` |
| **`0x012f56`** | `baseline` | `0x012f56` | 105 | `halt` | 192 | `r37-52 c146-157` | 46 | `renders something` | `render, deep` |
| **`0x012f56`** | `HL=0` | `0x012f56` | 105 | `halt` | 192 | `r37-52 c146-157` | 46 | `renders something` | `render, deep` |
| **`0x013d11`** | `baseline` | `0x013d00` | 5000 | `max_steps` | 11004 | `r37-192 c2-289` | 39 | `renders something` | `render, deep` |
| **`0x013d11`** | `HL=0` | `0x013d00` | 5000 | `max_steps` | 11004 | `r37-192 c2-289` | 39 | `renders something` | `render, deep` |
| **`0x015864`** | `baseline` | `0x015856` | 103 | `missing_block` | 224 | `r37-52 c0-13` | 29 | `renders something` | `render, deep` |
| **`0x015864`** | `HL=0` | `0x015856` | 103 | `missing_block` | 224 | `r37-52 c0-13` | 29 | `renders something` | `render, deep` |
| `0x0158fa` | `baseline` | `0x0158fa` | 0 | `missing_block` | 0 | `none` | 0 | `noop` | `-` |
| `0x0158fa` | `HL=0` | `0x0158fa` | 0 | `missing_block` | 0 | `none` | 0 | `noop` | `-` |

## First 10 Executed Blocks

| Caller PC | Variant | First 10 blocks |
| --- | --- | --- |
| `0x0015c7` | `baseline` | `0x0015c7, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717, 0x001718` |
| `0x0015c7` | `HL=0` | `0x0015c7, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717, 0x001718` |
| `0x0015e1` | `baseline` | `0x0015e1, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717, 0x001718` |
| `0x0015e1` | `HL=0` | `0x0015e1, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717, 0x001718` |
| `0x0017dd` | `baseline` | `0x0017dd, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717, 0x001718` |
| `0x0017dd` | `HL=0` | `0x0017dd, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717, 0x001718` |
| `0x0059f3` | `baseline` | `0x0059e9, 0x0059f3, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717` |
| `0x0059f3` | `HL=0` | `0x0059e9, 0x0059f3, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717` |
| `0x005a35` | `baseline` | `0x005a20, 0x005a3f, 0x005a1b` |
| `0x005a35` | `HL=0` | `0x005a20, 0x005a3f, 0x005a1b` |
| `0x00ee88` | `baseline` | `0x00ee1c, 0x002197, 0x00ee24, 0x00ee42, 0x00ee4a, 0x00ee81, 0x00eeb1, 0x00eeb9, 0x00eec1, 0x00ef10` |
| `0x00ee88` | `HL=0` | `0x00ee1c, 0x002197, 0x00ee24, 0x00ee42, 0x00ee4a, 0x00ee81, 0x00eeb1, 0x00eeb9, 0x00eec1, 0x00ef10` |
| `0x012f56` | `baseline` | `0x012f56, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717, 0x001718` |
| `0x012f56` | `HL=0` | `0x012f56, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717, 0x001718` |
| `0x013d11` | `baseline` | `0x013d00, 0x005ba6, 0x013d11, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb` |
| `0x013d11` | `HL=0` | `0x013d00, 0x005ba6, 0x013d11, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb` |
| `0x015864` | `baseline` | `0x015856, 0x015864, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717` |
| `0x015864` | `HL=0` | `0x015856, 0x015864, 0x0059c6, 0x0059d6, 0x005a75, 0x005a82, 0x00596e, 0x001713, 0x0008bb, 0x001717` |
| `0x0158fa` | `baseline` | `none` |
| `0x0158fa` | `HL=0` | `none` |

## Most Render-Adjacent Ranking

| Rank | Caller PC | Best variant | Function entry | Why it ranks here |
| ---: | --- | --- | --- | --- |
| 1 | `0x013d11` | `baseline` | `0x013d00` | 11004 VRAM writes; 39 unique blocks; term=max_steps |
| 2 | `0x0015e1` | `baseline` | `0x0015e1` | 10976 VRAM writes; 80 unique blocks; term=max_steps |
| 3 | `0x0015c7` | `baseline` | `0x0015c7` | 9265 VRAM writes; 97 unique blocks; term=max_steps |
| 4 | `0x0059f3` | `baseline` | `0x0059e9` | 224 VRAM writes; 31 unique blocks; term=missing_block |
| 5 | `0x015864` | `baseline` | `0x015856` | 224 VRAM writes; 29 unique blocks; term=missing_block |
| 6 | `0x0017dd` | `baseline` | `0x0017d9` | 224 VRAM writes; 28 unique blocks; term=missing_block |
| 7 | `0x012f56` | `baseline` | `0x012f56` | 192 VRAM writes; 46 unique blocks; term=halt |
| 8 | `0x00ee88` | `baseline` | `0x00ee1b` | no VRAM writes; 102 unique blocks; term=halt |
| 9 | `0x005a35` | `baseline` | `0x005a20` | no VRAM writes; 3 unique blocks; term=missing_block |
| 10 | `0x0158fa` | `baseline` | `0x0158fa` | no VRAM writes; 0 unique blocks; term=missing_block |

## Notes

- 14 probe variant(s) produced VRAM writes: 0x0015c7 baseline, 0x0015c7 HL=0, 0x0015e1 baseline, 0x0015e1 HL=0, 0x0017dd baseline, 0x0017dd HL=0, 0x0059f3 baseline, 0x0059f3 HL=0, 0x012f56 baseline, 0x012f56 HL=0, 0x013d11 baseline, 0x013d11 HL=0, 0x015864 baseline, 0x015864 HL=0.
- 16 probe variant(s) crossed the deep-execution bar: 0x0015c7 baseline (97), 0x0015c7 HL=0 (97), 0x0015e1 baseline (80), 0x0015e1 HL=0 (80), 0x0017dd baseline (28), 0x0017dd HL=0 (28), 0x0059f3 baseline (31), 0x0059f3 HL=0 (31), 0x00ee88 baseline (102), 0x00ee88 HL=0 (102), 0x012f56 baseline (46), 0x012f56 HL=0 (46), 0x013d11 baseline (39), 0x013d11 HL=0 (39), 0x015864 baseline (29), 0x015864 HL=0 (29).
- The near-event-loop 0x0015xx trio is 0x0015c7 -> baseline, vram=9265, blocks=97, term=max_steps; 0x0015e1 -> baseline, vram=10976, blocks=80, term=max_steps; 0x0017dd -> baseline, vram=224, blocks=28, term=missing_block.
- HL=0 seeding made no observable difference for any caller.
- Most render-adjacent overall: 0x013d11 via baseline (vram=11004, blocks=39, term=max_steps).

## First Rendered VRAM Row Hex Dumps

These are the first rendered rows (`bbox.minRow`) for any probe that wrote pixels.

- 0x0015c7 baseline entry=0x0015c7 row=37 cols=0-31

```text
0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000
```

- 0x0015e1 baseline entry=0x0015e1 row=37 cols=2-33

```text
ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff
```

- 0x0017dd baseline entry=0x0017d9 row=37 cols=0-31

```text
0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa
```

- 0x0059f3 baseline entry=0x0059e9 row=18 cols=180-211

```text
0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa
```

- 0x012f56 baseline entry=0x012f56 row=37 cols=146-177

```text
ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa
```

- 0x013d11 baseline entry=0x013d00 row=37 cols=2-33

```text
ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff
```

- 0x015864 baseline entry=0x015856 row=37 cols=0-31

```text
0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa
```

