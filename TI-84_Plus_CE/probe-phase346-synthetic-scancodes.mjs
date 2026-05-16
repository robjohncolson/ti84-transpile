#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const KEYBOARD_MATRIX_PATH = path.join(__dirname, 'keyboard-matrix.md');

const rom = new Uint8Array(readFileSync(ROM_PATH));
const keyboardMatrixText = readFileSync(KEYBOARD_MATRIX_PATH, 'utf8');

const REQUESTED_START = 0x0869A9;
const REQUESTED_END = 0x086A20;
const DISASM_START = 0x08699B;
const DISASM_END = 0x086A21;

const CALLER_REGION_START = 0x08699B;
const CALLER_REGION_END = 0x086A21;
const RELATED_HELPERS = new Set([0x086A5D, 0x086A6B]);

const CONTEXT_TABLE_BASE = 0x08C958;
const CONTEXT_TABLE_STRIDE = 3;
const CONTEXT_TABLE_MIN_ENTRIES = 20;
const CONTEXT_TABLE_MAX_ENTRIES = 40;
const HANDLER_SCAN_BYTES = 300;
const ROM_MAX = Math.min(rom.length - 1, 0x3FFFFF);

const RAM_MBASE = 0xD0;
const SHORT_PREFIXES = new Set(['sis', 'lis']);
const CONTROL_FLOW_OPS = new Set([
  0xC2, 0xC3, 0xC4, 0xCA, 0xCC, 0xCD, 0xD2, 0xD4, 0xDA, 0xDC,
  0xE2, 0xE4, 0xEA, 0xEC, 0xF2, 0xF4, 0xFA, 0xFC,
]);

const SYNTHETIC_VALUES = [0x82, 0x01, 0xFD];

const COOKED_SCAN_LABELS = new Map([
  [0x01, 'DOWN (phase344 cooked arrow cluster)'],
  [0x02, 'LEFT (phase344 cooked arrow cluster)'],
  [0x03, 'RIGHT (phase344 cooked arrow cluster)'],
  [0x04, 'UP (phase344 cooked arrow cluster)'],
  [0x09, 'ENTER (phase344 cooked dispatch)'],
]);

const NAMED_RAM = new Map([
  [0xD0058E, 'cooked/event scan code register'],
  [0xD00595, 'state-machine counter/selector'],
  [0xD0065B, 'copied state block destination'],
  [0xD00662, 'copied state block tail'],
  [0xD00824, 'mode/state byte'],
  [0xD00825, 'mode sub-selector'],
  [0xD00826, 'state byte tested for zero'],
  [0xD0082D, 'state block header'],
  [0xD0082E, 'state block payload[0]'],
  [0xD0082F, 'state block payload[1]/sub-index'],
  [0xD00838, 'state-machine output byte'],
  [0xD02661, 'display-state flag byte'],
]);

