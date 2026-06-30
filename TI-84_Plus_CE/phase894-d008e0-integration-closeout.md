# Phase 894: D008E0 Integration Status Closeout

Probe: `probe-phase894-d008e0-integration-closeout.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase894-d008e0-integration-closeout.mjs`

This is a source/evidence audit, not a browser execution probe. It parses the Phase892 and Phase893 machine JSON, checks the current `browser-shell.html` integration state, and records the D008E0 integration decision without changing browser source.

## Result

- Overall: **PASS**.
- Source SHA-256: `0c0c917f5ae2d6d482e2b4357a61c711c49fd4ff742cd42e600b5b66dc745584`.
- Current helper field write present: yes.
- Current raw errSP stack packet source writes present: no.
- Phase892 natural oracle D008E0 writes: 0.
- Phase893 no-helper mismatch: D008E0.
- Phase893 stack packet load-bearing: no.

## Decision

- Keep `prepareColdbootEventFrame()` writing `D008E0 = SCREEN_STACK_TOP - 18` (`0xD1A86C`). Phase893 proved that suppressing only this helper write leaves final `D008E0=0x000000` while the after-CLEAR oracle requires `0xD1A86C`.
- Do not add the raw errSP stack packet (`061E27`, `061DD1`, zeros, `08C754`) as an autonomous browser patch. Phase893 proved it changes only the stack bytes in the bounded CLEAR route, not Phase6/CLEAR termination, page errors, watched fields, or UI-clear behavior.
- Close the D008E0 integration frontier as helper-field-only accepted. The raw stack packet remains diagnostic context for future error-longjmp work, not current browser-demo work.

## Evidence Checks

| Check | Status | Detail |
| --- | --- | --- |
| Phase892 passed | PASS | prior lifetime trace machine JSON reports pass=true |
| No natural post-wipe oracle D008E0 owner | PASS | naturalOracleD008E0Writes=0 |
| Helper writes oracle D008E0 twice | PASS | helperOracleD008E0Writes=2 |
| Live raw errSP stack does not naturally match oracle | PASS | keyStackMatchesOracle=false |
| Phase893 passed | PASS | field/stack A/B machine JSON reports pass=true |
| Current source has helper oracle field write | PASS | prepareColdbootEventFrame writes D008E0 = SCREEN_STACK_TOP - 18 |
| Current source has no raw oracle stack packet writes | PASS | no direct evalWrite24 source writes for the six raw errSP stack slots |
| Baseline route is clean | PASS | Phase893 baseline field-only route has no watched-field mismatches |
| No-helper route isolates D008E0 mismatch | PASS | mismatches=D008E0 |
| Raw stack packet is not load-bearing | PASS | stackPacketLoadBearing=false |
| Field-plus-stack remains clean | PASS | injected stack packet matches stack oracle but changes no bounded behavior |

## Phase893 Variant Summary

| Variant | Clean | Final D008E0 | Field mismatches | Stack mismatches |
| --- | --- | --- | --- | --- |
| baseline | yes | 0xD1A86C | 0 | 6 |
| no_prepare_d008e0 | yes | 0x000000 | 1 | 6 |
| field_plus_stack | yes | 0xD1A86C | 0 | 0 |

## Machine JSON

```json
{
  "probe": "phase894-d008e0-integration-closeout",
  "pass": true,
  "source": {
    "sha256": "0c0c917f5ae2d6d482e2b4357a61c711c49fd4ff742cd42e600b5b66dc745584",
    "hasPrepareOracleWrite": true,
    "hasRawStackPacketWrites": false,
    "oracleD008E0": "0xD1A86C"
  },
  "phase892": {
    "naturalOracleD008E0Writes": 0,
    "helperOracleD008E0Writes": 2,
    "stableReplayD008E0Writes": 1,
    "keyStackMatchesOracle": false
  },
  "phase893": {
    "baselineClean": true,
    "noHelperClean": true,
    "stackVariantClean": true,
    "stackVariantStackMatches": true,
    "noHelperMismatchNames": [
      "D008E0"
    ],
    "stackPacketLoadBearing": false,
    "variantRows": [
      {
        "variant": "baseline",
        "clean": true,
        "finalD008E0": "0xD1A86C",
        "fieldMismatches": 0,
        "stackMismatches": 6
      },
      {
        "variant": "no_prepare_d008e0",
        "clean": true,
        "finalD008E0": "0x000000",
        "fieldMismatches": 1,
        "stackMismatches": 6
      },
      {
        "variant": "field_plus_stack",
        "clean": true,
        "finalD008E0": "0xD1A86C",
        "fieldMismatches": 0,
        "stackMismatches": 0
      }
    ]
  },
  "decision": {
    "keepPrepareColdbootEventFrameD008E0FieldWrite": true,
    "addRawErrSpStackPacketToBrowserShell": false,
    "d008e0FrontierClosedForCurrentBrowserClearRoute": true,
    "remainingAutoSafeD008E0Work": false
  },
  "checks": [
    {
      "name": "Phase892 passed",
      "pass": true,
      "detail": "prior lifetime trace machine JSON reports pass=true"
    },
    {
      "name": "No natural post-wipe oracle D008E0 owner",
      "pass": true,
      "detail": "naturalOracleD008E0Writes=0"
    },
    {
      "name": "Helper writes oracle D008E0 twice",
      "pass": true,
      "detail": "helperOracleD008E0Writes=2"
    },
    {
      "name": "Live raw errSP stack does not naturally match oracle",
      "pass": true,
      "detail": "keyStackMatchesOracle=false"
    },
    {
      "name": "Phase893 passed",
      "pass": true,
      "detail": "field/stack A/B machine JSON reports pass=true"
    },
    {
      "name": "Current source has helper oracle field write",
      "pass": true,
      "detail": "prepareColdbootEventFrame writes D008E0 = SCREEN_STACK_TOP - 18"
    },
    {
      "name": "Current source has no raw oracle stack packet writes",
      "pass": true,
      "detail": "no direct evalWrite24 source writes for the six raw errSP stack slots"
    },
    {
      "name": "Baseline route is clean",
      "pass": true,
      "detail": "Phase893 baseline field-only route has no watched-field mismatches"
    },
    {
      "name": "No-helper route isolates D008E0 mismatch",
      "pass": true,
      "detail": "mismatches=D008E0"
    },
    {
      "name": "Raw stack packet is not load-bearing",
      "pass": true,
      "detail": "stackPacketLoadBearing=false"
    },
    {
      "name": "Field-plus-stack remains clean",
      "pass": true,
      "detail": "injected stack packet matches stack oracle but changes no bounded behavior"
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

