# Continuation Prompt — TI-84 Plus CE ROM Transpilation

**Last updated**: 2026-04-10T19:30Z
**Focus**: Continue the TI-84 Plus CE ROM to JavaScript transpilation effort
**Current phase**: Phases 1-24B complete. Coverage at 16.5% (124327 blocks). Zero live stubs. Reset vector executes to HALT (62 steps). ISR dispatch gate UNLOCKED — IM1 handler reaches callback dispatch at 0x000710 for the first time. Function call harness working (FPAdd/Mult/Div/Sin). 24-bit CPU registers. Keyboard port 0x01 wired. 45 new seeds from ISR exploration.

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
- **Flash Controller (port 0x06)**: Returns 0xD0 (hardware ready status — unlocks ISR gate at 0x000704), stores writes
- **Keyboard Scan (port 0x01)**: Write selects key group (active low), read returns key status (0xFF = no keys pressed). 8-group matrix exposed via `peripherals.keyboard`
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

### Phase 22: OS Jump Table + Mass Seeding (complete/in-flight)

**22A: OS jump table discovery:**
- Jump table at 0x020104+: 980 entries, each a JP instruction to the actual implementation
- ALL core math transpiled: FPAdd (0x07C77F), FPMult (0x07C8B7), FPDiv (0x07CAB9), SqRoot (0x07DF66), Sin (0x07E57B), Cos (0x07E5B5), Tan (0x07E5D8), ASin, ACos, ATan, EToX, LnX, LogX, TenX, Round
- Statistics: OneVar (0x0A9325), OrdStat (0x0AAAB8), InitStatAns (0x0AB21B)
- Math implementations live at 0x07C000-0x07F000, statistics at 0x0A9000-0x0AB000

**22B: OS jump table seed expansion:**
- Added 170 seeds for missing jump table implementations → 56928 blocks, 100% jump table coverage
- +6443 blocks, +37539 bytes

**22C: Prologue-scan seeding:**
- Scanned uncovered OS regions for function prologue patterns (PUSH IX/IY, PUSH AF+BC, etc.)
- Added 2025 seeds + 256-byte interval seeds in large gaps (0x0C0000-0x0FFFFF, 0x016000-0x01FFFF)
- Result: 68774 blocks → 110141 blocks (+41367), coverage 10.36% → 15.63%
- OS area coverage: ~41% → ~62%

**22D: Dense gap-fill seeding (COMPLETE):**
- Added 18908 seeds at 32-byte intervals in ALL remaining uncovered gaps > 64 bytes
- Block limit raised to 200000
- Result: 124327 blocks, 692278 bytes, 16.5% coverage
- Seed count: 21229

**Key finding — ROM.transpiled.js exceeded GitHub 100MB limit at 175MB.**
- File is now gitignored
- Generate locally: `node scripts/transpile-ti84-rom.mjs`
- All seeds are in the transpiler script; regeneration is deterministic

### Phase 23: Function Call Harness (complete)

**Created `TI-84_Plus_CE/ti84-math.mjs`:**
- Clean API for calling OS math functions: `callFunction(addr, { op1, op2 })`
- TI float format: 9 bytes, BCD encoded (sign, exponent, 7 mantissa pairs)
- Calling convention: OP1 at 0xD005F8, OP2 at 0xD00601, result in OP1
- 16MB memory (`new Uint8Array(0x1000000)`) with ROM loaded
- 24-bit CPU registers (BC/DE/HL have full 24-bit backing stores)
- Timer interrupts disabled for clean function execution
- Working functions: FPAdd (0x07C77F), FPMult (0x07C8B7), FPDiv (0x07CAB9), Sin (0x07E57B)
- Sentinel return address (0xFFFFFF) for clean function exit detection

### Phase 24A: ISR Dispatch Gate Unlocked (complete)

**The problem:** IM1 handler at 0x000038 reads port 0x06 (flash status) into A, then compares A with 0xD0 at block 0x000704. With port returning 0x00, the CP 0xD0 always failed → JP NZ to power-down. Block 0x000710 (callback dispatch) was unreachable.