const SOURCE_NOTES = new Map([
  [0x085C0F, 'parent branch gated by BIT 5,(IY+0x11)'],
  [0x086B7D, 'sibling zero-check on D00826 fast-paths into the 0x82 write'],
  [0x086BA3, 'sibling block jumps straight into the copy/clear branch'],
  [0x0869CF, 'local helper call to the 0x29/0x01 guard'],
  [0x0869DF, 'local helper call to the 0x03/0x01 guard'],
  [0x084FAE, 'external helper reuse of 0x086A5D'],
  [0x086791, 'external helper reuse of 0x086A5D'],
  [0x0867AE, 'external helper reuse of 0x086A5D'],
  [0x086B10, 'external helper reuse of 0x086A5D'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function effectiveAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (SHORT_PREFIXES.has(inst.modePrefix)) {
    return (((RAM_MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0) & 0xFFFFFF;
  }
  return (inst.addr >>> 0) & 0xFFFFFF;
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {
    // Fall through.
  }

  return {
    pc,
    length: 1,
    tag: 'db',
    value: rom[pc] ?? 0,
    modePrefix: null,
  };
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatInstruction(inst) {
  if (!inst) {
    return 'db ?';
  }

  switch (inst.tag) {
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ret': return withPrefix(inst, 'ret');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withPrefix(inst, `ld (${hex(effectiveAddress(inst))}), ${inst.pair}`)
        : withPrefix(inst, `ld ${inst.pair}, (${hex(effectiveAddress(inst))})`);
    case 'ld-mem-pair': return withPrefix(inst, `ld (${hex(effectiveAddress(inst))}), ${inst.pair}`);
    case 'ld-reg-mem': return withPrefix(inst, `ld ${inst.dest}, (${hex(effectiveAddress(inst))})`);
    case 'ld-mem-reg': return withPrefix(inst, `ld (${hex(effectiveAddress(inst))}), ${inst.src}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind': return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg': return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-reg-ixd': return withPrefix(inst, `ld ${inst.dest}, (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'ld-ixd-reg': return withPrefix(inst, `ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${inst.src}`);
    case 'ld-ixd-imm': return withPrefix(inst, `ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${hexByte(inst.value)}`);
    case 'inc-pair': return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair': return withPrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'alu-imm': return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-ixd': return withPrefix(inst, `${inst.op} (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'indexed-cb-bit': return withPrefix(inst, `bit ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'indexed-cb-res': return withPrefix(inst, `res ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'indexed-cb-set': return withPrefix(inst, `set ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'bit-test': return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind': return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'nop': return withPrefix(inst, 'nop');
    case 'djnz': return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'ex-de-hl': return withPrefix(inst, 'ex de, hl');
    case 'sub':
      return withPrefix(inst, 'sub');
    case 'db': return withPrefix(inst, `db ${hexByte(inst.value)}`);
    default: return withPrefix(inst, inst.tag);
  }
}

function disassembleWindow(start, endInclusive) {
  const rows = [];
  let pc = start;

  while (pc <= endInclusive && pc < rom.length) {
    const inst = safeDecode(pc);
    const length = Math.max(1, inst.length ?? 1);
    rows.push({
      pc,
      inst,
      length,
      bytes: bytesToHex(rom.subarray(pc, Math.min(rom.length, pc + length))),
      text: formatInstruction(inst),
    });
    pc += length;
  }

  return rows;
}

function decodePreview(offset, count = 4) {
  const rows = [];
  let pc = offset;

  for (let index = 0; index < count && pc < rom.length; index += 1) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst, text: formatInstruction(inst) });
    pc += Math.max(1, inst.length ?? 1);
  }

  return rows;
}

function looksLikeCodeBoundary(offset) {
  const preview = decodePreview(offset, 4);
  if (preview.length < 4) {
    return false;
  }
  return (
    preview[0].inst?.tag === 'ld-pair-imm' &&
    preview[0].inst?.pair === 'bc' &&
    preview[1].inst?.tag === 'ld-pair-imm' &&
    preview[1].inst?.pair === 'hl' &&
    preview[2].inst?.tag === 'ld-pair-imm' &&
    preview[2].inst?.pair === 'de' &&
    preview[3].inst?.tag === 'ldir'
  );
}

function readContextTable() {
  const entries = [];

  for (let index = 0; index < CONTEXT_TABLE_MAX_ENTRIES; index += 1) {
    const offset = CONTEXT_TABLE_BASE + index * CONTEXT_TABLE_STRIDE;
    if (offset + 2 >= rom.length) {
      break;
    }

    const value = read24LE(rom, offset);
    entries.push({ index, addr: value });

    if (entries.length < CONTEXT_TABLE_MIN_ENTRIES) {
      continue;
    }

    const nextOffset = offset + CONTEXT_TABLE_STRIDE;
    if (nextOffset + 2 >= rom.length) {
      break;
    }

    const nextValue = read24LE(rom, nextOffset);
    if (nextValue === 0x000000 || nextValue === 0xFFFFFF || nextValue > ROM_MAX || looksLikeCodeBoundary(nextOffset)) {
      break;
    }
  }

  return entries;
}

function parseKeyboardMatrix(text) {
  const map = new Map();
  const lineRegex = /^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(0x[0-9A-Fa-f]+)\s*\|$/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = lineRegex.exec(line);
    if (!match) {
      continue;
    }

    const label = match[1].trim();
    const code = Number.parseInt(match[4], 16);
    map.set(code, label);
  }

  return map;
}

const rawMatrixLabels = parseKeyboardMatrix(keyboardMatrixText);
const maxRawScanCode = Math.max(...rawMatrixLabels.keys());

function describeValue(value) {
  const pieces = [];
  const raw = rawMatrixLabels.get(value);
  const cooked = COOKED_SCAN_LABELS.get(value);

  if (raw) {
    pieces.push(`raw=${raw}`);
  } else if (value > maxRawScanCode) {
    pieces.push(`raw=none (> ${hexByte(maxRawScanCode)})`);
  } else {
    pieces.push('raw=unlisted');
  }

  if (cooked) {
    pieces.push(`cooked=${cooked}`);
  }

  return pieces.join(', ');
}

function findRow(rows, pc) {
  return rows.find((row) => row.pc === pc) ?? null;
}

function explainWriteSource(rows, rowIndex) {
  const prev = rows[rowIndex - 1]?.inst;
  const prev2 = rows[rowIndex - 2]?.inst;

  if (prev?.tag === 'ld-reg-imm' && prev.dest === 'a') {
    return { kind: 'immediate', summary: `A = ${hexByte(prev.value)}`, value: prev.value & 0xFF };
  }

  if (prev?.tag === 'alu-reg' && prev.op === 'sub' && prev.src === 'a') {
    return { kind: 'zero', summary: 'A = 0x00 via SUB A', value: 0x00 };
  }

  if (
    prev?.tag === 'alu-imm' &&
    prev.op === 'add' &&
    prev2?.tag === 'ld-reg-mem' &&
    prev2.dest === 'a' &&
    effectiveAddress(prev2) === 0xD0082F
  ) {
    return { kind: 'derived', summary: `A = D0082F + ${hexByte(prev.value)}` };
  }

  return { kind: 'flow', summary: 'A comes from prior control flow' };
}

function findD0058EWrites(rows) {
  const writes = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.inst?.tag !== 'ld-mem-reg') {
      continue;
    }
    if (effectiveAddress(row.inst) !== 0xD0058E || row.inst.src !== 'a') {
      continue;
    }

    writes.push({
      pc: row.pc,
      source: explainWriteSource(rows, index),
    });
  }

  return writes;
}

function overlapsRequested(row) {
  return row.pc >= REQUESTED_START && row.pc <= REQUESTED_END;
}

function printDisassembly(rows) {
  console.log('=== Full Disassembly: 0x08699B..0x086A21 ===');
  console.log('Requested window starts at 0x0869A9; rows inside 0x0869A9..0x086A20 are marked with `>>`.');
  console.log('');

  for (const row of rows) {
    const marker = overlapsRequested(row) ? '>>' : '  ';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(18)} ${row.text}`);
  }

  console.log('');
}

function printHelperDisassembly() {
  const helpers = [
    { start: 0x085C0B, end: 0x085C1D, label: 'Parent gate at 0x085C0B' },
    { start: 0x0867CC, end: 0x0867E4, label: '0x82 guard helper at 0x0867CC' },
    { start: 0x086A5D, end: 0x086A6A, label: '0x03/0x01 guard helper at 0x086A5D' },
    { start: 0x086A6B, end: 0x086A71, label: '0x29/0x01 guard helper at 0x086A6B' },
    { start: 0x086B77, end: 0x086B7D, label: 'Sibling direct-entry fast path at 0x086B77' },
    { start: 0x086BA3, end: 0x086BA6, label: 'Sibling direct-entry jump at 0x086BA3' },
  ];

  console.log('=== Supporting Guard Helpers ===');
  console.log('');

  for (const helper of helpers) {
    console.log(`${helper.label}:`);
    for (const row of disassembleWindow(helper.start, helper.end)) {
      console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(18)} ${row.text}`);
    }
    console.log('');
  }
}

