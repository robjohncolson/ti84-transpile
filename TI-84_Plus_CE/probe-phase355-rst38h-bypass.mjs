#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

/**
 * Phase 355: test whether bypassing the RST 38h loop escape unlocks new boot territory.
 *
 * This checkout exposes createExecutor(...).runFrom(...) rather than cpu.step(),
 * so the requested hooks are implemented by wrapping the lifted block functions
 * for the vector entry and source block.
 */

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
const BOOT_MODE = 'z80';
const MAX_STEPS = 10000;
const MAX_LOOP_ITERATIONS = 50000;

const VECTOR_KEYS = ['000038:z80', '000038:adl'];
const SOURCE_BLOCK_KEYS = ['00d33b:z80', '00d33b:adl'];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function hexBytes(buffer, start, length) {
  if (start < 0 || start >= buffer.length) {
    return 'outside ROM';
  }

  const end = Math.min(buffer.length, start + Math.max(length, 0));
  return Array.from(buffer.subarray(start, end), (value) =>
    (value & 0xFF).toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function sortNumeric(values) {
  return [...values].sort((left, right) => left - right);
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

  return { mem, peripherals, executor, cpu };
}

function resolveSourceSkipSite(blocks, romBytes) {
  for (const key of SOURCE_BLOCK_KEYS) {
    const block = blocks[key];
    if (!block) {
      continue;
    }

    const rst = (block.instructions ?? []).find((instruction) =>
      instruction?.tag === 'rst' && ((instruction.target ?? -1) & 0xFF) === 0x38);

    if (!rst) {
      continue;
    }

    const mode = key.split(':')[1];
    const rstPc = rst.pc & 0xFFFFFF;
    const fallthroughPc = (rst.fallthrough ?? (rstPc + (rst.length ?? 1))) & 0xFFFFFF;
    const continuationBlockKey = blockKey(fallthroughPc, mode);

    return {
      key,
      mode,
      blockPc: Number.parseInt(key.slice(0, 6), 16) & 0xFFFFFF,
      rstPc,
      fallthroughPc,
      opcode: romBytes[rstPc] ?? null,
      continuationBlockKey,
      continuationCompiled: Boolean(blocks[continuationBlockKey]),
    };
  }

  return null;
}

function applySourceSkipLeadingState(cpu, site) {
  if (site.key === '00d33b:z80') {
    cpu.hl = 0x00FFFC;
    return;
  }

  if (site.key === '00d33b:adl') {
    cpu.hl = 0xFFFFFC;
    return;
  }

  throw new Error(`Unhandled source-skip block ${site.key}`);
}

function installHandlerBypassWrappers(executor, hits) {
  for (const key of VECTOR_KEYS) {
    if (typeof executor.compiledBlocks[key] !== 'function') {
      continue;
    }

    executor.compiledBlocks[key] = function rst38HandlerBypass(cpu) {
      const spBefore = cpu.sp & 0xFFFFFF;
      const retPc = cpu.popReturn() & 0xFFFFFF;

      hits.push({
        key,
        mode: key.split(':')[1],
        spBefore,
        spAfter: cpu.sp & 0xFFFFFF,
        retPc,
      });

      return retPc;
    };
  }
}

function installSourceSkipWrapper(executor, site, hits) {
  if (!site) {
    throw new Error('Unable to resolve the RST 38h source block near 0x00D33B.');
  }

  if (typeof executor.compiledBlocks[site.key] !== 'function') {
    throw new Error(`Compiled source block ${site.key} is missing.`);
  }

  executor.compiledBlocks[site.key] = function rst38SourceSkip(cpu) {
    applySourceSkipLeadingState(cpu, site);

    hits.push({
      key: site.key,
      mode: site.mode,
      blockPc: site.blockPc,
      rstPc: site.rstPc,
      fallthroughPc: site.fallthroughPc,
      sp: cpu.sp & 0xFFFFFF,
    });

    return site.fallthroughPc;
  };
}

function runScenario(label, hookType, blocks, romBytes, createExecutor, createPeripheralBus, sourceSkipSite) {
  const { executor } = createHarness(blocks, romBytes, createExecutor, createPeripheralBus);

  const handlerBypassHits = [];
  const sourceSkipHits = [];

  if (hookType === 'handler-bypass') {
    installHandlerBypassWrappers(executor, handlerBypassHits);
  } else if (hookType === 'source-skip') {
    installSourceSkipWrapper(executor, sourceSkipSite, sourceSkipHits);
  }

  const discoveredAddrs = new Set();
  const discoveredKeys = new Set();
  const missingBlocks = [];

  let highestPc = BOOT_ENTRY;
  let highestMode = BOOT_MODE;

  const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    wakeFromHalt: 'nmi',
    onBlock(pc, mode) {
      const addr = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';

      discoveredAddrs.add(addr);
      discoveredKeys.add(blockKey(addr, normalizedMode));

      if (addr > highestPc) {
        highestPc = addr;
        highestMode = normalizedMode;
      }
    },
    onMissingBlock(pc, mode, step) {
      const addr = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';

      discoveredAddrs.add(addr);
      discoveredKeys.add(blockKey(addr, normalizedMode));

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

  return {
    label,
    hookType,
    steps: run.steps,
    termination: run.termination,
    lastPc: (run.lastPc ?? highestPc) & 0xFFFFFF,
    lastMode: run.lastMode ?? highestMode,
    highestPc,
    highestMode,
    discoveredAddrSet: discoveredAddrs,
    discoveredAddrs: sortNumeric(discoveredAddrs),
    discoveredKeys: [...discoveredKeys].sort(),
    discoveredCount: discoveredAddrs.size,
    missingBlocks,
    handlerBypassHits,
    sourceSkipHits,
    errorText: run.error ? String(run.error.stack ?? run.error) : null,
  };
}

function compareWithBaseline(baseline, scenario) {
  const newAddrs = scenario.discoveredAddrs.filter((addr) => !baseline.discoveredAddrSet.has(addr));
  return {
    newAddrs,
    newCount: newAddrs.length,
  };
}

function printScenarioDetails(scenario, compare) {
  console.log(`\n${scenario.label}`);
  console.log('-'.repeat(scenario.label.length));
  console.log(`Termination:         ${scenario.termination}`);
  console.log(`Total steps:         ${scenario.steps.toLocaleString()}`);
  console.log(`Discovered blocks:   ${scenario.discoveredCount}`);
  console.log(`Highest PC:          ${hex(scenario.highestPc)}:${scenario.highestMode}`);
  console.log(`Last PC:             ${hex(scenario.lastPc)}:${scenario.lastMode}`);
  console.log(`Missing-block hits:  ${scenario.missingBlocks.length}`);

  if (scenario.errorText) {
    console.log(`Error:               ${scenario.errorText.split('\n')[0]}`);
  }

  if (scenario.handlerBypassHits.length > 0) {
    console.log(`RST 38h bypass hits: ${scenario.handlerBypassHits.length}`);
    for (const hit of scenario.handlerBypassHits.slice(0, 8)) {
      console.log(
        `  ${hit.key} ret=${hex(hit.retPc)} sp=${hex(hit.spBefore)} -> ${hex(hit.spAfter)}`,
      );
    }
    if (scenario.handlerBypassHits.length > 8) {
      console.log(`  ... ${scenario.handlerBypassHits.length - 8} more`);
    }
  }

  if (scenario.sourceSkipHits.length > 0) {
    console.log(`Source skip hits:    ${scenario.sourceSkipHits.length}`);
    for (const hit of scenario.sourceSkipHits.slice(0, 8)) {
      console.log(
        `  ${hit.key} rst=${hex(hit.rstPc)} fallthrough=${hex(hit.fallthroughPc)} sp=${hex(hit.sp)}`,
      );
    }
    if (scenario.sourceSkipHits.length > 8) {
      console.log(`  ... ${scenario.sourceSkipHits.length - 8} more`);
    }
  }

  if (scenario.missingBlocks.length > 0) {
    for (const miss of scenario.missingBlocks.slice(0, 8)) {
      console.log(
        `  missing step=${String(miss.step).padStart(5)} pc=${hex(miss.pc)}:${miss.mode}`,
      );
    }
    if (scenario.missingBlocks.length > 8) {
      console.log(`  ... ${scenario.missingBlocks.length - 8} more`);
    }
  }

  if (compare) {
    console.log(`New vs baseline:     ${compare.newCount}`);
  }
}

function printNewBlockHexDumps(title, addrs, romBytes) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));

  if (addrs.length === 0) {
    console.log('none');
    return;
  }

  for (const addr of addrs) {
    console.log(`${hex(addr)}  ${hexBytes(romBytes, addr, 8)}`);
  }
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS ??
    transpiledModule.default?.PRELIFTED_BLOCKS ??
    transpiledModule.default ??
    transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
  }

  const sourceSkipSite = resolveSourceSkipSite(PRELIFTED_BLOCKS, romBytes);
  if (!sourceSkipSite) {
    throw new Error('Unable to resolve the exact RST 38h instruction near 0x00D33B.');
  }

  const baseline = runScenario(
    'Baseline',
    'baseline',
    PRELIFTED_BLOCKS,
    romBytes,
    createExecutor,
    createPeripheralBus,
    sourceSkipSite,
  );
  const handlerBypass = runScenario(
    'NOP bypass',
    'handler-bypass',
    PRELIFTED_BLOCKS,
    romBytes,
    createExecutor,
    createPeripheralBus,
    sourceSkipSite,
  );
  const sourceSkip = runScenario(
    'Source skip',
    'source-skip',
    PRELIFTED_BLOCKS,
    romBytes,
    createExecutor,
    createPeripheralBus,
    sourceSkipSite,
  );

  const handlerCompare = compareWithBaseline(baseline, handlerBypass);
  const sourceCompare = compareWithBaseline(baseline, sourceSkip);

  console.log('Phase 355: RST 38h bypass probe');
  console.log('================================');
  console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
  console.log(`Step budget:         ${MAX_STEPS.toLocaleString()} block steps`);
  console.log(`Loop cap:            ${MAX_LOOP_ITERATIONS.toLocaleString()}`);
  console.log(`Peripheral config:   pllDelay=2, timerInterrupt=false`);
  console.log(`Runtime surface:     createExecutor(...).runFrom(...)`);
  console.log(
    `Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
  );
  console.log('');

  console.log('Hook Resolution');
  console.log('---------------');
  console.log(`Handler vector keys: ${VECTOR_KEYS.filter((key) => PRELIFTED_BLOCKS[key]).join(', ')}`);
  console.log(
    `Source skip site:    prompt cited ${hex(0x00D33B)}; lifted RST is ${hex(sourceSkipSite.rstPc)} inside ${sourceSkipSite.key}`,
  );
  console.log(`Opcode at source:    ${hex(sourceSkipSite.opcode, 2)}`);
  console.log(`Fallthrough target:  ${hex(sourceSkipSite.fallthroughPc)}:${sourceSkipSite.mode}`);
  console.log(
    `Continuation block:  ${sourceSkipSite.continuationCompiled ? sourceSkipSite.continuationBlockKey : `${sourceSkipSite.continuationBlockKey} (not lifted)`}`,
  );
  console.log('');

  console.log('Comparison Table');
  console.log('----------------');
  console.log('Scenario      Blocks  Highest PC     NEW vs baseline');
  console.log(
    `${baseline.label.padEnd(13)} ${String(baseline.discoveredCount).padStart(6)}  ${`${hex(baseline.highestPc)}:${baseline.highestMode}`.padEnd(14)} -`,
  );
  console.log(
    `${handlerBypass.label.padEnd(13)} ${String(handlerBypass.discoveredCount).padStart(6)}  ${`${hex(handlerBypass.highestPc)}:${handlerBypass.highestMode}`.padEnd(14)} ${handlerCompare.newCount}`,
  );
  console.log(
    `${sourceSkip.label.padEnd(13)} ${String(sourceSkip.discoveredCount).padStart(6)}  ${`${hex(sourceSkip.highestPc)}:${sourceSkip.highestMode}`.padEnd(14)} ${sourceCompare.newCount}`,
  );

  printScenarioDetails(baseline, null);
  printScenarioDetails(handlerBypass, handlerCompare);
  printScenarioDetails(sourceSkip, sourceCompare);

  printNewBlockHexDumps('NOP bypass new blocks (ROM bytes)', handlerCompare.newAddrs, romBytes);
  printNewBlockHexDumps('Source skip new blocks (ROM bytes)', sourceCompare.newAddrs, romBytes);

  console.log('\n--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
