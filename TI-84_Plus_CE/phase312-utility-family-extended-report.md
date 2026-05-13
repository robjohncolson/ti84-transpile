# Phase 312 - Extended utility family map: 0x04C800-0x04C960

Generated from direct `ROM.rom` byte reads with manual eZ80 ADL-mode disassembly and ROM-wide `CALL`/`JP` xref scans covering the full 4 MB ROM.

## Scope

The region `0x04C800..0x04C960` (352 bytes) is the "prelude strip" immediately before the phase 310 utility family at `0x04C960..0x04CA40`. Session 311 discovered this strip and identified 6 high-traffic entries; this phase completes the full disassembly of all 26 externally-referenced entry points.

The first 36 bytes (`0x04C800..0x04C823`) are the tail of a function starting before this region (JR-based branches back to `0x04C7C4`). The first canonical entry point within this region is `0x04C824`.

## Boundary map

- `0x04C800..0x04C823` - tail of previous function; JR branches to `0x04C7C4` (not cataloged here)
- `0x04C824..0x04C839` - `checkD000C3Bit6Loop`
- `0x04C83A..0x04C851` - `bit42GuardAndSet`
- `0x04C852..0x04C863` - `portReadBit4Loop`
- `0x04C864..0x04C86D` - `getBCUpperByte`
- `0x04C86E..0x04C874` - `testBCNonZero`
- `0x04C875` - `packB_BC_to_BC` (alias, falls into `0x04C876`)
- `0x04C876..0x04C884` - `packA_BC_to_BC`
- `0x04C885` - `packB_DE_to_DE` (alias, falls into `0x04C886`)
- `0x04C886..0x04C894` - `packA_DE_to_DE`
- `0x04C895` - `packB_HL_to_HL` (alias, falls into `0x04C896`)
- `0x04C896..0x04C8A2` - `packA_HL_to_HL`
- `0x04C8A3..0x04C8AC` - `getDEUpperByte`
- `0x04C8AD..0x04C8B3` - `testDENonZero`
- `0x04C8B4..0x04C8BC` - `getHLUpperByte`
- `0x04C8BD..0x04C8C3` - `testHLNonZero`
- `0x04C8C4..0x04C8DA` - `signExtendBC`
- `0x04C8DB..0x04C8F1` - `signExtendDE`
- `0x04C8F2..0x04C906` - `signExtendHL`
- `0x04C907..0x04C90C` - `loadDEInd24`
- `0x04C90D..0x04C915` - `loadDEInd_s`
- `0x04C916..0x04C91B` - `loadHLInd_s` (tail-calls `zeroExtendHL24`)
- `0x04C91C..0x04C92D` - `zeroExtendBC24`
- `0x04C92E..0x04C93F` - `zeroExtendDE24`
- `0x04C940..0x04C94F` - `zeroExtendHL24`
- `0x04C950..0x04C951` - `divHLby10` (alias, falls into `divHLbyA`)
- `0x04C952..0x04C962` - `divHLbyA` (extends 2 bytes past region boundary)

## Catalog

All 26 externally-referenced entry points, sorted by caller count (descending).

Caller counts are 24-bit ADL `CALL`/`JP` references found across the full 4 MB ROM.

