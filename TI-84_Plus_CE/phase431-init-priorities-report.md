# Phase 431 — Init Priority Functions P2/P4/P5/P6

**Date**: 2026-05-24  
**Probe**: `probe-phase431-trace-init-priorities.mjs`  
**Chain entry**: `0x009118` (decoded session 430, 108 bytes, 7 priorities)

---

## Summary

Four previously-undecoded priority initializer functions were decoded. All four share the same calling convention: frame setup via `0x002197`, read USB connection state from RAM `0xD177B8`, dispatch on that state, then call `0x00883C` (the descriptor-init wrapper) with a 2-argument push (descriptor-type code + flags) to initialize the appropriate USB interface descriptor. They return `A=1` on success, `A=0` on failure.

| Priority | Address  | Size    | Role                                      | Dispatcher  |
|----------|----------|---------|-------------------------------------------|-------------|
| P2       | 0x008BE9 | 439 B   | USB alt-setting / HID interface init      | 0x002623    |
| P4       | 0x008F16 | 173 B   | USB CDC / serial interface init           | 0x002623    |
| P5       | 0x008FC3 | 137 B   | USB audio / HID class interface init      | 0x00211B    |
| P6       | 0x00904C |  59 B   | USB custom/proprietary mode init          | inline (SBC)|

---

## RAM Variable: `0xD177B8` — USB Connection State

All four functions read `0xD177B8` as the dispatch key. This variable holds the current USB connection state code. Writes to `0xD177B8` were found clustered in `0x0088E0`–`0x008931` (inside the USB init handler decoded in session 430), using the pattern `LD A,(IX+6)` → `LD (0xD177B8),A`, indicating it is set from a USB event struct field.

Known state values (inferred from dispatch targets):
- `0x00` — idle / no connection
- `0x10` — proprietary USB mode (P6 handles this exclusively)
- `0x8C`–`0x91` — USB class codes dispatched by P5
- Various small indices (`0x01`–`0x04`) dispatched by P2/P4 as indexed cases

---

## Dispatchers Used

### `0x002623` — Indexed Jump Table Dispatcher (P2, P4)

Called by P2 and P4. Uses the same inline-table trick as `0x00211B`: `EX (SP),IY` captures the return address (which points to the inline table) into IY, then uses HL (zero-extended from A=state) as an index. Table format:

```
[2 bytes LE] count N
[3 bytes LE] handler[0]   ← called when state == 0
[3 bytes LE] handler[1]   ← called when state == 1
...
[3 bytes LE] handler[N]   ← called when state == N (last case)
[3 bytes LE] fallthrough  ← called when state > N
```

Total inline bytes consumed: `2 + (N+2) × 3`.

### `0x00211B` — Sparse Case Dispatcher (P5)

Used by P5. Known from session 430. Format: `2-byte count N` + `N × 4-byte entries` (1-byte key + 3-byte handler LE) + `3-byte fallthrough`. Matches A against keys; on miss, jumps to fallthrough.

---

## P2 — `0x008BE9` (439 bytes, ends `0x008D9F`)

### Dispatch table at `0x008C01`

Count = 4; indexed on `0xD177B8`:

| Index | Handler    | Notes                              |
|-------|------------|------------------------------------|
| 0     | `0x000083` | ROM vector table entry (idle/none) |
| 1     | `0x008C15` | descriptor-type 0x57, flags 0x84  |
| 2     | `0x008CF7` | same as case 3                     |
| 3     | `0x008CF7` | descriptor-type 0x11, flags 0x84  |
| 4     | `0x008CF7` | same as case 3                     |
| fall  | `0x008D94` | epilogue (set result=0, fail)      |

### Case 1 (`0x008C15`) — Alt-setting 0x03 path

Reads `0xD1408D` (USB interface index) and `0xD1408E` (USB alt-setting index) to compute an IY-based pointer into the descriptor table at `0xD14200`. Checks `(IY+5) == 0x03` (USB class code check); on match, calls descriptor-init wrapper `0x00883C(0x84, 0x11)`.

