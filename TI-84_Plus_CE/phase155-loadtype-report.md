# Phase 155: gcd_LoadType (0x068ECF) and HL=100 Loader (0x0AF8C4) Investigation

## Summary

The **entire call chain** for gcd_LoadType is **untranspiled** -- all four blocks are MISSING from ROM.transpiled.js. The HL=100 loader (0x0AF8C4) also fails: it returns OP1=0 instead of OP1=100. The gcd algorithm body produces OP1=-100 and E_Domain because critical subroutines silently fail.

## Part A: gcd_LoadType Trace During gcd(12,8)

Two calls to gcd_LoadType were observed, but both show A=0x50 (not A=0x0D for the second call as the disassembly predicts). This is because 0x068ECF is a **missing block** -- execution hits `onMissingBlock`, which means the actual gcd_LoadType code never runs. The runtime falls through or returns with whatever flags happen to be set.

| Call | Step | A (expected) | A (actual) | OP1 | OP2 |
|------|------|-------------|-----------|-----|-----|
| #1 | 334 | 0x50 | 0x50 | 0 (exp=0x82, digits=00) | 1200 |
| #2 | 1045 | 0x0D | 0x50 | 0 (exp=0x82, digits=00) | 100 |

The second call shows A=0x50 instead of 0x0D because the missing block at 0x068ECF never executed the `LD A, 0x0D` instruction at 0x068DE4. The algorithm body's block structure means the A register retains its previous value (0x50) when execution resumes from the missing block.

## Part B: What Type 0x0D Means

Type 0x0D (13 decimal) in TI-OS FP registers is a **list element** or **category marker** used internally during the gcd algorithm body. The question of whether 0x0D is valid for gcd is **moot** -- the `LD A, 0x0D; CALL gcd_LoadType` instruction pair at 0x068DE4-DE6 is never actually reached correctly because:
- gcd_LoadType itself is missing
- OP1 at that point contains [00 82 00 00 00 00 00 00 00] (= 0), not the expected intermediate value

The type 0x0D failure is a **symptom**, not the root cause. The root cause is that the entire gcd_LoadType subroutine and its dependencies are untranspiled.

## Part C: HL=100 Loader (0x0AF8C4) Standalone Test

| Metric | Result |
|--------|--------|
| Outcome | return (ran to completion) |
| Steps | 31 |
| OP1 after | 00 00 00 00 00 00 00 00 00 = **0** |
| Expected | 00 82 10 00 00 00 00 00 00 = **100** |
| Match | **false** |

The HL=100 loader **fails silently** -- it returns OP1=0 instead of building the BCD representation of 100. Since 0x0AF8C4 is itself a MISSING block, the routine's internal logic (which involves BCD digit extraction from HL, exponent calculation, and mantissa placement) never executes.

ROM bytes at 0x0AF8C4 show it calls:
- 0x07FAAF (likely SetOP1Zero or similar)
- Then does BCD conversion of HL into OP1 mantissa bytes

Since the block is missing, none of this happens. The OP1 register stays at whatever it was before the call.

## Part D: Call Chain Block Status

| Address | Label | Transpiled? |
|---------|-------|-------------|
| 0x068ECF | gcd_LoadType | **MISSING** |
| 0x0AF8A5 | LD_type_imm (called by gcd_LoadType) | **MISSING** |
| 0x07F831 | TypeValidator (jumped to by gcd_LoadType) | **MISSING** |
| 0x0AF8C4 | HL=100 loader (called from algorithm body) | **MISSING** |

**All four blocks are missing.** The call chain is:
```
0x068ECF (gcd_LoadType)
  -> CALL 0x0AF8A5 (LD_type_imm: stores A into OP2 type area, validates)
  -> JP 0x07F831 (TypeValidator: compares OP1 type vs OP2 type, sets carry)
```

And separately in the algorithm body:
```
0x068DAF: CALL 0x0AF8C4 (HL=100 loader: converts HL integer to BCD in OP1)
```

## ROM Hex Dumps

### gcd_LoadType (0x068ECF, 7 bytes)
```
0x068ECF: CD A5 F8 0A   ; CALL 0x0AF8A5  (LD_type_imm)
0x068ED3: C3 31 F8 07   ; JP   0x07F831  (TypeValidator)
```

This is a **2-instruction stub**: it calls LD_type_imm with A=type_byte, then jumps to TypeValidator. Very simple, but since neither target is transpiled, both calls fail.

### LD_type_imm (0x0AF8A5, 31 bytes)
```
0x0AF8A5: 21 03 06 D0   ; LD HL, 0xD00603 (OP2_ADDR)
0x0AF8A9: E5            ; PUSH HL
0x0AF8AA: F5            ; PUSH AF
0x0AF8AB: CD C6 FA 07   ; CALL 0x07FAC6 (likely ZeroOP2)
0x0AF8AF: F1            ; POP AF
0x0AF8B0: CD 8A F8 0A   ; CALL 0x0AF88A (store A as type)
0x0AF8B4: E1            ; POP HL
0x0AF8B5: 23            ; INC HL
0x0AF8B6: FE 10         ; CP 0x10
0x0AF8B8: 30 06         ; JR NC, +6 (skip if A >= 0x10)
0x0AF8BA: CD F5 FA 07   ; CALL 0x07FAF5
0x0AF8BE: 18 01         ; JR +1
0x0AF8C0: 34            ; INC (HL)
0x0AF8C1: 23            ; INC HL
0x0AF8C2: 77            ; LD (HL), A
0x0AF8C3: C9            ; RET
```

### HL=100 loader (0x0AF8C4, partial)
```
0x0AF8C4: E5            ; PUSH HL
0x0AF8C5: CD AF FA 07   ; CALL 0x07FAAF (SetOP1Zero or similar)
0x0AF8C9: E1            ; POP HL
0x0AF8CA: 7C            ; LD A, H
0x0AF8CB: B5            ; OR L
0x0AF8CC: C8            ; RET Z (return if HL=0)
...continued BCD conversion of HL to OP1...
```

## Root Cause Assessment

The E_Domain failure in gcd(12,8) is caused by **four missing transpiled blocks** in the gcd algorithm's critical path:

1. **0x068ECF (gcd_LoadType)** -- type validation stub, 2 instructions
2. **0x0AF8A5 (LD_type_imm)** -- prepares OP2 with type byte from A, zeroes OP2
3. **0x07F831 (TypeValidator)** -- compares OP1 and OP2 type bytes, returns carry flag
4. **0x0AF8C4 (HL=100 loader)** -- converts integer in HL to BCD float in OP1

The type 0x0D byte is NOT the root cause. The root cause is that these blocks were never lifted from the ROM binary into ROM.transpiled.js. Once all four are transpiled, gcd_LoadType should correctly validate types and the HL=100 loader should correctly produce BCD 100.0 for the subtraction step.

**Priority for next session**: Add blocks at 0x068ECF, 0x0AF8A5, 0x0AF8C4, and 0x07F831 to the transpiler's block discovery or manual block list.

## GCD Run Results

```
Outcome: return (with E_Domain error)
Steps: 1442
errNo: 0x84 (E_Domain)
Final OP1: 80 82 10 00 00 00 00 00 00 = -100
Final OP2: 80 82 10 00 00 00 00 00 00 = -100
```
