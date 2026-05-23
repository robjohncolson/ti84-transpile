# Phase 414: D176F8 Write Value Semantics

## Summary

- A ROM-wide scan still finds `44` direct writers to `0xD176F8`.
- Every writer is a byte store through `LD (0xD176F8),A`. There are no `BC`, `HL`, `DE`, `IX`, or `IY` stores to this address.
- All `44` writes resolve cleanly:
  - `22` sites write `0x00` via `XOR A`
  - `22` sites write an explicit immediate via `LD A,imm8`
- No writer copies a value from another RAM location or computes the state byte indirectly. The protocol-state machine is enumerated in ROM as hard-coded constants.
- The value set is:
  - `00, 01, 02, 03, 04, 05, 06, 07, 08, 09, 0A, 0C, 0D, 0E, 0F, 10`
- `0x0B` is absent.

## Categorized Breakdown

| Value | Count | Semantics | Representative writer(s) |
| --- | ---: | --- | --- |
| `0x00` | 22 | Idle / cleared sink state used by reset, cleanup, and wrapper exits | `0x009876`, `0x00B8AD`, `0x02BFAF`, `0x063952` |
| `0x01` | 2 | Success latch after copying `D1771A -> D1772A` | `0x014522`, `0x047E91` |
| `0x02` | 2 | Early handshake / checker stage before `CALL 0x006EDA` or its mirrored follow-on path | `0x014003`, `0x0145AA` |
| `0x03` | 1 | Checker-success continuation after `CALL 0x006EDA` returns success | `0x0149F3` |
| `0x04` | 1 | Promotion reached only after proving the current state is `0x03` | `0x014A48` |
| `0x05` | 1 | Sequencer state that seeds `D176F5 = 0x00000B` before common transport work | `0x04865D` |
| `0x06` | 1 | Later sequencer entry in the same continuation family as `0x05` | `0x048752` |
| `0x07` | 1 | Sequencer state with special bookkeeping around `D17726..D17727` | `0x0481A3` |
| `0x08` | 1 | Sequencer state that rejoins the same common continuation | `0x048935` |
| `0x09` | 1 | Late-sender pre-active state | `0x0654FB` |
| `0x0A` | 1 | Active transfer state | `0x0656BC` |
| `0x0C` | 1 | Header state | `0x02E7A9` |
| `0x0D` | 1 | Completion state written by USB Worker B | `0x0135A4` |
| `0x0E` | 1 | Pre-header staging state | `0x02DF2D` |
| `0x0F` | 5 | Packet-builder staging state used by mirrored entry paths | `0x00B5EB`, `0x02D7E6`, `0x043E45` |
| `0x10` | 2 | Sentinel / modal state set by tiny wrapper stubs and later cleared by dedicated readers | `0x04DEDD`, `0x04DF00` |

## All Write Sites

| Site | Value | Source Form | Routine / Family | Why It Writes That Value |
| --- | --- | --- | --- | --- |
| `0x009876` | `0x00` | `XOR A` | boot / global reset | Startup clear |
| `0x00993F` | `0x00` | `XOR A` | boot / global reset | Startup clear |
| `0x00B5EB` | `0x0F` | `LD A,0x0F` | packet-builder entry | Enter staging path |
| `0x00B626` | `0x0F` | `LD A,0x0F` | packet-builder entry | Mirrored staging entry |
| `0x00B8AD` | `0x00` | `XOR A` | state-`0x10` cleanup | Clear sentinel state |
| `0x00B8B2` | `0x00` | `XOR A` | state-`0x10` cleanup | Mirrored sentinel clear |
| `0x00F3E0` | `0x00` | `XOR A` | boot / global reset | Startup clear |
| `0x01136B` | `0x00` | `XOR A` | post-processing / restart clear | Clear after staging bookkeeping |
| `0x0135A4` | `0x0D` | `LD A,0x0D` | USB receive worker B | Mark copy/receive completion |
| `0x013CF7` | `0x00` | `XOR A` | post-processing / restart clear | Cleanup clear |
| `0x014003` | `0x02` | `LD A,0x02` | handshake / checker stage | Enter checker stage before `CALL 0x006EDA` |
| `0x014522` | `0x01` | `LD A,0x01` | mirrored success path | Mark immediate success after `D1771A -> D1772A` copy |
| `0x0145AA` | `0x02` | `LD A,0x02` | handshake / checker stage | Mirrored checker-stage entry |
| `0x0149F3` | `0x03` | `LD A,0x03` | checker-success continuation | Success continuation after `0x006EDA` |
| `0x014A48` | `0x04` | `LD A,0x04` | `0x03 -> 0x04` promotion | Advance the validated handshake |
| `0x02BFAF` | `0x00` | `XOR A` | wrapper / receive exit clear | Exit-path clear |
| `0x02BFE1` | `0x00` | `XOR A` | wrapper / receive exit clear | Exit-path clear |
| `0x02CB86` | `0x00` | `XOR A` | wrapper / receive exit clear | Exit-path clear |
| `0x02D775` | `0x00` | `XOR A` | post-processing / restart clear | Cleanup clear |
| `0x02D7E6` | `0x0F` | `LD A,0x0F` | packet-builder entry | Enter staging path |
| `0x02DF2D` | `0x0E` | `LD A,0x0E` | pre-header staging | Stage pre-header work and clear `D176F5` |
| `0x02E7A9` | `0x0C` | `LD A,0x0C` | header path | Mark header block |
| `0x02F249` | `0x00` | `XOR A` | wrapper / receive exit clear | Exit-path clear |
| `0x043E0A` | `0x0F` | `LD A,0x0F` | packet-builder entry | Enter staging path |
| `0x043E45` | `0x0F` | `LD A,0x0F` | packet-builder entry | Mirrored staging entry |
| `0x047E91` | `0x01` | `LD A,0x01` | mirrored success path | Mark immediate success after `D1771A -> D1772A` copy |
| `0x0481A3` | `0x07` | `LD A,0x07` | sequencer block | Enter dispatchable sequencer state |
| `0x04865D` | `0x05` | `LD A,0x05` | sequencer block | Seed `D176F5 = 0x00000B` and continue |
| `0x048752` | `0x06` | `LD A,0x06` | sequencer block | Later sequencer-state entry |
| `0x048935` | `0x08` | `LD A,0x08` | sequencer block | Another sequencer-state entry |
| `0x049241` | `0x00` | `XOR A` | boot / global reset | Startup clear |
| `0x049330` | `0x00` | `XOR A` | boot / global reset | Startup clear |
| `0x04D56F` | `0x00` | `XOR A` | post-processing / restart clear | Cleanup clear |
| `0x04DEDD` | `0x10` | `LD A,0x10` | sentinel setter stub | Set special modal/sentinel state |
| `0x04DF00` | `0x10` | `LD A,0x10` | sentinel setter stub | Mirrored sentinel setter |
| `0x04DF61` | `0x00` | `XOR A` | state-`0x10` cleanup | Clear sentinel state |
| `0x04DFAE` | `0x00` | `XOR A` | state-`0x10` cleanup | Clear sentinel state and related flags |
| `0x04E02A` | `0x00` | `XOR A` | state-`0x10` cleanup | Mirrored sentinel clear |
| `0x06363F` | `0x00` | `XOR A` | wrapper / receive exit clear | Exit-path clear |
| `0x063952` | `0x00` | `XOR A` | wrapper / receive exit clear | Exit-path clear after buffer copy |
| `0x063F55` | `0x00` | `XOR A` | wrapper / receive exit clear | Exit-path clear |
| `0x06412C` | `0x00` | `XOR A` | wrapper / receive exit clear | Exit-path clear |
| `0x0654FB` | `0x09` | `LD A,0x09` | late sender block | Mark pre-active sender stage |
| `0x0656BC` | `0x0A` | `LD A,0x0A` | `0x09 -> 0x0A` promotion | Upgrade to active transfer |

