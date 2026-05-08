#!/usr/bin/env node
// Phase 246 — Trace 0x0271CD (D02A86 counter setter)
// WHO calls 0x0271CD and WHAT determines the counter value (register A at entry).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const TARGET_ADDR = 0x0271CD;
const D02A86 = 0xD02A86;
const IY_ADDR = 0xD00080;
const MBASE = 0xD0;
const STACK_RESET_TOP = 0xD1A87E;
const SENTINEL = 0x7FFFFE;

// Boot sequence constants (from probe-phase99d)
const BOOT_ENTRY = 0x000000;
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

function hex(v, w = 6) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  return '0x' + (Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return hex((v ?? 0) & 0xFF, 2);
}

function bytesFor(buf, start, length) {
  return Array.from(buf.slice(start, start + length), v =>
    v.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister.toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${inst.condition.toUpperCase()}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'push':
      return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop':
      return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm':
      return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-sp-pair':
      return `LD SP, ${inst.pair.toUpperCase()}`;
    case 'ld-ind-reg':
      return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'add-pair':
      return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'lea':
      return `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'alu-imm':
      return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${inst.op.toUpperCase()} ${inst.src === '(hl)' ? '(HL)' : inst.src.toUpperCase()}`;
    case 'rotate-reg':
      return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'inc-reg':
      return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair':
      return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${inst.pair.toUpperCase()}`;
    case 'xor':
      return `XOR ${inst.src ? inst.src.toUpperCase() : 'A'}`;
    case 'or':
      return `OR ${inst.src ? inst.src.toUpperCase() : 'A'}`;
    case 'and':
      return `AND ${inst.src ? inst.src.toUpperCase() : 'A'}`;
    case 'cp':
      return `CP ${inst.src ? inst.src.toUpperCase() : hexByte(inst.value)}`;
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'ex':
      return `EX ${inst.pair?.toUpperCase() ?? ''}`;
    case 'exx':
      return 'EXX';
    case 'rst':
      return `RST ${hex(inst.target)}`;
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'neg':
      return 'NEG';
    case 'cpl':
      return 'CPL';
    case 'scf':
      return 'SCF';
    case 'ccf':
      return 'CCF';
    case 'rla':
      return 'RLA';
    case 'rra':
      return 'RRA';
    case 'rlca':
      return 'RLCA';
    case 'rrca':
      return 'RRCA';
    case 'im':
      return `IM ${inst.mode}`;
    case 'out':
      return `OUT (${hexByte(inst.port)}), A`;
    case 'in':
      return `IN A, (${hexByte(inst.port)})`;
    default:
      return inst.tag;
  }
}

function decodeRange(rom, startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;

  while (pc < (endPc & 0xFFFFFF)) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      rows.push({
        pc: inst.pc >>> 0,
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        length: inst.length,
        inst,
      });
      pc = inst.nextPc & 0xFFFFFF;
    } catch (e) {
      rows.push({
        pc,
        bytes: bytesFor(rom, pc, 1),
        text: `decode-error: ${e.message}`,
        tag: 'decode-error',
        length: 1,
        inst: null,
      });
      pc = (pc + 1) & 0xFFFFFF;
    }
  }

  return rows;
}

function printRows(rows, markers = new Map()) {
  for (const row of rows) {
    const marker = markers.get(row.pc) ?? '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${marker ? `  ${marker}` : ''}`);
  }
}

