#!/usr/bin/env node

/**
 * Phase 25AC: StoAns sub-trace comparison — with vs without Ans pre-created.
 *
 * Two scenarios:
 *   A (control): MEM_INIT -> ParseInp("2+3"), no variables, OP1=zeros
 *   B (Ans exists): MEM_INIT -> CreateReal(Ans) -> clear OP1 -> ParseInp("2+3")
 *
 * For each scenario, records EVERY PC visited plus OP1[0] transitions per step.
 * Extracts the StoAns sub-trace (last ~70 steps) and compares side by side.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

/* ---------- Constants ---------- */
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEM_INIT_ENTRY = 0x09dee0;
const CREATEREAL_ENTRY = 0x08238a;
const PARSEINP_ENTRY = 0x099914;

const OP1_ADDR = 0xd005f8;
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const TOKEN_BUFFER_ADDR = 0xd00800;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEM_INIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]); // "2+3" + newline
const ANS_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const MEM_INIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;

// Known routines for annotation
const KNOWN_ROUTINES = {
  0x061d3a: 'ErrorRegionEntry',
  0x061d3e: 'ErrMemory_JP',
  0x061db2: 'JError',
  0x061dba: 'JError+8',
  0x061dd1: 'PopErrorHandler',
  0x061def: 'PushErrorHandler',
  0x061e27: 'NormalReturnCleanup',
  0x08383d: 'ChkFindSym',
  0x0846ea: 'FindSym',
  0x07c77f: 'FPAdd',
  0x099914: 'ParseInp',
  0x099a9b: 'StoAns_suspected',
};

/* ---------- Helpers ---------- */
function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function safeReadReal(memWrap, addr) {
  try {
    return readReal(memWrap, addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
  };
}

function formatPointerSnapshot(s) {
  return [
    `tempMem=${hex(s.tempMem)}`,
    `FPSbase=${hex(s.fpsBase)}`,
    `FPS=${hex(s.fps)}`,
    `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`,
    `pTemp=${hex(s.pTemp)}`,
    `progPtr=${hex(s.progPtr)}`,
    `newDataPtr=${hex(s.newDataPtr)}`,
    `errNo=${hex(s.errNo, 2)}`,
  ].join(' ');
}

/* ---------- Runtime factory ---------- */
function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu, memWrap: wrapMem(mem) };
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

function seedMinimalErrFrame(cpu, mem, returnAddr) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, returnAddr);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return errFrameBase;
}

function setupTokens(mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
}

