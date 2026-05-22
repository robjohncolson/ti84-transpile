#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH = path.join(__dirname, 'phase404-notification-types-report.md');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = fs.readFileSync(ROM_PATH);

const MODE = 'adl';
const DISPATCH_ADDR = 0x049CCA;
const EXIT_ADDR = 0x0499C0;
const TYPE_REG = 0xD177B9;

// Byte patterns for CALL 0x049CCA and JP 0x049CCA (little-endian 24-bit)
const CALL_049CCA = [0xCD, 0xCA, 0x9C, 0x04];
const JP_049CCA   = [0xC3, 0xCA, 0x9C, 0x04];

// Type labels from session 403
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

// Exit guard classification from session 403 _seqcase at 0x0499D8
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
  if (ALLOW_TYPES.has(value)) return 'ALLOW (lightweight)';
  if (BLOCK_TYPES.has(value)) return 'BLOCK (heavyweight modal)';
  return 'DEFAULT (allow path)';
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
function disassembleForward(start, maxInstructions = 10) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < maxInstructions; i++) {
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

// Extract the notification type and payload passed to 0x049CCA.
//
// Calling convention (eZ80 ADL, frame via 0x00012C):
//   (IX+9) = notification type  (second param, pushed FIRST = farther from CALL)
//   (IX+6) = payload/value      (first param, pushed LAST = closer to CALL)
//
// Standard call-site pattern:
//   LD BC, <type>      ; 01 tt 00 00   → pushed to (IX+9)
//   PUSH BC            ; C5
//   LD BC, <payload>   ; 01 pp 00 00   → pushed to (IX+6)
//   PUSH BC            ; C5
//   CALL 0x049CCA      ; CD CA 9C 04
//
// Layout before CALL:
//   callPc-10: 01 tt 00 00   LD BC, <type>
//   callPc-6:  C5            PUSH BC
//   callPc-5:  01 pp 00 00   LD BC, <payload>
//   callPc-1:  C5            PUSH BC
//   callPc:    CD CA 9C 04   CALL 0x049CCA
//
// Some callers use PUSH AF or register-indirect loads instead.
function extractNotificationType(callPc) {
  // Standard double-push pattern
  if (callPc >= 10 &&
      rom[callPc - 1] === 0xC5 &&   // PUSH BC (payload)
      rom[callPc - 5] === 0x01 &&   // LD BC, imm24 (payload)
      rom[callPc - 6] === 0xC5 &&   // PUSH BC (type)
      rom[callPc - 10] === 0x01) {  // LD BC, imm24 (type)
    const notifType = rom[callPc - 9]; // low byte = notification type
    const payload = rom[callPc - 4];   // low byte = payload value
    return {
      method: 'stack-double-push',
      notifType,
      payload,
      typePc: callPc - 10,
      payloadPc: callPc - 5,
    };
  }

  // Variant: type pushed via PUSH AF after LD A sequence, then LD BC payload
  // Pattern: ... PUSH AF (F5) ... LD BC, payload (01 xx xx xx) PUSH BC (C5) CALL
  if (callPc >= 6 &&
      rom[callPc - 1] === 0xC5 &&   // PUSH BC (payload)
      rom[callPc - 5] === 0x01) {   // LD BC, imm24 (payload)
    // payload push found; look further back for type push
    const payloadVal = rom[callPc - 4];
    // Check if there's a PUSH AF at callPc - 6, preceded by LD A, imm
    if (rom[callPc - 6] === 0xF5) { // PUSH AF
      // scan back for LD A, imm (3E xx)
      for (let i = callPc - 8; i >= Math.max(0, callPc - 30); i--) {
        if (rom[i] === 0x3E) {
          return {
            method: 'push-af',
            notifType: rom[i + 1],
            payload: payloadVal,
            typePc: i,
            payloadPc: callPc - 5,
          };
        }
      }
    }
    // Single push only — type might be from register
    return {
      method: 'partial-payload-only',
      notifType: null,
      payload: payloadVal,
      typePc: null,
      payloadPc: callPc - 5,
    };
  }

  // Recursive self-call inside 0x049CCA: type from register, payload = 0
  // (see 0x049CF8 in the dispatch function itself)

  return { method: 'unknown', notifType: null, payload: null, typePc: null, payloadPc: null };
}

// ── Main analysis ──

const callSites = findPattern(CALL_049CCA);
const jpSites = findPattern(JP_049CCA);
const allSites = [
  ...callSites.map(pc => ({ pc, kind: 'CALL' })),
  ...jpSites.map(pc => ({ pc, kind: 'JP' })),
].sort((a, b) => a.pc - b.pc);

// Extract type for each caller
const callerRecords = allSites.map(site => {
  const extracted = extractNotificationType(site.pc);
  return { ...site, ...extracted };
});

// Build frequency table by notification type
const typeFrequency = new Map();
for (const rec of callerRecords) {
  const key = rec.notifType !== null ? rec.notifType : 'unknown';
  if (!typeFrequency.has(key)) typeFrequency.set(key, []);
  typeFrequency.get(key).push(rec);
}

// Sort by frequency descending
const sortedTypes = [...typeFrequency.entries()]
  .sort((a, b) => b[1].length - a[1].length);

// ── Build report ──

const lines = [];
lines.push('# Phase 404 - Notification Type Semantics');
lines.push('');
lines.push(`ROM: ${ROM_PATH}`);
lines.push(`Decoder: ${DECODER_PATH}`);
lines.push('');
lines.push('## Executive Summary');
lines.push('');
lines.push(`- Total CALL 0x049CCA sites found: ${callSites.length}`);
lines.push(`- Total JP 0x049CCA sites found: ${jpSites.length}`);
lines.push(`- Combined caller count: ${allSites.length}`);
lines.push(`- Callers with resolved type: ${callerRecords.filter(r => r.notifType !== null).length}`);
lines.push(`- Callers with unknown type: ${callerRecords.filter(r => r.notifType === null).length}`);
lines.push(`- Distinct notification types observed: ${sortedTypes.filter(([k]) => k !== 'unknown').length}`);
lines.push(`- Extraction methods: ${[...new Set(callerRecords.map(r => r.method))].join(', ')}`);
lines.push('');

// ── Section 1: Complete frequency table ──
lines.push('## 1. Notification Type Frequency Table');
lines.push('');
lines.push('| Rank | Type | Label | Count | Classification | Sample Callers |');
lines.push('| --- | --- | --- | --- | --- | --- |');
let rank = 1;
for (const [typeVal, callers] of sortedTypes) {
  if (typeVal === 'unknown') {
    lines.push(`| ${rank} | ??? | (could not resolve) | ${callers.length} | N/A | ${callers.slice(0, 5).map(c => hex(c.pc)).join(', ')}${callers.length > 5 ? ', ...' : ''} |`);
  } else {
    const label = labelForType(typeVal);
    const classification = classifyType(typeVal);
    const callerAddrs = callers.slice(0, 5).map(c => hex(c.pc)).join(', ');
    const more = callers.length > 5 ? ', ...' : '';
    lines.push(`| ${rank} | ${hexByte(typeVal)} | ${label} | ${callers.length} | ${classification} | ${callerAddrs}${more} |`);
  }
  rank++;
}
lines.push('');

// Also show payload distribution for resolved callers
lines.push('### Payload Distribution (for resolved callers)');
lines.push('');
const payloadFreq = new Map();
for (const rec of callerRecords) {
  if (rec.payload !== null) {
    const key = rec.payload;
    payloadFreq.set(key, (payloadFreq.get(key) ?? 0) + 1);
  }
}
const sortedPayloads = [...payloadFreq.entries()].sort((a, b) => b[1] - a[1]);
lines.push('| Payload | Count | Possible Meaning |');
lines.push('| --- | --- | --- |');
for (const [pVal, count] of sortedPayloads.slice(0, 15)) {
  const meaning = pVal === 0 ? 'null/flush' : pVal < 0x20 ? 'small index' : `key/scan code ${hexByte(pVal)}`;
  lines.push(`| ${hexByte(pVal)} | ${count} | ${meaning} |`);
}
lines.push('');

// ── Section 2: Region distribution ──
lines.push('## 2. Caller Region Distribution');
lines.push('');
const regionCounts = new Map();
for (const rec of callerRecords) {
  const region = regionName(rec.pc);
  regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
}
lines.push('| Region | Address Range | Caller Count |');
lines.push('| --- | --- | --- |');
for (const [region, count] of [...regionCounts.entries()].sort((a, b) => b - a)) {
  lines.push(`| ${region} | - | ${count} |`);
}
lines.push('');

// ── Section 3: Top 3 types deep dive ──
// Pick top 3 known types
const top3 = sortedTypes
  .filter(([k]) => k !== 'unknown')
  .slice(0, 3);

lines.push('## 3. Deep Dive: Top 3 Notification Types');
lines.push('');

for (const [typeVal, callers] of top3) {
  lines.push(`### Type ${hexByte(typeVal)} — ${labelForType(typeVal)} (${callers.length} callers)`);
  lines.push('');
  lines.push(`**Classification**: ${classifyType(typeVal)}`);
  lines.push(`**Common payloads**: ${[...new Set(callers.map(c => c.payload).filter(p => p !== null))].map(p => hexByte(p)).join(', ') || 'N/A'}`);
  lines.push('');

  // Region breakdown for this type
  const typeRegions = new Map();
  for (const c of callers) {
    const r = regionName(c.pc);
    typeRegions.set(r, (typeRegions.get(r) ?? 0) + 1);
  }
  lines.push('Region breakdown:');
  for (const [r, count] of [...typeRegions.entries()].sort((a, b) => b - a)) {
    lines.push(`- ${r}: ${count}`);
  }
  lines.push('');

  // Show 3-4 representative callers with context
  const representatives = callers.slice(0, 4);
  for (const rep of representatives) {
    lines.push(`#### Caller at ${hex(rep.pc)} (${rep.kind})`);
    lines.push('');
    lines.push(`- Region: ${regionName(rep.pc)}`);
    lines.push(`- Extraction method: ${rep.method}`);
    lines.push(`- Type: ${rep.notifType !== null ? hexByte(rep.notifType) : 'unresolved'}`);
    lines.push(`- Payload: ${rep.payload !== null ? hexByte(rep.payload) : 'unresolved'}`);
    lines.push('');

    // Context: 20 bytes before
    const beforeRows = recoverContextRows(rep.pc, 30);
    const afterPc = rep.pc + (rep.kind === 'CALL' ? 4 : 4);
    const afterRows = disassembleForward(afterPc, 6);

    lines.push('```text');
    lines.push('  ; --- before ---');
    const showBefore = beforeRows.slice(-8);
    lines.push(...renderRows(showBefore));
    lines.push(`${hex(rep.pc)}  ${formatBytes(rep.pc, 4).padEnd(16)}  ${rep.kind} ${hex(DISPATCH_ADDR)}`);
    if (afterRows.length > 0) {
      lines.push('  ; --- after ---');
      lines.push(...renderRows(afterRows));
    }
    lines.push('```');
    lines.push('');
  }
}

// ── Section 4: Allow/Block summary ──
lines.push('## 4. Allow/Block Classification Summary');
lines.push('');
lines.push('Based on the _seqcase exit guard at 0x0499D8 (session 403):');
lines.push('');
lines.push('| Type | Label | Exit Guard | Meaning |');
lines.push('| --- | --- | --- | --- |');
const allKnownTypes = [...new Set(callerRecords.filter(r => r.notifType !== null).map(r => r.notifType))].sort((a, b) => a - b);
for (const t of allKnownTypes) {
  const count = typeFrequency.get(t)?.length ?? 0;
  lines.push(`| ${hexByte(t)} | ${labelForType(t)} | ${classifyType(t)} | ${count} caller(s) |`);
}
lines.push('');

// ── Section 5: Unknown callers ──
const unknownCallers = callerRecords.filter(r => r.notifType === null);
if (unknownCallers.length > 0) {
  lines.push('## 5. Callers With Unresolved Type');
  lines.push('');
  lines.push(`${unknownCallers.length} callers could not be resolved to an immediate type value.`);
  lines.push('These likely load the type from a register or RAM address computed at runtime.');
  lines.push('');
  // Show first 10
  const showUnknown = unknownCallers.slice(0, 10);
  for (const unk of showUnknown) {
    lines.push(`#### ${hex(unk.pc)} (${unk.kind}) — ${regionName(unk.pc)}`);
    lines.push('');
    const beforeRows = recoverContextRows(unk.pc, 30);
    lines.push('```text');
    lines.push(...renderRows(beforeRows.slice(-6)));
    lines.push(`${hex(unk.pc)}  ${formatBytes(unk.pc, 4).padEnd(16)}  ${unk.kind} ${hex(DISPATCH_ADDR)}`);
    lines.push('```');
    lines.push('');
  }
}

lines.push(`Report also written to: ${REPORT_PATH}`);

const report = lines.join('\n') + '\n';
fs.writeFileSync(REPORT_PATH, report);
process.stdout.write(report);
