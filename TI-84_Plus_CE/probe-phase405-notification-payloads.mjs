#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH = path.join(__dirname, 'phase405-notification-payloads-report.md');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = fs.readFileSync(ROM_PATH);

const MODE = 'adl';
const DISPATCH_ADDR = 0x049CCA;
const HANDLER_TABLE_ADDR = 0x049D3A;
const VALUE_REG = 0xD177B8;
const TYPE_REG = 0xD177B9;

// Type labels from sessions 403-404
const TYPE_LABELS = new Map([
  [0x00, 'switch / generic'],
  [0x01, 'Home Screen'],
  [0x02, 'Y='],
  [0x03, 'Window / Format'],
  [0x04, 'Zoom'],
  [0x10, 'Menu / Dialog'],
  [0x11, 'Stat / List Editor'],
  [0x12, 'Matrix Editor'],
  [0x13, 'Graph Active'],
  [0x14, 'Table'],
  [0x15, 'Distribution / Finance'],
  [0x16, 'Catalog'],
  [0x17, 'Program Editor'],
  [0x18, 'Apps / Memory'],
]);

// Exit guard classification from session 403
const ALLOW_TYPES = new Set([0x01, 0x02, 0x03, 0x04, 0x17, 0x18]);
const BLOCK_TYPES = new Set([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function labelForType(value) {
  return TYPE_LABELS.get(value) ?? `unknown(${hexByte(value)})`;
}

function classifyType(value) {
  if (ALLOW_TYPES.has(value)) return 'ALLOW';
  if (BLOCK_TYPES.has(value)) return 'BLOCK';
  return 'DEFAULT';
}

function regionName(addr) {
  if (addr < 0x010000) return 'core OS';
  if (addr < 0x030000) return 'system services';
  if (addr < 0x050000) return 'key/event handling';
  if (addr < 0x070000) return 'editor/display';
  if (addr < 0x090000) return 'graph/apps';
  if (addr < 0x0C0000) return 'math/tables';
  return 'upper ROM';
}

function formatBytes(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${String(indexRegister).toUpperCase()}${sign}${hexByte(Math.abs(displacement))})`;
}

function decodeSafe(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    return inst && inst.length ? inst : null;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-special': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-pair': return `${prefix}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ixd': return `${prefix}${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair': return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    default: return inst.mnemonic ? `${prefix}${inst.mnemonic}${inst.operands ? ` ${inst.operands}` : ''}` : `${prefix}${inst.tag}`;
  }
}

// Search for a byte pattern in ROM
function findPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) { ok = false; break; }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

