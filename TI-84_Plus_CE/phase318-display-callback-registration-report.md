# Phase 318 — Display Callback Registration System

## Summary

Traced the complete display callback registration infrastructure at RAM D177BC-D177E1. The system exposes 4 OS API vectors (dispatch, clear+init, install, reset) spanning a 26-vector display subsystem cluster (vectors 224-252). All callback slot writes go through the install function (vector 248) or the clear function (vector 225). **No callbacks are installed by the OS itself** — the install/clear C library wrappers have zero ROM callers, confirming this is a pure SDK API for external programs (TI-BASIC apps, ASM programs). The OS only initializes/resets the callback struct during boot and provides the ISR-driven dispatch mechanism.

## 4 Core API Vectors

| Vector | Address | JP Target | Function | ROM Callers |
|--------|---------|-----------|----------|-------------|
| 224 | 0x000580 | 0x010220 | **Dispatch** — iterate 5 slots, null-check, invoke via JP (IY) | 2 (0x05F685 wrapper, 0x001A9D direct) |
| 225 | 0x000584 | 0x010F00 | **Clear+Init** — zero all 5 slots, set master enable = 1 | 1 (0x05FDF9 C wrapper, 0 callers of wrapper) |
| 248 | 0x0005E0 | 0x01069C | **Install** — _seqcase on slot index (1-5), store BC to slot | 2 (0x05F789, 0x05F7A1 C wrappers, 0 callers of either) |
| 249 | 0x0005E4 | 0x010EDD | **Reset** — if D177BC != 1, memset(D177BD, 0, 0x71) | 1 (0x05FDEA C wrapper, 1 caller: 0x040C43) |

## Display Subsystem Vector Cluster (224-252)

All 26 vectors in the 224-252 range (except 243, 253, 254) target implementations in the 0x010200-0x010F00 range, forming a cohesive display subsystem:

| Vector | Target | Purpose |
|--------|--------|---------|
| 224 | 0x010220 | Callback dispatch |
| 225 | 0x010F00 | Clear all + init |
| 226 | 0x010F87 | Read master enable (LD A,(D177BC); RET) |
| 227-242 | 0x010A50-0x010782 | LCD port operations, secondary callback dispatch |
| 244 | 0x0103A4 | Display parameter setup |
| 245-247 | 0x010553-0x01061D | Display mode handlers |
| 248 | 0x01069C | Install callback |
| 249 | 0x010EDD | Reset callback struct |
| 250-252 | 0x0109B7-0x0109ED | Display status queries |

## Callback Slot Writes (All ROM References)

Every write to D177BD-D177C9 occurs in exactly 2 locations:

| Slot | Address | Write Site 1 (Install) | Write Site 2 (Clear) |
|------|---------|----------------------|---------------------|
| 0 | D177BD | 0x0106C1: LD (D177BD),BC | 0x010F13: LD (D177BD),BC=0 |
| 1 | D177C0 | 0x0106CB: LD (D177C0),BC | 0x010F18: LD (D177C0),BC=0 |
| 2 | D177C3 | 0x0106D5: LD (D177C3),BC | 0x010F1D: LD (D177C3),BC=0 |
| 3 | D177C6 | 0x0106DF: LD (D177C6),BC | 0x010F22: LD (D177C6),BC=0 |
| 4 | D177C9 | 0x0106E9: LD (D177C9),BC | 0x010F27: LD (D177C9),BC=0 |

Total D177BD-D177CB references in ROM: 21 (10 writes + 11 reads, including 1 LD BC,D177BD immediate in the reset memset call).

## Install Function Disassembly (0x01069C, Vector 248)

```
0x01069C: CALL 0x00218A          ; frame setup (PUSH IX; LD IX,SP)
0x0106A0: CALL 0x002623          ; _seqcase dispatch
          ; inline table: 5 cases (values 1-5 for slots 0-4)
          ; Each case:
          ;   LD BC,(IX+9)       ; callback address from stack parameter
          ;   LD (D177xx),BC     ; store to selected slot
          ;   JR epilog
0x0106C1: LD (D177BD),BC         ; case 1 -> slot 0
0x0106CB: LD (D177C0),BC         ; case 2 -> slot 1
0x0106D5: LD (D177C3),BC         ; case 3 -> slot 2
0x0106DF: LD (D177C6),BC         ; case 4 -> slot 3
0x0106E9: LD (D177C9),BC         ; case 5 -> slot 4
          ; epilog: LD SP,IX; POP IX; RET
```

Calling convention: 2 stack parameters — slot index (1-based, in first push) and callback address (24-bit, in second push).

