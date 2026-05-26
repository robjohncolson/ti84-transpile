# Phase 447: Trace of 0x049E07 — get_last_key() / State-Gated Key Reader

Source: direct ADL-mode ROM-byte decoding from `TI-84_Plus_CE/ROM.rom`, with helper trampolines at `0x000124` and `0x00012C` decoded from ROM as well.

## Function Boundaries

| Property | Value |
|----------|-------|
| Start | 0x049E07 |
| End | 0x049EDF (RET) |
| Size | 217 bytes (0xD9) |
| Next function | 0x049EE0 (unrelated port-read stub) |

## Summary

**0x049E07 is NOT a token dispatch function.** It is a simple **state-gated key reader** (`get_last_key`). It reads the current screen state from D177B9, and if the state is one of 14 recognized values (0x00-0x04, 0x10-0x18), it returns the value of D177B8 (the sub-state / last key code). For any unrecognized state, it returns 0x00.

The function does no key-to-action conversion, no table dispatch of tokens, and no command execution. It is a pure **getter** that gates access to D177B8 based on screen state.

### Pseudocode

```c
uint8_t get_last_key(void) {
    uint8_t state = mem[0xD177B9];  // current screen state
    switch (state) {
        case 0x00: case 0x01: case 0x02: case 0x03: case 0x04:
        case 0x10: case 0x11: case 0x12: case 0x13: case 0x14:
        case 0x15: case 0x16: case 0x17: case 0x18:
            return mem[0xD177B8];   // sub-state / key code
        default:
            return 0x00;            // no key
    }
}
```

## Callers (from prior reports)

| Address | Context |
|---------|---------|
| 0x03FB0A | Key processor 0x03FA09, called after 0x049087 status check passes |
| 0x032483 | Notification payload handler |
| 0x02F628 | Another notification/event path |
| 0x049F05 | Display refresh gate function at 0x049EF5 |
| 0x049FAF | Another wrapper at 0x049FAF |

At 0x03FB0A, the caller does:
```
CALL 0x049E07     ; A = get_last_key()
CP 0x01           ; is it 0x01?
JR Z, cleanup     ; yes -> cleanup path
CP 0xFF           ; is it 0xFF?
JR NZ, skip       ; neither -> skip
; fall through to cleanup
```

So the caller treats return values 0x01 and 0xFF as "actionable key" and anything else as "no action."

## Full Instruction Listing

```
; === Frame setup ===
049E07: 21 FF FF FF              LD HL,0xFFFFFF         ; 1 byte of locals
049E0B: CD 2C 01 00              CALL 0x00012C          ; __frameset (-> JP 0x002197)
049E0F: DD 36 FF 00              LD (IX-1),0x00         ; local return_code = 0

; === Read screen state, dispatch via switch table ===
049E13: 3A B9 77 D1              LD A,(0xD177B9)        ; A = current screen state
049E17: B7                       OR A,A                 ; clear carry (for SBC)
049E18: ED 62                    SBC HL,HL              ; HL = 0
049E1A: 6F                       LD L,A                 ; HL = state value (zero-extended)
049E1B: CD 24 01 00              CALL 0x000124          ; switch dispatcher (-> JP 0x00211B)

; === Switch table (14 entries + default) ===
; Format: 2-byte count (LE), then (match_byte, 3-byte-LE-target) x count, then 3-byte default
;
; 049E1F: 0E 00                  count = 14
; 049E21: 00  5C 9E 04           case 0x00 -> 0x049E5C
; 049E25: 01  65 9E 04           case 0x01 -> 0x049E65
; 049E29: 02  6E 9E 04           case 0x02 -> 0x049E6E
; 049E2D: 03  77 9E 04           case 0x03 -> 0x049E77
; 049E31: 04  80 9E 04           case 0x04 -> 0x049E80
; 049E35: 10  89 9E 04           case 0x10 -> 0x049E89
; 049E39: 11  92 9E 04           case 0x11 -> 0x049E92
; 049E3D: 12  9B 9E 04           case 0x12 -> 0x049E9B
; 049E41: 13  A4 9E 04           case 0x13 -> 0x049EA4
; 049E45: 14  AD 9E 04           case 0x14 -> 0x049EAD
; 049E49: 15  B6 9E 04           case 0x15 -> 0x049EB6
; 049E4D: 16  BF 9E 04           case 0x16 -> 0x049EBF
; 049E51: 17  C8 9E 04           case 0x17 -> 0x049EC8
; 049E55: 18  D1 9E 04           case 0x18 -> 0x049ED1
; 049E59: D8 9E 04               default   -> 0x049ED8

; === Case handlers (all identical: return D177B8) ===
; case 0x00:
049E5C: 3A B8 77 D1              LD A,(0xD177B8)        ; A = sub-state/key code
049E60: DD 77 FF                 LD (IX-1),A            ; return_code = A
049E63: 18 73                    JR 0x049ED8            ; -> epilogue

; case 0x01:
049E65: 3A B8 77 D1              LD A,(0xD177B8)
049E69: DD 77 FF                 LD (IX-1),A
049E6C: 18 6A                    JR 0x049ED8

; case 0x02:
049E6E: 3A B8 77 D1              LD A,(0xD177B8)
049E72: DD 77 FF                 LD (IX-1),A
049E75: 18 61                    JR 0x049ED8

; case 0x03:
049E77: 3A B8 77 D1              LD A,(0xD177B8)
049E7B: DD 77 FF                 LD (IX-1),A
049E7E: 18 58                    JR 0x049ED8

; case 0x04:
049E80: 3A B8 77 D1              LD A,(0xD177B8)
049E84: DD 77 FF                 LD (IX-1),A
049E87: 18 4F                    JR 0x049ED8

; case 0x10:
049E89: 3A B8 77 D1              LD A,(0xD177B8)
049E8D: DD 77 FF                 LD (IX-1),A
049E90: 18 46                    JR 0x049ED8

; case 0x11:
049E92: 3A B8 77 D1              LD A,(0xD177B8)
049E96: DD 77 FF                 LD (IX-1),A
049E99: 18 3D                    JR 0x049ED8

; case 0x12:
049E9B: 3A B8 77 D1              LD A,(0xD177B8)
049E9F: DD 77 FF                 LD (IX-1),A
049EA2: 18 34                    JR 0x049ED8

; case 0x13:
049EA4: 3A B8 77 D1              LD A,(0xD177B8)
049EA8: DD 77 FF                 LD (IX-1),A
049EAB: 18 2B                    JR 0x049ED8

; case 0x14:
049EAD: 3A B8 77 D1              LD A,(0xD177B8)
049EB1: DD 77 FF                 LD (IX-1),A
049EB4: 18 22                    JR 0x049ED8

; case 0x15:
049EB6: 3A B8 77 D1              LD A,(0xD177B8)
049EBA: DD 77 FF                 LD (IX-1),A
049EBD: 18 19                    JR 0x049ED8

; case 0x16:
049EBF: 3A B8 77 D1              LD A,(0xD177B8)
049EC3: DD 77 FF                 LD (IX-1),A
049EC6: 18 10                    JR 0x049ED8

; case 0x17:
049EC8: 3A B8 77 D1              LD A,(0xD177B8)
049ECC: DD 77 FF                 LD (IX-1),A
049ECF: 18 07                    JR 0x049ED8

; case 0x18:
049ED1: 3A B8 77 D1              LD A,(0xD177B8)
049ED5: DD 77 FF                 LD (IX-1),A
                                 ; fall through to epilogue

; === Epilogue (also default handler) ===
049ED8: DD 7E FF                 LD A,(IX-1)            ; A = return_code
049EDB: DD F9                    LD SP,IX               ; restore stack
049EDD: DD E1                    POP IX                 ; restore frame pointer
049EDF: C9                       RET
```

