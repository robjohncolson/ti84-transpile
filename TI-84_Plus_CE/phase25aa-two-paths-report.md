# Phase 25AA - ParseInp Two Code Paths: Divergence Analysis

## Date

2026-04-22

## Objective

Run ParseInp twice with separate memory instances -- once with a pre-created
variable "A" in OP1, once without (OP1 all zeros) -- and identify the exact
PC where the two code paths diverge.

## Setup

- Two SEPARATE memory/executor instances (fresh cold boot each)
- Timer IRQ disabled: `createPeripheralBus({ timerInterrupt: false })`
- ParseInp entry: `0x099914`
- ChkFindSym call site: `0x099b18`
- Input tokens: `32 70 33 3f` ("2+3")
- PC trace limit per run: 2000

## Run A: With Pre-Created Variable "A"

- Pipeline: MEM_INIT -> CreateReal("A") -> ParseInp
- OP1 seeded to: `00 41 00 00 00 00 00 00 00`
- Termination: return_hit
- Steps: 253
- errNo: `0x00`
- OP1 final: `[00 41 00 00 00 00 00 00 00]` decoded=0
- begPC: `0xd1a883` curPC: `0xd1a884` endPC: `0xd1a882`
- Registers: A=`0x00` F=`0xb3` HL=`0xd1a893` DE=`0xd00601` BC=`0x000000`
- Carry flag (F bit 0): 1
- ChkFindSym visited at trace index: 5
- PCs after ChkFindSym: `[0x08383d, 0x080080, 0x07f7bd, 0x080084, 0x080087]`
- PC trace length: 253
- OP1 milestones:
  - step 50: `[00 41 00 00 00 00 00 00 00]` = 0
  - step 100: `[00 41 00 00 00 00 00 00 00]` = 0
  - step 150: `[00 41 00 00 00 00 00 00 00]` = 0
  - step 200: `[00 41 00 00 00 00 00 00 00]` = 0
  - step 250: `[00 41 00 00 00 00 00 00 00]` = 0

## Run B: No Variable (OP1 All Zeros)

- Pipeline: MEM_INIT -> ParseInp (no CreateReal)
- OP1 seeded to: all zeros
- Termination: return_hit
- Steps: 918
- errNo: `0x8d`
- OP1 final: `[00 80 50 00 00 00 00 00 00]` decoded=5
- begPC: `0xd00800` curPC: `0xd00804` endPC: `0xd00803`
- Registers: A=`0x00` F=`0xb3` HL=`0xd1a881` DE=`0xd00601` BC=`0x000000`
- Carry flag (F bit 0): 1
- ChkFindSym visited at trace index: 5
- PCs after ChkFindSym: `[0x08383d, 0x080080, 0x07f7bd, 0x080084, 0x080087]`
- PC trace length: 918
- OP1 milestones:
  - step 50: `[00 00 00 00 00 00 00 00 00]` = 0
  - step 100: `[00 00 00 00 00 00 00 00 00]` = 0
  - step 150: `[01 80 20 00 00 00 00 00 00]` = 2
  - step 200: `[00 80 20 00 00 00 00 00 00]` = 2
  - step 250: `[00 80 20 00 00 00 00 00 00]` = 2
  - step 300: `[00 80 20 00 00 00 00 00 00]` = 2
  - step 350: `[01 7f 00 00 00 00 00 00 00]` = 0
  - step 400: `[00 80 30 00 00 00 00 00 00]` = 3
  - step 450: `[00 80 30 00 00 00 00 00 00]` = 3
  - step 500: `[00 80 30 00 00 00 00 00 00]` = 3
  - step 550: `[00 80 20 00 00 00 00 00 00]` = 2
  - step 600: `[00 80 30 00 00 00 00 00 00]` = 3
  - step 650: `[00 80 30 00 00 00 00 00 00]` = 3
  - step 700: `[00 80 20 00 00 00 00 00 00]` = 2
  - step 750: `[00 80 50 00 00 00 00 00 00]` = 5
  - step 800: `[00 80 50 00 00 00 00 00 00]` = 5
  - step 850: `[00 80 50 00 00 00 00 00 00]` = 5
  - step 900: `[ff 00 ff ff ff ff 00 00 00]` = -1.6666666500000001e-127

## Divergence Analysis

**Divergence at PC trace index 24**

- Run A takes: `0x08471b`
- Run B takes: `0x099b1c`

### Context around divergence

Run A PCs near divergence:
```
  [19] 0x0846ee
  [20] 0x0846f2
  [21] 0x08470a
  [22] 0x082be2
  [23] 0x084716
  [24] 0x08471b <-- DIVERGE
  [25] 0x08472c
  [26] 0x084735
  [27] 0x08473d
  [28] 0x04c885
  [29] 0x084748
```

Run B PCs near divergence:
```
  [19] 0x0846ee
  [20] 0x0846f2
  [21] 0x08470a
  [22] 0x082be2
  [23] 0x084716
  [24] 0x099b1c <-- DIVERGE
  [25] 0x061d3a
  [26] 0x061db2
  [27] 0x03e1b4
  [28] 0x03e1be
  [29] 0x03e187
```

### Relationship to ChkFindSym

- ChkFindSym trace index in Run A: 5
- ChkFindSym trace index in Run B: 5
- Divergence is 19 PCs AFTER ChkFindSym in Run A

## Key Findings

