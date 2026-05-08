#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;

const IY_BASE = 0xD00080;
const IX_STAGE = 0xD1A860;
const STACK_TOP = 0xD1A87E;
const FIXED_MBASE = 0xD0;
const SENTINEL_PC = 0x7FFFFE;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const TARGET_FUNC = 0x07A627;
const TARGET_END = 0x07A6A0;
const CALLER_ENTRY = 0x051B7C;

const D003DD = 0xD003DD;
const D0059F = 0xD0059F;
const D003E0 = 0xD003E0;
const D010F8 = 0xD010F8;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function snapshotCpu(cpu) {
  const fields = [
    'a', 'f', 'b', 'c', 'd', 'e', 'h', 'l',
    '_a2', '_f2', '_bc2', '_de2', '_hl2',
    'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
  ];
  return Object.fromEntries(fields.map((f) => [f, cpu[f]]));
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

  cpu.mbase = FIXED_MBASE;
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

function setupWarmState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = IX_STAGE;
  cpu._iy = IY_BASE;
  cpu.mbase = FIXED_MBASE;
  cpu.madl = 1;
  cpu.sp = STACK_TOP;

  // Push sentinel return address
  cpu.sp -= 3;
  mem[cpu.sp] = SENTINEL_PC & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL_PC >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL_PC >> 16) & 0xFF;
}

function staticDisassembly(romBytes) {
  console.log('========================================');
  console.log('  PART 1: Static Disassembly 0x07A627');
  console.log('========================================');
  console.log('');

  // Hex dump
  const start = TARGET_FUNC;
  const end = TARGET_END;
  const length = end - start + 1;

  console.log(`Hex dump ${hex(start)} - ${hex(end)} (${length} bytes):`);
  console.log('');
  for (let i = 0; i < length; i += 16) {
    const addr = start + i;
    const bytes = [];
    for (let j = 0; j < 16 && (i + j) < length; j++) {
      bytes.push(romBytes[addr + j].toString(16).padStart(2, '0'));
    }
    console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }

  // Instruction decode
  console.log('');
  console.log('Instruction decode (ADL mode):');
  console.log('');

  let pc = start;
  let count = 0;
  while (pc <= end && count < 60) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      if (!inst) {
        console.log(`  ${hex(pc)}: (decode failed)`);
        pc += 1;
      } else {
        const byteLen = inst.length ?? inst.size ?? 1;
        const rawBytes = [];
        for (let i = 0; i < byteLen; i++) {
          rawBytes.push(romBytes[pc + i].toString(16).padStart(2, '0'));
        }
        console.log(`  ${hex(pc)}: ${rawBytes.join(' ').padEnd(20)} ${inst.dasm ?? inst.tag ?? '???'}`);
        pc += byteLen;
      }
    } catch {
      console.log(`  ${hex(pc)}: (decode error)`);
      pc += 1;
    }
    count++;
  }
  console.log('');
}

