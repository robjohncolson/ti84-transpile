#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MODE = 'adl';

const TARGETS = [
  { name: 'D17792', addr: 0xD17792 },
  { name: 'D17793', addr: 0xD17793 },
  { name: 'D17794', addr: 0xD17794 },
];

const DISASM_START = 0x0155BC;
const DISASM_BYTE_BUDGET = 80;
const CONTEXT_RADIUS = 10;

const KNOWN_SITES = new Map([
  [0x00B8F7, '0x00B8BC event-0x47 recovery helper writes caller arg'],
  [0x011060, '0x011017 size-derived staged-arg calculator'],
  [0x0115B4, '0x011576 READY-promoter null-check'],
  [0x011633, '0x011576 compare against D176CB'],
  [0x011657, '0x011576 select D17792 for 0x0155BC'],
  [0x011A6D, '0x011A4D writes LEA BC,IY+0x57'],
  [0x011FA3, '0x011F20 D14073-gated 0x0155BC call'],
  [0x012021, 'same D14073-gated helper family'],
  [0x0122C1, '0x0121F3 D14073-gated 0x0155BC call'],
  [0x013773, '0x013700 D1407A consume path A'],
  [0x013877, '0x0137E9 D1407A consume path B'],
  [0x0156C2, '0x01567C entry-167 wrapper reads staged arg'],
  [0x049724, '0x049701 reset helper clears D17792'],
  [0x04E0B6, '0x04E07B link/peripheral mirror of 0x00B8BC'],
  [0x06A5E0, '0x06A5C0 link/peripheral mirror of 0x011A4D'],
]);

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM image: ${ROM_PATH}`);
}

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesHex(start, length) {
  return Array.from(rom.slice(start, start + length))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function contextHex(hit, radius = CONTEXT_RADIUS) {
  const start = Math.max(0, hit - radius);
  const end = Math.min(rom.length, hit + 3 + radius);
  const pieces = [];
  for (let index = start; index < end; index += 1) {
    const text = rom[index].toString(16).toUpperCase().padStart(2, '0');
    if (index >= hit && index < hit + 3) {
      pieces.push(`[${text}]`);
    } else {
      pieces.push(text);
    }
  }
  return pieces.join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('invalid decode');
    }
    return inst;
  } catch (error) {
    return {
      pc,
      nextPc: pc + 1,
      length: 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: String(error?.message ?? error),
    };
  }
}

function renderInstruction(inst) {
  switch (inst.tag) {
    case 'db': return `DB ${hexByte(inst.value)}`;
    case 'ret': return 'RET';
    case 'retn': return 'RETN';
    case 'reti': return 'RETI';
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()},${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()},${hex(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-pair-indexed':
      return `LD ${inst.pair.toUpperCase()},(${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-indexed-pair':
      return `LD ${inst.pair.toUpperCase()},(${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ixd-reg':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${inst.src.toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()},(${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ind-reg':
      return `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `LEA ${inst.dest.toUpperCase()},${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'lea':
      return `LEA ${inst.dest.toUpperCase()},${inst.base.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'add-pair':
      return `ADD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL,${inst.src.toUpperCase()}`;
    case 'rla':
      return 'RLA';
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') return 'XOR A';
      return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm':
      return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function classifyInstruction(inst) {
  switch (inst.tag) {
    case 'ld-pair-mem':
    case 'ld-reg-mem':
      return 'READ';
    case 'ld-mem-pair':
    case 'ld-mem-reg':
      return 'WRITE';
    default:
      return 'UNKNOWN';
  }
}

function scanRawHits(targetAddr) {
  const pattern = [targetAddr & 0xFF, (targetAddr >> 8) & 0xFF, (targetAddr >> 16) & 0xFF];
  const hits = [];
  for (let i = 0; i <= rom.length - 3; i += 1) {
    if (rom[i] === pattern[0] && rom[i + 1] === pattern[1] && rom[i + 2] === pattern[2]) {
      hits.push(i);
    }
  }
  return hits;
}

function resolveInstructionForHit(hit, targetAddr) {
  for (const delta of [0, -1, -2, -3, -4, -5]) {
    const pc = hit + delta;
    if (pc < 0) continue;
    const inst = safeDecode(pc);
    if (inst.addr === targetAddr) {
      return inst;
    }
  }
  return null;
}

function findRefs(target) {
  return scanRawHits(target.addr).map((hit) => {
    const inst = resolveInstructionForHit(hit, target.addr);
    const sitePc = inst?.pc ?? hit;
    return {
      hit,
      inst,
      sitePc,
      classification: inst ? classifyInstruction(inst) : 'UNKNOWN',
      rendered: inst ? renderInstruction(inst) : '(unresolved raw hit)',
      note: KNOWN_SITES.get(sitePc) ?? null,
      context: contextHex(hit),
    };
  });
}

function printRefs(target, refs) {
  console.log(`${target.name} (${hex(target.addr)})`);
  console.log('-'.repeat(target.name.length + 11));
  console.log(`Raw byte hits: ${refs.length}`);
  if (refs.length === 0) {
    console.log('No literal hits found.\n');
    return;
  }

  const counts = refs.reduce((acc, ref) => {
    acc[ref.classification] = (acc[ref.classification] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `Classification counts: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(', ')}`,
  );
  console.log('');

  for (const ref of refs) {
    console.log(`${hex(ref.sitePc)}  ${ref.classification.padEnd(7)}  ${ref.rendered}`);
    if (ref.note) {
      console.log(`  note:    ${ref.note}`);
    }
    console.log(`  hit:     ${hex(ref.hit)}`);
    console.log(`  bytes:   ${bytesHex(ref.sitePc, ref.inst?.length ?? 1)}`);
    console.log(`  context: ${ref.context}`);
  }
  console.log('');
}

function disassembleRange(start, byteBudget) {
  const rows = [];
  const endExclusive = start + byteBudget;
  let pc = start;
  while (pc < endExclusive) {
    const inst = safeDecode(pc);
    rows.push(inst);
    if (inst.nextPc <= pc) break;
    pc = inst.nextPc;
  }
  return rows;
}

function printDisassembly(start, rows) {
  console.log(`0x0155BC disassembly (first ~${DISASM_BYTE_BUDGET} bytes from ${hex(start)})`);
  console.log('-------------------------------------------------------');
  for (const inst of rows) {
    const note = KNOWN_SITES.get(inst.pc);
    console.log(`${hex(inst.pc)}  ${bytesHex(inst.pc, inst.length).padEnd(18)}  ${renderInstruction(inst)}${note ? `  ; ${note}` : ''}`);
  }
  console.log('');
}

function main() {
  console.log('=== Phase 443: Trace D17792 ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log('');

  for (const target of TARGETS) {
    printRefs(target, findRefs(target));
  }

  const rows = disassembleRange(DISASM_START, DISASM_BYTE_BUDGET);
  printDisassembly(DISASM_START, rows);

  console.log('Notes');
  console.log('-----');
  console.log('- D17793 and D17794 have no standalone literal references.');
  console.log('- The D17792 object is still 24-bit wide because every live load/store uses ADL-width BC/HL pair transfers starting at D17792.');
  console.log('- The wrapper at 0x01567C consumes D17792 directly; several worker paths consume it indirectly by loading BC from D17792 and calling 0x0155BC.');
}

main();
