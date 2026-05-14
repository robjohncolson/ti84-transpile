/**
 * probe-phase318-display-callback-registration.mjs
 *
 * Verifies the display callback registration API vectors,
 * callback slot references, and mega-table/boot initialization patterns.
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

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function matchBytes(addr, bytes) {
  for (let i = 0; i < bytes.length; i++) {
    if (rom[addr + i] !== bytes[i]) return false;
  }
  return true;
}

function countPattern(bytes, start = 0, end = rom.length) {
  let count = 0;
  for (let i = start; i < end - bytes.length; i++) {
    if (matchBytes(i, bytes)) count++;
  }
  return count;
}

// --- 1. Verify 4 API vector entries ---

console.log('\n=== API Vector Entries ===');

const vecBase = 0x000200;

// Vector 224 -> dispatch
check('Vec 224 is JP', rom[vecBase + 224 * 4] === 0xC3);
check('Vec 224 -> 0x010220 (dispatch)', read24(vecBase + 224 * 4 + 1) === 0x010220);

// Vector 225 -> clear+init
check('Vec 225 is JP', rom[vecBase + 225 * 4] === 0xC3);
check('Vec 225 -> 0x010F00 (clear+init)', read24(vecBase + 225 * 4 + 1) === 0x010F00);

// Vector 248 -> install
check('Vec 248 is JP', rom[vecBase + 248 * 4] === 0xC3);
check('Vec 248 -> 0x01069C (install)', read24(vecBase + 248 * 4 + 1) === 0x01069C);

// Vector 249 -> reset
check('Vec 249 is JP', rom[vecBase + 249 * 4] === 0xC3);
check('Vec 249 -> 0x010EDD (reset)', read24(vecBase + 249 * 4 + 1) === 0x010EDD);


// --- 2. Verify D177BD-D177CB slot write patterns ---

console.log('\n=== Callback Slot Write Verification ===');

const slotAddrs = [0xD177BD, 0xD177C0, 0xD177C3, 0xD177C6, 0xD177C9];
const slotNames = ['slot0', 'slot1', 'slot2', 'slot3', 'slot4'];

// Install function writes: LD (slot),BC = ED 43 lo mid hi
const installWriteAddrs = [0x0106C1, 0x0106CB, 0x0106D5, 0x0106DF, 0x0106E9];
for (let i = 0; i < 5; i++) {
  const lo = slotAddrs[i] & 0xFF;
  const mid = (slotAddrs[i] >> 8) & 0xFF;
  const hi = (slotAddrs[i] >> 16) & 0xFF;
  check(
    `Install writes ${slotNames[i]} at 0x${installWriteAddrs[i].toString(16)}`,
    matchBytes(installWriteAddrs[i], [0xED, 0x43, lo, mid, hi])
  );
}

// Clear function writes: LD (slot),BC = ED 43 lo mid hi (BC=0)
const clearWriteAddrs = [0x010F13, 0x010F18, 0x010F1D, 0x010F22, 0x010F27];
for (let i = 0; i < 5; i++) {
  const lo = slotAddrs[i] & 0xFF;
  const mid = (slotAddrs[i] >> 8) & 0xFF;
  const hi = (slotAddrs[i] >> 16) & 0xFF;
  check(
    `Clear zeros ${slotNames[i]} at 0x${clearWriteAddrs[i].toString(16)}`,
    matchBytes(clearWriteAddrs[i], [0xED, 0x43, lo, mid, hi])
  );
}


// --- 3. Count total D177BD-D177CB references ---

console.log('\n=== Reference Counts ===');

let totalSlotRefs = 0;
for (const addr of slotAddrs) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;
  totalSlotRefs += countPattern([lo, mid, hi]);
}
check(`Total D177BD-D177CB references = 21`, totalSlotRefs === 21);

// Each slot should have exactly 2 write sites (install + clear)
for (let i = 0; i < 5; i++) {
  const lo = slotAddrs[i] & 0xFF;
  const mid = (slotAddrs[i] >> 8) & 0xFF;
  const hi = (slotAddrs[i] >> 16) & 0xFF;
  // Count LD (nn),BC = ED 43 lo mid hi
  const writeCount = countPattern([0xED, 0x43, lo, mid, hi]);
  check(`${slotNames[i]} has exactly 2 LD (nn),BC writes`, writeCount === 2);
}


// --- 4. Verify dispatch callers ---

console.log('\n=== Dispatch Callers ===');

// CALL 0x000580 (vector 224): should be exactly 1 (wrapper at 0x05F685)
const callVec224 = countPattern([0xCD, 0x80, 0x05, 0x00]);
check('CALL 0x000580 (vec 224) has 1 caller', callVec224 === 1);
check('Wrapper at 0x05F685 calls vec 224', matchBytes(0x05F685, [0xCD, 0x80, 0x05, 0x00]));

// CALL 0x010220 (direct dispatch): should be exactly 1 (0x001A9D)
const callImpl = countPattern([0xCD, 0x20, 0x02, 0x01]);
check('CALL 0x010220 (direct) has 1 caller', callImpl === 1);
check('0x001A9D calls dispatch directly', matchBytes(0x001A9D, [0xCD, 0x20, 0x02, 0x01]));


// --- 5. Verify install has no ROM callers via C wrappers ---

console.log('\n=== Install/Clear Wrapper Caller Counts ===');

// CALL 0x05F77D (install wrapper): 0 callers
check('Install wrapper 0x05F77D has 0 CALL callers',
  countPattern([0xCD, 0x7D, 0xF7, 0x05]) === 0);

// CALL 0x05F794 (clear-slot wrapper): 0 callers
check('Clear-slot wrapper 0x05F794 has 0 CALL callers',
  countPattern([0xCD, 0x94, 0xF7, 0x05]) === 0);

// CALL 0x05FDF3 (clear-all wrapper): 0 callers
check('Clear-all wrapper 0x05FDF3 has 0 CALL callers',
  countPattern([0xCD, 0xF3, 0xFD, 0x05]) === 0);


// --- 6. Verify boot initialization ---

console.log('\n=== Boot Initialization ===');

// 0x000862: XOR A; LD (D177BA),A; LD (D177BC),A (master enable = 0)
check('Boot 0x000862: XOR A then LD (D177BC),A at 0x000867',
  rom[0x000862] === 0xAF && matchBytes(0x000867, [0x32, 0xBC, 0x77, 0xD1]));

// 0x040C43: reset wrapper call
check('OS init 0x040C43: PUSH IY; CALL reset wrapper',
  matchBytes(0x040C41, [0xFD, 0xE5, 0xCD, 0xEA, 0xFD, 0x05]));

// Clear+init sets master enable = 1
check('Clear+init sets D177BC=1 at 0x010F7C',
  matchBytes(0x010F7C, [0x3E, 0x01, 0x32, 0xBC, 0x77, 0xD1]));


// --- 7. Verify display vector cluster ---

console.log('\n=== Display Vector Cluster ===');

// Count vectors 224-252 that target 0x010xxx range
let displayVecCount = 0;
for (let v = 224; v <= 252; v++) {
  const addr = vecBase + v * 4;
  if (rom[addr] === 0xC3) {
    const target = read24(addr + 1);
    if (target >= 0x010000 && target < 0x011000) displayVecCount++;
  }
}
// Vectors 243 (0x007B70), 253, 254 are outside the display range
check('At least 24 vectors in 224-252 target 0x010xxx display subsystem',
  displayVecCount >= 24);


// --- 8. Verify D177D6 is internal to dispatch ---

console.log('\n=== D177D6 Pending Flags Isolation ===');

// All LD (D177D6),A writes should be in 0x010200-0x010400 (dispatch function)
const d6Pattern = [0x32, 0xD6, 0x77, 0xD1];
const d6WritesTotal = countPattern(d6Pattern);
const d6WritesInDispatch = countPattern(d6Pattern, 0x010200, 0x010400);
check(`All ${d6WritesTotal} D177D6 writes are within dispatch function`,
  d6WritesTotal === d6WritesInDispatch);

// All LD A,(D177D6) reads should also be in dispatch
const d6ReadPattern = [0x3A, 0xD6, 0x77, 0xD1];
const d6ReadsTotal = countPattern(d6ReadPattern);
const d6ReadsInDispatch = countPattern(d6ReadPattern, 0x010200, 0x010400);
check(`All ${d6ReadsTotal} D177D6 reads are within dispatch function`,
  d6ReadsTotal === d6ReadsInDispatch);


// --- Summary ---

console.log(`\n=== Results: ${pass} passed, ${fail} failed out of ${pass + fail} ===`);
process.exit(fail > 0 ? 1 : 0);
