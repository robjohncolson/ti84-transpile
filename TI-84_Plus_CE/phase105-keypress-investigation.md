# Phase 105: Key-Press Investigation

## Scope

This report answers the Phase 105 question for the current transpiled ROM executor:

1. Where the current `_GetCSC`-like entry actually lives
2. What the ISR keyboard detour at `0x001A5D` really does
3. Where the main loop most likely picks key events up
4. Whether the current transpiler coverage is enough to make the home screen interactive

The companion probe is [`probe-phase105-getCSC.mjs`](./probe-phase105-getCSC.mjs).

## 1. `_GetCSC` trace

### Current callable entry

The prompt's `_GetCSC` hint near `0x021D18` does not match the current lifted ROM.

In the current image, the callable entry that behaves like the repo's earlier `_GetCSC` probes is:

```text
0x02010C -> jp 0x03CF7D
```

So the practical entry point for this phase is:

- trampoline: `0x02010C`
- implementation path: `0x03CF7D`

### Probe result

The companion probe boots with:

- cold boot: `0x000000` in `z80`
- explicit init: `0x08C331` in `adl`
- post-init state: `mbase = 0xD0`, `IY = 0xD00080`

It then tests the current `_GetCSC` entry against the direct keyboard scanner at `0x0159C0`.

### Scan-code results

| Key | Matrix position | Direct scan `0x0159C0` | Current `_GetCSC` `0x02010C` |
| --- | --- | --- | --- |
| `ENTER` | group `1`, bit `0` | `0x10` | `0x00` |
| `2` | group `3`, bit `1` | `0x31` | `0x00` |
| `0` | group `4`, bit `0` | `0x40` | `0x00` |
| `CLEAR` | group `1`, bit `6` | `0x16` | `0x00` |
| no key | none | `0x00` | `0x00` |

Important detail:

- the direct scan routine returns the scan code in `B`
- in the current executor, `A` also still matches that code before the tail exit
- the MMIO scan value matches the same `group << 4 | bit` encoding

Examples from the probe:

- `ENTER` -> `0x10`
- `2` -> `0x31`
- `0` -> `0x40`
- `CLEAR` -> `0x16`

### Path comparison

Pressed-key `_GetCSC` path:

```text
0x02010C
-> 0x03CF7D
-> 0x03CF85
-> 0x03CF8C
-> 0x03D184
-> 0x03D197
-> 0x03D19C
-> 0x03D1B6
```

No-key `_GetCSC` path:

```text
0x02010C
-> 0x03CF7D
-> 0x03CFA4
-> 0x03CFCF
-> 0x03CFFE
-> 0x03D0E0
```

Direct scan path:

```text
0x0159C0
-> 0x0159EE
-> 0x0159FB
-> 0x015A40
-> 0x015A8E
-> 0x015AD2
-> 0x000DB6
-> 0x000DBF
```

### Conclusion for `_GetCSC`

For the current executor, the thing at `0x02010C -> 0x03CF7D` is not the useful keyboard matrix scanner.

What actually produces the raw scan code is `0x0159C0`, not the current `_GetCSC` path.

The practical implication is simple:

- `0x0159C0` is the low-level working scanner
- `0x03CF7D` is interrupt-exit / interrupt-acknowledge machinery
- treating `0x03CF7D` as "read a key and return it in A" is wrong for this ROM snapshot

## 2. ISR keyboard handler at `0x001A5D`

`phase58-event-loop-disasm.md` already disassembled the exact IRQ loop around this region.

Observed keyboard detour:

```text
0x0019BE -> 0x0019EF -> 0x001A17 -> 0x001A5D -> 0x001A70 -> 0x001A75 -> 0x001A32 -> RETI
```

The `0x001A5D` block does this:

```text
0x001A5D  xor a
0x001A5E  set 3, a          ; A = 0x08
0x001A60  out (0x500A), a   ; acknowledge masked-status byte 2 bit 3
0x001A62  ld c, 0x06
0x001A64  in a, (0x5006)    ; read enable-mask byte 2
0x001A66  res 3, a
0x001A68  out (0x5006), a   ; clear enable bit 3
```

Then it falls into the common exit:

```text
0x001A32
  pop hl
  ld (0xD02AD7), hl
  ld iy, 0xD00080
  res 6, (iy+27)            ; clears bit 6 at 0xD0009B
  ...
  reti
```

### Does `0x001A5D` call `_GetCSC`?

No.

There is no key-matrix read in this block and no call to the direct scan routine.

### What does it do with the scan code?

Nothing. It does not obtain one.

### Does it store a key code in RAM?

Not in the visited `0x001A5D` path.

What it does store or modify is:

- restores the callback slot at `0xD02AD7`
- clears bit 6 of `0xD0009B`

