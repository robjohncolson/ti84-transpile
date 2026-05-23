# Phase 416 — 0x0150C2 State Variable Reference Map

## Overview

Session 415 decoded 0x0150C2 (generic completion dispatcher, 103 bytes). This phase maps ALL ROM references to the five RAM addresses it uses, classifying each as read or write and determining lifecycle and value ranges.

## Variable Summary

| Variable | Address  | Total Refs | Reads | Writes | Role |
|----------|----------|-----------|-------|--------|------|
| D176BD   | 0xD176BD | 21        | 7     | 14     | Callback pointer (3-byte) |
| D176F2   | 0xD176F2 | 114       | 57    | 57     | State/channel descriptor (3-byte) |
| D176FB   | 0xD176FB | 34        | 4     | 30     | Notification flag (1-byte) |
| D176FC   | 0xD176FC | 8         | 3     | 5      | Gate flag (1-byte) |
| D1772D   | 0xD1772D | 19        | 7     | 12     | Secondary gate / transfer-active flag (1-byte) |

---

## D176BD — Callback Pointer (21 refs: 7R / 14W)

### Semantics
3-byte pointer to the completion callback function. 0x0150C2 reads it with `LD BC,(D176BD)` at 0x0150CA and dispatches through it. The high write-to-read ratio (14:7) reflects many subsystems installing their own callbacks.

### Writers (14 sites)
| Address  | Context |
|----------|---------|
| 0x00AC00 | Early init — sets callback during boot sequence |
| 0x011ECB | Sets callback to 0x011A97 before calling 0x0136FC |
| 0x01512E | Copies from D176BA (backup pointer) into D176BD |
| 0x01514B | Clears to 0x000000 after calling 0x0150C2 (post-dispatch cleanup) |
| 0x01578D | Sets callback during a setup sequence, then calls 0x0136FC |
| 0x02E78B | Link/USB subsystem callback install |
| 0x044034 | Mode 0x44xxx callback install |
| 0x044113 | Mode 0x44xxx callback install (alternate path) |
| 0x0441A1 | Mode 0x44xxx callback install (third path) |
| 0x04819C | Mode 0x48xxx callback install |
| 0x0484FF | Mode 0x48xxx callback install |
| 0x063846 | Mode 0x63xxx callback install |
| 0x0656C4 | Mode 0x65xxx callback install |
| 0x06AA3E | Mode 0x6Axxx callback install |

### Readers (7 sites)
| Address  | Context |
|----------|---------|
| 0x011E94 | Read before conditional dispatch |
| 0x0150CA | **Primary dispatch site** — 0x0150C2 loads callback target |
| 0x015780 | Read + save to backup (D176BA) pattern |
| 0x044231 | Read in mode 0x44xxx for validation |
| 0x04853F | Read in mode 0x48xxx |
| 0x06388D | Read in mode 0x63xxx |
| 0x06AA07 | Read in mode 0x6Axxx |

### Lifecycle
- **Init**: Set by subsystem-specific installers before requesting async work
- **Cleared**: Set to 0x000000 at 0x01514B after dispatch completes
- **Values**: Always a 3-byte ROM code pointer (e.g., 0x011A97)
- **Backup**: 0x01512E copies from D176BA → D176BD, and 0x015780 reads D176BD into BC then stores to D176BA — a save/restore pattern for nested callbacks

---

## D176F2 — State/Channel Descriptor (114 refs: 57R / 57W)

### Semantics
The most heavily referenced variable (114 refs). 3-byte value storing a state/channel descriptor. The perfectly balanced read/write ratio (57:57) indicates a continuously updated state variable read as often as it is written.

### Key Patterns

**Magic value 0x00CCCC**: Written at 0x01118C and 0x011432 alongside `LD A,0x06; LD (D17795),A` — state 6 of the protocol FSM with a sentinel/marker value.

**Conditional clear to 0x000000**: At 0x01154C-0x011550, cleared conditionally (`JR NZ` skip pattern).

**Read via LD IY,(D176F2)**: At 0x011FC5 and 0x0150D1, the value is loaded into IY — meaning D176F2 sometimes holds a pointer used for indexed access.

**Broad subsystem usage**: References span:
- 0x00Axxx — early init
- 0x011xxx-0x014xxx — core protocol engine (heaviest concentration)
- 0x02Cxxx-0x02Fxxx — link/USB layer
- 0x042xxx-0x04Exxx — mode handlers
- 0x063xxx-0x06Axxx — secondary mode handlers

### Lifecycle
- **Init**: Set during boot at 0x00AB24/0x00AB30
- **Values**: 0x000000 (cleared), 0x00CCCC (sentinel for state 6), and various pointer values loaded into IY
- **Update frequency**: Continuously updated throughout protocol transactions

---

## D176FB — Notification Flag (34 refs: 4R / 30W)

### Semantics
1-byte flag. Overwhelmingly written (30W) vs read (4R) — a "fire and forget" notification/status flag. Almost all writes use `XOR A; LD (D176FB),A` (clear to 0) or `LD A,0x01; LD (D176FB),A` (set to 1).

### Writers (30 sites — key patterns)

**Clear to 0 (majority)**: Most writes clear this flag:
- 0x00AA46: `XOR A` then store — boot init
- 0x00B8B7: `XOR A` then store — after clearing D176F8 twice
- 0x00F164: `XOR A` then store — alongside clearing D14074
- 0x00F2F0: `XOR A` then store — post-operation cleanup
- 0x00FBF2: `XOR A` then store — alongside clearing D1772D
- 0x0150E5: Cleared by 0x0150C2 dispatcher (unconditional)
- Many mode handlers at 0x047xxx, 0x048xxx, 0x04Dxxx

