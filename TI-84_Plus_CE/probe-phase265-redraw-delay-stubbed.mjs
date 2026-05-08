#!/usr/bin/env node

/**
 * Phase 265: Test 0x027111 / 0x027123 screen-redraw routines with the
 * 0x006202 delay stub active.
 *
 * Session 263 added a delay stub for 0x006202 (a pure delay loop, ~35K
 * iterations). The screen-redraw routines at 0x027111/0x027123 call 0x0003B0
 * which calls 0x006202 up to 6 times. Previously these were untestable
 * (~215K+ steps in pure delays). Now we can trace them within a reasonable
 * step budget.
 *
 * Tests:
 *   1. Verify the delay stub at 0x006202 is active (returns in <50 steps).
 *   2. 0x027111 with D02A86=0x02 (non-zero), IY+27 bit 6 CLEAR.
 *   3. 0x027123 standalone.
 *   4. 0x027111 with IY+27 bit 6 SET (should RET NZ early).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import * as peripheralRuntime from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const ENTRY_SP = 0xD1A860;
const IX_INIT = 0xD1A860;
const IY_INIT = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const DELAY_LOOP = 0x006202;
const PLL_CONFIG = 0x0003B0;
const ENTRY_027111 = 0x027111;
const ENTRY_027123 = 0x027123;
const LCD_DRAW = 0x02672F;
const RET_0271C2 = 0x0271C2;

const D02A86 = 0xD02A86;
const D026AC = 0xD026AC;
const D02AC0 = 0xD02AC0;

const VRAM_START = 0xD40000;
const VRAM_SAMPLE_END = 0xD40100;

const DELAY_TEST_LIMIT = 100;
const REDRAW_STEP_LIMIT = 20000;

const COMMON_SEEDS = [
  [0xD0058E, 0x8F],
  [0xD0058D, 0x00],
  [0xD0059F, 0x00],
  [0xD003E0, 0x00],
  [0xD00824, 0x00],
  [0xD003DA, 0x00],
  [0xD007E0, 0x40],
  [0xD00000, 0x00],
];

const createPeripheralBus =
  cpuRuntime.createPeripheralBus ?? peripheralRuntime.createPeripheralBus;

if (typeof createPeripheralBus !== 'function') {
  throw new Error('Unable to resolve createPeripheralBus().');
}

if (typeof cpuRuntime.createExecutor !== 'function') {
  throw new Error('cpu-runtime.js does not export createExecutor().');
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return mem[base] | (mem[(base + 1) & MEM_MASK] << 8) | (mem[(base + 2) & MEM_MASK] << 16);
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.',
    );
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase265-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function createCPU(mem, blocks, peripherals) {
  const executor = cpuRuntime.createExecutor(blocks, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function nextMode(executor, key, pc, mode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return mode;
  for (const exit of exits) {
    if (exit.target === pc && exit.targetMode) return exit.targetMode;
  }
  return mode;
}

function installStep(cpu, executor) {
  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks?.[key];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block ${hex(pc)} (${key})`);
    }
    const out = fn(this);
    if (typeof out !== 'number') {
      throw new Error(`Bad step result from ${hex(pc)}: ${String(out)}`);
    }
    if (out >= 0) {
      const modeAfter = nextMode(executor, key, out, mode);
      this.pc = out & 0xFFFFFF;
      this.madl = modeAfter === 'adl' ? 1 : 0;
    }
    return out;
  };
}

function makeRuntime(blocks, romBytes) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, blocks, peripherals);
  installStep(cpu, executor);
  return { mem, cpu, executor };
}

function seedCommon(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.sp = ENTRY_SP;
  cpu.ix = IX_INIT;
  cpu.iy = IY_INIT;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;

  for (const [addr, value] of COMMON_SEEDS) {
    mem[addr & MEM_MASK] = value & 0xFF;
  }

  // Clear IY flag area
  mem.fill(0x00, IY_INIT & MEM_MASK, ((IY_INIT & MEM_MASK) + 128));

  // Return sentinel on stack
  write24(mem, ENTRY_SP, RETURN_SENTINEL);
}

function sampleVRAM(mem) {
  const bytes = new Uint8Array(VRAM_SAMPLE_END - VRAM_START);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = mem[(VRAM_START + i) & MEM_MASK];
  }
  return bytes;
}

function vramNonZeroCount(sample) {
  let count = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] !== 0) count++;
  }
  return count;
}

function hexSample(sample, maxBytes = 32) {
  const slice = sample.subarray(0, maxBytes);
  return Array.from(slice, (b) => hexByte(b)).join(' ');
}

function printDivider(title) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
}

// ---------------------------------------------------------------------------
// Test 1: Verify delay stub at 0x006202
// ---------------------------------------------------------------------------
function testDelayStub(blocks, romBytes) {
  printDivider('TEST 1: Verify delay stub at 0x006202');

  const { mem, cpu } = makeRuntime(blocks, romBytes);
  seedCommon(cpu, mem);

  // Set up as if called: push fake return address, HL and DE on stack
  // (the stub does POP HL; POP DE; RET)
  cpu.sp = ENTRY_SP - 9; // 3 bytes each for HL, DE, return addr
  write24(mem, ENTRY_SP - 3, RETURN_SENTINEL); // return address
  write24(mem, ENTRY_SP - 6, 0x000001);        // DE (pushed second = popped first after HL)
  write24(mem, ENTRY_SP - 9, 0x008B1A);        // HL (pushed first = popped second... wait)

  // Actually, the stub does: pop hl, pop de, ret (popReturn)
  // Stack layout (low to high): [HL] [DE] [return addr]
  // So sp points to HL first
  write24(mem, cpu.sp, 0x008B1A);       // HL (popped first)
  write24(mem, cpu.sp + 3, 0x000001);   // DE (popped second)
  write24(mem, cpu.sp + 6, RETURN_SENTINEL); // return address

  cpu.pc = DELAY_LOOP;

  let steps = 0;
  let stopReason = 'budget';

  for (steps = 0; steps < DELAY_TEST_LIMIT; steps++) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    try {
      const out = cpu.step();
      if (out === -1) { stopReason = 'halt'; break; }
      if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        steps++;
        break;
      }
    } catch (err) {
      stopReason = `error: ${err.message}`;
      break;
    }
  }

  const stubActive = stopReason === 'returned_sentinel' && steps < 50;
  console.log(`  Entry: PC=${hex(DELAY_LOOP)}, step limit=${DELAY_TEST_LIMIT}`);
  console.log(`  Steps taken: ${steps}`);
  console.log(`  Stop reason: ${stopReason}`);
  console.log(`  Stub active: ${stubActive ? 'YES' : 'NO'}`);

  if (!stubActive) {
    console.log('  WARNING: Delay stub does NOT appear active. Redraw tests may timeout.');
  }
  console.log('');
  return stubActive;
}

// ---------------------------------------------------------------------------
// Run a redraw scenario and collect diagnostics
// ---------------------------------------------------------------------------
function runRedrawScenario(name, blocks, romBytes, opts) {
  const { entry, d02a86Value, iyBit6Set, note } = opts;

  printDivider(`TEST: ${name}`);
  console.log(`  Note: ${note}`);

  const { mem, cpu, executor } = makeRuntime(blocks, romBytes);
  seedCommon(cpu, mem);

  // Seed D02A86
  mem[D02A86 & MEM_MASK] = d02a86Value & 0xFF;

  // Seed IY+27 bit 6
  const iy27Addr = (IY_INIT + 27) & MEM_MASK;
  if (iyBit6Set) {
    mem[iy27Addr] = mem[iy27Addr] | 0x40; // set bit 6
  } else {
    mem[iy27Addr] = mem[iy27Addr] & ~0x40; // clear bit 6
  }

  cpu.pc = entry;

  // Snapshot before
  const d026acBefore = read24(mem, D026AC);
  const d02ac0Before = read24(mem, D02AC0);
  const d02a86Before = mem[D02A86 & MEM_MASK] & 0xFF;
  const iy27Before = mem[iy27Addr] & 0xFF;
  const vramBefore = sampleVRAM(mem);

  console.log(`  Entry: PC=${hex(entry)}`);
  console.log(`  D02A86=${hexByte(d02a86Before)}, D026AC=${hex(d026acBefore)}, D02AC0=${hex(d02ac0Before)}`);
  console.log(`  IY+27=${hexByte(iy27Before)} (bit 6 ${iyBit6Set ? 'SET' : 'CLEAR'})`);
  console.log(`  VRAM[D40000..D40020] before: ${hexSample(vramBefore, 32)}`);
  console.log(`  VRAM non-zero bytes (first 256): ${vramNonZeroCount(vramBefore)}`);
  console.log('');

  const uniqueBlocks = new Map();
  const callLog = [];
  const memChanges = [];
  let steps = 0;
  let stopReason = 'budget_exhausted';
  let errorMessage = null;

  // Shadow tracked bytes
  let shadowD02A86 = d02a86Before;
  let shadowD026AC = d026acBefore;
  let shadowD02AC0 = d02ac0Before;
  let shadowIY27 = iy27Before;

  for (steps = 0; steps < REDRAW_STEP_LIMIT; steps++) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    // Track unique blocks
    const blockEntry = uniqueBlocks.get(pc);
    if (blockEntry) {
      blockEntry.count++;
    } else {
      uniqueBlocks.set(pc, { pc, count: 1 });
    }

    // Log interesting calls
    if (pc === DELAY_LOOP) callLog.push({ step: steps, target: 'delay_0x006202' });
    if (pc === PLL_CONFIG) callLog.push({ step: steps, target: 'pll_0x0003B0' });
    if (pc === LCD_DRAW) callLog.push({ step: steps, target: 'lcd_0x02672F' });
    if (pc === ENTRY_027123 && entry !== ENTRY_027123) {
      callLog.push({ step: steps, target: 'fallthrough_0x027123' });
    }

    try {
      const out = cpu.step();

      if (out === -1) { stopReason = 'halt'; break; }
      if (out === -2) { stopReason = 'sleep'; break; }

      const afterPc = cpu.pc & 0xFFFFFF;
      if (afterPc === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        steps++;
        break;
      }
    } catch (err) {
      stopReason = 'error';
      errorMessage = err.message;
      break;
    }

    // Track memory changes
    const curD02A86 = mem[D02A86 & MEM_MASK] & 0xFF;
    const curD026AC = read24(mem, D026AC);
    const curD02AC0 = read24(mem, D02AC0);
    const curIY27 = mem[iy27Addr] & 0xFF;

    if (curD02A86 !== shadowD02A86) {
      memChanges.push({ step: steps, name: 'D02A86', old: hexByte(shadowD02A86), new_: hexByte(curD02A86) });
      shadowD02A86 = curD02A86;
    }
    if (curD026AC !== shadowD026AC) {
      memChanges.push({ step: steps, name: 'D026AC', old: hex(shadowD026AC), new_: hex(curD026AC) });
      shadowD026AC = curD026AC;
    }
    if (curD02AC0 !== shadowD02AC0) {
      memChanges.push({ step: steps, name: 'D02AC0', old: hex(shadowD02AC0), new_: hex(curD02AC0) });
      shadowD02AC0 = curD02AC0;
    }
    if (curIY27 !== shadowIY27) {
      memChanges.push({ step: steps, name: 'IY+27', old: hexByte(shadowIY27), new_: hexByte(curIY27) });
      shadowIY27 = curIY27;
    }
  }

  // Snapshot after
  const vramAfter = sampleVRAM(mem);
  const d026acAfter = read24(mem, D026AC);
  const d02ac0After = read24(mem, D02AC0);
  const d02a86After = mem[D02A86 & MEM_MASK] & 0xFF;
  const iy27After = mem[iy27Addr] & 0xFF;

  // Report
  console.log(`  Steps: ${steps}`);
  console.log(`  Stop reason: ${stopReason}`);
  if (errorMessage) console.log(`  Error: ${errorMessage}`);
  console.log(`  Final PC: ${hex(cpu.pc & 0xFFFFFF)}`);
  console.log('');

  console.log(`  Unique blocks visited: ${uniqueBlocks.size}`);
  const sortedBlocks = [...uniqueBlocks.values()].sort((a, b) => a.pc - b.pc);
  for (const block of sortedBlocks) {
    console.log(`    ${hex(block.pc)} x${block.count}`);
  }
  console.log('');

  console.log(`  Interesting call targets hit (${callLog.length} total):`);
  if (callLog.length === 0) {
    console.log('    (none)');
  } else {
    for (const entry of callLog) {
      console.log(`    step ${String(entry.step).padStart(5)} -> ${entry.target}`);
    }
  }
  console.log('');

  console.log(`  Memory changes (${memChanges.length} total):`);
  if (memChanges.length === 0) {
    console.log('    (none)');
  } else {
    for (const change of memChanges.slice(0, 100)) {
      console.log(`    step ${String(change.step).padStart(5)}: ${change.name} ${change.old} -> ${change.new_}`);
    }
    if (memChanges.length > 100) {
      console.log(`    ... and ${memChanges.length - 100} more`);
    }
  }
  console.log('');

  console.log('  State after:');
  console.log(`    D02A86=${hexByte(d02a86After)} (was ${hexByte(d02a86Before)})`);
  console.log(`    D026AC=${hex(d026acAfter)} (was ${hex(d026acBefore)})`);
  console.log(`    D02AC0=${hex(d02ac0After)} (was ${hex(d02ac0Before)})`);
  console.log(`    IY+27=${hexByte(iy27After)} (was ${hexByte(iy27Before)})`);
  console.log(`    VRAM[D40000..D40020] after: ${hexSample(vramAfter, 32)}`);
  console.log(`    VRAM non-zero bytes (first 256): ${vramNonZeroCount(vramAfter)}`);

  const vramChanged = vramBefore.some((b, i) => b !== vramAfter[i]);
  console.log(`    VRAM changed: ${vramChanged ? 'YES' : 'NO'}`);
  console.log('');

  return { steps, stopReason, errorMessage, uniqueBlocks: sortedBlocks, callLog, memChanges, vramChanged };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const assets = ensureTranspiledModule();
  try {
    const romBytes = fs.readFileSync(ROM_PATH);
    const mod = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      mod.PRELIFTED_BLOCKS ?? mod.default?.PRELIFTED_BLOCKS ?? mod.default ?? mod,
    );
    if (!blocks || typeof blocks !== 'object' || !Object.keys(blocks).length) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }

    console.log('Phase 265: Screen-redraw 0x027111/0x027123 with delay stub active');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log('Peripheral seed: createPeripheralBus({ timerInterrupt: false })');
    console.log(`Entry seed: SP=${hex(ENTRY_SP)} IX=${hex(IX_INIT)} IY=${hex(IY_INIT)} MBASE=${hexByte(MBASE)} RET=${hex(RETURN_SENTINEL)}`);
    console.log('');

    // Test 1: Verify delay stub
    const stubActive = testDelayStub(blocks, romBytes);

    // Test 2: 0x027111 with D02A86=0x02, IY+27 bit 6 CLEAR
    const test2 = runRedrawScenario('0x027111 (D02A86=0x02, bit6=CLEAR)', blocks, romBytes, {
      entry: ENTRY_027111,
      d02a86Value: 0x02,
      iyBit6Set: false,
      note: 'D02A86 non-zero, IY+27 bit 6 clear. Should clear D02A86, call 0x0003B0 + 0x0270F3, BIT 6,(IY+27) -> RET NZ fails, falls into 0x027123.',
    });

    // Test 3: 0x027123 standalone
    const test3 = runRedrawScenario('0x027123 standalone', blocks, romBytes, {
      entry: ENTRY_027123,
      d02a86Value: 0x02,
      iyBit6Set: false,
      note: 'Direct entry at 0x027123. Saves display state, DI, selects timer constant, calls 0x02672F (LCD draw) 3+ times, restores, RET.',
    });

    // Test 4: 0x027111 with IY+27 bit 6 SET (should RET NZ early)
    const test4 = runRedrawScenario('0x027111 (D02A86=0x02, bit6=SET)', blocks, romBytes, {
      entry: ENTRY_027111,
      d02a86Value: 0x02,
      iyBit6Set: true,
      note: 'D02A86 non-zero, IY+27 bit 6 SET. After 0x0003B0 + 0x0270F3, BIT 6,(IY+27) -> RET NZ should take early return.',
    });

    // Summary
    printDivider('SUMMARY');
    console.log(`  Delay stub active: ${stubActive ? 'YES' : 'NO'}`);
    console.log('');
    console.log(`  Test 2 (0x027111, bit6=CLEAR): ${test2.steps} steps, ${test2.stopReason}, ${test2.uniqueBlocks.length} unique blocks, VRAM changed=${test2.vramChanged}`);
    console.log(`  Test 3 (0x027123 standalone):   ${test3.steps} steps, ${test3.stopReason}, ${test3.uniqueBlocks.length} unique blocks, VRAM changed=${test3.vramChanged}`);
    console.log(`  Test 4 (0x027111, bit6=SET):    ${test4.steps} steps, ${test4.stopReason}, ${test4.uniqueBlocks.length} unique blocks, VRAM changed=${test4.vramChanged}`);
    console.log('');

    if (test4.stopReason === 'returned_sentinel' && test4.steps < test2.steps) {
      console.log('  Test 4 confirms: IY+27 bit 6 SET causes early RET NZ (fewer steps than bit6=CLEAR).');
    } else if (test4.stopReason === 'returned_sentinel') {
      console.log('  Test 4 returned to sentinel but did not take fewer steps than test 2.');
    } else {
      console.log(`  Test 4 did not return to sentinel. Stop reason: ${test4.stopReason}`);
    }

    const delayHits2 = test2.callLog.filter((c) => c.target === 'delay_0x006202').length;
    const delayHits3 = test3.callLog.filter((c) => c.target === 'delay_0x006202').length;
    console.log(`  Delay loop (0x006202) visits: test2=${delayHits2}, test3=${delayHits3}`);

    const lcdHits2 = test2.callLog.filter((c) => c.target === 'lcd_0x02672F').length;
    const lcdHits3 = test3.callLog.filter((c) => c.target === 'lcd_0x02672F').length;
    console.log(`  LCD draw (0x02672F) visits:   test2=${lcdHits2}, test3=${lcdHits3}`);
    console.log('');
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
