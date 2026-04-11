# Phase 25: Interactive Browser Shell

**Created**: 2026-04-11
**Goal**: Transform `browser-shell.html` from a step-debugger into an interactive TI-84 CE emulator with keyboard input and LCD display rendering.

---

## Current State (Post-Phase 24F)

| Component | Status |
|-----------|--------|
| Keyboard MMIO at 0xE00800 | Intercepted in cpu-runtime.js (read8/write8 wrappers) |
| Keyboard scan codes | Verified: `(group << 4) \| key_bit` format |
| _GetCSC (0x03CF7D) | Transpiled, reads port 0x5016 bit 3 for keyboard IRQ |
| FTINTC010 (ports 0x5000-0x501F) | Registered in peripherals.js, 24-bit raw/enable/masked status |
| LCD controller | NOT implemented — no MMIO handler, no VRAM rendering |
| browser-shell.html | 170 lines, step-debugger only, no keyboard input, no LCD pixels |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  browser-shell.html                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Keyboard │  │  LCD     │  │  Controls/Regs    │  │
│  │ Overlay  │  │  Canvas  │  │  (existing)       │  │
│  └────┬─────┘  └────▲─────┘  └───────────────────┘  │
│       │              │                               │
│  ┌────▼─────┐  ┌────┴──────┐                        │
│  │ ti84-    │  │ ti84-     │                        │
│  │keyboard.js│ │ lcd.js    │                        │
│  └────┬─────┘  └────▲─────┘                        │
│       │              │                               │
│  ┌────▼──────────────┴──────┐                        │
│  │      cpu-runtime.js       │                        │
│  │  MMIO intercept layer:    │                        │
│  │  0xE00800 = keyboard      │                        │
│  │  0xE00000 = LCD ctrl      │                        │
│  │  0xD40000 = VRAM          │                        │
│  └────┬──────────────────────┘                        │
│       │                                               │
│  ┌────▼──────────┐                                   │
│  │ peripherals.js │                                   │
│  │  FTINTC010     │                                   │
│  │  keyboard IRQ  │                                   │
│  │  (bit 19)      │                                   │
│  └────────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

---

## Frontier 1: Keyboard Input

### Hardware Model

The TI-84 CE keyboard is an 8×8 matrix at MMIO 0xE00800:
- **0xE00810-0xE00817**: Key data per group (active low — bit 0 = pressed)
- **0xE00900**: Scan result byte = `(group << 4) | key_bit`
- **0xE00818**: Status (bit 1 = scan complete, always 0x02)
- **0xE00824**: Ready flag (bit 0 = result available, always 0x01)

This is already intercepted in `cpu-runtime.js` lines 780-851. The intercept reads from `peripherals.keyboard.keyMatrix[group]`.

### TI-84 CE Key Matrix (full 8×8 map)

```
Group 0: [DOWN, LEFT, RIGHT, UP, -, -, -, -]         bits 0-7
Group 1: [ENTER, +, -, ×, ÷, ^, CLEAR, -]            bits 0-7
Group 2: [(-), 3, 6, 9, ), TAN, VARS, -]              bits 0-7
Group 3: [., 2, 5, 8, (, COS, PRGM, STAT]             bits 0-7
Group 4: [0, 1, 4, 7, ,, SIN, APPS, X,T,θ,n]          bits 0-7
Group 5: [-, STO→, LN, LOG, x², x⁻¹, MATH, ALPHA]    bits 0-7
Group 6: [GRAPH, TRACE, ZOOM, WINDOW, Y=, 2ND, MODE, DEL] bits 0-7
Group 7: [-, -, -, -, -, -, -, ON]                     bits 0-7
```

Active low: bit = 0 means pressed, bit = 1 means not pressed.
Default state: all 0xFF (no keys pressed).

### PC → TI-84 Key Mapping

