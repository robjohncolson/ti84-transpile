# Phase 314: _indcall Dispatch Site Catalog

## Mechanism

The TI-84 Plus CE OS uses a single indirect-call trampoline: `JP (IY)` at address **0x002288**. There are two entry points:

| Entry | Instruction | Callers |
|-------|-------------|---------|
| 0x00015C | `JP 0x002288` | 22 |
| 0x002288 | `JP (IY)` (the actual trampoline) | 22 |

Total direct CALL sites: **44** (22 via each entry point).

Two wrapper functions at **0x01322D** (13 callers) and **0x041E95** (14 callers) add null-checking: `_frameset0` -> `LD HL,(slot)` -> `_icmpzero` -> skip if null -> `LD IY,(slot)` -> `JP (IY)`. Both wrappers hardcode slot **0xD14026**.

## Dispatch Categories

| Category | Count | Description |
|----------|-------|-------------|
| Slot-based (fixed RAM addr) | 12 | `LD IY,(slot_addr)` then `CALL _indcall` |
| Wrapper-dispatched | 27 | Via 0x01322D/0x041E95, all use slot 0xD14026 |
| IX-frame (C function pointer) | ~19 | IY loaded from stack frame via `LD IY,(IY+d)` chain |
| Unknown/other | ~8 | IY loaded by other patterns |

## Callback Slot Catalog (9 unique slots)

### Slot 0xD00108 -- ISR Callback

- **Dispatch sites**: 1 (at 0x002D27)
- **Region**: Very early RAM (system table area)
- **Writers**: 2
  - 0x0028B4: writes **0x0028D1** (default ISR handler)
  - 0x00292F: writes **0x00288A** (alternate ISR handler)
- **Hypothesis**: Interrupt service routine callback. Written during early boot (0x0028xx region). The two targets are both in the ISR setup area, suggesting a mode-dependent interrupt handler.

### Slot 0xD14026 -- OS Event Dispatcher (PRIMARY)

- **Dispatch sites**: 29 (2 direct + 27 via wrappers)
- **Region**: OS state area (0xD140xx)
- **Writers**: 3
  - 0x00B75E: writes **0x00FBD1** (default event handler)
  - 0x02BA66: writes **0x00063C** (alternate handler)
  - 0x048CFC: writes **0x02C0B8** (alternate handler)
- **Hypothesis**: The central OS event notification callback. The two wrappers pass a single-bit event flag as an argument. This is how the OS notifies an installed handler about system events (key press, timer, mode change, etc.). The three different handler addresses correspond to different OS modes/apps installing their own event handler.

#### Event Bit-Flags

| Bit | Flag | Callers | Likely Purpose |
|-----|------|---------|----------------|
| 1 | 0x0002 | 2 | |
| 2 | 0x0004 | 4 | App-related (called from 0x00A58D, 0x00D9D5, 0x02A979, 0x03A7F6) |
| 3 | 0x0008 | 2 | |
| 4 | 0x0010 | 2 | |
| 5 | 0x0020 | 2 | |
| 6 | 0x0040 | 2 | LCD/display-related (callers near LCD code at 0x012D73, 0x041917) |
| 7 | 0x0080 | 2 | |
| 8 | 0x0100 | 2 | |
| 9 | 0x0200 | 2 | |
| 11 | 0x0800 | 4 | High-frequency event (4 callers, most of any flag) |
| 12 | 0x1000 | 1 | Only from 0x041E95 wrapper (0x0711FD) |
| 14 | 0x4000 | 2 | |

Note: bits 0, 3, 10, 13, 15 are unused. Each flag is a single bit, confirming bitmask-based event dispatch.

### Slot 0xD143EA -- Menu/App Hook

- **Dispatch sites**: 1 (at 0x01519F)
- **Region**: OS state area (near 0xD143xx app context)
- **Writers**: 5
  - 0x015605: writes **0x011F1C**
  - 0x0156BD: writes **0x0121EF**
  - 0x02B387: dynamic (cleared by context)
  - 0x03BC27: writes **0x000000** (disable)
  - 0x03C0C1: writes **0x000000** (disable)
- **Hypothesis**: Application/menu hook. The two non-null targets (0x011F1C, 0x0121EF) are in the 0x011xxx-0x012xxx range (menu system code). Three writers clear the slot to disable the hook.

### Slot 0xD17751 -- Graph/Plot Callback

