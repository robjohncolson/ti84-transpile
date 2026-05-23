# Phase 415: Trace 0x0150C2 — Completion Dispatcher

## Summary

0x0150C2 is a **generic notification/event dispatcher** used widely across the USB/notification subsystem (18 callers). It is fundamentally different from the simple `JP (IY)` trampoline at 0x002288:

- **0x002288**: 2 bytes, 1 instruction — just `JP (IY)`. A bare indirect call.
- **0x0150C2**: 103 bytes, 37 instructions — a full stack-frame-based dispatcher with RAM state management, conditional callback invocation, and cleanup.

## Answer to Key Question

0x0150C2 is **NOT channel-specific**. It is a generic dispatcher called by many subsystems (USB protocol FSM at 0x012xxx, 0x013xxx, notification channels, etc.). Channel 3's callback at 0x01516F uses it the same way Channel 2's broader subsystem does. The difference is that Channel 2's completion callback (0x015185) uses the simpler 0x002288 trampoline with IY pre-loaded from D143EA, while many other code paths (including Channel 3's callback at 0x01517F) use 0x0150C2 which has its own IY-loading and conditional dispatch logic built in.

## Disassembly of 0x0150C2

```
0x0150C2  LD HL,0xFFFFFD          ; -3 (allocate 3-byte stack frame)
0x0150C6  CALL 0x002197           ; stack frame setup helper
0x0150CA  LD BC,(0xD176BD)        ; load from RAM
0x0150CF  [ld-indexed-pair]       ; IX-relative store (saves BC to frame)
0x0150D2  LD HL,(0xD176F2)        ; load another RAM value
0x0150D6  CALL 0x0021C2           ; comparison/check helper
0x0150DA  JR NZ,0x0150E4          ; skip update if NZ
0x0150DC  LD BC,(IX+0x06)         ; load argument from caller's frame
0x0150DF  LD (0xD176F2),BC        ; update D176F2 with argument
0x0150E4  XOR A                   ; A = 0
0x0150E5  LD (0xD176FB),A         ; clear D176FB
0x0150E9  LD A,(0xD176FC)         ; read D176FC
0x0150ED  OR A                    ; test if zero
0x0150EE  JR NZ,0x015114          ; skip special handling if nonzero
0x0150F0  LD BC,0x000003          ; BC = 3
0x0150F4  LD HL,(IX+0x06)         ; load argument
0x0150F7  OR A                    ; clear carry
0x0150F8  SBC HL,BC               ; HL = arg - 3
0x0150FA  JR NZ,0x015114          ; skip if arg != 3
0x0150FC  LD A,(0xD1772D)         ; read D1772D
0x015100  OR A                    ; test
0x015101  JR Z,0x015114           ; skip if zero
0x015103  LD BC,0x000000          ; BC = 0
0x015107  PUSH BC                 ; push 0 as argument
0x015108  CALL 0x006EDA           ; call helper
0x01510C  POP BC                  ; clean stack
0x01510D  OR A                    ; test return
0x01510E  JR Z,0x015114           ; skip if zero
0x015110  CALL 0x0019B5           ; secondary action
0x015114  LD HL,(IX-0x03)         ; load saved value from frame
0x015117  CALL 0x0021C2           ; comparison/check helper
0x01511B  JR Z,0x015124           ; skip callback if zero
0x01511D  LD IX,(IX-0x03)         ; load callback pointer
0x015120  CALL 0x002288           ; JP (IY) trampoline
0x015124  LD SP,IX                ; restore stack
0x015126  POP IX                  ; restore IX
0x015128  RET
```

## Key Findings

### 1. Stack Frame Protocol
0x0150C2 sets up a standard 3-byte stack frame via `CALL 0x002197`. The caller pushes an argument at IX+6 (the value pushed onto the stack before `CALL 0x0150C2`). This is consistent with the calling pattern seen at all 18 call sites, which all push BC before calling.

### 2. RAM Locations Accessed

