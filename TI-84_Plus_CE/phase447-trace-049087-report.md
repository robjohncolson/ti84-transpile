# Phase 447: Trace 0x049087 and Surrounding USB/Display Subsystem

## Summary

`0x049087` is **not** a display refresh routine. It is a 5-byte status getter that reads `D14059` (a USB event accumulator). The task description's "display refresh" label was incorrect.

The actual display/USB subsystem surrounding 0x049087 consists of four functions:

| Address | End | Size | Purpose |
|---------|-----|------|---------|
| `0x049087` | `0x04908B` | 5 B | **Getter**: returns `D14059` in A |
| `0x04908C` | `0x04929C` | 529 B | **LCD controller setup/teardown**: port 0x31xx manipulation, timer config |
| `0x04929D` | `0x049525` | 649 B | **Display update dispatcher**: reads D14044/D14048 flags, calls rendering subs |
| `0x049527` | `0x049618` | 242 B | **Main entry**: checks D177B7=0x55, reads ports 0x3084/0x3085, dispatches |

## 1. Function at 0x049087 (Getter)

### Boundaries

- **Start:** `0x049087`
- **End:** `0x04908B` (RET)
- **Size:** 5 bytes

### Disassembly

```asm
0x049087  3A 59 40 D1   LD A,(0xD14059)
0x04908B  C9            RET
```

### Behavior

Reads one byte from RAM `0xD14059` and returns it in A. No flags set, no side effects.

### Call Site (from 0x03FA09)

```asm
0x03FAF8  ED 38 0F      IN0 A,(0x0F)       ; read port 0x0F
0x03FAFB  CB 77         BIT 6,A            ; test bit 6
0x03FAFD  28 13         JR Z,0x03FB12      ; skip if clear
0x03FAFF  CB 7F         BIT 7,A            ; test bit 7
0x03FB01  20 0F         JR NZ,0x03FB12     ; skip if set
0x03FB03  CD 87 90 04   CALL 0x049087      ; read D14059
0x03FB07  B7            OR A               ; set Z flag from result
0x03FB08  20 08         JR NZ,0x03FB12     ; skip if D14059 != 0
0x03FB0A  CD 07 9E 04   CALL 0x049E07      ; actual display work
```

`0x049087` is a gate: if `D14059 != 0` (USB events pending), skip display refresh entirely.

### Memory Access

- **Reads:** `D14059`
- **VRAM:** none
- **LCD ports:** none
- **Font data:** none

---

## 2. Function at 0x04908C (LCD Controller Setup/Teardown)

### Boundaries

- **Start:** `0x04908C`
- **End:** `0x04929C` (RET)
- **Size:** 529 bytes

### Called From

- `0x049614`: `CALL 0x04908C`

### Disassembly