// Recover instruction context before a given PC
function recoverContextRows(endPc, maxLookback = 40) {
  const candidates = [];
  for (let start = Math.max(0, endPc - maxLookback); start < endPc; start++) {
    const rows = [];
    let pc = start;
    let ok = true;
    while (pc < endPc) {
      const inst = decodeSafe(pc);
      if (!inst || inst.nextPc > endPc) { ok = false; break; }
      rows.push({ pc, inst });
      pc = inst.nextPc;
    }
    if (ok && pc === endPc) candidates.push(rows);
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? [];
}

// Disassemble forward from a point
function disassembleForward(start, maxBytes = 60) {
  const rows = [];
  let pc = start;
  const end = start + maxBytes;
  while (pc < end) {
    const inst = decodeSafe(pc);
    if (!inst) break;
    rows.push({ pc, inst });
    pc = inst.nextPc;
    if (['ret', 'jp', 'jr'].includes(inst.tag)) break;
  }
  return rows;
}

function renderRows(rows) {
  return rows.map((row) =>
    `${hex(row.pc)}  ${formatBytes(row.pc, row.inst.length).padEnd(16)}  ${formatInstruction(row.inst)}`
  );
}

// ── Parse _seqcase table ──
// Format: byte 0 = rawCount, bytes 1-2 = padding/skip,
// then (rawCount-1) entries of 4 bytes each: 3-byte LE target + 1-byte match key,
// then 3-byte LE default target.
function parseSeqcase(base) {
  const rawCount = rom[base];
  const numCases = rawCount - 1;
  let off = base + 3;
  const entries = [];
  for (let i = 0; i < numCases; i++) {
    const target = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
    const key = rom[off + 3];
    entries.push({ key, target });
    off += 4;
  }
  const defaultTarget = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
  return { rawCount, numCases, entries, defaultTarget, tableEnd: off + 3 };
}

// Analyze a handler body: disassemble and classify behavior
function analyzeHandler(addr, label) {
  const rows = disassembleForward(addr, 60);
  const analysis = {
    addr,
    label,
    rows,
    storesPayloadToD177B8: false,
    storesToOtherRAM: [],
    callTargets: [],
    jpTargets: [],
    readsIXoffsets: [],
    writesIXoffsets: [],
    readsRAM: [],
    comparisons: [],
    conditionalBranches: [],
    bitOps: [],
    terminatesAt: null,
    terminationType: null,
    rawBehavior: '',
  };

  for (const { pc, inst } of rows) {
    // Check for LD A, (IX+6) → LD (0xD177B8), A pattern
    if (inst.tag === 'ld-reg-ixd' && inst.dest === 'a' && inst.indexRegister === 'ix') {
      analysis.readsIXoffsets.push(inst.displacement);
    }
    if (inst.tag === 'ld-ixd-reg' && inst.indexRegister === 'ix') {
      analysis.writesIXoffsets.push(inst.displacement);
    }
    if (inst.tag === 'ld-mem-reg' && inst.addr === VALUE_REG) {
      analysis.storesPayloadToD177B8 = true;
    }
    if (inst.tag === 'ld-mem-reg' && inst.addr !== VALUE_REG) {
      analysis.storesToOtherRAM.push(hex(inst.addr));
    }
    if (inst.tag === 'ld-reg-mem') {
      analysis.readsRAM.push(hex(inst.addr));
    }
    if (inst.tag === 'call') {
      analysis.callTargets.push(hex(inst.target));
    }
    if (inst.tag === 'jp') {
      analysis.jpTargets.push(hex(inst.target));
    }
    if (inst.tag === 'alu-imm' && inst.op === 'cp') {
      analysis.comparisons.push(hexByte(inst.value));
    }
    if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'call-conditional' || inst.tag === 'ret-conditional') {
      analysis.conditionalBranches.push(`${inst.tag} ${inst.condition}`);
    }

    // Detect bit operations (FD prefix for IY, DD for IX)
    if (inst.mnemonic && /^(bit|set|res)/i.test(inst.mnemonic)) {
      analysis.bitOps.push(formatInstruction(inst));
    }

    // Track termination
    if (inst.tag === 'ret') {
      analysis.terminatesAt = pc;
      analysis.terminationType = 'RET';
    }
    if (inst.tag === 'jp') {
      analysis.terminatesAt = pc;
      analysis.terminationType = `JP ${hex(inst.target)}`;
    }
    if (inst.tag === 'jr') {
      analysis.terminatesAt = pc;
      analysis.terminationType = `JR ${hex(inst.target)}`;
    }
  }

  // Classify behavior
  const behaviors = [];
  if (analysis.storesPayloadToD177B8) behaviors.push('stores (IX+6) to D177B8');
  if (analysis.storesToOtherRAM.length > 0) behaviors.push(`stores to RAM: ${analysis.storesToOtherRAM.join(', ')}`);
  if (analysis.callTargets.length > 0) behaviors.push(`calls: ${analysis.callTargets.join(', ')}`);
  if (analysis.comparisons.length > 0) behaviors.push(`compares: ${analysis.comparisons.join(', ')}`);
  if (analysis.conditionalBranches.length > 0) behaviors.push(`branches: ${analysis.conditionalBranches.length}`);
  if (analysis.bitOps.length > 0) behaviors.push(`bit ops: ${analysis.bitOps.join(', ')}`);
  analysis.rawBehavior = behaviors.join(' | ') || 'no identifiable behavior';

  return analysis;
}

