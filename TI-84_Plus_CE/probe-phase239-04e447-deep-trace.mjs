#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const MEM_INIT_ENTRY = 0x0802B2;

const ENTRY_PC = 0x04E447;
const TRACE_BUDGETS = [3000, 10000];
const REG_SNAPSHOT_INTERVAL = 500;

const RETURN_SENTINEL = 0x7FFFFE;
const STACK_RESET_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_HOME = 0xD1A860;
const IY_HOME = 0xD00080;

const D00000_ADDR = 0xD00000;
const D003DA_ADDR = 0xD003DA;
const D003E0_ADDR = 0xD003E0;
const D0058D_ADDR = 0xD0058D;
const D0058E_ADDR = 0xD0058E;
const D0059F_ADDR = 0xD0059F;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;

const D003E0_SEED = 0x08;

const OP_START = 0xD005F8;
const OP_END = 0xD00628;

const A1XXX_START = 0x0A1000;
const A1XXX_END = 0x0A2000;
const LOOP_RANGE_START = 0x0A1A3B;
const LOOP_RANGE_END = 0x0A1A4F;

const WATCH_REGIONS = [
  { name: 'OP1-OP6', start: OP_START, length: OP_END - OP_START },
  { name: 'D003E0', start: D003E0_ADDR, length: 1 },
  { name: 'D007E0', start: D007E0_ADDR, length: 1 },
];

const IMPORTANT_BLOCKS = new Map([
  [ENTRY_PC, 'direct entry'],
  [0x0A1A3B, 'loop gate'],
  [0x0A1A44, 'shift branch'],
  [0x0A1A48, 'store/djnz'],
  [0x0A1A4E, 'helper return'],
  [0x0A1A58, 'bit7 set path'],
  [0x0A1A68, 'carry path'],
]);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
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

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      source: 'js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.',
    );
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase239-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));

  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const memInit = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernelInit, memInit };
}

function seedHomeState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = ENTRY_PC;
  cpu.ix = IX_HOME;
  cpu.iy = IY_HOME;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP;

  mem.fill(0xFF, STACK_RESET_TOP - 32, STACK_RESET_TOP);
  mem[D00000_ADDR] = 0x00;
  mem[D003DA_ADDR] = 0x00;
  mem[D003E0_ADDR] = D003E0_SEED;
  mem[D0058D_ADDR] = 0x00;
  mem[D0058E_ADDR] = 0x00;
  mem[D0059F_ADDR] = 0x00;
  mem[D007E0_ADDR] = 0x40;
  mem[D00824_ADDR] = 0x00;

  push24(cpu, mem, RETURN_SENTINEL);
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) {
    return currentMode;
  }

  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }

  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    this._currentBlockPc = pc;
    const result = fn(this);

    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }

    return result;
  };
}

function snapshotWatchRegions(mem) {
  const snapshot = {};

  for (const region of WATCH_REGIONS) {
    snapshot[region.name] = {
      start: region.start,
      end: region.start + region.length - 1,
      bytes: Uint8Array.from(mem.subarray(region.start, region.start + region.length)),
    };
  }

  return snapshot;
}

function diffBytes(beforeBytes, afterBytes, startAddr, limit = 128) {
  const changes = [];

  for (let index = 0; index < beforeBytes.length; index++) {
    if (beforeBytes[index] !== afterBytes[index]) {
      changes.push({
        addr: startAddr + index,
        before: beforeBytes[index],
        after: afterBytes[index],
      });
      if (changes.length >= limit) {
        break;
      }
    }
  }

  return changes;
}

function diffWatchRegions(before, after) {
  const diffs = [];

  for (const region of WATCH_REGIONS) {
    const beforeRegion = before[region.name];
    const afterRegion = after[region.name];
    let totalChanged = 0;

    for (let index = 0; index < beforeRegion.bytes.length; index++) {
      if (beforeRegion.bytes[index] !== afterRegion.bytes[index]) {
        totalChanged++;
      }
    }

    diffs.push({
      name: region.name,
      start: region.start,
      end: region.start + region.length - 1,
      totalChanged,
      changes: diffBytes(beforeRegion.bytes, afterRegion.bytes, region.start),
    });
  }

  return diffs;
}

