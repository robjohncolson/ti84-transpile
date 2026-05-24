# Phase 434 Report: 0x0025E8 = _setflag

## Summary

Address 0x0025E8 is the ZDS II C runtime `_setflag` helper. It sets CPU flags (Z, S) from the 16-bit return value in HL without destroying any registers. This was the last unidentified target in the low-ROM OS API jump table (0x000080-0x000654). All 374 wrapper slots are now fully accounted for.

## Function Details

| Property | Value |
|----------|-------|
| Address | 0x0025E8 |
| Wrapper slot | 0x000204 |
| Size | 13 bytes |
| Instructions | 9 |
| Name | `_setflag` |
| Inputs | HL (16-bit value to test) |
| Outputs | F (Z if HL==0, S if bit 15 set) |
| Preserved | A, BC, DE, HL, IX, IY, SP |
| CALL targets | none |
| RAM refs | none |
| Port I/O | none |

## Disassembly

```
0x0025E8  E5              PUSH HL          ; save caller's return value
0x0025E9  D5              PUSH DE          ; save DE
0x0025EA  16 00           LD D,0x00        ; zero D
0x0025EC  1E 00           LD E,0x00        ; zero E (DE = 0)
0x0025EE  B7              OR A             ; clear carry for SBC
0x0025EF  52 ED 52        SIL SBC HL,DE   ; 16-bit HL - 0, sets Z/S flags
0x0025F2  D1              POP DE           ; restore DE
0x0025F3  E1              POP HL           ; restore HL (flags preserved)
0x0025F4  C9              RET              ; return with flags set
```

## How It Works

1. Saves HL and DE on the stack.
2. Zeroes DE to create a neutral operand.
3. Clears carry with `OR A` so that `SBC HL,DE` computes `HL - 0` exactly.
4. Executes `SBC HL,DE` with `SIL` prefix (16-bit Z80 mode), which sets Z if HL's low 16 bits are zero and S if bit 15 is set.
5. Restores DE and HL from the stack. POP does not affect flags, so the Z/S result survives.
6. Returns. The caller branches on Z or NZ immediately after.

The `SIL` prefix forces 16-bit operation even though the eZ80 is in ADL (24-bit) mode. This ensures the test matches C's `int` semantics (16-bit on ZDS II for eZ80).

## Caller Analysis

| Category | Count |
|----------|-------|
| Direct (CALL 0x0025E8) | 36 |
| Via wrapper (CALL 0x000204) | 139 |
| **Total** | **175** |

### Post-Call Branch Pattern

| Branch instruction | Count | Percentage |
|-------------------|-------|------------|
| JR Z | 59 | 33.7% |
| JP NZ | 56 | 32.0% |
| JR NZ | 47 | 26.9% |
| JP Z | 11 | 6.3% |
| Other (CALL) | 2 | 1.1% |

173 of 175 callers (98.9%) immediately branch on Z/NZ. This is the definitive signature of a compiler-inserted flag-test helper.

### Caller Distribution

- **Low ROM (0x0000-0x01FFFF)**: 36 direct callers in OS kernel code (USB stack, link layer, memory management).
- **Mid ROM (0x02xxxx-0x04xxxx)**: 62 wrapper callers in OS application layer (home screen, editor, graph).
- **High ROM (0x05xxxx-0x07xxxx)**: 77 wrapper callers in math library and TI-BASIC interpreter.

The 139:36 wrapper-to-direct ratio shows that most OS code uses the stable ABI wrapper at 0x000204, while the 36 direct callers are low-level kernel routines that bypass the jump table for speed.

## Identification Rationale

### Why _setflag and not something else

| Candidate | Verdict | Reason |
|-----------|---------|--------|
| `_setflag` / `_isetflag` | **Match** | Sets flags from HL, preserves all regs, 175 callers all branch on Z/NZ |
| `_sext` (sign-extend) | No | _sext would modify HL to extend the sign; this preserves HL |
| `_testhl` | Synonym | Some toolchains use this name; functionally identical |
| `_cmpzero` | No | Not a standard ZDS II name |
| `_memcmp` / `_strcmp` | No | Those take pointer arguments and loop over memory |
| `_mulu` / `_divu` | No | Those return a computed result; this only sets flags |

### Confirming evidence

1. **Canonical structure**: PUSH-zero-SBC-POP-RET is the textbook _setflag implementation for Z80/eZ80.
2. **Call count**: 175 sites is consistent with compiler-inserted code (every `if (func())` needs it).
3. **Branch pattern**: 98.9% Z/NZ branching matches the single purpose of testing a return value.
4. **Neighborhood**: sits between `_lshru` (0x002553) and `_seqcase` (0x002623), both compiler runtime helpers.
5. **Non-destructive**: preserves every register including HL itself, which is necessary because the caller may need the return value after testing it.

## Neighborhood in ROM

```
0x002553 = _lshru      (unsigned right shift)
0x0025E8 = _setflag    (this function, 13 bytes)
0x0025F5 = (next function, not yet decoded)
0x002623 = _seqcase    (dense sequential case dispatcher)
```

## Impact on Coverage

This completes identification of all 374 low-ROM wrapper targets. The jump table at 0x000080-0x000654 is now fully mapped:

- 374 JP thunks, each 4 bytes (0x000080 to 0x000654)
- All targets are ZDS II C runtime functions
- 0x0025E8 (`_setflag`) was the last unknown entry

## Probe

Run `node TI-84_Plus_CE/probe-phase434-decode-0025E8.mjs` to reproduce the full disassembly, caller list, and branch statistics.
