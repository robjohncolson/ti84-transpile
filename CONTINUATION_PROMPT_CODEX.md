# Continuation Prompt — TI-84 Plus CE ROM Transpilation

> ⚠ **Auto-continuation loop active** (as of 2026-04-14; cadence stretched to **12h** on 2026-04-15 evening — was 2h, now fires at midnight + noon local to reduce churn and let each session do deeper work). Windows Task Scheduler task `TI84-AutoContinuation` fires a headless Opus session **every 12 hours** that reads this file, dispatches Codex/Sonnet work, commits+pushes to master, and updates this file. **Before editing this file in a human session**, check `git log --oneline` for recent `auto-session N` commits and consider `schtasks /change /tn "TI84-AutoContinuation" /disable` to prevent merge conflicts during long interactive edits. Re-enable with `/enable`. Launcher: `scripts/auto-continuation.bat` + `.auto-continuation-prompt.md`. Logs: `logs/auto-session-*.log` (gitignored).

**Last updated**: 2026-04-15 (auto-session 54) — **Phase 188b DONE**: `paintGlyphs()` overlay removed from golden regression probe; native ROM rendering confirmed 26/26 exact at row 39 col 2 (was row 37 with overlay). **Phase 190 DONE**: browser-shell IX convention fixed (`cpu2._ix = 0xD1A860`, was `cpu2.sp`). **Phase 189 INVESTIGATED**: status dots at 0x0A3301 execute 107 fully-lifted blocks and RET to sentinel — no missing ROM blocks. The `missing_block` termination was just the sentinel return. Status dots non-rendering is a RAM state issue, not a coverage gap.

**User's active focus (set 2026-04-15)**:
1. **~~Get the calc emulator hooked up end-to-end~~** — DONE. Native text rendering verified in probe (26/26 exact, 968 fg pixels). `paintGlyphs()` overlay removed. Browser-shell IX convention fixed. Next: deploy updated .gz and verify browser rendering.
2. **Start and finish all ROM traces** — push coverage past the 16.5% plateau. Phase 158+ CEmu PC-trace seed generator is the queued approach.

---

## Current ROM Transpiler State

- Coverage: **16.6384%** (123732 blocks, 697867 bytes) — auto-session 53 retranspile after Phase 158 + Phase 186 seed additions
- Seed count: **21374**
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

**Golden regression** (run `node TI-84_Plus_CE/probe-phase99d-home-verify.mjs`): 26/26 exact at row 39 col 2, "Normal Float Radian" 3/3 PASS, status dots FAIL (RAM state issue — all 107 blocks are lifted, RET to sentinel). Stage 3 runs 17,848 steps to natural completion. ROM renderer produces 968 native fg pixels. `paintGlyphs()` overlay REMOVED in session 54 — native rendering confirmed sufficient.

**Per-stage IX convention**: all 4 home-screen stages (0x0a2b72 bg, 0x0a29ec mode row, 0x0a2854 history, entry line) need `IX = 0xD1A860` before entry. Stage 3 exit IX = `0xe00800`, others = `0x0159bd`. Using `IX = SP` crashes stages 1/4 at 0x58c35b (Phase 183 correction of Phase 182).

**Display buffer**: 0xD006C0 has **no natural OS populator** in the reachable code paths (Phase 178 confirmed 0 printable writes during boot+render). Browser-shell seeds it via the **restore path 0x088720** (Phase 179/180): seed 260 bytes into backup buffer 0xD02EC7, then call 0x088720 which copies backup→display in 36 steps.

---

## Immediate Priorities

### ★★★ SOLVED: Phase 188 — Foreground color register hunt

**Status**: SOLVED in auto-session 53 (2026-04-15). ROM renderer produces 968 native fg pixels showing readable "Normal Float Radian" text in VRAM.

**Root cause** (two bugs, both fixed):
1. **Missing block 0x0A190F** — The critical block that loads the glyph byte into C, loads the VRAM pointer from 0xD0059C, and checks the color flag (bit 4 of 0xD000CA) was never seeded. Without it, the code fell through to 0x0A191F (monochrome path) with C=0, producing all-white pixels. **Fix**: Added seeds `0x0A190F` and `0x0A1919` to `scripts/transpile-ti84-rom.mjs`.
2. **Stack sentinel bug in probe-phase99d-home-verify.mjs line 132** — `mem.fill(0xFF, cpu.sp, 12)` fills nothing because `end=12 < start=0xD1A872`. Should be `mem.fill(0xFF, cpu.sp, cpu.sp + 12)`. Without the sentinel, RET popped garbage (font data address 0x004A7E), crashing stage 3 at 6,144 steps. **Fix**: Changed to `cpu.sp + 12`. Stage 3 now runs 17,848 steps to natural completion.

