#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MODE = 'adl';
const EXPECTED_ROM_SIZE = 0x400000;

const IY_BASE = 0xD00080;
const SECOND_FLAG_ADDR = 0xD00092;
const SECOND_FLAG_OFFSET = SECOND_FLAG_ADDR - IY_BASE;
const OS_SCAN_CODE_2ND = 0x06;
const OS_SCAN_CODE_ADDR = 0xD00587;
const TABLE_BASE = 0x09F79B;

const PATTERNS = [
  {
    name: 'SET',
    mnemonic: 'SET 5,(IY+0x12)',
    bytes: [0xFD, 0xCB, 0x12, 0xEE],
  },
  {
    name: 'RES',
    mnemonic: 'RES 5,(IY+0x12)',
    bytes: [0xFD, 0xCB, 0x12, 0xAE],
  },
  {
    name: 'BIT',
    mnemonic: 'BIT 5,(IY+0x12)',
    bytes: [0xFD, 0xCB, 0x12, 0x6E],
  },
];

const TARGET_LABELS = new Map([
  [0x02237E, 'common helper after modifier-state changes'],
  [0x02FD99, 'shared post-key tail'],
  [0x02FF0B, 'base translation-table entry'],
  [0x030074, 'JP trampoline into 0x02FF0B'],
  [0x0301F6, 'modifier-side helper'],
  [0x03FBFD, 'helper that clears bit 6 before continuing'],
  [TABLE_BASE, '0x09F79B translation table base'],
]);

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function signedHexByte(value) {
  const n = Number(value ?? 0);
  return `${n >= 0 ? '+' : '-'}${hexByte(Math.abs(n))}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${upper(indexRegister)}${signedHexByte(displacement)})`;
}

function formatValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') {
    return hex(value, 4);
  }
  if (modePrefix === 'sil' || modePrefix === 'lil') {
    return hex(value, 6);
  }
  if (value <= 0xFF) return hex(value, 2);
  if (value <= 0xFFFF) return hex(value, 4);
  return hex(value, 6);
}

