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

const D02575_ADDR = 0xd02575;
const DISPATCHER_ENTRY = 0x061290;

const IY_ADDR = 0xd00080;
const MBASE = 0xd0;
const DEFAULT_STACK_TOP = 0xd1a87e;
const IX_ADDR = 0xd1a860;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MAX_LOOP_ITERATIONS = 8192;

const HOMESCREEN_MAX_STEPS = 80000;
const TOTAL_BOOT_LIMIT = 300000;

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
  const error = new Error('__PHASE218_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

// ─── Part A: Static ROM scan for 0xD02575 references ───

function scanRomForD02575() {
  const target = [0x75, 0x25, 0xd0]; // little-endian 0xD02575
  const hits = [];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] !== target[0] || rom[i + 1] !== target[1] || rom[i + 2] !== target[2]) continue;

    // Found the 3-byte pattern at offset i. Check preceding bytes for instruction decode.
    const contextStart = Math.max(0, i - 8);
    const contextEnd = Math.min(rom.length, i + 3 + 8);
    const context = [];
    for (let j = contextStart; j < contextEnd; j++) {
      context.push(hexByte(rom[j]));
    }

    let type = 'UNKNOWN';
    let instruction = '';

    // Check 1 byte before
    if (i >= 1) {
      const prev1 = rom[i - 1];
      if (prev1 === 0x3a) { type = 'READ'; instruction = 'LD A,(0xD02575)'; }
      else if (prev1 === 0x32) { type = 'WRITE'; instruction = 'LD (0xD02575),A'; }
      else if (prev1 === 0x2a) { type = 'READ'; instruction = 'LD HL,(0xD02575)'; }
      else if (prev1 === 0x22) { type = 'WRITE'; instruction = 'LD (0xD02575),HL'; }
      else if (prev1 === 0x21) { type = 'POINTER'; instruction = 'LD HL,0xD02575'; }
    }

    // Check 2 bytes before for ED-prefixed instructions
    if (type === 'UNKNOWN' && i >= 2) {
      const prev2 = rom[i - 2];
      const prev1 = rom[i - 1];
      if (prev2 === 0xed) {
        if (prev1 === 0x4b) { type = 'READ'; instruction = 'LD BC,(0xD02575)'; }
        else if (prev1 === 0x5b) { type = 'READ'; instruction = 'LD DE,(0xD02575)'; }
        else if (prev1 === 0x7b) { type = 'READ'; instruction = 'LD SP,(0xD02575)'; }
        else if (prev1 === 0x43) { type = 'WRITE'; instruction = 'LD (0xD02575),BC'; }
        else if (prev1 === 0x53) { type = 'WRITE'; instruction = 'LD (0xD02575),DE'; }
        else if (prev1 === 0x73) { type = 'WRITE'; instruction = 'LD (0xD02575),SP'; }
      }
    }

    // Instruction address: the opcode byte(s) before the operand
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

// ─── Part B: Nearby pointer scan (D02570-D0257F range) ───

