#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const transpiled = await import('./ROM.transpiled.js');
const BLOCKS = normalizeBlocks(
  transpiled.PRELIFTED_BLOCKS ??
  transpiled.default?.PRELIFTED_BLOCKS ??
  transpiled.default ??
  transpiled,
);
const rom = readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFFE;

const STACK_TOP = 0xD1A87E;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const MBASE = 0xD0;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const EVENT_LOOP = 0x082BE2;

const TARGET_ADDR = 0xD003E0;
const TARGET_BIT = 3;
const TARGET_MASK = 1 << TARGET_BIT;

const DISASM_START = 0x04EE00;
const DISASM_END = 0x04EF00;
const FUNC_REGION_START = 0x04EE00;
const FUNC_REGION_END = 0x04EE40;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAGE_SEGMENT_LIMIT = 2000;
const STAGE_LOOP_LIMIT = 500;
const OS_LOOP_LIMIT = 8192;
const WATCH_STEPS = 10000;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function normalizeBlocks(raw) {
  return Array.isArray(raw)
    ? Object.fromEntries(raw.filter((block) => block?.id).map((block) => [block.id, block]))
    : (raw ?? {});
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, 0x400000)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 12));
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(STAGE_SEGMENT_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
      maxLoopIterations,
    });
    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;
    if (result.termination !== 'max_steps') break;
  }

  return {
    steps: totalSteps,
    lastPc: (lastResult.lastPc ?? currentPc) & 0xFFFFFF,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function coldBoot(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 3));

  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 3));

  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc) },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: OS_LOOP_LIMIT,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEM_INIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEM_INIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEM_INIT_RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    steps: result?.steps ?? null,
    termination: returned ? 'sentinel' : (result?.termination ?? null),
  };
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  restoreCpu(cpu, snapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 12));
}

function runHomescreenStages(executor, cpu, mem, cpuSnapshot) {
  const stages = [];

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s1 = runStageInSegments(executor, STAGE_1_ENTRY, 'adl', 30000, STAGE_LOOP_LIMIT);
  stages.push({ label: 'stage1_statusbar', steps: s1.steps, lastPc: hex(s1.lastPc), termination: s1.termination });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  mem[0xD0009B] &= ~0x40;
  const s2 = runStageInSegments(executor, STAGE_2_ENTRY, 'adl', 30000, STAGE_LOOP_LIMIT);
  stages.push({ label: 'stage2_statusdots', steps: s2.steps, lastPc: hex(s2.lastPc), termination: s2.termination });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s3 = runStageInSegments(executor, STAGE_3_ENTRY, 'adl', 50000, STAGE_LOOP_LIMIT);
  stages.push({ label: 'stage3_homerow', steps: s3.steps, lastPc: hex(s3.lastPc), termination: s3.termination });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s4 = runStageInSegments(executor, STAGE_4_ENTRY, 'adl', 50000, STAGE_LOOP_LIMIT);
  stages.push({ label: 'stage4_history', steps: s4.steps, lastPc: hex(s4.lastPc), termination: s4.termination });

  return { stages, finalCpuSnapshot: snapshotCpu(cpu) };
}

// ─── Part A: Static disassembly ───

