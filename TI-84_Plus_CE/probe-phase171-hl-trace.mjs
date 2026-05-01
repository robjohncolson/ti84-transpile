#!/usr/bin/env node

/**
 * Phase 171 - HL Register Trace During gcd(12,8)
 *
 * Traces every HL change at block boundaries to find where the transpiled HL
 * diverges from expected. The divergence at step 1422 (block 0x08292B) shows
 * HL=0xD1AA24 (transpiled) vs 0xD1AA2D (reference) — a 9-byte difference
 * suggesting one missing or extra FPS push.
 *
 * Also decodes ROM instructions in 0x082900-0x082940 to understand PushRealO1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const ROM_TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
  if (!fs.existsSync(ROM_TRANSPILED_GZ_PATH)) {
    throw new Error('ROM.transpiled.js and ROM.transpiled.js.gz both missing.');
  }
  console.log('ROM.transpiled.js not found — gunzipping...');
  const { execSync } = await import('node:child_process');
  execSync(`gunzip -kf "${ROM_TRANSPILED_GZ_PATH}"`, { stdio: 'inherit' });
  console.log('Gunzip done.');
}

const romBytes = fs.readFileSync(ROM_BIN_PATH);
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;

if (!BLOCKS) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

// ============================================================================
// Helpers
// ============================================================================

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const hexByte = (v) => (v & 0xff).toString(16).toUpperCase().padStart(2, '0');

function read24(mem, addr) {
  return (mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (b) => b & 0xff);
}

function formatBytes(bytes) {
  return bytes.map((b) => hexByte(b)).join(' ');
}

// ============================================================================
// ROM instruction decoder — decode a sequence of instructions starting at pc
// Returns array of { pc, length, text }
// ============================================================================

function decodeRomBlock(startPc, maxInstrs = 20) {
  const instrs = [];
  let pc = startPc;

  for (let i = 0; i < maxInstrs; i++) {
    let instr;
    try {
      instr = decodeInstruction(romBytes, pc, 'adl');
    } catch (e) {
      instrs.push({ pc, length: 1, text: `<decode error: ${e.message}>` });
      break;
    }

    if (!instr) {
      instrs.push({ pc, length: 1, text: '<null decode>' });
      break;
    }

    // Format the instruction as a readable string
    const byteStr = formatBytes(readBytes(romBytes, pc, instr.length));
    const text = instrToString(instr);
    instrs.push({ pc, length: instr.length, text, byteStr });

    pc += instr.length;

    // Stop at control-flow instructions
    const tag = instr.tag ?? '';
    if (
      tag === 'ret' || tag === 'retn' || tag === 'reti' ||
      tag === 'ret-conditional' ||
      tag === 'jp' || tag === 'jp-conditional' || tag === 'jp-indirect' ||
      tag === 'jr' || tag === 'jr-conditional' ||
      tag === 'call' || tag === 'call-conditional' ||
      tag === 'rst' || tag === 'halt'
    ) {
      break;
    }
  }

  return instrs;
}

function instrToString(instr) {
  const tag = instr.tag ?? 'unknown';

  switch (tag) {
    case 'ld-reg-reg':    return `LD ${instr.dest}, ${instr.src}`;
    case 'ld-reg-imm':    return `LD ${instr.dest}, ${hex(instr.value, 2)}`;
    case 'ld-reg-ind':    return `LD ${instr.dest}, (${instr.src ?? 'HL'})`;
    case 'ld-ind-reg':    return `LD (${instr.dest ?? 'HL'}), ${instr.src}`;
    case 'ld-pair-imm':   return `LD ${instr.pair}, ${hex(instr.value)}`;
    case 'ld-pair-mem':   return `LD ${instr.pair}, (${hex(instr.address)})`;
    case 'ld-mem-pair':   return `LD (${hex(instr.address)}), ${instr.pair}`;
    case 'ld-mem-a':      return `LD (${hex(instr.address)}), A`;
    case 'ld-a-mem':      return `LD A, (${hex(instr.address)})`;
    case 'ld-ind-imm':    return `LD (HL), ${hex(instr.value, 2)}`;
    case 'ld-a-ind-pair': return `LD A, (${instr.pair})`;
    case 'ld-ind-pair-a': return `LD (${instr.pair}), A`;
    case 'ld-indexed':    return `LD ${instr.dest}, (${instr.indexRegister}+${instr.displacement})`;
    case 'ld-indexed-imm': return `LD (${instr.indexRegister}+${instr.displacement}), ${hex(instr.value, 2)}`;
    case 'ld-indexed-reg': return `LD (${instr.indexRegister}+${instr.displacement}), ${instr.src}`;
    case 'ld-pair-indexed': return `LD ${instr.pair}, (${instr.indexRegister}+${instr.displacement})`;
    case 'ld-indexed-pair': return `LD (${instr.indexRegister}+${instr.displacement}), ${instr.pair}`;
    case 'ld-pair-ind':   return `LD ${instr.pair}, (${instr.src})`;
    case 'ld-ind-pair':   return `LD (${instr.dest}), ${instr.pair}`;
    case 'ld-special':    return `LD ${instr.dest ?? '?'}, ${instr.src ?? '?'}`;
    case 'ld-mb-a':       return `LD MB, A`;
    case 'ld-a-mb':       return `LD A, MB`;
    case 'push':          return `PUSH ${instr.pair}`;
    case 'pop':           return `POP ${instr.pair}`;
    case 'ex-af':         return `EX AF, AF'`;
    case 'exx':           return `EXX`;
    case 'ex-de-hl':      return `EX DE, HL`;
    case 'ex-sp-hl':      return `EX (SP), HL`;
    case 'ex-sp-pair':    return `EX (SP), ${instr.pair}`;
    case 'inc-reg':       return `INC ${instr.reg}`;
    case 'dec-reg':       return `DEC ${instr.reg}`;
    case 'inc-pair':      return `INC ${instr.pair}`;
    case 'dec-pair':      return `DEC ${instr.pair}`;
    case 'inc-ixd':       return `INC (${instr.indexRegister}+${instr.displacement})`;
    case 'dec-ixd':       return `DEC (${instr.indexRegister}+${instr.displacement})`;
    case 'alu-reg':       return `${instr.op.toUpperCase()} A, ${instr.src}`;
    case 'alu-imm':       return `${instr.op.toUpperCase()} A, ${hex(instr.value, 2)}`;
    case 'alu-ixd':       return `${instr.op.toUpperCase()} A, (${instr.indexRegister}+${instr.displacement})`;
    case 'alu-ind':       return `${instr.op.toUpperCase()} A, (HL)`;
    case 'add-pair':      return `ADD ${instr.dest}, ${instr.src}`;
    case 'sbc-pair':      return `SBC HL, ${instr.src}`;
    case 'adc-pair':      return `ADC HL, ${instr.src}`;
    case 'neg':           return `NEG`;
    case 'cpl':           return `CPL`;
    case 'scf':           return `SCF`;
    case 'ccf':           return `CCF`;
    case 'daa':           return `DAA`;
    case 'rla':           return `RLA`;
    case 'rra':           return `RRA`;
    case 'rlca':          return `RLCA`;
    case 'rrca':          return `RRCA`;
    case 'rotate-reg':    return `${instr.op.toUpperCase()} ${instr.reg}`;
    case 'rotate-ind':    return `${instr.op.toUpperCase()} (${instr.indirectRegister})`;
    case 'bit-test':      return `BIT ${instr.bit}, ${instr.reg}`;
    case 'bit-test-ind':  return `BIT ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-res':       return `RES ${instr.bit}, ${instr.reg}`;
    case 'bit-res-ind':   return `RES ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-set':       return `SET ${instr.bit}, ${instr.reg}`;
    case 'bit-set-ind':   return `SET ${instr.bit}, (${instr.indirectRegister})`;
    case 'rld':           return `RLD`;
    case 'rrd':           return `RRD`;
    case 'ldi':           return `LDI`;
    case 'ldir':          return `LDIR`;
    case 'ldd':           return `LDD`;
    case 'lddr':          return `LDDR`;
    case 'mlt':           return `MLT ${instr.reg}`;
    case 'lea':           return `LEA ${instr.dest}, ${instr.base}+${instr.displacement}`;
    case 'call':          return `CALL ${hex(instr.target)}`;
    case 'call-conditional': return `CALL ${instr.condition}, ${hex(instr.target)}`;
    case 'ret':           return `RET`;
    case 'retn':          return `RETN`;
    case 'reti':          return `RETI`;
    case 'ret-conditional': return `RET ${instr.condition}`;
    case 'jp':            return `JP ${hex(instr.target)}`;
    case 'jp-conditional': return `JP ${instr.condition}, ${hex(instr.target)}`;
    case 'jp-indirect':   return `JP (${instr.register ?? 'HL'})`;
    case 'jr':            return `JR ${hex(instr.target)}`;
    case 'jr-conditional': return `JR ${instr.condition}, ${hex(instr.target)}`;
    case 'djnz':          return `DJNZ ${hex(instr.target)}`;
    case 'rst':           return `RST ${hex(instr.target, 2)}`;
    case 'halt':          return `HALT`;
    case 'nop':           return `NOP`;
    case 'di':            return `DI`;
    case 'ei':            return `EI`;
    case 'in0':           return `IN0 ${instr.reg ?? 'A'}, (${hex(instr.port ?? 0, 2)})`;
    case 'out0':          return `OUT0 (${hex(instr.port ?? 0, 2)}), ${instr.reg ?? 'A'}`;
    case 'in-reg':        return `IN ${instr.reg}, (C)`;
    case 'out-reg':       return `OUT (C), ${instr.reg}`;
    case 'stmix':         return `STMIX`;
    case 'rsmix':         return `RSMIX`;
    case 'tst-reg':       return `TST A, ${instr.reg}`;
    case 'tst-imm':       return `TST A, ${hex(instr.value, 2)}`;
    case 'tst-ind':       return `TST A, (HL)`;
    default:              return `<${tag}>`;
  }
}

// ============================================================================
// Constants
// ============================================================================

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;
const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPS_ADDR = 0xd02593;
const OPBASE_ADDR = 0xd02590;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;
const FP_CATEGORY_ADDR = 0xd0060e;
const GCD_CATEGORY = 0x28;
const ERR_SP_ADDR = 0xd008e0;
const ERR_NO_ADDR = 0xd008df;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const FPS_CLEAN_AREA = 0xd1aa00;
const GCD_ENTRY = 0x068d3d;
const MAX_LOOP_ITER = 8192;
const MEMINIT_BUDGET = 100000;
const MAX_STEPS = 2000;

// ============================================================================
// Runtime setup (same pattern as instr-compare)
// ============================================================================

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
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
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

function seedGcdFpState(mem, op1Bytes, op2Bytes) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  for (let i = 0; i < 9; i++) mem[OP1_ADDR + i] = op1Bytes[i];
  for (let i = 0; i < 9; i++) mem[OP2_ADDR + i] = op2Bytes[i];
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const { executor, cpu, mem } = runtime;
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let memInitOk = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET, maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (err) {
    if (err?.message === '__RET__') memInitOk = true;
    else throw err;
  }
  return { ...runtime, memInitOk };
}

// ============================================================================
// Section 0: Decode ROM at 0x082900-0x082940 (PushRealO1 area)
// ============================================================================

function dumpFpsPushRegion() {
  console.log('--- SECTION 0: ROM DISASSEMBLY 0x082900-0x082940 (FPS Push area) ---');
  console.log('');

  // Decode block starting at several candidate entry points
  const entryPoints = [0x082900, 0x082920, 0x082940, 0x082961, 0x08292b];
  const printed = new Set();

  for (const ep of entryPoints) {
    if (printed.has(ep)) continue;
    console.log(`  Entry 0x${ep.toString(16).toUpperCase()}:`);
    const instrs = decodeRomBlock(ep, 30);
    for (const instr of instrs) {
      if (printed.has(instr.pc)) continue;
      printed.add(instr.pc);
      console.log(
        `    ${hex(instr.pc)}: [${instr.byteStr.padEnd(14)}] ${instr.text}`
      );
    }
    console.log('');
  }
}

// ============================================================================
// Main probe: trace HL changes at every block boundary
// ============================================================================

function runHlTrace(runtime) {
  console.log('='.repeat(80));
  console.log('PHASE 171: HL REGISTER TRACE DURING gcd(12,8)');
  console.log('='.repeat(80));
  console.log('');

  const { mem, executor, cpu } = runtime;

  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 12.0
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 8.0

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, op1Bytes, op2Bytes);

  // Push OP2 to FPS before gcd entry (same as instr-compare)
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Copy = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) mem[fpsPtr + i] = op2Copy[i];
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log(`Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}]`);
  console.log(`Entry FPS: ${hex(read24(mem, FPS_ADDR))} (base=${hex(read24(mem, FPSBASE_ADDR))})`);
  console.log('');

  // Collect all HL values at block entry.
  // Pattern: pendingPrev captures the pc of the block we JUST entered.
  // When the NEXT block fires, we know the HL after pendingPrev's block ran.
  const hlChanges = [];     // All blocks where HL changed
  const allBlocks = [];     // Every block entry: { step, pc, hlBefore }
  // Near-divergence window: steps 1400-1450
  const windowEntries = [];

  let stepCount = 0;
  let outcome = 'budget';
  let prevHL = cpu._hl & 0xffffff;  // HL at gcd entry
  let prevPC = GCD_ENTRY;
  let prevStep = 0;

  // FPS pointer track: read FPS pointer at each block entry
  // so we can spot the exact block that advances/doesn't advance FPS.
  let prevFPS = read24(mem, FPS_ADDR);

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        const currentHL = cpu._hl & 0xffffff;
        const currentFPS = read24(mem, FPS_ADDR);

        const entry = {
          step: stepCount,
          pc: norm,
          hl: currentHL,
          fps: currentFPS,
        };
        allBlocks.push(entry);

        // Detect HL change: compare against what HL was when the previous block STARTED
        if (currentHL !== prevHL) {
          // Decode the block that just ran (prevPC) to show what changed HL
          const instrList = decodeRomBlock(prevPC, 30);
          const hlChangedByInstrs = instrList
            .filter(ins => hlModifiesHl(ins))
            .map(ins => ins.text)
            .join(', ') || '(none decoded or out-of-block branch)';

          hlChanges.push({
            step: stepCount,
            blockThatRanPC: prevPC,
            hlBefore: prevHL,
            hlAfter: currentHL,
            delta: (currentHL - prevHL) & 0xffffff,
            currentBlockPC: norm,
            hlRelevantInstrs: hlChangedByInstrs,
          });
        }

        // Detect FPS change
        if (currentFPS !== prevFPS) {
          // Note: we log this inside the near-window section too
        }

        // Near-divergence window: steps 1400-1450
        if (stepCount >= 1395 && stepCount <= 1455) {
          windowEntries.push({
            step: stepCount,
            pc: norm,
            hl: currentHL,
            fps: currentFPS,
            hlChanged: currentHL !== prevHL,
            fpsChanged: currentFPS !== prevFPS,
            prevPC,
          });
        }

        prevHL = currentHL;
        prevFPS = currentFPS;
        prevPC = norm;
        prevStep = stepCount;
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        prevPC = norm;
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else {
      outcome = 'threw';
      console.log(`Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const finalFPS = read24(mem, FPS_ADDR);

  // --- Section 1: All HL changes ---
  console.log('--- SECTION 1: ALL HL CHANGES (every block where HL changed) ---');
  console.log(`Total blocks visited: ${allBlocks.length}`);
  console.log(`Total HL changes: ${hlChanges.length}`);
  console.log('');

  if (hlChanges.length > 0) {
    console.log('  step | Block that ran    | HL before  | HL after   | Delta      | Relevant instrs');
    console.log('  ' + '-'.repeat(100));
    for (const ch of hlChanges) {
      const deltaStr = (ch.delta <= 0x7fffff)
        ? `+${ch.delta}`
        : `-${(0x1000000 - ch.delta)}`;
      console.log(
        `  ${String(ch.step).padStart(4)} | ${hex(ch.blockThatRanPC)} -> ${hex(ch.currentBlockPC)} | ` +
        `${hex(ch.hlBefore)} | ${hex(ch.hlAfter)} | ${deltaStr.padEnd(11)}| ${ch.hlRelevantInstrs}`
      );
    }
  } else {
    console.log('  No HL changes detected.');
  }

  console.log('');

  // --- Section 2: FPS-related HL activity ---
  console.log('--- SECTION 2: FPS POINTER ACTIVITY (FPS addr=0xD0258D) ---');
  const fpsBase = read24(mem, FPSBASE_ADDR);
  console.log(`FPS base: ${hex(fpsBase)}, final FPS ptr: ${hex(finalFPS)}`);
  console.log(`FPS growth: ${finalFPS - fpsBase} bytes (${(finalFPS - fpsBase) / 9} FP values)`);
  console.log('');

  // Find all blocks that changed FPS pointer
  const fpsChanges = [];
  let lastFPS = read24(mem, FPSBASE_ADDR); // initial FPS before gcd
  // We need to walk allBlocks and correlate FPS changes
  // allBlocks[i].fps was captured BEFORE the block ran.
  // So when allBlocks[i+1].fps != allBlocks[i].fps, block i changed FPS.
  for (let i = 1; i < allBlocks.length; i++) {
    const prevEntry = allBlocks[i - 1];
    const currEntry = allBlocks[i];
    if (currEntry.fps !== prevEntry.fps) {
      const fpsDelta = (currEntry.fps - prevEntry.fps) & 0xffffff;
      const fpsSignedDelta = fpsDelta <= 0x7fffff ? fpsDelta : fpsDelta - 0x1000000;
      fpsChanges.push({
        step: currEntry.step,
        blockPC: prevEntry.pc,    // the block that ran and changed FPS
        nextBlockPC: currEntry.pc,
        fpsBefore: prevEntry.fps,
        fpsAfter: currEntry.fps,
        fpsDelta: fpsSignedDelta,
      });
    }
  }

  if (fpsChanges.length > 0) {
    console.log(`  FPS pointer changed ${fpsChanges.length} time(s):`);
    console.log('');
    console.log('  step | Block PC  | FPS before | FPS after  | Delta');
    console.log('  ' + '-'.repeat(70));
    for (const fc of fpsChanges) {
      console.log(
        `  ${String(fc.step).padStart(4)} | ${hex(fc.blockPC)} | ${hex(fc.fpsBefore)} | ${hex(fc.fpsAfter)} | ${fc.fpsDelta > 0 ? '+' : ''}${fc.fpsDelta}`
      );
    }
  } else {
    console.log('  No FPS pointer changes detected.');
  }

  console.log('');

  // --- Section 3: Near-divergence window (steps 1395-1455) ---
  console.log('--- SECTION 3: NEAR-DIVERGENCE WINDOW (steps 1395-1455) ---');
  console.log('  Divergence: step 1422 block 0x08292B, HL should be 0xD1AA2D but got 0xD1AA24');
  console.log('');

  if (windowEntries.length > 0) {
    console.log('  step | PC       | HL       | FPS      | HL-change? | FPS-change? | (block ran)');
    console.log('  ' + '-'.repeat(95));
    for (const w of windowEntries) {
      const hlMark = w.hlChanged ? '  *** HL CHANGED' : '';
      const fpsMark = w.fpsChanged ? '  *** FPS CHANGED' : '';
      console.log(
        `  ${String(w.step).padStart(4)} | ${hex(w.pc)} | ${hex(w.hl)} | ${hex(w.fps)}` +
        ` | ${w.hlChanged ? 'YES' : 'no '} | ${w.fpsChanged ? 'YES' : 'no '} ` +
        `| (prev ${hex(w.prevPC)})${hlMark}${fpsMark}`
      );
    }
  } else {
    console.log('  No entries in window (execution ended before step 1395?)');
  }

  console.log('');

  // --- Section 4: Decode the block that visits 0x08292B ---
  console.log('--- SECTION 4: ROM DISASSEMBLY OF BLOCKS AROUND 0x08292B ---');
  console.log('');

  const blocksToDecode = [0x082961, 0x08292b, 0x08293a, 0x082900, 0x082920];
  for (const bp of blocksToDecode) {
    console.log(`  Block ${hex(bp)}:`);
    const instrs = decodeRomBlock(bp, 20);
    for (const ins of instrs) {
      console.log(`    ${hex(ins.pc)}: [${ins.byteStr.padEnd(14)}] ${ins.text}`);
    }
    console.log('');
  }

  // --- Section 5: HL values specifically at block 0x08292B visits ---
  console.log('--- SECTION 5: ALL VISITS TO BLOCK 0x08292B ---');
  const targetPC = 0x08292b;
  const visits = allBlocks.filter(e => e.pc === targetPC);
  if (visits.length > 0) {
    console.log(`  Block 0x08292B visited ${visits.length} time(s):`);
    console.log('');
    console.log('  step | HL at entry | FPS at entry');
    console.log('  ' + '-'.repeat(50));
    for (const v of visits) {
      console.log(`  ${String(v.step).padStart(4)} | ${hex(v.hl)} | ${hex(v.fps)}`);
    }
  } else {
    console.log('  Block 0x08292B never visited in this run.');
  }

  console.log('');

  // --- Section 6: Results ---
  console.log('--- SECTION 6: RESULTS ---');
  console.log(`Outcome: ${outcome}`);
  console.log(`Steps: ${stepCount}`);
  console.log(`Error: ${hexByte(errNo)}`);
  console.log(`Final OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log(`Final OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}]`);
  console.log(`Final FPS: ${hex(finalFPS)}`);
  console.log('');
}

// ============================================================================
// Helper: does this instruction (by tag) potentially modify HL?
// ============================================================================

function hlModifiesHl(instr) {
  const tag = instr.tag ?? '';
  // Instructions that write to HL or H or L
  if (tag === 'ld-pair-imm' && instr.pair === 'hl') return true;
  if (tag === 'ld-pair-mem' && instr.pair === 'hl') return true;
  if (tag === 'ld-pair-ind' && instr.pair === 'hl') return true;
  if (tag === 'ld-pair-indexed' && instr.pair === 'hl') return true;
  if (tag === 'pop' && instr.pair === 'hl') return true;
  if (tag === 'ex-sp-hl') return true;
  if (tag === 'ex-de-hl') return true;
  if (tag === 'exx') return true;
  if (tag === 'inc-pair' && instr.pair === 'hl') return true;
  if (tag === 'dec-pair' && instr.pair === 'hl') return true;
  if (tag === 'add-pair' && instr.dest === 'hl') return true;
  if (tag === 'sbc-pair') return true;  // always HL
  if (tag === 'adc-pair') return true;  // always HL
  if (tag === 'ld-reg-reg' && (instr.dest === 'h' || instr.dest === 'l')) return true;
  if (tag === 'ld-reg-imm' && (instr.dest === 'h' || instr.dest === 'l')) return true;
  if (tag === 'ld-reg-ind' && (instr.dest === 'h' || instr.dest === 'l')) return true;
  if (tag === 'ld-indexed' && (instr.dest === 'h' || instr.dest === 'l')) return true;
  if (tag === 'rld') return true;  // modifies A and (HL) not HL itself, but HL points
  if (tag === 'ldi' || tag === 'ldir' || tag === 'ldd' || tag === 'lddr') return true;
  if (tag === 'lea' && instr.dest === 'hl') return true;
  if (tag === 'ld-ind-pair' && instr.pair === 'hl') return true; // loads INTO HL
  // LD (dest), src where dest == hl (as pair target)
  return false;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('=== Phase 171: HL Register Trace During gcd(12,8) ===');
  console.log('');

  // Section 0: ROM disassembly (static, no runtime needed)
  dumpFpsPushRegion();
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  runHlTrace(runtime);

  console.log('Done.');
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
