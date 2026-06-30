# Phase 890: Browser Owner-Stop Source Audit

Probe: `probe-phase890-owner-stop-source-audit.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase890-owner-stop-source-audit.mjs`

Serves the real, unmodified `browser-shell.html`, runs the coldboot browser path in headless Chrome, and audits the exposed `window.__coldbootPhase6.naturalD0301BOwner` result.

## Result

- Overall: **PASS**.
- Phase 6: halt after 47298 steps at 0x0019B5; VRAM=8482; snapshot captured=true.
- Natural D0301B owner: stopped_before_target after 39171 steps at 0x09DEE0; D0301B 0x000000 -> 0x5AA55A.
- Old cap avoided: yes (not max_steps, not 60000 steps, not 0x04C8A3).
- Page errors: [].

## Source Evidence

- Source file SHA-256: `0c0c917f5ae2d6d482e2b4357a61c711c49fd4ff742cd42e600b5b66dc745584`
- Stop-before marker present: yes.
- Stop hook present: yes.
- 60K max-step guard still present as a guardrail: yes.

## Checks

| Check | Actual | Expected | Pass |
| --- | --- | --- | --- |
| source has owner entry constant | true | true | yes |
| source has stop-before constant | true | true | yes |
| source has stop sentinel | true | true | yes |
| source has stop hook | true | true | yes |
| source has synthetic stop result | true | true | yes |
| phase6 termination | halt | halt | yes |
| phase6 lastPc | 0x0019B5 | 0x0019B5 | yes |
| phase6 vram | 0x2122 | 0x2122 | yes |
| phase6 vatSnapshotCaptured | true | true | yes |
| owner entry | 0x0454BE | 0x0454BE | yes |
| owner termination | stopped_before_target | stopped_before_target | yes |
| owner lastPc | 0x09DEE0 | 0x09DEE0 | yes |
| owner steps | 0x09903 | 0x09903 | yes |
| owner beforeD0301B | 0x000000 | 0x000000 | yes |
| owner afterD0301B | 0x5AA55A | 0x5AA55A | yes |
| page errors empty | 0 | 0 | yes |
| old 60K cap not hit | true | true | yes |
| old cap termination not hit | true | true | yes |
| old cap PC not hit | true | true | yes |

## Machine JSON

```json
{
  "probe": "phase890-owner-stop-source-audit",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:53275/browser-shell.html",
  "pass": true,
  "oldCapAvoided": true,
  "sourceEvidence": {
    "file": "browser-shell.html",
    "sha256": "0c0c917f5ae2d6d482e2b4357a61c711c49fd4ff742cd42e600b5b66dc745584",
    "hasOwnerEntry": true,
    "hasStopBeforeConstant": true,
    "hasStopSentinel": true,
    "hasStopHook": true,
    "hasSyntheticStopResult": true,
    "hasOldCapGuard": true
  },
  "checks": [
    {
      "name": "source has owner entry constant",
      "actual": true,
      "expected": true,
      "pass": true
    },
    {
      "name": "source has stop-before constant",
      "actual": true,
      "expected": true,
      "pass": true
    },
    {
      "name": "source has stop sentinel",
      "actual": true,
      "expected": true,
      "pass": true
    },
    {
      "name": "source has stop hook",
      "actual": true,
      "expected": true,
      "pass": true
    },
    {
      "name": "source has synthetic stop result",
      "actual": true,
      "expected": true,
      "pass": true
    },
    {
      "name": "phase6 termination",
      "actual": "halt",
      "expected": "halt",
      "pass": true
    },
    {
      "name": "phase6 lastPc",
      "actual": "0x0019B5",
      "expected": "0x0019B5",
      "pass": true
    },
    {
      "name": "phase6 vram",
      "actual": "0x2122",
      "expected": "0x2122",
      "pass": true
    },
    {
      "name": "phase6 vatSnapshotCaptured",
      "actual": true,
      "expected": true,
      "pass": true
    },
    {
      "name": "owner entry",
      "actual": "0x0454BE",
      "expected": "0x0454BE",
      "pass": true
    },
    {
      "name": "owner termination",
      "actual": "stopped_before_target",
      "expected": "stopped_before_target",
      "pass": true
    },
    {
      "name": "owner lastPc",
      "actual": "0x09DEE0",
      "expected": "0x09DEE0",
      "pass": true
    },
    {
      "name": "owner steps",
      "actual": "0x09903",
      "expected": "0x09903",
      "pass": true
    },
    {
      "name": "owner beforeD0301B",
      "actual": "0x000000",
      "expected": "0x000000",
      "pass": true
    },
    {
      "name": "owner afterD0301B",
      "actual": "0x5AA55A",
      "expected": "0x5AA55A",
      "pass": true
    },
    {
      "name": "page errors empty",
      "actual": 0,
      "expected": 0,
      "pass": true
    },
    {
      "name": "old 60K cap not hit",
      "actual": true,
      "expected": true,
      "pass": true
    },
    {
      "name": "old cap termination not hit",
      "actual": true,
      "expected": true,
      "pass": true
    },
    {
      "name": "old cap PC not hit",
      "actual": true,
      "expected": true,
      "pass": true
    }
  ],
  "state": {
    "phase6": {
      "steps": 47298,
      "termination": "halt",
      "lastPc": 6581,
      "vram": 8482,
      "vatSnapshotCaptured": true,
      "naturalD0301BOwner": {
        "entry": 283838,
        "steps": 39171,
        "termination": "stopped_before_target",
        "lastPc": 646880,
        "beforeD0301B": 0,
        "afterD0301B": 5940570
      }
    },
    "owner": {
      "entry": 283838,
      "steps": 39171,
      "termination": "stopped_before_target",
      "lastPc": 646880,
      "beforeD0301B": 0,
      "afterD0301B": 5940570
    },
    "vram": 8482,
    "errors": [],
    "status": "Coldboot complete. OS event loop is ready."
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

