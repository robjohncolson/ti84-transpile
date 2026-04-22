# Phase 25T - InsertMem subroutine disassembly

## Scope

Three pointer-update subroutines called by InsertMem (0x0821B9) after the heap/VAT memory move:

- `0x082739`: Post-move helper — walks the entire VAT (symTable) and adjusts data pointers
- `0x0824D6`: Tail helper A — adjusts three consecutive pointers at 0xD02317/1A/1D
- `0x0824FD`: Tail helper B — adjusts 27 individual RAM pointers via helper at 0x0825D1

Also disassembled:

- `0x0825D1`: Pointer adjust primitive called by tail helper B

Decoder: `decodeInstruction(romBytes, pc, "adl")` from `ez80-decoder.js`.

## Direct answers

### 0x082739 (post-move helper)

- This is the **VAT walker**. It starts at `0xD3FFFF` (symTable end), saves incoming `BC` to `slot_D02577`, then loops backward through every VAT entry.
- The loop at `0x082745` reads a 3-byte data pointer from each VAT entry (bytes at HL-2, HL-1, HL), calls `0x04C876` (likely a 24-bit pointer compose helper) and `0x0821B2` (VAT entry type/skip check).
- For matching entries, it compares the data pointer against `BC` (the original InsertMem size) and adjusts the pointer if it falls within the moved region: `call 0x082C0B` performs the actual pointer write-back.
- After each entry, it calls `0x08279E` to determine the entry's name length, then advances `HL` past the entry. The name-length helper at `0x08279E` reads the VAT type byte, masks with `0x3F`, calls `0x080084` for type lookup, then optionally reads the name to compute its length.
- **Loop termination**: at `0x082791`, it loads `OPBase` (`0xD02590`) and compares the current position against it. If `HL - entry_size < OPBase`, the loop terminates (`ret c`). Otherwise it jumps back to `0x082745`.
- **OPBase is READ here as the loop bound, never written.** This routine does not modify OPBase, OPS, pTemp, progPtr, or any of the standard allocator pointers.

### 0x0824D6 (tail helper A)

- Adjusts exactly three pointers stored at `0xD02317`, `0xD0231A`, and `0xD0231D` (3-byte pointers, 3 bytes apart).
- Input contract: `DE` = old insertion point (FPSbase before move), `BC` = size inserted.
- Guard: reads `(0xD02317)`, subtracts DE. If the pointer is below the insertion point (`ret c`) or equal to it (`ret z`), the routine exits — those pointers don't need adjustment.
- If the pointer is above the insertion point, all three are decremented by `BC` (the insert size): `HL = (addr) - BC; (addr) = HL`.
- These three addresses are likely OS-internal cursor/state pointers (not part of the standard `ti84pceg.inc` symbol set).
- **Does not touch OPBase, OPS, pTemp, progPtr, or any allocator pointers.**

### 0x0824FD (tail helper B)

- A bulk pointer adjuster that updates **27 individual RAM addresses** using the primitive at `0x0825D1`.
- Each address holds a 3-byte pointer that may need adjustment after InsertMem shifts memory.
- The routine is a flat sequence of `ld hl, <addr>; call 0x0825d1` pairs, with the last entry falling through directly into the `0x0825D1` code.
- Input contract (inherited): `DE` = old insertion point, `BC` = size inserted.

### 0x0825D1 (pointer adjust primitive)

- Reads the 3-byte pointer at `(HL)` via `ed 27` (ld hl, (hl) — eZ80 indirect pair load).
- Compares it against `DE` (old insertion point). If the pointer is at or below `DE`, the routine returns unchanged.
- If the pointer is above `DE`, it adjusts: loads the pointer again from `(HL)`, subtracts `BC` (insert size), and writes the result back via `ed 0f` (eZ80 indirect pair store).

## Pointer access matrix

| Symbol | 0x082739 | 0x0824D6 | 0x0824FD | 0x0825D1 |
| --- | --- | --- | --- | --- |
| OPBase (0xD02590) | **read** (loop bound) | - | - | - |
| OPS (0xD02593) | - | - | - | - |
| pTempCnt (0xD02596) | - | - | - | - |
| pTemp (0xD0259A) | - | - | - | - |
| progPtr (0xD0259D) | - | - | - | - |
| FPSbase / heap top (0xD0258A) | - | - | - | - |
| FPS / VAT region (0xD0258D) | - | - | - | read (in code past 0x0825EA) |
| newDataPtr (0xD025A0) | - | - | **adjusted** (via 0x0825D1) | - |
| pagedGetPtr (0xD025A3) | - | - | - | - |
| tempMem (0xD02587) | - | - | - | - |
| slot_D02577 | write+read | - | - | - |
| symTable end (0xD3FFFF) | load-addr | - | - | - |

