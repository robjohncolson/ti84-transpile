# Phase 316: Multi-Callback Orchestrator at 0x0241A3

**Probe**: `probe-phase316-orchestrator.mjs`

## Overview

Function 0x0241A3 is the most _indcall-dense function in the ROM, with 5 `CALL 0x00015C` dispatch sites. It is an **event/notification dispatcher** that iterates a linked list of registered handler structures, tests each one against filter criteria, and invokes up to 5 different callbacks per matching handler.

The function takes a **command byte** in register A, whose individual bits control which callbacks fire, which validation filters apply, and which function pointer table to use.

## Function Boundaries

- **Start**: 0x0241A3 (PUSH IX prologue)
- **End**: 0x0242D9 (POP IX; RET)
- **Size**: 311 bytes
- **Post-function data**: 0x0242DA-0x0242E5 (sentinel byte 0xFF + null-check helper)

## Stack Frame Layout (24 bytes of locals)

| Offset | Size | Role | Details |
|--------|------|------|---------|
| IX-21 | 1 | Command byte | A register on entry, bits tested individually |
| IX-20 | 1 | Positive-result counter | Incremented when callback returns positive |
| IX-19 | 1 | Negative-result counter | Incremented when callback returns negative |
| IX-18 | 3 | Secondary dispatch target | HL from bit-0 branch (0x000138 or 0x0242DD) |
| IX-15 | 3 | Primary dispatch target | HL from bit-2 branch (0x047432 or 0x0000C8) |
| IX-12 | 3 | Saved cursor | Preserves iterator position across callbacks |
| IX-9 | 3 | Sentinel/result slot | DE from bit-0 branch (0x0242DB or 0x0242DC); later stores intermediate results |
| IX-6 | 3 | Current element pointer | Return value from sentinel_check (0x024027) |
| IX-3 | 3 | Iterator cursor | HL used for linked-list traversal |

## Command Byte Bit-Field

| Bit | Test Site | Meaning |
|-----|-----------|---------|
| 0 | 0x0241C1 | **Dispatch table selector**: set → use 0x000138 + sentinel 0xFF; clear → use 0x0242DD + sentinel 0x00 |
| 1 | 0x02420C | **Skip-if-enabled filter**: when clear, tests offset +0x10E bit 0 of each element — skip if set |
| 2 | 0x0241DF | **Primary callback selector**: set → 0x047432; clear → 0x0000C8 |
| 3 | 0x02421E | **Extra validation**: when set, calls 0x024763 (callback_validate) — skip element if it returns Z |
| 4 | 0x02422A | **Secondary filter**: when clear, tests offset +0x10C bit 2 of each element — skip if set |
| 7 | 0x0242B1 | **Internal error flag**: SET by the function itself at 0x024281 when a callback pair signals an error; tested at exit for cleanup |

## The 5 _indcall Dispatch Sites

| # | Address | IX Source | Role | Args pushed |
|---|---------|-----------|------|-------------|
| 1 | 0x02424C | IX-15 (primary) | **Main callback** — first invocation on each matching element | element_ptr, 0xD005F9 |
| 2 | 0x024270 | IX-15 (primary) | **Positive/negative handler** — called after main callback returns non-zero | element_ptr, 0xD005F9 |
| 3 | 0x024279 | IX-18 (secondary) | **Secondary dispatch** — immediately follows #2, uses secondary target | (stack from #2) |
| 4 | 0x024290 | IX-15 (primary) | **Error path primary** — called after SET 7,(IX-21) marks error | sentinel, element_ptr, 0xD005F9 |
| 5 | 0x024299 | IX-18 (secondary) | **Error path secondary** — paired with #4, uses secondary target | (stack from #4) |

All 5 sites push 0xD005F9 as a "context" argument — likely a fixed OS data structure base address.

### Dispatch Pairs

Sites 2+3 and 4+5 form **paired dispatches**: the primary callback (IX-15) is called first, then immediately the secondary callback (IX-18) without clearing the stack. This pattern suggests the secondary is a "commit" or "notify" step following the primary action.

## Control Flow

