#!/usr/bin/env node

/**
 * Phase 408 -- OS Syscall/Jump Table Full Map
 *
 * Reads the 2,178-entry jump table at 0x020104, extracts all JP targets,
 * scans the entire ROM for CALL/JP references into the table, cross-references
 * with the SDK ti84pceg.inc names, and categorizes targets by address range.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');
const REPORT_PATH = path.join(__dirname, 'phase408-syscall-table-report.md');

const rom = fs.readFileSync(ROM_PATH);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABLE_START = 0x020104;
const TABLE_ENTRIES = 2178;
const TABLE_END = TABLE_START + TABLE_ENTRIES * 4; // 0x02230C
const JP_OPCODE = 0xC3;
const CALL_OPCODE = 0xCD;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// ---------------------------------------------------------------------------
// 1. Parse the .inc file for named syscall entries
// ---------------------------------------------------------------------------

function parseIncFile() {
  const nameMap = new Map(); // address -> name
  try {
    const text = fs.readFileSync(INC_PATH, 'utf8');
    const re = /^\?(\w+)\s*:=\s*0*([0-9A-Fa-f]+)h/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      const addr = parseInt(m[2], 16);
      if (addr >= TABLE_START && addr < TABLE_END) {
        nameMap.set(addr, m[1]);
      }
    }
  } catch (e) {
    console.log('Warning: could not read .inc file: ' + e.message);
  }
  return nameMap;
}

// ---------------------------------------------------------------------------
// 2. Extract all 2,178 JP targets
// ---------------------------------------------------------------------------

function extractTableEntries() {
  const entries = [];
  const anomalies = [];

  for (let i = 0; i < TABLE_ENTRIES; i++) {
    const addr = TABLE_START + i * 4;
    const opcode = rom[addr];
    const target = read24(addr + 1);

    if (opcode !== JP_OPCODE) {
      anomalies.push({ index: i, addr, opcode, target });
    }

    entries.push({ index: i, addr, target, opcode });
  }

  return { entries, anomalies };
}

// ---------------------------------------------------------------------------
// 3. Scan ROM for unconditional CALL/JP into the table region
// ---------------------------------------------------------------------------

function scanRomForTableRefs() {
  const refs = [];

  for (let pc = 0; pc < rom.length - 3; pc++) {
    if (pc >= TABLE_START && pc < TABLE_END) continue;

    const op = rom[pc];
    if (op !== CALL_OPCODE && op !== JP_OPCODE) continue;

    const target = read24(pc + 1);
    if (target < TABLE_START || target >= TABLE_END) continue;
    if ((target - TABLE_START) % 4 !== 0) continue;

    const slotIndex = (target - TABLE_START) / 4;
    const instrType = op === CALL_OPCODE ? 'CALL' : 'JP';

    refs.push({ callerAddr: pc, instrType, targetAddr: target, slotIndex });
  }

  return refs;
}

// ---------------------------------------------------------------------------
// 4. Scan for conditional CALL/JP (cc variants)
// ---------------------------------------------------------------------------

function scanConditionalRefs() {
  const condCallOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condJpOpcodes   = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
  const condNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  const refs = [];

  for (let pc = 0; pc < rom.length - 3; pc++) {
    if (pc >= TABLE_START && pc < TABLE_END) continue;

    const op = rom[pc];
    let instrType = null;
    let condIndex = -1;

    const callIdx = condCallOpcodes.indexOf(op);
    if (callIdx >= 0) {
      instrType = 'CALL';
      condIndex = callIdx;
    } else {
      const jpIdx = condJpOpcodes.indexOf(op);
      if (jpIdx >= 0) {
        instrType = 'JP';
        condIndex = jpIdx;
      }
    }

    if (instrType === null) continue;

    const target = read24(pc + 1);
    if (target < TABLE_START || target >= TABLE_END) continue;
    if ((target - TABLE_START) % 4 !== 0) continue;

    const slotIndex = (target - TABLE_START) / 4;
    const cond = condNames[condIndex];

    refs.push({
      callerAddr: pc,
      instrType: instrType + ' ' + cond,
      targetAddr: target,
      slotIndex,
    });
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const out = [];
  function emit(line) {
    if (line === undefined) line = '';
    out.push(line);
    console.log(line);
  }

  emit('# Phase 408: OS Syscall/Jump Table Full Map');
  emit('');

  // --- Verify magic header ---
  const magic = [rom[0x020100], rom[0x020101], rom[0x020102], rom[0x020103]];
  emit('## 0. Header Verification');
  emit('');
  emit('Magic at 0x020100: ' + magic.map(function(b) { return '0x' + b.toString(16).toUpperCase().padStart(2, '0'); }).join(' '));
  const magicOk = magic[0] === 0x5A && magic[1] === 0xA5 && magic[2] === 0xFF && magic[3] === 0xFF;
  emit('Expected: 0x5A 0xA5 0xFF 0xFF -- ' + (magicOk ? 'MATCH' : 'MISMATCH'));
  emit('');

  // --- 1. Parse .inc names ---
  const nameMap = parseIncFile();
  emit('## 1. SDK Names (ti84pceg.inc)');
  emit('');
  emit('Named entries found: ' + nameMap.size);
  emit('');

  // --- 2. Extract table entries ---
  const { entries, anomalies } = extractTableEntries();
  emit('## 2. Table Entry Extraction');
  emit('');
  emit('Total entries: ' + entries.length);
  emit('Table range: ' + hex(TABLE_START) + ' - ' + hex(TABLE_END) + ' (' + (TABLE_ENTRIES * 4) + ' bytes)');
  emit('');

  if (anomalies.length > 0) {
    emit('### Anomalies (non-0xC3 opcodes): ' + anomalies.length);
    emit('');
    emit('| Index | Address | Opcode | Raw Target |');
    emit('|-------|---------|--------|------------|');
    for (const a of anomalies) {
      emit('| ' + a.index + ' | ' + hex(a.addr) + ' | 0x' + a.opcode.toString(16).toUpperCase().padStart(2, '0') + ' | ' + hex(a.target) + ' |');
    }
    emit('');
  } else {
    emit('All 2,178 entries start with 0xC3 (JP opcode). No anomalies.');
    emit('');
  }

  // --- Target categorization ---
  emit('### Target Categorization');
  emit('');

  let flashTargets = 0;
  let lowRomTargets = 0;
  const targetCounts = new Map();
  const targetToSlots = new Map();

  for (const e of entries) {
    if (e.target >= 0x040000) {
      flashTargets++;
    } else {
      lowRomTargets++;
    }
    targetCounts.set(e.target, (targetCounts.get(e.target) || 0) + 1);
    if (!targetToSlots.has(e.target)) targetToSlots.set(e.target, []);
    targetToSlots.get(e.target).push(e.index);
  }

  const uniqueTargets = targetCounts.size;
  const duplicateTargets = [...targetCounts.entries()].filter(function(pair) { return pair[1] > 1; });

  emit('- Targets in flash (>= 0x040000): ' + flashTargets);
  emit('- Targets in low ROM (< 0x040000): ' + lowRomTargets);
  emit('- Unique targets: ' + uniqueTargets);
  emit('- Duplicate targets (same address in multiple slots): ' + duplicateTargets.length);
  emit('');

  // Address range distribution
  const rangeBuckets = new Map();
  for (const e of entries) {
    const bucket = Math.floor(e.target / 0x10000);
    rangeBuckets.set(bucket, (rangeBuckets.get(bucket) || 0) + 1);
  }

  emit('### Target Address Distribution');
  emit('');
  emit('| Range | Count |');
  emit('|-------|-------|');
  for (const [bucket, count] of [...rangeBuckets.entries()].sort(function(a, b) { return a[0] - b[0]; })) {
    emit('| ' + hex(bucket * 0x10000) + '-' + hex((bucket + 1) * 0x10000 - 1) + ' | ' + count + ' |');
  }
  emit('');

  // Top duplicate targets
  if (duplicateTargets.length > 0) {
    emit('### Duplicate Targets (top 20)');
    emit('');
    const sorted = duplicateTargets.sort(function(a, b) { return b[1] - a[1]; }).slice(0, 20);
    emit('| Target | Slots | Count |');
    emit('|--------|-------|-------|');
    for (const [target, count] of sorted) {
      const slots = targetToSlots.get(target);
      const slotStr = slots.length > 8
        ? slots.slice(0, 8).map(function(s) { return '#' + s; }).join(', ') + ', ... (' + slots.length + ' total)'
        : slots.map(function(s) { return '#' + s; }).join(', ');
      emit('| ' + hex(target) + ' | ' + slotStr + ' | ' + count + ' |');
    }
    emit('');
  }

  // --- 3. Scan for references ---
  emit('## 3. ROM References into the Table');
  emit('');

  const unconditionalRefs = scanRomForTableRefs();
  const conditionalRefs = scanConditionalRefs();
  const allRefs = [...unconditionalRefs, ...conditionalRefs].sort(function(a, b) { return a.callerAddr - b.callerAddr; });

  emit('Total references: ' + allRefs.length + ' (' + unconditionalRefs.length + ' unconditional, ' + conditionalRefs.length + ' conditional)');
  emit('');

  // Group by slot
  const slotRefs = new Map();
  for (const ref of allRefs) {
    if (!slotRefs.has(ref.slotIndex)) slotRefs.set(ref.slotIndex, []);
    slotRefs.get(ref.slotIndex).push(ref);
  }

  const calledSlots = [...slotRefs.keys()].sort(function(a, b) { return a - b; });
  emit('Unique slots called directly: ' + calledSlots.length);
  emit('');

  emit('### All Referenced Slots');
  emit('');
  emit('| Slot | Table Addr | JP Target | SDK Name | Callers |');
  emit('|------|-----------|-----------|----------|---------|');
  for (const slot of calledSlots) {
    const entry = entries[slot];
    const name = nameMap.get(entry.addr) || '--';
    const refs = slotRefs.get(slot);
    const callerSummary = refs.map(function(r) { return r.instrType + ' @ ' + hex(r.callerAddr); }).join('; ');
    emit('| #' + slot + ' | ' + hex(entry.addr) + ' | ' + hex(entry.target) + ' | ' + name + ' | ' + callerSummary + ' |');
  }
  emit('');

  // Caller count per slot (sorted by count descending)
  emit('### Caller Count by Slot (sorted)');
  emit('');
  emit('| Slot | SDK Name | Table Addr | Caller Count |');
  emit('|------|----------|-----------|-------------|');
  for (const [slot, refs] of [...slotRefs.entries()].sort(function(a, b) { return b[1].length - a[1].length; })) {
    const entry = entries[slot];
    const name = nameMap.get(entry.addr) || '--';
    emit('| #' + slot + ' | ' + name + ' | ' + hex(entry.addr) + ' | ' + refs.length + ' |');
  }
  emit('');

  // --- 4. Named entries cross-reference ---
  emit('## 4. SDK Names Cross-Reference');
  emit('');

  const namedSlots = [];
  for (const [addr, name] of nameMap) {
    const slot = (addr - TABLE_START) / 4;
    const callers = slotRefs.get(slot) || [];
    namedSlots.push({ slot, addr, name, callerCount: callers.length, target: entries[slot].target });
  }
  namedSlots.sort(function(a, b) { return a.slot - b.slot; });

  const namedWithCallers = namedSlots.filter(function(s) { return s.callerCount > 0; });
  const namedWithoutCallers = namedSlots.filter(function(s) { return s.callerCount === 0; });

  emit('Named entries: ' + namedSlots.length);
  emit('Named entries with direct ROM callers: ' + namedWithCallers.length);
  emit('Named entries with NO direct ROM callers: ' + namedWithoutCallers.length + ' (called by apps/ASM programs at runtime)');
  emit('');

  // First 50 named entries
  emit('### Named Entries (first 50)');
  emit('');
  emit('| Slot | Address | Name | JP Target | ROM Callers |');
  emit('|------|---------|------|-----------|-------------|');
  for (const s of namedSlots.slice(0, 50)) {
    emit('| #' + s.slot + ' | ' + hex(s.addr) + ' | ' + s.name + ' | ' + hex(s.target) + ' | ' + s.callerCount + ' |');
  }
  emit('');

  // --- 5. Full table dump (first 100 + last 20) ---
  emit('## 5. Table Dump (first 100 entries)');
  emit('');
  emit('| Index | Address | Target | SDK Name |');
  emit('|-------|---------|--------|----------|');
  for (let i = 0; i < 100 && i < entries.length; i++) {
    const e = entries[i];
    const name = nameMap.get(e.addr) || '';
    emit('| #' + i + ' | ' + hex(e.addr) + ' | ' + hex(e.target) + ' | ' + name + ' |');
  }
  emit('');

  emit('### Last 20 entries');
  emit('');
  emit('| Index | Address | Target | SDK Name |');
  emit('|-------|---------|--------|----------|');
  for (let i = Math.max(0, entries.length - 20); i < entries.length; i++) {
    const e = entries[i];
    const name = nameMap.get(e.addr) || '';
    emit('| #' + i + ' | ' + hex(e.addr) + ' | ' + hex(e.target) + ' | ' + name + ' |');
  }
  emit('');

  // --- 6. RST vector mapping ---
  emit('## 6. RST Vector Mapping');
  emit('');
  emit('| RST | Slot | SDK Name | JP Target |');
  emit('|-----|------|----------|-----------|');
  const rstSlots = [
    { rst: '0x10', slot: 3, name: 'Rst10Handler' },
    { rst: '0x18', slot: 4, name: 'Rst18Handler' },
    { rst: '0x20', slot: 5, name: 'Rst20Handler' },
    { rst: '0x28', slot: 6, name: 'Rst28Handler' },
    { rst: '0x30', slot: 7, name: 'Rst30Handler' },
  ];
  for (const r of rstSlots) {
    const e = entries[r.slot];
    emit('| RST ' + r.rst + ' | #' + r.slot + ' | ' + r.name + ' | ' + hex(e.target) + ' |');
  }
  emit('');

  // --- 7. Summary ---
  emit('## 7. Summary');
  emit('');
  emit('- **Table location**: ' + hex(TABLE_START) + ' - ' + hex(TABLE_END));
  emit('- **Entries**: ' + TABLE_ENTRIES + (anomalies.length > 0 ? ' (' + anomalies.length + ' anomalies)' : ' (all verified JP 0xC3)'));
  emit('- **Magic header**: 5A A5 FF FF at 0x020100');
  emit('- **Unique JP targets**: ' + uniqueTargets);
  emit('- **Targets in flash**: ' + flashTargets + ' (' + (flashTargets / TABLE_ENTRIES * 100).toFixed(1) + '%)');
  emit('- **Targets in low ROM**: ' + lowRomTargets + ' (' + (lowRomTargets / TABLE_ENTRIES * 100).toFixed(1) + '%)');
  emit('- **Duplicate target addresses**: ' + duplicateTargets.length);
  emit('- **Slots called directly from ROM**: ' + calledSlots.length);
  emit('- **Total CALL/JP references**: ' + allRefs.length);
  emit('- **SDK-named entries**: ' + nameMap.size);
  emit('- **Named entries called from ROM**: ' + namedWithCallers.length);
  emit('');

  // Write report
  fs.writeFileSync(REPORT_PATH, out.join('\n'), 'utf8');
  console.log('');
  console.log('Report written to: ' + REPORT_PATH);
}

main();
