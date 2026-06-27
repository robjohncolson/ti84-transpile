# Phase 857: Browser-Shell D02505 Snapshot Patch

Probe: `probe-browser-shell-replay-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-browser-shell-replay-verify.mjs`

## Summary

- Result: PASS. The real `browser-shell.html` boots coldboot, captures the stable Phase 5 snapshot, replays it before Phase 6, and Phase 6 halts cleanly.
- Patch: the browser-owned Phase 5 replay contract now uses explicit field widths and carries `D02505` as exactly one byte.
- Existing VAT/context fields remain 24-bit fields. The new `D02505` entry does not carry `D02504` or `D02506`.
- Required replay gate passed after the edit: Phase 6 halt at `0x0019B5`, `49474` steps, `8549` VRAM pixels, `vatSnapshotCaptured=true`, page errors `[]`.
- GitNexus pre-edit check: inline `initializeColdbootRuntime` was not indexed as a symbol; file-level upstream impact for `TI-84_Plus_CE/browser-shell.html` was LOW with 0 direct callers, 0 affected processes, and 0 affected modules.

## Changed Contract

The previous replay list implicitly treated every field as 24-bit:

```js
const COLDBOOT_VAT_FIELDS = [
  0xD007CA, 0xD008E0, 0xD02587, ...
];
```

Phase857 replaces that with width-aware descriptors:

```js
const COLDBOOT_STABLE_REPLAY_FIELDS = [
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02505', 0xD02505, 1],
  ...
];
```

Read/restore helpers now dispatch 1-byte fields through direct memory access and 3-byte fields through the existing `evalRead24` / `evalWrite24` helpers.

## Verification JSON

```json
{
  "probe": "browser-shell-replay-verify",
  "pass": true,
  "phase6": {
    "steps": 49474,
    "termination": "halt",
    "lastPc": 6581,
    "vram": 8549,
    "vatSnapshotCaptured": true
  },
  "errors": []
}
```

No runtime, transpiler, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.
