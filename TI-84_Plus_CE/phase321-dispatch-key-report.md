# Phase 321: Recursive dispatch_key() Mechanism

## Overview

Two structurally identical `dispatch_key()` functions serve as the TI-84 Plus CE OS's screen-state transition engine:

| Function | Address | Callers | Flash Bank |
|----------|---------|---------|------------|
| dispatch_key A | 0x00883C | 78 | A (low ROM) |
| dispatch_key B | 0x049CCA | 166 | B (mid ROM) |

State stored at **D177B9** (current screen state). Auxiliary byte at **D177B8** (sub-state/context).

---

## 1. Full Disassembly of 0x00883C

### Stack Frame Setup (ZDS II C calling convention)

```
; dispatch_key(key_code, state)
; Parameters on stack: IX+6 = key_code (u8), IX+9 = state (u8)

0x00883C: 21 FF FF FF        LD HL, 0xFFFFFF       ; frame size marker
0x008840: CD 97 21 00        CALL 0x002197          ; __frameset (saves IX, sets up stack frame)
```

`0x002197` = ZDS II `__frameset`: `EX (SP),IX; LEA IX,0; ADD IX,SP; ADD IX,SP; LD SP,IX; EX (SP),IX` -- saves old IX, establishes IX as frame pointer, reserves local space. The 0xFFFFFF argument means 1 byte of locals at IX-1.

### Local variable: IX-1 = return_code (initialized to 0)

```
0x008844: DD 36 FF 00        LD (IX-1), 0           ; return_code = 0 (SUCCESS)
```

### Save interrupt state, disable interrupts

```
0x008848: ED 57              LD A, I                ; get interrupt register (captures IFF2 in P/V flag)
0x00884A: F5                 PUSH AF                ; save interrupt state on stack
0x00884B: F3                 DI                     ; disable interrupts (critical section)
```

### State comparison: is current state == requested state?

```
0x00884C: 3A B9 77 D1        LD A, (D177B9)         ; A = current_state
0x008850: DD BE 09           CP (IX+9)              ; compare with requested state parameter
0x008853: 28 2E              JR Z, 0x008883         ; if same -> skip to key_handler phase
```

### Exit-handler call (state != requested state)

When the state is different, dispatch_key calls an exit handler for the current state, then recurses:

```
0x008855: DD 4E 09           LD C, (IX+9)           ; C = requested_state
0x008858: 06 00              LD B, 0                ; BC = requested_state (zero-extended)
0x00885A: C5                 PUSH BC                ; push state argument
0x00885B: CD E3 85 00        CALL 0x0085E3          ; call exit_handler_A(state)
0x00885F: C1                 POP BC                 ; clean up stack
0x008860: B7                 OR A                   ; test return value in A
0x008861: 28 1C              JR Z, 0x00887F         ; if exit_handler returned 0 -> goto set_flag
```

### RECURSION: dispatch_key calls itself

If the exit handler returned non-zero (state transition approved):

```
0x008863: 3A B9 77 D1        LD A, (D177B9)         ; A = current_state (may have changed)
0x008867: 4F                 LD C, A                ; C = current_state
0x008868: 06 00              LD B, 0
0x00886A: C5                 PUSH BC                ; push current_state as 'state' parameter
0x00886B: 01 00 00 00        LD BC, 0               ;
0x00886F: C5                 PUSH BC                ; push key_code = 0 (exit signal)
0x008870: CD 3C 88 00        CALL 0x00883C          ; *** RECURSIVE CALL: dispatch_key(0, current_state) ***
0x008874: C1                 POP BC                 ; clean stack (key_code)
0x008875: C1                 POP BC                 ; clean stack (state)
```

### Post-recursion: update D177B9

```
0x008876: DD 7E 09           LD A, (IX+9)           ; A = originally requested state
0x008879: 32 B9 77 D1        LD (D177B9), A         ; update global state to requested state
0x00887D: 18 04              JR 0x008883            ; jump to key_handler phase
```

### Set return_code = 1 (exit handler rejected)

```
0x00887F: DD 36 FF 01        LD (IX-1), 1           ; return_code = 1 (REJECTED)
```

### Key handler phase: dispatch by current state

```
0x008883: DD 7E FF           LD A, (IX-1)           ; A = return_code
0x008886: B7                 OR A                   ; test flags
0x008887: C2 44 89 00        JP NZ, 0x008944        ; if return_code != 0 -> goto epilogue
```

### Call key_handler for the key_code

