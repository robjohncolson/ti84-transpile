# Phase 611 Caller Decode Report

## Scope

Static decode of two hot callers of the token reader at `0x090883`:

- `0x08F454`, decoded over `0x08F420-0x08F4C0`
- `0x08EB9A`, decoded over `0x08EB60-0x08EC20`

Probe: `TI-84_Plus_CE/probe-phase611-decode-callers.mjs`

## 0x08F454 Disassembly (0x08F420-0x08F4C0)

```
0x08f420  DI
0x08f421  EX AF, AF'
0x08f422  CALL 0x08f3c5
0x08f426  LD BC, 0x000011
0x08f42a  CALL 0x090781
0x08f42e  INC BC
0x08f42f  CALL 0x090843
0x08f433  CALL 0x090918
0x08f437  LD (0xd02a40), HL
0x08f43b  CALL 0x090859
0x08f43f  PUSH AF
0x08f440  CALL 0x08f3dc              ; flag test (BIT 3, (IY+35))
0x08f444  JR Z, 0x08f44f
0x08f446  POP AF
0x08f447  JR C, 0x08f454             ; -> token reader
0x08f449  JR Z, 0x08f454             ; -> token reader
0x08f44b  JP 0x08f3b8                ; BACK-EDGE (loop re-entry)
0x08f44f  POP AF
0x08f450  JP Z, 0x08f3b8             ; BACK-EDGE (loop re-entry)
0x08f454  CALL 0x090883   <=======   ; *** TOKEN READER ***
0x08f458  JP Z, 0x08f5e1
0x08f45c  PUSH HL
0x08f45d  PUSH BC
0x08f45e  CALL 0x0907ad
0x08f462  LD (0x001154), DE          ; SIS prefix
0x08f467  PUSH DE
0x08f468  LD (0x001156), DE          ; SIS prefix
0x08f46d  PUSH DE
0x08f46e  LD D, (IY+50)              ; reads D000B2
0x08f471  LD E, (IY+35)              ; reads D000A3 (the flag byte)
0x08f474  PUSH DE
0x08f475  CALL 0x08f3dc              ; flag test again
0x08f479  JP Z, 0x08f536
0x08f47d  LD (0xd02a40), DE
0x08f482  LD HL, (0xd0243d)
0x08f486  CALL 0x04c973
0x08f48a  JP NZ, 0x08f547
0x08f48e  POP DE (x6)                ; stack cleanup
0x08f494  INC HL
0x08f495  LD A, (HL)
0x08f496  CALL 0x090ba0
0x08f49a  JP Z, 0x08f60b
0x08f49e  CP A, 0x2b
0x08f4a0  JR NZ, 0x08f4b5
0x08f4a2  PUSH AF
0x08f4a3  LD BC, 0x000007
0x08f4a7  CALL 0x090755
0x08f4ab  LD (0x002a33), DE          ; SIS prefix
0x08f4b0  POP AF
0x08f4b1  JP 0x08f5be
0x08f4b5  CP A, 0x6f
0x08f4b7  JP NZ, 0x08f508
0x08f4bb  CALL 0x08f336
```

### Analysis

- **Token reader call**: at 0x08F454 (`CALL 0x090883`)
- **Back-edges**: JP 0x08F3B8 at both 0x08F44B and 0x08F450 -- these jump backward to an address BEFORE this decode window, indicating this code is mid-function in a larger loop rooted at 0x08F3B8
- **Entry to token reader**: conditional on `CALL 0x08f3dc` (BIT 3, (IY+35) test at D000A3). JR C / JR Z from 0x08F447/0x08F449 reach the CALL
- **IY flag reads**: D000B2 (IY+50) and D000A3 (IY+35) -- the D000A3 bit 3 flag is the known runaway cause
- **Post-token-reader dispatch**: checks Z flag, then reads token value from HL, dispatches on 0x2B and 0x6F comparisons
- **Stale pointer risk**: HIGH. The back-edges at 0x08F44B/0x08F450 jump to 0x08F3B8 (outside window) which presumably loops back to the token reader. If D000A3 bit 3 stays SET, the walker re-enters the reader path without forward progress

## 0x08EB9A Disassembly (0x08EB60-0x08EC20)

