#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

/**
 * Phase 356: Trace NMI handler at 0x000066 + disassemble HALT context at 0x0019B5.
 *
 * After session 355, boot HALTs at 0x0019B5 (DI+HALT). NMI wake (PC->0x000066)
 * extends to 286 blocks then HALTs again. This probe traces every block the NMI
 * handler executes between the first and second HALT to understand what condition
 * would let boot skip the HALT and proceed to OS init.
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
const MAX_STEPS_BOOT = 50000;
const MAX_LOOP_ITERATIONS = 50000;
const MAX_STEPS_NMI = 500;
const NMI_WAKE_COUNT = 5;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexBytes(buffer, start, length) {
  if (start < 0 || start >= buffer.length) {
    return 'outside ROM';
  }
  const end = Math.min(buffer.length, start + Math.max(length, 0));
  return Array.from(buffer.subarray(start, end), (v) =>
    (v & 0xFF).toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
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

function snapshotRegs(cpu) {
  return {
    a: cpu.a,
    f: cpu.f,
    bc: cpu._bc,
    de: cpu._de,
    hl: cpu._hl,
    ix: cpu._ix,
    iy: cpu._iy,
    sp: cpu.sp,
    mbase: cpu.mbase,
    i: cpu.i,
    im: cpu.im,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    madl: cpu.madl,
    halted: cpu.halted,
  };
}

function printRegs(label, regs) {
  console.log(`  ${label}:`);
  console.log(`    A=${hex(regs.a, 2)} F=${hex(regs.f, 2)} BC=${hex(regs.bc)} DE=${hex(regs.de)} HL=${hex(regs.hl)}`);
  console.log(`    IX=${hex(regs.ix)} IY=${hex(regs.iy)} SP=${hex(regs.sp)} MBASE=${hex(regs.mbase, 2)}`);
  console.log(`    I=${hex(regs.i, 2)} IM=${regs.im} IFF1=${regs.iff1} IFF2=${regs.iff2} MADL=${regs.madl}`);
}

function hexDumpRegion(label, romBytes, start, length) {
  console.log(`\n${label}`);
  console.log('-'.repeat(label.length));
  for (let addr = start; addr < start + length; addr += 16) {
    const rowLen = Math.min(16, start + length - addr);
    const bytes = hexBytes(romBytes, addr, rowLen);
    // ASCII representation
    const ascii = Array.from(romBytes.subarray(addr, addr + rowLen), (b) =>
      b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'
    ).join('');
    console.log(`  ${hex(addr)}:  ${bytes.padEnd(48)}  ${ascii}`);
  }
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

  console.log('Phase 356: NMI Handler Trace + HALT Context Disassembly');
  console.log('========================================================');
  console.log(`Boot entry:        ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
  console.log(`Boot step budget:  ${MAX_STEPS_BOOT.toLocaleString()}`);
  console.log(`NMI step budget:   ${MAX_STEPS_NMI} per wake`);
  console.log(`NMI wake attempts: ${NMI_WAKE_COUNT}`);
  console.log(`Peripheral config: pllDelay=2, timerInterrupt=false`);
  console.log(`Transpiled ROM:    ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);

  // ---------------------------------------------------------------
  // Phase 1: Boot until first HALT
  // ---------------------------------------------------------------
  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0; // start in z80 mode

  const bootBlocks = new Set();
  let firstHaltPc = null;
  let firstHaltMode = null;

  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: MAX_STEPS_BOOT,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode) {
      bootBlocks.add(pc & 0xFFFFFF);
    },
  });

  firstHaltPc = (bootResult.lastPc ?? 0) & 0xFFFFFF;
  firstHaltMode = bootResult.lastMode ?? 'adl';

  console.log(`\n--- Phase 1: Boot until first HALT ---`);
  console.log(`Termination:       ${bootResult.termination}`);
  console.log(`Steps:             ${bootResult.steps.toLocaleString()}`);
  console.log(`Discovered blocks: ${bootBlocks.size}`);
  console.log(`HALT PC:           ${hex(firstHaltPc)}:${firstHaltMode}`);

  const haltRegs = snapshotRegs(cpu);
  printRegs('Registers at first HALT', haltRegs);

  // ---------------------------------------------------------------
  // Phase 2: Trigger NMI wakes and trace each one
  // ---------------------------------------------------------------
  console.log(`\n--- Phase 2: NMI Handler Trace ---`);

  // Track port reads/writes during NMI handler
  const portReads = [];
  const portWrites = [];
  const ramReads = [];
  const ramWrites = [];

  // Wrap I/O to capture port access
  const origIoRead = peripherals.read ? peripherals.read.bind(peripherals) : null;
  const origIoWrite = peripherals.write ? peripherals.write.bind(peripherals) : null;

  if (origIoRead) {
    const origRead = peripherals.read;
    peripherals.read = function(port) {
      portReads.push({ port: port & 0xFFFF, val: origRead.call(peripherals, port) });
      return portReads[portReads.length - 1].val;
    };
  }
  if (origIoWrite) {
    const origWrite = peripherals.write;
    peripherals.write = function(port, val) {
      portWrites.push({ port: port & 0xFFFF, val: val & 0xFF });
      return origWrite.call(peripherals, port, val);
    };
  }

  for (let nmiIdx = 0; nmiIdx < NMI_WAKE_COUNT; nmiIdx++) {
    // Clear tracking for this NMI wake
    portReads.length = 0;
    portWrites.length = 0;

    // Manually push return address and set PC to NMI vector
    const returnPc = (cpu.pc & 0xFFFFFF) + 1; // post-HALT PC
    cpu.halted = false;
    cpu.push(returnPc);
    const nmiStartPc = 0x000066;
    cpu.pc = nmiStartPc;

    // Determine mode: NMI handler likely runs in whatever mode we're in
    const nmiMode = cpu.madl ? 'adl' : 'z80';

    const nmiTrace = [];
    let nmiStepCount = 0;

    const nmiResult = executor.runFrom(nmiStartPc, nmiMode, {
      maxSteps: MAX_STEPS_NMI,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        nmiStepCount++;
        const regs = snapshotRegs(cpu);
        nmiTrace.push({
          step: nmiStepCount,
          pc: pc & 0xFFFFFF,
          mode: mode ?? 'adl',
          a: regs.a,
          f: regs.f,
          sp: regs.sp,
          bc: regs.bc,
          de: regs.de,
          hl: regs.hl,
          madl: regs.madl,
        });
      },
    });

    const nmiHaltPc = (nmiResult.lastPc ?? 0) & 0xFFFFFF;

    console.log(`\nNMI wake #${nmiIdx + 1}:`);
    console.log(`  Return PC pushed:  ${hex(returnPc)}`);
    console.log(`  NMI entry:         ${hex(nmiStartPc)}:${nmiMode}`);
    console.log(`  Termination:       ${nmiResult.termination}`);
    console.log(`  Steps:             ${nmiResult.steps}`);
    console.log(`  Blocks traced:     ${nmiTrace.length}`);
    console.log(`  HALT PC:           ${hex(nmiHaltPc)}:${nmiResult.lastMode ?? nmiMode}`);

    if (nmiTrace.length > 0) {
      console.log(`  Per-block trace:`);
      console.log(`  ${'Step'.padStart(4)}  ${'PC'.padEnd(10)}  ${'Mode'.padEnd(4)}  A     F     SP        BC        DE        HL`);
      for (const t of nmiTrace) {
        console.log(
          `  ${String(t.step).padStart(4)}  ${hex(t.pc).padEnd(10)}  ${t.mode.padEnd(4)}  ` +
          `${hex(t.a, 2)}  ${hex(t.f, 2)}  ${hex(t.sp)}  ${hex(t.bc)}  ${hex(t.de)}  ${hex(t.hl)}`
        );
      }
    }

    if (portReads.length > 0) {
      console.log(`  Port reads (${portReads.length}):`);
      for (const r of portReads) {
        console.log(`    IN port ${hex(r.port, 4)} -> ${hex(r.val, 2)}`);
      }
    }

    if (portWrites.length > 0) {
      console.log(`  Port writes (${portWrites.length}):`);
      for (const w of portWrites) {
        console.log(`    OUT port ${hex(w.port, 4)} <- ${hex(w.val, 2)}`);
      }
    }

    const regsAfter = snapshotRegs(cpu);
    printRegs(`Registers after NMI #${nmiIdx + 1}`, regsAfter);

    // Update cpu.pc for the next iteration (it's wherever HALT left us)
    cpu.pc = nmiHaltPc;
  }

  // ---------------------------------------------------------------
  // Phase 3: Hex dumps of key regions
  // ---------------------------------------------------------------
  hexDumpRegion(
    'HALT region (0x0019A0 - 0x001A00)',
    romBytes, 0x0019A0, 0x60
  );

  hexDumpRegion(
    'NMI vector region (0x000060 - 0x0000C0)',
    romBytes, 0x000060, 0x60
  );

  // Also dump the region right around the NMI handler entry
  hexDumpRegion(
    'Extended NMI region (0x000060 - 0x000100)',
    romBytes, 0x000060, 0xA0
  );

  // ---------------------------------------------------------------
  // Phase 4: Analysis
  // ---------------------------------------------------------------
  console.log('\n--- Analysis ---');

  // Check what's at the HALT location in ROM
  console.log(`\nBytes at first HALT PC ${hex(firstHaltPc)}:`);
  console.log(`  ${hexBytes(romBytes, firstHaltPc - 4, 12)}`);
  console.log(`  (4 bytes before, 8 bytes after)`);

  // Check the NMI vector
  console.log(`\nBytes at NMI vector 0x000066:`);
  console.log(`  ${hexBytes(romBytes, 0x000066, 16)}`);

  // Look at what blocks exist near the NMI handler
  const nmiBlockKeys = [];
  for (let addr = 0x000060; addr < 0x000100; addr++) {
    const adlKey = addr.toString(16).padStart(6, '0') + ':adl';
    const z80Key = addr.toString(16).padStart(6, '0') + ':z80';
    if (PRELIFTED_BLOCKS[adlKey]) nmiBlockKeys.push(adlKey);
    if (PRELIFTED_BLOCKS[z80Key]) nmiBlockKeys.push(z80Key);
  }
  console.log(`\nLifted blocks near NMI handler (0x60-0x100):`);
  for (const key of nmiBlockKeys) {
    console.log(`  ${key}`);
  }

  // Look at what blocks exist near the HALT
  const haltBlockKeys = [];
  for (let addr = 0x001990; addr < 0x001A10; addr++) {
    const adlKey = addr.toString(16).padStart(6, '0') + ':adl';
    const z80Key = addr.toString(16).padStart(6, '0') + ':z80';
    if (PRELIFTED_BLOCKS[adlKey]) haltBlockKeys.push(adlKey);
    if (PRELIFTED_BLOCKS[z80Key]) haltBlockKeys.push(z80Key);
  }
  console.log(`\nLifted blocks near HALT (0x1990-0x1A10):`);
  for (const key of haltBlockKeys) {
    console.log(`  ${key}`);
  }

  console.log('\n--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
