# Phase 622: 0x08F7D6 Size Post-Processor

Probe: `probe-phase622-08f7d6-size-postprocessor.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase622-08f7d6-size-postprocessor.mjs`  
Exit: 0

## Summary

- ★★★ `0x08F7D6` is the normal-path token-size post-processor called from `0x0907DB` after token metadata lookup. It classifies the current token byte in A and returns either a fixed small-token adjustment (`A=0x04` or `A=0x06`) plus the Z/NZ flag state consumed by the caller.
- ★★★ The predicate helpers are tiny compare routines: `0x08E68A` tests `0x28`/`0x29` and `0x08E690` tests `0x7B`/`0x7D`.
- ★★★ In the live keypress trace, `0x08F7D6` was observed 10 times. The sampled caller returns at `0x0907F8` were all NZ, so `0x0907DB` took `LD A,B` at `0x0907FC` 8 times in the sampled block-entry events.
- ★★ Direct callers are only `0x08F75A` and `0x0907F4`; `0x0907DB` itself has 3 callers (`0x08F698`, `0x08FB5D`, `0x0903F3`).

## Static Decode

### Caller `0x0907DB`

```text
0x0907DB  CALL 0x0A2B53
0x0907DF  CALL 0x090992
0x0907E3  JR Z,0x0907FE
0x0907E5  RES 2,(IY+0x32)
0x0907E9  CALL 0x026024
0x0907ED  LD DE,0
0x0907F1  LD E,(HL)
0x0907F2  ADD HL,DE
0x0907F3  LD A,(HL)
0x0907F4  CALL 0x08F7D6
0x0907F8  JR NZ,0x0907FC
0x0907FA  ADD A,B
0x0907FB  RET
0x0907FC  LD A,B
0x0907FD  RET
0x0907FE  LD A,(HL)
0x0907FF  ADD A,A
0x090800  LD B,A
0x090801  ADD A,A
0x090802  ADD A,B
0x090803  ADD A,A
0x090804  RET
```

Interpretation: `0x0907DB` has two size modes. If `D02A28`/`0x090992` sends it to `0x0907FE`, it computes `A = (HL byte) * 12`. Otherwise it fetches token metadata, calls `0x08F7D6`, then either returns `B` directly on NZ or `A+B` on Z.

### Post-Processor `0x08F7D6`

```text
0x08F7D6  CALL 0x08E68A
0x08F7DA  JR NZ,0x08F7DF
0x08F7DC  LD A,0x06
0x08F7DE  RET
0x08F7DF  CALL 0x08E690
0x08F7E3  LD A,0x04
0x08F7E5  RET
```

Predicate helpers:

```text
0x08E68A  CP 0x28
0x08E68C  RET Z
0x08E68D  CP 0x29
0x08E68F  RET

0x08E690  CP 0x7B
0x08E692  RET Z
0x08E693  CP 0x7D
0x08E695  RET
```

So `0x08F7D6` treats token bytes `0x28`/`0x29` as the `A=6, Z=1` class. Other tokens fall through to the `0x7B`/`0x7D` check, then return `A=4` with that predicate's final Z/NZ result. The live trace exercised non-matching tokens (`A=0x1A`, `A=0x31`), so the caller observed NZ and returned `B` directly.

## Dynamic Trace

The probe reused the established boot/init/paint/key path and halted cleanly:

```text
termination=halt steps=332856 lastPc=0x0019B5 pass=true
counts=0x08F7D6:10 0x08F7DA:10 0x08F7DF:10 0x0907F8:8 0x0907FC:8
phase622: PASS -- 0x08F7D6 observed 10x; 0x0907F8 returned with Z=0 NZ=8 in sampled events
```

Representative events:

```text
block=6104 pc=0x08F7D6 A=0x1A B=0x06 F=0x00 Z=0 D02A28=0x01 D02A29=0x013A
block=6112 pc=0x0907F8 A=0x04 B=0x06 F=0x9B Z=0
block=6113 pc=0x0907FC A=0x04 B=0x06 F=0x9B Z=0

block=6521 pc=0x08F7D6 A=0x31 B=0x08 F=0x08 Z=0 D02A28=0x01 D02A29=0x013A
block=6529 pc=0x0907F8 A=0x04 B=0x08 F=0xB3 Z=0
block=6530 pc=0x0907FC A=0x04 B=0x08 F=0xB3 Z=0
```

## Implications

The session-621 open question is resolved: the `0x0907DB` post-process split is not opaque state logic. It is a small token-class size adjustment. For ordinary tokens observed in the keypress path, the post-processor leaves NZ set, and `0x0907DB` returns `B` directly. For the special `0x28`/`0x29` class, it returns with Z and the caller returns `B+6`; for the `0x7B`/`0x7D` class, it returns with Z and the caller returns `B+4`.

No runtime, transpiler, or browser files were changed, so the golden regression was not required for this tick.
