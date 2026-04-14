# Phase 116 - Home Screen PNG Regeneration

## Probe Update

- `probe-phase102b-vram-to-png.mjs` did not already include the Phase 112 workspace fill.
- Added a `fillWorkspaceWhite(mem)` pass for rows `75-219` after the history-area render and before the existing entry-line white fill.

## Probe Output

Ran:

```bash
node probe-phase102b-vram-to-png.mjs
```

Probe output:

- `Loaded ROM (124556 blocks, 16.5083% coverage).`
- `PNG encoder: built-in fallback`
- `Stage steps: coldBoot=3062 osInit=691 postInit=1 statusBarBackground=20897 statusDots=107 homeRow=20973 historyArea=50000`
- `Wrote C:\Users\rober\Downloads\Projects\school\follow-alongs\TI-84_Plus_CE\home-screen-render.png`
- `Dimensions: 320x240`
- `Non-sentinel pixels: 75196/76800`
- `File size: 1618 bytes`

## Result

- Regenerated `home-screen-render.png` from the updated probe.
- The probe now explicitly white-fills rows `75-219`, so the exported PNG uses a white workspace instead of leaving that region at the `0xAA` sentinel color.
