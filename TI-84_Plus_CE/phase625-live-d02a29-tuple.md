# Phase 625: Forced Live D02A29 Tuple Paths

Probe: `probe-phase625-live-d02a29-tuple.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase625-live-d02a29-tuple.mjs`  
Exit: 0

## Summary

- ★★★ Forced 4 decoded tuple-cluster entries directly with seeded cursor/display state, because the normal one-key path from phase623 never reaches these clusters.
- ★★★ Live tuple state was observed in 3/4 forced entries. This confirms the phase621 interpretation is dynamically reachable when entered with the expected local context, but not by the current one-key path.
- ★★ The stable fields at entry are `D02A29`, `D02A2B`, `D02A1B`, D011xx display fields, `D0243D`, `D02A40`, and `D02A28`; direct forced execution is useful for tuple semantics, not as proof that this state is naturally available after key cleanup.

## Case Results

| Entry | Role | Termination | Steps | Last PC | Events | Final tuple |
|---|---|---|---:|---|---:|---|
| 0x08DF54 | tuple seed/display setup | missing_block | 73 | 0x400000 | 1 | `D02A29=0x0012 D02A2B=0x0000 D02A1B=0x0658 D0059A=0x07 D0114E=0x0002 D01150=0x0003 D01156=0x0005 D0115A=0x0007 D0243D=0xD1A8F8 D02A40=0xD1A8F8 D02A28=0x01` |
| 0x08ED73 | token-output setup | max_steps | 12000 | 0x006D4F | 0 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| 0x08F54B | normal exit cursor advance | max_steps | 12000 | 0x006D38 | 1 | `D02A29=0x0000 D02A2B=0x0000 D02A1B=0x0000 D0059A=0x00 D0114E=0x0000 D01150=0x0000 D01156=0x0000 D0115A=0x0000 D0243D=0x000000 D02A40=0x000000 D02A28=0x00` |
| 0x08F6FE | movement helper reset | missing_block | 4 | 0x400000 | 1 | `D02A29=0x0048 D02A2B=0x0010 D02A1B=0x0004 D0059A=0x07 D0114E=0x0002 D01150=0x0003 D01156=0x0005 D0115A=0x0007 D0243D=0xD1A8F8 D02A40=0xD1A8F8 D02A28=0x01` |

## Event Detail

### 0x08DF54 tuple seed/display setup

| Event | PC | HL | A | F | Tuple |
|---:|---|---|---:|---:|---|
| 1 | 0x08DF54 | 0x000012 | 0x00 | 0x00 | `D02A29=0x0008 D02A2B=0x0010 D02A1B=0x0004 D0059A=0x07 D0114E=0x0002 D01150=0x0003 D01156=0x0005 D0115A=0x0007 D0243D=0xD1A8F8 D02A40=0xD1A8F8 D02A28=0x01` |

### 0x08ED73 token-output setup

| Event | PC | HL | A | F | Tuple |
|---:|---|---|---:|---:|---|
| - | - | - | - | - | no watched tuple blocks reached |

### 0x08F54B normal exit cursor advance

| Event | PC | HL | A | F | Tuple |
|---:|---|---|---:|---:|---|
| 1 | 0x08F54B | 0x000036 | 0x00 | 0x00 | `D02A29=0x0008 D02A2B=0x0010 D02A1B=0x0004 D0059A=0x07 D0114E=0x0002 D01150=0x0003 D01156=0x0005 D0115A=0x0007 D0243D=0xD1A8F8 D02A40=0xD1A8F8 D02A28=0x01` |

### 0x08F6FE movement helper reset

| Event | PC | HL | A | F | Tuple |
|---:|---|---|---:|---:|---|
| 1 | 0x08F6FE | 0x000048 | 0x00 | 0x00 | `D02A29=0x0008 D02A2B=0x0010 D02A1B=0x0004 D0059A=0x07 D0114E=0x0002 D01150=0x0003 D01156=0x0005 D0115A=0x0007 D0243D=0xD1A8F8 D02A40=0xD1A8F8 D02A28=0x01` |

## Interpretation

This resolves the "find or force a live D02A29 tuple path" priority by forcing the decoded tuple clusters. The tuple is coherent under direct entry, but phase623 remains the important integration result: the ordinary one-key path never enters these clusters before cleanup. For the browser/display path, VRAM and token-buffer persistence remain the practical route; tuple restoration should only be revisited after finding a natural OS path into `0x08DF54`/`0x08ED73`/`0x08F54B`.

No runtime, transpiler, or browser files were changed.