function rangeOverlaps(startA, lengthA, startB, lengthB) {
  const endA = startA + lengthA;
  const endB = startB + lengthB;
  return startA < endB && startB < endA;
}

function readBytes(mem, addr, width) {
  const bytes = new Uint8Array(width);

  for (let index = 0; index < width; index++) {
    bytes[index] = mem[(addr + index) & MEM_MASK];
  }

  return bytes;
}

function sameBytes(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

function installWriteTrace(cpu, stepRef) {
  const mem = cpu.memory;
  const regionWrites = [];
  const regionWriteCounts = new Map();

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function captureWrite(addr, width, before, after) {
    if (sameBytes(before, after)) {
      return;
    }

    const pc = cpu._currentBlockPc & 0xFFFFFF;

    for (const region of WATCH_REGIONS) {
      if (!rangeOverlaps(addr, width, region.start, region.length)) {
        continue;
      }

      regionWriteCounts.set(region.name, (regionWriteCounts.get(region.name) ?? 0) + 1);
      if (regionWrites.length < 128) {
        regionWrites.push({
          step: stepRef.current,
          pc,
          region: region.name,
          addr,
          width,
          before: bytesToHex(before),
          after: bytesToHex(after),
        });
      }
    }
  }

  cpu.write8 = (addr, value) => {
    const base = addr & MEM_MASK;
    const before = readBytes(mem, base, 1);
    originalWrite8(base, value);
    const after = readBytes(mem, base, 1);
    captureWrite(base, 1, before, after);
  };

  cpu.write16 = (addr, value) => {
    const base = addr & MEM_MASK;
    const before = readBytes(mem, base, 2);
    originalWrite16(base, value);
    const after = readBytes(mem, base, 2);
    captureWrite(base, 2, before, after);
  };

  cpu.write24 = (addr, value) => {
    const base = addr & MEM_MASK;
    const before = readBytes(mem, base, 3);
    originalWrite24(base, value);
    const after = readBytes(mem, base, 3);
    captureWrite(base, 3, before, after);
  };

  return () => {
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
    return {
      regionWrites,
      regionWriteCounts: Object.fromEntries(regionWriteCounts),
    };
  };
}

function recordVisit(visitCounts, pc) {
  visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);
}

function captureRegisters(step, cpu, note = '') {
  return {
    step,
    pc: cpu.pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    note,
  };
}

function inA1xxx(pc) {
  return pc >= A1XXX_START && pc < A1XXX_END;
}

function inLoopRange(pc) {
  return pc >= LOOP_RANGE_START && pc < LOOP_RANGE_END;
}

function formatHexDump(bytes, baseAddr) {
  const lines = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const slice = bytes.subarray(offset, offset + 16);
    lines.push(`    ${hex(baseAddr + offset)}: ${bytesToHex(slice)}`);
  }
  return lines;
}

