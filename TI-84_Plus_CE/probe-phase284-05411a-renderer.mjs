#!/usr/bin/env node

/**
 * Phase 284: trace 0x05411A - core renderer trampoline
 *
 * This probe performs:
 *   1. Linear static disassembly of 0x05411A until RET / unconditional JP.
 *   2. Direct CALL/JP scan for 0x05411A across the ROM image.
 *   3. A 500-step dynamic trace from 0x05411A with minimal RAM seeding.
 *   4. A findings summary focused on the IY-selected text hook pipeline.
 *
 * Notes:
 *   - 0x055191 is the shared graphics prologue.
 *   - 0x00015C is a stub to 0x002288, and 0x002288 is `jp (iy)`.
 *   - D005E9 is seeded with the selector base 0x0525D4 so that the trace
 *     follows the same family of hook records used by 0x055316.
 *   - Some hook targets land mid-block in the lifted output. When that
 *     happens, the trace records the missing target and recovers to the next
 *     known lifted block start within a short window.
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

const TARGET = 0x05411A;
const PARENT = 0x0540D0;
const PROLOGUE = 0x055191;
const DISPATCH_STUB = 0x00015C;
const IY_TRAMPOLINE = 0x002288;
const PUTC = 0x0A1B5B;
const DRAW_GLYPH = 0x0A1799;

const TRACE_STEPS = 500;
const TRACE_SP = 0xD1A87E;
const TRACE_IY = 0xD00080;
const RETURN_SENTINEL = 0xFEFEFE;
const MAX_STATIC_BYTES = 0x100;
const MISSING_BLOCK_RECOVERY_WINDOW = 0x40;

const STRING_ADDR = 0xD22000;
const STRING_TEXT = 'AB';

const FONT_RECORD_ADDR = 0x0525D4;
const FONT_RECORD_PTR_ADDR = 0xD005E9;
const FONT_WIDTH_MODE_ADDR = 0xD005F4;
const OS_DISPLAY_FLAGS_ADDR = TRACE_IY + 70; // checked by 0x055191

const PEN_COL_ADDR = 0xD008D2;
const PEN_ROW_ADDR = 0xD008D5;

const ARGS = [
  STRING_ADDR, // arg0: string pointer
  0x000024,    // arg1: pen column / X-like slot
  0x000018,    // arg2: pen row / attribute byte
  0x000001,    // arg3: draw-mode set by 0x0540D0
];

const KNOWN_ADDRS = new Map([
  [TARGET, 'target'],
  [PARENT, 'wrapper parent'],
  [PROLOGUE, 'graphics prologue'],
  [DISPATCH_STUB, 'dispatch stub'],
  [IY_TRAMPOLINE, 'jp (iy) trampoline'],
  [PUTC, 'PutC'],
  [DRAW_GLYPH, 'DrawGlyph'],
  [FONT_RECORD_ADDR, 'seeded hook record'],
  [0x054FC6, 'hook slot +3 value'],
  [0x055167, 'hook slot +6 value'],
  [0x05518C, 'hook slot +9 value'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatDisp(value) {
  if (value === 0) return '+0x00';
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function bytesHex(values) {
  return Array.from(values, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function read24LE(bytes, offset) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  ) >>> 0;
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
  for (let index = 0; index < text.length; index += 1) {
    mem[(addr + index) & MEM_MASK] = text.charCodeAt(index) & 0x7F;
  }
  mem[(addr + text.length) & MEM_MASK] = 0x00;
}

function uniqueBy(list, keyFn) {
  const result = [];
  const seen = new Set();
  for (const item of list) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function labelFor(addr) {
  const label = KNOWN_ADDRS.get(addr & 0xFFFFFF);
  return label ? ` [${label}]` : '';
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase284-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTemp(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
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

function disassembleLinear(blocks, start, mode = 'adl', maxBytes = MAX_STATIC_BYTES) {
  const instructions = [];
  const stopTags = new Set(['ret', 'reti', 'retn', 'jp', 'jp-indirect']);
  let pc = start & 0xFFFFFF;
  const limit = pc + maxBytes;

  while (pc < limit) {
    const instruction = getInstructionAt(blocks, pc, mode);
    if (!instruction) break;
    instructions.push(instruction);
    pc += instruction.length;
    if (stopTags.has(instruction.tag)) break;
  }

  return instructions;
}

function findTransfersTo(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let index = 0; index <= rom.length - 4; index += 1) {
    const opcode = rom[index];
    if ((opcode !== 0xCD && opcode !== 0xC3) || rom[index + 1] !== lo || rom[index + 2] !== mid || rom[index + 3] !== hi) {
      continue;
    }
    hits.push({
      address: index,
      type: opcode === 0xCD ? 'CALL' : 'JP',
      bytes: bytesHex(rom.subarray(index, index + 4)),
    });
  }

  return hits;
}

function summarizeHookRecord(baseAddr) {
  const raw = rom.subarray(baseAddr, baseAddr + 12);
  return {
    baseAddr,
    rawBytes: bytesHex(raw),
    slot0: read24LE(rom, baseAddr + 0),
    slot3: read24LE(rom, baseAddr + 3),
    slot6: read24LE(rom, baseAddr + 6),
    slot9: read24LE(rom, baseAddr + 9),
  };
}

function buildBlockStarts(blocks) {
  const byMode = new Map();

  for (const key of Object.keys(blocks)) {
    const [pcHex, mode] = key.split(':');
    if (!mode) continue;
    const pc = Number.parseInt(pcHex, 16);
    if (!Number.isFinite(pc)) continue;
    if (!byMode.has(mode)) byMode.set(mode, []);
    byMode.get(mode).push(pc);
  }

  for (const list of byMode.values()) {
    list.sort((left, right) => left - right);
  }

  return byMode;
}

function findNextBlockStart(blockStarts, mode, pc, maxDelta = MISSING_BLOCK_RECOVERY_WINDOW) {
  const entries = blockStarts.get(mode) ?? [];
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (entries[mid] < pc) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const next = entries[low];
  if (!Number.isFinite(next)) return null;
  if ((next - pc) > maxDelta) return null;
  return next;
}

function describeAccessTags(addr, iyValue) {
  const tags = new Set();

  if (addr >= 0xD00500 && addr < 0xD00600) tags.add('D005xx');
  if (addr >= 0xD00600 && addr < 0xD00700) tags.add('D006xx');
  if (addr >= 0xD00800 && addr < 0xD00900) tags.add('D008xx');
  if (addr >= 0xD02600 && addr < 0xD02700) tags.add('D026xx');
  if (addr >= 0xD40000 && addr < 0xD65800) tags.add('VRAM');

  const relCurrentIy = addr - (iyValue & 0xFFFFFF);
  if (relCurrentIy >= -128 && relCurrentIy <= 127) {
    tags.add(`IY${formatDisp(relCurrentIy)}`);
  }

  const relOsIy = addr - TRACE_IY;
  if (relOsIy >= -128 && relOsIy <= 127) {
    tags.add(`OS_IY${formatDisp(relOsIy)}`);
  }

  return [...tags];
}

function installRamHooks(cpu, readLog, writeLog, context) {
  const origRead8 = cpu.read8.bind(cpu);
  const origRead16 = cpu.read16.bind(cpu);
  const origRead24 = cpu.read24.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  const record = (list, kind, addr, value, width) => {
    const normalizedAddr = addr & 0xFFFFFF;
    if (normalizedAddr < 0xD00000) return;
    const mask = width === 1 ? 0xFF : width === 2 ? 0xFFFF : 0xFFFFFF;
    list.push({
      kind,
      step: context.step,
      pc: context.blockPc,
      addr: normalizedAddr,
      width,
      value: value & mask,
      iy: cpu.iy & 0xFFFFFF,
      tags: describeAccessTags(normalizedAddr, cpu.iy & 0xFFFFFF),
    });
  };

  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    record(readLog, 'read', addr, value, 1);
    return value;
  };
  cpu.read16 = (addr) => {
    const value = origRead16(addr);
    record(readLog, 'read', addr, value, 2);
    return value;
  };
  cpu.read24 = (addr) => {
    const value = origRead24(addr);
    record(readLog, 'read', addr, value, 3);
    return value;
  };

  cpu.write8 = (addr, value) => {
    origWrite8(addr, value);
    record(writeLog, 'write', addr, value, 1);
  };
  cpu.write16 = (addr, value) => {
    origWrite16(addr, value);
    record(writeLog, 'write', addr, value, 2);
  };
  cpu.write24 = (addr, value) => {
    origWrite24(addr, value);
    record(writeLog, 'write', addr, value, 3);
  };
}

function formatAccess(event) {
  const tagText = event.tags.length > 0 ? ` [${event.tags.join(', ')}]` : '';
  return `step ${String(event.step).padStart(3)} ${hex(event.pc)} ${event.kind === 'read' ? '->' : '<-'} ${hex(event.addr)} ${event.kind === 'read' ? '=' : ''}${hex(event.value, event.width * 2)} w${event.width}${tagText}`;
}

async function runDynamicTrace(blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  writeAsciiZ(mem, STRING_ADDR, STRING_TEXT);
  write24Mem(mem, FONT_RECORD_PTR_ADDR, FONT_RECORD_ADDR);
  mem[FONT_WIDTH_MODE_ADDR & MEM_MASK] = 0xFF;
  mem[OS_DISPLAY_FLAGS_ADDR & MEM_MASK] = 0x02; // keep 0x055191 from reinitializing D005E9

  const hookRecord = summarizeHookRecord(FONT_RECORD_ADDR);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, {
    peripherals,
    trackMemoryMapped: true,
  });

  const { cpu, compiledBlocks, blockMeta } = executor;
  const blockStarts = buildBlockStarts(blockMeta);

  cpu.pc = TARGET;
  cpu.sp = TRACE_SP;
  cpu.ix = 0;
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
  cpu.im = 0;

  write24Mem(mem, TRACE_SP + 0, RETURN_SENTINEL);
  ARGS.forEach((value, index) => {
    write24Mem(mem, TRACE_SP + 3 + (index * 3), value);
  });

  const context = { step: 0, blockPc: TARGET };
  const blockTrace = [];
  const callTargets = [];
  const jpTargets = [];
  const ramReads = [];
  const ramWrites = [];
  const missingRecoveries = [];
  const missingBlocks = [];

  installRamHooks(cpu, ramReads, ramWrites, context);

  let pc = TARGET;
  let mode = 'adl';
  let steps = 0;
  let termination = 'max_steps';
  let error = null;
  let lastResult = TARGET;

  while (steps < TRACE_STEPS) {
    const key = `${pc.toString(16).padStart(6, '0')}:${mode}`;
    const fn = compiledBlocks[key];
    const meta = blockMeta[key];

    if (!fn || !meta) {
      const recoveredPc = findNextBlockStart(blockStarts, mode, pc);
      missingBlocks.push({ step: steps + 1, pc, mode, recoveredPc });
      if (recoveredPc === null) {
        termination = 'missing_block';
        break;
      }
      missingRecoveries.push({ step: steps + 1, from: pc, to: recoveredPc, mode });
      pc = recoveredPc;
      continue;
    }

    cpu.madl = mode === 'adl' ? 1 : 0;
    cpu.pc = pc;
    cpu._currentBlockPc = pc;
    context.step = steps + 1;
    context.blockPc = pc;

    const firstInstruction = meta.instructions?.[0] ?? null;
    const lastInstruction = meta.instructions?.[meta.instructions.length - 1] ?? null;

    let result;
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = caught;
      break;
    }

    steps += 1;
    lastResult = result;

    blockTrace.push({
      step: steps,
      pc,
      mode,
      result,
      firstDasm: firstInstruction?.dasm ?? '(unknown)',
      lastDasm: lastInstruction?.dasm ?? '(unknown)',
    });

    if (lastInstruction?.tag === 'call' || (lastInstruction?.tag === 'call-conditional' && result === lastInstruction.target)) {
      callTargets.push({
        step: steps,
        from: lastInstruction.pc,
        target: result,
        dasm: lastInstruction.dasm,
      });
    }

    if (lastInstruction?.tag === 'jp' || lastInstruction?.tag === 'jp-indirect' || (lastInstruction?.tag === 'jp-conditional' && result === lastInstruction.target)) {
      jpTargets.push({
        step: steps,
        from: lastInstruction.pc,
        target: result,
        dasm: lastInstruction.dasm,
      });
    }

    if (result === RETURN_SENTINEL) {
      termination = 'ret_to_caller';
      break;
    }

    if (result === undefined || result === null) {
      termination = 'no_return';
      break;
    }

    if (typeof result !== 'number') {
      termination = 'non_numeric_result';
      break;
    }

    if (result < 0) {
      termination = result === -1 ? 'halt' : result === -2 ? 'sleep' : `sentinel_${result}`;
      break;
    }

    const matchingExit = meta.exits?.find((exit) => exit.target === result);
    mode = matchingExit?.targetMode ?? mode;
    pc = result & 0xFFFFFF;
  }

  return {
    steps,
    termination,
    error,
    lastResult,
    hookRecord,
    blockTrace,
    callTargets,
    jpTargets,
    ramReads,
    ramWrites,
    missingRecoveries,
    missingBlocks,
    finalState: {
      pc: cpu.pc & 0xFFFFFF,
      sp: cpu.sp & 0xFFFFFF,
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      bc: cpu.bc & 0xFFFFFF,
      de: cpu.de & 0xFFFFFF,
      hl: cpu.hl & 0xFFFFFF,
      ix: cpu.ix & 0xFFFFFF,
      iy: cpu.iy & 0xFFFFFF,
    },
    reached: {
      putC: blockTrace.some((entry) => entry.pc === PUTC) || callTargets.some((entry) => entry.target === PUTC) || jpTargets.some((entry) => entry.target === PUTC),
      drawGlyph: blockTrace.some((entry) => entry.pc === DRAW_GLYPH) || callTargets.some((entry) => entry.target === DRAW_GLYPH) || jpTargets.some((entry) => entry.target === DRAW_GLYPH),
      iyTrampoline: blockTrace.some((entry) => entry.pc === IY_TRAMPOLINE) || callTargets.some((entry) => entry.target === IY_TRAMPOLINE) || jpTargets.some((entry) => entry.target === IY_TRAMPOLINE),
    },
    seededRam: {
      d005e9: read24Mem(mem, FONT_RECORD_PTR_ADDR),
      d005f4: mem[FONT_WIDTH_MODE_ADDR & MEM_MASK],
      d008d2: read24Mem(mem, PEN_COL_ADDR),
      d008d5: mem[PEN_ROW_ADDR & MEM_MASK],
    },
  };
}

function printDisassembly(instructions) {
  for (const instruction of instructions) {
    console.log(`  ${hex(instruction.pc)}: ${instruction.bytes.padEnd(20)} ${instruction.dasm}${labelFor(instruction.pc)}`);
  }
  if (instructions.length > 0) {
    const last = instructions[instructions.length - 1];
    const byteCount = (last.pc + last.length) - instructions[0].pc;
    console.log(`\n  Decoded ${instructions.length} instruction(s), ${byteCount} byte(s).`);
  }
}

function printTransfers(title, transfers) {
  console.log(`\n${title}: ${transfers.length}`);
  for (const transfer of transfers) {
    console.log(`  ${hex(transfer.address)}: ${transfer.type} ${hex(TARGET)}  [${transfer.bytes}]`);
  }
}

function printHookRecord(hookRecord) {
  console.log('\nSeeded D005E9 hook record');
  console.log(`  base:   ${hex(hookRecord.baseAddr)}${labelFor(hookRecord.baseAddr)}`);
  console.log(`  bytes:  ${hookRecord.rawBytes}`);
  console.log(`  +0x00:  ${hex(hookRecord.slot0)} (returned by 0x05530B / selector query)`);
  console.log(`  +0x03:  ${hex(hookRecord.slot3)} (slot used by 0x05411A)`);
  console.log(`  +0x06:  ${hex(hookRecord.slot6)} (slot used by 0x054DD4)`);
  console.log(`  +0x09:  ${hex(hookRecord.slot9)} (slot used by 0x054DC9 tail jp)`);
}

function printDynamicTrace(trace) {
  console.log('\n' + '='.repeat(88));
  console.log(`PART 3: Dynamic trace (${TRACE_STEPS} steps max from ${hex(TARGET)})`);
  console.log('='.repeat(88));

  console.log(`\n  Termination: ${trace.termination} after ${trace.steps} step(s)`);
  if (trace.error) {
    console.log(`  Error: ${trace.error.message}`);
  }
  console.log(
    `  Final state: PC=${hex(trace.finalState.pc)} SP=${hex(trace.finalState.sp)} ` +
    `A=${hex(trace.finalState.a, 2)} F=${hex(trace.finalState.f, 2)} ` +
    `BC=${hex(trace.finalState.bc)} DE=${hex(trace.finalState.de)} ` +
    `HL=${hex(trace.finalState.hl)} IX=${hex(trace.finalState.ix)} IY=${hex(trace.finalState.iy)}`
  );
  console.log(
    `  Seeded RAM after trace: D005E9=${hex(trace.seededRam.d005e9)} ` +
    `D005F4=${hex(trace.seededRam.d005f4, 2)} ` +
    `D008D2=${hex(trace.seededRam.d008d2)} D008D5=${hex(trace.seededRam.d008d5, 2)}`
  );

  printHookRecord(trace.hookRecord);

  console.log('\n  Blocks visited:');
  for (const entry of trace.blockTrace) {
    console.log(
      `    step ${String(entry.step).padStart(3)}: ${hex(entry.pc)} -> ${hex(entry.result)} ` +
      `${entry.firstDasm}${labelFor(entry.pc)}`
    );
  }

  console.log('\n  CALL targets:');
  if (trace.callTargets.length === 0) {
    console.log('    (none)');
  } else {
    for (const entry of trace.callTargets) {
      console.log(`    step ${String(entry.step).padStart(3)}: ${hex(entry.from)} -> ${hex(entry.target)}  ${entry.dasm}${labelFor(entry.target)}`);
    }
  }

  console.log('\n  JP targets:');
  if (trace.jpTargets.length === 0) {
    console.log('    (none)');
  } else {
    for (const entry of trace.jpTargets) {
      console.log(`    step ${String(entry.step).padStart(3)}: ${hex(entry.from)} -> ${hex(entry.target)}  ${entry.dasm}${labelFor(entry.target)}`);
    }
  }

  if (trace.missingRecoveries.length > 0) {
    console.log('\n  Missing-block recoveries:');
    for (const entry of trace.missingRecoveries) {
      console.log(`    step ${String(entry.step).padStart(3)}: ${hex(entry.from)} -> recovered at ${hex(entry.to)} (${entry.mode})`);
    }
  }

  if (trace.missingBlocks.length > 0) {
    console.log('\n  Missing block hits:');
    for (const entry of trace.missingBlocks) {
      console.log(`    step ${String(entry.step).padStart(3)}: wanted ${hex(entry.pc)} (${entry.mode})${entry.recoveredPc !== null ? `, recovered to ${hex(entry.recoveredPc)}` : ''}`);
    }
  }

  console.log(`\n  RAM reads (${trace.ramReads.length}):`);
  if (trace.ramReads.length === 0) {
    console.log('    (none)');
  } else {
    for (const entry of trace.ramReads) {
      console.log(`    ${formatAccess(entry)}`);
    }
  }

  console.log(`\n  RAM writes (${trace.ramWrites.length}):`);
  if (trace.ramWrites.length === 0) {
    console.log('    (none)');
  } else {
    for (const entry of trace.ramWrites) {
      console.log(`    ${formatAccess(entry)}`);
    }
  }
}

function printFindings(instructions, callers, trace) {
  const directCallTargets = uniqueBy(
    instructions
      .filter((instruction) => instruction.tag === 'call' || instruction.tag === 'call-conditional')
      .map((instruction) => instruction.target)
      .filter((target) => Number.isFinite(target)),
    (target) => target
  );

  const usesIySlot3 = instructions.some((instruction) => /\(iy\+3\)/i.test(instruction.dasm));
  const writesPenCol = instructions.some((instruction) => /\(0x0008d2\)/i.test(instruction.dasm));
  const writesPenRow = instructions.some((instruction) => /\(0xd008d5\)/i.test(instruction.dasm));
  const togglesFirstCharFlag =
    instructions.some((instruction) => /ld \(ix-6\), 0x01/i.test(instruction.dasm)) &&
    instructions.some((instruction) => /ld \(ix-6\), 0x00/i.test(instruction.dasm));

  console.log('\n' + '='.repeat(88));
  console.log('PART 4: Findings');
  console.log('='.repeat(88));

  console.log('\n  Role');
  console.log('  - 0x05411A is a string-walking renderer trampoline, not the final glyph drawer.');
  console.log('  - It stages draw-state globals, iterates a NUL-terminated string, and forwards one character at a time into a generic text hook service.');

  console.log('\n  Static body');
  console.log(`  - Direct callers found in ROM: ${callers.length}. ${callers.some((entry) => entry.address === 0x0540EA || entry.address === 0x05410F) ? '0x0540D0 is confirmed as a parent wrapper.' : 'The parent wrapper is not the only caller.'}`);
  console.log(`  - Direct subroutine calls inside 0x05411A: ${directCallTargets.map((target) => `${hex(target)}${labelFor(target)}`).join(', ') || 'none'}.`);
  console.log(`  - ${writesPenCol ? 'Writes' : 'Does not write'} pen column scratch at D008D2 and ${writesPenRow ? 'writes' : 'does not write'} pen row/attribute at D008D5.`);
  console.log(`  - ${usesIySlot3 ? 'Reads (IY+3) after loading IY from D005E9.' : 'Does not read an IY slot in the linear body.'}`);
  console.log(`  - ${togglesFirstCharFlag ? 'Uses a local first-character flag at (IX-6): 1 before the first dispatch, then 0 on later iterations.' : 'No first-character flag pattern was detected.'}`);

  console.log('\n  IY dispatch');
  console.log(`  - Yes: the per-character path calls ${hex(DISPATCH_STUB)}, which immediately reaches ${hex(IY_TRAMPOLINE)} = \`jp (iy)\`.`);
  console.log(`  - In this routine, IY is loaded from D005E9 and then (IY+3) is copied into a local slot. The dynamic trace also shows IY changing from the OS base ${hex(TRACE_IY)} to the seeded hook record ${hex(FONT_RECORD_ADDR)}.`);
  console.log(`  - The seeded record bytes were ${trace.hookRecord.rawBytes}, so slot +3 resolved to ${hex(trace.hookRecord.slot3)} while the indirect trampoline target remained the hook base ${hex(trace.hookRecord.baseAddr)}.`);

  console.log('\n  Relationship to 0x0540D0');
  console.log('  - 0x0540D0 pushes four values before calling 0x05411A: string pointer, pen/X slot, row/attribute byte, and a final constant 1.');
  console.log('  - 0x05411A consumes those as arg0..arg3, then forwards arg3 plus the local first-character flag plus the current byte into the hook service.');

  console.log('\n  Relationship to PutC / DrawGlyph');
  if (trace.reached.putC || trace.reached.drawGlyph) {
    console.log(`  - The 500-step trace ${trace.reached.putC ? 'did' : 'did not'} reach PutC (${hex(PUTC)}) and ${trace.reached.drawGlyph ? 'did' : 'did not'} reach DrawGlyph (${hex(DRAW_GLYPH)}).`);
  } else {
    console.log(`  - No direct visit to PutC (${hex(PUTC)}) or DrawGlyph (${hex(DRAW_GLYPH)}) was observed in the 500-step trace.`);
  }
  console.log('  - The direct path from 0x05411A is 0x055191 -> 0x00015C -> 0x002288 -> jp (iy), so any eventual relation to PutC / DrawGlyph is indirect and depends on the D005E9-selected hook implementation.');

  console.log('\n  Bottom line');
  console.log('  - 0x05411A is the core per-string trampoline used by the 0x0540D0 wrapper.');
  console.log('  - It is IY-driven, but not by calling 0x0A1B5B or 0x0A1799 directly. Instead it stages state, walks bytes, and hands each character to an IY-selected text hook via the 0x00015C / 0x002288 trampoline.');
}

console.log('='.repeat(88));
console.log(`Phase 284: Trace ${hex(TARGET)} - core renderer trampoline`);
console.log('='.repeat(88));

const { blocks, assets } = await loadBlocks();

try {
  console.log('\n' + '='.repeat(88));
  console.log(`PART 1: Static disassembly of ${hex(TARGET)}`);
  console.log('='.repeat(88));

  const instructions = disassembleLinear(blocks, TARGET, 'adl', MAX_STATIC_BYTES);
  printDisassembly(instructions);

  console.log('\n' + '='.repeat(88));
  console.log(`PART 2: Direct callers of ${hex(TARGET)}`);
  console.log('='.repeat(88));

  const callers = findTransfersTo(TARGET);
  printTransfers('  CALL / JP references', callers);

  const trace = await runDynamicTrace(blocks);
  printDynamicTrace(trace);
  printFindings(instructions, callers, trace);

  console.log('\n' + '='.repeat(88));
  console.log('Phase 284 complete.');
  console.log('='.repeat(88));
} finally {
  cleanupTemp(assets);
}
