# Phase 937: Post-Integration Numeric Boundary Audit

Probe: `probe-phase937-post-integration-numeric-boundary-audit.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase937-post-integration-numeric-boundary-audit.mjs`

## Result

- Probe execution: **PASS**.
- All four fresh-browser scenarios preserved the numeric checkpoints: 0x000C -> 0x0018 -> 0x0024.
- Nonnumeric insert boundary: Period inserted byte 0x3A and left D02A29 at 0x0024 (PASS).
- Canonical controls: ArrowLeft -> 0x001879 / D02A29 0x0024; Enter -> 0x001879 / D02A29 0x0000; Escape -> 0x0A229D / D02A29 0x0024.
- The disk predicate remained limited to Digit1/2/3: Period, ArrowLeft, Enter, and Escape produced no additional `D02A29 += 0x000C` transition. ENTER instead followed its own canonical tuple-reset behavior (`0x0024 -> 0x0000`).

## Route Evidence

| Scenario | Phase | Key | Termination | D02A29 | Buffer[0..3] | Control stop | Page errors |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| period-insert | numeric-1 | Digit1 | post_insert_gate_stop | 0x000C | 0x31 0x00 0x00 0x00 | - | 0 |
| period-insert | numeric-2 | Digit2 | post_insert_gate_stop | 0x0018 | 0x31 0x32 0x00 0x00 | - | 0 |
| period-insert | numeric-3 | Digit3 | post_insert_gate_stop | 0x0024 | 0x31 0x32 0x33 0x00 | - | 0 |
| period-insert | boundary | Period | post_insert_gate_stop | 0x0024 | 0x31 0x32 0x33 0x3A | - | 0 |
| arrow-left-control | numeric-1 | Digit1 | post_insert_gate_stop | 0x000C | 0x31 0x00 0x00 0x00 | - | 0 |
| arrow-left-control | numeric-2 | Digit2 | post_insert_gate_stop | 0x0018 | 0x31 0x32 0x00 0x00 | - | 0 |
| arrow-left-control | numeric-3 | Digit3 | post_insert_gate_stop | 0x0024 | 0x31 0x32 0x33 0x00 | - | 0 |
| arrow-left-control | boundary | ArrowLeft | control_pre_stop | 0x0024 | 0x31 0x32 0x33 0x00 | 0x001879 | 0 |
| enter-control | numeric-1 | Digit1 | post_insert_gate_stop | 0x000C | 0x31 0x00 0x00 0x00 | - | 0 |
| enter-control | numeric-2 | Digit2 | post_insert_gate_stop | 0x0018 | 0x31 0x32 0x00 0x00 | - | 0 |
| enter-control | numeric-3 | Digit3 | post_insert_gate_stop | 0x0024 | 0x31 0x32 0x33 0x00 | - | 0 |
| enter-control | boundary | Enter | control_pre_stop | 0x0000 | 0x00 0x00 0x00 0x00 | 0x001879 | 0 |
| escape-control | numeric-1 | Digit1 | post_insert_gate_stop | 0x000C | 0x31 0x00 0x00 0x00 | - | 0 |
| escape-control | numeric-2 | Digit2 | post_insert_gate_stop | 0x0018 | 0x31 0x32 0x00 0x00 | - | 0 |
| escape-control | numeric-3 | Digit3 | post_insert_gate_stop | 0x0024 | 0x31 0x32 0x33 0x00 | - | 0 |
| escape-control | boundary | Escape | control_pre_stop | 0x0024 | 0x00 0x00 0x00 0x00 | 0x0A229D | 0 |

## Adjudication

The PHASE936 disk policy is bounded as intended. A single-byte nonnumeric insert and canonical controls spanning both preserved pre-stop families do not apply the numeric increment after the exact numeric progression: Period, ArrowLeft, and Escape preserve 0x0024, while Enter performs its independent tuple reset to 0x0000. This is evidence for the existing narrow predicate only; it does not justify letters, numpad aliases, or variable-width token handling.

## Bounded Machine JSON

