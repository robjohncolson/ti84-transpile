# Phase 68: MODE Parent Hunt

## Summary

- Exact target 0x08bc80 callers: lifted=4, raw=4, merged=5.
- Exact target 0x08bc88 callers: lifted=0, raw=0, merged=0.
- Range 0x08bc00..0x08bd00 direct callers: lifted=20, raw=17, merged=20.
- Distinct containing function entries: 12.
- Winning parent: 0x08a6b3 (fn_08a6b3) with 2081 VRAM writes and bbox r97-134 c0-301.

## Exact Callers: 0x08bc80

| Caller PC | Kind | Target | Parent entry | Source | Disassembly |
| --- | --- | --- | --- | --- | --- |
| `0x08a742` | `call` | `0x08bc80` | `0x08a6b3` | `lifted+raw` | `call 0x08bc80` |
| `0x08ab2a` | `jp` | `0x08bc80` | `0x08aab3` | `lifted+raw` | `jp 0x08bc80` |
| `0x08b391` | `call z` | `0x08bc80` | `0x08b2be` | `raw` | `call z` |
| `0x08b391` | `call-conditional` | `0x08bc80` | `0x08b2be` | `lifted` | `call z, 0x08bc80` |
| `0x08b4b1` | `call` | `0x08bc80` | `0x08b4b1` | `lifted+raw` | `call 0x08bc80` |

## Exact Callers: 0x08bc88

| Caller PC | Kind | Target | Parent entry | Source | Disassembly |
| --- | --- | --- | --- | --- | --- |
| `none` | `-` | `-` | `-` | `-` | `-` |

## Range Callers: 0x08bc00..0x08bd00

| Caller PC | Kind | Target | Parent entry | Source | Disassembly |
| --- | --- | --- | --- | --- | --- |
| `0x08a67e` | `call` | `0x08bcae` | `0x08a653` | `lifted+raw` | `call 0x08bcae` |
| `0x08a688` | `call` | `0x08bcae` | `0x08a653` | `lifted+raw` | `call 0x08bcae` |
| `0x08a692` | `call` | `0x08bcae` | `0x08a653` | `lifted+raw` | `call 0x08bcae` |
| `0x08a69c` | `call` | `0x08bcae` | `0x08a653` | `lifted+raw` | `call 0x08bcae` |
| `0x08a742` | `call` | `0x08bc80` | `0x08a6b3` | `lifted+raw` | `call 0x08bc80` |
| `0x08ab2a` | `jp` | `0x08bc80` | `0x08aab3` | `lifted+raw` | `jp 0x08bc80` |
| `0x08abf8` | `jp` | `0x08bc91` | `0x08abe1` | `lifted+raw` | `jp 0x08bc91` |
| `0x08b391` | `call z` | `0x08bc80` | `0x08b2be` | `raw` | `call z` |
| `0x08b391` | `call-conditional` | `0x08bc80` | `0x08b2be` | `lifted` | `call z, 0x08bc80` |
| `0x08b399` | `call nz` | `0x08bc91` | `0x08b2be` | `raw` | `call nz` |
| `0x08b399` | `call-conditional` | `0x08bc91` | `0x08b2be` | `lifted` | `call nz, 0x08bc91` |
| `0x08b4b1` | `call` | `0x08bc80` | `0x08b4b1` | `lifted+raw` | `call 0x08bc80` |
| `0x08bc84` | `call` | `0x08bcc4` | `0x08bc84` | `lifted+raw` | `call 0x08bcc4` |
| `0x08bca3` | `call` | `0x08bcc4` | `0x08bc91` | `lifted+raw` | `call 0x08bcc4` |
| `0x08bcc2` | `jr` | `0x08bca1` | `0x08bcae` | `lifted` | `jr 0x08bca1` |
| `0x08c04b` | `call` | `0x08bcb9` | `0x08bfa6` | `lifted+raw` | `call 0x08bcb9` |
| `0x08c0fe` | `call` | `0x08bca1` | `0x08bfa6` | `lifted+raw` | `call 0x08bca1` |
| `0x08c12c` | `call` | `0x08bca1` | `0x08bfa6` | `lifted+raw` | `call 0x08bca1` |
| `0x0976e3` | `call` | `0x08bc6c` | `0x0976d1` | `lifted+raw` | `call 0x08bc6c` |
| `0x09e2df` | `call` | `0x08bc6c` | `0x09e2bf` | `lifted+raw` | `call 0x08bc6c` |

