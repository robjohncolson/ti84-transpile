# Phase 142 — FD-Prefix Transpiler Bug Investigation

## Bottom Line

The runaway LDIR at step 691 is caused by a **transpiler decoder bug**. The `decodeDDFD()` fallback treats `FD 07`, `FD 17`, and `FD 27` as NOP-prefixed plain opcodes (RLCA, RLA, DAA), but they are actually **eZ80 indexed 24-bit pair loads** — 3-byte instructions that load register pairs from (IY+d).

This was already documented in **Phase 100F** (phase100f-report.md) via cross-check against the Zilog eZ80 manual (UM0077), but the decoder fix was never applied.

## Missing eZ80 Opcodes

| Opcode | Instruction | Description |
|--------|-------------|-------------|
| `FD 07 d` | `LD BC, (IY+d)` | Load BC from 24-bit value at (IY+d) |
| `FD 17 d` | `LD DE, (IY+d)` | Load DE from 24-bit value at (IY+d) |
| `FD 27 d` | `LD HL, (IY+d)` | Load HL from 24-bit value at (IY+d) |
| `DD 07 d` | `LD BC, (IX+d)` | Load BC from 24-bit value at (IX+d) |
| `DD 17 d` | `LD DE, (IX+d)` | Load DE from 24-bit value at (IX+d) |
| `DD 27 d` | `LD HL, (IX+d)` | Load HL from 24-bit value at (IX+d) |

These are 3-byte instructions (prefix + opcode + displacement), but the decoder treats them as 2-byte (prefix consumed as NOP + plain opcode). This shifts ALL subsequent instruction boundaries in the affected block.

## Current (Incorrect) Decode at 0x00285F

```asm
00285f: fd e5            PUSH IY           ← correct
002861: fd 21 03 00 00   LD IY, 0x000003   ← correct
002866: fd 39            ADD IY, SP        ← correct
002868: fd 27            DAA               ← WRONG (should be LD HL, (IY+6), 3 bytes)
00286a: 06 01            LD B, 0x01        ← WRONG (misaligned)
00286c: 00 00 00         NOP NOP NOP       ← WRONG (misaligned)
00286f: ed 42            SBC HL, BC        ← happens to be correct by coincidence
002871: 28 14            JR Z, 0x002887    ← correct
002873: fd 17            RLA               ← WRONG (should be LD DE, (IY+3), 3 bytes)
002875: 03               INC BC            ← WRONG (misaligned)
...
00287d: fd 07            RLCA              ← WRONG (should be LD BC, (IY+6), 3 bytes)
00287f: 06 0b            LD B, 0x0B        ← WRONG (misaligned)
...
002885: ed b0            LDIR              ← correct opcode but wrong BC value
```

## Correct Decode (from Phase 100F / eZ80 Manual)

```asm
00285f: fd e5                push iy
002861: fd 21 03 00 00       ld iy, 0x000003
002866: fd 39                add iy, sp       ; IY = frame pointer
002868: fd 27 06             ld hl, (iy+6)    ; HL = length (from stack param)
00286b: 01 00 00 00          ld bc, 0x000000
00286f: ed 42                sbc hl, bc       ; test if length == 0
002871: 28 14                jr z, 0x002887   ; skip if zero
002873: fd 17 03             ld de, (iy+3)    ; DE = destination (from stack param)
002876: af                   xor a            ; A = 0
002877: 12                   ld (de), a       ; seed first byte with 0
002878: 2b                   dec hl
002879: ed 42                sbc hl, bc       ; test if length == 1
00287b: 28 0a                jr z, 0x002887   ; skip LDIR if only 1 byte
00287d: fd 07 06             ld bc, (iy+6)    ; BC = length (reload from stack)
002880: 0b                   dec bc           ; BC = length - 1
002881: 13                   inc de           ; DE = dest + 1
002882: fd 27 03             ld hl, (iy+3)    ; HL = destination (source for LDIR)
002885: ed b0                ldir             ; copy dest[0] across dest[1..length-1]
002887: fd e1                pop iy
002889: c9                   ret
```

## What The Function Actually Does

This is a **bounded bzero** (zero-fill) helper:

1. Read `length` from stack at (IY+6) = 0x000448
2. If zero, return
3. Read `dest` from stack at (IY+3) = 0xD13FD8
4. Write `0x00` to `dest[0]`
5. If length == 1, done
6. Reload `BC = length - 1`, `DE = dest + 1`, `HL = dest`
7. `LDIR` copies the seeded zero byte across the remaining `length - 1` bytes

With correct decode: fills 0x448 bytes at 0xD13FD8 with zero. Bounded, safe.

## Why The Current Transpiled Code Crashes

The misdecoded `LD B, 0x01` at fake-address 0x00286A only writes bits 15-8 of the 24-bit BC register (`cpu.b` setter preserves bits 23-16). Since BC was previously set to 0xD13FD8 by the caller, BC becomes 0xD101D8. After `INC BC` → 0xD101D9. The SBC HL,BC comparisons never match, so the code falls through to the misdecoded LDIR with BC = 0xD10BDA (13.6M bytes), overwriting all RAM including the stack.

The "24-bit upper byte preservation" described above is real behavior in the transpiled code, but it's a **symptom of the misdecode**, not the root cause. There should be no `LD B` instruction at this address at all.

## Decoder Fix Required

In `ez80-decoder.js`, the `decodeDDFD()` function's fallback at line 621-627 needs to handle these opcodes BEFORE falling through to `decodeMain()`:

```javascript
// eZ80 indexed 24-bit pair loads: DD/FD 07 d, DD/FD 17 d, DD/FD 27 d
if (op === 0x07) {
  const disp = signedByte(romBytes[prefixPc + 2] ?? 0);
  return emit(2, { tag: 'ld-pair-indexed', pair: 'bc', base: indexReg, displacement: disp });
}
if (op === 0x17) {
  const disp = signedByte(romBytes[prefixPc + 2] ?? 0);
  return emit(2, { tag: 'ld-pair-indexed', pair: 'de', base: indexReg, displacement: disp });
}
if (op === 0x27) {
  const disp = signedByte(romBytes[prefixPc + 2] ?? 0);
  return emit(2, { tag: 'ld-pair-indexed', pair: 'hl', base: indexReg, displacement: disp });
}
```

Also need store variants if they exist (check eZ80 manual for DD/FD 01/11/21 d).

After fixing the decoder: retranspile, re-run boot. The bzero should complete in ~5 steps instead of crashing, potentially unlocking boot past step 691.

## Cross-References

- **Phase 100F** (`phase100f-report.md`): First documentation of the correct decode, cross-checked against Zilog UM0077
- **Phase 139** (`phase139-report.md`): Boot stall root cause trace showing the crash at block 0x00287D
- **Phase 15** (DD/FD prefix passthrough): Original decoder work that created the fallback behavior