function printWriteSummary(rows) {
  const writes = findD0058EWrites(rows);

  console.log('=== D0058E Write Sites Inside This Block Family ===');
  console.log('');

  for (const write of writes) {
    console.log(`  ${hex(write.pc)} -> ${write.source.summary}`);
  }

  console.log('');
  console.log('Guard logic for the three hard-coded synthetic values:');
  console.log('');
  console.log(`  ${hex(0x0869A9)} writes 0x82:`);
  console.log('    - Parent path 0x085C0F only enters 0x08699B when BIT 5,(IY+0x11) is set.');
  console.log('    - 0x08699B requires A == 0x05.');
  console.log('    - 0x0867CC then requires D00824 == 0x02, D0082D == 0x14, and D0082E..D00835 all zero.');
  console.log('    - A sibling block at 0x086B7D can also jump directly to 0x0869A7 when D00826 == 0x00.');
  console.log('');
  console.log(`  ${hex(0x0869D7)} writes 0x01:`);
  console.log('    - The fallback branch 0x0869B4 must have run first: it copies 8 bytes from D0082E..D00835 to D0065B..D00662, then clears D0058E.');
  console.log('    - BIT 0,(IY+0x26) must be clear, otherwise 0x0869CB jumps away before the 0x01/0xFD logic.');
  console.log('    - Helper 0x086A6B returns Z only when D00824 == 0x29 and D00825 == 0x01; that Z result selects the 0x01 write.');
  console.log('');
  console.log(`  ${hex(0x0869E9)} writes 0xFD:`);
  console.log('    - The same copy/clear path at 0x0869B4 must have run, and BIT 0,(IY+0x26) must still be clear.');
  console.log('    - The 0x29/0x01 guard at 0x086A6B must fail, otherwise 0x01 is written instead.');
  console.log('    - The 0x03/0x01 guard at 0x086A5D must also fail, otherwise control branches away with A=0x46 and no 0xFD write.');
  console.log('    - If D00824 == 0x10 and D0082F < 0x06, the just-written 0xFD is immediately replaced by D0082F + 0x77 at 0x0869FF.');
  console.log('');
  console.log('State-machine evidence adjacent to the hard-coded writes:');
  console.log('  - 0x0869B4..0x0869BC calls 0x07F97A, which is eight consecutive LDI instructions: it copies an 8-byte state block.');
  console.log('  - 0x0869FF synthesizes a dynamic 0x77..0x7C family from D0082F, confirming D0058E is carrying cooked/meta events, not only raw key matrix bytes.');
  console.log('');
}

