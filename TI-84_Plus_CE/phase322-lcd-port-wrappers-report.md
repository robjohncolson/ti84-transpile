# Phase 322: LCD Port Wrapper Family (0x007AEF-0x008291)

**Date**: 2026-05-14
**Region**: 0x007AEF - 0x008291 (932 bytes, 51 functions)
**Purpose**: Port I/O wrappers for LCD DMA controller (0x80xx) and LCD SPI panel registers (0x31xx)

## 1. Architecture

Every wrapper follows a common pattern:

**Read wrappers**:
```
LD BC, port         ; 01 ll hh 00
IN A,(C)            ; ED 78
PUSH AF             ; F5 (save result)
; --- BC verification loop ---
LD A,B / CP 0x80 / JR Z,+1 / RST 08   ; assert B==0x80
LD A,C / CP ll / JR NZ,-6              ; assert C==port_lo
POP AF              ; F1 (restore result)
RET                 ; C9
```

**Write wrappers (stack parameter)**:
```
PUSH IX             ; DD E5
LD IX,0             ; DD 21 00 00 00
ADD IX,SP           ; DD 39
LD A,(IX+6)         ; DD 7E 06 (1st param from C calling convention)
LD BC, port         ; 01 ll hh 00
OUT (C),A           ; ED 79
; --- BC verification loop (same pattern) ---
POP IX / RET
```

The BC verification loop is a **runtime assertion** that the BC register was not corrupted during the IN/OUT instruction. If B != 0x80, RST 08 fires (OS trap/abort). This is a paranoid safety measure against hardware bus glitches.

16-bit read wrappers read two consecutive ports into L (low) and H (high), returning a 16-bit value in HL.

---

## 2. Complete Function Catalog

### 2.1 LCD DMA Controller Read Wrappers (0x80xx)

| Address | Port(s) | Name | Return | Callers | Notes |
|---------|---------|------|--------|---------|-------|
| 0x7AEF | 0x8041 | `read_port_8041_bit0` | A = bit 0 only | 1 | AND 0x01 masks result |
| 0x7B05 | 0x8040 | `read_port_8040` | A = full byte | 1 | LCD sync status (called by 0x010A3C) |
| 0x7B19 | 0x8040+0x8041 | `read_port_8040_8041_16bit` | HL = 16-bit | 0 | L=0x8040, H=0x8041; INC C trick |
| 0x7B34 | 0x8000 | `read_port_8000` | A = full byte | 3 | |
| 0x7B48 | 0x8004 | `read_port_8004` | A = full byte | 3 | |
| 0x7B5C | 0x8008 | `read_port_8008` | A = full byte | 4 | Most-called read wrapper |
| 0x7B70 | 0x800C+0x800D | `read_port_800C_800D_16bit` | HL = 16-bit | 0 | L=0x800C, H=0x800D |
| 0x7C71 | 0x8010 | `read_port_8010` | A = full byte | 1 | |
| 0x7C85 | 0x8014 | `read_port_8014` | A = full byte | 1 | |
| 0x7C99 | 0x8018 | `read_port_8018` | A = full byte | 1 | |

### 2.2 LCD DMA Controller Write Wrappers (0x80xx)

| Address | Port | Name | Param | Callers | Notes |
|---------|------|------|-------|---------|-------|
| 0x7B8B | 0x8024 | `write_port_8024` | (IX+6) | 3 | LCD timing H-start |
| 0x7BAB | 0x8028 | `write_port_8028` | (IX+6) | 3 | LCD timing H-end |
| 0x7BCB | 0x802C | `write_port_802C` | (IX+6) | 3 | LCD timing V-start |
| 0x7BEB | 0x8030 | `write_port_8030` | (IX+6) | 1 | LCD timing V-end |
| 0x7C11 | 0x8010 | `write_port_8010` | (IX+6) | 2 | |
| 0x7C31 | 0x8014 | `write_port_8014` | (IX+6) | 2 | |
| 0x7C51 | 0x8018 | `write_port_8018` | (IX+6) | 2 | |

### 2.3 LCD Control Register 0x8020 (Read-Modify-Write Family)

Port 0x8020 is the **LCD DMA control register**. It has the most wrappers (19 functions) because individual bits control different DMA features.

