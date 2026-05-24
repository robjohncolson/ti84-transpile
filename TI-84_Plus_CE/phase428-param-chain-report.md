# Phase 428 — Parameter Chain Trace for 0x00DF73

## Key Finding: NOT a linked-list parameter chain — it's a 6-argument stack ABI + descriptor-internal link walk

Session 427 described 0x00DF73 as reading configuration from a "linked parameter chain" via `LD IX,(IX+0x06)`. The actual mechanism is:

1. **0x00DF73 takes 6 stack-passed arguments** (pushed as BC values before each CALL)
2. **The first argument is a descriptor base address** (from D13FD8/D13FDB/D13FDE/D13FE1)
3. **`LD IX,(IX+0x06)` walks the descriptor slab's own internal links** — these are the +6 next pointers within the 32-byte descriptor nodes in slab memory starting at D14017
4. **The chain is NOT built by the bootstrap function** — it already exists in the slab memory after `CALL 0x00285F` (which is `_bzero`, zeroing 0x780 bytes at D14017)

## Full Function: 0x00E2EB–0x00E4E7 (509 bytes, not 0x00E383)

The function previously attributed as "0x00E383 initializer" is actually the middle of the same function (0x00E2EB). It has a single entry, a single RET at 0x00E4E7, called from 0x00CD6C.

## The 4 CALL Sites and Their Arguments

Each call pushes 6 values (bottom-to-top = arg1-to-arg6):

### Call 1: 0x00E3B5 — Descriptor Base A
```
PUSH (D13FD8)          ; arg1: descriptor base A (= D14017, master source)
PUSH 0x000001          ; arg2: 1
PUSH 0x000000          ; arg3: 0
PUSH 0x000001          ; arg4: 1
PUSH 0x000000          ; arg5: 0
PUSH 0x000008          ; arg6: 8 (slab size? config count?)
CALL 0x00DF73
POP x6
```

### Call 2: 0x00E3D7 — Descriptor Base B
```
PUSH BC=(D13FDB)       ; arg1: descriptor base B (= D14017+0x40, via LEA IY+64)
PUSH 0x000001          ; arg2: 1 (reused from previous LD BC,1)
PUSH HL=0xD13FDB       ; arg3: address of base B pointer (NOT the value)
PUSH 0x000001          ; arg4: 1
PUSH 0x000000          ; arg5: 0
PUSH 0x000000          ; arg6: 0
PUSH 0x000040          ; arg7: 0x40 — wait, this is 7 pushes? No...
```
Actually re-examining: 6 PUSHes before each CALL, 6 POPs after. The pattern:
```
LD BC,0x40;  PUSH BC    ; arg6: 0x40
LD BC,0x00;  PUSH BC    ; arg5: 0
             PUSH BC    ; arg4: 0 (reuses BC=0)
LD BC,0x01;  PUSH BC    ; arg3: 1
LD HL,D13FDB;PUSH BC    ; arg2: 1 (reuses BC=1)
LD BC,(HL);  PUSH BC    ; arg1: value at D13FDB (= descriptor base B)
CALL 0x00DF73
```

### Call 3: 0x00E41A — Descriptor Base C
```
PUSH (D13FDE)          ; arg1: descriptor base C (= D14017+0x80)
PUSH 0x000001          ; arg2: 1
PUSH 0x000001          ; arg3: 1
PUSH 0x000000          ; arg4: 0
PUSH 0x000001          ; arg5: 1
PUSH 0x000040          ; arg6: 0x40
CALL 0x00DF73
```

### Call 4: 0x00E440 — Descriptor Base D
```
PUSH BC=(D13FE1)       ; arg1: descriptor base D (= computed from D13FDE+3 area)
PUSH 0x000001          ; arg2: 1 (reuses BC)
LD HL,D13FE1; PUSH BC  ; arg2 duplicate? actually LD HL then PUSH old BC
LD BC,(HL);  PUSH BC   ; arg1: value at D13FE1
...pattern: 0x01, 0x00, 0x02, 0x40
CALL 0x00DF73
```

## Argument Summary Table

