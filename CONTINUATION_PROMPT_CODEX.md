# Continuation Prompt — TI-84 Plus CE ROM Transpilation

> ⚠ **Auto-continuation loop active** — Windows Task Scheduler `TI84-AutoContinuation` fires a headless Opus session every 1h (daily trigger at midnight, then hourly repeat). Before editing this file in a human session, check `git log --oneline` for recent `auto-session N` commits and consider `schtasks /change /tn "TI84-AutoContinuation" /disable` to prevent conflicts. Re-enable with `/enable`. Change interval: `schtasks /change /tn "TI84-AutoContinuation" /ri <minutes>`. Launcher: `scripts/auto-continuation.bat`. Logs: `logs/auto-session-*.log` (gitignored).

**Last updated**: 2026-04-22 (session 76: Phase 25Q — 3 tasks (1 Codex, 2 Sonnet fallback). **25Q InvOP1S PASS**: InvOP1S(0x07CA06) confirmed as negate (same as InvOP1Sc). 7.0→-7.0, -3.5→3.5. Total validated FP primitives: **15**. **25Q Error handler 0x061DB2 — RESOLVED (LONGJMP)**: Convergence point is a classic setjmp/longjmp: stores error code to errNo(0xD008DF), calls cleanup(0x03E1B4), clears 4 IY flag bits, then `ld sp, (errSP=0xD008E0); pop af; ret`. The 0x58c35b "crash" is caused by uninitialized errSP → garbage SP → garbage return address. **25Q CreateReal entry 0x082386 — RESOLVED**: 0x082386 is just `jp 0x0822D9` (shared Create allocator). CreateReal: A=0(RealObj), HL=9(size). CreateCplx at 0x082380: A=0x0C, HL=18. The type-check code at 0x08239c is a SEPARATE routine after the allocator returns. OP4(0xD00619) bit 3 tested post-allocation to tag complex entries. **KEY CORRECTIONS**: progPtr=0xD0259D (not 0xD01C00), pTemp=0xD0259A, OPBase=0xD02590, errSP=0xD008E0, errNo=0xD008DF. Golden regression 26/26 PASS. Artifacts: 3 probes, 3 reports.) Session 73: Phase 25K/L/M/N DISPATCHED. **25L FP edge pack — all 3 PASS**: FPSub(5-3)=2.0 exact, FPSquare(7)=49.0 exact, CpOP1OP2 produces distinct flag patterns (lt: F=0xa3 C=1 Z=0, eq: F=0x42 C=0 Z=1, gt: F=0x02 C=0 Z=0) confirming standard TI comparison convention at the JT slot. **25M Sto_StatVar — PASS**: stored 42.0 at tMean slot 0xD012A8, round-trip via Rcl_StatVar returns 42.0 exact. First validated STORE direction for stat vars. **25K ParseInp — FAIL (informative)**: called 0x099914 with tokenized "2+3" at userMem=0xD1A881 and all parser-pointer globals seeded. First 32 ROM bytes show `af 32 be 22 d0 ...` (= `xor a; ld (0xD022BE),a; ...`), confirming ParseInp is NOT register-driven — reads pointers from global slots we haven't fully identified. Ran 200K steps looping around 0x082be2/0x084711/0x084716/0x08471b without returning; OP1 untouched. Global-pointer contract needs reverse-engineering beyond what a single probe can do. **25N ChkFindSym — FAIL (informative)**: CreateReal with OP1=[00 41 00 00 00 00 00 00 00] ("A" real) jumps to 0x58c35b after 50 steps (known stack-corruption pattern per CLAUDE.md home-stage notes). ChkFindSym jumps to 0x7eedf3 after 9 steps. Both VAT routines require stack/IX setup our postInitState doesn't provide. Golden regression 26/26 PASS. Artifacts: 5 new probes, 5 reports. Session 72: Phase 25J COMPLETE — 4 parallel tasks. **(1) fp-real.mjs hardened**: carry-overflow normalization (9.999...→10.0 now correct), NaN/Inf throws instead of silent zero, self-test 14/14 PASS (was 7/7). **(2) Extended FP probes**: Cos(π/3)=0.5 exact, Tan(π/4)=1.0 (diff ~1e-14), LnX(e)=1.0 (diff ~5e-14) — all 3 PASS. Tan/LnX return 14-digit BCD that's 1.0 minus tiny rounding — expected for 14-digit precision. **(3) Positive-path Rcl_StatVar**: seeded 42.0 at tMean slot 0xD012A8 (derived: statVars base + 9×index from token→index at 0x09A3A5), set statsValid bit 6 at 0xD00089, called impl 0x08019F — OP1=42.0 exact. **First positive-path stat-var probe**. **(4) Backfill JT labels**: one-shot script annotated 2913 bare hex addresses across 81 phase-report .md files with canonical names from phase25h-a-jump-table.json. Artifacts: hardened `fp-real.mjs`, 3×`probe-phase25j-{cos,tan,lnx}.mjs`, `probe-phase25j-statvar-positive.mjs`, `backfill-jt-labels.mjs`, 4 reports. Golden regression 26/26 PASS. Session 71: Phase 25H-b COMPLETE. First subsystem-targeted probe using Phase 25H-a's named entry points. Called Rcl_StatVar JT slot 0x0204F0 (impl 0x08019F) directly against fresh OS with A=tMean=0x21. **Key surprise**: the JT slot is a 3-instruction low-level primitive (`CALL token→index; CALL index→OP1; RET`) with NO statsValid guard. Classic 83+ "ERR:STAT if stats not computed" contract lives HIGHER in the call chain (parser / token dispatch), not at the JT slot itself. Probe setup verified correct via Sonnet review: tMean=0x21, statFlags@0xD00089, statsValid=bit 6, IY=0xD00080 all confirmed against ti84pceg.inc. Impl disassembly: `CD A5 A3 09 / CD FB F9 07 / C9`. OP1 mutated 0xCCx9 → 0xFFx9 (uninitialized stat-var table). **Lesson for future probes**: JT slots are primitives, not guarded public APIs — for positive-path testing we must either seed stat-var table + statsValid flag, or call through higher-level parser entry (e.g. ParseInp at 0x099914). Artifacts: `probe-phase25h-b-rcl-statvar.mjs`, `phase25h-b-report.md`. Golden regression 26/26 PASS. Session 69: Phase 25H-a COMPLETE. Built jump-table symbol cross-reference: walked 980 entries at ROM 0x020104 (each a `C3 xx yy zz` JP instruction) and cross-referenced against CE-Programming/toolchain's `src/include/ti84pceg.inc`. Result: **957/980 slots named (97.7%)**, 23 unnamed. Canonical subsystem entry points now addressable — FPAdd=0x07C77F, FPSub=0x07C771, SqRoot=0x07DF66, Sin=0x07E57B, Cos=0x07E5B5, RndGuard=0x0685DF, Rcl_StatVar=0x08019F, ChkFindSym=0x08383D, ParseInp=0x099914, PutC=0x0A1B5B, PutMap=0x0A1799, VPutS=0x0A2718, ClrLCD=0x0A21C1, HomeUp=0x0A235E, **GetCSC=0x03FA09** (supersedes our 0x02FF0B which is an internal translation-table helper). 3 of our prior guesses confirmed: 0x062160=DispErrorScreen ✓, 0x08C331=CoorMon (OS main coordinator) ✓, 0x0A349A=RunIndicOff (turns off busy indicator — we mis-described as "status bar updater"). Artifacts: `phase25h-a-jump-table.json` (980 entries), `phase25h-a-jump-table-report.md`, `build-jump-table-symbols.mjs`, `references/ti84pceg.inc` (local copy for future sessions). Golden regression unaffected (no runtime changes). Session 68: Phase 25G-h COMPLETE. Scancode table at 0x09F79B emits TI-OS **`k*` keypress equates** (`_GetKey` codes written to `kbdKey`), **NOT** `sk*` scan-key codes. Source: `ti84pceg.inc` (CE-Programming/toolchain master, https://raw.githubusercontent.com/CE-Programming/toolchain/master/src/include/ti84pceg.inc). Full 0x00-0xFF k* dictionary applied. Session 67's DICT labels (0x09=ENTER, 0x80=PI, 0x82=SIN, etc.) were **wrong guesses** — authoritative values are 0x05=kEnter (0x09=kClear), 0x80=kAdd, 0x82=kMul. Reconciled DICT: 78 new entries + 14 overwrites. Undecoded cells 114 → 10 (all NONE plane, hitting documented k* gap 0x8E-0x97 / 0x94-0x97). Golden regression 26/26 PASS + 5/5 asserts. Prior: session 67: Phase 25G-g brute-scanned 64 keyboard cells through scanner 0x0159C0, 25G-f produced unified 4-plane decode.

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

