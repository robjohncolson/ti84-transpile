#!/usr/bin/env node

/**
 * Phase 130 — Trace upstream FP op-code dispatch for min/max vs gcd
 *
 * 1. Trace the last 30 PCs leading to 0x0686EF for gcd(12,8)
 * 2. Trace the last 30 PCs leading to 0x0686EF for min(3,7)
 * 3. Compare divergence points between gcd and min dispatch paths
 * 4. Check if 0x06859B is in BLOCKS table (missing block for gcd)
 * 5. Dump OPS contents at dispatch entry for both cases
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

const FP_DISPATCH_ADDR = 0x0686EF;

// Token encodings
const GCD_TOKENS = Uint8Array.from([0xBB, 0x07, 0x31, 0x32, 0x2B, 0x38, 0x11, 0x3F]);
const MIN_TOKENS = Uint8Array.from([0xBB, 0x0C, 0x33, 0x2B, 0x37, 0x11, 0x3F]);

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;

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

function disassembleRange(source, startAddr, endAddr) {
  let pc = startAddr;
  const lines = [];
  while (pc < endAddr) {
    try {
      const instr = decodeEz80(source, pc, true); // ADL mode
      const bytes = hexBytes(source, pc, instr.length);
      lines.push(`  ${hex(pc)}: ${bytes.padEnd(20)} ${instr.mnemonic || instr.tag || '???'}`);
      pc += instr.length;
    } catch (e) {
      lines.push(`  ${hex(pc)}: ${hexBytes(source, pc, 1).padEnd(20)} ??? (decode error: ${e.message})`);
      pc += 1;
    }
  }
  return lines;
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

// ── Run MEM_INIT + ParseInp, then continue tracing to FP dispatch ────────

function traceToDispatch(label, tokens) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Tokens: [${Array.from(tokens, b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);

  const { mem, executor, cpu, wrap } = createRuntime();
  coldBoot(executor, cpu, mem);

  // ── MEM_INIT ──
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let meminitDone = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') meminitDone = true;
    else throw e;
  }
  console.log(`  MEM_INIT: ${meminitDone ? 'OK' : 'FAILED'}`);
  if (!meminitDone) return null;

  // ── Seed tokens ──
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(tokens, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + tokens.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  seedAllocator(mem);

  // ── ParseInp ── (run to FAKE_RET or ERR_CATCH first to parse the expression)
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, errBase, ERR_CATCH_ADDR);
  write24(mem, errBase + 3, 0);
  write24(mem, ERR_SP_ADDR, errBase);
  mem[ERR_NO_ADDR] = 0x00;

  // Circular buffer of last 30 PCs
  const TRACE_SIZE = 30;
  const pcTrace = [];
  const missingBlockPcs = new Set();
  let hitDispatch = false;
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;
  let dispatchA = null;
  let dispatchF = null;
  let dispatchRegs = null;
  let opsDumpAtDispatch = null;
  let pcTraceAtDispatch = null;

  try {
    executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        if (step !== undefined) stepCount = Math.max(stepCount, step + 1);
        pcTrace.push(norm);
        if (pcTrace.length > TRACE_SIZE) pcTrace.shift();

        // Check if we've reached FP dispatch entry at 0x0686EF
        if (norm === FP_DISPATCH_ADDR && !hitDispatch) {
          hitDispatch = true;
          dispatchA = cpu.a & 0xff;
          dispatchF = cpu.f & 0xff;
          dispatchRegs = {
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            bc: cpu._bc,
            de: cpu._de,
            hl: cpu._hl,
            sp: cpu.sp,
            ix: cpu._ix,
            iy: cpu._iy,
          };
          // Dump OPS
          const opsAddr = read24(mem, OPS_ADDR);
          const opBaseAddr = read24(mem, OPBASE_ADDR);
          opsDumpAtDispatch = {
            opsAddr,
            opBaseAddr,
            depth: (opBaseAddr > opsAddr) ? opBaseAddr - opsAddr : 0,
            bytes: [],
          };
          if (opsAddr < opBaseAddr && opBaseAddr < MEM_SIZE) {
            const len = Math.min(16, opBaseAddr - opsAddr);
            for (let i = 0; i < len; i++) {
              opsDumpAtDispatch.bytes.push(mem[opsAddr + i] & 0xff);
            }
          }
          // Snapshot the PC trace at this moment
          pcTraceAtDispatch = [...pcTrace];
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        if (step !== undefined) stepCount = Math.max(stepCount, step + 1);
        missingBlockPcs.add(norm);
        pcTrace.push(norm);
        if (pcTrace.length > TRACE_SIZE) pcTrace.shift();

        if (norm === FP_DISPATCH_ADDR && !hitDispatch) {
          hitDispatch = true;
          dispatchA = cpu.a & 0xff;
          dispatchF = cpu.f & 0xff;
          dispatchRegs = {
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            bc: cpu._bc,
            de: cpu._de,
            hl: cpu._hl,
            sp: cpu.sp,
            ix: cpu._ix,
            iy: cpu._iy,
          };
          const opsAddr = read24(mem, OPS_ADDR);
          const opBaseAddr = read24(mem, OPBASE_ADDR);
          opsDumpAtDispatch = {
            opsAddr,
            opBaseAddr,
            depth: (opBaseAddr > opsAddr) ? opBaseAddr - opsAddr : 0,
            bytes: [],
          };
          if (opsAddr < opBaseAddr && opBaseAddr < MEM_SIZE) {
            const len = Math.min(16, opBaseAddr - opsAddr);
            for (let i = 0; i < len; i++) {
              opsDumpAtDispatch.bytes.push(mem[opsAddr + i] & 0xff);
            }
          }
          pcTraceAtDispatch = [...pcTrace];
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; }
    else if (e?.message === '__ERR__') { errCaught = true; }
    else throw e;
  }

  // ── Results ──
  console.log(`  Result: returnHit=${returnHit} errCaught=${errCaught} steps=${stepCount}`);
  console.log(`  hitDispatch(0x0686EF): ${hitDispatch}`);

  const op1val = safeReadReal(wrap, OP1_ADDR);
  console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}] decoded=${typeof op1val === 'number' ? op1val.toFixed(6) : String(op1val)}`);
  console.log(`  errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)}`);

  if (hitDispatch) {
    console.log(`\n  --- Registers at dispatch entry (0x0686EF) ---`);
    console.log(`    A=${hex(dispatchRegs.a, 2)} F=${hex(dispatchRegs.f, 2)}`);
    console.log(`    BC=${hex(dispatchRegs.bc)} DE=${hex(dispatchRegs.de)} HL=${hex(dispatchRegs.hl)}`);
    console.log(`    SP=${hex(dispatchRegs.sp)} IX=${hex(dispatchRegs.ix)} IY=${hex(dispatchRegs.iy)}`);

    console.log(`\n  --- OPS dump at dispatch entry ---`);
    console.log(`    OPS=${hex(opsDumpAtDispatch.opsAddr)} OPBase=${hex(opsDumpAtDispatch.opBaseAddr)} depth=${opsDumpAtDispatch.depth}`);
    if (opsDumpAtDispatch.bytes.length > 0) {
      const bytesStr = opsDumpAtDispatch.bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      console.log(`    OPS bytes: ${bytesStr}`);
      // Show individual 9-byte OPS entries
      for (let off = 0; off < opsDumpAtDispatch.bytes.length; off += 9) {
        const end = Math.min(off + 9, opsDumpAtDispatch.bytes.length);
        const slice = opsDumpAtDispatch.bytes.slice(off, end);
        const sliceStr = slice.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        console.log(`    OPS entry[${off / 9}]: ${sliceStr}`);
      }
    }

    console.log(`\n  --- PC trace (last ${pcTraceAtDispatch.length} PCs before 0x0686EF) ---`);
    for (let i = 0; i < pcTraceAtDispatch.length; i++) {
      const pc = pcTraceAtDispatch[i];
      const miss = missingBlockPcs.has(pc) ? ' [MISSING]' : '';
      console.log(`    [${i.toString().padStart(2)}] ${hex(pc)}${miss}`);
    }
  } else {
    console.log(`  0x0686EF was NOT reached in ${stepCount} steps`);
  }

  // Final PC trace (last 30)
  console.log(`\n  --- Final PC trace (last ${Math.min(30, pcTrace.length)} PCs) ---`);
  const finalSlice = pcTrace.slice(-30);
  for (let i = 0; i < finalSlice.length; i++) {
    const pc = finalSlice[i];
    const miss = missingBlockPcs.has(pc) ? ' [MISSING]' : '';
    console.log(`    [${i.toString().padStart(2)}] ${hex(pc)}${miss}`);
  }

  if (missingBlockPcs.size > 0) {
    console.log(`\n  Missing blocks: ${[...missingBlockPcs].sort((a, b) => a - b).map(hex).join(', ')}`);
  }

  // Final OPS state
  const finalOPS = read24(mem, OPS_ADDR);
  const finalOPBase = read24(mem, OPBASE_ADDR);
  console.log(`\n  Final OPS=${hex(finalOPS)} OPBase=${hex(finalOPBase)}`);
  if (finalOPS < finalOPBase && finalOPBase < MEM_SIZE) {
    const depth = finalOPBase - finalOPS;
    console.log(`  Final OPS depth=${depth} bytes`);
    const dumpLen = Math.min(depth, 36);
    console.log(`  Final OPS dump (${dumpLen} bytes from OPS): ${hexBytes(mem, finalOPS, dumpLen)}`);
  }

  return {
    hitDispatch,
    returnHit,
    errCaught,
    stepCount,
    dispatchA,
    dispatchRegs,
    opsDumpAtDispatch,
    pcTraceAtDispatch,
    missingBlockPcs: [...missingBlockPcs],
  };
}

// ── Task 3: Static analysis of upstream dispatch ─────────────────────────

function analyzeUpstreamDispatch() {
  console.log('\n' + '='.repeat(70));
  console.log('  Static analysis: upstream callers of 0x0686EF');
  console.log('='.repeat(70));

  // Disassemble the region leading up to 0x0686EF
  console.log('\n  Disassembly 0x068680-0x068700 (dispatch area + lead-in):');
  const disasm = disassembleRange(romBytes, 0x068680, 0x068700);
  for (const line of disasm) console.log(line);

  // Search for CALL/JP instructions targeting 0x0686EF in the wider ROM area
  console.log('\n  Searching for CALL/JP 0x0686EF in ROM 0x060000-0x070000:');
  const target = [0xEF, 0x86, 0x06]; // little-endian 0x0686EF
  let foundCallers = 0;
  for (let addr = 0x060000; addr < 0x070000; addr++) {
    const byte0 = romBytes[addr] & 0xff;
    // CALL nn (0xCD), JP nn (0xC3), JP cc,nn (0xC2/CA/D2/DA/E2/EA/F2/FA)
    if (byte0 === 0xCD || byte0 === 0xC3 || byte0 === 0xCA || byte0 === 0xC2 ||
        byte0 === 0xD2 || byte0 === 0xDA || byte0 === 0xE2 || byte0 === 0xEA ||
        byte0 === 0xF2 || byte0 === 0xFA) {
      if ((romBytes[addr + 1] & 0xff) === target[0] &&
          (romBytes[addr + 2] & 0xff) === target[1] &&
          (romBytes[addr + 3] & 0xff) === target[2]) {
        const opName = byte0 === 0xCD ? 'CALL' : byte0 === 0xC3 ? 'JP' :
          byte0 === 0xCA ? 'JP Z' : byte0 === 0xC2 ? 'JP NZ' :
          byte0 === 0xD2 ? 'JP NC' : byte0 === 0xDA ? 'JP C' :
          byte0 === 0xE2 ? 'JP PO' : byte0 === 0xEA ? 'JP PE' :
          byte0 === 0xF2 ? 'JP P' : 'JP M';
        console.log(`    ${hex(addr)}: ${opName} 0x0686EF`);
        // Show context around this caller
        const contextStart = Math.max(addr - 16, 0x060000);
        const contextEnd = Math.min(addr + 8, 0x070000);
        const ctxDisasm = disassembleRange(romBytes, contextStart, contextEnd);
        for (const line of ctxDisasm) console.log(`      ${line.trim()}`);
        foundCallers++;
      }
    }
  }
  console.log(`  Found ${foundCallers} direct references to 0x0686EF in 0x060000-0x070000`);

  // Also search whole ROM for calls to 0x0686EF
  console.log('\n  Full ROM scan for CALL/JP 0x0686EF:');
  let fullRomCallers = 0;
  for (let addr = 0; addr < 0x400000; addr++) {
    const byte0 = romBytes[addr] & 0xff;
    if (byte0 === 0xCD || byte0 === 0xC3 || byte0 === 0xCA || byte0 === 0xC2 ||
        byte0 === 0xD2 || byte0 === 0xDA || byte0 === 0xE2 || byte0 === 0xEA ||
        byte0 === 0xF2 || byte0 === 0xFA) {
      if ((romBytes[addr + 1] & 0xff) === target[0] &&
          (romBytes[addr + 2] & 0xff) === target[1] &&
          (romBytes[addr + 3] & 0xff) === target[2]) {
        const opName = byte0 === 0xCD ? 'CALL' : byte0 === 0xC3 ? 'JP' :
          byte0 === 0xCA ? 'JP Z' : byte0 === 0xC2 ? 'JP NZ' :
          byte0 === 0xD2 ? 'JP NC' : byte0 === 0xDA ? 'JP C' :
          byte0 === 0xE2 ? 'JP PO' : byte0 === 0xEA ? 'JP PE' :
          byte0 === 0xF2 ? 'JP P' : 'JP M';
        console.log(`    ${hex(addr)}: ${opName} 0x0686EF`);
        fullRomCallers++;
      }
    }
  }
  console.log(`  Total references in full ROM: ${fullRomCallers}`);

  // Disassemble the wider upstream area that the PC trace might show
  console.log('\n  Disassembly 0x068580-0x068690 (wider upstream area):');
  const upstream = disassembleRange(romBytes, 0x068580, 0x068690);
  for (const line of upstream) console.log(line);
}

// ── Task 4: Check BLOCKS for 0x06859B ────────────────────────────────────

function checkMissingBlock() {
  console.log('\n' + '='.repeat(70));
  console.log('  Check: is 0x06859B in BLOCKS table?');
  console.log('='.repeat(70));

  const has06859B = BLOCKS.has ? BLOCKS.has(0x06859B) :
    (typeof BLOCKS.get === 'function' ? BLOCKS.get(0x06859B) !== undefined :
     (0x06859B in BLOCKS || BLOCKS[0x06859B] !== undefined));

  console.log(`  BLOCKS[0x06859B]: ${has06859B ? 'EXISTS' : 'MISSING'}`);

  // Check nearby blocks
  console.log('  Nearby blocks check:');
  for (let offset = -16; offset <= 16; offset++) {
    const addr = 0x06859B + offset;
    const exists = BLOCKS.has ? BLOCKS.has(addr) :
      (typeof BLOCKS.get === 'function' ? BLOCKS.get(addr) !== undefined :
       (addr in BLOCKS || BLOCKS[addr] !== undefined));
    if (exists) {
      console.log(`    ${hex(addr)}: EXISTS`);
    }
  }

  // Disassemble around 0x06859B
  console.log('\n  Disassembly 0x068580-0x0685C0:');
  const disasm = disassembleRange(romBytes, 0x068580, 0x0685C0);
  for (const line of disasm) console.log(line);
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 130: Upstream FP Op-Code Dispatch Trace ===');

  // Task 1: Trace gcd(12,8) to dispatch
  const gcdResult = traceToDispatch('TASK 1: gcd(12,8) — trace to FP dispatch 0x0686EF', GCD_TOKENS);

  // Task 2: Trace min(3,7) to dispatch
  const minResult = traceToDispatch('TASK 2: min(3,7) — trace to FP dispatch 0x0686EF', MIN_TOKENS);

  // Task 3: Static analysis of upstream dispatch
  analyzeUpstreamDispatch();

  // Task 4: Check missing block at 0x06859B
  checkMissingBlock();

  // ── Task 5: Compare dispatch paths ──
  console.log('\n' + '='.repeat(70));
  console.log('  COMPARISON: gcd vs min dispatch paths');
  console.log('='.repeat(70));

  if (gcdResult?.pcTraceAtDispatch && minResult?.pcTraceAtDispatch) {
    const gcdTrace = gcdResult.pcTraceAtDispatch;
    const minTrace = minResult.pcTraceAtDispatch;

    console.log(`\n  gcd trace length: ${gcdTrace.length}`);
    console.log(`  min trace length: ${minTrace.length}`);

    // Find first divergence from the end (working backward)
    const gcdRev = [...gcdTrace].reverse();
    const minRev = [...minTrace].reverse();
    let commonSuffix = 0;
    for (let i = 0; i < Math.min(gcdRev.length, minRev.length); i++) {
      if (gcdRev[i] === minRev[i]) {
        commonSuffix++;
      } else {
        break;
      }
    }
    console.log(`  Common suffix PCs (from dispatch entry backward): ${commonSuffix}`);
    if (commonSuffix < Math.min(gcdRev.length, minRev.length)) {
      const divIdx = commonSuffix;
      console.log(`  DIVERGENCE at position -${divIdx + 1} from dispatch:`);
      console.log(`    gcd: ${hex(gcdRev[divIdx])}`);
      console.log(`    min: ${hex(minRev[divIdx])}`);
    }

    // Show A register comparison
    console.log(`\n  A register at dispatch:`);
    console.log(`    gcd: A=${hex(gcdResult.dispatchA, 2)}`);
    console.log(`    min: A=${hex(minResult.dispatchA, 2)}`);

    // Show OPS comparison
    if (gcdResult.opsDumpAtDispatch && minResult.opsDumpAtDispatch) {
      console.log(`\n  OPS at dispatch:`);
      const gcdOps = gcdResult.opsDumpAtDispatch;
      const minOps = minResult.opsDumpAtDispatch;
      console.log(`    gcd: depth=${gcdOps.depth} bytes=[${gcdOps.bytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
      console.log(`    min: depth=${minOps.depth} bytes=[${minOps.bytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
    }
  } else {
    if (!gcdResult?.hitDispatch) console.log('  gcd did NOT reach 0x0686EF');
    if (!minResult?.hitDispatch) console.log('  min did NOT reach 0x0686EF');

    // Even if one didn't hit dispatch, show what we have
    if (gcdResult && !gcdResult.hitDispatch) {
      console.log(`  gcd ended: returnHit=${gcdResult.returnHit} errCaught=${gcdResult.errCaught} steps=${gcdResult.stepCount}`);
      console.log(`  gcd missing blocks: ${gcdResult.missingBlockPcs.map(hex).join(', ')}`);
    }
    if (minResult && !minResult.hitDispatch) {
      console.log(`  min ended: returnHit=${minResult.returnHit} errCaught=${minResult.errCaught} steps=${minResult.stepCount}`);
      console.log(`  min missing blocks: ${minResult.missingBlockPcs.map(hex).join(', ')}`);
    }
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  gcd(12,8): hitDispatch=${gcdResult?.hitDispatch} returnHit=${gcdResult?.returnHit} errCaught=${gcdResult?.errCaught} A=${gcdResult?.dispatchA !== null ? hex(gcdResult?.dispatchA, 2) : 'n/a'}`);
  console.log(`  min(3,7):  hitDispatch=${minResult?.hitDispatch} returnHit=${minResult?.returnHit} errCaught=${minResult?.errCaught} A=${minResult?.dispatchA !== null ? hex(minResult?.dispatchA, 2) : 'n/a'}`);
  console.log(`  0x06859B in BLOCKS: ${BLOCKS.has ? BLOCKS.has(0x06859B) : (BLOCKS[0x06859B] !== undefined)}`);
  console.log('');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