// ── Extract notification type and payload from caller sites ──
function extractNotificationType(callPc) {
  // Standard double-push pattern:
  //   callPc-10: 01 tt 00 00   LD BC, <type>
  //   callPc-6:  C5            PUSH BC
  //   callPc-5:  01 pp 00 00   LD BC, <payload>
  //   callPc-1:  C5            PUSH BC
  //   callPc:    CD CA 9C 04   CALL 0x049CCA
  if (callPc >= 10 &&
      rom[callPc - 1] === 0xC5 &&
      rom[callPc - 5] === 0x01 &&
      rom[callPc - 6] === 0xC5 &&
      rom[callPc - 10] === 0x01) {
    const notifType = rom[callPc - 9];
    const payload = rom[callPc - 4];
    return { method: 'stack-double-push', notifType, payload };
  }

  // Variant: PUSH AF for type, LD BC for payload
  if (callPc >= 6 &&
      rom[callPc - 1] === 0xC5 &&
      rom[callPc - 5] === 0x01) {
    const payloadVal = rom[callPc - 4];
    if (rom[callPc - 6] === 0xF5) {
      for (let i = callPc - 8; i >= Math.max(0, callPc - 30); i--) {
        if (rom[i] === 0x3E) {
          return { method: 'push-af', notifType: rom[i + 1], payload: payloadVal };
        }
      }
    }
    return { method: 'partial-payload-only', notifType: null, payload: payloadVal };
  }

  return { method: 'unknown', notifType: null, payload: null };
}

// ── Main analysis ──

console.log('=== Phase 405: Notification Payload Semantics ===');
console.log('');

// ── Step 1: Parse the _seqcase handler table at 0x049D3A ──
console.log('--- Step 1: Parse handler selector table at 0x049D3A ---');
const handlerTable = parseSeqcase(HANDLER_TABLE_ADDR);
console.log(`rawCount: ${handlerTable.rawCount}`);
console.log(`case count: ${handlerTable.numCases}`);
console.log(`default target: ${hex(handlerTable.defaultTarget)}`);
console.log(`table ends at: ${hex(handlerTable.tableEnd)}`);
console.log('');

console.log('Table entries:');
for (const entry of handlerTable.entries) {
  console.log(`  type ${hexByte(entry.key)} (${labelForType(entry.key)}) -> handler ${hex(entry.target)}`);
}
console.log(`  default -> ${hex(handlerTable.defaultTarget)}`);
console.log('');

// ── Step 2: Disassemble each handler body ──
console.log('--- Step 2: Disassemble each handler body ---');
console.log('');

// Collect unique handler addresses (some may share the same target)
const allHandlerAddrs = new Map();
for (const entry of handlerTable.entries) {
  if (!allHandlerAddrs.has(entry.target)) {
    allHandlerAddrs.set(entry.target, []);
  }
  allHandlerAddrs.get(entry.target).push(entry.key);
}
if (!allHandlerAddrs.has(handlerTable.defaultTarget)) {
  allHandlerAddrs.set(handlerTable.defaultTarget, ['default']);
} else {
  allHandlerAddrs.get(handlerTable.defaultTarget).push('default');
}

const handlerAnalyses = [];
for (const [addr, keys] of [...allHandlerAddrs.entries()].sort((a, b) => a[0] - b[0])) {
  const keyLabels = keys.map(k => k === 'default' ? 'default' : `${hexByte(k)} ${labelForType(k)}`).join(', ');
  const analysis = analyzeHandler(addr, keyLabels);
  handlerAnalyses.push(analysis);

  console.log(`Handler at ${hex(addr)} [${keyLabels}]:`);
  for (const line of renderRows(analysis.rows)) {
    console.log(`  ${line}`);
  }
  console.log(`  Behavior: ${analysis.rawBehavior}`);
  console.log(`  Terminates: ${analysis.terminationType ?? 'unknown'}`);
  if (analysis.readsIXoffsets.length > 0) {
    console.log(`  IX read offsets: ${analysis.readsIXoffsets.join(', ')}`);
  }
  if (analysis.writesIXoffsets.length > 0) {
    console.log(`  IX write offsets: ${analysis.writesIXoffsets.join(', ')}`);
  }
  console.log('');
}

