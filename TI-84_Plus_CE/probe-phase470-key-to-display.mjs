import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  createCPU,
  createMemory,
  executeBlock,
  loadROM,
} from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const MAX_BOOT_STEPS_PER_STAGE = 10_000;
const MAX_KEY_STEPS = 5_000_000;
const LOOP_REPEAT_LIMIT = 1_024;

const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const SCREEN_WIDTH = 320;
const BYTES_PER_PIXEL = 2;
const BYTES_PER_ROW = SCREEN_WIDTH * BYTES_PER_PIXEL;
const STATUS_BAR_ROWS = 24;

const KEY_WAIT_LOOP = 0x030052;
const KEY_PROCESSOR = 0x03FA09;
const MAIN_HANDLER = 0x02FDD8;
const PORT_LCD_SETUP = 0x030078;
const DISPLAY_OUTPUT = 0x0059C6;
const KEY_SETUP_REENTRY = 0x03002E;
const KEY_SCAN_CODE = 0xD00587;
const KEY_READY_FLAGS = 0xD00080;
const KEY_BUFFER = 0xD141B5;
const CURSOR_DISPLAY_STATE = 0xD00591;

const HIT_TARGETS = new Map([
  [KEY_WAIT_LOOP, 'keyWaitLoop_030052'],
  [KEY_PROCESSOR, 'keyProcessor_03FA09'],
  [MAIN_HANDLER, 'mainHandler_02FDD8'],
  [PORT_LCD_SETUP, 'portLcdSetup_030078'],
  [DISPLAY_OUTPUT, 'displayOutput_0059C6'],
  [KEY_SETUP_REENTRY, 'keySetupReentry_03002E'],
]);

const WATCHED_WRITES = new Map([
  [KEY_BUFFER, 'keyBuffer_D141B5'],
  [CURSOR_DISPLAY_STATE, 'cursorDisplayState_D00591'],
]);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) return String(value);
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function moduleFileUrl(relativePath) {
  return new URL(relativePath, import.meta.url);
}

async function loadTranspiledBlocks() {
  const plainUrl = moduleFileUrl('./ROM.transpiled.js');
  const gzUrl = moduleFileUrl('./ROM.transpiled.js.gz');
  const plainPath = fileURLToPath(plainUrl);
  const gzPath = fileURLToPath(gzUrl);

  let moduleUrl = plainUrl;
  if (!existsSync(plainPath)) {
    if (!existsSync(gzPath)) {
      throw new Error('Could not find ROM.transpiled.js or ROM.transpiled.js.gz');
    }

    const source = gunzipSync(readFileSync(gzPath), { encoding: 'utf8' });
    const tempPath = path.join(tmpdir(), 'ti84-rom-transpiled-probe-phase470.mjs');
    writeFileSync(tempPath, source);
    moduleUrl = pathToFileURL(tempPath);
  }

  const mod = await import(`${moduleUrl.href}?probePhase470=${Date.now()}`);
  const candidates = [
    mod.blocks,
    mod.BLOCKS,
    mod.default?.blocks,
    mod.default?.BLOCKS,
    mod.default,
    mod,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }

  throw new Error('Transpiled ROM module did not expose a blocks object');
}

function createWatchedMemory(mem, writeLog, watchState) {
  const watched = new Set([...WATCHED_WRITES.keys()].map(String));

  return new Proxy(mem, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value) {
      const key = String(prop);
      const isWatched = watched.has(key);
      const before = isWatched ? target[prop] : undefined;
      const ok = Reflect.set(target, prop, value, target);

      if (isWatched) {
        const addr = Number(prop);
        writeLog.push({
          address: hex(addr),
          name: WATCHED_WRITES.get(addr),
          blockPc: hex(watchState.blockPc),
          totalStepsBeforeBlock: watchState.totalSteps,
          from: before,
          to: target[prop],
        });
      }

      return ok;
    },
  });
}

function makeHitCounts() {
  return Object.fromEntries([...HIT_TARGETS.values()].map((name) => [name, 0]));
}

function recordHit(hitCounts, pc) {
  const name = HIT_TARGETS.get(pc);
  if (name) hitCounts[name] += 1;
}

function runBlocks({
  cpu,
  mem,
  blocks,
  peripheralBus,
  startPC,
  maxSteps,
  hitCounts = null,
  watchState = null,
}) {
  let pc = startPC;
  let totalSteps = 0;
  let blocksExecuted = 0;
  let lastPC = null;
  let samePCRepeats = 0;
  let loopDetected = null;
  let lastTerm = null;
  let leftKeyWaitLoop = startPC !== KEY_WAIT_LOOP;
  let loopedBackToKeyWait = false;

  while (totalSteps < maxSteps) {
    if (!Number.isFinite(pc)) {
      loopDetected = {
        address: String(pc),
        reason: 'non-finite PC',
        repeats: samePCRepeats,
      };
      break;
    }

    if (pc === lastPC) {
      samePCRepeats += 1;
      if (samePCRepeats >= LOOP_REPEAT_LIMIT) {
        loopDetected = {
          address: hex(pc),
          reason: `same PC repeated ${LOOP_REPEAT_LIMIT} times`,
          repeats: samePCRepeats,
        };
        break;
      }
    } else {
      samePCRepeats = 0;
      lastPC = pc;
    }

    if (hitCounts) recordHit(hitCounts, pc);
    if (pc !== KEY_WAIT_LOOP) leftKeyWaitLoop = true;
    if (leftKeyWaitLoop && pc === KEY_WAIT_LOOP) loopedBackToKeyWait = true;
    if (watchState) {
      watchState.blockPc = pc;
      watchState.totalSteps = totalSteps;
    }

    const result = executeBlock(cpu, mem, blocks, peripheralBus, pc);
    const steps = Number(result?.steps ?? 1);
    totalSteps += steps > 0 ? steps : 1;
    blocksExecuted += 1;
    pc = result?.pc;
    lastTerm = result?.term ?? null;

    if (result?.term === 'stop' || result?.term === 'error') {
      break;
    }
  }

  return {
    pc,
    totalSteps,
    blocksExecuted,
    lastTerm,
    loopDetected,
    loopedBackToKeyWait,
  };
}

