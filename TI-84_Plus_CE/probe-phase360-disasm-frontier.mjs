#!/usr/bin/env node

/**
 * Phase 360: Disassemble frontier addresses 0x00868E and 0x0088DD
 *
 * Session 359's RAM trampoline probe revealed that after bypassing the flash
 * self-test, boot terminates at missing_block for two ROM addresses:
 *   - 0x00868E:adl
 *   - 0x0088DD:adl
 *
 * This probe:
 *   1. Static disassembly: decode 64 bytes of eZ80 at each address
 *   2. Dynamic trace: boot with RAM trampoline, record 10 blocks before each hit
 *   3. Analysis: summarize instruction types, CALL/JP targets, port I/O
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

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
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 50000;
const MAX_LOOP_ITERATIONS = 50000;

const RAM_TRAMPOLINE_PC = 0xD18C22;
const RAM_THRESHOLD = 0xD00000;

const FRONTIER_ADDRESSES = [0x00868E, 0x0088DD];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

// ---------------------------------------------------------------------------
// Instruction formatter (same logic as phase202c-classify.mjs)
// ---------------------------------------------------------------------------
function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;
  const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);

  let text = t;
  switch (t) {
    case 'nop': text = 'nop'; break;
    case 'halt': text = 'halt'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'daa': text = 'daa'; break;
    case 'cpl': text = 'cpl'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'exx': text = 'exx'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'neg': text = 'neg'; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'rrd': text = 'rrd'; break;
    case 'rld': text = 'rld'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'ini': text = 'ini'; break;
    case 'outi': text = 'outi'; break;
    case 'ind': text = 'ind'; break;
    case 'outd': text = 'outd'; break;
    case 'inir': text = 'inir'; break;
    case 'otir': text = 'otir'; break;
    case 'indr': text = 'indr'; break;
    case 'otdr': text = 'otdr'; break;
    case 'otimr': text = 'otimr'; break;
    case 'slp': text = 'slp'; break;
    case 'stmix': text = 'stmix'; break;
    case 'rsmix': text = 'rsmix'; break;
    case 'ld-mb-a': text = 'ld mb, a'; break;
    case 'ld-a-mb': text = 'ld a, mb'; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'im': text = `im ${inst.value}`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem': text = `ld ${inst.pair}, (${hex(inst.addr)})`; break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ixd':
      text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'ld-ixd-reg':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
      break;
    case 'ld-ixd-imm':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
      break;
    case 'inc-ixd':
      text = `inc (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'dec-ixd':
      text = `dec (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ixd':
      text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'rst': text = `rst ${hexByte(inst.target)}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (hl)`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
    case 'indexed-cb-rotate':
      text = `${inst.operation} (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-bit':
      text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-res':
      text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-set':
      text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `out (c), ${inst.reg}`; break;
    case 'in-reg': text = `in ${inst.reg}, (c)`; break;
    case 'in0': text = `in0 ${inst.reg}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `tstio ${hexByte(inst.value)}`; break;
    case 'lea':
      text = `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`;
      break;
    default: break;
  }

  return prefix + text;
}

// ---------------------------------------------------------------------------
// Part 1: Static disassembly
// ---------------------------------------------------------------------------
function disassembleLinear(romBytes, startPc, maxBytes = 64) {
  const rows = [];
  let pc = startPc;
  const end = startPc + maxBytes;

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (v) => v.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      dasm: formatInstruction(inst),
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

function printDisassembly(label, rows) {
  console.log(`--- ${label} ---`);
  for (const row of rows) {
    const addr = hex(row.pc);
    const bytes = row.bytes.padEnd(20);
    console.log(`  ${addr}  ${bytes}  ${row.dasm}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Helpers for transpiled ROM loading
// ---------------------------------------------------------------------------
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

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

// ---------------------------------------------------------------------------
// Part 3: Analysis helpers
// ---------------------------------------------------------------------------
function analyzeDisassembly(rows) {
  const callTargets = [];
  const jpTargets = [];
  const portOps = [];
  const tags = new Set();

  for (const row of rows) {
    const inst = row.inst;
    tags.add(inst.tag);

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push(inst.target);
    }
    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      jpTargets.push(inst.target);
    }
    if (inst.tag === 'jp-indirect') {
      jpTargets.push(`(${inst.indirectRegister})`);
    }

    if (inst.tag === 'in-imm' || inst.tag === 'in-reg' || inst.tag === 'in0' ||
        inst.tag === 'out-imm' || inst.tag === 'out-reg' || inst.tag === 'out0') {
      portOps.push({ tag: inst.tag, port: inst.port, dasm: row.dasm });
    }
  }

  return { callTargets, jpTargets, portOps, tags: [...tags] };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  console.log('Phase 360: Disassemble Frontier Addresses 0x00868E and 0x0088DD');
  console.log('================================================================');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled: ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log('');

  // =========================================================================
  // PART 1: Static disassembly
  // =========================================================================
  console.log('=== PART 1: STATIC DISASSEMBLY (64 bytes, ADL mode) ===');
  console.log('');

  const disasmResults = {};
  for (const addr of FRONTIER_ADDRESSES) {
    const rows = disassembleLinear(romBytes, addr, 64);
    disasmResults[addr] = rows;
    printDisassembly(`Disassembly at ${hex(addr)}:adl`, rows);
  }

  // =========================================================================
  // PART 2: Dynamic trace — boot with RAM trampoline, capture call chains
  // =========================================================================
  console.log('=== PART 2: DYNAMIC TRACE (10 blocks before each frontier hit) ===');
  console.log('');

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

  // Inject RAM trampolines
  const trampolineTargets = new Set();

  function injectRamTrampoline(targetPc) {
    const key = blockKey(targetPc, 'adl');
    if (executor.compiledBlocks[key]) return;

    trampolineTargets.add(targetPc);
    executor.compiledBlocks[key] = (cpu) => {
      const sp = cpu.sp & 0xFFFFFF;
      const retAddr = cpu.mem[sp] | (cpu.mem[sp + 1] << 8) | (cpu.mem[sp + 2] << 16);
      cpu.sp = (sp + 3) & 0xFFFFFF;
      return retAddr;
    };
  }

  // Pre-inject the known RAM trampoline target
  injectRamTrampoline(RAM_TRAMPOLINE_PC);

  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  // Track recent blocks (rolling window) and capture context for each frontier
  const recentBlocks = [];        // rolling window of last 15 entries
  const WINDOW_SIZE = 15;
  const frontierContexts = {};    // addr -> { before: [...], hitStep }
  const frontierSet = new Set(FRONTIER_ADDRESSES);
  const missingBlocks = [];
  const uniqueBlocks = new Set();

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      uniqueBlocks.add(blockKey(normalizedPc, normalizedMode));

      // Push to rolling window
      recentBlocks.push({ step: step + 1, pc: normalizedPc, mode: normalizedMode });
      if (recentBlocks.length > WINDOW_SIZE) {
        recentBlocks.shift();
      }

      // Check if this is a frontier address
      if (frontierSet.has(normalizedPc) && !frontierContexts[normalizedPc]) {
        // Capture the blocks leading up to this hit (excluding the hit itself)
        const before = recentBlocks.slice(0, -1).slice(-10);
        frontierContexts[normalizedPc] = {
          before,
          hitStep: step + 1,
          hitMode: normalizedMode,
        };
      }
    },
    onMissingBlock(pc, mode, step) {
      const normalizedPc = pc & 0xFFFFFF;
      missingBlocks.push({ step: step + 1, pc: normalizedPc, mode: mode ?? 'adl' });

      // Check if this missing block is a frontier address
      if (frontierSet.has(normalizedPc) && !frontierContexts[normalizedPc]) {
        const before = recentBlocks.slice(-10);
        frontierContexts[normalizedPc] = {
          before,
          hitStep: step + 1,
          hitMode: mode ?? 'adl',
          wasMissing: true,
        };
      }

      // Inject RAM trampoline dynamically
      if (normalizedPc >= RAM_THRESHOLD) {
        injectRamTrampoline(normalizedPc);
      }
    },
  });

  console.log('Boot summary');
  console.log('------------');
  console.log(`  termination:    ${result.termination}`);
  console.log(`  steps:          ${result.steps}`);
  console.log(`  unique blocks:  ${uniqueBlocks.size}`);
  console.log(`  last pc:        ${hex(result.lastPc)}:${result.lastMode}`);
  console.log('');

  if (missingBlocks.length > 0) {
    console.log(`Missing blocks encountered (${missingBlocks.length}):`);
    for (const mb of missingBlocks) {
      const isRam = mb.pc >= RAM_THRESHOLD;
      console.log(`  step=${String(mb.step).padStart(6)}  pc=${hex(mb.pc)}:${mb.mode}  ${isRam ? '(RAM)' : '(ROM)'}`);
    }
    console.log('');
  }

  // Print call chain for each frontier address
  for (const addr of FRONTIER_ADDRESSES) {
    const ctx = frontierContexts[addr];
    console.log(`Call chain leading to ${hex(addr)}:adl`);
    console.log('------------------------------------------');
    if (!ctx) {
      console.log('  (address was NOT reached during boot)');
    } else {
      console.log(`  Hit at step ${ctx.hitStep}, mode=${ctx.hitMode}${ctx.wasMissing ? ' (missing block)' : ' (executed)'}`);
      console.log('  Preceding blocks:');
      if (ctx.before.length === 0) {
        console.log('    (none captured)');
      } else {
        for (const entry of ctx.before) {
          console.log(`    step=${String(entry.step).padStart(6)}  ${hex(entry.pc)}:${entry.mode}`);
        }
      }
    }
    console.log('');
  }

  // =========================================================================
  // PART 3: Analysis
  // =========================================================================
  console.log('=== PART 3: ANALYSIS ===');
  console.log('');

  for (const addr of FRONTIER_ADDRESSES) {
    const rows = disasmResults[addr];
    const analysis = analyzeDisassembly(rows);

    console.log(`Analysis of ${hex(addr)}:adl`);
    console.log('------------------------------------------');

    // First instruction
    console.log(`  First instruction: ${rows[0].dasm}  (tag=${rows[0].inst.tag})`);
    console.log(`  Instruction tags seen: ${analysis.tags.join(', ')}`);

    // CALL targets
    if (analysis.callTargets.length > 0) {
      console.log(`  CALL targets:`);
      for (const target of analysis.callTargets) {
        const targetHex = typeof target === 'number' ? hex(target) : target;
        const hasBlock = typeof target === 'number' && PRELIFTED_BLOCKS[blockKey(target, 'adl')];
        console.log(`    ${targetHex}  ${hasBlock ? '(block exists)' : '(MISSING — potential frontier)'}`);
      }
    } else {
      console.log('  CALL targets: (none)');
    }

    // JP targets
    if (analysis.jpTargets.length > 0) {
      console.log(`  JP targets:`);
      for (const target of analysis.jpTargets) {
        const targetHex = typeof target === 'number' ? hex(target) : target;
        const hasBlock = typeof target === 'number' && PRELIFTED_BLOCKS[blockKey(target, 'adl')];
        const status = typeof target === 'number'
          ? (hasBlock ? '(block exists)' : '(MISSING — potential frontier)')
          : '(indirect)';
        console.log(`    ${targetHex}  ${status}`);
      }
    } else {
      console.log('  JP targets: (none)');
    }

    // Port I/O
    if (analysis.portOps.length > 0) {
      console.log(`  Port I/O operations:`);
      for (const op of analysis.portOps) {
        console.log(`    ${op.dasm}  (port=${op.port !== undefined ? hexByte(op.port) : 'register C'})`);
      }
    } else {
      console.log('  Port I/O: (none)');
    }

    // Likely function purpose heuristic
    const hasRet = analysis.tags.includes('ret') || analysis.tags.includes('ret-conditional');
    const hasCalls = analysis.callTargets.length > 0;
    const hasPortIO = analysis.portOps.length > 0;
    const hasLoops = analysis.tags.includes('djnz') || analysis.tags.includes('jr-conditional') || analysis.tags.includes('jp-conditional');

    console.log('  Likely nature:');
    if (hasPortIO) console.log('    - Hardware I/O (port reads/writes)');
    if (hasCalls) console.log('    - Subroutine (makes CALL(s))');
    if (hasLoops) console.log('    - Contains loop(s)');
    if (hasRet) console.log('    - Returns to caller');
    if (!hasRet && !hasCalls && !hasPortIO) console.log('    - Inline code / data / fall-through');

    console.log('');
  }

  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