```asm
;; --- Read port 0x3100, check bit 2 ---
0x04908C  40            LD B,B              ; (NOP-like, from IN A,(C) pattern)
0x04908D  01 00 31      LD BC,0x003100
0x04908D  (ED 78)       IN A,(C)            ; port 0x3100
0x049092  E6 04         AND 0x04            ; bit 2
0x049094  CA 87 92 04   JP Z,0x049287       ; if clear -> near-exit path

;; --- Read ports 0x3140 and 0x3130, store to D1405B and D1405A ---
0x049098  40            LD B,B
0x049099  01 40 31      LD BC,0x003140
         (ED 78)       IN A,(C)            ; port 0x3140
0x04909E  32 5B 40 D1   LD (0xD1405B),A
0x0490A2  40            LD B,B
0x0490A3  01 30 31      LD BC,0x003130
         (ED 78)       IN A,(C)            ; port 0x3130
0x0490A8  32 5A 40 D1   LD (0xD1405A),A

;; --- Merge into D14059: D14059 = D14059 | (D1405B & ~D1405A) ---
0x0490AC  3A 5A 40 D1   LD A,(0xD1405A)
0x0490B0  2F            CPL
0x0490B1  47            LD B,A
0x0490B2  3A 5B 40 D1   LD A,(0xD1405B)
0x0490B6  A0            AND B
0x0490B7  47            LD B,A
0x0490B8  3A 59 40 D1   LD A,(0xD14059)
0x0490BC  B0            OR B
0x0490BD  32 59 40 D1   LD (0xD14059),A

;; --- If D14059 == 0, set port 0x5005 bit 5, jump to exit ---
0x0490C1  3A 59 40 D1   LD A,(0xD14059)
0x0490C5  B7            OR A
0x0490C6  20 19         JR NZ,0x0490E1     ; if non-zero, continue to setup
0x0490C8  01 05 50 00   LD BC,0x005005
0x0490CC  ED 78         IN A,(C)
0x0490CE  CB EF         SET 5,A
0x0490D0  ED 79         OUT (C),A           ; port 0x5005: SET bit 5
         ;; ... port verify loop (RST 08h pattern) ...
0x0490DD  C3 9C 92 04   JP 0x04929C         ; -> RET

;; === D14059 non-zero: LCD controller configuration ===

;; --- Check port 0x314C bit 2 ---
0x0490E1  40            LD B,B
0x0490E2  01 4C 31      LD BC,0x00314C
         (ED 78)       IN A,(C)            ; port 0x314C
0x0490E7  E6 04         AND 0x04
0x0490E9  CA 73 91 04   JP Z,0x049173       ; skip LCD clock setup if clear

;; --- Port 0x3100: RES bit 3 ---
0x0490ED  01 00 31 00   LD BC,0x003100
0x0490F1  ED 78         IN A,(C)
0x0490F3  CB 9F         RES 3,A
0x0490F5  ED 79         OUT (C),A
         ;; ... verify loop ...

;; --- Port 0x31CB: RES bit 7 ---
0x049102  01 CB 31 00   LD BC,0x0031CB
0x049106  ED 78         IN A,(C)
0x049108  CB BF         RES 7,A
0x04910A  ED 79         OUT (C),A
         ;; ... verify loop ...

;; --- Clear D1407E ---
0x049117  AF            XOR A
0x049118  32 7E 40 D1   LD (0xD1407E),A

;; --- Port 0x3120: SET bit 3 ---
0x04911C  01 20 31 00   LD BC,0x003120
0x049120  ED 78         IN A,(C)
0x049122  CB DF         SET 3,A
0x049124  ED 79         OUT (C),A
         ;; ... verify loop ...

;; --- Set D140B2=1, clear D140AF(3 bytes), clear D14040-D14041 ---
0x049131  3E 01         LD A,0x01
0x049133  32 B2 40 D1   LD (0xD140B2),A
0x049137  01 00 00 00   LD BC,0x000000
0x04913B  ED 43 AF 40 D1 LD (0xD140AF),BC
0x049140  21 40 40 D1   LD HL,0xD14040
0x049144  36 00         LD (HL),0x00
0x049146  23            INC HL
0x049147  36 00         LD (HL),0x00

;; --- Port 0x313C: RES bit 1, then SET bit 2 ---
0x049149  01 3C 31 00   LD BC,0x00313C
0x04914D  ED 78         IN A,(C)
0x04914F  CB 8F         RES 1,A
0x049151  ED 79         OUT (C),A
         ;; ... verify ...
0x04915E  01 3C 31 00   LD BC,0x00313C
0x049162  ED 78         IN A,(C)
0x049164  CB D7         SET 2,A
0x049166  ED 79         OUT (C),A
         ;; ... verify ...

;; --- At 0x049173: check port 0x314D bit 2 ---
0x049173  40            LD B,B
0x049174  01 4D 31      LD BC,0x00314D
         (ED 78)       IN A,(C)            ; port 0x314D
0x049179  E6 04         AND 0x04
0x04917B  28 38         JR Z,0x0491B5       ; if clear -> alternate path

;; --- D1407C check, set D1407B, clear D14038 ---
0x04917D  3A 7C 40 D1   LD A,(0xD1407C)
0x049181  B7            OR A
0x049182  20 0F         JR NZ,0x049193
0x049184  3E 01         LD A,0x01
0x049186  32 7B 40 D1   LD (0xD1407B),A
0x04918A  01 00 00 00   LD BC,0x000000
0x04918E  ED 43 38 40 D1 LD (0xD14038),BC

;; --- Port 0x313D: SET bit 2, CALL 0x0003C0 ---
0x049193  01 3D 31 00   LD BC,0x00313D
0x049197  ED 78         IN A,(C)
0x049199  CB D7         SET 2,A
0x04919B  ED 79         OUT (C),A
         ;; ... verify ...
0x0491A8  CD C0 03 00   CALL 0x0003C0       ; system call
0x0491AC  AF            XOR A
0x0491AD  32 84 40 D1   LD (0xD14084),A
0x0491B1  C3 56 92 04   JP 0x049256         ; -> common path

;; --- Alternate path: port 0x314C bit 0 check ---
0x0491B5  40            LD B,B
0x0491B6  01 4C 31      LD BC,0x00314C
         (ED 78)       IN A,(C)
0x0491BB  E6 01         AND 0x01
0x0491BD  CA 56 92 04   JP Z,0x049256       ; skip if clear

;; --- Full LCD init sequence ---
0x0491C1  AF            XOR A
0x0491C2  32 8C 40 D1   LD (0xD1408C),A     ; clear D1408C
0x0491C6  3E 01         LD A,0x01
0x0491C8  32 7C 40 D1   LD (0xD1407C),A     ; set D1407C = 1
0x0491CC  32 7D 40 D1   LD (0xD1407D),A     ; set D1407D = 1

;; --- Port 0x3120: RES bit 2 ---
0x0491D0  01 20 31 00   LD BC,0x003120
0x0491D4  ED 78         IN A,(C)
0x0491D6  CB 97         RES 2,A
0x0491D8  ED 79         OUT (C),A
         ;; ... verify ...

;; --- CALL 0x04B713 (LCD panel init?) ---
0x0491E5  01 00 00 00   LD BC,0x000000
0x0491E9  C5            PUSH BC
0x0491EA  CD 13 B7 04   CALL 0x04B713
0x0491EE  C1            POP BC

;; --- Port 0x3108: SET bit 0 ---
0x0491EF  01 08 31 00   LD BC,0x003108
0x0491F3  ED 78         IN A,(C)
0x0491F5  CB C7         SET 0,A
0x0491F7  ED 79         OUT (C),A
         ;; ... verify ...

;; --- Port 0x3114: RES bit 0 ---
0x049204  01 14 31 00   LD BC,0x003114
0x049208  ED 78         IN A,(C)
0x04920A  CB 87         RES 0,A
0x04920C  ED 79         OUT (C),A
         ;; ... verify ...

;; --- Set D140B2=1, clear D140AF, clear D14040-41 ---
0x049219  3E 01         LD A,0x01
0x04921B  32 B2 40 D1   LD (0xD140B2),A
0x04921F  01 00 00 00   LD BC,0x000000
0x049223  ED 43 AF 40 D1 LD (0xD140AF),BC
0x049228  21 40 40 D1   LD HL,0xD14040
0x04922C  36 00         LD (HL),0x00
0x04922E  23            INC HL
0x04922F  36 00         LD (HL),0x00

;; --- Clear D14059 bit 1, clear D177BB, D176F8, D1407F ---
0x049231  3A 59 40 D1   LD A,(0xD14059)
0x049235  CB 8F         RES 1,A
0x049237  32 59 40 D1   LD (0xD14059),A
0x04923B  AF            XOR A
0x04923C  32 BB 77 D1   LD (0xD177BB),A
0x049240  AF            XOR A
0x049241  32 F8 76 D1   LD (0xD176F8),A
0x049245  AF            XOR A
0x049246  32 7F 40 D1   LD (0xD1407F),A

;; --- Check/clear D1407B ---
0x04924A  3A 7B 40 D1   LD A,(0xD1407B)
0x04924E  B7            OR A
0x04924F  28 05         JR Z,0x049256
0x049251  AF            XOR A
0x049252  32 7B 40 D1   LD (0xD1407B),A

;; === Common path at 0x049256 ===
0x049256  3A 7B 40 D1   LD A,(0xD1407B)
0x04925A  B7            OR A
0x04925B  20 07         JR NZ,0x049264
0x04925D  3A 7C 40 D1   LD A,(0xD1407C)
0x049261  B7            OR A
0x049262  28 38         JR Z,0x04929C       ; -> RET (nothing to do)

;; --- Clear state, reset counters ---
0x049264  AF            XOR A
0x049265  32 7E 40 D1   LD (0xD1407E),A
0x049269  AF            XOR A
0x04926A  32 96 77 D1   LD (0xD17796),A
0x04926E  AF            XOR A
0x04926F  32 B2 40 D1   LD (0xD140B2),A
0x049273  01 00 00 00   LD BC,0x000000
0x049277  ED 43 AF 40 D1 LD (0xD140AF),BC
0x04927C  21 40 40 D1   LD HL,0xD14040
0x049280  36 00         LD (HL),0x00
0x049282  23            INC HL
0x049283  36 00         LD (HL),0x00
0x049285  18 15         JR 0x04929C         ; -> RET

;; --- Near-exit: port 0x5005 SET bit 5, then RET ---
0x049287  01 05 50 00   LD BC,0x005005
0x04928B  ED 78         IN A,(C)
0x04928D  CB EF         SET 5,A
0x04928F  ED 79         OUT (C),A
         ;; ... verify ...
0x04929C  C9            RET
```

