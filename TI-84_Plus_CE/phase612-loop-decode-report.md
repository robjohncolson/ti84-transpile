# Phase 612 Loop Decode Report

## Scope

- Probe: `TI-84_Plus_CE/probe-phase612-decode-08f3b8.mjs`
- ROM range: `0x08F3B8` through `0x08F460`
- Loop start under investigation: `0x08F3B8`
- Purpose: statically decode the outer loop that reaches the token-reader caller region decoded in session 611.

## Full Disassembly

```text
0x08f3b8  d1                    POP DE
0x08f3b9  40 ed 53 56 11        LD (0x001156), DE
0x08f3be  d1                    POP DE
0x08f3bf  40 ed 53 54 11        LD (0x001154), DE
0x08f3c4  c9                    RET
0x08f3c5  cd c8 fa 08           CALL 0x08fac8
0x08f3c9  40 2a 2b 2a           LD HL, (0x002a2b)
0x08f3cd  52 19                 ADD HL, DE
0x08f3cf  cd 53 09 09           CALL 0x090953
0x08f3d3  b7                    OR A, A
0x08f3d4  52 ed 52              SBC HL, DE
0x08f3d7  40 22 2b 2a           LD (0x002a2b), HL
0x08f3db  c9                    RET
0x08f3dc  fd cb 23 5e           BIT 3, (IY+35)
0x08f3e0  c9                    RET
0x08f3e1  01 0f 00 00           LD BC, 0x00000f
0x08f3e5  cd 7b 07 09           CALL 0x09077b
0x08f3e9  2a 46 11 d0           LD HL, (0xd01146)
0x08f3ed  01 13 00 00           LD BC, 0x000013
0x08f3f1  09                    ADD HL, BC
0x08f3f2  19                    ADD HL, DE
0x08f3f3  22 1b 2a d0           LD (0xd02a1b), HL
0x08f3f7  c9                    RET
0x08f3f8  40 ed 5b 54 11        LD (0x001154), DE
0x08f3fd  d5                    PUSH DE
0x08f3fe  40 ed 5b 56 11        LD (0x001156), DE
0x08f403  d5                    PUSH DE
0x08f404  cd ad f6 08           CALL 0x08f6ad
0x08f408  cd bf 07 09           CALL 0x0907bf
0x08f40c  fd cb 44 de           SET 3, (IY+68)
0x08f410  fd cb 44 a6           RES 4, (IY+68)
0x08f414  fd cb 23 ce           SET 1, (IY+35)
0x08f418  cd dc f3 08           CALL 0x08f3dc
0x08f41c  20 04                 JR NZ, 0x08f422
0x08f41e  cd e1 f3 08           CALL 0x08f3e1
0x08f422  cd c5 f3 08           CALL 0x08f3c5
0x08f426  01 11 00 00           LD BC, 0x000011
0x08f42a  cd 81 07 09           CALL 0x090781
0x08f42e  03                    INC BC
0x08f42f  cd 43 08 09           CALL 0x090843
0x08f433  cd 18 09 09           CALL 0x090918
0x08f437  22 40 2a d0           LD (0xd02a40), HL
0x08f43b  cd 59 08 09           CALL 0x090859
0x08f43f  f5                    PUSH AF
0x08f440  cd dc f3 08           CALL 0x08f3dc
0x08f444  28 09                 JR Z, 0x08f44f
0x08f446  f1                    POP AF
0x08f447  38 0b                 JR C, 0x08f454
0x08f449  28 09                 JR Z, 0x08f454
0x08f44b  c3 b8 f3 08           JP 0x08f3b8
0x08f44f  f1                    POP AF
0x08f450  ca b8 f3 08           JP Z, 0x08f3b8
0x08f454  cd 83 08 09           CALL 0x090883
0x08f458  ca e1 f5 08           JP Z, 0x08f5e1
0x08f45c  e5                    PUSH HL
0x08f45d  c5                    PUSH BC
0x08f45e  cd ad                 CALL 0x0907ad
```

57 instructions decoded.

## Structural Analysis

### Back-edges (loop restarts)