/* ---------- Run a single scenario ---------- */
function runScenario(label, withAns) {
  const log = (line) => console.log(`[${label}] ${line}`);
  log(`Starting scenario (withAns=${withAns})`);

  const { mem, executor, cpu, memWrap } = createRuntime();

  // Cold boot
  coldBoot(executor, cpu, mem);
  log('Cold boot complete');

  // MEM_INIT
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let meminitDone = false;
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') meminitDone = true; else throw e;
  }

  if (!meminitDone) {
    log('MEM_INIT did not return! Aborting.');
    return null;
  }
  log('MEM_INIT returned');
  const postMeminitPointers = snapshotPointers(mem);
  log(`post-MEM_INIT: ${formatPointerSnapshot(postMeminitPointers)}`);

  // Optionally create Ans variable
  let ansDE = null;
  if (withAns) {
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
    mem.set(ANS_OP1, OP1_ADDR);
    log(`OP1 seeded for CreateReal(Ans): [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);

    prepareCallState(cpu, mem);
    cpu.a = 0x00;
    cpu._hl = 0x000009;
    seedMinimalErrFrame(cpu, mem, CREATEREAL_RET);

    let createDone = false;
    try {
      executor.runFrom(CREATEREAL_ENTRY, 'adl', {
        maxSteps: CREATEREAL_BUDGET,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc) {
          const norm = pc & 0xffffff;
          if (norm === CREATEREAL_RET || norm === 0xffffff) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          const norm = pc & 0xffffff;
          if (norm === CREATEREAL_RET || norm === 0xffffff) throw new Error('__RET__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') createDone = true; else throw e;
    }

    ansDE = cpu.de & 0xffffff;
    log(`CreateReal done=${createDone} errNo=${hex(mem[ERR_NO_ADDR] & 0xff, 2)} DE=${hex(ansDE)}`);

    // Clear OP1 back to zeros
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  }

  // Setup tokens and ParseInp
  setupTokens(mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);

  const prePointers = snapshotPointers(mem);
  log(`pre-ParseInp: ${formatPointerSnapshot(prePointers)}`);

  prepareCallState(cpu, mem);
  seedMinimalErrFrame(cpu, mem, FAKE_RET);

  // ---------- TRACE ----------
  const allPCs = [];
  const op1b0Trace = [];     // {step, pc, from, to}
  const errNoTrace = [];     // {step, pc, from, to}
  let prevOp1b0 = mem[OP1_ADDR] & 0xff;
  let prevErrNo = mem[ERR_NO_ADDR] & 0xff;
  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

    allPCs.push(norm);
    const idx = allPCs.length - 1;

    const curOp1b0 = mem[OP1_ADDR] & 0xff;
    if (curOp1b0 !== prevOp1b0) {
      op1b0Trace.push({ step: idx, pc: norm, from: prevOp1b0, to: curOp1b0 });
      prevOp1b0 = curOp1b0;
    }

    const curErrNo = mem[ERR_NO_ADDR] & 0xff;
    if (curErrNo !== prevErrNo) {
      errNoTrace.push({ step: idx, pc: norm, from: prevErrNo, to: curErrNo });
      prevErrNo = curErrNo;
    }

    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) { notePc(pc, step); },
      onMissingBlock(pc, mode, step) { notePc(pc, step); },
    });
    finalPc = result.lastPc ?? finalPc;
    termination = result.termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      termination = 'return_hit';
      finalPc = FAKE_RET;
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
    } else {
      throw error;
    }
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const op1Bytes = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op1Decoded = safeReadReal(memWrap, OP1_ADDR);
  const postPointers = snapshotPointers(mem);

  // Check Ans data slot if applicable
  let ansDataAfter = null;
  if (withAns && ansDE !== null && ansDE > 0 && ansDE + 9 <= MEM_SIZE) {
    ansDataAfter = hexBytes(mem, ansDE, 9);
  }

  log(`ParseInp: steps=${allPCs.length} term=${termination} errNo=${hex(errNo, 2)}`);
  log(`OP1=[${op1Bytes}] decoded=${op1Decoded}`);
  log(`post-ParseInp: ${formatPointerSnapshot(postPointers)}`);

  // Unique PCs
  const uniquePCs = [...new Set(allPCs)].sort((a, b) => a - b);

  return {
    label,
    withAns,
    allPCs,
    op1b0Trace,
    errNoTrace,
    totalSteps: allPCs.length,
    termination,
    returnHit,
    errCaught,
    errNo,
    op1Bytes,
    op1Decoded,
    prePointers,
    postPointers,
    uniquePCs,
    ansDE,
    ansDataAfter,
  };
}

/* ---------- Main ---------- */
function main() {
  console.log('=== Phase 25AC: StoAns Sub-Trace Comparison ===\n');

  const resultA = runScenario('A', false);
  console.log('');
  const resultB = runScenario('B', true);

  if (!resultA || !resultB) {
    console.error('One or both scenarios failed to complete.');
    process.exitCode = 1;
    return;
  }

  // ---------- Analysis ----------
  console.log('\n=== ANALYSIS ===\n');

  // Find StoAns entry in each: look for OP1[0] -> 0xFF transition
  function findStoAnsEntry(result) {
    const t = result.op1b0Trace.find(t => t.to === 0xff);
    return t ? t.step : null;
  }

  const stoAnsStepA = findStoAnsEntry(resultA);
  const stoAnsStepB = findStoAnsEntry(resultB);

  console.log(`Scenario A: totalSteps=${resultA.totalSteps}, errNo=${hex(resultA.errNo, 2)}, OP1 decoded=${resultA.op1Decoded}`);
  console.log(`  StoAns entry (OP1[0]->0xFF): step ${stoAnsStepA ?? 'NOT FOUND'}`);
  console.log(`  OP1[0] transitions: ${resultA.op1b0Trace.length}`);
  for (const t of resultA.op1b0Trace) {
    const lbl = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    console.log(`    step ${t.step}: PC=${hex(t.pc)} OP1[0] ${hex(t.from, 2)}->${hex(t.to, 2)}${lbl}`);
  }
  console.log(`  errNo transitions: ${resultA.errNoTrace.length}`);
  for (const t of resultA.errNoTrace) {
    const lbl = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    console.log(`    step ${t.step}: PC=${hex(t.pc)} errNo ${hex(t.from, 2)}->${hex(t.to, 2)}${lbl}`);
  }

  console.log(`\nScenario B: totalSteps=${resultB.totalSteps}, errNo=${hex(resultB.errNo, 2)}, OP1 decoded=${resultB.op1Decoded}`);
  console.log(`  StoAns entry (OP1[0]->0xFF): step ${stoAnsStepB ?? 'NOT FOUND'}`);
  console.log(`  OP1[0] transitions: ${resultB.op1b0Trace.length}`);
  for (const t of resultB.op1b0Trace) {
    const lbl = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    console.log(`    step ${t.step}: PC=${hex(t.pc)} OP1[0] ${hex(t.from, 2)}->${hex(t.to, 2)}${lbl}`);
  }
  console.log(`  errNo transitions: ${resultB.errNoTrace.length}`);
  for (const t of resultB.errNoTrace) {
    const lbl = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    console.log(`    step ${t.step}: PC=${hex(t.pc)} errNo ${hex(t.from, 2)}->${hex(t.to, 2)}${lbl}`);
  }

  if (resultB.ansDE !== null) {
    console.log(`\n  Ans DE data pointer: ${hex(resultB.ansDE)}`);
    console.log(`  Ans data after ParseInp: [${resultB.ansDataAfter ?? 'n/a'}]`);
  }

  // ---------- StoAns sub-trace comparison ----------
  console.log('\n=== StoAns Sub-Trace Comparison ===\n');

  const CONTEXT_BEFORE = 20;
  const startA = stoAnsStepA !== null ? Math.max(0, stoAnsStepA - CONTEXT_BEFORE) : Math.max(0, resultA.totalSteps - 70);
  const startB = stoAnsStepB !== null ? Math.max(0, stoAnsStepB - CONTEXT_BEFORE) : Math.max(0, resultB.totalSteps - 70);

  const subA = resultA.allPCs.slice(startA);
  const subB = resultB.allPCs.slice(startB);

  const maxLen = Math.max(subA.length, subB.length);

  // Build side-by-side lines
  const sideLines = [];
  sideLines.push(`${'Step_A'.padEnd(8)} ${'PC_A'.padEnd(12)} ${'Label_A'.padEnd(25)} | ${'Step_B'.padEnd(8)} ${'PC_B'.padEnd(12)} ${'Label_B'.padEnd(25)} | Match`);
  sideLines.push('-'.repeat(110));

  let matchCount = 0;
  let divergeStep = null;

  for (let i = 0; i < maxLen; i++) {
    const stepIdxA = startA + i;
    const stepIdxB = startB + i;
    const pcA = i < subA.length ? subA[i] : null;
    const pcB = i < subB.length ? subB[i] : null;

    const pcAStr = pcA !== null ? hex(pcA) : '------';
    const pcBStr = pcB !== null ? hex(pcB) : '------';
    const lblA = (pcA !== null && KNOWN_ROUTINES[pcA]) ? KNOWN_ROUTINES[pcA] : '';
    const lblB = (pcB !== null && KNOWN_ROUTINES[pcB]) ? KNOWN_ROUTINES[pcB] : '';

    // Check for OP1[0] transitions at this step
    const op1ChangeA = resultA.op1b0Trace.find(t => t.step === stepIdxA);
    const op1ChangeB = resultB.op1b0Trace.find(t => t.step === stepIdxB);
    let extraA = op1ChangeA ? ` [OP1[0]:${hex(op1ChangeA.from,2)}->${hex(op1ChangeA.to,2)}]` : '';
    let extraB = op1ChangeB ? ` [OP1[0]:${hex(op1ChangeB.from,2)}->${hex(op1ChangeB.to,2)}]` : '';

    const match = pcA === pcB ? 'Y' : 'N';
    if (pcA === pcB) matchCount++;
    if (pcA !== pcB && divergeStep === null) divergeStep = i;

    const colA = `${String(stepIdxA).padEnd(8)} ${pcAStr.padEnd(12)} ${(lblA + extraA).padEnd(25)}`;
    const colB = `${String(stepIdxB).padEnd(8)} ${pcBStr.padEnd(12)} ${(lblB + extraB).padEnd(25)}`;
    sideLines.push(`${colA} | ${colB} | ${match}`);
  }

  for (const line of sideLines) console.log(line);

  console.log(`\nSub-trace length: A=${subA.length} B=${subB.length}`);
  console.log(`Matching PCs (positional): ${matchCount}/${maxLen}`);
  console.log(`First divergence at offset: ${divergeStep ?? 'none (all match)'}`);

  // ---------- Unique PC comparison ----------
  console.log('\n=== Unique PCs: A-only vs B-only ===');
  const setA = new Set(resultA.uniquePCs);
  const setB = new Set(resultB.uniquePCs);
  const onlyA = resultA.uniquePCs.filter(pc => !setB.has(pc));
  const onlyB = resultB.uniquePCs.filter(pc => !setA.has(pc));
  console.log(`Total unique: A=${resultA.uniquePCs.length} B=${resultB.uniquePCs.length}`);
  console.log(`A-only (${onlyA.length}): ${onlyA.map(pc => hex(pc)).join(' ') || '(none)'}`);
  console.log(`B-only (${onlyB.length}): ${onlyB.map(pc => hex(pc)).join(' ') || '(none)'}`);

  // ---------- Write report ----------
  const reportLines = [];
  reportLines.push('# Phase 25AC: StoAns Sub-Trace Comparison Report');
  reportLines.push('');
  reportLines.push(`Generated: ${new Date().toISOString()}`);
  reportLines.push('');
  reportLines.push('## Summary');
  reportLines.push('');
  reportLines.push('| Metric | Scenario A (no Ans) | Scenario B (Ans exists) |');
  reportLines.push('|--------|-------------------|----------------------|');
  reportLines.push(`| Total steps | ${resultA.totalSteps} | ${resultB.totalSteps} |`);
  reportLines.push(`| Termination | ${resultA.termination} | ${resultB.termination} |`);
  reportLines.push(`| errNo | ${hex(resultA.errNo, 2)} | ${hex(resultB.errNo, 2)} |`);
  reportLines.push(`| OP1 bytes | [${resultA.op1Bytes}] | [${resultB.op1Bytes}] |`);
  reportLines.push(`| OP1 decoded | ${resultA.op1Decoded} | ${resultB.op1Decoded} |`);
  reportLines.push(`| OP1[0] transitions | ${resultA.op1b0Trace.length} | ${resultB.op1b0Trace.length} |`);
  reportLines.push(`| errNo transitions | ${resultA.errNoTrace.length} | ${resultB.errNoTrace.length} |`);
  reportLines.push(`| Unique PCs | ${resultA.uniquePCs.length} | ${resultB.uniquePCs.length} |`);
  reportLines.push(`| StoAns entry step | ${stoAnsStepA ?? 'N/A'} | ${stoAnsStepB ?? 'N/A'} |`);
  reportLines.push(`| Step delta | - | ${resultA.totalSteps - resultB.totalSteps} fewer |`);
  reportLines.push('');

  reportLines.push('## OP1[0] Transitions');
  reportLines.push('');
  reportLines.push('### Scenario A');
  reportLines.push('');
  for (const t of resultA.op1b0Trace) {
    const lbl = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    reportLines.push(`- step ${t.step}: PC=${hex(t.pc)} OP1[0] ${hex(t.from, 2)}->${hex(t.to, 2)}${lbl}`);
  }
  reportLines.push('');
  reportLines.push('### Scenario B');
  reportLines.push('');
  for (const t of resultB.op1b0Trace) {
    const lbl = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    reportLines.push(`- step ${t.step}: PC=${hex(t.pc)} OP1[0] ${hex(t.from, 2)}->${hex(t.to, 2)}${lbl}`);
  }
  reportLines.push('');

  reportLines.push('## errNo Transitions');
  reportLines.push('');
  reportLines.push('### Scenario A');
  reportLines.push('');
  for (const t of resultA.errNoTrace) {
    const lbl = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    reportLines.push(`- step ${t.step}: PC=${hex(t.pc)} errNo ${hex(t.from, 2)}->${hex(t.to, 2)}${lbl}`);
  }
  reportLines.push('');
  reportLines.push('### Scenario B');
  reportLines.push('');
  for (const t of resultB.errNoTrace) {
    const lbl = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    reportLines.push(`- step ${t.step}: PC=${hex(t.pc)} errNo ${hex(t.from, 2)}->${hex(t.to, 2)}${lbl}`);
  }
  reportLines.push('');

  if (resultB.ansDE !== null) {
    reportLines.push('## Ans Variable Data (Scenario B)');
    reportLines.push('');
    reportLines.push(`- DE pointer from CreateReal: ${hex(resultB.ansDE)}`);
    reportLines.push(`- Data after ParseInp: [${resultB.ansDataAfter ?? 'n/a'}]`);
    reportLines.push('');
  }

  reportLines.push('## StoAns Sub-Trace (side by side)');
  reportLines.push('');
  reportLines.push(`Sub-trace starts: A at step ${startA}, B at step ${startB}`);
  reportLines.push(`Sub-trace lengths: A=${subA.length}, B=${subB.length}`);
  reportLines.push(`Positional matches: ${matchCount}/${maxLen}`);
  reportLines.push(`First divergence at offset: ${divergeStep ?? 'none'}`);
  reportLines.push('');
  reportLines.push('```');
  for (const line of sideLines) reportLines.push(line);
  reportLines.push('```');
  reportLines.push('');

  reportLines.push('## Unique PCs Comparison');
  reportLines.push('');
  reportLines.push(`- Total unique: A=${resultA.uniquePCs.length}, B=${resultB.uniquePCs.length}`);
  reportLines.push(`- A-only (${onlyA.length}): ${onlyA.map(pc => hex(pc)).join(', ') || '(none)'}`);
  reportLines.push(`- B-only (${onlyB.length}): ${onlyB.map(pc => hex(pc)).join(', ') || '(none)'}`);
  reportLines.push('');

  reportLines.push('## All Unique PCs (sorted)');
  reportLines.push('');
  reportLines.push('### Scenario A');
  reportLines.push('');
  reportLines.push(`\`${resultA.uniquePCs.map(pc => hex(pc)).join(' ')}\``);
  reportLines.push('');
  reportLines.push('### Scenario B');
  reportLines.push('');
  reportLines.push(`\`${resultB.uniquePCs.map(pc => hex(pc)).join(' ')}\``);
  reportLines.push('');

  reportLines.push('## Pointer Snapshots');
  reportLines.push('');
  reportLines.push('### Before ParseInp');
  reportLines.push(`- A: ${formatPointerSnapshot(resultA.prePointers)}`);
  reportLines.push(`- B: ${formatPointerSnapshot(resultB.prePointers)}`);
  reportLines.push('');
  reportLines.push('### After ParseInp');
  reportLines.push(`- A: ${formatPointerSnapshot(resultA.postPointers)}`);
  reportLines.push(`- B: ${formatPointerSnapshot(resultB.postPointers)}`);
  reportLines.push('');

  const reportPath = path.join(__dirname, 'phase25ac-stoans-trace-report.md');
  fs.writeFileSync(reportPath, reportLines.join('\n') + '\n');
  console.log(`\nReport written to ${reportPath}`);

  process.exitCode = 0;
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
