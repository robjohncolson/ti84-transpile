#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const ENTRY_PC = 0x02FEDF;
const SENTINEL = 0x7FFFFE;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const SP_ADDR = 0xD1987E;

const IY_PLUS_18 = IY_ADDR + 18;
const IY_PLUS_31 = IY_ADDR + 31;
const IY_PLUS_87 = IY_ADDR + 87;

const CASCADE_START = 0x02FEB0;
const CASCADE_END = 0x02FF30;
const HELPER_22346 = 0x022346;
const HELPER_22359 = 0x022359;
const HELPER_2237E = 0x02237E;
const HELPER_236F9 = 0x0236F9;
const COMMON_TAIL_JP = 0x02FEEF;
const LOOKUP_RETURN = 0x02FF1A;
const KEY_TABLE_ADDR = 0x09F79B;
const OS_STATE_D007E0 = 0xD007E0;

const STOP_CLEAR_MODE = new Map([
  [HELPER_236F9, 'entered 0x0236F9 via 0x022359'],
  [COMMON_TAIL_JP, 'returned to common tail JP 0x02FD99'],
  [SENTINEL, 'hit synthetic return sentinel'],
]);

const STOP_OTHER = new Map([
  [HELPER_236F9, 'entered 0x0236F9 via 0x022346/0x022359'],
  [LOOKUP_RETURN, 'returned from 0x022346 to 0x02FF1A'],
  [SENTINEL, 'hit synthetic return sentinel'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesFor(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function makeStop(label, pc) {
  const error = new Error('__PHASE233_STOP__');
  error.phase233Stop = {
    label,
    pc: pc & 0xFFFFFF,
  };
  return error;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      source: 'js',
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase233-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    source: 'gz',
    modulePath: tempModulePath,
    tempModulePath,
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister.toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${inst.condition.toUpperCase()}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'push':
      return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop':
      return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-sp-pair':
      return `LD SP, ${inst.pair.toUpperCase()}`;
    case 'add-pair':
      return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'lea':
      return `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'alu-imm':
      return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${inst.op.toUpperCase()} ${inst.src === '(hl)' ? '(HL)' : inst.src.toUpperCase()}`;
    case 'rotate-reg':
      return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    default:
      return inst.tag;
  }
}

function decodeRange(rom, startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  while (pc < (endPc & 0xFFFFFF)) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      rows.push({
        pc: inst.pc >>> 0,
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        length: inst.length,
      });
      pc = inst.nextPc & 0xFFFFFF;
    } catch (error) {
      rows.push({
        pc,
        bytes: bytesFor(rom, pc, 1),
        text: `decode-error: ${error.message}`,
        tag: 'decode-error',
        length: 1,
      });
      pc = (pc + 1) & 0xFFFFFF;
    }
  }
  return rows;
}

function decodeUntilRet(rom, startPc, maxInstructions = 64) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  for (let i = 0; i < maxInstructions; i += 1) {
    const inst = decodeInstruction(rom, pc, 'adl');
    rows.push({
      pc: inst.pc >>> 0,
      bytes: bytesFor(rom, inst.pc, inst.length),
      text: formatInstruction(inst),
      tag: inst.tag,
      length: inst.length,
    });
    pc = inst.nextPc & 0xFFFFFF;
    if (inst.tag === 'ret') break;
  }
  return rows;
}

function printRows(rows, markers = new Map()) {
  for (const row of rows) {
    const marker = markers.get(row.pc) ?? '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${marker ? `  ${marker}` : ''}`);
  }
}

function describeWatchedAddr(addr) {
  if (addr === IY_PLUS_18) return 'IY+18';
  if (addr === IY_PLUS_31) return 'IY+31';
  if (addr === IY_PLUS_87) return 'IY+87';
  return hex(addr);
}

function diffBits(before, after) {
  const setBits = [];
  const clearedBits = [];
  for (let bit = 0; bit < 8; bit += 1) {
    const mask = 1 << bit;
    const beforeSet = (before & mask) !== 0;
    const afterSet = (after & mask) !== 0;
    if (!beforeSet && afterSet) setBits.push(bit);
    if (beforeSet && !afterSet) clearedBits.push(bit);
  }
  return { setBits, clearedBits };
}

