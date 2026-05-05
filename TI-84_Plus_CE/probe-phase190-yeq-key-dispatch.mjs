#!/usr/bin/env node
/**
 * probe-phase190-yeq-key-dispatch.mjs
 *
 * Trace Y= key dispatch through the home handler at 0x058460.
 *
 * Background:
 * - Session 182 disassembled the home handler (0x0582B8-0x058700).
 * - Key classification via call 0x07F7BD at 0x0584A7 reads OP1[0] & 0x3F.
 * - Dispatch table at 0x0585D3 has context entries.
 * - Session 139 validated GraphPars renders in isolation.
 *
 * Y= key:
 * - Physical: keyMatrix[6] bit 4, scan code 0x64
 * - SDK key code: kYequ = 0x8A
 * - Classification: 0x8A & 0x3F = 0x0A (type 10, falls through cp 6/cp 5)
 *
 * This probe:
 * 1. Boots + kernelInit + memInit + CreateReal(Ans)
 * 2. Sets up TOKEN_STAGING = key code for Y= in register A
 * 3. Enters home handler at 0x058460
 * 4. Traces up to 2000 steps, logging every block PC
 * 5. Static disassembly of 0x058460-0x058500
 * 6. Reads ROM key translation tables for Y= verification
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;

const HOME_HANDLER_ENTRY = 0x058460;

const TOKEN_STAGING_ADDR = 0xD0230E;
const OP1_ADDR = 0xD005F8;
const OP1_LENGTH = 9;

const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;

const CREATE_REAL_RET = 0x7FFFFE;
const CREATE_REAL_ERR = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;
const HOME_HANDLER_RET = 0x7FFFF0;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// Y= key code from TI-84 CE SDK: kYequ = 0x8A
const K_YEQU = 0x8A;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const HOME_HANDLER_MAX_STEPS = 2000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const TRACE_STOP = '__PHASE190_TRACE_STOP__';

// Addresses of interest during tracing
const WATCH_ADDRESSES = new Map([
  [0x058460, 'home-handler entry'],
  [0x058480, 'home-handler: jp 0x058358?'],
  [0x0584A0, 'home-handler: call 0x058C65'],
  [0x0584AC, 'home-handler: call 0x07F9FB (copy key to OP1)'],
  [0x0584B0, 'home-handler: call 0x07F7BD (key classification)'],
  [0x0584B4, 'home-handler: cp 0x06 (type 6 check)'],
  [0x0584BA, 'home-handler: cp 0x05 (type 5 check)'],
  [0x0584CA, 'home-handler: fall-through (not type 5 or 6)'],
  [0x058521, 'home-handler: after type-5 branch target'],
  [0x0585D3, 'home-handler: dispatch table area'],
  [0x07F7BD, 'GetKeyClass: ld a,(OP1); and 0x3F; ret'],
  [0x07F9FB, 'CopyKeyToOP1: ld de,OP1; jp copy'],
  [0x061D42, 'non-printable key handler (type 6 target)'],
  [0x061DB2, 'JError entry'],
  [0x08384F, 'type-5 handler call target'],
  [0x082C2F, 'type-5 secondary handler'],
  [0x0800EC, 'pre-classification call 1'],
  [0x0A223A, 'pre-classification call 2'],
  [0x058C65, 'pre-classification call 3'],
  [0x091B0B, 'dispatch table lookup?'],
]);

// Target addresses that suggest Y= editor context switch
const YEQU_RANGE_START = 0x06B300;
const YEQU_RANGE_END = 0x06B400;

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  const out = [];
  for (let index = 0; index < length; index += 1) {
    out.push(hexByte(buffer[(start + index) & 0xFFFFFF] ?? 0));
  }
  return out.join(' ');
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
      maxLoopIterations,
    });
    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;
    if (result.termination !== 'max_steps') break;
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;
    for (const [name, target] of Object.entries(sentinels)) {
      if (normalizedPc === target) {
        hit = name;
        throw new Error(TRACE_STOP);
      }
    }
  };

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) { notePc(pc); },
        onMissingBlock(pc) { notePc(pc); },
      });
      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: bootResult.steps, lastPc: hex(bootResult.lastPc), termination: bootResult.termination },
    kernelInit: { steps: kernelInitResult.steps, lastPc: hex(kernelInitResult.lastPc), termination: kernelInitResult.termination },
    postInit: { steps: postInitResult.steps, lastPc: hex(postInitResult.lastPc), termination: postInitResult.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ROM_ERRNO_ADDR] = 0x00;
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATE_REAL_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, CREATE_REAL_ERR);
  write24(mem, errBase + 3, 0);
  write24(mem, ROM_ERRSP_ADDR, errBase);
  mem[ROM_ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;

  return {
    errBase: hex(errBase),
    ...runUntilHitSegmented(
      executor,
      CREATE_REAL_ENTRY,
      'adl',
      { ret: CREATE_REAL_RET, err: CREATE_REAL_ERR },
      CREATE_REAL_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
    ),
  };
}

function snapshotCpu(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    hl: hex(cpu._hl),
    de: hex(cpu._de),
    bc: hex(cpu._bc),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
}

/**
 * Trace home handler with Y= key, logging every block PC.
 */
