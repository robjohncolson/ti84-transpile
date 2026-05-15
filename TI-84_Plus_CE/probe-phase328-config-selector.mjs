#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const rom = fs.readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const FUNC_START = 0x055316;
const GUARD_FUNC = 0x055191;
const GUARD_FAST_RET = 0x05519E;
const TABLE_BASE = 0x0525D4;
const TABLE_STRIDE = 12;
const TABLE_SELECTOR_LIMIT = 2;
const DESCRIPTOR_PTR_RAM = 0xD005E9;
const GUARD_FLAG_ADDR = 0xD000C6;
const CALLER_CONTINUATION = 0x0551B1;
const STACK_BASE = 0xD1A800;
const RETURN_SENTINEL = 0xFFFFFE;
const INITIAL_IX = 0x123456;
const FUNCTION_WINDOW_END = 0x055345;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function write24(buffer, addr, value) {
  buffer[addr] = value & 0xFF;
  buffer[addr + 1] = (value >> 8) & 0xFF;
  buffer[addr + 2] = (value >> 16) & 0xFF;
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister ?? '').toUpperCase()}${formatDisp(displacement)})`;
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function isConditionalBranch(inst) {
  return ['jr-conditional', 'jp-conditional', 'ret-conditional', 'djnz'].includes(inst.tag);
}

function isUnconditionalBranch(inst) {
  return ['jr', 'jp', 'jp-indirect'].includes(inst.tag);
}

function isReturn(inst) {
  return ['ret', 'reti', 'retn', 'ret-conditional'].includes(inst.tag);
}

function isRomAddress(value) {
  return Number.isInteger(value) && value >= 0x1000 && value < 0x400000;
}

function isRamAddress(value) {
  return Number.isInteger(value) && value >= 0xD00000 && value < 0xE00000;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode error)';
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'push':
      return `${prefix}PUSH ${String(inst.pair ?? inst.reg ?? inst.src).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair ?? inst.reg ?? inst.dest).toUpperCase()}`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg ?? inst.pair).toUpperCase()}`;
    case 'nop':
      return `${prefix}NOP`;
    default: {
      let text = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) {
        text += ` ${hex(inst.target)}`;
      }
      if (inst.value !== undefined) {
        text += ` ${hex(inst.value)}`;
      }
      return text;
    }
  }
}

function formatBytesFor(inst) {
  return bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length));
}

function collectFunctionGraph(start, endInclusive) {
  const queue = [start];
  const queued = new Set(queue);
  const instructions = new Map();
  const blockStarts = new Set([start]);
  const externalCalls = [];

  while (queue.length > 0) {
    const blockStart = queue.shift();
    let pc = blockStart;

    while (pc >= start && pc <= endInclusive) {
      if (instructions.has(pc) && pc !== blockStart) {
        break;
      }

      const inst = decodeSafe(pc);
      if (!inst || !inst.length) {
        break;
      }
      instructions.set(pc, inst);

      const fallthrough = nextPc(inst);

      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        externalCalls.push({
          from: inst.pc,
          target: inst.target,
          kind: inst.tag,
          returnPc: fallthrough,
        });
        if (fallthrough <= endInclusive) {
          blockStarts.add(fallthrough);
          if (!queued.has(fallthrough)) {
            queue.push(fallthrough);
            queued.add(fallthrough);
          }
        }
        break;
      }

      if (isConditionalBranch(inst)) {
        if (inst.target !== undefined && inst.target >= start && inst.target <= endInclusive) {
          blockStarts.add(inst.target);
          if (!queued.has(inst.target)) {
            queue.push(inst.target);
            queued.add(inst.target);
          }
        }
        if (fallthrough <= endInclusive) {
          blockStarts.add(fallthrough);
          if (!queued.has(fallthrough)) {
            queue.push(fallthrough);
            queued.add(fallthrough);
          }
        }
        break;
      }

      if (isUnconditionalBranch(inst)) {
        if (inst.target !== undefined && inst.target >= start && inst.target <= endInclusive) {
          blockStarts.add(inst.target);
          if (!queued.has(inst.target)) {
            queue.push(inst.target);
            queued.add(inst.target);
          }
        }
        break;
      }

      if (isReturn(inst)) {
        break;
      }

      if (fallthrough > endInclusive) {
        break;
      }
      pc = fallthrough;
    }
  }

  return {
    start,
    endInclusive,
    instructions,
    blockStarts: [...blockStarts].sort((a, b) => a - b),
    externalCalls,
  };
}