### 1. ★★★ Disassemble shared Create allocator at 0x0822D9
Session 76 proved CreateReal's entry (0x08238A) just sets A=0(RealObj), HL=9(size), then `jp 0x0822D9`. This shared allocator is the actual VAT insertion + memory allocation routine. Disassemble 0x0822D9 (~128-256 bytes) to understand: (a) what it does with A=type and HL=size, (b) which RAM it reads (progPtr=0xD0259D, pTemp=0xD0259A, OPBase=0xD02590, symTable=0xD3FFFF), (c) whether it calls 0x08359B (which CreateXxx variants call after), (d) what it writes to the VAT. This is the KEY to making CreateReal work.

### 2. ★★★ CreateReal with errSP seeded — retry probe
Session 76 proved the error handler at 0x061DB2 is a longjmp that loads SP from errSP(0xD008E0). To make CreateReal work: (a) seed errSP to point at a FAKE_ERR_RET sentinel frame (push a known return address + AF onto stack, store SP into errSP), (b) seed OP1 with correct format (OP1[0]=sign, OP1[1..8]=BCD mantissa, then set OP1+1 for name — but CreateReal entry `xor a` zeros A then jumps to 0x0822D9, so the name is handled differently), (c) also seed progPtr/pTemp/OPBase per ti84pceg.inc addresses. If the error handler fires, we catch it at FAKE_ERR_RET instead of crashing to 0x58c35b.

