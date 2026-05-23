#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const TARGET = 0xD176F8;
const CONTEXT_BEFORE = 8;
const CONTEXT_AFTER = 6;

const PATTERNS = {
  writeA: [0x32, 0xF8, 0x76, 0xD1],
  writeHL: [0x22, 0xF8, 0x76, 0xD1],
  writeBC: [0xED, 0x43, 0xF8, 0x76, 0xD1],
  writeDE: [0xED, 0x53, 0xF8, 0x76, 0xD1],
  writeIX: [0xDD, 0x22, 0xF8, 0x76, 0xD1],
  writeIY: [0xFD, 0x22, 0xF8, 0x76, 0xD1],
};

const VALUE_LABELS = new Map([
  [0x00, 'idle / cleared'],
  [0x01, 'success latch'],
  [0x02, 'handshake / checker stage'],
  [0x03, 'checker success'],
  [0x04, 'post-checker promotion'],
  [0x05, 'sequencer state 5'],
  [0x06, 'sequencer state 6'],
  [0x07, 'sequencer state 7'],
  [0x08, 'sequencer state 8'],
  [0x09, 'late sender pre-active'],
  [0x0A, 'active transfer'],
  [0x0C, 'header'],
  [0x0D, 'complete'],
  [0x0E, 'pre-header staging'],
  [0x0F, 'packet-builder staging'],
  [0x10, 'sentinel / modal state'],
]);

const HINT_GROUPS = [
  {
    family: 'boot / global reset',
    note: 'Unconditional clear during startup or reset flag zeroing.',
    sites: [0x009876, 0x00993F, 0x00F3E0, 0x049241, 0x049330],
  },
  {
    family: 'state-0x10 cleanup',
    note: 'Reader first proves D176F8 == 0x10, then clears it back to 0.',
    sites: [0x00B8AD, 0x00B8B2, 0x04DF61, 0x04DFAE, 0x04E02A],
  },
  {
    family: 'post-processing / restart clear',
    note: 'Cleanup clear after a prior staging or restart path.',
    sites: [0x01136B, 0x013CF7, 0x02D775, 0x04D56F],
  },
  {
    family: 'wrapper / receive exit clear',
    note: 'Exit path clears the protocol byte after helper calls or buffer work.',
    sites: [0x02BFAF, 0x02BFE1, 0x02CB86, 0x02F249, 0x06363F, 0x063952, 0x063F55, 0x06412C],
  },
  {
    family: 'mirrored success path',
    note: 'Writes 0x01 immediately after copying D1771A -> D1772A, then continues.',
    sites: [0x014522, 0x047E91],
  },
  {
    family: 'handshake / checker stage',
    note: 'Early handshake state before CALL 0x006EDA or a mirrored follow-on path.',
    sites: [0x014003, 0x0145AA],
  },
  {
    family: 'checker success continuation',
    note: 'Written only after CALL 0x006EDA succeeds.',
    sites: [0x0149F3],
  },
  {
    family: '0x03 -> 0x04 promotion',
    note: 'Reached only when arithmetic on the current state proves D176F8 == 0x03.',
    sites: [0x014A48],
  },
  {
    family: 'sequencer block',
    note: 'Seeds D176F5 = 0x00000B and enters the common transport continuation.',
    sites: [0x04865D],
  },
  {
    family: 'sequencer block',
    note: 'Later entry in the same continuation family as the 0x05 state.',
    sites: [0x048752],
  },
  {
    family: 'sequencer block',
    note: 'Zeros D17726..D17727, then branches through a state-7 specific test.',
    sites: [0x0481A3],
  },
  {
    family: 'sequencer block',
    note: 'Enters the same transport continuation family as states 0x05 and 0x06.',
    sites: [0x048935],
  },
  {
    family: 'late sender block',
    note: 'Writes 0x09 before pushing D17722 and entering the common continuation.',
    sites: [0x0654FB],
  },
  {
    family: '0x09 -> 0x0A promotion',
    note: 'Reader first proves the current state is 0x09, then upgrades it to active transfer.',
    sites: [0x0656BC],
  },
  {
    family: 'header path',
    note: 'Immediate header-state stub before CALL 0x06A367.',
    sites: [0x02E7A9],
  },
  {
    family: 'USB receive worker B',
    note: 'Worker B writes 0x0D after accepting 0x0A/0x0C/0x0D and copying payload data.',
    sites: [0x0135A4],
  },
  {
    family: 'pre-header staging',
    note: 'Writes 0x0E, clears D176F5, then pushes 0x13 and 0x99 into CALL 0x049CCA.',
    sites: [0x02DF2D],
  },
  {
    family: 'packet-builder entry',
    note: 'Mirrored packet-builder entry path that sets the staging state to 0x0F.',
    sites: [0x00B5EB, 0x00B626, 0x02D7E6, 0x043E0A, 0x043E45],
  },
  {
    family: 'sentinel setter stub',
    note: 'Tiny wrapper stub that sets D176F8 to 0x10 and relies on dedicated readers to clear it.',
    sites: [0x04DEDD, 0x04DF00],
  },
];

