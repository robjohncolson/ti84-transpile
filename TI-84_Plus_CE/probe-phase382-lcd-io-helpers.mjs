#!/usr/bin/env node
// Phase 382 — Trace LCD I/O helpers at 0x0060F7 and 0x0060FA
//
// Session 381 found that 0x005BB1 (LCD controller hardware init) calls:
//   0x0060F7 — "register select" — 22 times
//   0x0060FA — "data write" — 63 times
//
// This probe:
//   1. Statically disassembles ROM bytes 0x0060F7-0x006140
//   2. Identifies port I/O instructions (IN/OUT with port addresses)
//   3. Runs a dynamic boot trace (phases 1-3) logging every call to
//      0x0060F7 and 0x0060FA with register values at call time
//   4. Summarizes: what LCD controller registers are programmed, what values

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

// Boot phase addresses
const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;

const KEY_STATUS_ADDR = 0xD00080;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];

const GPIO_VALUE = 0xEE;

// Target helper addresses
const REGISTER_SELECT = 0x0060F7;
const DATA_WRITE = 0x0060FA;

// Disassembly range
const DISASM_START = 0x0060F7;
const DISASM_END = 0x006140;

// --- Utilities ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function hexWord(value) {
  return hex((Number(value) || 0) & 0xFFFF, 4);
}

function hex24(value) {
  return hex((Number(value) || 0) & 0xFFFFFF, 6);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function bytesToHex(memory, start, length) {
  const addr = (Number(start) || 0) & 0xFFFFFF;
  const end = Math.min(memory.length, addr + Math.max(length, 0));
  return Array.from(
    memory.subarray(addr, end),
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

    default: {
      const operands = fallbackOperands(inst);
      return { mnemonic: inst?.tag ?? 'unknown', operands };
    }
  }
}

function formatInstruction(inst) {
  const rendered = renderInstruction(inst);
  const text = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return withPrefix(inst, text);
}

function safeDecode(memory, pc) {
  try {
    const decoded = decodeInstruction(memory, pc, MODE);
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
    };
  }
}

// --- Part 1: Static disassembly ---

function staticDisassembly(romBytes) {
  console.log('=== Part 1: Static Disassembly 0x0060F7-0x006140 ===');
  console.log('');

  const portInstructions = [];
  const memoryMappedAccesses = [];
  let pc = DISASM_START;

  while (pc < DISASM_END) {
    const inst = safeDecode(romBytes, pc);
    const length = Math.max(inst.length ?? 1, 1);
    const bytes = bytesToHex(romBytes, pc, length);
    const text = formatInstruction(inst);
    const note = inst.decodeError ? ` [decode error: ${inst.decodeError}]` : '';

    // Mark the entry points
    let label = '';
    if (pc === REGISTER_SELECT) label = ' <-- 0x0060F7 (register select entry)';
    if (pc === DATA_WRITE) label = ' <-- 0x0060FA (data write entry)';

    console.log(`  ${hex(pc)} ${bytes.padEnd(24)} ${text}${note}${label}`);

    // Collect port I/O instructions
    if (inst.tag === 'in-reg' || inst.tag === 'out-reg' ||
        inst.tag === 'in-imm' || inst.tag === 'out-imm' ||
        inst.tag === 'in0' || inst.tag === 'out0') {
      const direction = inst.tag.startsWith('in') ? 'IN' : 'OUT';
      portInstructions.push({ pc, direction, port: inst.port ?? 'C', text });
    }

    // Collect memory-mapped I/O (0xF90000-0xFFFFFF range)
    if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xF00000) {
      memoryMappedAccesses.push({ pc, direction: 'WRITE', addr: inst.addr, text });
    }
    if (inst.tag === 'ld-reg-mem' && inst.addr >= 0xF00000) {
      memoryMappedAccesses.push({ pc, direction: 'READ', addr: inst.addr, text });
    }
    if (inst.tag === 'ld-pair-mem' && inst.addr >= 0xF00000) {
      const dir = inst.direction === 'to-mem' ? 'WRITE' : 'READ';
      memoryMappedAccesses.push({ pc, direction: dir, addr: inst.addr, text });
    }
    if (inst.tag === 'ld-mem-pair' && inst.addr >= 0xF00000) {
      memoryMappedAccesses.push({ pc, direction: 'WRITE', addr: inst.addr, text });
    }

    pc += length;
  }

  console.log('');

  // Summarize port I/O
  console.log('=== Part 2: Port I/O Instructions Found ===');
  console.log('');
  if (portInstructions.length === 0) {
    console.log('  No port I/O instructions found in this range.');
    console.log('  (LCD access may use memory-mapped I/O instead of port I/O)');
  } else {
    for (const entry of portInstructions) {
      console.log(`  ${hex(entry.pc)} ${entry.direction} port=${typeof entry.port === 'number' ? hexByte(entry.port) : entry.port} | ${entry.text}`);
    }
  }
  console.log('');

  // Summarize memory-mapped accesses
  console.log('=== Part 3: Memory-Mapped I/O Accesses (>= 0xF00000) ===');
  console.log('');
  if (memoryMappedAccesses.length === 0) {
    console.log('  No direct memory-mapped I/O found via absolute addresses.');
    console.log('  (May use indirect addressing via HL or IX/IY)');
  } else {
    for (const entry of memoryMappedAccesses) {
      console.log(`  ${hex(entry.pc)} ${entry.direction} addr=${hex(entry.addr)} | ${entry.text}`);
    }
  }
  console.log('');

  return { portInstructions, memoryMappedAccesses };
}

