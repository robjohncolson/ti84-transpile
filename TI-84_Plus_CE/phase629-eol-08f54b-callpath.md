# Phase 629: EOL Caller Path Into 0x08F54B

Probe: `probe-phase629-eol-08f54b-callpath.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase629-eol-08f54b-callpath.mjs`  
Exit: 0

## Summary

- **** EOL reached `0x08F54B` naturally 2 times and halted cleanly at `0x0019B5` after 316825 steps.
- *** Both tuple-save hits occurred inside the same cxMain/home-key path before the first cleanup wipe.
- *** Both recent-block traces converge through `0x08F479 -> 0x08F47D -> 0x04C973 -> 0x08F48A -> 0x08F547 -> 0x08F33E -> 0x090755 -> 0x090378 -> 0x04C90D -> 0x08F54B` immediately before the tuple save.
- ** The condition that makes EOL special is upstream of the shared 0x08F47x/0x08F54B save tail; arrows/DEL/INS from phase628 never reached this tuple-save tail.

## Watch Hits

| PC | Role | Hits | First block |
|---|---|---:|---:|
| 0x0585E9 | cxMain | 2 | 2908 |
| 0x05877A | home key handler | 2 | 2912 |
| 0x0587E9 | home convergence | 2 | 2916 |
| 0x05899D | home command/action dispatch | 2 | 2923 |
| 0x08C72F | context dispatch wrapper | 2 | 2900 |
| 0x08C745 | JP (HL) trampoline | 2 | 2907 |
| 0x08F54B | natural tuple save path | 2 | 26057 |
| 0x0018F8 | cleanup wipe | 2 | 124849 |

## 0x08F54B Hits

| Hit | Block | Tuple | Recent path | Stack tail |
|---:|---:|---|---|---|
| 1 | 26057 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` | `0x03F9AE -> 0x03F9B0 -> 0x03F9B8 -> 0x03D058 -> 0x03D060 -> 0x03D0E0 -> 0x08F479 -> 0x08F47D -> 0x04C973 -> 0x08F48A -> 0x08F547 -> 0x08F33E -> 0x090755 -> 0x090378 -> 0x04C90D -> 0x08F54B` | `0x006808 -> 0x001C44 -> 0x08F433 -> 0x006808 -> 0x08F437 -> 0x08F454 -> 0x08F454 -> 0x006808 -> 0x001C44 -> 0x001C44 -> 0x001C44 -> 0x006808 -> 0x001C44 -> 0x006808 -> 0x001C44 -> 0x001C44 -> 0x001C44 -> 0x006812` |
| 2 | 30871 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` | `0x091AEF -> 0x091AF2 -> 0x0907BD -> 0x09079F -> 0x08F462 -> 0x08F3DC -> 0x08F479 -> 0x08F47D -> 0x04C973 -> 0x08F48A -> 0x08F547 -> 0x08F33E -> 0x090755 -> 0x090378 -> 0x04C90D -> 0x08F54B` | `0x090859 -> 0x006808 -> 0x001C44 -> 0x08F454 -> 0x090883 -> 0x006808 -> 0x08F454 -> 0x090887 -> 0x006808 -> 0x001C44 -> 0x001C44 -> 0x001C44 -> 0x006808 -> 0x001C44 -> 0x001C44 -> 0x08F437 -> 0x09085D -> 0x091AF8` |

## Unique Path Prefix

1. `0x0585E9` - cxMain
2. `0x0585F8`
3. `0x0585F9`
4. `0x058602`
5. `0x05877A` - home key handler
6. `0x0587A3`
7. `0x080259`
8. `0x0587A7`
9. `0x0587E9` - home convergence
10. `0x058B73`
11. `0x0587F1`
12. `0x0587F3`
13. `0x05884C`
14. `0x058EDA`
15. `0x058850`
16. `0x05899D` - home command/action dispatch
17. `0x058D54`
18. `0x058EC6`
19. `0x058D58`
20. `0x0800A8`
21. `0x0800AE`
22. `0x0800B2`
23. `0x000038`
24. `0x0006F3`
25. `0x000704`
26. `0x000710`
27. `0x001713`
28. `0x0008BB`
29. `0x001717`
30. `0x001718`
31. `0x00171E`
32. `0x0067F8`
33. `0x001C4F`
34. `0x001CA6`
35. `0x001CC0`
36. `0x001CCA`
37. `0x001CCE`
38. `0x001CD5`
39. `0x001CE5`
40. `0x001C54`
41. `0x006808`
42. `0x001C33`
43. `0x001C38`
44. `0x001C3C`
45. `0x001C44`
46. `0x001C7D`
47. `0x001CE4`
48. `0x001C81`
49. `0x001C82`
50. `0x001C48`
51. `0x001C42`
52. `0x006810`
53. `0x006812`
54. `0x006816`
55. `0x00681E`
56. `0x006828`
57. `0x001727`
58. `0x000719`
59. `0x00071D`
60. `0x02010C`
61. `0x03CF7D`
62. `0x03CFA4`
63. `0x03CFCF`
64. `0x03CFD4`
65. `0x03CFDB`
66. `0x03CFE0`
67. `0x03CFE5`
68. `0x03CFEA`
69. `0x03D029`
70. `0x03D033`
71. `0x03D038`
72. `0x03D044`
73. `0x03D1C3`
74. `0x03D04C`
75. `0x03D054`
76. `0x03F994`
77. `0x0003D4`
78. `0x003CC2`
79. `0x003CD4`
80. `0x003CE0`

## Interpretation

The natural EOL tuple path is a normal home-context dispatch path that branches into the shared 0x08F47x/0x08F54B editor/display save tail before cleanup. The two tuple snapshots differ mainly in D02A29 and D02A40, showing that the second pass advances the display/cursor tuple before the wipe. Next work should either decode the immediate save-tail cluster statically (`0x08F479`, `0x08F547`, `0x08F33E`, `0x090755`, `0x090378`, `0x04C90D`) or snapshot/restore the tuple at 0x08F54B and verify it survives the following 0x0018F8 cleanup.

No runtime, transpiler, or browser files were changed.
