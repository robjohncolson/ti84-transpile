#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEMINIT_ENTRY = 0x09dee0;

const STACK_RESET_TOP = 0xd1a87e;
const MEMINIT_RET = 0x7ffff6;
const IPOINT_RET = 0x7ffff2;
const FAKE_RET = 0x7ffffe;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const DRAW_FG_COLOR_ADDR = 0xd026ac;
const DRAW_COLOR_CODE_ADDR = 0xd026ae;
const DRAW_COLOR_TEMP_ADDR = 0xd02a60;
const DRAW_MODE_WORD_ADDR = 0xd02ac7;
const DRAW_MODE_ADDR = 0xd02ac8;
const VRAM_PTR_ADDR = 0xd02a8a;

const PIX_WIDE_P_ADDR = 0xd014fe;
const PIX_WIDE_M2_ADDR = 0xd01501;

const HOOKFLAGS3_ADDR = 0xd000b5;
const IY_PLUS_02_ADDR = 0xd00082;
const IY_PLUS_14_ADDR = 0xd00094;
const IY_PLUS_2B_ADDR = 0xd000ab;
const IY_PLUS_3C_ADDR = 0xd000bc;
const IY_PLUS_4A_ADDR = 0xd000ca;

const LCD_VRAM_ADDR = 0xd40000;
const LCD_VRAM_SIZE = 153600;

const DEFAULT_IY = 0xd00080;
const DEFAULT_IX = 0xd1a860;
const DEFAULT_MBASE = 0xd0;

const IPOINT_ENTRY = 0x07b451;
const PIXEL_X = 160;
const PIXEL_Y = 120;
const DRAW_MODE = 0x01;
const DRAW_COLOR_CODE = 0x10;

const EXPECTED_VRAM_ADDR = LCD_VRAM_ADDR + (PIXEL_Y * 320 * 2) + (PIXEL_X * 2);
const FOCUS_RANGE_START = 0x07b5b6;
const FOCUS_RANGE_END = 0x07b683;
const FOCUS_EXTRA_BLOCK_END = 0x07b68d;
const BLOCK_LIST_START = 0x07b500;
const BLOCK_LIST_END = 0x07b700;

const MEMINIT_BUDGET = 100000;
const IPOINT_BUDGET = 2000;
const MAX_LOOP_ITER = 8192;

const TRACE_BLOCKS = new Set([
  0x07b556,
  0x07b5aa,
  0x07b5af,
  0x07b5b0,
  0x07b5b2,
  0x07b5b6,
  0x07b5bc,
  0x07b5c4,
  0x07b5bf,
  0x07b625,
  0x07b62b,
  0x07b62e,
  0x07b633,
  0x07b677,
  0x07b682,
  0x07b688,
  0x07b68a,
]);

const TRACE_NOTES = new Map([
  [0x07b556, 'A still carries prior pen-color path state here in earlier traces'],
  [0x07b5aa, '.sis ld bc,(0x2AC7) reads [D02AC7,D02AC8] into BC'],
  [0x07b5af, 'ld c,a preserves caller A in C'],
  [0x07b5b0, 'ld a,b pulls drawMode byte from D02AC8'],
  [0x07b5b2, 'ld a,0x01 normalizes the mode flag'],
  [0x07b5b6, 'bit 7,(iy+30) branches but does not reload color'],
  [0x07b5bc, 'loop/branch glue before converging on 07B62B'],
  [0x07b625, 'alternate branch also forces A=0x01 before 07B62B'],
  [0x07b62e, '.sis ld de,(0x26AC) loads drawFGColor into DE'],
  [0x07b677, 'ld bc,(0xD02A8A) fetches computed VRAM pointer'],
  [0x07b682, 'ld a,e ; ld (bc),a stores DE low byte first'],
  [0x07b688, 'jr nz,07B68D skips second-byte write if call sets NZ'],
  [0x07b68a, 'inc bc ; ld a,d ; ld (bc),a stores DE high byte second'],
]);

