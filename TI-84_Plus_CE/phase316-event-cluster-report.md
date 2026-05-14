# Phase 316: 0x00F000-0x00FFFF Event Dispatch Cluster Report

**Date**: 2026-05-13 (auto-session 316)
**Probe**: `probe-phase316-event-cluster.mjs`

---

## Summary

The 0x00F000-0x00FFFF region contains **8 _indcall dispatch sites** across **4 identified functions** (plus 4 sites in a single massive 1470-byte function). All 8 sites dispatch through `CALL 0x002288` (the `_indcall` trampoline, which is simply `JP (IY)`). This is **one unified callback dispatch system** — a struct-based event notification framework where function pointers are stored as the first field (offset +0) of callback structs.

### Key Findings

1. **7 of 8 sites use identical IX+0 offset** — all load the callback pointer from `(IX+0)`, meaning the function pointer is the first field of the struct passed to each handler.
2. **1 site uses POP IY** (0x00fbc6) — loads the callback from the stack rather than a frame-relative struct, suggesting a different calling convention for one code path.
3. **All 7 FD-37 sites share a null-check-then-dispatch pattern**: `CALL 0x0021C2` (null-pointer check on HL) → skip if null → `LD IY,(IX+0)` → `CALL 0x002288`.
4. **0x0021C2 is a null-pointer check**: `PUSH HL / PUSH DE / LD DE,0 / OR A / SBC HL,DE / POP DE / POP HL / RET` — sets Z flag if HL == 0.
5. **3 of 4 functions are OS jump table entries** (entries 168, 169, 173, 174) — this is a public OS API.
6. **D177B8 (13 refs) and D14074/D14084 are the most-referenced RAM addresses** — likely the struct base or control flags.

---

## The 8 Dispatch Sites

| # | Address | Type | IY Source | Containing Function | Function Size |
|---|---------|------|-----------|---------------------|---------------|
| 1 | 0x00F572 | CALL 0x002288 | FD 37 00 (IX+0) | 0x00F430 (entry 173) | 384 bytes |
| 2 | 0x00F777 | CALL 0x002288 | FD 37 00 (IX+0) | 0x00F5B0 (entry 168) | 1470 bytes |
| 3 | 0x00F856 | CALL 0x002288 | FD 37 00 (IX+0) | 0x00F5B0 (entry 168) | " |
| 4 | 0x00F926 | CALL 0x002288 | FD 37 00 (IX+0) | 0x00F5B0 (entry 168) | " |
| 5 | 0x00F9EA | CALL 0x002288 | FD 37 00 (IX+0) | 0x00F5B0 (entry 168) | " |
| 6 | 0x00FB61 | CALL 0x002288 | FD 37 00 (IX+0) | 0x00F5B0 (entry 168) | " |
| 7 | 0x00FBC6 | CALL 0x002288 | FD E1 (POP IY) | 0x00FB6E (entry 169) | ~99 bytes |
| 8 | 0x00FEB2 | CALL 0x002288 | FD 37 00 (IX+0) | 0x00FE10 (entry 174) | ~637 bytes |

---

## The 4 Containing Functions

### Function 1: 0x00F430 — Vector Entry 173

- **Size**: 384 bytes (0x00F430–0x00F5AF)
- **OS jump table**: Entry 173 at 0x0004B4
- **Callers**: 3 — JP@0x0004B4 (vector), CALL@0x00C70D, CALL@0x00C734
- **Dispatch sites**: 1 (0x00F572)
- **Frame setup**: `LD HL,0xFFFFFA` → `CALL 0x002197` (allocates 6-byte frame)
- **First instructions**: Reads `(IX+6)` (parameter from caller), uses it to compute a struct pointer via `LD BC,0xD13FED` + ADD, then dispatches callback at struct offset +0.
- **Struct base**: 0xD13FED — this is a table of callback structs indexed by the parameter.

```
0x00F430: LD HL,0xFFFFFA        ; frame size = -6 (6 local bytes)
0x00F434: CALL 0x002197         ; allocate frame
0x00F438: LD A,(IX+6)           ; parameter = struct index
0x00F43B: OR A                  ; test zero
...
0x00F443: LD BC,0xD13FED        ; callback struct table base
...
0x00F56B: LD IY,(IX+0)          ; load callback pointer
0x00F572: CALL 0x002288         ; dispatch
```

### Function 2: 0x00F5B0 — Vector Entry 168 (MEGA HANDLER)

- **Size**: 1470 bytes (0x00F5B0–0x00FB6D) — the largest function in this cluster
- **OS jump table**: Entry 168 at 0x0004A0
- **Callers**: 3 — JP@0x0004A0 (vector), CALL@0x01561B, CALL@0x0156D2
- **Dispatch sites**: 5 (0x00F777, 0x00F856, 0x00F926, 0x00F9EA, 0x00FB61)
- **Frame setup**: `LD HL,0xFFFFFD` → `CALL 0x002197` (3-byte frame)
- **Return value**: Stores result code in `(IX-1)` before exiting via shared epilogue at 0x00FB66/0x00FB69.

