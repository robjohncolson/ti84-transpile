# Phase 320: Crash Paths at 0x0401E9 and 0x048E7B

## Summary

There are two non-mega-table paths into the hard-crash relay at `0x0003AC`:

1. `0x0401E9` sits inside `BootOS` (`0x020108 -> 0x0401DF`) and crashes if the first `IN0 A,(0x03)` returns `0xFF`.
2. `0x048E7B` sits inside an unnamed IX-framed runtime port-status dispatcher at `0x048E44..0x049086` and crashes if cached status byte `D14049` has bit 4 set.

Both are hardware-facing checks, not stack or heap guards.

## 1. Crash Path at 0x0401E9

### Containing function

- Public entry: `BootOS`
- Jump-table slot: `0x020108`
- Target: `0x0401DF`

Direct caller chain found in ROM:

```asm
0x0008B7  JP 0x020108
0x020108  JP 0x0401DF    ; BootOS
```

Direct `CALL 0x0401xx` hits do exist elsewhere in ROM, but they target nearby helpers (`0x040121`, `0x04012B`, `0x040165`, `0x040188`, `0x04018C`, `0x040192`), not `BootOS` itself.

### Disassembly of the crash-bearing portion

```asm
0x0401DF  ED 38 03        IN0 A,(0x03)
0x0401E2  FE FF           CP 0xFF
0x0401E4  C2 ED 01 04     JP NZ,0x0401ED
0x0401E8  F3              DI
0x0401E9  C3 AC 03 00     JP 0x0003AC

0x0401ED  3E 7D           LD A,0x7D
0x0401EF  ED 39 20        OUT0 (0x20),A
0x0401F2  FE 7D           CP 0x7D
0x0401F4  28 01           JR Z,0x0401F7
0x0401F6  CF              RST 0x08
0x0401F7  21 B7 CA 04     LD HL,0x04CAB7
0x0401FB  ED 29 1D        OUT0 (0x1D),L
0x0401FE  ED 21 1E        OUT0 (0x1E),H
0x040201  22 D7 2A D0     LD (0xD02AD7),HL
0x040205  3A D9 2A D0     LD A,(0xD02AD9)
0x040209  ED 39 1F        OUT0 (0x1F),A
0x04020C  2A D7 2A D0     LD HL,(0xD02AD7)
0x040210  B7              OR A
0x040211  01 B7 CA 04     LD BC,0x04CAB7
0x040215  ED 42           SBC HL,BC
0x040217  28 01           JR Z,0x04021A
0x040219  CF              RST 0x08
0x04021A  3E FF           LD A,0xFF
0x04021C  ED 39 07        OUT0 (0x07),A
0x04021F  3E FC           LD A,0xFC
0x040221  ED 39 0A        OUT0 (0x0A),A
0x040224  3E 80           LD A,0x80
0x040226  32 11 00 F0     LD (0xF00011),A
0x04022A  ED 38 03        IN0 A,(0x03)
0x04022D  CB 67           BIT 4,A
0x04022F  CC 2E 64 04     CALL Z,0x04642E
0x040233  AF              XOR A
0x040234  32 B7 77 D1     LD (0xD177B7),A
0x040238  CD 39 C5 04     CALL 0x04C539
```

### Crash condition

The fatal branch is:

```asm
IN0 A,(0x03)
CP 0xFF
JP NZ,normal_path
DI
JP 0x0003AC
```

`phase202f-lcd-reinit-map-report.md` already identified port `0x03` as a clock/power-status port. A readback of `0xFF` at the very start of `BootOS` is therefore best interpreted as an impossible or non-responsive hardware state: all ones on the status read before boot-time bring-up proceeds.

### Normal path

If port `0x03` does **not** read as `0xFF`, `BootOS` continues with hardware bring-up:

- writes `0x7D` to port `0x20`
- programs `0x04CAB7` through ports `0x1D/0x1E/0x1F`
- writes `0xFF` to port `0x07`
- writes `0xFC` to port `0x0A`
- writes `0x80` to MMIO `0xF00011`
- re-reads port `0x03` and conditionally calls `0x04642E` if bit 4 is clear
- clears `D177B7`
- continues deeper into boot/setup code (`0x04C539`, later `0x0457B2`, `0x0296D0`, etc.)

### Classification

This is a **boot-time hardware sanity check**. It is not a stack check, heap check, or generic memory-corruption guard. The crash only fires when the very first status-port read comes back as the all-ones failure value.

## 2. Crash Path at 0x048E7B

### Containing function

- Unnamed IX-framed runtime routine at `0x048E44..0x049086`
- Entry prologue:

```asm
0x048E44  21 F9 FF FF     LD HL,0xFFFFF9
0x048E48  CD 2C 01 00     CALL 0x00012C
```

This allocates a 7-byte local frame and enters a port-status service loop.

Direct caller found in ROM:

```asm
0x0495DE  SIS LD BC,0x003014
0x0495E2  IN A,(C)
0x0495E4  LD (0xD14049),A
0x0495E8  SIS LD BC,0x003015
0x0495EC  IN A,(C)
0x0495EE  LD (0xD14045),A
0x0495F2  LD A,(0xD14049)
0x0495F6  OR A
0x0495F7  JR Z,0x0495FD
0x0495F9  CALL 0x048E44
```

