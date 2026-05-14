#!/usr/bin/env node

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
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const TARGET_ADDR = 0x000138;
const TRACE_ARG_HL = 0x05550C;   // what 0x055743 passes in HL
const TRACE_RETURN = 0x7FFFFE;
const TRACE_STEP_LIMIT = 5000;
const TRACE_LOOP_LIMIT = 8192;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
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
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase324-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${String(indexRegister).toUpperCase()}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair ?? inst.reg ?? inst.src).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair ?? inst.reg ?? inst.dest).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      if (inst.direction === 'to-mem') {
        return `LD${suffix} (${hex(inst.addr, width)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `LD${suffix} ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, width)})`;
    }
    case 'ld-mem-pair': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      return `LD${suffix} (${hex(inst.addr, width)}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-reg-ixd':
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.dest ?? inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'in-imm':
      return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out-imm':
      return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-reg':
      return `${prefix}IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-reg':
      return `${prefix}OUT (C), ${String(inst.reg).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target, 2)}`;
    default: {
      let rendered = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) rendered += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) rendered += ` ${hex(inst.value)}`;
      return rendered;
    }
  }
}

function disassembleWindow(buffer, start, byteCount) {
  const rows = [];
  const end = Math.min(buffer.length, start + byteCount);

  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(buffer, pc, 'adl');
      const length = Math.max(1, inst?.length ?? 1);
      const isRet = inst?.tag === 'ret';
      rows.push({
        pc,
        bytes: bytesToHex(buffer.subarray(pc, Math.min(pc + length, end))),
        text: formatInstruction(inst),
        isRet,
      });
      pc += length;
      if (isRet) break;  // stop at first unconditional RET
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(buffer[pc]),
        text: `DB ${hexByte(buffer[pc])} ; ${error?.message ?? 'decode error'}`,
        isRet: false,
      });
      pc += 1;
    }
  }

  return rows;
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function nextMode(executor, key, returnedPc, currentMode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return currentMode;
  for (const exit of exits) {
    if (exit.target === returnedPc && exit.targetMode) return exit.targetMode;
  }
  return currentMode;
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

    this._currentBlockPc = pc;
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

function createRuntime(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals, trackMemoryMapped: true });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.rom = romBytes;
  cpu.__executor = executor;
  cpu.__peripherals = peripherals;

  installStep(cpu, executor);

  return { mem, cpu, executor };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

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
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernelInit, postInit };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;

  const fillStart = Math.max(0, cpu.sp);
  const fillEnd = Math.min(mem.length, cpu.sp + 0x40);
  mem.fill(0xFF, fillStart, fillEnd);
}

function runToStopPc(executor, entryPc, mode, stopPc, maxSteps, maxLoopIterations) {
  let lastPc = entryPc & 0xFFFFFF;
  let steps = 0;
  let termination = 'unknown';
  let hitStop = false;

  const trap = (pc, step) => {
    lastPc = pc & 0xFFFFFF;
    steps = Math.max(steps, (step ?? 0) + 1);
    if (lastPc === stopPc) {
      const error = new Error('__STOP__');
      error.traceStop = true;
      throw error;
    }
  };

  try {
    const result = executor.runFrom(entryPc, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, _mode, _meta, step) { trap(pc, step); },
      onMissingBlock(pc, _mode, step) { trap(pc, step); },
    });

    lastPc = result.lastPc ?? lastPc;
    steps = Math.max(steps, result.steps ?? 0);
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.traceStop) {
      hitStop = true;
      lastPc = stopPc;
      termination = 'stop_hit';
    } else {
      throw error;
    }
  }

  return { hitStop, lastPc, steps, termination };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  return runToStopPc(executor, MEM_INIT_ENTRY, 'adl', MEM_INIT_RET, 100000, TRACE_LOOP_LIMIT);
}

/* ===================================================================
   Part 1: Static disassembly of 0x000138
   =================================================================== */
function part1_staticDisassembly(romBytes) {
  console.log('\n========== PART 1: Static Disassembly of 0x000138 ==========');

  // Disassemble up to 100 bytes or until RET
  const rows = disassembleWindow(romBytes, TARGET_ADDR, 100);

  console.log(`Disassembly (${rows.length} instructions):`);
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(23)} ${row.text}`);
  }

  // Summarize interesting targets
  const callTargets = [];
  const jpTargets = [];
  const memAccesses = [];
  const branches = [];

  for (const row of rows) {
    const inst = (() => {
      try { return decodeInstruction(romBytes, row.pc, 'adl'); } catch { return null; }
    })();
    if (!inst) continue;

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push({ pc: row.pc, target: inst.target, cond: inst.condition ?? 'always' });
    }
    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      jpTargets.push({ pc: row.pc, target: inst.target, cond: inst.condition ?? 'always' });
    }
    if (inst.tag === 'jr' || inst.tag === 'jr-conditional') {
      branches.push({ pc: row.pc, target: inst.target, cond: inst.condition ?? 'always' });
    }
    if (inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg' || inst.tag === 'ld-pair-mem' || inst.tag === 'ld-mem-pair') {
      memAccesses.push({ pc: row.pc, addr: inst.addr ?? inst.address, tag: inst.tag });
    }
  }

  if (callTargets.length) {
    console.log('\nCALL targets:');
    for (const c of callTargets) console.log(`  ${hex(c.pc)}: CALL ${c.cond !== 'always' ? c.cond + ',' : ''} ${hex(c.target)}`);
  }
  if (jpTargets.length) {
    console.log('\nJP targets:');
    for (const j of jpTargets) console.log(`  ${hex(j.pc)}: JP ${j.cond !== 'always' ? j.cond + ',' : ''} ${hex(j.target)}`);
  }
  if (branches.length) {
    console.log('\nJR branches:');
    for (const b of branches) console.log(`  ${hex(b.pc)}: JR ${b.cond !== 'always' ? b.cond + ',' : ''} ${hex(b.target)}`);
  }
  if (memAccesses.length) {
    console.log('\nDirect memory accesses:');
    for (const m of memAccesses) console.log(`  ${hex(m.pc)}: ${m.tag} addr=${hex(m.addr)}`);
  }

  return rows;
}

