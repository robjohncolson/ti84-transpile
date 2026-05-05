#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;

const TOKEN_STAGING_ADDR = 0xD0230E;
const OP1_ADDR = 0xD005F8;
const TOKEN_LENGTH = 9;

const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const CREATE_REAL_RET = 0x7FFFFE;
const CREATE_REAL_ERR = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const EXP_A_ENTRY = 0x05848F;
const EXP_A_MAX_STEPS = 5000;
const EXP_B_ENTRY = 0x09CB14;
const EXP_B_MAX_STEPS = 2000;

const YEQ_RANGE_START = 0x09C000;
const YEQ_RANGE_END = 0x09D000;
const DISPATCH_RANGE_START = 0x082000;
const DISPATCH_RANGE_END = 0x084000;

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  const out = [];
  for (let i = 0; i < length; i++) out.push(hexByte(buffer[(start + i) & 0xFFFFFF] ?? 0));
  return out.join(' ');
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
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

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.f = 0x40;
  cpu.a = 0x00;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function makeSentinelError(termination, pc) {
  const error = new Error('__PHASE193_SENTINEL__');
  error.isSentinel = true;
  error.termination = termination;
  error.pc = pc & 0xFFFFFF;
  return error;
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };
  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, { maxSteps: segmentBudget, maxLoopIterations });
    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;
    if (result.termination !== 'max_steps') break;
  }
  return { steps: totalSteps, lastPc: lastResult.lastPc ?? currentPc, lastMode: lastResult.lastMode ?? currentMode, termination: lastResult.termination ?? null };
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
  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;
    for (const [name, target] of Object.entries(sentinels)) {
      if (normalizedPc === target) {
        hit = name;
        throw makeSentinelError('sentinel', normalizedPc);
      }
    }
  };
  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) { notePc(pc); },
        onMissingBlock(pc) { notePc(pc); },
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
      if (error?.isSentinel) {
        termination = error.termination;
        lastPc = error.pc;
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }
  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function bootRuntime(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);
  return {
    boot: { steps: boot.steps, lastPc: hex(boot.lastPc), termination: boot.termination },
    kernelInit: { steps: kernelInit.steps, lastPc: hex(kernelInit.lastPc), termination: kernelInit.termination },
    postInit: { steps: postInit.steps, lastPc: hex(postInit.lastPc), termination: postInit.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ROM_ERRNO_ADDR] = 0x00;
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATE_REAL_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, CREATE_REAL_ERR);
  write24(mem, errBase + 3, 0);
  write24(mem, ROM_ERRSP_ADDR, errBase);
  mem[ROM_ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  return {
    errBase: hex(errBase),
    ...runUntilHitSegmented(executor, CREATE_REAL_ENTRY, 'adl', { ret: CREATE_REAL_RET, err: CREATE_REAL_ERR }, CREATE_REAL_MAX_STEPS, OS_MAX_LOOP_ITERATIONS),
  };
}

function disassembleAt(addr, count) {
  const results = [];
  let pc = addr & 0xFFFFFF;
  for (let i = 0; i < count; i++) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const instrBytes = hexBytes(romBytes, pc, instr.length);
      const mnemonic = instr.dasm ?? instr.tag ?? `db 0x${hexByte(romBytes[pc])}`;
      results.push({ pc: hex(pc), bytes: instrBytes, mnemonic, length: instr.length });
      pc += instr.length;
    } catch (e) {
      results.push({ pc: hex(pc), bytes: hexByte(romBytes[pc]), mnemonic: '???', length: 1, error: e.message });
      pc += 1;
    }
  }
  return results;
}

