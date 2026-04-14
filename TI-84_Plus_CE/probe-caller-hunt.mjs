#!/usr/bin/env node
// Phase 60: hunt callers of proven render primitives, then probe the
// 0x081670 family backward toward a higher-level menu/screen entry.
//
// Notes:
// - We prefer lifted instruction metadata from ROM.transpiled.js.
// - Some useful references are not lifted as normal code blocks, so we also
//   scan the raw ROM for direct CALL/JP opcodes targeting the same address.
// - 0x081670 has no lifted direct callers because it sits mid-chain behind a
//   short call-return wrapper spine. We recover that wrapper root too.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(romPath);

const TARGETS = [
  0x081670,
  0x0059c6,
  0x062160,
  0x005b96,
  0x0802b2,
];

const JT_BASE = 0x020104;
const JT_COUNT = 980;

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const SET_TEXT_FG_ENTRY = 0x0802b2;
const SCREEN_STACK_TOP = 0xd1a87e;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xd00080;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;

const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xaaaa;

const CPU_SNAPSHOT_FIELDS = [
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

const DIRECT_OPCODES = new Map([
  [0xcd, 'call'],
  [0xc3, 'jp'],
  [0xca, 'jp z'],
  [0xc2, 'jp nz'],
  [0xda, 'jp c'],
  [0xd2, 'jp nc'],
  [0xfa, 'jp m'],
  [0xf2, 'jp p'],
  [0xea, 'jp pe'],
  [0xe2, 'jp po'],
  [0xcc, 'call z'],
  [0xc4, 'call nz'],
  [0xdc, 'call c'],
  [0xd4, 'call nc'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
}

function isJumpTableRow(addr) {
  return (
    addr >= JT_BASE &&
    addr < JT_BASE + JT_COUNT * 4 &&
    ((addr - JT_BASE) % 4) === 0 &&
    romBytes[addr] === 0xc3
  );
}

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(
      `Missing ${transpiledPath}. Run node scripts/transpile-ti84-rom.mjs first.`,
    );
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function findFunctionEntry(callerPc, scanBackBytes = 0x100) {
  const floor = Math.max(0, callerPc - scanBackBytes);

  for (let addr = callerPc - 1; addr >= floor; addr -= 1) {
    if (romBytes[addr] === 0xc9) {
      return { entry: addr + 1, heuristic: 'after_ret', terminator: addr };
    }

    if (
      addr > 0 &&
      romBytes[addr - 1] === 0xed &&
      (romBytes[addr] === 0x4d || romBytes[addr] === 0x5d)
    ) {
      return {
        entry: addr + 1,
        heuristic: romBytes[addr] === 0x4d ? 'after_reti' : 'after_retn',
        terminator: addr - 1,
      };
    }
  }

  return { entry: callerPc, heuristic: 'caller', terminator: null };
}

function scanLiftedDirectCallers(blocks, target) {
  const rows = [];

  for (const block of Object.values(blocks)) {
    for (const instruction of block.instructions || []) {
      if (instruction.target !== target) {
        continue;
      }

      const tag = String(instruction.tag || '');
      if (!tag.includes('call') && !tag.includes('jp') && !tag.includes('jr')) {
        continue;
      }

      rows.push({
        source: 'lifted',
        callerPc: instruction.pc,
        kind: tag,
        entry: block.startPc,
        blockStart: block.startPc,
        blockMode: block.mode,
        dasm: instruction.dasm || tag,
      });
    }
  }

  rows.sort((a, b) => a.callerPc - b.callerPc || a.entry - b.entry);
  return rows;
}

function scanRawDirectCallers(target) {
  const rows = [];
  const lo = target & 0xff;
  const mid = (target >> 8) & 0xff;
  const hi = (target >> 16) & 0xff;

  for (let callerPc = 0; callerPc <= romBytes.length - 4; callerPc += 1) {
    const kind = DIRECT_OPCODES.get(romBytes[callerPc]);
    if (!kind) {
      continue;
    }

    if (
      romBytes[callerPc + 1] !== lo ||
      romBytes[callerPc + 2] !== mid ||
      romBytes[callerPc + 3] !== hi
    ) {
      continue;
    }

    const entryInfo = findFunctionEntry(callerPc);
    let decoded = null;

    try {
      decoded = decodeInstruction(romBytes, callerPc, 'adl');
    } catch {
      decoded = null;
    }

    rows.push({
      source: 'raw',
      callerPc,
      kind,
      entry: entryInfo.entry,
      blockStart: entryInfo.entry,
      blockMode: 'adl?',
      dasm: decoded?.dasm || kind,
      entryHeuristic: entryInfo.heuristic,
    });
  }

  rows.sort((a, b) => a.callerPc - b.callerPc || a.entry - b.entry);
  return rows;
}

function mergedCallers(blocks, target) {
  const merged = new Map();

  for (const row of [
    ...scanLiftedDirectCallers(blocks, target),
    ...scanRawDirectCallers(target),
  ]) {
    const key = `${row.callerPc}:${row.kind}`;
    const previous = merged.get(key);

    if (!previous) {
      merged.set(key, row);
      continue;
    }

    if (previous.source === 'raw' && row.source === 'lifted') {
      merged.set(key, { ...previous, ...row, source: 'lifted+raw' });
    }
  }

  return [...merged.values()].sort((a, b) => a.callerPc - b.callerPc);
}

function reverseExitPreds(blocks, target) {
  const preds = [];

  for (const block of Object.values(blocks)) {
    for (const exit of block.exits || []) {
      if (
        exit.target === target &&
        (exit.type === 'call-return' || exit.type === 'fallthrough')
      ) {
        preds.push({
          from: block.startPc,
          to: target,
          exitType: exit.type,
          mode: block.mode,
        });
      }
    }
  }

  preds.sort((a, b) => a.from - b.from);
  return preds;
}

function buildWrapperChain(blocks, target, maxDepth = 12) {
  const chain = [];
  const seen = new Set();
  let current = target;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (seen.has(current)) {
      break;
    }

    seen.add(current);
    const preds = reverseExitPreds(blocks, current);
    if (preds.length !== 1) {
      break;
    }

    const pred = preds[0];
    chain.push(pred);

    const direct = mergedCallers(blocks, pred.from);
    if (direct.length > 0) {
      break;
    }

    current = pred.from;
  }

  return chain;
}

function linearDecode(entry, byteLimit = 0x120) {
  const decoded = [];
  let pc = entry;
  const end = Math.min(romBytes.length, entry + byteLimit);

  while (pc < end) {
    let instruction;

    try {
      instruction = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      break;
    }

    decoded.push({
      pc,
      tag: instruction.tag || '',
      dasm: instruction.dasm || instruction.tag || '',
      target: instruction.target,
      length: instruction.length || 1,
    });

    pc += instruction.length || 1;

    const tag = String(instruction.tag || '');
    if (tag === 'ret' || tag.startsWith('ret-')) {
      break;
    }
  }

  return decoded;
}

function classifyFunction(entry) {
  const decoded = linearDecode(entry);
  const callTargets = decoded
    .filter((instruction) => typeof instruction.target === 'number')
    .map((instruction) => instruction.target);

  return {
    entry,
    range: `${hex(entry).slice(0, 4)}xxxx`,
    alsoCallsPutC: callTargets.includes(0x0059c6),
    alsoCallsErrorBanner: callTargets.includes(0x062160),
    alsoCallsSetTextFg: callTargets.includes(0x0802b2),
    callTargets,
  };
}

function buildClearedVram() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xff;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }

  return bytes;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xff, start, start + bytes);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(
    CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]),
  );
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function collectVramStats(mem) {
  let vramWrites = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      vramWrites += 1;

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    vramWrites,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

async function buildProbeEnv(blocks) {
  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
  });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });

  cpu.mbase = 0xd0;
  cpu._iy = PROBE_IY;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return {
    executor,
    mem,
    cpu,
    ramSnapshot: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram: buildClearedVram(),
    lcdSnapshot: executor.lcdMmio
      ? {
          upbase: executor.lcdMmio.upbase,
          control: executor.lcdMmio.control,
        }
      : null,
  };
}

