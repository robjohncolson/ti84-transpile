/**
 * probe-phase497-cursor-blink-caller.mjs — Phase 5 (final summary)
 *
 * CONFIRMED: Cursor blink toggle is at 0x096BEE.
 * Structure:
 *   0x096BEE: BIT 2,(IY+0x0D)     ; test cursor visible flag
 *   0x096BF2: JP Z, 0x096CCF      ; if HIDDEN → jump to show routine
 *   0x096BF6: RES 2,(IY+0x0D)     ; mark cursor as hidden
 *   0x096BFA: CALL 0x096CCF        ; execute show routine (which erases?)
 *   0x096BFE: SET 2,(IY+0x0D)     ; mark cursor as visible again
 *   0x096C02: RET
 *
 * Wait — re-reading: when bit 2 is SET (cursor visible):
 *   - RES 2 (mark hidden) → CALL 0x096CCF → SET 2 (mark visible) → RET
 *   That's: erase cursor → redraw cursor cycle? No...
 *
 * Actually the toggle logic is:
 *   - If bit 2 is SET (visible): RES 2 → CALL 0x096CCF → SET 2 → RET
 *     This means: temporarily hide → do something → re-show. NOT a toggle.
 *
 * OR: if bit 2 = 0 (cursor drawn on screen): JP to show (which erases the char)
 *     if bit 2 = 1 (cursor NOT drawn): RES → CALL show (draw cursor) → SET → RET
 *
 * Need to trace who calls this and when. The caller is at 0x096BE5 which is
 * called from 0x096BE9. Need to find WHO calls 0x096BC3 or 0x096BE5.
 *
 * This phase: find the timer/ISR path that triggers cursor blink.
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function hex6(v) {
  return '0x' + v.toString(16).padStart(6, '0');
}

function findAll(buf, pattern) {
  const results = [];
  for (let i = 0; i <= buf.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (buf[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) results.push(i);
  }
  return results;
}

function disasmRange(start, end) {
  let pc = start;
  const lines = [];
  while (pc < end && pc < rom.length) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      if (!inst || inst.length === 0) {
        lines.push(`  ${hex6(pc)}: ${rom[pc].toString(16).padStart(2,'0')}              ???`);
        pc++;
        continue;
      }
      const bytes = [];
      for (let i = 0; i < inst.length; i++) bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
      const mnemonic = inst.mnemonic || '???';
      const operands = inst.operands || '';
      let annotation = '';

      if ((mnemonic === 'call' || mnemonic === 'jp') && operands.includes('0x')) {
        const m = operands.match(/0x([0-9a-f]+)/i);
        if (m) {
          const target = parseInt(m[1], 16);
          const names = {
            0x061980: 'putchar',
            0x061003: 'cursor_erase',
            0x061061: 'cursor_draw',
            0x060EF5: 'cursor_blink_orchestrator',
            0x060F85: 'cursor_blink_alt',
            0x096BEE: 'cursor_blink_toggle',
            0x096CCF: 'cursor_show_subroutine',
            0x096BC3: 'cursor_blink_wrapper',
            0x096BE5: 'cursor_blink_entry',
            0x07F9FB: 'unknown_07F9FB',
            0x096F67: 'unknown_096F67',
          };
          if (names[target]) annotation = `  ; ${names[target]}`;
        }
      }
      if (bytes[0] === 'fd' && bytes[1] === 'cb') {
        const disp = parseInt(bytes[2], 16);
        const op = parseInt(bytes[3], 16);
        const group = (op >> 6) & 3;
        const bit = (op >> 3) & 7;
        const groupName = ['rot', 'bit', 'res', 'set'][group];
        annotation = `  ; ${groupName} ${bit},(iy+0x${disp.toString(16)})`;
      }

      lines.push(`  ${hex6(pc)}: ${bytes.join(' ').padEnd(18)} ${mnemonic} ${operands}${annotation}`);
      pc = inst.nextPc;
    } catch (e) {
      lines.push(`  ${hex6(pc)}: ${rom[pc].toString(16).padStart(2,'0')}              (decode error)`);
      pc++;
    }
  }
  return lines;
}

// ══════════════════════════════════════════════════════════════════════
// FIND CALLERS of 0x096BC3 (the broader blink function)
// ══════════════════════════════════════════════════════════════════════

console.log('=== CALLERS of cursor_blink_wrapper @ 0x096BC3 ===\n');

const call96BC3 = findAll(rom, Buffer.from([0xCD, 0xC3, 0x6B, 0x09]));
const jp96BC3 = findAll(rom, Buffer.from([0xC3, 0xC3, 0x6B, 0x09]));
console.log(`CALL 0x096BC3: ${call96BC3.map(hex6).join(', ') || '(none)'}`);
console.log(`JP   0x096BC3: ${jp96BC3.map(hex6).join(', ') || '(none)'}`);

for (const caller of [...call96BC3, ...jp96BC3]) {
  console.log(`\n  Context at ${hex6(caller)}:`);
  const cLines = disasmRange(Math.max(0, caller - 30), Math.min(rom.length, caller + 20));
  for (const l of cLines) console.log(l);
}

// ══════════════════════════════════════════════════════════════════════
// FIND CALLERS of 0x096BE5
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== CALLERS of cursor_blink_entry @ 0x096BE5 ===\n');

const call96BE5 = findAll(rom, Buffer.from([0xCD, 0xE5, 0x6B, 0x09]));
const jp96BE5 = findAll(rom, Buffer.from([0xC3, 0xE5, 0x6B, 0x09]));
console.log(`CALL 0x096BE5: ${call96BE5.map(hex6).join(', ') || '(none)'}`);
console.log(`JP   0x096BE5: ${jp96BE5.map(hex6).join(', ') || '(none)'}`);

for (const caller of [...call96BE5, ...jp96BE5]) {
  console.log(`\n  Context at ${hex6(caller)}:`);
  const cLines = disasmRange(Math.max(0, caller - 30), Math.min(rom.length, caller + 20));
  for (const l of cLines) console.log(l);
}

// ══════════════════════════════════════════════════════════════════════
// Also: 0x096BE5 itself calls 0x07F9FB first. What is that?
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Function @ 0x07F9FB (called before blink toggle) ===\n');

const lines07F9 = disasmRange(0x07F9FB, 0x07FA40);
for (const l of lines07F9) console.log(l);

// ══════════════════════════════════════════════════════════════════════
// The function at 0x096BBE calls 0x096BC3. Let's find who calls 0x096BBE
// Actually, let's look at the broader picture. The function containing
// 0x096BC3 starts at 0x096BC3 (after RET at 0x096BC2).
// The function at 0x096BE5 starts at 0x096BE5 (after RET at 0x096BE4).
//
// But the REAL question: who dispatches the blink? Timer ISR?
// Let's search for the ISR handler and its path to cursor blink.
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Searching for the timer path to cursor blink ===\n');

// The cursor blink is typically called from the main loop or a keyboard scan.
// On TI-84 CE, the OS uses a GetCSC / GetKey loop that also handles cursor blink.
// Let's find what calls 0x096BC3 from its callers' callers.

// First: 0x096BBE calls 0x096BC3
const call96BBE = findAll(rom, Buffer.from([0xCD, 0xBE, 0x6B, 0x09]));
console.log(`CALL 0x096BBE: ${call96BBE.map(hex6).join(', ') || '(none)'}`);

// Look for the cursor blink counter decrement pattern
// Typically: DEC (HL) or DEC (IY+xx) → JR NZ,skip → call blink
console.log('\nSearching for DEC + cursor_blink pattern...');

// Search for CALL 0x096BEE in a wider context
// We know 0x096BE9 calls it. What calls 0x096BE5?
// 0x096BE5: CD FB F9 07 = CALL 0x07F9FB
//            CD EE 6B 09 = CALL 0x096BEE
//            C9          = RET
// This is a tiny wrapper. Who calls IT?

// Already searched above. Let's also look for the blink COUNTER.
// On TI-OS, cursorCount is typically at (IY+0x4C) or similar, decremented each tick.

console.log('\n=== Search for DEC patterns near blink calls ===\n');

// Look in the region around callers
for (const caller of [...call96BC3, ...call96BE5]) {
  // Check for DEC or counter patterns in the 50 bytes before the call
  const regionStart = Math.max(0, caller - 50);
  const regionEnd = caller + 4;
  console.log(`\n  Region before call at ${hex6(caller)}:`);
  const rLines = disasmRange(regionStart, regionEnd);
  for (const l of rLines) console.log(l);
}

// ══════════════════════════════════════════════════════════════════════
// The function 0x096B65-0x096BC2 is interesting. It calls 0x096C26 inside.
// Let's find who calls 0x096B65 and 0x096B14.
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== CALLERS of 0x096B65 ===\n');
const call96B65 = findAll(rom, Buffer.from([0xCD, 0x65, 0x6B, 0x09]));
const jp96B65 = findAll(rom, Buffer.from([0xC3, 0x65, 0x6B, 0x09]));
console.log(`CALL: ${call96B65.map(hex6).join(', ') || '(none)'}`);
console.log(`JP:   ${jp96B65.map(hex6).join(', ') || '(none)'}`);

for (const caller of [...call96B65, ...jp96B65].slice(0, 5)) {
  const cLines = disasmRange(Math.max(0, caller - 20), Math.min(rom.length, caller + 20));
  for (const l of cLines) console.log(l);
  console.log('');
}

console.log('\n=== CALLERS of 0x096B14 ===\n');
const call96B14 = findAll(rom, Buffer.from([0xCD, 0x14, 0x6B, 0x09]));
const jp96B14 = findAll(rom, Buffer.from([0xC3, 0x14, 0x6B, 0x09]));
console.log(`CALL: ${call96B14.map(hex6).join(', ') || '(none)'}`);
console.log(`JP:   ${jp96B14.map(hex6).join(', ') || '(none)'}`);

for (const caller of [...call96B14, ...jp96B14].slice(0, 5)) {
  const cLines = disasmRange(Math.max(0, caller - 20), Math.min(rom.length, caller + 20));
  for (const l of cLines) console.log(l);
  console.log('');
}

// ══════════════════════════════════════════════════════════════════════
// FINAL: Look for where cursor blink is triggered from the event loop
// The OS event loop typically has a GetCSC that includes blink timing.
// Search for the known "curBlink" counter addresses.
// On TI-84 CE, cursor blink counter is typically at curTime or similar.
// Let's look at what 0x07F9FB does — it's called right before the toggle.
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Full 0x07F9FB function ===\n');

// Find end
let end07FA = 0x07FA00;
for (let i = 0x07F9FB; i < 0x07FA80; i++) {
  if (rom[i] === 0xC9) { end07FA = i + 1; break; }
}
const linesFA = disasmRange(0x07F9FB, end07FA);
for (const l of linesFA) console.log(l);

// ══════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║ CURSOR BLINK ARCHITECTURE SUMMARY                           ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log('║                                                              ║');
console.log('║ 0x096BEE = CursorBlinkToggle                                ║');
console.log('║   BIT 2,(IY+0x0D)  — test cursor-currently-drawn flag       ║');
console.log('║   JP Z, 0x096CCF   — if NOT drawn → draw it                 ║');
console.log('║   RES 2,(IY+0x0D)  — mark as not-drawn                      ║');
console.log('║   CALL 0x096CCF    — redraw/update cursor area              ║');
console.log('║   SET 2,(IY+0x0D)  — mark as drawn                          ║');
console.log('║   RET                                                        ║');
console.log('║                                                              ║');
console.log('║ 0x096CCF = CursorShowSubroutine                             ║');
console.log('║   Called from both paths of the toggle                       ║');
console.log('║                                                              ║');
console.log('║ 0x096BE5 = CursorBlinkEntry (wrapper)                       ║');
console.log('║   CALL 0x07F9FB (pre-blink setup)                           ║');
console.log('║   CALL 0x096BEE (the toggle)                                ║');
console.log('║   RET                                                        ║');
console.log('║                                                              ║');
console.log('║ 0x096BC3 = CursorBlinkWrapper (broader function)            ║');
console.log('║   Checks conditions, then falls through to toggle           ║');
console.log('║                                                              ║');
console.log('║ (IY+0x0D) bit 2 = cursor currently visible on screen        ║');
console.log('║ 0x060EF5 = CursorBlinkOrchestrator (called from main loop)  ║');
console.log('║ 0x061003 = CursorErase                                      ║');
console.log('║ 0x061061 = CursorDraw                                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

console.log('\nDone.');
