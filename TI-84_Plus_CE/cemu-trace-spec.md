# CEmu PC-Trace Seed Generator — Spec

> Strategic context: our static seed-discovery has plateaued. As of session 39 the boot reaches 943 steps cleanly and decoder fixes (Phases 146/152/153) may still unlock more, but a substantial fraction of the ROM is reachable only via indirect dispatch (BCALL / RAM-callback tables / ISR paths) that static graph traversal will never see. CEmu — a mature TI-84 Plus CE emulator that already handles all hardware quirks — can boot the ROM, accept scripted keypresses, and run the real OS. If we can dump the PC of every instruction it executes, we get a ground-truth set of "addresses the real OS actually visits during boot + interaction." Fed back as seeds to `scripts/transpile-ti84-rom.mjs`, this expands our static lift surface to match real execution.
>
> **This is a Path-2 follow-on, not a Path-1 unlock. Pursue only after the next 2-3 decoder gaps (DD 31 d, LEA, Phase 152's 0x00ff42) have been worked.**

## Goal

Produce a deduplicated list of PC addresses that the real TI-84 Plus CE OS executes during a cold boot + N scripted keypress scenarios. Feed those PCs as new seeds into `scripts/transpile-ti84-rom.mjs`. Measure the coverage delta in `TI-84_Plus_CE/ROM.transpiled.report.json`. Verify the golden regression (`probe-phase99d-home-verify.mjs`) still passes 26/26.

## Local environment (verified 2026-04-14)

| Item | Path / status |
|---|---|
| CEmu binary (Qt GUI, single file) | `C:\Users\rober\AppData\Local\Microsoft\WinGet\Packages\CE-Programming.CEmu_Microsoft.Winget.Source_8wekyb3d8bbwe\CEmu.exe` |
| Symlink on PATH | `C:\Users\rober\AppData\Local\Microsoft\WinGet\Links\CEmu.exe` |
| User config dir | `C:\Users\rober\AppData\Local\cemu-dev\CEmu\` (contains `cemu_config.ini`, `cemu_image.ce`) |
| Source repo (NOT cloned yet) | https://github.com/CE-Programming/CEmu |
| Autotester source | `tests/autotester/` in the repo (`autotester_cli.cpp`, `autotester.cpp/.h`, `json_file_documentation.txt`, `CMakeLists.txt`, `Makefile`) |
| Core source | `core/` in the repo (C, separable from Qt). Key files: `core/cpu.h`, `core/cpu.c`, `core/debug/debug.h`, `core/debug/debug.c` |

The WinGet single-file install does **not** ship `autotester_cli` or any C headers. Path 2 requires cloning + building from source — there is no pre-built headless autotester binary to grab.

## What CEmu's surfaces actually expose

Researched 2026-04-14 from upstream `master`:

| Capability | Available? | Notes |
|---|---|---|
| Headless ROM boot | YES | `autotester_cli.cpp` builds as a standalone non-Qt binary |
| Scripted keypresses | YES | autotester JSON: `"sequence": ["key\|enter", "hold\|2nd", "release\|2nd", "sendCSC\|enter\|clear"]` |
| Memory range hash | YES | `"hashes"` JSON object with `"start"` + `"size"` over VRAM/RAM/shadow regions |
| Memory dump to file | NO (autotester) | Hashes only — verification, not extraction |
| Register state dump | NO (autotester) | Not part of JSON schema |
| **PC execution trace** | **NO (out of the box)** | Neither autotester JSON nor any documented core API exposes this |
| Cycle-precise step control | NO (autotester) | Only `delay\|num` (milliseconds) and `delay_after_step` |
| `debug_inst_start()` hook | YES (in `core/debug/debug.h`) | Called by the emulator loop at every instruction boundary, but no user-callback registration mechanism — must be edited at source level |
| `cpu_pc()` getter in public API | NO | PC lives in internal `debug_state_t`; access requires patching debug.c or marking the field public |
| IPC features | YES (mentioned in README, undocumented) | For multi-CEmu coordination, not for trace export |

**Conclusion**: Path 2 is feasible but requires a small source patch — autotester alone cannot dump PCs. The sweet spot is "build `autotester_cli` + add a TRACE_PC env-var-controlled fprintf inside `debug_inst_start()`."

## Path 2 — Build patched autotester_cli (PRIMARY)

### Phase A — Sandbox + clone

1. **Pick a sibling directory outside the project repo**, e.g. `C:\Users\rober\Downloads\Projects\cemu-build\`. Do NOT clone into `follow-alongs/` — we don't want CEmu source in our git history.
2. `git clone https://github.com/CE-Programming/CEmu.git`
3. **Pin a known commit**: `cd CEmu && git log --oneline -1` — record the SHA in the eventual report so future sessions can reproduce. Pin to `master` HEAD as of the build day.
4. Verify `tests/autotester/` exists and contains `autotester_cli.cpp`, `autotester.cpp`, `autotester.h`, `CMakeLists.txt`, `json_file_documentation.txt`.
5. Read `tests/autotester/CMakeLists.txt` — confirm it does NOT pull in Qt. The `autotester_cli` target should depend only on `core/` + json11 + crc32. **If it pulls in Qt, fall back to Path 3.**
6. Read `tests/autotester/json_file_documentation.txt` end-to-end and copy it to `TI-84_Plus_CE/cemu-autotester-format.md` as a local reference (with attribution).

### Phase B — Build unmodified

1. **Toolchain**: this is Windows, MSYS2 environment. Try in order:
   - **Option 1 (preferred)**: MSYS2 MINGW64 with `cmake`, `make`, `gcc-g++`. `pacman -S mingw-w64-x86_64-cmake mingw-w64-x86_64-gcc mingw-w64-x86_64-make` if missing.
   - **Option 2**: MSVC via Visual Studio Build Tools if MSYS2 build hits eZ80-specific compiler issues.
2. Build commands (autotester has both Makefile and CMakeLists):
   ```
   cd CEmu/tests/autotester
   make            # try GNU make first
   # or
   mkdir build && cd build && cmake .. && cmake --build . --config Release
   ```
3. Verify the binary exists: `tests/autotester/autotester_cli.exe` (or wherever the build deposits it).
4. **Smoke test**: feed it a minimal autotester JSON pointing at our existing `TI-84_Plus_CE/ROM.bin` (or wherever the local ROM lives — check `scripts/transpile-ti84-rom.mjs` for the canonical path) with no key sequence, just boot. Confirm exit code 0 and any expected hash matches.

### Phase C — Patch core/debug/debug.c for PC tracing

**Goal**: emit one PC per line to a file when env var `TRACE_PC` is set, otherwise do nothing.

1. Open `core/debug/debug.h`. Look for the declaration of `debug_inst_start(void)`. Confirm it's called from the CPU emulator loop on every instruction boundary.
2. Find the internal `debug_state_t` struct (in `debug.c` or a sibling header). Locate the field that holds the current PC (likely `debug.cpu.registers.PC` or similar — search for `cpu_state` references).
3. In `debug.c`, **at the top of `debug_inst_start()`** (and ONLY this function), add:
   ```c
   /* CEmu PC-trace patch — controlled by TRACE_PC env var */
   static FILE *trace_pc_file = NULL;
   static int trace_pc_initialized = 0;
   if (!trace_pc_initialized) {
       const char *path = getenv("TRACE_PC");
       if (path && *path) {
           trace_pc_file = fopen(path, "w");
       }
       trace_pc_initialized = 1;
   }
   if (trace_pc_file) {
       fprintf(trace_pc_file, "%06X\n", (unsigned)(cpu.registers.PC));
   }
   ```
   Replace `cpu.registers.PC` with whatever the actual public CPU state accessor turns out to be — verify by grepping the existing `debug.c` for how PC is referenced elsewhere.
4. Add `#include <stdio.h>` and `#include <stdlib.h>` at the top of `debug.c` if not already present.
5. **Do not touch any other functions.** This is a minimal patch; the goal is to keep the diff small and reviewable.
6. Rebuild `autotester_cli`. Verify it still passes the Phase B smoke test.

### Phase D — Define test scenarios (autotester JSON)

Create `cemu-traces/` (sibling to the CEmu clone, NOT in our repo). For each scenario, write one autotester JSON file:

| Scenario | Filename | Sequence | Why |
|---|---|---|---|
| Cold boot only | `boot.json` | (no key events) | Baseline — what the OS does on power-up before any input |
| Press ENTER from home | `home-enter.json` | `["delay\|2000", "key\|enter"]` | Triggers home-screen ENTER handler |
| Press MODE | `mode.json` | `["delay\|2000", "key\|mode"]` | Reaches MODE menu renderer |
| Press 2ND + MODE (QUIT) | `quit.json` | `["delay\|2000", "sendCSC\|2nd\|mode"]` | Tests modifier path through scancode-translate |
| Press CLEAR | `clear.json` | `["delay\|2000", "key\|clear"]` | Tests another home-screen handler |
| Press Y= | `y-equals.json` | `["delay\|2000", "key\|yequals"]` | Reaches Y= editor |
| Press GRAPH | `graph.json` | `["delay\|2000", "key\|graph"]` | Reaches graph-screen renderer |
| Press 2 + 3 + ENTER | `arith.json` | `["delay\|2000", "key\|2", "key\|3", "key\|enter"]` | Tokenizer + display arithmetic round-trip |

Each JSON should also specify the same ROM path. Refer to `json_file_documentation.txt` for exact field names and key name spelling — DO NOT guess key names; they are case-sensitive and not all PC keys map.

### Phase E — Run + collect traces

For each scenario:
```
TRACE_PC=cemu-traces/boot.log autotester_cli boot.json
TRACE_PC=cemu-traces/home-enter.log autotester_cli home-enter.json
... etc
```

Each `*.log` will be a large list of PCs (one per line, hex with `0x` or just hex — match whatever debug.c writes). Expect tens of MB per scenario.

### Phase F — Post-process to seed file

Write a Node.js script `TI-84_Plus_CE/cemu-trace-to-seeds.mjs` that:
1. Reads all `cemu-traces/*.log` files
2. For each line, parses the hex PC
3. Filters: keep only PCs in `0x000000-0x3FFFFF` (4MB ROM range — discard any RAM-region PCs, those are jump-to-RAM dispatches we can't statically lift)
4. Deduplicates across all scenarios
5. Sorts ascending
6. Writes to `TI-84_Plus_CE/cemu-trace-seeds.txt` as one PC per line, format matching existing seed files (e.g. `phase100c-seeds.txt`, `phase152-seeds.txt`)
7. Reports: total PCs read, unique ROM PCs, count not already in `PRELIFTED_BLOCKS` (cross-reference against current `ROM.transpiled.js` via grep or a simple membership check)

### Phase G — Wire into transpiler + retranspile

1. Add `cemu-trace-seeds.txt` to the seed file list in `scripts/transpile-ti84-rom.mjs` (look for how `phase100c-seeds.txt` and `phase152-seeds.txt` are loaded — follow the same pattern).
2. Run `npm run transpile-ti84-rom` (or whatever the canonical command is — check `package.json`).
3. Diff `TI-84_Plus_CE/ROM.transpiled.report.json` before/after: `seedCount`, `blockCount`, `coverage`. Record deltas in the eventual phase report.

### Phase H — Verify + measure

1. Run the golden regression: `node TI-84_Plus_CE/probe-phase99d-home-verify.mjs`. **Must still pass 26/26 exact** (Normal/Float/Radian).
2. Re-run any other green probes that exist at the time (check `phase99d-report.md` for the canonical regression suite).
3. Write `TI-84_Plus_CE/phaseXX-cemu-trace-report.md` (XX = whatever phase number is current) with: pinned CEmu commit SHA, build commands used, scenarios run, raw-PC counts, unique-PC counts, coverage delta, regression status.

### Acceptance criteria (Path 2)

- [ ] `autotester_cli.exe` builds successfully on this machine
- [ ] Patched `debug.c` produces a non-empty PC trace when `TRACE_PC=path.log` is set
- [ ] At least the `boot.json` scenario produces a trace file
- [ ] Post-processing produces `cemu-trace-seeds.txt` with N > 1000 unique ROM PCs (rough sanity floor — boot alone should hit thousands)
- [ ] Retranspile completes without error
- [ ] `blockCount` and `coverage` in `ROM.transpiled.report.json` increase
- [ ] Golden regression still 26/26 PASS
- [ ] Phase report committed with pinned CEmu SHA

## Path 3 — Custom core/ driver (FALLBACK)

Use this **only if** any of the following Path 2 walls hits:

- `tests/autotester/CMakeLists.txt` pulls in Qt or Qt headers
- `autotester_cli` build fails with eZ80-specific compiler errors that aren't trivially patchable
- The `debug_inst_start()` patch turns out to be called too rarely (e.g. only at debug breakpoints, not every instruction)
- The PC field in `debug_state_t` isn't accessible from `debug.c` without a deeper refactor

### Approach

Write a minimal C driver that links directly against `core/` (and only `core/`). No Qt, no autotester, no JSON parsing.

1. Inspect `core/cpu.h` for the public step/run API. Likely candidates: `cpu_execute()`, `cpu_step()`, `cpu_do_cycle()`, or an `emu_loop()` entry. Find one that runs N instructions or runs until a breakpoint.
2. Inspect `core/emu.h` (if it exists) for ROM loading. Likely an `emu_load_rom(const char *path)` or `mem_load_rom(uint8_t *bytes, size_t len)`.
3. Inspect `core/keypad.h` (if it exists) for the API to inject scan codes — there's likely a `keypad_key_press(int code)` or similar.
4. Write `tools/cemu-trace/main.c`:
   ```c
   #include "core/emu.h"
   #include "core/cpu.h"
   #include "core/debug/debug.h"
   /* + whatever else core/ exposes */

   int main(int argc, char **argv) {
       const char *rom_path = argv[1];
       const char *trace_path = argv[2];
       FILE *trace = fopen(trace_path, "w");

       emu_init();
       emu_load_rom(rom_path);

       for (long step = 0; step < 5000000; step++) {
           uint32_t pc = cpu.registers.PC;     /* whatever the actual access is */
           fprintf(trace, "%06X\n", pc);
           cpu_step();                          /* whatever the actual fn is */
           if (/* halted */) break;
       }

       fclose(trace);
       return 0;
   }
   ```
5. Build with a hand-rolled Makefile or a tiny CMakeLists that pulls in `core/*.c` and nothing else:
   ```
   gcc -O2 -I CEmu -o cemu-trace.exe tools/cemu-trace/main.c CEmu/core/cpu.c CEmu/core/mem.c CEmu/core/emu.c CEmu/core/debug/debug.c <other core c files as needed>
   ```
6. Resolve missing-symbol link errors one file at a time by adding the missing `core/*.c` to the gcc command. Do NOT add anything from `gui/`.
7. For keypress scenarios: call the keypad-inject function before each batch of `cpu_step()`s. This is more brittle than autotester JSON but doesn't require autotester to build.
8. Same Phase F-H as Path 2 (post-process, retranspile, verify).

### Acceptance criteria (Path 3)

Same as Path 2, except substitute `cemu-trace.exe` for `autotester_cli.exe`.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| autotester build pulls in Qt | LOW | Path 2 dead | Inspect CMakeLists.txt early (Phase A step 5), fall back to Path 3 |
| Build deps missing on Windows/MSYS2 | MEDIUM | Slow | Install via pacman; document exact pacman invocation in the report |
| `debug_inst_start()` not called every instruction | LOW | Path 2 dead | Verify in Phase B by adding a `static long count = 0; count++;` inside the patch and printing on shutdown — should be millions for a 2-second boot |
| PC field not accessible from debug.c | LOW | Path 2 patch needs widening | Mark `debug_state_t.cpu` non-static or add a getter macro in debug.h |
| Trace files are gigantic (>1 GB) | MEDIUM | Slow post-processing | Write PCs as 3-byte binary instead of 7-byte text; or have the patch maintain an in-memory `bool seen[0x400000]` and only emit each PC once |
| Retranspile takes too long with N+5000 new seeds | LOW | Slow iteration | Acceptable — retranspile is already a ~1 min operation |
| Adding seeds breaks golden regression | LOW | Block ship | The retranspile output is deterministic from seeds; if it breaks regression, identify which seed caused the breakage by bisecting (binary search on the seed file) |
| CEmu's emulated state diverges from our transpiler's CPU model | MEDIUM | Trace PCs touch addresses our transpiler can't actually reach | Acceptable — these will just be dead seeds. The fraction we CAN reach is the win. |
| Codex/Sonnet agent times out during the build phase | MEDIUM | No progress | Build is the longest single step. Allocate the whole session to it; let CC orchestrate while a single Codex builds. |

## Why this is queued behind decoder fixes

The current decoder gap (Phase 152's 922-hit DD 31 d, plus Phase 153's LEA family with 52 hits) is pure transpiler bug — fixing it expands static coverage with zero CEmu involvement. Run those first. Then Phase 147 (extended boot exploration past 943 steps) will tell us how much more static reach the recent fixes have unlocked. **CEmu tracing only becomes the highest-value unlock when we hit a wall where boot or a feature requires code that's only called via indirect dispatch and no decoder fix can reach it.** Likely candidates for that wall: dispatch table population (0xD0231A linked list), key-handler dispatch through 0xD007EB pointers, the BCALL CE-flavor direct CALL chain found in Phase 87b/88/89.

## Estimated effort

| Phase | Best case | Realistic | If it goes sideways |
|---|---|---|---|
| A. Clone + inspect | 10 min | 20 min | — |
| B. Unmodified build | 30 min | 1-2 hours | 4+ hours if MSYS2 deps missing |
| C. PC-trace patch | 20 min | 45 min | 2 hours if cpu state is private |
| D. Test scenarios | 20 min | 45 min | 1 hour if key name spellings need iteration |
| E. Run scenarios | 5 min | 15 min | — |
| F. Post-process | 30 min | 1 hour | — |
| G. Wire + retranspile | 15 min | 30 min | — |
| H. Verify + report | 30 min | 1 hour | — |
| **Total Path 2** | **~2.5 hours** | **~5 hours** | **~10 hours** |
| Path 3 (if Path 2 dies) | — | +3 hours on top | — |

This is a 1-2 session block of work, not a 30-minute task. **Do not dispatch this from a single auto-continuation slot.** Either schedule a dedicated longer session, or break it into per-phase Codex tasks across multiple auto-continuation slots with explicit handoff between them.

## What success looks like

A commit titled something like `feat: phase-XXX — cemu-trace seed generator (boot+8 scenarios, +N coverage)` containing:
- The patched-CEmu commit SHA pinned in the report
- `TI-84_Plus_CE/cemu-trace-seeds.txt` (committed)
- `TI-84_Plus_CE/cemu-trace-to-seeds.mjs` (committed)
- `scripts/transpile-ti84-rom.mjs` updated to load the new seed file
- `TI-84_Plus_CE/ROM.transpiled.report.json` with new (higher) coverage
- `TI-84_Plus_CE/phaseXXX-cemu-trace-report.md` with: build steps, scenarios, deltas, regression status
- Golden regression (`probe-phase99d-home-verify.mjs`) still 26/26 PASS

The CEmu source clone and the patched debug.c live OUTSIDE the follow-alongs repo. The seed file and the post-processing script are the only artifacts that come back to our tree.
