#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const reportPath = path.join(__dirname, 'phase61-d14038-sweep-report.md');

if (!fs.existsSync(romPath)) throw new Error(`Missing ${romPath}`);

const romBytes = fs.readFileSync(romPath);

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const IRQ_VECTOR = 0x000038;
const EVENT_LOOP_ENTRY = 0x0019be;
const BOOT_HALT_PC = 0x0019b5;
const HALT_PCS = new Set([0x0019b5, 0x0019b6]);
const CALLBACK_PTR = 0xd02ad7;
const SYS_FLAG_ADDR = 0xd0009b;
const SYS_FLAG_MASK = 0x40;
const DEEP_INIT_FLAG_ADDR = 0xd177ba;
const IY_BASE = 0xd00080;
const INIT_STACK_TOP = 0xd1a87e;
const MANUAL_IRQ_STACK_TOP = 0xd0fff8;
const INJECTION_STEP_LIMIT = 50000;
const TARGET_INJECTIONS = 1;
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const SERVICE_ENTRY_PC = 0x014dab;
const PASS_E_MASK = 1 << 3;
const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const PASS_CONFIG = {
  id: 'E',
  name: 'Pass E bonus sweep: byte0 bit3 with D1407B/D1408D forced to 0',
  mask: PASS_E_MASK,
  expectedRoots: [0x0019be, 0x0019ef, 0x0019f4, 0x001aa3, 0x001aae, 0x014dab, 0x001ab7, 0x001a32],
};

const SEEDS = [0x0007ce, 0x0007cf, 0x0007d0, 0x0007d1];

const VARIANT_CONFIGS = SEEDS.map((seed) => ({
  id: `seed-${seed.toString(16).padStart(6, '0')}`,
  name: `Seed 0x${seed.toString(16).padStart(6, '0')}`,
  seed,
  memoryPatches: [
    { addr: 0xd1407b, size: 1, value: 0x00 },
    { addr: 0xd1408d, size: 1, value: 0x00 },
    { addr: 0xd14038, size: 3, value: seed },
  ],
}));

const WATCH_MEMORY = [
  { label: 'D14038', addr: 0xd14038, size: 3 },
  { label: 'D1407B', addr: 0xd1407b, size: 1 },
  { label: 'D1407C', addr: 0xd1407c, size: 1 },
  { label: 'D14081', addr: 0xd14081, size: 1 },
  { label: 'D1408D', addr: 0xd1408d, size: 1 },
  { label: 'D177B8', addr: 0xd177b8, size: 1 },
];

const PHASE59_BASELINE_PCS = [
  0x0019be,
  0x0019ef,
  0x0019f4,
  0x001aa3,
  0x001aae,
  0x014dab,
  0x014dd0,
  0x014e20,
  0x014dc2,
  0x014dc9,
  0x014d48,
  0x014d50,
  0x014d59,
  0x014da6,
  0x014e29,
  0x001ab7,
  0x001a32,
  0x002197,
];

const PHASE59_BASELINE_SET = new Set(PHASE59_BASELINE_PCS);

const TRACE_PCS = new Set([
  0x0019be,
  0x0019ef,
  0x0019f4,
  0x001aa3,
  0x001aae,
  0x001ab7,
  0x001a32,
  0x002197,
  0x006eb6,
  0x006f4d,
  0x006faf,
  0x014d48,
  0x014d50,
  0x014d59,
  0x014da6,
  0x014dab,
  0x014dc2,
  0x014dc9,
  0x014dd0,
  0x014dde,
  0x014de6,
  0x014dea,
  0x014ded,
  0x014df4,
  0x014df8,
  0x014dff,
  0x014e08,
  0x014e0b,
  0x014e14,
  0x014e15,
  0x014e20,
  0x014e29,
  0x014e33,
  0x014e3d,
]);

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
const blockKey = (pc, mode) => `${hex(pc)}:${mode}`;

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function readSized(mem, addr, size) {
  if (size === 1) return mem[addr];
  return read24(mem, addr);
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) snapshot[field] = cpu[field];
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) cpu[field] = snapshot[field];
}

