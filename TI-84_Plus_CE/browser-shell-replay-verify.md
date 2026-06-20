# Browser-Shell VAT Replay (Integrated) — Regression Verify

Probe: `probe-browser-shell-replay-verify.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-browser-shell-replay-verify.mjs`

Serves the **real, unmodified** `browser-shell.html` and verifies the VAT
capture/replay fix (now built into the shell) makes the coldboot Phase 6
repaint halt cleanly instead of running away in the `0x084711` VAT search.

## Result

- Overall: **PASS**
- Phase 6: halt after 49474 steps at 0x0019B5; VRAM=8549px; snapshot captured=true.
- Page errors: []

## Full JSON

```json
{
  "probe": "browser-shell-replay-verify",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:54678/browser-shell.html",
  "pass": true,
  "phase6": {
    "steps": 49474,
    "termination": "halt",
    "lastPc": 6581,
    "vram": 8549,
    "vatSnapshotCaptured": true
  },
  "vram": 8549,
  "errors": [],
  "status": "Coldboot complete. OS event loop is ready."
}
```

