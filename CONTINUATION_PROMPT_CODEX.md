# Continuation Prompt — TI-84 Plus CE ROM Transpilation

> ⚠ **Auto-continuation loop active** — Windows Task Scheduler `TI84-AutoContinuation` fires a headless Opus session every 12h (midnight + noon local). Before editing this file in a human session, check `git log --oneline` for recent `auto-session N` commits and consider `schtasks /change /tn "TI84-AutoContinuation" /disable` to prevent conflicts. Re-enable with `/enable`. Launcher: `scripts/auto-continuation.bat`. Logs: `logs/auto-session-*.log` (gitignored).

**Last updated**: 2026-04-21 (session 71: Phase 25I COMPLETE. **First validated FP engine probes using canonical JT entry points.** Three probes against cold-boot OS, each requiring both `returnHit` AND numeric tolerance for PASS: **FPAdd (0x07C77F)** 2.0+3.0 → 5.0 exact; **SqRoot (0x07DF66)** sqrt(4.0) → 2.0 exact; **Sin (0x07E57B)** sin(π/6) → **0.5 exact** (transcendental engine genuinely exercised — sin(0)=0 was rejected as a false-positive trap per Codex review). Post-call OP1 bytes: FPAdd `00 80 50 00 00 00 00 00 00`, SqRoot `00 80 20 00 00 00 00 00 00`, Sin `00 7F 50 00 00 00 00 00 00`. **Key insight (SURPRISING)**: A cold-boot OS needs no additional FP setup — no angle-mode flag, no FPS init, no scratch-register seeding. CoorMon (0x08C331) + postInitState (IY=0xD00080, madl=1, SP=D1A872, IX=D1A860) is sufficient for the entire FP engine. This is the opposite of Phase 25H-b (Rcl_StatVar) where the JT slot was an unguarded primitive; here the JT slots go through a richer dispatcher that handles its own state. **Codex review (cross-agent/v1) caught two real bugs**: (a) Sin probe using sin(0)=0 was degenerate — swapped to sin(π/6)=0.5; (b) `cpu.push(FAKE_RET)` relied on `cpu.madl=1` leaking from prior `runFrom('adl')` — now forced explicitly in `postInitState`. Both were latent pitfalls for future probes. Reusable helper: `fp-real.mjs` with `writeReal(mem, addr, num)` / `readReal(mem, addr)` — TI 9-byte BCD, sign+biased-exp+7 mantissa. Self-test 7/7 PASS. Known follow-ups: BCD carry-overflow normalization (9.999→10.000), NaN/Inf handling (currently maps to zero). Artifacts: `fp-real.mjs`, 3×`probe-phase25i-*.mjs`, 3×`phase25i-*-report.md`. Golden regression 26/26 PASS. Session 70: Phase 25H-b COMPLETE. First subsystem-targeted probe using Phase 25H-a's named entry points. Called Rcl_StatVar JT slot 0x0204F0 (impl 0x08019F) directly against fresh OS with A=tMean=0x21. **Key surprise**: the JT slot is a 3-instruction low-level primitive (`CALL token→index; CALL index→OP1; RET`) with NO statsValid guard. Classic 83+ "ERR:STAT if stats not computed" contract lives HIGHER in the call chain (parser / token dispatch), not at the JT slot itself. Probe setup verified correct via Sonnet review: tMean=0x21, statFlags@0xD00089, statsValid=bit 6, IY=0xD00080 all confirmed against ti84pceg.inc. Impl disassembly: `CD A5 A3 09 / CD FB F9 07 / C9`. OP1 mutated 0xCCx9 → 0xFFx9 (uninitialized stat-var table). **Lesson for future probes**: JT slots are primitives, not guarded public APIs — for positive-path testing we must either seed stat-var table + statsValid flag, or call through higher-level parser entry (e.g. ParseInp at 0x099914). Artifacts: `probe-phase25h-b-rcl-statvar.mjs`, `phase25h-b-report.md`. Golden regression 26/26 PASS. Session 69: Phase 25H-a COMPLETE. Built jump-table symbol cross-reference: walked 980 entries at ROM 0x020104 (each a `C3 xx yy zz` JP instruction) and cross-referenced against CE-Programming/toolchain's `src/include/ti84pceg.inc`. Result: **957/980 slots named (97.7%)**, 23 unnamed. Canonical subsystem entry points now addressable — FPAdd=0x07C77F, FPSub=0x07C771, SqRoot=0x07DF66, Sin=0x07E57B, Cos=0x07E5B5, RndGuard=0x0685DF, Rcl_StatVar=0x08019F, ChkFindSym=0x08383D, ParseInp=0x099914, PutC=0x0A1B5B, PutMap=0x0A1799, VPutS=0x0A2718, ClrLCD=0x0A21C1, HomeUp=0x0A235E, **GetCSC=0x03FA09** (supersedes our 0x02FF0B which is an internal translation-table helper). 3 of our prior guesses confirmed: 0x062160=DispErrorScreen ✓, 0x08C331=CoorMon (OS main coordinator) ✓, 0x0A349A=RunIndicOff (turns off busy indicator — we mis-described as "status bar updater"). Artifacts: `phase25h-a-jump-table.json` (980 entries), `phase25h-a-jump-table-report.md`, `build-jump-table-symbols.mjs`, `references/ti84pceg.inc` (local copy for future sessions). Golden regression unaffected (no runtime changes). Session 68: Phase 25G-h COMPLETE. Scancode table at 0x09F79B emits TI-OS **`k*` keypress equates** (`_GetKey` codes written to `kbdKey`), **NOT** `sk*` scan-key codes. Source: `ti84pceg.inc` (CE-Programming/toolchain master, https://raw.githubusercontent.com/CE-Programming/toolchain/master/src/include/ti84pceg.inc). Full 0x00-0xFF k* dictionary applied. Session 67's DICT labels (0x09=ENTER, 0x80=PI, 0x82=SIN, etc.) were **wrong guesses** — authoritative values are 0x05=kEnter (0x09=kClear), 0x80=kAdd, 0x82=kMul. Reconciled DICT: 78 new entries + 14 overwrites. Undecoded cells 114 → 10 (all NONE plane, hitting documented k* gap 0x8E-0x97 / 0x94-0x97). Golden regression 26/26 PASS + 5/5 asserts. Prior: session 67: Phase 25G-g brute-scanned 64 keyboard cells through scanner 0x0159C0, 25G-f produced unified 4-plane decode.

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

### 1. ★★ Parser probe — `ParseInp` at 0x099914 (now the top unknown)
FP primitives validated (25I). Next natural escalation: the parser. Hand-construct a tokenized input like `"2+3"` (bytes `0x32 0x70 0x33` with proper token prefixes), seed it where `ParseInp` expects, CALL, verify OP1=5.0. If it works, unlocks the entire TI-BASIC evaluation path and becomes the bridge to stat-command execution + any user-facing expression. Needs research on how `ParseInp` consumes input (HL pointer? inputBuf at 0xD02587?) and what the tokenized-byte sequence should look like on cold OS.

### 2. ★ Harden `fp-real.mjs` (follow-up from 25I review)
Two known gaps from Codex review: (a) `writeReal` doesn't renormalize if 14-digit rounding carries 9.999... → 10.000... — could emit invalid BCD nibble. (b) NaN/Inf maps to zero instead of raising. Add a carry-fix loop and throw on non-finite. Small, self-contained, testable via extended self-test block.

### 3. ★★ Extended FP coverage — use the new harness
Reusable `fp-real.mjs` + probe template makes further FP tests cheap. Worth validating:
- **Cos (0x07E5B5)**: cos(π/3) = 0.5 (symmetric to sin(π/6) — confirms cos dispatch)
- **Tan (0x07E5D8)**: tan(π/4) = 1.0
- **LnX (0x07E053)**: ln(e) where e ≈ 2.71828... → 1.0
- **FPSub (0x07C771)**, **FPSquare (0x07C8B3)**, **CpOP1OP2 (0x07F831)**
- Edge cases: sin(π) ≈ 0 (tests near-zero trig handling), sqrt(0.25) = 0.5 (fractional input)

### 4. ★★ Positive-path stats (followup to 25H-b)
Seed stat-var table + set statsValid bit, then call `Rcl_StatVar` — verify the 9 bytes in OP1 match the seeded real. Tests that the slot-index calculation at 0x09A3A5 works correctly. Low-effort given 25H-b probe as starting point.

### 5. ★ VAT walker
`ChkFindSym` at 0x08383D with OP1 loaded with a variable name → verify it returns a valid pointer. Less urgent since we have no user variables to find on a cold OS, but low-effort and useful to confirm VAT traversal works.

### 6. ★ Backfill phase-report labels with canonical names
Phase reports scatter bare addresses everywhere. A one-shot script could grep phase*-report.md for any `0x[0-9A-F]{6}` that matches a JT slot and append ` (= Name)` inline. Low-cost, high readability win.

### 7. ★ Resolve remaining 10 undecoded NONE-plane cells (low priority)
After Phase 25G-h, 10 cells still render as `tok:0x8E..0x97` — these are the documented gap in the k* namespace in `ti84pceg.inc`. If any of these are genuinely emitted by the table at runtime, they may be CE-specific extensions (e.g., graphing-mode softkeys) or OS-internal codes not in the public header. Could probe `_GetKey`/`kbdKey` state during physical key presses that hit rows producing these values, but ROI is low — the table may just have don't-care fill in unused NONE-plane slots.

### 8. ★ FP engine documentation (low priority)
Phase 25G-e mapped the 0xAD–0xB6 FP region: self-contained engine, rst 0x28 is the exit, only 5 external callers (normalize at 0xB69E). Hub addresses: 0x00B2C4 (operation selection), 0x00B554 (loop-back). Could document the FP opcode dispatch structure for future reference, but this is not blocking anything.

### 9. ★ Coverage cleanup (low ROI, skip unless bored)
Phase 204 added 7 seeds for +0.0156 pp true coverage. Next 10 CODE? gaps (ranks 8–17 from `audit-true-uncovered.mjs`) would yield <0.01 pp each. **Stop chasing reported %**; report `audit-true-uncovered.mjs` numbers.

### Completed (session 71)
- ✅ **Phase 25I** — First validated FP engine probes. Built `fp-real.mjs` BCD helper (writeReal / readReal, 9-byte TI format: sign + biased exp + 7 mantissa bytes holding 14 BCD digits). Three probes against cold-boot OS, each asserting BOTH `returnHit` AND numeric tolerance: FPAdd(2+3)=5 exact, SqRoot(4)=2 exact, Sin(π/6)=0.5 exact. **Surprising finding**: cold-boot + CoorMon(0x08C331) + postInitState is sufficient for the entire FP engine — no angle-mode flag, no FPS init, no scratch-register seeding. Opposite of Phase 25H-b (unguarded primitive at JT slot) — here the JT slots dispatch into richer engines that init their own state. **Codex review via cross-agent/v1** caught two real bugs we fixed: (a) initial Sin probe used sin(0)=0, a degenerate false-positive trap — swapped for sin(π/6)=0.5 which actually exercises the transcendental engine; (b) `cpu.push(FAKE_RET)` was relying on `cpu.madl=1` leaking from prior `runFrom('adl')` — now forced explicitly. Both were latent pitfalls for any future probe. Known follow-ups (non-blocking): BCD carry-overflow normalization, NaN/Inf handling. Artifacts: `fp-real.mjs`, `probe-phase25i-{fpadd,sqroot,sin}.mjs`, `phase25i-{fpadd,sqroot,sin}-report.md`. Golden regression 26/26 PASS.

### Completed (session 70)
- ✅ **Phase 25H-b** — First subsystem-targeted probe. Called `Rcl_StatVar` JT slot 0x0204F0 → impl 0x08019F with A=tMean=0x21 against fresh OS (statsValid clear). Result: JT slot returns cleanly with OP1 populated (0xFFx9 from uninit stat-var table), no error banner, no carry. **Key insight (SURPRISE)**: The JT slot is a 3-instruction primitive (token→index, index→OP1, ret) with no statsValid guard. The classic 83+ "refuse if stats not computed" contract is enforced at a higher abstraction layer (parser / token dispatch), not at the JT slot. Probe setup verified trustworthy by Sonnet review (all 5 check points PASS: tMean=0x21, statFlags@0xD00089, statsValid=bit 6, IY=0xD00080, entry disassembly confirms no guard). Codex dispatch failed (UTF-8 encoding error in runner) — Sonnet fallback per workflow. Artifacts: `probe-phase25h-b-rcl-statvar.mjs`, `phase25h-b-report.md`. Follow-up: for positive-path verification, either seed stat-var table + statsValid bit then re-call slot, OR call through `ParseInp` (0x099914) to exercise the full guard→dispatch path.

### Completed (session 69)
- ✅ **Phase 25H-a** — Built OS jump-table symbol cross-reference. Walked 980 entries at ROM 0x020104 (4-byte `C3 xx yy zz` JP format, 100% JP coverage) and cross-referenced against CE-Programming/toolchain `src/include/ti84pceg.inc`. 957/980 (97.7%) slots named. Key canonical entries now known: see `## Canonical OS Entry Points (JT)` below. Confirmed 3 prior probe-guessed addresses (0x062160=DispErrorScreen, 0x08C331=CoorMon, 0x0A349A=RunIndicOff — the last being a correction from our earlier "status bar updater" label). Unlocks: subsystem-targeted probes against canonical entry points (stats, parser, FP, VAT). Artifacts: `build-jump-table-symbols.mjs`, `phase25h-a-jump-table.json`, `phase25h-a-jump-table-report.md`, `references/ti84pceg.inc`. Source: https://raw.githubusercontent.com/CE-Programming/toolchain/master/src/include/ti84pceg.inc

### Completed (session 68)
- ✅ **Phase 25G-h** — Cross-referenced scancode table outputs against authoritative TI-OS `k*` keypress equates from `ti84pceg.inc` (CE-Programming/toolchain master). **Key correction**: the table emits `_GetKey` (`k*`) codes, NOT `_GetCSC` (`sk*`) codes. Session-67 DICT labels were wrong guesses (0x09→ENTER was actually kClear; 0x80→PI was actually kAdd; 0x82→SIN was actually kMul; 0x84→TAN was actually kExpon; etc.). Rewrote DICT with authoritative k* names for 0x00-0xFB (14 overwrites + 78 new). Undecoded cells: 114 → 10 (all in NONE plane, hitting documented k* gap at 0x8E-0x97 and specifically 0x94-0x97 which the agent flagged as genuinely absent from the keypress equates block). Artifacts: `phase25g-h-report.md` (scheme source + full 0x00-0xFF derivation + conflict table), edited `phase25g-f-decode.mjs`, regenerated `phase25g-f-scancode-decoded.md`. Golden regression 26/26 PASS + 5/5 asserts. Source URL: https://raw.githubusercontent.com/CE-Programming/toolchain/master/src/include/ti84pceg.inc

### Completed (session 67)
- ✅ **Phase 25G-g** — Brute-scanned all 64 keyboard-matrix cells through scanner at 0x0159C0. 63 non-zero unique _GetCSC codes + 1 documented DOWN/no-key collision at 0x00. **Key finding**: scanner returns raw MMIO scancode `((7-sdkGroup)<<4)|bit`, NOT a compact sequential form — the "sequential" impression came from the downstream table lookup at 0x02FF0B (per 25G-d). 15 scancodes unlabeled (genuinely unused matrix cells incl. group 7 which only has ON at bit 7). Required `cpu._iy = 0xE00800` before each iteration (scanner reads MMIO via IY-offset). Artifacts: `probe-phase25g-g-getcsc-map.mjs`, `phase25g-g-map.json`, `phase25g-g-report.md`. Golden regression 26/26 PASS.
- ✅ **Phase 25G-f** — Merged session 64's raw table + 25G-d formula + 25G-g probe-verified labels + 25G-c dictionary into a unified decode. 57 rows × 4 planes (NONE/2nd/ALPHA/2nd+ALPHA), plane stride 57 bytes, 8 raws 0x70–0x77 correctly out-of-range (group 7 has no translation entry). 114/228 cells remain `tok:0x94..0xFF` pending TI-OS token cross-ref (Phase 25G-h). 0 label disagreements between session 64 and 25G-g sources. Artifacts: `phase25g-f-decode.mjs`, `phase25g-f-decode.out`, `phase25g-f-decode.err`, `phase25g-f-scancode-decoded.md`.

### Completed (session 66)
- ✅ **Phase 25G-d** — Table index formula RESOLVED via dynamic instrumentation. Probe `probe-phase25g-d-index.mjs` (Codex two-stage: ISR + lookup entry at 0x02FF0B) captured 4 table reads at offset 0x1A for raw scancode 0x31. **Index formula: `offset = ((raw >> 4) * 8) + (raw & 0x0F) + 1`**. For raw 0x31: `(3*8)+1+1 = 26 = 0x1A`. Table byte at 0x09F7B5 = 0x90. ISR stage: zero table reads (translation happens in main-loop GetCSC path). Callers: 0x0302EB, 0x02FFAE, 0x02FFBF, 0x02FFDE. Report: `phase25g-d-report.md`. Golden regression 26/26 PASS.
- ✅ **Phase 25G-e** — Dispatch to 0x00B608 analysis COMPLETE. Probe `probe-phase25g-e-dispatch.mjs` dumped rst 0x28 handler (FP EXIT: 0x28→0x2B→0x02011C→0x04AB69→0x03AC→0x19B5→HALT), searched all blocks for 0xAD–0xB6 range references (2019 internal, 5 external callers at 0x00156x/0x00161D→0x00B69E), and tested dynamic execution from 0x00ADB9 (41 steps, exited via rst 0x28 without reaching 0x00B608). Conclusion: 0x00B608 is deep in the FP engine's compare-and-branch dispatch, reachable only with specific FP operands. No indirect jumps — all dispatch is direct. Report: `phase25g-e-report.md`. Golden regression 26/26 PASS.

### Completed (session 65)
- ✅ **Phase 25G-b** — Two-phase ISR event-loop probe (`probe-phase25g-eventloop.mjs`) reworked with keyboard cycle → state reset → no-keyboard cycle. Phase B trace confirms the event loop at 0x19BE never branches to 0x00B608; it executes 0x19BE→0x19EF→0x1A17→0x1A23→0x1A2D→0x1A32→0x19B6 HALT. Two new blocks visited (0x1A23, 0x1A2D). Reset strategy works cleanly. Report: `phase25g-b-report.md`. Golden regression 26/26 PASS.
- ✅ **Phase 25G-c partial** — Created `phase25g-c-decode.mjs` + `phase25g-c-scancode-decoded.md` + `phase25g-c-decode.out`. 228 bytes at 0x09F79B decoded via inline dictionary into 4 modifier-plane tables. Byte frequency: 144 unique bytes, 0x00 ×36 most frequent. **Caveat**: physical-label column is unreliable — table indexing doesn't match `(group<<4)|bit` scancode convention. Follow-up in Phase 25G-d.

### Completed (session 64)
- ✅ **Phase 198** — Fixed all 42 suspicious `mem.fill` calls across 41 probe files. Pattern: `mem.fill(0xFF, cpu.sp, N)` → `mem.fill(0xFF, cpu.sp, cpu.sp + N)`. Golden regression unaffected (26/26 PASS). Grep confirms 0 remaining suspicious patterns.
- ✅ **Phase 25G partial** — Seeded 0x00B608 in transpiler (seed count 49,972→49,973). Block exists in prelifted JSON. Event loop probe (`probe-phase25g-eventloop.mjs`) traces 17 blocks via ISR dispatch (0x038→0x6f3→0x704→0x710→0x1713→0x719→0x19BE→event loop→HALT). Scan code translation table dumped to `phase25g-scancode-table-report.md` (57 keys × 4 modifiers). **Finding**: 0x00B608 is on the non-keyboard ISR path; keyboard-handling ISR clears system flag, preventing subsequent cycles from re-entering event loop.

### Completed (session 63)
- ✅ **Phase 202g** — LCD MMIO 0xF80000 mirror added to `cpu-runtime.js`.
- ✅ **Phase 196** — rowLimit/colLimit write trace complete.
- ✅ **Phase 197** — mem.fill audit: 326 calls scanned, 42 SUSPICIOUS identified.
- ✅ **Phase 202f** — upbase writer investigation CLOSED (session 62).

---

## Key Reference Addresses

### Canonical OS Entry Points (Jump Table, Phase 25H-a)
Full list in `TI-84_Plus_CE/phase25h-a-jump-table.json` (957 named, 23 unnamed). Highlights:

| Slot | Impl | Name | Subsystem |
|------|------|------|-----------|
| 0x020148 | 0x03F9CD | `KbdScan` | Keyboard |
| 0x02014C | **0x03FA09** | `GetCSC` | Keyboard (supersedes 0x02FF0B) |
| 0x020150 | 0x08C331 | `CoorMon` | OS main coordinator (our "OS init" ≡ this) |
| 0x0201BC | 0x07C771 | `FPSub` | FP |
| 0x0201C0 | 0x07C77F | `FPAdd` | FP |
| 0x0201D4 | 0x07C8B3 | `FPSquare` | FP |
| 0x0201F8 | 0x07DF66 | `SqRoot` | FP |
| 0x0201FC | 0x0685DF | `RndGuard` | FP |
| 0x02020C | 0x07E053 | `LnX` | FP |
| 0x020220 | 0x07E543 | `SinCosRad` | FP |
| 0x020224 | 0x07E57B | `Sin` | FP |
| 0x020228 | 0x07E5B5 | `Cos` | FP |
| 0x02022C | 0x07E5D8 | `Tan` | FP |
| 0x020294 | 0x07F831 | `CpOP1OP2` | FP |
| 0x0204F0 | 0x08019F | `Rcl_StatVar` | Stats |
| 0x0204EC | 0x09A3BD | `Sto_StatVar` | Stats |
| 0x02050C | 0x08383D | `ChkFindSym` | VAT |
| 0x020534 | 0x08238A | `CreateReal` | VAT |
| 0x020588 | 0x08267D | `DelVar` | VAT |
| 0x0207B4 | 0x0A1799 | `PutMap` | Display (large font) |
| 0x0207B8 | 0x0A1B5B | `PutC` | Display (large font) |
| 0x0207BC | 0x0A1C62 | `DispHL_s` | Display |
| 0x020808 | 0x0A21BB | `ClrLCDFull` | Display |
| 0x02080C | 0x0A21C1 | `ClrLCD` | Display |
| 0x020828 | 0x0A235E | `HomeUp` | Display |
| 0x020830 | 0x0A23E5 | `VPutMap` | Display (small font) |
| 0x020834 | 0x0A2718 | `VPutS` | Display (small font) |
| 0x020848 | 0x0A349A | `RunIndicOff` | UI (correction: our "status bar updater" is the busy-indicator off-switch) |
| 0x020868 | 0x0A2A3E | `GetKeypress` | Keyboard |
| 0x020D8C | 0x02FCB3 | `GetKey` | Keyboard (blocking) |
| 0x020E10 | 0x062160 | `DispErrorScreen` | Errors |
| 0x020F00 | 0x099914 | `ParseInp` | Parser (expression evaluator) |
| 0x020F60 | 0x09AC77 | `RclVarSym` | VAT |

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
- `0x09F79B` — scan code translation table (228 bytes, 4 modifier × 57). Index: `((raw>>4)*8)+(raw&0x0F)+1`. Modifier offsets: none=0, 2nd=0x38, alpha=0x70, alpha+2nd=0xA8
- `0x02FF0B` — GetCSC lookup entry (drives table read). Callers at 0x0302EB, 0x02FFAE, 0x02FFBF, 0x02FFDE
- `0x000028` — rst 0x28 = FP EXIT (di; rsmix → 0x2B → 0x02011C → 0x04AB69 → 0x03AC → 0x19B5 → HALT)
- `0x00B2C4` — FP engine operation selection hub
- `0x00B554` — FP engine loop-back to 0x00AE24

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
