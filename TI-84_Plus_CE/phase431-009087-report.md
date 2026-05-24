# Phase 431 - `0x009087` Selector-`0x21` USB Fallback

## Summary

`0x009087..0x009117` is the priority-7 fallback reached from `0x009178` after priorities 1-6 all miss. It uses the full 145-byte gap before the next wrapper entry at `0x009118`.

This routine is "unconditional" only in the sense that the wrapper always schedules it last. It is **not** an unconditional success path. The routine returns `A = 1` only when `D177B8 == 0x21`; otherwise it zeroes its local return latch and returns `A = 0`.

On the `0x21` path it behaves like a USB/controller power-or-arm fallback:

1. check `0x3082 bit4`; if already set, return success immediately
2. otherwise report status `(0,1)` through `0x00883C`
3. wait `2` ticks via `0x014FA0`
4. if `0x3082 bit3` is clear, raise `0x3080 bit2`, wait `7` ticks, then continue
5. call deeper helper `0x008527`
6. clear `0x3080 bit2` again
7. return the pre-seeded local latch value `1`

Best-fit interpretation: this is a selector-specific USB/controller fallback for event code `0x21`, not a generic error-recovery stub or a null-transport path.

## Function Bounds

| Field | Value |
| --- | --- |
| Start | `0x009087` |
| End | `0x009117` |
| Size | `145` bytes (`0x0091`) |
| Direct ROM caller | `0x009178` only |
| Epilogue | `LD A,(IX-1) ; LD SP,IX ; POP IX ; RET` |

## Disassembly

```asm
0x009087  21 FF FF FF           LD HL,0xFFFFFF        ; function entry
0x00908B  CD 97 21 00           CALL 0x002197         ; stack-frame helper
0x00908F  DD 36 FF 01           LD (IX-1),0x01        ; seed local return latch = 1
0x009093  3A B8 77 D1           LD A,(0xD177B8)       ; selector/event byte
0x009097  B7                    OR A
0x009098  ED 62                 SBC HL,HL
0x00909A  6F                    LD L,A                ; zero-extend A into HL
0x00909B  B7                    OR A
0x00909C  01 21 00 00           LD BC,0x000021
0x0090A0  ED 42                 SBC HL,BC
0x0090A2  20 68                 JR NZ,0x00910C        ; only direct failure path
0x0090A4  40 01 82 30           SIS LD BC,0x3082
0x0090A8  ED 78                 IN A,(C)
0x0090AA  E6 10                 AND 0x10
0x0090AC  20 62                 JR NZ,0x009110        ; if bit4 already set, return success
0x0090AE  01 00 00 00           LD BC,0x000000
0x0090B2  C5                    PUSH BC
0x0090B3  01 01 00 00           LD BC,0x000001
0x0090B7  C5                    PUSH BC
0x0090B8  CD 3C 88 00           CALL 0x00883C         ; status/event report
0x0090BC  C1                    POP BC
0x0090BD  C1                    POP BC
0x0090BE  01 02 00 00           LD BC,0x000002
0x0090C2  C5                    PUSH BC
0x0090C3  CD A0 4F 01           CALL 0x014FA0         ; delay(2)
0x0090C7  C1                    POP BC
0x0090C8  40 01 82 30           SIS LD BC,0x3082
0x0090CC  ED 78                 IN A,(C)
0x0090CE  E6 08                 AND 0x08
0x0090D0  20 1F                 JR NZ,0x0090F1        ; skip the pulse when bit3 is already set
0x0090D2  01 80 30 00           LD BC,0x003080
0x0090D6  ED 78                 IN A,(C)
0x0090D8  CB D7                 SET 2,A
0x0090DA  ED 79                 OUT (C),A             ; raise 0x3080 bit2
0x0090DC  78                    LD A,B
0x0090DD  FE 30                 CP 0x30
0x0090DF  28 01                 JR Z,0x0090E2
0x0090E1  CF                    RST 0x08
0x0090E2  79                    LD A,C
0x0090E3  FE 80                 CP 0x80
0x0090E5  20 FA                 JR NZ,0x0090E1       ; BC sanity check for fixed port constant
0x0090E7  01 07 00 00           LD BC,0x000007
0x0090EB  C5                    PUSH BC
0x0090EC  CD A0 4F 01           CALL 0x014FA0         ; delay(7)
0x0090F0  C1                    POP BC
0x0090F1  CD 27 85 00           CALL 0x008527         ; deeper USB/controller helper
0x0090F5  01 80 30 00           LD BC,0x003080
0x0090F9  ED 78                 IN A,(C)
0x0090FB  CB 97                 RES 2,A
0x0090FD  ED 79                 OUT (C),A             ; drop 0x3080 bit2
0x0090FF  78                    LD A,B
0x009100  FE 30                 CP 0x30
0x009102  28 01                 JR Z,0x009105
0x009104  CF                    RST 0x08
0x009105  79                    LD A,C
0x009106  FE 80                 CP 0x80
0x009108  20 FA                 JR NZ,0x009104       ; BC sanity check again
0x00910A  18 04                 JR 0x009110
0x00910C  DD 36 FF 00           LD (IX-1),0x00        ; selector != 0x21 -> failure
0x009110  DD 7E FF              LD A,(IX-1)           ; final A comes from local latch
0x009113  DD F9                 LD SP,IX
0x009115  DD E1                 POP IX
0x009117  C9                    RET
```

