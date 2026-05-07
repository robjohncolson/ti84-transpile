#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
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
      : 'ROM.transpiled.js is missing.'
  );
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');
const BLOCKS = Array.isArray(PRELIFTED_BLOCKS)
  ? Object.fromEntries(PRELIFTED_BLOCKS.filter((block) => block?.id).map((block) => [block.id, block]))
  : (PRELIFTED_BLOCKS ?? {});
const rom = readFileSync(romPath);

const TARGET = 0x061290;
const SET4_PATH = 0x0612B0;
const TRACE_INPUT_A = 0x03;
const TRACE_MAX_STEPS = 50;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const MBASE = 0xD0;
const TEXT_FLAGS_ADDR = IY_ADDR + 0x05;

const FLAG_C = 0x01;
const FLAG_PV = 0x04;
const FLAG_Z = 0x40;
const FLAG_S = 0x80;

const EXACT_PATTERNS = [
  { key: 'call_lil', label: 'CALL.LIL 0x061290', bytes: [0xCD, 0x90, 0x12, 0x06], transferType: 'call' },
  { key: 'jp_lil', label: 'JP.LIL 0x061290', bytes: [0xC3, 0x90, 0x12, 0x06], transferType: 'jp' },
  { key: 'call_sis', label: 'CALL.SIS 0x1290', bytes: [0xCD, 0x90, 0x12], transferType: 'call' },
  { key: 'jp_sis', label: 'JP.SIS 0x1290', bytes: [0xC3, 0x90, 0x12], transferType: 'jp' },
];

const DIRECT24 = new Map([
  [0xCD, { mnemonic: 'CALL', transferType: 'call', condition: null }],
  [0xC3, { mnemonic: 'JP', transferType: 'jp', condition: null }],
  [0xCC, { mnemonic: 'CALL Z', transferType: 'call', condition: 'z' }],
  [0xC4, { mnemonic: 'CALL NZ', transferType: 'call', condition: 'nz' }],
  [0xDC, { mnemonic: 'CALL C', transferType: 'call', condition: 'c' }],
  [0xD4, { mnemonic: 'CALL NC', transferType: 'call', condition: 'nc' }],
  [0xEC, { mnemonic: 'CALL PE', transferType: 'call', condition: 'pe' }],
  [0xE4, { mnemonic: 'CALL PO', transferType: 'call', condition: 'po' }],
  [0xFC, { mnemonic: 'CALL M', transferType: 'call', condition: 'm' }],
  [0xF4, { mnemonic: 'CALL P', transferType: 'call', condition: 'p' }],
  [0xCA, { mnemonic: 'JP Z', transferType: 'jp', condition: 'z' }],
  [0xC2, { mnemonic: 'JP NZ', transferType: 'jp', condition: 'nz' }],
  [0xDA, { mnemonic: 'JP C', transferType: 'jp', condition: 'c' }],
  [0xD2, { mnemonic: 'JP NC', transferType: 'jp', condition: 'nc' }],
  [0xEA, { mnemonic: 'JP PE', transferType: 'jp', condition: 'pe' }],
  [0xE2, { mnemonic: 'JP PO', transferType: 'jp', condition: 'po' }],
  [0xFA, { mnemonic: 'JP M', transferType: 'jp', condition: 'm' }],
  [0xF2, { mnemonic: 'JP P', transferType: 'jp', condition: 'p' }],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function contextWindow(buffer, addr, matchLength, radius = 16) {
  const beforeStart = Math.max(0, addr - radius);
  const before = bytesAt(buffer, beforeStart, addr - beforeStart);
  const match = bytesAt(buffer, addr, matchLength);
  const afterStart = Math.min(buffer.length, addr + matchLength);
  const after = bytesAt(buffer, afterStart, Math.min(radius, buffer.length - afterStart));
  return { before, match, after };
}

function regionLabel(addr) {
  if (addr < 0x050000) return 'OS core';
  if (addr < 0x070000) return 'editor';
  if (addr < 0x0A0000) return 'FP/math';
  return 'apps';
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
    };
  }
}

function effectiveAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'nop':
      return `${prefix}NOP`;
    default: {
      const resolved = effectiveAddr(inst);
      const extra = typeof resolved === 'number' ? ` addr=${hex(resolved)}` : '';
      return `${prefix}[${inst.tag}]${extra}`;
    }
  }
}