### Ports Accessed (0x04908C)

| Port | Operation | Purpose |
|------|-----------|---------|
| `0x3100` | IN, bit 2 check; RES bit 3 | USB controller status / clock gate |
| `0x3108` | SET bit 0 | USB clock enable |
| `0x3114` | RES bit 0 | USB clock config |
| `0x3120` | SET bit 3 / RES bit 2 | USB PHY control |
| `0x3130` | IN | USB event mask |
| `0x3140` | IN | USB event status |
| `0x313C` | RES bit 1, SET bit 2 | USB interrupt config |
| `0x313D` | SET bit 2 | USB interrupt enable |
| `0x314C` | IN, bit 2 / bit 0 check | USB link state |
| `0x314D` | IN, bit 2 check | USB link state |
| `0x31CB` | RES bit 7 | USB clock config |
| `0x5005` | SET bit 5 | USB power / enable |

### CALL Targets

| Address | Called From |
|---------|------------|
| `0x0003C0` | `0x0491A8` |
| `0x04B713` | `0x0491EA` (LCD panel init?) |

### RAM Variables

| Address | Usage |
|---------|-------|
| `D14038` | 3-byte counter, cleared on init |
| `D14040-D14041` | 2-byte flag, cleared repeatedly |
| `D14059` | USB event accumulator (read/write) |
| `D1405A` | USB event mask (from port 0x3130) |
| `D1405B` | USB event status (from port 0x3140) |
| `D1407B` | Link state flag |
| `D1407C` | LCD active flag |
| `D1407D` | LCD init complete flag |
| `D1407E` | Cleared during setup |
| `D1407F` | Cleared during init |
| `D14084` | Cleared after CALL 0x0003C0 |
| `D1408C` | Cleared during full init |
| `D140AF` | 3-byte counter, cleared |
| `D140B2` | Set to 1 during init, cleared later |
| `D176F8` | Cleared during init |
| `D177BB` | Cleared during init (display-dirty related) |
| `D17796` | Cleared during teardown |