function classifyVramOffset(offset) {
  const row = Math.floor(offset / BYTES_PER_ROW);
  if (row < STATUS_BAR_ROWS) return 'statusBar';
  if (row < 240) return 'textArea';
  return 'outsideVisibleScreen';
}

function diffVram(before, after) {
  const firstChanges = [];
  const regions = {
    statusBar: 0,
    textArea: 0,
    outsideVisibleScreen: 0,
  };

  let changedBytes = 0;
  for (let offset = 0; offset < before.length; offset += 1) {
    if (before[offset] === after[offset]) continue;

    changedBytes += 1;
    const region = classifyVramOffset(offset);
    regions[region] += 1;

    if (firstChanges.length < 20) {
      const row = Math.floor(offset / BYTES_PER_ROW);
      const byteInRow = offset % BYTES_PER_ROW;
      const pixelX = Math.floor(byteInRow / BYTES_PER_PIXEL);

      firstChanges.push({
        offset,
        address: hex(VRAM_START + offset),
        before: before[offset],
        after: after[offset],
        row,
        pixelX,
        region,
      });
    }
  }

  return {
    changedBytes,
    first20ChangedBytePositions: firstChanges,
    regions,
    changedStatusBar: regions.statusBar > 0,
    changedTextArea: regions.textArea > 0,
  };
}

function printReport(report) {
  console.log('Phase 470 key-to-display probe');
  console.log('================================');
  console.log(JSON.stringify(report, null, 2));
}

const blocks = await loadTranspiledBlocks();
const cpu = createCPU();
const mem = createMemory();
const peripheralBus = createPeripheralBus({
  timerInterrupt: false,
  diHaltBypass: true,
});

loadROM(mem);

const bootStages = [];
let bootPC = 0x000000;
for (let stage = 1; stage <= 3; stage += 1) {
  const result = runBlocks({
    cpu,
    mem,
    blocks,
    peripheralBus,
    startPC: bootPC,
    maxSteps: MAX_BOOT_STEPS_PER_STAGE,
  });

  bootStages.push({
    stage,
    startPC: hex(bootPC),
    endPC: hex(result.pc),
    steps: result.totalSteps,
    blocksExecuted: result.blocksExecuted,
    lastTerm: result.lastTerm,
    loopDetected: result.loopDetected,
  });

  bootPC = result.pc;
  if (result.loopDetected || result.lastTerm === 'error') break;
}

const vramBefore = new Uint8Array(mem.slice(VRAM_START, VRAM_END));

mem[KEY_SCAN_CODE] = 0x09;
mem[KEY_READY_FLAGS] |= 0x08;
cpu.iff1 = 1;

const hitCounts = makeHitCounts();
const watchedWriteLog = [];
const watchState = {
  blockPc: KEY_WAIT_LOOP,
  totalSteps: 0,
};
const watchedMem = createWatchedMemory(mem, watchedWriteLog, watchState);

cpu.pc = KEY_WAIT_LOOP;
const keyRun = runBlocks({
  cpu,
  mem: watchedMem,
  blocks,
  peripheralBus,
  startPC: KEY_WAIT_LOOP,
  maxSteps: MAX_KEY_STEPS,
  hitCounts,
  watchState,
});

const vramAfter = new Uint8Array(mem.slice(VRAM_START, VRAM_END));
const vramDiff = diffVram(vramBefore, vramAfter);

printReport({
  bootStages,
  injection: {
    keyScanCodeAddress: hex(KEY_SCAN_CODE),
    keyScanCodeValue: mem[KEY_SCAN_CODE],
    keyReadyFlagsAddress: hex(KEY_READY_FLAGS),
    keyReadyFlagsValue: mem[KEY_READY_FLAGS],
    iff1: cpu.iff1,
    timerInterrupt: false,
    diHaltBypass: true,
  },
  keyRun: {
    entryPC: hex(KEY_WAIT_LOOP),
    endPC: hex(keyRun.pc),
    requestedSteps: MAX_KEY_STEPS,
    executedSteps: keyRun.totalSteps,
    blocksExecuted: keyRun.blocksExecuted,
    lastTerm: keyRun.lastTerm,
    loopDetected: keyRun.loopDetected,
    loopedBackToKeyWait: keyRun.loopedBackToKeyWait,
  },
  hitCounts,
  watchedWrites: {
    keyBuffer_D141B5: watchedWriteLog.filter(
      (write) => write.name === 'keyBuffer_D141B5',
    ),
    cursorDisplayState_D00591: watchedWriteLog.filter(
      (write) => write.name === 'cursorDisplayState_D00591',
    ),
  },
  finalWatchedValues: {
    keyBuffer_D141B5: mem[KEY_BUFFER],
    cursorDisplayState_D00591: mem[CURSOR_DISPLAY_STATE],
  },
  vramDiff,
});