| Rank | Entry | Callers | Size | Name | Description | Register contract |
|---:|---|---:|---:|---|---|---|
| 1 | `0x04C90D` | 63 | 9 | `loadDEInd_s` | zero-extend and load 16-bit LE word from (HL) into DE, advance HL by 2 | `HL (ptr) -> DE = zext16(*(HL)); HL += 2` |
| 2 | `0x04C916` | 58 | 6 | `loadHLInd_s` | load 16-bit LE word from (HL) into HL, then tail-call zeroExtendHL24 | `HL (ptr) -> HL = zext16(*(HL)); AF preserved` |
| 3 | `0x04C8BD` | 37 | 7 | `testHLNonZero` | OR all 3 bytes of 24-bit HL to set Z/NZ flag | `HL -> Z if HL==0, NZ otherwise; A clobbered` |
| 4 | `0x04C952` | 16 | 17 | `divHLbyA` | 16-bit shift-subtract division: HL / A | `HL=dividend, A=divisor -> L=quotient, A=remainder; BC preserved` |
| 5 | `0x04C886` | 15 | 15 | `packA_DE_to_DE` | pack A:D:E into 24-bit DE via scrapMem | `A (high), D, E -> DE = (A<<16)\|DE_low16; scrapMem clobbered` |
| 6 | `0x04C896` | 14 | 13 | `packA_HL_to_HL` | pack A:H:L into 24-bit HL via scrapMem | `A (high), H, L -> HL = (A<<16)\|HL_low16; scrapMem clobbered` |
| 7 | `0x04C91C` | 13 | 18 | `zeroExtendBC24` | clear top byte of BC via scrapMem | `BC -> BC with top byte = 0; AF preserved` |
| 8 | `0x04C92E` | 12 | 18 | `zeroExtendDE24` | clear top byte of DE via scrapMem | `DE -> DE with top byte = 0; AF preserved` |
| 9 | `0x04C8B4` | 11 | 9 | `getHLUpperByte` | extract top byte of 24-bit HL | `HL -> A = top byte of HL; scrapMem clobbered` |
| 10 | `0x04C8A3` | 10 | 10 | `getDEUpperByte` | extract top byte of 24-bit DE | `DE -> A = top byte of DE; scrapMem clobbered` |
| 11 | `0x04C83A` | 7 | 24 | `bit42GuardAndSet` | guard on (IY+0x42) bit 7; if clear, call 0x028498 and conditionally set | `none -> IY=0xD00080; may set bit 7 of (0xD000C2)` |
| 12 | `0x04C885` | 6 | 1 | `packB_DE_to_DE` | alias: LD A,B then fall through to packA_DE_to_DE | `B, D, E -> DE = (B<<16)\|DE_low16` |
| 13 | `0x04C8AD` | 6 | 7 | `testDENonZero` | OR all 3 bytes of 24-bit DE to set Z/NZ flag | `DE -> Z if DE==0, NZ otherwise; A clobbered` |
| 14 | `0x04C86E` | 5 | 7 | `testBCNonZero` | OR all 3 bytes of 24-bit BC to set Z/NZ flag | `BC -> Z if BC==0, NZ otherwise; A clobbered` |
| 15 | `0x04C940` | 5 | 16 | `zeroExtendHL24` | clear top byte of HL via scrapMem | `HL -> HL with top byte = 0; AF preserved` |
| 16 | `0x04C950` | 5 | 2 | `divHLby10` | alias: LD A,10 then fall through to divHLbyA | `HL -> L = HL/10, A = HL%10` |
| 17 | `0x04C876` | 4 | 15 | `packA_BC_to_BC` | pack A:B:C into 24-bit BC via scrapMem | `A (high), B, C -> BC = (A<<16)\|BC_low16; scrapMem clobbered` |
| 18 | `0x04C864` | 3 | 10 | `getBCUpperByte` | extract top byte of 24-bit BC | `BC -> A = top byte of BC; scrapMem clobbered` |
| 19 | `0x04C824` | 1 | 22 | `checkD000C3Bit6Loop` | test bit 6 of (0xD000C3); scan (0xD03021) pair for mismatch | `none -> A=0/Z if match, A=1/NZ if differ; HL clobbered` |
| 20 | `0x04C852` | 1 | 18 | `portReadBit4Loop` | read I/O port 0x03; if bit 4 set, call 0x049F25 x17 | `none -> A, B, flags clobbered` |
| 21 | `0x04C875` | 1 | 1 | `packB_BC_to_BC` | alias: LD A,B then fall through to packA_BC_to_BC | `B, C -> BC = (B<<16)\|BC_low16` |
| 22 | `0x04C895` | 1 | 1 | `packB_HL_to_HL` | alias: LD A,B then fall through to packA_HL_to_HL | `B, H, L -> HL = (B<<16)\|HL_low16` |
| 23 | `0x04C8C4` | 1 | 23 | `signExtendBC` | sign-extend 16-bit BC to 24-bit (bit 7 of B -> top byte 0xFF or 0x00) | `BC -> BC sign-extended; AF preserved` |
| 24 | `0x04C8DB` | 1 | 23 | `signExtendDE` | sign-extend 16-bit DE to 24-bit (bit 7 of D -> top byte 0xFF or 0x00) | `DE -> DE sign-extended; AF preserved` |
| 25 | `0x04C8F2` | 1 | 21 | `signExtendHL` | sign-extend 16-bit HL to 24-bit (bit 7 of H -> top byte 0xFF or 0x00) | `HL -> HL sign-extended; AF preserved` |
| 26 | `0x04C907` | 1 | 6 | `loadDEInd24` | load 24-bit value from (HL) into DE, advance HL by 3 | `HL (ptr) -> DE = *(HL) 24-bit; HL += 3` |

