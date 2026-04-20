# Phase 202G - LCD MMIO 0xF80000 Mirror

## Runtime Changes

- `cpu-runtime.js:~829-830` adds `cpu._currentBlockPc` plus a default `cpu.getLcdF80Stats()` accessor so the executor can expose LCD mirror stats even before peripherals are wired.
- `cpu-runtime.js:~836-886` extends `lcdMmio` with `f80Writes` and `f80WriteLog`, adds shared LCD register helpers, and binds `cpu.getLcdF80Stats()` to the live LCD MMIO state.
- `cpu-runtime.js:~888-889` changes `cpu.read8()` so both `0xE00000-0xE00030` and `0xF80000-0xF80030` read through the same LCD register mapping.
- `cpu-runtime.js:~925-932` changes `cpu.write8()` so writes to either LCD window update the same `lcdMmio` object, while `0xF80000-0xF80030` additionally increments `lcdMmio.f80Writes` and appends capped `{ addr, value, pc }` log entries.
- `cpu-runtime.js:~1083` stores the current block PC in `cpu._currentBlockPc` immediately before block dispatch so `0xF80000` write instrumentation can report the block PC that triggered the MMIO write.

## Probe Output

Executed by Sonnet fallback on 2026-04-20.

```text
=== Phase 202G - LCD Mirror Probe ===
boot: steps=3025 term=halt lastPc=0x0019b5
stage 1 status bar background: entry=0x0a2b72 steps=28 term=missing_block lastPc=0xffffff
stage 2 status dots: entry=0x0a3301 steps=107 term=missing_block lastPc=0xffffff
stage 3 seed mode buffer: "Normal Float Radian       "
stage 3 home row strip: entry=0x0a29ec steps=17848 term=missing_block lastPc=0xffffff
stage 4 history area: entry=0x0a2854 steps=514 term=missing_block lastPc=0xffffff
stage 5 workspace fill: rows 75-219 -> 0xFFFF
stage 6 entry line fill: rows 220-239 -> 0xFFFF
0xF80000 writes: 0
lcdMmio.upbase final: 0xd40000
```

Confirms the Phase 202F prediction: cold boot + four home-render stages produce zero writes to the `0xF80000` ADL mirror, and the seeded `lcdMmio.upbase = 0xD40000` is preserved end-to-end (the earlier transient `0x000000` observation came from a thinner probe that omitted the RAM snapshot/restore used by the golden harness).

## Golden Regression Result

PASS — re-run by Sonnet fallback on 2026-04-20 after applying the mirror intercept. 26/26 exact match at `r39 c2`; status dots PASS on both clusters; Normal/Float/Radian all PASS.

