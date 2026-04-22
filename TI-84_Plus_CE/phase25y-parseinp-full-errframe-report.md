# Phase 25Y: ParseInp with Full PushErrorHandler Frame + Token Terminator Variants

## Date
2026-04-22

## Objective
Test whether a full 18-byte PushErrorHandler error frame (instead of the minimal 6-byte catch frame used in Phase 25X) allows ParseInp to produce OP1=5.0, and whether the token terminator byte matters.

## Results Summary

| Variant | Tokens | Steps | Termination | errNo | OP1 | curPC | curPC > endPC? |
|---------|--------|-------|-------------|-------|-----|-------|----------------|
| A (newline 0x3F) | 32 70 33 3f | 37 | missing_block @ 0x061DD1 | 0x8D (ErrSyntax) | 0 | 0xD00800 | no |
| B (tEnter 0x04) | 32 70 33 04 | 37 | missing_block @ 0x061DD1 | 0x8D (ErrSyntax) | 0 | 0xD00800 | no |
| C (null 0x00) | 32 70 33 00 | 37 | missing_block @ 0x061DD1 | 0x8D (ErrSyntax) | 0 | 0xD00800 | no |

**No variant produced OP1=5.0.**

## Error Frame Setup
The full 18-byte PushErrorHandler frame was correctly built:
```
SP+0:  0x061E27 (normal-return cleanup stub)
SP+3:  0x061DD1 (error-restore stub)
SP+6:  0x000000 (OPS - OPBase delta = 0, both at 0xD3FFFF)
SP+9:  0x000000 (FPS - FPSbase delta = 0, both at 0xD1A881)
SP+12: 0x000000 (previous errSP = none)
SP+15: 0x7FFFFA (ERR_CATCH sentinel address)
```
errSP was set to point to SP (the base of this frame).

## Root Cause: Missing Transpiled Block at 0x061DD1

The error-restore stub at **0x061DD1 has no transpiled block** in ROM.transpiled.js. It is referenced as a constant (loaded into HL by PushErrorHandler at 0x061DEF), but the transpiler never lifted it as an entry point.

### Execution trace (last 20 PCs)
```
0x0846ea 0x08011f 0x0846ee 0x0846f2 0x08470a 0x082be2
0x084716 0x099b1c 0x061d3a 0x061db2 0x03e1b4 0x03e1be
0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4
0x061dba 0x061dd1
```

The path: ParseInp -> internal error -> JError (0x061DB2) -> loads errSP -> pop AF (discards 0x061E27) -> RET to 0x061DD1 -> **MISSING BLOCK**.

### The error fires before token parsing begins
curPC stays at 0xD00800 (the start of tokens), meaning the parser triggers ErrSyntax (0x8D) before it even reads the first token byte. This suggests ParseInp requires additional state setup beyond just MEM_INIT + token pointers + error frame.

## Key Finding: Transpiler Must Lift 0x061DD1

The error-restore stub at 0x061DD1 performs critical recovery work:
- POP DE -> OPS-OPBase delta, restores OPS = OPBase + delta
- POP DE -> FPS-FPSbase delta, restores FPS = FPSbase + delta
- POP HL -> previous errSP, writes to (0xD008E0)
- LD A, (0xD008DF) -> loads errNo
- RET -> returns to HL payload address

Without this block, error recovery is impossible. Adding 0x061DD1 as a forced entry point in the transpiler should fix the missing_block termination and let the error frame work as designed.

## Next Steps
1. **Add 0x061DD1 as a forced entry point** in the transpiler (`scripts/transpile-ti84-rom.mjs`) and regenerate ROM.transpiled.js
2. **Investigate why ParseInp fires ErrSyntax before reading tokens** -- likely missing parser state (flags, mode bytes, or pointer initialization beyond begPC/curPC/endPC)
3. Re-run this probe after fixing the transpiler gap

## Golden Regression
probe-phase99d-home-verify.mjs: 0 FAIL (all passing)