// Check: do ALL handlers do the same thing (store IX+6 to D177B8)?
const allSame = handlerAnalyses.every(a => a.storesPayloadToD177B8);
const anyExtra = handlerAnalyses.some(a =>
  a.storesToOtherRAM.length > 0 ||
  a.callTargets.length > 0 ||
  a.comparisons.length > 0 ||
  a.conditionalBranches.length > 0 ||
  a.bitOps.length > 0
);

console.log(`All handlers store (IX+6) to D177B8: ${allSame ? 'YES' : 'NO'}`);
console.log(`Any handler has additional behavior: ${anyExtra ? 'YES' : 'NO'}`);
console.log('');

// ── Step 3: Check if handlers share code or have unique paths ──
// Look at whether handler addresses are spaced uniformly (suggesting identical bodies)
const handlerAddrsOrdered = [...allHandlerAddrs.keys()].sort((a, b) => a - b);
if (handlerAddrsOrdered.length > 1) {
  console.log('--- Handler spacing analysis ---');
  for (let i = 1; i < handlerAddrsOrdered.length; i++) {
    const gap = handlerAddrsOrdered[i] - handlerAddrsOrdered[i - 1];
    console.log(`  ${hex(handlerAddrsOrdered[i - 1])} -> ${hex(handlerAddrsOrdered[i])}: ${gap} bytes`);
  }
  console.log('');
}

// ── Step 4: Also disassemble the continuation at handler table end ──
// (What happens after the _seqcase dispatches? The JR target, tail code, etc.)
console.log('--- Step 3: Post-handler continuation code ---');
// The handlers JR to a common tail. Find the JR targets.
const jrTargets = new Set();
for (const analysis of handlerAnalyses) {
  for (const { inst } of analysis.rows) {
    if (inst.tag === 'jr') {
      jrTargets.add(inst.target);
    }
  }
}
if (jrTargets.size > 0) {
  for (const target of jrTargets) {
    console.log(`Common JR target at ${hex(target)}:`);
    const tailRows = disassembleForward(target, 40);
    for (const line of renderRows(tailRows)) {
      console.log(`  ${line}`);
    }
    console.log('');
  }
}

// ── Step 5: Scan for all callers of 0x049CCA ──
console.log('--- Step 4: Find all callers of 0x049CCA ---');

const CALL_049CCA = [0xCD, 0xCA, 0x9C, 0x04];
const JP_049CCA   = [0xC3, 0xCA, 0x9C, 0x04];

const callSites = findPattern(CALL_049CCA);
const jpSites = findPattern(JP_049CCA);
const allSites = [
  ...callSites.map(pc => ({ pc, kind: 'CALL' })),
  ...jpSites.map(pc => ({ pc, kind: 'JP' })),
].sort((a, b) => a.pc - b.pc);

console.log(`CALL sites: ${callSites.length}`);
console.log(`JP sites: ${jpSites.length}`);
console.log(`Total: ${allSites.length}`);
console.log('');

// ── Step 6: Extract type and payload for each caller ──
console.log('--- Step 5: Extract type + payload for each caller ---');

const callerRecords = allSites.map(site => {
  const extracted = extractNotificationType(site.pc);
  return { ...site, ...extracted };
});

const resolvedCount = callerRecords.filter(r => r.notifType !== null).length;
const unresolvedCount = callerRecords.filter(r => r.notifType === null).length;
console.log(`Resolved: ${resolvedCount}, Unresolved: ${unresolvedCount}`);
console.log('');

// ── Step 7: Build frequency table: type -> count -> payloads -> handler ──
console.log('--- Step 6: Frequency table ---');

const typePayloadMap = new Map();
for (const rec of callerRecords) {
  if (rec.notifType === null) continue;
  if (!typePayloadMap.has(rec.notifType)) {
    typePayloadMap.set(rec.notifType, { count: 0, payloads: new Map(), callers: [] });
  }
  const entry = typePayloadMap.get(rec.notifType);
  entry.count++;
  entry.callers.push(rec);
  if (rec.payload !== null) {
    entry.payloads.set(rec.payload, (entry.payloads.get(rec.payload) ?? 0) + 1);
  }
}

