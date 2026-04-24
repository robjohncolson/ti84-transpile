#!/usr/bin/env node

/**
 * Phase 25AY: Static disassembly of 0x099211 — ParseInpGraph wrapper hypothesis.
 *
 * Disassembles 300 bytes at 0x099211, annotating:
 *   - Known CALL targets
 *   - IY-relative RES/SET/BIT instructions (flag manipulation)
 *   - JP/JR targets
 *   - OP1 references (0xD005F8 area)
 *   - Absolute flag address references
 *
 * Generates phase25ay-disasm-099211-report.md with analysis.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rom = readFileSync(join(__dirname, 'ROM.rom'));

const ADL_MODE = 'adl';
const START_ADDR = 0x099211;
const BYTE_COUNT = 300;
const IY_BASE = 0xD00080;

// Known symbols
const KNOWN_CALLS = new Map([
  [0x061DEF, 'PushErrorHandler'],
  [0x061DD1, 'PopErrorHandler (alt)'],
  [0x061E20, 'PopErrorHandler'],
  [0x099914, 'ParseInp'],
  [0x099910, 'ParseInp trampoline'],
  [0x08383D, 'ChkFindSym'],
  [0x05E872, 'CloseEditEqu'],
  [0x0800EC, 'OS helper'],
  [0x0801D9, 'TypeCheck helper'],
  [0x082685, 'OS helper'],
  [0x082C50, 'OS helper'],
  [0x098795, 'EditHelper'],
  [0x0987A2, 'PostDispatch helper'],
  [0x0987B7, 'FormatHelper'],
  [0x098B84, 'FormatHelper2'],
  [0x0B184C, 'FormToTok'],
  [0x0B1850, 'FormatHelper3'],
  [0x05E2C0, 'QueueHelper'],
  [0x05E2E0, 'QueueHelper2'],
  [0x07F7A4, 'TypeHelper'],
  [0x07F7A8, 'TypeHelper2'],
  [0x07F9FB, 'QueueHelper3'],
  [0x07FA07, 'QueueHelper4'],
  [0x0972C3, 'SaveEditCursor'],
  [0x0973BA, 'BufferFlush'],
  [0x0973C8, 'ENTER dual-ParseInp'],
]);

// IY-relative flag names (IY = 0xD00080)
const IY_FLAG_NAMES = new Map([
  [0x00, 'ioDelFlag (0xD00080)'],
  [0x09, 'statFlags (0xD00089)'],
  [0x12, 'plotSScreen flags (0xD00092)'],
  [0x24, 'sGrFlags (0xD000A4)'],
  [0x34, 'textFlags (0xD000B4)'],
  [0x3D, 'apdFlags (0xD000BD)'],
  [0x44, 'ParsFlag (0xD000C4)'],
  [0x45, 'ParsFlag2 (0xD000C5)'],
  [0x46, 'ParsFlag3 (0xD000C6)'],
  [0x49, 'newDispF (0xD000C9)'],
  [0x4A, 'fmtFlags (0xD000CA)'],
  [0x4B, 'numMode (0xD000CB)'],
  [0x4C, 'fmtOverride (0xD000CC)'],
]);

// Known absolute flag addresses
const KNOWN_FLAG_ADDRS = new Map([
  [0xD000C4, 'ParsFlag'],
  [0xD000C5, 'ParsFlag2'],
  [0xD000C6, 'ParsFlag3'],
  [0xD000CA, 'fmtFlags'],
  [0xD000CB, 'numMode'],
  [0xD000CC, 'fmtOverride'],
  [0xD000C9, 'newDispF'],
  [0xD000A4, 'sGrFlags'],
  [0xD000BD, 'apdFlags'],
  [0xD00080, 'ioDelFlag'],
  [0xD00089, 'statFlags'],
]);

// OP1 area
const OP1_START = 0xD005F8;
const OP1_END = 0xD00606; // OP1 is 9 bytes, but check wider range

function hex(v, w = 6) {
  if (v === undefined || v === null) return 'n/a';
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function bytesHex(buf, pc, len) {
  return Array.from(buf.slice(pc, pc + len), b =>
    b.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function signedDisp(v) {
  return v >= 0 ? `+${v}` : `${v}`;
}

function formatInstruction(inst) {
  const d = v => signedDisp(v);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  const cases = {
    'nop': () => 'nop',
    'ei': () => 'ei',
    'di': () => 'di',
    'halt': () => 'halt',
    'ret': () => 'ret',
    'ret-conditional': () => `ret ${inst.condition}`,
    'retn': () => 'retn',
    'reti': () => 'reti',
    'call': () => `call ${hex(inst.target)}`,
    'call-conditional': () => `call ${inst.condition}, ${hex(inst.target)}`,
    'jp': () => `jp ${hex(inst.target)}`,
    'jp-conditional': () => `jp ${inst.condition}, ${hex(inst.target)}`,
    'jp-indirect': () => `jp (${inst.indirectRegister})`,
    'jr': () => `jr ${hex(inst.target)}`,
    'jr-conditional': () => `jr ${inst.condition}, ${hex(inst.target)}`,
    'djnz': () => `djnz ${hex(inst.target)}`,
    'rst': () => `rst ${hex(inst.target)}`,
    'push': () => `push ${inst.pair}`,
    'pop': () => `pop ${inst.pair}`,
    'ex-af': () => "ex af, af'",
    'ex-de-hl': () => 'ex de, hl',
    'ex-sp-pair': () => `ex (sp), ${inst.pair}`,
    'exx': () => 'exx',
    'ld-pair-imm': () => `ld ${inst.pair}, ${hex(inst.value)}`,
    'ld-pair-mem': () => inst.direction === 'to-mem'
      ? `ld (${hex(inst.addr)}), ${inst.pair}` : `ld ${inst.pair}, (${hex(inst.addr)})`,
    'ld-mem-pair': () => `ld (${hex(inst.addr)}), ${inst.pair}`,
    'ld-reg-imm': () => `ld ${inst.dest}, ${hex(inst.value, 2)}`,
    'ld-reg-mem': () => `ld ${inst.dest}, (${hex(inst.addr)})`,
    'ld-mem-reg': () => `ld (${hex(inst.addr)}), ${inst.src}`,
    'ld-reg-ind': () => `ld ${inst.dest}, (${inst.src})`,
    'ld-ind-reg': () => `ld (${inst.dest}), ${inst.src}`,
    'ld-reg-reg': () => `ld ${inst.dest}, ${inst.src}`,
    'ld-reg-ixd': () => `ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`,
    'ld-ixd-reg': () => `ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`,
    'ld-ixd-imm': () => `ld (${inst.indexRegister}${d(inst.displacement)}), ${hex(inst.value, 2)}`,
    'ld-sp-pair': () => `ld sp, ${inst.src}`,
    'ld-a-ind-bc': () => 'ld a, (bc)',
    'ld-a-ind-de': () => 'ld a, (de)',
    'ld-ind-bc-a': () => 'ld (bc), a',
    'ld-ind-de-a': () => 'ld (de), a',
    'ld-pair-ind': () => `ld ${inst.pair}, (${inst.src})`,
    'ld-ind-pair': () => `ld (${inst.dest}), ${inst.pair}`,
    'inc-pair': () => `inc ${inst.pair}`,
    'dec-pair': () => `dec ${inst.pair}`,
    'inc-reg': () => `inc ${inst.reg}`,
    'dec-reg': () => `dec ${inst.reg}`,
    'inc-ind': () => `inc (${inst.indirectRegister})`,
    'dec-ind': () => `dec (${inst.indirectRegister})`,
    'add-pair': () => `add ${inst.dest}, ${inst.src}`,
    'alu-reg': () => `${inst.op} ${inst.src}`,
    'alu-imm': () => `${inst.op} ${hex(inst.value, 2)}`,
    'alu-ind': () => `${inst.op} (${inst.indirectRegister})`,
    'sbc-pair': () => `sbc hl, ${inst.src}`,
    'adc-pair': () => `adc hl, ${inst.src}`,
    'bit-test': () => `bit ${inst.bit}, ${inst.reg}`,
    'bit-test-ind': () => `bit ${inst.bit}, (${inst.indirectRegister})`,
    'bit-res': () => `res ${inst.bit}, ${inst.reg}`,
    'bit-res-ind': () => `res ${inst.bit}, (${inst.indirectRegister})`,
    'bit-set': () => `set ${inst.bit}, ${inst.reg}`,
    'bit-set-ind': () => `set ${inst.bit}, (${inst.indirectRegister})`,
    'indexed-cb-bit': () => `bit ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`,
    'indexed-cb-res': () => `res ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`,
    'indexed-cb-set': () => `set ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`,
    'indexed-cb-rotate': () => `${inst.op} (${inst.indexRegister}${d(inst.displacement)})`,
    'rotate-reg': () => `${inst.op} ${inst.reg}`,
    'rotate-ind': () => `${inst.op} (${inst.indirectRegister})`,
    'ldir': () => 'ldir',
    'lddr': () => 'lddr',
    'ldi': () => 'ldi',
    'ldd': () => 'ldd',
    'cpir': () => 'cpir',
    'cpdr': () => 'cpdr',
    'cpi': () => 'cpi',
    'cpd': () => 'cpd',
    'daa': () => 'daa',
    'cpl': () => 'cpl',
    'ccf': () => 'ccf',
    'scf': () => 'scf',
    'neg': () => 'neg',
    'rla': () => 'rla',
    'rra': () => 'rra',
    'rlca': () => 'rlca',
    'rrca': () => 'rrca',
    'rld': () => 'rld',
    'rrd': () => 'rrd',
    'lea': () => `lea ${inst.dest}, ${inst.base}${d(inst.displacement)}`,
    'mlt': () => `mlt ${inst.reg}`,
    'tst-reg': () => `tst a, ${inst.reg}`,
    'tst-ind': () => `tst a, (${inst.indirectRegister})`,
    'tst-imm': () => `tst a, ${hex(inst.value, 2)}`,
    'im': () => `im ${inst.mode_num}`,
    'in-reg': () => `in ${inst.dest}, (c)`,
    'out-reg': () => `out (c), ${inst.src}`,
    'in-a-imm': () => `in a, (${hex(inst.port, 2)})`,
    'out-imm-a': () => `out (${hex(inst.port, 2)}), a`,
    'inc-ixd': () => `inc (${inst.indexRegister}${d(inst.displacement)})`,
    'dec-ixd': () => `dec (${inst.indexRegister}${d(inst.displacement)})`,
    'alu-ixd': () => `${inst.op} (${inst.indexRegister}${d(inst.displacement)})`,
  };

  const fn = cases[inst.tag];
  if (fn) return prefix + fn();

  // fallback
  const skip = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough']);
  const parts = Object.entries(inst)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v) : v}`);
  return prefix + (parts.length ? `${inst.tag} ${parts.join(' ')}` : inst.tag);
}

// Annotation helpers
function getCallAnnotation(target) {
  return KNOWN_CALLS.get(target) || null;
}

function getIYAnnotation(inst) {
  // Check for IY-relative indexed-cb operations (bit/res/set on (iy+d))
  const iyTags = ['indexed-cb-bit', 'indexed-cb-res', 'indexed-cb-set',
                  'ld-reg-ixd', 'ld-ixd-reg', 'ld-ixd-imm',
                  'inc-ixd', 'dec-ixd', 'alu-ixd', 'indexed-cb-rotate'];
  if (iyTags.includes(inst.tag) && inst.indexRegister === 'iy') {
    const offset = inst.displacement >= 0 ? inst.displacement : 256 + inst.displacement;
    const addr = IY_BASE + offset;
    const flagName = IY_FLAG_NAMES.get(offset);
    const bitInfo = (inst.bit !== undefined) ? ` bit ${inst.bit}` : '';
    return `IY+0x${offset.toString(16).toUpperCase().padStart(2, '0')} = ${hex(addr)}${flagName ? ` (${flagName})` : ''}${bitInfo}`;
  }
  return null;
}

function getAddrAnnotation(inst) {
  // Check for absolute address references to known flag locations or OP1
  const addr = inst.addr ?? inst.target ?? inst.value;
  if (typeof addr !== 'number') return null;

  const flagName = KNOWN_FLAG_ADDRS.get(addr);
  if (flagName) return `=> ${flagName}`;

  if (addr >= OP1_START && addr <= OP1_END) {
    return `=> OP1 area (offset +${addr - OP1_START})`;
  }
  return null;
}

function annotateRow(row) {
  const annotations = [];
  if (!row.inst) return annotations;

  // CALL/JP annotation
  if ((row.inst.tag === 'call' || row.inst.tag === 'call-conditional') && typeof row.inst.target === 'number') {
    const label = getCallAnnotation(row.inst.target);
    if (label) annotations.push(label);
  }
  if ((row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional') && typeof row.inst.target === 'number') {
    const label = getCallAnnotation(row.inst.target);
    if (label) annotations.push(`JP -> ${label}`);
  }

  // IY-relative
  const iyNote = getIYAnnotation(row.inst);
  if (iyNote) annotations.push(iyNote);

  // Absolute address references
  const addrNote = getAddrAnnotation(row.inst);
  if (addrNote) annotations.push(addrNote);

  return annotations;
}

// Disassemble
function disassembleRange(startAddr, byteCount) {
  const rows = [];
  let pc = startAddr;
  const endAddr = startAddr + byteCount;

  while (pc < endAddr) {
    const inst = decodeInstruction(rom, pc, ADL_MODE);
    if (!inst || !inst.length) {
      rows.push({
        pc,
        bytes: bytesHex(rom, pc, 1),
        text: `db ${hex(rom[pc] ?? 0, 2)}`,
        inst: null,
        annotations: [],
      });
      pc += 1;
      continue;
    }

    const text = formatInstruction(inst);
    const row = { pc, bytes: bytesHex(rom, inst.pc, inst.length), text, inst };
    row.annotations = annotateRow(row);
    rows.push(row);
    pc += inst.length;
  }

  return rows;
}

// Collect summary data
function collectSummary(rows) {
  const callTargets = [];
  const jpTargets = [];
  const jrTargets = [];
  const iyOps = [];
  const flagRefs = [];
  const op1Refs = [];
  let retCount = 0;

  for (const row of rows) {
    if (!row.inst) continue;
    const t = row.inst.tag;
    const target = row.inst.target;

    if ((t === 'call' || t === 'call-conditional') && typeof target === 'number') {
      callTargets.push({ from: row.pc, target, cond: row.inst.condition ?? null, label: getCallAnnotation(target) });
    }
    if ((t === 'jp' || t === 'jp-conditional') && typeof target === 'number') {
      jpTargets.push({ from: row.pc, target, cond: row.inst.condition ?? null, label: getCallAnnotation(target) });
    }
    if ((t === 'jr' || t === 'jr-conditional') && typeof target === 'number') {
      jrTargets.push({ from: row.pc, target, cond: row.inst.condition ?? null });
    }
    if (t === 'ret' || t === 'ret-conditional') retCount++;

    const iyNote = getIYAnnotation(row.inst);
    if (iyNote) {
      iyOps.push({ pc: row.pc, text: row.text, note: iyNote });
    }

    // Check for absolute flag/OP1 refs in any LD-type instruction
    const addr = row.inst.addr;
    if (typeof addr === 'number') {
      if (KNOWN_FLAG_ADDRS.has(addr)) {
        flagRefs.push({ pc: row.pc, text: row.text, flag: KNOWN_FLAG_ADDRS.get(addr), addr });
      }
      if (addr >= OP1_START && addr <= OP1_END) {
        op1Refs.push({ pc: row.pc, text: row.text, addr });
      }
    }
  }

  return { callTargets, jpTargets, jrTargets, iyOps, flagRefs, op1Refs, retCount };
}

// Run
const rows = disassembleRange(START_ADDR, BYTE_COUNT);
const summary = collectSummary(rows);

// Console output
console.log('=== Phase 25AY: Static disassembly of 0x099211 — ParseInpGraph wrapper test ===');
console.log(`ROM: ${rom.length} bytes`);
console.log(`Range: ${hex(START_ADDR)} .. ${hex(START_ADDR + BYTE_COUNT)} (${BYTE_COUNT} bytes, ADL mode)`);
console.log('');

console.log('--- Disassembly listing ---');
console.log('');
for (const row of rows) {
  const ann = row.annotations.length ? `  ; ${row.annotations.join(' | ')}` : '';
  console.log(`${hex(row.pc)}  ${row.bytes.padEnd(24)}  ${row.text}${ann}`);
}

console.log('');
console.log('--- IY-relative flag operations ---');
if (summary.iyOps.length === 0) {
  console.log('  (none found)');
} else {
  for (const op of summary.iyOps) {
    console.log(`  ${hex(op.pc)}  ${op.text.padEnd(40)}  ${op.note}`);
  }
}

console.log('');
console.log('--- CALL targets ---');
for (const c of summary.callTargets) {
  const cond = c.cond ? ` (${c.cond})` : '';
  const label = c.label ? ` = ${c.label}` : '';
  console.log(`  ${hex(c.from)} -> CALL${cond} ${hex(c.target)}${label}`);
}

console.log('');
console.log('--- JP targets ---');
for (const j of summary.jpTargets) {
  const cond = j.cond ? ` (${j.cond})` : '';
  const label = j.label ? ` = ${j.label}` : '';
  console.log(`  ${hex(j.from)} -> JP${cond} ${hex(j.target)}${label}`);
}

console.log('');
console.log('--- JR targets ---');
for (const j of summary.jrTargets) {
  const cond = j.cond ? ` (${j.cond})` : '';
  console.log(`  ${hex(j.from)} -> JR${cond} ${hex(j.target)}`);
}

console.log('');
console.log('--- Absolute flag address references ---');
if (summary.flagRefs.length === 0) {
  console.log('  (none found)');
} else {
  for (const f of summary.flagRefs) {
    console.log(`  ${hex(f.pc)}  ${f.text.padEnd(40)}  => ${f.flag} (${hex(f.addr)})`);
  }
}

console.log('');
console.log('--- OP1 references ---');
if (summary.op1Refs.length === 0) {
  console.log('  (none found)');
} else {
  for (const o of summary.op1Refs) {
    console.log(`  ${hex(o.pc)}  ${o.text.padEnd(40)}  => OP1+${o.addr - OP1_START}`);
  }
}

console.log('');
console.log(`--- Summary: ${summary.callTargets.length} CALLs, ${summary.jpTargets.length} JPs, ${summary.jrTargets.length} JRs, ${summary.iyOps.length} IY ops, ${summary.flagRefs.length} flag refs, ${summary.op1Refs.length} OP1 refs, ${summary.retCount} RETs ---`);

// Determine ParseInpGraph verdict
const hasParseInpCall = summary.callTargets.some(c => c.target === 0x099914);
const hasParseInpJP = summary.jpTargets.some(j => j.target === 0x099914);
const hasTrampolineRef = summary.callTargets.some(c => c.target === 0x099910) ||
                         summary.jpTargets.some(j => j.target === 0x099910);
const hasPushErrorHandler = summary.callTargets.some(c => c.target === 0x061DEF);
const iyParsFlagOps = summary.iyOps.filter(op => {
  const match = op.note.match(/IY\+0x([0-9A-F]+)/);
  if (!match) return false;
  const offset = parseInt(match[1], 16);
  return offset >= 0x44 && offset <= 0x4C; // ParsFlag..fmtOverride range
});

console.log('');
console.log('=== ParseInpGraph Wrapper Verdict ===');
console.log(`  CALL ParseInp (0x099914): ${hasParseInpCall ? 'YES' : 'NO'}`);
console.log(`  JP ParseInp (0x099914):   ${hasParseInpJP ? 'YES' : 'NO'}`);
console.log(`  Trampoline (0x099910):    ${hasTrampolineRef ? 'YES' : 'NO'}`);
console.log(`  PushErrorHandler:         ${hasPushErrorHandler ? 'YES' : 'NO'}`);
console.log(`  IY ParsFlag-area ops:     ${iyParsFlagOps.length}`);
if (iyParsFlagOps.length > 0) {
  for (const op of iyParsFlagOps) {
    console.log(`    ${hex(op.pc)}  ${op.text}  -- ${op.note}`);
  }
}

const isWrapper = (hasParseInpCall || hasParseInpJP || hasTrampolineRef) && iyParsFlagOps.length > 0;
console.log('');
if (isWrapper) {
  console.log(`CONCLUSION: 0x099211 IS a ParseInpGraph-style wrapper.`);
  console.log(`It sets ${iyParsFlagOps.length} parser flag(s) before invoking ParseInp.`);
} else if (hasParseInpCall || hasParseInpJP || hasTrampolineRef) {
  console.log(`CONCLUSION: 0x099211 calls ParseInp but does NOT manipulate ParsFlag-area IY flags.`);
  console.log(`It may be a thin wrapper but not a "ParseInpGraph" style flag-setter.`);
} else if (iyParsFlagOps.length > 0) {
  console.log(`CONCLUSION: 0x099211 manipulates parser flags but does NOT call ParseInp within 300 bytes.`);
  console.log(`It may set flags consumed later by a separate ParseInp call.`);
} else {
  console.log(`CONCLUSION: 0x099211 is NOT a ParseInpGraph wrapper within the 300-byte window.`);
  console.log(`No ParseInp reference and no ParsFlag-area IY operations found.`);
}

// Generate report
const reportLines = [];
reportLines.push('# Phase 25AY: Disassembly of 0x099211 — ParseInpGraph Wrapper Analysis');
reportLines.push('');
reportLines.push(`Generated: ${new Date().toISOString()}`);
reportLines.push('');
reportLines.push('## Parameters');
reportLines.push(`- Start: ${hex(START_ADDR)}`);
reportLines.push(`- Length: ${BYTE_COUNT} bytes`);
reportLines.push(`- Mode: ADL`);
reportLines.push(`- IY base: ${hex(IY_BASE)}`);
reportLines.push('');

reportLines.push('## Disassembly');
reportLines.push('');
reportLines.push('```');
for (const row of rows) {
  const ann = row.annotations.length ? `  ; ${row.annotations.join(' | ')}` : '';
  reportLines.push(`${hex(row.pc)}  ${row.bytes.padEnd(24)}  ${row.text}${ann}`);
}
reportLines.push('```');
reportLines.push('');

reportLines.push('## IY-Relative Flag Operations');
reportLines.push('');
if (summary.iyOps.length === 0) {
  reportLines.push('None found in this range.');
} else {
  reportLines.push('| Address | Instruction | Flag |');
  reportLines.push('|---------|-------------|------|');
  for (const op of summary.iyOps) {
    reportLines.push(`| ${hex(op.pc)} | \`${op.text}\` | ${op.note} |`);
  }
}
reportLines.push('');

reportLines.push('## CALL Targets');
reportLines.push('');
reportLines.push('| From | Target | Label |');
reportLines.push('|------|--------|-------|');
for (const c of summary.callTargets) {
  const cond = c.cond ? ` (${c.cond})` : '';
  reportLines.push(`| ${hex(c.from)} | ${hex(c.target)} | ${c.label || 'unknown'}${cond} |`);
}
reportLines.push('');

reportLines.push('## JP/JR Targets');
reportLines.push('');
reportLines.push('| From | Type | Target | Label |');
reportLines.push('|------|------|--------|-------|');
for (const j of summary.jpTargets) {
  const cond = j.cond ? ` (${j.cond})` : '';
  reportLines.push(`| ${hex(j.from)} | JP${cond} | ${hex(j.target)} | ${j.label || ''} |`);
}
for (const j of summary.jrTargets) {
  const cond = j.cond ? ` (${j.cond})` : '';
  reportLines.push(`| ${hex(j.from)} | JR${cond} | ${hex(j.target)} | |`);
}
reportLines.push('');

reportLines.push('## Absolute Flag References');
reportLines.push('');
if (summary.flagRefs.length === 0) {
  reportLines.push('None found.');
} else {
  for (const f of summary.flagRefs) {
    reportLines.push(`- ${hex(f.pc)}: \`${f.text}\` => ${f.flag} (${hex(f.addr)})`);
  }
}
reportLines.push('');

reportLines.push('## OP1 References');
reportLines.push('');
if (summary.op1Refs.length === 0) {
  reportLines.push('None found.');
} else {
  for (const o of summary.op1Refs) {
    reportLines.push(`- ${hex(o.pc)}: \`${o.text}\` => OP1+${o.addr - OP1_START}`);
  }
}
reportLines.push('');

reportLines.push('## ParseInpGraph Wrapper Verdict');
reportLines.push('');
reportLines.push(`- CALL ParseInp (0x099914): **${hasParseInpCall ? 'YES' : 'NO'}**`);
reportLines.push(`- JP ParseInp (0x099914): **${hasParseInpJP ? 'YES' : 'NO'}**`);
reportLines.push(`- Trampoline ref (0x099910): **${hasTrampolineRef ? 'YES' : 'NO'}**`);
reportLines.push(`- PushErrorHandler: **${hasPushErrorHandler ? 'YES' : 'NO'}**`);
reportLines.push(`- IY ParsFlag-area operations: **${iyParsFlagOps.length}**`);
reportLines.push('');

if (isWrapper) {
  reportLines.push(`### CONCLUSION: 0x099211 IS a ParseInpGraph-style wrapper`);
  reportLines.push('');
  reportLines.push(`It sets ${iyParsFlagOps.length} parser flag(s) before invoking ParseInp.`);
  reportLines.push('These flags represent the ambient parser state that a direct ParseInp call bypasses.');
} else if (hasParseInpCall || hasParseInpJP || hasTrampolineRef) {
  reportLines.push('### CONCLUSION: Thin wrapper (no ParsFlag manipulation)');
  reportLines.push('');
  reportLines.push('0x099211 calls ParseInp but does not manipulate ParsFlag-area IY flags within 300 bytes.');
} else if (iyParsFlagOps.length > 0) {
  reportLines.push('### CONCLUSION: Flag setter (no direct ParseInp call)');
  reportLines.push('');
  reportLines.push('0x099211 manipulates parser flags but does not call ParseInp within 300 bytes.');
  reportLines.push('The flags may be consumed by a subsequent ParseInp call outside this window.');
} else {
  reportLines.push('### CONCLUSION: NOT a ParseInpGraph wrapper');
  reportLines.push('');
  reportLines.push('No ParseInp reference and no ParsFlag-area IY operations found within 300 bytes.');
}

const reportPath = join(__dirname, 'phase25ay-disasm-099211-report.md');
writeFileSync(reportPath, reportLines.join('\n') + '\n');
console.log('');
console.log(`Report written to: ${reportPath}`);