function formatBitChange(before, after) {
  const { setBits, clearedBits } = diffBits(before, after);
  const parts = [];
  if (setBits.length) parts.push(`SET bit${setBits.length === 1 ? '' : 's'} ${setBits.join(',')}`);
  if (clearedBits.length) parts.push(`RES bit${clearedBits.length === 1 ? '' : 's'} ${clearedBits.join(',')}`);
  return parts.length ? parts.join('; ') : 'no bit change';
}

function printWriteEvents(events) {
  if (!events.length) {
    console.log('  IY writes: none observed before stop');
    return;
  }
  console.log('  IY writes:');
  for (const event of events) {
    console.log(
      `    @${hex(event.pc)} ${describeWatchedAddr(event.addr)} ${hexByte(event.before)} -> ${hexByte(event.after)} (${formatBitChange(event.before, event.after)})`,
    );
  }
}

function createRuntime(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return {
    mem,
    cpu: executor.cpu,
    executor,
  };
}

function initializeDirectEntryState(cpu, mem, aValue) {
  cpu.a = aValue & 0xFF;
  cpu.f = 0x40;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x000000;
  cpu.ix = 0x000000;
  cpu.iy = IY_ADDR;
  cpu.mbase = MBASE;
  cpu.madl = 1;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SP_ADDR;

  mem[IY_PLUS_18] = 0x00;
  mem[IY_PLUS_31] = 0x00;
  mem[IY_PLUS_87] = 0x00;

  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, SENTINEL);
}

function runScenario(romBytes, blocks, scenario) {
  const runtime = createRuntime(romBytes, blocks);
  const { mem, cpu, executor } = runtime;
  initializeDirectEntryState(cpu, mem, scenario.a);

  const writes = [];
  const visited = [];
  const notes = {
    lookupCall: null,
    helper22346After000578: null,
    helper2237eAfter000578: null,
    helper236f9Entry: null,
  };

  const originalWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const before = cpu.read8(normalized);
    originalWrite8(normalized, value);
    const after = cpu.read8(normalized);
    if (
      before !== after &&
      (normalized === IY_PLUS_18 || normalized === IY_PLUS_31 || normalized === IY_PLUS_87)
    ) {
      writes.push({
        pc: cpu._currentBlockPc ?? 0,
        addr: normalized,
        before,
        after,
      });
    }
  };

  let stopInfo = null;
  let traceMeta = null;

  try {
    traceMeta = executor.runFrom(ENTRY_PC, 'adl', {
      maxSteps: 600,
      maxLoopIterations: 64,
      onBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (visited.length < 128) visited.push(normalized);

        if (normalized === HELPER_22346 && !notes.lookupCall) {
          notes.lookupCall = {
            entryA: cpu.a & 0xFF,
            entryHL: cpu.hl & 0xFFFFFF,
            tableByte: mem[cpu.hl & 0xFFFFFF],
          };
        }

        if (normalized === 0x02234B && !notes.helper22346After000578) {
          notes.helper22346After000578 = {
            a: cpu.a & 0xFF,
            f: cpu.f & 0xFF,
            z: (cpu.f & 0x40) !== 0,
          };
        }

        if (normalized === 0x022383 && !notes.helper2237eAfter000578) {
          notes.helper2237eAfter000578 = {
            a: cpu.a & 0xFF,
            f: cpu.f & 0xFF,
            z: (cpu.f & 0x40) !== 0,
          };
        }

        if (normalized === HELPER_236F9 && !notes.helper236f9Entry) {
          const bufferStart = cpu.hl & 0xFFFFFF;
          notes.helper236f9Entry = {
            a: cpu.a & 0xFF,
            hl: bufferStart,
            seedBytes: Array.from(mem.slice(bufferStart, bufferStart + 6), (value) => value & 0xFF),
            d007e0: mem[OS_STATE_D007E0],
          };
        }

        const stopLabel = scenario.stopMap.get(normalized);
        if (stopLabel) {
          throw makeStop(stopLabel, normalized);
        }
      },
    });
  } catch (error) {
    if (error?.phase233Stop) {
      stopInfo = error.phase233Stop;
    } else {
      throw error;
    }
  }

  return {
    name: scenario.name,
    inputA: scenario.a & 0xFF,
    visited,
    writes,
    notes,
    stopInfo,
    traceMeta,
  };
}

