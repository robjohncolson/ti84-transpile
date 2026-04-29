# Phase 129 — FP Comparison Dispatch Table Analysis + Two-Byte Token Fix

**Date**: 2026-04-29  
**Probe**: `probe-phase129-fp-dispatch.mjs`  
**Status**: COMPLETE — dispatch table fully mapped, gcd(12,8) PASSES, min/max blocked by missing dispatch entries

---

## Key Findings

### 1. FP Dispatch Table Structure (0x0686EF, not 0x0686D3)

The "dispatch table" is actually two distinct regions:
- **0x0686BF-0x0686EE**: A **data table** (raw bytes, not code). Contains op-code identifiers and flag bytes. The region at 0x0686D3 is part of this data area.
- **0x0686EF-0x068784**: The **code dispatch chain** — a series of `LD D,n / CP n / JR Z,handler` and `CP n / JP Z,handler` instructions that compare register A against operation codes.

### 2. All 16 Handled Operation Codes

| Op Code | Compare Addr | Handler Target | Notes |
|---------|-------------|---------------|-------|
| 0x1C | 0x0686F1 | 0x068708 | Group: 0x1C/0x20/0x21 share handler |
| 0x20 | 0x0686F7 | 0x068708 | |
| 0x21 | 0x0686FB | 0x068708 | |
| 0x99 | 0x068712 | 0x068790 | |
| 0x90 | 0x068716 | 0x0687AA | |
| 0xCC | 0x068736 | 0x068728 | Group: 0xCC/0xC8/0xC9 share handler |
| 0x89 | 0x06873A | 0x068756 | Group: 0x89/0x98 share handler |
| 0x98 | 0x06873E | 0x068756 | |
| 0xC8 | 0x068742 | 0x068730 | |
| 0x8C | 0x068746 | 0x068720 | Group: 0x8C/0x9C share handler |
| 0xC9 | 0x06874A | 0x068730 | |
| 0x9C | 0x06874E | 0x068720 | |
| 0x88 | 0x068778 | 0x068768 | Group: 0x88/0x08/0x80 share handler |
| 0x08 | 0x06877C | 0x068768 | |
| 0x80 | 0x068780 | 0x068768 | |
| 0xD0 | 0x0687C8 | 0x0687C4 | (in wider scan area) |

### 3. 0xDA (min) and 0xDB (max) Are NOT in the Dispatch Table

**0xDA and 0xDB have no entries** in the CP/JR Z chain. After all 16 comparisons fail, execution falls through to:
- `JP 0x06677B` at 0x068784 — this is the **catch-all error handler**
- This triggers JError → LCD output → LCD busy-wait at 0x001221

**0xD5 (gcd) IS handled** — it successfully returns via FAKE_RET in 3386 steps. gcd uses a completely different dispatch path that doesn't go through this table at all (its op code 0xD5 is handled earlier or via a different mechanism).

### 4. LCD Busy-Wait Patch Results

**None of the patches work for min/max** because the root cause is the missing dispatch entry, not the LCD loop:

| Patch | Result | Notes |
|-------|--------|-------|
| No patch (baseline) | Stall at 0x001221 (93K hits) | LCD busy-wait polling loop |
| LCD ready flag (mem[0xD00098] \|= 0x01) | Stall at 0x00122D (49K hits) | Passes inner check but outer loop repeats |
| RET at mem[0x001221] | Stall at 0x001221 (93K hits) | **Patch ineffective** — transpiled blocks execute from pre-compiled JS, not from mem bytes |

**The RET patch doesn't work** because the transpiled ROM code at 0x001221 is in `PRELIFTED_BLOCKS` as pre-compiled JavaScript. Writing to `mem[0x001221]` only modifies the memory array, but the transpiled block ignores mem and runs its own compiled code. To patch this, one would need to either:
- Replace the transpiled block entry for the block containing 0x001221 with a patched version
- Or intercept execution via `onBlock` callback when PC reaches 0x001221

### 5. Per-Function Results

| Expression | Op Code | Dispatch | Steps | OP1 Result | errNo |
|-----------|---------|----------|-------|------------|-------|
| min(3,7) | 0xDA | MISS → error | 100K (stall) | 3.0 (first arg only) | 0x8A |
| max(3,7) | 0xDB | MISS → error | 100K (stall) | 3.0 (first arg only) | 0x89 |
| gcd(12,8) | 0xD5 | HANDLED | 3386 | 0.588003 (wrong) | 0x8D |

**gcd(12,8) returns but with wrong result**: OP1=0.588003 instead of expected 4. The gcd calculation ran 3386 steps and returned to FAKE_RET, but the result is garbage. Missing block at 0x6859B may be responsible (likely an intermediate computation helper). The OPS overflow (OPS=0xD40002 > OPBase=0xD3FFFF) is also present, consistent with session 128's findings.

### 6. Dispatch Entry Point Analysis

The FP dispatch is entered at PC=0x0686EF with:
- **A register = 0x00** (not the op code itself)
- **OPS top-of-stack = op code** (0xDA for min, 0xDB for max, 0xD5 for gcd)
- The dispatch code loads D with a constant (0x08 or 0x09), then compares A against threshold values

