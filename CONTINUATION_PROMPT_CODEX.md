# Continuation Prompt — TI-84 Plus CE ROM Transpilation

**Last updated**: 2026-04-12T02:40Z
**Focus**: TI-84 Plus CE ROM transpilation (CC-led this session, Codex continues). The trainer app pivoted to Physical Calculator Mode on 2026-04-11 evening — see `CONTINUATION_PROMPT.md` for trainer work, this file is the ROM-side source of truth.

**ROM transpiler current state** (after 2026-04-12 Phase 28):
- Coverage: **16.5076%** (124378 blocks, 692377 bytes)
- Seed count: **21331** (+14 Phase 24D seeds landed)
- Live stubs: **0**
- OS jump table: **980/980** (100%)
- ISR dispatch gate: **UNLOCKED** (0x000710 reachable)
- Keyboard scan: **WORKING** (0x0159C0, 9/9 PASS)
- **ISR event-loop dispatch**: **WORKING** end-to-end (16 blocks, 0x38 → 0x19BE → 0x1A5D keyboard handler → RETI)
- **VRAM pipeline**: **PROVEN** end-to-end (0x005B96 fills 153600 bytes in one step)
- **Full OS init**: **WORKING** end-to-end (handler 0x08C331, 691 steps, 1M RAM writes, matches Phase 24C predictions)
- **Real character rendering**: **WORKING** (0x0059c6 reads ROM font + draws actual glyph strokes to VRAM)
- **ROM write-protect**: implemented in cpu-runtime.js write8/write16/write24 — flash region 0x000000-0x3FFFFF is now read-only
- Browser shell: **deployed** on GitHub Pages
- Current `ROM.transpiled.js` built from commit `cb7af86` (2026-04-12), gitignored (175MB), **.gz committed**

**Resolved incident — stalled retranspile on 2026-04-11 ~19:06–20:00**: Root cause was a **perf bug, not a crash**. The walker at `scripts/transpile-ti84-rom.mjs:21977` used `Object.keys(blocks).length` in its `while` condition plus `queue.shift()` — both O(n²) over ~124K blocks. That's ~15 billion string allocations during the walk, pinning a CPU core for 53+ minutes with GC churn. It probably OOM'd at the final `JSON.stringify(walk.blocks)` after the walker finally finished, but since the script never wrote to stdout before the final `writeFileSync`, any crash was invisible. Fixed in commit `206f375` — walker now runs in **1.9s** (1600x speedup). Stale `new-seeds*.txt` files (Apr 9) were never actually consumed by the frontier runner.

**Trainer pivot note**: Phase 26 (Physical Calculator Mode) shipped end-to-end on 2026-04-11 evening across four commits (`ba6ae75`, `a976af6`, `48b5605`, `7a97232`). This is orthogonal to the ROM transpiler — trainer source is `ti84-trainer-v2/app.js`, not `scripts/transpile-ti84-rom.mjs`. No ROM blocks changed.

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
- **Keyboard Scan (port 0x01)**: Write selects key group (active low), read returns key status. **NOTE: Port 0x01 is NOT used for keyboard reads on the CE — keyboard is MMIO at 0xF50000+. Port 0x01 writes are only used during boot/shutdown config.**
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

### Phase 24D: Pre-initialized Callback + Keyboard Simulation (complete)

**Test 18 (Pre-initialized callback):** OS init at 0x08C331 writes **0xFFFFFF** (sentinel) to 0xD02AD7 — not a useful callback target. Running OS init before boot corrupts RAM, causing boot to loop at PLL (5000 steps, max_steps). ISR cycling after corrupted boot hits missing block 0x000698 repeatedly.

**Test 19 (Keyboard interrupt):** No keyboard port 0x01 accesses during ISR — the keyboard scan routine is not in the current execution path. Key press (ENTER) makes zero difference to ISR behavior. The keyboard scan code lives deeper in the OS event loop, which requires more blocks to be transpiled.

**Test 20 (Handler 0x0040B2):** This address is itself a **missing block** — only 3 steps before hitting missing_block. It needs to be seeded and transpiled.

