# Phase 433: Trace of `0x01253F` (Short Status-Submit Gate)

## Summary

`0x01253F..0x0125E9` is a 171-byte sibling of the 191-byte `0x0125EA` port-ready/status gate from phase 431. It keeps the same overall structure:

- build a 4-byte IX frame
- copy the caller's two 1-byte arguments into locals
- choose between a short spin path and a long wait path from bit 6 of `D0009B` (`IY = 0xD00080`, then `BIT 6,(IY+27)`)
- poll port `0x3082` bit 1
- clear `D1440E`
- call `0x00883C` with the local status/event pair
- return a success flag in `A`

The difference is that this version is tuned for the `D177B8 == 0x98` re-enumeration branch inside `0x008527`:

- short path budget is `100` spins instead of `120`
- long wait budget is `1000` ticks instead of `1200`
- it executes `EI` before `CALL 0x014E3F`
- it has no post-submit capability check and no `CALL 0x01270B`
- its failure override is `(arg1,arg2) = (1,0)`, which matches the only caller's incoming pair, so the submitted code does not change on timeout

The raw polling polarity matches `0x0125EA`: the loop keeps waiting while `0x3082 bit1` is set and exits when the bit clears. So this is still a ready gate, but "ready" here is the bit clearing to `0`.

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x01253F` |
| End | `0x0125E9` |
| Size | `171` bytes (`0xAB`) |
| Decoded instructions | `62` |
| Direct callers found by exact byte search | `1` |

## Full Decode

```text
0x01253F: 21 FC FF FF          LD HL,0xFFFFFC              ; 4-byte IX frame
0x012543: CD 97 21 00          CALL 0x002197              ; frame setup helper
0x012547: DD 36 FD 01          LD (IX-3),0x01             ; success flag = 1
0x01254B: DD 7E 06             LD A,(IX+6)
0x01254E: DD 77 FC             LD (IX-4),A                ; local arg1
0x012551: DD 7E 09             LD A,(IX+9)
0x012554: DD 77 FE             LD (IX-2),A                ; local arg2
0x012557: DD 36 FF 00          LD (IX-1),0x00             ; retry counter
0x01255B: FD 21 80 00 D0       LD IY,0xD00080
0x012560: FD CB 1B 76          BIT 6,(IY+27)              ; test D0009B bit 6
0x012564: 28 37                JR Z,0x01259D              ; bit clear -> long wait path

0x012566: DD 36 FF 64          LD (IX-1),0x64             ; fast path retry count = 100
0x01256A: DD 7E FF             LD A,(IX-1)
0x01256D: DD 35 FF             DEC (IX-1)
0x012570: B7                   OR A
0x012571: 28 10                JR Z,0x012583              ; loop budget exhausted
0x012573: 40 01 82 30          SIS LD BC,0x3082
0x012577: ED 78                IN A,(C)
0x012579: E6 02                AND 0x02
0x01257B: 28 06                JR Z,0x012583              ; bit 1 cleared -> leave loop
0x01257D: CD E3 61 00          CALL 0x0061E3              ; short delay
0x012581: 18 E7                JR 0x01256A

0x012583: 40 01 82 30          SIS LD BC,0x3082
0x012587: ED 78                IN A,(C)
0x012589: E6 02                AND 0x02
0x01258B: 28 0C                JR Z,0x012599              ; success path
0x01258D: DD 36 FD 00          LD (IX-3),0x00             ; return A = 0 on failure
0x012591: DD 36 FC 01          LD (IX-4),0x01             ; override arg1 = 1
0x012595: DD 36 FE 00          LD (IX-2),0x00             ; override arg2 = 0
0x012599: C3 D2 25 01          JP 0x0125D2               ; common submit tail

0x01259D: FB                   EI                         ; extra here, absent in 0x0125EA
0x01259E: 01 E8 03 00          LD BC,0x0003E8            ; 1000 ticks
0x0125A2: C5                   PUSH BC
0x0125A3: CD 3F 4E 01          CALL 0x014E3F             ; long wait helper
0x0125A7: C1                   POP BC
0x0125A8: 40 01 82 30          SIS LD BC,0x3082
0x0125AC: ED 78                IN A,(C)
0x0125AE: E6 02                AND 0x02
0x0125B0: 28 1B                JR Z,0x0125CD             ; success path
0x0125B2: 3A 0F 44 D1          LD A,(0xD1440F)           ; abort flag
0x0125B6: B7                   OR A
0x0125B7: 20 08                JR NZ,0x0125C1            ; abort -> failure override
0x0125B9: 3A B7 77 D1          LD A,(0xD177B7)           ; sentinel must stay 0x55
0x0125BD: FE 55                CP 0x55
0x0125BF: 28 E7                JR Z,0x0125A8             ; keep polling while armed
0x0125C1: DD 36 FD 00          LD (IX-3),0x00            ; return A = 0
0x0125C5: DD 36 FC 01          LD (IX-4),0x01            ; override arg1 = 1
0x0125C9: DD 36 FE 00          LD (IX-2),0x00            ; override arg2 = 0

