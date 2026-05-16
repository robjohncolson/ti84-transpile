#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MEM_SIZE = 0x1000000;
const TRACE_START_PC = 0x000658;
const TRACE_START_MODE = 'adl';
const TRACE_BLOCK_LIMIT = 2000;
const STATIC_START = 0x000658;
const STATIC_END = 0x000750;

const WATCH_TARGETS = [
  { pc: 0x000038, label: 'rst 0x38 vector' },
  { pc: 0x0006F3, label: 'rst 0x38 handler target' },
  { pc: 0x0019B5, label: 'halt loop' },
];

const ALT_ADL_BLOCK_KEYS = [
  '0006f3:adl',
  '000704:adl',
  '000710:adl',
];

const IO_TAGS = new Set(['in0', 'out0', 'in-reg', 'out-reg', 'in-imm', 'out-imm']);
const OUT_TAGS = new Set(['out0', 'out-reg', 'out-imm']);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function formatDisp(displacement) {
  const value = Number(displacement ?? 0);
  if (value === 0) {
    return '+0';
  }
  return value > 0 ? `+${value}` : `${value}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatDecodedInstruction(inst) {
  if (!inst) {
    return 'db ?';
  }

  switch (inst.tag) {
    case 'alu-reg':
      return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-imm':
      return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'bit-test':
      return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-set':
      return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-res':
      return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'call':
      return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'di':
      return withPrefix(inst, 'di');
    case 'im':
      return withPrefix(inst, `im ${inst.value}`);
    case 'in0':
      return withPrefix(inst, `in0 ${inst.reg}, (${hexByte(inst.port)})`);
    case 'in-reg':
      return withPrefix(inst, `in ${inst.reg}, (c)`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'jp':
      return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-a-mb':
      return withPrefix(inst, 'ld a, mb');
    case 'ld-ind-reg':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.pair}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.src}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(
        inst,
        inst.direction === 'to-mem'
          ? `ld (${hex(inst.addr, 4)}), ${inst.pair}`
          : `ld ${inst.pair}, (${hex(inst.addr, 4)})`,
      );
    case 'ld-reg-imm':
      return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'nop':
      return withPrefix(inst, 'nop');
    case 'out0':
      return withPrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);
    case 'out-imm':
      return withPrefix(inst, `out (${hexByte(inst.port)}), ${inst.reg}`);
    case 'out-reg':
      return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'push':
      return withPrefix(inst, `push ${inst.pair}`);
    case 'ret-conditional':
      return withPrefix(inst, `ret ${inst.condition}`);
    case 'rra':
      return withPrefix(inst, 'rra');
    case 'rsmix':
      return withPrefix(inst, 'rsmix');
    case 'rst':
      return withPrefix(inst, `rst ${hexByte(inst.target)}`);
    default: {
      const extras = [];
      for (const [key, value] of Object.entries(inst)) {
        if (
          key === 'pc' ||
          key === 'length' ||
          key === 'nextPc' ||
          key === 'tag' ||
          key === 'mode' ||
          key === 'modePrefix' ||
          key === 'target' ||
          key === 'fallthrough' ||
          key === 'terminates' ||
          key === 'kind' ||
          key === 'nextMode' ||
          value === null ||
          value === undefined
        ) {
          continue;
        }
        extras.push(`${key}=${value}`);
      }
      return withPrefix(inst, `${inst.tag}${extras.length ? ` ${extras.join(' ')}` : ''}`);
    }
  }
}

function bytesToHex(romBytes, start, length) {
  return Array.from(
    romBytes.subarray(start, Math.min(romBytes.length, start + Math.max(length, 0))),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function printHexDump(romBytes, start, endExclusive, bytesPerLine = 16) {
  console.log(`Hex dump ${hex(start)}..${hex(endExclusive - 1)}`);
  console.log('--------------------------------');
  for (let addr = start; addr < endExclusive; addr += bytesPerLine) {
    const length = Math.min(bytesPerLine, endExclusive - addr);
    console.log(`${hex(addr)}: ${bytesToHex(romBytes, addr, length)}`);
  }
}

function decodeLinearRegion(romBytes, start, endExclusive, startMode) {
  const rows = [];
  let pc = start;
  let mode = startMode;

  while (pc < endExclusive) {
    let inst = null;
    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      inst = null;
    }

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      rows.push({
        pc,
        mode,
        length: 1,
        bytes: bytesToHex(romBytes, pc, 1),
        text: `db ${hexByte(romBytes[pc] ?? 0)}`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      mode,
      length: inst.length,
      bytes: bytesToHex(romBytes, pc, inst.length),
      text: formatDecodedInstruction(inst),
    });

    pc += inst.length;
    if (inst.nextMode) {
      mode = inst.nextMode;
    }
  }

  return rows;
}

function printLinearDecode(romBytes, start, endExclusive, startMode) {
  const rows = decodeLinearRegion(romBytes, start, endExclusive, startMode);
  console.log('');
  console.log(`Linear decode from ${hex(start)}:${startMode}`);
  console.log('--------------------------------');
  for (const row of rows) {
    console.log(`${hex(row.pc)}:${row.mode.padEnd(3)} ${row.bytes.padEnd(17)} ${row.text}`);
  }
}

function printAltAdlBlocks(blockMeta, keys) {
  console.log('');
  console.log('ADL re-entry blocks inside the same ROM window');
  console.log('---------------------------------------------');

  let printed = 0;
  for (const key of keys) {
    const block = blockMeta[key];
    if (!block) {
      continue;
    }

    printed++;
    console.log(`${key}`);
    for (const inst of block.instructions ?? []) {
      console.log(`  ${hex(inst.pc)}:${(inst.mode ?? 'adl').padEnd(3)} ${String(inst.bytes ?? '').padEnd(17)} ${inst.dasm ?? inst.tag}`);
    }
  }

  if (!printed) {
    console.log('No alternate ADL re-entry blocks were found in the requested window.');
  }
}

function installIoTracer(peripherals, cpu) {
  const events = [];
  const originalRead = peripherals.read.bind(peripherals);
  const originalWrite = peripherals.write.bind(peripherals);

  peripherals.read = (port) => {
    const value = originalRead(port);
    events.push({
      direction: 'read',
      port: port & 0xFFFF,
      value: value & 0xFF,
      blockPc: cpu._currentBlockPc >>> 0,
    });
    return value;
  };

  peripherals.write = (port, value) => {
    events.push({
      direction: 'write',
      port: port & 0xFFFF,
      value: value & 0xFF,
      blockPc: cpu._currentBlockPc >>> 0,
    });
    return originalWrite(port, value);
  };

  return events;
}

function resolveNextMode(meta, result, cpu, currentMode) {
  if (meta?.exits) {
    for (const exit of meta.exits) {
      if (exit.target === result && exit.targetMode) {
        return exit.targetMode;
      }
    }
  }
  return cpu.madl ? 'adl' : currentMode;
}

function annotateIoEvents(instructions, ioEvents) {
  const ioInstructions = (instructions ?? []).filter((inst) => IO_TAGS.has(inst.tag));
  return ioEvents.map((event, index) => {
    const inst = ioInstructions[index] ?? null;
    return {
      ...event,
      instPc: inst?.pc ?? null,
      instTag: inst?.tag ?? null,
      instDasm: inst?.dasm ?? null,
    };
  });
}

function formatIoEvent(event) {
  const arrow = event.direction === 'write' ? '<=' : '=>';
  const prefix = event.instDasm
    ? `${hex(event.instPc)} ${event.instDasm}`
    : event.direction === 'write' ? 'out ?' : 'in ?';
  return `${prefix} [${hex(event.port, 4)} ${arrow} ${hexByte(event.value)}]`;
}

function formatIoList(events) {
  return events.length ? events.map(formatIoEvent).join('; ') : '-';
}

function formatPredecessor(block) {
  if (!block) {
    return 'entry point';
  }
  return (
    `${hex(block.pc)}:${block.mode} via ` +
    `${hex(block.tailPc)} ${block.tailDasm} -> ${hex(block.nextPc)}:${block.nextMode}`
  );
}

function traceBoot(executor, ioLog) {
  const { cpu, compiledBlocks, blockMeta } = executor;

  let pc = TRACE_START_PC;
  let mode = TRACE_START_MODE;
  let steps = 0;
  let termination = 'block_limit';
  let error = null;
  let previousBlock = null;
  let missingBlock = null;

  const blocks = [];
  const targetHits = new Map(WATCH_TARGETS.map((target) => [target.pc, []]));
  const uniqueBlocks = new Set();

  while (steps < TRACE_BLOCK_LIMIT) {
    const key = blockKey(pc, mode);
    const meta = blockMeta[key];
    const fn = compiledBlocks[key];

    if (!fn) {
      termination = 'missing_block';
      missingBlock = {
        pc,
        mode,
        expectedStep: steps + 1,
        predecessor: previousBlock,
      };
      break;
    }

    if (targetHits.has(pc)) {
      targetHits.get(pc).push({
        step: steps + 1,
        pc,
        mode,
        predecessor: previousBlock,
      });
    }

    cpu.pc = pc;
    cpu.madl = mode === 'adl' ? 1 : 0;
    cpu._currentBlockPc = pc;

    uniqueBlocks.add(key);

    const ioStart = ioLog.length;
    let result = null;

    try {
      result = fn(cpu);
    } catch (err) {
      termination = 'error';
      error = err;
      break;
    }

    const ioEvents = annotateIoEvents(meta?.instructions ?? [], ioLog.slice(ioStart));
    const nextPc = typeof result === 'number' && result >= 0 ? (result & 0xFFFFFF) : null;
    const nextMode = nextPc === null ? mode : resolveNextMode(meta, result, cpu, mode);
    const instructions = meta?.instructions ?? [];
    const tail = instructions.length ? instructions[instructions.length - 1] : null;

    const block = {
      step: steps + 1,
      pc,
      mode,
      tailPc: tail?.pc ?? pc,
      tailDasm: tail?.dasm ?? '(no instructions)',
      nextPc,
      nextMode,
      ioEvents,
      outEvents: ioEvents.filter((event) => event.direction === 'write'),
      in0Out0Events: ioEvents.filter((event) => event.instTag === 'in0' || event.instTag === 'out0'),
    };

    blocks.push(block);
    previousBlock = block;
    steps++;

    if (result === undefined || result === null) {
      termination = 'no_return';
      break;
    }

    if (result < 0) {
      if (result === -1) {
        termination = pc === 0x0019B5 ? 'halt_0019b5' : 'halt';
      } else {
        termination = 'sleep';
      }
      break;
    }

    pc = nextPc;
    mode = nextMode;
  }

  return {
    blocks,
    targetHits,
    termination,
    error,
    missingBlock,
    uniqueBlocks: uniqueBlocks.size,
    finalNextPc: pc,
    finalNextMode: mode,
  };
}

function printTargetSummary(trace) {
  console.log('Special targets');
  console.log('---------------');
  for (const target of WATCH_TARGETS) {
    const hits = trace.targetHits.get(target.pc) ?? [];
    if (hits.length === 0) {
      console.log(`${hex(target.pc)} ${target.label}: not reached`);
      continue;
    }

    const first = hits[0];
    console.log(
      `${hex(target.pc)} ${target.label}: first reached at block #${formatCount(first.step)} ` +
      `as ${hex(first.pc)}:${first.mode}`,
    );
    console.log(`  predecessor: ${formatPredecessor(first.predecessor)}`);
  }

  if (trace.missingBlock) {
    console.log(
      `${hex(trace.missingBlock.pc)} missing block: stop before block #${formatCount(trace.missingBlock.expectedStep)} ` +
      `as ${hex(trace.missingBlock.pc)}:${trace.missingBlock.mode}`,
    );
    console.log(`  predecessor: ${formatPredecessor(trace.missingBlock.predecessor)}`);
  }
}

