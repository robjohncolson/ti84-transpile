# Phase 446: Trace 0x03FA09 (Key Processor Function)

## Summary

- `0x03FA09` is the ROM routine behind the `_GetCSC` jump-table entry at `0x02014C`.
- It starts by atomically draining `kbdScanCode` at `0xD00587`, clearing that byte, and clearing the ready flag bit at `(IY+0)`.
- The routine is mostly a pass-through queueing wrapper, not a lookup-table translator. If the drained byte is nonzero, it usually survives unchanged to the final `LD (0xD141B5),A` at `0x03FBE1`.
- The only explicit key-code rewrites inside this routine are:
  - synthesize `0x01` on one zero-input hardware path (`0x03FA83`)
  - force `0x0F` under one flagged path (`0x03FBBC`)
  - force `0x39` under one flagged path (`0x03FBD6`)
- The routine does **not** reference `0x05D58F` or `0xD1441D` directly. Its only link to that later dispatch stage is the buffered write to `0xD141B5`.

## 1. Full Disassembly (0x03FA09-0x03FC1B, 0x213 bytes / 531 bytes)

Next function starts at `0x03FC1C`, so the block below is the full contiguous code island containing the `0x03FA09` entry and the nearby helper entrypoints.

```asm
0x03FA09  21 87 05 D0      LD HL, 0xD00587              ; HL = kbdScanCode (D00587)
0x03FA0D  F3               DI
0x03FA0E  7E               LD A, (HL)                   ; A = pending scan code
0x03FA0F  36 00            LD (HL), 0x00                ; clear D00587
0x03FA11  FD CB 00 9E      RES 3, (IY+0)                ; clear GetCSC-ready flag
0x03FA15  FB               EI
0x03FA16  F5               PUSH AF
0x03FA17  B7               OR A
0x03FA18  C2 9A FB 03      JP NZ, 0x03FB9A              ; raw nonzero key -> final commit block
0x03FA1C  3A 91 40 D1      LD A, (0xD14091)             ; "usbHandleKeys" in ti84pceg.inc
0x03FA20  B7               OR A
0x03FA21  28 70            JR Z, 0x03FA93
0x03FA23  3A B2 41 D1      LD A, (0xD141B2)             ; read D141B2 intermediate
0x03FA27  B7               OR A
0x03FA28  28 14            JR Z, 0x03FA3E
0x03FA2A  3A BA 41 D1      LD A, (0xD141BA)
0x03FA2E  B7               OR A
0x03FA2F  28 62            JR Z, 0x03FA93
0x03FA31  3A 89 05 D0      LD A, (0xD00589)
0x03FA35  B7               OR A
0x03FA36  C2 9A FB 03      JP NZ, 0x03FB9A
0x03FA3A  32 B2 41 D1      LD (0xD141B2), A
0x03FA3E  ED 57            LD A, I
0x03FA40  EA 46 FA 03      JP PE, 0x03FA46
0x03FA44  ED 57            LD A, I
0x03FA46  F5               PUSH AF
0x03FA47  F3               DI
0x03FA48  C5               PUSH BC
0x03FA49  40 01 0C 50      LD BC, 0x00500C
0x03FA4D  ED 78            IN A, (C)
0x03FA4F  CB 87            RES 0, A
0x03FA51  ED 79            OUT (C), A
0x03FA53  78               LD A, B
0x03FA54  FE 50            CP 0x50
0x03FA56  28 01            JR Z, 0x03FA59
0x03FA58  CF               RST 0x08
0x03FA59  79               LD A, C
0x03FA5A  FE 0C            CP 0x0C
0x03FA5C  20 FA            JR NZ, 0x03FA58
0x03FA5E  0E 00            LD C, 0x00
0x03FA60  ED 78            IN A, (C)                    ; read port 0x5000 bit0
0x03FA62  E6 01            AND 0x01
0x03FA64  3D               DEC A
0x03FA65  F5               PUSH AF
0x03FA66  0E 0C            LD C, 0x0C
0x03FA68  ED 78            IN A, (C)
0x03FA6A  CB C7            SET 0, A
0x03FA6C  ED 79            OUT (C), A
0x03FA6E  78               LD A, B
0x03FA6F  FE 50            CP 0x50
0x03FA71  28 01            JR Z, 0x03FA74
0x03FA73  CF               RST 0x08
0x03FA74  79               LD A, C
0x03FA75  FE 0C            CP 0x0C
0x03FA77  20 FA            JR NZ, 0x03FA73
0x03FA79  F1               POP AF
0x03FA7A  C1               POP BC
0x03FA7B  20 10            JR NZ, 0x03FA8D
0x03FA7D  F1               POP AF
0x03FA7E  E2 83 FA 03      JP PO, 0x03FA83
0x03FA82  FB               EI
0x03FA83  3E 01            LD A, 0x01                   ; synthesize key code 0x01
0x03FA85  32 B2 41 D1      LD (0xD141B2), A
0x03FA89  C3 D6 FB 03      JP 0x03FBD6
0x03FA8D  F1               POP AF
0x03FA8E  E2 93 FA 03      JP PO, 0x03FA93
0x03FA92  FB               EI
0x03FA93  3A 00 00 D0      LD A, (0xD00000)
0x03FA97  B7               OR A
0x03FA98  CA 9A FB 03      JP Z, 0x03FB9A
0x03FA9C  FE CC            CP 0xCC
0x03FA9E  C2 9A FB 03      JP NZ, 0x03FB9A
0x03FAA2  C5               PUSH BC
0x03FAA3  01 04 50 00      LD BC, 0x005004
0x03FAA7  ED 78            IN A, (C)
0x03FAA9  CB 47            BIT 0, A
0x03FAAB  20 0F            JR NZ, 0x03FABC
0x03FAAD  CB C7            SET 0, A
0x03FAAF  ED 79            OUT (C), A
0x03FAB1  78               LD A, B
0x03FAB2  FE 50            CP 0x50
0x03FAB4  28 01            JR Z, 0x03FAB7
0x03FAB6  CF               RST 0x08
0x03FAB7  79               LD A, C
0x03FAB8  FE 04            CP 0x04
0x03FABA  20 FA            JR NZ, 0x03FAB6
0x03FABC  C1               POP BC
0x03FABD  CD 5C 51 02      CALL 0x02515C
0x03FAC1  CD F4 05 00      CALL 0x0005F4
0x03FAC5  CA 9A FB 03      JP Z, 0x03FB9A
0x03FAC9  FD 21 80 00 D0   LD IY, 0xD00080
0x03FACE  FD CB 1B 6E      BIT 5, (IY+27)
0x03FAD2  C2 9A FB 03      JP NZ, 0x03FB9A
0x03FAD6  FD CB 1B EE      SET 5, (IY+27)
0x03FADA  3A B7 77 D1      LD A, (0xD177B7)
0x03FADE  FE 55            CP 0x55
0x03FAE0  28 11            JR Z, 0x03FAF3
0x03FAE2  FE AA            CP 0xAA
0x03FAE4  CA 6C FB 03      JP Z, 0x03FB6C
0x03FAE8  C5               PUSH BC
0x03FAE9  D5               PUSH DE
0x03FAEA  E5               PUSH HL
0x03FAEB  DD E5            PUSH IX
0x03FAED  CD C4 8A 04      CALL 0x048AC4
0x03FAF1  18 1F            JR 0x03FB12
0x03FAF3  C5               PUSH BC
0x03FAF4  D5               PUSH DE
0x03FAF5  E5               PUSH HL
0x03FAF6  DD E5            PUSH IX
0x03FAF8  ED 38 0F         IN0 A, (0x0F)
0x03FAFB  CB 77            BIT 6, A
0x03FAFD  28 13            JR Z, 0x03FB12
0x03FAFF  CB 7F            BIT 7, A
0x03FB01  20 0F            JR NZ, 0x03FB12
0x03FB03  CD 87 90 04      CALL 0x049087
0x03FB07  B7               OR A
0x03FB08  20 08            JR NZ, 0x03FB12
0x03FB0A  CD 07 9E 04      CALL 0x049E07
0x03FB0E  FE 01            CP 0x01
0x03FB10  28 5A            JR Z, 0x03FB6C
0x03FB12  FD 21 80 00 D0   LD IY, 0xD00080
0x03FB17  01 04 50 00      LD BC, 0x005004
0x03FB1B  ED 78            IN A, (C)
0x03FB1D  CB 87            RES 0, A
0x03FB1F  ED 79            OUT (C), A
0x03FB21  78               LD A, B
0x03FB22  FE 50            CP 0x50
0x03FB24  28 01            JR Z, 0x03FB27
0x03FB26  CF               RST 0x08
0x03FB27  79               LD A, C
0x03FB28  FE 04            CP 0x04
0x03FB2A  20 FA            JR NZ, 0x03FB26
0x03FB2C  FD CB 59 8E      RES 1, (IY+89)
0x03FB30  FD CB 09 66      BIT 4, (IY+9)
0x03FB34  28 04            JR Z, 0x03FB3A
0x03FB36  FD CB 59 CE      SET 1, (IY+89)
0x03FB3A  FD CB 09 A6      RES 4, (IY+9)
0x03FB3E  01 00 00 00      LD BC, 0x000000
0x03FB42  C5               PUSH BC
0x03FB43  CD 56 96 04      CALL 0x049656
0x03FB47  FD 21 80 00 D0   LD IY, 0xD00080
0x03FB4C  FD CB 59 4E      BIT 1, (IY+89)
0x03FB50  28 04            JR Z, 0x03FB56
0x03FB52  FD CB 09 E6      SET 4, (IY+9)
0x03FB56  01 04 50 00      LD BC, 0x005004
0x03FB5A  ED 78            IN A, (C)
0x03FB5C  CB C7            SET 0, A
0x03FB5E  ED 79            OUT (C), A
0x03FB60  78               LD A, B
0x03FB61  FE 50            CP 0x50
0x03FB63  28 01            JR Z, 0x03FB66
0x03FB65  CF               RST 0x08
0x03FB66  79               LD A, C
0x03FB67  FE 04            CP 0x04
0x03FB69  20 FA            JR NZ, 0x03FB65
0x03FB6B  C1               POP BC
0x03FB6C  CD F5 9E 04      CALL 0x049EF5
0x03FB70  DD E1            POP IX
0x03FB72  E1               POP HL
0x03FB73  D1               POP DE
0x03FB74  C1               POP BC
0x03FB75  FD 21 80 00 D0   LD IY, 0xD00080
0x03FB7A  FD CB 1B AE      RES 5, (IY+27)
0x03FB7E  3A 66 77 D1      LD A, (0xD17766)
0x03FB82  CB 7F            BIT 7, A
0x03FB84  28 0A            JR Z, 0x03FB90
0x03FB86  CB BF            RES 7, A
0x03FB88  32 66 77 D1      LD (0xD17766), A
0x03FB8C  CD 33 C0 02      CALL 0x02C033
0x03FB90  FD CB 41 5E      BIT 3, (IY+65)
0x03FB94  FD CB 41 9E      RES 3, (IY+65)
0x03FB98  20 50            JR NZ, 0x03FBEA
0x03FB9A  F1               POP AF                       ; final commit block entry
0x03FB9B  F5               PUSH AF
0x03FB9C  FD CB 12 46      BIT 0, (IY+18)
0x03FBA0  28 1E            JR Z, 0x03FBC0
0x03FBA2  FE 0F            CP 0x0F
0x03FBA4  28 0C            JR Z, 0x03FBB2
0x03FBA6  FD CB 09 66      BIT 4, (IY+9)
0x03FBAA  20 06            JR NZ, 0x03FBB2
0x03FBAC  FD CB 43 66      BIT 4, (IY+67)
0x03FBB0  28 0E            JR Z, 0x03FBC0
0x03FBB2  FD CB 5B F6      SET 6, (IY+91)
0x03FBB6  FD CB 5C 46      BIT 0, (IY+92)
0x03FBBA  28 04            JR Z, 0x03FBC0
0x03FBBC  F1               POP AF
0x03FBBD  3E 0F            LD A, 0x0F                   ; force 0x0F
0x03FBBF  F5               PUSH AF
0x03FBC0  B7               OR A
0x03FBC1  28 25            JR Z, 0x03FBE8
0x03FBC3  3A 91 40 D1      LD A, (0xD14091)
0x03FBC7  B7               OR A
0x03FBC8  28 1E            JR Z, 0x03FBE8
0x03FBCA  32 B2 41 D1      LD (0xD141B2), A
0x03FBCE  F1               POP AF
0x03FBCF  F5               PUSH AF
0x03FBD0  FD CB 28 5E      BIT 3, (IY+40)
0x03FBD4  28 02            JR Z, 0x03FBD8
0x03FBD6  3E 39            LD A, 0x39                   ; force 0x39
0x03FBD8  F5               PUSH AF
0x03FBD9  3A B5 41 D1      LD A, (0xD141B5)             ; guard existing buffered key
0x03FBDD  B7               OR A
0x03FBDE  20 07            JR NZ, 0x03FBE7
0x03FBE0  F1               POP AF
0x03FBE1  32 B5 41 D1      LD (0xD141B5), A             ; only real key-code write
0x03FBE5  18 01            JR 0x03FBE8
0x03FBE7  F1               POP AF
0x03FBE8  F1               POP AF
0x03FBE9  C9               RET
0x03FBEA  FD CB 08 8E      RES 1, (IY+8)
0x03FBEE  C3 0A C6 08      JP 0x08C60A
0x03FBF2  FD CB 12 76      BIT 6, (IY+18)
0x03FBF6  C0               RET NZ
0x03FBF7  18 08            JR 0x03FC01
0x03FBF9  FD CB 05 A6      RES 4, (IY+5)
0x03FBFD  FD CB 12 B6      RES 6, (IY+18)
0x03FC01  FD CB 12 7E      BIT 7, (IY+18)
0x03FC05  C0               RET NZ
0x03FC06  FD CB 12 A6      RES 4, (IY+18)
0x03FC0A  FD CB 45 B6      RES 6, (IY+69)
0x03FC0E  C9               RET
0x03FC0F  FD CB 12 F6      SET 6, (IY+18)
0x03FC13  FD CB 12 E6      SET 4, (IY+18)
0x03FC17  FD CB 12 AE      RES 5, (IY+18)
0x03FC1B  C9               RET
```

