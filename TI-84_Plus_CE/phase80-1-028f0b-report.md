# Phase 80-1 - Direct 0x028f0b Probe

Harness: boot -> OS init -> SetTextFgColor -> snapshot/restore -> direct entry probe.

## Results

| probe | entry | drawn | fg | bg | bbox | steps | termination |
|-------|-------|------:|---:|---:|------|------:|-------------|
| `028f0b_radian` | 0x028f0b | 252 | 180 | 72 | r18-35 c180-193 | 850 | missing_block |
| `028f0b_degree` | 0x028f0b | 252 | 172 | 80 | r18-35 c180-193 | 849 | missing_block |
| `028f0b_normal` | 0x028f0b | 252 | 180 | 72 | r18-35 c180-193 | 838 | missing_block |
| `028f0b_float` | 0x028f0b | 252 | 220 | 32 | r18-35 c180-193 | 822 | missing_block |
| `029374_radian` | 0x029374 | 0 | 0 | 0 | none | 8 | missing_block |
| `029374_degree` | 0x029374 | 0 | 0 | 0 | none | 8 | missing_block |

## Block Trace

### 028f0b_radian

- Entry: 0x028f0b
- Lifted run entry: 0x028f0a
- Note: RADIAN direct
- Registers: A=0x91, HL=0x029132
- Stats: drawn=252, fg=180, bg=72, bbox=r18-35 c180-193
- Steps: 850
- Termination: missing_block
- Last PC: 0xffffff:adl
- Hit 0x0a1cac: yes
- Hit 0x0a1b5b: yes
- Hit 0x0a1799: yes
- First 15 blocks: 0x028f0a -> 0x0a1cac -> 0x0a1cb9 -> 0x0a1b5b -> 0x0a1b77 -> 0x0a1799 -> 0x0a17aa -> 0x0a237e -> 0x0a2a37 -> 0x0a2389 -> 0x0a17ae -> 0x0a17b2 -> 0x0a17b8 -> 0x07bf3e -> 0x07bf44

### 028f0b_degree

- Entry: 0x028f0b
- Lifted run entry: 0x028f0a
- Note: DEGREE direct
- Registers: A=0x92, HL=0x029139
- Stats: drawn=252, fg=172, bg=80, bbox=r18-35 c180-193
- Steps: 849
- Termination: missing_block
- Last PC: 0xffffff:adl
- Hit 0x0a1cac: yes
- Hit 0x0a1b5b: yes
- Hit 0x0a1799: yes
- First 15 blocks: 0x028f0a -> 0x0a1cac -> 0x0a1cb9 -> 0x0a1b5b -> 0x0a1b77 -> 0x0a1799 -> 0x0a17aa -> 0x0a237e -> 0x0a2a37 -> 0x0a2389 -> 0x0a17ae -> 0x0a17b2 -> 0x0a17b8 -> 0x07bf3e -> 0x07bf44

### 028f0b_normal

- Entry: 0x028f0b
- Lifted run entry: 0x028f0a
- Note: Normal token name
- Registers: A=0x4f, HL=0x0a0467
- Stats: drawn=252, fg=180, bg=72, bbox=r18-35 c180-193
- Steps: 838
- Termination: missing_block
- Last PC: 0xffffff:adl
- Hit 0x0a1cac: yes
- Hit 0x0a1b5b: yes
- Hit 0x0a1799: yes
- First 15 blocks: 0x028f0a -> 0x0a1cac -> 0x0a1cb9 -> 0x0a1b5b -> 0x0a1b77 -> 0x0a1799 -> 0x0a17aa -> 0x0a237e -> 0x0a2a37 -> 0x0a2389 -> 0x0a17ae -> 0x0a17b2 -> 0x0a17b8 -> 0x07bf3e -> 0x07bf44

### 028f0b_float

- Entry: 0x028f0b
- Lifted run entry: 0x028f0a
- Note: Float token name
- Registers: A=0x52, HL=0x0a0479
- Stats: drawn=252, fg=220, bg=32, bbox=r18-35 c180-193
- Steps: 822
- Termination: missing_block
- Last PC: 0xffffff:adl
- Hit 0x0a1cac: yes
- Hit 0x0a1b5b: yes
- Hit 0x0a1799: yes
- First 15 blocks: 0x028f0a -> 0x0a1cac -> 0x0a1cb9 -> 0x0a1b5b -> 0x0a1b77 -> 0x0a1799 -> 0x0a17aa -> 0x0a237e -> 0x0a2a37 -> 0x0a2389 -> 0x0a17ae -> 0x0a17b2 -> 0x0a17b8 -> 0x07bf3e -> 0x07bf44

### 029374_radian

