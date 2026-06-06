/**
 * probe-phase540-error-code-map.mjs
 *
 * Maps all 44 error dispatch entries at 0x061D00-0x061DB2.
 * Each entry: LD A, errCode (3E nn) + JR/JP to shared handler at 0x061DB2.
 * The first entry at 0x061D00 is a bare JR that jumps into the table (entry 0).
 *
 * Cross-references each entry address against the full ROM to count callers.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

// --- Known TI-OS SDK error names (error code -> name) ---
// The table uses 0x80-based codes directly. SDK index = code - 0x80.
const SDK_ERRORS = {
  0x81: 'E_OVERFLOW',    0x82: 'E_DIVBY0',       0x83: 'E_SINGULARMAT',
  0x84: 'E_DOMAIN',      0x85: 'E_INCREMENT',     0x86: 'E_BREAK',
  0x87: 'E_NONREAL',     0x88: 'E_SYNTAX',        0x89: 'E_DATATYPE',
  0x8A: 'E_ARGUMENT',    0x8B: 'E_DIMMISMATCH',   0x8C: 'E_DIMENSION',
  0x8D: 'E_UNDEFINED',   0x8E: 'E_MEMORY',        0x8F: 'E_INVALID',
  0x90: 'E_ILLEGALNEST', 0x91: 'E_BOUND',         0x92: 'E_GRAPHRANGE',
  0x93: 'E_ZOOM',        0x94: 'E_LABEL',         0x95: 'E_STAT',
  0x96: 'E_SOLVER',      0x98: 'E_SIGNCHANGE',
  0x99: 'E_ITERATIONS',  0x9A: 'E_BADGUESS',      0x9B: 'E_STATPLOT',
  0x9C: 'E_TOL_NOT_MET', 0x9D: 'E_LINK_ERROR',    0x9E: 'E_RESERVED_9E',
  0x9F: 'E_RESERVED_9F',
  0xAA: 'E_RESERVED_AA', 0xAB: 'E_RESERVED_AB',   0xAC: 'E_RESERVED_AC',
  0xAF: 'E_RESERVED_AF',
  0xB4: 'E_RESERVED_B4', 0xB5: 'E_RESERVED_B5',
  // Low codes (non-0x80-based, possibly internal)
  0x0E: 'E_INT_0E',      0x15: 'E_INT_15',        0x1B: 'E_INT_1B',
  0x28: 'E_INT_28',      0x2D: 'E_INT_2D',        0x2E: 'E_INT_2E',
  0x2F: 'E_INT_2F',      0x30: 'E_INT_30',        0x31: 'E_INT_31',
  0x36: 'E_INT_36',
};

// --- Parse the dispatch table ---

const TABLE_START = 0x061D00;
const TABLE_END   = 0x061DB2; // shared handler starts here

const entries = [];
let addr = TABLE_START;

while (addr < TABLE_END) {
  const b0 = rom[addr];

  if (b0 === 0x3E) {
    // LD A, n
    const errCode = rom[addr + 1];
    const b2 = rom[addr + 2];
    let entrySize;
    let jumpTarget;

    if (b2 === 0x18) {
      // JR offset (signed byte)
      const offset = rom[addr + 3] < 128 ? rom[addr + 3] : rom[addr + 3] - 256;
      jumpTarget = addr + 4 + offset;
      entrySize = 4;
    } else if (b2 === 0xC3) {
      // JP addr (3-byte LE)
      jumpTarget = rom[addr + 3] | (rom[addr + 4] << 8) | (rom[addr + 5] << 16);
      entrySize = 6;
    } else {
      entrySize = 3;
      jumpTarget = null;
    }

    entries.push({ addr, errCode, jumpTarget, size: entrySize });
    addr += entrySize;

  } else if (b0 === 0x18) {
    // Bare JR (entry 0 at 0x061D00 — jumps forward, effectively default/no-error path)
    const offset = rom[addr + 1] < 128 ? rom[addr + 1] : rom[addr + 1] - 256;
    const jumpTarget = addr + 2 + offset;
    entries.push({ addr, errCode: null, jumpTarget, size: 2, bareJR: true });
    addr += 2;

  } else {
    console.log(`UNEXPECTED byte 0x${b0.toString(16)} at 0x${addr.toString(16)}`);
    addr++;
  }
}

// --- Count cross-references ---
// For each entry address, scan the ROM for 3-byte LE address references
// preceded by CALL (0xCD), JP (0xC3), or conditional JP/CALL opcodes.

function countXrefs(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  let count = 0;

  const romLen = rom.length;
  for (let i = 1; i < romLen - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      const prev = rom[i - 1];
      // CALL nn / JP nn / conditional variants
      if (prev === 0xCD || prev === 0xC3 ||
          prev === 0xC2 || prev === 0xCA || prev === 0xD2 || prev === 0xDA ||
          prev === 0xE2 || prev === 0xEA || prev === 0xF2 || prev === 0xFA ||
          prev === 0xC4 || prev === 0xCC || prev === 0xD4 || prev === 0xDC ||
          prev === 0xE4 || prev === 0xEC || prev === 0xF4 || prev === 0xFC) {
        count++;
      }
    }
  }
  return count;
}

// --- Output results ---

console.log('=== TI-OS Error Dispatch Table (0x061D00 - 0x061DB2) ===');
console.log('');
console.log('Entry  Address   ErrCode  Decimal  SDK Name              Jump Target  Xrefs');
console.log('-----  --------  -------  -------  --------------------  -----------  -----');

let entryNum = 0;
for (const e of entries) {
  const xrefs = countXrefs(e.addr);
  const addrStr = '0x' + e.addr.toString(16).padStart(6, '0');
  const jumpStr = e.jumpTarget !== null
    ? '0x' + e.jumpTarget.toString(16).padStart(6, '0')
    : '???';

  if (e.bareJR) {
    console.log(
      `${String(entryNum).padStart(5)}  ${addrStr}  (bare JR)          default/goto handler  ${jumpStr}  ${String(xrefs).padStart(5)}`
    );
  } else {
    const codeHex = '0x' + e.errCode.toString(16).padStart(2, '0');
    const codeDec = String(e.errCode).padStart(3);
    const sdkName = SDK_ERRORS[e.errCode] || '(unknown)';

    let sdkIndex = '';
    if (e.errCode >= 0x80) {
      sdkIndex = ` (idx ${e.errCode - 0x80})`;
    }

    console.log(
      `${String(entryNum).padStart(5)}  ${addrStr}  ${codeHex.padEnd(7)}  ${codeDec}      ${(sdkName + sdkIndex).padEnd(22)}  ${jumpStr}  ${String(xrefs).padStart(5)}`
    );
  }
  entryNum++;
}

console.log('');
console.log(`Total entries: ${entries.length}`);

// --- Summary by error code, sorted by xref count ---
console.log('');
console.log('=== Error Code Summary (sorted by xref count) ===');
console.log('');

const summary = entries
  .filter(e => !e.bareJR)
  .map(e => ({
    addr: e.addr,
    errCode: e.errCode,
    name: SDK_ERRORS[e.errCode] || '(unknown)',
    xrefs: countXrefs(e.addr),
  }))
  .sort((a, b) => b.xrefs - a.xrefs);

for (const s of summary) {
  const codeHex = '0x' + s.errCode.toString(16).padStart(2, '0');
  console.log(
    `  ${codeHex} ${s.name.padEnd(20)} at 0x${s.addr.toString(16).padStart(6, '0')}  ${String(s.xrefs).padStart(4)} xrefs`
  );
}

// --- Verify all JR/JP targets resolve to 0x061DB2 ---
console.log('');
console.log('=== Jump Target Verification ===');
const badTargets = entries.filter(
  e => e.jumpTarget !== null && e.jumpTarget !== TABLE_END
);
if (badTargets.length === 0) {
  console.log('All entries jump to shared handler at 0x061DB2. OK.');
} else {
  console.log(
    `WARNING: ${badTargets.length} entries DO NOT jump to 0x061DB2:`
  );
  for (const e of badTargets) {
    console.log(
      `  0x${e.addr.toString(16).padStart(6, '0')} -> 0x${e.jumpTarget.toString(16).padStart(6, '0')}`
    );
  }
}

// --- Handler bytes at 0x061DB2 ---
console.log('');
console.log('=== Shared Handler at 0x061DB2 (first 16 bytes) ===');
let handlerHex = '';
for (let i = 0; i < 16; i++) {
  handlerHex += rom[TABLE_END + i].toString(16).padStart(2, '0') + ' ';
}
console.log(handlerHex.trim());
console.log('  32 DF 08 D0 = LD (0xD008DF),A  -- store error code');
console.log('  CD B4 E1 03 = CALL 0x03E1B4    -- error handler routine');

console.log('');
console.log('DONE');