## 2. All CALL Targets Inside 0x03FA09

| Site | Target | Notes |
| --- | --- | --- |
| `0x03FABD` | `0x02515C` | helper in zero-key/port-0x5004 path |
| `0x03FAC1` | `0x0005F4` | helper whose Z result can short-circuit to commit block |
| `0x03FAED` | `0x048AC4` | helper used when `D177B7 != 0x55` and `!= 0xAA` |
| `0x03FB03` | `0x049087` | helper in `D177B7 == 0x55` / `IN0 0x0F` path |
| `0x03FB0A` | `0x049E07` | helper in same path; `CP 0x01` can jump to cleanup |
| `0x03FB43` | `0x049656` | helper bracketed by port `0x5004` bit twiddling |
| `0x03FB6C` | `0x049EF5` | common cleanup/continuation helper |
| `0x03FB8C` | `0x02C033` | called when `BIT 7,(0xD17766)` was set |

There are no calls from this routine to `0x05D58F`, and there are no reads or writes of `0xD1441D`.

## 3. Where It Reads `0xD00587`

The only `D00587` read in the function is the entry drain:

```asm
0x03FA09  LD HL, 0xD00587
0x03FA0E  LD A, (HL)
0x03FA0F  LD (HL), 0x00
```

So the function:

1. loads the pending raw byte from `kbdScanCode`
2. clears the byte immediately
3. clears the ready flag bit at `(IY+0).3`
4. keeps the candidate key in `A` and on the stack for the rest of the routine