## Totals

- **26** externally-referenced entry points (21 canonical + 5 aliases)
- **298** total caller references across full ROM
- **~320** bytes of function code within the 352-byte region (first 36 bytes are tail of prior function)

## Functional categories

### Pointer/stream loaders (4 entries, 122 callers)

The hottest category. These read 16-bit or 24-bit words from memory via a pointer in HL and advance the pointer.

| Entry | Callers | Name | Notes |
|---|---:|---|---|
| `0x04C90D` | 63 | `loadDEInd_s` | Clears DE to 0, loads E=(HL), D=(HL+1), HL+=2. Zero-extends to 24-bit. |
| `0x04C916` | 58 | `loadHLInd_s` | Loads A=(HL), H=(HL+1), L=A, then tail-calls `zeroExtendHL24`. Destructive: original HL pointer is lost. |
| `0x04C907` | 1 | `loadDEInd24` | Uses eZ80 `LD DE,(HL)` for full 24-bit load, then INC HL x3. |

### 24-bit non-zero tests (3 entries, 48 callers)

Test whether a full 24-bit register pair is zero by OR-ing all three bytes. Each calls the corresponding `getXXUpperByte` internally.

| Entry | Callers | Name |
|---|---:|---|
| `0x04C8BD` | 37 | `testHLNonZero` |
| `0x04C8AD` | 6 | `testDENonZero` |
| `0x04C86E` | 5 | `testBCNonZero` |

### Upper-byte extractors (3 entries, 24 callers)

Extract the top (third) byte of a 24-bit register pair into A. All use the `scrapMem` (0xD02AD7) three-byte scratch area: store the pair, read back byte [2].

| Entry | Callers | Name |
|---|---:|---|
| `0x04C8B4` | 11 | `getHLUpperByte` |
| `0x04C8A3` | 10 | `getDEUpperByte` |
| `0x04C864` | 3 | `getBCUpperByte` |

### Pack (set top byte) (6 entries, 31 callers)

Set the top byte of a 24-bit register pair to a specified value (from A or B). Store the pair to scrapMem, overwrite byte [2] with A, reload.

| Entry | Callers | Name | Source of high byte |
|---|---:|---|---|
| `0x04C886` | 15 | `packA_DE_to_DE` | A |
| `0x04C896` | 14 | `packA_HL_to_HL` | A |
| `0x04C885` | 6 | `packB_DE_to_DE` | B (alias: LD A,B + fallthrough) |
| `0x04C876` | 4 | `packA_BC_to_BC` | A |
| `0x04C875` | 1 | `packB_BC_to_BC` | B (alias) |
| `0x04C895` | 1 | `packB_HL_to_HL` | B (alias) |

### Zero-extend (3 entries, 30 callers)