### Case 2/3 (`0x008CF7`) — Multi-stage path

Rechecks `0xD177B8 == 0x85`, then sets `0xD14080` (USB endpoint config byte) from a local scratch slot. Calls `0x006EB6` (link-ready gate, port `0x3031` handshake). If link ready:

1. `0x00883C(0x01, 0x00)` — init endpoint descriptor type 0x01
2. Manipulates port `0x3114` (SET bit 0 = enable USB interrupt)
3. Calls `0x014FA0(0x02)` — USB packet handler, event code 2
4. Reads port `0x3082`, checks bit 3
5. Manipulates port `0x3080` (SET bit 2 = enable USB D+ pullup)
6. Calls `0x014FA0(0x07)` — USB packet handler, event code 7
7. Calls `0x008527` (helper — likely USB state finalize)
8. Clears bit 2 of port `0x3080` (D+ pulldown)
9. Calls `0x014E81` (helper — likely USB disconnect cleanup)

### RAM accesses

| Address    | Direction | Meaning                                  |
|------------|-----------|------------------------------------------|
| `0xD177B8` | READ      | USB connection state (dispatch key)      |
| `0xD1408D` | READ      | USB current interface index (×3 reads)   |
| `0xD1408E` | READ      | USB current alt-setting index (×3 reads) |
| `0xD14080` | WRITE     | USB endpoint config byte                 |

### Port I/O

| Port     | Direction | Purpose                     |
|----------|-----------|-----------------------------|
| `0x3114` | IN/OUT    | USB interrupt control        |
| `0x3080` | IN/OUT    | USB D+ pullup/pulldown (×2) |

### CALL targets

| Address    | Purpose                              |
|------------|--------------------------------------|
| `0x002197` | Frame setup (prologue)               |
| `0x002623` | Indexed-jump dispatcher              |
| `0x002240` | Index-to-pointer helper (IY ptr math)|
| `0x00883C` | Descriptor-init wrapper (×4 calls)   |
| `0x006EB6` | Link-ready gate (port 0x3031)        |
| `0x014FA0` | USB packet handler                   |
| `0x008527` | USB state finalize helper            |
| `0x014E81` | USB disconnect cleanup helper        |

---

## P4 — `0x008F16` (173 bytes, ends `0x008FC2`)

### Dispatch table at `0x008F2E`

Count = 3; indexed on `0xD177B8`:

| Index | Handler    | Notes                              |
|-------|------------|------------------------------------|
| 0     | `0x000096` | ROM vector table entry (idle/none) |
| 1     | `0x008F3F` | alt-setting check via `0xD14089`   |
| 2     | `0x008F6A` | link helper + descriptor init      |
| 3     | `0x008F8D` | full re-enumerate sequence         |
| fall  | `0x008FB7` | epilogue (set result=0, fail)      |

### Case 1 (`0x008F3F`) — Alt-setting check

Reads `0xD14089` (USB alt-setting selector). If zero: calls `0x00883C(0x98, 0x13)`; else: calls `0x00883C(0x97, 0x13)`. Both branches jump to the shared epilogue.

### Case 2 (`0x008F6A`) — Link helper path

Calls `0x006EAF` (link-state query helper). Tests the return value and bit 0 of port `0x3030`. If that bit is clear, calls `0x00883C(0x98, 0x13)` and exits. Otherwise falls through to the re-enumerate path.

### Case 3 (`0x008F8D`) — Full re-enumerate

1. `0x00E91E` — pre-enumerate setup
2. `0x00D9EE(0x01)` — USB state machine step
3. `0x00DA8C(0x00)` — USB state machine step
4. `0x00883C(0x86, 0x11)` — descriptor-init wrapper

### RAM accesses

| Address    | Direction | Meaning                              |
|------------|-----------|--------------------------------------|
| `0xD177B8` | READ      | USB connection state (dispatch key)  |
| `0xD14089` | READ      | USB alt-setting selector             |