function restoreBaseState(env) {
  env.mem.set(env.ramSnapshot, RAM_START);
  env.mem.set(env.clearedVram, VRAM_BASE);
  restoreCpu(env.cpu, env.cpuSnapshot);

  if (env.executor.lcdMmio && env.lcdSnapshot) {
    env.executor.lcdMmio.upbase = env.lcdSnapshot.upbase;
    env.executor.lcdMmio.control = env.lcdSnapshot.control;
  }
}

function runProbe(env, entry) {
  restoreBaseState(env);

  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu._iy = PROBE_IY;
  env.cpu.f = 0x40;
  env.cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(env.mem, env.cpu.sp, PROBE_STACK_BYTES);

  const uniqueBlocks = new Set();
  const firstBlocks = [];

  const raw = env.executor.runFrom(entry, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (uniqueBlocks.has(pc)) {
        return;
      }

      uniqueBlocks.add(pc);
      if (firstBlocks.length < 20) {
        firstBlocks.push(pc);
      }
    },
  });

  const stats = collectVramStats(env.mem);

  return {
    entry,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc,
    lastMode: raw.lastMode,
    vramWrites: stats.vramWrites,
    bbox: stats.bbox,
    uniqueBlocks: uniqueBlocks.size,
    firstBlocks,
    regs: {
      a: env.cpu.a,
      f: env.cpu.f,
      bc: env.cpu.bc,
      de: env.cpu.de,
      hl: env.cpu.hl,
      sp: env.cpu.sp,
      ix: env.cpu._ix,
      iy: env.cpu._iy,
      mbase: env.cpu.mbase,
    },
  };
}