## Implication for the CreateReal probe

1. **OPBase is only read, never written**, by any of these three subroutines. It serves as the loop terminator for the VAT walk at `0x082739`. The observed `OPBase = 0xA88100` corruption does NOT originate in these routines.

2. **OPS, pTemp, progPtr, pTempCnt, and pagedGetPtr are completely untouched** by all three subroutines. None of the standard allocator "pointer trio" is adjusted here.

3. **newDataPtr is adjusted** by tail helper B (`0x0824FD`) via the bulk pointer adjuster. This is correct behavior — `newDataPtr` points into the VAT data area which shifts during InsertMem.

4. **The 0x04C990 system area pointer adjuster** (called separately by InsertMem before these three) is the only remaining candidate for adjusting OPBase/OPS/pTemp/progPtr. The Phase 25S report should confirm or deny this.

5. **0x0824D6 adjusts three undocumented pointers** at `0xD02317`, `0xD0231A`, `0xD0231D` — likely internal parsing or cursor state.

6. **0x0824FD adjusts 27 pointers** scattered across RAM, mostly in the 0xD006xx and 0xD022xx/0xD024xx/0xD01Fxx ranges. These appear to be cached data pointers for various OS subsystems (graph, stat, edit buffers, etc.).

## Relationship between the three routines

- **0x082739** is the heaviest — it walks the entire VAT backward from `0xD3FFFF` to `OPBase`, adjusting every VAT entry's data pointer that falls within the moved range.
- **0x0824D6** is a lightweight triple-pointer adjuster for three consecutive OS state pointers.
- **0x0824FD** is a bulk adjuster for 27 individual cached pointers scattered across RAM.
- All three share the same input contract: `DE` = old insertion point, `BC` = insert size.
- Together they ensure every pointer in the system that references memory above the insertion point is decremented by the insert size after InsertMem shifts memory upward.

## 27 pointers adjusted by tail helper B (0x0824FD)

| # | Address | Known symbol |
| --- | --- | --- |
| 1 | 0xD0066F | |
| 2 | 0xD00672 | |
| 3 | 0xD00675 | |
| 4 | 0xD00678 | |
| 5 | 0xD0067B | |
| 6 | 0xD0067E | |
| 7 | 0xD00681 | |
| 8 | 0xD00684 | |
| 9 | 0xD0069F | |
| 10 | 0xD006A2 | |
| 11 | 0xD0256A | |
| 12 | 0xD025A0 | newDataPtr |
| 13 | 0xD0256D | |
| 14 | 0xD022CE | |
| 15 | 0xD022BA | |
| 16 | 0xD0068D | |
| 17 | 0xD022BF | |
| 18 | 0xD022CB | |
| 19 | 0xD02695 | |
| 20 | 0xD02451 | |
| 21 | 0xD00687 | |
| 22 | 0xD01FED | |
| 23 | 0xD01FF3 | |
| 24 | 0xD00693 | |
| 25 | 0xD00696 | |
| 26 | 0xD01FF9 | |
| 27 | 0xD0068A | (fall-through, last entry) |

## Annotated disassembly

### 0x082739 — VAT walker (post-move helper)

```text
0x082739: 21 ff ff d3        ld hl, 0xd3ffff          ; symTable end
0x08273d: ed 43 77 25 d0     ld (0xd02577), bc        ; save BC to slot_D02577
0x082742: 2b                 dec hl                   ; HL = 0xD3FFFC
0x082743: 2b                 dec hl
0x082744: 2b                 dec hl
; --- loop start ---
0x082745: f5                 push af
0x082746: 4e                 ld c, (hl)               ; read 3-byte data pointer from VAT entry
0x082747: 2b                 dec hl
0x082748: 46                 ld b, (hl)
0x082749: 2b                 dec hl
0x08274a: 7e                 ld a, (hl)
0x08274b: 23                 inc hl
0x08274c: cd 76 c8 04        call 0x04c876            ; compose 24-bit pointer from A:BC
0x082750: cd b2 21 08        call 0x0821b2            ; check entry type / skip test
0x082754: 20 1e              jr nz, 0x082774          ; skip adjustment if not matching
0x082756: eb                 ex de, hl
0x082757: b7                 or a
0x082758: ed 42              sbc hl, bc               ; data_ptr - insert_size
0x08275a: 30 16              jr nc, 0x082772
0x08275c: 09                 add hl, bc               ; restore
0x08275d: e5                 push hl
0x08275e: c5                 push bc
0x08275f: e1                 pop hl
0x082760: ed 4b 77 25 d0     ld bc, (0xd02577)        ; restore original BC from slot
0x082765: b7                 or a
0x082766: ed 42              sbc hl, bc               ; adjust
0x082768: eb                 ex de, hl
0x082769: 2b                 dec hl
0x08276a: cd 0b 2c 08        call 0x082c0b            ; write adjusted pointer back to VAT
0x08276e: 23                 inc hl
0x08276f: d1                 pop de
0x082770: 18 02              jr 0x082774
0x082772: 09                 add hl, bc
0x082773: eb                 ex de, hl
; --- advance past entry ---
0x082774: 23                 inc hl
0x082775: 23                 inc hl
0x082776: 23                 inc hl
0x082777: 23                 inc hl
0x082778: cd 9e 27 08        call 0x08279e            ; get entry name length
0x08277c: 01 00 00 00        ld bc, 0x000000
0x082780: 0e 0c              ld c, 0x0c               ; default skip = 12
0x082782: 20 09              jr nz, 0x08278d
0x082784: cd e2 2b 08        call 0x082be2            ; get actual name data pointer
0x082788: 4e                 ld c, (hl)               ; read name length byte
0x082789: 0c                 inc c                    ; + 4 for overhead
0x08278a: 0c                 inc c
0x08278b: 0c                 inc c
0x08278c: 0c                 inc c
; --- loop bound check ---
0x08278d: f1                 pop af
0x08278e: b7                 or a
0x08278f: ed 42              sbc hl, bc               ; advance HL past entry
0x082791: ed 4b 90 25 d0     ld bc, (0xd02590)        ; OPBase (loop terminator)
0x082796: ed 42              sbc hl, bc               ; if HL < OPBase, done
0x082798: d8                 ret c                    ; EXIT: walked past OPBase
0x082799: 09                 add hl, bc               ; restore HL
0x08279a: c3 45 27 08        jp 0x082745              ; loop back
```

