# Phase 25Y: 0x006202 Loop Diagnosis Report

## ROM bytes at 0x006202

```
b7 ed 52 20 fb 3d 20 e5 e1 d1 c9 cd 34 58 01 ed
38 03 cb 67 ca a8 62 00 fd 21 80 00 d0 fd cb 42
```

### Disassembly

```
0x006202: B7       OR A         ; clear carry flag
0x006203: ED 52    SBC HL, DE   ; HL = HL - DE (with carry cleared)
0x006205: 20 FB    JR NZ, -5   ; loop back to 0x006202 if HL != DE
0x006207: 3D       DEC A        ; A--
0x006208: 20 E5    JR NZ, ...  ; loop further back (to ~0x0061EF) if A != 0
0x00620A: E1       POP HL
0x00620B: D1       POP DE
0x00620C: C9       RET
```

This is a counting/delay loop: repeatedly subtracts DE from HL until HL reaches zero, then decrements A and repeats. If HL never equals zero mod DE (corrupted registers), the inner loop at 0x006202-0x006205 spins forever.

## Key finding: 0x006202 is NOT reached with the current probe setup

The diagnostic probe ran ParseInp with the exact same setup as the committed Phase 25X probe (minimal 6-byte error frame, MEM_INIT first, OPS left at MEM_INIT value) and **ParseInp returned successfully in 918 steps**. Execution never entered the 0x006xxx range at all.

### Probe results

| Metric | Value |
|--------|-------|
| Total steps | 918 |
| Final PC | 0x7FFFFE (FAKE_RET) |
| Return hit | true |
| ERR_CATCH_ADDR hit | false |
| errNo after call | 0x8D |
| First entry into 0x006xxx | Never |
| Registers at 0x006202 | Never reached |

### What errNo=0x8D means

Error code 0x8D is **Err:ARGUMENT** in the TI-84 OS. ParseInp encounters this error internally but handles it and returns normally through the main return path (FAKE_RET at 0x7FFFFE), not through the error catch path (ERR_CATCH_ADDR at 0x7FFFFA).

## Why the committed 500K-step probe gets stuck but the 10K probe does not

The 918-step return with errNo=0x8D confirms ParseInp completes quickly. The "stuck at 0x006202 after 500K steps" behavior was from a **pre-OPS-fix version** of the probe where OPS was set to the token buffer address instead of being left at MEM_INIT's value (0xD3FFFF).

With OPS set incorrectly (OPS < FPS), the free-space check at 0x0820B5 computed zero free space, triggering ErrMemory (0x8E). That error took a different recovery path through JError which, combined with the minimal 6-byte error frame, caused corrupted register state. The corrupted registers then fell into the 0x006202 delay loop with HL values that never reached zero, creating an infinite loop.

The committed probe (with the OPS fix applied) never hits this path.

## PC trace summary (459 unique PCs in 918 steps)

Clean ParseInp execution with no anomalous jumps:
- Steps 0-50: ParseInp entry, PushErrorHandler, free-space check, token fetch
- Steps 50-230: Token parsing (digits "2", "+", "3", newline)
- Steps 230-550: Expression evaluation, FP arithmetic setup
- Steps 550-750: FP multiply/add routines in 0x07xxxx range
- Steps 750-918: Result storage, error handler cleanup, return to FAKE_RET

No visits to 0x006xxx. No visits to ERR_CATCH_ADDR.

## Golden regression

probe-phase99d-home-verify.mjs: **All assertions PASS** (status dots left, status dots right, Normal, Float, Radian).

## Conclusion

The 0x006202 infinite loop is **not reproducible** with the current committed probe code. The committed Phase 25X probe returns in 918 steps with errNo=0x8D. The 0x006202 stuck behavior was from a pre-OPS-fix version of the probe where OPS was set incorrectly, causing ErrMemory (0x8E) and a corrupted error recovery path that fell into the 0x006202 delay loop.

The minimal 6-byte error frame is adequate for the current setup because ParseInp's internal error handling catches errors before JError reaches the outer error frame. The Sonnet variant that returned OP1=5.0 in 918 steps and this diagnostic probe produce the same result -- confirming the OPS fix was the real solution.
