# Phase 562: Decode 0x08C308 — BPP Mode Test

## Summary

Function at 0x08C308 is a **BPP mode test predicate** (9 bytes, 5 instructions).
It tests bit 2 of RAM address 0xD000C6 and returns the result in the Z flag.

**Session 553 claim "BIT 2, D000C6 BPP mode" is CONFIRMED in semantics but INCORRECT in encoding.**

Session 553 implied the encoding was `FD CB 46 56` (IY-relative addressing).
The actual encoding uses absolute HL addressing: `PUSH HL; LD HL,0xD000C6; BIT 2,(HL); POP HL; RET`.

## Full Annotated Disassembly

```
Address   Bytes               Instruction         Comment
--------  ------------------  ------------------  --------------------------------
08C308    E5                  PUSH HL             ; save HL (non-destructive)
08C309    21 C6 00 D0         LD HL, 0xD000C6     ; point HL at BPP flag byte
08C30D    CB 56               BIT 2, (HL)         ; test bit 2 of (0xD000C6)
08C30F    E1                  POP HL              ; restore HL
08C310    C9                  RET                 ; return with Z flag set
```

## Analysis

### Structure
- NOT a simple `BIT n,(IY+d); RET` 2-instruction stub like 0x0800B8
- Uses absolute addressing through HL (5 instructions, 9 bytes)
- Preserves HL via PUSH/POP so the function is completely non-destructive

### Why not IY-relative?
- 0xD000C6 = IY+0x46 (IY base is 0xD00080)
- A `BIT 2,(IY+0x46); RET` would be only 5 bytes (FD CB 46 56 C9)
- The OS chose the longer HL-based sequence (9 bytes) — possibly for historical reasons,
  or because this function predates the IY convention in this ROM region

### Flag byte mapping
- **RAM address**: 0xD000C6
- **IY offset**: IY+0x46 (if using IY base 0xD00080)
- **Bit tested**: bit 2
- **Semantics**: 
  - Bit 2 = 0 → Z=1 → caller takes Z branch → 8bpp mode
  - Bit 2 = 1 → Z=0 → caller takes NZ branch → 16bpp mode

### Caller context
- Called from 0x0A1A9D (row-to-VRAM address calculator)
- After `CALL 0x08C308`, the caller branches:
  - Z → 8bpp path (stride = 320 bytes/row)
  - NZ → 16bpp path (stride = 640 bytes/row)

### Comparison with 0x0800B8 (reference stub)
| Property          | 0x0800B8           | 0x08C308              |
|-------------------|--------------------|-----------------------|
| Size              | 5 bytes            | 9 bytes               |
| Instructions      | 2                  | 5                     |
| Encoding          | IY-relative        | Absolute via HL       |
| Flag byte         | IY+0x44 (D000C4)  | D000C6 (= IY+0x46)   |
| Bit tested        | bit 5              | bit 2                 |
| Side effects      | None               | None (PUSH/POP HL)    |
| Pattern           | BIT/RET            | PUSH/LD/BIT/POP/RET   |

## Conclusion

Session 553's label **"BIT 2, D000C6 BPP mode"** is semantically correct:
- It does test bit 2
- It does read D000C6
- It is indeed the BPP mode predicate

The only inaccuracy was the implied encoding (IY-relative vs actual absolute HL addressing).

## Hex Dump (first 16 bytes for reference)

```
08c308  e5 21 c6 00 d0 cb 56 e1 c9
```