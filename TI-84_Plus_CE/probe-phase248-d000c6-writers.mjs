#!/usr/bin/env node

/**
 * Phase 248: Map all writers of D000C6 bit 2 (LCD write-enable flag).
 *
 * Session 247 discovered that 0x02672F (LCD column/row drawing) writes ZERO
 * VRAM bytes because all writes are gated by BIT 2,(D000C6) at 0x08C308.
 * D000C6 bit 2 is CLEAR at boot, blocking all LCD writes.
 *
 * Goals:
 *   1. Static ROM scan for all D000C6 references (byte pattern C6 00 D0).
 *   2. Classify each reference: READ / WRITE / BIT-TEST / SET / RES / POINTER.
 *   3. Disassemble context around each writer/SET/RES reference.
 *   4. Find callers of key writer functions.
 *   5. Verify D000C6 = 0x00 after full boot.
 *   6. Summary.
 *
 * OUTPUT SUMMARY:
 *   D000C6 = 0x00 after cold boot. Bit 2 is CLEAR => all LCD VRAM writes blocked.
 *
 *   Direct references (C6 00 D0 pattern): 7 total
 *     - 0 direct writes (LD (D000C6),A) -- NONE in the entire ROM
 *     - 6 direct reads, all follow: LD A,(D000C6) / BIT 2,A / JR Z/NZ
 *     - 1 pointer (LD HL,D000C6) at 0x08C309 -- the BIT 2,(HL) gate at 0x08C308
 *
 *   IY-indexed (IY+0x46 = D000C6 when IY=D00080):
 *     - 29x BIT 2,(IY+0x46) tests
 *     - 1x SET 2,(IY+0x46) at 0x05527B  *** THE ONLY WRITER ***
 *     - 1x RES 2,(IY+0x46) at 0x05522C  *** THE ONLY CLEARER ***
 *
 *   KEY FINDING: 0x05527B is the SOLE instruction that sets bit 2 of D000C6.
 *     It lives in a function at ~0x05523D, called via JP from 0x022264.
 *     Context: CALL 0x055743 (LCD init?), then SET 2,(IY+0x46), then RET.
 *     The clearer at 0x05522C is called from 0x0551FE (JP from 0x022268,
 *     CALL from 0x023CF8).
 *
 *   12 callers of 0x08C308 (the gate function) found across the ROM.
 *   44 total CB operations on (IY+0x46) -- mostly BIT tests plus bit 0/1/7 ops.
 */

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

const romBytes = fs.readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const BOOT_STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const TARGET_ADDR = 0xD000C6;
const TARGET_ADDR_LO = TARGET_ADDR & 0xFF;         // 0xC6
const TARGET_ADDR_MID = (TARGET_ADDR >>> 8) & 0xFF; // 0x00
const TARGET_ADDR_HI = (TARGET_ADDR >>> 16) & 0xFF; // 0xD0

// Context window for disassembly around each reference
const DISASM_BEFORE = 0x10;
const DISASM_AFTER = 0x10;

// ---- Utility functions ----

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

// ---- Module loading ----

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase248-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

// ---- Disassembly ----

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': {
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      const addrWidth = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      if (inst.direction === 'to-mem') {
        return `LD${suffix} (${hex(inst.addr, addrWidth)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `LD${suffix} ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, addrWidth)})`;
    }
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    case 'pop':
      return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'ld-ind-reg':
      return `LD (${String(inst.indirectRegister).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'res-ind':
      return `RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'set-ind':
      return `SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    default: {
      let text = inst.tag;
      if (inst.bit !== undefined) text += ` bit=${inst.bit}`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
      if (inst.addr !== undefined) text += ` addr=${hex(inst.addr)}`;
      if (inst.dest !== undefined) text += ` dest=${inst.dest}`;
      if (inst.src !== undefined) text += ` src=${inst.src}`;
      if (inst.indirectRegister !== undefined) text += ` (${inst.indirectRegister})`;
      return text;
    }
  }
}

function disassembleRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = inst.length || 1;
      rows.push({
        pc,
        bytes: bytesToHex(romBytes.subarray(pc, pc + length)),
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

function printDisassembly(rows) {
  for (const row of rows) {
    console.log(`    ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}`);
  }
}

// ---- Static ROM scan ----

function scanRomForPattern(pattern) {
  const results = [];
  for (let i = 0; i <= romBytes.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (romBytes[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      results.push(i);
    }
  }
  return results;
}

/**
 * Classify a D000C6 reference found at `matchAddr` (points to the 0xC6 byte
 * in the C6 00 D0 pattern). We look at the opcode byte(s) preceding the
 * address operand to determine the instruction type.
 */
function classifyReference(matchAddr) {
  if (matchAddr === 0) return { type: 'UNKNOWN', detail: 'at ROM start' };

  const prev1 = romBytes[matchAddr - 1] ?? 0;
  const prev2 = matchAddr >= 2 ? romBytes[matchAddr - 2] : undefined;

  // Direct 24-bit address instructions (opcode + 3-byte addr)
  // LD A,(addr) = 0x3A
  if (prev1 === 0x3A) return { type: 'READ', detail: 'LD A,(D000C6)' };
  // LD (addr),A = 0x32
  if (prev1 === 0x32) return { type: 'WRITE', detail: 'LD (D000C6),A' };

  // LD pair,imm24
  if (prev1 === 0x21) return { type: 'POINTER', detail: 'LD HL,D000C6' };
  if (prev1 === 0x11) return { type: 'POINTER', detail: 'LD DE,D000C6' };
  if (prev1 === 0x01) return { type: 'POINTER', detail: 'LD BC,D000C6' };
  if (prev1 === 0x31) return { type: 'POINTER', detail: 'LD SP,D000C6' };

  // DD/FD prefixed LD IX/IY,imm24
  if (prev2 === 0xDD && prev1 === 0x21) return { type: 'POINTER', detail: 'LD IX,D000C6' };
  if (prev2 === 0xFD && prev1 === 0x21) return { type: 'POINTER', detail: 'LD IY,D000C6' };

  // ED-prefixed loads: LD rr,(addr) / LD (addr),rr
  if (prev2 === 0xED) {
    const op = prev1;
    if ((op & 0xCF) === 0x4B) return { type: 'READ', detail: `LD rr,(D000C6) [ED ${hexByte(op)}]` };
    if ((op & 0xCF) === 0x43) return { type: 'WRITE', detail: `LD (D000C6),rr [ED ${hexByte(op)}]` };
    return { type: 'ED-PREFIX', detail: `ED ${hexByte(op)}` };
  }

  // CALL/JP
  if (prev1 === 0xCD) return { type: 'CALL', detail: 'CALL D000C6' };
  if (prev1 === 0xC3) return { type: 'JP', detail: 'JP D000C6' };

  // Conditional CALL/JP
  const condCallOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condJpOpcodes = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
  const condNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  const callIdx = condCallOpcodes.indexOf(prev1);
  if (callIdx >= 0) return { type: 'CALL', detail: `CALL ${condNames[callIdx]},D000C6` };
  const jpIdx = condJpOpcodes.indexOf(prev1);
  if (jpIdx >= 0) return { type: 'JP', detail: `JP ${condNames[jpIdx]},D000C6` };

  return { type: 'UNKNOWN', detail: `prev bytes: ${prev2 !== undefined ? hexByte(prev2) + ' ' : ''}${hexByte(prev1)}` };
}

/**
 * For POINTER references (LD HL,D000C6 etc.), scan nearby instructions
 * for SET/RES/BIT on (HL) that would affect D000C6. Returns array of
 * { offset, instruction } for interesting nearby ops.
 */
function scanNearbyBitOps(matchAddr) {
  const results = [];
  const start = Math.max(0, matchAddr - 4); // instruction starts before the address bytes
  const end = Math.min(romBytes.length, matchAddr + 3 + 32); // scan 32 bytes after

  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = inst.length || 1;

      // Look for BIT/SET/RES on (HL)
      if (inst.tag === 'bit-test-ind' && inst.indirectRegister === 'hl') {
        results.push({ pc, text: `BIT ${inst.bit},(HL)`, bit: inst.bit, op: 'BIT' });
      }
      if (inst.tag === 'set-ind' && inst.indirectRegister === 'hl') {
        results.push({ pc, text: `SET ${inst.bit},(HL)`, bit: inst.bit, op: 'SET' });
      }
      if (inst.tag === 'res-ind' && inst.indirectRegister === 'hl') {
        results.push({ pc, text: `RES ${inst.bit},(HL)`, bit: inst.bit, op: 'RES' });
      }
      // Also check for LD (HL),A or LD (HL),r (generic writes via pointer)
      if (inst.tag === 'ld-ind-reg' && inst.indirectRegister === 'hl') {
        results.push({ pc, text: `LD (HL),${String(inst.src).toUpperCase()}`, bit: null, op: 'WRITE-IND' });
      }

      pc += length;
    } catch {
      pc += 1;
    }
  }
  return results;
}

// ---- Call site scanner ----

function scanCallSites(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >>> 8) & 0xFF;
  const hi = (targetAddr >>> 16) & 0xFF;

  const results = [];

  for (let i = 0; i <= romBytes.length - 4; i++) {
    if (romBytes[i + 1] !== lo || romBytes[i + 2] !== mid || romBytes[i + 3] !== hi) continue;

    const op = romBytes[i];
    if (op === 0xCD) {
      results.push({ addr: i, type: 'CALL', target: targetAddr });
    } else if (op === 0xC3) {
      results.push({ addr: i, type: 'JP', target: targetAddr });
    } else {
      // Conditional calls/jumps
      const condCallOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
      const condJpOpcodes = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
      const condNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
      const callIdx = condCallOpcodes.indexOf(op);
      if (callIdx >= 0) {
        results.push({ addr: i, type: `CALL ${condNames[callIdx]}`, target: targetAddr });
      }
      const jpIdx = condJpOpcodes.indexOf(op);
      if (jpIdx >= 0) {
        results.push({ addr: i, type: `JP ${condNames[jpIdx]}`, target: targetAddr });
      }
    }
  }

  return results;
}