**The fix:** Flash port 0x06 returns 0xD0 (hardware ready status). Boot code reads port 0x06 but only to SET bit 2 and write back — never branches on the value. 0xD0 has bit 2 = 0, so the BIT 2 test gives Z=1 → JR Z taken → direct to CP gate → 0xD0 == 0xD0 → gate passes → falls through to 0x000710.

**Key block analysis:**
- Block 0x0006FA: `LD A, 0x03` / `OUT0 (0x06), A` / `CP 0x03` / `JR Z, 0x000704` — the "flash busy" path that kills A. Taken when bit 2 of port 0x06 is set.
- Block 0x000710: `LD HL, (0xD02AD7)` / `PUSH HL` / `CALL 0x001713` — callback dispatch. Reads 24-bit callback address from RAM.

**Added keyboard scan port 0x01:**
- Write: selects key group (active low bit pattern)
- Read: returns key status for selected groups (0xFF = no keys pressed)
- 8-group matrix with AND logic for simultaneous group scanning
- Exposed via `peripherals.keyboard` for test simulation

**Test results:**
- Test 9: Boot I/O trace confirms port 0x06 reads 0xD0 throughout
- Test 10: ISR reaches 0x000710 (46 steps), visits 35 unique blocks across 3 code regions

### Phase 24B: ISR Post-Dispatch Exploration (complete)

**Test 11 (Deep ISR with callback table):** Initialized 0xD02AD7 → 0x0019BE (OS event loop). ISR dispatches through callback but still HALTs at power-down (46 steps, 35 blocks, 3 regions).

**Test 12 (OS Event Loop at 0x0019BE):** Direct entry with OS-like state (IY=0xD00080, bit 6 set). 239 steps, 39 blocks, 2 regions. Event loop checks system flags and falls through to power-down.

**Test 13 (ROM handler table scan):** Scanned ISR handler area (0x700-0x800), OS dispatch table (0x20100-0x20200), RST vector area (0x38-0x70) for 24-bit pointers. Handler 0x08C331 runs 1000+ steps into deep OS code. Handler 0x061DB6 reaches new block at 0x00586A.

**Seeds:** 45 unique addresses written to `TI-84_Plus_CE/phase24b-seeds.txt`.

### Phase 24C: Deep Handler Exploration + Callback Table Research (complete)

**Test 14 (Deep handler 0x08C331):** Major OS initialization routine. 691 steps, 162 unique blocks across 10 code regions (0x00-0x0A). Made 262,936 RAM writes. **Writes to callback pointer at 0xD02AD7** at step 690 (0xFF bytes). Accesses interrupt controller (port 0x5004/5005) and port 0x3114. Heavy activity in 0x0A0000 region (59 blocks — statistics/data area) and 0x050000 (32 blocks).

**Test 15 (Handler probes):**
- 0x06ACB2 (reached by 0x08C331): 256 steps, 56 blocks — deep OS subsystem
- 0x07C897: 245 steps, 45 blocks — math library
- 0x0019B6 (ISR missing block): 240 steps, 39 blocks — ISR continuation path
- 0x00586A: still a missing block (needs seeding)

**Test 16 (Boot memory trace):** Only 6 RAM writes during 62-step boot. Callback table NOT initialized during boot (0xD02AD7 = 0x000000). System vars and FP area all zeroed.

**Test 17 (ISR cycling) — key discovery:** The callback pointer evolves across ISR cycles:
- Cycle 0: boot → callback = 0x000000
- Cycle 1: ISR → callback changes to 0x000010
- Cycle 2: 271 steps → callback changes to **0x0040B2** (real OS handler address!)
- Cycle 3: hits missing block at **0x00AFF7**, blocking further progress
- The ISR is self-modifying its dispatch table — each interrupt cycle updates the callback pointer

**Seeds:** 55 new Phase 24C seeds appended to phase24b-seeds.txt (100 total in file).

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

