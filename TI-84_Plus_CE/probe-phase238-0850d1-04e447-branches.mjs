#!/usr/bin/env node

/**
 * Phase 238: Trace the two branches from 0x04EDD0's D003E0 gate
 *
 * Session 237 decoded 0x04EDD0 as a shared post-classification handler.
 * After its initial calls (0x04ECCE, 0x0A21EC), it tests bits in D003E0
 * to branch to either:
 *   - 0x0850D1 — suspected "display update path"
 *   - 0x04E447 — suspected "alternate path"
 *
 * This probe:
 *   Test A: Enter at 0x0850D1 with home-screen state, run 500 steps
 *           Snapshot VRAM and OP regs, track display functions
 *   Test B: Enter at 0x04E447 with same state, run 500 steps
 *           Check if it converges to event loop 0x02FD99
 *   Test C: Check D003E0 after full boot, trace from 0x04EDD0
 *           to see which gate fires on home screen
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

// Boot sequence constants (from probe-phase99d)
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

// Target addresses
const BRANCH_A_ENTRY = 0x0850D1;
const BRANCH_B_ENTRY = 0x04E447;
const HANDLER_ENTRY = 0x04EDD0;

const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;
const IX_HOME = 0xD1A860;

const STEP_LIMIT = 500;

// Key RAM addresses
const D003E0_ADDR = 0xD003E0;
const D00824_ADDR = 0xD00824;
const D0058E_ADDR = 0xD0058E;
const D003DA_ADDR = 0xD003DA;
const D007E0_ADDR = 0xD007E0;

// OP register area (OP1-OP6: 0xD005F8-0xD00627)
const OP_START = 0xD005F8;
const OP_END = 0xD00628;

// VRAM snapshot region
const VRAM_SNAP_START = 0xD40000;
const VRAM_SNAP_END = 0xD40100;

// Display function waypoints
const DISPLAY_FUNCTIONS = new Map([
  [0x05E2A0, 'BufInsert (display buffer insert)'],
  [0x08383D, 'display function 0x08383D'],
  [0x07F9FB, 'display function 0x07F9FB'],
  [0x02FD99, 'event loop 0x02FD99'],
  [0x04ECCE, '0x04ECCE (first downstream from 0x04EDD0)'],
  [0x0A21EC, '0x0A21EC (second downstream from 0x04EDD0)'],
  [0x0850D1, '0x0850D1 (branch A entry)'],
  [0x04E447, '0x04E447 (branch B entry)'],
  [0x04EDD0, '0x04EDD0 (handler entry)'],
  [0x09EFDE, '0x09EFDE computation loop'],
]);

// ---------- Helpers ----------

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

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function snapshotRegion(mem, start, end) {
  return new Uint8Array(mem.slice(start, end));
}

function diffRegion(before, after, baseAddr) {
  const changes = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      changes.push({ offset: i, addr: baseAddr + i, before: before[i], after: after[i] });
    }
  }
  return changes;
}

function snapshotOpRegs(mem) {
  const snapshot = {};
  for (let addr = OP_START; addr < OP_END; addr++) {
    snapshot[addr] = mem[addr & MEM_MASK];
  }
  return snapshot;
}

function diffOpRegs(before, after) {
  const changes = [];
  for (let addr = OP_START; addr < OP_END; addr++) {
    if (before[addr] !== after[addr]) {
      changes.push(`${hex(addr)}:${hexByte(before[addr])}->${hexByte(after[addr])}`);
    }
  }
  return changes;
}

function makeStopError(reason, pc) {
  const error = new Error('__PHASE238_STOP__');
  error.phase238Stop = { reason, pc: pc & 0xFFFFFF };
  return error;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase238-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

// ---------- Boot sequence (from probe-phase99d) ----------

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

const CPU_SNAPSHOT_FIELDS = [
  'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
];

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_BASE;
  cpu.f = 0x40;
  cpu._ix = IX_HOME;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

// ---------- Branch trace ----------

function traceBranch(label, entryAddr, blocks, mem, cpuSnap, romBytes) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const freshMem = new Uint8Array(mem);
  const executor = createExecutor(blocks, freshMem, { peripherals });
  const cpu = executor.cpu;

  // Restore post-boot CPU state
  restoreCpu(cpu, cpuSnap, freshMem);

  // Set up stack with return sentinel
  cpu.sp = STACK_RESET_TOP;
  push24(cpu, freshMem, RETURN_SENTINEL);

  // Snapshots before
  const vramBefore = snapshotRegion(freshMem, VRAM_SNAP_START, VRAM_SNAP_END);
  const opBefore = snapshotOpRegs(freshMem);

  const visited = new Map(); // pc -> visit count
  const waypointLog = [];
  let steps = 0;
  let stopReason = 'max_steps';
  let stopPc = entryAddr;
  let retStep = null;

  try {
    const result = executor.runFrom(entryAddr, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: 64,
      onBlock(pc, mode, meta, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.set(currentPc, (visited.get(currentPc) || 0) + 1);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (DISPLAY_FUNCTIONS.has(currentPc)) {
          waypointLog.push({
            step: steps,
            pc: currentPc,
            a: cpu.a & 0xFF,
            note: DISPLAY_FUNCTIONS.get(currentPc),
          });
        }

        if (currentPc === RETURN_SENTINEL) {
          retStep = steps;
          throw makeStopError('return_sentinel', currentPc);
        }
      },
      onMissingBlock(pc, mode, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.set(currentPc, (visited.get(currentPc) || 0) + 1);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          retStep = steps;
          throw makeStopError('return_sentinel', currentPc);
        }
        throw makeStopError('missing_block', currentPc);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    stopPc = (result.lastPc ?? stopPc) & 0xFFFFFF;
    stopReason = result.termination ?? stopReason;
  } catch (error) {
    if (error?.phase238Stop) {
      stopReason = error.phase238Stop.reason;
      stopPc = error.phase238Stop.pc;
    } else {
      stopReason = `error: ${error?.message ?? String(error)}`;
    }
  }

  // Snapshots after
  const vramAfter = snapshotRegion(freshMem, VRAM_SNAP_START, VRAM_SNAP_END);
  const opAfter = snapshotOpRegs(freshMem);

  const vramChanges = diffRegion(vramBefore, vramAfter, VRAM_SNAP_START);
  const opChanges = diffOpRegs(opBefore, opAfter);

  // Sort visited blocks by first appearance (Map preserves insertion order)
  const uniqueBlocks = [...visited.keys()];
  const visitCounts = [...visited.entries()].sort((a, b) => b[1] - a[1]);

  return {
    label,
    entryAddr,
    steps,
    stopReason,
    stopPc,
    retStep,
    uniqueBlocks,
    visitCounts,
    waypointLog,
    vramChanges,
    opChanges,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalHL: cpu.hl & 0xFFFFFF,
    finalDE: cpu.de & 0xFFFFFF,
    finalBC: cpu.bc & 0xFFFFFF,
    finalSP: cpu.sp & 0xFFFFFF,
    finalIX: cpu.ix & 0xFFFFFF,
    finalIY: cpu.iy & 0xFFFFFF,
  };
}

// ---------- Test C: D003E0 gate trace from 0x04EDD0 ----------

function traceHandlerGate(blocks, mem, cpuSnap) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const freshMem = new Uint8Array(mem);
  const executor = createExecutor(blocks, freshMem, { peripherals });
  const cpu = executor.cpu;

  restoreCpu(cpu, cpuSnap, freshMem);
  cpu.sp = STACK_RESET_TOP;
  push24(cpu, freshMem, RETURN_SENTINEL);

  // Set A to a recognized key code so we get past classifier
  cpu.a = 0x44;

  const d003e0Value = freshMem[D003E0_ADDR];

  const visited = [];
  let hitBranchA = false;
  let hitBranchB = false;
  let steps = 0;
  let stopReason = 'max_steps';
  let stopPc = HANDLER_ENTRY;

  try {
    executor.runFrom(HANDLER_ENTRY, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: 64,
      onBlock(pc, mode, meta, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === BRANCH_A_ENTRY) hitBranchA = true;
        if (currentPc === BRANCH_B_ENTRY) hitBranchB = true;

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
      },
      onMissingBlock(pc, mode, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
        throw makeStopError('missing_block', currentPc);
      },
    });
  } catch (error) {
    if (error?.phase238Stop) {
      stopReason = error.phase238Stop.reason;
      stopPc = error.phase238Stop.pc;
    } else {
      stopReason = `error: ${error?.message ?? String(error)}`;
    }
  }

  return {
    d003e0Value,
    hitBranchA,
    hitBranchB,
    steps,
    stopReason,
    stopPc,
    visited: [...new Set(visited)],
  };
}

// ---------- Print helpers ----------

function printBranchResult(result) {
  console.log('------------------------------------------------------------------------');
  console.log(`${result.label}: entry=${hex(result.entryAddr)}`);
  console.log('------------------------------------------------------------------------');
  console.log(`  Stop reason:     ${result.stopReason}`);
  console.log(`  Stop PC:         ${hex(result.stopPc)}`);
  console.log(`  Steps:           ${result.steps}`);
  console.log(`  RET at step:     ${result.retStep !== null ? result.retStep : '(did not RET)'}`);
  console.log(`  Final regs:      A=${hexByte(result.finalA)} F=${hexByte(result.finalF)} HL=${hex(result.finalHL)} DE=${hex(result.finalDE)} BC=${hex(result.finalBC)}`);
  console.log(`  Final SP:        ${hex(result.finalSP)}  IX=${hex(result.finalIX)}  IY=${hex(result.finalIY)}`);
  console.log('');

  // Unique blocks with visit counts
  console.log(`  Unique blocks: ${result.uniqueBlocks.length}`);
  const top10 = result.visitCounts.slice(0, 10);
  console.log('  Top visited blocks:');
  for (const [pc, count] of top10) {
    const waypoint = DISPLAY_FUNCTIONS.get(pc);
    const tag = waypoint ? ` — ${waypoint}` : '';
    console.log(`    ${hex(pc)}: ${count} visits${tag}`);
  }
  console.log('');

  // Block chain (first appearance order)
  const MAX_LINE = 100;
  const blockStr = result.uniqueBlocks.map((pc) => hex(pc)).join(' -> ');
  if (blockStr.length <= MAX_LINE) {
    console.log(`  Block chain:   ${blockStr}`);
  } else {
    console.log('  Block chain:');
    let line = '    ';
    for (let i = 0; i < result.uniqueBlocks.length; i++) {
      const token = hex(result.uniqueBlocks[i]);
      const sep = i > 0 ? ' -> ' : '';
      if (line.length + sep.length + token.length > MAX_LINE && line.trim()) {
        console.log(line);
        line = '      ' + token;
      } else {
        line += sep + token;
      }
    }
    if (line.trim()) console.log(line);
  }
  console.log('');

  // VRAM changes
  if (result.vramChanges.length > 0) {
    console.log(`  VRAM changes (0xD40000-0xD40100): ${result.vramChanges.length} bytes modified`);
    const showMax = 20;
    for (let i = 0; i < Math.min(result.vramChanges.length, showMax); i++) {
      const c = result.vramChanges[i];
      console.log(`    ${hex(c.addr)}: ${hexByte(c.before)} -> ${hexByte(c.after)}`);
    }
    if (result.vramChanges.length > showMax) {
      console.log(`    ... and ${result.vramChanges.length - showMax} more`);
    }
  } else {
    console.log('  VRAM changes (0xD40000-0xD40100): (none)');
  }
  console.log('');

  // OP register changes
  if (result.opChanges.length > 0) {
    console.log(`  OP reg changes (D005F8..D00627): ${result.opChanges.length} bytes`);
    for (const change of result.opChanges) {
      console.log(`    ${change}`);
    }
  } else {
    console.log('  OP reg changes (D005F8..D00627): (none)');
  }
  console.log('');

  // Waypoints
  if (result.waypointLog.length > 0) {
    console.log(`  Waypoints hit (${result.waypointLog.length}):`);
    for (const wp of result.waypointLog) {
      console.log(`    Step ${String(wp.step).padStart(4)}: ${hex(wp.pc)} A=${hexByte(wp.a)} — ${wp.note}`);
    }
  } else {
    console.log('  Waypoints hit: (none)');
  }
  console.log('');
}

// ---------- Main ----------

async function main() {
  console.log('Phase 238: Trace 0x0850D1 and 0x04E447 branches from 0x04EDD0 D003E0 gate');
  console.log('');

  const romBytes = fs.readFileSync(ROM_PATH);
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
        romModule.default?.PRELIFTED_BLOCKS ??
        romModule.default ??
        romModule,
    );

    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Step limit: ${STEP_LIMIT}`);
    console.log('');

    // ---------- Full boot ----------
    console.log('========================================================================');
    console.log('BOOT: Cold boot to home-screen state');
    console.log('========================================================================');

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes);
    // Clear VRAM
    mem.fill(0xAA, 0xD40000, 0xD40000 + 320 * 240 * 2);

    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    const bootResult = coldBoot(executor, cpu, mem);
    console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

    const cpuSnap = snapshotCpu(cpu);

    // Report post-boot D003E0 value
    const d003e0PostBoot = mem[D003E0_ADDR];
    console.log(`D003E0 after boot: ${hexByte(d003e0PostBoot)}`);
    console.log(`D00824 after boot: ${hexByte(mem[D00824_ADDR])}`);
    console.log(`D007E0 after boot: ${hexByte(mem[D007E0_ADDR])}`);
    console.log('');

    // ---------- Test A: 0x0850D1 branch ----------
    console.log('========================================================================');
    console.log('TEST A: 0x0850D1 — suspected display update path');
    console.log('========================================================================');
    console.log('');

    const resultA = traceBranch('Test A (0x0850D1)', BRANCH_A_ENTRY, blocks, mem, cpuSnap, romBytes);
    printBranchResult(resultA);

    // ---------- Test B: 0x04E447 branch ----------
    console.log('========================================================================');
    console.log('TEST B: 0x04E447 — suspected alternate path');
    console.log('========================================================================');
    console.log('');

    const resultB = traceBranch('Test B (0x04E447)', BRANCH_B_ENTRY, blocks, mem, cpuSnap, romBytes);
    printBranchResult(resultB);

    // ---------- Test C: Which branch fires on home screen? ----------
    console.log('========================================================================');
    console.log('TEST C: Which branch does D003E0 gate take on home screen?');
    console.log('========================================================================');
    console.log('');

    const gateResult = traceHandlerGate(blocks, mem, cpuSnap);
    console.log(`  D003E0 value at entry: ${hexByte(gateResult.d003e0Value)}`);
    console.log(`  Hit 0x0850D1 (branch A): ${gateResult.hitBranchA ? 'YES' : 'NO'}`);
    console.log(`  Hit 0x04E447 (branch B): ${gateResult.hitBranchB ? 'YES' : 'NO'}`);
    console.log(`  Stop reason: ${gateResult.stopReason}`);
    console.log(`  Stop PC: ${hex(gateResult.stopPc)}`);
    console.log(`  Steps: ${gateResult.steps}`);
    console.log(`  Unique blocks: ${gateResult.visited.length}`);
    const gateBlockStr = gateResult.visited.map((pc) => hex(pc)).join(' -> ');
    if (gateBlockStr.length <= 100) {
      console.log(`  Block chain: ${gateBlockStr}`);
    } else {
      console.log('  Block chain:');
      let line = '    ';
      for (let i = 0; i < gateResult.visited.length; i++) {
        const token = hex(gateResult.visited[i]);
        const sep = i > 0 ? ' -> ' : '';
        if (line.length + sep.length + token.length > 100 && line.trim()) {
          console.log(line);
          line = '      ' + token;
        } else {
          line += sep + token;
        }
      }
      if (line.trim()) console.log(line);
    }
    console.log('');

    // ---------- Analysis ----------
    console.log('========================================================================');
    console.log('ANALYSIS');
    console.log('========================================================================');
    console.log('');

    // Path overlap
    const setA = new Set(resultA.uniqueBlocks);
    const setB = new Set(resultB.uniqueBlocks);
    const common = resultA.uniqueBlocks.filter(pc => setB.has(pc));
    const onlyA = resultA.uniqueBlocks.filter(pc => !setB.has(pc));
    const onlyB = resultB.uniqueBlocks.filter(pc => !setA.has(pc));

    console.log('  Path comparison:');
    console.log(`    Common blocks:       ${common.length}`);
    console.log(`    Only in 0x0850D1:    ${onlyA.length}`);
    console.log(`    Only in 0x04E447:    ${onlyB.length}`);
    console.log('');

    if (onlyA.length > 0) {
      console.log(`    0x0850D1-only blocks: ${onlyA.map(hex).join(', ')}`);
    }
    if (onlyB.length > 0) {
      console.log(`    0x04E447-only blocks: ${onlyB.map(hex).join(', ')}`);
    }
    console.log('');

    // Classification
    console.log('  Branch classification:');
    console.log('');

    const aHasVram = resultA.vramChanges.length > 0;
    const bHasVram = resultB.vramChanges.length > 0;
    const aHasOp = resultA.opChanges.length > 0;
    const bHasOp = resultB.opChanges.length > 0;
    const aHasDisplay = resultA.waypointLog.some(wp =>
      wp.pc === 0x05E2A0 || wp.pc === 0x08383D || wp.pc === 0x07F9FB
    );
    const bHasEventLoop = resultB.waypointLog.some(wp => wp.pc === 0x02FD99);

    console.log(`    0x0850D1 (branch A):`);
    console.log(`      VRAM writes:        ${aHasVram ? 'YES' : 'NO'} (${resultA.vramChanges.length} bytes)`);
    console.log(`      OP reg changes:     ${aHasOp ? 'YES' : 'NO'} (${resultA.opChanges.length} bytes)`);
    console.log(`      Display func hit:   ${aHasDisplay ? 'YES' : 'NO'}`);
    console.log(`      Steps to RET:       ${resultA.retStep ?? '(did not RET)'}`);
    console.log(`      Classification:     ${aHasVram || aHasDisplay ? 'DISPLAY UPDATE' : aHasOp ? 'COMPUTATION' : 'UNKNOWN'}`);
    console.log('');

    console.log(`    0x04E447 (branch B):`);
    console.log(`      VRAM writes:        ${bHasVram ? 'YES' : 'NO'} (${resultB.vramChanges.length} bytes)`);
    console.log(`      OP reg changes:     ${bHasOp ? 'YES' : 'NO'} (${resultB.opChanges.length} bytes)`);
    console.log(`      Event loop hit:     ${bHasEventLoop ? 'YES' : 'NO'}`);
    console.log(`      Steps to RET:       ${resultB.retStep ?? '(did not RET)'}`);
    console.log(`      Classification:     ${bHasEventLoop ? 'EVENT LOOP CONVERGENCE' : bHasVram ? 'DISPLAY UPDATE' : bHasOp ? 'COMPUTATION' : 'UNKNOWN'}`);
    console.log('');

    // Home-screen gate result
    console.log('  Home-screen gate result:');
    const gateBranch = gateResult.hitBranchA ? '0x0850D1 (branch A)' :
                       gateResult.hitBranchB ? '0x04E447 (branch B)' :
                       'NEITHER (early exit or error)';
    console.log(`    D003E0=${hexByte(gateResult.d003e0Value)} -> takes: ${gateBranch}`);
    console.log('');

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
