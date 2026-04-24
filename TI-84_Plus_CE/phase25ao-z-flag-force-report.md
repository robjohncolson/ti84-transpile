# Phase 25AO - Forcing Z At POP AF In The 0x0585E9 ENTER Path

Generated: 2026-04-24

## Summary

- The `pop af` consumed by `0x058630 jr nz, 0x05866A` restores the `AF` saved at `0x058621 push af`.
- That saved `AF` comes from `call 0x058212` at `0x05861D`.
- The control bit that drives `Z` versus `NZ` for that saved `AF` is `bit 5,(iy+68)` at `0x0800B8`.
- With `IY=0xD00080`, `iy+68` is RAM byte `0xD000C4`.
- `Z=1` when `mem[0xD000C4] & 0x20` is clear. `Z=0` when that bit is set.
- The new probe therefore clears bit 5 at `0xD000C4` before running the ENTER handler.

## Backward Disassembly From 0x05862B

```text
0x05861C  FB                   ei
0x05861D  CD 12 82 05          call 0x058212
0x058621  F5                   push af
0x058622  CD AE 81 05          call 0x0581AE
0x058626  CD 11 92 09          call 0x099211
0x05862A  FB                   ei
0x05862B  CD CB 21 09          call 0x0921CB
0x05862F  F1                   pop af
0x058630  20 38                jr nz, 0x05866A
0x058632  3A 0B 1D D0          ld a, (0xD01D0B)
0x058636  B7                   or a
0x058637  CA 65 8C 05          jp z, 0x058C65
```

`0x058621 push af` is the save site consumed later by `0x05862F pop af`, so the relevant flags are whatever `0x058212` returns.

## Helper Chain That Feeds PUSH AF

```text
0x058212  CD B8 00 08          call 0x0800B8
0x058216  28 05                jr z, 0x05821D
0x058218  CD 2B 14 09          call 0x09142B
0x05821C  C9                   ret
0x05821D  CD E3 E3 05          call 0x05E3E3
0x058221  C9                   ret

0x0800B8  FD CB 44 6E          bit 5, (iy+68)
0x0800BC  C9                   ret
```

This is the first exact flag-setting instruction on the `0x058212` path. It tests bit 5 of `IY+68`, which maps to `0xD000C4`.

## Exact Z/NZ Condition

- Tested byte: `0xD000C4`
- Tested bit: `0x20`
- Exact instruction: `0x0800B8  FD CB 44 6E  bit 5, (iy+68)`
- If bit 5 is clear, the `BIT` instruction sets `Z=1`.
- If bit 5 is set, the `BIT` instruction clears `Z`.

For the direct seeded ENTER run used here, that bit is also the practical lever for the final `AF` saved at `0x058621`:

- `IY+68 = 0x00` or explicitly clearing bit 5 produced `F=0x42` at `0x058621` (`Z=1`).
- Setting bit 5 in `IY+68` produced `F=0xB3` at `0x058621` (`Z=0`).
- Toggling bit 5 in `IY+69` did not change the observed `AF` at `0x058621` in the same seeded check.

That is the reason the probe targets `0xD000C4`, not `0xD000C5` and not `0xD01D0B`.

## Expected Z-Side Path

Once `pop af` restores `Z=1`, the second-pass handler should avoid the `jr nz, 0x05866A` diversion and continue through:

```text
0x058632  ld a, (0xD01D0B)
0x058636  or a
0x058637  jp z, 0x058C65
...
0x058693  sub a
...
0x0586E3  call 0x099910
```

So forcing `Z` only solves the `pop af` branch. The later `numLastEntries` test at `0xD01D0B` still decides whether control takes the `0x058C65` leg that should rejoin the common parser setup path.

## What The New Probe Tests

`probe-phase25ao-z-flag-force.mjs` does the following:

- cold boot, kernel init, post-init, and `MEM_INIT`
- seeds the Phase 25AN-style cx table and then forces live `cxCurApp` to `0x00`
- seeds an error frame and tokenized `2+3` at `userMem`
- clears bit 5 at `0xD000C4` to force `Z` at the `push af` / `pop af` branch pair
- runs `0x0585E9` directly with `A=0x05` and a 500K step budget
- monitors `0x099910` and `0x099914`
- reports:
  - steps taken
  - whether `push af`, `pop af`, `ParseCmd`, and `ParseInp` were hit
  - `AF` immediately before `0x058621 push af`
  - `OP1` bytes and decoded value
  - `errNo`
  - unique PC count plus a first-seen sample

The probe does not modify `cpu-runtime.js`, `peripherals.js`, the transpiler, or any existing probe files.