- **Dispatch sites**: 3 (at 0x038A96, 0x038AB7, 0x038B6E -- all in 0x038xxx graph region)
- **Region**: Graph state area (0xD177xx)
- **Writers**: 26 (mostly dynamic)
  - Most writers store 0x000000 (reset) or dynamic values from function returns
  - Heavily written from 0x02Exxx, 0x063xxx, 0x065xxx regions (graph/plot code)
- **Hypothesis**: Graph trace/plot callback. The high writer count (26) and dynamic values indicate this slot changes frequently as different graph operations install their rendering callbacks. The dispatch sites are all in the graph engine (0x038xxx).

### Slots 0xD177BD-0xD177C9 -- Hook Table (5 slots, 3 bytes apart)

| Slot | Dispatch PC | Init Writer | Clear Writer |
|------|-------------|-------------|--------------|
| 0xD177BD | 0x010269 | 0x0106C1 (dynamic, from IX+9) | 0x010F13 (0x000000) |
| 0xD177C0 | 0x0102A4 | 0x0106CB (dynamic, from IX+9) | 0x010F18 (dynamic) |
| 0xD177C3 | 0x0102C9 | 0x0106D5 (dynamic, from IX+9) | 0x010F1D (dynamic) |
| 0xD177C6 | 0x0102F2 | 0x0106DF (dynamic, from IX+9) | 0x010F22 (dynamic) |
| 0xD177C9 | 0x010389 | 0x0106E9 (dynamic, from IX+9) | 0x010F27 (dynamic) |

- **Region**: Graph state area (contiguous 0xD177BD-D177CE)
- **Dispatch sites**: 5 (one per slot), all in 0x0102xx
- **Writers**: All initialized from a parameter struct at IX+9, all cleared to 0x000000
- **Hypothesis**: Hook registration table for 5 graph-related callbacks. A single registration function at ~0x0106xx takes a struct with 5 callback pointers (at IX+9 offsets) and installs them. A cleanup function at ~0x010Fxx clears all 5 slots. The 3-byte spacing matches eZ80 24-bit address size.

Also notable: slot **0xD177CC** (adjacent to this table) is written at 4 sites but loaded into IY at 0x0100EB/0x01080F/0x010828/0x010834 -- used via other call patterns (not _indcall), likely part of the same hook infrastructure.

## IX-Frame Dispatch Sites (C Function Pointers)

~19 CALL _indcall sites load IY from IX-relative stack frame addresses using the ZDS II C compiler pattern:

```
LD IX, (IX+d)     ; DD 31 dd -- reload IX from frame
LD IY, (IY+0)     ; FD 37 00 -- dereference IY pointer chain  
LD BC, (IX+d)     ; DD 07 dd -- load argument from frame
PUSH BC
CALL _indcall     ; CD 5C 01 00
```

These are standard C function-pointer calls where the callback address is passed as a parameter to the calling function, not stored in a fixed RAM slot. They appear in:

- **0x00C943-0x00FEB2** (8 sites): OS core callback dispatch (key handler, display refresh)
- **0x02B7A9-0x032315** (7 sites): System services
- **0x03CD41-0x03CF5B** (2 sites): LCD/display layer
- **0x014D99** (1 site): Menu system
- **0x0BCC6F** (1 site): USB/peripheral

## Address Region Summary

| RAM Region | Slots | Purpose |
|-----------|-------|---------|
| 0xD001xx | 1 (D00108) | ISR vector |
| 0xD140xx | 2 (D14026, D143EA) | OS event dispatcher + app hook |
| 0xD177xx | 6 (D17751, D177BD-C9) | Graph engine callbacks |

## Key Findings

1. **Single JP (IY) in entire ROM** at 0x002288. All indirect calls funnel through this one instruction.
2. **0xD14026 is the central event slot** with 29 total dispatch sites (most of any slot). It implements a bitmask event notification system with 12 active event bits.
3. **The two wrappers (0x01322D, 0x041E95) are duplicates** -- identical logic, different helper entry points. Both serve only slot 0xD14026. This duplication likely comes from two compilation units linking against different C runtime builds.
4. **Graph engine has 6 callback slots** in the 0xD177xx region, all dynamically populated.
5. **Most dispatch is actually C function pointers** (19+ sites) passed on the stack, not fixed slots. The _indcall trampoline is the ZDS II C compiler's mechanism for all indirect calls, whether through fixed slots or stack-passed pointers.

## Probe

Run: `node TI-84_Plus_CE/probe-phase314-indcall.mjs`