function countNonZero(mem, start, size) {
  let count = 0;
  for (let i = start; i < start + size; i++) {
    if (mem[i] !== 0) count++;
  }
  return count;
}

function formatCpu(cpu) {
  return [
    `A=${hex(cpu.a, 2)}`,
    `F=${hex(cpu.f, 2)}`,
    `BC=${hex(cpu.bc)}`,
    `DE=${hex(cpu.de)}`,
    `HL=${hex(cpu.hl)}`,
    `IX=${hex(cpu._ix)}`,
    `IY=${hex(cpu._iy)}`,
    `SP=${hex(cpu.sp)}`,
    `IM=${cpu.im}`,
    `IFF1=${cpu.iff1}`,
    `IFF2=${cpu.iff2}`,
    `MBASE=${hex(cpu.mbase, 2)}`,
    `MADL=${cpu.madl}`,
    `HALT=${cpu.halted}`,
  ].join(' ');
}

function formatSnapshot(snapshot) {
  return [
    `A=${hex(snapshot.a, 2)}`,
    `F=${hex(snapshot.f, 2)}`,
    `BC=${hex(snapshot._bc)}`,
    `DE=${hex(snapshot._de)}`,
    `HL=${hex(snapshot._hl)}`,
    `IX=${hex(snapshot._ix)}`,
    `IY=${hex(snapshot._iy)}`,
    `SP=${hex(snapshot.sp)}`,
    `IM=${snapshot.im}`,
    `IFF1=${snapshot.iff1}`,
    `IFF2=${snapshot.iff2}`,
    `MBASE=${hex(snapshot.mbase, 2)}`,
    `MADL=${snapshot.madl}`,
    `HALT=${snapshot.halted}`,
  ].join(' ');
}

function formatValue(value, size) {
  return hex(value, size === 1 ? 2 : 6);
}

function formatPcList(pcs) {
  if (!pcs.length) return 'none';
  return pcs.map((pc) => `\`${hex(pc)}\``).join(', ');
}

function formatTrail(trail) {
  if (!trail.length) return 'not reached';
  return trail.map((hit) => `\`${blockKey(hit.pc, hit.mode)}\``).join(' -> ');
}

function formatTermination(result) {
  return `\`${result.termination}@${hex(result.lastPc)}:${result.lastMode}\``;
}

function createEnv() {
  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
  });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { peripherals, mem, executor, cpu: executor.cpu };
}

function captureWatchMemory(mem) {
  const result = {};
  for (const watch of WATCH_MEMORY) {
    const value = readSized(mem, watch.addr, watch.size);
    result[watch.label] = {
      value,
      hex: formatValue(value, watch.size),
    };
  }
  return result;
}

function applyMemoryPatches(mem, patches = []) {
  for (const patch of patches) {
    if (patch.size === 1) {
      mem[patch.addr] = patch.value & 0xff;
      continue;
    }

    write24(mem, patch.addr, patch.value >>> 0);
  }
}

function maskBytes(mask) {
  return {
    byte0: mask & 0xff,
    byte1: (mask >> 8) & 0xff,
    byte2: (mask >> 16) & 0xff,
  };
}

