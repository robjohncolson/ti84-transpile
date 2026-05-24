# Phase 424 — Sibling Walker Callers Report

## Summary

Session 423 decoded 0x00E583 as a 923-byte sibling list walker with exactly 2 call sites. This session traces the enclosing functions to understand when and why the sibling walk is invoked.

Both call sites are deep within large multi-phase functions. The CALL 0xE583 instruction is preceded by 5 PUSH instructions (setting up arguments on the stack) and followed by 5 POP instructions (cleaning up the stack). The return value is checked to decide whether post-walk processing should proceed.

---

## Caller A: 0x00CD7B–0x00D2EC (1394 bytes)

**Call site**: 0x00D295 (1306 bytes into the function)

### Function Identity

A large descriptor-table builder that:
1. Allocates slab memory (3x calls to 0xE06D slab alloc)
2. Validates entries (3x calls to 0x21C2)
3. Frees failed entries (3x calls to 0xE1CC slab free)
4. Builds descriptor structures via 0xCB7B (5 calls) and 0xCBE9 (5 calls)
5. As a final phase, invokes the sibling walker to walk the built structure

### Prologue

```
LD HL,-3          ; allocate 3 local bytes
CALL 0x2197       ; stack frame setup
IX-2 = 0x01       ; return value init (success)
IX-1 = 0x00       ; counter/flag init
```

### Byte Range & Size

- Start: 0x00CD7B (LD HL,-3; CALL 0x2197)
- End: 0x00D2EC (RET)
- Size: 1394 bytes (0x572)

### CALL Targets (12 unique, 32 total calls)

| Target | Label | Count |
|--------|-------|-------|
| 0x002197 | stack frame setup | 1 |
| 0x00211B | unknown helper | 1 |
| 0x0021C2 | validate/check helper | 3 |
| 0x0022B8 | — | 0 |
| 0x0025E8 | unknown helper | 1 |
| 0x002623 | index/offset helper | 4 |
| 0x00276B | unknown helper | 2 |
| 0x0027E8 | unknown helper | 3 |
| 0x00CB7B | descriptor builder A | 5 |
| 0x00CBE9 | descriptor builder B | 5 |
| 0x00E06D | slab alloc | 3 |
| 0x00E1CC | slab free | 3 |
| 0x00E583 | sibling list walker | 1 |

### RAM Variables

| Address | R/W | Notes |
|---------|-----|-------|
| D13FFC | R:34 W:3 | Primary data table pointer — heavily read throughout |
| D13FFF | R:22 W:2 | Secondary table pointer |
| D14002 | R:17 W:1 | Tertiary table pointer |
| D141BE | R:9 W:0 | Read-only state variable |

### Port I/O

None.

### What Triggers the Sibling Walk

The CALL 0xE583 at 0xD295 is the **last major operation** before the epilogue. The function builds descriptors in phases:
1. Phase 1 (0xCE6B–0xCF26): Allocate slabs, validate, free on failure
2. Phase 2 (0xCF26–0xD26A): Build descriptor entries via 0xCB7B and 0xCBE9 (10 calls total, 2 per iteration for 5 entries)
3. Phase 3 (0xD26B–0xD295): Prepare arguments for the sibling walk — loads BC from D13FFC, pushes 5 stack args

Pre-call setup (0xD280–0xD294):
```
LD HL, (computed)   ; sign-extend and compute offset
PUSH BC             ; arg from stack
ADD HL, BC
LD BC, 0xD13FD8     ; base address
ADD HL, BC
PUSH HL             ; push computed address
LD BC, (D13FFC)     ; load primary table pointer
PUSH BC             ; push table pointer
CALL 0xE583         ; invoke sibling list walker
```

### Post-Call Behavior

After the 5x POP cleanup:
```
LD (IX-2), A        ; store return value
LD A, (IX-2)
OR A                ; check if zero
JR NZ, +62 → 0xD2E5  ; if non-zero: skip to epilogue (walker failed or no more work)
```

