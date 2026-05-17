#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

/**
 * Phase 357: PLL bit 3 fix verification.
 *
 * The PLL handler (port 0x28) previously returned 0x04 when locked. The boot
 * code at 0x000DED tests BIT 3,A -- since 0x04 has bit 3 clear, boot always
 * jumped to HALT at 0x0019B5. With the fix (0x0C = bits 2+3), boot should
 * escape the HALT and reach new territory.
 *
 * This probe boots with NMI wake cycles (same as phase 356) so we reach
 * 0x000DED through the NMI handler path, then checks whether the BIT 3
 * test passes and boot escapes to 0x001EEB instead of HALT at 0x0019B5.
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
const NMI_VECTOR = 0x000066;
const MAX_STEPS = 100000;
const MAX_HALTS = 50;
const MAX_LOOP_ITERATIONS = 100000;
const ESCAPE_WINDOW_STEPS = 500;
const RESUME_SCAN_LIMIT = 64;

// Previous plateau from session 355/356
const OLD_BLOCK_COUNT = 286;

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
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
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

function buildBlockIndex(compiledBlocks) {
  const index = { adl: [], z80: [] };
  for (const key of Object.keys(compiledBlocks ?? {})) {
    const [pcText, mode = 'adl'] = key.split(':');
    const pc = Number.parseInt(pcText, 16);
    if (!Number.isInteger(pc) || !index[mode]) continue;
    index[mode].push(pc & 0xFFFFFF);
  }
  index.adl.sort((a, b) => a - b);
  index.z80.sort((a, b) => a - b);
  return index;
}

function findResumeTarget(compiledBlocks, blockIndex, pc, mode) {
  const normPc = pc & 0xFFFFFF;
  const normMode = mode ?? 'adl';
  for (let offset = 1; offset <= RESUME_SCAN_LIMIT; offset++) {
    const candidate = (normPc + offset) & 0xFFFFFF;
    if (compiledBlocks[blockKey(candidate, normMode)]) {
      return { pc: candidate, mode: normMode };
    }
  }
  for (const candidate of blockIndex[normMode] ?? []) {
    if (candidate > normPc) return { pc: candidate, mode: normMode };
  }
  return null;
}

function snapshotRegs(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: (cpu._bc ?? cpu.bc) & 0xFFFFFF,
    de: (cpu._de ?? cpu.de) & 0xFFFFFF,
    hl: (cpu._hl ?? cpu.hl) & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: (cpu._ix ?? cpu.ix) & 0xFFFFFF,
    iy: (cpu._iy ?? cpu.iy) & 0xFFFFFF,
    mbase: cpu.mbase,
    im: cpu.im,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    madl: cpu.madl,
    halted: cpu.halted,
  };
}

function formatRegs(r) {
  return `A=${hex(r.a, 2)} BC=${hex(r.bc)} DE=${hex(r.de)} HL=${hex(r.hl)} SP=${hex(r.sp)}`;
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regenerated = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const cpuMod = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const periMod = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const createExecutor = cpuMod.createExecutor ?? cpuMod.default?.createExecutor;
  const createPeripheralBus = periMod.createPeripheralBus ?? periMod.default?.createPeripheralBus;

  const transpiledMod = await import(pathToFileURL(TRANSPILED_PATH).href);
  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledMod.PRELIFTED_BLOCKS ??
    transpiledMod.default?.PRELIFTED_BLOCKS ??
    transpiledMod.default ??
    transpiledMod,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
  }

  console.log('Phase 357: PLL Bit 3 Fix Verification');
  console.log('======================================');
  console.log(`Boot entry:        ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
  console.log(`NMI wake vector:   ${hex(NMI_VECTOR)}:adl`);
  console.log(`Step budget:       ${MAX_STEPS.toLocaleString()}`);
  console.log(`HALT budget:       ${MAX_HALTS}`);
  console.log(`Peripheral config: pllDelay=2, timerInterrupt=false`);
  console.log(`Transpiled ROM:    ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Fix:               PLL port 0x28 locked value = 0x0C (bits 2+3 set)`);

  // Set up
  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  if ('adl' in cpu) cpu.adl = false;

  const compiledBlocks = executor.compiledBlocks ?? {};
  const blockIndex = buildBlockIndex(compiledBlocks);

  // Intercept I/O to track port 0x28 reads
  const port28Reads = [];
  const origRead = peripherals.read.bind(peripherals);
  peripherals.read = function (port) {
    const val = origRead(port);
    const p = port & 0xFFFF;
    if (p === 0x0028) {
      port28Reads.push({ val, bit2: (val >> 2) & 1, bit3: (val >> 3) & 1 });
    }
    return val;
  };

  // Tracking
  const uniqueBlocks = new Map();
  const haltRows = [];
  const missingBlocks = new Map();
  let totalSteps = 0;
  let haltCount = 0;
  let cycleNumber = 0;
  let escapedHaltLoop = false;
  let longestPostWakeRun = 0;
  let stopReason = null;

  // Key addresses
  let saw0x000DED = false;
  let saw0x001EEB = false;
  let saw0x0019B5 = false;
  let firstNewBlockAfterOldPlateau = null;

  while (totalSteps < MAX_STEPS && haltCount < MAX_HALTS) {
    cycleNumber++;
    const cycleStartPc = cpu.pc & 0xFFFFFF;
    const cycleStartMode = cpu.madl ? 'adl' : 'z80';
    const cycleNewBlocks = new Set();

    const run = executor.runFrom(cycleStartPc, cycleStartMode, {
      maxSteps: MAX_STEPS - totalSteps,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pcVal, mode) {
        const addr = pcVal & 0xFFFFFF;
        const m = mode ?? cycleStartMode;
        const key = blockKey(addr, m);

        cpu.pc = addr;
        cpu.madl = m === 'adl' ? 1 : 0;
        if ('adl' in cpu) cpu.adl = cpu.madl === 1;

        if (!uniqueBlocks.has(key)) {
          uniqueBlocks.set(key, { pc: addr, mode: m, step: totalSteps });
          cycleNewBlocks.add(key);
        }

        if (addr === 0x000DED) saw0x000DED = true;
        if (addr === 0x001EEB) saw0x001EEB = true;
        if (addr === 0x0019B5) saw0x0019B5 = true;
      },
      onMissingBlock(pcVal, mode) {
        const addr = pcVal & 0xFFFFFF;
        const m = mode ?? cycleStartMode;
        const key = blockKey(addr, m);
        if (!missingBlocks.has(key)) {
          missingBlocks.set(key, { pc: addr, mode: m, cycle: cycleNumber, step: totalSteps });
        }
      },
    });

    const segSteps = Math.max(0, Number(run.steps ?? 0));
    totalSteps += segSteps;

    const lastPc = (run.lastPc ?? cpu.pc ?? cycleStartPc) & 0xFFFFFF;
    const lastMode = run.lastMode ?? (cpu.madl ? 'adl' : cycleStartMode);
    cpu.pc = lastPc;
    cpu.madl = lastMode === 'adl' ? 1 : 0;
    if ('adl' in cpu) cpu.adl = cpu.madl === 1;

    if (cycleNumber > 1) {
      longestPostWakeRun = Math.max(longestPostWakeRun, segSteps);
      if (segSteps > ESCAPE_WINDOW_STEPS) {
        escapedHaltLoop = true;
      }
    }

    if (run.termination === 'halt') {
      haltCount++;
      haltRows.push({
        halt: haltCount,
        cycle: cycleNumber,
        step: totalSteps,
        blocksTotal: uniqueBlocks.size,
        newThisCycle: cycleNewBlocks.size,
        pc: lastPc,
        mode: lastMode,
        regs: snapshotRegs(cpu),
      });

      // NMI wake
      cpu.halted = false;
      cpu.pc = NMI_VECTOR;
      cpu.madl = 1;
      if ('adl' in cpu) cpu.adl = true;
      continue;
    }

    if (run.termination === 'missing_block') {
      const resume = findResumeTarget(compiledBlocks, blockIndex, lastPc, lastMode);
      if (!resume) {
        stopReason = 'missing_block_no_resume';
        break;
      }
      cpu.halted = false;
      cpu.pc = resume.pc;
      cpu.madl = resume.mode === 'adl' ? 1 : 0;
      if ('adl' in cpu) cpu.adl = cpu.madl === 1;
      continue;
    }

    stopReason = run.termination ?? 'unknown';
    break;
  }

  if (!stopReason) {
    if (totalSteps >= MAX_STEPS) stopReason = 'step_budget_exhausted';
    else if (haltCount >= MAX_HALTS) stopReason = 'halt_limit';
    else stopReason = 'completed';
  }

  if (haltCount === 0 && totalSteps > ESCAPE_WINDOW_STEPS) {
    escapedHaltLoop = true;
  }

  // ---------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------
  console.log(`\n--- HALT Table ---`);
  console.log('HALT#  step     blocks  new   PC');
  for (const h of haltRows) {
    console.log(
      `${String(h.halt).padStart(5)}  ${String(h.step).padStart(7)}  `
      + `${String(h.blocksTotal).padStart(6)}  ${String(h.newThisCycle).padStart(3)}   `
      + `${hex(h.pc)}:${h.mode}`
    );
  }

  console.log(`\n--- Key Addresses ---`);
  console.log(`0x000DED (PLL BIT 3 check):  ${saw0x000DED ? 'VISITED' : 'not visited'}`);
  console.log(`0x001EEB (escape path):      ${saw0x001EEB ? 'VISITED -- ESCAPE TAKEN!' : 'not visited'}`);
  console.log(`0x0019B5 (HALT trap):        ${saw0x0019B5 ? 'VISITED -- still hitting HALT' : 'NOT VISITED -- HALT avoided!'}`);

  console.log(`\n--- Port 0x28 Reads (${port28Reads.length} total) ---`);
  for (let i = 0; i < Math.min(port28Reads.length, 30); i++) {
    const r = port28Reads[i];
    console.log(`  #${i + 1}: value=${hex(r.val, 2)} bit2=${r.bit2} bit3=${r.bit3}`);
  }
  if (port28Reads.length > 30) {
    console.log(`  ... and ${port28Reads.length - 30} more`);
  }

  if (missingBlocks.size > 0) {
    console.log(`\n--- Missing Blocks (${missingBlocks.size}) ---`);
    const sorted = [...missingBlocks.values()].sort((a, b) => a.step - b.step);
    for (const m of sorted.slice(0, 40)) {
      console.log(`  step=${String(m.step).padStart(7)} cycle=${m.cycle} ${hex(m.pc)}:${m.mode}`);
    }
    if (sorted.length > 40) console.log(`  ... and ${sorted.length - 40} more`);
  }

  console.log(`\n--- Summary ---`);
  console.log(`Cycles executed:     ${cycleNumber}`);
  console.log(`Total steps:         ${totalSteps.toLocaleString()}`);
  console.log(`Total HALTs:         ${haltCount}`);
  console.log(`Unique blocks:       ${uniqueBlocks.size} (was ${OLD_BLOCK_COUNT})`);

  const delta = uniqueBlocks.size - OLD_BLOCK_COUNT;
  if (delta > 0) {
    console.log(`NEW BLOCKS:          +${delta} beyond old plateau!`);
  } else if (delta === 0) {
    console.log(`SAME:                No change vs old plateau.`);
  } else {
    console.log(`FEWER:               ${delta} blocks (may differ due to path changes).`);
  }

  console.log(`Escaped HALT loop:   ${escapedHaltLoop ? 'YES' : 'NO'} (longest post-wake: ${longestPostWakeRun} steps)`);
  console.log(`Stop reason:         ${stopReason}`);
  console.log(`Final PC:            ${hex(cpu.pc)}:${cpu.madl ? 'adl' : 'z80'}`);
  console.log(`Final registers:     ${formatRegs(snapshotRegs(cpu))}`);

  console.log('\n--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