| PC Key | TI-84 Key | Group | Bit | keyMatrix mutation |
|--------|-----------|-------|-----|--------------------|
| Enter | ENTER | 1 | 0 | `keyMatrix[1] &= ~0x01` |
| Backspace | DEL | 6 | 7 | `keyMatrix[6] &= ~0x80` |
| Escape | CLEAR | 1 | 6 | `keyMatrix[1] &= ~0x40` |
| ArrowUp | UP | 0 | 3 | `keyMatrix[0] &= ~0x08` |
| ArrowDown | DOWN | 0 | 0 | `keyMatrix[0] &= ~0x01` |
| ArrowLeft | LEFT | 0 | 1 | `keyMatrix[0] &= ~0x02` |
| ArrowRight | RIGHT | 0 | 2 | `keyMatrix[0] &= ~0x04` |
| 0 | 0 | 4 | 0 | `keyMatrix[4] &= ~0x01` |
| 1 | 1 | 4 | 1 | `keyMatrix[4] &= ~0x02` |
| 2 | 2 | 3 | 1 | `keyMatrix[3] &= ~0x02` |
| 3 | 3 | 2 | 1 | `keyMatrix[2] &= ~0x02` |
| 4 | 4 | 4 | 2 | `keyMatrix[4] &= ~0x04` |
| 5 | 5 | 3 | 2 | `keyMatrix[3] &= ~0x04` |
| 6 | 6 | 2 | 2 | `keyMatrix[2] &= ~0x04` |
| 7 | 7 | 4 | 3 | `keyMatrix[4] &= ~0x08` |
| 8 | 8 | 3 | 3 | `keyMatrix[3] &= ~0x08` |
| 9 | 9 | 2 | 3 | `keyMatrix[2] &= ~0x08` |
| + | + | 1 | 1 | `keyMatrix[1] &= ~0x02` |
| - | - | 1 | 2 | `keyMatrix[1] &= ~0x04` |
| * | × | 1 | 3 | `keyMatrix[1] &= ~0x08` |
| / | ÷ | 1 | 4 | `keyMatrix[1] &= ~0x10` |
| . | . | 3 | 0 | `keyMatrix[3] &= ~0x01` |
| ( | ( | 3 | 4 | `keyMatrix[3] &= ~0x10` |
| ) | ) | 2 | 4 | `keyMatrix[2] &= ~0x10` |
| ^ | ^ | 1 | 5 | `keyMatrix[1] &= ~0x20` |
| , | , | 4 | 4 | `keyMatrix[4] &= ~0x10` |
| Tab | 2ND | 6 | 5 | `keyMatrix[6] &= ~0x20` |
| CapsLock | ALPHA | 5 | 7 | `keyMatrix[5] &= ~0x80` |
| F1 | Y= | 6 | 4 | `keyMatrix[6] &= ~0x10` |
| F2 | WINDOW | 6 | 3 | `keyMatrix[6] &= ~0x08` |
| F3 | ZOOM | 6 | 2 | `keyMatrix[6] &= ~0x04` |
| F4 | TRACE | 6 | 1 | `keyMatrix[6] &= ~0x02` |
| F5 | GRAPH | 6 | 0 | `keyMatrix[6] &= ~0x01` |

### Keyboard IRQ Path

When a key is pressed, the interrupt controller must signal it:

1. Key press → `keyMatrix[group] &= ~(1 << bit)` (active low)
2. Set FTINTC010 bit 19: `intcState.rawStatus |= (1 << 19)`
3. If `intcState.enableMask` bit 19 is set → masked status bit 19 = 1
4. `_GetCSC` (0x03CF7D) reads port 0x5016 (masked status byte 2)
5. Bit 3 of byte 2 = bit 19 overall → set → jumps to 0x03D184
6. Handler reads keyboard hardware, returns scan code in A

On key release:
1. `keyMatrix[group] |= (1 << bit)` (active low)
2. Clear FTINTC010 bit 19: `intcState.rawStatus &= ~(1 << 19)`

### Deliverable: `ti84-keyboard.js` (new module)

```javascript
// Exports:
export function createKeyboardManager(peripherals) {
  // Returns: { handleKeyDown(event), handleKeyUp(event), getKeyState(), KEY_MAP }
}
```

**Interface contract:**
- `handleKeyDown(KeyboardEvent)` — maps event.code to TI-84 group/bit, clears bit in keyMatrix, sets intc bit 19
- `handleKeyUp(KeyboardEvent)` — restores bit in keyMatrix, clears intc bit 19 if no keys pressed
- `getKeyState()` — returns `{ pressedKeys: string[], tiKeys: {group, bit, name}[] }`
- `KEY_MAP` — exported constant: `{ [event.code]: { group, bit, label } }`
- Calls `event.preventDefault()` for mapped keys to prevent browser defaults