### 3. ★★★ ParseInp with errSP seeded — retry probe  
Same longjmp fix applies. Seed errSP + OPS (0xD02593) pointing at tokenized expression. If ParseInp hits an error (e.g., variable lookup fails), the error handler longjmps to our seeded errSP frame, and we can read errNo(0xD008DF) to identify WHICH error occurred. This converts the crash into a diagnostic.

### 4. ★ Stat-var — exhaustive coverage (low priority)
Session 75 brought total to 9 validated tokens. Diminishing returns — the slot formula 0xD0117F + (A×9) is proven solid.

### 5. ★ Resolve remaining 10 undecoded NONE-plane cells (low priority)
After Phase 25G-h, 10 cells still render as `tok:0x8E..0x97` — documented gap in the k* namespace. Low ROI.

### 6. ★ Coverage cleanup (low ROI, skip unless bored)
Next CODE? gaps yield <0.01 pp each. **Stop chasing reported %**.

### Completed (session 76)
- ✅ **Phase 25Q — InvOP1S PASS** — InvOP1S(0x07CA06) confirmed as negate operation (same as InvOP1Sc). Test 1: 7.0→-7.0 exact (sign byte 0x00→0x80). Test 2: -3.5→3.5 exact (sign byte 0x80→0x00). Static disassembly reveals InvOP1Sc(0x07CA02) starts with `call 0x07CA27` (conditioning) then falls into InvOP1S, while InvOP1S calls `0x07F7BD` directly (the actual negation). Codex succeeded on first attempt. Total validated FP primitives: **15** (FPAdd, FPSub, FPMult, FPDiv, FPSquare, SqRoot, Sin, Cos, Tan, LnX, TenX, CpOP1OP2, FPRecip, InvOP1Sc, InvOP1S). Artifacts: `probe-phase25q-invop1s.mjs`, report.
- ✅ **Phase 25Q — Error handler 0x061DB2 disassembly — RESOLVED (LONGJMP)** — Static disassembly of the TI-OS error convergence point. **0x061DB2 is a classic setjmp/longjmp**: (1) `ld (errNo=0xD008DF), a` stores error code, (2) `call 0x03E1B4` interrupt-safe cleanup wrapper (saves A to scratch 0xD00542, checks `ld a,i / jp pe`, DI, calls 0x03E187, restores EI state), (3) clears 4 IY-offset flag bits (IY+75 bit7, IY+18 bit2, IY+36 bit4, IY+73 bit1), (4) **`ld sp, (errSP=0xD008E0)` — THE LONGJMP**, (5) `pop af; ret` — returns to whatever address was saved at the errSP frame. **Does NOT call DispErrorScreen (0x062160)**. The 0x58c35b "crash" is caused by uninitialized errSP (0xFF fill) → garbage SP → garbage return address. DispErrorScreen is called by the recovery point (the "setjmp" side), not by the error handler itself. Gap region 0x061D80-0x061DB1 confirmed as tail of error dispatch table (13 more entries with error codes 0x28, 0x2E, 0xAB, 0xAC, 0xAF, 0x2F, 0x30, 0x31, 0xB4, 0x9F, 0xB5, 0x36). Codex timed out; Sonnet fallback succeeded. Artifacts: `probe-phase25q-error-handler.mjs`, report.
- ✅ **Phase 25Q — CreateReal entry 0x082386 disassembly — RESOLVED** — Extended disassembly of 0x082340-0x0823F0 region. **Key findings**: (1) 0x082386 is simply `jp 0x0822D9` — a shared Create allocator dispatcher. CreateReal at 0x08238A sets A=0(RealObj), HL=9(size), then `jr 0x082386 → jp 0x0822D9`. (2) CreateCplx at 0x082380 sets A=0x0C, HL=18(=2×9). (3) The type-check at 0x08239C (checking 0x5D/0x24/0x3A/0x72) is a SEPARATE routine that runs AFTER the allocator returns, not part of CreateReal's entry path. Those values are list/string/program/complex NAME PREFIX bytes, not type codes. (4) **0xD00619 = OP4** (confirmed from ti84pceg.inc). Bit 3 of OP4 tested post-allocation to tag complex entries with 0x0C. (5) **ADDRESS CORRECTIONS**: progPtr=0xD0259D (not 0xD01C00 as previously guessed), pTemp=0xD0259A, OPBase=0xD02590, pTempCnt=0xD02596, symTable=0xD3FFFF. The SYMBOLS map in previous probes had wrong addresses. (6) Next target: disassemble the shared allocator at 0x0822D9. Codex timed out; Sonnet fallback succeeded. Artifacts: `probe-phase25q-createreal-entry.mjs`, report.
- Golden regression 26/26 PASS post-session. 1 Codex + 2 Sonnet fallback dispatches (2 Codex timed out on static disassembly tasks).