**Return value codes observed** (stored at IX-1 before epilogue):
- 0x00 = no action / null callback
- 0x01 = callback executed successfully
- 0x04 = alternate result (most common non-zero)
- 0x06 = initial default

**Structure**: This is a **multi-branch event dispatcher** with a cascading decision tree. It:
1. Initializes return code to 0x06
2. Checks multiple conditions (null-check on callback pointers, flag tests)
3. On each valid branch, dispatches via `LD IY,(IX+0)` → `CALL 0x002288`
4. Sets different return codes (0x00, 0x01, 0x04) based on which branch fired
5. All branches converge on shared epilogue at 0x00FB66 (return via A) or 0x00FB69 (direct frame teardown)

**Branch structure**:
- 8 branches exit to 0x00FB66 (with return value in IX-1)
- 6 branches exit to 0x00FB69 (direct return, keeping whatever IX-1 was last set)
- Multiple `JP Z,0x00FB66` early exits when null-pointer checks fail

**Key RAM references**: D1440E (8 refs), D1440F (5 refs), D177B7 (6 refs), D14073 (6 refs)

### Function 3: 0x00FB6E — Vector Entry 169

- **Size**: ~99 bytes (0x00FB6E–0x00FBD0)
- **OS jump table**: Entry 169 at 0x0004A4
- **Callers**: 1 — JP@0x0004A4 (vector only)
- **Dispatch sites**: 1 (0x00FBC6) — uses **POP IY** instead of IX-relative load
- **Frame setup**: `LD HL,0xFFFFF9` → `CALL 0x002197` (7-byte frame)
- **Notable**: Calls 0x015542, then the return value (in DE or HL) is pushed and popped into IY for dispatch. This is the **indirect callback** variant — the callee function returns a function pointer which is then called.

```
0x00FBB7: CALL 0x015542         ; get callback pointer
...
0x00FBC2: PUSH HL               ; push returned pointer
0x00FBC3: PUSH DE
0x00FBC4: POP IY                ; IY = returned pointer
0x00FBC6: CALL 0x002288         ; dispatch
```

### Function 4: 0x00FE10 — Vector Entry 174

- **Size**: ~637 bytes (0x00FE10–0x01008D)
- **OS jump table**: Entry 174 at 0x0004B8
- **Callers**: 3 — JP@0x0004B8 (vector), CALL@0x009543, CALL@0x00966B
- **Dispatch sites**: 1 (0x00FEB2)
- **Frame setup**: `LD HL,0xFFFFEE` → `CALL 0x002197` (18-byte frame — largest in cluster)
- **Parallels 0x00F430**: Same prologue pattern (`LD A,(IX+6)` for struct index, `LD BC,0xD13FED` for struct table base).
- **Additional behavior**: Before dispatch, clears bit 7 of `(IY+8)` with `RES 7,A` / `LD (IY+8),A`. After dispatch, stores 0 to `(IX-4)` and jumps to 0x010084.
- **Uses (IX-4) return codes**: 0x00, 0x01, 0x02, 0x04 — more granular than Function 2.

### Function 5: 0x00FBD1 — Vector Entry 271

- **OS jump table**: Entry 271 at 0x00063C
- **No dispatch sites** — included for completeness as it's in this region
- **Callers**: 1 (vector only)
- **Related**: Shares the 0x0021C2 null-check and references D14074 flag

---

## The Shared Epilogue (0x00FB66–0x00FB6D)

```
0x00FB66: LD A,(IX-1)     ; load return value from local var
0x00FB69: LD SP,IX        ; tear down stack frame
0x00FB6B: POP IX          ; restore caller's IX
0x00FB6D: RET             ; return to caller with result in A
```

Two entry points:
- **0x00FB66**: Full epilogue — reads return value from `(IX-1)` into A, then tears down frame.
- **0x00FB69**: Partial epilogue — skips the `LD A,(IX-1)`, useful when A is already set or return value is irrelevant.

---

## Call Graph

```
OS Jump Table (0x000200+)
  |
  +-- Entry 168 (0x0004A0) --> 0x00F5B0  [5 dispatch sites, multi-branch handler]
  |     |-- called by 0x01561B (in func 0x0155BC = entry 166)
  |     `-- called by 0x0156D2 (in func 0x01567C = entry 167)
  |
  +-- Entry 169 (0x0004A4) --> 0x00FB6E  [1 dispatch site, indirect-return callback]
  |     `-- (vector-only, no direct callers)
  |
  +-- Entry 173 (0x0004B4) --> 0x00F430  [1 dispatch site, struct-indexed callback]
  |     |-- called by 0x00C70D
  |     `-- called by 0x00C734
  |
  +-- Entry 174 (0x0004B8) --> 0x00FE10  [1 dispatch site, struct-indexed + flag-clear]
  |     |-- called by 0x009543
  |     `-- called by 0x00966B
  |
  +-- Entry 271 (0x00063C) --> 0x00FBD1  [no dispatch sites, related control function]
```

