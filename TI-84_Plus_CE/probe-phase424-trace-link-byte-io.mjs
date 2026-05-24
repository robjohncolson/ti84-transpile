#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TARGET_PORTS = new Set([0x3030, 0x3031]);
const REGION_START = 0x00d000;
const REGION_END = 0x00dc00;
const ISR_START = 0x0094c0;
const ISR_END_EXCLUSIVE = 0x0096cb;
const MAX_FUNCTION_BYTES = 0x500;

const IN0_REGS = new Set([0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x38]);
const OUT0_REGS = new Set([0x01, 0x09, 0x11, 0x19, 0x21, 0x29, 0x39]);

const KNOWN_TRACED_ISR_CALLEES = new Set([0x00ed77, 0x00fe10, 0x00da8c]);

const LABELS = new Map([
  [0x006eda, '0x006EDA USB ready poller'],
  [0x0094c0, '0x0094C0 legacy TI-Link ISR'],
  [0x0096cb, '0x0096CB non-USB controller fallback'],
  [0x0098d2, '0x0098D2 masked-status service dispatcher'],
  [0x00da8c, '0x00DA8C disconnect helper'],
  [0x00db66, '0x00DB66 TX control helper'],
  [0x00dc0e, '0x00DC0E RX control helper'],
  [0x00dcb6, '0x00DCB6 0x3031 control helper'],
  [0x00dd6c, '0x00DD6C 0x3031 control helper sibling'],
  [0x00de0e, '0x00DE0E 0x3030 handshake helper'],
  [0x00e583, '0x00E583 selector cleanup worker'],
  [0x00ed77, '0x00ED77 handshake slot selector'],
  [0x00fe10, '0x00FE10 transfer dispatcher'],
  [0x0126a9, '0x0126A9 status wait wrapper'],
  [0x01270b, '0x01270B controller gate helper'],
  [0x0127e9, '0x0127E9 controller setup worker'],
  [0x012b93, '0x012B93 0x3031 status decoder'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function rawBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), (byte) =>
    (byte & 0xff).toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function lower(value) {
  return value == null ? '' : String(value).toLowerCase();
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${signedDisp(displacement)})`;
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `CALL ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `JP ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${upper(inst.condition)},${hex(inst.target)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    case 'ret-conditional':
      return withPrefix(inst, `RET ${upper(inst.condition)}`);
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'di':
      return withPrefix(inst, 'DI');
    case 'ei':
      return withPrefix(inst, 'EI');
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(inst, `LD ${upper(inst.pair)},(${hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${upper(inst.src)})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${upper(inst.dest)}),${upper(inst.src)}`);
    case 'ld-ind-imm':
      return withPrefix(inst, `LD (HL),${hex(inst.value, 2)}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`);
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
    case 'inc-pair':
      return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'dec-pair':
      return withPrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'inc-reg':
      return withPrefix(inst, `INC ${upper(inst.reg)}`);
    case 'dec-reg':
      return withPrefix(inst, `DEC ${upper(inst.reg)}`);
    case 'inc-ixd':
      return withPrefix(inst, `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'bit-set':
      return withPrefix(inst, `SET ${inst.bit},${upper(inst.reg)}`);
    case 'bit-res':
      return withPrefix(inst, `RES ${inst.bit},${upper(inst.reg)}`);
    case 'bit-test':
      return withPrefix(inst, `BIT ${inst.bit},${upper(inst.reg)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'rotate-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.reg)}`);
    case 'cpl':
      return withPrefix(inst, 'CPL');
    case 'in-reg':
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'out-reg':
      return withPrefix(inst, `OUT (C),${upper(inst.reg)}`);
    case 'in0':
      return withPrefix(inst, `IN0 ${upper(inst.reg)},(${hex(inst.port, 2)})`);
    case 'out0':
      return withPrefix(inst, `OUT0 (${hex(inst.port, 2)}),${upper(inst.reg)}`);
    case 'nop':
      return withPrefix(inst, 'NOP');
    case 'db':
      return withPrefix(inst, `DB ${hex(inst.value, 2)}`);
    default:
      return withPrefix(inst, `[${inst.tag}]`);
  }
}

function isRetTag(tag) {
  return tag === 'ret' || tag === 'reti' || tag === 'retn';
}

