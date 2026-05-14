# Phase 319 - Display Subsystem Vectors 224-252

## Summary

Following the phase 319 prompt literally produced an important mismatch:

- The **low ROM API stubs** at `0x000200 + vec*4` still resolve to the phase 318 display cluster in `0x010220..0x010F87` plus the `vec243` outlier at `0x007B70`.
- The **mega-table** at `0x020110 + vec*4` does **not** mirror those same display handlers. Every one of the 29 vectors lands somewhere else (`0x07FFCF`, `0x0800xx`, `0x0820xx`, `0x092Fxx`, `0x09A3xx`, `0x09E60C`).
- Most mega-table targets touch **OP/FPS/OPS state** (`D005F8`, `D005F9`, `D00603`, `D0258D`, `D02593`) or small validator chains, not the `D177xx` display callback block from phase 318.

So the table below keeps **both** targets:

- `Low Target` = the display-facing target already established by phase 318.
- `Mega Target` = the target actually reached from the `0x020110` mega-table requested by phase 319.
- `Category` follows the low display-facing layer so the cluster can still be grouped as callback/LCD/mode/status.
- `Mega-layer observation` records what the `0x020110` entry actually does.

Caller counts are direct 24-bit CALL/JP references to the **low-ROM stub address** (`0x000200 + vec*4`). The distribution is simple:

- `vec226` is the only zero-caller stub.
- `vec235`, `vec242`, and `vec248` have two direct stub callers.
- Every other vector has exactly one direct stub caller.
- Total direct stub references across the cluster: `31`.

## Complete Table

| Vec | Stub | Low Target | Mega Target | Stub Callers | Category | Mega-layer observation |
|---:|---|---|---|---:|:---|:---|
| 224 | `0x000580` | `0x010220` | `0x07FFCF` | 1 | callback dispatch | Zeroes the `D005F8:D005FA` slot through `0x07FACF`, then stores literal `0x54` into `D005F9`. |
| 225 | `0x000584` | `0x010F00` | `0x07FFD1` | 1 | clear + init | Same zeroing helper as vec224, but keeps caller `A` and writes it to `D005F9`. |
| 226 | `0x000588` | `0x010F87` | `0x07FFDC` | 0 | status query | Copies `D0258D` into `D022BA`; this touches the FPS pointer area, not display callback RAM. |
| 227 | `0x00058C` | `0x010A50` | `0x07FFE5` | 1 | LCD port operation | Guards on `D005F9 == 0x24`, then calls `0x0846EA` and sets a flag bit before returning. |
| 228 | `0x000590` | `0x010A94` | `0x080037` | 1 | LCD port operation | Returns `D005F9 - (D00604)`; tiny compare helper around current OP-state bytes. |
| 229 | `0x000594` | `0x010701` | `0x080043` | 1 | display parameter / table handler | Returns `D005F9 - E`; callers load `E` with small literals like `0x7F`, `0x81`, `0x82`, `0x8C`. |
| 230 | `0x000598` | `0x0107AC` | `0x080051` | 1 | buffer / mode gate | Thin gate: `CALL 0x03D1BE`, jump to `0x061D5A` on NZ, else return. |
| 231 | `0x00059C` | `0x01095C` | `0x080065` | 1 | display parameter setter | Membership test implemented as `CPIR` over an 11-byte table at `0x080075`. |
| 232 | `0x0005A0` | `0x0106F3` | `0x092FA0` | 1 | callback flag / status | Small HL-byte counter helper: increments/reset in place, calls `0x092FC7` when nonzero. |
| 233 | `0x0005A4` | `0x010948` | `0x092FDD` | 1 | display parameter setter | Walks forward from `D0150B` by repeated `DE` adds, then tails into `0x092FF3` and `0x09CE59`. |
| 234 | `0x0005A8` | `0x0103D7` | `0x09E60C` | 1 | display parameter getter | The most UI-looking mega entry: touches `D007D6`, clears `IY` bits, and calls `0x0A21BB`, `0x0A27DD`, `0x0A349A`. |
| 235 | `0x0005AC` | `0x010466` | `0x0800EC` | 2 | LCD status query | Uses `IY+20` state through helper `0x0800A0`, scales the result, and stores a byte in `D02504`. |
| 236 | `0x0005B0` | `0x010403` | `0x080115` | 1 | LCD port read | Boolean-ish predicate after helper filters on the masked `D005F8` state. |
| 237 | `0x0005B4` | `0x01042E` | `0x08011F` | 1 | LCD port write / parameter commit | Exact compare helper: returns after checking whether `D005F9 == 0x5D`. |
| 238 | `0x0005B8` | `0x0104CC` | `0x08012D` | 1 | LCD status query | Exact compare helper: success only for `A == 0x01` or `A == 0x0D`. |
| 239 | `0x0005BC` | `0x0104F7` | `0x080133` | 1 | callback / LCD sync | Range gate: compares `HL` against `1000` decimal and jumps to `0x061D36` when the value is large enough. |
| 240 | `0x0005C0` | `0x010AC4` | `0x080151` | 1 | LCD status query | Exact compare helper on `(A & 0x3F)`, accepting `0x03` and `0x0B`. |
| 241 | `0x0005C4` | `0x010AEB` | `0x080173` | 1 | callback / LCD finalize | Bit-7 guard on `D005F8`; if it fails, it jumps to `0x061D0E`. |
| 242 | `0x0005C8` | `0x010782` | `0x08017C` | 2 | LCD status query | Masks `D005F8` down to 6 bits and then falls into the vec241 guard path. |
| 243 | `0x0005CC` | `0x007B70` | `0x080182` | 1 | LCD outlier | Continuation of the vec241/242 chain; calls `0x07FD62`, `0x07FD4A`, `0x082C50`, and `0x04C916`. |
| 244 | `0x0005D0` | `0x0103A4` | `0x080188` | 1 | display parameter setup | Entry into the same vec241-246 validator chain, starting via vec241 and then checking `D005FA`. |
| 245 | `0x0005D4` | `0x010553` | `0x08018C` | 1 | display mode handler | Same chain as vec244, but entered at the explicit `D005FA` gate. |
| 246 | `0x0005D8` | `0x01058B` | `0x080193` | 1 | display mode handler | Bare worker entry: `CALL 0x082C50`, then `CALL 0x04C916`, then return. |
| 247 | `0x0005DC` | `0x01061D` | `0x09A3BD` | 1 | display mode handler | Calls `0x07FEB6`, then `0x09A3A5` pointer selection, then jumps into `0x07FA0D`. |
| 248 | `0x0005E0` | `0x01069C` | `0x08019F` | 2 | callback install | Calls `0x09A3A5` and `0x07F9FB`; another pointer/state writer rather than a callback-slot helper. |
| 249 | `0x0005E4` | `0x010EDD` | `0x0801A8` | 1 | callback reset | Returns `D00603 & 0x3F`; tiny masked status query. |
| 250 | `0x0005E8` | `0x0109B7` | `0x0801BE` | 1 | status selector | Validator: normalizes with `0x08021F`, accepts values below `0x1A` plus special cases `0x1F` and `0x21`. |
| 251 | `0x0005EC` | `0x0109A0` | `0x0820B5` | 1 | flag / pointer query | Computes `D02593 - D0258D` and clamps negative results to zero; effectively a `max(OPS - FPS, 0)` span query. |
| 252 | `0x0005F0` | `0x0109ED` | `0x0820CA` | 1 | status translator | Maps `D005F9 - 0x5D` through an 8-byte table and returns a small index, with 1/2-style fallback behavior. |