// --- Part 4: Dynamic boot trace ---

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

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  // Phase 1: Z80 mode cold boot
  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  // Phase 2: ADL mode OS init
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  // Phase 3: LCD hardware init chain
  cpu.mbase = 0xD0;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    mem,
    cpu,
    executor,
    peripherals,
  };
}

function runDynamicTrace(blocks, romBytes) {
  console.log('=== Part 4: Dynamic Boot Trace — Calls to 0x0060F7 / 0x0060FA ===');
  console.log('');

  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });

  // Track all I/O writes during boot for LCD port analysis
  const ioLog = [];
  const origWrite = peripherals.write.bind(peripherals);
  const origRead = peripherals.read.bind(peripherals);
  peripherals.write = (port, value) => {
    ioLog.push({ port: port & 0xFFFF, value: value & 0xFF, direction: 'OUT' });
    return origWrite(port, value);
  };
  peripherals.read = (port) => {
    const val = origRead(port);
    ioLog.push({ port: port & 0xFFFF, value: val & 0xFF, direction: 'IN' });
    return val;
  };

  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  // Collect calls to the helper addresses
  const helperCalls = [];
  let currentPhase = 0;

  function onBlockCallback(pc, _mode, _meta, step) {
    if (pc === REGISTER_SELECT || pc === DATA_WRITE) {
      helperCalls.push({
        phase: currentPhase,
        step,
        target: pc,
        label: pc === REGISTER_SELECT ? 'register-select' : 'data-write',
        a: cpu.a & 0xFF,
        f: cpu.f & 0xFF,
        bc: cpu._bc & 0xFFFFFF,
        de: cpu._de & 0xFFFFFF,
        hl: cpu._hl & 0xFFFFFF,
        sp: cpu.sp & 0xFFFFFF,
        ix: cpu._ix & 0xFFFFFF,
        iy: cpu._iy & 0xFFFFFF,
        ioLogIndex: ioLog.length,
      });
    }
  }

  // Phase 1: Z80 mode cold boot
  currentPhase = 1;
  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', {
    ...PHASE1_OPTS,
    onBlock: onBlockCallback,
  });

  // Phase 2: ADL mode OS init
  currentPhase = 2;
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, {
    ...PHASE2_OPTS,
    onBlock: onBlockCallback,
  });

  // Phase 3: LCD hardware init chain
  currentPhase = 3;
  cpu.mbase = 0xD0;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, {
    ...PHASE3_OPTS,
    onBlock: onBlockCallback,
  });

  // Print phase results
  console.log('--- Boot Phase Results ---');
  const phases = [
    { label: 'Phase 1', result: phase1 },
    { label: 'Phase 2', result: phase2 },
    { label: 'Phase 3', result: phase3 },
  ];
  for (const phase of phases) {
    console.log(
      `  ${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');

  // Print all helper calls
  const regSelCalls = helperCalls.filter((c) => c.target === REGISTER_SELECT);
  const dataWrCalls = helperCalls.filter((c) => c.target === DATA_WRITE);

  console.log(`--- Helper Calls Summary ---`);
  console.log(`  Total calls to 0x0060F7 (register-select): ${regSelCalls.length}`);
  console.log(`  Total calls to 0x0060FA (data-write):       ${dataWrCalls.length}`);
  console.log('');

  // Print all calls with register state
  console.log('--- All Helper Calls (chronological) ---');
  console.log('  #   phase  step       target     label             A     BC       DE       HL');
  for (let i = 0; i < helperCalls.length; i++) {
    const c = helperCalls[i];
    console.log(
      `  ${String(i).padStart(3)}  ph${c.phase}   ${String(c.step).padStart(8)}  ${hex(c.target)}  ${c.label.padEnd(16)}  `
      + `${hexByte(c.a)}  ${hex24(c.bc)}  ${hex24(c.de)}  ${hex24(c.hl)}`,
    );
  }
  console.log('');

  // Pair up register-select + data-write sequences
  // The pattern is: call register-select (A = register index),
  // then call data-write (A = value to write)
  console.log('--- LCD Register Programming Sequence ---');
  console.log('  The protocol: register-select sets the register index, data-write sends the value.');
  console.log('  Looking for paired register-select -> data-write sequences...');
  console.log('');

  const registerWrites = [];
  for (let i = 0; i < helperCalls.length; i++) {
    if (helperCalls[i].target === REGISTER_SELECT && i + 1 < helperCalls.length) {
      const next = helperCalls[i + 1];
      if (next.target === DATA_WRITE) {
        registerWrites.push({
          regIndex: helperCalls[i].a,
          dataValue: next.a,
          regBC: helperCalls[i].bc,
          dataBC: next.bc,
          regDE: helperCalls[i].de,
          dataDE: next.de,
          regHL: helperCalls[i].hl,
          dataHL: next.hl,
          phase: helperCalls[i].phase,
        });
      }
    }
  }

  if (registerWrites.length > 0) {
    console.log('  #   phase  reg_idx  data_val  | reg_idx description');
    for (let i = 0; i < registerWrites.length; i++) {
      const w = registerWrites[i];
      const regDesc = describeRegister(w.regIndex);
      console.log(
        `  ${String(i).padStart(3)}  ph${w.phase}   ${hexByte(w.regIndex)}     ${hexByte(w.dataValue)}`
        + `      | ${regDesc}`,
      );
    }
  } else {
    console.log('  No paired register-select -> data-write sequences found.');
    console.log('  The value may be passed in a different register (B, C, HL, etc.).');
    console.log('');
    console.log('  Alternative analysis: checking B and C registers...');
    for (let i = 0; i < helperCalls.length; i++) {
      const c = helperCalls[i];
      const b = (c.bc >> 8) & 0xFF;
      const cReg = c.bc & 0xFF;
      console.log(
        `  ${String(i).padStart(3)}  ${c.label.padEnd(16)}  A=${hexByte(c.a)}  B=${hexByte(b)}  C=${hexByte(cReg)}`
        + `  DE=${hex24(c.de)}  HL=${hex24(c.hl)}`,
      );
    }
  }
  console.log('');

  // Summarize unique registers programmed
  if (registerWrites.length > 0) {
    const regMap = new Map();
    for (const w of registerWrites) {
      if (!regMap.has(w.regIndex)) {
        regMap.set(w.regIndex, []);
      }
      regMap.get(w.regIndex).push(w.dataValue);
    }

    console.log('--- LCD Register Summary (unique registers) ---');
    const sortedRegs = [...regMap.entries()].sort((a, b) => a[0] - b[0]);
    for (const [regIdx, values] of sortedRegs) {
      const desc = describeRegister(regIdx);
      const valStr = values.map((v) => hexByte(v)).join(', ');
      console.log(`  Register ${hexByte(regIdx)}: values=[${valStr}] | ${desc}`);
    }
    console.log('');
  }

  // Also log I/O during the helper call windows
  console.log('--- I/O Port Activity During Boot ---');
  const portCounts = new Map();
  for (const entry of ioLog) {
    const key = `${entry.direction} port ${hexWord(entry.port)}`;
    portCounts.set(key, (portCounts.get(key) || 0) + 1);
  }
  const sortedPorts = [...portCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`  Total I/O operations during boot: ${ioLog.length}`);
  for (const [key, cnt] of sortedPorts.slice(0, 30)) {
    console.log(`    ${key}: ${cnt} times`);
  }
  console.log('');

  return { helperCalls, registerWrites, ioLog, phases };
}

// Known LCD controller register descriptions (common for ILI9341/ILI9340/ST7789)
function describeRegister(regIndex) {
  const LCD_REGS = {
    0x00: 'NOP / ID read',
    0x01: 'Software Reset',
    0x04: 'Read Display ID',
    0x09: 'Read Display Status',
    0x0A: 'Read Display Power Mode',
    0x0B: 'Read Display MADCTL',
    0x0C: 'Read Display Pixel Format',
    0x0D: 'Read Display Image Format',
    0x0E: 'Read Display Signal Mode',
    0x0F: 'Read Display Self-Diagnostic',
    0x10: 'Sleep In (enter sleep)',
    0x11: 'Sleep Out (exit sleep)',
    0x12: 'Partial Mode On',
    0x13: 'Normal Display Mode On',
    0x20: 'Display Inversion Off',
    0x21: 'Display Inversion On',
    0x26: 'Gamma Set',
    0x28: 'Display Off',
    0x29: 'Display On',
    0x2A: 'Column Address Set',
    0x2B: 'Page Address Set',
    0x2C: 'Memory Write',
    0x2E: 'Memory Read',
    0x30: 'Partial Area',
    0x33: 'Vertical Scrolling Definition',
    0x36: 'Memory Access Control (MADCTL)',
    0x37: 'Vertical Scrolling Start Address',
    0x3A: 'Pixel Format Set (COLMOD)',
    0x44: 'Set Tear Scanline',
    0xB0: 'RGB Interface Signal Control',
    0xB1: 'Frame Rate Control (Normal)',
    0xB2: 'Frame Rate Control (Idle)',
    0xB3: 'Frame Rate Control (Partial)',
    0xB4: 'Display Inversion Control',
    0xB5: 'Blanking Porch Control',
    0xB6: 'Display Function Control',
    0xB7: 'Entry Mode Set',
    0xC0: 'Power Control 1',
    0xC1: 'Power Control 2',
    0xC2: 'Power Control 3 (Normal)',
    0xC3: 'Power Control 4 (Idle)',
    0xC4: 'Power Control 5 (Partial)',
    0xC5: 'VCOM Control 1',
    0xC7: 'VCOM Control 2',
    0xCF: 'Power Control B',
    0xD0: 'NV Memory Write',
    0xD3: 'Read ID4',
    0xDA: 'Read ID1',
    0xDB: 'Read ID2',
    0xDC: 'Read ID3',
    0xE0: 'Positive Gamma Correction',
    0xE1: 'Negative Gamma Correction',
    0xE8: 'Driver Timing Control A',
    0xE9: 'Driver Timing Control A (cont.)',
    0xEA: 'Driver Timing Control B',
    0xED: 'Power On Sequence Control',
    0xF2: 'Enable 3G',
    0xF6: 'Interface Control',
    0xF7: 'Pump Ratio Control',
  };
  return LCD_REGS[regIndex] ?? `unknown register ${hexByte(regIndex)}`;
}

// --- Main ---

async function main() {
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  console.log('=== PROBE: PHASE 382 — LCD I/O HELPERS 0x0060F7 / 0x0060FA ===');
  console.log(`ROM bytes loaded: ${romBytes.length.toLocaleString('en-US')}`);
  console.log('');

  // Part 1-3: Static disassembly and port/MMIO analysis
  const staticResult = staticDisassembly(romBytes);

  // Part 4: Dynamic trace (requires transpiled ROM)
  if (!fs.existsSync(TRANSPILED_PATH)) {
    console.log('=== SKIPPING dynamic trace: ROM.transpiled.js not found ===');
    console.log(`  Generate it with: node scripts/transpile-ti84-rom.mjs`);
    console.log('');
  } else {
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

    const dynamicResult = runDynamicTrace(blocks, romBytes);

    // Final summary
    console.log('=== FINAL SUMMARY ===');
    console.log('');
    console.log(`  Static disassembly: ${DISASM_END - DISASM_START} bytes from ${hex(DISASM_START)} to ${hex(DISASM_END)}`);
    console.log(`  Port I/O instructions in range: ${staticResult.portInstructions.length}`);
    console.log(`  Memory-mapped accesses in range: ${staticResult.memoryMappedAccesses.length}`);
    console.log(`  Dynamic calls to register-select (0x0060F7): ${dynamicResult.helperCalls.filter((c) => c.target === REGISTER_SELECT).length}`);
    console.log(`  Dynamic calls to data-write (0x0060FA): ${dynamicResult.helperCalls.filter((c) => c.target === DATA_WRITE).length}`);
    console.log(`  Paired register-write operations: ${dynamicResult.registerWrites.length}`);
    console.log(`  Total I/O port operations during boot: ${dynamicResult.ioLog.length}`);

    if (dynamicResult.registerWrites.length > 0) {
      const uniqueRegs = new Set(dynamicResult.registerWrites.map((w) => w.regIndex));
      console.log(`  Unique LCD registers programmed: ${uniqueRegs.size}`);
      console.log(`  Register indices: ${[...uniqueRegs].sort((a, b) => a - b).map((r) => hexByte(r)).join(', ')}`);
    }
    console.log('');
  }

  console.log('=== END PROBE ===');
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