function printStaticSummary() {
  console.log('=== Part 1: Static CP Cascade (0x02FEB0-0x02FF30) ===');
  console.log('');
  console.log('  Note: 0x02FEB0-0x02FEB2 are tail bytes from the prior path; the post-SET/RES continuation starts at 0x02FEB3.');
  console.log('');
  console.log('  Pre-cascade gates:');
  console.log('    - 0x02FEB7 tests BIT 3,(IY+87), clears it, and if that bit was set it writes D0058E=0x58, D0058C=0xFA, then RETs at 0x02FECE.');
  console.log('    - 0x02FECF tests BIT 3,(IY+18); if set, it jumps out to 0x02FFF6.');
  console.log('    - 0x02FED7 tests BIT 4,(IY+18); if set, it jumps out to 0x0300CB.');
  console.log('');
  console.log('  Case map once execution reaches 0x02FEDF:');
  console.log('    - A=0x36 (CLEAR): 0x02FEDF -> 0x02FEE3 -> 0x02237E -> common tail at 0x02FEEF/0x02FD99.');
  console.log('      IY effects: SET bit 3 at IY+18; SET bit 6 at IY+31.');
  console.log('    - A=0x30 (MODE): 0x02FEDF -> 0x02FEF3 -> 0x02FEF7 -> 0x02237E -> JR back to 0x02FEEF -> common tail 0x02FD99.');
  console.log('      IY effects: SET bit 7 at IY+31; SET bit 4 at IY+18; RES bit 5 at IY+18.');
  console.log('    - Other key codes (for example A=0x8F): 0x02FEDF -> 0x02FEF3 -> 0x02FF09.');
  console.log('      IY effects in this local path: none before the 0x022346 / 0x0302EB calls.');
  console.log('');
}

function print2237eInterpretation() {
  console.log('  Interpretation:');
  console.log('    - 0x02237E is a small wrapper with boundary 0x02237E-0x02238F.');
  console.log('    - It saves AF, calls 0x000578, and branches on Z at 0x022383.');
  console.log('    - Z path: restore AF and RET immediately.');
  console.log('    - NZ path: build HL = 0xF000 | A, then call 0x022359.');
  console.log('    - 0x022359 stack-packs a 6-byte descriptor and hands it to 0x0236F9 along with the current IY+18 flag byte.');
  console.log('    - Sibling helper 0x022346 performs the same handoff pattern, except it first loads A from (HL) and zero-extends that byte into HL.');
  console.log('');
}

