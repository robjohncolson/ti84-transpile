#!/usr/bin/env node

/**
 * Phase 134 — Trace GraphPars crash at 0x58C35B.
 *
 * Test A: Y1=X (token 0x58) — traces the last 20+ PCs before execution
 *         reaches an address > 0x3FFFFF (outside ROM).
 * Test B: Y1=1 (token 0x31) — same trace. If it also crashes, the problem
 *         is NOT the tX byte specifically.
 *
 * For each step in the trailing window we log: PC, HL, DE, BC, A, F, SP, IX, IY.
 * We also disassemble the instruction at the crash-source PC to identify
 * whether it's JP (HL), CALL (HL), RET, or something else.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';
import { decodeInstruction as decodeEz80 } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;

// Entry points
const GRAPHPARS_ENTRY = 0x09986C;
const MEMINIT_ENTRY = 0x09DEE0;
const MEMINIT_RET = 0x7FFFF6;

// OP registers
const OP1_ADDR = 0xd005f8;
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

// Pixel dimension addresses
const PIX_WIDE_P_ADDR = 0xD014FE;
const PIX_WIDE_M2_ADDR = 0xD01501;

// Draw state addresses
const DRAW_COLOR_CODE_ADDR = 0xD026AE;
const DRAW_FG_COLOR_ADDR = 0xD026AC;
const DRAW_BG_COLOR_ADDR = 0xD026AA;
const HOOKFLAGS3_ADDR = 0xD000B5;
const MODE_BYTE_ADDR = 0xD02AD4;

// Graph BCD real addresses
const XMIN_ADDR = 0xD01E33;
const XMAX_ADDR = 0xD01E3C;
const XSCL_ADDR = 0xD01E45;
const YMIN_ADDR = 0xD01E4E;
const YMAX_ADDR = 0xD01E57;
const YSCL_ADDR = 0xD01E60;
const XRES_ADDR = 0xD01E69;

// Graph mode
const GRAPHMODE_ADDR = 0xD01474;

// TI tokens
const EQUOBJ_TYPE = 0x03;
const TY1 = 0x10;
const TX = 0x58;
const T1 = 0x31; // digit "1"

const MAX_LOOP_ITER = 8192;

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const write24 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
};

const write16 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
};

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function wrapMem(rawMem) {
  return {
    write8(addr, val) { rawMem[addr] = val & 0xff; },
    read8(addr) { return rawMem[addr] & 0xff; },
  };
}

// ── Disassembler helper ───────────────────────────────────────────────────

function disassembleAt(addr) {
  if (addr >= 0x400000) return { mnemonic: '??? (outside ROM)', length: 1 };
  try {
    const instr = decodeEz80(romBytes, addr, true);
    return instr;
  } catch (e) {
    return { mnemonic: `??? (decode error: ${e.message})`, length: 1 };
  }
}

function disassembleRange(startAddr, endAddr) {
  let pc = startAddr;
  const lines = [];
  while (pc < endAddr && pc < 0x400000) {
    const instr = disassembleAt(pc);
    const bytes = hexBytes(romBytes, pc, instr.length);
    lines.push(`  ${hex(pc)}: ${bytes.padEnd(20)} ${instr.mnemonic || instr.tag || '???'}`);
    pc += instr.length;
  }
  return lines;
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedGraphRAM(mem) {
  write16(mem, PIX_WIDE_P_ADDR, 320);
  write16(mem, PIX_WIDE_M2_ADDR, 240);
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x001F);
  write16(mem, DRAW_FG_COLOR_ADDR, 0x001F);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1;
  mem[0xD00082] |= (1 << 4); // grfFuncM bit 4
}

function seedGraphWindow(mem) {
  const wrapped = wrapMem(mem);
  writeReal(wrapped, XMIN_ADDR, -10);
  writeReal(wrapped, XMAX_ADDR, 10);
  writeReal(wrapped, XSCL_ADDR, 1);
  writeReal(wrapped, YMIN_ADDR, -10);
  writeReal(wrapped, YMAX_ADDR, 10);
  writeReal(wrapped, YSCL_ADDR, 1);
  writeReal(wrapped, XRES_ADDR, 1);
  mem[GRAPHMODE_ADDR] = 0; // function mode
}

function seedMinimalErrFrame(cpu, mem, returnAddr) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, returnAddr);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
}

// ── Manual VAT entry construction ────────────────────────────────────────

function manualCreateEqu(mem, tokenByte, label) {
  const progPtr = read24(mem, PROGPTR_ADDR);
  const userMem = read24(mem, NEWDATA_PTR_ADDR);

  console.log(`  [${label}] Pre-create: progPtr=${hex(progPtr)} userMem=${hex(userMem)}`);

  // Equation data: 2-byte LE length prefix + token
  const equDataSize = 3;
  const dataAddr = userMem;

  write16(mem, dataAddr, 1);     // length = 1 token byte
  mem[dataAddr + 2] = tokenByte; // the token

  write24(mem, NEWDATA_PTR_ADDR, dataAddr + equDataSize);

  // VAT entry (6 bytes): grows downward from progPtr
  const vatEntrySize = 6;
  const newProgPtr = progPtr - vatEntrySize;

  mem[progPtr - 1] = TY1;           // name byte: tY1 = 0x10
  mem[progPtr - 2] = 1;             // name length = 1
  mem[progPtr - 3] = EQUOBJ_TYPE;   // type = EquObj = 0x03
  mem[progPtr - 4] = (dataAddr >> 16) & 0xff;
  mem[progPtr - 5] = (dataAddr >> 8) & 0xff;
  mem[progPtr - 6] = dataAddr & 0xff;

  write24(mem, PROGPTR_ADDR, newProgPtr);
  write24(mem, PTEMP_ADDR, newProgPtr);

  console.log(`  [${label}] VAT entry at ${hex(newProgPtr)}, data at ${hex(dataAddr)}`);
  console.log(`  [${label}] Data bytes: [${hexBytes(mem, dataAddr, equDataSize)}]`);

  return { dataAddr, vatAddr: newProgPtr };
}

// ── Tracing GraphPars run ────────────────────────────────────────────────

function traceGraphPars(label, mem, executor, cpu, budget) {
  console.log(`\n--- ${label} ---`);

  // Ring buffer of recent snapshots (PC + registers)
  const TRAIL_SIZE = 40; // keep last 40 to be safe
  const trail = [];
  let stepCount = 0;
  let crashPc = null;
  let crashFound = false;
  let returnHit = false;

  try {
    executor.runFrom(GRAPHPARS_ENTRY, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;

        // Snapshot current state BEFORE this block executes
        trail.push({
          step: stepCount,
          pc: norm,
          hl: cpu._hl,
          de: cpu._de,
          bc: cpu._bc,
          a: cpu.a,
          f: cpu.f,
          sp: cpu.sp,
          ix: cpu._ix,
          iy: cpu._iy,
        });
        if (trail.length > TRAIL_SIZE) trail.shift();

        if (norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
        if (norm > 0x3fffff && norm !== FAKE_RET) {
          crashPc = norm;
          crashFound = true;
          throw new Error('__CRASH__');
        }
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;

        trail.push({
          step: stepCount,
          pc: norm,
          hl: cpu._hl,
          de: cpu._de,
          bc: cpu._bc,
          a: cpu.a,
          f: cpu.f,
          sp: cpu.sp,
          ix: cpu._ix,
          iy: cpu._iy,
          missing: true,
        });
        if (trail.length > TRAIL_SIZE) trail.shift();

        if (norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
        if (norm > 0x3fffff && norm !== FAKE_RET) {
          crashPc = norm;
          crashFound = true;
          throw new Error('__CRASH__');
        }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__' && e?.message !== '__CRASH__') throw e;
  }

  console.log(`  Result: returnHit=${returnHit} crashFound=${crashFound} steps=${stepCount} crashPc=${hex(crashPc)}`);

  if (crashFound) {
    console.log(`\n  === CRASH TRAIL (last ${trail.length} steps) ===`);
    for (const snap of trail) {
      const miss = snap.missing ? ' [MISSING]' : '';
      console.log(
        `  step=${String(snap.step).padStart(5)} PC=${hex(snap.pc)}${miss}` +
        ` HL=${hex(snap.hl)} DE=${hex(snap.de)} BC=${hex(snap.bc)}` +
        ` A=${hex(snap.a, 2)} F=${hex(snap.f, 2)} SP=${hex(snap.sp)} IX=${hex(snap.ix)} IY=${hex(snap.iy)}`
      );
    }

    // Identify the instruction that caused the jump
    // The second-to-last entry is the block that transferred to the crash PC
    if (trail.length >= 2) {
      const sourcSnap = trail[trail.length - 2];
      const sourcePC = sourcSnap.pc;
      console.log(`\n  === SOURCE INSTRUCTION ANALYSIS ===`);
      console.log(`  Last valid PC before crash: ${hex(sourcePC)}`);

      if (sourcePC < 0x400000) {
        // Disassemble the block at sourcePC
        const lines = disassembleRange(sourcePC, Math.min(sourcePC + 32, 0x400000));
        console.log(`  Disassembly at source block:`);
        for (const line of lines) console.log(`  ${line}`);
      }

      // Check if crash PC matches HL at crash moment
      const crashSnap = trail[trail.length - 1];
      console.log(`\n  Crash PC: ${hex(crashSnap.pc)}`);
      console.log(`  HL at crash: ${hex(crashSnap.hl)}`);
      console.log(`  DE at crash: ${hex(crashSnap.de)}`);
      console.log(`  BC at crash: ${hex(crashSnap.bc)}`);

      if (crashSnap.pc === crashSnap.hl) {
        console.log(`  >>> MATCH: crash PC == HL — likely JP (HL) or CALL (HL)`);
      }
      if (crashSnap.pc === crashSnap.de) {
        console.log(`  >>> MATCH: crash PC == DE`);
      }

      // Check stack: was this a RET with a bad return address?
      // At crash time, SP points to the stack. If it was a RET, SP would have
      // been incremented by 3 already. The previous SP minus 3 is where the
      // bad address was.
      const prevSP = sourcSnap.sp;
      const stackVal = read24(mem, prevSP);
      console.log(`  Stack top at source (SP=${hex(prevSP)}): ${hex(stackVal)}`);
      if (stackVal === crashSnap.pc) {
        console.log(`  >>> MATCH: stack[SP] == crash PC — likely a RET instruction`);
      }

      // Also dump a few words from the stack
      console.log(`  Stack dump from SP=${hex(prevSP)}:`);
      for (let i = 0; i < 24; i += 3) {
        const addr = prevSP + i;
        const val = read24(mem, addr);
        console.log(`    [${hex(addr)}] = ${hex(val)}`);
      }
    }
  } else if (returnHit) {
    console.log(`  GraphPars returned normally after ${stepCount} steps.`);
    // Show last few PCs anyway
    console.log(`  Last ${Math.min(trail.length, 10)} PCs:`);
    const lastFew = trail.slice(-10);
    for (const snap of lastFew) {
      console.log(`  step=${snap.step} PC=${hex(snap.pc)} HL=${hex(snap.hl)} DE=${hex(snap.de)}`);
    }
  } else {
    console.log(`  GraphPars ran out of budget (${budget} steps) without returning or crashing.`);
    console.log(`  Last ${Math.min(trail.length, 20)} PCs:`);
    const lastFew = trail.slice(-20);
    for (const snap of lastFew) {
      const miss = snap.missing ? ' [MISSING]' : '';
      console.log(
        `  step=${snap.step} PC=${hex(snap.pc)}${miss}` +
        ` HL=${hex(snap.hl)} DE=${hex(snap.de)} SP=${hex(snap.sp)}`
      );
    }
  }

  return { returnHit, crashFound, crashPc, stepCount, trail };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 134: Trace GraphPars Crash ===');
  console.log('');

  // ── Setup runtime ──
  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.\n');

  // Save post-boot snapshot
  const memSnapshot = new Uint8Array(MEM_SIZE);
  memSnapshot.set(mem);

  // ═══════════════════════════════════════════════════════════════════════
  // Test A: Y1=X (tX = 0x58) — expect crash at 0x58C35B
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test A: Y1=X (token=0x58) ===');

  // Init from snapshot
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  // Run MEM_INIT
  console.log('  Running MEM_INIT...');
  let initReturn = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) { if (e?.message === '__RET__') initReturn = true; else throw e; }
  console.log(`  MEM_INIT done: returned=${initReturn}`);

  // Seed everything
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);

  // Set graphDraw dirty
  mem[0xD00083] |= 1;

  // Create Y1=X equation
  manualCreateEqu(mem, TX, 'Y1=X');

  // Prepare for GraphPars call
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Trace it
  const testA = traceGraphPars('Test A: GraphPars with Y1=X', mem, executor, cpu, 50000);

  // ═══════════════════════════════════════════════════════════════════════
  // Test B: Y1=1 (t1 = 0x31) — constant equation, no tX
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== Test B: Y1=1 (token=0x31, constant) ===');

  // Re-init from snapshot
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  // Run MEM_INIT
  console.log('  Running MEM_INIT...');
  let init2Return = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) { if (e?.message === '__RET__') init2Return = true; else throw e; }
  console.log(`  MEM_INIT done: returned=${init2Return}`);

  // Seed everything
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;

  // Create Y1=1 equation (token 0x31 instead of 0x58)
  manualCreateEqu(mem, T1, 'Y1=1');

  // Prepare for GraphPars call
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Trace it
  const testB = traceGraphPars('Test B: GraphPars with Y1=1', mem, executor, cpu, 50000);

  // ═══════════════════════════════════════════════════════════════════════
  // Test C: Y1=X with properly seeded errSP
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== Test C: Y1=X with errSP properly seeded ===');

  // Re-init from snapshot
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  // Run MEM_INIT
  console.log('  Running MEM_INIT...');
  let init3Return = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) { if (e?.message === '__RET__') init3Return = true; else throw e; }
  console.log(`  MEM_INIT done: returned=${init3Return}`);

  // Seed everything
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;

  // Create Y1=X equation
  manualCreateEqu(mem, TX, 'Y1=X (with errSP)');

  // Prepare for GraphPars call WITH error frame
  prepareCallState(cpu, mem);

  // Seed error frame: the error handler epilogue (0x061DBA) does:
  //   LD SP, (errSP)   -- restores SP from errSP
  //   POP AF            -- pops saved AF
  //   RET               -- returns to caller of the error setup
  // So we need errSP to point to a stack frame with: [saved_AF(3 bytes)] [return_addr(3 bytes)]
  // The return address should be FAKE_RET so we can catch the return.
  const ERR_HANDLER_RET = 0x7FFFF0;
  // Build error frame on stack
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);    // main return address (for the outer call)

  // Now set up the error recovery stack frame
  // errSP should point to where: [AF_saved (3 bytes)] [error_return_addr (3 bytes)]
  const errStackBase = cpu.sp - 12;
  write24(mem, errStackBase, 0x0040);      // saved AF (A=0, F=0x40)
  write24(mem, errStackBase + 3, FAKE_RET); // error return address -> FAKE_RET
  write24(mem, ERR_SP_ADDR, errStackBase);
  mem[ERR_NO_ADDR] = 0x00;

  console.log(`  errSP seeded: ${hex(errStackBase)}, points to [${hexBytes(mem, errStackBase, 6)}]`);
  console.log(`  Return addr on stack: ${hex(read24(mem, errStackBase + 3))}`);

  // Trace it
  const testC = traceGraphPars('Test C: GraphPars with Y1=X + errSP', mem, executor, cpu, 50000);

  // Also check what errNo says after the run
  console.log(`  errNo after run: ${hex(mem[ERR_NO_ADDR], 2)}`);

  // ═══════════════════════════════════════════════════════════════════════
  // Test D: Y1=1 with properly seeded errSP
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== Test D: Y1=1 with errSP properly seeded ===');

  // Re-init from snapshot
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  console.log('  Running MEM_INIT...');
  let init4Return = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) { if (e?.message === '__RET__') init4Return = true; else throw e; }
  console.log(`  MEM_INIT done: returned=${init4Return}`);

  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;

  manualCreateEqu(mem, T1, 'Y1=1 (with errSP)');

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  const errStackBase2 = cpu.sp - 12;
  write24(mem, errStackBase2, 0x0040);
  write24(mem, errStackBase2 + 3, FAKE_RET);
  write24(mem, ERR_SP_ADDR, errStackBase2);
  mem[ERR_NO_ADDR] = 0x00;

  console.log(`  errSP seeded: ${hex(errStackBase2)}`);

  const testD = traceGraphPars('Test D: GraphPars with Y1=1 + errSP', mem, executor, cpu, 50000);
  console.log(`  errNo after run: ${hex(mem[ERR_NO_ADDR], 2)}`);

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== SUMMARY ===');
  console.log(`Test A (Y1=X, no errSP): crashFound=${testA.crashFound} crashPc=${hex(testA.crashPc)} steps=${testA.stepCount} returnHit=${testA.returnHit}`);
  console.log(`Test B (Y1=1, no errSP): crashFound=${testB.crashFound} crashPc=${hex(testB.crashPc)} steps=${testB.stepCount} returnHit=${testB.returnHit}`);
  console.log(`Test C (Y1=X, with errSP): crashFound=${testC.crashFound} crashPc=${hex(testC.crashPc)} steps=${testC.stepCount} returnHit=${testC.returnHit}`);
  console.log(`Test D (Y1=1, with errSP): crashFound=${testD.crashFound} crashPc=${hex(testD.crashPc)} steps=${testD.stepCount} returnHit=${testD.returnHit}`);

  if (testA.crashFound && testB.crashFound) {
    console.log('\nBOTH crashed — the problem is NOT specific to the tX (0x58) byte.');
    console.log('Root cause is likely in GraphPars equation parsing or dispatch, not variable lookup.');
    if (testA.crashPc !== testB.crashPc) {
      console.log(`Different crash addresses: A=${hex(testA.crashPc)} B=${hex(testB.crashPc)}`);
      console.log('The crash address may be derived from equation token data.');
    }
  } else if (testA.crashFound && !testB.crashFound) {
    console.log('\nOnly Y1=X crashed — the problem IS specific to the tX byte / variable lookup.');
  } else if (!testA.crashFound && !testB.crashFound) {
    console.log('\nNeither crashed — the bug may have been fixed or the budget was too low.');
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