---

## 3. Function at 0x04929D (Display Update Dispatcher)

### Boundaries

- **Start:** `0x04929D`
- **End:** `0x049525` (RET)
- **Size:** 649 bytes

### Called From

- `0x0495AB`: `CALL 0x04929D`

### High-Level Structure

This is a large flag-driven dispatcher that reads `D14044` and `D14048` (derived from port 0x3084/0x3085 status masked by D14042/D14046) and branches to various rendering/DMA paths.

```
D14044 bit 1 set? -> full display refresh path (0x0492A7)
  -> CALL 0x049EE4 (rendering sub)
  -> Port 0x313D SET bit 1
  -> Port 0x3082 bit 5 check -> DMA path vs non-DMA path
     DMA: CALL 0x041056, CALL 0x05202F, port 0x3084 write 0x40
          CALL 0x0003C4, CALL 0x049CCA
          D177BB check -> LCD power sequence (ports 0x3010)
          CALL 0x040FAD, port 0x314C write 1
          CALL 0x0003F4, CALL 0x052013, CALL 0x041E95, CALL 0x0419F1
     Non-DMA: CALL 0x0003C8, CALL 0x0003C0
              Ports 0x3040 RES bit 6, 0x3080 RES bit 2
              CALL 0x041E95, CALL 0x0419F1
  -> JP 0x049525 (RET)

D14044 bit 0 set? -> partial update (0x0493FE)
  -> Port 0x3082 bit 4 check -> CALL 0x0418B7 or port manipulation
  -> D14048 bit 5: CALL 0x041056, CALL 0x041E95
  -> D14044 bit 2: CALL 0x041056, CALL 0x041E95
  -> Various flag-setting paths for D14082-D14086
  -> RET at 0x049525
```

