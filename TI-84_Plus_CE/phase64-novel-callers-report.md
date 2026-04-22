# Phase 64: Novel 0x0a1cac (= PutS) Caller Probes

## Summary

- Probed 7 high-value caller families from the Phase 63 0x0a1cac (= PutS) inventory.
- Captured 21 total probe variants across direct anchors, RET backscans, lifted containing blocks, and immediate preludes.
- 15 probe variant(s) wrote to VRAM.
- 7 family best-result(s) crossed the Phase 64 browser-shell button threshold (`vramWrites > 200`).

## Per-Entry Results

| Name | Variant | Entry | Steps | Termination | VRAM writes | BBox | Unique blocks | Verdict |
| --- | --- | --- | ---: | --- | ---: | --- | ---: | --- |
| `flash_test` | `backscan` | `0x04622b` | 0 | `missing_block` | 0 | `none` | 0 | `missing_block` |
| `flash_test` | `lifted_block` | `0x046256` | 5000 | `max_steps` | 1382 | `r37-54 c0-85` | 65 | `legible` |
| `flash_test` | `anchor` | `0x046272` | 5000 | `max_steps` | 2196 | `r97-114 c48-169` | 244 | `legible` |
| `keyboard_test` | `backscan` | `0x046141` | 0 | `missing_block` | 0 | `none` | 0 | `missing_block` |
| `keyboard_test` | `lifted_block` | `0x04616c` | 5000 | `max_steps` | 1351 | `r37-54 c0-85` | 65 | `legible` |
| `keyboard_test` | `anchor` | `0x046188` | 5000 | `max_steps` | 1116 | `r97-114 c60-121` | 91 | `legible` |
| `mode_screen` | `prelude_call-return` | `0x08bc80` | 836 | `missing_block` | 252 | `r18-35 c180-193` | 75 | `legible` |
| `mode_screen` | `anchor` | `0x08bc88` | 822 | `missing_block` | 252 | `r18-35 c180-193` | 67 | `legible` |
| `os_compat` | `backscan` | `0x0ba9db` | 20 | `missing_block` | 0 | `none` | 20 | `missing_block` |
| `os_compat` | `prelude_call-return` | `0x0baa15` | 5000 | `max_steps` | 1365 | `r197-214 c0-85` | 66 | `legible` |
| `os_compat` | `anchor` | `0x0baa1f` | 3351 | `missing_block` | 900 | `r197-214 c0-49` | 104 | `legible` |
| `self_test_hub` | `prelude_call-return` | `0x046977` | 4129 | `missing_block` | 1152 | `r33-70 c0-297` | 78 | `legible` |
| `self_test_hub` | `backscan` | `0x04697b` | 4937 | `missing_block` | 1332 | `r37-54 c0-73` | 67 | `legible` |
| `self_test_hub` | `anchor` | `0x04697c` | 4936 | `missing_block` | 1332 | `r37-54 c0-73` | 67 | `legible` |
| `solver_prompt` | `backscan` | `0x06af7e` | 5000 | `max_steps` | 0 | `none` | 44 | `blank` |
| `solver_prompt` | `prelude_call-return` | `0x06aff6` | 5000 | `max_steps` | 1404 | `r18-74 c0-193` | 74 | `legible` |
| `solver_prompt` | `prelude_call-return` | `0x06affe` | 5000 | `max_steps` | 1413 | `r18-74 c0-193` | 74 | `legible` |
| `solver_prompt` | `anchor` | `0x06b004` | 5000 | `max_steps` | 1412 | `r18-74 c0-193` | 75 | `legible` |
| `test_halt` | `backscan` | `0x0461fe` | 0 | `missing_block` | 0 | `none` | 0 | `missing_block` |
| `test_halt` | `lifted_block` | `0x046216` | 5000 | `max_steps` | 1356 | `r97-114 c12-97` | 65 | `legible` |
| `test_halt` | `anchor` | `0x046222` | 38 | `missing_block` | 0 | `none` | 37 | `missing_block` |

## Largest VRAM Renders

| Rank | Name | Best variant | Entry | VRAM writes | BBox | Unique blocks | Termination |
| ---: | --- | --- | --- | ---: | --- | ---: | --- |
| 1 | `flash_test` | `anchor` | `0x046272` | 2196 | `r97-114 c48-169` | 244 | `max_steps` |
| 2 | `solver_prompt` | `prelude_call-return` | `0x06affe` | 1413 | `r18-74 c0-193` | 74 | `max_steps` |
| 3 | `os_compat` | `prelude_call-return` | `0x0baa15` | 1365 | `r197-214 c0-85` | 66 | `max_steps` |
| 4 | `test_halt` | `lifted_block` | `0x046216` | 1356 | `r97-114 c12-97` | 65 | `max_steps` |
| 5 | `keyboard_test` | `lifted_block` | `0x04616c` | 1351 | `r37-54 c0-85` | 65 | `max_steps` |
| 6 | `self_test_hub` | `backscan` | `0x04697b` | 1332 | `r37-54 c0-73` | 67 | `missing_block` |
| 7 | `mode_screen` | `prelude_call-return` | `0x08bc80` | 252 | `r18-35 c180-193` | 75 | `missing_block` |

## First 10 Blocks For Top 3 Rankers

- flash_test anchor entry=0x046272: 0x046276, 0x046d18, 0x046d25, 0x046d34, 0x046d37, 0x03d202, 0x04c980, 0x04c986, 0x03d21a, 0x03d21e
- solver_prompt prelude_call-return entry=0x06affe: 0x06affe, 0x02398e (= CallLocalizeHook), 0x025758, 0x02399a, 0x02399f, 0x06b004, 0x0a1cac (= PutS), 0x0a1cb9, 0x0a1b5b (= PutC), 0x0a1b77
- os_compat prelude_call-return entry=0x0baa15: 0x0baa15, 0x080244, 0x02398e (= CallLocalizeHook), 0x025758, 0x02399a, 0x02399f, 0x08024c, 0x0baa1f, 0x0a1cac (= PutS), 0x0a1cb9

## First Rendered VRAM Row Hex Dumps

- flash_test anchor entry=0x046272 row=97 cols=48-79

```text
ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff ffff
```

- keyboard_test lifted_block entry=0x04616c row=37 cols=0-31

```text
04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0 04e0
```

- mode_screen prelude_call-return entry=0x08bc80 row=18 cols=180-211

```text
0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa
```

- os_compat prelude_call-return entry=0x0baa15 row=197 cols=0-31

```text
0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000
```

- self_test_hub backscan entry=0x04697b row=37 cols=0-31

```text
0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000
```

- solver_prompt prelude_call-return entry=0x06affe row=18 cols=0-31

```text
aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa
```

- test_halt lifted_block entry=0x046216 row=97 cols=12-43

```text
0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000
```


## Verdict

- Legible screens: flash_test -> 0x046272 (2196 writes, anchor); solver_prompt -> 0x06affe (1413 writes, prelude_call-return); os_compat -> 0x0baa15 (1365 writes, prelude_call-return); test_halt -> 0x046216 (1356 writes, lifted_block); keyboard_test -> 0x04616c (1351 writes, lifted_block); self_test_hub -> 0x04697b (1332 writes, backscan); mode_screen -> 0x08bc80 (252 writes, prelude_call-return).
- Small / partial renders: none.
- Misses / blanks: none.
- Recommended next step: wire browser-shell buttons for flash_test, solver_prompt, os_compat, test_halt, keyboard_test, self_test_hub, mode_screen using the best-rendering entries above.