---

## Frontier 2: LCD Display

### Hardware Model

The TI-84 CE uses an ARM PL111 LCD controller at MMIO 0xE00000:

| Address | Register | Purpose |
|---------|----------|---------|
| 0xE00010 | LCDUPBASE | VRAM base address (24-bit, default 0xD40000) |
| 0xE00018 | LCDControl | Enable (bit 0), BPP (bits 1-3), BGR (bit 8) |

**VRAM layout:**
- Base address: 0xD40000 (153,600 bytes)
- Format: 16bpp BGR565 little-endian
- Resolution: 320 × 240 pixels
- Byte order: `pixel = memory[offset] | (memory[offset+1] << 8)`
- Color decode: `R = (pixel >> 11) & 0x1F`, `G = (pixel >> 5) & 0x3F`, `B = pixel & 0x1F`
- Scale to 8-bit: `R8 = (R << 3) | (R >> 2)`, `G8 = (G << 2) | (G >> 4)`, `B8 = (B << 3) | (B >> 2)`

### LCD MMIO Intercept (cpu-runtime.js)

Add to the existing MMIO wrapper in `createExecutor()`, alongside the keyboard intercept at 0xE00800:

```javascript
// LCD controller at 0xE00000-0xE0002F
if (addr >= 0xE00000 && addr < 0xE00030) {
  const reg = addr - 0xE00000;
  // Track writes to LCDUPBASE (0x10-0x12) and LCDControl (0x18)
}
```

### Deliverable: `ti84-lcd.js` (new module)

```javascript
// Exports:
export function createLCDRenderer(canvas, memory, options = {}) {
  // Returns: { renderFrame(), setVRAMBase(addr), getState(), destroy() }
}
```

**Interface contract:**
- `renderFrame()` — reads 153,600 bytes from VRAM base in `memory`, decodes BGR565, draws to canvas via ImageData
- `setVRAMBase(addr)` — updates the VRAM read offset (default 0xD40000)
- `getState()` — returns `{ vramBase, enabled, frameCount }`
- `destroy()` — cancels any pending animation frame
- Constructor gets the canvas 2D context, creates a reusable `ImageData(320, 240)`
- Rendering should use `requestAnimationFrame` externally (browser-shell controls the loop)

### Performance Considerations

- VRAM is 150KB — reading every frame at 60fps = 9MB/s. Use `ImageData` + `putImageData` (no intermediate canvas operations).
- Only render when `lcdEnabled` flag is set in LCDControl register.
- Consider dirty-flag: skip render if no memory writes to VRAM region since last frame.

---

## Frontier 3: _GetCSC Integration

### Current Problem

`_GetCSC` at 0x03CF7D works when called directly with the right intc state (Phase 24F verified this). But in the browser shell's execution loop, the interrupt controller's keyboard bit is never set because nothing triggers it.

### Solution

In `peripherals.js`, expose a method to set the keyboard IRQ:

```javascript
function setKeyboardIRQ(active) {
  if (active) {
    intcState.rawStatus |= (1 << 19);  // keyboard IRQ bit
  } else {
    intcState.rawStatus &= ~(1 << 19);
  }
}
```

Also ensure `intcState.enableMask` bit 19 is set during initialization (or the OS sets it during boot — verify).

The keyboard manager (`ti84-keyboard.js`) calls `peripherals.setKeyboardIRQ(true)` on keydown and `peripherals.setKeyboardIRQ(false)` on keyup (when all keys released).

---

## Frontier 4: Browser Shell Integration

### Modified `browser-shell.html` Layout

```
┌──────────────────────────────────────────────────┐
│  TI-84 Plus CE ROM Executor                      │
├──────────────┬───────────────────────────────────┤
│              │                                    │
│  [320×240    │  Execution Log                     │
│   LCD        │  (existing, scrollable)            │
│   Canvas]    │                                    │
│              │                                    │
├──────────────┤                                    │
│  Controls:   │                                    │
│  [Boot][Step]│                                    │
│  [Run][Reset]│                                    │
│  [AutoRun]   │                                    │
├──────────────┤                                    │
│  Registers   │                                    │
│  (existing)  │                                    │
├──────────────┤                                    │
│  Key State:  │                                    │
│  Last key: _ │                                    │
│  Scan: 0x00  │                                    │
│  [key list]  │                                    │
└──────────────┴───────────────────────────────────┘
```

