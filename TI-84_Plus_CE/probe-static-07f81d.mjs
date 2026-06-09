import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase595-populator-gate-analysis.md');
const rom = fs.readFileSync(ROM_PATH);

const START = 0x07f81d;
const MAX_BYTES = 150;
const TABLE = 0x044a6e;

function hx(n, w = 6) {
  return `0x${(n >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function bytes(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function u24(pc) {
  return rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
}

function inRam(addr) {
  return addr >= 0xd00000 && addr <= 0xd3ffff;
}

function fmtValue(v) {
  return typeof v === 'number' ? hx(v, v > 0xffff ? 6 : v > 0xff ? 4 : 2) : String(v);
}

function memAccess(inst) {
  if (typeof inst.addr === 'number' && inRam(inst.addr)) {
    if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') return [{ addr: inst.addr, access: 'write' }];
    return [{ addr: inst.addr, access: 'read' }];
  }
  if (typeof inst.value === 'number' && inRam(inst.value) && inst.tag === 'ld-pair-imm') {
    return [{ addr: inst.value, access: 'pointer' }];
  }
  return [];
}

function fmt(inst) {
  const c = inst.condition ? ` ${inst.condition.toUpperCase()}` : '';
  switch (inst.tag) {
    case 'call': return `CALL ${hx(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()},${hx(inst.target)}`;
    case 'jr': return `JR ${hx(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()},${hx(inst.target)}`;
    case 'jp': return `JP ${hx(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()},${hx(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET${c}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()},(${hx(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hx(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()},${fmtValue(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()},${fmtValue(inst.value)}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()},(${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${fmtValue(inst.value)}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'djnz': return `DJNZ ${hx(inst.target)}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ccf': return 'CCF';
    case 'scf': return 'SCF';
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'indexed-cb-set': return `SET ${inst.bit},(${inst.indexRegister.toUpperCase()}${inst.displacement < 0 ? '' : '+'}${inst.displacement})`;
    case 'indexed-cb-res': return `RES ${inst.bit},(${inst.indexRegister.toUpperCase()}${inst.displacement < 0 ? '' : '+'}${inst.displacement})`;
    default: return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function flagCarry(inst) {
  const s = fmt(inst);
  if (inst.tag === 'ret-conditional' && inst.condition === 'c') return 'RET C';
  if (inst.tag === 'alu-reg' && ['cp', 'sub', 'sbc'].includes(inst.op)) return inst.op.toUpperCase();
  if (inst.tag === 'alu-imm' && ['cp', 'sub', 'sbc'].includes(inst.op)) return inst.op.toUpperCase();
  if (s === 'SCF') return 'SCF';
  return '';
}

function disasm(start, maxBytes, stopAtRet = false) {
  const rows = [];
  let pc = start;
  const end = Math.min(rom.length, start + maxBytes);
  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    rows.push({ pc, inst, asm: fmt(inst), raw: bytes(pc, inst.length), carry: flagCarry(inst) });
    pc += inst.length || 1;
    if (stopAtRet && inst.tag === 'ret') break;
  }
  return rows;
}

function hexdump(start, end) {
  const out = [];
  for (let pc = start; pc < end; pc += 16) {
    const chunk = rom.subarray(pc, Math.min(pc + 16, end));
    out.push(`${hx(pc)}  ${Array.from(chunk, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
  }
  return out;
}

function scan(pattern) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc++) {
    let ok = true;
    for (let i = 0; i < pattern.length; i++) ok &&= rom[pc + i] === pattern[i];
    if (ok) hits.push(pc);
  }
  return hits;
}

function contextRows(hit) {
  return disasm(Math.max(0, hit - 4), 16, false).slice(0, 6);
}

const lines = [];
const say = (s = '') => lines.push(s);

const body = disasm(START, MAX_BYTES, true);
const ram = new Map();
for (const r of body) {
  for (const m of memAccess(r.inst)) {
    const key = hx(m.addr);
    ram.set(key, ram.has(key) ? `${ram.get(key)}, ${m.access}` : m.access);
  }
}

say('# Phase595 populator gate static analysis');
say('');
say(`ROM: ${ROM_PATH}`);
say('');
say('## 0x07F81D disassembly');
for (const r of body) {
  const mark = r.carry ? `  ; CARRY-RISK ${r.carry}` : '';
  say(`${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}${mark}`);
}
say('');
say('## Absolute RAM references in 0x07F81D');
for (const [addr, access] of [...ram.entries()].sort()) say(`- ${addr}: ${access}`);
say('');
say('## Carry conclusion');
say('0x07F81D validates two seven-byte descriptor records at D005F8-D005FE and D00603-D00609, with the descriptor class/length bytes at D005F9/D00604 and type/sign bytes at D005F8/D00603. It first initializes missing descriptor fields via helper calls when D005FA, D00605, D005F9, or D00604 are zero.');
say('');
say('Carry is clear when the two descriptor records compare as compatible: if D00603 is negative, D00604 must be at least D005F9 and the remaining compared bytes must match; if D00603 is non-negative, bit 7 must be clear and the seven bytes at D00605 and D005FA must match. Carry is set on the failing compare path: CP (HL) at 0x07F865 can return NZ, or SUB (HL) at 0x07F879 / SUB 0x01 at 0x07F881 can leave carry set when the D00604/D005F9 ordering check underflows.');
say('');
say('## 0x044A40-0x044B60 hexdump');
for (const l of hexdump(0x044a40, 0x044b60)) say(l);
say('');
say('## 0x044A6E table');
say('0x044A6E is not the start of a 3-byte pointer-entry table in this ROM image. It is the first byte of the 24-bit operand for the instruction at 0x044A6D: C2 3F 4D 04, decoded as JP NZ,0x044D3F. Interpreting 0x044A6E as packed pointers produces immediate garbage after entry 0 because the following bytes are executable code.');
say('');
say('Misaligned 3-byte interpretation from 0x044A6E, shown to reject the table hypothesis:');
for (let i = 0; i < 40; i++) say(`${i.toString().padStart(2, '0')}: ${hx(TABLE + i * 3)} -> ${hx(u24(TABLE + i * 3))}`);
say('');
say('Decoded instructions covering the same region:');
for (const r of disasm(0x044a69, 0xc0, false).slice(0, 40)) say(`${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}`);
say('');

for (const [label, pattern] of [
  ['refs to 0x044A6E', [0x6e, 0x4a, 0x04]],
  ['refs to 0x044D3F', [0x3f, 0x4d, 0x04]],
]) {
  say(`## ${label}`);
  const hits = scan(pattern);
  for (const h of hits) {
    say(`- hit ${hx(h)}`);
    for (const r of contextRows(h)) say(`  ${hx(r.pc)}  ${r.raw.padEnd(14)}  ${r.asm}`);
  }
  if (hits.length === 0) say('- none');
  say('');
}

say('## Plausible normal caller chain');
say('The static byte search found no whole-ROM little-endian references to 0x044A6E, which supports the finding that it is not a separately indexed table base. The only 0x044D3F little-endian hit is at 0x044A6E as the operand of JP NZ,0x044D3F at 0x044A6D. The most plausible real caller chain is therefore direct code flow into 0x044A69, CALL 0x06C732, then conditional branch JP NZ,0x044D3F; the normal path reaches the populator when the 0x06C732 predicate returns NZ.');

const report = lines.join('\n') + '\n';
console.log(report);
fs.writeFileSync(REPORT_PATH, report);
