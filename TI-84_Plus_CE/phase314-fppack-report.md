# Phase 314 — _fppack Full Decode (IEEE-754 Single-Precision Pack)

**Date**: 2026-05-13  
**Addresses**: _fppack 0x0034EE..0x003564, _fpunpack 0x0034A7..0x0034CB, _fpunpack2 0x0034CC..0x0034ED, _ultof 0x00380D..0x003817  
**Probe**: `probe-phase314-fppack.mjs`  
**FLTMAX**: 0x7F7FFFFF at 0x003565 = 3.4028235e+38 (FLT_MAX)

---

## 1. Register Convention (Unpacked Float)

The soft-float library passes IEEE-754 singles in unpacked form across registers:

| Register | Content |
|----------|---------|
| **D** (bit 0) | Sign: 0 = positive, 1 = negative |
| **E** | Biased exponent (0..255, bias=127) |
| **A:HL** | 24-bit mantissa (A = MSB bits [23:16], HL = bits [15:0]) — with implicit leading 1 present in bit 23 of the 24-bit value |
| **BC** | Used as the packed 24-bit mantissa word (lower 23 bits) on output |

The **packed IEEE-754 format** (little-endian in ROM, logically 32 bits):
```
[31]    sign
[30:23] exponent (biased, 8 bits)  
[22:0]  mantissa (23 bits, implicit leading 1 stripped)
```

Packed word held in **E:BC** on return from _fppack:
- E = exponent byte with sign in bit 7
- BC = 24-bit mantissa field (bit 23 = implicit 1, stripped by packing)

---

## 2. _fpunpack (0x0034A7..0x0034CB) — Full Disassembly

Unpacks a packed IEEE-754 single into components. Input in E:A:HL (or equivalent packed form on stack). Output in D/E/A:HL.

```asm
; _fpunpack — unpack IEEE-754 single → sign(D), exponent(E→A), mantissa(HL, bit 23 restored)
; Entry: packed float on stack frame (pushed by caller)
;        Specifically: A = packed exponent byte, BC = packed mantissa+sign

0x0034A7  PUSH IX               ; save frame pointer
0x0034A9  LD IX, 0x000000       ; IX = 0
0x0034AE  ADD IX, SP            ; IX = SP (frame pointer)
0x0034B0  PUSH BC               ; save BC (packed mantissa word)
0x0034B1  RLC (IX-1)            ; rotate top byte of pushed BC left through carry
                                 ; this puts the old bit 7 (= bit 23 of mantissa, which
                                 ; is actually the LSB of exponent in packed format) into carry
0x0034B5  SCF                   ; set carry = 1 (restore implicit leading 1)
0x0034B6  RR (IX-1)             ; rotate right: carry(1) → bit 7, old bit 7 → carry
                                 ; result: bit 7 of (IX-1) = 1 (implicit bit), bit 6..0 restored
                                 ; carry = old bit 7 of the byte (= exponent LSB)
0x0034BA  POP BC                ; restore BC (now with implicit 1 inserted in top byte)
0x0034BB  RL A                  ; rotate A left through carry: shifts exponent left by 1,
                                 ; pulling in the exponent LSB from carry
                                 ; A now holds the full 8-bit biased exponent
0x0034BD  LD D, 0x00            ; D = 0 (default: positive)
0x0034BF  JR NZ, 0x0034C6       ; if exponent != 0, skip zero check
; exponent == 0: denormal or zero
0x0034C1  LD BC, 0x000000       ; zero mantissa
0x0034C5  OR A, A               ; clear carry, set Z (result = zero)
; fall through to sign extraction
0x0034C6  RL D                  ; D bit 0 ← carry (sign bit from the RL A above)
                                 ; actually: carry was set/cleared by the OR A or RL A
0x0034C8  OR A, A               ; final flags: Z if exponent==0
0x0034C9  POP IX                ; restore frame pointer
0x0034CB  RET
```

**Algorithm**: Extracts sign from the packed exponent byte's MSB, restores the implicit leading 1 into bit 23 of the mantissa, and isolates the 8-bit biased exponent.

---

## 3. _fpunpack2 (0x0034CC..0x0034ED) — Variant Unpack

A second unpack variant, possibly for double-precision or alternate calling convention. Has the same frame setup pattern.

