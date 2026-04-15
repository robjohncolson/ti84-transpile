#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const RAM_START = 0x400000;
const RAM_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE3_ENTRY = 0x0A29EC;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const STAGE3_MAX_STEPS = 50000;

const BOOT_MAX_LOOPS = 32;
const KERNEL_INIT_MAX_LOOPS = 10000;
const STAGE_MAX_LOOPS = 500;

const STACK_RESET_TOP = 0xD1A87E;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const ADDRESS_MASK = 0xFFFFFF;

const LINEAR_START = 0x0A1799;
const PART_A_END = 0x0A17C0;
const BLOCK_RANGE_START = 0x0A1790;
const BLOCK_RANGE_END = 0x0A17D0;
const TRACE_RANGE_START = 0x0A1790;
const TRACE_RANGE_END = 0x0A17D0;
const AUDIT_ADDR = 0x0A17B6;

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const SEED_TEXT = 'Normal Float Radian       ';

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const PRELIFTED_BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function mnemonicOf(inst) {
  return inst?.dasm ?? inst?.mnemonic ?? inst?.tag ?? '<unknown>';
}

function printableByte(value) {
  if (!Number.isInteger(value)) {
    return 'n/a';
  }

  if (value >= 0x20 && value <= 0x7E) {
    return String.fromCharCode(value);
  }

  return '.';
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem, stackBytes = 12) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function seedAscii(mem, addr, text) {
  for (let index = 0; index < text.length; index += 1) {
    mem[addr + index] = text.charCodeAt(index) & 0xFF;
  }
}