### CALL Targets

| Target | Context |
|--------|---------|
| `0x049EE4` | Rendering setup |
| `0x041056` | DMA transfer (called with args 0,1) |
| `0x05202F` | Buffer copy (arg 0x001B20) |
| `0x052013` | Buffer copy (arg 0x004108) |
| `0x0003C0` | System call |
| `0x0003C4` | System call |
| `0x0003C8` | System call |
| `0x0003F4` | System call |
| `0x049CCA` | Display mode setter (args: row count, flags) |
| `0x040FAD` | LCD power control |
| `0x041E95` | Delay / wait (arg = tick count) |
| `0x0419F1` | Timer/sync |
| `0x0418B7` | Partial refresh |

### Ports Accessed (0x04929D)

| Port | Operation |
|------|-----------|
| `0x313D` | SET bit 1 |
| `0x3082` | IN, bit 5 / bit 4 check |
| `0x3084` | OUT value 0x40 |
| `0x3010` | RES bits 5, 4, 0 (LCD power sequence) |
| `0x314C` | OUT value 1 |
| `0x3040` | RES bit 6 |
| `0x3080` | RES bit 2 |
| `0x3031` | SET bit 0 |

---

## 4. Function at 0x049527 (Main Entry / D177B7 Gate)

### Boundaries

- **Start:** `0x049527` (identified by `0x049526` starting a new code block after `0x049525` RET)
- **End:** `0x049618` (RET)
- **Size:** 242 bytes

### Disassembly (key portions)