/* ===================================================================
   Part 2: Cross-reference scan — who calls 0x000138?
   =================================================================== */
function part2_crossReferenceScan(romBytes) {
  console.log('\n========== PART 2: Cross-Reference Scan for 0x000138 ==========');

  const target_lo = 0x38;
  const target_mid = 0x01;
  const target_hi = 0x00;
  const callers = [];

  // Scan entire 4MB ROM for CALL 0x000138 (CD 38 01 00) or JP 0x000138 (C3 38 01 00)
  for (let i = 0; i < romBytes.length - 3; i++) {
    if (romBytes[i + 1] === target_lo && romBytes[i + 2] === target_mid && romBytes[i + 3] === target_hi) {
      const opcode = romBytes[i];
      if (opcode === 0xCD) {
        callers.push({ addr: i, type: 'CALL' });
      } else if (opcode === 0xC3) {
        callers.push({ addr: i, type: 'JP' });
      }
    }
  }

  console.log(`Total references found: ${callers.length}`);

  // Show first 20
  const showCount = Math.min(20, callers.length);
  console.log(`First ${showCount} callers:`);
  for (let i = 0; i < showCount; i++) {
    const c = callers[i];
    console.log(`  ${hex(c.addr)}: ${c.type} 0x000138`);
  }

  // Classify by address range to determine subsystem spread
  const ranges = {
    'Vector/Low (0x000000-0x000FFF)': 0,
    'OS Core (0x001000-0x01FFFF)': 0,
    'OS Mid (0x020000-0x04FFFF)': 0,
    'OS High (0x050000-0x09FFFF)': 0,
    'OS Upper (0x0A0000-0x0FFFFF)': 0,
    'Flash Apps (0x100000-0x3FFFFF)': 0,
  };

  for (const c of callers) {
    const addr = c.addr;
    if (addr < 0x001000) ranges['Vector/Low (0x000000-0x000FFF)']++;
    else if (addr < 0x020000) ranges['OS Core (0x001000-0x01FFFF)']++;
    else if (addr < 0x050000) ranges['OS Mid (0x020000-0x04FFFF)']++;
    else if (addr < 0x0A0000) ranges['OS High (0x050000-0x09FFFF)']++;
    else if (addr < 0x100000) ranges['OS Upper (0x0A0000-0x0FFFFF)']++;
    else ranges['Flash Apps (0x100000-0x3FFFFF)']++;
  }

  console.log('\nCaller distribution by ROM region:');
  for (const [region, count] of Object.entries(ranges)) {
    if (count > 0) console.log(`  ${region}: ${count}`);
  }

  const totalRegions = Object.values(ranges).filter((c) => c > 0).length;
  const verdict = totalRegions >= 3
    ? 'GENERIC UTILITY — called from many subsystems'
    : totalRegions === 1
      ? 'DOMAIN-SPECIFIC — called from a single subsystem'
      : 'SEMI-GENERIC — called from a few subsystems';
  console.log(`\nCross-ref verdict: ${verdict} (${totalRegions} distinct regions)`);

  return { callers, totalRegions, verdict };
}

