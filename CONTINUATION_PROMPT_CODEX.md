# Continuation Prompt — TI-84 Plus CE ROM Transpilation

> ⚠ **Auto-continuation loop active** (as of 2026-04-14; cadence stretched to **12h** on 2026-04-15 evening — was 2h, now fires at midnight + noon local to reduce churn and let each session do deeper work). Windows Task Scheduler task `TI84-AutoContinuation` fires a headless Opus session **every 12 hours** that reads this file, dispatches Codex/Sonnet work, commits+pushes to master, and updates this file. **Before editing this file in a human session**, check `git log --oneline` for recent `auto-session N` commits and consider `schtasks /change /tn "TI84-AutoContinuation" /disable` to prevent merge conflicts during long interactive edits. Re-enable with `/enable`. Launcher: `scripts/auto-continuation.bat` + `.auto-continuation-prompt.md`. Logs: `logs/auto-session-*.log` (gitignored).

**Last updated**: 2026-04-18 (interactive session, Phase 200 + true-coverage reframing).

**★ COVERAGE DENOMINATOR REFRAMING (THE BIG FINDING)**: The "16.65% plateau" is a reported-coverage artifact, not a reachability problem. ROM is 4 MB but **82.6% of it (3,464,815 bytes) is erased flash (0xFF fill)** — fundamentally uncoverable (no code, no data, just unused sectors). The genuine executable+data ROM is **729,489 non-erased bytes**. Current transpiler covers **699,583 of those → 95.90% true coverage**. Only **~29,906 non-erased bytes remain uncovered**, and classifier-audit of those gaps (`TI-84_Plus_CE/audit-true-uncovered.mjs`) shows:

| Verdict | Bytes | % of uncovered |
|---------|-------|---|
| CODE? (decodable) | ~14K | 31% |
| DATA-MIXED | ~24K | 51% |
| DATA-SPARSE | ~6K | 12% |
| STRINGS | ~3K | 6% |

So only ~14 KB of remaining uncovered bytes is plausibly executable code — scattered across ~3,400 tiny ranges (top three: 221, 147, 142 bytes). **Strategic implication**: coverage work is ~done. Future sessions should stop chasing reported-% gains (denominator is poisoned by erased flash) and pivot to feature work. Use `audit-true-uncovered.mjs` to measure true coverage, not `coveragePercent` in the report.

**Phase 200 DONE**: Added 10 coverage-analyzer-suggested seeds (top CODE? ranges in OS region). Result: 143,436 → 143,526 blocks (+90), 698,408 → **699,583 bytes** (+1,175), 16.6513% → **16.6794%** (+0.0281 pp reported / **+0.16 pp true coverage** → 95.90%). .gz 16.42 MB → 17.08 MB. Golden regression PASS (26/26 exact, "Normal Float Radian" 3/3). Best per-seed ratio since Phase 198 — targeted CODE?-classified gaps work; blind seed-sweeps don't.

**Prior (Phase 198/199)**: CEmu PC-trace seed pipeline (boot trace 22,238 PCs + 5 autotester scenarios) merged to 28,580 unique PCs, yielded +0.0113 pp + +0.0016 pp. Scenario matrix confirmed seeds-from-traces hits diminishing returns — new entry points walk into already-covered byte ranges. See `TI-84_Plus_CE/phase199-scenario-matrix-report.md`.

**User's active focus (set 2026-04-15, updated 2026-04-16)**:
1. **~~Get the calc emulator hooked up end-to-end~~** — DONE. Native text rendering verified in probe (26/26 exact, 968 fg pixels). `paintGlyphs()` overlay removed. Browser-shell IX convention fixed. .gz regenerated (session 55). Next: deploy to GitHub Pages and verify browser rendering.
2. **Start and finish all ROM traces** — push coverage past the 16.6% plateau. Static seeding exhausted (0 new blocks from 0x006138). CEmu PC-trace seed generator is the queued approach.
3. **~~Status dots rendering~~** — DONE (session 56). Golden regression fully passes: status dots PASS (36 fg pixels), fg=1004. Root cause was `mem.fill` argument bug in `coldBoot`.