### 0x08279E — VAT entry name-length helper (inlined sub of 0x082739)

```text
0x08279e: 7e                 ld a, (hl)               ; read VAT type byte
0x08279f: e6 3f              and 0x3f                 ; mask to type field
0x0827a1: cd 84 00 08        call 0x080084            ; type lookup
0x0827a5: c8                 ret z
0x0827a6: cd 2d 01 08        call 0x08012d            ; further type check
0x0827aa: c0                 ret nz
0x0827ab: e5                 push hl
0x0827ac: cd e2 2b 08        call 0x082be2            ; get name data
0x0827b0: 7e                 ld a, (hl)
0x0827b1: fe 24              cp 0x24                  ; '$' prefix?
0x0827b3: 28 0a              jr z, 0x0827bf
0x0827b5: fe 72              cp 0x72                  ; 'r' prefix?
0x0827b7: 28 06              jr z, 0x0827bf
```

### 0x0824D6 — Triple pointer adjuster (tail helper A)

```text
0x0824d6: 2a 17 23 d0        ld hl, (0xd02317)        ; first pointer
0x0824da: b7                 or a
0x0824db: ed 52              sbc hl, de               ; compare with insertion point
0x0824dd: d8                 ret c                    ; below -> no adjust
0x0824de: c8                 ret z                    ; equal -> no adjust
0x0824df: 19                 add hl, de               ; restore
0x0824e0: ed 42              sbc hl, bc               ; subtract insert size
0x0824e2: 22 17 23 d0        ld (0xd02317), hl        ; write back
0x0824e6: 2a 1a 23 d0        ld hl, (0xd0231a)        ; second pointer
0x0824ea: b7                 or a
0x0824eb: ed 42              sbc hl, bc               ; subtract insert size
0x0824ed: 22 1a 23 d0        ld (0xd0231a), hl
0x0824f1: 2a 1d 23 d0        ld hl, (0xd0231d)        ; third pointer
0x0824f5: b7                 or a
0x0824f6: ed 42              sbc hl, bc               ; subtract insert size
0x0824f8: 22 1d 23 d0        ld (0xd0231d), hl
0x0824fc: c9                 ret
```

### 0x0824FD — Bulk pointer adjuster (tail helper B)

27 entries, each `ld hl, <addr>; call 0x0825D1` except the last which falls through:

