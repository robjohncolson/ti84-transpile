# Phase 25AX - Browser Shell Direct-Eval Audit

Audited target: `TI-84_Plus_CE/browser-shell.html` (`runDirectEval`, `tokenizeExpression`)

Reference pattern: `TI-84_Plus_CE/probe-phase25ag-store-recall-roundtrip.mjs`

Summary: 7 checks PASS, 1 check FAIL.

## 1. Reset FPS/OPS to MEM_INIT values after each eval

Status: FAIL

Why: the reset exists, but only on the successful `ParseInp` return path. Early error returns skip cleanup entirely.

Browser-shell snippet:

```js
if (parseErrCaught) {
  return { error: `ParseInp error (errNo=0x${hex(errNo, 2)}), ${parseSteps} steps` };
}

if (!parseReturnHit) {
  return { error: `ParseInp did not return (errNo=0x${hex(errNo, 2)}), ${parseSteps} steps` };
}

// Reset FPS/OPS as noted in the task
const fpsBase = evalRead24(mem, EVAL_FPSBASE_ADDR);
evalWrite24(mem, EVAL_FPS_ADDR, fpsBase);
evalWrite24(mem, EVAL_OPBASE_ADDR, 0xD3FFFF);
evalWrite24(mem, EVAL_OPS_ADDR, 0xD3FFFF);
```

Assessment:
- The reset logic is present and matches the intended post-`ParseInp` cleanup.
- It is not guaranteed to run for every eval because both error exits return before cleanup.
- Current impact is reduced because `runDirectEval()` cold-boots fresh state on every call, but this is still a divergence from the stated "after each eval" requirement.

## 2. Clear OP1 to zeros before ParseInp

Status: PASS

Browser-shell snippet:

```js
mem.fill(0x00, EVAL_TOKEN_BUFFER_ADDR, EVAL_TOKEN_BUFFER_ADDR + 0x80);
mem.set(tokens, EVAL_TOKEN_BUFFER_ADDR);
evalWrite24(mem, EVAL_BEGPC_ADDR, EVAL_TOKEN_BUFFER_ADDR);
evalWrite24(mem, EVAL_CURPC_ADDR, EVAL_TOKEN_BUFFER_ADDR);
evalWrite24(mem, EVAL_ENDPC_ADDR, EVAL_TOKEN_BUFFER_ADDR + tokens.length);

// Clear OP1
mem.fill(0x00, EVAL_OP1_ADDR, EVAL_OP1_ADDR + 9);
```

Probe snippet:

```js
mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
```

Assessment:
- This matches the validated pattern.
- OP1 is explicitly zeroed before `ParseInp`, so it will not contain a variable-name token stream from prior state.

## 3. Seed the error frame correctly (`errSP`, `errNo`)

Status: PASS

Browser-shell snippet:

```js
// Seed error frame (same pattern as probe)
c.sp -= 3;
evalWrite24(mem, c.sp, EVAL_FAKE_RET);
const errBase = (c.sp - 6) & 0xFFFFFF;
evalWrite24(mem, errBase, EVAL_ERR_CATCH);
evalWrite24(mem, errBase + 3, 0);
evalWrite24(mem, EVAL_ERRSP_ADDR, errBase);
mem[EVAL_ERRNO_ADDR] = 0x00;
```

Probe snippet:

```js
function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3; write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
}
```

Assessment:
- This matches the probe helper exactly in structure and values.
- `FAKE_RET` and `ERR_CATCH` are both seeded, and `errNo` is cleared before `ParseInp`.

## 4. Set `begPC` / `curPC` / `endPC` correctly

Status: PASS

Browser-shell snippet:

```js
evalWrite24(mem, EVAL_BEGPC_ADDR, EVAL_TOKEN_BUFFER_ADDR);
evalWrite24(mem, EVAL_CURPC_ADDR, EVAL_TOKEN_BUFFER_ADDR);
evalWrite24(mem, EVAL_ENDPC_ADDR, EVAL_TOKEN_BUFFER_ADDR + tokens.length);
```

Probe snippet:

```js
write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
```

Assessment:
- `begPC` and `curPC` both start at the token buffer base.
- `endPC` points just past the token array, which includes the terminating `0x3F`.

## 5. Append `0x3F` end token to the token buffer

Status: PASS

Browser-shell snippet:

```js
// Append 0x3F (newline/end token) as ParseInp expects
tokens.push(0x3F);
return { tokens: Uint8Array.from(tokens) };
```

