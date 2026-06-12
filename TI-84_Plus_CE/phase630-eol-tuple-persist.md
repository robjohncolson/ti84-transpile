# Phase 630: EOL Tuple Persistence

Probe: `probe-phase630-eol-tuple-persist.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase630-eol-tuple-persist.mjs`  
Exit: 0

## Summary

- **** Baseline EOL still reaches `0x08F54B` 2 times and halts cleanly, but the final tuple is cleared: `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D01150=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00`.
- **** Persist hook captures the latest EOL tuple at `0x08F54B` and restores it at HALT after 2 cleanup hits; final tuple survives: `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00`.
- *** The surviving tuple is the second natural save from phase629: `D02A29=0x0212`, `D02A2B=0x0006`, `D02A1B=0x0013`, `D0243D=0xD2A814`, `D02A40=0xD1A91A`.
- ** This proves EOL tuple persistence can be layered onto the existing post-cleanup display/token-buffer preservation path without runtime or transpiler changes.

## Case Results

| Case | Termination | Steps | Last PC | 0x08F54B hits | 0x0018F8 hits | Restored at halt | Final has signal |
|---|---|---:|---|---:|---:|---|---|
| baseline | halt | 316825 | 0x0019B5 | 2 | 2 | no | no |
| persisted | halt | 316825 | 0x0019B5 | 2 | 2 | yes | yes |

## Captured Tuples

| Case | Hit | Block | Tuple |
|---|---:|---:|---|
| baseline | 1 | 26057 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| baseline | 2 | 30871 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |
| persisted | 1 | 26057 | `D02A29=0x00D8 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A901 D02A28=0x00` |
| persisted | 2 | 30871 | `D02A29=0x0212 D02A2B=0x0006 D02A1B=0x0013 D0059A=0x02 D01150=0x3700 D0243D=0xD2A814 D02A40=0xD1A91A D02A28=0x00` |

## Interpretation

The EOL tuple is valid before cleanup and zeroed at halt in the baseline path. Restoring only the captured tuple fields at the final halt boundary preserves the tuple exactly, which is enough to prove the persistence mechanism. A production browser-shell integration should apply this after the OS cleanup phase, alongside the already-proven VRAM and token-buffer persistence hooks.

No runtime, transpiler, or browser files were changed.