function installIntcShadow(peripherals) {
  const state = {
    rawStatus: 0x000000,
    enableMask: 0x000000,
    latchMode: 0x000000,
    inversion: 0x000000,
    armHistory: [],
    ackWrites: [],
    enableWrites: [],
  };

  function snapshot() {
    const masked = state.rawStatus & state.enableMask;
    return {
      rawStatus: state.rawStatus >>> 0,
      enableMask: state.enableMask >>> 0,
      maskedStatus: masked >>> 0,
      rawStatusHex: hex(state.rawStatus),
      enableMaskHex: hex(state.enableMask),
      maskedStatusHex: hex(masked),
      maskedBytes: {
        byte0: hex(masked & 0xff, 2),
        byte1: hex((masked >> 8) & 0xff, 2),
        byte2: hex((masked >> 16) & 0xff, 2),
      },
    };
  }

  function arm(mask, reason) {
    const normalizedMask = mask >>> 0;
    state.rawStatus = normalizedMask;
    state.enableMask = normalizedMask;
    state.armHistory.push({
      reason,
      rawStatus: hex(state.rawStatus),
      enableMask: hex(state.enableMask),
      maskedBytes: snapshot().maskedBytes,
    });
  }

  peripherals.register({ start: 0x5000, end: 0x501f }, {
    read(port) {
      const reg = port & 0x1f;
      if (reg === 0x00) return state.rawStatus & 0xff;
      if (reg === 0x01) return (state.rawStatus >> 8) & 0xff;
      if (reg === 0x02) return (state.rawStatus >> 16) & 0xff;
      if (reg === 0x04) return state.enableMask & 0xff;
      if (reg === 0x05) return (state.enableMask >> 8) & 0xff;
      if (reg === 0x06) return (state.enableMask >> 16) & 0xff;
      if (reg === 0x0c) return state.latchMode & 0xff;
      if (reg === 0x0d) return (state.latchMode >> 8) & 0xff;
      if (reg === 0x10) return state.inversion & 0xff;
      if (reg === 0x11) return (state.inversion >> 8) & 0xff;
      if (reg === 0x14) return (state.rawStatus & state.enableMask) & 0xff;
      if (reg === 0x15) return ((state.rawStatus & state.enableMask) >> 8) & 0xff;
      if (reg === 0x16) return ((state.rawStatus & state.enableMask) >> 16) & 0xff;
      return 0x00;
    },
    write(port, value) {
      const reg = port & 0x1f;
      if (reg === 0x04) {
        state.enableMask = (state.enableMask & 0xffff00) | value;
        state.enableWrites.push({ port: hex(port, 4), value: hex(value, 2), enableMask: hex(state.enableMask) });
        return;
      }

      if (reg === 0x05) {
        state.enableMask = (state.enableMask & 0xff00ff) | (value << 8);
        state.enableWrites.push({ port: hex(port, 4), value: hex(value, 2), enableMask: hex(state.enableMask) });
        return;
      }

      if (reg === 0x06) {
        state.enableMask = (state.enableMask & 0x00ffff) | (value << 16);
        state.enableWrites.push({ port: hex(port, 4), value: hex(value, 2), enableMask: hex(state.enableMask) });
        return;
      }

      if (reg === 0x08) {
        state.rawStatus &= ~value;
        state.ackWrites.push({ port: hex(port, 4), value: hex(value, 2), rawStatus: hex(state.rawStatus) });
        return;
      }

      if (reg === 0x09) {
        state.rawStatus &= ~(value << 8);
        state.ackWrites.push({ port: hex(port, 4), value: hex(value, 2), rawStatus: hex(state.rawStatus) });
        return;
      }

      if (reg === 0x0a) {
        state.rawStatus &= ~(value << 16);
        state.ackWrites.push({ port: hex(port, 4), value: hex(value, 2), rawStatus: hex(state.rawStatus) });
        return;
      }

      if (reg === 0x0c) {
        state.latchMode = (state.latchMode & 0xffff00) | value;
        return;
      }

      if (reg === 0x0d) {
        state.latchMode = (state.latchMode & 0xff00ff) | (value << 8);
        return;
      }

      if (reg === 0x10) {
        state.inversion = (state.inversion & 0xffff00) | value;
        return;
      }

      if (reg === 0x11) {
        state.inversion = (state.inversion & 0xff00ff) | (value << 8);
      }
    },
  });

  return {
    arm,
    snapshot,
    get ackWrites() {
      return state.ackWrites;
    },
    get enableWrites() {
      return state.enableWrites;
    },
    get armHistory() {
      return state.armHistory;
    },
  };
}

function collectSetup() {
  const env = createEnv();
  const bootResult = env.executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu.madl = 1;
  env.cpu.sp = INIT_STACK_TOP - 3;
  write24(env.mem, env.cpu.sp, 0xffffff);

  const initResult = env.executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });

  return {
    bootResult,
    initResult,
    postInitMem: new Uint8Array(env.mem),
    postInitCpu: snapshotCpu(env.cpu),
    lcdSnapshot: env.executor.lcdMmio
      ? { upbase: env.executor.lcdMmio.upbase, control: env.executor.lcdMmio.control }
      : null,
  };
}