```asm
0x0034CC  PUSH IX
0x0034CE  LD IX, 0x000000
0x0034D3  ADD IX, SP            ; IX = frame pointer
0x0034D5  PUSH HL               ; save HL
0x0034D6  ADD HL, HL            ; HL <<= 1 (shift sign bit into carry)
0x0034D7  SET 7, (IX-1)         ; force bit 7 of pushed byte = 1 (implicit leading 1)
0x0034DB  POP HL                ; restore HL (now with implicit bit set in H)
0x0034DC  RL E                  ; E <<= 1, carry (sign) into bit 0, old bit 7 of E into carry
0x0034DE  LD D, 0x00            ; D = 0 (positive default)
0x0034E0  PUSH AF               ; save A/flags
0x0034E1  JR NZ, 0x0034E8       ; if E (exponent) != 0, skip
; exponent == 0: zero/denormal
0x0034E3  LD HL, 0x000000       ; zero mantissa
0x0034E7  OR A, A               ; clear carry
; common path
0x0034E8  RL D                  ; D bit 0 ← carry (sign)
0x0034EA  POP AF                ; restore A
0x0034EB  POP IX                ; restore frame
0x0034ED  RET
```

**Note**: This variant unpacks from **E:HL** format (E=exponent+sign byte, HL=mantissa) rather than from A:BC. The mantissa's implicit bit goes into H bit 7.

---

## 4. _fppack (0x0034EE..0x003564) — Full Disassembly

Packs unpacked sign/exponent/mantissa back into IEEE-754 single. This is the inverse of _fpunpack.

### Input registers:
- **D** bit 0: sign (0=positive, 1=negative)
- **E**: biased exponent (0..255)
- **A:HL**: 24-bit mantissa (A = overflow/extra bits, HL = main 24-bit value; implicit bit 23 present)

### Output registers:
- **E**: packed exponent byte (sign in bit 7, exponent in bits 6..0 shifted)
- **BC**: packed 23-bit mantissa (implicit bit stripped)
- **A**: exponent value

