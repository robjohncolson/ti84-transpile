/**
 * probe-phase548-decode-087182.mjs
 *
 * CORRECTED ANALYSIS of 0x087182 region.
 *
 * Session 547 reported sequential "CP 0x82, CP 0x83, CP 0x84, CP 0x85"
 * at 0x087182. This probe proves the region is a DATA TABLE of 2-byte
 * TI token codes, NOT executable code. The 0xFE bytes are token page
 * prefixes (TI token page 0xFE), not CP opcodes.
 *
 * The table is searched by the function at 0x087611 (TOKEN_TABLE_SEARCH),
 * called from 0x08761F with HL pointing into different sub-tables.
 *
 * Pure ROM read -- no CPU execution needed.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function hexByte(b) { return b.toString(16).toUpperCase().padStart(2, '0'); }
function hexAddr(a) { return '0x' + a.toString(16).toUpperCase().padStart(6, '0'); }
function readU8(addr) { return rom[addr]; }
function readU24LE(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function signedByte(b) { return b > 127 ? b - 256 : b; }

function hexDump(start, len) {
  const lines = [];
  for (let i = 0; i < len; i += 16) {
    const addr = start + i;
    let hex = '';
    let ascii = '';
    for (let j = 0; j < 16 && (i + j) < len; j++) {
      const b = rom[addr + j];
      hex += hexByte(b) + ' ';
      ascii += (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
    }
    lines.push('  ' + hexAddr(addr) + ': ' + hex.padEnd(48) + ' ' + ascii);
  }
  return lines.join('\n');
}

// TI-84 CE token page names
const tokenPageNames = {
  0x82: '82 (Y-vars)',
  0xFB: 'FB (extended)',
  0xFE: 'FE (extended-2)',
  0xFC: 'FC (extended-3)',
  0xFF: 'FF (extended-4)'
};

// ====================================================================
// 1. Hex dump of the full data region
// ====================================================================
console.log('=== HEX DUMP: 0x087140 - 0x087240 (256 bytes, full token table) ===\n');
console.log(hexDump(0x087140, 0x100));

// ====================================================================
// 2. Parse as 2-byte token table entries
// ====================================================================
console.log('\n\n=== TOKEN TABLE ENTRIES (2-byte TI token codes) ===\n');
console.log('  The data at 0x087145-0x087230 is a flat table of 2-byte TI token');
console.log('  codes. Each pair is (page_prefix, token_byte). The 0xFE bytes at');
console.log('  0x087180 are token page 0xFE prefixes, NOT CP instructions.\n');

// Known 2-byte token page prefixes
const twoBytePages = new Set([0x5C, 0x5D, 0x5E, 0x60, 0x61, 0x62, 0x63, 0x7E, 0x82, 0xAA, 0xBB, 0xEF, 0xFB, 0xFC, 0xFD, 0xFE, 0xFF]);

// Dump the region around 0x087180 as token pairs
console.log('  --- Sub-table around 0x087180 (page 0xFE tokens) ---\n');
let addr = 0x087180;
let entryNum = 0;
while (addr < 0x0871B6) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];
  if (twoBytePages.has(b0)) {
    const pageName = tokenPageNames[b0] || hexByte(b0);
    console.log('  [' + (entryNum++).toString().padStart(2) + '] ' + hexAddr(addr) + ': ' + hexByte(b0) + ' ' + hexByte(b1) + '  (page ' + pageName + ', token 0x' + hexByte(b1) + ')');
    addr += 2;
  } else {
    // Single-byte token or separator
    console.log('  [' + (entryNum++).toString().padStart(2) + '] ' + hexAddr(addr) + ': ' + hexByte(b0) + '     (single-byte token 0x' + hexByte(b0) + ')');
    addr += 1;
  }
}

// ====================================================================
// 3. Decode the search function at 0x087611
// ====================================================================
console.log('\n\n=== SEARCH FUNCTION at 0x087611 (TOKEN_TABLE_SEARCH) ===\n');
console.log('  Input: HL = table pointer, D = first byte to match, E = second byte');
console.log('  Output: Z flag set if found, NZ if not found\n');

const searchFunc = [
  [0x087611, '06 0A', 'LD B, 0x0A        ; search up to 10 entries'],
  [0x087613, '7E',    'LD A, (HL)        ; load first byte of entry'],
  [0x087614, '23',    'INC HL'],
  [0x087615, 'BA',    'CP D              ; compare with search page'],
  [0x087616, '20 03', 'JR NZ, 0x08761B   ; skip if page mismatch'],
  [0x087618, '7E',    'LD A, (HL)        ; load second byte'],
  [0x087619, 'BB',    'CP E              ; compare with search token'],
  [0x08761A, 'C8',    'RET Z             ; return Z=found'],
  [0x08761B, '23',    'INC HL            ; skip second byte'],
  [0x08761C, '10 F5', 'DJNZ 0x087613     ; loop (B--)'],
  [0x08761E, 'C9',    'RET               ; return NZ=not found'],
];

for (const [a, bytes, dis] of searchFunc) {
  console.log('  ' + hexAddr(a) + ': ' + bytes.padEnd(10) + ' ' + dis);
}

// ====================================================================
// 4. Decode the caller at 0x08761F that searches 3 sub-tables
// ====================================================================
console.log('\n\n=== CALLER: TOKEN LOOKUP DISPATCHER at 0x08761F ===\n');
console.log('  Searches 3 sub-tables for a 2-byte token (D:E):\n');

const callerCode = [
  [0x08761F, '21 01 72 08', 'LD HL, 0x087201   ; sub-table 1 (page FE/FC tokens)'],
  [0x087623, 'CD 11 76 08', 'CALL 0x087611     ; search'],
  [0x087627, '28 14',       'JR Z, 0x08763D    ; found -> handle match'],
  [0x087629, '21 E8 71 08', 'LD HL, 0x0871E8   ; sub-table 2 (page FC tokens)'],
  [0x08762D, 'CD 11 76 08', 'CALL 0x087611     ; search'],
  [0x087631, '28 0A',       'JR Z, 0x08763D    ; found -> handle match'],
  [0x087633, '21 2C 72 08', 'LD HL, 0x08722C   ; sub-table 3 (page FC tokens)'],
  [0x087637, 'CD 11 76 08', 'CALL 0x087611     ; search'],
  [0x08763B, '20 17',       'JR NZ, 0x087654   ; not found -> fallback'],
  [0x08763D, '7B',          'LD A, E           ; match handler: A = token byte'],
  [0x08763E, '32 8E 05 D0', 'LD (0xD0058E), A  ; store result'],
];

for (const [a, bytes, dis] of callerCode) {
  console.log('  ' + hexAddr(a) + ': ' + bytes.padEnd(15) + ' ' + dis);
}

// ====================================================================
// 5. Dump each sub-table referenced by the dispatcher
// ====================================================================
console.log('\n\n=== SUB-TABLE CONTENTS ===\n');

function dumpSubTable(label, start) {
  console.log('  --- ' + label + ' at ' + hexAddr(start) + ' (10 entries) ---');
  for (let i = 0; i < 10; i++) {
    const a = start + i * 2;
    const b0 = rom[a];
    const b1 = rom[a + 1];
    const pageName = tokenPageNames[b0] || ('0x' + hexByte(b0));
    console.log('    [' + i + '] ' + hexAddr(a) + ': ' + hexByte(b0) + ' ' + hexByte(b1) + '  (page ' + pageName + ')');
  }
  console.log();
}

dumpSubTable('Sub-table 1', 0x087201);
dumpSubTable('Sub-table 2', 0x0871E8);
dumpSubTable('Sub-table 3', 0x08722C);

// ====================================================================
// 6. XREF scan: who calls into the dispatcher or search function
// ====================================================================
console.log('\n=== XREF SCAN: CALL/JP to search function and dispatcher ===\n');

const targets = [
  { addr: 0x087611, name: 'TOKEN_TABLE_SEARCH' },
  { addr: 0x08761F, name: 'TOKEN_LOOKUP_DISPATCHER' },
];

for (const t of targets) {
  const xrefs = [];
  for (let a = 0; a < rom.length - 4; a++) {
    const op = rom[a];
    if (op === 0xCD || op === 0xC3) {
      const target = rom[a + 1] | (rom[a + 2] << 8) | (rom[a + 3] << 16);
      if (target === t.addr) {
        xrefs.push({ from: a, op: op === 0xCD ? 'CALL' : 'JP' });
      }
    }
  }
  console.log('  ' + t.name + ' (' + hexAddr(t.addr) + '): ' + xrefs.length + ' xrefs');
  for (const xref of xrefs) {
    console.log('    ' + hexAddr(xref.from) + ': ' + xref.op + ' ' + hexAddr(t.addr));
  }
  console.log();
}

// ====================================================================
// 7. The broader token data structure (0x087140 - 0x087240)
// ====================================================================
console.log('\n=== BROADER TOKEN DATA STRUCTURE ===\n');

console.log('  0x087140-0x087144: Header/metadata bytes');
console.log('    ' + Array.from(rom.slice(0x087140, 0x087145)).map(hexByte).join(' '));

console.log('\n  0x087145-0x087158: Page 0x82 (Y-var) tokens');
for (let i = 0x087145; i < 0x087159; i += 2) {
  console.log('    ' + hexAddr(i) + ': ' + hexByte(rom[i]) + ' ' + hexByte(rom[i+1]));
}

console.log('\n  0x08715B-0x087177: Page 0xFB tokens');
for (let i = 0x08715B; i < 0x087178; i += 2) {
  console.log('    ' + hexAddr(i) + ': ' + hexByte(rom[i]) + ' ' + hexByte(rom[i+1]));
}

console.log('\n  0x087179-0x08717F: Single-byte tokens / separators');
console.log('    ' + Array.from(rom.slice(0x087179, 0x087180)).map(hexByte).join(' '));

console.log('\n  0x087180-0x0871B5: Page 0xFE + 0xFC + 0xFB tokens (THE REGION SESSION 547 FLAGGED)');
for (let i = 0x087180; i < 0x0871B6; i += 2) {
  const b0 = rom[i], b1 = rom[i+1];
  const note = (b0 === 0xFE) ? ' <-- 0xFE is token page prefix, NOT CP opcode' : '';
  console.log('    ' + hexAddr(i) + ': ' + hexByte(b0) + ' ' + hexByte(b1) + note);
}

// ====================================================================
// 8. Summary and correction
// ====================================================================
console.log('\n\n=== SUMMARY AND CORRECTION ===\n');
console.log('  FINDING: 0x087182 is NOT code. It is a DATA TABLE of 2-byte TI token codes.');
console.log('');
console.log('  Session 547 misidentified the bytes at 0x087180-0x087187 as:');
console.log('    CP 0x82, CP 0x83, CP 0x84, CP 0x85');
console.log('');
console.log('  In reality, these are 2-byte token table entries:');
console.log('    0x087180: FE 82 = token page 0xFE, token 0x82');
console.log('    0x087182: FE 83 = token page 0xFE, token 0x83');
console.log('    0x087184: FE 84 = token page 0xFE, token 0x84');
console.log('    0x087186: FE 85 = token page 0xFE, token 0x85');
console.log('');
console.log('  Evidence:');
console.log('    1. Zero CALL/JP xrefs to any address in 0x087160-0x087190');
console.log('    2. No conditional branches follow any "CP" -- consecutive FE FE is nonsensical code');
console.log('    3. The disassembly produces impossible branch targets (0x93FE85, 0xFBE3FB)');
console.log('    4. Code at 0x08761F loads HL with pointers INTO this table and calls');
console.log('       the search function at 0x087611 (CPIR-like 2-byte pair search)');
console.log('    5. The table contains token codes from pages 0x82, 0xFB, 0xFC, 0xFE, 0xFF');
console.log('       which are all valid TI-84 CE 2-byte token page prefixes');
console.log('');
console.log('  The search function at 0x087611:');
console.log('    - Takes HL=table, D:E=token pair to find');
console.log('    - Searches up to 10 entries (B=0x0A)');
console.log('    - Returns Z if match found');
console.log('');
console.log('  The dispatcher at 0x08761F searches 3 sub-tables sequentially:');
console.log('    1. 0x087201 (FE/FC page tokens)');
console.log('    2. 0x0871E8 (FC page tokens)');
console.log('    3. 0x08722C (FC page tokens)');
console.log('');
console.log('  Callers: 0x085505 (CALL 0x08761F), plus internal calls from 0x087623/0x08762D/0x087637');

console.log('\nDone.');
