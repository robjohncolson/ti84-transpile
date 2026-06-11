# Phase 613: VRAM Snapshot/Restore Logic Review

**File reviewed**: `TI-84_Plus_CE/browser-shell.html`
**Date**: 2026-06-10
**Scope**: countVRAMPixels, captureVRAMSnapshot, restoreVRAMSnapshot, Preserve Display checkbox, peak-tracking onBlock, related constants

---

## 1. Implementation Summary

The feature lives in a clearly delimited block starting at line 590. It is active only in coldboot mode when the "Preserve Display" checkbox is checked.

**Constants (lines 466–468, 593–594)**

```
LCD_VRAM_BASE   = 0xD40000
LCD_VRAM_BYTES  = 320 * 240 * 2  = 153,600
LCD_VRAM_PIXELS = 320 * 240      = 76,800
VRAM_SNAPSHOT_SAMPLE_INTERVAL = 5000  (blocks between pixel counts)
VRAM_SNAPSHOT_THRESHOLD       = 100   (min non-white pixels = "has content")
```

**State (lines 591–592)**

```js
let vramSnapshot = null;       // Uint8Array(153600) or null
let vramSnapshotPeak = 0;      // highest non-white pixel count seen this keypress
```

**Flow per keypress (lines 1849–1883)**

1. Gate: `useVramPreserve = isColdbootRuntime() && isPreserveDisplayEnabled()`
2. Reset `vramSnapshotPeak = 0` and `blockCount = 0`.
3. Attach `opts.onBlock`: every 5,000 blocks, count non-white pixels; if higher than peak, update peak and capture snapshot.
4. Run `executor.runFrom(lastPc, lastMode, opts)`.
5. After run: count current pixels. If `current < 100 && peak > 100 && vramSnapshot != null`, restore.
6. Render LCD, update status bar.

---

## 2. Correctness Analysis

### 2.1 countVRAMPixels — CORRECT

```js
for (let i = 0; i < LCD_VRAM_PIXELS; i++) {
  const off = LCD_VRAM_BASE + (i << 1);
  const word = cpu.memory[off] | (cpu.memory[off + 1] << 8);
  if (word !== 0xFFFF) count++;
}
```

- Address arithmetic: `i << 1` = `i * 2`. Last address read: `0xD40000 + (76799 * 2) + 1 = 0xD65FFF`. That is exactly the last byte of the VRAM region (`LCD_VRAM_BASE + LCD_VRAM_BYTES - 1`). No off-by-one.
- White pixel detection: `0xFFFF` is correct for RGB565 white.
- Little-endian word assembly: `memory[off] | (memory[off+1] << 8)` is correct for a little-endian CPU writing 16-bit pixels (low byte at lower address). This matches how the LCD renderer reads pixels (line 369: same pattern).
- Guard: `cpu?.memory` optional-chain prevents crashes before boot.

### 2.2 captureVRAMSnapshot — CORRECT

```js
vramSnapshot = new Uint8Array(LCD_VRAM_BYTES);   // 153,600 bytes
for (let i = 0; i < LCD_VRAM_BYTES; i++) {
  vramSnapshot[i] = cpu.memory[LCD_VRAM_BASE + i];
}
```

- Copies exactly `LCD_VRAM_BYTES = 153,600` bytes starting at `0xD40000`. Range is `0xD40000`–`0xD65FFF`, which matches `320 * 240 * 2`. Correct.
- Allocates a fresh `Uint8Array` every time a new peak is reached, discarding the previous one. The old reference is eligible for GC. No leak risk because there is at most one outstanding snapshot per keypress path.
- The copy is byte-by-byte which is safe but slower than `vramSnapshot.set(cpu.memory.subarray(LCD_VRAM_BASE, LCD_VRAM_BASE + LCD_VRAM_BYTES))`. Not a bug, just a minor performance opportunity.

### 2.3 restoreVRAMSnapshot — CORRECT

```js
for (let i = 0; i < vramSnapshot.length; i++) {
  cpu.memory[LCD_VRAM_BASE + i] = vramSnapshot[i];
}
```

