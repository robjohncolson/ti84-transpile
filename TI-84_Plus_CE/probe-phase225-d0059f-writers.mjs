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

const D0059F_ADDR = 0xd0059f;
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
const EVENT_LOOP_MAX_STEPS = 10000;

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
  const error = new Error('__PHASE225_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

// ─── Part A: Static ROM scan for LD (0xD0059F),A and LD A,(0xD0059F) ───

function scanRomForD0059F() {
  const target = [0x9f, 0x05, 0xd0]; // little-endian 0xD0059F
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
    let instrAddr = i - 1;

    // Check 1 byte before for simple instructions
    if (i >= 1) {
      const prev1 = rom[i - 1];
      if (prev1 === 0x3a) { type = 'READ'; instruction = 'LD A,(0xD0059F)'; }
      else if (prev1 === 0x32) { type = 'WRITE'; instruction = 'LD (0xD0059F),A'; }
      else if (prev1 === 0x2a) { type = 'READ'; instruction = 'LD HL,(0xD0059F)'; }
      else if (prev1 === 0x22) { type = 'WRITE'; instruction = 'LD (0xD0059F),HL'; }
      else if (prev1 === 0x21) { type = 'POINTER'; instruction = 'LD HL,0xD0059F'; }
    }

    // Check 2 bytes before for ED-prefixed instructions
    if (type === 'UNKNOWN' && i >= 2) {
      const prev2 = rom[i - 2];
      const prev1 = rom[i - 1];
      if (prev2 === 0xed) {
        if (prev1 === 0x4b) { type = 'READ'; instruction = 'LD BC,(0xD0059F)'; }
        else if (prev1 === 0x5b) { type = 'READ'; instruction = 'LD DE,(0xD0059F)'; }
        else if (prev1 === 0x7b) { type = 'READ'; instruction = 'LD SP,(0xD0059F)'; }
        else if (prev1 === 0x43) { type = 'WRITE'; instruction = 'LD (0xD0059F),BC'; }
        else if (prev1 === 0x53) { type = 'WRITE'; instruction = 'LD (0xD0059F),DE'; }
        else if (prev1 === 0x73) { type = 'WRITE'; instruction = 'LD (0xD0059F),SP'; }
        instrAddr = i - 2;
      }
    }

    // Check 2 bytes before for MADL prefix (0x49) + opcode
    if (type === 'UNKNOWN' && i >= 2) {
      const prev2 = rom[i - 2];
      const prev1 = rom[i - 1];
      if (prev2 === 0x49) {
        if (prev1 === 0x3a) { type = 'READ'; instruction = 'MADL LD A,(0xD0059F)'; }
        else if (prev1 === 0x32) { type = 'WRITE'; instruction = 'MADL LD (0xD0059F),A'; }
        else if (prev1 === 0x2a) { type = 'READ'; instruction = 'MADL LD HL,(0xD0059F)'; }
        else if (prev1 === 0x22) { type = 'WRITE'; instruction = 'MADL LD (0xD0059F),HL'; }
        else if (prev1 === 0x21) { type = 'POINTER'; instruction = 'MADL LD HL,0xD0059F'; }
        instrAddr = i - 2;
      }
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

// ─── Part B: IY offset check for D0059F ───

function checkIyOffset() {
  const offset = D0059F_ADDR - IY_ADDR;
  return {
    d0059f: hex(D0059F_ADDR),
    iyBase: hex(IY_ADDR),
    offset: hex(offset),
    offsetDecimal: offset,
    fitsInSignedByte: offset >= -128 && offset <= 127,
    conclusion: offset > 127
      ? `Offset ${offset} (${hex(offset)}) exceeds signed byte range [-128, 127]. IY+d access is IMPOSSIBLE.`
      : `Offset ${offset} fits in signed byte. IY+d access is possible via (IY+${offset}).`,
  };
}

// ─── Part C: Context around write/pointer sites ───

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

  // Check what value is being written: look for LD A,imm before a write
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

// ─── Part D: Dynamic boot trace with write watchpoint ───

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
    if (error?.message === '__PHASE225_STOP__' && error.stopName === 'mem_init_return') {
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

function dynamicBootTraceWithWatchpoint() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  const writeEvents = [];
  let totalSteps = 0;
  let prevValue = mem[D0059F_ADDR] & 0xff;

  function checkD0059F(phaseName, pc, step) {
    const currentValue = mem[D0059F_ADDR] & 0xff;
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
      checkD0059F('boot', pc, step ?? 0);
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
      checkD0059F('kernelInit', pc, step ?? 0);
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
      checkD0059F('postInit', pc, step ?? 0);
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
        checkD0059F('memInit', pc, step ?? 0);
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
    });
    totalSteps += memInit.steps ?? 0;
  } catch (error) {
    if (error?.message === '__PHASE225_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  const valueAfterBoot = mem[D0059F_ADDR] & 0xff;

  return {
    totalSteps,
    memInitReturned,
    valueAfterBoot: hexByte(valueAfterBoot),
    writeEvents,
    writeEventCount: writeEvents.length,
  };
}

// ─── Part E: Event loop trace with write watchpoint ───

function eventLoopTraceWithWatchpoint() {
  // First do a full boot to get to a good state
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  // Cold boot
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = DEFAULT_STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
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

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  // memInit
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

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
    });
  } catch (error) {
    if (!(error?.message === '__PHASE225_STOP__' && error.stopName === 'mem_init_return')) {
      throw error;
    }
  }

  const valueBeforeEventLoop = mem[D0059F_ADDR] & 0xff;

  // Now run the event loop with a watchpoint
  const writeEvents = [];
  let prevValue = valueBeforeEventLoop;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.sp = DEFAULT_STACK_TOP;

  let eventLoopResult = null;
  try {
    eventLoopResult = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: EVENT_LOOP_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        const currentValue = mem[D0059F_ADDR] & 0xff;
        if (currentValue !== prevValue) {
          writeEvents.push({
            step: step ?? 0,
            pc: hex(pc),
            oldValue: hexByte(prevValue),
            newValue: hexByte(currentValue),
          });
          prevValue = currentValue;
        }
      },
    });
  } catch (error) {
    eventLoopResult = { error: error?.message ?? String(error) };
  }

  const valueAfterEventLoop = mem[D0059F_ADDR] & 0xff;

  return {
    valueBeforeEventLoop: hexByte(valueBeforeEventLoop),
    valueAfterEventLoop: hexByte(valueAfterEventLoop),
    eventLoopSteps: eventLoopResult?.steps ?? null,
    eventLoopTermination: eventLoopResult?.termination ?? eventLoopResult?.error ?? null,
    writeEvents,
    writeEventCount: writeEvents.length,
  };
}