/* ===================================================================
   Part 3: Vector table context — disassemble 0x000120..0x000160
   =================================================================== */
function part3_vectorTableContext(romBytes) {
  console.log('\n========== PART 3: Vector Table Context (0x000120..0x000160) ==========');

  const rows = [];
  const start = 0x000120;
  const end = 0x000160;

  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(1, inst?.length ?? 1);
      rows.push({
        pc,
        bytes: bytesToHex(romBytes.subarray(pc, Math.min(pc + length, end))),
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

  for (const row of rows) {
    const marker = row.pc === TARGET_ADDR ? ' <-- TARGET' : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(23)} ${row.text}${marker}`);
  }

  // Check for vector table pattern (sequence of JP instructions)
  const jpCount = rows.filter((r) => r.text.startsWith('JP ') || r.text.includes('] JP')).length;
  const isVectorTable = jpCount >= 3;
  console.log(`\nJP instructions in range: ${jpCount}`);
  console.log(`Looks like a vector table: ${isVectorTable ? 'YES' : 'NO'}`);
}

/* ===================================================================
   Part 4: Dynamic trace — call 0x000138 with HL=0x05550C
   =================================================================== */
function part4_dynamicTrace(runtime) {
  console.log('\n========== PART 4: Dynamic Trace of 0x000138 (HL=0x05550C) ==========');

  const { cpu, mem } = runtime;

  // Set up CPU for post-init OS call
  resetCpuForOsCall(cpu, mem);
  cpu.pc = TARGET_ADDR;
  cpu.sp = STACK_TOP;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._hl = TRACE_ARG_HL;

  // Push fake return address
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, TRACE_RETURN);

  // Fill stack guard
  const fillStart = Math.max(0, (cpu.sp - 0x40) & 0xFFFFFF);
  const fillEnd = Math.min(mem.length, cpu.sp + 0x20);
  mem.fill(0xFF, fillStart, fillEnd);
  write24(mem, cpu.sp, TRACE_RETURN);

  console.log(`Entry: PC=${hex(TARGET_ADDR)} HL=${hex(TRACE_ARG_HL)} SP=${hex(cpu.sp)} Return=${hex(TRACE_RETURN)}`);

  const portReads = [];
  const portWrites = [];
  const mmioReads = [];
  const mmioWrites = [];
  const ramReads = [];
  const ramWrites = [];
  const uniqueBlocks = [];
  const seenBlocks = new Set();

  let step = 0;
  let stopReason = 'budget_exhausted';
  let errorMessage = null;

  cpu.onIoRead = (port, value) => {
    portReads.push({ step, block: cpu._currentBlockPc ?? cpu.pc ?? 0, port: port & 0xFFFF, value: value & 0xFF });
  };
  cpu.onIoWrite = (port, value) => {
    portWrites.push({ step, block: cpu._currentBlockPc ?? cpu.pc ?? 0, port: port & 0xFFFF, value: value & 0xFF });
  };
  cpu.onMmioRead = (addr, value) => {
    mmioReads.push({ step, block: cpu._currentBlockPc ?? cpu.pc ?? 0, addr: addr & 0xFFFFFF, value: value & 0xFF });
  };
  cpu.onMmioWrite = (addr, value) => {
    mmioWrites.push({ step, block: cpu._currentBlockPc ?? cpu.pc ?? 0, addr: addr & 0xFFFFFF, value: value & 0xFF });
  };

  while (step < TRACE_STEP_LIMIT) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === TRACE_RETURN) {
      stopReason = 'returned';
      break;
    }

    if (!seenBlocks.has(pc)) {
      seenBlocks.add(pc);
      uniqueBlocks.push(pc);
    }

    let out;
    try {
      out = cpu.step();
    } catch (error) {
      stopReason = 'error';
      errorMessage = error?.message ?? String(error);
      break;
    }

    step += 1;

    if (out === -1) { stopReason = 'halt'; break; }
    if (out === -2) { stopReason = 'sleep'; break; }
  }

  const finalPc = cpu.pc & 0xFFFFFF;
  const returned = finalPc === TRACE_RETURN;
  if (returned && stopReason === 'budget_exhausted') stopReason = 'returned';

  // Clean up hooks
  cpu.onIoRead = () => {};
  cpu.onIoWrite = () => {};
  cpu.onMmioRead = () => {};
  cpu.onMmioWrite = () => {};

  console.log(`Steps: ${step}`);
  console.log(`Returned: ${returned ? 'yes' : `no (final PC ${hex(finalPc)})`}`);
  if (!returned) {
    console.log(`Stop reason: ${stopReason}${errorMessage ? ` (${errorMessage})` : ''}`);
  }

  console.log(`Unique blocks visited: ${uniqueBlocks.length}`);
  console.log(`  [${uniqueBlocks.map((pc) => hex(pc)).join(', ')}]`);

  if (portWrites.length) {
    console.log(`\nPort writes (${portWrites.length}):`);
    for (const pw of portWrites) {
      console.log(`  step=${pw.step} block=${hex(pw.block)} port=${hex(pw.port, pw.port > 0xFF ? 4 : 2)} value=${hexByte(pw.value)}`);
    }
  } else {
    console.log('\nPort writes: none');
  }

  if (portReads.length) {
    console.log(`\nPort reads (${portReads.length}):`);
    for (const pr of portReads) {
      console.log(`  step=${pr.step} block=${hex(pr.block)} port=${hex(pr.port, pr.port > 0xFF ? 4 : 2)} value=${hexByte(pr.value)}`);
    }
  } else {
    console.log('\nPort reads: none');
  }

  if (mmioWrites.length) {
    console.log(`\nMMIO writes (${mmioWrites.length}):`);
    for (const mw of mmioWrites) {
      console.log(`  step=${mw.step} block=${hex(mw.block)} addr=${hex(mw.addr)} value=${hexByte(mw.value)}`);
    }
  } else {
    console.log('\nMMIO writes: none');
  }

  if (mmioReads.length) {
    console.log(`\nMMIO reads (${mmioReads.length}):`);
    for (const mr of mmioReads) {
      console.log(`  step=${mr.step} block=${hex(mr.block)} addr=${hex(mr.addr)} value=${hexByte(mr.value)}`);
    }
  } else {
    console.log('\nMMIO reads: none');
  }

  // Final register state
  console.log('\nFinal registers:');
  console.log(`  A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} HL=${hex(cpu._hl)} DE=${hex(cpu._de)} BC=${hex(cpu._bc)}`);
  console.log(`  SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);

  // Assessment
  const hasHardwareIO = portWrites.length > 0 || portReads.length > 0 || mmioWrites.length > 0 || mmioReads.length > 0;
  if (hasHardwareIO) {
    console.log('\nAssessment: 0x000138 performs HARDWARE I/O — likely LCD or peripheral related.');
  } else {
    console.log('\nAssessment: 0x000138 does NO hardware I/O in this trace — likely a generic OS utility (memory copy, table lookup, etc).');
  }

  return { step, returned, finalPc, stopReason, errorMessage, uniqueBlocks, portWrites, portReads, mmioWrites, mmioReads };
}