- Uses `vramSnapshot.length` (153,600) rather than the constant, which is fine since `captureVRAMSnapshot` always allocates exactly `LCD_VRAM_BYTES`.
- Guard `!vramSnapshot` is checked at the call site (line 1873), so no NPE risk here.
- Writes to `cpu.memory` directly. The ROM write-protect in `cpu-runtime.js` silently drops writes where `addr < 0x400000`. VRAM at `0xD40000` is well above that boundary. Writes go through unobstructed.

### 2.4 Memory Reference Consistency — CORRECT (non-obvious)

The LCD renderer (line 1904) is created with `romBytes` as its `memory` argument. After line 1797 (`romBytes = mem`), `romBytes` and `mem` are the same `Uint8Array(0x1000000)`. The executor is also created from `romBytes` (line 1808), and `cpu = executor.cpu`. At runtime `cpu.memory` is the same underlying buffer. So:

- `countVRAMPixels` / `captureVRAMSnapshot` / `restoreVRAMSnapshot` all use `cpu.memory`.
- `lcd.renderFrame()` reads from the same `memory` reference it was closed over at construction.
- Both point at the same `Uint8Array`. Writing through `cpu.memory` is immediately visible to the renderer. Consistent.

### 2.5 Peak Sampling Granularity — MINOR CONCERN

The snapshot is captured only when `blockCount % 5000 === 0`. If the peak content frame occurs between sample points (e.g., at block 4999), it will be missed and the snapshot captured at block 5000 may already reflect a partial wipe. The result is that the restore may show a slightly stale frame rather than the true best frame. This is a fidelity trade-off (performance vs. accuracy), not a correctness bug. With `COLDBOOT_FRAME_STEPS = 50000`, the feature samples at most 10 times per keypress: enough to bracket the wipe in most cases.

### 2.6 Restore Condition Logic — CORRECT

```js
if (currentPx < VRAM_SNAPSHOT_THRESHOLD && vramSnapshotPeak > VRAM_SNAPSHOT_THRESHOLD && vramSnapshot)
```

- Both sides of the threshold test are required. Correct: only restores if (a) something was drawn during the run, and (b) it was subsequently wiped.
- The check for `vramSnapshot != null` prevents a restore with stale data from a previous keypress when the current run never reached a sample point (peak stayed 0 but snapshot from earlier would still be in `vramSnapshot`). However — see edge case 3.2 below — `vramSnapshotPeak` is reset to 0 at the start of each keypress but `vramSnapshot` is not cleared. This is safe because the guard `vramSnapshotPeak > VRAM_SNAPSHOT_THRESHOLD` will be false if no sample was taken in the current run.

---

## 3. Edge Case Analysis

### 3.1 User unchecks "Preserve Display" mid-keypress

`isPreserveDisplayEnabled()` is read once at keydown (line 1849, `useVramPreserve`). The checkbox is not polled during `executor.runFrom(...)`. If the user unchecks the box while the CPU is running (possible in async environments, but `executor.runFrom` is synchronous), the `useVramPreserve` local is already set and the run completes normally with the feature active. On the next keypress the feature will be disabled. Behaviour is safe: no partial state.

### 3.2 vramSnapshot carries over from a previous keypress

`vramSnapshot` is a module-level variable. It is updated during a keypress when a new peak is found, but it is never nulled at the start of a new keypress. `vramSnapshotPeak` is reset to 0 at the start of each keypress (line 1853). If a new keypress completes without any sample (e.g., very short run that exits before block 5000), `vramSnapshotPeak` stays 0 and the restore condition `vramSnapshotPeak > 100` is false — the stale snapshot is not applied. Correct.

If the first keypress produces a snapshot and the second keypress runs fewer than 5,000 blocks (so peak stays 0 but post-run pixel count is 0), no restore fires. This is the correct conservative behaviour: without a new peak observation there is no evidence a wipe happened in this run.

### 3.3 Rapid keypresses

JavaScript's event loop is single-threaded. `executor.runFrom` is synchronous. Keydown events queue and are processed one at a time. No interleaving is possible. No race condition.

### 3.4 Boot before first keypress — snapshot is null

`vramSnapshot = null` at module init. `restoreVRAMSnapshot` guards `!vramSnapshot` and returns early. The restore condition at line 1873 also requires `vramSnapshot` to be truthy. Safe.

### 3.5 CPU not yet initialised

`countVRAMPixels` and `captureVRAMSnapshot` guard `!cpu?.memory` and return early. Safe.

### 3.6 8bpp mode

