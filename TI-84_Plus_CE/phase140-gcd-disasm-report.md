# Phase 140 — FP gcd Type Check Disassembly at 0x07F88D / 0xD00604

## Summary

0xD00604 is NOT the domain check that blocks gcd(12,8). It is merely OP2's type byte, checked only to sanitize zero-type operands. The real domain check is at 0x07F831 (type validator), and the E_Domain is triggered because the type validator returns with Z or C flag set. Additionally, probe-phase139 seeded OP2 at the wrong address (0xD00601 instead of 0xD00603).

## Key Findings

### 1. OP Register Layout (corrected)

The ROM uses 11-byte OP registers, not 9-byte:

| Register | Base Address | Type Byte (+1) | Exponent (+2) |
|----------|-------------|----------------|---------------|
| OP1 | 0xD005F8 | 0xD005F9 | 0xD005FA |
| OP2 | 0xD00603 | 0xD00604 | 0xD00605 |
| OP3 | 0xD0060E | 0xD0060F | 0xD00610 |
| OP4 | 0xD00619 | 0xD0061A | 0xD0061B |
| OP5 | 0xD00624 | 0xD00625 | 0xD00626 |
| OP6 | 0xD0062F | 0xD00630 | 0xD00631 |

**probe-phase139 used OP2_ADDR=0xD00601, which is WRONG.** The probe was writing BCD_8 into OP1's extended region (bytes 9-10 of OP1), not into OP2. OP2 base is at 0xD00603 (= OP1 + 11 bytes).

### 2. What 0x07F88D Does (NOT a domain check)

```
0x07F881:  SUB 0x01            ; A = A - 1 (operand count)
0x07F883:  PUSH AF             ; save
0x07F884:  LD A,(0xD005F9)     ; OP1 type byte
0x07F888:  OR A                ; zero?
0x07F889:  CALL Z,0x07FAC2     ; if OP1 type=0, replace OP1 with FP 0.0
0x07F88D:  LD A,(0xD00604)     ; OP2 type byte  <<<
0x07F891:  OR A                ; zero?
0x07F892:  CALL Z,0x07FAAF     ; if OP2 type=0, replace OP2 with FP 0.0
0x07F896:  POP AF              ; restore count
0x07F897:  RET
```

This is a "sanitize zero operands" step, not a validation gate. The zero-fill function at 0x07FAAF writes OP2 (starting at 0xD00603) to represent FP 0.0: `[00, 80, 00, 00, 00, 00, 00, 00, 00, 00, 00]`.

### 3. gcd Dispatch Path

```
0x06859B: LD A,0x28           ; category = gcd
0x06859D: CALL 0x0689DE       ; dispatch
         SUB 0x20 -> A=0x08   ; index into jump table
         JP (HL)              ; -> 0x068D3D (real gcd handler)
```

The real gcd handler at 0x068D3D:
```
0x068D3D: CALL 0x082957       ; FpPop (pops FPS -> OP1/OP2) [MISSING BLOCK]
0x068D41: CALL 0x068D61       ; type check #1
0x068D45: CALL 0x082961       ; (skipped in trace due to missing block)
0x068D49: CALL 0x082AE4       ; FpMov (moves OP data)
0x068D4D: CALL 0x068D61       ; type check #2 <- THIS IS WHERE IT FAILS
0x068D51: CALL 0x0828FC       ; ... (never reached)
0x068D55: CALL 0x07C771       ; gcd core (never reached)
0x068D59: JP 0x082912         ; push result (never reached)
```

### 4. The Real Domain Check (0x068D61 -> 0x068B78 -> 0x07F831)

```
0x068D61: CALL 0x068B78       ; type validator wrapper
0x068D65: JR Z,0x068D5D       ; if Z set -> E_Domain!
0x068D67: JR C,0x068D5D       ; if C set -> E_Domain!
```

The type validator at 0x068B78:
```
0x068B78: CALL 0x07FA74       ; set OP2[0] = 0x00, A = 0x10
0x068B7C: JP 0x07F831         ; full type validator
```

0x07F831 checks:
- 0xD005FA: OP1 exponent byte (if zero, zero-fill OP1)
- 0xD00605: OP2 exponent byte (if zero, zero-fill OP2)
- 0xD005F8: OP1 object type (must pass AND 0x80 test)
- 0xD00603: OP2 object type
- Then falls through to the sanitize section (0x07F881-0x07F897)

### 5. Execution Trace (corrected OP2 at 0xD00603)

```
[  0] 0x06859B: LD A,0x28            ; gcd entry
[  4] 0x068D3D: CALL 0x082957        ; FpPop [MISSING BLOCK]
[  5] 0x068D47: (resumed at wrong PC - missing block side effect)
[  6] 0x082AE4: FpMov?
[ 11] 0x068D4D: CALL 0x068D61        ; type check #2
[ 12] 0x068D61: CALL 0x068B78
[ 13] 0x068B78: CALL 0x07FA74
[ 17] 0x07F831: type validator entry
[ 24] 0x068D65: JR Z -> 0x068D5D     ; Z FLAG SET -> DOMAIN ERROR
[ 26] 0x068D5D: JP 0x061D0E          ; error dispatch
[ 27] 0x061D0E: LD A,0x84            ; E_Domain
```

### 6. Root Cause

The **MISSING BLOCK at 0x082957** is the primary problem. This is the FpPop routine that should pop two operands from the FP stack into OP1 and OP2. Because it's a missing block, the pop doesn't execute properly, and OP1/OP2 end up with garbage data that fails the type validation at 0x07F831.

Even when we manually seed OP1/OP2 correctly, the FpPop at 0x082957 (missing) likely corrupts the state, and the subsequent FpMov at 0x082AE4 moves bad data around.

### 7. Brute-Force Results

All 22 tested values (0x00-0x0F, 0x1C, 0x20, 0x28, 0x40, 0x80, 0xFF) at 0xD00604 produced E_Domain (errNo=0x84). The brute-force confirms that 0xD00604 is not the controlling variable for the domain check.

### 8. Cross-References to 0xD00604

55 total ROM references (13 writes, 25 reads, 17 address loads).

Notable **writers** that set specific type values:
- 0x068EC3: writes 0x82 (complex type?)
- 0x06C144, 0x07ED2E, 0x0B01B1: write 0x7F
- 0x07D40F: writes 0x7C
- 0x080C17: writes 0x73
- 0x0A8059: writes 0x8A

## Next Steps

1. **Lift the missing block at 0x082957** (FpPop). This is the gcd handler's first call and is critical for proper operand setup. Without it, no amount of manual seeding will work because the handler overwrites OP1/OP2 from FPS.

2. **Also check 0x082961** — the second FpPop/move call that's skipped in the trace.

3. **Alternative approach**: Instead of calling through the dispatch (0x06859B), call the gcd core directly at 0x07C771 with pre-seeded OP1/OP2, bypassing FpPop and type checks entirely.

## Artifacts

- `TI-84_Plus_CE/probe-phase140-gcd-disasm.mjs` — probe script
- `TI-84_Plus_CE/phase140-gcd-disasm-report.md` — this report
