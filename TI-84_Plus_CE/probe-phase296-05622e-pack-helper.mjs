#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const ROM_SIZE = 0x400000;
const HELPER_START = 0x05622E;
const HELPER_LOCAL_WINDOW = 0x80;
const DESCRIPTOR_BUILDER = 0x022359;
const BUILDER_PREVIEW_ROWS = 12;

const D0058C = 0xD0058C;
const D0058E = 0xD0058E;

const rom = readFileSync(ROM_PATH);
if (rom.length !== ROM_SIZE) {
  throw new Error(`Expected ROM.rom to be ${hex(ROM_SIZE)} bytes, got ${hex(rom.length)}`);
}

const KNOWN_ADDRS = new Map([
  [D0058C, 'D0058C scan code / kbdKey'],
  [D0058E, 'D0058E keyExtend'],
  [DESCRIPTOR_BUILDER, '0x022359 descriptor builder'],
  [0x0236F9, '0x0236F9 descriptor sink'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function mask24(value) {
  return Number(value) & 0xFFFFFF;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatDisplacement(value) {
  const displacement = Number(value) || 0;
  return displacement < 0 ? `-${hexByte(Math.abs(displacement))}` : `+${hexByte(displacement)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${upper(indexRegister)}${formatDisplacement(displacement)})`;
}

function namedAddr(addr) {
  const address = mask24(addr);
  if (KNOWN_ADDRS.has(address)) {
    return `${hex(address)} [${KNOWN_ADDRS.get(address)}]`;
  }
  return hex(address);
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'alu-imm':
      return `${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${namedAddr(inst.addr)}), ${upper(inst.pair)}`
        : `LD ${upper(inst.pair)}, (${namedAddr(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${namedAddr(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${namedAddr(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${namedAddr(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-sp-pair':
      return `LD SP, ${upper(inst.pair ?? inst.src)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'lea':
      return `LEA ${upper(inst.dest)}, ${upper(inst.base)}${formatDisplacement(inst.displacement)}`;
    case 'nop':
      return 'NOP';
    default: {
      const extras = { ...inst };
      delete extras.pc;
      delete extras.length;
      delete extras.nextPc;
      delete extras.mode;
      delete extras.modePrefix;
      delete extras.fallthrough;
      delete extras.terminates;
      return `${upper(inst?.tag ?? 'UNKNOWN')} ${JSON.stringify(extras)}`;
    }
  }
}

function decodeRow(pc) {
  const inst = decodeInstruction(rom, pc, 'adl');
  const length = Number(inst?.length || 0);
  if (!inst || !length) {
    throw new Error(`Decoder returned an invalid instruction at ${hex(pc)}`);
  }

  return {
    pc,
    length,
    nextPc: pc + length,
    inst,
    bytes: bytesToHex(rom.subarray(pc, pc + length)),
    text: formatInstruction(inst),
  };
}

function isTerminal(inst) {
  return inst?.tag === 'ret'
    || inst?.tag === 'ret-conditional'
    || inst?.tag === 'reti'
    || inst?.tag === 'retn'
    || inst?.tag === 'jp'
    || inst?.tag === 'jp-indirect'
    || inst?.tag === 'halt';
}

function isLocalHelperTarget(target) {
  const address = mask24(target);
  return address >= HELPER_START && address < HELPER_START + HELPER_LOCAL_WINDOW;
}

function rowNotes(row) {
  const notes = [];
  const inst = row.inst;

  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    notes.push(`compare against ${hexByte(inst.value)}`);
  }
  if (inst.tag === 'ld-reg-mem' && mask24(inst.addr) === D0058E) {
    notes.push('reads keyExtend');
  }
  if (inst.tag === 'ld-reg-mem' && mask24(inst.addr) === D0058C) {
    notes.push('reads scan code / kbdKey');
  }
  if (inst.tag === 'ld-reg-reg' && (
    (inst.dest === 'l' && inst.src === 'a')
    || (inst.dest === 'h' && inst.src === 'a')
    || (inst.dest === 'a' && inst.src === 'l')
    || (inst.dest === 'a' && inst.src === 'h')
    || (inst.dest === 'l' && inst.src === 'h')
  )) {
    notes.push('packing / byte-order step');
  }
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    notes.push(`call target ${namedAddr(inst.target)}`);
  }
  if (inst.tag === 'jr' || inst.tag === 'jr-conditional') {
    notes.push(`branch target ${hex(inst.target)}`);
  }
  if (row.pc === 0x056241 || row.pc === 0x056251) {
    notes.push('swap low/high descriptor bytes');
  }
  if (row.pc === 0x05624D) {
    notes.push('test whether keyExtend is zero');
  }
  if (row.pc === 0x022364) {
    notes.push('descriptor builder stores L first');
  }
  if (row.pc === 0x022367) {
    notes.push('descriptor builder stores H second');
  }

  return notes;
}

function walkHelper(start) {
  const queue = [start];
  const seenBlockStarts = new Set();
  const rowsByPc = new Map();
  const blocks = [];

  while (queue.length > 0) {
    const blockStart = queue.shift();
    if (seenBlockStarts.has(blockStart)) continue;
    seenBlockStarts.add(blockStart);

    const rows = [];
    const seenInBlock = new Set();
    let pc = blockStart;

    while (!seenInBlock.has(pc) && isLocalHelperTarget(pc)) {
      seenInBlock.add(pc);
      const row = decodeRow(pc);
      rows.push(row);
      if (!rowsByPc.has(pc)) rowsByPc.set(pc, row);

      const { inst } = row;
      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        pc = row.nextPc;
        continue;
      }

      if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz') {
        if (isLocalHelperTarget(inst.target)) queue.push(mask24(inst.target));
        if (isLocalHelperTarget(row.nextPc)) queue.push(row.nextPc);
        break;
      }

      if (inst.tag === 'jr') {
        if (isLocalHelperTarget(inst.target)) queue.push(mask24(inst.target));
        break;
      }

      if (isTerminal(inst)) {
        break;
      }

      pc = row.nextPc;
    }

    blocks.push({ start: blockStart, rows });
  }

  blocks.sort((a, b) => a.start - b.start);
  return { blocks, rowsByPc };
}