function dynamicTrace(executor, cpu, mem, ramSnapshot, label, d003ddValue, maxSteps) {
  console.log('----------------------------------------');
  console.log(`  ${label}: D003DD=${hex(d003ddValue, 2)}`);
  console.log('----------------------------------------');
  console.log('');

  // Restore RAM from snapshot
  mem.set(ramSnapshot, 0x400000);

  // Setup warm state
  setupWarmState(cpu, mem);

  // Set D003DD
  mem[D003DD] = d003ddValue;

  // Set PC
  cpu.a = 0;
  cpu.f = 0;
  cpu.b = 0;
  cpu.c = 0;
  cpu.d = 0;
  cpu.e = 0;
  cpu.h = 0;
  cpu.l = 0;

  const ramWrites = [];
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00000 && a < 0xE00000 && ramWrites.length < 200) {
      ramWrites.push({ addr: a, width: 1, value: value & 0xFF });
    }
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00000 && a < 0xE00000 && ramWrites.length < 200) {
      ramWrites.push({ addr: a, width: 2, value: value & 0xFFFF });
    }
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00000 && a < 0xE00000 && ramWrites.length < 200) {
      ramWrites.push({ addr: a, width: 3, value: value & 0xFFFFFF });
    }
    return originalWrite24(addr, value);
  };

  const uniqueBlocks = new Set();
  const traceLog = [];

  const entryRegs = {
    a: cpu.a, f: cpu.f, b: cpu.b, c: cpu.c,
    d: cpu.d, e: cpu.e, h: cpu.h, l: cpu.l,
    sp: cpu.sp, ix: cpu._ix, iy: cpu._iy,
  };

  console.log('Entry registers:');
  for (const [k, v] of Object.entries(entryRegs)) {
    console.log(`  ${k} = ${hex(v)}`);
  }
  console.log('');

  const result = executor.runFrom(TARGET_FUNC, 'adl', {
    maxSteps,
    maxLoopIterations: 500,
    onBlock(pc, mode, meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const dasm = meta?.instructions?.[0]?.dasm ?? '???';
      uniqueBlocks.add(normalizedPc);
      traceLog.push({ step: step + 1, pc: normalizedPc, dasm });
      console.log(`  [${String(step + 1).padStart(4)}] ${hex(normalizedPc)} ${dasm}`);
    },
  });

  console.log('');
  console.log(`Result: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)}`);
  console.log(`Unique blocks: ${uniqueBlocks.size}`);
  console.log(`Unique PCs: ${[...uniqueBlocks].sort((a, b) => a - b).map((p) => hex(p)).join(', ')}`);

  console.log('');
  console.log('Exit registers:');
  console.log(`  a=${hex(cpu.a, 2)} f=${hex(cpu.f, 2)} bc=${hex((cpu.b << 8) | cpu.c, 4)} de=${hex((cpu.d << 8) | cpu.e, 4)} hl=${hex((cpu.h << 8) | cpu.l, 4)}`);
  console.log(`  sp=${hex(cpu.sp)} ix=${hex(cpu._ix)} iy=${hex(cpu._iy)}`);

  console.log('');
  console.log(`RAM writes (${ramWrites.length}):`);
  for (const w of ramWrites.slice(0, 50)) {
    console.log(`  ${hex(w.addr)} width=${w.width} value=${hex(w.value, w.width * 2)}`);
  }
  if (ramWrites.length > 50) {
    console.log(`  ... and ${ramWrites.length - 50} more`);
  }

  console.log('');
  return { result, uniqueBlocks, traceLog, ramWrites };
}

function callerTrace(executor, cpu, mem, ramSnapshot) {
  console.log('========================================');
  console.log('  PART 3: Caller trace from 0x051B7C');
  console.log('========================================');
  console.log('');

  // Restore RAM
  mem.set(ramSnapshot, 0x400000);

  // Setup warm state
  setupWarmState(cpu, mem);

  // Set conditions for the CP cascade to reach CALL 0x07A627
  mem[D003DD] = 0x4A;
  mem[D0059F] = 0x00;   // non-0x80
  mem[D003E0] = 0x00;   // BIT 4 clear
  mem[D010F8] = 0x00;

  cpu.a = 0;
  cpu.f = 0;
  cpu.b = 0;
  cpu.c = 0;
  cpu.d = 0;
  cpu.e = 0;
  cpu.h = 0;
  cpu.l = 0;

  const blocksVisited = [];

  const result = executor.runFrom(CALLER_ENTRY, 'adl', {
    maxSteps: 200,
    maxLoopIterations: 100,
    onBlock(pc, mode, meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const dasm = meta?.instructions?.[0]?.dasm ?? '???';
      blocksVisited.push({ step: step + 1, pc: normalizedPc, dasm });
      console.log(`  [${String(step + 1).padStart(4)}] ${hex(normalizedPc)} ${dasm}`);
    },
  });

  console.log('');
  console.log(`Result: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)}`);

  const reached07A627 = blocksVisited.some((b) => b.pc === TARGET_FUNC);
  console.log(`Reached 0x07A627: ${reached07A627 ? 'YES' : 'NO'}`);

  if (!reached07A627) {
    console.log('');
    console.log('Blocks visited:');
    for (const b of blocksVisited) {
      console.log(`  ${hex(b.pc)} ${b.dasm}`);
    }
  }

  console.log('');
  return { result, blocksVisited, reached07A627 };
}

