# Phase 154 - FPDiv JT Slot Investigation

## Summary

- ROM bytes at `0x020284` are `C3 F2 F7 07`, so that jump-table slot resolves to `0x07F7F2`.
- ROM bytes at the real FPDiv slot, `0x0201F4`, are `C3 B9 CA 07`, so real FPDiv resolves to `0x07CAB9`.
- The `0x07F7F2 -> 0x07FAC2` chain is not division. It zeroes OP1/OP2, then normalizes the first byte of each operand through `0x07FE28 -> 0x07FE2F`.
- The `0x0C` in `OP1[0]` is not a division category/result. It is produced by the normalizer at `0x07FE2F`, which maps a cleared first byte (`0x00`) to `0x0C`.

## ROM Resolution

Direct ROM reads:

| Address | Raw bytes | Meaning |
| --- | --- | --- |
| `0x020284` | `C3 F2 F7 07` | `JP 0x07F7F2` |
| `0x0201F4` | `C3 B9 CA 07` | `JP 0x07CAB9` |

So the suspect slot from session 153 points at `0x07F7F2`, while the actual FPDiv BCALL lives at `0x0201F4 -> 0x07CAB9`.

## Disassembly

### 1. Suspect entry at `0x07F7F2`

```text
0x07F7F2  CD C2 FA 07  call 0x07FAC2   ; zero OP1
0x07F7F6  CD AF FA 07  call 0x07FAAF   ; zero OP2
0x07F7FA  21 F8 05 D0  ld hl, 0xD005F8 ; HL = OP1
0x07F7FE  CD 06 F8 07  call 0x07F806   ; normalize OP1[0]
0x07F802  21 03 06 D0  ld hl, 0xD00603 ; HL = OP2
0x07F806  C5           push bc
0x07F807  D5           push de
0x07F808  CD 5E FE 07  call 0x07FE5E
0x07F80C  CD 28 FE 07  call 0x07FE28
0x07F810  D1           pop de
0x07F811  C1           pop bc
0x07F812  C9           ret
```

This is already enough to rule out division: the routine zeroes both operands before any normalization work.

### 2. `0x07FAC2` and shared zero-fill body

```text
0x07FAC2  21 F8 05 D0  ld hl, 0xD005F8
0x07FAC6  AF           xor a
0x07FAC7  18 B1        jr 0x07FA7A

0x07FA7A  36 00        ld (hl), 0x00
0x07FA7C  23           inc hl
0x07FA7D  36 80        ld (hl), 0x80
0x07FA7F  23           inc hl
0x07FA80  77           ld (hl), a
0x07FA81  AF           xor a
0x07FA82  18 02        jr 0x07FA86
0x07FA86  23           inc hl
0x07FA87  77           ld (hl), a
0x07FA88  23           inc hl
0x07FA89  77           ld (hl), a
0x07FA8A  23           inc hl
0x07FA8B  77           ld (hl), a
0x07FA8C  23           inc hl
0x07FA8D  77           ld (hl), a
0x07FA8E  23           inc hl
0x07FA8F  77           ld (hl), a
0x07FA90  23           inc hl
0x07FA91  77           ld (hl), a
0x07FA92  23           inc hl
0x07FA93  77           ld (hl), a
0x07FA94  C9           ret
```

`0x07FAC2` itself does not write `0x0C`. It writes a zero value shaped like:

```text
OP1[0..8] = 00 80 00 00 00 00 00 00 00
```

### 3. OP2 zero path at `0x07FAAF`

```text
0x07FAAF  AF           xor a
0x07FAB0  C3 2F FA 07  jp 0x07FA2F

0x07FA2F  21 03 06 D0  ld hl, 0xD00603
0x07FA33  18 45        jr 0x07FA7A
```

This reuses the same zero-fill body for OP2, so OP2 also becomes:

```text
OP2[0..8] = 00 80 00 00 00 00 00 00 00
```

### 4. Byte-normalizer at `0x07F806`

