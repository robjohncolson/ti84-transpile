#!/usr/bin/env node
// Phase 98E: hunt the home-screen mode buffer populator through the timer ISR path.
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase98e-isr-populator-report.md');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_END = 0xD020BF;
const MODE_BUF_LEN = MODE_BUF_END - MODE_BUF_START + 1;
const CURSOR_ADDRS = [0xD00595, 0xD00596];
const MODE_STATE_ADDRS = [0xD00085, 0xD0008A];
const WATCHED_STATE_ADDRS = [...CURSOR_ADDRS, ...MODE_STATE_ADDRS];
const WATCHED_STATE_SET = new Set(WATCHED_STATE_ADDRS);
const RAM_SNAP_START = 0x400000;
const CPU_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

const OPTIONS = [
  {
    id: 'A',
    label: 'Re-run OS init with interrupts enabled',
    entry: 0x08C331,
    mode: 'adl',
    prepare({ cpu }) {
      cpu.halted = false;
      cpu.iff1 = 1;
      cpu.iff2 = 1;
    },
  },
  {
    id: 'B',
    label: 'Event loop entry 0x0019BE',
    entry: 0x0019BE,
    mode: 'adl',
    prepare({ cpu, mem }) {
      cpu.halted = false;
      cpu.iff1 = 1;
      cpu.iff2 = 1;
      cpu.sp = 0xD1A87E - 3;
      mem.fill(0xFF, cpu.sp, 3);
    },
  },
  {
    id: 'C',
    label: 'HALT recovery entry 0x0019B5',
    entry: 0x0019B5,
    mode: 'adl',
    prepare({ cpu }) {
      cpu.halted = false;
      cpu.iff1 = 1;
      cpu.iff2 = 1;
    },
  },
  {
    id: 'D',
    label: 'Resume entry 0x08C366',
    entry: 0x08C366,
    mode: 'adl',
    prepare({ cpu }) {
      cpu.halted = false;
      cpu.iff1 = 1;
      cpu.iff2 = 1;
    },
  },
];

function hex(value, width = 2) {
  if (value === undefined || value === null || value < 0) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function isPrintableAscii(value) {
  return value >= 0x20 && value < 0x7F;
}

function formatHexBytes(bytes) {
  return bytes.map((value) => hex(value, 2)).join(' ');
}

function formatAsciiPreview(bytes) {
  return bytes
    .map((value) => (isPrintableAscii(value) ? String.fromCharCode(value) : '.'))
    .join('');
}

function formatBufferText(bytes) {
  return bytes
    .map((value) => {
      if (isPrintableAscii(value)) {
        return String.fromCharCode(value);
      }

      return `[${value.toString(16).padStart(2, '0')}]`;
    })
    .join('');
}

function readBytes(mem, start, length) {
  return Array.from(mem.slice(start, start + length));
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function createRuntime() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  return { mem, peripherals, executor, cpu };
}

function buildPostInitSnapshot() {
  const runtime = createRuntime();
  const { executor, cpu, mem } = runtime;

  console.log('=== Phase 1: cold boot + OS init with timer on ===');
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3;
  mem.fill(0xFF, cpu.sp, 3);

  const osInit = executor.runFrom(0x08C331, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 10000,
  });
  const modeBuffer = readBytes(mem, MODE_BUF_START, MODE_BUF_LEN);
  const watchedBytes = WATCHED_STATE_ADDRS.map((addr) => ({ addr, value: mem[addr] }));

  console.log(
    `  osInit: steps=${osInit.steps} term=${osInit.termination} lastPc=${hex(osInit.lastPc, 6)}`,
  );
  console.log(`  mode buffer after init: ${formatHexBytes(modeBuffer)}`);
  console.log(`  mode buffer text view: ${formatBufferText(modeBuffer)}`);

  return {
    osInit,
    modeBuffer,
    watchedBytes,
    snapshot: {
      cpu: snapshotCpu(cpu),
      ram: new Uint8Array(mem.slice(RAM_SNAP_START)),
    },
  };
}

