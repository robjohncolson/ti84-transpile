#!/usr/bin/env node

// Phase 216 — Trace 0x079A1E caller chain (BIT 7,(IY+0x18) initial arming)
//
// The SET 7,(IY+0x18) at 0x079A1E is the only non-self-arming site in the ROM.
// This probe:
//   A) Statically disassembles the region around 0x079A1E
//   B) Scans for all CALL/JP references to that region
//   C) Dynamically traces from 0x079A1E with proper gating
//   D) Traces each caller found in Part B

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

// Key addresses
const SET_SITE = 0x079A1E;        // SET 7,(IY+0x18) — initial arming site
const DISASM_START = 0x079A00;
const DISASM_END = 0x079A80;
const DISPATCHER_PC = 0x061290;
const GATE_PC = 0x060048;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const IY_PLUS_18_ADDR = IY_ADDR + 0x18;  // 0xD00098
const IY_MINUS_2_ADDR = IY_ADDR - 0x02;  // 0xD0007E — gate for 0x079A1E

const TRACE_MAX_STEPS = 200;
const CALLER_TRACE_MAX_STEPS = 50;
const MAX_LOOP_ITERATIONS = 8192;
const TRACE_RET_SENTINEL = 0x7FFFFE;

// Boot plan addresses
const BOOT_ENTRY = 0x000000;
const REPO_KERNEL_INIT_ENTRY = 0x08C331;
const REPO_POST_INIT_ENTRY = 0x0802B2;
const REPO_MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

// CALL/JP opcode -> label
const DIRECT24 = new Map([
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'null';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesFor(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function blockKey(addr, mode = 'adl') {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function shouldFallbackToImport(error) {
  if (!error) return false;
  const msg = String(error.message ?? error);
  return (
    error.code === 'ERR_REQUIRE_ESM' ||
    error.code === 'ERR_REQUIRE_ASYNC_MODULE' ||
    error.name === 'SyntaxError' ||
    /Cannot use import statement/i.test(msg) ||
    /Unexpected token 'export'/i.test(msg) ||
    /Must use import to load ES Module/i.test(msg)
  );
}

async function loadLocalModule(relativePath) {
  const absolutePath = path.join(__dirname, relativePath);
  try {
    return require(absolutePath);
  } catch (error) {
    if (!shouldFallbackToImport(error)) throw error;
    return import(pathToFileURL(absolutePath).href);
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

// ---- Load modules ----
const rom = fs.readFileSync(ROM_PATH);
const { decodeInstruction } = await loadLocalModule('./ez80-decoder.js');
const { createExecutor } = await loadLocalModule('./cpu-runtime.js');
const { createPeripheralBus } = await loadLocalModule('./peripherals.js');
const romModule = await loadLocalModule('./ROM.transpiled.js');
const BLOCKS = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? {},
);

function hasBlock(addr, mode = 'adl') {
  return Boolean(BLOCKS[blockKey(addr, mode)]);
}

// ---- Decoder helpers ----
function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const disp = (v) => (v >= 0 ? `+${v}` : `${v}`);
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti': return `${prefix}RETI`;
    case 'retn': return `${prefix}RETN`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-pair': return `${prefix}LD (${hex(resolveMemAddr(inst))}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(resolveMemAddr(inst))}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'indexed-cb-bit': return `${prefix}BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'bit-test-ind': return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'cp-reg': return `${prefix}CP ${String(inst.src).toUpperCase()}`;
    case 'cp-imm': return `${prefix}CP ${hexByte(inst.value)}`;
    case 'nop': return `${prefix}NOP`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'halt': return `${prefix}HALT`;
    case 'ldir': return `${prefix}LDIR`;
    case 'lddr': return `${prefix}LDDR`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    default: return `${prefix}${inst.tag}`;
  }
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc: pc & 0xFFFFFF,
      length: 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
    };
  }
}

function decodeRange(startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  const stop = endPc & 0xFFFFFF;
  while (pc < stop) {
    const inst = decodeSafe(pc);
    rows.push({
      pc: inst.pc >>> 0,
      pcHex: hex(inst.pc),
      bytes: bytesFor(rom, inst.pc, inst.length ?? 1),
      text: inst.tag === 'decode-error' ? `decode-error: ${inst.errorMessage}` : formatInstruction(inst),
      tag: inst.tag,
      length: Math.max(1, inst.length ?? 1),
      target: Number.isInteger(inst.target) ? (inst.target >>> 0) : null,
    });
    pc = (pc + Math.max(1, inst.length ?? 1)) & 0xFFFFFF;
  }
  return rows;
}

function isHardBoundary(inst) {
  return Boolean(inst) && [
    'ret', 'reti', 'retn', 'jp', 'jr', 'jp-indirect', 'halt', 'slp',
  ].includes(inst.tag);
}

// ---- Part A: Find function entry by scanning backwards for RET/JP/JR ----
function findFunctionEntry(targetPc, lookback = 0x80) {
  const floor = Math.max(0, targetPc - lookback);
  let bestEntry = targetPc;
  let bestBoundaryPc = null;
  let bestBoundaryText = null;

  // Scan backwards for hard boundary instructions
  for (let addr = floor; addr < targetPc; addr++) {
    const inst = decodeSafe(addr);
    const len = Math.max(1, inst.length ?? 1);
    const nextPc = (addr + len) & 0xFFFFFF;

    if (isHardBoundary(inst) && nextPc <= targetPc) {
      // Verify linear reachability from nextPc to targetPc
      let pc = nextPc;
      let reachable = true;
      while (pc < targetPc) {
        const i2 = decodeSafe(pc);
        if (i2.tag === 'decode-error') { reachable = false; break; }
        if (isHardBoundary(i2)) { reachable = false; break; }
        pc += Math.max(1, i2.length ?? 1);
      }
      if (reachable && pc === targetPc) {
        // Valid: entry is right after this boundary
        bestEntry = nextPc;
        bestBoundaryPc = addr;
        bestBoundaryText = formatInstruction(inst);
      } else if (reachable) {
        // Could still be valid even if we overshoot slightly
      }
    }
  }

  return { entry: bestEntry, boundaryPc: bestBoundaryPc, boundaryText: bestBoundaryText };
}

// ---- Part B: Scan for CALL/JP to specific addresses ----
function scanCallersOf(targetAddrs) {
  const hits = [];
  const targetSet = new Set(targetAddrs.map((a) => a >>> 0));

  for (let addr = 0; addr <= rom.length - 4; addr++) {
    const label = DIRECT24.get(rom[addr]);
    if (!label) continue;
    const target = (rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16)) >>> 0;
    if (!targetSet.has(target)) continue;

    hits.push({
      from: addr,
      target,
      label,
      bytes: bytesFor(rom, addr, 4),
    });
  }

  // Also scan for JR (relative jumps) within 128 bytes of each target
  for (const target of targetAddrs) {
    for (let offset = -126; offset <= 129; offset++) {
      const addr = target + offset;
      if (addr < 0 || addr >= rom.length - 1) continue;
      const opcode = rom[addr];
      if (opcode !== 0x18 && opcode !== 0x20 && opcode !== 0x28 &&
          opcode !== 0x30 && opcode !== 0x38) continue;
      // JR: signed displacement is relative to (addr + 2)
      const displacement = rom[addr + 1];
      const signed = displacement >= 128 ? displacement - 256 : displacement;
      const jumpTarget = ((addr + 2 + signed) & 0xFFFFFF) >>> 0;
      if (jumpTarget === (target >>> 0)) {
        const jrLabels = {
          0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C',
        };
        hits.push({
          from: addr,
          target: jumpTarget,
          label: jrLabels[opcode],
          bytes: bytesFor(rom, addr, 2),
        });
      }
    }
  }

  return hits.sort((a, b) => a.from - b.from);
}