function traceScenario(label, budget, blocks, baseMem, cpuSnapshot) {
  const mem = new Uint8Array(baseMem);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  installStepShim(cpu, executor);
  restoreCpu(cpu, cpuSnapshot);
  seedHomeState(cpu, mem);

  const watchBefore = snapshotWatchRegions(mem);
  const stackBase = cpu.sp & 0xFFFFFF;
  const stepRef = { current: 0 };
  const uninstallWriteTrace = installWriteTrace(cpu, stepRef);

  const visitCounts = new Map();
  const registerSnapshots = [captureRegisters(0, cpu, 'entry')];
  const spTransitions = [];

  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let retStep = null;
  let firstA1xxx = null;
  let a1xxxExit = null;
  let firstLoop = null;
  let loopExit = null;
  let minSp = stackBase;

  try {
    while (executedSteps < budget) {
      const pc = cpu.pc & 0xFFFFFF;
      const currentStep = executedSteps + 1;
      recordVisit(visitCounts, pc);

      if (pc === RETURN_SENTINEL) {
        retStep = currentStep;
        stopReason = 'return_sentinel';
        break;
      }

      if (!firstA1xxx && inA1xxx(pc)) {
        firstA1xxx = { step: currentStep, pc };
      }

      if (!firstLoop && inLoopRange(pc)) {
        firstLoop = { step: currentStep, pc };
      }

      const beforeSp = cpu.sp & 0xFFFFFF;
      stepRef.current = currentStep;

      let result;
      try {
        result = cpu.step();
      } catch (traceError) {
        stopReason = 'error';
        error = traceError instanceof Error ? traceError.message : String(traceError);
        break;
      }

      executedSteps++;

      const afterPc = cpu.pc & 0xFFFFFF;
      const afterSp = cpu.sp & 0xFFFFFF;

      if (afterSp < minSp) {
        minSp = afterSp;
      }

      if (afterSp !== beforeSp && spTransitions.length < 256) {
        spTransitions.push({
          step: currentStep,
          pc,
          from: beforeSp,
          to: afterSp,
          delta: afterSp - beforeSp,
        });
      }

      if (!loopExit && inLoopRange(pc) && !inLoopRange(afterPc)) {
        loopExit = {
          step: executedSteps,
          fromPc: pc,
          toPc: afterPc,
        };
      }

      if (!a1xxxExit && inA1xxx(pc) && !inA1xxx(afterPc)) {
        a1xxxExit = {
          step: executedSteps,
          fromPc: pc,
          toPc: afterPc,
        };
      }

      if (executedSteps % REG_SNAPSHOT_INTERVAL === 0) {
        registerSnapshots.push(captureRegisters(executedSteps, cpu));
      }

      if (result === -1) {
        stopReason = 'halt';
        break;
      }
      if (result === -2) {
        stopReason = 'sleep';
        break;
      }
      if (afterPc === RETURN_SENTINEL) {
        retStep = executedSteps;
        stopReason = 'return_sentinel';
        break;
      }
    }
  } finally {
    const writeTrace = uninstallWriteTrace();
    const watchAfter = snapshotWatchRegions(mem);
    const regionDiffs = diffWatchRegions(watchBefore, watchAfter);
    const lastSnapshot = registerSnapshots[registerSnapshots.length - 1];

    if (lastSnapshot.step !== executedSteps) {
      registerSnapshots.push(captureRegisters(executedSteps, cpu, stopReason));
    }

    const visitEntries = [...visitCounts.entries()];
    const hotBlocks = visitEntries
      .slice()
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const loopBlockCounts = visitEntries
      .filter(([pc]) => inLoopRange(pc))
      .sort((a, b) => a[0] - b[0]);
    const a1xxxVisitCount = visitEntries
      .filter(([pc]) => inA1xxx(pc))
      .reduce((sum, [, count]) => sum + count, 0);
    const loopVisitCount = visitEntries
      .filter(([pc]) => inLoopRange(pc))
      .reduce((sum, [, count]) => sum + count, 0);

    return {
      label,
      budget,
      executedSteps,
      stopReason,
      error,
      retStep,
      firstA1xxx,
      a1xxxExit,
      firstLoop,
      loopExit,
      stackBase,
      minSp,
      maxDepthBytes: Math.max(0, stackBase - minSp),
      totalUniqueBlocks: visitCounts.size,
      a1xxxVisitCount,
      loopVisitCount,
      finalPc: cpu.pc & 0xFFFFFF,
      finalA: cpu.a & 0xFF,
      finalBC: cpu.bc & 0xFFFFFF,
      finalDE: cpu.de & 0xFFFFFF,
      finalHL: cpu.hl & 0xFFFFFF,
      finalIX: cpu.ix & 0xFFFFFF,
      finalIY: cpu.iy & 0xFFFFFF,
      finalSP: cpu.sp & 0xFFFFFF,
      hotBlocks,
      loopBlockCounts,
      registerSnapshots,
      spTransitions,
      watchBefore,
      watchAfter,
      regionDiffs,
      writeTrace,
    };
  }
}