function traceHomeHandlerYeq(executor, cpu, mem) {
  const trace = [];
  const pcCounts = new Map();
  let reachedYequRange = false;
  let reachedDispatchTable = false;
  let totalSteps = 0;
  let currentPc = HOME_HANDLER_ENTRY & 0xFFFFFF;
  let currentMode = 'adl';
  let hit = null;
  let termination = null;
  let errorMessage = null;

  while (totalSteps < HOME_HANDLER_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, HOME_HANDLER_MAX_STEPS - totalSteps);

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, mode) {
          const normalizedPc = pc & 0xFFFFFF;

          // Count visits
          pcCounts.set(normalizedPc, (pcCounts.get(normalizedPc) ?? 0) + 1);

          // Log notable addresses
          const label = WATCH_ADDRESSES.get(normalizedPc);
          const row = {
            step: totalSteps,
            pc: hex(normalizedPc),
            mode,
            sp: hex(cpu.sp),
            a: hex(cpu.a, 2),
            f: hex(cpu.f, 2),
            hl: hex(cpu._hl),
          };
          if (label) row.label = label;

          // Check Y= editor range
          if (normalizedPc >= YEQU_RANGE_START && normalizedPc < YEQU_RANGE_END) {
            row.note = 'IN Y= EDITOR RANGE (0x06B300-0x06B400)';
            reachedYequRange = true;
          }

          // Check dispatch table area
          if (normalizedPc >= 0x0585D0 && normalizedPc <= 0x0585F0) {
            row.note = 'IN DISPATCH TABLE AREA';
            reachedDispatchTable = true;
          }

          // Check 0x059xxx range
          if (normalizedPc >= 0x059000 && normalizedPc < 0x05A000) {
            row.note = 'IN 0x059xxx RANGE';
          }

          // Check 0x0582BC
          if (normalizedPc === 0x0582BC) {
            row.note = 'HIT 0x0582BC (home handler inner)';
          }

          trace.push(row);

          // Check sentinel
          if (normalizedPc === HOME_HANDLER_RET) {
            hit = 'ret';
            throw new Error(TRACE_STOP);
          }
        },
        onMissingBlock(pc) {
          const normalizedPc = pc & 0xFFFFFF;
          trace.push({
            step: totalSteps,
            pc: hex(normalizedPc),
            note: 'MISSING BLOCK',
            sp: hex(cpu.sp),
            a: hex(cpu.a, 2),
          });
          if (normalizedPc === HOME_HANDLER_RET) {
            hit = 'ret';
            throw new Error(TRACE_STOP);
          }
        },
      });

      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= HOME_HANDLER_MAX_STEPS && !hit) {
    termination = 'step_limit';
  }

  // Find most-visited PCs (loop detection)
  const topPcs = [...pcCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pc, count]) => ({ pc: hex(pc), count, label: WATCH_ADDRESSES.get(pc) ?? null }));

  return {
    hit,
    totalSteps,
    termination,
    errorMessage,
    trace,
    topPcs,
    reachedYequRange,
    reachedDispatchTable,
    uniqueBlocksVisited: pcCounts.size,
    cpuFinal: snapshotCpu(cpu),
    tokenStaging: hex(mem[TOKEN_STAGING_ADDR], 2),
    op1: hexBytes(mem, OP1_ADDR, OP1_LENGTH),
    stackTop12: hexBytes(mem, cpu.sp & 0xFFFFFF, 12),
  };
}