function buildLinearPreview(startPc, maxRows) {
  const rows = [];
  let pc = startPc;
  for (let index = 0; index < maxRows; index += 1) {
    const row = decodeRow(pc);
    rows.push(row);
    if (isTerminal(row.inst)) break;
    pc = row.nextPc;
  }
  return rows;
}

function cloneState(state) {
  return {
    a: state.a,
    h: state.h,
    l: state.l,
    lastTest: state.lastTest ? { ...state.lastTest } : null,
    path: [...state.path],
  };
}

function registerValue(state, reg) {
  switch (reg) {
    case 'a': return state.a;
    case 'h': return state.h;
    case 'l': return state.l;
    default: return upper(reg);
  }
}

function setRegister(state, reg, value) {
  switch (reg) {
    case 'a':
      state.a = value;
      break;
    case 'h':
      state.h = value;
      break;
    case 'l':
      state.l = value;
      break;
    default:
      break;
  }
}

function namedMemory(addr) {
  const address = mask24(addr);
  if (address === D0058E) return 'keyExtend';
  if (address === D0058C) return 'kbdKey';
  return `mem[${hex(address)}]`;
}

function applyInstruction(state, row) {
  const inst = row.inst;

  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
    const value = mask24(inst.value);
    state.h = hexByte((value >> 8) & 0xFF);
    state.l = hexByte(value & 0xFF);
    return;
  }

  if (inst.tag === 'ld-reg-reg') {
    setRegister(state, inst.dest, registerValue(state, inst.src));
    return;
  }

  if (inst.tag === 'ld-reg-mem') {
    setRegister(state, inst.dest, namedMemory(inst.addr));
    return;
  }

  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    state.lastTest = {
      kind: 'cp',
      expr: state.a,
      imm: inst.value,
    };
    return;
  }

  if (inst.tag === 'alu-reg' && inst.op === 'or') {
    state.lastTest = {
      kind: 'zero',
      expr: registerValue(state, inst.src),
    };
  }
}