### Completed (session 75)
- ✅ **Phase 25P — FPRecip PASS** — FPRecip(1/4)=0.25 exact (OP1 `00 7f 25 00 00 00 00 00 00`). Returns cleanly to FAKE_RET. Entry point 0x07CAB1. Total validated FP primitives now: 14 (FPAdd, FPSub, FPMult, FPDiv, FPSquare, SqRoot, Sin, Cos, Tan, LnX, TenX, CpOP1OP2, FPRecip, InvOP1Sc). Artifacts: `probe-phase25p-fprecip.mjs`, report.
- ✅ **Phase 25P — InvOP1Sc PASS** — InvOP1Sc(negate 7)=-7.0 exact (OP1 `80 80 70 00 00 00 00 00 00`, sign byte flipped 0x00→0x80). Entry point 0x07CA02. Artifacts: `probe-phase25p-invop1sc.mjs`, report.
- ✅ **Phase 25P — Stat-var extended 4/4 PASS** — tMaxX(0x09)=999.0 (diff ~1e-13, BCD precision ceiling), tCorr(0x12)=0.95 (exact), tQ1(0x14)=0.0 (zero edge case, exact), tQ3(0x15)=-100.5 (diff ~1e-11, negative fractional). All Sto/Rcl round-trips succeed. Total validated stat-var tokens: 9 (tMean, tStatN, tXMean, tSumX, tMinX, tMaxX, tCorr, tQ1, tQ3). Slot formula 0xD0117F + (A×9) confirmed for all. Artifacts: `probe-phase25p-statvar-extended.mjs`, report.
- ❌ **Phase 25P — ParseInp OPS retry (informative FAIL, MAJOR PROGRESS)** — Seeded OPS (0xD02593) → 0xD1A881 pointing at tokenized "2+3" ([0x32, 0x70, 0x33, 0x3F]). ParseInp advanced 197 blocks through real token dispatch (0x099xxx → 0x09bxxx → 0x080090 → 0x09bae3 → 0x061d1a → 0x061db2 → 0x03e1b4 → 0x03e1ca → 0x061dba → 0x58c35b). OPS seeding WORKED — parser entered real execution, not the idle loop from session 73. But it hit the error dispatch table at 0x061db2. The parser internally calls into the 0x080090 VAT region which triggers the same error path as CreateReal. OP1 untouched. **KEY INSIGHT**: ParseInp's internal variable lookup hits the same missing-VAT-state issue as CreateReal. Both need VAT head pointers (progPtr/pTemp) and possibly a correctly initialized VAT structure to avoid the error dispatch. Artifacts: `probe-phase25p-parseinp-ops.mjs`, report.
- ✅ **Phase 25P — VAT disassembly (KEY DISCOVERY)** — Static disassembly of CreateReal entry 0x08238A and crash paths 0x061D1A/0x061D3E/0x03E1B4/0x03E1CA. **0x061D1A-0x061D7E is the TI-OS error code dispatch table**, NOT stack corruption. Every entry: `ld a, <error_code>; jr 0x061db2`. CreateReal at 0x08239c does `ld a, (0xD005F9)` (OP1+1 = type byte), compares against 0x5D (list), 0x24, 0x3A, 0x72 — if none match → `jp nz, 0x061d46` → error 0x8F. Our session-73 probe set OP1[1]=0x41 (name "A") when the code expects a TYPE byte at that position. CreateReal also reads 0xD00619 after the type check (bit 3 test). The 0x03E1B4 subroutine is an interrupt-safe scratch routine using 0xD00542 as temporary. IY+18 (0xD00092) is touched by `set 2, (iy+18)`. No IX-offset reads found in any disassembled range. Sonnet fallback used (Codex timed out). Artifacts: `probe-phase25p-vat-disasm.mjs`, report.
- Golden regression 26/26 PASS post-session. 3 Codex + 1 Sonnet fallback dispatches.

