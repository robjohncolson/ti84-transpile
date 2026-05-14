# Phase 316: Shared _seqcase Epilogues Report

**Date**: 2026-05-13
**Probe**: `probe-phase316-seqcase-epilogues.mjs`
**Artifacts**: This report

## Overview

Two addresses were identified by phase 315 as "shared epilogues" used by multiple `_seqcase` switch-case tables:
- **0x049CC2** -- used by 7 `_seqcase` tables (all as default target)
- **0x008834** -- used by 5 `_seqcase` tables (all as default target)

Both are **ZDS II C compiler function epilogues** -- the standard stack-frame teardown sequence that returns from a C function.

## Disassembly

Both epilogues share the **identical 4-instruction sequence**:

```
  LD A,(IX-1)    ; load return value from local variable at frame offset -1
  LD SP,IX       ; collapse stack frame (discard all locals/temps)
  POP IX         ; restore caller's IX frame pointer
  RET            ; return to caller
```

### Epilogue A -- 0x049CC2

```
  0x049CC2  dd 7e ff           LD A,(IX-1)
  0x049CC5  dd f9              LD SP,IX
  0x049CC7  dd e1              POP IX
  0x049CC9  c9                 RET
```

Code immediately after (0x049CCA) is a **separate function** that:
- Allocates a stack frame (`CALL 0x00012C` via `LD HL,0xFFFFFF`)
- Reads `(0xD177B9)` (a global mode/state byte)
- Compares it to `(IX+9)` (a parameter)
- Calls `0x0499C0` for validation, then recursively calls `0x049CCA` itself
- Eventually calls `0x049A23` for further processing

### Epilogue B -- 0x008834

```
  0x008834  dd 7e ff           LD A,(IX-1)
  0x008837  dd f9              LD SP,IX
  0x008839  dd e1              POP IX
  0x00883B  c9                 RET
```

Code immediately after (0x00883C) is a **structurally identical function** to epilogue A's successor:
- Allocates a stack frame (`CALL 0x002197`)
- Reads `(0xD177B9)` (same global)
- Compares it to `(IX+9)`
- Calls `0x0085E3` for validation, then recursively calls `0x00883C` itself
- Eventually calls `0x00863A` for further processing

The two successor functions are **parallel implementations** -- same algorithm, different helper addresses. This suggests epilogues A and B belong to two copies of the same module (possibly flash vs. RAM, or two OS subsystem copies).

## Reference Counts

### Epilogue A (0x049CC2)

| Type | Count | Addresses |
|------|-------|-----------|
| JP refs | 10 | 0x049AA3, 0x049ACD, 0x049AED, 0x049B20, 0x049B5F, 0x049B87, 0x049BAE, 0x049BD8, 0x049C0C, 0x049C30 |
| CALL refs | 0 | -- |
| _seqcase table entries | 14 | (3-byte LE in jump tables) |
| _seqcase tables (as default) | 7 | See below |
| **Total references** | **24** | |

### Epilogue B (0x008834)

| Type | Count | Addresses |
|------|-------|-----------|
| JP refs | 6 | 0x0086B4, 0x0086D4, 0x008707, 0x008743, 0x00876B, 0x008792 |
| CALL refs | 0 | -- |
| _seqcase table entries | 10 | (3-byte LE in jump tables) |
| _seqcase tables (as default) | 5 | See below |
| **Total references** | **16** | |

## _seqcase Tables Using These Epilogues

All references are as the **default target** -- meaning these epilogues handle "no matching case" by returning from the enclosing function.

### Tables using epilogue A (0x049CC2)

| Call site | Count | Base | Key range | Case target | Default |
|-----------|-------|------|-----------|-------------|---------|
| 0x049A8A | 3 | 0xA0 | 0xA0-0xA2 | 0x049A9F | **0x049CC2** |
| 0x049AAE | 5 | 0x01 | 0x01-0x05 | 0x049AC9 | **0x049CC2** |
| 0x049AF8 | 8 | 0x40 | 0x40-0x47 | 0x049B1C | **0x049CC2** |
| 0x049B2B | 12 | 0x06 | 0x06-0x11 | 0x049B5B | **0x049CC2** |
| 0x049B92 | 4 | 0x83 | 0x83-0x86 | 0x049BAA | **0x049CC2** |
| 0x049BB9 | 5 | 0xC0 | 0xC0-0xC4 | 0x049BD4 | **0x049CC2** |
| 0x049C3B | 3 | 0xA5 | 0xA5-0xA7 | 0x049C50 | **0x049CC2** |

