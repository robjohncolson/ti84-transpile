import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase595b-meminit-gate-and-predicate.md');
const rom = fs.readFileSync(ROM_PATH);

const IY = 0xd00080;

function hx(n, w = 6) {
  return `0x${(n >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function bytes(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function disp(d) {
  return d < 0 ? `${d}` : `+${d}`;
}

function indexedAddr(inst) {
  if (inst.indexRegister !== 'iy' || typeof inst.displacement !== 'number') return '';
  return ` ; IY${disp(inst.displacement)} = ${hx(IY + inst.displacement)}`;
}

function fmtValue(v) {
  return typeof v === 'number' ? hx(v, v > 0xffff ? 6 : v > 0xff ? 4 : 2) : String(v);
}

function fmt(inst) {
  const c = inst.condition ? inst.condition.toUpperCase() : '';
  switch (inst.tag) {
    case 'call': return `CALL ${hx(inst.target)}`;
    case 'call-conditional': return `CALL ${c},${hx(inst.target)}`;
    case 'jr': return `JR ${hx(inst.target)}`;
    case 'jr-conditional': return `JR ${c},${hx(inst.target)}`;
    case 'jp': return `JP ${hx(inst.target)}`;
    case 'jp-conditional': return `JP ${c},${hx(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${c}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()},(${hx(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hx(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'ld-pair-mem': return inst.direction === 'to-mem'
      ? `LD (${hx(inst.addr)}),${inst.pair.toUpperCase()}`
      : `LD ${inst.pair.toUpperCase()},(${hx(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hx(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()},${fmtValue(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()},${fmtValue(inst.value)}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()},(${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${inst.dest.toUpperCase()},(${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})${indexedAddr(inst)}`;
    case 'ld-ixd-reg': return `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}),${inst.src.toUpperCase()}${indexedAddr(inst)}`;
    case 'ld-ixd-imm': return `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}),${fmtValue(inst.value)}${indexedAddr(inst)}`;
    case 'ld-pair-indexed': return `LD ${inst.pair.toUpperCase()},(${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})${indexedAddr(inst)}`;
    case 'ld-indexed-pair': return `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}),${inst.pair.toUpperCase()}${indexedAddr(inst)}`;
    case 'ld-ixiy-indexed': return `LD ${inst.dest.toUpperCase()},(${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})${indexedAddr(inst)}`;
    case 'ld-indexed-ixiy': return `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}),${inst.src.toUpperCase()}${indexedAddr(inst)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${fmtValue(inst.value)}`;
    case 'alu-ixd': return `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})${indexedAddr(inst)}`;
    case 'bit-test': return `BIT ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit},(${inst.reg.toUpperCase()})`;
    case 'indexed-cb-bit': return `BIT ${inst.bit},(${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})${indexedAddr(inst)}`;
    case 'indexed-cb-res': return `RES ${inst.bit},(${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})${indexedAddr(inst)}`;
    case 'indexed-cb-set': return `SET ${inst.bit},(${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})${indexedAddr(inst)}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'nop': return 'NOP';
    default: return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function disasm(start, endOrMax, stopAtPlainRet = false) {
  const rows = [];
  let pc = start;
  const end = endOrMax < start ? start + endOrMax : endOrMax;
  while (pc < end && pc < rom.length) {
    const inst = decodeInstruction(rom, pc, 'adl');
    rows.push({ pc, inst, asm: fmt(inst), raw: bytes(pc, inst.length) });
    pc += inst.length || 1;
    if (stopAtPlainRet && inst.tag === 'ret') break;
  }
  return rows;
}

function isConditionalBranch(inst) {
  return ['jr-conditional', 'jp-conditional', 'call-conditional', 'ret-conditional', 'djnz'].includes(inst.tag);
}

const memRows = disasm(0x09dd14, 0x09ddc0);
const predRows = disasm(0x06c732, 100, true);
const branchesToCall = memRows.filter((r) => r.pc < 0x09dd62 && isConditionalBranch(r.inst));

const lines = [];
const say = (s = '') => lines.push(s);

say('# Phase595b MEM_INIT gate and home predicate');
say('');
say(`ROM: ${ROM_PATH}`);
say('');
say('## Job 1: 0x09DD14 disassembly');
for (const r of memRows) say(`${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}`);
say('');
say('### Conditional branches before CALL 0x09DEE0');
for (const r of branchesToCall) say(`- ${hx(r.pc)}: ${r.asm}`);
say('');
say('### Gate conclusion');
say('There is no conditional branch between `0x09DD14` and `0x09DD62` in this ROM image. Static ADL-mode decode falls through directly from the function entry to `0x09DD62: CALL 0x09DEE0`.');
say('');
say('Conclusion: no RAM byte or IY flag in this decoded range gates the MEM_INIT call. If a dynamic run of `0x09DD14` completed without executing MEM_INIT writes, the diversion is not a conditional branch in `0x09DD14..0x09DD62`; it must come from the harness entry state, call/return handling, an exception/unsupported instruction outside this pre-call slice, or the MEM_INIT routine itself not performing the expected writes under that seed.');
say('');
say('Seed to reach the call from this entry: none beyond normal sequential execution. The decoded range sets `IY = 0xD00080` itself at `0x09DD33` before the call.');
say('');
say('## Job 2: 0x06C732 disassembly');
for (const r of predRows) say(`${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}`);
say('');
say('### Predicate conclusion');
say('`0x06C732` is exactly `BIT 7,(IY+2); RET`. With `IY = 0xD00080`, it reads `0xD00082` bit 7 and returns immediately. No later instruction changes flags before the plain `RET`.');
say('');
say('Return condition: `NZ` iff `(0xD00082 & 0x80) != 0`; `Z` iff bit 7 of `0xD00082` is clear.');

const report = lines.join('\n') + '\n';
console.log(report);
fs.writeFileSync(REPORT_PATH, report);
