#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 200000, maxLoopIterations: 100000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const INJECTED_SCAN_CODE = 0x09;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;
const SYSFLAG_CLEAR_VALUE = 0x00;

const GPIO_VALUE = 0xEE;

const POST_KEY_HANDLER = 0x0158DE;
const POST_KEY_SUBROUTINE = 0x0158BC;
const FLAG_ADDR = 0xD000C2;
const NORMAL_KEY_HANDLER = 0x001853;
const DISPATCH_ENTRY = 0x003A7D;

const DISASM_START = 0x0158BC;
const DISASM_END = 0x015920;

const TRACE_BLOCK_LIMIT = 300;

const CHECKPOINTS = [
  [DISPATCH_ENTRY, '0x003A7D dispatch entry'],
  [0x001713, '0x001713 gate caller'],
  [0x0067F8, '0x0067F8 gpio check'],
  [NORMAL_KEY_HANDLER, '0x001853 normal key handler'],
  [POST_KEY_HANDLER, '0x0158DE post-key handler'],
  [POST_KEY_SUBROUTINE, '0x0158BC post-key subroutine'],
  [0x0158F8, '0x0158F8 post-key Z-return'],
  [0x000721, '0x000721 post-handler jump'],
  [0x001933, '0x001933 error path'],
  [0x001937, '0x001937 halt'],
];