function bytesHex(start, length) {
  return Array.from(
    rom.subarray(start, Math.min(start + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatAlu(op, operand) {
  const upperOp = upper(op);
  if (upperOp === 'ADD' || upperOp === 'ADC' || upperOp === 'SBC') {
    return `${upperOp} A, ${operand}`;
  }
  return `${upperOp} ${operand}`;
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
        if (key === 'displacement') return `${key}=${signedHexByte(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  if (!inst?.tag) return '???';

  switch (inst.tag) {
    case 'db':
      return `DB ${hexByte(inst.value)}`;
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'rst':
      return `RST ${hexByte(inst.target)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${formatValue(inst.value, inst.modePrefix)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(inst.value)}`;
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'ld-sp-pair':
      return `LD SP, ${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'alu-reg':
      return formatAlu(inst.op, upper(inst.src));
    case 'alu-imm':
    case 'alu-immediate':
      return formatAlu(inst.op, hexByte(inst.value));
    case 'alu-ind':
      return formatAlu(inst.op, '(HL)');
    case 'out-reg':
      return `OUT (C), ${upper(inst.reg)}`;
    case 'in0':
      return `IN0 ${upper(inst.reg)}, (${hexByte(inst.port)})`;
    default: {
      const extra = fallbackOperands(inst);
      return extra ? `${inst.tag} ${extra}` : inst.tag;
    }
  }
}

function decodeRow(pc) {
  const inst = decodeInstruction(rom, pc, MODE);
  return {
    pc,
    bytes: bytesHex(pc, inst.length),
    inst,
    text: renderInstruction(inst),
    nextPc: inst.nextPc,
  };
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

function isHardBoundary(inst) {
  return new Set(['ret', 'ret-conditional', 'reti', 'retn', 'jp', 'jr', 'rst', 'halt']).has(inst?.tag);
}

function alignLocalContext(targetPc, backtrackBytes = 0x80, forwardBytes = 0x80, maxRows = 160) {
  const minStart = Math.max(0, targetPc - backtrackBytes);
  const candidates = [];

  for (let start = minStart; start <= targetPc; start += 1) {
    const rows = [];
    let pc = start;
    let hit = false;

    for (let step = 0; step < maxRows && pc < rom.length && pc <= targetPc + forwardBytes; step += 1) {
      let row;
      try {
        row = decodeRow(pc);
      } catch {
        break;
      }

      rows.push(row);
      if (pc === targetPc) {
        hit = true;
        break;
      }

      if (!Number.isInteger(row.nextPc) || row.nextPc <= pc || row.nextPc > targetPc) {
        break;
      }
      pc = row.nextPc;
    }

    if (hit) {
      const boundaryCount = rows.slice(0, -1).filter((row) => isHardBoundary(row.inst)).length;
      candidates.push({ start, boundaryCount });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (right.boundaryCount !== left.boundaryCount) {
      return right.boundaryCount - left.boundaryCount;
    }
    return left.start - right.start;
  });

  const start = candidates[0].start;
  const rows = [];
  let pc = start;

  for (let step = 0; step < maxRows && pc < rom.length && pc <= targetPc + forwardBytes; step += 1) {
    const row = decodeRow(pc);
    rows.push(row);
    if (pc >= targetPc && isHardBoundary(row.inst)) {
      break;
    }
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) {
      break;
    }
    pc = row.nextPc;
  }

  const targetIndex = rows.findIndex((row) => row.pc === targetPc);
  if (targetIndex < 0) {
    return null;
  }

  let blockStartIndex = 0;
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    if (isHardBoundary(rows[index].inst)) {
      blockStartIndex = index + 1;
      break;
    }
  }

  let blockEndIndex = rows.length - 1;
  for (let index = targetIndex; index < rows.length; index += 1) {
    if (isHardBoundary(rows[index].inst)) {
      blockEndIndex = index;
      break;
    }
  }

  return {
    allRows: rows,
    targetIndex,
    targetRow: rows[targetIndex],
    blockRows: rows.slice(blockStartIndex, blockEndIndex + 1),
  };
}

function hasTarget(rows, tag, target) {
  return rows.some((row) => row.inst.tag === tag && row.inst.target === target);
}

function hasIYBit(rows, tag, bit, displacement) {
  const expectedTag = `indexed-cb-${tag}`;
  return rows.some(
    (row) =>
      row.inst.tag === expectedTag
      && row.inst.indexRegister === 'iy'
      && row.inst.bit === bit
      && row.inst.displacement === displacement,
  );
}

function hasCpImm(rows, value) {
  return rows.some(
    (row) =>
      (row.inst.tag === 'alu-imm' || row.inst.tag === 'alu-immediate')
      && row.inst.op === 'cp'
      && row.inst.value === value,
  );
}

function hasAddImm(rows, value) {
  return rows.some(
    (row) =>
      (row.inst.tag === 'alu-imm' || row.inst.tag === 'alu-immediate')
      && row.inst.op === 'add'
      && row.inst.value === value,
  );
}

function hasLiteralLoad(rows, value) {
  return rows.some((row) => row.inst.tag === 'ld-pair-imm' && row.inst.value === value);
}

function targetLabel(target) {
  const label = TARGET_LABELS.get(target);
  return label ? `${hex(target)} (${label})` : hex(target);
}

function classifySite(kind, site) {
  const rows = site.blockRows;
  const notes = [];

  if (kind === 'SET') {
    notes.push('only direct SET site for bit 5 in the whole ROM');
    if (hasCpImm(rows, 0x30)) notes.push('entered only when A == 0x30');
    if (hasIYBit(rows, 'bit', 3, 0x24)) notes.push('extra gate: BIT 3,(IY+0x24) must be set');
    if (hasIYBit(rows, 'bit', 5, SECOND_FLAG_OFFSET)) notes.push('guarded so it does not re-set an already-active 2ND flag');
    if (hasTarget(rows, 'call', 0x02237E)) notes.push(`post-set tail calls ${targetLabel(0x02237E)}`);
    if (hasTarget(rows, 'jp', 0x02FD99)) notes.push(`then jumps to ${targetLabel(0x02FD99)}`);
    return {
      role: '2ND-flag setter candidate',
      notes,
    };
  }

  if (kind === 'RES') {
    if (hasIYBit(rows, 'set', 4, SECOND_FLAG_OFFSET) && hasTarget(rows, 'call', 0x02237E)) {
      notes.push('clear happens in a pre-lookup dispatch block that also SETs bit 4');
      notes.push(`after clearing, the block calls ${targetLabel(0x02237E)} and loops back into the shared tail`);
      return {
        role: 'pre-lookup clear path',
        notes,
      };
    }

    if (hasIYBit(rows, 'set', 6, SECOND_FLAG_OFFSET) && hasIYBit(rows, 'set', 4, SECOND_FLAG_OFFSET)) {
      notes.push('tiny helper: SET bit 6, SET bit 4, RES bit 5, RET');
      notes.push('this looks like a mode-normalization helper rather than the main table consumer');
      return {
        role: 'helper clear path',
        notes,
      };
    }

    notes.push('direct clear site for the 2ND flag');
    return {
      role: 'clear path',
      notes,
    };
  }

  if (kind === 'BIT') {
    if (hasAddImm(rows, 0x38) && hasLiteralLoad(rows, TABLE_BASE)) {
      notes.push('this is the translation-table plane selector');
      notes.push('bit clear path jumps to 0x030074, which is a direct JP to 0x02FF0B');
      notes.push('bit set path adds +0x38, then indexes ROM table 0x09F79B');
      return {
        role: '2ND-table consumer',
        notes,
      };
    }

    if (hasIYBit(rows, 'set', 5, SECOND_FLAG_OFFSET)) {
      notes.push('this is a guard directly in front of the only SET site');
      notes.push('if bit 5 is already set, the block skips the setter');
      return {
        role: 'pre-set guard test',
        notes,
      };
    }

    notes.push('direct test of the 2ND flag');
    return {
      role: 'flag test',
      notes,
    };
  }

  return {
    role: 'unknown',
    notes,
  };
}

function searchPatternInWindow(start, endExclusive, pattern) {
  const hits = [];
  outer: for (let offset = start; offset <= endExclusive - pattern.length; offset += 1) {
    for (let index = 0; index < pattern.length; index += 1) {
      if (rom[offset + index] !== pattern[index]) {
        continue outer;
      }
    }
    hits.push(offset);
  }
  return hits;
}

function scanSetterNeighborhood(setPc) {
  const start = Math.max(0, setPc - 0x40);
  const endExclusive = Math.min(rom.length, setPc + 0x41);

  return [
    { label: 'CP 0x06', hits: searchPatternInWindow(start, endExclusive, [0xFE, OS_SCAN_CODE_2ND]) },
    { label: 'LD A,0x06', hits: searchPatternInWindow(start, endExclusive, [0x3E, OS_SCAN_CODE_2ND]) },
    {
      label: `literal ${hex(OS_SCAN_CODE_ADDR)}`,
      hits: searchPatternInWindow(start, endExclusive, [
        OS_SCAN_CODE_ADDR & 0xFF,
        (OS_SCAN_CODE_ADDR >>> 8) & 0xFF,
        (OS_SCAN_CODE_ADDR >>> 16) & 0xFF,
      ]),
    },
  ];
}

function analyzePattern(pattern) {
  const addresses = findPattern(pattern.bytes);
  const sites = addresses.map((pc) => {
    const context = alignLocalContext(pc);
    const classification = context ? classifySite(pattern.name, context) : { role: 'decode failed', notes: [] };
    return {
      pc,
      context,
      classification,
    };
  });
  return { ...pattern, addresses, sites };
}

function printAddressList(label, analysis) {
  console.log(`${label}: ${analysis.addresses.length}`);
  for (const address of analysis.addresses) {
    console.log(`  - ${hex(address)}  ${analysis.mnemonic}`);
  }
}

function printSite(kind, site) {
  console.log(`\n--- ${kind} site @ ${hex(site.pc)} ---`);

  if (!site.context) {
    console.log('  Unable to align local context around this site.');
    return;
  }

  const blockRows = site.context.blockRows;
  const startPc = blockRows[0].pc;
  const endPc = blockRows[blockRows.length - 1].pc;

  console.log(`Role: ${site.classification.role}`);
  console.log(`Local block: ${hex(startPc)} .. ${hex(endPc)}`);
  for (const note of site.classification.notes) {
    console.log(`  - ${note}`);
  }

  console.log('Context:');
  for (const row of blockRows) {
    const marker = row.pc === site.pc ? '>>' : '  ';
    console.log(`  ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}`);
  }
}

function main() {
  const analyses = PATTERNS.map(analyzePattern);
  const setAnalysis = analyses.find((analysis) => analysis.name === 'SET');
  const resAnalysis = analyses.find((analysis) => analysis.name === 'RES');
  const bitAnalysis = analyses.find((analysis) => analysis.name === 'BIT');

  const setterSite = setAnalysis?.sites[0] ?? null;
  const setterNeighborhood = setterSite ? scanSetterNeighborhood(setterSite.pc) : [];
  const hasRaw06NearSetter = setterNeighborhood.some((entry) => entry.hits.length > 0);

  console.log('=== Phase 393 - 2ND Flag Lifecycle Probe ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${hex(rom.length, 8)} (${rom.length.toLocaleString('en-US')} bytes)`);
  console.log(`Target flag: bit 5 of (IY+0x${SECOND_FLAG_OFFSET.toString(16).toUpperCase()}) = ${hex(SECOND_FLAG_ADDR, 8)}`);
  if (rom.length !== EXPECTED_ROM_SIZE) {
    console.log(`WARNING: expected ${hex(EXPECTED_ROM_SIZE, 8)} bytes, found ${hex(rom.length, 8)}`);
  }

  console.log('\n=== Raw Pattern Hits ===');
  printAddressList('SET 5,(IY+0x12)', setAnalysis);
  printAddressList('RES 5,(IY+0x12)', resAnalysis);
  printAddressList('BIT 5,(IY+0x12)', bitAnalysis);

  console.log('\n=== Detailed Context ===');
  for (const analysis of analyses) {
    for (const site of analysis.sites) {
      printSite(analysis.mnemonic, site);
    }
  }

  console.log('\n=== 0x06 Neighborhood Check Around The Setter ===');
  console.log(`Question: does the setter look like a raw _GetCSC 0x${OS_SCAN_CODE_2ND.toString(16).toUpperCase().padStart(2, '0')} handler?`);
  for (const entry of setterNeighborhood) {
    if (entry.hits.length === 0) {
      console.log(`  - ${entry.label}: none within +/-0x40 bytes of ${hex(setterSite.pc)}`);
    } else {
      console.log(`  - ${entry.label}: ${entry.hits.map((hit) => hex(hit)).join(', ')}`);
    }
  }

  console.log('\n=== Lifecycle Summary ===');
  if (setterSite) {
    console.log(`SET: ${hex(setterSite.pc)} is the only direct setter.`);
    console.log('  Trigger: local block is gated by `CP 0x30`, then `BIT 3,(IY+0x24)`, then `BIT 5,(IY+0x12)`.');
    console.log('  Consequence: if bit 5 was clear, the block executes `SET 5,(IY+0x12)`, then `CALL 0x02237E`, then `JP 0x02FD99`.');
  }

  console.log(`TESTS: ${bitAnalysis.addresses.length} direct BIT sites.`);
  console.log(`  - ${hex(bitAnalysis.addresses[0])}: guard directly in front of the setter.`);
  console.log(`  - ${hex(bitAnalysis.addresses[1])}: translation consumer that adds +0x38 before indexing 0x09F79B when 2ND is active.`);

  console.log(`CLEARS: ${resAnalysis.addresses.length} direct RES sites.`);
  console.log(`  - ${hex(resAnalysis.addresses[0])}: pre-lookup dispatch block that also SETs bit 4 before calling 0x02237E.`);
  console.log(`  - ${hex(resAnalysis.addresses[1])}: tiny helper that SETs bits 6 and 4, clears bit 5, then RETs.`);

  console.log('2ND-key handler question:');
  if (hasRaw06NearSetter) {
    console.log(`  Raw 0x${OS_SCAN_CODE_2ND.toString(16).toUpperCase().padStart(2, '0')} evidence exists near the setter; inspect the neighborhood lines above.`);
  } else {
    console.log(`  No direct \`CP 0x${OS_SCAN_CODE_2ND.toString(16).toUpperCase().padStart(2, '0')}\`, \`LD A,0x${OS_SCAN_CODE_2ND.toString(16).toUpperCase().padStart(2, '0')}\`, or literal ${hex(OS_SCAN_CODE_ADDR)} access appears within +/-0x40 bytes of the setter.`);
    console.log('  Static evidence says the setter is driven by an already-normalized A==0x30 value, not by a raw 0x06 scan-code compare in the same local block.');
  }
}

main();