**Critical missing blocks identified:**
- **0x0040B2**: ISR cycling target (callback pointer evolved to this address) — NOT TRANSPILED
- **0x000698**: PLL loop continuation block, adjacent to hot block 0x000697 — NOT TRANSPILED

**Seeds:** 4 new Phase 24D seeds. 82 total Phase 24 seeds added to transpiler. Transpiler regeneration in progress.

### Phase 24E: Re-transpile + Keyboard Breakthrough (complete)

Re-transpiled with 0x0040B2 + 0x000698 seeds: 124367 blocks (+2).

**Test 19 breakthrough:** With new blocks, keyboard interrupt simulation now runs **100,000 steps** with **452 keyboard port 0x01 accesses**! All accesses are OUTs (group select writes with value 0x00). No INs (reads) captured yet — the keyboard read path may use a different mechanism or the reads happen through memory-mapped I/O.

**Test 15 improvement:** Handler 0x00586A (previously missing block) now runs 232 steps to HALT.

**Test 17 unchanged:** ISR cycling still reaches callback 0x0040B2 at cycle 4, runs 293 steps at cycle 6.

**Test 18 still blocked:** 0x000698 shows in missing blocks list despite being seeded — the seed may have produced an empty/invalid block.

**Key insight:** The OS keyboard scan code IS executing (452 port writes). The next step is understanding why reads aren't being captured — likely a port width issue (keyboard reads may use 16-bit port addressing) or the reads go through IN r,(C) which uses BC as the port address.

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

CPU runtime (~1170 lines):
- Full `CPU` class (registers, ALU, I/O, stack, block transfer, rotate/shift)
- `createExecutor(blocks, memory, options)` with peripheral bus support
- MMIO intercepts: keyboard at 0xE00800-0xE00920, LCD controller at 0xE00000-0xE0002F
- Missing block skip-ahead + discovery collection
- Block visit counting + dynamic target detection (indirect jump instrumentation)
- Mode-aware execution, loop detection, I/O tracing
- `lcdMmio` exposed on executor return (upbase, control)

### `TI-84_Plus_CE/peripherals.js`

I/O peripheral bus + interrupt controller (~400 lines): PLL, CPU control, GPIO, flash (returns 0xD0), keyboard (port 0x01, 8-group matrix), timers, interrupt status (0x3D), interrupt ack (0x3E), timer-driven NMI/IRQ, FTINTC010 at 0x5000, memory controller at 0x1000. `setKeyboardIRQ(active)` sets/clears intc bit 19. Keyboard state exposed via `peripherals.keyboard`.

### `TI-84_Plus_CE/ti84-keyboard.js`

Keyboard mapping module (~75 lines): 54 PC-to-TI84 key mappings using SDK-authoritative reversed group ordering. `createKeyboardManager(peripherals)` returns `{ handleKeyDown, handleKeyUp, getKeyState }`. KEY_MAP exported as frozen object.

### `TI-84_Plus_CE/ti84-lcd.js`

LCD renderer module (~44 lines): `createLCDRenderer(canvas, memory, options)` decodes BGR565 from VRAM at configurable base (default 0xD40000). Tight pixel loop with reusable ImageData.

### `TI-84_Plus_CE/browser-shell.html`

Browser-based interactive emulator (~381 lines): Boot from compressed .gz, AutoRun mode with NMI timer, visual keyboard overlay (36 keys), key state display, LCD canvas (320×240), register display, execution log. Auto-initializes OS event loop callback after boot.

### `TI-84_Plus_CE/test-harness.mjs`

Validation harness (~2400 lines): 25 tests. Tests 1-20 from Phases 7-24. Test 21: _GetCSC interrupt path. Test 22: VRAM BGR565 codec. Test 23: OS event loop with pre-initialized callback. Test 24: _GetCSC trace + scan code mapping. Test 25: direct keyboard scan at 0x0159C0 (9/9 PASS).

### `TI-84_Plus_CE/keyboard-matrix.md`

Full 54-key matrix documentation with SDK-authoritative group mapping, scan code table, and architecture notes.