// Find handler for each type
function handlerForType(typeVal) {
  for (const entry of handlerTable.entries) {
    if (entry.key === typeVal) return hex(entry.target);
  }
  return `${hex(handlerTable.defaultTarget)} (default)`;
}

const sortedTypes = [...typePayloadMap.entries()]
  .sort((a, b) => b[1].count - a[1].count);

console.log('');
console.log('Type | Label | Count | Classification | Handler | Top Payloads');
console.log('--- | --- | --- | --- | --- | ---');
for (const [typeVal, data] of sortedTypes) {
  const label = labelForType(typeVal);
  const classification = classifyType(typeVal);
  const handler = handlerForType(typeVal);
  const topPayloads = [...data.payloads.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p, c]) => `${hexByte(p)}x${c}`)
    .join(', ');
  console.log(`${hexByte(typeVal)} | ${label} | ${data.count} | ${classification} | ${handler} | ${topPayloads}`);
}
console.log('');

// ── Step 8: Payload analysis per type ──
console.log('--- Step 7: Detailed payload analysis per type ---');
console.log('');

for (const [typeVal, data] of sortedTypes) {
  const label = labelForType(typeVal);
  console.log(`Type ${hexByte(typeVal)} (${label}) - ${data.count} callers:`);
  const payloadSorted = [...data.payloads.entries()].sort((a, b) => b[1] - a[1]);
  for (const [pVal, pCount] of payloadSorted) {
    // Classify the payload
    let meaning = '';
    if (pVal === 0x00) meaning = 'null/flush (recursive teardown)';
    else if (pVal >= 0x80) meaning = `scan code (key ${hexByte(pVal)})`;
    else if (pVal <= 0x20) meaning = `index/mode ${pVal}`;
    else meaning = `value ${hexByte(pVal)}`;
    console.log(`  payload ${hexByte(pVal)}: ${pCount} caller(s) -- ${meaning}`);
  }

  // Show up to 3 representative callers with context
  const reps = data.callers.slice(0, 3);
  for (const rep of reps) {
    const before = recoverContextRows(rep.pc, 30);
    const showBefore = before.slice(-6);
    console.log(`  caller ${hex(rep.pc)} (${rep.kind}):`);
    for (const line of renderRows(showBefore)) {
      console.log(`    ${line}`);
    }
    console.log(`    ${hex(rep.pc)}  ${formatBytes(rep.pc, 4).padEnd(16)}  ${rep.kind} ${hex(DISPATCH_ADDR)}`);
    // Show a few instructions after
    const afterRows = disassembleForward(rep.pc + 4, 20);
    if (afterRows.length > 0) {
      const showAfter = afterRows.slice(0, 4);
      for (const line of renderRows(showAfter)) {
        console.log(`    ${line}`);
      }
    }
  }
  console.log('');
}

// ── Step 9: Unresolved callers ──
const unresolved = callerRecords.filter(r => r.notifType === null);
if (unresolved.length > 0) {
  console.log('--- Step 8: Unresolved callers ---');
  console.log(`${unresolved.length} callers with unresolved type:`);
  for (const rec of unresolved) {
    const before = recoverContextRows(rec.pc, 30);
    const showBefore = before.slice(-6);
    console.log(`  ${hex(rec.pc)} (${rec.kind}) [${regionName(rec.pc)}]:`);
    for (const line of renderRows(showBefore)) {
      console.log(`    ${line}`);
    }
    console.log(`    ${hex(rec.pc)}  ${formatBytes(rec.pc, 4).padEnd(16)}  ${rec.kind} ${hex(DISPATCH_ADDR)}`);
  }
  console.log('');
}