## Cross-Reference With Known Worker-B Dispatch Values

Session 411 already established that USB Worker B dispatches on:

- `0x0A` = active transfer
- `0x0C` = header
- `0x0D` = complete

Phase 414 shows how those three values fit into the larger machine:

- `0x09 -> 0x0A` is an explicit promotion at `0x0656BC`, so `0x0A` is not an initial state. It is an activated late-transfer state.
- `0x0C` is written by the small header stub at `0x02E7A9`.
- `0x0D` is written by Worker B itself at `0x0135A4`, after it accepts `0x0A`, `0x0C`, or an already-complete `0x0D` and performs the payload-copy work.

So Worker B is consuming two incoming protocol states (`0x0A`, `0x0C`) and producing one terminal state (`0x0D`).

## Newly Visible Values Beyond The Original `0x0A / 0x0C / 0x0D` Set

Newly surfaced protocol-byte values are:

- `0x00`
- `0x01`
- `0x02`
- `0x03`
- `0x04`
- `0x05`
- `0x06`
- `0x07`
- `0x08`
- `0x09`
- `0x0E`
- `0x0F`
- `0x10`

The most important additions are:

- `0x02 -> 0x03 -> 0x04`: an early handshake / validation chain
- `0x05 / 0x06 / 0x07 / 0x08`: explicit sequencer states, not just one-off constants
- `0x09 -> 0x0A`: a late transfer-activation chain
- `0x0F`: a widely mirrored packet-builder staging value
- `0x10`: a special sentinel state with dedicated reader-side cleanup

## Proposed State Transition Diagram

This is the best-fit transition sketch from the write sites plus the known reader-side comparisons:

```text
reset / cleanup
    -> 0x00

handshake / checker
    0x02 -> 0x03 -> 0x04

sequencer family
    entry -> 0x05
    entry -> 0x06
    entry -> 0x07
    entry -> 0x08
    then -> indexed dispatch / common continuation -> 0x00

late sender / worker-B path
    0x09 -> 0x0A
    0x0C --------\
                  -> worker B copy path -> 0x0D
    0x0A --------/

staging families
    entry -> 0x0E -> ?    (pre-header staging; downstream edge still unclear)
    entry -> 0x0F -> 0x00 (packet-builder staging consumed later)
    entry -> 0x10 -> 0x00 (sentinel setter with dedicated clear paths)
```

## Bottom Line

- `D176F8` is a fully enumerated byte-sized state register, not a loosely derived scratch byte.
- All `44` current writers are explicit and simple: either `XOR A` or `LD A,imm8`.
- The original `0x0A / 0x0C / 0x0D` interpretation was correct but incomplete.
- The ROM exposes at least four distinct sub-families sharing the same byte:
  - reset / clear paths
  - handshake / checker states
  - sequencer / continuation states
  - USB / link transfer states