function updateBcState(state, inst) {
  if (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'bc') {
    const value = inst.value >>> 0;
    state.bc = value;
    state.b = (value >> 8) & 0xff;
    state.c = value & 0xff;
    return;
  }

  if (inst.tag === 'ld-reg-imm' && lower(inst.dest) === 'b') {
    state.b = inst.value & 0xff;
    state.bc = state.c == null ? null : ((state.b << 8) | state.c);
    return;
  }

  if (inst.tag === 'ld-reg-imm' && lower(inst.dest) === 'c') {
    state.c = inst.value & 0xff;
    state.bc = state.b == null ? null : ((state.b << 8) | state.c);
    return;
  }

  if ((inst.tag === 'inc-pair' || inst.tag === 'dec-pair') && lower(inst.pair) === 'bc' && state.bc != null) {
    state.bc = inst.tag === 'inc-pair' ? (state.bc + 1) & 0xffffff : (state.bc - 1) & 0xffffff;
    state.b = (state.bc >> 8) & 0xff;
    state.c = state.bc & 0xff;
    return;
  }

  if (
    (inst.tag === 'pop' && lower(inst.pair) === 'bc') ||
    (inst.tag === 'ld-pair-mem' && lower(inst.pair) === 'bc') ||
    (inst.tag === 'ld-pair-indexed' && lower(inst.pair) === 'bc')
  ) {
    state.bc = null;
    state.b = null;
    state.c = null;
    return;
  }

  if (inst.tag === 'ld-reg-reg' && (lower(inst.dest) === 'b' || lower(inst.dest) === 'c')) {
    state.bc = null;
    state.b = null;
    state.c = null;
  }
}

function accessForInstruction(inst, state) {
  if ((inst.tag === 'in-reg' || inst.tag === 'out-reg') && state.bc != null) {
    const port = state.bc & 0xffff;
    if (TARGET_PORTS.has(port)) {
      return {
        pc: inst.pc,
        port,
        direction: inst.tag === 'in-reg' ? 'read' : 'write',
        mode: 'bc',
      };
    }
    return null;
  }

  if ((inst.tag === 'in0' || inst.tag === 'out0') && (inst.port === 0x30 || inst.port === 0x31)) {
    return {
      pc: inst.pc,
      port: inst.port === 0x30 ? 0x3030 : 0x3031,
      direction: inst.tag === 'in0' ? 'read' : 'write',
      mode: 'in0/out0',
      port8: inst.port,
    };
  }

  return null;
}

function scoreStartCandidate(pc) {
  if (pc < 0 || pc >= rom.length) {
    return null;
  }

  if (
    rom[pc] === 0xdd &&
    rom[pc + 1] === 0xe5 &&
    rom[pc + 2] === 0xdd &&
    rom[pc + 3] === 0x21 &&
    rom[pc + 7] === 0xdd &&
    rom[pc + 8] === 0x39
  ) {
    return { pc, score: 100, reason: 'PUSH IX / LD IX,0 / ADD IX,SP prologue' };
  }

  if (rom[pc] === 0x21 && rom[pc + 2] === 0xff && rom[pc + 3] === 0xff && rom[pc + 4] === 0xcd) {
    return { pc, score: 90, reason: 'LD HL,-N / CALL frame-helper prologue' };
  }

  if (rom[pc] === 0xed && rom[pc + 1] === 0x57 && rom[pc + 2] === 0xf5 && rom[pc + 3] === 0xf3) {
    return { pc, score: 85, reason: 'special-register save / DI prologue' };
  }

  if (rom[pc] === 0xf3) {
    return { pc, score: 60, reason: 'DI prologue' };
  }

  if (rom[pc] === 0xdd && rom[pc + 1] === 0xe5) {
    return { pc, score: 55, reason: 'PUSH IX prologue' };
  }

  if (pc > 0 && rom[pc - 1] === 0xc9) {
    return { pc, score: 25, reason: 'first byte after RET' };
  }

  return null;
}

function findLikelyFunctionStart(hitPc) {
  const min = Math.max(0, hitPc - 0x140);
  let best = null;

  for (let pc = min; pc <= hitPc; pc++) {
    const candidate = scoreStartCandidate(pc);
    if (!candidate) {
      continue;
    }

    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.pc > best.pc)
    ) {
      best = candidate;
    }
  }

  if (best) {
    return best;
  }

  for (let pc = hitPc - 1; pc >= min; pc--) {
    const inst = safeDecode(pc);
    if (inst.pc === pc && isRetTag(inst.tag) && inst.nextPc <= hitPc) {
      return { pc: inst.nextPc, score: 0, reason: 'fallback: first byte after decoded RET' };
    }
  }

  return { pc: hitPc, score: 0, reason: 'fallback: hit address itself' };
}

