# Phase 619: Token Buffer Persistence

Probe: `probe-phase619-token-buffer-persist.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase619-token-buffer-persist.mjs`  
Exit: 0

## Summary

- ★★★★ The session-618 D02A28 consumer hook can be made persistent by snapshotting `D001B8/D001D3` when they become nonzero and restoring the snapshot after the structural cleanup.
- ★★★ Baseline with the same `0x08F5E1` hook remains transient: `D001B8/D001D3` become `0x08/0x08` at block 40,855, then the later `0x0018F8` cleanup clears them back to zero.
- ★★★ The post-halt restore variant preserves the token output bytes: final `D001B8=0x08`, `D001D3=0x08`.

## Results

| Variant | Steps | Hook hits | Wipes | Snapshot | Before restore | Final |
| --- | ---: | ---: | ---: | --- | --- | --- |
| baseline hook, no restore | 331,507 | 2 | 2 | block 40,855, pc `0x08F5DD`, `0x08/0x08` | `0x00/0x00` | `0x00/0x00` |
| hook + post-halt restore | 331,507 | 2 | 2 | block 40,855, pc `0x08F5DD`, `0x08/0x08` | `0x00/0x00` | `0x08/0x08` |

The same two observed buffer transitions occurred in both variants:

```text
block=40855 pc=0x08F5DD D001B8 0x00->0x08 D001D3 0x00->0x08 gate=0x01
block=139498 pc=0x0018F8 D001B8 0x08->0x00 D001D3 0x08->0x00 gate=0x00
```

## Interpretation

The token-output path is not blocked once `D02A28` is live at the consumer gate. The remaining issue is identical to the VRAM display lifecycle: the OS produces useful transient output, then cleanup clears the observable state before halt.

For browser integration, the practical recipe is:

1. set `D02A28=1` at `0x08F5E1` or `0x090992`;
2. snapshot `D001B8/D001D3` when either buffer becomes nonzero;
3. restore those buffers together with the existing post-key VRAM snapshot after the key run halts.