Source of truth for generation. Current seed count: 21229. Uses the table-driven eZ80 decoder with direct tag dispatch — no z80js dependency, no regex parsing.

### `TI-84_Plus_CE/ROM.transpiled.js`

Generated module: 124327 blocks, 16.5% coverage. **Gitignored** (175MB). Generate locally.

### `TI-84_Plus_CE/cpu-runtime.js`

CPU runtime (~930 lines):
- Full `CPU` class (registers, ALU, I/O, stack, block transfer, rotate/shift)
- `createExecutor(blocks, memory, options)` with peripheral bus support
- Missing block skip-ahead + discovery collection
- Block visit counting + dynamic target detection (indirect jump instrumentation)
- Mode-aware execution, loop detection, I/O tracing

### `TI-84_Plus_CE/peripherals.js`

I/O peripheral bus + interrupt controller (~370 lines): PLL, CPU control, GPIO, flash (returns 0xD0), keyboard (port 0x01, 8-group matrix), timers, interrupt status (0x3D), interrupt ack (0x3E), timer-driven NMI/IRQ. Keyboard state exposed via `peripherals.keyboard`.

### `TI-84_Plus_CE/test-harness.mjs`

Validation harness (~1000 lines): 13 tests, multi-entry exploration, missing block discovery, dynamic target discovery, hot block profiling, PLL validation, NMI/IM1 wake, timer interrupt dispatch, flash port trace, ISR dispatch gate verification, deep ISR exploration, OS event loop probe, ROM handler table scan.

### `TI-84_Plus_CE/coverage-analyzer.mjs`

Standalone gap analysis: heatmap, gap ranking, seed suggestions.

### `TI-84_Plus_CE/ROM.transpiled.report.json`

Current metrics:
- ROM size: `4194304`
- Block count: `124327`
- Covered bytes: `692278`
- Coverage percent: `16.50`
- Seed count: `21229`
- Live stubs: `0`
- OS jump table: `980/980` (100%)
- ISR dispatch gate: **UNLOCKED** (0x000710 reachable)
- ROM.transpiled.js: **gitignored** (175MB). Generate locally.

Historical baselines:
- After Phase 24B: blocks=`124327`, bytes=`692278`, coverage=`16.50%`, ISR gate unlocked
- After Phase 22C: blocks=`110141`, bytes=`655752`, coverage=`15.63%`, OS=`62%`
- After Phase 22B: blocks=`68774`, bytes=`434426`, coverage=`10.36%`, OS=`41%`
- After Phase 22A: blocks=`56928`, bytes=`355345`, coverage=`8.47%`, OS=`34%`
- After Phase 17: blocks=`50485`, bytes=`317806`, coverage=`7.58%`, stubs=`0`
- After Phase 13B: blocks=`50533`, bytes=`316782`, coverage=`7.55%`, z80js removed
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
2. `node scripts/transpile-ti84-rom.mjs` generates 110141+ blocks at 15.6%+ coverage (no z80js needed, takes 10-30 min)
3. All blocks compile successfully (0 failures). ROM.transpiled.js is gitignored (>100MB).
4. `node TI-84_Plus_CE/test-harness.mjs` runs 13 tests:
   - Tests 1-3: Reset vector → HALT in 62 steps (with peripherals + loop breaker)
   - Test 4: Peripheral validation — PLL returns 0x04 correctly, 1 forced break
   - Test 5: 14 entry points — 10 reach HALT, 4 hit missing blocks
   - Test 6: NMI wake — 5 steps, halt (port 0x3D returns 0x00)
   - Test 7: IM1 wake — 63 steps, 9 dynamic targets, 2 missing blocks (ISR gate unlocked!)
   - Test 8: Timer NMI from reset — 106 steps, 1 interrupt fired, halt
   - Test 9: Flash port 0x06 boot trace — reads 0xD0 throughout boot
   - Test 10: ISR dispatch gate — A=0xD0 at CP, reaches 0x000710, 35 unique blocks
   - Test 11: Deep ISR with callback table init — 46 steps, 3 code regions
   - Test 12: OS event loop (0x0019BE) — 239 steps, 39 blocks
   - Test 13: ROM handler table scan — 45 seeds, handler 0x08C331 runs 1000+ steps
   - Test 14: Deep handler 0x08C331 — 691 steps, 162 blocks, 10 regions, 262K RAM writes
   - Test 15: Handler probes — 9 handlers, 20 seeds
   - Test 16: Boot memory trace — 6 RAM writes, callback table NOT initialized during boot
   - Test 17: ISR cycling — callback evolves 0→0x10→0x40B2, blocked at 0x00AFF7
