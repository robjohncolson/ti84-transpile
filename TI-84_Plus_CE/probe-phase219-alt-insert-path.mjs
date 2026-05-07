#!/usr/bin/env node

/**
 * Phase 219 Probe: Trace the ALTERNATE token insertion path (BIT 4 CLEAR)
 *
 * Part A: Single digit (A=0x8F, '1') with BIT 4 CLEAR — trace blocks, buffer writes, cursor
 * Part B: Multi-digit sequence (0x8F, 0x90, 0x80, 0x91 = "1","2","+","3") with BIT 4 CLEAR
 * Part C: Non-digit token (A=0x9A = 'A', maps to token 0x41) with BIT 4 CLEAR
 * Part D: Same single digit with BIT 4 SET for comparison — show block path diff
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

const CONV_KEY_TO_TOK = 0x05E630;
const BUFINSERT = 0x05E2A0;

// Alternate path blocks
const ALT_PATH_BLOCKS = [0x05E307, 0x05E315, 0x05E317, 0x05E348, 0x05E372, 0x05E352, 0x05E654];

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

/**
 * Run ConvKeyToTok and return trace info.
 * @param {Uint8Array} baselineMem - baseline memory snapshot
 * @param {number} scanCode - scan code to put in A
 * @param {boolean} bit4Set - whether BIT 4,(IY+5) should be SET
 * @param {boolean} freshBuffer - whether to re-seed edit buffer from scratch
 * @param {Uint8Array|null} carryMem - if non-null, use this memory instead of baselineMem
 * @returns {{ mem, visited, bufInsertCount, termination, cursorBefore, cursorAfter, altBlocksHit }}
 */
function runConvKeyToTok(baselineMem, scanCode, bit4Set, freshBuffer, carryMem) {
  const mem = carryMem ? carryMem : new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);

  if (freshBuffer) {
    seedEditBuffer(mem);
  }

  // Set BIT 4 as requested
  if (bit4Set) {
    mem[IY5] = mem[IY5] | 0x10;
  } else {
    mem[IY5] = mem[IY5] & ~0x10;
  }

  const cursorBefore = read24(mem, EDIT_CURSOR);

  seedKeyboard(mem, scanCode);
  cpu.a = scanCode;
  push24(cpu, mem, TRACE_RET);

  let bufInsertCount = 0;
  let termination = 'unknown';
  const visited = [];
  const altBlocksHit = new Set();

  // Track memory writes to edit buffer region
  const bufSnapshot = new Uint8Array(mem.slice(EDIT_BUF, EDIT_BUF + 16));

  try {
    const result = executor.runFrom(CONV_KEY_TO_TOK, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 256,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        visited.push(addr);
        if (addr === BUFINSERT) bufInsertCount++;
        for (const ab of ALT_PATH_BLOCKS) {
          if (addr === ab) altBlocksHit.add(ab);
        }
        if (addr === TRACE_RET) throw stopError('conv_return');
      },
      onMissingBlock(pc) {
        const addr = pc & 0xFFFFFF;
        visited.push(addr | 0x80000000);  // mark missing with high bit
        if (addr === TRACE_RET) throw stopError('conv_return');
      },
    });
    termination = result.termination;
  } catch (error) {
    if (error?.message === '__PROBE_STOP__' && error.stopName === 'conv_return') {
      termination = 'sentinel';
    } else {
      throw error;
    }
  }

  const cursorAfter = read24(mem, EDIT_CURSOR);

  // Find which bytes changed in edit buffer
  const bufChanges = [];
  for (let i = 0; i < 16; i++) {
    const newVal = mem[EDIT_BUF + i];
    if (newVal !== bufSnapshot[i]) {
      bufChanges.push({ offset: i, was: bufSnapshot[i], now: newVal });
    }
  }

  return { mem, visited, bufInsertCount, termination, cursorBefore, cursorAfter, altBlocksHit, bufChanges };
}

function formatVisited(visited, limit = 40) {
  const formatted = visited.slice(0, limit).map((addr) => {
    if (addr & 0x80000000) return `MISSING:${hex(addr & 0x7FFFFFFF)}`;
    return hex(addr);
  });
  if (visited.length > limit) formatted.push(`... (${visited.length - limit} more)`);
  return formatted.join(', ');
}

