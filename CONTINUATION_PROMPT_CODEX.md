# Continuation Prompt — TI-84 Plus CE ROM Transpilation

> ⚠ **Auto-continuation loop active** — Windows Task Scheduler `TI84-AutoContinuation` fires a headless Opus session every 12h (midnight + noon local). Before editing this file in a human session, check `git log --oneline` for recent `auto-session N` commits and consider `schtasks /change /tn "TI84-AutoContinuation" /disable` to prevent conflicts. Re-enable with `/enable`. Launcher: `scripts/auto-continuation.bat`. Logs: `logs/auto-session-*.log` (gitignored).

**Last updated**: 2026-04-20 (auto-session 63: Phase 202g LCD MMIO mirror COMPLETE + Phase 196 rowLimit trace COMPLETE + Phase 197 mem.fill audit COMPLETE. cpu-runtime.js now intercepts 0xF80000-0xF8002F as LCD mirror alongside 0xE00000. Boot path produces 0 F80000 writes. rowLimit/colLimit are mutable counters, not static limits. 42 suspicious mem.fill calls identified for Phase 198 fix batch).

---

## ★ Strategic Reframing (READ FIRST)

**The 16.65% "plateau" is a denominator artifact**, not a reachability problem. ROM is 4 MB but **82.6% (3,464,815 bytes) is erased flash (0xFF fill)** — fundamentally uncoverable. The genuine executable+data ROM is **729,489 non-erased bytes**, and the transpiler already covers **95.92% of them**.

Of the remaining ~30 KB of uncovered non-erased bytes:

| Verdict | Bytes | % |
|---------|-------|---|
| CODE? (decodable) | ~13 KB | 29% |
| DATA-MIXED | ~24 KB | 52% |
| DATA-SPARSE | ~6 KB | 13% |
| STRINGS | ~3 KB | 6% |

Only ~13 KB is plausibly executable code, scattered across ~3,400 tiny ranges (top hole = 62 bytes). **Coverage work is effectively done.** Future sessions should pivot to feature work. Use `audit-true-uncovered.mjs` for true coverage, not `coveragePercent`.

---

## Current State

- **True coverage**: 95.9160% (699,697 / 729,489 non-erased bytes)
- **Reported coverage**: 16.6821% (143,547 blocks)
- **Seed count**: 49,972
- **Live stubs**: 0. **OS jump table**: 980/980. **ISR dispatch gate**: unlocked.
- **Keyboard scan, ISR dispatch, VRAM pipeline, OS init, real boot, home-screen render**: all working end-to-end.
- **Golden regression** (`node TI-84_Plus_CE/probe-phase99d-home-verify.mjs`): 26/26 exact at row 39 col 2, "Normal Float Radian" 3/3 PASS, status dots PASS (36 fg pixels), total 1004 fg pixels.
- `ROM.transpiled.js` gitignored (~214 MB). `.gz` committed (~16 MB, regenerate with `gzip -k -9 ROM.transpiled.js`).
- **Per-stage IX convention**: home-screen stages 1–4 all need `IX = 0xD1A860` before entry. Stage 3 exit IX = `0xe00800`, others = `0x0159bd`. Don't use `IX = SP` (crashes stages 1/4 at 0x58c35b).
- **Display buffer 0xD006C0 has no natural OS populator**. Browser-shell seeds it via restore path 0x088720 (seed 260 bytes into backup buffer 0xD02EC7, then call 0x088720).

---

## Next-Session Priorities

### 1. ★★★ Phase 198 — Fix 42 suspicious `mem.fill` calls (from Phase 197 audit)
Phase 197 identified 42 probe files with `mem.fill(0xFF, cpu.sp, N)` where `N` is a bare integer (byte count, not end address). All silently no-op because `start > end`. Fix pattern: `mem.fill(0xFF, cpu.sp, cpu.sp + N)`. Full list in `phase197-memfill-audit-report.md` § "SUSPICIOUS List". Golden regression (`probe-phase99d-home-verify.mjs`) is NOT affected but re-run after to confirm.

### 2. ★★ Phase 25G — OS event loop investigation + _GetCSC scan code mapping
The OS event loop entry at `0x0019BE` and keyboard scan at `0x0159C0` are seeded and working, but the event loop's dispatch logic (what happens after a key is scanned) is unexplored. Investigate: (a) what code path `0x0019BE` takes after `_GetCSC` returns a non-zero scan code, (b) map the scan code translation table at `0x09F79B` (228 bytes, 4 modifier × 56 keys) to actual key names, (c) trace what happens when ENTER (scan code 0x09) is pressed from the home screen.

