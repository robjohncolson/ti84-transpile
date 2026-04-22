# Phase 119 - 0x08C7AD (= NewContext0) Common Handler Investigation

Generated from the same data captured while building `probe-phase119-08c7ad.mjs`.

## Boot / Probe Baseline

| stage | steps | termination | lastPc |
| --- | --- | --- | --- |
| coldBoot | 300 | max_steps | 0x001c33 |
| osInit | 691 | missing_block | 0xffffff |
| postInit | 1 | missing_block | 0xffffff |

- Probe flow used the requested `300 -> 1000 -> 1000` boot sequence.
- I re-applied the requested CPU fix before the experiment snapshot so the actual probe baseline was `mbase=0xd0`, `iy=0xd00080`, `hl=0x000000`, `sp=0xd1a87b`.
- Even after init, the callback/mode slots were still unresolved: `0xD007E0=0xff`, `0xD007CD=0xffffff`, `0xD007D0=0xffffff`, `0xD007D6=0xffffff`.

## Static Disassembly

The probe script decodes the first 110 ADL instructions starting at `0x08C7AD (= NewContext0)`. The key prefix is:

```text
0x08c7ad (= NewContext0)  f5                  push af
0x08c7ae  c5                  push bc
0x08c7af  21 ff ff ff         ld hl, 0xffffff
0x08c7b3  40 22 b5 26         ld (0x0026b5), hl
0x08c7b7  11 00 00 00         ld de, 0x000000
0x08c7bb  cd 8f 5b 05         call 0x055b8f
0x08c7bf  c1                  pop bc
0x08c7c0  f1                  pop af
0x08c7c1  21 00 00 00         ld hl, 0x000000
0x08c7c5  40 22 b5 26         ld (0x0026b5), hl
0x08c7c9  fd cb 51 86         res 0, (iy+81)
0x08c7cd  fd cb 27 be         res 7, (iy+39)
0x08c7d1  fd cb 4b ae         res 5, (iy+75)
0x08c7d5  6f                  ld l, a
0x08c7d6  3e 03               ld a, 0x03
0x08c7d8  32 ae 26 d0         ld (0xd026ae), a
0x08c7dc  7d                  ld a, l
0x08c7dd  cd 05 2e 0a         call 0x0a2e05
0x08c7e1  2b                  dec hl
0x08c7e2  40 22 aa 26         ld (0x0026aa), hl
0x08c7e6  40 22 8a 26         ld (0x00268a), hl
0x08c7ea  fd cb 28 be         res 7, (iy+40)
0x08c7ee  21 e0 07 d0         ld hl, 0xd007e0
0x08c7f2  be                  cp (hl)
0x08c7f3  20 1a               jr nz, 0x08c80f
0x08c7f5  fe 44               cp 0x44
0x08c7f7  20 0f               jr nz, 0x08c808
0x08c7f9  c5                  push bc
0x08c7fa  cd ac ed 06         call 0x06edac (= GrPutAway)
0x08c7fe  fd cb 4b be         res 7, (iy+75)
0x08c802  cd d0 fc 06         call 0x06fcd0
0x08c806  c1                  pop bc
0x08c807  c9                  ret
0x08c808  fe 40               cp 0x40
0x08c80a  28 03               jr z, 0x08c80f
0x08c80c  06 27               ld b, 0x27
0x08c80e  c9                  ret
0x08c80f  c5                  push bc
0x08c810  f5                  push af
0x08c811  f1                  pop af
0x08c812  fe 3f               cp 0x3f
0x08c814  20 06               jr nz, 0x08c81c
0x08c816  3e 40               ld a, 0x40
0x08c818  f5                  push af
0x08c819  af                  xor a
0x08c81a  18 11               jr 0x08c82d
0x08c81c  f5                  push af
0x08c81d  fe bf               cp 0xbf
0x08c81f  38 04               jr c, 0x08c825
0x08c821  c6 5c               add 0x5c
0x08c823  18 08               jr 0x08c82d
0x08c825  d6 40               sub 0x40
0x08c827  20 04               jr nz, 0x08c82d
0x08c829  fd cb 0c b6         res 6, (iy+12)
0x08c82d  fd cb 3f be         res 7, (iy+63)
0x08c831  cd 4b c9 08         call 0x08c94b
0x08c835  f1                  pop af
0x08c836  e5                  push hl
0x08c837  f5                  push af
0x08c838  fd cb 0c a6         res 4, (iy+12)
0x08c83c  cd 89 c6 08         call 0x08c689 (= PPutAway)
0x08c840  f1                  pop af
0x08c841  f5                  push af
0x08c842  47                  ld b, a
0x08c843  3a e0 07 d0         ld a, (0xd007e0)
0x08c847  fe 47               cp 0x47
0x08c849  78                  ld a, b
0x08c84a  28 18               jr z, 0x08c864
0x08c84c  fd cb 09 46         bit 0, (iy+9)
0x08c850  28 12               jr z, 0x08c864
0x08c852  fd cb 11 46         bit 0, (iy+17)
0x08c856  20 0c               jr nz, 0x08c864
0x08c858  fe 57               cp 0x57
0x08c85a  28 18               jr z, 0x08c874
0x08c85c  fe 45               cp 0x45
0x08c85e  28 14               jr z, 0x08c874
0x08c860  fe 4b               cp 0x4b
0x08c862  28 10               jr z, 0x08c874
0x08c864  cd 56 e6 09         call 0x09e656
0x08c868  fe 52               cp 0x52
0x08c86a  28 08               jr z, 0x08c874
0x08c86c  cd 9e c6 08         call 0x08c69e (= PutAway)
0x08c870  cd 96 c7 08         call 0x08c796
0x08c874  3a e0 07 d0         ld a, (0xd007e0)
```

