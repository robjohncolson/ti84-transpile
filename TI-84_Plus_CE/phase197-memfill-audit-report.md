# Phase 197 — `mem.fill` Caller Audit (Read-Only)

**Date**: 2026-04-20
**Scope**: All `mem.fill(` call sites in `TI-84_Plus_CE/*.mjs` and `TI-84_Plus_CE/*.js`
**Correct signature**: `mem.fill(value, start, END)` — third arg is an END ADDRESS, not a byte count.
**Context**: Phase 194 fixed 47 probes. This phase audits REMAINING callers.

## Totals

| Category | Count |
|----------|-------|
| Total `mem.fill(` calls | 326 |
| SAFE | 285 |
| SUSPICIOUS | 41 |
| UNKNOWN | 0 |

## Classification Rules

- **SAFE**: third arg is `start + length` form, a named end-of-region constant (`VRAM_END`, `MODE_STATE_END + 1`, `STAGE1_SCAN_END`), a parameter named `end`, or a recognizable end-address expression (e.g., `VRAM_BASE + VRAM_BYTE_SIZE`, `LCD_VRAM_BASE + LCD_VRAM_BYTES`, `DISPLAY_BUF_START + DISPLAY_BUF_LEN`, `0xD00000, 0xD00080`).
- **SUSPICIOUS**: third arg is a bare small integer after `cpu.sp` (looks like a byte count), or a variable named `size`/`bytes`/`length` passed directly (length semantics), where the second arg is `cpu.sp` or `sp`.
- **UNKNOWN**: cannot determine from call alone. (None found — every remaining call matches one of the two patterns above.)

## SUSPICIOUS List (41 calls)

All of these pass a bare byte-count as the third argument when the correct call expects an END address. With `cpu.sp` typically at a high RAM address (e.g., `0xD1A872`) and the third argument being `12` or `6`, the fill range start > end, meaning **the sentinel is almost certainly NOT being written** — the probe's stack-seeding step silently no-ops.

### Pattern A: `mem.fill(0xFF, cpu.sp, 12)` — 35 calls

Proposed fix: `mem.fill(0xFF, cpu.sp, cpu.sp + 12)`

1. `probe-phase100b-dynamic-trace.mjs:109`
   ```
   mem.fill(0xFF, cpu.sp, 12);
   ```
   Context: stack reseed before dynamic trace. Fix → `mem.fill(0xFF, cpu.sp, cpu.sp + 12);`

2. `probe-phase101a-statusbar-hunt.mjs:112` — same pattern, same fix.
3. `probe-phase101b-angle-mode-hunt.mjs:113` — same.
4. `probe-phase125-full-text-decode.mjs:227` — same.
5. `probe-phase134-ram-dispatch-hunt.mjs:160` — (uses `0xff`) same fix.
6. `probe-phase154-trace.mjs:141` — same.
7. `probe-phase155-font.mjs:128` — same.
8. `probe-phase155b-font-path.mjs:129` — same.
9. `probe-phase159-sp-trace.mjs:122` — same.
10. `probe-phase161-sp-verify.mjs:127` — same.
11. `probe-phase161b-ix-trace.mjs:140` — same.
12. `probe-phase163-font-record.mjs:150` — same.
13. `probe-phase165-crash-trace.mjs:108` — same.
14. `probe-phase173-render-cluster.mjs:425` — same.
15. `probe-phase176-ix-analysis.mjs:283` — same.
16. `probe-phase179-restore-test.mjs:74` — `mem.fill(0xFF, cpu.sp, 12);` — same.
17. `probe-phase181-missing-block.mjs:129` — same.
18. `probe-phase181b-step-discrepancy.mjs:91` — same.
19. `probe-phase182-status-dots.mjs:202` — same.
20. `probe-phase183-ix-discovery.mjs:115` — same.
21. `probe-phase185-status-color.mjs:109` — same.
22. `probe-phase187-stage3-investigation.mjs:94` — same.
23. `probe-phase97a-500k-boot.mjs:168` — same.
24. `probe-phase97d-mode-var-readers.mjs:107` — same.
25. `probe-phase98a-font-hunt.mjs:186` — `mem.fill(0xff, cpu.sp, 12);` — same fix.
26. `probe-phase90-caller-direct.mjs:60` — prefixed by `cpu.sp = 0xD1A87E - 12;` then `mem.fill(0xFF, cpu.sp, 12);`. Fix → `mem.fill(0xFF, cpu.sp, cpu.sp + 12);` (equivalent to `mem.fill(0xFF, 0xD1A872, 0xD1A87E)`).
27. `probe-phase90b-parent-callers.mjs:51` — same prefix + same fix.
28. `probe-phase90c-combined-homescreen.mjs:48` — same.
29. `probe-phase90d-combined-fixed.mjs:45` — same.
30. `probe-phase90e-full-composite.mjs:51` — same.
31. `probe-phase91a-mode-bytes.mjs:81` — same.
32. `probe-phase91b-mem-trace.mjs:63` — same.
33. `probe-phase91c-seed-mode-buffer.mjs:69` — same.
34. `probe-phase92-find-populator.mjs:73` — same.
35. `probe-phase93-jt-cluster.mjs:57` — same.
36. `probe-phase87b-0a29ec-fixed.mjs:49` — same.
37. `probe-phase98a-decode-verify.mjs:55` — same.
38. `probe-phase99e-deep-decode.mjs:65` — same.
39. `probe-phase99e-per-cell.mjs:62` — same.
40. `probe-phase99e-stride-sweep.mjs:72` — same.