| Call | Site   | Arg1 (descriptor) | Arg2 | Arg3 | Arg4 | Arg5 | Arg6 |
|------|--------|-------------------|------|------|------|------|------|
| 1    | 0xE3B5 | (D13FD8)=master   | 1    | 0    | 1    | 0    | 8    |
| 2    | 0xE3D7 | (D13FDB)=master+64| 1    | 1    | 0    | 0    | 0x40 |
| 3    | 0xE41A | (D13FDE)=master+128| 1   | 1    | 0    | 1    | 0x40 |
| 4    | 0xE440 | (D13FE1)=base D   | 1    | 1    | 0    | 2    | 0x40 |

## What 0x00DF73's IX+6 Walk Actually Traverses

The descriptor slab at D14017 is a 0x780-byte (1920-byte) block, zeroed by `_bzero` at 0x00E2FE. It's divided into regions:

- **D13FD8** points to the slab start (= D14017 value)
- **D13FDB** = slab + 0x40 (64 bytes into the slab, set via `LEA BC,IY+64` at 0xE38D)
- **D13FDE** = slab + 0x80 (128 bytes, set via `LD HL,(D14017); ADD HL,0x80` at 0xE3E1-0xE3EA)
- **D13FE1** = derived from D13FDE+3 region

Each 0x40-byte (64-byte) region contains **two 32-byte descriptor nodes**. The +6 offset in each node is a **pointer to the next node** in the chain. Since the slab was just zeroed, the +6 fields are all 0x000000 (NULL), meaning **the initial chain is a single-node chain** per descriptor base.

0x00DF73 walks these +6 links to read config values from each node. On first call (fresh slab), it reads from the single node and follows 0 links (NULL terminates immediately or is treated as "use defaults").

## Bootstrap Function Structure

```
0x00E2EB  LD HL,0xFFFFF7        ; allocate 9 bytes of stack frame (SP -= 9)
0x00E2EF  CALL 0x002197         ; stack frame setup helper
0x00E2F3  LD BC,0x780           ; slab size = 1920 bytes
0x00E2F8  LD BC,(D14017)        ; slab address
0x00E2FE  CALL 0x00285F         ; _bzero: zero 0x780 bytes at (D14017)
0x00E304  LD BC,(D1401D)        ; slab pool B
0x00E309  LD (D13FEA),BC        ; store slab pool B ref
0x00E30E  JR -> init loop A
          ... (loop: fill D1405C[0..0x0F] with 0x01 — 16 flag bytes)
          ... (loop: fill D1406C[0..0x05] with 0x01 — 6 flag bytes)
0x00E364  CALL 0x00E06D         ; slab alloc (2 entries?)
0x00E36E  LD (D141BE),HL        ; store result
0x00E376  CALL 0x0021C2         ; NULL check
0x00E37A  JP Z,0x00E4E3         ; if NULL, skip all init → epilogue
--- descriptor table setup ---
0x00E37E  LD BC,(D14017)        ; master source
0x00E383  LD (D13FD8),BC        ; base A = master
0x00E388  LD IY,(D14017)
0x00E38D  LEA BC,IY+64          ; base B = master + 0x40
0x00E390  LD HL,D13FDB
0x00E394  LD (HL),BC            ; store base B
--- 4x CALL 0x00DF73 with different descriptor bases ---
--- post-init: merge flags from base B into base A bytes 0-3 ---
0x00E4E3  LD SP,IX              ; epilogue
0x00E4E7  RET
```

## Callers

- **0x00E2EB** called from **0x00CD6C** (single caller)
- **0x00CD6C** is in the descriptor-table builder region (session 425: 0x00CD7B, 1394 bytes)

## Conclusions

1. **No external linked-list builder exists.** The parameter chain that 0x00DF73 walks is the descriptor slab's own internal structure (32-byte nodes with +6 as next pointer).

2. **The chain starts empty (zeroed slab).** After `_bzero`, all +6 pointers are NULL. 0x00DF73 initializes each node using the 6 stack-passed config values, reading defaults where the chain terminates.

3. **The 4 calls initialize 4 descriptor table regions** (A through D), each starting at a different offset within the 1920-byte slab at D14017.

4. **The "10 nodes" from session 427** are not 10 separate parameter nodes — they are 10 successive `LD IX,(IX+0x06)` advances through the descriptor slab, following the 32-byte node chain. On fresh init, most of these follow NULL and use default values (from the stack args or hardcoded).

5. **D13FD8/D13FDB/D13FDE/D13FE1** are the 4 descriptor base pointers, each pointing into different 64-byte regions of the slab.