---

## Current ROM Transpiler State

- Coverage: **16.6794%** reported (143,526 blocks, 699,583 bytes) = **95.90% true coverage** of non-erased ROM (729,489 bytes). 82.6% of ROM is erased flash (0xFF fill) — uncoverable. See `audit-true-uncovered.mjs`.
- Seed count: **49,965** (49,955 pre-Phase-200 + 10 Phase 200)
- Live stubs: **0**
- OS jump table: **980/980** (100%)
- ISR dispatch gate: **UNLOCKED** (0x000710 reachable)
- Keyboard scan: **WORKING** (0x0159C0, 9/9 PASS)
- ISR event-loop dispatch: **WORKING** end-to-end (16 blocks, 0x38 → 0x19BE → 0x1A5D keyboard handler → RETI)
- VRAM pipeline: **PROVEN** end-to-end (0x005B96 fills 153600 bytes in one step)
- Full OS init: **WORKING** end-to-end (handler 0x08C331, 691 steps, 1M RAM writes; extended boot 943/33289 steps depending on path)
- Real boot path: **WORKING** end-to-end (8804 steps to halt, naturally reaches 0x0013c9 and sets MBASE=0xD0 via `ld mb, a` — no manual override)
- Real OS UI rendered: 20+ catalogued screens (error banners, MODE, Y=, STAT, TEST, self-test, OS-compat). See browser-shell button panel.
- ROM write-protect: enforced in cpu-runtime.js write8/16/24 (flash 0x000000-0x3FFFFF is read-only)
- MBASE register + per-iter madl sync + stmix/rsmix block termination: all working (Phase 27-30)
- OTIMR eZ80 instruction: loops B→0 with C++ each iteration (Phase 30)
- `ROM.transpiled.js`: gitignored (175MB). **`.gz` committed** (~15MB). Regenerate with `node scripts/transpile-ti84-rom.mjs` (~2s after Phase 27 walker fix).

**Golden regression** (run `node TI-84_Plus_CE/probe-phase99d-home-verify.mjs`): 26/26 exact at row 39 col 2, "Normal Float Radian" 3/3 PASS, **status dots PASS** (36 fg pixels, before=0 after=36 final=36). Stage 1 runs 28 steps, Stage 2 runs 107 steps, Stage 3 runs 17,848 steps to natural completion. ROM renderer produces **1004 native fg pixels** (968 text + 36 status dots). `paintGlyphs()` overlay REMOVED in session 54 — native rendering confirmed sufficient. Session 56 fix: `mem.fill` argument bug in `coldBoot` (end vs length).

**Per-stage IX convention**: all 4 home-screen stages (0x0a2b72 bg, 0x0a29ec mode row, 0x0a2854 history, entry line) need `IX = 0xD1A860` before entry. Stage 3 exit IX = `0xe00800`, others = `0x0159bd`. Using `IX = SP` crashes stages 1/4 at 0x58c35b (Phase 183 correction of Phase 182).

**Display buffer**: 0xD006C0 has **no natural OS populator** in the reachable code paths (Phase 178 confirmed 0 printable writes during boot+render). Browser-shell seeds it via the **restore path 0x088720** (Phase 179/180): seed 260 bytes into backup buffer 0xD02EC7, then call 0x088720 which copies backup→display in 36 steps.

---

## Immediate Priorities

### ★★★ DONE: Phase 198/199 — CEmu PC-trace seed generator + scenario matrix

**Status**: Both DONE in 2026-04-18 interactive session (post-dead-session recovery).

**Phase 198** (boot-only): Patched CEmu (commit `73a4cb0c...`) with PC-trace hook. 22,238 unique ROM PCs from boot; +15,892 blocks; coverage 16.6384% → 16.6497% (+0.0113 pp). Pipeline: `cemu-build/run-trace.ps1` → `cemu-build/smoke-trace.log` → `TI-84_Plus_CE/cemu-trace-to-seeds.mjs` → `cemu-trace-seeds.txt` → transpiler seed input.

