#!/usr/bin/env node

/**
 * Phase 25T: ParseInp probe with a seeded outer error-handler frame.
 *
 * Goal:
 *   - Cold-boot the OS
 *   - Seed errSP with a minimal ADL frame that satisfies JError's `pop af ; ret`
 *   - Seed OPS / VAT / FPS state for tokenized `2+3`
 *   - Call ParseInp at 0x099914
 *   - Distinguish:
 *       - normal return to FAKE_RET
 *       - outer longjmp to ERR_CATCH_ADDR
 *       - bad failure / missing block
 *
 * The report also documents the actual PushErrorHandler contract derived from
 * the ROM at 0x061DEF.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25t-parseinp-errhandler-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITER = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const PARSEINP_ENTRY = 0x099914;
const JERROR_ENTRY = 0x061DB2;
const PUSH_ERROR_HANDLER_ENTRY = 0x061DEF;
const POP_ERROR_HANDLER_ENTRY = 0x061E20;
const PUSH_ERROR_HANDLER_ERR_STUB = 0x061DD1;
const PUSH_ERROR_HANDLER_RET_STUB = 0x061E27;
const ERR_UNDEFINED_ENTRY = 0x061D3A;
const ERR_MEMORY_ENTRY = 0x061D3E;

const OP1_ADDR = 0xD005F8;
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xD008DF;
const ERR_SP_ADDR = 0xD008E0;
const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMP_ADDR = 0xD0259A;
const PROG_PTR_ADDR = 0xD0259D;
const USER_MEM_ADDR = 0xD1A881;

const FAKE_RET = 0x7FFFFE;
const ERR_CATCH_ADDR = 0x7FFFFA;
const ERR_FRAME_LEN = 6;

const INSN_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 64;
const INTERESTING_EVENT_LIMIT = 32;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3F]);

const ERR_NAME_BY_CODE = new Map([
  [0x88, 'ErrSyntax (re-edit)'],
  [0x8d, 'ErrUndefined'],
  [0x8e, 'ErrMemory'],
  [0x8f, 'ErrInvalid'],
]);

const INTERESTING_PC_TEXT = new Map([
  [ERR_UNDEFINED_ENTRY, 'ErrUndefined dispatch'],
  [ERR_MEMORY_ENTRY, 'ErrMemory dispatch'],
  [JERROR_ENTRY, 'JError'],
  [PUSH_ERROR_HANDLER_ERR_STUB, 'PushErrorHandler error-restore stub'],
  [PUSH_ERROR_HANDLER_RET_STUB, 'PushErrorHandler normal-return stub'],
  [ERR_CATCH_ADDR, 'ERR_CATCH_ADDR'],
  [FAKE_RET, 'FAKE_RET'],
]);

const PUSH_ERROR_HANDLER_DISASM = [
  '0x061DEF: d1                 pop de',
  '0x061DF0: e5                 push hl',
  '0x061DF1: 2a e0 08 d0        ld hl, (0xD008E0)',
  '0x061DF5: e5                 push hl',
  '0x061DF6: ed 4b 8a 25 d0     ld bc, (0xD0258A)',
  '0x061DFB: 2a 8d 25 d0        ld hl, (0xD0258D)',
  '0x061DFF: b7                 or a',
  '0x061E00: ed 42              sbc hl, bc',
  '0x061E02: e5                 push hl',
  '0x061E03: ed 4b 90 25 d0     ld bc, (0xD02590)',
  '0x061E08: 2a 93 25 d0        ld hl, (0xD02593)',
  '0x061E0C: ed 42              sbc hl, bc',
  '0x061E0E: e5                 push hl',
  '0x061E0F: 21 d1 1d 06        ld hl, 0x061DD1',
  '0x061E13: e5                 push hl',
  '0x061E14: 21 27 1e 06        ld hl, 0x061E27',
  '0x061E18: e5                 push hl',
  '0x061E19: ed 73 e0 08 d0     ld (0xD008E0), sp',
  '0x061E1E: eb                 ex de, hl',
  '0x061E1F: e9                 jp (hl)',
  '0x061E20: c1                 pop bc',
  '0x061E21: ed 7b e0 08 d0     ld sp, (0xD008E0)',
  '0x061E26: c9                 ret',
  '0x061E27: f1                 pop af',
  '0x061E28: f1                 pop af',
  '0x061E29: f1                 pop af',
  '0x061E2A: e3                 ex (sp), hl',
  '0x061E2B: 22 e0 08 d0        ld (0xD008E0), hl',
  '0x061E2F: e1                 pop hl',
  '0x061E30: f1                 pop af',
  '0x061E31: c5                 push bc',
  '0x061E32: c9                 ret',
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push((mem[(addr + i) & 0xFFFFFF] & 0xFF).toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr & 0xFFFFFF] = val & 0xFF; },
    read8(addr) { return mem[addr & 0xFFFFFF] & 0xFF; },
  };
}

function write24(mem, addr, value) {
  mem[(addr + 0) & 0xFFFFFF] = value & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  return (
    (mem[(addr + 0) & 0xFFFFFF] & 0xFF) |
    ((mem[(addr + 1) & 0xFFFFFF] & 0xFF) << 8) |
    ((mem[(addr + 2) & 0xFFFFFF] & 0xFF) << 16)
  ) >>> 0;
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
}

function recentPcText(pcs) {
  return pcs.length ? pcs.map((pc) => hex(pc)).join(' ') : '(none)';
}

function pointerSummary(mem) {
  return `OPBase=${hex(read24(mem, OPBASE_ADDR))} OPS=${hex(read24(mem, OPS_ADDR))} pTemp=${hex(read24(mem, PTEMP_ADDR))} progPtr=${hex(read24(mem, PROG_PTR_ADDR))}`;
}

function fpsSummary(mem) {
  return `FPSbase=${hex(read24(mem, FPSBASE_ADDR))} FPS=${hex(read24(mem, FPS_ADDR))}`;
}

function describeErrNo(errNo) {
  if (ERR_NAME_BY_CODE.has(errNo)) return `${hex(errNo, 2)} (${ERR_NAME_BY_CODE.get(errNo)})`;
  if (errNo === 0x00) return `${hex(errNo, 2)} (clear)`;
  return hex(errNo, 2);
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITER,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return result;
}

function postInitState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._hl = USER_MEM_ADDR;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function primeProbeState(mem) {
  mem.fill(0x00, USER_MEM_ADDR, USER_MEM_ADDR + 0x100);
  mem.set(INPUT_TOKENS, USER_MEM_ADDR);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = 0x00;
  mem[OP1_ADDR + 1] = 0x41;
  mem[OP1_ADDR + 2] = 0x00;

  mem[ERR_NO_ADDR] = 0x00;

  // Keep both deltas at zero so PushErrorHandler's restore stubs are well-defined.
  write24(mem, FPSBASE_ADDR, USER_MEM_ADDR + 0x40);
  write24(mem, FPS_ADDR, USER_MEM_ADDR + 0x40);
  write24(mem, OPBASE_ADDR, USER_MEM_ADDR);
  write24(mem, OPS_ADDR, USER_MEM_ADDR);
  write24(mem, PTEMP_ADDR, USER_MEM_ADDR + 0x20);
  write24(mem, PROG_PTR_ADDR, USER_MEM_ADDR + 0x23);
}

function seedOuterErrFrame(cpu, mem) {
  cpu.push(FAKE_RET);
  const mainReturnSp = cpu.sp & 0xFFFFFF;
  const errFrameBase = (cpu.sp - ERR_FRAME_LEN) & 0xFFFFFF;

  // Minimal outer frame for JError's `ld sp, (errSP) ; pop af ; ret`.
  mem[(errFrameBase + 0) & 0xFFFFFF] = 0x00;
  mem[(errFrameBase + 1) & 0xFFFFFF] = 0x00;
  mem[(errFrameBase + 2) & 0xFFFFFF] = 0x00;
  mem[(errFrameBase + 3) & 0xFFFFFF] = ERR_CATCH_ADDR & 0xFF;
  mem[(errFrameBase + 4) & 0xFFFFFF] = (ERR_CATCH_ADDR >>> 8) & 0xFF;
  mem[(errFrameBase + 5) & 0xFFFFFF] = (ERR_CATCH_ADDR >>> 16) & 0xFF;

  write24(mem, ERR_SP_ADDR, errFrameBase);

  return {
    mainReturnSp,
    mainReturnBytes: hexBytes(mem, mainReturnSp, 3),
    errFrameBase,
    errFrameBytes: hexBytes(mem, errFrameBase, ERR_FRAME_LEN),
    errSpValue: read24(mem, ERR_SP_ADDR),
  };
}

function runParseInp(executor, cpu, mem) {
  let finalPc = null;
  let blockCount = 0;
  let returnHit = false;
  let errCaught = false;
  let missingBlockPc = null;
  let resultSummary = null;
  let lastStep = 0;
  const recentPcs = [];
  const interestingEvents = [];

  const noteInteresting = (pc) => {
    const label = INTERESTING_PC_TEXT.get(pc);
    if (!label || interestingEvents.length >= INTERESTING_EVENT_LIMIT) return;
    const rendered = `${hex(pc)} (${label})`;
    if (interestingEvents[interestingEvents.length - 1] !== rendered) {
      interestingEvents.push(rendered);
    }
  };

  const handlePc = (pc, step, isMissing) => {
    const norm = pc & 0xFFFFFF;
    cpu.pc = norm;
    finalPc = norm;
    lastStep = step ?? lastStep;
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    noteInteresting(norm);

    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
    if (isMissing) {
      missingBlockPc = norm;
      throw new Error('__MISSING_BLOCK__');
    }
  };

  try {
    resultSummary = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        blockCount++;
        handlePc(pc, step, false);
      },
      onMissingBlock(pc, _mode, step) {
        handlePc(pc, step, true);
      },
    });
    finalPc = resultSummary.lastPc ?? finalPc;
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      finalPc = FAKE_RET;
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      finalPc = ERR_CATCH_ADDR;
    } else if (error?.message !== '__MISSING_BLOCK__') {
      throw error;
    }
  }

  return {
    returnHit,
    errCaught,
    missingBlockPc,
    finalPc,
    steps: resultSummary?.steps ?? lastStep,
    blockCount,
    termination: resultSummary?.termination ?? (
      returnHit ? 'return_hit' : errCaught ? 'err_caught' : missingBlockPc !== null ? 'missing_block' : 'threw'
    ),
    dynamicTargets: resultSummary?.dynamicTargets ?? [],
    missingBlocks: resultSummary?.missingBlocks ?? [],
    recentPcs,
    interestingEvents,
    errNo: mem[ERR_NO_ADDR] & 0xFF,
    errSp: read24(mem, ERR_SP_ADDR),
    ops: read24(mem, OPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROG_PTR_ADDR),
    sp: cpu.sp & 0xFFFFFF,
  };
}

function writeReport(details) {
  const lines = [];

  lines.push('# Phase 25T - ParseInp errHandler Probe');
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push(`Call \`ParseInp\` at \`${hex(PARSEINP_ENTRY)}\` with tokenized \`2+3\`, a valid outer \`errSP\` recovery frame, and enough parser/FPS state that TI-OS error unwinds do not crash out of the transpiled ROM.`);
  lines.push('');
  lines.push('## PushErrorHandler Contract');
  lines.push('');
  lines.push(`- Jump-table entry \`0x020798\` resolves to \`${hex(PUSH_ERROR_HANDLER_ENTRY)}\` (\`PushErrorHandler\`).`);
  lines.push(`- \`JError\` at \`${hex(JERROR_ENTRY)}\` still uses the simple outer contract: \`ld sp, (errSP) ; pop af ; ret\`.`);
  lines.push(`- The full \`PushErrorHandler\` frame is larger than the minimal outer catch frame. After \`ld (errSP), sp\`, the words at the saved \`errSP\` slot are, in order: cleanup word \`${hex(PUSH_ERROR_HANDLER_RET_STUB)}\`, error-restore target \`${hex(PUSH_ERROR_HANDLER_ERR_STUB)}\`, \`OPS - OPBase\`, \`FPS - FPSbase\`, previous \`errSP\`, and the caller's saved \`HL\` payload.`);
  lines.push(`- On the error path, \`JError\` discards the first word with \`pop af\`, then \`ret\` lands at \`${hex(PUSH_ERROR_HANDLER_ERR_STUB)}\`, which restores \`OPS\`, \`FPS\`, the previous \`errSP\`, reloads \`errNo\` into \`A\`, and returns.`);
  lines.push(`- \`${hex(PUSH_ERROR_HANDLER_RET_STUB)}\` is the normal-return cleanup stub, and \`${hex(POP_ERROR_HANDLER_ENTRY)}\` is the explicit \`PopErrorHandler\` helper.`);
  lines.push('');
  lines.push('```text');
  lines.push(...PUSH_ERROR_HANDLER_DISASM);
  lines.push('```');
  lines.push('');
  lines.push('## Probe Setup');
  lines.push('');
  lines.push(`- Token buffer @ \`${hex(USER_MEM_ADDR)}\`: \`${details.inputBytes}\``);
  lines.push(`- \`OP1\` pre-seeded as real var \`A\`: \`${details.op1PreHex}\``);
  lines.push(`- Parser pointers before call: ${details.pointerBeforeText}`);
  lines.push(`- FPS pointers before call: ${details.fpsBeforeText}`);
  lines.push(`- Main return frame @ \`${hex(details.errFrame.mainReturnSp)}\`: \`${details.errFrame.mainReturnBytes}\``);
  lines.push(`- Outer catch frame @ \`${hex(details.errFrame.errFrameBase)}\`: \`${details.errFrame.errFrameBytes}\``);
  lines.push(`- \`errSP\` before call: \`${hex(details.errFrame.errSpValue)}\``);
  lines.push('');
  lines.push('## Outcome');
  lines.push('');
  lines.push(`- Classification: **${details.classification}**`);
  lines.push(`- returnHit=${details.run.returnHit}`);
  lines.push(`- errCaught=${details.run.errCaught}`);
  lines.push(`- termination=${details.run.termination}`);
  lines.push(`- finalPc=\`${hex(details.run.finalPc)}\``);
  lines.push(`- steps=${details.run.steps}`);
  lines.push(`- blockCount=${details.run.blockCount}`);
  lines.push(`- errNo after call: \`${details.errNoText}\``);
  lines.push(`- errSP after call: \`${hex(details.run.errSp)}\``);
  lines.push(`- SP after call: \`${hex(details.run.sp)}\``);
  lines.push(`- OP1 post-call: \`${details.op1PostHex}\``);
  lines.push(`- OP1 decoded via readReal: ${formatValue(details.op1Decoded)}`);
  lines.push(`- Parser pointers after call: ${details.pointerAfterText}`);
  lines.push(`- FPS pointers after call: ${details.fpsAfterText}`);
  lines.push(`- Interesting events: \`${details.interestingEventsText}\``);
  lines.push(`- Recent PCs: \`${details.recentPcsText}\``);
  lines.push(`- Missing blocks: \`${details.missingBlocksText}\``);
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');

  if (details.classification === 'PASS') {
    lines.push(`ParseInp no longer crashes or spins once \`OPBase/OPS\`, \`pTemp/progPtr\`, and \`FPSbase/FPS\` are seeded to valid RAM. The top-level call returned cleanly to \`${hex(FAKE_RET)}\`.`);
    lines.push(`The outer catch frame at \`${hex(ERR_CATCH_ADDR)}\` was **not** used. The observed event trace still passes through \`${hex(ERR_UNDEFINED_ENTRY)}\`, \`${hex(JERROR_ENTRY)}\`, and \`${hex(ERR_MEMORY_ENTRY)}\`, so the most likely explanation is that ParseInp or one of its callees installs an internal PushErrorHandler frame and recovers there once the outer parser/FPS state is valid.`);
    lines.push('The probe therefore answers the crash question but not the expression-evaluation question: `OP1` stayed as the real-variable name `A`, and `readReal(OP1)` still decodes as `0`.');
  } else if (details.classification === 'ERROR_CAUGHT') {
    lines.push(`The outer \`errSP\` frame fired and returned to \`${hex(ERR_CATCH_ADDR)}\`, which means ParseInp escaped to the probe-level catch instead of recovering internally.`);
  } else {
    lines.push('ParseInp still escaped the expected control-flow sentinels. The pointer seeding improved the setup, but the transpiled ROM still needs additional state or lifted coverage.');
  }

  lines.push('');
  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText, transcript) {
  const lines = [
    '# Phase 25T - ParseInp errHandler Probe FAILED',
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

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25T: ParseInp with outer errSP frame and seeded parser/FPS state ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);
  primeProbeState(mem);

  const op1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const pointerBeforeText = pointerSummary(mem);
  const fpsBeforeText = fpsSummary(mem);
  const errFrame = seedOuterErrFrame(cpu, mem);

  log(`input bytes @ ${hex(USER_MEM_ADDR)}: [${hexBytes(mem, USER_MEM_ADDR, INPUT_TOKENS.length)}]`);
  log(`OP1 pre-call @ ${hex(OP1_ADDR)} [${op1PreHex}]`);
  log(`parser pointers before call: ${pointerBeforeText}`);
  log(`FPS pointers before call:    ${fpsBeforeText}`);
  log(`main return frame @ ${hex(errFrame.mainReturnSp)} [${errFrame.mainReturnBytes}]`);
  log(`outer err frame @ ${hex(errFrame.errFrameBase)} [${errFrame.errFrameBytes}]`);
  log(`errSP slot @ ${hex(ERR_SP_ADDR)} -> ${hex(errFrame.errSpValue)}`);

  const run = runParseInp(executor, cpu, mem);
  const classification = run.returnHit
    ? 'PASS'
    : run.errCaught
      ? 'ERROR_CAUGHT'
      : 'BAD_FAIL';

  let op1Decoded = null;
  try {
    op1Decoded = readReal(memWrap, OP1_ADDR);
  } catch (error) {
    op1Decoded = `readReal error: ${error?.message ?? error}`;
  }

  const op1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const errNoText = describeErrNo(run.errNo);
  const pointerAfterText = pointerSummary(mem);
  const fpsAfterText = fpsSummary(mem);
  const interestingEventsText = run.interestingEvents.length ? run.interestingEvents.join(' -> ') : '(none)';
  const recentPcsText = recentPcText(run.recentPcs);
  const missingBlocksText = run.missingBlocks.length
    ? run.missingBlocks.map((entry) => String(entry)).join(' ')
    : '(none)';

  if (run.returnHit) {
    log(`ParseInp returned to FAKE_RET @ ${hex(FAKE_RET)}`);
  } else if (run.errCaught) {
    log(`ParseInp unwound to ERR_CATCH_ADDR @ ${hex(ERR_CATCH_ADDR)}`);
  } else {
    log(`ParseInp missed both sentinels; finalPc=${hex(run.finalPc)} term=${run.termination}`);
  }
  log(`errNo after call: ${errNoText}`);
  log(`OP1 post-call @ ${hex(OP1_ADDR)} [${op1PostHex}]`);
  log(`OP1 decoded via readReal: ${formatValue(op1Decoded)}`);
  log(`parser pointers after call: ${pointerAfterText}`);
  log(`FPS pointers after call:    ${fpsAfterText}`);
  log(`interesting events: ${interestingEventsText}`);
  log(`recent PCs: ${recentPcsText}`);
  log(`result=${classification}`);

  writeReport({
    transcript,
    classification,
    inputBytes: hexBytes(mem, USER_MEM_ADDR, INPUT_TOKENS.length),
    op1PreHex,
    op1PostHex,
    op1Decoded,
    errFrame,
    pointerBeforeText,
    pointerAfterText,
    fpsBeforeText,
    fpsAfterText,
    run,
    errNoText,
    interestingEventsText,
    recentPcsText,
    missingBlocksText,
  });

  log(`report=${REPORT_PATH}`);
  process.exitCode = classification === 'BAD_FAIL' ? 1 : 0;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  writeFailureReport(message, String(message).split(/\r?\n/));
  process.exitCode = 1;
}