function printScenario(result) {
  console.log(`=== ${result.name} ===`);
  console.log('');
  if (result.stopInfo) {
    console.log(`  Stop: ${result.stopInfo.label} at ${hex(result.stopInfo.pc)}`);
  } else if (result.traceMeta) {
    console.log(
      `  Stop: executor termination=${result.traceMeta.termination ?? 'unknown'} lastPc=${hex(result.traceMeta.lastPc)}`,
    );
  } else {
    console.log('  Stop: no stop metadata captured');
  }
  console.log(`  Blocks: ${result.visited.map((pc) => hex(pc)).join(' -> ')}`);
  printWriteEvents(result.writes);

  if (result.notes.lookupCall) {
    console.log(
      `  0x022346 entry: A=${hexByte(result.notes.lookupCall.entryA)} HL=${hex(result.notes.lookupCall.entryHL)} ` +
      `table[HL]=${hexByte(result.notes.lookupCall.tableByte)}`,
    );
  }

  if (result.notes.helper22346After000578) {
    console.log(
      `  0x022346 after 0x000578: A=${hexByte(result.notes.helper22346After000578.a)} ` +
      `F=${hexByte(result.notes.helper22346After000578.f)} Z=${result.notes.helper22346After000578.z ? '1' : '0'}`,
    );
  }

  if (result.notes.helper2237eAfter000578) {
    console.log(
      `  0x02237E after 0x000578: A=${hexByte(result.notes.helper2237eAfter000578.a)} ` +
      `F=${hexByte(result.notes.helper2237eAfter000578.f)} Z=${result.notes.helper2237eAfter000578.z ? '1' : '0'}`,
    );
  }

  if (result.notes.helper236f9Entry) {
    console.log(
      `  0x0236F9 handoff: A=${hexByte(result.notes.helper236f9Entry.a)} HL=${hex(result.notes.helper236f9Entry.hl)} ` +
      `seed=[${result.notes.helper236f9Entry.seedBytes.map((value) => hexByte(value)).join(' ')}] ` +
      `D007E0=${hexByte(result.notes.helper236f9Entry.d007e0)}`,
    );
  }

  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);
  const transpiledAssets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(transpiledAssets.modulePath).href);
    const blocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      null;

    if (!blocks || typeof blocks !== 'object') {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }

    console.log('Phase 233: CP 0x36 / 0x30 classification probe');
    console.log(`ROM source: ${path.basename(ROM_PATH)}`);
    console.log(`Transpiled source: ${transpiledAssets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz (temp gunzip)'}`);
    console.log(`Direct-entry setup: PC=${hex(ENTRY_PC)} A varies, IY=${hex(IY_ADDR)} SP=${hex(SP_ADDR)} MBASE=${hexByte(MBASE)}`);
    console.log('');

    const cascadeRows = decodeRange(romBytes, CASCADE_START, CASCADE_END);
    printStaticSummary();
    printRows(
      cascadeRows,
      new Map([
        [0x02FEDF, '<-- CP 0x36'],
        [0x02FEF3, '<-- CP 0x30'],
        [0x02FF11, '<-- 09F79B table base load'],
      ]),
    );
    console.log('');

    console.log('=== Part 2: 0x02237E Disassembly ===');
    console.log('');
    const rows2237e = decodeUntilRet(romBytes, HELPER_2237E, 16);
    printRows(rows2237e, new Map([[HELPER_2237E, '<-- helper entry']]));
    console.log('');
    print2237eInterpretation();

    const relatedRows = decodeRange(romBytes, HELPER_22346, 0x02237E);
    console.log('=== Related Helper Context (0x022346-0x02237D) ===');
    console.log('');
    printRows(
      relatedRows,
      new Map([
        [HELPER_22346, '<-- table-byte wrapper'],
        [HELPER_22359, '<-- descriptor builder'],
      ]),
    );
    console.log('');

    const scenarios = [
      {
        name: 'Part 3: Dynamic Trace A=0x36 (CLEAR key)',
        a: 0x36,
        stopMap: STOP_CLEAR_MODE,
      },
      {
        name: 'Part 4: Dynamic Trace A=0x30 (MODE key)',
        a: 0x30,
        stopMap: STOP_CLEAR_MODE,
      },
      {
        name: "Part 5: Dynamic Trace A=0x8F ('1' key code)",
        a: 0x8F,
        stopMap: STOP_OTHER,
      },
    ];

    const results = scenarios.map((scenario) => runScenario(romBytes, blocks, scenario));
    for (const result of results) {
      printScenario(result);
    }

    console.log('=== Part 6: Report ===');
    console.log('');
    console.log('  CLEAR / MODE handlers:');
    console.log('    - CLEAR (0x36) sets IY+18 bit 3 and IY+31 bit 6 before calling 0x02237E.');
    console.log('    - MODE (0x30) sets IY+31 bit 7, sets IY+18 bit 4, clears IY+18 bit 5, then calls 0x02237E.');
    console.log('    - Both handlers rejoin the same common tail at 0x02FEEF -> JP 0x02FD99.');
    console.log('');
    console.log('  0x02237E behavior:');
    console.log('    - Wrapper around 0x022359.');
    console.log('    - 0x000578 decides whether to bail out on Z or continue with a translated low byte in A.');
    console.log('    - On NZ, 0x02237E constructs an F0xx ID and 0x022359 forwards a descriptor to 0x0236F9.');
    console.log('');
    console.log('  Fall-through path for non-0x36/non-0x30:');
    console.log('    - Proceeds to 0x02FF09 / 0x02FF11 and indexes the 0x09F79B table with A.');
    console.log('    - Then uses sibling helper 0x022346, which feeds the looked-up byte into the same 0x022359 -> 0x0236F9 pipeline.');
    console.log('');
    console.log('  Requested verification target: A=0x8F');
    console.log('    - This probe records whether execution reaches 0x022346 with HL = 0x09F79B + 0x8F and prints the table byte at that address.');
    console.log('');
  } finally {
    cleanupTranspiledModule(transpiledAssets);
  }
}

await main();
