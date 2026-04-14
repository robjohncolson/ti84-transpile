#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase135-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const OS_INIT_ENTRY = 0x08C331;
const OS_INIT_MODE = 'adl';
const OS_INIT_MAX_STEPS = 500000;
const OS_INIT_EXTENDED_MAX_STEPS = 1000000;
const OS_INIT_MAX_LOOP_ITERATIONS = 10000;

const POLL_ENTRY = 0x006138;
const POLL_BLOCKS = [0x006133, 0x006138, 0x00613E, 0x00613F, 0x006145];

const DISPATCH_TABLE_ADDR = 0xD0231A;
const DISPATCH_TABLE_LEN = 6;
const D007EB_ADDR = 0xD007EB;
const D007EB_LEN = 3;

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function blockKey(address, mode = 'adl') {
  return `${(address >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function terminationOf(result) {
  return result.termination ?? result.reason ?? 'unknown';
}

function readBytes(mem, addr, length) {
  return Array.from(mem.slice(addr, addr + length));
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function formatBytes(bytes) {
  return bytes.map((value) => hex(value, 2)).join(' ');
}

function createMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });

  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function resetForAdlEntry(machine, stackBytes = 3) {
  const { cpu, mem, peripherals } = machine;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);

  peripherals.acknowledgeIRQ?.();
  peripherals.acknowledgeNMI?.();
}

function runTracked(executor, entry, mode, options) {
  const {
    maxSteps,
    maxLoopIterations,
    label,
    progressInterval = 0,
  } = options;

  let firstPollVisitStep = null;
  let firstMissing = null;
  let nextProgress = progressInterval;

  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
    onBlock(pc, blockMode, meta, steps) {
      const currentStep = steps + 1;

      if (pc === POLL_ENTRY && blockMode === 'adl' && firstPollVisitStep === null) {
        firstPollVisitStep = currentStep;
      }

      if (progressInterval > 0 && currentStep >= nextProgress) {
        console.log(`  [${label}] progress ${currentStep}/${maxSteps}`);
        nextProgress += progressInterval;
      }
    },
    onMissingBlock(pc, blockMode, steps) {
      if (firstMissing) {
        return;
      }

      firstMissing = {
        pc: pc >>> 0,
        mode: blockMode,
        step: steps,
      };
    },
  });

  if (!firstMissing && terminationOf(result) === 'missing_block' && Number.isInteger(result.lastPc)) {
    firstMissing = {
      pc: result.lastPc >>> 0,
      mode: result.lastMode ?? mode,
      step: result.steps,
    };
  }

  const blockVisits = result.blockVisits ?? {};
  const pollVisitCount = blockVisits[blockKey(POLL_ENTRY, 'adl')] ?? 0;

  return {
    entry,
    mode,
    maxSteps,
    maxLoopIterations,
    result,
    termination: terminationOf(result),
    blockVisits,
    pollVisited: firstPollVisitStep !== null || pollVisitCount > 0,
    pollVisitCount,
    firstPollVisitStep,
    firstMissing,
  };
}

function captureMemoryState(mem) {
  const dispatchBytes = readBytes(mem, DISPATCH_TABLE_ADDR, DISPATCH_TABLE_LEN);
  const d007ebBytes = readBytes(mem, D007EB_ADDR, D007EB_LEN);

  return {
    dispatchBytes,
    dispatchAnyNonFF: dispatchBytes.some((value) => value !== 0xFF),
    dispatchAllNonFF: dispatchBytes.every((value) => value !== 0xFF),
    d007ebBytes,
    d007ebValue: read24(mem, D007EB_ADDR),
  };
}

function summarizePollBlocks(run) {
  return POLL_BLOCKS
    .map((addr) => `${hex(addr, 6)}=${run.blockVisits[blockKey(addr, 'adl')] ?? 0}`)
    .join(', ');
}

function summarizeMissing(run) {
  if (!run.firstMissing) {
    return 'none';
  }

  return `${hex(run.firstMissing.pc, 6)}:${run.firstMissing.mode} @ step ${run.firstMissing.step}`;
}

function formatRunSummary(run) {
  return `steps=${run.result.steps} termination=${run.termination} lastPc=${hex(run.result.lastPc, 6)} lastMode=${run.result.lastMode ?? 'n/a'}`;
}

function logRun(label, run) {
  console.log(`${label}: ${formatRunSummary(run)}`);
  console.log(`  0x006138 reached: ${run.pollVisited ? 'yes' : 'no'}`);
  console.log(`  0x006138 first visit step: ${run.firstPollVisitStep ?? 'not hit'}`);
  console.log(`  poll block visits: ${summarizePollBlocks(run)}`);
  console.log(`  first missing block: ${summarizeMissing(run)}`);
}

function logMemoryState(label, memoryState) {
  console.log(`${label}:`);
  console.log(
    `  dispatch ${hex(DISPATCH_TABLE_ADDR, 6)}..${hex(DISPATCH_TABLE_ADDR + DISPATCH_TABLE_LEN - 1, 6)} = ${formatBytes(memoryState.dispatchBytes)}`,
  );
  console.log(`  dispatch any non-0xFF: ${memoryState.dispatchAnyNonFF ? 'yes' : 'no'}`);
  console.log(`  dispatch all non-0xFF: ${memoryState.dispatchAllNonFF ? 'yes' : 'no'}`);
  console.log(
    `  ${hex(D007EB_ADDR, 6)}..${hex(D007EB_ADDR + D007EB_LEN - 1, 6)} = ${formatBytes(memoryState.d007ebBytes)} (value ${hex(memoryState.d007ebValue, 6)})`,
  );
}

function runBootSequence(osInitMaxSteps, sequenceLabel) {
  const machine = createMachine();

  console.log(`=== ${sequenceLabel} ===`);

  const coldBoot = runTracked(machine.executor, BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
    label: `${sequenceLabel} cold boot`,
  });
  logRun('Cold boot', coldBoot);

  resetForAdlEntry(machine);

  const osInit = runTracked(machine.executor, OS_INIT_ENTRY, OS_INIT_MODE, {
    maxSteps: osInitMaxSteps,
    maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
    label: `${sequenceLabel} os init`,
    progressInterval: osInitMaxSteps >= 500000 ? 100000 : 0,
  });
  logRun('OS init', osInit);

  const memoryState = captureMemoryState(machine.mem);
  logMemoryState('Post-run memory state', memoryState);

  return {
    coldBoot,
    osInit,
    memoryState,
  };
}

function buildReport(primary, extended) {
  const lines = [];
  const overallReached = primary.coldBoot.pollVisited || primary.osInit.pollVisited;

  lines.push('# Phase 135 - Hardware Poll 0x006138 Boot Probe');
  lines.push('');
  lines.push('Generated by `probe-phase135-poll-boot.mjs`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Current SPI status stub: `0xD00C -> 0x02`, `0xD00D -> 0x00`.');
  lines.push(`- Cold boot: entry \`${hex(BOOT_ENTRY, 6)}\`, mode \`${BOOT_MODE}\`, maxSteps \`${BOOT_MAX_STEPS}\`, maxLoopIterations \`${BOOT_MAX_LOOP_ITERATIONS}\`.`);
  lines.push(`- OS init: entry \`${hex(OS_INIT_ENTRY, 6)}\`, mode \`${OS_INIT_MODE}\`, maxSteps \`${OS_INIT_MAX_STEPS}\`, maxLoopIterations \`${OS_INIT_MAX_LOOP_ITERATIONS}\`.`);
  lines.push('');
  lines.push('## Cold Boot');
  lines.push('');
  lines.push(`- Result: \`${formatRunSummary(primary.coldBoot)}\``);
  lines.push(`- Reached \`${hex(POLL_ENTRY, 6)}\`: ${primary.coldBoot.pollVisited ? 'yes' : 'no'}`);
  lines.push(`- First visit step: \`${primary.coldBoot.firstPollVisitStep ?? 'not hit'}\``);
  lines.push(`- Poll block visits: \`${summarizePollBlocks(primary.coldBoot)}\``);
  lines.push(`- First missing block: \`${summarizeMissing(primary.coldBoot)}\``);
  lines.push('');
  lines.push('## OS Init 500k Run');
  lines.push('');
  lines.push(`- Result: \`${formatRunSummary(primary.osInit)}\``);
  lines.push(`- Reached \`${hex(POLL_ENTRY, 6)}\`: ${primary.osInit.pollVisited ? 'yes' : 'no'}`);
  lines.push(`- First visit step: \`${primary.osInit.firstPollVisitStep ?? 'not hit'}\``);
  lines.push(`- Poll block visits: \`${summarizePollBlocks(primary.osInit)}\``);
  lines.push(`- First missing block: \`${summarizeMissing(primary.osInit)}\``);
  lines.push('');
  lines.push('## Post-Run Memory State');
  lines.push('');
  lines.push(`- Dispatch table bytes \`${hex(DISPATCH_TABLE_ADDR, 6)}..${hex(DISPATCH_TABLE_ADDR + DISPATCH_TABLE_LEN - 1, 6)}\`: \`${formatBytes(primary.memoryState.dispatchBytes)}\``);
  lines.push(`- Dispatch table any non-0xFF: ${primary.memoryState.dispatchAnyNonFF ? 'yes' : 'no'}`);
  lines.push(`- Dispatch table all non-0xFF: ${primary.memoryState.dispatchAllNonFF ? 'yes' : 'no'}`);
  lines.push(`- Value at \`${hex(D007EB_ADDR, 6)}..${hex(D007EB_ADDR + D007EB_LEN - 1, 6)}\`: \`${formatBytes(primary.memoryState.d007ebBytes)}\` (little-endian \`${hex(primary.memoryState.d007ebValue, 6)}\`)`);
  lines.push('');
  lines.push('## Extended Attempt');
  lines.push('');

  if (!extended) {
    lines.push(`- Skipped. The 500k OS-init run consumed the full budget (\`steps=${primary.osInit.result.steps}\`).`);
  } else {
    lines.push(`- Result: \`${formatRunSummary(extended.osInit)}\``);
    lines.push(`- Reached \`${hex(POLL_ENTRY, 6)}\`: ${extended.osInit.pollVisited ? 'yes' : 'no'}`);
    lines.push(`- First visit step: \`${extended.osInit.firstPollVisitStep ?? 'not hit'}\``);
    lines.push(`- Poll block visits: \`${summarizePollBlocks(extended.osInit)}\``);
    lines.push(`- First missing block: \`${summarizeMissing(extended.osInit)}\``);
  }

  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`- Overall, the boot sequence reached \`${hex(POLL_ENTRY, 6)}\`: ${overallReached ? 'yes' : 'no'}`);
  lines.push(
    `- The fresh \`${hex(OS_INIT_ENTRY, 6)}\` run reached \`${hex(POLL_ENTRY, 6)}\`: ${primary.osInit.pollVisited ? 'yes' : 'no'}${primary.osInit.pollVisited ? ` (first visit step ${primary.osInit.firstPollVisitStep})` : ''}.`,
  );
  lines.push(
    `- The 500k run ended with \`${primary.osInit.termination}\` at \`${hex(primary.osInit.result.lastPc, 6)}\` after \`${primary.osInit.result.steps}\` steps.`,
  );
  lines.push(
    `- Dispatch table initialization state: any non-0xFF = ${primary.memoryState.dispatchAnyNonFF ? 'yes' : 'no'}, all non-0xFF = ${primary.memoryState.dispatchAllNonFF ? 'yes' : 'no'}.`,
  );
  lines.push(
    `- \`${hex(D007EB_ADDR, 6)}\` 24-bit value after the 500k run: \`${hex(primary.memoryState.d007ebValue, 6)}\`.`,
  );

  return `${lines.join('\n')}\n`;
}

function buildFailureReport(error) {
  const message = error?.stack ?? String(error);

  return `# Phase 135 - Hardware Poll 0x006138 Boot Probe\n\nGenerated by \`probe-phase135-poll-boot.mjs\`.\n\n## Failure\n\n\`\`\`text\n${message}\n\`\`\`\n`;
}

function writeReport(reportText) {
  fs.writeFileSync(REPORT_PATH, reportText);
  console.log(`Report written to ${REPORT_PATH}`);
}

async function main() {
  console.log('=== Phase 135 - Hardware Poll 0x006138 Boot Probe ===');

  const primary = runBootSequence(OS_INIT_MAX_STEPS, 'Primary 500k run');

  let extended = null;
  if (primary.osInit.result.steps < OS_INIT_MAX_STEPS) {
    console.log('');
    console.log('500k run ended early. Starting 1M follow-up.');
    extended = runBootSequence(OS_INIT_EXTENDED_MAX_STEPS, 'Extended 1M run');
  }

  const report = buildReport(primary, extended);
  writeReport(report);
}

try {
  await main();
} catch (error) {
  console.error(error);
  writeReport(buildFailureReport(error));
  process.exitCode = 1;
}
