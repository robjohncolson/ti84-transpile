#!/usr/bin/env node

/**
 * Phase 243: Trace 0x051ADC in the post-computation path.
 *
 * Session 242 showed the post-0x04EE06 path goes:
 *   0x04E447 -> 0x04E459 -> 0x04E25B -> 0x051ADC -> ... -> 0x0A1B5B
 *
 * Goals:
 *   1. Hex dump ROM bytes at 0x051ADC-0x051B30 (84 bytes).
 *   2. Static disassembly of 0x051ADC-0x051B30.
 *   3. RUN 1: Call 0x051ADC directly, 500 steps, detailed tracing:
 *      - All unique blocks visited
 *      - All CALL destinations (sub-functions)
 *      - All RAM writes (D003xx, D005xx, D00Axx regions)
 *      - IY flag changes
 *      - Register state at entry and every 50 steps
 *   4. RUN 2: Enter from 0x04E447 (computation path entry), 2000 steps,
 *      full chain 0x04E447 -> 0x051ADC -> 0x0A1B5B.
 *   5. Report: function structure, sub-call targets, RAM modifications,
 *      connection to display refresh at 0x0A1B5B.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS =
  romModule.PRELIFTED_BLOCKS ??
  romModule.default?.PRELIFTED_BLOCKS ??
  romModule.default ??
  romModule;

if (!BLOCKS || typeof BLOCKS !== 'object') {
  throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
}

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

// Target addresses
const TARGET_FUNC = 0x051ADC;
const COMP_PATH_ENTRY = 0x04E447;
const DISPLAY_REFRESH = 0x0A1B5B;

// Dump range
const DUMP_START = 0x051ADC;
const DUMP_END = 0x051B30;

// Step budgets
const RUN1_BUDGET = 500;
const RUN2_BUDGET = 2000;

// RAM watch regions
const RAM_WATCH_REGIONS = [
  { name: 'D003xx', start: 0xD00300, end: 0xD00400 },
  { name: 'D005xx', start: 0xD00500, end: 0xD00600 },
  { name: 'D00Axx', start: 0xD00A00, end: 0xD00B00 },
];

// Key state seeds (same as phase 242 warm state)
const ENTRY_SEEDS = [
  { addr: 0xD0058E, value: 0x8F, name: 'D0058E (key press)' },
  { addr: 0xD0058D, value: 0x00, name: 'D0058D' },
  { addr: 0xD0059F, value: 0x00, name: 'D0059F' },
  { addr: 0xD003E0, value: 0x00, name: 'D003E0' },
  { addr: 0xD00824, value: 0x00, name: 'D00824' },
  { addr: 0xD003DA, value: 0x00, name: 'D003DA' },
  { addr: 0xD007E0, value: 0x40, name: 'D007E0' },
  { addr: 0xD00000, value: 0x00, name: 'D00000' },
];

// Edit buffer seeding (gap buffer initialized)
const EDIT_BUFFER_START = 0xD00A00;
const EDIT_CURSOR_PTR = 0xD0243A;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

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

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) return exit.targetMode;
  }
  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }
    const result = fn(this);
    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }
    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }
    return result;
  };
}

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
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    default: {
      let text = inst.tag;
      if (inst.bit !== undefined) text += ` bit=${inst.bit}`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
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
        length,
        bytes: bytesToHex(romBytes.subarray(pc, pc + length)),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        length: 1,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }
  return rows;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function seedEntryState(cpu, mem, entryPc) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = entryPc;
  cpu.sp = STACK_TOP;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x1D;
  cpu.f = 0x00;

  // Clear IY flags
  for (let offset = 0; offset < 128; offset++) {
    mem[(IY_BASE + offset) & MEM_MASK] = 0x00;
  }

  // Apply entry seeds
  for (const seed of ENTRY_SEEDS) {
    mem[seed.addr & MEM_MASK] = seed.value & 0xFF;
  }

  // Seed edit buffer (gap buffer)
  mem[EDIT_BUFFER_START & MEM_MASK] = 0x00;
  write24(mem, EDIT_CURSOR_PTR, EDIT_BUFFER_START);

  // Push return sentinel
  push24(cpu, mem, RETURN_SENTINEL);
}

function snapshotRegs(step, cpu, note = '') {
  return {
    step,
    note,
    pc: cpu.pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: (cpu._hl ?? 0) & 0xFFFFFF,
    de: (cpu._de ?? 0) & 0xFFFFFF,
    bc: (cpu._bc ?? 0) & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: (cpu._ix ?? 0) & 0xFFFFFF,
    iy: (cpu._iy ?? 0) & 0xFFFFFF,
  };
}

/**
 * Enhanced trace that captures:
 * - All unique blocks visited (in order)
 * - All CALL destinations
 * - All RAM writes in watched regions
 * - IY flag changes
 * - Register snapshots at intervals
 */