// --- Part A: Single digit with BIT 4 CLEAR ---
function partA(baselineMem) {
  console.log('\n========== PART A: Single digit (A=0x8F, "1") with BIT 4 CLEAR ==========');

  const result = runConvKeyToTok(baselineMem, 0x8F, false, true, null);

  const tokenAt0A00 = result.mem[EDIT_BUF] & 0xFF;
  const bufHead = bytesToHex(result.mem, EDIT_BUF, 16);

  console.log(`Termination: ${result.termination}`);
  console.log(`BufInsert reached: ${result.bufInsertCount > 0 ? 'YES' : 'NO'} (count=${result.bufInsertCount})`);
  console.log(`Alternate path blocks hit: ${[...result.altBlocksHit].map((a) => hex(a)).join(', ') || 'NONE'}`);
  console.log(`Cursor before: ${hex(result.cursorBefore)}`);
  console.log(`Cursor after:  ${hex(result.cursorAfter)}`);
  console.log(`Cursor delta:  ${result.cursorAfter - result.cursorBefore}`);
  console.log(`Token at 0xD00A00: ${hexByte(tokenAt0A00)}`);
  console.log(`Edit buffer [0xD00A00..0xD00A0F]: ${bufHead}`);
  console.log(`Buffer changes: ${result.bufChanges.length > 0 ? result.bufChanges.map((c) => `offset ${c.offset}: ${hexByte(c.was)}->${hexByte(c.now)}`).join(', ') : 'NONE'}`);
  console.log(`Total blocks visited: ${result.visited.length}`);
  console.log(`Visited: ${formatVisited(result.visited)}`);

  return result;
}

// --- Part B: Multi-digit sequence with BIT 4 CLEAR ---
function partB(baselineMem) {
  console.log('\n========== PART B: Multi-digit sequence ("1","2","+","3") with BIT 4 CLEAR ==========');

  const keys = [
    { scanCode: 0x8F, label: '1' },
    { scanCode: 0x90, label: '2' },
    { scanCode: 0x80, label: '+' },
    { scanCode: 0x91, label: '3' },
  ];

  // Start with fresh memory from baseline
  let mem = new Uint8Array(baselineMem);

  // Seed edit buffer once
  seedEditBuffer(mem);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const freshBuf = (i === 0);  // only fresh on first call; after that carry state

    const result = runConvKeyToTok(baselineMem, key.scanCode, false, freshBuf, mem);
    mem = result.mem;  // carry memory forward

    const bufHead = bytesToHex(mem, EDIT_BUF, 8);
    const cursor = read24(mem, EDIT_CURSOR);

    console.log(`Key[${i}] '${key.label}' (${hexByte(key.scanCode)}): term=${result.termination}, BufInsert=${result.bufInsertCount > 0 ? 'YES' : 'NO'}, altBlocks=[${[...result.altBlocksHit].map((a) => hex(a)).join(',')}], cursor=${hex(cursor)}, buf=[${bufHead}], changes=[${result.bufChanges.map((c) => `+${c.offset}:${hexByte(c.now)}`).join(',')}]`);
  }

  const finalBuf = bytesToHex(mem, EDIT_BUF, 8);
  const finalCursor = read24(mem, EDIT_CURSOR);
  console.log(`Final edit buffer [0xD00A00..0xD00A07]: ${finalBuf}`);
  console.log(`Final cursor: ${hex(finalCursor)}`);
}

// --- Part C: Non-digit token (A=0x9A = 'A') with BIT 4 CLEAR ---
function partC(baselineMem) {
  console.log('\n========== PART C: Non-digit (A=0x9A, "A", token 0x41) with BIT 4 CLEAR ==========');

  const result = runConvKeyToTok(baselineMem, 0x9A, false, true, null);

  const tokenAt0A00 = result.mem[EDIT_BUF] & 0xFF;
  const bufHead = bytesToHex(result.mem, EDIT_BUF, 16);

  console.log(`Termination: ${result.termination}`);
  console.log(`BufInsert reached: ${result.bufInsertCount > 0 ? 'YES' : 'NO'} (count=${result.bufInsertCount})`);
  console.log(`Alternate path blocks hit: ${[...result.altBlocksHit].map((a) => hex(a)).join(', ') || 'NONE'}`);
  console.log(`Cursor before: ${hex(result.cursorBefore)}`);
  console.log(`Cursor after:  ${hex(result.cursorAfter)}`);
  console.log(`Cursor delta:  ${result.cursorAfter - result.cursorBefore}`);
  console.log(`Token at 0xD00A00: ${hexByte(tokenAt0A00)} (expected 0x41 for 'A')`);
  console.log(`Edit buffer [0xD00A00..0xD00A0F]: ${bufHead}`);
  console.log(`Buffer changes: ${result.bufChanges.length > 0 ? result.bufChanges.map((c) => `offset ${c.offset}: ${hexByte(c.was)}->${hexByte(c.now)}`).join(', ') : 'NONE'}`);
  console.log(`Total blocks visited: ${result.visited.length}`);
  console.log(`Visited: ${formatVisited(result.visited)}`);
}