function verdictForProbe(result) {
  if (result.vramWrites > 0) {
    return 'renders something';
  }

  if (result.termination === 'error') {
    return 'crashes';
  }

  return 'noop';
}

function printCallerTable(blocks, target) {
  const rows = mergedCallers(blocks, target);

  console.log(`\n=== Direct callers for ${hex(target)} (${rows.length}) ===`);
  for (const row of rows) {
    console.log(
      [
        `${hex(row.callerPc)} ${row.kind.padEnd(7)}`,
        `entry=${hex(row.entry)}`,
        `source=${row.source}`,
        isJumpTableRow(row.callerPc) ? 'note=jump-table-row' : null,
      ]
        .filter(Boolean)
        .join('  '),
    );
  }
}

async function main() {
  const blocks = await loadBlocks();

  for (const target of TARGETS) {
    printCallerTable(blocks, target);
  }

  const wrapperChain = buildWrapperChain(blocks, 0x081670);
  const wrapperRoot = wrapperChain.length > 0 ? wrapperChain[wrapperChain.length - 1].from : null;

  console.log('\n=== 0x081670 wrapper chain ===');
  for (const row of wrapperChain) {
    console.log(`${hex(row.from)} --${row.exitType}--> ${hex(row.to)}`);
  }
  console.log(`wrapper root: ${wrapperRoot ? hex(wrapperRoot) : 'none'}`);

  const practicalLevel1 = [];
  if (wrapperRoot !== null) {
    practicalLevel1.push({
      entry: wrapperRoot,
      callPc: null,
      relation: 'call-return wrapper root',
    });
  }

  for (const row of mergedCallers(blocks, 0x081670)) {
    if (isJumpTableRow(row.callerPc)) {
      continue;
    }

    practicalLevel1.push({
      entry: findFunctionEntry(row.callerPc).entry,
      callPc: row.callerPc,
      relation: `literal ${row.kind} ${hex(row.callerPc)} -> 0x081670`,
    });
  }

  if (wrapperRoot !== null) {
    for (const row of mergedCallers(blocks, wrapperRoot)) {
      practicalLevel1.push({
        entry: findFunctionEntry(row.callerPc).entry,
        callPc: row.callerPc,
        relation: `${row.kind} ${hex(row.callerPc)} -> ${hex(wrapperRoot)}`,
      });
    }
  }

  const dedupedPractical = [...new Map(
    practicalLevel1.map((row) => [row.entry, row]),
  ).values()].slice(0, 5);

  console.log('\n=== Practical level-1 callers for probe ===');
  for (const row of dedupedPractical) {
    const classification = classifyFunction(row.entry);
    console.log(
      [
        `${hex(row.entry)}  ${row.relation}`,
        `range=${classification.range}`,
        `putc=${classification.alsoCallsPutC ? 'yes' : 'no'}`,
        `banner=${classification.alsoCallsErrorBanner ? 'yes' : 'no'}`,
      ].join('  '),
    );
  }

  console.log('\n=== Second-level callers ===');
  for (const row of dedupedPractical) {
    const callers = mergedCallers(blocks, row.entry);
    if (callers.length === 0) {
      console.log(`${hex(row.entry)} <- [none]`);
      continue;
    }

    console.log(`${hex(row.entry)} <-`);
    for (const caller of callers) {
      const entryInfo = findFunctionEntry(caller.callerPc);
      console.log(
        `  ${hex(caller.callerPc)} ${caller.kind}  functionEntry=${hex(entryInfo.entry)}`,
      );
    }
  }

  const env = await buildProbeEnv(blocks);

  console.log('\n=== Probe results ===');
  for (const row of dedupedPractical) {
    const result = runProbe(env, row.entry);
    console.log(
      [
        `${hex(result.entry)}  verdict=${verdictForProbe(result)}`,
        `steps=${result.steps}`,
        `term=${result.termination}`,
        `lastPc=${hex(result.lastPc ?? 0)}`,
        `vram=${result.vramWrites}`,
        `bbox=${formatBbox(result.bbox)}`,
        `blocks=${result.uniqueBlocks}`,
      ].join('  '),
    );
  }
}

await main();
