#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
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
const TARGET_INJECTIONS = 5;
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const PHASE56C_BLOCKS = new Set([
  '0x000038:adl',
  '0x0006f3:adl',
  '0x000704:adl',
  '0x000710:adl',
  '0x0008bb:adl',
  '0x001713:adl',
  '0x001717:adl',
  '0x001718:adl',
  '0x0019b5:adl',
  '0x0019be:adl',
  '0x0019ef:adl',
  '0x001a17:adl',
  '0x001a23:adl',
  '0x001a2d:adl',
  '0x001a32:adl',
  '0x001a5d:adl',
  '0x001a70:adl',
  '0x001a75:adl',
]);

const WATCH_FUNCTIONS = [
  { name: '0x009B35', pc: 0x009b35 },
  { name: '0x010220', pc: 0x010220 },
  { name: '0x014DAB', pc: 0x014dab },
];

const WATCH_MEMORY = [
  { label: 'D02651', addr: 0xd02651, size: 1 },
  { label: 'D02658', addr: 0xd02658, size: 3 },
  { label: 'D14038', addr: 0xd14038, size: 3 },
  { label: 'D1407B', addr: 0xd1407b, size: 1 },
  { label: 'D1408D', addr: 0xd1408d, size: 1 },
];

const PASS_CONFIGS = [
  {
    id: 'A',
    name: 'Pass A: byte1 bit6 -> 0x001A4B',
    mask: 1 << 14,
    expectedRoots: [0x0019be, 0x0019c6, 0x001a4b, 0x001a56, 0x001a5b, 0x001a32],
    focusWatch: [],
  },
  {
    id: 'B',
    name: 'Pass B: byte1 bit5 -> 0x001A77 -> 0x009B35',
    mask: 1 << 13,
    expectedRoots: [0x0019be, 0x0019c6, 0x001a77, 0x001a82, 0x009b35, 0x001a8b, 0x001a32],
    focusWatch: [0x009b35],
  },
  {
    id: 'C',
    name: 'Pass C: byte1 bit4 -> 0x001A8D -> 0x010220',
    mask: 1 << 12,
    expectedRoots: [0x0019be, 0x0019c6, 0x001a8d, 0x001a98, 0x010220, 0x002197, 0x001aa1, 0x001a32],
    focusWatch: [0x010220],
  },
  {
    id: 'D',
    name: 'Pass D: byte1 bit2 -> 0x001ABB',
    mask: 1 << 10,
    expectedRoots: [0x0019be, 0x0019c6, 0x001abb, 0x001ac6, 0x001acb, 0x001a32],
    focusWatch: [],
  },
  {
    id: 'E',
    name: 'Pass E: byte0 bit3 -> 0x001AA3 -> 0x014DAB',
    mask: 1 << 3,
    expectedRoots: [0x0019be, 0x0019ef, 0x0019f4, 0x001aa3, 0x001aae, 0x014dab, 0x001ab7, 0x001a32],
    focusWatch: [0x014dab],
    bonusVariant: {
      id: 'E0',
      name: 'Pass E bonus: byte0 bit3 with D1407B/D1408D forced to 0',
      memoryPatches: [
        { addr: 0xd1407b, size: 1, value: 0x00 },
        { addr: 0xd1408d, size: 1, value: 0x00 },
      ],
    },
  },
  {
    id: 'F',
    name: 'Pass F: byte0 bit4 -> 0x001ACF counter path',
    mask: 1 << 4,
    expectedRoots: [0x0019be, 0x0019ef, 0x0019f4, 0x001acf, 0x001ad9, 0x001ade, 0x001af2, 0x001a32],
    focusWatch: [],
  },
];

const WATCH_FUNCTION_SET = new Set(WATCH_FUNCTIONS.map((entry) => entry.pc));
const ALWAYS_LOG_PCS = new Set([
  0x0019be,
  0x0019c6,
  0x0019ef,
  0x0019f4,
  0x001a17,
  0x001a32,
  0x001a4b,
  0x001a77,
  0x001a8d,
  0x001abb,
  0x001aa3,
  0x001acf,
  0x009b35,
  0x010220,
  0x002197,
  0x014dab,
]);

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
const blockKey = (pc, mode) => `${hex(pc)}:${mode}`;

