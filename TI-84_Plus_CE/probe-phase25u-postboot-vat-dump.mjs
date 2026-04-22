#!/usr/bin/env node

/**
 * Phase 25U: Post-boot VAT/heap pointer dump + CreateReal attempt.
 *
 * Goal:
 *   1. Cold-boot the OS -> dump OPBase/OPS/pTemp/progPtr/FPSbase/FPS
 *   2. Run home-screen render stages -> re-dump (did the OS init the heap?)
 *   3. Attempt CreateReal with whatever values exist (fallback to userMem if zero)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25u-postboot-vat-dump-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────
const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const CLEAR_FILL = 0xFF;
const USER_MEM_ADDR = 0xD1A881;

// Pointer addresses (all 3-byte LE)
const OPBASE_ADDR   = 0xD02590;
const OPS_ADDR      = 0xD02593;
const PTEMP_ADDR    = 0xD0259A;
const PROG_PTR_ADDR = 0xD0259D;
const FPSBASE_ADDR  = 0xD0258A;
const FPS_ADDR      = 0xD0258D;
const ERR_SP_ADDR   = 0xD008E0;
const ERR_NO_ADDR   = 0xD008DF;
const OP1_ADDR      = 0xD005F8;
const OP1_LEN       = 9;

const CREATE_REAL_ENTRY = 0x08238A;
const FAKE_RET      = 0x7FFFFE;
const ERR_CATCH_ADDR = 0x7FFFFA;
const INSN_BUDGET   = 500000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 50;

// ── Helpers ────────────────────────────────────────────────────────
void writeReal; // keep import explicit

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

function dumpAllPointers(mem) {
  return {
    OPBase:  read24(mem, OPBASE_ADDR),
    OPS:     read24(mem, OPS_ADDR),
    pTemp:   read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROG_PTR_ADDR),
    FPSbase: read24(mem, FPSBASE_ADDR),
    FPS:     read24(mem, FPS_ADDR),
    errSP:   read24(mem, ERR_SP_ADDR),
    errNo:   mem[ERR_NO_ADDR] & 0xFF,
  };
}

function formatPointers(ptrs) {
  return [
    `OPBase=${hex(ptrs.OPBase)}`,
    `OPS=${hex(ptrs.OPS)}`,
    `pTemp=${hex(ptrs.pTemp)}`,
    `progPtr=${hex(ptrs.progPtr)}`,
    `FPSbase=${hex(ptrs.FPSbase)}`,
    `FPS=${hex(ptrs.FPS)}`,
    `errSP=${hex(ptrs.errSP)}`,
    `errNo=${hex(ptrs.errNo, 2)}`,
  ].join('  ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr & 0xFFFFFF] = val & 0xFF; },
    read8(addr) { return mem[addr & 0xFFFFFF] & 0xFF; },
  };
}

function safeReadReal(memWrap, addr) {
  try {
    return readReal(memWrap, addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

// ── Boot ───────────────────────────────────────────────────────────
function coldBoot(executor, cpu, mem) {
  // Phase 1: Z80 cold boot
  const bootResult = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  // Phase 2: Reset CPU, run CoorMon
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08C331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  // Phase 3: Post-init
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802B2, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return bootResult;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25U: Post-boot VAT/heap pointer dump ===');
  log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  // ────────────────────────────────────────────────────────────────
  // PART A: Cold boot -> dump pointers
  // ────────────────────────────────────────────────────────────────
  log('--- Part A: Cold boot pointer dump ---');
  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  const ptrsAfterBoot = dumpAllPointers(mem);
  log('');
  log('Pointers after cold boot + CoorMon + post-init:');
  log(`  ${formatPointers(ptrsAfterBoot)}`);
  log('');
  log(`Raw hex dump 0xD02580..0xD025B0 (48 bytes):`);
  log(`  ${hexBytes(mem, 0xD02580, 48)}`);
  log('');

  const allZero = ptrsAfterBoot.OPBase === 0 && ptrsAfterBoot.OPS === 0 &&
    ptrsAfterBoot.pTemp === 0 && ptrsAfterBoot.progPtr === 0 &&
    ptrsAfterBoot.FPSbase === 0 && ptrsAfterBoot.FPS === 0;
  log(`All heap pointers zero after boot: ${allZero ? 'YES (confirmed)' : 'NO'}`);
  log('');

  // ────────────────────────────────────────────────────────────────
  // PART B: Home-screen render -> re-dump
  // ────────────────────────────────────────────────────────────────
  log('--- Part B: Home-screen render stages -> pointer re-dump ---');

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xD0; cpu._iy = 0xD00080;
  cpu.f = 0x40; cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 12);

  // Stage 2 (home render at 0x0a2b72)
  const HOME_FAKE_RET = 0x7FFFF0;
  mem[cpu.sp] = HOME_FAKE_RET & 0xFF;
  mem[cpu.sp + 1] = (HOME_FAKE_RET >>> 8) & 0xFF;
  mem[cpu.sp + 2] = (HOME_FAKE_RET >>> 16) & 0xFF;

  let homeSteps = 0;
  let homeTerm = 'unknown';
  try {
    const homeResult = executor.runFrom(0x0a2b72, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 4096,
      onBlock(pc) { if ((pc & 0xFFFFFF) === HOME_FAKE_RET) throw new Error('RET'); },
      onMissingBlock(pc) { if ((pc & 0xFFFFFF) === HOME_FAKE_RET) throw new Error('RET'); },
    });
    homeSteps = homeResult.steps;
    homeTerm = homeResult.termination;
  } catch (e) {
    if (e.message === 'RET') {
      homeTerm = 'RET_to_FAKE';
      log(`Home render returned to FAKE_RET @ ${hex(HOME_FAKE_RET)}`);
    } else {
      homeTerm = `threw: ${e.message}`;
      log(`Home render threw: ${e.message}`);
    }
  }
  log(`Home render: term=${homeTerm} steps=${homeSteps}`);

  const ptrsAfterHome = dumpAllPointers(mem);
  log('');
  log('Pointers after home-screen render:');
  log(`  ${formatPointers(ptrsAfterHome)}`);
  log('');
  log(`Raw hex dump 0xD02580..0xD025B0 (48 bytes):`);
  log(`  ${hexBytes(mem, 0xD02580, 48)}`);
  log('');

  // Compare
  const changedPtrs = [];
  for (const key of ['OPBase', 'OPS', 'pTemp', 'progPtr', 'FPSbase', 'FPS']) {
    if (ptrsAfterBoot[key] !== ptrsAfterHome[key]) {
      changedPtrs.push(`${key}: ${hex(ptrsAfterBoot[key])} -> ${hex(ptrsAfterHome[key])}`);
    }
  }
  if (changedPtrs.length) {
    log('Pointers CHANGED by home render:');
    for (const c of changedPtrs) log(`  ${c}`);
  } else {
    log('No heap pointers changed after home render.');
  }
  log('');

  // ────────────────────────────────────────────────────────────────
  // PART C: CreateReal attempt
  // ────────────────────────────────────────────────────────────────
  log('--- Part C: CreateReal attempt ---');

  // Seed VAT pointers if still zero
  const vatBefore = {
    OPBase: read24(mem, OPBASE_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROG_PTR_ADDR),
  };
  const seeded = [];
  if (!isRamPointer(vatBefore.OPBase)) {
    write24(mem, OPBASE_ADDR, USER_MEM_ADDR);
    seeded.push(`OPBase: ${hex(vatBefore.OPBase)} -> ${hex(USER_MEM_ADDR)}`);
  }
  if (!isRamPointer(vatBefore.pTemp)) {
    write24(mem, PTEMP_ADDR, USER_MEM_ADDR + 0x09);
    seeded.push(`pTemp: ${hex(vatBefore.pTemp)} -> ${hex(USER_MEM_ADDR + 0x09)}`);
  }
  if (!isRamPointer(vatBefore.progPtr)) {
    write24(mem, PROG_PTR_ADDR, USER_MEM_ADDR + 0x12);
    seeded.push(`progPtr: ${hex(vatBefore.progPtr)} -> ${hex(USER_MEM_ADDR + 0x12)}`);
  }

  if (seeded.length) {
    log('VAT pointer fallback seeds applied:');
    for (const s of seeded) log(`  ${s}`);
  } else {
    log('VAT pointers already valid -- no fallback seeding needed.');
  }

  // Set OP1 = real var "A"
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = 0x00; // type: real
  mem[OP1_ADDR + 1] = 0x41; // name: 'A'
  mem[ERR_NO_ADDR] = 0x00;

  const op1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  log(`OP1 pre-call: [${op1PreHex}]`);

  // Set up CPU state
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xD0; cpu._iy = 0xD00080;
  cpu.f = 0x40; cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 12);

  // Push FAKE_RET as main return
  cpu.sp -= 3;
  mem[cpu.sp + 0] = FAKE_RET & 0xFF;
  mem[cpu.sp + 1] = (FAKE_RET >>> 8) & 0xFF;
  mem[cpu.sp + 2] = (FAKE_RET >>> 16) & 0xFF;

  // Seed errSP catch frame
  const errFrameBase = (cpu.sp - 6) & 0xFFFFFF;
  mem[(errFrameBase + 0) & 0xFFFFFF] = 0x00;
  mem[(errFrameBase + 1) & 0xFFFFFF] = 0x00;
  mem[(errFrameBase + 2) & 0xFFFFFF] = 0x00;
  mem[(errFrameBase + 3) & 0xFFFFFF] = ERR_CATCH_ADDR & 0xFF;
  mem[(errFrameBase + 4) & 0xFFFFFF] = (ERR_CATCH_ADDR >>> 8) & 0xFF;
  mem[(errFrameBase + 5) & 0xFFFFFF] = (ERR_CATCH_ADDR >>> 16) & 0xFF;
  write24(mem, ERR_SP_ADDR, errFrameBase);

  log(`errSP frame @ ${hex(errFrameBase)} -> errSP=${hex(read24(mem, ERR_SP_ADDR))}`);
  log(`FAKE_RET=${hex(FAKE_RET)}  ERR_CATCH=${hex(ERR_CATCH_ADDR)}`);

  // Set cpu.a = 0x00, cpu._hl = 9
  cpu.a = 0x00;
  cpu._hl = 9;

  // Run CreateReal
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let crSteps = 0;
  let crTerm = 'unknown';
  const recentPcs = [];

  const handlePc = (pc) => {
    const norm = pc & 0xFFFFFF;
    finalPc = norm;
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const crResult = executor.runFrom(CREATE_REAL_ENTRY, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { handlePc(pc); },
      onMissingBlock(pc) { handlePc(pc); },
    });
    crSteps = crResult.steps;
    crTerm = crResult.termination;
    finalPc = crResult.lastPc ?? finalPc;
  } catch (e) {
    if (e.message === '__RETURN_HIT__') {
      returnHit = true;
      finalPc = FAKE_RET;
      crTerm = 'FAKE_RET';
    } else if (e.message === '__ERR_CAUGHT__') {
      errCaught = true;
      finalPc = ERR_CATCH_ADDR;
      crTerm = 'ERR_CAUGHT';
    } else {
      throw e;
    }
  }

  const errNoAfter = mem[ERR_NO_ADDR] & 0xFF;
  const op1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op1Decoded = safeReadReal(memWrap, OP1_ADDR);

  log('');
  log('CreateReal results:');
  log(`  termination: ${crTerm}`);
  log(`  finalPc: ${hex(finalPc)}`);
  log(`  steps: ${crSteps}`);
  log(`  returnHit: ${returnHit}`);
  log(`  errCaught: ${errCaught}`);
  log(`  errNo after: ${hex(errNoAfter, 2)}`);
  log(`  OP1 post-call: [${op1PostHex}]`);
  log(`  OP1 decoded: ${String(op1Decoded)}`);
  log(`  A=${hex(cpu.a & 0xFF, 2)} F=${hex(cpu.f & 0xFF, 2)} HL=${hex(cpu.hl & 0xFFFFFF)} DE=${hex(cpu.de & 0xFFFFFF)}`);
  log(`  SP after: ${hex(cpu.sp & 0xFFFFFF)}`);
  log(`  errSP after: ${hex(read24(mem, ERR_SP_ADDR))}`);
  log(`  recent PCs: ${recentPcs.map(pc => hex(pc)).join(' ')}`);

  const ptrsAfterCR = dumpAllPointers(mem);
  log('');
  log('Pointers after CreateReal:');
  log(`  ${formatPointers(ptrsAfterCR)}`);
  log('');

  // Classification
  const isSentinel = !returnHit && !errCaught && finalPc === 0xFFFFFF && errNoAfter === 0x00;
  const passKind = returnHit ? 'FAKE_RET' : isSentinel ? 'SENTINEL_RETURN' : null;
  const classification = passKind ? 'PASS' : errCaught ? 'INFORMATIVE_FAIL' : 'BAD_FAIL';
  log(`result=${classification}${passKind ? ` (${passKind})` : ''}`);

  // ────────────────────────────────────────────────────────────────
  // Write report
  // ────────────────────────────────────────────────────────────────
  const lines = [];
  lines.push('# Phase 25U - Post-boot VAT/Heap Pointer Dump + CreateReal');
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push('Discover what OPBase/OPS/pTemp/progPtr/FPSbase/FPS values the OS sets after cold boot,');
  lines.push('check whether home-screen rendering initializes heap pointers, then attempt CreateReal.');
  lines.push('');

  lines.push('## Part A: Post-boot pointer dump');
  lines.push('');
  lines.push(`All heap pointers zero after boot: **${allZero ? 'YES' : 'NO'}**`);
  lines.push('');
  lines.push('| Pointer | Value |');
  lines.push('|---------|-------|');
  for (const key of ['OPBase', 'OPS', 'pTemp', 'progPtr', 'FPSbase', 'FPS', 'errSP', 'errNo']) {
    const v = key === 'errNo' ? hex(ptrsAfterBoot[key], 2) : hex(ptrsAfterBoot[key]);
    lines.push(`| ${key} | \`${v}\` |`);
  }
  lines.push('');
  lines.push(`Raw hex 0xD02580..0xD025B0: \`${hexBytes(mem, 0xD02580, 48)}\``);
  lines.push('');

  lines.push('## Part B: After home-screen render');
  lines.push('');
  lines.push(`Home render termination: ${homeTerm}`);
  lines.push('');
  lines.push('| Pointer | Before | After | Changed? |');
  lines.push('|---------|--------|-------|----------|');
  for (const key of ['OPBase', 'OPS', 'pTemp', 'progPtr', 'FPSbase', 'FPS']) {
    const b = hex(ptrsAfterBoot[key]);
    const a = hex(ptrsAfterHome[key]);
    const changed = ptrsAfterBoot[key] !== ptrsAfterHome[key] ? 'YES' : 'no';
    lines.push(`| ${key} | \`${b}\` | \`${a}\` | ${changed} |`);
  }
  lines.push('');

  lines.push('## Part C: CreateReal attempt');
  lines.push('');
  lines.push(`- Classification: **${classification}**${passKind ? ` (${passKind})` : ''}`);
  lines.push(`- termination: ${crTerm}`);
  lines.push(`- finalPc: \`${hex(finalPc)}\``);
  lines.push(`- steps: ${crSteps}`);
  lines.push(`- returnHit: ${returnHit}`);
  lines.push(`- errCaught: ${errCaught}`);
  lines.push(`- errNo after: \`${hex(errNoAfter, 2)}\``);
  lines.push(`- OP1 pre-call: \`[${op1PreHex}]\``);
  lines.push(`- OP1 post-call: \`[${op1PostHex}]\``);
  lines.push(`- OP1 decoded: ${String(op1Decoded)}`);
  lines.push(`- SP after: \`${hex(cpu.sp & 0xFFFFFF)}\``);
  lines.push(`- errSP after: \`${hex(read24(mem, ERR_SP_ADDR))}\``);
  lines.push('');
  if (seeded.length) {
    lines.push('VAT fallback seeds applied:');
    for (const s of seeded) lines.push(`- ${s}`);
    lines.push('');
  }

  lines.push('## Pointers after CreateReal');
  lines.push('');
  lines.push('| Pointer | Value |');
  lines.push('|---------|-------|');
  for (const key of ['OPBase', 'OPS', 'pTemp', 'progPtr', 'FPSbase', 'FPS', 'errSP', 'errNo']) {
    const v = key === 'errNo' ? hex(ptrsAfterCR[key], 2) : hex(ptrsAfterCR[key]);
    lines.push(`| ${key} | \`${v}\` |`);
  }
  lines.push('');

  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  log('');
  log(`report=${REPORT_PATH}`);

  process.exitCode = (classification === 'PASS' || classification === 'INFORMATIVE_FAIL') ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);

  const lines = [
    '# Phase 25U - FAILED',
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