**Color register addresses confirmed**:
- `0xD02688` = fg color (black = 0x0000, set by `SetTextFgColor` at 0x0802B2 via `SIS: LD (0x2688), HL`)
- `0xD0268A` = bg color (white = 0xFFFF, set by `SetTextFgColor` via `SIS: LD (0x268A), DE`)
- Color flag: bit 4 of `0xD000CA` (IY+0x4A) — when set, uses colored path via subroutine 0x0A1A3B

**Rendering path (now working)**:
- 0x0A1919: checks bit 4 of 0xD000CA → colored path (0x0A1965) if set
- 0x0A1965: calls subroutine 0x0A1A3B per glyph row
- 0x0A1A3B: loads fg from (0xD02688), bg from (0xD0268A), shifts glyph bits via SLA A / JR C to select fg or bg per pixel
- Writes to VRAM via LD (HL), E / LD (HL), D (16-bit pixel as two 8-bit writes)

### ★★★ DONE: Phase 188b — Remove paintGlyphs() overlay and re-baseline golden regression

**Status**: DONE in auto-session 54 (2026-04-15). `paintGlyphs()` function and call removed from probe-phase99d-home-verify.mjs. Native rendering confirmed: 26/26 exact at row 39 col 2 (shifted from row 37 due to native pixel placement), 3/3 PASS, 968 fg pixels (was 1197 with overlay — overlay was adding 229 extra pixels).

### ★★★ Phase 158+ / ROM trace coverage expansion (finish all ROM traces)

**Why this is #2**: Coverage has plateaued at ~16.6% via static analysis. The queued strategic backstop is the **CEmu PC-trace seed generator**. Phase 158+ interim JT seeds (session 53) added 6 new seeds but 0 new blocks — those addresses were already reachable.

**Spec**: `.phase158-spec.md` (queued). Multi-hour capture + dedup + retranspile job.

**Remaining interim work**:
- Seed 0x006138 (hardware poll at end of cold boot) to unblock post-boot continuation
- Any new callers found by Phase 188 investigation should be seeded

### ★★ INVESTIGATED: Phase 189 — Status dots branch tracing

**Status**: INVESTIGATED in auto-session 54 (2026-04-15). Probe `probe-phase189-status-dots.mjs` traces the full 107-block execution from 0x0A3301. Finding: **all 107 blocks are fully lifted** — execution terminates with `ret po` at 0x0A33DA returning to the 0xFFFFFF stack sentinel. The `missing_block` termination reported by the golden regression is just the executor trying to execute at the sentinel address. The status dots ARE rendering their VRAM writes (calls to 0x0A33FB/0x0A3411 loop), but the fg pixel count remains 0. Root cause is likely RAM state: the icon type selector at 0xD000C6 (bit2=battery vs mode dots) and the system flags at 0xD0009B (bit6 guard) may not be configured correctly for dot-style rendering. **Next step**: seed the correct RAM values for status dot rendering (battery icon at 0xD000C6, clear bit6 of 0xD0009B) and re-test.

### ★ DONE: Phase 190 — Browser-shell IX convention fix

**Status**: DONE in auto-session 54 (2026-04-15). Fixed `showHomeScreen()`'s `restoreCpu()` in browser-shell.html: changed `cpu2._ix = cpu2.sp` (= 0xD1A872) to `cpu2._ix = 0xD1A860`. The Phase 183 handoff documented that IX=SP crashes stages 1/4 at 0x58C35B. The probe already had the correct value. Browser-shell generic `showScreen()` paths were left unchanged (they inherit IX from OS init snapshot).

**Remaining**: Deploy updated `.gz` and verify browser rendering with the new IX value + native text rendering. The `.gz` needs regeneration from the current `ROM.transpiled.js`.

### Next-session priorities

1. **Phase 191 — Regenerate ROM.transpiled.js.gz and verify browser-shell rendering**: Retranspile, compress, commit .gz, then check browser-shell shows native text. The IX fix (Phase 190) + native rendering (Phase 188) should produce visible "Normal Float Radian" in the browser canvas.
2. **Phase 189b — Status dots RAM seeding**: The 107-block status dots path writes to VRAM but produces 0 fg pixels. Investigate by seeding icon type at 0xD000C6 (try bit2=0 for battery icon, bit2=1 for mode dots) and clearing bit6 of 0xD0009B (status-bar update guard). Test if either configuration produces visible status indicator pixels.
3. **Phase 158+ — Seed 0x006138** (hardware poll at end of cold boot) to unblock post-boot continuation. Also: begin CEmu PC-trace seed generator work per `.phase158-spec.md`.
4. **Phase 192 — Stage 1 status bar investigation**: Stage 1 (0x0A2B72) terminates at missing_block after only 25 steps. Run the same single-step trace as Phase 189 to determine if this is also a sentinel return or a genuine missing block.

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
2. `node scripts/transpile-ti84-rom.mjs` generates 124543 blocks at 16.5076% coverage in ~2 seconds.
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