// ─── Main ───

function main() {
  console.log('=== Phase 225: D0059F Writers Investigation ===');
  console.log('D0059F is the key-state variable that controls which token table ConvKeyToTok uses.');
  console.log('Magic values: 0xFA=AlphaLock, 0xFB=Alpha, 0xFC=2nd, 0xFE=Fn\n');

  // Part A: Static ROM scan
  console.log('--- Part A: Static ROM scan for 0xD0059F references ---');
  const romHits = scanRomForD0059F();
  console.log(`Found ${romHits.length} references to 0xD0059F in ROM:\n`);

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

  // Part B: IY offset check
  console.log('--- Part B: IY offset check ---');
  const iyCheck = checkIyOffset();
  console.log(`  ${iyCheck.conclusion}\n`);

  // Part C: Context around write and pointer sites
  console.log('--- Part C: Context around WRITE sites ---');
  if (writeHits.length === 0) {
    console.log('  No WRITE sites found.\n');
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
        const byteStr = ctx.bytesAround.map((b) => `${b.byte}`).join(' ');
        console.log(`    Raw bytes: ${ctx.bytesAround[0]?.addr} .. ${ctx.bytesAround[ctx.bytesAround.length - 1]?.addr}`);
        console.log(`    ${byteStr}`);
      }
    }
  }

  if (pointerHits.length > 0) {
    console.log('\n--- Part C: Context around POINTER sites (potential indirect writes) ---');
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
  console.log('');

  // Part D: Dynamic boot trace with watchpoint
  console.log('--- Part D: Dynamic boot trace with D0059F watchpoint ---');
  const bootWatch = dynamicBootTraceWithWatchpoint();
  console.log(`  Total boot steps: ${bootWatch.totalSteps}`);
  console.log(`  MemInit returned: ${bootWatch.memInitReturned}`);
  console.log(`  D0059F after boot: ${bootWatch.valueAfterBoot}`);
  console.log(`  Write events during boot: ${bootWatch.writeEventCount}`);
  if (bootWatch.writeEvents.length > 0) {
    console.log('  Boot write events:');
    for (const evt of bootWatch.writeEvents) {
      console.log(`    phase=${evt.phase}, step=${evt.step}, totalStep=${evt.totalStep}, pc=${evt.pc}, ${evt.oldValue} -> ${evt.newValue}`);
    }
  } else {
    console.log('  No writes to D0059F detected during boot sequence.');
  }
  console.log('');

  // Part E: Event loop trace
  console.log('--- Part E: Event loop trace (10000 steps from 0x082BE2) ---');
  const eventLoopWatch = eventLoopTraceWithWatchpoint();
  console.log(`  D0059F before event loop: ${eventLoopWatch.valueBeforeEventLoop}`);
  console.log(`  D0059F after event loop: ${eventLoopWatch.valueAfterEventLoop}`);
  console.log(`  Event loop steps: ${eventLoopWatch.eventLoopSteps}`);
  console.log(`  Event loop termination: ${eventLoopWatch.eventLoopTermination}`);
  console.log(`  Write events during event loop: ${eventLoopWatch.writeEventCount}`);
  if (eventLoopWatch.writeEvents.length > 0) {
    console.log('  Event loop write events:');
    for (const evt of eventLoopWatch.writeEvents) {
      console.log(`    step=${evt.step}, pc=${evt.pc}, ${evt.oldValue} -> ${evt.newValue}`);
    }
  } else {
    console.log('  No writes to D0059F detected during event loop.');
  }
  console.log('');

  console.log('=== Phase 225 Complete ===');

  // JSON summary
  const report = {
    probe: 'probe-phase225-d0059f-writers.mjs',
    generatedAt: new Date().toISOString(),
    summary: {
      targetAddress: hex(D0059F_ADDR),
      purpose: 'Key-state variable for ConvKeyToTok token table selection',
      magicValues: { '0xFA': 'AlphaLock table', '0xFB': 'Alpha table', '0xFC': '2nd table', '0xFE': 'Fn table' },
    },
    partA: {
      totalHits: romHits.length,
      writeCount: writeHits.length,
      readCount: readHits.length,
      pointerCount: pointerHits.length,
      unknownCount: unknownHits.length,
      writes: writeHits,
      reads: readHits,
      pointers: pointerHits,
      unknowns: unknownHits,
    },
    partB: iyCheck,
    partC: {
      writeSiteContexts: writeHits.map((hit) => {
        const addrNum = parseInt(hit.instrAddr.replace('0x', ''), 16);
        return disassembleContext(addrNum);
      }),
      pointerSiteContexts: pointerHits.map((hit) => {
        const addrNum = parseInt(hit.instrAddr.replace('0x', ''), 16);
        return disassembleContext(addrNum);
      }),
    },
    partD: {
      bootValue: bootWatch.valueAfterBoot,
      bootWriteEvents: bootWatch.writeEvents,
    },
    partE: {
      eventLoopBefore: eventLoopWatch.valueBeforeEventLoop,
      eventLoopAfter: eventLoopWatch.valueAfterEventLoop,
      eventLoopWriteEvents: eventLoopWatch.writeEvents,
    },
  };

  console.log('\n--- JSON Report ---');
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase225-d0059f-writers.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
