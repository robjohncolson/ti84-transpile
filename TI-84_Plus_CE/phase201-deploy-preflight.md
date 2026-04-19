# Phase 201 Deploy Pre-flight

Date: 2026-04-18

## Summary

- Requested command `node TI-84_Plus_CE/probe-golden-regression.mjs` fails immediately because `TI-84_Plus_CE/probe-golden-regression.mjs` does not exist in this repo.
- Maintained regression harness `node TI-84_Plus_CE/probe-phase99d-home-verify.mjs` passes on the current tree:
  - `26/26` exact decode
  - `Normal`, `Float`, `Radian`: `3/3 PASS`
  - `fg=1004`
  - status dots: `PASS`
- `gh-pages` is not present in local refs:
  - `git log --oneline -5 gh-pages` -> `fatal: ambiguous argument 'gh-pages'`
  - `git branch -a` shows only `master`, `remotes/origin/HEAD -> origin/master`, `remotes/origin/master`
- `TI-84_Plus_CE/ROM.transpiled.js.gz` is tracked and present at `17088559` bytes.
  - Decimal size: `17.09 MB`
  - Binary size: `16.30 MiB`
  - This matches the Phase 200 continuation prompt claim of about `17.08 MB`.
  - The `~15 MB` message inside `browser-shell.html` is stale.

## Golden Regression

- Exact requested Phase 201 command path is stale:
  - `node TI-84_Plus_CE/probe-golden-regression.mjs`
  - Result: `MODULE_NOT_FOUND`
- Current working regression probe:
  - `node TI-84_Plus_CE/probe-phase99d-home-verify.mjs`
- Current result:
  - `bestMatch=row39 col2`
  - `decoded="Normal Float Radian       "`
  - `assert Normal: PASS`
  - `assert Float: PASS`
  - `assert Radian: PASS`
  - `drawn=59836 fg=1004 bg=58832 rMin=6 rMax=239`

## GitHub Pages Status

- No `gh-pages` branch exists locally or under `origin/*`.
- There is no deploy script in `package.json`.
- From repository state alone, GitHub Pages is not set up via a `gh-pages` branch.
- GitHub's web UI could still be configured to serve the default branch, but there is no branch-side evidence of that in this checkout.

## Browser Shell Asset Review

### How the `.gz` is loaded

- `browser-shell.html:257-261` imports sibling runtime modules with relative `./...` paths.
- `browser-shell.html:277-294` loads the ROM like this:
  - `fetch('./ROM.transpiled.js.gz')`
  - `new DecompressionStream('gzip')`
  - convert decompressed JS text into a `Blob`
  - `import()` the blob URL as a module
- Because decompression happens in browser code, GitHub Pages only needs to serve the raw `.gz` file bytes. No server-side gzip response header is required for this path.

### Referenced files and commit state

- Tracked and present:
  - `TI-84_Plus_CE/browser-shell.html`
  - `TI-84_Plus_CE/cpu-runtime.js`
  - `TI-84_Plus_CE/peripherals.js`
  - `TI-84_Plus_CE/ti84-keyboard.js`
  - `TI-84_Plus_CE/scancode-translate.js`
  - `TI-84_Plus_CE/ti84-lcd.js`
  - `TI-84_Plus_CE/error-banners.json`
  - `TI-84_Plus_CE/ROM.transpiled.js.gz`
- Present locally but not committed:
  - `TI-84_Plus_CE/ROM.transpiled.js` (`214168934` bytes, untracked)

### Broken or risky asset references

- `browser-shell.html:291-293` falls back to `import('./ROM.transpiled.js')`.
- That fallback file is not tracked by git, so GitHub Pages would not have it unless it is committed separately.
- Primary `.gz` boot path should work on modern browsers.
- Fallback path is currently broken for a clean Pages deploy.
- `browser-shell.html:807-819` fetches `./error-banners.json`, but that code has an inline fallback list if the JSON fetch fails, so this is not a blocker.

## URL Path Assumptions

- No absolute URLs, repo-root-prefixed paths, or hard-coded site base paths were found in `browser-shell.html`.
- All imports and fetches use `./...` relative paths.
- That means deployment works as long as `browser-shell.html` and its sibling assets stay together in the same directory.
- Expected URLs:
  - If `TI-84_Plus_CE` is published as the root of `gh-pages`: `https://<user>.github.io/<repo>/browser-shell.html`
  - If the whole repo is published from the default branch: `https://<user>.github.io/<repo>/TI-84_Plus_CE/browser-shell.html`

## Recommended Deploy Command

- Recommended branch-based deploy command:
  - `git subtree push --prefix TI-84_Plus_CE origin gh-pages`
- After that, set GitHub Pages to serve the `gh-pages` branch root if repo settings are not already configured.

## Blockers

- Workflow blocker: documented Phase 201 verification command is stale because `TI-84_Plus_CE/probe-golden-regression.mjs` is missing.
- Deploy risk: `ROM.transpiled.js` fallback is untracked, so fallback boot will fail on GitHub Pages if the `.gz` path fails or `DecompressionStream` is unavailable.
- Deployment not yet set up through `gh-pages`: the branch does not exist in this checkout.

