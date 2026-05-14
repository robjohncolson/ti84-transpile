# Phase 320 - Graph Key Handler Pair (0x0092B7 / 0x042782)

## Summary

- Verified the session 319 claim exactly.
- Both copies load `D177B9`, compare it to `0x13`, and branch on that test.
- If `D177B9 == 0x13`, they dispatch `dispatch_key(0x97, 0x13)`.
- If `D177B9 != 0x13`, they dispatch `dispatch_key(0x06, 0x03)`.
- After either branch, both copies check `D1407E`; if it is nonzero they also dispatch `dispatch_key(0x10, 0x03)`.
- `0x97` is a known key code for `9` in the extracted key/token tables.
- `0x06` does not appear there as a physical key code. In the D177B9 state map it belongs to state `0x03` (`Window / Format`) and is best interpreted as an internal Window/Format field selector, not as `Trace` or `Graph`.

## 1. Low-ROM Copy

The enclosing low-ROM wrapper starts at `0x009286`. The actual aligned instruction start for the `D177B9` test arm is `0x0092B3`; the user-named PC `0x0092B7` is the `LD A,(D177B9)` read inside that arm.

### Wrapper entry (`0x009286`)

```text
0x009286  21 FF FF FF      ld hl, 0xFFFFFF
0x00928A  CD 97 21 00      call 0x002197
0x00928E  DD 36 FF 01      ld (ix-1), 0x01
0x009292  3A B8 77 D1      ld a, (0xD177B8)
0x009296  B7               or a
0x009297  ED 62            sbc hl, hl
0x009299  6F               ld l, a
0x00929A  CD 1B 21 00      call 0x00211B
```

Immediately after the helper call is inline switch data. The bytes:

```text
0x0092A9  B3 92 00 10
```

are consistent with a case arm targeting `0x0092B3` for selector `0x10`.

### Graph-key arm (`0x0092B3`)

```text
0x0092B3  ED 57            ld a, i
0x0092B5  F5               push af
0x0092B6  F3               di
0x0092B7  3A B9 77 D1      ld a, (0xD177B9)
0x0092BB  FE 13            cp 0x13
0x0092BD  20 12            jr nz, 0x0092D1

0x0092BF  01 13 00 00      ld bc, 0x000013
0x0092C3  C5               push bc
0x0092C4  01 97 00 00      ld bc, 0x000097
0x0092C8  C5               push bc
0x0092C9  CD 3C 88 00      call 0x00883C
0x0092CD  C1               pop bc
0x0092CE  C1               pop bc
0x0092CF  18 10            jr 0x0092E1

0x0092D1  01 03 00 00      ld bc, 0x000003
0x0092D5  C5               push bc
0x0092D6  01 06 00 00      ld bc, 0x000006
0x0092DA  C5               push bc
0x0092DB  CD 3C 88 00      call 0x00883C
0x0092DF  C1               pop bc
0x0092E0  C1               pop bc

0x0092E1  3A 7E 40 D1      ld a, (0xD1407E)
0x0092E5  B7               or a
0x0092E6  28 10            jr z, 0x0092F8
0x0092E8  01 03 00 00      ld bc, 0x000003
0x0092EC  C5               push bc
0x0092ED  01 10 00 00      ld bc, 0x000010
0x0092F1  C5               push bc
0x0092F2  CD 3C 88 00      call 0x00883C
0x0092F6  C1               pop bc
0x0092F7  C1               pop bc

0x0092F8  F1               pop af
0x0092F9  E2 FE 92 00      jp po, 0x0092FE
0x0092FD  FB               ei
0x0092FE  18 4D            jr 0x00934D
```

### Shared low-ROM epilogue

```text
0x00934D  DD 7E FF         ld a, (ix-1)
0x009350  DD F9            ld sp, ix
0x009352  DD E1            pop ix
0x009354  C9               ret
```

### Low-ROM behavior

- `D177B9 == 0x13`: `dispatch_key_lowrom(0x97, 0x13)`
- `D177B9 != 0x13`: `dispatch_key_lowrom(0x06, 0x03)`
- If `D1407E != 0`: `dispatch_key_lowrom(0x10, 0x03)`

## 2. Flash Copy

The enclosing flash wrapper starts at `0x04274D`. The aligned instruction start for the `D177B9` test arm is `0x04277E`; the user-named PC `0x042782` is the `LD A,(D177B9)` read inside that arm.

### Wrapper entry (`0x04274D`)

```text
0x04274D  DD 36 FF 01      ld (ix-1), 0x01
0x042751  3A B8 77 D1      ld a, (0xD177B8)
0x042755  B7               or a
0x042756  ED 62            sbc hl, hl
0x042758  6F               ld l, a
0x042759  CD 24 01 00      call 0x000124
```

Immediately after the helper call is inline switch data. The bytes:

```text
0x042767  7E 27 04 0A
```

are consistent with a case arm targeting `0x04277E` for selector `0x0A`.

### Graph-key arm (`0x04277E`)