```
0x08eb60  LD HL, 0x52fff9            ; SIL prefix on next
0x08eb64  ADD HL, BC
0x08eb65  LD C, L
0x08eb66  LD B, H
0x08eb67  LD HL, 0x000013
0x08eb6b  ADD HL, BC                 ; SIL prefix
0x08eb6d  LD E, L
0x08eb6e  LD D, H
0x08eb6f  POP HL
0x08eb70  PUSH HL
0x08eb71  CALL 0x08e086
0x08eb75  LD HL, 0xd02a28
0x08eb79  LD (HL), 0x01              ; set flag at D02A28
0x08eb7b  POP HL
0x08eb7c  LD DE, 0x000006
0x08eb80  ADD HL, DE                 ; SIL prefix
0x08eb82  POP DE
0x08eb83  PUSH HL
0x08eb84  PUSH DE
0x08eb85  CALL 0x08f708
0x08eb89  POP HL
0x08eb8a  INC HL (x3)
0x08eb8d  PUSH HL
0x08eb8e  CALL 0x08f16d
0x08eb92  CALL 0x08f898
0x08eb96  CALL 0x090831
0x08eb9a  CALL 0x090883   <=======   ; *** TOKEN READER ***
0x08eb9e  LD A, D                    ; check D for token type
0x08eb9f  OR A, A
0x08eba0  JR Z, 0x08ebbf             ; D==0 path
0x08eba2  LD HL, 0x08ec27            ; D!=0: copy from ROM table
0x08eba6  LD DE, 0xd005c5
0x08ebaa  CALL 0x07f97a (x3)         ; 3 copy calls
0x08ebb6  LDI
0x08ebb8  LD HL, 0xd005c5
0x08ebbc  XOR A, A
0x08ebbd  JR 0x08ebc4
0x08ebbf  LD A, E                    ; D==0: use E directly
0x08ebc0  CALL 0x0a23c0
0x08ebc4  LD D, (HL)
0x08ebc5  PUSH DE
0x08ebc6  BIT 1, (IY+35)             ; test D000A3 bit 1
0x08ebca  JR NZ, 0x08ebd0
0x08ebcc  CALL 0x08f736
0x08ebd0  POP AF
0x08ebd1  POP HL
0x08ebd2  PUSH AF
0x08ebd3  CALL 0x08f16d
0x08ebd7  POP AF
0x08ebd8  LD L, A
0x08ebd9  LD H, 0x00
0x08ebdb  POP DE
0x08ebdc  BIT 1, (IY+35)             ; test D000A3 bit 1 again
0x08ebe0  JR NZ, 0x08ebee
0x08ebe2  ADD HL, DE                 ; SIL prefix
0x08ebe4  CALL 0x08f708
0x08ebe8  LD A, 0x3d                 ; '=' character
0x08ebea  CALL 0x08f736
0x08ebee  CALL 0x08ec1f
0x08ebf2  POP AF
0x08ebf3  LD (0xd02a28), A
0x08ebf7  RET
--- function boundary ---
0x08ebf8  PUSH DE
0x08ebf9  PUSH HL
0x08ebfa  CALL 0x08dfdd
0x08ebfe  CALL 0x090986
0x08ec02  CALL 0x08ef41
0x08ec06  LD BC, 0x000007
0x08ec0a  CALL 0x09077b
0x08ec0e  POP HL
0x08ec0f  ADD HL, DE                 ; SIL prefix
0x08ec11  LD DE, 0x00000c
0x08ec15  ADD HL, DE                 ; SIL prefix
0x08ec17  POP DE
0x08ec18  PUSH HL
0x08ec19  CALL 0x08df54
0x08ec1d  POP HL
0x08ec1e  RET
```

### Analysis

- **Token reader call**: at 0x08EB9A (`CALL 0x090883`)
- **Back-edges**: NONE in this window -- this is a linear (non-looping) caller
- **Function boundary**: RET at 0x08EBF7 terminates the function containing the token reader call. A second function starts at 0x08EBF8 and ends at RET 0x08EC1E
- **IY flag reads**: D000A3 bit 1 tested twice (0x08EBC6 and 0x08EBDC) -- this is a different bit than the 0x08F454 region (which uses bit 3)
- **Post-token-reader dispatch**: checks D register (token high byte). D!=0 copies from ROM table at 0x08EC27 to RAM at D005C5. D==0 uses E directly via CALL 0x0A23C0
- **D02A28 flag**: set to 1 on entry (0x08EB79), restored from stack on exit (0x08EBF3)
- **Stale pointer risk**: LOW. No back-edges mean the token reader is called exactly once in this path. The function reads a token, dispatches on D/E, renders output, and returns

## Key Findings

1. **0x08F454 is the dangerous caller** -- it sits in a loop with back-edges to 0x08F3B8. The loop is gated by D000A3 bit 3 (the known runaway flag). When bit 3 stays SET, the walker re-enters without forward progress.

2. **0x08EB9A is a safe single-shot caller** -- linear control flow, no loop, calls the token reader once and dispatches on the result. Tests D000A3 bit 1 (not bit 3) for conditional rendering.

3. **Both callers use the D000A3 flag byte** but test different bits: 0x08F454 tests bit 3, 0x08EB9A tests bit 1.

4. **The full loop structure around 0x08F454** extends below 0x08F420 (rooted at 0x08F3B8). To fully map the loop, decode 0x08F3B8-0x08F460.

## Usage

```bash
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase611-decode-callers.mjs
```

Pure static analysis -- no CPU execution, no state mutation.