0x0125CD: AF                   XOR A
0x0125CE: 32 0E 44 D1          LD (0xD1440E),A           ; clear notification lock
0x0125D2: DD 4E FE             LD C,(IX-2)
0x0125D5: 06 00                LD B,0x00
0x0125D7: C5                   PUSH BC                    ; push arg2
0x0125D8: DD 4E FC             LD C,(IX-4)
0x0125DB: C5                   PUSH BC                    ; push arg1
0x0125DC: CD 3C 88 00          CALL 0x00883C             ; submit status/event pair
0x0125E0: C1                   POP BC
0x0125E1: C1                   POP BC
0x0125E2: DD 7E FD             LD A,(IX-3)               ; return success flag
0x0125E5: DD F9                LD SP,IX
0x0125E7: DD E1                POP IX
0x0125E9: C9                   RET
```

## CALL Targets

| Target | Purpose | Site(s) |
| --- | --- | --- |
| `0x002197` | 4-byte frame setup helper | `0x012543` |
| `0x0061E3` | short delay between fast-path polls | `0x01257D` |
| `0x014E3F` | notification-backed long wait helper, called with `BC=1000` on the stack | `0x0125A3` |
| `0x00883C` | status/event reporter | `0x0125DC` |

There is no `CALL 0x01270B` here. That post-submit capability tail exists only in `0x0125EA`.

## RAM Variables Accessed

| Address | Access | Meaning in this function |
| --- | --- | --- |
| `0xD0009B` | read bit 6 | selects fast 100-spin path vs long 1000-tick wait |
| `0xD1440F` | read | abort / delivery flag for the long wait loop |
| `0xD177B7` | read | sentinel `0x55` that keeps the long wait loop alive |
| `0xD1440E` | write `0` | clear notification lock just before status submission |

Stack locals at `IX-4`, `IX-3`, `IX-2`, and `IX-1` are used for the forwarded arg pair, return flag, and spin counter, but they are local frame storage rather than global RAM variables.

## Port I/O

Direct port traffic inside `0x01253F`:

| Port | Access | Site(s) | Meaning |
| --- | --- | --- | --- |
| `0x3082` | `IN A,(C)` | `0x012577`, `0x012587`, `0x0125AC` | gate on bit 1 |

No `OUT` instructions appear in this helper.

## Exact Caller Search

ROM-wide search for `CALL 0x01253F` using the exact byte sequence `CD 3F 25 01` found one direct caller:

| Address | Context |
| --- | --- |
| `0x0085AE` | inside the `D177B8 == 0x98` branch of `0x008527` |

Decoded caller setup:

```text
0x0085A4: 01 00 00 00    LD BC,0x000000
0x0085A8: C5             PUSH BC
0x0085A9: 01 01 00 00    LD BC,0x000001
0x0085AD: C5             PUSH BC
0x0085AE: CD 3F 25 01    CALL 0x01253F
```

Using the same calling convention already established for `0x0125EA`, that means:

- `arg1 = 1`
- `arg2 = 0`
- the downstream `0x00883C` reporter sees the pair `(0,1)`

## How `0x01253F` Differs From `0x0125EA`

| Aspect | `0x01253F` | `0x0125EA` | Practical impact |
| --- | --- | --- | --- |
| Range / size | `0x01253F..0x0125E9`, 171 bytes | `0x0125EA..0x0126A8`, 191 bytes | `0x01253F` is 20 bytes shorter |
| Fast-path spin budget | `0x64` (100) | `0x78` (120) | shorter quick retry window |
| Long-wait budget | `0x03E8` (1000) | `0x04B0` (1200) | shorter slow retry window |
| Interrupt handling before long wait | `EI` at `0x01259D` | none | special branch explicitly re-enables interrupts |
| Failure override | local args forced to `(1,0)` | local args forced to `(0xFF,0x10)` | here the failure status matches the only caller's normal pair, while `0x0125EA` changes the submitted code on failure |
| Post-submit tail | return immediately after `0x00883C` | post-submit capability check plus optional `CALL 0x01270B` | no extra follow-up helper here |
| Known caller role | only the `0x98` branch of `0x008527` | normal path in `0x008527`, plus the earlier USB mode-transition family from phase 430/431 | this helper is narrower and more specialized |

## Return Value

`A` is loaded from `(IX-3)` before returning:

- `A = 1`: `0x3082 bit1` cleared before the wait budget or abort logic failed
- `A = 0`: timeout or abort/sentinel failure

The only direct caller at `0x0085AE` does not branch on this return value; it keeps the side effects and continues into the common `0x008527` tail.

## What "Short Status-Submit" Means

Best-fit interpretation: this is **not** a USB zero-length status stage helper. It is a **short software status/event submission gate** wrapped around the same `0x3082` bit-1 readiness test used by `0x0125EA`.

Why that reading fits the code:

- The only direct hardware action is polling `0x3082`.
- There are no endpoint FIFO writes, descriptor-buffer writes, DMA kicks, or payload copies here.
- The externally visible action is `CALL 0x00883C` with two tiny scalar codes.
- `0x00883C` is used all over the ROM with many small status-code pairs, not just in USB packet paths.
- The only direct caller pushes `(0,1)` and ignores the return value, so in practice this helper behaves like "wait briefly for the re-enumeration status bit to settle, then emit the `(0,1)` software status."

So "short status-submit" here means:

- short wait budget
- same `0x3082` gate as the larger sibling
- then submit a software status/event pair through `0x00883C`

It does **not** look like a transport-layer USB status packet routine.