function hardTerminator(inst) {
  return Boolean(inst) && ['ret', 'reti', 'retn', 'jp', 'jr', 'halt', 'slp'].includes(inst.tag);
}

function reachesLinear(start, target, limit = 0x100) {
  if (start === target) return true;
  let pc = start;
  const end = Math.min(rom.length, start + limit);

  while (pc < target && pc < end) {
    const inst = decodeSafe(pc);
    if (inst.tag === 'decode-error') return false;
    pc += Math.max(1, inst.length ?? 1);
  }

  return pc === target;
}

function inferEntry(target, lookback = 0x100) {
  const floor = Math.max(0, target - lookback);

  for (let addr = target - 1; addr >= floor; addr -= 1) {
    const inst = decodeSafe(addr);
    const next = addr + Math.max(1, inst.length ?? 1);
    if (next > target || !hardTerminator(inst) || !reachesLinear(next, target)) continue;
    return {
      entry: next,
      boundaryPc: addr,
      boundaryTag: inst.tag,
    };
  }

  return {
    entry: target,
    boundaryPc: null,
    boundaryTag: null,
  };
}

function makeContextRecord(addr, length) {
  const window = contextWindow(rom, addr, length, 16);
  return {
    before16: window.before,
    match: window.match,
    after16: window.after,
  };
}

