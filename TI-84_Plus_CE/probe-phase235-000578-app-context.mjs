#!/usr/bin/env node

/**
 * Phase 235: trace the 0x000578 "app-context" gate.
 *
 * The lifted ROM reveals that 0x000578 is only a trampoline:
 *   0x000578: JP 0x0158A6
 *
 * The actual predicate lives at 0x0158A6 and, in this transpilation, it reads
 * 0x00007E (ROM-backed in the flat memory model), compares it against 0xFF,
 * restores A, and returns with the compare flags intact.
 *
 * This probe prints:
 *   Part A: hex dump + sequential decode for 0x000578..0x0005C0, then the real body at 0x0158A6
 *   Part B: dynamic trace from 0x000578 in default lifted state
 *   Part C: forced-NZ trace plus threshold map for the deciding byte
 *   Part D: raw ROM CALL/JP cross-reference for 0x000578 (and 0x0158A6 as a trampoline note)
 *   Part E: decoded direct-writer scan for the deciding address, plus auxiliary cxCurApp/NewContext refs
 */

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
const TRANSPILED_GZ_PATH = `${TRANSPILED_JS_PATH}.gz`;

const MEM_SIZE = 0x1000000;
const FLAG_Z = 0x40;

const ENTRY_000578 = 0x000578;
const BODY_0158A6 = 0x0158A6;
const DUMP_END_0005C0 = 0x0005C0;
const DECIDING_ADDR = 0x00007E;

const RETURN_SENTINEL = 0x7FFFFE;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const TRACE_MAX_STEPS = 100;

const CX_CUR_APP_ADDR = 0xD007E0;
const NEWCONTEXT_WRAPPER = 0x08C79F;
const NEWCONTEXT0 = 0x08C7AD;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase235-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'nop':
      return 'NOP';
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'push':
      return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-pair':
      return `LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src === '(hl)' ? '(HL)' : inst.src).toUpperCase()}`;
    case 'xor-a':
      return 'XOR A';
    case 'or':
      return `OR ${inst.src ? String(inst.src).toUpperCase() : 'A'}`;
    case 'and':
      return `AND ${inst.src ? String(inst.src).toUpperCase() : 'A'}`;
    default:
      return inst.tag;
  }
}

function decodeSequential(romBytes, startPc, maxInstructions, endPc = null) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  while (rows.length < maxInstructions && pc < romBytes.length) {
    if (endPc !== null && pc >= (endPc & 0xFFFFFF)) break;
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      rows.push({
        pc: inst.pc >>> 0,
        bytes: bytesAt(romBytes, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        length: inst.length,
      });
      pc = inst.nextPc & 0xFFFFFF;
    } catch (error) {
      rows.push({
        pc,
        bytes: bytesAt(romBytes, pc, 1),
        text: `decode-error: ${error.message}`,
        tag: 'decode-error',
        length: 1,
      });
      pc = (pc + 1) & 0xFFFFFF;
    }
  }
  return rows;
}

function printRows(rows, annotations = new Map()) {
  for (const row of rows) {
    const note = annotations.get(row.pc) ?? '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(16)}  ${row.text}${note ? `  ${note}` : ''}`);
  }
}