function dedupeConsecutive(blockTrail) {
  const result = [];
  let lastKey = null;

  for (const hit of blockTrail) {
    const key = blockKey(hit.pc, hit.mode);
    if (key === lastKey) continue;
    result.push(hit);
    lastKey = key;
  }

  return result;
}

function extractServiceTrail(blockTrail) {
  const trail = dedupeConsecutive(blockTrail);
  const startIndex = trail.findIndex((hit) => hit.pc === SERVICE_ENTRY_PC);
  if (startIndex === -1) return [];

  const serviceTrail = [];
  for (let i = startIndex; i < trail.length; i++) {
    serviceTrail.push(trail[i]);
    if (trail[i].pc === 0x001a32) break;
  }

  return serviceTrail;
}

function uniquePcsFromTrail(trail) {
  const pcs = new Set();
  for (const hit of trail) pcs.add(hit.pc);
  return [...pcs].sort((a, b) => a - b);
}

function determineCompareBranch(serviceTrail) {
  const compareIndex = serviceTrail.findIndex((hit) => hit.pc === 0x014dd0);
  if (compareIndex === -1) {
    return {
      label: 'compare block 0x014DD0 not reached',
      outcome: 'not_reached',
    };
  }

  for (let i = compareIndex + 1; i < serviceTrail.length; i++) {
    if (serviceTrail[i].pc === 0x014e20) {
      return {
        label: 'JR NC -> 0x014E20 (incremented D14038 <= 0x0007D0)',
        outcome: 'nc_to_014e20',
      };
    }

    if (serviceTrail[i].pc === 0x014dde) {
      return {
        label: 'fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0)',
        outcome: 'fallthrough_to_014dde',
      };
    }
  }

  return {
    label: 'compare outcome unresolved from block trail',
    outcome: 'unknown',
  };
}

function buildNewBeyondBaseline(serviceTrail) {
  return uniquePcsFromTrail(serviceTrail).filter((pc) => !PHASE59_BASELINE_SET.has(pc));
}