```asm
; _fppack — pack sign/exponent/mantissa → packed IEEE-754 single
; Input:  D.0 = sign, E = biased exponent, A:HL = mantissa (24+ bits)
; Output: A = exponent, E = packed sign|exponent, BC = packed mantissa

0x0034EE  PUSH HL               ; save original HL (caller's frame)
0x0034EF  PUSH DE               ; save original DE (caller's frame)
0x0034F0  RR D                  ; D.0 (sign) → carry
0x0034F2  PUSH AF               ; save A and carry (sign in carry)
0x0034F3  LD D, 0x00            ; D = 0 (will be used as zero)
0x0034F5  OR A, A               ; test A (mantissa MSB / overflow)
0x0034F6  LD HL, 0x000000       ; HL = 0 (for zero test via ADC)
0x0034FA  ADC HL, BC            ; HL = BC + carry_from_OR  (HL = mantissa, effectively)
                                 ; also tests if mantissa == 0

; --- Check for zero/underflow ---
0x0034FC  JR NZ, 0x00350B       ; if mantissa != 0, skip to normalization
0x0034FE  CP A, 0x01            ; compare A with 1
0x003500  JR NC, 0x00350B       ; if A >= 1, mantissa is nonzero in upper bits
; mantissa is completely zero → result is ±0.0
0x003502  CCF                   ; complement carry (will produce zero result)
0x003503  SBC A, A              ; A = 0 - 0 - carry = 0x00 or 0xFF
0x003504  SBC HL, HL            ; HL = 0
0x003506  LD E, 0x00            ; exponent = 0
0x003508  POP AF                ; restore sign (in carry)
0x003509  JR 0x00355F           ; jump to final sign insertion

; --- Handle negative mantissa ---
0x00350B  OR A, A               ; test A for sign
0x00350C  JP P, 0x00351E        ; if A >= 0 (positive mantissa), skip negation
; A is negative: negate the mantissa and flip sign
0x003510  POP AF                ; get saved flags
0x003511  CCF                   ; complement carry (flip sign bit)
0x003512  PUSH AF               ; re-save with flipped sign
0x003513  OR A, A               ; clear carry for SBC
0x003514  LD HL, 0x000000       ; HL = 0
0x003518  SBC HL, BC            ; HL = 0 - BC (negate low mantissa)
0x00351A  LD C, A               ; save A into C temporarily
0x00351B  LD A, 0x00            ; A = 0
0x00351D  SBC A, C              ; A = 0 - C - borrow (negate high mantissa)

; --- Normalize: handle extra precision bits in A ---
0x00351E  JR Z, 0x00352D        ; if A == 0, mantissa fits in HL, skip
; A != 0: shift A's extra bits into mantissa, adjust exponent
0x003520  PUSH AF               ; save A (extra precision)
0x003521  INC SP                ; discard F from push (keep only A on stack)
0x003522  PUSH HL               ; push HL
0x003523  LD A, L               ; A = L (save low byte)
0x003524  LD HL, 0x000008       ; HL = 8
0x003528  ADD HL, DE            ; HL = DE + 8  (add 8 to exponent, since we're shifting A into position)
0x003529  EX DE, HL             ; DE = old_exponent + 8
0x00352A  INC SP                ; adjust stack (discard H from pushed HL)
0x00352B  POP HL                ; HL = [A_saved, old_H, old_L] → reconstructed with A byte in H position
0x00352C  INC SP                ; final stack adjustment

; --- Main normalization loop ---
0x00352D  OR A, A               ; clear carry
0x00352E  LD BC, 0x000000       ; BC = 0
0x003532  ADC HL, BC            ; HL = HL + 0 + carry (test HL, set sign flag)
0x003534  JP M, 0x003547        ; if bit 23 set (normalized), go to rounding

; Mantissa not yet normalized — shift left and decrement exponent
0x003538  INC BC                ; BC = 1
0x003539  EX DE, HL             ; DE ↔ HL (now HL = exponent pair, DE = mantissa)
0x00353A  .SIL SBC HL, BC       ; exponent -= 1  (16-bit subtract with .SIL prefix)
0x00353D  EX DE, HL             ; swap back: DE = exponent, HL = mantissa
0x00353E  JR C, 0x003502        ; if exponent underflowed → return zero
0x003540  ADD A, A              ; shift A left (A tracks sub-bit precision)
0x003541  ADC HL, HL            ; shift HL left through carry (normalize mantissa)
0x003543  JP P, 0x003539        ; if bit 23 still not set, keep shifting

; --- Rounding ---
0x003547  ADD A, A              ; shift guard bit into carry
0x003548  LD BC, 0x800000       ; BC = 0x800000 (round-half mask / implicit bit position)
0x00354C  ADC HL, BC            ; HL += 0x800000 + carry (round up if guard bit set)
                                 ; if this overflows bit 24 → need to adjust
0x00354E  JP P, 0x003554        ; no overflow from rounding: sign bit clear → skip
; rounding caused overflow: increment exponent, shift mantissa back
0x003552  INC DE                ; exponent += 1
0x003553  ADD HL, BC            ; HL += 0x800000 (re-normalize: sets bit 23)

; --- Check for exponent overflow (infinity) ---
0x003554  LD A, D               ; A = D (high byte of exponent)
0x003555  CP A, 0x01            ; if D >= 1, exponent > 255 → overflow
0x003557  JR NC, 0x003502       ; overflow → return zero (or inf, reusing zero path)

; --- Insert sign into packed exponent ---
0x003559  POP AF                ; restore flags (carry = sign bit)
0x00355A  RR E                  ; shift E right, carry (sign) → E bit 7
                                 ; E now = [sign][exponent bits 7..1]
0x00355C  JR NC, 0x00355F       ; if old E bit 0 (exponent LSB) was 0, skip
0x00355E  ADD HL, BC            ; if exponent LSB was 1, add 0x800000 to HL
                                 ; this puts exponent LSB into HL bit 23

; --- Final result assembly ---
0x00355F  LD A, E               ; A = packed exponent+sign byte
0x003560  PUSH HL               ; push mantissa
0x003561  POP BC                ; BC = mantissa (lower 23 bits)
0x003562  POP DE                ; restore caller's DE
0x003563  POP HL                ; restore caller's HL
0x003564  RET
```

### Followed immediately by FLTMAX at 0x003565:
```
0x003565  FF FF 7F 7F  → 0x7F7FFFFF = 3.4028235e+38 (IEEE-754 FLT_MAX)
```

---

## 5. _fppack Algorithm (Pseudocode)