- **Confirmed**: Pre-creating variable clears the error (Run A errNo=0x00 vs Run B errNo=0x8d)
- Run A steps: 253, Run B steps: 918 (delta: 665)
- The code paths diverge at trace index 24 (Run A -> 0x08471b, Run B -> 0x099b1c)

## Console Output

```text
=== Phase 25AA: ParseInp Two Code Paths ===
ChkFindSym call site watched: 0x099b18
PC trace limit per run: 2000

=== Run A (with variable) ===
Run A (with variable): boot complete
Run A (with variable): MEM_INIT returned to 0x7ffff6 steps=18 errNo=0x00
Run A (with variable): CreateReal returned to 0x7ffff2 steps=231 errNo=0x00
Run A (with variable): ParseInp OP1 pre-call: [00 41 00 00 00 00 00 00 00]
Run A (with variable): ParseInp returned to 0x7ffffe
Run A (with variable): ParseInp steps=253 errNo=0x00
Run A (with variable): ParseInp OP1 post: [00 41 00 00 00 00 00 00 00] decoded=0
Run A (with variable): ParseInp begPC=0xd1a883 curPC=0xd1a884 endPC=0xd1a882
Run A (with variable): ParseInp registers: A=0x00 F=0xb3 HL=0xd1a893 DE=0xd00601 BC=0x000000 SP=0xd1a872
Run A (with variable): ChkFindSym call at PC trace index 5
Run A (with variable): PCs after ChkFindSym: [0x08383d, 0x080080, 0x07f7bd, 0x080084, 0x080087]
Run A (with variable): OP1 milestones:
  step 50: [00 41 00 00 00 00 00 00 00] = 0
  step 100: [00 41 00 00 00 00 00 00 00] = 0
  step 150: [00 41 00 00 00 00 00 00 00] = 0
  step 200: [00 41 00 00 00 00 00 00 00] = 0
  step 250: [00 41 00 00 00 00 00 00 00] = 0

=== Run B (no variable) ===
Run B (no variable): boot complete
Run B (no variable): MEM_INIT returned to 0x7ffff6 steps=18 errNo=0x00
Run B (no variable): ParseInp OP1 pre-call: [00 00 00 00 00 00 00 00 00]
Run B (no variable): ParseInp returned to 0x7ffffe
Run B (no variable): ParseInp steps=918 errNo=0x8d
Run B (no variable): ParseInp OP1 post: [00 80 50 00 00 00 00 00 00] decoded=5
Run B (no variable): ParseInp begPC=0xd00800 curPC=0xd00804 endPC=0xd00803
Run B (no variable): ParseInp registers: A=0x00 F=0xb3 HL=0xd1a881 DE=0xd00601 BC=0x000000 SP=0xd1a872
Run B (no variable): ChkFindSym call at PC trace index 5
Run B (no variable): PCs after ChkFindSym: [0x08383d, 0x080080, 0x07f7bd, 0x080084, 0x080087]
Run B (no variable): OP1 milestones:
  step 50: [00 00 00 00 00 00 00 00 00] = 0
  step 100: [00 00 00 00 00 00 00 00 00] = 0
  step 150: [01 80 20 00 00 00 00 00 00] = 2
  step 200: [00 80 20 00 00 00 00 00 00] = 2
  step 250: [00 80 20 00 00 00 00 00 00] = 2
  step 300: [00 80 20 00 00 00 00 00 00] = 2
  step 350: [01 7f 00 00 00 00 00 00 00] = 0
  step 400: [00 80 30 00 00 00 00 00 00] = 3
  step 450: [00 80 30 00 00 00 00 00 00] = 3
  step 500: [00 80 30 00 00 00 00 00 00] = 3
  step 550: [00 80 20 00 00 00 00 00 00] = 2
  step 600: [00 80 30 00 00 00 00 00 00] = 3
  step 650: [00 80 30 00 00 00 00 00 00] = 3
  step 700: [00 80 20 00 00 00 00 00 00] = 2
  step 750: [00 80 50 00 00 00 00 00 00] = 5
  step 800: [00 80 50 00 00 00 00 00 00] = 5
  step 850: [00 80 50 00 00 00 00 00 00] = 5
  step 900: [ff 00 ff ff ff ff 00 00 00] = -1.6666666500000001e-127

=== DIVERGENCE ANALYSIS ===
Run A PC trace length: 253
Run B PC trace length: 918
DIVERGENCE at PC trace index 24:
  Run A PC: 0x08471b
  Run B PC: 0x099b1c
  Run A context (idx 19..29):
    [0x0846ee, 0x0846f2, 0x08470a, 0x082be2, 0x084716, 0x08471b, 0x08472c, 0x084735, 0x08473d, 0x04c885, 0x084748]
  Run B context (idx 19..29):
    [0x0846ee, 0x0846f2, 0x08470a, 0x082be2, 0x084716, 0x099b1c, 0x061d3a, 0x061db2, 0x03e1b4, 0x03e1be, 0x03e187]
  NEAR ChkFindSym call site (Run A index 5)

=== SUMMARY COMPARISON ===
                      Run A (with var)      Run B (no var)
  Steps:              253                   918
  Termination:        return_hit            return_hit
  errNo:              0x00                  0x8d
  OP1 final:          [00 41 00 00 00 00 00 00 00]    [00 80 50 00 00 00 00 00 00]
  OP1 decoded:        0                     5
  begPC:              0xd1a883              0xd00800
  curPC:              0xd1a884              0xd00804
  endPC:              0xd1a882              0xd00803
  ChkFindSym idx:    5                     5
  Carry (F bit 0):   1                     1
```
