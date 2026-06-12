# Phase 634: EOL Tuple Early Restore

Probe: `probe-phase634-eol-tuple-early-restore.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase634-eol-tuple-early-restore.mjs`  
Exit: 0

## Summary

- *** Baseline confirms the phase630 lifecycle: EOL hits `0x08F54B` 2 times and cleanup `0x0018F8` 2 times, then halts with a cleared tuple: `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D01150=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00`.
- **** Restoring on the first block boundary after the second `0x0018F8` cleanup entry succeeds. Restore occurred at block 314978 / PC 0x005B96, and the final halt tuple survives: `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00`.
- *** HALT restore remains a control and produces the same surviving tuple: `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00`.
- *** Practical implication: the earliest proven safe integration point is immediately after the final cleanup entry returns to the next lifted block, not only at the HALT boundary. Browser-shell tuple persistence can restore before final idle if it can identify the final cleanup pass.

## Case Results

| Case | Termination | Steps | Last PC | 0x08F54B hits | 0x0018F8 hits | Restore events | Final has signal |
|---|---|---:|---|---:|---:|---:|---|
| baseline | halt | 316825 | 0x0019B5 | 2 | 2 | 0 | no |
| afterSecondWipe | halt | 316825 | 0x0019B5 | 2 | 2 | 1 | yes |
| atHalt | halt | 316825 | 0x0019B5 | 2 | 2 | 1 | yes |

## Restore Events

| Case | Block | PC | Tuple After Restore |
|---|---:|---|---|
| afterSecondWipe | 314978 | 0x005B96 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| atHalt | 316561 | 0x0019B5 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |

## Captured Natural Tuples

| Hit | Block | Tuple |
|---:|---:|---|
| 1 | 26057 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| 2 | 30871 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |

## Interpretation

The final `0x0018F8` cleanup entry is followed by a lifted block boundary before HALT. Restoring the last natural EOL tuple at that first post-cleanup boundary preserves it through the rest of the OS path. That makes the integration point less late than phase630 proved: a display-preserve hook does not need to wait for HALT as long as it restores after the final cleanup pass, not before it.

No runtime, transpiler, or browser files were changed.