Probe snippet:

```js
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
```

Assessment:
- The browser-shell tokenizer always appends the required terminator.
- This matches the probe's explicit `2 + 3 + end-token` buffer shape.

## 6. Use `timerInterrupt: false`

Status: PASS

Browser-shell snippet:

```js
const perph = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: perph });
```

Probe snippet:

```js
const executor = createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
```

Assessment:
- The direct-eval path correctly disables timer interrupts, consistent with the probe environment.

## 7. Use the correct constants and addresses

Status: PASS

Browser-shell snippet:

```js
const EVAL_MEMINIT_ENTRY   = 0x09DEE0;
const EVAL_PARSEINP_ENTRY  = 0x099914;
const EVAL_OP1_ADDR        = 0xD005F8;
const EVAL_ERRNO_ADDR      = 0xD008DF;
const EVAL_ERRSP_ADDR      = 0xD008E0;
const EVAL_BEGPC_ADDR      = 0xD02317;
const EVAL_CURPC_ADDR      = 0xD0231A;
const EVAL_ENDPC_ADDR      = 0xD0231D;
const EVAL_FPSBASE_ADDR    = 0xD0258A;
const EVAL_FPS_ADDR        = 0xD0258D;
const EVAL_OPBASE_ADDR     = 0xD02590;
const EVAL_OPS_ADDR        = 0xD02593;
const EVAL_TOKEN_BUFFER_ADDR = 0xD00800;
const EVAL_FAKE_RET        = 0x7FFFFE;
const EVAL_ERR_CATCH       = 0x7FFFFA;
const EVAL_MEMINIT_RET     = 0x7FFFF6;
```

Probe snippet:

```js
const STACK_RESET_TOP = 0xd1a87e;
const MEMINIT_ENTRY = 0x09dee0;
const PARSEINP_ENTRY = 0x099914;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const TOKEN_BUFFER_ADDR = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
```

Assessment:
- The direct-eval constants match the probe values.
- `browser-shell.html` uses `SCREEN_STACK_TOP = 0xD1A87E`, which is value-equivalent to the probe's `STACK_RESET_TOP = 0xD1A87E`.

## 8. Token mapping

Status: PASS

Browser-shell snippet:

```js
const EVAL_TOKEN_MAP = {
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,
  '+': 0x70, '-': 0x71, '*': 0x82, '/': 0x83,
  '.': 0x3A, '(': 0x10, ')': 0x11,
};
const TI_NEGATE_TOKEN = 0xB0;
```

Negation handling:

```js
if (ch === '-') {
  const prev = tokens.length > 0 ? tokens[tokens.length - 1] : null;
  const isNegation = prev === null
    || prev === 0x70
    || prev === 0x71
    || prev === 0x82
    || prev === 0x83
    || prev === 0x10
    || prev === TI_NEGATE_TOKEN;
  if (isNegation) {
    tokens.push(TI_NEGATE_TOKEN);
    continue;
  }
}
```

Assessment:
- Digits map to `0x30`-`0x39`.
- Operators map to `+ 0x70`, `- 0x71`, `* 0x82`, `/ 0x83`.
- Parentheses map to `0x10` / `0x11`.
- Unary negation maps to `0xB0`.
- End token is `0x3F`.
- The browser tokenizer also supports `.` as `0x3A`, which is an additive feature and not a discrepancy.

## Bugs / Discrepancies Found

1. Post-`ParseInp` FPS/OPS cleanup is not on all return paths.
   The function returns immediately on `parseErrCaught` and on `!parseReturnHit`, so the cleanup block never runs in those cases.

2. No other mismatches were found in the direct-eval setup.
   The call-state prep, token buffer setup, OP1 clearing, error-frame seeding, addresses, and token mapping all match the validated pattern.

## Recommended Fixes

1. Move the FPS/OPS cleanup into a shared exit path.
   A `finally`-style cleanup, or a single return block after cleanup, would make the code satisfy the "after each eval" requirement literally instead of only on the success path.

2. Keep the cold-boot-per-eval design unless performance work changes it.
   The current fresh-boot model limits the practical impact of the cleanup bug. If the implementation ever reuses memory/executor state across evals, the cleanup gap becomes much riskier.

3. Optional hardening: centralize the direct-eval setup helpers.
   Sharing `prepareCallState`/`seedErrFrame`-style helpers or shared constants with the probe logic would reduce drift between the validated probe and browser implementation.
