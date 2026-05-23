#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ENTRY = 0x015185;
const MAX_BYTES = 200;
const MAX_INSTRUCTIONS = 80;

const CODE_LABELS = new Map([
  [0x0004E0, 'jump-table JP stub for 0x015185'],
  [0x002288, '_indcall trampoline (JP (IY))'],
  [0x0121EF, 'menu/app hook target used by 0x01567C'],
  [0x015185, 'notification completion callback'],
  [0x0151FE, 'pre-delivery staging helper'],
  [0x01567C, 'notification wrapper sibling B'],
]);

const RAM_LABELS = new Map([
  [0xD14038, 'global notification/link context source'],
  [0xD14073, 'notification enabled flag'],
  [0xD14077, 'notification armed latch'],
  [0xD14084, 'notification busy flag'],
  [0xD143EA, 'descriptor callback slot 1 / hook'],
  [0xD1440E, 'notification lock'],
  [0xD1440F, 'notification delivery status'],
  [0xD176C9, 'Channel 3 flag'],
  [0xD176CA, 'Channel 3 status'],
  [0xD176F8, 'protocol type state'],
  [0xD17770, 'staged callback pointer'],
  [0xD17773, 'staged callback argument'],
  [0xD17776, 'staged context mirror'],
  [0xD17779, 'notification active/armed flag (Channel 2)'],
  [0xD1777A, 'notification completion byte (Channel 2)'],
  [0xD17795, 'protocol state byte (8 states 0-7)'],
  [0xD177B7, 'sentinel (0x55 = installed)'],
]);

function hex(value, width = 6) {
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function raw(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    byte => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement < 0 ? '-' : '+';
  return `(${String(indexRegister).toUpperCase()}${sign}${hex(Math.abs(displacement), 2)})`;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
    };
  }
}

