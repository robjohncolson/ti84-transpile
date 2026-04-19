# Phase 202A - GRAPH Entry-Point Investigation

## Result

| Item | Value |
| --- | --- |
| Raw GRAPH matrix scan code | `0x60` |
| Matching scenario | `C:\Users\rober\Downloads\Projects\cemu-build\scenario-graph.json` |
| Matching trace | `C:\Users\rober\Downloads\Projects\cemu-build\graph-trace.log` |
| First post-keyboard user-level handler PC | `0x08C543` |

## How it was identified

- `phase199-scenario-matrix-report.md` maps `GRAPH` -> `scenario-graph.json` -> `graph-trace.log`.
- `scenario-graph.json` uses `sendCSC|graph`, then later `sendCSC|clear`, so the first handler hit in the trace belongs to the GRAPH press.
- `keyboard-matrix.md` gives the physical GRAPH key as `keyMatrix[6]:bit0`, scan code `0x60`.
- Important distinction: the raw matrix scan is `0x60`, but prior Phase 141 work shows the OS translation layer stores the translated GRAPH internal code (`0x44`) into `0xD0058E`. The immediate post-translation trampoline is `0x02FE84`; the first normal-key handler entry visible after that handoff is `0x08C543`.

## Trace Lead-In

First GRAPH-event handoff points found in `graph-trace.log`:

- line `17966917`: `0x02FE84`
- line `18279244`: `0x08C509`
- line `18279248`: `0x08C519`
- line `19166628`: `0x08C543`

Lead-in immediately before the handler entry:

```text
0x08C73D -> 0x08C742 -> 0x08C743 -> 0x08C744 ->
0x08C53A -> 0x08C53E -> 0x08C53F -> 0x08C543
```

## 16-PC Window Around The Entry

This is the first 16-PC block starting at the first handler entry hit (`graph-trace.log`, lines `19166628-19166643`):

```text
0x08C543  bit 7,(iy+0x0e)
0x08C547  jr z,0x08C593        ; taken in trace
0x08C593  res 2,(iy+0x33)
0x08C597  jp 0x08C33D
0x08C33D  call 0x0A349A
0x0A349A  bit 6,(iy+0x1b)
0x0A349E  ret nz
0x0A349F  push bc
0x0A34A0  push de
0x0A34A1  push hl
0x0A34A2  res 0,(iy+0x12)
0x0A34A6  ld hl,0x000009
0x0A34AA  call 0x0A32F9
0x0A32F9  ld a,i
0x0A32FB  jp pe,0x0A3301
0x0A3301  di
```

## Short Read

`0x08C543` is the best GRAPH renderer-entry candidate for follow-up tracing. It is the first normal-key handler entry I can isolate in the real CEmu GRAPH trace after the keyboard translation/handoff path.
