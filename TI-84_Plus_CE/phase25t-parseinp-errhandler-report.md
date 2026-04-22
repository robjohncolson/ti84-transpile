# Phase 25T - ParseInp errHandler Probe

## Goal

Call `ParseInp` at `0x099914` with tokenized `2+3`, a valid outer `errSP` recovery frame, and enough parser/FPS state that TI-OS error unwinds do not crash out of the transpiled ROM.

## PushErrorHandler Contract

- Jump-table entry `0x020798` resolves to `0x061def` (`PushErrorHandler`).
- `JError` at `0x061db2` still uses the simple outer contract: `ld sp, (errSP) ; pop af ; ret`.
- The full `PushErrorHandler` frame is larger than the minimal outer catch frame. After `ld (errSP), sp`, the words at the saved `errSP` slot are, in order: cleanup word `0x061e27`, error-restore target `0x061dd1`, `OPS - OPBase`, `FPS - FPSbase`, previous `errSP`, and the caller's saved `HL` payload.
- On the error path, `JError` discards the first word with `pop af`, then `ret` lands at `0x061dd1`, which restores `OPS`, `FPS`, the previous `errSP`, reloads `errNo` into `A`, and returns.
- `0x061e27` is the normal-return cleanup stub, and `0x061e20` is the explicit `PopErrorHandler` helper.

```text
0x061DEF: d1                 pop de
0x061DF0: e5                 push hl
0x061DF1: 2a e0 08 d0        ld hl, (0xD008E0)
0x061DF5: e5                 push hl
0x061DF6: ed 4b 8a 25 d0     ld bc, (0xD0258A)
0x061DFB: 2a 8d 25 d0        ld hl, (0xD0258D)
0x061DFF: b7                 or a
0x061E00: ed 42              sbc hl, bc
0x061E02: e5                 push hl
0x061E03: ed 4b 90 25 d0     ld bc, (0xD02590)
0x061E08: 2a 93 25 d0        ld hl, (0xD02593)
0x061E0C: ed 42              sbc hl, bc
0x061E0E: e5                 push hl
0x061E0F: 21 d1 1d 06        ld hl, 0x061DD1
0x061E13: e5                 push hl
0x061E14: 21 27 1e 06        ld hl, 0x061E27
0x061E18: e5                 push hl
0x061E19: ed 73 e0 08 d0     ld (0xD008E0), sp
0x061E1E: eb                 ex de, hl
0x061E1F: e9                 jp (hl)
0x061E20: c1                 pop bc
0x061E21: ed 7b e0 08 d0     ld sp, (0xD008E0)
0x061E26: c9                 ret
0x061E27: f1                 pop af
0x061E28: f1                 pop af
0x061E29: f1                 pop af
0x061E2A: e3                 ex (sp), hl
0x061E2B: 22 e0 08 d0        ld (0xD008E0), hl
0x061E2F: e1                 pop hl
0x061E30: f1                 pop af
0x061E31: c5                 push bc
0x061E32: c9                 ret
```

## Probe Setup

- Token buffer @ `0xd1a881`: `32 70 33 3f`
- `OP1` pre-seeded as real var `A`: `00 41 00 00 00 00 00 00 00`
- Parser pointers before call: OPBase=0xd1a881 OPS=0xd1a881 pTemp=0xd1a8a1 progPtr=0xd1a8a4
- FPS pointers before call: FPSbase=0xd1a8c1 FPS=0xd1a8c1
- Main return frame @ `0xd1a86f`: `fe ff 7f`
- Outer catch frame @ `0xd1a869`: `00 00 00 fa ff 7f`
- `errSP` before call: `0xd1a869`

## Outcome

