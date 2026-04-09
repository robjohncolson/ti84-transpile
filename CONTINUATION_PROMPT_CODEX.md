# Continuation Prompt — TI-84 Plus CE ROM Transpilation

**Last updated**: 2026-04-09T14:55Z
**Focus**: Continue the TI-84 Plus CE ROM to JavaScript transpilation effort
**Current phase**: Phases 1-6 complete. Coverage at 5.20% (32768 blocks). Reset vector executes to HALT (1308 steps). Call/return tracking works via stack-based approach.

---

## What Was Completed In This Session

### Phase 5 — Test Harness + Reset Vector Validation (complete)

Created `TI-84_Plus_CE/test-harness.mjs` and fixed `TI-84_Plus_CE/cpu-runtime.js`:

**cpu-runtime.js changes:**
- `createExecutor()` rewritten: robust block compilation (body extraction via indexOf/lastIndexOf), block exit metadata tracking for mode resolution
- Mode tracking: executor follows `targetMode` from block exits (z80 ↔ adl transitions work correctly)
- I/O tracing hooks: `cpu.onIoRead(port, value)` and `cpu.onIoWrite(port, value)` called from all I/O methods
- `onBlock` callback: `runFrom()` accepts `opts.onBlock(pc, mode, meta, step)` for execution tracing
- Loop detector: ring buffer of recent block keys, force-breaks after `maxLoopIterations` (default 64) by advancing to fallthrough exit or setting carry flag
- `call()` method updated: pushes argument to hardware stack (though emitted code now handles this directly)
- Return value includes `loopsForced` count and `lastMode`

**test-harness.mjs:**
- 3 test runs: reset vector (500 steps), startup (1000 steps), extended (5000 steps)
- Traces block entries, logs I/O ops, prints register state
- Reports termination reason, missing blocks, loop breaks

**Key findings:**
- Mode switch at step 1: `000000:z80` → `000658:adl` (RSMIX + LIL-prefixed JP)
- PLL init loop at `0x000690`↔`0x000697` polls port 0x28, exit condition is `jr nc` with carry never set — infinite without hardware. Loop breaker force-advances to `0x0006b3`
- SP correctly initialized to `0xd1a87e`
- I/O port configuration sequence: ports 0x00-0x28 (CPU control, flash, PLL, GPIO, timers)

### Phase 5.3 — Emitter Fixes (complete)

**CALL instructions made block-terminating:**
- Previously calls were non-terminating — `cpu.call(target)` was a side effect, block continued past
- Now calls end the block: `cpu.push(returnAddress); return callTarget;`
- Conditional calls: `if (condition) { cpu.push(ret); return target; } return fallthrough;`
- `buildBlock()` adds `break` after call handling, emits `call-return` exit type
- Dead code eliminated: check for `kind === 'call'` in fallthrough-append logic

**Conditional return fallthrough fix:**
- `ret c`, `ret z`, etc. previously had no fallthrough exit — reachability walker never discovered the block after the conditional return
- Added fallthrough exit with target for `return-conditional` kind
- Fixed reachability: block `0x001c82` (after `ret c` at `0x001c81`) now discovered

**Block limit raised:** 16384 → 32768 to compensate for call-terminating blocks creating more, smaller blocks

### Phase 6 — Extended Execution + Call/Return Tracking (complete)

With call-terminating blocks, the stack-based approach handles call/return naturally:

1. CALL block pushes return address, returns call target
2. Executor follows call target (normal block-to-block execution)
3. Subroutine eventually hits RET → pops return address from stack
4. Executor continues at the return address

**Results:**
- Reset vector executes 1308 blocks to reach HALT at `0x0019b5`
- HALT block: `di; ld a, 0x10; out0 (0x00), a; nop; nop; halt` — CPU power-down sequence
- 64 I/O operations across the full startup
- 1 loop forced (PLL init), all other execution is natural
- 32768/32768 blocks compile, 0 failures
- Call depth returns to 0 at halt (all calls/returns balanced)

