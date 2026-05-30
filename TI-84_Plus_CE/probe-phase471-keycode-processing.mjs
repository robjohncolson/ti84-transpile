#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STACK_RESET_TOP = 0xD1A87E;
const MEM_SIZE = 0x1000000;
const ENTRY_PC = 0x02FFAE;
const VRAM_START = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;

const WATCH_BLOCKS = new Map([
  [0x02FFAE, 'entry'],
  [0x030300, 'cursor/display prep'],
  [0x040D11, 'cursor timing'],
  [0x02FE84, 'near final RET'],
  [0x02FE88, 'final RET'],
  [0x02FD99, 'potential branch target'],
  [0x0059C6, 'display output'],
  [0x022346, 'table lookup'],
]);

const REPORT_ADDRS = [
  ['D00824', 0xD00824],
  ['D007E0', 0xD007E0],
  ['D0009D', 0xD0009D],
  ['D00088', 0xD00088],
  ['D00080', 0xD00080],
];

const CALL_OPCODES = new Map([
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xCD, 'CALL'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
]);

const romPath = path.join(__dirname, 'ROM.rom');
const romBytes = fs.readFileSync(romPath);
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS;

if (!BLOCKS) {
  throw new Error('ROM.transpiled.js did not export PRELIFTED_BLOCKS');
}