function hex(value, width = 6) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).padStart(2, '0');
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + length)).map(hexByte).join(' ');
}

function findPattern(pattern) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc += 1) {
    let matched = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (rom[pc + i] !== pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(pc);
  }
  return hits;
}

function tryDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.nextPc <= pc) return null;
    return inst;
  } catch {
    return null;
  }
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${displacement >= 0 ? '+' : ''}${displacement})`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'nop':
      return `${prefix}nop`;
    case 'ret':
      return `${prefix}ret`;
    case 'ret-conditional':
      return `${prefix}ret ${inst.condition}`;
    case 'call':
      return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'push':
      return `${prefix}push ${inst.pair}`;
    case 'pop':
      return `${prefix}pop ${inst.pair}`;
    case 'inc-pair':
      return `${prefix}inc ${inst.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${inst.pair}`;
    case 'inc-reg':
      return `${prefix}inc ${inst.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${inst.reg}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${inst.dest}, 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-pair-imm':
      return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-mem-reg':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.reg}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${inst.reg}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-pair-mem':
      return `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-reg':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm':
      return `${prefix}ld (hl), 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm':
      return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-pair-indexed':
      return `${prefix}ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-ixiy-indexed':
      return `${prefix}ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-sp-pair':
      return `${prefix}ld sp, ${inst.pair}`;
    case 'add-pair':
      return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'sbc-pair':
      return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-imm':
      return `${prefix}${inst.op} 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'alu-reg':
      return `${prefix}${inst.op} ${inst.src}`;
    case 'lea':
      return `${prefix}lea ${inst.dest}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'pea':
      return `${prefix}pea ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'ld-special':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'bit-test':
      return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-res':
      return `${prefix}res ${inst.bit}, ${inst.reg}`;
    case 'bit-set':
      return `${prefix}set ${inst.bit}, ${inst.reg}`;
    case 'indexed-cb-bit':
      return `${prefix}bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'di':
      return `${prefix}di`;
    case 'ei':
      return `${prefix}ei`;
    case 'halt':
      return `${prefix}halt`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function findPredecessorSequences(hit, maxBack = 96) {
  const sequences = [];
  const searchStart = Math.max(0, hit - maxBack);
  for (let start = searchStart; start <= hit; start += 1) {
    let pc = start;
    const rows = [];
    let valid = true;
    while (pc < hit) {
      const inst = tryDecode(pc);
      if (!inst || inst.nextPc > hit) {
        valid = false;
        break;
      }
      rows.push({ pc, inst });
      pc = inst.nextPc;
    }
    if (valid && pc === hit) {
      sequences.push(rows);
    }
  }
  return sequences;
}

function selectBestSequence(hit, maxBack = 96) {
  const sequences = findPredecessorSequences(hit, maxBack);
  if (sequences.length === 0) return [];
  return sequences.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const aStart = a.length > 0 ? a[0].pc : hit;
    const bStart = b.length > 0 ? b[0].pc : hit;
    return aStart - bStart;
  })[0];
}

