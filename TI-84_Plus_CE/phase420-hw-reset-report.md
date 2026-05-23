# Phase 420 — 0x00C9A0 Hardware/State Reset

## Function boundary

- Start: `0x00C9A0`
- End: `0x00CAF3` (`RET`)
- Size: `0x154` bytes (`340` bytes)

## What it resets

### RAM variables

The helper clears a small cluster inside the byte-level app-context region `D14040..D140B3` plus one 24-bit slot:

| Address | New value | Interpretation |
| --- | --- | --- |
| `0xD14040` | `0x00` | app-context header byte 0 |
| `0xD14041` | `0x00` | app-context header byte 1 |
| `0xD140AF` | `0x000000` | 24-bit pointer/handle slot; later code reads it as a 24-bit pointer (`LD HL,(0xD140AF)` at `0x00F286`) |
| `0xD1408D` | `0x00` | known USB worker front-end gate byte from phase 418 |
| `0xD14090` | `0x00` | unnamed app-context state byte |
| `0xD1408E` | `0x00` | unnamed app-context state byte |
| `0xD1408F` | `0x00` | unnamed app-context state byte |
| `0xD1408C` | `0x00` | unnamed app-context state byte |
| `0xD1407E` | `0x00` | known `dispatch_key(0x10,0x03)` follow-up gate from phases 318/320 |
| `0xD140B2` | `0x00` | notification/status byte |

### Port programming

| Port | Write sequence | Old -> new if determinable | Notes |
| --- | --- | --- | --- |
| `0x3124` | via `CALL 0x0075F7` with stacked arg `0x07` | `? -> 0x07` | helper masks the arg with `0x07` and writes it to the port |
| `0x314C` | direct writes `0x02`, then `0x04` | `? -> 0x02`, `? -> 0x04` | phase/stage sequencing |
| `0x313D` | read-modify-write | `old -> old | 0x01` | set bit 0 |
| `0x313C` | read-modify-write | `old -> old | 0x80` | set bit 7 |
| `0x3138` | direct write `0xFF` | `? -> 0xFF` | full mask/control init |
| `0x313A` | direct write `0x0F` | `? -> 0x0F` | low-nibble control init |
| `0x3100` | read-modify-write | `old -> old | 0x10` | assert reset bit 4 |
| `0x3100` | read-modify-write | `old -> old & ~0x10` | release reset bit 4 |
| `0x3108` | read-modify-write | `old -> old | 0x01` | enable USB notification bit 0 |
| `0x3101` | read-modify-write | `old -> old | 0x02` | set secondary control bit 1 |
| `0x3100` | read-modify-write | `old -> old | 0x04` | set bit 2 |
| `0x3100` | read-modify-write | `old -> old | 0x20` | set bit 5 |
| `0x3100` | read-modify-write | `old -> old | 0x80` | set bit 7 |

Every `0x31xx` access is followed by a `B == 0x31` / `C == expected_low_byte` sanity check, with `RST 0x08` as the trap if the port selector in `BC` is wrong.

## Call targets

| Target | Purpose |
| --- | --- |
| `0x0075F7` | helper that writes `(stack_arg & 0x07)` to port `0x3124`; `0x00C9A0` pushes `0x000007` immediately before calling it |

## Relationship to USB recovery

The phase 419 recovery path already established the context before entering this helper:

- `0x00999F` writes `0x314C = 0x01`
- then it calls `0x00C9A0`

Inside `0x00C9A0`, the software state and hardware control blocks are then pushed back to a clean baseline:

1. The routine zeroes the front-end USB/link gate byte `D1408D`, the follow-up dispatch gate `D1407E`, four nearby unnamed state bytes, one notification/status byte, a 24-bit pointer/handle slot, and two app-context header bytes.
2. It preserves the caller interrupt-enable state, disables interrupts for the reprogramming sequence, and restores that state on exit with the classic `LD A,I` / `PUSH AF` / `JP PO` / `EI` pattern.
3. It drives a staged `0x31xx` re-init sequence:
   - `0x3124 <- 0x07`
   - `0x314C` advances from the caller's `0x01` to `0x02` and then `0x04`
   - `0x313D`, `0x313C`, `0x3138`, and `0x313A` are initialized
   - `0x3100` gets a real reset pulse on bit 4, then additional enable bits 2/5/7 are asserted
   - `0x3108` bit 0 and `0x3101` bit 1 are asserted