```text
=== Phase 99D - Home Screen Verification Probe ===
fontDecoder: base=0x0040ee glyph=16x14
boot: steps=3025 term=halt lastPc=0x0019b5
stage 1 status bar background: entry=0x0a2b72 steps=28 term=missing_block lastPc=0xffffff
stage 2 status dots: entry=0x0a3301 steps=107 term=missing_block lastPc=0xffffff
stage 3 seed mode buffer: "Normal Float Radian       "
stage 3 home row strip: entry=0x0a29ec steps=17848 term=missing_block lastPc=0xffffff
stage 4 history area: entry=0x0a2854 steps=514 term=missing_block lastPc=0xffffff
stage 5 workspace fill: rows 75-219 -> 0xFFFF
stage 6 entry line fill: rows 220-239 -> 0xFFFF
drawn=59836 fg=1004 bg=58832 rMin=6 rMax=239
assert status dots left: PASS before=0 after=36 final=36
assert status dots right: PASS before=0 after=36 final=36
stripScan:
  r37: drawn=312 fg=0 bg=312 firstDrawn=2 firstFg=n/a
  r38: drawn=312 fg=0 bg=312 firstDrawn=2 firstFg=n/a
  r39: drawn=312 fg=32 bg=280 firstDrawn=2 firstFg=2
  r40: drawn=312 fg=36 bg=276 firstDrawn=2 firstFg=2
  r41: drawn=312 fg=22 bg=290 firstDrawn=2 firstFg=2
  r42: drawn=312 fg=22 bg=290 firstDrawn=2 firstFg=2
  r43: drawn=312 fg=79 bg=233 firstDrawn=2 firstFg=2
  r44: drawn=312 fg=112 bg=200 firstDrawn=2 firstFg=2
  r45: drawn=312 fg=83 bg=229 firstDrawn=2 firstFg=2
  r46: drawn=312 fg=66 bg=246 firstDrawn=2 firstFg=2
  r47: drawn=312 fg=80 bg=232 firstDrawn=2 firstFg=2
  r48: drawn=312 fg=81 bg=231 firstDrawn=2 firstFg=2
  r49: drawn=312 fg=61 bg=251 firstDrawn=2 firstFg=2
  r50: drawn=312 fg=65 bg=247 firstDrawn=2 firstFg=2
  r51: drawn=312 fg=120 bg=192 firstDrawn=2 firstFg=2
  r52: drawn=312 fg=109 bg=203 firstDrawn=2 firstFg=2
stripHints: firstDrawnCol=2 firstFgCol=2 densestRow=51
signatures=95
decodeAttempts (stride=12 compareWidth=10):
  r37 c0: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="t----] E]--| F-. --       "
  r37 c1: passCount=0 exactMatches=9 knownChars=24 unknowns=2 text="n----) ?)--f ?-/ --       "
  r37 c2: passCount=0 exactMatches=11 knownChars=24 unknowns=2 text="Wh-m-| ?|h-  ?-A|-n       "
  r37 c3: passCount=0 exactMatches=9 knownChars=22 unknowns=4 text="?--?-;  ;--r ?-?,--       "
  r37 c4: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="]----    --  ;-4 --       "
  r38 c0: passCount=0 exactMatches=9 knownChars=24 unknowns=2 text="tt,-.] ?]t.+ ?.-].,       "
  r38 c1: passCount=0 exactMatches=10 knownChars=24 unknowns=2 text="nn--q) ?)nqf ?qd)q-       "
  r38 c2: passCount=0 exactMatches=19 knownChars=26 unknowns=0 text="Nbrmml Plbmt Rmdimn       "
  r38 c3: passCount=0 exactMatches=9 knownChars=24 unknowns=2 text="?bh-p( P(bpr ?pj(ph       "
  r38 c4: passCount=0 exactMatches=9 knownChars=21 unknowns=5 text="]---?t  t-?L ??].?-       "
  r39 c0: passCount=0 exactMatches=13 knownChars=25 unknowns=1 text="tt,ra] f]tai ?at]a:       "
  r39 c1: passCount=0 exactMatches=18 knownChars=26 unknowns=0 text="ncrra) F)cat Aadiar       "
  r39 c2: passCount=3 exactMatches=26 knownChars=26 unknowns=0 text="Normal Float Radian       "
  r39 c3: passCount=1 exactMatches=21 knownChars=24 unknowns=2 text="?op?al Float Rajiap       "
  r39 c4: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="]z tst -tzsL 7s]ts~       "
  r40 c0: passCount=0 exactMatches=9 knownChars=22 unknowns=4 text=""::#?] t]:?| K?r]?:       "
  r40 c1: passCount=0 exactMatches=9 knownChars=24 unknowns=2 text="?n:rF) r)nF( ?Fn)Fr       "
  r40 c2: passCount=0 exactMatches=19 knownChars=26 unknowns=0 text="Normgl Flogt Hgo|gn       "
  r40 c3: passCount=0 exactMatches=11 knownChars=19 unknowns=7 text="??rp?(  (??k R?j(?p       "
  r40 c4: passCount=0 exactMatches=9 knownChars=21 unknowns=5 text="") ??t  t)?L -?Jt?~       "
  r51 c0: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c1: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c2: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c3: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c4: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
bestMatch=row39 col2
decoded="Normal Float Radian       "
assert Normal: PASS
assert Float: PASS
assert Radian: PASS
report=C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\phase99d-report.md
```

## Verdict

Runtime support for the `0xF80000-0xF80030` LCD MMIO mirror is now in place and shares state with the existing `0xE00000` intercept.

Observed boot-path verdict: **0 writes to `0xF80000` during cold boot + home-screen render**. Final `lcdMmio.upbase` remains `0xD40000` (the construction-time seed). Golden regression unaffected — LCD renders identically before and after the mirror intercept, because no boot-path code currently reaches the ADL mirror; the intercept is forward-compatible instrumentation for phases that will exercise the real LCD init (e.g., after lifting the currently-unreachable upbase-writer path at `0x005c34`).
