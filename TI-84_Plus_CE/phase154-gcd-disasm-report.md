# Phase 154: GCD Handler Disassembly + Manual OP2=8.0 Restore Test

## Summary

The manual OP2=8.0 restore hypothesis from session 153 is **DISPROVED**. Restoring OP2=8.0 at step 19 or 20 does not change the gcd result at all. All three runs (baseline, restore@19, restore@20) produce identical results: OP1=-100, errNo=0x84 (E_Domain), 1442 steps. The const 1.0 loader is intentional -- it's used for a TypeValidator comparison check (is OP1 >= 1.0?), and the algorithm body does not rely on OP2 retaining the original 8.0 at that point.

## GCD Handler Disassembly (0x068D3D)

### Outer Wrapper (0x068D3D - 0x068D5C)

The gcd entry point is a wrapper that calls gcd_sub1 twice (once per operand), then combines results:

```
0x068D3D: CALL 0x082957    ; FpPush_OP2 (saves OP2=8.0 to FPS)
0x068D41: CALL 0x068D61    ; gcd_sub1(OP1) -- processes first operand
0x068D45: CALL 0x082961    ; FpPush_OP1 (saves result to FPS)
0x068D49: CALL 0x082AE4    ; EnsureReal
0x068D4D: CALL 0x068D61    ; gcd_sub1(OP2) -- processes second operand
0x068D51: CALL 0x0828FC    ; FpPop_OP2 (restores first result from FPS)
0x068D55: CALL 0x07C771    ; FPMul (multiply the two results)
0x068D59: JP   0x082912    ; FPS_Dec9 (pop original OP2, return)
```

The outer wrapper computes gcd_sub1(a) * gcd_sub1(b), popping the saved 8.0 at the very end via JP FPS_Dec9. The FPS push/pop of 8.0 is structural bookkeeping for the outer wrapper, NOT for the inner algorithm.

### Validation Routine (0x068D61 = gcd_sub1 entry)

```
0x068D61: CALL 0x068B78    ; validate_input (loads 1.0 into OP2, compares)
0x068D65: JR Z, 0x068D5D   ; -> ErrDomain if zero
0x068D67: JR C, 0x068D5D   ; -> ErrDomain if OP1 < 1
0x068D69: CALL 0x0685DF    ; Conv2Real (ensure real type)
0x068D6D: LD A, (0xD005F9) ; read OP1 exponent byte
0x068D71: CP 0x84          ; check exp < 0x84
0x068D73: JR NC, 0x068D5D  ; -> ErrDomain if too large
0x068D75: LD B, 0
0x068D77: CP 0x82          ; check exp < 0x82 (number < 100)
0x068D79: JR C, 0x068D7E   ; if < 100: call gcd_helper
0x068D7B: INC B            ; else B=1
0x068D7C: JR 0x068D82      ; skip gcd_helper
0x068D7E: CALL 0x068D20    ; gcd_helper: increment exponent at 0xD005F9 twice
0x068D82: (falls through to algorithm body)
```

### Validate Input (0x068B78)

```
0x068B78: CALL 0x07FA74    ; Const1_OP2 (load 1.0 into OP2)
0x068B7C: JP   0x07F831    ; TypeValidator (compare OP1 vs OP2=1.0, RET to caller)
```

This is a simple "is OP1 a valid positive integer >= 1?" check. The 1.0 in OP2 is intentional for the comparison. TypeValidator returns flags (Z if equal, C if OP1 < OP2).

### Algorithm Body (0x068D82 - 0x068EB4)