// ---- Memory + CPU helpers ----
function createMemory() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(MEM_SIZE, rom.length)));
  return mem;
}

function makeCPU(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor, peripherals };
}

function resetOsState(cpu, mem, stackTop = STACK_TOP) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = stackTop;
  const lo = Math.max(0, Math.min(mem.length, stackTop - 0x80));
  const hi = Math.max(0, Math.min(mem.length, stackTop + 0x40));
  mem.fill(0xFF, lo, hi);
}

function buildBaseline() {
  const mem = createMemory();
  const { cpu, executor } = makeCPU(mem);

  cpu.mbase = MBASE;

  // Cold boot
  if (hasBlock(BOOT_ENTRY, 'z80')) {
    executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  }

  // Kernel init
  if (hasBlock(REPO_KERNEL_INIT_ENTRY, 'adl')) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_TOP - 3;
    mem.fill(0xFF, cpu.sp, cpu.sp + 3);
    executor.runFrom(REPO_KERNEL_INIT_ENTRY, 'adl', {
      maxSteps: 2000,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
    });
  }

  // Post init
  if (hasBlock(REPO_POST_INIT_ENTRY, 'adl')) {
    cpu.mbase = MBASE;
    cpu.iy = IY_ADDR;
    cpu.hl = 0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_TOP - 3;
    mem.fill(0xFF, cpu.sp, cpu.sp + 3);
    executor.runFrom(REPO_POST_INIT_ENTRY, 'adl', {
      maxSteps: 100,
      maxLoopIterations: 32,
    });
  }

  // Mem init
  if (hasBlock(REPO_MEM_INIT_ENTRY, 'adl')) {
    resetOsState(cpu, mem, STACK_TOP);
    cpu.sp -= 3;
    write24(mem, cpu.sp, MEM_INIT_RET);
    try {
      executor.runFrom(REPO_MEM_INIT_ENTRY, 'adl', {
        maxSteps: 15000,
        maxLoopIterations: MAX_LOOP_ITERATIONS,
        onMissingBlock(pc) {
          if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
        },
        onBlock(pc) {
          if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
        },
      });
    } catch (e) {
      if (e?.message !== '__MEMINIT_RET__') throw e;
    }
  }

  return new Uint8Array(mem);
}