// --- Part D: Same digit with BIT 4 SET (comparison) ---
function partD(baselineMem, partAResult) {
  console.log('\n========== PART D: Single digit (A=0x8F, "1") with BIT 4 SET ==========');

  const result = runConvKeyToTok(baselineMem, 0x8F, true, true, null);

  const tokenAt0A00 = result.mem[EDIT_BUF] & 0xFF;
  const bufHead = bytesToHex(result.mem, EDIT_BUF, 16);

  console.log(`Termination: ${result.termination}`);
  console.log(`BufInsert reached: ${result.bufInsertCount > 0 ? 'YES' : 'NO'} (count=${result.bufInsertCount})`);
  console.log(`Alternate path blocks hit: ${[...result.altBlocksHit].map((a) => hex(a)).join(', ') || 'NONE'}`);
  console.log(`Cursor before: ${hex(result.cursorBefore)}`);
  console.log(`Cursor after:  ${hex(result.cursorAfter)}`);
  console.log(`Cursor delta:  ${result.cursorAfter - result.cursorBefore}`);
  console.log(`Token at 0xD00A00: ${hexByte(tokenAt0A00)}`);
  console.log(`Edit buffer [0xD00A00..0xD00A0F]: ${bufHead}`);
  console.log(`Buffer changes: ${result.bufChanges.length > 0 ? result.bufChanges.map((c) => `offset ${c.offset}: ${hexByte(c.was)}->${hexByte(c.now)}`).join(', ') : 'NONE'}`);
  console.log(`Total blocks visited: ${result.visited.length}`);
  console.log(`Visited: ${formatVisited(result.visited)}`);

  // --- Diff Part A vs Part D ---
  if (partAResult) {
    console.log('\n--- PATH DIFF: BIT 4 CLEAR (Part A) vs BIT 4 SET (Part D) ---');

    const visitedA = partAResult.visited;
    const visitedD = result.visited;

    // Find first divergence point
    const minLen = Math.min(visitedA.length, visitedD.length);
    let divergeIdx = -1;
    for (let i = 0; i < minLen; i++) {
      if (visitedA[i] !== visitedD[i]) {
        divergeIdx = i;
        break;
      }
    }

    if (divergeIdx === -1 && visitedA.length === visitedD.length) {
      console.log('Paths are IDENTICAL (no divergence)');
    } else {
      if (divergeIdx === -1) divergeIdx = minLen;
      console.log(`First divergence at block index ${divergeIdx}:`);
      console.log(`  BIT4 CLEAR: ${hex(visitedA[divergeIdx] & 0x7FFFFFFF) ?? 'END'}`);
      console.log(`  BIT4 SET:   ${hex(visitedD[divergeIdx] & 0x7FFFFFFF) ?? 'END'}`);
      console.log(`  Common prefix (${divergeIdx} blocks): ${visitedA.slice(0, Math.min(divergeIdx, 10)).map((a) => hex(a & 0x7FFFFFFF)).join(', ')}${divergeIdx > 10 ? '...' : ''}`);
    }

    // Blocks unique to each path
    const setA = new Set(visitedA.map((a) => a & 0x7FFFFFFF));
    const setD = new Set(visitedD.map((a) => a & 0x7FFFFFFF));
    const onlyA = [...setA].filter((a) => !setD.has(a)).map((a) => hex(a));
    const onlyD = [...setD].filter((a) => !setA.has(a)).map((a) => hex(a));

    console.log(`Blocks ONLY in BIT4 CLEAR path: ${onlyA.join(', ') || 'NONE'}`);
    console.log(`Blocks ONLY in BIT4 SET path:   ${onlyD.join(', ') || 'NONE'}`);

    // Alt path blocks comparison
    const altInA = ALT_PATH_BLOCKS.filter((b) => setA.has(b)).map((b) => hex(b));
    const altInD = ALT_PATH_BLOCKS.filter((b) => setD.has(b)).map((b) => hex(b));
    console.log(`Alt-path blocks in CLEAR: ${altInA.join(', ') || 'NONE'}`);
    console.log(`Alt-path blocks in SET:   ${altInD.join(', ') || 'NONE'}`);

    console.log(`BufInsert: CLEAR=${partAResult.bufInsertCount}, SET=${result.bufInsertCount}`);
  }

  return result;
}

// --- Main ---
function main() {
  console.log('Phase 219: Trace alternate token insertion path (BIT 4 CLEAR vs SET)');
  console.log('='.repeat(78));

  const baselineMem = bootBaseline();

  const resultA = partA(baselineMem);
  partB(baselineMem);
  partC(baselineMem);
  partD(baselineMem, resultA);

  console.log('\n' + JSON.stringify({
    probe: 'probe-phase219-alt-insert-path.mjs',
    generatedAt: new Date().toISOString(),
    constants: {
      convKeyToTok: hex(CONV_KEY_TO_TOK),
      bufInsert: hex(BUFINSERT),
      altPathBlocks: ALT_PATH_BLOCKS.map((a) => hex(a)),
      iy5: hex(IY5),
      editBuf: hex(EDIT_BUF),
      editCursor: hex(EDIT_CURSOR),
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase219-alt-insert-path.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
