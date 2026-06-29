# Phase 885: Natural D0301B Owner Prototype

Probe: `probe-phase885-natural-owner-prototype.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase885-natural-owner-prototype.mjs`

## Summary

- Result: PASS.
- Stable snapshot captured: yes.
- Natural owner entry: 0x0454BE after Phase 5, before stable replay.
- Owner result: max_steps after 60000 steps at 0x04C8A3.
- D0301B after owner: 0x5AA55A; after replay: 0x5AA55A; after Phase 6 repaint without force: 0x5AA55A.
- Phase 6 repaint without force: halt after 47393 steps at 0x0019B5; VRAM non-white=8482.
- Adjudication: The A-side owner entry naturally writes D0301B and it survives replay/repaint, so browser-shell can prototype this behind the proven force baseline.

## Browser Source Patch + Gates

- `browser-shell.html` now runs a bounded Phase 5b A-side owner entry at `0x0454BE` after Phase 5 captures the stable snapshot and before the existing stable replay/force baseline.
- The explicit `evalWrite24(mem, 0xD0301B, 0x5AA55A)` force remains in place for this tick; PHASE886 may test retiring only that redundant force after this natural owner path stays green.
- `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-browser-shell-replay-verify.mjs` PASS: Phase 6 halted at `0x0019B5`, `vatSnapshotCaptured=true`, VRAM=8482, no page errors, and `naturalD0301BOwner` showed `entry=0x0454BE`, `beforeD0301B=0x000000`, `afterD0301B=0x5AA55A`.
- `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase880-browser-clear-field-audit.mjs` PASS: `milestoneComplete=true`, `cleanExecution=true`, zero realram oracle mismatches, `cleanup0018F8=0`, `anchor0A229D=1`, key route `control_pre_stop`.
- Risk note: the owner leg is bounded and terminates by `max_steps` at `0x04C8A3` after writing the magic; the follow-on replay + Phase 6 + CLEAR audit gates prove it did not destabilize the accepted browser CLEAR baseline.

## Browser-Like Boot Phases

| Phase | Steps | Termination | Last PC |
| --- | --- | --- | --- |
| p1-coldboot-0x000000 | 20000 | max_steps | 0x001CC0 |
| p2-kernel-0x08C331 | 100000 | max_steps | 0x000A92 |
| p3-postinit-0x0802B2 | 100 | max_steps | 0x0158BC |
| p4-warm-idle-0x0019BE | 192290 | halt | 0x0019B5 |
| p5-launch-home-0x09DD62 | 275843 | halt | 0x0019B5 |

## Key Field Snapshots

```json
{
  "stableSnapshotFields": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A866",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D02317": "0xD2A83E",
    "D0231A": "0xD2A83E",
    "D0231D": "0xD2A83D",
    "D02437": "0xD1A8CC",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02440": "0xD2A83E",
    "D02505": "0x0A",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D0301B": "0x000000",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x00"
  },
  "beforeOwner": {
    "D007CA": "0x000000",
    "D008E0": "0x000000",
    "D010EF": "0x000000",
    "D010FE": "0x000000",
    "D010F4": "0x00",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02440": "0x000000",
    "D02505": "0x00",
    "D02590": "0x000000",
    "D0259D": "0x000000",
    "D02A29": "0x0000",
    "D0301B": "0x000000",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x00"
  },
  "afterOwner": {
    "D007CA": "0x000000",
    "D008E0": "0x000000",
    "D010EF": "0x000000",
    "D010FE": "0x000000",
    "D010F4": "0x00",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02440": "0x000000",
    "D02505": "0x00",
    "D02590": "0xD3FEEB",
    "D0259D": "0xD3FF27",
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x03"
  },
  "afterReplay": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A866",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02440": "0x000000",
    "D02505": "0x0A",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x03"
  },
  "beforeRepaint": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A86C",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02440": "0x000000",
    "D02505": "0x0A",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x03"
  },
  "afterRepaint": {
    "D007CA": "0x0585E9",
    "D008E0": "0x000000",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0xD1A8A3",
    "D0243A": "0xD1A8A3",
    "D0243D": "0xD2A83E",
    "D02440": "0xD2A83E",
    "D02505": "0x0A",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x03"
  }
}
```

## Owner Counts