function tryDecode(pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc, mode);
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  const tag = inst.tag;

  // Handle common tags with readable output
  switch (tag) {
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': {
      const d = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${d})`;
    }
    case 'ld-ixd-reg': {
      const d = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${d}), ${String(inst.src).toUpperCase()}`;
    }
    case 'ld-pair-mem':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.reg || 'HL').toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (HL)`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (HL)`;
    case 'bit-set-ind':
      return `${prefix}SET ${inst.bit}, (HL)`;
    case 'bit-res-ind':
      return `${prefix}RES ${inst.bit}, (HL)`;
    case 'rotate-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (HL)`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'neg':
      return `${prefix}NEG`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'daa':
      return `${prefix}DAA`;
    case 'im':
      return `${prefix}IM ${inst.mode}`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'cpi':
      return `${prefix}CPI`;
    case 'cpd':
      return `${prefix}CPD`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'in':
      return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out':
      return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}+${inst.displacement}`;
    case 'tst-imm':
      return `${prefix}TST A, ${hexByte(inst.value)}`;
    default:
      return `${prefix}[${tag}]`;
  }
}

function isTerminator(inst) {
  if (!inst) return false;
  return ['ret', 'jp', 'jp-indirect', 'halt'].includes(inst.tag);
}

function staticDisassembly() {
  console.log('=== Part A: Static Disassembly of 0x04EE00-0x04EF00 ===\n');

  // First, find function boundary by looking for RET before 0x04EE1B
  console.log('--- Scanning for function boundary (RET before 0x04EE1B) ---');
  let entryPoint = null;
  let prevRet = null;

  for (let pc = DISASM_START; pc < 0x04EE1B;) {
    const inst = tryDecode(pc, 'adl');
    if (!inst) {
      pc++;
      continue;
    }
    if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-indirect') {
      prevRet = inst.pc + inst.length;
    }
    pc = inst.pc + Math.max(1, inst.length);
  }

  if (prevRet !== null && prevRet <= 0x04EE1B) {
    entryPoint = prevRet;
    console.log(`  Found terminator ending at ${hex(prevRet)}, likely entry point: ${hex(entryPoint)}`);
  } else {
    entryPoint = 0x04EE1B;
    console.log(`  No terminator found before 0x04EE1B, using 0x04EE1B as entry`);
  }

  // Full disassembly of the region
  console.log('\n--- Full disassembly 0x04EE00-0x04EF00 ---');
  const instructions = [];
  let pc = DISASM_START;

  while (pc < DISASM_END) {
    const inst = tryDecode(pc, 'adl');
    if (!inst) {
      console.log(`  ${hex(pc)}: ${bytesAt(rom, pc, 1).padEnd(20)} (decode error)`);
      pc++;
      continue;
    }
    const bytes = bytesAt(rom, inst.pc, inst.length);
    const text = formatInstruction(inst);
    const marker = inst.pc === 0x04EE3E ? ' <<<< SET 4,A + LD target' : '';
    console.log(`  ${hex(inst.pc)}: ${bytes.padEnd(20)} ${text}${marker}`);
    instructions.push({ pc: inst.pc, inst, text, bytes });
    pc = inst.pc + Math.max(1, inst.length);
  }

  // Analyze what modifies A before 0x04EE3E
  console.log('\n--- Instructions that modify A before LD (0xD003E0),A ---');
  const targetPc = 0x04EE3E;
  const relevantInsts = instructions.filter((i) => i.pc >= (entryPoint ?? DISASM_START) && i.pc < targetPc);

  for (const { pc: ipc, inst, text } of relevantInsts) {
    const tag = inst.tag;
    let modifiesA = false;

    // Check if this instruction modifies the A register
    if (tag === 'ld-reg-imm' && inst.dest === 'a') modifiesA = true;
    if (tag === 'ld-reg-reg' && inst.dest === 'a') modifiesA = true;
    if (tag === 'ld-reg-mem' && inst.dest === 'a') modifiesA = true;
    if (tag === 'ld-reg-ind' && inst.dest === 'a') modifiesA = true;
    if (tag === 'ld-reg-ixd' && inst.dest === 'a') modifiesA = true;
    if (tag === 'alu-reg' || tag === 'alu-imm' || tag === 'alu-ind') modifiesA = true;
    if (tag === 'bit-set' && inst.reg === 'a') modifiesA = true;
    if (tag === 'bit-res' && inst.reg === 'a') modifiesA = true;
    if (tag === 'rotate-reg' && inst.reg === 'a') modifiesA = true;
    if (tag === 'rla' || tag === 'rra' || tag === 'rlca' || tag === 'rrca') modifiesA = true;
    if (tag === 'cpl' || tag === 'neg' || tag === 'daa') modifiesA = true;
    if (tag === 'inc-reg' && inst.reg === 'a') modifiesA = true;
    if (tag === 'dec-reg' && inst.reg === 'a') modifiesA = true;
    if (tag === 'pop' && inst.pair === 'af') modifiesA = true;
    if (tag === 'ex-af') modifiesA = true;
    if (tag === 'in') modifiesA = true;

    if (modifiesA) {
      console.log(`  ${hex(ipc)}: ${text}  (modifies A)`);
    }
  }

  // Check specifically for OR/AND/SET that could set BIT 3
  console.log('\n--- Instructions that could SET BIT 3 of A ---');
  for (const { pc: ipc, inst, text } of relevantInsts) {
    const tag = inst.tag;
    let setsBit3 = false;
    let reason = '';

    if (tag === 'bit-set' && inst.reg === 'a' && inst.bit === 3) {
      setsBit3 = true;
      reason = 'SET 3,A directly';
    }
    if (tag === 'alu-imm' && inst.op === 'or' && (inst.value & 0x08) !== 0) {
      setsBit3 = true;
      reason = `OR with value that has BIT 3 set (${hexByte(inst.value)})`;
    }
    if (tag === 'ld-reg-imm' && inst.dest === 'a' && (inst.value & 0x08) !== 0) {
      setsBit3 = true;
      reason = `LD A with value that has BIT 3 set (${hexByte(inst.value)})`;
    }
    if (tag === 'bit-set' && inst.reg === 'a' && inst.bit === 4) {
      reason = 'SET 4,A — sets BIT 4 but NOT BIT 3';
      console.log(`  ${hex(ipc)}: ${text}  (${reason})`);
    }

    if (setsBit3) {
      console.log(`  ${hex(ipc)}: ${text}  ** ${reason} **`);
    }
  }

  return { entryPoint, instructions };
}

// ─── Part B: Find callers ───

function findCallers() {
  console.log('\n=== Part B: Find Callers of 0x04EE00-0x04EE40 ===\n');

  const callSites = [];
  const ptrRefs = [];

  // Search for CALL (CD xx EE 04) and JP (C3 xx EE 04) patterns
  for (let targetByte = 0x00; targetByte <= 0x40; targetByte++) {
    const targetAddr = FUNC_REGION_START + targetByte;
    const lo = targetAddr & 0xFF;
    const mid = (targetAddr >>> 8) & 0xFF;
    const hi = (targetAddr >>> 16) & 0xFF;

    // CALL target (CD lo mid hi)
    for (let i = 0; i <= rom.length - 4; i++) {
      if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
        callSites.push({ siteAddr: i, opcode: 'CALL', target: targetAddr });
      }
      // JP target (C3 lo mid hi)
      if (rom[i] === 0xC3 && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
        callSites.push({ siteAddr: i, opcode: 'JP', target: targetAddr });
      }
    }
  }

  // Also search for conditional CALL/JP variants
  const condCallOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]; // CALL NZ/Z/NC/C/PO/PE/P/M
  const condJpOpcodes = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]; // JP NZ/Z/NC/C/PO/PE/P/M
  const condNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  for (let targetByte = 0x00; targetByte <= 0x40; targetByte++) {
    const targetAddr = FUNC_REGION_START + targetByte;
    const lo = targetAddr & 0xFF;
    const mid = (targetAddr >>> 8) & 0xFF;
    const hi = (targetAddr >>> 16) & 0xFF;

    for (let i = 0; i <= rom.length - 4; i++) {
      for (let ci = 0; ci < condCallOpcodes.length; ci++) {
        if (rom[i] === condCallOpcodes[ci] && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
          callSites.push({ siteAddr: i, opcode: `CALL ${condNames[ci]}`, target: targetAddr });
        }
      }
      for (let ci = 0; ci < condJpOpcodes.length; ci++) {
        if (rom[i] === condJpOpcodes[ci] && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
          callSites.push({ siteAddr: i, opcode: `JP ${condNames[ci]}`, target: targetAddr });
        }
      }
    }
  }

  // Search for 3-byte pointer references (little-endian) in range
  for (let targetByte = 0x00; targetByte <= 0x40; targetByte++) {
    const targetAddr = FUNC_REGION_START + targetByte;
    const lo = targetAddr & 0xFF;
    const mid = (targetAddr >>> 8) & 0xFF;
    const hi = (targetAddr >>> 16) & 0xFF;

    for (let i = 0; i <= rom.length - 3; i++) {
      if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
        // Skip if this is one of the call/jp sites already found
        const isCallSite = callSites.some((cs) => cs.siteAddr === i - 1);
        if (!isCallSite) {
          ptrRefs.push({ refAddr: i, targetAddr });
        }
      }
    }
  }

  // Deduplicate and sort
  callSites.sort((a, b) => a.siteAddr - b.siteAddr);
  ptrRefs.sort((a, b) => a.refAddr - b.refAddr);

  console.log(`--- CALL/JP sites (${callSites.length}) ---`);
  for (const site of callSites) {
    const context = bytesAt(rom, site.siteAddr, 4);
    // Try to decode the instruction at the call site for more context
    const inst = tryDecode(site.siteAddr, 'adl');
    const decoded = inst ? formatInstruction(inst) : '(decode failed)';
    console.log(`  ${hex(site.siteAddr)}: ${context}  ${site.opcode} ${hex(site.target)}  decoded: ${decoded}`);
  }

  console.log(`\n--- 3-byte pointer references (${ptrRefs.length}, excluding call/jp sites) ---`);
  for (const ref of ptrRefs.slice(0, 30)) {
    const context = bytesAt(rom, ref.refAddr - 4, 11);
    console.log(`  ${hex(ref.refAddr)}: target=${hex(ref.targetAddr)}  context: ${context}`);
  }
  if (ptrRefs.length > 30) {
    console.log(`  ... and ${ptrRefs.length - 30} more`);
  }

  return { callSites, ptrRefs };
}

// ─── Part C: Dynamic trace ───

function traceFromEntry(label, funcEntry, executor, cpu, mem, postMemInitSnapshot, aInit) {
  console.log(`\n--- ${label}: entry=${hex(funcEntry)} A=${hexByte(aInit)} ---`);

  // Restore CPU state from post-memInit
  restoreCpu(cpu, postMemInitSnapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu.a = aInit;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 12));

  // Push return sentinel
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, TRACE_RET);

  // Clear D003E0 before trace
  mem[TARGET_ADDR] = 0x00;

  const TRACE_STEPS = 500;
  const blocksVisited = [];
  let aAtTarget = null;
  let reachedTarget = false;
  let termination = 'max_steps';
  let steps = 0;
  let lastPc = funcEntry;

  try {
    const result = executor.runFrom(funcEntry, 'adl', {
      maxSteps: TRACE_STEPS,
      maxLoopIterations: 50,
      onBlock(pc, _mode, _meta, step) {
        const maskedPc = pc & 0xFFFFFF;
        blocksVisited.push(hex(maskedPc));
        if (maskedPc === TRACE_RET) throw new Error('__TRACE_RET__');

        // Check if we're at or near the SET 4,A + LD instruction at 0x04EE3E
        if (maskedPc >= 0x04EE3C && maskedPc <= 0x04EE42) {
          aAtTarget = cpu.a & 0xFF;
          reachedTarget = true;
        }
      },
      onMissingBlock(pc) {
        const maskedPc = pc & 0xFFFFFF;
        blocksVisited.push(`MISSING:${hex(maskedPc)}`);
        if (maskedPc === TRACE_RET) throw new Error('__TRACE_RET__');
      },
    });
    termination = result.termination ?? 'max_steps';
    steps = result.steps ?? 0;
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
  } catch (error) {
    if (error?.message === '__TRACE_RET__') {
      termination = 'return_sentinel';
    } else {
      termination = `exception: ${error?.message ?? String(error)}`;
    }
  }

  const valueWrittenToTarget = mem[TARGET_ADDR] & 0xFF;

  console.log(`  steps=${steps} termination=${termination} lastPc=${hex(lastPc)}`);
  console.log(`  blocks visited (${blocksVisited.length}): ${blocksVisited.slice(0, 30).join(', ')}${blocksVisited.length > 30 ? ' ...' : ''}`);
  console.log(`  reached 0x04EE3E region: ${reachedTarget}`);
  if (reachedTarget) {
    console.log(`  A value at target: ${hexByte(aAtTarget)} (BIT 3 ${(aAtTarget & TARGET_MASK) ? 'SET' : 'CLEAR'}, BIT 4 ${(aAtTarget & 0x10) ? 'SET' : 'CLEAR'})`);
  }
  console.log(`  D003E0 final value: ${hexByte(valueWrittenToTarget)} (BIT 3 ${(valueWrittenToTarget & TARGET_MASK) ? 'SET' : 'CLEAR'})`);
}

function dynamicTrace(executor, cpu, mem, postMemInitSnapshot, entryPoint) {
  console.log('\n=== Part C: Dynamic Trace of Function ===\n');

  // The disassembly shows:
  //   0x04EE1B: JR 0x04EE00 -> POP HL + RET (dead end, doesn't reach 0x04EE3E)
  //   0x04EE33: CALL from 0x04E9FD — this is the real entry to the D003E0 write path
  //   0x04EE06: JP Z from 0x04EDDF — another entry path
  //
  // The code at 0x04EE33:
  //   0x04EE33: PUSH AF          ; save A from caller
  //   0x04EE34: CALL 0x052004    ; call subroutine
  //   0x04EE38: POP BC           ; restore saved A into B
  //   0x04EE39: LD A, B          ; A = saved value from caller
  //   0x04EE3A: JR Z, 0x04EE3E  ; if Z flag from CALL result, skip SET 4
  //   0x04EE3C: SET 4, A         ; set BIT 4 of A
  //   0x04EE3E: LD (D003E0), A   ; write to target
  //
  // So A on entry to 0x04EE33 is PRESERVED through PUSH/POP and becomes the
  // value written to D003E0. BIT 3 must be set in A by the CALLER (0x04E9FD).

  console.log('  Key insight: 0x04EE33 preserves caller A via PUSH AF / POP BC / LD A,B');
  console.log('  BIT 3 must already be set in A by the caller at 0x04E9FD\n');

  // Trace 0x04EE1B (the original suspected entry — actually a dead end)
  const aValues = [0x00, 0x08, 0x0F, 0xFF];
  for (const aInit of aValues) {
    traceFromEntry('0x04EE1B (JR->POP HL->RET)', 0x04EE1B, executor, cpu, mem, postMemInitSnapshot, aInit);
  }

  // Trace 0x04EE33 (the REAL entry to the D003E0 write path)
  for (const aInit of aValues) {
    traceFromEntry('0x04EE33 (CALL target from 0x04E9FD)', 0x04EE33, executor, cpu, mem, postMemInitSnapshot, aInit);
  }

  // Trace 0x04EE06 (JP Z target from 0x04EDDF — alternate path)
  for (const aInit of aValues) {
    traceFromEntry('0x04EE06 (JP Z from 0x04EDDF)', 0x04EE06, executor, cpu, mem, postMemInitSnapshot, aInit);
  }

  // Also trace the caller at 0x04E9FD to see what A it passes
  console.log('\n--- Disassembly of caller context around 0x04E9FD ---');
  let callerPc = 0x04E9E0;
  while (callerPc < 0x04EA10) {
    const inst = tryDecode(callerPc, 'adl');
    if (!inst) {
      console.log(`  ${hex(callerPc)}: (decode error)`);
      callerPc++;
      continue;
    }
    const bytes = bytesAt(rom, inst.pc, inst.length);
    const text = formatInstruction(inst);
    const marker = inst.pc === 0x04E9FD ? ' <<<< CALL 0x04EE33' : '';
    console.log(`  ${hex(inst.pc)}: ${bytes.padEnd(20)} ${text}${marker}`);
    callerPc = inst.pc + Math.max(1, inst.length);
  }

  // Also trace from the caller 0x04E9FD itself with more steps
  for (const aInit of [0x00, 0x08]) {
    traceFromEntry('0x04E9FD (caller of 0x04EE33)', 0x04E9FD, executor, cpu, mem, postMemInitSnapshot, aInit);
  }

  // Disassemble around 0x04EDDF (the other call site)
  console.log('\n--- Disassembly of caller context around 0x04EDDF ---');
  let caller2Pc = 0x04EDC0;
  while (caller2Pc < 0x04EE06) {
    const inst = tryDecode(caller2Pc, 'adl');
    if (!inst) {
      console.log(`  ${hex(caller2Pc)}: (decode error)`);
      caller2Pc++;
      continue;
    }
    const bytes = bytesAt(rom, inst.pc, inst.length);
    const text = formatInstruction(inst);
    const marker = inst.pc === 0x04EDDF ? ' <<<< JP Z, 0x04EE06' : '';
    console.log(`  ${hex(inst.pc)}: ${bytes.padEnd(20)} ${text}${marker}`);
    caller2Pc = inst.pc + Math.max(1, inst.length);
  }

  // Also check what's at 0x04EE32 (LD A,(BC)) — what address is in BC?
  // And 0x052004 (the CALL target from 0x04EE34)
  console.log('\n--- Disassembly of subroutine 0x052004 (called from 0x04EE34) ---');
  let subPc = 0x052004;
  for (let i = 0; i < 20 && subPc < 0x052060; i++) {
    const inst = tryDecode(subPc, 'adl');
    if (!inst) {
      console.log(`  ${hex(subPc)}: (decode error)`);
      subPc++;
      continue;
    }
    const bytes = bytesAt(rom, inst.pc, inst.length);
    const text = formatInstruction(inst);
    console.log(`  ${hex(inst.pc)}: ${bytes.padEnd(20)} ${text}`);
    if (inst.tag === 'ret' || inst.tag === 'jp') break;
    subPc = inst.pc + Math.max(1, inst.length);
  }
}

// ─── Part D: Event loop watchpoint ───

function installWriteWatchpoint(cpu, targetAddr) {
  const events = [];
  let currentPc = null;
  let currentStep = 0;

  const original = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function recordByteWrite(writeAddr, newValue, source, width) {
    const addr = writeAddr & MEM_MASK;
    if (addr !== (targetAddr & MEM_MASK)) return;
    const oldValue = cpu.memory[addr] & 0xFF;
    if (oldValue === (newValue & 0xFF)) return;
    events.push({
      step: currentStep,
      pc: hex(currentPc),
      addr: hex(targetAddr),
      oldValue: hexByte(oldValue),
      newValue: hexByte(newValue),
      source,
      width,
    });
  }

  cpu.write8 = (addr, value) => {
    recordByteWrite(addr, value, 'write8', 1);
    return original.write8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    const base = addr & MEM_MASK;
    recordByteWrite(base, value & 0xFF, 'write16', 2);
    recordByteWrite(base + 1, (value >>> 8) & 0xFF, 'write16', 2);
    return original.write16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    const base = addr & MEM_MASK;
    recordByteWrite(base, value & 0xFF, 'write24', 3);
    recordByteWrite(base + 1, (value >>> 8) & 0xFF, 'write24', 3);
    recordByteWrite(base + 2, (value >>> 16) & 0xFF, 'write24', 3);
    return original.write24(addr, value);
  };

  return {
    events,
    updateContext(pc, step) {
      currentPc = pc & 0xFFFFFF;
      currentStep = (step ?? 0) + 1;
    },
    dispose() {
      cpu.write8 = original.write8;
      cpu.write16 = original.write16;
      cpu.write24 = original.write24;
    },
  };
}

function eventLoopWatchpoint(executor, cpu, mem, finalCpuSnapshot) {
  console.log('\n=== Part D: Event Loop Watchpoint on 0xD003E0 ===\n');

  restoreCpu(cpu, finalCpuSnapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, TRACE_RET);

  const watch = installWriteWatchpoint(cpu, TARGET_ADDR);
  let termination = 'max_steps';
  let steps = 0;
  let lastPc = EVENT_LOOP;

  try {
    const result = executor.runFrom(EVENT_LOOP, 'adl', {
      maxSteps: WATCH_STEPS,
      maxLoopIterations: STAGE_LOOP_LIMIT,
      onBlock(pc, _mode, _meta, step) {
        watch.updateContext(pc, step);
        if ((pc & 0xFFFFFF) === TRACE_RET) throw new Error('__TRACE_RET__');
      },
      onMissingBlock(pc, _mode, step) {
        watch.updateContext(pc, step);
        if ((pc & 0xFFFFFF) === TRACE_RET) throw new Error('__TRACE_RET__');
      },
    });
    termination = result.termination ?? termination;
    steps = result.steps ?? 0;
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
  } catch (error) {
    if (error?.message === '__TRACE_RET__') {
      termination = 'return_sentinel';
    } else {
      termination = `exception: ${error?.message ?? String(error)}`;
    }
  } finally {
    watch.dispose();
  }

  console.log(`  entry=${hex(EVENT_LOOP)} steps=${steps} termination=${termination} lastPc=${hex(lastPc)}`);
  console.log(`  stepLimit=${WATCH_STEPS}`);
  console.log(`  writes to ${hex(TARGET_ADDR)}: ${watch.events.length}`);

  if (watch.events.length === 0) {
    console.log('  no writes observed during the event loop trace.');
  } else {
    for (const w of watch.events) {
      console.log(`  step=${w.step} pc=${w.pc} ${w.oldValue} -> ${w.newValue} via ${w.source}`);
    }
  }

  return {
    steps,
    termination,
    lastPc: hex(lastPc),
    writeCount: watch.events.length,
    writes: watch.events,
  };
}

// ─── Main ───

function main() {
  console.log('=== Phase 220: 0x04EE1B BIT 3 Gate Armer Trace ===\n');

  // Part A: Static disassembly
  const { entryPoint } = staticDisassembly();

  // Part B: Find callers
  const { callSites } = findCallers();

  // Boot sequence
  console.log('\n=== Boot Sequence ===\n');
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);
  const bootInfo = coldBoot(executor, cpu, mem);
  const memInitInfo = runMemInit(executor, cpu, mem);
  const bootValue = mem[TARGET_ADDR] & 0xFF;
  console.log(`  boot: ${JSON.stringify(bootInfo.boot)}`);
  console.log(`  kernelInit: ${JSON.stringify(bootInfo.kernelInit)}`);
  console.log(`  postInit: ${JSON.stringify(bootInfo.postInit)}`);
  console.log(`  memInit: returned=${memInitInfo.returned} termination=${memInitInfo.termination}`);
  console.log(`  RAM[${hex(TARGET_ADDR)}] after boot+memInit = ${hexByte(bootValue)} (BIT 3 ${(bootValue & TARGET_MASK) ? 'SET' : 'CLEAR'})`);

  const postMemInitSnapshot = snapshotCpu(cpu);

  // Run homescreen stages
  console.log('\n=== Homescreen Stages ===\n');
  const homeResult = runHomescreenStages(executor, cpu, mem, postMemInitSnapshot);
  for (const stage of homeResult.stages) {
    console.log(`  ${stage.label}: steps=${stage.steps} lastPc=${stage.lastPc} term=${stage.termination}`);
  }
  const postHomescreenValue = mem[TARGET_ADDR] & 0xFF;
  console.log(`  RAM[${hex(TARGET_ADDR)}] after homescreen = ${hexByte(postHomescreenValue)} (BIT 3 ${(postHomescreenValue & TARGET_MASK) ? 'SET' : 'CLEAR'})`);

  // Part C: Dynamic trace
  dynamicTrace(executor, cpu, mem, postMemInitSnapshot, entryPoint);

  // Part D: Event loop watchpoint
  eventLoopWatchpoint(executor, cpu, mem, homeResult.finalCpuSnapshot);

  console.log('\n=== Phase 220 Complete ===');
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase220-04ee1b-bit3-armer.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