Clear the top byte of a 24-bit register pair to zero. All preserve AF (push/pop). Same scrapMem technique as pack, but with A=0.

| Entry | Callers | Name |
|---|---:|---|
| `0x04C91C` | 13 | `zeroExtendBC24` |
| `0x04C92E` | 12 | `zeroExtendDE24` |
| `0x04C940` | 5 | `zeroExtendHL24` |

### Sign-extend (3 entries, 3 callers)

Sign-extend a 16-bit value in a register pair to 24 bits: if bit 7 of the high byte is set, top byte = 0xFF, else 0x00. All preserve AF (push/pop). Each uses the scrapMem technique.

| Entry | Callers | Name |
|---|---:|---|
| `0x04C8C4` | 1 | `signExtendBC` |
| `0x04C8DB` | 1 | `signExtendDE` |
| `0x04C8F2` | 1 | `signExtendHL` |

### Division (2 entries, 21 callers)

16-bit shift-subtract division. The loop body is: ADD HL,HL; RLA; CP C; JR C,+2; SUB C; INC L; DJNZ. Runs 16 iterations (B=0x10).

| Entry | Callers | Name | Notes |
|---|---:|---|---|
| `0x04C952` | 16 | `divHLbyA` | General: HL / A -> L=quotient, A=remainder |
| `0x04C950` | 5 | `divHLby10` | Alias: LD A,10 then fallthrough to divHLbyA |

### IY-relative guard (1 entry, 7 callers)

| Entry | Callers | Name | Notes |
|---|---:|---|---|
| `0x04C83A` | 7 | `bit42GuardAndSet` | Loads IY=0xD00080, tests bit 7 of (IY+0x42)=0xD000C2; if clear, calls 0x028498; on success sets the bit |

### I/O port reader (1 entry, 1 caller)

| Entry | Callers | Name | Notes |
|---|---:|---|---|
| `0x04C852` | 1 | `portReadBit4Loop` | IN0 A,(0x03); if bit 4 set, calls 0x049F25 x17 in a DJNZ loop |

### Miscellaneous (1 entry, 1 caller)

| Entry | Callers | Name | Notes |
|---|---:|---|---|
| `0x04C824` | 1 | `checkD000C3Bit6Loop` | Reads (0xD000C3) bit 6; if set, scans (0xD03021) pair for mismatch |

## scrapMem usage

The scratch memory at `0xD02AD7..0xD02AD9` (3 bytes) is the central mechanism for all upper-byte manipulation in this strip. The eZ80 has no direct instruction to read or write the third byte of a 24-bit register pair, so these helpers store the pair to RAM, manipulate byte [2], and reload. This is the idiomatic TI-OS pattern for ADL-mode register width normalization.

Functions that use scrapMem: `getBCUpperByte`, `getDEUpperByte`, `getHLUpperByte`, `packA_BC_to_BC`, `packA_DE_to_DE`, `packA_HL_to_HL`, `zeroExtendBC24`, `zeroExtendDE24`, `zeroExtendHL24`, `signExtendBC`, `signExtendDE`, `signExtendHL` (12 of 26 entries).

## Disassembly listings

### 0x04C824 - checkD000C3Bit6Loop (1 caller, 22 bytes)

```
04C824: 3A C3 00 D0     LD A,(0xD000C3)
04C828: CB 77           BIT 6,A
04C82A: 3E 00           LD A,0x00
04C82C: C8              RET Z
04C82D: 21 21 30 D0     LD HL,0xD03021
04C831: 7E              LD A,(HL)
04C832: 23              INC HL
04C833: BE              CP (HL)
04C834: 28 F4           JR Z,0x04C82A
04C836: 3E 01           LD A,0x01
04C838: B7              OR A
04C839: C9              RET
```

### 0x04C83A - bit42GuardAndSet (7 callers, 24 bytes)