const CHECKPOINT_LABELS = new Map(CHECKPOINTS);
const DISPATCH_KEY = makeKey(DISPATCH_ENTRY, MODE);
const NORMAL_HANDLER_KEY = makeKey(NORMAL_KEY_HANDLER, MODE);
const POST_KEY_HANDLER_KEY = makeKey(POST_KEY_HANDLER, MODE);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl',
  '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im',
  'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function bytesToHex(buffer, start, length) {
  const addr = (Number(start) || 0) & 0xFFFFFF;
  const end = Math.min(buffer.length, addr + Math.max(length, 0));
  return Array.from(
    buffer.subarray(addr, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatSigned(value) {
  const normalized = Number(value ?? 0);
  const abs = Math.abs(normalized);
  return `${normalized >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${indexRegister}${formatSigned(displacement)})`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc', 'length', 'nextPc', 'mode', 'modePrefix',
    'terminates', 'fallthrough', 'decodeError', 'tag',
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
  switch (inst?.tag) {
    case 'db': return { mnemonic: 'db', operands: hexByte(inst.value) };
    case 'nop': case 'halt': case 'slp': case 'di': case 'ei':
    case 'ret': case 'reti': case 'retn':
    case 'rlca': case 'rrca': case 'rla': case 'rra':
    case 'daa': case 'cpl': case 'scf': case 'ccf': case 'neg':
    case 'rrd': case 'rld':
    case 'ldi': case 'ldd': case 'ldir': case 'lddr':
    case 'cpi': case 'cpd': case 'cpir': case 'cpdr':
    case 'ini': case 'ind': case 'inir': case 'indr':
    case 'outi': case 'outd': case 'otir': case 'otdr':
    case 'otimr': case 'stmix': case 'rsmix': case 'exx':
      return { mnemonic: inst.tag, operands: '' };

    case 'ret-conditional': return { mnemonic: 'ret', operands: inst.condition };
    case 'jr': return { mnemonic: 'jr', operands: hex(inst.target) };
    case 'jr-conditional': return { mnemonic: 'jr', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'djnz': return { mnemonic: 'djnz', operands: hex(inst.target) };
    case 'jp': return { mnemonic: 'jp', operands: hex(inst.target) };
    case 'jp-conditional': return { mnemonic: 'jp', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'jp-indirect': return { mnemonic: 'jp', operands: `(${inst.indirectRegister})` };
    case 'call': return { mnemonic: 'call', operands: hex(inst.target) };
    case 'call-conditional': return { mnemonic: 'call', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'rst': return { mnemonic: 'rst', operands: hexByte(inst.target) };

    case 'push': return { mnemonic: 'push', operands: inst.pair };
    case 'pop': return { mnemonic: 'pop', operands: inst.pair };

    case 'ld-pair-imm': return { mnemonic: 'ld', operands: `${inst.pair}, ${hex(inst.value)}` };
    case 'ld-reg-imm': return { mnemonic: 'ld', operands: `${inst.dest}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg': return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-reg-ind': return { mnemonic: 'ld', operands: `${inst.dest}, (${inst.src})` };
    case 'ld-ind-reg': return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.src}` };
    case 'ld-ind-imm': return { mnemonic: 'ld', operands: `(hl), ${hexByte(inst.value)}` };
    case 'ld-reg-mem': return { mnemonic: 'ld', operands: `${inst.dest}, (${hex(inst.addr)})` };
    case 'ld-mem-reg': return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.src}` };
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
      }
      return { mnemonic: 'ld', operands: `${inst.pair}, (${hex(inst.addr)})` };
    case 'ld-mem-pair': return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
    case 'ld-pair-ind': return { mnemonic: 'ld', operands: `${inst.pair}, (${inst.src})` };
    case 'ld-ind-pair': return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.pair}` };
    case 'ld-sp-hl': return { mnemonic: 'ld', operands: 'sp, hl' };
    case 'ld-sp-pair': return { mnemonic: 'ld', operands: `sp, ${inst.pair}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'ld', operands: `${inst.pair}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'ld-ixiy-indexed':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-special': return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-mb-a': return { mnemonic: 'ld', operands: 'mb, a' };
    case 'ld-a-mb': return { mnemonic: 'ld', operands: 'a, mb' };

    case 'inc-pair': return { mnemonic: 'inc', operands: inst.pair };
    case 'dec-pair': return { mnemonic: 'dec', operands: inst.pair };
    case 'inc-reg': return { mnemonic: 'inc', operands: inst.reg };
    case 'dec-reg': return { mnemonic: 'dec', operands: inst.reg };
    case 'inc-ixd': return { mnemonic: 'inc', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
    case 'dec-ixd': return { mnemonic: 'dec', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'add-pair': return { mnemonic: 'add', operands: `${inst.dest}, ${inst.src}` };
    case 'adc-pair': return { mnemonic: 'adc', operands: `hl, ${inst.src}` };
    case 'sbc-pair': return { mnemonic: 'sbc', operands: `hl, ${inst.src}` };
    case 'alu-reg': return { mnemonic: inst.op, operands: inst.src };
    case 'alu-imm': return { mnemonic: inst.op, operands: hexByte(inst.value) };
    case 'alu-ixd': return { mnemonic: inst.op, operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'bit-test': return { mnemonic: 'bit', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-test-ind': return { mnemonic: 'bit', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-set': return { mnemonic: 'set', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-set-ind': return { mnemonic: 'set', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-res': return { mnemonic: 'res', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-res-ind': return { mnemonic: 'res', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'indexed-cb-bit':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'rotate-reg': return { mnemonic: inst.op, operands: inst.reg };
    case 'rotate-ind': return { mnemonic: inst.op, operands: `(${inst.indirectRegister})` };
    case 'indexed-cb-rotate':
      return {
        mnemonic: inst.operation ?? inst.op ?? 'rotate',
        operands: formatIndexedOperand(inst.indexRegister, inst.displacement),
      };

    case 'in-reg': return { mnemonic: 'in', operands: `${inst.reg}, (c)` };
    case 'out-reg': return { mnemonic: 'out', operands: `(c), ${inst.reg}` };
    case 'in-imm': return { mnemonic: 'in', operands: `a, (${hexByte(inst.port)})` };
    case 'out-imm': return { mnemonic: 'out', operands: `(${hexByte(inst.port)}), a` };
    case 'in0': return { mnemonic: 'in0', operands: `${inst.reg}, (${hexByte(inst.port)})` };
    case 'out0': return { mnemonic: 'out0', operands: `(${hexByte(inst.port)}), ${inst.reg}` };

    case 'ex-af': return { mnemonic: 'ex', operands: "af, af'" };
    case 'ex-de-hl': return { mnemonic: 'ex', operands: 'de, hl' };
    case 'ex-sp-hl': return { mnemonic: 'ex', operands: '(sp), hl' };
    case 'ex-sp-pair': return { mnemonic: 'ex', operands: `(sp), ${inst.pair}` };

    case 'im': return { mnemonic: 'im', operands: String(inst.value) };
    case 'mlt': return { mnemonic: 'mlt', operands: inst.reg };
    case 'tst-reg': return { mnemonic: 'tst', operands: `a, ${inst.reg}` };
    case 'tst-ind': return { mnemonic: 'tst', operands: 'a, (hl)' };
    case 'tst-imm': return { mnemonic: 'tst', operands: `a, ${hexByte(inst.value)}` };
    case 'tstio': return { mnemonic: 'tstio', operands: hexByte(inst.value) };
    case 'lea': return { mnemonic: 'lea', operands: `${inst.dest}, ${formatIndexedOperand(inst.base, inst.displacement)}` };
    case 'pea': return { mnemonic: 'pea', operands: `${inst.base}${formatSigned(inst.displacement)}` };

    default:
      return { mnemonic: inst?.tag ?? 'unknown', operands: fallbackOperands(inst) };
  }
}

function formatInstruction(inst) {
  const rendered = renderInstruction(inst);
  const text = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return withPrefix(inst, text);
}

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function preparePhase(cpu, mem, sp, stackFillBytes) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
}

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
      mode,
    };
  }
}

function disassembleRange(memory, start, endInclusive, mode = MODE) {
  const rows = [];
  let pc = start;

  while (pc <= endInclusive && pc < memory.length) {
    const inst = safeDecode(memory, pc, mode);
    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesToHex(memory, pc, length),
      text: formatInstruction(inst),
      decodeError: inst.decodeError ?? null,
    });
    pc += length;
  }

  return rows;
}

function captureRegisters(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu._hl & 0xFFFFFF,
    bc: cpu._bc & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
  };
}

function formatRegisters(registers) {
  return [
    `A=${hexByte(registers.a)}`,
    `F=${hexByte(registers.f)}`,
    `HL=${hex(registers.hl)}`,
    `BC=${hex(registers.bc)}`,
    `DE=${hex(registers.de)}`,
    `SP=${hex(registers.sp)}`,
    `IX=${hex(registers.ix)}`,
    `IY=${hex(registers.iy)}`,
  ].join(' ');
}

function createTrace() {
  return {
    dispatchReached: false,
    dispatchStep: null,
    normalHandlerReached: false,
    normalHandlerStep: null,
    postKeyHandlerReached: false,
    postKeyHandlerStep: null,
    uniqueBlocks: new Set(),
    postDispatchEntries: [],
    betweenHandlerAndPostKey: [],
    postKeyEntries: [],
    checkpointHits: [],
    firstHitByPc: new Map(),
    flagValueAtEntry: null,
    subroutineCallResult: null,
  };
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function seedFlashSignature(mem) {
  for (let index = 0; index < FLASH_SEED_BYTES.length; index += 1) {
    mem[FLASH_SEED_ADDR + index] = FLASH_SEED_BYTES[index];
  }
}

function seedSystemFlag(mem) {
  mem[SYSFLAG_ADDR] = SYSFLAG_CLEAR_VALUE;
}

function seedKeyInput(mem) {
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;
}

function runDynamicTrace(blocks, romBytes) {
  const bootState = runBootPhases(blocks, romBytes);
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace();

  prepareEventLoop(cpu, executor, mem, bootState);
  seedFlashSignature(mem);
  seedSystemFlag(mem);
  seedKeyInput(mem);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const blockKey = makeKey(normalizedPc, mode);
      const registers = captureRegisters(cpu);

      trace.uniqueBlocks.add(blockKey);

      const label = CHECKPOINT_LABELS.get(normalizedPc);
      if (label) {
        trace.checkpointHits.push({ label, pc: normalizedPc, mode, step, registers });
        if (!trace.firstHitByPc.has(normalizedPc)) {
          trace.firstHitByPc.set(normalizedPc, { label, pc: normalizedPc, mode, step, registers });
        }
      }

      if (blockKey === DISPATCH_KEY && !trace.dispatchReached) {
        trace.dispatchReached = true;
        trace.dispatchStep = step;
      }

      if (!trace.dispatchReached) {
        return;
      }

      if (blockKey === NORMAL_HANDLER_KEY && !trace.normalHandlerReached) {
        trace.normalHandlerReached = true;
        trace.normalHandlerStep = step;
      }

      if (blockKey === POST_KEY_HANDLER_KEY && !trace.postKeyHandlerReached) {
        trace.postKeyHandlerReached = true;
        trace.postKeyHandlerStep = step;
        trace.flagValueAtEntry = mem[FLAG_ADDR];
      }

      if (trace.normalHandlerReached && !trace.postKeyHandlerReached) {
        if (trace.betweenHandlerAndPostKey.length < TRACE_BLOCK_LIMIT) {
          const inst = safeDecode(mem, normalizedPc, mode);
          const length = Math.max(inst.length ?? 1, 1);
          trace.betweenHandlerAndPostKey.push({
            step,
            pc: normalizedPc,
            bytes: bytesToHex(mem, normalizedPc, length),
            text: formatInstruction(inst),
            registers,
          });
        }
      }

      if (trace.postKeyHandlerReached) {
        if (trace.postKeyEntries.length < TRACE_BLOCK_LIMIT) {
          const inst = safeDecode(mem, normalizedPc, mode);
          const length = Math.max(inst.length ?? 1, 1);
          trace.postKeyEntries.push({
            step,
            delta: step - trace.postKeyHandlerStep,
            pc: normalizedPc,
            bytes: bytesToHex(mem, normalizedPc, length),
            text: formatInstruction(inst),
            registers,
          });
        }
      }

      if (trace.postDispatchEntries.length < TRACE_BLOCK_LIMIT) {
        const inst = safeDecode(mem, normalizedPc, mode);
        const length = Math.max(inst.length ?? 1, 1);
        trace.postDispatchEntries.push({
          step,
          delta: step - trace.dispatchStep,
          pc: normalizedPc,
          bytes: bytesToHex(mem, normalizedPc, length),
          text: formatInstruction(inst),
          registers,
        });
      }
    },
  });

  return { bootState, mem, result, trace };
}

function printDisassembly(title, rows) {
  console.log(`=== ${title} ===`);
  for (const row of rows) {
    const note = row.decodeError ? ` [decode error: ${row.decodeError}]` : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${note}`);
  }
  console.log('');
}

function printBootSummary(bootState) {
  console.log('=== BOOT SUMMARY ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');
}

function printCheckpoints(trace) {
  console.log('=== CHECKPOINT REACHABILITY ===');
  for (const [addr, label] of CHECKPOINTS) {
    const hit = trace.firstHitByPc.get(addr);
    console.log(
      `${hex(addr)} ${label}: `
      + `${hit ? `step=${count(hit.step + 1)} ${formatRegisters(hit.registers)}` : 'not reached'}`,
    );
  }
  console.log('');
}

function printFirstHitOrder(trace) {
  const firstHits = [...trace.firstHitByPc.values()].sort((a, b) => a.step - b.step);
  const notReached = CHECKPOINTS.map(([addr]) => addr).filter((addr) => !trace.firstHitByPc.has(addr));

  console.log('=== FIRST-HIT ORDER ===');
  for (let index = 0; index < firstHits.length; index += 1) {
    const hit = firstHits[index];
    console.log(
      `${String(index + 1).padStart(2, '0')}. `
      + `step=${count(hit.step + 1)} pc=${hex(hit.pc)} ${hit.label} `
      + `${formatRegisters(hit.registers)}`,
    );
  }
  if (notReached.length > 0) {
    console.log(`not_reached: ${notReached.map((addr) => hex(addr)).join(', ')}`);
  }
  console.log('');
}

function printBetweenHandlerAndPostKey(trace) {
  console.log(`=== BLOCKS BETWEEN 0x001853 (normal key handler) AND 0x0158DE (post-key handler) ===`);
  if (!trace.normalHandlerReached) {
    console.log('Normal key handler was not reached.');
    console.log('');
    return;
  }
  if (trace.betweenHandlerAndPostKey.length === 0) {
    console.log('No blocks logged between handler and post-key.');
    console.log('');
    return;
  }

  for (let index = 0; index < trace.betweenHandlerAndPostKey.length; index += 1) {
    const entry = trace.betweenHandlerAndPostKey[index];
    console.log(
      `${String(index + 1).padStart(3, '0')}. `
      + `step=${count(entry.step + 1)} `
      + `pc=${hex(entry.pc)} ${entry.bytes.padEnd(20)} ${entry.text} `
      + `| ${formatRegisters(entry.registers)}`,
    );
  }
  console.log('');
}

function printPostKeyTrace(trace) {
  console.log(`=== BLOCKS AFTER 0x0158DE (post-key handler) ===`);
  if (!trace.postKeyHandlerReached) {
    console.log('Post-key handler 0x0158DE was not reached.');
    console.log('');
    return;
  }

  console.log(`flag at 0xD000C2 when 0x0158DE entered: ${hexByte(trace.flagValueAtEntry)}`);
  console.log(`bit 7 of flag: ${(trace.flagValueAtEntry & 0x80) ? 'SET (will RET NZ immediately)' : 'CLEAR (will call 0x0158BC)'}`);
  console.log('');

  if (trace.postKeyEntries.length === 0) {
    console.log('No blocks logged after post-key handler.');
    console.log('');
    return;
  }

  for (let index = 0; index < Math.min(trace.postKeyEntries.length, 60); index += 1) {
    const entry = trace.postKeyEntries[index];
    console.log(
      `${String(index + 1).padStart(3, '0')}. `
      + `step=${count(entry.step + 1)} delta=${String(entry.delta).padStart(3)} `
      + `pc=${hex(entry.pc)} ${entry.bytes.padEnd(20)} ${entry.text} `
      + `| ${formatRegisters(entry.registers)}`,
    );
  }
  if (trace.postKeyEntries.length > 60) {
    console.log(`... ${count(trace.postKeyEntries.length - 60)} more entries`);
  }
  console.log('');
}

function printDynamicSummary(result, trace, mem) {
  console.log('=== DYNAMIC TRACE SUMMARY ===');
  console.log(
    `steps=${count(result.steps)} termination=${result.termination} `
    + `lastPc=${hex(result.lastPc)} loopsForced=${count(result.loopsForced)}`,
  );
  console.log(`unique_blocks=${count(trace.uniqueBlocks.size)}`);
  console.log(`dispatch_reached=${yesNo(trace.dispatchReached)}`);
  console.log(`normal_handler_reached=${yesNo(trace.normalHandlerReached)}`);
  console.log(`post_key_handler_reached=${yesNo(trace.postKeyHandlerReached)}`);
  console.log(`subroutine_0x0158BC_reached=${yesNo(trace.firstHitByPc.has(POST_KEY_SUBROUTINE))}`);
  console.log('');

  console.log('=== KEY RAM VALUES (post-run) ===');
  console.log(`0xD000C2 (IY+0x42 flag): ${hexByte(mem[FLAG_ADDR])} (bit 7 = ${(mem[FLAG_ADDR] & 0x80) ? 'SET' : 'CLEAR'})`);
  console.log(`0xD00080 (key status):   ${hexByte(mem[KEY_STATUS_ADDR])}`);
  console.log(`0xD00587 (scan code):    ${hexByte(mem[KEY_SCAN_CODE_ADDR])}`);
  console.log(`0x020100 (flash seed):   ${bytesToHex(mem, FLASH_SEED_ADDR, 3)}`);
  console.log(`0xD177BA (sysflag):      ${hexByte(mem[SYSFLAG_ADDR])}`);
  console.log('');
}

function printAssessment(trace) {
  console.log('=== ASSESSMENT ===');

  const reached0158DE = trace.postKeyHandlerReached;
  const reached0158BC = trace.firstHitByPc.has(POST_KEY_SUBROUTINE);
  const flagBit7 = trace.flagValueAtEntry !== null ? (trace.flagValueAtEntry & 0x80) !== 0 : null;

  if (!reached0158DE) {
    console.log('0x0158DE was NOT reached during this trace.');
    console.log('The post-key handler path from 0x001853 did not fire with ENTER key injection.');
  } else {
    console.log(`0x0158DE was reached. Flag 0xD000C2 = ${hexByte(trace.flagValueAtEntry)} at entry.`);

    if (flagBit7) {
      console.log('Bit 7 of (IY+0x42) was SET -> 0x0158DE returned immediately (RET NZ).');
      console.log('The subroutine 0x0158BC was NOT called because the early-exit guard fired.');
      console.log('This flag likely means "action already processed" or "re-entry guard".');
    } else {
      console.log('Bit 7 of (IY+0x42) was CLEAR -> 0x0158DE proceeded to CALL 0x0158BC.');
      if (reached0158BC) {
        console.log('0x0158BC was reached. Analyzing the result path...');

        const reachedZReturn = trace.firstHitByPc.has(0x0158F8);
        if (reachedZReturn) {
          console.log('Took the Z-return path (0x0158F8): XOR A, RET -> returned A=0, Z flag set.');
          console.log('This means 0x0158BC returned carry or zero, so no action was taken.');
        } else {
          console.log('Took the action path: SET 7,(IY+0x42), LD A,1, OR A, RET.');
          console.log('This means 0x0158BC found something to process and the flag was set to prevent re-entry.');
        }
      } else {
        console.log('0x0158BC was NOT reached despite the flag being clear. Check trace for why.');
      }
    }

    console.log('');
    console.log('Function role assessment:');
    console.log('0x0158DE is a post-key-action dispatcher that:');
    console.log('  1. Guards against re-entry via bit 7 of 0xD000C2 (IY+0x42)');
    console.log('  2. Calls 0x0158BC to check/process a pending action');
    console.log('  3. If 0x0158BC signals success (NZ and NC), sets the re-entry guard and returns A=1 (NZ)');
    console.log('  4. If 0x0158BC signals nothing to do (C or Z), returns A=0 (Z)');
    console.log('Likely role: cursor update, screen redraw trigger, or menu/action commit after key processing.');
  }
  console.log('');
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
}

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS
  ?? romModule.default?.PRELIFTED_BLOCKS
  ?? romModule.default
  ?? romModule,
);

if (!blocks || Object.keys(blocks).length === 0) {
  throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
}

console.log('=== PROBE: PHASE 378 DISASSEMBLY + TRACE 0x0158DE ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Transpiled: ${TRANSPILED_PATH}`);
console.log(`gpio=${hexByte(GPIO_VALUE)} event_loop_entry=${hex(EVENT_LOOP_ENTRY)}`);
console.log(`maxSteps=${count(EVENT_OPTS.maxSteps)} maxLoopIterations=${count(EVENT_OPTS.maxLoopIterations)}`);
console.log(`key_injection: ${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(INJECTED_SCAN_CODE)} ${hex(KEY_STATUS_ADDR)}|=${hexByte(KEY_AVAILABLE_MASK)}`);
console.log(`target: post-key handler at ${hex(POST_KEY_HANDLER)}, subroutine at ${hex(POST_KEY_SUBROUTINE)}`);
console.log(`flag address: ${hex(FLAG_ADDR)} = (IY+0x42) where IY=${hex(KEY_STATUS_ADDR)}`);
console.log('');

printDisassembly(
  `STATIC DISASSEMBLY ${hex(DISASM_START)}-${hex(DISASM_END)} (0x0158BC subroutine + 0x0158DE handler)`,
  disassembleRange(romBytes, DISASM_START, DISASM_END),
);

printDisassembly(
  `STATIC DISASSEMBLY ${hex(NORMAL_KEY_HANDLER)}-0x001880 (normal key handler head for context)`,
  disassembleRange(romBytes, NORMAL_KEY_HANDLER, 0x001880),
);

console.log('--- Running dynamic trace with ENTER key ---');
console.log('');

const { bootState, mem, result, trace } = runDynamicTrace(blocks, romBytes);

printBootSummary(bootState);
printDynamicSummary(result, trace, mem);
printCheckpoints(trace);
printFirstHitOrder(trace);
printBetweenHandlerAndPostKey(trace);
printPostKeyTrace(trace);
printAssessment(trace);
