#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ax-multi-expr-report.md');
const REPORT_TITLE = 'Phase 25AX - Multi-Expression Direct-Eval Probe';

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
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const TOKEN_BUFFER_ADDR = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const SENTINEL_RET = 0xffffff;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const CASES = [
  { expression: '2+3', tokens: Uint8Array.from([0x32, 0x70, 0x33, 0x3f]), expected: 5.0 },
  { expression: '3*4', tokens: Uint8Array.from([0x33, 0x82, 0x34, 0x3f]), expected: 12.0 },
  { expression: '9-1', tokens: Uint8Array.from([0x39, 0x71, 0x31, 0x3f]), expected: 8.0 },
  { expression: '8/2', tokens: Uint8Array.from([0x38, 0x83, 0x32, 0x3f]), expected: 4.0 },
  { expression: '(2+3)*4', tokens: Uint8Array.from([0x10, 0x32, 0x70, 0x33, 0x11, 0x82, 0x34, 0x3f]), expected: 20.0 },
  { expression: '7', tokens: Uint8Array.from([0x37, 0x3f]), expected: 7.0 },
];

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 2000000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 64;
const TOLERANCE = 1e-6;

const hex = (v, w = 6) => v === undefined || v === null ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).padStart(w, '0')}`;
const read24 = (m, a) => ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;
function write24(m, a, v) { m[a] = v & 0xff; m[a + 1] = (v >>> 8) & 0xff; m[a + 2] = (v >>> 16) & 0xff; }
function hexBytes(m, a, n) { const out = []; for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).padStart(2, '0')); return out.join(' '); }
const hexArray = (b) => Array.from(b, (x) => (x & 0xff).toString(16).padStart(2, '0')).join(' ');
const memWrap = (m) => ({ write8(a, v) { m[a] = v & 0xff; }, read8(a) { return m[a] & 0xff; } });
function safeReadReal(w, a) { try { return readReal(w, a); } catch (e) { return `readReal error: ${e?.message ?? e}`; } }
const approxEqual = (a, b) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= TOLERANCE;
function formatValue(v) {
  return typeof v === 'number' && Number.isFinite(v)
    ? v.toFixed(6).replace(/\.?0+$/, '')
    : String(v);
}

function snapshot(mem) {
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

function fmtSnap(s) {
  return [
    `tempMem=${hex(s.tempMem)}`, `FPSbase=${hex(s.fpsBase)}`, `FPS=${hex(s.fps)}`, `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`, `pTemp=${hex(s.pTemp)}`, `progPtr=${hex(s.progPtr)}`, `newDataPtr=${hex(s.newDataPtr)}`,
    `errSP=${hex(s.errSP)}`, `errNo=${hex(s.errNo, 2)}`, `begPC=${hex(s.begPC)}`, `curPC=${hex(s.curPC)}`, `endPC=${hex(s.endPC)}`,
  ].join(' ');
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return boot;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3; write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
  return { mainReturnSp: cpu.sp & 0xffffff, mainReturnBytes: hexBytes(mem, cpu.sp, 3), errFrameBase: base, errFrameBytes: hexBytes(mem, base, 6) };
}

function runCall(executor, cpu, mem, { entry, budget, returnPc, allowSentinelRet = false, label = 'call', milestoneInterval = 0, onMilestone }) {
  let finalPc = null, termination = 'unknown', returnHit = false, errCaught = false, sentinelRet = false, missingBlock = false, stepCount = 0;
  const recentPcs = [], milestones = [];
  let nextMilestone = milestoneInterval > 0 ? milestoneInterval : Number.POSITIVE_INFINITY;
  const notePc = (pc, step) => {
    const norm = pc & 0xffffff; finalPc = norm;
    if (typeof step === 'number') {
      stepCount = Math.max(stepCount, step + 1);
      if (step >= nextMilestone) {
        const s = snapshot(mem);
        const text = `${step} steps: PC=${hex(norm)} errNo=${hex(s.errNo, 2)} FPS=${hex(s.fps)} OPS=${hex(s.ops)}`;
        milestones.push(text);
        if (onMilestone) onMilestone(`  [${label} milestone] ${text}`);
        nextMilestone += milestoneInterval;
      }
    }
    recentPcs.push(norm); if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === returnPc) throw new Error('__RET__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
    if (allowSentinelRet && norm === SENTINEL_RET) throw new Error('__SENT__');
  };
  try {
    const res = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) { notePc(pc, step); },
      onMissingBlock(pc, _m, step) { missingBlock = true; notePc(pc, step); },
    });
    finalPc = res.lastPc ?? finalPc;
    termination = res.termination ?? termination;
    stepCount = Math.max(stepCount, res.steps ?? 0);
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = returnPc; termination = 'return_hit'; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; termination = 'err_caught'; }
    else if (e?.message === '__SENT__') { sentinelRet = true; finalPc = SENTINEL_RET; termination = 'sentinel_ret'; }
    else throw e;
  }
  return { returnHit, errCaught, sentinelRet, missingBlock, termination, finalPc, stepCount, recentPcs, milestones, a: cpu.a & 0xff, f: cpu.f & 0xff, hl: cpu.hl & 0xffffff, de: cpu.de & 0xffffff, sp: cpu.sp & 0xffffff, errNo: mem[ERR_NO_ADDR] & 0xff };
}

function outcome(run) {
  if (!run) return '(skipped)';
  if (run.returnHit) return `returned to ${hex(FAKE_RET)}`;
  if (run.sentinelRet) return `reached sentinel ${hex(SENTINEL_RET)}`;
  if (run.errCaught) return `unwound to ${hex(ERR_CATCH_ADDR)}`;
  return `termination=${run.termination} finalPc=${hex(run.finalPc)}`;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  return { mem, executor, cpu: executor.cpu, wrap: memWrap(mem) };
}

function runExpression(testCase) {
  const { mem, executor, cpu, wrap } = createRuntime();
  const boot = coldBoot(executor, cpu, mem);
  const postBoot = snapshot(mem);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  const memInitFrame = { mainReturnSp: cpu.sp & 0xffffff, mainReturnBytes: hexBytes(mem, cpu.sp, 3) };
  const memInitRun = runCall(executor, cpu, mem, { entry: MEMINIT_ENTRY, budget: MEMINIT_BUDGET, returnPc: MEMINIT_RET, label: 'MEM_INIT' });
  const postMemInit = snapshot(mem);

  let parseFrame = null;
  let parseBefore = null;
  let parseRun = null;
  let parseAfter = null;
  let op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  let op1Decoded = 'not-run';
  let errNo = memInitRun.errNo;
  let finalPc = memInitRun.finalPc;

  if (memInitRun.returnHit) {
    mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
    mem.set(testCase.tokens, TOKEN_BUFFER_ADDR);
    write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
    write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
    write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + testCase.tokens.length);
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
    parseBefore = snapshot(mem);
    prepareCallState(cpu, mem);
    parseFrame = seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
    parseRun = runCall(executor, cpu, mem, { entry: PARSEINP_ENTRY, budget: PARSEINP_BUDGET, returnPc: FAKE_RET, label: 'ParseInp' });
    parseAfter = snapshot(mem);
    op1Bytes = hexBytes(mem, OP1_ADDR, 9);
    op1Decoded = safeReadReal(wrap, OP1_ADDR);
    errNo = parseRun.errNo;
    finalPc = parseRun.finalPc;
  }

  const pass = Boolean(
    memInitRun.returnHit &&
    parseRun?.returnHit &&
    (errNo === 0x00 || errNo === 0x8d) &&
    approxEqual(op1Decoded, testCase.expected),
  );

  return {
    expression: testCase.expression,
    tokensHex: hexArray(testCase.tokens),
    expected: testCase.expected,
    pass,
    boot,
    postBoot,
    memInitFrame,
    memInitRun,
    postMemInit,
    parseFrame,
    parseBefore,
    parseRun,
    parseAfter,
    op1Bytes,
    op1Decoded,
    errNo,
    finalPc,
  };
}

function formatConsoleLine(result) {
  return `${result.pass ? 'PASS' : 'FAIL'} ${result.expression} -> OP1=${formatValue(result.op1Decoded)} expected=${formatValue(result.expected)} errNo=${hex(result.errNo, 2)} finalPc=${hex(result.finalPc)}`;
}

function writeReport(results, transcript) {
  const passCount = results.filter((result) => result.pass).length;
  const lines = [
    `# ${REPORT_TITLE}`,
    '',
    '## Date',
    '',
    new Date().toISOString(),
    '',
    '## Summary',
    '',
    '- Each expression runs in a completely fresh runtime: new memory image, new executor, new peripheral bus, and a cold boot before `MEM_INIT -> ParseInp`.',
    `- Cases passed: ${passCount}/${results.length}.`,
    '- Acceptance: return to `0x7FFFFE`, decode OP1 to the expected real value within `1e-6`, and allow `errNo` values `0x00` or `0x8D`.',
    `- Verdict: ${passCount === results.length ? 'SUCCESS' : 'FAILURE'}.`,
    '',
    '## Matrix',
    '',
    '| Expression | Tokens | Expected | Result | OP1 | errNo | Final PC | Parse outcome |',
    '|:---|:---|---:|:---|:---|:---|:---|:---|',
    ...results.map((result) => `| ${result.expression} | \`${result.tokensHex}\` | ${formatValue(result.expected)} | ${result.pass ? 'PASS' : 'FAIL'} | ${formatValue(result.op1Decoded)} | ${hex(result.errNo, 2)} | ${hex(result.finalPc)} | ${result.parseRun ? outcome(result.parseRun) : 'ParseInp skipped'} |`),
    '',
    '## Details',
    '',
    ...results.flatMap((result) => [
      `### ${result.expression}`,
      '',
      `- Tokens: \`${result.tokensHex}\``,
      `- Expected: ${formatValue(result.expected)}`,
      `- Boot: steps=${result.boot.steps} term=${result.boot.termination} lastPc=${hex(result.boot.lastPc ?? 0)}`,
      `- Post-boot pointers: ${fmtSnap(result.postBoot)}`,
      `- MEM_INIT frame: @${hex(result.memInitFrame.mainReturnSp)} [${result.memInitFrame.mainReturnBytes}]`,
      `- MEM_INIT: ${result.memInitRun.returnHit ? `returned to ${hex(MEMINIT_RET)}` : outcome(result.memInitRun)} steps=${result.memInitRun.stepCount} errNo=${hex(result.memInitRun.errNo, 2)}`,
      `- Post-MEM_INIT pointers: ${fmtSnap(result.postMemInit)}`,
      result.parseFrame ? `- Parse frame: @${hex(result.parseFrame.mainReturnSp)} [${result.parseFrame.mainReturnBytes}] errFrame=${hex(result.parseFrame.errFrameBase)} [${result.parseFrame.errFrameBytes}]` : '- Parse frame: not seeded',
      result.parseBefore ? `- Parse pre-state: ${fmtSnap(result.parseBefore)}` : '- Parse pre-state: skipped',
      result.parseRun ? `- ParseInp: ${outcome(result.parseRun)} steps=${result.parseRun.stepCount} errNo=${hex(result.parseRun.errNo, 2)}` : '- ParseInp: skipped',
      `- OP1: [${result.op1Bytes}] decoded=${formatValue(result.op1Decoded)}`,
      result.parseAfter ? `- Post-ParseInp pointers: ${fmtSnap(result.parseAfter)}` : '- Post-ParseInp pointers: skipped',
      `- Result: ${result.pass ? 'PASS' : 'FAIL'}`,
      '',
    ]),
    '## Console Output',
    '',
    '```text',
    ...transcript,
    '```',
  ];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText) {
  fs.writeFileSync(REPORT_PATH, `# ${REPORT_TITLE} FAILED\n\n\`\`\`text\n${String(errorText)}\n\`\`\`\n`);
}

function main() {
  const results = [];
  const transcript = [];

  for (const testCase of CASES) {
    const result = runExpression(testCase);
    const line = formatConsoleLine(result);
    results.push(result);
    transcript.push(line);
    console.log(line);
  }

  writeReport(results, transcript);
  if (results.some((result) => !result.pass)) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  writeFailureReport(error?.stack || String(error));
  process.exitCode = 1;
}
