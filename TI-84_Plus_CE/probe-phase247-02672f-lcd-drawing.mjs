#!/usr/bin/env node

/**
 * Phase 247: Trace LCD drawing function 0x02672F
 *
 * Called 3+ times by 0x027123 (screen-redraw routine, session 245).
 * Goal: understand what VRAM it writes, how many steps it takes,
 * whether it returns, and what blocks it visits.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import * as peripheralRuntime from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const ENTRY_FUNC = 0x02672F;
const ENTRY_SP = 0xD1A878;
const IX = 0xD1A860;
const IY = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

// VRAM range
const VRAM_START = 0xD40000;
const VRAM_END = 0xD57FFF;

const TRACE_BUDGETS = [500, 2000, 5000];

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const createPeripheralBus =
  cpuRuntime.createPeripheralBus ?? peripheralRuntime.createPeripheralBus;

if (typeof createPeripheralBus !== 'function') {
  throw new Error('Unable to resolve createPeripheralBus().');
}

if (typeof cpuRuntime.createExecutor !== 'function') {
  throw new Error('cpu-runtime.js does not export createExecutor().');
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (v) => hexByte(v)).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.',
    );
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase247-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function createCPU(mem, blocks, peripherals) {
  const executor = cpuRuntime.createExecutor(blocks, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function nextMode(executor, key, pc, mode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return mode;
  for (const exit of exits) {
    if (exit.target === pc && exit.targetMode) return exit.targetMode;
  }
  return mode;
}

function installStep(cpu, executor) {
  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks?.[key];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block ${hex(pc)} (${key})`);
    }
    const out = fn(this);
    if (typeof out !== 'number') {
      throw new Error(`Bad step result from ${hex(pc)}: ${String(out)}`);
    }
    if (out >= 0) {
      const modeAfter = nextMode(executor, key, out, mode);
      this.pc = out & 0xFFFFFF;
      this.madl = modeAfter === 'adl' ? 1 : 0;
    }
    return out;
  };
}

function makeRuntime(blocks, romBytes) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, blocks, peripherals);
  installStep(cpu, executor);
  return { mem, cpu, executor };
}

function register24(cpu, name) {
  return ((cpu[`_${name}`] ?? cpu[name] ?? 0) & 0xFFFFFF);
}

function formatRegs(cpu) {
  return [
    `PC=${hex(cpu.pc & 0xFFFFFF)}`,
    `A=${hexByte(cpu.a)}`,
    `F=${hexByte(cpu.f)}`,
    `BC=${hex(register24(cpu, 'bc'))}`,
    `DE=${hex(register24(cpu, 'de'))}`,
    `HL=${hex(register24(cpu, 'hl'))}`,
    `IX=${hex(register24(cpu, 'ix'))}`,
    `IY=${hex(register24(cpu, 'iy'))}`,
    `SP=${hex(cpu.sp & 0xFFFFFF)}`,
    `MADL=${cpu.madl ? 1 : 0}`,
    `MBASE=${hexByte(cpu.mbase)}`,
  ].join(' ');
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  switch (inst.tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'push': return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ei': return 'EI';
    case 'di': return 'DI';
    default: return inst.tag + (inst.target !== undefined ? ` ${hex(inst.target)}` : '');
  }
}

function blockSummary(meta, pc, romBytes) {
  if (meta?.instructions?.length) {
    const parts = meta.instructions.map((i) => i.dasm).join(' | ');
    return parts.length > 120 ? parts.slice(0, 117) + '...' : parts;
  }
  try {
    return formatInstruction(decodeInstruction(romBytes, pc, 'adl'));
  } catch {
    return '(decode error)';
  }
}

function disassembleRange(romBytes, start, endInclusive) {
  const rows = [];
  let pc = start;
  while (pc <= endInclusive) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = inst.length || 1;
      rows.push({
        pc,
        bytes: bytesToHex(romBytes.subarray(pc, Math.min(pc + length, endInclusive + 1))),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }
  return rows;
}

function seedState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = ENTRY_FUNC;
  cpu.sp = ENTRY_SP;
  cpu.ix = IX;
  cpu.iy = IY;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;

  // Common seeds from session 245
  mem[0xD0058E & MEM_MASK] = 0x8F;
  mem[0xD0058D & MEM_MASK] = 0x00;
  mem[0xD0059F & MEM_MASK] = 0x00;
  mem[0xD003E0 & MEM_MASK] = 0x00;
  mem[0xD00824 & MEM_MASK] = 0x00;
  mem[0xD003DA & MEM_MASK] = 0x00;
  mem[0xD007E0 & MEM_MASK] = 0x40;
  mem[0xD00000 & MEM_MASK] = 0x00;

  // Push return sentinel onto stack
  write24(mem, ENTRY_SP, RETURN_SENTINEL);
}

/**
 * Run trace with a given step budget.
 * Returns: { stopReason, steps, uniqueBlocks, vramWrites, portIO, finalPc, callDepth }
 */
