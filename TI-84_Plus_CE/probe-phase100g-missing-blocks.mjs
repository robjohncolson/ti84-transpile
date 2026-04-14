#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const STACK_BYTES = 3;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const OS_INIT_ENTRY = 0x08C331;
const OS_INIT_MODE = 'adl';
const OS_INIT_MAX_STEPS = 1000000;
const OS_INIT_MAX_LOOP_ITERATIONS = 50000;

const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MODE = 'adl';
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const EVENT_LOOP_ENTRY = 0x0019BE;
const EVENT_LOOP_MODE = 'adl';
const EVENT_LOOP_MAX_STEPS = 1000000;
const EVENT_LOOP_MAX_LOOP_ITERATIONS = 50000;

const MODE_STATE_ADDRS = [0xD02048, 0xD02049, 0xD0204A];
const MODE_PIPELINE_START = 0x0B2D00;
const MODE_PIPELINE_END = 0x0B5A00;

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function resetStack(cpu, mem, bytes = STACK_BYTES) {
  cpu.sp = STACK_TOP - bytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + bytes);
}

function clearPendingInterrupts(peripherals) {
  peripherals.acknowledgeIRQ?.();
  peripherals.acknowledgeNMI?.();
}

function isModePipelineAddress(addr) {
  return Number.isInteger(addr) && addr >= MODE_PIPELINE_START && addr <= MODE_PIPELINE_END;
}

function formatRunResult(label, result) {
  return `${label}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)} lastMode=${result.lastMode ?? 'n/a'}`;
}