**Upstream callers**:
- Entry 166 (0x0155BC) and Entry 167 (0x01567C) both call entry 168 — these are likely the **event registration/unregistration** functions that pair with the mega-handler dispatcher.
- 0x00C70D / 0x00C734 call entry 173 with parameters (LD BC,0x0002 / 0x0003 before PUSH BC + CALL) — the parameter is a struct index selecting which callback slot to invoke.
- 0x009543 / 0x00966B call entry 174 with `(IX-1)` as parameter (PUSH BC with B=0, C=IX-1 value).

---

## Key Outgoing Calls from This Region

| Target | Count | Identity |
|--------|-------|----------|
| 0x0021C2 | 36 | Null-pointer check (HL == 0?) |
| 0x00883C | 12 | Interrupt-safe section enter (DI + save IFF) |
| 0x002288 | 8 | _indcall trampoline (JP (IY)) |
| 0x002197 | 4 | C stack frame allocator |
| 0x014E3F | 4 | Interrupt-safe frame setup variant |
| 0x006F4D | 4 | Unknown service |
| 0x006FAF | 4 | Unknown service |
| 0x014FA0 | 3 | Unknown service |
| 0x00BEEE | 3 | Unknown service (also entry 171) |
| 0x00276B | 3 | Unknown service |

The high frequency of 0x0021C2 (36 calls!) confirms this region is **heavily null-check guarded** — every callback pointer is validated before dispatch.

---

## Key RAM Addresses

| Address | Refs | Likely Purpose |
|---------|------|----------------|
| D177B8 | 13 | Control/state word (most-referenced) |
| D14074 | 8 | Event flags or struct field |
| D1440E | 8 | Event flags (used in mega-handler branches) |
| D14084 | 7 | Event flags or struct field |
| D176FB | 7 | State variable |
| D1400B | 7 | State variable (used in 0x00FF00 region) |
| D14073 | 6 | Event flags |
| D177B7 | 6 | Control byte (near D177B8) |
| D13FED | 3 | **Callback struct table base** (LD BC,0xD13FED) |
| DDC100 | 3 | Stack/buffer area (used at dispatch sites) |

**D13FED** is the critical address — it's the base of the callback struct table that Functions 1 and 4 index into. The struct's first field (offset +0) is the function pointer dispatched via IY.

---

## Determination: One System or Multiple?

**This is ONE unified callback/event notification system**, not multiple independent systems. Evidence:

1. **Shared struct table**: Functions 1 (0x00F430) and 4 (0x00FE10) both use `LD BC,0xD13FED` as the struct table base.
2. **Same IX+0 offset**: 7 of 8 sites load from the same struct field.
3. **Shared epilogue**: The mega-handler at 0x00F5B0 and nearby functions share the epilogue at 0x00FB66/0x00FB69.
4. **11 intra-region cross-calls**: Function 2 branches extensively to shared convergence points within the region.
5. **Contiguous vector entries**: Entries 168, 169, 173, 174 are nearly adjacent in the jump table (gap at 170-172 for unrelated functions).
6. **Consistent null-check pattern**: All sites use the same 0x0021C2 guard.

The system appears to be an **event/notification dispatch API** where:
- Callers register callbacks by storing function pointers into structs at D13FED+index
- Entry 168 (0x00F5B0) is the **main event dispatcher** — multi-branch, checks 5 different callback slots, returns a result code indicating what happened
- Entry 173 (0x00F430) is a **single-slot dispatcher** — invokes one specific callback by index
- Entry 174 (0x00FE10) is an **extended single-slot dispatcher** — same as 173 but clears IY+8 bit 7 (flag acknowledgment) and has more local state
- Entry 169 (0x00FB6E) is the **indirect dispatcher** — calls a function that returns a callback pointer, then invokes it

This is consistent with a **TI-OS application/applet notification system** where apps register event handlers that the OS invokes at specific points (screen refresh, key events, mode changes, etc.). The return codes (0x00, 0x01, 0x04, 0x06) likely indicate handler disposition: handled, not handled, needs redraw, default action.

---

## Probe Output

```
Total dispatch sites in 0x00F000-0x00FFFF: 8
  Frame-based (FD 37): 7
  Slot-based (FD 2A): 0
  Other/unknown IY source: 1

Containing functions: 4
  0x00F42E: 1 dispatch site(s), 0 caller(s) [entry 173 starts at 0x00F430]
  0x00F5B0: 1 dispatch site(s), 3 caller(s) [actually 5 sites — 4 in same func]
  0x00FB6E: 1 dispatch site(s), 1 caller(s)
  0x00FE0F: 1 dispatch site(s), 0 caller(s) [entry 174 starts at 0x00FE10]

Note: The probe's backward-search for function boundaries found RET-before-start
for 0x00F430 and 0x00FE10 (at 0x00F42D and 0x00FE0E respectively). The 4 sites
reported as "unknown function" (0x00F856, 0x00F926, 0x00F9EA, 0x00FB61) are all
within the mega-function at 0x00F5B0 — the probe didn't find them because there's
no RET or PUSH IX between 0x00F5B0 and those sites (it's one continuous function).
```