### Completed (session 74)
- ✅ **Phase 25O — FP primitives (FPMult, FPDiv, TenX) — all 3 PASS** — FPMult(6×7)=42.0 exact (OP1 `00 81 42 00 00 00 00 00 00`), FPDiv(84/2)=42.0 exact, TenX(10^3)=1000.0 exact (OP1 `00 83 10 00 00 00 00 00 00`). All return cleanly to FAKE_RET. Entry points: FPMult=0x07C8B7, FPDiv=0x07CAB9, TenX=0x07E219. Artifacts: `probe-phase25o-{fpmult,fpdiv,tenx}.mjs`, 3 reports. Total validated FP primitives now: FPAdd, FPSub, FPMult, FPDiv, FPSquare, SqRoot, Sin, Cos, Tan, LnX, TenX, CpOP1OP2 (12 total).
- ✅ **Phase 25O — Stat-var expansion — 4/4 PASS** — Extended Sto/Rcl round-trip beyond tMean to 4 new tokens: tStatN(0x02)=10.0, tXMean(0x03)=25.5, tSumX(0x04)=100.0, tMinX(0x08)=-3.0. All store and recall exact, including negative value (-3.0 encoded as `80 80 30 00 00 00 00 00 00`). Slot formula `0xD0117F + (A × 9)` confirmed for all tokens. Total validated stat-var tokens: tMean(0x21), tStatN(0x02), tXMean(0x03), tSumX(0x04), tMinX(0x08) = 5 total. Artifacts: `probe-phase25o-statvar-expansion.mjs`, report.
- ✅ **Phase 25O — ParseInp helper disassembly — KEY FINDING** — Static disassembly of the three helper subroutines ParseInp calls early: (1) `0x099B81` is pure IY-offset flag manipulation (resets parser state bits at IY+6, IY+7, IY+62, IY+32, IY+88, IY+26, IY+31, IY+73, IY+72) — no pointer reads. (2) `0x099B18` calls ChkFindSym(0x08383D), stores DE into asm_ram(0xD00687) as scratch, then WRITES begPC(0xD02317) and curPC(0xD0231A) — these are outputs, not inputs, explaining why seeding them in session 73 had no effect. (3) `0x09BEED` reads `OPS (0xD02593)` — this is the critical input pointer. Loop at 0x084711 reads OP1+1(0xD005F9) as a byte compare, not a pointer fetch. **Conclusion**: next ParseInp probe should seed OPS=0xD02593. Artifacts: `probe-phase25o-parseinp-helpers.mjs`, report.
- Golden regression 26/26 PASS post-session. All 3 Codex dispatches succeeded on first attempt.