```text
0x04277E  ED 57            ld a, i
0x042780  F5               push af
0x042781  F3               di
0x042782  3A B9 77 D1      ld a, (0xD177B9)
0x042786  FE 13            cp 0x13
0x042788  20 12            jr nz, 0x04279C

0x04278A  01 13 00 00      ld bc, 0x000013
0x04278E  C5               push bc
0x04278F  01 97 00 00      ld bc, 0x000097
0x042793  C5               push bc
0x042794  CD CA 9C 04      call 0x049CCA
0x042798  C1               pop bc
0x042799  C1               pop bc
0x04279A  18 10            jr 0x0427AC

0x04279C  01 03 00 00      ld bc, 0x000003
0x0427A0  C5               push bc
0x0427A1  01 06 00 00      ld bc, 0x000006
0x0427A5  C5               push bc
0x0427A6  CD CA 9C 04      call 0x049CCA
0x0427AA  C1               pop bc
0x0427AB  C1               pop bc

0x0427AC  3A 7E 40 D1      ld a, (0xD1407E)
0x0427B0  B7               or a
0x0427B1  28 10            jr z, 0x0427C3
0x0427B3  01 03 00 00      ld bc, 0x000003
0x0427B7  C5               push bc
0x0427B8  01 10 00 00      ld bc, 0x000010
0x0427BC  C5               push bc
0x0427BD  CD CA 9C 04      call 0x049CCA
0x0427C1  C1               pop bc
0x0427C2  C1               pop bc

0x0427C3  F1               pop af
0x0427C4  E2 C9 27 04      jp po, 0x0427C9
0x0427C8  FB               ei
0x0427C9  C3 8E 28 04      jp 0x04288E
```

### Shared flash epilogue

```text
0x04288E  DD 7E FF         ld a, (ix-1)
0x042891  DD F9            ld sp, ix
0x042893  DD E1            pop ix
0x042895  C9               ret
```

### Flash behavior

- `D177B9 == 0x13`: `dispatch_key_flash(0x97, 0x13)`
- `D177B9 != 0x13`: `dispatch_key_flash(0x06, 0x03)`
- If `D1407E != 0`: `dispatch_key_flash(0x10, 0x03)`

## 3. D177B9 Comparison Logic

Both copies implement the same test:

```text
ld a, (0xD177B9)
cp 0x13
jr nz, non_graph_path
```

So `0x13` is the only state that takes the graph-specific path.

This verifies the session 319 hypothesis:

- `state == 0x13`: `dispatch_key(0x97, 0x13)`
- `state != 0x13`: `dispatch_key(0x06, 0x03)`

## 4. Caller Analysis

### Exact read PCs (`0x0092B7` / `0x042782`)

Searching the raw ROM for the exact little-endian address bytes for the read PCs:

- `B7 92 00`
- `82 27 04`

found no absolute `CALL`/`JP` references. Those are not entry-point addresses.

### Low-ROM wrapper

The enclosing low-ROM wrapper `0x009286` does have one direct call site:

```text
0x009489  FD CD 86 92 00   call 0x009286
```

Inside that wrapper, the inline dispatch table immediately after `CALL 0x00211B` contains:

```text
B3 92 00 10
```

which is consistent with routing selector `0x10` to the graph-key arm at `0x0092B3`.

### Flash wrapper

No absolute `CALL`/`JP` references were found for:

- `0x04274D`
- `0x04277E`
- `0x04277F`
- `0x042782`

The flash arm is table-driven instead. The inline dispatch table immediately after `CALL 0x000124` contains:

```text
7E 27 04 0A
```

which is consistent with routing selector `0x0A` to the graph-key arm at `0x04277E`.

The last local predecessors immediately around the read site are:

```text
0x042779  jr z, 0x04277F
0x04277C  jr z, 0x042782
```

So the flash copy is reached by local control flow plus inline table selection, not by a normal absolute call.

## 5. What `0x97` and `0x06` Mean

### `0x97`

This one has a clean cross-reference in `phase186-keytok-tables.json`:

```text
keyCode  0x97
token    0x39
name     "9"
raw key  "9" (rawScanCode 0x23)
```

So `dispatch_key(0x97, 0x13)` is dispatching the graph-active state machine with the same internal key code used for the `9` key.

This also fits the phase 318 state map, which lists graph-active (`state 0x13`) keys as:

```text
0x08, 0x96-0x9B
```

### `0x06`

No `keyCode: 0x06` entry exists in `phase186-keytok-tables.json`, so this does not look like a front-panel key code in the same sense as `0x97`.

The phase 318 state map places `0x06` in state `0x03`:

```text
state 0x03 = Window / Format
keys       = 0x06-0x11
meaning    = Xmin / Xmax / Xscl / Ymin / Ymax / Yscl / etc.
```

So the strongest supported interpretation is:

- `0x06` is an internal Window/Format selector
- it is probably the first Window/Format field, likely `Xmin`
- it is not supported as `Trace`
- it is not supported as the `Graph` key constant either

## Bottom Line

- The `D177B9 == 0x13` test is real and identical in both ROM copies.
- The `dispatch_key(0x97, 0x13)` / `dispatch_key(0x06, 0x03)` split is verified exactly.
- `0x97` maps cleanly to internal key code `9`.
- `0x06` behaves like a Window/Format-local selector, not a physical keyboard key.
- The low-ROM arm is reached from one direct caller to the enclosing wrapper plus an inline table arm.
- The flash arm is reached by inline table selection and local relative branches, with no absolute direct caller found.
