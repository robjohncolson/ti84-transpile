#!/usr/bin/env node

/**
 * Phase 364: trace linked-list initialization at 0xD14095.
 *
 * Execution summary:
 *   Not populated in this subagent run.
 *   Subagent mode required exiting immediately after patching, so this probe
 *   was not executed here.
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase364-linkedlist-init.mjs
 *
 * This probe mirrors the phase 363 boot setup and dispatch loop, but swaps the
 * SP-specific tracing for write hooks on 0xD14085-0xD140A5 inclusive.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const FLAG_C = 0x01;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 2700;
const MAX_LOOP_ITERATIONS = 50000;

const RAM_THRESHOLD = 0xD00000;
const WATCH_START = 0xD14085;
const WATCH_END = 0xD140A5;
const TARGET_ADDR = 0xD14095;
const TARGET_VALUE = 0x014C7B;
const SNAPSHOT_STEPS = [0, 2680, 2688];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hb(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function widthForBits(bits) {
  if (bits === 8) return 2;
  if (bits === 16) return 4;
  return 6;
}

function bytesForBits(bits) {
  if (bits === 8) return 1;
  if (bits === 16) return 2;
  return 3;
}

function read16(buffer, addr) {
  const a = addr & 0xFFFFFF;
  const b0 = buffer[a] ?? 0;
  const b1 = buffer[(a + 1) & 0xFFFFFF] ?? 0;
  return b0 | (b1 << 8);
}

function read24(buffer, addr) {
  const a = addr & 0xFFFFFF;
  const b0 = buffer[a] ?? 0;
  const b1 = buffer[(a + 1) & 0xFFFFFF] ?? 0;
  const b2 = buffer[(a + 2) & 0xFFFFFF] ?? 0;
  return b0 | (b1 << 8) | (b2 << 16);
}

function readWidth(buffer, addr, bits) {
  if (bits === 8) {
    return buffer[addr & 0xFFFFFF] ?? 0;
  }
  if (bits === 16) {
    return read16(buffer, addr);
  }
  return read24(buffer, addr);
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const hint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${hint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function decodeText(buffer, pc, mode) {
  try {
    const inst = decodeInstruction(buffer, pc & 0xFFFFFF, mode);
    if (!inst) {
      return 'unknown';
    }
    return inst.dasm ?? inst.mnemonic ?? inst.tag ?? 'unknown';
  } catch {
    return 'decode failed';
  }
}

function readRange(buffer, start, endInclusive) {
  const out = [];
  for (let addr = start; addr <= endInclusive; addr += 1) {
    out.push(buffer[addr & 0xFFFFFF] ?? 0);
  }
  return out;
}

function formatRegion(bytes, startAddr) {
  const lines = [];
  for (let index = 0; index < bytes.length; index += 16) {
    const addr = (startAddr + index) & 0xFFFFFF;
    const chunk = bytes.slice(index, index + 16).map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    lines.push(`${hex(addr)}: ${chunk}`);
  }
  return lines;
}

function writeTouchesWindow(addr, bits) {
  const width = bytesForBits(bits);
  for (let offset = 0; offset < width; offset += 1) {
    const current = (addr + offset) & 0xFFFFFF;
    if (current >= WATCH_START && current <= WATCH_END) {
      return true;
    }
  }
  return false;
}

function writeTouchesTarget(addr, bits) {
  const width = bytesForBits(bits);
  for (let offset = 0; offset < width; offset += 1) {
    const current = (addr + offset) & 0xFFFFFF;
    if (current >= TARGET_ADDR && current <= TARGET_ADDR + 2) {
      return true;
    }
  }
  return false;
}

function createRamTrampoline(blockPc) {
  return function ramTrampoline(cpu) {
    const sp = cpu.sp & 0xFFFFFF;
    const retAddr = read24(cpu.mem, sp);
    cpu.sp = (sp + 3) & 0xFFFFFF;
    return retAddr;
  };
}

function createWriteTracker(memory) {
  const writes = [];
  const snapshots = new Map();
  const missingBlocks = [];
  let current = null;

  function captureSnapshot(step) {
    if (!SNAPSHOT_STEPS.includes(step) || snapshots.has(step)) {
      return;
    }

    snapshots.set(step, {
      step,
      bytes: readRange(memory, WATCH_START, WATCH_END),
      targetValue: read24(memory, TARGET_ADDR),
    });
  }

  function enterBlock(step, blockPc, mode) {
    current = {
      step,
      blockPc: blockPc & 0xFFFFFF,
      mode: mode ?? 'adl',
      entryInstruction: decodeText(memory, blockPc & 0xFFFFFF, mode ?? 'adl'),
    };
  }

  function finishBlock() {
    current = null;
  }

  function noteMissingBlock(step, blockPc, mode, cpu) {
    missingBlocks.push({
      step,
      pc: blockPc & 0xFFFFFF,
      mode: mode ?? 'adl',
      sp: cpu.sp & 0xFFFFFF,
    });
  }

  function recordWrite(bits, addr, oldValue, newValue, targetBefore, targetAfter) {
    const normalizedAddr = addr & 0xFFFFFF;
    const blockPc = current?.blockPc ?? 0;
    const mode = current?.mode ?? 'adl';

    writes.push({
      step: current?.step ?? 0,
      blockId: blockKey(blockPc, mode),
      addr: hex(normalizedAddr),
      oldValue: hex(oldValue, widthForBits(bits)),
      newValue: hex(newValue, widthForBits(bits)),
      writeSize: bits,
      numericAddr: normalizedAddr,
      targetBefore,
      targetAfter,
      touchesTarget: writeTouchesTarget(normalizedAddr, bits),
      entryInstruction: current?.entryInstruction ?? 'unknown',
    });
  }

  function install(cpu) {
    const originalWrite8 = cpu.write8.bind(cpu);
    const originalWrite16 = cpu.write16.bind(cpu);
    const originalWrite24 = cpu.write24.bind(cpu);

    cpu.write8 = (addr, value) => {
      const normalizedAddr = addr & 0xFFFFFF;
      const touches = writeTouchesWindow(normalizedAddr, 8);
      const oldValue = touches ? readWidth(memory, normalizedAddr, 8) : 0;
      const targetBefore = touches ? read24(memory, TARGET_ADDR) : 0;
      originalWrite8(addr, value);
      if (!touches) {
        return;
      }
      const newValue = readWidth(memory, normalizedAddr, 8);
      const targetAfter = read24(memory, TARGET_ADDR);
      recordWrite(8, normalizedAddr, oldValue, newValue, targetBefore, targetAfter);
    };

    cpu.write16 = (addr, value) => {
      const normalizedAddr = addr & 0xFFFFFF;
      const touches = writeTouchesWindow(normalizedAddr, 16);
      const oldValue = touches ? readWidth(memory, normalizedAddr, 16) : 0;
      const targetBefore = touches ? read24(memory, TARGET_ADDR) : 0;
      originalWrite16(addr, value);
      if (!touches) {
        return;
      }
      const newValue = readWidth(memory, normalizedAddr, 16);
      const targetAfter = read24(memory, TARGET_ADDR);
      recordWrite(16, normalizedAddr, oldValue, newValue, targetBefore, targetAfter);
    };

    cpu.write24 = (addr, value) => {
      const normalizedAddr = addr & 0xFFFFFF;
      const touches = writeTouchesWindow(normalizedAddr, 24);
      const oldValue = touches ? readWidth(memory, normalizedAddr, 24) : 0;
      const targetBefore = touches ? read24(memory, TARGET_ADDR) : 0;
      originalWrite24(addr, value);
      if (!touches) {
        return;
      }
      const newValue = readWidth(memory, normalizedAddr, 24);
      const targetAfter = read24(memory, TARGET_ADDR);
      recordWrite(24, normalizedAddr, oldValue, newValue, targetBefore, targetAfter);
    };
  }

  function getTargetSetEvents() {
    return writes.filter((event) => event.targetBefore !== TARGET_VALUE && event.targetAfter === TARGET_VALUE);
  }

  return {
    writes,
    snapshots,
    missingBlocks,
    captureSnapshot,
    enterBlock,
    finishBlock,
    noteMissingBlock,
    install,
    getTargetSetEvents,
  };
}

function createProbeRunner(executor, peripherals, tracker, maxSteps = BOOT_MAX_STEPS) {
  const cpu = executor.cpu;
  const compiledBlocks = executor.compiledBlocks;
  const blockMeta = executor.blockMeta;
  const ramTrampolines = Object.create(null);

  function resolveNextMode(key, returnedPc, currentMode) {
    const meta = blockMeta[key];
    if (!meta || !meta.exits) {
      return currentMode;
    }

    for (const exit of meta.exits) {
      if (exit.target === returnedPc && exit.targetMode) {
        return exit.targetMode;
      }
    }

    return currentMode;
  }

  return function run() {
    let pc = BOOT_ENTRY;
    let mode = BOOT_MODE;
    let steps = 0;
    let termination = 'max_steps';
    let loopsForced = 0;

    const blockVisits = new Map();
    const missingBlocks = new Set();
    const dynamicTargets = new Set();
    const recentKeys = [];
    const recentMax = 4;
    let loopHitCount = 0;

    tracker.captureSnapshot(0);

    while (steps < maxSteps) {
      cpu.madl = mode === 'adl' ? 1 : 0;
      cpu.pc = pc & 0xFFFFFF;

      const key = blockKey(pc, mode);
      if (recentKeys.includes(key)) {
        loopHitCount += 1;
      } else {
        loopHitCount = 0;
      }
      recentKeys.push(key);
      if (recentKeys.length > recentMax) {
        recentKeys.shift();
      }

      if (loopHitCount > MAX_LOOP_ITERATIONS) {
        const meta = blockMeta[key];
        const fallthrough = meta?.exits?.find((exit) => exit.type === 'fallthrough');
        if (fallthrough) {
          mode = fallthrough.targetMode ?? mode;
          pc = fallthrough.target;
          loopHitCount = 0;
          recentKeys.length = 0;
          loopsForced += 1;
          continue;
        }
        cpu.f |= FLAG_C;
        loopHitCount = 0;
        recentKeys.length = 0;
        loopsForced += 1;
      }

      let fn = compiledBlocks[key];
      if (!fn) {
        tracker.noteMissingBlock(steps + 1, pc, mode, cpu);
        missingBlocks.add(key);

        if (pc >= RAM_THRESHOLD) {
          fn = ramTrampolines[key] ?? createRamTrampoline(pc);
          ramTrampolines[key] = fn;
          compiledBlocks[key] = fn;
          continue;
        }

        let skipped = false;
        for (let offset = 1; offset <= 16; offset += 1) {
          const tryPc = (pc + offset) & 0xFFFFFF;
          const tryKey = blockKey(tryPc, mode);
          if (compiledBlocks[tryKey]) {
            pc = tryPc;
            skipped = true;
            break;
          }
        }

        if (!skipped) {
          termination = 'missing_block';
          break;
        }

        steps += 1;
        tracker.captureSnapshot(steps);
        continue;
      }

      const meta = blockMeta[key];
      cpu._currentBlockPc = pc & 0xFFFFFF;
      tracker.enterBlock(steps + 1, pc, mode, meta, cpu);

      let result;
      try {
        result = fn(cpu);
      } catch (error) {
        tracker.finishBlock(null, mode, cpu);
        tracker.captureSnapshot(steps);
        return {
          steps,
          lastPc: pc,
          lastMode: mode,
          halted: cpu.halted,
          termination: 'error',
          error,
          loopsForced,
          blockVisits: Object.fromEntries(blockVisits),
          dynamicTargets: [...dynamicTargets],
          missingBlocks: [...missingBlocks],
        };
      }

      steps += 1;
      tracker.captureSnapshot(steps);
      blockVisits.set(key, (blockVisits.get(key) || 0) + 1);

      if (result === undefined || result === null) {
        tracker.finishBlock(result, mode, cpu);
        termination = 'no_return';
        break;
      }

      if (result < 0) {
        if (result === -1 && peripherals && peripherals.tick) {
          peripherals.tick();

          if (peripherals.hasPendingNMI()) {
            cpu.halted = false;
            cpu.push((pc + 1) & 0xFFFFFF);
            cpu.iff2 = cpu.iff1;
            cpu.iff1 = 0;
            pc = 0x000066;
            mode = 'adl';
            peripherals.acknowledgeNMI();
            tracker.finishBlock(pc, mode, cpu);
            steps += 1;
            tracker.captureSnapshot(steps);
            continue;
          }

          if (peripherals.hasPendingIRQ() && cpu.iff1) {
            cpu.halted = false;
            cpu.push((pc + 1) & 0xFFFFFF);
            cpu.iff1 = 0;
            cpu.iff2 = 0;
            pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : 0x000038;
            mode = 'adl';
            peripherals.acknowledgeIRQ();
            tracker.finishBlock(pc, mode, cpu);
            steps += 1;
            tracker.captureSnapshot(steps);
            continue;
          }
        }

        tracker.finishBlock(result, mode, cpu);
        termination = result === -1 ? 'halt' : 'sleep';
        break;
      }

      if (peripherals && peripherals.tick) {
        peripherals.tick();

        if (peripherals.hasPendingNMI()) {
          cpu.push(result);
          cpu.iff2 = cpu.iff1;
          cpu.iff1 = 0;
          pc = 0x000066;
          mode = 'adl';
          peripherals.acknowledgeNMI();
          tracker.finishBlock(pc, mode, cpu);
          steps += 1;
          tracker.captureSnapshot(steps);
          continue;
        }

        if (peripherals.hasPendingIRQ() && cpu.iff1) {
          cpu.push(result);
          cpu.iff1 = 0;
          cpu.iff2 = 0;
          pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : 0x000038;
          mode = 'adl';
          peripherals.acknowledgeIRQ();
          tracker.finishBlock(pc, mode, cpu);
          steps += 1;
          tracker.captureSnapshot(steps);
          continue;
        }
      }

      if (meta?.exits) {
        const isStaticExit = meta.exits.some((exit) => exit.target === result);
        if (!isStaticExit && typeof result === 'number' && result >= 0) {
          dynamicTargets.add(result);
        }
      }

      const nextMode = resolveNextMode(key, result, mode);
      tracker.finishBlock(result, nextMode, cpu);
      mode = nextMode;
      pc = result & 0xFFFFFF;
    }

    return {
      steps,
      lastPc: pc,
      lastMode: mode,
      halted: cpu.halted,
      termination,
      loopsForced,
      blockVisits: Object.fromEntries(blockVisits),
      dynamicTargets: [...dynamicTargets],
      missingBlocks: [...missingBlocks],
    };
  };
}

function printSnapshots(snapshots) {
  console.log('=== REGION SNAPSHOTS ===');
  for (const step of SNAPSHOT_STEPS) {
    const snapshot = snapshots.get(step);
    if (!snapshot) {
      console.log(`step=${step} not reached`);
      continue;
    }
    console.log(`step=${step} target24=${hex(snapshot.targetValue)}`);
    for (const line of formatRegion(snapshot.bytes, WATCH_START)) {
      console.log(`  ${line}`);
    }
  }
  console.log('');
}

function printWriteTrace(writes) {
  console.log('=== WRITE TRACE ===');
  if (writes.length === 0) {
    console.log('No writes touched 0xD14085-0xD140A5 within the traced boot window.');
    console.log('');
    return;
  }

  for (const event of writes) {
    console.log(JSON.stringify({
      step: event.step,
      blockId: event.blockId,
      addr: event.addr,
      oldValue: event.oldValue,
      newValue: event.newValue,
      writeSize: event.writeSize,
    }));
  }
  console.log('');
}

function printTargetSummary(tracker, memory) {
  const targetEvents = tracker.getTargetSetEvents();
  const touchingTarget = tracker.writes.filter((event) => event.touchesTarget);
  const direct24Write = targetEvents.find((event) => event.writeSize === 24 && event.numericAddr === TARGET_ADDR);

  console.log('=== TARGET SUMMARY ===');
  console.log(`finalTarget24=${hex(read24(memory, TARGET_ADDR))} targetAddr=${hex(TARGET_ADDR)}`);
  console.log(`totalWritesInWindow=${tracker.writes.length}`);
  console.log(`writesTouchingTargetBytes=${touchingTarget.length}`);
  console.log(`writesSettingTargetTo${hex(TARGET_VALUE)}=${targetEvents.length}`);

  if (targetEvents.length === 0) {
    console.log(`No traced write changed ${hex(TARGET_ADDR)} to ${hex(TARGET_VALUE)} within ${BOOT_MAX_STEPS} steps.`);
  } else {
    for (const event of targetEvents) {
      console.log(`set-event step=${event.step} block=${event.blockId} addr=${event.addr} size=${event.writeSize} targetBefore=${hex(event.targetBefore)} targetAfter=${hex(event.targetAfter)}`);
    }
  }

  if (targetEvents.length === 1 && direct24Write) {
    console.log('classification=single_24bit_write');
  } else if (targetEvents.length > 0) {
    console.log('classification=assembled_or_overlapping_writes');
  } else if (read24(memory, TARGET_ADDR) === TARGET_VALUE) {
    console.log('classification=present_without_observed_write_in_trace_window');
  } else {
    console.log('classification=target_value_not_observed');
  }

  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const tracker = createWriteTracker(mem);
  tracker.install(cpu);

  const run = createProbeRunner(executor, peripherals, tracker, BOOT_MAX_STEPS);

  console.log('Phase 364: Trace Linked-List Initialization at 0xD14095');
  console.log('=========================================================');
  console.log(`ROM:            ${ROM_PATH}`);
  console.log(`Transpiled ROM: ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:    entry=${hex(BOOT_ENTRY)} mode=${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} timerInterrupt=false`);
  console.log(`Watch window:   ${hex(WATCH_START)}-${hex(WATCH_END)} (inclusive)`);
  console.log(`Target value:   ${hex(TARGET_VALUE)} at ${hex(TARGET_ADDR)}`);
  console.log('');

  const result = run();

  console.log('=== BOOT SUMMARY ===');
  console.log(`termination=${result.termination} steps=${result.steps} last=${hex(result.lastPc)}:${result.lastMode} halted=${result.halted ? 'yes' : 'no'} loopsForced=${result.loopsForced}`);
  console.log(`missingBlocks=${result.missingBlocks.length} dynamicTargets=${result.dynamicTargets.length} regionWrites=${tracker.writes.length}`);
  console.log('');

  printSnapshots(tracker.snapshots);
  printWriteTrace(tracker.writes);
  printTargetSummary(tracker, mem);

  if (tracker.missingBlocks.length > 0) {
    console.log('=== MISSING BLOCKS ===');
    for (const event of tracker.missingBlocks) {
      console.log(`step=${String(event.step).padStart(5)} pc=${hex(event.pc)}:${event.mode} sp=${hex(event.sp)}`);
    }
    console.log('');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