### New Features

1. **Auto-Run mode**: Toggle button that runs N steps per animation frame (continuous execution)
2. **LCD render loop**: `requestAnimationFrame` calls `lcd.renderFrame()` when auto-running
3. **Keyboard input**: `document.addEventListener('keydown'/'keyup', kbd.handleKeyDown/Up)`
4. **Key state display**: Shows currently pressed TI-84 keys and last scan code
5. **ISR cycling**: Auto-run should periodically trigger timer interrupts for OS wake

### Auto-Run Execution Model

```javascript
let autoRunning = false;
const STEPS_PER_FRAME = 1000;  // tunable

function autoRunFrame() {
  if (!autoRunning || !executor) return;
  runSteps(STEPS_PER_FRAME);
  lcd.renderFrame();
  requestAnimationFrame(autoRunFrame);
}
```

---

## Frontier 5: OS Event Loop (Future — Investigation)

The OS event loop at 0x0019BE checks system flags and dispatches handlers. Currently:
- Callback table at 0xD02AD7 is zeroed (no useful callback)
- OS init at 0x08C331 writes to callback table but corrupts boot state

**Investigation needed:**
1. What does the real boot sequence write to 0xD02AD7?
2. Can we pre-initialize the callback table with known handler addresses?
3. What system flags at (IY+offset) need to be set for keyboard scan dispatch?

This is research-only — no implementation until findings are clear.

---

## Implementation Plan: Dependency-Aware Batches

### Batch 1 — No dependencies, 3 parallel agents

| Chunk | File | Type | Description |
|-------|------|------|-------------|
| **25A** | `ti84-keyboard.js` | NEW | Keyboard mapping module: PC keycode → TI-84 group/bit, handleKeyDown/Up |
| **25B** | `ti84-lcd.js` | NEW | LCD renderer module: BGR565 decode, VRAM → canvas via ImageData |
| **25C** | `peripherals.js` | MODIFY | Add `setKeyboardIRQ(active)`, expose in return object |

### Batch 2 — Depends on Batch 1, 2 parallel agents

| Chunk | File | Type | Depends On | Description |
|-------|------|------|------------|-------------|
| **25D** | `cpu-runtime.js` | MODIFY | 25B | Add LCD MMIO intercept at 0xE00000-0xE0002F, track VRAM base |
| **25E** | `browser-shell.html` | MODIFY | 25A, 25B, 25C | Import modules, wire keyboard/LCD, add auto-run, key state panel |

### Batch 3 — Depends on Batch 2, 1 agent

| Chunk | File | Type | Depends On | Description |
|-------|------|------|------------|-------------|
| **25F** | `test-harness.mjs` | MODIFY | 25A-E | Test 21: keyboard→_GetCSC→scan code. Test 22: VRAM write→read |

### Batch 4 — Investigation only

| Chunk | Type | Description |
|-------|------|-------------|
| **25G** | INVESTIGATE | OS event loop: trace callback table writes, map ISR→event loop chain |

---

## File Ownership (no conflicts within a batch)

| Batch | Agent | Owned Paths |
|-------|-------|-------------|
| 1 | 25A | `TI-84_Plus_CE/ti84-keyboard.js` |
| 1 | 25B | `TI-84_Plus_CE/ti84-lcd.js` |
| 1 | 25C | `TI-84_Plus_CE/peripherals.js` |
| 2 | 25D | `TI-84_Plus_CE/cpu-runtime.js` |
| 2 | 25E | `TI-84_Plus_CE/browser-shell.html` |
| 3 | 25F | `TI-84_Plus_CE/test-harness.mjs` |

---

## Verification Criteria

### Per-chunk (Codex validates):
- `node --check <file>` passes (syntax valid)
- Exports match interface contracts above
- No new dependencies (all vanilla JS, ESM modules)

### Integration (CC validates after Batch 2):
- `browser-shell.html` loads without console errors
- Key press → keyMatrix update → scan code at 0xE00900
- LCD canvas shows pixel data when VRAM is written
- Auto-run mode executes continuously without freezing

### End-to-end (Batch 3 tests):
- Boot → trigger keyboard IRQ → call _GetCSC → correct scan code returned
- Write test pattern to 0xD40000 → LCD renderer decodes correctly