function scanRomForNearbyPointers() {
  const hits = [];

  for (let i = 0; i < rom.length - 2; i++) {
    const low = rom[i];
    const mid = rom[i + 1];
    const high = rom[i + 2];

    // Check for D02570-D0257F range: high=0xD0, mid=0x25, low=0x70-0x7F
    if (high !== 0xd0 || mid !== 0x25) continue;
    if (low < 0x70 || low > 0x7f) continue;
    if (low === 0x75) continue; // Already covered in Part A

    const targetAddr = (high << 16) | (mid << 8) | low;

    let type = 'UNKNOWN';
    let instruction = '';

    if (i >= 1) {
      const prev1 = rom[i - 1];
      if (prev1 === 0x21) { type = 'POINTER'; instruction = `LD HL,${hex(targetAddr)}`; }
      else if (prev1 === 0x3a) { type = 'READ'; instruction = `LD A,(${hex(targetAddr)})`; }
      else if (prev1 === 0x32) { type = 'WRITE'; instruction = `LD (${hex(targetAddr)}),A`; }
      else if (prev1 === 0x2a) { type = 'READ'; instruction = `LD HL,(${hex(targetAddr)})`; }
      else if (prev1 === 0x22) { type = 'WRITE'; instruction = `LD (${hex(targetAddr)}),HL`; }
    }

    if (type === 'UNKNOWN' && i >= 2 && rom[i - 2] === 0xed) {
      const prev1 = rom[i - 1];
      if (prev1 === 0x4b) { type = 'READ'; instruction = `LD BC,(${hex(targetAddr)})`; }
      else if (prev1 === 0x5b) { type = 'READ'; instruction = `LD DE,(${hex(targetAddr)})`; }
      else if (prev1 === 0x43) { type = 'WRITE'; instruction = `LD (${hex(targetAddr)}),BC`; }
      else if (prev1 === 0x53) { type = 'WRITE'; instruction = `LD (${hex(targetAddr)}),DE`; }
    }

    let instrAddr = i - 1;
    if (type !== 'UNKNOWN' && i >= 2 && rom[i - 2] === 0xed) {
      instrAddr = i - 2;
    }

    hits.push({
      patternOffset: hex(i),
      instrAddr: hex(instrAddr),
      targetAddr: hex(targetAddr),
      type,
      instruction: instruction || `(unknown opcode)`,
    });
  }

  return hits;
}

// ─── Part D: Context around write sites ───

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

  // Look for conditioning instructions (CP, BIT, JR) in the 16 bytes before
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
    }
    if (b === 0x18 && j + 1 < addr) {
      conditions.push({ addr: hex(j), instr: `JR ${hexByte(rom[j + 1])}` });
    }
    if (b === 0x20 && j + 1 < addr) {
      conditions.push({ addr: hex(j), instr: `JR NZ,${hexByte(rom[j + 1])}` });
    }
    if (b === 0x28 && j + 1 < addr) {
      conditions.push({ addr: hex(j), instr: `JR Z,${hexByte(rom[j + 1])}` });
    }
    if (b === 0x30 && j + 1 < addr) {
      conditions.push({ addr: hex(j), instr: `JR NC,${hexByte(rom[j + 1])}` });
    }
    if (b === 0x38 && j + 1 < addr) {
      conditions.push({ addr: hex(j), instr: `JR C,${hexByte(rom[j + 1])}` });
    }
  }

  // Check what value is being written: look for LD A,imm before a LD (D02575),A
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
  }

  return {
    instrAddr: hex(addr),
    likelyFuncStart: funcStart,
    bytesAround: bytes,
    precedingConditions: conditions,
    valueAnalysis,
  };
}

// ─── Part C: Dynamic boot trace with write watchpoint ───

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
    if (error?.message === '__PHASE218_STOP__' && error.stopName === 'mem_init_return') {
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

function dynamicBootTrace() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  // Full boot
  const bootResult = coldBoot(executor, cpu, mem);

  // memInit
  const memInitResult = runMemInit(executor, cpu, mem);

  // Read D02575 after full boot+memInit
  const valueAfterBoot = mem[D02575_ADDR] & 0xff;

  // Now run homescreen stages to see if D02575 gets set
  // Reset state for homescreen
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.sp = DEFAULT_STACK_TOP;

  // Homescreen stages 1-4 entry at 0x021A38 (standard homescreen entry)
  // Try running from POST_INIT which leads into homescreen
  const valueBeforeHomescreen = mem[D02575_ADDR] & 0xff;

  return {
    bootResult,
    memInitResult,
    valueAfterBoot: hexByte(valueAfterBoot),
    valueBeforeHomescreen: hexByte(valueBeforeHomescreen),
  };
}

