# Phase 315: Frame-Based _indcall Dispatch Sites

**Date**: 2026-05-13  
**Probe**: `probe-phase315-frame-indcall.mjs`

## Overview

Session 314 identified 44 `_indcall` dispatch sites (22 via `CALL 0x00015C`, 22 via `CALL 0x002288`). Of these, 12 are **slot-based** (load IY from a fixed RAM address via `LD IY,(addr)`) and the remaining 32 are **frame-based** (load IY from an IX-relative stack frame offset — C function pointers).

The probe also found the `JP 0x002288` instruction at 0x00015C itself (the trampoline definition), bringing the raw scan to 45 sites / 33 non-slot. Excluding the trampoline yields the expected 32 frame-based caller sites.

## Key Finding: FD 37 Idiom

The dominant IY-loading pattern is the ZDS II compiler idiom `FD 37 dd` — an eZ80-specific opcode that loads IY from an IX-relative frame offset. **22 of the 32 frame-based sites** use this pattern immediately before the dispatch call. The typical instruction sequence is:

```
DD 31 <off>      ; LEA IY, IX+off   (or similar frame setup)
FD 37 <off>      ; LD IY,(IX+off)   -- load function pointer from stack frame
DD 07 <off>      ; ??? (push/setup)
FD C5            ; PUSH IY
CD 5C 01 00      ; CALL 0x00015C    -- _indcall
```

## Frame-Based Sites by IX Offset

| IX Offset | Count | Sites |
|-----------|-------|-------|
| +0x00 | 16 | 0x00C943, 0x00F572, 0x00F777, 0x00F856, 0x00F926, 0x00F9EA, 0x00FB61, 0x00FEB2, 0x014D99, 0x02B7A9, 0x032315, 0x03CD41, 0x03CF5B, 0x0BCC6F + 2 near |
| +0x04 | 1 | 0x02F4E3 |
| +0x06 | 1 | 0x02F938 (LD B,(IX+6); LD A,(IX+6)) |
| +0x0A | 3 | 0x031135, 0x031333, 0x0313BD |
| +0xF9 | 1 | 0x00FBC6 (LD D,(IX+0xF9) = IX-7 signed) |
| +0xFA | 1 | 0x054162 (LD C,(IX+0xFA) = IX-6 signed) |
| no IX pattern | 9 | 0x011267, 0x013553, 0x01358D, 0x015120, 0x02424C-0x024299 (5 sites), 0x03213D, 0x054E09 |

Most frame-based calls read the function pointer from IX+0 (the first local / first argument in the C stack frame).

## Containing Functions (22 identified, 6 orphans)

### Multi-Dispatch Functions

| Function Start | Sites | Notes |
|---------------|-------|-------|
| 0x0241A3 (PUSH IX) | 5 | 0x02424C, 0x024270, 0x024279, 0x024290, 0x024299 — heavy callback dispatcher, no FD 37 pattern (uses different IY-load mechanism) |
| 0x01340F (after RET) | 2 | 0x013553, 0x01358D — no IX pattern, loads from RAM slots 0xD1775B and 0xD1775E via ED 4B |
| unknown | 6 | 0x00F856, 0x00F926, 0x00F9EA, 0x00FB61, 0x011267, 0x03CF5B — likely inside large functions (>500 bytes from nearest prologue/RET boundary) |

### Single-Dispatch Functions (19 functions)

