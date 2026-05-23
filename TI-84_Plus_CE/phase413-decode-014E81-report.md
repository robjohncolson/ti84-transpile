# Phase 413: Decode of 0x014E81

Date: 2026-05-23
Target: 0x014E81
ROM: TI-84_Plus_CE/ROM.rom

## Summary

- 0x014E81 spans `0x014E81-0x014EF7` (119 bytes) and returns immediately when `D14077` is already zero.
- It is a leaf routine: there are no direct `CALL` instructions inside the body.
- Direct hardware I/O is limited to two ports:
  - `0x5004`: `IN A,(C)` -> `RES 3,A` -> `OUT (C),A`
  - `0x7030`: `IN A,(C)` -> `AND 0x3F` -> `OUT (C),A`
- Direct RAM traffic is the teardown state itself:
  - `D14077` arm/init latch
  - `D1440E/D1440F` installer lock + delivery status
  - `D17779/D1777A` lifecycle flag pair
  - `D176C9/D176CA` lifecycle flag pair
- The entry/exit `LD A,I` / `PUSH AF` / `DI` ... `POP AF` / `JP PO` / `EI` / `RET` sequence preserves the caller's original interrupt-enable state.

## Raw Bytes

```text
0x014e81: ED 57 F5 F3 3A 77 40 D1 B7 28 65 01 04 50 00 ED
0x014e91: 78 CB 9F ED 79 78 FE 50 28 01 CF 79 FE 04 20 FA
0x014ea1: 3A 0E 44 D1 B7 28 0B AF 32 0E 44 D1 3E 01 32 0F
0x014eb1: 44 D1 3A 79 77 D1 B7 28 0B AF 32 79 77 D1 3E 01
0x014ec1: 32 7A 77 D1 3A C9 76 D1 B7 28 0B AF 32 C9 76 D1
0x014ed1: 3E 01 32 CA 76 D1 40 01 30 70 ED 78 E6 3F ED 79
0x014ee1: 78 FE 70 28 01 CF 79 FE 30 20 FA AF 32 77 40 D1
0x014ef1: F1 E2 F7 4E 01 FB C9
```

## Full Disassembly

```text
0x014e81: ED 57                    LD A,I                     ; capture current interrupt state via LD A,I before DI
0x014e83: F5                       PUSH AF
0x014e84: F3                       DI
0x014e85: 3A 77 40 D1             LD A,(0xd14077)            ; D14077 arm/init latch read
0x014e89: B7                       OR A
0x014e8a: 28 65                    JR Z,0x014ef1              ; if D14077 is already zero, skip all teardown work
0x014e8c: 01 04 50 00             LD BC,0x005004
0x014e90: ED 78                    IN A,(C)                   ; port 0x5004 read
0x014e92: CB 9F                    RES 3,A                    ; clear bit 3 in the port-0x5004 enable mask
0x014e94: ED 79                    OUT (C),A                  ; port 0x5004 write
0x014e96: 78                       LD A,B
0x014e97: FE 50                    CP 0x50
0x014e99: 28 01                    JR Z,0x014e9c
0x014e9b: CF                       RST 08h
0x014e9c: 79                       LD A,C
0x014e9d: FE 04                    CP 0x04
0x014e9f: 20 FA                    JR NZ,0x014e9b
0x014ea1: 3A 0E 44 D1             LD A,(0xd1440e)            ; D1440E installer lock read
0x014ea5: B7                       OR A
0x014ea6: 28 0B                    JR Z,0x014eb3              ; skip lock/status flip when installer lock is clear
0x014ea8: AF                       XOR A
0x014ea9: 32 0E 44 D1             LD (0xd1440e),A            ; clear D1440E
0x014ead: 3E 01                    LD A,0x01
0x014eaf: 32 0F 44 D1             LD (0xd1440f),A            ; set D1440F = 1
0x014eb3: 3A 79 77 D1             LD A,(0xd17779)            ; D17779 lifecycle flag read
0x014eb7: B7                       OR A
0x014eb8: 28 0B                    JR Z,0x014ec5              ; skip pair when D17779 is already zero
0x014eba: AF                       XOR A
0x014ebb: 32 79 77 D1             LD (0xd17779),A            ; clear D17779
0x014ebf: 3E 01                    LD A,0x01
0x014ec1: 32 7A 77 D1             LD (0xd1777a),A            ; set D1777A = 1
0x014ec5: 3A C9 76 D1             LD A,(0xd176c9)            ; D176C9 lifecycle flag read
0x014ec9: B7                       OR A
0x014eca: 28 0B                    JR Z,0x014ed7              ; skip pair when D176C9 is already zero
0x014ecc: AF                       XOR A
0x014ecd: 32 C9 76 D1             LD (0xd176c9),A            ; clear D176C9
0x014ed1: 3E 01                    LD A,0x01
0x014ed3: 32 CA 76 D1             LD (0xd176ca),A            ; set D176CA = 1
0x014ed7: 40 01 30 70             SIS LD BC,0x7030
0x014edb: ED 78                    IN A,(C)                   ; port 0x7030 read
0x014edd: E6 3F                    AND 0x3F                   ; clears bits 6 and 7 before writeback
0x014edf: ED 79                    OUT (C),A                  ; port 0x7030 write
0x014ee1: 78                       LD A,B
0x014ee2: FE 70                    CP 0x70
0x014ee4: 28 01                    JR Z,0x014ee7
0x014ee6: CF                       RST 08h
0x014ee7: 79                       LD A,C
0x014ee8: FE 30                    CP 0x30
0x014eea: 20 FA                    JR NZ,0x014ee6
0x014eec: AF                       XOR A
0x014eed: 32 77 40 D1             LD (0xd14077),A            ; D14077 arm/init latch write = 0
0x014ef1: F1                       POP AF
0x014ef2: E2 F7 4E 01             JP PO,0x014ef7             ; restore interrupts only if they were enabled on entry
0x014ef6: FB                       EI
0x014ef7: C9                       RET
```