There is also an internal re-entry edge:

```asm
0x04907E  JP NZ,0x048E60
```

That jump is not a new external caller; it is the routine looping after it re-reads the same status port.

### Disassembly of the crash-bearing portion

```asm
0x048E44  21 F9 FF FF     LD HL,0xFFFFF9
0x048E48  CD 2C 01 00     CALL 0x00012C
0x048E4C  01 EC 41 D1     LD BC,0xD141EC
0x048E50  DD 0F FC        LD (IX-4),BC
0x048E53  DD 07 FC        LD BC,(IX-4)
0x048E56  DD 0F F9        LD (IX-7),BC
0x048E59  DD 07 FC        LD BC,(IX-4)
0x048E5C  03              INC BC
0x048E5D  DD 0F FC        LD (IX-4),BC

0x048E60  3A 49 40 D1     LD A,(0xD14049)
0x048E64  E6 10           AND 0x10
0x048E66  28 17           JR Z,0x048E7F
0x048E68  01 14 30 00     LD BC,0x003014
0x048E6C  3E 10           LD A,0x10
0x048E6E  ED 79           OUT (C),A
0x048E70  78              LD A,B
0x048E71  FE 30           CP 0x30
0x048E73  28 01           JR Z,0x048E76
0x048E75  CF              RST 0x08
0x048E76  79              LD A,C
0x048E77  FE 14           CP 0x14
0x048E79  20 FA           JR NZ,0x048E75
0x048E7B  CD AC 03 00     CALL 0x0003AC

0x048E7F  3A 49 40 D1     LD A,(0xD14049)
0x048E83  E6 20           AND 0x20
0x048E85  28 13           JR Z,0x048E9A
0x048E87  LD BC,0x003014
0x048E8B  LD A,0x20
0x048E8D  OUT (C),A
...
0x048E9A  LD A,(0xD14049)
0x048E9E  AND 0x02
...
0x048F00  LD A,(0xD14049)
0x048F04  AND 0x04
...
0x048FC7  LD A,(0xD14049)
0x048FCB  AND 0x01
...
0x049044  LD A,(0xD14049)
0x049048  AND 0x08
...
0x04906F  SIS LD BC,0x003014
0x049073  IN A,(C)
0x049075  LD (0xD14049),A
0x049079  LD A,(0xD14049)
0x04907D  OR A
0x04907E  JP NZ,0x048E60
0x049082  LD SP,IX
0x049084  POP IX
0x049086  RET
```

### Crash condition

The fatal branch is:

```asm
LD A,(0xD14049)
AND 0x10
JR Z,skip
LD BC,0x003014
LD A,0x10
OUT (C),A
CALL 0x0003AC
```

The direct caller at `0x0495DE` loaded `D14049` from hardware port `0x3014`, so this crash is triggered when **status bit 4 from port `0x3014` is set**.

The same logic exists earlier in ROM at `0x0094DC..0x0096C6`, where the equivalent fatal instruction is:

```asm
0x0094F7  CALL 0x0019B5
```

So the fatality is intentional. `0x048E7B` is not an accidental call into a non-returning routine; it is a relocated clone of an already-fatal device-status path.

### Normal path

If `D14049 & 0x10 == 0`, the function does not crash. Instead it services other hardware-status bits:

- bit 5: acknowledge/write back `0x20` to port `0x3014`
- bit 1: acknowledge/write back `0x02` to port `0x3014`, then run a small local loop around `0x03C49B` and `0x03CC6A`
- bit 2: inspect and modify port `0x3030`, update `D141EA/D141EB/D141E8`
- bit 0: acknowledge/write back `0x01` to port `0x3014`, then run another local loop around `0x03C49B` and `0x03CC6A`
- bit 3: acknowledge/write back `0x08` to port `0x3014`, increment `D14035`
- tail: re-read port `0x3014`, refresh `D14049`, and loop back to `0x048E60` until no status bits remain, then restore `IX` and `RET`

This is classic acknowledge/dispatch-loop structure, not stack-probe structure.

### Caller analysis

`CALL 0x048Exx` scan result:

| Caller | Target | Notes |
|---|---|---|
| `0x0495F9` | `0x048E44` | only direct `CALL` into the function |

Additional direct branch into the middle:

| Branch site | Target | Notes |
|---|---|---|
| `0x04907E` | `0x048E60` | internal re-entry after re-reading port `0x3014` |

### Classification

This is a **runtime hardware-status / controller-dispatch fatal case**. The check is driven by a cached byte read from port `0x3014`, then the routine acknowledges individual bits by writing bitmasks back to the same port and related `0x3030/0x3031` ports. That makes the fatal `bit 4` path an **unexpected peripheral-status assertion**, most likely a fatal controller fault or impossible device state.

It is not consistent with:

- stack overflow checking
- heap corruption checking
- generic memory-integrity checking

## Bottom line

- `0x0401E9` is a **boot hardware read sanity check** inside `BootOS`: crash if the first status-port read returns `0xFF`.
- `0x048E7B` is a **runtime port-status fatal branch** inside an IX-framed hardware dispatcher: crash if port-`0x3014` status bit 4 is set.
- Both crash paths are hardware-facing integrity checks. The first is an all-ones boot-status failure; the second is a fatal device-status bit inside a status acknowledge/service loop.
