# Phase 25Y: ParseInp Entry Disassembly Report

## Session 73 prefix confirmation

First 32 bytes at 0x099914: `AF 32 BE 22 D0 CD 81 9B 09 FD CB 1F 9E CD 81 9B 09 CD 18 9B 09 C1 CD ED BE 09 01 8A 9A 09 CD ED`

Confirmed match: `xor a; ld (0xD022BE), a; ...` -- ParseInp clears flag at D022BE before parsing.

## Full disassembly: ParseInp entry (0x099914..0x099963)

```
0x099914: AF                   xor a
0x099915: 32 BE 22 D0          ld (0xD022BE), a          ; clear entry flag
0x099919: CD 81 9B 09          call 0x099B81             ; clear parser state bits
0x09991D: FD CB 1F 9E          res 3, (iy+31)            ; clear IY+0x1F bit 3
0x099921: CD 81 9B 09          call 0x099B81             ; clear parser state bits again
0x099925: CD 18 9B 09          call 0x099B18             ; find symbol + set begPC/curPC
0x099929: C1                   pop bc                    ; recover return addr from 0x099B18
0x09992A: CD ED BE 09          call 0x09BEED             ; push BC to OPS stack (allocator)
0x09992E: 01 8A 9A 09          ld bc, 0x099A8A           ; callback address
0x099932: CD ED BE 09          call 0x09BEED             ; push callback to OPS stack
0x099936: 3E 00                ld a, 0x00
0x099938: FD CB 36 4E          bit 1, (iy+54)            ; test IY+0x36 bit 1
0x09993C: C4 6A 3A 02          call nz, 0x023A6A         ; conditional call if bit set
0x099940: C2 73 AE 09          jp nz, 0x09AE73           ; conditional jump if NZ
0x099944: FD CB 1A 9E          res 3, (iy+26)            ; clear IY+0x1A bit 3
0x099948: CD E7 98 09          call 0x0998E7             ; clear IY+7 bit 0, then return
0x09994C: 3E 00                ld a, 0x00
0x09994E: CD 37 BF 09          call 0x09BF37             ; push A to OPS stack (1 byte)
0x099952: 21 01 00 00          ld hl, 0x000001
```

## Subroutine 0x099B81 (entry-state clear)

Clears numerous IY-relative flag bits. No memory pointer references.

```
0x099B81: FD 36 06 00          ld (iy+6), 0x00
0x099B85: FD 36 07 00          ld (iy+7), 0x00
0x099B89: FD CB 3E B6          res 6, (iy+62)
0x099B8D: FD CB 20 86          res 0, (iy+32)
0x099B91: FD CB 58 BE          res 7, (iy+88)
0x099B95: FD CB 20 B6          res 6, (iy+32)
0x099B99: FD CB 1A 9E          res 3, (iy+26)
0x099B9D: FD CB 1F 86          res 0, (iy+31)
0x099BA1: FD 7E 0A             ld a, (iy+10)
0x099BA4: FD 77 0B             ld (iy+11), a
0x099BA7: FD CB 49 86          res 0, (iy+73)
0x099BAB: FD CB 48 BE          res 7, (iy+72)
0x099BAF: C9                   ret
```

## Subroutine 0x099B18 (ChkFindSym caller -- begPC/curPC setup)

This is the KEY subroutine for pointer initialization:

```
0x099B18: CD 3D 38 08          call 0x08383D             ; ChkFindSym
0x099B1C: DA 3A 1D 06          jp c, 0x061D3A            ; error if not found
0x099B20: 2B                   dec hl
0x099B21: CB 4E                bit 1, (hl)               ; check flag in symbol entry
0x099B23: 23                   inc hl
0x099B24: C2 F6 1C 06          jp nz, 0x061CF6           ; error if flag set
0x099B28: CD AE 21 08          call 0x0821AE             ; archive check?
0x099B2C: 28 0D                jr z, 0x099B3B            ; skip size adjustment if Z
0x099B2E: 21 09 00 00          ld hl, 0x000009           ; offset 9 into data
0x099B32: 19                   add hl, de
0x099B33: 11 00 00 00          ld de, 0x000000
0x099B37: 5E                   ld e, (hl)                ; read size byte
0x099B38: 19                   add hl, de                ; skip past header
0x099B39: 23                   inc hl
0x099B3A: EB                   ex de, hl
0x099B3B: ED 53 87 06 D0       ld (0xD00687), de         ; store data pointer
0x099B40: CD F9 9A 09          call 0x099AF9             ; compute end pointer
0x099B44: 2A 87 06 D0          ld hl, (0xD00687)         ; reload data pointer
0x099B48: CD 56 9B 09          call 0x099B56             ; adjust HL past header
0x099B4C: 22 17 23 D0          ld (0xD02317), hl         ; *** WRITE begPC ***
0x099B50: 22 1A 23 D0          ld (0xD0231A), hl         ; *** WRITE curPC ***
0x099B54: 18 96                jr 0x099AEC               ; jump to set endPC
```