## Direct Port I/O

| PC | Instruction | Access | Port | Note |
| --- | --- | --- | --- | --- |
| `0x014e90` | `IN A,(C)` | IN | `0x5004` | interrupt controller enable-mask byte 0 |
| `0x014e94` | `OUT (C),A` | OUT | `0x5004` | interrupt controller enable-mask byte 0 |
| `0x014edb` | `IN A,(C)` | IN | `0x7030` | GPIO/timer control port noted in prior USB/key-path work |
| `0x014edf` | `OUT (C),A` | OUT | `0x7030` | GPIO/timer control port noted in prior USB/key-path work |

Important negative result: unlike `0x014EF8`, this routine does **not** directly touch `0x5008`, `0x500C`, or the helper-programmed `0x7020-0x702F` block.

## Direct RAM Accesses

| PC | Instruction | Access | Address | Role |
| --- | --- | --- | --- | --- |
| `0x014e85` | `LD A,(0xd14077)` | READ | `0xD14077` | arm/init latch guard |
| `0x014ea1` | `LD A,(0xd1440e)` | READ | `0xD1440E` | installer lock |
| `0x014ea9` | `LD (0xd1440e),A` | WRITE | `0xD1440E` | clear installer lock |
| `0x014eaf` | `LD (0xd1440f),A` | WRITE | `0xD1440F` | set delivery status = 1 |
| `0x014eb3` | `LD A,(0xd17779)` | READ | `0xD17779` | lifecycle flag pair A, low flag |
| `0x014ebb` | `LD (0xd17779),A` | WRITE | `0xD17779` | clear low flag |
| `0x014ec1` | `LD (0xd1777a),A` | WRITE | `0xD1777A` | set paired high flag |
| `0x014ec5` | `LD A,(0xd176c9)` | READ | `0xD176C9` | lifecycle flag pair B, low flag |
| `0x014ecd` | `LD (0xd176c9),A` | WRITE | `0xD176C9` | clear low flag |
| `0x014ed3` | `LD (0xd176ca),A` | WRITE | `0xD176CA` | set paired high flag |
| `0x014eed` | `LD (0xd14077),A` | WRITE | `0xD14077` | final disarm store |

## Control Flow

| PC | Instruction | Meaning |
| --- | --- | --- |
| `0x014e8a` | `JR Z,0x014ef1` | Already disarmed fast path: skip all hardware and RAM teardown work. |
| `0x014ea6` | `JR Z,0x014eb3` | Only clear `D1440E` / set `D1440F` when the installer lock is active. |
| `0x014eb8` | `JR Z,0x014ec5` | Only flip the `D17779/D1777A` pair when the low flag is active. |
| `0x014eca` | `JR Z,0x014ed7` | Only flip the `D176C9/D176CA` pair when the low flag is active. |
| `0x014ef2` | `JP PO,0x014ef7` | If interrupts were disabled on entry, skip `EI` on exit. |

The two `RST 08h` sites (`0x014E9B` and `0x014EE6`) sit in the same post-port sanity-check pattern seen in `0x014EF8`: after each `OUT`, the code verifies the expected `BC` value (`0x5004` and `0x7030` respectively).

## Direct CALL Targets

None. `0x014E81` is a leaf routine.

## Direct Caller Scan

Exact-byte scans used:

- `CALL 0x014E81 = CD 81 4E 01`
- `JP   0x014E81 = C3 81 4E 01`