function printHexDump(buffer, start, length, columns = 16) {
  for (let offset = 0; offset < length; offset += columns) {
    const addr = start + offset;
    const row = [];
    for (let i = 0; i < columns && offset + i < length; i++) {
      row.push((buffer[addr + i] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
    }
    console.log(`  ${hex(addr)}  ${row.join(' ')}`);
  }
}

function createMemoryWithRom(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function resetTraceState(cpu, mem, romBytes, initialA = 0x30) {
  mem.fill(0x00);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  cpu.a = initialA & 0xFF;
  cpu.f = 0x00;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x000000;
  cpu._a2 = 0x00;
  cpu._f2 = 0x00;
  cpu._bc2 = 0x000000;
  cpu._de2 = 0x000000;
  cpu._hl2 = 0x000000;
  cpu.sp = STACK_TOP;
  cpu.ix = 0x000000;
  cpu.iy = IY_ADDR;
  cpu.i = 0x00;
  cpu.im = 0x00;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.halted = false;
  cpu.cycles = 0;
}

function installReadTracer(cpu, traceState) {
  const original = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
  };

  cpu.read8 = (addr) => {
    const value = original.read8(addr);
    traceState.reads.push({
      kind: 'read8',
      pc: traceState.currentPc,
      step: traceState.currentStep,
      addr: addr & 0xFFFFFF,
      value: value & 0xFF,
    });
    return value;
  };

  cpu.read16 = (addr) => {
    const value = original.read16(addr);
    traceState.reads.push({
      kind: 'read16',
      pc: traceState.currentPc,
      step: traceState.currentStep,
      addr: addr & 0xFFFFFF,
      value: value & 0xFFFF,
    });
    return value;
  };

  cpu.read24 = (addr) => {
    const value = original.read24(addr);
    traceState.reads.push({
      kind: 'read24',
      pc: traceState.currentPc,
      step: traceState.currentStep,
      addr: addr & 0xFFFFFF,
      value: value & 0xFFFFFF,
    });
    return value;
  };

  return () => {
    cpu.read8 = original.read8;
    cpu.read16 = original.read16;
    cpu.read24 = original.read24;
  };
}

function runGateTrace(executor, cpu, mem, romBytes, decidingByteValue, label) {
  resetTraceState(cpu, mem, romBytes);
  mem[DECIDING_ADDR] = decidingByteValue & 0xFF;
  push24(cpu, mem, RETURN_SENTINEL);

  const traceState = {
    currentPc: ENTRY_000578,
    currentStep: -1,
    blocks: [],
    reads: [],
  };

  const restoreReads = installReadTracer(cpu, traceState);
  let result;
  try {
    result = executor.runFrom(ENTRY_000578, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: 32,
      onBlock(pc, mode, meta, steps) {
        traceState.currentPc = pc & 0xFFFFFF;
        traceState.currentStep = steps;
        traceState.blocks.push({
          step: steps,
          pc: pc & 0xFFFFFF,
          mode,
          blockId: meta?.id ?? null,
        });
      },
    });
  } finally {
    restoreReads();
  }

  const decidingRead = traceState.reads.find((read) => read.addr === DECIDING_ADDR);
  const z = (cpu.f & FLAG_Z) !== 0;

  return {
    label,
    decidingByteValue: decidingByteValue & 0xFF,
    result,
    blocks: traceState.blocks,
    reads: traceState.reads,
    decidingRead,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    z,
    retReached: result.lastPc === RETURN_SENTINEL,
  };
}

function scanRawTransfers(romBytes, target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let pc = 0; pc <= romBytes.length - 4; pc++) {
    const op = romBytes[pc] & 0xFF;
    if ((op === 0xCD || op === 0xC3) &&
        (romBytes[pc + 1] & 0xFF) === lo &&
        (romBytes[pc + 2] & 0xFF) === mid &&
        (romBytes[pc + 3] & 0xFF) === hi) {
      hits.push({
        pc,
        type: op === 0xCD ? 'CALL' : 'JP',
      });
    }
  }

  return hits;
}

function findInstructionRefs(blocks, predicate) {
  const hits = [];
  for (const block of Object.values(blocks)) {
    for (const inst of block.instructions ?? []) {
      if (!predicate(inst, block)) continue;
      hits.push({
        blockId: block.id,
        blockPc: block.startPc >>> 0,
        pc: (inst.pc ?? block.startPc) >>> 0,
        dasm: inst.dasm ?? inst.tag,
        tag: inst.tag ?? 'unknown',
      });
    }
  }
  hits.sort((left, right) => left.pc - right.pc || left.blockPc - right.blockPc);
  return hits;
}

function findDirectStores(blocks, addr) {
  const writeTags = new Set(['ld-mem-reg', 'ld-mem-pair', 'ld-mem-imm']);
  return findInstructionRefs(
    blocks,
    (inst) => inst.addr === addr && writeTags.has(inst.tag),
  );
}

function findCallsOrJps(blocks, target) {
  return findInstructionRefs(
    blocks,
    (inst) =>
      inst.target === target &&
      (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'jp' || inst.tag === 'jp-conditional'),
  );
}

