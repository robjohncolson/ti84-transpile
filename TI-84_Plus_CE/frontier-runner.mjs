#!/usr/bin/env node
/**
 * Autonomous Frontier Expansion Runner
 *
 * Automates the TI-84 CE ROM transpiler development cycle:
 *   run tests → find missing blocks → seed → retranspile → repeat
 *
 * Usage:
 *   node TI-84_Plus_CE/frontier-runner.mjs [--max-iterations 10] [--dry-run] [--no-commit] [--no-gz]
 */

import fs from 'fs';
import { execSync } from 'child_process';

// --- CLI args ---
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const param = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const MAX_ITER = parseInt(param('--max-iterations', '10'));
const DRY_RUN = flag('--dry-run');
const NO_COMMIT = flag('--no-commit');
const NO_GZ = flag('--no-gz');

const TRANSPILER = 'scripts/transpile-ti84-rom.mjs';
const HARNESS = 'TI-84_Plus_CE/test-harness.mjs';
const ROM_JS = 'TI-84_Plus_CE/ROM.transpiled.js';
const ROM_GZ = 'TI-84_Plus_CE/ROM.transpiled.js.gz';
const REPORT = 'TI-84_Plus_CE/ROM.transpiled.report.json';
const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;
const OS_RANGE_MAX = 0x100000;

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

// --- Step 1: Run tests, collect missing blocks ---
function runTestsAndCollectMissing() {
  log('Running test harness...');
  let output;
  try {
    output = execSync(`node ${HARNESS}`, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 600000,
    });
  } catch (e) {
    // Test harness may exit non-zero but still produce useful output
    output = e.stdout || '';
  }

  const addresses = new Set();

  // Pattern 1: missing=[0x00b608,0x00b610]
  for (const match of output.matchAll(/missing=\[([^\]]+)\]/g)) {
    for (const part of match[1].split(',')) {
      const hex = part.trim().match(/0x([0-9a-f]+)/i);
      if (hex) addresses.add(parseInt(hex[1], 16));
    }
  }

  // Pattern 2: MISSING: 0x00b608:adl
  for (const match of output.matchAll(/MISSING:\s*0x([0-9a-f]+)/gi)) {
    addresses.add(parseInt(match[1], 16));
  }

  // Pattern 3: lines like "    0x00b608:adl" in discovery summary
  for (const match of output.matchAll(/^\s+0x([0-9a-f]+):adl\s*$/gm)) {
    addresses.add(parseInt(match[1], 16));
  }

  // Filter to OS range, exclude 0x000000
  const osBlocks = [...addresses].filter(a => a > 0 && a < OS_RANGE_MAX).sort((a, b) => a - b);

  log(`Found ${addresses.size} total missing blocks, ${osBlocks.length} in OS range`);
  return osBlocks;
}

// --- Step 2: Inject seeds into transpiler ---
function injectSeeds(addresses) {
  const source = fs.readFileSync(TRANSPILER, 'utf8');

  // Find existing seeds
  const existing = new Set();
  for (const m of source.matchAll(/pc:\s*0x([0-9a-f]+)/gi)) {
    existing.add(parseInt(m[1], 16));
  }

  const newAddrs = addresses.filter(a => !existing.has(a));
  if (newAddrs.length === 0) {
    log('All missing blocks already seeded.');
    return 0;
  }

  // Find last seed line to insert after
  const lines = source.split('\n');
  let insertIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/\{\s*pc:\s*0x[0-9a-f]+,\s*mode:\s*'adl'\s*\}/i.test(lines[i])) {
      insertIdx = i;
      break;
    }
  }

  if (insertIdx === -1) {
    log('ERROR: Could not find seed array in transpiler');
    return 0;
  }

  const newLines = newAddrs.map(a =>
    `    { pc: 0x${a.toString(16).padStart(6, '0')}, mode: 'adl' },`
  );

  lines.splice(insertIdx + 1, 0, ...newLines);
  fs.writeFileSync(TRANSPILER, lines.join('\n'));

  log(`Injected ${newAddrs.length} new seeds: ${newAddrs.map(a => '0x' + a.toString(16)).join(', ')}`);
  return newAddrs.length;
}

// --- Step 3: Transpile ---
function transpile() {
  log('Starting transpiler (this takes 50+ minutes)...');
  const start = Date.now();
  execSync(`node ${TRANSPILER}`, {
    maxBuffer: 50 * 1024 * 1024,
    timeout: 7200000,
    stdio: 'inherit',
  });
  const mins = ((Date.now() - start) / 60000).toFixed(1);
  log(`Transpile completed in ${mins} minutes`);
}

