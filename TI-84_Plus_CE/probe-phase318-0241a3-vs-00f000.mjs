/**
 * Phase 318 Probe: 0x0241A3 vs 0x00F000 Event System Cross-Reference
 *
 * Verifies that the two event/callback dispatch systems are independent:
 * - 0x0241A3: registered-handler dispatcher (linked-list, 9 wrappers)
 * - 0x00F000: callback-slot dispatcher (struct table at D13FED, entries 168/169/173/174)
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
let passed = 0;
let failed = 0;

function r24(off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
}

function hex(v) {
  return '0x' + v.toString(16).padStart(6, '0');
}

function assert(condition, label) {
  if (condition) {
    console.log('PASS: ' + label);
    passed++;
  } else {
    console.log('FAIL: ' + label);
    failed++;
  }
}

// ─── Structural sanity checks ───

assert(rom[0x0241A3] === 0xDD && rom[0x0241A4] === 0xE5,
  '0x0241A3 starts with PUSH IX (DD E5)');

assert(rom[0x0242DA] === 0xC9,
  '0x0242DA is RET (end of 0x0241A3 body — after POP IY; LD SP,IX; POP IX)');

assert(rom[0x00015C] === 0xC3 && r24(0x00015D) === 0x002288,
  '0x00015C is JP 0x002288 (_indcall trampoline)');

assert(rom[0x002288] === 0xFD && rom[0x002289] === 0xE9,
  '0x002288 is JP (IY) — the actual _indcall');

// ─── Jump table entries for 0x00F000 cluster ───

const megaTable = 0x020110;
const entry168target = r24(megaTable + 168 * 4 + 1);
const entry169target = r24(megaTable + 169 * 4 + 1);
const entry173target = r24(megaTable + 173 * 4 + 1);
const entry174target = r24(megaTable + 174 * 4 + 1);

assert(rom[megaTable + 168 * 4] === 0xC3,
  'Mega-table entry 168 is JP opcode');
assert(rom[megaTable + 169 * 4] === 0xC3,
  'Mega-table entry 169 is JP opcode');
assert(rom[megaTable + 173 * 4] === 0xC3,
  'Mega-table entry 173 is JP opcode');
assert(rom[megaTable + 174 * 4] === 0xC3,
  'Mega-table entry 174 is JP opcode');

// ─── Cross-reference: 0x0241A3 body -> 0x00F000 cluster ───

function collectCallJpTargets(start, end) {
  const targets = [];
  for (let i = start; i < end; i++) {
    if (rom[i] === 0xCD || rom[i] === 0xC3) {
      targets.push({ from: i, target: r24(i + 1), type: rom[i] === 0xCD ? 'CALL' : 'JP' });
    }
  }
  return targets;
}

const targets241a3 = collectCallJpTargets(0x0241A3, 0x0242D9);
const targetsToF000 = targets241a3.filter(t => t.target >= 0x00F000 && t.target <= 0x010100);

assert(targetsToF000.length === 0,
  'No CALL/JP from 0x0241A3 body to 0x00F000-0x010100 (found ' + targetsToF000.length + ')');

// ─── Cross-reference: 0x00F000 cluster -> 0x0241A3 or wrappers ───

const targetsF000 = collectCallJpTargets(0x00F000, 0x010090);
const wrapperAddrs = [0x0241A3, 0x0242E6, 0x0242ED, 0x0242F4, 0x0242FB, 0x024302, 0x024309, 0x024310, 0x024317, 0x02431E];
const targetsTo241a3 = targetsF000.filter(t => wrapperAddrs.includes(t.target));

assert(targetsTo241a3.length === 0,
  'No CALL/JP from 0x00F000 cluster to 0x0241A3 or wrappers (found ' + targetsTo241a3.length + ')');

// ─── Shared RAM: D005F9 in 0x00F000 cluster ───

let d005f9InCluster = 0;
for (let i = 0x00F000; i < 0x010090 - 2; i++) {
  if (rom[i] === 0xF9 && rom[i + 1] === 0x05 && rom[i + 2] === 0xD0) {
    d005f9InCluster++;
  }
}

assert(d005f9InCluster === 0,
  'D005F9 not referenced in 0x00F000 cluster (found ' + d005f9InCluster + ')');

// ─── Shared RAM: D13FED in 0x0241A3 body + sub-callees ───

function countPattern(start, end, bytes) {
  let count = 0;
  for (let i = start; i < end - (bytes.length - 1); i++) {
    let match = true;
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) { match = false; break; }
    }
    if (match) count++;
  }
  return count;
}

const d13fedIn241a3 = countPattern(0x0241A3, 0x024328, [0xED, 0x3F, 0xD1]);

assert(d13fedIn241a3 === 0,
  'D13FED not referenced in 0x0241A3 region (found ' + d13fedIn241a3 + ')');

// ─── Shared RAM: D177B8 in 0x0241A3 body ───

const d177b8In241a3 = countPattern(0x0241A3, 0x024328, [0xB8, 0x77, 0xD1]);

assert(d177b8In241a3 === 0,
  'D177B8 not referenced in 0x0241A3 region (found ' + d177b8In241a3 + ')');

// ─── D13FED in 0x0241A3 sub-callees ───

const subcalleeRanges = [
  { name: '0x023FDA', start: 0x023FDA, end: 0x023FDA + 80 },
  { name: '0x024027', start: 0x024027, end: 0x024027 + 80 },
  { name: '0x024763', start: 0x024763, end: 0x024763 + 80 },
];
let d13fedInSubcallees = 0;
for (const r of subcalleeRanges) {
  d13fedInSubcallees += countPattern(r.start, r.end, [0xED, 0x3F, 0xD1]);
}

assert(d13fedInSubcallees === 0,
  'D13FED not in 0x0241A3 sub-callees (found ' + d13fedInSubcallees + ')');

// ─── Shared callees (excluding JP(IY)) ───

const callees241a3 = new Set(targets241a3.filter(t => t.type === 'CALL').map(t => t.target));
const calleesF000 = new Set(targetsF000.filter(t => t.type === 'CALL').map(t => t.target));

// Remove the universal JP(IY) trampoline from comparison
callees241a3.delete(0x002288);
calleesF000.delete(0x002288);

const sharedCallees = [...callees241a3].filter(c => calleesF000.has(c));

assert(sharedCallees.length === 0,
  'No shared callees excluding JP(IY) (found ' + sharedCallees.length + ': ' + sharedCallees.map(hex).join(', ') + ')');

// ─── Wrapper structure: each is LD A,xx; CALL 0x0241A3; RET ───

const wrapperBase = 0x0242E6;
const expectedWrappers = [
  { offset: 0, a: 0x01 },
  { offset: 7, a: 0x17 },
  { offset: 14, a: 0x05 },
  { offset: 21, a: 0x00 },
  { offset: 28, a: 0x16 },
  { offset: 35, a: 0x04 },
  { offset: 42, a: 0x09 },
  { offset: 49, a: 0x0D },
  { offset: 56, a: 0x0C },
];

let wrapperOk = 0;
for (const w of expectedWrappers) {
  const addr = wrapperBase + w.offset;
  const isLdA = rom[addr] === 0x3E && rom[addr + 1] === w.a;
  const isCall = rom[addr + 2] === 0xCD && r24(addr + 3) === 0x0241A3;
  const isRet = rom[addr + 6] === 0xC9;
  if (isLdA && isCall && isRet) wrapperOk++;
}

assert(wrapperOk === 9,
  'All 9 wrappers are LD A,xx; CALL 0x0241A3; RET (' + wrapperOk + '/9)');

// ─── 0x00F000 cluster: D13FED reference count ───

const d13fedInCluster = countPattern(0x00F000, 0x010090, [0xED, 0x3F, 0xD1]);

assert(d13fedInCluster >= 2,
  '0x00F000 cluster has D13FED refs (found ' + d13fedInCluster + ', expected >= 2)');

// ─── 0x00F000 cluster: D177B8 reference count ───

const d177b8InCluster = countPattern(0x00F000, 0x010090, [0xB8, 0x77, 0xD1]);

assert(d177b8InCluster >= 5,
  '0x00F000 cluster has D177B8 refs (found ' + d177b8InCluster + ', expected >= 5)');

// ─── _indcall site counts ───

let indcall241a3 = 0;
for (let i = 0x0241A3; i < 0x0242D9; i++) {
  if (rom[i] === 0xCD && r24(i + 1) === 0x00015C) indcall241a3++;
}

assert(indcall241a3 === 5,
  '0x0241A3 has 5 _indcall (CALL 0x00015C) sites (found ' + indcall241a3 + ')');

let indcallF000 = 0;
for (let i = 0x00F000; i < 0x010090; i++) {
  if (rom[i] === 0xCD && r24(i + 1) === 0x002288) indcallF000++;
}

assert(indcallF000 === 8,
  '0x00F000 cluster has 8 _indcall (CALL 0x002288) sites (found ' + indcallF000 + ')');

// ─── Whole-ROM caller analysis: no function calls both systems ───

const allWrappers = new Set(wrapperAddrs);
const clusterFuncs = new Set([0x00F430, 0x00F5B0, 0x00FB6E, 0x00FE10,
  entry168target, entry169target, entry173target, entry174target]);

// Build per-function caller map (approximate: find CALL sites, group by 4K page)
const pages4k = {};
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0xCD) {
    const t = r24(i + 1);
    const page = i >> 12;
    const callsWrapper = allWrappers.has(t);
    const callsCluster = clusterFuncs.has(t);
    if (callsWrapper || callsCluster) {
      if (!pages4k[page]) pages4k[page] = { wrapper: [], cluster: [] };
      if (callsWrapper) pages4k[page].wrapper.push(i);
      if (callsCluster) pages4k[page].cluster.push(i);
    }
  }
}

// Check if any call sites in the same 4K page (rough function proximity) call both
let sharedPageCallers = 0;
for (const page of Object.keys(pages4k)) {
  const p = pages4k[page];
  if (p.wrapper.length > 0 && p.cluster.length > 0) {
    // Check if any pair is within 256 bytes (likely same function)
    for (const w of p.wrapper) {
      for (const c of p.cluster) {
        if (Math.abs(w - c) < 256) {
          // Verify no RET between them
          const lo = Math.min(w, c);
          const hi = Math.max(w, c);
          let hasRet = false;
          for (let j = lo; j < hi; j++) {
            if (rom[j] === 0xC9) { hasRet = true; break; }
          }
          if (!hasRet) sharedPageCallers++;
        }
      }
    }
  }
}

assert(sharedPageCallers === 0,
  'No function calls both systems within 256 bytes without RET (found ' + sharedPageCallers + ')');

// ─── Summary ───

console.log('');
console.log('=== Summary ===');
console.log('Passed: ' + passed + '/' + (passed + failed));
console.log('Failed: ' + failed);
console.log('');
console.log('Verdict: ' + (failed === 0 ? 'INDEPENDENT SIBLING SYSTEMS (confirmed)' : 'UNEXPECTED CROSS-REFERENCES FOUND'));

process.exit(failed > 0 ? 1 : 0);