function runExperimentA(executor, cpu, mem, baselineMem) {
  console.log('\n=== Experiment A: Extended trace from 0x05848F (5000 steps) ===\n');

  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);

  // Seed TOKEN_STAGING with type=0x06, token=0x8D (same as hypothesis D from phase 192)
  const tokenBytes = [0x06, 0x8D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  for (let i = 0; i < tokenBytes.length; i++) mem[TOKEN_STAGING_ADDR + i] = tokenBytes[i];

  cpu.a = 0x8D;
  cpu._hl = TOKEN_STAGING_ADDR;
  cpu._ix = IX_ADDR;
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);

  const uniqueBlocks = new Set();
  const yeqBlocks = [];
  const dispatchBlocks = [];
  const missingBlocks = [];
  let finalPc = EXP_A_ENTRY;
  let finalMode = 'adl';
  let totalSteps = 0;
  let termination = null;
  let errorMessage = null;
  let hit = null;

  let currentPc = EXP_A_ENTRY;
  let currentMode = 'adl';

  const noteBlock = (pc, mode, missing) => {
    const npc = pc & 0xFFFFFF;
    finalPc = npc;
    finalMode = mode ?? finalMode;
    uniqueBlocks.add(npc);
    if (missing && !missingBlocks.includes(npc)) missingBlocks.push(npc);
    if (npc >= YEQ_RANGE_START && npc < YEQ_RANGE_END && !yeqBlocks.includes(npc)) yeqBlocks.push(npc);
    if (npc >= DISPATCH_RANGE_START && npc < DISPATCH_RANGE_END && !dispatchBlocks.includes(npc)) dispatchBlocks.push(npc);
    if (npc === TRACE_RET) {
      hit = 'ret';
      throw makeSentinelError('sentinel', npc);
    }
  };

  while (totalSteps < EXP_A_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, EXP_A_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, mode) { noteBlock(pc, mode, false); },
        onMissingBlock(pc, mode) { noteBlock(pc, mode, true); },
      });
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      finalPc = currentPc;
      finalMode = currentMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        termination = error.termination;
        finalPc = error.pc;
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= EXP_A_MAX_STEPS && !hit) termination = 'step_limit';

  // Static disassembly of entry point
  const disasm = disassembleAt(EXP_A_ENTRY, 10);

  const result = {
    experiment: 'A',
    description: 'Extended trace from 0x05848F with TOKEN_STAGING=[0x06,0x8D,0x00...], 5000 step limit',
    entry: hex(EXP_A_ENTRY),
    stepLimit: EXP_A_MAX_STEPS,
    tokenStagingSeed: tokenBytes.map(b => hexByte(b)).join(' '),
    totalSteps,
    termination,
    finalPc: hex(finalPc),
    finalMode,
    sentinelHit: hit,
    uniqueBlockCount: uniqueBlocks.size,
    yeqBlocks: yeqBlocks.map(pc => hex(pc)),
    yeqBlockCount: yeqBlocks.length,
    dispatchBlocks_082000_084000: dispatchBlocks.map(pc => hex(pc)),
    dispatchBlockCount: dispatchBlocks.length,
    missingBlocks: missingBlocks.map(pc => hex(pc)),
    missingBlockCount: missingBlocks.length,
    finalCpu: snapshotCpu(cpu),
    errorMessage,
    staticDisassembly: disasm,
  };

  console.log(`  Entry: ${hex(EXP_A_ENTRY)}`);
  console.log(`  Steps: ${totalSteps} / ${EXP_A_MAX_STEPS}`);
  console.log(`  Termination: ${termination}`);
  console.log(`  Final PC: ${hex(finalPc)}`);
  console.log(`  Unique blocks: ${uniqueBlocks.size}`);
  console.log(`  Y= range blocks (0x09C000-0x09D000): ${yeqBlocks.length}`);
  if (yeqBlocks.length > 0) console.log(`    ${yeqBlocks.map(pc => hex(pc)).join(', ')}`);
  console.log(`  Dispatch range blocks (0x082000-0x084000): ${dispatchBlocks.length}`);
  if (dispatchBlocks.length > 0) console.log(`    ${dispatchBlocks.slice(0, 20).map(pc => hex(pc)).join(', ')}${dispatchBlocks.length > 20 ? '...' : ''}`);
  console.log(`  Missing blocks: ${missingBlocks.length}`);
  if (missingBlocks.length > 0) console.log(`    ${missingBlocks.map(pc => hex(pc)).join(', ')}`);
  console.log(`\n  Static disassembly at ${hex(EXP_A_ENTRY)}:`);
  for (const d of disasm) console.log(`    ${d.pc}: [${d.bytes}] ${d.mnemonic}`);

  return result;
}

