# Phase 408: D141B5 (Final Key Output Buffer) — Consumer Analysis

## Summary

**0xD141B5** is the **final key output buffer** — a single-byte RAM slot written by the key post-processor at 0x03FB9A (only when the slot is zero, making it a single-entry buffer). This analysis traced every ROM instruction that references 0xD141B5.

### Total References: 5

| Address | Instruction | Category | Context |
|---------|------------|----------|---------|
| 0x02BD96 | `LD HL,0xD141B5` | Pointer setup / indirect read | Event loop: reads key via `LD C,(HL)`, passes to 0x05D58F |
| 0x02BDC5 | `LD HL,0xD141B5` | Pointer setup / clear | Clears slot to 0x00 via `LD (HL),0x00` |
| 0x02BDD1 | `LD HL,0xD141B5` | Pointer setup / indirect read | Same function, alternate path: reads key via `LD C,(HL)` then calls 0x05D58F |
| 0x03FBD9 | `LD A,(0xD141B5)` | Zero-test gate (writer side) | Reads slot; if non-zero, skips write (single-slot buffer guard) |
| 0x03FBE1 | `LD (0xD141B5),A` | Writer | Stores the processed key code into the slot |

**No unmatched raw `B5 41 D1` sequences found.** The 5 hits above are exhaustive.

## Key Finding: The Dispatcher is at 0x02BD5E

The **one and only consumer** of D141B5 is the function at **0x02BD5E** (inside the main OS event loop). Here is the flow:

```
0x02BD5E: LD A,(D14074)        ; check "key ready" flag
0x02BD62: OR A
0x02BD63: JP Z,0x02BDE8        ; skip if no key pending

0x02BD67: LD A,(D14091)        ; check mode flag
0x02BD6B: OR A
0x02BD6C: JR NZ,0x02BD7E      ; branch to key consumer path

  [mode=0 path: calls 0x042985, stores result in IX+FC/FD]

0x02BD7E: ...                  ; mode!=0 path
0x02BD82: LD HL,D140B3         ; load base pointer
0x02BD87: LD A,(HL)            ; check D140B3+offset
0x02BD89: JR Z,0x02BDB5        ; branch on zero

  [D140B3 non-zero path:]
0x02BD8B: LD IY,D141B3         ; load key state struct base
0x02BD90: LD A,(IY+7)          ; check byte at D141BA (= D141B3+7)
0x02BD94: JR NZ,0x02BDE8       ; skip if "processing" flag set

0x02BD96: LD HL,D141B5         ; *** THE READ ***
0x02BD9A: LD C,(HL)            ; C = key code from D141B5
0x02BD9B: LD DE,D141B3         ; DE = key state struct
0x02BD9F: PUSH DE              ; arg1: key state struct pointer
0x02BDA0: LD B,0x00
0x02BDA2: PUSH BC              ; arg2: BC = 0x00:keycode
0x02BDA3: CALL 0x05D58F        ; *** KEY DISPATCH FUNCTION ***
0x02BDA7: POP BC
0x02BDA8: POP BC
0x02BDA9: CALL 0x02B373        ; post-dispatch: init key state struct
0x02BDAD: LD HL,D141BA
0x02BDB1: LD (HL),0x01         ; set "processing" flag
```

### The Alternate Path (0x02BDB5 -- D140B3 is zero)

When D140B3 is zero AND D141BA (IY+7) is non-zero, it:
1. Clears D141B3 to 0
2. Clears D141B5 to 0 (via `LD (HL),0x00`)
3. Clears D141BA to 0
4. Then reads D141B5 again (which is now 0) and calls 0x05D58F with C=0
5. Calls 0x02B373 to reinit the key state struct

This is the **key-release / cancellation path**.

## Call Chain: Key to Action

```
Key press
  -> ISR scans matrix
    -> Post-processor at 0x03FB9A writes D141B5 (if zero)
      -> Main event loop at 0x02BD5E polls D14074 ("key ready")
        -> Reads D141B5 into C via LD C,(HL)
          -> CALL 0x05D58F(BC=keycode, DE=D141B3 struct pointer)
            -> This is the KEY DISPATCH FUNCTION
```

## 0x05D58F -- The Key Dispatch Function

Called with:
- **BC** = key code (B=0, C=raw key)
- **Stack arg** = pointer to D141B3 (key state struct)

First few bytes disassemble as:
```
0x05D58F: CALL 0x000130        ; likely context setup (OS call gate)
0x05D593: LD HL,(D1441D)       ; load dispatch table pointer?
0x05D597: CALL 0x000138        ; another OS call gate
...
```

This function is the **bridge from raw key code to OS action**. It uses the call gates at 0x000130/0x000138 which are part of the OS jump table system.

## 0x03FA09 -- The Key Post-Processor

The function at 0x03FA09 (which falls through to the D141B5 write at 0x03FBE1) is called from **many** locations:

| Callers | Entry Point | Purpose |
|---------|------------|---------|
| 0x02014C | JP 0x03FA09 | Direct jump |
| 0x02FDBE, 0x03005C, 0x03FC36, 0x040C9D, 0x044FDA, 0x0461C2, 0x056224, 0x09CFA5 | CALL 0x03FA09 | Various OS subsystems calling key post-processor |

The heavily-called entry points 0x03FBF9 and 0x03FBFD (77+ callers combined) are **flag manipulation** helpers in the same function -- they set/clear IY-indexed bit flags but do NOT directly touch D141B5. They are the "notification region" flag setters identified in session 407.

## cxSwitch (0x08C5D7) Check

**No reference to D141B5 found** in the cxSwitch region (scanned 0x08C5B7..0x08C6D7). No D141xx references at all in that range. The context switch does NOT directly read the key buffer.

However, 0x08C6F6 (near cxSwitch) does `JP 0x03FBFD` which is the flag-setter helper, not a D141B5 access.

## Related RAM Addresses (D141B0..D141BF)

| Address | Usage |
|---------|-------|
| D141B2 | Written by 0x03FA23/0x03FA85/0x03FBCA -- key processing intermediate |
| D141B3 | Key state struct base -- 8+ byte struct (has "processing" flag at +7 = D141BA) |
| D141B5 | **Final key output buffer** (this analysis) |
| D141BA | "Processing" flag (byte at D141B3+7) -- checked before reading D141B5 |
| D141BB | Referenced by 0x009xxx and 0x048xxx (LCD/display related?) |
| D141BE | Heavily referenced (50+ hits) -- likely cursor/edit position (LD (nn),HL pattern) |

## Conclusions

1. **D141B5 has exactly ONE consumer**: the event loop at 0x02BD5E, which reads it indirectly via `LD HL,D141B5; LD C,(HL)`.

2. **The key dispatch function is 0x05D58F** -- called with BC=keycode (B=0, C=raw key) and DE=pointer to key state struct at D141B3.

3. **D141B5 is a single-slot buffer**: the writer at 0x03FBE1 only stores if the slot is currently 0 (guarded by the read at 0x03FBD9). The consumer at 0x02BD96 reads it but does NOT clear it -- that happens in the alternate path at 0x02BDC5.

4. **The "processing" flag at D141BA** gates whether the key is consumed: if D141BA is already set (from a prior `LD (HL),0x01` at 0x02BDB1), the loop skips reading D141B5 entirely.

5. **cxSwitch does NOT read D141B5** -- key dispatch is purely event-loop driven, not interrupt/context-switch driven.

6. **Next investigation target**: 0x05D58F is the key dispatch function. It calls through OS call gates (0x000130, 0x000138). Tracing what it does with the key code will reveal the full key-to-action mapping.