| From | To | Instruction | Notes |
|------|----|-------------|-------|
| `0x08F44B` | `0x08F3B8` | `JP 0x08f3b8` | Unconditional loop back-edge |
| `0x08F450` | `0x08F3B8` | `JP Z, 0x08f3b8` | Conditional loop back-edge (Z flag) |

### Forward branches

| From | To | Instruction | Notes |
|------|----|-------------|-------|
| `0x08F41C` | `0x08F422` | `JR NZ, 0x08f422` | Skip `CALL 0x08f3e1` if BIT 3,(IY+35) is SET |
| `0x08F444` | `0x08F44F` | `JR Z, 0x08f44f` | If D000A3 bit 3 CLEAR, skip to alternate exit path |
| `0x08F447` | `0x08F454` | `JR C, 0x08f454` | Exit loop on carry |
| `0x08F449` | `0x08F454` | `JR Z, 0x08f454` | Exit loop on zero |
| `0x08F458` | `0x08F5E1` | `JP Z, 0x08f5e1` | **EXIT** - leaves decode range entirely |

### CALL targets (15 total)

| Site | Target | Notes |
|------|--------|-------|
| `0x08F3C5` | `0x08FAC8` | |
| `0x08F3CF` | `0x090953` | |
| `0x08F3E5` | `0x09077B` | |
| `0x08F404` | `0x08F6AD` | |
| `0x08F408` | `0x0907BF` | |
| `0x08F418` | `0x08F3DC` | BIT 3,(IY+35); RET — flag test subroutine |
| `0x08F41E` | `0x08F3E1` | Only called when D000A3 bit 3 is CLEAR |
| `0x08F422` | `0x08F3C5` | |
| `0x08F42A` | `0x090781` | |
| `0x08F42F` | `0x090843` | |
| `0x08F433` | `0x090918` | |
| `0x08F43B` | `0x090859` | |
| `0x08F440` | `0x08F3DC` | Second call to flag test (same BIT 3,(IY+35)) |
| `0x08F454` | `0x090883` | **Token reader** |
| `0x08F45E` | `0x0907AD` | (partial — at edge of decode range) |

### IY-relative accesses (OS flag bytes)

| Site | IY addr | Instruction | Meaning |
|------|---------|-------------|---------|
| `0x08F3DC` | `0xD000A3` | `BIT 3, (IY+35)` | Test D000A3 bit 3 |
| `0x08F40C` | `0xD000C4` | `SET 3, (IY+68)` | Set D000C4 bit 3 |
| `0x08F410` | `0xD000C4` | `RES 4, (IY+68)` | Clear D000C4 bit 4 |
| `0x08F414` | `0xD000A3` | `SET 1, (IY+35)` | Set D000A3 bit 1 |

## Loop Termination Model

The loop body starts at `0x08F3F8` (the real entry, called into by the loop back-edges at `0x08F44B`/`0x08F450`). Note that `0x08F3B8`-`0x08F3C4`, `0x08F3C5`-`0x08F3DB`, `0x08F3DC`-`0x08F3E0`, and `0x08F3E1`-`0x08F3F7` are separate small subroutines terminated by `RET`.

The loop's decision tree after the main work:

1. `CALL 0x090859` at `0x08F43B` returns a result (AF pushed)
2. `CALL 0x08F3DC` tests `BIT 3, (IY+35)` (D000A3 bit 3)
3. **If D000A3 bit 3 is SET (NZ)**: `POP AF`, then:
   - `JR C, 0x08F454` — exit on carry
   - `JR Z, 0x08F454` — exit on zero
   - `JP 0x08F3B8` — otherwise **loop back** (unconditional)
4. **If D000A3 bit 3 is CLEAR (Z)**: `JR Z, 0x08F44F`, `POP AF`, then:
   - `JP Z, 0x08F3B8` — loop back if zero
   - Falls through to `0x08F454` (token reader call) if not zero

So D000A3 bit 3 is the primary loop governor. When SET, the loop iterates unless carry or zero from `0x090859`. When CLEAR, the loop iterates only on zero from `0x090859`.

## Usage

Run the probe only through the watchdog wrapper:

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase612-decode-08f3b8.mjs
```