## Candidate Parents

| Name | Entry | Caller count | Targets | Callers | Heuristic |
| --- | --- | ---: | --- | --- | --- |
| `fn_08a653` | `0x08a653` | 4 | `0x08bcae` | `0x08a67e, 0x08a688, 0x08a692, 0x08a69c` | `after_ret` |
| `fn_08a6b3` | `0x08a6b3` | 1 | `0x08bc80` | `0x08a742` | `after_ret` |
| `fn_08aab3` | `0x08aab3` | 1 | `0x08bc80` | `0x08ab2a` | `after_ret` |
| `fn_08abe1` | `0x08abe1` | 1 | `0x08bc91` | `0x08abf8` | `after_ret` |
| `fn_08b2be` | `0x08b2be` | 4 | `0x08bc80, 0x08bc91` | `0x08b391, 0x08b399` | `after_ret` |
| `fn_08b4b1` | `0x08b4b1` | 1 | `0x08bc80` | `0x08b4b1` | `after_ret` |
| `fn_08bc84` | `0x08bc84` | 1 | `0x08bcc4` | `0x08bc84` | `caller` |
| `fn_08bc91` | `0x08bc91` | 1 | `0x08bcc4` | `0x08bca3` | `after_ret` |
| `fn_08bcae` | `0x08bcae` | 1 | `0x08bca1` | `0x08bcc2` | `after_ret` |
| `fn_08bfa6` | `0x08bfa6` | 3 | `0x08bca1, 0x08bcb9` | `0x08c04b, 0x08c0fe, 0x08c12c` | `after_ret` |
| `fn_0976d1` | `0x0976d1` | 1 | `0x08bc6c` | `0x0976e3` | `after_ret` |
| `fn_09e2bf` | `0x09e2bf` | 1 | `0x08bc6c` | `0x09e2df` | `after_ret` |

## Probe Variants

