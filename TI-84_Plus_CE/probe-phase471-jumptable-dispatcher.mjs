#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TABLE_BASE = 0x020104;
const TABLE_END = 0x02230c;
const TABLE_ENTRY_COUNT = 2178;
const SIGNATURE_ADDR = 0x020100;
const HOME_INIT = 0x08bf22;

const STACK_RESET_TOP = 0xd1a87e;
const MEM_SIZE = 0x1000000;

const IMM24_OPS = new Map([
  [0x01, 'LD BC,nnn'],
  [0x11, 'LD DE,nnn'],
  [0x21, 'LD HL,nnn'],
  [0x31, 'LD SP,nnn'],
  [0x2a, 'LD HL,(nnn)'],
  [0x22, 'LD (nnn),HL'],
  [0x3a, 'LD A,(nnn)'],
  [0x32, 'LD (nnn),A'],
  [0xc2, 'JP NZ,nnn'],
  [0xc3, 'JP nnn'],
  [0xc4, 'CALL NZ,nnn'],
  [0xca, 'JP Z,nnn'],
  [0xcc, 'CALL Z,nnn'],
  [0xcd, 'CALL nnn'],
  [0xd2, 'JP NC,nnn'],
  [0xd4, 'CALL NC,nnn'],
  [0xda, 'JP C,nnn'],
  [0xdc, 'CALL C,nnn'],
  [0xe2, 'JP PO,nnn'],
  [0xe4, 'CALL PO,nnn'],
  [0xea, 'JP PE,nnn'],
  [0xec, 'CALL PE,nnn'],
  [0xf2, 'JP P,nnn'],
  [0xf4, 'CALL P,nnn'],
  [0xfa, 'JP M,nnn'],
  [0xfc, 'CALL M,nnn'],
]);

const PREFIXED_IMM24_OPS = new Map([
  [0x21, 'LD {prefix},nnn'],
  [0x2a, 'LD {prefix},(nnn)'],
  [0x22, 'LD (nnn),{prefix}'],
]);

await main();

async function main() {
  console.log('=== Phase 471: Jump table dispatcher probe ===');
  console.log(`ROM size: ${hex(rom.length, 6)} bytes`);
  console.log(`Syscall table: ${hex(TABLE_BASE)}..${hex(TABLE_END - 1)} (${TABLE_ENTRY_COUNT} entries, end-exclusive ${hex(TABLE_END)})`);
  console.log(`Known entry #1614: ${hex(entryAddress(1614))} -> expected JP 0x08BF22`);
  console.log(`Known entry #1645: ${hex(entryAddress(1645))} -> expected JP 0x030078`);

  const tableRefs = strategyImmediateSequence(
    'Strategy 1: References to table base 0x020104',
    [0x04, 0x01, 0x02],
    TABLE_BASE,
  );

  const signatureRefs = strategyImmediateSequence(
    'Strategy 2: References to signature address 0x020100',
    [0x00, 0x01, 0x02],
    SIGNATURE_ADDR,
  );

  const multiplyCandidates = strategyMultiplyByFourNearJpHl();
  let traceHits = [];
  try {
    traceHits = await strategyBootTrace();
  } catch (error) {
    console.log('=== Strategy 4: Boot trace ===');
    console.log(`  Failed: ${error && error.stack ? error.stack : error}`);
  }
  const tableLoads = strategyLdHlFromTableRange();

  // Strategy 6: The "ED 66 04 01 02" pattern is PEA IX+4 + LD BC,2, NOT a table ref.
  // The actual CALL targets after these patterns are the real dispatchers.
  strategyPeaPatternDispatchers();

  // Strategy 7: Decode the dispatcher functions at 0x015349 and 0x0003F0
  strategyDecodeDispatchers();

  // Strategy 8: Decode the signature validator + boot jump at 0x0008B7
  strategyBootJump();

  // Strategy 9: Decode the LD HL,(0x020105) function at 0x0008C8
  strategyTableAccessFunction();

  console.log('=== Summary ===');
  console.log(`  Strategy 1 table-base references: ${tableRefs.length}`);
  console.log(`  Strategy 2 signature-address references: ${signatureRefs.length}`);
  console.log(`  Strategy 3 multiply-by-4 / JP (HL) candidates: ${multiplyCandidates.length}`);
  console.log(`  Strategy 4 table PC hits after home-init entry: ${traceHits.length}`);
  console.log(`  Strategy 5 LD HL,(table address) candidates: ${tableLoads.length}`);

  if (traceHits.length > 0) {
    console.log('  Dispatcher candidate: use the preceding block(s) shown in Strategy 4.');
  } else if (multiplyCandidates.length > 0) {
    console.log('  Dispatcher candidate: inspect the Strategy 3 multiply-by-4 / JP (HL) blocks first.');
  } else if (tableRefs.length > 0 || signatureRefs.length > 0 || tableLoads.length > 0) {
    console.log('  Dispatcher candidate: inspect the immediate-reference and LD HL,(addr) hits above.');
  } else {
    console.log('  No dispatcher candidate was identified by these probes.');
  }
}

