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

const BLOCK_001718 = 0x001718;
const BLOCK_001713 = 0x001713;
const ADDR_D177BA = 0xD177BA;
const RETURN_POINT = 0x003A81;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl',
  '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im',
  'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

// --- Utility functions ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function bytesToHex(buffer, start, length) {
  const end = Math.min(buffer.length, start + Math.max(length, 0));
  return Array.from(buffer.subarray(start, end), (b) => (b & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatSigned(value) {
  const n = Number(value ?? 0);
  const abs = Math.abs(n);
  return `${n >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${indexRegister}${formatSigned(displacement)})`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function parseKey(blockKey) {
  const [addrHex, mode] = blockKey.split(':');
  return { addr: Number.parseInt(addrHex, 16) & 0xFFFFFF, mode };
}

function formatBlockRef(blockKey) {
  const { addr, mode } = parseKey(blockKey);
  return mode === MODE ? hex(addr) : `${hex(addr)}:${mode}`;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((e) => e?.id).map((e) => [e.id, e]));
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
  for (const field of CPU_SNAPSHOT_FIELDS) snapshot[field] = cpu[field];
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) cpu[field] = snapshot[field];
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) return;
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

function fallbackOperands(inst) {
  const ignored = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'decodeError', 'tag']);
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
      if (inst.direction === 'to-mem') return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
      return { mnemonic: 'ld', operands: `${inst.pair}, (${hex(inst.addr)})` };
    case 'ld-mem-pair': return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
    case 'ld-pair-ind': return { mnemonic: 'ld', operands: `${inst.pair}, (${inst.src})` };
    case 'ld-ind-pair': return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.pair}` };
    case 'ld-sp-hl': return { mnemonic: 'ld', operands: 'sp, hl' };
    case 'ld-sp-pair': return { mnemonic: 'ld', operands: `sp, ${inst.pair}` };
    case 'ld-pair-indexed': return { mnemonic: 'ld', operands: `${inst.pair}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair': return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair}` };
    case 'ld-reg-ixd': return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg': return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-ixd-imm': return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'ld-ixiy-indexed': return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy': return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
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
    case 'indexed-cb-bit': return { mnemonic: 'bit', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set': return { mnemonic: 'set', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res': return { mnemonic: 'res', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'rotate-reg': return { mnemonic: inst.op, operands: inst.reg };
    case 'rotate-ind': return { mnemonic: inst.op, operands: `(${inst.indirectRegister})` };
    case 'indexed-cb-rotate': return { mnemonic: inst.operation ?? inst.op ?? 'rotate', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
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
    default: return { mnemonic: inst?.tag ?? 'unknown', operands: fallbackOperands(inst) };
  }
}

function formatInstruction(inst) {
  const rendered = renderInstruction(inst);
  const text = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return withPrefix(inst, text);
}

// --- Static disassembly ---

function disassembleRange(memory, startAddr, opts = {}) {
  const { maxInstructions = 30, stopOnRet = true, mode = MODE } = opts;
  const rows = [];
  let pc = startAddr;

  for (let i = 0; i < maxInstructions && pc < memory.length; i++) {
    const inst = safeDecode(memory, pc, mode);
    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesToHex(memory, pc, length),
      text: formatInstruction(inst),
      tag: inst.tag,
      inst,
      decodeError: inst.decodeError ?? null,
    });

    // Stop after RET-family instructions
    if (stopOnRet && (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn')) {
      break;
    }

    pc += length;
  }

  return rows;
}