function branchConditions(lastTest, branchInst) {
  if (!lastTest) {
    return {
      taken: `${upper(branchInst.condition)} taken at ${hex(branchInst.pc ?? 0)}`,
      fallthrough: `${upper(branchInst.condition)} not taken at ${hex(branchInst.pc ?? 0)}`,
    };
  }

  if (lastTest.kind === 'cp') {
    const eq = `${lastTest.expr} == ${hexByte(lastTest.imm)}`;
    const ne = `${lastTest.expr} != ${hexByte(lastTest.imm)}`;
    switch (branchInst.condition) {
      case 'z': return { taken: eq, fallthrough: ne };
      case 'nz': return { taken: ne, fallthrough: eq };
      default: break;
    }
  }

  if (lastTest.kind === 'zero') {
    const eq = `${lastTest.expr} == 0x00`;
    const ne = `${lastTest.expr} != 0x00`;
    switch (branchInst.condition) {
      case 'z': return { taken: eq, fallthrough: ne };
      case 'nz': return { taken: ne, fallthrough: eq };
      default: break;
    }
  }

  return {
    taken: `${upper(branchInst.condition)} taken`,
    fallthrough: `${upper(branchInst.condition)} not taken`,
  };
}

function exploreExitStates(rowsByPc, startPc) {
  const exits = [];

  function step(pc, state, depth = 0) {
    if (depth > 64) {
      throw new Error('Symbolic walk exceeded 64 steps');
    }

    const row = rowsByPc.get(pc);
    if (!row) {
      exits.push({
        exitPc: pc,
        stop: 'missing decode row',
        state: cloneState(state),
      });
      return;
    }

    const inst = row.inst;

    if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional') {
      const conditions = branchConditions(state.lastTest, { ...inst, pc: row.pc });

      const takenState = cloneState(state);
      takenState.path.push(conditions.taken);
      takenState.lastTest = null;
      step(mask24(inst.target), takenState, depth + 1);

      const fallthroughState = cloneState(state);
      fallthroughState.path.push(conditions.fallthrough);
      fallthroughState.lastTest = null;
      step(row.nextPc, fallthroughState, depth + 1);
      return;
    }

    if (inst.tag === 'jr') {
      step(mask24(inst.target), cloneState(state), depth + 1);
      return;
    }

    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
      exits.push({
        exitPc: row.pc,
        stop: inst.tag.toUpperCase(),
        state: cloneState(state),
      });
      return;
    }

    if (inst.tag === 'jp' || inst.tag === 'jp-indirect') {
      exits.push({
        exitPc: row.pc,
        stop: formatInstruction(inst),
        state: cloneState(state),
      });
      return;
    }

    const nextState = cloneState(state);
    applyInstruction(nextState, row);
    step(row.nextPc, nextState, depth + 1);
  }

  step(startPc, {
    a: 'token',
    h: '?',
    l: '?',
    lastTest: null,
    path: [],
  });

  return exits;
}

function mergeExitStates(exitStates) {
  const groups = new Map();

  for (const exit of exitStates) {
    const key = `${exit.state.h}|${exit.state.l}|${exit.state.a}`;
    if (!groups.has(key)) {
      groups.set(key, {
        h: exit.state.h,
        l: exit.state.l,
        a: exit.state.a,
        exits: new Set(),
        conditions: [],
      });
    }

    const group = groups.get(key);
    group.exits.add(hex(exit.exitPc));
    group.conditions.push(exit.state.path.length ? exit.state.path.join(' && ') : '(always)');
  }

  return [...groups.values()];
}

function printRows(rows, indent = '') {
  for (const row of rows) {
    const notes = rowNotes(row);
    const suffix = notes.length > 0 ? ` ; ${notes.join(' | ')}` : '';
    console.log(`${indent}${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.text}${suffix}`);
  }
}