### 3. ★ Coverage cleanup (low ROI, skip unless bored)
Phase 204 added 7 seeds for +0.0156 pp true coverage. Next 10 CODE? gaps (ranks 8–17 from `audit-true-uncovered.mjs`) would yield <0.01 pp each. **Stop chasing reported %**; report `audit-true-uncovered.mjs` numbers.

### Completed (session 63)
- ✅ **Phase 202g** — LCD MMIO 0xF80000 mirror added to `cpu-runtime.js`. Both `0xE00000-0xE0002F` and `0xF80000-0xF8002F` now share the same LCD register state. Boot path produces 0 writes to F80000 range; upbase stays at seeded 0xD40000. See `phase202g-lcd-mirror-report.md`.
- ✅ **Phase 196** — rowLimit/colLimit write trace. `0xD02504`/`0xD02505` are mutable counters (not static limits). All boot-path writes store `0x00`. The hypothesis that these hold `row=8/col=26` defaults is incorrect. See `phase196-rowlimit-report.md`.
- ✅ **Phase 197** — mem.fill audit. 326 calls scanned; 284 SAFE, 42 SUSPICIOUS (all probe stack-sentinel seeds with bare length arg). See `phase197-memfill-audit-report.md`.
- ✅ **Phase 202f** — upbase writer investigation CLOSED (session 62).

---

## Key Reference Addresses

### ROM
- `0x0040ee` — font table base (1bpp 10×14, 28 bytes/glyph, idx = char − 0x20)
- `0x005B96` — VRAM fill primitive
- `0x0802b2` — `SetTextFgColor` (HL→0xD02688, DE=0xFFFF→0xD0268A, sets bit 4 of 0xD000CA)
- `0x0A190F` — glyph byte loader + color flag check (Phase 188)
- `0x0A1A3B` — per-row color pixel subroutine (reads fg/bg from 0xD02688/0xD0268A)
- `0x0A1939`, `0x0A19D7` — VRAM pixel writers
- `0x062160` — generic error banner renderer (48 permutations via 0xD008DF/0xD00824)
- `0x088720` — restore path (copies 260 bytes: 0xD02EC7 → 0xD006C0)
- `0x08C331` — full OS init entry
- `0x0019BE` — OS event loop entry (ISR: 0x038 → 0x719 → here when 0xD177BA set)
- `0x0159C0` — direct keyboard scan (scan code in B)
- `0x0a2b72` / `0x0a29ec` / `0x0a2854` / `0x0a2106` — home stages 1/3/4/entry-line
- `0x0a349a` — status bar updater (guard: bit6 of 0xD0009b must be clear)
- `0x0a3320` — status indicator dots
- `0x056900` — dispatch table populator (dynamic-only; head=0xD0231A tail=0xD0231D)
- `0x09F79B` — scan code translation table (228 bytes, 4 modifier × 56)

### RAM
- `0xD02688` / `0xD0268A` — fg / bg color registers
- `0xD00595` / `0xD00596` — curRow / curCol (curRow wraps 0xFF via `inc a`, not sentinel)
- `0xD005A1-0xD005C5` — per-char font record (IX walks this)
- `0xD006C0` — display buffer (260 bytes, no natural writers — use restore path)
- `0xD0058E` — keyboard OS scan-code output
- `0xD0009B` — system flags (bit6 = status-bar update guard)
- `0xD000c6` — icon type selector (bit2: 0=battery, 1=mode dots)
- `0xD02EC7` — backup buffer (seed for restore path)
- `0xD020A6` — 26-byte mode text buffer ("Normal Float Radian       ")
- `0xD02AD7` — OS OP register (pre-init to 0x0019BE for event loop)
- `0xD177BA` — post-init flag (enables 0x719 → 0x19BE ISR path)
- `IX = 0xD1A860` — home-screen stage entry value

### Ports
- `0x3D/0x3E` — IRQ status/ack. `0x5000+` — FTINTC010. `0x500A` — keyboard IRQ ack (OUT 0x08). `0x5006` — keyboard IRQ mask.
- `0xF80000+` — LCD PL111 registers (ROM writes here in ADL mode: timing0 +0x00, timing1 +0x04, timing2 +0x08, upbase +0x10, lpbase +0x14, ctrl +0x18). **Now mirrored in cpu-runtime.js alongside 0xE00000** (Phase 202g). F80000 writes are logged via `cpu.getLcdF80Stats()`.
- `0xE00000+` — LCD MMIO as intercepted by peripherals.js (upbase +0x10, ctrl +0x18). `0xE00800-0xE00920` — keyboard MMIO. `0xE00900` — scan result.
- `0xD40000` — VRAM base (BGR565)