## Direct Call Targets

| Target | Purpose | Site(s) |
| --- | --- | --- |
| `0x002197` | stack-frame helper / IX frame setup | `0x00908B` |
| `0x00883C` | status/event reporter; this site pushes `0` then `1` before calling | `0x0090B8` |
| `0x014FA0` | short delay helper | `0x0090C3` with `2`, `0x0090EC` with `7` |
| `0x008527` | deeper USB/controller helper entry; quick spot-decode shows it starts with `usb_SelfPowered` (`0x006EB6`) and then drives `0x3114` / `0x0125xx` style follow-up paths | `0x0090F1` |

There are no direct `JP nn` instructions inside `0x009087`; all local control flow is via `JR`.

## RAM Variables

Direct absolute RAM references inside `0x009087`:

| Address | Access | Role |
| --- | --- | --- |
| `D177B8` | read | selector/event byte that decides whether this fallback accepts the request |

Local IX-frame state:

| Slot | Use |
| --- | --- |
| `(IX-1)` | 1-byte return latch: seeded to `1`, cleared only on the selector-mismatch path, loaded back into `A` just before `RET` |

Direct absolute RAM writes inside `0x009087`: none.

## Port I/O

Direct port activity inside `0x009087`:

| Port | Access | Bits | Meaning in this routine |
| --- | --- | --- | --- |
| `0x3082` | read | `bit 4` | early-ready gate; if already set, the routine returns success immediately |
| `0x3082` | read | `bit 3` | controls whether the `0x3080 bit2` pulse is needed |
| `0x3080` | read-modify-write | `bit 2` | raised before the `0x008527` helper (when needed), then cleared afterwards |

Nested side effects:

- `0x008527` spot-decodes into a deeper controller helper that touches `0x3114` and several USB/status helpers.
- Those are callee-side effects, not direct instructions in `0x009087`.

## Return Value

`0x009087` does **not** return whatever its helpers leave in `A`. The final two meaningful instructions are:

```asm
0x00910C  LD (IX-1),0x00   ; only on selector mismatch
0x009110  LD A,(IX-1)
```

So the return value is exact:

- `A = 1` when `D177B8 == 0x21`
- `A = 0` when `D177B8 != 0x21`

No later helper can turn the `0x21` path into failure because none of them write the local latch.

## Interpretation

This does not look like generic error recovery:

- it keys entirely off a single selector byte (`D177B8 == 0x21`)
- it is USB/controller oriented (`0x3082`, `0x3080`, and the nested `0x008527` path)
- it emits status `(0,1)` before the hardware settle work
- it optionally pulses a controller bit and then calls a deeper USB helper

Best-fit label: **selector-`0x21` USB/controller fallback arm path**.

That also explains why the wrapper at `0x009118` does not `CP 1` after calling it. The wrapper is delegating the final success/failure decision to `0x009087` itself, and this fallback already returns a clean boolean.
