#!/usr/bin/env node
// Phase 232 — P2: Trace the function containing SET 0,(IY+29) at 0x02FE9D.
// Determine full function boundary, branch condition for SET vs RES, and callers.
//
// From session 231: 0x02FE9D is the ONLY site in the 4MB ROM that sets bit 0
// of IY+29 (key repeat timer gate). RES at 0x02FEA7 is 10 bytes later.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { CPU, createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const romBytes = fs.readFileSync(ROM_PATH);

const TARGET_SET = 0x02FE9D;
const TARGET_RES = 0x02FEA7;
const IY_BASE = 0xD00080;
const IY_PLUS_29 = IY_BASE + 29; // 0xD0009D
const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;

function hex(v, w = 6) {
  if (v === null || v === undefined) return 'n/a';
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function fmtBytes(pc, len) {
  const b = [];
  for (let i = 0; i < len; i++) b.push(romBytes[pc + i].toString(16).padStart(2, '0'));
  return b.join(' ').padEnd(18);
}

function formatInstr(inst) {
  let desc = inst.tag;
  if (inst.pair) desc += ` ${inst.pair}`;
  if (inst.reg) desc += ` ${inst.reg}`;
  if (inst.value !== undefined) desc += `, ${hex(inst.value)}`;
  if (inst.target !== undefined) desc += ` -> ${hex(inst.target)}`;
  if (inst.addr !== undefined) desc += ` (${hex(inst.addr)})`;
  if (inst.condition) desc += ` [${inst.condition}]`;
  if (inst.bit !== undefined) desc += ` bit ${inst.bit}`;
  if (inst.indexRegister) desc += ` (${inst.indexRegister}+${inst.displacement})`;
  return `${hex(inst.pc)}  ${fmtBytes(inst.pc, inst.length)}  ${desc}`;
}

// --- Step 1: Static disassembly 0x02FE70 - 0x030010 ---
console.log('=== STEP 1: Static Disassembly 0x02FE70 - 0x030010 ===\n');

const DISASM_START = 0x02FE70;
const DISASM_END = 0x030010;
const instructions = [];
let pc = DISASM_START;

while (pc < DISASM_END) {
  try {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    instructions.push(inst);
    pc = inst.nextPc;
  } catch (e) {
    console.log(`  ${hex(pc)}  [decode error: ${e.message}]`);
    pc++;
  }
}

for (const inst of instructions) {
  let marker = '';
  if (inst.pc === TARGET_SET) marker = ' <=== SET 0,(IY+29)';
  if (inst.pc === TARGET_RES) marker = ' <=== RES 0,(IY+29)';
  console.log('  ' + formatInstr(inst) + marker);
}

// --- Step 2: Function boundary ---
console.log('\n=== STEP 2: Function Boundary Analysis ===\n');

// The RET at 0x02FE88 terminates the prior function (0x02FE84 wrapper).
// 0x02FE89 starts: CP 0xFF / JR NZ,0x02FE9D / ... / JP 0x04049B
// Then 0x02FE9D (SET target) is a JR NZ fall-through destination from 0x02FE8B.
// The function extends through multiple branches until returns.

// Find all unconditional terminators to identify function boundaries
const funcEntry = 0x02FE89; // After RET at 0x02FE88
console.log(`  Function entry: ${hex(funcEntry)} (after RET at 0x02FE88)`);

// The function is large — it handles key dispatch. Find all RET/JP exits.
const funcInstructions = [];
const exitPoints = [];
let inFunc = false;

for (const inst of instructions) {
  if (inst.pc >= funcEntry) inFunc = true;
  if (!inFunc) continue;
  funcInstructions.push(inst);
  if (inst.tag === 'ret') {
    exitPoints.push(inst);
  }
}

console.log(`  Exit points (RET instructions):`);
for (const e of exitPoints) {
  console.log(`    ${hex(e.pc)}`);
}

// The function also has JP exits (unconditional jumps to other functions)
const jpExits = funcInstructions.filter(i =>
  i.tag === 'jp' && !i.condition &&
  (i.target < funcEntry || i.target > funcInstructions[funcInstructions.length - 1].pc)
);
console.log(`  JP exits (tail calls / jumps out):`);
for (const j of jpExits) {
  console.log(`    ${hex(j.pc)} -> ${hex(j.target)}`);
}

// --- Step 3: Branch logic around SET / RES ---
console.log('\n=== STEP 3: Branch Logic Around SET/RES ===\n');

console.log('  Control flow path to SET vs RES:\n');
console.log('  0x02FE89: CP 0xFF           ; compare A with 0xFF');
console.log('  0x02FE8B: JR NZ, 0x02FE9D   ; if A != 0xFF => jump to SET path');
console.log('  --- fall-through (A == 0xFF): ---');
console.log('  0x02FE8D: RES 3,(IY+18)');
console.log('  0x02FE91: LD A, 0x3F');
console.log('  0x02FE93: BIT 7,(IY+40)');
console.log('  0x02FE97: JR NZ, 0x02FE84   ; if bit7 set => jump to CALL 0x030300 wrapper');
console.log('  0x02FE99: JP 0x04049B        ; else => tail call to 0x04049B');
console.log('  --- NZ target (A != 0xFF): ---');
console.log('  0x02FE9D: SET 0,(IY+29)      ; ARM key repeat timer gate');
console.log('  0x02FEA1: BIT 4,(IY+0)       ; test bit 4 of flags byte 0');
console.log('  0x02FEA5: JR Z, 0x02FEB7     ; if bit 4 clear => SKIP the RES');
console.log('  0x02FEA7: RES 0,(IY+29)      ; DISARM key repeat timer gate');
console.log('  0x02FEAB: CALL 0x030300');
console.log('  0x02FEAF: RES 4,(IY+0)');
console.log('  0x02FEB3: RES 2,(IY+37)');
console.log('  0x02FEB7: (continue...)       ; both paths converge here\n');

console.log('  CONCLUSION:');
console.log('    A != 0xFF => SET fires (arms timer gate)');
console.log('    Then BIT 4,(IY+0) determines if RES immediately disarms:');
console.log('      bit 4 of IY+0 SET   => RES fires (disarms), calls 0x030300');
console.log('      bit 4 of IY+0 CLEAR => RES skipped, timer stays armed');

// --- Step 4: Find callers ---
console.log('\n=== STEP 4: Caller Scan ===\n');

const CALL_OPCODES = new Map([
  [0xCD, 'CALL'], [0xC4, 'CALL NZ'], [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'], [0xDC, 'CALL C'], [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'], [0xF4, 'CALL P'], [0xFC, 'CALL M'],
]);
const JP_OPCODES = new Map([
  [0xC3, 'JP'], [0xC2, 'JP NZ'], [0xCA, 'JP Z'],
  [0xD2, 'JP NC'], [0xDA, 'JP C'], [0xE2, 'JP PO'],
  [0xEA, 'JP PE'], [0xF2, 'JP P'], [0xFA, 'JP M'],
]);
const SCAN_END = 0x0C0000;

// Scan for references to 0x02FE89 (function entry)
function scanCallers(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const found = [];
  for (let addr = 0; addr < SCAN_END - 3; addr++) {
    const op = romBytes[addr];
    const type = CALL_OPCODES.get(op) || JP_OPCODES.get(op);
    if (!type) continue;
    if (romBytes[addr + 1] === lo &&
        romBytes[addr + 2] === mid &&
        romBytes[addr + 3] === hi) {
      found.push({ addr, type });
    }
  }
  return found;
}

const callers89 = scanCallers(funcEntry);
console.log(`  Callers of ${hex(funcEntry)}: ${callers89.length}`);
for (const c of callers89) {
  console.log(`    ${hex(c.addr)}: ${c.type}`);
}

const callers9D = scanCallers(TARGET_SET);
console.log(`  Direct refs to SET at ${hex(TARGET_SET)}: ${callers9D.length}`);
for (const c of callers9D) {
  console.log(`    ${hex(c.addr)}: ${c.type}`);
}

// The function at 0x02FE89 is likely reached by fall-through from earlier code
// Let's check what's at 0x02FE70-0x02FE88 to see who falls into it
console.log('\n  Context: what calls the PARENT function at 0x02FE70?');
// 0x02FE70 starts with XOR (HL), JR NZ ... so it's part of a bigger block
// Let's scan broader: who references addresses in the 0x02FE70-0x02FEFF range
const interestingTargets = [0x02FE70, 0x02FE73, 0x02FE84, 0x02FE89, 0x02FE9D,
  0x02FECF, 0x02FED7, 0x02FEDF, 0x02FEF3, 0x02FF09];
for (const t of interestingTargets) {
  const refs = scanCallers(t);
  if (refs.length > 0) {
    console.log(`    ${hex(t)}: ${refs.length} ref(s)`);
    for (const r of refs) console.log(`      ${hex(r.addr)}: ${r.type}`);
  }
}

// --- Step 5: Dynamic trace ---
console.log('\n=== STEP 5: Dynamic Trace ===\n');

try {
  const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
  if (!fs.existsSync(TRANSPILED_PATH)) {
    console.log('  ROM.transpiled.js not found. Skipping dynamic trace.');
    console.log('  Run: node scripts/transpile-ti84-rom.mjs');
  } else {
    const mod = await import(pathToFileURL(TRANSPILED_PATH).href);
    const BLOCKS = mod.PRELIFTED_BLOCKS ?? mod.default?.PRELIFTED_BLOCKS ?? mod.default ?? {};

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    function setupCPU(a, f, iy0val) {
      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.madl = 1;
      cpu.mbase = 0xD0;
      cpu.iy = IY_BASE;
      cpu.ix = 0xD1A860;
      cpu.sp = STACK_TOP;
      cpu.a = a;
      cpu.f = f;
      cpu._hl = 0;
      cpu._de = 0;
      cpu._bc = 0;
      mem[IY_PLUS_29] = 0x00;
      // Set/clear bit 4 of IY+0 based on iy0val
      mem[IY_BASE] = iy0val;
      // Push return sentinel
      cpu.sp -= 3;
      mem[cpu.sp] = RETURN_SENTINEL & 0xFF;
      mem[cpu.sp + 1] = (RETURN_SENTINEL >>> 8) & 0xFF;
      mem[cpu.sp + 2] = (RETURN_SENTINEL >>> 16) & 0xFF;
    }

    const scenarios = [
      { name: 'A=0x30 (not 0xFF), IY+0 bit4=0', a: 0x30, f: 0x40, iy0: 0x00 },
      { name: 'A=0x30 (not 0xFF), IY+0 bit4=1', a: 0x30, f: 0x40, iy0: 0x10 },
      { name: 'A=0xFF, IY+0 bit4=0',             a: 0xFF, f: 0x40, iy0: 0x00 },
      { name: 'A=0xFF, IY+0 bit4=1',             a: 0xFF, f: 0x40, iy0: 0x10 },
    ];

    for (const s of scenarios) {
      console.log(`  --- Scenario: ${s.name} ---`);
      setupCPU(s.a, s.f, s.iy0);

      const trace = executor.runFrom(funcEntry, 'adl', {
        maxSteps: 200,
        maxLoopIterations: 32,
      });

      console.log(`    Steps: ${trace.steps}, termination: ${trace.termination}`);
      console.log(`    Last PC: ${hex(trace.lastPc)}`);
      console.log(`    IY+29 after: ${hex(mem[IY_PLUS_29], 2)} (bit 0 = ${mem[IY_PLUS_29] & 1})`);
      console.log(`    IY+0 after:  ${hex(mem[IY_BASE], 2)}`);
      console.log(`    A=${hex(cpu.a, 2)} F=${hex(cpu.f, 2)}`);
      console.log('');
    }
  }
} catch (e) {
  console.log(`  Dynamic trace error: ${e.message}`);
  console.log(`  ${e.stack?.split('\n').slice(0, 5).join('\n')}`);
}

// --- Summary ---
console.log('\n=== SUMMARY ===\n');
console.log(`  Function entry: ${hex(funcEntry)} (key dispatch handler)`);
console.log(`  SET 0,(IY+29) at: ${hex(TARGET_SET)} — arms key repeat timer gate`);
console.log(`  RES 0,(IY+29) at: ${hex(TARGET_RES)} — disarms key repeat timer gate`);
console.log('');
console.log('  Branch logic:');
console.log('    A != 0xFF => SET fires (A holds the key code)');
console.log('    A == 0xFF => SET never reached (special "no key" / modifier path)');
console.log('    After SET, BIT 4,(IY+0) gates the RES:');
console.log('      bit 4 SET   => RES fires immediately (cancel timer gate)');
console.log('      bit 4 CLEAR => timer gate stays armed');
console.log('');
console.log(`  Callers of entry ${hex(funcEntry)}: ${callers89.length}`);
console.log(`  Direct refs to SET site: ${callers9D.length}`);