## CALL / JP Targets

| Address | Target | Purpose |
|---------|--------|---------|
| 0x049E0B | CALL 0x00012C | `__frameset` -- ZDS II stack frame setup (JP 0x002197) |
| 0x049E1B | CALL 0x000124 | Switch/case dispatcher (JP 0x00211B) |

No other CALL or JP instructions exist in this function. The switch table entries are data consumed by the dispatcher, not executable branch instructions.

## Memory Regions Accessed

| Address | Type | Purpose |
|---------|------|---------|
| D177B9 | Read | Current screen state (0x00=calc, 0x01=home, 0x02=graph, etc.) |
| D177B8 | Read | Sub-state / last key code stored by dispatch_key case handlers |

### Does it read D141B5?

**No.** This function does NOT reference D141B5 (the final key output buffer). It reads D177B8, which is a different byte written by the `dispatch_key()` case handlers at 0x00883C/0x049CCA. D177B8 is populated by those handlers when they store the key_code parameter into the sub-state slot.

### Does it access VRAM?

**No.** No VRAM addresses (0xD40000+) are referenced.

## Dispatch Mechanism

The function uses a **switch table** via `CALL 0x000124` (the ZDS II compiled switch dispatcher at 0x00211B). The table format is:

1. 2-byte LE entry count
2. N entries of (1-byte match value, 3-byte LE target address)
3. 3-byte LE default target address

All 14 case handlers are **identical** -- they all read D177B8 and return it. The only difference between "matched" and "default" is that the default returns 0x00 (the initial value of the local variable) while matched states return D177B8.

## Recognized Screen States

The 14 states that return D177B8:

| Value | Likely Screen |
|-------|---------------|
| 0x00 | Calculator / idle |
| 0x01 | Home screen |
| 0x02 | Graph |
| 0x03 | Table |
| 0x04 | Program editor |
| 0x10 | Matrix editor |
| 0x11 | List editor |
| 0x12 | Equation editor (Y=) |
| 0x13 | Window editor |
| 0x14 | Recall / memory |
| 0x15 | Distribution |
| 0x16 | Statistics editor |
| 0x17 | Finance solver |
| 0x18 | Sequence editor |

States 0x05-0x0F and 0x19+ are NOT recognized -- the function returns 0x00 for those, effectively blocking key processing.

## Correction to Task Description

The task described 0x049E07 as the "token dispatch function for the home screen" that "converts key codes into actions (text entry, cursor movement, command execution)." This is incorrect. The function is a **state-gated getter** -- it simply returns D177B8 if the screen state is recognized, or 0 otherwise. The actual token dispatch / key-to-action conversion happens downstream in the caller chain (e.g., at 0x05D58F via D141B5, per the phase 408 report).

The function's role in the 0x03FA09 key processor is as a **gate**: it tells the caller whether there is a pending key (non-zero return) for the current screen state, and what that key code is.

## ZDS II Switch Dispatcher (0x00211B) Format Reference

The switch dispatcher at 0x00211B (reached via trampoline at 0x000124) implements a compiled C `switch` statement. It:

1. Pops the return address from the stack (this points to the inline table data)
2. Reads the 2-byte count
3. Iterates through entries comparing match bytes against HL (the switch value)
4. On match, jumps to the 3-byte target address
5. If no match, jumps to the 3-byte default address at the end of the table

This is the standard ZDS II eZ80 calling convention for switch/case -- the table is embedded inline immediately after the CALL instruction.
