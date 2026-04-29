# Phase 135 — GraphPars Eval Trace Report

## Summary

GraphPars at 0x09986C throws ERR:UNDEFINED because it constructs the WRONG equation name in OP1. The equation index used in the name formula is 0 (graphMode) instead of 1 (Y1 index). ChkFindSym never finds the equation — the error occurs BEFORE any token evaluation.

## Execution Flow (96 steps)

### Steps 1-7: Name Construction (THE BUG)

1. `0x09986C: LD A,(0xD01474)` — reads graphMode = 0 (function mode)
2. `0x091DFB: CALL 0x06C73C` — checks BIT 4,(IY+2) = grfFuncM (set)
3. `0x091DFF: JR NZ, 0x091DEB` — takes function-mode path
4. `0x091DEB: LD HL, 0x005E10` — loads name table base (H=0x5E, L=0x10)
5. `0x091DD9: DEC A; ADD A,L` — A = (0-1)+0x10 = 0xFF+0x10 = **0x0F** (WRONG!)
6. Stores to OP1: `[0x03, 0x5E, 0x0F, 0x00, ...]`

**Correct behavior** (for Y1, A=1): DEC A→0, ADD 0+0x10=0x10. OP1 would be `[0x03, 0x5E, 0x10, 0x00...]`.

But wait — OP1[1]=0x5E is also wrong. For Y1 it should be `[0x03, 0x10, 0x00...]`. The 0x5E comes from H (high byte of 0x005E10 table address) being stored into OP1[1] by the `.SIS LD (0x05F8),HL` instruction.

**Analysis**: The name construction formula:
- HL = table base (0x005E10 for function mode, 0x005E40 for parametric, 0x005E20 for sequence)
- `DEC A; ADD A,L` → name byte 2 = (index-1) + table_L
- `LD L,0x03` then `.SIS LD (0x05F8),HL` → OP1[0]=0x03 (type), OP1[1]=H=0x5E

This means OP1[1] is ALWAYS 0x5E regardless of equation. The name byte that distinguishes Y1/Y2/etc. is OP1[2] (stored at 0xD005FA). For Y1: OP1=[0x03, 0x5E, 0x10, 0x00...].

### Steps 8-46: OPS Allocation + FPS Push

- `LD A,8` sets equation count limit
- Pushes OPS entries (steps 10-32), allocating space for 2 entries on OPS
- OP1 is never re-written — the bad name persists
- FPS push (step 44 via LDI chain at 0x07F978): 9 bytes from 0xD0230E pushed to FP stack
- FPS updated from 0xD1A881 to 0xD1A88A

### Step 47: PushErrorHandler

- `0x061DEF: PushErrorHandler` with HL=0x0998CA (recovery address)
- errSP updated from 0xD1A85D to 0xD1A85A

### Steps 48-51: GraphPars Inner Setup

- `0x099898: CALL 0x099921` — enters equation evaluation setup
- `0x099921: CALL 0x099B81` — clears IY flags (IX offsets 6,7; IY bits at +3E, +20, +58, +20, +1A, +1F)
- `0x099925: CALL 0x099B18` — calls ChkFindSym wrapper

### Steps 52-71: ChkFindSym FAILS

- `0x099B18: CALL 0x08383D` (ChkFindSym)
- `0x08383D → 0x080080 → 0x07F7BD`: type classification (OP1[0]=0x03 → EquObj)
- `0x0846EA: FindSym` — walks VAT starting at progPtr=0xD3FFF9
- `0x084716: AND 0x3F; SBC HL,BC` — boundary check
- **Step 70**: HL=0xD3FFF9, compare against BC=?
- **Step 71**: `0x099B1C: JP C, 0x061D3A` — **CARRY SET = NOT FOUND**
- FindSym does NOT find an equation named [0x03, 0x5E, 0x0F...] because the VAT has [0x03, 0x10, ...] (Y1 with tY1=0x10 name)

### Steps 72-83: First JError → PushErrorHandler Recovery

- `0x061D3A: LD A,0x8D` (ErrUndefined)
- `0x061DB2: JError` — stores errNo=0x8D, does flash unlock sequence
- `0x061DBA: LD SP,(errSP)` — restores SP from errSP=0xD1A85A
- `0x061DD1: PopErrorHandler` — pops error frame, restores OPS/FPS/OPBase
- **JP (HL) → 0x0998CA** (recovery address set by PushErrorHandler)

