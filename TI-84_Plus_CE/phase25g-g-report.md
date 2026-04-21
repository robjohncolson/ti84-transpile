# Phase 25G-g — _GetCSC Map from 0x0159C0

Brute-force sweep of all 64 keyboard-matrix cells through the scanner at
`0x0159C0`, capturing the raw scan code the scanner loads into `B`.

- Probe: `TI-84_Plus_CE/probe-phase25g-g-getcsc-map.mjs`
- Probe stdout: `TI-84_Plus_CE/phase25g-g-probe.out`
- JSON map: `TI-84_Plus_CE/phase25g-g-map.json`
- Per-cell results: `TI-84_Plus_CE/phase25g-g-results.json`

## Setup

CPU + memory initialization reproduces the Phase 99d golden-regression boot
chain:

1. Cold boot from `0x000000` in `z80` mode (20000 max steps).
   - Terminated at `lastPc=0x0019B5` after `3025` steps.
2. Fresh stack sentinel at `0xD1A87B..0xD1A87D = 0xFF`.
3. Explicit kernel init at `0x08C331` in `adl` (100000 max steps).
4. `mbase=0xD0`, `iy=0xD00080`, fresh stack sentinel.
5. Post-init at `0x0802B2` in `adl` (100 max steps).

After init, `peripherals.keyboard.keyMatrix` is reset to `0xFF`,
`setKeyboardIRQ(false)`, and the CPU + memory + keyboard state are
snapshot-copied for per-iteration restore.

For each `(sdkGroup, bit)` in `8 × 8`:

- Restore snapshot (CPU fields, full 16 MiB memory, keyMatrix, groupSelect).
- Reprime: `halted=false`, `madl=true`, `iff1=iff2=0`.
- `iy = 0xE00800` — the scanner reads the keyboard MMIO via `IY+offset`. This
  was the missing piece; without it the scanner polled unrelated RAM and ran
  out of steps at 160k blocks returning `0x40` for every cell.
- Push a 3-byte `0xFFFFFF` sentinel onto `sp` so the scanner's final `RET`
  lands on a missing block and terminates cleanly.
- Assert key: `keyMatrix.fill(0xFF)`, then
  `keyMatrix[7 - sdkGroup] &= ~(1 << bit)` (reversal rule from
  `keyboard-matrix.md`). `groupSelect = 0x00`. `setKeyboardIRQ(true)`.
- Run `executor.runFrom(0x0159C0, 'adl', { maxSteps: 500, maxLoopIterations: 10000 })`.
- Capture `cpu.b` at `pc == 0x015AD2` — this mirrors probe-phase25g-d-index.
  That PC is where the scanner has just loaded the raw matrix scan into `B`
  from the MMIO read. The capture throws a `STOP_CAPTURE` to exit the loop
  deterministically in ~6 lifted blocks per iteration.

Two scan code conventions appear:

- `rawScan` — task's formula `(sdkGroup << 4) | bit`. Labels the cell using
  SDK `kb_Data` group numbering.
- `rawScanMmio` — scanner's actual return value `((7 - sdkGroup) << 4) | bit`.
  Matches the "Scan Code" column in `keyboard-matrix.md`, which is indexed by
  MMIO `keyMatrix[N]` position rather than SDK group.

The `physicalLabel` below is looked up by `rawScanMmio`, which is the value
that keyboard-matrix.md's table keys on.

## Results

Sorted by `getcscCode` ascending (= `rawScanMmio`):

