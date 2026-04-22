#!/usr/bin/env node

/**
 * Phase 25AF: Trace when cxCurApp gets zeroed during CoorMon
 *
 * Goal:
 *   1. Cold boot + MEM_INIT
 *   2. Seed keyboard matrix with ENTER key pressed
 *   3. Seed cxCurApp byte/word at 0xD007E0 to 0x0040
 *   4. Run CoorMon with a 70K block-step budget
 *   5. Detect the exact executor step/block where mem[0xD007E0] changes
 *   6. Log all writes that touch cxMain..cxCurApp (0xD007CA-0xD007E1)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25af-cxcurapp-watchpoint-report.md');
const REPORT_TITLE = 'Phase 25AF - cxCurApp Watchpoint During CoorMon';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const COORMON_ENTRY = 0x08c331;
const GETCSC_ADDR = 0x03fa09;
const EXPECTED_GETCSC_STEP = 1643;

const IY_ADDR = 0xd00080;
const KBD_FLAGS_ADDR = 0xd00080;
const KBD_SCAN_CODE_ADDR = 0xd00587;
const KBD_KEY_ADDR = 0xd0058c;
const KBD_GETKY_ADDR = 0xd0058d;

const CX_MAIN_ADDR = 0xd007ca;
const CX_CONTEXT_END_ADDR = 0xd007e1;
const CX_CUR_APP_ADDR = 0xd007e0;
const CX_RANGE_LEN = CX_CONTEXT_END_ADDR - CX_MAIN_ADDR + 1;
const HOME_SCREEN_APP_ID = 0x40;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;

const MEMINIT_RET = 0x7ffff6;
const COORMON_RET = 0x7ffffe;
const FAKE_RET = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const COORMON_BUDGET = 70000;
const MAX_LOOP_ITER = 2000;
const SK_ENTER = 0x09;

const CX_CONTEXT_FIELDS = [
  { name: 'cxMain', addr: 0xd007ca, width: 3 },
  { name: 'cxPPutAway', addr: 0xd007cd, width: 3 },
  { name: 'cxPutAway', addr: 0xd007d0, width: 3 },
  { name: 'cxReDisp', addr: 0xd007d3, width: 3 },
  { name: 'cxErrorEP', addr: 0xd007d6, width: 3 },
  { name: 'cxSizeWind', addr: 0xd007d9, width: 3 },
  { name: 'cxPage', addr: 0xd007dc, width: 3 },
  { name: 'cxCurApp', addr: 0xd007e0, width: 2 },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function read16(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8)) >>> 0;
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

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errSP: read24(mem, ERR_SP_ADDR),
  };
}

function formatPointerSnapshot(snapshot) {
  return [
    `tempMem=${hex(snapshot.tempMem)}`,
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `errNo=${hex(snapshot.errNo, 2)}`,
    `errSP=${hex(snapshot.errSP)}`,
  ].join(' ');
}

function cxFieldValue(mem, field) {
  return field.width === 2 ? read16(mem, field.addr) : read24(mem, field.addr);
}

function snapshotCxContext(mem) {
  const snapshot = {
    rawHex: hexBytes(mem, CX_MAIN_ADDR, CX_RANGE_LEN),
  };

  for (const field of CX_CONTEXT_FIELDS) {
    snapshot[field.name] = cxFieldValue(mem, field);
  }

  return snapshot;
}

function formatCxContextSnapshot(snapshot) {
  const parts = [];
  for (const field of CX_CONTEXT_FIELDS) {
    parts.push(`${field.name}=${hex(snapshot[field.name], field.width === 2 ? 4 : 6)}`);
  }
  parts.push(`raw=[${snapshot.rawHex}]`);
  return parts.join(' ');
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
  cpu._iy = IY_ADDR;
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
  cpu._iy = IY_ADDR;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function relationToGetCSC(step) {
  if (step < EXPECTED_GETCSC_STEP) return 'BEFORE';
  if (step === EXPECTED_GETCSC_STEP) return 'AT';
  return 'AFTER';
}

function summarizeWritesByAddress(writes) {
  const byAddr = new Map();

  for (const write of writes) {
    const stats = byAddr.get(write.addr) || {
      count: 0,
      firstStep: write.step,
      lastStep: write.step,
      pcs: new Set(),
      values: new Set(),
    };
    stats.count++;
    stats.firstStep = Math.min(stats.firstStep, write.step);
    stats.lastStep = Math.max(stats.lastStep, write.step);
    stats.pcs.add(write.pc);
    stats.values.add(write.newValue);
    byAddr.set(write.addr, stats);
  }

  return [...byAddr.entries()]
    .map(([addr, stats]) => ({
      addr,
      count: stats.count,
      firstStep: stats.firstStep,
      lastStep: stats.lastStep,
      pcs: [...stats.pcs].sort((left, right) => left - right),
      values: [...stats.values].sort((left, right) => left - right),
    }))
    .sort((left, right) => left.addr - right.addr);
}

function installCxWriteTracer(cpu, mem) {
  const writes = [];
  let currentStep = 0;
  let currentPc = COORMON_ENTRY;

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  const recordByte = (addr, value, kind) => {
    const norm = addr & 0xffffff;
    if (norm < CX_MAIN_ADDR || norm > CX_CONTEXT_END_ADDR) return;

    writes.push({
      step: currentStep,
      pc: currentPc,
      kind,
      addr: norm,
      oldValue: mem[norm] & 0xff,
      newValue: value & 0xff,
    });
  };

  cpu.write8 = (addr, value) => {
    recordByte(addr, value, 'write8');
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordByte(addr, value, 'write16');
    recordByte(addr + 1, value >>> 8, 'write16');
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte(addr, value, 'write24');
    recordByte(addr + 1, value >>> 8, 'write24');
    recordByte(addr + 2, value >>> 16, 'write24');
    return originalWrite24(addr, value);
  };

  return {
    writes,
    setContext(step, pc) {
      currentStep = step;
      currentPc = pc & 0xffffff;
    },
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function writeReport(details) {
  const lines = [];
  const writeSummary = summarizeWritesByAddress(details.cxWrites);
  const zeroTransition = details.cxCurAppChanges.find((entry) => entry.oldValue === 0x40 && entry.newValue === 0x00);

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString().slice(0, 10));
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Seed `cxCurApp=0x0040` after `MEM_INIT`, press ENTER, run `CoorMon`, and determine the exact executor block-step where byte `mem[0xD007E0]` changes.');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('- Cold boot, `MEM_INIT`, and CoorMon setup were copied from `probe-phase25ae-coormon-homeapp.mjs`.');
  lines.push('- Timer IRQs were disabled with `createPeripheralBus({ timerInterrupt: false })`.');
  lines.push(`- CoorMon ran with a ${COORMON_BUDGET}-step budget and maxLoopIterations=${MAX_LOOP_ITER}.`);
  lines.push('- Step numbers in this report are 1-based executor block steps.');
  lines.push('- `mem[0xD007E0]` is sampled before each block and compared after the block completes, so changes are attributed to the block entry PC for that step.');
  lines.push('- cx-range writes are trapped byte-by-byte by wrapping `cpu.write8/write16/write24` during CoorMon only.');
  lines.push('');

  lines.push('## Stage 0: Boot');
  lines.push('');
  lines.push(`- Boot result: steps=${details.bootResult.steps} term=${details.bootResult.termination} lastPc=${hex(details.bootResult.lastPc ?? 0)}`);
  lines.push(`- Post-boot pointers: ${formatPointerSnapshot(details.postBootPointers)}`);
  lines.push(`- Post-boot cx context: ${formatCxContextSnapshot(details.postBootCx)}`);
  lines.push('');

  lines.push('## Stage 1: MEM_INIT');
  lines.push('');
  lines.push(`- Returned: ${details.memInitReturnHit}`);
  lines.push(`- Termination: ${details.memInitTermination}`);
  lines.push(`- Steps: ${details.memInitSteps}`);
  lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(details.postMemInitPointers)}`);
  lines.push(`- Post-MEM_INIT cx context: ${formatCxContextSnapshot(details.postMemInitCx)}`);
  lines.push('');

  if (!details.memInitReturnHit) {
    lines.push('## Result');
    lines.push('');
    lines.push('MEM_INIT did not return, so CoorMon was not executed.');
    lines.push('');
    lines.push('## Console Output');
    lines.push('');
    lines.push('```text');
    lines.push(...details.transcript);
    lines.push('```');
    fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
    return;
  }

  lines.push('## Stage 2: Seed Keyboard + cxCurApp');
  lines.push('');
  lines.push(`- keyMatrix[1]: \`${hex(details.keyboardSeed.keyMatrix1, 2)}\` (ENTER pressed)`);
  lines.push(`- kbdScanCode: \`${hex(details.keyboardSeed.scanCode, 2)}\``);
  lines.push(`- kbdFlags: \`${hex(details.keyboardSeed.flags, 2)}\``);
  lines.push(`- kbdKey: \`${hex(details.keyboardSeed.key, 2)}\``);
  lines.push(`- kbdGetKy: \`${hex(details.keyboardSeed.getKy, 2)}\``);
  lines.push(`- cxCurApp before seed: \`${hex(details.cxCurAppBeforeSeed, 4)}\``);
  lines.push(`- cxCurApp before CoorMon: \`${hex(details.preCoorMonCx.cxCurApp, 4)}\``);
  lines.push(`- Pre-CoorMon cx context: ${formatCxContextSnapshot(details.preCoorMonCx)}`);
  lines.push('');

  lines.push('## Stage 3: CoorMon Watchpoint');
  lines.push('');
  lines.push(`- Termination: ${details.coormonTermination}`);
  lines.push(`- Steps observed: ${details.coormonSteps}`);
  lines.push(`- Final PC: \`${hex(details.coormonFinalPc)}\``);
  lines.push(`- Returned to sentinel: ${details.coormonReturnHit}`);
  lines.push(`- Missing block observed: ${details.coormonMissingBlock}`);
  lines.push(`- GetCSC entry steps: ${details.getCSCHitSteps.length > 0 ? details.getCSCHitSteps.join(', ') : '(none)'}`);
  lines.push(`- cxCurApp after CoorMon: \`${hex(details.postCoormonCx.cxCurApp, 4)}\``);
  lines.push(`- Post-CoorMon pointers: ${formatPointerSnapshot(details.postCoormonPointers)}`);
  lines.push(`- Post-CoorMon cx context: ${formatCxContextSnapshot(details.postCoormonCx)}`);
  lines.push('');

  lines.push('### Exact cxCurApp Transition');
  lines.push('');
  if (zeroTransition) {
    lines.push(`- Byte \`${hex(CX_CUR_APP_ADDR)}\` changed from \`${hex(zeroTransition.oldValue, 2)}\` to \`${hex(zeroTransition.newValue, 2)}\` at step=${zeroTransition.step} pc=${hex(zeroTransition.pc)} (${zeroTransition.relation} step ${EXPECTED_GETCSC_STEP})`);
  } else if (details.cxCurAppChanges.length > 0) {
    const first = details.cxCurAppChanges[0];
    lines.push(`- No direct \`0x40 -> 0x00\` transition was observed. First change was step=${first.step} pc=${hex(first.pc)} ${hex(first.oldValue, 2)} -> ${hex(first.newValue, 2)} (${first.relation} step ${EXPECTED_GETCSC_STEP})`);
  } else {
    lines.push('- No change to byte `mem[0xD007E0]` was observed within the CoorMon budget.');
  }
  lines.push('');

  lines.push('### cxCurApp Byte Change Log');
  lines.push('');
  if (details.cxCurAppChanges.length === 0) {
    lines.push('(none)');
  } else {
    for (let i = 0; i < details.cxCurAppChanges.length; i++) {
      const change = details.cxCurAppChanges[i];
      lines.push(`${i + 1}. step=${change.step} pc=${hex(change.pc)} old=${hex(change.oldValue, 2)} new=${hex(change.newValue, 2)} relation=${change.relation}`);
    }
  }
  lines.push('');

  lines.push('### cx Range Write Summary');
  lines.push('');
  if (writeSummary.length === 0) {
    lines.push('(none)');
  } else {
    lines.push('| Address | Count | Step Range | PCs | Values |');
    lines.push('|---------|-------|------------|-----|--------|');
    for (const entry of writeSummary) {
      const pcs = entry.pcs.map((pc) => hex(pc)).join(', ');
      const values = entry.values.map((value) => hex(value, 2)).join(', ');
      lines.push(`| ${hex(entry.addr)} | ${entry.count} | ${entry.firstStep}-${entry.lastStep} | ${pcs || '-'} | ${values || '-'} |`);
    }
  }
  lines.push('');

  lines.push('### cx Range Raw Write Log');
  lines.push('');
  if (details.cxWrites.length === 0) {
    lines.push('(none)');
  } else {
    for (let i = 0; i < details.cxWrites.length; i++) {
      const write = details.cxWrites[i];
      lines.push(`${i + 1}. step=${write.step} pc=${hex(write.pc)} addr=${hex(write.addr)} old=${hex(write.oldValue, 2)} new=${hex(write.newValue, 2)} via=${write.kind}`);
    }
  }
  lines.push('');

  lines.push('## Final State');
  lines.push('');
  lines.push(`- errNo: \`${hex(details.finalErrNo, 2)}\``);
  lines.push(`- errSP: \`${hex(details.finalErrSp)}\``);
  lines.push(`- OP1 bytes @ \`${hex(OP1_ADDR)}\`: \`${details.finalOp1Hex}\``);
  lines.push(`- Pointer snapshot: ${formatPointerSnapshot(details.postCoormonPointers)}`);
  lines.push(`- cx context snapshot: ${formatCxContextSnapshot(details.postCoormonCx)}`);
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

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AF: cxCurApp Watchpoint During CoorMon ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  const postBootPointers = snapshotPointers(mem);
  const postBootCx = snapshotCxContext(mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);
  log(`post-boot cx context: ${formatCxContextSnapshot(postBootCx)}`);

  log('');
  log('=== STAGE 1: MEM_INIT ===');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let memInitTermination = 'unknown';
  let memInitSteps = 0;
  let memInitReturnHit = false;

  try {
    const result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xffffff;
        if (typeof step === 'number') memInitSteps = Math.max(memInitSteps, step + 1);
        if (norm === MEMINIT_RET) throw new Error('__RETURN__');
      },
      onMissingBlock(pc, _mode, step) {
        const norm = pc & 0xffffff;
        if (typeof step === 'number') memInitSteps = Math.max(memInitSteps, step + 1);
        if (norm === MEMINIT_RET) throw new Error('__RETURN__');
      },
    });
    memInitTermination = result.termination ?? 'unknown';
    memInitSteps = Math.max(memInitSteps, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN__') {
      memInitReturnHit = true;
      memInitTermination = 'return_hit';
    } else {
      throw error;
    }
  }

  const postMemInitPointers = snapshotPointers(mem);
  const postMemInitCx = snapshotCxContext(mem);
  log(`MEM_INIT: returned=${memInitReturnHit} term=${memInitTermination} steps=${memInitSteps}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);
  log(`post-MEM_INIT cx context: ${formatCxContextSnapshot(postMemInitCx)}`);

  if (!memInitReturnHit) {
    writeReport({
      transcript,
      bootResult,
      postBootPointers,
      postBootCx,
      memInitReturnHit,
      memInitTermination,
      memInitSteps,
      postMemInitPointers,
      postMemInitCx,
    });
    process.exitCode = 1;
    return;
  }

  log('');
  log('=== STAGE 2: Seed Keyboard + cxCurApp ===');
  peripherals.keyboard.keyMatrix[1] = 0xfe;
  mem[KBD_SCAN_CODE_ADDR] = SK_ENTER;
  mem[KBD_FLAGS_ADDR] |= 1 << 3;
  mem[KBD_FLAGS_ADDR] |= 1 << 4;
  mem[KBD_KEY_ADDR] = 0x05;
  mem[KBD_GETKY_ADDR] = 0x05;

  const cxCurAppBeforeSeed = read16(mem, CX_CUR_APP_ADDR);
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
  mem[CX_CUR_APP_ADDR + 1] = 0x00;

  const preCoorMonCx = snapshotCxContext(mem);

  log(`keyMatrix[1]=${hex(peripherals.keyboard.keyMatrix[1], 2)} (ENTER pressed)`);
  log(`kbdScanCode=${hex(mem[KBD_SCAN_CODE_ADDR], 2)} kbdFlags=${hex(mem[KBD_FLAGS_ADDR], 2)} kbdKey=${hex(mem[KBD_KEY_ADDR], 2)} kbdGetKy=${hex(mem[KBD_GETKY_ADDR], 2)}`);
  log(`cxCurApp before seed=${hex(cxCurAppBeforeSeed, 4)} after seed=${hex(preCoorMonCx.cxCurApp, 4)}`);
  log(`pre-CoorMon cx context: ${formatCxContextSnapshot(preCoorMonCx)}`);

  log('');
  log('=== STAGE 3: CoorMon Watchpoint ===');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, COORMON_RET);

  const cxWriteTracer = installCxWriteTracer(cpu, mem);
  const cxCurAppChanges = [];
  const getCSCHitSteps = [];
  const missingBlocks = [];
  let pendingStep = null;
  let coormonSteps = 0;
  let coormonTermination = 'unknown';
  let coormonReturnHit = false;
  let coormonMissingBlock = false;
  let coormonFinalPc = COORMON_ENTRY;

  const flushPendingStep = () => {
    if (!pendingStep) return;

    const afterValue = mem[CX_CUR_APP_ADDR] & 0xff;
    if (afterValue !== pendingStep.beforeValue) {
      const change = {
        step: pendingStep.step,
        pc: pendingStep.pc,
        oldValue: pendingStep.beforeValue,
        newValue: afterValue,
        relation: relationToGetCSC(pendingStep.step),
      };
      cxCurAppChanges.push(change);
      log(`cxCurApp change: step=${change.step} pc=${hex(change.pc)} ${hex(change.oldValue, 2)} -> ${hex(change.newValue, 2)} (${change.relation} step ${EXPECTED_GETCSC_STEP})`);
    }

    pendingStep = null;
  };

  try {
    try {
      const result = executor.runFrom(COORMON_ENTRY, 'adl', {
        maxSteps: COORMON_BUDGET,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _mode, _meta, step) {
          flushPendingStep();

          const norm = pc & 0xffffff;
          const stepNumber = (step ?? 0) + 1;

          coormonSteps = Math.max(coormonSteps, stepNumber);
          coormonFinalPc = norm;
          cxWriteTracer.setContext(stepNumber, norm);

          if (norm === GETCSC_ADDR) {
            getCSCHitSteps.push(stepNumber);
            log(`GetCSC hit: step=${stepNumber} pc=${hex(norm)}`);
          }

          pendingStep = {
            step: stepNumber,
            pc: norm,
            beforeValue: mem[CX_CUR_APP_ADDR] & 0xff,
          };
        },
        onMissingBlock(pc, _mode, step) {
          flushPendingStep();

          const norm = pc & 0xffffff;
          const stepNumber = (step ?? 0) + 1;

          coormonFinalPc = norm;
          missingBlocks.push({ step: stepNumber, pc: norm });

          if (norm === COORMON_RET) throw new Error('__RETURN__');
          if (norm === FAKE_RET || norm === 0xffffff) throw new Error('__MISSING_BLOCK__');

          coormonMissingBlock = true;
          log(`missing block: step=${stepNumber} pc=${hex(norm)}`);
        },
      });

      coormonTermination = result.termination ?? 'unknown';
      coormonSteps = Math.max(coormonSteps, result.steps ?? 0);
      if ((result.missingBlocks?.length ?? 0) > 0) coormonMissingBlock = true;
    } catch (error) {
      if (error?.message === '__RETURN__') {
        coormonReturnHit = true;
        coormonTermination = 'return_hit';
      } else if (error?.message === '__MISSING_BLOCK__') {
        coormonTermination = 'missing_block';
        coormonMissingBlock = true;
      } else {
        throw error;
      }
    }
  } finally {
    flushPendingStep();
    cxWriteTracer.restore();
  }

  const postCoormonPointers = snapshotPointers(mem);
  const postCoormonCx = snapshotCxContext(mem);

  log(`CoorMon: term=${coormonTermination} steps=${coormonSteps} finalPc=${hex(coormonFinalPc)}`);
  log(`CoorMon: returned=${coormonReturnHit} missingBlock=${coormonMissingBlock}`);
  log(`GetCSC entry steps: ${getCSCHitSteps.length > 0 ? getCSCHitSteps.join(', ') : '(none)'}`);
  log(`cx range writes=${cxWriteTracer.writes.length}`);
  log(`cxCurApp changes=${cxCurAppChanges.length}`);
  log(`post-CoorMon pointers: ${formatPointerSnapshot(postCoormonPointers)}`);
  log(`post-CoorMon cx context: ${formatCxContextSnapshot(postCoormonCx)}`);

  if (cxCurAppChanges.length === 0) {
    log('cxCurApp did not change within the CoorMon budget.');
  }

  writeReport({
    transcript,
    bootResult,
    postBootPointers,
    postBootCx,
    memInitReturnHit,
    memInitTermination,
    memInitSteps,
    postMemInitPointers,
    postMemInitCx,
    keyboardSeed: {
      keyMatrix1: peripherals.keyboard.keyMatrix[1] & 0xff,
      scanCode: mem[KBD_SCAN_CODE_ADDR] & 0xff,
      flags: mem[KBD_FLAGS_ADDR] & 0xff,
      key: mem[KBD_KEY_ADDR] & 0xff,
      getKy: mem[KBD_GETKY_ADDR] & 0xff,
    },
    cxCurAppBeforeSeed,
    preCoorMonCx,
    coormonTermination,
    coormonSteps,
    coormonReturnHit,
    coormonMissingBlock,
    coormonFinalPc,
    getCSCHitSteps,
    cxCurAppChanges,
    cxWrites: cxWriteTracer.writes,
    missingBlocks,
    postCoormonPointers,
    postCoormonCx,
    finalErrNo: mem[ERR_NO_ADDR] & 0xff,
    finalErrSp: read24(mem, ERR_SP_ADDR),
    finalOp1Hex: hexBytes(mem, OP1_ADDR, 9),
  });

  log(`report=${REPORT_PATH}`);
  process.exitCode = 0;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  writeFailureReport(message, String(message).split(/\r?\n/));
  process.exitCode = 1;
}