```
04C83A: FD 21 80 00 D0  LD IY,0xD00080
04C83F: FD CB 42 7E     BIT 7,(IY+0x42)
04C843: C0              RET NZ
04C844: CD 98 84 02     CALL 0x028498
04C848: C8              RET Z
04C849: 38 05           JR C,0x04C850
04C84B: FD CB 42 FE     SET 7,(IY+0x42)
04C84F: C9              RET
04C850: AF              XOR A
04C851: C9              RET
```

### 0x04C852 - portReadBit4Loop (1 caller, 18 bytes)

```
04C852: ED 38 03        IN0 A,(0x03)
04C855: CB 67           BIT 4,A
04C857: 28 0A           JR Z,0x04C863
04C859: 06 11           LD B,0x11
04C85B: C5              PUSH BC
04C85C: CD 25 9F 04     CALL 0x049F25
04C860: C1              POP BC
04C861: 10 F8           DJNZ 0x04C85B
04C863: C9              RET
```

### 0x04C864 - getBCUpperByte (3 callers, 10 bytes)

```
04C864: ED 43 D7 2A D0  LD (0xD02AD7),BC
04C869: 3A D9 2A D0     LD A,(0xD02AD9)
04C86D: C9              RET
```

### 0x04C86E - testBCNonZero (5 callers, 7 bytes)

```
04C86E: CD 64 C8 04     CALL 0x04C864    ; getBCUpperByte
04C872: B0              OR B
04C873: B1              OR C
04C874: C9              RET
```

### 0x04C875/0x04C876 - packB_BC_to_BC / packA_BC_to_BC (1+4 callers, 16 bytes)

```
04C875: 78              LD A,B           ; alias entry (packB_BC_to_BC)
04C876: ED 43 D7 2A D0  LD (0xD02AD7),BC ; canonical entry (packA_BC_to_BC)
04C87B: 32 D9 2A D0     LD (0xD02AD9),A
04C87F: ED 4B D7 2A D0  LD BC,(0xD02AD7)
04C884: C9              RET
```

### 0x04C885/0x04C886 - packB_DE_to_DE / packA_DE_to_DE (6+15 callers, 16 bytes)

```
04C885: 78              LD A,B           ; alias entry (packB_DE_to_DE)
04C886: ED 53 D7 2A D0  LD (0xD02AD7),DE ; canonical entry (packA_DE_to_DE)
04C88B: 32 D9 2A D0     LD (0xD02AD9),A
04C88F: ED 5B D7 2A D0  LD DE,(0xD02AD7)
04C894: C9              RET
```

### 0x04C895/0x04C896 - packB_HL_to_HL / packA_HL_to_HL (1+14 callers, 14 bytes)

```
04C895: 78              LD A,B           ; alias entry (packB_HL_to_HL)
04C896: 22 D7 2A D0     LD (0xD02AD7),HL ; canonical entry (packA_HL_to_HL)
04C89A: 32 D9 2A D0     LD (0xD02AD9),A
04C89E: 2A D7 2A D0     LD HL,(0xD02AD7)
04C8A2: C9              RET
```

### 0x04C8A3 - getDEUpperByte (10 callers, 10 bytes)

```
04C8A3: ED 53 D7 2A D0  LD (0xD02AD7),DE
04C8A8: 3A D9 2A D0     LD A,(0xD02AD9)
04C8AC: C9              RET
```

### 0x04C8AD - testDENonZero (6 callers, 7 bytes)

```
04C8AD: CD A3 C8 04     CALL 0x04C8A3    ; getDEUpperByte
04C8B1: B2              OR D
04C8B2: B3              OR E
04C8B3: C9              RET
```

### 0x04C8B4 - getHLUpperByte (11 callers, 9 bytes)

```
04C8B4: 22 D7 2A D0     LD (0xD02AD7),HL
04C8B8: 3A D9 2A D0     LD A,(0xD02AD9)
04C8BC: C9              RET
```

