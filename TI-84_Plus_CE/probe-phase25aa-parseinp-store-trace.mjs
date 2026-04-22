#!/usr/bin/env node

/**
 * Phase 25AA: Full 918-step trace of ParseInp (no pre-created variable).
 *
 * Captures every PC visited, plus errNo and OP1[0] at each step.
 * Flags transitions and cross-references against known ROM routines.
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

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const PARSEINP_ENTRY = 0x099914;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_CNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;
const FLASH_SIZE_ADDR = 0xd025c5;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TOKEN_BUFFER_ADDR = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]); // "2+3" + newline

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;

// Known routines for cross-reference
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
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
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

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTempCnt: read24(mem, PTEMP_CNT_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    flashSize: read24(mem, FLASH_SIZE_ADDR),
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

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return bootResult;
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

async function main() {
  const log = (line) => console.log(line);
  const output = []; // collect lines for report

  function logBoth(line) {
    console.log(line);
    output.push(line);
  }

  logBoth('=== Phase 25AA: ParseInp Full Store Trace (918-step, errNo/OP1 tracking) ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // ---------- Cold boot ----------
  const bootResult = coldBoot(executor, cpu, mem);
  logBoth(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  // ---------- PHASE A: Call MEM_INIT ----------
  logBoth('\n=== PHASE A: MEM_INIT (0x09DEE0) ===');

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let meminitSteps = 0;
  let meminitFinalPc = null;
  let meminitReturnHit = false;

  try {
    const result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        meminitFinalPc = pc & 0xffffff;
        meminitSteps = Math.max(meminitSteps, (step ?? 0) + 1);
        if (meminitFinalPc === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc, mode, step) {
        meminitFinalPc = pc & 0xffffff;
        meminitSteps = Math.max(meminitSteps, (step ?? 0) + 1);
        if (meminitFinalPc === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
    meminitSteps = Math.max(meminitSteps, result.steps ?? 0);
    logBoth(`MEM_INIT done: steps=${result.steps} term=${result.termination}`);
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      meminitReturnHit = true;
      logBoth(`MEM_INIT returned to sentinel @ ${hex(MEMINIT_RET)} after ~${meminitSteps} steps`);
    } else {
      throw error;
    }
  }

  const postMeminitPointers = snapshotPointers(mem);
  logBoth(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMeminitPointers)}`);

  if (!meminitReturnHit) {
    logBoth('\nMEM_INIT did not return! Aborting.');
    process.exit(1);
  }

  // ---------- PHASE B: ParseInp with full trace ----------
  logBoth('\n=== PHASE B: ParseInp Full Trace (0x099914) ===');

  // Place tokenized "2+3" at scratch area
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);

  // Point tokens through begPC/curPC/endPC (DO NOT touch OPS)
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length - 1);

  logBoth(`begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);
  logBoth(`input bytes @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);

  // OP1 starts as all zeros (no pre-created variable)
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  // Prepare call state
  prepareCallState(cpu, mem);

  // Set up error handler frame
  write24(mem, cpu.sp, FAKE_RET);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  logBoth(`SP=${hex(cpu.sp)}, errSP=${hex(read24(mem, ERR_SP_ADDR))}`);

  // ---------- TRACE STORAGE ----------
  const allPCs = [];          // every PC visited
  const errNoTrace = [];      // {step, pc, errNo} when errNo CHANGES
  const op1b0Trace = [];      // {step, pc, val} when OP1[0] CHANGES
  let prevErrNo = mem[ERR_NO_ADDR] & 0xff;
  let prevOp1b0 = mem[OP1_ADDR] & 0xff;

  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

    // Store PC
    allPCs.push(norm);

    // Check errNo
    const curErrNo = mem[ERR_NO_ADDR] & 0xff;
    if (curErrNo !== prevErrNo) {
      errNoTrace.push({ step: allPCs.length - 1, pc: norm, from: prevErrNo, to: curErrNo });
      prevErrNo = curErrNo;
    }

    // Check OP1[0]
    const curOp1b0 = mem[OP1_ADDR] & 0xff;
    if (curOp1b0 !== prevOp1b0) {
      op1b0Trace.push({ step: allPCs.length - 1, pc: norm, from: prevOp1b0, to: curOp1b0 });
      prevOp1b0 = curOp1b0;
    }

    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, mode, step) {
        notePc(pc, step);
      },
    });
    finalPc = result.lastPc ?? finalPc;
    termination = result.termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
    logBoth(`ParseInp done: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc ?? 0)}`);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      termination = 'return_hit';
      finalPc = FAKE_RET;
      logBoth(`ParseInp returned to FAKE_RET @ ${hex(FAKE_RET)}`);
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
      logBoth(`ParseInp hit ERR_CATCH_ADDR @ ${hex(ERR_CATCH_ADDR)}`);
    } else {
      throw error;
    }
  }

  // ---------- Results ----------
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const afterPointers = snapshotPointers(mem);
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);

  logBoth(`\nTotal PCs recorded: ${allPCs.length}`);
  logBoth(`Final errNo: ${hex(errNo, 2)}`);
  logBoth(`OP1 post-call @ ${hex(OP1_ADDR)}: [${op1Bytes}]`);

  let got = NaN;
  try {
    got = readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    got = `readReal error: ${error?.message ?? error}`;
  }
  logBoth(`OP1 decoded via readReal: ${got}`);
  logBoth(`post-ParseInp pointers: ${formatPointerSnapshot(afterPointers)}`);

  // ---------- errNo transitions ----------
  logBoth(`\n=== errNo Transitions (${errNoTrace.length} changes) ===`);
  for (const t of errNoTrace) {
    const label = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    logBoth(`  step ${t.step}: PC=${hex(t.pc)} errNo ${hex(t.from, 2)} -> ${hex(t.to, 2)}${label}`);
  }

  // ---------- OP1[0] transitions ----------
  logBoth(`\n=== OP1[0] Transitions (${op1b0Trace.length} changes) ===`);
  for (const t of op1b0Trace) {
    const label = KNOWN_ROUTINES[t.pc] ? ` [${KNOWN_ROUTINES[t.pc]}]` : '';
    logBoth(`  step ${t.step}: PC=${hex(t.pc)} OP1[0] ${hex(t.from, 2)} -> ${hex(t.to, 2)}${label}`);
  }

  // ---------- Find errNo=0x8D transition ----------
  const errTo8D = errNoTrace.find(t => t.to === 0x8d);
  if (errTo8D) {
    logBoth(`\n=== errNo -> 0x8D at step ${errTo8D.step}, PC=${hex(errTo8D.pc)} ===`);

    // 50 PCs before
    const start50 = Math.max(0, errTo8D.step - 50);
    const before50 = allPCs.slice(start50, errTo8D.step);
    logBoth(`\n--- 50 PCs BEFORE errNo=0x8D (steps ${start50}..${errTo8D.step - 1}) ---`);
    for (let i = 0; i < before50.length; i++) {
      const stepIdx = start50 + i;
      const pc = before50[i];
      const label = KNOWN_ROUTINES[pc] ? ` <<< ${KNOWN_ROUTINES[pc]}` : '';
      logBoth(`  step ${stepIdx}: ${hex(pc)}${label}`);
    }

    // 20 PCs after
    const after20 = allPCs.slice(errTo8D.step, errTo8D.step + 20);
    logBoth(`\n--- 20 PCs AFTER errNo=0x8D (steps ${errTo8D.step}..${errTo8D.step + after20.length - 1}) ---`);
    for (let i = 0; i < after20.length; i++) {
      const stepIdx = errTo8D.step + i;
      const pc = after20[i];
      const label = KNOWN_ROUTINES[pc] ? ` <<< ${KNOWN_ROUTINES[pc]}` : '';
      logBoth(`  step ${stepIdx}: ${hex(pc)}${label}`);
    }
  } else {
    logBoth('\nerrNo never reached 0x8D during the run.');
  }

  // ---------- Known routine hits ----------
  logBoth('\n=== Known Routine Hits ===');
  const routineHits = {};
  for (let i = 0; i < allPCs.length; i++) {
    const pc = allPCs[i];
    if (KNOWN_ROUTINES[pc]) {
      const name = KNOWN_ROUTINES[pc];
      if (!routineHits[name]) routineHits[name] = [];
      routineHits[name].push(i);
    }
  }
  for (const [name, steps] of Object.entries(routineHits)) {
    logBoth(`  ${name}: hit at steps [${steps.join(', ')}]`);
  }
  if (Object.keys(routineHits).length === 0) {
    logBoth('  (none of the known routines were hit at their exact entry points)');
  }

  // ---------- Unique PCs ----------
  const uniquePCs = [...new Set(allPCs)].sort((a, b) => a - b);
  logBoth(`\nUnique PCs visited: ${uniquePCs.length}`);

  // Group by 0x1000 region for overview
  const regionMap = {};
  for (const pc of allPCs) {
    const region = pc & 0xfff000;
    regionMap[region] = (regionMap[region] || 0) + 1;
  }
  logBoth('\n=== PC Region Distribution ===');
  for (const [region, count] of Object.entries(regionMap).sort((a, b) => Number(b[1]) - Number(a[1]))) {
    logBoth(`  ${hex(Number(region))}: ${count} hits`);
  }

  // ---------- Full PC trace (all steps) ----------
  logBoth('\n=== Full PC Trace (all steps) ===');
  for (let i = 0; i < allPCs.length; i++) {
    const pc = allPCs[i];
    const label = KNOWN_ROUTINES[pc] ? ` <<< ${KNOWN_ROUTINES[pc]}` : '';
    // Check for errNo/OP1 change AT this step
    const errChange = errNoTrace.find(t => t.step === i);
    const op1Change = op1b0Trace.find(t => t.step === i);
    let extra = '';
    if (errChange) extra += ` [errNo: ${hex(errChange.from, 2)}->${hex(errChange.to, 2)}]`;
    if (op1Change) extra += ` [OP1[0]: ${hex(op1Change.from, 2)}->${hex(op1Change.to, 2)}]`;
    logBoth(`  ${String(i).padStart(4)}: ${hex(pc)}${label}${extra}`);
  }

  // ---------- Write report ----------
  const reportPath = path.join(__dirname, 'phase25aa-store-trace-report.md');
  const reportContent = [
    '# Phase 25AA: ParseInp Store Trace Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Total steps: ${allPCs.length}`,
    `- Termination: ${termination}`,
    `- Final errNo: ${hex(errNo, 2)}`,
    `- OP1 bytes: [${op1Bytes}]`,
    `- OP1 decoded: ${got}`,
    `- errNo transitions: ${errNoTrace.length}`,
    `- OP1[0] transitions: ${op1b0Trace.length}`,
    `- Unique PCs: ${uniquePCs.length}`,
    '',
    '## Probe Output',
    '',
    '```',
    ...output,
    '```',
    '',
  ].join('\n');

  fs.writeFileSync(reportPath, reportContent);
  logBoth(`\nReport written to ${reportPath}`);

  // Verdict
  if (errNo === 0x8d) {
    logBoth(`\nCONFIRMED: ParseInp exited with ErrUndefined (0x8D)`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