function createRuntime(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: true,
  });

  const executor = createExecutor(blocks, mem, { peripherals });

  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function runWithMissingProbe(executor, entry, mode, options) {
  const missingHits = [];
  const seen = new Set();

  const result = executor.runFrom(entry, mode, {
    ...options,
    onMissingBlock(pc, blockMode, steps) {
      const key = `${pc}:${blockMode}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      missingHits.push({
        pc: pc >>> 0,
        mode: blockMode,
        step: steps,
      });
    },
  });

  if (missingHits.length > 0) {
    return {
      result,
      missingHits,
      firstMissing: missingHits[0],
    };
  }

  if (result.termination !== 'missing_block' || !Number.isInteger(result.lastPc)) {
    return {
      result,
      missingHits,
      firstMissing: null,
    };
  }

  return {
    result,
    missingHits,
    firstMissing: {
      pc: result.lastPc >>> 0,
      mode: result.lastMode ?? mode,
      step: result.steps,
    },
  };
}

function prepareBootstrappedRuntime(runtime) {
  const { executor, cpu, mem, peripherals } = runtime;

  const coldBoot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);
  clearPendingInterrupts(peripherals);

  const osInit = runWithMissingProbe(executor, OS_INIT_ENTRY, OS_INIT_MODE, {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const postInit = executor.runFrom(POST_INIT_ENTRY, POST_INIT_MODE, {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });

  return {
    coldBoot,
    osInit,
    postInit,
  };
}

function seedModeState(mem) {
  for (const addr of MODE_STATE_ADDRS) {
    mem[addr] = 0x00;
  }
}

function summarizeMissing(label, probe) {
  console.log(label);
  console.log(`  ${formatRunResult('run', probe.result)}`);

  if (!probe.firstMissing) {
    console.log('  first missing: none');
    console.log('  mode-pipeline candidate: no');
    return;
  }

  const candidate = isModePipelineAddress(probe.firstMissing.pc);
  console.log(
    `  first missing: ${hex(probe.firstMissing.pc, 6)}:${probe.firstMissing.mode} at step ${probe.firstMissing.step}`,
  );
  console.log(`  unique missing hits: ${probe.missingHits.length}`);
  console.log(`  mode-pipeline candidate: ${candidate ? 'YES' : 'no'}`);

  if (candidate) {
    console.log('  note: inside 0x0b2d00..0x0b5a00, strong candidate for mode-display populator');
  }
}

function scanModePipeline(blocks) {
  const blockList = Array.isArray(blocks) ? blocks : Object.values(blocks);
  const blockEntries = blockList.filter(
    (block) => block.startPc >= MODE_PIPELINE_START && block.startPc <= MODE_PIPELINE_END,
  );

  const presentAddresses = new Set(blockEntries.map((block) => block.startPc >>> 0));
  const gaps = new Map();

  for (const block of blockEntries) {
    for (const exit of block.exits || []) {
      if (exit.type !== 'call' && exit.type !== 'jump') {
        continue;
      }

      if (!Number.isInteger(exit.target)) {
        continue;
      }

      const target = exit.target >>> 0;
      if (!isModePipelineAddress(target)) {
        continue;
      }

      if (presentAddresses.has(target)) {
        continue;
      }

      let gap = gaps.get(target);
      if (!gap) {
        gap = {
          target,
          refs: new Map(),
        };
        gaps.set(target, gap);
      }

      const refKey = `${block.startPc}:${exit.type}:${exit.targetMode ?? ''}`;
      if (gap.refs.has(refKey)) {
        continue;
      }

      gap.refs.set(refKey, {
        source: block.startPc >>> 0,
        type: exit.type,
        targetMode: exit.targetMode ?? 'n/a',
      });
    }
  }

  return {
    blockEntryCount: blockEntries.length,
    uniqueStartCount: presentAddresses.size,
    gaps: [...gaps.values()]
      .map((gap) => ({
        target: gap.target,
        refs: [...gap.refs.values()].sort(
          (left, right) => left.source - right.source || left.type.localeCompare(right.type),
        ),
      }))
      .sort((left, right) => left.target - right.target),
  };
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = romModule.PRELIFTED_BLOCKS;

  console.log('=== Phase 100G - Missing Block Probe ===');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);

  const allBlocks = Array.isArray(blocks) ? blocks : Object.values(blocks);
  console.log(`PRELIFTED_BLOCKS entries: ${allBlocks.length}`);

  console.log('\n=== OS init run ===');
  const osRuntime = createRuntime(romBytes, blocks);
  const osBootstrap = prepareBootstrappedRuntime(osRuntime);
  console.log(`  ${formatRunResult('cold boot', osBootstrap.coldBoot)}`);
  console.log(`  ${formatRunResult('post init', osBootstrap.postInit)}`);
  summarizeMissing('  first missing from 0x08C331', osBootstrap.osInit);

  console.log('\n=== Event loop run ===');
  const eventRuntime = createRuntime(romBytes, blocks);
  const eventBootstrap = prepareBootstrappedRuntime(eventRuntime);
  console.log(`  ${formatRunResult('cold boot', eventBootstrap.coldBoot)}`);
  console.log(`  ${formatRunResult('post init', eventBootstrap.postInit)}`);

  seedModeState(eventRuntime.mem);
  clearPendingInterrupts(eventRuntime.peripherals);
  eventRuntime.cpu.mbase = 0xD0;
  eventRuntime.cpu._iy = 0xD00080;
  eventRuntime.cpu._hl = 0;
  eventRuntime.cpu.halted = false;
  eventRuntime.cpu.iff1 = 1;
  eventRuntime.cpu.iff2 = 1;
  resetStack(eventRuntime.cpu, eventRuntime.mem);

  const eventLoopProbe = runWithMissingProbe(
    eventRuntime.executor,
    EVENT_LOOP_ENTRY,
    EVENT_LOOP_MODE,
    {
      maxSteps: EVENT_LOOP_MAX_STEPS,
      maxLoopIterations: EVENT_LOOP_MAX_LOOP_ITERATIONS,
    },
  );

  console.log(
    `  seeded mode state: ${MODE_STATE_ADDRS.map((addr) => `${hex(addr, 6)}=0x00`).join(', ')}`,
  );
  summarizeMissing('  first missing from 0x0019BE', eventLoopProbe);

  console.log('\n=== Mode-display pipeline scan ===');
  const pipelineScan = scanModePipeline(blocks);
  console.log(
    `  block count in ${hex(MODE_PIPELINE_START, 6)}..${hex(MODE_PIPELINE_END, 6)}: ${pipelineScan.blockEntryCount} entries (${pipelineScan.uniqueStartCount} unique start addresses)`,
  );

  if (pipelineScan.gaps.length === 0) {
    console.log('  referenced CALL/JP gaps in range: none');
    return;
  }

  console.log('  referenced CALL/JP gaps in range:');
  for (const gap of pipelineScan.gaps) {
    const refs = gap.refs
      .map((ref) => `${hex(ref.source, 6)}:${ref.type}:${ref.targetMode}`)
      .join(', ');
    console.log(`    ${hex(gap.target, 6)} <- ${refs}`);
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
