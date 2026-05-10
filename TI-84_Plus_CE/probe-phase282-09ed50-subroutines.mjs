#!/usr/bin/env node

/**
 * Phase 282: map the four display/menu helpers called by 0x09ED50.
 *
 * This probe does four things for each target:
 *   1. Linear static disassembly from lifted block metadata / ROM bytes.
 *   2. Direct CALL-site scan across the 4 MiB ROM image.
 *   3. A 200-step dynamic trace with minimal stack/register seeding.
 *   4. A classification summary with rationale.
 *
 * Notes:
 *   - The runtime in this repo exports `createExecutor`, not `createCPU`.
 *   - The dynamic traces start directly at each helper entry point.
 *   - The end-of-file output block is intentionally a placeholder here because
 *     subagent mode for this task forbids running the probe after editing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const rom = fs.readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const TRACE_STEPS = 200;
const TRACE_SP = 0xD1A880;
const TRACE_IX = 0xD1A860;
const TRACE_IY = 0xD00080;
const RETURN_SENTINEL = 0xFEFEFE;

const STRING_ADDR = 0xD22000;
const STRING_TEXT = 'MENU';
const FONT_DESCRIPTOR_TABLE = 0x0525D4;
const FONT_DESCRIPTOR_PTR = 0xD005E9;
const WIDTH_MODE_ADDR = 0xD005F4;

const TARGETS = [
  {
    address: 0x055316,
    label: '0x055316',
    classification: 'font selector',
    classificationRationale:
      'Maps a small selector argument onto a 12-byte-stride table at 0x0525D4 and stores the chosen descriptor pointer at 0xD005E9, which later text helpers consume through IY-relative fields.',
    args: [0x000000],
    prototype: [
      'Stack arg0 via `(IX+6)`: descriptor/style selector.',
      'No required live general register inputs; `0x055191` initializes `IY` to the display state block.',
    ],
    returns: 'Primarily side-effectful. The meaningful result is the updated descriptor pointer at `0xD005E9`.',
    prepare(mem) {
      writeAsciiZ(mem, STRING_ADDR, STRING_TEXT);
    },
  },
  {
    address: 0x0552F2,
    label: '0x0552F2',
    classification: 'cursor positioner',
    classificationRationale:
      'Copies a single stack argument into `0xD026AC`, a shared 16-bit display-position global that many rendering paths read back before drawing.',
    args: [0x000000],
    prototype: [
      'Stack arg0 via `(IX+6)`: 16-bit/24-bit position value written to `0xD026AC` with an SIS/MBASE store.',
      'No required live register inputs.',
    ],
    returns: 'No distinct register return contract; the observable effect is the `0xD026AC` update.',
    prepare(mem) {
      writeAsciiZ(mem, STRING_ADDR, STRING_TEXT);
      write24Mem(mem, FONT_DESCRIPTOR_PTR, FONT_DESCRIPTOR_TABLE);
    },
  },
  {
    address: 0x054DD4,
    label: '0x054DD4',
    classification: 'dimension calculator',
    classificationRationale:
      'Walks a NUL-terminated string, dispatches each byte to `0x00015C`, accumulates a running extent, and returns that accumulated value in `HL` for the caller’s `0x140` centering math.',
    args: [STRING_ADDR],
    prototype: [
      'Stack arg0 via `(IX+6)`: pointer to the NUL-terminated text string.',
      'Consumes the descriptor chosen at `0xD005E9` through `IY` after the shared `0x055191` setup.',
    ],
    returns: 'Returns the accumulated width/extent in `HL`.',
    prepare(mem) {
      writeAsciiZ(mem, STRING_ADDR, STRING_TEXT);
      write24Mem(mem, FONT_DESCRIPTOR_PTR, FONT_DESCRIPTOR_TABLE);
      mem[WIDTH_MODE_ADDR & MEM_MASK] = 0xFF;
    },
  },
  {
    address: 0x0540D0,
    label: '0x0540D0',
    classification: 'text renderer',
    classificationRationale:
      'Stages per-draw globals at `0xD008D2` and `0xD008D5`, iterates the string, and calls `0x00015C` per character; the surrounding parent routine uses it to draw centered menu labels.',
    args: [STRING_ADDR, 0x00009E, 0x000028],
    prototype: [
      'Stack arg0 via `(IX+6)`: string pointer.',
      'Stack arg1 via `(IX+9)`: computed X/extent slot used to seed `0xD008D2`.',
      'Stack arg2 via `(IX+12)`: low byte becomes the attribute/Y-style byte written to `0xD008D5`.',
    ],
    returns: 'Returns `HL` loaded from the draw-state scratch slot at `0x0008D2` on the terminating path.',
    prepare(mem) {
      writeAsciiZ(mem, STRING_ADDR, STRING_TEXT);
      write24Mem(mem, FONT_DESCRIPTOR_PTR, FONT_DESCRIPTOR_TABLE);
      mem[WIDTH_MODE_ADDR & MEM_MASK] = 0xFF;
    },
  },
];

let transpiledSource;
if (fs.existsSync(TRANSPILED_JS_PATH)) {
  transpiledSource = fs.readFileSync(TRANSPILED_JS_PATH, 'utf-8');
} else {
  transpiledSource = gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)).toString('utf-8');
}

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteString(bytes, start, length) {
  return Array.from(bytes.subarray(start, start + length))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(' ');
}

function read24Mem(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    mem[base] |
    (mem[(base + 1) & MEM_MASK] << 8) |
    (mem[(base + 2) & MEM_MASK] << 16)
  ) >>> 0;
}

function write24Mem(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function writeAsciiZ(mem, addr, text) {
  for (let i = 0; i < text.length; i += 1) {
    mem[(addr + i) & MEM_MASK] = text.charCodeAt(i) & 0x7F;
  }
  mem[(addr + text.length) & MEM_MASK] = 0x00;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase282-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, transpiledSource);
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTemp(assets) {
  if (assets?.tempModulePath) {
    try {
      fs.unlinkSync(assets.tempModulePath);
    } catch {}
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTemp(assets);
    throw error;
  }
}

function getInstructionAt(blocks, pc, mode = 'adl') {
  const key = `${pc.toString(16).padStart(6, '0')}:${mode}`;
  const block = blocks[key];
  if (!block?.instructions?.length) return null;
  const instruction = block.instructions[0];
  if ((instruction.pc & 0xFFFFFF) !== (pc & 0xFFFFFF)) return null;
  return instruction;
}

function disassembleLinear(blocks, start, maxScanBytes = 0x100) {
  const instructions = [];
  let pc = start;
  const limit = start + maxScanBytes;

  while (pc < limit) {
    const instruction = getInstructionAt(blocks, pc);
    if (!instruction) break;
    instructions.push(instruction);
    pc += instruction.length;
    if (instruction.tag === 'ret' || instruction.tag === 'reti' || instruction.tag === 'retn') break;
  }

  return instructions;
}

function normalizeDisp(text) {
  return text.replace('+-', '-');
}

function extractIxIyRefs(dasm) {
  return [...dasm.matchAll(/\((i[xy])([+-][^)]+)\)/gi)].map((match) => ({
    register: match[1].toUpperCase(),
    displacement: Number.parseInt(normalizeDisp(match[2]), 10),
    text: `${match[1].toUpperCase()}${normalizeDisp(match[2])}`,
  }));
}

function describeArgOffset(displacement) {
  if (displacement < 6) return null;
  const argIndex = Math.floor((displacement - 6) / 3);
  const remainder = (displacement - 6) % 3;
  return {
    argIndex,
    byteOffset: remainder,
    stackOffset: 3 + (argIndex * 3) + remainder,
  };
}

function summarizeArgAccesses(instructions) {
  const entries = [];
  const seen = new Set();

  for (const instruction of instructions) {
    for (const ref of extractIxIyRefs(instruction.dasm)) {
      if (ref.register !== 'IX') continue;
      const argInfo = describeArgOffset(ref.displacement);
      if (!argInfo) continue;
      const key = `${argInfo.argIndex}:${argInfo.byteOffset}:${instruction.dasm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(
        `arg${argInfo.argIndex} via ${ref.text} (entry stack +${argInfo.stackOffset}) in \`${instruction.dasm}\``
      );
    }
  }

  return entries;
}

function summarizeAbsoluteRefs(instructions) {
  const reads = [];
  const writes = [];
  const seen = new Set();

  for (const instruction of instructions) {
    const writeMatch = instruction.dasm.match(/^ld \((0x[0-9a-f]+)\),/i);
    const readMatch = instruction.dasm.match(/^ld [^,]+,\((0x[0-9a-f]+)\)/i);
    const widthHint =
      instruction.bytes.startsWith('40 ') || instruction.bytes.startsWith('40 ed')
        ? '16-bit SIS/MBASE'
        : instruction.tag?.includes('pair')
          ? 'pair-width'
          : '8-bit';

    if (writeMatch) {
      const key = `w:${writeMatch[1]}:${instruction.dasm}`;
      if (!seen.has(key)) {
        seen.add(key);
        writes.push(`${writeMatch[1].toUpperCase()} <= ${instruction.dasm} [${widthHint}]`);
      }
    }
    if (readMatch) {
      const key = `r:${readMatch[1]}:${instruction.dasm}`;
      if (!seen.has(key)) {
        seen.add(key);
        reads.push(`${readMatch[1].toUpperCase()} => ${instruction.dasm} [${widthHint}]`);
      }
    }
  }

  return { reads, writes };
}

function summarizeIndirectRefs(instructions) {
  const reads = [];
  const writes = [];
  const seen = new Set();

  for (const instruction of instructions) {
    const dasm = instruction.dasm.toLowerCase();
    if (!/\((hl|bc|de|ix|iy)/.test(dasm)) continue;
    if (/^ld \(/.test(dasm)) {
      const key = `w:${instruction.dasm}`;
      if (!seen.has(key)) {
        seen.add(key);
        writes.push(instruction.dasm);
      }
      continue;
    }
    const key = `r:${instruction.dasm}`;
    if (!seen.has(key)) {
      seen.add(key);
      reads.push(instruction.dasm);
    }
  }

  return { reads, writes };
}

function summarizeCalls(instructions) {
  return instructions
    .filter((instruction) => instruction.tag === 'call' || instruction.tag === 'call-conditional')
    .map((instruction) => `${hex(instruction.pc)} -> ${instruction.dasm}`);
}

function summarizeFunctionBoundary(instructions, start) {
  const last = instructions[instructions.length - 1];
  const hasRet = last && (last.tag === 'ret' || last.tag === 'reti' || last.tag === 'retn');
  if (!hasRet) {
    return {
      retAddress: null,
      size: null,
      note: 'No RET found in the scanned linear window.',
    };
  }
  const end = last.pc + last.length;
  return {
    retAddress: last.pc,
    size: end - start,
    note: `${hex(start)}..${hex(end)} (${end - start} bytes)`,
  };
}

function findRawCallers(target) {
  const result = [];
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;

  for (let i = 0; i <= rom.length - 4; i += 1) {
    if (rom[i] !== 0xCD || rom[i + 1] !== b0 || rom[i + 2] !== b1 || rom[i + 3] !== b2) continue;
    result.push({
      address: i,
      bytes: byteString(rom, i, 4),
    });
  }

  return result;
}

function installRamWriteHooks(cpu, writeLog) {
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  const record = (addr, value, width) => {
    const normalizedAddr = addr & 0xFFFFFF;
    if (normalizedAddr < 0xD00000) return;
    writeLog.push({
      pc: cpu._currentBlockPc ?? cpu.pc ?? 0,
      addr: normalizedAddr,
      width,
      value: value & (width === 1 ? 0xFF : width === 2 ? 0xFFFF : 0xFFFFFF),
    });
  };

  cpu.write8 = (addr, value) => {
    origWrite8(addr, value);
    record(addr, value, 1);
  };
  cpu.write16 = (addr, value) => {
    origWrite16(addr, value);
    record(addr, value, 2);
  };
  cpu.write24 = (addr, value) => {
    origWrite24(addr, value);
    record(addr, value, 3);
  };
}

function uniqueBy(list, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function classifyDisplayWrite(addr) {
  if (addr >= 0xD00500 && addr < 0xD00600) return 'D005xx display state';
  if (addr >= 0xD00600 && addr < 0xD00700) return 'D006xx text buffer';
  if (addr >= 0xD40000 && addr < 0xD50000) return 'D4xxxx VRAM';
  if (addr >= 0xD00800 && addr < 0xD00900) return 'D008xx draw scratch';
  if (addr >= 0xD02600 && addr < 0xD02700) return 'D026xx draw globals';
  return null;
}

function summarizeDisplayWrites(writes) {
  const grouped = new Map();

  for (const write of writes) {
    const group = classifyDisplayWrite(write.addr);
    if (!group) continue;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(write);
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([group, entries]) => [
      group,
      uniqueBy(entries, (entry) => `${entry.addr}:${entry.width}:${entry.value}`).map((entry) => ({
        addr: hex(entry.addr),
        width: entry.width,
        value: hex(entry.value, entry.width * 2),
        pc: hex(entry.pc),
      })),
    ])
  );
}

function formatInstruction(instruction) {
  return `${hex(instruction.pc)}  ${instruction.bytes.padEnd(20)} ${instruction.dasm}`;
}

function formatWrite(write) {
  return `${hex(write.addr)} <= ${hex(write.value, write.width * 2)} (w${write.width}, from ${hex(write.pc)})`;
}

async function runDynamicTrace(blocks, target) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  writeAsciiZ(mem, STRING_ADDR, STRING_TEXT);
  if (typeof target.prepare === 'function') {
    target.prepare(mem);
  }

  const peripheralBus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, {
    peripherals: peripheralBus,
    trackMemoryMapped: true,
  });
  const cpu = executor.cpu;

  cpu.pc = target.address;
  cpu.sp = TRACE_SP;
  cpu.ix = TRACE_IX;
  cpu.iy = TRACE_IY;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  write24Mem(mem, TRACE_SP + 0, RETURN_SENTINEL);
  target.args.forEach((value, index) => {
    write24Mem(mem, TRACE_SP + 3 + (index * 3), value);
  });

  const blockTrace = [];
  const ramWrites = [];
  const mmioTrace = [];
  let sentinelReached = false;

  installRamWriteHooks(cpu, ramWrites);

  cpu.onMmioRead = (addr, value) => {
    mmioTrace.push({ kind: 'read', addr: addr & 0xFFFFFF, value: value & 0xFF, pc: cpu._currentBlockPc ?? cpu.pc ?? 0 });
  };
  cpu.onMmioWrite = (addr, value) => {
    mmioTrace.push({ kind: 'write', addr: addr & 0xFFFFFF, value: value & 0xFF, pc: cpu._currentBlockPc ?? cpu.pc ?? 0 });
  };

  const result = executor.runFrom(target.address, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: 100,
    onBlock(pc, mode, meta, step) {
      blockTrace.push({
        step,
        pc: pc & 0xFFFFFF,
        mode,
        firstDasm: meta?.instructions?.[0]?.dasm ?? null,
      });
    },
    onMissingBlock(pc) {
      if ((pc & 0xFFFFFF) === RETURN_SENTINEL) sentinelReached = true;
    },
  });

  return {
    args: target.args.map((value) => hex(value)),
    termination: result.termination,
    sentinelReached,
    steps: result.steps,
    loopsForced: result.loopsForced,
    finalState: {
      pc: hex(cpu.pc & 0xFFFFFF),
      sp: hex(cpu.sp & 0xFFFFFF),
      a: hex(cpu.a & 0xFF, 2),
      f: hex(cpu.f & 0xFF, 2),
      bc: hex(cpu.bc & 0xFFFFFF),
      de: hex(cpu.de & 0xFFFFFF),
      hl: hex(cpu.hl & 0xFFFFFF),
      ix: hex(cpu.ix & 0xFFFFFF),
      iy: hex(cpu.iy & 0xFFFFFF),
    },
    blockTrace: uniqueBy(blockTrace, (entry) => `${entry.pc}:${entry.mode}`).map((entry) => ({
      step: entry.step,
      pc: hex(entry.pc),
      mode: entry.mode,
      firstDasm: entry.firstDasm,
    })),
    ramWrites: uniqueBy(ramWrites, (entry) => `${entry.addr}:${entry.width}:${entry.value}:${entry.pc}`),
    displayWrites: summarizeDisplayWrites(ramWrites),
    mmioTrace: uniqueBy(mmioTrace, (entry) => `${entry.kind}:${entry.addr}:${entry.value}:${entry.pc}`),
  };
}

function printTargetReport(report) {
  console.log(`\n=== ${report.target.label} ===`);
  console.log(`classification: ${report.target.classification}`);
  console.log(`why: ${report.target.classificationRationale}`);
  console.log(`callers: ${report.callers.length}`);

  if (report.callers.length > 0) {
    for (const caller of report.callers) {
      console.log(`  ${hex(caller.address)}  ${caller.bytes}  call ${report.target.label}`);
    }
  }

  console.log('prototype / input expectations:');
  for (const line of report.target.prototype) {
    console.log(`  - ${line}`);
  }

  const argAccesses = summarizeArgAccesses(report.instructions);
  if (argAccesses.length > 0) {
    console.log('detected IX-frame argument accesses:');
    for (const line of argAccesses) {
      console.log(`  - ${line}`);
    }
  }

  const absoluteRefs = summarizeAbsoluteRefs(report.instructions);
  const indirectRefs = summarizeIndirectRefs(report.instructions);
  const calls = summarizeCalls(report.instructions);
  const boundary = summarizeFunctionBoundary(report.instructions, report.target.address);

  console.log('static disassembly:');
  for (const instruction of report.instructions) {
    console.log(`  ${formatInstruction(instruction)}`);
  }

  console.log(`function boundary: ${boundary.note}`);
  console.log(`return convention: ${report.target.returns}`);

  console.log('absolute reads:');
  if (absoluteRefs.reads.length === 0) {
    console.log('  - none in the linear entry slice');
  } else {
    for (const line of absoluteRefs.reads) console.log(`  - ${line}`);
  }

  console.log('absolute writes:');
  if (absoluteRefs.writes.length === 0) {
    console.log('  - none in the linear entry slice');
  } else {
    for (const line of absoluteRefs.writes) console.log(`  - ${line}`);
  }

  console.log('indirect/indexed reads:');
  if (indirectRefs.reads.length === 0) {
    console.log('  - none');
  } else {
    for (const line of indirectRefs.reads) console.log(`  - ${line}`);
  }

  console.log('indirect/indexed writes:');
  if (indirectRefs.writes.length === 0) {
    console.log('  - none');
  } else {
    for (const line of indirectRefs.writes) console.log(`  - ${line}`);
  }

  console.log('sub-subroutine calls:');
  if (calls.length === 0) {
    console.log('  - none');
  } else {
    for (const line of calls) console.log(`  - ${line}`);
  }

  console.log('dynamic trace:');
  console.log(`  args: ${report.dynamic.args.join(', ')}`);
  console.log(
    `  termination: ${report.dynamic.termination}, steps=${report.dynamic.steps}, sentinelReached=${report.dynamic.sentinelReached}, loopsForced=${report.dynamic.loopsForced}`
  );
  console.log(
    `  final: PC=${report.dynamic.finalState.pc} SP=${report.dynamic.finalState.sp} HL=${report.dynamic.finalState.hl} DE=${report.dynamic.finalState.de} BC=${report.dynamic.finalState.bc} A=${report.dynamic.finalState.a}`
  );

  console.log('  visited blocks:');
  for (const entry of report.dynamic.blockTrace) {
    console.log(`    step ${entry.step.toString().padStart(3, ' ')}  ${entry.pc}:${entry.mode}  ${entry.firstDasm ?? 'n/a'}`);
  }

  console.log('  RAM writes (unique):');
  if (report.dynamic.ramWrites.length === 0) {
    console.log('    none');
  } else {
    for (const write of report.dynamic.ramWrites.slice(0, 24)) {
      console.log(`    ${formatWrite(write)}`);
    }
    if (report.dynamic.ramWrites.length > 24) {
      console.log(`    ... ${report.dynamic.ramWrites.length - 24} more`);
    }
  }

  console.log('  display-related writes:');
  const displayGroups = Object.entries(report.dynamic.displayWrites);
  if (displayGroups.length === 0) {
    console.log('    none to D005xx / D006xx / D4xxxx / nearby draw globals within 200 steps');
  } else {
    for (const [group, entries] of displayGroups) {
      console.log(`    ${group}:`);
      for (const entry of entries) {
        console.log(`      ${entry.addr} <= ${entry.value} (w${entry.width}, from ${entry.pc})`);
      }
    }
  }

  const mmio = report.dynamic.mmioTrace;
  console.log('  MMIO trace:');
  if (mmio.length === 0) {
    console.log('    none');
  } else {
    for (const entry of mmio.slice(0, 20)) {
      console.log(`    ${entry.kind} ${hex(entry.addr)} => ${hex(entry.value, 2)} (from ${hex(entry.pc)})`);
    }
    if (mmio.length > 20) {
      console.log(`    ... ${mmio.length - 20} more`);
    }
  }
}

async function main() {
  const { blocks, assets } = await loadBlocks();
  try {
    const reports = [];
    for (const target of TARGETS) {
      const instructions = disassembleLinear(blocks, target.address, 0x100);
      const callers = findRawCallers(target.address);
      const dynamic = await runDynamicTrace(blocks, target);
      reports.push({ target, instructions, callers, dynamic });
    }

    console.log('Phase 282: 0x09ED50 helper map');
    console.log(`ROM: ${ROM_PATH}`);
    console.log(`seed string: ${hex(STRING_ADDR)} = "${STRING_TEXT}\\0"`);
    console.log(`font descriptor base seed: ${hex(FONT_DESCRIPTOR_TABLE)}`);

    for (const report of reports) {
      printTargetReport(report);
    }

    console.log('\n=== Summary ===');
    for (const report of reports) {
      const boundary = summarizeFunctionBoundary(report.instructions, report.target.address);
      console.log(
        `${report.target.label}: ${report.target.classification}; size=${boundary.size ?? 'n/a'} bytes; callers=${report.callers.length}; return=${report.target.returns}`
      );
    }
  } finally {
    cleanupTemp(assets);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/*
Execution output placeholder
----------------------------
Subagent mode for this task explicitly required exiting immediately after
applying patches and prohibited running verification commands or tests, so the
stdout transcript has not been pasted here yet.

When run manually:
  node TI-84_Plus_CE/probe-phase282-09ed50-subroutines.mjs

Paste the full console output from that command into this trailing comment
block.
*/
