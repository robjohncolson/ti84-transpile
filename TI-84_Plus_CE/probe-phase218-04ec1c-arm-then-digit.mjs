#!/usr/bin/env node

/**
 * Phase 218 Probe: Test 0x04EC1C as BIT 4 arming before ConvKeyToTok digit entry
 *
 * Part A: Call 0x04EC1C to arm BIT 4,(IY+5), then ConvKeyToTok with scan code 0x8F ('1')
 * Part B: Multi-digit sequence after arming — '2', '+', '3' — verify edit buffer
 * Part C: Control — ConvKeyToTok WITHOUT 0x04EC1C arming, confirm BufInsert NOT reached
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const transpiled = await import('./ROM.transpiled.js');
const BLOCKS = normalizeBlocks(
  transpiled.PRELIFTED_BLOCKS ??
  transpiled.default?.PRELIFTED_BLOCKS ??
  transpiled.default ??
  transpiled,
);
const rom = readFileSync(ROM_PATH);

// --- Constants ---
const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY5 = IY_ADDR + 0x05;  // 0xD00085

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;
const EDIT_BUF = 0xD00A00;
const EDIT_END = 0xD00B00;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFFE;

const ENTER_EDIT_MODE = 0x04EC1C;
const CONV_KEY_TO_TOK = 0x05E630;
const BUFINSERT = 0x05E2A0;

const KBD_RAW_SCAN = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GETKY = 0xD0058D;
const KBD_GETCSC_SCAN = 0xD0058E;

// --- Helpers ---
function normalizeBlocks(raw) {
  return Array.isArray(raw)
    ? Object.fromEntries(raw.filter((b) => b?.id).map((b) => [b.id, b]))
    : (raw ?? {});
}

function hex(v, w = 6) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function hexByte(v) {
  return hex((v ?? 0) & 0xFF, 2);
}

function bytesToHex(buf, start, len) {
  return Array.from(buf.slice(start, start + len), (x) =>
    x.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function createMemory() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP, EDIT_BUF);
  write24(mem, EDIT_CURSOR, EDIT_BUF);
  write24(mem, EDIT_TAIL, EDIT_END);
  write24(mem, EDIT_BTM, EDIT_END);
  mem.fill(0x00, EDIT_BUF, EDIT_END);
}

function seedKeyboard(mem, scanCode) {
  mem[KBD_RAW_SCAN] = scanCode & 0xFF;
  mem[KBD_KEY] = scanCode & 0xFF;
  mem[KBD_GETKY] = scanCode & 0xFF;
  mem[KBD_GETCSC_SCAN] = scanCode & 0xFF;
}

function stopError(name) {
  const err = new Error('__PROBE_STOP__');
  err.stopName = name;
  return err;
}

// --- Boot baseline (shared across all parts) ---
function bootBaseline() {
  const mem = createMemory();
  const { executor, cpu } = createRuntime(mem);

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu.iy = IY_ADDR; cpu.hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInitReturned = false;
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) { if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw stopError('mem_init_return'); },
      onMissingBlock(pc) { if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw stopError('mem_init_return'); },
    });
  } catch (error) {
    if (error?.message === '__PROBE_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  console.log(`Boot: z80=${boot.steps} steps, kernelInit=${kernelInit.steps} steps, memInit returned=${memInitReturned}`);
  return new Uint8Array(mem);
}

// --- Part A: Call 0x04EC1C then ConvKeyToTok ---
function partA(baselineMem) {
  console.log('\n========== PART A: Call 0x04EC1C then ConvKeyToTok ==========');

  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);

  // Check IY+5 before arming
  const iy5Before = mem[IY5] & 0xFF;
  console.log(`IY+5 before 0x04EC1C: ${hexByte(iy5Before)} (BIT 4 = ${(iy5Before & 0x10) ? 'SET' : 'CLEAR'})`);

  // Step 1: Call 0x04EC1C (enter edit mode)
  push24(cpu, mem, TRACE_RET);
  let armSteps = 0;
  let armTermination = 'unknown';
  try {
    const result = executor.runFrom(ENTER_EDIT_MODE, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 2048,
      onBlock(pc) { if ((pc & 0xFFFFFF) === TRACE_RET) throw stopError('arm_return'); },
      onMissingBlock(pc) { if ((pc & 0xFFFFFF) === TRACE_RET) throw stopError('arm_return'); },
    });
    armSteps = result.steps;
    armTermination = result.termination;
  } catch (error) {
    if (error?.message === '__PROBE_STOP__' && error.stopName === 'arm_return') {
      armTermination = 'sentinel';
    } else {
      throw error;
    }
  }

  const iy5After = mem[IY5] & 0xFF;
  const bit4Set = (iy5After & 0x10) !== 0;
  console.log(`0x04EC1C returned: termination=${armTermination}`);
  console.log(`IY+5 after 0x04EC1C: ${hexByte(iy5After)} (BIT 4 = ${bit4Set ? 'SET' : 'CLEAR'})`);

  // Step 2: Call ConvKeyToTok with A=0x8F (scan code '1')
  resetOsState(cpu, mem);
  // Preserve IY+5 state from arming
  mem[IY5] = iy5After;
  // Re-seed cursor position (resetOsState may have clobbered stack but not edit buffer)
  const cursorBefore = read24(mem, EDIT_CURSOR);
  console.log(`Edit cursor before ConvKeyToTok: ${hex(cursorBefore)}`);

  seedKeyboard(mem, 0x8F);
  cpu.a = 0x8F;
  push24(cpu, mem, TRACE_RET);

  let bufInsertCount = 0;
  let bufInsertDE = null;
  let convTermination = 'unknown';
  const visited = [];

  try {
    const result = executor.runFrom(CONV_KEY_TO_TOK, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 256,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        visited.push(hex(addr));
        if (addr === BUFINSERT) {
          bufInsertCount++;
          bufInsertDE = cpu.de >>> 0;
        }
        if (addr === TRACE_RET) throw stopError('conv_return');
      },
      onMissingBlock(pc) {
        const addr = pc & 0xFFFFFF;
        visited.push(`MISSING:${hex(addr)}`);
        if (addr === TRACE_RET) throw stopError('conv_return');
      },
    });
    convTermination = result.termination;
  } catch (error) {
    if (error?.message === '__PROBE_STOP__' && error.stopName === 'conv_return') {
      convTermination = 'sentinel';
    } else {
      throw error;
    }
  }

  const tokenAt0A00 = mem[EDIT_BUF] & 0xFF;
  const cursorAfter = read24(mem, EDIT_CURSOR);
  const bufHead = bytesToHex(mem, EDIT_BUF, 8);

  console.log(`ConvKeyToTok(0x8F) termination: ${convTermination}`);
  console.log(`BufInsert reached: ${bufInsertCount > 0 ? 'YES' : 'NO'} (count=${bufInsertCount})`);
  if (bufInsertDE !== null) console.log(`DE at BufInsert entry: ${hex(bufInsertDE)}`);
  console.log(`Token at 0xD00A00: ${hexByte(tokenAt0A00)} (expected 0x31)`);
  console.log(`Cursor after: ${hex(cursorAfter)} (expected 0xD00A01)`);
  console.log(`Edit buffer head: ${bufHead}`);
  console.log(`Visited blocks: ${visited.join(', ')}`);

  const pass = bufInsertCount > 0 && tokenAt0A00 === 0x31 && cursorAfter === 0xD00A01;
  console.log(`Part A PASS: ${pass}`);

  return { mem, iy5After, pass };
}

// --- Part B: Multi-digit sequence ---
function partB(baselineMem) {
  console.log('\n========== PART B: Multi-digit sequence (arm + 4 keys) ==========');

  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);

  // Arm edit mode via 0x04EC1C
  push24(cpu, mem, TRACE_RET);
  let armOk = false;
  try {
    executor.runFrom(ENTER_EDIT_MODE, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 2048,
      onBlock(pc) { if ((pc & 0xFFFFFF) === TRACE_RET) throw stopError('arm_return'); },
      onMissingBlock(pc) { if ((pc & 0xFFFFFF) === TRACE_RET) throw stopError('arm_return'); },
    });
  } catch (error) {
    if (error?.message === '__PROBE_STOP__' && error.stopName === 'arm_return') armOk = true;
    else throw error;
  }

  const iy5Armed = mem[IY5] & 0xFF;
  console.log(`After 0x04EC1C arming: IY+5=${hexByte(iy5Armed)}, BIT 4=${(iy5Armed & 0x10) ? 'SET' : 'CLEAR'}`);

  // Sequence of keys: '1' (0x8F), '2' (0x90), '+' (0x80), '3' (0x91)
  const keys = [
    { scanCode: 0x8F, expectedToken: 0x31, label: '1' },
    { scanCode: 0x90, expectedToken: 0x32, label: '2' },
    { scanCode: 0x80, expectedToken: 0x70, label: '+' },
    { scanCode: 0x91, expectedToken: 0x33, label: '3' },
  ];

  for (const key of keys) {
    // Preserve memory state but reset CPU for call
    const savedIY5 = mem[IY5];
    resetOsState(cpu, mem);
    mem[IY5] = savedIY5;  // Restore IY+5 state

    seedKeyboard(mem, key.scanCode);
    cpu.a = key.scanCode;
    push24(cpu, mem, TRACE_RET);

    let bufInsertCount = 0;
    let convTerm = 'unknown';

    try {
      executor.runFrom(CONV_KEY_TO_TOK, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 256,
        onBlock(pc) {
          const addr = pc & 0xFFFFFF;
          if (addr === BUFINSERT) bufInsertCount++;
          if (addr === TRACE_RET) throw stopError('conv_return');
        },
        onMissingBlock(pc) {
          if ((pc & 0xFFFFFF) === TRACE_RET) throw stopError('conv_return');
        },
      });
    } catch (error) {
      if (error?.message === '__PROBE_STOP__' && error.stopName === 'conv_return') convTerm = 'sentinel';
      else throw error;
    }

    const cursor = read24(mem, EDIT_CURSOR);
    const iy5Now = mem[IY5] & 0xFF;
    console.log(`Key '${key.label}' (${hexByte(key.scanCode)}): BufInsert=${bufInsertCount > 0 ? 'YES' : 'NO'}, cursor=${hex(cursor)}, IY+5=${hexByte(iy5Now)}, term=${convTerm}`);
  }

  // Read edit buffer
  const bufBytes = [mem[EDIT_BUF], mem[EDIT_BUF + 1], mem[EDIT_BUF + 2], mem[EDIT_BUF + 3]];
  const expected = [0x31, 0x32, 0x70, 0x33];
  const bufHex = bufBytes.map((b) => hexByte(b)).join(' ');
  const expHex = expected.map((b) => hexByte(b)).join(' ');
  const bufMatch = bufBytes.every((b, i) => b === expected[i]);

  console.log(`Edit buffer 0xD00A00-0xD00A03: ${bufHex}`);
  console.log(`Expected:                      ${expHex}`);
  console.log(`Final cursor: ${hex(read24(mem, EDIT_CURSOR))}`);
  console.log(`Part B buffer match: ${bufMatch}`);

  return { pass: bufMatch };
}

// --- Part C: Control — ConvKeyToTok WITHOUT arming ---
function partC(baselineMem) {
  console.log('\n========== PART C: Control — ConvKeyToTok WITHOUT 0x04EC1C ==========');

  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);

  // Ensure BIT 4 is CLEAR
  mem[IY5] = mem[IY5] & ~0x10;
  const iy5Before = mem[IY5] & 0xFF;
  console.log(`IY+5 (no arming): ${hexByte(iy5Before)} (BIT 4 = ${(iy5Before & 0x10) ? 'SET' : 'CLEAR'})`);

  seedKeyboard(mem, 0x8F);
  cpu.a = 0x8F;
  push24(cpu, mem, TRACE_RET);

  let bufInsertCount = 0;
  let convTermination = 'unknown';
  const visited = [];

  try {
    const result = executor.runFrom(CONV_KEY_TO_TOK, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 256,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        visited.push(hex(addr));
        if (addr === BUFINSERT) bufInsertCount++;
        if (addr === TRACE_RET) throw stopError('conv_return');
      },
      onMissingBlock(pc) {
        const addr = pc & 0xFFFFFF;
        visited.push(`MISSING:${hex(addr)}`);
        if (addr === TRACE_RET) throw stopError('conv_return');
      },
    });
    convTermination = result.termination;
  } catch (error) {
    if (error?.message === '__PROBE_STOP__' && error.stopName === 'conv_return') {
      convTermination = 'sentinel';
    } else {
      throw error;
    }
  }

  const tokenAt0A00 = mem[EDIT_BUF] & 0xFF;
  const cursorAfter = read24(mem, EDIT_CURSOR);

  console.log(`ConvKeyToTok(0x8F) without arming — termination: ${convTermination}`);
  console.log(`BufInsert reached: ${bufInsertCount > 0 ? 'YES' : 'NO'} (count=${bufInsertCount})`);
  console.log(`Token at 0xD00A00: ${hexByte(tokenAt0A00)} (expected 0x00 = empty)`);
  console.log(`Cursor after: ${hex(cursorAfter)} (expected 0xD00A00 = unchanged)`);
  console.log(`Visited blocks: ${visited.join(', ')}`);

  const pass = bufInsertCount === 0 && tokenAt0A00 === 0x00;
  console.log(`Part C PASS (BufInsert NOT reached, buffer empty): ${pass}`);

  return { pass };
}

// --- Main ---
function main() {
  console.log('Phase 218: Test 0x04EC1C as BIT 4 arming before ConvKeyToTok digit entry');
  console.log('='.repeat(78));

  const baselineMem = bootBaseline();

  const resultA = partA(baselineMem);
  const resultB = partB(baselineMem);
  const resultC = partC(baselineMem);

  console.log('\n========== SUMMARY ==========');
  console.log(`Part A (arm + single digit '1'):  ${resultA.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Part B (arm + multi-key "12+3"):  ${resultB.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Part C (control — no arming):     ${resultC.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Overall: ${resultA.pass && resultB.pass && resultC.pass ? 'ALL PASS' : 'SOME FAILED'}`);

  console.log('\n' + JSON.stringify({
    probe: 'probe-phase218-04ec1c-arm-then-digit.mjs',
    generatedAt: new Date().toISOString(),
    constants: {
      enterEditMode: hex(ENTER_EDIT_MODE),
      convKeyToTok: hex(CONV_KEY_TO_TOK),
      bufInsert: hex(BUFINSERT),
      iy5: hex(IY5),
      editBuf: hex(EDIT_BUF),
      editCursor: hex(EDIT_CURSOR),
    },
    results: {
      partA: resultA.pass,
      partB: resultB.pass,
      partC: resultC.pass,
      overall: resultA.pass && resultB.pass && resultC.pass,
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase218-04ec1c-arm-then-digit.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