5. `node TI-84_Plus_CE/coverage-analyzer.mjs` — coverage analysis with gap suggestions
6. `node TI-84_Plus_CE/ti84-math.mjs` — FPAdd, FPMult, FPDiv, Sin all produce correct results
7. **Zero** `cpu.unimplemented()` live stubs
8. **z80js dependency eliminated** — new table-driven eZ80 decoder (ez80-decoder.js) handles all decoding
9. **ISR dispatch gate unlocked** — IM1 handler reaches 0x000710 callback dispatch

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
### Phase 21: 16-bit Port Fix + Interrupt Controller + Memory Controller — DONE ✓
### Phase 22A: Find OS jump table function addresses — DONE ✓
### Phase 22B: Seed all 170 missing jump table implementations — DONE ✓
### Phase 22C: Prologue-scan gap-fill seeds (2025 seeds) — DONE ✓
### Phase 22D: Dense gap-fill seeds (18908 seeds, 32-byte intervals) — DONE ✓
### Phase 23: Function Call Harness (FPAdd/Mult/Div/Sin) — DONE ✓
### Phase 24A: ISR Dispatch Gate Unlocked (flash=0xD0, keyboard port) — DONE ✓
### Phase 24B: ISR Post-Dispatch Exploration (45 seeds) — DONE ✓
### Phase 24C: Deep Handler + Callback Table Research (55 seeds) — DONE ✓

---

## What Is Still Missing / Next Frontiers

Coverage at 124327 blocks (16.5%). ISR gate is unlocked. Function call harness works. The remaining frontiers are about making the OS event loop functional and rendering output.

### 1. Seed the 100 Phase 24B+C Addresses (immediate next step)

`TI-84_Plus_CE/phase24b-seeds.txt` has 100 addresses discovered via ISR exploration and deep handler analysis. Critical: **0x00AFF7** blocks ISR cycling at cycle 3 — seeding this address is the highest-priority unlock. Feed all seeds into the transpiler and regenerate ROM.transpiled.js. Some are noise (ROM bytes read as pointers), but the transpiler will filter invalid ones.

**Key blocker:** Missing block at 0x00AFF7 stops ISR cycling from progressing beyond cycle 3. The callback pointer had evolved to 0x0040B2 (a real OS handler) before getting stuck.

### 2. OS Event Loop Deep Dive

The ISR dispatches to 0x000710 which calls a callback at 0xD02AD7. Currently RAM is zeroed so the callback goes nowhere useful. To make the event loop functional:
- Trace what the real OS boot writes to 0xD02AD7 and surrounding callback table
- Initialize the callback table with proper OS handler addresses
- The event loop at 0x0019BE checks system flags at (IY+offset) and dispatches handlers
- With proper callback table + system flags, execution should reach keyboard scan, LCD refresh, etc.

### 3. Keyboard Input → OS Response Chain

Port 0x01 is wired (returns 0xFF = no keys). Next steps:
- Simulate a key press by setting `peripherals.keyboard.keyMatrix[group]` bits
- Trigger interrupt controller bit 10 (keyboard IRQ)
- Trace the full chain: key press → IRQ → ISR → event loop → keyboard scan routine
- Map PC keyboard to TI-84 key matrix (8 groups × 8 keys)
- Wire into browser-shell.html for interactive input

