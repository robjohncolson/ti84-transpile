#!/usr/bin/env node

/**
 * Phase 25AA: ParseInp Two Code Paths
 *
 * Runs ParseInp TWICE with separate memory/executor instances:
 *   Run A: MEM_INIT -> CreateReal("A") -> ParseInp("2+3") with OP1 = variable A
 *   Run B: MEM_INIT -> ParseInp("2+3") with OP1 = all zeros (no variable created)
 *
 * Captures every visited PC in both runs and identifies the DIVERGENCE POINT
 * where the two code paths split.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25aa-two-paths-report.md');

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
const CREATEREAL_ENTRY = 0x08238a;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TOKEN_BUFFER_ADDR = 0xd00800;
const TOKEN_BUFFER_CLEAR_LEN = 0x80;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const SENTINEL_RET = 0xffffff;

const CHKFINDSYM_CALL_SITE = 0x099b18;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const VARIABLE_A = Uint8Array.from([0x00, 0x41, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;
const PC_TRACE_LIMIT = 2000;
const OP1_MILESTONE_INTERVAL = 50;

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

function seedMinimalErrFrame(cpu, mem, returnAddr) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, returnAddr);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
}

function setOp1VariableA(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + VARIABLE_A.length);
  mem.set(VARIABLE_A, OP1_ADDR);
}

function clearOp1(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
}

function setupTokens(mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + TOKEN_BUFFER_CLEAR_LEN);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length - 1);
}

/**
 * Run a call with full PC trace capture.
 * Returns { termination, stepCount, pcTrace, op1Milestones, chkFindSymPCs, registers, errNo, ... }
 */
function runCallWithTrace(executor, cpu, mem, options) {
  const { entry, budget, returnPc, allowSentinelRet = false, label = 'call' } = options;

  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let sentinelRet = false;
  let stepCount = 0;

  const pcTrace = [];
  const op1Milestones = [];
  let nextOp1Milestone = OP1_MILESTONE_INTERVAL;
  let chkFindSymIdx = -1;
  const chkFindSymFollowPCs = [];
  const memWrap = wrapMem(mem);

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;

    if (typeof step === 'number') {
      stepCount = Math.max(stepCount, step + 1);
    }

    if (pcTrace.length < PC_TRACE_LIMIT) {
      pcTrace.push(norm);
    }

    // Track OP1 at milestone intervals
    if (stepCount >= nextOp1Milestone) {
      const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
      const op1Val = safeReadReal(memWrap, OP1_ADDR);
      op1Milestones.push({ step: stepCount, op1Bytes, op1Val });
      nextOp1Milestone += OP1_MILESTONE_INTERVAL;
    }

    // Track ChkFindSym call site and what follows
    if (norm === CHKFINDSYM_CALL_SITE && chkFindSymIdx === -1) {
      chkFindSymIdx = pcTrace.length - 1;
    }
    if (chkFindSymIdx !== -1 && pcTrace.length > chkFindSymIdx + 1 && chkFindSymFollowPCs.length < 5) {
      chkFindSymFollowPCs.push(norm);
    }

    if (norm === returnPc) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
    if (allowSentinelRet && norm === SENTINEL_RET) throw new Error('__SENTINEL_RET__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        notePc(pc, step);
      },
    });

    finalPc = result.lastPc ?? finalPc;
    termination = result.termination ?? termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      finalPc = returnPc;
      termination = 'return_hit';
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      finalPc = ERR_CATCH_ADDR;
      termination = 'err_caught';
    } else if (error?.message === '__SENTINEL_RET__') {
      sentinelRet = true;
      finalPc = SENTINEL_RET;
      termination = 'sentinel_ret';
    } else {
      throw error;
    }
  }

  return {
    label,
    entry,
    returnPc,
    returnHit,
    errCaught,
    sentinelRet,
    termination,
    finalPc,
    stepCount,
    pcTrace,
    op1Milestones,
    chkFindSymIdx,
    chkFindSymFollowPCs,
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    hl: cpu.hl & 0xffffff,
    de: cpu.de & 0xffffff,
    bc: cpu.bc & 0xffffff,
    sp: cpu.sp & 0xffffff,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
    op1Bytes: hexBytes(mem, OP1_ADDR, 9),
    op1Val: safeReadReal(wrapMem(mem), OP1_ADDR),
  };
}

function formatRunOutcome(run) {
  if (run.returnHit) return `returned to ${hex(run.returnPc)}`;
  if (run.sentinelRet) return `reached sentinel ${hex(SENTINEL_RET)}`;
  if (run.errCaught) return `unwound to ${hex(ERR_CATCH_ADDR)}`;
  return `termination=${run.termination} finalPc=${hex(run.finalPc)}`;
}