### `TI-84_Plus_CE/PHASE25_SPEC.md` / `PHASE25G_SPEC.md`

Implementation specs and investigation findings for Phase 25 (browser shell) and 25G (event loop + keyboard scan).

### `TI-84_Plus_CE/coverage-analyzer.mjs`

Standalone gap analysis: heatmap, gap ranking, seed suggestions.

### `TI-84_Plus_CE/ROM.transpiled.report.json`

Current metrics (retranspile in progress — will update):
- ROM size: `4194304`
- Block count: `124367` (will increase after retranspile)
- Covered bytes: `692348`
- Coverage percent: `16.51`
- Seed count: `21317`
- Live stubs: `0`
- OS jump table: `980/980` (100%)
- ISR dispatch gate: **UNLOCKED** (0x000710 reachable)
- Keyboard scan: **WORKING** (0x0159C0, 9/9 PASS)
- Browser shell: **DEPLOYED** (GitHub Pages)
- ROM.transpiled.js: **gitignored** (175MB). Generate locally.

Historical baselines:
- After Phase 24E: blocks=`124367`, bytes=`692348`, coverage=`16.51%`, keyboard port active (452 accesses)
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
2. `node scripts/transpile-ti84-rom.mjs` generates 124378 blocks at 16.5076% coverage (no z80js needed, **takes ~2 seconds** after Phase 27 walker fix — was 50+ min)
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
   - Test 18: Pre-init callback — OS init writes 0xFFFFFF (sentinel), corrupts boot
   - Test 19: Keyboard sim — no port 0x01 accesses, key press makes no difference
   - Test 20: Handler 0x0040B2 — missing block, needs transpiling
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
### Phase 24D: Pre-initialized Callback + Keyboard Sim (4 seeds) — DONE ✓
### Phase 24E: Re-transpile with critical seeds (0x0040B2, 0x000698) — DONE ✓
### Phase 24F: Keyboard MMIO handler + scan codes working — DONE ✓
### Phase 25: Interactive Browser Shell — DONE ✓
### Phase 25G: OS Event Loop + Keyboard Scan Investigation — DONE ✓
### Phase 26: Physical Calculator Mode (trainer) — DONE ✓

Trainer-side work, orthogonal to the ROM transpiler. Summary for cross-reference only; full history in `CONTINUATION_PROMPT.md` entries 66–69.

### Phase 27: Transpiler perf fix + correctness bugs + ISR breakthrough (2026-04-12 CC session) — DONE ✓

Diagnosed and fixed the 2026-04-11 stalled-retranspile incident, then chased the ISR dispatch path to a clean exit and proved the VRAM pipeline end-to-end. **5 bugs fixed across 7 commits**.

**Commit `206f375` — eliminate O(n²) walker (53min → 1.9s)**

Root cause of the stalled retranspile. `walkBlocks()` in `scripts/transpile-ti84-rom.mjs` used `Object.keys(blocks).length` in the `while` condition and `queue.shift()` — both quadratic over ~124K blocks. That's ~15B string allocations + GC churn pinning a core for 53+ minutes before probably OOM-ing at the final `JSON.stringify(walk.blocks)`. The script had *zero* stdout output before the final `writeFileSync`, so any crash was invisible.

Fix: track block count in a counter, use an index-head BFS queue (O(1) pop), stream progress + uncaught-exception reporting to stderr. Walker now runs in 1.9s. ~1600x speedup.

**Commit `fbf0397` — runFrom madl sync + in r,(c) flag updates**

Two independent correctness bugs found while tracing why ISR dispatch at 0x0019BE was stuck in a 50K-step loop at 0x001c33.

