#!/usr/bin/env node

/**
 * Phase 410 — Key Handler Table Dump at RAM 0xD1441D
 *
 * Session 409 decoded key dispatch at 0x05D58F: it uses a COMPUTED FUNCTION
 * TABLE where key_code * 4 indexes into a function pointer table whose base
 * address is stored in RAM 0xD1441D. The table installer at 0x05D5C2 does
 * LD (D1441D),BC to set the table base.
 *
 * This probe:
 *   1. Finds all CALL/JP to 0x05D5C2 (table installer)
 *   2. Extracts the BC value (table base) loaded before each call
 *   3. Finds all direct references to RAM 0xD1441D
 *   4. For each table base in ROM range, dumps 64 handler entries (4 bytes each)
 *   5. Cross-references handler addresses with known functions
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase410-key-handler-table-report.md');

const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;

// ── Helpers ───────────────────────────────────────────────────────────

function read24(offset) {
  if (offset < 0 || offset + 2 >= ROM_SIZE) return 0;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function read32(offset) {
  if (offset < 0 || offset + 3 >= ROM_SIZE) return 0;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16) | (rom[offset + 3] << 24);
}

function hex(v, digits = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(digits, '0');
}

function findPattern(pattern) {
  const results = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (pattern[j] !== undefined && rom[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) results.push(i);
  }
  return results;
}

// ── Known function labels (from prior sessions) ──────────────────────

const KNOWN_FUNCTIONS = {
  0x05D58F: 'key_dispatch (computed table lookup)',
  0x05D5C2: 'key_table_installer (LD (D1441D),BC)',
  0x05D5A0: 'key_dispatch_inner',
  0x000000: 'NULL / reset vector',
  0x000038: 'RST 38h (ISR vector)',
  0x021A3C: '_PutS',
  0x021AA4: '_PutC',
  0x0210BC: '_HomeUp',
  0x0210AC: '_ClrLCDFull',
  0x0210D8: '_NewLine',
  0x020820: '_GetCSC',
  0x020828: '_GetKey',
  0x020EC0: '_DrawStatusBar',
  0x021058: '_RunIndicOn',
  0x021060: '_RunIndicOff',
  0x0218F8: '_Disp',
  0x021934: '_DispHL',
};

// ── 1. Find all CALL/JP to 0x05D5C2 ─────────────────────────────────

console.log('=== Phase 410: Key Handler Table Dump ===\n');

// CALL 0x05D5C2 = CD C2 D5 05
const callPattern = [0xCD, 0xC2, 0xD5, 0x05];
// JP 0x05D5C2 = C3 C2 D5 05
const jpPattern = [0xC3, 0xC2, 0xD5, 0x05];

const callSites = findPattern(callPattern);
const jpSites = findPattern(jpPattern);

console.log(`CALL 0x05D5C2 sites: ${callSites.length}`);
for (const addr of callSites) {
  console.log(`  ${hex(addr)}`);
}

console.log(`JP   0x05D5C2 sites: ${jpSites.length}`);
for (const addr of jpSites) {
  console.log(`  ${hex(addr)}`);
}

const allCallers = [...callSites, ...jpSites].sort((a, b) => a - b);
console.log(`\nTotal callers: ${allCallers.length}\n`);

// ── 2. Extract BC value (table base) before each call ────────────────

console.log('--- Table Base Addresses (BC values before CALL/JP) ---\n');

const tableBaseAddresses = new Set();
const callerDetails = [];

for (const callAddr of allCallers) {
  const isCall = rom[callAddr] === 0xCD;
  const type = isCall ? 'CALL' : 'JP';

  // Search backwards for LD BC,imm24 (opcode 0x01, 4 bytes total)
  // Could be immediately before (callAddr - 4) or a few bytes back
  let bcValue = null;
  let ldBcAddr = null;

  for (let back = 4; back <= 32; back++) {
    const checkAddr = callAddr - back;
    if (checkAddr < 0) break;
    if (rom[checkAddr] === 0x01) {
      // Verify it looks like LD BC,imm24
      const candidate = read24(checkAddr + 1);
      // Sanity: table base should be a plausible address
      if (candidate > 0 && candidate < 0xFFFFFF) {
        bcValue = candidate;
        ldBcAddr = checkAddr;
        break;
      }
    }
  }

  const detail = {
    callAddr,
    type,
    bcValue,
    ldBcAddr,
  };
  callerDetails.push(detail);

  if (bcValue !== null) {
    tableBaseAddresses.add(bcValue);
    console.log(`  ${hex(callAddr)}: ${type} 0x05D5C2  <--  LD BC,${hex(bcValue)} at ${hex(ldBcAddr)}`);
  } else {
    console.log(`  ${hex(callAddr)}: ${type} 0x05D5C2  <--  (no LD BC found in preceding 32 bytes)`);
  }

  // Also show context: disassemble a few bytes before the call
  const contextStart = Math.max(0, callAddr - 16);
  const contextBytes = [];
  for (let i = contextStart; i < callAddr + 4; i++) {
    contextBytes.push(rom[i].toString(16).padStart(2, '0'));
  }
  console.log(`    context: [${hex(contextStart)}] ${contextBytes.join(' ')}\n`);
}

// ── 3. Find all references to RAM 0xD1441D ───────────────────────────

console.log('\n--- All References to RAM 0xD1441D ---\n');

// D1441D in little-endian: 1D 44 D1
const ramRefPattern = [0x1D, 0x44, 0xD1];
const ramRefs = findPattern(ramRefPattern);

console.log(`Total references to D1441D: ${ramRefs.length}\n`);

for (const refAddr of ramRefs) {
  // Show opcode byte before the address and a few bytes of context
  const opcodeAddr = refAddr - 1;
  const opcode = opcodeAddr >= 0 ? rom[opcodeAddr] : 0;

  // Identify the instruction
  let instrDesc = 'unknown';
  // Check for multi-byte prefixes (look 2-3 bytes back too)
  const prevByte2 = refAddr >= 2 ? rom[refAddr - 2] : 0;
  const prevByte3 = refAddr >= 3 ? rom[refAddr - 3] : 0;

  if (opcode === 0x2A) instrDesc = 'LD HL,(D1441D)';
  else if (opcode === 0x3A) instrDesc = 'LD A,(D1441D)';
  else if (opcode === 0x22) instrDesc = 'LD (D1441D),HL';
  else if (opcode === 0x32) instrDesc = 'LD (D1441D),A';
  else if (opcode === 0x21) instrDesc = 'LD HL,D1441D (immediate, not memory ref)';
  else if (opcode === 0x01) instrDesc = 'LD BC,D1441D (immediate, not memory ref)';
  else if (opcode === 0x11) instrDesc = 'LD DE,D1441D (immediate, not memory ref)';
  else if (prevByte2 === 0xED && opcode === 0x4B) instrDesc = 'LD BC,(D1441D)';
  else if (prevByte2 === 0xED && opcode === 0x5B) instrDesc = 'LD DE,(D1441D)';
  else if (prevByte2 === 0xED && opcode === 0x43) instrDesc = 'LD (D1441D),BC';
  else if (prevByte2 === 0xED && opcode === 0x53) instrDesc = 'LD (D1441D),DE';

  // Show context
  const ctxStart = Math.max(0, refAddr - 4);
  const ctxEnd = Math.min(rom.length, refAddr + 6);
  const ctxBytes = [];
  for (let i = ctxStart; i < ctxEnd; i++) {
    ctxBytes.push(rom[i].toString(16).padStart(2, '0'));
  }
  console.log(`  ${hex(refAddr - 1)}: ${instrDesc}`);
  console.log(`    context: [${hex(ctxStart)}] ${ctxBytes.join(' ')}\n`);
}

// ── 4. Dump table entries for each table base in ROM range ───────────

console.log('\n--- Handler Table Dumps ---\n');

const sortedBases = [...tableBaseAddresses].sort((a, b) => a - b);
const tableDumps = {};

for (const base of sortedBases) {
  console.log(`\n=== Table at base ${hex(base)} ===\n`);

  if (base >= ROM_SIZE) {
    console.log(`  (base is in RAM range, not in ROM — would need runtime dump)\n`);

    // Check if base might be in a known RAM region
    if (base >= 0xD00000 && base <= 0xD4FFFF) {
      console.log(`  This is in OS RAM area (D00000-D4FFFF)`);
      console.log(`  The table is dynamically populated at runtime.`);
      console.log(`  To dump it, run the OS in the emulator and read RAM.\n`);
    }
    continue;
  }

  const entries = [];
  const NUM_ENTRIES = 64;

  console.log(`  Key  | Offset     | Handler    | Known Function`);
  console.log(`  -----|------------|------------|---------------------------`);

  for (let key = 0; key < NUM_ENTRIES; key++) {
    const entryOffset = base + (key * 4);
    if (entryOffset + 3 >= ROM_SIZE) {
      console.log(`  ${key.toString().padStart(3)} | (past end of ROM)`);
      break;
    }

    // Read 3-byte handler address (eZ80 is 24-bit, 4th byte may be padding or flags)
    const handler = read24(entryOffset);
    const byte4 = rom[entryOffset + 3];
    const known = KNOWN_FUNCTIONS[handler] || '';

    const entry = { key, entryOffset, handler, byte4 };
    entries.push(entry);

    const keyHex = hex(key, 2);
    const offsetHex = hex(entryOffset);
    const handlerHex = hex(handler);
    const byte4Hex = hex(byte4, 2);

    console.log(`  ${keyHex.padStart(4)} | ${offsetHex} | ${handlerHex} [${byte4Hex}] | ${known}`);
  }

  tableDumps[base] = entries;

  // Summary: unique handlers
  const uniqueHandlers = new Map();
  for (const e of entries) {
    const h = e.handler;
    if (!uniqueHandlers.has(h)) uniqueHandlers.set(h, []);
    uniqueHandlers.get(h).push(e.key);
  }

  console.log(`\n  Unique handlers: ${uniqueHandlers.size}`);
  console.log(`  Handler distribution:`);
  for (const [handler, keys] of [...uniqueHandlers.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const known = KNOWN_FUNCTIONS[handler] || '';
    const keyList = keys.length <= 10
      ? keys.map(k => hex(k, 2)).join(', ')
      : keys.slice(0, 10).map(k => hex(k, 2)).join(', ') + ` ... (${keys.length} total)`;
    console.log(`    ${hex(handler)}: ${keys.length} keys [${keyList}] ${known}`);
  }
}

// ── 5. Also scan for other table installers (LD (D1441D),XX patterns) ─

console.log('\n\n--- Scanning for LD BC,imm24 followed by LD (D1441D),BC pattern ---\n');

// ED 43 1D 44 D1 = LD (D1441D),BC in eZ80
const storePattern = [0xED, 0x43, 0x1D, 0x44, 0xD1];
const storeSites = findPattern(storePattern);

console.log(`LD (D1441D),BC sites: ${storeSites.length}`);
for (const addr of storeSites) {
  // Search backwards for LD BC,imm24
  let bcValue = null;
  for (let back = 4; back <= 32; back++) {
    const checkAddr = addr - back;
    if (checkAddr < 0) break;
    if (rom[checkAddr] === 0x01) {
      bcValue = read24(checkAddr + 1);
      console.log(`  ${hex(addr)}: LD (D1441D),BC  <--  LD BC,${hex(bcValue)} at ${hex(checkAddr)}`);
      tableBaseAddresses.add(bcValue);
      break;
    }
  }
  if (bcValue === null) {
    const ctxStart = Math.max(0, addr - 8);
    const ctxBytes = [];
    for (let i = ctxStart; i < addr + 5; i++) {
      ctxBytes.push(rom[i].toString(16).padStart(2, '0'));
    }
    console.log(`  ${hex(addr)}: LD (D1441D),BC  (no LD BC found)`);
    console.log(`    context: [${hex(ctxStart)}] ${ctxBytes.join(' ')}`);
  }
}

// ── 6. Check for LD (D1441D),HL pattern too ─────────────────────────

const storeHLPattern = [0x22, 0x1D, 0x44, 0xD1];
const storeHLSites = findPattern(storeHLPattern);

console.log(`\nLD (D1441D),HL sites: ${storeHLSites.length}`);
for (const addr of storeHLSites) {
  let hlValue = null;
  for (let back = 4; back <= 32; back++) {
    const checkAddr = addr - back;
    if (checkAddr < 0) break;
    if (rom[checkAddr] === 0x21) {
      hlValue = read24(checkAddr + 1);
      console.log(`  ${hex(addr)}: LD (D1441D),HL  <--  LD HL,${hex(hlValue)} at ${hex(checkAddr)}`);
      tableBaseAddresses.add(hlValue);
      break;
    }
  }
  if (hlValue === null) {
    const ctxStart = Math.max(0, addr - 8);
    const ctxBytes = [];
    for (let i = ctxStart; i < addr + 4; i++) {
      ctxBytes.push(rom[i].toString(16).padStart(2, '0'));
    }
    console.log(`  ${hex(addr)}: LD (D1441D),HL  (no LD HL found)`);
    console.log(`    context: [${hex(ctxStart)}] ${ctxBytes.join(' ')}`);
  }
}

// ── 7. Dump any NEW table bases found in step 5-6 ───────────────────

const newBases = [...tableBaseAddresses].filter(b => !sortedBases.includes(b) && b < ROM_SIZE).sort((a, b) => a - b);
if (newBases.length > 0) {
  console.log(`\n\n--- Additional Table Dumps (from direct LD instructions) ---\n`);

  for (const base of newBases) {
    console.log(`\n=== Table at base ${hex(base)} ===\n`);

    if (base >= ROM_SIZE) {
      console.log(`  (base in RAM range)\n`);
      continue;
    }

    const entries = [];
    const NUM_ENTRIES = 64;

    console.log(`  Key  | Offset     | Handler    | Known Function`);
    console.log(`  -----|------------|------------|---------------------------`);

    for (let key = 0; key < NUM_ENTRIES; key++) {
      const entryOffset = base + (key * 4);
      if (entryOffset + 3 >= ROM_SIZE) {
        console.log(`  ${key.toString().padStart(3)} | (past end of ROM)`);
        break;
      }

      const handler = read24(entryOffset);
      const byte4 = rom[entryOffset + 3];
      const known = KNOWN_FUNCTIONS[handler] || '';

      entries.push({ key, entryOffset, handler, byte4 });

      console.log(`  ${hex(key, 2).padStart(4)} | ${hex(entryOffset)} | ${hex(handler)} [${hex(byte4, 2)}] | ${known}`);
    }

    tableDumps[base] = entries;

    const uniqueHandlers = new Map();
    for (const e of entries) {
      if (!uniqueHandlers.has(e.handler)) uniqueHandlers.set(e.handler, []);
      uniqueHandlers.get(e.handler).push(e.key);
    }

    console.log(`\n  Unique handlers: ${uniqueHandlers.size}`);
    for (const [handler, keys] of [...uniqueHandlers.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const known = KNOWN_FUNCTIONS[handler] || '';
      const keyList = keys.length <= 10
        ? keys.map(k => hex(k, 2)).join(', ')
        : keys.slice(0, 10).map(k => hex(k, 2)).join(', ') + ` ... (${keys.length} total)`;
      console.log(`    ${hex(handler)}: ${keys.length} keys [${keyList}] ${known}`);
    }
  }
}

// ── 8. Generate report ──────────────────────────────────────────────

let report = `# Phase 410 — Key Handler Table Dump

## Summary

Decoded the key handler dispatch mechanism at 0x05D58F. The OS uses a computed
function table: \`key_code * 4\` indexes into a table whose base is stored at
RAM 0xD1441D. The table installer at 0x05D5C2 sets this base via \`LD (D1441D),BC\`.

## Callers of 0x05D5C2 (Table Installer)

| Address | Type | Table Base (BC) |
|---------|------|-----------------|
`;

for (const d of callerDetails) {
  const bcStr = d.bcValue !== null ? hex(d.bcValue) : '(not found)';
  report += `| ${hex(d.callAddr)} | ${d.type} | ${bcStr} |\n`;
}

report += `\n## References to RAM 0xD1441D\n\nTotal: ${ramRefs.length} references\n\n`;

for (const refAddr of ramRefs) {
  const opcodeAddr = refAddr - 1;
  const opcode = opcodeAddr >= 0 ? rom[opcodeAddr] : 0;
  const prevByte2 = refAddr >= 2 ? rom[refAddr - 2] : 0;

  let instrDesc = `opcode ${hex(opcode, 2)}`;
  if (opcode === 0x2A) instrDesc = 'LD HL,(D1441D)';
  else if (opcode === 0x22) instrDesc = 'LD (D1441D),HL';
  else if (opcode === 0x21) instrDesc = 'LD HL,D1441D';
  else if (opcode === 0x01) instrDesc = 'LD BC,D1441D';
  else if (prevByte2 === 0xED && opcode === 0x4B) instrDesc = 'LD BC,(D1441D)';
  else if (prevByte2 === 0xED && opcode === 0x43) instrDesc = 'LD (D1441D),BC';

  report += `- ${hex(refAddr - 1)}: ${instrDesc}\n`;
}

report += `\n## Table Bases Found\n\n`;

const allBases = [...tableBaseAddresses].sort((a, b) => a - b);
for (const base of allBases) {
  const inRom = base < ROM_SIZE;
  report += `- ${hex(base)} — ${inRom ? 'IN ROM (dumped below)' : 'IN RAM (runtime only)'}\n`;
}

report += `\n## Handler Table Dumps\n\n`;

for (const [base, entries] of Object.entries(tableDumps)) {
  report += `### Table at ${hex(Number(base))}\n\n`;
  report += `| Key | Handler | Known |\n`;
  report += `|-----|---------|-------|\n`;

  for (const e of entries) {
    const known = KNOWN_FUNCTIONS[e.handler] || '';
    report += `| ${hex(e.key, 2)} | ${hex(e.handler)} | ${known} |\n`;
  }

  // Unique handler summary
  const uniqueHandlers = new Map();
  for (const e of entries) {
    if (!uniqueHandlers.has(e.handler)) uniqueHandlers.set(e.handler, []);
    uniqueHandlers.get(e.handler).push(e.key);
  }

  report += `\n**Unique handlers: ${uniqueHandlers.size}**\n\n`;
  for (const [handler, keys] of [...uniqueHandlers.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const known = KNOWN_FUNCTIONS[handler] || '';
    report += `- ${hex(handler)}: ${keys.length} keys ${known ? `(${known})` : ''}\n`;
  }
  report += '\n';
}

report += `\n## Analysis\n\n`;
report += `The key dispatch at 0x05D58F reads the table base from RAM 0xD1441D,\n`;
report += `multiplies the key code by 4, and jumps to the 24-bit handler address\n`;
report += `at that offset. Different OS modes (home screen, graph, editor, etc.)\n`;
report += `install different tables by calling 0x05D5C2 with BC = table base.\n`;
report += `\n`;
report += `This means each mode has its own key handler table, and mode switches\n`;
report += `are accompanied by a table swap.\n`;

fs.writeFileSync(REPORT_PATH, report);
console.log(`\n\nReport written to ${REPORT_PATH}`);
console.log('Done.');