function traceDetailed(cpu, mem, budget, label, opts = {}) {
  const { snapshotInterval = 50, watchTarget = null } = opts;

  const visitOrder = [];
  const visitCounts = new Map();
  const callTargets = [];
  const ramWrites = [];
  const iyChanges = [];
  const regSnapshots = [];
  const tail = [];

  // Snapshot RAM watch regions before
  const ramBefore = {};
  for (const region of RAM_WATCH_REGIONS) {
    ramBefore[region.name] = new Uint8Array(mem.subarray(region.start, region.end));
  }

  // Snapshot IY flags before
  const iyBefore = new Uint8Array(128);
  for (let i = 0; i < 128; i++) {
    iyBefore[i] = mem[(IY_BASE + i) & MEM_MASK];
  }

  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let hitTarget = false;
  let hitTargetStep = -1;
  let hitDisplayRefresh = false;
  let hitDisplayRefreshStep = -1;

  regSnapshots.push(snapshotRegs(0, cpu, 'entry'));

  const TAIL_LIMIT = 32;

  while (executedSteps < budget) {
    const pc = cpu.pc & 0xFFFFFF;

    // Track visits
    if (!visitCounts.has(pc)) {
      visitOrder.push(pc);
    }
    visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);

    // Tail buffer
    tail.push(pc);
    if (tail.length > TAIL_LIMIT) tail.shift();

    // Check for target function
    if (watchTarget && pc === watchTarget && !hitTarget) {
      hitTarget = true;
      hitTargetStep = executedSteps;
      regSnapshots.push(snapshotRegs(executedSteps, cpu, `HIT TARGET ${hex(watchTarget)}`));
    }

    // Check for display refresh
    if (pc === DISPLAY_REFRESH && !hitDisplayRefresh) {
      hitDisplayRefresh = true;
      hitDisplayRefreshStep = executedSteps;
      regSnapshots.push(snapshotRegs(executedSteps, cpu, `HIT DISPLAY REFRESH ${hex(DISPLAY_REFRESH)}`));
    }

    // Return sentinel
    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    // Try to decode instruction to detect CALLs
    const mode = cpu.madl ? 'adl' : 'z80';
    try {
      const inst = decodeInstruction(romBytes, pc, mode);
      if (inst && (inst.tag === 'call' || inst.tag === 'call-conditional')) {
        callTargets.push({
          step: executedSteps,
          from: pc,
          target: inst.target,
          tag: inst.tag,
          condition: inst.condition ?? null,
        });
      }
    } catch (_) {
      // Decode error - skip
    }

    // Step
    let result;
    try {
      result = cpu.step();
    } catch (traceError) {
      stopReason = 'error';
      error = traceError instanceof Error ? traceError.message : String(traceError);
      break;
    }
    executedSteps += 1;

    // Check RAM writes in watched regions
    for (const region of RAM_WATCH_REGIONS) {
      for (let addr = region.start; addr < region.end; addr++) {
        const idx = addr - region.start;
        const cur = mem[addr & MEM_MASK];
        if (cur !== ramBefore[region.name][idx]) {
          ramWrites.push({
            step: executedSteps,
            afterBlock: pc,
            addr,
            oldVal: ramBefore[region.name][idx],
            newVal: cur,
            region: region.name,
          });
          ramBefore[region.name][idx] = cur;
        }
      }
    }

    // Check IY flag changes
    for (let i = 0; i < 128; i++) {
      const cur = mem[(IY_BASE + i) & MEM_MASK];
      if (cur !== iyBefore[i]) {
        iyChanges.push({
          step: executedSteps,
          afterBlock: pc,
          offset: i,
          addr: IY_BASE + i,
          oldVal: iyBefore[i],
          newVal: cur,
        });
        iyBefore[i] = cur;
      }
    }

    // Periodic register snapshots
    if (executedSteps % snapshotInterval === 0) {
      regSnapshots.push(snapshotRegs(executedSteps, cpu, 'periodic'));
    }

    if (result === -1) { stopReason = 'halt'; break; }
    if (result === -2) { stopReason = 'sleep'; break; }
    if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }
  }

  regSnapshots.push(snapshotRegs(executedSteps, cpu, 'final'));

  return {
    label,
    executedSteps,
    stopReason,
    error,
    visitOrder,
    visitCounts,
    callTargets,
    ramWrites,
    iyChanges,
    regSnapshots,
    tail,
    hitTarget,
    hitTargetStep,
    hitDisplayRefresh,
    hitDisplayRefreshStep,
    finalPc: cpu.pc & 0xFFFFFF,
  };
}

