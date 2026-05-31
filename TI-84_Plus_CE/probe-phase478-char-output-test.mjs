#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;

const TRACKED_PCS = [0x0059C6, 0x005A75, 0x005A20, 0x005A02];

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(v, w = 2) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function keyLooksLikePc(key, pc) {
  if (typeof key === 'number') {
    return key === pc;
  }

  if (typeof key !== 'string') {
    return false;
  }

  const upper = key.toUpperCase();
  const padded = pc.toString(16).toUpperCase().padStart(6, '0');

  if (upper === padded || upper === `0X${padded}` || upper.includes(padded)) {
    return true;
  }

  const decimal = Number(upper);
  if (Number.isInteger(decimal) && decimal === pc) {
    return true;
  }

  for (const token of upper.match(/[0-9A-F]+/g) ?? []) {
    if (token.length > 0 && /[A-F]/.test(token) && parseInt(token, 16) === pc) {
      return true;
    }
  }

  return false;
}

function installPcHitCounters(blocks, trackedPcs) {
  const hits = new Map(trackedPcs.map((pc) => [pc, 0]));
  const installs = new Map(trackedPcs.map((pc) => [pc, 0]));
  const seen = new WeakSet();

  function pcForPath(pathParts) {
    return trackedPcs.find((pc) => pathParts.some((part) => keyLooksLikePc(part, pc)));
  }

  function wrapBlock(fn, pc) {
    return function trackedBlock(...args) {
      hits.set(pc, (hits.get(pc) ?? 0) + 1);
      return fn.apply(this, args);
    };
  }

  function visit(container, pathParts = []) {
    if (!container || (typeof container !== 'object' && typeof container !== 'function')) {
      return;
    }
    if (seen.has(container)) {
      return;
    }
    seen.add(container);

    if (container instanceof Map) {
      for (const [key, value] of container.entries()) {
        const nextPath = [...pathParts, key];
        const pc = pcForPath(nextPath);
        if (pc !== undefined && typeof value === 'function') {
          container.set(key, wrapBlock(value, pc));
          installs.set(pc, (installs.get(pc) ?? 0) + 1);
        } else {
          visit(value, nextPath);
        }
      }
      return;
    }

    for (const key of Reflect.ownKeys(container)) {
      const value = container[key];
      const nextPath = [...pathParts, key];
      const pc = pcForPath(nextPath);
      if (pc !== undefined && typeof value === 'function') {
        container[key] = wrapBlock(value, pc);
        installs.set(pc, (installs.get(pc) ?? 0) + 1);
      } else {
        visit(value, nextPath);
      }
    }
  }

  visit(blocks);
  return { hits, installs };
}

const pcTracker = installPcHitCounters(BLOCKS, TRACKED_PCS);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function read24(addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function snapshotVram() {
  return mem.slice(VRAM_START, VRAM_END);
}

function diffVram(before) {
  let count = 0;
  const firstChanges = [];

  for (let offset = 0; offset < before.length; offset++) {
    const after = mem[VRAM_START + offset];
    if (before[offset] !== after) {
      count++;
      if (firstChanges.length < 64) {
        firstChanges.push({
          address: VRAM_START + offset,
          before: before[offset],
          after,
        });
      }
    }
  }

  return { count, firstChanges };
}

function displayState() {
  return {
    d0059c: read24(0xD0059C),
    d00596: mem[0xD00596],
    d0058c: mem[0xD0058C],
    d0058e: mem[0xD0058E],
  };
}

function setupDisplayState() {
  mem[0xD0059C] = 0x00;
  mem[0xD0059D] = 0x00;
  mem[0xD0059E] = 0xD4;

  mem[0xD0058C] = 0x00;
  mem[0xD0058E] = 0x00;
  mem[0xD00596] = 0x00;
  mem[0xD0058B] = 0x70;

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
}

function resetPcHits() {
  for (const pc of TRACKED_PCS) {
    pcTracker.hits.set(pc, 0);
  }
}

function primeDirectCall(charCode) {
  cpu._a = (charCode & 0xFF) << 24;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;
  cpu.halted = false;
}

function runCharacter(label, charCode) {
  const before = snapshotVram();
  primeDirectCall(charCode);
  executor.runFrom(0x0059C6, 'adl', { maxSteps: 5000, maxLoopIterations: 100 });
  const diff = diffVram(before);
  const state = displayState();

  console.log('');
  console.log(`${label} (${hex(charCode)}):`);
  console.log(`  VRAM bytes changed: ${diff.count}`);
  console.log(`  D0059C: ${hex(state.d0059c, 6)}`);
  console.log(`  D00596: ${hex(state.d00596)}`);
  console.log('  First changed VRAM bytes:');
  if (diff.firstChanges.length === 0) {
    console.log('    (none)');
  } else {
    for (const change of diff.firstChanges) {
      console.log(`    ${hex(change.address, 6)}: ${hex(change.before)} -> ${hex(change.after)}`);
    }
  }

  return {
    label,
    charCode,
    vramBytesChanged: diff.count,
    firstChanges: diff.firstChanges,
    state,
  };
}

function pcHitSummary() {
  return Object.fromEntries(
    TRACKED_PCS.map((pc) => [
      hex(pc, 6),
      {
        hits: pcTracker.hits.get(pc) ?? 0,
        wrappersInstalled: pcTracker.installs.get(pc) ?? 0,
      },
    ]),
  );
}

console.log('Phase 478 character output probe');
console.log(`VRAM range: ${hex(VRAM_START, 6)}-${hex(VRAM_END - 1, 6)}`);
console.log('Tracked PCs:');
for (const [pcText, info] of Object.entries(pcHitSummary())) {
  console.log(`  ${pcText}: wrappers installed=${info.wrappersInstalled}`);
}

console.log('');
console.log('Boot stage 1: z80 reset');
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log('Boot stage 2: kernel init');
executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log('Boot stage 3: post-init');
executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

setupDisplayState();
resetPcHits();

console.log('');
console.log('Initial display state after setup:');
console.log(`  D0059C: ${hex(read24(0xD0059C), 6)}`);
console.log(`  D00596: ${hex(mem[0xD00596])}`);
console.log(`  D0058C: ${hex(mem[0xD0058C])}`);
console.log(`  D0058E: ${hex(mem[0xD0058E])}`);

const results = [
  runCharacter("Test 1 'H'", 0x48),
  runCharacter("Test 2 'I'", 0x49),
  runCharacter("Test 2 space", 0x20),
];

console.log('');
console.log('Tracked PC hit counts:');
const hits = pcHitSummary();
for (const [pcText, info] of Object.entries(hits)) {
  console.log(`  ${pcText}: ${info.hits}`);
}

console.log('');
console.log('Summary JSON:');
console.log(JSON.stringify({ results, trackedPcs: hits }, null, 2));