function printDisassembly(label, rows) {
  console.log(`=== ${label} ===`);
  for (const row of rows) {
    const note = row.decodeError ? ` [decode error: ${row.decodeError}]` : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${note}`);
  }
  console.log('');
}

// --- Boot phases (reused from template) ---

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
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

// --- Dynamic trace with block-level instrumentation ---

function runDynamicTrace(blocks, bootState, romBytes) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  // Prepare event loop state
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;

  // Seed flash self-test pass
  mem[0x020100] = 0x5A;
  mem[0x020101] = 0xA5;
  mem[0x020102] = 0x00;

  // Inject ENTER key
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;

  // Snapshot key RAM addresses before run
  const d177baBefore = mem[ADDR_D177BA];
  const d177bbBefore = mem[ADDR_D177BA + 1];
  const d177bcBefore = mem[ADDR_D177BA + 2];

  // Snapshot a wider range of RAM around D177BA for comparison
  const watchAddrs = [];
  for (let addr = 0xD17700; addr <= 0xD177FF; addr++) {
    watchAddrs.push(addr);
  }
  const ramBefore = {};
  for (const addr of watchAddrs) {
    ramBefore[addr] = mem[addr];
  }

  // Tracking state
  const blockLog = [];
  let block1718Entry = null;
  let block1718Exit = null;
  let block1713Entry = null;
  let reachedDispatch = false;
  let dispatchStep = null;
  let passed1718 = false;

  const DISPATCH_KEY = makeKey(0x003A7D, MODE);
  const BLOCK_1718_KEY = makeKey(BLOCK_001718, MODE);
  const BLOCK_1713_KEY = makeKey(BLOCK_001713, MODE);
  const RETURN_KEY = makeKey(RETURN_POINT, MODE);

  // Wrap compiled blocks to capture CPU state at entry/exit of 0x001718
  for (const [blockKey, original] of Object.entries(executor.compiledBlocks)) {
    executor.compiledBlocks[blockKey] = function wrappedBlock(cpu) {
      // Capture entry state for blocks of interest
      if (blockKey === BLOCK_1718_KEY && !block1718Entry) {
        block1718Entry = {
          a: cpu.a,
          f: cpu.f,
          bc: cpu._bc,
          de: cpu._de,
          hl: cpu._hl,
          sp: cpu.sp,
          step: cpu.stepCount,
          d177ba: mem[ADDR_D177BA],
          d177bb: mem[ADDR_D177BA + 1],
          d177bc: mem[ADDR_D177BA + 2],
        };
      }

      if (blockKey === BLOCK_1713_KEY && !block1713Entry) {
        block1713Entry = {
          a: cpu.a,
          f: cpu.f,
          sp: cpu.sp,
          step: cpu.stepCount,
        };
      }

      if (blockKey === DISPATCH_KEY && !reachedDispatch) {
        reachedDispatch = true;
        dispatchStep = cpu.stepCount;
      }

      const result = original(cpu);

      // Capture exit state
      if (blockKey === BLOCK_1718_KEY && !block1718Exit) {
        block1718Exit = {
          a: cpu.a,
          f: cpu.f,
          bc: cpu._bc,
          de: cpu._de,
          hl: cpu._hl,
          sp: cpu.sp,
          step: cpu.stepCount,
          d177ba: mem[ADDR_D177BA],
          d177bb: mem[ADDR_D177BA + 1],
          d177bc: mem[ADDR_D177BA + 2],
          returnedPc: typeof result === 'number' ? result : result,
        };
      }

      // Log block visits after dispatch
      if (reachedDispatch) {
        blockLog.push({
          step: cpu.stepCount,
          block: blockKey,
          a: cpu.a,
          f: cpu.f,
          nextPc: typeof result === 'number' ? result : null,
          terminal: result === -1 ? 'HALT' : (result === -2 ? 'SLEEP' : null),
        });
      }

      return result;
    };
  }

  // Run the event loop
  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    maxSteps: 200000,
    maxLoopIterations: 100000,
  });

  // Snapshot RAM after run
  const ramAfter = {};
  for (const addr of watchAddrs) {
    ramAfter[addr] = mem[addr];
  }

  // Find RAM changes in the watch range
  const ramChanges = [];
  for (const addr of watchAddrs) {
    if (ramBefore[addr] !== ramAfter[addr]) {
      ramChanges.push({ addr, before: ramBefore[addr], after: ramAfter[addr] });
    }
  }

  return {
    result,
    mem,
    block1713Entry,
    block1718Entry,
    block1718Exit,
    blockLog,
    d177baBefore,
    d177bbBefore,
    d177bcBefore,
    ramChanges,
    reachedDispatch,
    dispatchStep,
  };
}

// --- Main ---

if (!fs.existsSync(ROM_PATH)) throw new Error(`ROM not found: ${ROM_PATH}`);
if (!fs.existsSync(TRANSPILED_PATH)) throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule,
);

if (!blocks || Object.keys(blocks).length === 0) {
  throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
}

// ============================================
// PART 1: Static disassembly of 0x001713-0x001717 (function entry)
// ============================================
console.log('');
console.log('================================================================');
console.log('PART 1: Static disassembly of 0x001713 (function entry + flash self-test call)');
console.log('================================================================');

const entryRows = disassembleRange(romBytes, BLOCK_001713, { maxInstructions: 10, stopOnRet: true });
printDisassembly('0x001713 FUNCTION ENTRY', entryRows);

// ============================================
// PART 2: Static disassembly of 0x001718 (the block after flash self-test returns)
// ============================================
console.log('================================================================');
console.log('PART 2: Static disassembly of 0x001718 (post-flash-self-test block)');
console.log('================================================================');

const blockRows = disassembleRange(romBytes, BLOCK_001718, { maxInstructions: 30, stopOnRet: true });
printDisassembly('0x001718 BLOCK DISASSEMBLY', blockRows);

// Also show the raw hex bytes at 0x001718 for verification
console.log('=== RAW HEX at 0x001718 (first 48 bytes) ===');
console.log(`  ${bytesToHex(romBytes, BLOCK_001718, 48)}`);
console.log('');

// ============================================
// PART 3: Boot and dynamic trace
// ============================================
console.log('================================================================');
console.log('PART 3: Dynamic trace through block 0x001718');
console.log('================================================================');
console.log('');

const bootState = runBootPhases(blocks, romBytes);

console.log('=== BOOT SUMMARY ===');
for (const phase of bootState.phaseResults) {
  console.log(
    `${phase.label}: steps=${count(phase.result.steps)} `
    + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
  );
}
console.log('');

const trace = runDynamicTrace(blocks, bootState, romBytes);

console.log('=== EVENT LOOP RESULT ===');
console.log(`  steps=${count(trace.result.steps)} termination=${trace.result.termination} lastPc=${hex(trace.result.lastPc)}`);
console.log(`  dispatch reached: ${trace.reachedDispatch ? 'yes' : 'no'}${trace.dispatchStep !== null ? ` at step ${count(trace.dispatchStep)}` : ''}`);
console.log('');

// ============================================
// PART 4: Block 0x001713 entry state
// ============================================
console.log('=== BLOCK 0x001713 ENTRY STATE ===');
if (trace.block1713Entry) {
  const e = trace.block1713Entry;
  console.log(`  A=${hexByte(e.a)} F=${hexByte(e.f)} SP=${hex(e.sp)} step=${count(e.step)}`);
  const zFlag = (e.f & 0x40) ? 'Z' : 'NZ';
  const cFlag = (e.f & 0x01) ? 'C' : 'NC';
  console.log(`  flags: ${zFlag} ${cFlag}`);
} else {
  console.log('  NOT REACHED');
}
console.log('');

// ============================================
// PART 5: Block 0x001718 entry/exit state
// ============================================
console.log('=== BLOCK 0x001718 ENTRY STATE ===');
if (trace.block1718Entry) {
  const e = trace.block1718Entry;
  console.log(`  A=${hexByte(e.a)} F=${hexByte(e.f)} BC=${hex(e.bc)} DE=${hex(e.de)} HL=${hex(e.hl)} SP=${hex(e.sp)}`);
  console.log(`  step=${count(e.step)}`);
  const zFlag = (e.f & 0x40) ? 'Z' : 'NZ';
  const cFlag = (e.f & 0x01) ? 'C' : 'NC';
  const sFlag = (e.f & 0x80) ? 'S' : 'NS';
  console.log(`  flags: ${zFlag} ${cFlag} ${sFlag}`);
  console.log(`  mem[0xD177BA]=${hexByte(e.d177ba)} mem[0xD177BB]=${hexByte(e.d177bb)} mem[0xD177BC]=${hexByte(e.d177bc)}`);
} else {
  console.log('  NOT REACHED');
}
console.log('');

console.log('=== BLOCK 0x001718 EXIT STATE ===');
if (trace.block1718Exit) {
  const e = trace.block1718Exit;
  console.log(`  A=${hexByte(e.a)} F=${hexByte(e.f)} BC=${hex(e.bc)} DE=${hex(e.de)} HL=${hex(e.hl)} SP=${hex(e.sp)}`);
  const zFlag = (e.f & 0x40) ? 'Z' : 'NZ';
  const cFlag = (e.f & 0x01) ? 'C' : 'NC';
  const sFlag = (e.f & 0x80) ? 'S' : 'NS';
  console.log(`  flags: ${zFlag} ${cFlag} ${sFlag}`);
  console.log(`  mem[0xD177BA]=${hexByte(e.d177ba)} mem[0xD177BB]=${hexByte(e.d177bb)} mem[0xD177BC]=${hexByte(e.d177bc)}`);
  console.log(`  returned PC=${typeof e.returnedPc === 'number' ? hex(e.returnedPc) : e.returnedPc}`);
  console.log('');
  console.log(`  ** Z flag at exit: ${zFlag} **`);
  console.log(`  ** This is what 0x003A81 (JP NZ, 0x001933) tests **`);
  if (zFlag === 'NZ') {
    console.log(`  ** NZ is SET => JP NZ fires => error path to DI+HALT **`);
    console.log(`  ** Root cause: A=${hexByte(e.a)} after the OR/AND/CP inside 0x001718 left Z clear **`);
  } else {
    console.log(`  ** Z is SET => JP NZ does NOT fire => continues normally **`);
  }
} else {
  console.log('  NOT REACHED');
}
console.log('');

// ============================================
// PART 6: RAM changes in 0xD17700-0xD177FF range
// ============================================
console.log('=== RAM STATE: 0xD177BA region ===');
console.log(`  Before boot: mem[0xD177BA]=${hexByte(trace.d177baBefore)} mem[0xD177BB]=${hexByte(trace.d177bbBefore)} mem[0xD177BC]=${hexByte(trace.d177bcBefore)}`);
console.log('');

if (trace.ramChanges.length > 0) {
  console.log(`  RAM changes in 0xD17700-0xD177FF range (${trace.ramChanges.length} bytes changed):`);
  for (const change of trace.ramChanges) {
    console.log(`    ${hex(change.addr)}: ${hexByte(change.before)} -> ${hexByte(change.after)}`);
  }
} else {
  console.log('  No RAM changes detected in 0xD17700-0xD177FF range');
}
console.log('');

// ============================================
// PART 7: Post-dispatch block execution sequence (first 40 blocks)
// ============================================
console.log('=== POST-DISPATCH BLOCK SEQUENCE (first 40 entries) ===');
const relevantBlocks = trace.blockLog.slice(0, 40);
for (let i = 0; i < relevantBlocks.length; i++) {
  const entry = relevantBlocks[i];
  const { addr } = parseKey(entry.block);
  const zFlag = (entry.f & 0x40) ? 'Z' : 'NZ';
  const cFlag = (entry.f & 0x01) ? 'C' : 'NC';
  const nextLabel = entry.nextPc !== null ? hex(entry.nextPc) : (entry.terminal ?? '???');
  const marker = addr === BLOCK_001718 ? ' <<<' : (addr === RETURN_POINT ? ' <<<' : '');
  console.log(
    `  ${String(i + 1).padStart(3, '0')}. ${formatBlockRef(entry.block)} `
    + `A=${hexByte(entry.a)} F=${hexByte(entry.f)} [${zFlag} ${cFlag}] `
    + `-> ${nextLabel}${marker}`,
  );
}
console.log('');

// ============================================
// PART 8: Analysis summary
// ============================================
console.log('================================================================');
console.log('ANALYSIS SUMMARY');
console.log('================================================================');
console.log('');
console.log('The function at 0x001713:');
for (const row of entryRows) {
  console.log(`  ${hex(row.pc)}: ${row.text}`);
}
console.log('');
console.log('Block 0x001718 (fall-through after flash self-test passes):');
for (const row of blockRows) {
  console.log(`  ${hex(row.pc)}: ${row.text}`);
}
console.log('');

if (trace.block1718Entry) {
  console.log(`Value of A when 0x001718 entered: ${hexByte(trace.block1718Entry.a)}`);
  console.log(`Value at RAM 0xD177BA when 0x001718 entered: ${hexByte(trace.block1718Entry.d177ba)}`);
}
if (trace.block1718Exit) {
  const zFlag = (trace.block1718Exit.f & 0x40) ? 'Z' : 'NZ';
  console.log(`Flags when 0x001718 exits: Z=${zFlag} A=${hexByte(trace.block1718Exit.a)}`);
  console.log(`The condition at 0x003A81 (JP NZ, 0x001933): ${zFlag === 'NZ' ? 'TAKES error path' : 'Falls through (success)'}`);
  if (zFlag === 'NZ') {
    console.log('');
    console.log('TO FIX: Need to seed RAM 0xD177BA (and possibly nearby bytes) so that');
    console.log('the check inside 0x001718 results in Z flag being SET (A=0 after the test).');
    console.log(`Current value at 0xD177BA: ${hexByte(trace.block1718Exit.d177ba)}`);
  }
}