function strategyImmediateSequence(title, sequence, expectedAddress) {
  console.log(`=== ${title} ===`);
  const hits = findSequence(sequence);
  if (hits.length === 0) {
    console.log('  No occurrences found.');
    return hits;
  }

  hits.forEach((addr, index) => {
    console.log(`  #${index + 1} sequence at ${hex(addr)} (${describeAddressDistance(addr, expectedAddress)})`);
    console.log(`    Raw: ${formatByteWindowAround(addr, sequence.length, 16, 16)}`);

    const starts = possibleImmediateInstructionStarts(addr);
    if (starts.length === 0) {
      console.log('    Decode: no obvious 24-bit immediate instruction starts immediately before this sequence.');
      return;
    }

    starts.forEach((start) => {
      console.log(`    Possible immediate instruction at ${hex(start)}:`);
      decodeRange(start, Math.min(rom.length, start + 32), 8);
    });
  });

  return hits;
}

function strategyMultiplyByFourNearJpHl() {
  console.log('=== Strategy 3: Multiply-by-4 patterns near JP (HL) ===');
  const findings = [];
  const seen = new Set();

  for (let jp = 0; jp < rom.length; jp++) {
    if (rom[jp] !== 0xe9) continue;

    const start = Math.max(0, jp - 32);
    for (let first = start; first < jp; first++) {
      if (rom[first] !== 0x29) continue;

      for (let second = first + 1; second < jp && second <= first + 8; second++) {
        if (rom[second] !== 0x29) continue;
        if (jp - second > 16) continue;

        const key = `add:${first}:${second}:${jp}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          kind: 'ADD HL,HL + ADD HL,HL near JP (HL)',
          start: first,
          end: jp,
          highlights: [[first, first + 1], [second, second + 1], [jp, jp + 1]],
          decodeStart: Math.max(0, first - 8),
        });
      }
    }
  }

  for (let sla = 0; sla < rom.length - 1; sla++) {
    if (rom[sla] !== 0xcb || rom[sla + 1] !== 0x25) continue;

    const start = Math.max(0, sla - 16);
    const end = Math.min(rom.length - 1, sla + 24);
    for (let jp = start; jp <= end; jp++) {
      if (rom[jp] !== 0xe9) continue;

      const key = `sla:${sla}:${jp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        kind: 'SLA L near JP (HL)',
        start: Math.min(sla, jp),
        end: Math.max(sla + 1, jp),
        highlights: [[sla, sla + 2], [jp, jp + 1]],
        decodeStart: Math.max(0, Math.min(sla, jp) - 8),
      });
    }
  }

  if (findings.length === 0) {
    console.log('  No ADD HL,HL x2 or SLA L candidates found near JP (HL).');
    return findings;
  }

  findings.forEach((finding, index) => {
    const contextStart = Math.max(0, finding.start - 16);
    const contextEnd = Math.min(rom.length, finding.end + 17);
    console.log(`  #${index + 1} ${finding.kind}`);
    console.log(`    Raw: ${formatByteWindow(contextStart, contextEnd, finding.highlights)}`);
    console.log(`    Decode from ${hex(finding.decodeStart)}:`);
    decodeRange(finding.decodeStart, contextEnd, 14);
  });

  return findings;
}

