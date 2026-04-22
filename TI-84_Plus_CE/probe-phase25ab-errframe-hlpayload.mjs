#!/usr/bin/env node

/**
 * Phase 25AB: ParseInp probe with hlPayload=0x099929 in the PushErrorHandler frame.
 *
 * Previous probe (25Y) used hlPayload=0x000000, which caused execution to jump
 * to the boot vector after the error-restore stub unwound. This probe sets
 * hlPayload to 0x099929 (ParseInp's internal error catch point) so that the
 * longjmp lands back inside ParseInp instead of rebooting.
 *
 * Frame layout (18 bytes, same as PushErrorHandler):
 *   SP+0  = 0x061E27 (normal-return cleanup stub)
 *   SP+3  = 0x061DD1 (error-restore stub)
 *   SP+6  = OPS - OPBase
 *   SP+9  = FPS - FPSbase
 *   SP+12 = previous errSP
 *   SP+15 = caller HL payload (0x099929 = ParseInp error catch point)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ab-errframe-hlpayload-report.md');

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
const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;

const PUSH_ERROR_HANDLER_ERR_STUB = 0x061dd1;
const PUSH_ERROR_HANDLER_RET_STUB = 0x061e27;
const POP_ERROR_HANDLER = 0x061dd1;
const NORMAL_RETURN_STUB = 0x061e27;
const ERROR_CATCH_POINT = 0x099929;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TOKEN_BUFFER_ADDR = 0xd00800;
const TOKEN_BUFFER_CLEAR_LEN = 0x80;
const OP1_LEN = 9;

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 64;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const INTERESTING_PCS = new Map([
  [PUSH_ERROR_HANDLER_ERR_STUB, 'PushErrorHandler error-restore stub'],
  [PUSH_ERROR_HANDLER_RET_STUB, 'PushErrorHandler normal-return stub'],
  [ERROR_CATCH_POINT, 'ERROR_CATCH_POINT (ParseInp error catch)'],
  [0x061db2, 'JError'],
  [0x061d3a, 'ErrUndefined dispatch'],
  [0x061d3e, 'ErrMemory dispatch'],
  [FAKE_RET, 'FAKE_RET'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push((mem[(addr + i) & 0xffffff] & 0xff).toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function read24(mem, addr) {
  return (
    (mem[(addr + 0) & 0xffffff] & 0xff) |
    ((mem[(addr + 1) & 0xffffff] & 0xff) << 8) |
    ((mem[(addr + 2) & 0xffffff] & 0xff) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  mem[(addr + 0) & 0xffffff] = value & 0xff;
  mem[(addr + 1) & 0xffffff] = (value >>> 8) & 0xff;
  mem[(addr + 2) & 0xffffff] = (value >>> 16) & 0xff;
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr & 0xffffff] = val & 0xff; },
    read8(addr) { return mem[addr & 0xffffff] & 0xff; },
  };
}

function snapshotPointers(mem) {
  return {
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
  };
}

function formatPointerSnapshot(snapshot) {
  return [
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `errSP=${hex(snapshot.errSP)}`,
    `errNo=${hex(snapshot.errNo, 2)}`,
    `begPC=${hex(snapshot.begPC)}`,
    `curPC=${hex(snapshot.curPC)}`,
    `endPC=${hex(snapshot.endPC)}`,
  ].join(' ');
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
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

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let steps = 0;
  let finalPc = null;
  let termination = 'unknown';
  let returned = false;

  try {
    const result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        finalPc = pc & 0xffffff;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (finalPc === MEMINIT_RET) throw new Error('__MEMINIT_RETURN__');
      },
      onMissingBlock(pc, _mode, step) {
        finalPc = pc & 0xffffff;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (finalPc === MEMINIT_RET) throw new Error('__MEMINIT_RETURN__');
      },
    });

    finalPc = result.lastPc ?? finalPc;
    steps = Math.max(steps, result.steps ?? 0);
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__MEMINIT_RETURN__') {
      returned = true;
      finalPc = MEMINIT_RET;
      termination = 'return_hit';
    } else {
      throw error;
    }
  }

  return { returned, steps, finalPc, termination };
}

function setupTokens(mem, tokens) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + TOKEN_BUFFER_CLEAR_LEN);
  mem.set(tokens, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + tokens.length);
}

function buildFullErrFrame(cpu, mem) {
  const opsVal = read24(mem, OPS_ADDR);
  const opBaseVal = read24(mem, OPBASE_ADDR);
  const fpsVal = read24(mem, FPS_ADDR);
  const fpsBaseVal = read24(mem, FPSBASE_ADDR);

  const opsDelta = (opsVal - opBaseVal) & 0xffffff;
  const fpsDelta = (fpsVal - fpsBaseVal) & 0xffffff;
  const prevErrSP = 0x000000;
  const hlPayload = ERROR_CATCH_POINT;  // 0x099929 -- ParseInp's internal error catch
  const fakeRetSp = cpu.sp & 0xffffff;

  // Build the 18-byte frame (push in reverse order, lowest address first)
  cpu.sp -= 3;
  write24(mem, cpu.sp, hlPayload);       // SP+15: caller HL payload
  cpu.sp -= 3;
  write24(mem, cpu.sp, prevErrSP);       // SP+12: previous errSP
  cpu.sp -= 3;
  write24(mem, cpu.sp, fpsDelta);        // SP+9:  FPS - FPSbase
  cpu.sp -= 3;
  write24(mem, cpu.sp, opsDelta);        // SP+6:  OPS - OPBase
  cpu.sp -= 3;
  write24(mem, cpu.sp, PUSH_ERROR_HANDLER_ERR_STUB);  // SP+3: error-restore stub
  cpu.sp -= 3;
  write24(mem, cpu.sp, PUSH_ERROR_HANDLER_RET_STUB);  // SP+0: normal-return cleanup stub

  write24(mem, ERR_SP_ADDR, cpu.sp);

  return {
    frameBase: cpu.sp & 0xffffff,
    frameBytes: hexBytes(mem, cpu.sp, 18),
    fakeRetSp,
    fakeRetBytes: hexBytes(mem, fakeRetSp, 3),
    opsDelta,
    fpsDelta,
    prevErrSP,
    hlPayload,
  };
}

function runParseInp(executor, cpu, mem) {
  let finalPc = null;
  let steps = 0;
  let termination = 'unknown';
  let returnHit = false;
  let missingBlock = false;
  let missingBlockPc = null;
  let cleanupStubHits = 0;
  let errorRestoreHits = 0;
  let errorCatchPointHit = false;
  const recentPcs = [];
  const interestingEvents = [];
  const INTERESTING_EVENT_LIMIT = 64;

  const noteInteresting = (pc) => {
    const label = INTERESTING_PCS.get(pc);
    if (!label || interestingEvents.length >= INTERESTING_EVENT_LIMIT) return;
    const rendered = `${hex(pc)} (${label})`;
    if (interestingEvents[interestingEvents.length - 1] !== rendered) {
      interestingEvents.push(rendered);
    }
  };

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        steps = Math.max(steps, (step ?? 0) + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        noteInteresting(norm);
        if (norm === PUSH_ERROR_HANDLER_RET_STUB) cleanupStubHits++;
        if (norm === PUSH_ERROR_HANDLER_ERR_STUB) errorRestoreHits++;
        if (norm === ERROR_CATCH_POINT) errorCatchPointHit = true;
        if (norm === FAKE_RET) throw new Error('__PARSEINP_RETURN__');
      },
      onMissingBlock(pc, _mode, step) {
        const norm = pc & 0xffffff;
        missingBlock = true;
        missingBlockPc = norm;
        finalPc = norm;
        steps = Math.max(steps, (step ?? 0) + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        noteInteresting(norm);
        if (norm === PUSH_ERROR_HANDLER_RET_STUB) cleanupStubHits++;
        if (norm === PUSH_ERROR_HANDLER_ERR_STUB) errorRestoreHits++;
        if (norm === ERROR_CATCH_POINT) errorCatchPointHit = true;
        if (norm === FAKE_RET) throw new Error('__PARSEINP_RETURN__');
      },
    });

    finalPc = result.lastPc ?? finalPc;
    steps = Math.max(steps, result.steps ?? 0);
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__PARSEINP_RETURN__') {
      returnHit = true;
      finalPc = FAKE_RET;
      termination = 'return_hit';
    } else {
      throw error;
    }
  }

  return {
    finalPc,
    steps,
    termination,
    returnHit,
    missingBlock,
    missingBlockPc,
    cleanupStubHits,
    errorRestoreHits,
    errorCatchPointHit,
    recentPcs,
    interestingEvents,
  };
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AB: ParseInp with hlPayload=0x099929 (error catch point) ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  // Step 1: Cold boot
  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  // Step 2: MEM_INIT
  const memInit = runMemInit(executor, cpu, mem);
  log(`MEM_INIT: returned=${memInit.returned} steps=${memInit.steps} term=${memInit.termination} finalPc=${hex(memInit.finalPc ?? 0)}`);
  if (!memInit.returned) {
    throw new Error('MEM_INIT did not return');
  }

  // Step 3: Setup tokens
  setupTokens(mem, INPUT_TOKENS);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[ERR_NO_ADDR] = 0x00;

  // Step 4: Prepare CPU state and push FAKE_RET + error frame
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errFrame = buildFullErrFrame(cpu, mem);

  const before = snapshotPointers(mem);

  log(`tokens @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexBytes(mem, TOKEN_BUFFER_ADDR, INPUT_TOKENS.length)}]`);
  log(`OP1 pre-call @ ${hex(OP1_ADDR)}: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  log(`pre-ParseInp: ${formatPointerSnapshot(before)}`);
  log(`err frame @ ${hex(errFrame.frameBase)}: [${errFrame.frameBytes}]`);
  log(`  fakeRet @ ${hex(errFrame.fakeRetSp)}: [${errFrame.fakeRetBytes}]`);
  log(`  opsDelta=${hex(errFrame.opsDelta)} fpsDelta=${hex(errFrame.fpsDelta)} prevErrSP=${hex(errFrame.prevErrSP)} hlPayload=${hex(errFrame.hlPayload)}`);

  // Step 5: Run ParseInp
  log(`calling ParseInp @ ${hex(PARSEINP_ENTRY)} with budget=${PARSEINP_BUDGET}...`);
  const parse = runParseInp(executor, cpu, mem);
  const after = snapshotPointers(mem);

  // Step 6: Collect results
  let op1Decoded = NaN;
  try {
    op1Decoded = readReal(memWrap, OP1_ADDR);
  } catch (error) {
    op1Decoded = `readReal error: ${error?.message ?? error}`;
  }

  const op1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  const classification = parse.returnHit
    ? 'RETURN_HIT'
    : parse.errorCatchPointHit
      ? 'ERROR_CATCH_POINT_HIT'
      : parse.missingBlock
        ? 'MISSING_BLOCK'
        : 'OTHER';

  log('');
  log('=== Results ===');
  log(`classification: ${classification}`);
  log(`finalPc: ${hex(parse.finalPc ?? 0)}`);
  log(`steps: ${parse.steps}`);
  log(`termination: ${parse.termination}`);
  log(`returnHit: ${parse.returnHit}`);
  log(`errorCatchPointHit (0x099929 reached): ${parse.errorCatchPointHit}`);
  log(`missingBlock: ${parse.missingBlock}${parse.missingBlockPc ? ` @ ${hex(parse.missingBlockPc)}` : ''}`);
  log(`cleanupStubHits: ${parse.cleanupStubHits}`);
  log(`errorRestoreHits: ${parse.errorRestoreHits}`);
  log(`errNo: ${hex(errNo, 2)}`);
  log(`OP1 post-call: [${op1PostHex}]`);
  log(`OP1 decoded: ${formatValue(op1Decoded)}`);
  log(`post-ParseInp: ${formatPointerSnapshot(after)}`);
  log(`interesting events: ${parse.interestingEvents.length ? parse.interestingEvents.join(' -> ') : '(none)'}`);
  log(`recent PCs (last ${RECENT_PC_LIMIT}): ${parse.recentPcs.map((pc) => hex(pc)).join(' ')}`);

  // Write report
  const lines = [];
  lines.push('# Phase 25AB - ParseInp errFrame hlPayload=0x099929 Probe');
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push('Test using `hlPayload=0x099929` (ParseInp\'s internal error catch point) in the');
  lines.push('PushErrorHandler frame, instead of the previous `0x000000` that caused execution');
  lines.push('to jump to boot after the error-restore stub unwound.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Cold boot + MEM_INIT at `0x09DEE0`');
  lines.push('- Token buffer at `0xD00800`: `[0x32, 0x70, 0x33, 0x3F]` ("2+3")');
  lines.push('- Full 18-byte PushErrorHandler error frame on the stack:');
  lines.push('  - SP+0  = `0x061E27` (normal-return cleanup stub)');
  lines.push('  - SP+3  = `0x061DD1` (error-restore stub)');
  lines.push('  - SP+6  = OPS - OPBase (delta)');
  lines.push('  - SP+9  = FPS - FPSbase (delta)');
  lines.push('  - SP+12 = previous errSP (`0x000000`)');
  lines.push(`  - SP+15 = hlPayload (\`${hex(ERROR_CATCH_POINT)}\` = ParseInp error catch point)`);
  lines.push(`- ParseInp called at \`${hex(PARSEINP_ENTRY)}\` with budget=${PARSEINP_BUDGET}`);
  lines.push('');
  lines.push('## Error Frame Details');
  lines.push('');
  lines.push(`- Frame base: \`${hex(errFrame.frameBase)}\``);
  lines.push(`- Frame bytes: \`${errFrame.frameBytes}\``);
  lines.push(`- FAKE_RET @ \`${hex(errFrame.fakeRetSp)}\`: \`${errFrame.fakeRetBytes}\``);
  lines.push(`- opsDelta=${hex(errFrame.opsDelta)} fpsDelta=${hex(errFrame.fpsDelta)} prevErrSP=${hex(errFrame.prevErrSP)} hlPayload=${hex(errFrame.hlPayload)}`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| ------ | ----- |`);
  lines.push(`| Classification | **${classification}** |`);
  lines.push(`| Final PC | \`${hex(parse.finalPc ?? 0)}\` |`);
  lines.push(`| Steps | ${parse.steps} |`);
  lines.push(`| Termination | ${parse.termination} |`);
  lines.push(`| Return hit (FAKE_RET) | ${parse.returnHit} |`);
  lines.push(`| 0x099929 reached | ${parse.errorCatchPointHit} |`);
  lines.push(`| Missing block | ${parse.missingBlock}${parse.missingBlockPc ? ` @ \`${hex(parse.missingBlockPc)}\`` : ''} |`);
  lines.push(`| Cleanup stub hits | ${parse.cleanupStubHits} |`);
  lines.push(`| Error restore hits | ${parse.errorRestoreHits} |`);
  lines.push(`| errNo | \`${hex(errNo, 2)}\` |`);
  lines.push(`| OP1 | \`${op1PostHex}\` |`);
  lines.push(`| OP1 decoded | ${formatValue(op1Decoded)} |`);
  lines.push('');
  lines.push('## Pointer State');
  lines.push('');
  lines.push(`- Before: ${formatPointerSnapshot(before)}`);
  lines.push(`- After:  ${formatPointerSnapshot(after)}`);
  lines.push('');
  lines.push('## Interesting Events');
  lines.push('');
  if (parse.interestingEvents.length) {
    for (const event of parse.interestingEvents) {
      lines.push(`- ${event}`);
    }
  } else {
    lines.push('(none)');
  }
  lines.push('');
  lines.push('## Recent PCs (last 64)');
  lines.push('');
  lines.push('```');
  lines.push(parse.recentPcs.map((pc) => hex(pc)).join(' '));
  lines.push('```');
  lines.push('');
  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...transcript);
  lines.push('```');
  lines.push('');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  log(`\nreport written to ${REPORT_PATH}`);

  process.exitCode = classification === 'OTHER' ? 1 : 0;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  const lines = [
    '# Phase 25AB - ParseInp errFrame hlPayload Probe FAILED',
    '',
    '## Error',
    '',
    '```text',
    ...String(message).split(/\r?\n/),
    '```',
  ];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  process.exitCode = 1;
}