function printVisitCounts(title, entries) {
  console.log(title);
  if (entries.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const [pc, count] of entries) {
    const note = IMPORTANT_BLOCKS.has(pc) ? ` - ${IMPORTANT_BLOCKS.get(pc)}` : '';
    console.log(`  ${hex(pc)}: visits=${count}${note}`);
  }
  console.log('');
}

function printRegisterSnapshots(snapshots) {
  console.log('Register snapshots:');
  for (const snapshot of snapshots) {
    const suffix = snapshot.note ? ` (${snapshot.note})` : '';
    console.log(
      `  step ${String(snapshot.step).padStart(5, ' ')}: ` +
      `PC=${hex(snapshot.pc)} A=${hexByte(snapshot.a)} ` +
      `BC=${hex(snapshot.bc)} DE=${hex(snapshot.de)} HL=${hex(snapshot.hl)} ` +
      `IX=${hex(snapshot.ix)} IY=${hex(snapshot.iy)} SP=${hex(snapshot.sp)}${suffix}`,
    );
  }
  console.log('');
}

function printRegionSnapshots(before, after) {
  console.log('Watched RAM before/after:');
  for (const region of WATCH_REGIONS) {
    const beforeRegion = before[region.name];
    const afterRegion = after[region.name];
    if (region.length <= 16) {
      console.log(
        `  ${region.name} ${hex(region.start)}: ` +
        `${bytesToHex(beforeRegion.bytes)} -> ${bytesToHex(afterRegion.bytes)}`,
      );
      continue;
    }

    console.log(`  ${region.name} before (${hex(region.start)}..${hex(region.start + region.length - 1)}):`);
    for (const line of formatHexDump(beforeRegion.bytes, region.start)) {
      console.log(line);
    }
    console.log(`  ${region.name} after:`);
    for (const line of formatHexDump(afterRegion.bytes, region.start)) {
      console.log(line);
    }
  }
  console.log('');
}

function printRegionDiffs(regionDiffs) {
  console.log('Watched RAM diffs:');
  for (const diff of regionDiffs) {
    console.log(`  ${diff.name} (${hex(diff.start)}..${hex(diff.end)}): ${diff.totalChanged} changed byte(s)`);
    if (diff.changes.length === 0) {
      console.log('    (none)');
      continue;
    }
    for (const change of diff.changes) {
      console.log(`    ${hex(change.addr)}: ${hexByte(change.before)} -> ${hexByte(change.after)}`);
    }
  }
  console.log('');
}

function printWriteSamples(writeTrace) {
  console.log('Watched write counts:');
  const names = Object.keys(writeTrace.regionWriteCounts);
  if (names.length === 0) {
    console.log('  (none)');
  } else {
    for (const name of names) {
      console.log(`  ${name}: ${writeTrace.regionWriteCounts[name]}`);
    }
  }
  console.log('');

  console.log('Watched write samples:');
  if (writeTrace.regionWrites.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const entry of writeTrace.regionWrites) {
    console.log(
      `  step ${String(entry.step).padStart(5, ' ')} ${hex(entry.pc)} ` +
      `${entry.region} ${hex(entry.addr)} width=${entry.width} ` +
      `${entry.before} -> ${entry.after}`,
    );
  }
  console.log('');
}

function printStackSummary(result) {
  console.log('Stack tracking:');
  console.log(`  start SP:       ${hex(result.stackBase)}`);
  console.log(`  min SP:         ${hex(result.minSp)}`);
  console.log(`  max depth:      ${result.maxDepthBytes} bytes`);
  console.log(`  SP transitions: ${result.spTransitions.length}`);
  if (result.spTransitions.length === 0) {
    console.log('  samples: (none)');
    console.log('');
    return;
  }

  console.log('  samples:');
  for (const entry of result.spTransitions) {
    console.log(
      `    step ${String(entry.step).padStart(5, ' ')} ${hex(entry.pc)} ` +
      `SP ${hex(entry.from)} -> ${hex(entry.to)} delta=${entry.delta}`,
    );
  }
  console.log('');
}

