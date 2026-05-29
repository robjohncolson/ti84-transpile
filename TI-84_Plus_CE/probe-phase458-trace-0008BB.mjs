#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = fs.readFileSync(ROM_PATH);

const MODE = 'adl';
const START_PC = 0x0008BB;
const MAX_INSTRUCTIONS = 200;
const SCAN_CODE_ADDR = 0xD00587;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesToHex(pc, length) {
  return Array.from(
    rom.subarray(pc, Math.min(rom.length, pc + Math.max(length, 0))),
    (byte) => ((byte ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatSigned(value) {
  const n = Number(value ?? 0);
  const abs = Math.abs(n).toString(16).toUpperCase();
  return `${n >= 0 ? '+' : '-'}0x${abs}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toLowerCase()}${formatSigned(displacement)})`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `.${String(inst.modePrefix).toLowerCase()} ${text}` : text;
}

function safeDecode(pc) {
  if (pc < 0 || pc >= rom.length) return null;
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) return null;
    return inst;
  } catch {
    return null;
  }
}

function renderInstruction(inst) {
  switch (inst?.tag) {
    case 'nop':
    case 'halt':
    case 'slp':
    case 'di':
    case 'ei':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
    case 'stmix':
    case 'rsmix':
    case 'exx':
      return inst.tag;

    case 'ret-conditional':
      return withPrefix(inst, `ret ${inst.condition}`);
    case 'jr':
      return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'djnz':
      return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'call':
      return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'rst':
      return withPrefix(inst, `rst ${hexByte(inst.target)}`);

    case 'push':
      return withPrefix(inst, `push ${inst.pair}`);
    case 'pop':
      return withPrefix(inst, `pop ${inst.pair}`);

    case 'ld-pair-imm':
      return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-ind-imm':
      return withPrefix(inst, `ld (hl), ${hexByte(inst.value)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
      }
      return withPrefix(inst, `ld ${inst.pair}, (${hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
    case 'ld-pair-ind':
      return withPrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-ind-pair':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-sp-hl':
      return withPrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair':
      return withPrefix(inst, `ld sp, ${inst.pair}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`);
    case 'ld-ixiy-indexed':
      return withPrefix(inst, `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-ixiy':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'ld-special':
      return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-mb-a':
      return withPrefix(inst, 'ld mb, a');
    case 'ld-a-mb':
      return withPrefix(inst, 'ld a, mb');

    case 'inc-pair':
      return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair':
      return withPrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg':
      return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg':
      return withPrefix(inst, `dec ${inst.reg}`);
    case 'inc-ixd':
      return withPrefix(inst, `inc ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'dec-ixd':
      return withPrefix(inst, `dec ${formatIndexed(inst.indexRegister, inst.displacement)}`);

    case 'add-pair':
      return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'adc-pair':
      return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'sbc-pair':
      return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'alu-reg':
      return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-imm':
      return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-ixd':
      return withPrefix(inst, `${inst.op} ${formatIndexed(inst.indexRegister, inst.displacement)}`);

    case 'bit-test':
      return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind':
      return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set':
      return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind':
      return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res':
      return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind':
      return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'rotate-reg':
      return withPrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rotate-ind':
      return withPrefix(inst, `${inst.op} (${inst.indirectRegister})`);
    case 'indexed-cb-rotate':
      return withPrefix(inst, `${inst.operation ?? inst.op ?? 'rotate'} ${formatIndexed(inst.indexRegister, inst.displacement)}`);

    case 'in-reg':
      return withPrefix(inst, `in ${inst.reg}, (c)`);
    case 'out-reg':
      return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'in-imm':
      return withPrefix(inst, `in a, (${hexByte(inst.port)})`);
    case 'out-imm':
      return withPrefix(inst, `out (${hexByte(inst.port)}), a`);
    case 'in0':
      return withPrefix(inst, `in0 ${inst.reg}, (${hexByte(inst.port)})`);
    case 'out0':
      return withPrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);

    case 'ex-af':
      return withPrefix(inst, "ex af, af'");
    case 'ex-de-hl':
      return withPrefix(inst, 'ex de, hl');
    case 'ex-sp-hl':
      return withPrefix(inst, 'ex (sp), hl');
    case 'ex-sp-pair':
      return withPrefix(inst, `ex (sp), ${inst.pair}`);

    case 'im':
      return withPrefix(inst, `im ${inst.value}`);
    case 'mlt':
      return withPrefix(inst, `mlt ${inst.reg}`);
    case 'tst-reg':
      return withPrefix(inst, `tst a, ${inst.reg}`);
    case 'tst-ind':
      return withPrefix(inst, 'tst a, (hl)');
    case 'tst-imm':
      return withPrefix(inst, `tst a, ${hexByte(inst.value)}`);
    case 'tstio':
      return withPrefix(inst, `tstio ${hexByte(inst.value)}`);
    case 'lea':
      return withPrefix(inst, `lea ${inst.dest}, ${formatIndexed(inst.base, inst.displacement)}`);
    case 'pea':
      return withPrefix(inst, `pea ${inst.base}${formatSigned(inst.displacement)}`);

    default:
      return withPrefix(inst, inst?.tag ?? '(decode failed)');
  }
}

function isStopInstruction(inst) {
  return inst && (
    inst.tag === 'ret' ||
    inst.tag === 'reti' ||
    inst.tag === 'retn' ||
    inst.tag === 'jp'
  );
}

function isIyFlagOp(inst) {
  return inst && (
    (inst.tag === 'indexed-cb-bit' || inst.tag === 'indexed-cb-set' || inst.tag === 'indexed-cb-res') &&
    String(inst.indexRegister).toLowerCase() === 'iy' &&
    Number(inst.displacement) === 0
  );
}

function isCpInstruction(inst) {
  return inst && (
    (inst.tag === 'alu-reg' && inst.op === 'cp') ||
    (inst.tag === 'alu-imm' && inst.op === 'cp') ||
    inst.tag === 'cpi' ||
    inst.tag === 'cpd' ||
    inst.tag === 'cpir' ||
    inst.tag === 'cpdr'
  );
}

const rows = [];
const callNotes = [];
const scanReadNotes = [];
const iyFlagNotes = [];
const cpNotes = [];

let pc = START_PC;
let stopReason = 'max-instructions';

for (let index = 0; index < MAX_INSTRUCTIONS; index += 1) {
  const inst = safeDecode(pc);
  if (!inst) {
    rows.push({
      pc,
      bytes: bytesToHex(pc, 1),
      text: '(decode failed)',
      inst: null,
    });
    stopReason = 'decode-failed';
    break;
  }

  const row = {
    pc,
    bytes: bytesToHex(pc, inst.length),
    text: renderInstruction(inst),
    inst,
  };
  rows.push(row);

  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    callNotes.push(`${hex(pc)}: ${row.text}`);
  }
  if (inst.tag === 'ld-reg-mem' && String(inst.dest).toLowerCase() === 'a' && Number(inst.addr) === SCAN_CODE_ADDR) {
    scanReadNotes.push(`${hex(pc)}: ${row.text}`);
  }
  if (isIyFlagOp(inst)) {
    iyFlagNotes.push(`${hex(pc)}: ${row.text}`);
  }
  if (isCpInstruction(inst)) {
    cpNotes.push(`${hex(pc)}: ${row.text}`);
  }

  if (isStopInstruction(inst)) {
    stopReason = `stop-on-${inst.tag}`;
    break;
  }

  pc += inst.length;
}

const endRow = rows.at(-1);
const endPc = endRow ? endRow.pc + (endRow.inst?.length ?? 1) : START_PC;
const byteSize = endPc - START_PC;

console.log('0x0008BB linear disassembly');
console.log(`rom: ${ROM_PATH}`);
console.log(`start: ${hex(START_PC)}`);
console.log(`mode: ${MODE}`);
console.log(`instructions: ${rows.length}`);
console.log(`span: ${hex(START_PC)}..${hex(endPc - 1)} (${byteSize} bytes)`);
console.log(`stop: ${stopReason}`);
console.log('');

for (const row of rows) {
  console.log(`${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
}

console.log('');
console.log('Notes');
console.log(`- LD A,(0xD00587): ${scanReadNotes.length ? scanReadNotes.join('; ') : 'none in this linear block'}`);
console.log(`- CALL targets: ${callNotes.length ? callNotes.join('; ') : 'none in this linear block'}`);
console.log(`- BIT/SET/RES on (IY+0): ${iyFlagNotes.length ? iyFlagNotes.join('; ') : 'none in this linear block'}`);
console.log(`- CP instructions: ${cpNotes.length ? cpNotes.join('; ') : 'none; comparison is done with OR A + .sil SBC HL, BC'}`);