**Phase 199** (scenario matrix): Added 5 autotester scenarios — MODE, Y=, GRAPH, CLEAR, 2+3 ENTER. Post-processor updated to glob all `*-trace.log` files. Result: 28,580 unique ROM PCs (+6,342 vs Phase 198), 143,436 blocks (+3,812), coverage 16.6513% (+0.0016 pp). Golden regression PASS (26/26, 3/3, fg=1004).

**Honest read**: Coverage % gain is marginal. Seeds-from-traces is hitting diminishing returns — new entry points mostly walk into already-covered byte ranges through alternative paths. Structural win is denser block graph. The "several pp" hypothesis did NOT pan out. See `TI-84_Plus_CE/phase199-scenario-matrix-report.md`.

**Autotester key gotcha**: `valid_keys` in `autotester.cpp` is lowercase (`mode`, `y=`, `graph`, `clear`, `enter`, `+`, digits). PascalCase labels error silently with no key press.

**Infra files** (reusable):
- `cemu-build/scenario-*.json` — 5 scenario configs (MODE/Y=/GRAPH/CLEAR/arith) + `smoke.json` (boot)
- `cemu-build/run-trace-DE.ps1`, `run-trace-FGH.ps1` — batch runners, set `TRACE_PC` per run
- `TI-84_Plus_CE/cemu-trace-to-seeds.mjs` — globs `*-trace.log`, dedups, writes `cemu-trace-seeds.txt`
- `scripts/transpile-ti84-rom.mjs` — seeds `cemu-trace-seeds.txt` via `cemuTraceSeedsPath`

### ★★ DONE: Phase 189b/189c — Status dots rendering fully resolved

**Status**: DONE in auto-session 56 (2026-04-18). The golden regression now fully passes with status dots PASS (36 fg pixels).

**Root cause**: `mem.fill(0xFF, cpu.sp, 3)` bug in `coldBoot` at lines 95 and 105 of `probe-phase99d-home-verify.mjs`. `TypedArray.fill(value, start, end)` interprets 3 as `end`, not `length`. Since `cpu.sp` (~0xD1A87B) > 3, the fill was a no-op. This left the stack uninitialized for POST_INIT, which produced HL=0x15AD9 instead of 0. Stage 2 read H=0x5A via `ld a, h` and painted white-on-white instead of colored pixels.

**Fix**: `mem.fill(0xFF, cpu.sp, cpu.sp + 3)` on both lines. Also added defensive `mem[0xd0009b] &= ~0x40` before Stage 2.

**Pixel map** (probe `probe-phase189c-dots-pixel-map.mjs`): 36 fg pixels at rows 6-13, cols 293-301. Values: 0x0000 (black, outline) + 0xffe0 (yellow, fill). Forms a battery icon pattern.

### ★★ DONE: Phase 192/193 — Stage 1 VRAM write target

**Status**: DONE in auto-session 56 (2026-04-18). Probe `probe-phase193-stage1-de-target.mjs` confirmed via RAM diff.

**Verdict**: Stage 1 (0x0A2B72) writes **0 VRAM pixels** anywhere in 0xD40000-0xD50000. It only modifies 21 bytes of non-VRAM RAM:
- 0xD00595 (curRow) → 0xFF, 0xD00596 (curCol) → 0x19
- 0xD1A857-0xD1A870 (stack/IX area): 13 bytes of call/return frame data
The `ld (de), a` at 0x0A20CC writes to non-VRAM RAM metadata, not visible VRAM. Stage 1 is a configuration/state stage, not a renderer.

### ★ DONE: Phase 191 — .gz regeneration

**Status**: DONE in auto-session 55 (2026-04-16). Retranspiled with new 0x006138 seed. Block count unchanged (123732, 16.6384%). .gz regenerated (15,191,642 bytes, was 15,191,699). Golden regression verified: 26/26 exact, 3/3 PASS, 968 fg pixels.

### ★ DONE: Phase 194 — mem.fill bug fix across all probes