| sdkGroup | bit | rawScan | rawScanMmio | physicalLabel | getcscCode | blocks | terminated |
|---:|---:|---:|---:|:---|---:|---:|:---|
| 7 | 0 | 0x70 | 0x00 | DOWN | 0x00 | 6 | captured@015AD2 |
| 7 | 1 | 0x71 | 0x01 | LEFT | 0x01 | 6 | captured@015AD2 |
| 7 | 2 | 0x72 | 0x02 | RIGHT | 0x02 | 6 | captured@015AD2 |
| 7 | 3 | 0x73 | 0x03 | UP | 0x03 | 6 | captured@015AD2 |
| 7 | 4 | 0x74 | 0x04 | key0x04 | 0x04 | 6 | captured@015AD2 |
| 7 | 5 | 0x75 | 0x05 | key0x05 | 0x05 | 6 | captured@015AD2 |
| 7 | 6 | 0x76 | 0x06 | key0x06 | 0x06 | 6 | captured@015AD2 |
| 7 | 7 | 0x77 | 0x07 | key0x07 | 0x07 | 6 | captured@015AD2 |
| 6 | 0 | 0x60 | 0x10 | ENTER | 0x10 | 6 | captured@015AD2 |
| 6 | 1 | 0x61 | 0x11 | + | 0x11 | 6 | captured@015AD2 |
| 6 | 2 | 0x62 | 0x12 | - | 0x12 | 6 | captured@015AD2 |
| 6 | 3 | 0x63 | 0x13 | x | 0x13 | 6 | captured@015AD2 |
| 6 | 4 | 0x64 | 0x14 | / | 0x14 | 6 | captured@015AD2 |
| 6 | 5 | 0x65 | 0x15 | ^ | 0x15 | 6 | captured@015AD2 |
| 6 | 6 | 0x66 | 0x16 | CLEAR | 0x16 | 6 | captured@015AD2 |
| 6 | 7 | 0x67 | 0x17 | key0x17 | 0x17 | 6 | captured@015AD2 |
| 5 | 0 | 0x50 | 0x20 | (-) | 0x20 | 6 | captured@015AD2 |
| 5 | 1 | 0x51 | 0x21 | 3 | 0x21 | 6 | captured@015AD2 |
| 5 | 2 | 0x52 | 0x22 | 6 | 0x22 | 6 | captured@015AD2 |
| 5 | 3 | 0x53 | 0x23 | 9 | 0x23 | 6 | captured@015AD2 |
| 5 | 4 | 0x54 | 0x24 | ) | 0x24 | 6 | captured@015AD2 |
| 5 | 5 | 0x55 | 0x25 | TAN | 0x25 | 6 | captured@015AD2 |
| 5 | 6 | 0x56 | 0x26 | VARS | 0x26 | 6 | captured@015AD2 |
| 5 | 7 | 0x57 | 0x27 | key0x27 | 0x27 | 6 | captured@015AD2 |
| 4 | 0 | 0x40 | 0x30 | . | 0x30 | 6 | captured@015AD2 |
| 4 | 1 | 0x41 | 0x31 | 2 | 0x31 | 6 | captured@015AD2 |
| 4 | 2 | 0x42 | 0x32 | 5 | 0x32 | 6 | captured@015AD2 |
| 4 | 3 | 0x43 | 0x33 | 8 | 0x33 | 6 | captured@015AD2 |
| 4 | 4 | 0x44 | 0x34 | ( | 0x34 | 6 | captured@015AD2 |
| 4 | 5 | 0x45 | 0x35 | COS | 0x35 | 6 | captured@015AD2 |
| 4 | 6 | 0x46 | 0x36 | PRGM | 0x36 | 6 | captured@015AD2 |
| 4 | 7 | 0x47 | 0x37 | STAT | 0x37 | 6 | captured@015AD2 |
| 3 | 0 | 0x30 | 0x40 | 0 | 0x40 | 6 | captured@015AD2 |
| 3 | 1 | 0x31 | 0x41 | 1 | 0x41 | 6 | captured@015AD2 |
| 3 | 2 | 0x32 | 0x42 | 4 | 0x42 | 6 | captured@015AD2 |
| 3 | 3 | 0x33 | 0x43 | 7 | 0x43 | 6 | captured@015AD2 |
| 3 | 4 | 0x34 | 0x44 | , | 0x44 | 6 | captured@015AD2 |
| 3 | 5 | 0x35 | 0x45 | SIN | 0x45 | 6 | captured@015AD2 |
| 3 | 6 | 0x36 | 0x46 | APPS | 0x46 | 6 | captured@015AD2 |
| 3 | 7 | 0x37 | 0x47 | X,T,theta,n | 0x47 | 6 | captured@015AD2 |
| 2 | 0 | 0x20 | 0x50 | key0x50 | 0x50 | 6 | captured@015AD2 |
| 2 | 1 | 0x21 | 0x51 | STO-> | 0x51 | 6 | captured@015AD2 |
| 2 | 2 | 0x22 | 0x52 | LN | 0x52 | 6 | captured@015AD2 |
| 2 | 3 | 0x23 | 0x53 | LOG | 0x53 | 6 | captured@015AD2 |
| 2 | 4 | 0x24 | 0x54 | x^2 | 0x54 | 6 | captured@015AD2 |
| 2 | 5 | 0x25 | 0x55 | x^-1 | 0x55 | 6 | captured@015AD2 |
| 2 | 6 | 0x26 | 0x56 | MATH | 0x56 | 6 | captured@015AD2 |
| 2 | 7 | 0x27 | 0x57 | ALPHA | 0x57 | 6 | captured@015AD2 |
| 1 | 0 | 0x10 | 0x60 | GRAPH | 0x60 | 6 | captured@015AD2 |
| 1 | 1 | 0x11 | 0x61 | TRACE | 0x61 | 6 | captured@015AD2 |
| 1 | 2 | 0x12 | 0x62 | ZOOM | 0x62 | 6 | captured@015AD2 |
| 1 | 3 | 0x13 | 0x63 | WINDOW | 0x63 | 6 | captured@015AD2 |
| 1 | 4 | 0x14 | 0x64 | Y= | 0x64 | 6 | captured@015AD2 |
| 1 | 5 | 0x15 | 0x65 | 2ND | 0x65 | 6 | captured@015AD2 |
| 1 | 6 | 0x16 | 0x66 | MODE | 0x66 | 6 | captured@015AD2 |
| 1 | 7 | 0x17 | 0x67 | DEL | 0x67 | 6 | captured@015AD2 |
| 0 | 0 | 0x00 | 0x70 | key0x70 | 0x70 | 6 | captured@015AD2 |
| 0 | 1 | 0x01 | 0x71 | key0x71 | 0x71 | 6 | captured@015AD2 |
| 0 | 2 | 0x02 | 0x72 | key0x72 | 0x72 | 6 | captured@015AD2 |
| 0 | 3 | 0x03 | 0x73 | key0x73 | 0x73 | 6 | captured@015AD2 |
| 0 | 4 | 0x04 | 0x74 | key0x74 | 0x74 | 6 | captured@015AD2 |
| 0 | 5 | 0x05 | 0x75 | key0x75 | 0x75 | 6 | captured@015AD2 |
| 0 | 6 | 0x06 | 0x76 | key0x76 | 0x76 | 6 | captured@015AD2 |
| 0 | 7 | 0x07 | 0x77 | key0x77 | 0x77 | 6 | captured@015AD2 |

## Collisions and fall-throughs

- **Fall-throughs (getcscCode = 0x00):** 1 cell.
  - `rawScan=0x70` (task formula) / `rawScanMmio=0x00` — SDK group 7, bit 0.
    Maps to `keyMatrix[0]:B0 = DOWN`. This matches
    `keyboard-matrix.md`'s note: "DOWN at G0:B0 has scan code 0x00
    (indistinguishable from no-key)".
- **Collisions (getcscCode produced by >1 rawScan):** none.

The 64 iterations produce 64 distinct `getcscCode` values in
`[0x00 .. 0x77]`, one per cell.

## Finding: scanner returns MMIO raw scan, not sequential 0x01–0x38

The task prompt called this the "sequential 0x01–0x38 _GetCSC code", but the
scanner at `0x0159C0` in this ROM returns the **raw MMIO scan code** — the
same 8-bit value `(mmioIndex << 4) | bit` that `keyboard-matrix.md` already
documents, not the compact 0x01–0x38 plane-index form used by the
`0x09F79B` translation table.

The sequential 0x01–0x38 form (`index = group*8 + bit + 1`) is produced
downstream by the lookup path explored in `probe-phase25g-d-index.mjs` at
`0x02FF0B`, which reads the translation table at `0x09F79B` to convert the
raw scan into modifier-aware OS key codes. Phase 25G-g confirms that
upstream of that lookup, `0x0159C0` emits the raw MMIO scan directly.

## Golden regression

```
  r39 c1: passCount=0 exactMatches=18 knownChars=26 unknowns=0 text="ncrra) F)cat Aadiar       "
  r39 c2: passCount=3 exactMatches=26 knownChars=26 unknowns=0 text="Normal Float Radian       "
  r39 c3: passCount=1 exactMatches=21 knownChars=24 unknowns=2 text="?op?al Float Rajiap       "
  r39 c4: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="]z tst -tzsL 7s]ts~       "
  r40 c0: passCount=0 exactMatches=9 knownChars=22 unknowns=4 text=""::#?] t]:?| K?r]?:       "
  r40 c1: passCount=0 exactMatches=9 knownChars=24 unknowns=2 text="?n:rF) r)nF( ?Fn)Fr       "
  r40 c2: passCount=0 exactMatches=19 knownChars=26 unknowns=0 text="Normgl Flogt Hgo|gn       "
  r40 c3: passCount=0 exactMatches=11 knownChars=19 unknowns=7 text="??rp?(  (??k R?j(?p       "
  r40 c4: passCount=0 exactMatches=9 knownChars=21 unknowns=5 text="") ??t  t)?L -?Jt?~       "
  r51 c0: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c1: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c2: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c3: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c4: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
bestMatch=row39 col2
decoded="Normal Float Radian       "
assert Normal: PASS
assert Float: PASS
assert Radian: PASS
```