function runExperimentB(executor, cpu, mem, baselineMem) {
  console.log('\n=== Experiment B: Direct entry at 0x09CB14 (Y= attribute status line) ===\n');

  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);

  cpu._ix = IX_ADDR;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);

  const uniqueBlocks = new Set();
  const firstBlocks = [];
  const yeqBlocks = [];
  const missingBlocks = [];
  let finalPc = EXP_B_ENTRY;
  let finalMode = 'adl';
  let totalSteps = 0;
  let termination = null;
  let errorMessage = null;
  let hit = null;

  let currentPc = EXP_B_ENTRY;
  let currentMode = 'adl';

  const noteBlock = (pc, mode, missing) => {
    const npc = pc & 0xFFFFFF;
    finalPc = npc;
    finalMode = mode ?? finalMode;
    if (!uniqueBlocks.has(npc)) {
      uniqueBlocks.add(npc);
      if (firstBlocks.length < 30) firstBlocks.push(npc);
    }
    if (missing && !missingBlocks.includes(npc)) missingBlocks.push(npc);
    if (npc >= YEQ_RANGE_START && npc < YEQ_RANGE_END && !yeqBlocks.includes(npc)) yeqBlocks.push(npc);
    if (npc === TRACE_RET) {
      hit = 'ret';
      throw makeSentinelError('sentinel', npc);
    }
  };

  while (totalSteps < EXP_B_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, EXP_B_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, mode) { noteBlock(pc, mode, false); },
        onMissingBlock(pc, mode) { noteBlock(pc, mode, true); },
      });
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      finalPc = currentPc;
      finalMode = currentMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        termination = error.termination;
        finalPc = error.pc;
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= EXP_B_MAX_STEPS && !hit) termination = 'step_limit';

  // Static disassembly of entry point
  const disasm = disassembleAt(EXP_B_ENTRY, 10);

  const result = {
    experiment: 'B',
    description: 'Direct entry at 0x09CB14 (Y= attribute status line) with minimal setup, 2000 step limit',
    entry: hex(EXP_B_ENTRY),
    stepLimit: EXP_B_MAX_STEPS,
    totalSteps,
    termination,
    finalPc: hex(finalPc),
    finalMode,
    sentinelHit: hit,
    uniqueBlockCount: uniqueBlocks.size,
    firstBlocks: firstBlocks.map(pc => hex(pc)),
    yeqBlocks: yeqBlocks.map(pc => hex(pc)),
    yeqBlockCount: yeqBlocks.length,
    missingBlocks: missingBlocks.map(pc => hex(pc)),
    missingBlockCount: missingBlocks.length,
    finalCpu: snapshotCpu(cpu),
    errorMessage,
    staticDisassembly: disasm,
  };

  console.log(`  Entry: ${hex(EXP_B_ENTRY)}`);
  console.log(`  Steps: ${totalSteps} / ${EXP_B_MAX_STEPS}`);
  console.log(`  Termination: ${termination}`);
  console.log(`  Final PC: ${hex(finalPc)}`);
  console.log(`  Unique blocks: ${uniqueBlocks.size}`);
  console.log(`  First 30 blocks: ${firstBlocks.map(pc => hex(pc)).join(', ')}`);
  console.log(`  Y= range blocks (0x09C000-0x09D000): ${yeqBlocks.length}`);
  if (yeqBlocks.length > 0) console.log(`    ${yeqBlocks.map(pc => hex(pc)).join(', ')}`);
  console.log(`  Missing blocks: ${missingBlocks.length}`);
  if (missingBlocks.length > 0) console.log(`    ${missingBlocks.map(pc => hex(pc)).join(', ')}`);
  console.log(`\n  Static disassembly at ${hex(EXP_B_ENTRY)}:`);
  for (const d of disasm) console.log(`    ${d.pc}: [${d.bytes}] ${d.mnemonic}`);

  return result;
}

function main() {
  console.log('=== Phase 193: Y= Extended Trace Experiments ===\n');
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('[0] Booting runtime and preparing baseline state\n');
  const boot = bootRuntime(executor, cpu, mem);
  console.log(`  Boot: ${JSON.stringify(boot.boot)}`);
  console.log(`  KernelInit: ${JSON.stringify(boot.kernelInit)}`);
  console.log(`  PostInit: ${JSON.stringify(boot.postInit)}`);

  const memInit = runMemInit(executor, cpu, mem);
  console.log(`  MemInit: hit=${memInit.hit} steps=${memInit.steps} termination=${memInit.termination}`);
  if (memInit.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase193-yeq-extended',
      status: 'aborted',
      reason: 'MemInit did not return',
      boot,
      memInit: { hit: memInit.hit, steps: memInit.steps, termination: memInit.termination, lastPc: hex(memInit.lastPc), errorMessage: memInit.errorMessage },
    }, null, 2));
    return;
  }

  const createReal = runCreateRealAns(executor, cpu, mem);
  console.log(`  CreateReal(Ans): hit=${createReal.hit} steps=${createReal.steps} termination=${createReal.termination} errBase=${createReal.errBase}`);
  if (createReal.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase193-yeq-extended',
      status: 'aborted',
      reason: 'CreateReal(Ans) did not return',
      boot,
      createReal: { hit: createReal.hit, steps: createReal.steps, termination: createReal.termination, lastPc: hex(createReal.lastPc), errBase: createReal.errBase, errorMessage: createReal.errorMessage },
    }, null, 2));
    return;
  }

  // Snapshot baseline for experiments
  const baselineMem = mem.slice();

  // Run experiments
  const expA = runExperimentA(executor, cpu, mem, baselineMem);
  const expB = runExperimentB(executor, cpu, mem, baselineMem);

  // Final JSON report
  console.log('\n=== JSON Summary ===');
  console.log(JSON.stringify({
    probe: 'phase193-yeq-extended',
    status: 'completed',
    boot,
    memInit: { hit: memInit.hit, steps: memInit.steps, termination: memInit.termination },
    createReal: { hit: createReal.hit, steps: createReal.steps, termination: createReal.termination, errBase: createReal.errBase },
    experimentA: expA,
    experimentB: expB,
    notes: [
      'Experiment A extends the phase 192 hypothesis D trace from 2000 to 5000 steps to see if Y= editor blocks are reached.',
      'Experiment B enters 0x09CB14 (Y= attribute status line) directly with minimal setup to probe the Y= editor code.',
      'Both experiments track blocks in 0x09C000-0x09D000 (Y= editor area) and report missing blocks.',
    ],
  }, null, 2));
}

main();
