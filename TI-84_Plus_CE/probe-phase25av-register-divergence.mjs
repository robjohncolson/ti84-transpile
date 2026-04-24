#!/usr/bin/env node

/**
 * Phase 25AV: Register State Divergence at ParseInp Entry.
 *
 * Captures ALL CPU registers at the moment PC hits 0x099914 (ParseInp entry)
 * in two scenarios (direct vs trampoline), diffs them, and confirms which
 * register/flag causes ParseInp to skip PushErrorHandler in the trampoline path.
 *
 * Scenario A: Control — direct ParseInp after prepareCallState
 * Scenario B: Trampoline — entry at 0x0586E3, SP adjusted
 * Scenario C: Direct ParseInp with trampoline's register state (confirm root cause)
 * Scenario D: Trampoline regs + control differing reg (confirm fix)
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
const MEMINIT_RET = 0x7ffff6;
const PARSEINP_ENTRY = 0x099914;
const TRAMPOLINE_CALL = 0x0586e3;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const SCRATCH_TOKEN_BASE = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0').toUpperCase()}`;
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

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
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

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function seedScenario(mem, cpu) {
  // Clear scratch area and write tokens
  mem.fill(0x00, SCRATCH_TOKEN_BASE, SCRATCH_TOKEN_BASE + 0x80);
  mem.set(INPUT_TOKENS, SCRATCH_TOKEN_BASE);

  // Set begPC/curPC/endPC — endPC points AT the last token byte (0x3F)
  write24(mem, BEGPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, CURPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, ENDPC_ADDR, SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1);

  // Clear OP1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  // Set up return address on stack
  write24(mem, cpu.sp, FAKE_RET);

  // Error frame: errSP at sp-6, with ERR_CATCH_ADDR as handler
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    mainSp: cpu.sp & 0xffffff,
    errFrameBase,
  };
}

// --- Register capture utilities ---

function decodeFlags(f) {
  return {
    S: (f >> 7) & 1,
    Z: (f >> 6) & 1,
    H: (f >> 4) & 1,
    PV: (f >> 2) & 1,
    N: (f >> 1) & 1,
    C: f & 1,
  };
}

function flagStr(f) {
  const fl = decodeFlags(f);
  return `[S=${fl.S} Z=${fl.Z} H=${fl.H} PV=${fl.PV} N=${fl.N} C=${fl.C}]`;
}

function captureRegs(cpu, mem) {
  return {
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    bc: cpu._bc & 0xffffff,
    de: cpu._de & 0xffffff,
    hl: cpu._hl & 0xffffff,
    ix: cpu._ix & 0xffffff,
    iy: cpu._iy & 0xffffff,
    sp: cpu.sp & 0xffffff,
    // RAM state
    d022be: mem[0xd022be] & 0xff,
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function printRegs(label, r) {
  console.log(`--- ${label} ---`);
  console.log(`  A=${hex(r.a, 2)} F=${hex(r.f, 2)} ${flagStr(r.f)} BC=${hex(r.bc)} DE=${hex(r.de)} HL=${hex(r.hl)}`);
  console.log(`  IX=${hex(r.ix)} IY=${hex(r.iy)} SP=${hex(r.sp)}`);
  console.log(`  RAM: D022BE=${hex(r.d022be, 2)} begPC=${hex(r.begPC)} curPC=${hex(r.curPC)} endPC=${hex(r.endPC)} errSP=${hex(r.errSP)} errNo=${hex(r.errNo, 2)}`);
}

// --- Run MEM_INIT for a given env ---
function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let done = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === (MEMINIT_RET & 0xffffff)) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === (MEMINIT_RET & 0xffffff)) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__MEMINIT_RET__') done = true;
    else throw e;
  }
  if (!done) throw new Error('MEM_INIT did not return');
}

// --- Capture registers at ParseInp entry for a given starting address and SP ---
function captureAtParseInp(executor, cpu, mem, entryPC, budget) {
  let regs = null;
  try {
    executor.runFrom(entryPC, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === PARSEINP_ENTRY && regs === null) {
          regs = captureRegs(cpu, mem);
          throw new Error('__CAPTURE__');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === PARSEINP_ENTRY && regs === null) {
          regs = captureRegs(cpu, mem);
          throw new Error('__CAPTURE__');
        }
      },
    });
  } catch (e) {
    if (e?.message !== '__CAPTURE__') throw e;
  }
  return regs;
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== REGISTER STATE DIVERGENCE AT PARSEINP ENTRY ===');
  log();

  // ========== Scenario A: Control (direct ParseInp) ==========
  log('Setting up Scenario A: Control (direct ParseInp)...');
  {
    var envA = createEnv();
    coldBoot(envA.executor, envA.cpu, envA.mem);
    runMemInit(envA.executor, envA.cpu, envA.mem);
    prepareCallState(envA.cpu, envA.mem);
    seedScenario(envA.mem, envA.cpu);
  }

  // Capture at ParseInp entry — for direct call, entry IS ParseInp
  var controlRegs = captureAtParseInp(envA.executor, envA.cpu, envA.mem, PARSEINP_ENTRY, 10000);
  if (!controlRegs) {
    log('ERROR: Scenario A failed to reach ParseInp entry!');
    return;
  }
  printRegs('Scenario A: Control (direct ParseInp)', controlRegs);
  log();

  // ========== Scenario B: Trampoline (via 0x0586E3) ==========
  log('Setting up Scenario B: Trampoline (via 0x0586E3)...');
  {
    var envB = createEnv();
    coldBoot(envB.executor, envB.cpu, envB.mem);
    runMemInit(envB.executor, envB.cpu, envB.mem);
    prepareCallState(envB.cpu, envB.mem);
    seedScenario(envB.mem, envB.cpu);

    // SP adjustment for extra CALL frame
    envB.cpu.sp = STACK_RESET_TOP - 9; // 0xD1A875
    // Re-write return address at new SP
    write24(envB.mem, envB.cpu.sp, FAKE_RET);
    // Re-write error frame below new SP
    const errFrameBase = (envB.cpu.sp - 6) & 0xffffff;
    envB.mem.fill(0x00, errFrameBase, errFrameBase + 6);
    write24(envB.mem, errFrameBase + 3, ERR_CATCH_ADDR);
    write24(envB.mem, ERR_SP_ADDR, errFrameBase);
  }

  var trampolineRegs = captureAtParseInp(envB.executor, envB.cpu, envB.mem, TRAMPOLINE_CALL, 10000);
  if (!trampolineRegs) {
    log('ERROR: Scenario B failed to reach ParseInp entry!');
    return;
  }
  printRegs('Scenario B: Trampoline (via 0x0586E3)', trampolineRegs);
  log();

  // ========== DIFF ==========
  log('--- DIFF ---');
  const regNames = ['a', 'f', 'bc', 'de', 'hl', 'ix', 'iy', 'sp'];
  const ramNames = ['d022be', 'begPC', 'curPC', 'endPC', 'errSP', 'errNo'];
  const differing = [];

  for (const name of regNames) {
    const cv = controlRegs[name];
    const tv = trampolineRegs[name];
    const width = (name === 'a' || name === 'f') ? 2 : 6;
    if (cv === tv) {
      log(`  ${name.toUpperCase().padEnd(6)}: MATCH (${hex(cv, width)})`);
    } else {
      log(`  ${name.toUpperCase().padEnd(6)}: **DIFFER** control=${hex(cv, width)} trampoline=${hex(tv, width)}`);
      differing.push(name);
    }
  }

  // Flag bit-level diff if F differs
  if (controlRegs.f !== trampolineRegs.f) {
    const cf = decodeFlags(controlRegs.f);
    const tf = decodeFlags(trampolineRegs.f);
    log();
    log('  Flag bit-level diff:');
    for (const bit of ['S', 'Z', 'H', 'PV', 'N', 'C']) {
      if (cf[bit] === tf[bit]) {
        log(`    ${bit.padEnd(3)}: MATCH (${cf[bit]})`);
      } else {
        log(`    ${bit.padEnd(3)}: **DIFFER** control=${cf[bit]} trampoline=${tf[bit]}`);
      }
    }
  }

  log();
  log('  RAM:');
  for (const name of ramNames) {
    const cv = controlRegs[name];
    const tv = trampolineRegs[name];
    const width = (name === 'errNo' || name === 'd022be') ? 2 : 6;
    if (cv === tv) {
      log(`  ${name.padEnd(8)}: MATCH (${hex(cv, width)})`);
    } else {
      log(`  ${name.padEnd(8)}: **DIFFER** control=${hex(cv, width)} trampoline=${hex(tv, width)}`);
      differing.push('ram:' + name);
    }
  }
  log();

  if (differing.length === 0) {
    log('NO REGISTER DIFFERENCES FOUND — something else causes the divergence.');
    return;
  }

  log(`Differing: ${differing.join(', ')}`);
  log();

  // ========== Scenario C: Direct ParseInp with trampoline regs ==========
  log('--- Scenario C: Direct ParseInp with trampoline regs ---');
  {
    var envC = createEnv();
    coldBoot(envC.executor, envC.cpu, envC.mem);
    runMemInit(envC.executor, envC.cpu, envC.mem);
    prepareCallState(envC.cpu, envC.mem);
    seedScenario(envC.mem, envC.cpu);

    // Override all differing registers to trampoline values
    for (const name of differing) {
      if (name.startsWith('ram:')) continue; // handle RAM separately if needed
      switch (name) {
        case 'a': envC.cpu.a = trampolineRegs.a; break;
        case 'f': envC.cpu.f = trampolineRegs.f; break;
        case 'bc': envC.cpu._bc = trampolineRegs.bc; break;
        case 'de': envC.cpu._de = trampolineRegs.de; break;
        case 'hl': envC.cpu._hl = trampolineRegs.hl; break;
        case 'ix': envC.cpu._ix = trampolineRegs.ix; break;
        case 'iy': envC.cpu._iy = trampolineRegs.iy; break;
        case 'sp': envC.cpu.sp = trampolineRegs.sp; break;
      }
    }
  }

  let stepsC = 0;
  let termC = 'unknown';
  try {
    const result = envC.executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
      },
    });
    stepsC = result.steps ?? 0;
    termC = result.termination ?? 'budget';
  } catch (e) {
    if (e?.message === '__RETURN_HIT__') termC = 'return_hit';
    else if (e?.message === '__ERR_CAUGHT__') termC = 'err_caught';
    else throw e;
  }

  let op1C;
  try { op1C = readReal(wrapMem(envC.mem), OP1_ADDR); } catch { op1C = 'error'; }
  const errNoC = envC.mem[ERR_NO_ADDR] & 0xff;
  const passC = op1C === 5;
  log(`  Steps: ${stepsC}, OP1=${op1C}, errNo=${hex(errNoC, 2)}, termination=${termC} → ${passC ? 'PASS' : 'FAIL'} (${passC ? 'unexpected' : 'confirms root cause'})`);
  log();

  // ========== Scenario D: Trampoline regs + control differing reg ==========
  log('--- Scenario D: Trampoline regs + control [differing reg] ---');
  {
    var envD = createEnv();
    coldBoot(envD.executor, envD.cpu, envD.mem);
    runMemInit(envD.executor, envD.cpu, envD.mem);
    prepareCallState(envD.cpu, envD.mem);
    seedScenario(envD.mem, envD.cpu);

    // Set ALL registers to trampoline values
    envD.cpu.a = trampolineRegs.a;
    envD.cpu.f = trampolineRegs.f;
    envD.cpu._bc = trampolineRegs.bc;
    envD.cpu._de = trampolineRegs.de;
    envD.cpu._hl = trampolineRegs.hl;
    envD.cpu._ix = trampolineRegs.ix;
    envD.cpu._iy = trampolineRegs.iy;
    // Don't override SP — keep prepareCallState SP for direct ParseInp
    // (trampoline SP differs because of the extra CALL frame, not because of a bug)

    // Reset ONLY the differing registers back to control values
    for (const name of differing) {
      if (name.startsWith('ram:')) continue;
      if (name === 'sp') continue; // SP is structural, not a flag issue
      switch (name) {
        case 'a': envD.cpu.a = controlRegs.a; break;
        case 'f': envD.cpu.f = controlRegs.f; break;
        case 'bc': envD.cpu._bc = controlRegs.bc; break;
        case 'de': envD.cpu._de = controlRegs.de; break;
        case 'hl': envD.cpu._hl = controlRegs.hl; break;
        case 'ix': envD.cpu._ix = controlRegs.ix; break;
        case 'iy': envD.cpu._iy = controlRegs.iy; break;
      }
    }
  }

  let stepsD = 0;
  let termD = 'unknown';
  try {
    const result = envD.executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: 2000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
      },
    });
    stepsD = result.steps ?? 0;
    termD = result.termination ?? 'budget';
  } catch (e) {
    if (e?.message === '__RETURN_HIT__') termD = 'return_hit';
    else if (e?.message === '__ERR_CAUGHT__') termD = 'err_caught';
    else throw e;
  }

  let op1D;
  try { op1D = readReal(wrapMem(envD.mem), OP1_ADDR); } catch { op1D = 'error'; }
  const errNoD = envD.mem[ERR_NO_ADDR] & 0xff;
  const passD = op1D === 5;
  log(`  Steps: ${stepsD}, OP1=${op1D}, errNo=${hex(errNoD, 2)}, termination=${termD} → ${passD ? 'PASS (confirms fix)' : 'FAIL'}`);
  log();

  // ========== Final Verdict ==========
  log('=== VERDICT ===');
  log(`Differing registers at ParseInp entry: ${differing.join(', ')}`);
  if (!passC && passD) {
    log('ROOT CAUSE CONFIRMED: the differing register(s) gate the PushErrorHandler branch.');
    log('Setting trampoline values on a direct call reproduces the failure (Scenario C).');
    log('Resetting them to control values fixes it (Scenario D).');
    if (differing.includes('f')) {
      const cf = decodeFlags(controlRegs.f);
      const tf = decodeFlags(trampolineRegs.f);
      const flagDiffs = [];
      for (const bit of ['S', 'Z', 'H', 'PV', 'N', 'C']) {
        if (cf[bit] !== tf[bit]) flagDiffs.push(`${bit}: control=${cf[bit]} trampoline=${tf[bit]}`);
      }
      log(`Flag bits that differ: ${flagDiffs.join(', ')}`);
      log('FIX: ensure these flag bits match the control values before ParseInp entry.');
    }
  } else if (passC && !passD) {
    log('UNEXPECTED: trampoline regs pass but resetting diffs fails. Investigate further.');
  } else if (!passC && !passD) {
    log('PARTIAL: trampoline regs reproduce failure but resetting diffs does NOT fix it.');
    log('There may be additional state differences beyond CPU registers.');
  } else {
    log('UNEXPECTED: both scenarios pass. The register difference may not be the root cause.');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
