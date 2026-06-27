# Phase 864: Owner-Exercise Diagnostic (human-authorized Escape pre-stop bypass)

Probe: `probe-phase864-owner-exercise-diagnostic.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase864-owner-exercise-diagnostic.mjs`

Human-authorized verification. Serves a temporary instrumented copy of the real patched `browser-shell.html` and, in the served copy ONLY, bypasses the intentional Escape control pre-stop at `0x0A229D` so the faithful CLEAR route flows through the real OS CLEAR code to the downstream destructive-copy owner `0x0A31FD` with the live `D02505=0x0A` carry. Measures whether the owner runs the safe `0x0A31F2` geometry and whether the edit/VAT fields (`D0243A/D0243D/D02590/D0259D`) survive to the real-hardware after-CLEAR oracle. The disk shell is not edited.

## Summary

- Verdict: INCONCLUSIVE_OWNER_NOT_EXERCISED. Route: OTHER.
- Boot/replay `D02505` values: snapshot=0x0A, postReplay=0x0A, afterBoot=0x0A; carryPresent=true.
- Key termination=max_steps, steps=450000, controlStopPc=0x000000, wipes=3, uiClearApplied=false.
- Owner reached=false, ownerD02505=-, safeGeometry=false, copyPlan=null.
- Edit/VAT before: {"D0243A":"0xD1A8CC","D0243D":"0xD2A83E","D02590":"0xD3FE81","D0259D":"0xD3FECD"}.
- Edit/VAT after:  {"D0243A":"0x000000","D0243D":"0x000000","D02590":"0x000000","D0259D":"0x000000"}.
- Oracle (real HW after CLEAR): {"D0243A":"0xD1A8CC","D0243D":"0xD2A83E","D02590":"0xD3FE81","D0259D":"0xD3FECD"}; fieldsPreserved=false, oracleMatch=false, zeroedByRoute=["D0243A","D0243D","D02590","D0259D"].
- Page errors: [].
- The owner was not exercised (route stopped short or other); the bypass may not have taken effect. Inspect the JSON.

## Target Hits

| Target | Hits |
| --- | ---: |
| controlPreStop0A229D | 1 |
| owner0A31FD | 0 |
| ownerFallthrough0A3205 | 0 |
| copySetup0A31B8 | 0 |
| destructiveCopy0A31E2 | 0 |
| postCopy0A31A2 | 0 |
| spinLoop0A1854 | 144 |
| cleanup0018F8 | 3 |
| low006D64 | 20176 |

## Target Samples

| Target | Block | PC | Previous PC | Fields |
| --- | ---: | --- | --- | --- |
| spinLoop0A1854 | 412 | 0x0A1854 | 0x0A184A | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 445 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 478 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 511 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 544 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 577 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 610 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 643 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 676 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 709 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 742 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 775 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 808 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 841 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 874 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 907 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 985 | 0x0A1854 | 0x0A184A | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1018 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1051 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1084 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1117 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1150 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1183 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1216 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1249 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1282 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1315 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1348 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1381 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1414 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1447 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 1480 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2378 | 0x0A1854 | 0x0A184A | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2411 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2444 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2477 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2510 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2543 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2576 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2609 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2642 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2675 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2708 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2741 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2774 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2807 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2840 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2873 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x0F, D0058E=0x0F |
| spinLoop0A1854 | 2974 | 0x0A1854 | 0x0A184A | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3007 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3040 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3073 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3106 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3139 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3172 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3205 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3238 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3271 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3304 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3337 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3370 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3403 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3436 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3469 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x0F, D0058C=0x00, D0058E=0x00 |
| spinLoop0A1854 | 3821 | 0x0A1854 | 0x0A184A | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 3854 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 3887 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 3920 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 3953 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 3986 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4019 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4052 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4085 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4118 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4151 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4184 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4217 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4250 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4283 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |
| spinLoop0A1854 | 4316 | 0x0A1854 | 0x0A1A1D | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8CC, D0243D=0xD2A83E, D02504=0x00, D02505=0x0A, D02506=0x00, D02590=0xD3FE81, D0259D=0xD3FECD, D02A29=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x09, D0058E=0x00 |

## LDDR Samples

| Logical PC | Block PC | Block | Count | Source start | Dest start |
| --- | --- | ---: | --- | --- | --- |
| - | - | - | - | - | - |

## Top PCs

| PC | Count |
| --- | ---: |
| 0x000A92 | 65024 |
| 0x000BFE | 64516 |
| 0x09EFDE | 33600 |
| 0x0021C2 | 20188 |
| 0x006D5D | 20176 |
| 0x006D64 | 20176 |
| 0x006CDF | 20166 |
| 0x006D0F | 20166 |
| 0x006D38 | 20160 |
| 0x006D4F | 20160 |
| 0x006CF7 | 20156 |
| 0x026815 | 8400 |
| 0x02681A | 8400 |
| 0x026823 | 8400 |
| 0x026810 | 8190 |

## Full JSON