async function main() {
  console.log('=== Phase 242 — Trace 0x07A627 (called from 0x051B7C CP cascade) ===');
  console.log('');

  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const RAW_BLOCKS = romModule.PRELIFTED_BLOCKS;
  const BLOCKS = Array.isArray(RAW_BLOCKS)
    ? Object.fromEntries(RAW_BLOCKS.filter((b) => b?.id).map((b) => [b.id, b]))
    : RAW_BLOCKS;

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot to get warm state
  console.log('Cold booting...');
  const boot = coldBoot(executor, cpu, mem);
  console.log(
    `Boot: boot=${boot.boot.steps}/${boot.boot.termination} kernel=${boot.kernel.steps}/${boot.kernel.termination} post=${boot.post.steps}/${boot.post.termination}`,
  );
  console.log('');

  // Snapshot RAM after boot
  const ramSnapshot = new Uint8Array(mem.slice(0x400000, 0xE00000));

  // PART 1: Static disassembly
  staticDisassembly(romBytes);

  // PART 2: Dynamic traces with different D003DD values
  console.log('========================================');
  console.log('  PART 2: Dynamic Traces');
  console.log('========================================');
  console.log('');

  const results = {};

  for (const d003ddVal of [0x4A, 0x48, 0x49]) {
    results[d003ddVal] = dynamicTrace(
      executor, cpu, mem, ramSnapshot,
      `Dynamic trace D003DD=0x${d003ddVal.toString(16).toUpperCase()}`,
      d003ddVal,
      500,
    );
  }

  // PART 3: Caller trace from 0x051B7C
  callerTrace(executor, cpu, mem, ramSnapshot);

  // PART 4: Comparison summary
  console.log('========================================');
  console.log('  PART 4: Comparison Summary');
  console.log('========================================');
  console.log('');

  for (const [val, r] of Object.entries(results)) {
    const valHex = `0x${Number(val).toString(16).toUpperCase().padStart(2, '0')}`;
    console.log(`D003DD=${valHex}: steps=${r.result.steps} termination=${r.result.termination} lastPc=${hex(r.result.lastPc)} uniqueBlocks=${r.uniqueBlocks.size} ramWrites=${r.ramWrites.length}`);
  }

  // Check if behavior differs
  const blockSets = Object.values(results).map((r) => [...r.uniqueBlocks].sort((a, b) => a - b).join(','));
  const allSame = blockSets.every((s) => s === blockSets[0]);
  console.log('');
  console.log(`Behavior identical across all D003DD values: ${allSame ? 'YES' : 'NO'}`);

  if (!allSame) {
    console.log('');
    console.log('Block differences:');
    const allBlocks = new Set();
    for (const r of Object.values(results)) {
      for (const b of r.uniqueBlocks) {
        allBlocks.add(b);
      }
    }
    for (const b of [...allBlocks].sort((a, c) => a - c)) {
      const presence = Object.entries(results).map(([val, r]) => {
        const valHex = `0x${Number(val).toString(16).toUpperCase().padStart(2, '0')}`;
        return `${valHex}:${r.uniqueBlocks.has(b) ? 'Y' : 'N'}`;
      });
      console.log(`  ${hex(b)} ${presence.join(' ')}`);
    }
  }

  console.log('');
  console.log('=== Phase 242 complete ===');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
