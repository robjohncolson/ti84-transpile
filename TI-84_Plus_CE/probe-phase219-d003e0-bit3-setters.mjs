#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      : 'ROM.transpiled.js is missing.',
  );
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const rom = readFileSync(romPath);

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEM_INIT_ENTRY = 0x09dee0;
const MEM_INIT_RET = 0x7ffff6;

const TARGET_ADDR = 0xd003e0;
const EVENT_LOOP_ENTRY = 0x082be2;

const IY_ADDR = 0xd00080;
const MBASE = 0xd0;
const DEFAULT_STACK_TOP = 0xd1a87e;
const IX_ADDR = 0xd1a860;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MAX_LOOP_ITERATIONS = 8192;

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks
        .filter((block) => block?.id)
        .map((block) => [block.id, block]),
    );
  }

  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xff, 2);
}

function read24(mem, addr) {
  const a = addr & 0xffffff;
  return ((mem[a] & 0xff) | ((mem[a + 1] & 0xff) << 8) | ((mem[a + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xffffff;
  mem[a] = value & 0xff;
  mem[a + 1] = (value >>> 8) & 0xff;
  mem[a + 2] = (value >>> 16) & 0xff;
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function makeStop(name, detail = null) {
  const error = new Error('__PHASE219_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

// ─── Part A: Static ROM scan for 0xD003E0 references ───

function scanRomForD003E0() {
  const target = [0xe0, 0x03, 0xd0]; // little-endian 0xD003E0
  const hits = [];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] !== target[0] || rom[i + 1] !== target[1] || rom[i + 2] !== target[2]) continue;

    const contextStart = Math.max(0, i - 8);
    const contextEnd = Math.min(rom.length, i + 3 + 8);
    const context = [];
    for (let j = contextStart; j < contextEnd; j++) {
      context.push(hexByte(rom[j]));
    }

    let type = 'UNKNOWN';
    let instruction = '';

    // Check 1 byte before for single-byte prefix instructions
    if (i >= 1) {
      const prev1 = rom[i - 1];
      if (prev1 === 0x3a) { type = 'READ'; instruction = 'LD A,(0xD003E0)'; }
      else if (prev1 === 0x32) { type = 'WRITE'; instruction = 'LD (0xD003E0),A'; }
      else if (prev1 === 0x2a) { type = 'READ'; instruction = 'LD HL,(0xD003E0)'; }
      else if (prev1 === 0x22) { type = 'WRITE'; instruction = 'LD (0xD003E0),HL'; }
      else if (prev1 === 0x21) { type = 'POINTER'; instruction = 'LD HL,0xD003E0'; }
    }

    // Check 2 bytes before for ED-prefixed instructions
    if (type === 'UNKNOWN' && i >= 2) {
      const prev2 = rom[i - 2];
      const prev1 = rom[i - 1];
      if (prev2 === 0xed) {
        if (prev1 === 0x4b) { type = 'READ'; instruction = 'LD BC,(0xD003E0)'; }
        else if (prev1 === 0x5b) { type = 'READ'; instruction = 'LD DE,(0xD003E0)'; }
        else if (prev1 === 0x7b) { type = 'READ'; instruction = 'LD SP,(0xD003E0)'; }
        else if (prev1 === 0x43) { type = 'WRITE'; instruction = 'LD (0xD003E0),BC'; }
        else if (prev1 === 0x53) { type = 'WRITE'; instruction = 'LD (0xD003E0),DE'; }
        else if (prev1 === 0x73) { type = 'WRITE'; instruction = 'LD (0xD003E0),SP'; }
      }
    }

    // Check for CALL/JP to this address (unlikely for RAM but be thorough)
    if (type === 'UNKNOWN' && i >= 1) {
      const prev1 = rom[i - 1];
      if (prev1 === 0xcd) { type = 'CALL'; instruction = 'CALL 0xD003E0'; }
      else if (prev1 === 0xc3) { type = 'JP'; instruction = 'JP 0xD003E0'; }
    }

    // Instruction address
    let instrAddr = i - 1;
    if (type !== 'UNKNOWN' && i >= 2 && rom[i - 2] === 0xed) {
      instrAddr = i - 2;
    }

    hits.push({
      patternOffset: hex(i),
      instrAddr: hex(instrAddr),
      type,
      instruction: instruction || `(unknown opcode before ${hexByte(rom[i - 1] ?? 0)})`,
      context: context.join(' '),
    });
  }

  return hits;
}

// ─── Part A supplementary: Disassembly context around each hit ───

function disassembleContext(instrAddr) {
  const addr = Number(instrAddr) & 0xffffff;
  if (addr >= rom.length) return null;

  const contextBefore = Math.max(0, addr - 16);
  const contextAfter = Math.min(rom.length, addr + 16);

  const bytes = [];
  for (let j = contextBefore; j < contextAfter; j++) {
    bytes.push({ addr: hex(j), byte: hexByte(rom[j]) });
  }

  // Scan backwards for RET (0xC9) to find likely function boundary
  let funcStart = null;
  for (let j = addr - 1; j >= Math.max(0, addr - 256); j--) {
    if (rom[j] === 0xc9) {
      funcStart = hex(j + 1);
      break;
    }
  }

  // Look for conditioning instructions in the 16 bytes before
  const conditions = [];
  for (let j = contextBefore; j < addr; j++) {
    const b = rom[j];
    if (b === 0xfe && j + 1 < addr) {
      conditions.push({ addr: hex(j), instr: `CP ${hexByte(rom[j + 1])}` });
    }
    if (b === 0xcb && j + 1 < addr) {
      const cb = rom[j + 1];
      if ((cb & 0xc0) === 0x40) {
        const bit = (cb >> 3) & 7;
        const reg = cb & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        conditions.push({ addr: hex(j), instr: `BIT ${bit},${regNames[reg]}` });
      }
      if ((cb & 0xc0) === 0xc0) {
        const bit = (cb >> 3) & 7;
        const reg = cb & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        conditions.push({ addr: hex(j), instr: `SET ${bit},${regNames[reg]}` });
      }
      if ((cb & 0xc0) === 0x80) {
        const bit = (cb >> 3) & 7;
        const reg = cb & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        conditions.push({ addr: hex(j), instr: `RES ${bit},${regNames[reg]}` });
      }
    }
    if (b === 0x20 && j + 1 < addr) {
      conditions.push({ addr: hex(j), instr: `JR NZ,${hexByte(rom[j + 1])}` });
    }
    if (b === 0x28 && j + 1 < addr) {
      conditions.push({ addr: hex(j), instr: `JR Z,${hexByte(rom[j + 1])}` });
    }
  }

  // Check what value is being written
  let valueAnalysis = 'A is unknown/computed';
  for (let j = addr - 1; j >= Math.max(0, addr - 8); j--) {
    if (rom[j] === 0x3e && j + 1 < addr) {
      valueAnalysis = `A loaded with immediate ${hexByte(rom[j + 1])} at ${hex(j)}`;
      break;
    }
    if (rom[j] === 0xaf) {
      valueAnalysis = `A zeroed via XOR A at ${hex(j)}`;
      break;
    }
    if (rom[j] === 0xe6 && j + 1 < addr) {
      valueAnalysis = `A masked via AND ${hexByte(rom[j + 1])} at ${hex(j)}`;
      break;
    }
    if (rom[j] === 0xf6 && j + 1 < addr) {
      valueAnalysis = `A modified via OR ${hexByte(rom[j + 1])} at ${hex(j)}`;
      break;
    }
    if (rom[j] === 0xcb && j + 1 < addr) {
      const cb = rom[j + 1];
      if ((cb & 0xc0) === 0xc0) {
        const bit = (cb >> 3) & 7;
        const reg = cb & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        valueAnalysis = `SET ${bit},${regNames[reg]} at ${hex(j)}`;
        break;
      }
      if ((cb & 0xc0) === 0x80) {
        const bit = (cb >> 3) & 7;
        const reg = cb & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        valueAnalysis = `RES ${bit},${regNames[reg]} at ${hex(j)}`;
        break;
      }
    }
  }

  return {
    instrAddr: hex(addr),
    likelyFuncStart: funcStart,
    bytesAround: bytes,
    precedingConditions: conditions,
    valueAnalysis,
  };
}

// ─── Part B: Boot trace — check 0xD003E0 after full boot ───

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = DEFAULT_STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = DEFAULT_STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc ?? 0) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc ?? 0) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc ?? 0) },
  };
}