```json
{
  "probe": "phase864-owner-exercise-diagnostic",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:63255/browser-shell.html",
  "pass": false,
  "verdict": "INCONCLUSIVE_OWNER_NOT_EXERCISED",
  "classification": {
    "route": "OTHER",
    "controlHit": true,
    "ownerReached": false,
    "ownerD02505": null,
    "copyPlan": null,
    "safeGeometry": false,
    "editVatBefore": {
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD"
    },
    "editVatAfter": {
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0x000000",
      "D0259D": "0x000000"
    },
    "oracleAfterClear": {
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD"
    },
    "fieldsZeroedByRoute": [
      "D0243A",
      "D0243D",
      "D02590",
      "D0259D"
    ],
    "fieldsPreserved": false,
    "oracleMatch": false,
    "bootSnapshotD02505": 10,
    "postReplayD02505": 10,
    "currentD02505": 10,
    "d02505CarryPresent": true
  },
  "state": {
    "status": "Key: CLEAR ? 450000 steps (max_steps, peak 8689px)",
    "keyState": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": null,
      "controlPreStopLabel": null,
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": null,
      "controlStopPc": null,
      "controlStopCursorBefore": null,
      "controlStopCursorAfter": null,
      "controlStopCursorRestored": false,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": false,
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "steps": 450000,
      "termination": "max_steps",
      "wipes": 3,
      "D0243A": 0,
      "D0243D": 0,
      "D007CA": 0,
      "D008E0": 0,
      "D02590": 0,
      "D000C2": 0,
      "buffer": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 8689,
      "vramCurrent": 3356
    },
    "diagnostics": {
      "D007CA": 0,
      "D008E0": 0,
      "D0243A": 0,
      "D0243D": 0,
      "D02590": 0,
      "D00595": 9,
      "D00596": 2,
      "buffer": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "entryLineRoi": {
        "x": 0,
        "y": 34,
        "width": 128,
        "height": 26,
        "nonWhite": 421
      },
      "vramCurrent": 3356,
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": null,
        "controlStopPc": null,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 450000,
        "termination": "max_steps",
        "wipes": 3,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 0,
        "D008E0": 0,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 3356
      }
    },
    "persistence": {
      "tokenGate": 0,
      "tokenA": 0,
      "tokenB": 0,
      "tuple": {
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D0059A": 0,
        "D01150": 0,
        "D0243D": 0,
        "D02A40": 0,
        "D02A28": 0
      }
    },
    "pageErrors": [],
    "afterBoot": {
      "label": "afterBoot",
      "status": "Coldboot complete. OS event loop is ready.",
      "runtimeMode": "coldboot",
      "lastPc": 574257,
      "lastMode": "adl",
      "totalSteps": 637707,
      "cpu": {
        "pc": 6581,
        "currentBlockPc": 6581,
        "stepCount": 49473,
        "sp": 13740134,
        "af": 4180,
        "bc": 0,
        "de": 13805589,
        "hl": 13740195,
        "ix": 13740128,
        "iy": 13631616,
        "f": 84,
        "halted": true
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02504": "0x00",
        "D02505": "0x0A",
        "D02506": "0x00",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x000000",
        "D00595": "0x00",
        "D00596": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00"
      },
      "editLine": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D00595": 0,
        "D00596": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 8549,
        "lastKey": null
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8549,
      "phase6": {
        "steps": 49474,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8549,
        "vatSnapshotCaptured": true
      },
      "bootSnapshot": [
        {
          "name": "D007CA",
          "addr": 13633482,
          "len": 3,
          "value": 361961
        },
        {
          "name": "D008E0",
          "addr": 13633760,
          "len": 3,
          "value": 13740134
        },
        {
          "name": "D02505",
          "addr": 13640965,
          "len": 1,
          "value": 10
        },
        {
          "name": "D02587",
          "addr": 13641095,
          "len": 3,
          "value": 13805794
        },
        {
          "name": "D0258A",
          "addr": 13641098,
          "len": 3,
          "value": 13805794
        },
        {
          "name": "D0258D",
          "addr": 13641101,
          "len": 3,
          "value": 13805794
        },
        {
          "name": "D02590",
          "addr": 13641104,
          "len": 3,
          "value": 13893249
        },
        {
          "name": "D02593",
          "addr": 13641107,
          "len": 3,
          "value": 13893249
        },
        {
          "name": "D0259A",
          "addr": 13641114,
          "len": 3,
          "value": 13893249
        },
        {
          "name": "D0259D",
          "addr": 13641117,
          "len": 3,
          "value": 13893325
        },
        {
          "name": "D025A0",
          "addr": 13641120,
          "len": 3,
          "value": 13805732
        },
        {
          "name": "D025C5",
          "addr": 13641157,
          "len": 3,
          "value": 786432
        }
      ],
      "replayApplied": true,
      "postReplayFields": {
        "D007CA": 361961,
        "D008E0": 13740134,
        "D02505": 10,
        "D02587": 13805794,
        "D0258A": 13805794,
        "D0258D": 13805794,
        "D02590": 13893249,
        "D02593": 13893249,
        "D0259A": 13893249,
        "D0259D": 13893325,
        "D025A0": 13805732,
        "D025C5": 786432
      },
      "lastKey": null,
      "pageErrors": []
    },
    "traceRecord": {
      "label": "Escape/CLEAR after D02505 patch",
      "start": {
        "label": "start",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "stepCount": 49473,
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84,
          "halted": true
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x000000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00"
        },
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D00595": 0,
          "D00596": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 0
          },
          "vramCurrent": 8549,
          "lastKey": null
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 13805630,
            "D02A40": 13805630,
            "D02A28": 0
          }
        },
        "vram": 8549,
        "phase6": {
          "steps": 49474,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8549,
          "vatSnapshotCaptured": true
        },
        "bootSnapshot": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134
          },
          {
            "name": "D02505",
            "addr": 13640965,
            "len": 1,
            "value": 10
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432
          }
        ],
        "replayApplied": true,
        "postReplayFields": {
          "D007CA": 361961,
          "D008E0": 13740134,
          "D02505": 10,
          "D02587": 13805794,
          "D0258A": 13805794,
          "D0258D": 13805794,
          "D02590": 13893249,
          "D02593": 13893249,
          "D0259A": 13893249,
          "D0259D": 13893325,
          "D025A0": 13805732,
          "D025C5": 786432
        },
        "lastKey": null,
        "pageErrors": [],
        "pc": "0x000000",
        "prevPc": null,
        "stackTop": []
      },
      "end": {
        "label": "end",
        "status": "Key: CLEAR ? 450000 steps (max_steps, peak 8689px)",
        "runtimeMode": "coldboot",
        "lastPc": 23222,
        "lastMode": "adl",
        "totalSteps": 1087707,
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "stepCount": 449999,
          "sp": "0xD1A857",
          "af": "0xFF0A",
          "bc": "0xFF0805",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "ix": "0xD005B1",
          "iy": "0xD00080",
          "f": 10,
          "halted": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02504": "0x00",
          "D02505": "0x00",
          "D02506": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x000000",
          "D00595": "0x09",
          "D00596": "0x02",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00"
        },
        "editLine": {
          "D007CA": 0,
          "D008E0": 0,
          "D0243A": 0,
          "D0243D": 0,
          "D02590": 0,
          "D00595": 9,
          "D00596": 2,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 421
          },
          "vramCurrent": 3356,
          "lastKey": {
            "code": "Escape",
            "label": "CLEAR",
            "expectedInsertByte": null,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 450000,
            "termination": "max_steps",
            "wipes": 3,
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 0,
            "D008E0": 0,
            "D02590": 0,
            "D000C2": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 3356
          }
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 0,
            "D02A40": 0,
            "D02A28": 0
          }
        },
        "vram": 3356,
        "phase6": {
          "steps": 49474,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8549,
          "vatSnapshotCaptured": true
        },
        "bootSnapshot": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134
          },
          {
            "name": "D02505",
            "addr": 13640965,
            "len": 1,
            "value": 10
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432
          }
        ],
        "replayApplied": true,
        "postReplayFields": {
          "D007CA": 361961,
          "D008E0": 13740134,
          "D02505": 10,
          "D02587": 13805794,
          "D0258A": 13805794,
          "D0258D": 13805794,
          "D02590": 13893249,
          "D02593": 13893249,
          "D0259A": 13893249,
          "D0259D": 13893325,
          "D025A0": 13805732,
          "D025C5": 786432
        },
        "lastKey": {
          "code": "Escape",
          "label": "CLEAR",
          "expectedInsertByte": null,
          "controlPreStopPc": null,
          "controlPreStopLabel": null,
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": null,
          "controlStopPc": null,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "steps": 450000,
          "termination": "max_steps",
          "wipes": 3,
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02590": 0,
          "D000C2": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8689,
          "vramCurrent": 3356
        },
        "pageErrors": [],
        "pc": "0x000000",
        "prevPc": null,
        "stackTop": []
      },
      "totalBlocks": 449968,
      "prevPc": "0x005B4B",
      "lastPcs": [
        {
          "block": 449889,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449890,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449891,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449892,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449893,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449894,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449895,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449896,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449897,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449898,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449899,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449900,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449901,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449902,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449903,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449904,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449905,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449906,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449907,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449908,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449909,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449910,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449911,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449912,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449913,
          "pc": "0x005B92",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449914,
          "pc": "0x005A19",
          "prevPc": "0x005B92"
        },
        {
          "block": 449915,
          "pc": "0x0059DA",
          "prevPc": "0x005A19"
        },
        {
          "block": 449916,
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 449917,
          "pc": "0x01586A",
          "prevPc": "0x0059E6"
        },
        {
          "block": 449918,
          "pc": "0x000E33",
          "prevPc": "0x01586A"
        },
        {
          "block": 449919,
          "pc": "0x015856",
          "prevPc": "0x000E33"
        },
        {
          "block": 449920,
          "pc": "0x015864",
          "prevPc": "0x015856"
        },
        {
          "block": 449921,
          "pc": "0x0059C6",
          "prevPc": "0x015864"
        },
        {
          "block": 449922,
          "pc": "0x0059D6",
          "prevPc": "0x0059C6"
        },
        {
          "block": 449923,
          "pc": "0x005A75",
          "prevPc": "0x0059D6"
        },
        {
          "block": 449924,
          "pc": "0x005A82",
          "prevPc": "0x005A75"
        },
        {
          "block": 449925,
          "pc": "0x00596E",
          "prevPc": "0x005A82"
        },
        {
          "block": 449926,
          "pc": "0x001713",
          "prevPc": "0x00596E"
        },
        {
          "block": 449927,
          "pc": "0x0008BB",
          "prevPc": "0x001713"
        },
        {
          "block": 449928,
          "pc": "0x001717",
          "prevPc": "0x0008BB"
        },
        {
          "block": 449929,
          "pc": "0x001718",
          "prevPc": "0x001717"
        },
        {
          "block": 449930,
          "pc": "0x005974",
          "prevPc": "0x001718"
        },
        {
          "block": 449931,
          "pc": "0x005998",
          "prevPc": "0x005974"
        },
        {
          "block": 449932,
          "pc": "0x005A8B",
          "prevPc": "0x005998"
        },
        {
          "block": 449933,
          "pc": "0x005A48",
          "prevPc": "0x005A8B"
        },
        {
          "block": 449934,
          "pc": "0x005A96",
          "prevPc": "0x005A48"
        },
        {
          "block": 449935,
          "pc": "0x005A53",
          "prevPc": "0x005A96"
        },
        {
          "block": 449936,
          "pc": "0x005AA2",
          "prevPc": "0x005A53"
        },
        {
          "block": 449937,
          "pc": "0x005AAE",
          "prevPc": "0x005AA2"
        },
        {
          "block": 449938,
          "pc": "0x005AE8",
          "prevPc": "0x005AAE"
        },
        {
          "block": 449939,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449940,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449941,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449942,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449943,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449944,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449945,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449946,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449947,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449948,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449949,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449950,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449951,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449952,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449953,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449954,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449955,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449956,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449957,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449958,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449959,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449960,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449961,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449962,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449963,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449964,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        },
        {
          "block": 449965,
          "pc": "0x005AB6",
          "prevPc": "0x005B4B"
        },
        {
          "block": 449966,
          "pc": "0x005AE8",
          "prevPc": "0x005AB6"
        },
        {
          "block": 449967,
          "pc": "0x005B16",
          "prevPc": "0x005AE8"
        },
        {
          "block": 449968,
          "pc": "0x005B4B",
          "prevPc": "0x005B16"
        }
      ],
      "hotBlocks": {
        "0x08C331": 2,
        "0x05C634": 4,
        "0x000038": 31,
        "0x0006F3": 31,
        "0x000704": 31,
        "0x000710": 31,
        "0x001713": 513,
        "0x0008BB": 515,
        "0x001717": 513,
        "0x001718": 513,
        "0x00171E": 31,
        "0x0067F8": 31,
        "0x001C4F": 76,
        "0x001CA6": 266,
        "0x001CC0": 221,
        "0x001CCA": 219,
        "0x001CCE": 37,
        "0x001CD5": 37,
        "0x001CE5": 84,
        "0x001C54": 76,
        "0x006808": 31,
        "0x001C33": 233,
        "0x001C38": 226,
        "0x001C3C": 183,
        "0x001C44": 181,
        "0x001C7D": 183,
        "0x001CE4": 182,
        "0x001C81": 190,
        "0x001C82": 190,
        "0x001C48": 181,
        "0x001C42": 45,
        "0x006810": 31,
        "0x006812": 31,
        "0x006816": 31,
        "0x00681E": 31,
        "0x006828": 31,
        "0x001727": 31,
        "0x000719": 31,
        "0x00071D": 31,
        "0x02010C": 31,
        "0x03CF7D": 31,
        "0x03CFA4": 31,
        "0x03CFCF": 31,
        "0x03CFD4": 28,
        "0x03CFDB": 28,
        "0x03CFE0": 28,
        "0x03CFE5": 28,
        "0x03CFEA": 28,
        "0x03D029": 28,
        "0x03D033": 28,
        "0x03D038": 28,
        "0x03D044": 28,
        "0x03D04C": 28,
        "0x03D054": 28,
        "0x03F994": 28,
        "0x0003D4": 28,
        "0x003CC2": 28,
        "0x003CD4": 30,
        "0x003CE0": 30,
        "0x003CEE": 30,
        "0x003CF3": 30,
        "0x03F998": 28,
        "0x03F99A": 28,
        "0x03F9AB": 28,
        "0x03F9AE": 28,
        "0x03D058": 28,
        "0x03D060": 28,
        "0x03D0E0": 31,
        "0x05C67C": 4,
        "0x08C339": 2,
        "0x06CE73": 2,
        "0x06CE7F": 2,
        "0x06CE7B": 2,
        "0x06C8AB": 2,
        "0x08C33D": 4,
        "0x0A349A": 4,
        "0x0A349F": 4,
        "0x0A32F9": 6,
        "0x0A3301": 4,
        "0x08C308": 7,
        "0x0A331E": 6,
        "0x0A336F": 6,
        "0x0A3383": 6,
        "0x0A338A": 6,
        "0x0A33FB": 24,
        "0x0A3408": 168,
        "0x0A3404": 144,
        "0x0A340F": 56,
        "0x0A3392": 6,
        "0x0A339A": 6,
        "0x0A33E6": 24,
        "0x0A33FF": 24,
        "0x0A33EE": 24,
        "0x0A3403": 24,
        "0x0A33A2": 6,
        "0x0A33AA": 6,
        "0x0A33B2": 6,
        "0x0A33BA": 6,
        "0x0A33C2": 6,
        "0x0A33CA": 6,
        "0x0A33DA": 6,
        "0x0A33E4": 4,
        "0x0A34AE": 4,
        "0x08C341": 4,
        "0x05C75B": 4,
        "0x05C760": 4,
        "0x05C768": 4,
        "0x05C771": 7,
        "0x05C795": 7,
        "0x05C7A5": 7,
        "0x05C7AD": 7,
        "0x05C7B5": 7,
        "0x05C7C1": 7,
        "0x05C7D7": 7,
        "0x05C7DD": 4,
        "0x05C7ED": 4,
        "0x05C815": 4,
        "0x0A237E": 11,
        "0x0A2A37": 13,
        "0x0A2389": 11,
        "0x05C819": 4,
        "0x05C82C": 7,
        "0x05C832": 7,
        "0x05E3D6": 7,
        "0x04C973": 12,
        "0x05C836": 7,
        "0x05C84D": 5,
        "0x05CA44": 5,
        "0x05CA4E": 5,
        "0x05CA57": 5,
        "0x05C851": 5,
        "0x05CBC0": 5,
        "0x05CBC3": 5,
        "0x05CBC9": 5,
        "0x05C855": 5,
        "0x05C875": 7,
        "0x05C87E": 7,
        "0x0A1799": 9,
        "0x0A17AA": 7,
        "0x0A17AE": 7,
        "0x0A17B2": 7,
        "0x0A17B8": 7,
        "0x07BF3E": 9,
        "0x07BF4D": 9,
        "0x07BF5C": 9,
        "0x000380": 9,
        "0x003D85": 9,
        "0x07BF61": 9,
        "0x0A17C5": 9,
        "0x0A2D4C": 9,
        "0x0A17D0": 9,
        "0x00038C": 9,
        "0x005A53": 491,
        "0x0A17E9": 9,
        "0x0A17EF": 9,
        "0x0A17F7": 9,
        "0x0A1805": 9,
        "0x0A180B": 7,
        "0x0A1838": 7,
        "0x0A1A8F": 7,
        "0x0A183D": 7,
        "0x0A184A": 9,
        "0x0A1854": 144,
        "0x0A187C": 144,
        "0x0A188A": 144,
        "0x0A189E": 144,
        "0x0A18A6": 112,
        "0x0A1A83": 224,
        "0x0A18AF": 112,
        "0x0A18C1": 112,
        "0x0A18C4": 112,
        "0x0A18CA": 112,
        "0x0A18E9": 112,
        "0x0A18EB": 112,
        "0x0A190D": 144,
        "0x0A191F": 144,
        "0x0A1939": 144,
        "0x0A1969": 144,
        "0x0A1976": 144,
        "0x0A1980": 144,
        "0x0A1988": 112,
        "0x0A1994": 112,
        "0x0A19A4": 784,
        "0x0A19AA": 112,
        "0x0A19B5": 112,
        "0x0A19B7": 112,
        "0x0A19D7": 144,
        "0x0A1A1D": 144,
        "0x0A1A30": 9,
        "0x05C883": 7,
        "0x08C345": 4,
        "0x08C34F": 1,
        "0x08C366": 2,
        "0x08C38A": 2,
        "0x08C3A0": 2,
        "0x05C689": 2,
        "0x05C696": 2,
        "0x05C6A6": 2,
        "0x05C6AE": 2,
        "0x05C6B6": 2,
        "0x05C6C2": 2,
        "0x05C6D3": 2,
        "0x05C6E6": 2,
        "0x05C6FC": 2,
        "0x0A17B6": 2,
        "0x05C700": 2,
        "0x08C3A8": 2,
        "0x0A27DD": 2,
        "0x0A27E7": 2,
        "0x03D1C3": 9,
        "0x03D1C9": 2,
        "0x0A32FF": 2,
        "0x0A3411": 48,
        "0x0A3418": 16,
        "0x03D1D1": 2,
        "0x0A27F9": 2,
        "0x0A1A36": 2,
        "0x08C3AC": 2,
        "0x08C3C3": 2,
        "0x08C3C9": 2,
        "0x08C3EE": 2,
        "0x08C3F2": 2,
        "0x084989": 2,
        "0x084998": 2,
        "0x0849A5": 2,
        "0x0849B3": 2,
        "0x0849B9": 2,
        "0x0849C4": 2,
        "0x089092": 2,
        "0x0849C8": 2,
        "0x0849CA": 2,
        "0x08909E": 2,
        "0x0849CE": 2,
        "0x0849D2": 2,
        "0x0890C2": 2,
        "0x0849D6": 2,
        "0x0849DA": 2,
        "0x0890AA": 2,
        "0x0849DE": 2,
        "0x0849E6": 2,
        "0x084B7F": 2,
        "0x084B82": 2,
        "0x0849EA": 2,
        "0x0849EE": 2,
        "0x0849F8": 2,
        "0x084ADF": 2,
        "0x084AE7": 2,
        "0x0849FC": 2,
        "0x084A00": 4,
        "0x0851D2": 4,
        "0x08C3F6": 2,
        "0x08C3FA": 2,
        "0x08C3FC": 2,
        "0x08C401": 2,
        "0x04E0E4": 2,
        "0x04E0E8": 2,
        "0x084AD6": 2,
        "0x04E0EC": 2,
        "0x04E0F0": 2,
        "0x04E0F4": 2,
        "0x08C405": 2,
        "0x08C407": 2,
        "0x08C413": 2,
        "0x08C417": 2,
        "0x08C41B": 2,
        "0x08C44D": 2,
        "0x08C59B": 2,
        "0x08C5A7": 2,
        "0x08C509": 2,
        "0x08C511": 2,
        "0x08C519": 2,
        "0x08C526": 2,
        "0x08C532": 2,
        "0x022331": 2,
        "0x000578": 3,
        "0x0158A6": 5,
        "0x022336": 2,
        "0x022344": 2,
        "0x08C536": 2,
        "0x08C72F": 2,
        "0x05622E": 2,
        "0x05623D": 2,
        "0x056244": 2,
        "0x056248": 2,
        "0x056253": 2,
        "0x08C734": 2,
        "0x08C745": 2,
        "0x0585E9": 2,
        "0x0585F8": 2,
        "0x0585F9": 2,
        "0x058602": 2,
        "0x05877A": 2,
        "0x0587A3": 2,
        "0x080259": 6,
        "0x0587A7": 2,
        "0x0587E9": 2,
        "0x058B73": 2,
        "0x0587F1": 2,
        "0x0587F3": 2,
        "0x05884C": 2,
        "0x058EDA": 2,
        "0x058850": 2,
        "0x05899D": 2,
        "0x058D54": 4,
        "0x058EC6": 4,
        "0x058D58": 4,
        "0x0800A8": 4,
        "0x0800AE": 4,
        "0x0800B2": 4,
        "0x058D60": 4,
        "0x058D89": 4,
        "0x0589A1": 2,
        "0x0589AE": 2,
        "0x0589B2": 1,
        "0x0581A3": 1,
        "0x0800B8": 3,
        "0x0581A7": 1,
        "0x0589B6": 1,
        "0x05E42A": 1,
        "0x05E37D": 1,
        "0x05E38A": 1,
        "0x05E432": 1,
        "0x0589BA": 1,
        "0x08C73D": 2,
        "0x08C53A": 2,
        "0x08C543": 2,
        "0x08C593": 2,
        "0x08C359": 3,
        "0x02FCB3": 3,
        "0x02FCB9": 3,
        "0x02FD8F": 3,
        "0x02FDA6": 3,
        "0x03013A": 3,
        "0x03013F": 3,
        "0x030145": 3,
        "0x03014B": 3,
        "0x030151": 3,
        "0x030157": 3,
        "0x02FDAC": 3,
        "0x05C76C": 3,
        "0x05C81E": 3,
        "0x02FDB6": 3,
        "0x03FA09": 3,
        "0x05C623": 12,
        "0x03FB9A": 1,
        "0x03FBC0": 1,
        "0x03FBC3": 1,
        "0x03FBE8": 1,
        "0x02FDC2": 1,
        "0x02FDC8": 1,
        "0x02FDD8": 1,
        "0x02FDE6": 1,
        "0x02FE89": 1,
        "0x02FE9D": 1,
        "0x02FEB7": 1,
        "0x02FECF": 1,
        "0x02FED7": 1,
        "0x02FEDF": 1,
        "0x02FEF3": 1,
        "0x02FF09": 1,
        "0x022346": 1,
        "0x02234B": 1,
        "0x022357": 1,
        "0x02FF1A": 1,
        "0x0302EB": 1,
        "0x0302F0": 1,
        "0x02FF1F": 1,
        "0x02FF23": 1,
        "0x02FFAE": 1,
        "0x02FFB7": 1,
        "0x02FFBF": 1,
        "0x02FFC4": 1,
        "0x02FFCC": 1,
        "0x02FFD2": 1,
        "0x02FFDA": 1,
        "0x02FFDE": 1,
        "0x02FFE3": 1,
        "0x02FFE7": 1,
        "0x02FFED": 1,
        "0x02FE84": 1,
        "0x030300": 1,
        "0x02FE88": 1,
        "0x02FCC6": 1,
        "0x02FCF9": 1,
        "0x02FCFD": 1,
        "0x02FCE0": 1,
        "0x0589BB": 1,
        "0x0589E5": 1,
        "0x0589E9": 1,
        "0x0589EF": 1,
        "0x058A0C": 1,
        "0x058A10": 1,
        "0x058212": 1,
        "0x058216": 1,
        "0x05821D": 1,
        "0x05E3E3": 1,
        "0x05E3F5": 3,
        "0x05E3E7": 1,
        "0x05E3E8": 1,
        "0x058221": 1,
        "0x058A14": 1,
        "0x058A16": 1,
        "0x0A223A": 1,
        "0x0A235E": 1,
        "0x0A223E": 1,
        "0x0800A0": 1,
        "0x0800BD": 1,
        "0x0A2247": 1,
        "0x0A2251": 1,
        "0x0A2254": 1,
        "0x0A225A": 1,
        "0x0A2263": 1,
        "0x0A226D": 1,
        "0x09EF20": 1,
        "0x09EF44": 1,
        "0x09EF4C": 1,
        "0x09EF5E": 1,
        "0x09EF70": 1,
        "0x09EFB7": 1,
        "0x09EFDE": 33600,
        "0x09EFE8": 210,
        "0x09EFEF": 210,
        "0x09EFCB": 209,
        "0x09F001": 1,
        "0x09F736": 1,
        "0x09F73A": 1,
        "0x03CFFE": 3,
        "0x09EF2E": 1,
        "0x0A227A": 1,
        "0x0A2280": 1,
        "0x026789": 1,
        "0x026795": 1,
        "0x0267A6": 1,
        "0x026146": 2,
        "0x0267B6": 1,
        "0x0267C5": 1,
        "0x0267E0": 1,
        "0x0267F0": 1,
        "0x026815": 8400,
        "0x02681A": 8400,
        "0x026823": 8400,
        "0x026810": 8190,
        "0x02682A": 420,
        "0x02683C": 210,
        "0x026840": 210,
        "0x0267F7": 209,
        "0x026848": 1,
        "0x026851": 1,
        "0x0A228F": 1,
        "0x0A229D": 1,
        "0x0A22A4": 1,
        "0x058A1A": 1,
        "0x058A22": 1,
        "0x058A26": 1,
        "0x058A2A": 1,
        "0x058A58": 1,
        "0x03FBF9": 1,
        "0x03FC06": 1,
        "0x03FA1C": 2,
        "0x03FA93": 2,
        "0x03FA9C": 2,
        "0x03FAA2": 2,
        "0x03FABC": 2,
        "0x02515C": 2,
        "0x025196": 2,
        "0x0251A1": 2,
        "0x0251CB": 2,
        "0x03FAC1": 2,
        "0x0005F4": 2,
        "0x0158B1": 2,
        "0x03FAC5": 2,
        "0x03FAC9": 2,
        "0x03FAD6": 2,
        "0x03FAE2": 2,
        "0x03FAE8": 2,
        "0x048AC4": 2,
        "0x00012C": 24,
        "0x002197": 26,
        "0x048ACC": 2,
        "0x048AE0": 2,
        "0x048AE5": 2,
        "0x03F26D": 4,
        "0x048AE9": 2,
        "0x048B07": 2,
        "0x048B11": 2,
        "0x048B21": 2,
        "0x048B26": 2,
        "0x05206E": 6,
        "0x052089": 6,
        "0x048B3C": 2,
        "0x048B5B": 2,
        "0x0000B0": 22,
        "0x00285F": 22,
        "0x002873": 22,
        "0x00287D": 22,
        "0x048B69": 2,
        "0x048B81": 2,
        "0x048B91": 2,
        "0x048BA1": 2,
        "0x048BB1": 2,
        "0x048BC1": 2,
        "0x048BD1": 2,
        "0x0457B2": 2,
        "0x04586B": 2,
        "0x048BD7": 2,
        "0x048BEB": 2,
        "0x04E07B": 2,
        "0x000130": 6,
        "0x00218A": 6,
        "0x04E07F": 2,
        "0x04E091": 2,
        "0x04E0A1": 2,
        "0x04E0B1": 2,
        "0x052013": 4,
        "0x04E0CC": 2,
        "0x0BCD24": 2,
        "0x04E0D1": 2,
        "0x04E0D6": 2,
        "0x048BFB": 2,
        "0x049CCA": 2,
        "0x049CD2": 2,
        "0x049D11": 2,
        "0x049D19": 2,
        "0x049A23": 2,
        "0x049A2B": 2,
        "0x049A3A": 2,
        "0x000124": 4,
        "0x00211B": 4,
        "0x002147": 4,
        "0x049AA7": 2,
        "0x000210": 2,
        "0x002623": 2,
        "0x00263E": 2,
        "0x002649": 2,
        "0x049AC9": 2,
        "0x049CC2": 2,
        "0x049D23": 2,
        "0x049D2F": 2,
        "0x049D77": 2,
        "0x049DF9": 2,
        "0x049DFE": 2,
        "0x048C0A": 2,
        "0x048C20": 2,
        "0x048C2C": 2,
        "0x04985C": 2,
        "0x048C44": 2,
        "0x048C4E": 2,
        "0x048964": 2,
        "0x048968": 2,
        "0x048C5D": 2,
        "0x048C6B": 2,
        "0x05202F": 26,
        "0x048C75": 2,
        "0x048C7F": 2,
        "0x048C89": 2,
        "0x048C93": 2,
        "0x048C9D": 2,
        "0x048CA7": 2,
        "0x048CB1": 2,
        "0x048CBB": 2,
        "0x048CC5": 2,
        "0x048CCF": 2,
        "0x048CD9": 2,
        "0x048CE3": 2,
        "0x048CED": 2,
        "0x04CA7B": 2,
        "0x040D11": 2,
        "0x040D1F": 2,
        "0x040D29": 2,
        "0x040D3E": 2,
        "0x048CF2": 2,
        "0x048CF7": 2,
        "0x049FFA": 2,
        "0x04A00A": 2,
        "0x04A00F": 2,
        "0x04A01F": 2,
        "0x04A024": 2,
        "0x048D05": 2,
        "0x048D15": 2,
        "0x048D1A": 2,
        "0x048D2A": 2,
        "0x048D2F": 2,
        "0x048D3F": 2,
        "0x048D44": 2,
        "0x048D54": 2,
        "0x048D59": 2,
        "0x048D69": 2,
        "0x048D6E": 2,
        "0x040FAD": 2,
        "0x040FB1": 2,
        "0x040FC1": 2,
        "0x040FC6": 2,
        "0x000138": 8,
        "0x0021C2": 20188,
        "0x040FCD": 2,
        "0x040FF9": 2,
        "0x048D77": 2,
        "0x048D8C": 2,
        "0x048D91": 2,
        "0x048DA1": 2,
        "0x048DA6": 2,
        "0x048DB6": 2,
        "0x048DBB": 2,
        "0x048DC9": 2,
        "0x048DCE": 2,
        "0x048DD3": 2,
        "0x048DE4": 2,
        "0x048DE9": 2,
        "0x048DED": 2,
        "0x048DFC": 2,
        "0x0419F1": 2,
        "0x0419F9": 2,
        "0x000178": 2,
        "0x0022F9": 2,
        "0x002301": 2,
        "0x002307": 2,
        "0x002306": 16,
        "0x002309": 2,
        "0x0022FF": 2,
        "0x041A09": 2,
        "0x000168": 2,
        "0x00229D": 2,
        "0x041A1D": 2,
        "0x04B664": 2,
        "0x04B67F": 2,
        "0x04B684": 2,
        "0x041A28": 2,
        "0x041A48": 2,
        "0x041A4D": 2,
        "0x041A5D": 2,
        "0x041A62": 2,
        "0x041A72": 2,
        "0x041A77": 2,
        "0x041A8D": 2,
        "0x041A8F": 2,
        "0x041AB1": 2,
        "0x041AB6": 2,
        "0x041AC6": 2,
        "0x041ACB": 2,
        "0x041AD4": 2,
        "0x041ADE": 2,
        "0x02AF88": 2,
        "0x02AF90": 2,
        "0x0BCB0B": 2,
        "0x0BCB13": 2,
        "0x02AF98": 2,
        "0x02AFB5": 2,
        "0x02AFA8": 9,
        "0x02AFBE": 7,
        "0x02AFB3": 2,
        "0x02AFE3": 2,
        "0x02AFEC": 2,
        "0x0BC93C": 2,
        "0x0BC944": 2,
        "0x02AFF0": 2,
        "0x02B00D": 2,
        "0x02B000": 3,
        "0x02B00B": 2,
        "0x02B03B": 2,
        "0x000100": 2,
        "0x00257F": 2,
        "0x002584": 2,
        "0x002583": 12,
        "0x002586": 2,
        "0x02B04E": 2,
        "0x0BCA42": 2,
        "0x0BCA4A": 2,
        "0x02B070": 2,
        "0x02B090": 2,
        "0x02B083": 2,
        "0x02B08E": 2,
        "0x02B0BE": 2,
        "0x0BCA85": 2,
        "0x0BCA8D": 2,
        "0x02B0C2": 2,
        "0x02B0E2": 2,
        "0x02B0D5": 4,
        "0x02B0EB": 2,
        "0x02B0E0": 2,
        "0x02B110": 2,
        "0x0BCAC8": 2,
        "0x0BCAD0": 2,
        "0x02B114": 2,
        "0x02B134": 2,
        "0x02B127": 2,
        "0x02B132": 2,
        "0x02B162": 2,
        "0x02AEC8": 2,
        "0x02AED0": 2,
        "0x000338": 2,
        "0x001CEB": 2,
        "0x001C55": 10,
        "0x001C5D": 10,
        "0x001C5E": 8,
        "0x001C6B": 8,
        "0x001CF3": 2,
        "0x001CF5": 2,
        "0x001CBC": 45,
        "0x001CF9": 2,
        "0x001D01": 2,
        "0x001D03": 2,
        "0x001D07": 2,
        "0x001D0C": 2,
        "0x02AED4": 2,
        "0x02AEE5": 2,
        "0x02AEE9": 2,
        "0x0000D4": 2,
        "0x0029E9": 2,
        "0x02AEF1": 2,
        "0x02AF22": 2,
        "0x02AF0F": 28,
        "0x000218": 28,
        "0x002696": 28,
        "0x0026A1": 28,
        "0x02AF1C": 28,
        "0x02AF2B": 26,
        "0x02AF20": 2,
        "0x02AF62": 2,
        "0x02B16B": 2,
        "0x02B175": 2,
        "0x02B17E": 2,
        "0x02B19A": 2,
        "0x02B18B": 4,
        "0x02B1A3": 2,
        "0x02B196": 2,
        "0x02B319": 2,
        "0x0BCB2F": 2,
        "0x0BCB37": 2,
        "0x02B31D": 2,
        "0x02B33A": 2,
        "0x02B32D": 6,
        "0x02B343": 4,
        "0x02B338": 2,
        "0x02B368": 2,
        "0x02B36D": 2,
        "0x000000": 2,
        "0x000658": 2,
        "0x000673": 2,
        "0x000679": 2,
        "0x00067E": 2,
        "0x0012CA": 2,
        "0x0012DD": 2,
        "0x0012E3": 2,
        "0x0012F3": 2,
        "0x001305": 2,
        "0x00131B": 2,
        "0x001324": 2,
        "0x00132D": 2,
        "0x001336": 2,
        "0x001352": 2,
        "0x001359": 158,
        "0x00135B": 2,
        "0x00136A": 2,
        "0x001370": 2,
        "0x001377": 508,
        "0x001379": 2,
        "0x00138A": 2,
        "0x001393": 2,
        "0x00139D": 2,
        "0x0013C3": 2,
        "0x001988": 2,
        "0x001991": 2,
        "0x00199E": 2,
        "0x0019A4": 2,
        "0x0019A9": 2,
        "0x0019B3": 2,
        "0x0013C7": 2,
        "0x0158DE": 5,
        "0x0158E8": 5,
        "0x0158BC": 5,
        "0x0158C4": 5,
        "0x0158C6": 5,
        "0x0158CA": 5,
        "0x001C4A": 7,
        "0x0158D2": 5,
        "0x0158DA": 5,
        "0x0158EC": 5,
        "0x0158EE": 5,
        "0x0158F8": 5,
        "0x0013DA": 2,
        "0x0013E4": 2,
        "0x001853": 3,
        "0x001872": 3,
        "0x001879": 3,
        "0x0018F8": 3,
        "0x005B96": 5,
        "0x00190B": 3,
        "0x005BB1": 3,
        "0x005C44": 3,
        "0x005C59": 3,
        "0x005C5E": 3,
        "0x005C6C": 3,
        "0x005C71": 3,
        "0x005C84": 3,
        "0x005C99": 3,
        "0x005CAE": 3,
        "0x005CC8": 3,
        "0x005CDB": 3,
        "0x005CEC": 3,
        "0x005CF1": 3,
        "0x005D0D": 3,
        "0x0061E3": 17,
        "0x0061E9": 32,
        "0x0061FD": 32,
        "0x006202": 32,
        "0x005D19": 3,
        "0x0061E5": 15,
        "0x005D27": 3,
        "0x005D35": 3,
        "0x005D43": 3,
        "0x005D54": 3,
        "0x005D6A": 3,
        "0x005D6F": 3,
        "0x005D7A": 3,
        "0x0060F7": 69,
        "0x0060FB": 69,
        "0x006114": 258,
        "0x00612F": 258,
        "0x00611D": 258,
        "0x006129": 519,
        "0x00612E": 519,
        "0x006118": 261,
        "0x006133": 261,
        "0x00613E": 261,
        "0x006145": 261,
        "0x00611C": 261,
        "0x005D80": 3,
        "0x005D86": 3,
        "0x005D8C": 3,
        "0x0060FA": 189,
        "0x005D92": 3,
        "0x005D98": 3,
        "0x005D9E": 3,
        "0x005DA4": 3,
        "0x005DA9": 3,
        "0x005DAE": 3,
        "0x005DB4": 3,
        "0x005DBA": 3,
        "0x005DC0": 3,
        "0x005DC6": 3,
        "0x005DCC": 3,
        "0x005DD2": 3,
        "0x005DD8": 3,
        "0x005DDE": 3,
        "0x005DE4": 3,
        "0x005DEA": 3,
        "0x005DF0": 3,
        "0x005DF6": 3,
        "0x005DFC": 3,
        "0x005E02": 3,
        "0x005E08": 3,
        "0x005E0E": 3,
        "0x005E14": 3,
        "0x005E1A": 3,
        "0x005E20": 3,
        "0x005E26": 3,
        "0x005E2C": 3,
        "0x005E32": 3,
        "0x005E38": 3,
        "0x005E3E": 3,
        "0x005E44": 3,
        "0x005E4A": 3,
        "0x005E50": 3,
        "0x005E56": 3,
        "0x005E5C": 3,
        "0x005E62": 3,
        "0x005E68": 3,
        "0x005E6E": 3,
        "0x005E74": 3,
        "0x006147": 3,
        "0x006156": 3,
        "0x00615B": 3,
        "0x00617D": 3,
        "0x00618B": 3,
        "0x006196": 3,
        "0x00619B": 3,
        "0x00619F": 3,
        "0x005E7A": 3,
        "0x005E80": 3,
        "0x005E86": 3,
        "0x005E8C": 3,
        "0x005E92": 3,
        "0x005E98": 3,
        "0x005E9E": 3,
        "0x005EA4": 3,
        "0x005EAA": 3,
        "0x005EB0": 3,
        "0x005EB6": 3,
        "0x005EBC": 3,
        "0x005EC2": 3,
        "0x005EC8": 3,
        "0x005ECE": 3,
        "0x005ED4": 3,
        "0x005EDA": 3,
        "0x005EE0": 3,
        "0x005EE6": 3,
        "0x005EEC": 3,
        "0x005EF2": 3,
        "0x005EF8": 3,
        "0x005EFE": 3,
        "0x005F04": 3,
        "0x005F0A": 3,
        "0x005F10": 3,
        "0x005F16": 3,
        "0x005F1C": 3,
        "0x005F22": 3,
        "0x005F28": 3,
        "0x005F2E": 3,
        "0x005F34": 3,
        "0x005F3A": 3,
        "0x005F40": 3,
        "0x005F46": 3,
        "0x005F4C": 3,
        "0x005F52": 3,
        "0x005F58": 3,
        "0x005F5E": 3,
        "0x005F64": 3,
        "0x005F6A": 3,
        "0x005F70": 3,
        "0x005F76": 3,
        "0x005F7C": 3,
        "0x005F82": 3,
        "0x005F88": 3,
        "0x006094": 3,
        "0x00609A": 3,
        "0x0060A8": 3,
        "0x0060AD": 3,
        "0x0060AF": 93,
        "0x0060B1": 3,
        "0x0060B3": 765,
        "0x0060B5": 3,
        "0x0060C7": 3,
        "0x0060D8": 3,
        "0x0060E5": 3,
        "0x0060EA": 3,
        "0x0060F6": 3,
        "0x00190F": 3,
        "0x0013E8": 2,
        "0x0013F0": 2,
        "0x003B05": 2,
        "0x003B19": 2,
        "0x003B2A": 2,
        "0x003C4B": 2,
        "0x003B45": 2,
        "0x003B47": 2,
        "0x003B5D": 2,
        "0x003B86": 2,
        "0x003B9C": 2,
        "0x003BB0": 2,
        "0x003BB8": 2,
        "0x003BC9": 2,
        "0x003BD1": 2,
        "0x003BE4": 2,
        "0x003BEC": 2,
        "0x003BF5": 2,
        "0x003BFD": 2,
        "0x003C0E": 2,
        "0x003C16": 2,
        "0x003C1F": 2,
        "0x003C27": 2,
        "0x003C42": 2,
        "0x003B0D": 2,
        "0x003B17": 2,
        "0x0013F4": 2,
        "0x0013F8": 2,
        "0x0028D1": 2,
        "0x0013FC": 2,
        "0x001405": 2,
        "0x003CBC": 2,
        "0x003CC6": 2,
        "0x001409": 2,
        "0x001424": 2,
        "0x001428": 2,
        "0x00142C": 2,
        "0x000721": 2,
        "0x013D00": 2,
        "0x005BA6": 2,
        "0x013D11": 2,
        "0x0059C6": 482,
        "0x0059D6": 482,
        "0x005A75": 482,
        "0x005A82": 482,
        "0x00596E": 482,
        "0x005974": 482,
        "0x005998": 482,
        "0x005A8B": 482,
        "0x005A48": 482,
        "0x005A96": 482,
        "0x005AA2": 482,
        "0x005AAE": 482,
        "0x005AE8": 7704,
        "0x005B16": 7704,
        "0x005B4B": 7704,
        "0x005AB6": 7222,
        "0x005B92": 481,
        "0x005A19": 481,
        "0x0059DA": 481,
        "0x0059E6": 481,
        "0x013D1D": 28,
        "0x013D19": 26,
        "0x013D1F": 2,
        "0x0059E9": 20,
        "0x0059F3": 318,
        "0x0059F7": 318,
        "0x0059ED": 318,
        "0x0059FE": 20,
        "0x013D32": 10,
        "0x013D29": 8,
        "0x005A60": 16,
        "0x013D35": 2,
        "0x013D87": 2,
        "0x013D8D": 2,
        "0x000725": 2,
        "0x00072D": 2,
        "0x0138F1": 2,
        "0x0138F9": 2,
        "0x013918": 2,
        "0x013927": 2,
        "0x01394E": 2,
        "0x01395B": 2,
        "0x006447": 2,
        "0x00646C": 2,
        "0x006475": 2,
        "0x006479": 2,
        "0x00647D": 2,
        "0x0017DD": 10,
        "0x0017FC": 10,
        "0x006486": 2,
        "0x001CC4": 2,
        "0x00649B": 2,
        "0x00649D": 2,
        "0x0064BE": 2,
        "0x006C8E": 2,
        "0x006C9C": 2,
        "0x006CA1": 2,
        "0x006CB2": 2,
        "0x006CB7": 2,
        "0x0064C7": 2,
        "0x0064D0": 2,
        "0x006CC6": 10,
        "0x006D5D": 20176,
        "0x006D64": 20176,
        "0x006CDF": 20166,
        "0x006CF7": 20156,
        "0x006D0F": 20166,
        "0x006D38": 20160,
        "0x006D4F": 20160,
        "0x006CF4": 10,
        "0x006D68": 10,
        "0x0064DE": 2,
        "0x0064EE": 2,
        "0x006512": 2,
        "0x00651C": 2,
        "0x006D6D": 2,
        "0x006DA0": 4,
        "0x006DB2": 2,
        "0x006DCB": 2,
        "0x006DDF": 2,
        "0x006DED": 2,
        "0x006DFE": 2,
        "0x006E1A": 2,
        "0x006E1F": 2,
        "0x006523": 2,
        "0x00652C": 2,
        "0x006533": 2,
        "0x00653B": 2,
        "0x00653D": 2,
        "0x006541": 2,
        "0x00654E": 2,
        "0x00655D": 2,
        "0x00640B": 2,
        "0x0067E9": 2,
        "0x00641C": 2,
        "0x00641E": 2,
        "0x0062EA": 2,
        "0x00098B": 2,
        "0x00096C": 10,
        "0x000984": 10,
        "0x0009BE": 2,
        "0x0009C9": 2,
        "0x0009D4": 4,
        "0x000A2E": 6,
        "0x000A5D": 6,
        "0x000A72": 6,
        "0x000AC5": 768,
        "0x000AD9": 268,
        "0x000AEE": 762,
        "0x000A79": 762,
        "0x000AFD": 6,
        "0x000B19": 6,
        "0x000B60": 514,
        "0x000B7C": 6170,
        "0x000B81": 6170,
        "0x000B72": 7710,
        "0x000B83": 514,
        "0x000BCB": 518,
        "0x000C80": 516,
        "0x000C8D": 6,
        "0x000CA0": 198,
        "0x000CA4": 6,
        "0x0009E8": 4,
        "0x0009F3": 4,
        "0x0009F9": 2,
        "0x000A92": 65024,
        "0x000ACE": 500,
        "0x000B37": 512,
        "0x000B7F": 2054,
        "0x000BD3": 508,
        "0x000BFE": 64516,
        "0x000C4A": 508,
        "0x000BC1": 242,
        "0x000BC3": 242,
        "0x000BBC": 242,
        "0x000B5A": 4,
        "0x000B88": 4,
        "0x000A0A": 2,
        "0x000A15": 2,
        "0x000A24": 2,
        "0x0009CE": 2,
        "0x000C64": 2,
        "0x000C75": 254,
        "0x000C7C": 2,
        "0x000C99": 192,
        "0x000A26": 2,
        "0x006318": 2,
        "0x00632E": 2,
        "0x00633C": 2,
        "0x00634F": 2,
        "0x006364": 2,
        "0x00642F": 2,
        "0x00643B": 2,
        "0x006442": 2,
        "0x006561": 2,
        "0x006567": 2,
        "0x00656E": 2,
        "0x006585": 2,
        "0x013968": 2,
        "0x013971": 2,
        "0x013993": 2,
        "0x01399C": 2,
        "0x0139A3": 2,
        "0x013ADD": 2,
        "0x013AF7": 2,
        "0x013B06": 2,
        "0x013B2D": 2,
        "0x013B3A": 2,
        "0x0068D0": 2,
        "0x0138EC": 2,
        "0x0068DE": 2,
        "0x0068F3": 2,
        "0x000E3D": 65,
        "0x000E67": 65,
        "0x000E73": 65,
        "0x000E77": 65,
        "0x000E7F": 65,
        "0x000E94": 65,
        "0x000D7E": 67,
        "0x000DC2": 67,
        "0x000DCA": 67,
        "0x000D82": 67,
        "0x000DAE": 67,
        "0xD18C22": 65,
        "0x000E9D": 65,
        "0x0068FA": 2,
        "0x0068FF": 2,
        "0x006901": 2,
        "0x013B4D": 2,
        "0x013B54": 2,
        "0x013B76": 2,
        "0x013B7F": 2,
        "0x000731": 2,
        "0x000737": 2,
        "0x013D8E": 2,
        "0x013D9F": 2,
        "0x013DB6": 10,
        "0x013DAD": 8,
        "0x013DB9": 2,
        "0x013E1C": 2,
        "0x013E22": 2,
        "0x00073B": 2,
        "0x000741": 2,
        "0x00074E": 2,
        "0x00075D": 2,
        "0x000784": 2,
        "0x000791": 2,
        "0x000E01": 2,
        "0x000E0C": 63,
        "0x000E12": 63,
        "0x000E24": 63,
        "0x015856": 126,
        "0x015864": 103,
        "0x01586A": 125,
        "0x000E33": 63,
        "0x000E38": 63,
        "0x000E06": 62,
        "0x015862": 23,
        "0x000E3C": 1,
        "0x000799": 1,
        "0x00079E": 1,
        "0x0007C0": 1,
        "0x0007CE": 1,
        "0x0007DD": 1,
        "0x000804": 1,
        "0x000811": 1,
        "0x0008D9": 1,
        "0x0008F6": 1,
        "0x0008F8": 1,
        "0x0008FF": 1,
        "0x00090C": 3,
        "0x000904": 2,
        "0x000914": 1,
        "0x00091A": 1,
        "0x001D66": 1,
        "0x001C84": 1,
        "0x001C7C": 7,
        "0x001C95": 1,
        "0x001D77": 1,
        "0x001BFB": 1,
        "0x001C24": 2,
        "0x001C31": 2,
        "0x001C0E": 1,
        "0x001C10": 1,
        "0x001D7E": 1,
        "0x001D80": 1,
        "0x001D84": 1,
        "0x001D2F": 2,
        "0x001D37": 2,
        "0x001D5A": 2,
        "0xD18C41": 2,
        "0x001D63": 2,
        "0x001D8F": 1,
        "0x00092F": 1,
        "0x000932": 1,
        "0x001D94": 1,
        "0x001DAC": 1,
        "0x00093B": 1,
        "0x000945": 1,
        "0x00094B": 1,
        "0x000951": 1,
        "0x001DB1": 1,
        "0x001DC9": 7,
        "0x001DD0": 6,
        "0x001DC1": 6,
        "0x001DC5": 6,
        "0x001E63": 1,
        "0x000963": 1,
        "0x00081E": 1,
        "0x000831": 1,
        "0x000836": 1,
        "0x00083B": 1,
        "0x00085D": 1,
        "0x000862": 1,
        "0x0019B5": 1,
        "0x05C838": 2,
        "0x05C83E": 2,
        "0x05C842": 2,
        "0x05C849": 2,
        "0x0A17AF": 2,
        "0x0A1842": 2,
        "0x0A19CC": 32,
        "0x02B016": 1
      },
      "topHotBlocks": [
        {
          "pc": "0x000A92",
          "count": 65024
        },
        {
          "pc": "0x000BFE",
          "count": 64516
        },
        {
          "pc": "0x09EFDE",
          "count": 33600
        },
        {
          "pc": "0x0021C2",
          "count": 20188
        },
        {
          "pc": "0x006D5D",
          "count": 20176
        },
        {
          "pc": "0x006D64",
          "count": 20176
        },
        {
          "pc": "0x006CDF",
          "count": 20166
        },
        {
          "pc": "0x006D0F",
          "count": 20166
        },
        {
          "pc": "0x006D38",
          "count": 20160
        },
        {
          "pc": "0x006D4F",
          "count": 20160
        },
        {
          "pc": "0x006CF7",
          "count": 20156
        },
        {
          "pc": "0x026815",
          "count": 8400
        },
        {
          "pc": "0x02681A",
          "count": 8400
        },
        {
          "pc": "0x026823",
          "count": 8400
        },
        {
          "pc": "0x026810",
          "count": 8190
        },
        {
          "pc": "0x000B72",
          "count": 7710
        },
        {
          "pc": "0x005AE8",
          "count": 7704
        },
        {
          "pc": "0x005B16",
          "count": 7704
        },
        {
          "pc": "0x005B4B",
          "count": 7704
        },
        {
          "pc": "0x005AB6",
          "count": 7222
        },
        {
          "pc": "0x000B7C",
          "count": 6170
        },
        {
          "pc": "0x000B81",
          "count": 6170
        },
        {
          "pc": "0x000B7F",
          "count": 2054
        },
        {
          "pc": "0x0A19A4",
          "count": 784
        },
        {
          "pc": "0x000AC5",
          "count": 768
        },
        {
          "pc": "0x0060B3",
          "count": 765
        },
        {
          "pc": "0x000AEE",
          "count": 762
        },
        {
          "pc": "0x000A79",
          "count": 762
        },
        {
          "pc": "0x006129",
          "count": 519
        },
        {
          "pc": "0x00612E",
          "count": 519
        }
      ],
      "targetCounts": {
        "controlPreStop0A229D": 1,
        "owner0A31FD": 0,
        "ownerFallthrough0A3205": 0,
        "copySetup0A31B8": 0,
        "destructiveCopy0A31E2": 0,
        "postCopy0A31A2": 0,
        "spinLoop0A1854": 144,
        "cleanup0018F8": 3,
        "low006D64": 20176
      },
      "targetFirst": {
        "spinLoop0A1854": {
          "block": 412,
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 413,
            "sp": "0xD1A83F",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": 84,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8549,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        "controlPreStop0A229D": {
          "block": 73965,
          "pc": "0x0A229D",
          "prevPc": "0x0A2A37",
          "cpu": {
            "pc": "0x0A229D",
            "currentBlockPc": "0x0A229D",
            "stepCount": 73978,
            "sp": "0xD1A851",
            "af": "0x0A0C",
            "bc": "0x000018",
            "de": "0x00013F",
            "hl": "0x000104",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": 12,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ],
          "vram": 8549,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 2,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        "cleanup0018F8": {
          "block": 77345,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "stepCount": 77367,
            "sp": "0xD1A87B",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "ix": "0x000000",
            "iy": "0xD00080",
            "f": 0,
            "halted": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02504": "0x00",
            "D02505": "0x00",
            "D02506": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013E8"
            },
            {
              "addr": "0xD1A87E",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A881",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A884",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A887",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A88A",
              "value": "0x000000"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          }
        },
        "low006D64": {
          "block": 86654,
          "pc": "0x006D64",
          "prevPc": "0x0021C2",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "stepCount": 86676,
            "sp": "0xD1A82B",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02504": "0x00",
            "D02505": "0x00",
            "D02506": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x000000",
            "D00595": "0x04",
            "D00596": "0x13",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A82B",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A82E",
              "value": "0x020000"
            },
            {
              "addr": "0xD1A831",
              "value": "0xD1A866"
            },
            {
              "addr": "0xD1A834",
              "value": "0x0064DE"
            },
            {
              "addr": "0xD1A837",
              "value": "0x020000"
            },
            {
              "addr": "0xD1A83A",
              "value": "0x000100"
            }
          ],
          "vram": 3031,
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 3031,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          }
        }
      },
      "targetSamples": [
        {
          "target": "spinLoop0A1854",
          "block": 412,
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 413,
            "sp": "0xD1A83F",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": 84,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8549,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 445,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 446,
            "sp": "0xD1A83F",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": 26,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8549,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 478,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 479,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8549,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8549,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 511,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 512,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8559,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 10
            },
            "vramCurrent": 8559,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 544,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 545,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8569,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 20
            },
            "vramCurrent": 8569,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 577,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 578,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8579,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 30
            },
            "vramCurrent": 8579,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 610,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 611,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8589,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 40
            },
            "vramCurrent": 8589,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 643,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 644,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8599,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 50
            },
            "vramCurrent": 8599,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 676,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 677,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8609,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 60
            },
            "vramCurrent": 8609,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 709,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 710,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8619,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 70
            },
            "vramCurrent": 8619,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 742,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 743,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8629,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 80
            },
            "vramCurrent": 8629,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 775,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 776,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8639,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 90
            },
            "vramCurrent": 8639,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 808,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 809,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8649,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 100
            },
            "vramCurrent": 8649,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 841,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 842,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8659,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 110
            },
            "vramCurrent": 8659,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 874,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 875,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8669,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 120
            },
            "vramCurrent": 8669,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 907,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 908,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8679,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 130
            },
            "vramCurrent": 8679,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 985,
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 986,
            "sp": "0xD1A84B",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": 84,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1018,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1019,
            "sp": "0xD1A84B",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": 26,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1051,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1052,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1084,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1085,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8679,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 130
            },
            "vramCurrent": 8679,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1117,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1118,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8669,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 120
            },
            "vramCurrent": 8669,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1150,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1151,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8659,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 110
            },
            "vramCurrent": 8659,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1183,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1184,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8649,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 100
            },
            "vramCurrent": 8649,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1216,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1217,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8645,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 96
            },
            "vramCurrent": 8645,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1249,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1250,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8641,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 92
            },
            "vramCurrent": 8641,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1282,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1283,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8637,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 88
            },
            "vramCurrent": 8637,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1315,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1316,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8633,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 84
            },
            "vramCurrent": 8633,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1348,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1349,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8629,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 80
            },
            "vramCurrent": 8629,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1381,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1382,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8625,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 76
            },
            "vramCurrent": 8625,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1414,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1415,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8615,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 66
            },
            "vramCurrent": 8615,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1447,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1448,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8605,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 56
            },
            "vramCurrent": 8605,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 1480,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 1481,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2A815"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8595,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 46
            },
            "vramCurrent": 8595,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2378,
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2383,
            "sp": "0xD1A83F",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": 84,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8585,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2411,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2416,
            "sp": "0xD1A83F",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": 26,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8585,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2444,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2449,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8585,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8585,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2477,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2482,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8595,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 46
            },
            "vramCurrent": 8595,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2510,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2515,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8605,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 56
            },
            "vramCurrent": 8605,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2543,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2548,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8615,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 66
            },
            "vramCurrent": 8615,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2576,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2581,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8625,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 76
            },
            "vramCurrent": 8625,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2609,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2614,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8629,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 80
            },
            "vramCurrent": 8629,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2642,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2647,
            "sp": "0xD1A83F",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8633,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 84
            },
            "vramCurrent": 8633,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2675,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2680,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8637,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 88
            },
            "vramCurrent": 8637,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2708,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2713,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8641,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 92
            },
            "vramCurrent": 8641,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2741,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2746,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8645,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 96
            },
            "vramCurrent": 8645,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2774,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2779,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8649,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 100
            },
            "vramCurrent": 8649,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2807,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2812,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8659,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 110
            },
            "vramCurrent": 8659,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2840,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2845,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8669,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 120
            },
            "vramCurrent": 8669,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2873,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2878,
            "sp": "0xD1A83F",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x0F",
            "D0058E": "0x0F"
          },
          "stackTop": [
            {
              "addr": "0xD1A83F",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A842",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A845",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A848",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A84B",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x05C883"
            }
          ],
          "vram": 8679,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 130
            },
            "vramCurrent": 8679,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 2974,
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 2979,
            "sp": "0xD1A839",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": 84,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3007,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3012,
            "sp": "0xD1A839",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": 26,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3040,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3045,
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3073,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3078,
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3106,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3111,
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3139,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3144,
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3172,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3177,
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3205,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3210,
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3238,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3243,
            "sp": "0xD1A839",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3271,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3276,
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3304,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3309,
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3337,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3342,
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3370,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3375,
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3403,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3408,
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3436,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3441,
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3469,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3474,
            "sp": "0xD1A839",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x0F",
            "D0058C": "0x00",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A839",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A83C",
              "value": "0xD100CC"
            },
            {
              "addr": "0xD1A83F",
              "value": "0xD2A83E"
            },
            {
              "addr": "0xD1A842",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A845",
              "value": "0x00E044"
            },
            {
              "addr": "0xD1A848",
              "value": "0x05C883"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3821,
          "pc": "0x0A1854",
          "prevPc": "0x0A184A",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3828,
            "sp": "0xD1A84B",
            "af": "0x0054",
            "bc": "0xFF10FC",
            "de": "0xD031F6",
            "hl": "0xD0330E",
            "ix": "0xD005A1",
            "iy": "0xD00080",
            "f": 84,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3854,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3861,
            "sp": "0xD1A84B",
            "af": "0xFF1A",
            "bc": "0xFF0F05",
            "de": "0x000028",
            "hl": "0xD03336",
            "ix": "0xD005A3",
            "iy": "0xD00080",
            "f": 26,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3887,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3894,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0E05",
            "de": "0x000028",
            "hl": "0xD0335E",
            "ix": "0xD005A5",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8689,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8689,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3920,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3927,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0D05",
            "de": "0x000028",
            "hl": "0xD03386",
            "ix": "0xD005A7",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8679,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 130
            },
            "vramCurrent": 8679,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3953,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3960,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0C05",
            "de": "0x000028",
            "hl": "0xD033AE",
            "ix": "0xD005A9",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8669,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 120
            },
            "vramCurrent": 8669,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 3986,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 3993,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0B05",
            "de": "0x000028",
            "hl": "0xD033D6",
            "ix": "0xD005AB",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8659,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 110
            },
            "vramCurrent": 8659,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4019,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4026,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0A05",
            "de": "0x000028",
            "hl": "0xD033FE",
            "ix": "0xD005AD",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8649,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 100
            },
            "vramCurrent": 8649,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4052,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4059,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0905",
            "de": "0x000028",
            "hl": "0xD03426",
            "ix": "0xD005AF",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8645,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 96
            },
            "vramCurrent": 8645,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4085,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4092,
            "sp": "0xD1A84B",
            "af": "0xFF0A",
            "bc": "0xFF0805",
            "de": "0x000028",
            "hl": "0xD0344E",
            "ix": "0xD005B1",
            "iy": "0xD00080",
            "f": 10,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8641,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 92
            },
            "vramCurrent": 8641,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4118,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4125,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0705",
            "de": "0x000028",
            "hl": "0xD03476",
            "ix": "0xD005B3",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8637,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 88
            },
            "vramCurrent": 8637,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4151,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4158,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0605",
            "de": "0x000028",
            "hl": "0xD0349E",
            "ix": "0xD005B5",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8633,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 84
            },
            "vramCurrent": 8633,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4184,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4191,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x000028",
            "hl": "0xD034C6",
            "ix": "0xD005B7",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8629,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 80
            },
            "vramCurrent": 8629,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4217,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4224,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x000028",
            "hl": "0xD034EE",
            "ix": "0xD005B9",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8625,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 76
            },
            "vramCurrent": 8625,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4250,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4257,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x000028",
            "hl": "0xD03516",
            "ix": "0xD005BB",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8615,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 66
            },
            "vramCurrent": 8615,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4283,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4290,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x000028",
            "hl": "0xD0353E",
            "ix": "0xD005BD",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8605,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 56
            },
            "vramCurrent": 8605,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        },
        {
          "target": "spinLoop0A1854",
          "block": 4316,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "cpu": {
            "pc": "0x0A1854",
            "currentBlockPc": "0x0A1854",
            "stepCount": 4323,
            "sp": "0xD1A84B",
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x000028",
            "hl": "0xD03566",
            "ix": "0xD005BF",
            "iy": "0xD00080",
            "f": 2,
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02504": "0x00",
            "D02505": "0x0A",
            "D02506": "0x00",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x000000",
            "D00595": "0x00",
            "D00596": "0x00",
            "D00587": "0x00",
            "D0058C": "0x09",
            "D0058E": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD2003E"
            },
            {
              "addr": "0xD1A854",
              "value": "0x00E000"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000075"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x05C700"
            }
          ],
          "vram": 8595,
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 46
            },
            "vramCurrent": 8595,
            "lastKey": null
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          }
        }
      ],
      "lddrSamples": [],
      "originalLddr": null
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