const functionCache = new Map();

function disassembleFunction(startPc) {
  if (functionCache.has(startPc)) {
    return functionCache.get(startPc);
  }

  const state = { bc: null, b: null, c: null };
  const instructions = [];
  const hits = [];
  const hitMap = new Map();
  const calls = new Set();

  let pc = startPc;
  let consumed = 0;

  while (pc < rom.length && consumed < MAX_FUNCTION_BYTES) {
    const inst = safeDecode(pc);
    const access = accessForInstruction(inst, state);

    const line = {
      pc,
      bytes: rawBytes(pc, inst.length),
      text: formatInstruction(inst),
      tag: inst.tag,
      target: inst.target,
      access,
    };

    if (access) {
      hits.push(access);
      hitMap.set(pc, access);
    }

    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && typeof inst.target === 'number') {
      calls.add(inst.target >>> 0);
    }

    instructions.push(line);
    updateBcState(state, inst);

    pc = inst.nextPc;
    consumed += inst.length;

    if (isRetTag(inst.tag)) {
      break;
    }
  }

  const result = {
    start: startPc,
    endExclusive: pc,
    instructions,
    hits,
    hitMap,
    calls: Array.from(calls).sort((a, b) => a - b),
  };

  functionCache.set(startPc, result);
  return result;
}

function rawIoCandidates(start, endExclusive) {
  const pcs = [];

  for (let pc = start; pc < endExclusive - 1; pc++) {
    if (rom[pc] !== 0xed) {
      continue;
    }

    const op = rom[pc + 1];
    if ((op & 0xc7) === 0x40 || (op & 0xc7) === 0x41) {
      pcs.push(pc);
      continue;
    }

    if ((IN0_REGS.has(op) || OUT0_REGS.has(op)) && pc + 2 < endExclusive) {
      const port8 = rom[pc + 2];
      if (port8 === 0x30 || port8 === 0x31) {
        pcs.push(pc);
      }
    }
  }

  return pcs;
}

function analyzeCandidates(start, endExclusive) {
  const candidatePcs = rawIoCandidates(start, endExclusive);
  const byFunction = new Map();

  for (const pc of candidatePcs) {
    const startGuess = findLikelyFunctionStart(pc);
    const fn = disassembleFunction(startGuess.pc);
    const access = fn.hitMap.get(pc);

    if (!access) {
      continue;
    }

    let group = byFunction.get(fn.start);
    if (!group) {
      group = {
        start: fn.start,
        endExclusive: fn.endExclusive,
        startReason: startGuess.reason,
        label: LABELS.get(fn.start) ?? `probable function at ${hex(fn.start)}`,
        function: fn,
      };
      byFunction.set(fn.start, group);
    }
  }

  return Array.from(byFunction.values()).sort((a, b) => a.start - b.start);
}

function collectIsrCalls() {
  const targets = new Set();

  for (let pc = ISR_START; pc < ISR_END_EXCLUSIVE; ) {
    const inst = safeDecode(pc);
    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && typeof inst.target === 'number') {
      targets.add(inst.target >>> 0);
    }
    pc = inst.nextPc;
  }

  return Array.from(targets).sort((a, b) => a - b);
}

function classifyFunction(functionView) {
  for (let i = 0; i < functionView.instructions.length; i++) {
    const line = functionView.instructions[i];
    if (!line.access) {
      continue;
    }

    const prev1 = functionView.instructions[i - 1];
    const prev2 = functionView.instructions[i - 2];
    const next1 = functionView.instructions[i + 1];

    if (
      line.access.direction === 'read' &&
      next1 &&
      (next1.tag === 'ld-mem-reg' || next1.tag === 'ld-ixd-reg') &&
      lower(next1.src) === 'a'
    ) {
      return 'possible payload read';
    }

    const loadsAFromMemory = [prev1, prev2].some(
      (inst) =>
        inst &&
        ((inst.tag === 'ld-reg-mem' && lower(inst.dest) === 'a') ||
          (inst.tag === 'ld-reg-ixd' && lower(inst.dest) === 'a') ||
          (inst.tag === 'ld-reg-ind' && lower(inst.dest) === 'a'))
    );

    const isBitMaskPrep = [prev1, prev2].some(
      (inst) =>
        inst &&
        ((inst.tag === 'ld-reg-imm' && lower(inst.dest) === 'a') ||
          inst.tag === 'bit-set' ||
          inst.tag === 'bit-res' ||
          inst.tag === 'alu-imm' ||
          inst.tag === 'rotate-reg')
    );

    if (line.access.direction === 'write' && loadsAFromMemory && !isBitMaskPrep) {
      return 'possible payload write';
    }
  }

  return 'status/control only';
}