**Status**: DONE in auto-session 57 (2026-04-18). Codex fixed `mem.fill(0xFF, cpu.sp, 3)` → `mem.fill(0xFF, cpu.sp, cpu.sp + 3)` across 47 probe files (both `0xFF` and `0xff` capitalizations). Total: 132 fixed instances across 64 files. Zero buggy instances remain. Golden regression unaffected (still 26/26, 3/3, fg=1004).

### ★ DONE: Phase 195 — Stage 1 curRow=0xFF investigation

**Status**: DONE in auto-session 57 (2026-04-18). Probe `probe-phase195-stage1-currow.mjs` (690 lines, Sonnet) provides definitive answer.

**Root cause**: curRow=0xFF is **NOT a sentinel** — it's an arithmetic underflow. Block 0x0A20CC loads DE=0xD00595 (curRow address), reads curRow (=0x00), executes `dec a` → 0xFF, compares against row limit at 0xD02504, and stores the underflowed result via `ld (de), a` at 0x0A20F0.

**ROM-wide curRow analysis**: 507 raw ROM references to 0xD00595; 500 are in transpiled blocks. 184 are readers. 43 readers use `inc a` after loading curRow (wrapping 0xFF→0x00). None use explicit `cp 0xFF`. This confirms wrap-style handling is the standard pattern.

**Verdict**: Stage 1 is a cursor/configuration step. The 0xFF is consistent with an off-screen cursor position after decrement-past-zero, not with a missing VRAM fill. No missing ROM blocks are indicated.

### Next-session priorities — Phase 201+ (post-reframing)

Phase 200's classifier audit settled the strategy fork. The "decoder/CF completeness" theory (that big contiguous unreached *code* regions existed) is **disproven**: 82.6% of ROM is erased flash, and the genuine uncovered is only ~30 KB, of which ~14 KB is plausibly code scattered across ~3,400 tiny ranges. **Pivot to feature work.**

Recommended Phase 201+ priorities (in order):

1. **★★★ Browser-shell feature expansion**: GitHub Pages deploy + visually verify native text + battery icon in browser (never shipped despite being ready since session 54). Add more reachable apps via the existing button panel. Catalog error-banner permutations (48 exist via 0xD008DF / 0xD00824). Priority target: get a demonstrable "this looks like a real TI-84" in browser before chasing more coverage.

2. **★★ Graph renderer integration**: The graph renderer is the highest-value uncovered feature (math visualization). Trace `Y= → X,T,θ,n → graph` path in CEmu, identify handler entry points, probe each in isolation. Different class of work from keyboard/text.

3. **★★ FPU op test surface**: `ti84-math.mjs` covers FPAdd, FPMult, FPDiv, Sin. Add Cos, Tan, Log, Ln, Exp, Pow, Sqrt. These are mostly reachable and the harness pattern is established.

4. **★ Coverage cleanup (low ROI, skip unless bored)**: If future work *does* want to push true coverage past 96%, target the remaining ~14 KB of CODE? gaps listed by `audit-true-uncovered.mjs` — largest are at 0x083b98, 0x035d3b, 0x05ac04, 0x09d22c. Each is a <250-byte hole in an already-95%+ region, so most are rare error handlers or dead-code branches. Expect <0.5 pp true-coverage gain for the full batch.

**Do NOT** keep chasing reported-coverage % in `ROM.transpiled.report.json`. The 4 MB denominator is dominated by erased flash. Report `audit-true-uncovered.mjs` numbers instead.

**Deferred from prior sessions** (lower priority now):
- **Phase 191b — Browser-shell browser verification**: Deploy to GitHub Pages and manually verify browser-shell shows native "Normal Float Radian" text + battery icon.
- **Phase 196 — Stage 1 row-limit initialization** investigation: rowLimit at 0xD02504 / colLimit at 0xD02505 are both 0x00 during Stage 1. Check whether boot should set these.
- **Phase 197 — `mem.fill` audit**: Grep for all `mem.fill` calls with non-3 lengths to ensure `start + length` not bare `length`.