If the walker returned 0 (success):
- Calls 0x2623 (index helper) with a dispatch table at the call site
- Calls 0x25E8
- Tests result, and if non-zero calls 0x276B then 0x27E8

### Epilogue (0xD2E5–0xD2EC)

```
LD A, (IX-2)        ; load return value
LD SP, IX           ; restore stack
POP IX              ; restore caller IX
RET
```

### Callers of This Function

9 call sites (all CALL, no JP):
- 0x00D6AE, 0x00D741, 0x00D77C, 0x00D827, 0x00D886
- 0x00D8EA, 0x00D91F, 0x00D958, 0x00D9BC

All callers are clustered in the 0xD6xx–0xD9xx range, suggesting a higher-level dispatch loop that calls this function repeatedly with different parameters.

---

## Caller B: 0x00EB31–0x00ED76 (582 bytes)

**Call site**: 0x00ED10 (479 bytes into the function)

### Function Identity

A descriptor-table builder similar to Caller A but smaller. It:
1. Validates input parameters
2. Allocates slab memory (1x call to 0xE06D)
3. Validates entries (2x calls to 0x21C2)
4. Builds a descriptor via 0xCB7B (1 call)
5. Executes a data-copy loop (0xEC65–0xED0F) that reads from IX-indexed parameters and writes to computed table addresses at D13FDE
6. Invokes the sibling walker as the final phase

### Prologue

```
LD HL,-9            ; allocate 9 local bytes
CALL 0x2197         ; stack frame setup
```

Local variables:
- IX-9 through IX-5: 5 bytes of locals
- IX-4 (FC): status flag, starts at 0
- IX-1 (FF): counter/flag

### Byte Range & Size

- Start: 0x00EB31 (LD HL,-9; CALL 0x2197)
- End: 0x00ED76 (RET)
- Size: 582 bytes (0x246)

### CALL Targets (8 unique, 10 total calls)

| Target | Label | Count |
|--------|-------|-------|
| 0x002197 | stack frame setup | 1 |
| 0x0021C2 | validate/check helper | 2 |
| 0x0022B8 | unknown helper | 1 |
| 0x002623 | index/offset helper | 1 |
| 0x00276B | unknown helper | 1 |
| 0x00CB7B | descriptor builder A | 1 |
| 0x00E06D | slab alloc | 1 |
| 0x00E583 | sibling list walker | 1 |

### RAM Variables

| Address | R/W | Notes |
|---------|-----|-------|
| D14014 | R:0 W:2 | Written but not read here (output variable) |
| D141E5 | R:1 W:0 | Read-only state |
| D141F8 | R:1 W:0 | Read-only state |
| D141F9 | R:2 W:0 | Read-only state (read twice) |
| D141FA | R:1 W:0 | Read-only state |
| D141FB | R:1 W:0 | Read-only state |

### Port I/O

None.

### What Triggers the Sibling Walk

Like Caller A, the CALL 0xE583 occurs near the end of the function after building a descriptor structure. The pre-call sequence (0xECF0–0xED0F) pushes 5 arguments:

```
PUSH BC             ; arg from IX-15
PUSH (computed)     ; arg from IX-18/IX-12
LD HL, (computed)   ; compute table offset
ADD HL, BC
LD BC, 0xD13FDE     ; base address
ADD HL, BC
PUSH HL             ; push computed table address
PUSH (IX+FD)        ; push from locals
CALL 0xE583         ; invoke sibling list walker
```

The function has a significant data-copy loop (back-jump at 0xED35: JR C,-19 → 0xED24) that iterates through descriptor entries before the walk.

### Post-Call Behavior

After 5x POP cleanup:
```
LD (IX-5), A        ; store return value
LD A, (IX-4)        ; check status flag
OR A
... (sign-extend and index)
CALL 0x2623         ; dispatch table lookup
```

