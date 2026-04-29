# Phase 129 — Edit Buffer Investigation Report

**Date**: 2026-04-29
**Probe**: `probe-phase129-edit-buffer.mjs`
**Status**: Investigation complete — edit buffer system mapped, key handler traced

## Findings

### 1. Edit Buffer Address Map (from ti84pceg.inc)

**Pointer addresses** (each stores a 24-bit pointer):
| Address | Name | Purpose |
|---------|------|---------|
| 0xD02437 | editTop | Start of buffer (before cursor) |
| 0xD0243A | editCursor | Cursor position in buffer |
| 0xD0243D | editTail | End of pre-cursor data (gap start) |
| 0xD02440 | editBtm | Bottom of buffer (end of post-cursor data) |
| 0xD0244E | editSym | Pointer to VAT of variable being edited |
| 0xD02451 | editDat | Pointer to data of variable being edited |

**Key-related addresses**:
| Address | Name | Purpose |
|---------|------|---------|
| 0xD00587 | kbdScanCode | Raw scan code from GetCSC |
| 0xD0058C | kbdKey | Key code (1 byte) |
| 0xD0058D | kbdGetKy | GetKey result |

### 2. OS Edit Buffer Routines (Jump Table → Real Addresses)

| JT Entry | Name | Target |
|----------|------|--------|
| 0x021504 | BufClr | JP 0x0ADAC3 |
| 0x020D00 | BufInsert | JP 0x05E2A0 |
| 0x020D0C | BufDelete | JP 0x05E367 |
| 0x020CF8 | BufLeft | JP 0x05E242 |
| 0x020CFC | BufRight | JP 0x05E27E |
| 0x020D10 | BufPeek | JP 0x05E37D |
| 0x020CBC | ParseEditBuf | JP 0x0AC8C5 |
| 0x020CB8 | CloseEditBuf | JP 0x0AC2CB |
| 0x020ABC | CreateNumEditBuf | JP 0x096E09 |
| 0x021ED0 | os.SetKbdKey | JP 0x056262 |

### 3. Key Codes for Digits (from ti84pceg.inc)

**Key codes** (kbdKey values, NOT scan codes):
- k0=0x8E, k1=0x8F, k2=0x90, k3=0x91, k4=0x92
- k5=0x93, k6=0x94, k7=0x95, k8=0x96, k9=0x97

**Scan codes** (hardware matrix, written by GetCSC):
- sk0=0x21, sk1=0x22, sk2=0x1A, sk3=0x12, sk4=0x23
- sk5=0x1B, sk6=0x13, sk7=0x24, sk8=0x1C, sk9=0x14

**Note**: The task spec's kNum2=0x22 is actually **sk1** (scan code for key '1'), not k2. The actual key code for digit '2' is k2=0x90.

### 4. Scan-to-Keycode Table (0x09F79B)

Dumped first 64 bytes. The table maps scan codes to key codes:
```
0x09F79B: C9 04 02 01 03 00 00 00 00 05 80 81 82 83 84 09
0x09F7AB: 00 8C 91 94 97 86 BB 35 00 8D 90 93 96 85 B9 2D
0x09F7BB: 31 8E 8F 92 95 8B B7 2C B4 00 8A BF C1 BD B6 32
0x09F7CB: 00 44 5A 2E 48 49 00 45 0A 04 0E 0F 03 00 00 00
```

Cross-referencing: scan code sk2=0x1A → table[0x1A] = 0x90 = k2. Confirmed correct mapping.

### 5. Home-Screen Handler Trace Results

#### With k2=0x90:
- Handler at 0x058241 runs, reaches 0x08BF22 (the CoorMon yield/dispatch area)
- Gets stuck in a loop at 0x09EFDE (6528 hits) — this is likely the **LCD refresh / MMIO busy-wait loop**
- Edit buffer pointers remain all zero — **the edit buffer was never initialized**