`countVRAMPixels` checks `word !== 0xFFFF`. In 8bpp mode the OS writes palette indices (one byte per pixel) rather than RGB565 values. A pixel index of `0xFF` at an even address and `0xFF` at the next address would read as `0xFFFF` (white). For non-white content this would produce a non-zero count, which still satisfies the intent. However, the semantic interpretation of "non-white" is wrong for 8bpp because the value `0xFFFF` in the two-byte window has nothing to do with the RGB565 white value. In practice the coldboot path uses 16bpp mode, so this is an academic concern. Not a bug under expected usage.

### 3.7 Buffer size — CORRECT

`LCD_VRAM_BYTES = 320 * 240 * 2 = 153,600`. This is used for allocation, copy loop bounds, and the fill calls (lines 1223, 1436). All consistent.

---

## 4. Consistency with the Rest of the File

| Usage site | Address used | Method | Consistent? |
|---|---|---|---|
| LCD renderer 16bpp (line 368) | `LCD_RENDER_DEFAULT_VRAM_BASE = 0xD40000` | `memory[base + (i<<1)]` | Yes |
| VRAM clear in showScreen (line 1315) | `0xD40000`, `0xD40000 + 320*240*2` | raw literal loop | Yes (magic numbers match constants) |
| `mem.fill` clears (lines 1223, 1436) | `LCD_VRAM_BASE`, `LCD_VRAM_BASE + LCD_VRAM_BYTES` | `(val, start, END)` | Yes — correct end argument |
| countVRAMPixels | `LCD_VRAM_BASE + (i<<1)` | byte-pair read | Yes |
| captureVRAMSnapshot | `LCD_VRAM_BASE + i` | byte copy | Yes |
| restoreVRAMSnapshot | `LCD_VRAM_BASE + i` | byte copy | Yes |

One raw literal loop at line 1315 (`for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++)`) duplicates the constants inline instead of using `LCD_VRAM_BASE` / `LCD_VRAM_BYTES`. It is numerically correct but diverges from the named-constant style used elsewhere. Pre-existing issue, not introduced by the snapshot feature.

---

## 5. Recommendations

**Priority: low — no correctness bugs found.**

1. **Replace byte-by-byte loops with TypedArray bulk ops** (optional, performance):
   ```js
   // captureVRAMSnapshot
   vramSnapshot = cpu.memory.slice(LCD_VRAM_BASE, LCD_VRAM_BASE + LCD_VRAM_BYTES);

   // restoreVRAMSnapshot
   cpu.memory.set(vramSnapshot, LCD_VRAM_BASE);
   ```
   `Uint8Array.prototype.slice` returns a copy. `set` is a fast bulk write. Both are semantically equivalent to the loops.

2. **Reduce sampling frequency for very short runs** (optional, fidelity): If the run exits in fewer than `VRAM_SNAPSHOT_SAMPLE_INTERVAL` blocks, no sample is taken and the snapshot from the previous keypress is silently reused on the next restore trigger. A one-time sample at run-end (before the restore decision) would close this gap at minimal cost.

3. **Consider a final unconditional sample** after `executor.runFrom` returns (before the restore check), to avoid missing a peak that falls in the tail of a run. This would guarantee the last known state is always captured. Trade-off: one extra full-VRAM scan per keypress in coldboot mode (76,800 iterations — fast in practice).

4. **8bpp guard** (optional, defensive): If 8bpp mode is ever active in coldboot, the white-pixel test in `countVRAMPixels` will give misleading counts. Adding a mode check (`if (cpu.memory[LCD_RENDER_MODE_ADDR] & LCD_RENDER_8BPP_MASK) return 0`) would prevent a false restore.

---

## 6. Summary

The VRAM snapshot/restore implementation is **correct**. Buffer sizes, address arithmetic, memory reference consistency, and the restore condition are all sound. No off-by-one errors, no race conditions (single-threaded JS), no wrong-memory-reference bugs. The `mem.fill` calls elsewhere in the file correctly use `(value, start, end)` semantics. The feature is safely gated behind both a runtime-mode check and the checkbox state. The only non-trivial gotcha — that `vramSnapshot` is never nulled between keypresses — is handled correctly by the `vramSnapshotPeak > threshold` guard. The three recommendations above are optional polish, not fixes.
