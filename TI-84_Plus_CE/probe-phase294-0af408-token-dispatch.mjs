#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const ROM_SIZE = 0x400000;
const START_ADDR = 0x0AF408;
const MAX_INSTRUCTIONS = 500;

const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
const D007E0 = 0xD007E0;

const KNOWN_ADDRS = new Map([
  [D0058C, 'D0058C kbdKey'],
  [D0058E, 'D0058E keyExtend'],
  [D007E0, 'D007E0 context mode'],
]);

const rom = readFileSync(ROM_PATH);
if (rom.length !== ROM_SIZE) {
  throw new Error(`Expected ${hex(ROM_SIZE)} bytes in ROM.rom, got ${hex(rom.length)}`);
}

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

function formatSignedDisplacement(value) {
  const displacement = Number(value) || 0;
  return displacement < 0 ? `-${hex(Math.abs(displacement), 2)}` : `+${hex(displacement, 2)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${upper(indexRegister)}${formatSignedDisplacement(displacement)})`;
}

function addrLabel(addr) {
  const address = mask24(addr);
  if (KNOWN_ADDRS.has(address)) return `${hex(address)} [${KNOWN_ADDRS.get(address)}]`;
  return hex(address);
}

function isTrackedOsAddress(addr) {
  const address = mask24(addr);
  return (address >= 0xD00500 && address <= 0xD005FF)
    || (address >= 0xD00700 && address <= 0xD007FF);
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'alu-imm':
      return `${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-ixd':
      return `${upper(inst.op)} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${addrLabel(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${addrLabel(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${addrLabel(inst.addr)}), ${upper(inst.pair)}`
        : `LD ${upper(inst.pair)}, (${addrLabel(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${addrLabel(inst.addr)}), ${upper(inst.pair)}`;
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
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
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
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set':
      return `SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set-ind':
      return `SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res':
      return `RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res-ind':
      return `RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
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
    case 'sbc-pair':
      return `SBC HL, ${upper(inst.src)}`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ex-af':
      return "EX AF, AF'";
    case 'nop':
      return 'NOP';
    default: {
      const extras = { ...inst };
      delete extras.pc;
      delete extras.length;
      delete extras.nextPc;
      delete extras.mode;
      delete extras.modePrefix;
      return `${upper(inst?.tag ?? 'UNKNOWN')} ${JSON.stringify(extras)}`;
    }
  }
}

function createPointerState() {
  return {
    bc: null,
    de: null,
    hl: null,
    ix: null,
    iy: null,
    sp: null,
  };
}

function getPointer(state, pair) {
  return Object.prototype.hasOwnProperty.call(state, pair) ? state[pair] : null;
}

function setPointer(state, pair, value) {
  if (!Object.prototype.hasOwnProperty.call(state, pair)) return;
  state[pair] = value === null || value === undefined ? null : mask24(value);
}

function offsetPointer(state, pair, displacement = 0) {
  const base = getPointer(state, pair);
  return base === null ? null : mask24(base + Number(displacement || 0));
}

function invalidatePointerForRegister(state, reg) {
  if (reg === 'ixh' || reg === 'ixl') state.ix = null;
  if (reg === 'iyh' || reg === 'iyl') state.iy = null;
}

function updatePointerState(state, inst) {
  switch (inst?.tag) {
    case 'ld-pair-imm':
      setPointer(state, inst.pair, inst.value);
      return;
    case 'ld-pair-mem':
      if (inst.direction !== 'to-mem') setPointer(state, inst.pair, null);
      return;
    case 'ld-pair-ind':
    case 'ld-pair-indexed':
    case 'ld-ixiy-indexed':
      setPointer(state, inst.pair ?? inst.dest, null);
      return;
    case 'inc-pair': {
      const value = getPointer(state, inst.pair);
      if (value !== null) setPointer(state, inst.pair, value + 1);
      return;
    }
    case 'dec-pair': {
      const value = getPointer(state, inst.pair);
      if (value !== null) setPointer(state, inst.pair, value - 1);
      return;
    }
    case 'add-pair': {
      const destValue = getPointer(state, inst.dest);
      const srcValue = getPointer(state, inst.src);
      if (destValue !== null && srcValue !== null) setPointer(state, inst.dest, destValue + srcValue);
      else setPointer(state, inst.dest, null);
      return;
    }
    case 'lea': {
      const base = getPointer(state, inst.base);
      if (base !== null) setPointer(state, inst.dest, base + Number(inst.displacement || 0));
      else setPointer(state, inst.dest, null);
      return;
    }
    case 'ex-de-hl': {
      const de = state.de;
      state.de = state.hl;
      state.hl = de;
      return;
    }
    case 'pop':
      setPointer(state, inst.pair, null);
      return;
    case 'ex-sp-pair':
      setPointer(state, inst.pair, null);
      state.sp = null;
      return;
    case 'ld-sp-pair':
      setPointer(state, 'sp', getPointer(state, inst.pair));
      return;
    case 'ld-reg-imm':
    case 'ld-reg-reg':
    case 'inc-reg':
    case 'dec-reg':
      invalidatePointerForRegister(state, inst.dest ?? inst.reg);
      return;
    default:
      return;
  }
}

function pushStateRef(refs, rowAddr, osAddr, access, via) {
  if (osAddr === null || osAddr === undefined) return;
  const address = mask24(osAddr);
  if (!isTrackedOsAddress(address)) return;
  refs.push({
    rowAddr,
    osAddr: address,
    access,
    via,
  });
}

function collectStateRefs(rowAddr, inst, pointerState) {
  const refs = [];

  switch (inst?.tag) {
    case 'ld-reg-mem':
      pushStateRef(refs, rowAddr, inst.addr, 'read', 'direct');
      break;
    case 'ld-mem-reg':
      pushStateRef(refs, rowAddr, inst.addr, 'write', 'direct');
      break;
    case 'ld-pair-mem':
      pushStateRef(
        refs,
        rowAddr,
        inst.addr,
        inst.direction === 'to-mem' ? 'write' : 'read',
        `direct ${upper(inst.pair)}`
      );
      break;
    case 'ld-mem-pair':
      pushStateRef(refs, rowAddr, inst.addr, 'write', `direct ${upper(inst.pair)}`);
      break;
    case 'ld-pair-imm':
      pushStateRef(refs, rowAddr, inst.value, 'pointer', `load ${upper(inst.pair)}`);
      break;
    case 'ld-reg-ind':
      pushStateRef(refs, rowAddr, getPointer(pointerState, inst.src), 'read', `(${upper(inst.src)})`);
      break;
    case 'ld-ind-reg':
      pushStateRef(refs, rowAddr, getPointer(pointerState, inst.dest), 'write', `(${upper(inst.dest)})`);
      break;
    case 'ld-ind-imm':
      pushStateRef(refs, rowAddr, getPointer(pointerState, 'hl'), 'write', '(HL)');
      break;
    case 'alu-reg':
      if (inst.src === '(hl)') pushStateRef(refs, rowAddr, getPointer(pointerState, 'hl'), 'read', '(HL)');
      break;
    case 'alu-ixd':
      pushStateRef(
        refs,
        rowAddr,
        offsetPointer(pointerState, inst.indexRegister, inst.displacement),
        'read',
        formatIndexed(inst.indexRegister, inst.displacement)
      );
      break;
    case 'ld-reg-ixd':
      pushStateRef(
        refs,
        rowAddr,
        offsetPointer(pointerState, inst.indexRegister, inst.displacement),
        'read',
        formatIndexed(inst.indexRegister, inst.displacement)
      );
      break;
    case 'ld-ixd-reg':
    case 'ld-ixd-imm':
      pushStateRef(
        refs,
        rowAddr,
        offsetPointer(pointerState, inst.indexRegister, inst.displacement),
        'write',
        formatIndexed(inst.indexRegister, inst.displacement)
      );
      break;
    case 'indexed-cb-bit':
      pushStateRef(
        refs,
        rowAddr,
        offsetPointer(pointerState, inst.indexRegister, inst.displacement),
        'read',
        formatIndexed(inst.indexRegister, inst.displacement)
      );
      break;
    case 'indexed-cb-set':
    case 'indexed-cb-res':
      pushStateRef(
        refs,
        rowAddr,
        offsetPointer(pointerState, inst.indexRegister, inst.displacement),
        'read/write',
        formatIndexed(inst.indexRegister, inst.displacement)
      );
      break;
    case 'bit-test-ind':
      pushStateRef(refs, rowAddr, getPointer(pointerState, inst.indirectRegister), 'read', `(${upper(inst.indirectRegister)})`);
      break;
    case 'bit-set-ind':
    case 'bit-res-ind':
      pushStateRef(
        refs,
        rowAddr,
        getPointer(pointerState, inst.indirectRegister),
        'read/write',
        `(${upper(inst.indirectRegister)})`
      );
      break;
    default:
      break;
  }

  return refs;
}

function getCpDescriptor(inst) {
  if (inst?.tag === 'alu-imm' && inst.op === 'cp') {
    return {
      comparedText: hexByte(inst.value),
      comparedValue: inst.value,
    };
  }

  if (inst?.tag === 'alu-reg' && inst.op === 'cp') {
    return {
      comparedText: inst.src === '(hl)' ? '(HL)' : upper(inst.src),
      comparedValue: null,
    };
  }

  if (inst?.tag === 'alu-ixd' && inst.op === 'cp') {
    return {
      comparedText: formatIndexed(inst.indexRegister, inst.displacement),
      comparedValue: null,
    };
  }

  return null;
}

function isConditionalBranch(inst) {
  return inst?.tag === 'jr-conditional' || inst?.tag === 'jp-conditional';
}

function isStopInstruction(inst) {
  return inst?.tag === 'ret'
    || inst?.tag === 'reti'
    || inst?.tag === 'retn'
    || inst?.tag === 'jp'
    || inst?.tag === 'jp-indirect';
}

function describeStop(inst, pc) {
  if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
    return `${upper(inst.tag)} at ${hex(pc)}`;
  }
  if (inst.tag === 'jp') return `JP ${hex(inst.target)} at ${hex(pc)}`;
  if (inst.tag === 'jp-indirect') return `JP (${upper(inst.indirectRegister)}) at ${hex(pc)}`;
  return `stopped at ${hex(pc)}`;
}

function getEqualTarget(branchInst) {
  switch (branchInst?.condition) {
    case 'z':
    case 'nc':
      return branchInst.target;
    case 'nz':
    case 'c':
      return branchInst.fallthrough;
    default:
      return null;
  }
}

function getCascadeFallthrough(branchInst) {
  switch (branchInst?.condition) {
    case 'z':
    case 'nc':
      return branchInst.fallthrough;
    case 'nz':
    case 'c':
      return branchInst.target;
    default:
      return branchInst?.fallthrough ?? null;
  }
}

function getCascadeNote(branchInst) {
  switch (branchInst?.condition) {
    case 'z':
      return 'exact-match branch';
    case 'nz':
      return 'exact-match case falls through; NZ skips to the next case';
    case 'nc':
      return 'range gate; equal and greater both take NC';
    case 'c':
      return 'range gate; less-than takes C';
    default:
      return 'non-standard post-CP branch condition';
  }
}

function buildCpCascadeMap(rows) {
  const entries = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.cp) continue;

    const nextRow = rows[index + 1] ?? null;
    if (!nextRow || !isConditionalBranch(nextRow.inst)) {
      entries.push({
        cpAddr: row.pc,
        comparedText: row.cp.comparedText,
        comparedValue: row.cp.comparedValue,
        branchAddr: null,
        branchCondition: null,
        branchTarget: null,
        equalTarget: null,
        cascadeFallthrough: null,
        note: 'no immediate conditional branch after CP',
      });
      continue;
    }

    entries.push({
      cpAddr: row.pc,
      comparedText: row.cp.comparedText,
      comparedValue: row.cp.comparedValue,
      branchAddr: nextRow.pc,
      branchCondition: nextRow.inst.condition,
      branchTarget: nextRow.inst.target,
      equalTarget: getEqualTarget(nextRow.inst),
      cascadeFallthrough: getCascadeFallthrough(nextRow.inst),
      note: getCascadeNote(nextRow.inst),
    });
  }

  return entries;
}

function formatRowNotes(row) {
  const notes = [];

  if (row.cp) notes.push(`CP compare ${row.cp.comparedText}`);
  if (row.stateRefs.some((ref) => ref.osAddr === D0058E && ref.access !== 'write')) {
    notes.push('reads D0058E keyExtend');
  }

  for (const ref of row.stateRefs) {
    notes.push(`${ref.access} ${addrLabel(ref.osAddr)} via ${ref.via}`);
  }

  if (row.inst.tag === 'call') notes.push(`CALL target ${hex(row.inst.target)}`);
  if (row.inst.tag === 'call-conditional') {
    notes.push(`CALL ${upper(row.inst.condition)} target ${hex(row.inst.target)}`);
  }
  if (isConditionalBranch(row.inst)) {
    notes.push(`branch ${upper(row.inst.condition)} -> ${hex(row.inst.target)} ; fall-through ${hex(row.inst.fallthrough)}`);
  }
  if (row.inst.tag === 'jr') {
    notes.push(`unconditional JR -> ${hex(row.inst.target)} ; linear decode continues at ${hex(row.pc + row.length)}`);
  }
  if (row.inst.tag === 'jp') {
    notes.push(`stop on unconditional JP -> ${hex(row.inst.target)}`);
  }

  return notes.join('; ');
}

const rows = [];
const pointerState = createPointerState();
let pc = START_ADDR;
let stopReason = `hit instruction limit ${MAX_INSTRUCTIONS}`;

for (let instructionCount = 0; instructionCount < MAX_INSTRUCTIONS; instructionCount += 1) {
  const inst = decodeInstruction(rom, pc, 'adl');
  const length = Number(inst?.length || 0);

  if (!inst || !length) {
    throw new Error(`Decoder returned an invalid instruction at ${hex(pc)}`);
  }

  const stateRefs = collectStateRefs(pc, inst, pointerState);
  const row = {
    pc,
    length,
    bytes: bytesToHex(rom.subarray(pc, pc + length)),
    inst,
    text: formatInstruction(inst),
    cp: getCpDescriptor(inst),
    stateRefs,
  };
  row.notes = formatRowNotes(row);
  rows.push(row);

  updatePointerState(pointerState, inst);

  if (isStopInstruction(inst)) {
    stopReason = describeStop(inst, pc);
    break;
  }

  pc += length;
}

const cpCascadeMap = buildCpCascadeMap(rows);
const callSites = rows
  .filter((row) => row.inst.tag === 'call' || row.inst.tag === 'call-conditional')
  .map((row) => ({
    site: row.pc,
    target: row.inst.target,
    condition: row.inst.condition ?? null,
  }));
const callTargetSet = [...new Set(callSites.map((entry) => entry.target))];
const allStateRefs = rows.flatMap((row) => row.stateRefs);
const cpValuesFound = cpCascadeMap.map((entry) => entry.comparedText);
const lastRow = rows.at(-1) ?? null;
const endExclusive = lastRow ? lastRow.pc + lastRow.length : START_ADDR;
const endInclusive = endExclusive > START_ADDR ? endExclusive - 1 : START_ADDR;
const cascadeDetected = cpCascadeMap.length >= 2;

console.log('# Phase 294: 0x0AF408 Token Dispatcher');
console.log('');
console.log(`ROM: ${path.basename(ROM_PATH)} (${hex(rom.length)} bytes)`);
console.log(`Start address: ${hex(START_ADDR)}`);
console.log(`Stop reason: ${stopReason}`);
console.log(`Instruction count: ${rows.length}`);
console.log(`Byte range: ${hex(START_ADDR)}-${hex(endInclusive)} (${endExclusive - START_ADDR} bytes)`);
console.log(`CP cascade detected: ${cascadeDetected ? 'YES' : 'NO'}`);
console.log('');

console.log('## Linear Trace');
console.log('');
for (const row of rows) {
  const noteText = row.notes ? ` ; ${row.notes}` : '';
  console.log(`${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${noteText}`);
}
console.log('');

console.log('## CP Values');
console.log('');
console.log(cpValuesFound.length ? cpValuesFound.join(', ') : '(none)');
console.log('');

console.log('## CALL Targets');
console.log('');
if (!callSites.length) {
  console.log('(none)');
} else {
  for (const entry of callSites) {
    const prefix = entry.condition ? `CALL ${upper(entry.condition)}` : 'CALL';
    console.log(`${hex(entry.site)}  ${prefix} -> ${hex(entry.target)}`);
  }
}
console.log('');

console.log('## CP Cascade Map');
console.log('');
if (!cpCascadeMap.length) {
  console.log('(none)');
} else {
  for (const entry of cpCascadeMap) {
    const branchText = entry.branchAddr === null
      ? 'no branch'
      : `${hex(entry.branchAddr)} ${upper(entry.branchCondition)} -> ${hex(entry.branchTarget)}`;
    const equalTarget = entry.equalTarget === null ? '(unknown)' : hex(entry.equalTarget);
    const fallthrough = entry.cascadeFallthrough === null ? '(unknown)' : hex(entry.cascadeFallthrough);
    console.log(
      `${hex(entry.cpAddr)}  CP ${entry.comparedText}  | branch ${branchText} | equal -> ${equalTarget} | fall-through -> ${fallthrough} | ${entry.note}`
    );
  }
}
console.log('');

console.log('## D005xx / D007xx References');
console.log('');
if (!allStateRefs.length) {
  console.log('(none in the linear 0x0AF408 block)');
} else {
  for (const ref of allStateRefs) {
    console.log(`${hex(ref.rowAddr)}  ${ref.access.padEnd(10)}  ${addrLabel(ref.osAddr)}  via ${ref.via}`);
  }
}
console.log('');

console.log('## Summary');
console.log('');
console.log(`Total instruction count: ${rows.length}`);
console.log(`Byte range: ${hex(START_ADDR)}-${hex(endInclusive)}`);
console.log(`All CP values found: ${cpValuesFound.length ? cpValuesFound.join(', ') : '(none)'}`);
console.log(`All CALL targets: ${callTargetSet.length ? callTargetSet.map((target) => hex(target)).join(', ') : '(none)'}`);
console.log(
  `All D005xx/D007xx references: ${allStateRefs.length ? allStateRefs.map((ref) => `${addrLabel(ref.osAddr)} @ ${hex(ref.rowAddr)}`).join(', ') : '(none)'}`
);
