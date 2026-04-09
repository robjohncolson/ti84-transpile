# Continuation Prompt — TI-84 Plus CE ROM Transpilation

**Last updated**: 2026-04-09T17:15Z
**Focus**: Continue the TI-84 Plus CE ROM to JavaScript transpilation effort
**Current phase**: Phases 1-11B complete. Coverage at 7.58% (50488 blocks, ~30% of OS area). Zero live stubs. Reset vector executes to HALT (60 steps with peripherals). I/O peripheral model active. Multi-entry testing + indirect jump instrumentation operational.

---

## What Was Completed In This Session (Phases 7-11B)

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

**NOT YET INTEGRATED** — the decoder is built and tested but not wired into the transpiler. Phase 13B (next session) will:
1. Add ~30 new tag handlers to the emitter
2. Replace z80js decode calls with the new decoder
3. Remove z80js npm dependency
4. Regenerate and compare output

---

## Current Outputs

### `scripts/transpile-ti84-rom.mjs`

Source of truth for generation. Current seed count: 125 (RST vectors + known anchors + gap seeds + 70 dynamic targets). Still uses z80js + manual decoders (Phase 13B will replace).

### `TI-84_Plus_CE/ROM.transpiled.js`

Generated module: 50488 blocks, 7.58% coverage.

### `TI-84_Plus_CE/cpu-runtime.js`

CPU runtime (~840 lines):
- Full `CPU` class (registers, ALU, I/O, stack, block transfer, rotate/shift)
- `createExecutor(blocks, memory, options)` with peripheral bus support
- Missing block skip-ahead + discovery collection
- Block visit counting + dynamic target detection (indirect jump instrumentation)
- Mode-aware execution, loop detection, I/O tracing

### `TI-84_Plus_CE/peripherals.js`

I/O peripheral bus (~237 lines): PLL, CPU control, GPIO, flash, timers.

### `TI-84_Plus_CE/test-harness.mjs`

Validation harness (~320 lines): 5 tests, multi-entry exploration, missing block discovery, dynamic target discovery, hot block profiling, PLL validation.

### `TI-84_Plus_CE/coverage-analyzer.mjs`

Standalone gap analysis: heatmap, gap ranking, seed suggestions.

### `TI-84_Plus_CE/ROM.transpiled.report.json`

Current metrics:
- ROM size: `4194304`
- Block count: `50488`
- Covered bytes: `317806`
- Coverage percent: `7.5771`
- Seed count: `125`
- Live stubs: `0`

Historical baselines:
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
2. `node scripts/transpile-ti84-rom.mjs` generates 50488 blocks at 7.58% coverage
3. All 50488 blocks compile successfully (0 failures)
4. `node TI-84_Plus_CE/test-harness.mjs` runs 5 tests:
   - Tests 1-3: Reset vector → HALT in 60 steps (with peripherals + loop breaker)
   - Test 4: Peripheral validation — PLL returns 0x04 correctly, 1 forced break (interrupt-driven loop)
   - Test 5: 14 entry points — 8 reach HALT, 4 run deep, 2 hit missing blocks
5. `node TI-84_Plus_CE/coverage-analyzer.mjs` — OS area ~30%, gap seeds identified
6. Missing block discovery: 2 dynamic targets (0x7eedf3, 0xc202fe — wild jumps)
7. Dynamic jump instrumentation: 72 targets discovered, all already statically reachable
8. **Zero** `cpu.unimplemented()` live stubs (all 25 fixed via decoder + emitter patches)

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

From repo root:

