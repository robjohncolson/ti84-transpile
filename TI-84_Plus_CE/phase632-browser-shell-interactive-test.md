# Phase 632 - Browser Shell Interactive Test

## Priority

Current handoff priority (a): fix the duplicate `_quadraticRegression` browser-shell declaration, then rerun the interactive browser test:

```powershell
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase626-browser-shell-interactive.mjs
```

## GitNexus Note

Repo instructions require GitNexus impact analysis before editing symbols. Tool discovery in this Codex session did not expose GitNexus tools, so no `gitnexus_impact` or `gitnexus_detect_changes` call was possible. The edit was kept narrowly file-local in `browser-shell.html`.

## Edit

`browser-shell.html` had duplicate top-level declarations in the regression helper cluster. Removing only the first `_quadraticRegression` declaration let the page parse farther, but the first browser-probe rerun failed with:

```text
SyntaxError: Identifier '_expRegression' has already been declared
```

The older duplicate `_expRegression`, `_pwrRegression`, and `_lnRegression` declarations immediately after the removed quadratic helper were also removed, keeping the newer shared-helper implementations that use `_linRegCore` / `_polyRegCore`.

## Probe Results

First watchdog run after removing `_quadraticRegression`:

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase626-browser-shell-interactive.mjs
exit 1
SyntaxError: Identifier '_expRegression' has already been declared
```

Second watchdog run after removing the remaining duplicate regression helpers:

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase626-browser-shell-interactive.mjs
exit 1
```

The page loaded and the boot button executed, but the test timed out waiting for coldboot completion:

```text
status="Coldboot: 50000 steps, max_steps | Total: 428570148 | PC=0x003d6b"
bootDisabled=true
autoRunText="Stop"
errors=[]
```

Coldboot log tail:

```text
--- Coldboot Phase 1: Z80 cold boot (0x000000, 20K steps) ---
--- Phase 1 done: 20000 steps, max_steps at 0x001cc0 ---
--- Coldboot Phase 2: Kernel init (0x08C331, 100K steps) ---
--- Phase 2 done: 100000 steps, max_steps at 0x000a92 ---
--- Coldboot Phase 3: Post-init (0x0802B2, 100 steps) ---
--- Phase 3 done: 100 steps, max_steps at 0x0158bc ---
--- Coldboot seeded (entry=0x003a73, SP=0xd1a872, IY=0xD00080, iff1=1, timerInterrupt=true, diHaltBypass=true) ---
```

## Interpretation

The duplicate declaration blocker is resolved. The remaining browser-shell interactive failure is no longer a page parse error; it is a coldboot/AutoRun progress problem in the browser path. The probe never reaches the multi-key Preserve Display assertions because coldboot stays busy and times out at `PC=0x003d6b`.

## Regression

Golden regression was run via watchdog and passed:

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase99d-home-verify.mjs
```

Result: 26/26 assertions passed, including `Normal`, `Float`, and `Radian`.