async function strategyBootTrace() {
  console.log('=== Strategy 4: Boot trace ===');
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;
  if (!BLOCKS) {
    throw new Error('ROM.transpiled.js did not export PRELIFTED_BLOCKS');
  }

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('  Stage 1a: boot entry 0x000000, z80');
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  console.log('  Stage 1b: kernel init 0x08C331, adl');
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  executor.runFrom(0x08c331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

  console.log('  Stage 1c: post-init 0x0802B2, adl');
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802b2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

  console.log(`  Stage 2: home screen init ${hex(HOME_INIT)}, adl, maxSteps=100000`);
  const trace = createBlockTrace('home-init');
  executor.runFrom(HOME_INIT, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
    onBlock: trace.onBlock,
  });

  console.log(`  Observed block callbacks: ${trace.count}`);
  if (trace.hits.length === 0) {
    console.log(`  No block PC landed in syscall table range ${hex(TABLE_BASE)}..${hex(TABLE_END - 1)}.`);
    return trace.hits;
  }

  trace.hits.forEach((hit, index) => {
    console.log(`  #${index + 1} table PC hit: ${hex(hit.pc)} ${describeTableEntry(hit.pc)}`);
    if (hit.mode) {
      console.log(`    Mode: ${hit.mode}`);
    }
    if (hit.previous) {
      console.log(`    Preceding block: ${hex(hit.previous.pc)}${hit.previous.mode ? ` (${hit.previous.mode})` : ''}`);
    } else {
      console.log('    Preceding block: unavailable');
    }

    if (hit.recent.length > 0) {
      console.log(`    Recent trace: ${hit.recent.map((entry) => hex(entry.pc)).join(' -> ')}`);
    }

    if (isRomOffset(hit.pc)) {
      console.log('    Jump table entry decode:');
      decodeRange(hit.pc, Math.min(rom.length, hit.pc + 4), 1);
    }

    if (hit.previous && isRomOffset(hit.previous.pc)) {
      const contextStart = Math.max(0, hit.previous.pc - 16);
      const contextEnd = Math.min(rom.length, hit.previous.pc + 64);
      console.log('    Dispatcher candidate raw bytes:');
      console.log(`      ${formatByteWindow(contextStart, contextEnd, [[hit.previous.pc, hit.previous.pc + 1]])}`);
      console.log('    Dispatcher candidate manual decode:');
      decodeRange(hit.previous.pc, contextEnd, 18);
    }
  });

  return trace.hits;
}

function strategyLdHlFromTableRange() {
  console.log('=== Strategy 5: LD HL,(addr) where addr is inside the table range ===');
  const findings = [];

  for (let pc = 0; pc <= rom.length - 4; pc++) {
    if (rom[pc] !== 0x2a) continue;
    const addr = readU24(pc + 1);
    if (!isTableAddress(addr)) continue;
    findings.push({ pc, addr, kind: 'LD HL,(nnn)' });
  }

  for (let pc = 0; pc <= rom.length - 5; pc++) {
    if (rom[pc] !== 0xed || rom[pc + 1] !== 0x6b) continue;
    const addr = readU24(pc + 2);
    if (!isTableAddress(addr)) continue;
    findings.push({ pc, addr, kind: 'ED 6B LD HL,(nnn)-style load' });
  }

  if (findings.length === 0) {
    console.log('  No LD HL,(addr) candidates found with addr inside the table range.');
    return findings;
  }

  findings.forEach((finding, index) => {
    console.log(`  #${index + 1} ${finding.kind} at ${hex(finding.pc)} loads from ${hex(finding.addr)} ${describeTableEntry(finding.addr)}`);
    console.log(`    Raw: ${formatByteWindowAround(finding.pc, finding.kind.startsWith('ED') ? 5 : 4, 16, 16)}`);
    console.log('    Manual decode:');
    decodeRange(finding.pc, Math.min(rom.length, finding.pc + 32), 8);
  });

  return findings;
}

function createBlockTrace(label) {
  const hits = [];
  const recent = [];
  let count = 0;
  let previous = null;

  function onBlock(...args) {
    const pc = extractPc(args);
    if (pc == null) return;

    const entry = {
      pc,
      mode: extractMode(args),
      label,
    };

    count += 1;
    if (isTableAddress(pc)) {
      hits.push({
        pc,
        mode: entry.mode,
        previous,
        recent: recent.slice(-12),
      });
      console.log(`  [${label}] table PC hit ${hex(pc)} after ${previous ? hex(previous.pc) : 'unknown previous block'}`);
    }

    recent.push(entry);
    if (recent.length > 32) recent.shift();
    previous = entry;
  }

  return {
    hits,
    onBlock,
    get count() {
      return count;
    },
  };
}

function extractPc(args) {
  for (const arg of args) {
    const pc = extractPcFromValue(arg);
    if (pc != null) return pc;
  }
  return null;
}

function extractPcFromValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value & 0xffffff;
  }
  if (!value || typeof value !== 'object') return null;

  for (const key of ['pc', 'addr', 'address', 'start', 'startPc', 'entry', 'entryPc', 'blockPc', 'blockStart']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) {
      return value[key] & 0xffffff;
    }
  }

  for (const key of ['block', 'cpu', 'state']) {
    const nested = extractPcFromValue(value[key]);
    if (nested != null) return nested;
  }

  return null;
}

function extractMode(args) {
  for (const arg of args) {
    if (typeof arg === 'string') return arg;
    if (!arg || typeof arg !== 'object') continue;
    if (typeof arg.mode === 'string') return arg.mode;
    if (typeof arg.cpuMode === 'string') return arg.cpuMode;
    if (typeof arg.isAdl === 'boolean') return arg.isAdl ? 'adl' : 'z80';
  }
  return '';
}

