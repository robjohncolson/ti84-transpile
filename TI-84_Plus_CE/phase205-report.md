# Phase 205 — Browser-Shell Deploy

Date: 2026-04-19

## Result

Live at: **https://robjohncolson.github.io/apstats-live-worksheet/browser-shell.html**

- `browser-shell.html` — HTTP 200, 62,961 bytes
- `ROM.transpiled.js.gz` — HTTP 200, 15,882,727 bytes (served as `application/gzip`)

## Steps

1. Golden regression reconfirmed on `master@2808b2d` — 26/26 exact at row 39 col 2, Normal/Float/Radian 3/3 PASS.
2. `git subtree split --prefix=TI-84_Plus_CE -b gh-pages` — 421 commits, ~60s.
3. First push attempt with defaults failed with Windows/Schannel `SEC_E_MESSAGE_ALTERED` mid-transfer of the 17 MB `.gz`.
4. Retry with `git -c http.version=HTTP/1.1 -c http.postBuffer=1048576000 push origin gh-pages` succeeded. Remote warned on the uncommitted 64 MB `ROM.transpiled.js` blob in history but the push completed.
5. `gh api repos/robjohncolson/apstats-live-worksheet/pages` showed Pages already enabled but serving from `master/`. Switched via `PUT` with `source[branch]=gh-pages`, `source[path]=/`.
6. Manual rebuild triggered via `POST /pages/builds`. Build on `15ddcee` went `queued → building → built`, took ~2 minutes.
7. Curl confirmed 200 for both the HTML and the gzip asset.

## Known constraints

- `HTTP/1.1` + bumped `http.postBuffer` required on this Windows/Git-for-Windows setup to avoid Schannel TLS resets on large pushes. Store this for future re-deploys.
- `ROM.transpiled.js` (untracked, 214 MB local) is not deployed; the `.gz` path is the only live boot path. `DecompressionStream` is supported in all modern evergreen browsers, so this is fine.
- Jekyll runs by default on gh-pages but does not skip any of our files (no leading `_` or `.` in served assets).

## Next steps

- Visually verify the deployed shell in a browser: boot → "Normal Float Radian" + battery icon at row 39.
- If seeds change, re-run `gzip -kf -9 TI-84_Plus_CE/ROM.transpiled.js`, commit on master, then `git subtree split --prefix=TI-84_Plus_CE -b gh-pages` (re-create local branch) and `git -c http.version=HTTP/1.1 push -f origin gh-pages`.