#### With kbdKey=0x22 (task spec value):
- Handler runs, enters a different loop at 0x082BE2/0x084711 (8484 hits each)
- This appears to be a **key dispatch table scan loop** (0x0825D1/0x0825D9/0x0825DB repeat 27 times with different targets 0x0824FD through 0x0825xx)
- Edit buffer pointers also remain zero

#### Key Insight: Handler stalls on MMIO/LCD busy-waits
The home handler calls 0x08BF22, which enters the OS interrupt/event loop (CoorMon second pass). This loop at 0x09EFDE is waiting for hardware events (timer ticks, LCD vsync, etc.) that never arrive in the transpiled environment. The handler never reaches the point where it would call BufInsert.

### 6. BufClr Direct Call Test

BufClr (0x0ADAC3) was called directly:
- **Returned successfully** in 351 steps
- However, edit buffer pointers remained at zero
- BufClr appears to be a **clear/reset** operation that may require the buffer to already be initialized by CreateNumEditBuf first

### 7. BufInsert Disassembly Analysis

BufInsert at 0x05E2A0:
```
0x05E2A0: push de
0x05E2A1: call 0x05E3D6    ; check if buffer has room
0x05E2A4: dec b
0x05E2A5: pop bc
0x05E2A6: ret z            ; return if no room
0x05E2A7: ld a,b           ; A = high byte (two-byte token flag?)
0x05E2A8: or a
0x05E2A9: jr z, +0x0C      ; if single-byte token, skip
0x05E2AB: inc hl
0x05E2AC: call 0x05E3DA    ; insert high byte
...
0x05E2B9: ld (0xD0243A),hl ; update editCursor
```

BufInsert expects:
- Edit buffer already initialized (editTop/editTail/editBtm set)
- Token value in register(s) (likely C for single-byte, BC for two-byte)
- Updates editCursor at 0xD0243A after insertion

### 8. Key-to-Token Pipeline

```
Physical key → GetCSC (0x03FA09) → kbdScanCode (0xD00587)
                                          ↓
                              Scan-to-keycode table (0x09F79B)
                                          ↓
                                   kbdKey (0xD0058C)
                                          ↓
                              CoorMon (0x08C331) main loop
                                          ↓
                              App handler dispatch (cxMain → JP(HL))
                                          ↓
                              Home handler (0x058241)
                                          ↓
                              Key dispatch → key-to-token mapping
                                          ↓
                              BufInsert (0x05E2A0) → editCursor updated
```

### 9. Home Handler Execution Path (First ~100 PCs)

The handler follows this path:
1. 0x058241: Entry — loads HL=0, stores to 0xD026AC
2. 0x058258: Checks IY+0x29 flag
3. 0x058262: Reads IY+0x3C (key flags)
4. 0x0800C2: Some utility call
5. 0x058272: Calls 0x058BA3 (key code lookup?)
6. 0x058276: Stores A to 0xD0265B
7. 0x058282: Checks IY+0x1C flag (bit 6)
8. 0x05828A: Checks IY+0x09 flag (bit 7)
9. 0x05829B: Checks IY+0x0C flag (bit 6)
10. 0x0582A0-0x0582D8: Clears many IY flags (reset state)
11. 0x0582B4: Calls 0x058D49 (key classification?)
12. 0x0582B8: Calls 0x08BF22 ← **This is where it enters CoorMon event loop and stalls**

The handler never reaches the digit-key processing because it gets stuck waiting for OS events at step 12.

## Blockers Identified

1. **Edit buffer not initialized**: After boot + MEM_INIT, all edit buffer pointers are zero. The home-screen app needs to call `CreateNumEditBuf` (0x096E09) during its initialization phase before key events can insert tokens.

2. **CoorMon event loop stall**: The home handler calls 0x08BF22 which enters the OS main event loop. This loop at 0x09EFDE busy-waits on MMIO/LCD signals that don't exist in the transpiled environment.