function buildBasicBlocks(graph) {
  const blockStartSet = new Set(graph.blockStarts);
  const blocks = [];

  for (const start of graph.blockStarts) {
    const insts = [];
    let pc = start;

    while (graph.instructions.has(pc)) {
      const inst = graph.instructions.get(pc);
      insts.push(inst);

      const fallthrough = nextPc(inst);
      const terminates =
        inst.tag === 'call' ||
        inst.tag === 'call-conditional' ||
        isConditionalBranch(inst) ||
        isUnconditionalBranch(inst) ||
        isReturn(inst);

      if (terminates) {
        break;
      }
      if (blockStartSet.has(fallthrough)) {
        break;
      }
      pc = fallthrough;
    }

    if (!insts.length) {
      continue;
    }

    const last = insts.at(-1);
    const fallthrough = nextPc(last);
    const successors = [];

    if (last.tag === 'call' || last.tag === 'call-conditional') {
      if (graph.instructions.has(fallthrough)) {
        successors.push({ type: 'fallthrough', target: fallthrough });
      }
    } else if (isConditionalBranch(last)) {
      if (last.target !== undefined && graph.instructions.has(last.target)) {
        successors.push({ type: 'branch', target: last.target });
      }
      if (graph.instructions.has(fallthrough)) {
        successors.push({ type: 'fallthrough', target: fallthrough });
      }
    } else if (isUnconditionalBranch(last)) {
      if (last.target !== undefined && graph.instructions.has(last.target)) {
        successors.push({ type: 'branch', target: last.target });
      }
    } else if (!isReturn(last) && graph.instructions.has(fallthrough)) {
      successors.push({ type: 'fallthrough', target: fallthrough });
    }

    blocks.push({
      start,
      end: last.pc,
      insts,
      successors,
    });
  }

  return blocks;
}

function explainBlock(block) {
  switch (block.start) {
    case 0x055316:
      return 'Prologue: save IX, turn SP into an IX frame pointer, then re-enter the 0x055191 guard.';
    case 0x055323:
      return 'Selector test: load the 24-bit stacked argument into DE and branch if the argument is greater than 2.';
    case 0x05532F:
      return 'Table path: multiply the low-byte selector by 12, add ROM base 0x0525D4, store the resulting descriptor pointer.';
    case 0x05533E:
      return 'Direct-pointer path: argument > 2, so store the caller-supplied 24-bit pointer directly into D005E9.';
    case 0x055343:
      return 'Shared epilogue: restore IX and return.';
    default:
      return '';
  }
}

function explainConditional(inst) {
  if (inst.pc === 0x05532D) {
    return 'Tests the carry produced by `HL=2; SBC HL,DE`. Carry means the stacked argument is greater than 2, so the direct-pointer path is taken.';
  }
  return '';
}

function collectRomReferences(graph) {
  const refs = [];

  for (const inst of graph.instructions.values()) {
    if (inst.tag !== 'ld-pair-imm') {
      continue;
    }
    if (!isRomAddress(inst.value)) {
      continue;
    }
    refs.push({
      pc: inst.pc,
      pair: String(inst.pair).toUpperCase(),
      value: inst.value >>> 0,
    });
  }

  return refs;
}