| Address | Operation | Name | Callers | Notes |
|---------|-----------|------|---------|-------|
| 0x7CAD | RMW: read, (param AND 0x3E) OR current, write | `write_port_8020_masked` | 4 | Preserves bits 0,6,7; sets bits 1-5 from param |
| 0x7CD3 | Read full byte | `read_port_8020` | 3 | |
| 0x7CE7 | Read AND 0x20 | `read_port_8020_bit5` | 1 | Tests DMA enable bit |
| 0x7CF1 | Write raw from stack | `write_port_8020_raw` | 1 | No read-modify-write |
| 0x7D03 | RMW: AND 0xC1 | `port_8020_and_C1` | 2 | Clear bits 1-5 (all DMA config bits) |
| 0x7D0F | RMW: OR 0x01 | `port_8020_set_bit0` | 1 | |
| 0x7D19 | RMW: AND 0xFE | `port_8020_clear_bit0` | 1 | |
| 0x7D23 | RMW: OR 0x20 | `port_8020_set_bit5` | 3 | Enable DMA |
| 0x7D2D | RMW: AND 0xDF | `port_8020_clear_bit5` | 4 | Disable DMA (most-called bit op) |
| 0x7D37 | RMW: OR 0x02 | `port_8020_set_bit1` | 1 | |
| 0x7D41 | RMW: AND 0xFD | `port_8020_clear_bit1` | 1 | |
| 0x7D4B | RMW: OR 0x04 | `port_8020_set_bit2` | 1 | |
| 0x7D55 | RMW: AND 0xFB | `port_8020_clear_bit2` | 1 | |
| 0x7D5F | RMW: OR 0x08 | `port_8020_set_bit3` | 1 | Common OUT tail at 0x7D67 |
| 0x7D75 | RMW: AND 0xF7 | `port_8020_clear_bit3` | 1 | |
| 0x7D7F | RMW: OR 0x10 | `port_8020_set_bit4` | 1 | |
| 0x7D89 | RMW: AND 0xEF | `port_8020_clear_bit4` | 0 | Unreferenced |
| 0x7D93 | RMW: OR 0x40 | `port_8020_set_bit6` | 3 | |
| 0x7D9D | RMW: AND 0xBF | `port_8020_clear_bit6` | 2 | |
| 0x7DA7 | RMW: OR 0x80 | `port_8020_set_bit7` | 1 | |
| 0x7DB1 | RMW: AND 0x7F | `port_8020_clear_bit7` | 1 | |
| 0x7DBB | Read AND 0x40 | `port_8020_read_bit6` | 0 | Unreferenced; JP to verify tail |

**Code sharing**: The bit-set/clear functions at 0x7D03-0x7D5F all JR forward to a common OUT+verify+RET tail at 0x7D67. Functions at 0x7D75-0x7DB1 JR backward to the same tail. This is a space optimization -- 19 functions in ~180 bytes.

### 2.4 LCD DMA Register 0x8034

| Address | Port | Name | Param | Callers | Notes |
|---------|------|------|-------|---------|-------|
| 0x7DC6 | 0x8034 | `read_port_8034` | - | 0 | Unreferenced |
| 0x7DDB | 0x8034 | `write_port_8034` | (IX+6) | 3 | |
| 0x7DFB | 0x8034 | `write_port_8034_0x10` | literal 0x10 | 1 | LD A,0x10 hardcoded |

### 2.5 LCD SPI Panel Register Wrappers (0x31xx)

These functions take a `panel_index` parameter (0-3) and dispatch to the corresponding SPI port. They perform read-modify-write using CB-prefix bit operations on individual SPI register bits.

**Port bank 0x3160**: Panel config registers (ports 0x3161, 0x3165, 0x3169, 0x316D for panels 0-3)

| Address | Ports | CB Op | Meaning | Callers |
|---------|-------|-------|---------|---------|
| 0x7E0F | 0x3161/65/69/6D | CB 9F = RES 3,A | Clear bit 3 | 2 |
| 0x7E84 | 0x3161/65/69/6D | CB DF = SET 3,A | Set bit 3 | 1 |
| 0x7EF9 | 0x3161/65/69/6D | CB A7 = RES 4,A | Clear bit 4 | 2 |
| 0x7F6E | 0x3161/65/69/6D | CB E7 = SET 4,A | Set bit 4 | 2 |
| 0x7FE3 | 0x3161/65/69/6D | CB FF = SET 7,A | Set bit 7 | 1 |

**Port bank 0x3180**: Panel config registers (ports 0x3181, 0x3185, 0x3189, 0x318D for panels 0-3)