function printTraceSummary(trace) {
  console.log(`  Seeded deciding byte: ${hexByte(trace.decidingByteValue)} @ ${hex(DECIDING_ADDR)}`);
  console.log('  Blocks visited:');
  for (const block of trace.blocks) {
    console.log(`    step ${String(block.step).padStart(2, ' ')}  ${hex(block.pc)} [${block.mode}]`);
  }
  console.log(`  Executor steps: ${trace.result.steps}`);
  console.log(`  Termination: ${trace.result.termination}`);
  console.log(`  Last PC: ${hex(trace.result.lastPc)}`);
  console.log(`  RET sentinel reached: ${trace.retReached ? 'yes' : 'no'}`);
  console.log(`  Final A/F: A=${hexByte(trace.finalA)} F=${hexByte(trace.finalF)} Z=${trace.z ? 1 : 0}`);
  if (trace.reads.length) {
    console.log('  Memory reads:');
    for (const read of trace.reads) {
      const valueWidth = read.kind === 'read8' ? 2 : read.kind === 'read16' ? 4 : 6;
      console.log(
        `    step ${String(read.step).padStart(2, ' ')}  ${hex(read.pc)}  ${read.kind} ${hex(read.addr)} -> ${hex(read.value, valueWidth)}`,
      );
    }
  } else {
    console.log('  Memory reads: none');
  }
  if (trace.decidingRead) {
    console.log(
      `  Deciding factor: ${hex(trace.decidingRead.addr)} == 0xFF ? Z : NZ  (observed ${hexByte(trace.decidingRead.value)})`,
    );
  } else {
    console.log('  Deciding factor: no read of the expected address was captured');
  }
}

