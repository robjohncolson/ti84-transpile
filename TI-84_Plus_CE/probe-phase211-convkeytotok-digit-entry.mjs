#!/usr/bin/env node
/**
 * Phase 211 Probe: ConvKeyToTok 0x05E6A4 reachability for digit tokens
 *
 * Goals:
 *   1. Static disassembly of 0x05E630..0x05E6B0 from ROM.rom
 *   2. Experiment A — Direct entry at 0x05E6A4 with DE=0x31 (digit '1' token)
 *   3. Experiment B — Full ConvKeyToTok entry at 0x05E630 with A=0x8F, BIT 4 SET
 *   4. Experiment C — Control: same as B but BIT 4 CLEAR
 *   5. Summarize whether digit tokens can reach BufInsert via this path
 *
 * Key addresses:
 *   ConvKeyToTok main entry: 0x05E630
 *   BIT 4,(IY+5) gate:      0x05E63C
 *   BufInsert via POP DE:    0x05E6A4
 *   BufInsert routine:       0x05E2A0
 *   IY typically = 0xD00080 (IY+5 = 0xD00085)
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!existsSync(transpiledPath)) {
  const hint = existsSync(transpiledGzipPath)
    ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.'
    : 'ROM.transpiled.js is missing.';
  throw new Error(hint);
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');
const rom = readFileSync(romPath);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);

// --- Constants ---

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY_PLUS_5 = IY_ADDR + 5; // 0xD00085

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const BUF_INSERT = 0x05E2A0;
const CONV_KEY_TO_TOK_ENTRY = 0x05E630;
const BIT4_GATE = 0x05E63C;
const POP_DE_SITE = 0x05E6A4;

const DISASM_START = 0x05E630;
const DISASM_END = 0x05E6B0;

const DIGIT_1_SCAN = 0x8F;   // scan code for digit '1'
const DIGIT_1_TOKEN = 0x31;  // token byte for '1'

const EDIT_TOP_ADDR = 0xD02437;
const EDIT_CURSOR_ADDR = 0xD0243A;
const EDIT_TAIL_ADDR = 0xD0243D;
const EDIT_BTM_ADDR = 0xD02440;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;

const KBD_RAW_SCAN_ADDR = 0xD00587;
const KBD_KEY_ADDR = 0xD0058C;
const KBD_GETKY_ADDR = 0xD0058D;
const KBD_GETCSC_SCAN_ADDR = 0xD0058E;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MAX_LOOP_ITERATIONS = 8192;

// --- Utility functions ---

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function blockKey(addr, mode = 'adl') {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

// --- Disassembly ---

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  const MBASE_VAL = 0xD0;
  function effectiveAddr(i) {
    if (!Number.isInteger(i?.addr)) return null;
    if (i.modePrefix === 'sis' || i.modePrefix === 'lis') {
      return ((MBASE_VAL << 16) | (i.addr & 0xFFFF)) >>> 0;
    }
    return i.addr >>> 0;
  }

  function fmtIndexed(reg, disp) {
    const sign = disp >= 0 ? '+' : '';
    return `(${String(reg).toUpperCase()}${sign}${disp})`;
  }

  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(effectiveAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(effectiveAddr(inst) ?? inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'from-mem') {
        return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(effectiveAddr(inst) ?? inst.addr)})`;
      }
      return `${prefix}LD (${hex(effectiveAddr(inst) ?? inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-load-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-store-reg':
      return `${prefix}LD ${fmtIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-store-imm':
      return `${prefix}LD ${fmtIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'indexed-alu':
      return `${prefix}${String(inst.op).toUpperCase()} ${fmtIndexed(inst.indexRegister, inst.displacement)}`;
    case 'rst': return `${prefix}RST ${hexByte(inst.target)}`;
    default:
      return `${prefix}[${inst.tag}]`;
  }
}

function disassembleRange(startPc, endPc) {
  const rows = [];
  let pc = startPc;
  while (pc < endPc) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst.length ?? 1);
    const key = blockKey(pc, 'adl');
    const markers = [];
    if (BLOCKS[key]) markers.push('BLOCK');
    if (pc === BUF_INSERT) markers.push('BUFINSERT');
    if (pc === CONV_KEY_TO_TOK_ENTRY) markers.push('CONVKEYTOTOK_ENTRY');
    if (pc === BIT4_GATE) markers.push('BIT4_GATE');
    if (pc === POP_DE_SITE) markers.push('POP_DE_SITE');
    if (inst.tag === 'call' && inst.target === BUF_INSERT) markers.push('BUFINSERT_CALL');
    rows.push({
      pc,
      pcHex: hex(pc),
      bytes: bytesToHex(rom, pc, length),
      text: formatInstruction(inst),
      markers,
    });
    pc += length;
  }
  return rows;
}

function printDisasm(rows) {
  for (const row of rows) {
    const markerText = row.markers.length > 0 ? ` [${row.markers.join(', ')}]` : '';
    console.log(`${row.pcHex}: ${row.bytes.padEnd(18)} ${row.text}${markerText}`);
  }
}

// --- Runtime setup ---

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x60), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc ?? 0) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc ?? 0) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc ?? 0) },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
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

function createBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    boot,
    memInit,
    memory: new Uint8Array(mem),
  };
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL_ADDR, EDIT_BUF_END);
  write24(mem, EDIT_BTM_ADDR, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

function snapshotCpu(cpu) {
  return {
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    sp: hex(cpu.sp),
  };
}

// --- Trace helper ---

function traceExecution(label, baselineMem, setupFn, entryPc, maxSteps) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);
  setupFn(cpu, mem);

  const visited = [];
  const missingBlocks = [];
  const bufInsertCalls = [];
  let reachedPop6A4 = false;
  let reachedBit4Gate = false;
  let termination = null;
  let errorMessage = null;

  const cpuBeforeTrace = snapshotCpu(cpu);
  const iyPlus5Before = hexByte(mem[IY_PLUS_5]);

  try {
    const result = executor.runFrom(entryPc, 'adl', {
      maxSteps,
      maxLoopIterations: 200,
      onBlock(pc, mode, meta, step) {
        const addr = pc & 0xFFFFFF;
        visited.push(hex(addr));

        if (addr === POP_DE_SITE) reachedPop6A4 = true;
        if (addr === BIT4_GATE) reachedBit4Gate = true;

        if (addr === BUF_INSERT) {
          bufInsertCalls.push({
            step: (step ?? 0) + 1,
            a: hexByte(cpu.a),
            de: hex(cpu.de),
            d: hexByte((cpu.de >>> 8) & 0xFF),
            e: hexByte(cpu.de & 0xFF),
            hl: hex(cpu.hl),
            bc: hex(cpu.bc),
            sp: hex(cpu.sp),
          });
        }

        if (addr === RETURN_SENTINEL) throw new Error('__TRACE_STOP__');
      },
      onMissingBlock(pc) {
        const addr = pc & 0xFFFFFF;
        missingBlocks.push(hex(addr));
        visited.push(`MISSING:${hex(addr)}`);
        if (addr === RETURN_SENTINEL) throw new Error('__TRACE_STOP__');
      },
    });
    termination = result.termination ?? 'unknown';
    if (result.error) errorMessage = result.error?.stack ?? String(result.error);
  } catch (error) {
    if (error?.message === '__TRACE_STOP__') {
      termination = 'sentinel';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  return {
    label,
    entryPc: hex(entryPc),
    exactBlockExists: Boolean(BLOCKS[blockKey(entryPc)]),
    termination,
    errorMessage,
    cpuBefore: cpuBeforeTrace,
    iyPlus5Before,
    cpuAfter: snapshotCpu(cpu),
    iyPlus5After: hexByte(mem[IY_PLUS_5]),
    reachedBit4Gate,
    reachedPop6A4,
    bufInsertCalls,
    totalBlocksVisited: visited.length,
    blocksVisited: visited,
    missingBlocks,
    editCursor: hex(read24(mem, EDIT_CURSOR_ADDR)),
    editBufferHead: bytesToHex(mem, EDIT_BUF_START, 16),
  };
}

// --- Main ---

function main() {
  // =============================================
  // Part 1: Static disassembly 0x05E630..0x05E6B0
  // =============================================
  console.log('=== Part 1: Static Disassembly 0x05E630..0x05E6B0 ===\n');
  const rows = disassembleRange(DISASM_START, DISASM_END);
  printDisasm(rows);

  // Identify nearby lifted blocks
  const nearbyBlocks = Object.keys(BLOCKS)
    .filter((key) => key.endsWith(':adl'))
    .map((key) => Number.parseInt(key.slice(0, 6), 16))
    .filter((addr) => addr >= DISASM_START - 0x10 && addr <= DISASM_END + 0x10)
    .sort((a, b) => a - b)
    .map((addr) => hex(addr));

  console.log(`\nLifted blocks near range: ${nearbyBlocks.join(', ') || '(none)'}`);
  console.log(`Block at 0x05E630: ${Boolean(BLOCKS[blockKey(CONV_KEY_TO_TOK_ENTRY)])}`);
  console.log(`Block at 0x05E63C: ${Boolean(BLOCKS[blockKey(BIT4_GATE)])}`);
  console.log(`Block at 0x05E6A4: ${Boolean(BLOCKS[blockKey(POP_DE_SITE)])}`);
  console.log(`Block at 0x05E2A0 (BufInsert): ${Boolean(BLOCKS[blockKey(BUF_INSERT)])}`);

  // =============================================
  // Part 2: Boot baseline
  // =============================================
  console.log('\n=== Part 2: Boot Baseline ===\n');
  const baseline = createBaseline();
  console.log(JSON.stringify({
    boot: baseline.boot,
    memInit: baseline.memInit,
    iyPlus5AfterBoot: hexByte(baseline.memory[IY_PLUS_5]),
  }, null, 2));

  // =============================================
  // Experiment A: Direct entry at 0x05E6A4 with DE=0x31
  // =============================================
  console.log('\n=== Experiment A: Direct entry at 0x05E6A4 with DE=0x31 ===\n');

  const expA = traceExecution(
    'Experiment A: Direct 0x05E6A4, DE=0x31',
    baseline.memory,
    (cpu, mem) => {
      // Set BIT 4 at (IY+5)
      mem[IY_PLUS_5] = mem[IY_PLUS_5] | 0x10;
      // Push digit token 0x31 as DE value onto stack
      // At 0x05E6A4 the code does POP DE, so we need DE on stack
      push24(cpu, mem, RETURN_SENTINEL); // return address
      push24(cpu, mem, DIGIT_1_TOKEN);   // this will be POPped into DE
      cpu.de = DIGIT_1_TOKEN; // also set DE directly in case POP doesn't fire
    },
    POP_DE_SITE,
    200
  );

  console.log(JSON.stringify(expA, null, 2));

  // =============================================
  // Experiment B: Full ConvKeyToTok at 0x05E630, BIT 4 SET
  // =============================================
  console.log('\n=== Experiment B: Full entry at 0x05E630, A=0x8F, BIT 4 SET ===\n');

  const expB = traceExecution(
    'Experiment B: ConvKeyToTok 0x05E630, A=0x8F, BIT4=SET',
    baseline.memory,
    (cpu, mem) => {
      cpu.a = DIGIT_1_SCAN; // scan code for digit '1'
      // Set BIT 4 at (IY+5)
      mem[IY_PLUS_5] = mem[IY_PLUS_5] | 0x10;
      // Seed keyboard state
      mem[KBD_RAW_SCAN_ADDR] = DIGIT_1_SCAN;
      mem[KBD_KEY_ADDR] = DIGIT_1_SCAN;
      mem[KBD_GETKY_ADDR] = DIGIT_1_SCAN;
      mem[KBD_GETCSC_SCAN_ADDR] = DIGIT_1_SCAN;
      // Push return sentinel
      push24(cpu, mem, RETURN_SENTINEL);
    },
    CONV_KEY_TO_TOK_ENTRY,
    500
  );

  console.log(JSON.stringify(expB, null, 2));

  // =============================================
  // Experiment C: Control — same as B but BIT 4 CLEAR
  // =============================================
  console.log('\n=== Experiment C: Control — 0x05E630, A=0x8F, BIT 4 CLEAR ===\n');

  const expC = traceExecution(
    'Experiment C: ConvKeyToTok 0x05E630, A=0x8F, BIT4=CLEAR',
    baseline.memory,
    (cpu, mem) => {
      cpu.a = DIGIT_1_SCAN;
      // CLEAR BIT 4 at (IY+5)
      mem[IY_PLUS_5] = mem[IY_PLUS_5] & ~0x10;
      // Seed keyboard state
      mem[KBD_RAW_SCAN_ADDR] = DIGIT_1_SCAN;
      mem[KBD_KEY_ADDR] = DIGIT_1_SCAN;
      mem[KBD_GETKY_ADDR] = DIGIT_1_SCAN;
      mem[KBD_GETCSC_SCAN_ADDR] = DIGIT_1_SCAN;
      // Push return sentinel
      push24(cpu, mem, RETURN_SENTINEL);
    },
    CONV_KEY_TO_TOK_ENTRY,
    500
  );

  console.log(JSON.stringify(expC, null, 2));

  // =============================================
  // Summary
  // =============================================
  console.log('\n=== Summary ===\n');

  const expAHit = expA.bufInsertCalls.length > 0;
  const expBHit = expB.bufInsertCalls.length > 0;
  const expCHit = expC.bufInsertCalls.length > 0;

  console.log(`Experiment A (direct 0x05E6A4, DE=0x31):`);
  console.log(`  Block exists at entry: ${expA.exactBlockExists}`);
  console.log(`  Reached BufInsert: ${expAHit}`);
  if (expAHit) {
    console.log(`  BufInsert DE value: ${expA.bufInsertCalls[0].de}`);
  }
  console.log(`  Termination: ${expA.termination}`);
  console.log(`  Edit buffer: ${expA.editBufferHead}`);

  console.log(`\nExperiment B (full 0x05E630, A=0x8F, BIT4=SET):`);
  console.log(`  Block exists at entry: ${expB.exactBlockExists}`);
  console.log(`  Reached BIT4 gate: ${expB.reachedBit4Gate}`);
  console.log(`  Reached POP DE site (0x05E6A4): ${expB.reachedPop6A4}`);
  console.log(`  Reached BufInsert: ${expBHit}`);
  if (expBHit) {
    console.log(`  BufInsert DE value: ${expB.bufInsertCalls[0].de}`);
  }
  console.log(`  Termination: ${expB.termination}`);
  console.log(`  Edit buffer: ${expB.editBufferHead}`);

  console.log(`\nExperiment C (full 0x05E630, A=0x8F, BIT4=CLEAR):`);
  console.log(`  Block exists at entry: ${expC.exactBlockExists}`);
  console.log(`  Reached BIT4 gate: ${expC.reachedBit4Gate}`);
  console.log(`  Reached POP DE site (0x05E6A4): ${expC.reachedPop6A4}`);
  console.log(`  Reached BufInsert: ${expCHit}`);
  console.log(`  Termination: ${expC.termination}`);
  console.log(`  Edit buffer: ${expC.editBufferHead}`);

  console.log(`\nPath divergence (B vs C):`);
  const bBlocks = new Set(expB.blocksVisited);
  const cBlocks = new Set(expC.blocksVisited);
  const bOnly = [...bBlocks].filter((b) => !cBlocks.has(b));
  const cOnly = [...cBlocks].filter((b) => !bBlocks.has(b));
  console.log(`  Blocks unique to B (BIT4=SET): ${bOnly.length > 0 ? bOnly.join(', ') : '(none)'}`);
  console.log(`  Blocks unique to C (BIT4=CLEAR): ${cOnly.length > 0 ? cOnly.join(', ') : '(none)'}`);

  console.log(`\nConclusion:`);
  if (expAHit && expA.bufInsertCalls[0].de === hex(DIGIT_1_TOKEN)) {
    console.log(`  Direct entry at 0x05E6A4 with DE=0x31 successfully reaches BufInsert with the digit token.`);
  } else if (expAHit) {
    console.log(`  Direct entry at 0x05E6A4 reaches BufInsert, but DE=${expA.bufInsertCalls[0].de} (not the expected 0x31).`);
  } else {
    console.log(`  Direct entry at 0x05E6A4 did NOT reach BufInsert within 200 steps.`);
  }

  if (expBHit) {
    console.log(`  Full ConvKeyToTok path with BIT4=SET reaches BufInsert via 0x05E6A4.`);
  } else if (expB.reachedPop6A4) {
    console.log(`  Full ConvKeyToTok path with BIT4=SET reaches 0x05E6A4 but BufInsert was NOT called.`);
  } else {
    console.log(`  Full ConvKeyToTok path with BIT4=SET did NOT reach 0x05E6A4 within 500 steps.`);
  }

  if (expCHit) {
    console.log(`  Control (BIT4=CLEAR) unexpectedly reached BufInsert.`);
  } else if (expC.reachedPop6A4) {
    console.log(`  Control (BIT4=CLEAR) unexpectedly reached 0x05E6A4.`);
  } else {
    console.log(`  Control (BIT4=CLEAR) correctly did NOT reach 0x05E6A4 — confirms BIT 4 gate.`);
  }
}

main();
