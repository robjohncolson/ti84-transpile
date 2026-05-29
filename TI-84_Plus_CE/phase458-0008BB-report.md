# Phase 458 - Trace `0x0008BB`

Generated from static ROM bytes in `ROM.rom` and the new probe `probe-phase458-trace-0008BB.mjs`.

## Linear Disassembly

The first linear block starting at `0x0008BB` is only five instructions long:

```asm
0x0008BB  2A 00 01 02   ld hl, (0x020100)
0x0008BF  01 5A A5 00   ld bc, 0x00A55A
0x0008C3  B7            or a
0x0008C4  52 ED 42      .sil sbc hl, bc
0x0008C7  C9            ret
```

That means the requested probe should stop immediately at the first `RET`.

## Answers

1. **How large is the function (start to first RET/JP)?**  
   `0x0008BB..0x0008C7`, which is `0x0D` bytes total (13 bytes, 5 instructions).

2. **Does it read `D00587`? Where?**  
   No. There is no `LD A,(0xD00587)` or any other direct `D00587` access in the first linear block.

3. **Does it clear bit 3 of `(IY+0)`?**  
   No. There are no `IY`-indexed `BIT/SET/RES` operations here at all.

4. **What CALL targets does it have?**  
   None. The block contains no `CALL` instructions.

5. **What is the control flow (branches, comparisons)?**  
   It is straight-line code with no branches. The only comparison-style behavior is:
   - `LD HL,(0x020100)`
   - `LD BC,0x00A55A`
   - `OR A`
   - `.sil SBC HL,BC`
   - `RET`

   `OR A` clears carry before the subtract, so this behaves like a compare against the constant `0xA55A`. In other words, `0x0008BB` looks like a guard/sentinel check, not a key decoder.

6. **How does the scan code get processed?**  
   It does not get processed inside the `0x0008BB` entry block. The bytes disprove the initial assumption that this routine directly reads `D00587`.

   Adjacent caller bytes at `0x001713` make the role clearer:

   ```asm
   0x001713  call 0x0008BB
   0x001717  ret nz
   0x001718  ld a, (0xD177BA)
   0x00171C  or a
   0x00171D  ret nz
   0x00171E  ld bc, 0x020000
   0x001722  push bc
   0x001723  call 0x0067F8
   ```

   So `0x0008BB` only sets flags for the caller. If its compare returns `NZ`, `_GetCSC` exits early. If it returns `Z` and `D177BA` is also zero, execution falls through to `0x0067F8`.

## Conclusion

`0x0008BB` is a tiny flag-setting gate, not the scan-code consumer. In this ROM snapshot:

- there is **no** `D00587` read in the `0x0008BB` entry block,
- there are **no** calls or `IY` flag mutations there,
- the block appears to compare a value loaded from `0x020100` against `0x00A55A`,
- actual key/scan-code handling must happen elsewhere in the chain.

If the next trace needs the real scan-code consumer, the more relevant targets are the later key path routines such as `0x0067F8` and the banked `D00587` drain at `0x03FA09`.