## Low-Stub Display Grouping

These are still the cleanest display-facing categories at the phase 318 layer:

- Callback-related: `224`, `225`, `226`, `232`, `239`, `241`, `248`, `249`.
- LCD port operations / probes: `227`, `228`, `236`, `237`, `238`, `240`, `242`, `243`.
- Display parameter / buffer handlers: `229`, `230`, `231`, `233`, `234`, `244`.
- Display mode handlers: `245`, `246`, `247`.
- Status / selector helpers: `235`, `250`, `251`, `252`.

Two low-stub details remain especially clear:

- `vec224`, `vec225`, `vec248`, and `vec249` are still the callback dispatch / clear / install / reset quartet from phase 318.
- `vec243` is still the oddball low-target (`0x007B70`) that sits outside the otherwise dense `0x010xxx` display cluster.

## Mega-Table Grouping

At the `0x020110` mega-table layer, the same vector numbers do **not** behave like a display-only cluster. The functions break down more like this:

- OP-state helpers around `D005F8`, `D005F9`, `D00603`: `224`, `225`, `228`, `229`, `236`, `237`, `240`, `249`, `252`.
- FPS/OPS pointer helpers: `226`, `251`.
- Tiny validators and gates: `230`, `231`, `238`, `239`, `250`.
- Counter / table walkers: `232`, `233`.
- Shared guard/worker chain centered on `0x080173`, `0x080188`, `0x080193`, `0x082C50`: `241`, `242`, `243`, `244`, `245`, `246`.
- UI/flag-heavy outlier: `234`.
- Pointer-selection / state-writer helpers: `247`, `248`.

That is the main phase 319 result: the **display categorization still describes the low ROM stubs**, but the **mega-table entries themselves resolve to a different helper layer**.

## Sub-groups Worth Following Up

- `vec241` through `vec246` are a real mega-layer family. They chain through `0x080173`, `0x080188`, `0x080193`, and `0x082C50`, with each later vector entering the chain at a deeper point.
- `vec224` and `vec225` are sibling initializers at the mega layer: both zero the same 3-byte slot through `0x07FACF`, then differ only in what they write back to `D005F9`.
- `vec251` and `vec252` are the strongest pointer/state-query pair at the mega layer. `vec251` measures the `OPS-FPS` span, while `vec252` translates the current `D005F9` class into a compact index.
- `vec232` and `vec233` are the least display-like vectors in the set. Both land in `0x092Fxx` helpers that look like counter or table walkers rather than LCD or callback code.

## Bottom Line

If the goal is still "the display subsystem", phase 318's **low stub targets** remain the right layer to classify as callback, LCD port, mode-handler, and status-query APIs. If the goal is strictly the **`0x020110` mega-table**, phase 319 shows that the table does not mirror those display handlers and instead routes the same vector numbers through a different OP/FPS/OPS-oriented helper layer.