function formatInstruction(inst) {
  const u = value => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${u(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${u(inst.condition)},${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${u(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${u(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'push':
      return `PUSH ${u(inst.pair)}`;
    case 'pop':
      return `POP ${u(inst.pair)}`;
    case 'push-idx':
      return `PUSH ${u(inst.indexRegister)}`;
    case 'pop-idx':
      return `POP ${u(inst.indexRegister)}`;
    case 'ld-pair-imm':
      return `LD ${u(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${u(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${u(inst.pair)}`;
    case 'ld-reg-imm':
      return `LD ${u(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${u(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${u(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${u(inst.dest)},${u(inst.src)}`;
    case 'ld-pair-indexed':
      return `LD ${u(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixiy-indexed':
      return `LD ${u(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-ixd':
      return `LD ${u(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${u(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ld-sp-pair':
      return `LD SP,${u(inst.pair)}`;
    case 'inc-pair':
      return `INC ${u(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${u(inst.pair)}`;
    case 'inc-reg':
      return `INC ${u(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${u(inst.reg)}`;
    case 'alu-reg':
      return `${u(inst.op)} ${u(inst.src)}`;
    case 'alu-imm':
      return `${u(inst.op)} ${hex(inst.value, 2)}`;
    case 'add-pair':
      return `ADD HL,${u(inst.src ?? inst.pair)}`;
    case 'sbc-pair':
      return `SBC HL,${u(inst.src)}`;
    case 'lea':
      return `LEA ${u(inst.dest)},${u(inst.base)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'xor-a':
      return 'XOR A';
    case 'or-a':
      return 'OR A';
    case 'in0':
      return `IN0 ${u(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${u(inst.reg)}`;
    case 'indexed-cb-test':
      return `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function disassembleLinear(entry, maxBytes = MAX_BYTES, maxInstructions = MAX_INSTRUCTIONS) {
  const instructions = [];
  let pc = entry;

  while (pc < rom.length && pc < entry + maxBytes && instructions.length < maxInstructions) {
    const inst = safeDecode(pc);
    instructions.push(inst);
    pc = inst.nextPc;

    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
      break;
    }

    if (inst.tag === 'jp' || inst.tag === 'jp-indirect') {
      break;
    }
  }

  return instructions;
}

function noteForInstruction(inst) {
  if ((inst.tag === 'call' || inst.tag === 'jp' || inst.tag === 'jp-conditional') && CODE_LABELS.has(inst.target)) {
    return CODE_LABELS.get(inst.target);
  }

  if (inst.tag === 'jp-indirect') {
    return 'indirect via current IY';
  }

  if (inst.tag === 'ld-pair-imm' && CODE_LABELS.has(inst.value)) {
    return CODE_LABELS.get(inst.value);
  }

  if ('addr' in inst && RAM_LABELS.has(inst.addr)) {
    return RAM_LABELS.get(inst.addr);
  }

  return '';
}

function uniqueByAddress(entries) {
  const seen = new Set();
  const result = [];

  for (const entry of entries) {
    if (seen.has(entry.addr)) continue;
    seen.add(entry.addr);
    result.push(entry);
  }

  return result;
}

function collectTrace(instructions) {
  const ramReads = [];
  const ramWrites = [];
  const callTargets = [];

  for (const inst of instructions) {
    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target < 0x400000) {
      callTargets.push({
        pc: hex(inst.pc),
        target: hex(inst.target),
        label: CODE_LABELS.get(inst.target) ?? '',
      });
    }

    if ((inst.tag === 'ld-pair-mem' || inst.tag === 'ld-reg-mem') && inst.addr >= 0xD00000) {
      ramReads.push({
        pc: hex(inst.pc),
        addr: hex(inst.addr),
        label: RAM_LABELS.get(inst.addr) ?? '',
        via: formatInstruction(inst),
      });
    }

    if ((inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg') && inst.addr >= 0xD00000) {
      ramWrites.push({
        pc: hex(inst.pc),
        addr: hex(inst.addr),
        label: RAM_LABELS.get(inst.addr) ?? '',
        via: formatInstruction(inst),
      });
    }
  }

  return {
    ramReads: uniqueByAddress(ramReads),
    ramWrites: uniqueByAddress(ramWrites),
    callTargets,
  };
}

function findBytePattern(bytes) {
  const hits = [];

  for (let i = 0; i <= rom.length - bytes.length; i++) {
    let matched = true;
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }

  return hits;
}

function findEntrypoints(target) {
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;

  const direct = [
    ...findBytePattern([0xCD, b0, b1, b2]).map(addr => ({ addr, type: 'CALL' })),
    ...findBytePattern([0xC3, b0, b1, b2]).map(addr => ({ addr, type: 'JP' })),
  ]
    .sort((left, right) => left.addr - right.addr)
    .map(hit => ({
      pc: hex(hit.addr),
      type: hit.type,
      contextBytes: raw(Math.max(0, hit.addr - 6), 16),
    }));

  const stagedLoads = findBytePattern([0x01, b0, b1, b2])
    .sort((left, right) => left - right)
    .map(addr => ({
      pc: hex(addr),
      type: 'LD BC',
      contextBytes: raw(Math.max(0, addr - 6), 16),
    }));

  return { direct, stagedLoads };
}

const rom = fs.readFileSync(ROM_PATH);
const instructions = disassembleLinear(ENTRY);
const last = instructions.at(-1);
const decodedBytes = last ? last.nextPc - ENTRY : 0;
const trace = collectTrace(instructions);
const entrypoints = findEntrypoints(ENTRY);

const summary = {
  probe: 'phase414-trace-015185',
  rom: path.relative(process.cwd(), ROM_PATH).replace(/\\/g, '/'),
  target: hex(ENTRY),
  decodedBytes,
  instructionCount: instructions.length,
  stopReason: last && (last.tag === 'ret' || last.tag === 'reti' || last.tag === 'retn')
    ? `return at ${hex(last.pc)}`
    : last && last.tag === 'jp'
      ? `jump at ${hex(last.pc)}`
      : last && last.tag === 'jp-indirect'
        ? `indirect jump at ${hex(last.pc)}`
        : `stopped at ${MAX_BYTES} byte cap`,
  ramReads: trace.ramReads,
  ramWrites: trace.ramWrites,
  callTargets: trace.callTargets,
  entrypoints,
  knownWrapperContext: {
    source: hex(0x01567C),
    note: 'Phase 412 showed 0x01567C stores 0x0121EF into D143EA before this callback is staged.',
  },
};

console.log('======================================================================');
console.log('Phase 414: Trace 0x015185 (Notification Completion Callback)');
console.log('======================================================================');
console.log(JSON.stringify(summary, null, 2));
console.log('');
console.log(`Disassembly of ${hex(ENTRY)} until RET/JP:`);
for (const inst of instructions) {
  const note = noteForInstruction(inst);
  const suffix = note ? `  ; ${note}` : '';
  console.log(`${hex(inst.pc)}  ${raw(inst.pc, inst.length).padEnd(18)}  ${formatInstruction(inst)}${suffix}`);
}
console.log('');
console.log('Interpretation Notes:');
console.log('- The callback immediately clears D17779 and sets D1777A = 1, matching the armed -> completed lifecycle hinted by phase 413.');
console.log('- It then pushes two literal stack arguments (0, then 3), loads IY from D143EA, and dispatches through 0x002288.');
console.log('- 0x002288 is just JP (IY), so this helper is a small completion shim that hands control to the hook currently stored in D143EA.');
console.log('- In the 0x01567C wrapper path, D143EA was primed with 0x0121EF, so the effective follow-up target there is 0x0121EF.');