function collectContextRows(hit, beforeCount = CONTEXT_BEFORE, afterCount = CONTEXT_AFTER) {
  const prefix = selectBestSequence(hit, 120);
  const rows = prefix.slice(-beforeCount);
  let pc = hit;
  let remaining = afterCount + 1;

  while (remaining > 0 && pc < rom.length) {
    const inst = tryDecode(pc);
    if (!inst) {
      rows.push({
        pc,
        inst: {
          tag: 'db',
          length: 1,
          nextPc: pc + 1,
          value: rom[pc],
        },
        decodeError: true,
      });
      pc += 1;
      remaining -= 1;
      continue;
    }
    rows.push({ pc, inst });
    pc = inst.nextPc;
    remaining -= 1;
  }

  return rows;
}

function isStrongBoundary(inst) {
  return inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jr' || inst.tag === 'rst';
}

function inferRoutineBlock(hit) {
  const sequence = selectBestSequence(hit, 0x180);
  if (sequence.length === 0) {
    return { start: hit, end: hit + 4 };
  }

  let boundaryStart = sequence[0].pc;
  for (const row of sequence) {
    if (row.pc >= hit) break;
    if (isStrongBoundary(row.inst)) {
      boundaryStart = row.inst.nextPc;
    }
  }

  let prologueStart = null;
  for (let i = 0; i < sequence.length - 1; i += 1) {
    const a = sequence[i].inst;
    const b = sequence[i + 1].inst;
    if (
      a.tag === 'ld-pair-imm' &&
      a.pair === 'hl' &&
      b.tag === 'call' &&
      (b.target === 0x002197 || b.target === 0x00218A)
    ) {
      prologueStart = sequence[i].pc;
    }
  }

  const start = prologueStart ?? boundaryStart;
  let end = hit + 4;
  let pc = start;
  let seenHit = false;
  let steps = 0;

  while (pc < rom.length && pc < start + 0x180 && steps < 256) {
    const inst = tryDecode(pc);
    if (!inst) {
      pc += 1;
      steps += 1;
      continue;
    }
    if (pc === hit) seenHit = true;
    end = inst.nextPc;
    if (seenHit && isStrongBoundary(inst)) break;
    pc = inst.nextPc;
    steps += 1;
  }

  return { start, end };
}