// Scan the entire ROM for CALL/JP instructions targeting a given address.
// Covers unconditional and conditional variants.
function scanCallers(romBytes, target, scanEnd = 0x400000) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;

  // eZ80 ADL CALL nn = opcode + 3-byte address (little-endian)
  // CALL variants: CD (unconditional), C4 NZ, CC Z, D4 NC, DC C, E4 PO, EC PE, F4 P, FC M
  // JP variants:   C3 (unconditional), C2 NZ, CA Z, D2 NC, DA C, E2 PO, EA PE, F2 P, FA M
  const CALL_JP = new Set([
    0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC,
    0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA,
  ]);
  const NAMES = new Map([
    [0xCD, 'CALL'], [0xC4, 'CALL NZ'], [0xCC, 'CALL Z'],
    [0xD4, 'CALL NC'], [0xDC, 'CALL C'], [0xE4, 'CALL PO'],
    [0xEC, 'CALL PE'], [0xF4, 'CALL P'], [0xFC, 'CALL M'],
    [0xC3, 'JP'], [0xC2, 'JP NZ'], [0xCA, 'JP Z'],
    [0xD2, 'JP NC'], [0xDA, 'JP C'], [0xE2, 'JP PO'],
    [0xEA, 'JP PE'], [0xF2, 'JP P'], [0xFA, 'JP M'],
  ]);

  const found = [];

  for (let addr = 0; addr < scanEnd - 3; addr++) {
    const op = romBytes[addr];
    if (!CALL_JP.has(op)) continue;
    if (romBytes[addr + 1] === lo &&
        romBytes[addr + 2] === mid &&
        romBytes[addr + 3] === hi) {
      found.push({ addr, type: NAMES.get(op), opcode: op });
    }
  }

  return found;
}

