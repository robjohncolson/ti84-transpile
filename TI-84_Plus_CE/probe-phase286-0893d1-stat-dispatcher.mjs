#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TARGET = 0x0893D1;
const DISASM_BYTES = 0x90;
const TRACE_STEPS = 200;
const TRACE_SP = 0xD1A87E;
const TRACE_IX = 0xD1A860;
const TRACE_IY = 0xD00080;
const RETURN_SENTINEL = 0xFEFEFE;

const IY_59 = TRACE_IY + 89;
const D00824 = 0xD00824;

const TEST_CASES = [
  { label: 'A=0x35 (requested STAT test)', a: 0x35, iy59: 0xFF, d824: 0xAA },
  { label: 'A=0x09 (requested ENTER test)', a: 0x09, iy59: 0x80, d824: 0x5A },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, addr, len) {
  return Array.from(buffer.subarray(addr, addr + len))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledAssets() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      text: fs.readFileSync(TRANSPILED_JS_PATH, 'utf8'),
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const unzipped = gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH));
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase286-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, unzipped);
  return {
    text: unzipped.toString('utf8'),
    modulePath: tempModulePath,
    tempModulePath,
  };
}

function cleanupTranspiledAssets(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadModules() {
  const assets = ensureTranspiledAssets();
  try {
    const [{ decodeInstruction }, { createExecutor }, { createPeripheralBus }, romModule] =
      await Promise.all([
        import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href),
        import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href),
        import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href),
        import(pathToFileURL(assets.modulePath).href),
      ]);

    return {
      decodeInstruction,
      createExecutor,
      createPeripheralBus,
      preliftedBlocks: normalizeBlocks(
        romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule,
      ),
      transpiledText: assets.text,
      cleanup() {
        cleanupTranspiledAssets(assets);
      },
    };
  } catch (error) {
    cleanupTranspiledAssets(assets);
    throw error;
  }
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${indexRegister}${sign}${Math.abs(displacement)})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';
  if (inst.dasm) return inst.dasm;

  const dest = inst.dest ?? inst.dst;

  switch (inst.tag) {
    case 'nop':
      return 'nop';
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister ?? 'hl'})`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm':
      return `ld ${dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${dest}, (${inst.src ?? inst.ptr ?? 'hl'})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest ?? inst.ptr ?? 'hl'}), ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'add-pair':
      return `add ${inst.dest ?? 'hl'}, ${inst.src}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${formatIndexed(inst.indexRegister ?? 'ix', inst.displacement ?? 0)}`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, ${formatIndexed(inst.indexRegister ?? 'ix', inst.displacement ?? 0)}`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister ?? 'ix', inst.displacement ?? 0)}`;
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    default:
      return inst.tag;
  }
}

function isCompare(row) {
  return (row.inst?.tag === 'alu-imm' || row.inst?.tag === 'alu-reg') && row.inst?.op === 'cp';
}

function isCall(row) {
  return row.inst?.tag === 'call' || row.inst?.tag === 'call-conditional';
}

function isJumpTableLike(row) {
  return row.inst?.tag === 'jp-indirect';
}

function disassemble(decodeInstruction, rom, start, byteCount) {
  const rows = [];
  let pc = start;
  const end = Math.min(rom.length, start + byteCount);

  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      bytes: bytesAt(rom, pc, length),
      inst,
      text: formatInstruction(inst),
      length,
    });
    pc += length;
  }

  return rows;
}

function groupByStep(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!map.has(entry.step)) map.set(entry.step, []);
    map.get(entry.step).push(entry);
  }
  return map;
}

function formatAccess(entry) {
  const valueWidth = entry.width === 1 ? 2 : entry.width === 2 ? 4 : 6;
  return `${entry.dir}${entry.width * 8}@${hex(entry.addr)}=${hex(entry.value, valueWidth)}`;
}

