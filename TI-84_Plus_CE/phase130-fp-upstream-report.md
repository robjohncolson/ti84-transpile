# Phase 130 — Upstream FP Op-Code Dispatch Trace

## Probe

`probe-phase130-fp-upstream.mjs` — traces the path from ParseInp to the FP dispatch table at 0x0686EF for both gcd(12,8) and min(3,7), comparing dispatch paths, dumping OPS contents, and checking for missing blocks.

## Key Findings

### 1. Identical upstream paths — A=0x00 for BOTH gcd and min

The PC traces leading to 0x0686EF are **identical** for both gcd(12,8) and min(3,7) — all 30 logged PCs match exactly. Both arrive via:

```
0x0663B7: CALL 0x0686EF   (the only active caller)
```

Registers at dispatch entry are identical in both cases:
- **A=0x00, F=0xB3** (same for both)
- BC=0x000000, DE=0xD00617, HL=0xD1A88A
- SP=0xD1A860, IX=0xD1A860, IY=0xD00080

**A=0x00 is NOT the operation code. The dispatch table at 0x0686EF never receives the raw op code in A.**

### 2. The dispatch at 0x0686EF is a category/index dispatch, not an op-code dispatch

Disassembly of 0x0686EF:
```
0x0686EF: LD D,0x08        ; D = dispatch index 0x08
0x0686F1: CP 0x1C          ; compare A against 0x1C
0x0686F3: JR Z,+0x13       ; if match, jump to handler
0x0686F5: LD D,0x09        ; D = dispatch index 0x09
0x0686F7: CP 0x20          ; compare A against 0x20
...
```

This table compares A against category codes (0x1C, 0x20, 0x21, etc.), NOT against raw operation codes like 0xDA/0xDB/0xD5. Since A=0x00 for all three functions, **none of the 16 comparisons match** and execution falls through to the catch-all error handler at `JP 0x06677B`.

### 3. gcd diverges AFTER the dispatch table, not before

gcd(12,8) and min(3,7) take the **same path** through the dispatch table (both fall through all 16 comparisons since A=0x00). The divergence happens AFTER:

- **min(3,7)**: Falls through → `JP 0x06677B` → JError → LCD busy-wait at 0x001221 (infinite loop, budget exhausted at 100K steps)
- **gcd(12,8)**: Also falls through the dispatch, but eventually returns via FAKE_RET in 3386 steps. **gcd hits missing block 0x06859B** which must be a handler reached through a different mechanism (not through the dispatch table match).

### 4. OPS contents differ correctly

At dispatch entry:
- **gcd**: OPS at 0xD3FFF8, 7 bytes: `D5 00 8A 9A 09 FE FF` (D5 = gcd op code)
- **min**: OPS at 0xD3FFF8, 7 bytes: `DA 00 8A 9A 09 FE FF` (DA = min op code)

The raw op code IS on OPS (byte 0). The remaining bytes (`00 8A 9A 09 FE FF`) are identical — these appear to be a return address (0x099A8A) and FAKE_RET sentinel bytes.

### 5. The upstream caller at 0x0663B7

The caller site (within the wider FP evaluation path):
```
0x0663A8: PUSH AF           ; save current A/F
0x0663A9: CALL 0x082AB6     ; (allocator/utility)
0x0663AD: LD A,(0xD0060E)   ; ← loads A from RAM slot 0xD0060E
0x0663B0: RET NC            ; conditional return
0x0663B1: AND 0x3F          ; mask to lower 6 bits
0x0663B3: CALL 0x06784F     ; (some helper)
0x0663B7: CALL 0x0686EF     ; ← THE dispatch call
```

**ROOT CAUSE**: A is loaded from **0xD0060E** (a RAM slot), masked with `AND 0x3F`, then passed to the dispatch table. The value at 0xD0060E is **0x00** at the time of the call, which means the upstream code that should populate 0xD0060E with the correct category byte is not doing so. The raw op code on OPS is never read by this path — instead, an earlier stage should have converted the op code to a category and stored it at 0xD0060E.

### 6. 0x06859B is MISSING from BLOCKS (confirmed)

Address 0x06859B is NOT in the transpiled BLOCKS table. No nearby blocks exist either. The disassembly shows it's a handler entry:
```
0x06859B: LD A,0x28         ; A = 0x28 (parameter)
0x06859D: CALL 0x0689DE     ; call FP handler with A=0x28
0x0685A0: RET               ; (0x06 0xC9 decodes as LD B,0xC9 in the disassembler, but the 0xC9 is actually RET)
```

This is part of a handler table at 0x068580-0x0685AA where each entry loads A with a specific value (0x00, 0x03, 0x06, 0x09, 0x0C, 0x0F, 0x28, 0x29, 0x2A) and calls/jumps to a common helper. The earlier entries (0x068582-0x068599) all jump backward via `JR` to the handler at 0x068582 (`CALL 0x096024`). 0x06859B is the first entry that calls a DIFFERENT handler (0x0689DE).

**Adding 0x06859B as a seed** would allow gcd(12,8) to reach this handler, which may fix the wrong result (OP1=0.588003 instead of expected 4).

### 7. The real dispatch mechanism

The upstream path at 0x0663AD reads `A = mem[0xD0060E] & 0x3F`. This suggests:

1. When the parser processes an operation token (0xD5/gcd, 0xDA/min, 0xDB/max), it pushes the raw op code onto OPS
2. A separate **category conversion** step should read OPS, map the raw op code to a category index, and store it at 0xD0060E
3. Then 0x0663B7 calls the dispatch table with the category in A
4. **This category conversion step is either missing or A=0x00 means "not a comparison op"**

Since gcd still eventually succeeds (returns via FAKE_RET), the fall-through from the dispatch table for A=0x00 is apparently NOT fatal for all operations — it may mean "not a comparison-type operation, try the next dispatcher." The JError path that min hits may be a secondary effect.

## Outcomes

| Finding | Status |
|---------|--------|
| Upstream caller of 0x0686EF | **0x0663B7** — CALL with A from mem[0xD0060E] & 0x3F |
| How A is derived | Loaded from RAM slot **0xD0060E**, masked to 6 bits. Value is 0x00 for both gcd and min |
| Divergence point gcd vs min | Paths are IDENTICAL through dispatch. Divergence is post-dispatch: gcd hits missing block 0x06859B and eventually returns; min falls to JError → LCD stall |
| 0x06859B in BLOCKS | **MISSING** — needs transpiler seed |
| OPS at dispatch | gcd: `[D5 ...]`, min: `[DA ...]` — raw op code correctly on OPS but never read by dispatch |
| RAM slot 0xD0060E | Key investigation target — whoever populates this determines the dispatch behavior |

## Next Steps

1. **Add seed at 0x06859B** — this is the gcd handler entry. Without it, gcd hits a missing block. May fix the wrong result (0.588003 → 4).
2. **Investigate 0xD0060E** — find what ROM code writes to this RAM slot. It should contain the op-code category but is 0x00. Search for `LD (0xD0060E),A` or equivalent stores in the ROM.
3. **Trace the CALL 0x06784F at 0x0663B3** — this runs between the A load and the dispatch call. It may be supposed to convert the raw OPS byte to the category stored in A, but might be reading from 0xD0060E after a stale/missing write.
4. **Check if 0x0663AD's RET NC gate is relevant** — the `RET NC` at 0x0663B0 could be causing an early return in some cases. Need to check what sets carry flag before this point.

## Artifacts

- `TI-84_Plus_CE/probe-phase130-fp-upstream.mjs`
- `TI-84_Plus_CE/phase130-fp-upstream-report.md`
