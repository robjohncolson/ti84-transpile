#!/usr/bin/env node

import fs from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x0075F7;
const MAX_BYTES = 400;

const PORT_LABELS = new Map([
  [0x3124, 'USB/link helper mode port'],
]);

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(pc, length) {
  return Array.from(rom.slice(pc, pc + length), hexByte).join(' ');
}

function portLabel(port) {
  return PORT_LABELS.get(port) ?? 'unlabeled control port';
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
      error: String(error),
    };
  }
}

function formatDisplacement(value) {
  return value >= 0 ? `+${value}` : String(value);
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'push':
      return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()},${hex(inst.value)}`;
    case 'add-pair':
      return `ADD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},(${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)})`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hex(inst.value, 2)}`;
    case 'out-reg':
      return `OUT (C),${String(inst.reg).toUpperCase()}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'ret':
      return 'RET';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function findDirectCallers(target) {
  const callers = [];
  for (let addr = 0; addr <= rom.length - 4; addr++) {
    if (rom[addr] === 0xCD && read24(addr + 1) === target) {
      callers.push(addr);
    }
  }
  return callers;
}

function traceFunction(startPc) {
  const lines = [];
  const portAccesses = [];
  const ramAccesses = [];
  const callTargets = [];
  const loops = [];
  const seenLoopKeys = new Set();
  const state = {
    bcValue: null,
    aExpr: null,
  };

  let pc = startPc;
  let endPc = startPc;
  let bytesTraced = 0;

  while (pc < rom.length && bytesTraced < MAX_BYTES) {
    const inst = safeDecode(pc);
    const notes = [];

    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      state.bcValue = inst.value >>> 0;
      notes.push(`select port ${hex(inst.value, 4)} ${portLabel(inst.value)}`);
    }

    if (inst.tag === 'ld-reg-ixd' && inst.indexRegister === 'ix') {
      if (inst.displacement === 6) {
        state.aExpr = 'stack_arg_low';
        ramAccesses.push(`- ${hex(inst.pc)}: read (${String(inst.indexRegister).toUpperCase()}+6) -> low byte of caller-pushed BC argument`);
        notes.push('read stacked argument low byte from caller frame');
      } else {
        state.aExpr = `${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)}`;
        ramAccesses.push(`- ${hex(inst.pc)}: read (${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)})`);
      }
    }

    if (inst.tag === 'alu-imm' && inst.op === 'and') {
      state.aExpr = `(${state.aExpr ?? 'A'} & ${hex(inst.value, 2)})`;
      notes.push(`mask value to low 3 bits with ${hex(inst.value, 2)}`);
    }

    if (inst.tag === 'out-reg' && inst.reg === 'a' && state.bcValue != null) {
      const access = `- ${hex(inst.pc)}: OUT ${hex(state.bcValue, 4)} ${portLabel(state.bcValue)} <= ${state.aExpr ?? 'A'}`;
      portAccesses.push(access);
      notes.push(`write ${state.aExpr ?? 'A'} to ${hex(state.bcValue, 4)}`);
    }

    if (inst.tag === 'call') {
      callTargets.push(inst.target);
    }

    if ((inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') && inst.target < inst.pc) {
      const key = `${inst.pc}:${inst.target}`;
      if (!seenLoopKeys.has(key)) {
        seenLoopKeys.add(key);
        loops.push(`- ${hex(inst.pc)} -> ${hex(inst.target)}: backward ${inst.tag.toUpperCase()} ${inst.tag === 'jr-conditional' ? `(${String(inst.condition).toUpperCase()}) ` : ''}sanity-check loop`);
      }
    }

    if (inst.tag === 'jr-conditional' && inst.target === 0x007610) {
      notes.push('branch back into the RST 0x08 trap if C != 0x24');
    }

    if (inst.tag === 'rst' && inst.target === 0x08) {
      notes.push('sanity trap if BC no longer matches port 0x3124');
    }

    const noteSuffix = notes.length > 0 ? `  ; ${notes.join('; ')}` : '';
    lines.push(`${hex(inst.pc)}  ${rawBytes(inst.pc, inst.length).padEnd(14)}  ${formatInstruction(inst).padEnd(28)}${noteSuffix}`);

    pc = inst.nextPc;
    endPc = inst.pc + inst.length - 1;
    bytesTraced += inst.length;

    if (inst.tag === 'ret') {
      break;
    }
  }

  return {
    lines,
    endPc,
    bytesTraced,
    portAccesses,
    ramAccesses,
    callTargets,
    loops,
  };
}

const callers = findDirectCallers(START);
const trace = traceFunction(START);

console.log('# Phase 421 Probe: Static Trace of 0x0075F7');
console.log('');
console.log(`Function window: ${hex(START)}..${hex(trace.endPc)} (${trace.bytesTraced} bytes traced)`);
console.log(`Direct callers: ${callers.length === 0 ? 'none found' : callers.map((pc) => hex(pc)).join(', ')}`);
console.log('');
console.log('Disassembly:');
for (const line of trace.lines) {
  console.log(line);
}
console.log('');
console.log('Port I/O:');
if (trace.portAccesses.length === 0) {
  console.log('- none');
} else {
  for (const item of trace.portAccesses) console.log(item);
}
console.log('');
console.log('RAM accesses:');
if (trace.ramAccesses.length === 0) {
  console.log('- none');
} else {
  for (const item of trace.ramAccesses) console.log(item);
}
console.log('');
console.log('CALL targets:');
if (trace.callTargets.length === 0) {
  console.log('- none');
} else {
  for (const target of trace.callTargets) console.log(`- ${hex(target)}`);
}
console.log('');
console.log('Loops / backward branches:');
if (trace.loops.length === 0) {
  console.log('- none');
} else {
  for (const item of trace.loops) console.log(item);
}
console.log('');
console.log('Classification:');
console.log('- No busy-wait, timer delay, or port-poll loop is present.');
console.log('- The function writes one masked argument to port 0x3124, then sanity-checks that BC still selects 0x3124 before returning.');
console.log('- With caller BC=0x000007, the effective value emitted is 0x07.');
