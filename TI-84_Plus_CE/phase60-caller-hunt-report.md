# Phase 60 Caller Hunt

## Summary
- `ROM.transpiled.js` already existed, so no re-transpile was needed.
- A pure lifted-block reverse scan was not enough for `0x081670 (= DspLsts)`: the literal address has **no lifted direct callers** because it sits behind a short `call-return` wrapper spine.
- A combined scan worked best:
  - lifted `instruction.target` refs from `ROM.transpiled.js`
  - raw ROM `call/jp` opcode refs for unlifted code/table rows
- Literal direct refs to `0x081670 (= DspLsts)` are only:
  - `0x020cb4 (= DspLsts)` (`jp 0x081670 (= DspLsts)`) - jump-table slot 748 row
  - `0x080dab` (`call 0x081670 (= DspLsts)`) - real wrapper code inside function entry `0x080d85`
- The nearest callable wrapper chain above `0x081670 (= DspLsts)` is:
  - `0x081660 -> 0x081664 -> 0x081668 -> 0x08166c -> 0x081670 (= DspLsts)`
- Direct callers of that wrapper root `0x081660` are:
  - `0x080cd6`
  - `0x080ed4`
  - `0x08194b`
- Probe verdict: **no menu/home-like full-screen renderer showed up**. Only `0x08193f` rendered anything visible, and it was a narrow 18-row strip (`rows 37-54`, `cols 0-73`), not a home/menu screen.

## Direct Caller Tables

### `0x081670` (STAT/MATRIX editor grid)

| Caller PC | Kind | Caller entry/block | Source | Note |
| --- | --- | --- | --- | --- |
| `0x020cb4 (= DspLsts)` | `jp` | `0x020cb4 (= DspLsts)` | raw | jump-table slot 748 row (`0x020104 (= OSSize) + 748 * 4`) |
| `0x080dab` | `call` | `0x080d85` | raw | direct wrapper path inside the `0x080d85` function |

### `0x0059c6` (character print)

| Caller PC | Kind | Caller entry/block | Source |
| --- | --- | --- | --- |
| `0x0015d1` | `call` | `0x0015c7` | lifted |
| `0x0015ef` | `call` | `0x0015e1` | lifted |
| `0x0017f8` | `call` | `0x0017dd` | lifted |
| `0x0059f3` | `call` | `0x0059f3` | lifted |
| `0x005a35` | `call` | `0x005a35` | lifted |
| `0x00eea3` | `call` | `0x00ee88` | lifted |
| `0x012f71` | `call` | `0x012f56` | lifted |
| `0x013d19` | `call` | `0x013d11` | lifted |
| `0x015866` | `call` | `0x015864` | lifted |
| `0x0158ff` | `call` | `0x0158fa` | raw |

### `0x062160 (= DispErrorScreen)` (generic error banner renderer)

| Caller PC | Kind | Caller entry/block | Source | Note |
| --- | --- | --- | --- | --- |
| `0x020e10 (= DispErrorScreen)` | `jp` | `0x020e10 (= DispErrorScreen)` | raw | unlifted raw `jp` row |
| `0x0744b3` | `call` | `0x0744b3` | lifted | known real caller from Phase 57 |
| `0x085126` | `call` | `0x085126` | lifted | known real caller from Phase 57 |
| `0x085168` | `call` | `0x08515e` | lifted | known real caller from Phase 57 |

### `0x005b96` (VRAM clear/fill)

| Caller PC | Kind | Caller entry/block | Source |
| --- | --- | --- | --- |
| `0x000374` | `jp` | `0x000374` | lifted |
| `0x001907` | `call` | `0x0018f4` | lifted |
| `0x003a43` | `call` | `0x003a42` | lifted |
| `0x00f30a` | `call` | `0x00f2fd` | lifted |
| `0x013d9b` | `call` | `0x013d93` | lifted |
| `0x014568` | `call` | `0x014561` | lifted |

### `0x0802b2` (SetTextFgColor)

| Caller PC | Kind | Caller entry/block | Source |
| --- | --- | --- | --- |
| `0x021ae0` | `jp` | `0x021a8a` | raw |
| `0x0288f9` | `call` | `0x0288f5` | lifted |
| `0x0289c7` | `call` | `0x0289c3` | lifted |

## `0x081670 (= DspLsts)` Two-Level Caller Tree

### Literal direct refs

```text
0x020cb4 (= DspLsts)  jp   0x081670 (= DspLsts)        // jump-table slot 748 row
0x080d85:
  0x080dab  call 0x081670 (= DspLsts)
    caller-of-caller:
      0x080e5b via 0x080ecb call 0x080d85
```

### Callable wrapper spine

```text
0x081660 -> 0x081664 -> 0x081668 -> 0x08166c -> 0x081670 (= DspLsts)
```

The direct callers of `0x081660` are the practical "one caller back" set:

```text
0x080ca3:
  0x080cd6  call 0x081660
    callers-of-caller:
      0x080e5b via 0x080e5d jp z, 0x080ca3
      0x080fb7 via 0x080fb9 jp z, 0x080ca3

0x080ed4:
  0x080ed4  call 0x081660
    caller-of-caller:
      0x08121b via 0x081229 jp c, 0x080ed4

0x08193f:
  0x08194b  call 0x081660
    caller-of-caller:
      0x080e5b via 0x080ea6 call 0x08193f
```

### Level-1 caller classification