No later instruction re-reads `D00587`.

## 4. What Transformation It Applies

### Normal path

- If the drained byte is nonzero, the function jumps straight to `0x03FB9A`.
- In that path there is **no lookup table** and no index math.
- The byte in `A` is normally preserved all the way to `0x03FBE1`.

So the base transform is:

```text
D00587 != 0  ->  candidate key = D00587
```

### Explicit rewrites seen in the code

1. `0x03FA83`: one zero-input hardware path synthesizes `A = 0x01`.
2. `0x03FBBC-0x03FBBF`: if `BIT 0,(IY+0x12)` is set and the surrounding flag tests pass, the candidate is replaced with `0x0F`.
3. `0x03FBD0-0x03FBD6`: if `BIT 3,(IY+0x28)` is set, the candidate is replaced with `0x39`.

### Final gating before commit

- `0x03FBC0-0x03FBC1`: if candidate `A == 0`, return with no write.
- `0x03FBC3-0x03FBC8`: if `D14091 == 0`, return with no write.
- `0x03FBD9-0x03FBDE`: if `D141B5` is already nonzero, do not overwrite it.

### Practical conclusion

`0x03FA09` is **not** the large modifier translation table routine described elsewhere in the ROM. In this path it behaves as a queue/drain wrapper around `D00587`, with a few flag-driven overrides:

```text
normal case:   output = input
special case:  output = 0x01 / 0x0F / 0x39
```

## 5. Confirmed Write to `0xD141B5` at `0x03FBE1`

The write is present exactly as expected:

```asm
0x03FBD8  PUSH AF
0x03FBD9  LD A, (0xD141B5)
0x03FBDD  OR A
0x03FBDE  JR NZ, 0x03FBE7
0x03FBE0  POP AF
0x03FBE1  LD (0xD141B5), A
```

This is the only real key-code store into `D141B5` in the block. It is guarded by a zero test, so `D141B5` is treated as a single-slot pending-key buffer.

## 6. The 8 CALL-Site Callers of `0x03FA09`

Searching the ROM for `CD 09 FA 03` yields these 8 call sites:

| Caller | Opcode |
| --- | --- |
| `0x02FDBE` | `CALL 0x03FA09` |
| `0x03005C` | `CALL 0x03FA09` |
| `0x03FC36` | `CALL 0x03FA09` |
| `0x040C9D` | `CALL 0x03FA09` |
| `0x044FDA` | `CALL 0x03FA09` |
| `0x0461C2` | `CALL 0x03FA09` |
| `0x056224` | `CALL 0x03FA09` |
| `0x09CFA5` | `CALL 0x03FA09` |

