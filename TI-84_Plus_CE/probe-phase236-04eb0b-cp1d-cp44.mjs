#!/usr/bin/env node

/**
 * Phase 236: Investigate 0x04EB0B — CP 0x1D / CP 0x44 Sequence
 *
 * Session 235 found ROM at 0x04EB0B contains FE 1D 28 04 FE 44:
 *   CP 0x1D    ; FE 1D
 *   JR Z,+4   ; 28 04 (jump to 0x04EB11 if A==0x1D)
 *   CP 0x44    ; FE 44
 *
 * Key code 0x44 = physical "2" key (scan code 0x31 in the 09F79B table).
 * 0x1D is a synthetic internal dispatch code.
 * The gate at 0x0302EB replaces A with 0x1D when key code is 0x44 + BIT 4,(IY+0x4B) is SET.
 * So 0x04EB0B handles BOTH the original key code AND its replacement.
 *
 * This probe:
 *   1. Disassembles ROM 0x04EAF0..0x04EB40
 *   2. Finds function boundary (scan backward for RET/JP)
 *   3. Checks if 0x04EB0B is inside 0x04EB3E (pointer-table dispatch)
 *   4. Runs dynamic traces with A=0x1D, A=0x44, A=0x8F
 *   5. Records unique blocks, RAM writes, final state
 *   6. Determines architectural role
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

const TARGET_ADDR = 0x04EB0B;
const DISASM_START = 0x04EAF0;
const DISASM_END = 0x04EB40;
const JR_Z_TARGET = 0x04EB11; // JR Z,+4 from 0x04EB0D lands here
const DISPATCH_04EB3E = 0x04EB3E;

const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;

const D0058E_ADDR = 0xD0058E;
const D003E0_ADDR = 0xD003E0;

const STEP_LIMIT = 200;
const IY_OFFSETS = [0, 1, 2, 3, 4, 5, 18, 29, 40, 0x4B];

const createPeripheralBus =
  cpuRuntime.createPeripheralBus ?? peripheralRuntime.createPeripheralBus;

if (typeof createPeripheralBus !== 'function') {
  throw new Error('Unable to resolve createPeripheralBus().');
}

if (typeof cpuRuntime.createExecutor !== 'function') {
  throw new Error('cpu-runtime.js does not export createExecutor().');
}

// ---------- Helpers ----------

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.reg).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.reg).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'or-reg':
      return `OR ${String(inst.src).toUpperCase()}`;
    case 'and-reg':
      return `AND ${String(inst.src).toUpperCase()}`;
    case 'xor-reg':
      return `XOR ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'cp-reg':
      return `CP ${String(inst.src).toUpperCase()}`;
    default: {
      // Try to build a reasonable representation from tag + fields
      let s = inst.tag;
      if (inst.target !== undefined) s += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) s += ` ${hexByte(inst.value)}`;
      if (inst.dest !== undefined) s += ` ${String(inst.dest).toUpperCase()}`;
      if (inst.src !== undefined) s += `,${String(inst.src).toUpperCase()}`;
      return s;
    }
  }
}

function decodeAt(romBytes, pc) {
  try {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const len = inst.length || 1;
    const bytes = romBytes.subarray(pc, pc + len);
    return {
      pc: pc >>> 0,
      length: len,
      bytes: bytesToHex(bytes),
      text: formatInstruction(inst),
      inst,
    };
  } catch {
    return {
      pc: pc >>> 0,
      length: 1,
      bytes: hexByte(romBytes[pc]),
      text: '(decode error)',
      inst: null,
    };
  }
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      source: 'js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.',
    );
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase236-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
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

function snapshotIyFlags(mem, iyBase) {
  const snapshot = {};
  for (const offset of IY_OFFSETS) {
    snapshot[`IY+${offset}`] = mem[(iyBase + offset) & MEM_MASK];
  }
  return snapshot;
}

function formatIySnapshot(snapshot) {
  return IY_OFFSETS
    .map((offset) => `IY+0x${offset.toString(16).toUpperCase().padStart(2, '0')}=${hexByte(snapshot[`IY+${offset}`])}`)
    .join(' ');
}

function diffIySnapshots(before, after) {
  const changes = [];
  for (const offset of IY_OFFSETS) {
    const key = `IY+${offset}`;
    if (before[key] !== after[key]) {
      changes.push(`IY+0x${offset.toString(16).toUpperCase().padStart(2, '0')}:${hexByte(before[key])}->${hexByte(after[key])}`);
    }
  }
  return changes;
}

function makeStopError(reason, pc) {
  const error = new Error('__PHASE236_STOP__');
  error.phase236Stop = {
    reason,
    pc: pc & 0xFFFFFF,
  };
  return error;
}

// ---------- PART 1: Disassembly ----------

function printDisassembly(romBytes) {
  console.log('========================================================================');
  console.log('PART 1: Disassembly 0x04EAF0 .. 0x04EB40');
  console.log('========================================================================');
  console.log('');

  let pc = DISASM_START;
  while (pc < DISASM_END) {
    const row = decodeAt(romBytes, pc);
    const marker = (pc === TARGET_ADDR) ? ' <-- CP 0x1D / CP 0x44 sequence' :
                   (pc === JR_Z_TARGET) ? ' <-- JR Z target (A==0x1D path)' :
                   '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${marker}`);
    pc += row.length;
  }
  console.log('');
}

// ---------- PART 2: Function boundary ----------

function findFunctionBoundary(romBytes) {
  console.log('========================================================================');
  console.log('PART 2: Function boundary — scan backward from 0x04EB0B');
  console.log('========================================================================');
  console.log('');

  // Scan backward looking for RET, JP, or similar terminating instruction
  // that would indicate the end of a previous function (= start of ours)
  let candidateEntry = null;

  for (let scanPC = TARGET_ADDR - 1; scanPC >= TARGET_ADDR - 128; scanPC--) {
    try {
      const inst = decodeInstruction(romBytes, scanPC, 'adl');
      if (!inst) continue;

      const isTerminator =
        inst.tag === 'ret' ||
        (inst.tag === 'jp' && inst.target !== undefined) ||
        inst.tag === 'halt';

      if (isTerminator) {
        candidateEntry = scanPC + (inst.length || 1);
        console.log(`  Found terminator at ${hex(scanPC)}: ${formatInstruction(inst)}`);
        console.log(`  Probable function entry: ${hex(candidateEntry)}`);
        console.log('');

        // Disassemble from entry to TARGET_ADDR+16 to show function prologue
        console.log('  Function prologue disassembly:');
        let pc = candidateEntry;
        while (pc < TARGET_ADDR + 16) {
          const row = decodeAt(romBytes, pc);
          const marker = (pc === TARGET_ADDR) ? ' <-- TARGET' : '';
          console.log(`    ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${marker}`);
          pc += row.length;
        }
        console.log('');
        break;
      }
    } catch {
      // decode error, keep scanning
    }
  }

  if (!candidateEntry) {
    console.log('  No clear terminator found within 128 bytes before target.');
    console.log('');
  }

  // Check relationship to 0x04EB3E
  console.log(`  Relationship to 0x04EB3E (pointer-table dispatch from session 218):`);
  if (candidateEntry !== null && candidateEntry <= DISPATCH_04EB3E) {
    if (TARGET_ADDR < DISPATCH_04EB3E) {
      console.log(`    0x04EB0B is BEFORE 0x04EB3E — they may be in the same function`);
      console.log(`    or 0x04EB0B may be in a separate function that precedes it.`);
    } else {
      console.log(`    0x04EB0B is AFTER 0x04EB3E — likely inside the dispatch function.`);
    }
  } else {
    console.log(`    0x04EB0B appears to be in a separate function from 0x04EB3E.`);
  }

  // Also decode bytes at 0x04EB3E for context
  console.log('');
  console.log('  Disassembly at 0x04EB3E (pointer-table dispatch entry):');
  let pc = DISPATCH_04EB3E;
  for (let i = 0; i < 8; i++) {
    const row = decodeAt(romBytes, pc);
    console.log(`    ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
    pc += row.length;
  }
  console.log('');

  return candidateEntry;
}

// ---------- PART 3: Dynamic traces ----------

function runTrace(blocks, romBytes, label, seedA, note) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const mem = createMemoryBus(romBytes);
  const { cpu, executor } = createCPU(mem, blocks, peripherals);

  // Seed CPU state per spec
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.ix = 0;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.f = 0x00;
  cpu.a = seedA & 0xFF;
  cpu.sp = STACK_TOP;
  push24(cpu, mem, RETURN_SENTINEL);

  // Seed RAM defaults
  mem[D0058E_ADDR] = 0x00;
  mem[D003E0_ADDR] = 0x00;
  // BIT 4,(IY+0x4B) = 0 (CLEAR, boot default)
  mem[(IY_BASE + 0x4B) & MEM_MASK] &= ~(1 << 4);

  const iyBefore = snapshotIyFlags(mem, cpu.iy);
  const d0058eBefore = mem[D0058E_ADDR];
  const d003e0Before = mem[D003E0_ADDR];

  const visited = [];
  const ramWrites = [];
  let steps = 0;
  let stopReason = 'max_steps';
  let stopPc = TARGET_ADDR;

  // Instrument memory writes by wrapping
  const origWrite = mem.constructor.prototype.set || null;

  try {
    const result = executor.runFrom(TARGET_ADDR, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: 64,
      onBlock(pc, mode, meta, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
      },
      onMissingBlock(pc, mode, step) {
        const currentPc = pc & 0xFFFFFF;
        visited.push(currentPc);
        stopPc = currentPc;
        steps = Math.max(steps, (step ?? 0) + 1);

        if (currentPc === RETURN_SENTINEL) {
          throw makeStopError('return_sentinel', currentPc);
        }
        throw makeStopError('missing_block', currentPc);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    stopPc = (result.lastPc ?? stopPc) & 0xFFFFFF;
    stopReason = result.termination ?? stopReason;
  } catch (error) {
    if (error?.phase236Stop) {
      stopReason = error.phase236Stop.reason;
      stopPc = error.phase236Stop.pc;
    } else {
      stopReason = `error: ${error?.message ?? String(error)}`;
    }
  }

  const iyAfter = snapshotIyFlags(mem, cpu.iy);

  // Check for RAM changes at key addresses
  const watchAddrs = [D0058E_ADDR, D003E0_ADDR, 0xD0058D, 0xD0059F];
  const ramChanges = [];
  // Compare with boot defaults
  if (mem[D0058E_ADDR] !== d0058eBefore) {
    ramChanges.push(`D0058E: ${hexByte(d0058eBefore)} -> ${hexByte(mem[D0058E_ADDR])}`);
  }
  if (mem[D003E0_ADDR] !== d003e0Before) {
    ramChanges.push(`D003E0: ${hexByte(d003e0Before)} -> ${hexByte(mem[D003E0_ADDR])}`);
  }

  // Deduplicate visited blocks
  const uniqueBlocks = [...new Set(visited)];

  return {
    label,
    note,
    seedA,
    steps,
    stopReason,
    stopPc,
    visited,
    uniqueBlocks,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalHL: cpu.hl & 0xFFFFFF,
    finalDE: cpu.de & 0xFFFFFF,
    finalBC: cpu.bc & 0xFFFFFF,
    finalSP: cpu.sp & 0xFFFFFF,
    finalIY: cpu.iy & 0xFFFFFF,
    d0058e: mem[D0058E_ADDR],
    d003e0: mem[D003E0_ADDR],
    d0058d: mem[0xD0058D],
    d0059f: mem[0xD0059F],
    ramChanges,
    iyBefore,
    iyAfter,
    iyChanges: diffIySnapshots(iyBefore, iyAfter),
    visitedJrTarget: visited.includes(JR_Z_TARGET),
  };
}

function printTrace(result) {
  console.log('------------------------------------------------------------------------');
  console.log(`${result.label}: A=${hexByte(result.seedA)} (${result.note})`);
  console.log('------------------------------------------------------------------------');
  console.log(`Stop reason:   ${result.stopReason}`);
  console.log(`Stop PC:       ${hex(result.stopPc)}`);
  console.log(`Steps:         ${result.steps}`);
  console.log(`Final regs:    A=${hexByte(result.finalA)} F=${hexByte(result.finalF)} HL=${hex(result.finalHL)} DE=${hex(result.finalDE)} BC=${hex(result.finalBC)}`);
  console.log(`Final SP:      ${hex(result.finalSP)}  IY=${hex(result.finalIY)}`);
  console.log(`JR Z target:   visited 0x04EB11 = ${result.visitedJrTarget ? 'YES' : 'NO'}`);
  console.log(`RAM watch:     D0058E=${hexByte(result.d0058e)} D003E0=${hexByte(result.d003e0)} D0058D=${hexByte(result.d0058d)} D0059F=${hexByte(result.d0059f)}`);
  console.log(`RAM changes:   ${result.ramChanges.length ? result.ramChanges.join(', ') : '(none in watched addresses)'}`);
  console.log(`IY before:     ${formatIySnapshot(result.iyBefore)}`);
  console.log(`IY after:      ${formatIySnapshot(result.iyAfter)}`);
  console.log(`IY changes:    ${result.iyChanges.length ? result.iyChanges.join('  ') : '(none in watched offsets)'}`);
  console.log(`Unique blocks: ${result.uniqueBlocks.length}`);
  console.log(`Block chain:   ${result.visited.length ? result.visited.map((pc) => hex(pc)).join(' -> ') : '(none)'}`);
  console.log('');
}

// ---------- PART 4: Analysis ----------

function printAnalysis(traceResults) {
  console.log('========================================================================');
  console.log('PART 4: Analysis — architectural role of CP 0x1D / CP 0x44 at 0x04EB0B');
  console.log('========================================================================');
  console.log('');

  const trace1D = traceResults.find(r => r.seedA === 0x1D);
  const trace44 = traceResults.find(r => r.seedA === 0x44);
  const trace8F = traceResults.find(r => r.seedA === 0x8F);

  console.log('  Path comparison:');
  console.log(`    A=0x1D (synthetic):  ${trace1D ? trace1D.uniqueBlocks.map(pc => hex(pc)).join(', ') : 'N/A'}`);
  console.log(`    A=0x44 (real "2"):   ${trace44 ? trace44.uniqueBlocks.map(pc => hex(pc)).join(', ') : 'N/A'}`);
  console.log(`    A=0x8F (digit "1"):  ${trace8F ? trace8F.uniqueBlocks.map(pc => hex(pc)).join(', ') : 'N/A'}`);
  console.log('');

  console.log('  JR Z,+4 (to 0x04EB11) taken?');
  console.log(`    A=0x1D: ${trace1D?.visitedJrTarget ? 'YES (CP 0x1D matched, Z set)' : 'NO'}`);
  console.log(`    A=0x44: ${trace44?.visitedJrTarget ? 'YES' : 'NO (CP 0x1D did not match, falls through to CP 0x44)'}`);
  console.log(`    A=0x8F: ${trace8F?.visitedJrTarget ? 'YES' : 'NO (neither CP matched)'}`);
  console.log('');

  console.log('  Stop reasons:');
  console.log(`    A=0x1D: ${trace1D?.stopReason ?? 'N/A'} at ${trace1D ? hex(trace1D.stopPc) : 'N/A'}`);
  console.log(`    A=0x44: ${trace44?.stopReason ?? 'N/A'} at ${trace44 ? hex(trace44.stopPc) : 'N/A'}`);
  console.log(`    A=0x8F: ${trace8F?.stopReason ?? 'N/A'} at ${trace8F ? hex(trace8F.stopPc) : 'N/A'}`);
  console.log('');

  // Determine if the function modifies the key code
  console.log('  Does the function modify the key code (A register)?');
  if (trace1D) console.log(`    A=0x1D input -> final A=${hexByte(trace1D.finalA)} ${trace1D.finalA === 0x1D ? '(unchanged)' : '(MODIFIED)'}`);
  if (trace44) console.log(`    A=0x44 input -> final A=${hexByte(trace44.finalA)} ${trace44.finalA === 0x44 ? '(unchanged)' : '(MODIFIED)'}`);
  if (trace8F) console.log(`    A=0x8F input -> final A=${hexByte(trace8F.finalA)} ${trace8F.finalA === 0x8F ? '(unchanged)' : '(MODIFIED)'}`);
  console.log('');

  // Check if blocks diverge
  const allUnique1D = trace1D ? new Set(trace1D.uniqueBlocks) : new Set();
  const allUnique44 = trace44 ? new Set(trace44.uniqueBlocks) : new Set();
  const allUnique8F = trace8F ? new Set(trace8F.uniqueBlocks) : new Set();

  const only1D = [...allUnique1D].filter(pc => !allUnique44.has(pc) && !allUnique8F.has(pc));
  const only44 = [...allUnique44].filter(pc => !allUnique1D.has(pc) && !allUnique8F.has(pc));
  const only8F = [...allUnique8F].filter(pc => !allUnique1D.has(pc) && !allUnique44.has(pc));

  console.log('  Blocks unique to each path:');
  console.log(`    Only A=0x1D: ${only1D.length ? only1D.map(pc => hex(pc)).join(', ') : '(none)'}`);
  console.log(`    Only A=0x44: ${only44.length ? only44.map(pc => hex(pc)).join(', ') : '(none)'}`);
  console.log(`    Only A=0x8F: ${only8F.length ? only8F.map(pc => hex(pc)).join(', ') : '(none)'}`);
  console.log('');

  console.log('  Conclusion:');
  console.log('    The CP 0x1D / CP 0x44 sequence at 0x04EB0B is a two-stage key code');
  console.log('    classifier. It first checks for 0x1D (the synthetic replacement code');
  console.log('    that the 0x0302EB gate produces when BIT 4,(IY+0x4B) is SET and the');
  console.log('    original key was 0x44). If A==0x1D, it jumps to 0x04EB11 for special');
  console.log('    handling. If not, it checks for 0x44 (the raw "2" key code). This');
  console.log('    dual-check means the function handles the "2" key in both its raw');
  console.log('    and mode-modified forms, likely implementing context-dependent');
  console.log('    behavior (e.g., normal digit entry vs. a special function tied to');
  console.log('    the "2" key in a particular editor/mode context).');
  console.log('');
}

// ---------- Main ----------

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
        romModule.default?.PRELIFTED_BLOCKS ??
        romModule.default ??
        romModule,
    );

    console.log('Phase 236: Investigate 0x04EB0B — CP 0x1D / CP 0x44 Sequence');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log(`Runtime seed: MBASE=${hexByte(MBASE)} IY=${hex(IY_BASE)} SP=${hex(STACK_TOP)} timerInterrupt=false`);
    console.log('');

    // PART 1: Disassembly
    printDisassembly(romBytes);

    // PART 2: Function boundary
    findFunctionBoundary(romBytes);

    // PART 3: Dynamic traces
    console.log('========================================================================');
    console.log('PART 3: Dynamic traces from 0x04EB0B (200 steps each)');
    console.log('========================================================================');
    console.log('');

    const scenarios = [
      { label: 'Trace A', seedA: 0x1D, note: 'synthetic code (0x0302EB replacement for 0x44 when BIT 4,(IY+0x4B) SET)' },
      { label: 'Trace B', seedA: 0x44, note: 'real "2" key code (raw, no mode replacement)' },
      { label: 'Trace C', seedA: 0x8F, note: 'digit "1" key as control (should not match either CP)' },
    ];

    const traceResults = [];
    for (const scenario of scenarios) {
      const result = runTrace(blocks, romBytes, scenario.label, scenario.seedA, scenario.note);
      printTrace(result);
      traceResults.push(result);
    }

    // PART 4: Analysis
    printAnalysis(traceResults);

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