function printTraceResult(result) {
  console.log(`  Steps: ${result.executedSteps} | Stop: ${result.stopReason} | Final PC: ${hex(result.finalPc)}`);
  if (result.error) console.log(`  Error: ${result.error}`);
  console.log(`  Unique blocks: ${result.visitOrder.length}`);
  console.log(`  Hit target (0x051ADC): ${result.hitTarget}${result.hitTargetStep >= 0 ? ` at step ${result.hitTargetStep}` : ''}`);
  console.log(`  Hit display refresh (0x0A1B5B): ${result.hitDisplayRefresh}${result.hitDisplayRefreshStep >= 0 ? ` at step ${result.hitDisplayRefreshStep}` : ''}`);
  console.log('');

  // Block visit order
  console.log('  Block visit order:');
  for (let i = 0; i < result.visitOrder.length; i++) {
    const pc = result.visitOrder[i];
    const count = result.visitCounts.get(pc) ?? 0;
    console.log(`    [${String(i).padStart(3)}] ${hex(pc)} (x${count})`);
  }
  console.log('');

  // CALL targets
  if (result.callTargets.length > 0) {
    console.log('  CALL targets:');
    const uniqueCalls = new Map();
    for (const c of result.callTargets) {
      const key = `${hex(c.from)}->${hex(c.target)}`;
      if (!uniqueCalls.has(key)) {
        uniqueCalls.set(key, { ...c, count: 1 });
      } else {
        uniqueCalls.get(key).count += 1;
      }
    }
    for (const [key, c] of uniqueCalls) {
      const cond = c.condition ? ` (${c.condition})` : '';
      console.log(`    step ${String(c.step).padStart(4)}: ${hex(c.from)} -> CALL${cond} ${hex(c.target)} (x${c.count})`);
    }
  } else {
    console.log('  CALL targets: (none)');
  }
  console.log('');

  // RAM writes
  if (result.ramWrites.length > 0) {
    console.log(`  RAM writes (${result.ramWrites.length} total):`);
    // Group by address
    const byAddr = new Map();
    for (const w of result.ramWrites) {
      if (!byAddr.has(w.addr)) byAddr.set(w.addr, []);
      byAddr.get(w.addr).push(w);
    }
    for (const [addr, writes] of [...byAddr.entries()].sort((a, b) => a[0] - b[0])) {
      const last = writes[writes.length - 1];
      const first = writes[0];
      if (writes.length === 1) {
        console.log(`    ${hex(addr)} [${last.region}]: ${hexByte(first.oldVal)} -> ${hexByte(last.newVal)} (step ${last.step}, after ${hex(last.afterBlock)})`);
      } else {
        console.log(`    ${hex(addr)} [${last.region}]: ${hexByte(first.oldVal)} -> ${hexByte(last.newVal)} (${writes.length} writes, steps ${first.step}-${last.step})`);
      }
    }
  } else {
    console.log('  RAM writes: (none in watched regions)');
  }
  console.log('');

  // IY changes
  if (result.iyChanges.length > 0) {
    console.log(`  IY flag changes (${result.iyChanges.length} total):`);
    for (const c of result.iyChanges) {
      console.log(`    IY+${hex(c.offset, 2)} (${hex(c.addr)}): ${hexByte(c.oldVal)} -> ${hexByte(c.newVal)} (step ${c.step}, after ${hex(c.afterBlock)})`);
    }
  } else {
    console.log('  IY flag changes: (none)');
  }
  console.log('');

  // Register snapshots
  console.log('  Register snapshots:');
  for (const snap of result.regSnapshots) {
    const note = snap.note ? ` (${snap.note})` : '';
    console.log(
      `    step ${String(snap.step).padStart(4)}: PC=${hex(snap.pc)} A=${hexByte(snap.a)} F=${hexByte(snap.f)} ` +
      `HL=${hex(snap.hl)} DE=${hex(snap.de)} BC=${hex(snap.bc)} SP=${hex(snap.sp)}${note}`
    );
  }
  console.log('');

  // Tail
  console.log(`  Tail (last ${result.tail.length} blocks):`);
  console.log(`    ${result.tail.map((pc) => hex(pc)).join(' -> ')}`);
  console.log('');
}

