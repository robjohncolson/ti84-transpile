# Phase 144 - Wire Scan-Code Translation Table into Browser Shell

## Summary

- Extracted the full 228-byte scan-code translation table directly from [`ROM.rom`](./ROM.rom) at `0x09F79B`.
- Added [`scancode-translate.js`](./scancode-translate.js), a static browser-side lookup table generated from those ROM bytes.
- Added [`probe-phase144-scancode-table.mjs`](./probe-phase144-scancode-table.mjs) to dump all four modifier sections and classify each translated value as printable ASCII, control, or function token.
- Wired [`browser-shell.html`](./browser-shell.html) so a browser key press now writes the translated internal OS key code to `0xD0058E` instead of leaving the shell dependent on raw scan-style input.

## Findings

### ROM table layout

The table is four contiguous 57-byte sections:

- Bytes `0-56`: unmodified
- Bytes `57-113`: `2nd`
- Bytes `114-170`: `alpha`
- Bytes `171-227`: `alpha+2nd`

That contiguous layout matters in the browser shell. The ROM routine uses offset arithmetic around `0x38`, `0x70`, and `0xA8`, but that logic assumes the sequential scan code is already in `A` and uses the ROM's internal calling convention. The shell-side lookup is simpler and safer as `scanCodeToKeyCode[modifier][scanCode]`.

### Existing keyboard path

[`ti84-keyboard.js`](./ti84-keyboard.js) only updates the keyboard matrix and raises the keyboard IRQ. It does not translate scan codes to internal OS key codes.

[`browser-shell.html`](./browser-shell.html) attached `keydown` and `keyup` listeners and ran a short CPU burst after `keydown`, but it did not seed `0xD0058E` itself. The on-screen "Scan" display also showed the raw `(group << 4) | bit` matrix position rather than the `_GetCSC`-style scan code that Phase 144 is about.

## Implementation

### New generated table

[`scancode-translate.js`](./scancode-translate.js) exports:

```javascript
export const scanCodeToKeyCode = [ ... ];
```

The bytes come straight from `ROM.rom` at `0x09F79B`. No values were guessed or hand-authored.

### Browser shell wiring

[`browser-shell.html`](./browser-shell.html):

- imports `scanCodeToKeyCode`
- maps browser `event.code` values to `_GetCSC` scan codes
- reads the current modifier byte from `0xD00092` (`IY + 0x12`)
- derives `modifier = (alpha ? 2 : 0) | (second ? 1 : 0)`
- writes the translated internal key code to `0xD0058E` with `cpu.write8(...)`
- skips zero-value entries so modifier-only keys continue to rely on the matrix/IRQ path
- updates the UI scan display to show the `_GetCSC` scan code rather than the raw matrix position

This keeps the existing matrix and IRQ behavior in place while making the shell feed the same translated key-code domain the classifier at `0x08C4A3` expects.

## Probe output

[`probe-phase144-scancode-table.mjs`](./probe-phase144-scancode-table.mjs) prints:

- one markdown table per modifier section
- `scan_code -> translated_code`
- a classification column for printable ASCII, control, or function token
- section summaries listing which scan codes land in each class

## Notes

- GitNexus impact analysis could not be completed in this subagent session because the configured GitNexus repo index for `follow-alongs` was unavailable.
- No post-patch verification commands were run here because the subagent instructions explicitly prohibited tests and verification after patching.
