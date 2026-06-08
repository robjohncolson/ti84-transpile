# Phase 563: Decode 0x0800A0 — Split/Scroll Flag Predicate

## Summary

**0x0800A0** is a conditional flag-test stub (8 bytes) that tests `BIT 3,(IY+0x14)` — the "split screen" flag at RAM address `0xD00094`. Session 78's identification as "CheckSplitFlag entry" is **CONFIRMED**.

## Disassembly

```
0800A0  FD CB 14 5E   BIT 3, (IY+0x14)   ; test bit 3 of 0xD00094
0800A4  28 17         JR Z, 0x0800BD      ; if bit clear -> test bit 0 instead
0800A6  BF            CP A                ; set Z=1 (A==A always true)
0800A7  C9            RET                 ; return with Z=1
```

### JR Z target (0x0800BD):
```
0800BD  FD CB 14 46   BIT 0, (IY+0x14)   ; test bit 0 of 0xD00094
0800C1  C9            RET                 ; return with Z reflecting bit 0
```

## Behavior

- **If bit 3 of IY+0x14 is SET** (split screen active): forces Z=1 via `CP A` and returns immediately. The caller (0x0A2802 scroll setup) sees Z=1 unconditionally.
- **If bit 3 of IY+0x14 is CLEAR** (no split): falls through to test bit 0 of IY+0x14. Returns Z reflecting that bit.

This is a two-tier predicate: "if split mode is on, always return Z=1; otherwise return whether bit 0 is set."

## RAM Address

- `IY+0x14` = `0xD00080 + 0x14` = **0xD00094** (TI-OS flags byte 0x14)
  - Bit 3: split-screen mode flag
  - Bit 0: secondary condition (likely "full-screen graph" or similar display mode)

## Context: Neighboring Stubs (0x080084-0x0800C0)

| Address | Bytes | Function |
|---------|-------|----------|
| 0x080084 | 21B | Multi-CP comparator: returns Z if A==0x15, 0x17, 0x05, 0x16, or 0x06 (token IDs) |
| 0x080099 | 7B  | DE range check: returns NZ if D!=0, else compares E to 0x3F |
| **0x0800A0** | **8B** | **Split flag predicate: BIT 3,(IY+0x14) with fallthrough** |
| 0x0800A8 | 21B | Complex predicate: BIT 7,(IY+0x09), CALL 0x080259, BIT 5,(IY+0x45), BIT 5,(IY+0x44) |
| 0x0800B8 | 5B  | Simple stub: BIT 5,(IY+0x44); RET |
| 0x0800BD | 5B  | Simple stub: BIT 0,(IY+0x14); RET |

## Caller Context

Called from **0x0A2802** (SCROLL_SETUP_AND_FILL) for scroll mode determination. The Z flag result tells the caller whether to use split-screen scroll behavior or full-screen scroll behavior.

## Verification

- Session 78 claim "CheckSplitFlag entry (IY+0x14 bit 3)": **CONFIRMED**
- Byte encoding `FD CB 14 5E` matches exactly
- Function is 8 bytes (not a simple 5-byte BIT/RET — it has conditional branching)