### Phase 1 — Generic Emitter Widening (complete)

Added 6 emitter families to `emitInstructionJs()`, eliminating 27 of 46 live stubs:

- `add a, register` (a/b/c/d/e/h/l)
- `xor register` (b/c/d/e/h/l)
- `xor immediate` (0xNN)
- `or immediate` (0xNN)
- `sbc a, register` (a/b/c/d/e/h/l)
- `set bit, register` (b/c/d/e/h/l)

Also fixed Windows path resolution (`fileURLToPath` instead of raw `URL.pathname`).

### Phase 2 — ED-family, Mixed-mode, and Edge Cases (complete)

Eliminated all remaining 19 stubs:

- `in r, (c)` for b/c/d/e/h/l registers
- `adc hl, rr` word-ALU
- `lddr` and `neg`
- `.sil` prefix normalization on inc/dec/add/push/pop word patterns
- Indexed increment malformed form (`inc ix-1` → proper indexed read-modify-write)
- Duplicated-prefix control-flow decoding (`DD/FD` + `CD/C3/18` etc.)
- Malformed `jr pc+N` branch text fallback

### Phase 3 — Push Coverage (complete)

Raised block limit from 2048 → 16384 (8x). Coverage: 0.53% → 4.05%.

- Added 7 new seed entry points (OS entry, ISR, function tables, mid-ROM regions)
- Added emitters: `ldd`, `rld`, `rrd`, `sla r`, `sra r`, `rlc r`, `rrc r`, `rl r`
- Added emitters: `adc a, n`, `res bit, register`, `cp ixh/ixl/iyh/iyl`
- Added indexed: `dec (ix+d)`, `sub (ix+d)`, `add a, (ix+d)`, `and (ix+d)`, `or (ix+d)` malformed forms
- Fixed `.sil`/`.lil` tolerance on `sub`, `ld a,(pair)`, `ld (pair),a`
- Fixed `nop.sil` prefix matching
- Added `FD ED`/`DD ED` prefix-through decoding in `decodeInstruction`
- 3 irreducible stubs remain (z80js `{1}` parser bugs + nonsense `ED DD`)

### Phase 4 — CPU Runtime Scaffold (complete)

Created `TI-84_Plus_CE/cpu-runtime.js`:

- Full `CPU` class implementing all `cpu.*` methods used by emitted blocks
- Registers: 8-bit (a-l,f) with 16/24-bit pair getters/setters, alternates, index half-registers
- ALU: add8, subtract8, addWithCarry8, subtractWithBorrow8, compare, negate, DAA
- Word ALU: addWord, addWithCarryWord, subtractWithBorrowWord, multiplyBytes
- Rotate/Shift: all RLC/RRC/RL/RR/SLA/SRA/SRL/SLL via rotateShift8
- Block transfer: ldi, ldir, ldd, lddr, cpi, cpir
- BCD: rld, rrd
- I/O: ioRead/Write, page-0 variants, testIo, otimr
- Stack: push/pop with ADL/Z80 mode-aware width
- Control: checkCondition, decrementAndCheckB, halt, sleep
- `createExecutor()` that compiles block source strings and runs them

### Earlier work (previous sessions)

- Eliminated malformed live stub set (ED 07/0F/17/27, indexed, in/cp)
- Added manual indexed decoding (DD/FD 36, DD/FD BE, duplicated-prefix CB)
- Added manual ED decoding (LD rr,(HL), LD (HL),rr, OTIMR)
- Added emitted JS support for EX (SP),HL/IX/IY, CPI, IN A,(n)
- Fixed RETN/RETI control-flow classification
- Raised block cap from 1024 to 2048

This is still not a decompiler or a runnable emulator. It remains a byte-lift scaffold.

---

## Current Outputs

### `scripts/transpile-ti84-rom.mjs`

This is still the source of truth for generation.

Current behavior:

- Reads `TI-84_Plus_CE/ROM.rom`
- Embeds the full ROM in generated JS as base64
- Uses `z80js` as the base disassembler
- Overrides several eZ80- and CE-specific instruction forms manually
- Walks reachable control flow from seed vectors plus additional known anchors
- Emits readable JavaScript block bodies with original bytes and disassembly comments

### `TI-84_Plus_CE/ROM.transpiled.js`

Generated module containing:

- `TRANSPILATION_META`
- `ROM_BASE64`
- `ENTRY_POINTS`
- `PRELIFTED_BLOCKS`
- `decodeEmbeddedRom()`

### `TI-84_Plus_CE/cpu-runtime.js`

CPU runtime with `createExecutor()`:

- Full `CPU` class (registers, ALU, I/O, stack, block transfer, rotate/shift)
- `createExecutor(blocks, memory)` → `{ cpu, compiledBlocks, blockMeta, runFrom() }`
- Mode-aware execution via block exit metadata
- Loop detection + force-break for hardware init loops
- I/O tracing hooks (`onIoRead`, `onIoWrite`)
- Block trace callback (`onBlock`)

### `TI-84_Plus_CE/test-harness.mjs`

Validation script: `node TI-84_Plus_CE/test-harness.mjs`

- 3 test runs from reset vector with increasing step limits
- Block trace, register dump, I/O log, termination analysis
- Expected result: 1308 steps → HALT at `0x0019b5`

### `TI-84_Plus_CE/ROM.transpiled.report.json`

Current metrics (after Phase 6):

- ROM size: `4194304`
- Block count: `32768`
- Covered bytes: `218062`
- Coverage percent: `5.199`
- Seed count: `18`
- Live stubs: `3` (irreducible — z80js parser artifacts)

Historical baselines:

- After Phase 5 (call-terminating, 16K): blocks=`16384`, bytes=`119253`, coverage=`2.84%`
- After Phase 3 (non-terminating calls): blocks=`16384`, bytes=`170053`, coverage=`4.05%`
- After Phase 2: blocks=`2048`, bytes=`22033`, stubs=`0`
- After Phase 1: blocks=`2048`, bytes=`22033`, stubs=`19`
- Before Phase 1: blocks=`2048`, bytes=`22033`, stubs=`46`
- After 1024-block session: blocks=`1024`, bytes=`10268`
- Initial: blocks=`384`, bytes=`3613`

---

## Verified State

The following were verified after the latest changes:

1. `node --check scripts/transpile-ti84-rom.mjs` passes
2. `node scripts/transpile-ti84-rom.mjs` generates 32768 blocks at 5.199% coverage
3. `TI-84_Plus_CE/ROM.transpiled.js` imports successfully
4. `decodeEmbeddedRom().length === 4194304`
5. All 32768 blocks compile successfully (0 failures)
6. `node TI-84_Plus_CE/test-harness.mjs` runs 3 tests:
   - Reset vector: 500+ steps, reaches hardware config tables
   - Startup: 1000+ steps, deep into init sequence
   - Extended: **1308 steps → HALT at 0x0019b5** (CPU power-down)
7. Mode tracking works: z80 → adl transition at step 1 (RSMIX + LIL JP)
8. Call/return tracking works: nested calls to depth 4+, all returns balanced
9. I/O port init sequence: 64 operations across ports 0x00-0x28
10. Only 1 hardware loop force-break needed (PLL poll at 0x000690↔0x000697)
11. 3 irreducible `cpu.unimplemented()` stubs remain (z80js parser artifacts)

---

## Important Constraints

### This repo is already dirty

There are many unrelated modified files in the worktree. Do not revert them.

### Current git state for the transpilation handoff

At the time of this prompt update:

- `scripts/transpile-ti84-rom.mjs` is tracked and modified
- `TI-84_Plus_CE/ROM.transpiled.report.json` is tracked and modified
- `TI-84_Plus_CE/ROM.transpiled.js` is untracked
- `CONTINUATION_PROMPT_CODEX.md` is untracked