function runMemInit(executor, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.sp = DEFAULT_STACK_TOP;

  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return', hex(pc));
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return', hex(pc));
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE219_STOP__' && error.stopName === 'mem_init_return') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    steps: result?.steps ?? null,
    termination: returned ? 'sentinel' : (result?.termination ?? null),
  };
}

// ─── Part C: Event loop trace with write watchpoint on 0xD003E0 ───

function runEventLoopWithWatchpoint(executor, cpu, mem, maxSteps) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.sp = DEFAULT_STACK_TOP;

  // Push sentinel return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  const writeEvents = [];
  let prevValue = mem[TARGET_ADDR] & 0xff;

  function checkTarget(phaseName, pc, step) {
    const currentValue = mem[TARGET_ADDR] & 0xff;
    if (currentValue !== prevValue) {
      writeEvents.push({
        phase: phaseName,
        step,
        pc: hex(pc),
        oldValue: hexByte(prevValue),
        newValue: hexByte(currentValue),
        bit3Old: (prevValue >> 3) & 1,
        bit3New: (currentValue >> 3) & 1,
      });
      prevValue = currentValue;
    }
  }

  let result = null;
  try {
    result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        checkTarget('eventLoop', pc, step ?? 0);
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('sentinel_return');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('sentinel_return');
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE219_STOP__') {
      // Expected sentinel return
    } else {
      throw error;
    }
  }

  const finalValue = mem[TARGET_ADDR] & 0xff;

  return {
    steps: result?.steps ?? null,
    termination: result?.termination ?? 'sentinel',
    finalValue: hexByte(finalValue),
    bit3Set: ((finalValue >> 3) & 1) === 1,
    writeEvents,
    writeEventCount: writeEvents.length,
  };
}