1. `runFrom(pc, mode, ...)` took a `startMode` argument but **never set `cpu.madl`**. Boot leaves `madl=0`, so every subsequent `runFrom(..., 'adl')` ran ADL block variants with `addressMask=0xFFFF` — silently stripping the upper byte of 24-bit register math. The sequence `ld hl, (0x020100); sbc hl, bc` at 0x0008BB truncated HL from 0xFFA55A to 0x0000, breaking every downstream magic/validation check. Fix: `cpu.madl = startMode === 'adl' ? 1 : 0` at runFrom entry.
2. The emitter generated `cpu.a = cpu.ioRead(cpu.bc)` for `in r, (C)` **without updating flags**. Z80/eZ80 documents this instruction as setting S/Z/H/PV/N from the read value, so every `in a, (c); jr z/nz` was following the wrong branch — mis-routing the entire interrupt dispatcher at 0x0019BE. Added `cpu.ioReadAndUpdateFlags(port)` helper and wired it in the emitter.

After both fixes, the ISR runs the correct path: `0x38 → 0x6F3 → 0x704 → 0x710 → 0x1713 → 0x8BB → 0x1717 → 0x1718 → 0x719 → 0x19BE → 0x19EF → 0x1A17 → 0x1A5D (keyboard handler) → 0x1A70 → 0x1A75 → 0x1A32 → reti`. **16 blocks, clean exit.** Test 25 still 9/9 PASS.

**Commit `f4b027d` — investigation probes**

Three diagnostic tools that drove the debugging:
- `TI-84_Plus_CE/probe-ld-hl.mjs` — isolated 0x0008bb block test across modes, proved the runFrom madl bug.
- `TI-84_Plus_CE/probe-event-loop.mjs` — traces ISR dispatch from 0x000038 with predecessor tracking and per-block register state. Found the `in r,(c)` flag bug AND the 0xD177BA uninitialized RAM issue.
- `TI-84_Plus_CE/probe-main-loop.mjs` — simulates post-HALT wake via `wakeFromHalt` option. Found that the NMI handler at 0x000066 is just a trampoline chain (0x000053 → 0x0220a8 → 0x04ab71 → 0x0003ac → 0x0019b5) that leads straight back to the halt block — a no-op.

**Commit `3d90a31` — VRAM fill proof (Option A)**

`probe-vram-fill.mjs` calls `0x005b96` directly. That block is a bare VRAM fill: `ld hl, 0xd40000; ld (hl), 0xff; ld de, 0xd40001; ld bc, 0x0257ff; ldir`. The lifted block writes all **153,600 bytes** of VRAM in **one step** via the `ldir` helper. Before: 0 non-zero. After: 153,600 bytes of 0xff. Pipeline proven end-to-end. LCD controller enable (LCDControl bit 0 at 0xE00018) is a separate concern not tested.

**Commit `def3da8` — testBit S/PV + in0 r,(n) flag fixes**

Two more flag bugs found during a systematic emitter audit:
1. `testBit(value, bit)` only set Z/H/N. Z80's `bit n,r` also updates S (set if bit 7 tested and bit 7 is 1) and PV (mirrors Z, undocumented but widely implemented). Any code using `bit 7, r; jp m/p` or `bit n, r; jp pe/po` was taking the wrong branch.
2. `in0 r, (n)` (eZ80 port-page-0 read) had the same emitter flaw as `in r, (c)`: used `ioReadPage0` which didn't update flags. Added `ioReadPage0AndUpdateFlags` helper and wired it.

Test 25 still 9/9 PASS. Event-loop probe unchanged (the common `bit n, r; jr z/nz` path was already working).

**Commit `bae53bd` — print-char probe marker**

`probe-print-char.mjs` tries to call the OS character-print entry at `0x0059c6` directly with `A='H'`. **Didn't complete** — the call chain descends into the table-scan helper at 0x001c33 with wrong inputs (different failure mode than the earlier ISR path that we unblocked). The print pipeline depends on OS-initialized RAM state (cursor, font table, display mode, charset pointer) that cold boot doesn't provide. Leaving the probe as a starting point for Phase 28 Option B work.

**Key architectural findings from this session**:

- **`0x0019BE` is the IRQ dispatcher, NOT a main loop.** It reads masked intc status bytes (0x5014/5015/5016), dispatches on bits, acks the IRQ, and returns via RETI. The keyboard IRQ path ends at 0x001a32 which pops the callback pointer off the stack, restores registers, and RETIs.
- **`0x0019b5` is the power-down halt**, not an idle halt: `di; ld a, 0x10; out0 (0x00), a; nop; nop; halt`. Only NMI can wake it. The `di` blocks IRQ-based wake.
- **There's a separate `ei; halt` at `0x001783`** (true IRQ-waiting halt), but it's only called from `0x0017b0`, part of an event-wait subroutine, not the main loop itself.
- **The NMI handler `0x000066` is a no-op trampoline** for our ROM: it reads port 0x3D (returns 0x00 → zero branch), validates magic at 0x0008bb, then jumps through a redirect chain back to the halt. In real hardware 0x0220a8 probably does something but in our state it's a passthrough.
- **The TI-OS architecture insight**: the OS doesn't have a single "render every tick" main loop. The shell, apps, and programs run in user context and call OS routines (`_GetCSC`, `_PutC`, etc.) explicitly. The ISR just acks interrupts — it doesn't render. To reach LCD activity we need to either (a) run user-context code that calls draw routines, (b) run OS init handler 0x08C331 first to establish RAM state then call specific functions, or (c) find a simpler VRAM blit routine and call it directly.

**Current frontier for Phase 28 (Option B — Full OS Main Loop)**:

The 2026-04-12 session proved the pipeline works end-to-end for direct function calls. The remaining question is: **how do we reach a state where the OS is running user-context code that draws to VRAM?**

Recommended approach: **run OS init handler 0x08C331 BEFORE calling draw functions**. From Phase 24C, 0x08C331 is major OS init — 691 steps, 162 blocks, writes 262K bytes to system RAM including the callback pointer at 0xD02AD7 and flags at 0xD0009B/0xD177BA. Running it first should establish the RAM state that `_PutC`-style calls need. The risk from Phase 24D ("Running OS init before boot corrupts RAM, causing boot to loop at PLL") is real — the fix is to run boot FIRST (to cold-state), THEN run OS init, THEN call the draw function.

### Phase 28: Full OS Init + Real Glyph Rendering (2026-04-12 CC session) — DONE ✓

Pursued Option B from Phase 27's recommendation. Landed `probe-os-init-draw.mjs` that runs the complete boot → OS init → draw pipeline, and fixed two more bugs along the way.

**Three-stage probe flow**:

1. **Boot**: 66 steps to power-down HALT at 0x0019b5
2. **OS init handler 0x08C331**: 691 steps, clean sentinel exit, **1,049,479 RAM writes** across 10 code regions (0x0axxxx dominant at 558 blocks, then 0x05xxxx, 0x03xxxx, 0x04xxxx, 0x02xxxx, 0x08xxxx). Post-init state: callback=0xFFFFFF sentinel, sysFlag=0xFF, initFlag=0xFF (0xD177BA set — no more workaround needed).
3. **Character print via 0x0059c6**: 84 steps per character, clean exit, reads real ROM font data at 0x003d6e + char * 0x1c, unpacks via the `sla c; adc a, d` 1-bit glyph loop at 0x005b16, and writes actual glyph strokes to VRAM.

**Commit `59c73e9` — Option B proof + critical fix**

First version required **disabling timer interrupts** (`timerInterrupt: false` on the peripheral bus). Without that, the default 200-tick IRQ fires mid-init and hijacks execution through the ISR dispatch chain (0x000710 → 0x001713 → ... → 0x0067f8 → 0x001c33 infinite loop). With timer off, OS init runs to completion in the 691 steps Phase 24C predicted.

**Commit `cb7af86` — ROM write-protect + real glyph rendering**

First pass showed solid white-filled 12x16 cells instead of character shapes. Investigation revealed the font staging buffer at 0xD005A1-0xD005C0 was all zeros — the `ldir` at block 0x005998 that copies font data from ROM (0x003d6e + char*0x1c) to RAM wasn't finding real font bytes.

Root cause: **OS init was writing to ROM addresses during its 1M-write sequence**, corrupting `mem[0x020100]` (magic header from `5a a5 ff ff` → `00 00 00 00`) and `mem[0x003d6e..]` (font bitmap data). Our emulator treated the entire 16MB `mem` array as writable, but TI-84 CE flash is read-only at hardware level.