```
0x00888B: DD 4E 06           LD C, (IX+6)           ; C = key_code parameter
0x00888E: 06 00              LD B, 0                ; BC = key_code (zero-extended)
0x008890: C5                 PUSH BC                ; push key_code
0x008891: CD 3A 86 00        CALL 0x00863A          ; call key_handler_A(key_code)
0x008895: C1                 POP BC                 ; clean stack
0x008896: DD 77 FF           LD (IX-1), A           ; return_code = key_handler result
0x008899: DD 7E FF           LD A, (IX-1)
0x00889C: B7                 OR A                   ; test result
0x00889D: C2 44 89 00        JP NZ, 0x008944        ; if non-zero -> goto epilogue (key handled)
```

### State-specific dispatch via _seqcase

If key_handler returned 0 (key not consumed), dispatch by state:

```
0x0088A1: DD 7E 09           LD A, (IX+9)           ; A = state parameter
0x0088A4: B7                 OR A                   ; clear carry, set flags (also clears HL via SBC below)
0x0088A5: ED 62              SBC HL, HL             ; HL = 0
0x0088A7: 6F                 LD L, A                ; HL = state (zero-extended u8 -> u24)
0x0088A8: CD 1B 21 00        CALL 0x00211B          ; _seqcase(HL) -- inline table follows
```

### _seqcase inline table (DATA, not code)

Format: `[u16 count][count x {u8 selector, u24 target}][u24 default]`

```
; Table at 0x0088AC (11 entries):
;   state=0x00 -> 0x0088DD    (state 0: boot/neutral)
;   state=0x01 -> 0x0088E6    (state 1: Home screen)
;   state=0x02 -> 0x0088EF    (state 2: Window)
;   state=0x03 -> 0x0088F8    (state 3: Zoom)
;   state=0x04 -> 0x008901    (state 4: Trace)
;   state=0x10 -> 0x00890A    (state 16: Y= editor)
;   state=0x11 -> 0x008913    (state 17: Table setup)
;   state=0x12 -> 0x00891C    (state 18: Format)
;   state=0x13 -> 0x008925    (state 19: Calc)
;   state=0x14 -> 0x00892E    (state 20: Graph)
;   state=0x15 -> 0x008937    (state 21: Table)
;   DEFAULT   -> 0x008940     (unrecognized state)
```

### Case handlers (all identical structure)

Each case handler for states 0x00-0x15 stores key_code into D177B8 and jumps to epilogue:

```
; Example: state 0x00 handler at 0x0088DD:
0x0088DD: DD 7E 06           LD A, (IX+6)           ; A = key_code
0x0088E0: 32 B8 77 D1        LD (D177B8), A         ; store key_code as sub-state
0x0088E4: 18 5E              JR 0x008944            ; goto epilogue

; state 0x01 handler at 0x0088E6 (identical pattern):
0x0088E6: DD 7E 06           LD A, (IX+6)
0x0088E9: 32 B8 77 D1        LD (D177B8), A
0x0088ED: 18 55              JR 0x008944
; ... all 11 case handlers are identical: store key_code to D177B8, jump to epilogue
```

### Default handler (unrecognized state)

```
0x008940: DD 36 FF 02        LD (IX-1), 2           ; return_code = 2 (UNRECOGNIZED STATE)
```

### Epilogue: restore interrupt state, return

```
0x008944: F1                 POP AF                 ; restore saved AF (interrupt state)
0x008945: E2 4A 89 00        JP PO, 0x00894A        ; if P/V clear (interrupts were disabled) -> skip EI
0x008949: FB                 EI                     ; re-enable interrupts (they were enabled before)
0x00894A: DD 7E FF           LD A, (IX-1)           ; A = return_code (return value)
0x00894D: DD F9              LD SP, IX              ; restore stack
0x00894F: DD E1              POP IX                 ; restore IX
0x008951: C9                 RET
```

The epilogue at **0x008834** (referenced as the "_seqcase epilogue") is the same return stub:
```
0x008834: DD 7E FF           LD A, (IX-1)
0x008837: DD F9              LD SP, IX
0x008839: DD E1              POP IX
0x00883B: C9                 RET
```

---

## 2. Parameter Passing

ZDS II C calling convention with stack-based parameters:

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| key_code | IX+6 | u8 | Key/command code being dispatched |
| state | IX+9 | u8 | Target screen state |
| (return) | A | u8 | 0=success, 1=rejected by exit handler, 2=unrecognized state |
| (local) | IX-1 | u8 | return_code accumulator |

The IX+6 and IX+9 offsets reflect the ZDS II 24-bit stack frame: 3 bytes for saved IX + 3 bytes for return address = 6 bytes before first parameter. The second parameter (state) is at IX+9 (3 bytes after key_code in a 24-bit push).

---

## 3. Recursion Mechanism

The recursion occurs at **0x008870** (`CALL 0x00883C`), which is a direct self-call.