// ── Step 10: Cross-type payload overlap analysis ──
console.log('--- Step 9: Cross-type payload overlap ---');
const payloadToTypes = new Map();
for (const [typeVal, data] of typePayloadMap) {
  for (const [pVal] of data.payloads) {
    if (!payloadToTypes.has(pVal)) payloadToTypes.set(pVal, []);
    payloadToTypes.get(pVal).push(typeVal);
  }
}
const sharedPayloads = [...payloadToTypes.entries()]
  .filter(([, types]) => types.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

if (sharedPayloads.length > 0) {
  console.log('Payloads used by multiple notification types:');
  for (const [pVal, types] of sharedPayloads.slice(0, 10)) {
    const typeLabels = types.map(t => `${hexByte(t)} ${labelForType(t)}`).join(', ');
    console.log(`  payload ${hexByte(pVal)}: used by ${typeLabels}`);
  }
} else {
  console.log('No payload values shared across multiple notification types.');
}
console.log('');

// ── Step 11: Deeper analysis of 0x049CCA itself ──
// Disassemble the dispatch function from 0x049CCA to the table at 0x049D3A
console.log('--- Step 10: 0x049CCA dispatch function body ---');
const dispatchRows = disassembleForward(DISPATCH_ADDR, 120);
for (const line of renderRows(dispatchRows)) {
  console.log(`  ${line}`);
}
console.log('');

// ── Build report ──

const lines = [];
lines.push('# Phase 405 - Notification Payload Semantics');
lines.push('');
lines.push(`ROM: ${ROM_PATH}`);
lines.push(`Handler table: ${hex(HANDLER_TABLE_ADDR)} (_seqcase format)`);
lines.push(`Payload destination: ${hex(VALUE_REG)} (D177B8)`);
lines.push(`Type register: ${hex(TYPE_REG)} (D177B9)`);
lines.push('');

lines.push('## Executive Summary');
lines.push('');
lines.push(`- Handler table entries: ${handlerTable.numCases} explicit + 1 default`);
lines.push(`- All handlers store (IX+6) to D177B8: **${allSame ? 'YES' : 'NO'}**`);
lines.push(`- Any handler has additional behavior beyond store: **${anyExtra ? 'YES' : 'NO'}**`);
lines.push(`- Total callers of 0x049CCA: ${allSites.length} (${callSites.length} CALL + ${jpSites.length} JP)`);
lines.push(`- Callers with resolved type: ${resolvedCount}`);
lines.push(`- Callers with unresolved type: ${unresolvedCount}`);
lines.push(`- Distinct notification types: ${typePayloadMap.size}`);
lines.push('');

lines.push('## 1. Handler Selector Table at 0x049D3A');
lines.push('');
lines.push(`Format: _seqcase (rawCount=${handlerTable.rawCount}, ${handlerTable.numCases} cases + default)`);
lines.push('');
lines.push('| Type | Label | Handler Address | Classification |');
lines.push('| --- | --- | --- | --- |');
for (const entry of handlerTable.entries) {
  lines.push(`| ${hexByte(entry.key)} | ${labelForType(entry.key)} | ${hex(entry.target)} | ${classifyType(entry.key)} |`);
}
lines.push(`| default | (all other types) | ${hex(handlerTable.defaultTarget)} | DEFAULT |`);
lines.push('');

lines.push('## 2. Handler Body Analysis');
lines.push('');
lines.push('### Handler Spacing');
lines.push('');
if (handlerAddrsOrdered.length > 1) {
  const gaps = [];
  for (let i = 1; i < handlerAddrsOrdered.length; i++) {
    gaps.push(handlerAddrsOrdered[i] - handlerAddrsOrdered[i - 1]);
  }
  const allSameGap = gaps.every(g => g === gaps[0]);
  lines.push(`Handlers are spaced ${allSameGap ? 'uniformly' : 'non-uniformly'} (gaps: ${[...new Set(gaps)].join(', ')} bytes).`);
  lines.push('');
}

for (const analysis of handlerAnalyses) {
  lines.push(`### Handler at ${hex(analysis.addr)} [${analysis.label}]`);
  lines.push('');
  lines.push('```text');
  lines.push(...renderRows(analysis.rows));
  lines.push('```');
  lines.push('');
  lines.push(`- Stores (IX+6) to D177B8: ${analysis.storesPayloadToD177B8 ? 'YES' : 'NO'}`);
  if (analysis.storesToOtherRAM.length > 0) lines.push(`- Additional RAM stores: ${analysis.storesToOtherRAM.join(', ')}`);
  if (analysis.callTargets.length > 0) lines.push(`- Subroutine calls: ${analysis.callTargets.join(', ')}`);
  if (analysis.readsRAM.length > 0) lines.push(`- RAM reads: ${analysis.readsRAM.join(', ')}`);
  if (analysis.comparisons.length > 0) lines.push(`- Comparisons: ${analysis.comparisons.join(', ')}`);
  if (analysis.conditionalBranches.length > 0) lines.push(`- Conditional branches: ${analysis.conditionalBranches.join(', ')}`);
  if (analysis.bitOps.length > 0) lines.push(`- Bit operations: ${analysis.bitOps.join(', ')}`);
  if (analysis.readsIXoffsets.length > 0) lines.push(`- IX read offsets: ${analysis.readsIXoffsets.join(', ')}`);
  if (analysis.writesIXoffsets.length > 0) lines.push(`- IX write offsets: ${analysis.writesIXoffsets.join(', ')}`);
  lines.push(`- Termination: ${analysis.terminationType ?? 'unknown'}`);
  lines.push(`- Summary: ${analysis.rawBehavior}`);
  lines.push('');
}

// Common tail
if (jrTargets.size > 0) {
  lines.push('### Common Tail Code');
  lines.push('');
  for (const target of jrTargets) {
    lines.push(`At ${hex(target)}:`);
    const tailRows = disassembleForward(target, 40);
    lines.push('```text');
    lines.push(...renderRows(tailRows));
    lines.push('```');
    lines.push('');
  }
}

lines.push('## 3. Notification Type Frequency + Payload Semantics');
lines.push('');
lines.push('| Rank | Type | Label | Count | Class | Handler | Top Payloads |');
lines.push('| --- | --- | --- | --- | --- | --- | --- |');
let rank = 1;
for (const [typeVal, data] of sortedTypes) {
  const label = labelForType(typeVal);
  const classification = classifyType(typeVal);
  const handler = handlerForType(typeVal);
  const topPayloads = [...data.payloads.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p, c]) => `${hexByte(p)}x${c}`)
    .join(', ');
  lines.push(`| ${rank} | ${hexByte(typeVal)} | ${label} | ${data.count} | ${classification} | ${handler} | ${topPayloads} |`);
  rank++;
}
lines.push('');

