# Phase 315 Report — D177BD-D177C9 Display Callback Cluster

## Summary

The 5 callback slots at D177BD-D177C9 form a **display event callback system** with OS API vector entries for install, dispatch, and clear operations. All writes use `LD (slot),BC` (dynamic callback addresses from registers, not static immediates). All reads use a two-step null-check-then-dispatch pattern via the `_indcall` JP (IY) trampoline at 0x002288.

## Slot Table

| Slot | RAM Address | Flag Gate | Flag Source | Writes | Reads (real) |
|------|------------|-----------|-------------|--------|-------------|
| 0    | D177BD     | any bit set (OR A) | D177D6 | 2 | 2 |
| 1    | D177C0     | bit 1 (AND 0x02) | D177D6 | 2 | 2 |
| 2    | D177C3     | bit 2 (AND 0x04) | D177D6 | 2 | 2 |
| 3    | D177C6     | bit 3 (AND 0x08) | D177D6 + IX frame | 2 | 2 |
| 4    | D177C9     | bit 4 (AND 0x10) | IX frame byte | 2 | 2 |

**Note**: The probe reported 3 reads per slot, but one is a false positive. `LD HL,(slot)` at offset N is a real null-check read, and `LD IY,(slot)` at offset N+4 is the real dispatch read. The third "match" (`LD HL` at N+5) is actually the `2A xx 77 D1` substring embedded inside the 5-byte `FD 2A xx 77 D1` (LD IY) instruction.

## Architecture

### Three OS API Vector Entries

| Vector Entry | Address | Implementation | Purpose |
|-------------|---------|---------------|---------|
| 224 (0x000580) | JP 0x010220 | Dispatch function | Iterate all 5 slots, null-check, invoke via JP (IY) |
| 225 (0x000584) | JP 0x010F00 | Clear function | Zero all 5 slots (LD BC,0; store to each) |
| 248 (0x0005E0) | JP 0x01069C | Install function | _seqcase on slot index (1-5), store BC to selected slot |

### Dispatch Function (0x010220, Vector 224)

Entry sequence:
1. `LD HL,0xFFFFFF` + `CALL 0x002197` — frame setup
2. `LD A,(D177BC)` — check master enable flag
3. If D177BC == 0, early exit via `JP Z,0x01038D`
4. `CALL 0x007DC7` — LCD port status check (IN from port 0x8034)
5. Save result to IX-1 frame slot
6. Test frame byte bit 0 (AND 0x01) — if zero, skip to slot 3 region

For each active slot:
```
LD HL,(D177xx)       ; load callback into HL
CALL 0x0021C2        ; null-check: HL == 0? (PUSH HL, LD DE,0, SBC HL,DE, POP HL, RET)
JR Z, skip           ; skip if null
LD IY,(D177xx)       ; reload into IY
CALL 0x002288        ; JP (IY) — execute callback
```

After each callback returns, the function reads D177D6 flag bits and clears the corresponding bit (RES instruction), then proceeds to the next slot. Slots 3-4 additionally gate on IX-frame flag bits (from the LCD port status check).

Between slots 2 and 3: `CALL 0x010090` (an additional check).

After slot 4: `CALL 0x007DC7` again, final cleanup via `CALL 0x007DDB`.

### Install Function (0x01069C, Vector 248)

1. Frame setup via `CALL 0x00218A`
2. `CALL 0x002623` (_seqcase) with inline dispatch table
3. 5-case switch on HL (values 1-5 selecting slots 0-4)
4. Each case: `LD (D177xx),BC` — stores BC (callback address) to selected slot
5. All cases converge to epilog: `LD SP,IX; POP IX; RET`

Calling convention: Takes two stack parameters — callback address (in BC) and slot index (in HL, 1-based: 1=slot0, 5=slot4).

### Clear Function (0x010F00, Vector 225)