function createPassState(setup, passConfig, variantConfig) {
  const env = createEnv();
  env.mem.set(setup.postInitMem);
  restoreCpu(env.cpu, setup.postInitCpu);

  if (setup.lcdSnapshot && env.executor.lcdMmio) {
    env.executor.lcdMmio.upbase = setup.lcdSnapshot.upbase;
    env.executor.lcdMmio.control = setup.lcdSnapshot.control;
  }

  if (variantConfig?.memoryPatches?.length) {
    applyMemoryPatches(env.mem, variantConfig.memoryPatches);
  }

  const intcShadow = installIntcShadow(env.peripherals);

  write24(env.mem, CALLBACK_PTR, EVENT_LOOP_ENTRY);
  env.mem[SYS_FLAG_ADDR] |= SYS_FLAG_MASK;
  env.cpu.halted = false;
  env.cpu.madl = 1;
  env.cpu.mbase = 0xd0;
  env.cpu._iy = IY_BASE;
  env.cpu.im = 1;
  env.cpu.iff1 = 1;
  env.cpu.iff2 = 1;
  env.cpu.sp = MANUAL_IRQ_STACK_TOP;

  const uniqueBlocks = new Set();
  const perInjection = [];
  const interestingPcs = new Set([...passConfig.expectedRoots, ...TRACE_PCS]);
  let currentInjection = null;
  let totalSteps = 0;

  const originalWrite8 = env.cpu.write8.bind(env.cpu);
  env.cpu.write8 = (addr, value) => {
    if (currentInjection && addr >= VRAM_BASE && addr < VRAM_BASE + VRAM_SIZE) {
      currentInjection.vramWrites++;
    }
    return originalWrite8(addr, value);
  };

  function beginInjection(index, resumePc, reason) {
    intcShadow.arm(passConfig.mask, `${variantConfig.id}-irq-${index}`);

    currentInjection = {
      index,
      reason,
      resumePc,
      vramWrites: 0,
      blockTrail: [],
      missingBlocks: [],
      intcBefore: intcShadow.snapshot(),
      intcAfter: null,
      watchBefore: captureWatchMemory(env.mem),
      watchAfter: null,
      result: null,
      haltStackDepth: null,
      serviceStarted: false,
    };

    env.cpu.halted = false;
    env.cpu.madl = 1;
    env.cpu.mbase = 0xd0;
    env.cpu.im = 1;
    env.cpu.iff1 = 1;
    env.cpu.iff2 = 1;
    env.cpu.push(resumePc);
    env.cpu.iff1 = 0;
    env.cpu.iff2 = 0;

    const bytes = maskBytes(passConfig.mask);
    console.log(
      `[${variantConfig.id} irq ${index}] inject`
      + ` resumePc=${hex(resumePc)}`
      + ` byte0=${hex(bytes.byte0, 2)}`
      + ` byte1=${hex(bytes.byte1, 2)}`
      + ` byte2=${hex(bytes.byte2, 2)}`
      + ` D14038=${currentInjection.watchBefore.D14038.hex}`,
    );
  }

  function endInjection(result) {
    currentInjection.result = {
      steps: result.steps,
      termination: result.termination,
      lastPc: result.lastPc,
      lastMode: result.lastMode,
    };
    currentInjection.haltStackDepth = (MANUAL_IRQ_STACK_TOP - env.cpu.sp) & 0xffffff;
    currentInjection.intcAfter = intcShadow.snapshot();
    currentInjection.watchAfter = captureWatchMemory(env.mem);
    perInjection.push(currentInjection);

    console.log(
      `[${variantConfig.id} irq ${currentInjection.index}] result`
      + ` steps=${result.steps}`
      + ` termination=${result.termination}`
      + ` lastPc=${hex(result.lastPc)}`
      + ` vramWrites=${currentInjection.vramWrites}`
      + ` stackDepth=${hex(currentInjection.haltStackDepth)}`
      + ` D14038=${currentInjection.watchAfter.D14038.hex}`
      + ` maskedAfter=${currentInjection.intcAfter.maskedStatusHex}`,
    );

    currentInjection = null;
  }

  function onBlock(pc, mode, _meta, step) {
    const globalStep = totalSteps + step;
    const key = blockKey(pc, mode);
    uniqueBlocks.add(key);

    if (pc === SERVICE_ENTRY_PC) {
      currentInjection.serviceStarted = true;
    }

    currentInjection.blockTrail.push({ step: globalStep, pc, mode });

    if (currentInjection.serviceStarted || interestingPcs.has(pc)) {
      console.log(`[${variantConfig.id} irq ${currentInjection.index}] block ${hex(pc)} ${mode}`);
    }
  }

  function onMissingBlock(pc, mode, step) {
    const globalStep = totalSteps + step;
    currentInjection.missingBlocks.push({ step: globalStep, pc, mode });
    console.log(`[${variantConfig.id} irq ${currentInjection.index}] missing ${hex(pc)} ${mode}`);
  }

  return {
    env,
    intcShadow,
    uniqueBlocks,
    perInjection,
    beginInjection,
    endInjection,
    onBlock,
    onMissingBlock,
    get totalSteps() {
      return totalSteps;
    },
    addSteps(value) {
      totalSteps += value;
    },
  };
}