| Address | Ports | CB Op | Meaning | Callers |
|---------|-------|-------|---------|---------|
| 0x8058 | 0x3181/85/89/8D | CB 9F = RES 3,A | Clear bit 3 | 2 |
| 0x80CD | 0x3181/85/89/8D | CB DF = SET 3,A | Set bit 3 | 1 |
| 0x8142 | 0x3181/85/89/8D | CB A7 = RES 4,A | Clear bit 4 | 2 |
| 0x81B7 | 0x3181/85/89/8D | CB E7 = SET 4,A | Set bit 4 | 2 |

**Port bank 0x31A8**: Panel write registers (ports 0x31A8, 0x31A9, 0x31AA, 0x31AB)

| Address | Ports | Name | Callers |
|---------|-------|------|---------|
| 0x822C | 0x31A8-AB | `spi_write_panel(index, value)` | 4 |

This function takes two parameters: `(IX+6)` = panel index (0-3), `(IX+9)` = value to write. It uses INC C to step through consecutive port addresses.

---

## 3. LCD DMA Register Map (0x8000-0x80FF)

Based on the wrapper functions and their callers in the 0x0102xx-0x010Axx LCD driver region:

| Port | R/W | Size | Purpose (inferred from caller context) |
|------|-----|------|----------------------------------------|
| 0x8000 | R | 8-bit | LCD timing register 0 (H-total or panel ID) |
| 0x8004 | R | 8-bit | LCD timing register 1 (H-sync width) |
| 0x8008 | R | 8-bit | LCD timing register 2 (H-back porch) |
| 0x800C | R | 16-bit | LCD timing register 3 (read with 0x800D as high byte) |
| 0x8010 | R/W | 8-bit | LCD timing register 4 (V-total or V-sync) |
| 0x8014 | R/W | 8-bit | LCD timing register 5 (V-sync width) |
| 0x8018 | R/W | 8-bit | LCD timing register 6 (V-back porch) |
| 0x8020 | R/W | 8-bit | **LCD DMA control register** (see bit map below) |
| 0x8024 | W | 8-bit | LCD DMA H-start position |
| 0x8028 | W | 8-bit | LCD DMA H-end position |
| 0x802C | W | 8-bit | LCD DMA V-start position |
| 0x8030 | W | 8-bit | LCD DMA V-end position |
| 0x8034 | R/W | 8-bit | LCD DMA misc control (0x10 = reset/init?) |
| 0x8040 | R | 8-bit | LCD DMA status register (sync/busy) |
| 0x8041 | R | 8-bit | LCD DMA status high (bit 0 = panel ready?) |

### 3.1 Port 0x8020 Bit Map (LCD DMA Control Register)

| Bit | Set wrapper | Clear wrapper | Callers (set/clear) | Inferred purpose |
|-----|-------------|---------------|---------------------|------------------|
| 0 | 0x7D0F | 0x7D19 | 1 / 1 | DMA base config bit |
| 1 | 0x7D37 | 0x7D41 | 1 / 1 | DMA pixel format? |
| 2 | 0x7D4B | 0x7D55 | 1 / 1 | DMA burst mode? |
| 3 | 0x7D5F | 0x7D75 | 1 / 1 | DMA direction? |
| 4 | 0x7D7F | 0x7D89 | 1 / 0 | DMA interrupt enable? |
| 5 | 0x7D23 | 0x7D2D | 3 / 4 | **DMA enable** (most accessed bit) |
| 6 | 0x7D93 | 0x7D9D | 3 / 2 | DMA channel select? |
| 7 | 0x7DA7 | 0x7DB1 | 1 / 1 | DMA master enable? |

**Bit 5 is the DMA enable bit** -- it has the most callers (7 total across set/clear), and `read_port_8020_bit5` (0x7CE7) specifically tests only this bit.

The masked write at 0x7CAD (AND 0x3E, OR with current) preserves bits 0, 6, 7 while allowing bits 1-5 to be set from a parameter. This suggests bits 1-5 are "DMA configuration" and bits 0, 6, 7 are "DMA state/control".

---

## 4. Write Port Purposes (from Caller Analysis)

### Caller pattern for 0x8024/0x8028/0x802C

