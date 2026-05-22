# Phase 403 — Decode 0x0499C0 (exit_state / notification teardown)
ROM: C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\ROM.rom
Target function: 0x0499C0 .. 0x049A22

## 1. Full Disassembly of 0x0499C0

0x0499C0  21 FF FF FF       LD HL, 0xFFFFFF    ; prologue: HL = -1 (allocate 1 local byte)
0x0499C4  CD 2C 01 00       CALL 0x00012C    ; CALL 0x00012C — build stack frame, set IX
0x0499C8  DD 36 FF 01       LD (IX-0x1), 0x01    ; (IX-1) = 0x01 — default retval = "allow"
0x0499CC  3A B9 77 D1       LD A, (0xD177B9)    ; A = (0xD177B9) — load current notification type
0x0499D0  B7                OR A    ; OR A — set flags, clear carry
0x0499D1  ED 62             SBC HL, HL    ; SBC HL, HL — HL = 0 (carry was cleared by OR A)
0x0499D3  6F                LD L, A    ; L = A — HL = zero-extended type byte
0x0499D4  CD 24 01 00       CALL 0x000124    ; CALL 0x000124 — _seqcase dispatch on type
0x0499D8  0E 00             LD C, 0x00    ; --- seqcase table (14 raw, 13 cases) follows inline ---
0x0499DA  00                NOP
0x0499DB  15                DEC D
0x0499DC  9A                SBC D
0x0499DD  04                INC B
0x0499DE  01 15 9A 04       LD BC, 0x049A15
0x0499E2  02                LD-IND-REG dest=bc src=a
0x0499E3  15                DEC D
0x0499E4  9A                SBC D
0x0499E5  04                INC B
0x0499E6  03                INC BC
0x0499E7  15                DEC D
0x0499E8  9A                SBC D
0x0499E9  04                INC B
0x0499EA  04                INC B
0x0499EB  1B                DEC DE
0x0499EC  9A                SBC D
0x0499ED  04                INC B
0x0499EE  10 1B             DJNZ 0x049A0B
0x0499F0  9A                SBC D
0x0499F1  04                INC B
0x0499F2  11 1B 9A 04       LD DE, 0x049A1B
0x0499F6  12                LD-IND-REG dest=de src=a
0x0499F7  1B                DEC DE
0x0499F8  9A                SBC D
0x0499F9  04                INC B
0x0499FA  13                INC DE
0x0499FB  1B                DEC DE
0x0499FC  9A                SBC D
0x0499FD  04                INC B
0x0499FE  14                INC D
0x0499FF  1B                DEC DE
0x049A00  9A                SBC D
0x049A01  04                INC B
0x049A02  15                DEC D
0x049A03  1B                DEC DE
0x049A04  9A                SBC D
0x049A05  04                INC B
0x049A06  16 15             LD D, 0x15
0x049A08  9A                SBC D
0x049A09  04                INC B
0x049A0A  17                RLA
0x049A0B  15                DEC D
0x049A0C  9A                SBC D
0x049A0D  04                INC B
0x049A0E  18 15             JR 0x049A25
0x049A10  9A                SBC D
0x049A11  04                INC B
0x049A12  17                RLA
0x049A13  9A                SBC D
0x049A14  04                INC B
0x049A15  18 04             JR 0x049A1B    ; ALLOW path: JR to epilogue (retval stays 0x01)
0x049A17  DD 36 FF 00       LD (IX-0x1), 0x00    ; BLOCK path: (IX-1) = 0x00 — override retval to "block"
0x049A1B  DD 7E FF          LD A, (IX-0x1)    ; epilogue: A = (IX-1) — read retval
0x049A1E  DD F9             LD SP, IX    ; LD SP, IX — tear down frame
0x049A20  DD E1             POP IX    ; POP IX — restore caller IX
0x049A22  C9                RET    ; RET

## 2. Exit-State Seqcase Table @ 0x0499D8

