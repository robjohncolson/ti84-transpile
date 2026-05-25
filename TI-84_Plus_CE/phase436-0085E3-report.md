# Phase 436: 0x0085E3 (USB Sub-Event Whitelist Validator)

## Summary

- **Address**: `0x0085E3`–`0x008639` (87 bytes, `0x57`)
- **Executable code**: 38 bytes, 14 instructions
- **Inline data**: 49 bytes (SEQCASE table, 11 entries)
- **Callers**: 1 — `0x00885B` inside `0x00883C` (USB state transition recorder)
- **Callees**: `0x002197` (stack frame setup), `0x00211B` (SEQCASE dispatcher)
- **RAM read**: `D177B9` (current USB sub_event)
- **Return**: `A=1` (PASS) if sub_event is in the whitelist; `A=0` (FAIL) otherwise

## Purpose

`0x0085E3` is a **corruption guard** for the USB sub_event state machine.

Before `0x00883C` dispatches a state transition, it calls `0x0085E3` to verify that the value in `D177B9` is one of the 11 recognized sub_event codes. If `D177B9` contains an unrecognized value (from corruption, race, or a bug), the function returns `A=0` and all transitions are blocked.

The 11 whitelisted case keys match exactly the 11 case entries in the main `0x00883C` dispatch table:

| Case keys | Target | Meaning |
|-----------|--------|---------|
| `0x00`–`0x03` | `0x00862C` | PASS (JR to return-pass) |
| `0x04`, `0x10`–`0x15` | `0x008632` | PASS (fall into return-pass) |
| default | `0x00862E` | FAIL (set IX-1 = 0) |

## Control Flow

1. Set up stack frame via `CALL 0x002197`.
2. Initialize local `(IX-1) = 0x01` (default: PASS).
3. Read `A = (D177B9)` — the current USB sub_event.
4. Prepare `HL = A` (zero-extended) and `CALL 0x00211B` (SEQCASE dispatcher).
5. SEQCASE dispatches into the inline table:
   - **Recognized values** (`0x00`–`0x04`, `0x10`–`0x15`): jump to `0x008632`, leaving `(IX-1) = 1`.
   - **Unrecognized values** (default): fall to `0x00862E`, which sets `(IX-1) = 0x00`.
6. Load `A = (IX-1)`, tear down frame, `RET`.

## Annotated Disassembly

```asm
0x0085E3  LD HL,0xFFFFFF          ; frame size marker for 0x002197
0x0085E7  CALL 0x002197           ; stack frame setup
0x0085EB  LD (IX-1),0x01          ; default result = PASS
0x0085EF  LD A,(0xD177B9)         ; read current USB sub_event
0x0085F3  OR A                    ; set flags
0x0085F4  SBC HL,HL               ; HL = 0 (carry cleared by OR)
0x0085F6  LD L,A                  ; HL = sub_event value
0x0085F7  CALL 0x00211B           ; SEQCASE dispatch into inline table
          ; --- 49 bytes of inline case table data ---
          ;   case 0x00 -> 0x00862C (JR +4 to return-pass)
          ;   case 0x01 -> 0x00862C
          ;   case 0x02 -> 0x00862C
          ;   case 0x03 -> 0x00862C
          ;   case 0x04 -> 0x008632
          ;   case 0x10 -> 0x008632
          ;   case 0x11 -> 0x008632
          ;   case 0x12 -> 0x008632
          ;   case 0x13 -> 0x008632
          ;   case 0x14 -> 0x008632
          ;   case 0x15 -> 0x008632
          ;   default   -> 0x00862E (FAIL path)
0x00862C  JR 0x008632             ; skip FAIL, go to return-pass
0x00862E  LD (IX-1),0x00          ; FAIL: override result to 0
0x008632  LD A,(IX-1)             ; load result into A
0x008635  LD SP,IX                ; tear down frame
0x008637  POP IX
0x008639  RET
```

## Relationship to 0x00883C

`0x00883C` is the 278-byte USB state transition recorder (decoded in phase 435). It has a single call to `0x0085E3` at `0x00885B`, which occurs before the main SEQCASE dispatch that writes the new event code to `D177B8`.

The guard ensures that:

1. `D177B9` holds a value that `0x00883C`'s own dispatch table recognizes.
2. If `D177B9` is corrupt or unexpected, the recorder refuses to execute any handler.
3. The 11 whitelisted values (`0x00`–`0x04`, `0x10`–`0x15`) are exactly the 11 handler cases in `0x00883C`.

This is a **defensive integrity check** — the OS validates its own state byte before trusting it as a dispatch key.

## RAM Byte

| Address | Name | Role |
|---------|------|------|
| `D177B9` | USB sub_event | Current sub_event state; written by all 11 handlers in `0x00883C`, read here as the whitelist input |

Note: `D177B9` is distinct from `D177B8` (event code output written by `0x00883C`'s handlers). The recorder reads `D177B9` to validate the current state, then writes `D177B8` to record the new event code.

## Final Answer

`0x0085E3` is an 87-byte whitelist validator (38 code + 49 inline table). It reads `D177B9`, checks whether the current USB sub_event is one of the 11 recognized values (`0x00`–`0x04`, `0x10`–`0x15`), and returns `A=1` (pass) or `A=0` (fail). Called from exactly one site (`0x00885B` inside `0x00883C`), it serves as a corruption guard that blocks all USB state transitions if the sub_event byte contains an unrecognized value.
