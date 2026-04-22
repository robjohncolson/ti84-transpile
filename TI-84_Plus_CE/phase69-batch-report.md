# Phase 69: Batch Probes For Untested 0x0a1cac (= PutS) Callers

## Summary

- Probed 25 distinct containing-function entries harvested from the Phase 63 caller inventory.
- Legible threshold: `vramWrites > 200` and `bbox area > 400`.
- Legible results: 8.
- New legible results not already wired in the current browser shell: 5.

## Per-Entry Results

| Rank | Caller PC | Function entry | Heuristic | Steps | Termination | VRAM writes | BBox | Area | Unique blocks | Verdict |
| ---: | --- | --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- |
| 1 | `0x046878` | `0x046878` | `caller` | 5000 | `max_steps` | 12800 | `r179-218 c0-319` | 12800 | 8 | `legible_new` |
| 2 | `0x03dc1b` | `0x03dc1b` | `caller` | 3093 | `missing_block` | 5440 | `r0-16 c0-319` | 5440 | 94 | `legible_new` |
| 3 | `0x05cf76` | `0x05cf6d` | `after_ret` | 5000 | `max_steps` | 1401 | `r37-54 c0-85` | 1548 | 59 | `legible_known` |
| 4 | `0x05cec6` | `0x05cea3` | `after_ret` | 5000 | `max_steps` | 1399 | `r37-54 c0-85` | 1548 | 64 | `legible_known` |
| 5 | `0x04e21f` | `0x04e1d0` | `after_ret` | 5000 | `max_steps` | 1378 | `r37-54 c0-85` | 1548 | 74 | `legible_known` |
| 6 | `0x03ec07` | `0x03ebed` | `after_ret` | 5000 | `max_steps` | 1368 | `r18-54 c0-181` | 6734 | 118 | `legible_new` |
| 7 | `0x03f357` | `0x03f338` | `after_ret` | 5000 | `max_steps` | 1368 | `r37-54 c0-85` | 1548 | 95 | `legible_new` |
| 8 | `0x06db0d` | `0x06daaf` | `after_ret` | 4910 | `missing_block` | 468 | `r137-154 c0-25` | 468 | 183 | `legible_new` |
| 9 | `0x03e182` | `0x03e17e` | `after_ret` | 823 | `missing_block` | 252 | `r18-35 c180-193` | 252 | 68 | `partial` |
| 10 | `0x046126` | `0x046126` | `caller` | 5000 | `max_steps` | 0 | `none` | 0 | 105 | `blank` |
| 11 | `0x06b648` | `0x06b584` | `after_ret` | 95 | `missing_block` | 0 | `none` | 0 | 75 | `missing_block` |
| 12 | `0x074cfb` | `0x074cfb` | `caller` | 202 | `missing_block` | 0 | `none` | 0 | 67 | `missing_block` |
| 13 | `0x02fc87` | `0x02fc10` | `after_ret` | 5000 | `max_steps` | 0 | `none` | 0 | 66 | `blank` |
| 14 | `0x0455c6` | `0x0455c6` | `caller` | 89 | `missing_block` | 0 | `none` | 0 | 63 | `missing_block` |
| 15 | `0x024528` | `0x024528` | `caller` | 5000 | `max_steps` | 0 | `none` | 0 | 60 | `blank` |
| 16 | `0x0458bf` | `0x0458a3` | `after_ret` | 5000 | `max_steps` | 0 | `none` | 0 | 49 | `blank` |
| 17 | `0x086c05` | `0x086bd7` | `after_ret` | 5000 | `max_steps` | 0 | `none` | 0 | 24 | `blank` |
| 18 | `0x045f3e` | `0x045f3e` | `caller` | 5000 | `max_steps` | 0 | `none` | 0 | 23 | `blank` |
| 19 | `0x04552f` | `0x04546a` | `after_ret` | 5000 | `max_steps` | 0 | `none` | 0 | 21 | `blank` |
| 20 | `0x08912f` | `0x0890ce` | `after_ret` | 5000 | `max_steps` | 0 | `none` | 0 | 16 | `blank` |
| 21 | `0x05e76e` | `0x05e738` | `after_ret` | 7 | `missing_block` | 0 | `none` | 0 | 6 | `missing_block` |
| 22 | `0x061f99` | `0x061f6d` | `after_ret` | 3 | `missing_block` | 0 | `none` | 0 | 3 | `missing_block` |
| 23 | `0x046319` | `0x04622b` | `after_ret` | 0 | `missing_block` | 0 | `none` | 0 | 0 | `missing_block` |
| 24 | `0x06b46d` | `0x06b406` | `after_ret` | 0 | `missing_block` | 0 | `none` | 0 | 0 | `missing_block` |
| 25 | `0x074bf1` | `0x074b5c` | `after_ret` | 0 | `missing_block` | 0 | `none` | 0 | 0 | `missing_block` |