---

## Key Reference Addresses

### ROM addresses
- `0x003d6e` — early Phase 27 font table (superseded by 0x0040ee)
- `0x0040ee` — **font table base** (Phase 98A verified). 28 bytes/glyph, **1bpp 10-wide × 14 rows** (Phase 99A rewrite; earlier 2bpp/16-wide attempts were wrong). `idx = char_code - 0x20`.
- `0x0059C6` — single character print entry (Phase 27)
- `0x005A75` — char path prologue + special char check
- `0x005B16` — glyph unpack loop (1bpp → VRAM bytes)
- `0x005B96` — VRAM fill primitive, one of the three Phase 186 writers
- `0x0802b2` — `SetTextFgColor` helper (Phase 40). Stores HL→0xD02688 (fg), DE=0xFFFF→0xD0268A (bg), sets bit 4 of 0xD000CA (IY+0x4A)
- `0x0A190F` — **glyph byte loader + color flag check** (Phase 188 fix, was MISSING until session 53). Loads HL from 0xD0059C, A from 0xD02A73, checks bit 4 of 0xD000CA → routes to colored (0x0A1965) or monochrome (0x0A191F) path
- `0x0A1A3B` — **per-row color pixel subroutine** (Phase 188). Reads fg from 0xD02688, bg from 0xD0268A. SLA A + JR C selects fg/bg per bit. Called 832 times per stage 3 run
- `0x081670` — STAT/MATRIX editor grid renderer (Phase 31, JT slot 748)
- `0x0802` / `0x013d00` / `0x013d11` — "Validating OS..." boot splash (Phase 65A)
- `0x0296dd` — MODE screen renderer (Phase 34)
- `0x078419` — Y=/STAT PLOT editor (Phase 36)
- `0x062160` — GENERIC error banner renderer (Phase 57), 48 error permutations via byte at 0xD008DF / 0xD00824
- `0x062290` — error string pointer table, 42 entries, 1-indexed
- `0x088720` — **restore path**, copies 260 bytes from backup buffer 0xD02EC7 to display buffer 0xD006C0
- `0x08C331` — full OS init entry (691 steps cold, 943 extended, 33289 when allowed to run to 0x006202 poll loop)
- `0x0019BE` — OS event loop entry (ISR wakes here via 0x038 → 0x719 when 0xD177BA is set)
- `0x0159C0` — direct keyboard scan (returns scan code in B)
- `0x0A1939`, `0x0A19D7` — **Phase 186 VRAM pixel writers** (the Phase 188 targets)
- `0x0A17B2` — `CP 0xFA` token/null clamp (Phase 170)
- `0x0A1799` — single-char printer (line-writer, Phase 125 recharacterized)
- `0x0a29ec` — home row strip renderer (JT slot 470, stage 3 in home composite)
- `0x0a2b72` — status bar fill (JT slot 479, stage 1)
- `0x0a2854` — history area renderer (JT slot 468, stage 4)
- `0x0a2106` — entry line bg (CURSOR-DEPENDENT; reset curRow=0 before calling)
- `0x0a349a` — status bar UPDATER (9-icon loop; guard: bit6 of 0xD0009b must be clear)
- `0x0a344a` — icon data table (8 bytes/entry × 9 entries)
- `0x0a3320` — status indicator dots renderer
- `0x056900` — dispatch table populator (doubly-linked list, head=0xD0231A, tail=0xD0231D; 165 WRITE sites; NOT reached statically — dynamic dispatch only, Phase 160)
- `0x002197` — frame helper (EX(SP),IX + LD IX,0 + ADD IX,SP + ADD HL,SP + LD SP,HL + JP(HL); 125 callers, Phase 164)
- `0x09F79B` — **scan code translation table** (228 bytes, 4 modifier sections × 56 entries; lookup at 0x03010D; secondary buffer at 0xD007E0, Phase 141/151)