function collectRamWrites(graph) {
  const refs = [];
  const seen = new Set();

  for (const inst of graph.instructions.values()) {
    const addr = inst.addr;
    if (!isRamAddress(addr)) {
      continue;
    }
    if (!['ld-pair-mem', 'ld-mem-pair', 'ld-mem-reg'].includes(inst.tag)) {
      continue;
    }
    const key = `${inst.pc}:${addr}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    refs.push({
      pc: inst.pc,
      addr,
      kind: inst.tag,
    });
  }

  return refs;
}

function collectPortOps(graph) {
  return [...graph.instructions.values()].filter((inst) => {
    return ['in-reg', 'out-reg', 'in-imm', 'out-imm', 'in0', 'out0'].includes(inst.tag);
  });
}

function describeFrameLayout() {
  return [
    '(IX+0..+2)  saved caller IX from `PUSH IX`',
    '(IX+3..+5)  return address back to the caller of 0x055316',
    '(IX+6..+8)  caller-supplied 24-bit selector or direct descriptor pointer',
    'No negative IX offsets are used. No local stack slots are allocated.',
  ];
}

function tableSlots(count = 3) {
  const slots = [];
  for (let index = 0; index < count; index += 1) {
    const base = TABLE_BASE + index * TABLE_STRIDE;
    slots.push({
      index,
      base,
      raw: rom.subarray(base, base + TABLE_STRIDE),
      fields: [
        read24(rom, base),
        read24(rom, base + 3),
        read24(rom, base + 6),
        read24(rom, base + 9),
      ],
    });
  }
  return slots;
}

function printStaticSection(graph, blocks) {
  const romRefs = collectRomReferences(graph);
  const ramWrites = collectRamWrites(graph);
  const portOps = collectPortOps(graph);
  const ordered = [...graph.instructions.values()].sort((a, b) => a.pc - b.pc);

  console.log('=== Phase 328: Full Trace of 0x055316 ===\n');
  console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
  console.log(`Target function: ${hex(FUNC_START)}`);
  console.log(`Guard helper called recursively: ${hex(GUARD_FUNC)}\n`);

  console.log('1) Full static CFG / annotated disassembly\n');
  for (const block of blocks) {
    const note = explainBlock(block);
    const succ = block.successors.length
      ? block.successors.map((edge) => `${edge.type}->${hex(edge.target)}`).join(', ')
      : 'return/exit';
    console.log(`[block ${hex(block.start)}] ${note}`);
    console.log(`  successors: ${succ}`);
    for (const inst of block.insts) {
      const bytes = formatBytesFor(inst).padEnd(20);
      const text = formatInstruction(inst).padEnd(32);
      const extra = explainConditional(inst);
      console.log(`  ${hex(inst.pc)}: ${bytes} ${text}${extra ? ` ; ${extra}` : ''}`);
    }
    console.log('');
  }

  console.log('2) Direct answers\n');
  console.log(`- Instruction count: ${ordered.length}`);
  console.log(`- Basic block count: ${blocks.length}`);
  console.log('- IX frame layout:');
  for (const line of describeFrameLayout()) {
    console.log(`  ${line}`);
  }

  console.log('\n- Behavior after `CALL 0x055191` returns:');
  console.log('  Load DE from (IX+6), compare it against 2, and choose one of two paths:');
  console.log(`  * if arg <= 2: compute ${hex(TABLE_BASE)} + arg * ${TABLE_STRIDE} and store that pointer to ${hex(DESCRIPTOR_PTR_RAM)}`);
  console.log(`  * if arg > 2: store the caller-supplied 24-bit argument directly to ${hex(DESCRIPTOR_PTR_RAM)}`);
  console.log('  Then restore IX and RET. No other state setup happens inside 0x055316 itself.');

  console.log('\n- ROM table references inside 0x055316:');
  if (!romRefs.length) {
    console.log('  none');
  } else {
    for (const ref of romRefs) {
      console.log(`  ${hex(ref.pc)}: ${ref.pair} <- ${hex(ref.value)}`);
    }
  }

  console.log('\n- Candidate 12-byte slots reachable through the table path (selectors 0..2):');
  for (const slot of tableSlots()) {
    console.log(
      `  selector ${slot.index} -> base ${hex(slot.base)}  raw=${bytesToHex(slot.raw)}`
    );
    console.log(
      `    fields: ${slot.fields.map((value, fieldIndex) => `+${fieldIndex * 3}=${hex(value)}`).join('  ')}`
    );
    if (slot.index === 2) {
      console.log('    note: selector 2 lands on bytes that already decode as code, not a clean descriptor record.');
    }
  }

  console.log('\n- Static RAM writes in 0x055316:');
  if (!ramWrites.length) {
    console.log('  none');
  } else {
    for (const write of ramWrites) {
      console.log(`  ${hex(write.pc)}: ${write.kind} -> ${hex(write.addr)}`);
    }
  }

  console.log('\n- Static MMIO / port accesses in 0x055316:');
  if (!portOps.length) {
    console.log('  none');
  } else {
    for (const inst of portOps) {
      console.log(`  ${hex(inst.pc)}: ${formatInstruction(inst)}`);
    }
  }

  console.log('\n- Conditional branches:');
  const conditionalInsts = ordered.filter((inst) => isConditionalBranch(inst));
  if (!conditionalInsts.length) {
    console.log('  none');
  } else {
    for (const inst of conditionalInsts) {
      console.log(`  ${hex(inst.pc)}: ${formatInstruction(inst)}  -> ${explainConditional(inst) || 'branch condition not specialized'}`);
    }
  }

  console.log('\n- Caller continuation cross-check (outside 0x055316, starts after 0x055316 returns to 0x05519F):');
  let snippetPc = CALLER_CONTINUATION;
  for (let i = 0; i < 8; i += 1) {
    const inst = decodeSafe(snippetPc);
    if (!inst) {
      break;
    }
    const bytes = formatBytesFor(inst).padEnd(20);
    const text = formatInstruction(inst);
    console.log(`  ${hex(inst.pc)}: ${bytes} ${text}`);
    snippetPc = nextPc(inst);
  }
  console.log(`  This is where the session-327 writes to D005EC/D005F4/D005F0/D005ED and later D02FD6/D02FD9 happen; they are not part of 0x055316.\n`);
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase328-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

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
    return normalizeBlocks(rawBlocks);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

function getBlockCallEdge(startPc, cache) {
  if (cache.has(startPc)) {
    return cache.get(startPc);
  }

  let pc = startPc;
  let edge = null;

  while (pc >= 0 && pc < rom.length) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) {
      break;
    }

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      edge = {
        from: startPc,
        target: inst.target,
        returnPc: nextPc(inst),
        kind: inst.tag,
      };
      break;
    }

    if (isConditionalBranch(inst) || isUnconditionalBranch(inst) || isReturn(inst)) {
      break;
    }

    pc = nextPc(inst);
  }

  cache.set(startPc, edge);
  return edge;
}

function formatWriteEntry(entry) {
  return `${entry.kind} ${hex(entry.addr)} = ${hex(entry.value, entry.width / 4)} [${entry.region}]`;
}

function classifyWrite(addr) {
  if (addr >= (STACK_BASE - 0x40) && addr < (STACK_BASE + 0x20)) {
    return 'stack';
  }
  if (addr >= 0xE00000) {
    return 'mmio';
  }
  if (addr >= 0xD00000) {
    return 'ram';
  }
  return 'other';
}

async function runScenario(blocks, label, argValue) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, {
    peripherals,
    trackMemoryMapped: true,
  });
  const cpu = executor.cpu;

  cpu.a = 0x00;
  cpu.f = 0x00;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x000000;
  cpu.ix = INITIAL_IX;
  cpu.iy = 0x000000;
  cpu.sp = STACK_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  write24(mem, STACK_BASE, RETURN_SENTINEL);
  write24(mem, STACK_BASE + 3, argValue);
  mem[GUARD_FLAG_ADDR] |= 0x02;
  write24(mem, DESCRIPTOR_PTR_RAM, 0x00BEEF);

  const portReads = [];
  const portWrites = [];
  const mmioReads = [];
  const mmioWrites = [];
  const ramWrites = [];
  const blockTrail = [];
  const callEvents = [];
  const callEdgeCache = new Map();
  const returnStack = [];

  let currentDepth = 0;
  let maxDepth = 0;
  let lastBlockPc = null;

  cpu.onIoRead = (port, value) => {
    portReads.push({
      port: port & 0xFFFF,
      value: value & 0xFF,
      pc: cpu._currentBlockPc ?? 0,
    });
  };

  cpu.onIoWrite = (port, value) => {
    portWrites.push({
      port: port & 0xFFFF,
      value: value & 0xFF,
      pc: cpu._currentBlockPc ?? 0,
    });
  };

  cpu.onMmioRead = (addr, value) => {
    mmioReads.push({
      addr: addr & 0xFFFFFF,
      value: value & 0xFF,
      pc: cpu._currentBlockPc ?? 0,
    });
  };

  cpu.onMmioWrite = (addr, value) => {
    mmioWrites.push({
      addr: addr & 0xFFFFFF,
      value: value & 0xFF,
      pc: cpu._currentBlockPc ?? 0,
    });
  };

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordWrite(addr, value, width) {
    const normalizedAddr = addr & 0xFFFFFF;
    const region = classifyWrite(normalizedAddr);
    const entry = {
      addr: normalizedAddr,
      value: value & (width === 8 ? 0xFF : width === 16 ? 0xFFFF : 0xFFFFFF),
      width,
      kind: `write${width}`,
      region,
      pc: cpu._currentBlockPc ?? 0,
    };
    if (region === 'mmio') {
      mmioWrites.push(entry);
    } else if (region === 'stack' || region === 'ram') {
      ramWrites.push(entry);
    }
  }

  cpu.write8 = (addr, value) => {
    recordWrite(addr, value, 8);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordWrite(addr, value, 16);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordWrite(addr, value, 24);
    return origWrite24(addr, value);
  };

  const result = executor.runFrom(FUNC_START, 'adl', {
    maxSteps: 64,
    maxLoopIterations: 16,
    onBlock(pc) {
      if (returnStack.length && pc === returnStack.at(-1)) {
        const resumedPc = returnStack.pop();
        currentDepth = Math.max(0, currentDepth - 1);
        callEvents.push({
          type: 'return',
          to: resumedPc,
          depth: currentDepth,
        });
      }

      if (lastBlockPc !== null) {
        const edge = getBlockCallEdge(lastBlockPc, callEdgeCache);
        if (edge && edge.target === pc) {
          currentDepth += 1;
          maxDepth = Math.max(maxDepth, currentDepth);
          returnStack.push(edge.returnPc);
          callEvents.push({
            type: 'call',
            from: edge.from,
            to: edge.target,
            returnPc: edge.returnPc,
            depth: currentDepth,
            kind: edge.kind,
          });
        }
      }

      blockTrail.push(pc);
      lastBlockPc = pc;
    },
  });

  const logicalTermination =
    result.termination === 'missing_block' && result.lastPc === RETURN_SENTINEL
      ? 'returned_to_sentinel'
      : result.termination;

  return {
    label,
    argValue,
    logicalTermination,
    rawTermination: result.termination,
    lastPc: result.lastPc,
    steps: result.steps,
    blockTrail,
    callEvents,
    maxDepth,
    portReads,
    portWrites,
    mmioReads,
    mmioWrites,
    ramWrites,
    final: {
      sp: cpu.sp,
      ix: cpu.ix,
      iy: cpu.iy,
      d000c6: mem[GUARD_FLAG_ADDR],
      d005e9: read24(mem, DESCRIPTOR_PTR_RAM),
    },
  };
}

function printDynamicScenario(result) {
  console.log(`=== Dynamic Trace: ${result.label} ===\n`);
  console.log(`Arg at (IX+6): ${hex(result.argValue)}`);
  console.log(`Termination: ${result.logicalTermination} (raw=${result.rawTermination})`);
  console.log(`Steps: ${result.steps}`);
  console.log(`Last PC: ${hex(result.lastPc)}`);
  console.log(`Final SP: ${hex(result.final.sp)}`);
  console.log(`Final IX: ${hex(result.final.ix)}`);
  console.log(`Final IY: ${hex(result.final.iy)}`);
  console.log(`Final D000C6: ${hexByte(result.final.d000c6)}`);
  console.log(`Final D005E9: ${hex(result.final.d005e9)}`);

  console.log('\nBlock trail:');
  console.log(`  ${result.blockTrail.map((pc) => hex(pc)).join(' -> ')}`);

  console.log('\nCall depth events:');
  if (!result.callEvents.length) {
    console.log('  none');
  } else {
    for (const event of result.callEvents) {
      if (event.type === 'call') {
        console.log(
          `  ${String(event.kind).toUpperCase()} ${hex(event.from)} -> ${hex(event.to)} ` +
          `(return ${hex(event.returnPc)}) depth=${event.depth}`,
        );
      } else {
        console.log(`  RETURN -> ${hex(event.to)} depth=${event.depth}`);
      }
    }
  }
  console.log(`  max dynamic call depth: ${result.maxDepth}`);

  console.log('\nRAM writes during execution:');
  if (!result.ramWrites.length) {
    console.log('  none');
  } else {
    for (const entry of result.ramWrites) {
      console.log(`  ${formatWriteEntry(entry)}  (block ${hex(entry.pc)})`);
    }
  }

  console.log('\nPort I/O during execution:');
  if (!result.portReads.length && !result.portWrites.length) {
    console.log('  none');
  } else {
    for (const entry of result.portReads) {
      console.log(`  IN  ${hex(entry.port, 4)} -> ${hexByte(entry.value)}  (block ${hex(entry.pc)})`);
    }
    for (const entry of result.portWrites) {
      console.log(`  OUT ${hex(entry.port, 4)} <- ${hexByte(entry.value)}  (block ${hex(entry.pc)})`);
    }
  }

  console.log('\nMemory-mapped I/O during execution:');
  if (!result.mmioReads.length && !result.mmioWrites.length) {
    console.log('  none');
  } else {
    for (const entry of result.mmioReads) {
      console.log(`  MMIO read  ${hex(entry.addr)} -> ${hexByte(entry.value)}  (block ${hex(entry.pc)})`);
    }
    for (const entry of result.mmioWrites) {
      console.log(`  MMIO write ${hex(entry.addr)} <- ${hex(entry.value, entry.width / 4)}  (block ${hex(entry.pc)})`);
    }
  }

  console.log('');
}

function printWrapUp(dynamicResults) {
  const uniqueWrites = new Set();
  let anyPorts = false;
  let anyMmio = false;
  let maxDepth = 0;

  for (const result of dynamicResults) {
    maxDepth = Math.max(maxDepth, result.maxDepth);
    anyPorts ||= result.portReads.length > 0 || result.portWrites.length > 0;
    anyMmio ||= result.mmioReads.length > 0 || result.mmioWrites.length > 0;
    for (const write of result.ramWrites) {
      if (write.region === 'ram') {
        uniqueWrites.add(write.addr);
      }
    }
  }

  console.log('4) Dynamic summary\n');
  console.log(`- Across the requested fast-return scenarios, the deepest observed dynamic nesting is ${maxDepth}.`);
  console.log(`  The only nested call is 0x055316 -> 0x055191, and with D000C6 bit 1 already set the guard returns immediately at ${hex(GUARD_FAST_RET)}.`);
  console.log(`- Non-stack state writes observed dynamically: ${[...uniqueWrites].map((addr) => hex(addr)).join(', ') || 'none'}`);
  console.log(`- Port I/O observed dynamically: ${anyPorts ? 'yes' : 'none'}`);
  console.log(`- MMIO observed dynamically: ${anyMmio ? 'yes' : 'none'}`);
  console.log(`- The fast-return runs confirm that 0x055316 itself only updates ${hex(DESCRIPTOR_PTR_RAM)} and leaves the later D005EC/D005F*/D02FD6 setup to its caller at ${hex(CALLER_CONTINUATION)}.`);
}

const graph = collectFunctionGraph(FUNC_START, FUNCTION_WINDOW_END);
const blocks = buildBasicBlocks(graph);
printStaticSection(graph, blocks);

const blocksMap = await loadBlocks();
const dynamicResults = [];
for (const [label, argValue] of [
  ['selector 0 (table slot 0)', 0x000000],
  ['selector 1 (table slot 1)', 0x000001],
  ['selector 2 (lands on 0x0525EC)', 0x000002],
  ['direct pointer 0x0525E0 (>2 path)', 0x0525E0],
]) {
  dynamicResults.push(await runScenario(blocksMap, label, argValue));
}

console.log('3) Dynamic traces (requested setup: D000C6 bit 1 pre-set so the inner 0x055191 fast-returns)\n');
for (const result of dynamicResults) {
  printDynamicScenario(result);
}

printWrapUp(dynamicResults);
