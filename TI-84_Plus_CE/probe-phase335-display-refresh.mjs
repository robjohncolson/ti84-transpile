#!/usr/bin/env node

/**
 * Phase 335: trace the display-refresh side of CoorMon (0x08BF22).
 *
 * What this probe does:
 *   1. Boots with the same staged boot pattern used by phase 334.
 *   2. Seeds a pending ENTER key so CoorMon runs its normal refresh side path.
 *   3. Runs 0x08BF22 for ~10K steps.
 *   4. Records every unique block reached.
 *   5. Attributes VRAM, LCD E300xx, and D17700-D17721 display-state accesses
 *      to the block that performed them.
 *   6. Groups the interesting display-adjacent blocks into the requested
 *      address clusters and prints an access-driven hypothesis for each one.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0xFFFFFF;

const KBD_SCANCODE = 0xD00587;
const KBD_HANDOFF = 0xD0058E;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

const EVENT_LOOP_ENTRY = 0x08BF22;
const EVENT_LOOP_MAX_STEPS = 10000;

const VRAM_RANGE = { lo: 0xD40000, hi: 0xD65800 };
const LCD_E300_RANGE = { lo: 0xE30000, hi: 0xE30400 };
const DISPLAY_RAM_RANGE = { lo: 0xD17700, hi: 0xD17722 };

const CLUSTER_SPECS = [
  {
    id: '0x0A32xx-0x0A33xx',
    label: '0x0A32xx-0x0A33xx cluster',
    lo: 0x0A3200,
    hi: 0x0A3400,
    hint: 'Earlier display-pipeline probes marked 0x0A3301 as the status-dots/status-bar stage',
  },
  {
    id: '0x08BExx',
    label: '0x08BExx cluster',
    lo: 0x08BE00,
    hi: 0x08BF00,
    hint: 'This is the inlined CoorMon body immediately around the 0x0A32F9 refresh call chain',
  },
  {
    id: '0x07BAxx',
    label: '0x07BAxx cluster',
    lo: 0x07BA00,
    hi: 0x07BB00,
    hint: 'This range only appears on the refresh-side sweep, so it behaves like a helper cluster',
  },
  {
    id: '0x05C5xx',
    label: '0x05C5xx cluster',
    lo: 0x05C500,
    hi: 0x05C600,
    hint: 'Earlier jump-table mapping labeled 0x05C52C..0x05C5B3 as key/token conversion helpers',
  },
  {
    id: '0x0A2Axx',
    label: '0x0A2Axx cluster',
    lo: 0x0A2A00,
    hi: 0x0A2B00,
    hint: 'Earlier jump-table mapping labeled 0x0A2A45/0x0A2A68 as GetTokLen/GetTokString helpers',
  },
];

const DISPLAY_FIELDS = [
  { addr: 0xD17700, size: 3, name: 'D17700-D17702 origin/base pointer' },
  { addr: 0xD1770A, size: 3, name: 'D1770A-D1770C text-buffer base' },
  { addr: 0xD1770D, size: 3, name: 'D1770D-D1770F working pointer' },
  { addr: 0xD17710, size: 3, name: 'D17710-D17712 source/fill pointer' },
  { addr: 0xD17713, size: 3, name: 'D17713-D17715 cursor X / column' },
  { addr: 0xD17716, size: 3, name: 'D17716-D17718 cursor Y / row' },
  { addr: 0xD17719, size: 1, name: 'D17719 span counter' },
  { addr: 0xD1771A, size: 3, name: 'D1771A-D1771C display-region pointer' },
  { addr: 0xD1771D, size: 1, name: 'D1771D display-mode / attribute byte' },
  { addr: 0xD1771E, size: 3, name: 'D1771E-D17720 secondary source pointer' },
  { addr: 0xD17721, size: 1, name: 'D17721 secondary fill / attribute byte' },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function write24(buffer, addr, value) {
  const base = addr & 0xFFFFFF;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function prepareDirectEntry(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function setPendingEnter(peripherals, mem) {
  const keyMatrix = peripherals.keyMatrix ?? peripherals.keyboard?.keyMatrix;

  if (!keyMatrix) {
    throw new Error('Peripheral bus did not expose a keyboard matrix.');
  }

  keyMatrix.fill(0xFF);
  keyMatrix[6] = 0x02;
  mem[KBD_HANDOFF] = 0x09;
  mem[KBD_SCANCODE] = 0x09;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function clusterForPc(pc) {
  return CLUSTER_SPECS.find((cluster) => pc >= cluster.lo && pc < cluster.hi) ?? null;
}

function makeRangeBucket() {
  return {
    ops: 0,
    bytes: 0,
    ranges: [],
  };
}

function mergeRange(ranges, start, end) {
  if (!(start < end)) {
    return;
  }

  let nextStart = start;
  let nextEnd = end;
  const merged = [];
  let inserted = false;

  for (const range of ranges) {
    if (range.end < nextStart) {
      merged.push(range);
      continue;
    }

    if (nextEnd < range.start) {
      if (!inserted) {
        merged.push({ start: nextStart, end: nextEnd });
        inserted = true;
      }
      merged.push(range);
      continue;
    }

    nextStart = Math.min(nextStart, range.start);
    nextEnd = Math.max(nextEnd, range.end);
  }

  if (!inserted) {
    merged.push({ start: nextStart, end: nextEnd });
  }

  ranges.length = 0;
  ranges.push(...merged);
}

function addToBucket(bucket, start, end) {
  if (!(start < end)) {
    return;
  }

  bucket.ops += 1;
  bucket.bytes += end - start;
  mergeRange(bucket.ranges, start, end);
}

function mergeBucket(target, source) {
  target.ops += source.ops;
  target.bytes += source.bytes;

  for (const range of source.ranges) {
    mergeRange(target.ranges, range.start, range.end);
  }
}

function makeBlockProfile(pc, mode) {
  return {
    key: blockKey(pc, mode),
    pc: pc >>> 0,
    mode,
    hits: 0,
    missing: false,
    vramReads: makeRangeBucket(),
    vramWrites: makeRangeBucket(),
    lcdReads: makeRangeBucket(),
    lcdWrites: makeRangeBucket(),
    displayReads: new Map(),
    displayWrites: new Map(),
  };
}

function noteFieldAccess(targetMap, fields) {
  for (const field of fields) {
    const current = targetMap.get(field.name) ?? {
      addr: field.addr,
      size: field.size,
      name: field.name,
      count: 0,
    };
    current.count += 1;
    targetMap.set(field.name, current);
  }
}

function mergeFieldMaps(target, source) {
  for (const [name, info] of source) {
    const current = target.get(name) ?? {
      addr: info.addr,
      size: info.size,
      name: info.name,
      count: 0,
    };
    current.count += info.count;
    target.set(name, current);
  }
}

function findDisplayFields(start, end) {
  const fields = [];
  const covered = new Set();

  for (const field of DISPLAY_FIELDS) {
    const fieldEnd = field.addr + field.size;
    const overlapStart = Math.max(start, field.addr);
    const overlapEnd = Math.min(end, fieldEnd);

    if (!(overlapStart < overlapEnd)) {
      continue;
    }

    fields.push(field);

    for (let addr = overlapStart; addr < overlapEnd; addr += 1) {
      covered.add(addr);
    }
  }

  const overlapStart = Math.max(start, DISPLAY_RAM_RANGE.lo);
  const overlapEnd = Math.min(end, DISPLAY_RAM_RANGE.hi);

  for (let addr = overlapStart; addr < overlapEnd; addr += 1) {
    if (covered.has(addr)) {
      continue;
    }
    fields.push({
      addr,
      size: 1,
      name: `${hex(addr)} raw byte`,
    });
  }

  return fields;
}

function formatRanges(ranges, limit = 6) {
  if (ranges.length === 0) {
    return 'none';
  }

  const shown = ranges
    .slice(0, limit)
    .map((range) => (
      range.end - range.start === 1
        ? hex(range.start)
        : `${hex(range.start)}-${hex(range.end - 1)}`
    ))
    .join(', ');

  if (ranges.length > limit) {
    return `${shown} (+${ranges.length - limit} more)`;
  }

  return shown;
}

function formatBucket(bucket) {
  if (bucket.ops === 0) {
    return 'none';
  }

  return `${bucket.ops} ops / ${bucket.bytes} bytes @ ${formatRanges(bucket.ranges)}`;
}

function formatFieldMap(fieldMap, limit = 8) {
  if (fieldMap.size === 0) {
    return 'none';
  }

  const ordered = [...fieldMap.values()].sort((a, b) => a.addr - b.addr || a.name.localeCompare(b.name));
  const shown = ordered
    .slice(0, limit)
    .map((field) => `${field.name} x${field.count}`)
    .join('; ');

  if (ordered.length > limit) {
    return `${shown}; +${ordered.length - limit} more`;
  }

  return shown;
}

function makeClusterAggregate() {
  return {
    uniqueBlocks: 0,
    totalHits: 0,
    vramReads: makeRangeBucket(),
    vramWrites: makeRangeBucket(),
    lcdReads: makeRangeBucket(),
    lcdWrites: makeRangeBucket(),
    displayReads: new Map(),
    displayWrites: new Map(),
  };
}

function aggregateClusterProfiles(profiles) {
  const aggregate = makeClusterAggregate();
  aggregate.uniqueBlocks = profiles.length;

  for (const profile of profiles) {
    aggregate.totalHits += profile.hits;
    mergeBucket(aggregate.vramReads, profile.vramReads);
    mergeBucket(aggregate.vramWrites, profile.vramWrites);
    mergeBucket(aggregate.lcdReads, profile.lcdReads);
    mergeBucket(aggregate.lcdWrites, profile.lcdWrites);
    mergeFieldMaps(aggregate.displayReads, profile.displayReads);
    mergeFieldMaps(aggregate.displayWrites, profile.displayWrites);
  }

  return aggregate;
}

function touchesE302Buffer(bucket) {
  return bucket.ranges.some((range) => range.start < 0xE30400 && range.end > 0xE30200);
}

function inferHypothesis(cluster, aggregate) {
  const hasVramRead = aggregate.vramReads.ops > 0;
  const hasVramWrite = aggregate.vramWrites.ops > 0;
  const hasLcdRead = aggregate.lcdReads.ops > 0;
  const hasLcdWrite = aggregate.lcdWrites.ops > 0;
  const hasDisplayReads = aggregate.displayReads.size > 0;
  const hasDisplayWrites = aggregate.displayWrites.size > 0;

  if (hasLcdRead || hasLcdWrite) {
    if (touchesE302Buffer(aggregate.lcdReads) || touchesE302Buffer(aggregate.lcdWrites)) {
      return `${cluster.hint}; it touches both the E300 control block and the E30200 staging buffer, so it looks like LCD DMA/SPI setup or transfer polling rather than pure software redraw.`;
    }

    return `${cluster.hint}; it touches E300 LCD registers directly, which fits an LCD command / DMA trigger / completion-poll path.`;
  }

  if (hasVramWrite && (hasDisplayReads || hasDisplayWrites)) {
    return `${cluster.hint}; it reads or updates D177 display-state variables and writes VRAM, which fits text/status/cursor redraw in the framebuffer rather than a panel flush.`;
  }

  if (hasVramWrite) {
    return `${cluster.hint}; it writes VRAM without any E300 traffic, which looks like framebuffer-side copy/fill/draw work only.`;
  }

  if (hasVramRead && (hasDisplayReads || hasDisplayWrites)) {
    return `${cluster.hint}; it inspects both VRAM and D177 state, which looks like layout/span preparation instead of final panel I/O.`;
  }

  if (hasDisplayReads || hasDisplayWrites) {
    return `${cluster.hint}; it mainly manipulates D177 cursor/window/span state, so this looks like display bookkeeping.`;
  }

  if (cluster.id === '0x05C5xx') {
    return `${cluster.hint}; no VRAM, E300, or D177 traffic showed up here, which matches a key/token translation helper more than a display-refresh primitive.`;
  }

  if (cluster.id === '0x0A2Axx') {
    return `${cluster.hint}; no direct display-memory traffic showed up here, so this behaves more like token/string lookup on the redraw path than a renderer.`;
  }

  return `${cluster.hint}; no direct VRAM, E300, or D177 traffic showed up here, so this looks like control/dispatch glue around the refresh path.`;
}

function formatUniqueBlock(entry) {
  const suffix = entry.mode === 'adl' ? '' : `:${entry.mode}`;
  const missing = entry.missing ? '*' : '';
  return `${hex(entry.pc)}${suffix}${missing}`;
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

function createBootedEnvironment() {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  return { mem, peripherals, executor, cpu, boot, kernelInit };
}

function installTraceHooks(cpu, ensureProfile) {
  const originals = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function recordAccess(kind, addr, width) {
    const start = (addr >>> 0) & 0xFFFFFF;
    const end = Math.min(start + Math.max(1, width | 0), MEM_SIZE);
    const pc = cpu._currentBlockPc ?? cpu.pc ?? 0;
    const mode = cpu._currentBlockMode ?? (cpu.madl ? 'adl' : 'z80');
    const profile = ensureProfile(pc, mode);

    const vramStart = Math.max(start, VRAM_RANGE.lo);
    const vramEnd = Math.min(end, VRAM_RANGE.hi);
    if (vramStart < vramEnd) {
      addToBucket(kind === 'read' ? profile.vramReads : profile.vramWrites, vramStart, vramEnd);
    }

    const lcdStart = Math.max(start, LCD_E300_RANGE.lo);
    const lcdEnd = Math.min(end, LCD_E300_RANGE.hi);
    if (lcdStart < lcdEnd) {
      addToBucket(kind === 'read' ? profile.lcdReads : profile.lcdWrites, lcdStart, lcdEnd);
    }

    const displayStart = Math.max(start, DISPLAY_RAM_RANGE.lo);
    const displayEnd = Math.min(end, DISPLAY_RAM_RANGE.hi);
    if (displayStart < displayEnd) {
      noteFieldAccess(
        kind === 'read' ? profile.displayReads : profile.displayWrites,
        findDisplayFields(displayStart, displayEnd),
      );
    }
  }

  cpu.read8 = (addr) => {
    recordAccess('read', addr, 1);
    return originals.read8(addr);
  };

  cpu.read16 = (addr) => {
    recordAccess('read', addr, 2);
    return originals.read16(addr);
  };

  cpu.read24 = (addr) => {
    recordAccess('read', addr, 3);
    return originals.read24(addr);
  };

  cpu.write8 = (addr, value) => {
    recordAccess('write', addr, 1);
    return originals.write8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordAccess('write', addr, 2);
    return originals.write16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordAccess('write', addr, 3);
    return originals.write24(addr, value);
  };
}

console.log('Phase 335: Display refresh path inside CoorMon (0x08BF22)');
console.log('=========================================================');

const env = createBootedEnvironment();
const { mem, peripherals, executor, cpu, boot, kernelInit } = env;

console.log(`boot:        steps=${boot.steps} termination=${boot.termination} lastPc=${hex(boot.lastPc)} mode=${boot.lastMode}`);
console.log(`kernel_init: steps=${kernelInit.steps} termination=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)} mode=${kernelInit.lastMode}`);

setPendingEnter(peripherals, mem);
prepareDirectEntry(cpu, mem);

const profiles = new Map();
const uniqueBlocks = [];
const seenBlocks = new Set();
const missingBlocks = [];

function ensureProfile(pc, mode) {
  const normalizedPc = pc & 0xFFFFFF;
  const key = blockKey(normalizedPc, mode);

  if (!profiles.has(key)) {
    profiles.set(key, makeBlockProfile(normalizedPc, mode));
  }

  return profiles.get(key);
}

function noteUniqueBlock(pc, mode, missing = false) {
  const normalizedPc = pc & 0xFFFFFF;
  const key = blockKey(normalizedPc, mode);
  const profile = ensureProfile(normalizedPc, mode);

  if (missing) {
    profile.missing = true;
  }

  if (!seenBlocks.has(key)) {
    seenBlocks.add(key);
    uniqueBlocks.push({
      pc: normalizedPc,
      mode,
      missing,
    });
  }
}

installTraceHooks(cpu, ensureProfile);

const result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
  maxSteps: EVENT_LOOP_MAX_STEPS,
  maxLoopIterations: EVENT_LOOP_MAX_STEPS,
  onBlock(pc, mode) {
    cpu._currentBlockMode = mode;
    const profile = ensureProfile(pc, mode);
    profile.hits += 1;
    noteUniqueBlock(pc, mode, false);
  },
  onMissingBlock(pc, mode) {
    noteUniqueBlock(pc, mode, true);
    missingBlocks.push({ pc: pc & 0xFFFFFF, mode });
  },
});

console.log(`\nRun: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode} loopsForced=${result.loopsForced ?? 0}`);
console.log(`Unique blocks: ${uniqueBlocks.length}`);
console.log(`Missing blocks: ${missingBlocks.length}`);

if (missingBlocks.length > 0) {
  console.log(`Missing block list: ${[...new Set(missingBlocks.map((entry) => formatUniqueBlock({ ...entry, missing: true })))].join(', ')}`);
}

console.log('\nAll unique blocks visited (missing blocks marked with *):');
for (let index = 0; index < uniqueBlocks.length; index += 8) {
  const row = uniqueBlocks
    .slice(index, index + 8)
    .map((entry) => formatUniqueBlock(entry))
    .join(' ');
  console.log(`  ${row}`);
}

console.log('\nCluster analysis:');
for (const cluster of CLUSTER_SPECS) {
  const clusterProfiles = [...profiles.values()]
    .filter((profile) => profile.pc >= cluster.lo && profile.pc < cluster.hi)
    .sort((a, b) => a.pc - b.pc || a.mode.localeCompare(b.mode));
  const aggregate = aggregateClusterProfiles(clusterProfiles);
  const blockList = clusterProfiles.map((profile) => formatUniqueBlock(profile));

  console.log(`\n=== ${cluster.label} ===`);
  console.log(`Unique blocks visited: ${aggregate.uniqueBlocks}`);
  console.log(`Total visits: ${aggregate.totalHits}`);
  console.log(`Blocks: ${blockList.length > 0 ? blockList.join(', ') : 'none'}`);
  console.log(`VRAM reads: ${formatBucket(aggregate.vramReads)}`);
  console.log(`VRAM writes: ${formatBucket(aggregate.vramWrites)}`);
  console.log(`LCD E300 reads: ${formatBucket(aggregate.lcdReads)}`);
  console.log(`LCD E300 writes: ${formatBucket(aggregate.lcdWrites)}`);
  console.log(`Display vars read: ${formatFieldMap(aggregate.displayReads)}`);
  console.log(`Display vars written: ${formatFieldMap(aggregate.displayWrites)}`);
  console.log(`Hypothesis: ${inferHypothesis(cluster, aggregate)}`);

  if (clusterProfiles.length === 0) {
    continue;
  }

  console.log('Per-block detail:');
  for (const profile of clusterProfiles) {
    console.log(
      `  ${formatUniqueBlock(profile)} hits=${profile.hits} `
      + `VRAM[R:${formatBucket(profile.vramReads)} | W:${formatBucket(profile.vramWrites)}] `
      + `E300[R:${formatBucket(profile.lcdReads)} | W:${formatBucket(profile.lcdWrites)}] `
      + `D177[R:${formatFieldMap(profile.displayReads, 4)} | W:${formatFieldMap(profile.displayWrites, 4)}]`,
    );
  }
}

console.log('\nDone.');