function printScenarioResult(result) {
  console.log('========================================================================');
  console.log(`${result.label}: ${result.budget} steps from direct 0x04E447 entry`);
  console.log('========================================================================');
  console.log(`  Stop reason:         ${result.stopReason}`);
  console.log(`  Error:               ${result.error ?? '(none)'}`);
  console.log(`  Executed steps:      ${result.executedSteps}`);
  console.log(`  Return sentinel:     ${result.retStep ?? '(not reached)'}`);
  console.log(`  First 0x0A1xxx hit:  ${result.firstA1xxx ? `step ${result.firstA1xxx.step} @ ${hex(result.firstA1xxx.pc)}` : '(never entered)'}`);
  console.log(`  0x0A1xxx exit:       ${result.a1xxxExit ? `step ${result.a1xxxExit.step} ${hex(result.a1xxxExit.fromPc)} -> ${hex(result.a1xxxExit.toPc)}` : '(did not leave after entering)'}`);
  console.log(`  First loop hit:      ${result.firstLoop ? `step ${result.firstLoop.step} @ ${hex(result.firstLoop.pc)}` : '(never entered)'}`);
  console.log(`  Loop-range exit:     ${result.loopExit ? `step ${result.loopExit.step} ${hex(result.loopExit.fromPc)} -> ${hex(result.loopExit.toPc)}` : '(did not leave after entering)'}`);
  console.log(`  Loop-range visits:   ${result.loopVisitCount}`);
  console.log(`  0x0A1xxx visits:     ${result.a1xxxVisitCount}`);
  console.log(`  Unique blocks:       ${result.totalUniqueBlocks}`);
  console.log(`  Final regs:          PC=${hex(result.finalPc)} A=${hexByte(result.finalA)} BC=${hex(result.finalBC)} DE=${hex(result.finalDE)} HL=${hex(result.finalHL)}`);
  console.log(`  Final index regs:    IX=${hex(result.finalIX)} IY=${hex(result.finalIY)} SP=${hex(result.finalSP)}`);
  console.log('');

  printVisitCounts('Hot blocks by visit count:', result.hotBlocks);
  printVisitCounts('0x0A1A3B..0x0A1A4E block counts:', result.loopBlockCounts);
  printRegisterSnapshots(result.registerSnapshots);
  printRegionSnapshots(result.watchBefore, result.watchAfter);
  printRegionDiffs(result.regionDiffs);
  printWriteSamples(result.writeTrace);
  printStackSummary(result);
}

async function main() {
  console.log('Phase 239: Deep trace 0x04E447 computation path');
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

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Boot chain: ${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`);
    console.log(`Trace entry: ${hex(ENTRY_PC)} direct, D003E0=${hexByte(D003E0_SEED)}, IX=${hex(IX_HOME)} IY=${hex(IY_HOME)}`);
    console.log(`Peripheral seed: pllDelay=2 timerInterrupt=false`);
    console.log(`Budgets: ${TRACE_BUDGETS.join(', ')}`);
    console.log('');

    console.log('========================================================================');
    console.log('BOOT');
    console.log('========================================================================');
    const bootSummary = coldBoot(executor, cpu, mem);
    console.log(`boot:      steps=${bootSummary.boot.steps} term=${bootSummary.boot.termination} lastPc=${hex(bootSummary.boot.lastPc)}`);
    console.log(`kernelInit: steps=${bootSummary.kernelInit.steps} term=${bootSummary.kernelInit.termination} lastPc=${hex(bootSummary.kernelInit.lastPc)}`);
    console.log(`memInit:    steps=${bootSummary.memInit.steps} term=${bootSummary.memInit.termination} lastPc=${hex(bootSummary.memInit.lastPc)}`);
    console.log(`post-boot:  ${hex(D003E0_ADDR)}=${hexByte(mem[D003E0_ADDR])} ${hex(D007E0_ADDR)}=${hexByte(mem[D007E0_ADDR])}`);
    console.log('');

    const baseMem = Uint8Array.from(mem);
    const cpuSnapshot = snapshotCpu(cpu);

    for (const budget of TRACE_BUDGETS) {
      const result = traceScenario('Scenario', budget, blocks, baseMem, cpuSnapshot);
      printScenarioResult(result);
    }
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