function cloneFromSnapshot(snapshot) {
  const runtime = createRuntime();
  runtime.mem.set(snapshot.ram, RAM_SNAP_START);
  restoreCpu(runtime.cpu, snapshot.cpu);
  runtime.peripherals.acknowledgeIRQ();
  runtime.peripherals.acknowledgeNMI();
  return runtime;
}

function installWriteTrap(runtime, optionId) {
  const { cpu } = runtime;
  const origWrite8 = cpu.write8.bind(cpu);
  const modeWrites = [];
  const stateWrites = [];
  const interrupts = [];
  let currentBlockPc = -1;
  let currentStep = 0;
  let nextProgress = 100000;

  cpu.write8 = (addr, value) => {
    const normalizedValue = value & 0xFF;
    const pc = cpu._pc ?? cpu.pc ?? currentBlockPc ?? -1;
    const entry = {
      step: currentStep,
      addr,
      val: normalizedValue,
      pc,
    };

    if (addr >= MODE_BUF_START && addr <= MODE_BUF_END) {
      modeWrites.push(entry);
    }

    if (WATCHED_STATE_SET.has(addr)) {
      stateWrites.push(entry);
    }

    return origWrite8(addr, value);
  };

  return {
    modeWrites,
    stateWrites,
    interrupts,
    onBlock(pc, mode, meta, steps) {
      currentBlockPc = pc;
      currentStep = steps + 1;

      if (currentStep >= nextProgress) {
        console.log(`  option ${optionId}: progress ${currentStep}`);
        nextProgress += 100000;
      }
    },
    onInterrupt(type, returnPc, vector, steps) {
      interrupts.push({
        type,
        returnPc,
        vector,
        step: steps,
      });
    },
    uninstall() {
      cpu.write8 = origWrite8;
    },
  };
}

function summarizeModeWrites(writes) {
  const byPc = new Map();

  for (const write of writes) {
    const key = write.pc;
    let stats = byPc.get(key);

    if (!stats) {
      stats = {
        pc: write.pc,
        count: 0,
        addrSet: new Set(),
        valueSet: new Set(),
        lastByAddr: new Map(),
        firstStep: write.step,
        lastStep: write.step,
      };
      byPc.set(key, stats);
    }

    stats.count++;
    stats.addrSet.add(write.addr);
    stats.valueSet.add(write.val);
    stats.lastByAddr.set(write.addr, write.val);
    stats.firstStep = Math.min(stats.firstStep, write.step);
    stats.lastStep = Math.max(stats.lastStep, write.step);
  }

  return Array.from(byPc.values())
    .map((stats) => {
      const values = [...stats.valueSet];
      const allSameByte = values.length === 1;
      const allFF = allSameByte && values[0] === 0xFF;
      const all00 = allSameByte && values[0] === 0x00;
      const preview = Array.from(stats.lastByAddr.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([addr, value]) => `${hex(addr, 6)}=${isPrintableAscii(value) ? String.fromCharCode(value) : hex(value, 2)}`)
        .join(' ');

      return {
        pc: stats.pc,
        count: stats.count,
        uniqueAddrCount: stats.addrSet.size,
        distinctValueCount: stats.valueSet.size,
        firstStep: stats.firstStep,
        lastStep: stats.lastStep,
        allSameByte,
        allFF,
        all00,
        varied: !allSameByte && !allFF && !all00,
        preview,
      };
    })
    .sort((left, right) => {
      if (right.uniqueAddrCount !== left.uniqueAddrCount) {
        return right.uniqueAddrCount - left.uniqueAddrCount;
      }

      if (right.count !== left.count) {
        return right.count - left.count;
      }

      if (left.firstStep !== right.firstStep) {
        return left.firstStep - right.firstStep;
      }

      return left.pc - right.pc;
    });
}

function pickCandidate(pcSummaries) {
  return (
    pcSummaries.find(
      (summary) =>
        summary.uniqueAddrCount >= MODE_BUF_LEN &&
        summary.varied &&
        !summary.allFF &&
        !summary.all00,
    ) ?? null
  );
}