```asm
;; --- Clear port 0x5005 bit 5 (USB interrupt disable?) ---
0x049527  01 05 50 00   LD BC,0x005005
0x04952B  ED 78         IN A,(C)
0x04952D  CB AF         RES 5,A
0x04952F  ED 79         OUT (C),A
         ;; ... verify ...

;; --- Check D177B7 == 0x55 (home screen mode) ---
0x04953B  3A B7 77 D1   LD A,(0xD177B7)
0x04953F  FE 55         CP 0x55
0x049541  C2 18 96 04   JP NZ,0x049618      ; if not home screen -> RET immediately

;; --- Read hardware status ports 0x3084 and 0x3085 ---
0x049545  40            LD B,B
0x049546  01 84 30      LD BC,0x003084
         (ED 78)       IN A,(C)            ; port 0x3084
0x04954B  32 47 40 D1   LD (0xD14047),A     ; store raw status A
0x04954F  40            LD B,B
0x049550  01 85 30      LD BC,0x003085
         (ED 78)       IN A,(C)            ; port 0x3085
0x049555  32 43 40 D1   LD (0xD14043),A     ; store raw status B

;; --- If both zero, skip to idle path ---
0x049559  3A 43 40 D1   LD A,(0xD14043)
0x04955D  B7            OR A
0x04955E  20 07         JR NZ,0x049567
0x049560  3A 47 40 D1   LD A,(0xD14047)
0x049564  B7            OR A
0x049565  28 70         JR Z,0x0495D7       ; both zero -> idle check

;; --- Mask with enable registers D14042/D14046 ---
0x049567  3A 43 40 D1   LD A,(0xD14043)
0x04956B  4F            LD C,A
0x04956C  06 00         LD B,0x00
0x04956E  C5            PUSH BC
0x04956F  CD 04 B6 04   CALL 0x04B604       ; process status B events
0x049573  C1            POP BC

0x049574  3A 47 40 D1   LD A,(0xD14047)
0x049578  4F            LD C,A
0x049579  06 00         LD B,0x00
0x04957B  C5            PUSH BC
0x04957C  CD 24 B6 04   CALL 0x04B624       ; process status A events
0x049580  C1            POP BC

;; --- Derive D14044 = D14043 & D14042, D14048 = D14047 & D14046 ---
0x049581  ED 4B 42 40 D1 LD BC,(0xD14042)
0x049586  3A 43 40 D1   LD A,(0xD14043)
0x04958A  A1            AND C
0x04958B  32 44 40 D1   LD (0xD14044),A     ; enabled status B flags

0x04958F  ED 4B 46 40 D1 LD BC,(0xD14046)
0x049594  3A 47 40 D1   LD A,(0xD14047)
0x049598  A1            AND C
0x049599  32 48 40 D1   LD (0xD14048),A     ; enabled status A flags

;; --- If any enabled flags set, dispatch ---
0x04959D  3A 44 40 D1   LD A,(0xD14044)
0x0495A1  B7            OR A
0x0495A2  20 07         JR NZ,0x0495AB
0x0495A4  3A 48 40 D1   LD A,(0xD14048)
0x0495A8  B7            OR A
0x0495A9  28 04         JR Z,0x0495AF       ; nothing enabled -> skip

0x0495AB  CD 9D 92 04   CALL 0x04929D       ; *** DISPLAY UPDATE DISPATCHER ***

;; --- Check for USB ON key (CALL 0x0003E8) ---
0x0495AF  CD E8 03 00   CALL 0x0003E8
0x0495B3  B7            OR A
0x0495B4  28 0A         JR Z,0x0495C0       ; if no key -> re-enable interrupt
0x0495B6  40            LD B,B
0x0495B7  01 84 30      LD BC,0x003084
         (ED 78)       IN A,(C)
0x0495BC  E6 40         AND 0x40            ; port 0x3084 bit 6
0x0495BE  20 58         JR NZ,0x049618      ; if set -> exit without re-enable

;; --- Re-enable port 0x5005 bit 5 ---
0x0495C0  01 05 50 00   LD BC,0x005005
0x0495C4  ED 78         IN A,(C)
0x0495C6  CB EF         SET 5,A
0x0495C8  ED 79         OUT (C),A
         ;; ... verify ...
0x0495D5  18 41         JR 0x049618         ; -> RET

;; --- Idle path: no hardware events, check software flags ---
0x0495D7  3A 73 40 D1   LD A,(0xD14073)
0x0495DB  B7            OR A
0x0495DC  20 36         JR NZ,0x049614      ; if D14073 set -> CALL 0x04908C

;; --- Read ports 0x3014/0x3015 for link activity ---
0x0495DE  40            LD B,B
0x0495DF  01 14 30      LD BC,0x003014
         (ED 78)       IN A,(C)            ; port 0x3014
0x0495E4  32 49 40 D1   LD (0xD14049),A
0x0495E8  40            LD B,B
0x0495E9  01 15 30      LD BC,0x003015
         (ED 78)       IN A,(C)            ; port 0x3015
0x0495EE  32 45 40 D1   LD (0xD14045),A

0x0495F2  3A 49 40 D1   LD A,(0xD14049)
0x0495F6  B7            OR A
0x0495F7  28 04         JR Z,0x0495FD       ; if zero -> skip
0x0495F9  CD 44 8E 04   CALL 0x048E44       ; link event handler

;; --- Re-enable port 0x5005 bit 5 ---
0x0495FD  01 05 50 00   LD BC,0x005005
0x049601  ED 78         IN A,(C)
0x049603  CB EF         SET 5,A
0x049605  ED 79         OUT (C),A
         ;; ... verify ...
0x049612  18 04         JR 0x049618

;; --- Software flag path: call LCD controller setup ---
0x049614  CD 8C 90 04   CALL 0x04908C       ; LCD controller setup/teardown

0x049618  C9            RET
```

### CALL Targets (0x049527)

| Target | Purpose |
|--------|---------|
| `0x04B604` | Process USB status B events |
| `0x04B624` | Process USB status A events |
| `0x04929D` | Display update dispatcher |
| `0x0003E8` | Check for ON key / system event |
| `0x048E44` | Link port event handler |
| `0x04908C` | LCD controller setup/teardown |

### Ports Accessed (0x049527)

| Port | Operation |
|------|-----------|
| `0x5005` | RES/SET bit 5 (USB interrupt gate) |
| `0x3084` | IN (USB status register A) |
| `0x3085` | IN (USB status register B) |
| `0x3014` | IN (link port status) |
| `0x3015` | IN (link port status) |

