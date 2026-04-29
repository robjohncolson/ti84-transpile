#!/usr/bin/env node

/**
 * Phase 128 — 0xBB-prefix two-byte token dispatch investigation
 *
 * When ParseInp encounters a 0xBB prefix token (e.g., min(3,7)), it
 * stalls at PC=0x001221. This probe investigates that stall:
 *   1. Traces execution with PC hit counting to find the hotspot
 *   2. Dumps ROM bytes at/around the stall address
 *   3. Checks if PRELIFTED_BLOCKS covers 0x001221
 *   4. Identifies missing blocks that need seeds
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';
import { decodeInstruction as decodeEz80 } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const PARSEINP_ENTRY = 0x099914;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const TOKEN_BUFFER_ADDR = 0xd00800;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

// min(3,7) = [0xBB, 0x0C, 0x33, 0x2B, 0x37, 0x11, 0x3F]
// 0xBB 0x0C = min(   0x33 = 3   0x2B = ,   0x37 = 7   0x11 = )   0x3F = end
const INPUT_TOKENS = Uint8Array.from([0xBB, 0x0C, 0x33, 0x2B, 0x37, 0x11, 0x3F]);

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const write24 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
};

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

const memWrap = (m) => ({
  write8(a, v) { m[a] = v & 0xff; },
  read8(a) { return m[a] & 0xff; },
});

function safeReadReal(w, a) {
  try { return readReal(w, a); }
  catch (e) { return `readReal error: ${e?.message ?? e}`; }
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu, wrap: memWrap(mem) };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
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

// ── Disassembler helper ───────────────────────────────────────────────────

function disassembleRange(startAddr, endAddr) {
  let pc = startAddr;
  const lines = [];
  while (pc < endAddr) {
    try {
      const instr = decodeEz80(romBytes, pc, true); // ADL mode
      const bytes = hexBytes(romBytes, pc, instr.length);
      lines.push(`  ${hex(pc)}: ${bytes.padEnd(20)} ${instr.mnemonic || instr.tag || '???'}`);
      pc += instr.length;
    } catch (e) {
      lines.push(`  ${hex(pc)}: ${hexBytes(romBytes, pc, 1).padEnd(20)} ??? (decode error: ${e.message})`);
      pc += 1;
    }
  }
  return lines;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 128: 0xBB-prefix Two-Byte Token Dispatch Investigation ===');
  console.log(`Input: min(3,7) = [${Array.from(INPUT_TOKENS, (b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
  console.log('');

  // ── Task 1: Check PRELIFTED_BLOCKS coverage around 0x001221 ──

  console.log('--- Task 1: Block coverage check around 0x001221 ---');
  const stall_addr = 0x001221;
  let blockCovers = false;
  let coveringBlockPc = null;

  // Check if any block covers 0x001221
  for (const key of Object.keys(BLOCKS)) {
    // Keys might be numeric or string
    const blockPc = typeof key === 'string' ? parseInt(key) : key;
    if (isNaN(blockPc)) continue;
    const block = BLOCKS[key];
    if (!block) continue;

    // Check if blockPc <= stall_addr < blockPc + block size
    // We can check block.instructions or block.length
    if (block.instructions && Array.isArray(block.instructions)) {
      const lastInstr = block.instructions[block.instructions.length - 1];
      const blockEnd = blockPc + (lastInstr ? lastInstr.offset + lastInstr.length : 0);
      if (blockPc <= stall_addr && stall_addr < blockEnd) {
        blockCovers = true;
        coveringBlockPc = blockPc;
        break;
      }
    }
  }

  // Also check directly
  const directBlock = BLOCKS[stall_addr] || BLOCKS[`0x${stall_addr.toString(16)}`];
  if (directBlock) {
    console.log(`  Block exists at exactly ${hex(stall_addr)}`);
    blockCovers = true;
    coveringBlockPc = stall_addr;
  }

  // Check nearby blocks
  console.log('  Checking blocks near 0x001221:');
  for (let pc = stall_addr - 0x20; pc <= stall_addr + 0x20; pc++) {
    if (BLOCKS[pc]) {
      console.log(`    Block at ${hex(pc)} exists`);
    }
  }

  if (blockCovers) {
    console.log(`  Block at ${hex(coveringBlockPc)} COVERS ${hex(stall_addr)}`);
  } else {
    console.log(`  NO block covers ${hex(stall_addr)} — this is a missing block!`);
  }
  console.log('');

  // ── Task 2: Disassemble ROM around 0x001221 ──

  console.log('--- Task 2: ROM disassembly around 0x001221 ---');
  console.log(`  Raw bytes at 0x001200-0x001260:`);
  for (let row = 0x001200; row < 0x001260; row += 16) {
    console.log(`    ${hex(row)}: ${hexBytes(romBytes, row, 16)}`);
  }
  console.log('');

  console.log('  Disassembly (ADL mode) 0x001200-0x001260:');
  const disasm = disassembleRange(0x001200, 0x001260);
  for (const line of disasm) console.log(line);
  console.log('');

  // Also disassemble 0x001220-0x001240 more carefully
  console.log('  Focused disassembly 0x001218-0x001240:');
  const focusDisasm = disassembleRange(0x001218, 0x001240);
  for (const line of focusDisasm) console.log(line);
  console.log('');

  // ── Task 3: Run ParseInp with 0xBB token and trace ──

  console.log('--- Task 3: ParseInp execution trace with min(3,7) ---');
  const { mem, executor, cpu, wrap } = createRuntime();
  coldBoot(executor, cpu, mem);

  // MEM_INIT
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let meminitDone = false;
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
  } catch (e) {
    if (e?.message === '__RET__') meminitDone = true;
    else throw e;
  }
  console.log(`  MEM_INIT: ${meminitDone ? 'returned OK' : 'FAILED'}`);
  if (!meminitDone) { process.exitCode = 1; return; }

  // Seed tokens
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  seedAllocator(mem);

  // Set LCD ready flag so busy-wait at 0x001221 terminates
  // (IY+0x18) = 0xD00098, bit 0 must be set
  mem[0xD00098] |= 0x01;

  // Check (IY+0x36) = 0xD000B6 flag
  console.log(`  (IY+0x36) = mem[0xD000B6] = ${hex(mem[0xD000B6], 2)} (bit 1 = ${(mem[0xD000B6] >> 1) & 1})`);
  console.log(`  If bit 1 is set, CALL NZ at 0x09B0DB will clobber register B`);

  // ParseInp with detailed tracing -- track errNo transitions
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, errBase, ERR_CATCH_ADDR);
  write24(mem, errBase + 3, 0);
  write24(mem, ERR_SP_ADDR, errBase);
  mem[ERR_NO_ADDR] = 0x00;

  const pcHitCounts = new Map();
  const pcOrder = [];       // first-seen order
  const recentPcs = [];
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let missingBlockPcs = new Set();
  let stepCount = 0;
  let prevErrNo = 0;
  const errNoTransitions = [];
  const firstNPcs = [];       // first N PCs for tracing the dispatch path
  const FIRST_N_LIMIT = 1000;
  let stallStartStep = -1;    // when did we first hit 0x001221?
  let prevErrSP = read24(mem, ERR_SP_ADDR);
  const errSPTransitions = [];

  try {
    const res = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (step !== undefined) stepCount = Math.max(stepCount, step + 1);
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        if (pcHitCounts.get(norm) === 1) pcOrder.push(norm);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (firstNPcs.length < FIRST_N_LIMIT) firstNPcs.push(norm);
        // Track errNo changes
        const curErrNo = mem[ERR_NO_ADDR] & 0xff;
        if (curErrNo !== prevErrNo) {
          const ops = read24(mem, OPS_ADDR);
          const opBase = read24(mem, OPBASE_ADDR);
          const fps = read24(mem, FPS_ADDR);
          const sp = cpu.sp;
          errNoTransitions.push({ step: stepCount, pc: norm, from: prevErrNo, to: curErrNo, ops, opBase, fps, sp });
          prevErrNo = curErrNo;
        }
        // Track errSP changes
        const curErrSP = read24(mem, ERR_SP_ADDR);
        if (curErrSP !== prevErrSP) {
          errSPTransitions.push({ step: stepCount, pc: norm, from: prevErrSP, to: curErrSP });
          prevErrSP = curErrSP;
        }
        // Snapshot OPS at key points along the min() evaluation path
        if (norm === 0x066350 || norm === 0x09B0E5 || norm === 0x09B112 || norm === 0x09B0DF
            || norm === 0x09AEBC || norm === 0x09AEC1 || norm === 0x09AEC6
            || norm === 0x09B5EA || norm === 0x09AF7E
            || norm === 0x09B026 || norm === 0x09B03D || norm === 0x09B042
            || norm === 0x09B063 || norm === 0x09B06B || norm === 0x09B082
            || norm === 0x06670E || norm === 0x06672A) {
          const opsAddr = read24(mem, OPS_ADDR);
          const opBaseAddr = read24(mem, OPBASE_ADDR);
          const depth = opBaseAddr - opsAddr;
          const fpsAddr = read24(mem, FPS_ADDR);
          const fpsBaseAddr = read24(mem, FPSBASE_ADDR);
          const fpsDepth = fpsAddr - fpsBaseAddr;
          console.log(`    [FP snapshot] step=${stepCount} PC=${hex(norm)} OPS=${hex(opsAddr)} OPBase=${hex(opBaseAddr)} depth=${depth} FPS=${hex(fpsAddr)} FPSbase=${hex(fpsBaseAddr)} fpsDepth=${fpsDepth}`);
          // Dump the entries on OPS (growing downward from OPBase)
          for (let off = 0; off < Math.min(depth, 27); off += 9) {
            const entryAddr = opBaseAddr - 9 - off;
            console.log(`      OPS[${off/9}] @ ${hex(entryAddr)}: ${hexBytes(mem, entryAddr, 9)}`);
          }
          // Dump FPS entries (growing upward from FPSbase)
          if (fpsDepth > 0) {
            for (let off = 0; off < Math.min(fpsDepth, 27); off += 9) {
              const entryAddr = fpsBaseAddr + off;
              console.log(`      FPS[${off/9}] @ ${hex(entryAddr)}: ${hexBytes(mem, entryAddr, 9)}`);
            }
          }
          // Also dump OP1 and OP2
          console.log(`      OP1 @ ${hex(OP1_ADDR)}: ${hexBytes(mem, OP1_ADDR, 9)}`);
          console.log(`      OP2 @ ${hex(OP1_ADDR + 11)}: ${hexBytes(mem, OP1_ADDR + 11, 9)}`);
          const d_byte = (cpu._de >>> 8) & 0xff;
          const e_byte = cpu._de & 0xff;
          console.log(`      regs: A=${hex(cpu.a, 2)} F=${hex(cpu.f, 2)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} (D=${hex(d_byte,2)} E=${hex(e_byte,2)}) HL=${hex(cpu._hl)} SP=${hex(cpu.sp)}`);
        }
        // Track when we first enter the stall
        if (norm === 0x001221 && stallStartStep === -1) {
          stallStartStep = stepCount;
        }
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        missingBlockPcs.add(norm);
        if (step !== undefined) stepCount = Math.max(stepCount, step + 1);
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (firstNPcs.length < FIRST_N_LIMIT) firstNPcs.push(norm);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
    finalPc = (res.lastPc ?? finalPc) & 0xffffff;
    stepCount = Math.max(stepCount, res.steps ?? 0);
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
    else throw e;
  }

  console.log(`  ParseInp result: returnHit=${returnHit} errCaught=${errCaught} steps=${stepCount}`);
  console.log(`  Final PC: ${hex(finalPc)}`);
  console.log(`  errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)}`);
  console.log('');

  // Top-20 hottest PCs
  const sorted = [...pcHitCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  Top-20 hottest PCs:');
  for (let i = 0; i < Math.min(20, sorted.length); i++) {
    const [pc, hits] = sorted[i];
    const isMissing = missingBlockPcs.has(pc) ? ' [MISSING BLOCK]' : '';
    console.log(`    ${hex(pc)}: ${hits} hits${isMissing}`);
  }
  console.log('');

  // Missing blocks
  if (missingBlockPcs.size > 0) {
    console.log(`  Missing block addresses (${missingBlockPcs.size} unique):`);
    const sortedMissing = [...missingBlockPcs].sort((a, b) => a - b);
    for (const pc of sortedMissing) {
      const hits = pcHitCounts.get(pc) || 0;
      console.log(`    ${hex(pc)}: ${hits} hits`);
      // Disassemble a few instructions at this address
      const instrLines = disassembleRange(pc, Math.min(pc + 16, 0x400000));
      for (const line of instrLines) console.log(`      ${line}`);
    }
    console.log('');
  }

  // Last N PCs
  console.log(`  Last ${RECENT_PC_LIMIT} PCs visited:`);
  const lastChunk = recentPcs.slice(-64);
  for (let i = 0; i < lastChunk.length; i += 8) {
    console.log(`    ${lastChunk.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }
  console.log('');

  // errNo transitions
  if (errNoTransitions.length > 0) {
    console.log('  errNo transitions:');
    for (const t of errNoTransitions) {
      console.log(`    step ${t.step}: PC=${hex(t.pc)} errNo ${hex(t.from, 2)} -> ${hex(t.to, 2)} OPS=${hex(t.ops)} OPBase=${hex(t.opBase)} FPS=${hex(t.fps)} SP=${hex(t.sp)}`);
    }
    console.log('');
  }

  // errSP transitions
  if (errSPTransitions.length > 0) {
    console.log('  errSP transitions:');
    for (const t of errSPTransitions) {
      console.log(`    step ${t.step}: PC=${hex(t.pc)} errSP ${hex(t.from)} -> ${hex(t.to)}`);
    }
    console.log('');
  }

  // Check what errSP points to
  const finalErrSP = read24(mem, ERR_SP_ADDR);
  console.log(`  Final errSP: ${hex(finalErrSP)}`);
  if (finalErrSP > 0 && finalErrSP < MEM_SIZE - 6) {
    const errTarget = read24(mem, finalErrSP);
    const errPrev = read24(mem, finalErrSP + 3);
    console.log(`    errSP[0..2] (error target): ${hex(errTarget)}`);
    console.log(`    errSP[3..5] (prev frame):   ${hex(errPrev)}`);
  }
  console.log('');

  console.log(`  First hit of 0x001221 stall: step ${stallStartStep}`);
  // Show the 20 PCs before the stall
  if (stallStartStep > 0) {
    const stallIdx = firstNPcs.indexOf(0x001221);
    if (stallIdx >= 0) {
      const before = firstNPcs.slice(Math.max(0, stallIdx - 30), stallIdx + 5);
      console.log(`  PCs leading to stall (indices ${Math.max(0, stallIdx - 30)} to ${stallIdx + 4}):`);
      for (let i = 0; i < before.length; i++) {
        const marker = before[i] === 0x001221 ? ' <<<STALL' : '';
        console.log(`    [${Math.max(0, stallIdx - 30) + i}] ${hex(before[i])}${marker}`);
      }
    }
    console.log('');
  }

  // First N PCs (to trace the 0xBB dispatch path)
  console.log(`  First ${Math.min(firstNPcs.length, FIRST_N_LIMIT)} PCs visited (dispatch path trace):`);
  const showPcs = firstNPcs.slice(0, FIRST_N_LIMIT);
  for (let i = 0; i < showPcs.length; i += 8) {
    console.log(`    ${showPcs.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }
  console.log('');

  // curPC after ParseInp — shows where it stopped reading tokens
  console.log(`  curPC after ParseInp: ${hex(read24(mem, CURPC_ADDR))} (started at ${hex(TOKEN_BUFFER_ADDR)})`);
  const bytesConsumed = read24(mem, CURPC_ADDR) - TOKEN_BUFFER_ADDR;
  console.log(`  Bytes consumed: ${bytesConsumed} of ${INPUT_TOKENS.length}`);
  console.log('');

  // OP1 result
  const op1val = safeReadReal(wrap, OP1_ADDR);
  console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}] decoded=${typeof op1val === 'number' ? op1val.toFixed(6) : String(op1val)}`);

  // Dump OPS area
  const finalOPS = read24(mem, OPS_ADDR);
  const finalOPBase = read24(mem, OPBASE_ADDR);
  console.log(`  OPS=${hex(finalOPS)} OPBase=${hex(finalOPBase)}`);
  if (finalOPS > 0 && finalOPS < MEM_SIZE && finalOPBase < MEM_SIZE) {
    const start = Math.min(finalOPS, finalOPBase) - 18;
    const end = Math.max(finalOPS, finalOPBase) + 18;
    console.log(`  OPS area dump (${hex(start)}-${hex(end)}):`);
    for (let row = start; row < end; row += 9) {
      const marker = (row === finalOPS) ? ' <--OPS' : (row === finalOPBase) ? ' <--OPBase' : '';
      console.log(`    ${hex(row)}: ${hexBytes(mem, row, 9)}${marker}`);
    }
  }
  console.log('');

  // ── Summary ──
  console.log('=== Summary ===');
  if (missingBlockPcs.size > 0) {
    console.log(`Missing blocks to seed: ${[...missingBlockPcs].sort((a,b) => a-b).map(hex).join(', ')}`);
  }
  if (returnHit) {
    console.log('ParseInp returned successfully!');
  } else if (errCaught) {
    console.log(`ParseInp caught error (errNo=${hex(mem[ERR_NO_ADDR] & 0xff, 2)})`);
  } else {
    console.log(`ParseInp stalled at ${hex(finalPc)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