Be careful not to confuse that with unrelated repo changes.

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

Quick validation:

```bash
node - <<'JS'
import('./TI-84_Plus_CE/ROM.transpiled.js').then((mod) => {
  console.log(mod.TRANSPILATION_META);
  console.log(mod.decodeEmbeddedRom().length);
});
JS
```

Full execution validation:

```bash
node TI-84_Plus_CE/test-harness.mjs
```

Expected output: Test 3 reaches 1308 steps, terminates at HALT.

---

## What The Current Lift Handles Well

- **Full reset vector execution** to HALT (1308 blocks, 64 I/O ops)
- **Call/return tracking** via stack-based push/pop (calls are block-terminating)
- **Mode switching** between z80 and ADL modes via block exit metadata
- **Loop detection** with configurable force-break for hardware init loops
- Reset/vector startup sequence
- Additional reachability seeded from:
  - `0x000658`
  - `0x001afa`
  - `0x020110`
- eZ80 mode-switch detection around `.LIL` and `RSMIX`
- Page-0 I/O ops used in startup:
  - `IN0`
  - `OUT0`
- Common control flow:
  - `JR`
  - `JP`
  - `CALL`
  - `RET`
  - `RST`
  - indirect `JP`
  - `RETN`
  - `RETI`
- Many common stateful ops:
  - `XOR A`
  - `CP n`
  - many `LD` register/immediate forms
  - more absolute-memory `LD` forms
  - more indexed loads/stores
  - indexed immediate stores
  - indexed compare forms
  - many `(hl)` ALU forms
  - `EXX`
  - `EX AF,AF'`
  - `EX (SP),HL|IX|IY`
  - `DI`
  - `EI`
  - `IM 0`
  - `IM 1`
  - `IM 2`
  - several rotate/shift helpers
  - `LDI`
  - `LDIR`
  - `CPI`
  - `CPIR`
  - `OTIMR`
  - `IN A,(n)`
  - `LD rr,(HL)` and `LD (HL),rr`
- Manual decoding of indexed `DD/FD CB d opcode` forms, including duplicated-prefix malformed cases

---

## What Is Still Missing

With Phases 1-6 complete, the remaining gaps are:

1. **I/O peripheral model**: All port reads return 0xFF. The PLL init loop requires a force-break. A proper model for ports 0x00, 0x03, 0x06, 0x28 would allow natural execution.

2. **Coverage ceiling**: At 32768 blocks and 5.2% coverage, call-terminating blocks consume budget faster. Raising the limit or optimizing block discovery would help.

3. **Execution path validation**: No comparison against CEmu's real execution trace yet. The lifted blocks produce results but correctness beyond "it reaches HALT" is unverified.

4. **3 irreducible stubs**: z80js parser bugs at `0x024343`, `0x028298` (ADL mode oversized displacement), and `0x070b2b` (nonsense `ED DD` prefix). Require manual decoders or z80js replacement.

5. **Call address bug (known, non-blocking)**: `cpu.call()` method still exists but emitted code now handles push directly. The method is dead code — can be removed.

---

## Remaining `cpu.unimplemented(...)` Surface

After Phase 3, there are **3** irreducible `cpu.unimplemented()` stubs in `ROM.transpiled.js`:

- `ld (ix+0xFFF9), {1}` at `0x024343` — z80js parser bug (ADL mode oversized displacement, `{1}` placeholder)
- `ld (ix+0x00E6), {1}` at `0x028298` — same z80js parser bug
- `Error disassembling ED DD` at `0x070b2b` — nonsense prefix sequence

These cannot be fixed without replacing the z80js disassembler or adding manual decoders for these specific byte sequences.

---

## Recommended Next Phase