| Function | Site | IX Pattern |
|----------|------|------------|
| 0x00C8B9 | 0x00C943 | FD 37 +0x00 |
| 0x00F42E | 0x00F572 | FD 37 +0x00 |
| 0x00F5B0 | 0x00F777 | FD 37 +0x00 |
| 0x00FB6E | 0x00FBC6 | LD D,(IX+0xF9) |
| 0x00FE0F | 0x00FEB2 | FD 37 +0x00 |
| 0x014D47 | 0x014D99 | FD 37 +0x00 |
| 0x0150C2 | 0x015120 | no IX pattern |
| 0x02B71F | 0x02B7A9 | FD 37 +0x00 |
| 0x02F41C | 0x02F4E3 | FD 37 +0x04 |
| 0x02F906 | 0x02F938 | LD B/A,(IX+0x06) |
| 0x030F9B | 0x031135 | FD 37 +0x0A |
| 0x0311D1 | 0x031333 | FD 37 +0x0A |
| 0x03133D | 0x0313BD | FD 37 +0x0A |
| 0x032112 | 0x03213D | no IX pattern |
| 0x03214E | 0x032315 | FD 37 +0x00 |
| 0x03CC6A | 0x03CD41 | FD 37 +0x00 |
| 0x05411A | 0x054162 | LD C,(IX+0xFA) |
| 0x054DD4 | 0x054E09 | no IX pattern |
| 0x0BCC13 | 0x0BCC6F | FD 37 +0x00 |

## ROM Region Clustering

### Dense Cluster: 0x00F000-0x00FFFF (8 sites)
The 0x00Fxxx region contains the highest concentration of frame-based dispatch sites. All 8 sites use `CALL 0x002288` and most use the FD 37 +0x00 pattern. This region likely contains the OS's core callback/event dispatch infrastructure.

### Dense Cluster: 0x024000-0x024FFF (5 sites)
All 5 sites belong to a single function at 0x0241A3 — a heavy callback dispatcher that makes 5 consecutive `CALL 0x00015C` calls. Uses a different IY-load mechanism (not FD 37).

### Dense Cluster: 0x031000-0x031FFF (3 sites)
Three sites in three separate functions, all using FD 37 +0x0A (IX offset 10). These likely share a common struct/callback table layout where the function pointer is at offset 10.

### 64KB Super-Region Summary

| Region | Sites | Unique Functions |
|--------|-------|-----------------|
| 0x00xxxx | 10 | 6 |
| 0x01xxxx | 5 | 3 |
| 0x02xxxx | 8 | 4 |
| 0x03xxxx | 7 | 6 |
| 0x05xxxx | 2 | 2 |
| 0x0Bxxxx | 1 | 1 |

## Slot-Based Sites (for completeness)

12 slot-based sites were classified and excluded from the frame-based analysis:

| Slot Address | Sites |
|-------------|-------|
| 0xD00108 | 1 (0x002D27) |
| 0xD14026 | 2 (0x041EAC, 0x013244) |
| 0xD143EA | 1 (0x01519F) |
| 0xD17751 | 3 (0x038A96, 0x038AB7, 0x038B6E) |
| 0xD177BD | 1 (0x010269) |
| 0xD177C0 | 1 (0x0102A4) |
| 0xD177C3 | 1 (0x0102C9) |
| 0xD177C6 | 1 (0x0102F2) |
| 0xD177C9 | 1 (0x010389) |

## Observations

1. **FD 37 is the compiler's indirect-call idiom.** ZDS II generates `FD 37 dd` to load a function pointer from a C struct/stack frame into IY, then dispatches via `CALL _indcall`. This is the eZ80-specific "load IY from (IX+d)" instruction.

2. **IX+0x00 dominates.** 16 of 22 FD 37 sites use offset 0, meaning the function pointer is the first field of whatever struct IX points to. This is consistent with C vtable-style dispatch where the callback is the first member.

3. **The 0x031xxx cluster uses IX+0x0A consistently.** Three functions in this region all access offset 10 — they likely operate on the same struct type where the callback lives at byte offset 10.

4. **Function 0x0241A3 is a multi-callback orchestrator.** It makes 5 separate `_indcall` dispatches without the FD 37 pattern, suggesting it iterates through a callback list or dispatches multiple callbacks in sequence.

5. **The 0x00Fxxx cluster aligns with OS event handling.** Eight frame-based dispatch sites concentrated in 4KB of ROM strongly suggests this region implements the OS's main event/notification dispatch loop, calling registered handlers via function pointers.

6. **6 orphan sites have no identifiable function boundary** within 500 bytes. These are likely inside very large OS functions or in code regions with non-standard prologue/epilogue patterns.