- Classification: **PASS**
- returnHit=true
- errCaught=false
- termination=return_hit
- finalPc=`0x7ffffe`
- steps=85312
- blockCount=85312
- errNo after call: `0x8e (ErrMemory)`
- errSP after call: `0xd1a869`
- SP after call: `0xd1a86f`
- OP1 post-call: `00 41 00 00 00 00 00 00 00`
- OP1 decoded via readReal: 0
- Parser pointers after call: OPBase=0xd1a881 OPS=0xd1a881 pTemp=0xd1a8a1 progPtr=0xd1a8a4
- FPS pointers after call: FPSbase=0xd1a8c1 FPS=0xd1a8c1
- Interesting events: `0x061d3a (ErrUndefined dispatch) -> 0x061db2 (JError) -> 0x061d3e (ErrMemory dispatch) -> 0x061db2 (JError) -> 0x7ffffe (FAKE_RET)`
- Recent PCs: `0x08471b 0x084723 0x084711 0x082be2 0x084716 0x08471b 0x084723 0x084711 0x082be2 0x084716 0x08471b 0x084723 0x084711 0x082be2 0x084716 0x099b1c 0x061d3a 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba 0x099929 0x09beed 0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c3 0x08226f 0x082273 0x082287 0x08229c 0x082282 0x082287 0x08229c 0x082282 0x082287 0x08229c 0x082282 0x082287 0x08229c 0x082282 0x0822a2 0x082bb9 0x082bba 0x061d3e 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba 0x7ffffe`
- Missing blocks: `(none)`

## Interpretation

ParseInp no longer crashes or spins once `OPBase/OPS`, `pTemp/progPtr`, and `FPSbase/FPS` are seeded to valid RAM. The top-level call returned cleanly to `0x7ffffe`.
The outer catch frame at `0x7ffffa` was **not** used. The observed event trace still passes through `0x061d3a`, `0x061db2`, and `0x061d3e`, so the most likely explanation is that ParseInp or one of its callees installs an internal PushErrorHandler frame and recovers there once the outer parser/FPS state is valid.
The probe therefore answers the crash question but not the expression-evaluation question: `OP1` stayed as the real-variable name `A`, and `readReal(OP1)` still decodes as `0`.

## Console Output

```text
=== Phase 25T: ParseInp with outer errSP frame and seeded parser/FPS state ===
boot: steps=3025 term=halt lastPc=0x0019b5
input bytes @ 0xd1a881: [32 70 33 3f]
OP1 pre-call @ 0xd005f8 [00 41 00 00 00 00 00 00 00]
parser pointers before call: OPBase=0xd1a881 OPS=0xd1a881 pTemp=0xd1a8a1 progPtr=0xd1a8a4
FPS pointers before call:    FPSbase=0xd1a8c1 FPS=0xd1a8c1
main return frame @ 0xd1a86f [fe ff 7f]
outer err frame @ 0xd1a869 [00 00 00 fa ff 7f]
errSP slot @ 0xd008e0 -> 0xd1a869
ParseInp returned to FAKE_RET @ 0x7ffffe
errNo after call: 0x8e (ErrMemory)
OP1 post-call @ 0xd005f8 [00 41 00 00 00 00 00 00 00]
OP1 decoded via readReal: 0
parser pointers after call: OPBase=0xd1a881 OPS=0xd1a881 pTemp=0xd1a8a1 progPtr=0xd1a8a4
FPS pointers after call:    FPSbase=0xd1a8c1 FPS=0xd1a8c1
interesting events: 0x061d3a (ErrUndefined dispatch) -> 0x061db2 (JError) -> 0x061d3e (ErrMemory dispatch) -> 0x061db2 (JError) -> 0x7ffffe (FAKE_RET)
recent PCs: 0x08471b 0x084723 0x084711 0x082be2 0x084716 0x08471b 0x084723 0x084711 0x082be2 0x084716 0x08471b 0x084723 0x084711 0x082be2 0x084716 0x099b1c 0x061d3a 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba 0x099929 0x09beed 0x082bb5 0x082266 0x04c92e 0x08226b 0x0820b5 0x0820c3 0x08226f 0x082273 0x082287 0x08229c 0x082282 0x082287 0x08229c 0x082282 0x082287 0x08229c 0x082282 0x082287 0x08229c 0x082282 0x0822a2 0x082bb9 0x082bba 0x061d3e 0x061db2 0x03e1b4 0x03e1be 0x03e187 0x03e190 0x03e193 0x03e1b2 0x03e1ca 0x03e1d4 0x061dba 0x7ffffe
result=PASS
```