function runPass(setup, passConfig, variantConfig) {
  const state = createPassState(setup, passConfig, variantConfig);
  let resumePc = BOOT_HALT_PC;
  let injections = 0;
  let successfulHalts = 0;
  let stopReason = 'completed_target_injections';

  while (injections < TARGET_INJECTIONS) {
    injections++;
    state.beginInjection(injections, resumePc, 'initial_real_return_frame');

    const result = state.env.executor.runFrom(IRQ_VECTOR, 'adl', {
      maxSteps: INJECTION_STEP_LIMIT,
      maxLoopIterations: 2000,
      onBlock: state.onBlock,
      onMissingBlock: state.onMissingBlock,
    });

    state.addSteps(result.steps);
    state.endInjection(result);

    if (result.termination === 'halt' && HALT_PCS.has(result.lastPc)) {
      successfulHalts++;
      resumePc = result.lastPc;
      continue;
    }

    stopReason = `${result.termination}@${hex(result.lastPc)}`;
    break;
  }

  const injection = state.perInjection[0];
  const serviceTrail = injection ? extractServiceTrail(injection.blockTrail) : [];
  const compareBranch = determineCompareBranch(serviceTrail);
  const newBeyondBaseline = buildNewBeyondBaseline(serviceTrail);

  return {
    id: variantConfig.id,
    name: variantConfig.name,
    seed: variantConfig.seed,
    seedHex: hex(variantConfig.seed),
    injections,
    successfulHalts,
    stopReason,
    totalSteps: state.totalSteps,
    uniqueBlockCount: state.uniqueBlocks.size,
    uniqueBlocks: [...state.uniqueBlocks].sort(),
    newBeyondBaseline,
    compareBranch,
    callback: read24(state.env.mem, CALLBACK_PTR),
    sysFlag: state.env.mem[SYS_FLAG_ADDR],
    deepInitFlag: state.env.mem[DEEP_INIT_FLAG_ADDR],
    vramNonZero: countNonZero(state.env.mem, VRAM_BASE, VRAM_SIZE),
    finalCpu: formatCpu(state.env.cpu),
    perInjection: state.perInjection.map((entry) => ({
      index: entry.index,
      reason: entry.reason,
      resumePc: entry.resumePc,
      steps: entry.result.steps,
      termination: entry.result.termination,
      lastPc: entry.result.lastPc,
      lastMode: entry.result.lastMode,
      vramWrites: entry.vramWrites,
      haltStackDepth: entry.haltStackDepth,
      intcBefore: entry.intcBefore,
      intcAfter: entry.intcAfter,
      watchBefore: entry.watchBefore,
      watchAfter: entry.watchAfter,
      missingBlocks: entry.missingBlocks,
      serviceTrail,
    })),
  };
}

function printSetup(setup) {
  console.log('=== Setup ===');
  console.log(
    `boot: steps=${setup.bootResult.steps}`
    + ` termination=${setup.bootResult.termination}`
    + ` lastPc=${hex(setup.bootResult.lastPc)}`
    + ` lastMode=${setup.bootResult.lastMode}`,
  );
  console.log(
    `init: steps=${setup.initResult.steps}`
    + ` termination=${setup.initResult.termination}`
    + ` lastPc=${hex(setup.initResult.lastPc)}`
    + ` lastMode=${setup.initResult.lastMode}`,
  );
  console.log(`postInit callback=${hex(read24(setup.postInitMem, CALLBACK_PTR))}`);
  console.log(
    `postInit sysFlag=${hex(setup.postInitMem[SYS_FLAG_ADDR], 2)}`
    + ` deepInitFlag=${hex(setup.postInitMem[DEEP_INIT_FLAG_ADDR], 2)}`,
  );
  console.log(`postInitCpu ${formatSnapshot(setup.postInitCpu)}`);
  console.log(`postInit watch ${JSON.stringify(captureWatchMemory(setup.postInitMem))}`);
  console.log('');
}

function printPassSummary(summary) {
  const injection = summary.perInjection[0];
  console.log(`=== ${summary.name} ===`);
  console.log(
    `seed=${summary.seedHex}`
    + ` injections=${summary.successfulHalts}/${summary.injections}`
    + ` stopReason=${summary.stopReason}`
    + ` compare=${summary.compareBranch.outcome}`
    + ` newBeyondBaseline=${summary.newBeyondBaseline.length}`
    + ` vramWrites=${injection.vramWrites}`,
  );
  console.log(
    `watchBefore=${JSON.stringify(injection.watchBefore)}`
    + ` watchAfter=${JSON.stringify(injection.watchAfter)}`,
  );
  console.log(`serviceTrail=${summary.perInjection[0].serviceTrail.map((hit) => blockKey(hit.pc, hit.mode)).join(' -> ')}`);
  console.log('');
}

