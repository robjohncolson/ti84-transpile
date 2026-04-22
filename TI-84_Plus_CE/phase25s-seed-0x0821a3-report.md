# Phase 25S - Seed 0x0821A3 Report

## Scope

- Disassembled `0x0821a3..0x082222` from `ROM.rom` in ADL mode using `TI-84_Plus_CE/ez80-decoder.js`.
- Inspected current seed sources in `scripts/transpile-ti84-rom.mjs` and `TI-84_Plus_CE/cemu-trace-seeds.txt`.
- Reviewed existing dynamic evidence in `TI-84_Plus_CE/phase25r-createreal-errsp-report.md` and `logs/auto-session-20260422-0300.log`.
- This subagent did not rerun `node scripts/transpile-ti84-rom.mjs`, `probe-phase25r-createreal-errsp.mjs`, or `probe-phase99d-home-verify.mjs` because the parent task wrapper explicitly required exiting after patches and forbade verification/test commands.

## Findings

- `0x0821a3` itself is only a two-byte epilogue:
  - `pop hl`
  - `ret`
- The 128-byte window after it contains two more helpers:
  - `0x0821a5..0x0821b8`: a small return-value filter on `A`.
  - `0x0821b9..0x082222`: the real VAT/data-move helper that updates `0xD02587`, `0xD0258A`, `0xD0258D`, and `0xD025A0`, copies bytes with repeated `ldd` / `lddr`, then calls `0x04c990` and `0x082739`.
- The prior Phase 25R trace already executed `0x0821a3` and only failed after the `ret` transferred control to `0xffffff`. That points to a bad return target on the stack, not a missing ROM block at `0x0821a3`.

## Was The Seed Needed?

- `0x0821a3` is already present in `TI-84_Plus_CE/cemu-trace-seeds.txt`.
- The current worktree of `scripts/transpile-ti84-rom.mjs` already contains a hardcoded Phase 25S seed entry for `0x0821a3`.
- Because the Phase 25R CreateReal probe reached `0x0821a3` before failing, the block was already present in the transpiled image used for that run.
- Conclusion: under the current seed-loading setup, the hardcoded Phase 25S seed is redundant. It is only a belt-and-suspenders anchor in case the trace-seed file changes or is regenerated without this address.

## Disassembly

```text
0x0821a3: e1                pop hl
0x0821a4: c9                ret
0x0821a5: 3a fd 05 d0       ld a, (0xd005fd)
0x0821a9: 18 07             jr 0x0821b2
0x0821ab: 78                ld a, b
0x0821ac: 18 04             jr 0x0821b2
0x0821ae: cd a3 c8 04       call 0x04c8a3
0x0821b2: b7                or a
0x0821b3: c8                ret z
0x0821b4: fe d0             cp 0xd0
0x0821b6: d8                ret c
0x0821b7: af                xor a
0x0821b8: c9                ret
0x0821b9: f5                push af
0x0821ba: 2a 8a 25 d0       ld hl, (0xd0258a)
0x0821be: c5                push bc
0x0821bf: e5                push hl
0x0821c0: 09                add hl, bc
0x0821c1: 22 8a 25 d0       ld (0xd0258a), hl
0x0821c5: ed 42             sbc hl, bc
0x0821c7: eb                ex de, hl
0x0821c8: 2a 8d 25 d0       ld hl, (0xd0258d)
0x0821cc: ed 52             sbc hl, de
0x0821ce: e5                push hl
0x0821cf: f5                push af
0x0821d0: 19                add hl, de
0x0821d1: 09                add hl, bc
0x0821d2: 22 8d 25 d0       ld (0xd0258d), hl
0x0821d6: 2b                dec hl
0x0821d7: e5                push hl
0x0821d8: d1                pop de
0x0821d9: ed 42             sbc hl, bc
0x0821db: f1                pop af
0x0821dc: c1                pop bc
0x0821dd: 28 18             jr z, 0x0821f7
0x0821df: ed a8             ldd
0x0821e1: ed a8             ldd
0x0821e3: ed a8             ldd
0x0821e5: ed a8             ldd
0x0821e7: ed a8             ldd
0x0821e9: ed a8             ldd
0x0821eb: ed a8             ldd
0x0821ed: ed a8             ldd
0x0821ef: ed a8             ldd
0x0821f1: 78                ld a, b
0x0821f2: b1                or c
0x0821f3: c2 df 21 08       jp nz, 0x0821df
0x0821f7: d1                pop de
0x0821f8: c1                pop bc
0x0821f9: f1                pop af
0x0821fa: 28 39             jr z, 0x082235
0x0821fc: 2a 87 25 d0       ld hl, (0xd02587)
0x082200: 09                add hl, bc
0x082201: 22 87 25 d0       ld (0xd02587), hl
0x082205: 2a a0 25 d0       ld hl, (0xd025a0)
0x082209: e5                push hl
0x08220a: eb                ex de, hl
0x08220b: ed 52             sbc hl, de
0x08220d: 28 27             jr z, 0x082236
0x08220f: c5                push bc
0x082210: e5                push hl
0x082211: c1                pop bc
0x082212: 19                add hl, de
0x082213: 2b                dec hl
0x082214: ed 5b 8a 25 d0    ld de, (0xd0258a)
0x082219: 1b                dec de
0x08221a: ed b8             lddr
0x08221c: eb                ex de, hl
0x08221d: c1                pop bc
0x08221e: cd 90 c9 04       call 0x04c990
0x082222: cd 39 27 08       call 0x082739
```

## CreateReal Probe Result

- Not rerun in this subagent.
- Latest available CreateReal errSP result remains the existing Phase 25R report:
  - `result=BAD_FAIL`
  - `termination=missing_block`
  - `finalPc=0xffffff`
  - recent PCs ended with `... 0x08281f 0x08282d 0x0821a3 0xffffff`
- Inference from the disassembly: seeding `0x0821a3` alone is unlikely to change the outcome, because the old run already executed this block and then returned to `0xffffff`.

### Available Console Snippet

```text
CreateReal missed both sentinels; finalPc=0xffffff term=missing_block
recent PCs: ... 0x08281f 0x08282d 0x0821a3 0xffffff
result=BAD_FAIL
```

## Golden Regression

- Not rerun in this subagent.
- Latest available project log before this task, `logs/auto-session-20260422-0300.log`, recorded:

```text
Golden regression: 26/26 PASS, no breakage.
```