- Entry: 0x029374
- Lifted run entry: 0x029374
- Note: middle phase
- Registers: A=0x91, HL=0x029132
- Stats: drawn=0, fg=0, bg=0, bbox=none
- Steps: 8
- Termination: missing_block
- Last PC: 0xffffff:adl
- Hit 0x0a1cac: no
- Hit 0x0a1b5b: no
- Hit 0x0a1799: no
- First 15 blocks: 0x029374 -> 0x029379 -> 0x029379 -> 0x029379 -> 0x029379 -> 0x029379 -> 0x029379 -> 0x02937f

### 029374_degree

- Entry: 0x029374
- Lifted run entry: 0x029374
- Note: middle phase
- Registers: A=0x92, HL=0x029139
- Stats: drawn=0, fg=0, bg=0, bbox=none
- Steps: 8
- Termination: missing_block
- Last PC: 0xffffff:adl
- Hit 0x0a1cac: no
- Hit 0x0a1b5b: no
- Hit 0x0a1799: no
- First 15 blocks: 0x029374 -> 0x029379 -> 0x029379 -> 0x029379 -> 0x029379 -> 0x029379 -> 0x029379 -> 0x02937f

## ASCII Previews

### 028f0b_radian (0x028f0b, drawn=252, bbox=r18-35 c180-193)

First 15 blocks: 0x028f0a -> 0x0a1cac -> 0x0a1cb9 -> 0x0a1b5b -> 0x0a1b77 -> 0x0a1799 -> 0x0a17aa -> 0x0a237e -> 0x0a2a37 -> 0x0a2389 -> 0x0a17ae -> 0x0a17b2 -> 0x0a17b8 -> 0x07bf3e -> 0x07bf44

```
##############
##############
##.......#####
##........####
##..####...###
##..#####..###
##..######..##
##..######..##
##..######..##
##..######..##
##..######..##
##..######..##
##..#####..###
##..####...###
##........####
##.......#####
##############
##############
```

### 028f0b_degree (0x028f0b, drawn=252, bbox=r18-35 c180-193)

First 15 blocks: 0x028f0a -> 0x0a1cac -> 0x0a1cb9 -> 0x0a1b5b -> 0x0a1b77 -> 0x0a1799 -> 0x0a17aa -> 0x0a237e -> 0x0a2a37 -> 0x0a2389 -> 0x0a17ae -> 0x0a17b2 -> 0x0a17b8 -> 0x07bf3e -> 0x07bf44

```
##############
##############
##........####
##.........###
##..#####...##
##..######..##
##..######..##
##..######..##
##..#####...##
##.........###
##........####
##..##...#####
##..###...####
##..####...###
##..#####...##
##..######..##
##############
##############
```

### 028f0b_normal (0x028f0b, drawn=252, bbox=r18-35 c180-193)

First 15 blocks: 0x028f0a -> 0x0a1cac -> 0x0a1cb9 -> 0x0a1b5b -> 0x0a1b77 -> 0x0a1799 -> 0x0a17aa -> 0x0a237e -> 0x0a2a37 -> 0x0a2389 -> 0x0a17ae -> 0x0a17b2 -> 0x0a17b8 -> 0x07bf3e -> 0x07bf44

```
##############
##############
####......####
###........###
##...####...##
##..######..##
##..##########
##...#########
###.......####
####.......###
#########...##
##########..##
##..######..##
##...####...##
###........###
####......####
##############
##############
```

### 028f0b_float (0x028f0b, drawn=252, bbox=r18-35 c180-193)

First 15 blocks: 0x028f0a -> 0x0a1cac -> 0x0a1cb9 -> 0x0a1b5b -> 0x0a1b77 -> 0x0a1799 -> 0x0a17aa -> 0x0a237e -> 0x0a2a37 -> 0x0a2389 -> 0x0a17ae -> 0x0a17b2 -> 0x0a17b8 -> 0x07bf3e -> 0x07bf44

```
##############
##############
######....####
######.....###
##########..##
##########..##
########...###
########...###
##########..##
##########..##
######.....###
######....####
##############
##############
##############
##############
##############
##############
```

## Verdict

Direct 0x028f0b angle probes did not produce a clear text-sized render, so the RADIAN/DEGREE end-to-end path is still not confirmed by this probe.
Token-name inputs did not show a clear text-like render at 0x028f0b.
The 0x029374 comparison matched 0/2 direct angle probes on drawn/fg/bg/bbox stats.
This means the direct 0x028f0b tail entry and the 0x029374 middle-phase entry are observably different in the current harness.
Bottom line: no end-to-end confirmation yet; this run did not show convincing direct text output from 0x028f0b.