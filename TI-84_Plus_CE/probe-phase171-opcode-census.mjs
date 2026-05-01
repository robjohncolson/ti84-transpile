#!/usr/bin/env node

/**
 * Phase 171 - Opcode Census of All Blocks Visited During gcd(12,8)
 *
 * Runs gcd(12,8), collects every unique block PC visited, then decodes each
 * block's instructions using the eZ80 decoder and tallies instruction types.
 * Prints a summary table so we know exactly which eZ80 instructions the
 * reference interpreter must support.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const ROM_TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

// ---------------------------------------------------------------------------
// Boot helpers (copied from phase 170 boilerplate)
// ---------------------------------------------------------------------------

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;
const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const GCD_ENTRY = 0x068d3d;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;
const FP_CATEGORY_ADDR = 0xd0060e;
const GCD_CATEGORY = 0x28;

const FPS_ADDR = 0xd0258d;
const FPSBASE_ADDR = 0xd0258a;
const OPS_ADDR = 0xd02593;
const OPBASE_ADDR = 0xd02590;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;
const FPS_CLEAN_AREA = 0xd1aa00;

const MAX_STEPS = 2000;
const MAX_LOOP_ITER = 8192;
const MEMINIT_BUDGET = 100000;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

// ---------------------------------------------------------------------------
// Runtime setup
// ---------------------------------------------------------------------------

function createRuntime(romBytes, BLOCKS) {
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

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
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
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
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

function seedRealRegister(mem, addr, bytes) {
  mem.fill(0x00, addr, addr + 11);
  mem.set(bytes, addr);
}

function seedGcdFpState(mem, op1Bytes, op2Bytes) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, op1Bytes);
  seedRealRegister(mem, OP2_ADDR, op2Bytes);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
}

function createPreparedRuntime(romBytes, BLOCKS) {
  const runtime = createRuntime(romBytes, BLOCKS);
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);

  const { executor, cpu, mem } = runtime;
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let memInitOk = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') memInitOk = true;
    else throw err;
  }

  return { ...runtime, memInitOk };
}

// ---------------------------------------------------------------------------
// Block decoder: decode instructions from ROM bytes until block boundary
// ---------------------------------------------------------------------------

/**
 * Decode all instructions starting at `blockPc` until we hit a terminating
 * instruction (ret, jp, call, jr, halt, etc.) or run off the end of ROM.
 * Returns an array of decoded instruction objects.
 */
function decodeBlock(romBytes, blockPc) {
  const instructions = [];
  let pc = blockPc;
  const ROM_END = 0x400000;

  while (pc < ROM_END) {
    let instr;
    try {
      instr = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      // Unknown opcode — treat as 1-byte unknown and stop
      instructions.push({ tag: 'unknown', pc, length: 1 });
      break;
    }

    instructions.push(instr);
    pc += instr.length;

    // Stop at block-terminating instructions
    if (instr.terminates) break;

    // Safety: don't decode more than 64 instructions in one block
    if (instructions.length >= 64) break;
  }

  return instructions;
}

// ---------------------------------------------------------------------------
// Main probe
// ---------------------------------------------------------------------------