| Name | Variant | Entry | Prelude | Steps | Termination | VRAM writes | BBox | Unique blocks | Verdict |
| --- | --- | --- | --- | ---: | --- | ---: | --- | ---: | --- |
| `fn_08a653` | `baseline` | `0x08a653` | `none` | 10000 | `max_steps` | 0 | `none` | 47 | `blank` |
| `fn_08a653` | `prelude_call-return` | `0x08a653` | `0x08b0e3 (callsite_jp)` | 10000 | `max_steps` | 0 | `none` | 47 | `blank` |
| `fn_08a6b3` | `baseline` | `0x08a6b3` | `none` | 10000 | `max_steps` | 2081 | `r97-134 c0-301` | 193 | `strong` |
| `fn_08a6b3` | `prelude_call-return` | `0x08a6b3` | `0x08a668 (callsite_call)` | 10000 | `max_steps` | 1984 | `r125-149 c0-109` | 236 | `strong` |
| `fn_08aab3` | `baseline` | `0x08aab3` | `none` | 4771 | `missing_block` | 468 | `r177-194 c60-85` | 222 | `legible` |
| `fn_08aab3` | `prelude_call-return` | `0x08aab3` | `0x096ebe (callsite_jp)` | 4771 | `missing_block` | 468 | `r177-194 c60-85` | 222 | `legible` |
| `fn_08abe1` | `baseline` | `0x08abe1` | `none` | 83 | `missing_block` | 0 | `none` | 55 | `missing_block` |
| `fn_08abe1` | `prelude_call-return` | `0x08abe1` | `0x08ab81 (callsite_call)` | 530 | `missing_block` | 0 | `none` | 64 | `missing_block` |
| `fn_08abe1` | `prelude_call-return` | `0x08abe1` | `0x08ab91 (callsite_call)` | 456 | `missing_block` | 0 | `none` | 63 | `missing_block` |
| `fn_08abe1` | `prelude_call-return` | `0x08abe1` | `0x08ab9b (callsite_call)` | 382 | `missing_block` | 0 | `none` | 62 | `missing_block` |
| `fn_08abe1` | `prelude_call-return` | `0x08abe1` | `0x08aba5 (callsite_call)` | 308 | `missing_block` | 0 | `none` | 61 | `missing_block` |
| `fn_08abe1` | `prelude_call-return` | `0x08abe1` | `0x08abaf (callsite_call)` | 234 | `missing_block` | 0 | `none` | 60 | `missing_block` |
| `fn_08abe1` | `prelude_call-return` | `0x08abe1` | `0x08abb9 (callsite_call)` | 160 | `missing_block` | 0 | `none` | 59 | `missing_block` |
| `fn_08abe1` | `prelude_call-return` | `0x08abe1` | `0x08abc3 (callsite_call)` | 86 | `missing_block` | 0 | `none` | 58 | `missing_block` |
| `fn_08abe1` | `prelude_call-return` | `0x08abe1` | `0x08abd2 (callsite_call)` | 10000 | `max_steps` | 0 | `none` | 62 | `blank` |
| `fn_08b2be` | `baseline` | `0x08b2be` | `none` | 3 | `missing_block` | 0 | `none` | 3 | `missing_block` |
| `fn_08b2be` | `prelude_call-return` | `0x08b2be` | `0x08b2b2 (callsite_jr-conditional)` | 1 | `prelude_miss` | 0 | `none` | 0 | `blank` |
| `fn_08b4b1` | `baseline` | `0x08b4b1` | `none` | 838 | `missing_block` | 252 | `r18-35 c180-193` | 77 | `legible` |
| `fn_08b4b1` | `prelude_call-return` | `0x08b4b1` | `0x08ab1c (callsite_call)` | 6574 | `missing_block` | 1800 | `r18-54 c0-193` | 82 | `strong` |
| `fn_08bc84` | `baseline` | `0x08bc84` | `none` | 823 | `missing_block` | 252 | `r18-35 c180-193` | 67 | `legible` |
| `fn_08bc91` | `baseline` | `0x08bc91` | `none` | 81 | `missing_block` | 0 | `none` | 53 | `missing_block` |
| `fn_08bc91` | `prelude_call-return` | `0x08bc91` | `0x08abe5 (callsite_jp)` | 81 | `missing_block` | 0 | `none` | 53 | `missing_block` |
| `fn_08bc91` | `prelude_call-return` | `0x08bc91` | `0x08b395 (callsite_call nz)` | 2658 | `halt` | 1728 | `r90-105 c75-182` | 258 | `strong` |
| `fn_08bcae` | `baseline` | `0x08bcae` | `none` | 56 | `missing_block` | 0 | `none` | 49 | `missing_block` |
| `fn_08bcae` | `prelude_call-return` | `0x08bcae` | `0x08a670 (callsite_call)` | 219 | `missing_block` | 0 | `none` | 74 | `missing_block` |
| `fn_08bcae` | `prelude_call-return` | `0x08bcae` | `0x08a682 (callsite_call)` | 172 | `missing_block` | 0 | `none` | 71 | `missing_block` |
| `fn_08bcae` | `prelude_call-return` | `0x08bcae` | `0x08a68c (callsite_call)` | 125 | `missing_block` | 0 | `none` | 70 | `missing_block` |
| `fn_08bcae` | `prelude_call-return` | `0x08bcae` | `0x08a696 (callsite_call)` | 78 | `missing_block` | 0 | `none` | 69 | `missing_block` |
| `fn_08bfa6` | `baseline` | `0x08bfa6` | `none` | 1 | `missing_block` | 0 | `none` | 1 | `missing_block` |
| `fn_08bfa6` | `prelude_call-return` | `0x08bfa6` | `0x08bf52 (callsite_call)` | 5 | `missing_block` | 0 | `none` | 5 | `missing_block` |
| `fn_08bfa6` | `prelude_call-return` | `0x08bfa6` | `0x08bf6c (callsite_call)` | 5 | `missing_block` | 0 | `none` | 5 | `missing_block` |
| `fn_08bfa6` | `prelude_call-return` | `0x08bfa6` | `0x08bf9a (callsite_call)` | 2 | `missing_block` | 0 | `none` | 2 | `missing_block` |
| `fn_0976d1` | `baseline` | `0x0976d1` | `none` | 10000 | `max_steps` | 1548 | `r37-54 c12-97` | 193 | `strong` |
| `fn_0976d1` | `prelude_call-return` | `0x0976d1` | `0x09761c (callsite_jp z)` | 1499 | `prelude_miss` | 0 | `none` | 0 | `blank` |
| `fn_09e2bf` | `baseline` | `0x09e2bf` | `none` | 10000 | `max_steps` | 0 | `none` | 29 | `blank` |
| `fn_09e2bf` | `prelude_call-return` | `0x09e2bf` | `0x08b0dd (callsite_jp z)` | 1499 | `prelude_miss` | 0 | `none` | 0 | `blank` |
| `fn_09e2bf` | `prelude_call-return` | `0x09e2bf` | `0x096e73 (callsite_jp z)` | 16 | `prelude_miss` | 0 | `none` | 0 | `blank` |

