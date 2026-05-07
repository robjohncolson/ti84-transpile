#!/usr/bin/env node

/**
 * Phase 227: Trace 0x023B6B SET 1,(IY+53) site — find what HL contains.
 *
 * 0x023B6B is one of only 2 sites that SET 1,(IY+53). It also stores HL to
 * D02611 BEFORE setting the flag. When the flag is later tested at 0x051D43,
 * function 0x02398E is called (which preserves HL from the caller), and HL
 * eventually feeds the D0059F magic-value writer at 0x051D4D.
 *
 * Parts:
 *   A — Static disassembly around 0x023B6B (0x023B00..0x023BD0)
 *   B — Find callers of the function containing 0x023B6B
 *   C — Static disassembly around 0x0454FC (second SET 1,(IY+53) site)
 *   D — Find callers of the function containing 0x0454FC
 *   E — Dynamic trace after full boot
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const rom = readFileSync(ROM_PATH);
const mod = await import('./ROM.transpiled.js');
const RAW_BLOCKS =
  mod.PRELIFTED_BLOCKS ??
  mod.default?.PRELIFTED_BLOCKS ??
  mod.default ??
  mod;
const BLOCKS = normalizeBlocks(RAW_BLOCKS);

const MEM_SIZE = 0x1000000;
const ROM_SCAN_LIMIT = 0x0c0000;
const MBASE = 0xd0;
const IY = 0xd00080;
const IX = 0xd1a860;
const STACK_TOP = 0xd1a87e;
const SENTINEL = 0x7ffffe;

const SET_SITE_1 = 0x023b6b;  // SET 1,(IY+53) + stores HL to D02611
const SET_SITE_2 = 0x0454fc;  // second SET 1,(IY+53) site
const D02611 = 0xd02611;
const D000B5 = 0xd000b5;      // IY+53

// Boot addresses
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT = 0x08c331;
const POST_INIT = 0x0802b2;
const MEM_INIT = 0x09dee0;

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return raw ?? {};
}

function hex(v, w = 6) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function hb(v) {
  return hex((v ?? 0) & 0xff, 2);
}

function bhex(buf, start, len) {
  const s = Math.max(0, start);
  const e = Math.min(buf.length, start + len);
  return Array.from(buf.slice(s, e), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read24(buf, addr) {
  const a = addr & 0xffffff;
  return ((buf[a] & 0xff) | ((buf[a + 1] & 0xff) << 8) | ((buf[a + 2] & 0xff) << 16)) >>> 0;
}

function write24(buf, addr, value) {
  const a = addr & 0xffffff;
  buf[a] = value & 0xff;
  buf[a + 1] = (value >>> 8) & 0xff;
  buf[a + 2] = (value >>> 16) & 0xff;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, value & 0xffffff);
}

function stopError(name) {
  const e = new Error('__PROBE_STOP__');
  e.stopName = name;
  return e;
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc & 0xffffff, 'adl');
  } catch {
    return null;
  }
}

function effAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xff) << 16) | (inst.addr & 0xffff)) >>> 0;
  }
  return inst.addr >>> 0;
}

function fmt(inst) {
  if (!inst) return 'db ?';
  const p = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  const ix = (r, d) => `(${String(r).toUpperCase()}${d >= 0 ? '+' : ''}${d})`;
  switch (inst.tag) {
    case 'nop': return `${p}NOP`;
    case 'halt': return `${p}HALT`;
    case 'ret': return `${p}RET`;
    case 'ret-conditional': return `${p}RET ${String(inst.condition).toUpperCase()}`;
    case 'call': return `${p}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${p}CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp': return `${p}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp-indirect': return `${p}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${p}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'djnz': return `${p}DJNZ ${hex(inst.target)}`;
    case 'push': return `${p}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${p}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `${p}LD ${String(inst.pair).toUpperCase()},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${p}LD (${hex(effAddr(inst) ?? inst.addr)}),${String(inst.pair).toUpperCase()}`
        : `${p}LD ${String(inst.pair).toUpperCase()},(${hex(effAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${p}LD (${hex(effAddr(inst) ?? inst.addr)}),${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm': return `${p}LD ${String(inst.dest).toUpperCase()},${hb(inst.value)}`;
    case 'ld-reg-reg': return `${p}LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${p}LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${p}LD (${String(inst.dest).toUpperCase()}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${p}LD ${String(inst.dest).toUpperCase()},(${hex(effAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${p}LD (${hex(effAddr(inst) ?? inst.addr)}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${p}LD ${String(inst.dest).toUpperCase()},${ix(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${p}LD ${ix(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${p}LD ${ix(inst.indexRegister, inst.displacement)},${hb(inst.value)}`;
    case 'inc-pair': return `${p}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${p}DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${p}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${p}DEC ${String(inst.reg).toUpperCase()}`;
    case 'add-pair': return `${p}ADD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${p}${String(inst.op).toUpperCase()} ${hb(inst.value)}`;
    case 'alu-reg': return `${p}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-ind': return `${p}${String(inst.op).toUpperCase()} (${String(inst.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'bit-test': return `${p}BIT ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `${p}BIT ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind': return `${p}RES ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind': return `${p}SET ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit': {
      const opType = inst.bitOp ?? 'bit';
      const opName = opType === 'set' ? 'SET' : opType === 'res' ? 'RES' : 'BIT';
      return `${p}${opName} ${inst.bit},${ix(inst.indexRegister, inst.displacement)}`;
    }
    case 'indexed-cb-set': return `${p}SET ${inst.bit},${ix(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${p}RES ${inst.bit},${ix(inst.indexRegister, inst.displacement)}`;
    case 'ex-de-hl': return `${p}EX DE,HL`;
    case 'ex-af': return `${p}EX AF,AF'`;
    case 'exx': return `${p}EXX`;
    case 'ld-sp-hl': return `${p}LD SP,HL`;
    case 'cpl': return `${p}CPL`;
    case 'daa': return `${p}DAA`;
    case 'scf': return `${p}SCF`;
    case 'ccf': return `${p}CCF`;
    case 'di': return `${p}DI`;
    case 'ei': return `${p}EI`;
    case 'ldi': return `${p}LDI`;
    case 'ldir': return `${p}LDIR`;
    case 'ldd': return `${p}LDD`;
    case 'lddr': return `${p}LDDR`;
    case 'reti': return `${p}RETI`;
    case 'retn': return `${p}RETN`;
    case 'rst': return `${p}RST ${hex(inst.target, 2)}`;
    case 'rla': return `${p}RLA`;
    case 'rra': return `${p}RRA`;
    case 'rlca': return `${p}RLCA`;
    case 'rrca': return `${p}RRCA`;
    case 'im': return `${p}IM ${inst.mode ?? '?'}`;
    default: {
      const extra = Object.fromEntries(
        Object.entries(inst).filter(([k]) =>
          !['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(k)),
      );
      return `${p}${inst.tag}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`;
    }
  }
}

function disasm(start, end) {
  const out = [];
  for (let pc = start; pc < Math.min(end, rom.length);) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length || inst.nextPc <= pc) {
      out.push({ pc, bytes: bhex(rom, pc, 1), text: `DB ${hb(rom[pc])}`, inst: null });
      pc++;
      continue;
    }
    out.push({ pc, bytes: bhex(rom, pc, inst.length), text: fmt(inst), inst });
    pc += inst.length;
  }
  return out;
}

function printDisasm(title, rows) {
  console.log(`\n--- ${title} ---\n`);
  for (const r of rows) {
    const marker = (r.inst?.tag === 'ret') ? ' <-- RET' :
      (r.pc === SET_SITE_1 || r.pc === SET_SITE_2) ? ' <== SET 1,(IY+53) TARGET' : '';
    console.log(`  ${hex(r.pc)}: ${r.bytes.padEnd(30)} ${r.text}${marker}`);
  }
}

// Find function boundary by scanning backwards for RET (C9)
function findFunctionStart(targetAddr) {
  // Scan backwards from target for RET instruction
  for (let pc = targetAddr - 1; pc >= Math.max(0, targetAddr - 200); pc--) {
    if (rom[pc] === 0xc9) {
      // RET found — function likely starts at pc+1
      return pc + 1;
    }
  }
  return null;
}

// Find function end by scanning forward for RET
function findFunctionEnd(startAddr) {
  const rows = disasm(startAddr, startAddr + 300);
  for (const r of rows) {
    if (r.inst?.tag === 'ret' && r.pc > startAddr) {
      return r.pc + (r.inst.length ?? 1);
    }
  }
  return startAddr + 200;
}

// Scan ROM for CALL/JP to a target
function transferScan(target) {
  const lo = target & 0xff;
  const mid = (target >>> 8) & 0xff;
  const hi = (target >>> 16) & 0xff;
  const hits = [];

  // Unconditional CALL (CD) and JP (C3)
  const uncond = [0xcd, 0xc3];
  // Conditional CALLs: C4 CC D4 DC E4 EC F4 FC
  // Conditional JPs: C2 CA D2 DA E2 EA F2 FA
  const condCall = [0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc];
  const condJp = [0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea, 0xf2, 0xfa];
  const condNames = {
    0xc4: 'CALL NZ', 0xcc: 'CALL Z', 0xd4: 'CALL NC', 0xdc: 'CALL C',
    0xe4: 'CALL PO', 0xec: 'CALL PE', 0xf4: 'CALL P', 0xfc: 'CALL M',
    0xc2: 'JP NZ', 0xca: 'JP Z', 0xd2: 'JP NC', 0xda: 'JP C',
    0xe2: 'JP PO', 0xea: 'JP PE', 0xf2: 'JP P', 0xfa: 'JP M',
  };
  const all = new Set([...uncond, ...condCall, ...condJp]);

  for (let pc = 0; pc <= ROM_SCAN_LIMIT - 4; pc++) {
    if (!all.has(rom[pc])) continue;
    if (rom[pc + 1] !== lo || rom[pc + 2] !== mid || rom[pc + 3] !== hi) continue;
    const op = rom[pc];
    const kind = op === 0xcd ? 'CALL' : op === 0xc3 ? 'JP' : (condNames[op] ?? `??${hb(op)}`);
    hits.push({ pc, kind, context: bhex(rom, Math.max(0, pc - 4), 12) });
  }
  return hits;
}

function mkMem() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function mkRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function fullBoot(mem, executor, cpu) {
  // Phase 1: boot entry (z80 mode)
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xff, Math.max(0, cpu.sp), Math.min(mem.length, cpu.sp + 3));

  // Phase 2: kernel init
  executor.runFrom(KERNEL_INIT, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu.iy = IY; cpu.hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xff, Math.max(0, cpu.sp), Math.min(mem.length, cpu.sp + 3));

  // Phase 3: post-init
  executor.runFrom(POST_INIT, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  // Phase 4: mem init
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = MBASE; cpu.iy = IY; cpu.ix = IX;
  cpu.sp = STACK_TOP;
  push24(cpu, mem, SENTINEL);

  try {
    executor.runFrom(MEM_INIT, 'adl', {
      maxSteps: 100000, maxLoopIterations: 8192,
      onBlock(pc) { if ((pc & 0xffffff) === SENTINEL) throw stopError('ret'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === SENTINEL) throw stopError('ret'); },
    });
  } catch (e) {
    if (!(e?.message === '__PROBE_STOP__')) throw e;
  }
}

// ──────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 227: Trace 0x023B6B SET 1,(IY+53) — HL source ===\n');

  // ─── Part A: Static disassembly around 0x023B6B ───

  console.log('========== PART A: Static disassembly around 0x023B6B ==========');

  const funcStart1 = findFunctionStart(SET_SITE_1);
  const funcEnd1 = findFunctionEnd(funcStart1 ?? SET_SITE_1 - 0x40);

  console.log(`\n  Function boundary scan:`);
  console.log(`    Scanning backwards from ${hex(SET_SITE_1)} for RET (C9)...`);
  console.log(`    Function start estimate: ${hex(funcStart1)}`);
  console.log(`    Function end estimate: ${hex(funcEnd1)}`);

  // Wider disassembly: 0x023B00..0x023BD0
  const wideStart = 0x023b00;
  const wideEnd = 0x023bd0;
  const wideRows = disasm(wideStart, wideEnd);
  printDisasm(`Disassembly ${hex(wideStart)}..${hex(wideEnd)}`, wideRows);

  // Also disassemble the detected function boundaries
  if (funcStart1 && funcStart1 < SET_SITE_1) {
    const funcRows = disasm(funcStart1, funcEnd1);
    printDisasm(`Full function containing 0x023B6B: ${hex(funcStart1)}..${hex(funcEnd1)}`, funcRows);

    // Find HL loads/stores before the SET instruction
    console.log('\n  HL-affecting instructions before SET 1,(IY+53):');
    for (const r of funcRows) {
      if (r.pc >= SET_SITE_1) break;
      const i = r.inst;
      if (!i) continue;
      const tag = i.tag ?? '';
      const isHlRelated =
        tag === 'ld-pair-imm' && i.pair === 'hl' ||
        tag === 'ld-pair-mem' && i.pair === 'hl' ||
        tag === 'ld-mem-pair' && i.pair === 'hl' ||
        tag === 'inc-pair' && i.pair === 'hl' ||
        tag === 'dec-pair' && i.pair === 'hl' ||
        tag === 'add-pair' && i.dest === 'hl' ||
        tag === 'ex-de-hl' ||
        tag === 'pop' && i.pair === 'hl' ||
        tag === 'ld-reg-ind' && i.src === 'hl' ||
        tag === 'ld-ind-reg' && i.dest === 'hl';
      if (isHlRelated) {
        console.log(`    ${hex(r.pc)}: ${r.bytes.padEnd(30)} ${r.text}`);
      }
    }

    // Find store to D02611
    console.log('\n  References to D02611 in function:');
    for (const r of funcRows) {
      const i = r.inst;
      if (!i) continue;
      const addr = effAddr(i) ?? i.addr;
      if (addr === D02611 || addr === (D02611 & 0xffff)) {
        console.log(`    ${hex(r.pc)}: ${r.bytes.padEnd(30)} ${r.text}`);
      }
    }

    // Find all CALL/JP targets from the function
    console.log('\n  CALL/JP targets from function:');
    for (const r of funcRows) {
      const i = r.inst;
      if (!i) continue;
      if (['call', 'call-conditional', 'jp', 'jp-conditional'].includes(i.tag)) {
        console.log(`    ${hex(r.pc)}: ${r.text}`);
      }
    }
  }

  // Raw hex dump
  console.log(`\n  Raw hex dump ${hex(wideStart)}..${hex(wideEnd)}:`);
  for (let row = wideStart; row < wideEnd; row += 16) {
    const end = Math.min(row + 16, wideEnd);
    console.log(`    ${hex(row)}: ${bhex(rom, row, end - row)}`);
  }

  // ─── Part B: Find callers of function containing 0x023B6B ───

  console.log('\n\n========== PART B: Callers of function containing 0x023B6B ==========');

  // Try the function start, plus several likely entry points
  const entryPoints1 = new Set();
  if (funcStart1) entryPoints1.add(funcStart1);

  // Also scan for any CALL/JP into the 0x023B00..0x023BD0 range
  console.log(`\n  Scanning for CALL/JP into range ${hex(wideStart)}..${hex(wideEnd)}:`);
  for (let pc = 0; pc <= ROM_SCAN_LIMIT - 4; pc++) {
    const op = rom[pc];
    if (op !== 0xcd && op !== 0xc3 &&
        ![0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc,
          0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea, 0xf2, 0xfa].includes(op)) continue;
    const target = read24(rom, pc + 1);
    if (target >= wideStart && target < wideEnd) {
      entryPoints1.add(target);
      const condNames = {
        0xc4: 'CALL NZ', 0xcc: 'CALL Z', 0xd4: 'CALL NC', 0xdc: 'CALL C',
        0xe4: 'CALL PO', 0xec: 'CALL PE', 0xf4: 'CALL P', 0xfc: 'CALL M',
        0xc2: 'JP NZ', 0xca: 'JP Z', 0xd2: 'JP NC', 0xda: 'JP C',
        0xe2: 'JP PO', 0xea: 'JP PE', 0xf2: 'JP P', 0xfa: 'JP M',
      };
      const kind = op === 0xcd ? 'CALL' : op === 0xc3 ? 'JP' : (condNames[op] ?? `??`);
      console.log(`    ${hex(pc)}: ${kind} ${hex(target)}  ctx=${bhex(rom, Math.max(0, pc - 4), 12)}`);
    }
  }

  // For each unique entry point, do a dedicated caller scan
  for (const entry of entryPoints1) {
    const callers = transferScan(entry);
    if (callers.length > 0) {
      console.log(`\n  Callers of ${hex(entry)}:`);
      for (const c of callers) {
        console.log(`    ${hex(c.pc)}: ${c.kind}  ctx=${c.context}`);
      }
    }
  }

  // ─── Part C: Disassembly around 0x0454FC ───

  console.log('\n\n========== PART C: Static disassembly around 0x0454FC (2nd SET site) ==========');

  const funcStart2 = findFunctionStart(SET_SITE_2);
  const funcEnd2 = findFunctionEnd(funcStart2 ?? SET_SITE_2 - 0x30);

  console.log(`\n  Function boundary scan:`);
  console.log(`    Function start estimate: ${hex(funcStart2)}`);
  console.log(`    Function end estimate: ${hex(funcEnd2)}`);

  const site2Start = Math.max(0, SET_SITE_2 - 0x32);
  const site2End = SET_SITE_2 + 0x32;
  const site2Rows = disasm(site2Start, site2End);
  printDisasm(`Disassembly ${hex(site2Start)}..${hex(site2End)}`, site2Rows);

  // Also full function
  if (funcStart2 && funcStart2 < SET_SITE_2) {
    const func2Rows = disasm(funcStart2, funcEnd2);
    printDisasm(`Full function containing 0x0454FC: ${hex(funcStart2)}..${hex(funcEnd2)}`, func2Rows);

    // Find HL loads before SET
    console.log('\n  HL-affecting instructions before SET at 0x0454FC:');
    for (const r of func2Rows) {
      if (r.pc >= SET_SITE_2) break;
      const i = r.inst;
      if (!i) continue;
      const tag = i.tag ?? '';
      const isHl =
        (tag === 'ld-pair-imm' && i.pair === 'hl') ||
        (tag === 'ld-pair-mem' && i.pair === 'hl') ||
        (tag === 'ld-mem-pair' && i.pair === 'hl') ||
        (tag === 'ex-de-hl') ||
        (tag === 'pop' && i.pair === 'hl') ||
        (tag === 'inc-pair' && i.pair === 'hl') ||
        (tag === 'dec-pair' && i.pair === 'hl') ||
        (tag === 'add-pair' && i.dest === 'hl');
      if (isHl) {
        console.log(`    ${hex(r.pc)}: ${r.bytes.padEnd(30)} ${r.text}`);
      }
    }

    // D02611 references
    console.log('\n  References to D02611 in function:');
    for (const r of func2Rows) {
      const i = r.inst;
      if (!i) continue;
      const addr = effAddr(i) ?? i.addr;
      if (addr === D02611 || addr === (D02611 & 0xffff)) {
        console.log(`    ${hex(r.pc)}: ${r.bytes.padEnd(30)} ${r.text}`);
      }
    }
  }

  // ─── Part D: Callers of function containing 0x0454FC ───

  console.log('\n\n========== PART D: Callers of function containing 0x0454FC ==========');

  const entryPoints2 = new Set();
  if (funcStart2) entryPoints2.add(funcStart2);

  const site2WideStart = Math.max(0, SET_SITE_2 - 0x60);
  const site2WideEnd = SET_SITE_2 + 0x40;
  console.log(`\n  Scanning for CALL/JP into range ${hex(site2WideStart)}..${hex(site2WideEnd)}:`);
  for (let pc = 0; pc <= ROM_SCAN_LIMIT - 4; pc++) {
    const op = rom[pc];
    if (op !== 0xcd && op !== 0xc3 &&
        ![0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc,
          0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea, 0xf2, 0xfa].includes(op)) continue;
    const target = read24(rom, pc + 1);
    if (target >= site2WideStart && target < site2WideEnd) {
      entryPoints2.add(target);
      const condNames = {
        0xc4: 'CALL NZ', 0xcc: 'CALL Z', 0xd4: 'CALL NC', 0xdc: 'CALL C',
        0xe4: 'CALL PO', 0xec: 'CALL PE', 0xf4: 'CALL P', 0xfc: 'CALL M',
        0xc2: 'JP NZ', 0xca: 'JP Z', 0xd2: 'JP NC', 0xda: 'JP C',
        0xe2: 'JP PO', 0xea: 'JP PE', 0xf2: 'JP P', 0xfa: 'JP M',
      };
      const kind = op === 0xcd ? 'CALL' : op === 0xc3 ? 'JP' : (condNames[op] ?? `??`);
      console.log(`    ${hex(pc)}: ${kind} ${hex(target)}  ctx=${bhex(rom, Math.max(0, pc - 4), 12)}`);
    }
  }

  for (const entry of entryPoints2) {
    const callers = transferScan(entry);
    if (callers.length > 0) {
      console.log(`\n  Callers of ${hex(entry)}:`);
      for (const c of callers) {
        console.log(`    ${hex(c.pc)}: ${c.kind}  ctx=${c.context}`);
      }
    }
  }

  // ─── Part E: Dynamic trace after full boot ───

  console.log('\n\n========== PART E: Dynamic trace after full boot ==========');

  const mem = mkMem();
  const { executor, cpu } = mkRuntime(mem);
  fullBoot(mem, executor, cpu);

  // Dump key RAM state
  const ramAddrs = [D02611, D000B5, 0xd0059f, 0xd0033a, 0xd025e1, 0xd025cf];
  console.log('\n  RAM state after full boot:');
  for (const addr of ramAddrs) {
    const bytes = bhex(mem, addr, 16);
    const ptr = read24(mem, addr);
    console.log(`    ${hex(addr)}: ${bytes}  (as ptr: ${hex(ptr)})`);
  }
  console.log(`    IY+53 bit 1 = ${(mem[D000B5] >> 1) & 1}`);

  // Try calling the function containing 0x023B6B directly
  if (funcStart1) {
    console.log(`\n  Attempting dynamic call to function at ${hex(funcStart1)}...`);

    // Reset for call
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu.madl = 1; cpu.mbase = MBASE; cpu.iy = IY; cpu.ix = IX;
    cpu.sp = STACK_TOP;
    cpu.a = 0; cpu.hl = 0; cpu.de = 0; cpu.bc = 0;
    push24(cpu, mem, SENTINEL);

    const visited = [];
    let term = 'max_steps';

    try {
      const result = executor.runFrom(funcStart1, 'adl', {
        maxSteps: 10000,
        maxLoopIterations: 256,
        onBlock(pc) {
          const n = pc & 0xffffff;
          if (n === SENTINEL) throw stopError('ret');
          visited.push(n);
        },
        onMissingBlock(pc) {
          const n = pc & 0xffffff;
          if (n === SENTINEL) throw stopError('ret');
          visited.push(n);
        },
      });
      term = result?.termination ?? term;
    } catch (e) {
      if (e?.message === '__PROBE_STOP__' && e.stopName === 'ret') term = 'sentinel';
      else console.log(`    Error: ${e?.message}`);
    }

    console.log(`    Termination: ${term}`);
    console.log(`    HL after: ${hex(cpu.hl & 0xffffff)}`);
    console.log(`    A after: ${hb(cpu.a)}`);
    console.log(`    DE after: ${hex(cpu.de & 0xffffff)}`);
    console.log(`    BC after: ${hex(cpu.bc & 0xffffff)}`);
    console.log(`    D02611 after: ${hex(read24(mem, D02611))}`);
    console.log(`    IY+53 bit 1 after: ${(mem[D000B5] >> 1) & 1}`);
    console.log(`    Visited ${visited.length} blocks, first 30: ${visited.slice(0, 30).map(hex).join(' -> ')}`);

    // Dump what HL points to
    const hlVal = cpu.hl & 0xffffff;
    if (hlVal > 0 && hlVal < MEM_SIZE - 32) {
      console.log(`    HL points to: ${bhex(mem, hlVal, 32)}`);
      // Check for magic values
      const magics = [];
      for (let j = 0; j < 32; j++) {
        const b = mem[(hlVal + j) & 0xffffff];
        if ([0xfa, 0xfb, 0xfc, 0xfe].includes(b)) {
          magics.push(`[${j}]=${hb(b)}`);
        }
      }
      if (magics.length > 0) console.log(`    MAGIC VALUES at HL: ${magics.join(', ')}`);
    }

    // Dump what D02611 points to
    const d02611Val = read24(mem, D02611);
    if (d02611Val > 0 && d02611Val < MEM_SIZE - 32) {
      console.log(`    D02611 points to: ${bhex(mem, d02611Val, 32)}`);
      const magics = [];
      for (let j = 0; j < 32; j++) {
        const b = mem[(d02611Val + j) & 0xffffff];
        if ([0xfa, 0xfb, 0xfc, 0xfe].includes(b)) {
          magics.push(`[${j}]=${hb(b)}`);
        }
      }
      if (magics.length > 0) console.log(`    MAGIC VALUES at D02611 ptr: ${magics.join(', ')}`);
    }
  }

  // Also look at what value HL has when passing through 0x023B6B during normal OS flow
  // Set up a watchpoint-style trace
  console.log('\n  Watchpoint trace: monitor 0x023B6B during OS main loop...');

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = MBASE; cpu.iy = IY; cpu.ix = IX;
  cpu.sp = STACK_TOP;

  // Try to run from a home-screen entry and see if we hit 0x023B6B
  const HOME_ENTRY = 0x0856a8;
  push24(cpu, mem, SENTINEL);

  const watchHits = [];
  let watchTerm = 'max_steps';

  try {
    executor.runFrom(HOME_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 512,
      onBlock(pc) {
        const n = pc & 0xffffff;
        if (n === SENTINEL) throw stopError('ret');
        // Check if we're near the SET site
        if (n >= (funcStart1 ?? 0x023b00) && n <= SET_SITE_1 + 0x10) {
          watchHits.push({
            pc: hex(n),
            hl: hex(cpu.hl & 0xffffff),
            de: hex(cpu.de & 0xffffff),
            a: hb(cpu.a),
            bc: hex(cpu.bc & 0xffffff),
          });
        }
      },
      onMissingBlock(pc) {
        const n = pc & 0xffffff;
        if (n === SENTINEL) throw stopError('ret');
        if (n >= (funcStart1 ?? 0x023b00) && n <= SET_SITE_1 + 0x10) {
          watchHits.push({
            pc: hex(n),
            hl: hex(cpu.hl & 0xffffff),
            de: hex(cpu.de & 0xffffff),
            a: hb(cpu.a),
            bc: hex(cpu.bc & 0xffffff),
          });
        }
      },
    });
  } catch (e) {
    if (e?.message === '__PROBE_STOP__' && e.stopName === 'ret') watchTerm = 'sentinel';
    else watchTerm = `error: ${e?.message?.substring(0, 100)}`;
  }

  console.log(`    Watch termination: ${watchTerm}`);
  console.log(`    Hits near 0x023B6B: ${watchHits.length}`);
  for (const h of watchHits.slice(0, 20)) {
    console.log(`      PC=${h.pc} HL=${h.hl} DE=${h.de} A=${h.a} BC=${h.bc}`);
  }

  if (watchHits.length > 0) {
    // For each hit, show what HL pointed to
    console.log('\n    HL data at each hit:');
    for (const h of watchHits.slice(0, 10)) {
      const hlAddr = parseInt(h.hl.replace('0x', ''), 16);
      if (hlAddr > 0 && hlAddr < MEM_SIZE - 16) {
        console.log(`      HL=${h.hl}: ${bhex(mem, hlAddr, 16)}`);
      }
    }
  }

  // ─── Summary ───

  console.log('\n\n========== SUMMARY ==========');
  console.log(`  SET 1,(IY+53) site 1: ${hex(SET_SITE_1)}`);
  console.log(`    Function start: ${hex(funcStart1)}`);
  console.log(`    Function end: ${hex(funcEnd1)}`);
  console.log(`  SET 1,(IY+53) site 2: ${hex(SET_SITE_2)}`);
  console.log(`    Function start: ${hex(funcStart2)}`);
  console.log(`    Function end: ${hex(funcEnd2)}`);
  console.log(`  D02611 after boot: ${hex(read24(mem, D02611))}`);
  console.log(`  IY+53 bit 1 after boot: ${(mem[D000B5] >> 1) & 1}`);
  console.log(`  Watch hits near 0x023B6B: ${watchHits.length}`);

  console.log('\n=== Phase 227 Complete ===');
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase227-023b6b-hl-source.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
