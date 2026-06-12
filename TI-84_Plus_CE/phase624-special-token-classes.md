# Phase 624: Special Token Classes in 0x08F7D6

Probe: `probe-phase624-special-token-classes.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase624-special-token-classes.mjs`  
Exit: 0

## Summary

- ★★★★ Dynamically executed `0x08F7D6` for all four special token bytes from the phase622 static decode: `0x28`, `0x29`, `0x7B`, and `0x7D`.
- ★★★★ Confirmed the caller contract with `B=0x08`: `0x28`/`0x29` return `A=0x06,Z=1` so `0x0907DB` would return `B+6=0x0E`; `0x7B`/`0x7D` return `A=0x04,Z=1` so the caller would return `B+4=0x0C`.
- ★★ Control token `0x31` returns `A=0x04,Z=0`, matching the ordinary path where `0x0907DB` returns `B` directly.

## Static Window

```text
0x08F7D6 CD 8A E6 08    tag=call target=583306 fallthrough=587738 terminates=true mode=adl modePrefix=null
0x08F7DA 20 03          tag=jr-conditional condition=nz target=587743 fallthrough=587740 terminates=true mode=adl modePrefix=null
0x08F7DC 3E 06          tag=ld-reg-imm dest=a value=6 mode=adl modePrefix=null
0x08F7DE C9             tag=ret terminates=true mode=adl modePrefix=null
0x08F7DF CD 90 E6 08    tag=call target=583312 fallthrough=587747 terminates=true mode=adl modePrefix=null
0x08F7E3 3E 04          tag=ld-reg-imm dest=a value=4 mode=adl modePrefix=null
0x08F7E5 C9             tag=ret terminates=true mode=adl modePrefix=null
0x08F7E6 11 02 00 00    tag=ld-pair-imm pair=de value=2 mode=adl modePrefix=null
0x08E68A FE 28          tag=alu-imm op=cp value=40 mode=adl modePrefix=null
0x08E68C C8             tag=ret-conditional condition=z fallthrough=583309 terminates=true mode=adl modePrefix=null
0x08E68D FE 29          tag=alu-imm op=cp value=41 mode=adl modePrefix=null
0x08E68F C9             tag=ret terminates=true mode=adl modePrefix=null
0x08E690 FE 7B          tag=alu-imm op=cp value=123 mode=adl modePrefix=null
0x08E692 C8             tag=ret-conditional condition=z fallthrough=583315 terminates=true mode=adl modePrefix=null
0x08E693 FE 7D          tag=alu-imm op=cp value=125 mode=adl modePrefix=null
0x08E695 C9             tag=ret terminates=true mode=adl modePrefix=null
```

## Dynamic Results

| Token | Class | Termination | Steps | Final A | Final Z | Caller-size result (`B=0x08`) | Pass |
|---:|---|---|---:|---:|---:|---:|---|
| 0x28 | open paren class | missing_block @ 0x400000 | 4 | 0x06 | 1 | 0x0E | yes |
| 0x29 | close paren class | missing_block @ 0x400000 | 5 | 0x06 | 1 | 0x0E | yes |
| 0x7B | left brace class | missing_block @ 0x400000 | 7 | 0x04 | 1 | 0x0C | yes |
| 0x7D | right brace class | missing_block @ 0x400000 | 8 | 0x04 | 1 | 0x0C | yes |
| 0x31 | ordinary control token | missing_block @ 0x400000 | 8 | 0x04 | 0 | 0x08 | yes |

## Event Paths

### 0x28 open paren class

```text
0x08F7D6 A=0x28 B=0x08 F=0x00 Z=0
0x08E68A A=0x28 B=0x08 F=0x00 Z=0
0x08F7DA A=0x28 B=0x08 F=0x42 Z=1
0x08F7DC A=0x28 B=0x08 F=0x42 Z=1
```

### 0x29 close paren class

```text
0x08F7D6 A=0x29 B=0x08 F=0x00 Z=0
0x08E68A A=0x29 B=0x08 F=0x00 Z=0
0x08E68D A=0x29 B=0x08 F=0x02 Z=0
0x08F7DA A=0x29 B=0x08 F=0x42 Z=1
0x08F7DC A=0x29 B=0x08 F=0x42 Z=1
```

### 0x7B left brace class

```text
0x08F7D6 A=0x7B B=0x08 F=0x00 Z=0
0x08E68A A=0x7B B=0x08 F=0x00 Z=0
0x08E68D A=0x7B B=0x08 F=0x02 Z=0
0x08F7DA A=0x7B B=0x08 F=0x02 Z=0
0x08F7DF A=0x7B B=0x08 F=0x02 Z=0
0x08E690 A=0x7B B=0x08 F=0x02 Z=0
0x08F7E3 A=0x7B B=0x08 F=0x42 Z=1
```

### 0x7D right brace class

```text
0x08F7D6 A=0x7D B=0x08 F=0x00 Z=0
0x08E68A A=0x7D B=0x08 F=0x00 Z=0
0x08E68D A=0x7D B=0x08 F=0x02 Z=0
0x08F7DA A=0x7D B=0x08 F=0x02 Z=0
0x08F7DF A=0x7D B=0x08 F=0x02 Z=0
0x08E690 A=0x7D B=0x08 F=0x02 Z=0
0x08E693 A=0x7D B=0x08 F=0x02 Z=0
0x08F7E3 A=0x7D B=0x08 F=0x42 Z=1
```

### 0x31 ordinary control token

```text
0x08F7D6 A=0x31 B=0x08 F=0x00 Z=0
0x08E68A A=0x31 B=0x08 F=0x00 Z=0
0x08E68D A=0x31 B=0x08 F=0x1A Z=0
0x08F7DA A=0x31 B=0x08 F=0x1A Z=0
0x08F7DF A=0x31 B=0x08 F=0x1A Z=0
0x08E690 A=0x31 B=0x08 F=0x1A Z=0
0x08E693 A=0x31 B=0x08 F=0xB3 Z=0
0x08F7E3 A=0x31 B=0x08 F=0xB3 Z=0
```

## Interpretation

This closes the phase623 priority to exercise the special classes dynamically. The phase622 static interpretation is correct: `0x08F7D6` does not compute a full size by itself; it returns an adjustment in A and leaves Z/NZ as the caller selector. `0x0907DB` then returns either `B+6`, `B+4`, or `B` depending on that flag state.

No runtime, transpiler, or browser files were changed, so the golden regression was not required for this probe/docs-only tick.