| Address | Direction | Purpose |
|---------|-----------|---------|
| D176BD | Read | Loaded into BC, saved to stack frame — likely a callback pointer or context |
| D176F2 | Read/Write | Conditionally updated with the caller's argument |
| D176FB | Write | Cleared to 0 unconditionally |
| D176FC | Read | Gate flag — if nonzero, skips the "arg == 3" special path |
| D1772D | Read | Secondary gate — checked only when arg == 3 and D176FC == 0 |

### 3. Special Case: Argument == 3
When the stack argument equals 3 AND D176FC == 0 AND D1772D != 0, the dispatcher calls:
- 0x006EDA with argument 0 (pushed on stack)
- If 0x006EDA returns nonzero, calls 0x0019B5

This is noteworthy because **Channel 3's callback at 0x01516F/0x01517F always passes argument 3** (`LD BC,0x000003`). So this special path is specifically triggered by Channel 3 completions.

### 4. Conditional Callback Dispatch
After the special-case handling, the dispatcher checks the saved value from the stack frame (originally from D176BD). If nonzero, it loads it into IX and calls `JP (IY)` via 0x002288. This means D176BD holds an optional callback pointer that gets invoked on completion.

### 5. Relationship to 0x002288
0x0150C2 **uses** 0x002288 internally as its final dispatch mechanism. It's a higher-level wrapper that:
1. Manages a stack frame
2. Conditionally updates D176F2
3. Clears D176FB
4. Handles special arg==3 logic
5. Conditionally dispatches through the same JP (IY) trampoline

### 6. Caller Distribution (18 call sites + 1 JP)

| Address Range | Count | Context |
|---------------|-------|---------|
| 0x000458 | 1 | Jump table entry (JP, not CALL) |
| 0x00AC28 | 1 | Unknown subsystem |
| 0x0121CD-0x0121E5 | 3 | Menu/app subsystem (near 0x0121EF hook target) |
| 0x01228F-0x012331 | 4 | Protocol FSM handlers |
| 0x013405-0x0138A4 | 4 | Protocol FSM handlers |
| 0x015142-0x01517F | 2 | Notification channel completion |
| 0x0154AA-0x015538 | 2 | Notification subsystem |

The dispatcher is **generic** — used by the protocol FSM, menu system, and both notification channels.

## New RAM Addresses Discovered

- **D176BD**: Completion callback pointer (loaded and conditionally dispatched)
- **D176F2**: State value — conditionally overwritten by caller's argument
- **D176FB**: Status/flag — unconditionally cleared on every dispatch
- **D176FC**: Gate flag — controls whether arg==3 special path runs
- **D1772D**: Secondary gate — enables 0x006EDA + 0x0019B5 call chain

## New Code Targets Discovered

- **0x002197**: Stack frame setup (allocates N bytes on stack via IX)
- **0x0021C2**: Comparison/validation helper (sets Z flag)
- **0x006EDA**: Called when arg==3 path triggers (unknown purpose)
- **0x0019B5**: Secondary action called if 0x006EDA returns nonzero

## Comparison with 0x002288

| Feature | 0x0150C2 | 0x002288 |
|---------|----------|----------|
| Size | 103 bytes | 2 bytes |
| Stack frame | Yes (3 bytes) | No |
| RAM access | 5 locations | None |
| Conditional logic | Yes (arg==3 special case) | None |
| Callers | 18 CALL + 1 JP = 19 | 23 CALL + 1 JP = 24 |
| Final dispatch | Via 0x002288 | Direct JP (IY) |
| Role | High-level completion dispatcher | Low-level indirect call primitive |

## Conclusion

0x0150C2 is a **generic completion dispatcher** that wraps the low-level `JP (IY)` trampoline with state management. It is not Channel 3-specific, but it does contain a **Channel 3-aware special case** (triggered when argument == 3). This special case calls 0x006EDA and optionally 0x0019B5, which are new targets worth tracing in future sessions.