function runTrace(blocks, romBytes, budget) {
  const { mem, cpu, executor } = makeRuntime(blocks, romBytes);
  seedState(cpu, mem);

  // Snapshot VRAM before execution to detect writes
  const vramBefore = new Uint8Array(VRAM_END - VRAM_START + 1);
  for (let i = 0; i <= VRAM_END - VRAM_START; i++) {
    vramBefore[i] = mem[(VRAM_START + i) & MEM_MASK];
  }

  // Intercept port I/O by wrapping peripherals
  const portIO = [];
  const origIn = cpu.portIn?.bind(cpu) ?? (() => 0xFF);
  const origOut = cpu.portOut?.bind(cpu) ?? (() => {});

  const uniqueBlocks = new Map();
  const stepLog = [];
  const callStack = [];
  let maxCallDepth = 0;
  let stopReason = 'budget_exhausted';
  let errorMessage = null;
  let stepsRun = 0;

  for (let step = 0; step < budget; step++) {
    const pc = cpu.pc & 0xFFFFFF;
    const mode = cpu.madl ? 'adl' : 'z80';
    const key = blockKey(pc, mode);
    const meta = executor.blockMeta?.[key] ?? null;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      stepsRun = step;
      break;
    }

    uniqueBlocks.set(pc, {
      pc,
      count: (uniqueBlocks.get(pc)?.count ?? 0) + 1,
      summary: blockSummary(meta, pc, romBytes),
    });

    // Log first 50 steps always, then every 100th, and last 20
    const logThis = step < 50 || step % 100 === 0;
    let out;
    let afterPc = pc;
    try {
      out = cpu.step();
      afterPc = cpu.pc & 0xFFFFFF;
    } catch (error) {
      stopReason = 'error';
      errorMessage = error?.message ?? String(error);
      stepLog.push({ step, pc, afterPc: null, note: `ERROR: ${errorMessage}` });
      stepsRun = step;
      break;
    }

    // Track call depth from metadata
    const lastInst = meta?.instructions?.[meta.instructions.length - 1];
    if (lastInst?.tag === 'call' || lastInst?.tag === 'call-conditional') {
      callStack.push(pc);
      if (callStack.length > maxCallDepth) maxCallDepth = callStack.length;
    }
    if (lastInst?.tag === 'ret' || lastInst?.tag === 'ret-conditional') {
      callStack.pop();
    }

    if (logThis) {
      const instText = lastInst?.dasm ?? blockSummary(meta, pc, romBytes);
      stepLog.push({ step, pc, afterPc, note: instText });
    }

    if (out === -1) { stopReason = 'halt'; stepsRun = step; break; }
    if (out === -2) { stopReason = 'sleep'; stepsRun = step; break; }
    if (afterPc === RETURN_SENTINEL) { stopReason = 'returned_sentinel'; stepsRun = step + 1; break; }

    stepsRun = step + 1;
  }

  // Count VRAM bytes changed
  let vramBytesWritten = 0;
  const vramRegions = []; // track contiguous changed regions
  let regionStart = -1;
  for (let i = 0; i <= VRAM_END - VRAM_START; i++) {
    const current = mem[(VRAM_START + i) & MEM_MASK];
    if (current !== vramBefore[i]) {
      vramBytesWritten++;
      if (regionStart === -1) regionStart = i;
    } else {
      if (regionStart !== -1) {
        vramRegions.push({ start: VRAM_START + regionStart, end: VRAM_START + i - 1, bytes: i - regionStart });
        regionStart = -1;
      }
    }
  }
  if (regionStart !== -1) {
    vramRegions.push({
      start: VRAM_START + regionStart,
      end: VRAM_START + (VRAM_END - VRAM_START),
      bytes: (VRAM_END - VRAM_START + 1) - regionStart,
    });
  }

  return {
    budget,
    stepsRun,
    stopReason,
    errorMessage,
    finalPc: cpu.pc & 0xFFFFFF,
    finalRegs: formatRegs(cpu),
    uniqueBlocks: [...uniqueBlocks.values()].sort((a, b) => a.pc - b.pc),
    vramBytesWritten,
    vramRegions: vramRegions.slice(0, 20), // cap output
    portIO,
    maxCallDepth,
    stepLog,
  };
}