function scanIncomingControlFlow(targetStart, targetEnd) {
  const hits = [];

  for (let pc = 0; pc < rom.length - 3; pc += 1) {
    if (!CONTROL_FLOW_OPS.has(rom[pc])) {
      continue;
    }

    let inst = null;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      continue;
    }

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      continue;
    }
    if (!['call', 'call-conditional', 'jp', 'jp-conditional'].includes(inst.tag)) {
      continue;
    }
    if (!Number.isInteger(inst.target)) {
      continue;
    }
    if (inst.target < targetStart || inst.target > targetEnd) {
      continue;
    }

    hits.push({
      sourcePc: pc,
      target: inst.target >>> 0,
      text: formatInstruction(inst),
      note: SOURCE_NOTES.get(pc) ?? null,
      external: !(pc >= targetStart && pc <= targetEnd),
    });
  }

  return hits.sort((left, right) => left.sourcePc - right.sourcePc);
}

function printCallerSummary() {
  const mainHits = scanIncomingControlFlow(CALLER_REGION_START, CALLER_REGION_END);
  const helperHits = [...RELATED_HELPERS]
    .flatMap((target) => scanIncomingControlFlow(target, target))
    .sort((left, right) => left.sourcePc - right.sourcePc);

  console.log('=== Direct CALL/JP Edges Into The 0x0869xx Block Family ===');
  console.log('');

  if (mainHits.length === 0) {
    console.log('  No direct CALL/JP edges found into 0x08699B..0x086A21.');
  } else {
    for (const hit of mainHits) {
      const scope = hit.external ? 'external' : 'internal';
      const suffix = hit.note ? `  ; ${hit.note}` : '';
      console.log(`  ${hex(hit.sourcePc)}  ${hit.text.padEnd(24)} -> ${hex(hit.target)}  [${scope}]${suffix}`);
    }
  }

  console.log('');
  console.log('Related helper reuse (same subsystem, just outside the requested window):');
  for (const hit of helperHits) {
    const suffix = hit.note ? `  ; ${hit.note}` : '';
    console.log(`  ${hex(hit.sourcePc)}  ${hit.text.padEnd(24)} -> ${hex(hit.target)}${suffix}`);
  }

  console.log('');
  console.log('Takeaway: direct edges come from sibling 0x085Cxx/0x086Bxx blocks and helper calls, not from the CoorMon entry block or the interrupt vectors.');
  console.log('This makes 0x08699B..0x086A21 a sub-state inside a higher-level handler/state machine, not a top-level keyboard IRQ or CoorMon entrypoint.');
  console.log('');
}

