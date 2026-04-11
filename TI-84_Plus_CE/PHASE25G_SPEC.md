# Phase 25G: OS Event Loop + Keyboard Scan Investigation

**Created**: 2026-04-11
**Status**: Investigation in progress — findings updated as discovered

---

## Blockers Found

### Blocker 1: Missing Block 0x00B608

**Source**: Test 23 — OS event loop cycling with pre-initialized callback.

The ISR dispatches to the event loop at 0x0019BE, which runs 17 steps then hits missing block **0x00B608**. This blocks ALL event loop progress.

**Fix**: Add 0x00B608 as a seed in `scripts/transpile-ti84-rom.mjs` and retranspile.

**Codex task**: Add seed, run transpiler, verify block exists.

### Blocker 2: _GetCSC Keyboard Handler Returns Same Value for All Keys

**Source**: Test 24 — _GetCSC scan code mapping.

_GetCSC at 0x03CF7D now correctly:
1. Reads port 0x5016 → gets 0x08 (keyboard IRQ bit 3 set)
2. Takes the keyboard handler branch → reaches 0x03D184
3. Handler chain: 0x03D184 → 0x03D197 → 0x03D19C → 0x03D1BB

But returns A=0x10 for ALL keys (including no-key). The handler runs only 4 blocks — too short for a real keyboard scan. Likely the handler reads keyboard MMIO but gets unexpected values, falling through to a default return.

**Investigation needed**: Trace what memory/port reads the handler does at 0x03D184-0x03D1BB. Check if it reads 0xE00900 (scan result) or 0xE00810-0xE00817 (key data per group).

### Blocker 3: _GetCSC Stack Corruption

After the handler returns, _GetCSC does `pop hl` at 0x03D0E0 and lands at 0x000000 (reset vector). The sentinel return address (0xFFFFFF) was pushed at SP, but _GetCSC's internal stack usage pops too many values.

**Root cause hypothesis**: _GetCSC expects to be called from the OS event loop with a specific stack frame. Our direct call doesn't set up the expected calling convention.

**Alternative**: Call 0x0159C0 (keyboard scan function) directly — Phase 24F verified it returns correct scan codes in B register without stack issues.

---

## Implementation Plan

### Batch 1: Seed 0x00B608 + Retranspile (Codex)

**Task**: Add 0x00B608 as a seed entry point in the transpiler, retranspile, verify the block exists.

**File**: `scripts/transpile-ti84-rom.mjs`
**Action**: Add `0x00B608` to the seed array alongside other Phase 24 seeds.

**Verification**: After retranspile, `ROM.transpiled.report.json` should show blockCount >= 124368. Run `node TI-84_Plus_CE/test-harness.mjs` and check Test 23 cycles — should no longer hit missing_block at 0x00B608.

### Batch 2: Direct Keyboard Scan Function Test (Codex)

**Task**: Add Test 25 that calls 0x0159C0 directly with each Phase 24F verified key and captures the scan code in B register.

**File**: `TI-84_Plus_CE/test-harness.mjs`
**Context**: 
- Function at 0x0159C0 initializes scan hardware (IY=0xE00800), reads scan result from 0xE00900, waits for ready flag at 0xE00824 bit 0, returns scan code in B register.
- Timer must be disabled (`timerInterrupt: false`)
- IFF1=0 (no interrupt interference)
- Keyboard MMIO at 0xE00800 is already intercepted in cpu-runtime.js

### Batch 3: _GetCSC MMIO Trace (Codex or CC)

**Task**: Add memory read tracing to the _GetCSC handler execution to see exactly what addresses 0x03D184-0x03D1BB read from. This reveals whether the handler uses MMIO 0xE00900 or some other mechanism.

### Batch 4: Browser Shell Event Loop (Codex)

After Batch 1 unblocks the event loop, update browser-shell.html to:
- Pre-initialize callback table (0xD02AD7 = 0x0019BE) after boot
- Set system flags ((IY+27) bit 6)
- Enable keyboard IRQ in interrupt controller
- Let AutoRun cycle through the event loop

---

## Key Constants

```javascript
const CALLBACK_PTR = 0xD02AD7;      // 24-bit callback address
const EVENT_LOOP = 0x0019BE;         // OS event loop entry
const GETCSCCSC = 0x03CF7D;          // _GetCSC jump table entry
const KBD_HANDLER = 0x03D184;        // Keyboard handler in _GetCSC
const KBD_SCAN_FN = 0x0159C0;        // Direct keyboard scan function
const MISSING_BLOCK = 0x00B608;      // Blocks event loop cycling
const INTC_PORT_MASKED_2 = 0x5016;   // Masked status byte 2
const KBD_IRQ_BIT = 19;              // Keyboard IRQ in FTINTC010
```

---

## Findings Log

### Finding 1: Timer IRQ Hijacks _GetCSC (FIXED)
- Timer IRQ fired during _GetCSC execution, hijacking to ISR before port read
- Fix: disable timer (`timerInterrupt: false`) and set IFF1=0 for _GetCSC calls

### Finding 2: Boot Clears Interrupt Controller (FIXED)
- Boot sequence writes to FTINTC010 registers, clearing enable mask
- Fix: re-set `p24.write(0x5006, 0x08)` inside callGetCSC() before each runFrom

### Finding 3: Port 0x5016 Now Returns 0x08 (WORKING)
- With fixes above, _GetCSC reads 0x08 from port 0x5016
- Keyboard handler at 0x03D184 IS reached

### Finding 4: Handler Returns Default A=0x10
- Handler chain 0x03D184 → 0x03D1BB runs only 4 blocks
- Returns A=0x10 regardless of key pressed
- Needs MMIO trace to understand what it reads

### Finding 5: Event Loop Blocked at 0x00B608
- OS event loop at 0x0019BE runs 17 steps then hits missing block
- 0x00B608 is in the OS area — seeding it should unblock further execution

### Finding 6: _GetCSC Handler is ISR EXIT CODE, Not a Keyboard Scanner (CRITICAL)
**ROM disassembly of 0x03D184-0x03D1BB reveals:**

```asm
; 0x03D184: Acknowledge keyboard IRQ
PUSH AF
LD A, 0x08
OUT (C), A        ; port 0x500A — acknowledge keyboard IRQ (bit 3)
LD C, 0x06
IN A, (C)         ; port 0x5006 — read enable mask byte 2
RES 3, A          ; disable keyboard IRQ in enable mask
OUT (C), A        ; write back

; 0x03D19C: ISR exit cleanup
POP AF
POP HL
LD (0xD02AD7), HL ; overwrite callback pointer!
LD IY, 0xD00080
RES 6, (IY+27)    ; clear dispatch-ready flag
POP IY
POP IX

; 0x03D1BB: Return from interrupt
POP AF
RETI              ; NOT a regular RET!
```

**This handler NEVER reads keyboard MMIO (0xE00800-0xE00900).** It only:
1. Acknowledges the keyboard IRQ in the interrupt controller
2. Disables the keyboard IRQ in the enable mask
3. Overwrites the callback pointer at 0xD02AD7
4. Clears the (IY+27) bit 6 system flag
5. Returns via RETI (expects ISR stack frame)

**A=0x10 is a stale register value from ISR context, NOT a scan code.**

**Conclusion**: _GetCSC is an ISR-context function that handles interrupt acknowledgement. The actual keyboard scan (reading key matrix, computing scan codes) happens through the direct scan function at **0x0159C0**, which reads MMIO at 0xE00900 and returns scan code in B register.

This changes the architecture: the browser shell should call 0x0159C0 for keyboard scanning, not _GetCSC.