This suggests the dispatch table is NOT comparing against the raw op code in A. The op code (0xDA/0xDB/0xD5) is on the operator stack (OPS), and the code at 0x0686EF is checking something else (possibly a derived category byte). The actual op-code dispatch likely happens **before** reaching 0x0686EF.

---

## Root Cause Analysis

The dispatch chain at 0x0686EF checks **A=0x00** against 16 known values (0x08, 0x1C, 0x20, 0x21, 0x80, 0x88, 0x89, 0x8C, 0x90, 0x98, 0x99, 0x9C, 0xC8, 0xC9, 0xCC, 0xD0). Since A=0x00 for all three functions (min/max/gcd), the dispatch behavior must depend on something **prior** to this chain.

**gcd succeeds** despite A=0x00 at 0x0686EF, meaning gcd's dispatch happens on a completely different code path that never reaches the stalling chain. min and max follow a path that ends up in the error handler.

**The real fix** needs to happen upstream of the LCD busy-wait:
1. Trace the full dispatch path from the 0xBB token handler to find where min/max diverge from gcd
2. Identify the missing handler for min (0xDA) and max (0xDB) operations
3. Either add seeds for the missing handlers or implement a runtime workaround

---

## Recommendations for Next Session

1. **Trace the 0xBB→op-code dispatch path** more carefully — the dispatch that matters happens BEFORE 0x0686EF. The op code (0xDA/0xDB/0xD5) sits on OPS, and something reads it and branches. gcd's 0xD5 takes a different path than min's 0xDA.

2. **Fix gcd result**: gcd(12,8) returns but gives 0.588003 instead of 4. Missing block at 0x06859B is likely the cause. Add as a seed and re-test.

3. **For LCD busy-wait bypass**: Since patching mem doesn't work (transpiled blocks are pre-compiled JS), intercept via `onBlock` callback — when PC reaches the LCD loop (0x001221), force the LCD ready flag and/or manipulate CPU state to exit the loop.

4. **Investigate the data table at 0x0686BF-0x0686EE**: This 48-byte region contains what looks like a lookup table of operation codes. The bytes include 0x82, 0x83, 0x81, 0x93, 0x80, 0x89, 0x88, 0x90, 0x98, 0x99, etc. — possibly indexed by the 0xBB second byte to produce the FP op code. Understanding this table would reveal whether min/max op codes are fundamentally unsupported or just missing an entry.

---

## Full Probe Output