function printSites(title, hits, limit = 20) {
  console.log(`${title}: ${hits.length}`);
  if (!hits.length) {
    console.log('  none');
    return;
  }
  for (const hit of hits.slice(0, limit)) {
    if ('type' in hit) {
      console.log(`  ${hex(hit.pc)}  ${hit.type}`);
    } else {
      console.log(`  ${hex(hit.pc)}  ${hit.dasm}`);
    }
  }
  if (hits.length > limit) {
    console.log(`  ... ${hits.length - limit} more`);
  }
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);

    const mem = createMemoryWithRom(romBytes);
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    const originalDecidingByte = romBytes[DECIDING_ADDR] & 0xFF;

    console.log('=== Phase 235: 0x000578 app-context gate probe (ooo) ===');
    console.log('');
    console.log(`ROM: ${path.basename(ROM_PATH)}`);
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz (temp import)'}`);
    console.log(`Standard runtime setup: timerInterrupt=false, MBASE=${hexByte(MBASE)}, IY=${hex(IY_ADDR)}`);
    console.log('');

    console.log('=== Part A: Static Disassembly ===');
    console.log('');
    console.log(`Hex dump ${hex(ENTRY_000578)}..${hex(DUMP_END_0005C0)} (${DUMP_END_0005C0 - ENTRY_000578} bytes):`);
    printHexDump(romBytes, ENTRY_000578, DUMP_END_0005C0 - ENTRY_000578);
    console.log('');

    const localRows = decodeSequential(romBytes, ENTRY_000578, 10, DUMP_END_0005C0);
    const localNotes = new Map([
      [ENTRY_000578, '<-- entry point, live instruction'],
    ]);
    console.log(`First ${localRows.length} sequential instructions starting at ${hex(ENTRY_000578)}:`);
    printRows(localRows, localNotes);
    console.log('  Note: instruction 1 is an unconditional JP. The remaining sequential rows are local fallthrough bytes, not the live body of 0x000578.');
    console.log('');

    const bodyRows = decodeSequential(romBytes, BODY_0158A6, 10);
    const bodyNotes = new Map([
      [BODY_0158A6, '<-- actual body reached by JP from 0x000578'],
      [DECIDING_ADDR, ''],
    ]);
    console.log(`Actual body decode at ${hex(BODY_0158A6)}:`);
    printRows(bodyRows, bodyNotes);
    console.log('');
    console.log('Manual decode of the real predicate:');
    console.log('  1. PUSH BC');
    console.log('  2. LD B,A               ; preserve caller A');
    console.log(`  3. LD A,(${hex(DECIDING_ADDR)})       ; reads ROM-backed byte in the current lift`);
    console.log('  4. CP 0xFF              ; sets Z iff byte == 0xFF');
    console.log('  5. LD A,B               ; restore caller A, flags unchanged');
    console.log('  6. POP BC');
    console.log('  7. RET                  ; caller immediately tests Z/NZ');
    console.log('');
    console.log(`Observed ROM byte at ${hex(DECIDING_ADDR)}: ${hexByte(originalDecidingByte)}`);
    console.log('');

    console.log('=== Part B: Dynamic Trace - default/home-screen Z path ===');
    console.log('');
    const defaultTrace = runGateTrace(executor, cpu, mem, romBytes, originalDecidingByte, 'default');
    printTraceSummary(defaultTrace);
    console.log('');
    console.log(`RAM deciding factor: none in the current lift. The only deciding read is ${hex(DECIDING_ADDR)}, which is in ROM space.`);
    console.log('');

    console.log('=== Part C: Dynamic Trace - forced NZ path ===');
    console.log('');
    const forcedNzTrace = runGateTrace(executor, cpu, mem, romBytes, 0x40, 'forced-nz');
    printTraceSummary(forcedNzTrace);
    console.log('');

    const thresholdValues = [0x00, 0x01, 0x40, 0xFE, 0xFF];
    const thresholdRows = [];
    for (const value of thresholdValues) {
      const trace = runGateTrace(executor, cpu, mem, romBytes, value, `threshold-${hexByte(value)}`);
      thresholdRows.push({
        value,
        z: trace.z,
        steps: trace.result.steps,
      });
    }
    console.log('Threshold map for the deciding byte:');
    for (const row of thresholdRows) {
      console.log(`  ${hexByte(row.value)}  ->  ${row.z ? 'Z' : 'NZ'}  (steps=${row.steps})`);
    }
    console.log('  Conclusion: in this lift, Z is returned only when the byte equals 0xFF; any tested non-0xFF value returns NZ.');
    console.log('');

    console.log('=== Part D: CALL/JP cross-reference ===');
    console.log('');
    const callers000578 = scanRawTransfers(romBytes, ENTRY_000578);
    const callers0158A6 = scanRawTransfers(romBytes, BODY_0158A6);
    printSites(`Raw CALL/JP sites to ${hex(ENTRY_000578)} (first 20)`, callers000578, 20);
    console.log('');
    printSites(`Raw CALL/JP sites to ${hex(BODY_0158A6)} (actual body; first 20)`, callers0158A6, 20);
    console.log('');
    console.log('  Trampoline note: 0x000578 is not the predicate body. Some callers target 0x0158A6 directly, bypassing the stub.');
    console.log('');

    console.log('=== Part E: What sets the context? ===');
    console.log('');
    const decidingAddrDirectStores = findDirectStores(blocks, DECIDING_ADDR);
    printSites(`Decoded direct writers to ${hex(DECIDING_ADDR)}`, decidingAddrDirectStores, 20);
    console.log('');

    const cxCurAppStores = findDirectStores(blocks, CX_CUR_APP_ADDR);
    const newContextCalls = findCallsOrJps(blocks, NEWCONTEXT_WRAPPER);
    const newContext0Calls = findCallsOrJps(blocks, NEWCONTEXT0);

    console.log(`Auxiliary active-app context cross-reference (cxCurApp = ${hex(CX_CUR_APP_ADDR)}):`);
    printSites(`  Decoded direct writers to ${hex(CX_CUR_APP_ADDR)}`, cxCurAppStores, 20);
    console.log('');
    printSites(`  CALL/JP sites to ${hex(NEWCONTEXT_WRAPPER)} (NewContext wrapper)`, newContextCalls, 20);
    console.log('');
    printSites(`  CALL/JP sites to ${hex(NEWCONTEXT0)} (NewContext0 body)`, newContext0Calls, 20);
    console.log('');
    console.log('Interpretation:');
    console.log(`  - 0x000578 itself is a stub; the lifted predicate at ${hex(BODY_0158A6)} only checks ${hex(DECIDING_ADDR)} against 0xFF.`);
    console.log(`  - There are no decoded direct writers to ${hex(DECIDING_ADDR)}, so the lift exposes no RAM-backed "app context" setter for this gate.`);
    console.log(`  - The broader OS app-context machinery still appears to center on cxCurApp (${hex(CX_CUR_APP_ADDR)}) and NewContext-style calls, but 0x000578 does not consult cxCurApp in the current model.`);
    console.log('');

    console.log('=== Bottom Line ===');
    console.log('');
    console.log(`0x000578 -> JP ${hex(BODY_0158A6)}.`);
    console.log(`The live predicate is: read ${hex(DECIDING_ADDR)}, compare with 0xFF, return with Z iff equal.`);
    console.log(`In this transpilation the deciding location is ROM-backed ${hex(DECIDING_ADDR)}, not RAM.`);
    console.log(`If you force ${hex(DECIDING_ADDR)} away from 0xFF (for example 0x40), the callers see NZ and the descriptor path can proceed.`);
    console.log(`If you want the real OS app-registration path, the relevant state elsewhere is cxCurApp/NewContext, not the lifted ${hex(ENTRY_000578)} gate itself.`);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

await main();