## Best Result Per Candidate

| Name | Entry | Best variant | Steps | Termination | VRAM writes | BBox | Area | Unique blocks | Verdict |
| --- | --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- |
| `fn_08a653` | `0x08a653` | `baseline` | 10000 | `max_steps` | 0 | `none` | 0 | 47 | `blank` |
| `fn_08a6b3` | `0x08a6b3` | `baseline` | 10000 | `max_steps` | 2081 | `r97-134 c0-301` | 11476 | 193 | `strong` |
| `fn_08aab3` | `0x08aab3` | `baseline` | 4771 | `missing_block` | 468 | `r177-194 c60-85` | 468 | 222 | `legible` |
| `fn_08abe1` | `0x08abe1` | `prelude_call-return` | 530 | `missing_block` | 0 | `none` | 0 | 64 | `missing_block` |
| `fn_08b2be` | `0x08b2be` | `baseline` | 3 | `missing_block` | 0 | `none` | 0 | 3 | `missing_block` |
| `fn_08b4b1` | `0x08b4b1` | `prelude_call-return` | 6574 | `missing_block` | 1800 | `r18-54 c0-193` | 7178 | 82 | `strong` |
| `fn_08bc84` | `0x08bc84` | `baseline` | 823 | `missing_block` | 252 | `r18-35 c180-193` | 252 | 67 | `legible` |
| `fn_08bc91` | `0x08bc91` | `prelude_call-return` | 2658 | `halt` | 1728 | `r90-105 c75-182` | 1728 | 258 | `strong` |
| `fn_08bcae` | `0x08bcae` | `prelude_call-return` | 219 | `missing_block` | 0 | `none` | 0 | 74 | `missing_block` |
| `fn_08bfa6` | `0x08bfa6` | `prelude_call-return` | 5 | `missing_block` | 0 | `none` | 0 | 5 | `missing_block` |
| `fn_0976d1` | `0x0976d1` | `baseline` | 10000 | `max_steps` | 1548 | `r37-54 c12-97` | 1548 | 193 | `strong` |
| `fn_09e2bf` | `0x09e2bf` | `baseline` | 10000 | `max_steps` | 0 | `none` | 0 | 29 | `blank` |

## First 15 Unique Blocks