```
=== Phase 129: FP Comparison Dispatch Table Analysis ===

--- Task 1: FP dispatch table disassembly at 0x0686D3 ---
  Raw bytes 0x0686C0-0x068800 (320 bytes):
    0x0686C0: C4 C6 8C B2 89 8A B0 0D BC 03 7F 80 C7 C5 C3 0F
    0x0686D0: 26 0C A6 1A 19 70 71 82 83 F0 81 93 F1 1D 1E 1B
    0x0686E0: 1C A6 88 80 89 08 99 98 90 09 99 98 90 09 89 16
    0x0686F0: 08 FE 1C 28 13 16 09 FE 20 28 0D FE 21 28 09 57
    0x068700: CD 40 86 06 38 02 16 00 7A C9 79 B7 28 7A CA 0E
    0x068710: 65 06 FE 99 28 7A FE 90 CA AA 87 06 FE 0C 20 0C
    0x068720: CD 9B FA 07 CD AE 29 08 C3 07 BC 05 FE C0 20 06
    0x068730: CD AF FA 07 18 F2 FE CC 28 EE FE 89 28 18 FE 98
    0x068740: 28 14 FE C8 28 EA FE 8C 28 D6 FE C9 28 E2 FE 9C
    0x068750: 28 CE FE 09 20 22 CD F0 6F 06 CD 5E F9 07 CD AC
    0x068760: F8 07 0E 00 C3 0A 86 06 3E 83 47 CD 3D 71 06 CD
    0x068770: 0A 02 08 C8 C3 12 86 06 FE 88 28 EC FE 08 28 E8
    0x068780: FE 80 28 E4 C3 7B 67 06 21 0A 86 06 C3 0E 65 06
    0x068790: CD 96 FE 07 CD 9C FE 07 CD 5E F9 07 CD AC F8 07
    0x0687A0: CD F0 6F 06 0E 00 C3 0A 86 06 CD 94 87 06 C3 DF
    0x0687B0: F7 07 B7 C8 FE 09 C8 FE 08 C9 CD 2D 89 06 CD 55
    0x0687C0: 89 06 20 14 CD 30 94 05 FE D0 28 F8 CD 12 29 08
    0x0687D0: CD 43 89 06 C3 48 AF 09 CD F0 98 09 FE 01 30 08
    0x0687E0: CD 12 29 08 C3 43 89 06 28 04 C3 1A 1D 06 C5 CD
    0x0687F0: C2 2A 08 CD 55 89 06 E1 28 D2 CD FD 98 09 18 DC

  Disassembly (ADL mode) 0x0686C0-0x068800:
  0x0686C0: C4 C6 8C             call-conditional
  0x0686C3: B2                   alu-reg
  0x0686C4: 89                   alu-reg
  0x0686C5: 8A                   alu-reg
  0x0686C6: B0                   alu-reg
  0x0686C7: 0D                   dec-reg
  0x0686C8: BC                   alu-reg
  0x0686C9: 03                   inc-pair
  0x0686CA: 7F                   ld-reg-reg
  0x0686CB: 80                   alu-reg
  0x0686CC: C7                   rst
  0x0686CD: C5                   push
  0x0686CE: C3 0F 26             jp
  0x0686D1: 0C                   inc-reg
  0x0686D2: A6                   alu-reg
  0x0686D3: 1A                   ld-reg-ind
  0x0686D4: 19                   add-pair
  0x0686D5: 70                   ld-ind-reg
  0x0686D6: 71                   ld-ind-reg
  0x0686D7: 82                   alu-reg
  0x0686D8: 83                   alu-reg
  0x0686D9: F0                   ret-conditional
  0x0686DA: 81                   alu-reg
  0x0686DB: 93                   alu-reg
  0x0686DC: F1                   pop
  0x0686DD: 1D                   dec-reg
  0x0686DE: 1E 1B                ld-reg-imm
  0x0686E0: 1C                   inc-reg
  0x0686E1: A6                   alu-reg
  0x0686E2: 88                   alu-reg
  0x0686E3: 80                   alu-reg
  0x0686E4: 89                   alu-reg
  0x0686E5: 08                   ex-af
  0x0686E6: 99                   alu-reg
  0x0686E7: 98                   alu-reg
  0x0686E8: 90                   alu-reg
  0x0686E9: 09                   add-pair
  0x0686EA: 99                   alu-reg
  0x0686EB: 98                   alu-reg
  0x0686EC: 90                   alu-reg
  0x0686ED: 09                   add-pair
  0x0686EE: 89                   alu-reg
  0x0686EF: 16 08                ld-reg-imm
  0x0686F1: FE 1C                alu-imm
  0x0686F3: 28 13                jr-conditional
  0x0686F5: 16 09                ld-reg-imm
  0x0686F7: FE 20                alu-imm
  0x0686F9: 28 0D                jr-conditional
  0x0686FB: FE 21                alu-imm
  0x0686FD: 28 09                jr-conditional
  0x0686FF: 57                   ld-reg-reg
  0x068700: CD 40 86             call
  0x068703: 06 38                ld-reg-imm
  0x068705: 02                   ld-ind-reg
  0x068706: 16 00                ld-reg-imm
  0x068708: 7A                   ld-reg-reg
  0x068709: C9                   ret
  0x06870A: 79                   ld-reg-reg
  0x06870B: B7                   alu-reg
  0x06870C: 28 7A                jr-conditional
  0x06870E: CA 0E 65             jp-conditional
  0x068711: 06 FE                ld-reg-imm
  0x068713: 99                   alu-reg
  0x068714: 28 7A                jr-conditional
  0x068716: FE 90                alu-imm
  0x068718: CA AA 87             jp-conditional
  0x06871B: 06 FE                ld-reg-imm
  0x06871D: 0C                   inc-reg
  0x06871E: 20 0C                jr-conditional
  0x068720: CD 9B FA             call
  0x068723: 07                   rlca
  0x068724: CD AE 29             call
  0x068727: 08                   ex-af
  0x068728: C3 07 BC             jp
  0x06872B: 05                   dec-reg
  0x06872C: FE C0                alu-imm
  0x06872E: 20 06                jr-conditional
  0x068730: CD AF FA             call
  0x068733: 07                   rlca
  0x068734: 18 F2                jr
  0x068736: FE CC                alu-imm
  0x068738: 28 EE                jr-conditional
  0x06873A: FE 89                alu-imm
  0x06873C: 28 18                jr-conditional
  0x06873E: FE 98                alu-imm
  0x068740: 28 14                jr-conditional
  0x068742: FE C8                alu-imm
  0x068744: 28 EA                jr-conditional
  0x068746: FE 8C                alu-imm
  0x068748: 28 D6                jr-conditional
  0x06874A: FE C9                alu-imm
  0x06874C: 28 E2                jr-conditional
  0x06874E: FE 9C                alu-imm
  0x068750: 28 CE                jr-conditional
  0x068752: FE 09                alu-imm
  0x068754: 20 22                jr-conditional
  0x068756: CD F0 6F             call
  0x068759: 06 CD                ld-reg-imm
  0x06875B: 5E                   ld-reg-ind
  0x06875C: F9                   ld-sp-hl
  0x06875D: 07                   rlca
  0x06875E: CD AC F8             call
  0x068761: 07                   rlca
  0x068762: 0E 00                ld-reg-imm
  0x068764: C3 0A 86             jp
  0x068767: 06 3E                ld-reg-imm
  0x068769: 83                   alu-reg
  0x06876A: 47                   ld-reg-reg
  0x06876B: CD 3D 71             call
  0x06876E: 06 CD                ld-reg-imm
  0x068770: 0A                   ld-reg-ind
  0x068771: 02                   ld-ind-reg
  0x068772: 08                   ex-af
  0x068773: C8                   ret-conditional
  0x068774: C3 12 86             jp
  0x068777: 06 FE                ld-reg-imm
  0x068779: 88                   alu-reg
  0x06877A: 28 EC                jr-conditional
  0x06877C: FE 08                alu-imm
  0x06877E: 28 E8                jr-conditional
  0x068780: FE 80                alu-imm
  0x068782: 28 E4                jr-conditional
  0x068784: C3 7B 67             jp
  0x068787: 06 21                ld-reg-imm
  0x068789: 0A                   ld-reg-ind
  0x06878A: 86                   alu-reg
  0x06878B: 06 C3                ld-reg-imm
  0x06878D: 0E 65                ld-reg-imm
  0x06878F: 06 CD                ld-reg-imm
  0x068791: 96                   alu-reg
  0x068792: FE 07                alu-imm
  0x068794: CD 9C FE             call
  0x068797: 07                   rlca
  0x068798: CD 5E F9             call
  0x06879B: 07                   rlca
  0x06879C: CD AC F8             call
  0x06879F: 07                   rlca
  0x0687A0: CD F0 6F             call
  0x0687A3: 06 0E                ld-reg-imm
  0x0687A5: 00                   nop
  0x0687A6: C3 0A 86             jp
  0x0687A9: 06 CD                ld-reg-imm
  0x0687AB: 94                   alu-reg
  0x0687AC: 87                   alu-reg
  0x0687AD: 06 C3                ld-reg-imm
  0x0687AF: DF                   rst
  0x0687B0: F7                   rst
  0x0687B1: 07                   rlca
  0x0687B2: B7                   alu-reg
  0x0687B3: C8                   ret-conditional
  0x0687B4: FE 09                alu-imm
  0x0687B6: C8                   ret-conditional
  0x0687B7: FE 08                alu-imm
  0x0687B9: C9                   ret
  0x0687BA: CD 2D 89             call
  0x0687BD: 06 CD                ld-reg-imm
  0x0687BF: 55                   ld-reg-reg
  0x0687C0: 89                   alu-reg
  0x0687C1: 06 20                ld-reg-imm
  0x0687C3: 14                   inc-reg
  0x0687C4: CD 30 94             call
  0x0687C7: 05                   dec-reg
  0x0687C8: FE D0                alu-imm
  0x0687CA: 28 F8                jr-conditional
  0x0687CC: CD 12 29             call
  0x0687CF: 08                   ex-af
  0x0687D0: CD 43 89             call
  0x0687D3: 06 C3                ld-reg-imm
  0x0687D5: 48                   ld-reg-reg
  0x0687D6: AF                   alu-reg
  0x0687D7: 09                   add-pair
  0x0687D8: CD F0 98             call
  0x0687DB: 09                   add-pair
  0x0687DC: FE 01                alu-imm
  0x0687DE: 30 08                jr-conditional
  0x0687E0: CD 12 29             call
  0x0687E3: 08                   ex-af
  0x0687E4: C3 43 89             jp
  0x0687E7: 06 28                ld-reg-imm
  0x0687E9: 04                   inc-reg
  0x0687EA: C3 1A 1D             jp
  0x0687ED: 06 C5                ld-reg-imm
  0x0687EF: CD C2 2A             call
  0x0687F2: 08                   ex-af
  0x0687F3: CD 55 89             call
  0x0687F6: 06 E1                ld-reg-imm
  0x0687F8: 28 D2                jr-conditional
  0x0687FA: CD FD 98             call
  0x0687FD: 09                   add-pair
  0x0687FE: 18 DC                jr

  Searching for CP/SUB dispatch patterns in 0x0686C0-0x068800:
    0x0686F1: CP 0x1C ; JR Z,0x68708 (offset 19)
    0x0686F7: CP 0x20 ; JR Z,0x68708 (offset 13)
    0x0686FB: CP 0x21 ; JR Z,0x68708 (offset 9)
    0x068712: CP 0x99 ; JR Z,0x68790 (offset 122)
    0x068716: CP 0x90 ; JP Z,0x0687AA
    0x068736: CP 0xCC ; JR Z,0x68728 (offset -18)
    0x06873A: CP 0x89 ; JR Z,0x68756 (offset 24)
    0x06873E: CP 0x98 ; JR Z,0x68756 (offset 20)
    0x068742: CP 0xC8 ; JR Z,0x68730 (offset -22)
    0x068746: CP 0x8C ; JR Z,0x68720 (offset -42)
    0x06874A: CP 0xC9 ; JR Z,0x68730 (offset -30)
    0x06874E: CP 0x9C ; JR Z,0x68720 (offset -50)
    0x068778: CP 0x88 ; JR Z,0x68768 (offset -20)
    0x06877C: CP 0x08 ; JR Z,0x68768 (offset -24)
    0x068780: CP 0x80 ; JR Z,0x68768 (offset -28)
    0x0687C8: CP 0xD0 ; JR Z,0x687C4 (offset -8)
  Found 16 dispatch entries

--- Task 2: Operation code → handler mapping ---
  Extended disassembly 0x068600-0x0686D3 (lead-in to dispatch):
  0x068600: 25                   dec-reg
  0x068601: D0                   ret-conditional
  0x068602: FE FF                alu-imm
  0x068604: C8                   ret-conditional
  0x068605: 57                   ld-reg-reg
  0x068606: C3 B5 CB             jp
  0x068609: 07                   rlca
  0x06860A: CD 74 67             call
  0x06860D: 06 CD                ld-reg-imm
  0x06860F: E3                   ex-sp-hl
  0x068610: DB 07                in-imm
  0x068612: CD 1B 02             call
  0x068615: 08                   ex-af
  0x068616: 38 0B                jr-conditional
  0x068618: CD F5 BA             call
  0x06861B: 09                   add-pair
  0x06861C: C8                   ret-conditional
  0x06861D: CD D6 F7             call
  0x068620: 07                   rlca
  0x068621: 18 00                jr
  0x068623: FD CB 48 A6          indexed-cb-res
  0x068627: CD F5 BA             call
  0x06862A: 09                   add-pair
  0x06862B: 20 06                jr-conditional
  0x06862D: FD CB 48 46          indexed-cb-bit
  0x068631: 20 04                jr-conditional
  0x068633: FD CB 48 E6          indexed-cb-set
  0x068637: CD F3 DB             call
  0x06863A: 07                   rlca
  0x06863B: CD 2C 02             call
  0x06863E: 08                   ex-af
  0x06863F: C9                   ret
  0x068640: E6 3F                alu-imm
  0x068642: C3 1F 02             jp
  0x068645: 08                   ex-af
  0x068646: E5                   push
  0x068647: CD 5E F9             call
  0x06864A: 07                   rlca
  0x06864B: CD AC F8             call
  0x06864E: 07                   rlca
  0x06864F: CD 7A 86             call
  0x068652: 06 E1                ld-reg-imm
  0x068654: E5                   push
  0x068655: CD 54 F9             call
  0x068658: 07                   rlca
  0x068659: CD 4B 29             call
  0x06865C: 08                   ex-af
  0x06865D: E1                   pop
  0x06865E: CD 45 C7             call
  0x068661: 08                   ex-af
  0x068662: CD F0 28             call
  0x068665: 08                   ex-af
  0x068666: CD 04 F9             call
  0x068669: 07                   rlca
  0x06866A: CD 7E 86             call
  0x06866D: 06 CD                ld-reg-imm
  0x06866F: 31 F8 07             ld-pair-imm
  0x068672: CA 1A F9             jp-conditional
  0x068675: 07                   rlca
  0x068676: C3 14 F9             jp
  0x068679: 07                   rlca
  0x06867A: CD 8A 86             call
  0x06867D: 06 CD                ld-reg-imm
  0x06867F: 30 FD                jr-conditional
  0x068681: 07                   rlca
  0x068682: CD 8A 86             call
  0x068685: 06 C3                ld-reg-imm
  0x068687: 30 FD                jr-conditional
  0x068689: 07                   rlca
  0x06868A: 21 F8 05             ld-pair-imm
  0x06868D: D0                   ret-conditional
  0x06868E: CB 76                bit-test-ind
  0x068690: C0                   ret-conditional
  0x068691: CD A4 F7             call
  0x068694: 07                   rlca
  0x068695: F5                   push
  0x068696: CD 5A FE             call
  0x068699: 07                   rlca
  0x06869A: CD A8 86             call
  0x06869D: 06 F1                ld-reg-imm
  0x06869F: 21 F8 05             ld-pair-imm
  0x0686A2: D0                   ret-conditional
  0x0686A3: CA 28 FE             jp-conditional
  0x0686A6: 07                   rlca
  0x0686A7: C9                   ret
  0x0686A8: CD BD F7             call
  0x0686AB: 07                   rlca
  0x0686AC: FE 20                alu-imm
  0x0686AE: CA A7 CF             jp-conditional
  0x0686B1: 07                   rlca
  0x0686B2: FE 21                alu-imm
  0x0686B4: CA A7 CF             jp-conditional
  0x0686B7: 07                   rlca
  0x0686B8: FE 1C                alu-imm
  0x0686BA: CA 1A CF             jp-conditional
  0x0686BD: 07                   rlca
  0x0686BE: C9                   ret
  0x0686BF: C2 C4 C6             jp-conditional
  0x0686C2: 8C                   alu-reg
  0x0686C3: B2                   alu-reg
  0x0686C4: 89                   alu-reg
  0x0686C5: 8A                   alu-reg
  0x0686C6: B0                   alu-reg
  0x0686C7: 0D                   dec-reg
  0x0686C8: BC                   alu-reg
  0x0686C9: 03                   inc-pair
  0x0686CA: 7F                   ld-reg-reg
  0x0686CB: 80                   alu-reg
  0x0686CC: C7                   rst
  0x0686CD: C5                   push
  0x0686CE: C3 0F 26             jp
  0x0686D1: 0C                   inc-reg
  0x0686D2: A6                   alu-reg

  Wider CP/SUB scan 0x068500-0x068900:
    0x0686AC: CP 0x20 ; JP Z,0x07CFA7
    0x0686B2: CP 0x21 ; JP Z,0x07CFA7
    0x0686B8: CP 0x1C ; JP Z,0x07CF1A
    0x068824: CP 0x04 ; JR Z,0x68836 (offset 14)
    0x068858: CP 0xD0 ; JR Z,0x68854 (offset -8)
  Total wider entries: 21

--- Task 3: Where does 0xDA fall? ---
  0xDA is NOT in the dispatch table entries found above
  All dispatch operands (sorted):
    CP 0x08 @ 0x06877C → 0x068768
    CP 0x1C @ 0x0686F1 → 0x068708
    CP 0x20 @ 0x0686F7 → 0x068708
    CP 0x21 @ 0x0686FB → 0x068708
    CP 0x80 @ 0x068780 → 0x068768
    CP 0x88 @ 0x068778 → 0x068768
    CP 0x89 @ 0x06873A → 0x068756
    CP 0x8C @ 0x068746 → 0x068720
    CP 0x90 @ 0x068716 → 0x0687AA
    CP 0x98 @ 0x06873E → 0x068756
    CP 0x99 @ 0x068712 → 0x068790
    CP 0x9C @ 0x06874E → 0x068720
    CP 0xC8 @ 0x068742 → 0x068730
    CP 0xC9 @ 0x06874A → 0x068730
    CP 0xCC @ 0x068736 → 0x068728
    CP 0xD0 @ 0x0687C8 → 0x0687C4


--- Task 4a: LCD busy-wait disassembly (0x001210-0x001250) ---
  0x001210: B1                   alu-reg
  0x001211: 28 2F                jr-conditional
  0x001213: C5                   push
  0x001214: 01 00 01             ld-pair-imm
  0x001217: 00                   nop
  0x001218: E1                   pop
  0x001219: E5                   push
  0x00121A: AF                   alu-reg
  0x00121B: ED 42                sbc-pair
  0x00121D: 30 02                jr-conditional
  0x00121F: C1                   pop
  0x001220: C5                   push
  0x001221: FD 7E 18             ld-reg-ixd
  0x001224: E6 01                alu-imm
  0x001226: 28 F9                jr-conditional
  0x001228: C5                   push
  0x001229: 78                   ld-reg-reg
  0x00122A: B1                   alu-reg
  0x00122B: 28 0C                jr-conditional
  0x00122D: DD 7E 00             ld-reg-ixd
  0x001230: DD 23                inc-pair
  0x001232: 32 00 09             ld-mem-reg
  0x001235: E0                   ret-conditional
  0x001236: 0B                   dec-pair
  0x001237: 18 F0                jr
  0x001239: C1                   pop
  0x00123A: E1                   pop
  0x00123B: B7                   alu-reg
  0x00123C: ED 42                sbc-pair
  0x00123E: E5                   push
  0x00123F: C1                   pop
  0x001240: 18 CD                jr
  0x001242: FD 7E 24             ld-reg-ixd
  0x001245: E6 01                alu-imm
  0x001247: 28 F9                jr-conditional
  0x001249: FD 77 24             ld-ixd-reg
  0x00124C: 01 00 00             ld-pair-imm
  0x00124F: 00                   nop

--- Task 4b: min(3,7) BASELINE (no patches) ---

--- min(3,7) baseline ---
  Tokens: [0xBB, 0x0C, 0x33, 0x2B, 0x37, 0x11, 0x3F]
  MEM_INIT: OK
    [FP dispatch] PC=0x0686EF OPS=0xD3FFF8 top-of-stack byte=0xDA
    [FP dispatch] OPS area: DA 00 8A 9A 09 FE FF
    [FP dispatch] A=0x00 F=0xB3 BC=0x000000 DE=0xD00617 HL=0xD1A88A
  Result: returnHit=false errCaught=false steps=100000
  Final PC: 0x001221
  errNo: 0x8A
  OP1: [00 80 30 00 00 00 00 00 00] decoded=3.000000
  curPC: 0xD00805 (consumed 5/7 bytes)
  Top-10 hottest PCs:
    0x001221: 93432 hits
    0x00122D: 2816 hits
    0x001229: 2816 hits
    0x09BAC5: 12 hits
    0x001213: 12 hits
    0x07F7AD: 11 hits
    0x07F7B0: 11 hits
    0x07F7B4: 11 hits
    0x001228: 11 hits
    0x001239: 11 hits
  Last 32 PCs:
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
  OPS=0xD3FFF8 OPBase=0xD3FFFF
  OPS depth=7 bytes
    OPS[0] @ 0xD3FFF6: 00 2B DA 00 8A 9A 09 FE FF

--- Task 4c: min(3,7) with LCD ready flag ---

--- min(3,7) LCD ready flag ---
  Tokens: [0xBB, 0x0C, 0x33, 0x2B, 0x37, 0x11, 0x3F]
  LCD ready flag pre-set (mem[0xD00098] |= 0x01)
  MEM_INIT: OK
    [FP dispatch] PC=0x0686EF OPS=0xD3FFF8 top-of-stack byte=0xDA
    [FP dispatch] OPS area: DA 00 8A 9A 09 FE FF
    [FP dispatch] A=0x00 F=0xB3 BC=0x000000 DE=0xD00617 HL=0xD1A88A
  Result: returnHit=false errCaught=false steps=100000
  Final PC: 0x00122D
  errNo: 0x8A
  OP1: [00 80 30 00 00 00 00 00 00] decoded=3.000000
  curPC: 0xD00805 (consumed 5/7 bytes)
  Top-10 hottest PCs:
    0x00122D: 49076 hits
    0x001229: 49075 hits
    0x001213: 192 hits
    0x001221: 192 hits
    0x001228: 192 hits
    0x001239: 191 hits
    0x00120F: 191 hits
    0x09BAC5: 12 hits
    0x07F7AD: 11 hits
    0x07F7B0: 11 hits
  Last 32 PCs:
    0x001229 0x00122D 0x001229 0x00122D 0x001229 0x00122D 0x001229 0x00122D
    0x001229 0x00122D 0x001229 0x00122D 0x001229 0x00122D 0x001229 0x00122D
    0x001229 0x00122D 0x001229 0x00122D 0x001229 0x00122D 0x001229 0x00122D
    0x001229 0x00122D 0x001229 0x00122D 0x001229 0x00122D 0x001229 0x00122D
  OPS=0xD3FFF8 OPBase=0xD3FFFF
  OPS depth=7 bytes
    OPS[0] @ 0xD3FFF6: 00 2B DA 00 8A 9A 09 FE FF

--- Task 4d: min(3,7) with LCD busy-wait patched to RET ---

--- min(3,7) LCD RET patch ---
  Tokens: [0xBB, 0x0C, 0x33, 0x2B, 0x37, 0x11, 0x3F]
  LCD busy-wait PATCHED (NOP slide at 0x001221)
  MEM_INIT: OK
    [FP dispatch] PC=0x0686EF OPS=0xD3FFF8 top-of-stack byte=0xDA
    [FP dispatch] OPS area: DA 00 8A 9A 09 FE FF
    [FP dispatch] A=0x00 F=0xB3 BC=0x000000 DE=0xD00617 HL=0xD1A88A
  Result: returnHit=false errCaught=false steps=100000
  Final PC: 0x001221
  errNo: 0x8A
  OP1: [00 80 30 00 00 00 00 00 00] decoded=3.000000
  curPC: 0xD00805 (consumed 5/7 bytes)
  Top-10 hottest PCs:
    0x001221: 93432 hits
    0x00122D: 2816 hits
    0x001229: 2816 hits
    0x09BAC5: 12 hits
    0x001213: 12 hits
    0x07F7AD: 11 hits
    0x07F7B0: 11 hits
    0x07F7B4: 11 hits
    0x001228: 11 hits
    0x001239: 11 hits
  Last 32 PCs:
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
  OPS=0xD3FFF8 OPBase=0xD3FFFF
  OPS depth=7 bytes
    OPS[0] @ 0xD3FFF6: 00 2B DA 00 8A 9A 09 FE FF

--- Task 5a: max(3,7) with LCD RET patch ---

--- max(3,7) LCD RET patch ---
  Tokens: [0xBB, 0x0D, 0x33, 0x2B, 0x37, 0x11, 0x3F]
  LCD busy-wait PATCHED (NOP slide at 0x001221)
  MEM_INIT: OK
    [FP dispatch] PC=0x0686EF OPS=0xD3FFF8 top-of-stack byte=0xDB
    [FP dispatch] OPS area: DB 00 8A 9A 09 FE FF
    [FP dispatch] A=0x00 F=0xB3 BC=0x000000 DE=0xD00617 HL=0xD1A88A
  Result: returnHit=false errCaught=false steps=100000
  Final PC: 0x001221
  errNo: 0x89
  OP1: [00 80 30 00 00 00 00 00 00] decoded=3.000000
  curPC: 0xD00805 (consumed 5/7 bytes)
  Top-10 hottest PCs:
    0x001221: 93480 hits
    0x00122D: 2816 hits
    0x001229: 2816 hits
    0x09BAC5: 12 hits
    0x001213: 12 hits
    0x07F7AD: 11 hits
    0x07F7B0: 11 hits
    0x07F7B4: 11 hits
    0x001228: 11 hits
    0x001239: 11 hits
  Last 32 PCs:
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
  Missing blocks: 0x11DB
  OPS=0xD3FFF8 OPBase=0xD3FFFF
  OPS depth=7 bytes
    OPS[0] @ 0xD3FFF6: 00 2B DB 00 8A 9A 09 FE FF

--- Task 5b: gcd(12,8) with LCD RET patch ---

--- gcd(12,8) LCD RET patch ---
  Tokens: [0xBB, 0x07, 0x31, 0x32, 0x2B, 0x38, 0x11, 0x3F]
  LCD busy-wait PATCHED (NOP slide at 0x001221)
  MEM_INIT: OK
    [FP dispatch] PC=0x0686EF OPS=0xD3FFF8 top-of-stack byte=0xD5
    [FP dispatch] OPS area: D5 00 8A 9A 09 FE FF
    [FP dispatch] A=0x00 F=0xB3 BC=0x000000 DE=0xD00617 HL=0xD1A88A
  Result: returnHit=true errCaught=false steps=3386
  Final PC: 0x7FFFFE
  errNo: 0x8D
  OP1: [00 7F 58 80 02 60 35 47 57] decoded=0.588003
  curPC: 0xD00808 (consumed 8/8 bytes)
  Top-10 hottest PCs:
    0x07FAE7: 126 hits
    0x07FC0E: 90 hits
    0x07F97A: 77 hits
    0x07FBA0: 72 hits
    0x07FAEC: 72 hits
    0x07FBA6: 72 hits
    0x07FBB6: 72 hits
    0x07CB22: 70 hits
    0x07F991: 45 hits
    0x07ED92: 45 hits
  Last 32 PCs:
    0x080096 0x083841 0x083843 0x0846EA 0x08011F 0x0846EE 0x0846F2 0x08470A
    0x082BE2 0x084716 0x099ABF 0x099AC1 0x099AF1 0x07FA0D 0x07F9FF 0x07F978
    0x099A9F 0x0828D1 0x082902 0x082912 0x08292B 0x08290A 0x07F978 0x0828D5
    0x07F7BD 0x0828D9 0x07F7A8 0x07F7AD 0x07F7B0 0x07F7B4 0x0828DD 0x7FFFFE
  Missing blocks: 0x6859B, 0x7FFFFE
  OPS=0xD40002 OPBase=0xD3FFFF

--- Task 5c: max(3,7) baseline (no patches) ---

--- max(3,7) baseline ---
  Tokens: [0xBB, 0x0D, 0x33, 0x2B, 0x37, 0x11, 0x3F]
  MEM_INIT: OK
    [FP dispatch] PC=0x0686EF OPS=0xD3FFF8 top-of-stack byte=0xDB
    [FP dispatch] OPS area: DB 00 8A 9A 09 FE FF
    [FP dispatch] A=0x00 F=0xB3 BC=0x000000 DE=0xD00617 HL=0xD1A88A
  Result: returnHit=false errCaught=false steps=100000
  Final PC: 0x001221
  errNo: 0x89
  OP1: [00 80 30 00 00 00 00 00 00] decoded=3.000000
  curPC: 0xD00805 (consumed 5/7 bytes)
  Top-10 hottest PCs:
    0x001221: 93480 hits
    0x00122D: 2816 hits
    0x001229: 2816 hits
    0x09BAC5: 12 hits
    0x001213: 12 hits
    0x07F7AD: 11 hits
    0x07F7B0: 11 hits
    0x07F7B4: 11 hits
    0x001228: 11 hits
    0x001239: 11 hits
  Last 32 PCs:
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
    0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221 0x001221
  Missing blocks: 0x11DB
  OPS=0xD3FFF8 OPBase=0xD3FFFF
  OPS depth=7 bytes
    OPS[0] @ 0xD3FFF6: 00 2B DB 00 8A 9A 09 FE FF

--- Task 5d: gcd(12,8) baseline (no patches) ---

--- gcd(12,8) baseline ---
  Tokens: [0xBB, 0x07, 0x31, 0x32, 0x2B, 0x38, 0x11, 0x3F]
  MEM_INIT: OK
    [FP dispatch] PC=0x0686EF OPS=0xD3FFF8 top-of-stack byte=0xD5
    [FP dispatch] OPS area: D5 00 8A 9A 09 FE FF
    [FP dispatch] A=0x00 F=0xB3 BC=0x000000 DE=0xD00617 HL=0xD1A88A
  Result: returnHit=true errCaught=false steps=3386
  Final PC: 0x7FFFFE
  errNo: 0x8D
  OP1: [00 7F 58 80 02 60 35 47 57] decoded=0.588003
  curPC: 0xD00808 (consumed 8/8 bytes)
  Top-10 hottest PCs:
    0x07FAE7: 126 hits
    0x07FC0E: 90 hits
    0x07F97A: 77 hits
    0x07FBA0: 72 hits
    0x07FAEC: 72 hits
    0x07FBA6: 72 hits
    0x07FBB6: 72 hits
    0x07CB22: 70 hits
    0x07F991: 45 hits
    0x07ED92: 45 hits
  Last 32 PCs:
    0x080096 0x083841 0x083843 0x0846EA 0x08011F 0x0846EE 0x0846F2 0x08470A
    0x082BE2 0x084716 0x099ABF 0x099AC1 0x099AF1 0x07FA0D 0x07F9FF 0x07F978
    0x099A9F 0x0828D1 0x082902 0x082912 0x08292B 0x08290A 0x07F978 0x0828D5
    0x07F7BD 0x0828D9 0x07F7A8 0x07F7AD 0x07F7B0 0x07F7B4 0x0828DD 0x7FFFFE
  Missing blocks: 0x6859B, 0x7FFFFE
  OPS=0xD40002 OPBase=0xD3FFFF

=== SUMMARY ===
FP dispatch table entries found: 16 (narrow) / 21 (wide scan)
0xDA in dispatch: NO
Handled op codes: 0x1C, 0x20, 0x21, 0x99, 0x90, 0xCC, 0x89, 0x98, 0xC8, 0x8C, 0xC9, 0x9C, 0x88, 0x08, 0x80, 0xD0
```