```bash
npm install --no-save --package-lock=false z80js
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
### Phase 13B: Integrate Decoder into Transpiler — TODO (next session)

---

## What Is Still Missing / Next Frontiers

The static reachability frontier is exhausted at ~50K blocks. Further coverage requires dynamic techniques:

### 1. Integrate eZ80 Decoder (Phase 13B — immediate next step)

The standalone decoder at `TI-84_Plus_CE/ez80-decoder.js` (784 lines) is built and tested. Integration requires:
1. Import decoder into `scripts/transpile-ti84-rom.mjs`
2. Add ~30 new tag handlers to `emitInstructionJs()` (ld-reg-reg, ld-reg-imm, alu-reg, alu-imm, inc-reg, dec-reg, add-pair, sbc-pair, adc-pair, push, pop, bit-test, bit-set, bit-res, rotate-reg, rotate-ind, in-reg, out-reg, out-imm, ld-special, ex-de-hl, ex-sp-pair, ex-af, exx, di, ei, scf, ccf, cpl, daa, neg, rlca, rrca, rla, rra, rrd, rld, ldi/ldir/ldd/lddr/cpi/cpir, retn, reti, im, ld-reg-ixd, ld-ixd-reg, ld-ixd-imm, alu-ixd, inc-ixd, dec-ixd, ld-sp-pair, ld-pair-ind, ld-ind-pair, ld-reg-ind, ld-ind-reg, ld-reg-mem, ld-mem-reg, ld-pair-imm, ld-pair-mem, ld-mem-pair, ld-ind-imm, in-imm)
3. Replace `z80js` decode calls with new decoder
4. Remove `z80js` npm dependency
5. Regenerate and verify: block count should be ≥ 50488, stubs should be 0

The decoder produces structured objects so the emitter can use direct tag dispatch — no more mnemonic regex matching. This eliminates the entire z80js→text→regex pipeline.

### 2. Indirect Jump Resolution

Many blocks end in `jp (hl)`, `jp (ix)`, or computed jumps. The transpiler can't follow these statically. Approach:
- Instrument the executor to log all indirect jump targets during test runs
- Feed discovered targets back as seeds for the next transpiler pass
- This creates a feedback loop: execute → discover targets → regenerate → execute deeper

### 2. Interrupt Dispatch Model

The PLL loop at 0x000690-0x000697 exits via interrupt (carry set externally). Without interrupt dispatch:
- Reset vector reaches HALT in 60 steps (with force-break) instead of continuing past PLL init
- Entry points 0x658, 0x800, 0x1afa are stuck in PLL loop

Approach:
- Add a basic interrupt controller to peripherals.js
- Timer interrupt fires after configurable cycle count
- Interrupt handler pushes PC, jumps to vector table entry
- This would unlock the full post-PLL startup sequence

### 3. New Instruction Forms at Deeper Frontier

As coverage expands, new instruction forms will appear. The Phase 11B pattern (fix stubs → discover new paths → new stubs → fix again) should be repeated iteratively. Current emitter coverage is comprehensive but not exhaustive — the eZ80 instruction set is large.

### 4. Execution Trace Verification

Compare against CEmu's real execution trace:
- CEmu logging of first N blocks from reset
- Block-by-block comparison of register/flag state
- Identify emitter correctness bugs

### 5. Deep Execution Analysis

`0x021000` runs 5000 steps without halting — substantial code path. Investigate:
- What code is executing (graphics init? OS setup?)
- What blocks are hot (frequently visited)
- What missing blocks would unlock further depth

---

## Remaining `cpu.unimplemented(...)` Surface

**Zero live stubs** as of Phase 11B. All previously irreducible stubs were fixed:

- `ld (ix+0xFFF9), {1}` at `0x024343` — fixed by doubled-prefix consumption (FD DD → DD wins)
- `ld (ix+0x00E6), {1}` at `0x028298` — same fix
- `Error disassembling ED DD` at `0x070b2b` — fixed by ED NOP fallback for undefined opcodes
- 22 additional stubs discovered at deeper frontier — all fixed via emitter patches (sbc a imm, out (n) a, .sil normalization, nop tag)

---

## Useful Repo Files

- `scripts/transpile-ti84-rom.mjs` — ROM transpiler (source of truth, 55 seeds)
- `TI-84_Plus_CE/ROM.rom` — TI-84 Plus CE ROM image (4MB)
- `TI-84_Plus_CE/ROM.transpiled.js` — Generated module (50383 blocks)
- `TI-84_Plus_CE/ROM.transpiled.report.json` — Coverage metrics
- `TI-84_Plus_CE/cpu-runtime.js` — CPU class + createExecutor + missing block discovery
- `TI-84_Plus_CE/peripherals.js` — I/O peripheral bus (PLL, GPIO, flash, timers)
- `TI-84_Plus_CE/test-harness.mjs` — 5-test validation harness + multi-entry + discovery
- `TI-84_Plus_CE/coverage-analyzer.mjs` — Gap analysis + heatmap + seed suggestions
- `TI-84_Plus_CE/ez80-decoder.js` — Complete eZ80 instruction decoder (784 lines, NOT YET INTEGRATED)
- `ti84-rom-disassembly-spec.md`
- `codex-rom-disassembly-prompt.md`
- `codex-rom-state-machine-prompt.md`
- `ti84-native-port-spec.md`
- `CONTINUATION_PROMPT.md`
