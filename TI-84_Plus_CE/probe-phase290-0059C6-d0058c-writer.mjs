#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const rom = fs.readFileSync(ROM_PATH);

const START_PC = 0x0059C6;
const END_EXCLUSIVE = 0x005A95;
const KNOWN_RENDERER = 0x005A75;
const D0058C = 0xD0058C;
const D00596 = 0xD00596;

const WRITE_PATTERNS = [
  {
    name: 'LD (0xD0058C), A',
    bytes: [0x32, 0x8C, 0x05, 0xD0],
    tag: 'a-store',
  },
  {
    name: 'LD (0xD0058C), HL',
    bytes: [0xED, 0x63, 0x8C, 0x05, 0xD0],
    tag: 'hl-store',
  },
  {
    name: 'LD (0xD0058C), DE',
    bytes: [0xED, 0x53, 0x8C, 0x05, 0xD0],
    tag: 'de-store',
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), (value) => hexByte(value)).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function safeDecode(pc) {
  if (pc < 0 || pc >= rom.length) {
    return null;
  }
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length || inst.length <= 0) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) {
    return 'DB ?';
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'rotate-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indirectRegister).toUpperCase()})`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg).toUpperCase()}`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'daa':
      return `${prefix}DAA`;
    case 'neg':
      return `${prefix}NEG`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates']);
      const extra = Object.entries(inst)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      return `${prefix}${String(inst.tag).toUpperCase()}${extra ? ` ${extra}` : ''}`;
    }
  }
}

function isDirectAbsoluteWrite(inst, addr) {
  if (!inst) {
    return false;
  }
  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
    return inst.addr === addr;
  }
  if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') {
    return inst.addr === addr;
  }
  return false;
}

function annotationList(inst) {
  if (!inst) {
    return [];
  }

  const notes = [];

  if (isDirectAbsoluteWrite(inst, D0058C)) {
    notes.push('D0058C write');
  }
  if (isDirectAbsoluteWrite(inst, D00596)) {
    notes.push('D00596 write');
  }
  if (inst.tag === 'ld-reg-mem' && inst.addr === D00596) {
    notes.push('D00596 read');
  }
  if ((inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'jp' || inst.tag === 'jp-conditional')
      && inst.target === KNOWN_RENDERER) {
    notes.push('known renderer 0x005A75');
  }

  return notes;
}

function disassembleRange(start, endExclusive) {
  const rows = [];
  let pc = start;

  while (pc < endExclusive && pc < rom.length) {
    const inst = safeDecode(pc);
    if (!inst) {
      rows.push({
        pc,
        length: 1,
        bytes: formatBytes(pc, 1),
        asm: `DB ${hexByte(rom[pc])}`,
        inst: null,
        annotations: [],
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      asm: formatInstruction(inst),
      inst,
      annotations: annotationList(inst),
    });
    pc += inst.length;
  }

  return rows;
}

function findPattern(patternBytes) {
  const hits = [];
  for (let i = 0; i <= rom.length - patternBytes.length; i += 1) {
    let match = true;
    for (let j = 0; j < patternBytes.length; j += 1) {
      if (rom[i + j] !== patternBytes[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      hits.push(i);
    }
  }
  return hits;
}

function collectCallAndJumpTargets(rows) {
  const items = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) {
      continue;
    }
    if (!['call', 'call-conditional', 'jp', 'jp-conditional'].includes(inst.tag)) {
      continue;
    }
    items.push({
      pc: row.pc,
      kind: inst.tag.toUpperCase().replace('-', ' '),
      target: inst.target,
      knownRenderer: inst.target === KNOWN_RENDERER,
    });
  }

  return items;
}

function collectBranchStructure(rows) {
  const items = [];

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) {
      continue;
    }
    if (
      (inst.tag === 'alu-imm' && inst.op === 'cp')
      || (inst.tag === 'alu-reg' && inst.op === 'cp')
      || inst.tag === 'jr'
      || inst.tag === 'jr-conditional'
      || inst.tag === 'jp'
      || inst.tag === 'jp-conditional'
      || inst.tag === 'call-conditional'
      || inst.tag === 'ret-conditional'
      || inst.tag === 'djnz'
    ) {
      items.push({
        pc: row.pc,
        asm: row.asm,
      });
    }
  }

  return items;
}