## Top 10 Rankers

- caller=0x046878 function=0x046878 vram=12800 bbox=r179-218 c0-319 area=12800 first10=0x04687c, 0x046898, 0x04689c, 0x0468b4, 0x0468b8, 0x0468b1, 0x04690b, 0x046921
- caller=0x03dc1b function=0x03dc1b vram=5440 bbox=r0-16 c0-319 area=5440 first10=0x03dc1f, 0x03e41f, 0x0005f4, 0x0158b1, 0x03e423, 0x03e424, 0x0499b1, 0x03e428, 0x03e1e6, 0x03e431
- caller=0x05cf76 function=0x05cf6d vram=1401 bbox=r37-54 c0-85 area=1548 first10=0x05cf6d, 0x0a1cac (= PutS), 0x0a1cb9, 0x0a1b5b (= PutC), 0x0a1b77, 0x0a1799 (= PutMap), 0x0a17aa, 0x0a237e (= GetCurloc), 0x0a2a37, 0x0a2389
- caller=0x05cec6 function=0x05cea3 vram=1399 bbox=r37-54 c0-85 area=1548 first10=0x05cea3, 0x0a27dd (= RunIndicOn), 0x0a27fe, 0x0a1a36, 0x05cea7, 0x05cf6d, 0x0a1cac (= PutS), 0x0a1cb9, 0x0a1b5b (= PutC), 0x0a1b77
- caller=0x04e21f function=0x04e1d0 vram=1378 bbox=r37-54 c0-85 area=1548 first10=0x04e1d0, 0x04e1fb, 0x02398e (= CallLocalizeHook), 0x025758, 0x02399a, 0x02399f, 0x04e20d, 0x023380, 0x000578, 0x0158a6
- caller=0x03ec07 function=0x03ebed vram=1368 bbox=r18-54 c0-181 area=6734 first10=0x03ebed, 0x042366, 0x0421a7, 0x000310, 0x001c55, 0x001c33, 0x001c38, 0x001c44, 0x001c7d, 0x001ca6
- caller=0x03f357 function=0x03f338 vram=1368 bbox=r37-54 c0-85 area=1548 first10=0x03f338, 0x03f34a, 0x0a22b1 (= EraseEOL), 0x0a22b8, 0x025c33, 0x025c48, 0x04c979, 0x025c59, 0x025c6c, 0x025c79
- caller=0x06db0d function=0x06daaf vram=468 bbox=r137-154 c0-25 area=468 first10=0x06daaf, 0x06db16, 0x06db21, 0x06dab7, 0x06da6e, 0x0a2e05, 0x06da72, 0x06da94, 0x0800a0 (= CheckSplitFlag), 0x0800a6
- caller=0x03e182 function=0x03e17e vram=252 bbox=r18-35 c180-193 area=252 first10=0x03e17e, 0x080244, 0x02398e (= CallLocalizeHook), 0x025758, 0x02399a, 0x02399f, 0x08024c, 0x03e182, 0x0a1cac (= PutS), 0x0a1cb9
- caller=0x046126 function=0x046126 vram=0 bbox=none area=0 first10=0x04612a, 0x046b28, 0x02fcb3 (= GetKey), 0x02fcc2, 0x02fd8f, 0x02fda1, 0x02390a, 0x0238c5, 0x023913, 0x023915

## Legible Screens

- caller=0x046878 function=0x046878 writes=12800 bbox=r179-218 c0-319 area=12800
- caller=0x03dc1b function=0x03dc1b writes=5440 bbox=r0-16 c0-319 area=5440
- caller=0x03ec07 function=0x03ebed writes=1368 bbox=r18-54 c0-181 area=6734
- caller=0x03f357 function=0x03f338 writes=1368 bbox=r37-54 c0-85 area=1548
- caller=0x06db0d function=0x06daaf writes=468 bbox=r137-154 c0-25 area=468

## Recommended Browser-Shell Wiring

- btnP69_046878: label="P69 046878", showScreen(0x046878, 'adl', 'P69 046878', 200000)
- btnP69_03dc1b: label="P69 03dc1b", showScreen(0x03dc1b, 'adl', 'P69 03dc1b', 200000)
- btnP69_03ebed: label="P69 03ebed", showScreen(0x03ebed, 'adl', 'P69 03ebed', 200000)
- btnP69_03f338: label="P69 03f338", showScreen(0x03f338, 'adl', 'P69 03f338', 200000)
- btnP69_06daaf: label="P69 06daaf", showScreen(0x06daaf, 'adl', 'P69 06daaf', 200000)