```json
{
  "ownerAAlt0454BE": 1,
  "ownerACommon040BDE": 1,
  "ownerACommon040BE4": 1,
  "ownerACall040BEC": 0,
  "ownerAStore040BF0": 1,
  "ownerAWrite040BF4": 0,
  "phase5Snapshot001879": 6,
  "phase5Wipe0018F8": 6
}
```

## Machine JSON

```json
{
  "pass": true,
  "phases": [
    {
      "name": "p1-coldboot-0x000000",
      "result": {
        "steps": 20000,
        "termination": "max_steps",
        "lastPc": "0x001CC0",
        "lastMode": "adl"
      }
    },
    {
      "name": "p2-kernel-0x08C331",
      "result": {
        "steps": 100000,
        "termination": "max_steps",
        "lastPc": "0x000A92",
        "lastMode": "adl"
      }
    },
    {
      "name": "p3-postinit-0x0802B2",
      "result": {
        "steps": 100,
        "termination": "max_steps",
        "lastPc": "0x0158BC",
        "lastMode": "adl"
      }
    },
    {
      "name": "p4-warm-idle-0x0019BE",
      "result": {
        "steps": 192290,
        "termination": "halt",
        "lastPc": "0x0019B5",
        "lastMode": "adl"
      }
    },
    {
      "name": "p5-launch-home-0x09DD62",
      "result": {
        "steps": 275843,
        "termination": "halt",
        "lastPc": "0x0019B5",
        "lastMode": "adl"
      }
    }
  ],
  "stableSnapshotCaptured": true,
  "stableSnapshotFields": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A866",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D02317": "0xD2A83E",
    "D0231A": "0xD2A83E",
    "D0231D": "0xD2A83D",
    "D02437": "0xD1A8CC",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02440": "0xD2A83E",
    "D02505": "0x0A",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D0301B": "0x000000",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x00"
  },
  "beforeOwner": {
    "D007CA": "0x000000",
    "D008E0": "0x000000",
    "D010EF": "0x000000",
    "D010FE": "0x000000",
    "D010F4": "0x00",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02440": "0x000000",
    "D02505": "0x00",
    "D02590": "0x000000",
    "D0259D": "0x000000",
    "D02A29": "0x0000",
    "D0301B": "0x000000",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x00"
  },
  "ownerResult": {
    "steps": 60000,
    "termination": "max_steps",
    "lastPc": "0x04C8A3",
    "lastMode": "adl"
  },
  "afterOwner": {
    "D007CA": "0x000000",
    "D008E0": "0x000000",
    "D010EF": "0x000000",
    "D010FE": "0x000000",
    "D010F4": "0x00",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02440": "0x000000",
    "D02505": "0x00",
    "D02590": "0xD3FEEB",
    "D0259D": "0xD3FF27",
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x03"
  },
  "afterReplay": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A866",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02440": "0x000000",
    "D02505": "0x0A",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x03"
  },
  "beforeRepaint": {
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A86C",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02440": "0x000000",
    "D02505": "0x0A",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x03"
  },
  "repaintResult": {
    "steps": 47393,
    "termination": "halt",
    "lastPc": "0x0019B5",
    "lastMode": "adl"
  },
  "afterRepaint": {
    "D007CA": "0x0585E9",
    "D008E0": "0x000000",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D010F4": "0x1F",
    "D02317": "0x000000",
    "D0231A": "0x000000",
    "D0231D": "0x000000",
    "D02437": "0xD1A8A3",
    "D0243A": "0xD1A8A3",
    "D0243D": "0xD2A83E",
    "D02440": "0xD2A83E",
    "D02505": "0x0A",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D0301B": "0x5AA55A",
    "D000B5_IY53": "0x00",
    "D000BF_IY63": "0x00",
    "D000C3_IY67": "0x00",
    "D00894": "0x00",
    "D1A880": "0x03"
  },
  "vramNonWhite": 8482,
  "ownerCounts": {
    "ownerAAlt0454BE": 1,
    "ownerACommon040BDE": 1,
    "ownerACommon040BE4": 1,
    "ownerACall040BEC": 0,
    "ownerAStore040BF0": 1,
    "ownerAWrite040BF4": 0,
    "phase5Snapshot001879": 6,
    "phase5Wipe0018F8": 6
  },
  "ownerFirst": {
    "phase5Snapshot001879": {
      "label": "p1-coldboot",
      "pc": "0x001879",
      "cpu": {
        "pc": "0x001879",
        "currentBlockPc": "0x001879",
        "sp": "0xD1A87B",
        "af": "0xEE54",
        "bc": "0x000003",
        "de": "0x000430",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "f": "0x54",
        "halted": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x00",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000B5_IY53": "0x00",
        "D000BF_IY63": "0x00",
        "D000C3_IY67": "0x00",
        "D00894": "0x00",
        "D1A880": "0x00"
      }
    },
    "phase5Wipe0018F8": {
      "label": "p1-coldboot",
      "pc": "0x0018F8",
      "cpu": {
        "pc": "0x0018F8",
        "currentBlockPc": "0x0018F8",
        "sp": "0xD1A87B",
        "af": "0x5200",
        "bc": "0x0000FF",
        "de": "0xD3FF00",
        "hl": "0xD3FEFF",
        "ix": "0x000000",
        "iy": "0xD00080",
        "f": "0x00",
        "halted": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x00",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000B5_IY53": "0x00",
        "D000BF_IY63": "0x00",
        "D000C3_IY67": "0x00",
        "D00894": "0x00",
        "D1A880": "0x00"
      }
    },
    "ownerAAlt0454BE": {
      "label": "natural-owner-post-p5-0454BE",
      "pc": "0x0454BE",
      "cpu": {
        "pc": "0x0454BE",
        "currentBlockPc": "0x0454BE",
        "sp": "0xD1A866",
        "af": "0x1040",
        "bc": "0x00B026",
        "de": "0xD65800",
        "hl": "0x000000",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x40",
        "halted": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0xD1A866",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x00",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000B5_IY53": "0x00",
        "D000BF_IY63": "0x00",
        "D000C3_IY67": "0x00",
        "D00894": "0x00",
        "D1A880": "0x00"
      }
    },
    "ownerACommon040BDE": {
      "label": "natural-owner-post-p5-0454BE",
      "pc": "0x040BDE",
      "cpu": {
        "pc": "0x040BDE",
        "currentBlockPc": "0x040BDE",
        "sp": "0xD1A866",
        "af": "0x1054",
        "bc": "0x00B026",
        "de": "0xD65800",
        "hl": "0x000000",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x54",
        "halted": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0xD1A866",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x00",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000B5_IY53": "0x00",
        "D000BF_IY63": "0x00",
        "D000C3_IY67": "0x00",
        "D00894": "0x00",
        "D1A880": "0x00"
      }
    },
    "ownerACommon040BE4": {
      "label": "natural-owner-post-p5-0454BE",
      "pc": "0x040BE4",
      "cpu": {
        "pc": "0x040BE4",
        "currentBlockPc": "0x040BE4",
        "sp": "0xD1A866",
        "af": "0x0354",
        "bc": "0x00B026",
        "de": "0xD65800",
        "hl": "0x000000",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x54",
        "halted": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0xD1A866",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x00",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000B5_IY53": "0x00",
        "D000BF_IY63": "0x00",
        "D000C3_IY67": "0x00",
        "D00894": "0x00",
        "D1A880": "0x00"
      }
    },
    "ownerAStore040BF0": {
      "label": "natural-owner-post-p5-0454BE",
      "pc": "0x040BF0",
      "cpu": {
        "pc": "0x040BF0",
        "currentBlockPc": "0x040BF0",
        "sp": "0xD1A866",
        "af": "0x0054",
        "bc": "0xD140B3",
        "de": "0xD1A851",
        "hl": "0xD140B6",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x54",
        "halted": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x00",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000B5_IY53": "0x00",
        "D000BF_IY63": "0x00",
        "D000C3_IY67": "0x00",
        "D00894": "0x00",
        "D1A880": "0x03"
      }
    }
  },
  "analysis": {
    "proposedSourceTiming": "Run 0x0454BE after Phase 5 captures the stable snapshot, then replay the existing stable packet, keep the explicit D0301B force for this tick, and gate with browser replay + Phase880.",
    "naturalD0301BWritten": true,
    "naturalD0301BSurvivesReplay": true,
    "naturalD0301BSurvivesPhase6": true,
    "noForceUsedInProbe": true,
    "sourceForceShouldRemain": true
  }
}
```

The probe does not edit runtime, transpiler, browser shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files.