/**
 * Static disassembly of ROM bytes at a given range using the decoder.
 */
function staticDisassembly(startAddr, endAddr) {
  const lines = [];
  let pc = startAddr;

  while (pc < endAddr) {
    try {
      const instr = decodeInstruction(romBytes, pc, true); // true = ADL mode
      const instrBytes = [];
      for (let i = 0; i < (instr.length ?? 1); i++) {
        instrBytes.push(hexByte(romBytes[pc + i] ?? 0));
      }

      lines.push({
        addr: hex(pc),
        bytes: instrBytes.join(' '),
        mnemonic: instr.mnemonic ?? '???',
        length: instr.length ?? 1,
      });
      pc += instr.length ?? 1;
    } catch {
      lines.push({
        addr: hex(pc),
        bytes: hexByte(romBytes[pc] ?? 0),
        mnemonic: '??? (decode error)',
        length: 1,
      });
      pc += 1;
    }
  }

  return lines;
}

/**
 * Read and display ROM key translation tables relevant to Y= key.
 */
function analyzeYeqKeyCode(mem) {
  const results = {};

  // ConvKeyToTok table at 0x05BF84 (first 8 entries = function key row G6)
  const convKeyEntries = [];
  const labels = ['GRAPH(0x60)', 'TRACE(0x61)', 'ZOOM(0x62)', 'WINDOW(0x63)',
                  'Y=(0x64)', '2ND(0x65)', 'MODE(0x66)', 'DEL(0x67)'];
  for (let i = 0; i < 8; i++) {
    convKeyEntries.push({
      key: labels[i],
      keyCode: hex(romBytes[0x05BF84 + i], 2),
    });
  }
  results.convKeyToTokRow6 = convKeyEntries;

  // Key translation table at 0x09F7BB
  results.keyTranslationTable = hexBytes(romBytes, 0x09F7BB, 128);

  // The SDK kYequ value
  results.sdkKYequ = hex(K_YEQU, 2);
  results.classification = hex(K_YEQU & 0x3F, 2);
  results.classificationDecimal = K_YEQU & 0x3F;

  // Check: ConvKeyToTok[4] for Y= scan offset
  results.convKeyToTokOffset4 = hex(romBytes[0x05BF84 + 4], 2);
  results.note = 'ConvKeyToTok[4] = 0x8D (not 0x8A). SDK kYequ=0x8A but table offset 3 (WINDOW pos) = 0x8A. Y= at offset 4 = 0x8D. The scan-to-keycode mapping may reorder keys.';

  return results;
}