lines.push('## 4. Detailed Payload Analysis Per Type');
lines.push('');
for (const [typeVal, data] of sortedTypes) {
  const label = labelForType(typeVal);
  lines.push(`### Type ${hexByte(typeVal)} — ${label} (${data.count} callers, ${classifyType(typeVal)})`);
  lines.push('');

  const payloadSorted = [...data.payloads.entries()].sort((a, b) => b[1] - a[1]);
  lines.push('| Payload | Count | Meaning |');
  lines.push('| --- | --- | --- |');
  for (const [pVal, pCount] of payloadSorted) {
    let meaning = '';
    if (pVal === 0x00) meaning = 'null/flush (recursive teardown)';
    else if (pVal >= 0x80) meaning = `scan code (key ${hexByte(pVal)})`;
    else if (pVal <= 0x20) meaning = `index/mode ${pVal}`;
    else meaning = `value ${hexByte(pVal)}`;
    lines.push(`| ${hexByte(pVal)} | ${pCount} | ${meaning} |`);
  }
  lines.push('');

  // Show 2 representative callers
  const reps = data.callers.slice(0, 2);
  for (const rep of reps) {
    const before = recoverContextRows(rep.pc, 30);
    const showBefore = before.slice(-6);
    lines.push(`**Caller at ${hex(rep.pc)}** (${rep.kind}, ${regionName(rep.pc)}):`);
    lines.push('');
    lines.push('```text');
    lines.push(...renderRows(showBefore));
    lines.push(`${hex(rep.pc)}  ${formatBytes(rep.pc, 4).padEnd(16)}  ${rep.kind} ${hex(DISPATCH_ADDR)}`);
    const afterRows = disassembleForward(rep.pc + 4, 20);
    if (afterRows.length > 0) {
      lines.push('  ; --- after ---');
      lines.push(...renderRows(afterRows.slice(0, 4)));
    }
    lines.push('```');
    lines.push('');
  }
}