### RAM addresses
- `0xD00585` — font record region (Phase 186 proved it IS read at PC 0x001881 but seeding has no effect — not the bottleneck)
- `0xD02688` — **fg color register** (Phase 188 confirmed). SetTextFgColor stores HL here. Default after init: 0x0000 (black)
- `0xD0268A` — **bg color register** (Phase 188 confirmed). SetTextFgColor stores 0xFFFF (white) here
- `0xD00595` / `0xD00596` — curRow / curCol cursor position
- `0xD005A1-0xD005C5` — per-character font record structure (IX walks this, Phase 155B). Glyph buffer proven correct.
- `0xD006C0` — **display buffer** (260 bytes home text source, 0 natural writers — seed via restore path 0x088720)
- `0xD007E0` — secondary scan-code buffer
- `0xD00824` — error banner fast-path selector (for 6 special errors)
- `0xD008DF` — error banner main selector (1-42)
- `0xD00092` — modifier state (2nd/Alpha, Phase 156)
- `0xD0058E` — keyboard OS scan-code output (browser-shell writes here)
- `0xD0009B` — system flags (bit6 = status-bar update guard)
- `0xD00CC` / `IY+0x4c` — 0xa2106 side-effect flag (bit 6 breaks 0x0a29ec fg pixels)
- `0xD000c6` — icon type selector (bit2=0→battery, bit2=1→mode dots)
- `0xD02EC7` — **backup buffer** (seed for restore path)
- `0xD020A6` — 26-byte mode text buffer (seed with ASCII "Normal Float Radian       ")
- `0xD02ACC` — mode-flag byte (Phase 185 proved: 0x00 after boot, NOT a color value; 248 ROM refs; loaded into DE at 0x0A3321/0x0A3370)
- `0xD02AD7` — OS OP register / callback pointer (pre-init to 0x0019BE for event loop)
- `0xD177BA` — post-init flag that enables the 0x719 → 0x19BE ISR path
- `0xD0231A` / `0xD0231D` — dispatch table head/tail (RAM, populated by 0x056900)
- `IX = 0xD1A860` — home-screen stages 1-4 entry value

### Port addresses
- `0x3D` / `0x3E` — interrupt status / ack
- `0x5000+` — FTINTC010 interrupt controller
- `0x500A` — keyboard IRQ ack (OUT 0x08)
- `0x5006` — keyboard IRQ enable mask (RES 3, A)
- `0x1000+` — memory controller
- `0x4000+` — LCD controller
- `0xE00000+` — LCD MMIO (upbase offset 0x10, control offset 0x18)
- `0xE00800-0xE00920` — keyboard MMIO
- `0xE00900` — scan result read
- `0xD40000` — VRAM base (BGR565)

---

## Operating Mode (Parallel Codex Dispatch)

Default cadence for the 2h auto-continuation loop:

1. **Pick up state** from this file (top section) + `git log --oneline | grep auto-session | head -5`.
2. **Dispatch 3-4 parallel Codex agents** per session via `cross-agent.py` (see command below). CC focuses on investigation, analysis, orchestration. Codex does file-writing, probe-running, disassembly.
3. **Sonnet fallback** when Codex stalls (sessions 34-52 show a recurring 0-byte-output pattern from Codex — spawn Sonnet via Agent tool as fallback).
4. **CC verifies independently** — every Codex/Sonnet deliverable must be re-run by CC (`node probe-*.mjs`) before committing.
5. **Commit + push** when all priorities are verified. Commit message format: `feat: auto-session N — Phases X/Y/Z (one-line summary of each)`.
6. **Update this file** before stopping. Keep only the Immediate Priorities section fresh — do not re-add historical phase narratives.
7. **At every pause**: run `/context`. If **< 70%** of 1M, proceed. If **≥ 70%**, stop and hand off.

**Cross-agent dispatch invocation**:
```bash
python "C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py" \
  --direction cc-to-codex --task-type implement \
  --prompt "<self-contained task with exact addresses, file paths, calling conventions>" \
  --working-dir "C:/Users/rober/Downloads/Projects/school/follow-alongs" \
  --timeout 600
```