// Scan ROM for 3-byte little-endian address references (jump table entries)
function scanJumpTableRefs(romBytes, target, scanEnd = 0x400000) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;

  const found = [];

  for (let addr = 0; addr < scanEnd - 2; addr++) {
    if (romBytes[addr] === lo &&
        romBytes[addr + 1] === mid &&
        romBytes[addr + 2] === hi) {
      // Exclude the CALL/JP instruction matches (already covered)
      if (addr > 0) {
        const prevByte = romBytes[addr - 1];
        const CALL_JP = new Set([
          0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC,
          0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA,
        ]);
        if (CALL_JP.has(prevByte)) continue;
      }
      found.push({ addr });
    }
  }

  return found;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { source: 'js', modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase246-caller-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { source: 'gz', modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function coldBoot(executor, cpu, mem, romBytes) {
  const result = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map(f => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);

  console.log('=== Phase 246: 0x0271CD (D02A86 counter setter) caller trace ===');
  console.log(`Target address: ${hex(TARGET_ADDR)}`);
  console.log(`D02A86 address: ${hex(D02A86)}`);
  console.log('');

  // ============================================================
  // STEP 1: Static scan — find all CALL/JP instructions targeting 0x0271CD
  // ============================================================
  console.log('=== STEP 1: Static Scan for CALL/JP to 0x0271CD ===');
  console.log('');

  const callSites = scanCallers(romBytes, TARGET_ADDR);

  if (callSites.length === 0) {
    console.log('  No CALL/JP instructions found targeting 0x0271CD.');
  } else {
    console.log(`  Found ${callSites.length} CALL/JP site(s):`);
    for (const site of callSites) {
      console.log(`    ${hex(site.addr)}: ${site.type} ${hex(TARGET_ADDR)}  [bytes: ${bytesFor(romBytes, site.addr, 4)}]`);
    }
  }

  console.log('');

  // Also scan for RST vectors / jump table entries
  console.log('  Scanning for jump-table references (3-byte LE address 0x0271CD in data)...');
  const jtRefs = scanJumpTableRefs(romBytes, TARGET_ADDR);
  if (jtRefs.length === 0) {
    console.log('  No jump-table references found.');
  } else {
    console.log(`  Found ${jtRefs.length} possible jump-table entry(ies):`);
    for (const ref of jtRefs) {
      // Show context: 3 bytes before and 6 bytes after
      console.log(`    ${hex(ref.addr)}: context [${bytesFor(romBytes, Math.max(0, ref.addr - 3), 9)}]`);
    }
  }

  console.log('');

  // ============================================================
  // STEP 2: Static disassembly of the parent function
  // ============================================================
  console.log('=== STEP 2: Parent Function Disassembly ===');
  console.log('');

  // Scan backwards from 0x0271CD for RET (0xC9) or unconditional JP (0xC3) to find function boundary
  console.log('  Scanning backwards from 0x0271CD for function entry...');
  let funcEntry = null;

  for (let addr = TARGET_ADDR - 1; addr >= TARGET_ADDR - 0x80; addr--) {
    if (romBytes[addr] === 0xC9) {
      // Verify it looks like a RET by decoding
      funcEntry = addr + 1;
      console.log(`  Found RET at ${hex(addr)}, function entry candidate: ${hex(funcEntry)}`);
      break;
    }
  }

  if (!funcEntry) {
    console.log('  No RET found in 128 bytes before target. Trying wider search...');
    for (let addr = TARGET_ADDR - 1; addr >= TARGET_ADDR - 0x200; addr--) {
      if (romBytes[addr] === 0xC9) {
        funcEntry = addr + 1;
        console.log(`  Found RET at ${hex(addr)}, function entry candidate: ${hex(funcEntry)}`);
        break;
      }
    }
  }

  if (!funcEntry) {
    funcEntry = TARGET_ADDR - 0x40;
    console.log(`  Fallback: using ${hex(funcEntry)} as start of disassembly range.`);
  }

  // Scan forward from 0x0271CD to find the function end (next RET)
  let funcEnd = TARGET_ADDR + 0x80;
  for (let addr = TARGET_ADDR; addr < TARGET_ADDR + 0x100; addr++) {
    if (romBytes[addr] === 0xC9) {
      funcEnd = addr + 1;
      break;
    }
  }

  console.log(`  Disassembly range: ${hex(funcEntry)} to ${hex(funcEnd)}`);
  console.log('');

  const parentRows = decodeRange(romBytes, funcEntry, funcEnd);
  const markers = new Map([
    [TARGET_ADDR, '<== TARGET: 0x0271CD (D02A86 counter setter)'],
  ]);

  // Mark key instructions
  for (const row of parentRows) {
    if (row.tag === 'ret' && !markers.has(row.pc)) {
      markers.set(row.pc, '<-- RET');
    }
    if (row.tag === 'call' || row.tag === 'call-conditional') {
      if (!markers.has(row.pc)) {
        markers.set(row.pc, `<-- ${row.text}`);
      }
    }
  }

  printRows(parentRows, markers);
  console.log('');

  // Check who calls funcEntry
  console.log('  Callers of function entry:');
  const entryCallers = scanCallers(romBytes, funcEntry);
  if (entryCallers.length === 0) {
    console.log(`    No CALL/JP to ${hex(funcEntry)} found — may be reached by fall-through.`);
  } else {
    for (const c of entryCallers) {
      console.log(`    ${hex(c.addr)}: ${c.type} ${hex(funcEntry)}`);
    }
  }
  console.log('');

  // For each call site from STEP 1, show context (5 instructions before)
  if (callSites.length > 0) {
    console.log('  Context around each call site:');
    for (const site of callSites) {
      console.log('');
      console.log(`  --- Call site at ${hex(site.addr)}: ${site.type} ---`);
      const contextStart = Math.max(0, site.addr - 30);
      const contextEnd = site.addr + 8;
      const contextRows = decodeRange(romBytes, contextStart, contextEnd);
      const siteMarkers = new Map([
        [site.addr, `<== ${site.type} ${hex(TARGET_ADDR)}`],
      ]);
      printRows(contextRows, siteMarkers);
    }
    console.log('');
  }

  // ============================================================
  // STEP 3: Dynamic trace from 0x0271CD entry
  // ============================================================
  console.log('=== STEP 3: Dynamic Trace from 0x0271CD ===');
  console.log('');

  const transpiledAssets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(transpiledAssets.modulePath).href);
    const blocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      null;

    if (!blocks || typeof blocks !== 'object') {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }

    console.log(`  Transpiled source: ${transpiledAssets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz (temp gunzip)'}`);
    console.log('');

    // ---- 3a: Warm boot to get realistic memory state ----
    console.log('  --- 3a: Cold boot + home screen stages for warm state ---');

    const warmMem = new Uint8Array(MEM_SIZE);
    warmMem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
    // Clear VRAM
    warmMem.fill(0xAA, 0xD40000, 0xD40000 + 320 * 240 * 2);

    const warmPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const warmExecutor = createExecutor(blocks, warmMem, { peripherals: warmPeripherals });
    const warmCpu = warmExecutor.cpu;

    const bootResult = coldBoot(warmExecutor, warmCpu, warmMem, romBytes);
    console.log(`  Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

    const cpuSnap = snapshotCpu(warmCpu);
    const ramSnap = new Uint8Array(warmMem.slice(0x400000, 0xE00000));

    // Run stages 1-4
    for (const [label, entry, maxSteps] of [
      ['stage1', STAGE_1_ENTRY, 30000],
      ['stage2', STAGE_2_ENTRY, 30000],
      ['stage3', STAGE_3_ENTRY, 50000],
      ['stage4', STAGE_4_ENTRY, 50000],
    ]) {
      restoreCpu(warmCpu, cpuSnap);
      const r = warmExecutor.runFrom(entry, 'adl', { maxSteps, maxLoopIterations: 500 });
      console.log(`  ${label}: steps=${r.steps} term=${r.termination}`);
    }

    console.log(`  D02A86 after boot+stages: ${hexByte(warmMem[D02A86])}`);
    console.log('');

    // ---- 3b: Dynamic trace from 0x0271CD with A=0x03 ----
    function runDynamicTrace(label, entryPc, aValue, baseMem, baseSnap) {
      const mem = new Uint8Array(MEM_SIZE);
      mem.set(baseMem);
      const peripherals = createPeripheralBus({ timerInterrupt: false });
      const executor = createExecutor(blocks, mem, { peripherals });
      const cpu = executor.cpu;

      // Restore warm state
      for (const [f, v] of Object.entries(baseSnap)) {
        cpu[f] = v;
      }
      cpu.a = aValue & 0xFF;
      cpu.f = 0x40; // Z flag set initially
      cpu.madl = 1;
      cpu.mbase = MBASE;
      cpu._iy = IY_ADDR;
      cpu._ix = 0xD1A860;
      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.sp = STACK_RESET_TOP - 12;
      mem.fill(0xFF, cpu.sp, cpu.sp + 12);

      // Push sentinel return
      cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
      write24(mem, cpu.sp, SENTINEL);

      // Record D02A86 before
      const d02a86Before = mem[D02A86];

      // Track blocks, memory writes, CALL/RET pairs
      const blocksVisited = [];
      const memWrites = [];
      const callRetPairs = [];

      const origWrite8 = cpu.write8.bind(cpu);
      cpu.write8 = (addr, value) => {
        const a = addr & 0xFFFFFF;
        if (a >= 0x400000) { // only track RAM writes
          const old = mem[a];
          origWrite8(addr, value);
          if (memWrites.length < 200) {
            memWrites.push({ addr: a, old, new: mem[a] });
          }
        } else {
          origWrite8(addr, value);
        }
      };

      let stopped = false;
      let stopPc = null;
      let stepCount = 0;

      try {
        const trace = executor.runFrom(entryPc, 'adl', {
          maxSteps: 500,
          maxLoopIterations: 50,
          onBlock(pc) {
            const norm = pc & 0xFFFFFF;
            stepCount++;
            if (blocksVisited.length < 500) {
              blocksVisited.push(norm);
            }
            if (norm === SENTINEL) {
              const err = new Error('__STOP__');
              err.stopPc = norm;
              throw err;
            }
          },
        });
        stopPc = trace.lastPc;
      } catch (e) {
        if (e.stopPc !== undefined) {
          stopPc = e.stopPc;
          stopped = true;
        } else {
          console.log(`    Error: ${e.message}`);
          return;
        }
      }

      const d02a86After = mem[D02A86];

      console.log(`  --- ${label} ---`);
      console.log(`    Entry: ${hex(entryPc)}, A=${hexByte(aValue)}`);
      console.log(`    Stop PC: ${hex(stopPc)}${stopped && stopPc === SENTINEL ? ' (sentinel return)' : ''}`);
      console.log(`    Blocks visited (${blocksVisited.length}):`);

      // Print blocks in groups of 8
      for (let i = 0; i < blocksVisited.length; i += 8) {
        const chunk = blocksVisited.slice(i, i + 8).map(pc => hex(pc));
        console.log(`      ${chunk.join(' -> ')}`);
      }

      console.log(`    D02A86: before=${hexByte(d02a86Before)} after=${hexByte(d02a86After)}`);
      console.log(`    Final CPU: A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} HL=${hex(cpu._hl)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)}`);

      // Show memory writes to D02A86 specifically
      const d02a86Writes = memWrites.filter(w => w.addr === D02A86);
      if (d02a86Writes.length > 0) {
        console.log(`    D02A86 writes:`);
        for (const w of d02a86Writes) {
          console.log(`      old=${hexByte(w.old)} new=${hexByte(w.new)}`);
        }
      }

      // Show other interesting writes
      const otherWrites = memWrites.filter(w => w.addr !== D02A86 && w.old !== w.new);
      if (otherWrites.length > 0) {
        console.log(`    Other memory changes (${otherWrites.length}):`);
        for (const w of otherWrites.slice(0, 30)) {
          console.log(`      ${hex(w.addr)}: ${hexByte(w.old)} -> ${hexByte(w.new)}`);
        }
        if (otherWrites.length > 30) {
          console.log(`      ... and ${otherWrites.length - 30} more`);
        }
      }

      console.log('');
      return { blocksVisited, memWrites, stopPc, d02a86Before, d02a86After };
    }

    console.log('  --- 3b: Dynamic trace from 0x0271CD with various A values ---');
    console.log('');

    runDynamicTrace('A=0x03 (counter=3)', TARGET_ADDR, 0x03, warmMem, cpuSnap);
    runDynamicTrace('A=0x02 (counter=2, boundary)', TARGET_ADDR, 0x02, warmMem, cpuSnap);
    runDynamicTrace('A=0x01 (counter=1, below gate)', TARGET_ADDR, 0x01, warmMem, cpuSnap);
    runDynamicTrace('A=0x05 (counter=5)', TARGET_ADDR, 0x05, warmMem, cpuSnap);
    runDynamicTrace('A=0x00 (counter=0)', TARGET_ADDR, 0x00, warmMem, cpuSnap);

    // ============================================================
    // STEP 4: Cross-reference callers dynamically
    // ============================================================
    console.log('=== STEP 4: Dynamic Cross-Reference of Callers ===');
    console.log('');

    if (callSites.length === 0) {
      console.log('  No static call sites found, skipping dynamic cross-reference.');
      console.log('  Checking if 0x0271CD is reached by fall-through from prior code...');
      console.log('');

      // Try running from funcEntry with various A values
      if (funcEntry && funcEntry < TARGET_ADDR) {
        console.log(`  Tracing from function entry ${hex(funcEntry)}:`);
        console.log('');
        for (const aVal of [0x00, 0x01, 0x02, 0x03, 0x05, 0x0A]) {
          runDynamicTrace(
            `funcEntry A=${hexByte(aVal)}`,
            funcEntry, aVal, warmMem, cpuSnap
          );
        }
      }
    } else {
      for (const site of callSites) {
        console.log(`  --- Caller at ${hex(site.addr)}: ${site.type} ---`);
        console.log('');

        // Find the function containing this call site (scan backward for RET)
        let callerFuncEntry = site.addr;
        for (let addr = site.addr - 1; addr >= site.addr - 0x80; addr--) {
          if (romBytes[addr] === 0xC9) {
            callerFuncEntry = addr + 1;
            break;
          }
        }

        // Run 50 steps from the caller's address to see what A value it passes
        for (const aVal of [0x00, 0x02, 0x03, 0x05]) {
          const mem = new Uint8Array(MEM_SIZE);
          mem.set(warmMem);
          const peripherals = createPeripheralBus({ timerInterrupt: false });
          const executor = createExecutor(blocks, mem, { peripherals });
          const cpu = executor.cpu;

          for (const [f, v] of Object.entries(cpuSnap)) {
            cpu[f] = v;
          }
          cpu.a = aVal & 0xFF;
          cpu.f = 0x40;
          cpu.madl = 1;
          cpu.mbase = MBASE;
          cpu._iy = IY_ADDR;
          cpu._ix = 0xD1A860;
          cpu.halted = false;
          cpu.iff1 = 0;
          cpu.iff2 = 0;
          cpu.sp = STACK_RESET_TOP - 12;
          mem.fill(0xFF, cpu.sp, cpu.sp + 12);
          cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
          write24(mem, cpu.sp, SENTINEL);

          const visited = [];
          let aAtTarget = null;
          let reachedTarget = false;

          try {
            executor.runFrom(site.addr, 'adl', {
              maxSteps: 50,
              maxLoopIterations: 32,
              onBlock(pc) {
                const norm = pc & 0xFFFFFF;
                if (visited.length < 50) visited.push(norm);
                if (norm === TARGET_ADDR) {
                  aAtTarget = cpu.a;
                  reachedTarget = true;
                  const err = new Error('__STOP__');
                  err.stopPc = norm;
                  throw err;
                }
                if (norm === SENTINEL) {
                  const err = new Error('__STOP__');
                  err.stopPc = norm;
                  throw err;
                }
              },
            });
          } catch (e) {
            if (!e.stopPc && e.stopPc !== 0) {
              console.log(`    A=${hexByte(aVal)}: error: ${e.message}`);
              continue;
            }
          }

          if (reachedTarget) {
            console.log(`    Caller A=${hexByte(aVal)}: reached 0x0271CD with A=${hexByte(aAtTarget)} (blocks: ${visited.map(pc => hex(pc)).join(' -> ')})`);
          } else {
            console.log(`    Caller A=${hexByte(aVal)}: did NOT reach 0x0271CD (blocks: ${visited.map(pc => hex(pc)).join(' -> ')})`);
          }
        }

        console.log('');
      }
    }

    // ============================================================
    // STEP 5: Broader parent-function caller trace
    // ============================================================
    console.log('=== STEP 5: Who Calls the Parent Function? ===');
    console.log('');

    // Also scan for references to the parent function entry
    if (funcEntry) {
      const parentCallers = scanCallers(romBytes, funcEntry);
      if (parentCallers.length > 0) {
        console.log(`  Callers of parent function at ${hex(funcEntry)} (${parentCallers.length}):`);
        for (const pc of parentCallers) {
          console.log(`    ${hex(pc.addr)}: ${pc.type} ${hex(funcEntry)}`);

          // Show 15 bytes before each caller for context
          const contextRows = decodeRange(romBytes, Math.max(0, pc.addr - 15), pc.addr + 4);
          printRows(contextRows);
          console.log('');
        }
      } else {
        console.log(`  No direct callers found for ${hex(funcEntry)}.`);
        console.log('  It may be reached by fall-through or an indirect jump.');
      }
    }

    console.log('');

    // ============================================================
    // STEP 6: Summary
    // ============================================================
    console.log('=== STEP 6: Summary ===');
    console.log('');
    console.log(`  Target: ${hex(TARGET_ADDR)} (D02A86 counter setter)`);
    console.log(`  Parent function entry: ${hex(funcEntry)}`);
    console.log(`  Static CALL/JP sites to 0x0271CD: ${callSites.length}`);
    for (const site of callSites) {
      console.log(`    ${hex(site.addr)}: ${site.type}`);
    }
    console.log(`  Jump-table references: ${jtRefs.length}`);
    console.log('');

  } finally {
    cleanupTranspiledModule(transpiledAssets);
  }
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