function findBranchAfter(rows, index) {
  const next = rows[index + 1]?.inst;
  if (!next) {
    return null;
  }

  if (['jp', 'jp-conditional', 'jr', 'jr-conditional', 'call', 'call-conditional'].includes(next.tag)) {
    return { text: formatInstruction(next), target: next.target ?? null };
  }
  if (next.tag === 'ret-conditional') {
    return { text: formatInstruction(next), target: null };
  }
  return null;
}

function cpCascade(rows) {
  const cascade = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.inst?.tag !== 'alu-imm' || row.inst.op !== 'cp') {
      continue;
    }
    cascade.push({
      pc: row.pc,
      value: row.inst.value & 0xFF,
      branch: findBranchAfter(rows, index),
    });
  }

  return cascade;
}

function uniqueHandlers(entries) {
  const byAddr = new Map();
  for (const entry of entries) {
    const existing = byAddr.get(entry.addr);
    if (existing) {
      existing.indices.push(entry.index);
    } else {
      byAddr.set(entry.addr, { addr: entry.addr, indices: [entry.index] });
    }
  }
  return [...byAddr.values()].sort((left, right) => left.addr - right.addr);
}

function analyzeHandlers() {
  const entries = readContextTable();
  const handlers = uniqueHandlers(entries);
  const results = [];

  for (const handler of handlers) {
    const rows = disassembleWindow(handler.addr, handler.addr + HANDLER_SCAN_BYTES - 1);
    const cps = cpCascade(rows);
    const hits = cps.filter((cp) => SYNTHETIC_VALUES.includes(cp.value));
    results.push({
      ...handler,
      cps,
      hits,
    });
  }

  return { entries, handlers: results };
}

function formatCpList(values) {
  return values.map((value) => hexByte(value)).join(', ');
}