function collectWriteScan() {
  return WRITE_PATTERNS.map((pattern) => {
    const hits = findPattern(pattern.bytes).map((pc) => {
      const inst = safeDecode(pc);
      return {
        pc,
        bytes: pattern.bytes.map((value) => hexByte(value)).join(' '),
        asm: inst ? formatInstruction(inst) : '(decode failed)',
      };
    });

    return {
      ...pattern,
      hits,
    };
  });
}

function printDisassembly(rows) {
  console.log('=== Static disassembly: 0x0059C6-0x005A94 ===');
  for (const row of rows) {
    const notes = row.annotations.length ? ` ; ${row.annotations.join(', ')}` : '';
    console.log(`${hex(row.pc)}: ${row.asm.padEnd(28)} [${row.bytes}]${notes}`);
  }
  console.log('');
}

function printRegionSummary(rows, callTargets, branchItems, scanResults) {
  const directD0058CWrites = rows.filter((row) => isDirectAbsoluteWrite(row.inst, D0058C));
  const directD00596Writes = rows.filter((row) => isDirectAbsoluteWrite(row.inst, D00596));

  console.log('=== Region summary ===');
  console.log(`Bytes decoded: ${END_EXCLUSIVE - START_PC} (${hex(START_PC)}-${hex(END_EXCLUSIVE - 1)})`);
  console.log(`Direct D0058C writes inside region: ${directD0058CWrites.length}`);
  if (!directD0058CWrites.length) {
    console.log('  none');
  }
  console.log(`Direct D00596 writes inside region: ${directD00596Writes.length}`);
  for (const row of directD00596Writes) {
    console.log(`  ${hex(row.pc)}: ${row.asm}`);
  }
  console.log('');

  console.log('CALL/JP targets seen in this region:');
  for (const item of callTargets) {
    const note = item.knownRenderer ? ' [known renderer]' : '';
    console.log(`  ${hex(item.pc)}: ${item.kind} -> ${hex(item.target)}${note}`);
  }
  console.log('');

  const uniqueNonRendererTargets = [...new Set(
    callTargets
      .filter((item) => item.target !== KNOWN_RENDERER)
      .map((item) => item.target),
  )];

  console.log('Non-renderer CALL/JP targets:');
  for (const target of uniqueNonRendererTargets) {
    console.log(`  ${hex(target)}`);
  }
  if (!uniqueNonRendererTargets.length) {
    console.log('  none');
  }
  console.log('');

  console.log('Branch structure (CP/JR/JP conditional flow markers):');
  for (const item of branchItems) {
    console.log(`  ${hex(item.pc)}: ${item.asm}`);
  }
  console.log('');

  const directWriterTargets = new Set(
    scanResults.flatMap((result) => result.hits.map((hit) => hit.pc)),
  );
  const reachableDirectWriters = uniqueNonRendererTargets.filter((target) => directWriterTargets.has(target));

  console.log('Dispatch targets that are themselves direct D0058C writers:');
  if (!reachableDirectWriters.length) {
    console.log('  none');
  } else {
    for (const target of reachableDirectWriters) {
      console.log(`  ${hex(target)}`);
    }
  }
  console.log('');
}

function printWriteScan(scanResults) {
  console.log('=== Full ROM byte scan for direct writes to 0xD0058C ===');
  for (const result of scanResults) {
    const patternText = result.bytes.map((value) => hexByte(value)).join(' ');
    console.log(`${result.name} [${patternText}] -> ${result.hits.length} hit(s)`);
    for (const hit of result.hits) {
      console.log(`  ${hex(hit.pc)}: ${hit.asm} [${hit.bytes}]`);
    }
    if (!result.hits.length) {
      console.log('  none');
    }
    console.log('');
  }
}

function main() {
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log('');

  const rows = disassembleRange(START_PC, END_EXCLUSIVE);
  const callTargets = collectCallAndJumpTargets(rows);
  const branchItems = collectBranchStructure(rows);
  const scanResults = collectWriteScan();

  printDisassembly(rows);
  printRegionSummary(rows, callTargets, branchItems, scanResults);
  printWriteScan(scanResults);
}

main();