function scanExactPattern(pattern) {
  const hits = [];

  for (let addr = 0; addr <= rom.length - pattern.bytes.length; addr += 1) {
    let matched = true;
    for (let index = 0; index < pattern.bytes.length; index += 1) {
      if (rom[addr + index] !== pattern.bytes[index]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    hits.push({
      addr,
      key: pattern.key,
      label: pattern.label,
      transferType: pattern.transferType,
      length: pattern.bytes.length,
      region: regionLabel(addr),
      bytes: bytesAt(rom, addr, pattern.bytes.length),
      ...makeContextRecord(addr, pattern.bytes.length),
    });
  }

  return hits;
}

function describeRawReference(addr) {
  const leadAddr = addr - 1;
  if (leadAddr >= 0 && DIRECT24.has(rom[leadAddr])) {
    const inst = decodeSafe(leadAddr);
    return {
      relation: 'embedded-direct-transfer',
      instructionAddr: leadAddr,
      instruction: inst.tag === 'decode-error' ? DIRECT24.get(rom[leadAddr]).mnemonic : formatInstruction(inst),
    };
  }

  if (leadAddr >= 0 && [0x21, 0x11, 0x01, 0x31].includes(rom[leadAddr])) {
    const inst = decodeSafe(leadAddr);
    return {
      relation: 'embedded-immediate-load',
      instructionAddr: leadAddr,
      instruction: inst.tag === 'decode-error' ? `opcode ${hexByte(rom[leadAddr])}` : formatInstruction(inst),
    };
  }

  return {
    relation: 'raw-address-bytes',
    instructionAddr: null,
    instruction: null,
  };
}

function scanRawAddressRefs() {
  const bytes = [0x90, 0x12, 0x06];
  const hits = [];

  for (let addr = 0; addr <= rom.length - bytes.length; addr += 1) {
    if (rom[addr] !== bytes[0] || rom[addr + 1] !== bytes[1] || rom[addr + 2] !== bytes[2]) continue;
    const detail = describeRawReference(addr);
    hits.push({
      addr,
      label: 'Raw 24-bit address bytes 90 12 06',
      length: bytes.length,
      region: regionLabel(addr),
      bytes: bytesAt(rom, addr, bytes.length),
      ...makeContextRecord(addr, bytes.length),
      ...detail,
    });
  }

  return hits;
}

function scanDirectTransfers24() {
  const lo = TARGET & 0xFF;
  const mid = (TARGET >>> 8) & 0xFF;
  const hi = (TARGET >>> 16) & 0xFF;
  const hits = [];

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const meta = DIRECT24.get(rom[addr]);
    if (!meta || rom[addr + 1] !== lo || rom[addr + 2] !== mid || rom[addr + 3] !== hi) continue;
    const decoded = decodeSafe(addr);
    const entry = inferEntry(addr);
    hits.push({
      addr,
      label: meta.mnemonic,
      transferType: meta.transferType,
      condition: meta.condition,
      length: 4,
      region: regionLabel(addr),
      bytes: bytesAt(rom, addr, 4),
      decoded: decoded.tag === 'decode-error' ? meta.mnemonic : formatInstruction(decoded),
      functionEntry: entry.entry,
      boundaryPc: entry.boundaryPc,
      boundaryTag: entry.boundaryTag,
      ...makeContextRecord(addr, 4),
    });
  }

  return hits;
}

function blockKey(addr, mode = 'adl') {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
}

function dedupeHitsByAddr(hits) {
  const seen = new Set();
  const out = [];

  for (const hit of hits) {
    const key = `${hit.addr}:${hit.transferType}:${hit.condition ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }

  return out.sort((left, right) => left.addr - right.addr);
}

function buildSyntheticTransferBlock(hit) {
  const nextPc = (hit.addr + hit.length) & 0xFFFFFF;
  const targetLiteral = `0x${TARGET.toString(16)}`;
  const nextPcLiteral = `0x${nextPc.toString(16)}`;
  const key = blockKey(hit.addr, 'adl');
  const exits = [{ type: hit.transferType === 'call' ? 'call' : 'jump', target: TARGET, targetMode: 'adl' }];

  let body = '';
  if (hit.condition) {
    exits.push({ type: 'fallthrough', target: nextPc, targetMode: 'adl' });
    if (hit.transferType === 'call') {
      body = `if (cpu.checkCondition(${JSON.stringify(hit.condition)})) { cpu.push(${nextPcLiteral}); return ${targetLiteral}; } return ${nextPcLiteral};`;
    } else {
      body = `if (cpu.checkCondition(${JSON.stringify(hit.condition)})) { return ${targetLiteral}; } return ${nextPcLiteral};`;
    }
  } else if (hit.transferType === 'call') {
    body = `cpu.push(${nextPcLiteral}); return ${targetLiteral};`;
  } else {
    body = `return ${targetLiteral};`;
  }

  return {
    id: key,
    exits,
    source: `function synthetic_transfer_${hit.addr.toString(16)}(cpu) { ${body} }`,
  };
}

function createTraceRuntime(traceHits) {
  const syntheticBlocks = Object.fromEntries(traceHits.map((hit) => [blockKey(hit.addr, 'adl'), buildSyntheticTransferBlock(hit)]));
  const traceBlocks = { ...BLOCKS, ...syntheticBlocks };
  const baselineMemory = new Uint8Array(MEM_SIZE);
  baselineMemory.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
  const memory = new Uint8Array(baselineMemory);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(traceBlocks, memory, { peripherals });
  return {
    baselineMemory,
    memory,
    executor,
    cpu: executor.cpu,
  };
}

function conditionSummary(condition) {
  if (!condition) return null;
  switch (condition) {
    case 'z':
      return { flag: 'Z', taken: 'set' };
    case 'nz':
      return { flag: 'Z', taken: 'clear' };
    case 'c':
      return { flag: 'C', taken: 'set' };
    case 'nc':
      return { flag: 'C', taken: 'clear' };
    case 'pe':
      return { flag: 'PV', taken: 'set' };
    case 'po':
      return { flag: 'PV', taken: 'clear' };
    case 'm':
      return { flag: 'S', taken: 'set' };
    case 'p':
      return { flag: 'S', taken: 'clear' };
    default:
      return { flag: condition, taken: 'seeded' };
  }
}

function seedTakenFlags(cpu, condition) {
  cpu.f = 0x00;
  switch (condition) {
    case 'z':
      cpu.f |= FLAG_Z;
      break;
    case 'c':
      cpu.f |= FLAG_C;
      break;
    case 'pe':
      cpu.f |= FLAG_PV;
      break;
    case 'm':
      cpu.f |= FLAG_S;
      break;
    default:
      break;
  }
}

function prepareTraceState(runtime, hit) {
  runtime.memory.set(runtime.baselineMemory);
  const { cpu } = runtime;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = TRACE_INPUT_A;
  cpu.f = 0x00;
  cpu.sp = STACK_TOP;
  runtime.memory.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(runtime.memory.length, STACK_TOP + 0x20));
  runtime.memory[TEXT_FLAGS_ADDR] = 0x00;
  seedTakenFlags(cpu, hit.condition);
}

function traceTransferHit(runtime, hit) {
  prepareTraceState(runtime, hit);

  const visited = [];
  let result = null;
  let termination = 'max_steps';
  let stopStep = 0;
  let errorMessage = null;

  try {
    result = runtime.executor.runFrom(hit.addr, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: 256,
      onBlock(pc, mode, _meta, step) {
        visited.push(`${hex(pc)}:${mode}`);
        if ((pc & 0xFFFFFF) === SET4_PATH) {
          stopStep = step + 1;
          throw new Error('__TRACE_DONE__');
        }
      },
      onMissingBlock(pc, mode, step) {
        visited.push(`MISSING:${hex(pc)}:${mode}`);
        if ((pc & 0xFFFFFF) === SET4_PATH) {
          stopStep = step + 1;
          throw new Error('__TRACE_DONE__');
        }
      },
    });
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__TRACE_DONE__') {
      termination = 'reached_set4_path';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  const iyPlus5After = runtime.memory[TEXT_FLAGS_ADDR] & 0xFF;
  const conditionSeed = conditionSummary(hit.condition);

  return {
    addr: hex(hit.addr),
    instruction: hit.decoded ?? hit.label,
    transferType: hit.transferType,
    condition: hit.condition ?? null,
    seededCondition: conditionSeed,
    inputA: hexByte(TRACE_INPUT_A),
    stepsTaken: result?.steps ?? stopStep,
    termination,
    errorMessage,
    reachedDispatcher: visited.some((entry) => entry.startsWith(`${hex(TARGET)}:`)),
    reachedSet4Path: visited.some((entry) => entry.startsWith(`${hex(SET4_PATH)}:`)),
    iyPlus5Before: hexByte(0x00),
    iyPlus5After: hexByte(iyPlus5After),
    bit4SetAfter: (iyPlus5After & 0x10) !== 0,
    visitedBlocks: visited,
    note: hit.condition
      ? 'Condition flags were seeded taken because this probe starts at the transfer instruction itself.'
      : null,
  };
}

function printExactPatternGroup(pattern, hits) {
  console.log(`--- ${pattern.label} (${hits.length}) ---`);
  if (hits.length === 0) {
    console.log('  none');
    console.log();
    return;
  }

  for (const hit of hits) {
    console.log(`  ${hex(hit.addr)}  ${hit.region}`);
    console.log(`    bytes:    ${hit.bytes}`);
    console.log(`    before16: ${hit.before16 || '(none)'}`);
    console.log(`    match:    ${hit.match}`);
    console.log(`    after16:  ${hit.after16 || '(none)'}`);
  }
  console.log();
}

function printRawRefGroup(hits) {
  console.log(`--- Raw address references 90 12 06 (${hits.length}) ---`);
  if (hits.length === 0) {
    console.log('  none');
    console.log();
    return;
  }

  for (const hit of hits) {
    console.log(`  ${hex(hit.addr)}  ${hit.region}`);
    if (hit.instructionAddr !== null) {
      console.log(`    relation: ${hit.relation} at ${hex(hit.instructionAddr)} -> ${hit.instruction}`);
    } else {
      console.log(`    relation: ${hit.relation}`);
    }
    console.log(`    bytes:    ${hit.bytes}`);
    console.log(`    before16: ${hit.before16 || '(none)'}`);
    console.log(`    match:    ${hit.match}`);
    console.log(`    after16:  ${hit.after16 || '(none)'}`);
  }
  console.log();
}

function printDecodedTransferGroup(hits) {
  console.log(`--- Supplemental decoded direct transfers to ${hex(TARGET)} (${hits.length}) ---`);
  if (hits.length === 0) {
    console.log('  none');
    console.log();
    return;
  }

  for (const hit of hits) {
    console.log(`  ${hex(hit.addr)}  ${hit.decoded}`);
    console.log(`    region:   ${hit.region}`);
    console.log(`    entry:    ${hex(hit.functionEntry)}${hit.boundaryPc !== null ? ` via ${String(hit.boundaryTag).toUpperCase()} at ${hex(hit.boundaryPc)}` : ''}`);
    console.log(`    bytes:    ${hit.bytes}`);
    console.log(`    before16: ${hit.before16 || '(none)'}`);
    console.log(`    match:    ${hit.match}`);
    console.log(`    after16:  ${hit.after16 || '(none)'}`);
  }
  console.log();
}

function printDynamicTraceGroup(traces, exactCallCount) {
  console.log('=== Part C: Dynamic trace ===');
  console.log();
  if (traces.length === 0) {
    console.log('No direct transfer sites were available for dynamic tracing.');
    console.log();
    return;
  }

  if (exactCallCount === 0) {
    console.log('No exact CALL sites matched the requested byte patterns; the traces below are supplemental direct-transfer traces.');
    console.log();
  }

  for (const trace of traces) {
    console.log(JSON.stringify(trace, null, 2));
    console.log();
  }
}

function main() {
  const exactHits = new Map(EXACT_PATTERNS.map((pattern) => [pattern.key, scanExactPattern(pattern)]));
  const rawRefs = scanRawAddressRefs();
  const directTransfers24 = dedupeHitsByAddr(scanDirectTransfers24());
  const exactCallCount = (exactHits.get('call_lil')?.length ?? 0) + (exactHits.get('call_sis')?.length ?? 0);

  const traceHits = directTransfers24;
  const traces = [];
  if (traceHits.length > 0) {
    const runtime = createTraceRuntime(traceHits);
    for (const hit of traceHits) {
      traces.push(traceTransferHit(runtime, hit));
    }
  }

  console.log(`=== Phase 214: Dispatcher caller probe for ${hex(TARGET)} ===`);
  console.log();
  console.log(`ROM size: ${rom.length} bytes`);
  console.log(`Dispatcher target: ${hex(TARGET)}`);
  console.log(`SET 4 path: ${hex(SET4_PATH)}`);
  console.log(`Dynamic input A: ${hexByte(TRACE_INPUT_A)}`);
  console.log('Timer interrupt: disabled');
  console.log();

  console.log('=== Part A: Requested exact byte-pattern scan ===');
  console.log();
  for (const pattern of EXACT_PATTERNS) {
    printExactPatternGroup(pattern, exactHits.get(pattern.key) ?? []);
  }
  printRawRefGroup(rawRefs);

  console.log('=== Part B: Supplemental direct-transfer interpretation ===');
  console.log();
  console.log('This extra pass scans all 24-bit direct CALL/JP opcodes to the dispatcher target so raw address hits can be explained.');
  console.log();
  printDecodedTransferGroup(directTransfers24);

  printDynamicTraceGroup(traces, exactCallCount);

  const summary = {
    probe: 'probe-phase214-dispatcher-callers.mjs',
    generatedAt: new Date().toISOString(),
    target: hex(TARGET),
    set4Path: hex(SET4_PATH),
    exactPatternCounts: Object.fromEntries(EXACT_PATTERNS.map((pattern) => [pattern.key, exactHits.get(pattern.key)?.length ?? 0])),
    rawAddressRefs: rawRefs.map((hit) => ({
      addr: hex(hit.addr),
      region: hit.region,
      relation: hit.relation,
      instructionAddr: hex(hit.instructionAddr),
      instruction: hit.instruction,
    })),
    decodedDirectTransfers: directTransfers24.map((hit) => ({
      addr: hex(hit.addr),
      decoded: hit.decoded,
      region: hit.region,
      functionEntry: hex(hit.functionEntry),
    })),
    dynamicTraces: traces.map((trace) => ({
      addr: trace.addr,
      instruction: trace.instruction,
      reachedDispatcher: trace.reachedDispatcher,
      reachedSet4Path: trace.reachedSet4Path,
      bit4SetAfter: trace.bit4SetAfter,
      termination: trace.termination,
    })),
    conclusion: exactCallCount === 0 && directTransfers24.length > 0
      ? `No exact CALL sites to ${hex(TARGET)} were found. The only direct transfer hit is ${directTransfers24[0].decoded} at ${hex(directTransfers24[0].addr)} in the ${directTransfers24[0].region} region.`
      : exactCallCount === 0
        ? `No direct CALL or JP sites to ${hex(TARGET)} were found in the requested scans.`
        : `Direct CALL sites to ${hex(TARGET)} were found in the requested scans.`,
  };

  console.log('=== Summary JSON ===');
  console.log();
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase214-dispatcher-callers.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