```text
0x0824fd: 21 6f 06 d0        ld hl, 0xd0066f          ; ptr #1
0x082501: cd d1 25 08        call 0x0825d1
0x082505: 21 72 06 d0        ld hl, 0xd00672          ; ptr #2
0x082509: cd d1 25 08        call 0x0825d1
0x08250d: 21 75 06 d0        ld hl, 0xd00675          ; ptr #3
0x082511: cd d1 25 08        call 0x0825d1
0x082515: 21 78 06 d0        ld hl, 0xd00678          ; ptr #4
0x082519: cd d1 25 08        call 0x0825d1
0x08251d: 21 7b 06 d0        ld hl, 0xd0067b          ; ptr #5
0x082521: cd d1 25 08        call 0x0825d1
0x082525: 21 7e 06 d0        ld hl, 0xd0067e          ; ptr #6
0x082529: cd d1 25 08        call 0x0825d1
0x08252d: 21 81 06 d0        ld hl, 0xd00681          ; ptr #7
0x082531: cd d1 25 08        call 0x0825d1
0x082535: 21 84 06 d0        ld hl, 0xd00684          ; ptr #8
0x082539: cd d1 25 08        call 0x0825d1
0x08253d: 21 9f 06 d0        ld hl, 0xd0069f          ; ptr #9
0x082541: cd d1 25 08        call 0x0825d1
0x082545: 21 a2 06 d0        ld hl, 0xd006a2          ; ptr #10
0x082549: cd d1 25 08        call 0x0825d1
0x08254d: 21 6a 25 d0        ld hl, 0xd0256a          ; ptr #11
0x082551: cd d1 25 08        call 0x0825d1
0x082555: 21 a0 25 d0        ld hl, 0xd025a0          ; ptr #12 -- newDataPtr
0x082559: cd d1 25 08        call 0x0825d1
0x08255d: 21 6d 25 d0        ld hl, 0xd0256d          ; ptr #13
0x082561: cd d1 25 08        call 0x0825d1
0x082565: 21 ce 22 d0        ld hl, 0xd022ce          ; ptr #14
0x082569: cd d1 25 08        call 0x0825d1
0x08256d: 21 ba 22 d0        ld hl, 0xd022ba          ; ptr #15
0x082571: cd d1 25 08        call 0x0825d1
0x082575: 21 8d 06 d0        ld hl, 0xd0068d          ; ptr #16
0x082579: cd d1 25 08        call 0x0825d1
0x08257d: 21 bf 22 d0        ld hl, 0xd022bf          ; ptr #17
0x082581: cd d1 25 08        call 0x0825d1
0x082585: 21 cb 22 d0        ld hl, 0xd022cb          ; ptr #18
0x082589: cd d1 25 08        call 0x0825d1
0x08258d: 21 95 26 d0        ld hl, 0xd02695          ; ptr #19
0x082591: cd d1 25 08        call 0x0825d1
0x082595: 21 51 24 d0        ld hl, 0xd02451          ; ptr #20
0x082599: cd d1 25 08        call 0x0825d1
0x08259d: 21 87 06 d0        ld hl, 0xd00687          ; ptr #21
0x0825a1: cd d1 25 08        call 0x0825d1
0x0825a5: 21 ed 1f d0        ld hl, 0xd01fed          ; ptr #22
0x0825a9: cd d1 25 08        call 0x0825d1
0x0825ad: 21 f3 1f d0        ld hl, 0xd01ff3          ; ptr #23
0x0825b1: cd d1 25 08        call 0x0825d1
0x0825b5: 21 93 06 d0        ld hl, 0xd00693          ; ptr #24
0x0825b9: cd d1 25 08        call 0x0825d1
0x0825bd: 21 96 06 d0        ld hl, 0xd00696          ; ptr #25
0x0825c1: cd d1 25 08        call 0x0825d1
0x0825c5: 21 f9 1f d0        ld hl, 0xd01ff9          ; ptr #26
0x0825c9: cd d1 25 08        call 0x0825d1
0x0825cd: 21 8a 06 d0        ld hl, 0xd0068a          ; ptr #27 (falls through into 0x0825D1)
```

### 0x0825D1 — Pointer adjust primitive

```text
0x0825d1: b7                 or a                     ; clear carry
0x0825d2: e5                 push hl                  ; save pointer-to-pointer
0x0825d3: ed 27              ld hl, (hl)              ; read 3-byte value [eZ80 indirect load]
0x0825d5: ed 52              sbc hl, de               ; compare against insertion point
0x0825d7: 28 02              jr z, 0x0825db           ; equal -> no adjust
0x0825d9: 30 02              jr nc, 0x0825dd          ; above -> needs adjust
0x0825db: e1                 pop hl                   ; below or equal -> return unchanged
0x0825dc: c9                 ret
; --- adjustment path ---
0x0825dd: e1                 pop hl                   ; restore pointer-to-pointer
0x0825de: c5                 push bc                  ; save BC (insert size)
0x0825df: e5                 push hl                  ; save pointer-to-pointer
0x0825e0: ed 27              ld hl, (hl)              ; re-read the 3-byte value
0x0825e2: ed 42              sbc hl, bc               ; subtract insert size
0x0825e4: e5                 push hl
0x0825e5: c1                 pop bc                   ; BC = adjusted value
0x0825e6: e1                 pop hl                   ; HL = pointer-to-pointer
0x0825e7: ed 0f              ld (hl), bc              ; write adjusted value back [eZ80 indirect store]
0x0825e9: c1                 pop bc                   ; restore original BC
0x0825ea: c9                 ret
```