function traceFrom(baseline, startAddr, maxSteps, label) {
  const mem = new Uint8Array(baseline);
  const { cpu, executor } = makeCPU(mem);

  resetOsState(cpu, mem, STACK_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET_SENTINEL);

  // Set BIT 7,(IY-2) at 0xD0007E — gate for 0x079A1E
  mem[IY_MINUS_2_ADDR] |= 0x80;

  const iy18Before = mem[IY_PLUS_18_ADDR] & 0xFF;

  const events = [];
  const uniqueBlocks = new Set();
  let termination = 'max_steps';

  try {
    executor.runFrom(startAddr, 'adl', {
      maxSteps,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        const iy18Val = mem[IY_PLUS_18_ADDR] & 0xFF;
        events.push({
          step: step + 1,
          kind: 'block',
          pc: hex(pc),
          pcRaw: pc,
          mode,
          iy18: hexByte(iy18Val),
          iy18Raw: iy18Val,
        });
        uniqueBlocks.add(`${hex(pc)}:${mode}`);
      },
      onMissingBlock(pc, mode, step) {
        if ((pc & 0xFFFFFF) === TRACE_RET_SENTINEL) throw new Error('__TRACE_RET__');
        const iy18Val = mem[IY_PLUS_18_ADDR] & 0xFF;
        events.push({
          step: step + 1,
          kind: 'missing',
          pc: hex(pc),
          pcRaw: pc,
          mode,
          iy18: hexByte(iy18Val),
          iy18Raw: iy18Val,
        });
        uniqueBlocks.add(`${hex(pc)}:${mode}`);
      },
    });
  } catch (e) {
    if (e?.message === '__TRACE_RET__') {
      termination = 'returned_to_sentinel';
    } else {
      throw e;
    }
  }

  const iy18After = mem[IY_PLUS_18_ADDR] & 0xFF;

  // Detect when IY+0x18 bit 7 first becomes set
  let bit7ArmStep = null;
  for (let i = 0; i < events.length; i++) {
    if ((events[i].iy18Raw & 0x80) !== 0) {
      bit7ArmStep = events[i].step;
      break;
    }
  }

  return {
    label,
    startAddr: hex(startAddr),
    termination,
    steps: events.length,
    uniqueBlocks: uniqueBlocks.size,
    iy18Before: hexByte(iy18Before),
    iy18After: hexByte(iy18After),
    bit7Armed: (iy18After & 0x80) !== 0,
    bit7ArmStep,
    events,
  };
}

// ==== MAIN ====