function summarizeStateWrites(writes, mem) {
  return WATCHED_STATE_ADDRS.map((addr) => {
    const writesForAddr = writes.filter((entry) => entry.addr === addr);
    const byPc = new Map();

    for (const entry of writesForAddr) {
      byPc.set(entry.pc, (byPc.get(entry.pc) || 0) + 1);
    }

    const pcSummary = Array.from(byPc.entries())
      .sort((left, right) => right[1] - left[1] || left[0] - right[0])
      .map(([pc, count]) => `${hex(pc, 6)} x${count}`)
      .join(', ');

    return {
      addr,
      label:
        addr === 0xD00595
          ? 'cursor row'
          : addr === 0xD00596
            ? 'cursor col'
            : addr === 0xD00085
              ? 'mode-state byte 0xD00085'
              : 'mode-state byte 0xD0008A',
      finalValue: mem[addr],
      writeCount: writesForAddr.length,
      pcSummary,
    };
  });
}

function runOption(option, snapshot) {
  console.log(`\n=== Option ${option.id}: ${option.label} ===`);
  const runtime = cloneFromSnapshot(snapshot);
  const trap = installWriteTrap(runtime, option.id);

  option.prepare(runtime);

  const result = runtime.executor.runFrom(option.entry, option.mode, {
    maxSteps: 1000000,
    maxLoopIterations: 20000,
    onBlock: trap.onBlock,
    onInterrupt: trap.onInterrupt,
  });

  trap.uninstall();

  const finalBuffer = readBytes(runtime.mem, MODE_BUF_START, MODE_BUF_LEN);
  const pcSummaries = summarizeModeWrites(trap.modeWrites);
  const candidate = pickCandidate(pcSummaries);
  const stateSummary = summarizeStateWrites(trap.stateWrites, runtime.mem);

  console.log(
    `  result: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)}`,
  );
  console.log(`  mode writes: ${trap.modeWrites.length}`);
  console.log(`  final buffer: ${formatBufferText(finalBuffer)}`);

  return {
    ...option,
    result,
    modeWrites: trap.modeWrites,
    stateWrites: trap.stateWrites,
    interrupts: trap.interrupts,
    finalBuffer,
    pcSummaries,
    candidate,
    stateSummary,
  };
}

function buildVerdict(optionResults) {
  const candidates = optionResults
    .filter((option) => option.candidate)
    .sort((left, right) => {
      if (right.candidate.uniqueAddrCount !== left.candidate.uniqueAddrCount) {
        return right.candidate.uniqueAddrCount - left.candidate.uniqueAddrCount;
      }

      if (right.candidate.count !== left.candidate.count) {
        return right.candidate.count - left.candidate.count;
      }

      return left.id.localeCompare(right.id);
    });

  if (candidates.length > 0) {
    const winner = candidates[0];
    return [
      `Option ${winner.id} is the strongest hit. PC ${hex(winner.candidate.pc, 6)} wrote ${winner.candidate.count} bytes across ${winner.candidate.uniqueAddrCount} mode-buffer addresses with varied content.`,
      `Final buffer after option ${winner.id}: ${formatBufferText(winner.finalBuffer)}`,
    ];
  }

  const partials = optionResults.filter((option) => option.modeWrites.length > 0);
  if (partials.length > 0) {
    const closest = partials
      .map((option) => {
        const best = option.pcSummaries[0];
        if (!best) {
          return `option ${option.id}: writes observed, but no PC summary was retained`;
        }

        return `option ${option.id}: best PC ${hex(best.pc, 6)} wrote ${best.count} bytes across ${best.uniqueAddrCount} addresses`;
      })
      .join('; ');

    return [
      'No option reached a full 26-byte varied home-row write, but the ISR path did touch the mode buffer.',
      closest,
    ];
  }

  return [
    'No option produced any writes to 0xD020A6..0xD020BF.',
    'Next step: trace from the IRQ vector 0x000038 or log interrupt-controller enable/masked-status state to prove whether the timer ISR is actually dispatching into the OS event loop.',
  ];
}