- fn_08a653 baseline entry=0x08a653: 0x08a653, 0x08a620, 0x08c782 (= AppInit), 0x08a624, 0x0badde, 0x0bade3, 0x0b7739, 0x04c973 (= CpHLDE), 0x0b773f, 0x0badef, 0x0badf5, 0x08a62c, 0x08a632, 0x08a830, 0x08bf1d
- fn_08a6b3 baseline entry=0x08a6b3: 0x08a6b3, 0x08ab70, 0x08a6bb, 0x08ad42, 0x08b0a2, 0x0297a1, 0x08a6c0, 0x08bfec, 0x08c021, 0x08c030, 0x08c03b, 0x08be74, 0x08be7a, 0x08be80, 0x02398e (= CallLocalizeHook)
- fn_08aab3 baseline entry=0x08aab3: 0x08aab3, 0x08c782 (= AppInit), 0x08aabb (= SolveDisp), 0x08aad5, 0x08a6b7, 0x08ab70, 0x08a6bb, 0x08ad42, 0x08b0a2, 0x0297a1, 0x08a6c0, 0x08bfec, 0x08c021, 0x08c030, 0x08c03b
- fn_08abe1 prelude_call-return entry=0x08abe1: 0x08abe1, 0x080244, 0x02398e (= CallLocalizeHook), 0x025758, 0x02399a, 0x02399f, 0x08024c, 0x08abe5, 0x08bc91, 0x0b4ee2 (= VPutBlank), 0x0a23e5 (= VPutMap), 0x0a23f1, 0x0a23c0, 0x0a23c7, 0x0a23cd
- fn_08b2be baseline entry=0x08b2be: 0x08b2be, 0x08b2b7, 0x08b2bc
- fn_08b4b1 prelude_call-return entry=0x08b4b1: 0x08b4b1, 0x08bc80, 0x08bcc4, 0x07f790 (= Mov18b), 0x07f978 (= Mov9b), 0x07f794, 0x07f786, 0x08bccd, 0x08bcd1, 0x08bc88, 0x0a1cac (= PutS), 0x0a1cb9, 0x0a1b5b (= PutC), 0x0a1b77, 0x0a1799 (= PutMap)
- fn_08bc84 baseline entry=0x08bc84: 0x08bc88, 0x0a1cac (= PutS), 0x0a1cb9, 0x0a1b5b (= PutC), 0x0a1b77, 0x0a1799 (= PutMap), 0x0a17aa, 0x0a237e (= GetCurloc), 0x0a2a37, 0x0a2389, 0x0a17ae, 0x0a17b2, 0x0a17b8, 0x07bf3e, 0x07bf44
- fn_08bc91 prelude_call-return entry=0x08bc91: 0x08bc91, 0x0b4ee2 (= VPutBlank), 0x0a23e5 (= VPutMap), 0x0a23f1, 0x0a23c0, 0x0a23c7, 0x0a23cd, 0x07bf3e, 0x07bf44, 0x023a1c (= CallFontHook), 0x025758, 0x023a28, 0x023a2d, 0x07bf4b, 0x07bf4d
- fn_08bcae prelude_call-return entry=0x08bcae: 0x08bcae, 0x080244, 0x02398e (= CallLocalizeHook), 0x025758, 0x02399a, 0x02399f, 0x08024c, 0x08bcb2, 0x08bca1, 0x08bcc4, 0x07f790 (= Mov18b), 0x07f978 (= Mov9b), 0x07f794, 0x07f786, 0x08bccd
- fn_08bfa6 prelude_call-return entry=0x08bfa6: 0x08bfa6, 0x08bf56, 0x055b8f, 0x08bf66, 0x08bf9e
- fn_0976d1 baseline entry=0x0976d1: 0x0976d1, 0x060f85 (= DispNumEOS), 0x0977f7, 0x060f93, 0x060f9a, 0x060fa6, 0x0a2032 (= NewLine), 0x0a2013, 0x0a2019, 0x0a203c, 0x0a20c2, 0x0a20c8, 0x0a1a34, 0x060faa, 0x0a1f3c
- fn_09e2bf baseline entry=0x09e2bf: 0x09e2bf, 0x09e2ec, 0x0800ec (= ResetWinTop), 0x0800a0 (= CheckSplitFlag), 0x0800a6, 0x0800f2, 0x0800f6, 0x09e2f4, 0x0a223a (= ClrWindow), 0x0a235e (= HomeUp), 0x0a223e, 0x0a2247, 0x0a2251, 0x0a2254, 0x0a225a

## Winner

- Winner: fn_08a6b3 at 0x08a6b3 via baseline (2081 VRAM writes, r97-134 c0-301, area=11476).
- Selection rule: prefer candidates with bbox area > 300, then rank by VRAM writes, bbox area, and block coverage.
- First rendered row: row 97, cols 0-31.

```text
aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa
```