// ─── Part B+C combined: Full boot with watchpoint on 0xD003E0 ───

function fullBootWithWatchpoint() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  const writeEvents = [];
  let totalSteps = 0;
  let prevValue = mem[TARGET_ADDR] & 0xff;

  function checkTarget(phaseName, pc, step) {
    const currentValue = mem[TARGET_ADDR] & 0xff;
    if (currentValue !== prevValue) {
      writeEvents.push({
        phase: phaseName,
        step,
        totalStep: totalSteps + (step ?? 0),
        pc: hex(pc),
        oldValue: hexByte(prevValue),
        newValue: hexByte(currentValue),
        bit3Old: (prevValue >> 3) & 1,
        bit3New: (currentValue >> 3) & 1,
      });
      prevValue = currentValue;
    }
  }

  // Phase 1: Boot (z80 mode)
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
    onBlock(pc, mode, meta, step) {
      checkTarget('boot', pc, step ?? 0);
    },
  });
  totalSteps += boot.steps ?? 0;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = DEFAULT_STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  // Phase 2: kernelInit
  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
    onBlock(pc, mode, meta, step) {
      checkTarget('kernelInit', pc, step ?? 0);
    },
  });
  totalSteps += kernelInit.steps ?? 0;

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = DEFAULT_STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  // Phase 3: postInit
  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
    onBlock(pc, mode, meta, step) {
      checkTarget('postInit', pc, step ?? 0);
    },
  });
  totalSteps += postInit.steps ?? 0;

  // Phase 4: memInit
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.sp = DEFAULT_STACK_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInitReturned = false;
  try {
    const memInit = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        checkTarget('memInit', pc, step ?? 0);
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
    });
    totalSteps += memInit.steps ?? 0;
  } catch (error) {
    if (error?.message === '__PHASE219_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  const valueAfterBoot = mem[TARGET_ADDR] & 0xff;
  const bit3AfterBoot = ((valueAfterBoot >> 3) & 1) === 1;

  return {
    executor,
    cpu,
    mem,
    totalSteps,
    memInitReturned,
    valueAfterBoot: hexByte(valueAfterBoot),
    bit3AfterBoot,
    writeEvents,
    writeEventCount: writeEvents.length,
  };
}

// ─── Main ───

function main() {
  console.log('=== Phase 219: D003E0 BIT 3 Setters Investigation ===\n');

  // ─── Part A: Static ROM scan ───
  console.log('--- Part A: Static ROM scan for 0xD003E0 references ---');
  const romHits = scanRomForD003E0();
  console.log(`Found ${romHits.length} references to 0xD003E0 in ROM:\n`);

  const writeHits = [];
  const readHits = [];
  const pointerHits = [];
  const otherHits = [];

  for (const hit of romHits) {
    console.log(`  ${hit.instrAddr}: ${hit.instruction} [${hit.type}]`);
    console.log(`    context: ${hit.context}\n`);

    if (hit.type === 'WRITE') writeHits.push(hit);
    else if (hit.type === 'READ') readHits.push(hit);
    else if (hit.type === 'POINTER') pointerHits.push(hit);
    else otherHits.push(hit);
  }

  console.log(`Summary: ${writeHits.length} WRITE, ${readHits.length} READ, ${pointerHits.length} POINTER, ${otherHits.length} OTHER\n`);

  // Show context around each hit
  console.log('--- Part A: Detailed context around each reference ---');
  for (const hit of romHits) {
    const addrNum = parseInt(hit.instrAddr.replace('0x', ''), 16);
    const ctx = disassembleContext(addrNum);
    console.log(`\n  ${hit.type} at ${hit.instrAddr}: ${hit.instruction}`);
    if (ctx) {
      console.log(`    Likely function start: ${ctx.likelyFuncStart ?? 'not found (no RET in 256 bytes)'}`);
      console.log(`    Value analysis: ${ctx.valueAnalysis}`);
      if (ctx.precedingConditions.length > 0) {
        console.log('    Preceding conditions:');
        for (const cond of ctx.precedingConditions) {
          console.log(`      ${cond.addr}: ${cond.instr}`);
        }
      }
      const byteStr = ctx.bytesAround.map((b) => b.byte).join(' ');
      console.log(`    Bytes [${ctx.bytesAround[0]?.addr}..${ctx.bytesAround[ctx.bytesAround.length - 1]?.addr}]: ${byteStr}`);
    }
  }
  console.log('');

  // ─── Part B: Boot trace ───
  console.log('--- Part B: Full boot trace with watchpoint on 0xD003E0 ---');
  const bootResult = fullBootWithWatchpoint();
  console.log(`  Total boot steps: ${bootResult.totalSteps}`);
  console.log(`  MemInit returned: ${bootResult.memInitReturned}`);
  console.log(`  D003E0 after boot: ${bootResult.valueAfterBoot}`);
  console.log(`  BIT 3 after boot: ${bootResult.bit3AfterBoot ? 'SET' : 'CLEAR'}`);
  console.log(`  Write events during boot: ${bootResult.writeEventCount}`);
  if (bootResult.writeEvents.length > 0) {
    console.log('  Boot write events:');
    for (const evt of bootResult.writeEvents) {
      console.log(`    phase=${evt.phase}, step=${evt.step}, pc=${evt.pc}, ${evt.oldValue} -> ${evt.newValue} (bit3: ${evt.bit3Old} -> ${evt.bit3New})`);
    }
  } else {
    console.log('  No writes to D003E0 detected during boot.');
  }
  console.log('');

  // ─── Part C: Event loop trace if BIT 3 not set ───
  if (!bootResult.bit3AfterBoot) {
    console.log('--- Part C: Event loop trace (BIT 3 NOT set after boot) ---');
    console.log('  Running event loop from 0x082BE2 with write watchpoint...');

    const eventResult = runEventLoopWithWatchpoint(
      bootResult.executor,
      bootResult.cpu,
      bootResult.mem,
      5000,
    );

    console.log(`  Event loop steps: ${eventResult.steps}`);
    console.log(`  Termination: ${eventResult.termination}`);
    console.log(`  D003E0 after event loop: ${eventResult.finalValue}`);
    console.log(`  BIT 3 after event loop: ${eventResult.bit3Set ? 'SET' : 'CLEAR'}`);
    console.log(`  Write events: ${eventResult.writeEventCount}`);
    if (eventResult.writeEvents.length > 0) {
      console.log('  Event loop write events:');
      for (const evt of eventResult.writeEvents) {
        console.log(`    step=${evt.step}, pc=${evt.pc}, ${evt.oldValue} -> ${evt.newValue} (bit3: ${evt.bit3Old} -> ${evt.bit3New})`);
      }
    } else {
      console.log('  No writes to D003E0 during event loop trace.');
    }
    console.log('');

    // Try a longer run if still not set
    if (!eventResult.bit3Set) {
      console.log('--- Part C (extended): Longer event loop trace (10000 steps) ---');
      // Re-run from fresh boot for clean state
      const mem2 = createMemoryWithRom();
      const { executor: exec2, cpu: cpu2 } = createRuntime(mem2);

      // Quick boot without watchpoint
      const b2 = exec2.runFrom(BOOT_ENTRY, 'z80', { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: 32 });
      cpu2.halted = false; cpu2.iff1 = 0; cpu2.iff2 = 0;
      cpu2.sp = DEFAULT_STACK_TOP - 3;
      mem2.fill(0xff, cpu2.sp, cpu2.sp + 3);

      exec2.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: KERNEL_INIT_MAX_STEPS, maxLoopIterations: 10000 });
      cpu2.mbase = MBASE; cpu2.iy = IY_ADDR; cpu2.hl = 0;
      cpu2.halted = false; cpu2.iff1 = 0; cpu2.iff2 = 0;
      cpu2.sp = DEFAULT_STACK_TOP - 3;
      mem2.fill(0xff, cpu2.sp, cpu2.sp + 3);

      exec2.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: POST_INIT_MAX_STEPS, maxLoopIterations: 32 });

      cpu2.halted = false; cpu2.iff1 = 0; cpu2.iff2 = 0;
      cpu2.madl = 1; cpu2.mbase = MBASE; cpu2.iy = IY_ADDR; cpu2.ix = IX_ADDR;
      cpu2.sp = DEFAULT_STACK_TOP;
      cpu2.sp -= 3;
      write24(mem2, cpu2.sp, MEM_INIT_RET);

      try {
        exec2.runFrom(MEM_INIT_ENTRY, 'adl', {
          maxSteps: MEM_INIT_MAX_STEPS,
          maxLoopIterations: MAX_LOOP_ITERATIONS,
          onBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return'); },
          onMissingBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return'); },
        });
      } catch (error) {
        if (!(error?.message === '__PHASE219_STOP__' && error.stopName === 'mem_init_return')) throw error;
      }

      const extResult = runEventLoopWithWatchpoint(exec2, cpu2, mem2, 10000);
      console.log(`  Extended event loop steps: ${extResult.steps}`);
      console.log(`  D003E0 after extended run: ${extResult.finalValue}`);
      console.log(`  BIT 3 after extended run: ${extResult.bit3Set ? 'SET' : 'CLEAR'}`);
      console.log(`  Write events: ${extResult.writeEventCount}`);
      if (extResult.writeEvents.length > 0) {
        console.log('  Extended write events:');
        for (const evt of extResult.writeEvents) {
          console.log(`    step=${evt.step}, pc=${evt.pc}, ${evt.oldValue} -> ${evt.newValue} (bit3: ${evt.bit3Old} -> ${evt.bit3New})`);
        }
      }
      console.log('');
    }
  } else {
    console.log('--- Part C: Skipped (BIT 3 already SET after boot) ---\n');
  }

  // ─── IY offset check ───
  const iyOffset = TARGET_ADDR - IY_ADDR;
  console.log('--- IY Offset Check ---');
  console.log(`  0xD003E0 - IY(0xD00080) = ${hex(iyOffset)} (${iyOffset} decimal)`);
  console.log(`  Fits in signed byte [-128,127]: ${iyOffset >= -128 && iyOffset <= 127 ? 'YES' : 'NO'}`);
  console.log(`  IY-indexed access: ${iyOffset > 127 ? 'NOT POSSIBLE (offset too large)' : 'possible'}`);
  console.log('');

  console.log('=== Phase 219 Complete ===');

  // JSON summary
  const report = {
    probe: 'probe-phase219-d003e0-bit3-setters.mjs',
    generatedAt: new Date().toISOString(),
    partA: {
      totalHits: romHits.length,
      writeCount: writeHits.length,
      readCount: readHits.length,
      pointerCount: pointerHits.length,
      otherCount: otherHits.length,
      hits: romHits,
    },
    partB: {
      valueAfterBoot: bootResult.valueAfterBoot,
      bit3AfterBoot: bootResult.bit3AfterBoot,
      writeEvents: bootResult.writeEvents,
    },
  };

  console.log('\n--- JSON Report ---');
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase219-d003e0-bit3-setters.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
