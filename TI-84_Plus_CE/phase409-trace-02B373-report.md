# Phase 409 - Trace 0x02B373

## Verdict

- Classification: setup / registration helper (lazy post-dispatch arm for a secondary key-state descriptor).
- Key source: it does not fetch the key code from A and it does not read 0xD141B5. The only input read in this routine is the guard byte at 0xD141BA (`IY = 0xD141B3`, then `LD A,(IY+7)`).
- Control shape: one `OR A` / `JR NZ` guard, a fixed descriptor build in RAM, one direct subroutine call, then return. There is no CP cascade and no indirect dispatch in the direct body.
- Interaction with 0x05D58F: the two key-loop callers (0x02BDA9 and 0x02BDE4) invoke 0x02B373 immediately after the primary dispatcher. 0x02B373 does not consume a register return from 0x05D58F; it uses the shared D141B3/D141BA state block and then arms a secondary descriptor in D143E7..D14402.
- Return value: fast path returns immediately with A still non-zero from the D141BA guard test. Init path returns whatever the 0x0004A0 -> 0x00F5B0 helper leaves in A, and also stores that byte to 0xD17725. The key-loop callers ignore the return value.

## Direct Body

```text
0x02B373  FD 21 B3 41 D1 LD IY,0xD141B3
0x02B378  FD 7E 07       LD A,(IY+0x07)
0x02B37B  B7             OR A
0x02B37C  20 4F          JR NZ,0x02B3CD
0x02B37E  01 00 00 00    LD BC,0x000000
0x02B382  ED 43 E7 43 D1 LD (0xD143E7),BC
0x02B387  ED 43 EA 43 D1 LD (0xD143EA),BC
0x02B38C  01 B3 41 D1    LD BC,0xD141B3
0x02B390  ED 43 ED 43 D1 LD (0xD143ED),BC
0x02B395  01 04 00 00    LD BC,0x000004
0x02B399  ED 43 F6 43 D1 LD (0xD143F6),BC
0x02B39E  01 00 00 00    LD BC,0x000000
0x02B3A2  ED 43 F9 43 D1 LD (0xD143F9),BC
0x02B3A7  01 08 00 00    LD BC,0x000008
0x02B3AB  ED 43 FC 43 D1 LD (0xD143FC),BC
0x02B3B0  3E 02          LD A,0x02
0x02B3B2  32 FF 43 D1    LD (0xD143FF),A
0x02B3B6  01 00 00 00    LD BC,0x000000
0x02B3BA  ED 43 02 44 D1 LD (0xD14402),BC
0x02B3BF  01 E7 43 D1    LD BC,0xD143E7
0x02B3C3  C5             PUSH BC
0x02B3C4  CD A0 04 00    CALL 0x0004A0
0x02B3C8  C1             POP BC
0x02B3C9  32 25 77 D1    LD (0xD17725),A
0x02B3CD  C9             RET
```

The direct body is 0x5B bytes long (0x02B373..0x02B3CD).

## RAM Reads

- 0xD141BA via `LD A,(IY+0x07)` at 0x02B378 - guard byte: if non-zero, the helper exits without building anything.

## RAM Writes

- 0xD143E7 via `LD (0xD143E7),BC` at 0x02B382 - descriptor head cleared to 0.
- 0xD143EA via `LD (0xD143EA),BC` at 0x02B387 - descriptor field cleared to 0.
- 0xD143ED via `LD (0xD143ED),BC` at 0x02B390 - descriptor payload pointer set to 0xD141B3.
- 0xD143F6 via `LD (0xD143F6),BC` at 0x02B399 - descriptor field set to 4.
- 0xD143F9 via `LD (0xD143F9),BC` at 0x02B3A2 - descriptor field cleared to 0.
- 0xD143FC via `LD (0xD143FC),BC` at 0x02B3AB - descriptor field set to 8.
- 0xD143FF via `LD (0xD143FF),A` at 0x02B3B2 - descriptor type/state byte set to 2.
- 0xD14402 via `LD (0xD14402),BC` at 0x02B3BA - descriptor tail cleared to 0.
- 0xD17725 via `LD (0xD17725),A` at 0x02B3C9 - stores helper return byte / handle.

## Subroutine Calls

- Direct call target: 0x0004A0.
- Resolved call chain: 0x0004A0 is a JP stub to 0x00F5B0.

The init path is effectively:

1. Check `D141BA`.
2. If clear, build a descriptor at `D143E7..D14402`.
3. Call `0x00F5B0` with `BC = 0xD143E7`.
4. Store the helper's return byte to `D17725`.
5. Return.

## Dispatch Shape

- Dispatch table present: no.
- CP cascade present: no.
- JP (HL) / indirect transfer present in the direct body: no.
- This is a fixed guard-and-init sequence, not a comparator ladder or sub-dispatch tree.

## Caller Scan

- Total direct CALL hits for 0x02B373: 4
- Total direct JP hits for 0x02B373: 0

| Address | Type | Note |
| --- | --- | --- |
| 0x02A9AA | CALL | earlier init/helper path; calls 0x02B373 after clearing a D140B3-relative slot |
| 0x02B545 | CALL | other helper path; gated by D14050 bit 3 before the call |
| 0x02BDA9 | CALL | main key-consume path; immediately after CALL 0x05D58F |
| 0x02BDE4 | CALL | alternate key-release/cancel path; immediately after CALL 0x05D58F |

The key-dispatch chain identified in session 408 accounts for two of the four direct callers. The other two call sites reuse the same helper outside that exact 0x02BD96 path, which reinforces that 0x02B373 is a generic setup/registration helper rather than a keycode decoder.

## Answers

- What does this function do? It lazily initializes and registers a secondary key-state descriptor when the D141BA guard byte is clear. Best classification: setup / registration helper.
- Does it read the key code from A register or from RAM? Neither. It does not read the key code at all; it only reads the RAM guard byte at 0xD141BA.
- What RAM addresses does it read/write? Reads: 0xD141BA. Writes: 0xD143E7, 0xD143EA, 0xD143ED, 0xD143F6, 0xD143F9, 0xD143FC, 0xD143FF, 0xD14402, 0xD17725.
- Does it call any subroutines? Yes. Direct CALL: 0x0004A0. Resolved direct-call chain: 0x0004A0 -> 0x00F5B0.
- Does it have a dispatch table or CP cascade? No. There are no CP instructions in the direct body and no indirect jump.
- How does it interact with 0x05D58F output? It runs after 0x05D58F in the main key-consume paths, but it does not read the dispatcher return. The interaction is through shared RAM state at D141B3/D141BA and by registering follow-on state after primary dispatch.
- What is the return value? On the init path, A is whatever 0x0004A0 / 0x00F5B0 returns and that same byte is stored into 0xD17725. On the guard-hit fast path, it returns early with A still non-zero from the D141BA test.