const COLOR_CASES = [
  { id: 'blue', label: 'Blue', word: 0x001f, low: 0x1f, high: 0x00 },
  { id: 'red', label: 'Red', word: 0xf800, low: 0x00, high: 0xf8 },
  { id: 'green', label: 'Green', word: 0x07e0, low: 0xe0, high: 0x07 },
  { id: 'white', label: 'White', word: 0xffff, low: 0xff, high: 0xff },
];

const CONTROL_TAGS = new Set([
  'call',
  'call-conditional',
  'jp',
  'jp-conditional',
  'jr',
  'jr-conditional',
  'djnz',
  'rst',
]);

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const byteHex = (value) => hex(value, 2);
const wordHex = (value) => hex(value, 4);

const formatByteArray = (bytes) => bytes.map((value) => byteHex(value)).join(' ');

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function read24Mem(mem, addr) {
  return (
    (mem[addr] & 0xff) |
    ((mem[addr + 1] & 0xff) << 8) |
    ((mem[addr + 2] & 0xff) << 16)
  ) >>> 0;
}

function read16Mem(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8)) >>> 0;
}

function setBitValue(mem, addr, bit, enabled) {
  const mask = 1 << bit;
  if (enabled) {
    mem[addr] |= mask;
  } else {
    mem[addr] &= ~mask;
  }
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = DEFAULT_MBASE;
  cpu._iy = DEFAULT_IY;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = DEFAULT_MBASE;
  cpu._iy = DEFAULT_IY;
  cpu._ix = DEFAULT_IX;
  cpu._hl = 0;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function callOSRoutine(entry, retAddr, executor, cpu, mem, budget) {
  let returnHit = false;
  let steps = 0;

  try {
    executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
    });
  } catch (error) {
    if (error?.message !== '__RET__') {
      throw error;
    }
  }

  return { returnHit, steps };
}

function seedBaseProbeState(mem) {
  write24(mem, PIX_WIDE_P_ADDR, 320);
  write24(mem, PIX_WIDE_M2_ADDR, 238);

  mem[DRAW_FG_COLOR_ADDR] = 0x00;
  mem[DRAW_FG_COLOR_ADDR + 1] = 0x00;
  mem[DRAW_COLOR_CODE_ADDR] = 0x00;
  mem[DRAW_COLOR_CODE_ADDR + 1] = 0x00;
  mem[DRAW_COLOR_TEMP_ADDR] = 0x00;
  mem[DRAW_MODE_WORD_ADDR] = 0x00;
  mem[DRAW_MODE_ADDR] = 0x00;

  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[IY_PLUS_14_ADDR] &= ~0x20;
  setBitValue(mem, IY_PLUS_3C_ADDR, 0, false);
  setBitValue(mem, IY_PLUS_02_ADDR, 1, false);
  setBitValue(mem, IY_PLUS_2B_ADDR, 2, true);
  setBitValue(mem, IY_PLUS_4A_ADDR, 2, false);

  mem.fill(0xaa, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);
}

function snapshotCpu(cpu) {
  return {
    a: cpu.a,
    f: cpu.f,
    _bc: cpu._bc,
    _de: cpu._de,
    _hl: cpu._hl,
    _a2: cpu._a2,
    _f2: cpu._f2,
    _bc2: cpu._bc2,
    _de2: cpu._de2,
    _hl2: cpu._hl2,
    sp: cpu.sp,
    _ix: cpu._ix,
    _iy: cpu._iy,
    i: cpu.i,
    im: cpu.im,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    madl: cpu.madl,
    mbase: cpu.mbase,
    halted: cpu.halted,
  };
}

function restoreCpu(cpu, snapshot) {
  cpu.a = snapshot.a;
  cpu.f = snapshot.f;
  cpu._bc = snapshot._bc;
  cpu._de = snapshot._de;
  cpu._hl = snapshot._hl;
  cpu._a2 = snapshot._a2;
  cpu._f2 = snapshot._f2;
  cpu._bc2 = snapshot._bc2;
  cpu._de2 = snapshot._de2;
  cpu._hl2 = snapshot._hl2;
  cpu.sp = snapshot.sp;
  cpu._ix = snapshot._ix;
  cpu._iy = snapshot._iy;
  cpu.i = snapshot.i;
  cpu.im = snapshot.im;
  cpu.iff1 = snapshot.iff1;
  cpu.iff2 = snapshot.iff2;
  cpu.madl = snapshot.madl;
  cpu.mbase = snapshot.mbase;
  cpu.halted = snapshot.halted;
}

