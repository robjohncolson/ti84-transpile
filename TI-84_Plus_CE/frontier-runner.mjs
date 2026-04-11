#!/usr/bin/env node
/**
 * Autonomous Frontier Expansion Runner
 *
 * Automates the TI-84 CE ROM transpiler development cycle:
 *   run tests → find missing blocks → seed → retranspile → repeat
 *
 * Phase A (algorithmic): seed missing blocks → retranspile → repeat
 * Phase B (LLM-assisted): when seeds stall, escalate to Codex for investigation
 *
 * Usage:
 *   node TI-84_Plus_CE/frontier-runner.mjs [options]
 *
 * Options:
 *   --max-iterations N   Max loop iterations (default 10)
 *   --escalate           Enable Codex escalation when seed loop stalls
 *   --max-stalls N       Max stalls before giving up (default 3)
 *   --dry-run            Parse tests + show seeds, don't transpile
 *   --no-commit          Skip git commits
 *   --no-gz              Skip .gz regeneration
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
const ESCALATE = flag('--escalate');
const MAX_STALLS = parseInt(param('--max-stalls', '3'));

const TRANSPILER = 'scripts/transpile-ti84-rom.mjs';
const CROSS_AGENT = '../Agent/runner/cross-agent.py';
const WORKING_DIR = process.cwd();
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

// --- Step 7: Collect execution trace for investigation ---
function collectTrace() {
  log('Collecting execution trace for investigation...');
  const traceScript = `
    const { createExecutor } = require('./TI-84_Plus_CE/cpu-runtime.js');
    const { createPeripheralBus } = require('./TI-84_Plus_CE/peripherals.js');
    const { PRELIFTED_BLOCKS } = require('./TI-84_Plus_CE/ROM.transpiled.js');
    const rom = require('fs').readFileSync('TI-84_Plus_CE/ROM.rom');
    const p = createPeripheralBus({ pllDelay: 2, timerMode: 'nmi', timerInterval: 100 });
    const mem = new Uint8Array(0x1000000);
    mem.set(rom);
    const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
    const cpu = ex.cpu;
    const hex = (v,w) => '0x' + v.toString(16).padStart(w||6,'0');
    ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
    mem[0xD02AD7]=0xBE; mem[0xD02AD8]=0x19; mem[0xD02AD9]=0x00;
    mem[0xD0009B]|=0x40;
    cpu.halted=false; cpu.iff1=1; cpu.iff2=1; cpu.sp=0xD1A87E;
    cpu.sp-=3; mem[cpu.sp]=0xFF; mem[cpu.sp+1]=0xFF; mem[cpu.sp+2]=0xFF;
    const blocks=[];
    const missing=[];
    const ports=[];
    const r = ex.runFrom(0x000038, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 200,
      onBlock: (pc,mode,meta,step) => {
        const d = meta?.instructions?.[0]?.dasm || '?';
        blocks.push(hex(pc)+':'+mode+' A='+hex(cpu.a,2)+' '+d);
      },
      onMissingBlock: (pc,mode) => missing.push(hex(pc)+':'+mode),
    });
    const out = {
      steps: r.steps,
      termination: r.termination,
      lastPc: hex(r.lastPc),
      blocks: blocks,
      missing: missing,
      regs: { a:hex(cpu.a,2), f:hex(cpu.f,2), bc:hex(cpu.bc,4), de:hex(cpu.de,4),
              hl:hex(cpu.hl,4), sp:hex(cpu.sp), ix:hex(cpu._ix), iy:hex(cpu._iy),
              iff1:cpu.iff1, im:cpu.im },
    };
    console.log(JSON.stringify(out));
  `.replace(/\n/g, ' ');

  try {
    const result = execSync(`node -e "${traceScript}"`, {
      encoding: 'utf8',
      timeout: 120000,
    });
    return JSON.parse(result.trim());
  } catch (e) {
    log(`Trace collection failed: ${e.message}`);
    return null;
  }
}

// --- Step 8: Escalate to Claude Code for investigation ---
function escalateToClaude(trace, stallCount) {
  log(`Escalating to Claude Code (stall #${stallCount})...`);

  const traceStr = trace
    ? `Execution trace (${trace.steps} steps, ${trace.termination} at ${trace.lastPc}):\n` +
      trace.blocks.map(b => '  ' + b).join('\n') +
      (trace.missing.length > 0 ? '\nMissing blocks: ' + trace.missing.join(', ') : '') +
      '\nRegisters: ' + JSON.stringify(trace.regs)
    : 'Trace collection failed.';

  let report = {};
  try { report = JSON.parse(fs.readFileSync(REPORT, 'utf8')); } catch {}

  const prompt = [
    '# Autonomous Frontier Runner — Investigation Needed',
    '',
    '## Situation',
    'The seed discovery loop has stalled. No new missing blocks in OS range,',
    'but the OS event loop is not yet writing to LCD VRAM.',
    `Current coverage: ${report.blockCount || '?'} blocks, ${report.coveragePercent || '?'}%.`,
    `Stall count: ${stallCount}/${MAX_STALLS}`,
    '',
    '## Execution Trace',
    'ISR dispatch from 0x000038 with callback=0x0019BE, system flags set:',
    traceStr,
    '',
    '## What to Investigate',
    '1. Why does execution terminate at the last PC? Is it a wrong port value,',
    '   missing peripheral model, or incorrect flag/register state?',
    '2. Disassemble ROM bytes at the termination point to understand the code.',
    '3. Check if any port reads return unexpected values.',
    '4. Fix the root cause in peripherals.js, cpu-runtime.js, or the emitter.',
    '',
    '## Files You Can Modify',
    '- TI-84_Plus_CE/peripherals.js — add/fix peripheral handlers',
    '- TI-84_Plus_CE/cpu-runtime.js — fix MMIO intercepts or executor logic',
    '- scripts/transpile-ti84-rom.mjs — fix emitter code generation',
    '',
    '## Files for Context (read-only)',
    '- TI-84_Plus_CE/CONTINUATION_PROMPT_CODEX.md — full project history',
    '- TI-84_Plus_CE/PHASE25G_SPEC.md — current investigation findings',
    '- TI-84_Plus_CE/keyboard-matrix.md — keyboard mapping reference',
    '- TI-84_Plus_CE/AUTO_FRONTIER_SPEC.md — automation spec',
    '',
    '## Constraints',
    '- Run node --check on any file you modify',
    '- Do NOT run the transpiler (takes 50+ min)',
    '- Do NOT modify test-harness.mjs',
    '- Commit your changes when done',
  ].join('\n');

  // Write prompt to file to avoid shell quoting issues
  const promptFile = 'state/frontier-escalation-prompt.txt';
  fs.mkdirSync('state', { recursive: true });
  fs.writeFileSync(promptFile, prompt);

  try {
    const result = execSync(
      `python "${CROSS_AGENT}" ` +
      `--direction cc-to-codex ` +
      `--task-type investigate ` +
      `--prompt "$(cat ${promptFile})" ` +
      `--working-dir "${WORKING_DIR}" ` +
      `--owned-paths "TI-84_Plus_CE/peripherals.js" "TI-84_Plus_CE/cpu-runtime.js" "scripts/transpile-ti84-rom.mjs" ` +
      `--timeout 600`,
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 660000,
      }
    );

    let parsed;
    try { parsed = JSON.parse(result); } catch { parsed = { status: 'unknown' }; }

    log(`Claude Code returned: ${parsed.status || 'unknown'}`);
    if (parsed.result?.files_changed?.length > 0) {
      log(`Files changed: ${parsed.result.files_changed.join(', ')}`);
    }
    if (parsed.result?.summary) {
      log(`Summary: ${typeof parsed.result.summary === 'string' ? parsed.result.summary : JSON.stringify(parsed.result.summary)}`);
    }

    return parsed.status === 'completed';
  } catch (e) {
    log(`Escalation failed: ${e.message}`);
    return false;
  }
}

// --- Main loop ---
log('=== Autonomous Frontier Expansion Runner ===');
log(`Max iterations: ${MAX_ITER}, Dry run: ${DRY_RUN}, Escalate: ${ESCALATE}`);

let stallCount = 0;

for (let i = 0; i < MAX_ITER; i++) {
  log(`\n--- Iteration ${i} ---`);

  // Step 1: Find missing blocks
  const missing = runTestsAndCollectMissing();

  // Step 2: Try to inject seeds
  let newSeeds = 0;
  if (missing.length > 0) {
    newSeeds = injectSeeds(missing);
  }

  // Handle stall: no new seeds to inject
  if (newSeeds === 0) {
    stallCount++;
    log(`Stall detected (#${stallCount}/${MAX_STALLS}). No new seeds available.`);

    if (!ESCALATE) {
      log('Escalation disabled. Use --escalate to invoke Claude Code for investigation.');
      break;
    }

    if (stallCount > MAX_STALLS) {
      log(`Max stalls (${MAX_STALLS}) exceeded. Stopping.`);
      break;
    }

    // Collect trace and escalate to Claude Code
    const trace = collectTrace();
    const fixed = escalateToClaude(trace, stallCount);

    if (fixed) {
      log('Claude Code made changes. Checking if retranspile needed...');
      // Check if transpiler was modified
      const gitDiff = execSync(`git diff --name-only ${TRANSPILER}`, { encoding: 'utf8' });
      if (gitDiff.trim()) {
        log('Transpiler modified — retranspiling...');
        if (!DRY_RUN) {
          transpile();
          if (!NO_GZ) regenerateGz();
        }
      }
      // Re-run tests to see if the fix helped
      continue;
    }

    log('Claude Code could not resolve the stall. Stopping.');
    break;
  }

  // Reset stall counter on successful seed injection
  stallCount = 0;

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