### Completed (session 73)
- ✅ **Phase 25L — FP edge pack (FPSub, FPSquare, CpOP1OP2)** — Three probes mirroring 25I-fpadd template. **FPSub(5-3)=2.0** exact (OP1 `00 80 20 00 00 00 00 00 00`), **FPSquare(7²)=49.0** exact (OP1 `00 81 49 00 00 00 00 00 00`), **CpOP1OP2** 3-case probe confirms standard TI flag convention: lt (3<5) → F=0xA3 (C=1 Z=0), eq (5=5) → F=0x42 (C=0 Z=1), gt (7>2) → F=0x02 (C=0 Z=0). All three cases produce distinct flag states. Artifacts: `probe-phase25l-{fpsub,fpsquare,cpop1op2}.mjs`, 3 reports. All 3 PASS.
- ✅ **Phase 25M — Sto_StatVar round-trip** — Follow-up to Phase 25J positive-path Rcl. Seeded OP1=42.0, A=tMean=0x21, statsValid bit 6 set, called Sto_StatVar impl 0x09A3BD. Slot at 0xD012A8 transitioned from `ff × 9` → `00 81 42 00 00 00 00 00 00` = 42.0 exact. Round-trip via Rcl_StatVar with OP1 cleared to 0xFF returned 42.0 exact (diff=0). First validated STORE direction for stat vars — establishes the full read/write pattern for all stat variables. Artifacts: `probe-phase25m-sto-statvar.mjs`, `phase25m-sto-statvar-report.md`. PASS.
- ❌ **Phase 25K — ParseInp (informative FAIL)** — Called 0x099914 with tokenized `2+3` bytes `0x32 0x70 0x33 0x3F` at userMem=0xD1A881, seeded 8 parser-pointer globals to userMem, primed HL. Probe ran to max_steps=200000 looping at 0x082be2/0x084711/0x084716/0x08471b without returning. **Key finding**: first 32 ROM bytes show `xor a; ld (0xD022BE),a; call 0x099B81; ...` — ParseInp is pointer-driven via a global slot we haven't identified. The 8 pointer slots we seeded were all ignored. Real contract lives in the helpers at 0x099B81/0x099B18/0x09BEED which need disassembly. OP1 untouched. Artifacts: `probe-phase25k-parseinp.mjs`, `phase25k-parseinp-report.md`. Valuable negative result for next-session research.
- ❌ **Phase 25N — ChkFindSym (informative FAIL)** — CreateReal with OP1=[00 41 00 00 00 00 00 00 00] ("A" real var) jumped to 0x58c35b after 50 steps (term=missing_block). ChkFindSym jumped to 0x7eedf3 after 9 steps. The 0x58c35b address is the **known stack-corruption pattern** from CLAUDE.md home-stage-1/4 crash notes. VAT routines need stack/IX setup our postInitState doesn't provide — possibly seeding VAT head pointers (progPtr/pTemp) or correcting IX. Recent PCs captured: 0x082bba → 0x061d3e → 0x061db2 → 0x03e1b4 ... 0x082bc2 → 0x03e1ca → 0x061dba → 0x58c35b. Artifacts: `probe-phase25n-chkfindsym.mjs`, `phase25n-chkfindsym-report.md`. Research needed before retry.
- Golden regression 26/26 PASS post-session. 3 parallel Codex dispatches succeeded (25L, 25M) + 2 timed out but wrote usable FAIL probes (25K, 25N).