### When recursion happens:

1. Caller requests `dispatch_key(key_code, new_state)`
2. `current_state = (D177B9)` is read
3. If `current_state != new_state`:
   - Call `exit_handler_A(new_state)` at 0x0085E3
   - If exit handler returns non-zero (transition approved):
     - **Recursive call**: `dispatch_key(0, current_state)` -- key_code=0 is the "exit" signal
     - After recursion returns, update D177B9 to the new state
   - If exit handler returns zero (transition rejected):
     - Set return_code = 1, skip key handling entirely

### Arguments for recursive call:

```
key_code = 0     (exit/cleanup signal -- not a real key)
state    = current_state (from D177B9 at time of call)
```

The recursive call with key_code=0 tells the current screen "you are being exited." This allows the current screen to run its cleanup/exit handler.

---

## 4. Recursion Guard

Infinite recursion is prevented by the **state comparison at 0x008850**:

```
0x00884C: LD A, (D177B9)     ; current_state
0x008850: CP (IX+9)          ; compare with requested state
0x008853: JR Z, 0x008883     ; if EQUAL -> skip recursion, go directly to key handler
```

When the recursive call `dispatch_key(0, current_state)` executes:
- The requested state parameter = current_state (same value that's already in D177B9)
- The comparison `(D177B9) == IX+9` is TRUE
- The function jumps directly to the key handler phase (0x008883)
- No exit handler is called, no further recursion happens

**Maximum recursion depth: 1 level.** The recursive call always passes `state = current_state`, which guarantees the state comparison succeeds on the recursive invocation, preventing further recursion.

Additionally, even if state were somehow different (due to an ISR modifying D177B9 between calls -- interrupts are disabled so this cannot happen), the exit handler return value provides a second guard: if `exit_handler_A` returns 0, no recursion occurs.

---

## 5. _seqcase Dispatch

### How _seqcase is invoked:

```
0x0088A1: LD A, (IX+9)       ; A = state
0x0088A4: OR A               ; clear carry
0x0088A5: SBC HL, HL         ; HL = 0
0x0088A7: LD L, A            ; HL = state (u8 -> u24)
0x0088A8: CALL 0x00211B      ; _seqcase -- inline data follows immediately
```

### _seqcase implementation at 0x00211B (key-value scanning variant):

This is the **scanning** variant of _seqcase (distinct from the sequential-indexing variant at 0x002623). Table format: `[u16 count][count x {u8 selector_key, u24 target_addr}][u24 default_addr]`.

The function:
1. `EX (SP), IY` -- IY now points to inline table data (the return address), old IY saved on stack
2. Saves AF, BC, DE
3. `LEA IY, IY+2` -- skip past u16 count field
4. Loads count from the header
5. **Linear scan loop**: for each entry, compares the u8 selector_key against the low byte of the selector (L register). If match found, loads the u24 target, patches the return address on the stack, and returns to the matched target
6. If no match: patches return address to the default target
7. Restores DE, BC, AF
8. `EX (SP), IY` -- restore original IY, put computed target on stack
9. `EX (SP), HL; RET` -- effectively `JP` to the computed target

### Entry point difference:

| Function | _seqcase call | Via |
|----------|---------------|-----|
| dispatch_key A (0x00883C) | CALL 0x00211B | Direct |
| dispatch_key B (0x049CCA) | CALL 0x000124 | Vector (JP 0x00211B) |

Both reach the same implementation.

---

## 6. State Transition Example: state=0x13, key=0x08

Scenario: `dispatch_key(0x08, 0x13)` -- pressing GRAPH key (0x08) targeting Calc state (0x13).

### Step 1: State comparison
- Read D177B9. Assume current_state = 0x01 (Home screen)
- CP: 0x01 != 0x13 -> state transition needed, do not jump

### Step 2: Exit handler
- Push 0x13 (requested state)
- CALL 0x0085E3 (exit_handler_A with state=0x13)
- Suppose exit handler returns A=1 (transition approved)

### Step 3: Recursive call
- Read D177B9 again -> A = 0x01 (current state = Home)
- Push 0x01 (state = current_state)
- Push 0x00 (key_code = 0, exit signal)
- **CALL 0x00883C** -- `dispatch_key(0, 0x01)`

### Step 3a: Inside recursive call
- Read D177B9 -> 0x01
- CP with IX+9 (0x01): **EQUAL** -> JR to key handler phase (no recursion!)
- return_code = 0 (initialized)
- OR A: return_code == 0, so proceed to key handler
- CALL 0x00863A (key_handler_A with key_code=0)
  - key_handler processes the "exit" signal for state 0x01 (Home screen cleanup)
  - Returns A (key_handler result). Assume returns 0 (not consumed).
- State dispatch via _seqcase with HL = 0x01:
  - Matches state=0x01 -> jumps to 0x0088E6
  - 0x0088E6: LD A,(IX+6)=0x00; LD (D177B8),A -> stores key_code 0x00 into sub-state
  - JR to epilogue
- Restore interrupts, return A = return_code (0)

### Step 4: Post-recursion
- Pop stack (clean up arguments)
- LD A,(IX+9) = 0x13
- LD (D177B9), A = 0x13 -- **state is now 0x13 (Calc)**

### Step 5: Key handler phase
- return_code still 0 -> proceed
- CALL 0x00863A (key_handler_A with key_code=0x08)
  - key_handler processes key 0x08 in state 0x13. Returns result.
  - If returns 0 -> fall through to _seqcase
- _seqcase with HL = 0x13:
  - Matches state=0x13 -> jumps to 0x008925
  - 0x008925: LD A,(IX+6)=0x08; LD (D177B8),0x08 -> stores key_code into sub-state

### Step 6: Epilogue
- Restore interrupt state, return return_code in A

### Net effect:
- D177B9: 0x01 -> 0x13 (Home -> Calc)
- D177B8: updated to 0x08 (last key processed)
- Home screen exit handler was called (via recursive dispatch_key(0, 0x01))
- Calc screen entry handler was called with key 0x08

---

## 7. Comparison with 0x049CCA (Flash Bank B)

### Byte-by-byte comparison

Function A: 0x00883C (276 bytes), Function B: 0x049CCA (276 bytes).
**171 bytes differ** -- all differences are relocated address operands.

### Address correspondence table

| Purpose | Function A | Function B |
|---------|-----------|-----------|
| Self (recursive call) | 0x00883C | 0x049CCA |
| __frameset | 0x002197 | 0x00012C |
| exit_handler | 0x0085E3 | 0x0499C0 |
| key_handler | 0x00863A | 0x049A23 |
| _seqcase | 0x00211B (direct) | 0x000124 (vector -> 0x00211B) |
| epilogue JP NZ target | 0x008944 | 0x049DF9 |
| All _seqcase case targets | 0x0088xx range | 0x049Dxx range |

### Structural identity confirmed:

- Same opcodes at every position (ignoring address operands)
- Same local variable layout (IX-1 = return_code)
- Same parameter offsets (IX+6 = key_code, IX+9 = state)
- Same control flow (state comparison -> exit handler -> recursion -> key handler -> _seqcase -> epilogue)
- Same interrupt save/restore pattern
- Same recursion guard mechanism

### Key difference: _seqcase table size

| | Function A | Function B |
|---|-----------|-----------|
| Case count | 11 | 14 |
| States covered | 0x00-0x04, 0x10-0x15 | 0x00-0x04, 0x10-0x18 |
| Extra states in B | -- | 0x16, 0x17, 0x18 |

Function B handles 3 additional states (0x16=Apps/Memory, 0x17, 0x18) that function A does not. This suggests function B is the "primary" dispatcher handling all OS screens, while function A handles a subset. The 166 vs 78 caller count ratio (2.1x) supports this.

### Sub-function: Exit-handler dispatcher

Each dispatch_key has a paired exit-handler dispatcher that is called during recursion:

| | Function A | Function B |
|---|-----------|-----------|
| Address | 0x008952 | 0x049E08 |
| _seqcase count | 10 | 14 |
| States covered | 0x00-0x04, 0x10-0x14 | 0x00-0x04, 0x10-0x18 |

The exit-handler dispatcher at 0x008952:
- Sets up frame, reads D177B9 (current state)
- Dispatches via _seqcase on current state
- Each case handler reads D177B8 (sub-state) into IX-1 (return value)
- This is the **inverse** of the main _seqcase: main stores key_code TO D177B8, exit handler reads FROM D177B8

---

## Summary

`dispatch_key()` is a **single-level recursive state machine**:

1. **If state transition needed**: call exit handler, then `dispatch_key(0, current_state)` to run the exit path for the old state, then update D177B9 to the new state
2. **If already in target state** (or after recursion returns): call key handler, then dispatch by state via _seqcase to store the key_code into D177B8
3. **Recursion is bounded to depth 1** by the state comparison guard: the recursive call passes state=current_state, guaranteeing the comparison succeeds and no further recursion occurs
4. **Interrupts are disabled** throughout the entire dispatch to prevent ISR-driven state corruption
5. **Return codes**: 0=success, 1=exit handler rejected transition, 2=unrecognized state

The two instances (A at 0x00883C, B at 0x049CCA) are Flash A/B parallel copies with identical structure but different address references and slightly different state coverage (B handles 3 more states).