## C Library Wrappers

| Wrapper | Purpose | OS Vector | ROM Callers |
|---------|---------|-----------|-------------|
| 0x05F77D | installCallback(slotIdx, callbackAddr) | 248 (0x0005E0) | **0** |
| 0x05F794 | clearSlot(slotIdx) — stores BC=0 | 248 (0x0005E0) | **0** |
| 0x05FDF3 | clearAllSlots(flags) | 225 (0x000584) | **0** |
| 0x05FDEA | resetCallbackStruct() | 249 (0x0005E4) | **1** (0x040C43) |
| 0x05FDE5 | readSlot4Flag() — returns D177E1 | N/A (direct read) | **1** (0x043269) |
| 0x05FE03 | readMasterEnable() — returns D177BC | N/A (direct read) | **2** (0x0432DE, 0x056B97) |
| 0x05FE08 | setMasterEnable() — sets D177BC=1 | N/A (direct write) | **0** |
| 0x05F685 | dispatchCallbacks() | 224 (0x000580) | **1** (0x03D14F LCD SPI handler) |

## Boot / Initialization Sequence

1. **Early boot** (0x000867, 0x0008B3): `XOR A; LD (D177BC),A` — master enable = 0
2. **OS init** (0x04039F): `XOR A; LD (D177BC),A; LD (D177B7),A` — disable, then `CALL 0x040C41` which calls `resetCallbackStruct()` at 0x05FDEA → memset(D177BD, 0, 0x71) clearing 113 bytes
3. **App startup**: External program calls vector 225 (clear+init) which zeros all 5 slots AND sets D177BC = 1 (master enable)
4. **App installs callbacks**: External program calls vector 248 (install) with slot index and function pointer

## Dispatch Path (Runtime)

```
LCD SPI completion ISR:
  0x000043 → 0x0006F3 → 0x00071C → 0x02010C → 0x03CF7D
  0x03D14F: SET 4,A case → CALL 0x05F685 → CALL 0x000580 → JP 0x010220

Second LCD SPI handler (direct):
  0x001A9D: CALL 0x010220  (bypasses vector, calls implementation directly)
```

## Why No OS-Installed Callbacks?

The display callback system is an **SDK-only API**. The OS provides:
1. The dispatch infrastructure (ISR-driven, LCD-synchronized)
2. The install/clear/reset API via vectors
3. The C library wrappers for app use

But the OS itself never installs display callbacks because:
- The install wrapper (0x05F77D) has 0 callers in ROM
- The clear wrapper (0x05FDF3) has 0 callers in ROM
- No code outside the install/clear functions writes to D177BD-D177C9
- D177D6 (pending flags) is only accessed within the dispatch function itself

Apps (graphing calculators, games, utilities) use this API to register display update callbacks that fire when LCD SPI transactions complete, enabling custom rendering synchronized to the display refresh cycle.

## D177D6 Pending Flags (Internal to Dispatch)

The pending-flags bitmask at D177D6 is entirely managed within the dispatch function (0x010220):
- **Set** by the dispatch function based on LCD port status checks (CALL 0x007DC7, IN from 0x8034)
- **Cleared** after each callback fires (RES n,A instructions at 0x010284, 0x0102B6, 0x0102DB)
- **No external writers** — zero writes to D177D6 outside the dispatch function

This confirms that callback dispatch timing is driven by LCD hardware state, not by external flag-setting.

## Key Addresses

| Address | Role |
|---------|------|
| 0x000580 | OS vector 224 — dispatch |
| 0x000584 | OS vector 225 — clear + init |
| 0x0005E0 | OS vector 248 — install |
| 0x0005E4 | OS vector 249 — reset |
| 0x010220 | Dispatch implementation |
| 0x01069C | Install implementation (_seqcase) |
| 0x010EDD | Reset implementation (memset) |
| 0x010F00 | Clear+init implementation |
| 0x05F685 | Dispatch C wrapper (1 caller) |
| 0x05F77D | Install C wrapper (0 callers) |
| 0x05F794 | Clear-slot C wrapper (0 callers) |
| 0x05FDEA | Reset C wrapper (1 caller: boot) |
| 0x05FDF3 | Clear-all C wrapper (0 callers) |
| 0x040C43 | Boot init — calls reset |
| 0x001A9D | LCD SPI handler — direct dispatch call |
| D177BC | Master enable flag |
| D177BD-D177C9 | 5 callback slots (3 bytes each) |
| D177D6 | Pending-flags bitmask (internal to dispatch) |
| D177D7 | Secondary flag byte |
| D177E1 | Slot 4 active flag |