function decodeLinearDisassembly(start, end) {
  const rows = [];
  let pc = start;

  while (pc <= end && pc < romBytes.length) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    if (!inst || !inst.length) {
      break;
    }

    const bytes = romBytes.subarray(pc, pc + inst.length);
    rows.push({
      pc,
      length: inst.length,
      bytes,
      bytesText: formatBytes(bytes),
      text: mnemonicOf(inst),
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

function findContainingLinearRow(rows, addr) {
  return rows.find((row) => addr >= row.pc && addr < row.pc + row.length) ?? null;
}

function buildBlockRows(linearRows, linearMap) {
  const rows = [];

  for (const [key, block] of Object.entries(PRELIFTED_BLOCKS)) {
    if (!key.endsWith(':adl')) {
      continue;
    }

    const addr = parseInt(key.slice(0, 6), 16);
    if (!Number.isFinite(addr) || addr < BLOCK_RANGE_START || addr > BLOCK_RANGE_END) {
      continue;
    }

    const firstInstruction = block.instructions?.[0] ?? null;
    const linearRow = linearMap.get(addr) ?? null;
    const owner = linearRow ? null : findContainingLinearRow(linearRows, addr);

    rows.push({
      key,
      addr,
      block,
      firstInstruction,
      firstText: mnemonicOf(firstInstruction),
      firstBytes: firstInstruction?.bytes ?? '',
      linearRow,
      owner,
    });
  }

  rows.sort((left, right) => left.addr - right.addr);
  return rows;
}

function initializeEnvironment() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, ROM_LIMIT)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  return {
    mem,
    cpu,
    executor,
    boot,
    kernelInit,
    postInit,
    ramSnapshot: new Uint8Array(mem.subarray(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
  };
}

function captureTraceState(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    carry: cpu.f & 0x01 ? 1 : 0,
    bc: cpu._bc & ADDRESS_MASK,
    de: cpu._de & ADDRESS_MASK,
    hl: cpu._hl & ADDRESS_MASK,
    ix: cpu._ix & ADDRESS_MASK,
    iy: cpu._iy & ADDRESS_MASK,
    sp: cpu.sp & ADDRESS_MASK,
  };
}

function readPair(state, pair) {
  switch (pair) {
    case 'bc':
      return state.bc;
    case 'de':
      return state.de;
    case 'hl':
      return state.hl;
    case 'ix':
      return state.ix;
    case 'iy':
      return state.iy;
    case 'sp':
      return state.sp;
    default:
      return 0;
  }
}

function writePair(state, pair, value) {
  const normalized = value & ADDRESS_MASK;

  switch (pair) {
    case 'bc':
      state.bc = normalized;
      return;
    case 'de':
      state.de = normalized;
      return;
    case 'hl':
      state.hl = normalized;
      return;
    case 'ix':
      state.ix = normalized;
      return;
    case 'iy':
      state.iy = normalized;
      return;
    case 'sp':
      state.sp = normalized;
      return;
    default:
      return;
  }
}

function readReg8(state, reg) {
  switch (reg) {
    case 'a':
      return state.a & 0xFF;
    case 'b':
      return (state.bc >> 8) & 0xFF;
    case 'c':
      return state.bc & 0xFF;
    case 'd':
      return (state.de >> 8) & 0xFF;
    case 'e':
      return state.de & 0xFF;
    case 'h':
      return (state.hl >> 8) & 0xFF;
    case 'l':
      return state.hl & 0xFF;
    default:
      return 0;
  }
}

function writeReg8(state, reg, value) {
  const normalized = value & 0xFF;

  switch (reg) {
    case 'a':
      state.a = normalized;
      return;
    case 'b':
      state.bc = (state.bc & 0xFF00FF) | (normalized << 8);
      return;
    case 'c':
      state.bc = (state.bc & 0xFFFF00) | normalized;
      return;
    case 'd':
      state.de = (state.de & 0xFF00FF) | (normalized << 8);
      return;
    case 'e':
      state.de = (state.de & 0xFFFF00) | normalized;
      return;
    case 'h':
      state.hl = (state.hl & 0xFF00FF) | (normalized << 8);
      return;
    case 'l':
      state.hl = (state.hl & 0xFFFF00) | normalized;
      return;
    default:
      return;
  }
}

function parseMnemonic(inst) {
  return mnemonicOf(inst).toLowerCase();
}

function applyTraceEffect(state, inst, mem) {
  const text = parseMnemonic(inst);

  if (
    text === 'di' ||
    text === 'ei' ||
    text === 'nop' ||
    text.startsWith('jr ') ||
    text.startsWith('call ') ||
    text.startsWith('ret') ||
    text.startsWith('push ') ||
    text.startsWith('pop ') ||
    text.startsWith('bit ') ||
    text.startsWith('res ')
  ) {
    return;
  }

  if (text === 'ex de, hl') {
    const temp = state.de;
    state.de = state.hl;
    state.hl = temp;
    return;
  }

  let match = text.match(/^ld (bc|de|hl|ix|iy|sp), 0x([0-9a-f]+)$/);
  if (match) {
    writePair(state, match[1], parseInt(match[2], 16));
    return;
  }

  match = text.match(/^ld ([abcdehl]), 0x([0-9a-f]+)$/);
  if (match) {
    writeReg8(state, match[1], parseInt(match[2], 16));
    return;
  }

  match = text.match(/^ld ([abcdehl]), ([abcdehl])$/);
  if (match) {
    writeReg8(state, match[1], readReg8(state, match[2]));
    return;
  }

  match = text.match(/^ld ([abcdehl]), \((bc|de|hl|ix|iy)\)$/);
  if (match) {
    const addr = readPair(state, match[2]) & ADDRESS_MASK;
    writeReg8(state, match[1], mem[addr]);
    return;
  }

  match = text.match(/^ld \((bc|de|hl|ix|iy)\), ([abcdehl])$/);
  if (match) {
    const addr = readPair(state, match[1]) & ADDRESS_MASK;
    mem[addr] = readReg8(state, match[2]);
    return;
  }

  match = text.match(/^mlt (bc|de|hl|sp)$/);
  if (match) {
    const value = readPair(state, match[1]);
    const hi = (value >> 8) & 0xFF;
    const lo = value & 0xFF;
    writePair(state, match[1], (hi * lo) & 0xFFFF);
    return;
  }

  match = text.match(/^cp 0x([0-9a-f]+)$/);
  if (match) {
    const operand = parseInt(match[1], 16) & 0xFF;
    state.carry = state.a < operand ? 1 : 0;
    return;
  }

  match = text.match(/^cp ([abcdehl])$/);
  if (match) {
    const operand = readReg8(state, match[1]);
    state.carry = state.a < operand ? 1 : 0;
    return;
  }

  match = text.match(/^or ([abcdehl])$/);
  if (match) {
    state.a = (state.a | readReg8(state, match[1])) & 0xFF;
    state.carry = 0;
    return;
  }

  match = text.match(/^sub ([abcdehl])$/);
  if (match) {
    const operand = readReg8(state, match[1]);
    const result = state.a - operand;
    state.a = result & 0xFF;
    state.carry = result < 0 ? 1 : 0;
    return;
  }

  match = text.match(/^sbc a, ([abcdehl])$/);
  if (match) {
    const operand = readReg8(state, match[1]);
    const result = state.a - operand - state.carry;
    state.a = result & 0xFF;
    state.carry = result < 0 ? 1 : 0;
    return;
  }
}

function describeLinearInstruction(instPc, linearMap, fallbackText) {
  const linear = linearMap.get(instPc);
  if (linear) {
    return linear.text;
  }

  return `<no linear instruction start; block decodes as ${fallbackText}>`;
}

function traceStage3(env, linearMap) {
  const { mem, cpu, executor, ramSnapshot, cpuSnapshot } = env;

  mem.set(ramSnapshot, RAM_START);
  restoreCpu(cpu, cpuSnapshot, mem, 12);
  seedAscii(mem, MODE_BUF_START, SEED_TEXT);
  seedAscii(mem, DISPLAY_BUF_START, SEED_TEXT);
  clearVram(mem);

  const traceRows = [];
  const blockHits = new Map();

  const stage3 = executor.runFrom(STAGE3_ENTRY, 'adl', {
    maxSteps: STAGE3_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
    onBlock(pc, mode, meta) {
      if (mode !== 'adl' || pc < TRACE_RANGE_START || pc > TRACE_RANGE_END) {
        return;
      }

      blockHits.set(pc, (blockHits.get(pc) ?? 0) + 1);

      const instructions = meta?.instructions?.length
        ? meta.instructions
        : [{ pc, dasm: mnemonicOf(meta), bytes: '', tag: '<missing-meta>' }];
      const shadow = captureTraceState(cpu);

      for (const inst of instructions) {
        if (inst.pc < TRACE_RANGE_START || inst.pc > TRACE_RANGE_END) {
          continue;
        }

        traceRows.push({
          index: traceRows.length + 1,
          blockPc: pc,
          pc: inst.pc,
          a: shadow.a & 0xFF,
          hl: shadow.hl & ADDRESS_MASK,
          text: describeLinearInstruction(inst.pc, linearMap, mnemonicOf(inst)),
          blockText: mnemonicOf(inst),
        });

        applyTraceEffect(shadow, inst, mem);
      }
    },
  });

  return {
    stage3,
    traceRows,
    blockHits,
  };
}

function printPartA(rows) {
  console.log('=== Part A: Linear ADL Disassembly (0x0A1799-0x0A17C0) ===');
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${row.bytesText.padEnd(14)}  ${row.text}`);
  }
}

function printPartB(rows, linearRows, linearMap) {
  console.log('\n=== Part B: PRELIFTED_BLOCKS Boundary Audit (0x0A1790-0x0A17D0) ===');

  for (const row of rows) {
    const alignment = row.linearRow
      ? 'aligned'
      : `mid-instruction inside ${hex(row.owner?.pc)} (${row.owner?.text ?? 'unknown'})`;
    const prefix = `${row.key}`.padEnd(12);
    const bytes = row.firstBytes ? `${row.firstBytes.padEnd(11)} ` : '';
    console.log(`${prefix} ${bytes}${row.firstText}  [${alignment}]`);
  }

  const exactAuditBlock = rows.find((row) => row.addr === AUDIT_ADDR) ?? null;
  const containingLinear = linearMap.get(AUDIT_ADDR) ?? findContainingLinearRow(linearRows, AUDIT_ADDR);
  const misaligned = rows.filter((row) => !row.linearRow);

  console.log('');
  if (exactAuditBlock) {
    console.log(`0x0A17B6 exists as a separate block: yes (${exactAuditBlock.key})`);
    console.log(`First instruction in that block: ${exactAuditBlock.firstText}`);
  } else {
    console.log('0x0A17B6 exists as a separate block: no');
  }

  if (containingLinear && containingLinear.pc === AUDIT_ADDR) {
    console.log(`Linear cross-check at 0x0A17B6: instruction starts exactly here (${containingLinear.text})`);
  } else if (containingLinear) {
    console.log(`Linear cross-check at 0x0A17B6: no instruction start here; falls inside ${hex(containingLinear.pc)} (${containingLinear.text})`);
  } else {
    console.log('Linear cross-check at 0x0A17B6: unable to resolve containing instruction');
  }

  if (misaligned.length === 0) {
    console.log('Nearby misaligned blocks: none');
    return;
  }

  console.log(`Nearby misaligned blocks: ${misaligned.map((row) => row.key).join(', ')}`);
}

function printPartC(traceResult) {
  const { stage3, traceRows, blockHits } = traceResult;
  const entryBytes = traceRows
    .filter((row) => row.pc === LINEAR_START)
    .map((row) => row.a);
  const uniqueEntries = [...new Set(entryBytes)];
  const hitB6 = blockHits.get(0x0A17B6) ?? 0;
  const hitB8 = blockHits.get(0x0A17B8) ?? 0;

  console.log('\n=== Part C: Stage-3 Dynamic Trace (Seeded Nonzero Display Buffer) ===');
  console.log('Runtime note: createExecutor().runFrom() exposes onBlock, not onStep.');
  console.log('Trace below expands each executed block into instruction-level rows using lifted block metadata.');
  console.log(`Stage3 result: steps=${stage3.steps} termination=${stage3.termination} lastPc=${hex(stage3.lastPc)}`);
  console.log(`0x0A1799 entry A values: ${uniqueEntries.map((value) => `${hex(value, 2)}(${printableByte(value)})`).join(', ') || 'none'}`);
  console.log(`Hits: 0x0A17B6=${hitB6}, 0x0A17B8=${hitB8}`);

  if (hitB6 === 0 && hitB8 > 0) {
    console.log('Conclusion: with seeded ASCII bytes (< 0xFA), execution takes the carry branch to 0x0A17B8 and skips 0x0A17B6.');
  } else if (hitB6 > 0) {
    console.log('Conclusion: 0x0A17B6 was executed in this seeded run.');
  } else {
    console.log('Conclusion: neither 0x0A17B6 nor 0x0A17B8 was observed in the captured range.');
  }

  console.log('');
  for (const row of traceRows) {
    console.log(
      `${String(row.index).padStart(4, '0')}  block=${hex(row.blockPc)}  pc=${hex(row.pc)}  `
      + `A=${hex(row.a, 2)}  HL=${hex(row.hl)}  ${row.text}`,
    );
  }
}

async function main() {
  const partALinearRows = decodeLinearDisassembly(LINEAR_START, PART_A_END);
  const fullLinearRows = decodeLinearDisassembly(LINEAR_START, TRACE_RANGE_END);
  const fullLinearMap = new Map(fullLinearRows.map((row) => [row.pc, row]));
  const blockRows = buildBlockRows(fullLinearRows, fullLinearMap);
  const env = initializeEnvironment();
  const traceResult = traceStage3(env, fullLinearMap);

  console.log('=== Phase 170 - Block 0x0A17B6 Audit ===');
  console.log(`ROM bytes: ${romBytes.length}`);
  console.log(`PRELIFTED_BLOCKS: ${Object.keys(PRELIFTED_BLOCKS).length}`);
  console.log(`Seeded text (${SEED_TEXT.length} bytes): "${SEED_TEXT}"`);
  console.log(`Seeded mode buffer: ${hex(MODE_BUF_START)}`);
  console.log(`Seeded display buffer: ${hex(DISPLAY_BUF_START)}`);

  printPartA(partALinearRows);
  printPartB(blockRows, fullLinearRows, fullLinearMap);
  printPartC(traceResult);
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