/**
 * Create a fresh memory/executor instance and run one full pipeline.
 * withVariable=true: MEM_INIT + CreateReal + ParseInp (OP1=variable A)
 * withVariable=false: MEM_INIT + ParseInp (OP1=all zeros)
 */
function runPipeline(log, withVariable) {
  const runLabel = withVariable ? 'Run A (with variable)' : 'Run B (no variable)';
  log(`\n=== ${runLabel} ===`);

  // Fresh memory + executor
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  coldBoot(executor, cpu, mem);
  log(`${runLabel}: boot complete`);

  // MEM_INIT
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  const memInitRun = runCallWithTrace(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    budget: MEMINIT_BUDGET,
    returnPc: MEMINIT_RET,
    label: 'MEM_INIT',
  });
  log(`${runLabel}: MEM_INIT ${formatRunOutcome(memInitRun)} steps=${memInitRun.stepCount} errNo=${hex(memInitRun.errNo, 2)}`);

  if (!memInitRun.returnHit) {
    log(`${runLabel}: MEM_INIT did not return, aborting`);
    return null;
  }

  // CreateReal (only for Run A)
  if (withVariable) {
    setOp1VariableA(mem);
    prepareCallState(cpu, mem);
    cpu.a = 0x00;
    cpu._hl = 0x000009;
    seedMinimalErrFrame(cpu, mem, CREATEREAL_RET);

    const createRealRun = runCallWithTrace(executor, cpu, mem, {
      entry: CREATEREAL_ENTRY,
      budget: CREATEREAL_BUDGET,
      returnPc: CREATEREAL_RET,
      allowSentinelRet: true,
      label: 'CreateReal',
    });
    log(`${runLabel}: CreateReal ${formatRunOutcome(createRealRun)} steps=${createRealRun.stepCount} errNo=${hex(createRealRun.errNo, 2)}`);

    if (createRealRun.errNo !== 0x00) {
      log(`${runLabel}: CreateReal failed with errNo=${hex(createRealRun.errNo, 2)}, aborting`);
      return null;
    }
  }

  // ParseInp
  setupTokens(mem);
  if (withVariable) {
    setOp1VariableA(mem);
  } else {
    clearOp1(mem);
  }

  const op1PreHex = hexBytes(mem, OP1_ADDR, 9);
  log(`${runLabel}: ParseInp OP1 pre-call: [${op1PreHex}]`);

  prepareCallState(cpu, mem);
  seedMinimalErrFrame(cpu, mem, FAKE_RET);

  const parseRun = runCallWithTrace(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    budget: PARSEINP_BUDGET,
    returnPc: FAKE_RET,
    label: 'ParseInp',
  });

  log(`${runLabel}: ParseInp ${formatRunOutcome(parseRun)}`);
  log(`${runLabel}: ParseInp steps=${parseRun.stepCount} errNo=${hex(parseRun.errNo, 2)}`);
  log(`${runLabel}: ParseInp OP1 post: [${parseRun.op1Bytes}] decoded=${parseRun.op1Val}`);
  log(`${runLabel}: ParseInp begPC=${hex(parseRun.begPC)} curPC=${hex(parseRun.curPC)} endPC=${hex(parseRun.endPC)}`);
  log(`${runLabel}: ParseInp registers: A=${hex(parseRun.a, 2)} F=${hex(parseRun.f, 2)} HL=${hex(parseRun.hl)} DE=${hex(parseRun.de)} BC=${hex(parseRun.bc)} SP=${hex(parseRun.sp)}`);

  if (parseRun.chkFindSymIdx !== -1) {
    log(`${runLabel}: ChkFindSym call at PC trace index ${parseRun.chkFindSymIdx}`);
    log(`${runLabel}: PCs after ChkFindSym: [${parseRun.chkFindSymFollowPCs.map(pc => hex(pc)).join(', ')}]`);
  } else {
    log(`${runLabel}: ChkFindSym call site (${hex(CHKFINDSYM_CALL_SITE)}) NOT visited in first ${PC_TRACE_LIMIT} PCs`);
  }

  if (parseRun.op1Milestones.length > 0) {
    log(`${runLabel}: OP1 milestones:`);
    for (const m of parseRun.op1Milestones) {
      log(`  step ${m.step}: [${m.op1Bytes}] = ${m.op1Val}`);
    }
  }

  return parseRun;
}

