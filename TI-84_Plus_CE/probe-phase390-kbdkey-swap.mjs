#!/usr/bin/env node

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROM_PATH = join(__dirname, 'ROM.rom');

const rom = readFileSync(ROM_PATH);

const MODE = 'adl';
const MBASE = 0xD0;

const NORMAL_START = 0x03032C;
const NORMAL_END_EXCLUSIVE = 0x030358;

const BUILDER_START = 0x0236F9;
const BUILDER_INSTRUCTION_COUNT = 64;

const D00000 = 0xD00000;
const D00001 = 0xD00001;
const D00002 = 0xD00002;
const D00003 = 0xD00003;
const KBD_KEY = 0xD0058C;
const KBD_TOKEN = 0xD0058E;
const CX_CUR_APP = 0xD007E0;

const NAMES = new Map([
  [D00000, 'D00000 mailbox/control byte'],
  [D00001, 'D00001 mailbox byte 1'],
  [D00002, 'D00002 mailbox byte 2'],
  [D00003, 'D00003 mailbox byte 3'],
  [KBD_KEY, 'kbdKey'],
  [KBD_TOKEN, 'kbdToken'],
  [CX_CUR_APP, 'cxCurApp'],
]);

const NO_OPERAND_TAGS = new Set([
  'nop',
  'halt',
  'ret',
  'reti',
  'retn',
  'scf',
  'ccf',
  'cpl',
  'di',
  'ei',
  'daa',
  'neg',
  'rlca',
  'rrca',
  'rla',
  'rra',
  'exx',
  'ex-af',
  'ex-de-hl',
  'ldir',
  'lddr',
  'ldi',
  'ldd',
  'cpir',
  'cpdr',
  'cpi',
  'cpd',
  'rrd',
  'rld',
  'slp',
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function signedHex(value) {
  const n = Number(value ?? 0);
  return `${n >= 0 ? '+' : '-'}${hexByte(Math.abs(n))}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${signedHex(displacement)})`;
}

function formatBytes(start, length) {
  return Array.from(
    rom.subarray(start, start + length),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'decodeError',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${signedHex(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return { mnemonic: 'db', operands: hexByte(inst.value) };
    case 'ret-conditional':
      return { mnemonic: 'ret', operands: inst.condition };
    case 'jr':
      return { mnemonic: 'jr', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'jr', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'djnz', operands: hex(inst.target) };
    case 'jp':
      return { mnemonic: 'jp', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'jp', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'jp-indirect':
      return { mnemonic: 'jp', operands: `(${inst.indirectRegister ?? inst.reg ?? 'hl'})` };
    case 'call':
      return { mnemonic: 'call', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'call', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'rst':
      return { mnemonic: 'rst', operands: hexByte(inst.target) };
    case 'push':
      return { mnemonic: 'push', operands: inst.pair };
    case 'pop':
      return { mnemonic: 'pop', operands: inst.pair };
    case 'ld-pair-imm':
      return { mnemonic: 'ld', operands: `${inst.pair}, ${hex(inst.value)}` };
    case 'ld-reg-imm':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-reg-ind':
      return { mnemonic: 'ld', operands: `${inst.dest}, (${inst.src})` };
    case 'ld-ind-reg':
      return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.src}` };
    case 'ld-ind-imm':
      return { mnemonic: 'ld', operands: `(hl), ${hexByte(inst.value)}` };
    case 'ld-reg-mem':
      return { mnemonic: 'ld', operands: `${inst.dest}, (${hex(inst.addr)})` };
    case 'ld-mem-reg':
      return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.src}` };
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
      }
      return { mnemonic: 'ld', operands: `${inst.pair}, (${hex(inst.addr)})` };
    case 'ld-mem-pair':
      return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair ?? inst.src}` };
    case 'ld-sp-hl':
      return { mnemonic: 'ld', operands: 'sp, hl' };
    case 'ld-sp-pair':
      return { mnemonic: 'ld', operands: `sp, ${inst.pair}` };
    case 'ld-pair-indexed':
      return {
        mnemonic: 'ld',
        operands: `${inst.pair}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`,
      };
    case 'ld-indexed-pair':
      return {
        mnemonic: 'ld',
        operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair}`,
      };
    case 'ld-reg-ixd':
    case 'ld-reg-idx':
    case 'ld-ixiy-indexed':
      return {
        mnemonic: 'ld',
        operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`,
      };
    case 'ld-ixd-reg':
    case 'ld-idx-reg':
    case 'ld-indexed-ixiy':
      return {
        mnemonic: 'ld',
        operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}`,
      };
    case 'ld-ixd-imm':
    case 'ld-idx-imm':
      return {
        mnemonic: 'ld',
        operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`,
      };
    case 'ld-special':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-a-mb':
      return { mnemonic: 'ld', operands: 'a, mb' };
    case 'ld-mb-a':
      return { mnemonic: 'ld', operands: 'mb, a' };
    case 'inc-pair':
      return { mnemonic: 'inc', operands: inst.pair };
    case 'dec-pair':
      return { mnemonic: 'dec', operands: inst.pair };
    case 'inc-reg':
      return { mnemonic: 'inc', operands: inst.reg };
    case 'dec-reg':
      return { mnemonic: 'dec', operands: inst.reg };
    case 'inc-ixd':
      return { mnemonic: 'inc', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
    case 'dec-ixd':
      return { mnemonic: 'dec', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
    case 'add-pair':
      return { mnemonic: 'add', operands: `${inst.dest}, ${inst.src}` };
    case 'adc-pair':
      return { mnemonic: 'adc', operands: `hl, ${inst.src}` };
    case 'sbc-pair':
      return { mnemonic: 'sbc', operands: `hl, ${inst.src}` };
    case 'alu-reg':
      return { mnemonic: inst.op, operands: inst.src };
    case 'alu-imm':
    case 'alu-immediate':
      return { mnemonic: inst.op, operands: hexByte(inst.value) };
    case 'alu-ind':
      return { mnemonic: inst.op, operands: '(hl)' };
    case 'alu-idx':
      return { mnemonic: inst.op, operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
    case 'bit-test':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-test-ind':
      return { mnemonic: 'bit', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-set-ind':
      return { mnemonic: 'set', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-res-ind':
      return { mnemonic: 'res', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'indexed-cb-bit':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'in-reg':
      return { mnemonic: 'in', operands: `${inst.reg ?? inst.dest ?? 'a'}, (c)` };
    case 'out0':
      return { mnemonic: 'out0', operands: `(${hexByte(inst.port)}), ${inst.reg}` };
    case 'out-imm':
      return { mnemonic: 'out', operands: `(${hexByte(inst.port)}), a` };
    case 'lea':
      return { mnemonic: 'lea', operands: `${inst.dest}, ${inst.base}${signedHex(inst.displacement)}` };
    default: {
      if (NO_OPERAND_TAGS.has(inst?.tag)) {
        return { mnemonic: inst.tag, operands: '' };
      }
      return { mnemonic: inst?.tag ?? '???', operands: fallbackOperands(inst) };
    }
  }
}

function formatInstruction(inst) {
  if (!inst?.tag) {
    return '???';
  }
  const rendered = renderInstruction(inst);
  const body = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return inst.modePrefix ? `${inst.modePrefix} ${body}` : body;
}

function resolveEffectiveAddress(inst) {
  const rawAddr = inst?.addr ?? inst?.address;
  if (!Number.isInteger(rawAddr)) {
    return null;
  }
  if ((inst.modePrefix === 'sis' || inst.modePrefix === 'lis') && rawAddr >= 0x0000 && rawAddr <= 0xFFFF) {
    return ((MBASE << 16) | rawAddr) >>> 0;
  }
  return rawAddr >>> 0;
}

function memoryAccessKind(inst) {
  switch (inst?.tag) {
    case 'ld-reg-mem':
      return 'READ';
    case 'ld-mem-reg':
      return 'WRITE';
    case 'ld-pair-mem':
      return inst.direction === 'to-mem' ? 'WRITE' : 'READ';
    case 'ld-mem-pair':
      return 'WRITE';
    default:
      return 'OTHER';
  }
}

function noteLabel(addr) {
  return NAMES.get(addr) ?? hex(addr);
}

function noteForRow(pc, inst) {
  const notes = [];
  const effectiveAddr = resolveEffectiveAddress(inst);
  const accessKind = memoryAccessKind(inst);

  if (effectiveAddr !== null && accessKind !== 'OTHER') {
    notes.push(`${accessKind} ${noteLabel(effectiveAddr)}`);
  }

  const custom = {
    0x0236FA: 'caller[0] = input A',
    0x023700: 'caller[1] = cxCurApp',
    0x023704: 'default caller[2] = 0',
    0x023706: 'if cxCurApp != 0x4E, keep byte 2 zero',
    0x02370C: 'caller[2] = A (0 or kbdToken)',
    0x02370D: 'rewind HL to record start+1',
    0x02370E: 'rewind HL to record start',
    0x02370F: 'BC = 0xDCA0',
    0x023713: 'IN A,(0xDCA0) before return',
    0x02FD60: 'D00000 = 0xCC sentinel/control byte',
    0x02FD68: 'store HL=0x00FFFF into D00001..D00003',
    0x03030E: 'short-address MBASE read; effective address is 0xD00001',
    0x03032C: 'load mailbox byte 1',
    0x030330: 'commit byte 1 into kbdKey',
    0x030334: 'load mailbox byte 2',
    0x030339: 'single-byte token path if D00002 == 0',
    0x03033B: 'start two-byte token swap',
    0x030340: 'old kbdKey becomes kbdToken',
    0x030345: 'byte 2 becomes new kbdKey',
    0x030349: 'reload kbdToken into A for tail-jump',
    0x03034F: 'single-byte path: kbdToken = 0',
    0x030353: 'tail-jump back to caller/dispatcher loop',
  }[pc];

  if (custom) {
    notes.push(custom);
  }

  return notes.join(' | ');
}

function decodeRow(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    if (!inst || !inst.length) {
      return {
        pc,
        length: 1,
        bytes: formatBytes(pc, 1),
        text: `db ${hexByte(rom[pc])}`,
        note: '',
        inst: null,
      };
    }
    return {
      pc,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      text: formatInstruction(inst),
      note: noteForRow(pc, inst),
      inst,
    };
  } catch {
    return {
      pc,
      length: 1,
      bytes: formatBytes(pc, 1),
      text: `db ${hexByte(rom[pc])}`,
      note: '',
      inst: null,
    };
  }
}

function disassembleRange(start, endExclusive) {
  const rows = [];
  let pc = start;
  while (pc < endExclusive) {
    const row = decodeRow(pc);
    rows.push(row);
    pc += row.length;
  }
  return rows;
}

function disassembleCount(start, count) {
  const rows = [];
  let pc = start;
  while (rows.length < count && pc < rom.length) {
    const row = decodeRow(pc);
    rows.push(row);
    pc += row.length;
  }
  return rows;
}

function printRows(title, rows) {
  console.log(`\n=== ${title} ===`);
  for (const row of rows) {
    const note = row.note ? ` ; ${row.note}` : '';
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}${note}`);
  }
}

function findPattern(pattern) {
  const hits = [];
  outer: for (let offset = 0; offset <= rom.length - pattern.length; offset += 1) {
    for (let index = 0; index < pattern.length; index += 1) {
      if (rom[offset + index] !== pattern[index]) {
        continue outer;
      }
    }
    hits.push(offset);
  }
  return hits;
}

function decodeContainingInstruction(patternOffset, patternLength, maxBacktrack = 8) {
  const candidates = [];
  for (let start = Math.max(0, patternOffset - maxBacktrack); start <= patternOffset; start += 1) {
    try {
      const inst = decodeInstruction(rom, start, MODE);
      if (!inst || !inst.length) continue;
      if (start <= patternOffset && start + inst.length >= patternOffset + patternLength) {
        candidates.push({ start, inst });
      }
    } catch {
      // ignore decode failures while backtracking
    }
  }
  return candidates.length ? candidates[0] : null;
}

function pointerFollowup(start, inst) {
  if (inst?.tag !== 'ld-pair-imm') {
    return '';
  }
  try {
    const next = decodeInstruction(rom, start + inst.length, MODE);
    if (!next || !next.length) return '';
    return ` -> next ${formatInstruction(next)}`;
  } catch {
    return '';
  }
}

function classifyPatternHit(targetAddr, hit) {
  const containing = decodeContainingInstruction(hit, 3);
  if (!containing) {
    return {
      hit,
      pc: null,
      kind: 'RAW_ONLY',
      bytes: formatBytes(hit, 3),
      text: '(no decodable containing instruction)',
    };
  }

  const { start, inst } = containing;
  const effectiveAddr = resolveEffectiveAddress(inst);
  const accessKind = memoryAccessKind(inst);
  let kind = 'OTHER';

  if (effectiveAddr === targetAddr && accessKind !== 'OTHER') {
    kind = `DIRECT_${accessKind}`;
  } else if (inst.tag === 'ld-pair-imm' && inst.value === targetAddr) {
    kind = 'POINTER_LOAD';
  } else if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-pair-mem' || inst.tag === 'ld-mem-pair') {
    kind = 'OVERLAP';
  } else if (inst.tag === 'ld-pair-imm') {
    kind = 'IMMEDIATE_NOISE';
  }

  const followup = kind === 'POINTER_LOAD' ? pointerFollowup(start, inst) : '';
  return {
    hit,
    pc: start,
    kind,
    bytes: formatBytes(start, inst.length),
    text: `${formatInstruction(inst)}${followup}`,
  };
}

