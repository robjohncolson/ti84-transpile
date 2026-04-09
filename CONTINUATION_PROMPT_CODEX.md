# Continuation Prompt — TI-84 Plus CE ROM Transpilation

**Last updated**: 2026-04-09T22:45Z
**Focus**: Continue the TI-84 Plus CE ROM to JavaScript transpilation effort
**Current phase**: Phases 1-20 complete. Coverage at 7.58% (50485 blocks, ~30% of OS area). Zero live stubs. Reset vector executes to HALT (60 steps). z80js dependency eliminated. Timer interrupt dispatch model active (NMI + IRQ). Interrupt status registers modeled (port 0x3D/0x3E). DD/FD prefix passthrough. Complete eZ80 ED-prefix instruction set (LEA, block I/O, word load/store).

---

## What Was Completed (Phases 7-19)

### Phase 7: I/O Peripheral Model (complete)

**Created `TI-84_Plus_CE/peripherals.js`:**
- Factory function `createPeripheralBus(options)` returns `{ read, write, register, getState }`
- `register(portOrRange, handler)` — supports single port, array range, or object range
- Unregistered ports return 0xFF (preserves legacy behavior)
- Optional `trace` mode logs all I/O to console

**Built-in peripheral handlers:**
- **PLL Controller (port 0x28)**: Returns 0x00 until configured (first write), then returns 0x00 for `pllDelay` reads (default 2), then returns 0x04 (bit 2 set = PLL locked). Repeated writes of the same config value do NOT reset the delay counter.
- **CPU Control Register (port 0x00)**: Read/write register, default 0x00
- **GPIO Port (port 0x03)**: Configurable read value (default 0xFF = no buttons), stores writes
- **Flash Controller (port 0x06)**: Returns 0x00 (ready), stores writes
- **Timer/Counter ports (0x10-0x18)**: Returns 0x00, stores writes

**Modified `TI-84_Plus_CE/cpu-runtime.js`:**
- `createExecutor(blocks, memory, options = {})` — new third parameter
- `options.peripherals` wired into `cpu._ioRead`/`cpu._ioWrite` BEFORE tracing hooks (so tracing still works)

**Key finding — PLL loop is interrupt-driven:**
- ROM code at 0x000697: `out0 (0x28), a` → `in0 a, (0x28)` → `bit 2, a` → `jr nc, 0x000690`
- `bit 2, a` sets Z flag but NOT carry flag
- `jr nc` checks carry — which is never modified in this loop
- The loop is designed to exit via interrupt (NMI or timer), not via PLL register value
- Force-breaker at `maxLoopIterations` remains the correct workaround until interrupt dispatch is implemented

### Phase 8: Multi-Entry-Point Execution (complete)

Added Test 5 to `test-harness.mjs` — 14 entry points tested without block trace (quiet mode):

| Entry Point | Steps | Termination | Notes |
|-------------|-------|-------------|-------|
| RST 0x08-0x38 (7 handlers) | 4-13 | halt | All reach power-down at 0x0019b5 |
| OS entry 0x020110 | 4 | halt | Power-down |
| Mid-ROM 0x4000 | 2 | missing_block | Wild jump to 0x7eedf3 (uninitialized regs) |
| Mid-ROM 0x21000 | 5000 | max_steps | Deep execution, reaches 0x08278d |
| Post-vector 0x100 | 4 | missing_block | Wild jump to 0xc202fe |
| ADL startup 0x658 | 5000 | max_steps | PLL loop (59 forced breaks) |
| Region 0x800 | 5000 | max_steps | PLL loop |
| Region 0x1afa | 5000 | max_steps | PLL loop |

**Key: 8/14 reach HALT, 4 run to max_steps (3 PLL-stuck, 1 deep), 2 hit missing blocks.**

### Phase 9A: Coverage Expansion (complete)

- Block limit raised: 32768 → 65536
- Added 30 new seed entry points:
  - ISR handlers: 0x000040-0x000068 (6 entries)
  - OS jump table: 0x020008-0x020040 (8 entries)
  - Mid-ROM functions: 0x004100, 0x004200, 0x005000, 0x008000, 0x010000
  - Graphics/display: 0x021100, 0x021200, 0x021400
  - Upper ROM: 0x050000-0x0C0000 (5 entries)
