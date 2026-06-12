# Phase 618: D02A28 Consumer-Gate Hook

Probe: `probe-phase618-d02a28-gate-hook.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase618-d02a28-gate-hook.mjs`  
Exit: 0

## Summary

- ★★★★ Narrowly setting `D02A28=1` at the consumer side works: hooks at `0x08F5E1` and `0x090992` both cause `D001B8` and `D001D3` to change from `0x00` to `0x08`.
- ★★★ The output-buffer writes are transient. Both hooked runs later hit the structural wipe at `0x0018F8`, which clears `D001B8/D001D3` back to `0x00`.
- ★★ Hooking `0x09098E` did not fire in this block-level probe, even though `0x090992` fired. Treat `0x090992` and `0x08F5E1` as the useful integration points.
- ★★ Baseline still has natural `D02A28` inc/dec pairs and 175 gate tests, but no `D001B8/D001D3` writes.

## Results

| Variant | Termination | Steps | Gate hits | Output writes | Final buffers |
| --- | --- | ---: | ---: | ---: | --- |
| baseline | halt `0x0019B5` | 332,856 | `0x090992` x175 | 0 | `D001B8=0x00`, `D001D3=0x00` |
| hook `0x08F5E1` | halt `0x0019B5` | 331,507 | `0x090992` x175 | 2 | final zeroed |
| hook `0x09098E` | halt `0x0019B5` | 332,856 | `0x090992` x175 | 0 | final zeroed |
| hook `0x090992` | halt `0x0019B5` | 334,128 | `0x090992` x186 | 2 | final zeroed |

The successful writes were identical:

```text
hook 0x08F5E1:
  block=40855 pc=0x08F5DD D001B8 0x00->0x08 D001D3 0x00->0x08 gate=0x01
  block=139498 pc=0x0018F8 D001B8 0x08->0x00 D001D3 0x08->0x00 gate=0x00

hook 0x090992:
  block=46857 pc=0x08F5DD D001B8 0x00->0x08 D001D3 0x00->0x08 gate=0x01
  block=142090 pc=0x0018F8 D001B8 0x08->0x00 D001D3 0x08->0x00 gate=0x00
```

## Interpretation

The D02A28 gate model is confirmed: the token-output path can write the display buffers when `D02A28` is live at the consumer. The remaining problem is persistence, not reaching the output path. The same cleanup/wipe machinery that clears final VRAM also clears these display buffers after the successful write.

This suggests the browser/runtime integration should either:

- hook `D02A28=1` at `0x08F5E1` or `0x090992` and snapshot `D001B8/D001D3` before the later wipe, or
- restore the display buffers together with the existing VRAM snapshot/restore path after key processing halts.

`0x09098E` is not a reliable onBlock hook address in the current lifted block structure; the containing block likely starts earlier and flows through it internally.
