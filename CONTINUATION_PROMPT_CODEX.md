# Continuation Prompt — TI-84 Plus CE ROM Transpilation

**Last updated**: 2026-04-09T13:55Z
**Focus**: Continue the TI-84 Plus CE ROM to JavaScript transpilation effort
**Current phase**: Phases 1-4 complete. Coverage at 4.05% (16384 blocks). CPU runtime scaffold created. Only 3 irreducible stubs remain.

---

## What Was Completed In This Session

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

### `TI-84_Plus_CE/ROM.transpiled.report.json`

Current metrics (after Phase 3):

- ROM size: `4194304`
- Block count: `16384`
- Covered bytes: `170053`
- Coverage percent: `4.0544`
- Seed count: `18`
- Live stubs: `3` (irreducible — z80js parser artifacts)

Historical baselines:

- After Phase 2: blocks=`2048`, bytes=`22033`, stubs=`0`
- After Phase 1: blocks=`2048`, bytes=`22033`, stubs=`19`
- Before Phase 1: blocks=`2048`, bytes=`22033`, stubs=`46`
- After 1024-block session: blocks=`1024`, bytes=`10268`
- Initial: blocks=`384`, bytes=`3613`

---

## Verified State

The following were verified after the latest changes:

1. `node --check scripts/transpile-ti84-rom.mjs` passes
2. `node scripts/transpile-ti84-rom.mjs` completes successfully
3. `TI-84_Plus_CE/ROM.transpiled.js` imports successfully
4. `decodeEmbeddedRom().length === 4194304`
5. Coverage increased to `2048` blocks and `0.5253%`
6. The malformed live stub list from the previous continuation prompt was eliminated
7. The current live `cpu.unimplemented(...)` count is `46`

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

---

## What The Current Lift Handles Well

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

The biggest remaining gaps are now broader emitter and prefix-normalization issues rather than the old malformed sites.

1. More generic 8-bit ALU/register emitter coverage:
   - `add a, r`
   - `xor r`
   - `or n`
   - `sbc a, r`
   - `set b, r`
2. More ED-family I/O, repeat, and word-ALU support:
   - `in r, (c)`
   - `adc hl, rr`
   - `lddr`
   - `neg`
3. Better mixed-mode and prefix normalization:
   - `.sil` forms such as `dec.sil de` and `add.sil hl, bc`
   - duplicated-prefixed call sites like `fd cd ...`
   - malformed branch text such as `jr pc+30`
4. More indexed indirect arithmetic/update forms:
   - `inc (ix-1)` currently rendered as `inc ix-1`
5. Better target discovery beyond the current `2048`-block cap
6. A runtime CPU scaffold for actually executing lifted blocks

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

Completed. Stubs reduced from 46 to 19.

### Phase 2: Clean mixed-mode and remaining ED edge cases — DONE ✓

### Phase 3: Push beyond the current reachability frontier — DONE ✓

Completed. All stubs eliminated.

### Phase 3: Push beyond the current reachability frontier

Coverage is now limited by both seed quality and the explicit `2048` block cap.

Good next moves:

1. Raise the block cap again after confirming generation remains manageable
2. Seed additional known ROM anchors from reverse-engineering notes already in the repo
3. Discover and enqueue more jump/call targets from already-lifted startup/service regions
4. Identify whether some unsupported blocks are prematurely truncating reachable graph growth

Goal:

- move coverage meaningfully beyond `0.5253%`

### Phase 4: Add an executable runtime scaffold

Once the lift is cleaner, add a small CPU runtime module so lifted blocks can execute:

- registers
- flags
- memory read/write helpers
- stack helpers
- condition evaluation
- rotate/shift / ALU helpers used by emitted blocks
- I/O hooks

This should support the emitted JS, not replace it.

---

## Suggested Immediate Task For Next Session

Phases 1-4 are complete. The next step is validation and integration:

> Wire the CPU runtime to the transpiled ROM and verify that the reset vector executes correctly through the first several blocks.

Concrete first moves (Phase 5):

1. Create a test harness that loads ROM.transpiled.js and cpu-runtime.js
2. Initialize CPU memory from the ROM image
3. Run from address 0x000000 in z80 mode (reset vector)
4. Log each block entry and the instruction trace
5. Verify that the initial I/O port configuration sequence executes correctly
6. Add I/O callback hooks that log port reads/writes
7. Check that the SP initialization and stack frame setup look correct
8. Identify any missing emitter patterns that only appear at execution time (vs. static analysis)

---

## Useful Repo Files

- `scripts/transpile-ti84-rom.mjs`
- `TI-84_Plus_CE/ROM.rom`
- `TI-84_Plus_CE/ROM.transpiled.js`
- `TI-84_Plus_CE/ROM.transpiled.report.json`
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