### Pattern B: `mem.fill(0xFF, cpu.sp, 6)` — 1 call

41. `probe-phase99c-poll-port.mjs:96`
    ```
    cpu.sp = STACK_RESET_TOP - 6;
    mem.fill(0xFF, cpu.sp, 6);
    cpu.write24(cpu.sp, 0x000000);
    ```
    Context: 6-byte stack seed (return addr + next return slot) before poll-port entry.
    Fix → `mem.fill(0xFF, cpu.sp, cpu.sp + 6);`

### Pattern C: `mem.fill(0xFF, cpu.sp, size)` inside helper — 1 call (counted in Pattern A bucket above? No — this is separate)

Correction: one additional SUSPICIOUS site not caught by the integer-literal regex:

42. `probe-phase100e-buffer-write-hook.mjs:87`
    ```
    function resetStack(cpu, mem, size = 3) {
      cpu.sp = STACK_RESET_TOP - size;
      mem.fill(0xFF, cpu.sp, size);
    }
    ```
    `size` here is a length, not an end. Fix → `mem.fill(0xFF, cpu.sp, cpu.sp + size);`

**Revised total SUSPICIOUS count: 42** (Pattern A: 40 + Pattern B: 1 + Pattern C: 1).

## UNKNOWN List

None. Every call inspected resolves to either SAFE or SUSPICIOUS.

## Notes on SAFE Classification (Spot Checks)

- `mem.fill(VRAM_SENTINEL_BYTE, VRAM_BASE, VRAM_END)` (e.g., `probe-phase128-06edac-render.mjs:119`, `probe-phase131-blit-analysis.mjs:303/508`) — end constant, SAFE.
- `mem.fill(0xaa, start, end)` inside `clearVramRows` helper in `probe-phase192-stage1-trace.mjs:74` — end param, SAFE.
- `mem.fill(0xff, cpu.sp, cpu.sp + bytes)` / `... + HELPER_STACK_BYTES` / `... + STACK_SEED_BYTES` / `... + stackBytes` / `... + PROBE_STACK_BYTES` / `... + 0x400` — all explicit `start + length` form, SAFE.
- `mem.fill(0x00, MODE_STATE_START, MODE_STATE_END + 1)` — end constant, SAFE.
- `mem.fill(0x4F, 0xD00000, 0xD00080)` in `probe-phase91b-mem-trace.mjs:229` — 0xD00080 is a plausible end (0x80 bytes from 0xD00000), SAFE.
- `fillSentinel(mem, start, bytes) { mem.fill(0xff, start, start + bytes); }` helper (used in many probes) — SAFE at the mem.fill level. Some of those callers pass raw byte counts to `fillSentinel`, which is correct for `fillSentinel` (it does the addition internally).

## Impact Assessment

Severity: **MEDIUM**. Every SUSPICIOUS call is a stack-sentinel seed that silently no-ops because `start > end`. The probes still run — stack reads succeed because the stack is zeroed RAM by default — but the intended `0xFF` sentinel for detecting stack underflow or crash-on-return is not present. This means:

- Probes that rely on sentinel-match detection in `cpu.read24(cpu.sp)` are evaluating zeros instead of `0xFFFFFF`.
- Golden regression `probe-phase99d-home-verify.mjs` is NOT in this list (its own calls use `cpu.sp + N` form).
- Active diagnostic probes (phase 181–195) are affected; some may silently misreport "clean return" vs "corrupted stack."

## Top 3 Most Likely Bugs (by impact on recent work)

1. **`probe-phase181-missing-block.mjs:129`** — `mem.fill(0xFF, cpu.sp, 12);` — Phase 181 missing-block hunt sentinel is not seeded; stack-underflow detection is broken for that investigation.
2. **`probe-phase185-status-color.mjs:109`** — `mem.fill(0xFF, cpu.sp, 12);` — Phase 185 status-color trace seeds; affects recent status-dot work (Phase 189/189b/189c all use correct form, but 185 is upstream).
3. **`probe-phase187-stage3-investigation.mjs:94`** — `mem.fill(0xFF, cpu.sp, 12);` — Stage-3 investigation entry point; any conclusions drawn about stack state are suspect until fixed.

Honorable mention: `probe-phase100e-buffer-write-hook.mjs:87` (Pattern C) is a shared helper — any probe that imports `resetStack` from this file inherits the bug. Worth grepping for imports.

## Next Steps (Out of Scope for Phase 197)

- Phase 198 should apply the 42 fixes listed above mechanically (start → `start + N` where N is the old third arg).
- After fix, re-run any affected probes whose conclusions depended on sentinel detection.
- Golden regression (`probe-phase99d-home-verify.mjs`) is unaffected — verify with a single re-run post-fix.