That is interrupt book-keeping, not keyboard-event delivery.

## 3. Main-loop key processing lead

The strongest current lead is `0xD0058E`.

### Why `0xD0058E` matters

Many lifted blocks read `0xD0058E` and compare it against values that line up with keyboard scan codes:

- `0x0890A1` compares against `0x10`
- `0x089095` compares against `0x11`
- `0x0890AD` compares against `0x14`
- `0x085EC0` compares against `0x16`
- `0x0890B9` compares against `0x18`
- `0x0890C5` compares against `0x1D`

That is exactly what a "current key event" byte looks like.

There are also multiple writers:

- `0x08C503` writes `A` to `0xD0058E`
- `0x08763D` writes `E` to `0xD0058E`
- `0x086738` writes `A` to `0xD0058E`
- `0x05629F` writes `(ix+9)` to `0xD0058E`
- `0x0268A0` writes `E` to `0xD0058E`

And there are main-loop style gates that test whether `0xD0058E` is zero:

- `0x08C463`
- `0x08C4A3`

So the best current model is:

1. some higher-level input path normalizes a key event
2. that path stores the event code in `0xD0058E`
3. downstream logic branches on `0xD0058E`
4. action-specific code eventually updates UI state or text buffers

### Where text rendering state lives

The renderer side is much clearer than the input side.

Already established in earlier phases:

- `0xD00595` and `0xD00596` are the current text cursor row and column bytes
- `0x0059C6` is a single-character draw routine
- `0x0059E9` and `0x0A1CAC` are string walkers that repeatedly call into character rendering
- `0x0A2032` / `0x0A203C` handle line advance and wrap

Examples:

- [`probe-print-char.mjs`](./probe-print-char.mjs) calls `0x0059C6` directly after seeding `0xD00595` and `0xD00596`
- `phase63-0a1cac-investigation.md` shows `0x0A1CAC` using `0xD00595/0xD00596` as cursor bytes
- `phase77-manual-report.md` shows the older `0x0059C6` / `0x0059E9` text family using the same cursor bytes

### What this means for the home screen

The low-level character and string renderers exist.

What is missing is the specific home-entry path that takes a key event and turns it into:

- entry-line buffer mutation
- cursor update
- visible redraw in the current home-screen composition

That matches the current browser shell behavior: the entry line is still being painted synthetically, not by a recovered OS line-editor path.

## 4. Feasibility assessment

### How many missing blocks are in the key-to-display path?

This does not look like a single missing block.

The low-level pieces are already present:

- keyboard matrix emulation works
- `0xE00900` scan-code generation works
- direct scanner `0x0159C0` works
- IRQ acknowledge / dispatch blocks around `0x001A5D` are lifted
- text drawing primitives are lifted

The gap is a higher-level cluster between "raw scan exists" and "home entry line updates".

The most likely frontier is the dispatch family around:

- `0x085E16`
- `0x08C463`
- `0x08C4A3`
- `0x08C503`
- `0x0890A1`
- `0x089095`
- `0x0890AD`
- `0x0890B9`
- `0x0890C5`

So the honest answer is:

- there are enough lifted blocks to prove the route
- but the missing behavior is still at least one non-trivial dispatcher / line-editor cluster, not one tiny fix

### Is this achievable with current transpiler coverage?

Partially yes.

What is already achievable:

- reading keys faithfully at the hardware-scan level
- injecting a synthetic key event byte if we choose to bypass the missing higher-level path

What is not yet demonstrated end-to-end:

- the authentic home-screen line-editor path from key event to visible entry-line update

### What would need to be seeded or lifted next?

Most likely next steps:

1. Treat `0x0159C0` as the working scan source, not `0x03CF7D`.
2. Trace who writes `0xD0058E` during interactive OS states.
3. Probe the `0x085E16` / `0x08C463` / `0x0890xx` family with manually seeded `0xD0058E` values like `0x10`, `0x16`, `0x31`, `0x40`.
4. Watch for changes to:
   - `0xD00595`
   - `0xD00596`
   - entry-line text buffers
   - VRAM
5. Recover or seed the real home-entry renderer instead of the current synthetic entry-line fill.

## Bottom line

The current executor already has a working key scanner, but it is `0x0159C0`, not the `_GetCSC`-like path at `0x03CF7D`.

The ISR detour at `0x001A5D` only acknowledges the keyboard interrupt and returns. It does not read the key matrix, call `_GetCSC`, or store a scan code.

The best current handoff byte for main-loop key processing is `0xD0058E`, and the best next target is the higher-level dispatch family that reads that byte and feeds the UI. That makes home-screen interactivity feasible, but only after recovering or seeding the event-dispatch and line-editor path above the raw matrix scan layer.
