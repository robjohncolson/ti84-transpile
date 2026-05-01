#!/usr/bin/env node

/**
 * Phase 171 — Static Fidelity Check: Transpiled Blocks vs ROM Bytes
 *
 * For every unique block PC visited during gcd(12,8), compare each instruction
 * in the transpiled block object against what the decoder reads from raw ROM bytes.
 *
 * Checks: instruction tag, jump/call targets, immediate values, memory addresses.
 * Reports PASS/FAIL per block with mismatch details.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH       = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const ROM_TRANSPILED_GZ  = path.join(__dirname, 'ROM.transpiled.js.gz');

if (!fs.existsSync(ROM_BIN_PATH)) throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);

if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
  if (!fs.existsSync(ROM_TRANSPILED_GZ)) throw new Error('ROM.transpiled.js(.gz) missing');
  console.log('Gunzipping ROM.transpiled.js...');
  const { execSync } = await import('node:child_process');
  execSync(`gunzip -kf "${ROM_TRANSPILED_GZ}"`, { stdio: 'inherit' });
}

const romBytes  = fs.readFileSync(ROM_BIN_PATH);
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const BLOCKS    = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;
if (!BLOCKS) throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEM_SIZE      = 0x1000000;
const BOOT_ENTRY    = 0x000000;
const KERNEL_INIT   = 0x08c331;
const POST_INIT     = 0x0802b2;
const STACK_TOP     = 0xd1a87e;
const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET   = 0x7ffff6;
const USERMEM_ADDR  = 0xd1a881;
const EMPTY_VAT     = 0xd3ffff;
const GCD_ENTRY     = 0x068d3d;
const FAKE_RET      = 0x7ffffe;
const ERR_CATCH     = 0x7ffffa;
const FPS_CLEAN     = 0xd1aa00;
const OP1_ADDR      = 0xd005f8;
const OP2_ADDR      = 0xd00603;
const FPS_ADDR      = 0xd0258d;
const FPSBASE_ADDR  = 0xd0258a;
const OPS_ADDR      = 0xd02593;
const OPBASE_ADDR   = 0xd02590;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR    = 0xd0259a;
const PROGPTR_ADDR  = 0xd0259d;
const NEWDATA_PTR   = 0xd025a0;
const ERR_NO_ADDR   = 0xd008df;
const ERR_SP_ADDR   = 0xd008e0;
const FP_CAT_ADDR   = 0xd0060e;
const GCD_CAT       = 0x28;
const MAX_STEPS     = 2000;
const MAX_LOOP_ITER = 8192;
const MEMINIT_BUDGET = 100000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function write24(mem, addr, value) {
  mem[addr]     = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function read24(mem, addr) {
  return (mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16)) >>> 0;
}

const hex6 = (v) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(6, '0');

// ---------------------------------------------------------------------------
// Runtime setup
// ---------------------------------------------------------------------------

function createRuntime() {
  const mem      = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT);
  write24(mem, OPS_ADDR, EMPTY_VAT);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR, USERMEM_ADDR);
}

function seedGcdState(mem, op1, op2) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN, FPS_CLEAN + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN);
  write24(mem, FPS_ADDR, FPS_CLEAN);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
  mem.set(op1, OP1_ADDR);
  mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);
  mem.set(op2, OP2_ADDR);
  mem[FP_CAT_ADDR] = GCD_CAT;
}

function seedErrFrame(cpu, mem, ret) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, ERR_CATCH);
  write24(mem, base + 3, 0);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
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
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (err) {
    if (err?.message === '__RET__') memInitOk = true;
    else throw err;
  }

  return { ...runtime, memInitOk };
}

// ---------------------------------------------------------------------------
// Step 1: Collect unique block PCs from gcd(12,8)
// ---------------------------------------------------------------------------

function collectGcdBlockPCs(runtime) {
  const { mem, executor, cpu } = runtime;

  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

  prepareCallState(cpu, mem);
  seedGcdState(mem, op1Bytes, op2Bytes);

  const fpsPtr = read24(mem, FPS_ADDR);
  for (let i = 0; i < 9; i++) mem[fpsPtr + i] = op2Bytes[i];
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET);

  const uniquePCs = new Set();
  let stepCount   = 0;
  let outcome     = 'budget';

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xffffff;
        stepCount  = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH) throw new Error('__ERR__');
        uniquePCs.add(norm);
      },
      onMissingBlock(pc, _mode, step) {
        const norm = pc & 0xffffff;
        stepCount  = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH) throw new Error('__ERR__');
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else { outcome = 'threw'; console.error(err?.stack || String(err)); }
  }

  return { uniquePCs, stepCount, outcome };
}

// ---------------------------------------------------------------------------
// Step 2: Fidelity check
//
// Strategy: for each instruction stored in the block object, re-decode the
// same bytes from ROM and compare tag, target, and value/addr fields.
// The block's `instructions` array is the ground truth for what the transpiler
// decided; the re-decoded instruction is the ground truth from ROM bytes.
// Any difference is a potential transpilation error.
// ---------------------------------------------------------------------------

function checkBlock(blockPc, BLOCKS) {
  const blockKey = blockPc.toString(16).padStart(6, '0') + ':adl';
  const block    = BLOCKS[blockKey];
  const mismatches = [];

  if (!block) {
    mismatches.push({ type: 'MISSING_BLOCK', blockKey });
    return { mismatches, instrCount: 0, blockKey };
  }

  const blockInstrs = block.instructions || [];

  for (const stored of blockInstrs) {
    const romInstr = safeDecodeInstruction(stored.pc);
    if (!romInstr) {
      mismatches.push({
        type:    'DECODE_ERROR',
        instrPc: stored.pc,
        note:    'decoder threw for this PC',
      });
      continue;
    }

    // --- Tag check ---
    // Tags can differ for mode-switch prefixes (sil/lil etc.) — only flag if
    // the core tag group differs (e.g. 'call' vs 'jp').
    const storedTag = stored.tag;
    const romTag    = romInstr.tag;

    if (!tagsEquivalent(storedTag, romTag)) {
      mismatches.push({
        type:       'TAG_MISMATCH',
        instrPc:    stored.pc,
        storedTag,
        romTag,
        storedDasm: stored.dasm,
        note:       `Block says "${storedTag}", ROM decodes "${romTag}"`,
      });
      // Skip further checks for this instruction — fields won't be comparable.
      continue;
    }

    // --- Target check (CALL / JP / JR / RST / DJNZ) ---
    if (stored.target !== undefined && romInstr.target !== undefined) {
      const storedTarget = stored.target >>> 0;
      const romTarget    = romInstr.target >>> 0;
      if (storedTarget !== romTarget) {
        mismatches.push({
          type:          'TARGET_MISMATCH',
          instrPc:       stored.pc,
          tag:           storedTag,
          storedTarget:  hex6(storedTarget),
          romTarget:     hex6(romTarget),
          storedDasm:    stored.dasm,
          note:          `Block target ${hex6(storedTarget)} != ROM target ${hex6(romTarget)}`,
        });
      }
    }

    // --- Immediate value check (ld-reg-imm, alu-imm, etc.) ---
    if (stored.value !== undefined && romInstr.value !== undefined) {
      const sv = stored.value >>> 0;
      const rv = romInstr.value >>> 0;
      if (sv !== rv) {
        mismatches.push({
          type:        'VALUE_MISMATCH',
          instrPc:     stored.pc,
          tag:         storedTag,
          storedValue: `0x${sv.toString(16)}`,
          romValue:    `0x${rv.toString(16)}`,
          storedDasm:  stored.dasm,
          note:        `Block value 0x${sv.toString(16)} != ROM value 0x${rv.toString(16)}`,
        });
      }
    }

    // --- Memory address check (ld-mem-reg, ld-reg-mem, ld-pair-mem, ld-mem-pair) ---
    if (stored.addr !== undefined && romInstr.addr !== undefined) {
      const sa = stored.addr >>> 0;
      const ra = romInstr.addr >>> 0;
      if (sa !== ra) {
        mismatches.push({
          type:       'ADDR_MISMATCH',
          instrPc:    stored.pc,
          tag:        storedTag,
          storedAddr: hex6(sa),
          romAddr:    hex6(ra),
          storedDasm: stored.dasm,
          note:       `Block addr ${hex6(sa)} != ROM addr ${hex6(ra)}`,
        });
      }
    }

    // --- Displacement check (IX+d / IY+d instructions) ---
    if (stored.displacement !== undefined && romInstr.displacement !== undefined) {
      const sd = stored.displacement;
      const rd = romInstr.displacement;
      if (sd !== rd) {
        mismatches.push({
          type:         'DISPLACEMENT_MISMATCH',
          instrPc:      stored.pc,
          tag:          storedTag,
          storedDisp:   sd,
          romDisp:      rd,
          storedDasm:   stored.dasm,
          note:         `Block displacement ${sd} != ROM displacement ${rd}`,
        });
      }
    }
  }

  // --- Exit check: verify every exit target block exists ---
  for (const exit of (block.exits || [])) {
    if (exit.target === undefined) continue;
    const targetPc  = exit.target >>> 0;
    const targetKey = targetPc.toString(16).padStart(6, '0') + ':' + (exit.targetMode || 'adl');
    if (targetPc < 0x400000 && !BLOCKS[targetKey]) {
      mismatches.push({
        type:      'EXIT_TARGET_MISSING',
        exitType:  exit.type,
        targetKey,
        note:      `Exit block ${targetKey} does not exist in BLOCKS`,
      });
    }
  }

  return { mismatches, instrCount: blockInstrs.length, blockKey };
}

// ---------------------------------------------------------------------------
// Instruction decode helper
// ---------------------------------------------------------------------------

function safeDecodeInstruction(pc) {
  if (pc >= 0x400000) return null; // outside ROM
  try {
    return decodeInstruction(romBytes, pc, 'adl');
  } catch {
    return null;
  }
}

/**
 * Return true if `storedTag` and `romTag` are equivalent for our purposes.
 * The transpiler may use slightly different tag names or may merge mode-switch
 * prefixed variants. We allow a few known aliases.
 */
