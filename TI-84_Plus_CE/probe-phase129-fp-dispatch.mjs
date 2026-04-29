#!/usr/bin/env node

/**
 * Phase 129 — FP comparison dispatch table analysis + LCD busy-wait patch
 *
 * 1. Disassemble FP dispatch table at 0x0686D3 (~200 bytes)
 * 2. Identify all handled operation codes and their handler addresses
 * 3. Check 0xDA case specifically
 * 4. Test runtime patches to break the LCD busy-wait at 0x001221
 * 5. Test max(3,7) and gcd(12,8) for different FP op codes
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

const FP_DISPATCH_ADDR = 0x0686D3;
const LCD_STALL_ADDR = 0x001221;

// Token encodings
const MIN_TOKENS = Uint8Array.from([0xBB, 0x0C, 0x33, 0x2B, 0x37, 0x11, 0x3F]);
const MAX_TOKENS = Uint8Array.from([0xBB, 0x0D, 0x33, 0x2B, 0x37, 0x11, 0x3F]);
const GCD_TOKENS = Uint8Array.from([0xBB, 0x07, 0x31, 0x32, 0x2B, 0x38, 0x11, 0x3F]);

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 100000;
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

// ── Setup + run ParseInp for a given token set ────────────────────────────

function setupAndRunParseInp(label, tokens, opts = {}) {
  const { patchLCD = false, patchLCDReady = false } = opts;

  console.log(`\n--- ${label} ---`);
  console.log(`  Tokens: [${Array.from(tokens, b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
  if (patchLCD) console.log('  LCD busy-wait PATCHED (NOP slide at 0x001221)');
  if (patchLCDReady) console.log('  LCD ready flag pre-set (mem[0xD00098] |= 0x01)');

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
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') meminitDone = true;
    else throw e;
  }
  console.log(`  MEM_INIT: ${meminitDone ? 'OK' : 'FAILED'}`);
  if (!meminitDone) return null;

  // Seed tokens
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(tokens, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + tokens.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  seedAllocator(mem);

  // Optional patches
  if (patchLCDReady) {
    mem[0xD00098] |= 0x01;
  }

  if (patchLCD) {
    // Patch the LCD busy-wait loop at 0x001221-0x00122D with a RET (0xC9)
    // The loop polls LCD status and never exits. Patch first byte to RET.
    mem[0x001221] = 0xC9; // RET
  }

  // ParseInp
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, errBase, ERR_CATCH_ADDR);
  write24(mem, errBase + 3, 0);
  write24(mem, ERR_SP_ADDR, errBase);
  mem[ERR_NO_ADDR] = 0x00;

  const pcHitCounts = new Map();
  const recentPcs = [];
  const missingBlockPcs = new Set();
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;
  let opsValueAtDispatch = null;

  // Track what OPS value is when we reach the FP dispatch area
  const fpDispatchPcs = new Set();
  for (let a = 0x0686D3; a < 0x068800; a++) fpDispatchPcs.add(a);

  try {
    executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (step !== undefined) stepCount = Math.max(stepCount, step + 1);
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();

        // Capture OPS byte when entering FP dispatch area
        if (norm >= 0x0686C0 && norm <= 0x068800 && opsValueAtDispatch === null) {
          const opsAddr = read24(mem, OPS_ADDR);
          const opBaseAddr = read24(mem, OPBASE_ADDR);
          if (opsAddr < opBaseAddr) {
            opsValueAtDispatch = mem[opsAddr] & 0xff;
            console.log(`    [FP dispatch] PC=${hex(norm)} OPS=${hex(opsAddr)} top-of-stack byte=0x${opsValueAtDispatch.toString(16).toUpperCase().padStart(2, '0')}`);
            // Dump a few bytes around OPS
            console.log(`    [FP dispatch] OPS area: ${hexBytes(mem, opsAddr, Math.min(18, opBaseAddr - opsAddr))}`);
            console.log(`    [FP dispatch] A=${hex(cpu.a, 2)} F=${hex(cpu.f, 2)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)}`);
          }
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
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
    else throw e;
  }

  console.log(`  Result: returnHit=${returnHit} errCaught=${errCaught} steps=${stepCount}`);
  console.log(`  Final PC: ${hex(finalPc)}`);
  console.log(`  errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)}`);

  const op1val = safeReadReal(wrap, OP1_ADDR);
  console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}] decoded=${typeof op1val === 'number' ? op1val.toFixed(6) : String(op1val)}`);

  // curPC
  const curPC = read24(mem, CURPC_ADDR);
  const consumed = curPC - TOKEN_BUFFER_ADDR;
  console.log(`  curPC: ${hex(curPC)} (consumed ${consumed}/${tokens.length} bytes)`);

  // Top-10 hottest PCs
  const sorted = [...pcHitCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  Top-10 hottest PCs:');
  for (let i = 0; i < Math.min(10, sorted.length); i++) {
    const [pc, hits] = sorted[i];
    const miss = missingBlockPcs.has(pc) ? ' [MISSING]' : '';
    console.log(`    ${hex(pc)}: ${hits} hits${miss}`);
  }

  // Last 32 PCs
  console.log(`  Last ${Math.min(32, recentPcs.length)} PCs:`);
  const last = recentPcs.slice(-32);
  for (let i = 0; i < last.length; i += 8) {
    console.log(`    ${last.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }

  if (missingBlockPcs.size > 0) {
    console.log(`  Missing blocks: ${[...missingBlockPcs].sort((a,b)=>a-b).map(hex).join(', ')}`);
  }

  // OPS dump
  const finalOPS = read24(mem, OPS_ADDR);
  const finalOPBase = read24(mem, OPBASE_ADDR);
  console.log(`  OPS=${hex(finalOPS)} OPBase=${hex(finalOPBase)}`);
  if (finalOPS < finalOPBase && finalOPBase < MEM_SIZE) {
    const depth = finalOPBase - finalOPS;
    console.log(`  OPS depth=${depth} bytes`);
    for (let off = 0; off < Math.min(depth, 36); off += 9) {
      const addr = finalOPBase - 9 - off;
      console.log(`    OPS[${off / 9}] @ ${hex(addr)}: ${hexBytes(mem, addr, 9)}`);
    }
  }

  return { returnHit, errCaught, stepCount, finalPc, op1val, mem, wrap };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 129: FP Comparison Dispatch Table Analysis ===\n');

  // ── Task 1: Disassemble FP dispatch table at 0x0686D3 ──

  console.log('--- Task 1: FP dispatch table disassembly at 0x0686D3 ---');
  console.log(`  Raw bytes 0x0686C0-0x068800 (320 bytes):`);
  for (let row = 0x0686C0; row < 0x068800; row += 16) {
    console.log(`    ${hex(row)}: ${hexBytes(romBytes, row, 16)}`);
  }
  console.log('');

  console.log('  Disassembly (ADL mode) 0x0686C0-0x068800:');
  const disasm = disassembleRange(romBytes, 0x0686C0, 0x068800);
  for (const line of disasm) console.log(line);
  console.log('');

  // Look for CP n / JP Z,addr patterns — these are the dispatch entries
  // Also scan for SUB n patterns
  console.log('  Searching for CP/SUB dispatch patterns in 0x0686C0-0x068800:');
  const entries = [];
  let pc = 0x0686C0;
  while (pc < 0x068800) {
    const byte0 = romBytes[pc] & 0xff;
    // CP n (0xFE nn) or SUB n (0xD6 nn)
    if (byte0 === 0xFE || byte0 === 0xD6) {
      const operand = romBytes[pc + 1] & 0xff;
      // Check next bytes for JP Z (0xCA addr24) or JR Z (0x28 off)
      const next = romBytes[pc + 2] & 0xff;
      if (next === 0xCA) {
        const target = read24(romBytes, pc + 3);
        const op = byte0 === 0xFE ? 'CP' : 'SUB';
        entries.push({ pc, op, operand, jumpType: 'JP Z', target });
        console.log(`    ${hex(pc)}: ${op} 0x${operand.toString(16).toUpperCase().padStart(2, '0')} ; JP Z,${hex(target)}`);
      } else if (next === 0x28) {
        const offset = romBytes[pc + 3];
        const signedOff = offset > 127 ? offset - 256 : offset;
        const target = (pc + 4 + signedOff) & 0xffffff;
        const op = byte0 === 0xFE ? 'CP' : 'SUB';
        entries.push({ pc, op, operand, jumpType: 'JR Z', target });
        console.log(`    ${hex(pc)}: ${op} 0x${operand.toString(16).toUpperCase().padStart(2, '0')} ; JR Z,${hex(target, 4)} (offset ${signedOff})`);
      }
    }
    pc++;
  }
  console.log(`  Found ${entries.length} dispatch entries\n`);

  // ── Task 2: Map all handled op codes ──

  console.log('--- Task 2: Operation code → handler mapping ---');
  // The dispatch table likely uses SUB to reduce the value as it goes.
  // Reconstruct the effective op-code for each entry.
  // Need to trace the logic: initial value in A, successive SUBs reduce it.
  // CP checks without subtracting, SUB checks and subtracts.
  // Let's just list what we found and also widen the search area.

  // Also check from 0x068600 to find where the dispatch starts
  console.log('  Extended disassembly 0x068600-0x0686D3 (lead-in to dispatch):');
  const leadIn = disassembleRange(romBytes, 0x068600, 0x0686D3);
  for (const line of leadIn) console.log(line);
  console.log('');

  // Wider search: 0x068500-0x068900
  console.log('  Wider CP/SUB scan 0x068500-0x068900:');
  const widerEntries = [];
  pc = 0x068500;
  while (pc < 0x068900) {
    const byte0 = romBytes[pc] & 0xff;
    if (byte0 === 0xFE || byte0 === 0xD6) {
      const operand = romBytes[pc + 1] & 0xff;
      const next = romBytes[pc + 2] & 0xff;
      if (next === 0xCA) {
        const target = read24(romBytes, pc + 3);
        const op = byte0 === 0xFE ? 'CP' : 'SUB';
        widerEntries.push({ pc, op, operand, jumpType: 'JP Z', target });
        if (pc < 0x0686C0 || pc >= 0x068800) {
          console.log(`    ${hex(pc)}: ${op} 0x${operand.toString(16).toUpperCase().padStart(2, '0')} ; JP Z,${hex(target)}`);
        }
      } else if (next === 0x28) {
        const offset = romBytes[pc + 3];
        const signedOff = offset > 127 ? offset - 256 : offset;
        const target = (pc + 4 + signedOff) & 0xffffff;
        const op = byte0 === 0xFE ? 'CP' : 'SUB';
        widerEntries.push({ pc, op, operand, jumpType: 'JR Z', target });
        if (pc < 0x0686C0 || pc >= 0x068800) {
          console.log(`    ${hex(pc)}: ${op} 0x${operand.toString(16).toUpperCase().padStart(2, '0')} ; JR Z,${hex(target, 4)} (offset ${signedOff})`);
        }
      }
    }
    pc++;
  }
  console.log(`  Total wider entries: ${widerEntries.length}\n`);

  // ── Task 3: Check 0xDA specifically ──

  console.log('--- Task 3: Where does 0xDA fall? ---');
  const hasDA = entries.find(e => e.operand === 0xDA);
  if (hasDA) {
    console.log(`  0xDA IS in the dispatch table at ${hex(hasDA.pc)} → ${hex(hasDA.target)}`);
  } else {
    console.log('  0xDA is NOT in the dispatch table entries found above');
    // Check what the nearest entries are
    const sortedByOp = [...entries].sort((a, b) => a.operand - b.operand);
    console.log('  All dispatch operands (sorted):');
    for (const e of sortedByOp) {
      console.log(`    ${e.op} 0x${e.operand.toString(16).toUpperCase().padStart(2, '0')} @ ${hex(e.pc)} → ${hex(e.target)}`);
    }
  }
  console.log('');

  // Also check the wider set
  const wideDA = widerEntries.find(e => e.operand === 0xDA);
  if (wideDA) {
    console.log(`  0xDA found in wider scan at ${hex(wideDA.pc)} → ${hex(wideDA.target)}`);
  }

  // ── Task 4: Disassemble the LCD busy-wait at 0x001221 ──

  console.log('\n--- Task 4a: LCD busy-wait disassembly (0x001210-0x001250) ---');
  const lcdDisasm = disassembleRange(romBytes, 0x001210, 0x001250);
  for (const line of lcdDisasm) console.log(line);
  console.log('');

  // ── Task 4b: Run min(3,7) with LCD ready flag patch ──

  console.log('--- Task 4b: min(3,7) BASELINE (no patches) ---');
  setupAndRunParseInp('min(3,7) baseline', MIN_TOKENS);

  console.log('\n--- Task 4c: min(3,7) with LCD ready flag ---');
  setupAndRunParseInp('min(3,7) LCD ready flag', MIN_TOKENS, { patchLCDReady: true });

  console.log('\n--- Task 4d: min(3,7) with LCD busy-wait patched to RET ---');
  setupAndRunParseInp('min(3,7) LCD RET patch', MIN_TOKENS, { patchLCD: true });

  // ── Task 5: Test max(3,7) and gcd(12,8) ──

  console.log('\n--- Task 5a: max(3,7) with LCD RET patch ---');
  setupAndRunParseInp('max(3,7) LCD RET patch', MAX_TOKENS, { patchLCD: true });

  console.log('\n--- Task 5b: gcd(12,8) with LCD RET patch ---');
  setupAndRunParseInp('gcd(12,8) LCD RET patch', GCD_TOKENS, { patchLCD: true });

  // Also test without patches to see if they use same or different codes
  console.log('\n--- Task 5c: max(3,7) baseline (no patches) ---');
  const maxResult = setupAndRunParseInp('max(3,7) baseline', MAX_TOKENS);

  console.log('\n--- Task 5d: gcd(12,8) baseline (no patches) ---');
  const gcdResult = setupAndRunParseInp('gcd(12,8) baseline', GCD_TOKENS);

  // ── Summary ──

  console.log('\n=== SUMMARY ===');
  console.log(`FP dispatch table entries found: ${entries.length} (narrow) / ${widerEntries.length} (wide scan)`);
  console.log(`0xDA in dispatch: ${hasDA ? 'YES' : 'NO'}`);
  if (entries.length > 0) {
    const ops = entries.map(e => '0x' + e.operand.toString(16).toUpperCase().padStart(2, '0'));
    console.log(`Handled op codes: ${ops.join(', ')}`);
  }
  console.log('');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
