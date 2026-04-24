#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ay-ptcnt-invariant-report.md');
const REPORT_TITLE = 'Phase 25AY - pTempCnt Audit + Descending-Boundary Invariant';

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
const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_CNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const TOKEN_BUFFER_ADDR = 0xd00800;
const ERR_SP_ADDR = 0xd008e0;
const ERR_NO_ADDR = 0xd008df;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const SENTINEL_RET = 0xffffff;

const USER_MEM = 0xd1a881;
const TOP_OF_USER_MEMORY = 0xd3ffff;

const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 2000000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 64;

const VARIABLE_ANS = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const INPUT_2_PLUS_3 = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const INPUT_3_TIMES_4 = Uint8Array.from([0x33, 0x82, 0x34, 0x3f]);
const INPUT_9_MINUS_1 = Uint8Array.from([0x39, 0x71, 0x31, 0x3f]);

const MULTI_EXPR_CASES = [
  { expression: '2+3', tokens: INPUT_2_PLUS_3 },
  { expression: '3*4', tokens: INPUT_3_TIMES_4 },
  { expression: '9-1', tokens: INPUT_9_MINUS_1 },
];

const INVARIANT_ORDER = [
  ['tempMem', 'tempMem'],
  ['fpsBase', 'FPSbase'],
  ['fps', 'FPS'],
  ['ops', 'OPS'],
  ['opBase', 'OPBase'],
  ['pTemp', 'pTemp'],
  ['progPtr', 'progPtr'],
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function read24(mem, addr) {
  return (
    (mem[addr] & 0xff) |
    ((mem[addr + 1] & 0xff) << 8) |
    ((mem[addr + 2] & 0xff) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return out.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (value) => (value & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    ops: read24(mem, OPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    pTempCnt: read24(mem, PTEMP_CNT_ADDR),
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
    `OPS=${hex(snapshot.ops)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `pTempCnt=${hex(snapshot.pTempCnt)}`,
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

function captureCounterBytes(mem) {
  return {
    raw3: hexBytes(mem, PTEMP_CNT_ADDR, 3),
    raw4: hexBytes(mem, PTEMP_CNT_ADDR, 4),
  };
}

function checkInvariant(snapshot) {
  const violations = [];
  for (let i = 0; i < INVARIANT_ORDER.length - 1; i++) {
    const [leftKey, leftLabel] = INVARIANT_ORDER[i];
    const [rightKey, rightLabel] = INVARIANT_ORDER[i + 1];
    if (snapshot[leftKey] > snapshot[rightKey]) {
      violations.push(`${leftLabel}=${hex(snapshot[leftKey])} > ${rightLabel}=${hex(snapshot[rightKey])}`);
    }
  }
  return {
    pass: violations.length === 0,
    violations,
  };
}

function checkCanonicalMemInitShape(snapshot) {
  const expected = [
    ['tempMem', 'tempMem', USER_MEM],
    ['fpsBase', 'FPSbase', USER_MEM],
    ['fps', 'FPS', USER_MEM],
    ['newDataPtr', 'newDataPtr', USER_MEM],
    ['ops', 'OPS', TOP_OF_USER_MEMORY],
    ['opBase', 'OPBase', TOP_OF_USER_MEMORY],
    ['pTemp', 'pTemp', TOP_OF_USER_MEMORY],
    ['progPtr', 'progPtr', TOP_OF_USER_MEMORY],
  ];
  const mismatches = expected
    .filter(([key, _label, value]) => snapshot[key] !== value)
    .map(([key, label, value]) => `${label}=${hex(snapshot[key])} expected ${hex(value)}`);
  return {
    pass: mismatches.length === 0,
    mismatches,
  };
}

function formatCheckResult(check) {
  return check.pass ? 'PASS' : `FAIL (${check.violations.join('; ')})`;
}

function formatShapeResult(check) {
  return check.pass ? 'PASS' : `FAIL (${check.mismatches.join('; ')})`;
}

function recentPcText(pcs, count = 20) {
  if (!pcs || pcs.length === 0) return '(none)';
  return pcs.slice(-count).map((pc) => hex(pc)).join(' ');
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
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

  return boot;
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

function seedReturnOnly(cpu, mem, returnPc) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, returnPc);
  mem[ERR_NO_ADDR] = 0x00;
  return {
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
  };
}

function seedErrorFrame(cpu, mem, returnPc, errReturnPc = ERR_CATCH_ADDR, previousErrSp = 0) {
  const frame = seedReturnOnly(cpu, mem, returnPc);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, errFrameBase, errReturnPc);
  write24(mem, errFrameBase + 3, previousErrSp);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
  return {
    ...frame,
    errFrameBase,
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
  };
}

function runCall(executor, cpu, mem, { entry, budget, returnPc, allowSentinelRet = false, label = 'call' }) {
  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let sentinelRet = false;
  let missingBlock = false;
  let stepCount = 0;
  const recentPcs = [];

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
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
    label,
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
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errSP: read24(mem, ERR_SP_ADDR),
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    hl: cpu.hl & 0xffffff,
    de: cpu.de & 0xffffff,
    sp: cpu.sp & 0xffffff,
  };
}

function didStageComplete(run) {
  return Boolean(run?.returnHit || run?.sentinelRet);
}

function formatRunOutcome(run) {
  if (!run) return '(skipped)';
  if (run.returnHit) return `returned to ${hex(run.returnPc)}`;
  if (run.sentinelRet) return `reached sentinel ${hex(SENTINEL_RET)}`;
  if (run.errCaught) return `unwound to ${hex(ERR_CATCH_ADDR)}`;
  return `termination=${run.termination} finalPc=${hex(run.finalPc)}`;
}

function setOp1(mem, bytes) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(bytes, OP1_ADDR);
}

function clearOp1(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
}

function setupTokens(mem, tokens) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(tokens, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + tokens.length);
}

function runMemInitStage(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  const frame = seedReturnOnly(cpu, mem, MEMINIT_RET);
  const run = runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    budget: MEMINIT_BUDGET,
    returnPc: MEMINIT_RET,
    label: 'MEM_INIT',
  });
  const snapshot = snapshotPointers(mem);
  return {
    frame,
    run,
    snapshot,
    counterBytes: captureCounterBytes(mem),
    invariant: checkInvariant(snapshot),
    canonicalShape: checkCanonicalMemInitShape(snapshot),
  };
}

function runCreateRealAnsStage(executor, cpu, mem) {
  setOp1(mem, VARIABLE_ANS);
  const before = snapshotPointers(mem);
  const op1Pre = hexBytes(mem, OP1_ADDR, OP1_LEN);
  prepareCallState(cpu, mem);
  const frame = seedErrorFrame(cpu, mem, CREATEREAL_RET);
  const run = runCall(executor, cpu, mem, {
    entry: CREATEREAL_ENTRY,
    budget: CREATEREAL_BUDGET,
    returnPc: CREATEREAL_RET,
    allowSentinelRet: true,
    label: 'CreateReal(Ans)',
  });
  const snapshot = snapshotPointers(mem);
  return {
    before,
    frame,
    run,
    snapshot,
    counterBytes: captureCounterBytes(mem),
    invariant: checkInvariant(snapshot),
    op1Pre,
    op1Post: hexBytes(mem, OP1_ADDR, OP1_LEN),
  };
}

function runParseInpStage(executor, cpu, mem, tokens, label) {
  setupTokens(mem, tokens);
  clearOp1(mem);
  const before = snapshotPointers(mem);
  const op1Pre = hexBytes(mem, OP1_ADDR, OP1_LEN);
  prepareCallState(cpu, mem);
  const frame = seedErrorFrame(cpu, mem, FAKE_RET);
  const run = runCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    budget: PARSEINP_BUDGET,
    returnPc: FAKE_RET,
    allowSentinelRet: true,
    label,
  });
  const snapshot = snapshotPointers(mem);
  return {
    before,
    frame,
    run,
    snapshot,
    counterBytes: captureCounterBytes(mem),
    invariant: checkInvariant(snapshot),
    tokensHex: hexArray(tokens),
    op1Pre,
    op1Post: hexBytes(mem, OP1_ADDR, OP1_LEN),
  };
}

function runMemInitAudit() {
  const { mem, executor, cpu } = createRuntime();
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInitStage(executor, cpu, mem);
  return { boot, memInit };
}

function runStoAnsPipeline() {
  const { mem, executor, cpu } = createRuntime();
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInitStage(executor, cpu, mem);

  let createRealAns = null;
  let parseInp = null;

  if (didStageComplete(memInit.run)) {
    createRealAns = runCreateRealAnsStage(executor, cpu, mem);
    if (didStageComplete(createRealAns.run)) {
      parseInp = runParseInpStage(executor, cpu, mem, INPUT_2_PLUS_3, 'ParseInp("2+3")');
    }
  }

  return { boot, memInit, createRealAns, parseInp };
}

function runFreshParseCase(testCase) {
  const { mem, executor, cpu } = createRuntime();
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInitStage(executor, cpu, mem);
  let parseInp = null;
  if (didStageComplete(memInit.run)) {
    parseInp = runParseInpStage(executor, cpu, mem, testCase.tokens, `ParseInp("${testCase.expression}")`);
  }
  return {
    expression: testCase.expression,
    tokensHex: hexArray(testCase.tokens),
    boot,
    memInit,
    parseInp,
  };
}

function stageRow(name, stage) {
  if (!stage) {
    return `| ${name} | skipped | n/a | n/a | n/a | n/a |`;
  }
  const violations = stage.invariant.pass ? 'none' : stage.invariant.violations.join('; ');
  return [
    `| ${name}`,
    formatRunOutcome(stage.run),
    hex(stage.run.errNo, 2),
    hex(stage.snapshot.pTempCnt),
    stage.invariant.pass ? 'PASS' : 'FAIL',
    violations,
    '|',
  ].join(' | ');
}

function parseCaseRow(result) {
  if (!result.parseInp) {
    return `| ${result.expression} | \`${result.tokensHex}\` | skipped | n/a | n/a | n/a |`;
  }
  const violations = result.parseInp.invariant.pass ? 'none' : result.parseInp.invariant.violations.join('; ');
  return [
    `| ${result.expression}`,
    `\`${result.tokensHex}\``,
    formatRunOutcome(result.parseInp.run),
    hex(result.parseInp.run.errNo, 2),
    hex(result.parseInp.snapshot.pTempCnt),
    result.parseInp.invariant.pass ? 'PASS' : `FAIL (${violations})`,
    '|',
  ].join(' | ');
}

function appendStageDetails(lines, title, stage, { includeCanonical = false, includeTokens = null, note = null } = {}) {
  lines.push(`### ${title}`);
  lines.push('');
  if (!stage) {
    lines.push('- Stage skipped.');
    lines.push('');
    return;
  }
  if (includeTokens) lines.push(`- Tokens: \`${includeTokens}\``);
  if (stage.op1Pre !== undefined) lines.push(`- OP1 pre-call: [${stage.op1Pre}]`);
  if (stage.frame?.mainReturnSp !== undefined) lines.push(`- Return frame @ ${hex(stage.frame.mainReturnSp)}: [${stage.frame.mainReturnBytes}]`);
  if (stage.frame?.errFrameBase !== undefined) lines.push(`- Error frame @ ${hex(stage.frame.errFrameBase)}: [${stage.frame.errFrameBytes}]`);
  if (stage.before) lines.push(`- Pre-call pointers: ${formatPointerSnapshot(stage.before)}`);
  lines.push(`- Outcome: ${formatRunOutcome(stage.run)} steps=${stage.run.stepCount} errNo=${hex(stage.run.errNo, 2)}`);
  lines.push(`- Post-call pointers: ${formatPointerSnapshot(stage.snapshot)}`);
  lines.push(`- pTempCnt read24=${hex(stage.snapshot.pTempCnt)} raw3=[${stage.counterBytes.raw3}] raw4=[${stage.counterBytes.raw4}]`);
  lines.push(`- Invariant tempMem <= FPSbase <= FPS <= OPS <= OPBase <= pTemp <= progPtr: ${formatCheckResult(stage.invariant)}`);
  if (includeCanonical) {
    lines.push(`- Canonical MEM_INIT seed shape: ${formatShapeResult(stage.canonicalShape)}`);
  }
  if (stage.op1Post !== undefined) lines.push(`- OP1 post-call: [${stage.op1Post}]`);
  if (note) lines.push(`- Note: ${note}`);
  if (!didStageComplete(stage.run) || !stage.invariant.pass) {
    lines.push(`- Recent PCs: ${recentPcText(stage.run.recentPcs)}`);
  }
  lines.push('');
}

function writeReport(memInitAudit, stoAns, multiExprResults, transcript) {
  const part1Zero = memInitAudit.memInit.snapshot.pTempCnt === 0;
  const multiInvariantPasses = multiExprResults.filter((result) => result.parseInp?.invariant.pass).length;
  const lines = [
    `# ${REPORT_TITLE}`,
    '',
    '## Date',
    '',
    new Date().toISOString(),
    '',
    '## Summary',
    '',
    `- Part 1: post-MEM_INIT pTempCnt read24=${hex(memInitAudit.memInit.snapshot.pTempCnt)} from [${memInitAudit.memInit.counterBytes.raw3}] -> ${part1Zero ? 'PASS (zeroed)' : 'FAIL (non-zero)'}.`,
    `- Part 2: post-MEM_INIT invariant ${memInitAudit.memInit.invariant.pass ? 'PASS' : 'FAIL'}; canonical MEM_INIT seed shape ${memInitAudit.memInit.canonicalShape.pass ? 'PASS' : 'FAIL'}.`,
    `- Part 3: StoAns pipeline stages -> MEM_INIT ${memInitAudit.memInit.invariant.pass ? 'invariant pass' : 'invariant fail'}, CreateReal("Ans") ${stoAns.createRealAns ? (stoAns.createRealAns.invariant.pass ? 'invariant pass' : 'invariant fail') : 'skipped'}, ParseInp("2+3") ${stoAns.parseInp ? (stoAns.parseInp.invariant.pass ? 'invariant pass' : 'invariant fail') : 'skipped'}.`,
    `- Part 4: fresh-runtime ParseInp cases with post-ParseInp invariant pass ${multiInvariantPasses}/${multiExprResults.length}.`,
    '- pTempCnt is always interpreted with a 24-bit read from `0xD02596..0xD02598`; the extra fourth byte is shown only as context.',
    '',
    '## Part 1: pTempCnt Audit',
    '',
    `- Boot: steps=${memInitAudit.boot.steps} term=${memInitAudit.boot.termination} lastPc=${hex(memInitAudit.boot.lastPc ?? 0)}.`,
    `- MEM_INIT: ${formatRunOutcome(memInitAudit.memInit.run)} steps=${memInitAudit.memInit.run.stepCount} errNo=${hex(memInitAudit.memInit.run.errNo, 2)}.`,
    `- Post-MEM_INIT pointers: ${formatPointerSnapshot(memInitAudit.memInit.snapshot)}`,
    `- pTempCnt @ ${hex(PTEMP_CNT_ADDR)} read24=${hex(memInitAudit.memInit.snapshot.pTempCnt)} raw3=[${memInitAudit.memInit.counterBytes.raw3}] raw4=[${memInitAudit.memInit.counterBytes.raw4}]`,
    `- Zero check: ${part1Zero ? 'PASS' : 'FAIL'}`,
    '',
    '## Part 2: Post-MEM_INIT Invariant',
    '',
    `- Invariant tempMem <= FPSbase <= FPS <= OPS <= OPBase <= pTemp <= progPtr: ${formatCheckResult(memInitAudit.memInit.invariant)}`,
    `- Canonical expected cluster: tempMem=FPSbase=FPS=newDataPtr=${hex(USER_MEM)} and OPS=OPBase=pTemp=progPtr=${hex(TOP_OF_USER_MEMORY)}.`,
    `- Canonical MEM_INIT seed shape: ${formatShapeResult(memInitAudit.memInit.canonicalShape)}`,
    '',
    '## Part 3: StoAns Pipeline',
    '',
    '| Stage | Outcome | errNo | pTempCnt | Invariant | Violations |',
    '|:---|:---|:---|:---|:---|:---|',
    stageRow('MEM_INIT', stoAns.memInit),
    stageRow('CreateReal("Ans")', stoAns.createRealAns),
    stageRow('ParseInp("2+3")', stoAns.parseInp),
    '',
  ];

  appendStageDetails(lines, 'MEM_INIT', stoAns.memInit, { includeCanonical: true });
  appendStageDetails(lines, 'CreateReal("Ans")', stoAns.createRealAns);
  appendStageDetails(lines, 'ParseInp("2+3")', stoAns.parseInp, {
    includeTokens: hexArray(INPUT_2_PLUS_3),
    note: 'FPS and the other allocator pointers were left in their CreateReal state before ParseInp; no post-MEM_INIT reseed was applied.',
  });

  lines.push('## Part 4: Fresh Multi-Expression Pointer Sanity');
  lines.push('');
  lines.push('| Expression | Tokens | Parse outcome | errNo | pTempCnt | Invariant |');
  lines.push('|:---|:---|:---|:---|:---|:---|');
  for (const result of multiExprResults) lines.push(parseCaseRow(result));
  lines.push('');

  for (const result of multiExprResults) {
    lines.push(`### ${result.expression}`);
    lines.push('');
    lines.push(`- Tokens: \`${result.tokensHex}\``);
    lines.push(`- Boot: steps=${result.boot.steps} term=${result.boot.termination} lastPc=${hex(result.boot.lastPc ?? 0)}.`);
    lines.push(`- MEM_INIT: ${formatRunOutcome(result.memInit.run)} steps=${result.memInit.run.stepCount} errNo=${hex(result.memInit.run.errNo, 2)}.`);
    lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(result.memInit.snapshot)}`);
    if (!result.parseInp) {
      lines.push('- ParseInp skipped because MEM_INIT did not complete.');
      lines.push('');
      continue;
    }
    lines.push(`- ParseInp frame @ ${hex(result.parseInp.frame.mainReturnSp)}: [${result.parseInp.frame.mainReturnBytes}] errFrame=${hex(result.parseInp.frame.errFrameBase)} [${result.parseInp.frame.errFrameBytes}]`);
    lines.push(`- ParseInp pre-call pointers: ${formatPointerSnapshot(result.parseInp.before)}`);
    lines.push(`- ParseInp outcome: ${formatRunOutcome(result.parseInp.run)} steps=${result.parseInp.run.stepCount} errNo=${hex(result.parseInp.run.errNo, 2)}.`);
    lines.push(`- Post-ParseInp pointers: ${formatPointerSnapshot(result.parseInp.snapshot)}`);
    lines.push(`- pTempCnt read24=${hex(result.parseInp.snapshot.pTempCnt)} raw3=[${result.parseInp.counterBytes.raw3}] raw4=[${result.parseInp.counterBytes.raw4}]`);
    lines.push(`- Invariant tempMem <= FPSbase <= FPS <= OPS <= OPBase <= pTemp <= progPtr: ${formatCheckResult(result.parseInp.invariant)}`);
    if (!didStageComplete(result.parseInp.run) || !result.parseInp.invariant.pass) {
      lines.push(`- Recent PCs: ${recentPcText(result.parseInp.run.recentPcs)}`);
    }
    lines.push('');
  }

  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText) {
  fs.writeFileSync(REPORT_PATH, `# ${REPORT_TITLE} FAILED\n\n\`\`\`text\n${String(errorText)}\n\`\`\`\n`);
}

function main() {
  const transcript = [];

  const memInitAudit = runMemInitAudit();
  const auditLine = `MEM_INIT audit: pTempCnt=${hex(memInitAudit.memInit.snapshot.pTempCnt)} invariant=${memInitAudit.memInit.invariant.pass ? 'PASS' : 'FAIL'} canonical=${memInitAudit.memInit.canonicalShape.pass ? 'PASS' : 'FAIL'}`;
  transcript.push(auditLine);
  console.log(auditLine);

  const stoAns = runStoAnsPipeline();
  const stoLines = [
    `StoAns MEM_INIT: ${stoAns.memInit.invariant.pass ? 'PASS' : 'FAIL'} errNo=${hex(stoAns.memInit.run.errNo, 2)} outcome=${formatRunOutcome(stoAns.memInit.run)}`,
    `StoAns CreateReal(Ans): ${stoAns.createRealAns ? (stoAns.createRealAns.invariant.pass ? 'PASS' : 'FAIL') : 'SKIPPED'} errNo=${stoAns.createRealAns ? hex(stoAns.createRealAns.run.errNo, 2) : 'n/a'} outcome=${stoAns.createRealAns ? formatRunOutcome(stoAns.createRealAns.run) : 'skipped'}`,
    `StoAns ParseInp(2+3): ${stoAns.parseInp ? (stoAns.parseInp.invariant.pass ? 'PASS' : 'FAIL') : 'SKIPPED'} errNo=${stoAns.parseInp ? hex(stoAns.parseInp.run.errNo, 2) : 'n/a'} outcome=${stoAns.parseInp ? formatRunOutcome(stoAns.parseInp.run) : 'skipped'}`,
  ];
  for (const line of stoLines) {
    transcript.push(line);
    console.log(line);
  }

  const multiExprResults = [];
  for (const testCase of MULTI_EXPR_CASES) {
    const result = runFreshParseCase(testCase);
    multiExprResults.push(result);
    const line = `${result.expression}: ${result.parseInp ? (result.parseInp.invariant.pass ? 'PASS' : 'FAIL') : 'SKIPPED'} errNo=${result.parseInp ? hex(result.parseInp.run.errNo, 2) : 'n/a'} outcome=${result.parseInp ? formatRunOutcome(result.parseInp.run) : 'skipped'}`;
    transcript.push(line);
    console.log(line);
  }

  writeReport(memInitAudit, stoAns, multiExprResults, transcript);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  writeFailureReport(error?.stack || String(error));
  process.exitCode = 1;
}