The dispatch table after 0x2623 contains jump targets for different result paths. If the walker returned non-zero (failure), the function stores BC/DE values into IX locals, sets IX-4 to 0x02 (different status), and eventually jumps back to 0xEBAF for retry/cleanup.

If successful (walker returned 0), the function stores the result into IX-indexed locals and falls through to the epilogue.

### Epilogue (0xED6F–0xED76)

```
LD A, (IX-5)        ; load return value
LD SP, IX           ; restore stack
POP IX              ; restore caller IX
RET
```

### Callers of This Function

2 CALL refs + 1 JP ref:
- CALL at 0x00F987
- CALL at 0x00FAD4
- JP at 0x00050C (low address — likely a vector/trampoline)

---

## Structural Comparison

| Property | Caller A (0xCD7B) | Caller B (0xEB31) |
|----------|-------------------|-------------------|
| Size | 1394 bytes | 582 bytes |
| Local frame | 3 bytes | 9 bytes |
| Slab allocs | 3 | 1 |
| Validations | 3 | 2 |
| Descriptor builds | 10 (5+5 via CB7B/CBE9) | 1 (via CB7B only) |
| Sibling walk args | 5 pushes (D13FD8 base) | 5 pushes (D13FDE base) |
| Post-walk dispatch | 0x2623 + 0x25E8/0x276B/0x27E8 | 0x2623 only |
| Callers | 9 (D6xx–D9xx cluster) | 2 CALLs + 1 JP |
| Key RAM | D13FFC (34 reads) | D141F8–D141FB (read-only) |

## Transfer Chain Position

```
Higher-level dispatch (0xD6xx–0xD9xx)
  └─> Caller A (0xCD7B) — multi-descriptor builder, 1394 bytes
       ├─> 0xE06D slab alloc (3x)
       ├─> 0xCB7B / 0xCBE9 descriptor builders (10x)
       └─> 0xE583 sibling list walker (1x, final phase)
            ├─> 0xE4E8 header field extractor
            ├─> 0xE1CC slab free
            └─> 0xDA8C link-state toggle

Higher-level dispatch (0xF9xx–0xFAxx)
  └─> Caller B (0xEB31) — single-descriptor builder, 582 bytes
       ├─> 0xE06D slab alloc (1x)
       ├─> 0xCB7B descriptor builder (1x)
       └─> 0xE583 sibling list walker (1x, final phase)
```

Both callers are **descriptor-table builders** that construct linked-list structures in slab-allocated memory, then invoke the sibling walker as a final validation/processing pass. Caller A is the heavy-duty variant (builds 5 descriptor entries), while Caller B is the lightweight variant (builds 1 entry).

The shared helper 0xCB7B (called 5x by A, 1x by B) is likely the core descriptor-node constructor. 0xCBE9 (called 5x by A only) may be a secondary constructor or a field-setter for additional descriptor fields.

## Key Shared Subroutines

- **0x00CB7B**: Descriptor builder A — called by both functions. 5 refs from Caller A, 1 from Caller B.
- **0x00CBE9**: Descriptor builder B — called only by Caller A (5 refs). Likely sets additional fields.
- **0x002623**: Index/offset dispatch helper — called by both post-walk. Uses an inline dispatch table.
- **0x00276B / 0x0027E8**: Post-walk processing helpers.

## Seeds for Next Session

- 0x00CB7B: descriptor-node constructor (shared by both callers, 6 total refs)
- 0x00CBE9: secondary descriptor builder (Caller A only, 5 refs)
- 0x00D6AE–0x00D9BC: higher-level dispatch that calls Caller A 9 times
- 0x00F987 / 0x00FAD4: higher-level callers of Caller B
- D13FFC / D13FFF / D14002: primary descriptor table pointers (heavily referenced)
- D13FD8 / D13FDE: base addresses for sibling walk arguments