Best-fit interpretation: `0x00C9A0` is not just clearing flags. It is a combined software-state scrub plus hardware controller re-arm helper for the USB/link block. In the `D177BB` transfer-recovery path, it puts the subsystem back into a known idle/initialized state after the aborted transfer, ready for the follow-up IRQ/service steps at `0x0019B5` and the later sampler/reset helper `0x012E4D`.

## Probe output

The stdout block below is the captured output from the finalized probe logic.

```text
# Phase 420 Probe: Static Trace of 0x00C9A0

Function window: 0x00C9A0..0x00CAF3 (340 bytes)

Disassembly:
0x00C9A0  21 40 40 D1       LD HL,0xD14040            ; point HL at 0xD14040 app-context header byte 0
0x00C9A4  36 00             LD (HL),0x00              ; RAM 0xD14040 app-context header byte 0 <= 0x00
0x00C9A6  23                INC HL
0x00C9A7  36 00             LD (HL),0x00              ; RAM 0xD14041 app-context header byte 1 <= 0x00
0x00C9A9  01 00 00 00       LD BC,0x000000
0x00C9AD  ED 43 AF 40 D1    LD (0xD140AF),BC          ; RAM 0xD140AF 24-bit pointer/handle slot <= 0x000000
0x00C9B2  AF                XOR A
0x00C9B3  32 8D 40 D1       LD (0xD1408D),A           ; RAM 0xD1408D USB worker front-end gate byte <= 0x00
0x00C9B7  AF                XOR A
0x00C9B8  32 90 40 D1       LD (0xD14090),A           ; RAM 0xD14090 unnamed app-context state byte <= 0x00
0x00C9BC  AF                XOR A
0x00C9BD  32 8E 40 D1       LD (0xD1408E),A           ; RAM 0xD1408E unnamed app-context state byte <= 0x00
0x00C9C1  AF                XOR A
0x00C9C2  32 8F 40 D1       LD (0xD1408F),A           ; RAM 0xD1408F unnamed app-context state byte <= 0x00
0x00C9C6  AF                XOR A
0x00C9C7  32 8C 40 D1       LD (0xD1408C),A           ; RAM 0xD1408C unnamed app-context state byte <= 0x00
0x00C9CB  AF                XOR A
0x00C9CC  32 7E 40 D1       LD (0xD1407E),A           ; RAM 0xD1407E dispatch_key follow-up gate <= 0x00
0x00C9D0  AF                XOR A
0x00C9D1  32 B2 40 D1       LD (0xD140B2),A           ; RAM 0xD140B2 notification/status byte <= 0x00
0x00C9D5  ED 57             LD A,I                    ; capture caller interrupt-enable state via LD A,I / P-V from IFF2
0x00C9D7  F5                PUSH AF
0x00C9D8  F3                DI
0x00C9D9  01 07 00 00       LD BC,0x000007
0x00C9DD  C5                PUSH BC
0x00C9DE  CD F7 75 00       CALL 0x0075F7             ; helper that writes (stack_arg & 0x07) to port 0x3124; caller pushes 0x07 here; synthetic port effect 0x3124 <= 0x07
0x00C9E2  C1                POP BC
0x00C9E3  01 4C 31 00       LD BC,0x00314C            ; select port 0x314C USB/link stage control
0x00C9E7  3E 02             LD A,0x02
0x00C9E9  ED 79             OUT (C),A                 ; port write 0x314C USB/link stage control <= 0x02 [stage advance/reset sequencing]
0x00C9EB  78                LD A,B
0x00C9EC  FE 31             CP 0x31
0x00C9EE  28 01             JR Z,0x00C9F1
0x00C9F0  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00C9F1  79                LD A,C
0x00C9F2  FE 4C             CP 0x4C
0x00C9F4  20 FA             JR NZ,0x00C9F0
0x00C9F6  01 4C 31 00       LD BC,0x00314C            ; select port 0x314C USB/link stage control
0x00C9FA  3E 04             LD A,0x04
0x00C9FC  ED 79             OUT (C),A                 ; port write 0x314C USB/link stage control <= 0x04 [stage advance/reset sequencing]
0x00C9FE  78                LD A,B
0x00C9FF  FE 31             CP 0x31
0x00CA01  28 01             JR Z,0x00CA04
0x00CA03  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CA04  79                LD A,C
0x00CA05  FE 4C             CP 0x4C
0x00CA07  20 FA             JR NZ,0x00CA03
0x00CA09  01 3D 31 00       LD BC,0x00313D            ; select port 0x313D USB/link control
0x00CA0D  ED 78             IN A,(C)                  ; port read 0x313D USB/link control
0x00CA0F  CB C7             SET 0,A                   ; prepare set bit 0 in 0x313D value
0x00CA11  ED 79             OUT (C),A                 ; port write 0x313D USB/link control <= port[0x313D] | 0x01 [control register init/reset]
0x00CA13  78                LD A,B
0x00CA14  FE 31             CP 0x31
0x00CA16  28 01             JR Z,0x00CA19
0x00CA18  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CA19  79                LD A,C
0x00CA1A  FE 3D             CP 0x3D
0x00CA1C  20 FA             JR NZ,0x00CA18
0x00CA1E  01 3C 31 00       LD BC,0x00313C            ; select port 0x313C USB/link control
0x00CA22  ED 78             IN A,(C)                  ; port read 0x313C USB/link control
0x00CA24  CB FF             SET 7,A                   ; prepare set bit 7 in 0x313C value
0x00CA26  ED 79             OUT (C),A                 ; port write 0x313C USB/link control <= port[0x313C] | 0x80 [control register init/reset]
0x00CA28  78                LD A,B
0x00CA29  FE 31             CP 0x31
0x00CA2B  28 01             JR Z,0x00CA2E
0x00CA2D  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CA2E  79                LD A,C
0x00CA2F  FE 3C             CP 0x3C
0x00CA31  20 FA             JR NZ,0x00CA2D
0x00CA33  01 38 31 00       LD BC,0x003138            ; select port 0x3138 USB/link mask/control
0x00CA37  3E FF             LD A,0xFF
0x00CA39  ED 79             OUT (C),A                 ; port write 0x3138 USB/link mask/control <= 0xFF [control register init/reset]
0x00CA3B  78                LD A,B
0x00CA3C  FE 31             CP 0x31
0x00CA3E  28 01             JR Z,0x00CA41
0x00CA40  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CA41  79                LD A,C
0x00CA42  FE 38             CP 0x38
0x00CA44  20 FA             JR NZ,0x00CA40
0x00CA46  01 3A 31 00       LD BC,0x00313A            ; select port 0x313A link notification control
0x00CA4A  3E 0F             LD A,0x0F
0x00CA4C  ED 79             OUT (C),A                 ; port write 0x313A link notification control <= 0x0F [control register init/reset]
0x00CA4E  78                LD A,B
0x00CA4F  FE 31             CP 0x31
0x00CA51  28 01             JR Z,0x00CA54
0x00CA53  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CA54  79                LD A,C
0x00CA55  FE 3A             CP 0x3A
0x00CA57  20 FA             JR NZ,0x00CA53
0x00CA59  01 00 31 00       LD BC,0x003100            ; select port 0x3100 USB/link controller core control
0x00CA5D  ED 78             IN A,(C)                  ; port read 0x3100 USB/link controller core control
0x00CA5F  CB E7             SET 4,A                   ; prepare set bit 4 in 0x3100 value
0x00CA61  ED 79             OUT (C),A                 ; port write 0x3100 USB/link controller core control <= port[0x3100] | 0x10 [assert reset bit 4]
0x00CA63  78                LD A,B
0x00CA64  FE 31             CP 0x31
0x00CA66  28 01             JR Z,0x00CA69
0x00CA68  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CA69  79                LD A,C
0x00CA6A  FE 00             CP 0x00
0x00CA6C  20 FA             JR NZ,0x00CA68
0x00CA6E  01 00 31 00       LD BC,0x003100            ; select port 0x3100 USB/link controller core control
0x00CA72  ED 78             IN A,(C)                  ; port read 0x3100 USB/link controller core control
0x00CA74  CB A7             RES 4,A                   ; prepare clear bit 4 in 0x3100 value
0x00CA76  ED 79             OUT (C),A                 ; port write 0x3100 USB/link controller core control <= port[0x3100] & ~0x10 [release reset bit 4]
0x00CA78  78                LD A,B
0x00CA79  FE 31             CP 0x31
0x00CA7B  28 01             JR Z,0x00CA7E
0x00CA7D  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CA7E  79                LD A,C
0x00CA7F  FE 00             CP 0x00
0x00CA81  20 FA             JR NZ,0x00CA7D
0x00CA83  01 08 31 00       LD BC,0x003108            ; select port 0x3108 USB notification control
0x00CA87  ED 78             IN A,(C)                  ; port read 0x3108 USB notification control
0x00CA89  CB C7             SET 0,A                   ; prepare set bit 0 in 0x3108 value
0x00CA8B  ED 79             OUT (C),A                 ; port write 0x3108 USB notification control <= port[0x3108] | 0x01 [control register init/reset]
0x00CA8D  78                LD A,B
0x00CA8E  FE 31             CP 0x31
0x00CA90  28 01             JR Z,0x00CA93
0x00CA92  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CA93  79                LD A,C
0x00CA94  FE 08             CP 0x08
0x00CA96  20 FA             JR NZ,0x00CA92
0x00CA98  00                NOP
0x00CA99  01 01 31 00       LD BC,0x003101            ; select port 0x3101 USB/link secondary control
0x00CA9D  ED 78             IN A,(C)                  ; port read 0x3101 USB/link secondary control
0x00CA9F  CB CF             SET 1,A                   ; prepare set bit 1 in 0x3101 value
0x00CAA1  ED 79             OUT (C),A                 ; port write 0x3101 USB/link secondary control <= port[0x3101] | 0x02 [control register init/reset]
0x00CAA3  78                LD A,B
0x00CAA4  FE 31             CP 0x31
0x00CAA6  28 01             JR Z,0x00CAA9
0x00CAA8  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CAA9  79                LD A,C
0x00CAAA  FE 01             CP 0x01
0x00CAAC  20 FA             JR NZ,0x00CAA8
0x00CAAE  01 00 31 00       LD BC,0x003100            ; select port 0x3100 USB/link controller core control
0x00CAB2  ED 78             IN A,(C)                  ; port read 0x3100 USB/link controller core control
0x00CAB4  CB D7             SET 2,A                   ; prepare set bit 2 in 0x3100 value
0x00CAB6  ED 79             OUT (C),A                 ; port write 0x3100 USB/link controller core control <= port[0x3100] | 0x04
0x00CAB8  78                LD A,B
0x00CAB9  FE 31             CP 0x31
0x00CABB  28 01             JR Z,0x00CABE
0x00CABD  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CABE  79                LD A,C
0x00CABF  FE 00             CP 0x00
0x00CAC1  20 FA             JR NZ,0x00CABD
0x00CAC3  01 00 31 00       LD BC,0x003100            ; select port 0x3100 USB/link controller core control
0x00CAC7  ED 78             IN A,(C)                  ; port read 0x3100 USB/link controller core control
0x00CAC9  CB EF             SET 5,A                   ; prepare set bit 5 in 0x3100 value
0x00CACB  ED 79             OUT (C),A                 ; port write 0x3100 USB/link controller core control <= port[0x3100] | 0x20
0x00CACD  78                LD A,B
0x00CACE  FE 31             CP 0x31
0x00CAD0  28 01             JR Z,0x00CAD3
0x00CAD2  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CAD3  79                LD A,C
0x00CAD4  FE 00             CP 0x00
0x00CAD6  20 FA             JR NZ,0x00CAD2
0x00CAD8  01 00 31 00       LD BC,0x003100            ; select port 0x3100 USB/link controller core control
0x00CADC  ED 78             IN A,(C)                  ; port read 0x3100 USB/link controller core control
0x00CADE  CB FF             SET 7,A                   ; prepare set bit 7 in 0x3100 value
0x00CAE0  ED 79             OUT (C),A                 ; port write 0x3100 USB/link controller core control <= port[0x3100] | 0x80
0x00CAE2  78                LD A,B
0x00CAE3  FE 31             CP 0x31
0x00CAE5  28 01             JR Z,0x00CAE8
0x00CAE7  CF                RST 0x08                  ; sanity trap if BC no longer matches the expected port address
0x00CAE8  79                LD A,C
0x00CAE9  FE 00             CP 0x00
0x00CAEB  20 FA             JR NZ,0x00CAE7
0x00CAED  F1                POP AF
0x00CAEE  E2 F3 CA 00       JP PO,0x00CAF3            ; skip EI when interrupts were already disabled on entry
0x00CAF2  FB                EI                        ; restore interrupts when caller entered with IFF2=1
0x00CAF3  C9                RET

Call targets:
- 0x0075F7 - helper that writes (stack_arg & 0x07) to port 0x3124; caller pushes 0x07 here

RAM writes / reinitializations:
- 0xD14040 app-context header byte 0 <= 0x00
- 0xD14041 app-context header byte 1 <= 0x00
- 0xD140AF 24-bit pointer/handle slot <= 0x000000
- 0xD1408D USB worker front-end gate byte <= 0x00
- 0xD14090 unnamed app-context state byte <= 0x00
- 0xD1408E unnamed app-context state byte <= 0x00
- 0xD1408F unnamed app-context state byte <= 0x00
- 0xD1408C unnamed app-context state byte <= 0x00
- 0xD1407E dispatch_key follow-up gate <= 0x00
- 0xD140B2 notification/status byte <= 0x00

Port writes / reset actions:
- 0x3124 helper mode port: 0x07 [via CALL 0x0075F7; control register init/reset]
- 0x314C USB/link stage control: 0x02 [stage advance/reset sequencing]
- 0x314C USB/link stage control: 0x04 [stage advance/reset sequencing]
- 0x313D USB/link control: port[0x313D] | 0x01 [control register init/reset]
- 0x313C USB/link control: port[0x313C] | 0x80 [control register init/reset]
- 0x3138 USB/link mask/control: 0xFF [control register init/reset]
- 0x313A link notification control: 0x0F [control register init/reset]
- 0x3100 USB/link controller core control: port[0x3100] | 0x10 [assert reset bit 4]
- 0x3100 USB/link controller core control: port[0x3100] & ~0x10 [release reset bit 4]
- 0x3108 USB notification control: port[0x3108] | 0x01 [control register init/reset]
- 0x3101 USB/link secondary control: port[0x3101] | 0x02 [control register init/reset]
- 0x3100 USB/link controller core control: port[0x3100] | 0x04
- 0x3100 USB/link controller core control: port[0x3100] | 0x20
- 0x3100 USB/link controller core control: port[0x3100] | 0x80

High-level behavior:
- Clear the D14040 header bytes, zero a 24-bit slot at D140AF, and clear seven D1407E/D1408C-D14090/D140B2 state bytes.
- Save the caller interrupt state, disable interrupts, and call 0x0075F7 with stacked arg 0x07 so the helper drives port 0x3124.
- Advance 0x314C through 0x02 then 0x04, then program 0x313D, 0x313C, 0x3138, and 0x313A control registers.
- Pulse bit 4 on 0x3100 high then low, then set bit 0 on 0x3108, bit 1 on 0x3101, and bits 2/5/7 on 0x3100.
- Restore the caller interrupt-enable state and return.
```
