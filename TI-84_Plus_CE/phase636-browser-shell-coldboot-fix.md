# Phase 636 - Browser Shell Coldboot Fix

## Summary

- Fixed `browser-shell.html` coldboot initialization to stop using the old `0x003A73` seed and instead run the proven warm-idle -> launch-home -> repaint setup path.
- Stopped coldboot from auto-starting AutoRun before the page has a stable "Coldboot complete" status.
- Exposed `countVRAMPixels()` on `window` so the existing headless browser harness can read the module-script diagnostic helper.

## Validation

### Runtime Browser Harness

Command:

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase626-browser-shell-interactive.mjs
```

Result: exit 0.

Key output:

- `persisted: true`
- `errors: []`
- before keypress: `vramPixels=3031`, `canvasNonWhite=3031`
- key `2`: `300000` steps, peak `3349px`, final `vramPixels=3040`
- key `3`: `300000` steps, peak `3349px`, final `vramPixels=3040`
- key `+`: `300000` steps, peak `3349px`, final `vramPixels=3040`

### Phase 636 Static Sanity Probe

Command:

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase636-browser-shell-coldboot-fix.mjs
```

Result: exit 0.

All checks passed:

- `COLDBOOT_EVENT_LOOP_ENTRY` is `0x08C331`
- coldboot init includes warm idle `0x0019BE`
- coldboot init includes launch-home `0x09DD62`
- coldboot init includes repaint `0x058241`
- `initializeColdbootRuntime()` no longer calls `startAutoRunLoop()`
- coldboot AutoRun stops after one frame
- preserve-display key bursts call `prepareColdbootEventFrame()`
- `window.countVRAMPixels = countVRAMPixels`

## Findings

1. ★★★★ Browser coldboot is no longer blocked on the old AutoRun/`0x003A73` path. The phase626 browser harness now reaches coldboot completion, performs the AutoRun click, and processes three key events with Preserve Display checked.
2. ★★★ Preserve Display is effective in the browser harness: all three tested keys finish with `3040` non-white VRAM pixels and no page errors.
3. ★★ Residual caveat: browser coldboot logs still show the repaint phase reaching its `300000` step cap at `0x084711`, with `D007CA=0x0585e9`, `VRAM=8549px`, and `VAT=0x000000` in the browser log line. The harness passes because the later key bursts capture/restore the VRAM peak, but this is not yet a fully clean home repaint halt.

## Files Changed

- `TI-84_Plus_CE/browser-shell.html`
- `TI-84_Plus_CE/probe-phase636-browser-shell-coldboot-fix.mjs`
- `TI-84_Plus_CE/phase636-browser-shell-coldboot-fix.md`

Golden regression was not run in-session because no runtime or transpiler files were changed.