```json
{
  "probe": "phase937-post-integration-numeric-boundary-audit",
  "pass": true,
  "scenarios": [
    {
      "name": "period-insert",
      "expectedTermination": "post_insert_gate_stop",
      "expectedControlStopPc": null,
      "routes": [
        {
          "key": "1",
          "code": "Digit1",
          "expectedInsertByte": 49,
          "termination": "post_insert_gate_stop",
          "steps": 7526,
          "controlStopPc": null,
          "d02a29": 12,
          "buffer": [
            49,
            0,
            0,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "2",
          "code": "Digit2",
          "expectedInsertByte": 50,
          "termination": "post_insert_gate_stop",
          "steps": 4558,
          "controlStopPc": null,
          "d02a29": 24,
          "buffer": [
            49,
            50,
            0,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "3",
          "code": "Digit3",
          "expectedInsertByte": 51,
          "termination": "post_insert_gate_stop",
          "steps": 4492,
          "controlStopPc": null,
          "d02a29": 36,
          "buffer": [
            49,
            50,
            51,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "PERIOD",
          "code": "Period",
          "expectedInsertByte": 58,
          "termination": "post_insert_gate_stop",
          "steps": 4558,
          "controlStopPc": null,
          "d02a29": 36,
          "buffer": [
            49,
            50,
            51,
            58
          ],
          "pageErrors": []
        }
      ],
      "numericCheckpoints": [
        12,
        24,
        36
      ],
      "numericPass": true,
      "boundaryPass": true,
      "pass": true
    },
    {
      "name": "arrow-left-control",
      "expectedTermination": "control_pre_stop",
      "expectedControlStopPc": 6265,
      "routes": [
        {
          "key": "1",
          "code": "Digit1",
          "expectedInsertByte": 49,
          "termination": "post_insert_gate_stop",
          "steps": 7526,
          "controlStopPc": null,
          "d02a29": 12,
          "buffer": [
            49,
            0,
            0,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "2",
          "code": "Digit2",
          "expectedInsertByte": 50,
          "termination": "post_insert_gate_stop",
          "steps": 4558,
          "controlStopPc": null,
          "d02a29": 24,
          "buffer": [
            49,
            50,
            0,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "3",
          "code": "Digit3",
          "expectedInsertByte": 51,
          "termination": "post_insert_gate_stop",
          "steps": 4492,
          "controlStopPc": null,
          "d02a29": 36,
          "buffer": [
            49,
            50,
            51,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "LEFT",
          "code": "ArrowLeft",
          "expectedInsertByte": null,
          "termination": "control_pre_stop",
          "steps": 7511,
          "controlStopPc": 6265,
          "d02a29": 36,
          "buffer": [
            49,
            50,
            51,
            0
          ],
          "pageErrors": []
        }
      ],
      "numericCheckpoints": [
        12,
        24,
        36
      ],
      "numericPass": true,
      "boundaryPass": true,
      "pass": true
    },
    {
      "name": "enter-control",
      "expectedTermination": "control_pre_stop",
      "expectedControlStopPc": 6265,
      "routes": [
        {
          "key": "1",
          "code": "Digit1",
          "expectedInsertByte": 49,
          "termination": "post_insert_gate_stop",
          "steps": 7526,
          "controlStopPc": null,
          "d02a29": 12,
          "buffer": [
            49,
            0,
            0,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "2",
          "code": "Digit2",
          "expectedInsertByte": 50,
          "termination": "post_insert_gate_stop",
          "steps": 4558,
          "controlStopPc": null,
          "d02a29": 24,
          "buffer": [
            49,
            50,
            0,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "3",
          "code": "Digit3",
          "expectedInsertByte": 51,
          "termination": "post_insert_gate_stop",
          "steps": 4492,
          "controlStopPc": null,
          "d02a29": 36,
          "buffer": [
            49,
            50,
            51,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "ENTER",
          "code": "Enter",
          "expectedInsertByte": null,
          "termination": "control_pre_stop",
          "steps": 8032,
          "controlStopPc": 6265,
          "d02a29": 0,
          "buffer": [
            0,
            0,
            0,
            0
          ],
          "pageErrors": []
        }
      ],
      "numericCheckpoints": [
        12,
        24,
        36
      ],
      "numericPass": true,
      "boundaryPass": true,
      "pass": true
    },
    {
      "name": "escape-control",
      "expectedTermination": "control_pre_stop",
      "expectedControlStopPc": 664221,
      "routes": [
        {
          "key": "1",
          "code": "Digit1",
          "expectedInsertByte": 49,
          "termination": "post_insert_gate_stop",
          "steps": 7526,
          "controlStopPc": null,
          "d02a29": 12,
          "buffer": [
            49,
            0,
            0,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "2",
          "code": "Digit2",
          "expectedInsertByte": 50,
          "termination": "post_insert_gate_stop",
          "steps": 4558,
          "controlStopPc": null,
          "d02a29": 24,
          "buffer": [
            49,
            50,
            0,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "3",
          "code": "Digit3",
          "expectedInsertByte": 51,
          "termination": "post_insert_gate_stop",
          "steps": 4492,
          "controlStopPc": null,
          "d02a29": 36,
          "buffer": [
            49,
            50,
            51,
            0
          ],
          "pageErrors": []
        },
        {
          "key": "CLEAR",
          "code": "Escape",
          "expectedInsertByte": null,
          "termination": "control_pre_stop",
          "steps": 74379,
          "controlStopPc": 664221,
          "d02a29": 36,
          "buffer": [
            0,
            0,
            0,
            0
          ],
          "pageErrors": []
        }
      ],
      "numericCheckpoints": [
        12,
        24,
        36
      ],
      "numericPass": true,
      "boundaryPass": true,
      "pass": true
    }
  ]
}
```

Disk `browser-shell.html`, runtime, decoder, peripherals, transpiler, ROM artifacts, schedulers, and `follow-alongs/` were not changed.

