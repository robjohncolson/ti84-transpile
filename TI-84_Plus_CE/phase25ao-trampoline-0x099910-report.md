# Phase 25AO - 0x099910 Trampoline vs Direct ParseInp

## Scope

- Probe: `TI-84_Plus_CE/probe-phase25ao-trampoline-0x099910.mjs`
- ROM: `TI-84_Plus_CE/ROM.rom`
- Decoder: `TI-84_Plus_CE/ez80-decoder.js`
- Runtime: `TI-84_Plus_CE/cpu-runtime.js`
- Transpiler seed check: `scripts/transpile-ti84-rom.mjs` already includes `{ pc: 0x099910, mode: 'adl' }`, so the trampoline entry is lifted.

## Direct Answers

- `0x099910` is a one-instruction trampoline: `CALL 0x07FF81`, then execution falls straight into `ParseInp` at `0x099914`.
- `0x07FF81` pre-seeds `OP1` with a default descriptor. It does not change the final `2+3` result in the validated control path.
- The task-requested `userMem` token placement at `0xD1A881` does **not** reproduce the known-good direct ParseInp control. With that seed, both direct and trampoline runs stall at the step cap with `errNo=0x88` and `OP1=2.0`.
- Under the known-good Phase 25X-style scratch-token baseline at `0xD00800`, direct ParseInp still returns `OP1=5.0`, and the trampoline does the same thing with a 3-step overhead.

## Disassembly

### 0x099910 (trampoline)

```text
0x099910: CD 81 FF 07       call 0x07FF81
0x099914: AF                xor a
0x099915: 32 BE 22 D0       ld (0xD022BE), a
0x099919: CD 81 9B 09       call 0x099B81
0x09991D: FD CB 1F 9E       res 3, (iy+31)
```

The only code at `0x099910..0x099913` is the `CALL 0x07FF81`. `ParseInp` itself starts at `0x099914`.

### 0x07FF81 (pre-ParseInp setup)

```text
0x07FF81: 21 23 00 00       ld hl, 0x000023
0x07FF85: 3E 05             ld a, 0x05
0x07FF87: 32 F8 05 D0       ld (0xD005F8), a
0x07FF8B: 18 0C             jr 0x07FF99
0x07FF8D: 21 40 00 00       ld hl, 0x000040
0x07FF91: 3E 03             ld a, 0x03
0x07FF93: 18 F2             jr 0x07FF87
0x07FF95: 21 01 2A 00       ld hl, 0x002A01
0x07FF99: CD 40 C9 04       call 0x04C940
0x07FF9D: 22 F9 05 D0       ld (0xD005F9), hl
0x07FFA1: C9                ret
```

### 0x04C940 (helper used by 0x07FF81)

```text
0x04C940: F5                push af
0x04C941: AF                xor a
0x04C942: 22 D7 2A D0       ld (0xD02AD7), hl
0x04C946: 32 D9 2A D0       ld (0xD02AD9), a
0x04C94A: 2A D7 2A D0       ld hl, (0xD02AD7)
0x04C94E: F1                pop af
0x04C94F: C9                ret
```

### What 0x07FF81 does

Entering at `0x07FF81` writes:

- `A = 0x05`
- `HL = 0x000023`
- `OP1[0] = 0x05`
- `OP1[1..3] = 0x000023`

So the trampoline seeds `OP1` with a default descriptor before `ParseInp` starts. The alternate internal entries at `0x07FF8D` and `0x07FF95` select different `(A, HL)` pairs and then share the same tail.

## Probe Matrix

I ran two seed families:

1. `requested-userMem`
   - Matches the task text literally: `MEM_INIT` first, tokenized `2+3` at `0xD1A881`, `begPC=curPC=0xD1A881`, `endPC=0xD1A885`, minimal 6-byte manual error frame.
2. `validated-scratch`
   - Matches the committed known-good control path used in the current `Phase 25X/25Z` probes: tokenized `2+3` at `0xD00800`, `endPC` on the final token, same `MEM_INIT` and manual error frame.

## Results

### Seed family: requested-userMem

Post-`MEM_INIT` pointers for both runs:

```text
tempMem=0xD1A881 FPSbase=0xD1A881 FPS=0xD1A881 OPBase=0xD3FFFF OPS=0xD3FFFF pTemp=0xD3FFFF progPtr=0xD3FFFF
```

Seeded parser state:

```text
begPC=0xD1A881 curPC=0xD1A881 endPC=0xD1A885 errSP=<manual 6-byte frame>
```

| Metric | Direct `0x099914` | Trampoline `0x099910` |
| --- | --- | --- |
| Termination | `max_steps` | `max_steps` |
| Step budget | `1,500,000` | `1,500,000` |
| Final PC | `0x061DBA` | `0x061DBA` |
| `errNo` | `0x88` | `0x88` |
| `OP1` bytes | `00 80 20 00 00 00 00 00 00` | `00 80 20 00 00 00 00 00 00` |
| `OP1` decoded | `2.0` | `2.0` |
| `0x07FF81` visited | `false` | `true` |

After the stalled run, both paths converge to the same state:

```text
FPS=0xD1A88A OPS=0xD3FFF6 curPC=0xD1A884 endPC=0xD1A885 errNo=0x88
```

This strongly suggests the behavior change comes from placing the token stream at `userMem` itself, not from the `0x099910` trampoline.

### Seed family: validated-scratch

Seeded parser state:

```text
begPC=0xD00800 curPC=0xD00800 endPC=0xD00803 errSP=<manual 6-byte frame>
```

| Metric | Direct `0x099914` | Trampoline `0x099910` |
| --- | --- | --- |
| Termination | `return_hit` | `return_hit` |
| Steps | `918` | `921` |
| Final PC | `0x7FFFFE` | `0x7FFFFE` |
| `errNo` | `0x8D` | `0x8D` |
| `OP1` bytes | `00 80 50 00 00 00 00 00 00` | `00 80 50 00 00 00 00 00 00` |
| `OP1` decoded | `5.0` | `5.0` |
| `0x07FF81` visited | `false` | `true` |

This is the clean apples-to-apples comparison for the previously validated direct call. The trampoline adds exactly 3 steps and does not change the result.

## Interpretation

1. `0x099910` itself is benign for this expression.
   The validated baseline still returns `5.0`, and the trampoline path differs only by the three extra steps needed to execute `CALL 0x07FF81` / helper / `RET`.

2. `0x07FF81` is a default-descriptor initializer.
   It seeds `OP1` before parsing, but `ParseInp("2+3")` overwrites `OP1` completely on the successful path.

3. The large regression is tied to token-buffer placement.
   When the token stream is placed at `0xD1A881`, the same address `MEM_INIT` used for `tempMem/FPSbase/FPS/newDataPtr`, both direct and trampoline runs collapse to the same `errNo=0x88`, `OP1=2.0`, `finalPc=0x061DBA` state.

## Conclusion

If the question is "does calling `0x099910` instead of `0x099914` change the result?", the answer is:

- **No**, on the validated control path. Direct `ParseInp` returns `5.0` in 918 steps; the trampoline also returns `5.0`, in 921 steps.
- The failing `userMem` result is not specific to the trampoline. Direct and trampoline behave the same there, so the destabilizing factor is the `userMem` token placement, not the `0x099910 -> 0x07FF81` pre-parse setup.