There is also one extra non-CALL entrypoint:

| Thunk | Opcode |
| --- | --- |
| `0x02014C` | `JP 0x03FA09` |

That `JP` is the SDK/API jump-table entry for `_GetCSC`.

## 7. Does It Reference `0x05D58F` or `0xD1441D`?

No.

- No direct `CALL`, `JP`, or immediate-load reference to `0x05D58F`
- No direct `LD HL,(0xD1441D)`, `LD BC,(0xD1441D)`, or store to `0xD1441D`

The connection is indirect:

```text
0x03FA09 -> write D141B5
0x02BD96 / 0x02BDD1 -> read D141B5
0x02BDA3 / 0x02BDDE -> CALL 0x05D58F
0x05D58F -> read D1441D and fetch 4-byte action descriptor
```

## 8. Function Size

- Core `0x03FA09` routine up to its main return at `0x03FBE9`:
  - `0x03FA09-0x03FBE9`
  - size `0x1E1` bytes = `481` bytes
- Full contiguous code island including nearby helper entrypoints before the next function at `0x03FC1C`:
  - `0x03FA09-0x03FC1B`
  - size `0x213` bytes = `531` bytes

## Bottom Line

The `0x03FA09` block does **not** do a table-driven scan-code-to-token conversion. It drains `D00587`, conditionally synthesizes or overrides a few values, and then returns the candidate in `A` while optionally queueing that same candidate into `D141B5`.

The exact byte-level flow is:

```text
D00587 -> A
clear D00587
if nonzero: mostly keep A unchanged
if zero: run port/flag helpers, maybe synthesize 0x01
optional override to 0x0F
optional override to 0x39
if A != 0 and D14091 != 0 and D141B5 == 0:
    D141B5 = A
return A
```