3. **cxMain is zero**: After boot, cxMain (0xD007CA) is 0x000000 — the home app context was never properly set up. The full OS boot sequence (not just MEM_INIT) would need to initialize cxCurApp=0x40 and set up the home-screen handler pointer table.

## Next Steps

1. **Initialize edit buffer directly**: Call `CreateNumEditBuf` (0x096E09) to set up the buffer pointers before testing BufInsert.
2. **Bypass CoorMon stall**: Instead of calling the home handler end-to-end, identify the specific digit-key subroutine (likely around 0x058D49 or below) that maps key codes to tokens and calls BufInsert.
3. **Direct BufInsert test**: Set up editTop/editCursor/editTail/editBtm manually to point to a RAM region, then call BufInsert with a digit token to verify the insertion logic.
4. **Map the key-to-token subroutine**: Disassemble 0x058D49 (called at step 11) to find where digit key codes (0x8E-0x97) are converted to token bytes (0x30-0x39 for '0'-'9') before BufInsert.

## Raw Probe Output

```
=== Phase 129: Edit Buffer Investigation ===

--- Task 1: Edit Buffer Address Map ---
  Edit buffer pointer addresses (24-bit pointers):
    editTop    = 0xD02437   — start of buffer (before cursor)
    editCursor = 0xD0243A   — cursor position
    editTail   = 0xD0243D   — end of pre-cursor data (gap start)
    editBtm    = 0xD02440   — bottom of buffer (end of post-cursor data)
    editSym    = 0xD0244E   — pointer to VAT of variable being edited
    editDat    = 0xD02451   — pointer to data of variable being edited

  Key-related addresses:
    kbdScanCode = 0xD00587   — scan code from GetCSC
    kbdKey      = 0xD0058C   — key code (1 byte)
    kbdGetKy    = 0xD0058D   — GetKey result

  OS edit buffer routines (jump table entries):
    BufClr         = 0x021504
    BufInsert      = 0x020D00
    BufDelete      = 0x020D0C
    BufLeft        = 0x020CF8
    BufRight       = 0x020CFC
    BufPeek        = 0x020D10
    ParseEditBuf   = 0x020CBC
    CloseEditBuf   = 0x020CB8
    CreateNumEditBuf = 0x020ABC
    os.SetKbdKey   = 0x021ED0

  Key codes for digits (from ti84pceg.inc):
    kRight       = 0x01
    kLeft        = 0x02
    kUp          = 0x03
    kDown        = 0x04
    kEnter       = 0x05
    kClear       = 0x09
    kDel         = 0x0A
    k0           = 0x8E
    k1           = 0x8F
    k2           = 0x90
    k3           = 0x91
    k4           = 0x92
    k5           = 0x93
    k6           = 0x94
    k7           = 0x95
    k8           = 0x96
    k9           = 0x97

  Jump table target resolution:
    BufClr             @ 0x021504 -> JP 0x0ADAC3
    BufInsert          @ 0x020D00 -> JP 0x05E2A0
    BufDelete          @ 0x020D0C -> JP 0x05E367
    BufLeft            @ 0x020CF8 -> JP 0x05E242
    BufRight           @ 0x020CFC -> JP 0x05E27E
    BufPeek            @ 0x020D10 -> JP 0x05E37D
    ParseEditBuf       @ 0x020CBC -> JP 0x0AC8C5
    CloseEditBuf       @ 0x020CB8 -> JP 0x0AC2CB
    CreateNumEditBuf   @ 0x020ABC -> JP 0x096E09
    SetKbdKey          @ 0x021ED0 -> JP 0x056262

--- Task 2: Edit Buffer State After Boot ---
  MEM_INIT: returned OK
  After boot + MEM_INIT:
    editTop    = 0x000000
    editCursor = 0x000000
    editTail   = 0x000000
    editBtm    = 0x000000
    editSym    = 0x000000
    editDat    = 0x000000

  Edit buffer pointers are all zero — buffer not yet initialized.
  Need to call an init routine (BufClr or CreateNumEditBuf) first.

--- Task 3: Disassembly of Home-Screen Handler (0x058241) ---
  First 128 bytes:
  0x058241: 21 00 00             ld-pair-imm
  0x058244: 00                   nop
  0x058245: 40 22 AC 26          ld-pair-mem
  0x058249: FD CB 52 BE          indexed-cb-res
  0x05824D: 3E 03                ld-reg-imm
  0x05824F: FD CB 34 66          indexed-cb-bit
  0x058253: C4 B3 39             call-conditional
  0x058256: 02                   ld-ind-reg
  0x058257: C0                   ret-conditional
  0x058258: FD CB 29 56          indexed-cb-bit
  0x05825C: 28 04                jr-conditional
  0x05825E: CD 18 38             call
  0x058261: 02                   ld-ind-reg
  0x058262: FD 7E 3C             ld-reg-ixd
  0x058265: E6 F4                alu-imm
  0x058267: FD 77 3C             ld-ixd-reg
  0x05826A: FD CB 14 BE          indexed-cb-res
  0x05826E: CD C2 00             call
  0x058271: 08                   ex-af
  0x058272: CD A3 8B             call
  0x058275: 05                   dec-reg
  0x058276: 32 5B 26             ld-mem-reg
  0x058279: D0                   ret-conditional
  0x05827A: 32 06 25             ld-mem-reg
  0x05827D: D0                   ret-conditional
  0x05827E: CD 22 82             call
  0x058281: 05                   dec-reg
  0x058282: FD CB 1C 76          indexed-cb-bit
  0x058286: C2 2C 8A             jp-conditional
  0x058289: 05                   dec-reg
  0x05828A: FD CB 09 7E          indexed-cb-bit
  0x05828E: C0                   ret-conditional
  0x05828F: FD CB 45 BE          indexed-cb-res
  0x058293: FD CB 0C 7E          indexed-cb-bit
  0x058297: C2 83 84             jp-conditional
  0x05829A: 05                   dec-reg
  0x05829B: FD CB 0C 76          indexed-cb-bit
  0x05829F: C0                   ret-conditional
  0x0582A0: FD CB 09 86          indexed-cb-res
  0x0582A4: FD CB 08 8E          indexed-cb-res
  0x0582A8: CD AA DC             call
  0x0582AB: 09                   add-pair
  0x0582AC: CD 23 36             call
  0x0582AF: 08                   ex-af
  0x0582B0: CD 64 37             call
  0x0582B3: 08                   ex-af
  0x0582B4: CD 49 8D             call
  0x0582B7: 05                   dec-reg
  0x0582B8: CD 22 BF             call
  0x0582BB: 08                   ex-af
  0x0582BC: FD CB 4A A6          indexed-cb-res
  0x0582C0: FD CB 05 9E          indexed-cb-res

  Disassembly at 0x058693 (potential dispatch table area):
  0x058693: 97                   alu-reg
  0x058694: 32 8D 05             ld-mem-reg
  0x058697: D0                   ret-conditional
  0x058698: FD CB 0C F6          indexed-cb-set
  0x05869C: FD CB 00 EE          indexed-cb-set
  0x0586A0: CD 76 8C             call
  0x0586A3: 05                   dec-reg
  0x0586A4: FB                   ei
  0x0586A5: CD 61 29             call
  0x0586A8: 08                   ex-af
  0x0586A9: CD 5E 21             call
  0x0586AC: 09                   add-pair
  0x0586AD: 40 ED 53 8C 26       ld-mem-pair
  0x0586B2: 40 22 8E 26          ld-pair-mem
  0x0586B6: CD 02 29             call
  0x0586B9: 08                   ex-af
  0x0586BA: 3E 02                ld-reg-imm
  0x0586BC: FD CB 34 66          indexed-cb-bit
  0x0586C0: C4 B3 39             call-conditional
  0x0586C3: 02                   ld-ind-reg
  0x0586C4: FD CB 45 86          indexed-cb-res
  0x0586C8: FD CB 45 CE          indexed-cb-set
  0x0586CC: 20 25                jr-conditional
  0x0586CE: FD CB 49 B6          indexed-cb-res
  0x0586D2: CD D1 1F             call

--- Task 4: Trace Home-Screen Handler with k2 (0x90) ---
  kbdKey set to 0x90 (k2)
  Home handler result: returnHit=false steps=50000
  Final PC: 0x082772

  Edit buffer state AFTER handler:
    editTop    = 0x000000
    editCursor = 0x000000
    editTail   = 0x000000
    editBtm    = 0x000000

  Edit buffer pointer transitions:
    step 500: PC=0x09EFDE top=0x000000 cursor=0x000000 tail=0x000000 btm=0x000000

  Top-20 hottest PCs:
    0x09EFDE: 6528 hits
    0x0A28BF: 4097 hits
    0x0A28B7: 4097 hits
    0x08012D: 1554 hits
    0x080130: 1554 hits
    0x080084: 1554 hits
    0x080087: 1554 hits
    0x08008A: 1554 hits
    0x080090: 1554 hits
    0x080093: 1554 hits
    0x04C876: 1554 hits
    0x082750: 1554 hits
    0x0821B2: 1554 hits
    0x082754: 1554 hits
    0x082756: 1554 hits
    0x08279E: 1553 hits
    0x080096: 1553 hits
    0x0827A5: 1553 hits
    0x0827A6: 1553 hits
    0x0827AA: 1553 hits

  Last 64 PCs visited:
    0x080087 0x08008A 0x080090 0x080093 0x080096 0x0827A5 0x0827A6 0x08012D
    0x080130 0x0827AA 0x08277C 0x08278D 0x082799 0x082745 0x04C876 0x082750
    0x0821B2 0x082754 0x082756 0x082772 0x08279E 0x080084 0x080087 0x08008A
    0x080090 0x080093 0x080096 0x0827A5 0x0827A6 0x08012D 0x080130 0x0827AA
    0x08277C 0x08278D 0x082799 0x082745 0x04C876 0x082750 0x0821B2 0x082754
    0x082756 0x082772 0x08279E 0x080084 0x080087 0x08008A 0x080090 0x080093
    0x080096 0x0827A5 0x0827A6 0x08012D 0x080130 0x0827AA 0x08277C 0x08278D
    0x082799 0x082745 0x04C876 0x082750 0x0821B2 0x082754 0x082756 0x082772

  First 200 PCs visited (dispatch path trace):
    0x058241 0x058257 0x058258 0x058262 0x0800C2 0x058272 0x058BA3 0x058276
    0x058222 0x08C782 0x05822A 0x058282 0x05828A 0x05828F 0x05829B 0x0582A0
    0x09DCAA 0x0582AC 0x083623 0x0582B0 0x083764 0x08376D 0x07F8A2 0x07F8C8
    0x07F974 0x083771 0x07FACF 0x07FADF 0x07FA7F 0x07FA86 0x083775 0x061DEF
    0x08377D 0x083379 0x08337E 0x07F8CC 0x07F974 0x083386 0x07F7BD 0x08338A
    0x08012D 0x080130 0x08338E 0x083397 0x080115 0x080080 0x07F7BD 0x080084
    0x080087 0x08008A 0x080090 0x080093 0x080119 0x08339B 0x08339F 0x0820CD
    0x0820E1 0x0833A3 0x0833B2 0x0833BD 0x0833C3 0x0833C3 0x0833C3 0x0833C3
    0x0833C3 0x0833C3 0x0833C3 0x0833C8 0x0833D0 0x07F7BD 0x0833D7 0x08356A
    0x083571 0x083577 0x08357E 0x083584 0x083588 0x0833DB 0x083470 0x07F920
    0x07F96C 0x07F974 0x083474 0x083788 0x083796 0x061E20 0x061E27 0x08379A
    0x07F914 0x07F96C 0x07F974 0x08379E 0x0582B4 0x058D49 0x0582B8 0x08BF22
    0x042366 0x0421A7 0x000310 0x001C55 0x001C33 0x001C38 0x001C44 0x001C7D
    0x001CA6 0x001CBC 0x001CE5 0x001C81 0x001C82 0x001C48 0x001C33 0x001C38
    0x001C44 0x001C7D 0x001CA6 0x001CBC 0x001CE5 0x001C81 0x001C82 0x001C48
    0x001C33 0x001C38 0x001C44 0x001C7D 0x001CA6 0x001CBC 0x001CE5 0x001C81
    0x001C82 0x001C48 0x001C33 0x001C38 0x001C44 0x001C7D 0x001CA6 0x001CBC
    0x001CE5 0x001C81 0x001C82 0x001C48 0x001C33 0x001C38 0x001C3C 0x001C42
    0x001C5D 0x001C5E 0x001C6B 0x0421AF 0x0421B1 0x00030C 0x001C4F 0x001CA6
    0x001CC0 0x001CCA 0x001CE4 0x001C54 0x0421B5 0x0421BB 0x04236E 0x042387
    0x04239B 0x0423A3 0x0423A7 0x0423CC 0x08BF3C 0x08BF3E 0x08BF82 0x08BF8E
    0x08C308 0x08BF92 0x08BF9A 0x08BFA6 0x08BFAB 0x09EF44 0x09EF4C 0x09EF5E
    0x08C308 0x09EF70 0x09EFB7 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE
    0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE
    0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE 0x09EFDE

--- Task 5: Direct BufClr + BufInsert Test ---
  BufClr resolved to 0x0ADAC3
  Disassembly of BufClr target:
  0x0ADAC3: 3E 3E                ld-reg-imm
  0x0ADAC5: CD A0 00             call
  0x0ADAC8: 08                   ex-af
  0x0ADAC9: 28 02                jr-conditional
  0x0ADACB: 3E BB                ld-reg-imm
  0x0ADACD: 40 ED 5B 5E 22       ld-pair-mem
  0x0ADAD2: D5                   push
  0x0ADAD3: CD A0 00             call
  0x0ADAD6: 08                   ex-af
  0x0ADAD7: 20 24                jr-conditional
  0x0ADAD9: CD 60 D0             call
  0x0ADADC: 0A                   ld-reg-ind
  0x0ADADD: 28 22                jr-conditional
  0x0ADADF: D1                   pop
  0x0ADAE0: CB 3A                rotate-reg
  0x0ADAE2: CB 1B                rotate-reg
  0x0ADAE4: D5                   push
  0x0ADAE5: 30 02                jr-conditional
  0x0ADAE7: C6 12                alu-imm
  0x0ADAE9: FD CB 50 6E          indexed-cb-bit
  0x0ADAED: 28 12                jr-conditional
  0x0ADAEF: FE BD                alu-imm
  0x0ADAF1: 30 12                jr-conditional
  0x0ADAF3: F5                   push
  0x0ADAF4: CD 99 35             call
  0x0ADAF7: 0A                   ld-reg-ind
  0x0ADAF8: F1                   pop
  0x0ADAF9: C6 0E                alu-imm
  0x0ADAFB: 18 D6                jr
  0x0ADAFD: FE D7                alu-imm
  0x0ADAFF: 18 F0                jr
  0x0ADB01: FE CA                alu-imm

  BufClr result: returned=true steps=351
  BufClr missing blocks: 0x7FFFFE
  After BufClr:
    editTop    = 0x000000
    editCursor = 0x000000
    editTail   = 0x000000
    editBtm    = 0x000000

  BufInsert resolved to 0x05E2A0
  Disassembly of BufInsert target:
  0x05E2A0: D5                   push
  0x05E2A1: CD D6 E3             call
  0x05E2A4: 05                   dec-reg
  0x05E2A5: C1                   pop
  0x05E2A6: C8                   ret-conditional
  0x05E2A7: 78                   ld-reg-reg
  0x05E2A8: B7                   alu-reg
  0x05E2A9: 28 0C                jr-conditional
  0x05E2AB: 23                   inc-pair
  0x05E2AC: CD DA E3             call
  0x05E2AF: 05                   dec-reg
  0x05E2B0: C8                   ret-conditional
  0x05E2B1: 71                   ld-ind-reg
  0x05E2B2: 2B                   dec-pair
  0x05E2B3: 70                   ld-ind-reg
  0x05E2B4: 23                   inc-pair
  0x05E2B5: 18 01                jr
  0x05E2B7: 71                   ld-ind-reg
  0x05E2B8: 23                   inc-pair
  0x05E2B9: 22 3A 24             ld-pair-mem
  0x05E2BC: D0                   ret-conditional
  0x05E2BD: F6 01                alu-imm
  0x05E2BF: C9                   ret

--- Task 6: Key-to-Token Pipeline Investigation ---

  Pipeline stages (from documentation):
    1. Physical key press → scan code (hardware matrix)
    2. GetCSC (0x03FA09) → kbdScanCode (0xD00587)
    3. Scan-to-keycode table (0x09F79B) → kbdKey (0xD0058C)
    4. CoorMon (0x08C331) dispatches to app handler
    5. App handler (home: 0x058241) processes key code
    6. Key code → token mapping → BufInsert into edit buffer

  Scan-to-keycode table at 0x09F79B (first 64 bytes):
    0x09F79B: C9 04 02 01 03 00 00 00 00 05 80 81 82 83 84 09
    0x09F7AB: 00 8C 91 94 97 86 BB 35 00 8D 90 93 96 85 B9 2D
    0x09F7BB: 31 8E 8F 92 95 8B B7 2C B4 00 8A BF C1 BD B6 32
    0x09F7CB: 00 44 5A 2E 48 49 00 45 0A 04 0E 0F 03 00 00 00

  Extended home handler disassembly (0x058241 to 0x058341):
  [see disassembly above]

--- Task 7: cxMain and Dispatch Context ---
  cxMain pointer: 0x000000
  cxCurApp: 0x00

--- Task 8: Trace Home Handler with kbdKey=0x22 (task spec value) ---
  kbdKey set to 0x22
  Handler result: returnHit=false steps=50000
  Final PC: 0x084711
  Edit buffer after handler:
    editTop    = 0x000000
    editCursor = 0x000000
    editTail   = 0x000000
    editBtm    = 0x000000

  OS routines called: (none)
  Missing blocks: (none)

  Top-20 hottest PCs:
    0x082BE2: 8484 hits
    0x084716: 8484 hits
    0x08471B: 8484 hits
    0x084723: 8484 hits
    0x084711: 8484 hits
    0x09EFDE: 6528 hits
    0x09EFE8: 42 hits
    0x09EFCB: 40 hits
    0x0A3408: 36 hits
    0x09EFEF: 30 hits
    0x0825D9: 27 hits
    0x0825DB: 27 hits
    0x0825D1: 26 hits
    0x0A3404: 24 hits
    0x07F978: 24 hits
    0x08BED7: 16 hits
    0x08BEDB: 16 hits
    0x08BF15: 16 hits
    0x04C979: 15 hits
    0x08BED2: 13 hits

=== Summary ===

Edit buffer pointer addresses:
  editTop=0xD02437 editCursor=0xD0243A editTail=0xD0243D editBtm=0xD02440
  editSym=0xD0244E editDat=0xD02451

Key codes for digits: k0=0x8E through k9=0x97
Edit buffer routines: BufClr, BufInsert, BufDelete, BufLeft, BufRight, BufPeek

Key-to-Token Pipeline:
  GetCSC → kbdScanCode → scan-to-keycode(0x09F79B) → kbdKey → CoorMon → app handler → BufInsert
```