function buildVerdict(summaries) {
  const withNewBlocks = summaries.filter((summary) => summary.newBeyondBaseline.length > 0);
  const withVramWrites = summaries.filter((summary) => summary.perInjection[0].vramWrites > 0);
  const thresholdCrossers = summaries.filter((summary) => summary.compareBranch.outcome === 'fallthrough_to_014dde');

  const renderUnlocked = withVramWrites.length > 0;
  const verdictLines = [
    `renderPathUnlocked=${renderUnlocked ? 'yes' : 'no'}`,
    `vramWrites=${withVramWrites.length ? withVramWrites.map((summary) => `${summary.seedHex}:${summary.perInjection[0].vramWrites}`).join(',') : 'none'}`,
    `thresholdCrossers=${thresholdCrossers.length ? thresholdCrossers.map((summary) => summary.seedHex).join(',') : 'none'}`,
    `newBlocks=${withNewBlocks.length ? withNewBlocks.map((summary) => `${summary.seedHex}:${summary.newBeyondBaseline.map((pc) => hex(pc)).join('/')}`).join(' | ') : 'none'}`,
  ];

  return {
    renderUnlocked,
    withNewBlocks,
    withVramWrites,
    thresholdCrossers,
    summaryLine: verdictLines.join(' '),
  };
}

