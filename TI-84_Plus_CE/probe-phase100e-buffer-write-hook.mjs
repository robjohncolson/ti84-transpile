#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase100e-report.md');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const OS_INIT_ENTRY = 0x08C331;
const OS_INIT_MAX_STEPS = 500000;
const OS_INIT_MAX_LOOP_ITERATIONS = 10000;

const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const EVENT_LOOP_ENTRY = 0x0019BE;
const EVENT_LOOP_MAX_STEPS = 500000;
const EVENT_LOOP_MAX_LOOP_ITERATIONS = 20000;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_END = 0xD020BF;
const MODE_BUF_LEN = MODE_BUF_END - MODE_BUF_START + 1;
const PROGRESS_INTERVAL = 100000;

const stdoutLines = [];

function log(line = '') {
  console.log(line);
  stdoutLines.push(line);
}

function hex(value, width = 2) {
  if (value === undefined || value === null || value < 0) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function isPrintableAscii(value) {
  return value >= 0x20 && value < 0x7f;
}

function formatAscii(value) {
  if (!isPrintableAscii(value)) {
    return '.';
  }

  return String.fromCharCode(value);
}

function formatHexBytes(bytes) {
  return bytes.map((value) => hex(value, 2)).join(' ');
}

function formatAsciiPreview(bytes) {
  return bytes.map(formatAscii).join('');
}

function readBytes(mem, start, length) {
  return Array.from(mem.slice(start, start + length));
}

function readModeBuffer(mem) {
  const bytes = readBytes(mem, MODE_BUF_START, MODE_BUF_LEN);
  return {
    bytes,
    hex: formatHexBytes(bytes),
    ascii: formatAsciiPreview(bytes),
  };
}

function resetStack(cpu, mem, size = 3) {
  cpu.sp = STACK_RESET_TOP - size;
  mem.fill(0xFF, cpu.sp, size);
}

function clearPendingInterrupts(peripherals) {
  peripherals.acknowledgeIRQ?.();
  peripherals.acknowledgeNMI?.();
}

function formatLastPc(result) {
  if (result.lastPc === undefined || result.lastPc === null) {
    return 'n/a';
  }

  return hex(result.lastPc, 6);
}

function installBufferWriteHook(cpu) {
  const writes = [];
  let currentPhase = 'idle';
  let currentStep = 0;
  let currentPc = null;

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordByte(addr, value) {
    if (addr < MODE_BUF_START || addr > MODE_BUF_END) {
      return;
    }

    writes.push({
      phase: currentPhase,
      step: currentStep,
      pc: currentPc,
      addr,
      value: value & 0xFF,
    });
  }

  cpu.write8 = (addr, value) => {
    recordByte(addr, value);
    return origWrite8(addr, value);
  };

  // Wide stores bypass write8 in this runtime, so mirror them into byte-level entries.
  cpu.write16 = (addr, value) => {
    recordByte(addr, value);
    recordByte(addr + 1, value >> 8);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte(addr, value);
    recordByte(addr + 1, value >> 8);
    recordByte(addr + 2, value >> 16);
    return origWrite24(addr, value);
  };

  return {
    writes,
    setContext(phase, step, pc) {
      currentPhase = phase;
      currentStep = step;
      currentPc = pc;
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function runStage(executor, hook, {
  label,
  entry,
  mode,
  maxSteps,
  maxLoopIterations,
  stepBase,
  progressEvery = 0,
}) {
  const interrupts = [];
  let nextProgress = progressEvery > 0
    ? stepBase + progressEvery
    : Number.POSITIVE_INFINITY;

  hook.setContext(label, stepBase, entry);
  log(`run ${label}: entry=${hex(entry, 6)} mode=${mode} maxSteps=${maxSteps}`);

  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
    onBlock(pc, blockMode, meta, steps) {
      const absoluteStep = stepBase + steps + 1;
      hook.setContext(label, absoluteStep, pc);

      if (absoluteStep < nextProgress) {
        return;
      }

      log(`  progress ${label}: step=${absoluteStep}`);
      nextProgress += progressEvery;
    },
    onInterrupt(type, returnPc, vector, steps) {
      interrupts.push({
        type,
        step: stepBase + steps,
        returnPc,
        vector,
      });
    },
  });

  log(
    `result ${label}: steps=${result.steps} term=${result.termination} lastPc=${formatLastPc(result)} interrupts=${interrupts.length}`,
  );

  return {
    label,
    entry,
    mode,
    maxSteps,
    result,
    interrupts,
    stepBase,
    stepEnd: stepBase + result.steps,
  };
}

function summarizeWritesByPc(writes) {
  const byPc = new Map();

  for (const write of writes) {
    const key = `${write.pc}:${write.phase}`;
    let stats = byPc.get(key);

    if (!stats) {
      stats = {
        pc: write.pc,
        phase: write.phase,
        count: 0,
        firstStep: write.step,
        lastStep: write.step,
        addrSet: new Set(),
        valueSet: new Set(),
      };
      byPc.set(key, stats);
    }

    stats.count++;
    stats.firstStep = Math.min(stats.firstStep, write.step);
    stats.lastStep = Math.max(stats.lastStep, write.step);
    stats.addrSet.add(write.addr);
    stats.valueSet.add(write.value);
  }

  return Array.from(byPc.values())
    .map((stats) => ({
      phase: stats.phase,
      pc: stats.pc,
      count: stats.count,
      firstStep: stats.firstStep,
      lastStep: stats.lastStep,
      addrs: [...stats.addrSet].sort((left, right) => left - right),
      values: [...stats.valueSet].sort((left, right) => left - right),
    }))
    .sort(
      (left, right) =>
        left.firstStep - right.firstStep || (left.pc ?? -1) - (right.pc ?? -1),
    );
}

function formatAddressList(addrs) {
  if (addrs.length === 0) {
    return '(none)';
  }

  return addrs.map((addr) => hex(addr, 6)).join(', ');
}

function formatValueList(values) {
  if (values.length === 0) {
    return '(none)';
  }

  return values.map((value) => `${hex(value, 2)}(${formatAscii(value)})`).join(', ');
}

function buildRecommendation(writes, pcSummary) {
  if (writes.length === 0) {
    return 'Accept the seeded mode buffer as the current workaround. Interrupt-enabled boot and the event-loop entry still never touched 0xD020A6..0xD020BF in this runtime.';
  }

  if (pcSummary.length === 1) {
    return `Chase PC ${hex(pcSummary[0].pc, 6)} in phase ${pcSummary[0].phase}; it is the first confirmed dynamic writer into the mode-display buffer.`;
  }

  const top = pcSummary
    .slice(0, 3)
    .map((entry) => `${hex(entry.pc, 6)} (${entry.phase})`)
    .join(', ');

  return `Chase the earliest confirmed writers first: ${top}.`;
}

function buildReport({
  verdict,
  stages,
  writes,
  pcSummary,
  finalBuffer,
  recommendation,
  stdoutText,
}) {
  const lines = [];

  lines.push('# Phase 100E - Buffer Write Hook');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`- \`${verdict}\``);
  lines.push('');
  lines.push('## Run Summary');
  lines.push('');

  for (const stage of stages) {
    lines.push(
      `- \`${stage.label}\`: entry=${hex(stage.entry, 6)} steps=${stage.result.steps} term=${stage.result.termination} lastPc=${formatLastPc(stage.result)} interrupts=${stage.interrupts.length}`,
    );
  }

  lines.push('');
  lines.push('## Write Log');
  lines.push('');

  if (writes.length === 0) {
    lines.push('- none caught');
  } else {
    for (const write of writes) {
      lines.push(
        `- step=${write.step} phase=${write.phase} pc=${hex(write.pc, 6)} addr=${hex(write.addr, 6)} value=${hex(write.value, 2)} ascii=${formatAscii(write.value)}`,
      );
    }
  }

  lines.push('');
  lines.push('## Unique PCs');
  lines.push('');

  if (pcSummary.length === 0) {
    lines.push('- none');
  } else {
    for (const entry of pcSummary) {
      lines.push(
        `- pc=${hex(entry.pc, 6)} phase=${entry.phase} count=${entry.count} steps=${entry.firstStep}-${entry.lastStep} addrs=${formatAddressList(entry.addrs)} values=${formatValueList(entry.values)}`,
      );
    }
  }

  lines.push('');
  lines.push('## Final Buffer');
  lines.push('');
  lines.push(`- Hex: \`${finalBuffer.hex}\``);
  lines.push(`- ASCII: \`${finalBuffer.ascii}\``);
  lines.push('');
  lines.push('## Recommendation');
  lines.push('');
  lines.push(`- ${recommendation}`);
  lines.push('');
  lines.push('## Probe Stdout');
  lines.push('');
  lines.push('```text');
  lines.push(stdoutText);
  lines.push('```');

  return `${lines.join('\n')}\n`;
}

function buildFailureReport(error) {
  const lines = [];
  lines.push('# Phase 100E - Buffer Write Hook');
  lines.push('');
  lines.push('## Failure');
  lines.push('');
  lines.push('```text');
  lines.push(stdoutLines.join('\n'));
  if (stdoutLines.length > 0) {
    lines.push('');
  }
  lines.push(error.stack || String(error));
  lines.push('```');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
  const executor = createExecutor(romModule.PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  log('=== Phase 100E - Buffer write hook ===');
  log(`watchRange=${hex(MODE_BUF_START, 6)}..${hex(MODE_BUF_END, 6)} len=${MODE_BUF_LEN}`);
  log('timerInterrupt=true');

  const coldBootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });
  log(
    `coldBoot: entry=${hex(BOOT_ENTRY, 6)} steps=${coldBootResult.steps} term=${coldBootResult.termination} lastPc=${formatLastPc(coldBootResult)}`,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);
  clearPendingInterrupts(peripherals);

  const initialBuffer = readModeBuffer(mem);
  log(`buffer before os_init: ${initialBuffer.hex}`);

  const hook = installBufferWriteHook(cpu);
  const stages = [];
  let stepBase = 0;

  try {
    cpu.halted = false;
    cpu.iff1 = 1;
    cpu.iff2 = 1;

    const osInitStage = runStage(executor, hook, {
      label: 'os_init',
      entry: OS_INIT_ENTRY,
      mode: 'adl',
      maxSteps: OS_INIT_MAX_STEPS,
      maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
      stepBase,
      progressEvery: PROGRESS_INTERVAL,
    });
    stages.push(osInitStage);
    stepBase = osInitStage.stepEnd;

    cpu.mbase = 0xD0;
    cpu._iy = 0xD00080;
    cpu._hl = 0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    resetStack(cpu, mem);

    const postInitStage = runStage(executor, hook, {
      label: 'post_init',
      entry: POST_INIT_ENTRY,
      mode: 'adl',
      maxSteps: POST_INIT_MAX_STEPS,
      maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
      stepBase,
    });
    stages.push(postInitStage);
    stepBase = postInitStage.stepEnd;

    clearPendingInterrupts(peripherals);
    cpu.halted = false;
    cpu.iff1 = 1;
    cpu.iff2 = 1;
    resetStack(cpu, mem);

    const eventLoopStage = runStage(executor, hook, {
      label: 'event_loop',
      entry: EVENT_LOOP_ENTRY,
      mode: 'adl',
      maxSteps: EVENT_LOOP_MAX_STEPS,
      maxLoopIterations: EVENT_LOOP_MAX_LOOP_ITERATIONS,
      stepBase,
      progressEvery: PROGRESS_INTERVAL,
    });
    stages.push(eventLoopStage);
  } finally {
    hook.restore();
  }

  const finalBuffer = readModeBuffer(mem);
  const writes = hook.writes;
  const pcSummary = summarizeWritesByPc(writes);
  const verdict = writes.length > 0
    ? 'BUFFER POPULATOR REACHED'
    : 'BUFFER POPULATOR UNREACHABLE';
  const recommendation = buildRecommendation(writes, pcSummary);

  log('');
  log('write log:');
  if (writes.length === 0) {
    log('  none caught');
  } else {
    for (const [index, write] of writes.entries()) {
      log(
        `  [${index + 1}] step=${write.step} phase=${write.phase} pc=${hex(write.pc, 6)} addr=${hex(write.addr, 6)} value=${hex(write.value, 2)} ascii=${formatAscii(write.value)}`,
      );
    }
  }

  log('');
  log('unique pcs:');
  if (pcSummary.length === 0) {
    log('  none');
  } else {
    for (const entry of pcSummary) {
      log(
        `  pc=${hex(entry.pc, 6)} phase=${entry.phase} count=${entry.count} steps=${entry.firstStep}-${entry.lastStep} addrs=${formatAddressList(entry.addrs)} values=${formatValueList(entry.values)}`,
      );
    }
  }

  log('');
  log(`final buffer hex: ${finalBuffer.hex}`);
  log(`final buffer ascii: ${finalBuffer.ascii}`);
  log(`recommendation: ${recommendation}`);
  log(verdict);

  const stdoutText = stdoutLines.join('\n');
  const report = buildReport({
    verdict,
    stages,
    writes,
    pcSummary,
    finalBuffer,
    recommendation,
    stdoutText,
  });

  fs.writeFileSync(REPORT_PATH, report);
  log(`report=${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  fs.writeFileSync(REPORT_PATH, buildFailureReport(error));
  process.exitCode = 1;
}
