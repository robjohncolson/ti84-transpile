# Phase 80-4 Browser Memory Fix

Changed `browser-shell.html` in three places:

- `renderErrorBanner`: allocates a 16 MB `Uint8Array`, copies the decoded ROM into it, and uses that full-address-space buffer for executor memory, sentinel writes, VRAM clears, color setup, and LCD rendering.
- `showScreen`: allocates the same 16 MB buffer and switches all post-decode memory access in the function from the raw ROM buffer to the full `mem` buffer.
- Boot button handler: decodes into `romBytes`, copies into a 16 MB `mem` buffer, then reassigns `romBytes = mem` so the existing boot-path code keeps working without a larger refactor.

Edit size:

- `browser-shell.html`: about 24 changed lines across the three targeted sections.
- `phase80-4-browser-fix-report.md`: new file, 11 lines.

Gotchas:

- The boot handler could not keep `const romBytes` if it needed to keep the existing downstream variable name, so it was changed to `let romBytes` before reassigning it to the 16 MB buffer.
- `renderErrorBanner` uses a small `memory.write` helper, so that helper also had to be redirected to `mem` to avoid leaving writes on the short ROM buffer.
- GitNexus impact calls were attempted for `showScreen` and `renderErrorBanner`, but the MCP returned a cancellation response in this subagent session instead of blast-radius data.

Status:

- This change is untested in a browser in this session.
- Next session should visually verify the render buttons and error-banner paths in `browser-shell.html`.