function scanPatternAddress(addr) {
  const pattern = [addr & 0xFF, (addr >>> 8) & 0xFF, (addr >>> 16) & 0xFF];
  const rawHits = findPattern(pattern);
  return {
    addr,
    pattern,
    hits: rawHits.map((hit) => classifyPatternHit(addr, hit)),
  };
}

function printPatternScan(title, scan) {
  console.log(`\n=== ${title} (${hex(scan.addr)} / pattern ${scan.pattern.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')}) ===`);
  console.log(`raw hits: ${scan.hits.length}`);
  for (const hit of scan.hits) {
    const loc = hit.pc === null ? `raw@${hex(hit.hit)}` : `inst@${hex(hit.pc)} raw@${hex(hit.hit)}`;
    console.log(`${loc}  ${hit.kind.padEnd(14)} ${hit.bytes.padEnd(20)} ${hit.text}`);
  }
}

function scanShortMbaseRefs(shortAddr) {
  const lo = shortAddr & 0xFF;
  const hi = (shortAddr >>> 8) & 0xFF;
  const fullAddr = ((MBASE << 16) | shortAddr) >>> 0;

  const patterns = [
    { bytes: [0x40, 0x2A, lo, hi], text: `sis ld hl, (${hex(shortAddr, 4)})`, kind: 'SHORT_READ' },
    { bytes: [0x49, 0x2A, lo, hi], text: `lis ld hl, (${hex(shortAddr, 4)})`, kind: 'SHORT_READ' },
    { bytes: [0x40, 0x22, lo, hi], text: `sis ld (${hex(shortAddr, 4)}), hl`, kind: 'SHORT_WRITE' },
    { bytes: [0x49, 0x22, lo, hi], text: `lis ld (${hex(shortAddr, 4)}), hl`, kind: 'SHORT_WRITE' },
    { bytes: [0x40, 0x3A, lo, hi], text: `sis ld a, (${hex(shortAddr, 4)})`, kind: 'SHORT_READ' },
    { bytes: [0x49, 0x3A, lo, hi], text: `lis ld a, (${hex(shortAddr, 4)})`, kind: 'SHORT_READ' },
    { bytes: [0x40, 0x32, lo, hi], text: `sis ld (${hex(shortAddr, 4)}), a`, kind: 'SHORT_WRITE' },
    { bytes: [0x49, 0x32, lo, hi], text: `lis ld (${hex(shortAddr, 4)}), a`, kind: 'SHORT_WRITE' },
    { bytes: [0x40, 0xED, 0x43, lo, hi], text: `sis ld (${hex(shortAddr, 4)}), bc`, kind: 'SHORT_WRITE' },
    { bytes: [0x40, 0xED, 0x53, lo, hi], text: `sis ld (${hex(shortAddr, 4)}), de`, kind: 'SHORT_WRITE' },
    { bytes: [0x40, 0xED, 0x63, lo, hi], text: `sis ld (${hex(shortAddr, 4)}), hl`, kind: 'SHORT_WRITE' },
    { bytes: [0x40, 0xED, 0x73, lo, hi], text: `sis ld (${hex(shortAddr, 4)}), sp`, kind: 'SHORT_WRITE' },
    { bytes: [0x40, 0xED, 0x4B, lo, hi], text: `sis ld bc, (${hex(shortAddr, 4)})`, kind: 'SHORT_READ' },
    { bytes: [0x40, 0xED, 0x5B, lo, hi], text: `sis ld de, (${hex(shortAddr, 4)})`, kind: 'SHORT_READ' },
    { bytes: [0x40, 0xED, 0x6B, lo, hi], text: `sis ld hl, (${hex(shortAddr, 4)})`, kind: 'SHORT_READ' },
    { bytes: [0x40, 0xED, 0x7B, lo, hi], text: `sis ld sp, (${hex(shortAddr, 4)})`, kind: 'SHORT_READ' },
  ];

  const rows = [];
  for (const pattern of patterns) {
    for (const hit of findPattern(pattern.bytes)) {
      rows.push({
        pc: hit,
        kind: pattern.kind,
        bytes: formatBytes(hit, pattern.bytes.length),
        text: `${pattern.text}  [MBASE -> ${hex(fullAddr)}]`,
      });
    }
  }
  rows.sort((left, right) => left.pc - right.pc);
  return rows;
}