function findDivergencePoint(traceA, traceB) {
  const minLen = Math.min(traceA.length, traceB.length);
  for (let i = 0; i < minLen; i++) {
    if (traceA[i] !== traceB[i]) {
      return {
        index: i,
        pcA: traceA[i],
        pcB: traceB[i],
        contextA: traceA.slice(Math.max(0, i - 5), i + 6),
        contextB: traceB.slice(Math.max(0, i - 5), i + 6),
      };
    }
  }
  if (traceA.length !== traceB.length) {
    return {
      index: minLen,
      pcA: minLen < traceA.length ? traceA[minLen] : null,
      pcB: minLen < traceB.length ? traceB[minLen] : null,
      contextA: traceA.slice(Math.max(0, minLen - 5), minLen + 1),
      contextB: traceB.slice(Math.max(0, minLen - 5), minLen + 1),
      note: 'One trace is shorter than the other',
    };
  }
  return null; // identical
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AA: ParseInp Two Code Paths ===');
  log(`ChkFindSym call site watched: ${hex(CHKFINDSYM_CALL_SITE)}`);
  log(`PC trace limit per run: ${PC_TRACE_LIMIT}`);

  // Run A: with variable
  const runA = runPipeline(log, true);

  // Run B: without variable (fresh instance)
  const runB = runPipeline(log, false);

  // Analysis
  log('\n=== DIVERGENCE ANALYSIS ===');

  if (!runA || !runB) {
    log('Cannot compare: one or both runs failed to complete');
    writeReport(log, transcript, runA, runB, null);
    process.exitCode = 0;
    return;
  }

  log(`Run A PC trace length: ${runA.pcTrace.length}`);
  log(`Run B PC trace length: ${runB.pcTrace.length}`);

  const divergence = findDivergencePoint(runA.pcTrace, runB.pcTrace);

  if (!divergence) {
    log('RESULT: Both PC traces are IDENTICAL (no divergence in captured range)');
    log(`Both traces: ${runA.pcTrace.length} PCs`);
  } else {
    log(`DIVERGENCE at PC trace index ${divergence.index}:`);
    log(`  Run A PC: ${divergence.pcA !== null ? hex(divergence.pcA) : '(trace ended)'}`);
    log(`  Run B PC: ${divergence.pcB !== null ? hex(divergence.pcB) : '(trace ended)'}`);
    if (divergence.note) log(`  Note: ${divergence.note}`);
    log(`  Run A context (idx ${Math.max(0, divergence.index - 5)}..${divergence.index + 5}):`);
    log(`    [${divergence.contextA.map(pc => hex(pc)).join(', ')}]`);
    log(`  Run B context (idx ${Math.max(0, divergence.index - 5)}..${divergence.index + 5}):`);
    log(`    [${divergence.contextB.map(pc => hex(pc)).join(', ')}]`);

    // Check if divergence is near ChkFindSym
    if (runA.chkFindSymIdx !== -1 && Math.abs(divergence.index - runA.chkFindSymIdx) <= 20) {
      log(`  NEAR ChkFindSym call site (Run A index ${runA.chkFindSymIdx})`);
    }
  }

  // Summary comparison
  log('\n=== SUMMARY COMPARISON ===');
  log(`                      Run A (with var)      Run B (no var)`);
  log(`  Steps:              ${String(runA.stepCount).padEnd(22)}${runB.stepCount}`);
  log(`  Termination:        ${runA.termination.padEnd(22)}${runB.termination}`);
  log(`  errNo:              ${hex(runA.errNo, 2).padEnd(22)}${hex(runB.errNo, 2)}`);
  log(`  OP1 final:          [${runA.op1Bytes}]    [${runB.op1Bytes}]`);
  log(`  OP1 decoded:        ${String(runA.op1Val).padEnd(22)}${runB.op1Val}`);
  log(`  begPC:              ${hex(runA.begPC).padEnd(22)}${hex(runB.begPC)}`);
  log(`  curPC:              ${hex(runA.curPC).padEnd(22)}${hex(runB.curPC)}`);
  log(`  endPC:              ${hex(runA.endPC).padEnd(22)}${hex(runB.endPC)}`);
  log(`  ChkFindSym idx:    ${String(runA.chkFindSymIdx).padEnd(22)}${runB.chkFindSymIdx}`);
  log(`  Carry (F bit 0):   ${(runA.f & 1).toString().padEnd(22)}${runB.f & 1}`);

  writeReport(log, transcript, runA, runB, divergence);

  log(`\nReport written to ${REPORT_PATH}`);
  process.exitCode = 0;
}