### 4. LCD Display Buffer

The LCD controller is memory-mapped at 0xF00000+. The OS writes pixel data during boot (TI logo). The browser-shell.html has a 320x240 canvas ready. Modeling the LCD VRAM at the correct memory addresses would render the boot screen.

### 5. CEmu Trace Verification

Compare block-by-block register state against CEmu to find emitter correctness bugs:
- Export CEmu execution trace for first ~100 blocks from reset
- Compare A/F/BC/DE/HL/SP/IX/IY after each block
- Flag mismatches reveal ALU/flag computation errors that silently take wrong branches

### Key Technical Findings

- **ISR gate unlocked (Phase 24A)**: Flash port 0x06 returns 0xD0 (hardware ready status). Boot code reads port 0x06 but only SET bit 2 and write back — never branches on the value. 0xD0 has bit 2 = 0, passing the BIT 2 test, then CP 0xD0 matches.
- **ISR dispatch path**: 0x38 → 0x6F3 (IN0 flash) → 0x704 (CP 0xD0 gate) → 0x710 (callback dispatch) → 0x1713 (call callback) → 0x719 → 0x19BE (event loop)
- **Callback table at 0xD02AD7**: 24-bit pointer to ISR callback handler. Zeroed in our memory → calls 0x000000 (reset). Real OS sets this during init.
- **Handler 0x08C331 is OS init**: 691 steps, 162 blocks across 10 regions. Writes 262K bytes to system RAM, initializes callback table at 0xD02AD7. Heavy in 0x0A0000 (statistics) and 0x050000 regions.
- **ISR cycling is self-modifying**: The callback pointer at 0xD02AD7 evolves across interrupt cycles (0→0x10→0x0040B2). The ISR dispatch system bootstraps itself through repeated interrupt handling. Blocked at missing block 0x00AFF7.
- **Port I/O is 16-bit**: `IN r,(C)` / `OUT (C),r` use full BC register. Interrupt controller (0x5000+), memory controller (0x1000+), LCD controller (0x4000+) all via 16-bit ports.
- **Boot completes in 62 steps**: DI → PLL init → hardware setup → RST 0x08 → init → power-down HALT.
- **MMIO at 0xF00000+**: Not accessed during current execution paths. LCD writes happen later (after key press wake).

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
- `TI-84_Plus_CE/peripherals.js` — I/O peripheral bus + interrupt controller (PLL, GPIO, flash=0xD0, keyboard port 0x01, timers, FTINTC010 at 0x5000, memory ctrl at 0x1000, interrupt status 0x3D/0x3E)
- `TI-84_Plus_CE/test-harness.mjs` — 13-test validation harness + ISR dispatch + event loop + handler table scan
- `TI-84_Plus_CE/ti84-math.mjs` — Function call harness (FPAdd, FPMult, FPDiv, Sin — 16MB memory, 24-bit regs)
- `TI-84_Plus_CE/deep-profile.mjs` — Deep execution profiler (0x021000 analysis)
- `TI-84_Plus_CE/coverage-analyzer.mjs` — Gap analysis + heatmap + seed suggestions
- `TI-84_Plus_CE/ez80-decoder.js` — Complete eZ80 instruction decoder (~790 lines, integrated into transpiler)
- `TI-84_Plus_CE/test-alu.mjs` — ALU unit tests (72 tests: inc8, dec8, add8, sub8, adc, sbc, flags)
- `TI-84_Plus_CE/browser-shell.html` — Browser-based ROM executor (320x240 canvas, step/run controls, register display, block trace log)
- `TI-84_Plus_CE/phase24b-seeds.txt` — 45 seed addresses from ISR exploration (Tests 11-13)
- `ti84-rom-disassembly-spec.md`
- `codex-rom-disassembly-prompt.md`
- `codex-rom-state-machine-prompt.md`
- `ti84-native-port-spec.md`
- `CONTINUATION_PROMPT.md`
