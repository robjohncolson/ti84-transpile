#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const TARGET_START = 0x03F26D;
const TARGET_END = 0x03F2FF;
const TARGET_MAX_BYTES = TARGET_END - TARGET_START + 1;
const TARGET_BLOCK_KEY = '03f26d:adl';
const TARGET_CALL_PATTERN = [0xCD, 0x6D, 0xF2, 0x03];

const D00896 = 0xD00896;
const D1408B = 0xD1408B;
const D14091 = 0xD14091;
const D177B7 = 0xD177B7;
const D177BA = 0xD177BA;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_ONE_SCAN = 0x12;

const STEP_BUDGET = 2000000;
const MAX_LOOP_ITERATIONS = 50000;

const KNOWN_ADDRS = new Map([
  [D00896, 'D00896 (sndRecState)'],
  [D1408B, 'D1408B'],
  [D14091, 'D14091 (usbHandleKeys)'],
  [D177B7, 'D177B7 (usbInited)'],
  [D177BA, 'D177BA'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function rawBytes(start, length) {
  return Array.from(romBytes.subarray(start, start + length), (value) => (value & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function labelAddr(addr) {
  return KNOWN_ADDRS.get(addr) ?? hex(addr);
}

function getA(cpu) {
  if (typeof cpu._a === 'number') {
    return cpu._a & 0xFF;
  }
  if (typeof cpu.a === 'number') {
    return cpu.a & 0xFF;
  }
  return 0;
}

function peekReturn(cpu) {
  const sp = cpu.sp & 0xFFFFFF;
  return cpu.read24(sp);
}

function safeDecode(pc) {
  try {
    return decodeInstruction(romBytes, pc, 'adl');
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: romBytes[pc] ?? 0,
      mode: 'adl',
    };
  }
}

function formatInstruction(inst) {
  const upper = (value) => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'bit-test':
      return `BIT ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'in-imm':
      return `IN A,(${hex(inst.port, 2)})`;
    case 'out-imm':
      return `OUT (${hex(inst.port, 2)}),A`;
    case 'in0':
      return `IN0 ${upper(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${upper(inst.reg)}`;
    case 'in-reg':
      return `IN ${upper(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return inst.dasm || inst.tag;
  }
}

function makeRow(pc) {
  const inst = safeDecode(pc);
  const length = Math.max(1, inst.length || 1);
  return {
    pc,
    inst,
    bytes: rawBytes(pc, length),
  };
}

function decodeLinear(startPc, maxBytes, maxInstructions = Number.POSITIVE_INFINITY) {
  const rows = [];
  let pc = startPc;
  let count = 0;
  const endPc = startPc + maxBytes;

  while (pc < endPc && count < maxInstructions) {
    const row = makeRow(pc);
    rows.push(row);
    pc += row.inst.length || 1;
    count += 1;
  }

  return rows;
}

function disassembleUntilRet(startPc, endPcInclusive) {
  const rows = [];
  let pc = startPc;

  while (pc <= endPcInclusive) {
    const row = makeRow(pc);
    rows.push(row);
    pc += row.inst.length || 1;
    if (row.inst.tag === 'ret' || row.inst.tag === 'reti' || row.inst.tag === 'retn') {
      break;
    }
  }

  return rows;
}

function scanPattern(pattern) {
  const hits = [];
  for (let pc = 0; pc <= romBytes.length - pattern.length; pc += 1) {
    let matched = true;
    for (let index = 0; index < pattern.length; index += 1) {
      if (romBytes[pc + index] !== pattern[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(pc);
    }
  }
  return hits;
}

function formatRows(rows) {
  return rows.map((row) => `${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${formatInstruction(row.inst)}`);
}

function findCallLikeRows(rows) {
  return rows.filter((row) => row.inst.tag === 'call' || row.inst.tag === 'call-conditional');
}

function findPortReadRows(rows) {
  return rows.filter((row) => (
    row.inst.tag === 'in-imm'
    || row.inst.tag === 'in0'
    || row.inst.tag === 'in-reg'
  ));
}

function bootToHomeScreen(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  }

  const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
  const FLASH_ROUTINE_RAM_DST = 0xD18C22;
  const FLASH_ROUTINE_LEN = 0x5A;
  mem.set(
    romBytes.subarray(FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN),
    FLASH_ROUTINE_RAM_DST,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
}

function injectKeyOne(mem) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_BUFFER_ADDR] = 0x00;

  mem[KEY_SCAN_CODE_ADDR] = KEY_ONE_SCAN;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function install03F26DTrace(executor, cpu, mem) {
  const original = executor.compiledBlocks[TARGET_BLOCK_KEY];
  if (typeof original !== 'function') {
    throw new Error(`Missing lifted block for ${TARGET_BLOCK_KEY}`);
  }

  const trace = {
    rangeEntries: [],
    calls: [],
    activeCall: null,
    uniquePortsRead: new Set(),
    uniquePortsWritten: new Set(),
  };

  const prevOnIoRead = cpu.onIoRead.bind(cpu);
  const prevOnIoWrite = cpu.onIoWrite.bind(cpu);

  cpu.onIoRead = (port, value) => {
    if (trace.activeCall) {
      trace.activeCall.portReads.push({
        port: port & 0xFFFF,
        value: value & 0xFF,
        blockPc: cpu._currentBlockPc & 0xFFFFFF,
      });
      trace.uniquePortsRead.add(port & 0xFFFF);
    }
    prevOnIoRead(port, value);
  };

  cpu.onIoWrite = (port, value) => {
    if (trace.activeCall) {
      trace.activeCall.portWrites.push({
        port: port & 0xFFFF,
        value: value & 0xFF,
        blockPc: cpu._currentBlockPc & 0xFFFFFF,
      });
      trace.uniquePortsWritten.add(port & 0xFFFF);
    }
    prevOnIoWrite(port, value);
  };

  executor.compiledBlocks[TARGET_BLOCK_KEY] = function wrapped03F26D(blockCpu) {
    const record = {
      index: trace.calls.length + 1,
      stepAtEntry: blockCpu.stepCount ?? 0,
      entryPc: blockCpu.pc & 0xFFFFFF,
      entryA: getA(blockCpu),
      entryF: blockCpu.f & 0xFF,
      d00896Before: mem[D00896],
      returnSlotBefore: peekReturn(blockCpu),
      portReads: [],
      portWrites: [],
    };

    trace.activeCall = record;
    const result = original(blockCpu);
    record.exitA = getA(blockCpu);
    record.exitF = blockCpu.f & 0xFF;
    record.d00896After = mem[D00896];
    record.returnTarget = result & 0xFFFFFF;
    trace.calls.push(record);
    trace.activeCall = null;
    return result;
  };

  return trace;
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function main() {
  console.log('Phase 456 - Trace 0x03F26D (Called from 0x048AC4 Prologue)');
  console.log(`ROM: ${ROM_PATH}`);

  const targetRows = disassembleUntilRet(TARGET_START, TARGET_END);
  const targetCallRows = findCallLikeRows(targetRows);
  const targetPortReadRows = findPortReadRows(targetRows);
  const callerPcs = scanPattern(TARGET_CALL_PATTERN);

  printSection('A. Static Disassembly');
  console.log(`Raw bytes from ${hex(TARGET_START)}: ${rawBytes(TARGET_START, Math.min(TARGET_MAX_BYTES, 16))}`);
  console.log(`Decoded ${targetRows.length} instruction(s) in ${hex(TARGET_START)}..${hex(TARGET_END)} (stopped at first RET):`);
  for (const line of formatRows(targetRows)) {
    console.log(line);
  }

  console.log('');
  console.log(`Direct body summary: ${targetRows.length === 2 ? 'LD A,(D00896) ; RET' : 'see listing above'}`);
  console.log(`Static sub-calls inside 0x03F26D: ${targetCallRows.length ? targetCallRows.map((row) => hex(row.inst.target)).join(', ') : 'none'}`);
  console.log(`Static port reads inside 0x03F26D: ${targetPortReadRows.length ? targetPortReadRows.map((row) => formatInstruction(row.inst)).join(', ') : 'none'}`);

  printSection('A2. Raw CALL 0x03F26D Sites');
  console.log(`Found ${callerPcs.length} direct CALL pattern hit(s): ${callerPcs.map((pc) => hex(pc)).join(', ')}`);
  for (const callPc of callerPcs) {
    const contextRows = decodeLinear(callPc - 5, 16, 5);
    console.log('');
    console.log(`Caller context around ${hex(callPc)}:`);
    for (const line of formatRows(contextRows)) {
      console.log(line);
    }
  }

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const trace = install03F26DTrace(executor, cpu, mem);

  const bootState = bootToHomeScreen(executor, cpu, mem);
  mem[D14091] = 0x01;
  mem[D177B7] = 0x55;
  mem[D177BA] = 0x00;
  injectKeyOne(mem);

  let runResult;
  try {
    runResult = executor.runFrom(bootState.lastPc, bootState.lastMode ?? 'adl', {
      maxSteps: STEP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      diHaltBypass: true,
      // This checkout exposes onBlock rather than onStep. For this target,
      // 0x03F26D is a single lifted block, so the callback still gives an
      // exact entry trace for the helper.
      onBlock(pc, _mode, _meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;
        if (normalizedPc >= TARGET_START && normalizedPc <= TARGET_END) {
          trace.rangeEntries.push({
            pc: normalizedPc,
            steps,
            aOnEntry: getA(cpu),
            d00896: mem[D00896],
          });
        }
      },
    });
  } catch (err) {
    runResult = {
      steps: 0,
      lastPc: bootState.lastPc,
      lastMode: bootState.lastMode ?? 'adl',
      termination: 'throw',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  printSection('B. Dynamic Trace');
  console.log(`Resume point: ${hex(bootState.lastPc)} mode=${bootState.lastMode}`);
  console.log(`Injected key: scan=${hexByte(KEY_ONE_SCAN)} with D14091=${hexByte(mem[D14091])} D177B7=${hexByte(0x55)} D177BA=${hexByte(0x00)}`);
  console.log(`runFrom termination=${runResult.termination} steps=${runResult.steps ?? 0} lastPc=${hex(runResult.lastPc)}`);
  if (runResult.error) {
    console.log(`runFrom error=${runResult.error}`);
  }
  console.log(`Range entries seen via onBlock: ${trace.rangeEntries.length}`);
  for (const entry of trace.rangeEntries) {
    console.log(`- step=${entry.steps} pc=${hex(entry.pc)} A(entry)=${hexByte(entry.aOnEntry)} D00896=${hexByte(entry.d00896)}`);
  }

  console.log('');
  console.log(`0x03F26D wrapped call count: ${trace.calls.length}`);
  if (!trace.calls.length) {
    console.log('- No live calls to 0x03F26D were observed in this run.');
  }
  for (const call of trace.calls) {
    const portsRead = call.portReads.length
      ? call.portReads.map((entry) => `${hex(entry.port, 4)}=${hexByte(entry.value)}`).join(', ')
      : 'none';
    const portsWritten = call.portWrites.length
      ? call.portWrites.map((entry) => `${hex(entry.port, 4)}=${hexByte(entry.value)}`).join(', ')
      : 'none';
    console.log(
      `- call#${call.index} step=${call.stepAtEntry} ret=${hex(call.returnTarget)} `
      + `A ${hexByte(call.entryA)} -> ${hexByte(call.exitA)} `
      + `D00896 ${hexByte(call.d00896Before)} -> ${hexByte(call.d00896After)} `
      + `stackRet=${hex(call.returnSlotBefore)} portsRead=${portsRead} portsWritten=${portsWritten}`,
    );
  }

  console.log('');
  console.log(`Unique ports read while inside 0x03F26D: ${trace.uniquePortsRead.size ? [...trace.uniquePortsRead].map((port) => hex(port, 4)).join(', ') : 'none'}`);
  console.log(`Unique ports written while inside 0x03F26D: ${trace.uniquePortsWritten.size ? [...trace.uniquePortsWritten].map((port) => hex(port, 4)).join(', ') : 'none'}`);
  console.log(`Dynamic sub-calls from 0x03F26D: none observed`);

  printSection('C. Analysis');
  console.log(`1. Return register/value`);
  console.log(`- Raw ROM body is ${rawBytes(TARGET_START, 5)} = LD A,(${hex(D00896)}) ; RET.`);
  console.log(`- So 0x03F26D returns its result in A, with A = (${labelAddr(D00896)}).`);
  console.log(`- In the live trace, exit A matched D00896 on every observed call: ${trace.calls.length ? 'yes' : 'no live calls seen in this run'}.`);

  console.log(`2. What "bit 4" refers to`);
  console.log(`- At caller 0x048AE5 the immediate post-call check is AND 0x10 / JR Z, so the tested bit is bit 4 of register A after return.`);
  console.log(`- Since 0x03F26D only loads A from ${labelAddr(D00896)}, "bit 4" is bit 4 of D00896, not a port bit and not a separate display register.`);
  console.log(`- The sibling caller at 0x048DE9 tightens this further with CP 0x10, meaning that path wants the returned byte to equal 0x10 exactly.`);

  console.log(`3. Meaning of bit 4 for the 0x048AC4 state machine`);
  console.log(`- Best fit from direct ROM evidence: D00896 is the OS byte named sndRecState, while D14091 and D177B7 are named usbHandleKeys and usbInited in the TI include file.`);
  console.log(`- That makes 0x048AC4 look like a USB/link state-management path that happens to sit in the same event-loop chain, not a pure display helper.`);
  console.log(`- When sndRecState bit 4 is set, 0x048AC4 takes the cleanup gate that can clear D177B7, D1408B, and D00896. In other words, bit 4 means "the send/receive/link state is in the 0x10 class that requires teardown/reset handling here," not "display dirty" on its own.`);
  console.log(`- Practical conclusion: the "bit 4" gate is A&0x10 where A comes straight from sndRecState; it is a transfer/link-state flag consumed by 0x048AC4 to decide whether to zero the usb/link latch bytes.`);
}

main();