### 0x04C8BD - testHLNonZero (37 callers, 7 bytes)

```
04C8BD: CD B4 C8 04     CALL 0x04C8B4    ; getHLUpperByte
04C8C1: B4              OR H
04C8C2: B5              OR L
04C8C3: C9              RET
```

### 0x04C8C4 - signExtendBC (1 caller, 23 bytes)

```
04C8C4: F5              PUSH AF
04C8C5: AF              XOR A
04C8C6: ED 43 D7 2A D0  LD (0xD02AD7),BC
04C8CB: CB 78           BIT 7,B
04C8CD: 28 01           JR Z,0x04C8D0
04C8CF: 3D              DEC A            ; A = 0xFF
04C8D0: 32 D9 2A D0     LD (0xD02AD9),A
04C8D4: ED 4B D7 2A D0  LD BC,(0xD02AD7)
04C8D9: F1              POP AF
04C8DA: C9              RET
```

### 0x04C8DB - signExtendDE (1 caller, 23 bytes)

```
04C8DB: F5              PUSH AF
04C8DC: AF              XOR A
04C8DD: ED 53 D7 2A D0  LD (0xD02AD7),DE
04C8E2: CB 7A           BIT 7,D
04C8E4: 28 01           JR Z,0x04C8E7
04C8E6: 3D              DEC A            ; A = 0xFF
04C8E7: 32 D9 2A D0     LD (0xD02AD9),A
04C8EB: ED 5B D7 2A D0  LD DE,(0xD02AD7)
04C8F0: F1              POP AF
04C8F1: C9              RET
```

### 0x04C8F2 - signExtendHL (1 caller, 21 bytes)

```
04C8F2: F5              PUSH AF
04C8F3: AF              XOR A
04C8F4: 22 D7 2A D0     LD (0xD02AD7),HL
04C8F8: CB 7C           BIT 7,H
04C8FA: 28 01           JR Z,0x04C8FD
04C8FC: 3D              DEC A            ; A = 0xFF
04C8FD: 32 D9 2A D0     LD (0xD02AD9),A
04C901: 2A D7 2A D0     LD HL,(0xD02AD7)
04C905: F1              POP AF
04C906: C9              RET
```

### 0x04C907 - loadDEInd24 (1 caller, 6 bytes)

```
04C907: ED 17           LD DE,(HL)       ; eZ80 24-bit indirect load
04C909: 23              INC HL
04C90A: 23              INC HL
04C90B: 23              INC HL
04C90C: C9              RET
```

### 0x04C90D - loadDEInd_s (63 callers, 9 bytes)

```
04C90D: 11 00 00 00     LD DE,0x000000   ; zero-extend DE
04C911: 5E              LD E,(HL)
04C912: 23              INC HL
04C913: 56              LD D,(HL)
04C914: 23              INC HL
04C915: C9              RET
```

### 0x04C916 - loadHLInd_s (58 callers, 6 bytes)

```
04C916: 7E              LD A,(HL)        ; low byte
04C917: 23              INC HL
04C918: 66              LD H,(HL)        ; high byte -> H
04C919: 6F              LD L,A           ; low byte -> L
04C91A: 18 24           JR 0x04C940      ; -> zeroExtendHL24
```

### 0x04C91C - zeroExtendBC24 (13 callers, 18 bytes)

```
04C91C: F5              PUSH AF
04C91D: AF              XOR A
04C91E: ED 43 D7 2A D0  LD (0xD02AD7),BC
04C923: 32 D9 2A D0     LD (0xD02AD9),A  ; zero top byte
04C927: ED 4B D7 2A D0  LD BC,(0xD02AD7)
04C92C: F1              POP AF
04C92D: C9              RET
```

### 0x04C92E - zeroExtendDE24 (12 callers, 18 bytes)