function summarizeHits(functionView) {
  return functionView.hits
    .map((hit) => {
      const direction = hit.direction === 'read' ? 'R' : 'W';
      const modeSuffix = hit.mode === 'in0/out0' ? ' via IN0/OUT0' : '';
      return `${direction}${hex(hit.port, 4)}@${hex(hit.pc)}${modeSuffix}`;
    })
    .join(', ');
}

function printFunction(group) {
  const fn = group.function;
  console.log(`- ${group.label}`);
  console.log(`  start: ${hex(group.start)}  end: ${hex(group.endExclusive)}`);
  console.log(`  prologue guess: ${group.startReason}`);
  console.log(`  classification: ${classifyFunction(fn)}`);
  console.log(`  port hits: ${summarizeHits(fn) || 'none'}`);
  if (fn.calls.length) {
    const callSummary = fn.calls.map((target) => LABELS.get(target) ?? hex(target)).join(', ');
    console.log(`  calls: ${callSummary}`);
  }
  console.log('  disassembly:');
  for (const line of fn.instructions) {
    const marker = line.access ? ' <== target-port access' : '';
    console.log(`    ${hex(line.pc)}  ${line.bytes.padEnd(20)} ${line.text}${marker}`);
  }
}

function printIsrCallReport(callTargets) {
  console.log('ISR direct CALL targets:');
  for (const target of callTargets) {
    const fn = disassembleFunction(target);
    const relevantHits = fn.hits.filter((hit) => TARGET_PORTS.has(hit.port));
    const traced = KNOWN_TRACED_ISR_CALLEES.has(target);
    console.log(
      `- ${LABELS.get(target) ?? hex(target)}  traced=${traced ? 'known' : 'new'}  target-port-hits=${
        relevantHits.length
      }`
    );
    if (relevantHits.length) {
      console.log(`  ${relevantHits.map((hit) => `${hit.direction}:${hex(hit.port, 4)}@${hex(hit.pc)}`).join(', ')}`);
    }
  }
}

function printGlobalSummary(groups) {
  console.log('Whole-ROM cross-check (probable unique functions touching 0x3030/0x3031):');
  for (const group of groups) {
    const fn = group.function;
    console.log(
      `- ${group.label}  start=${hex(group.start)}  classification=${classifyFunction(fn)}  hits=${summarizeHits(fn)}`
    );
  }
}

const requestedRegionGroups = analyzeCandidates(REGION_START, REGION_END);
const isrGroups = analyzeCandidates(ISR_START, ISR_END_EXCLUSIVE);
const globalGroups = analyzeCandidates(0, rom.length);
const isrCalls = collectIsrCalls();

console.log('# Phase 424 Probe: Trace Actual Byte-Level TI-Link I/O');
console.log('');
console.log(`ROM size: ${hex(rom.length)} bytes`);
console.log(`Requested region: ${hex(REGION_START)}..${hex(REGION_END)} (end exclusive)`);
console.log(`ISR region: ${hex(ISR_START)}..${hex(ISR_END_EXCLUSIVE)} (end exclusive)`);
console.log('');

console.log('Requested 0x00D000-0x00DBFF scan:');
if (requestedRegionGroups.length === 0) {
  console.log('- no functions in this band reference 0x3030 or 0x3031');
} else {
  for (const group of requestedRegionGroups) {
    printFunction(group);
  }
}
console.log('');

console.log('Legacy ISR 0x0094C0-0x0096CA scan:');
for (const group of isrGroups) {
  printFunction(group);
}
console.log('');
printIsrCallReport(isrCalls);
console.log('');
printGlobalSummary(globalGroups);