---

## Operating Mode (Parallel Codex Dispatch)

1. **Pick up state** from this file + `git log --oneline | head -10`.
2. **Dispatch 3–4 parallel Codex agents** per session via `cross-agent.py`. CC orchestrates and verifies; Codex writes files and runs probes.
3. **Keep Codex tasks ≤10 min each** — 15-min timeouts kill broader tasks. Split big investigations into (a) find X / (b) use X.
4. **Sonnet fallback** via Agent tool when Codex stalls with 0-byte output.
5. **CC verifies every deliverable** (re-run `node probe-*.mjs`) before committing.
6. **Commit + push** with message `feat: auto-session N — Phases X/Y/Z (one-line per phase)`.
7. **Update this file** before stopping. Keep only current state + next priorities fresh.
8. **At every pause** run `/context`. <70% of 1M → proceed. ≥70% → stop and hand off.

**Dispatch command**:
```bash
python "C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py" \
  --direction cc-to-codex --task-type implement \
  --prompt "<self-contained task: exact addresses, file paths, calling conventions>" \
  --working-dir "C:/Users/rober/Downloads/Projects/school/follow-alongs" \
  --timeout 600
```

Codex has NO conversation context. Prompts must be fully self-contained.

---

## Important Constraints

- **Don't revert dirty worktree files** — many unrelated modifications sit in the tree intentionally.
- **Stay with 1:1-ish bytecode lift** — widen decoder, improve CFG discovery, improve instruction semantics, add runtime helpers only to support lifted blocks. Do NOT rewrite as a high-level emulator.
- **Disable timer IRQ for OS init probes**: `createPeripheralBus({ timerInterrupt: false })`. Default 200-tick IRQ hijacks init via 0x1713 → 0x67F8 → 0x1c33 infinite loop.
- **ROM write-protect essential**: `cpu-runtime.js` `write8/16/24` silently drop writes where `addr < 0x400000`.
- **Keyboard matrix (SDK-authoritative)**: `keyMatrix[N] = SDK Group(7-N)`. Scan code = `(idx << 4) | bit`. 63/64 active; DOWN = 0x00 collides with no-key. Full map in `TI-84_Plus_CE/keyboard-matrix.md`.
- **`mem.fill(val, start, length)` is WRONG** — it's `(val, start, END)`. Always use `start + length`. Fixed across 47 probes in Phase 194.

---

## How To Regenerate

```bash
node scripts/transpile-ti84-rom.mjs                      # ~2s
node TI-84_Plus_CE/test-harness.mjs                      # 25-test harness
node TI-84_Plus_CE/probe-phase99d-home-verify.mjs        # golden regression
node TI-84_Plus_CE/audit-true-uncovered.mjs              # true-coverage audit
node TI-84_Plus_CE/coverage-analyzer.mjs                 # gap analysis
( cd TI-84_Plus_CE && gzip -kf -9 ROM.transpiled.js )    # regenerate .gz
```

After committing code changes, re-run `npx gitnexus analyze` (PostToolUse hook usually handles this). Add `--embeddings` if `.gitnexus/meta.json` shows `stats.embeddings > 0`.

---

## Key Repo Files

**Transpiler + runtime**: `scripts/transpile-ti84-rom.mjs`, `TI-84_Plus_CE/{ROM.rom, cpu-runtime.js, ez80-decoder.js, peripherals.js}`

**Validation**: `TI-84_Plus_CE/{test-harness.mjs, test-alu.mjs, ti84-math.mjs, coverage-analyzer.mjs, audit-true-uncovered.mjs, probe-phase99d-home-verify.mjs}`

**Browser + automation**: `TI-84_Plus_CE/{browser-shell.html, ti84-keyboard.js, ti84-lcd.js, scancode-translate.js, frontier-runner.mjs}`, `scripts/auto-continuation.bat`

**CEmu trace pipeline**: `cemu-build/{scenario-*.json, run-trace-*.ps1, *-trace.log}`, `TI-84_Plus_CE/cemu-trace-to-seeds.mjs`

**Specs + phase reports**: `TI-84_Plus_CE/phase*-report.md`, `TI-84_Plus_CE/{PHASE25_SPEC.md, PHASE25G_SPEC.md, keyboard-matrix.md, AUTO_FRONTIER_SPEC.md}`

---

## Where History Went

Anything not in this file lives in `git log`. Every auto-session commit is labeled `feat: auto-session N — Phases X/Y/Z` and every phase has a matching `TI-84_Plus_CE/phase<N>-report.md`. For deep detail on any phase, run `git show <commit>` or read the report.
