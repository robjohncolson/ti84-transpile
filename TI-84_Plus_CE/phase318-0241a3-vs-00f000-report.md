# Phase 318: 0x0241A3 vs 0x00F000 Event/Callback System Correlation

**Date**: 2026-05-14 (auto-session 318)
**Probe**: `probe-phase318-0241a3-vs-00f000.mjs`

---

## Verdict: Independent Sibling Systems (Option C)

The two event/callback dispatchers are **completely independent** -- no hierarchical relationship, no shared RAM, no shared callees, and no direct or indirect cross-references. They are parallel OS subsystems that happen to serve similar roles (event dispatch via function pointers) but operate on different data structures, different RAM regions, and different caller populations.

---

## Evidence Summary

### 1. No Direct Cross-Calls

| Direction | Result |
|-----------|--------|
| 0x0241A3 body -> 0x00F000 cluster | **None**. All 11 CALL/JP targets from 0x0241A3 are outside the cluster. |
| 0x00F000 cluster -> 0x0241A3 or wrappers (0x0242E6-0x024327) | **None**. Full scan of 0x00F000-0x010090 found zero references. |
| 0x0241A3 wrappers -> 0x00F000 cluster | **None**. All 9 wrappers only call 0x0241A3 itself. |

### 2. No Shared RAM Addresses

| RAM Address | 0x0241A3 | 0x00F000 | Shared? |
|-------------|----------|----------|---------|
| D005F9 (context ptr) | Yes (all 5 _indcall sites) | No | No |
| D13FED (callback struct base) | No | Yes (entries 173, 174) | No |
| D177B8 (control word) | No | Yes (13 refs) | No |
| D177B7 (control byte) | No | Yes (6 refs) | No |
| D1440E/D1440F (event flags) | No | Yes (13 refs combined) | No |
| D14074/D14084 (struct fields) | No | Yes (15 refs combined) | No |
| D176FB/D1400B (state vars) | No | Yes (14 refs combined) | No |

The two systems operate on entirely disjoint RAM regions.

### 3. No Shared Callees

| Callee | 0x0241A3 uses | 0x00F000 uses |
|--------|---------------|---------------|
| 0x00015C (JP 0x002288 = JP (IY)) | Yes (5 sites) | No (calls 0x002288 directly) |
| 0x002288 (JP (IY) trampoline) | Via 0x00015C | Yes (8 sites) |
| 0x000138 (_frameset) | Yes | No |
| 0x0000CC (_frameset0) | Yes | No |
| 0x023FDA (linked-list iterator) | Yes | No |
| 0x024027 (sentinel check) | Yes | No |
| 0x024763 (callback validator) | Yes | No |
| 0x0021C2 (null-pointer check) | No | Yes (36 sites) |
| 0x00883C (DI/save IFF) | No | Yes (12 sites) |
| 0x002197 (frame allocator) | No | Yes (4 sites) |

The only shared primitive is the ultimate JP (IY) instruction at 0x002288, but they reach it through different wrappers (0x00015C vs direct CALL). Zero overlap in utility functions.

### 4. No Shared Callers

| Caller Region | Calls 0x0241A3 wrappers | Calls 0x00F000 entries |
|---------------|------------------------|----------------------|
| 0x009xxx | -- | 0x009543, 0x00966B |
| 0x00Cxxx | -- | 0x00C70D, 0x00C734 |
| 0x015xxx | -- | 0x01561B, 0x0156D2 |
| 0x028xxx | -- | 0x0287C1 |
| 0x02Cxxx | 0x02C893 | -- |
| 0x03Dxxx-0x03Exxx | 0x03DB45, 0x03DB50, 0x03E5E2, 0x03E78E, 0x03E95F, 0x03E999 | -- |
| 0x055xxx-0x056xxx | -- | 0x055CA5, 0x056B83 |
| 0x069xxx | -- | 0x069D38 |
| 0x084xxx-0x086xxx | 0x084F3B, 0x084F45, 0x08674A, 0x086758 | 0x086A13, 0x086A1B |
| 0x098xxx | -- | 0x098F50 |

The only region with callers to BOTH systems is 0x084xxx-0x086xxx, but they are in **different functions** (separated by multiple RET instructions, 699+ bytes apart). This suggests the 0x086xxx region is an "app framework" area that uses both dispatch systems independently.

### 5. Sub-Callee RAM Check

Checked 0x0241A3's sub-callees (0x023FDA, 0x024027, 0x024763) for D13FED references: none found. The linked-list infrastructure used by 0x0241A3 is entirely separate from the D13FED struct table used by 0x00F000.

---

## Architectural Comparison

| Property | 0x0241A3 System | 0x00F000 System |
|----------|-----------------|-----------------|
| **Dispatch mechanism** | Linked-list iteration with bit-field filter | Struct-table indexed by parameter |
| **_indcall trampoline** | 0x00015C (JP 0x002288) | 0x002288 direct |
| **Callback storage** | Function pointers in linked-list elements | Function pointers at struct offset +0 |
| **Element size** | Large (0x10E+ bytes, type-tagged 0x81) | Struct at D13FED base, indexed |
| **Context argument** | D005F9 (fixed OS data structure) | None (uses IX frame locals) |
| **Return convention** | B=positive count, C=negative count | A=result code (0x00/0x01/0x04/0x06) |
| **Null check** | Via 0x024027 sentinel check + 0x000138 | Via 0x0021C2 (HL==0 test), 36 sites |
| **API surface** | 9 wrappers at 0x0242E6-0x024327 | OS jump table entries 168/169/173/174 |
| **Command byte** | Yes (bits 0-4,7 = 6 active bits) | No (parameter is struct index) |
| **Interrupt safety** | No DI/EI observed | Yes, 12 calls to 0x00883C (DI+save IFF) |
| **Frame setup** | Manual stack allocation (24 bytes) | 0x002197 C-style frame (3-18 bytes) |

---

## Interpretation

These are two parallel OS subsystems that serve different layers of the TI-OS event architecture:

- **0x0241A3** ("Registered-Handler Dispatcher"): Iterates ALL registered app/module handler structures (linked list), applies bit-field filters, and invokes matching handlers. This is the **broadcast** layer -- "notify all registered listeners that event X happened." The 9 wrappers represent 9 event types.

- **0x00F000** ("Callback-Slot Dispatcher"): Invokes specific callback slots from a fixed struct table at D13FED. This is the **targeted** layer -- "invoke the callback registered in slot N." The 4 jump table entries are the public API (register, dispatch, extended dispatch, indirect dispatch).

The broadcast system (0x0241A3) would be used for events that multiple modules need to hear about (screen refresh, mode change, etc.). The slot system (0x00F000) would be used for specific one-to-one callback registrations (timer callback, key handler, etc.).

Both systems ultimately dispatch through JP (IY) but share nothing else -- different data structures, different RAM, different callers, different utility functions.

---

## Probe Results

```
=== Cross-Reference Analysis ===
CALL/JP from 0x0241A3 to 0x00F000 cluster: 0
CALL/JP from 0x00F000 cluster to 0x0241A3: 0
Shared RAM addresses: 0
Shared callees (excluding JP(IY)): 0
Shared callers (same function): 0

Verdict: INDEPENDENT SIBLING SYSTEMS
```