async function main() {
  // Load ROM binary
  if (!fs.existsSync(ROM_BIN_PATH)) {
    throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
  }

  // Ensure transpiled JS is present (gunzip if needed)
  if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
    if (!fs.existsSync(ROM_TRANSPILED_GZ_PATH)) {
      throw new Error('ROM.transpiled.js and ROM.transpiled.js.gz both missing.');
    }
    console.log('ROM.transpiled.js not found — gunzipping...');
    const { execSync } = await import('node:child_process');
    execSync(`gunzip -kf "${ROM_TRANSPILED_GZ_PATH}"`, { stdio: 'inherit' });
    console.log('Gunzip done.');
  }

  const romBytes = fs.readFileSync(ROM_BIN_PATH);
  const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;

  if (!BLOCKS) throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');

  console.log('='.repeat(70));
  console.log('PHASE 171: OPCODE CENSUS OF gcd(12,8) BLOCKS');
  console.log('='.repeat(70));
  console.log('');

  // Boot the runtime
  const runtime = createPreparedRuntime(romBytes, BLOCKS);
  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }
  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  const { mem, executor, cpu } = runtime;

  // Seed gcd(12, 8)
  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 12.0
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 8.0

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, op1Bytes, op2Bytes);

  // Push OP2 to FPS before gcd entry (matches phase 170)
  const fpsPtr = read24(mem, FPS_ADDR);
  for (let i = 0; i < 9; i++) mem[fpsPtr + i] = mem[OP2_ADDR + i];
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  // --- Run gcd and collect unique block PCs ---
  const visitOrder = [];    // PC in visit order (with repeats)
  const uniquePCs = new Set();
  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        visitOrder.push(norm);
        uniquePCs.add(norm);
      },

      onMissingBlock(pc, _mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        visitOrder.push(norm);
        uniquePCs.add(norm);
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else {
      outcome = 'threw';
      console.log(`Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  console.log(`Outcome: ${outcome}  Steps: ${stepCount}  ErrNo: 0x${errNo.toString(16).padStart(2,'0')}`);
  console.log(`Total block visits: ${visitOrder.length}  Unique block PCs: ${uniquePCs.size}`);
  console.log('');

  // --- Decode every unique block and build census ---

  // tagStats: Map<tag, { blockCount: number, instrCount: number }>
  const tagStats = new Map();
  // blockInstrCounts: Map<pc, number>
  const blockInstrCounts = new Map();
  // blockTagSets: Map<pc, Set<tag>>  — which tags appear in each block
  const blockTagSets = new Map();

  let decodeErrors = 0;

  for (const pc of uniquePCs) {
    // Only decode ROM blocks (< 0x400000); RAM blocks are stubs
    if (pc >= 0x400000) {
      blockInstrCounts.set(pc, 0);
      blockTagSets.set(pc, new Set());
      continue;
    }

    const instrs = decodeBlock(romBytes, pc);
    blockInstrCounts.set(pc, instrs.length);

    const tagSet = new Set();
    for (const instr of instrs) {
      tagSet.add(instr.tag);

      if (!tagStats.has(instr.tag)) {
        tagStats.set(instr.tag, { blockCount: 0, instrCount: 0 });
      }
      tagStats.get(instr.tag).instrCount++;
    }
    blockTagSets.set(pc, tagSet);

    if (instrs.some(i => i.tag === 'unknown')) decodeErrors++;
  }

  // Count how many unique blocks each tag appears in
  for (const [_pc, tagSet] of blockTagSets) {
    for (const tag of tagSet) {
      if (tagStats.has(tag)) tagStats.get(tag).blockCount++;
    }
  }

  // --- Section 1: Summary table sorted by instrCount desc ---
  console.log('--- SECTION 1: INSTRUCTION TYPE CENSUS (sorted by instruction count) ---');
  console.log('');

  const sorted = [...tagStats.entries()].sort((a, b) => b[1].instrCount - a[1].instrCount);
  const colW = 28;
  console.log(`  ${'Instruction Tag'.padEnd(colW)} | ${'Blocks'.padStart(6)} | ${'Total Instrs'.padStart(12)}`);
  console.log('  ' + '-'.repeat(colW + 25));
  for (const [tag, { blockCount, instrCount }] of sorted) {
    console.log(`  ${tag.padEnd(colW)} | ${String(blockCount).padStart(6)} | ${String(instrCount).padStart(12)}`);
  }
  console.log('');
  console.log(`  Total unique tags: ${tagStats.size}`);
  if (decodeErrors > 0) console.log(`  Blocks with unknown opcodes: ${decodeErrors}`);
  console.log('');

  // --- Section 2: Per-block instruction counts ---
  console.log('--- SECTION 2: PER-BLOCK INSTRUCTION COUNTS (unique blocks, sorted by PC) ---');
  console.log('');
  console.log(`  ${'PC'.padEnd(10)} | ${'Instrs'.padStart(6)} | Tags`);
  console.log('  ' + '-'.repeat(70));

  const sortedPCs = [...uniquePCs].sort((a, b) => a - b);
  for (const pc of sortedPCs) {
    const count = blockInstrCounts.get(pc) ?? 0;
    const tags = [...(blockTagSets.get(pc) ?? [])].join(', ');
    console.log(`  ${hex(pc).padEnd(10)} | ${String(count).padStart(6)} | ${tags}`);
  }
  console.log('');

  // --- Section 3: Tags grouped by category ---
  console.log('--- SECTION 3: TAG CATEGORIES ---');
  console.log('');

  const categories = {
    'Load (register)':    ['ld-reg-reg', 'ld-reg-imm', 'ld-reg-ind', 'ld-reg-ixd', 'ld-reg-mem'],
    'Load (pair)':        ['ld-pair-imm', 'ld-pair-mem', 'ld-pair-ind', 'ld-pair-indexed', 'ld-pair-ixd', 'ld-ixiy-indexed'],
    'Store':              ['ld-ind-reg', 'ld-ind-imm', 'ld-ind-pair', 'ld-ixd-reg', 'ld-ixd-imm', 'ld-indexed-pair', 'ld-indexed-ixiy', 'ld-mem-reg', 'ld-mem-pair'],
    'Load special':       ['ld-special', 'ld-sp-hl', 'ld-sp-pair', 'ld-mb-a', 'ld-a-mb'],
    'ALU (8-bit)':        ['alu-reg', 'alu-imm', 'alu-ixd', 'neg', 'daa', 'cpl', 'scf', 'ccf'],
    'ALU (16-bit)':       ['add-pair', 'adc-pair', 'sbc-pair', 'inc-pair', 'dec-pair', 'inc-ixd', 'dec-ixd', 'mlt'],
    'Inc/Dec (8-bit)':    ['inc-reg', 'dec-reg'],
    'Rotate/Shift':       ['rotate-reg', 'rotate-ind', 'indexed-cb-rotate', 'rlca', 'rrca', 'rla', 'rra', 'rld', 'rrd'],
    'Bit ops':            ['bit-test', 'bit-test-ind', 'bit-res', 'bit-res-ind', 'bit-set', 'bit-set-ind', 'indexed-cb-bit', 'indexed-cb-res', 'indexed-cb-set', 'tst-reg', 'tst-ind', 'tst-imm', 'tstio'],
    'Control flow':       ['jp', 'jp-conditional', 'jp-indirect', 'jr', 'jr-conditional', 'djnz', 'call', 'call-conditional', 'ret', 'ret-conditional', 'rst', 'reti', 'retn', 'halt', 'slp'],
    'Stack':              ['push', 'pop', 'ex-sp-hl', 'ex-sp-pair'],
    'Exchange':           ['ex-af', 'ex-de-hl', 'exx'],
    'Block ops':          ['ldi', 'ldd', 'ldir', 'lddr', 'cpi', 'cpd', 'cpir', 'cpdr'],
    'I/O':                ['in0', 'out0', 'in-reg', 'out-reg', 'in-imm', 'out-imm', 'ini', 'outi', 'ind', 'outd', 'inir', 'otir', 'indr', 'otdr', 'otimr'],
    'Mode switch':        ['stmix', 'rsmix'],
    'eZ80 LEA':           ['lea'],
    'Misc':               ['nop', 'di', 'ei', 'im', 'unknown'],
  };

  for (const [catName, catTags] of Object.entries(categories)) {
    const present = catTags.filter(t => tagStats.has(t));
    if (present.length === 0) continue;

    console.log(`  ${catName}:`);
    for (const tag of present) {
      const { blockCount, instrCount } = tagStats.get(tag);
      console.log(`    ${tag.padEnd(26)} blocks=${blockCount}  instrs=${instrCount}`);
    }
  }

  console.log('');
  console.log('Done.');
  process.exitCode = 0;
}

main().catch(err => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