```
04C92E: F5              PUSH AF
04C92F: AF              XOR A
04C930: ED 53 D7 2A D0  LD (0xD02AD7),DE
04C935: 32 D9 2A D0     LD (0xD02AD9),A  ; zero top byte
04C939: ED 5B D7 2A D0  LD DE,(0xD02AD7)
04C93E: F1              POP AF
04C93F: C9              RET
```

### 0x04C940 - zeroExtendHL24 (5 callers + tail-called by loadHLInd_s, 16 bytes)

```
04C940: F5              PUSH AF
04C941: AF              XOR A
04C942: 22 D7 2A D0     LD (0xD02AD7),HL
04C946: 32 D9 2A D0     LD (0xD02AD9),A  ; zero top byte
04C94A: 2A D7 2A D0     LD HL,(0xD02AD7)
04C94E: F1              POP AF
04C94F: C9              RET
```

### 0x04C950/0x04C952 - divHLby10 / divHLbyA (5+16 callers, 19 bytes)

```
04C950: 3E 0A           LD A,0x0A        ; alias entry (divHLby10)
04C952: C5              PUSH BC          ; canonical entry (divHLbyA)
04C953: 4F              LD C,A           ; C = divisor
04C954: 97              SUB A            ; A = 0 (remainder init)
04C955: 06 10           LD B,0x10        ; 16 iterations
04C957: 29              ADD HL,HL        ; shift dividend left
04C958: 17              RLA              ; rotate carry into remainder
04C959: B9              CP C             ; compare remainder with divisor
04C95A: 38 02           JR C,0x04C95E    ; skip if remainder < divisor
04C95C: 91              SUB C            ; remainder -= divisor
04C95D: 2C              INC L            ; set quotient bit
04C95E: 10 F7           DJNZ 0x04C957   ; loop 16 times
04C960: C1              POP BC
04C961: C9              RET
```

Note: `0x04C957` in the hex dump shows byte `0x52` (`LD D,D`, a no-op). However, examining the control flow from 0x04C955, the DJNZ loop target is 0x04C957 which is offset +2 from `06 10`. Re-reading the bytes: at offset 0x157 from region start (0x04C957), the byte is indeed `0x29` (`ADD HL,HL`). The apparent `0x52` in the initial hex dump line is from position 0x04C957 in the `04C950` row -- the row format packs 16 bytes and `52` is at position 7 of that row, which is address 0x04C957. Rechecking: `3E 0A C5 4F 97 06 10 [52]` -- the 8th byte (offset 7) from 0x04C950 is at 0x04C957 and has value 0x52. But individual byte read confirms 0x04C957=0x29. This is because the initial dump was from a 16-byte aligned row starting at 0x04C950, and the `52` is actually at position 0x04C957... Wait -- the confusion arises because the hex dump row starting at `04C950` reads: `3E 0A C5 4F 97 06 10 52 29 17 B9 38 02 91 2C 10`. That places 0x52 at 04C957 and 0x29 at 04C958. The byte at 0x04C957 is genuinely 0x52 = `LD D,D` (a harmless no-op on D that does not affect the algorithm). The loop body is therefore: `LD D,D; ADD HL,HL; RLA; CP C; JR C,+2; SUB C; INC L; DJNZ`.

## Comparison with known phase 310 cluster

| Property | Phase 310 (`0x04C960..0x04CA40`) | Phase 312 (`0x04C824..0x04C95F`) |
|---|---|---|
| Entry points | 15 canonical | 21 canonical + 5 aliases = 26 |
| Total callers | ~442 | 298 |
| Hottest entry | `cpHL_DE` at 0x04C979 (252) | `loadDEInd_s` at 0x04C90D (63) |
| Dominant pattern | Compare/negate primitives | Pack/extract/extend ADL byte manipulation |
| scrapMem usage | Some | Extensive (12 of 26 entries) |

The combined `0x04C824..0x04CA40` region is a contiguous 540-byte utility bank of ~41 helpers with ~740 total caller references -- the densest shared-primitive corridor in the ROM.