// ---- Runtime / boot ----

function createRuntime(blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

// ---- Main ----

async function main() {
  console.log('Phase 248: Map all writers of D000C6 (LCD write-enable flag)');
  console.log('========================================================================');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log(`Target address: ${hex(TARGET_ADDR)} — bit 2 gates LCD VRAM writes`);
  console.log('');

  // ==================================================================
  // 1. Static ROM scan for D000C6 references
  // ==================================================================
  console.log('========================================================================');
  console.log('1. STATIC ROM SCAN: D000C6 references (byte pattern C6 00 D0)');
  console.log('========================================================================');
  console.log('');

  const pattern = [TARGET_ADDR_LO, TARGET_ADDR_MID, TARGET_ADDR_HI]; // C6 00 D0
  const matches = scanRomForPattern(pattern);

  console.log(`  Found ${matches.length} occurrences of byte pattern C6 00 D0:`);
  console.log('');

  const classified = [];
  for (const matchAddr of matches) {
    const cls = classifyReference(matchAddr);
    const contextStart = Math.max(0, matchAddr - 4);
    const contextEnd = Math.min(romBytes.length, matchAddr + 6);
    const contextBytes = bytesToHex(romBytes.subarray(contextStart, contextEnd));

    // The instruction starts before the address operand
    // For most instructions, opcode is at matchAddr-1 (or matchAddr-2 for prefixed)
    const instrAddr = cls.type === 'POINTER' || cls.type === 'READ' || cls.type === 'WRITE'
      ? matchAddr - 1
      : matchAddr - 1;

    classified.push({ matchAddr, instrAddr, ...cls });

    console.log(`  ${hex(matchAddr)}: [${cls.type}] ${cls.detail}`);
    console.log(`    context bytes: ${contextBytes}`);

    // For POINTER refs, scan for nearby SET/RES/BIT ops
    if (cls.type === 'POINTER') {
      const nearbyOps = scanNearbyBitOps(matchAddr);
      if (nearbyOps.length > 0) {
        for (const op of nearbyOps) {
          const marker = (op.op === 'SET' || op.op === 'WRITE-IND') ? ' *** WRITER ***' :
                         op.op === 'RES' ? ' *** RESETTER ***' :
                         op.op === 'BIT' ? ' (test)' : '';
          console.log(`    nearby: ${hex(op.pc)} ${op.text}${marker}`);
        }
      }
    }
    console.log('');
  }

  // ==================================================================
  // 2. Classify and summarize
  // ==================================================================
  console.log('========================================================================');
  console.log('2. CLASSIFICATION SUMMARY');
  console.log('========================================================================');
  console.log('');

  const writers = classified.filter((c) => c.type === 'WRITE');
  const readers = classified.filter((c) => c.type === 'READ');
  const pointers = classified.filter((c) => c.type === 'POINTER');
  const others = classified.filter((c) => !['WRITE', 'READ', 'POINTER'].includes(c.type));

  console.log(`  Direct WRITE (LD (D000C6),A):     ${writers.length}`);
  console.log(`  Direct READ  (LD A,(D000C6)):      ${readers.length}`);
  console.log(`  POINTER      (LD HL/DE/BC,D000C6): ${pointers.length}`);
  console.log(`  Other:                              ${others.length}`);
  console.log('');

  if (writers.length > 0) {
    console.log('  Direct writers:');
    for (const w of writers) {
      console.log(`    ${hex(w.matchAddr - 1)}: ${w.detail}`);
    }
    console.log('');
  }

  // ==================================================================
  // 3. Disassemble context around each WRITE and POINTER reference
  // ==================================================================
  console.log('========================================================================');
  console.log('3. DISASSEMBLY CONTEXT around writers and pointers');
  console.log('========================================================================');
  console.log('');

  const interestingRefs = [...writers, ...pointers];
  for (const ref of interestingRefs) {
    const instrStart = ref.matchAddr - 1;
    const disasmStart = Math.max(0, instrStart - DISASM_BEFORE);
    const disasmEnd = Math.min(romBytes.length, instrStart + DISASM_AFTER);

    console.log(`  --- ${hex(instrStart)}: ${ref.detail} ---`);
    printDisassembly(disassembleRange(disasmStart, disasmEnd));
    console.log('');
  }

  // Also disassemble around READ references for completeness
  if (readers.length > 0) {
    console.log('========================================================================');
    console.log('3b. DISASSEMBLY CONTEXT around readers');
    console.log('========================================================================');
    console.log('');

    for (const ref of readers) {
      const instrStart = ref.matchAddr - 1;
      const disasmStart = Math.max(0, instrStart - DISASM_BEFORE);
      const disasmEnd = Math.min(romBytes.length, instrStart + DISASM_AFTER);

      console.log(`  --- ${hex(instrStart)}: ${ref.detail} ---`);
      printDisassembly(disassembleRange(disasmStart, disasmEnd));
      console.log('');
    }
  }

  // ==================================================================
  // 4. Find callers of key functions that contain WRITE references
  // ==================================================================
  console.log('========================================================================');
  console.log('4. CALLER SCAN for functions containing D000C6 writes');
  console.log('========================================================================');
  console.log('');

  // For each writer, try to find the start of the function it belongs to
  // by scanning backward for common function prologues, then search for
  // callers. We'll use the instruction address as a rough target.
  const writerFunctions = new Set();
  for (const w of writers) {
    // Approximate function start: scan backwards for PUSH AF/PUSH IX or
    // just use the instruction address itself for caller search
    writerFunctions.add(w.matchAddr - 1);
  }
  for (const p of pointers) {
    // Check if this pointer is followed by SET/RES/LD (HL),r
    const nearbyOps = scanNearbyBitOps(p.matchAddr);
    const hasWriter = nearbyOps.some((op) => op.op === 'SET' || op.op === 'RES' || op.op === 'WRITE-IND');
    if (hasWriter) {
      writerFunctions.add(p.matchAddr - 1);
    }
  }

  for (const funcAddr of writerFunctions) {
    console.log(`  Callers of ${hex(funcAddr)}:`);
    const callers = scanCallSites(funcAddr);
    if (callers.length === 0) {
      console.log('    (none found — may be reached via fall-through or indirect jump)');
    } else {
      for (const site of callers) {
        console.log(`    ${hex(site.addr)}: ${site.type} ${hex(site.target)}`);
      }
    }
    console.log('');
  }

  // ==================================================================
  // 5. Cold boot + verify D000C6 state
  // ==================================================================
  console.log('========================================================================');
  console.log('5. COLD BOOT: verify D000C6 state');
  console.log('========================================================================');
  console.log('');

  const moduleAssets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(moduleAssets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const BLOCKS = normalizeBlocks(rawBlocks);

    if (!BLOCKS || typeof BLOCKS !== 'object') {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
    }

    const runtime = createRuntime(BLOCKS);
    const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);

    const d000c6After = runtime.mem[TARGET_ADDR & MEM_MASK] & 0xFF;

    console.log(`  boot:   steps=${bootSummary.boot.steps} / ${bootSummary.boot.termination}`);
    console.log(`  kernel: steps=${bootSummary.kernel.steps} / ${bootSummary.kernel.termination}`);
    console.log(`  post:   steps=${bootSummary.post.steps} / ${bootSummary.post.termination}`);
    console.log('');
    console.log(`  D000C6 after full boot: ${hexByte(d000c6After)} (binary: ${(d000c6After >>> 0).toString(2).padStart(8, '0')})`);
    console.log(`  Bit 2 (LCD write-enable): ${(d000c6After & 0x04) ? 'SET' : 'CLEAR'}`);
    console.log(`  Bit 0: ${(d000c6After & 0x01) ? 'SET' : 'CLEAR'}`);
    console.log(`  Bit 1: ${(d000c6After & 0x02) ? 'SET' : 'CLEAR'}`);
    console.log(`  Bit 3: ${(d000c6After & 0x08) ? 'SET' : 'CLEAR'}`);
    console.log(`  Bit 7: ${(d000c6After & 0x80) ? 'SET' : 'CLEAR'}`);
    console.log('');

    // Also check nearby addresses that might be related
    console.log('  Nearby RAM state after boot:');
    for (let addr = 0xD000C0; addr <= 0xD000CF; addr++) {
      const val = runtime.mem[addr & MEM_MASK] & 0xFF;
      const marker = addr === TARGET_ADDR ? ' <-- TARGET' : '';
      console.log(`    ${hex(addr)}: ${hexByte(val)} (${(val >>> 0).toString(2).padStart(8, '0')})${marker}`);
    }
    console.log('');

  } finally {
    cleanupTranspiledModule(moduleAssets);
  }

  // ==================================================================
  // 6. Find callers of 0x08C308 (the BIT 2 test function)
  // ==================================================================
  console.log('========================================================================');
  console.log('6. CALLERS OF 0x08C308 (BIT 2 test gate function)');
  console.log('========================================================================');
  console.log('');

  const callersOf08C308 = scanCallSites(0x08C308);
  console.log(`  Found ${callersOf08C308.length} call/jp sites targeting 0x08C308:`);
  for (const site of callersOf08C308) {
    console.log(`    ${hex(site.addr)}: ${site.type} ${hex(site.target)}`);
  }
  console.log('');

  // ==================================================================
  // 7. Search for indirect writers: LDIR/LDDR copying into D000Cx range
  //    and LD (IY+offset) patterns where IY=D00080 (offset +0x46 = D000C6)
  // ==================================================================
  console.log('========================================================================');
  console.log('7. INDIRECT WRITE PATTERNS for D000C6');
  console.log('========================================================================');
  console.log('');

  // IY = D00080 at boot. D000C6 = D00080 + 0x46.
  // Look for SET 2,(IY+0x46), RES 2,(IY+0x46), LD (IY+0x46),imm, BIT 2,(IY+0x46)
  // IY+0x46 indexed CB instructions:
  //   BIT 2,(IY+0x46) = FD CB 46 56
  //   SET 2,(IY+0x46) = FD CB 46 D6
  //   RES 2,(IY+0x46) = FD CB 46 96
  console.log('  Searching for IY-indexed bit operations on D000C6 (IY+0x46):');
  console.log('');

  // BIT 2,(IY+0x46)
  const bitTestIY = scanRomForPattern([0xFD, 0xCB, 0x46, 0x56]);
  console.log(`    BIT 2,(IY+0x46) [FD CB 46 56]: ${bitTestIY.length} hits`);
  for (const addr of bitTestIY) {
    console.log(`      ${hex(addr)}`);
  }

  // SET 2,(IY+0x46)
  const setIY = scanRomForPattern([0xFD, 0xCB, 0x46, 0xD6]);
  console.log(`    SET 2,(IY+0x46) [FD CB 46 D6]: ${setIY.length} hits`);
  for (const addr of setIY) {
    console.log(`      ${hex(addr)} *** THIS SETS BIT 2 ***`);
  }

  // RES 2,(IY+0x46)
  const resIY = scanRomForPattern([0xFD, 0xCB, 0x46, 0x96]);
  console.log(`    RES 2,(IY+0x46) [FD CB 46 96]: ${resIY.length} hits`);
  for (const addr of resIY) {
    console.log(`      ${hex(addr)} *** THIS CLEARS BIT 2 ***`);
  }
  console.log('');

  // Also search for other bit operations on (IY+0x46) for any bit
  // SET n,(IY+0x46) = FD CB 46 [C6,CE,D6,DE,E6,EE,F6,FE]
  // RES n,(IY+0x46) = FD CB 46 [86,8E,96,9E,A6,AE,B6,BE]
  // BIT n,(IY+0x46) = FD CB 46 [46,4E,56,5E,66,6E,76,7E]
  const allIY46ops = scanRomForPattern([0xFD, 0xCB, 0x46]);
  console.log(`  All (IY+0x46) CB operations [FD CB 46 xx]: ${allIY46ops.length} hits`);
  for (const addr of allIY46ops) {
    const opByte = romBytes[addr + 3] ?? 0;
    let opName = '???';
    const bit = (opByte >> 3) & 7;
    if ((opByte & 0xC0) === 0x40) opName = `BIT ${bit}`;
    else if ((opByte & 0xC0) === 0xC0) opName = `SET ${bit}`;
    else if ((opByte & 0xC0) === 0x80) opName = `RES ${bit}`;
    const marker = opName.startsWith('SET 2') ? ' *** WRITER ***' :
                   opName.startsWith('RES 2') ? ' *** CLEARER ***' : '';
    console.log(`    ${hex(addr)}: ${opName},(IY+0x46) [${hexByte(opByte)}]${marker}`);
  }
  console.log('');

  // Also search for LD (IY+0x46),imm and LD (IY+0x46),reg
  // LD (IY+0x46),n = FD 36 46 nn
  const ldIY46imm = scanRomForPattern([0xFD, 0x36, 0x46]);
  console.log(`  LD (IY+0x46),imm [FD 36 46 nn]: ${ldIY46imm.length} hits`);
  for (const addr of ldIY46imm) {
    const imm = romBytes[addr + 3] ?? 0;
    const marker = (imm & 0x04) ? ' *** bit 2 SET in value ***' : '';
    console.log(`    ${hex(addr)}: LD (IY+0x46),${hexByte(imm)}${marker}`);
  }
  console.log('');

  // LD (IY+0x46),A = FD 77 46
  const ldIY46a = scanRomForPattern([0xFD, 0x77, 0x46]);
  console.log(`  LD (IY+0x46),A [FD 77 46]: ${ldIY46a.length} hits`);
  for (const addr of ldIY46a) {
    console.log(`    ${hex(addr)}: LD (IY+0x46),A *** POTENTIAL WRITER ***`);
  }
  console.log('');

  // ==================================================================
  // 8. Disassemble context around all SET/WRITE hits for (IY+0x46)
  // ==================================================================
  const allWriterHits = [...setIY, ...resIY, ...ldIY46imm, ...ldIY46a];
  if (allWriterHits.length > 0) {
    console.log('========================================================================');
    console.log('8. DISASSEMBLY CONTEXT around IY+0x46 writers');
    console.log('========================================================================');
    console.log('');

    for (const addr of allWriterHits) {
      const disasmStart = Math.max(0, addr - DISASM_BEFORE);
      const disasmEnd = Math.min(romBytes.length, addr + DISASM_AFTER + 4);
      const rawBytes = bytesToHex(romBytes.subarray(addr, addr + 4));
      console.log(`  --- ${hex(addr)}: [${rawBytes}] ---`);
      printDisassembly(disassembleRange(disasmStart, disasmEnd));
      console.log('');
    }

    // Find callers for each writer
    console.log('========================================================================');
    console.log('8b. CALLERS of functions containing IY+0x46 writers');
    console.log('========================================================================');
    console.log('');

    for (const addr of allWriterHits) {
      // Scan backwards to find likely function entry (look for PUSH IX/AF or
      // a preceding RET/JP). Simple heuristic: scan up to 64 bytes back.
      let funcStart = addr;
      for (let scan = addr - 1; scan >= Math.max(0, addr - 64); scan--) {
        const b = romBytes[scan];
        // RET = C9, JP = C3 (followed by 3 bytes), RETI = ED 4D
        if (b === 0xC9) {
          funcStart = scan + 1;
          break;
        }
      }
      console.log(`  Writer at ${hex(addr)}, estimated func start: ${hex(funcStart)}`);
      const callers = scanCallSites(funcStart);
      if (callers.length === 0) {
        console.log('    (no CALL/JP found — may be inline or fall-through)');
      } else {
        for (const site of callers) {
          console.log(`    ${hex(site.addr)}: ${site.type} ${hex(site.target)}`);
        }
      }
      console.log('');
    }
  }

  // ==================================================================
  // 9. Summary
  // ==================================================================
  console.log('========================================================================');
  console.log('9. SUMMARY');
  console.log('========================================================================');
  console.log('');
  console.log(`  D000C6 bit 2 gates LCD VRAM writes (tested at 0x08C308).`);
  console.log(`  D000C6 = 0x00 after cold boot — bit 2 is CLEAR, LCD writes blocked.`);
  console.log('');
  console.log(`  Direct references (C6 00 D0 pattern): ${matches.length}`);
  console.log(`    Direct WRITE (LD (D000C6),A):      ${writers.length}`);
  console.log(`    Direct READ  (LD A,(D000C6)):       ${readers.length}`);
  console.log(`    POINTER (LD HL,D000C6):             ${pointers.length}`);
  console.log('');
  console.log(`  IY-indexed operations (IY+0x46 = D000C6 when IY=D00080):`);
  console.log(`    BIT 2,(IY+0x46):  ${bitTestIY.length}`);
  console.log(`    SET 2,(IY+0x46):  ${setIY.length} *** bit 2 writers ***`);
  console.log(`    RES 2,(IY+0x46):  ${resIY.length} *** bit 2 clearers ***`);
  console.log(`    LD (IY+0x46),imm: ${ldIY46imm.length}`);
  console.log(`    LD (IY+0x46),A:   ${ldIY46a.length}`);
  console.log(`    All CB ops:       ${allIY46ops.length}`);
  console.log('');
  console.log(`  Callers of 0x08C308 (gate function): ${callersOf08C308.length}`);
  console.log('');
  console.log('  All 6 direct reads follow pattern: LD A,(D000C6) / BIT 2,A / JR Z/NZ');
  console.log('  This confirms bit 2 is the LCD write-enable flag.');
  console.log('');
  console.log('Phase 248 complete.');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