function inc(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

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

function topEntries(map, limit = 10) {
  return [...map.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  }).slice(0, limit);
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
      hex: hex(value, watch.size === 1 ? 2 : 6),
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

function summarizeWatchedFunctions(perInjection) {
  const summaries = {};

  for (const watch of WATCH_FUNCTIONS) {
    const nextBlockHits = new Map();
    const trails = [];
    let hits = 0;

    for (const injection of perInjection) {
      const trail = dedupeConsecutive(injection.blockTrail);
      for (let i = 0; i < trail.length; i++) {
        if (trail[i].pc !== watch.pc) continue;

        hits++;
        const follow = [];
        for (let j = i + 1; j < trail.length && follow.length < 8; j++) {
          follow.push(blockKey(trail[j].pc, trail[j].mode));
          if (trail[j].pc === 0x001a32 || HALT_PCS.has(trail[j].pc)) break;
        }

        if (follow[0]) inc(nextBlockHits, follow[0]);
        trails.push({
          injection: injection.index,
          follow,
        });
      }
    }

    summaries[watch.name] = {
      reached: hits > 0,
      hits,
      nextBlocks: topEntries(nextBlockHits, 5).map(([block, count]) => ({ block, count })),
      trails: trails.slice(0, 5),
    };
  }

  return summaries;
}

function createPassState(setup, passConfig, variantConfig = null) {
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
  const blockHits = new Map();
  const newBeyond56cHits = new Map();
  const missingHits = new Map();
  const perInjection = [];
  const interestingPcs = new Set([...ALWAYS_LOG_PCS, ...passConfig.expectedRoots, ...(passConfig.focusWatch || [])]);
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
    intcShadow.arm(passConfig.mask, `${passConfig.id}-irq-${index}`);

    currentInjection = {
      index,
      reason,
      resumePc,
      vramWrites: 0,
      uniqueBlocks: new Set(),
      blockTrail: [],
      missingBlocks: [],
      intcBefore: intcShadow.snapshot(),
      intcAfter: null,
      watchBefore: captureWatchMemory(env.mem),
      watchAfter: null,
      result: null,
      haltStackDepth: null,
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
      `[${passConfig.id}${variantConfig ? `/${variantConfig.id}` : ''} irq ${index}] inject`
      + ` resumePc=${hex(resumePc)}`
      + ` byte0=${hex(bytes.byte0, 2)}`
      + ` byte1=${hex(bytes.byte1, 2)}`
      + ` byte2=${hex(bytes.byte2, 2)}`,
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
      `[${passConfig.id}${variantConfig ? `/${variantConfig.id}` : ''} irq ${currentInjection.index}] result`
      + ` steps=${result.steps}`
      + ` termination=${result.termination}`
      + ` lastPc=${hex(result.lastPc)}`
      + ` vramWrites=${currentInjection.vramWrites}`
      + ` stackDepth=${hex(currentInjection.haltStackDepth)}`
      + ` maskedAfter=${currentInjection.intcAfter.maskedStatusHex}`,
    );

    currentInjection = null;
  }

  function onBlock(pc, mode, _meta, step) {
    const globalStep = totalSteps + step;
    const key = blockKey(pc, mode);
    uniqueBlocks.add(key);
    currentInjection.uniqueBlocks.add(key);
    currentInjection.blockTrail.push({ step: globalStep, pc, mode });
    inc(blockHits, key);

    if (!PHASE56C_BLOCKS.has(key)) {
      inc(newBeyond56cHits, key);
    }

    if (interestingPcs.has(pc) || WATCH_FUNCTION_SET.has(pc)) {
      console.log(`[${passConfig.id}${variantConfig ? `/${variantConfig.id}` : ''} irq ${currentInjection.index}] block ${hex(pc)} ${mode}`);
    }
  }

  function onMissingBlock(pc, mode, step) {
    const globalStep = totalSteps + step;
    const key = blockKey(pc, mode);
    inc(missingHits, key);
    currentInjection.missingBlocks.push({ step: globalStep, pc, mode });
    console.log(`[${passConfig.id}${variantConfig ? `/${variantConfig.id}` : ''} irq ${currentInjection.index}] missing ${hex(pc)} ${mode}`);
  }

  return {
    env,
    intcShadow,
    uniqueBlocks,
    blockHits,
    newBeyond56cHits,
    missingHits,
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

function buildPassSummary(setup, passConfig, variantConfig = null) {
  const state = createPassState(setup, passConfig, variantConfig);
  let resumePc = BOOT_HALT_PC;
  let injections = 0;
  let successfulHalts = 0;
  let stopReason = 'completed_target_injections';

  while (injections < TARGET_INJECTIONS) {
    injections++;
    state.beginInjection(
      injections,
      resumePc,
      injections === 1 ? 'initial_real_return_frame' : 'reinject_after_halt',
    );

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

  const newBeyond56c = [...state.newBeyond56cHits.keys()].sort();
  const newBeyond56cPcs = newBeyond56c.map((key) => Number.parseInt(key.slice(2, 8), 16));
  const deepestNewPc = newBeyond56cPcs.length ? Math.max(...newBeyond56cPcs) : null;
  const watchSummary = summarizeWatchedFunctions(state.perInjection);
  const expectedRootsMissing = passConfig.expectedRoots
    .map((pc) => blockKey(pc, 'adl'))
    .filter((key) => !state.uniqueBlocks.has(key) && !state.uniqueBlocks.has(key.replace(':adl', ':z80')));

  return {
    id: variantConfig?.id ?? passConfig.id,
    passId: passConfig.id,
    name: variantConfig?.name ?? passConfig.name,
    variantId: variantConfig?.id ?? null,
    mask: passConfig.mask >>> 0,
    maskHex: hex(passConfig.mask),
    maskBytes: {
      byte0: hex(maskBytes(passConfig.mask).byte0, 2),
      byte1: hex(maskBytes(passConfig.mask).byte1, 2),
      byte2: hex(maskBytes(passConfig.mask).byte2, 2),
    },
    injections,
    successfulHalts,
    stopReason,
    totalSteps: state.totalSteps,
    uniqueBlocks: [...state.uniqueBlocks].sort(),
    uniqueBlockCount: state.uniqueBlocks.size,
    topBlocks: topEntries(state.blockHits, 15),
    newBeyond56c,
    newBeyond56cCount: newBeyond56c.length,
    topNewBeyond56c: topEntries(state.newBeyond56cHits, 15),
    deepestNewPc,
    deepestNewPcHex: deepestNewPc === null ? null : hex(deepestNewPc),
    expectedRootsMissing,
    missingBlockCount: [...state.missingHits.values()].reduce((sum, count) => sum + count, 0),
    missingTop: topEntries(state.missingHits, 10),
    vramWritesTotal: state.perInjection.reduce((sum, injection) => sum + injection.vramWrites, 0),
    vramWritesPerInjection: state.perInjection.map((injection) => injection.vramWrites),
    vramNonZero: countNonZero(state.env.mem, VRAM_BASE, VRAM_SIZE),
    callback: read24(state.env.mem, CALLBACK_PTR),
    sysFlag: state.env.mem[SYS_FLAG_ADDR],
    deepInitFlag: state.env.mem[DEEP_INIT_FLAG_ADDR],
    finalCpu: formatCpu(state.env.cpu),
    watchMemoryFinal: captureWatchMemory(state.env.mem),
    intcFinal: state.intcShadow.snapshot(),
    intcAckWrites: state.intcShadow.ackWrites.slice(-10),
    intcEnableWrites: state.intcShadow.enableWrites.slice(-10),
    watchSummary,
    perInjection: state.perInjection.map((injection) => ({
      index: injection.index,
      reason: injection.reason,
      resumePc: injection.resumePc,
      steps: injection.result.steps,
      termination: injection.result.termination,
      lastPc: injection.result.lastPc,
      lastMode: injection.result.lastMode,
      vramWrites: injection.vramWrites,
      haltStackDepth: injection.haltStackDepth,
      uniqueBlockCount: injection.uniqueBlocks.size,
      missingBlockCount: injection.missingBlocks.length,
      intcBefore: injection.intcBefore,
      intcAfter: injection.intcAfter,
      watchBefore: injection.watchBefore,
      watchAfter: injection.watchAfter,
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
  console.log(`postInit sysFlag=${hex(setup.postInitMem[SYS_FLAG_ADDR], 2)} deepInitFlag=${hex(setup.postInitMem[DEEP_INIT_FLAG_ADDR], 2)}`);
  console.log(`postInitCpu ${formatSnapshot(setup.postInitCpu)}`);
  console.log(`postInit watch ${JSON.stringify(captureWatchMemory(setup.postInitMem))}`);
  console.log('');
}

function printPassSummary(summary) {
  console.log(`=== ${summary.name} ===`);
  console.log(
    `mask=${summary.maskHex}`
    + ` bytes=${JSON.stringify(summary.maskBytes)}`
    + ` injections=${summary.successfulHalts}/${summary.injections}`
    + ` stopReason=${summary.stopReason}`,
  );
  console.log(
    `uniqueBlocks=${summary.uniqueBlockCount}`
    + ` newBeyond56C=${summary.newBeyond56cCount}`
    + ` deepestNewPc=${summary.deepestNewPcHex ?? 'none'}`
    + ` missingBlocks=${summary.missingBlockCount}`
    + ` vramWrites=${summary.vramWritesTotal}`,
  );
  console.log(
    `callback=${hex(summary.callback)}`
    + ` sysFlag=${hex(summary.sysFlag, 2)}`
    + ` deepInitFlag=${hex(summary.deepInitFlag, 2)}`
    + ` vramNonZero=${summary.vramNonZero}`,
  );
  console.log(`watchMemoryFinal=${JSON.stringify(summary.watchMemoryFinal)}`);
  console.log(`intcFinal=${JSON.stringify(summary.intcFinal)}`);
  console.log(`topNewBeyond56C=${JSON.stringify(summary.topNewBeyond56c)}`);
  console.log(`expectedRootsMissing=${JSON.stringify(summary.expectedRootsMissing)}`);
  console.log(`watchSummary=${JSON.stringify(summary.watchSummary)}`);
  console.log('');
}

function pickBestPass(summaries) {
  return [...summaries].sort((a, b) => {
    if (b.vramWritesTotal !== a.vramWritesTotal) return b.vramWritesTotal - a.vramWritesTotal;
    if (b.newBeyond56cCount !== a.newBeyond56cCount) return b.newBeyond56cCount - a.newBeyond56cCount;
    const aDepth = a.deepestNewPc ?? -1;
    const bDepth = b.deepestNewPc ?? -1;
    if (bDepth !== aDepth) return bDepth - aDepth;
    return a.name.localeCompare(b.name);
  })[0];
}

const setup = collectSetup();
printSetup(setup);

const summaries = [];
for (const passConfig of PASS_CONFIGS) {
  const primary = buildPassSummary(setup, passConfig);
  summaries.push(primary);
  printPassSummary(primary);

  if (passConfig.bonusVariant) {
    const bonus = buildPassSummary(setup, passConfig, passConfig.bonusVariant);
    summaries.push(bonus);
    printPassSummary(bonus);
  }
}

const bestPass = pickBestPass(summaries);
console.log('=== Verdict ===');
console.log(
  `mostVRAMWrites=${bestPass.name}`
  + ` vramWrites=${bestPass.vramWritesTotal}`
  + ` newBeyond56C=${bestPass.newBeyond56cCount}`
  + ` deepestNewPc=${bestPass.deepestNewPcHex ?? 'none'}`,
);
for (const summary of summaries) {
  console.log(
    `${summary.name}:`
    + ` injections=${summary.successfulHalts}/${summary.injections}`
    + ` newBeyond56C=${summary.newBeyond56cCount}`
    + ` deepestNewPc=${summary.deepestNewPcHex ?? 'none'}`
    + ` missing=${summary.missingBlockCount}`
    + ` vramWrites=${summary.vramWritesTotal}`,
  );
}

console.log(`\nSUMMARY_JSON ${JSON.stringify({
  forcingMethod: {
    codePath: 'peripherals.register shadow over FTINTC010 ports 0x5000-0x501F',
    reason: 'peripherals.js keeps intcState in closure state.intc and does not expose it or a debug setter',
    directFieldSeenInSource: ['intcState.rawStatus', 'intcState.enableMask'],
    requiredApiForTrueDirectPoke: 'Expose intcState or add a debugSetIntcState/debugSetMaskedStatus helper in createPeripheralBus()',
  },
  setup: {
    boot: setup.bootResult,
    init: setup.initResult,
    postInitCallback: hex(read24(setup.postInitMem, CALLBACK_PTR)),
    postInitSysFlag: hex(setup.postInitMem[SYS_FLAG_ADDR], 2),
    postInitDeepInitFlag: hex(setup.postInitMem[DEEP_INIT_FLAG_ADDR], 2),
    watchMemory: captureWatchMemory(setup.postInitMem),
  },
  summaries,
  bestPass: {
    name: bestPass.name,
    vramWritesTotal: bestPass.vramWritesTotal,
    newBeyond56cCount: bestPass.newBeyond56cCount,
    deepestNewPcHex: bestPass.deepestNewPcHex,
  },
})}`);