function buildReport(setup, summaries, verdict) {
  const tableRows = summaries.map((summary) => {
    const injection = summary.perInjection[0];
    return `| \`${summary.seedHex}\` | \`${injection.watchAfter.D14038.hex}\` | ${injection.steps} | ${formatTermination(injection)} | ${summary.compareBranch.label} | ${summary.newBeyondBaseline.length ? formatPcList(summary.newBeyondBaseline) : 'none'} | ${injection.vramWrites} |`;
  }).join('\n');

  const trails = summaries.map((summary) => {
    const injection = summary.perInjection[0];
    return [
      `### ${summary.seedHex}`,
      `- Compare branch: ${summary.compareBranch.label}`,
      `- Watched state: D14038 ${injection.watchBefore.D14038.hex} -> ${injection.watchAfter.D14038.hex}; D1407C=${injection.watchAfter.D1407C.hex}; D14081=${injection.watchAfter.D14081.hex}; D177B8=${injection.watchAfter.D177B8.hex}`,
      `- New blocks beyond Phase 59 baseline: ${summary.newBeyondBaseline.length ? formatPcList(summary.newBeyondBaseline) : 'none'}`,
      `- Trail: ${formatTrail(summary.perInjection[0].serviceTrail)}`,
      '',
    ].join('\n');
  }).join('\n');

  const divergenceLines = [];
  const groupedByTrail = new Map();
  for (const summary of summaries) {
    const key = summary.perInjection[0].serviceTrail.map((hit) => blockKey(hit.pc, hit.mode)).join(' -> ');
    const group = groupedByTrail.get(key) || [];
    group.push(summary.seedHex);
    groupedByTrail.set(key, group);
  }

  for (const [trail, seeds] of groupedByTrail.entries()) {
    divergenceLines.push(`- ${seeds.join(', ')}: ${trail || 'service trail not reached'}`);
  }

  const newBlockLines = verdict.withNewBlocks.length
    ? verdict.withNewBlocks.map((summary) => `- ${summary.seedHex}: ${formatPcList(summary.newBeyondBaseline)}`)
    : ['- No seed reached a block outside the Phase 59 Pass E bonus baseline set.'];

  const thresholdFallbacks = summaries.filter((summary) => (
    summary.compareBranch.outcome === 'fallthrough_to_014dde'
    && !summary.perInjection[0].serviceTrail.some((hit) => hit.pc === 0x014de6)
  ));

  const stdoutSummary = [
    '- Stdout printed the common setup banner, then one IRQ injection for each of the four seeds.',
    '- Once `0x014DAB` was entered, stdout logged every visited block through the service return to `0x001A32`.',
    `- Final verdict line: \`${verdict.summaryLine}\``,
  ].join('\n');

  return [
    '# Phase 61 D14038 Sweep Report',
    '',
    '## Probe Command',
    '',
    '`node TI-84_Plus_CE/probe-phase61-d14038-sweep.mjs`',
    '',
    '## Setup',
    '',
    `- Boot: steps=${setup.bootResult.steps}, termination=${setup.bootResult.termination}, lastPc=${hex(setup.bootResult.lastPc)}:${setup.bootResult.lastMode}`,
    `- Init: steps=${setup.initResult.steps}, termination=${setup.initResult.termination}, lastPc=${hex(setup.initResult.lastPc)}:${setup.initResult.lastMode}`,
    `- Post-init callback=${hex(read24(setup.postInitMem, CALLBACK_PTR))}, sysFlag=${hex(setup.postInitMem[SYS_FLAG_ADDR], 2)}, deepInitFlag=${hex(setup.postInitMem[DEEP_INIT_FLAG_ADDR], 2)}`,
    `- Post-init watched state=${JSON.stringify(captureWatchMemory(setup.postInitMem))}`,
    '',
    '## Phase 59 Pass E Bonus Baseline Block Set',
    '',
    formatPcList(PHASE59_BASELINE_PCS),
    '',
    '## Per-Seed Results',
    '',
    '| Seed | D14038 After IRQ | Steps | Termination | Compare Branch | New Blocks Beyond Phase 59 Baseline | VRAM Writes |',
    '| --- | --- | ---: | --- | --- | --- | ---: |',
    tableRows,
    '',
    '## Full Block Trails',
    '',
    trails.trimEnd(),
    '',
    '## Divergence',
    '',
    divergenceLines.join('\n'),
    '',
    '## New Code Paths',
    '',
    newBlockLines.join('\n'),
    '',
    '## Stdout Summary',
    '',
    stdoutSummary,
    '',
    '## Verdict',
    '',
    `- Render path unlocked: ${verdict.renderUnlocked ? 'yes' : 'no'}`,
    `- VRAM writes observed: ${verdict.withVramWrites.length ? verdict.withVramWrites.map((summary) => `${summary.seedHex}:${summary.perInjection[0].vramWrites}`).join(', ') : 'none'}`,
    `- Seeds that crossed the 0x0007D0 threshold compare: ${verdict.thresholdCrossers.length ? verdict.thresholdCrossers.map((summary) => summary.seedHex).join(', ') : 'none'}`,
    thresholdFallbacks.length
      ? `- Threshold-crossing seeds still jumped straight from \`0x014DDE\` to \`0x014E20\`; \`D177B8\` stayed \`0xFF\`, so no \`0x014DE6+\` path unlocked.`
      : '- Threshold-crossing seeds reached additional post-0x014DDE blocks.',
    verdict.withNewBlocks.length
      ? `- New code reached with no VRAM writes: ${verdict.withNewBlocks.map((summary) => `${summary.seedHex} -> ${summary.newBeyondBaseline.map((pc) => hex(pc)).join(', ')}`).join(' | ')}`
      : '- New code reached with no VRAM writes: none',
    '',
  ].join('\n');
}

const setup = collectSetup();
printSetup(setup);

const summaries = [];
for (const variantConfig of VARIANT_CONFIGS) {
  const summary = runPass(setup, PASS_CONFIG, variantConfig);
  summaries.push(summary);
  printPassSummary(summary);
}

const verdict = buildVerdict(summaries);
const report = buildReport(setup, summaries, verdict);

fs.writeFileSync(reportPath, report);

console.log('=== Verdict ===');
console.log(verdict.summaryLine);
console.log(`reportPath=${reportPath}`);
console.log(`\nSUMMARY_JSON ${JSON.stringify({
  setup: {
    boot: setup.bootResult,
    init: setup.initResult,
    postInitCallback: hex(read24(setup.postInitMem, CALLBACK_PTR)),
    postInitSysFlag: hex(setup.postInitMem[SYS_FLAG_ADDR], 2),
    postInitDeepInitFlag: hex(setup.postInitMem[DEEP_INIT_FLAG_ADDR], 2),
    watchMemory: captureWatchMemory(setup.postInitMem),
  },
  summaries,
  verdict: {
    renderUnlocked: verdict.renderUnlocked,
    summaryLine: verdict.summaryLine,
  },
})}`);