Fix: added `if (a < 0x400000) return;` to cpu-runtime.js `write8`, `write16`, `write24`. Flash region is silently protected. OS init still runs cleanly (691 steps unchanged) but its stray ROM-region writes are dropped.

After the fix:
- `mem[0x020100..] = 5a a5 ff ff c3 ba d6 0b` — magic preserved ✓
- `mem[0x003d6e..]` — real font data preserved ✓
- Draw path reads real glyph bytes from ROM
- VRAM contains actual character glyph strokes, not solid fills

**Text-art render of a single character (rows 111-126, cols 67-78)**:
```
..############..
..###....#####..
..##......####..
..#...##...###..
..#..####..###..
....######..##..
....######..##..
....######..##..
....######..##..
....######..##..
....######..##..
..#..####..###..
..#...##...###..
..##......####..
..###....#####..
................
```

Recognizable glyph outline with curves and verticals. First time real OS-rendered character data has reached VRAM in this project.

**Test 25 still 9/9 PASS** (step count shifted 102 → 90 because ROM-region writes no longer succeed, reducing the path length, but scan codes are correct).

**Known refinement — multi-character HELLO still overlaps**:

Calling 0x0059c6 five times for H-E-L-L-O advances the cursor variable at 0xD00595 (0 → 1 → 2 → 3 → 4 → 5) but all 5 characters render in approximately the same VRAM area, overlapping each other. VRAM non-zero count per character: 248 → 240 → 296 → 296 → 256 (fluctuating as each overlap changes which pixels are "on").

Suspected cause: the column-offset computation at block 0x005ab6 reads `ld de, (0x00059c)` from ROM. At 0x00059c the ROM bytes are `c3 5c 09 01` — these are **code bytes** (a `JP 0x01095c` instruction), not a data table. Reading them as a 16-bit or 24-bit value gives a bogus column offset (0x5cc3 or 0x095cc3) that overflows the screen width and wraps around. Real hardware must be getting different bytes here somehow — possibly this is a memory bank switching thing, or a pointer indirection we're missing, or the draw routine should NOT be reading this address at all.

Follow-up work: trace the cursor-to-column conversion path more carefully. One character rendering is proven; multi-character rendering needs the column advance fixed.

---

**Phase 28 bugs fixed**:
1. Default timer IRQ disabled for OS init paths (probe-side, not code fix)
2. **ROM write-protect** in cpu-runtime.js (real fix, prevents ROM corruption from stray writes)

- `ba6ae75` — Add Physical Calculator Mode (step card renderer, `physicalAdvance` / `physicalBack`, `physicalMode` persisted flag, renderer replaces WASM panel when active)
- `a976af6` — Default flipped to physical (`parsed.physicalMode !== false`); legacy users grandfathered in, explicit opt-outs respected
- `48b5605` — Options dialog: titlebar "Firmware" → "Options", tucks Firmware + mode-toggle inside, bottom toggle strip removed
- `7a97232` — Choice-button flash feedback: Track 1 buttons shade green/red for 650ms before panel transitions

---

## Phase 25 Summary (2026-04-11)

### Browser Shell (browser-shell.html)
- ROM.transpiled.js.gz (15MB) committed to repo, decompressed via DecompressionStream on Boot
- Keyboard input: ti84-keyboard.js maps PC keys → TI-84 matrix (SDK keypadc.h authoritative)
- LCD rendering: ti84-lcd.js decodes BGR565 from VRAM at 0xD40000 via ImageData
- AutoRun mode with requestAnimationFrame loop
- NMI timer required (`timerMode: 'nmi'`) — boot ends with IFF=0, only NMI can wake CPU