rawCount=14  cases=13  default=0x049A15

  0x01  Home Screen              -> 0x049A15  ALLOW (retval=1)
  0x02  Y= Equation Editor       -> 0x049A15  ALLOW (retval=1)
  0x03  Window / Format          -> 0x049A15  ALLOW (retval=1)
  0x04  Zoom                     -> 0x049A15  ALLOW (retval=1)
  0x10  Menu / Dialog            -> 0x049A1B  BLOCK (retval=0)
  0x11  Stat / List Editor       -> 0x049A1B  BLOCK (retval=0)
  0x12  Matrix Editor            -> 0x049A1B  BLOCK (retval=0)
  0x13  Graph Active             -> 0x049A1B  BLOCK (retval=0)
  0x14  Table                    -> 0x049A1B  BLOCK (retval=0)
  0x15  Distribution / Finance   -> 0x049A1B  BLOCK (retval=0)
  0x16  Catalog                  -> 0x049A1B  BLOCK (retval=0)
  0x17  Program Editor           -> 0x049A15  ALLOW (retval=1)
  0x18  Apps / Memory            -> 0x049A15  ALLOW (retval=1)
  default                          -> 0x049A15  ALLOW (retval=1)

Summary:
  ALLOW types: 0x01, 0x02, 0x03, 0x04, 0x17, 0x18 + default
  BLOCK types: 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16

## 3. Parameter and RAM Access Map

Parameters:
  - No explicit parameters passed via stack or registers
  - Reads current type from RAM at 0xD177B9 (0xD177B9)
  - Returns result in A: 0x01 = allow transition, 0x00 = block transition

RAM reads:
  0xD177B9  — current notification/screen type (1 byte)

RAM writes:
  none (pure read + classify function)

IX offsets:
  (IX-1) — local retval: initialized to 0x01, overwritten to 0x00 for BLOCK types

IY offsets:
  none

Subcalls:
  0x00012C — stack frame prologue (standard OS helper)
  0x000124 — _seqcase jump-table dispatcher (standard OS helper)

Return value:
  A = (IX-1): 0x01 if the current type is on the allow list, 0x00 if blocked

## 4. All Callers of 0x0499C0

CALL 0x0499C0 sites: 1
JP 0x0499C0 sites: 0

--- CALL at 0x049CE9 ---
  Context (preceding instructions):
    0x049CDE  DD BE 09          CP (IX+0x9)
    0x049CE1  28 2E             JR Z, 0x049D11
    0x049CE3  DD 4E 09          LD C, (IX+0x9)
    0x049CE6  06 00             LD B, 0x00
    0x049CE8  C5                PUSH BC
  Call + aftermath:
    0x049CE9  CD C0 99 04       CALL 0x0499C0

## 5. Selector (Setup) Jump Table @ 0x049D3A

rawCount=14  cases=13  default=0x049DEC

Each case handler for the selector table (first few instructions):

  Key 0x01 (Home Screen) -> 0x049D77:
    0x049D77  DD 7E 06          LD A, (IX+0x6)
    0x049D7A  32 B8 77 D1       LD (0xD177B8), A
    0x049D7E  18 79             JR 0x049DF9

  Key 0x02 (Y= Equation Editor) -> 0x049D80:
    0x049D80  DD 7E 06          LD A, (IX+0x6)
    0x049D83  32 B8 77 D1       LD (0xD177B8), A
    0x049D87  18 70             JR 0x049DF9

  Key 0x03 (Window / Format) -> 0x049D89:
    0x049D89  DD 7E 06          LD A, (IX+0x6)
    0x049D8C  32 B8 77 D1       LD (0xD177B8), A
    0x049D90  18 67             JR 0x049DF9

  Key 0x04 (Zoom) -> 0x049D92:
    0x049D92  DD 7E 06          LD A, (IX+0x6)
    0x049D95  32 B8 77 D1       LD (0xD177B8), A
    0x049D99  18 5E             JR 0x049DF9

  Key 0x10 (Menu / Dialog) -> 0x049D9B:
    0x049D9B  DD 7E 06          LD A, (IX+0x6)
    0x049D9E  32 B8 77 D1       LD (0xD177B8), A
    0x049DA2  18 55             JR 0x049DF9

  Key 0x11 (Stat / List Editor) -> 0x049DA4:
    0x049DA4  DD 7E 06          LD A, (IX+0x6)
    0x049DA7  32 B8 77 D1       LD (0xD177B8), A
    0x049DAB  18 4C             JR 0x049DF9

  Key 0x12 (Matrix Editor) -> 0x049DAD:
    0x049DAD  DD 7E 06          LD A, (IX+0x6)
    0x049DB0  32 B8 77 D1       LD (0xD177B8), A
    0x049DB4  18 43             JR 0x049DF9

  Key 0x13 (Graph Active) -> 0x049DB6:
    0x049DB6  DD 7E 06          LD A, (IX+0x6)
    0x049DB9  32 B8 77 D1       LD (0xD177B8), A
    0x049DBD  18 3A             JR 0x049DF9

  Key 0x14 (Table) -> 0x049DBF:
    0x049DBF  DD 7E 06          LD A, (IX+0x6)
    0x049DC2  32 B8 77 D1       LD (0xD177B8), A
    0x049DC6  18 31             JR 0x049DF9

  Key 0x15 (Distribution / Finance) -> 0x049DC8:
    0x049DC8  DD 7E 06          LD A, (IX+0x6)
    0x049DCB  32 B8 77 D1       LD (0xD177B8), A
    0x049DCF  18 28             JR 0x049DF9

  Key 0x16 (Catalog) -> 0x049DD1:
    0x049DD1  DD 7E 06          LD A, (IX+0x6)
    0x049DD4  32 B8 77 D1       LD (0xD177B8), A
    0x049DD8  18 1F             JR 0x049DF9

  Key 0x17 (Program Editor) -> 0x049DDA:
    0x049DDA  DD 7E 06          LD A, (IX+0x6)
    0x049DDD  32 B8 77 D1       LD (0xD177B8), A
    0x049DE1  18 16             JR 0x049DF9

  Key 0x18 (Apps / Memory) -> 0x049DE3:
    0x049DE3  DD 7E 06          LD A, (IX+0x6)
    0x049DE6  32 B8 77 D1       LD (0xD177B8), A
    0x049DEA  18 0D             JR 0x049DF9

  Default -> 0x049DEC:
    0x049DEC  DD 7E 06          LD A, (IX+0x6)
    0x049DEF  32 B8 77 D1       LD (0xD177B8), A
    0x049DF3  18 04             JR 0x049DF9