function hex(value, width = 6) {
  const mask = width <= 2 ? 0xFF : 0xFFFFFF;
  return `0x${((value ?? 0) & mask).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(mem, addr) {
  const base = addr & 0xFFFFFF;
  return (mem[base] | (mem[(base + 1) & 0xFFFFFF] << 8) | (mem[(base + 2) & 0xFFFFFF] << 16)) & 0xFFFFFF;
}

function checksumRange(mem, start, length) {
  let hash = 0x811C9DC5;
  for (let i = 0; i < length; i += 1) {
    hash ^= mem[(start + i) & 0xFFFFFF];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `0x${hash.toString(16).toUpperCase().padStart(8, '0')}`;
}

function formatFlags(f) {
  const value = f & 0xFF;
  return {
    raw: hex(value, 2),
    S: Boolean(value & 0x80),
    Z: Boolean(value & 0x40),
    H: Boolean(value & 0x10),
    PV: Boolean(value & 0x04),
    N: Boolean(value & 0x02),
    C: Boolean(value & 0x01),
  };
}

function createHarness() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes, 0);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  if (!cpu) {
    throw new Error('Executor did not expose cpu state');
  }

  return { mem, peripherals, executor, cpu };
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function runColdBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
  return {
    boot: summarizeRunResult(bootResult),
    kernel: summarizeRunResult(kernelResult),
    postInit: summarizeRunResult(postInitResult),
  };
}

function summarizeRunResult(result) {
  if (result == null || typeof result !== 'object') {
    return result ?? null;
  }

  const summary = {};
  for (const key of [
    'status',
    'reason',
    'termination',
    'steps',
    'stepCount',
    'blocks',
    'blockCount',
    'loopIterations',
    'pc',
    'mode',
  ]) {
    if (key in result) {
      summary[key] = typeof result[key] === 'number' ? hex(result[key]) : result[key];
    }
  }
  return summary;
}

function getCpuPc(cpu) {
  for (const key of ['pc', '_pc', 'r_pc']) {
    if (typeof cpu[key] === 'number') {
      return cpu[key] & 0xFFFFFF;
    }
  }
  return 0;
}

function getBlockPc(args, cpu) {
  for (const arg of args) {
    if (typeof arg === 'number') {
      return arg & 0xFFFFFF;
    }
    if (!arg || typeof arg !== 'object') {
      continue;
    }
    for (const key of ['pc', 'addr', 'address', 'start', 'entry', 'blockPc']) {
      if (typeof arg[key] === 'number') {
        return arg[key] & 0xFFFFFF;
      }
    }
    if (arg.block && typeof arg.block === 'object') {
      for (const key of ['pc', 'addr', 'address', 'start', 'entry']) {
        if (typeof arg.block[key] === 'number') {
          return arg.block[key] & 0xFFFFFF;
        }
      }
    }
  }
  return getCpuPc(cpu);
}

function directCallAt(mem, pc) {
  const opcode = mem[pc & 0xFFFFFF];
  const kind = CALL_OPCODES.get(opcode);
  if (!kind) {
    return null;
  }

  return {
    sourcePc: hex(pc),
    targetPc: hex(read24(mem, pc + 1)),
    opcode: hex(opcode, 2),
    kind,
  };
}

function makeTracer(cpu, mem) {
  const firstBlocks = [];
  const watchedHits = [];
  const calls = [];
  let blockCount = 0;
  let lastPc = null;
  let lastSp = null;
  let droppedCalls = 0;

  function pushCall(call) {
    if (calls.length < 10000) {
      calls.push({ step: blockCount, ...call });
    } else {
      droppedCalls += 1;
    }
  }

  return {
    onBlock(...args) {
      const pc = getBlockPc(args, cpu);
      blockCount += 1;

      const entry = {
        step: blockCount,
        pc: hex(pc),
        a: hex(cpu.a ?? 0, 2),
        flags: formatFlags(cpu.f ?? 0),
        sp: hex(cpu.sp ?? 0),
      };

      if (firstBlocks.length < 200) {
        firstBlocks.push(entry);
      }

      const label = WATCH_BLOCKS.get(pc);
      if (label) {
        watchedHits.push({ ...entry, label });
      }

      const directCall = directCallAt(mem, pc);
      if (directCall) {
        pushCall({ detection: 'direct-opcode-at-block-entry', ...directCall });
      }

      if (lastSp !== null) {
        const oldSp = lastSp & 0xFFFFFF;
        const newSp = (cpu.sp ?? 0) & 0xFFFFFF;
        const delta = (oldSp - newSp) & 0xFFFFFF;
        if (delta === 2 || delta === 3) {
          pushCall({
            detection: `stack-delta-${delta}`,
            sourcePc: lastPc == null ? null : hex(lastPc),
            targetPc: hex(pc),
          });
        }
      }

      lastPc = pc;
      lastSp = cpu.sp ?? 0;
    },

    report() {
      return {
        blockCount,
        firstBlocks,
        watchedHits,
        calls,
        droppedCalls,
      };
    },
  };
}

function readMemoryReport(mem) {
  return Object.fromEntries(
    REPORT_ADDRS.map(([name, addr]) => [
      name,
      {
        address: hex(addr),
        byte: hex(mem[addr], 2),
        word24: hex(read24(mem, addr)),
      },
    ]),
  );
}

function setupKeyDispatchState(cpu, mem, keyCode) {
  cpu.a = keyCode & 0xFF;
  cpu.f = (cpu.f ?? 0) & ~0x40;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  resetStack(cpu, mem);

  // The dispatch entry reloads the translated key byte from this RAM slot.
  mem[0xD00824] = keyCode & 0xFF;
}

function runScenario(keyCode) {
  const { mem, executor, cpu } = createHarness();
  const boot = runColdBoot(executor, cpu, mem);

  setupKeyDispatchState(cpu, mem, keyCode);
  const beforeVramChecksum = checksumRange(mem, VRAM_START, VRAM_SIZE);
  const tracer = makeTracer(cpu, mem);

  let runResult;
  let error = null;
  try {
    runResult = executor.runFrom(ENTRY_PC, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 5000,
      diHaltBypass: true,
      onBlock: tracer.onBlock,
    });
  } catch (err) {
    error = {
      name: err?.name ?? 'Error',
      message: err?.message ?? String(err),
      stack: err?.stack ?? null,
    };
  }

  const traceReport = tracer.report();
  return {
    keyCode: hex(keyCode, 2),
    setup: {
      entryPc: hex(ENTRY_PC),
      mode: 'adl',
      a: hex(keyCode, 2),
      zFlagClear: true,
      iy: hex(0xD00080),
      sp: hex(STACK_RESET_TOP - 3),
      returnSentinel: [hex(mem[STACK_RESET_TOP - 3], 2), hex(mem[STACK_RESET_TOP - 2], 2), hex(mem[STACK_RESET_TOP - 1], 2)],
      d00824Seeded: hex(keyCode, 2),
    },
    boot,
    execution: {
      runResult: summarizeRunResult(runResult),
      error,
      finalPc: hex(getCpuPc(cpu)),
      halted: Boolean(cpu.halted),
      a: hex(cpu.a ?? 0, 2),
      flags: formatFlags(cpu.f ?? 0),
      sp: hex(cpu.sp ?? 0),
    },
    trace: traceReport.firstBlocks,
    watchedHits: traceReport.watchedHits,
    calls: {
      count: traceReport.calls.length + traceReport.droppedCalls,
      dropped: traceReport.droppedCalls,
      entries: traceReport.calls,
    },
    memory: readMemoryReport(mem),
    vram: {
      start: hex(VRAM_START),
      size: VRAM_SIZE,
      beforeChecksum: beforeVramChecksum,
      afterChecksum: checksumRange(mem, VRAM_START, VRAM_SIZE),
    },
  };
}

const report = {
  probe: 'phase471-keycode-processing',
  description: 'Trace key command dispatch at 0x02FFAE after scan-to-key translation',
  watchBlocks: Object.fromEntries([...WATCH_BLOCKS.entries()].map(([addr, label]) => [hex(addr), label])),
  scenarios: [runScenario(0x05), runScenario(0x06)],
};

console.log(JSON.stringify(report, null, 2));