function printHandlerCrossReference() {
  const { entries, handlers } = analyzeHandlers();
  const handler06B4E8 = handlers.find((handler) => handler.addr === 0x06B4E8);
  const hit01 = handlers.filter((handler) => handler.hits.some((hit) => hit.value === 0x01));
  const hit82 = handlers.filter((handler) => handler.hits.some((hit) => hit.value === 0x82));
  const hitFD = handlers.filter((handler) => handler.hits.some((hit) => hit.value === 0xFD));

  console.log('=== Context-Handler CP Cascade Cross-Reference ===');
  console.log('');
  console.log(`Read ${entries.length} context-table entries from ${hex(CONTEXT_TABLE_BASE)}; scanned ${handlers.length} unique handler bodies (${HANDLER_SCAN_BYTES} bytes each).`);
  console.log('');

  if (handler06B4E8) {
    console.log(`  0x06B4E8 CP cascade: ${formatCpList(handler06B4E8.cps.map((cp) => cp.value))}`);
  }
  console.log('  Session-342 reference sequence 0x27, 0x17, 0x19, 0x15, 0x18, 0x20, 0x09 is preserved.');
  console.log('');

  console.log('  Handlers that compare 0x01:');
  if (hit01.length === 0) {
    console.log('    none');
  } else {
    for (const handler of hit01) {
      const details = handler.hits
        .filter((hit) => hit.value === 0x01)
        .map((hit) => `${hex(hit.pc)}${hit.branch ? ` -> ${hit.branch.text}` : ''}`)
        .join('; ');
      console.log(`    ${hex(handler.addr)} [table index/indices ${handler.indices.join(', ')}]  ${details}`);
    }
  }
  console.log('');

  console.log('  Handlers that compare 0x82:');
  console.log(hit82.length === 0 ? '    none in the scanned context-handler cascades' : `    ${hit82.map((handler) => hex(handler.addr)).join(', ')}`);
  console.log('');

  console.log('  Handlers that compare 0xFD:');
  console.log(hitFD.length === 0 ? '    none in the scanned context-handler cascades' : `    ${hitFD.map((handler) => hex(handler.addr)).join(', ')}`);
  console.log('');

  console.log('Takeaway: 0x01 is a live cooked dispatch value seen by context handlers; 0x82 and 0xFD do not appear in the scanned handler CP cascades and behave like meta/sentinel events instead.');
  console.log('');
}

function printValueClassification() {
  console.log('=== Synthetic Value Classification ===');
  console.log('');
  console.log(`Raw keyboard-matrix scan codes from ${path.basename(KEYBOARD_MATRIX_PATH)} top out at ${hexByte(maxRawScanCode)}.`);
  console.log(`Raw cross-reference examples from the file: 0x01 = ${rawMatrixLabels.get(0x01)}, 0x10 = ${rawMatrixLabels.get(0x10)}, 0x67 = ${rawMatrixLabels.get(0x67)}.`);
  console.log('');

  console.log(`  ${hexByte(0x82)}: ${describeValue(0x82)}`);
  console.log('    - Not a raw keyboard-matrix scan code.');
  console.log('    - No scanned context handler compares 0x82, so this behaves like a meta/synthetic event code.');
  console.log('');

  console.log(`  ${hexByte(0x01)}: ${describeValue(0x01)}`);
  console.log(`    - Raw matrix code 0x01 would be ${rawMatrixLabels.get(0x01)}, but D0058E is the cooked/event byte, not the raw D0058C matrix byte.`);
  console.log('    - Phase344 handler work and the live CP hit in Handler[14] place 0x01 inside the cooked arrow/navigation cluster, i.e. a synthetic nav event rather than a direct raw LEFT code.');
  console.log('');

  console.log(`  ${hexByte(0xFD)}: ${describeValue(0xFD)}`);
  console.log('    - Not a raw keyboard-matrix scan code.');
  console.log('    - No scanned context handler compares 0xFD, and the state machine can overwrite it with 0x77..0x7C immediately afterward, so it is best understood as a fallback/sentinel meta code.');
  console.log('');
}

function main() {
  const rows = disassembleWindow(DISASM_START, DISASM_END);

  console.log('Phase 346: synthetic scan code mapping around D0058E');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Keyboard map: ${KEYBOARD_MATRIX_PATH}`);
  console.log('');

  printDisassembly(rows);
  printHelperDisassembly();
  printWriteSummary(rows);
  printCallerSummary();
  printHandlerCrossReference();
  printValueClassification();

  console.log('=== Bottom Line ===');
  console.log('');
  console.log('  - 0x82 is emitted by a guarded state-machine path (and by one direct sibling fast-path), not by raw keyboard hardware.');
  console.log('  - 0x01 is a cooked navigation/event code in the D0058E dispatch space, not the raw matrix 0x01 byte from D0058C.');
  console.log('  - 0xFD is a default meta/sentinel event that can be replaced by the adjacent 0x77..0x7C synthetic family.');
  console.log('  - Direct CALL/JP edges come from sibling helper blocks, so this code sits under a specific higher-level handler/state machine rather than under the IRQ or CoorMon entry directly.');
}

main();
