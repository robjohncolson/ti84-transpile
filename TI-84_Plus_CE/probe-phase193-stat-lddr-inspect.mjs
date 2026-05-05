#!/usr/bin/env node
/**
 * probe-phase193-stat-lddr-inspect.mjs
 *
 * Inspects WHY the LDDR block at 0x092263 falls to the boot vector instead of
 * continuing to 0x092265. Three-part investigation:
 *
 * 1. Find and print the transpiled block source for 0x092263
 * 2. Run the STAT trace and capture register state at LDDR entry/exit
 * 3. Check if the transpiler emits a proper fallthrough for LDDR
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const ENTRY_ADDR = 0x058BA9;
const TARGET_BLOCK = 0x092263;
const SUCCESSOR_ADDR = 0x092265;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE193_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CONTEXT_ENTRY_MAX_STEPS = 3000;
const OS_MAX_LOOP_ITERATIONS = 8192;

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
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
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          lastPc = norm;
          for (const [name, target] of Object.entries(sentinels)) {
            if (norm === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          lastPc = norm;
          for (const [name, target] of Object.entries(sentinels)) {
            if (norm === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }
        },
      });
      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function snapshotCpu(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    hl: hex(cpu._hl),
    de: hex(cpu._de),
    bc: hex(cpu._bc),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: bootResult.steps, lastPc: hex(bootResult.lastPc), termination: bootResult.termination },
    kernelInit: { steps: kernelInitResult.steps, lastPc: hex(kernelInitResult.lastPc), termination: kernelInitResult.termination },
    postInit: { steps: postInitResult.steps, lastPc: hex(postInitResult.lastPc), termination: postInitResult.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[0xD008DF] = 0x00;
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

// ============================================================
// PART 1: Find and print transpiled block source for 0x092263
// ============================================================

function inspectTranspiledBlock() {
  console.log('=== PART 1: Transpiled Block Source for 0x092263 ===');
  console.log('');

  // Try various key formats
  const keysToTry = [
    blockKey(TARGET_BLOCK, 'adl'),
    blockKey(TARGET_BLOCK, 'z80'),
    `${TARGET_BLOCK}`,
    `0x${TARGET_BLOCK.toString(16)}`,
    TARGET_BLOCK.toString(16).padStart(6, '0'),
    `0x${TARGET_BLOCK.toString(16).padStart(6, '0')}`,
  ];

  let foundBlock = null;
  let foundKey = null;

  for (const key of keysToTry) {
    if (BLOCKS[key]) {
      foundBlock = BLOCKS[key];
      foundKey = key;
      break;
    }
  }

  // Also try numeric key
  if (!foundBlock && BLOCKS[TARGET_BLOCK]) {
    foundBlock = BLOCKS[TARGET_BLOCK];
    foundKey = `${TARGET_BLOCK} (numeric)`;
  }

  if (!foundBlock) {
    console.log(`  Block NOT FOUND. Tried keys: ${keysToTry.join(', ')}`);
    console.log('');

    // Search for any block key containing '092263'
    const matchingKeys = Object.keys(BLOCKS).filter((k) => k.includes('092263'));
    if (matchingKeys.length > 0) {
      console.log(`  Found matching keys by substring: ${matchingKeys.join(', ')}`);
      foundBlock = BLOCKS[matchingKeys[0]];
      foundKey = matchingKeys[0];
    } else {
      console.log('  No block containing "092263" found in PRELIFTED_BLOCKS.');
      console.log('');

      // Check nearby blocks that might contain this address
      const nearby = Object.keys(BLOCKS).filter((k) => {
        const addrPart = k.split(':')[0];
        const addr = parseInt(addrPart, 16);
        return addr >= 0x092250 && addr <= 0x092270;
      });
      if (nearby.length > 0) {
        console.log(`  Nearby blocks (0x092250..0x092270): ${nearby.join(', ')}`);
        for (const nk of nearby) {
          const nb = BLOCKS[nk];
          const src = typeof nb === 'function' ? nb.toString() : (typeof nb?.fn === 'function' ? nb.fn.toString() : JSON.stringify(nb).substring(0, 500));
          console.log(`  --- ${nk} source (first 1000 chars): ---`);
          console.log(src.substring(0, 1000));
          console.log('');
        }
      }
      return null;
    }
  }

  console.log(`  Found block with key: ${foundKey}`);
  console.log('');

  // Print source
  let source;
  if (typeof foundBlock === 'function') {
    source = foundBlock.toString();
  } else if (typeof foundBlock?.fn === 'function') {
    source = foundBlock.fn.toString();
  } else if (typeof foundBlock?.execute === 'function') {
    source = foundBlock.execute.toString();
  } else {
    source = JSON.stringify(foundBlock, null, 2);
  }

  console.log('  Block source (first 2000 chars):');
  console.log(source.substring(0, 2000));
  console.log('');

  // Analyze: look for successor references
  console.log('  --- Analysis ---');
  const hasSuccessor092265 = source.includes('092265') || source.includes('0x092265') || source.includes('599653');
  const hasBootVector = source.includes('0x000000') || source.includes('000000');
  const hasBcCheck = source.includes('bc') || source.includes('BC');
  const hasLoop = source.includes('while') || source.includes('for') || source.includes('loop');
  const blocksCalls = source.match(/blocks\[['"]?[0-9a-fA-F]+/g) ?? [];
  const pcAssigns = source.match(/cpu\.pc\s*=\s*[^;]+/g) ?? [];
  const nextBlockRefs = source.match(/(?:blocks\[|pc\s*=\s*)[^;\n]+/g) ?? [];

  console.log(`  References successor 0x092265: ${hasSuccessor092265}`);
  console.log(`  References boot vector 0x000000: ${hasBootVector}`);
  console.log(`  References BC register: ${hasBcCheck}`);
  console.log(`  Contains loop construct: ${hasLoop}`);
  console.log(`  Block calls found: ${JSON.stringify(blocksCalls.slice(0, 10))}`);
  console.log(`  PC assignments found: ${JSON.stringify(pcAssigns.slice(0, 10))}`);
  console.log(`  Next-block refs: ${JSON.stringify(nextBlockRefs.slice(0, 10))}`);
  console.log('');

  return source;
}

// ============================================================
// PART 2: Run STAT trace and capture register state at LDDR
// ============================================================

function runStatTraceWithLddrCapture(executor, cpu, mem) {
  console.log('=== PART 2: STAT Trace with LDDR Register Capture ===');
  console.log('');

  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;

  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  let lddrEntryState = null;
  let lddrExitPc = null;
  let lddrExitState = null;
  let reachedTarget = false;
  let afterTargetPcs = [];
  let totalSteps = 0;
  let currentPc = ENTRY_ADDR & 0xFFFFFF;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;

  while (totalSteps < CONTEXT_ENTRY_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, CONTEXT_ENTRY_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;

          if (norm === TARGET_BLOCK && !reachedTarget) {
            // Capture state BEFORE the LDDR block executes
            lddrEntryState = {
              bc: cpu._bc,
              de: cpu._de,
              hl: cpu._hl,
              sp: cpu.sp,
              a: cpu.a,
              f: cpu.f,
              pc: norm,
            };
            reachedTarget = true;
          } else if (reachedTarget && lddrExitPc === null) {
            // First block AFTER the LDDR — this is where execution went
            lddrExitPc = norm;
            lddrExitState = {
              bc: cpu._bc,
              de: cpu._de,
              hl: cpu._hl,
              sp: cpu.sp,
              a: cpu.a,
              f: cpu.f,
              pc: norm,
            };
          }

          if (reachedTarget) {
            afterTargetPcs.push(norm);
          }

          if (norm === RETURN_SENTINEL) {
            hit = 'sentinel';
            throw new Error(TRACE_STOP);
          }
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;

          if (reachedTarget && lddrExitPc === null) {
            lddrExitPc = norm;
            lddrExitState = {
              bc: cpu._bc,
              de: cpu._de,
              hl: cpu._hl,
              sp: cpu.sp,
              a: cpu.a,
              f: cpu.f,
              pc: norm,
              missing: true,
            };
          }

          if (reachedTarget) {
            afterTargetPcs.push(norm);
          }

          if (norm === RETURN_SENTINEL) {
            hit = 'sentinel';
            throw new Error(TRACE_STOP);
          }
        },
      });
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= CONTEXT_ENTRY_MAX_STEPS && !hit) {
    termination = 'step_limit';
  }

  console.log(`  Trace: steps=${totalSteps} termination=${termination} hit=${hit ?? 'none'}`);
  console.log(`  Target 0x092263 reached: ${reachedTarget}`);
  console.log('');

  if (lddrEntryState) {
    console.log('  LDDR ENTRY state (before block executes):');
    console.log(`    BC = ${hex(lddrEntryState.bc)} (${lddrEntryState.bc})`);
    console.log(`    DE = ${hex(lddrEntryState.de)} (${lddrEntryState.de})`);
    console.log(`    HL = ${hex(lddrEntryState.hl)} (${lddrEntryState.hl})`);
    console.log(`    SP = ${hex(lddrEntryState.sp)}`);
    console.log(`    A  = ${hex(lddrEntryState.a, 2)}`);
    console.log(`    F  = ${hex(lddrEntryState.f, 2)}`);
    console.log('');
  } else {
    console.log('  LDDR block was NOT reached during trace.');
    console.log('');
  }

  if (lddrExitState) {
    console.log(`  LDDR EXIT — execution went to: ${hex(lddrExitPc)}${lddrExitState.missing ? ' [MISSING BLOCK]' : ''}`);
    console.log('    State after LDDR:');
    console.log(`    BC = ${hex(lddrExitState.bc)} (${lddrExitState.bc})`);
    console.log(`    DE = ${hex(lddrExitState.de)} (${lddrExitState.de})`);
    console.log(`    HL = ${hex(lddrExitState.hl)} (${lddrExitState.hl})`);
    console.log(`    SP = ${hex(lddrExitState.sp)}`);
    console.log(`    A  = ${hex(lddrExitState.a, 2)}`);
    console.log(`    F  = ${hex(lddrExitState.f, 2)}`);
    console.log('');

    const wentToBootVector = lddrExitPc === BOOT_ENTRY;
    const wentToSuccessor = lddrExitPc === SUCCESSOR_ADDR;
    console.log(`  Went to boot vector (0x000000): ${wentToBootVector}`);
    console.log(`  Went to correct successor (0x092265): ${wentToSuccessor}`);
    console.log('');
  }

  if (afterTargetPcs.length > 0) {
    console.log(`  PCs visited after target (first 20): ${afterTargetPcs.slice(0, 20).map((pc) => hex(pc)).join(', ')}`);
    console.log('');
  }

  return {
    reachedTarget,
    lddrEntryState,
    lddrExitPc,
    lddrExitState,
    afterTargetPcs: afterTargetPcs.slice(0, 30),
    steps: totalSteps,
    termination,
    hit,
    errorMessage: errorMessage ? errorMessage.split('\n')[0] : null,
  };
}

// ============================================================
// PART 3: Check transpiler LDDR fallthrough correctness
// ============================================================

function checkLddrFallthrough(blockSource) {
  console.log('=== PART 3: LDDR Fallthrough Analysis ===');
  console.log('');

  // Disassemble the ROM bytes at 0x092263
  console.log('  ROM bytes at 0x092263:');
  const bytes = Array.from(romBytes.subarray(0x092263, 0x092270), (b) => b.toString(16).toUpperCase().padStart(2, '0'));
  console.log(`    ${bytes.join(' ')}`);
  console.log('');

  try {
    const decoded = decodeInstruction(romBytes, 0x092263, 'adl');
    console.log(`  Decoded instruction at 0x092263:`);
    console.log(`    tag=${decoded.tag} length=${decoded.length} nextPc=${hex(decoded.nextPc)}`);
    console.log('');

    if (decoded.tag === 'lddr') {
      console.log('  Confirmed: 0x092263 IS an LDDR instruction.');
      console.log(`  Expected fallthrough when BC=0: PC should go to ${hex(decoded.nextPc)}`);
      console.log('');
    }
  } catch (e) {
    console.log(`  Decode error: ${e.message}`);
    console.log('');
  }

  // Decode what comes after
  console.log('  Instructions after LDDR:');
  for (let pc = 0x092265; pc < 0x092275;) {
    try {
      const d = decodeInstruction(romBytes, pc, 'adl');
      const bytesStr = Array.from(romBytes.subarray(pc, pc + d.length), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      console.log(`    ${hex(pc)}  ${bytesStr.padEnd(17)}  ${d.tag}`);
      pc = d.nextPc;
    } catch {
      console.log(`    ${hex(pc)}  decode-failed`);
      pc += 1;
    }
  }
  console.log('');

  // Analyze the transpiled source
  if (!blockSource) {
    console.log('  Cannot analyze transpiled source — block not found.');
    console.log('');
    console.log('  DIAGNOSIS: Block 0x092263 is missing from PRELIFTED_BLOCKS.');
    console.log('  This means the transpiler never generated a block for this address.');
    console.log('  When execution reaches this PC and no block exists, the runtime');
    console.log('  likely falls through to a default handler or resets to 0x000000.');
    return 'missing_block';
  }

  console.log('  Transpiled source analysis:');

  // Check for LDDR loop implementation
  const hasLddrLoop = blockSource.includes('lddr') ||
    (blockSource.includes('while') && blockSource.includes('bc')) ||
    (blockSource.includes('do') && blockSource.includes('bc'));
  console.log(`    Has LDDR loop implementation: ${hasLddrLoop}`);

  // Check for BC decrement
  const hasBcDecrement = blockSource.includes('bc--') ||
    blockSource.includes('bc -= ') ||
    blockSource.includes('_bc--') ||
    blockSource.includes('_bc -= ') ||
    blockSource.includes('_bc -');
  console.log(`    Has BC decrement: ${hasBcDecrement}`);

  // Check for fallthrough to successor
  const hasSuccessorRef = blockSource.includes('092265') ||
    blockSource.includes('599653') || // 0x092265 in decimal
    blockSource.includes(SUCCESSOR_ADDR.toString(16));
  console.log(`    References successor address 0x092265: ${hasSuccessorRef}`);

  // Check if it just sets pc to 0 or returns without successor
  const setsToZero = blockSource.includes('pc = 0') || blockSource.includes('cpu.pc = 0');
  const hasReturn = blockSource.includes('return');
  console.log(`    Sets PC to 0: ${setsToZero}`);
  console.log(`    Has return statement: ${hasReturn}`);
  console.log('');

  // Diagnosis
  let diagnosis;
  if (!hasSuccessorRef && !hasLddrLoop) {
    diagnosis = 'transpiler_bug_no_lddr_impl';
    console.log('  DIAGNOSIS: Transpiler bug — block does not implement LDDR semantics');
    console.log('  and does not reference the correct successor address 0x092265.');
  } else if (hasLddrLoop && !hasSuccessorRef) {
    diagnosis = 'transpiler_bug_missing_fallthrough';
    console.log('  DIAGNOSIS: Transpiler bug — LDDR loop exists but no fallthrough');
    console.log('  to 0x092265 when BC reaches 0.');
  } else if (hasSuccessorRef && hasLddrLoop) {
    diagnosis = 'runtime_issue';
    console.log('  DIAGNOSIS: Block has both LDDR loop and successor reference.');
    console.log('  Issue may be a runtime problem (BC value, memory state) rather');
    console.log('  than a transpiler bug.');
  } else {
    diagnosis = 'unclear';
    console.log('  DIAGNOSIS: Unclear — manual inspection of block source needed.');
  }
  console.log('');

  return diagnosis;
}

// ============================================================
// MAIN
// ============================================================

function main() {
  console.log('probe-phase193-stat-lddr-inspect.mjs');
  console.log('=====================================');
  console.log('');

  // Part 1: Inspect the transpiled block
  const blockSource = inspectTranspiledBlock();

  // Boot runtime
  const runtime = createRuntime();
  const bootInfo = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);

  console.log('=== Boot Summary ===');
  console.log(`  boot.steps=${bootInfo.boot.steps} termination=${bootInfo.boot.termination}`);
  console.log(`  kernelInit.steps=${bootInfo.kernelInit.steps} termination=${bootInfo.kernelInit.termination}`);
  console.log(`  postInit.steps=${bootInfo.postInit.steps} termination=${bootInfo.postInit.termination}`);
  console.log(`  memInit.steps=${memInit.steps} termination=${memInit.termination} hit=${memInit.hit ?? 'none'}`);
  console.log('');

  // Part 2: Run STAT trace with register capture
  let traceResult = null;
  if (memInit.hit === 'ret') {
    traceResult = runStatTraceWithLddrCapture(runtime.executor, runtime.cpu, runtime.mem);
  } else {
    console.log('=== PART 2: SKIPPED (MemInit did not complete) ===');
    console.log('');
  }

  // Part 3: Fallthrough analysis
  const diagnosis = checkLddrFallthrough(blockSource);

  // Final summary
  console.log('=== FINAL SUMMARY ===');
  console.log('');
  console.log(`  Block 0x092263 present in PRELIFTED_BLOCKS: ${blockSource !== null}`);
  if (traceResult) {
    console.log(`  LDDR reached during trace: ${traceResult.reachedTarget}`);
    if (traceResult.lddrEntryState) {
      console.log(`  BC at LDDR entry: ${hex(traceResult.lddrEntryState.bc)} (${traceResult.lddrEntryState.bc})`);
      const bcIsZero = traceResult.lddrEntryState.bc === 0;
      console.log(`  BC is zero at entry (LDDR is no-op): ${bcIsZero}`);
    }
    if (traceResult.lddrExitPc !== null) {
      console.log(`  Execution after LDDR went to: ${hex(traceResult.lddrExitPc)}`);
      console.log(`  Expected successor: ${hex(SUCCESSOR_ADDR)}`);
      console.log(`  Went to boot vector: ${traceResult.lddrExitPc === BOOT_ENTRY}`);
    }
  }
  console.log(`  Diagnosis: ${diagnosis}`);
  console.log('');

  // JSON output
  const output = {
    targetBlock: hex(TARGET_BLOCK),
    successorAddr: hex(SUCCESSOR_ADDR),
    blockPresent: blockSource !== null,
    traceResult: traceResult ? {
      reachedTarget: traceResult.reachedTarget,
      lddrEntryBC: traceResult.lddrEntryState?.bc ?? null,
      lddrExitPc: traceResult.lddrExitPc !== null ? hex(traceResult.lddrExitPc) : null,
      wentToBootVector: traceResult.lddrExitPc === BOOT_ENTRY,
      wentToSuccessor: traceResult.lddrExitPc === SUCCESSOR_ADDR,
      afterTargetPcs: traceResult.afterTargetPcs.map(hex),
      steps: traceResult.steps,
      termination: traceResult.termination,
    } : null,
    diagnosis,
  };

  console.log('=== JSON OUTPUT ===');
  console.log(JSON.stringify(output, null, 2));
}

main();