**Task prompts must be self-contained**: Codex has NO conversation context. Include exact addresses, reference commits, file paths, calling conventions, and expected output format. Single-agent dispatch is the exception — default to 3-4 parallel agents covering independent priorities.

---

## Important Constraints

### This repo is already dirty
Many unrelated modified files sit in the worktree. Do NOT revert them.

### This is still a lift, not a handwritten rewrite
Stay with the 1:1-ish bytecode-lift direction:
- Widen decoder support
- Improve control-flow discovery
- Improve emitted instruction semantics
- Add runtime helpers only to support executing lifted blocks

Do NOT replace this with a high-level emulator rewrite unless the user explicitly changes direction.

### Timer IRQ must be disabled for OS init paths
Pass `timerInterrupt: false` to `createPeripheralBus` when running OS init probes. The default 200-tick IRQ fires mid-init and hijacks execution into the ISR trampoline (0x1713 → 0x67F8 → 0x1c33 infinite loop).

### ROM write-protect is essential
OS init issues stray writes to 0x000000-0x3FFFFF during its sequence. Real TI-84 CE flash is read-only at the hardware level. `cpu-runtime.js` `write8/16/24` silently drop writes where `addr < 0x400000`.

### Keyboard matrix (SDK-authoritative, Phase 24F labels were WRONG)
`keyMatrix[N] = SDK Group(7-N)`. Scan code = `(keyMatrix_index << 4) | bit`. 63/64 active; DOWN (G0:B0) = 0x00 collides with no-key.
Full mapping in `TI-84_Plus_CE/keyboard-matrix.md`.

---

## How To Regenerate

From repo root (no dependencies needed):

```bash
# Regenerate ROM.transpiled.js (~2 seconds)
node scripts/transpile-ti84-rom.mjs

# Full validation (25 tests; Test 25 is the gold-standard regression)
node TI-84_Plus_CE/test-harness.mjs

# Home-screen golden regression (26/26 exact, Normal/Float/Radian 3/3)
node TI-84_Plus_CE/probe-golden-regression.mjs

# Coverage analysis + gap suggestions
node TI-84_Plus_CE/coverage-analyzer.mjs
```

After committing code changes, re-run `npx gitnexus analyze` to keep the GitNexus index fresh (a PostToolUse hook usually handles this automatically after `git commit` / `git merge`). Add `--embeddings` if `.gitnexus/meta.json` shows `stats.embeddings > 0`.

---

## Verified State

1. `node --check scripts/transpile-ti84-rom.mjs` passes.
2. `node scripts/transpile-ti84-rom.mjs` generates 143,526 blocks at 16.6794% reported / 95.90% true coverage in ~2 seconds (Phase 200).
3. All blocks compile (0 failures). `ROM.transpiled.js` gitignored, `.gz` committed.
4. `node TI-84_Plus_CE/test-harness.mjs` — 25 tests pass. Test 25 (direct keyboard scan at 0x0159C0) is 9/9 PASS.
5. Golden regression: 26/26 exact, Normal/Float/Radian 3/3 PASS. Status dots FAIL (informational, unblocks via Phase 188).
6. `node TI-84_Plus_CE/ti84-math.mjs` — FPAdd, FPMult, FPDiv, Sin all correct.
7. **Zero** `cpu.unimplemented()` live stubs. z80js dependency eliminated. eZ80 decoder is table-driven.
8. Browser shell deployed on GitHub Pages; `browser-shell.html` has ~52 screen buttons + 4-stage home composite + restore-path integration.

---

## Useful Repo Files

