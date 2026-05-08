#!/usr/bin/env node

/**
 * probe-phase236-d00824-writers.mjs
 *
 * Static binary scan of ROM.rom for all instructions that write to D00824,
 * plus surrounding disassembly and dynamic traces of top 3 sites.
 *
 * D00824 is the "mode byte" read by the normal key dispatch at 0x02FFAE.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus as fallbackCreatePeripheralBus } from './peripherals.js';

const {
  createCPU: runtimeCreateCPU,
  createMemoryBus: runtimeCreateMemoryBus,
  createPeripheralBus: runtimeCreatePeripheralBus,
  createExecutor,
} = cpuRuntime;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length; // 4 MB

const TARGET_ADDR = 0xD00824;
const TARGET_LO = TARGET_ADDR & 0xFF;         // 0x24
const TARGET_MID = (TARGET_ADDR >>> 8) & 0xFF; // 0x08
const TARGET_HI = (TARGET_ADDR >>> 16) & 0xFF; // 0xD0

const MEM_SIZE = 0x1000000;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;
const IX_BASE = 0xD1A860;
const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MAX_TRACE_STEPS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function regionLabel(addr) {
  const page = (addr >>> 16) & 0xFF;
  if (page <= 0x03) return 'OS-low (00-03xxxx)';
  if (page === 0x04) return 'OS-core (04xxxx)';
  if (page === 0x05) return 'OS-mid (05xxxx)';
  if (page === 0x06) return 'Editor (06xxxx)';
  if (page === 0x07) return 'OS-07 (07xxxx)';
  if (page === 0x08) return 'UI/menu (08xxxx)';
  if (page === 0x09) return 'STAT (09xxxx)';
  if (page >= 0x0A) return `Apps (${hex(page, 2)}xxxx)`;
  return `Unknown (${hex(page, 2)}xxxx)`;
}

// ---------------------------------------------------------------------------
// Step 1: Static binary scan for LD (0xD00824),A  =>  32 24 08 D0
// ---------------------------------------------------------------------------

console.log('=== Phase 236: D00824 Writer Sites ===\n');
console.log('Scanning ROM for LD (0xD00824),A  [opcode 32 24 08 D0] ...\n');

const writeSites = [];

for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (
    rom[i] === 0x32 &&
    rom[i + 1] === TARGET_LO &&
    rom[i + 2] === TARGET_MID &&
    rom[i + 3] === TARGET_HI
  ) {
    writeSites.push(i);
  }
}

console.log(`Found ${writeSites.length} LD (D00824),A sites.\n`);

// ---------------------------------------------------------------------------
// Step 2 & 3: Disassemble context and classify each site
// ---------------------------------------------------------------------------

const siteDetails = [];

for (const siteAddr of writeSites) {
  const CONTEXT_BEFORE = 16;
  const CONTEXT_AFTER = 16;

  const startDisasm = Math.max(0, siteAddr - CONTEXT_BEFORE);
  const endDisasm = Math.min(ROM_SIZE, siteAddr + 4 + CONTEXT_AFTER);

  // Disassemble from startDisasm to endDisasm
  const instructions = [];
  let pc = startDisasm;
  while (pc < endDisasm && pc < ROM_SIZE) {
    try {
      const instr = decodeInstruction(rom, pc, 'adl');
      if (!instr || instr.length <= 0) {
        instructions.push({ pc, tag: 'UNKNOWN', length: 1 });
        pc += 1;
        continue;
      }
      instructions.push(instr);
      pc = instr.nextPc;
    } catch {
      instructions.push({ pc, tag: 'DECODE-ERROR', length: 1 });
      pc += 1;
    }
  }

  // Classify what value is written:
  // Look for LD A,imm (opcode 0x3E nn) or XOR A (opcode 0xAF = A=0) before the write
  let classification = 'register-dependent';
  let valueWritten = '?';

  // Search backwards in the instruction list for the instruction just before the write
  const writeIdx = instructions.findIndex((ins) => ins.pc === siteAddr);
  if (writeIdx > 0) {
    for (let j = writeIdx - 1; j >= 0 && j >= writeIdx - 5; j--) {
      const prev = instructions[j];
      if (prev.tag === 'ld-reg-imm' && prev.dest === 'a') {
        classification = 'constant';
        valueWritten = hexByte(prev.value);
        break;
      }
      if (prev.tag === 'xor' && prev.src === 'a') {
        classification = 'constant (XOR A -> 0)';
        valueWritten = '0x00';
        break;
      }
      if (prev.tag === 'ld-reg-reg' && prev.dest === 'a') {
        classification = `register (A <- ${prev.src})`;
        break;
      }
      if (prev.tag === 'ld-reg-mem') {
        if (prev.dest === 'a') {
          classification = `memory-read (A <- [${hex(prev.addr)}])`;
          break;
        }
      }
      if (prev.tag === 'ld-reg-ind' && prev.dest === 'a') {
        classification = `indirect-read (A <- (${prev.indirectRegister || prev.base || '?'}))`;
        break;
      }
      // If we hit a jump/call/ret, stop looking
      if (
        prev.tag === 'jp' || prev.tag === 'call' || prev.tag === 'ret' ||
        prev.tag === 'jr' || prev.tag === 'rst'
      ) {
        break;
      }
    }
  }

  // Format disassembly lines
  const disasmLines = instructions.map((ins) => {
    const marker = ins.pc === siteAddr ? ' >>>' : '    ';
    const rawBytes = [];
    for (let b = 0; b < (ins.length || 1); b++) {
      if (ins.pc + b < ROM_SIZE) {
        rawBytes.push(rom[ins.pc + b].toString(16).padStart(2, '0'));
      }
    }
    const bytesStr = rawBytes.join(' ').padEnd(16);
    const tagStr = ins.tag || 'UNKNOWN';

    // Build a readable operand string
    let operands = '';
    if (ins.addr !== undefined) operands += ` addr=${hex(ins.addr)}`;
    if (ins.src !== undefined) operands += ` src=${ins.src}`;
    if (ins.dest !== undefined) operands += ` dest=${ins.dest}`;
    if (ins.value !== undefined) operands += ` val=${hexByte(ins.value)}`;
    if (ins.target !== undefined) operands += ` target=${hex(ins.target)}`;
    if (ins.condition !== undefined) operands += ` cond=${ins.condition}`;
    if (ins.displacement !== undefined) operands += ` disp=${ins.displacement}`;
    if (ins.bit !== undefined) operands += ` bit=${ins.bit}`;
    if (ins.reg !== undefined) operands += ` reg=${ins.reg}`;
    if (ins.base !== undefined) operands += ` base=${ins.base}`;
    if (ins.indirectRegister !== undefined) operands += ` ind=${ins.indirectRegister}`;

    return `${marker} ${hex(ins.pc)}  ${bytesStr}  ${tagStr}${operands}`;
  });

  const detail = {
    address: hex(siteAddr),
    region: regionLabel(siteAddr),
    classification,
    valueWritten,
    disasmLines,
  };

  siteDetails.push(detail);
}

// ---------------------------------------------------------------------------
// Step 4: Group by region
// ---------------------------------------------------------------------------

const regionGroups = {};
for (const site of siteDetails) {
  if (!regionGroups[site.region]) {
    regionGroups[site.region] = [];
  }
  regionGroups[site.region].push(site);
}

// Print the table
console.log('--- Summary Table ---\n');
console.log(
  'Address'.padEnd(12) +
  'Region'.padEnd(25) +
  'Classification'.padEnd(35) +
  'Value'
);
console.log('-'.repeat(80));

for (const site of siteDetails) {
  console.log(
    site.address.padEnd(12) +
    site.region.padEnd(25) +
    site.classification.padEnd(35) +
    site.valueWritten
  );
}

console.log('\n--- Region Groups ---\n');
for (const [region, sites] of Object.entries(regionGroups)) {
  console.log(`${region}: ${sites.length} site(s) — ${sites.map((s) => s.address).join(', ')}`);
}

// Print disassembly for each site
console.log('\n--- Disassembly Context ---\n');
for (const site of siteDetails) {
  console.log(`=== ${site.address} [${site.region}] — ${site.classification} (${site.valueWritten}) ===`);
  for (const line of site.disasmLines) {
    console.log(line);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Step 5: Dynamic trace for top 3 most interesting sites
// Pick sites that write constants or have clear setup patterns.
// ---------------------------------------------------------------------------

// Rank: constants with known values first, then register-dependent, then memory-read
function interestRank(site) {
  if (site.classification === 'constant') return 3;
  if (site.classification.startsWith('constant')) return 3; // XOR A
  if (site.classification.startsWith('register')) return 2;
  if (site.classification.startsWith('memory')) return 1;
  return 0;
}

const ranked = [...siteDetails].sort((a, b) => interestRank(b) - interestRank(a));
const top3 = ranked.slice(0, 3);

console.log('--- Dynamic Traces (top 3 most interesting sites) ---\n');

// Load transpiled blocks for dynamic execution
const transpiledModule = await import('./ROM.transpiled.js');
const BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  null;

if (!BLOCKS || typeof BLOCKS !== 'object') {
  console.log('ERROR: Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
  process.exit(1);
}

function blockKey(addr, mode = 'adl') {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function blockMethodName(addr, mode = 'adl') {
  return `block_${(addr >>> 0).toString(16).padStart(6, '0')}_${mode === 'adl' ? 1 : 0}`;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function createPeripheralBusCompat(options) {
  if (typeof runtimeCreatePeripheralBus === 'function') {
    return runtimeCreatePeripheralBus(options);
  }
  return fallbackCreatePeripheralBus(options);
}

function createMemoryBusCompat(romBytes, peripherals) {
  if (typeof runtimeCreateMemoryBus === 'function') {
    const created = runtimeCreateMemoryBus(romBytes, peripherals);
    if (ArrayBuffer.isView(created) && typeof created.set === 'function') {
      return created;
    }
  }
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function createCpuCompat(mem, peripherals) {
  if (typeof runtimeCreateCPU === 'function') {
    const created = runtimeCreateCPU(mem, peripherals);
    if (created?.cpu && created?.executor?.compiledBlocks) {
      return { cpu: created.cpu, executor: created.executor };
    }
  }
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function createRuntime() {
  const peripherals = createPeripheralBusCompat({ timerInterrupt: false });
  const mem = createMemoryBusCompat(rom, peripherals);
  const { cpu, executor } = createCpuCompat(mem, peripherals);
  return { peripherals, mem, cpu, executor };
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for cpu.step() tracing.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const methodName = blockMethodName(pc, mode);

    if (typeof this[methodName] !== 'function') {
      const fn = executor.compiledBlocks[key];
      if (typeof fn === 'function') {
        this[methodName] = fn;
      }
    }

    const fn = this[methodName];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    const result = fn(this);
    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      this.pc = result & 0xFFFFFF;
    }

    return result;
  };
}

const runtime = createRuntime();
installStepShim(runtime.cpu, runtime.executor);
const baselineMemory = new Uint8Array(runtime.mem);

for (const site of top3) {
  const siteAddr = parseInt(site.address.replace('0x', ''), 16);
  const traceStart = Math.max(0, siteAddr - 16);

  console.log(`=== Dynamic trace: ${site.address} [${site.classification}] ===`);
  console.log(`  Starting 16 bytes before write at ${hex(traceStart)}, max ${MAX_TRACE_STEPS} steps\n`);

  // Reset memory and CPU
  runtime.mem.set(baselineMemory);
  const cpu = runtime.cpu;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = traceStart;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;

  // Set D00824 to a known sentinel so we can detect the write
  runtime.mem[TARGET_ADDR] = 0xEE;

  // Push return sentinel
  push24(cpu, runtime.mem, RETURN_SENTINEL);

  const trace = [];
  let steps = 0;
  let stopReason = 'max_steps';
  let wroteD00824 = false;

  while (steps < MAX_TRACE_STEPS) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_to_sentinel';
      break;
    }

    const aBeforeStep = cpu.a;
    const d00824Before = runtime.mem[TARGET_ADDR];

    trace.push({
      step: steps,
      pc: hex(pc),
      a: hexByte(cpu.a),
      hl: hex(cpu.hl),
      sp: hex(cpu.sp),
    });

    try {
      const result = cpu.step();
      steps += 1;

      // Check if D00824 was written
      const d00824After = runtime.mem[TARGET_ADDR];
      if (d00824After !== d00824Before) {
        wroteD00824 = true;
        trace.push({
          step: steps,
          event: `D00824 WRITTEN: ${hexByte(d00824Before)} -> ${hexByte(d00824After)} (A was ${hexByte(aBeforeStep)})`,
        });
      }

      if (result === -1) { stopReason = 'halt'; break; }
      if (result === -2) { stopReason = 'sleep'; break; }
    } catch (err) {
      stopReason = `error: ${err.message}`;
      break;
    }
  }

  // Print trace (condensed)
  for (const entry of trace) {
    if (entry.event) {
      console.log(`  [${entry.step}] *** ${entry.event}`);
    } else {
      console.log(`  [${entry.step}] PC=${entry.pc}  A=${entry.a}  HL=${entry.hl}  SP=${entry.sp}`);
    }
  }

  console.log(`\n  Stop reason: ${stopReason}`);
  console.log(`  Steps: ${steps}`);
  console.log(`  D00824 final: ${hexByte(runtime.mem[TARGET_ADDR])}`);
  console.log(`  Wrote D00824: ${wroteD00824}\n`);
}

console.log('=== Probe complete ===');