1. Frame setup
2. `CALL 0x010AF5` (helper)
3. `CALL 0x007AEF` + test return value
4. `LD BC,0x000000`
5. Store BC=0 to all 5 slots sequentially: `LD (D177BD),BC; LD (D177C0),BC; LD (D177C3),BC; LD (D177C6),BC; LD (D177C9),BC`
6. Then reads D177BC and conditionally continues with more LCD operations

## Associated RAM Map

| Address | Size | Purpose |
|---------|------|---------|
| D177BC  | 1 byte | Master enable flag (0=disabled, non-zero=enabled). 5 write sites, 5 read sites. |
| D177BD  | 3 bytes | Callback slot 0 (24-bit address) |
| D177C0  | 3 bytes | Callback slot 1 |
| D177C3  | 3 bytes | Callback slot 2 |
| D177C6  | 3 bytes | Callback slot 3 |
| D177C9  | 3 bytes | Callback slot 4 |
| D177CC  | ? | (next in sequence — used elsewhere, not part of this cluster) |
| D177D6  | 1 byte | Dispatch flag byte — bits 1-3 gate slots 1-3. 10 read sites, 6 write sites. |
| D177D7  | 1 byte | Secondary flag byte — used for conditional dispatch. 13 write sites. |
| D177E1  | 1 byte | Slot 4 flag — set to 1 before slot 4 dispatch. 5 write sites. |

## Callback Targets

**No static callback targets were discovered.** All 10 write sites use `LD (slot),BC` where BC is loaded dynamically from:
- Stack frame parameters (via IX+offset) in the install function
- LD BC,0x000000 literal in the clear function

The callback addresses are installed at runtime by C library wrapper functions in the 0x05F77D-0x05F7AC region. These wrappers:
- 0x05F77D: Installs a callback — takes address from IX frame parameter, pushes callback + slot index, calls vector 248
- 0x05F794: Clears a specific slot — pushes BC=0 + slot index from IX frame, calls vector 248
- 0x05FDF3: Clears all slots — calls vector 225

None of these wrappers have direct CALL callers (0 hits each), indicating they are themselves called via vector tables or function pointer dispatch — consistent with the C runtime's indirect call architecture.

## Dispatch Callers

The dispatch function (vector 224) has **1 direct caller**:
- `0x05F685`: Trivial wrapper (`CALL 0x000580; RET`), itself called from 1 site

This suggests the display callback dispatch is invoked from a single point in the event loop — likely the main display refresh path. The dispatch is gated by:
1. D177BC master flag (must be non-zero)
2. LCD port 0x8034 status bits (via CALL 0x007DC7)
3. Per-slot null checks
4. Per-slot D177D6 flag bits

## LCD Port Connection

The helper functions called during dispatch all interact with LCD hardware ports:
- `0x007DC7`: IN from port 0x8034 (LCD status register)
- `0x007CD3`: IN from port 0x8020 (LCD control register)
- `0x007D2D`: IN from port 0x8020 with AND 0xDF mask
- `0x007DFB`: OUT to port 0x8034 with value 0x10

This confirms these are **LCD/display event callbacks** — the dispatch function checks LCD hardware state and invokes registered callbacks when display events (refresh, vsync, mode change) require processing.

## Key Findings

1. **Pure runtime dispatch**: No callback targets can be determined statically. All 5 slots are populated at runtime through C library wrappers.

2. **Hierarchical gating**: Master flag → LCD hardware check → per-slot null check → per-slot flag bits. This is an efficient short-circuit evaluation — if no callbacks are installed (D177BC=0), the entire dispatch is skipped.

3. **Flag-bit protocol**: Writers set bits in D177D6 to request callback invocation. The dispatch function clears each bit after invoking the corresponding callback. This is a classic interrupt-flag/acknowledge pattern applied to display events.

4. **LCD-synchronized**: The dispatch is tightly coupled to LCD port 0x8034/0x8020 status, suggesting callbacks fire during display refresh cycles or vsync intervals.

5. **Single dispatch point**: Only one call site in the entire ROM invokes the dispatch function, placing it squarely in the main event loop's display refresh path.
