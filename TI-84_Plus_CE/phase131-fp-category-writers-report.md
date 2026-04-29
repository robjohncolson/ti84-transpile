# Phase 131 — FP Category Byte (0xD0060E) Writers Report

## Summary

Found **22 ROM instructions** that write to address 0xD0060E (the FP category byte slot). **None** are currently in the BLOCKS table (all are uncovered). The FP handler table at 0x068580-0x0685AA is also fully uncovered.

## Part A: Writers to 0xD0060E

### LD (0xD0060E),A — 13 locations

| Address | Value loaded into A | Context |
|---------|-------------------|---------|
| 0x05952E | `A = 0x01` (LD A,0x01 at 0x05952C) | FP subsystem, compare/CP 0x08 and 0x2A before write |
| 0x07CAD2 | Dynamic (result of CALL 0x07CA73) | Graph renderer area |
| 0x07E105 | Dynamic (result of CALL 0x07FAD5) | Graph expression evaluator |
| 0x07E2A2 | Dynamic (LD A,C after CALL 0x07FC7C) | Graph expression evaluator |
| 0x07EC0D | Dynamic (result of SUB D, SUB D) | Graph subsystem |
| 0x07F5D3 | Dynamic (from CALL 0x07CB98) | Graph subsystem |
| 0x081829 | `A = 0xC1` (LD A,0xC1 at 0x081827) | Matrix/list editor? |
| 0x095722 | `A = 0xFF` (LD A,0xFF at 0x09570A) | Parser/evaluator, sets category to "unset/all" |
| 0x095765 | `A = 0xFF` (LD A,0xFF at 0x095763) | Parser/evaluator, same pattern as 0x095722 |
| 0x0957FF | `A = 0xFF` (LD A,0xFF at 0x0957FD) | Parser/evaluator, same pattern |
| 0x0989D0 | `A = 0x1A` (LD A,0x1A at 0x0989CE) | FP dispatch chain, category 0x1A |
| 0x0A7680 | `A = 0x91` → then JP NC to alt path, else POP AF | Statistics/regression |
| 0x0A8D99 | `A = 0x00` (XOR A at 0x0A8D98) | Equation solver, clears category |

### LD (0xD0060E),HL — 7 locations

| Address | Context |
|---------|---------|
| 0x03D9C0 | Loads HL from (0xD02A94), stores to category slot (24-bit ptr store) |
| 0x04A6C2 | Uses IX+6 to load HL, then stores — stack frame variable |
| 0x0593E3 | Complex pointer chain with LD HL,(HL) |
| 0x05D66D | After POP HL and multiple CALL chains — FP expression eval |
| 0x09C10A | After BIT SET (HL) — parser flag manipulation |
| 0x0AA021 | After CALL 0x07F978 — regression/stat module |
| 0x0AA035 | Same function as 0x0AA021, second store |

### LD (0xD0060E),DE — 2 locations (ED-prefixed)

| Address | Context |
|---------|---------|
| 0x06B1DF | After EX DE,HL and CALL 0x08285F — graph/window subsystem |
| 0x082F1D | After loading DE from (HL) 2 bytes — matrix/dimension handler |

## Part B: FP Handler Table at 0x068580-0x0685AA

The table at 0x068580 is NOT a uniform "LD A,xx; CALL 0x0689DE; RET" pattern. Instead it has two distinct regions:

### Region 1: 0x068580-0x06859A — Jump-relative table (category indices 0x00-0x0F)

Each entry loads A with a small index and jumps back to the common entry at 0x068582:

```
0x068580: EX AF,AF'           ; save A (incoming category)
0x068581: XOR A               ; A = 0x00
0x068582: CALL 0x096024       ; common dispatch
0x068585: ADD HL,BC            
0x068586: RET

0x068587: LD A,0x03           ; entry for category 0x03
0x068589: JR 0x068582         ; -> common dispatch

0x06858B: LD A,0x06           ; entry for category 0x06
0x06858D: JR 0x068582

0x06858F: LD A,0x09           ; entry for category 0x09
0x068591: JR 0x068582

0x068593: LD A,0x0C           ; entry for category 0x0C
0x068595: JR 0x068582

0x068597: LD A,0x0F           ; entry for category 0x0F
0x068599: JR 0x068582
```

### Region 2: 0x06859B-0x0685A9 — CALL 0x0689DE table (category indices 0x28-0x2A)

```
0x06859B: LD A,0x28           ; gcd/lcm category
0x06859D: CALL 0x0689DE       ; dispatch via secondary table
0x0685A0: ...
0x0685A1: RET

0x0685A2: LD A,0x29           ; min/max category  
0x0685A4: JR 0x06859D         ; -> CALL 0x0689DE

0x0685A6: LD A,0x2A           ; another category
0x0685A8: JR 0x06859D         ; -> CALL 0x0689DE
```

### CALL target 0x0689DE disassembly

```
0x0689DE: SUB 0x20            ; normalize: A = A - 0x20
0x0689E0: JP C,0x061D2C       ; error if A was < 0x20
0x0689E3: ...
0x0689E5: DEC C               ; check upper bound
0x0689E6: JP NC,0x061D2C      ; error if out of range  
0x0689E9: LD DE,0x000000      
0x0689EE: LD E,A              ; E = normalized category
0x0689EF: LD HL,0x0689F9      ; base of jump table
0x0689F2: ...
0x0689F4: ADD HL,DE           ; index into jump table
0x0689F5: ADD HL,DE           ; (3-byte entries: addr*3)
0x0689F6: LD HL,(HL)          ; load target address
0x0689F8: JP (HL)             ; dispatch!
```

## Coverage Status

- **All 22 writers to 0xD0060E**: NOT IN BLOCKS
- **0x06859B** (gcd/lcm handler entry): NOT IN BLOCKS — needs seed
- **Entire handler table 0x068580-0x0685AA**: NOT IN BLOCKS
- **CALL target 0x0689DE**: NOT IN BLOCKS

## Key Findings

1. The most relevant writers for the FP evaluation pipeline are at **0x095722, 0x095765, 0x0957FF** (all set A=0xFF, "uninitialized/wildcard" category) and **0x0989D0** (sets A=0x1A, a specific category).

2. The handler table has two dispatch mechanisms:
   - Categories 0x00-0x0F dispatch via CALL 0x096024
   - Categories 0x20-0x2A dispatch via CALL 0x0689DE (which uses a secondary jump table at 0x0689F9)

3. For gcd (category 0x28): the path is 0x06859B -> LD A,0x28 -> CALL 0x0689DE -> SUB 0x20 -> index 8 into table at 0x0689F9

4. **Missing seeds needed** (priority order):
   - 0x06859B — gcd/lcm handler entry (directly relevant to FP dispatch)
   - 0x068580 — handler table entry point
   - 0x068587, 0x06858B, 0x06858F, 0x068593, 0x068597 — other handler entries
   - 0x0685A2, 0x0685A6 — min/max and related handlers
   - 0x0689DE — secondary dispatch function
   - 0x0989D0 — sets category 0x1A in FP chain
