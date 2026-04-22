#!/usr/bin/env node

/**
 * Phase 25AB: ParseInp with empty OP1 after CreateReal(Ans)
 *
 * Test run:
 *   cold boot -> MEM_INIT -> CreateReal(Ans) -> clear OP1 -> ParseInp("2+3")
 *
 * Control run:
 *   cold boot -> MEM_INIT -> clear OP1 -> ParseInp("2+3")
 *
 * The probe writes a markdown report comparing both runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ab-ans-variable-report.md');
const REPORT_TITLE = 'Phase 25AB - ParseInp with Pre-Created Ans Variable';

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
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

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

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const VARIABLE_ANS = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const EXPECTED = 5.0;
const EXPECTED_CONTROL_ERRNO = 0x8d;
const EXPECTED_CONTROL_STEPS = 918;
const TOLERANCE = 1e-6;

const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;
const MILESTONE_INTERVAL = 100000;
const RECENT_PC_LIMIT = 64;

const ALLOCATOR_FIELDS = [
  ['opBase', 'OPBase'],
  ['ops', 'OPS'],
  ['fps', 'FPS'],
  ['pTemp', 'pTemp'],
  ['progPtr', 'progPtr'],
  ['newDataPtr', 'newDataPtr'],
];

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

function formatPointerSnapshot(snapshot) {
  return [
    `tempMem=${hex(snapshot.tempMem)}`,
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `newDataPtr=${hex(snapshot.newDataPtr)}`,
    `errSP=${hex(snapshot.errSP)}`,
    `errNo=${hex(snapshot.errNo, 2)}`,
    `begPC=${hex(snapshot.begPC)}`,
    `curPC=${hex(snapshot.curPC)}`,
    `endPC=${hex(snapshot.endPC)}`,
  ].join(' ');
}

function signed24Delta(before, after) {
  let diff = ((after - before) & 0xffffff) >>> 0;
  if (diff & 0x800000) diff -= 0x1000000;
  return diff;
}

function formatTransition(before, after) {
  const delta = signed24Delta(before, after);
  const sign = delta >= 0 ? '+' : '';
  return `${hex(before)} -> ${hex(after)} (delta ${sign}${delta})`;
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
}

function safeReadReal(memWrap, addr) {
  try {
    return readReal(memWrap, addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function isExpectedValue(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value - EXPECTED) <= TOLERANCE;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return {
    mem,
    executor,
    cpu: executor.cpu,
    memWrap: wrapMem(mem),
  };
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

  return {
    returnAddr,
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBase,
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
  };
}

function setOp1VariableAns(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(VARIABLE_ANS, OP1_ADDR);
}

function clearOp1(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
}

function setupTokens(mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + TOKEN_BUFFER_CLEAR_LEN);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length - 1);
}

function runCall(executor, cpu, mem, options) {
  const {
    entry,
    budget,
    returnPc,
    allowSentinelRet = false,
    label = 'call',
    milestoneInterval = 0,
    onMilestone,
  } = options;

  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let sentinelRet = false;
  let missingBlock = false;
  let stepCount = 0;
  const recentPcs = [];
  const milestones = [];
  let nextMilestone = milestoneInterval > 0 ? milestoneInterval : Number.POSITIVE_INFINITY;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;

    if (typeof step === 'number') {
      stepCount = Math.max(stepCount, step + 1);
      if (step >= nextMilestone) {
        const snap = snapshotPointers(mem);
        const text = `${step} steps: PC=${hex(norm)} errNo=${hex(snap.errNo, 2)} FPS=${hex(snap.fps)} OPS=${hex(snap.ops)}`;
        milestones.push(text);
        if (onMilestone) onMilestone(`  [${label} milestone] ${text}`);
        nextMilestone += milestoneInterval;
      }
    }

    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();

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
        missingBlock = true;
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
    entry,
    returnPc,
    returnHit,
    errCaught,
    sentinelRet,
    missingBlock,
    termination,
    finalPc,
    stepCount,
    recentPcs,
    milestones,
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    hl: cpu.hl & 0xffffff,
    de: cpu.de & 0xffffff,
    sp: cpu.sp & 0xffffff,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errSp: read24(mem, ERR_SP_ADDR),
  };
}

function formatRunOutcome(run) {
  if (!run) return '(skipped)';
  if (run.returnHit) return `returned to ${hex(run.returnPc)}`;
  if (run.errCaught) return `unwound to ${hex(ERR_CATCH_ADDR)}`;
  if (run.sentinelRet) return `reached sentinel ${hex(SENTINEL_RET)}`;
  return `termination=${run.termination} finalPc=${hex(run.finalPc)}`;
}

function disposition(run) {
  if (!run) return 'SKIPPED';
  if (run.returnHit) return 'FAKE_RET';
  if (run.errCaught) return 'ERR_CATCH';
  if (run.sentinelRet) return 'SENTINEL_RET';
  return run.termination;
}

function pushAllocatorMovement(lines, before, after) {
  for (const [key, label] of ALLOCATOR_FIELDS) {
    lines.push(`- ${label}: ${formatTransition(before[key], after[key])}`);
  }
}

function scenarioTableRow(scenario) {
  if (!scenario.parse) {
    return `| ${scenario.name} | ${scenario.withCreateReal ? 'yes' : 'no'} | (skipped) | (skipped) | (skipped) | (skipped) | (skipped) | ${scenario.parseSkippedReason ?? 'skipped'} |`;
  }

  return [
    `| ${scenario.name}`,
    scenario.withCreateReal ? 'yes' : 'no',
    `\`${scenario.parse.op1PreHex}\``,
    `\`${hex(scenario.parse.run.errNo, 2)}\``,
    `\`${scenario.parse.op1PostHex}\``,
    `\`${formatValue(scenario.parse.op1Decoded)}\``,
    `${scenario.parse.run.stepCount}`,
    disposition(scenario.parse.run),
    '|',
  ].join(' | ');
}

function classifyVerdict(test, control) {
  if (!test.parse || !control.parse) {
    return {
      hypothesis: '(pending)',
      summary: 'No verdict: one or both ParseInp runs did not complete.',
      controlBaselineMatches: false,
      testIsFive: false,
      controlIsFive: false,
      stepDelta: null,
    };
  }

  const testIsFive = isExpectedValue(test.parse.op1Decoded);
  const controlIsFive = isExpectedValue(control.parse.op1Decoded);
  const controlBaselineMatches =
    control.parse.run.errNo === EXPECTED_CONTROL_ERRNO &&
    control.parse.run.stepCount === EXPECTED_CONTROL_STEPS &&
    controlIsFive;

  let hypothesis = '(c)';
  let summary = `Something else happened: errNo=${hex(test.parse.run.errNo, 2)}, OP1=${formatValue(test.parse.op1Decoded)}, disposition=${disposition(test.parse.run)}.`;

  if (testIsFive && test.parse.run.errNo === 0x00) {
    hypothesis = '(a)';
    summary = 'Pre-creating Ans cleared errNo while ParseInp still computed 5.0 from empty OP1.';
  } else if (testIsFive && test.parse.run.errNo === 0x8d) {
    hypothesis = '(b)';
    summary = 'ParseInp still computed 5.0 but kept ErrUndefined even though Ans had already been created.';
  }

  if (!controlBaselineMatches) {
    summary += ` Control did not match the expected 918-step/5.0/0x8D baseline (errNo=${hex(control.parse.run.errNo, 2)}, OP1=${formatValue(control.parse.op1Decoded)}, steps=${control.parse.run.stepCount}).`;
  }

  return {
    hypothesis,
    summary,
    controlBaselineMatches,
    testIsFive,
    controlIsFive,
    stepDelta: test.parse.run.stepCount - control.parse.run.stepCount,
  };
}

function renderScenario(lines, scenario) {
  lines.push(`## ${scenario.name}`);
  lines.push('');
  lines.push(`- Boot: steps=${scenario.bootResult.steps} term=${scenario.bootResult.termination} lastPc=${hex(scenario.bootResult.lastPc ?? 0)}.`);
  lines.push(`- Post-boot pointers: ${formatPointerSnapshot(scenario.postBootPointers)}`);
  lines.push(`- MEM_INIT frame @ \`${hex(scenario.memInitFrame.mainReturnSp)}\`: \`${scenario.memInitFrame.mainReturnBytes}\``);
  lines.push(`- MEM_INIT: ${formatRunOutcome(scenario.memInitRun)}, steps=${scenario.memInitRun.stepCount}, errNo=${hex(scenario.memInitRun.errNo, 2)}.`);
  lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(scenario.postMemInitPointers)}`);

  if (scenario.createReal) {
    lines.push(`- CreateReal OP1 pre-call: \`${scenario.createReal.op1PreHex}\``);
    lines.push(`- CreateReal main return @ \`${hex(scenario.createReal.frame.mainReturnSp)}\`: \`${scenario.createReal.frame.mainReturnBytes}\``);
    lines.push(`- CreateReal error frame @ \`${hex(scenario.createReal.frame.errFrameBase)}\`: \`${scenario.createReal.frame.errFrameBytes}\``);
    lines.push(`- CreateReal: ${formatRunOutcome(scenario.createReal.run)}, steps=${scenario.createReal.run.stepCount}, errNo=${hex(scenario.createReal.run.errNo, 2)}.`);
    lines.push(`- OP1 immediately after CreateReal: \`${scenario.createReal.op1PostHex}\``);
    lines.push(`- OP1 decoded after CreateReal: ${formatValue(scenario.createReal.op1Decoded)}.`);
    lines.push('- CreateReal allocator movement:');
    pushAllocatorMovement(lines, scenario.createReal.beforePointers, scenario.createReal.afterPointers);
    lines.push(`- CreateReal last 64 PCs: \`${scenario.createReal.run.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}\``);
  }

  if (scenario.op1AfterClearHex !== null) {
    lines.push(`- OP1 after explicit clear: \`${scenario.op1AfterClearHex}\``);
  }

  if (!scenario.parse) {
    lines.push(`- ParseInp skipped: ${scenario.parseSkippedReason}`);
    lines.push('');
    return;
  }

  lines.push(`- ParseInp tokens @ \`${hex(TOKEN_BUFFER_ADDR)}\`: \`${hexArray(INPUT_TOKENS)}\``);
  lines.push(`- ParseInp OP1 pre-call: \`${scenario.parse.op1PreHex}\``);
  lines.push(`- ParseInp main return @ \`${hex(scenario.parse.frame.mainReturnSp)}\`: \`${scenario.parse.frame.mainReturnBytes}\``);
  lines.push(`- ParseInp error frame @ \`${hex(scenario.parse.frame.errFrameBase)}\`: \`${scenario.parse.frame.errFrameBytes}\``);
  lines.push(`- ParseInp pre-call pointers: ${formatPointerSnapshot(scenario.parse.beforePointers)}`);
  lines.push(`- ParseInp: ${formatRunOutcome(scenario.parse.run)}, steps=${scenario.parse.run.stepCount}, errNo=${hex(scenario.parse.run.errNo, 2)}.`);
  lines.push(`- ParseInp disposition: ${disposition(scenario.parse.run)}.`);
  lines.push(`- OP1 after ParseInp: \`${scenario.parse.op1PostHex}\``);
  lines.push(`- OP1 decoded after ParseInp: ${formatValue(scenario.parse.op1Decoded)}.`);
  lines.push(`- Post-ParseInp pointers: ${formatPointerSnapshot(scenario.parse.afterPointers)}`);
  lines.push(`- begPC/curPC/endPC after ParseInp: \`${hex(scenario.parse.afterPointers.begPC)} / ${hex(scenario.parse.afterPointers.curPC)} / ${hex(scenario.parse.afterPointers.endPC)}\``);
  lines.push('- ParseInp allocator movement:');
  pushAllocatorMovement(lines, scenario.parse.beforePointers, scenario.parse.afterPointers);
  lines.push(`- Last 64 PCs: \`${scenario.parse.run.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}\``);
  if (scenario.parse.run.milestones.length > 0) {
    lines.push(`- ParseInp milestones: \`${scenario.parse.run.milestones.join(' | ')}\``);
  } else {
    lines.push('- ParseInp milestones: none.');
  }
  lines.push('');
}

function writeReport(details) {
  const { test, control, verdict, transcript } = details;
  const lines = [];

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString().slice(0, 10));
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Determine whether `ParseInp("2+3")` still leaves `errNo=0x8D` when OP1 is cleared to all zeros after `CreateReal(Ans)` seeded OP1 with `[00 72 00 00 00 00 00 00 00]`, or whether the pre-created Ans VAT entry clears the residual error.');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`- Hypothesis: ${verdict.hypothesis}`);
  lines.push(`- Summary: ${verdict.summary}`);
  lines.push(`- Control matched expected 918-step / 5.0 / 0x8D baseline: ${verdict.controlBaselineMatches}`);
  if (verdict.stepDelta !== null) {
    lines.push(`- Step delta (test - control): ${verdict.stepDelta}`);
  }
  lines.push(`- Test decoded 5.0: ${verdict.testIsFive}`);
  lines.push(`- Control decoded 5.0: ${verdict.controlIsFive}`);
  lines.push('');
  lines.push('## Comparison');
  lines.push('');
  lines.push('| Scenario | CreateReal(Ans) | OP1 pre-ParseInp | errNo | OP1 post-ParseInp | OP1 decoded | Steps | Disposition |');
  lines.push('|---|---|---|---|---|---|---:|---|');
  lines.push(scenarioTableRow(test));
  lines.push(scenarioTableRow(control));
  lines.push('');

  renderScenario(lines, test);
  renderScenario(lines, control);

  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText, transcript) {
  const lines = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '## Console Output',
    '',
    '```text',
    ...transcript,
    '```',
    '',
    '## Error',
    '',
    '```text',
    ...String(errorText).split(/\r?\n/),
    '```',
  ];

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function runScenario({ name, withCreateReal, log }) {
  const { mem, executor, cpu, memWrap } = createRuntime();

  log(`\n=== ${name} ===`);
  const bootResult = coldBoot(executor, cpu, mem);
  const postBootPointers = snapshotPointers(mem);
  log(`${name} boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);
  log(`${name} post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  const memInitFrame = {
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
  };

  const memInitRun = runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    budget: MEMINIT_BUDGET,
    returnPc: MEMINIT_RET,
    label: `${name} MEM_INIT`,
  });
  const postMemInitPointers = snapshotPointers(mem);
  log(`${name} MEM_INIT: ${formatRunOutcome(memInitRun)} steps=${memInitRun.stepCount} errNo=${hex(memInitRun.errNo, 2)}`);
  log(`${name} post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);

  let createReal = null;
  let parse = null;
  let parseSkippedReason = null;
  let op1AfterClearHex = null;

  if (!memInitRun.returnHit) {
    parseSkippedReason = `MEM_INIT did not return to ${hex(MEMINIT_RET)}`;
    log(`${name} ParseInp skipped: ${parseSkippedReason}`);
  } else {
    if (withCreateReal) {
      setOp1VariableAns(mem);
      const createRealBeforePointers = snapshotPointers(mem);
      const createRealOp1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);

      prepareCallState(cpu, mem);
      cpu.a = 0x00;
      cpu._hl = 0x000009;
      const createRealFrame = seedMinimalErrFrame(cpu, mem, CREATEREAL_RET);

      log(`${name} CreateReal OP1 pre-call: [${createRealOp1PreHex}]`);
      log(`${name} CreateReal pre-call pointers: ${formatPointerSnapshot(createRealBeforePointers)}`);

      const createRealRun = runCall(executor, cpu, mem, {
        entry: CREATEREAL_ENTRY,
        budget: CREATEREAL_BUDGET,
        returnPc: CREATEREAL_RET,
        allowSentinelRet: true,
        label: `${name} CreateReal`,
      });
      const createRealAfterPointers = snapshotPointers(mem);
      const createRealOp1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
      const createRealOp1Decoded = safeReadReal(memWrap, OP1_ADDR);

      createReal = {
        beforePointers: createRealBeforePointers,
        afterPointers: createRealAfterPointers,
        frame: createRealFrame,
        run: createRealRun,
        op1PreHex: createRealOp1PreHex,
        op1PostHex: createRealOp1PostHex,
        op1Decoded: createRealOp1Decoded,
      };

      log(`${name} CreateReal: ${formatRunOutcome(createRealRun)} steps=${createRealRun.stepCount} errNo=${hex(createRealRun.errNo, 2)}`);
      log(`${name} CreateReal post-call OP1: [${createRealOp1PostHex}] decoded=${formatValue(createRealOp1Decoded)}`);

      const createRealSucceeded =
        createRealRun.errNo === 0x00 &&
        (createRealRun.returnHit || createRealRun.sentinelRet);

      if (!createRealSucceeded) {
        parseSkippedReason = `CreateReal did not complete cleanly (${formatRunOutcome(createRealRun)} errNo=${hex(createRealRun.errNo, 2)})`;
        log(`${name} ParseInp skipped: ${parseSkippedReason}`);
      }
    }

    if (!parseSkippedReason) {
      clearOp1(mem);
      op1AfterClearHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
      setupTokens(mem);
      const parseBeforePointers = snapshotPointers(mem);
      const parseOp1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);

      prepareCallState(cpu, mem);
      const parseFrame = seedMinimalErrFrame(cpu, mem, FAKE_RET);

      log(`${name} OP1 after clear: [${op1AfterClearHex}]`);
      log(`${name} ParseInp tokens @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
      log(`${name} ParseInp pre-call pointers: ${formatPointerSnapshot(parseBeforePointers)}`);

      const parseRun = runCall(executor, cpu, mem, {
        entry: PARSEINP_ENTRY,
        budget: PARSEINP_BUDGET,
        returnPc: FAKE_RET,
        label: `${name} ParseInp`,
        milestoneInterval: MILESTONE_INTERVAL,
        onMilestone: log,
      });
      const parseAfterPointers = snapshotPointers(mem);
      const parseOp1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
      const parseOp1Decoded = safeReadReal(memWrap, OP1_ADDR);

      parse = {
        beforePointers: parseBeforePointers,
        afterPointers: parseAfterPointers,
        frame: parseFrame,
        run: parseRun,
        op1PreHex: parseOp1PreHex,
        op1PostHex: parseOp1PostHex,
        op1Decoded: parseOp1Decoded,
      };

      log(`${name} ParseInp: ${formatRunOutcome(parseRun)} steps=${parseRun.stepCount} errNo=${hex(parseRun.errNo, 2)} decoded=${formatValue(parseOp1Decoded)}`);
      log(`${name} ParseInp post-call OP1: [${parseOp1PostHex}]`);
      log(`${name} ParseInp disposition: ${disposition(parseRun)}`);
    }
  }

  return {
    name,
    withCreateReal,
    bootResult,
    postBootPointers,
    memInitFrame,
    memInitRun,
    postMemInitPointers,
    createReal,
    op1AfterClearHex,
    parse,
    parseSkippedReason,
  };
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AB: empty OP1 with and without pre-created Ans variable ===');

  const test = runScenario({
    name: 'Test',
    withCreateReal: true,
    log,
  });

  const control = runScenario({
    name: 'Control',
    withCreateReal: false,
    log,
  });

  const verdict = classifyVerdict(test, control);
  writeReport({ test, control, verdict, transcript });

  log('\n=== Verdict ===');
  log(`Hypothesis: ${verdict.hypothesis}`);
  log(verdict.summary);
  log(`report=${REPORT_PATH}`);

  process.exitCode = test.parse && control.parse ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  writeFailureReport(message, String(message).split(/\r?\n/));
  process.exitCode = 1;
}