function writeReport(_log, transcript, runA, runB, divergence) {
  const lines = [];
  lines.push('# Phase 25AA - ParseInp Two Code Paths: Divergence Analysis');
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString().slice(0, 10));
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Run ParseInp twice with separate memory instances -- once with a pre-created');
  lines.push('variable "A" in OP1, once without (OP1 all zeros) -- and identify the exact');
  lines.push('PC where the two code paths diverge.');
  lines.push('');

  lines.push('## Setup');
  lines.push('');
  lines.push('- Two SEPARATE memory/executor instances (fresh cold boot each)');
  lines.push('- Timer IRQ disabled: `createPeripheralBus({ timerInterrupt: false })`');
  lines.push(`- ParseInp entry: \`${hex(PARSEINP_ENTRY)}\``);
  lines.push(`- ChkFindSym call site: \`${hex(CHKFINDSYM_CALL_SITE)}\``);
  lines.push(`- Input tokens: \`${hexArray(INPUT_TOKENS)}\` ("2+3")`);
  lines.push(`- PC trace limit per run: ${PC_TRACE_LIMIT}`);
  lines.push('');

  // Run A summary
  lines.push('## Run A: With Pre-Created Variable "A"');
  lines.push('');
  if (runA) {
    lines.push(`- Pipeline: MEM_INIT -> CreateReal("A") -> ParseInp`);
    lines.push(`- OP1 seeded to: \`${hexArray(VARIABLE_A)}\``);
    lines.push(`- Termination: ${runA.termination}`);
    lines.push(`- Steps: ${runA.stepCount}`);
    lines.push(`- errNo: \`${hex(runA.errNo, 2)}\``);
    lines.push(`- OP1 final: \`[${runA.op1Bytes}]\` decoded=${runA.op1Val}`);
    lines.push(`- begPC: \`${hex(runA.begPC)}\` curPC: \`${hex(runA.curPC)}\` endPC: \`${hex(runA.endPC)}\``);
    lines.push(`- Registers: A=\`${hex(runA.a, 2)}\` F=\`${hex(runA.f, 2)}\` HL=\`${hex(runA.hl)}\` DE=\`${hex(runA.de)}\` BC=\`${hex(runA.bc)}\``);
    lines.push(`- Carry flag (F bit 0): ${runA.f & 1}`);
    lines.push(`- ChkFindSym visited at trace index: ${runA.chkFindSymIdx}`);
    if (runA.chkFindSymFollowPCs.length > 0) {
      lines.push(`- PCs after ChkFindSym: \`[${runA.chkFindSymFollowPCs.map(pc => hex(pc)).join(', ')}]\``);
    }
    lines.push(`- PC trace length: ${runA.pcTrace.length}`);
    if (runA.op1Milestones.length > 0) {
      lines.push('- OP1 milestones:');
      for (const m of runA.op1Milestones) {
        lines.push(`  - step ${m.step}: \`[${m.op1Bytes}]\` = ${m.op1Val}`);
      }
    }
  } else {
    lines.push('- Run A did not complete (MEM_INIT or CreateReal failed)');
  }
  lines.push('');

  // Run B summary
  lines.push('## Run B: No Variable (OP1 All Zeros)');
  lines.push('');
  if (runB) {
    lines.push(`- Pipeline: MEM_INIT -> ParseInp (no CreateReal)`);
    lines.push(`- OP1 seeded to: all zeros`);
    lines.push(`- Termination: ${runB.termination}`);
    lines.push(`- Steps: ${runB.stepCount}`);
    lines.push(`- errNo: \`${hex(runB.errNo, 2)}\``);
    lines.push(`- OP1 final: \`[${runB.op1Bytes}]\` decoded=${runB.op1Val}`);
    lines.push(`- begPC: \`${hex(runB.begPC)}\` curPC: \`${hex(runB.curPC)}\` endPC: \`${hex(runB.endPC)}\``);
    lines.push(`- Registers: A=\`${hex(runB.a, 2)}\` F=\`${hex(runB.f, 2)}\` HL=\`${hex(runB.hl)}\` DE=\`${hex(runB.de)}\` BC=\`${hex(runB.bc)}\``);
    lines.push(`- Carry flag (F bit 0): ${runB.f & 1}`);
    lines.push(`- ChkFindSym visited at trace index: ${runB.chkFindSymIdx}`);
    if (runB.chkFindSymFollowPCs.length > 0) {
      lines.push(`- PCs after ChkFindSym: \`[${runB.chkFindSymFollowPCs.map(pc => hex(pc)).join(', ')}]\``);
    }
    lines.push(`- PC trace length: ${runB.pcTrace.length}`);
    if (runB.op1Milestones.length > 0) {
      lines.push('- OP1 milestones:');
      for (const m of runB.op1Milestones) {
        lines.push(`  - step ${m.step}: \`[${m.op1Bytes}]\` = ${m.op1Val}`);
      }
    }
  } else {
    lines.push('- Run B did not complete (MEM_INIT failed)');
  }
  lines.push('');

  // Divergence
  lines.push('## Divergence Analysis');
  lines.push('');
  if (!runA || !runB) {
    lines.push('Cannot compare: one or both runs failed to complete.');
  } else if (!divergence) {
    lines.push('**No divergence found** in the captured PC traces.');
    lines.push(`Both traces are identical for ${runA.pcTrace.length} PCs.`);
    lines.push('');
    lines.push('Despite identical code paths, the two runs may differ in data (registers, memory)');
    lines.push('but follow the same control flow within the captured range.');
  } else {
    lines.push(`**Divergence at PC trace index ${divergence.index}**`);
    lines.push('');
    lines.push(`- Run A takes: \`${divergence.pcA !== null ? hex(divergence.pcA) : '(trace ended)'}\``);
    lines.push(`- Run B takes: \`${divergence.pcB !== null ? hex(divergence.pcB) : '(trace ended)'}\``);
    if (divergence.note) lines.push(`- Note: ${divergence.note}`);
    lines.push('');
    lines.push('### Context around divergence');
    lines.push('');
    lines.push('Run A PCs near divergence:');
    lines.push('```');
    for (let i = 0; i < divergence.contextA.length; i++) {
      const globalIdx = Math.max(0, divergence.index - 5) + i;
      const marker = globalIdx === divergence.index ? ' <-- DIVERGE' : '';
      lines.push(`  [${globalIdx}] ${hex(divergence.contextA[i])}${marker}`);
    }
    lines.push('```');
    lines.push('');
    lines.push('Run B PCs near divergence:');
    lines.push('```');
    for (let i = 0; i < divergence.contextB.length; i++) {
      const globalIdx = Math.max(0, divergence.index - 5) + i;
      const marker = globalIdx === divergence.index ? ' <-- DIVERGE' : '';
      lines.push(`  [${globalIdx}] ${hex(divergence.contextB[i])}${marker}`);
    }
    lines.push('```');

    if (runA.chkFindSymIdx !== -1 || runB.chkFindSymIdx !== -1) {
      lines.push('');
      lines.push('### Relationship to ChkFindSym');
      lines.push('');
      const idxA = runA.chkFindSymIdx;
      const idxB = runB.chkFindSymIdx;
      lines.push(`- ChkFindSym trace index in Run A: ${idxA}`);
      lines.push(`- ChkFindSym trace index in Run B: ${idxB}`);
      if (idxA !== -1 && divergence.index > idxA) {
        lines.push(`- Divergence is ${divergence.index - idxA} PCs AFTER ChkFindSym in Run A`);
      } else if (idxA !== -1) {
        lines.push(`- Divergence is ${idxA - divergence.index} PCs BEFORE ChkFindSym in Run A`);
      }
    }
  }
  lines.push('');

  // Key findings
  lines.push('## Key Findings');
  lines.push('');
  if (runA && runB) {
    const aFixed = runA.errNo === 0x00;
    const bError = runB.errNo !== 0x00;
    if (aFixed && bError) {
      lines.push(`- **Confirmed**: Pre-creating variable clears the error (Run A errNo=0x00 vs Run B errNo=${hex(runB.errNo, 2)})`);
    } else if (!aFixed && bError) {
      lines.push(`- Both runs end with errors: Run A errNo=${hex(runA.errNo, 2)}, Run B errNo=${hex(runB.errNo, 2)}`);
    } else if (aFixed && !bError) {
      lines.push(`- Both runs succeed (errNo=0x00)`);
    } else {
      lines.push(`- Run A errNo=${hex(runA.errNo, 2)}, Run B errNo=${hex(runB.errNo, 2)}`);
    }
    lines.push(`- Run A steps: ${runA.stepCount}, Run B steps: ${runB.stepCount} (delta: ${Math.abs(runA.stepCount - runB.stepCount)})`);
    if (divergence) {
      lines.push(`- The code paths diverge at trace index ${divergence.index} (Run A -> ${divergence.pcA !== null ? hex(divergence.pcA) : 'end'}, Run B -> ${divergence.pcB !== null ? hex(divergence.pcB) : 'end'})`);
    }
  }
  lines.push('');

  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  process.exitCode = 1;
}
