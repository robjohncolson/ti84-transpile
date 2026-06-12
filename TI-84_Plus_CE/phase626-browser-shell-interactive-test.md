# Phase 626 Browser Shell Interactive Test

## Priority

`INTERACTIVE BROWSER SHELL TEST` from the session-625 handoff: load `browser-shell.html` in a real browser or browser harness, run Coldboot, press multiple keys, and verify characters persist with `Preserve Display` checked.

## Probe Files

- `probe-phase626-browser-harness-audit.mjs`
- `probe-phase626-browser-shell-interactive.mjs`

## Watchdog Runs

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase626-browser-harness-audit.mjs
```

Exit: `0`

Key output:

```json
{
  "canRunBrowserTest": true,
  "checks": {
    "nodeVersion": "v22.17.1",
    "builtinWebSocket": "function",
    "packageJsonExists": false,
    "whereChrome": "INFO: Could not find files for the given pattern(s).",
    "whereMsedge": "INFO: Could not find files for the given pattern(s).",
    "installedBrowsers": [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    ],
    "browserShell": {
      "exists": true,
      "coldbootCheckbox": true,
      "preserveDisplayCheckbox": true,
      "bootButton": true,
      "lcdCanvas": true,
      "keydownHandler": true
    }
  }
}
```

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase626-browser-shell-interactive.mjs
```

Exit: `1` after the page failed to boot.

Key output:

```text
{"phase":"boot-click","clickResult":{"disabled":false,"status":"Ready. Click Boot to start."}}
PAGE_EXCEPTION ... SyntaxError: Identifier '_quadraticRegression' has already been declared
Error: Timed out waiting for coldboot completion; ... status="Ready. Click Boot to start."
```

## Findings

### 3-star: Headless browser harness is available without new dependencies

Chrome exists at `C:\Program Files\Google\Chrome\Application\chrome.exe`, Edge exists at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, and Node `v22.17.1` provides `globalThis.WebSocket`. A raw Chrome DevTools Protocol harness can be built in a probe without Playwright/Puppeteer or a `package.json`.

### 4-star: `browser-shell.html` currently fails before boot handlers attach

When loaded in headless Chrome with DevTools diagnostics attached before navigation, the page throws:

```text
SyntaxError: Identifier '_quadraticRegression' has already been declared
```

The exception occurs while evaluating the module script for `browser-shell.html`, before the Boot button listener is installed. Evidence: after clicking Boot through CDP, `btnBoot.disabled` remains `false`, the status remains `Ready. Click Boot to start.`, and the log stays empty.

### 3-star: Interactive multi-key persistence could not be evaluated

The test did not reach Coldboot or keypress dispatch because the browser shell itself does not initialize in a real browser. This is not a runtime/probe infinite loop; it is a JavaScript parse/evaluation failure in the shell page.

## Next Practical Step

Fix or remove the duplicate `_quadraticRegression` declaration in `browser-shell.html`, then rerun:

```text
node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase626-browser-shell-interactive.mjs
```

No runtime, transpiler, or golden-regression-sensitive files were modified in this session.