### Steps 84-96: Post-Error Handler (SECOND JError)

- `0x0998CA: RES 3,(IY+0x48); RES 5,(IY+0x14)` — clears flags
- `AND 0x7F` — A=0x8D → A=0x0D
- `CP 0x08` — 0x0D > 0x08 → NC (carry not set)
- `JR NC, +0x14` → jumps to 0x0998EC
- `0x0998EC: JP 0x061DB6` — jumps to JError AGAIN with A=0x0D
- **Second JError reads errSP=0xD1A85D (our original frame)**
- PopErrorHandler at this SP doesn't have a valid frame → lands at 0x000D02 (garbage)

## Root Cause

**The equation name construction is wrong because A=graphMode(0) is being used as equation index.**

The routine at `0x091DD9` computes: `OP1[2] = (A - 1) + table_base_L`

- For function mode, table_base_L = 0x10
- With A=0 (graphMode): OP1[2] = 0xFF + 0x10 = 0x0F (wraps) → wrong
- With A=1 (Y1 index): OP1[2] = 0 + 0x10 = 0x10 (tY1) → correct

GraphPars is reading `LD A,(0xD01474)` to determine graph mode, then the SAME A value flows into the name formula as if it were an equation index. On a real calculator, GraphPars is called from a higher-level routine that iterates over equations. The equation index is likely stored in a RAM variable or register that we're not initializing.

## Infrastructure State

- **Parser pointers NOT accessed**: begPC/curPC/endPC are never read by GraphPars in this trace (error occurs before they matter). Pre-seeding them (Test B) had NO effect.
- **FP dispatch NOT reached**: The error is at ChkFindSym, long before any token evaluation or FP table lookup.
- **ParseInp NOT called**: GraphPars never reaches the token evaluator.
- **PushErrorHandler correctly used**: GraphPars sets up an error frame at 0x099890 with recovery=0x0998CA.
- **Error recovery works once**: The first JError correctly returns to 0x0998CA via the pushed frame.
- **Second error at 0x0998EC**: After recovery, the post-init code checks errNo (AND 0x7F → 0x0D), compares against 8, and re-throws error for codes > 8.

## Fix Direction

The fix is NOT about parser state, FP tables, or error frames. It's about the equation index.

### Option 1: Set the equation index RAM variable before calling GraphPars
There must be a RAM variable that holds the current equation index during graph rendering. GraphPars at 0x09986C reads graphMode but expects the equation iteration context to already be set up. Investigate what RAM slot holds the "current Y-equation number" and seed it to 1.

### Option 2: Call GraphPars at 0x099874 (past name construction)
The alternative entry at 0x099874 skips name construction and expects OP1 already set. Caller at 0x06C47B uses this entry. Manually set OP1=[0x03, 0x10, 0x00...] (Y1 name) then call 0x099874.

### Option 3: Use a higher-level graph entry
Callers like 0x06E029 or the graph context handler at 0x05A7B6 likely set up the iteration state correctly before calling GraphPars. Investigate these callers to understand the full equation iteration loop.

## Key Addresses Discovered

| Address | Purpose |
|---------|---------|
| 0x09986C | GraphPars full entry (reads graphMode, builds name) |
| 0x099874 | GraphPars body entry (OP1 must be pre-set) |
| 0x091DD9 | Equation name builder (expects A=equation index) |
| 0x091DEB | Function mode path (HL=0x005E10, tY base = L=0x10) |
| 0x091DF1 | Parametric mode path (HL=0x005E40) |
| 0x091DD1 | Sequence mode path (HL=0x005E20) |
| 0x0998CA | GraphPars error recovery handler |
| 0x0998EC | Post-error re-throw path (errNo > 8 causes JP 0x061DB6) |
| 0x099B18 | GraphPars ChkFindSym call site |
| 0x099B1C | `JP C, 0x061D3A` — throws ERR:UNDEFINED on FindSym failure |

## Next Steps

1. **Determine the correct equation index source**: The equation index for function mode Y1 should be 1. Either: (a) find the RAM variable that holds it, or (b) set A=1 before the 0x091DD9 routine runs.
2. **Try Option 2**: Call 0x099874 with OP1 manually set to [0x03, 0x10, 0x00...] (correct Y1 name). This bypasses the name construction bug entirely.
3. **After fix**: GraphPars should find Y1 in the VAT, then proceed to token evaluation (steps past 0x099B1C). THAT is where parser state and FP infrastructure will matter.