- Reachability exhausted at 50307 blocks (didn't hit 64K ceiling)
- Coverage: 5.20% → 7.54%

### Phase 10A: Missing Block Discovery (complete)

**Modified executor `runFrom()` in cpu-runtime.js:**
- `onMissingBlock(pc, mode, steps)` callback
- Skip-ahead: when block is missing, tries pc+1 through pc+16 for next valid block
- `missingBlocks` Set collected and returned with results
- Discovery summary aggregates all missing blocks across all tests

**Modified test-harness.mjs:**
- All tests and multi-entry runs now collect `onMissingBlock` data
- Discovery Summary section at the end reports unique missing addresses
- Result: only 2 dynamic missing targets (0x7eedf3, 0xc202fe — both wild jumps)

### Phase 10B: Coverage Gap Analysis (complete)

**Created `TI-84_Plus_CE/coverage-analyzer.mjs`:**
- Standalone analysis script, no dependencies
- 16KB-region heatmap (non-zero regions only)
- Top 20 uncovered gaps ranked by size
- Suggested new seed entry points from largest OS-area gaps
- Summary: gaps >1KB, gaps >10KB, OS vs data area coverage

**Key findings:**
- OS area (0x000000-0x0FFFFF): **30.22% covered** (316,833 bytes)
- Data area (0x100000+): **~0% covered** (27 bytes) — not code
- Largest OS-area gaps: 0x0DCDC6-0x0FDD02 (135KB), 0x0C0001-0x0D2AFC (77KB)
- 10 suggested seeds from gap analysis

### Phase 10C: Feed-Forward Seeds (complete)

- Added 10 OS-area seed entry points from coverage gap analysis
- Pruned 3 data-area seeds (0x100000, 0x200000, 0x300000) that produced 0% code
- Result: +76 blocks, +657 bytes — minimal gain, frontier truly exhausted

### Phase 11A: Indirect Jump Instrumentation (complete)

**Modified cpu-runtime.js `runFrom()`:**
- `blockVisits` Map tracks per-block visit counts (hot block profiling)
- `dynamicTargets` Set collects PCs reached via non-static exits (indirect jumps/returns)
- `onDynamicTarget(targetPc, mode, fromPc, step)` callback
- Both included in return objects

**Modified test-harness.mjs:**
- Multi-entry runs collect dynamic targets
- Discovery Summary reports both missing blocks AND dynamic jump targets
- Hot Blocks section shows top 15 most-visited blocks from Test 4

**First feedback loop iteration:**
- 72 dynamic jump targets discovered (dense jump table at 0x082xxx from 0x021000 execution)
- All 70 valid targets were already statically reachable — 0 new blocks
- Confirms static analysis is comprehensive within reachable frontier

### Phase 11B: Stub Elimination (complete)

**Decoder fixes in `decodeInstruction()`:**
- Doubled index prefix consumption: `FD DD` / `DD FD` → skip first, second prefix wins
- Extended ED NOP fallback: undefined opcodes DD/FD/CB/ED/C0+ range/EE/77/94 → 2-byte NOP

**Emitter fixes in `emitInstructionJs()`:**
- `nop` tag handler for manual decoder NOPs (was falling through to unimplemented)
- `sbc a, immediate` pattern (was only `sbc a, register`)
- `out (n), a` pattern with malformed `0x0x` hex normalization
- `.sil`/`.sis`/`.lil`/`.lis` suffix stripping from z80js mnemonics before regex matching

**Results:** Stubs went 3 → 25 (new paths discovered) → 0 (all fixed). +105 blocks from newly reachable code.

### Phase 12: Post-HALT Wake + Executor Wake Support (complete)

**12A: Wake continuation tests in test-harness.mjs:**
- Test 6: NMI wake from 0x0066 with post-boot state (50K steps)
- Test 7: IM1 wake from 0x0038 with post-boot state
- Finding: NMI handler re-enters startup/PLL sequence (no new code regions). IM1 re-halts in 4 steps.
- Dynamic targets from wake: all already known (72 unique)

**12B: Executor wake support in cpu-runtime.js:**
- `wakeFromHalt` option in `runFrom()`: 'nmi' (0x0066), 'im1'/'true' (0x0038), or custom `{vector, returnPc, mode}`
- Fires once then clears (prevents infinite HALT→wake loops)
- `onWake(haltPc, wakePc, mode)` callback

**12 Finding: Deep execution from 0x021000** — 100K steps, 75 dynamic targets, 0 missing blocks, 0 loops forced. Static frontier is completely saturated.

### Phase 13A: Complete eZ80 Instruction Decoder (complete)

**Created `TI-84_Plus_CE/ez80-decoder.js` (784 lines):**

Table-driven decoder to replace the z80js npm dependency. Produces structured instruction objects with typed tags (no mnemonic text parsing needed).

**Covered instruction groups:**
- Unprefixed opcodes (256 entries): LD, ALU, INC/DEC, PUSH/POP, JP/JR/CALL/RET, RST, rotates, misc
- CB prefix: BIT/SET/RES/rotate for all 8 registers + (HL)
- DD/FD prefix: IX/IY indexed loads/stores/ALU, half-registers (IXH/IXL/IYH/IYL), indexed bit ops (DD CB d op), doubled-prefix consumption (FD DD → DD wins)
- ED prefix: IN0/OUT0, IN/OUT (C), SBC/ADC HL, LD rr/(nn), NEG, RETN/RETI, IM, block transfer (LDI/LDIR/etc), eZ80-specific (LEA, TST, MLT, STMIX, RSMIX, SLP, OTIMR, LD IX/IY/(HL))
- eZ80 mode prefixes: .SIS/.LIS/.SIL/.LIL affect immediate width
- Undefined ED opcodes → 2-byte NOP

**INTEGRATED in Phase 13B** — decoder wired into transpiler, z80js removed.

---

### Phase 13B: Integrate Decoder into Transpiler (complete)

Replaced `scripts/transpile-ti84-rom.mjs` (2128→830 lines):
- Removed z80js dependency entirely
- Imported `decodeInstruction` from `ez80-decoder.js`
- Added `buildDasm()` for human-readable disassembly strings in comments
- Added adapter function that maps decoder output to buildBlock-compatible format (kind, targetMode, condition, etc.)
- Replaced regex-heavy `emitInstructionJs()` with direct tag dispatch (~50 handlers, zero regex)
- Fixed decoder bugs: IN0/OUT0 register tables (0x30/0x31 shadowed eZ80 LD IX/IY,(HL)), DD/FD→ED forwarding

### Phase 14: Interrupt Dispatch Model (complete)

**Modified `TI-84_Plus_CE/peripherals.js`:**
- Added interrupt controller state: `timerPending`, `nmiPending`, counter, interval
- Timer fires IRQ or NMI every N blocks (configurable `timerInterval`, `timerMode`)
- Methods: `tick()`, `hasPendingIRQ()`, `hasPendingNMI()`, `acknowledgeIRQ()`, `acknowledgeNMI()`, `triggerNMI()`, `triggerIRQ()`
- Added interrupt status register (port 0x3D) returning 0x00 — NMI handler at 0x0066 takes alternate path
- Added interrupt acknowledge register (port 0x3E)

**Modified `TI-84_Plus_CE/cpu-runtime.js`:**
- After each block: `peripherals.tick()` → check NMI (non-maskable) → check IRQ (if IFF1)
- NMI dispatch: push PC, save IFF1→IFF2, clear IFF1, jump to 0x0066
- IRQ dispatch: push PC, clear IFF1/IFF2, jump to IM1 (0x0038) or IM2 (vector table)
- HALT wake: check NMI/IRQ before terminating, dispatch interrupt to wake CPU
- `onInterrupt(type, fromPc, vector, step)` callback

**Key finding — NMI handler branching:**
- Port 0x3D = 0xFF (old): NMI handler re-enters startup (infinite cycle)
- Port 0x3D = 0x00 (new): NMI handler takes alternate path (0x000047 → call 0x0008BB → halt)

### Phase 15: DD/FD Prefix Passthrough (complete)

- DD/FD prefix on non-IX/IY opcodes now executes the opcode as-is (DD consumed silently)
- Example: DD 2F = CPL (was NOP), DD AF = XOR A (was NOP)
- Stacked prefix bytes (DD DD, FD FD) still treated as NOP
- Added DD/FD→ED forwarding in decodeDDFD (DD ED xx decoded as ED instruction)
- Block count decreased from 50533 to 50369 due to corrected instruction lengths

### Phase 16: CPU Completeness + Deep Profiling (complete)

**16A: Added missing CPU methods:**
- `cpd()` / `cpdr()` — block compare with decrement (mirrors cpi/cpir)

**16B: Deep execution profiling (0x021000, 100K steps):**
- Created `TI-84_Plus_CE/deep-profile.mjs`
- 0x021000 → JP 0x09BF16 → OS dispatch loop at 0x082000
- 210 steps to halt (NMI triggers at step 200, handler halts)
- 50 dynamic targets discovered (all in 0x082xxx jump table)
- 0 missing blocks — static analysis covers all reachable code
- 94 blocks visited in 0x082000 region (OS jump table dispatch)
- 11 active 4KB regions across the ROM

**16C: Block I/O instructions added:**
- Decoder: INI, IND, INIR, INDR, OUTI, OUTD, OTIR, OTDR (ED prefix)
- CPU: ini(), ind(), outi(), outd(), inir(), indr(), otir(), otdr()
- Emitter: direct tag handlers for all 8 block I/O tags

### Phase 19: Peripheral Audit + OS Wake Analysis (complete)

**19A: Port I/O audit:**
- Traced port reads across 4 entry points (0x000000, 0x021000, 0x000658, 0x0012CA) at 10K steps each
- Result: **zero unregistered port reads**. All reads go to registered handlers (GPIO 0x03, flash 0x06, PLL 0x28)
- The OS boot completes normally in 18 steps (post-PLL) and enters power-down HALT at 0x0019B5

**19B: IRQ wake analysis:**
- IM1 handler at 0x000038: saves registers (EX AF/EXX, push IX/IY), loads IY=0xD00080 (OS system vars), JP 0x0006F3
- 0x0006F3: checks flash status (port 0x06 bit 2). If flash ready → 0x000704
- 0x000704: sets system flag (IY+27 bit 6), checks if A=0xD0 for interrupt dispatch
- If A≠0xD0 → power-down. If A=0xD0 → 0x000710 (reads callback address from RAM at 0xD02AD7, calls 0x001713)
- **Current behavior**: A=0x00 (flash returns 0x00), so handler always re-enters power-down
- **To unlock deeper interrupt handling**: need A=0xD0 at the CP check, which requires modeling a hardware interrupt source register

**Key finding — OS execution flow:**
1. Boot: DI → PLL init → hardware setup → RST 0x08 → init function → power-down HALT
2. IRQ wake: EX AF/EXX → check flash → set flag → CP 0xD0 → power-down (no dispatch)
3. NMI wake: check port 0x3D → if 0x00: call 0x0008BB → quick return → HALT

### Phase 18: Flag Accuracy + Dead Code Cleanup (complete)

**18A: INC/DEC flag updates:**
- Added `inc8(value)` / `dec8(value)` to CPU class with proper S/Z/H/PV/N flags (C preserved)
- Updated emitter: INC r, DEC r, INC (HL), DEC (HL), INC (IX+d), DEC (IX+d)

**18B: CALL return address:**
- Verified the emitter was already correct (`cpu.push(fallthrough); return target;`)
- Removed dead `cpu.call()` method with stale BUG comment

**18C: OR/XOR flag fix:**
- Added `updateOrXorFlags()` (H=0) separate from `updateLogicFlags()` (H=1, for AND)
- Updated emitter: OR/XOR now use `updateOrXorFlags`, AND uses `updateLogicFlags`

**18D: CPL and accumulator rotate flags:**
- CPL now sets H=1, N=1
- RLCA/RRCA/RLA/RRA now set X/Y (bits 3/5) from result

---

## Current Outputs

### `scripts/transpile-ti84-rom.mjs`

Source of truth for generation. Current seed count: 125 (RST vectors + known anchors + gap seeds + 70 dynamic targets). Uses the table-driven eZ80 decoder with direct tag dispatch — no z80js dependency, no regex parsing.

### `TI-84_Plus_CE/ROM.transpiled.js`

Generated module: 50485 blocks, 7.58% coverage.

### `TI-84_Plus_CE/cpu-runtime.js`

CPU runtime (~930 lines):
- Full `CPU` class (registers, ALU, I/O, stack, block transfer, rotate/shift)
- `createExecutor(blocks, memory, options)` with peripheral bus support
- Missing block skip-ahead + discovery collection
- Block visit counting + dynamic target detection (indirect jump instrumentation)
- Mode-aware execution, loop detection, I/O tracing

### `TI-84_Plus_CE/peripherals.js`

I/O peripheral bus + interrupt controller (~290 lines): PLL, CPU control, GPIO, flash, timers, interrupt status (0x3D), interrupt ack (0x3E), timer-driven NMI/IRQ.

### `TI-84_Plus_CE/test-harness.mjs`

Validation harness (~400 lines): 8 tests, multi-entry exploration, missing block discovery, dynamic target discovery, hot block profiling, PLL validation, NMI/IM1 wake, timer interrupt dispatch.

### `TI-84_Plus_CE/coverage-analyzer.mjs`

Standalone gap analysis: heatmap, gap ranking, seed suggestions.

### `TI-84_Plus_CE/ROM.transpiled.report.json`

Current metrics:
- ROM size: `4194304`
- Block count: `50485`
- Covered bytes: `317806`
- Coverage percent: `7.5771`
- Seed count: `125`
- Live stubs: `0`

Historical baselines:
- After Phase 17: blocks=`50485`, bytes=`317806`, coverage=`7.58%`, stubs=`0`, complete ED instruction set
- After Phase 15: blocks=`50369`, bytes=`316523`, coverage=`7.55%`, stubs=`0`, DD/FD passthrough
- After Phase 13B: blocks=`50533`, bytes=`316782`, coverage=`7.55%`, stubs=`0`, z80js removed
- After Phase 11B: blocks=`50488`, bytes=`317806`, coverage=`7.58%`, stubs=`0`
- After Phase 11A: blocks=`50407`, bytes=`317118`, coverage=`7.56%`, stubs=`25`
- After Phase 10C: blocks=`50383`, bytes=`316860`, coverage=`7.55%`, OS=`30.22%`
- After Phase 10B: blocks=`50307`, bytes=`316203`, coverage=`7.54%`, OS=`30.15%`
- After Phase 9A: blocks=`50307`, bytes=`316203`, coverage=`7.54%`
- After Phase 6: blocks=`32768`, bytes=`218062`, coverage=`5.20%`
- After Phase 3: blocks=`16384`, bytes=`170053`, coverage=`4.05%`
- After Phase 2: blocks=`2048`, bytes=`22033`, stubs=`0`
- Initial: blocks=`384`, bytes=`3613`

---

## Verified State

1. `node --check scripts/transpile-ti84-rom.mjs` passes
2. `node scripts/transpile-ti84-rom.mjs` generates 50485 blocks at 7.58% coverage (no z80js needed)
3. All 50485 blocks compile successfully (0 failures)
4. `node TI-84_Plus_CE/test-harness.mjs` runs 8 tests:
   - Tests 1-3: Reset vector → HALT in 60 steps (with peripherals + loop breaker)
   - Test 4: Peripheral validation — PLL returns 0x04 correctly, 1 forced break (interrupt-driven loop)
   - Test 5: 14 entry points — 8 reach HALT, 4 run deep, 2 hit missing blocks
   - Test 6: NMI wake — 9 steps, halt (port 0x3D returns 0x00)
   - Test 7: IM1 wake — 6 steps to halt
   - Test 8: Timer NMI from reset — 110 steps, 1 interrupt fired, halt
5. `node TI-84_Plus_CE/coverage-analyzer.mjs` — OS area ~30%, gap seeds identified
6. Missing block discovery: 2 dynamic targets (0x7eedf3, 0xc202fe — wild jumps)
7. Dynamic jump instrumentation: 72 targets discovered, all already statically reachable
8. **Zero** `cpu.unimplemented()` live stubs
9. **z80js dependency eliminated** — new table-driven eZ80 decoder (ez80-decoder.js) handles all decoding

---

## Important Constraints

### This repo is already dirty

There are many unrelated modified files in the worktree. Do not revert them.

### This is still a lift, not a handwritten rewrite

Stay with the 1:1-ish bytecode-lift direction:

- widen decoder support
- improve control-flow discovery
- improve emitted instruction semantics
- add runtime helpers only to support executing lifted blocks

Do not replace this with a high-level emulator rewrite unless the user explicitly changes direction.

---

## How To Regenerate

From repo root (no dependencies needed):

```bash
node scripts/transpile-ti84-rom.mjs
```

Full validation:

```bash
node TI-84_Plus_CE/test-harness.mjs
node TI-84_Plus_CE/coverage-analyzer.mjs
```

---

## Phase Completion Status

### Phase 1: Widen the generic emitter — DONE ✓
### Phase 2: Clean mixed-mode and remaining ED edge cases — DONE ✓
### Phase 3: Push beyond the current reachability frontier — DONE ✓
### Phase 4: Add an executable runtime scaffold — DONE ✓
### Phase 5: Test harness + reset vector validation — DONE ✓
### Phase 6: Extended execution + call/return tracking — DONE ✓
### Phase 7: I/O Peripheral Model — DONE ✓
### Phase 8: Multi-Entry-Point Execution — DONE ✓
### Phase 9A: Coverage Expansion (static seeds) — DONE ✓
### Phase 10A: Missing Block Discovery — DONE ✓
### Phase 10B: Coverage Gap Analysis — DONE ✓
### Phase 10C: Feed-Forward Seeds — DONE ✓
### Phase 11A: Indirect Jump Instrumentation — DONE ✓
### Phase 11B: Stub Elimination (25→0) — DONE ✓
### Phase 12: Post-HALT Wake + Executor Wake Support — DONE ✓
### Phase 13A: Complete eZ80 Instruction Decoder — DONE ✓
### Phase 13B: Integrate Decoder into Transpiler — DONE ✓
### Phase 14: Interrupt Dispatch Model — DONE ✓
### Phase 15: DD/FD Prefix Passthrough — DONE ✓
### Phase 16: CPU Completeness + Deep Profiling — DONE ✓
### Phase 17: Missing ED Instructions (LEA GP, word LD) — DONE ✓
### Phase 18: Flag Accuracy + Dead Code Cleanup — DONE ✓
### Phase 19: Peripheral Audit + OS Wake Analysis — DONE ✓
### Phase 20: ALU Tests + MMIO Tracking + Browser Shell — DONE ✓

---

## What Is Still Missing / Next Frontiers

The static reachability frontier is exhausted at ~50K blocks. Further coverage requires dynamic techniques:

### 1. Hardware Interrupt Source Modeling

The OS interrupt handler at 0x000704 checks if A=0xD0 to dispatch to a callback table. This value comes from a hardware status register. Modeling the correct interrupt source register (likely a timer or keyboard controller) would allow the interrupt handler to dispatch to the OS event loop at 0x000710.

### 2. Execution Trace Verification

Compare against CEmu's real execution trace:
- CEmu logging of first N blocks from reset
- Block-by-block comparison of register/flag state
- Identify emitter correctness bugs (flag computation, edge cases)

### 3. Browser-Based Runtime

Wire the transpiled blocks + CPU + peripherals into an HTML canvas. The LCD controller is memory-mapped at 0xF00000+. Modeling the display buffer would show what the ROM renders during boot (TI logo, homescreen).

---

## Remaining `cpu.unimplemented(...)` Surface

**Zero live stubs** as of Phase 11B. All previously irreducible stubs were fixed:

- `ld (ix+0xFFF9), {1}` at `0x024343` — fixed by doubled-prefix consumption (FD DD → DD wins)
- `ld (ix+0x00E6), {1}` at `0x028298` — same fix
- `Error disassembling ED DD` at `0x070b2b` — fixed by ED NOP fallback for undefined opcodes
- 22 additional stubs discovered at deeper frontier — all fixed via emitter patches (sbc a imm, out (n) a, .sil normalization, nop tag)

---

## Useful Repo Files

- `scripts/transpile-ti84-rom.mjs` — ROM transpiler (source of truth, 125 seeds)
- `TI-84_Plus_CE/ROM.rom` — TI-84 Plus CE ROM image (4MB)
- `TI-84_Plus_CE/ROM.transpiled.js` — Generated module (50485 blocks)
- `TI-84_Plus_CE/ROM.transpiled.report.json` — Coverage metrics
- `TI-84_Plus_CE/cpu-runtime.js` — CPU class + createExecutor + missing block discovery
- `TI-84_Plus_CE/peripherals.js` — I/O peripheral bus (PLL, GPIO, flash, timers)
- `TI-84_Plus_CE/test-harness.mjs` — 8-test validation harness + multi-entry + discovery + interrupts
- `TI-84_Plus_CE/deep-profile.mjs` — Deep execution profiler (0x021000 analysis)
- `TI-84_Plus_CE/coverage-analyzer.mjs` — Gap analysis + heatmap + seed suggestions
- `TI-84_Plus_CE/ez80-decoder.js` — Complete eZ80 instruction decoder (~790 lines, integrated into transpiler)
- `TI-84_Plus_CE/test-alu.mjs` — ALU unit tests (72 tests: inc8, dec8, add8, sub8, adc, sbc, flags)
- `TI-84_Plus_CE/browser-shell.html` — Browser-based ROM executor (320x240 canvas, step/run controls, register display, block trace log)
- `ti84-rom-disassembly-spec.md`
- `codex-rom-disassembly-prompt.md`
- `codex-rom-state-machine-prompt.md`
- `ti84-native-port-spec.md`
- `CONTINUATION_PROMPT.md`