```text
0x07F806  C5           push bc
0x07F807  D5           push de
0x07F808  CD 5E FE 07  call 0x07FE5E
0x07F80C  CD 28 FE 07  call 0x07FE28
0x07F810  D1           pop de
0x07F811  C1           pop bc
0x07F812  C9           ret
```

This is the important part. The `0x0C` is created here, not in `0x07FAC2`.

### 5. `0x07FE5E -> 0x07FE65`

```text
0x07FE5E  7E           ld a, (hl)
0x07FE5F  CD 65 FE 07  call 0x07FE65
0x07FE63  77           ld (hl), a
0x07FE64  C9           ret

0x07FE65  D5           push de
0x07FE66  C5           push bc
0x07FE67  E5           push hl
0x07FE68  57           ld d, a
0x07FE69  E6 3F        and 0x3F
0x07FE6B  21 91 FE 07  ld hl, 0x07FE91
0x07FE6F  01 05 00 00  ld bc, 0x000005
0x07FE73  ED B1        cpir
0x07FE75  20 0E        jr nz, 0x07FE85
...
0x07FE84  C9           ret
0x07FE85  7A           ld a, d
0x07FE86  E1           pop hl
0x07FE87  C1           pop bc
0x07FE88  D1           pop de
0x07FE89  C9           ret
```

This helper searches the table at `0x07FE91`:

```text
0x07FE91..0x07FE95 = 0C 1B 1D 1E 1F
```

If the low 6 bits are not in that table, it returns the original byte. Because the cleared operand byte is `0x00`, this stage leaves it as `0x00`.

### 6. `0x07FE28 -> 0x07FE2F` is where `0x0C` appears

```text
0x07FE28  7E           ld a, (hl)
0x07FE29  CD 2F FE 07  call 0x07FE2F
0x07FE2D  77           ld (hl), a
0x07FE2E  C9           ret

0x07FE2F  C5           push bc
0x07FE30  E5           push hl
0x07FE31  E6 3F        and 0x3F
0x07FE33  21 8A FE 07  ld hl, 0x07FE8A
0x07FE37  01 06 00 00  ld bc, 0x000006
0x07FE3B  ED B1        cpir
0x07FE3D  28 04        jr z, 0x07FE43
0x07FE3F  06 0C        ld b, 0x0C
0x07FE41  18 06        jr 0x07FE49
0x07FE43  21 90 FE 07  ld hl, 0x07FE90
0x07FE47  09           add hl, bc
0x07FE48  46           ld b, (hl)
0x07FE49  E1           pop hl
0x07FE4A  7E           ld a, (hl)
0x07FE4B  E6 C0        and 0xC0
0x07FE4D  B0           or b
0x07FE4E  C1           pop bc
0x07FE4F  C9           ret
```

Lookup tables:

```text
search table @ 0x07FE8A = 21 20 1C 18 00 19
map    table @ 0x07FE90 = 1B 0C 1B 1D 1E 1F
```

For the cleared byte `0x00`:

1. `AND 0x3F` keeps it at `0x00`.
2. `CPIR` finds `0x00` in the search table.
3. The remaining `BC` value indexes `0x07FE91`, whose byte is `0x0C`.
4. `0x07FE2D` stores that `0x0C` back to `(HL)`.

That is the exact source of the visible `OP1[0] = 0x0C`.

## Known Call Target Cross-Check

| Address | Prompt label | Reached from `0x07F7F2 -> 0x07FAC2` chain? | Lifted block? | Notes |
| --- | --- | --- | --- | --- |
| `0x07FA74` | Const 1.0 loader | No | Yes | Used elsewhere, not by this chain |
| `0x07F831` | Type validator | No | Yes | Used by real arithmetic/type-check paths |
| `0x082957` | FpPush / FP stack helper | No | Yes | Not touched here |
| `0x0828FC` | Real FP Pop / stack helper | No | Yes | Not touched here |
| `0x07CC36` | FP subtraction core | No | Yes | Real FPDiv at `0x07CAB9` does call this |

The only missing lifted block relevant to the suspect path is the jump-table stub itself:

| PC | Lifted block? |
| --- | --- |
| `0x020284:adl` | No |
| `0x07F7F2:adl` | Yes |
| `0x07FAC2:adl` | Yes |
| `0x07FAAF:adl` | Yes |
| `0x07F806:adl` | Yes |
| `0x07FE5E:adl` | Yes |
| `0x07FE28:adl` | Yes |
| `0x07CAB9:adl` | Yes |

## Real FPDiv Cross-Check

The real FPDiv entry is not the suspect chain:

```text
0x07CAB9  FD CB 0E B6  res 6, (iy+14)
0x07CABD  CD 36 CC 07  call 0x07CC36
0x07CAC1  CD 50 FD 07  call 0x07FD50
0x07CAC5  CA 06 1D 06  jp z, 0x061D06
0x07CAC9  CD 4A FD 07  call 0x07FD4A
0x07CACD  C8           ret z
0x07CACE  CD 73 CA 07  call 0x07CA73
...
```

So `0x020284 -> 0x07F7F2` is a misidentified slot, not a broken divider.

## Probe Output

Captured trace from the same logic now written to `probe-phase154-fpdiv-chain.mjs`:

```text
Suspect JT slot: 0x020284 raw=[C3 F2 F7 07] target=0x07F7F2
Actual FPDiv slot: 0x0201F4 raw=[C3 B9 CA 07] target=0x07CAB9
JT block present: no
Tracing resolved target 0x07F7F2 because the JT stub is not lifted as a standalone block.
Initial OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 80 00 00 00 00 00 00]
Outcome=return steps=33 errNo=00
[01] PC=0x07F7F2 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 80 00 00 00 00 00 00]
[02] PC=0x07FAC2 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 80 00 00 00 00 00 00]
[03] PC=0x07FA7A OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 80 00 00 00 00 00 00]
[04] PC=0x07FA86 OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 80 00 00 00 00 00 00]
[05] PC=0x07F7F6 OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 80 00 00 00 00 00 00]
[06] PC=0x07FAAF OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 80 00 00 00 00 00 00]
[07] PC=0x07FA2F OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 80 00 00 00 00 00 00]
[08] PC=0x07FA7A OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 80 00 00 00 00 00 00]
[09] PC=0x07FA86 OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[10] PC=0x07F7FA OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[11] PC=0x07F806 OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[12] PC=0x07FE5E OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[13] PC=0x07FE65 OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[14] PC=0x07FE85 OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[15] PC=0x07FE63 OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[16] PC=0x07F80C OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[17] PC=0x07FE28 OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[18] PC=0x07FE2F OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[19] PC=0x07FE43 OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[20] PC=0x07FE2D OP1=[00 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[21] PC=0x07F810 OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]  OP1[0] 00->0C
[22] PC=0x07F802 OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[23] PC=0x07FE5E OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[24] PC=0x07FE65 OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[25] PC=0x07FE85 OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[26] PC=0x07FE63 OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[27] PC=0x07F80C OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[28] PC=0x07FE28 OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[29] PC=0x07FE2F OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[30] PC=0x07FE43 OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[31] PC=0x07FE2D OP1=[0C 80 00 00 00 00 00 00 00] OP2=[00 80 00 00 00 00 00 00 00]
[32] PC=0x07F810 OP1=[0C 80 00 00 00 00 00 00 00] OP2=[0C 80 00 00 00 00 00 00 00]  OP2[0] 00->0C
[33] PC=0x7FFFFE OP1=[0C 80 00 00 00 00 00 00 00] OP2=[0C 80 00 00 00 00 00 00 00]  RET sentinel
Final OP1=[0C 80 00 00 00 00 00 00 00] OP2=[0C 80 00 00 00 00 00 00 00] FPS=0xD1AA00
```

## Conclusion

`0x07FAC2` is a zero-fill helper, not the front of the real division core. The observed `0x0C` comes later, from the type-byte normalizer at `0x07FE28 -> 0x07FE2F`, after OP1 and OP2 have already been cleared to zero. The real FPDiv slot remains `0x0201F4 -> 0x07CAB9`.
