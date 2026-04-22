# Phase 25K - ParseInp Probe

## Goal

Attempt to call `ParseInp` at `0x099914` after cold-boot OS init, feed it tokenized `2+3`, and verify whether OP1 becomes `5.0`.

## Setup

- Cold-boot + `postInitState` copied from `probe-phase25i-fpadd.mjs`.
- Calling-convention finding: The first 32 bytes of ParseInp do not read HL/DE/BC for an input pointer. They zero 0xD022BE and call internal helpers, so the probe seeds the global parser pointer slots. HL is primed to userMem defensively, but the observed contract is pointer-driven.
- First 32 ROM bytes at `0x099914`: `af 32 be 22 d0 cd 81 9b 09 fd cb 1f 9e cd 81 9b 09 cd 18 9b 09 c1 cd ed be 09 01 8a 9a 09 cd ed`
- `?tempMem` in `ti84pceg.inc` is `0xd02587`, but that address is used as a 24-bit pointer slot. The actual seeded token buffer is `?userMem = 0xd1a881`.
- HL was primed to `0xd1a881` defensively, but the observed setup is driven by the global pointer slots listed below.

## Input Bytes Seeded

- Buffer @ `0xd1a881`: `32 70 33 3f`
- `tempMem` / `FPSbase` / `FPS` / `newDataPtr`: `0xd1a881` / `0xd1a881` / `0xd1a881` / `0xd1a881`
- Parser scan pointers `0xD02317 / 0xD0231A / 0xD0231D`: `0xd1a881` / `0xd1a881` / `0xd1a884`
- Saved slots `0xD007FA / 0xD008E0`: `0xd1a881` / `0xd1a881`

## Observed

```text
=== Phase 25K: ParseInp probe (tokenized 2+3, expect OP1=5.0) ===
boot: steps=3025 term=halt lastPc=0x0019b5
finding: The first 32 bytes of ParseInp do not read HL/DE/BC for an input pointer. They zero 0xD022BE and call internal helpers, so the probe seeds the global parser pointer slots. HL is primed to userMem defensively, but the observed contract is pointer-driven.
head bytes @ 0x099914: af 32 be 22 d0 cd 81 9b 09 fd cb 1f 9e cd 81 9b 09 cd 18 9b 09 c1 cd ed be 09 01 8a 9a 09 cd ed
input bytes @ 0xd1a881: [32 70 33 3f]
pointers: temp=0xd1a881 fpsbase=0xd1a881 fps=0xd1a881 new=0xd1a881
scan ptrs: base=0xd1a881 cur=0xd1a881 end=0xd1a884 savedHL=0xd1a881 savedSP=0xd1a881
OP1 pre-call [80 80 10 00 00 00 00 00 00]  (sentinel -1)
HL before call: 0xd1a881
call done: steps=200000 term=max_steps lastPc=0x084723
OP1 post-call [80 80 10 00 00 00 00 00 00]
got=-1  expected=5  diff=6
finalPc=0x084723  blocks=200000  recent=0x084723 0x084711 0x082be2 0x084716 0x08471b 0x084723 0x084711 0x082be2 0x084716 0x08471b
FAIL
```

## Observed OP1 Bytes

`80 80 10 00 00 00 00 00 00`

## Result

- **FAIL**
- returnHit=false
- got=-1
- expected=5
- diff=6
- termination=max_steps
- finalPc=0x084723

## Surprises

ParseInp did not return cleanly to the fake return address under this minimal setup. Termination=max_steps, finalPc=0x084723, blocks=200000. The head disassembly suggests a fixed-global parser contract, and 0xD02587 is a pointer cell (`tempMem`), not the token buffer itself.