function inferWrittenValue(hit, register) {
  if (register !== 'a') {
    return {
      kind: 'non-a-store',
      value: null,
      sourcePc: null,
      sourceText: `store uses ${register.toUpperCase()}`,
    };
  }

  const rows = selectBestSequence(hit, 48).slice(-10);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const inst = row.inst;

    if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') {
      return {
        kind: 'immediate',
        value: inst.value,
        sourcePc: row.pc,
        sourceText: formatInstruction(inst),
      };
    }

    if (inst.tag === 'alu-reg' && inst.op === 'xor' && inst.src === 'a') {
      return {
        kind: 'zero',
        value: 0,
        sourcePc: row.pc,
        sourceText: 'xor a',
      };
    }

    if (inst.tag === 'alu-reg' && inst.op === 'sub' && inst.src === 'a') {
      return {
        kind: 'zero',
        value: 0,
        sourcePc: row.pc,
        sourceText: 'sub a',
      };
    }

    if (inst.tag === 'ld-reg-mem' && inst.reg === 'a') {
      return {
        kind: 'memory-copy',
        value: null,
        sourcePc: row.pc,
        addr: inst.addr,
        sourceText: formatInstruction(inst),
      };
    }

    if (inst.tag === 'ld-reg-reg' && inst.dest === 'a') {
      return {
        kind: 'register-copy',
        value: null,
        sourcePc: row.pc,
        sourceReg: inst.src,
        sourceText: formatInstruction(inst),
      };
    }

    if (
      (inst.tag === 'inc-reg' || inst.tag === 'dec-reg') &&
      inst.reg === 'a'
    ) {
      return {
        kind: 'computed',
        value: null,
        sourcePc: row.pc,
        sourceText: formatInstruction(inst),
      };
    }

    if (
      (inst.tag === 'alu-imm' || inst.tag === 'alu-reg') &&
      inst.op !== 'cp' &&
      !(inst.op === 'or' && inst.src === 'a')
    ) {
      return {
        kind: 'computed',
        value: null,
        sourcePc: row.pc,
        sourceText: formatInstruction(inst),
      };
    }

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      return {
        kind: 'call-result',
        value: null,
        sourcePc: row.pc,
        sourceText: formatInstruction(inst),
      };
    }
  }

  for (let j = hit - 1; j >= Math.max(0, hit - 12); j -= 1) {
    if (rom[j] === 0xAF) {
      return { kind: 'zero', value: 0, sourcePc: j, sourceText: 'xor a (raw)' };
    }
    if (rom[j] === 0x97) {
      return { kind: 'zero', value: 0, sourcePc: j, sourceText: 'sub a (raw)' };
    }
    if (rom[j] === 0x3E) {
      return {
        kind: 'immediate',
        value: rom[j + 1],
        sourcePc: j,
        sourceText: `ld a, 0x${rom[j + 1].toString(16).padStart(2, '0')} (raw)`,
      };
    }
    if (
      rom[j] === 0xC9 ||
      rom[j] === 0xC3 ||
      rom[j] === 0x18 ||
      rom[j] === 0xE9
    ) {
      break;
    }
  }

  return {
    kind: 'unresolved',
    value: null,
    sourcePc: null,
    sourceText: 'not inferred',
  };
}

function formatValue(info) {
  if (typeof info.value === 'number') {
    const label = VALUE_LABELS.get(info.value);
    return label ? `0x${info.value.toString(16).padStart(2, '0')} (${label})` : `0x${info.value.toString(16).padStart(2, '0')}`;
  }
  if (info.kind === 'memory-copy') return `copy from mem[${hex(info.addr)}]`;
  if (info.kind === 'register-copy') return `copy from ${info.sourceReg}`;
  if (info.kind === 'call-result') return 'result from prior call';
  if (info.kind === 'computed') return 'computed in A';
  if (info.kind === 'non-a-store') return info.sourceText;
  return 'unresolved';
}

function formatSource(info) {
  if (info.sourcePc === null) return info.sourceText;
  return `${hex(info.sourcePc)} ${info.sourceText}`;
}

function findHint(pc) {
  return HINT_GROUPS.find((group) => group.sites.includes(pc)) ?? null;
}

function groupWriterValues(writerDetails) {
  const groups = new Map();
  for (const detail of writerDetails) {
    const key = typeof detail.value.value === 'number' ? detail.value.value : 'unresolved';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(detail);
  }
  return [...groups.entries()].sort((a, b) => {
    if (a[0] === 'unresolved') return 1;
    if (b[0] === 'unresolved') return -1;
    return a[0] - b[0];
  });
}

const writerHits = [
  ...findPattern(PATTERNS.writeA).map((pc) => ({ pc, register: 'a', opcode: 'ld (0xd176f8), a', length: 4 })),
  ...findPattern(PATTERNS.writeHL).map((pc) => ({ pc, register: 'hl', opcode: 'ld (0xd176f8), hl', length: 4 })),
  ...findPattern(PATTERNS.writeBC).map((pc) => ({ pc, register: 'bc', opcode: 'ld (0xd176f8), bc', length: 5 })),
  ...findPattern(PATTERNS.writeDE).map((pc) => ({ pc, register: 'de', opcode: 'ld (0xd176f8), de', length: 5 })),
  ...findPattern(PATTERNS.writeIX).map((pc) => ({ pc, register: 'ix', opcode: 'ld (0xd176f8), ix', length: 5 })),
  ...findPattern(PATTERNS.writeIY).map((pc) => ({ pc, register: 'iy', opcode: 'ld (0xd176f8), iy', length: 5 })),
].sort((a, b) => a.pc - b.pc);