function findSequence(sequence) {
  const hits = [];
  const limit = rom.length - sequence.length;
  for (let pc = 0; pc <= limit; pc++) {
    let matched = true;
    for (let offset = 0; offset < sequence.length; offset++) {
      if (rom[pc + offset] !== sequence[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(pc);
  }
  return hits;
}

function possibleImmediateInstructionStarts(immediateAddress) {
  const starts = [];
  const opPc = immediateAddress - 1;
  if (opPc >= 0 && IMM24_OPS.has(rom[opPc])) {
    starts.push(opPc);
  }

  const prefixedPc = immediateAddress - 2;
  if (prefixedPc >= 0 && (rom[prefixedPc] === 0xdd || rom[prefixedPc] === 0xfd)) {
    const op = rom[prefixedPc + 1];
    if (PREFIXED_IMM24_OPS.has(op)) {
      starts.push(prefixedPc);
    }
  }

  const edPc = immediateAddress - 2;
  if (edPc >= 0 && rom[edPc] === 0xed && rom[edPc + 1] === 0x6b) {
    starts.push(edPc);
  }

  return starts;
}

function decodeRange(start, end, maxInstructions) {
  let pc = start;
  for (let count = 0; pc < end && count < maxInstructions; count++) {
    const decoded = decodeOne(pc);
    const raw = rawBytes(pc, decoded.size).padEnd(12, ' ');
    const meaning = instructionMeaning(decoded.text);
    console.log(`      ${hex(pc)}: ${raw} ${decoded.text}${meaning ? ` ; ${meaning}` : ''}`);
    pc += Math.max(decoded.size, 1);
  }
}

function decodeOne(pc) {
  if (!isRomOffset(pc)) return { size: 1, text: '<outside ROM>' };

  const op = rom[pc];
  const imm8 = () => (pc + 1 < rom.length ? hex8(rom[pc + 1]) : '<??>');
  const rel8 = () => {
    if (pc + 1 >= rom.length) return '<??>';
    const displacement = rom[pc + 1] < 0x80 ? rom[pc + 1] : rom[pc + 1] - 0x100;
    return `${displacement >= 0 ? '+' : ''}${displacement}`;
  };
  const imm24 = (offset = 1) => {
    const value = readU24(pc + offset);
    return value == null ? '<??????>' : hex(value);
  };

  if (op === 0xcb && pc + 1 < rom.length) {
    return decodeCb(pc);
  }

  if ((op === 0xdd || op === 0xfd) && pc + 1 < rom.length) {
    const prefix = op === 0xdd ? 'IX' : 'IY';
    const sub = rom[pc + 1];
    if (sub === 0x21) return { size: 5, text: `LD ${prefix},${imm24(2)}` };
    if (sub === 0x2a) return { size: 5, text: `LD ${prefix},(${imm24(2)})` };
    if (sub === 0x22) return { size: 5, text: `LD (${imm24(2)}),${prefix}` };
    if (sub === 0xe9) return { size: 2, text: `JP (${prefix})` };
    return { size: 2, text: `${prefix} prefix ${hex8(sub)}` };
  }

  if (op === 0xed && pc + 1 < rom.length) {
    const sub = rom[pc + 1];
    if (sub === 0x6b) return { size: 5, text: `ED 6B LD HL,(${imm24(2)})` };
    return { size: 2, text: `ED prefix ${hex8(sub)}` };
  }

  if (IMM24_OPS.has(op)) {
    return { size: 4, text: IMM24_OPS.get(op).replace('nnn', imm24()) };
  }

  switch (op) {
    case 0x00: return { size: 1, text: 'NOP' };
    case 0x02: return { size: 1, text: 'LD (BC),A' };
    case 0x03: return { size: 1, text: 'INC BC' };
    case 0x04: return { size: 1, text: 'INC B' };
    case 0x05: return { size: 1, text: 'DEC B' };
    case 0x07: return { size: 1, text: 'RLCA' };
    case 0x08: return { size: 1, text: 'EX AF,AF\'' };
    case 0x09: return { size: 1, text: 'ADD HL,BC' };
    case 0x0a: return { size: 1, text: 'LD A,(BC)' };
    case 0x0b: return { size: 1, text: 'DEC BC' };
    case 0x0f: return { size: 1, text: 'RRCA' };
    case 0x10: return { size: 2, text: `DJNZ ${rel8()}` };
    case 0x12: return { size: 1, text: 'LD (DE),A' };
    case 0x13: return { size: 1, text: 'INC DE' };
    case 0x17: return { size: 1, text: 'RLA' };
    case 0x18: return { size: 2, text: `JR ${rel8()}` };
    case 0x19: return { size: 1, text: 'ADD HL,DE' };
    case 0x1a: return { size: 1, text: 'LD A,(DE)' };
    case 0x1b: return { size: 1, text: 'DEC DE' };
    case 0x1f: return { size: 1, text: 'RRA' };
    case 0x23: return { size: 1, text: 'INC HL' };
    case 0x27: return { size: 1, text: 'DAA' };
    case 0x29: return { size: 1, text: 'ADD HL,HL' };
    case 0x2b: return { size: 1, text: 'DEC HL' };
    case 0x2f: return { size: 1, text: 'CPL' };
    case 0x33: return { size: 1, text: 'INC SP' };
    case 0x37: return { size: 1, text: 'SCF' };
    case 0x39: return { size: 1, text: 'ADD HL,SP' };
    case 0x3b: return { size: 1, text: 'DEC SP' };
    case 0x3f: return { size: 1, text: 'CCF' };
    case 0x76: return { size: 1, text: 'HALT' };
    case 0xc0: return { size: 1, text: 'RET NZ' };
    case 0xc1: return { size: 1, text: 'POP BC' };
    case 0xc5: return { size: 1, text: 'PUSH BC' };
    case 0xc8: return { size: 1, text: 'RET Z' };
    case 0xc9: return { size: 1, text: 'RET' };
    case 0xd0: return { size: 1, text: 'RET NC' };
    case 0xd1: return { size: 1, text: 'POP DE' };
    case 0xd5: return { size: 1, text: 'PUSH DE' };
    case 0xd8: return { size: 1, text: 'RET C' };
    case 0xd9: return { size: 1, text: 'EXX' };
    case 0xe0: return { size: 1, text: 'RET PO' };
    case 0xe1: return { size: 1, text: 'POP HL' };
    case 0xe3: return { size: 1, text: 'EX (SP),HL' };
    case 0xe5: return { size: 1, text: 'PUSH HL' };
    case 0xe8: return { size: 1, text: 'RET PE' };
    case 0xe9: return { size: 1, text: 'JP (HL)' };
    case 0xeb: return { size: 1, text: 'EX DE,HL' };
    case 0xf0: return { size: 1, text: 'RET P' };
    case 0xf1: return { size: 1, text: 'POP AF' };
    case 0xf3: return { size: 1, text: 'DI' };
    case 0xf5: return { size: 1, text: 'PUSH AF' };
    case 0xf8: return { size: 1, text: 'RET M' };
    case 0xfb: return { size: 1, text: 'EI' };
    default:
      break;
  }

  if ((op & 0xc7) === 0x06) {
    return { size: 2, text: `LD ${reg8((op >> 3) & 7)},${imm8()}` };
  }

  if ((op & 0xc0) === 0x40 && op !== 0x76) {
    return { size: 1, text: `LD ${reg8((op >> 3) & 7)},${reg8(op & 7)}` };
  }

  if ((op & 0xc7) === 0x04) {
    return { size: 1, text: `INC ${reg8((op >> 3) & 7)}` };
  }

  if ((op & 0xc7) === 0x05) {
    return { size: 1, text: `DEC ${reg8((op >> 3) & 7)}` };
  }

  if ((op & 0xc0) === 0x80) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { size: 1, text: `${alu},${reg8(op & 7)}` };
  }

  return { size: 1, text: `DB ${hex8(op)}` };
}

function decodeCb(pc) {
  const sub = rom[pc + 1];
  const reg = reg8(sub & 7);
  const group = (sub >> 6) & 3;
  const y = (sub >> 3) & 7;

  if (group === 0) {
    const op = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y];
    return { size: 2, text: `${op} ${reg}` };
  }
  if (group === 1) return { size: 2, text: `BIT ${y},${reg}` };
  if (group === 2) return { size: 2, text: `RES ${y},${reg}` };
  return { size: 2, text: `SET ${y},${reg}` };
}

function instructionMeaning(text) {
  if (text === 'ADD HL,HL') return 'doubles HL; two such instructions multiply an index by 4';
  if (text === 'SLA L') return 'shifts L left by one bit; part of an index multiply when carries are controlled';
  if (text === 'JP (HL)') return 'jumps to the computed address currently in HL';
  if (text.startsWith('LD HL,(')) return 'loads HL from an absolute memory address';
  if (text.startsWith('LD HL,')) return 'loads an immediate address/value into HL';
  if (text.startsWith('LD DE,')) return 'loads an immediate address/value into DE';
  if (text.startsWith('LD BC,')) return 'loads an immediate address/value into BC';
  if (text.startsWith('ADD HL,')) return 'adds a 16/24-bit register pair into HL';
  if (text.startsWith('JP ') && text !== 'JP (HL)') return 'absolute jump';
  if (text.startsWith('CALL ')) return 'absolute call';
  if (text.startsWith('RET')) return 'returns to caller';
  return '';
}

function formatByteWindowAround(addr, length, before, after) {
  const start = Math.max(0, addr - before);
  const end = Math.min(rom.length, addr + length + after);
  return formatByteWindow(start, end, [[addr, addr + length]]);
}

function formatByteWindow(start, end, highlightRanges = []) {
  const parts = [];
  for (let pc = start; pc < end; pc++) {
    const byte = rom[pc].toString(16).toUpperCase().padStart(2, '0');
    parts.push(isHighlighted(pc, highlightRanges) ? `[${byte}]` : byte);
  }
  return `${hex(start)}..${hex(end - 1)} ${parts.join(' ')}`;
}

function isHighlighted(pc, ranges) {
  return ranges.some(([start, end]) => pc >= start && pc < end);
}

function rawBytes(pc, size) {
  const bytes = [];
  const end = Math.min(rom.length, pc + size);
  for (let offset = pc; offset < end; offset++) {
    bytes.push(rom[offset].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function readU24(offset) {
  if (offset < 0 || offset + 2 >= rom.length) return null;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function entryAddress(index) {
  return TABLE_BASE + index * 4;
}

function isTableAddress(addr) {
  return addr != null && addr >= TABLE_BASE && addr < TABLE_END;
}

function isRomOffset(addr) {
  return addr != null && addr >= 0 && addr < rom.length;
}

function describeTableEntry(addr) {
  if (!isTableAddress(addr)) return '';

  const offset = addr - TABLE_BASE;
  const index = Math.floor(offset / 4);
  const aligned = offset % 4 === 0;
  let text = aligned ? `(entry #${index})` : `(inside entry #${index}, +${offset % 4})`;

  if (aligned && isRomOffset(addr + 3) && rom[addr] === 0xc3) {
    const target = readU24(addr + 1);
    text += ` = JP ${hex(target)}`;
  }

  return text;
}

function describeAddressDistance(foundAt, expectedAddress) {
  const delta = foundAt - expectedAddress;
  if (delta === 0) return 'same numeric address as searched value';
  return `file offset delta ${delta >= 0 ? '+' : ''}${delta}`;
}

function reg8(index) {
  return ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][index] ?? `r${index}`;
}

function hex(value, width = 6) {
  if (value == null) return '0x??????';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

// Strategy 6: Analyze the PEA IX+d pattern to find real dispatcher CALL targets
function strategyPeaPatternDispatchers() {
  console.log('=== Strategy 6: PEA IX+d pattern dispatcher targets ===');
  console.log('  The "ED 66 04 01 02" is PEA IX+4 (ED 66 04) + LD BC,0x000002 (01 02 00 00)');
  console.log('  These are NOT references to table address 0x020104.');
  console.log('  Finding the CALL targets after each PEA IX+d pattern...');

  const dispatcherCalls = new Map();
  for (let i = 0; i < rom.length - 30; i++) {
    if (rom[i] !== 0xED || rom[i + 1] !== 0x66) continue;
    // Find CALL within next 30 bytes
    for (let k = i + 3; k < i + 30 && k + 3 < rom.length; k++) {
      if (rom[k] === 0xCD) {
        const target = readU24(k + 1);
        if (target == null) break;
        const key = hex(target);
        if (!dispatcherCalls.has(key)) {
          dispatcherCalls.set(key, { count: 0, examples: [] });
        }
        const entry = dispatcherCalls.get(key);
        entry.count++;
        if (entry.examples.length < 3) {
          // Find the last LD BC,N before the CALL
          let syscallNum = -1;
          for (let m = k - 4; m >= i; m--) {
            if (rom[m] === 0x01 && m + 4 < rom.length && rom[m + 4] === 0xC5) {
              syscallNum = readU24(m + 1);
              break;
            }
          }
          entry.examples.push({ callSite: hex(k), peaSite: hex(i), syscallNum });
        }
        break;
      }
    }
  }

  for (const [target, info] of [...dispatcherCalls.entries()].sort((a, b) => b[1].count - a[1].count)) {
    if (info.count < 3) continue; // Skip infrequent targets
    console.log(`  Dispatcher CALL ${target}: ${info.count} call sites`);
    for (const ex of info.examples) {
      console.log(`    Example: CALL at ${ex.callSite}, PEA at ${ex.peaSite}, last BC=${ex.syscallNum === -1 ? '??' : hex(ex.syscallNum, 4)}`);
    }
  }
}

// Strategy 7: Decode the two main dispatchers
function strategyDecodeDispatchers() {
  console.log('=== Strategy 7: Decode dispatcher functions ===');

  for (const addr of [0x0003F0, 0x015349]) {
    console.log(`\n  Dispatcher at ${hex(addr)} (first 128 bytes):`);
    decodeRange(addr, Math.min(rom.length, addr + 128), 40);

    // Search for table base refs inside dispatcher
    let foundTableRef = false;
    for (let i = addr; i < addr + 512 && i + 3 < rom.length; i++) {
      // Look for any LD with immediate containing table-range address
      const op = rom[i];
      if (op === 0x21 || op === 0x11 || op === 0x01 || op === 0x2A) {
        const imm = readU24(i + 1);
        if (imm !== null && imm >= 0x020000 && imm <= 0x022400) {
          console.log(`    ** Table-range immediate at ${hex(i)}: ${hex(imm)} **`);
          foundTableRef = true;
        }
      }
      if (op === 0xED && i + 1 < rom.length) {
        const sub = rom[i + 1];
        if (sub === 0x4B || sub === 0x5B || sub === 0x6B || sub === 0x7B) {
          const imm = readU24(i + 2);
          if (imm !== null && imm >= 0x020000 && imm <= 0x022400) {
            console.log(`    ** Table-range load at ${hex(i)}: ${hex(imm)} **`);
            foundTableRef = true;
          }
        }
      }
    }
    if (!foundTableRef) {
      console.log(`    No direct table-range (0x020100-0x022400) references found in first 512 bytes.`);
    }
  }
}

// Strategy 8: Boot jump sequence at 0x0008B7
function strategyBootJump() {
  console.log('\n=== Strategy 8: Boot sequence JP to table entry #1 ===');
  console.log('  Decoding from 0x0008A0:');
  decodeRange(0x0008A0, 0x0008E0, 20);
  console.log('  Key finding: JP 0x020108 at 0x0008B7 = direct jump to table entry #1');
  console.log('  Entry #1 = JP 0x0401DF (boot/init continuation)');
}

// Strategy 9: The LD HL,(0x020105) function — computes table end address
function strategyTableAccessFunction() {
  console.log('\n=== Strategy 9: Table access function at 0x0008C8 ===');
  console.log('  This function loads from table entry #0 offset +1 and computes table extent.');
  console.log('  Decoding from 0x0008BB:');
  decodeRange(0x0008BB, 0x0008E0, 12);

  // Also check who CALLS the function containing 0x0008C8
  // Find function boundary by searching backwards for RET
  let funcStart = 0x0008BB;
  for (let i = 0x0008BA; i > 0x000800; i--) {
    if (rom[i] === 0xC9) { funcStart = i + 1; break; }
  }
  console.log(`  Function appears to start at ${hex(funcStart)}`);

  // Find callers
  const funcAddr = funcStart;
  const b0 = funcAddr & 0xFF, b1 = (funcAddr >> 8) & 0xFF, b2 = (funcAddr >> 16) & 0xFF;
  let callerCount = 0;
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
      callerCount++;
      if (callerCount <= 5) {
        console.log(`  CALL ${hex(funcAddr)} at ${hex(i)}`);
      }
    }
  }
  if (callerCount > 5) console.log(`  ... and ${callerCount - 5} more callers`);
  console.log(`  Total callers: ${callerCount}`);

  // Also decode the function at 0x0008C8 more carefully:
  // LD HL,(0x020105) loads bytes [05],[06],[07] of entry #0 region
  // But entry #0 at 0x020104 is: C3 BA D6 0B
  // So (0x020105) = BA D6 0B = 0x0BD6BA
  // Then LD BC,0x000104; ADD HL,BC = 0x0BD6BA + 0x104 = 0x0BD7BE
  // Then LD DE,0x020000; SBC HL,DE -> 0x0BD7BE - 0x020000 = 0x09D7BE
  // Hmm, this doesn't obviously relate to table dispatch.
  // Actually - wait. Entry #0's JP target is 0x0BD6BA. The bytes at 0x020104 are:
  // C3 BA D6 0B
  // So LD HL,(0x020105) = reading from byte 1 of entry 0 = 0x0BD6BA (the JP target)
  // Then adding 0x104... this computes something related to the first entry's target.
  // This is likely a ROM validation/size check, not the dispatcher.
}

/*
=== PROBE OUTPUT ===

=== Phase 471: Jump table dispatcher probe ===
ROM size: 0x400000 bytes
Syscall table: 0x020104..0x02230B (2178 entries, end-exclusive 0x02230C)
Known entry #1614: 0x021A3C -> expected JP 0x08BF22
Known entry #1645: 0x021AB8 -> expected JP 0x030078

=== Strategy 1: References to table base 0x020104 ===
  37 hits total. Most are false positives: PEA IX+4 (ED 66 04) + LD BC,2 (01 02 00 00).
  No valid LD reg,0x020104 instructions found.

=== Strategy 2: References to signature address 0x020100 ===
  48 hits total. Key hit at 0x0008BB: LD HL,(0x020100) — signature validation.

=== Strategy 3: Multiply-by-4 patterns near JP (HL) ===
  8 candidates, all false positives at 0x0000AE-0x0000E5 (Z80 RST vector area jump table data).

=== Strategy 4: Boot trace ===
  Ran 100000 steps from home screen init at 0x08BF22.
  No block PC landed in syscall table range 0x020104..0x02230B.

=== Strategy 5: LD HL,(addr) where addr is inside the table range ===
  #1 LD HL,(0x020105) at 0x0008C8 — loads JP target of entry #0, used for ROM validation.
  #2 LD HL,(0x020F01) at 0x04E976 — likely a data reference, not code dispatch.

=== Strategy 6: PEA IX+d pattern dispatcher targets ===
  The "ED 66 04 01 02" pattern is PEA IX+4 (ED 66 04) + LD BC,0x000002 (01 02 00 00).
  These are NOT references to table address 0x020104!

  Top dispatcher CALL targets after PEA patterns:
    CALL 0x0003F0: 47 call sites (syscall numbers like 0x0008, 0x0011, 0x000D, etc.)
    CALL 0x0003EC: 47 call sites
    CALL 0x015349: 36 call sites (syscall numbers like 0x0008, 0x0000, 0x0004, etc.)
    CALL 0x0152D8: 24 call sites

=== Strategy 7: Decode dispatcher functions ===

  0x0003F0 is JP 0x015349 — it's a TRAMPOLINE, first entry in a SEPARATE vector table!
  The vector table at 0x0003F0 has entries like:
    0x0003F0: JP 0x015349  (entry #0)
    0x0003F4: JP 0x00C9A0  (entry #1)
    0x0003F8: JP 0x0157A1  (entry #2)
    0x0003FC: JP 0x00B9BD  (entry #3)
    ...etc

  0x015349 is the actual syscall dispatcher. It:
    - Adjusts stack frame (LD HL,0xFFFFFA; CALL 0x002197)
    - Reads syscall arguments from IX-relative offsets
    - Stores to RAM addresses 0xD1770D, 0xD1771E, 0xD17721, 0xD17719
    - Uses a loop counter at 0xD17719
    - Neither dispatcher references the 2178-entry table at 0x020104

=== Strategy 8: Boot sequence JP to table entry #1 ===
  At 0x0008B7: JP 0x020108 = direct jump to table entry #1 = JP 0x0401DF
  This is the ONLY known code path that enters the 2178-entry table.

=== Strategy 9: Table access function at 0x0008C8 ===
  0x0008BB: LD HL,(0x020100) + SBC HL,BC(0x00A55A) — validates signature bytes (5A A5).
  0x0008C8: LD HL,(0x020105) + ADD HL,BC(0x104) + SBC HL,DE(0x020000) — computes table extent.
  Called from 6 sites: 0x000049, 0x001424, 0x0014CC, 0x001713, 0x013EA4, +1 more.

=== CONCLUSIONS ===

1. The 2178-entry JP table at 0x020104 is NOT accessed via a computed index dispatcher.
   The ONLY direct code reference is the boot JP 0x020108 at 0x0008B7 (entry #1).

2. The "ED 66 04 01 02" pattern that appeared to reference 0x020104 is actually
   PEA IX+4 (ED 66 04) followed by LD BC,2 (01 02 00 00). False positive.

3. The REAL OS syscall mechanism uses the SMALLER vector table at 0x0003F0+,
   dispatched via CALL 0x0003F0 (47 sites) and CALL 0x015349 (36 sites).
   Syscall numbers are small (0x00-0x14), not 0-2177.

4. The 2178-entry table appears to be a ROM HEADER / APP TABLE, not a runtime
   dispatch table. Each entry JP's to an app/module init function.
   The boot code validates its signature (5A A5 at 0x020100) and jumps to
   entry #1 to continue OS initialization.

5. The real "mode dispatcher" likely works differently: it stores a mode ID
   in a RAM variable and the main event loop checks it to decide which
   module's handler to call. The table at 0x020104 would be used during
   boot/app-loading to resolve module entry points.
*/