async function main() {
  console.log('Phase 243: Trace 0x051ADC in post-computation path');
  console.log('='.repeat(72));
  console.log('');

  // ---- Hex dump ----
  console.log('========================================================================');
  console.log(`HEX DUMP ${hex(DUMP_START)}..${hex(DUMP_END)} (${DUMP_END - DUMP_START} bytes)`);
  console.log('========================================================================');
  for (let addr = DUMP_START; addr < DUMP_END; addr += 16) {
    const end = Math.min(addr + 16, DUMP_END);
    const slice = romBytes.subarray(addr, end);
    const hexStr = Array.from(slice, (b) => (b & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`  ${hex(addr)}: ${hexStr}`);
  }
  console.log('');

  // ---- Static disassembly ----
  console.log('========================================================================');
  console.log(`STATIC DISASSEMBLY ${hex(DUMP_START)}..${hex(DUMP_END)}`);
  console.log('========================================================================');
  const disasm = disassembleRange(DUMP_START, DUMP_END);
  for (const row of disasm) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(22)} ${row.text}`);
  }
  console.log('');

  // ---- Create runtime and cold boot ----
  const runtime = createRuntime();
  const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const bootMemory = new Uint8Array(runtime.mem);
  const bootCpuSnapshot = snapshotCpu(runtime.cpu);

  console.log('========================================================================');
  console.log('COLD BOOT');
  console.log('========================================================================');
  console.log(`  boot:   steps=${bootSummary.boot.steps}/${bootSummary.boot.termination}`);
  console.log(`  kernel: steps=${bootSummary.kernel.steps}/${bootSummary.kernel.termination}`);
  console.log(`  post:   steps=${bootSummary.post.steps}/${bootSummary.post.termination}`);
  console.log('');

  // ==== RUN 1: Direct call to 0x051ADC ====
  console.log('========================================================================');
  console.log(`RUN 1: Direct call to ${hex(TARGET_FUNC)} (${RUN1_BUDGET} steps)`);
  console.log('========================================================================');

  runtime.mem.set(bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedEntryState(runtime.cpu, runtime.mem, TARGET_FUNC);

  const run1 = traceDetailed(runtime.cpu, runtime.mem, RUN1_BUDGET, 'run1-direct-051ADC', {
    snapshotInterval: 50,
  });
  printTraceResult(run1);

  // ==== RUN 2: Enter from 0x04E447 (computation path) ====
  console.log('========================================================================');
  console.log(`RUN 2: From computation path ${hex(COMP_PATH_ENTRY)} (${RUN2_BUDGET} steps)`);
  console.log(`  Chain: 0x04E447 -> 0x04E459 -> 0x04E25B -> 0x051ADC -> ... -> 0x0A1B5B`);
  console.log('========================================================================');

  runtime.mem.set(bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedEntryState(runtime.cpu, runtime.mem, COMP_PATH_ENTRY);

  const run2 = traceDetailed(runtime.cpu, runtime.mem, RUN2_BUDGET, 'run2-comp-path-04E447', {
    snapshotInterval: 100,
    watchTarget: TARGET_FUNC,
  });
  printTraceResult(run2);

  // ==== Path analysis ====
  console.log('========================================================================');
  console.log('PATH ANALYSIS: 0x04E447 -> 0x051ADC -> 0x0A1B5B');
  console.log('========================================================================');

  // Find the index of TARGET_FUNC in visit order
  const targetIdx = run2.visitOrder.indexOf(TARGET_FUNC);
  const refreshIdx = run2.visitOrder.indexOf(DISPLAY_REFRESH);

  console.log(`  0x051ADC first seen at visit index: ${targetIdx >= 0 ? targetIdx : 'NOT REACHED'}`);
  console.log(`  0x0A1B5B first seen at visit index: ${refreshIdx >= 0 ? refreshIdx : 'NOT REACHED'}`);

  if (targetIdx >= 0) {
    console.log('');
    console.log('  Blocks visited AFTER 0x051ADC (up to display refresh or end):');
    const endIdx = refreshIdx >= 0 ? refreshIdx + 1 : run2.visitOrder.length;
    const startIdx = targetIdx;
    const pathSlice = run2.visitOrder.slice(startIdx, Math.min(endIdx, startIdx + 40));
    for (let i = 0; i < pathSlice.length; i++) {
      const pc = pathSlice[i];
      const count = run2.visitCounts.get(pc) ?? 0;
      console.log(`    [${String(startIdx + i).padStart(3)}] ${hex(pc)} (x${count})`);
    }
  }
  console.log('');

  // Sub-calls from within 0x051ADC region
  const subcalls051 = run2.callTargets.filter(
    (c) => c.from >= 0x051ADC && c.from < 0x051C00
  );
  if (subcalls051.length > 0) {
    console.log('  Sub-calls from 0x051ADC region (0x051ADC-0x051BFF):');
    for (const c of subcalls051) {
      const cond = c.condition ? ` (${c.condition})` : '';
      console.log(`    step ${c.step}: ${hex(c.from)} -> CALL${cond} ${hex(c.target)}`);
    }
  } else {
    console.log('  Sub-calls from 0x051ADC region: (none detected)');
  }
  console.log('');

  console.log('Phase 243 complete.');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
