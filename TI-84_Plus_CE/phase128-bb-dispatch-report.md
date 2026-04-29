# Phase 128: 0xBB-Prefix Two-Byte Token Dispatch Investigation

## Date
2026-04-29

## Summary

Investigated the ParseInp stall at PC=0x001221 when processing two-byte tokens (0xBB prefix, e.g., min(3,7)). Found the stall is an LCD busy-wait loop, not a missing block. The deeper issue is a DATA TYPE error (errNo=0x8A) raised during the min() FP evaluation because the internal token code (0xDA) isn't recognized by the general FP comparison dispatcher at 0x066350.

## Key Findings

### 1. Stall at 0x001221 is LCD Busy-Wait
- Address 0x001221 contains: `LD A,(IY+0x18); AND 1; JR Z,$-5`
- This polls bit 0 of `(IY+0x18)` = mem[0xD00098] (LCD ready flag)
- The loop never terminates because no peripheral sets this bit
- Setting mem[0xD00098] |= 0x01 before ParseInp resolves the loop

### 2. Missing Block at 0x0011DA (Fixed)
- One missing block found at 0x0011DA (error handler cleanup path)
- Added seed via `phase128bb-seeds.txt`; re-transpiled; no longer missing

### 3. Two-Byte Token Dispatch Works Correctly
The 0xBB-prefix dispatch chain works:
- 0x099A3A -> 0x09B5EA (0xBB handler entry)
- 0x09B5EA calls 0x09BAAF (read second byte)
- Second byte 0x0C + 0xCE = 0xDA (internal code for min()): `ADD A, 0xCE` at 0x09B61C
- Dispatch continues through 0x09AEBC -> argument parsing

### 4. Argument Parsing Works
- First argument "3" parsed into OP1 = 3.0 (step ~331)
- 3.0 pushed to FPS when comma is encountered (FPS depth goes from 0 to 9)
- Second argument "7" parsed into OP1 = 7.0 (step ~521)
- Close paren 0x11 read at step ~570
- curPC advances 5 bytes (through digit "7"), consuming all argument tokens

### 5. DATA TYPE Error in FP Comparison (Root Cause)
The min() evaluation raises DATA TYPE error (0x8A) because:
1. After close paren, code at 0x09B03D restores A = B = 0xDA (min's internal code)
2. DEC L dispatch (L=2 for 2 arguments) selects CALL 0x066350 (general FP comparison)
3. 0x066350 searches a 15-entry dispatch table at 0x0686D3 via CPIR for operation code 0xDA
4. 0xDA is NOT in the table: [0x1A, 0x19, 0x70, 0x71, 0x82, 0x83, 0xF0, 0x81, 0x93, 0xF1, 0x1D, 0x1E, 0x1B, 0x1C, 0xA6]
5. Secondary type check at 0x06670E-0x06672A also fails (checks 0x1B-0x1E)
6. Raises DATA TYPE error at 0x061D2C

### 6. Error Handler Doesn't Reach ERR_CATCH_ADDR
- errSP at error time points to 0x09B086 (min()'s internal error frame), not our ERR_CATCH_ADDR
- The "prev frame" pointer is 0x000100 (not our catcher)
- Error handler falls through to LCD display code -> busy-wait stall

## Seeds Added
`TI-84_Plus_CE/phase128bb-seeds.txt`:
- 0x0011DA (error handler cleanup block)
- 0x001200, 0x001213, 0x001221, 0x001228, 0x001239, 0x001242, 0x001249 (LCD output routine blocks)

## Transpiler Changes
`scripts/transpile-ti84-rom.mjs`: Added `phase128bbSeedsPath` and integrated into seed loading.

## Verification
- Golden regression (probe-phase99d-home-verify.mjs): 5/5 PASS
- Test harness: 14 PASS, 1 FAIL (pre-existing "No-key result")
- probe-phase127-tokens.mjs: 8*8*8 arithmetic control still PASS

## Next Steps (Unblocking Two-Byte Tokens)
The 0xDA operation code needs to be recognized by the FP comparison dispatcher. Possible approaches:
1. **Patch the dispatch table at 0x0686D3**: Add 0xDA to the 15-entry table (requires ROM patching, not ideal)
2. **Intercept at 0x09B0E5**: Before the DEC L dispatch, convert A=0xDA to a recognized comparison code (e.g., 0x70 for "+" or a simple real comparison code)
3. **Emulate min() at the runtime level**: In cpu-runtime.js, intercept the FP comparison call and handle 0xDA directly by comparing OP1 and OP2 and returning the smaller
4. **Investigate alternative dispatch path**: The min() function might take a different path on real hardware that we're missing due to a conditional branch that depends on uninitialized state
