#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const MAX_STEPS = 2000;
const MAX_LOOP_ITERATIONS = 50000;
const MIN_UNIQUE_BLOCKS = 200;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const VRAM_SAMPLE_LIMIT = 8;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function createHarness(blocks, romBytes, createExecutor, createPeripheralBus) {
  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.adl = false;

  return { mem, peripherals, executor, cpu };
}

function scanVram(mem) {
  const samples = [];
  const upperBound = Math.min(VRAM_END, mem.length);
  let nonZeroCount = 0;
  let firstNonZeroAddress = null;

  for (let address = VRAM_START; address < upperBound; address += 1) {
    const value = mem[address] ?? 0;
    if (value === 0) {
      continue;
    }

    nonZeroCount += 1;
    if (firstNonZeroAddress === null) {
      firstNonZeroAddress = address;
    }
    if (samples.length < VRAM_SAMPLE_LIMIT) {
      samples.push({ address, value });
    }
  }

  return {
    scannedBytes: upperBound - VRAM_START,
    nonZeroCount,
    firstNonZeroAddress,
    hasNonZero: nonZeroCount > 0,
    samples,
  };
}

function formatVramSamples(samples) {
  if (samples.length === 0) {
    return 'none';
  }

  return samples
    .map(({ address, value }) => `${hex(address)}=${hex(value, 2)}`)
    .join(', ');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const fallbackRomBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS ??
    transpiledModule.default?.PRELIFTED_BLOCKS ??
    transpiledModule.default ??
    transpiledModule,
  );
  const TRANSPILATION_META =
    transpiledModule.TRANSPILATION_META ??
    transpiledModule.default?.TRANSPILATION_META ??
    null;
  const decodeEmbeddedRom =
    transpiledModule.decodeEmbeddedRom ??
    transpiledModule.default?.decodeEmbeddedRom ??
    null;

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
  }

  const moduleShapeIssues = [];
  if (!TRANSPILATION_META || typeof TRANSPILATION_META.blockCount !== 'number') {
    moduleShapeIssues.push('TRANSPILATION_META.blockCount is missing.');
  }
  if (typeof decodeEmbeddedRom !== 'function') {
    moduleShapeIssues.push('decodeEmbeddedRom export is missing.');
  }

  const romBytes = typeof decodeEmbeddedRom === 'function'
    ? new Uint8Array(decodeEmbeddedRom())
    : fallbackRomBytes;
  const romSource = typeof decodeEmbeddedRom === 'function' ? 'decodeEmbeddedRom()' : 'ROM.rom fallback';

  const { mem, executor, cpu } = createHarness(
    PRELIFTED_BLOCKS,
    romBytes,
    createExecutor,
    createPeripheralBus,
  );

  const visitedBlocks = new Set();
  const missingBlocks = [];
  let highestPc = BOOT_ENTRY;
  let highestMode = cpu.adl ? 'adl' : 'z80';

  const run = executor.runFrom(cpu.pc, cpu.adl ? 'adl' : 'z80', {
    maxSteps: MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    wakeFromHalt: 'nmi',
    onBlock(pc, mode) {
      const addr = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      visitedBlocks.add(blockKey(addr, normalizedMode));

      if (addr > highestPc) {
        highestPc = addr;
        highestMode = normalizedMode;
      }
    },
    onMissingBlock(pc, mode, step) {
      const addr = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';

      if (addr > highestPc) {
        highestPc = addr;
        highestMode = normalizedMode;
      }

      missingBlocks.push({
        step,
        pc: addr,
        mode: normalizedMode,
      });
    },
  });

  const totalBlocks = Object.keys(PRELIFTED_BLOCKS).length;
  const metaBlockCount = Number.isFinite(TRANSPILATION_META?.blockCount)
    ? TRANSPILATION_META.blockCount
    : null;
  const uniqueBlockPass = visitedBlocks.size >= MIN_UNIQUE_BLOCKS;
  const vram = scanVram(mem);

  const issues = [...moduleShapeIssues];
  if (!uniqueBlockPass) {
    issues.push(
      `Boot visited only ${visitedBlocks.size.toLocaleString()} unique blocks in ${MAX_STEPS.toLocaleString()} steps.`,
    );
  }
  if (missingBlocks.length > 0) {
    const firstMissing = missingBlocks[0];
    issues.push(
      `Encountered ${missingBlocks.length} missing block(s); first at ${hex(firstMissing.pc)}:${firstMissing.mode} on step ${firstMissing.step}.`,
    );
  }

  const warnings = [];
  if (!vram.hasNonZero) {
    warnings.push('VRAM remained all-zero across 0xD40000-0xD65800 after 2,000 steps.');
  }

  console.log('Phase 356: Browser shell verification');
  console.log('=====================================');
  console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:z80`);
  console.log(`Step budget:         ${MAX_STEPS.toLocaleString()} block steps`);
  console.log(`Loop cap:            ${MAX_LOOP_ITERATIONS.toLocaleString()}`);
  console.log('Peripheral config:   pllDelay=2, timerInterrupt=false');
  console.log('Runtime surface:     createExecutor(...).runFrom(...)');
  console.log(
    `Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
  );
  console.log(`ROM source:          ${romSource}`);
  console.log(
    `Transpiled blocks:   ${totalBlocks.toLocaleString()}${metaBlockCount === null ? '' : ` (meta ${metaBlockCount.toLocaleString()})`}`,
  );
  console.log('');

  console.log('Results');
  console.log('-------');
  console.log(`Module shape:        ${moduleShapeIssues.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log('Blocks loaded:       PASS');
  console.log('Executor create:     PASS');
  console.log(`Termination:         ${run.termination}`);
  console.log(`Steps executed:      ${run.steps.toLocaleString()}`);
  console.log(`Blocks visited:      ${visitedBlocks.size.toLocaleString()}`);
  console.log(`Unique-block gate:   ${uniqueBlockPass ? 'PASS' : 'FAIL'} (>= ${MIN_UNIQUE_BLOCKS})`);
  console.log(`Highest PC:          ${hex(highestPc)}:${highestMode}`);
  console.log(`Last PC:             ${hex(run.lastPc)}:${run.lastMode ?? 'adl'}`);
  console.log(
    `Missing blocks:      ${missingBlocks.length === 0 ? 'none' : `${missingBlocks.length} (see Issues)`}`,
  );
  console.log(`VRAM non-zero:       ${vram.hasNonZero ? 'YES' : 'NO'}`);
  console.log(`VRAM bytes changed:  ${vram.nonZeroCount.toLocaleString()} / ${vram.scannedBytes.toLocaleString()}`);
  console.log(
    `VRAM first hit:      ${vram.firstNonZeroAddress === null ? 'none' : `${hex(vram.firstNonZeroAddress)}=${hex(mem[vram.firstNonZeroAddress], 2)}`}`,
  );
  console.log(`VRAM samples:        ${formatVramSamples(vram.samples)}`);

  if (issues.length > 0) {
    console.log('');
    console.log('Issues');
    console.log('------');
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
  }

  if (warnings.length > 0) {
    console.log('');
    console.log('Warnings');
    console.log('--------');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log('');
  console.log(`Overall: ${issues.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log('--- probe complete ---');

  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