## Static Findings

- Caller `A` is the primary input. It is preserved in `L`, passed into `call 0x0A2E05`, then compared against `0x44`, `0x40`, `0x3f`, `0xbf`, `0x57`, `0x45`, `0x4b`, `0x52`, `0x4a`, and `0x46`.
- Caller `B` survives the early setup and is still used on later paths: the static slice includes `ld a, b ; cp 0x52` at `0x08C8EC`.
- RAM / flag state touched by the visible slice:
  - `0xD026B5`, `0xD026AA`, `0xD0268A`, `0xD026AE`
  - `0xD007E0` mode byte
  - many `IY+offset` state bits: `+0x51`, `+0x27`, `+0x4B`, `+0x28`, `+0x0C`, `+0x3F`, `+0x09`, `+0x11`, `+0x12`, `+0x36`, `+0x01`, `+0x02`, `+0x1D`
- The visible helper calls are state / callback / mode handlers. There is no direct `call 0x085E16 (= MenCatRet)` in the decoded `0x08C7AD (= NewContext0)` slice.
- Return behavior is mixed:
  - early direct `ret` exits at `0x08C807`, `0x08C80E`, `0x08C927`, `0x08C94A`
  - other paths dispatch indirectly through `0x08C68E -> 0x08C745 -> jp (hl)`

## Dynamic Results

| experiment | entry regs at `0x08C7AD (= NewContext0)` | steps | termReason | lastPc | unique blocks | total blocks | VRAM writes | `0x085E16 (= MenCatRet)` visited | first `0x08C7AD (= NewContext0)` step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A direct `0x08C7AD (= NewContext0) A=0x44 B=0xBC` | `A=0x44 B=0xbc C=0x00 IY=0xd00080` | 214 | `missing_block` | `0xffffff` | 165 | 214 | 0 | no | 0 |
| B direct `0x08C7AD (= NewContext0) A=0x09 B=0x09` | `A=0x09 B=0x09 C=0x00 IY=0xd00080` | 45 | `missing_block` | `0x28bffe` | 45 | 45 | 0 | no | 0 |
| C chain `0x08C4A3 key=0xBC` | `A=0x44 B=0xfb C=0x44 IY=0xd00080` | 50000 | `max_steps` | `0x006202` | 560 | 50000 | 0 | no | 14 |

### Shared Prefix

The first 15 blocks after landing in `0x08C7AD (= NewContext0)` are identical in all three experiments:

```text
0x08c7ad (= NewContext0):adl
0x055b8f:adl
0x08c7bf:adl
0x0a2e05:adl
0x08c7e1:adl
0x08c80f:adl
0x08c81c:adl
0x08c825:adl
0x08c82d:adl
0x08c94b:adl
0x08c835:adl
0x08c689 (= PPutAway):adl
0x08c840:adl
0x08c84c:adl
0x08c852:adl
```

That is the strongest dynamic evidence that `0x08C7AD (= NewContext0)` is the shared post-classification core.

### Important Divergence

- Experiment A uses the requested direct-call registers. It eventually reaches the `0x08C911 -> 0x08C926` return path and returns into the seeded `0xFFFFFF` sentinel.
- Experiment B shares the same early prefix but exits via the indirect `0x08C745` jump path and dies at `0x28BFFE`.
- Experiment C proves the real `0x08C4A3 -> 0x08C5D1 -> 0x08C7AD (= NewContext0)` chain reaches this function once after 14 setup blocks, but the live entry registers are `A=0x44, B=0xFB, C=0x44`, not `B=0xBC`. The special-key dispatcher is passing its translated key code in `B`, not the raw scan byte.
- Experiment C then falls into the same long-running `0x006202` loop seen in Phase 117.

## VRAM / Render Check

- Direct static call to `0x085E16 (= MenCatRet)` in the decoded `0x08C7AD (= NewContext0)` slice: no.
- Dynamic visit to `0x085E16 (= MenCatRet)`: no.
- VRAM writes in `0xD40000-0xD4BFFF`: zero in all three experiments.

Conclusion: `0x08C7AD (= NewContext0)` does not directly render and does not call the `0x085E16 (= MenCatRet)` home-screen loop on any tested path.

## Architectural Conclusion

- `0x08C7AD (= NewContext0)` is the common key-processing core below the `0x08C4A3` classifier split. It performs shared state cleanup, key-code normalization, mode-sensitive subdispatch, and callback setup.
- The special-key path definitely converges here. Experiment C reaches `0x08C7AD (= NewContext0)`, shares the exact same first 15 blocks as the direct probes, then continues into the deeper long-running loop.
- The function is not a renderer. It manipulates state and dispatches actions; any actual `0x085E16 (= MenCatRet)` redraw happens elsewhere.