function main() {
  console.log('=== Phase 216: 0x079A1E caller chain (BIT 7,(IY+0x18) initial arming) ===');
  console.log();
  console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
  console.log(`SET 7,(IY+0x18) site: ${hex(SET_SITE)}`);
  console.log(`IY base: ${hex(IY_ADDR)}  IY+0x18: ${hex(IY_PLUS_18_ADDR)}`);
  console.log(`IY-2 gate address: ${hex(IY_MINUS_2_ADDR)}`);
  console.log();

  // ---- Part A: Static disassembly ----
  console.log('=== Part A: Static disassembly of 0x079A00-0x079A80 ===');
  console.log();

  // Find function entry
  const funcInfo = findFunctionEntry(SET_SITE, 0x80);
  console.log(`Likely function entry: ${hex(funcInfo.entry)}`);
  console.log(`Boundary instruction: ${funcInfo.boundaryText ?? 'none'} at ${hex(funcInfo.boundaryPc)}`);
  console.log();

  // Disassemble the region
  const disasmRows = decodeRange(DISASM_START, DISASM_END);
  console.log(`Disassembly ${hex(DISASM_START)} - ${hex(DISASM_END)}:`);
  for (const row of disasmRows) {
    const marker = row.pc === SET_SITE ? '=>' : '  ';
    const entryMark = row.pc === funcInfo.entry ? ' [ENTRY]' : '';
    console.log(`${marker} ${row.pcHex}  ${row.bytes.padEnd(18)}  ${row.text}${entryMark}`);
  }
  console.log();

  // Verify the SET 7,(IY+0x18) bytes at 0x079A1E
  const setBytes = bytesFor(rom, SET_SITE, 4);
  console.log(`Bytes at ${hex(SET_SITE)}: ${setBytes}`);
  console.log(`Expected FD CB 18 FE: ${setBytes === 'FD CB 18 FE' ? 'MATCH' : 'MISMATCH'}`);
  console.log();

  // ---- Part B: Static caller scan ----
  console.log('=== Part B: Static caller scan ===');
  console.log();

  // Scan for callers of both the SET site and the function entry
  const targetAddrs = [SET_SITE, funcInfo.entry];
  if (funcInfo.entry !== SET_SITE) {
    console.log(`Scanning for CALL/JP/JR to ${hex(SET_SITE)} and ${hex(funcInfo.entry)}:`);
  } else {
    console.log(`Scanning for CALL/JP/JR to ${hex(SET_SITE)}:`);
  }

  const callers = scanCallersOf(targetAddrs);
  if (callers.length === 0) {
    console.log('  No direct CALL/JP/JR callers found in ROM.');
  } else {
    for (const c of callers) {
      const inst = decodeSafe(c.from);
      const context = inst.tag !== 'decode-error' ? formatInstruction(inst) : c.label;
      console.log(`  ${hex(c.from)}  ${c.bytes.padEnd(14)}  ${c.label} -> ${hex(c.target)}  (decoded: ${context})`);
    }
  }
  console.log();

  // Also scan broader: the function may be part of a bigger function.
  // Scan for callers within a wider entry range
  // First, find the REAL function entry by scanning much further back
  console.log('--- Extended function boundary search ---');
  console.log();

  // Scan back further to find a wider function boundary
  const extFuncInfo = findFunctionEntry(SET_SITE, 0x200);
  console.log(`Extended lookback function entry: ${hex(extFuncInfo.entry)}`);
  console.log(`Extended boundary: ${extFuncInfo.boundaryText ?? 'none'} at ${hex(extFuncInfo.boundaryPc)}`);
  console.log();

  // Disassemble from extended entry to SET site + 0x10
  if (extFuncInfo.entry < funcInfo.entry) {
    const extDisasm = decodeRange(extFuncInfo.entry, SET_SITE + 0x10);
    console.log(`Extended disassembly ${hex(extFuncInfo.entry)} - ${hex(SET_SITE + 0x10)}:`);
    for (const row of extDisasm) {
      const marker = row.pc === SET_SITE ? '=>' : '  ';
      const entryMark = row.pc === extFuncInfo.entry ? ' [EXT-ENTRY]' : '';
      console.log(`${marker} ${row.pcHex}  ${row.bytes.padEnd(18)}  ${row.text}${entryMark}`);
    }
    console.log();
  }

  // Now scan for callers to the extended entry and other potential entry points
  const widerTargets = new Set();
  // Add the extended entry
  widerTargets.add(extFuncInfo.entry);
  // Scan for any address in the 0x0798xx-0x079Axx range that has a CALL/JP to it
  // by iterating every possible 3-byte little-endian target in ROM
  const wideCallerRange = { start: 0x079800, end: 0x079A30 };
  const wideTargetArray = [];
  for (let addr = wideCallerRange.start; addr <= wideCallerRange.end; addr++) {
    wideTargetArray.push(addr);
  }
  const wideCallers = scanCallersOf(wideTargetArray);

  if (wideCallers.length > 0) {
    console.log(`Callers into range ${hex(wideCallerRange.start)}-${hex(wideCallerRange.end)}:`);
    for (const c of wideCallers.slice(0, 40)) {
      const inst = decodeSafe(c.from);
      const context = inst.tag !== 'decode-error' ? formatInstruction(inst) : c.label;
      console.log(`  ${hex(c.from)}  ${c.bytes.padEnd(14)}  ${c.label} -> ${hex(c.target)}  (${context})`);
    }
    console.log();
  } else {
    console.log(`No callers found into ${hex(wideCallerRange.start)}-${hex(wideCallerRange.end)}.`);
    console.log();
  }

  // Also look for callers of the containing block that leads to this code
  // The disassembly shows 0x079A00 has JR NZ,0x079A26 -- so something falls through to 0x079A00
  // Let's look for callers to 0x0799xx range
  const outerRange = { start: 0x079880, end: 0x079A00 };
  const outerTargets = [];
  for (let addr = outerRange.start; addr <= outerRange.end; addr++) {
    outerTargets.push(addr);
  }
  const outerCallers = scanCallersOf(outerTargets);

  if (outerCallers.length > 0) {
    // Only show callers from OUTSIDE the range
    const externalCallers = outerCallers.filter(
      (c) => c.from < outerRange.start || c.from > outerRange.end + 0x100,
    );
    if (externalCallers.length > 0) {
      console.log(`External callers into ${hex(outerRange.start)}-${hex(outerRange.end)}:`);
      for (const c of externalCallers.slice(0, 30)) {
        console.log(`  ${hex(c.from)}  ${c.bytes.padEnd(14)}  ${c.label} -> ${hex(c.target)}`);
      }
      console.log();
    }
  }

  // ---- Part C: Dynamic trace from 0x079A1E ----
  console.log('=== Part C: Dynamic trace from 0x079A1E (200 steps) ===');
  console.log();

  console.log('Building baseline (boot + kernel init + mem init)...');
  const baseline = buildBaseline();
  console.log('Baseline built.');
  console.log(`Baseline IY+0x18 value: ${hexByte(baseline[IY_PLUS_18_ADDR])}`);
  console.log(`Baseline IY-2 value: ${hexByte(baseline[IY_MINUS_2_ADDR])}`);
  console.log();

  // Trace from the SET site itself
  const traceC = traceFrom(baseline, SET_SITE, TRACE_MAX_STEPS, 'SET site direct');
  console.log(`Trace from ${traceC.startAddr}:`);
  console.log(`  Termination: ${traceC.termination}`);
  console.log(`  Steps: ${traceC.steps}`);
  console.log(`  Unique blocks: ${traceC.uniqueBlocks}`);
  console.log(`  IY+0x18 before: ${traceC.iy18Before}`);
  console.log(`  IY+0x18 after: ${traceC.iy18After}`);
  console.log(`  Bit 7 armed: ${traceC.bit7Armed}`);
  console.log(`  Bit 7 first armed at step: ${traceC.bit7ArmStep ?? 'never'}`);
  console.log();

  console.log('Block trace:');
  for (const ev of traceC.events) {
    console.log(
      `  [${String(ev.step).padStart(3)}] ${ev.kind.padEnd(7)} ${ev.pc}:${ev.mode}  IY+18=${ev.iy18}`,
    );
  }
  console.log();

  // Also trace from the function entry if different
  if (funcInfo.entry !== SET_SITE) {
    console.log(`--- Trace from function entry ${hex(funcInfo.entry)} ---`);
    const traceEntry = traceFrom(baseline, funcInfo.entry, TRACE_MAX_STEPS, 'function entry');
    console.log(`  Termination: ${traceEntry.termination}`);
    console.log(`  Steps: ${traceEntry.steps}`);
    console.log(`  IY+0x18 before: ${traceEntry.iy18Before}`);
    console.log(`  IY+0x18 after: ${traceEntry.iy18After}`);
    console.log(`  Bit 7 armed: ${traceEntry.bit7Armed}`);
    console.log(`  Bit 7 first armed at step: ${traceEntry.bit7ArmStep ?? 'never'}`);
    console.log();
    console.log('Block trace:');
    for (const ev of traceEntry.events) {
      console.log(
        `  [${String(ev.step).padStart(3)}] ${ev.kind.padEnd(7)} ${ev.pc}:${ev.mode}  IY+18=${ev.iy18}`,
      );
    }
    console.log();
  }

  // ---- Part D: Trace each external caller (50 steps) ----
  console.log('=== Part D: Caller traces (50 steps each) ===');
  console.log();

  // Combine all found callers, dedup by from address, prefer external
  const allCallers = [...callers, ...wideCallers, ...(outerCallers ?? [])];
  const uniqueCallerMap = new Map();
  for (const c of allCallers) {
    if (!uniqueCallerMap.has(c.from)) uniqueCallerMap.set(c.from, c);
  }
  // Filter to external callers only (from outside 0x079800-0x079B00)
  const externalCallersForTrace = [...uniqueCallerMap.values()].filter(
    (c) => c.from < 0x079800 || c.from > 0x079B00,
  );

  if (externalCallersForTrace.length === 0) {
    console.log('No external callers to trace.');
    console.log();

    // Fall back: trace the top of the containing function
    // Look even further back for the real function entry
    const veryFarEntry = findFunctionEntry(SET_SITE, 0x400);
    console.log(`Very far lookback entry: ${hex(veryFarEntry.entry)} (boundary: ${veryFarEntry.boundaryText} at ${hex(veryFarEntry.boundaryPc)})`);

    // Scan for callers to that entry
    const veryFarCallers = scanCallersOf([veryFarEntry.entry]);
    if (veryFarCallers.length > 0) {
      console.log(`Callers to ${hex(veryFarEntry.entry)}:`);
      for (const c of veryFarCallers.slice(0, 20)) {
        console.log(`  ${hex(c.from)}  ${c.bytes.padEnd(14)}  ${c.label} -> ${hex(c.target)}`);
      }
      console.log();

      // Trace each
      for (const caller of veryFarCallers.slice(0, 5)) {
        console.log(`--- Caller at ${hex(caller.from)}: ${caller.label} -> ${hex(caller.target)} ---`);
        try {
          const traceD = traceFrom(baseline, caller.from, CALLER_TRACE_MAX_STEPS, `caller ${hex(caller.from)}`);
          console.log(`  Termination: ${traceD.termination}`);
          console.log(`  Steps: ${traceD.steps}`);
          console.log(`  IY+0x18 before: ${traceD.iy18Before}`);
          console.log(`  IY+0x18 after: ${traceD.iy18After}`);
          console.log(`  Bit 7 armed: ${traceD.bit7Armed}`);
          console.log(`  Bit 7 first armed at step: ${traceD.bit7ArmStep ?? 'never'}`);
          console.log('  Block trace:');
          for (const ev of traceD.events) {
            console.log(
              `    [${String(ev.step).padStart(3)}] ${ev.kind.padEnd(7)} ${ev.pc}:${ev.mode}  IY+18=${ev.iy18}`,
            );
          }
        } catch (e) {
          console.log(`  ERROR: ${e.message}`);
        }
        console.log();
      }
    } else {
      console.log(`No callers found for ${hex(veryFarEntry.entry)} either.`);
      console.log();

      // Last resort: disassemble the much wider region to understand control flow
      console.log('--- Wide disassembly 0x079880 - 0x079A30 for context ---');
      const wideDisasm = decodeRange(0x079880, 0x079A30);
      for (const row of wideDisasm) {
        const marker = row.pc === SET_SITE ? '=>' : '  ';
        console.log(`${marker} ${row.pcHex}  ${row.bytes.padEnd(18)}  ${row.text}`);
      }
      console.log();
    }
  } else {
    for (const caller of externalCallersForTrace.slice(0, 10)) {
      console.log(`--- Caller at ${hex(caller.from)}: ${caller.label} -> ${hex(caller.target)} ---`);
      try {
        const traceD = traceFrom(baseline, caller.from, CALLER_TRACE_MAX_STEPS, `caller ${hex(caller.from)}`);
        console.log(`  Termination: ${traceD.termination}`);
        console.log(`  Steps: ${traceD.steps}`);
        console.log(`  IY+0x18 before: ${traceD.iy18Before}`);
        console.log(`  IY+0x18 after: ${traceD.iy18After}`);
        console.log(`  Bit 7 armed: ${traceD.bit7Armed}`);
        console.log(`  Bit 7 first armed at step: ${traceD.bit7ArmStep ?? 'never'}`);
        console.log('  Block trace:');
        for (const ev of traceD.events) {
          console.log(
            `    [${String(ev.step).padStart(3)}] ${ev.kind.padEnd(7)} ${ev.pc}:${ev.mode}  IY+18=${ev.iy18}`,
          );
        }
      } catch (e) {
        console.log(`  ERROR: ${e.message}`);
      }
      console.log();
    }
  }

  // ---- Part E: Trace the fall-through path to 0x079A00 ----
  console.log('=== Part E: What falls through to 0x079A00? ===');
  console.log();

  // Disassemble 0x0799B0 - 0x079A30 to see what code leads into 0x079A00
  const fallDisasm = decodeRange(0x079900, 0x079A30);
  console.log('Disassembly 0x079900 - 0x079A30:');
  for (const row of fallDisasm) {
    const marker = row.pc === SET_SITE ? '=>' :
                   row.pc === 0x079A00 ? '>>' : '  ';
    console.log(`${marker} ${row.pcHex}  ${row.bytes.padEnd(18)}  ${row.text}`);
  }
  console.log();

  // The bigger question: who calls the CONTAINING function?
  // Find the very top of this function by scanning much further back
  let realEntry = 0x079900;
  // Scan backward from 0x079900 looking for a hard boundary
  for (let addr = 0x079900 - 1; addr >= 0x0790FF; addr--) {
    const inst = decodeSafe(addr);
    if (isHardBoundary(inst)) {
      const nextPc = addr + Math.max(1, inst.length ?? 1);
      if (nextPc <= 0x079900) {
        realEntry = nextPc;
        console.log(`Found boundary: ${formatInstruction(inst)} at ${hex(addr)}, entry at ${hex(nextPc)}`);
        break;
      }
    }
  }

  // Scan for callers of the real entry
  const realCallers = scanCallersOf([realEntry]);
  if (realCallers.length > 0) {
    console.log(`Callers of real entry ${hex(realEntry)}:`);
    for (const c of realCallers.slice(0, 20)) {
      console.log(`  ${hex(c.from)}  ${c.bytes.padEnd(14)}  ${c.label} -> ${hex(c.target)}`);
    }
    console.log();
  } else {
    console.log(`No callers for ${hex(realEntry)}.`);
    // Keep searching back further
    for (let addr = realEntry - 1; addr >= 0x079000; addr--) {
      const inst = decodeSafe(addr);
      if (isHardBoundary(inst)) {
        const nextPc = addr + Math.max(1, inst.length ?? 1);
        const nextCallers = scanCallersOf([nextPc]);
        if (nextCallers.length > 0) {
          console.log(`Found called entry at ${hex(nextPc)} (boundary: ${formatInstruction(inst)} at ${hex(addr)}):`);
          for (const c of nextCallers.slice(0, 10)) {
            console.log(`  ${hex(c.from)}  ${c.bytes.padEnd(14)}  ${c.label} -> ${hex(c.target)}`);
          }
          console.log();
          break;
        }
      }
    }
  }

  // Check what the actual containing function that gets CALLed is
  // The callers into 0x079800-0x079A30 showed calls to 0x07983E, 0x07982A, 0x079852, 0x07981A
  // Let's see if any of those eventually fall through to 0x079A00
  console.log('--- Checking if key entry points can reach 0x079A00 ---');
  const entryPoints = [0x07983E, 0x07982A, 0x079852, 0x07981A];
  for (const ep of entryPoints) {
    // Linear scan from entry
    let pc = ep;
    let reached = false;
    let steps = 0;
    const visited = new Set();
    while (pc < 0x079A30 && steps < 500 && !visited.has(pc)) {
      visited.add(pc);
      if (pc === 0x079A00) { reached = true; break; }
      const inst = decodeSafe(pc);
      if (inst.tag === 'decode-error') break;
      // Follow linear + conditional fallthrough
      if (isHardBoundary(inst)) {
        // Check if it's a conditional that could fall through
        if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'ret-conditional' || inst.tag === 'call-conditional') {
          // Conditional: fall through
          pc += Math.max(1, inst.length ?? 1);
        } else {
          break; // unconditional boundary
        }
      } else {
        pc += Math.max(1, inst.length ?? 1);
      }
      steps++;
    }
    console.log(`  ${hex(ep)} -> 0x079A00: ${reached ? 'CAN REACH (fall-through)' : 'CANNOT REACH'} (scanned ${steps} instructions)`);
  }
  console.log();

  // ---- Part F: Find the real function entry ----
  console.log('=== Part F: Real function entry and callers ===');
  console.log();

  // The RET at 0x079991 means 0x079992 starts a new code block.
  // But 0x079992 is reached from 0x079909 (JP NZ, 0x079992).
  // Need to find the FUNCTION that contains 0x079909.
  // Scan back from 0x079900 for a RET/JP that doesn't target within the function.

  const scanStart = 0x079100;
  const scanEnd = 0x079A30;
  console.log(`Disassembly ${hex(scanStart)} - ${hex(0x079180)} (looking for function entry):`);
  const entryDisasm = decodeRange(scanStart, 0x079180);
  for (const row of entryDisasm) {
    console.log(`  ${row.pcHex}  ${row.bytes.padEnd(18)}  ${row.text}`);
  }
  console.log();

  // Find all RET instructions in the 0x0790xx-0x079Axx range
  console.log('RET/JP/JR hard boundaries in 0x079100-0x079A30:');
  const boundaries = [];
  let bpc = scanStart;
  while (bpc < scanEnd) {
    const inst = decodeSafe(bpc);
    if (isHardBoundary(inst)) {
      const nextPc = bpc + Math.max(1, inst.length ?? 1);
      boundaries.push({ pc: bpc, text: formatInstruction(inst), nextPc });
      console.log(`  ${hex(bpc)}  ${formatInstruction(inst)}  -> next at ${hex(nextPc)}`);
    }
    bpc += Math.max(1, inst.length ?? 1);
  }
  console.log();

  // Now scan for external callers to EVERY address right after each hard boundary
  const candidateEntries = boundaries
    .map((b) => b.nextPc)
    .filter((addr) => addr >= scanStart && addr < scanEnd);

  console.log(`Scanning for external CALL/JP to ${candidateEntries.length} candidate entry points...`);
  const entryCallers = scanCallersOf(candidateEntries);
  // Filter to external callers only
  const extEntryCallers = entryCallers.filter(
    (c) => c.from < scanStart || c.from > scanEnd,
  );

  if (extEntryCallers.length > 0) {
    console.log(`External callers found (${extEntryCallers.length}):`);
    for (const c of extEntryCallers.slice(0, 30)) {
      console.log(`  ${hex(c.from)}  ${c.bytes.padEnd(14)}  ${c.label} -> ${hex(c.target)}`);
    }
    console.log();

    // The function entry that can reach 0x079A00 is the one we want
    // Check which of these entries can linearly reach 0x079A00
    const reachableEntries = new Set();
    for (const c of extEntryCallers) {
      // Check if c.target can fall-through to 0x079A00
      let pc2 = c.target;
      let steps2 = 0;
      const visited2 = new Set();
      while (pc2 <= 0x079A30 && steps2 < 1000 && !visited2.has(pc2)) {
        visited2.add(pc2);
        if (pc2 === 0x079A00) {
          reachableEntries.add(c.target);
          break;
        }
        const inst2 = decodeSafe(pc2);
        if (inst2.tag === 'decode-error') break;
        if (inst2.tag === 'ret' || inst2.tag === 'reti' || inst2.tag === 'retn') break;
        if (inst2.tag === 'jp' || inst2.tag === 'jr') {
          // Follow unconditional jump
          pc2 = inst2.target;
        } else if (inst2.tag === 'halt' || inst2.tag === 'slp') {
          break;
        } else {
          pc2 += Math.max(1, inst2.length ?? 1);
        }
        steps2++;
      }
    }

    if (reachableEntries.size > 0) {
      console.log('Entries that can reach 0x079A00 via fall-through/unconditional jumps:');
      for (const entry of reachableEntries) {
        const callersToThis = extEntryCallers.filter((c) => c.target === entry);
        console.log(`  ${hex(entry)} (${callersToThis.length} external callers):`);
        for (const c of callersToThis.slice(0, 10)) {
          console.log(`    ${hex(c.from)}  ${c.label}`);
        }
      }
      console.log();
    }
  } else {
    console.log('No external callers found to any candidate entry in this range.');
    console.log();
  }

  // ---- Part G: Key handler dispatch table at 0x079905 ----
  console.log('=== Part G: Key handler dispatch at 0x079905 ===');
  console.log();

  // 0x079104: LD HL, 0x079905 -- this loads a handler table address
  // 0x079108: CALL 0x07B0FE -- this is the dispatch routine
  // Let's look at what's at 0x079905 and the dispatch routine

  const handlerDisasm = decodeRange(0x079905, 0x079A30);
  console.log('Disassembly 0x079905 - 0x079A30 (key handler body):');
  for (const row of handlerDisasm) {
    const marker = row.pc === SET_SITE ? '=>' :
                   row.pc === 0x079A00 ? '>>' :
                   row.pc === 0x079905 ? '**' : '  ';
    console.log(`${marker} ${row.pcHex}  ${row.bytes.padEnd(18)}  ${row.text}`);
  }
  console.log();

  // Now check: is 0x079905 itself a called function? Or is it reached by the dispatch at 0x07B0FE?
  const callersOf079905 = scanCallersOf([0x079905]);
  console.log(`Direct callers of 0x079905: ${callersOf079905.length}`);
  for (const c of callersOf079905) {
    console.log(`  ${hex(c.from)}  ${c.bytes.padEnd(14)}  ${c.label} -> ${hex(c.target)}`);
  }
  console.log();

  // The address 0x079905 is loaded into HL at 0x079104, then CALL 0x07B0FE dispatches.
  // This means 0x07B0FE is a generic "call handler at (HL)" routine.
  // The handler at 0x079905 processes keys and falls through a chain of CP/JR checks.

  // Let's look at what 0x07B0FE does
  const dispatchDisasm = decodeRange(0x07B0FE, 0x07B130);
  console.log('Dispatch routine at 0x07B0FE:');
  for (const row of dispatchDisasm) {
    console.log(`  ${row.pcHex}  ${row.bytes.padEnd(18)}  ${row.text}`);
  }
  console.log();

  // Critical finding: the path is:
  // 0x079100: CALL 0x07B0BD (some init)
  // 0x079104: LD HL, 0x079905 (handler table)
  // 0x079108: CALL 0x07B0FE (dispatch using HL)
  // Inside 0x07B0FE, it eventually JPs or CALLs to 0x079905
  // At 0x079905, the code does a big switch on A (the key code):
  //   CP 0x05 -> JP NZ, 0x079992
  //   ...eventually...
  //   CP 0x3E at 0x0799FE
  //   JR NZ, 0x079A26 at 0x079A00
  //   (fall through when A == 0x3E)
  //   RES 0,(IY+19) at 0x079A02
  //   RES 7,(IY+0x18) at 0x079A06
  //   BIT 6,(IY-2) at 0x079A0A
  //   JR Z, 0x079A16 at 0x079A0E
  //   ...
  //   BIT 7,(IY-2) at 0x079A16
  //   JP Z, 0x079A7E at 0x079A1A (skip SET if bit 7 of IY-2 is clear)
  //   SET 7,(IY+0x18) at 0x079A1E <== THE ARM SITE

  // So the path to SET 7,(IY+0x18) requires:
  // 1. A == 0x3E (key code for some specific key)
  // 2. BIT 6,(IY-2) is CLEAR
  // 3. BIT 7,(IY-2) is SET

  // What is key code 0x3E? Let's check
  console.log('=== Key Code Analysis ===');
  console.log();
  console.log('Key code 0x3E = 62 decimal');
  console.log('In TI-84 CE key mapping, scan codes use (group << 4) | bit');
  console.log('0x3E = group 3, bit 14... or more likely this is a token/converted key code');
  console.log();

  // Now let's find callers of the initialization function at 0x079100
  // This appears to be the graph/STAT key handler init
  const callersOfInit = scanCallersOf([0x079100]);
  console.log(`Callers of init function 0x079100:`);
  for (const c of callersOfInit) {
    console.log(`  ${hex(c.from)}  ${c.bytes.padEnd(14)}  ${c.label} -> ${hex(c.target)}`);
  }
  console.log();

  // The full caller chain summary
  console.log('=== FULL CALLER CHAIN TO SET 7,(IY+0x18) ===');
  console.log();
  console.log('  Caller -> 0x079100 (STAT/graph key handler init)');
  console.log('    0x079104: LD HL, 0x079905 (loads handler address)');
  console.log('    0x079108: CALL 0x07B0FE (dispatch: enters key handler at 0x079905)');
  console.log('    0x079905: Key handler switch statement');
  console.log('    ...falls through CP checks...');
  console.log('    0x0799FE: CP 0x3E (key code comparison)');
  console.log('    0x079A00: JR NZ, 0x079A26 (skip if not key 0x3E)');
  console.log('    0x079A02: RES 0,(IY+19) -- clear a flag');
  console.log('    0x079A06: RES 7,(IY+0x18) -- CLEAR bit 7 first!');
  console.log('    0x079A0A: BIT 6,(IY-2) -- test bit 6');
  console.log('    0x079A0E: JR Z, 0x079A16 -- if bit 6 clear, skip to bit 7 test');
  console.log('    0x079A10: SET 0,(IY+19) -- set flag if bit 6 was set');
  console.log('    0x079A14: JR 0x079A2E -- jump ahead (skip the SET 7)');
  console.log('    0x079A16: BIT 7,(IY-2) -- test bit 7 of IY-2');
  console.log('    0x079A1A: JP Z, 0x079A7E -- if bit 7 clear, skip (no arming)');
  console.log('    0x079A1E: SET 7,(IY+0x18) -- ARM THE DISPATCHER GATE');
  console.log('    0x079A22: JP 0x079A7E -- done');
  console.log();
  console.log('CONDITIONS FOR ARMING:');
  console.log('  1. Key code A == 0x3E');
  console.log('  2. BIT 6,(IY-2) must be CLEAR (else takes different path via 0x079A14)');
  console.log('  3. BIT 7,(IY-2) must be SET (else JP Z skips the SET)');
  console.log();

  // ---- Summary ----
  console.log('=== Summary JSON ===');
  console.log();
  console.log(JSON.stringify({
    probe: 'probe-phase216-079a1e-caller-chain.mjs',
    setSite: hex(SET_SITE),
    localFunctionEntry: hex(funcInfo.entry),
    handlerBody: '0x079905',
    handlerInit: '0x079100 (and 0x079028)',
    dispatchRoutine: '0x07B0FE -> CALL 0x023B55 (OS key handler dispatch)',
    keyCode: '0x3E (62 decimal)',
    armingConditions: {
      keyCodeMustBe: '0x3E',
      bit6IYminus2: 'must be CLEAR',
      bit7IYminus2: 'must be SET',
    },
    codeFlowToArm: [
      '0x0799FE: CP 0x3E',
      '0x079A00: JR NZ,0x079A26 (skip if A != 0x3E)',
      '0x079A02: RES 0,(IY+19)',
      '0x079A06: RES 7,(IY+0x18) -- clears bit 7 first',
      '0x079A0A: BIT 6,(IY-2)',
      '0x079A0E: JR Z,0x079A16 -- skip to bit 7 test if bit 6 clear',
      '0x079A16: BIT 7,(IY-2)',
      '0x079A1A: JP Z,0x079A7E -- skip arming if bit 7 clear',
      '0x079A1E: SET 7,(IY+0x18) -- ARM',
    ],
    traceFromSetSite: {
      termination: traceC.termination,
      steps: traceC.steps,
      bit7Armed: traceC.bit7Armed,
      bit7ArmStep: traceC.bit7ArmStep,
      iy18Before: traceC.iy18Before,
      iy18After: traceC.iy18After,
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    probe: 'probe-phase216-079a1e-caller-chain.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