Observation: All 13 case bodies are uniform — each loads (IX+6) into A and stores it to 0xD177B8, then jumps to the common epilogue.

Selector function epilogue @ 0x049DF9:
0x049DF5  DD 36 FF 02       LD (IX-0x1), 0x02    ; default case: (IX-1) = 0x02 (error / unrecognized type)
0x049DF9  F1                POP AF    ; POP AF — restore interrupt state
0x049DFA  E2 FF 9D 04       JP PO, 0x049DFF    ; JP PO — if interrupts were disabled, skip EI
0x049DFE  FB                EI    ; EI — re-enable interrupts
0x049DFF  DD 7E FF          LD A, (IX-0x1)    ; A = (IX-1) — read retval (0x01=ok, 0x02=unrecognized)
0x049E02  DD F9             LD SP, IX    ; LD SP, IX — tear down frame
0x049E04  DD E1             POP IX    ; POP IX — restore caller IX
0x049E06  C9                RET    ; RET

## 6. Cross-Reference: exit_state (0x0499C0) vs dispatch (0x049CCA)

Call flow inside 0x049CCA when type changes:

  1. Read new requested type from (IX+9)
  2. Compare against current type at 0xD177B9
  3. If different:
     a. CALL 0x0499C0 — asks "should we allow leaving the current type?"
     b. If A=1 (allow): proceed
     c. Recursive self-call to flush the current state
     d. Write new type to 0xD177B9
     e. CALL 0x049A23 — process the key/value for the new type
     f. Run the selector table dispatch — stores (IX+6) into D177B8
  4. If same type: skip straight to step (e)

Verification — the single call site at 0x049CE9:
0x049CE0  09                ADD HL, BC
0x049CE1  28 2E             JR Z, 0x049D11
0x049CE3  DD 4E 09          LD C, (IX+0x9)
0x049CE6  06 00             LD B, 0x00
0x049CE8  C5                PUSH BC    ; push requested type onto stack for exit_state's frame
0x049CE9  CD C0 99 04       CALL 0x0499C0    ; CALL 0x0499C0 — check if we can leave the current type
0x049CED  C1                POP BC    ; B7 = OR A — test return value
0x049CEE  B7                OR A    ; JR Z to skip (if A=0, exit_state blocked the transition)
0x049CEF  28 1C             JR Z, 0x049D0D
0x049CF1  3A B9 77 D1       LD A, (0xD177B9)

