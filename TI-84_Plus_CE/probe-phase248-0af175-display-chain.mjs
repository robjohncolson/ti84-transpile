#!/usr/bin/env node

/**
 * Phase 248: Trace 0x0AF175 display chain.
 *
 * Context: Session 247 found 0x0885EA is a tail JP 0x0AF1DC (D02661 latch armer).
 * In the CP 0x40 path from 0x0885EE, code calls 0x0886AF which writes D00824=0x49,
 * then calls 0x0AF175. This probe traces what 0x0AF175 does.
 *
 * 1. Static ROM scan for callers of 0x0AF175
 * 2. Disassemble 0x0AF175-0x0AF1DB from ROM bytes
 * 3. Trace 0x0AF175 with 500 steps (cold-boot environment)
 * 4. Extended trace with 2000 steps if 500 doesn't complete
 *
 * Run: node TI-84_Plus_CE/probe-phase248-0af175-display-chain.mjs
 *
 * === OUTPUT SUMMARY (2026-05-08) ===
 *
 * PART 1 - Static callers of 0x0AF175:
 *   3 sites found:
 *     0x021954  JP   0x0AF175   (tail jump from some caller)
 *     0x0886BA  CALL 0x0AF175   (from the 0x0885EE CP 0x40 path, after D00824=0x49)
 *     0x0AF25B  CALL 0x0AF175   (self-reference within 0x0AF1DC armer region)
 *   Only 1 caller of armer 0x0AF1DC: 0x0885EA (JP).
 *
 * PART 2 - Disassembly of 0x0AF175-0x0AF1DB (35 instructions):
 *   0x0AF175: CALL 0x0A21EC     -- first call, display init/wait
 *   0x0AF179: CALL 0x0AF6E1     -- display chain sub
 *   0x0AF17D: CALL 0x0AF6BC     -- display chain sub
 *   0x0AF181: CALL 0x0AB639     -- display chain sub
 *   0x0AF185: LD A, 0xDF
 *   0x0AF187: CALL 0x080244     -- known OS utility
 *   0x0AF18B: JR 0x0AF1BC       -- skip to common tail
 *   --- alternate entry at 0x0AF18D (not reached from 0x0AF175 straight-line) ---
 *   0x0AF18D: CALL 0x0ADCF8
 *   ...branch logic checking H >= 0xFA, D01461 < 0x80...
 *   0x0AF19F-0x0AF1A0: NOP; JR -3  -- tight spin loop (wait for H >= 0xFA)
 *   --- common tail at 0x0AF1BC ---
 *   0x0AF1BC: XOR A
 *   0x0AF1BD: LD (0xD00595), A   -- clear D00595
 *   0x0AF1C1: SET 3, (IY+5)      -- set bit 3 of IY+5
 *   0x0AF1C5: CALL 0x02315E      -- display update
 *   0x0AF1C9: CALL 0x0ADDD4      -- display update
 *   0x0AF1CD: LD A, 0x01
 *   0x0AF1CF: LD (0xD02504), A   -- set D02504 = 1
 *   0x0AF1D3: RES 3, (IY+5)      -- clear bit 3 of IY+5
 *   0x0AF1D7: CALL 0x0AF6A8      -- final display sub
 *   0x0AF1DB: RET
 *
 * PART 3/4 - Dynamic trace (500 + 2000 steps):
 *   STUCK in a hardware wait loop. The first CALL 0x0A21EC leads to:
 *     0x0A21EC -> 0x0A21BB -> 0x0A21D7 -> 0x09EF20 -> ... -> 0x09EFDE (tight loop)
 *   0x09EFDE is visited 480/500 times (500-step) and 1953/2000 times (2000-step).
 *   This is an MMIO busy-wait (likely LCD controller readiness check).
 *   The trace never gets past the first CALL. D02661 and D00824 unchanged.
 *   HL advances through VRAM range (0xD45280 -> 0xD46984), suggesting a
 *   VRAM fill/clear loop gated by the MMIO readiness check.
 *
 * KEY FINDINGS:
 *   - 0x0AF175 is a display-mode setup/refresh function
 *   - It calls 5 subroutines before JR-ing to a common tail
 *   - Common tail: clears D00595, toggles IY+5 bit 3, writes D02504=1, calls 3 more subs
 *   - The function RETurns normally (does NOT fall through to armer 0x0AF1DC)
 *   - First sub 0x0A21EC contains a VRAM-touching MMIO wait that blocks emulation
 *   - Alternate path at 0x0AF18D has its own MMIO wait (NOP; JR -3 spin at 0x0AF19F)
 *   - To trace deeper, the MMIO wait at 0x09EFDE would need to be stubbed out
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!existsSync(transpiledPath)) {
  throw new Error(
    existsSync(transpiledGzipPath)
      ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.'
      : 'ROM.transpiled.js is missing.'
  );
}
if (!existsSync(romPath)) throw new Error('ROM.rom is missing.');

const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');
const rom = readFileSync(romPath);
const BLOCKS = Array.isArray(PRELIFTED_BLOCKS)
  ? Object.fromEntries(PRELIFTED_BLOCKS.filter((b) => b?.id).map((b) => [b.id, b]))
  : (PRELIFTED_BLOCKS ?? {});

// ---- constants ----
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const RETURN_SENTINEL = 0x7FFFFE;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const TARGET = 0x0AF175;
const DISASM_START = 0x0AF175;
const DISASM_END = 0x0AF1DC;
const KNOWN_ARMER = 0x0AF1DC;
const KNOWN_CLEARER = 0x0AF76E;

const D02661_ADDR = 0xD02661;
const D00824_ADDR = 0xD00824;
const D0_RANGE_START = 0xD00000;
const D0_RANGE_END = 0xD10000;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD52C00;

const TRACE_BUDGET_SHORT = 500;
const TRACE_BUDGET_LONG = 2000;

// ---- opcode tables ----
const DIRECT = new Map([
  [0xCD, 'CALL'], [0xC3, 'JP'],
  [0xCC, 'CALL Z'], [0xC4, 'CALL NZ'], [0xDC, 'CALL C'], [0xD4, 'CALL NC'],
  [0xEC, 'CALL PE'], [0xE4, 'CALL PO'], [0xFC, 'CALL M'], [0xF4, 'CALL P'],
  [0xCA, 'JP Z'], [0xC2, 'JP NZ'], [0xDA, 'JP C'], [0xD2, 'JP NC'],
  [0xEA, 'JP PE'], [0xE2, 'JP PO'], [0xFA, 'JP M'], [0xF2, 'JP P'],
]);

// ---- helpers ----
const hex = (v, w = 6) => v === null || v === undefined || Number.isNaN(v) ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const hexByte = (v) => hex((v ?? 0) & 0xFF, 2);
const bytesAt = (buf, start, len) => Array.from(buf.slice(Math.max(0, start), Math.min(buf.length, Math.max(0, start) + Math.max(0, len))), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const blockKey = (addr, mode = 'adl') => `${addr.toString(16).padStart(6, '0')}:${mode}`;

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

function dec(pc) {
  try { return decodeInstruction(rom, pc, 'adl'); }
  catch (e) { return { pc, length: 1, tag: 'decode-error', errorMessage: e?.message ?? String(e) }; }
}

function eff(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  return inst.modePrefix === 'sis' || inst.modePrefix === 'lis'
    ? (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0
    : inst.addr >>> 0;
}

function idx(reg, d) { return `(${String(reg).toUpperCase()}${d >= 0 ? '+' : ''}${d})`; }

function fmt(inst) {
  const p = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'call': return `${p}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${p}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${p}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${p}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${p}RET`;
    case 'ret-conditional': return `${p}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti': return `${p}RETI`;
    case 'retn': return `${p}RETN`;
    case 'ld-pair-imm': return `${p}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${p}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${p}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${p}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${p}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${p}LD ${String(inst.dest).toUpperCase()}, (${hex(eff(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${p}LD (${hex(eff(inst) ?? inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${p}LD ${String(inst.dest).toUpperCase()}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${p}LD ${idx(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-bit': return `${p}BIT ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${p}SET ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${p}RES ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'bit-test-ind': return `${p}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind': return `${p}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind': return `${p}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'rotate-reg': return `${p}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'add-pair': return `${p}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg': return `${p}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${p}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${p}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${p}DEC ${String(inst.pair).toUpperCase()}`;
    case 'alu-imm': return `${p}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${p}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-ixd': return `${p}${String(inst.op).toUpperCase()} ${idx(inst.indexRegister, inst.displacement)}`;
    case 'push': return `${p}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${p}POP ${String(inst.pair).toUpperCase()}`;
    case 'ldir': return `${p}LDIR`;
    case 'lddr': return `${p}LDDR`;
    case 'nop': return `${p}NOP`;
    case 'ex-af': return `${p}EX AF, AF'`;
    case 'exx': return `${p}EXX`;
    case 'ex-de-hl': return `${p}EX DE, HL`;
    case 'di': return `${p}DI`;
    case 'ei': return `${p}EI`;
    case 'halt': return `${p}HALT`;
    case 'rst': return `${p}RST ${hex(inst.target, 2)}`;
    case 'out-imm': return `${p}OUT (${hexByte(inst.port)}), A`;
    case 'in-imm': return `${p}IN A, (${hexByte(inst.port)})`;
    case 'sbc-pair': return `${p}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair': return `${p}ADC HL, ${String(inst.src).toUpperCase()}`;
    default: {
      const extra = Object.entries(inst)
        .filter(([k]) => !['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(k))
        .map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v) : String(v)}`)
        .join(' ');
      return `${p}[${inst.tag}]${extra ? ` ${extra}` : ''}`;
    }
  }
}

// ---- scan for callers ----
function scanDirect(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const out = [];
  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const kind = DIRECT.get(rom[addr]);
    if (!kind || rom[addr + 1] !== lo || rom[addr + 2] !== mid || rom[addr + 3] !== hi) continue;
    const inst = dec(addr);
    out.push({
      addr,
      kind,
      target,
      bytes: bytesAt(rom, addr, 4),
      text: inst.tag === 'decode-error' ? kind : fmt(inst),
    });
  }
  return out.sort((a, b) => a.addr - b.addr);
}

// ---- disassemble range ----
function disasm(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    const inst = dec(pc);
    const len = Math.max(1, inst.length ?? 1);
    rows.push({
      pc,
      inst,
      bytes: bytesAt(rom, pc, len),
      text: inst.tag === 'decode-error' ? `decode-error: ${inst.errorMessage}` : fmt(inst),
    });
    pc += len;
  }
  return rows;
}

// ---- runtime creation ----
function memWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function runtime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function reset(cpu, mem) {
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
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc ?? 0) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc ?? 0) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc ?? 0) },
  };
}

// ---- tracing with detailed logging ----
function traceTarget(executor, cpu, mem, budget, label) {
  reset(cpu, mem);
  cpu.sp = STACK_TOP;

  // Pre-set D00824 = 0x49 (the mode byte that 0x0886AF writes before calling 0x0AF175)
  mem[D00824_ADDR] = 0x49;

  push24(cpu, mem, RETURN_SENTINEL);

  const visitedBlocks = [];
  const missingBlocks = [];
  const callTargets = [];
  const jpTargets = [];
  const d0Writes = [];
  const vramWrites = [];
  const iyChanges = [];

  const iyBefore = mem[IY_ADDR] | (mem[IY_ADDR + 1] << 8) | (mem[IY_ADDR + 2] << 16);
  const d02661Before = mem[D02661_ADDR];
  const d00824Before = mem[D00824_ADDR];

  // Snapshot D0xxxx region for diff
  const d0Before = new Uint8Array(0x400);
  d0Before.set(mem.subarray(0xD02600, 0xD02A00));

  let termination = 'budget_exhausted';
  let errorMessage = null;
  let result = null;
  let stopStep = null;
  let lastPc = TARGET;

  try {
    result = executor.runFrom(TARGET, 'adl', {
      maxSteps: budget,
      maxLoopIterations: Math.min(budget, 8192),
      onBlock(pc, _m, _meta, step) {
        const addr = pc & 0xFFFFFF;
        lastPc = addr;
        visitedBlocks.push(addr);
        if (addr === RETURN_SENTINEL) {
          stopStep = step ?? 0;
          throw new Error('__TRACE_STOP__');
        }
      },
      onMissingBlock(pc, _m, step) {
        const addr = pc & 0xFFFFFF;
        lastPc = addr;
        missingBlocks.push(addr);
        visitedBlocks.push(addr);
        if (addr === RETURN_SENTINEL) {
          stopStep = step ?? 0;
          throw new Error('__TRACE_STOP__');
        }
      },
    });
    termination = result?.termination ?? termination;
  } catch (e) {
    if (e?.message === '__TRACE_STOP__') {
      termination = 'sentinel';
    } else {
      termination = 'exception';
      errorMessage = e?.message ?? String(e);
    }
  }

  // Collect D0xxxx diffs
  const d0After = new Uint8Array(0x400);
  d0After.set(mem.subarray(0xD02600, 0xD02A00));
  for (let i = 0; i < d0Before.length; i += 1) {
    if (d0Before[i] !== d0After[i]) {
      d0Writes.push({
        addr: hex(0xD02600 + i),
        before: hexByte(d0Before[i]),
        after: hexByte(d0After[i]),
      });
    }
  }

  // Check broader D0xxxx changes in key areas
  const keyD0Addrs = [
    D02661_ADDR, D00824_ADDR,
    0xD00329, 0xD02E13, 0xD02A86,
    0xD010F8, 0xD00080,
  ];
  const keyD0Changes = [];
  for (const addr of keyD0Addrs) {
    // We can't diff easily without a full snapshot, but report current values
    keyD0Changes.push({ addr: hex(addr), value: hexByte(mem[addr]) });
  }

  // Deduplicate visited blocks
  const uniqueBlocks = [];
  const seen = new Set();
  for (const addr of visitedBlocks) {
    if (!seen.has(addr)) {
      seen.add(addr);
      uniqueBlocks.push(addr);
    }
  }

  // Count visits per block
  const visitCounts = new Map();
  for (const addr of visitedBlocks) {
    visitCounts.set(addr, (visitCounts.get(addr) ?? 0) + 1);
  }

  // Check for IY change
  const iyAfter = cpu.iy & 0xFFFFFF;

  return {
    label,
    budget,
    stepsTaken: result?.steps ?? stopStep ?? visitedBlocks.length,
    termination,
    errorMessage,
    lastPc: hex(lastPc),
    uniqueBlocks: uniqueBlocks.map((a) => hex(a)),
    uniqueBlockCount: uniqueBlocks.length,
    totalBlockVisits: visitedBlocks.length,
    missingBlocks: [...new Set(missingBlocks)].map((a) => hex(a)),
    topVisited: [...visitCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([addr, count]) => ({ addr: hex(addr), count })),
    d02661: { before: hexByte(d02661Before), after: hexByte(mem[D02661_ADDR]) },
    d00824: { before: hexByte(d00824Before), after: hexByte(mem[D00824_ADDR]) },
    iy: { before: hex(IY_ADDR), after: hex(iyAfter), changed: iyAfter !== IY_ADDR },
    d0WritesInRange: d0Writes.slice(0, 40),
    d0WriteCount: d0Writes.length,
    keyD0Values: keyD0Changes,
    finalRegs: {
      pc: hex(cpu.pc & 0xFFFFFF),
      a: hexByte(cpu.a),
      f: hexByte(cpu.f),
      bc: hex(cpu.bc & 0xFFFFFF),
      de: hex(cpu.de & 0xFFFFFF),
      hl: hex(cpu.hl & 0xFFFFFF),
      sp: hex(cpu.sp & 0xFFFFFF),
      ix: hex(cpu.ix & 0xFFFFFF),
      iy: hex(cpu.iy & 0xFFFFFF),
    },
    reachedArmer: uniqueBlocks.includes(KNOWN_ARMER),
    reachedClearer: uniqueBlocks.includes(KNOWN_CLEARER),
  };
}

// ---- main ----
function main() {
  console.log('=== Phase 248: Trace 0x0AF175 display chain ===');
  console.log(`Generated: ${new Date().toISOString()}\n`);

  // ---- PART 1: Static ROM scan for callers ----
  console.log('=== PART 1: Static ROM scan for callers of 0x0AF175 ===\n');
  const callers = scanDirect(TARGET);
  console.log(`Found ${callers.length} CALL/JP sites targeting ${hex(TARGET)}:`);
  for (const c of callers) {
    console.log(`  ${hex(c.addr)}  ${c.kind} ${hex(c.target)}  [${c.text}]  bytes: ${c.bytes}`);
  }
  console.log();

  // Also scan for callers of the known related addresses
  const armCallers = scanDirect(KNOWN_ARMER);
  console.log(`Callers of armer ${hex(KNOWN_ARMER)}: ${armCallers.length}`);
  for (const c of armCallers) {
    console.log(`  ${hex(c.addr)}  ${c.kind}  [${c.text}]`);
  }
  console.log();

  // ---- PART 2: Disassemble 0x0AF175-0x0AF1DB ----
  console.log('=== PART 2: Disassembly of 0x0AF175-0x0AF1DB ===\n');
  const rows = disasm(DISASM_START, DISASM_END);
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }
  console.log();

  // Also disassemble a bit past 0x0AF1DB to see what follows
  console.log('--- Continuation past 0x0AF1DB (armer at 0x0AF1DC) ---\n');
  const contRows = disasm(KNOWN_ARMER, KNOWN_ARMER + 0x30);
  for (const row of contRows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }
  console.log();

  // ---- PART 3: Cold boot + trace ----
  console.log('=== PART 3: Cold boot + 500-step trace ===\n');
  const mem = memWithRom();
  const { executor, cpu } = runtime(mem);
  const bootResult = coldBoot(executor, cpu, mem);
  console.log('Boot sequence:');
  console.log(JSON.stringify(bootResult, null, 2));
  console.log();

  // Save baseline memory after boot
  const baselineMem = new Uint8Array(mem);

  // Trace with 500 steps
  mem.set(baselineMem);
  const trace500 = traceTarget(executor, cpu, mem, TRACE_BUDGET_SHORT, '500-step trace of 0x0AF175');
  console.log('--- 500-step trace results ---');
  console.log(JSON.stringify(trace500, null, 2));
  console.log();

  // ---- PART 4: Extended trace if needed ----
  const needsExtended = trace500.termination !== 'sentinel';
  if (needsExtended) {
    console.log('=== PART 4: Extended 2000-step trace ===\n');
    mem.set(baselineMem);
    const { executor: ex2, cpu: cpu2 } = runtime(mem);
    coldBoot(ex2, cpu2, mem);
    const baselineMem2 = new Uint8Array(mem);
    mem.set(baselineMem2);
    const trace2000 = traceTarget(ex2, cpu2, mem, TRACE_BUDGET_LONG, '2000-step trace of 0x0AF175');
    console.log('--- 2000-step trace results ---');
    console.log(JSON.stringify(trace2000, null, 2));
    console.log();
  } else {
    console.log('=== PART 4: Extended trace not needed (500-step trace completed) ===\n');
  }

  // ---- Summary ----
  console.log('=== Summary ===\n');
  console.log(`Target: ${hex(TARGET)}`);
  console.log(`Callers found: ${callers.length}`);
  console.log(`Disassembled instructions: ${rows.length}`);
  console.log(`500-step trace: ${trace500.termination}, ${trace500.stepsTaken} steps, ${trace500.uniqueBlockCount} unique blocks`);
  console.log(`D02661: ${trace500.d02661.before} -> ${trace500.d02661.after}`);
  console.log(`D00824: ${trace500.d00824.before} -> ${trace500.d00824.after}`);
  console.log(`Reached armer (0x0AF1DC): ${trace500.reachedArmer ? 'YES' : 'no'}`);
  console.log(`Reached clearer (0x0AF76E): ${trace500.reachedClearer ? 'YES' : 'no'}`);
  if (trace500.missingBlocks.length > 0) {
    console.log(`Missing blocks: ${trace500.missingBlocks.join(', ')}`);
  }
  console.log();
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase248-0af175-display-chain.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