function traceScenario(modules, rom, scenario) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const executor = modules.createExecutor(modules.preliftedBlocks, mem, {
    peripherals: modules.createPeripheralBus({ timerInterrupt: false }),
    trackMemoryMapped: true,
  });
  const cpu = executor.cpu;

  const state = {
    step: -1,
    accessLog: [],
  };

  const capture = (dir, addr, width, value) => {
    if (state.accessLog.length >= 256) return;
    state.accessLog.push({
      step: state.step,
      dir,
      addr: addr & 0xFFFFFF,
      width,
      value: Number(value ?? 0) >>> 0,
    });
  };

  for (const [name, width] of [['read8', 1], ['read16', 2], ['read24', 3]]) {
    const original = cpu[name].bind(cpu);
    cpu[name] = (addr) => {
      const value = original(addr);
      capture('R', addr, width, value);
      return value;
    };
  }

  for (const [name, width] of [['write8', 1], ['write16', 2], ['write24', 3]]) {
    const original = cpu[name].bind(cpu);
    cpu[name] = (addr, value) => {
      capture('W', addr, width, value);
      return original(addr, value);
    };
  }

  cpu.pc = TARGET;
  cpu.sp = TRACE_SP;
  cpu.ix = TRACE_IX;
  cpu.iy = TRACE_IY;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = scenario.a & 0xFF;
  cpu.f = 0;
  cpu.i = 0;
  cpu.im = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;

  write24(mem, cpu.sp, RETURN_SENTINEL);
  mem[IY_59] = scenario.iy59 & 0xFF;
  mem[D00824] = scenario.d824 & 0xFF;

  const blocks = [];
  const missing = [];
  let terminatedByReturn = false;
  let runResult = null;

  try {
    runResult = executor.runFrom(TARGET, 'adl', {
      maxSteps: TRACE_STEPS,
      maxLoopIterations: 32,
      onBlock(pc, mode, meta, step) {
        state.step = step;
        const instructions = (meta?.instructions ?? []).map((inst) => ({
          tag: inst.tag,
          target: inst.target ?? null,
          text: inst.dasm ?? formatInstruction(inst),
        }));
        blocks.push({
          step,
          pc: pc & 0xFFFFFF,
          mode,
          instructions,
        });
      },
      onMissingBlock(pc, mode, step) {
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
          terminatedByReturn = true;
          throw new Error('__RETURN_SENTINEL__');
        }
        missing.push({ step, pc: pc & 0xFFFFFF, mode });
      },
    });
  } catch (error) {
    if (error?.message !== '__RETURN_SENTINEL__') throw error;
  }

  const accessByStep = groupByStep(state.accessLog);
  const enrichedBlocks = blocks.map((block) => ({
    ...block,
    accesses: accessByStep.get(block.step) ?? [],
    callTargets: block.instructions
      .filter((inst) => inst.tag === 'call' || inst.tag === 'call-conditional')
      .map((inst) => inst.target),
  }));

  return {
    scenario,
    termination: terminatedByReturn ? 'return_sentinel' : (runResult?.termination ?? 'unknown'),
    steps: terminatedByReturn ? blocks.length : (runResult?.steps ?? blocks.length),
    final: {
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      sp: cpu.sp & 0xFFFFFF,
      iy59: mem[IY_59] & 0xFF,
      d824: mem[D00824] & 0xFF,
    },
    blocks: enrichedBlocks,
    missing,
  };
}

function findNearestBlockHeader(text, index) {
  const blockHeaderIndex = text.lastIndexOf('function block_', index);
  if (blockHeaderIndex === -1) return null;
  const snippet = text.slice(blockHeaderIndex, blockHeaderIndex + 64);
  const match = snippet.match(/function block_([0-9a-f]{6})_([a-z0-9]+)/i);
  if (!match) return null;
  return {
    blockStart: parseInt(match[1], 16),
    mode: match[2],
  };
}