function dynamicBootTraceWithWatchpoint() {
  // Re-run the full boot with a memory watchpoint on D02575
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  const writeEvents = [];
  let totalSteps = 0;
  let prevValue = mem[D02575_ADDR] & 0xff;

  function checkD02575(phaseName, pc, step) {
    const currentValue = mem[D02575_ADDR] & 0xff;
    if (currentValue !== prevValue) {
      writeEvents.push({
        phase: phaseName,
        step: step,
        totalStep: totalSteps + step,
        pc: hex(pc),
        oldValue: hexByte(prevValue),
        newValue: hexByte(currentValue),
      });
      prevValue = currentValue;
    }
  }

  // Phase 1: Boot (z80 mode)
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
    onBlock(pc, mode, meta, step) {
      checkD02575('boot', pc, step ?? 0);
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
      checkD02575('kernelInit', pc, step ?? 0);
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
      checkD02575('postInit', pc, step ?? 0);
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
        checkD02575('memInit', pc, step ?? 0);
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
    });
    totalSteps += memInit.steps ?? 0;
  } catch (error) {
    if (error?.message === '__PHASE218_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  const finalValue = mem[D02575_ADDR] & 0xff;

  return {
    totalSteps,
    memInitReturned,
    finalValue: hexByte(finalValue),
    writeEvents,
    writeEventCount: writeEvents.length,
  };
}

// ─── Part B: IY offset confirmation ───

function confirmIyOffset() {
  const offset = D02575_ADDR - IY_ADDR;
  return {
    d02575: hex(D02575_ADDR),
    iyBase: hex(IY_ADDR),
    offset: hex(offset),
    offsetDecimal: offset,
    fitsInSignedByte: offset >= -128 && offset <= 127,
    conclusion: offset > 127
      ? `Offset ${offset} (${hex(offset)}) exceeds signed byte range [-128, 127]. IY+d access is IMPOSSIBLE.`
      : `Offset ${offset} fits in signed byte. IY+d access is possible.`,
  };
}

// ─── Main ───

function main() {
  console.log('=== Phase 218: D02575 Writers Investigation ===\n');

  // Part A: Static ROM scan
  console.log('--- Part A: Static ROM scan for 0xD02575 references ---');
  const romHits = scanRomForD02575();
  console.log(`Found ${romHits.length} references to 0xD02575 in ROM:\n`);

  const writeHits = [];
  const readHits = [];
  const pointerHits = [];
  const unknownHits = [];

  for (const hit of romHits) {
    console.log(`  ${hit.instrAddr}: ${hit.instruction} [${hit.type}]`);
    console.log(`    context: ${hit.context}\n`);

    if (hit.type === 'WRITE') writeHits.push(hit);
    else if (hit.type === 'READ') readHits.push(hit);
    else if (hit.type === 'POINTER') pointerHits.push(hit);
    else unknownHits.push(hit);
  }

  console.log(`Summary: ${writeHits.length} WRITE, ${readHits.length} READ, ${pointerHits.length} POINTER, ${unknownHits.length} UNKNOWN\n`);

  // Part B: IY offset and nearby pointer scan
  console.log('--- Part B: IY offset confirmation ---');
  const iyCheck = confirmIyOffset();
  console.log(`  ${iyCheck.conclusion}\n`);

  console.log('--- Part B: Nearby pointer scan (D02570-D0257F) ---');
  const nearbyHits = scanRomForNearbyPointers();
  console.log(`Found ${nearbyHits.length} references to D02570-D0257F (excluding D02575):\n`);
  for (const hit of nearbyHits) {
    console.log(`  ${hit.instrAddr}: ${hit.instruction} -> ${hit.targetAddr} [${hit.type}]`);
  }
  console.log('');

  // Part C: Dynamic boot trace
  console.log('--- Part C: Dynamic boot trace ---');
  const bootTrace = dynamicBootTrace();
  console.log(`  Boot: steps=${bootTrace.bootResult.boot.steps}, termination=${bootTrace.bootResult.boot.termination}`);
  console.log(`  KernelInit: steps=${bootTrace.bootResult.kernelInit.steps}, termination=${bootTrace.bootResult.kernelInit.termination}`);
  console.log(`  PostInit: steps=${bootTrace.bootResult.postInit.steps}, termination=${bootTrace.bootResult.postInit.termination}`);
  console.log(`  MemInit: returned=${bootTrace.memInitResult.returned}, termination=${bootTrace.memInitResult.termination}`);
  console.log(`  D02575 after full boot: ${bootTrace.valueAfterBoot}`);
  console.log('');

  console.log('--- Part C: Write watchpoint trace ---');
  const watchTrace = dynamicBootTraceWithWatchpoint();
  console.log(`  Total steps traced: ${watchTrace.totalSteps}`);
  console.log(`  MemInit returned: ${watchTrace.memInitReturned}`);
  console.log(`  D02575 final value: ${watchTrace.finalValue}`);
  console.log(`  Write events detected: ${watchTrace.writeEventCount}`);
  if (watchTrace.writeEvents.length > 0) {
    console.log('  Write events:');
    for (const evt of watchTrace.writeEvents) {
      console.log(`    phase=${evt.phase}, step=${evt.step}, totalStep=${evt.totalStep}, pc=${evt.pc}, ${evt.oldValue} -> ${evt.newValue}`);
    }
  } else {
    console.log('  No writes to D02575 detected during boot sequence.');
  }
  console.log('');

  // Part D: Context around write sites
  console.log('--- Part D: Context around WRITE sites ---');
  if (writeHits.length === 0) {
    console.log('  No WRITE sites found in Part A.\n');
  } else {
    for (const hit of writeHits) {
      const addrNum = parseInt(hit.instrAddr.replace('0x', ''), 16);
      const ctx = disassembleContext(addrNum);
      console.log(`\n  WRITE site at ${hit.instrAddr}: ${hit.instruction}`);
      if (ctx) {
        console.log(`    Likely function start: ${ctx.likelyFuncStart ?? 'not found (no RET in 256 bytes)'}`);
        console.log(`    Value analysis: ${ctx.valueAnalysis}`);
        if (ctx.precedingConditions.length > 0) {
          console.log('    Preceding conditions:');
          for (const cond of ctx.precedingConditions) {
            console.log(`      ${cond.addr}: ${cond.instr}`);
          }
        } else {
          console.log('    No obvious conditioning instructions in preceding 16 bytes.');
        }
        console.log('    Raw bytes around instruction:');
        const byteStr = ctx.bytesAround.map((b) => `${b.byte}`).join(' ');
        const addrStr = ctx.bytesAround.map((b) => b.addr).join(' ');
        console.log(`      addrs: ${ctx.bytesAround[0]?.addr} .. ${ctx.bytesAround[ctx.bytesAround.length - 1]?.addr}`);
        console.log(`      bytes: ${byteStr}`);
      }
    }
  }

  // Also show context for POINTER hits (could be used for indirect writes)
  if (pointerHits.length > 0) {
    console.log('\n--- Part D: Context around POINTER sites (potential indirect writes) ---');
    for (const hit of pointerHits) {
      const addrNum = parseInt(hit.instrAddr.replace('0x', ''), 16);
      const ctx = disassembleContext(addrNum);
      console.log(`\n  POINTER site at ${hit.instrAddr}: ${hit.instruction}`);
      if (ctx) {
        console.log(`    Likely function start: ${ctx.likelyFuncStart ?? 'not found'}`);
        console.log(`    Value analysis: ${ctx.valueAnalysis}`);
        if (ctx.precedingConditions.length > 0) {
          console.log('    Preceding conditions:');
          for (const cond of ctx.precedingConditions) {
            console.log(`      ${cond.addr}: ${cond.instr}`);
          }
        }
      }
    }
  }

  console.log('\n=== Phase 218 Complete ===');

  // JSON summary
  const report = {
    probe: 'probe-phase218-d02575-writers.mjs',
    generatedAt: new Date().toISOString(),
    partA: {
      totalHits: romHits.length,
      writeCount: writeHits.length,
      readCount: readHits.length,
      pointerCount: pointerHits.length,
      unknownCount: unknownHits.length,
      hits: romHits,
    },
    partB: {
      iyOffset: iyCheck,
      nearbyPointers: nearbyHits,
    },
    partC: {
      bootValue: bootTrace.valueAfterBoot,
      watchpoint: watchTrace,
    },
    partD: {
      writeSiteContexts: writeHits.map((hit) => {
        const addrNum = parseInt(hit.instrAddr.replace('0x', ''), 16);
        return disassembleContext(addrNum);
      }),
    },
  };

  console.log('\n--- JSON Report ---');
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase218-d02575-writers.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