function printBlockTrace(trace) {
  console.log('');
  console.log('Dynamic block trace');
  console.log('-------------------');
  for (const block of trace.blocks) {
    const edge = block.nextPc === null ? trace.termination : `${hex(block.nextPc)}:${block.nextMode}`;
    console.log(
      `[${String(block.step).padStart(4, '0')}] ` +
      `${hex(block.pc)}:${block.mode} -> ${edge} ` +
      `tail=${hex(block.tailPc)} ${block.tailDasm}`,
    );
    console.log(`  outs: ${formatIoList(block.outEvents)}`);
    console.log(`  io:   ${formatIoList(block.ioEvents)}`);
  }
}

function printIn0Out0Events(trace) {
  console.log('');
  console.log('Peripheral-bus IN0/OUT0 events');
  console.log('------------------------------');
  const events = trace.blocks.flatMap((block) =>
    block.in0Out0Events.map((event) => ({
      step: block.step,
      pc: block.pc,
      mode: block.mode,
      ...event,
    })),
  );

  if (events.length === 0) {
    console.log('No IN0/OUT0 events were observed.');
    return;
  }

  for (const event of events) {
    console.log(
      `[${String(event.step).padStart(4, '0')}] ${hex(event.pc)}:${event.mode} ` +
      `${formatIoEvent(event)}`,
    );
  }
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const memory = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, memory, { peripherals });
const ioLog = installIoTracer(peripherals, executor.cpu);
const trace = traceBoot(executor, ioLog);

console.log('Phase 344: boot entry full trace');
console.log('================================');
console.log(`ROM:               ${ROM_PATH}`);
console.log(`Boot entry:        ${hex(TRACE_START_PC)}:${TRACE_START_MODE}`);
console.log(`Block limit:       ${formatCount(TRACE_BLOCK_LIMIT)}`);
console.log('Timer interrupt:   disabled');
console.log(`Termination:       ${trace.termination}`);
console.log(`Blocks executed:   ${formatCount(trace.blocks.length)}`);
console.log(`Unique blocks:     ${formatCount(trace.uniqueBlocks)}`);
console.log(`Final next PC:     ${hex(trace.finalNextPc)}:${trace.finalNextMode}`);

if (trace.error) {
  console.log(`Error:             ${trace.error?.message ?? String(trace.error)}`);
}

console.log('');
printTargetSummary(trace);
printBlockTrace(trace);
printIn0Out0Events(trace);

console.log('');
printHexDump(romBytes, STATIC_START, STATIC_END);
printLinearDecode(romBytes, STATIC_START, STATIC_END, TRACE_START_MODE);
printAltAdlBlocks(executor.blockMeta, ALT_ADL_BLOCK_KEYS);
