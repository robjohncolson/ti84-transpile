# Phase 579: Decode 0x0A27DD — Key Input Setup + Buffer Management

## Status: COMPLETE

Probe: `TI-84_Plus_CE/probe-phase579-decode-0A27DD.mjs`
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase579-decode-0A27DD.mjs`

## Key Finding

**0x0A27DD is NOT _GetCSC and does NOT wrap it.** It is a key input setup/context-save routine that tail-calls 0x0A1A36. The decoded range (300 bytes from 0x0A27DD) contains multiple separate entry points / sub-functions sharing the same code region.

## Function Structure (0x0A27DD)

The actual function at 0x0A27DD is short (33 bytes, 0x0A27DD - 0x0A27FE):

```
0x0A27DD  PUSH AF/BC/DE/HL          ; save all registers
0x0A27E1  BIT 6, (IY+27)            ; test flag
0x0A27E5  JR NZ, 0x0A27FE           ; skip init if already set
0x0A27E7  LD HL, 0x000000           ; zero HL
0x0A27EB  LD (0x0005F6), HL         ; clear SIS-mode address (note: SIS prefix 0x40)
0x0A27EF  LD A, 0x01
0x0A27F1  LD (0xD005F5), A          ; set D005F5 = 1 (key input enable flag?)
0x0A27F5  CALL 0x03D1C3             ; *** key sub-call — NOT _GetCSC ***
0x0A27F9  EI                        ; re-enable interrupts
0x0A27FA  SET 0, (IY+18)            ; set IY+0x12 bit 0
0x0A27FE  JP 0x0A1A36               ; *** TAIL CALL — real key dispatch ***
```

**Pattern**: This is a one-time init guard. IY+27 bit 6 gates the init block. On first call, it initializes D005F5=1, calls 0x03D1C3, sets IY+18 bit 0, then falls through to JP 0x0A1A36. On subsequent calls (bit already set), it skips straight to JP 0x0A1A36.

## Adjacent Functions in Decoded Range

The 300-byte window also contains:

### 0x0A2802 - 0x0A282C: Context Save Helper (RET)
- Copies SIS-mode addresses between (0x000595)/(0x00059A) and (0x0007C4)/(0x002AD2)
- Saves D02504 -> D007C7, D00092 -> D007C8, D00085 & 0x10 -> D007C9
- Ends with RET (separate function, not reachable from 0x0A27DD)

### 0x0A282D - 0x0A28F8: Buffer Fill/Clear with Interrupt Protection
- Heavy IY+76 (0x4C) flag manipulation: bits 2, 4, 5 tested/set/cleared
- Interrupt save/restore via LD A, I / JP PE pattern
- EXX register bank swapping for parallel HL/BC/DE usage
- 16-byte-at-a-time fill loop (0x0A28BF-0x0A28DF: 16x `LD (HL), A / INC HL`)
- Three buffer configurations based on IY+76 flags:
  - bit 4 set: HL=D04F2D, BC=0x02D0, HL'=D61E80
  - bit 4 clear (default): HL=D031F5, BC=0x20D0, HL'=D44B00 (with CALL 0x0800A0 test)
  - CALL 0x0800A0 returns NZ: HL=D0457D, BC=0x0D48, HL'=D58380
- Exits via RET NZ or JP 0x0A298C

## CALL Targets

| Address | From | Role |
|---------|------|------|
| 0x03D1C3 | 0x0A27F5 | Called during init (NOT _GetCSC) |
| 0x0800A0 | 0x0A289D | Buffer selection test |

## RAM References

| Address | Access | Notes |
|---------|--------|-------|
| D005F5 | WRITE 0x01 | Key input enable flag |
| D00085 | READ, AND 0x10 | Mode/status byte, bit 4 extracted |
| D00092 | READ | Status byte |
| D007C7 | READ/WRITE | Context save area (copy of D02504) |
| D007C8 | WRITE | Context save area (copy of D00092) |
| D007C9 | WRITE | Context save area (D00085 & 0x10) |
| D02504 | READ/WRITE | Restored from D007C7 |
| D031F5 | buffer base | Default fill target (0x20D0 bytes) |
| D04F2D | buffer base | Alternate fill target (0x02D0 bytes) |
| D0457D | buffer base | Extended fill target (0x0D48 bytes) |
| D44B00, D58380, D61E80 | buffer dest | Shadow bank destinations |

## IY+ Flag Operations

| Offset | Bits | Operations |
|--------|------|------------|
| IY+0x1B (27) | bit 6 | TEST — init guard |
| IY+0x12 (18) | bit 0 | SET — marks init complete |
| IY+0x02 (2) | bit 2 | RES — cleared before interrupt save |
| IY+0x4C (76) | bits 4,5 | BIT/SET/RES — buffer selection flags |

## Callers (9)

```
0x02F969  0x04441B  0x045533  0x0586DF  0x05CEA3
0x08680A  0x08C3A8  0x09C374  0x09E610
```

The event loop caller is **0x08C3A8** (inside event loop at 0x08C331).

## Next Steps

1. **Decode 0x0A1A36** — this is the real key dispatch target (tail call from 0x0A27DD). This is where OR A / JR NZ key detection likely happens.
2. **Decode 0x03D1C3** — the init sub-call. May set up keyboard scanning hardware or IRQ.
3. **Map D005F5** — appears to be a key input enable flag (set to 1 during init).