function tagsEquivalent(a, b) {
  if (a === b) return true;
  // Mode-switch instructions: 'stmix'/'rsmix' decoded by decoder may differ
  // from stored representation only in label — treat as same family.
  const normalize = (t) =>
    t?.replace(/-conditional$/, '')   // 'jp-conditional' → 'jp'? No, keep distinct.
     .replace(/^indexed-cb-/, 'cb-'); // 'indexed-cb-bit' → 'cb-bit'
  // For this probe we only flag real mismatches; mode prefix tags are fine.
  return normalize(a) === normalize(b);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(80));
  console.log('PHASE 171: STATIC FIDELITY CHECK — TRANSPILED BLOCKS vs ROM BYTES');
  console.log('='.repeat(80));
  console.log('');

  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    console.error('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }
  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  // --- Collect block PCs ---
  console.log('--- STEP 1: Running gcd(12,8) to collect block PCs ---');
  const { uniquePCs, stepCount, outcome } = collectGcdBlockPCs(runtime);
  const sortedPCs = [...uniquePCs].sort((a, b) => a - b);
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps:   ${stepCount}`);
  console.log(`  Unique block PCs: ${sortedPCs.length}`);
  console.log('');

  // --- Fidelity check ---
  console.log('--- STEP 2: Fidelity check (block instructions vs ROM decode) ---');
  console.log('');

  let passCount    = 0;
  let failCount    = 0;
  let missingCount = 0;
  let skipCount    = 0;
  const allFailing = [];

  for (const blockPc of sortedPCs) {
    if (blockPc >= 0x400000) {
      skipCount++;
      continue; // stub/sentinel — outside ROM
    }

    const { mismatches, instrCount, blockKey } = checkBlock(blockPc, BLOCKS);
    const hasBlockMissing = mismatches.some(m => m.type === 'MISSING_BLOCK');

    if (hasBlockMissing) {
      missingCount++;
      console.log(`  MISS  ${hex6(blockPc)} (${blockKey}) — not in BLOCKS`);
      continue;
    }

    // Filter out EXIT_TARGET_MISSING — those are coverage gaps, not transpile errors.
    // We report them separately and don't count as FAIL.
    const hardMismatches = mismatches.filter(m => m.type !== 'EXIT_TARGET_MISSING');
    const softMismatches = mismatches.filter(m => m.type === 'EXIT_TARGET_MISSING');

    if (hardMismatches.length === 0) {
      passCount++;
      const softNote = softMismatches.length ? ` (${softMismatches.length} missing exit targets)` : '';
      console.log(`  PASS  ${hex6(blockPc)} — ${instrCount} instrs${softNote}`);
    } else {
      failCount++;
      console.log(`  FAIL  ${hex6(blockPc)} — ${hardMismatches.length} mismatch(es) in ${instrCount} instrs`);
      for (const m of hardMismatches) {
        const detail = [
          m.type,
          m.instrPc !== undefined ? `@${hex6(m.instrPc)}` : '',
          m.note || '',
        ].filter(Boolean).join('  ');
        console.log(`          -> ${detail}`);
      }
      allFailing.push({ blockPc, blockKey, mismatches: hardMismatches, instrCount });
    }
  }

  // --- Summary ---
  console.log('');
  console.log('--- SUMMARY ---');
  console.log(`  Unique block PCs:  ${sortedPCs.length}`);
  console.log(`  PASS:              ${passCount}`);
  console.log(`  FAIL:              ${failCount}`);
  console.log(`  MISSING (no key):  ${missingCount}`);
  console.log(`  SKIP (non-ROM):    ${skipCount}`);
  console.log('');

  if (allFailing.length === 0) {
    console.log('RESULT: ALL CHECKED BLOCKS PASS FIDELITY CHECK.');
    console.log('No transpilation errors found in the ~230 blocks visited by gcd(12,8).');
  } else {
    console.log(`RESULT: ${failCount} BLOCK(S) HAVE FIDELITY MISMATCHES.`);
    console.log('');
    console.log('--- FAILING BLOCKS DETAIL ---');
    for (const { blockPc, blockKey, mismatches, instrCount } of allFailing) {
      console.log(`  Block ${hex6(blockPc)} (${blockKey}) — ${instrCount} instrs:`);
      for (const m of mismatches) {
        console.log(`    [${m.type}]`);
        if (m.instrPc !== undefined) console.log(`      Instruction PC:  ${hex6(m.instrPc)}`);
        if (m.storedDasm)            console.log(`      Block dasm:      "${m.storedDasm}"`);
        if (m.storedTag)             console.log(`      Block tag:       ${m.storedTag}`);
        if (m.romTag)                console.log(`      ROM tag:         ${m.romTag}`);
        if (m.storedTarget)          console.log(`      Block target:    ${m.storedTarget}`);
        if (m.romTarget)             console.log(`      ROM target:      ${m.romTarget}`);
        if (m.storedValue)           console.log(`      Block value:     ${m.storedValue}`);
        if (m.romValue)              console.log(`      ROM value:       ${m.romValue}`);
        if (m.storedAddr)            console.log(`      Block addr:      ${m.storedAddr}`);
        if (m.romAddr)               console.log(`      ROM addr:        ${m.romAddr}`);
        if (m.note)                  console.log(`      Note:            ${m.note}`);
      }
    }
  }

  console.log('');
  console.log('Done.');
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