The callers at 0x010430-0x010460 show a clear sequence:
```
LD C,(IX+6)   ; H-start from LCD config struct
LD B,0
PUSH BC
CALL write_port_8024    ; set H-start
POP BC
LD C,(IX+9)   ; H-end from struct
LD B,0
PUSH BC
CALL write_port_8028    ; set H-end
POP BC
LD C,(IX+12)  ; V-start from struct
LD B,0
PUSH BC
CALL write_port_802C    ; set V-start
POP BC
CALL port_8020_set_bit6 ; activate
```

The IX register points to an **LCD configuration structure** with layout:
- IX+6: H-start value (port 0x8024)
- IX+9: H-end value (port 0x8028)
- IX+12: V-start value (port 0x802C)

This is the LCD DMA window setup -- it defines the rectangular region of the LCD panel that the DMA controller will refresh.

### Readback function at 0x010403

The complementary read function uses `LD HL,(IX+6)` (eZ80 DD 27 06) to load a pointer from the struct, reads a port, then stores via `LD (HL),A`. It reads ports 0x8000, 0x8004, 0x8008 back into the struct -- capturing the current LCD timing state.

### Port 0x8030 (V-end)

Only called once (from 0x0108DF). The caller context shows it computing a value from IX offsets with SUB/SBC, suggesting it calculates V-end from panel height minus margins.

---

## 5. Caller Counts Summary

| Callers | Functions |
|---------|-----------|
| 0 | `read_8040_8041_16bit`, `read_800C_800D_16bit`, `clear_bit4`, `read_bit6`, `read_8034` (5 functions -- likely dead code or called indirectly) |
| 1 | 19 functions |
| 2 | 8 functions |
| 3 | 10 functions |
| 4 | 4 functions (`read_8008`, `write_8020_masked`, `clear_bit5`, `spi_31Ax_write`) |

**Total callers across all 51 wrappers**: 82 call sites

All callers are concentrated in two ROM regions:
- **0x009E00-0x00C600**: SPI panel initialization (calls 0x316x/318x/31Ax wrappers)
- **0x010200-0x010B00**: LCD DMA controller driver (calls 0x80xx wrappers)

---

## 6. Special Patterns

### BC Verification Assert
Every function includes a verification loop after the IN/OUT instruction that checks B==0x80 and C==port_low_byte. If the check fails, RST 08 fires (OS debug trap). This catches hardware bus corruption or interrupt-driven BC clobbering. The loop structure (`JR NZ,-6`) retries the check, but since nothing changes BC between iterations, a failure means RST 08 always fires -- the "retry" is actually "verify both halves in sequence".

### Code Sharing (0x8020 family)
The 0x8020 bit-manipulation functions share a common OUT+verify+RET tail at 0x7D67. Functions before it JR forward; functions after it JR backward. Two read functions (0x7CE7, 0x7DBB) share the verify tail of `read_port_8020` at 0x7CD9 via JR/JP.

### SPI Panel Dispatch
The SPI functions at 0x7E0F-0x822C use a case-dispatch pattern:
```
LD A,(IX+6)     ; panel index
DEC A           ; test for 0
JR NZ, next     ; skip if not panel 0
LD BC, 0x3161   ; port for panel 0
IN A,(C)
RES 3,A         ; clear bit 3
OUT (C),A
JR end
next: DEC A     ; test for 1
...
```
Ports are spaced 4 apart (0x3161, 0x3165, 0x3169, 0x316D) suggesting a 4-byte register block per panel.

### Unreferenced Functions
Five functions have zero callers:
- `read_port_8040_8041_16bit` (0x7B19) -- may be called indirectly or dead
- `read_port_800C_800D_16bit` (0x7B70) -- same
- `port_8020_clear_bit4` (0x7D89) -- bit 4 is set but never cleared
- `port_8020_read_bit6` (0x7DBB) -- bit 6 is set/cleared but never tested
- `read_port_8034` (0x7DC6) -- port 0x8034 is written but never read

---

## 7. LCD SPI Register Map (0x3100-0x31FF)

| Port Range | Spacing | Purpose |
|------------|---------|---------|
| 0x3161, 0x3165, 0x3169, 0x316D | +4 per panel | Panel config bank A (bits 3, 4, 7 manipulated) |
| 0x3181, 0x3185, 0x3189, 0x318D | +4 per panel | Panel config bank B (bits 3, 4 manipulated) |
| 0x31A8, 0x31A9, 0x31AA, 0x31AB | +1 per panel | Panel write registers (full-byte write) |

The SPI panel registers likely control the LCD panel's internal settings (contrast, gamma, power sequencing) via the SPI interface between the eZ80 SoC and the LCD panel controller IC.