### Port I/O

None direct (port access inside `0x006EAF` callee).

### CALL targets

| Address    | Purpose                            |
|------------|------------------------------------|
| `0x002197` | Frame setup (prologue)             |
| `0x002623` | Indexed-jump dispatcher            |
| `0x00883C` | Descriptor-init wrapper (×4 calls) |
| `0x006EAF` | Link-state query helper            |
| `0x00E91E` | Pre-enumerate setup                |
| `0x00D9EE` | USB state machine step A           |
| `0x00DA8C` | USB state machine step B           |

---

## P5 — `0x008FC3` (137 bytes, ends `0x00904B`)

### Dispatch table at `0x008FDB` (sparse, 0x00211B format)

Count = 5; matching `0xD177B8` against explicit keys:

| Key    | Handler    | Notes                          |
|--------|------------|--------------------------------|
| `0x8C` | `0x009006` | full re-enumerate path         |
| `0x8E` | `0x008FF4` | simple descriptor init path    |
| `0x8F` | `0x008FF4` | same                           |
| `0x90` | `0x008FF4` | same                           |
| `0x91` | `0x008FF4` | same                           |
| miss   | `0x009040` | epilogue (set result=0, fail)  |

Keys `0x8E`–`0x91` are USB class codes (audio/HID range); `0x8C` is likely "audio control".

### Handler `0x008FF4` — Simple path (keys 0x8E–0x91)

Calls `0x00883C(0x8C, 0x15)` then jumps to epilogue.

### Handler `0x009006` — Full re-enumerate path (key 0x8C)

1. `0x00E91E` — pre-enumerate setup
2. `0x00D9EE(0x01)` — USB state machine step
3. `0x00DA8C(0x00)` — USB state machine step
4. `0x00883C(0x86, 0x11)` — descriptor-init
5. `0x00883C(0x84, 0x11)` — second descriptor-init (dual endpoint setup)

### RAM accesses

| Address    | Direction | Meaning                             |
|------------|-----------|-------------------------------------|
| `0xD177B8` | READ      | USB connection state (dispatch key) |

### Port I/O

None direct.

### CALL targets

| Address    | Purpose                            |
|------------|------------------------------------|
| `0x002197` | Frame setup (prologue)             |
| `0x00211B` | Sparse-case dispatcher             |
| `0x00883C` | Descriptor-init wrapper (×3 calls) |
| `0x00E91E` | Pre-enumerate setup                |
| `0x00D9EE` | USB state machine step A           |
| `0x00DA8C` | USB state machine step B           |

---

## P6 — `0x00904C` (59 bytes, ends `0x009086`)

### Dispatch: inline comparison, no dispatcher helper

No dispatcher call. P6 directly computes:

```
OR A            ; clear carry
LD BC,0x000010  ; test value = 0x10
SBC HL,BC       ; HL = state - 0x10
JR NZ,0x00907B  ; if state != 0x10, go to fail epilogue
```

This is the simplest of the four: a single equality check on `0xD177B8 == 0x10`.

### Success path (`0xD177B8 == 0x10`)

Calls `0x00883C(0x21, 0x01)` — initialises descriptor-type `0x21` with flags `0x01`. Then epilogue returns `A=1`.

### Failure path (`0xD177B8 != 0x10`)

Sets `(IX-1) = 0x00` and epilogue returns `A=0`.

### RAM accesses

| Address    | Direction | Meaning                             |
|------------|-----------|-------------------------------------|
| `0xD177B8` | READ      | USB connection state (dispatch key) |

### Port I/O

None.

### CALL targets

| Address    | Purpose                          |
|------------|----------------------------------|
| `0x002197` | Frame setup (prologue)           |
| `0x00883C` | Descriptor-init wrapper (1 call) |

---

## Cross-Reference: Shared Callees