function printDivider(title) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
}

async function main() {
  const assets = ensureTranspiledModule();
  try {
    const romBytes = fs.readFileSync(ROM_PATH);
    const mod = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(mod.PRELIFTED_BLOCKS ?? mod.default?.PRELIFTED_BLOCKS ?? mod.default ?? mod);
    if (!blocks || typeof blocks !== 'object' || !Object.keys(blocks).length) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }

    console.log('Phase 247: Trace LCD drawing function 0x02672F');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Entry: ${hex(ENTRY_FUNC)}  SP=${hex(ENTRY_SP)} IX=${hex(IX)} IY=${hex(IY)} MBASE=${hexByte(MBASE)}`);
    console.log(`Return sentinel: ${hex(RETURN_SENTINEL)}`);
    console.log(`VRAM range: ${hex(VRAM_START)}..${hex(VRAM_END)}`);
    console.log('');

    // Static disassembly of the entry region
    const disasmEnd = Math.min(ENTRY_FUNC + 0x80, 0x0267AF);
    const rows = disassembleRange(romBytes, ENTRY_FUNC, disasmEnd);
    printDivider(`STATIC DISASSEMBLY ${hex(ENTRY_FUNC)}..${hex(disasmEnd)}`);
    for (const row of rows) {
      console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
    }
    console.log('');

    // Run traces at increasing budgets
    for (const budget of TRACE_BUDGETS) {
      printDivider(`DYNAMIC TRACE: ${budget} step budget`);

      const result = runTrace(blocks, romBytes, budget);

      console.log(`  Steps executed: ${result.stepsRun} / ${result.budget}`);
      console.log(`  Stop reason: ${result.stopReason}`);
      console.log(`  Final PC: ${hex(result.finalPc)}`);
      console.log(`  Final regs: ${result.finalRegs}`);
      console.log(`  Max call depth: ${result.maxCallDepth}`);
      console.log(`  Unique blocks visited: ${result.uniqueBlocks.length}`);
      console.log(`  VRAM bytes written: ${result.vramBytesWritten}`);
      if (result.errorMessage) {
        console.log(`  Error: ${result.errorMessage}`);
      }
      console.log('');

      // Print VRAM regions
      if (result.vramRegions.length > 0) {
        console.log(`  VRAM changed regions (${result.vramRegions.length} contiguous):`);
        for (const region of result.vramRegions) {
          console.log(`    ${hex(region.start)}..${hex(region.end)} (${region.bytes} bytes)`);
        }
      } else {
        console.log('  VRAM changed regions: (none)');
      }
      console.log('');

      // Print unique blocks
      console.log(`  Unique blocks (${result.uniqueBlocks.length}):`);
      for (const block of result.uniqueBlocks) {
        console.log(`    ${hex(block.pc)} x${block.count}  ${block.summary}`);
      }
      console.log('');

      // Print step log
      console.log(`  Step log (${result.stepLog.length} entries):`);
      for (const row of result.stepLog) {
        const afterText = row.afterPc === null ? 'n/a' : hex(row.afterPc);
        console.log(`    step ${String(row.step).padStart(5, ' ')}: ${hex(row.pc)} -> ${afterText}  ${row.note}`);
      }
      console.log('');

      // If it returned, no need for bigger budgets
      if (result.stopReason === 'returned_sentinel') {
        console.log(`  ** Function returned at step ${result.stepsRun}. Skipping larger budgets. **`);
        console.log('');
        break;
      }

      // If stuck, report where
      if (result.stopReason === 'budget_exhausted') {
        // Find most-visited block
        const hotBlock = result.uniqueBlocks.reduce((a, b) => a.count > b.count ? a : b);
        console.log(`  ** Budget exhausted. Hottest block: ${hex(hotBlock.pc)} x${hotBlock.count}  ${hotBlock.summary}`);
        console.log(`  ** Stuck at: ${hex(result.finalPc)}`);
        console.log('');
      }
    }

    printDivider('SUMMARY');
    console.log('  Function 0x02672F is an LCD drawing routine called by 0x027123 (screen-redraw).');
    console.log('  See trace results above for VRAM write patterns and return behavior.');
    console.log('');

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