| Probe entry | Reaches `0x081670 (= DspLsts)` through | Range | Calls `0x0059c6`? | Calls `0x062160 (= DispErrorScreen)`? | Notes |
| --- | --- | --- | --- | --- | --- |
| `0x081660` | wrapper-spine root | `0x08xxxx` | no | no | nearest callable wrapper root |
| `0x080d85` | direct `0x080dab -> 0x081670 (= DspLsts)` | `0x08xxxx` | no | no | literal direct-caller path |
| `0x080ca3` | `0x080cd6 -> 0x081660` | `0x08xxxx` | no | no | broader setup wrapper |
| `0x080ed4` | direct `call 0x081660` | `0x08xxxx` | no | no | branch target from `0x08121b` |
| `0x08193f` | `0x08194b -> 0x081660` | `0x08xxxx` | no | no | only caller that visibly rendered anything |

## Probe Results For Top 5 Practical Level-1 Callers

I excluded the raw jump-table row `0x020cb4 (= DspLsts)` from the main top-5 probe set because the lifted executor does not start cleanly on that unlifted table row. A direct `runFrom(0x020cb4 (= DspLsts))` drifted into the adjacent row (`0x020cb8 (= CloseEditBuf) -> 0x0ac2cb (= CloseEditBuf)`) instead of reliably landing on `0x081670 (= DspLsts)`.

| Probe entry | Why this entry | Steps | Termination | VRAM writes | BBox | Unique blocks | Verdict |
| --- | --- | ---: | --- | ---: | --- | ---: | --- |
| `0x081660` | wrapper root | 5000 | `max_steps` | 0 | none | 23 | noop |
| `0x080d85` | literal direct-caller function | 5000 | `max_steps` | 0 | none | 32 | noop |
| `0x080ca3` | caller of `0x081660` via `0x080cd6` | 5000 | `max_steps` | 0 | none | 104 | noop |
| `0x080ed4` | caller of `0x081660` | 5000 | `max_steps` | 0 | none | 24 | noop |
| `0x08193f` | caller of `0x081660` via `0x08194b` | 5000 | `max_steps` | 1332 | `r37-54 c0-73` | 66 | renders something |

### What rendered

- `0x08193f` is the only probe target that drew visible output.
- Its bounding box was only `rows 37-54, cols 0-73`, so it is a narrow left-edge strip, not a menu or home-screen body.
- Its first executed blocks were:
  - `0x08193f`
  - `0x0818fc`
  - `0x08187b`
  - `0x02398e (= CallLocalizeHook)`
  - `0x025758`
  - `0x0a1cac (= PutS)`
- That dynamic trace strongly suggests `0x08193f` stages text via the `0x0818fc -> 0x0a1cac (= PutS)` string-render path before entering the `0x081660` / `0x081670 (= DspLsts)` family.

### Extra quick-look upstream probes

| Probe entry | Why | Steps | Termination | VRAM writes | Verdict |
| --- | --- | ---: | --- | ---: | --- |
| `0x080e5b` | second-level selector above `0x080ca3`, `0x08193f`, `0x080d85` | 15 | `missing_block` | 0 | crashes / unwinds |
| `0x08121b` | second-level selector above `0x080ed4` | 5000 | `max_steps` | 0 | noop |

## Verdict

- No caller in this pass rendered a menu-like or home-like full screen.
- The strongest visible result is `0x08193f`, but it looks like a short header/banner or label strip, not a navigation screen.
- The most structurally interesting upstream selector is `0x080e5b` because it fans out toward:
  - `0x080ca3`
  - `0x08193f`
  - `0x080d85`
- `0x08121b` is the only confirmed second-level feeder into the `0x080ed4 -> 0x081660` path.

## Recommended Next Targets

1. `0x080e5b`
   This is the cleanest fan-out selector above both the visible renderer (`0x08193f`) and the literal direct-caller path (`0x080d85`). Seed its branch conditions instead of calling it from a blank post-init state.

2. `0x08193f`
   It is the only practical caller that visibly renders. Trace the string/data path behind `0x0818fc -> 0x0a1cac (= PutS)` and inspect the RAM inputs that choose its left-edge strip contents.

3. `0x08121b`
   This is the only known second-level feeder into `0x080ed4`. It likely controls whether the `0x080ed4 -> 0x081660` branch is even relevant.

4. Authentic jump-table dispatch for slot 748
   Do not probe `0x020cb4 (= DspLsts)` as a naked entry. Instead find the real bcall/jump-table dispatcher that selects slot 748, then call that dispatcher with the correct selector/register state.

## Probe Output Snippet

```text
{"entry":"0x081660","steps":5000,"termination":"max_steps","lastPc":"0x08471b","vramWrites":0,"bbox":null,"uniqueBlocks":23}
{"entry":"0x080d85","steps":5000,"termination":"max_steps","lastPc":"0x084723","vramWrites":0,"bbox":null,"uniqueBlocks":32}
{"entry":"0x080ca3","steps":5000,"termination":"max_steps","lastPc":"0x084723","vramWrites":0,"bbox":null,"uniqueBlocks":104}
{"entry":"0x080ed4","steps":5000,"termination":"max_steps","lastPc":"0x084716","vramWrites":0,"bbox":null,"uniqueBlocks":24}
{"entry":"0x08193f","steps":5000,"termination":"max_steps","lastPc":"0x0a2a37","vramWrites":1332,"bbox":{"minRow":37,"maxRow":54,"minCol":0,"maxCol":73},"uniqueBlocks":66}
```