```
0x068D82: BIT 0, B         ; test scaling flag
0x068D84: PUSH AF          ; save flag
0x068D85: CALL AbsOP1      ; OP1 = |OP1|
0x068D89: CALL OP1toOP2    ; OP2 = OP1 (OVERWRITES OP2 with OP1 value)
0x068D8D: CALL FPDiv       ; OP1 = OP1 / OP2
0x068D91: CALL AbsOP2      ; |OP2|
0x068D95: CALL OP2toOP1    ; OP1 = OP2
0x068D99: CALL gcd_helper  ; adjust exponent
0x068D9D: CALL CkOP2Pos    ; check OP2 positive
0x068DA1: JR NZ, ErrDomain ; error if not
0x068DA3: LD A, 0x50       ; load type 0x50
0x068DA5: CALL gcd_LoadType; validate type
0x068DA9: JR NC, 0x068DB7  ; skip subtraction if NC
0x068DAB: LD HL, 0x000064  ; 100 decimal
0x068DAF: CALL 0x0AF8C4    ; load OP1 = 100(?)
0x068DB3: CALL FPSub       ; OP1 = OP1 - 100
0x068DB7: CALL FpPush_OP1  ; push current OP1 to FPS
0x068DBB: CALL FPCompare   ; compare OP1 vs OP2
0x068DBF: CALL FPTrunc     ; truncate to integer
0x068DC3: CALL OP1toOP2    ; OP2 = truncated
0x068DC7: CALL JmpThru     ; indirect call
0x068DCB: CALL FPAdd       ; add
0x068DCF: CALL gcd_helper  ; adjust
0x068DD3: CALL 0x07F8D8    ; sign check
0x068DD7: CALL OP2toOP1    ; OP1 = OP2
0x068DDB: CALL JmpThru     ; indirect call
0x068DDF: POP AF           ; restore scaling flag
0x068DE0: CALL Z, NegateOP1; negate if Z
0x068DE4: LD A, 0x0D       ; type 0x0D (13 decimal)
0x068DE6: CALL gcd_LoadType; validate type
0x068DEA: JP NC, ErrDomain ; ERROR: this fires! Algorithm ends with E_Domain
0x068DEE: CALL FPDiv       ; divide (only reached if NC not set)
...
0x068DFA: CALL PopRealO2   ; pop from FPS to OP2 (0x082AC2)
...
0x068EB4: RET              ; return to outer wrapper
```

### FP Push/Pop References in GCD Region (0x068D00-0x069000)

```
0x068D3D: CALL FpPush_OP2    ; outer wrapper: save OP2(8.0)
0x068D45: CALL FpPush_OP1    ; outer wrapper: save gcd_sub1 result
0x068D51: CALL FpPop_OP2     ; outer wrapper: restore first result
0x068D59: JP   FPS_Dec9      ; outer wrapper: discard saved OP2
0x068DB7: CALL FpPush_OP1    ; algorithm body: save intermediate
0x068DFA: CALL PopRealO2     ; algorithm body: restore intermediate
0x068E97: CALL FpPop_OP1     ; algorithm body: restore intermediate
```

## Probe Results

### Run A: Baseline (no intervention)
- Final OP1: [80 82 10 00 00 00 00 00 00] => -100
- errNo: 0x84 (E_Domain)
- Steps: 1442, Outcome: return

### Run B: OP2=8.0 restore at step 20
- Intervention applied at PC=0x068B7C, OP2 changed from 1.0 to 8.0
- Final OP1: -100, errNo: E_Domain, steps: 1442 -- IDENTICAL to baseline

### Run C: OP2=8.0 restore at step 19
- Intervention applied at PC=0x07FA86, OP2 changed from 1.0 to 8.0
- Final OP1: -100, errNo: E_Domain, steps: 1442 -- IDENTICAL to baseline

## Analysis

### Why the manual restore does not help

The const 1.0 loader at step 18 is intentional -- function 0x068B78 loads 1.0 into OP2 to compare against OP1 via TypeValidator. This is a validation step ("is the input >= 1?"), not part of the arithmetic. After validation, the algorithm body at 0x068D89 does `OP1toOP2` which overwrites OP2 with OP1's value anyway.

### The real problem: E_Domain at 0x068DEA

The algorithm hits `JP NC, ErrDomain` at 0x068DEA. This is after:
1. `LD A, 0x0D` (load type byte 13)
2. `CALL gcd_LoadType` (0x068ECF) which calls `LD_type_imm` then `JP TypeValidator`

The TypeValidator returns with carry CLEAR (NC), triggering the domain error jump. This means the gcd_LoadType check at 0x068DE6 is FAILING, not the OP2 value.

### Revised root cause hypothesis

The original OP2=8.0 hypothesis is wrong. The actual failure point is:
1. The algorithm body computes some intermediate values
2. At 0x068DE6, it validates the result with type=0x0D
3. TypeValidator returns NC (fail), triggering E_Domain at 0x068DEA
4. The error handler sets errNo=0x84 and OP1=-100

Next investigation should:
- Trace OP1/OP2 values at step 0x068DE6 to see what's being validated
- Check if gcd_LoadType (0x068ECF -> 0x0AF8A5 -> TypeValidator) is correctly transpiled
- Investigate the JmpThru (0x080188) indirect calls at 0x068DC7 and 0x068DDB to verify they jump to the correct targets
- Check if 0x0AF8C4 (called at 0x068DAF with HL=100) is correctly implemented