const writerDetails = writerHits.map((writer) => {
  const value = inferWrittenValue(writer.pc, writer.register);
  const hint = findHint(writer.pc);
  const block = inferRoutineBlock(writer.pc);
  return {
    ...writer,
    value,
    hint,
    block,
    context: collectContextRows(writer.pc),
  };
});

console.log('======================================================================');
console.log('Phase 414: D176F8 write value semantics');
console.log('======================================================================');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Target byte: ${hex(TARGET)} (protocol type state byte)`);
console.log('');

console.log('Direct write forms');
console.log(`  ld (0xd176f8), a  : ${findPattern(PATTERNS.writeA).length}`);
console.log(`  ld (0xd176f8), hl : ${findPattern(PATTERNS.writeHL).length}`);
console.log(`  ld (0xd176f8), bc : ${findPattern(PATTERNS.writeBC).length}`);
console.log(`  ld (0xd176f8), de : ${findPattern(PATTERNS.writeDE).length}`);
console.log(`  ld (0xd176f8), ix : ${findPattern(PATTERNS.writeIX).length}`);
console.log(`  ld (0xd176f8), iy : ${findPattern(PATTERNS.writeIY).length}`);
console.log('');

console.log('Value categories');
for (const [value, group] of groupWriterValues(writerDetails)) {
  if (value === 'unresolved') {
    console.log(`  unresolved (${group.length}) -> ${group.map((item) => hex(item.pc)).join(', ')}`);
    continue;
  }
  const label = VALUE_LABELS.get(value) ? ` (${VALUE_LABELS.get(value)})` : '';
  console.log(`  0x${value.toString(16).padStart(2, '0')}${label}: ${group.length} site(s) -> ${group.map((item) => hex(item.pc)).join(', ')}`);
}
console.log('');

console.log('Known dispatch cross-reference');
console.log('  0x0a -> active transfer input to worker B');
console.log('  0x0c -> header input to worker B');
console.log('  0x0d -> completion output written by worker B');
console.log('');

console.log('| Address | Value | Source | Block | Context |');
console.log('| --- | --- | --- | --- | --- |');
for (const detail of writerDetails) {
  const blockLabel = `${hex(detail.block.start)}..${hex(detail.block.end - 1)}`;
  const contextLabel = detail.hint ? `${detail.hint.family}: ${detail.hint.note}` : 'no curated context';
  console.log(`| ${hex(detail.pc)} | ${formatValue(detail.value)} | ${formatSource(detail.value)} | ${blockLabel} | ${contextLabel} |`);
}

console.log('');
console.log('Detailed per-writer windows');
for (const detail of writerDetails) {
  const blockLabel = `${hex(detail.block.start)}..${hex(detail.block.end - 1)}`;
  console.log('');
  console.log(`## ${hex(detail.pc)}`);
  console.log(`write   : ${detail.opcode}`);
  console.log(`value   : ${formatValue(detail.value)}`);
  console.log(`source  : ${formatSource(detail.value)}`);
  console.log(`block   : ${blockLabel}`);
  if (detail.hint) {
    console.log(`context : ${detail.hint.family}`);
    console.log(`note    : ${detail.hint.note}`);
  }
  for (const row of detail.context) {
    if (row.decodeError) {
      console.log(`  ${hex(row.pc)} ${hexByte(rom[row.pc]).padEnd(15)} db 0x${hexByte(rom[row.pc])}`);
      continue;
    }
    console.log(`  ${hex(row.pc)} ${rawBytes(row.pc, row.inst.length).padEnd(15)} ${formatInstruction(row.inst)}`);
  }
}