### Transpiler + runtime
- `scripts/transpile-ti84-rom.mjs` — ROM transpiler, 21333 seeds, source of truth. ~2s after Phase 27 walker fix. `memAddrExpr()` / `usesMbase()` compose `cpu.mbase` for short-immediate memory accesses (Phase 29).
- `TI-84_Plus_CE/ROM.rom` — TI-84 Plus CE ROM image (4MB)
- `TI-84_Plus_CE/ROM.transpiled.js` — Generated module, 124543 blocks, 16.5076% coverage. Gitignored (175MB).
- `TI-84_Plus_CE/ROM.transpiled.js.gz` — Compressed module, committed for browser shell (~15MB).
- `TI-84_Plus_CE/ROM.transpiled.report.json` — Coverage metrics.
- `TI-84_Plus_CE/cpu-runtime.js` — CPU class + createExecutor. ROM write-protect, `cpu.mbase` register, per-iter madl sync, `in r,(c)` / `in0 r,(n)` flag updates via `ioReadAndUpdateFlags`, correct OTIMR loop.
- `TI-84_Plus_CE/ez80-decoder.js` — Complete eZ80 instruction decoder (~790 lines). `stmix` / `rsmix` marked `kind: 'mode-switch'`. `LD MB, A` / `LD A, MB` decoded. Phase 146 indexed pair load/store fix (DD/FD 07/17/27 loads + 01/11 stores, 691→943 steps). Phase 152 added DD/FD 0F/1F/2F/31/37/3E/3F. Phase 162 removed DD/FD 01/11 (alternative wins 57.1% vs 18.2%).
- `TI-84_Plus_CE/peripherals.js` — I/O bus + interrupt controller. PLL, GPIO, flash=0xD0, keyboard port 0x01, timers, FTINTC010 at 0x5000, memory ctrl at 0x1000, interrupt status 0x3D/0x3E. `setKeyboardIRQ(active)` sets bit 19 in rawStatus.

### Validation + harness
- `TI-84_Plus_CE/test-harness.mjs` — 25-test validation harness. Test 25 is gold-standard regression.
- `TI-84_Plus_CE/test-alu.mjs` — ALU unit tests (72 tests).
- `TI-84_Plus_CE/ti84-math.mjs` — Function call harness (FPAdd, FPMult, FPDiv, Sin).
- `TI-84_Plus_CE/coverage-analyzer.mjs` — Gap analysis + heatmap + seed suggestions.
- `TI-84_Plus_CE/probe-golden-regression.mjs` — Home-screen 4-stage composite check.

### Browser + automation
- `TI-84_Plus_CE/browser-shell.html` — Browser-based ROM executor (320×240 canvas, keyboard overlay, LCD intercept, block trace log). Deployed to GitHub Pages. Restore-path integration via `showHomeScreen()`.
- `TI-84_Plus_CE/ti84-keyboard.js` — PC → TI-84 key mapping module (SDK-authoritative reversed group ordering).
- `TI-84_Plus_CE/ti84-lcd.js` — BGR565 LCD renderer for the browser shell.
- `TI-84_Plus_CE/scancode-translate.js` — Scan-code translation table (from ROM 0x09F79B, Phase 144/151 stride-fixed).
- `TI-84_Plus_CE/frontier-runner.mjs` — Autonomous expansion runner: test → find missing blocks → inject seeds → retranspile → loop. Pass `timerInterrupt: false` when running OS init paths.
- `scripts/auto-continuation.bat` + `.auto-continuation-prompt.md` — Windows Task Scheduler launcher for the 2h loop.

### Historical + spec
- `TI-84_Plus_CE/phase*-report.md` — individual phase reports. Phases 185/186/187 are the most recent (186 placeholder never regenerated — rerun probe or write Phase 188 replacement).
- `TI-84_Plus_CE/PHASE25_SPEC.md` / `PHASE25G_SPEC.md` — browser-shell + event loop specs.
- `TI-84_Plus_CE/keyboard-matrix.md` — full 54-key matrix.
- `TI-84_Plus_CE/AUTO_FRONTIER_SPEC.md` — autonomous runner architecture.
- `logs/auto-session-*.log` — gitignored session logs.

### Where the trimmed history went
Anything not in this file lives in `git log --oneline`. Every auto-session commit is labeled `feat: auto-session N — Phases X/Y/Z (one-line summary)`. For deep detail on any phase, run `git show <commit>` or read the matching `TI-84_Plus_CE/phase<N>-report.md`. The previous ~4100 lines of narrative covered Phases 7–183 — all reachable from git.