**Critical finding**: At 0x099B4C-0x099B53, the subroutine initializes both begPC and curPC to the same value (HL = start of token data). Then it jumps to 0x099AEC which likely sets endPC.

## Subroutine 0x09BEED (OPS allocator/writer)

```
0x09BEED: C5                   push bc                   ; save BC (value to push)
0x09BEEE: 21 03 00 00          ld hl, 0x000003           ; allocate 3 bytes
0x09BEF2: CD B5 2B 08          call 0x082BB5             ; InsertMem
0x09BEF6: C1                   pop bc                    ; restore BC
0x09BEF7: 2A 93 25 D0          ld hl, (0xD02593)         ; *** READ OPS ***
0x09BEFB: CD 64 C8 04          call 0x04C864             ; adjust OPS pointer
0x09BEFF: 77                   ld (hl), a                ; store high byte
0x09BF00: 2B                   dec hl
0x09BF01: 70                   ld (hl), b                ; store mid byte
0x09BF02: 2B                   dec hl
0x09BF03: 71                   ld (hl), c                ; store low byte
0x09BF04: 18 40                jr 0x09BF46               ; jump to update OPS
```

OPS is a downward-growing stack: allocate 3 bytes, load OPS, adjust, write A:B:C (24-bit value), update OPS.

## Subroutine 0x09BAB8 (token reader via curPC)

Also discovered in the call chain (called later from ParseInp body):

```
0x09BAB8: ED 4B 1A 23 D0       ld bc, (0xD0231A)        ; *** READ curPC ***
0x09BABD: 2A 1D 23 D0          ld hl, (0xD0231D)        ; *** READ endPC ***
0x09BAC1: AF                   xor a
0x09BAC2: ED 42                sbc hl, bc                ; endPC - curPC
0x09BAC4: D8                   ret c                     ; return if past end
0x09BAC5: C5                   push bc
0x09BAC6: E1                   pop hl                    ; HL = curPC
0x09BAC7: 7E                   ld a, (hl)                ; *** READ TOKEN BYTE ***
0x09BAC8: C9                   ret
```

This is the actual token-fetch function: loads curPC into BC, compares against endPC, then reads `(curPC)` into A.

## Byte-pattern scan: curPC/begPC/endPC/OPS in ParseInp vicinity (0x099914..0x099C14)

| Address | Pointer | Offset from entry |
|---------|---------|-------------------|
| 0x099AE2 | begPC | +0x01CE |
| 0x099AE8 | curPC | +0x01D4 |
| 0x099AEE | endPC | +0x01DA |
| 0x099AFF | curPC | +0x01EB |
| 0x099B04 | begPC | +0x01F0 |
| 0x099B4D | begPC | +0x0239 (in sub 0x099B18) |
| 0x099B51 | curPC | +0x023D (in sub 0x099B18) |
| 0x099BCB | curPC | +0x02B7 |
| 0x099BD0 | curPC | +0x02BC |

## Key findings

1. **curPC is NOT accessed in the first 64 bytes of ParseInp.** The entry sequence only clears flags and calls setup subroutines.

2. **curPC is INITIALIZED (written) by subroutine 0x099B18** at address 0x099B50. Both begPC and curPC are set to HL (= start of token data found by ChkFindSym).

3. **Token reading via curPC happens deeper** in the parse loop, specifically through subroutine 0x09BAB8 which loads curPC into BC, compares against endPC, and reads the byte at (curPC).

4. **OPS is used as a write-destination stack** by 0x09BEED, not for token reading. OPS grows downward; 0x09BEED pushes 3-byte (24-bit) values onto it.

5. **Entry flags cleared**: D022BE (zeroed), plus ~12 IY-relative flag bits via 0x099B81 (called twice).

6. **The flow**: ParseInp entry -> clear flags -> ChkFindSym finds the program -> compute data boundaries -> set begPC=curPC=start of tokens, endPC=end of tokens -> push return addresses to OPS stack -> begin parse loop (which reads tokens via curPC at 0x09BAB8).

## Golden regression

All assertions PASS (status dots left, status dots right, Normal, Float, Radian).
