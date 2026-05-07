#!/usr/bin/env node
/**
 * Phase 210 Probe: cxMain CP-branch cascade after 0x0589E5
 *
 * Goal:
 *   1. Statically disassemble the cascade region 0x0589E5..0x058B00
 *   2. Build a branch map for every conditional JR/JP in that region
 *   3. Identify the match-handler entry points for CP 0x09 / 0x0C / 0x0D
 *   4. Trace direct-entry runs with A=0x09, 0x0C, 0x0D for 200 steps
 *   5. Report whether any path reaches BufInsert or writes to 0xD00A00
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

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const REQUESTED_SP = 0xD1A860;

const CXMAIN_CASCADE_ENTRY = 0x0589E5;
const CASCADE_END_EXCLUSIVE = 0x058B00;
const BUF_INSERT = 0x05E2A0;

const OP1_ADDR = 0xD005F8;
const TOKEN_STAGING_ADDR = 0xD0230E;
const IY_PLUS_12_ADDR = IY_ADDR + 12;

const EDIT_TOP_ADDR = 0xD02437;
const EDIT_CURSOR_ADDR = 0xD0243A;
const EDIT_TAIL_ADDR = 0xD0243D;
const EDIT_BTM_ADDR = 0xD02440;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_STEP_LIMIT = 200;
const MAX_LOOP_ITERATIONS = 8192;

const BRANCH_TARGET_PREVIEW_COUNT = 4;
const MATCH_HANDLER_PREVIEW_COUNT = 20;

const CP_MATCH_HANDLERS = [
  {
    label: 'cp_0x09',
    comparePc: 0x058A0C,
    compareValue: 0x09,
    mismatchBranchPc: 0x058A0E,
    matchEntry: 0x058A10,
  },
  {
    label: 'cp_0x0C',
    comparePc: 0x058A60,
    compareValue: 0x0C,
    mismatchBranchPc: 0x058A62,
    matchEntry: 0x058A64,
  },
  {
    label: 'cp_0x0D',
    comparePc: 0x058A6E,
    compareValue: 0x0D,
    mismatchBranchPc: 0x058A70,
    matchEntry: 0x058A74,
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesFor(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
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
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
      return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
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
    case 'indexed-load-reg':
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-store-reg':
    case 'ld-ixd-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'indexed-store-imm':
    case 'ld-ixd-imm':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
    case 'indexed-alu':
    case 'alu-ixd':
      return `${inst.op.toUpperCase()} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-inc':
    case 'inc-ixd':
      return `INC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-dec':
    case 'dec-ixd':
      return `DEC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate':
      return `${(inst.op ?? inst.operation).toUpperCase()} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-ld-pair':
    case 'ld-pair-indexed':
      return `LD ${inst.pair.toUpperCase()}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-st-pair':
    case 'ld-indexed-pair':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair.toUpperCase()}`;
    case 'ld-half-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-half-half': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-half-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-half': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'alu-half': return `${inst.op.toUpperCase()} ${inst.half.toUpperCase()}`;
    case 'inc-half': return `INC ${inst.half.toUpperCase()}`;
    case 'dec-half': return `DEC ${inst.half.toUpperCase()}`;
    case 'add-index': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'push-index': return `PUSH ${inst.indexRegister.toUpperCase()}`;
    case 'pop-index': return `POP ${inst.indexRegister.toUpperCase()}`;
    case 'ld-index-imm': return `LD ${inst.indexRegister.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-index-mem':
      if (inst.direction === 'from-mem') return `LD ${inst.indexRegister.toUpperCase()}, (${hex(inst.addr)})`;
      return `LD (${hex(inst.addr)}), ${inst.indexRegister.toUpperCase()}`;
    case 'jp-index': return `JP (${inst.indexRegister.toUpperCase()})`;
    case 'ld-sp-index':
    case 'ld-sp-pair':
      return `LD SP, ${inst.indexRegister?.toUpperCase?.() ?? inst.pair.toUpperCase()}`;
    case 'ex-sp-index':
    case 'ex-sp-pair':
      return `EX (SP), ${inst.indexRegister?.toUpperCase?.() ?? inst.pair.toUpperCase()}`;
    case 'lea': return `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}+${inst.displacement}`;
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
    case 'im': return `IM ${inst.mode ?? inst.value}`;
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
    case 'mlt': return `MLT ${(inst.pair ?? inst.reg).toUpperCase()}`;
    case 'tst-imm': return `TST A, ${hex(inst.value, 2)}`;
    case 'tst-reg': return `TST A, ${inst.reg.toUpperCase()}`;
    case 'tstio': return `TSTIO ${hex(inst.mask ?? inst.value, 2)}`;
    case 'slp': return 'SLP';
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'mode-switch': return `MODE ${inst.newMode}`;
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

function disassembleRange(startPc, endExclusive) {
  const rows = [];
  let pc = startPc;

  while (pc < endExclusive) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const asm = formatInstruction(inst);
    const rawBytes = bytesFor(rom, inst.pc, inst.length);
    rows.push({
      pc: inst.pc,
      pcHex: hex(inst.pc),
      asm,
      bytes: rawBytes,
      length: inst.length,
      tag: inst.tag,
      condition: inst.condition ?? null,
      target: inst.target ?? null,
      targetHex: inst.target !== undefined ? hex(inst.target) : null,
      fallthrough: inst.fallthrough ?? inst.nextPc,
      fallthroughHex: hex(inst.fallthrough ?? inst.nextPc),
      inst,
      text: `${hex(inst.pc)}: ${rawBytes.padEnd(20)} ${asm}`,
    });
    pc = inst.nextPc;
  }

  return rows;
}

function disassembleCount(startPc, count) {
  const rows = [];
  let pc = startPc;

  for (let i = 0; i < count; i += 1) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const asm = formatInstruction(inst);
    const rawBytes = bytesFor(rom, inst.pc, inst.length);
    rows.push({
      pc: inst.pc,
      pcHex: hex(inst.pc),
      asm,
      bytes: rawBytes,
      length: inst.length,
      tag: inst.tag,
      condition: inst.condition ?? null,
      target: inst.target ?? null,
      targetHex: inst.target !== undefined ? hex(inst.target) : null,
      fallthrough: inst.fallthrough ?? inst.nextPc,
      fallthroughHex: hex(inst.fallthrough ?? inst.nextPc),
      text: `${hex(inst.pc)}: ${rawBytes.padEnd(20)} ${asm}`,
    });
    pc = inst.nextPc;
  }

  return rows;
}

function buildDestinationPreview(target) {
  if (typeof target !== 'number') return null;
  return {
    target: hex(target),
    firstInstructions: disassembleCount(target, BRANCH_TARGET_PREVIEW_COUNT).map((row) => row.text),
  };
}

function buildJumpBranchMap(rows) {
  return rows
    .filter((row) => row.tag === 'jr-conditional' || row.tag === 'jp-conditional')
    .map((row, index) => {
      const previous = rows[index > 0 ? index - 1 : 0];
      const pairedCompare =
        previous &&
        previous.tag === 'alu-imm' &&
        previous.inst.op === 'cp' &&
        previous.pc === row.pc - previous.length
          ? {
              pc: previous.pcHex,
              asm: previous.asm,
              compareValue: hexByte(previous.inst.value),
            }
          : null;

      return {
        pc: row.pcHex,
        asm: row.asm,
        condition: row.condition,
        target: row.targetHex,
        fallthrough: row.fallthroughHex,
        pairedCompare,
        whenConditionMet: buildDestinationPreview(row.target),
      };
    });
}

function buildConditionalControlFlow(rows) {
  return rows
    .filter((row) => row.tag === 'call-conditional' || row.tag === 'ret-conditional')
    .map((row) => ({
      pc: row.pcHex,
      asm: row.asm,
      condition: row.condition,
      target: row.targetHex,
      fallthrough: row.fallthroughHex,
      whenConditionMet:
        row.tag === 'ret-conditional'
          ? {
              kind: 'return-to-caller',
            }
          : {
              kind: 'call-target',
              ...buildDestinationPreview(row.target),
            },
    }));
}

function buildMatchHandlerReport(rows) {
  const rowByPc = new Map(rows.map((row) => [row.pc, row]));

  return CP_MATCH_HANDLERS.map((spec) => {
    const compareRow = rowByPc.get(spec.comparePc);
    const mismatchBranch = rowByPc.get(spec.mismatchBranchPc);

    return {
      label: spec.label,
      comparePc: hex(spec.comparePc),
      compareAsm: compareRow?.asm ?? null,
      compareValue: hexByte(spec.compareValue),
      mismatchBranchPc: hex(spec.mismatchBranchPc),
      mismatchBranchAsm: mismatchBranch?.asm ?? null,
      mismatchTarget: mismatchBranch?.targetHex ?? null,
      matchEntry: hex(spec.matchEntry),
      note: 'The compare match path is the fallthrough after the NZ branch, not a separate JR Z/JP Z target.',
      first20Instructions: disassembleCount(spec.matchEntry, MATCH_HANDLER_PREVIEW_COUNT).map((row) => row.text),
    };
  });
}

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
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
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

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
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
      maxSteps: MEM_INIT_MAX_STEPS,
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

function diffRange(before, after, start, endExclusive) {
  const diffs = [];
  for (let addr = start; addr < endExclusive; addr += 1) {
    const beforeValue = before[addr] & 0xFF;
    const afterValue = after[addr] & 0xFF;
    if (beforeValue !== afterValue) {
      diffs.push({
        addr: hex(addr),
        before: hexByte(beforeValue),
        after: hexByte(afterValue),
      });
    }
  }
  return diffs;
}

function seedExperiment(cpu, mem, classValue) {
  resetOsState(cpu, mem);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + 9);
  mem[OP1_ADDR] = classValue & 0xFF;
  mem[TOKEN_STAGING_ADDR] = classValue & 0xFF;

  seedEditBuffer(mem);
  mem[IY_PLUS_12_ADDR] &= 0x7F;

  cpu.a = classValue & 0xFF;
  cpu.b = classValue & 0xFF;
  cpu.c = 0x00;
  cpu.d = 0x00;
  cpu.e = 0x00;
  cpu.ix = IX_ADDR;
  cpu.iy = IY_ADDR;

  mem.fill(0xFF, Math.max(0, REQUESTED_SP - 0x40), Math.min(mem.length, REQUESTED_SP + 0x10));
  cpu.sp = REQUESTED_SP;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function runExperiment(baselineMem, classValue) {
  const mem = new Uint8Array(baselineMem);
  const before = new Uint8Array(mem);
  const { cpu, executor } = createCPU(mem);

  seedExperiment(cpu, mem, classValue);

  const trace = [];
  const uniqueBlocks = [];
  const uniqueSeen = new Set();
  const bufInsertSteps = [];

  let steps = 0;
  let lastPc = CXMAIN_CASCADE_ENTRY;
  let termination = 'max_steps';
  let errorMessage = null;

  const notePc = (pc, kind, step) => {
    const normalized = pc & 0xFFFFFF;
    const stepNumber = (step ?? trace.length) + 1;
    steps = Math.max(steps, stepNumber);
    lastPc = normalized;

    trace.push({
      step: stepNumber,
      kind,
      pc: hex(normalized),
    });

    if (!uniqueSeen.has(normalized)) {
      uniqueSeen.add(normalized);
      uniqueBlocks.push(hex(normalized));
    }

    if (normalized === BUF_INSERT) {
      bufInsertSteps.push(stepNumber);
    }

    if (normalized === RETURN_SENTINEL) {
      const error = new Error('__RET__');
      error.isReturnSentinel = true;
      throw error;
    }
  };

  try {
    const result = executor.runFrom(CXMAIN_CASCADE_ENTRY, 'adl', {
      maxSteps: TRACE_STEP_LIMIT,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, 'block', step);
      },
      onMissingBlock(pc, _mode, step) {
        notePc(pc, 'missing', step);
      },
    });

    termination = result.termination ?? termination;
    steps = Math.max(steps, result.steps ?? steps);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
  } catch (error) {
    if (error?.isReturnSentinel) {
      termination = 'return';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  const editBufferDiff = diffRange(before, mem, EDIT_BUF_START, EDIT_BUF_END);
  const editPointerDiff = diffRange(before, mem, EDIT_TOP_ADDR, EDIT_BTM_ADDR + 3);

  return {
    classValue: hexByte(classValue),
    setup: {
      entry: hex(CXMAIN_CASCADE_ENTRY),
      op1: bytesFor(mem, OP1_ADDR, 9),
      tokenStaging: bytesFor(mem, TOKEN_STAGING_ADDR, 9),
      editPointersBefore: snapshotEditPointers(before),
      editBufferWindowBefore: bytesFor(before, EDIT_BUF_START, 0x20),
    },
    run: {
      stepLimit: TRACE_STEP_LIMIT,
      steps,
      termination,
      lastPc: hex(lastPc),
      reachedBufInsert: bufInsertSteps.length > 0,
      bufInsertSteps,
      uniqueBlockCount: uniqueBlocks.length,
    },
    trace,
    uniqueBlocks,
    final: {
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
      editPointersAfter: snapshotEditPointers(mem),
      editBufferWindowAfter: bytesFor(mem, EDIT_BUF_START, 0x20),
      editBufferChanged: editBufferDiff.length > 0,
      editBufferDiff,
      editPointerDiff,
    },
    error: errorMessage,
  };
}

function summarizeExperiment(experiment) {
  return {
    termination: experiment.run.termination,
    steps: experiment.run.steps,
    lastPc: experiment.run.lastPc,
    reachedBufInsert: experiment.run.reachedBufInsert,
    bufInsertSteps: experiment.run.bufInsertSteps,
    editBufferChanged: experiment.final.editBufferChanged,
    editBufferDiffCount: experiment.final.editBufferDiff.length,
    uniqueBlockCount: experiment.run.uniqueBlockCount,
  };
}

function main() {
  const cascadeRows = disassembleRange(CXMAIN_CASCADE_ENTRY, CASCADE_END_EXCLUSIVE);
  const conditionalJumps = buildJumpBranchMap(cascadeRows);
  const conditionalCallsAndReturns = buildConditionalControlFlow(cascadeRows);
  const matchHandlers = buildMatchHandlerReport(cascadeRows);

  const baseline = createBaseline();
  const experiments = Object.fromEntries(
    [0x09, 0x0C, 0x0D].map((classValue) => {
      const key = hexByte(classValue);
      return [key, runExperiment(baseline.mem, classValue)];
    })
  );

  const bufInsertReachedFor = Object.values(experiments)
    .filter((experiment) => experiment.run.reachedBufInsert)
    .map((experiment) => experiment.classValue);

  const editBufferWrittenFor = Object.values(experiments)
    .filter((experiment) => experiment.final.editBufferChanged)
    .map((experiment) => experiment.classValue);

  return {
    probe: 'probe-phase210-cxmain-cp-branches.mjs',
    generatedAt: new Date().toISOString(),
    runtime: {
      timerInterrupt: false,
      baselineMemInitReturned: baseline.memInitReturned,
      traceStepLimit: TRACE_STEP_LIMIT,
      cascadeRange: `${hex(CXMAIN_CASCADE_ENTRY)}..${hex(CASCADE_END_EXCLUSIVE)}`,
    },
    addresses: {
      cxMainCascadeEntry: hex(CXMAIN_CASCADE_ENTRY),
      bufInsert: hex(BUF_INSERT),
      editBufferStart: hex(EDIT_BUF_START),
      editBufferEnd: hex(EDIT_BUF_END),
    },
    staticDisassembly: {
      cascadeInstructions: cascadeRows.map((row) => row.text),
      conditionalJumps,
      conditionalCallsAndReturns,
      cpMatchHandlers: matchHandlers,
    },
    executionExperiments: experiments,
    summary: {
      note: 'CP 0x09 / 0x0C / 0x0D matches enter via fallthrough after NZ branches.',
      bufInsertReachedFor,
      editBufferWrittenFor,
      experiments: Object.fromEntries(
        Object.entries(experiments).map(([key, experiment]) => [key, summarizeExperiment(experiment)])
      ),
    },
  };
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase210-cxmain-cp-branches.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