### Phase 1: Widen the generic emitter — DONE ✓
### Phase 2: Clean mixed-mode and remaining ED edge cases — DONE ✓
### Phase 3: Push beyond the current reachability frontier — DONE ✓
### Phase 4: Add an executable runtime scaffold — DONE ✓
### Phase 5: Test harness + reset vector validation — DONE ✓
### Phase 6: Extended execution + call/return tracking — DONE ✓

---

## Suggested Immediate Task For Next Session

Phases 1-6 are complete. The reset vector executes to HALT. Next steps:

### Phase 7: I/O Peripheral Model

The current I/O stub returns 0xFF for all reads. A basic peripheral model would:

1. Simulate the PLL/flash controller (port 0x28) — return "ready" after init
2. Simulate the GPIO port (0x03) — return meaningful button/status values
3. Model the CPU control register (0x00) — detect power-down writes
4. This would eliminate the need for the loop force-breaker on the PLL init loop
5. Allow the startup to proceed naturally without artificial loop breaking

### Phase 8: Multi-Entry-Point Execution

Test execution from other entry points beyond the reset vector:

1. Run from ISR entry (`0x000008:adl`, `0x000010:adl`, etc.)
2. Run from OS entry (`0x020110:adl`)
3. Run from the mid-ROM function tables (`0x004000`, `0x021000`)
4. Document which entry points reach interesting execution depths

### Phase 9: Coverage Expansion

With call-terminating blocks consuming more of the budget:

1. Raise block limit further (64K or higher) if generation time is acceptable
2. Add more seed entry points discovered from the execution trace
3. Profile which blocks are "hot" (frequently visited) to prioritize coverage
4. Target coverage beyond 10%

### Phase 10: Execution Trace Verification

Compare the lifted execution trace against CEmu's real execution:

1. Run CEmu with the same ROM, log the first N blocks
2. Compare block-by-block against our executor's trace
3. Identify divergences where our emitted JS produces different register/flag states
4. Use divergences to find emitter bugs

---

## Useful Repo Files

- `scripts/transpile-ti84-rom.mjs` — ROM transpiler (source of truth for generation)
- `TI-84_Plus_CE/ROM.rom` — TI-84 Plus CE ROM image (4MB)
- `TI-84_Plus_CE/ROM.transpiled.js` — Generated module (32768 blocks)
- `TI-84_Plus_CE/ROM.transpiled.report.json` — Coverage metrics
- `TI-84_Plus_CE/cpu-runtime.js` — CPU class + createExecutor
- `TI-84_Plus_CE/test-harness.mjs` — Execution validation harness
- `ti84-rom-disassembly-spec.md`
- `codex-rom-disassembly-prompt.md`
- `codex-rom-state-machine-prompt.md`
- `ti84-native-port-spec.md`
- `CONTINUATION_PROMPT.md`

---

## Notes About GitNexus In This Session

The repo-level GitNexus instructions were followed as far as the local CLI allowed:

- `npx gitnexus impact transpile-ti84-rom.mjs --repo follow-alongs --direction upstream` reported:
  - risk: `LOW`
  - direct dependents: `0`
  - affected processes: `0`
  - affected modules: `0`

Important caveat:

- GitNexus indexed `scripts/transpile-ti84-rom.mjs` only at file granularity, not at per-function symbol granularity, so the impact check was done at the file level
- `gitnexus_detect_changes()` was not part of this turn because no commit was made

---

## Notes About Research Done So Far

The eZ80 manual was consulted previously to validate several instruction encodings, especially:

- `.LIL` prefix behavior
- `RSMIX`
- `STMIX`
- `SLP`
- `IN0`
- `OUT0`
- `TST`

This session also used the manual to validate:

- `EX (SP),IX`
- `EX (SP),IY`
- `IN A,(n)`
- `CP A,(IX+d)`
- `LD rr,(HL)`
- `LD (HL),rr`

The next research need is narrower:

- confirm the best normalization strategy for remaining `.sil` forms and duplicated-prefix mixed-mode sequences
- validate the remaining ED/repeat and register-ALU instructions that are now showing up at the deeper frontier
