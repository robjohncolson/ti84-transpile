#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const TARGET_ADDR = 0xD007E0;
const RETURN_SENTINEL = 0x7FFFFE;
const IY_BASE = 0xD00080;
const IX_BASE = 0xD1A860;
const STACK_TOP = 0xD1A860;

const STATIC_WINDOW_BEFORE = 16;
const STATIC_WINDOW_AFTER = 8;
const MAX_DYNAMIC_CASES = 5;
const DEFAULT_DYNAMIC_STEPS = 120;
const DEFAULT_LOOP_LIMIT = 256;

const SEEDED_REGISTERS = Object.freeze({
  a: 0xA5,
  bc: 0x112233,
  de: 0x445566,
  hl: 0x778899,
  sp: STACK_TOP,
});

const ED_STORE_REGS = new Map([
  [0x43, 'BC'],
  [0x53, 'DE'],
  [0x63, 'HL'],
  [0x73, 'SP'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24LE(bytes, offset) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function hexBytes(bytes, start, endExclusive) {
  const parts = [];
  for (let index = start; index < endExclusive; index += 1) {
    parts.push(hexByte(bytes[index] ?? 0));
  }
  return parts.join(' ');
}

function classifyRegion(address) {
  if (address >= 0x090000 && address < 0x0A0000) {
    return { key: 'stat', label: '0x09xxxx STAT region' };
  }
  if (address >= 0x040000 && address < 0x050000) {
    return { key: 'os-core', label: '0x04xxxx OS core' };
  }
  if (address >= 0x050000 && address < 0x060000) {
    return { key: 'editor', label: '0x05xxxx editor' };
  }
  if (address >= 0x060000 && address < 0x070000) {
    return { key: 'graph', label: '0x06xxxx graph' };
  }
  if (address >= 0x080000 && address < 0x090000) {
    return { key: 'display', label: '0x08xxxx display' };
  }
  return { key: 'other', label: 'other' };
}

function makeSiteRecord(romBytes, address, length, kind, mnemonic, meta = {}) {
  const beforeStart = Math.max(0, address - STATIC_WINDOW_BEFORE);
  const afterEnd = Math.min(romBytes.length, address + length + STATIC_WINDOW_AFTER);
  const region = classifyRegion(address);

  return {
    address,
    length,
    kind,
    mnemonic,
    regionKey: region.key,
    regionLabel: region.label,
    pattern: hexBytes(romBytes, address, address + length),
    beforeBytes: hexBytes(romBytes, beforeStart, address),
    afterBytes: hexBytes(romBytes, address + length, afterEnd),
    ...meta,
  };
}

function scanWriteSites(romBytes) {
  const sites = [];

  for (let offset = 0; offset <= romBytes.length - 4; offset += 1) {
    if (
      romBytes[offset] === 0x32 &&
      romBytes[offset + 1] === 0xE0 &&
      romBytes[offset + 2] === 0x07 &&
      romBytes[offset + 3] === 0xD0
    ) {
      sites.push(
        makeSiteRecord(
          romBytes,
          offset,
          4,
          'ld-mem-a',
          'LD (0xD007E0),A',
          {
            storeSource: 'A',
            storeWidth: 1,
          },
        ),
      );
    }
  }

  for (let offset = 0; offset <= romBytes.length - 5; offset += 1) {
    if (
      romBytes[offset] !== 0xED ||
      romBytes[offset + 2] !== 0xE0 ||
      romBytes[offset + 3] !== 0x07 ||
      romBytes[offset + 4] !== 0xD0
    ) {
      continue;
    }

    const opcode = romBytes[offset + 1];
    const registerName = ED_STORE_REGS.get(opcode) ?? `ED ${hexByte(opcode)}`;
    const mnemonic = ED_STORE_REGS.has(opcode)
      ? `LD (0xD007E0),${registerName}`
      : `ED ${hexByte(opcode)} with addr 0xD007E0`;

    sites.push(
      makeSiteRecord(
        romBytes,
        offset,
        5,
        ED_STORE_REGS.has(opcode) ? 'ed-store' : 'ed-pattern',
        mnemonic,
        {
          opcode,
          storeSource: ED_STORE_REGS.get(opcode) ?? 'unknown',
          storeWidth: ED_STORE_REGS.has(opcode) ? 3 : 0,
        },
      ),
    );
  }

  sites.sort((left, right) => left.address - right.address || left.length - right.length);
  return sites;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return;
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(`Missing ${TRANSPILED_JS_PATH} and ${TRANSPILED_GZ_PATH}`);
  }

  try {
    execSync(`gunzip -kf "${TRANSPILED_GZ_PATH}"`, { stdio: 'ignore' });
  } catch {
    fs.writeFileSync(TRANSPILED_JS_PATH, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  ensureTranspiledModule();
  const moduleUrl = pathToFileURL(TRANSPILED_JS_PATH).href;
  const romModule = await import(moduleUrl);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS ??
    romModule.default?.PRELIFTED_BLOCKS ??
    romModule.default ??
    romModule,
  );

  if (!Object.keys(blocks).length) {
    throw new Error('Unable to resolve transpiled blocks from ROM.transpiled.js');
  }

  return blocks;
}

function parseBlockKey(key) {
  const [pcText, modeText] = String(key).split(':');
  return {
    startPc: Number.parseInt(pcText, 16) >>> 0,
    mode: modeText || 'adl',
  };
}

function chooseBetterSiteHint(currentHint, nextHint) {
  if (!currentHint) {
    return nextHint;
  }
  if (nextHint.exactEntry && !currentHint.exactEntry) {
    return nextHint;
  }
  if (nextHint.mode === 'adl' && currentHint.mode !== 'adl') {
    return nextHint;
  }
  if (nextHint.blockStart < currentHint.blockStart) {
    return nextHint;
  }
  return currentHint;
}

function buildBlockIndex(blocks) {
  const exactStarts = new Set();
  const siteHints = new Map();

  for (const [key, block] of Object.entries(blocks)) {
    const parsed = parseBlockKey(key);
    const blockStart = block.startPc ?? parsed.startPc;
    const mode = block.mode ?? parsed.mode ?? 'adl';

    exactStarts.add(`${hex(blockStart).slice(2)}:${mode}`);

    for (const instruction of block.instructions ?? []) {
      if (typeof instruction?.pc !== 'number') {
        continue;
      }

      const instructionPc = instruction.pc >>> 0;
      const hint = {
        blockStart,
        mode,
        exactEntry: instructionPc === blockStart,
      };

      siteHints.set(
        instructionPc,
        chooseBetterSiteHint(siteHints.get(instructionPc), hint),
      );
    }
  }

  return {
    exactStarts,
    siteHints,
  };
}

function createRuntime(romBytes, blocks) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });

  return {
    memory,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function write24(memory, address, value) {
  memory[address] = value & 0xFF;
  memory[address + 1] = (value >>> 8) & 0xFF;
  memory[address + 2] = (value >>> 16) & 0xFF;
}

function seedCpu(cpu, memory) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.a = SEEDED_REGISTERS.a;
  cpu.bc = SEEDED_REGISTERS.bc;
  cpu.de = SEEDED_REGISTERS.de;
  cpu.hl = SEEDED_REGISTERS.hl;
  cpu.f = 0x40;
  cpu.sp = (SEEDED_REGISTERS.sp - 9) & 0xFFFFFF;
  memory.fill(0xFF, cpu.sp, cpu.sp + 9);
  write24(memory, cpu.sp, RETURN_SENTINEL);

  memory[TARGET_ADDR] = 0xCC;
  memory[TARGET_ADDR + 1] = 0xDD;
  memory[TARGET_ADDR + 2] = 0xEE;
}

function overlapsTarget(address, width) {
  const start = address & 0xFFFFFF;
  const end = start + width - 1;
  return start <= TARGET_ADDR && TARGET_ADDR <= end;
}

function extractTargetByte(address, width, rawValue) {
  const start = address & 0xFFFFFF;
  const offset = TARGET_ADDR - start;
  if (offset < 0 || offset >= width) {
    return null;
  }
  return (Number(rawValue) >>> (offset * 8)) & 0xFF;
}

function expectedSeedByte(site) {
  switch (site.storeSource) {
    case 'A':
      return SEEDED_REGISTERS.a & 0xFF;
    case 'BC':
      return SEEDED_REGISTERS.bc & 0xFF;
    case 'DE':
      return SEEDED_REGISTERS.de & 0xFF;
    case 'HL':
      return SEEDED_REGISTERS.hl & 0xFF;
    case 'SP':
      return SEEDED_REGISTERS.sp & 0xFF;
    default:
      return null;
  }
}

function installTargetTracer(cpu, memory) {
  const writes = [];
  const context = {
    step: 0,
    pc: null,
    mode: 'adl',
  };

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordWrite(address, width, rawValue, kind) {
    if (!overlapsTarget(address, width)) {
      return;
    }

    writes.push({
      step: context.step,
      pc: context.pc ?? (cpu._currentBlockPc ?? null),
      mode: context.mode,
      kind,
      startAddr: address & 0xFFFFFF,
      width,
      rawValue: Number(rawValue) >>> 0,
      targetValue: extractTargetByte(address, width, rawValue),
    });
  }

  cpu.write8 = (address, value) => {
    recordWrite(address, 1, value, 'write8');
    return originalWrite8(address, value);
  };

  cpu.write16 = (address, value) => {
    recordWrite(address, 2, value, 'write16');
    return originalWrite16(address, value);
  };

  cpu.write24 = (address, value) => {
    recordWrite(address, 3, value, 'write24');
    return originalWrite24(address, value);
  };

  return {
    writes,
    updateContext(nextContext) {
      Object.assign(context, nextContext);
    },
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function selectDynamicCandidates(sites, blockIndex) {
  return sites
    .filter((site) => site.regionKey !== 'stat')
    .map((site) => {
      const hint = blockIndex.siteHints.get(site.address) ?? null;
      return {
        ...site,
        blockHint: hint,
      };
    })
    .sort((left, right) => {
      const leftScore = Number(Boolean(left.blockHint?.exactEntry)) * 4
        + Number(Boolean(left.blockHint)) * 2
        + Number(left.kind === 'ld-mem-a');
      const rightScore = Number(Boolean(right.blockHint?.exactEntry)) * 4
        + Number(Boolean(right.blockHint)) * 2
        + Number(right.kind === 'ld-mem-a');

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return left.address - right.address;
    })
    .slice(0, MAX_DYNAMIC_CASES);
}

function formatWrites(writes) {
  if (!writes.length) {
    return '(none)';
  }

  return writes
    .map(
      (entry) =>
        `step=${entry.step} pc=${hex(entry.pc)} ${entry.kind} start=${hex(entry.startAddr)} width=${entry.width} target=${hexByte(entry.targetValue)} raw=${hex(entry.rawValue)}`,
    )
    .join(' | ');
}

function runDynamicCase(site, romBytes, blocks) {
  const runtime = createRuntime(romBytes, blocks);
  const { memory, executor, cpu } = runtime;
  seedCpu(cpu, memory);

  const tracer = installTargetTracer(cpu, memory);
  const uniqueBlocks = [];
  const seenBlocks = new Set();
  const lastPcs = [];

  const entryPc = site.blockHint?.exactEntry ? site.address : (site.blockHint?.blockStart ?? site.address);
  const entryMode = site.blockHint?.mode ?? 'adl';
  const entryKind = site.blockHint?.exactEntry
    ? 'exact transpiled block at site'
    : site.blockHint
      ? 'containing transpiled block start'
      : 'no transpiled hint; exact PC requested';

  let steps = 0;
  let finalPc = entryPc;
  let finalMode = entryMode;
  let termination = 'step_limit';
  let errorMessage = null;

  const STOP_TOKEN = '__PHASE265_DYNAMIC_STOP__';

  function noteVisit(pc, mode, step) {
    const normalizedPc = pc & 0xFFFFFF;
    const stepNumber = (step ?? 0) + 1;

    steps = Math.max(steps, stepNumber);
    finalPc = normalizedPc;
    finalMode = mode ?? finalMode;
    tracer.updateContext({
      step: stepNumber,
      pc: normalizedPc,
      mode: finalMode,
    });

    if (!seenBlocks.has(normalizedPc)) {
      seenBlocks.add(normalizedPc);
      uniqueBlocks.push(normalizedPc);
    }

    lastPcs.push(normalizedPc);
    if (lastPcs.length > 10) {
      lastPcs.shift();
    }

    if (normalizedPc === RETURN_SENTINEL) {
      const stopError = new Error(STOP_TOKEN);
      stopError.reason = 'return_sentinel';
      throw stopError;
    }
  }

  try {
    const result = executor.runFrom(entryPc, entryMode, {
      maxSteps: DEFAULT_DYNAMIC_STEPS,
      maxLoopIterations: DEFAULT_LOOP_LIMIT,
      onBlock(pc, mode, _meta, step) {
        noteVisit(pc, mode, step);
      },
      onMissingBlock(pc, mode, step) {
        noteVisit(pc, mode, step);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xFFFFFF;
    finalMode = result.lastMode ?? finalMode;
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === STOP_TOKEN) {
      termination = error.reason ?? 'return_sentinel';
    } else {
      termination = 'error';
      errorMessage = error?.stack ?? String(error);
    }
  } finally {
    tracer.restore();
  }

  return {
    site,
    entryPc,
    entryMode,
    entryKind,
    expectedTargetValue: expectedSeedByte(site),
    result: {
      termination,
      steps,
      finalPc,
      finalMode,
      finalTargetValue: memory[TARGET_ADDR] & 0xFF,
      uniqueBlockCount: uniqueBlocks.length,
      uniqueBlocks,
      lastPcs,
      writes: tracer.writes,
      errorMessage,
    },
  };
}

function printStaticSection(sites) {
  console.log('=== Phase 265: D007E0 write-site sweep ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Target byte: ${hex(TARGET_ADDR)}`);
  console.log('');

  const countsByRegion = new Map();
  for (const site of sites) {
    countsByRegion.set(site.regionLabel, (countsByRegion.get(site.regionLabel) ?? 0) + 1);
  }

  console.log(`Static matches: ${sites.length}`);
  for (const [regionLabel, count] of countsByRegion.entries()) {
    console.log(`  ${regionLabel}: ${count}`);
  }
  console.log('');

  for (const [index, site] of sites.entries()) {
    console.log(
      `[${String(index + 1).padStart(2, '0')}] ${hex(site.address)} ${site.mnemonic} (${site.regionLabel})`,
    );
    console.log(`  pattern: ${site.pattern}`);
    console.log(`  before : ${site.beforeBytes}`);
    console.log(`  after  : ${site.afterBytes}`);
  }
}

function printDynamicSection(dynamicCases) {
  console.log('');
  console.log('=== Dynamic smoke tests (non-STAT sites) ===');
  console.log(
    `Seeded registers: A=${hexByte(SEEDED_REGISTERS.a)} BC=${hex(SEEDED_REGISTERS.bc)} DE=${hex(SEEDED_REGISTERS.de)} HL=${hex(SEEDED_REGISTERS.hl)} SP=${hex(SEEDED_REGISTERS.sp)}`,
  );
  console.log(
    'These runs enter at the exact store PC when a transpiled block exists there; otherwise they fall back to the containing block start so the store can still be exercised.',
  );
  console.log('');

  if (!dynamicCases.length) {
    console.log('No non-STAT candidates were available for dynamic testing.');
    return;
  }

  for (const [index, dynamicCase] of dynamicCases.entries()) {
    const { site, entryPc, entryMode, entryKind, expectedTargetValue, result } = dynamicCase;

    console.log(
      `[${String(index + 1).padStart(2, '0')}] site=${hex(site.address)} ${site.mnemonic} (${site.regionLabel})`,
    );
    console.log(
      `  entry: requested=${hex(site.address)} actual=${hex(entryPc)} mode=${entryMode} source=${entryKind}`,
    );
    console.log(
      `  expected target byte from seeded source: ${expectedTargetValue === null ? 'n/a' : hexByte(expectedTargetValue)}`,
    );
    console.log(
      `  result: term=${result.termination} steps=${result.steps} finalPc=${hex(result.finalPc)} finalMode=${result.finalMode} D007E0=${hexByte(result.finalTargetValue)}`,
    );
    console.log(
      `  unique blocks: ${result.uniqueBlockCount} (${result.uniqueBlocks.slice(0, 8).map((pc) => hex(pc)).join(', ') || 'none'}${result.uniqueBlocks.length > 8 ? ', ...' : ''})`,
    );
    console.log(
      `  last PCs: ${result.lastPcs.map((pc) => hex(pc)).join(' -> ') || 'none'}`,
    );
    console.log(`  writes: ${formatWrites(result.writes)}`);
    if (result.errorMessage) {
      console.log(`  error: ${result.errorMessage}`);
    }
  }
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const sites = scanWriteSites(romBytes);
  printStaticSection(sites);

  const blocks = await loadBlocks();
  const blockIndex = buildBlockIndex(blocks);
  const dynamicCandidates = selectDynamicCandidates(sites, blockIndex);
  const dynamicCases = dynamicCandidates.map((site) => runDynamicCase(site, romBytes, blocks));
  printDynamicSection(dynamicCases);
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
