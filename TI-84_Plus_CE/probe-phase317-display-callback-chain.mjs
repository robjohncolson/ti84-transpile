/**
 * probe-phase317-display-callback-chain.mjs
 *
 * Traces the display callback dispatch call chain from 0x05F685.
 * Verifies ROM byte patterns for the entire chain:
 *   0x05F685 -> CALL 0x000580 -> JP 0x010220 (display callback dispatch)
 *   Caller: 0x03D14F in LCD SPI command handler (SET 4,A case)
 *   ISR entry: 0x000043 -> 0x0006F3 -> 0x00071C -> JP 0x02010C -> JP 0x03CF7D
 *   Event loop: 0x02FE02 -> CALL 0x03D1BE (indirect LCD SPI trigger)
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    pass++;
  } else {
    console.log(`  FAIL: ${label}`);
    fail++;
  }
}

function romU8(addr) { return rom[addr]; }
function romU24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }

function findCallsTo(targetAddr) {
  const results = [];
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  for (let i = 0; i < rom.length - 3; i++) {
    if ((rom[i] === 0xCD || rom[i] === 0xC3) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push({ addr: i, type: rom[i] === 0xCD ? 'CALL' : 'JP' });
    }
  }
  return results;
}

// === Section 1: 0x05F685 wrapper ===
console.log('\n[1] 0x05F685 display callback dispatch wrapper');
check('0x05F685 is CALL 0x000580 (CD 80 05 00)',
  romU8(0x05F685) === 0xCD && romU24(0x05F686) === 0x000580);
check('0x05F689 is RET (C9)',
  romU8(0x05F689) === 0xC9);

// === Section 2: OS vector entry 0 at 0x000580 ===
console.log('\n[2] OS vector entry 0 at 0x000580');
check('0x000580 is JP 0x010220 (C3 20 02 01)',
  romU8(0x000580) === 0xC3 && romU24(0x000581) === 0x010220);

// === Section 3: Single caller of 0x05F685 ===
console.log('\n[3] Callers of 0x05F685');
const callers_05F685 = findCallsTo(0x05F685);
check('Exactly 1 CALL to 0x05F685', callers_05F685.length === 1);
check('Caller is at 0x03D14F',
  callers_05F685.length === 1 && callers_05F685[0].addr === 0x03D14F);
check('Caller is a CALL (not JP)',
  callers_05F685.length === 1 && callers_05F685[0].type === 'CALL');

// === Section 4: LCD SPI command handler dispatch ===
console.log('\n[4] LCD SPI command handler dispatch pattern');
// SET 4,A (CB E7) at 0x03D140-0x03D141, then OUT (C),A at 0x03D142-0x03D143
check('SET 4,A (CB E7) at 0x03D140',
  romU8(0x03D140) === 0xCB && romU8(0x03D141) === 0xE7);
check('OUT (C),A (ED 79) at 0x03D142',
  romU8(0x03D142) === 0xED && romU8(0x03D143) === 0x79);
// Port B=0x50 check: LD A,B (78); CP 0x50 (FE 50); JR Z (28 01)
check('LD A,B; CP 0x50 port check at 0x03D144',
  romU8(0x03D144) === 0x78 && romU8(0x03D145) === 0xFE && romU8(0x03D146) === 0x50);

// === Section 5: Sibling cases in LCD SPI handler ===
console.log('\n[5] Sibling LCD SPI handler cases');
check('SET 1,A case -> CALL 0x02510E at 0x03D10A',
  romU8(0x03D10A) === 0xCD && romU24(0x03D10B) === 0x02510E);
check('SET 2,A case -> CALL 0x02510E at 0x03D123',
  romU8(0x03D123) === 0xCD && romU24(0x03D124) === 0x02510E);
check('SET 3,A case -> CALL 0x0BCC81 at 0x03D139',
  romU8(0x03D139) === 0xCD && romU24(0x03D13A) === 0x0BCC81);
check('SET 5,A case -> CALL 0x049526 at 0x03D165',
  romU8(0x03D165) === 0xCD && romU24(0x03D166) === 0x049526);

// === Section 6: LCD SPI handler entry via jump table ===
console.log('\n[6] LCD SPI handler entry paths');
check('Jump table entry 3 at 0x02010C: JP 0x03CF7D',
  romU8(0x02010C) === 0xC3 && romU24(0x02010D) === 0x03CF7D);
// JP 0x02010C is at 0x00071D (0x00071C = 0x00, the high byte of previous instruction's address)
check('JP 0x02010C at 0x00071D (ISR dispatch)',
  romU8(0x00071D) === 0xC3 && romU24(0x00071E) === 0x02010C);

// === Section 7: ISR path from interrupt vector ===
console.log('\n[7] ISR path from interrupt vector');
check('0x000043: JP 0x0006F3 (C3 F3 06 00)',
  romU8(0x000043) === 0xC3 && romU24(0x000044) === 0x0006F3);

// === Section 8: Event loop indirect connection ===
console.log('\n[8] Event loop indirect connection');
check('Event loop at 0x02FE02: CALL 0x03D1BE',
  romU8(0x02FE02) === 0xCD && romU24(0x02FE03) === 0x03D1BE);
check('0x03D1BE calls 0x03D1E4 (SPI dispatch setup)',
  romU8(0x03D1DD) === 0xCD && romU24(0x03D1DE) === 0x03D1E4);
check('Event loop calls key handler at 0x02FD8F',
  romU8(0x02FCC2) === 0xCD && romU24(0x02FCC3) === 0x02FD8F);

// === Section 9: Display callback struct at D177xx ===
console.log('\n[9] Display callback struct references in 0x010220');
// Verify the function reads D177BC (enable flag) early
// At 0x010228: 3A BC 77 D1 = LD A,(D177BC)
check('LD A,(D177BC) at 0x010228 (enable flag check)',
  romU8(0x010228) === 0x3A && romU24(0x010229) === 0xD177BC);
// D177D6 pending flags: 3A D6 77 D1 at multiple locations
// LD A,(D177D6) at 0x01026D (3A D6 77 D1)
check('LD A,(D177D6) at 0x01026D (pending flags)',
  romU8(0x01026D) === 0x3A && romU24(0x01026E) === 0xD177D6);
// Slot 0 pointer: 2A BD 77 D1 = LD HL,(D177BD) - search for it in the function
// At 0x010256: 32 D7 77 D1 = LD (D177D7),A -> confirms D177D7 ref
check('LD (D177D7),A at 0x010256 (command byte store)',
  romU8(0x010256) === 0x32 && romU24(0x010257) === 0xD177D7);

// === Section 10: 0x000580 is exclusively called from 0x05F685 ===
console.log('\n[10] 0x000580 exclusivity');
const callers_000580 = findCallsTo(0x000580);
check('0x000580 called from exactly 1 location',
  callers_000580.length === 1);
check('That location is 0x05F685',
  callers_000580.length === 1 && callers_000580[0].addr === 0x05F685);

// === Summary ===
console.log(`\n=== RESULTS: ${pass} PASS, ${fail} FAIL out of ${pass + fail} ===`);
if (fail > 0) process.exit(1);