### Keyboard Mapping (CRITICAL CORRECTION)
**MMIO at 0xE00810 uses REVERSED group ordering vs SDK kb_Data at 0xF50010:**
```
keyMatrix[N] = SDK Group(7-N)
```
Full verified mapping:
- keyMatrix[0] = SDK G7: DOWN(B0) LEFT(B1) RIGHT(B2) UP(B3)
- keyMatrix[1] = SDK G6: ENTER(B0) +(B1) -(B2) ×(B3) ÷(B4) ^(B5) CLEAR(B6)
- keyMatrix[2] = SDK G5: (-)(B0) 3(B1) 6(B2) 9(B3) )(B4) TAN(B5) VARS(B6)
- keyMatrix[3] = SDK G4: .(B0) 2(B1) 5(B2) 8(B3) ((B4) COS(B5) PRGM(B6) STAT(B7)
- keyMatrix[4] = SDK G3: 0(B0) 1(B1) 4(B2) 7(B3) ,(B4) SIN(B5) APPS(B6) XTθn(B7)
- keyMatrix[5] = SDK G2: STO(B1) LN(B2) LOG(B3) x²(B4) x⁻¹(B5) MATH(B6) ALPHA(B7)
- keyMatrix[6] = SDK G1: GRAPH(B0) TRACE(B1) ZOOM(B2) WINDOW(B3) Y=(B4) 2ND(B5) MODE(B6) DEL(B7)

Scan code = `(keyMatrix_index << 4) | bit`. 63/64 positions active. DOWN(G0:B0) = 0x00 (indistinguishable from no-key).

**Phase 24F labels were WRONG** — scan codes were correct but key names were guessed. The SDK from ce-programming/toolchain is the authoritative source.

### _GetCSC (0x03CF7D) — ISR Exit Code, NOT a Scanner
ROM disassembly of handler at 0x03D184-0x03D1BB revealed:
1. Acknowledges keyboard IRQ (OUT to port 0x500A)
2. Disables keyboard IRQ in enable mask (port 0x5006)
3. Overwrites callback pointer at 0xD02AD7
4. Clears (IY+27) bit 6 system flag
5. Returns via RETI (expects ISR stack frame)
**Never reads keyboard MMIO.** A=0x10 return was stale register, not a scan code.

### Direct Keyboard Scan (0x0159C0) — WORKING
- Sets IY=0xE00800, reads MMIO scan result at 0xE00900
- Returns scan code in B register (NOT A)
- Test 25: 9/9 PASS for all tested keys
- Must capture B at block 0x015AD2 (before exit path corrupts registers)
- Timer must be disabled (`timerInterrupt: false`), IFF1=0

### OS Event Loop — Blocked at 0x00B608 (retranspile in progress)
- Pre-initialized callback (0xD02AD7 = 0x0019BE) + system flags works
- ISR reaches event loop at 0x0019BE (18 steps)
- Event loop walks a ROM table at 0x001C33-0x001C48 (bytecode interpreter?)
- Cycling hits missing block 0x00B608 on the NORMAL (non-keyboard) path
- The keyboard handler clears IRQ + enable mask after handling, so subsequent cycles take the non-keyboard path
- Seeds 0xB608/B610/B620/B640 added, retranspile in progress
- 0xB608 contains valid code (0xE5 = PUSH HL) — just wasn't reachable by static analysis

### Browser Shell Features (browser-shell.html, 381 lines)
- ROM.transpiled.js.gz (15MB) committed to repo, decompressed via DecompressionStream on Boot
- Visual TI-84 keyboard overlay (36 keys, active-key highlighting)
- 54 PC-to-TI84 key mappings: digits, operators, arrows, function keys, trig (S/C/T), LN/LOG (L/G), etc.
- LCD rendering: ti84-lcd.js decodes BGR565 from VRAM at 0xD40000 via ImageData
- Auto-init: after boot, sets callback table (0xD02AD7=0x0019BE) + system flag (IY+27 bit 6)
- AutoRun mode: requestAnimationFrame loop, NMI timer wakes from HALT
- Key state display: shows pressed key labels + computed scan codes

### Keyboard Hardware Architecture
**Two MMIO interfaces, reversed group ordering:**
- **0xE00810-0xE00817** (used by ROM scan function 0x0159C0): our `keyMatrix[0-7]`
- **0xF50010+** (used by SDK `kb_Data[1-7]`): different address space, same hardware
- Mapping: `keyMatrix[N]` = SDK `kb_Data[7-N]` (REVERSED)

**SDK-authoritative group mapping (from ce-programming/toolchain keypadc.h):**
- keyMatrix[0] = SDK G7: DOWN(B0) LEFT(B1) RIGHT(B2) UP(B3)
- keyMatrix[1] = SDK G6: ENTER(B0) +(B1) -(B2) ×(B3) ÷(B4) ^(B5) CLEAR(B6)
- keyMatrix[2] = SDK G5: (-)(B0) 3(B1) 6(B2) 9(B3) )(B4) TAN(B5) VARS(B6)
- keyMatrix[3] = SDK G4: .(B0) 2(B1) 5(B2) 8(B3) ((B4) COS(B5) PRGM(B6) STAT(B7)
- keyMatrix[4] = SDK G3: 0(B0) 1(B1) 4(B2) 7(B3) ,(B4) SIN(B5) APPS(B6) XTθn(B7)
- keyMatrix[5] = SDK G2: STO(B1) LN(B2) LOG(B3) x²(B4) x⁻¹(B5) MATH(B6) ALPHA(B7)
- keyMatrix[6] = SDK G1: GRAPH(B0) TRACE(B1) ZOOM(B2) WINDOW(B3) Y=(B4) 2ND(B5) MODE(B6) DEL(B7)

Scan code = `(keyMatrix_index << 4) | bit`. 63/64 active (DOWN=0x00 collides with no-key).

**Phase 24F key labels were WRONG.** Scan codes were correct but physical key names were guessed. SDK is authoritative. Example: Phase 24F labeled G6:B0 as "ENTER" — it's actually GRAPH.

### _GetCSC (0x03CF7D) — ISR Exit Code, NOT a Scanner
ROM disassembly of handler at 0x03D184-0x03D1BB:
```asm
PUSH AF
LD A, 0x08 / OUT (C), A     ; port 0x500A — acknowledge keyboard IRQ
LD C, 0x06 / IN A, (C)      ; port 0x5006 — read enable mask
RES 3, A / OUT (C), A       ; disable keyboard IRQ in mask
; ... ISR cleanup: POP AF, POP HL, LD (0xD02AD7),HL, RES 6,(IY+27) ...
POP IY / POP IX / POP AF / RETI
```
**Never reads keyboard MMIO.** A=0x10 was stale register. Returns via RETI (expects ISR stack frame). Do NOT call directly — use 0x0159C0 instead.

### Direct Keyboard Scan (0x0159C0) — WORKING, 9/9 PASS
- Sets IY=0xE00800, reads MMIO scan result at 0xE00900
- Returns scan code in **B register** (NOT A)
- Must capture B at block 0x015AD2 (exit path at 0x000DB6 corrupts registers)
- Timer must be disabled (`timerInterrupt: false`), IFF1=0
- Test 25 verified all 8 SDK-mapped keys + no-key = 9/9 PASS

---

## What Is Still Missing / Next Frontiers

Coverage at ~124370 blocks (16.5%). ISR gate unlocked. Keyboard scan working. Browser shell deployed. Remaining frontiers:

### 1. OS Event Loop Unblock
- 0xB608 seeds already landed in commit `1836e80`; event loop runs 50K steps
- Next step: rerun Test 23 on current `ROM.transpiled.js` (the one from `1836e80`) and see where it hangs now
- The event loop at 0x001C33 walks a ROM table — need to understand what it dispatches
- The stalled 19:06 retranspile on 2026-04-11 was going to feed in `new-seeds.txt` / `new-seeds-round2.txt` / `new-seeds-round3.txt` from the frontier runner. **That run died silently; diagnose first or bypass by manually running `node scripts/transpile-ti84-rom.mjs` with a small seed batch**

### 2. LCD Display
- LCD MMIO intercept at 0xE00000 is wired (LCDUPBASE at 0x10, LCDControl at 0x18)
- VRAM renderer at 0xD40000 (BGR565, 320×240, 153KB) is working
- LCD stays black because OS boot path doesn't write VRAM
- Need the event loop to reach display init code (depends on frontier #1)

### 3. CEmu Trace Verification
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