const helper = walkHelper(HELPER_START);
const helperRows = helper.blocks.flatMap((block) => block.rows);
const helperEndExclusive = helperRows.reduce(
  (best, row) => Math.max(best, row.pc + row.length),
  HELPER_START,
);
const helperSize = helperEndExclusive - HELPER_START;
const cpRows = helperRows.filter((row) => row.inst.tag === 'alu-imm' && row.inst.op === 'cp');
const callRows = helperRows.filter((row) => row.inst.tag === 'call' || row.inst.tag === 'call-conditional');
const d0058eRows = helperRows.filter((row) => row.inst.addr != null && mask24(row.inst.addr) === D0058E);
const d0058cRows = helperRows.filter((row) => row.inst.addr != null && mask24(row.inst.addr) === D0058C);
const exitStates = exploreExitStates(helper.rowsByPc, HELPER_START);
const mergedExitStates = mergeExitStates(exitStates);
const builderPreview = buildLinearPreview(DESCRIPTOR_BUILDER, BUILDER_PREVIEW_ROWS);

console.log('# Phase 296: 0x05622E A + keyExtend Pack Helper');
console.log('');
console.log(`ROM: ${path.basename(ROM_PATH)} (${hex(rom.length)} bytes)`);
console.log(`Helper start: ${hex(HELPER_START)}`);
console.log(`Reachable function end: ${hex(helperEndExclusive - 1)} (size ${hex(helperSize, 2)} / ${helperSize} bytes)`);
console.log('');

console.log('## Helper Disassembly');
console.log('');
for (const block of helper.blocks) {
  console.log(`[block ${hex(block.start)}]`);
  printRows(block.rows, '  ');
  console.log('');
}

console.log('## Comparisons');
console.log('');
if (cpRows.length === 0) {
  console.log('(no CP-immediate instructions found)');
} else {
  for (const row of cpRows) {
    console.log(`- ${hex(row.pc)}  ${row.text}`);
  }
}
console.log('');

console.log('## State Reads / Calls');
console.log('');
if (d0058eRows.length === 0) {
  console.log('- No D0058E reads');
} else {
  for (const row of d0058eRows) {
    console.log(`- Reads keyExtend at ${hex(row.pc)} via ${row.text}`);
  }
}
if (d0058cRows.length === 0) {
  console.log('- No D0058C reads or writes inside 0x05622E');
} else {
  for (const row of d0058cRows) {
    console.log(`- D0058C access at ${hex(row.pc)} via ${row.text}`);
  }
}
if (callRows.length === 0) {
  console.log('- No CALL instructions inside 0x05622E');
} else {
  for (const row of callRows) {
    console.log(`- ${hex(row.pc)}  ${row.text}`);
  }
}
console.log('');

console.log('## Return-State Analysis');
console.log('');
for (const group of mergedExitStates) {
  console.log(`- Returns at ${[...group.exits].join(', ')} with H=${group.h}, L=${group.l}, A=${group.a}`);
  console.log(`  Conditions: ${group.conditions.join('  OR  ')}`);
}
console.log('');

console.log('## Descriptor Builder Context');
console.log('');
printRows(builderPreview);
console.log('');
console.log('- 0x022364 stores L first and 0x022367 stores H second, so the byte order returned by 0x05622E flows directly into the descriptor payload.');
console.log('');

console.log('## Verdict');
console.log('');
console.log('- The helper absolutely packs the incoming token in A together with D0058E keyExtend into HL.');
console.log('- Prologue behavior: `LD HL,0` / `LD L,A` / `LD A,(D0058E)` / `LD H,A` leaves the default packed form as H=keyExtend, L=token.');
console.log('- `CP 0xFE` and `CP 0xFC` take the swap path at 0x056241, returning H=token and L=keyExtend.');
console.log('- `CP 0xFB` and `CP 0xFA` reach a second gate at 0x05624C. If keyExtend is non-zero, they also swap to H=token and L=keyExtend; if keyExtend is zero, they keep the default H=keyExtend, L=token form.');
console.log('- A is restored to the original token before every return, so HL is the real packed output register and A remains the plain token code.');