function writeReport(phase1, optionResults) {
  const lines = [];
  const verdictLines = buildVerdict(optionResults);

  lines.push('# Phase 98E - ISR Mode Buffer Populator Hunt');
  lines.push('');
  lines.push('Generated by `probe-phase98e-isr-populator.mjs`.');
  lines.push('');
  lines.push('## 1. Phase 1 Result');
  lines.push('');
  lines.push(
    `- \`osInit\`: steps=${phase1.osInit.steps}, termination=${phase1.osInit.termination}, lastPc=${hex(phase1.osInit.lastPc, 6)}.`,
  );
  lines.push('');
  lines.push('## 2. Mode Buffer State After OS Init');
  lines.push('');
  lines.push(`- Hex: \`${formatHexBytes(phase1.modeBuffer)}\``);
  lines.push(`- Text: \`${formatBufferText(phase1.modeBuffer)}\``);
  lines.push(
    `- Watched state bytes: ${phase1.watchedBytes
      .map(({ addr, value }) => `\`${hex(addr, 6)}=${hex(value, 2)}\``)
      .join(' ')}`,
  );
  lines.push('');
  lines.push('## 3. Option Summary');
  lines.push('');
  lines.push('| option | entry | steps | termination | lastPc | mode writes | final buffer ascii |');
  lines.push('|---|---:|---:|---|---|---:|---|');

  for (const option of optionResults) {
    lines.push(
      `| ${option.id} | \`${hex(option.entry, 6)}\` | ${option.result.steps} | ${option.result.termination} | ${
        option.result.lastPc === undefined ? 'n/a' : `\`${hex(option.result.lastPc, 6)}\``
      } | ${option.modeWrites.length} | \`${formatAsciiPreview(option.finalBuffer)}\` |`,
    );
  }

  lines.push('');
  lines.push('## 4. Per-Option Details');
  lines.push('');

  for (const option of optionResults) {
    lines.push(`### Option ${option.id} - ${option.label}`);
    lines.push('');
    lines.push(
      `- Run result: steps=${option.result.steps}, termination=${option.result.termination}, lastPc=${hex(option.result.lastPc, 6)}.`,
    );
    lines.push(`- Interrupts observed: ${option.interrupts.length}.`);
    lines.push(`- Final buffer hex: \`${formatHexBytes(option.finalBuffer)}\``);
    lines.push(`- Final buffer text: \`${formatBufferText(option.finalBuffer)}\``);
    lines.push(`- Mode buffer writes: ${option.modeWrites.length}.`);

    if (option.result.missingBlocks?.length) {
      lines.push(
        `- Missing blocks: \`${option.result.missingBlocks.slice(0, 8).join(', ')}${
          option.result.missingBlocks.length > 8 ? ', ...' : ''
        }\`.`,
      );
    }

    if (option.pcSummaries.length > 0) {
      lines.push('');
      lines.push('| pc | writes | unique addrs | distinct values | step span | preview |');
      lines.push('|---|---:|---:|---:|---|---|');

      for (const summary of option.pcSummaries) {
        lines.push(
          `| \`${hex(summary.pc, 6)}\` | ${summary.count} | ${summary.uniqueAddrCount} | ${summary.distinctValueCount} | ${summary.firstStep}-${summary.lastStep} | ${summary.preview || '(none)'} |`,
        );
      }

      if (option.candidate) {
        lines.push('');
        lines.push(
          `- Top candidate: \`${hex(option.candidate.pc, 6)}\` wrote ${option.candidate.count} bytes across ${option.candidate.uniqueAddrCount} addresses with varied content.`,
        );
      }
    } else {
      lines.push('- No mode-buffer writes were captured.');
    }

    lines.push('');
    lines.push('| address | label | final | writes | pcs |');
    lines.push('|---|---|---|---:|---|');

    for (const state of option.stateSummary) {
      lines.push(
        `| \`${hex(state.addr, 6)}\` | ${state.label} | \`${hex(state.finalValue, 2)}\` | ${state.writeCount} | ${
          state.pcSummary || '(none)'
        } |`,
      );
    }

    lines.push('');
  }

  lines.push('## 5. Verdict');
  lines.push('');
  for (const line of verdictLines) {
    lines.push(`- ${line}`);
  }
  lines.push('');

  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
}

const phase1 = buildPostInitSnapshot();
const optionResults = OPTIONS.map((option) => runOption(option, phase1.snapshot));
writeReport(phase1, optionResults);

console.log(`\nReport written: ${REPORT_PATH}`);