// --- Step 4: Regenerate .gz ---
function regenerateGz() {
  try { fs.unlinkSync(ROM_GZ); } catch {}
  execSync(`gzip -k -9 ${ROM_JS}`);
  const mb = (fs.statSync(ROM_GZ).size / 1024 / 1024).toFixed(1);
  log(`Regenerated .gz: ${mb} MB`);
}

// --- Step 5: Check VRAM for LCD activity ---
function checkVRAM() {
  log('Checking VRAM for LCD activity...');
  try {
    const script = `
      const { createExecutor } = require('./TI-84_Plus_CE/cpu-runtime.js');
      const { createPeripheralBus } = require('./TI-84_Plus_CE/peripherals.js');
      const { PRELIFTED_BLOCKS } = require('./TI-84_Plus_CE/ROM.transpiled.js');
      const rom = require('fs').readFileSync('TI-84_Plus_CE/ROM.rom');
      const p = createPeripheralBus({ pllDelay: 2, timerMode: 'nmi', timerInterval: 50 });
      const mem = new Uint8Array(0x1000000);
      mem.set(rom);
      const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
      ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
      mem[0xD02AD7]=0xBE; mem[0xD02AD8]=0x19; mem[0xD02AD9]=0x00;
      mem[0xD0009B]|=0x40;
      for (let i = 0; i < 20; i++) {
        ex.cpu.halted = false; ex.cpu.iff1 = 1; ex.cpu.sp = 0xD1A87E;
        ex.cpu.sp -= 3; mem[ex.cpu.sp] = 0xFF; mem[ex.cpu.sp+1] = 0xFF; mem[ex.cpu.sp+2] = 0xFF;
        ex.runFrom(0x000038, 'adl', { maxSteps: 50000, maxLoopIterations: 200 });
      }
      let nz = 0;
      for (let i = ${VRAM_BASE}; i < ${VRAM_BASE + VRAM_SIZE}; i++) if (mem[i] !== 0) nz++;
      console.log(nz);
    `.replace(/\n/g, ' ');

    const result = execSync(`node -e "${script}"`, {
      encoding: 'utf8',
      timeout: 120000,
    });
    const nonZero = parseInt(result.trim());
    log(`VRAM non-zero bytes: ${nonZero}`);
    return nonZero > 0;
  } catch (e) {
    log(`VRAM check failed: ${e.message}`);
    return false;
  }
}

// --- Step 6: Commit ---
function commitChanges(iteration, seedCount, report) {
  execSync(`git add ${TRANSPILER} ${ROM_GZ} ${REPORT}`);
  const msg = `auto: frontier iteration ${iteration} — ${seedCount} seeds, ${report.blockCount} blocks, ${report.coveragePercent}% coverage`;
  execSync(`git commit -m "${msg}"`);
  log(`Committed: ${msg}`);
}

// --- Main loop ---
log('=== Autonomous Frontier Expansion Runner ===');
log(`Max iterations: ${MAX_ITER}, Dry run: ${DRY_RUN}, No commit: ${NO_COMMIT}`);

for (let i = 0; i < MAX_ITER; i++) {
  log(`\n--- Iteration ${i} ---`);

  // Step 1: Find missing blocks
  const missing = runTestsAndCollectMissing();
  if (missing.length === 0) {
    log('No missing blocks in OS range. Frontier saturated!');
    break;
  }

  // Step 2: Inject seeds
  const newSeeds = injectSeeds(missing);
  if (newSeeds === 0) {
    log('No new seeds to inject. Done.');
    break;
  }

  if (DRY_RUN) {
    log('Dry run — skipping transpile/commit.');
    continue;
  }

  // Step 3: Transpile
  transpile();

  // Step 4: Regenerate .gz
  if (!NO_GZ) regenerateGz();

  // Step 5: Read report
  let report = { blockCount: '?', coveragePercent: '?' };
  try {
    report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  } catch {}
  log(`Blocks: ${report.blockCount}, Coverage: ${report.coveragePercent}%`);

  // Step 6: Check VRAM
  const vramActive = checkVRAM();
  if (vramActive) {
    log('*** LCD ACTIVITY DETECTED! VRAM has non-zero bytes. ***');
    if (!NO_COMMIT) commitChanges(i, newSeeds, report);
    log('SUCCESS — LCD pixels written by OS.');
    break;
  }

  // Step 7: Commit
  if (!NO_COMMIT) commitChanges(i, newSeeds, report);

  log(`Iteration ${i} complete. Looping...`);
}

log('\n=== Frontier runner finished ===');
