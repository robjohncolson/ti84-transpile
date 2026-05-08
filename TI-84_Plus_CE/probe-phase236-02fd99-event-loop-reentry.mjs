#!/usr/bin/env node

/**
 * Phase 236: trace 0x02FD99 — Event Loop Re-entry Point
 *
 * When the key-event dispatcher at 0x02FD8F processes a key and the final
 * convergence gate at 0x02FFED does OR A; JP NZ,0x02FE84; JP 0x02FD99,
 * execution lands at 0x02FD99 when A=0x00 (no key / key consumed).
 *
 * This probe answers: What happens between 0x02FD99 and 0x02FD8F?
 * Is 0x02FD99 the same block as 0x02FD8F, or are there intermediate
 * housekeeping blocks (display update, cursor blink, timer check)?
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import * as peripheralRuntime from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const ENTRY = 0x02FD99;
const DISPATCHER_ENTRY = 0x02FD8F;
const CONVERGENCE_GATE = 0x02FFED;
const SPECIAL_PATH = 0x02FE84;

const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;

const D0058E_ADDR = 0xD0058E;
const D0058D_ADDR = 0xD0058D;
const D0059F_ADDR = 0xD0059F;
const D00000_ADDR = 0xD00000;

const STEP_LIMIT = 500;
const IY_OFFSETS = [0, 1, 2, 3, 4, 5, 18, 29, 40, 52];

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

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
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

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-indexed-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-reg-indexed':
      return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    default:
      return inst.tag;
  }
}

function decodeAt(romBytes, pc) {
  const inst = decodeInstruction(romBytes, pc, 'adl');
  const bytes = romBytes.subarray(pc, pc + inst.length);
  return {
    pc: inst.pc >>> 0,
    bytes: bytesToHex(bytes),
    text: formatInstruction(inst),
    length: inst.length,
  };
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase236-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
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

function snapshotIyFlags(mem, iyBase) {
  const snapshot = {};
  for (const offset of IY_OFFSETS) {
    snapshot[`IY+${offset}`] = mem[(iyBase + offset) & MEM_MASK];
  }
  return snapshot;
}

function formatIySnapshot(snapshot) {
  return IY_OFFSETS
    .map((offset) => `IY+${offset}=${hexByte(snapshot[`IY+${offset}`])}`)
    .join(' ');
}

function diffIySnapshots(before, after) {
  const changes = [];
  for (const offset of IY_OFFSETS) {
    const key = `IY+${offset}`;
    if (before[key] !== after[key]) {
      changes.push(`${key}:${hexByte(before[key])}->${hexByte(after[key])}`);
    }
  }
  return changes;
}

function makeStopError(reason, pc) {
  const error = new Error('__PHASE236_STOP__');
  error.phase236Stop = {
    reason,
    pc: pc & 0xFFFFFF,
  };
  return error;
}

function printDisassembly(romBytes) {
  console.log('========================================================================');
  console.log('Disassembly: 0x02FD8F-0x02FDA0 (dispatcher entry region)');
  console.log('========================================================================');

  let pc = DISPATCHER_ENTRY;
  while (pc <= 0x02FDA0) {
    const row = decodeAt(romBytes, pc);
    const marker = pc === DISPATCHER_ENTRY ? ' <-- dispatcher entry (0x02FD8F)'
      : pc === ENTRY ? ' <-- re-entry point (0x02FD99)'
      : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${marker}`);
    pc += row.length;
  }

  console.log('');
  console.log('========================================================================');
  console.log('Disassembly: 0x02FD99-0x02FDB0 (re-entry region, extended)');
  console.log('========================================================================');

  pc = ENTRY;
  while (pc <= 0x02FDB0) {
    const row = decodeAt(romBytes, pc);
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
    pc += row.length;
  }

  console.log('');

  // Check if 0x02FD99 == 0x02FD8F
  if (ENTRY === DISPATCHER_ENTRY) {
    console.log('FINDING: 0x02FD99 IS the same address as 0x02FD8F (direct loop-back).');
  } else {
    console.log(`FINDING: 0x02FD99 (${hex(ENTRY)}) is ${ENTRY - DISPATCHER_ENTRY} bytes into the 0x02FD8F block.`);
    console.log('         This means 0x02FD99 is either mid-block or a distinct entry point.');
  }
  console.log('');
}

function printRamWatchTable(ramWrites) {
  if (ramWrites.length === 0) {
    console.log('  (no RAM writes recorded)');
    return;
  }
  console.log(`  ${'Address'.padEnd(10)} ${'Value'.padEnd(8)} ${'From Block'.padEnd(12)} Note`);
  for (const w of ramWrites) {
    console.log(`  ${hex(w.addr).padEnd(10)} ${hexByte(w.value).padEnd(8)} ${hex(w.fromPc).padEnd(12)} ${w.note}`);
  }
}

function runTrace(blocks, romBytes) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const mem = createMemoryBus(romBytes);
  const { cpu, executor } = createCPU(mem, blocks, peripherals);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.ix = 0;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.f = 0x00;
  cpu.a = 0x00;  // A=0x00 simulating "no key" return from 0x02FFED
  cpu.sp = STACK_TOP;
  push24(cpu, mem, RETURN_SENTINEL);

  // Snapshot key RAM locations before run
  const d00000Before = mem[D00000_ADDR];
  const d0058eBefore = mem[D0058E_ADDR];

  const iyBefore = snapshotIyFlags(mem, cpu.iy);
  const visited = [];
  const visitedSet = new Set();
  const ramWrites = [];
  let steps = 0;
  let stopReason = 'max_steps';
  let stopPc = ENTRY;
  let reachedDispatcher = false;
  let reachedConvergence = false;

  // Track RAM writes by hooking into the memory
  const origWrite8 = mem.constructor.prototype.set ? null : null;

  try {
    const result = executor.runFrom(ENTRY, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: 64,
      onBlock(pc, mode, meta, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        visitedSet.add(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
        if (currentPc === DISPATCHER_ENTRY) {
          reachedDispatcher = true;
          throw makeStopError('reached_dispatcher_0x02FD8F', currentPc);
        }
        if (currentPc === CONVERGENCE_GATE) {
          reachedConvergence = true;
          throw makeStopError('reached_convergence_0x02FFED', currentPc);
        }
        // Stop if we loop back to the entry point (second visit)
        if (currentPc === ENTRY && visited.length > 1) {
          throw makeStopError('looped_back_to_0x02FD99', currentPc);
        }
      },
      onMissingBlock(pc, mode, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        visitedSet.add(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
        if (currentPc === DISPATCHER_ENTRY) {
          reachedDispatcher = true;
          throw makeStopError('reached_dispatcher_0x02FD8F (missing block)', currentPc);
        }
        throw makeStopError('missing_block', currentPc);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    stopPc = (result.lastPc ?? stopPc) & 0xFFFFFF;
    stopReason = result.termination ?? stopReason;
  } catch (error) {
    if (error?.phase236Stop) {
      stopReason = error.phase236Stop.reason;
      stopPc = error.phase236Stop.pc;
    } else {
      stopReason = `error: ${error?.message ?? String(error)}`;
    }
  }

  const iyAfter = snapshotIyFlags(mem, cpu.iy);

  // Check for RAM changes in watched locations
  if (mem[D00000_ADDR] !== d00000Before) {
    ramWrites.push({ addr: D00000_ADDR, value: mem[D00000_ADDR], fromPc: 0, note: 'D00000 changed' });
  }
  if (mem[D0058E_ADDR] !== d0058eBefore) {
    ramWrites.push({ addr: D0058E_ADDR, value: mem[D0058E_ADDR], fromPc: 0, note: 'D0058E changed' });
  }

  return {
    steps,
    stopReason,
    stopPc,
    visited,
    visitedSet,
    reachedDispatcher,
    reachedConvergence,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalSP: cpu.sp & 0xFFFFFF,
    finalIY: cpu.iy & 0xFFFFFF,
    d00000: mem[D00000_ADDR],
    d0058e: mem[D0058E_ADDR],
    d0058d: mem[D0058D_ADDR],
    d0059f: mem[D0059F_ADDR],
    iyBefore,
    iyAfter,
    iyChanges: diffIySnapshots(iyBefore, iyAfter),
    ramWrites,
  };
}

function printTraceResult(result) {
  console.log('========================================================================');
  console.log('Trace: enter at 0x02FD99 with A=0x00 (no key), step up to 500');
  console.log('========================================================================');
  console.log(`Stop reason:   ${result.stopReason}`);
  console.log(`Stop PC:       ${hex(result.stopPc)}`);
  console.log(`Steps:         ${result.steps}`);
  console.log(`Final A/F:     A=${hexByte(result.finalA)} F=${hexByte(result.finalF)}`);
  console.log(`Final SP:      ${hex(result.finalSP)}`);
  console.log(`Final IY:      ${hex(result.finalIY)}`);
  console.log('');

  console.log(`Reached 0x02FD8F (dispatcher): ${result.reachedDispatcher ? 'YES' : 'NO'}`);
  console.log(`Reached 0x02FFED (convergence): ${result.reachedConvergence ? 'YES' : 'NO'}`);
  console.log('');

  console.log(`Unique blocks visited: ${result.visitedSet.size}`);
  console.log(`Block chain (${result.visited.length} entries):`);
  console.log(`  ${result.visited.map((pc) => hex(pc)).join(' -> ')}`);
  console.log('');

  // Analyze the path
  const entryIdx = 0;
  const dispatcherIdx = result.visited.indexOf(DISPATCHER_ENTRY);

  if (dispatcherIdx >= 0) {
    const blocksBetween = dispatcherIdx; // blocks from entry (idx 0) to dispatcher
    console.log(`Blocks between 0x02FD99 and 0x02FD8F: ${blocksBetween}`);
    if (blocksBetween === 0) {
      console.log('FINDING: 0x02FD99 immediately enters 0x02FD8F — they may share a block or 0x02FD99 falls through.');
    } else {
      console.log(`FINDING: ${blocksBetween} intermediate block(s) between re-entry and dispatcher.`);
      console.log('  Intermediate blocks:');
      for (let i = 1; i < dispatcherIdx; i++) {
        console.log(`    ${hex(result.visited[i])}`);
      }
    }
  } else {
    console.log('FINDING: Execution did NOT reach 0x02FD8F within 500 steps.');
    console.log('  The re-entry path diverges from the dispatcher.');
  }
  console.log('');

  console.log('RAM watch:');
  console.log(`  D00000=${hexByte(result.d00000)} D0058E=${hexByte(result.d0058e)} D0058D=${hexByte(result.d0058d)} D0059F=${hexByte(result.d0059f)}`);
  if (result.ramWrites.length > 0) {
    printRamWatchTable(result.ramWrites);
  }
  console.log('');

  console.log(`IY before: ${formatIySnapshot(result.iyBefore)}`);
  console.log(`IY after:  ${formatIySnapshot(result.iyAfter)}`);
  console.log(`IY changes: ${result.iyChanges.length ? result.iyChanges.join('  ') : '(none in watched offsets)'}`);
  console.log('');
}

function printVerdict(result) {
  console.log('========================================================================');
  console.log('VERDICT');
  console.log('========================================================================');

  const sameBlock = ENTRY === DISPATCHER_ENTRY;
  const reachedDispatcher = result.reachedDispatcher;
  const blocksBetween = result.visited.indexOf(DISPATCHER_ENTRY);

  if (sameBlock) {
    console.log('0x02FD99 IS 0x02FD8F — direct loop-back, no intermediate housekeeping.');
    console.log('PASS');
  } else if (reachedDispatcher && blocksBetween <= 1) {
    console.log('0x02FD99 is a mid-block or adjacent entry that falls through to 0x02FD8F.');
    console.log(`Distance: ${ENTRY - DISPATCHER_ENTRY} bytes, ${blocksBetween} intermediate block(s).`);
    if (blocksBetween === 0) {
      console.log('The re-entry point skips the first 10 bytes of the dispatcher (0x02FD8F-0x02FD98).');
    }
    console.log('PASS');
  } else if (reachedDispatcher) {
    console.log(`0x02FD99 reaches 0x02FD8F after ${blocksBetween} intermediate blocks.`);
    console.log('There IS housekeeping between re-entry and dispatcher re-entry.');
    console.log('PASS');
  } else {
    console.log(`0x02FD99 did NOT reach 0x02FD8F. Stopped at ${hex(result.stopPc)} (${result.stopReason}).`);
    console.log('The re-entry path is NOT a simple loop back to the dispatcher.');
    console.log('PASS (probe completed, result informative)');
  }
}

async function main() {
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

    console.log('Phase 236: trace 0x02FD99 — Event Loop Re-entry Point');
    console.log(`ROM: ${path.basename(ROM_PATH)}`);
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Runtime seed: mbase=${hexByte(MBASE)} IY=${hex(IY_BASE)} timerInterrupt=false`);
    console.log(`Entry: ${hex(ENTRY)} with A=0x00`);
    console.log('');

    // Part 1: Static disassembly
    printDisassembly(romBytes);

    // Part 2: Dynamic trace
    const result = runTrace(blocks, romBytes);
    printTraceResult(result);

    // Part 3: Verdict
    printVerdict(result);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