**Set to 1**: 
- 0x00E726: `LD A,0x01; LD (D176FB),A` — sets flag based on IY+0x10 bit test

### Readers (4 sites)
| Address  | Context |
|----------|---------|
| 0x009434 | Early subsystem check |
| 0x00F274 | Protocol engine check |
| 0x02BF29 | Link/USB layer check |
| 0x042999 | Mode handler check |

### Lifecycle
- **Init**: Cleared to 0 during boot
- **Values**: 0 (cleared/idle) or 1 (notification pending)
- **Pattern**: Set to 1 by event producers, read and acted on by 4 consumers, cleared by many cleanup paths including the 0x0150C2 dispatcher itself

---

## D176FC — Gate Flag (8 refs: 3R / 5W)

### Semantics
1-byte flag with very few references (8 total). Used as a gate in the Channel 3 special case of 0x0150C2: checked at 0x0150E9 alongside D1772D.

### Writers (5 sites)

**Clear to 0**:
- 0x00B737: Boot init — `XOR A` then store, alongside clearing D14095 and D14093
- 0x01401F: `XOR A` then store — protocol engine, after conditional call to 0x0019B5
- 0x01579C: `XOR A` then store — small utility function (followed by RET at 0x0157A0)
- 0x048C3B: `XOR A` then store — mirror of 0x00B737 pattern (same D14095/D14093 clears)

**Set to 1**:
- 0x0BCD24: `LD A,0x01; LD (D176FC),A` then RET — only site that sets to 1, in the 0x0BCxxx region (USB/link app layer)

### Readers (3 sites)
| Address  | Context |
|----------|---------|
| 0x012149 | Protocol engine — reads gate before conditional logic |
| 0x0150E9 | **0x0150C2 dispatcher** — Channel 3 gate check |
| 0x0157A1 | Utility function — reads and returns in A (getter) |

### Lifecycle
- **Init**: Cleared to 0 at boot (0x00B737)
- **Values**: 0 (gate closed / normal) or 1 (gate open / USB transfer active)
- **Only setter**: 0x0BCD24 is the sole site that sets to 1 — USB/link subsystem
- **Gate logic**: In 0x0150C2, if D176FC==0 AND D1772D!=0, the Channel 3 special path activates

---

## D1772D — Secondary Gate / Transfer-Active Flag (19 refs: 7R / 12W)

### Semantics
1-byte flag. Works in conjunction with D176FC in the Channel 3 gate of 0x0150C2. Represents whether a data transfer is in progress.

### Writers (12 sites)

**Clear to 0**:
- 0x00FBED: `XOR A` — alongside setting D14074=1, clearing D176FB
- 0x013E68: `XOR A` — alongside clearing D1772A (3-byte) to 0
- 0x014381: `XOR A` — after comparing D176FD with 0x02
- 0x02BA7C: Link/USB layer clear
- 0x02C0D4: Link/USB layer clear
- 0x047CB7, 0x047D79: Mode handler clears

**Set to 1**:
- 0x014009: `LD A,0x01` — sets D176F8=0x02 first, then D1772D=0x01 (initiating transfer)
- 0x01443E: `LD A,0x01` — after calling 0x0152D8
- 0x047EA2: Mode handler sets to 1

**Set to 2**:
- 0x014537: Sets to a value (context shows `LD A,val` before store — likely 0x02 based on related D176F8 patterns)

### Readers (7 sites)
| Address  | Context |
|----------|---------|
| 0x000A15 | Very early ROM — ISR or reset vector area |
| 0x006353 | Mid-ROM utility |
| 0x0099B1 | Subsystem check |
| 0x00EE81 | Protocol engine |
| 0x00F32A | Protocol engine |
| 0x0150FC | **0x0150C2 dispatcher** — Channel 3 gate check |
| 0x02B9DD | Link/USB layer |

### Lifecycle
- **Init**: Cleared to 0
- **Values**: 0 (no transfer), 1 (transfer active), possibly 2 (transfer phase 2)
- **Pattern**: Set to 1 when initiating a data transfer (alongside D176F8=0x02), cleared on completion or abort
- **ISR reader**: Read at 0x000A15 — extremely early ROM, likely ISR checks transfer status

---

## Cross-Variable Patterns

### Boot Init Sequence
At boot, these are cleared together:
- D176FB = 0 (0x00AA46, 0x00B8B7)
- D176FC = 0 (0x00B737)
- D1772D = 0 (0x00FBED)
- D176BD is set to a callback pointer
- D176F2 is set to initial state

### 0x0150C2 Dispatcher Usage
The dispatcher at 0x0150C2:
1. Reads D176BD → BC (callback pointer)
2. Reads D176F2 → IY (state descriptor, conditionally writes back)
3. Clears D176FB = 0 (unconditional notification clear)
4. Reads D176FC and D1772D for Channel 3 gate logic

### Transfer Lifecycle
1. **Initiate**: Set D1772D=1, D176F8=2 (0x014009)
2. **Gate**: Set D176FC=1 from USB layer (0x0BCD24)
3. **Dispatch**: 0x0150C2 checks D176FC==0 AND D1772D!=0 for Channel 3 path
4. **Complete**: Clear D1772D=0, D176FC=0, D176FB=0

### Paired Clears
D176FB and D1772D are frequently cleared together:
- 0x00FBED-0x00FBF2: D1772D=0 then D176FB=0
- 0x02C0D4-0x02C0D9: D1772D=0 then D176FB=0

## Probe Artifact
`TI-84_Plus_CE/probe-phase416-0150C2-state.mjs` — full reference scanner with opcode classification and context disassembly.