/* ===================================================================
   Main
   =================================================================== */
async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const moduleUrl = pathToFileURL(assets.modulePath).href;
    const romModule = await import(moduleUrl);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);

    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
    }

    return blocks;
  } finally {
    cleanupTranspiledModule(assets);
  }
}

async function main() {
  console.log('=== Phase 324: Investigate 0x000138 — function called by 0x055743 ===');
  console.log(`Target: ${hex(TARGET_ADDR)}`);
  console.log(`Question: Is 0x000138 a generic OS utility or LCD-specific?\n`);

  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM image: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);

  // Part 1: Static disassembly (no runtime needed)
  part1_staticDisassembly(romBytes);

  // Part 2: Cross-reference scan (no runtime needed)
  const xrefResult = part2_crossReferenceScan(romBytes);

  // Part 3: Vector table context (no runtime needed)
  part3_vectorTableContext(romBytes);

  // Part 4: Dynamic trace (needs runtime)
  console.log('\nLoading transpiled blocks for dynamic trace...');
  const blocks = await loadBlocks();
  const runtime = createRuntime(romBytes, blocks);

  console.log('Cold-booting...');
  const bootInfo = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  console.log(`Boot: boot=${bootInfo.boot.termination}/${bootInfo.boot.steps} kernel=${bootInfo.kernelInit.termination}/${bootInfo.kernelInit.steps} post=${bootInfo.postInit.termination}/${bootInfo.postInit.steps}`);

  console.log('Running MEM_INIT...');
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  if (!memInit.hitStop) {
    console.log(`WARNING: MEM_INIT did not return via ${hex(MEM_INIT_RET)} (termination=${memInit.termination}, lastPc=${hex(memInit.lastPc)})`);
    console.log('Proceeding with dynamic trace anyway...');
  } else {
    console.log(`MEM_INIT: ok (${memInit.steps} steps)`);
  }

  const traceResult = part4_dynamicTrace(runtime);

  // Final verdict
  console.log('\n========== FINAL VERDICT ==========');
  const hasHW = traceResult.portWrites.length + traceResult.portReads.length + traceResult.mmioWrites.length + traceResult.mmioReads.length;
  const isGeneric = xrefResult.totalRegions >= 3;
  const callCount = xrefResult.callers.length;

  if (isGeneric && hasHW === 0) {
    console.log(`0x000138 is a GENERIC OS UTILITY — called from ${callCount} sites across ${xrefResult.totalRegions} ROM regions, no hardware I/O observed.`);
  } else if (isGeneric && hasHW > 0) {
    console.log(`0x000138 is a GENERIC UTILITY that touches hardware — called from ${callCount} sites across ${xrefResult.totalRegions} regions, ${hasHW} I/O operations observed.`);
  } else if (!isGeneric && hasHW > 0) {
    console.log(`0x000138 is likely LCD/PERIPHERAL-SPECIFIC — called from ${callCount} sites in ${xrefResult.totalRegions} regions, ${hasHW} I/O operations observed.`);
  } else {
    console.log(`0x000138 is DOMAIN-SPECIFIC with no hardware I/O — called from ${callCount} sites in ${xrefResult.totalRegions} regions. Likely a data utility for a specific subsystem.`);
  }
}

await main();