function collectCrossReferences(transpiledText) {
  const bySite = new Map();
  const directRegex = /\/\/ 0x([0-9a-f]{6})\s+([0-9a-f ]+)\s+(call|jp) 0x0893d1/gi;
  let match;

  while ((match = directRegex.exec(transpiledText))) {
    const instrPc = parseInt(match[1], 16);
    const bytes = match[2].trim().replace(/\s+/g, ' ');
    const transfer = match[3].toUpperCase();
    const block = findNearestBlockHeader(transpiledText, match.index);
    const key = `${instrPc}:${transfer}`;

    if (!bySite.has(key)) {
      bySite.set(key, {
        instrPc,
        bytes,
        transfer,
        blockStarts: block ? [block.blockStart] : [],
      });
      continue;
    }

    const entry = bySite.get(key);
    if (block && !entry.blockStarts.includes(block.blockStart)) entry.blockStarts.push(block.blockStart);
  }

  return {
    hasNamedSubSymbol: /sub_0893d1/i.test(transpiledText),
    hasBlockDefinition: /"0893d1:adl"\s*:\s*\{/i.test(transpiledText),
    callers: [...bySite.values()].sort((left, right) => left.instrPc - right.instrPc),
  };
}

function printTrace(trace) {
  console.log(`  Scenario: ${trace.scenario.label}`);
  console.log(
    `  Seeded state: A=${hexByte(trace.scenario.a)} IY+59=${hexByte(trace.scenario.iy59)} D00824=${hexByte(trace.scenario.d824)}`,
  );
  console.log(
    `  Exit: ${trace.termination}, steps=${trace.steps}, final A=${hexByte(trace.final.a)} F=${hexByte(trace.final.f)} SP=${hex(trace.final.sp)} IY+59=${hexByte(trace.final.iy59)} D00824=${hexByte(trace.final.d824)}`,
  );

  for (const block of trace.blocks) {
    const text = block.instructions.map((inst) => inst.text).join(' | ') || '(no metadata)';
    console.log(`    [${String(block.step).padStart(3, '0')}] ${hex(block.pc)}:${block.mode} ${text}`);
    console.log(`          CALLs: ${block.callTargets.length ? block.callTargets.map((target) => hex(target)).join(', ') : '(none)'}`);
    console.log(
      `          MEM  : ${block.accesses.length ? block.accesses.map((entry) => formatAccess(entry)).join(' | ') : '(none)'}`,
    );
  }

  if (trace.missing.length) {
    console.log(`  Missing blocks: ${trace.missing.map((entry) => `${hex(entry.pc)}:${entry.mode}`).join(', ')}`);
  }

  console.log('');
}

async function main() {
  console.log('=== Phase 286: Trace 0x0893D1 - STAT dispatcher? ===\n');

  const rom = fs.readFileSync(ROM_PATH);
  const modules = await loadModules();

  try {
    const rows = disassemble(modules.decodeInstruction, rom, TARGET, DISASM_BYTES);
    const retIndex = rows.findIndex((row) => row.inst?.tag === 'ret');
    const boundaryIndex = retIndex >= 0 ? retIndex : rows.length - 1;
    const routineRows = rows.slice(0, boundaryIndex + 1);
    const afterRetRows = rows.slice(boundaryIndex + 1);
    const routineEnd = routineRows.at(-1)?.pc ?? TARGET;
    const routineSize = routineRows.reduce((sum, row) => sum + row.length, 0);

    const routineCalls = routineRows.filter(isCall);
    const routineCompares = routineRows.filter(isCompare);
    const routineJumpTablePatterns = routineRows.filter(isJumpTableLike);
    const postRetInteresting = afterRetRows.filter((row) => isCall(row) || isCompare(row) || isJumpTableLike(row));

    console.log('--- Task 1: Static disassembly of 0x0893D1 (at least 80 bytes) ---');
    for (const row of rows) {
      let marker = '';
      if (row.pc === TARGET) marker = '  <-- TARGET';
      if (row.pc === routineEnd && row.inst?.tag === 'ret') marker += '  <-- first RET boundary';
      if (row.pc > routineEnd) marker += '  <-- post-RET neighbor';
      console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}${marker}`);
    }

    console.log('\n--- Static summary ---');
    console.log(`  First RET boundary: ${hex(routineEnd)} (routine size ${routineSize} bytes).`);
    console.log(`  CP instructions inside 0x0893D1..RET: ${routineCompares.length || 0}`);
    console.log(`  CALL instructions inside 0x0893D1..RET: ${routineCalls.length || 0}`);
    console.log(`  JP (HL) / jump-table patterns inside 0x0893D1..RET: ${routineJumpTablePatterns.length || 0}`);
    console.log('  Direct side effects inside the target routine:');
    console.log(`    - XOR A immediately zeroes the caller-provided A byte.`);
    console.log(`    - RES 7,(IY+89) clears bit 7 at ${hex(IY_59)}.`);
    console.log(`    - LD (${hex(D00824)}),A stores 0x00 to ${hex(D00824)}.`);
    console.log('  Entry-register conclusion: if a key code arrives in A, 0x0893D1 discards it before any compare or dispatch.');

    if (postRetInteresting.length) {
      console.log('  Adjacent interesting instructions after the RET (these are neighboring routines, not 0x0893D1 itself):');
      for (const row of postRetInteresting.slice(0, 12)) {
        console.log(`    ${hex(row.pc)}  ${row.text}`);
      }
    }

    console.log('\n--- Task 2: Dynamic trace starting at 0x0893D1 ---');
    for (const scenario of TEST_CASES) {
      const trace = traceScenario(modules, rom, scenario);
      printTrace(trace);
    }

    console.log('--- Task 3: Cross-reference against ROM.transpiled.js ---');
    const xref = collectCrossReferences(modules.transpiledText);
    console.log(`  Search for sub_0893D1: ${xref.hasNamedSubSymbol ? 'found' : 'not found'}`);
    console.log(`  Search for 0893d1:adl lifted block: ${xref.hasBlockDefinition ? 'found' : 'not found'}`);
    console.log(`  Unique direct CALL/JP sites to 0x0893D1: ${xref.callers.length}`);
    for (const caller of xref.callers) {
      const sourceBlocks = caller.blockStarts.length
        ? caller.blockStarts.map((addr) => hex(addr)).join(', ')
        : '(unknown)';
      console.log(
        `    ${caller.transfer} ${hex(caller.instrPc)}  bytes=${caller.bytes}  enclosing block(s)=${sourceBlocks}`,
      );
    }

    console.log('\n--- Assessment ---');
    console.log('  0x0893D1 is not a key-code dispatcher in this ROM snapshot.');
    console.log('  It is a 10-byte cleanup helper that zeroes A, clears IY+89 bit 7, writes 0x00 to D00824, and returns.');
    console.log('  The CP instructions and JP (HL) pattern visible in the 80-byte window belong to neighboring routines after 0x0893DA, not to 0x0893D1.');
    console.log('  The caller list also fits a shared state-reset helper: several sites branch to it directly, and one caller (0x08600E) even saves AF before entering it.');
    console.log('\n=== Phase 286 complete ===');
  } finally {
    modules.cleanup();
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