```
Entry: A = command byte
  RES 7,A (clear error flag)
  Store A at IX-21, zero counters at IX-19/IX-20

  Bit 0 → select dispatch table (IX-18) and sentinel (IX-9)
  Bit 2 → select primary callback (IX-15)

  LOOP (at 0x0241F9):
    LD HL,(IX-3)           ; current iterator position
    CALL 0x023FDA          ; get next element
    JP Z, EXIT             ; no more elements → done
    Store HL at IX-3
    if *(HL) != 0x81 → continue loop (skip non-handler entries)

    BIT 1 filter: if clear, check element+0x10E bit 0 → skip if set
    BIT 3 filter: if set, CALL 0x024763 → skip if Z
    BIT 4 filter: if clear, check element+0x10C bit 2 → skip if set

    CALL 0x024027          ; sentinel_check — validate element
    Store result at IX-6

    _indcall #1: primary callback(element_ptr, 0xD005F9)
    CALL 0x000138          ; check return value
    if Z → continue loop
    if positive → INC IX-20, else INC IX-19

    _indcall #2: primary callback(element_ptr, 0xD005F9)
    _indcall #3: secondary callback(...)
    if negative → JP to loop end
    SET 7,(IX-21)          ; mark error

    _indcall #4: primary callback(sentinel, element_ptr, 0xD005F9)
    _indcall #5: secondary callback(...)
    if positive → JP to loop end
    Save element_ptr and cursor for cleanup
    JP LOOP

  EXIT (at 0x0242B1):
    if BIT 7 set → CALL 0x0000CC with sentinel and 0xD005F9 (error cleanup)
    Return: B=positive_count, C=negative_count, DE=saved_cursor
```

## Callers

### 9 Wrapper Functions (0x0242E6-0x024327)

Each is a 5-byte `LD A,xx ; CALL 0x0241A3 ; RET` wrapper:

| Address | A Value | Bits Active | Likely Purpose |
|---------|---------|-------------|----------------|
| 0x0242E6 | 0x01 | bit0 | Basic dispatch (table A) |
| 0x0242ED | 0x17 | bit0,1,2,4 | Full dispatch with all filters (table A, callback B) |
| 0x0242F4 | 0x05 | bit0,2 | Dispatch with alt callback (table A, callback B) |
| 0x0242FB | 0x00 | none | Minimal dispatch (table B, callback A, no filters) |
| 0x024302 | 0x16 | bit1,2,4 | Filtered dispatch (table B, callback B) |
| 0x024309 | 0x04 | bit2 | Alt callback only (table B) |
| 0x024310 | 0x09 | bit0,3 | Dispatch with validation (table A) |
| 0x024317 | 0x0D | bit0,2,3 | Dispatch with validation + alt callback |
| 0x02431E | 0x0C | bit2,3 | Alt callback with validation (table B) |

### Jump Table Entry

0x0241A3 is entry index 4 in the JP vector table at 0x0217B0 (16 entries from 0x0217B0-0x0217EC). This table is part of the OS API dispatch infrastructure.

## Key Addresses

| Address | Role |
|---------|------|
| 0x023FDA | Iterator — gets next element from linked list |
| 0x024027 | Sentinel check — validates element has 0x83, 0x84 markers at specific offsets |
| 0x024763 | Callback validator — extra validation for bit-3 path |
| 0x000138 | _frameset — used to check callback return value |
| 0x0000CC | _frameset0 — error cleanup dispatch |
| 0x00015C | _indcall — JP (IY) trampoline at 0x002288 |
| 0xD005F9 | Fixed context pointer — pushed as arg to every callback |
| 0x047432 | Primary callback target (when bit 2 set) |
| 0x0000C8 | Primary callback target (when bit 2 clear) |

## Struct Layout of Iterated Elements

Each element in the linked list has:
- Byte at offset +0x000: type tag (must be 0x81 for handler entries)
- Byte at offset +0x10C: filter flags (bit 2 tested when bit 4 of command is clear)
- Byte at offset +0x10E: filter flags (bit 0 tested when bit 1 of command is clear)

This 0x10E+ size suggests the iterated elements are **large OS structures** (~270+ bytes each), consistent with app/module registration blocks.

## Interpretation

This is the TI-OS **registered-handler dispatcher**. The linked list contains handler registration structures (tagged with 0x81). Each structure has filter flags at large offsets (+0x10C, +0x10E) suggesting they are part of a comprehensive app/module descriptor.

The 9 wrapper functions represent 9 distinct event types or dispatch modes. The bit-field command byte controls:
- Which callback function pointer table to use (two tables: one via 0x000138/_frameset, one via 0x0242DD)
- Which filters to apply before invoking callbacks
- Whether to run extra validation
- Error handling and cleanup behavior

The function counts positive and negative callback results (IX-20, IX-19) and returns them in B and C, allowing the caller to know how many handlers accepted vs rejected the event.