function createPreparedSystem() {
  const system = createRuntime();
  const { mem, executor, cpu } = system;

  coldBoot(executor, cpu, mem);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = DEFAULT_IY;
  cpu.mbase = DEFAULT_MBASE;

  const memInit = callOSRoutine(MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, mem, MEMINIT_BUDGET);

  seedAllocator(mem);
  seedBaseProbeState(mem);
  prepareCallState(cpu, mem);

  system.memInit = memInit;
  system.baselineMem = new Uint8Array(mem);
  system.baselineCpu = snapshotCpu(cpu);
  return system;
}

function normalizeWord(word) {
  return word >>> 0;
}

function decodePrefix(modePrefix) {
  if (!modePrefix) return '';
  return `.${modePrefix} `;
}

function formatSignedDisplacement(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatSignedDisplacement(displacement)})`;
}

function formatTarget(value) {
  if (value <= 0xff) return byteHex(value);
  if (value <= 0xffff) return wordHex(value);
  return hex(value);
}

function formatAlu(op, rhs) {
  if (op === 'cp' || op === 'and' || op === 'or' || op === 'xor' || op === 'sub') {
    return `${op} ${rhs}`;
  }
  return `${op} a, ${rhs}`;
}

function formatInstruction(instr) {
  const prefix = decodePrefix(instr.modePrefix);

  switch (instr.tag) {
    case 'indexed-cb-bit':
      return `${prefix}bit ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}res ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}set ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-rotate':
      return `${prefix}${instr.operation} ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'bit-test':
      return `${prefix}bit ${instr.bit}, ${instr.reg}`;
    case 'bit-test-ind':
      return `${prefix}bit ${instr.bit}, (${instr.indirectRegister})`;
    case 'ld-pair-imm':
      return `${prefix}ld ${instr.pair}, ${formatTarget(instr.value)}`;
    case 'ld-pair-mem':
      if (instr.direction === 'to-mem') {
        return `${prefix}ld (${formatTarget(instr.addr)}), ${instr.pair}`;
      }
      return `${prefix}ld ${instr.pair}, (${formatTarget(instr.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${formatTarget(instr.addr)}), ${instr.pair}`;
    case 'ld-reg-reg':
      return `${prefix}ld ${instr.dest}, ${instr.src}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${instr.dest}, ${byteHex(instr.value)}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${instr.dest}, (${formatTarget(instr.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${formatTarget(instr.addr)}), ${instr.src}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${instr.dest}, (${instr.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${instr.dest}), ${instr.src}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${instr.dest}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${instr.src}`;
    case 'ld-ixd-imm':
      return `${prefix}ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${byteHex(instr.value)}`;
    case 'ld-sp-pair':
      return `${prefix}ld sp, ${instr.pair}`;
    case 'inc-pair':
      return `${prefix}inc ${instr.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${instr.pair}`;
    case 'inc-reg':
      return `${prefix}inc ${instr.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${instr.reg}`;
    case 'add-pair':
      return `${prefix}add ${instr.dest}, ${instr.src}`;
    case 'alu-reg':
      return `${prefix}${formatAlu(instr.op, instr.src)}`;
    case 'alu-imm':
      return `${prefix}${formatAlu(instr.op, byteHex(instr.value))}`;
    case 'push':
      return `${prefix}push ${instr.pair}`;
    case 'pop':
      return `${prefix}pop ${instr.pair}`;
    case 'jr-conditional':
      return `${prefix}jr ${instr.condition}, ${hex(instr.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(instr.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${instr.condition}, ${hex(instr.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(instr.target)}`;
    case 'jp-indirect':
      return `${prefix}jp (${instr.indirectRegister})`;
    case 'call-conditional':
      return `${prefix}call ${instr.condition}, ${hex(instr.target)}`;
    case 'call':
      return `${prefix}call ${hex(instr.target)}`;
    case 'ret-conditional':
      return `${prefix}ret ${instr.condition}`;
    case 'ret':
      return `${prefix}ret`;
    case 'reti':
      return `${prefix}reti`;
    case 'retn':
      return `${prefix}retn`;
    case 'djnz':
      return `${prefix}djnz ${hex(instr.target)}`;
    case 'rst':
      return `${prefix}rst ${formatTarget(instr.target)}`;
    case 'ex-de-hl':
      return `${prefix}ex de, hl`;
    case 'di':
      return `${prefix}di`;
    case 'ei':
      return `${prefix}ei`;
    case 'nop':
      return `${prefix}nop`;
    default:
      return `${prefix}${instr.tag}`;
  }
}

function hexBytesForRange(start, length) {
  const bytes = [];
  for (let i = 0; i < length; i++) {
    bytes.push(byteHex(romBytes[start + i] ?? 0));
  }
  return bytes.join(' ');
}

function decodeRange(startAddr, endAddrExclusive, maxInstructions = Number.POSITIVE_INFINITY) {
  const entries = [];
  let pc = startAddr;

  while (pc < endAddrExclusive && entries.length < maxInstructions) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      entries.push({
        pc,
        instr,
        bytes: hexBytesForRange(pc, length),
        text: formatInstruction(instr),
      });
      pc += length;
    } catch (error) {
      entries.push({
        pc,
        instr: null,
        bytes: hexBytesForRange(pc, 1),
        text: `decode-error: ${error?.message ?? error}`,
      });
      pc += 1;
    }
  }

  return entries;
}

function collectControlTransfers(entries) {
  const transfers = [];
  for (const entry of entries) {
    const instr = entry.instr;
    if (!instr || !CONTROL_TAGS.has(instr.tag)) continue;

    let prefix = instr.tag;
    if (instr.tag === 'jr-conditional' || instr.tag === 'jp-conditional' || instr.tag === 'call-conditional') {
      prefix = `${instr.tag.replace('-conditional', '')} ${instr.condition}`;
    }

    if (instr.tag === 'djnz') {
      prefix = 'djnz';
    }

    transfers.push(`${prefix} -> ${formatTarget(instr.target)}`);
  }
  return transfers;
}

function blockStartAddresses(start, end) {
  return Object.keys(BLOCKS)
    .filter((key) => key.endsWith(':adl'))
    .map((key) => Number.parseInt(key.slice(0, 6), 16))
    .filter((addr) => addr >= start && addr < end)
    .sort((a, b) => a - b);
}

function describeColor(word) {
  const match = COLOR_CASES.find((item) => item.word === normalizeWord(word));
  if (match) return `${match.label} (${wordHex(match.word)})`;
  return `not one of the seeded colors (${wordHex(word)})`;
}

function installTraceHooks(cpu, mem) {
  const trace = {
    blockTrace: [],
    memoryEvents: [],
    lowStore: null,
    highStore: null,
  };

  const originalRead8 = cpu.read8.bind(cpu);
  const originalRead16 = cpu.read16.bind(cpu);
  const originalRead24 = cpu.read24.bind(cpu);
  const originalWrite8 = cpu.write8.bind(cpu);

  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    const norm = addr & 0xffffff;
    if (norm === DRAW_COLOR_CODE_ADDR || norm === DRAW_MODE_ADDR || norm === DRAW_COLOR_TEMP_ADDR) {
      trace.memoryEvents.push({
        type: 'read8',
        pc: cpu._currentBlockPc ?? 0,
        addr: norm,
        value: value & 0xff,
        a: cpu.a & 0xff,
        bc: cpu._bc >>> 0,
        de: cpu._de >>> 0,
      });
    }
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originalRead16(addr);
    const norm = addr & 0xffffff;
    if (norm === DRAW_FG_COLOR_ADDR || norm === DRAW_MODE_WORD_ADDR) {
      trace.memoryEvents.push({
        type: 'read16',
        pc: cpu._currentBlockPc ?? 0,
        addr: norm,
        value: value & 0xffff,
        a: cpu.a & 0xff,
        bc: cpu._bc >>> 0,
        de: cpu._de >>> 0,
      });
    }
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originalRead24(addr);
    const norm = addr & 0xffffff;
    if (norm === VRAM_PTR_ADDR) {
      trace.memoryEvents.push({
        type: 'read24',
        pc: cpu._currentBlockPc ?? 0,
        addr: norm,
        value: value >>> 0,
        a: cpu.a & 0xff,
        bc: cpu._bc >>> 0,
        de: cpu._de >>> 0,
      });
    }
    return value;
  };

  cpu.write8 = (addr, value) => {
    const norm = addr & 0xffffff;
    const before = mem[norm] & 0xff;
    const pc = cpu._currentBlockPc ?? 0;
    originalWrite8(addr, value);
    const after = mem[norm] & 0xff;

    if (norm === DRAW_COLOR_TEMP_ADDR || (norm >= EXPECTED_VRAM_ADDR && norm < EXPECTED_VRAM_ADDR + 4)) {
      const event = {
        type: 'write8',
        pc,
        addr: norm,
        before,
        value: value & 0xff,
        after,
        a: cpu.a & 0xff,
        bc: cpu._bc >>> 0,
        de: cpu._de >>> 0,
      };
      trace.memoryEvents.push(event);

      if (pc === 0x07b682 && norm === EXPECTED_VRAM_ADDR) {
        trace.lowStore = event;
      }
      if (pc === 0x07b68a && norm === EXPECTED_VRAM_ADDR + 1) {
        trace.highStore = event;
      }
    }
  };

  return {
    trace,
    restore() {
      cpu.read8 = originalRead8;
      cpu.read16 = originalRead16;
      cpu.read24 = originalRead24;
      cpu.write8 = originalWrite8;
    },
  };
}

function recordTraceBlock(trace, cpu, pc, step) {
  const norm = pc & 0xffffff;
  if (!TRACE_BLOCKS.has(norm)) return;

  trace.blockTrace.push({
    step,
    pc: norm,
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    bc: cpu._bc >>> 0,
    de: cpu._de >>> 0,
    hl: cpu._hl >>> 0,
    sp: cpu.sp >>> 0,
  });
}

function applyColorSeed(mem, colorCase) {
  mem[DRAW_MODE_WORD_ADDR] = 0x00;
  mem[DRAW_MODE_ADDR] = DRAW_MODE;
  mem[DRAW_FG_COLOR_ADDR] = colorCase.low;
  mem[DRAW_FG_COLOR_ADDR + 1] = colorCase.high;
  mem[DRAW_COLOR_CODE_ADDR] = DRAW_COLOR_CODE;
  mem[DRAW_COLOR_CODE_ADDR + 1] = 0x00;
  mem[DRAW_COLOR_TEMP_ADDR] = 0x00;
  mem.fill(0xaa, EXPECTED_VRAM_ADDR, EXPECTED_VRAM_ADDR + 8);
}

function runColorCase(system, colorCase, traceEnabled) {
  const { mem, executor, cpu, baselineMem, baselineCpu, memInit } = system;
  mem.set(baselineMem);
  restoreCpu(cpu, baselineCpu);
  applyColorSeed(mem, colorCase);

  const hooks = installTraceHooks(cpu, mem);
  const trace = hooks.trace;

  cpu.a = DRAW_MODE;
  cpu._bc = PIXEL_Y & 0xff;
  cpu._de = PIXEL_X;
  cpu._hl = 0;
  cpu.sp -= 3;
  write24(mem, cpu.sp, IPOINT_RET);

  let returnHit = false;
  let steps = 0;

  try {
    executor.runFrom(IPOINT_ENTRY, 'adl', {
      maxSteps: IPOINT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        recordTraceBlock(trace, cpu, pc, steps);
        const norm = pc & 0xffffff;
        if (norm === IPOINT_RET || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        steps++;
        recordTraceBlock(trace, cpu, pc, steps);
        const norm = pc & 0xffffff;
        if (norm === IPOINT_RET || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
    });
  } catch (error) {
    hooks.restore();
    if (error?.message !== '__RET__') {
      throw error;
    }
  }

  hooks.restore();

  const runtimePtr = read24Mem(mem, VRAM_PTR_ADDR);
  const observedAddr = trace.lowStore?.addr ?? runtimePtr ?? EXPECTED_VRAM_ADDR;
  const bytesAtExpected = Array.from(mem.subarray(EXPECTED_VRAM_ADDR, EXPECTED_VRAM_ADDR + 4));
  const bytesAtObserved = Array.from(mem.subarray(observedAddr, observedAddr + 4));
  const storedWord = ((mem[observedAddr] & 0xff) | ((mem[observedAddr + 1] & 0xff) << 8)) >>> 0;

  return {
    colorCase,
    memInit,
    returnHit,
    steps,
    trace: traceEnabled ? trace : {
      blockTrace: trace.blockTrace,
      memoryEvents: trace.memoryEvents,
      lowStore: trace.lowStore,
      highStore: trace.highStore,
    },
    runtimePtr,
    observedAddr,
    bytesAtExpected,
    bytesAtObserved,
    storedWord,
  };
}

function printPartA() {
  console.log('=== Part A: Static blocks and disassembly ===');

  const starts = blockStartAddresses(BLOCK_LIST_START, BLOCK_LIST_END);
  console.log(
    `ADL block starts in ${hex(BLOCK_LIST_START)}..${hex(BLOCK_LIST_END)} (${starts.length} blocks):`
  );
  console.log(`  ${starts.map((addr) => hex(addr)).join(' ')}`);

  console.log('\nBlock previews in that window:');
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const next = starts[index + 1] ?? BLOCK_LIST_END;
    const preview = decodeRange(start, next, 4);
    const transfers = collectControlTransfers(preview);
    console.log(`\n[${hex(start)}]`);
    for (const line of preview) {
      console.log(`  ${hex(line.pc)}: ${line.bytes.padEnd(18)} ${line.text}`);
    }
    console.log(`  control-flow: ${transfers.length > 0 ? transfers.join('; ') : 'none in preview'}`);
  }

  console.log('\nFocused sequential decode for 0x07B5B6 through 0x07B682:');
  const focused = decodeRange(FOCUS_RANGE_START, FOCUS_RANGE_END);
  for (const line of focused) {
    console.log(`  ${hex(line.pc)}: ${line.bytes.padEnd(18)} ${line.text}`);
  }

  console.log('\nPaired second-byte store block (included for context):');
  const extra = decodeRange(0x07b68a, FOCUS_EXTRA_BLOCK_END);
  for (const line of extra) {
    console.log(`  ${hex(line.pc)}: ${line.bytes.padEnd(18)} ${line.text}`);
  }

  console.log('\nStatic conclusion:');
  console.log('  - A is forced to 0x01 before 0x07B5B6 at 0x07B5B2 (and again at 0x07B625 on an alternate branch).');
  console.log('  - 0x07B5B6 itself only tests IY flags and branches; it does not reload pen color.');
  console.log('  - The direct 16bpp path is 0x07B62E (.sis ld de,(0x26AC)) -> 0x07B677 -> 0x07B682 (ld a,e ; ld (bc),a) -> 0x07B68A (ld a,d ; ld (bc),a).');
  console.log('  - There is no direct CALL/JP on that straight path that reloads D026AE before the VRAM stores.');
}

function printDetailedTrace(result) {
  console.log('\n=== Part B: drawFGColor = 0x001F (blue) ===');
  console.log(`memInit returned=${result.memInit.returnHit} steps=${result.memInit.steps}`);
  console.log(`IPoint returned=${result.returnHit} steps=${result.steps}`);
  console.log(
    `seed drawMode=${byteHex(DRAW_MODE)} drawFGColor=${wordHex(result.colorCase.word)} drawColorCode=${byteHex(DRAW_COLOR_CODE)}`
  );
  console.log(`expected VRAM addr by formula: ${hex(EXPECTED_VRAM_ADDR)}`);
  console.log(`runtime VRAM ptr from D02A8A: ${hex(result.runtimePtr)}`);
  console.log(`observed store addr: ${hex(result.observedAddr)}`);
  console.log(`bytes @ expected addr: ${formatByteArray(result.bytesAtExpected)}`);
  console.log(`bytes @ observed addr: ${formatByteArray(result.bytesAtObserved)}`);
  console.log(
    `hypothesis A (drawMode first): ${byteHex(DRAW_MODE)} ${byteHex(result.colorCase.low)}`
  );
  console.log(
    `hypothesis B (DE low/high):   ${byteHex(result.colorCase.low)} ${byteHex(result.colorCase.high)}`
  );
  console.log(
    `observed little-endian 16-bit word: ${wordHex(result.storedWord)} -> ${describeColor(result.storedWord)}`
  );

  console.log('\nWatched block trace:');
  console.log('  step  pc        A    BC        DE        HL        note');
  for (const entry of result.trace.blockTrace) {
    const note = TRACE_NOTES.get(entry.pc) ?? '';
    console.log(
      `  ${String(entry.step).padStart(4)}  ${hex(entry.pc)}  ${byteHex(entry.a)}  ${hex(entry.bc)}  ${hex(entry.de)}  ${hex(entry.hl)}  ${note}`
    );
  }

  console.log('\nWatched memory events:');
  for (const event of result.trace.memoryEvents) {
    const value =
      event.type === 'read24'
        ? hex(event.value)
        : event.type === 'read16'
          ? wordHex(event.value)
          : byteHex(event.value);
    const beforeAfter =
      event.type === 'write8' ? ` before=${byteHex(event.before)} after=${byteHex(event.after)}` : '';
    console.log(
      `  ${event.type.padEnd(6)} pc=${hex(event.pc)} addr=${hex(event.addr)} value=${value}${beforeAfter} A=${byteHex(event.a)} BC=${hex(event.bc)} DE=${hex(event.de)}`
    );
  }

  console.log('\nPart B take-away:');
  console.log('  - If observed bytes match "hypothesis B", the LCD 16bpp path is writing drawFGColor low/high bytes from DE.');
  console.log('  - If observed bytes match "hypothesis A", then drawMode is acting as the first pixel byte and drawFGColor is only supplying the second byte.');
}

function printColorMatrix(results) {
  console.log('\n=== Part C: Four-color drawFGColor sweep ===');
  console.log('case   drawFGColor  expected-vram  observed-vram  stored-word  interpreted');
  for (const result of results) {
    const expectedBytes = `${byteHex(result.colorCase.low)} ${byteHex(result.colorCase.high)}`;
    const observedBytes = `${byteHex(result.bytesAtObserved[0])} ${byteHex(result.bytesAtObserved[1])}`;
    console.log(
      `${result.colorCase.label.padEnd(6)} ${wordHex(result.colorCase.word).padEnd(12)} ${expectedBytes.padEnd(13)} ${observedBytes.padEnd(13)} ${wordHex(result.storedWord).padEnd(11)} ${describeColor(result.storedWord)}`
    );
  }

  console.log('\nColor notes:');
  for (const result of results) {
    console.log(
      `  - ${result.colorCase.label}: drawFGColor=${wordHex(result.colorCase.word)} -> VRAM[${hex(result.observedAddr)}]=${byteHex(result.bytesAtObserved[0])} ${byteHex(result.bytesAtObserved[1])}`
    );
  }
}

function main() {
  console.log('=== Phase 152: IPoint color fix probe ===');
  console.log(`IPoint entry=${hex(IPOINT_ENTRY)} pixel=(x=${PIXEL_X}, y=${PIXEL_Y}) drawMode=${byteHex(DRAW_MODE)}`);
  console.log(`Expected VRAM address=${hex(EXPECTED_VRAM_ADDR)} sentinel fill=0xAA`);

  printPartA();

  const system = createPreparedSystem();
  const blue = runColorCase(system, COLOR_CASES[0], true);
  printDetailedTrace(blue);

  const sweep = [blue];
  for (const colorCase of COLOR_CASES.slice(1)) {
    sweep.push(runColorCase(system, colorCase, false));
  }
  printColorMatrix(sweep);

  console.log('\nSummary:');
  console.log('  - Part A shows where A becomes 0x01 and whether the straight path contains any color-reload call/jump.');
  console.log('  - Part B shows the exact bytes written at the computed VRAM address for drawFGColor=0x001F.');
  console.log('  - Part C compares red/green/blue/white to show whether the written bytes track drawFGColor or drawMode.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
