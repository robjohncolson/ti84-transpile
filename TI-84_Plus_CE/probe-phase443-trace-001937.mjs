#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const ROM = fs.readFileSync(ROM_PATH);

const MODE = 'adl';
const VECTOR_SLOT_SIZE = 8;
const VECTOR_SLOT_COUNT = 16;

const BARRIER_ENTRY = 0x001933;
const HALT_ADDR = 0x001937;
const HALT_OPCODE_ADDR = 0x001942;
const HALT_RESUME_ADDR = 0x001943;
const HALT_REGION_START = BARRIER_ENTRY - 0x60;
const HALT_REGION_BYTES = 0xC8;

const SLOT0_TARGET = 0x000658;
const IM1_IRQ_ENTRY = 0x000038;
const IM1_IRQ_TARGET = 0x0006F3;
const IRQ_DISPATCH_ENTRY = 0x0019B5;
const IRQ_COMMON_EXIT = 0x001A32;
const TIMER_SERVICE_BRANCH = 0x001ACF;
const EVENT_LOOP_TAIL = 0x003A70;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(addr) {
  return (ROM[addr] ?? 0) | ((ROM[addr + 1] ?? 0) << 8) | ((ROM[addr + 2] ?? 0) << 16);
}

function bytesToHex(addr, length) {
  return Array.from(
    ROM.subarray(addr, Math.min(ROM.length, addr + Math.max(length, 0))),
    (byte) => hexByte(byte),
  ).join(' ');
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatSigned(value) {
  const number = Number(value ?? 0);
  const abs = Math.abs(number);
  return `${number >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatSigned(displacement)})`;
}

function formatUnknownOperands(inst) {
  const ignored = new Set([
    'tag',
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'fallthrough',
    'terminates',
    'decodeError',
    'kind',
    'nextMode',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${formatSigned(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  if (!inst) {
    return 'db ??';
  }

  switch (inst.tag) {
    case 'db': return withPrefix(inst, `db 0x${hexByte(inst.value ?? 0)}`);
    case 'nop':
    case 'halt':
    case 'slp':
    case 'di':
    case 'ei':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'exx':
    case 'stmix':
    case 'rsmix':
      return withPrefix(inst, inst.tag);

    case 'ex-af':
      return withPrefix(inst, "ex af, af'");

    case 'im':
      return withPrefix(inst, `im ${inst.value}`);

    case 'ld-a-mb':
      return withPrefix(inst, 'ld a, mb');

    case 'ld-mb-a':
      return withPrefix(inst, 'ld mb, a');

    case 'jr':
      return withPrefix(inst, `jr ${hex(inst.target)}`);

    case 'jr-conditional':
      return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);

    case 'jp':
      return withPrefix(inst, `jp ${hex(inst.target)}`);

    case 'jp-conditional':
      return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);

    case 'jp-indirect':
      return withPrefix(inst, `jp (${inst.indirectRegister})`);

    case 'call':
      return withPrefix(inst, `call ${hex(inst.target)}`);

    case 'call-conditional':
      return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);

    case 'ret-conditional':
      return withPrefix(inst, `ret ${inst.condition}`);

    case 'rst':
      return withPrefix(inst, `rst 0x${hexByte(inst.target ?? 0)}`);

    case 'push':
      return withPrefix(inst, `push ${inst.pair}`);

    case 'pop':
      return withPrefix(inst, `pop ${inst.pair}`);

    case 'inc-pair':
      return withPrefix(inst, `inc ${inst.pair}`);

    case 'dec-pair':
      return withPrefix(inst, `dec ${inst.pair}`);

    case 'inc-reg':
      return withPrefix(inst, `inc ${inst.reg}`);

    case 'dec-reg':
      return withPrefix(inst, `dec ${inst.reg}`);

    case 'djnz':
      return withPrefix(inst, `djnz ${hex(inst.target)}`);

    case 'ld-pair-imm':
      return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);

    case 'ld-reg-imm':
      return withPrefix(inst, `ld ${inst.dest}, 0x${hexByte(inst.value)}`);

    case 'ld-reg-reg':
      return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);

    case 'ld-reg-ind':
      return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);

    case 'ld-ind-reg':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);

    case 'ld-ind-imm':
      return withPrefix(inst, `ld (hl), 0x${hexByte(inst.value)}`);

    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);

    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);

    case 'ld-pair-mem':
      return withPrefix(inst, `ld ${inst.pair}, (${hex(inst.addr)})`);

    case 'ld-mem-pair':
      return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);

    case 'ld-pair-indexed':
      return withPrefix(inst, `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);

    case 'ld-indexed-pair':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`);

    case 'ld-reg-ixd':
      return withPrefix(inst, `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);

    case 'ld-ixd-reg':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);

    case 'ld-ixd-imm':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, 0x${hexByte(inst.value)}`);

    case 'ld-sp-pair':
      return withPrefix(inst, `ld sp, ${inst.pair}`);

    case 'add-pair':
      return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);

    case 'adc-pair':
      return withPrefix(inst, `adc hl, ${inst.src}`);

    case 'sbc-pair':
      return withPrefix(inst, `sbc hl, ${inst.src}`);

    case 'alu-imm':
      return withPrefix(inst, `${inst.op} 0x${hexByte(inst.value)}`);

    case 'alu-reg':
      return withPrefix(inst, `${inst.op} ${inst.src}`);

    case 'bit-test':
      return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);

    case 'bit-set':
      return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);

    case 'bit-res':
      return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);

    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);

    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);

    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);

    case 'in0':
      return withPrefix(inst, `in0 ${inst.reg}, (0x${hexByte(inst.port)})`);

    case 'out0':
      return withPrefix(inst, `out0 (0x${hexByte(inst.port)}), ${inst.reg}`);

    case 'in-reg':
      return withPrefix(inst, `in ${inst.reg}, (c)`);

    case 'out-reg':
      return withPrefix(inst, `out (c), ${inst.reg}`);

    case 'lea':
      return withPrefix(inst, `lea ${inst.dest}, ${inst.base}${formatSigned(inst.displacement)}`);

    case 'ldir':
      return withPrefix(inst, 'ldir');

    default: {
      const operands = formatUnknownOperands(inst);
      return withPrefix(inst, operands ? `${inst.tag} ${operands}` : inst.tag);
    }
  }
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(ROM, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      value: ROM[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function disassemble(start, byteCount, markers = new Map()) {
  const lines = [];
  let pc = start;
  const end = start + byteCount;

  while (pc < end) {
    const inst = safeDecode(pc);
    const bytes = bytesToHex(pc, inst.length).padEnd(22, ' ');
    const marker = markers.get(pc);
    lines.push(
      `${hex(pc)}  ${bytes}  ${renderInstruction(inst)}${marker ? `  ; ${marker}` : ''}`,
    );
    pc = inst.nextPc ?? (pc + inst.length);
  }

  return lines;
}

function matchesStub(addr) {
  return ROM[addr] === 0xF3
    && ROM[addr + 1] === 0xED
    && ROM[addr + 2] === 0x7E
    && ROM[addr + 3] === 0x5B
    && ROM[addr + 4] === 0xC3;
}

function summarizeVectorSlot(slot) {
  const addr = slot * VECTOR_SLOT_SIZE;
  const raw = bytesToHex(addr, VECTOR_SLOT_SIZE);

  if (matchesStub(addr)) {
    return {
      slot,
      addr,
      raw,
      target: read24(addr + 5),
      note: 'DI; LD A, MB; LIL JP target',
    };
  }

  if (addr === 0x000038) {
    return {
      slot,
      addr,
      raw,
      target: IM1_IRQ_TARGET,
      note: 'RST 38h inline IRQ entry; first JP is at 0x000043',
    };
  }

  if (addr === 0x000068) {
    return {
      slot,
      addr,
      raw,
      target: 0x001AFA,
      note: 'NMI tail chunk; JP 0x001AFA at 0x000072',
    };
  }

  if (raw === 'FF FF FF FF FF FF FF FF') {
    return {
      slot,
      addr,
      raw,
      target: null,
      note: 'padding filled with RST 38h bytes',
    };
  }

  return {
    slot,
    addr,
    raw,
    target: null,
    note: 'adjacent inline code, not a vector stub',
  };
}

function printSection(title, lines) {
  console.log(`\n=== ${title} ===`);
  for (const line of lines) {
    console.log(line);
  }
}

function main() {
  console.log('Phase 443 - 0x001937 trace probe');
  console.log(`ROM: ${ROM_PATH}`);
  console.log('');
  console.log('Barrier wrapper entry:', hex(BARRIER_ENTRY));
  console.log('Barrier DI opcode:', hex(HALT_ADDR));
  console.log('Barrier HALT opcode:', hex(HALT_OPCODE_ADDR), '-> resume PC', hex(HALT_RESUME_ADDR));
  console.log('Vector 0 (0x000000) target:', hex(read24(0x000005)));
  console.log('Vector 1 (0x000008) target:', hex(read24(0x00000D)));
  console.log('Vector 2 (0x000010) target:', hex(read24(0x000015)));
  console.log('IM1 IRQ entry used by the OS:', hex(IM1_IRQ_ENTRY), '->', hex(IM1_IRQ_TARGET));
  console.log('Timer/status bit4 service branch:', hex(TIMER_SERVICE_BRANCH));

  const vectorLines = [];
  for (let slot = 0; slot < VECTOR_SLOT_COUNT; slot++) {
    const entry = summarizeVectorSlot(slot);
    vectorLines.push(
      `slot ${String(entry.slot).padStart(2, '0')} @ ${hex(entry.addr)}  ${entry.raw}`
      + (entry.target != null ? `  -> ${hex(entry.target)}  ${entry.note}` : `  ${entry.note}`),
    );
  }
  printSection('Low Vector Bank 0x000000-0x00007F (8-byte chunks)', vectorLines);

  printSection(
    'Vector Stub Decode 0x000000..0x000017',
    disassemble(0x000000, 0x18, new Map([
      [0x000000, 'slot 0: di'],
      [0x000001, 'slot 0: ld a, mb'],
      [0x000003, 'slot 0: lil jp 0x000658'],
      [0x000008, 'slot 1: di'],
      [0x000009, 'slot 1: ld a, mb'],
      [0x00000B, 'slot 1: lil jp 0x001AFA'],
      [0x000010, 'slot 2: di'],
      [0x000011, 'slot 2: ld a, mb'],
      [0x000013, 'slot 2: lil jp 0x020110'],
    ])),
  );

  printSection(
    'Slot 0 Target 0x000658 (first 100 bytes)',
    disassemble(SLOT0_TARGET, 100, new Map([
      [0x000658, 'slot 0 target'],
      [0x000694, 'DI'],
      [0x00069A, 'IM 1 set during boot'],
    ])),
  );

  printSection(
    'Actual IM1 IRQ Entry 0x000038 (first 40 bytes)',
    disassemble(IM1_IRQ_ENTRY, 40, new Map([
      [0x000038, 'IM1 / RST 38h entry'],
      [0x000043, 'jumps to generic IRQ front-end'],
    ])),
  );

  printSection(
    'Generic IRQ Front-End 0x0006F3 (first 100 bytes)',
    disassemble(IM1_IRQ_TARGET, 100, new Map([
      [0x0006F3, 'generic IRQ front-end'],
      [0x00070C, 'fallback to 0x0019B5'],
      [0x000715, 'gate call'],
      [0x000719, 'tail-jump to 0x0019BE when gate returns NZ'],
    ])),
  );

  printSection(
    'IRQ Dispatch Wrapper 0x0019B5 (through common RETI exit)',
    disassemble(IRQ_DISPATCH_ENTRY, 0x98, new Map([
      [0x0019B5, 'irq wrapper entry'],
      [0x0019BD, 'secondary HALT inside IRQ dispatcher'],
      [0x0019BE, 'resume after dispatcher HALT'],
      [0x001A32, 'common exit restores regs'],
      [0x001A48, 'EI'],
      [0x001A49, 'RETI'],
    ])),
  );

  printSection(
    'Timer/Masked-Status Bit4 Service 0x001ACF (first 48 bytes)',
    disassemble(TIMER_SERVICE_BRANCH, 48, new Map([
      [0x001ACF, 'byte0 bit4 ack path'],
      [0x001ADE, 'decrement D02658'],
      [0x001AF2, 'store decremented D02651'],
      [0x001AF6, 'tail-jump back to 0x001A32'],
    ])),
  );

  printSection(
    'Event-Loop Tail Around 0x003A73',
    disassemble(EVENT_LOOP_TAIL, 0x24, new Map([
      [0x003A73, 'event-loop entry used by the workflow probe'],
      [0x003A7D, 'gate call'],
      [0x003A81, 'tail-jump into 0x001933'],
    ])),
  );

  printSection(
    '0x001937 Region (+/- 100 bytes)',
    disassemble(HALT_REGION_START, HALT_REGION_BYTES, new Map([
      [0x0018FC, 'previous function tail'],
      [0x001933, 'inferred wrapper start'],
      [0x001937, 'DI inside requested barrier'],
      [0x001942, 'HALT opcode'],
      [0x001943, 'resume after RETI / shared tail helper'],
      [0x00194D, 'next helper start'],
    ])),
  );
}

main();