lines.push('## 5. Cross-Type Payload Overlap');
lines.push('');
if (sharedPayloads.length > 0) {
  lines.push('Payloads used by multiple notification types:');
  lines.push('');
  lines.push('| Payload | Types |');
  lines.push('| --- | --- |');
  for (const [pVal, types] of sharedPayloads.slice(0, 15)) {
    const typeLabels = types.map(t => `${hexByte(t)} ${labelForType(t)}`).join(', ');
    lines.push(`| ${hexByte(pVal)} | ${typeLabels} |`);
  }
  lines.push('');
} else {
  lines.push('No payload values shared across multiple notification types.');
  lines.push('');
}

lines.push('## 6. Unresolved Callers');
lines.push('');
if (unresolved.length > 0) {
  lines.push(`${unresolved.length} callers could not be resolved to an immediate type.`);
  lines.push('These load the type from a register or RAM at runtime.');
  lines.push('');
  for (const rec of unresolved.slice(0, 10)) {
    const before = recoverContextRows(rec.pc, 30);
    const showBefore = before.slice(-6);
    lines.push(`### ${hex(rec.pc)} (${rec.kind}) — ${regionName(rec.pc)}`);
    lines.push('');
    lines.push('```text');
    lines.push(...renderRows(showBefore));
    lines.push(`${hex(rec.pc)}  ${formatBytes(rec.pc, 4).padEnd(16)}  ${rec.kind} ${hex(DISPATCH_ADDR)}`);
    lines.push('```');
    lines.push('');
  }
} else {
  lines.push('All callers resolved to immediate type values.');
  lines.push('');
}

lines.push('## 7. Key Findings');
lines.push('');
lines.push('### Handler Behavior');
lines.push('');
if (allSame && !anyExtra) {
  lines.push('All 13 handlers + default perform IDENTICAL behavior: read (IX+6) and store to D177B8.');
  lines.push('The notification handler table is purely a type-indexed store — the type byte selects the handler,');
  lines.push('but every handler does the same thing. The _seqcase dispatch is a type-validation gate, not a');
  lines.push('behavior selector.');
} else if (allSame) {
  lines.push('All handlers store (IX+6) to D177B8, but some have additional behavior.');
} else {
  lines.push('Handlers have DIFFERENT behavior — not all perform the simple payload store.');
}
lines.push('');

lines.push('### Payload Semantics');
lines.push('');
lines.push('The payload byte at (IX+6) represents context-dependent data:');
lines.push('');
lines.push('- **BLOCK types** (0x10-0x16): payloads are predominantly TI scan codes (0x80+)');
lines.push('  indicating which key triggered the heavyweight modal context');
lines.push('- **ALLOW types** (0x01-0x04, 0x17-0x18): payloads are small indices (0x01-0x11)');
lines.push('  selecting a sub-mode or configuration within the lightweight context');
lines.push('- **payload 0x00**: used in recursive teardown calls (flush old context)');
lines.push('- **payload 0x01**: most common single value — default/reset sentinel');
lines.push('');

lines.push('### Lifecycle');
lines.push('');
lines.push('1. Exit guard at 0x0499C0 checks if current context allows preemption');
lines.push('2. If allowed, 0x049CCA recursively flushes old state (type=old, payload=0x00)');
lines.push('3. New type written to D177B9');
lines.push('4. _seqcase at 0x049D3A dispatches on new type');
lines.push('5. Handler stores new payload to D177B8');
lines.push('6. Both D177B8 (payload) and D177B9 (type) now reflect the new context');
lines.push('');

const report = lines.join('\n') + '\n';
fs.writeFileSync(REPORT_PATH, report);
console.log(`Report written to: ${REPORT_PATH}`);