| Address    | Called by       | Purpose                               |
|------------|-----------------|---------------------------------------|
| `0x002197` | P2, P4, P5, P6  | Frame setup (universal prologue)      |
| `0x00883C` | P2, P4, P5, P6  | Descriptor-init wrapper               |
| `0x002623` | P2, P4          | Indexed-jump dispatcher               |
| `0x00211B` | P5              | Sparse-case dispatcher                |
| `0x00E91E` | P4, P5          | Pre-enumerate setup                   |
| `0x00D9EE` | P4, P5          | USB state machine step A              |
| `0x00DA8C` | P4, P5          | USB state machine step B              |
| `0x006EAF` | P4              | Link-state query helper               |
| `0x006EB6` | P2              | Link-ready gate (port 0x3031)         |
| `0x014FA0` | P2              | USB packet handler                    |
| `0x008527` | P2              | USB state finalize                    |
| `0x014E81` | P2              | USB disconnect cleanup                |

---

## `0x00883C` Call Arguments (Descriptor Types)

All four functions call `0x00883C` with two arguments pushed in reverse order (calling convention: push arg1, push arg0, CALL):

| Caller | Push arg1 (type?) | Push arg2 (flags?) | Notes              |
|--------|-------------------|--------------------|--------------------|
| P2     | `0x0011`          | `0x0084`           | alt-setting path   |
| P2     | `0x0013`          | `0x0096`           | CDC/serial         |
| P2     | `0x0011`          | `0x0086`           | HID endpoint       |
| P2     | `0x0001`          | `0x0000`           | endpoint raw       |
| P4     | `0x0013`          | `0x0098`           | CDC no-alt         |
| P4     | `0x0013`          | `0x0097`           | CDC with-alt       |
| P4     | `0x0011`          | `0x0086`           | HID               |
| P5     | `0x0015`          | `0x008C`           | audio/HID simple  |
| P5     | `0x0011`          | `0x0086`           | HID re-enum       |
| P5     | `0x0011`          | `0x0084`           | second HID        |
| P6     | `0x0001`          | `0x0021`           | proprietary       |

The second argument (`0x0084`, `0x0086`, `0x0096`, etc.) likely encodes a descriptor index or USB class code used inside `0x00883C` to select which descriptor template to build.

---

## Interpretation: Which Protocol Does Each Priority Handle?

| Priority | USB Protocol / Mode       | Evidence                                              |
|----------|---------------------------|-------------------------------------------------------|
| P2       | HID + alt-setting detection | reads alt-setting fields D1408D/D1408E; calls link-ready gate; manipulates ports 0x3080/0x3114 |
| P4       | CDC (virtual serial)      | descriptor codes 0x97/0x98 (CDC data/comm); checks alt-setting via D14089 |
| P5       | Audio / HID class         | sparse-dispatches on state keys 0x8C–0x91 (USB audio/HID class code range) |
| P6       | Proprietary/custom mode   | single check D177B8==0x10; descriptor type 0x21      |

All four are USB interface descriptor initializers. They run in priority order; the first one whose USB state matches returns success and the chain stops. P2 (the most complex at 439 bytes) handles the richest set of state conditions including direct port manipulation; P6 (the simplest at 59 bytes) handles only one hard-coded state value.

---

## Next Steps

- **`0x002240`** (called 3× by P2 with A=0x57 or 0x27 before): index-to-IY-pointer math helper; likely computes `IY = D14200 + f(D1408D, D1408E)`. Decode to confirm.
- **`0x00E91E`** (called by P4, P5): pre-enumerate setup; 16 bytes peeked suggest frame alloc + CALL 0x00DB66.
- **`0x00D9EE` / `0x00DA8C`**: USB state machine step functions; both called with integer arguments 0x01/0x00.
- **`0x008527` / `0x014E81`**: finalize / disconnect cleanup helpers in P2's port-manipulation path.
- **`0x00883C`** full decode: the descriptor-init wrapper is called by all four priorities + P3 (link init). Understanding its internal dispatch (descriptor-type → template) would clarify all 11 `(type, flags)` call sites above.