### RAM Variables (0x049527)

| Address | Purpose |
|---------|---------|
| `D177B7` | Mode flag (0x55 = home screen) |
| `D14042` | USB event enable mask B |
| `D14043` | Raw USB status B (from port 0x3085) |
| `D14044` | Masked USB status B (D14043 & D14042) |
| `D14045` | Link port status (from port 0x3015) |
| `D14046` | USB event enable mask A |
| `D14047` | Raw USB status A (from port 0x3084) |
| `D14048` | Masked USB status A (D14047 & D14046) |
| `D14049` | Link port status (from port 0x3014) |
| `D14073` | Software request flag for LCD setup |

---

## 5. Related Small Functions

### 0x04985C: Disable cursor blink

```asm
0x04985C  AF            XOR A
0x04985D  32 89 40 D1   LD (0xD14089),A     ; D14089 = 0
0x049861  FD 21 80 00 D0 LD IY,0xD00080
0x049866  FD CB 43 D6   SET 2,(IY+67)       ; set bit 2 of D000C3
0x04986A  C9            RET
```

### 0x04986B: Enable cursor blink

```asm
0x04986B  3E 01         LD A,0x01
0x04986D  32 89 40 D1   LD (0xD14089),A     ; D14089 = 1
0x049871  FD 21 80 00 D0 LD IY,0xD00080
0x049876  FD CB 43 96   RES 2,(IY+67)       ; clear bit 2 of D000C3
0x04987A  C9            RET
```

---

## 6. Memory Regions Accessed (Full Subsystem)

### Port I/O (0x30xx-0x31xx: USB Controller)

All port accesses are to the USB/link controller, NOT the LCD (0x4000-0x401F):

- **0x30xx range**: USB power, status, link ports (0x3010, 0x3014, 0x3015, 0x3031, 0x3040, 0x3080, 0x3082, 0x3084, 0x3085)
- **0x31xx range**: USB clock, PHY, interrupt config (0x3100, 0x3108, 0x3114, 0x3120, 0x313C, 0x313D, 0x314C, 0x314D, 0x31CB)
- **0x5005**: USB interrupt master gate

### RAM (D140xx: USB State Block)

The D14038-D140B2 region is a **USB controller state block**, not a display state block:

- `D14038-D1403A`: 3-byte link counter
- `D14040-D14041`: 2-byte flag word
- `D14042-D14043`: USB event mask/status B
- `D14044-D14045`: Masked status / link status
- `D14046-D14049`: USB event mask/status A / link
- `D14059-D1405B`: USB event accumulator + raw status
- `D14072-D1408C`: Various USB/link state flags
- `D140AF-D140B2`: Counters and flags

### Other RAM

- `D177B7`: Mode flag (0x55 = home screen active)
- `D177BB`: Display-dirty flag (cleared during USB init)
- `D176F8`: Cleared during init
- `D17796`: Cleared during teardown
- `D000C3` (via IY+67): Cursor blink control bit

### VRAM

**Not directly accessed** by any function in this subsystem. Display rendering happens in the subroutines called from 0x04929D (e.g., 0x049EE4, 0x041056, 0x05202F).

### LCD Ports (0x4000-0x401F)

**Not accessed.** Despite the earlier "display refresh" label, this subsystem manages the USB controller and link port hardware, not the LCD controller directly.

---

## 7. Conclusion

The function at `0x049087` and its surrounding code block (`0x04908C`-`0x049618`) constitute the **USB/link controller manager**, not a display refresh routine. The subsystem:

1. **Gates on D177B7 = 0x55** (home screen mode) at 0x049527
2. **Reads USB status ports** 0x3084/0x3085 and link ports 0x3014/0x3015
3. **Masks events** against enable registers D14042/D14046
4. **Dispatches** to display update (0x04929D) or link handler (0x048E44)
5. **Manages USB clock/PHY** via ports 0x31xx
6. **Controls USB interrupt** via port 0x5005 bit 5

The "display refresh" functionality is delegated to sub-calls (0x049EE4, 0x041056, 0x05202F, 0x049CCA) that are invoked from 0x04929D when specific USB status flags indicate display-related events need processing. The 0x049087 getter itself is a trivial 5-byte status probe.