### Tables using epilogue B (0x008834)

| Call site | Count | Base | Key range | Case target | Default |
|-----------|-------|------|-----------|-------------|---------|
| 0x008695 | 5 | 0x01 | 0x01-0x05 | 0x0086B0 | **0x008834** |
| 0x0086DF | 8 | 0x40 | 0x40-0x47 | 0x008703 | **0x008834** |
| 0x008712 | 11 | 0x06 | 0x06-0x10 | 0x00873F | **0x008834** |
| 0x008776 | 4 | 0x83 | 0x83-0x86 | 0x00878E | **0x008834** |
| 0x00879D | 5 | 0xC0 | 0xC0-0xC4 | 0x0087B8 | **0x008834** |

## Context Before Epilogues

The bytes immediately before each epilogue are **_seqcase jump table data** (3-byte LE addresses), confirming these epilogues sit at the end of a dense block of switch-case dispatch code:

- Before epilogue A: repeating pattern of `C2 9C 04` (address 0x049CC2) interspersed with case-specific bytes
- Before epilogue B: repeating pattern of `34 88 00` (address 0x008834) interspersed with case-specific bytes

Both are preceded by a `JR +4` that skips over `LD (IX-1),0x01` to reach the epilogue -- this is a "set return value to 0 then exit" vs "set return value to 1 then exit" pattern.

## Classification

**Type: C function return stub (compiler-generated epilogue)**

These are NOT error handlers, branch-to-processing blocks, or special dispatch targets. They are the standard ZDS II C compiler function epilogue -- the code the compiler emits at the end of every C function to:

1. Load the return value from the local frame (`LD A,(IX-1)`)
2. Tear down the stack frame (`LD SP,IX`)
3. Restore the caller's frame pointer (`POP IX`)
4. Return (`RET`)

## Why Multiple Switch Blocks Converge Here

The enclosing function contains a **cascade of switch statements** that classify an input value by category:

- Keys 0xA0-0xA2 (group A only)
- Keys 0x01-0x05
- Keys 0x40-0x47
- Keys 0x06-0x11 (or 0x06-0x10 in B)
- Keys 0x83-0x86
- Keys 0xC0-0xC4
- Keys 0xA5-0xA7 (group A only)

Each switch handles its recognized cases and falls through to the epilogue for unrecognized values. The key ranges (0x01-0x05, 0x06-0x11, 0x40-0x47, 0x83-0x86, 0xA0-0xA2, 0xA5-0xA7, 0xC0-0xC4) strongly suggest **TI-OS key group classification** -- these are scan code ranges for different key groups on the calculator keyboard.

The function's logic is: "given a scan code, check which key group it belongs to; if recognized, process it; if not, return via the epilogue."

## Parallel Structure

Epilogues A and B are two copies of what appears to be the **same function** compiled for two different contexts:

| Feature | Epilogue A (0x049CC2) | Epilogue B (0x008834) |
|---------|----------------------|----------------------|
| Frame allocator | CALL 0x00012C | CALL 0x002197 |
| Validator | CALL 0x0499C0 | CALL 0x0085E3 |
| Handler | CALL 0x049A23 | CALL 0x00863A |
| Global state byte | 0xD177B9 | 0xD177B9 (same) |
| Table case counts | 3,5,8,12,4,5,3 | 5,8,11,4,5 |

The case counts are nearly identical (A has two extra tables for key groups 0xA0-0xA2 and 0xA5-0xA7). Both read the same global at `0xD177B9`. This is consistent with two builds of the same key-dispatch function, possibly for different calculator modes or OS layers.

## Probe Output

Run with: `node TI-84_Plus_CE/probe-phase316-seqcase-epilogues.mjs`

The probe produces:
1. Full disassembly of both epilogues (64 bytes each)
2. Extended disassembly (128 bytes) showing the successor functions
3. Context before each epilogue (32 bytes of jump table data)
4. All JP/CALL references
5. All 3-byte LE references in potential jump tables
6. All 83 _seqcase call sites, with the 12 tables that reference these epilogues decoded in full
7. Summary and classification
