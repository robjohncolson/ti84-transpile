#!/usr/bin/env node

/**
 * Phase 25R: CreateReal with errSP seeded.
 *
 * Goal:
 *   Cold-boot the OS, seed errSP with a fake ADL recovery frame, call
 *   CreateReal at 0x08238A, and distinguish:
 *   - normal return to FAKE_RET
 *   - JError unwind to ERR_CATCH_ADDR via errSP
 *   - bad failure to some other PC
 *
 * Static expectation from prior Phase 25 work:
 *   0x0823AE: jp nz, 0x061D46
 *   0x061D46: ld a, 0x8F ; jr 0x061DB2
 *   0x061DB2: ld (errNo), a ; ... ; ld sp, (errSP) ; pop af ; ret
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25r-createreal-errsp-report.md');

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

const CREATE_REAL_ENTRY = 0x08238A;
const CREATE_REAL_TYPE_DISPATCH = 0x061D46;
const JERROR_ENTRY = 0x061DB2;

const OP1_ADDR = 0xD005F8;
const OP1_LEN = 9;
const OP4_ADDR = 0xD00619;
const ERR_NO_ADDR = 0xD008DF;
const ERR_SP_ADDR = 0xD008E0;
const OPBASE_ADDR = 0xD02590;
const PTEMP_ADDR = 0xD0259A;
const PROG_PTR_ADDR = 0xD0259D;
const USER_MEM_ADDR = 0xD1A881;

const VAT_FALLBACKS = {
  opBase: USER_MEM_ADDR + 0x00,
  pTemp: USER_MEM_ADDR + 0x09,
  progPtr: USER_MEM_ADDR + 0x12,
};

const FAKE_RET = 0x7FFFFE;
const ERR_CATCH_ADDR = 0x7FFFFA;
const ERR_FRAME_LEN = 6;
const EXPECTED_ERRNO = 0x8F;

const INSN_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 50;
const CLEAR_FILL = 0xFF;

// Keep the import explicit per probe task constraints.
void writeReal;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push((mem[(addr + i) & 0xFFFFFF] & 0xFF).toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
}

function recentPcText(pcs) {
  return pcs.length ? pcs.map((pc) => hex(pc)).join(' ') : '(none)';
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

function isRamPointer(value) {
  return value >= 0xD00000 && value <= 0xD1FFFF;
}

function snapshotVatPointers(mem) {
  return {
    opBase: read24(mem, OPBASE_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROG_PTR_ADDR),
  };
}

function formatVatPointers(snapshot) {
  return `OPBase=${hex(snapshot.opBase)} pTemp=${hex(snapshot.pTemp)} progPtr=${hex(snapshot.progPtr)}`;
}

function seedVatPointersIfNeeded(mem) {
  const before = snapshotVatPointers(mem);
  const applied = [];

  if (!isRamPointer(before.opBase)) {
    write24(mem, OPBASE_ADDR, VAT_FALLBACKS.opBase);
    applied.push(`OPBase ${hex(before.opBase)} -> ${hex(VAT_FALLBACKS.opBase)}`);
  }
  if (!isRamPointer(before.pTemp)) {
    write24(mem, PTEMP_ADDR, VAT_FALLBACKS.pTemp);
    applied.push(`pTemp ${hex(before.pTemp)} -> ${hex(VAT_FALLBACKS.pTemp)}`);
  }
  if (!isRamPointer(before.progPtr)) {
    write24(mem, PROG_PTR_ADDR, VAT_FALLBACKS.progPtr);
    applied.push(`progPtr ${hex(before.progPtr)} -> ${hex(VAT_FALLBACKS.progPtr)}`);
  }

  return {
    before,
    after: snapshotVatPointers(mem),
    applied,
  };
}

function safeReadReal(memWrap, addr) {
  try {
    return readReal(memWrap, addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function describeErrNo(errNo) {
  if (errNo === EXPECTED_ERRNO) {
    return `${hex(errNo, 2)} (matches CreateReal -> ${hex(CREATE_REAL_TYPE_DISPATCH)} -> ${hex(JERROR_ENTRY)} static path)`;
  }
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
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 3);

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
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 3);

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
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 12);
}

function primeProbeState(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = 0x00;
  mem[OP1_ADDR + 1] = 0x41;
  mem[ERR_NO_ADDR] = 0x00;
}

function seedErrFrame(cpu, mem) {
  const mainReturnSp = cpu.sp & 0xFFFFFF;
  const errFrameBase = (cpu.sp - ERR_FRAME_LEN) & 0xFFFFFF;

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

function runCreateReal(executor, cpu, mem) {
  let finalPc = null;
  let blockCount = 0;
  let returnHit = false;
  let errCaught = false;
  let resultSummary = null;
  let thrownError = null;
  let lastStep = 0;
  const recentPcs = [];

  const handlePc = (pc, step) => {
    const norm = pc & 0xFFFFFF;
    cpu.pc = norm;
    finalPc = norm;
    lastStep = step ?? lastStep;
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    resultSummary = executor.runFrom(CREATE_REAL_ENTRY, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        blockCount++;
        handlePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        handlePc(pc, step);
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
    } else {
      thrownError = error;
    }
  }

  if (thrownError) throw thrownError;

  return {
    returnHit,
    errCaught,
    finalPc,
    steps: resultSummary?.steps ?? lastStep,
    blockCount,
    termination: resultSummary?.termination ?? (returnHit ? 'return_hit' : errCaught ? 'err_caught' : 'threw'),
    dynamicTargets: resultSummary?.dynamicTargets ?? [],
    missingBlocks: resultSummary?.missingBlocks ?? [],
    recentPcs,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu.hl & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    errNo: mem[ERR_NO_ADDR] & 0xFF,
    errSp: read24(mem, ERR_SP_ADDR),
  };
}

function writeReport(details) {
  const lines = [];

  lines.push('# Phase 25R - CreateReal errSP Probe');
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push(`Call \`CreateReal\` at \`${hex(CREATE_REAL_ENTRY)}\` with a seeded \`errSP\` frame so TI-OS error unwind lands at \`${hex(ERR_CATCH_ADDR)}\` instead of crashing to an arbitrary return PC.`);
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Cold boot + post-init pattern copied from earlier Phase 25 probes.');
  lines.push(`- \`CreateReal\` entry: \`${hex(CREATE_REAL_ENTRY)}\``);
  lines.push(`- Static failure path: \`${hex(CREATE_REAL_TYPE_DISPATCH)}\` seeds \`${hex(EXPECTED_ERRNO, 2)}\`, then tails into \`${hex(JERROR_ENTRY)}\``);
  lines.push(`- Timer IRQ disabled via \`createPeripheralBus({ timerInterrupt: false })\``);
  lines.push(`- Instruction budget: ${INSN_BUDGET}`);
  lines.push(`- Loop cap: ${MAX_LOOP_ITER}`);
  lines.push(`- \`OP1\` pre-call bytes: \`${details.op1PreHex}\``);
  lines.push(`- \`OP4\` pre-call byte: \`${hex(details.op4Before, 2)}\``);
  lines.push(`- VAT pointers before seed: ${details.vatBeforeSeedText}`);
  lines.push(`- VAT pointers before call: ${details.vatBeforeCallText}`);
  lines.push(`- VAT fallback seeds applied: ${details.vatSeedApplied.length ? details.vatSeedApplied.join('; ') : 'none'}`);
  lines.push(`- Main return frame @ \`${hex(details.errFrame.mainReturnSp)}\`: \`${details.errFrame.mainReturnBytes}\``);
  lines.push(`- Error frame @ \`${hex(details.errFrame.errFrameBase)}\`: \`${details.errFrame.errFrameBytes}\``);
  lines.push(`- \`errSP\` slot before call: \`${hex(details.errFrame.errSpValue)}\``);
  lines.push('');
  lines.push('## Outcome');
  lines.push('');
  lines.push(`- Classification: **${details.classification}**`);
  lines.push(`- informative=${details.informative}`);
  lines.push(`- returnHit=${details.run.returnHit}`);
  lines.push(`- errCaught=${details.run.errCaught}`);
  lines.push(`- termination=${details.run.termination}`);
  lines.push(`- finalPc=\`${hex(details.run.finalPc)}\``);
  lines.push(`- steps=${details.run.steps}`);
  lines.push(`- errNo after call: \`${details.errNoText}\``);
  lines.push(`- errSP after call: \`${hex(details.run.errSp)}\``);
  lines.push(`- SP after call: \`${hex(details.run.sp)}\``);
  lines.push(`- A/F after call: \`${hex(details.run.a, 2)} / ${hex(details.run.f, 2)}\``);
  lines.push(`- HL/DE after call: \`${hex(details.run.hl)} / ${hex(details.run.de)}\``);
  lines.push(`- OP1 post-call: \`${details.op1PostHex}\``);
  lines.push(`- OP1 decoded via readReal: ${formatValue(details.op1Decoded)}`);
  lines.push(`- VAT pointers after call: ${details.vatAfterCallText}`);
  lines.push(`- Recent PCs: \`${details.recentPcsText}\``);
  lines.push(`- Dynamic targets: \`${details.dynamicTargetsText}\``);
  lines.push(`- Missing blocks: \`${details.missingBlocksText}\``);
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  if (details.classification === 'PASS') {
    lines.push(`CreateReal returned normally to \`${hex(FAKE_RET)}\`. The errSP frame was not needed on this run.`);
  } else if (details.classification === 'INFORMATIVE_FAIL') {
    lines.push(`The errSP frame worked: JError unwound through \`${hex(JERROR_ENTRY)}\` and returned to the probe sentinel \`${hex(ERR_CATCH_ADDR)}\`, with \`errNo=${hex(details.run.errNo, 2)}\`.`);
  } else {
    lines.push('The call missed both sentinels, so the probe still escaped to an unexpected PC and needs deeper state seeding.');
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
    '# Phase 25R - CreateReal errSP Probe FAILED',
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

  log('=== Phase 25R: CreateReal with errSP seeded ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);

  const vatSeed = seedVatPointersIfNeeded(mem);
  primeProbeState(mem);

  const vatBeforeCall = snapshotVatPointers(mem);
  const op1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op4Before = mem[OP4_ADDR] & 0xFF;

  log(`VAT before seed: ${formatVatPointers(vatSeed.before)}`);
  log(`VAT after seed:  ${formatVatPointers(vatSeed.after)}`);
  log(`VAT before call: ${formatVatPointers(vatBeforeCall)}`);
  if (vatSeed.applied.length) {
    log(`VAT fallback seeds: ${vatSeed.applied.join('; ')}`);
  } else {
    log('VAT fallback seeds: none');
  }
  log(`OP1 pre-call @ ${hex(OP1_ADDR)} [${op1PreHex}]`);
  log(`OP4 pre-call @ ${hex(OP4_ADDR)} = ${hex(op4Before, 2)}`);

  cpu.push(FAKE_RET);
  const errFrame = seedErrFrame(cpu, mem);

  log(`main return frame @ ${hex(errFrame.mainReturnSp)} [${errFrame.mainReturnBytes}]`);
  log(`errSP frame @ ${hex(errFrame.errFrameBase)} [${errFrame.errFrameBytes}]`);
  log(`errSP slot @ ${hex(ERR_SP_ADDR)} -> ${hex(errFrame.errSpValue)}`);
  log(`static expectation: ${hex(CREATE_REAL_ENTRY)} type-check failure -> ${hex(CREATE_REAL_TYPE_DISPATCH)} -> errNo ${hex(EXPECTED_ERRNO, 2)} -> ${hex(JERROR_ENTRY)}`);

  const run = runCreateReal(executor, cpu, mem);

  const classification = run.returnHit
    ? 'PASS'
    : run.errCaught
      ? 'INFORMATIVE_FAIL'
      : 'BAD_FAIL';
  const informative = run.returnHit || run.errCaught;

  const op1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op1Decoded = safeReadReal(memWrap, OP1_ADDR);
  const vatAfterCall = snapshotVatPointers(mem);
  const errNoText = describeErrNo(run.errNo);
  const recentPcsText = recentPcText(run.recentPcs);
  const dynamicTargetsText = run.dynamicTargets.length
    ? run.dynamicTargets.map((pc) => hex(pc)).join(' ')
    : '(none)';
  const missingBlocksText = run.missingBlocks.length
    ? run.missingBlocks.join(' ')
    : '(none)';

  if (run.returnHit) {
    log(`CreateReal returned to FAKE_RET @ ${hex(FAKE_RET)}`);
  } else if (run.errCaught) {
    log(`CreateReal unwound to ERR_CATCH_ADDR @ ${hex(ERR_CATCH_ADDR)}`);
  } else {
    log(`CreateReal missed both sentinels; finalPc=${hex(run.finalPc)} term=${run.termination}`);
  }
  log(`errNo after call: ${errNoText}`);
  log(`errSP after call: ${hex(run.errSp)}  SP after call: ${hex(run.sp)}`);
  log(`OP1 post-call @ ${hex(OP1_ADDR)} [${op1PostHex}]`);
  log(`OP1 decoded via readReal: ${formatValue(op1Decoded)}`);
  log(`VAT after call: ${formatVatPointers(vatAfterCall)}`);
  log(`recent PCs: ${recentPcsText}`);
  log(`result=${classification}`);

  writeReport({
    transcript,
    classification,
    informative,
    errFrame,
    op1PreHex,
    op1PostHex,
    op1Decoded,
    op4Before,
    vatBeforeSeedText: formatVatPointers(vatSeed.before),
    vatBeforeCallText: formatVatPointers(vatBeforeCall),
    vatAfterCallText: formatVatPointers(vatAfterCall),
    vatSeedApplied: vatSeed.applied,
    run,
    errNoText,
    recentPcsText,
    dynamicTargetsText,
    missingBlocksText,
  });

  log(`report=${REPORT_PATH}`);
  process.exitCode = informative ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  writeFailureReport(message, String(message).split(/\r?\n/));
  process.exitCode = 1;
}
