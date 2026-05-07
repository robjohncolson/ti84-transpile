#!/usr/bin/env node
/**
 * Phase 206 Probe: Why does the cxMain digit path return without BufInsert?
 *
 * Session 205 confirmed that the digit path reaches 0x0589E5 and avoids
 * 0x09927F, but BufInsert (0x05E2A0) is never called. The path returns
 * cleanly after block 0x058AC9.
 *
 * This probe:
 *   1. Statically disassembles blocks 0x058A0C, 0x058A60, 0x058AC9
 *   2. Traces the digit path with RAM write-watching
 *   3. Identifies the conditional branch causing early return
 *   4. Tests with different pre-initialized state to find what enables BufInsert
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const MEM_SIZE = 0x1000000;

// Standard addresses
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const REQUESTED_SP = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const MAX_LOOP_ITERATIONS = 8192;

// cxMain path addresses
const CXMAIN_ENTRY = 0x0585E9;
const BUF_INSERT = 0x05E2A0;
const TOKEN_VALIDATOR = 0x09927F;

// Blocks of interest (the tail of the digit path)
const BLOCK_058A0C = 0x058A0C;
const BLOCK_058A60 = 0x058A60;
const BLOCK_058AC9 = 0x058AC9;

// Token / edit buffer addresses
const OP1_ADDR = 0xD005F8;
const TOKEN_STAGING_ADDR = 0xD0230E;

const EDIT_TOP_ADDR = 0xD02437;
const EDIT_CURSOR_ADDR = 0xD0243A;
const EDIT_TAIL_ADDR = 0xD0243D;
const EDIT_BTM_ADDR = 0xD02440;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;

// Mode / context addresses to watch
const APP_CONTEXT_ADDR = 0xD02504;
const CUR_ROW_ADDR = 0xD00595;
const CUR_COL_ADDR = 0xD00596;

const DIGIT4_TOKEN = Uint8Array.from([0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const STEP_LIMIT = 5000;

// ── Helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesFor(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

// ── Disassembly formatting ───────────────────────────────────────────

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister}${sign}${displacement})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${inst.indirectRegister.toUpperCase()})`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'from-mem') return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
      return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (HL), ${hex(inst.value, 2)}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-ind': return `${inst.op.toUpperCase()} (${inst.indirectRegister.toUpperCase()})`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'exx': return 'EXX';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'daa': return 'DAA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'out-imm': return `OUT (${hex(inst.port, 2)}), A`;
    case 'in-imm': return `IN A, (${hex(inst.port, 2)})`;
    case 'halt': return 'HALT';

    // Indexed operations (IX/IY)
    case 'indexed-load-reg':
      return `LD ${inst.dest.toUpperCase()}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-store-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'indexed-store-imm':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
    case 'indexed-alu':
      return `${inst.op.toUpperCase()} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-inc':
      return `INC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-dec':
      return `DEC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate':
      return `${inst.op.toUpperCase()} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;

    // Pair indexed
    case 'indexed-ld-pair':
      return `LD ${inst.pair.toUpperCase()}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-st-pair':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair.toUpperCase()}`;

    // Half-register operations
    case 'ld-half-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-half-half': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-half-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-half': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'alu-half': return `${inst.op.toUpperCase()} ${inst.half.toUpperCase()}`;
    case 'inc-half': return `INC ${inst.half.toUpperCase()}`;
    case 'dec-half': return `DEC ${inst.half.toUpperCase()}`;

    // IX/IY pair ops
    case 'add-index': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'push-index': return `PUSH ${inst.indexRegister.toUpperCase()}`;
    case 'pop-index': return `POP ${inst.indexRegister.toUpperCase()}`;
    case 'ld-index-imm': return `LD ${inst.indexRegister.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-index-mem':
      if (inst.direction === 'from-mem') return `LD ${inst.indexRegister.toUpperCase()}, (${hex(inst.addr)})`;
      return `LD (${hex(inst.addr)}), ${inst.indexRegister.toUpperCase()}`;
    case 'jp-index': return `JP (${inst.indexRegister.toUpperCase()})`;
    case 'ld-sp-index': return `LD SP, ${inst.indexRegister.toUpperCase()}`;
    case 'ex-sp-index': return `EX (SP), ${inst.indexRegister.toUpperCase()}`;
    case 'lea': return `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}+${inst.displacement}`;

    // ED prefix block ops
    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'ini': return 'INI';
    case 'inir': return 'INIR';
    case 'ind': return 'IND';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'otir': return 'OTIR';
    case 'outd': return 'OUTD';
    case 'otdr': return 'OTDR';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'im': return `IM ${inst.mode}`;
    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-r-a': return 'LD R, A';
    case 'ld-a-r': return 'LD A, R';
    case 'rrd': return 'RRD';
    case 'rld': return 'RLD';
    case 'neg': return 'NEG';
    case 'in-reg': return `IN ${inst.reg.toUpperCase()}, (C)`;
    case 'out-reg': return `OUT (C), ${inst.reg.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'ld-pair-ind': return `LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-ind-pair': return `LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`;
    case 'ed-ld-pair-mem':
      if (inst.direction === 'from-mem') return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
      return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'mlt': return `MLT ${inst.pair.toUpperCase()}`;
    case 'tst-imm': return `TST A, ${hex(inst.value, 2)}`;
    case 'tst-reg': return `TST A, ${inst.reg.toUpperCase()}`;
    case 'tstio': return `TSTIO ${hex(inst.mask, 2)}`;
    case 'slp': return 'SLP';
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'mode-switch': return `MODE ${inst.newMode}`;

    // Rotate/shift
    case 'rotate-reg': return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'rotate-ind': return `${inst.op.toUpperCase()} (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-set': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-res': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-res-ind': return `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;

    default:
      return `[${inst.tag}]`;
  }
}

function disassembleRange(startPc, byteCount) {
  const rows = [];
  let pc = startPc;
  const endPc = startPc + byteCount;

  while (pc < endPc) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const rawBytes = bytesFor(rom, inst.pc, inst.length);
    const isBranch = inst.terminates === true;
    const marker = isBranch ? ' <-- BRANCH' : '';
    rows.push({
      pc: hex(inst.pc),
      asm: formatInstruction(inst),
      bytes: rawBytes,
      length: inst.length,
      isBranch,
      tag: inst.tag,
      target: inst.target !== undefined ? hex(inst.target) : null,
      fallthrough: inst.fallthrough !== undefined ? hex(inst.fallthrough) : null,
      condition: inst.condition ?? null,
      text: `${hex(inst.pc)}: ${rawBytes.padEnd(20)} ${formatInstruction(inst)}${marker}`,
    });
    pc = inst.nextPc;
  }

  return rows;
}

// ── Memory / CPU setup ───────────────────────────────────────────────

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function createCPU(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
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
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
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

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') returned = true;
    else throw error;
  }

  return { returned };
}

function createBaseline() {
  const mem = createMemory();
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  const { cpu, executor } = createCPU(mem);
  coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    mem: new Uint8Array(mem),
    memInitReturned: memInit.returned,
  };
}

function snapshotEditPointers(mem) {
  return {
    top: hex(read24(mem, EDIT_TOP_ADDR)),
    cursor: hex(read24(mem, EDIT_CURSOR_ADDR)),
    tail: hex(read24(mem, EDIT_TAIL_ADDR)),
    bottom: hex(read24(mem, EDIT_BTM_ADDR)),
  };
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL_ADDR, EDIT_BUF_END);
  write24(mem, EDIT_BTM_ADDR, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

// ── RAM write watcher ────────────────────────────────────────────────

function createWriteWatcher(mem, ranges) {
  // ranges: [{label, start, end}]
  const writes = [];
  const originalWrite8 = mem.constructor.prototype.set ? null : null; // Uint8Array

  // We'll intercept by snapshotting watched regions before/after each block
  return {
    ranges,
    writes,
    snapshotBefore() {
      return ranges.map(r => ({
        label: r.label,
        start: r.start,
        end: r.end,
        data: new Uint8Array(mem.slice(r.start, r.end)),
      }));
    },
    diffAfter(before, stepNumber, blockPc) {
      for (const snap of before) {
        for (let i = 0; i < snap.data.length; i++) {
          const addr = snap.start + i;
          const oldVal = snap.data[i];
          const newVal = mem[addr];
          if (oldVal !== newVal) {
            writes.push({
              step: stepNumber,
              block: hex(blockPc),
              addr: hex(addr),
              region: snap.label,
              oldVal: hexByte(oldVal),
              newVal: hexByte(newVal),
            });
          }
        }
      }
    },
  };
}

// ── Experiment runner ────────────────────────────────────────────────

function runDigitPathExperiment(baselineMem, label, preConfig) {
  const mem = new Uint8Array(baselineMem);
  const { cpu, executor } = createCPU(mem);

  // Standard setup
  resetOsState(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + 9);
  mem.set(DIGIT4_TOKEN, OP1_ADDR);
  mem.set(DIGIT4_TOKEN, TOKEN_STAGING_ADDR);
  seedEditBuffer(mem);

  // Clear BIT 7 of IY+12 (editor active flag)
  mem[IY_ADDR + 12] = mem[IY_ADDR + 12] & 0x7F;

  // A=0 for class 0 (digit)
  cpu.a = 0x00;
  cpu.b = 0x00;
  cpu.c = 0x00;
  cpu.d = 0x00;
  cpu.e = 0x00;
  cpu.ix = IX_ADDR;
  cpu.iy = IY_ADDR;

  // Apply experiment-specific configuration
  if (preConfig) preConfig(cpu, mem);

  // Set up return sentinel
  mem.fill(0xFF, Math.max(0, REQUESTED_SP - 0x40), Math.min(mem.length, REQUESTED_SP + 0x10));
  cpu.sp = REQUESTED_SP;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Snapshot IY flags and key RAM before run
  const iyFlagsBefore = {};
  for (let offset = 0; offset <= 0x20; offset++) {
    iyFlagsBefore[`IY+${hex(offset, 2)}`] = hexByte(mem[IY_ADDR + offset]);
  }
  const appContextBefore = hexByte(mem[APP_CONTEXT_ADDR]);
  const curRowBefore = hexByte(mem[CUR_ROW_ADDR]);
  const curColBefore = hexByte(mem[CUR_COL_ADDR]);

  // Set up write watcher
  const watcher = createWriteWatcher(mem, [
    { label: 'editBuffer', start: 0xD00A00, end: 0xD00A11 },
    { label: 'iyFlags', start: IY_ADDR, end: IY_ADDR + 0x21 },
    { label: 'appContext', start: APP_CONTEXT_ADDR, end: APP_CONTEXT_ADDR + 1 },
    { label: 'curRowCol', start: CUR_ROW_ADDR, end: CUR_COL_ADDR + 1 },
    { label: 'editPointers', start: EDIT_TOP_ADDR, end: EDIT_BTM_ADDR + 3 },
  ]);

  // Trace execution
  const visitedBlocks = [];
  const visitedSet = new Set();
  let steps = 0;
  let lastPc = CXMAIN_ENTRY;
  let termination = 'max_steps';
  let errorMessage = null;
  let reachedBufInsert = false;
  let reachedTokenValidator = false;

  // Per-block write tracking
  let beforeSnap = null;

  try {
    const result = executor.runFrom(CXMAIN_ENTRY, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        const normalized = pc & 0xFFFFFF;

        // Diff writes from previous block
        if (beforeSnap !== null) {
          watcher.diffAfter(beforeSnap, step, normalized);
        }
        // Snapshot for next diff
        beforeSnap = watcher.snapshotBefore();

        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = normalized;

        if (!visitedSet.has(normalized)) {
          visitedSet.add(normalized);
          visitedBlocks.push(hex(normalized));
        }

        if (normalized === BUF_INSERT) reachedBufInsert = true;
        if (normalized === TOKEN_VALIDATOR) reachedTokenValidator = true;
        if (normalized === RETURN_SENTINEL) throw new Error('__RET__');
      },
      onMissingBlock(pc, _mode, step) {
        const normalized = pc & 0xFFFFFF;

        if (beforeSnap !== null) {
          watcher.diffAfter(beforeSnap, step, normalized);
        }
        beforeSnap = watcher.snapshotBefore();

        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = normalized;

        if (!visitedSet.has(normalized)) {
          visitedSet.add(normalized);
          visitedBlocks.push(hex(normalized));
        }

        if (normalized === BUF_INSERT) reachedBufInsert = true;
        if (normalized === TOKEN_VALIDATOR) reachedTokenValidator = true;
        if (normalized === RETURN_SENTINEL) throw new Error('__RET__');
      },
    });

    termination = result.termination ?? termination;
    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;

    // Final diff
    if (beforeSnap !== null) {
      watcher.diffAfter(beforeSnap, steps, lastPc);
    }
  } catch (error) {
    if (error?.message === '__RET__') {
      termination = 'return';
      if (beforeSnap !== null) {
        watcher.diffAfter(beforeSnap, steps, RETURN_SENTINEL);
      }
    } else {
      termination = 'exception';
      errorMessage = error?.message ?? String(error);
    }
  }

  return {
    label,
    run: {
      steps,
      termination,
      lastPc: hex(lastPc),
      blockCount: visitedBlocks.length,
      reachedBufInsert,
      reachedTokenValidator,
    },
    visitedBlocks,
    ramWrites: watcher.writes,
    before: {
      appContext: appContextBefore,
      curRow: curRowBefore,
      curCol: curColBefore,
      iyFlags: iyFlagsBefore,
      editPointers: snapshotEditPointers(baselineMem),
    },
    after: {
      registers: {
        a: hexByte(cpu.a),
        f: hexByte(cpu.f),
        bc: hex(cpu.bc),
        de: hex(cpu.de),
        hl: hex(cpu.hl),
        sp: hex(cpu.sp),
        ix: hex(cpu.ix),
        iy: hex(cpu.iy),
      },
      editPointers: snapshotEditPointers(mem),
      editBufferD00A00: bytesFor(mem, EDIT_BUF_START, 0x11),
      op1: bytesFor(mem, OP1_ADDR, 9),
    },
    error: errorMessage,
  };
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  // Part 1: Static disassembly of the three blocks
  const disasm058A0C = disassembleRange(BLOCK_058A0C, 0x058A60 - 0x058A0C);
  const disasm058A60 = disassembleRange(BLOCK_058A60, 0x058AC9 - 0x058A60);
  const disasm058AC9 = disassembleRange(BLOCK_058AC9, 0x058B30 - 0x058AC9); // generous range

  // Also disassemble the preceding block to see how we got here
  const disasm0589E5 = disassembleRange(0x0589E5, 0x058A0C - 0x0589E5);
  const disasm0589E9 = disassembleRange(0x0589E9, 0x058A0C - 0x0589E9);

  // Part 2: Identify all conditional branches in 0x058A0C - 0x058B30
  const allBranches = [
    ...disasm058A0C,
    ...disasm058A60,
    ...disasm058AC9,
  ].filter(row => row.isBranch);

  // Part 3: Baseline run (default post-boot state)
  const baseline = createBaseline();

  const experiments = {};

  // Experiment 0: Default state (reproduces the early return)
  experiments.default = runDigitPathExperiment(baseline.mem, 'default', null);

  // Experiment 1: Set appContext (0xD02504) to 0x40 (home screen mode?)
  experiments.appContext_0x40 = runDigitPathExperiment(baseline.mem, 'appContext=0x40', (cpu, mem) => {
    mem[APP_CONTEXT_ADDR] = 0x40;
  });

  // Experiment 2: Set various IY+n flags that might indicate edit mode
  experiments.iyPlus9_bit0 = runDigitPathExperiment(baseline.mem, 'IY+9 bit0 set', (cpu, mem) => {
    mem[IY_ADDR + 9] = mem[IY_ADDR + 9] | 0x01;
  });

  // Experiment 3: Set IY+0x0C bit 3 (sometimes "insert mode")
  experiments.iyPlus12_bit3 = runDigitPathExperiment(baseline.mem, 'IY+12 bit3 set', (cpu, mem) => {
    mem[IY_ADDR + 12] = mem[IY_ADDR + 12] | 0x08;
  });

  // Experiment 4: Set IY+0x09 = 0x0C (cxMain active context value from docs)
  experiments.iyPlus9_0x0C = runDigitPathExperiment(baseline.mem, 'IY+9=0x0C', (cpu, mem) => {
    mem[IY_ADDR + 9] = 0x0C;
  });

  // Experiment 5: Set AppContext to common mode values
  experiments.appContext_0x01 = runDigitPathExperiment(baseline.mem, 'appContext=0x01', (cpu, mem) => {
    mem[APP_CONTEXT_ADDR] = 0x01;
  });

  // Experiment 6: Set IY+0x0D (various flags)
  experiments.iyPlus13_0xFF = runDigitPathExperiment(baseline.mem, 'IY+13=0xFF', (cpu, mem) => {
    mem[IY_ADDR + 13] = 0xFF;
  });

  // Experiment 7: Try setting cursor != top (non-empty buffer position)
  experiments.cursorAdvanced = runDigitPathExperiment(baseline.mem, 'cursor=D00A01', (cpu, mem) => {
    write24(mem, EDIT_CURSOR_ADDR, EDIT_BUF_START + 1);
  });

  // Experiment 8: Set IY+0x00 flags (sometimes "home screen active")
  experiments.iyPlus0_0xFF = runDigitPathExperiment(baseline.mem, 'IY+0=0xFF', (cpu, mem) => {
    mem[IY_ADDR + 0] = 0xFF;
  });

  // Experiment 9: Set key event (0xD0058E) to digit scan code
  experiments.keyEvent_digit = runDigitPathExperiment(baseline.mem, 'keyEvent=0x9A', (cpu, mem) => {
    mem[0xD0058E] = 0x9A; // DIGIT_2 scan code
  });

  // Experiment 10: Set multiple plausible edit-mode flags together
  experiments.fullEditMode = runDigitPathExperiment(baseline.mem, 'full edit mode', (cpu, mem) => {
    mem[IY_ADDR + 9] = 0x0C;
    mem[IY_ADDR + 12] = (mem[IY_ADDR + 12] & 0x7F) | 0x08;
    mem[APP_CONTEXT_ADDR] = 0x40;
    mem[0xD0058E] = 0x9A;
  });

  // Build summary of which experiments reached BufInsert
  const summary = {};
  for (const [key, exp] of Object.entries(experiments)) {
    summary[key] = {
      reachedBufInsert: exp.run.reachedBufInsert,
      reachedTokenValidator: exp.run.reachedTokenValidator,
      termination: exp.run.termination,
      steps: exp.run.steps,
      blockCount: exp.run.blockCount,
      ramWriteCount: exp.ramWrites.length,
    };
  }

  return {
    probe: 'probe-phase206-cxmain-bufinsert-why.mjs',
    generatedAt: new Date().toISOString(),
    runtime: {
      timerInterrupt: false,
      baselineMemInitReturned: baseline.memInitReturned,
      stepLimit: STEP_LIMIT,
    },

    staticDisassembly: {
      block_0x0589E5: disasm0589E5.map(r => r.text),
      block_0x0589E9: disasm0589E9.map(r => r.text),
      block_0x058A0C: disasm058A0C.map(r => r.text),
      block_0x058A60: disasm058A60.map(r => r.text),
      block_0x058AC9: disasm058AC9.map(r => r.text),
    },

    conditionalBranches: allBranches.map(b => ({
      pc: b.pc,
      asm: b.asm,
      tag: b.tag,
      condition: b.condition,
      target: b.target,
      fallthrough: b.fallthrough,
    })),

    experiments,
    summary,
  };
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase206-cxmain-bufinsert-why.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