Seqcase table comparison:

  exit_state table (0x0499D8): routes by CURRENT type -> allow/block
  selector table   (0x049D3A): routes by NEW type -> store value

  Type    exit_state action    selector action
  ------  ------------------   ----------------
  0x01  Home Screen       ALLOW              store (IX+6)->0xD177B8
  0x02  Y= Equation Editor  ALLOW              store (IX+6)->0xD177B8
  0x03  Window / Format   ALLOW              store (IX+6)->0xD177B8
  0x04  Zoom              ALLOW              store (IX+6)->0xD177B8
  0x10  Menu / Dialog     BLOCK              store (IX+6)->0xD177B8
  0x11  Stat / List Editor  BLOCK              store (IX+6)->0xD177B8
  0x12  Matrix Editor     BLOCK              store (IX+6)->0xD177B8
  0x13  Graph Active      BLOCK              store (IX+6)->0xD177B8
  0x14  Table             BLOCK              store (IX+6)->0xD177B8
  0x15  Distribution / Finance  BLOCK              store (IX+6)->0xD177B8
  0x16  Catalog           BLOCK              store (IX+6)->0xD177B8
  0x17  Program Editor    ALLOW              store (IX+6)->0xD177B8
  0x18  Apps / Memory     ALLOW              store (IX+6)->0xD177B8

## 7. Notification Lifecycle Architecture

The notification/screen-context system at 0x049CCA is a synchronous
state machine with three distinct phases:

### Phase 1: Teardown Gate (exit_state @ 0x0499C0)

  Purpose: Determine if the OS should allow leaving the current screen context.
  Mechanism: Reads the current type from D177B9, runs a seqcase lookup.
  Result: A=1 (allow) or A=0 (block).

  The allow/block classification:
    ALLOW (types 0x01-0x04, 0x17-0x18, default):
      Home, Y=, Window, Zoom, Program Editor, Apps/Memory, and any
      unrecognized type. These contexts can be freely exited.
    BLOCK (types 0x10-0x16):
      Menu/Dialog, Stat/List Editor, Matrix Editor, Graph Active,
      Table, Distribution/Finance, Catalog. These contexts resist
      being exited — the caller sees A=0 and skips the transition.

  Interpretation: "lightweight" screen contexts (basic editors, menus)
  allow transitions freely. "Heavyweight" contexts (modal dialogs,
  active graph, stat editors) block transitions — likely because they
  have unsaved state or active rendering that must be explicitly dismissed.

### Phase 2: State Commit (inside 0x049CCA core)

  If exit_state returned ALLOW:
    1. Recursive self-call flushes the old type/value
    2. New type written to 0xD177B9
    3. CALL 0x049A23 processes the key/value payload

### Phase 3: Value Store (selector table @ 0x049D3A)

  The seqcase at 0x049D3A routes by the NEW type.
  All 13 cases are identical: store (IX+6) -> 0xD177B8.
  Unrecognized types get retval=0x02 (error indicator).

### Lifecycle Summary

  Caller pushes (type, value) -> CALL 0x049CCA
    |
    +-- Same type as current? -> skip teardown, go to process_key
    |
    +-- Different type?
         |
         +-- CALL 0x0499C0 (exit_state): can we leave current context?
         |     A=0 -> BLOCKED, return without changing anything
         |     A=1 -> ALLOWED, continue
         |
         +-- Recursive flush of old state
         +-- Commit new type to 0xD177B9
         +-- CALL 0x049A23 (process_key on payload)
         +-- Selector dispatch: store value to 0xD177B8
         +-- Return

## 8. Verdict

0x0499C0 is a "teardown gate" or "exit guard" function. It does NOT perform
any actual teardown or cleanup. It is a pure classifier:

  Input:  current notification type from 0xD177B9
  Output: A = 0x01 (allow transition) or A = 0x00 (block transition)

The function has exactly ONE caller: the dispatcher at 0x049CCA (at address
0x049CE9). It is always called when a new notification arrives with a different
type than the current one. If it returns 0 (block), 0x049CCA skips the
entire state transition and returns immediately.

The allow/block split corresponds to a lightweight-vs-heavyweight context
distinction: basic editors and navigation contexts (types 0x01-0x04, 0x17-0x18)
allow free switching, while modal/interactive contexts (types 0x10-0x16) resist
being preempted by a different notification type.

Suggested label: `_exit_state_guard` or `_can_exit_current_context`