```python
def fppack(sign_D, exp_E, mantissa_A_HL):
    """
    Pack sign/exponent/mantissa into IEEE-754 single-precision.
    
    Input:
        sign_D:       D register, bit 0 = sign (0=+, 1=-)
        exp_E:        E register = biased exponent (bias=127)
        mantissa_A_HL: A:HL = 32-bit mantissa (A=bits[31:24], HL=bits[23:0])
                       bit 23 of HL = implicit leading 1 when normalized
    
    Output:
        E = packed byte: [sign | exponent[7:1]]
        BC = packed 24 bits: [exponent[0] | mantissa[22:0]]
        (Together: 32-bit IEEE-754 single in E:BC, little-endian)
    """
    carry_sign = (sign_D >> 1)  # RR D: bit 0 → carry
    
    # Zero check
    if A == 0 and HL == 0:
        return pack_result(sign=carry_sign, exp=0, mantissa=0)  # ±0.0
    
    # Negative mantissa: negate and flip sign
    if A < 0 (signed):
        carry_sign = ~carry_sign
        (A, HL) = negate(A, HL)  # two's complement
    
    # Extra precision: if A != 0, fold it into HL
    if A != 0:
        # A has 8 extra MSBs: shift them into HL, add 8 to exponent
        HL = (A << 16) | (old_H << 8) | old_L  # reconstruct via stack tricks
        exp_E += 8
    
    # Normalize: shift left until bit 23 is set
    while HL >= 0 (bit 23 clear):
        exp_E -= 1
        if exp_E < 0: return ±0.0  # underflow
        HL <<= 1  # (with sub-bit precision from A)
    
    # Round: add guard bit (from A shifts) plus half-ULP
    HL += 0x800000 + guard_carry
    if overflow (bit 24 set):
        exp_E += 1
        HL = re-normalize
    
    # Overflow check
    if exp_E >= 256:
        return ±0.0  # (overflow to zero — simplified; real impl may differ)
    
    # Pack: insert sign into exponent byte, exponent LSB into mantissa bit 23
    E = (sign << 7) | (exp_E >> 1)
    BC = ((exp_E & 1) << 23) | (HL & 0x7FFFFF)
    
    return E, BC
```

---

## 6. _ultof (0x00380D..0x003817) — Unsigned Long to Float

Trivial wrapper: sets D=0 (positive), E=0x96 (=150=127+23), calls _fppack.

```asm
0x00380D  PUSH DE               ; save caller's DE
0x00380E  LD D, 0x00            ; sign = positive
0x003810  LD E, 0x96            ; exponent = 150 (bias 127 + 23)
0x003812  CALL 0x0034EE         ; call _fppack
0x003816  POP DE                ; restore caller's DE
0x003817  RET
```

**Why E=0x96?** An unsigned 24-bit integer N (in HL) has its MSB at bit 23. In IEEE-754, that corresponds to 2^23, so the unbiased exponent would be 23, and biased = 23 + 127 = 150 = 0x96. _fppack then normalizes by shifting left/right to position the leading 1.

---

## 7. Packed Float Memory Layout

The 32-bit packed float in memory (little-endian) is stored as 4 bytes:

```
Byte 0 (lowest addr): mantissa[7:0]    = BC low byte
Byte 1:               mantissa[15:8]   = BC mid byte  
Byte 2:               exp[0] | mantissa[22:16] = BC high byte
Byte 3 (highest addr): sign | exp[7:1] = E register
```

This matches standard IEEE-754 little-endian layout.

---

## 8. Full Soft-Float Family (Updated)

| Address | Name | Callers | Purpose |
|---------|------|---------|---------|
| 0x0034A7 | _fpunpack | — | Unpack IEEE-754 → sign/exp/mantissa (from A:BC) |
| 0x0034CC | _fpunpack2 | — | Variant unpack (from E:HL format) |
| 0x0034EE | _fppack | — | Pack sign/exp/mantissa → IEEE-754 |
| 0x003565 | FLTMAX | — | Literal: 0x7F7FFFFF = 3.4028235e+38 |
| 0x003569 | _fadd | 56 | Addition (exponent align + mantissa add) |
| 0x0035C8 | _fcmp | 45 | Compare (packed-word compare, no unpack) |
| 0x00372B | _fmul | 71 | Multiply (MLT partial-product) |
| 0x0037FC | _fsub | — | Subtract (sign-flip + _fadd) |
| 0x00380D | _ultof | — | Unsigned long → float |

---

## 9. Key Observations

1. **_fppack handles normalization, rounding, and overflow** — it's not just bit-packing. Callers can pass denormalized mantissa values and _fppack will normalize.

2. **The .SIL prefix at 0x00353A** forces a 16-bit SBC in ADL mode, used for the exponent decrement (exponents are 8-bit, so 16-bit subtract is sufficient and avoids 24-bit overhead).

3. **Stack manipulation trick** at 0x003520-0x002C: uses INC SP / PUSH / POP sequences to fold the A register's extra bits into the HL value without needing extra registers. This is a classic eZ80 "register-starved" pattern.

4. **Rounding**: adds 0x800000 (half of bit 23) plus the guard bit carry. This implements "round to nearest, ties to even" approximately — the guard bit from the A register shifts provides the rounding information.

5. **Two unpack variants** exist: _fpunpack (0x0034A7) works with packed format in A:BC (exponent in A, mantissa in BC), while _fpunpack2 (0x0034CC) works with E:HL format.

6. **Overflow handling** at 0x003557 jumps to the zero-return path at 0x003502. This means exponent overflow produces ±0 rather than ±infinity — a simplification typical of embedded soft-float libraries.