function main() {
  console.log('=== Phase 190: Y= key dispatch through home handler ===\n');

  // ---------- Step 0: Static analysis ----------
  console.log('[0] Static analysis of key codes and ROM tables\n');

  const keyAnalysis = analyzeYeqKeyCode(romBytes);
  console.log('  ConvKeyToTok row 6 (function keys):');
  for (const entry of keyAnalysis.convKeyToTokRow6) {
    console.log(`    ${entry.key} => ${entry.keyCode}`);
  }
  console.log(`  SDK kYequ: ${keyAnalysis.sdkKYequ}`);
  console.log(`  Classification (& 0x3F): ${keyAnalysis.classification} (decimal ${keyAnalysis.classificationDecimal})`);
  console.log(`  ConvKeyToTok[4] (Y= position): ${keyAnalysis.convKeyToTokOffset4}`);
  console.log(`  Note: ${keyAnalysis.note}`);

  // Also check 0x8D classification
  const alt_key = 0x8D;
  console.log(`\n  Alternate key code 0x8D (from ConvKeyToTok[4]):`);
  console.log(`    Classification (& 0x3F): ${hex(alt_key & 0x3F, 2)} (decimal ${alt_key & 0x3F})`);

  // ---------- Step 1: Static disassembly ----------
  console.log('\n[1] Static disassembly of home handler entry (0x058460-0x058500)\n');

  const disasm = staticDisassembly(0x058460, 0x058500);
  for (const line of disasm) {
    const padBytes = line.bytes.padEnd(24, ' ');
    console.log(`  ${line.addr}: ${padBytes} ${line.mnemonic}`);
  }

  // ---------- Step 2: Boot ----------
  console.log('\n[2] Booting runtime...');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = bootRuntime(executor, cpu, mem);
  console.log('  Boot:', JSON.stringify(boot.boot));
  console.log('  KernelInit:', JSON.stringify(boot.kernelInit));
  console.log('  PostInit:', JSON.stringify(boot.postInit));

  // ---------- Step 3: MemInit ----------
  console.log('\n[3] Running MemInit...');
  const memInit = runMemInit(executor, cpu, mem);
  console.log(`  MemInit: hit=${memInit.hit}, steps=${memInit.steps}, termination=${memInit.termination}`);
  if (memInit.hit !== 'ret') {
    console.log('  ERROR: MemInit did not return. Aborting.');
    return;
  }

  // ---------- Step 4: CreateReal(Ans) ----------
  console.log('\n[4] Running CreateReal(Ans)...');
  const createReal = runCreateRealAns(executor, cpu, mem);
  console.log(`  CreateReal: hit=${createReal.hit}, steps=${createReal.steps}, termination=${createReal.termination}`);
  if (createReal.hit !== 'ret') {
    console.log('  ERROR: CreateReal(Ans) did not return. Aborting.');
    return;
  }

  // ---------- Step 5: Run home handler with Y= key (kYequ = 0x8A) ----------
  console.log('\n[5] Setting up home handler call with Y= key (kYequ = 0x8A)...');

  resetCpuForOsCall(cpu, mem);

  // Set key code in register A and TOKEN_STAGING
  cpu.a = K_YEQU;
  mem[TOKEN_STAGING_ADDR] = K_YEQU;

  // Also write key code to OP1[0] (the classification function reads from there)
  mem[OP1_ADDR] = K_YEQU;

  // IX = 0xD1A860, IY = 0xD00080 (already set by resetCpuForOsCall)
  // Push return sentinel
  cpu.sp -= 3;
  write24(mem, cpu.sp, HOME_HANDLER_RET);

  console.log(`  A = ${hex(cpu.a, 2)}`);
  console.log(`  TOKEN_STAGING (${hex(TOKEN_STAGING_ADDR)}) = ${hex(mem[TOKEN_STAGING_ADDR], 2)}`);
  console.log(`  OP1[0] (${hex(OP1_ADDR)}) = ${hex(mem[OP1_ADDR], 2)}`);
  console.log(`  SP = ${hex(cpu.sp)}`);
  console.log(`  IX = ${hex(cpu._ix)}`);
  console.log(`  IY = ${hex(cpu._iy)}`);
  console.log(`  Return sentinel = ${hex(HOME_HANDLER_RET)}`);
  console.log(`  Stack top 12: ${hexBytes(mem, cpu.sp & 0xFFFFFF, 12)}`);

  console.log('\n[6] Tracing home handler (max 2000 steps)...');
  const traceResult = traceHomeHandlerYeq(executor, cpu, mem);

  // ---------- Output ----------
  console.log(`\n  Total steps: ${traceResult.totalSteps}`);
  console.log(`  Termination: ${traceResult.termination}`);
  console.log(`  Hit sentinel: ${traceResult.hit ?? 'no'}`);
  console.log(`  Unique blocks visited: ${traceResult.uniqueBlocksVisited}`);
  console.log(`  Reached Y= editor range (0x06B300-0x06B400): ${traceResult.reachedYequRange}`);
  console.log(`  Reached dispatch table area: ${traceResult.reachedDispatchTable}`);

  console.log('\n  Top 10 most-visited PCs:');
  for (const entry of traceResult.topPcs) {
    const label = entry.label ? ` (${entry.label})` : '';
    console.log(`    ${entry.pc}: ${entry.count} visits${label}`);
  }

  console.log(`\n  TOKEN_STAGING after: ${traceResult.tokenStaging}`);
  console.log(`  OP1 after: ${traceResult.op1}`);
  console.log(`  Stack top 12 after: ${traceResult.stackTop12}`);

  console.log('\n  CPU final state:', JSON.stringify(traceResult.cpuFinal, null, 2));

  // Print full trace (every block visited)
  console.log('\n  Full block trace:');
  for (const row of traceResult.trace) {
    let line = `    step=${row.step} ${row.pc}`;
    if (row.label) line += ` [${row.label}]`;
    if (row.note) line += ` ** ${row.note} **`;
    line += ` A=${row.a} F=${row.f} HL=${row.hl} SP=${row.sp}`;
    if (row.mode) line += ` mode=${row.mode}`;
    console.log(line);
  }

  if (traceResult.errorMessage) {
    console.log('\n  Error detail:');
    console.log(traceResult.errorMessage);
  }

  // ---------- Step 7: Also try with key code 0x8D (ConvKeyToTok[4] value) ----------
  console.log('\n\n[7] Repeating with alternate key code 0x8D (from ConvKeyToTok Y= offset)...');

  const ALT_KEY = 0x8D;

  resetCpuForOsCall(cpu, mem);
  cpu.a = ALT_KEY;
  mem[TOKEN_STAGING_ADDR] = ALT_KEY;
  mem[OP1_ADDR] = ALT_KEY;
  cpu.sp -= 3;
  write24(mem, cpu.sp, HOME_HANDLER_RET);

  console.log(`  A = ${hex(cpu.a, 2)}`);
  console.log(`  TOKEN_STAGING = ${hex(mem[TOKEN_STAGING_ADDR], 2)}`);
  console.log(`  OP1[0] = ${hex(mem[OP1_ADDR], 2)}`);
  console.log(`  Classification (0x8D & 0x3F) = ${hex(ALT_KEY & 0x3F, 2)} (decimal ${ALT_KEY & 0x3F})`);

  console.log('\n  Tracing home handler with 0x8D (max 2000 steps)...');
  const traceResult2 = traceHomeHandlerYeq(executor, cpu, mem);

  console.log(`\n  Total steps: ${traceResult2.totalSteps}`);
  console.log(`  Termination: ${traceResult2.termination}`);
  console.log(`  Hit sentinel: ${traceResult2.hit ?? 'no'}`);
  console.log(`  Unique blocks visited: ${traceResult2.uniqueBlocksVisited}`);
  console.log(`  Reached Y= editor range: ${traceResult2.reachedYequRange}`);
  console.log(`  Reached dispatch table area: ${traceResult2.reachedDispatchTable}`);

  console.log('\n  Top 10 most-visited PCs:');
  for (const entry of traceResult2.topPcs) {
    const label = entry.label ? ` (${entry.label})` : '';
    console.log(`    ${entry.pc}: ${entry.count} visits${label}`);
  }

  console.log(`\n  TOKEN_STAGING after: ${traceResult2.tokenStaging}`);
  console.log(`  OP1 after: ${traceResult2.op1}`);
  console.log(`  Stack top 12 after: ${traceResult2.stackTop12}`);
  console.log('\n  CPU final state:', JSON.stringify(traceResult2.cpuFinal, null, 2));

  console.log('\n  Full block trace (0x8D):');
  for (const row of traceResult2.trace) {
    let line = `    step=${row.step} ${row.pc}`;
    if (row.label) line += ` [${row.label}]`;
    if (row.note) line += ` ** ${row.note} **`;
    line += ` A=${row.a} F=${row.f} HL=${row.hl} SP=${row.sp}`;
    if (row.mode) line += ` mode=${row.mode}`;
    console.log(line);
  }

  if (traceResult2.errorMessage) {
    console.log('\n  Error detail:');
    console.log(traceResult2.errorMessage);
  }

  // ---------- Summary ----------
  console.log('\n\n=== SUMMARY ===');
  console.log(`  Y= key scan code: 0x64 (keyMatrix[6] bit 4)`);
  console.log(`  SDK kYequ: 0x8A, classification=${hex(K_YEQU & 0x3F, 2)}`);
  console.log(`  ConvKeyToTok Y= offset: 0x8D, classification=${hex(ALT_KEY & 0x3F, 2)}`);
  console.log(`  Trace with 0x8A: ${traceResult.totalSteps} steps, termination=${traceResult.termination}, Y= range=${traceResult.reachedYequRange}`);
  console.log(`  Trace with 0x8D: ${traceResult2.totalSteps} steps, termination=${traceResult2.termination}, Y= range=${traceResult2.reachedYequRange}`);
}

main();
