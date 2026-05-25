# Phase 435 - Decode of 0x00883C: USB State Machine Dispatch

## Function Boundaries

- **Start**: 0x00883C
- **End**: 0x008951 (inclusive, RET at 0x008951)
- **Size**: 278 bytes (0x116)
- **Instructions**: 124 (including inline case table data interpreted as instructions by linear sweep)
- **Actual code instructions**: ~50 (excluding the 48-byte inline case table at 0x0088AC-0x0088DB)

## Dispatch Mechanism

**Inline case dispatcher (0x00211B)** on the sub_event parameter (IX+9).

### Pre-dispatch flow

1. `0x00883C`: Stack frame setup via `CALL 0x002197` (LD HL,0xFFFFFF = -1 = 1 local byte at IX-1)
2. `0x008848-0x00884B`: Save interrupt state (LD A,I; PUSH AF; DI) — function runs with interrupts disabled
3. `0x00884C-0x008882`: **Re-entrant guard** — compares D177B9 (current_sub_event) with IX+9 (new sub_event). If different, recursively calls itself (`CALL 0x00883C` at 0x008870) with the stored sub_event first via `0x0085E3`, then updates D177B9 to the new sub_event. If `0x0085E3` returns 0 (failure), sets local flag IX-1 = 0x01 and skips dispatch
4. `0x00888B-0x00889D`: Calls `0x00863A` with event_code (IX+6) — validation/pre-processing. If it returns nonzero, skips to epilogue
5. `0x0088A1-0x0088A8`: Loads sub_event from IX+9 into A, dispatches via inline case table

### Case Table (11 entries, dispatching on sub_event)

| Sub-Event | Handler   | Description |
|-----------|-----------|-------------|
| 0x00      | 0x0088DD  | Store event_code to D177B8, jump to epilogue |
| 0x01      | 0x0088E6  | Store event_code to D177B8, jump to epilogue |
| 0x02      | 0x0088EF  | Store event_code to D177B8, jump to epilogue |
| 0x03      | 0x0088F8  | Store event_code to D177B8, jump to epilogue |
| 0x04      | 0x008901  | Store event_code to D177B8, jump to epilogue |
| 0x10      | 0x00890A  | Store event_code to D177B8, jump to epilogue |
| 0x11      | 0x008913  | Store event_code to D177B8, jump to epilogue |
| 0x12      | 0x00891C  | Store event_code to D177B8, jump to epilogue |
| 0x13      | 0x008925  | Store event_code to D177B8, jump to epilogue |
| 0x14      | 0x00892E  | Store event_code to D177B8, jump to epilogue |
| 0x15      | 0x008937  | Store event_code to D177B8, jump to epilogue |
| default   | 0x008940  | Set error flag IX-1 = 0x02, jump to epilogue |

**Key observation**: All 11 case handlers are identical — each writes IX+6 (event_code) to RAM address D177B8, then jumps to the epilogue. The function is a **state transition recorder**: it validates the transition is legal (via 0x0085E3 and 0x00863A), then stores the new event_code as the current USB state.

### Event Code Mapping from 0x00FBD1

The 0x00FBD1 USB event demultiplexer sends (event_code, sub_event) pairs. The dispatch here is on sub_event:

| Event Code | Sub-Event | Dispatches To |
|------------|-----------|---------------|
| 0x01       | 0x00      | case 0x00 -> 0x0088DD |
| 0x44       | 0x02      | case 0x02 -> 0x0088EF |
| 0x45       | 0x02      | case 0x02 -> 0x0088EF |
| 0x06       | 0x03      | case 0x03 -> 0x0088F8 |
| 0x80       | 0x10      | case 0x10 -> 0x00890A |
| 0x81       | 0x10      | case 0x10 -> 0x00890A |
| 0x84       | 0x11      | case 0x11 -> 0x008913 |
| 0xC3       | 0x12      | case 0x12 -> 0x00891C |

Sub-events 0x00-0x04 appear to be "low-speed" USB states, 0x10-0x15 appear to be "high-speed" or alternate-mode USB states.

## CALL Targets

| Address  | Purpose | Called From |
|----------|---------|-------------|
| 0x002197 | Stack frame allocator (LD HL = local size) | 0x008840 |
| 0x0085E3 | USB state validator — checks if transition is valid | 0x00885B |
| 0x00863A | Event code pre-processor / gate | 0x008891 |
| 0x00211B | Inline case dispatcher | 0x0088A8 |
| 0x00883C | **Self** (recursive call for re-entrant state change) | 0x008870 |

## RAM Variables

| Address  | Type  | Usage |
|----------|-------|-------|
| D177B8   | Write | **USB current event code** — written by all 11 case handlers with IX+6 (event_code parameter) |
| D177B9   | R/W   | **USB current sub-event** — read at entry to detect re-entrant state change; written with new sub_event after recursive self-call |

## Callers

78 CALL sites found across the ROM. Notable clusters:
- **0x008A-0x0093**: ~30 callers — the USB state machine core (adjacent functions)
- **0x00EF-0x00FD**: ~15 callers — USB descriptor/enumeration layer
- **0x0120-0x0138**: ~12 callers — USB endpoint/transfer layer
- **0x0156-0x0157**: 4 callers — USB flag/timer layer

## Architecture Summary

0x00883C is the **USB state transition function**. Its calling convention is:

```
IX+6 = event_code (1 byte) — the USB event type (0x01, 0x06, 0x44, 0x45, 0x80, 0x81, 0x84, 0xC3, etc.)
IX+9 = sub_event (1 byte) — the state class (0x00-0x04 = low group, 0x10-0x15 = high group)
```

The function:
1. Disables interrupts (atomic state transition)
2. Handles re-entrant calls — if a new sub_event arrives while processing a different sub_event, it recursively processes the old one first
3. Validates the transition via `0x0085E3` (state validator) and `0x00863A` (event gate)
4. Records the event_code in D177B8 (the "current USB state" variable)
5. Returns 0 (success), 1 (validation failed), or 2 (unknown sub_event) in A via IX-1

The fact that all 11 case handlers do the identical thing (store event_code to D177B8) suggests that the real differentiation happens in the validation calls (0x0085E3 and 0x00863A), which likely maintain separate state machines or lookup tables per sub_event class. The case table exists so that future firmware could add per-sub_event behavior without restructuring.

## Instruction Count

- Total bytes decoded: 278
- Inline case table: 48 bytes (0x0088AC-0x0088DB) — data, not code
- Actual executable code: ~230 bytes
- Prologue (frame + DI + guard): 0x00883C-0x008882 (71 bytes)
- Validation: 0x008883-0x0088A7 (37 bytes) 
- Case dispatch + handlers: 0x0088A8-0x008943 (156 bytes, including 48-byte table)
- Epilogue (restore IF, return): 0x008944-0x008951 (14 bytes)