Found 8 direct references: 7 `CALL`, 1 `JP`.

| Site | Type | Note | Context Bytes |
| --- | --- | --- | --- |
| `0x0004f4` | JP | exported ROM vector: `JP 0x014E81` | `C3 6F 51 01 C3 51 51 01 C3 97 4F 01 C3 81 4E 01 C3 F8 4E 01 C3 3F 4E 01 C3 A0 4F 01 C3 CC E1 00` |
| `0x008d8e` | CALL | teardown call followed by a short branch into a shared epilogue | `79 78 FE 30 28 01 CF 79 FE 80 20 FA CD 81 4E 01 18 04 DD 36 FF 00 DD 7E FF DD F9 DD E1 C9 21 FF` |
| `0x00925c` | CALL | branch arm of a larger wrapper that skips over a `0x014FA0` path | `00 C5 CD 3C 88 00 C1 C1 CD C4 85 00 CD 81 4E 01 18 1C 01 14 00 00 C5 CD A0 4F 01 C1 CD 27 85 00` |
| `0x009274` | CALL | parallel branch arm of the same wrapper family | `A0 4F 01 C1 CD 27 85 00 CD C4 85 00 CD 81 4E 01 18 04 DD 36 FF 00 DD 7E FF DD F9 DD E1 C9 21 FF` |
| `0x00940e` | CALL | teardown call followed by a short branch into a shared epilogue | `79 78 FE 30 28 01 CF 79 FE 80 20 FA CD 81 4E 01 18 04 DD 36 FF 00 DD 7E FF DD F9 DD E1 C9 21 FD` |
| `0x00b865` | CALL | conditional teardown when the prior helper leaves `A == 0` | `FA CD 4D 2E 01 CD AF 6E 00 B7 20 27 CD 81 4E 01 01 14 31 00 ED 78 CB C7 ED 79 78 FE 31 28 01 CF` |
| `0x0131dd` | CALL | teardown before a later `0x313D` port sequence | `C5 01 01 00 00 C5 CD 3C 88 00 C1 C1 CD 81 4E 01 CD C4 85 00 01 3D 31 00 ED 78 CB 97 ED 79 78 FE` |
| `0x014f97` | CALL | local wrapper: `CALL 0x014E81; CALL 0x014EF8; RET` | `79 FE 30 20 FA 3E 01 32 77 40 D1 C9 CD 81 4E 01 CD F8 4E 01 C9 CD 8A 21 00 FD 21 80 00 D0 FD CB` |

## Interaction With the Notification Lifecycle

The byte-level evidence lines up with the phase 411 and phase 412 conclusions:

1. `0x014E3F` is the notification installer wrapper.
   It disables interrupts, clears `D1440E`, calls `0x014EF8`, clears `D1440F`, snapshots state into `D14408/D1440B`, then restores `D1440E = 1` before returning.

2. `0x014EF8` is the arm/setup half.
   It returns early if `D14077 != 0`, acknowledges `0x5008`, sets bit 3 in `0x5004`, sets bit 3 in `0x500C`, programs the `0x7020-0x702F` helper block, sets bit 6 in `0x7030`, and finally stores `D14077 = 1`.

3. `0x014E81` is the teardown/disarm half.
   It returns early if `D14077 == 0`, clears bit 3 in `0x5004`, conditionally converts `D1440E -> 0` and `D1440F -> 1`, conditionally flips `D17779/D1777A`, conditionally flips `D176C9/D176CA`, clears the high bits of `0x7030` with `AND 0x3F`, and finally stores `D14077 = 0`.

4. `0x014F97` proves the pairing directly.
   The local wrapper is exactly `CALL 0x014E81; CALL 0x014EF8; RET`, i.e. explicit teardown followed by re-arm.

The strongest lifecycle conclusion is therefore:

- `0x014EF8` = hardware arm/setup
- `0x014E3F` = installer wrapper around setup
- `0x014E81` = hardware/state teardown

## Additional Notes

- The `D17779/D1777A` pair is definitely part of the broader notification flow: phase 412's `0x01567C` mapping already showed `0x0151FE` clearing `D1777A` and setting `D17779 = 1` before delivery, while post-delivery logic clears `D17779` again. `0x014E81` matches the "clear low flag / set high flag" half.
- The `D176C9/D176CA` pair uses the same low-flag/high-flag handshake pattern, but the repository has not assigned a stronger semantic name to it yet. The safest claim is that `0x014E81` advances that paired state machine into its completed state.
- Unlike `0x014EF8`, `0x014E81` does not directly restore the `0x500C` latch-mode bit or undo the `0x7020-0x702F` helper programming. The teardown visible here is narrower than the setup path.

*Generated from static ROM analysis for `probe-phase413-decode-014E81.mjs`.*
