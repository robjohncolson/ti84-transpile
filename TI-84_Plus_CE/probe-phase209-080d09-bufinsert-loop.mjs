#!/usr/bin/env node
/**
 * Phase 209 Probe: BufInsert call site at 0x080D09 — loop structure analysis
 *
 * This is in the FP/validation region. The call loops over a buffer at
 * 0xD0060E (near OP1 at 0xD005F8). This is likely the "display numeric
 * result" path — formatting a computed value into the edit buffer.
 *
 * Goals:
 *   1. Statically disassemble ~64 bytes around 0x080D09
 *   2. Find the transpiled block entry containing this address
 *   3. Trace execution from the block entry with seeded state
 *   4. Monitor BufInsert calls (DE values)
 *   5. Dump the edit buffer after trace
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

const RETURN_SENTINEL = 0x7FFFFE;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const MAX_LOOP_ITERATIONS = 8192;

// Target addresses
const BUF_INSERT = 0x05E2A0;
const CALL_SITE = 0x080D09;
const FMT_BUFFER = 0xD0060E;
const OP1_ADDR = 0xD005F8;

// Edit buffer
const EDIT_TOP_ADDR = 0xD02437;
const EDIT_CURSOR_ADDR = 0xD0243A;
const EDIT_TAIL_ADDR = 0xD0243D;
const EDIT_BTM_ADDR = 0xD02440;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;

const STEP_LIMIT = 200;

// Block entry candidates to search
const BLOCK_CANDIDATES = [
  0x080D09, 0x080D00, 0x080CF0, 0x080CE0, 0x080CD0, 0x080CC0,
  0x080CB0, 0x080CA0, 0x080C90, 0x080C80,
];

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
    case 'indexed-ld-pair':
      return `LD ${inst.pair.toUpperCase()}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-st-pair':
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
    case 'ld-sp-index': return `LD SP, ${inst.indexRegister.toUpperCase()}`;
    case 'ex-sp-index': return `EX (SP), ${inst.indexRegister.toUpperCase()}`;
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

// ── Static disassembly ───────────────────────────────────────────────

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
      text: `${hex(inst.pc)}: ${rawBytes.padEnd(20)} ${formatInstruction(inst)}${marker}`,
    });
    pc = inst.nextPc;
  }

  return rows;
}

// ── Block entry search ───────────────────────────────────────────────

function findBlockEntry() {
  const found = [];
  for (const candidate of BLOCK_CANDIDATES) {
    const key = `${candidate.toString(16).padStart(6, '0')}:adl`;
    if (PRELIFTED_BLOCKS[key]) {
      found.push({ address: hex(candidate), key, exists: true });
    }
  }

  // Also search a wider range
  for (let addr = 0x080C00; addr <= 0x080D20; addr += 1) {
    const key = `${addr.toString(16).padStart(6, '0')}:adl`;
    if (PRELIFTED_BLOCKS[key] && !found.some(f => f.key === key)) {
      found.push({ address: hex(addr), key, exists: true });
    }
  }

  return found;
}

// ── Memory / CPU setup ───────────────────────────────────────────────

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
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
  const mem = createMemoryWithRom();
  const { cpu, executor } = createCPU(mem);
  coldBoot(executor, cpu, mem);
  runMemInit(executor, cpu, mem);
  return new Uint8Array(mem);
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL_ADDR, EDIT_BUF_END);
  write24(mem, EDIT_BTM_ADDR, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

// ── Execution trace ──────────────────────────────────────────────────

function traceFromBlock(baselineMem, entryAddr) {
  const mem = new Uint8Array(baselineMem);
  const { cpu, executor } = createCPU(mem);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);

  // Seed OP1 with BCD float 5.0: type=00 (real), exp=80, mantissa=50000...
  const bcdFloat5 = [0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  mem.set(bcdFloat5, OP1_ADDR);

  // Seed formatting buffer at 0xD0060E with ASCII "5\0"
  mem[FMT_BUFFER] = 0x35; // '5'
  mem[FMT_BUFFER + 1] = 0x00; // null terminator

  // Set HL to point at the format buffer (likely source pointer)
  cpu.hl = FMT_BUFFER;
  cpu.de = 0x000035; // likely token value for '5'

  // Set up return sentinel
  cpu.sp = STACK_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const blocksVisited = [];
  const bufInsertCalls = [];
  let stepCount = 0;
  let stopped = false;
  let stopReason = '';

  try {
    executor.runFrom(entryAddr, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: 50,
      onBlock(pc) {
        const masked = pc & 0xFFFFFF;
        stepCount++;
        blocksVisited.push(hex(masked));

        // Monitor BufInsert calls
        if (masked === BUF_INSERT) {
          bufInsertCalls.push({
            step: stepCount,
            de: hex(cpu.de),
            deChar: cpu.de >= 0x20 && cpu.de <= 0x7E ? String.fromCharCode(cpu.de & 0xFF) : null,
            hl: hex(cpu.hl),
          });
        }

        if (masked === RETURN_SENTINEL) {
          stopped = true;
          stopReason = 'returned to sentinel';
          throw new Error('__STOP__');
        }
      },
      onMissingBlock(pc) {
        const masked = pc & 0xFFFFFF;
        if (masked === RETURN_SENTINEL) {
          stopped = true;
          stopReason = 'returned to sentinel (missing)';
          throw new Error('__STOP__');
        }
        stopped = true;
        stopReason = `missing block at ${hex(masked)}`;
        throw new Error('__STOP__');
      },
    });
  } catch (error) {
    if (error?.message !== '__STOP__') {
      stopReason = `error: ${error?.message}`;
    }
  }

  if (!stopped) stopReason = `step limit (${STEP_LIMIT})`;

  // Dump edit buffer
  const editBufDump = [];
  for (let i = 0; i < 0x10; i++) {
    editBufDump.push(mem[EDIT_BUF_START + i].toString(16).toUpperCase().padStart(2, '0'));
  }

  // Dump format buffer area
  const fmtBufDump = [];
  for (let i = 0; i < 0x10; i++) {
    fmtBufDump.push(mem[FMT_BUFFER + i].toString(16).toUpperCase().padStart(2, '0'));
  }

  return {
    entryAddr: hex(entryAddr),
    stepCount,
    stopReason,
    blocksVisited: blocksVisited.slice(0, 50),
    totalBlocksVisited: blocksVisited.length,
    bufInsertCalls,
    editBuffer: editBufDump.join(' '),
    editCursor: hex(read24(mem, EDIT_CURSOR_ADDR)),
    fmtBuffer: fmtBufDump.join(' '),
    cpuState: {
      a: hexByte(cpu.a),
      f: hexByte(cpu.f),
      bc: hex(cpu.bc),
      de: hex(cpu.de),
      hl: hex(cpu.hl),
      sp: hex(cpu.sp),
    },
  };
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const results = {};

  // 1. Static disassembly around 0x080D09
  console.error('Phase 1: Static disassembly around 0x080D09...');
  const disasmStart = CALL_SITE - 32; // 32 bytes before
  const disasmLength = 64;
  const disasm = disassembleRange(disasmStart, disasmLength);
  results.disassembly = {
    range: `${hex(disasmStart)} - ${hex(disasmStart + disasmLength)}`,
    callSiteAddress: hex(CALL_SITE),
    instructions: disasm.map(r => r.text),
    rawRows: disasm,
  };

  // 2. Find transpiled block entry
  console.error('Phase 2: Finding transpiled block entries...');
  const blockEntries = findBlockEntry();
  results.blockEntries = blockEntries;

  // Pick the best entry (closest block at or before 0x080D09)
  let bestEntry = null;
  for (const entry of blockEntries) {
    const addr = parseInt(entry.address.slice(2), 16);
    if (addr <= CALL_SITE) {
      if (!bestEntry || addr > parseInt(bestEntry.address.slice(2), 16)) {
        bestEntry = entry;
      }
    }
  }
  results.bestBlockEntry = bestEntry;

  // 3-5. Trace execution
  if (bestEntry) {
    const entryAddr = parseInt(bestEntry.address.slice(2), 16);
    console.error(`Phase 3-5: Tracing from block entry ${bestEntry.address}...`);

    console.error('  Creating baseline (cold boot + memInit)...');
    const baselineMem = createBaseline();

    console.error('  Running trace...');
    const trace = traceFromBlock(baselineMem, entryAddr);
    results.trace = trace;
  } else {
    console.error('No block entry found — trying direct trace from 0x080D09');
    console.error('  Creating baseline...');
    const baselineMem = createBaseline();
    console.error('  Running trace from call site directly...');
    const trace = traceFromBlock(baselineMem, CALL_SITE);
    results.trace = trace;
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