### Completed (session 72)
- ✅ **fp-real.mjs hardened** — Carry-overflow normalization: if `toPrecision(14)` rounding pushes a digit ≥10, propagate carry; if MSB overflows, shift right and increment exponent. NaN/Inf now throws `Error('fp-real: cannot encode ...')` instead of silently mapping to zero. Self-test extended from 7→14 cases including carry boundary (9.999...→10.0), max 14-digit integer, tiny exponent (1e-99), negative small, π, plus NaN/Inf throw assertions. All 14 PASS.
- ✅ **Phase 25J — Extended FP probes (Cos, Tan, LnX)** — Three new probes following the Phase 25I template. **Cos(π/3)=0.5** exact (OP1 `00 7F 50 00 00 00 00 00 00`). **Tan(π/4)=0.9999999999999** (OP1 `00 7F 99 99 99 99 99 99 99`, diff ~1e-14 — the TI FP engine computes correctly to 14-digit BCD precision but doesn't round to exact 1.0). **LnX(e)=0.99999999999995** (OP1 `00 7F 99 99 99 99 99 99 95`, diff ~5e-14). All 3 PASS. **Key observation**: Tan and LnX demonstrate the precision ceiling of the TI 14-digit BCD engine — results are correct to the last representable digit but don't employ guard-digit rounding to snap to "nice" values. This is consistent with documented TI calculator behavior.
- ✅ **Phase 25J — Positive-path Rcl_StatVar** — Follow-up to 25H-b. Seeded 42.0 at tMean stat-var slot 0xD012A8 (address derived from statVars base + 9×index, where index comes from token→index subroutine at 0x09A3A5 with A=tMean=0x21). Set statsValid (bit 6 of 0xD00089). Called Rcl_StatVar impl 0x08019F → OP1 = `00 81 42 00 00 00 00 00 00` = 42.0 exact. **First positive-path stat-var probe** — confirms the full Rcl_StatVar read pipeline works end-to-end when data is present.
- ✅ **Backfill JT labels** — Created `backfill-jt-labels.mjs` that reads `phase25h-a-jump-table.json` and annotates bare hex addresses in phase reports with canonical JT names. Result: 141 files scanned, 81 modified, 2913 addresses annotated with ` (= Name)` suffixes. Massively improves readability of historical phase reports.
- All 4 tasks dispatched to Codex in parallel, all 4 succeeded on first attempt. Golden regression 26/26 PASS.

### Completed (session 71)
- ✅ **Phase 25I** — First validated FP engine probes. Built `fp-real.mjs` BCD helper (writeReal / readReal, 9-byte TI format: sign + biased exp + 7 mantissa bytes holding 14 BCD digits). Three probes against cold-boot OS, each asserting BOTH `returnHit` AND numeric tolerance: FPAdd(2+3)=5 exact, SqRoot(4)=2 exact, Sin(π/6)=0.5 exact. **Surprising finding**: cold-boot + CoorMon(0x08C331) + postInitState is sufficient for the entire FP engine — no angle-mode flag, no FPS init, no scratch-register seeding. Opposite of Phase 25H-b (unguarded primitive at JT slot) — here the JT slots dispatch into richer engines that init their own state. **Codex review via cross-agent/v1** caught two real bugs we fixed: (a) initial Sin probe used sin(0)=0, a degenerate false-positive trap — swapped for sin(π/6)=0.5 which actually exercises the transcendental engine; (b) `cpu.push(FAKE_RET)` was relying on `cpu.madl=1` leaking from prior `runFrom('adl')` — now forced explicitly. Both were latent pitfalls for any future probe. Known follow-ups (DONE in session 72): BCD carry-overflow normalization, NaN/Inf handling. Artifacts: `fp-real.mjs`, `probe-phase25i-{fpadd,sqroot,sin}.mjs`, `phase25i-{fpadd,sqroot,sin}-report.md`. Golden regression 26/26 PASS.

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
- `0xD005F8` — OP1, `0xD00603` — OP2, `0xD0060E` — OP3, `0xD00619` — OP4, `0xD00624` — OP5, `0xD0062F` — OP6 (11 bytes apart, NOT 9)
- `0xD005A1-0xD005C5` — per-char font record (IX walks this)
- `0xD006C0` — display buffer (260 bytes, no natural writers — use restore path)
- `0xD0058E` — keyboard OS scan-code output
- `0xD0009B` — system flags (bit6 = status-bar update guard)
- `0xD000c6` — icon type selector (bit2: 0=battery, 1=mode dots)
- `0xD02EC7` — backup buffer (seed for restore path)
- `0xD020A6` — 26-byte mode text buffer ("Normal Float Radian       ")
- `0xD008DF` — errNo (error code register — written by error handler at 0x061DB2)
- `0xD008E0` — errSP (saved SP for error longjmp — MUST seed for CreateReal/ParseInp)
- `0xD008E3` — errOffset
- `0xD007FA` — onSP (ON-key handler SP)
- `0xD00542` — scratch RAM (used by interrupt-safe wrapper at 0x03E1B4)
- `0xD00619` — OP4 (type byte bit 3 tested by CreateReal post-allocation)
- `0xD02590` — OPBase (VAT base pointer)
- `0xD02593` — OPS (parser expression stack pointer — critical input for ParseInp)
- `0xD02596` — pTempCnt
- `0xD0259A` — pTemp (VAT temporary pointer)
- `0xD0259D` — progPtr (VAT program pointer — NOT 0xD01C00 as previously guessed)
- `0xD3FFFF` — symTable (end of VAT symbol table)
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