function printShortScan(shortAddr, rows) {
  const fullAddr = ((MBASE << 16) | shortAddr) >>> 0;
  console.log(`\n=== short-address MBASE refs for ${hex(fullAddr)} (encoded as ${hex(shortAddr, 4)}) ===`);
  if (rows.length === 0) {
    console.log('(none)');
    return;
  }
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${row.kind.padEnd(11)} ${row.bytes.padEnd(20)} ${row.text}`);
  }
}

function countKinds(scan) {
  const counts = new Map();
  for (const hit of scan.hits) {
    counts.set(hit.kind, (counts.get(hit.kind) ?? 0) + 1);
  }
  return counts;
}

function printKindSummary(label, scan) {
  const counts = countKinds(scan);
  console.log(`${label}:`);
  for (const [kind, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${kind.padEnd(14)} ${count}`);
  }
}

function main() {
  console.log('Phase 390: trace the kbdKey <-> kbdToken swap in 0x030300');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${hex(rom.length)}`);

  const normalRows = disassembleRange(NORMAL_START, NORMAL_END_EXCLUSIVE);
  const builderRows = disassembleCount(BUILDER_START, BUILDER_INSTRUCTION_COUNT);

  printRows('1. Normal key path 0x03032C-0x030357', normalRows);
  printRows(`2. 0x0236F9 key-event builder (${builderRows.length} instructions)`, builderRows);

  const d00001Scan = scanPatternAddress(D00001);
  const d00002Scan = scanPatternAddress(D00002);
  const kbdKeyScan = scanPatternAddress(KBD_KEY);
  const kbdTokenScan = scanPatternAddress(KBD_TOKEN);

  printPatternScan('3a. Raw byte-pattern scan for D00001', d00001Scan);
  printPatternScan('3b. Raw byte-pattern scan for D00002', d00002Scan);
  printPatternScan('4a. Raw byte-pattern scan for kbdKey', kbdKeyScan);
  printPatternScan('4b. Raw byte-pattern scan for kbdToken', kbdTokenScan);

  const short1 = scanShortMbaseRefs(0x0001);
  const short2 = scanShortMbaseRefs(0x0002);
  printShortScan(0x0001, short1);
  printShortScan(0x0002, short2);

  console.log('\n=== 5. Scan summaries ===');
  printKindSummary('D00001 raw-hit kinds', d00001Scan);
  printKindSummary('D00002 raw-hit kinds', d00002Scan);
  printKindSummary('kbdKey raw-hit kinds', kbdKeyScan);
  printKindSummary('kbdToken raw-hit kinds', kbdTokenScan);

  console.log('\n=== 6. Analysis ===');
  console.log('- 0x0236F9 is not a fixed writer to D00001 or D00002.');
  console.log('  Static builder behavior is local to caller-supplied HL:');
  console.log('  byte 0 = input A, byte 1 = cxCurApp (D007E0), byte 2 = 0 or kbdToken (D0058E) when cxCurApp == 0x4E.');
  console.log('  No direct D00001/D00002 literal or short-address access appears inside 0x0236F9.');
  console.log('- The one clear in-ROM producer for D00001 found by literal-address scan is 0x02FD68:');
  console.log('  it stores HL=0x00FFFF into D00001..D00003 immediately after writing 0xCC to D00000.');
  console.log('  0x03030E intercepts 0xFFFF/0xFFFE/0xFFFD as special sentinel cases before the swap path runs.');
  console.log('- That means D00001/D00002 are best read as a separate mailbox/scratch payload consumed by 0x030300,');
  console.log('  not as the fixed RAM location of the 0x0236F9 stack-built 3-byte event record.');
  console.log('- The swap at 0x03033B..0x030349 has a clean semantic meaning: reinterpret a two-byte payload');
  console.log('  [D00001, D00002] as [prefix, code] and convert it into the OS\'s canonical split form:');
  console.log('  if D00002 == 0: kbdKey = D00001, kbdToken = 0 (single-byte key/token).');
  console.log('  if D00002 != 0: kbdToken = D00001, kbdKey = D00002 (two-byte/prefixed token).');
  console.log('- Why this ordering is plausible: downstream code uses kbdKey as the primary dispatch byte');
  console.log('  (0x02FE73, 0x08C39C), while kbdToken is only consulted as an optional prefix/secondary byte.');
  console.log('  Notable consumers:');
  console.log('  0x08C463 reads kbdToken after CP 0xFA; 0x08C4A3 reads kbdToken after CP 0xFB;');
  console.log('  0x08C5DC adds kbdToken to B in the 0x59 family combiner.');
  console.log('- Under what conditions is D00002 nonzero?');
  console.log('  Static evidence from 0x030300 itself: whenever the mailbox carries a two-byte translated token,');
  console.log('  the second byte is nonzero and the swap path runs. When the translated value is only one byte,');
  console.log('  D00002 is zero and 0x03034F simply clears kbdToken.');
  console.log('  Static downstream consumers prove that at least 0xFA- and 0xFB-prefixed families exist.');
  console.log('  An exhaustive key/mode list is not recoverable from 0x030300 + 0x0236F9 alone, because no normal');
  console.log('  direct literal-address writer to D00001/D00002 was found in this slice; the regular producer is');
  console.log('  likely pointer-based or elsewhere in the lookup pipeline.');
}

main();
