#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const ROM = readFileSync(new URL('./ROM.rom', import.meta.url));
const MODE = 'adl', EXPECTED = 0x400000, TARGET = 0x0562D5, BEFORE = 0x64, AFTER = 0x64;
const CTRL = new Map([[0xCD,'CALL'],[0xC4,'CALL NZ'],[0xCC,'CALL Z'],[0xD4,'CALL NC'],[0xDC,'CALL C'],[0xE4,'CALL PO'],[0xEC,'CALL PE'],[0xF4,'CALL P'],[0xFC,'CALL M'],[0xC3,'JP'],[0xC2,'JP NZ'],[0xCA,'JP Z'],[0xD2,'JP NC'],[0xDA,'JP C'],[0xE2,'JP PO'],[0xEA,'JP PE'],[0xF2,'JP P'],[0xFA,'JP M']]);
const PREFIX = new Map([[0x52,'SIL'],[0x5B,'LIL']]);

function hex(v, w = 6) { return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`; }
function h8(v) { return hex(v, 2); }
function read24(off) { return ((ROM[off] ?? 0) | ((ROM[off + 1] ?? 0) << 8) | ((ROM[off + 2] ?? 0) << 16)) >>> 0; }
function bytes(pc, len) { return Array.from(ROM.subarray(pc, Math.min(pc + len, ROM.length)), b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '); }
function signed(n) { return `${n < 0 ? '-' : '+'}${h8(Math.abs(n))}`; }
function idx(inst) { return `(${String(inst.indexRegister).toUpperCase()}${signed(inst.displacement)})`; }
function fields(inst) { return Object.entries(inst).filter(([k, v]) => !['pc','length','nextPc','mode','modePrefix','terminates','fallthrough','tag'].includes(k) && v !== undefined && v !== null).map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v, v <= 0xFF ? 2 : 6) : v}`).join(' '); }
function alu(op, rhs) { return ['CP','SUB','AND','XOR','OR'].includes(op) ? `${op} ${rhs}` : `${op} A,${rhs}`; }
function fmt(inst) {
  if (!inst?.tag) return '???';
  switch (inst.tag) {
    case 'db': return `DB ${h8(inst.value)}`; case 'nop': return 'NOP'; case 'ret': return 'RET'; case 'reti': return 'RETI'; case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`; case 'call': return `CALL ${hex(inst.target)}`; case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`; case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`; case 'jp-indirect': return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`; case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`; case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`; case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`; case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`; case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`; case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `ADD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`; case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()},${h8(inst.value)}`; case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()},${hex(inst.value)}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`; case 'ld-reg-mem': return `LD ${String(inst.dest ?? 'a').toUpperCase()},(${hex(inst.addr)})`; case 'ld-mem-reg': return `LD (${hex(inst.addr)}),${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem': return inst.direction === 'to-mem' ? `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}` : `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`; case 'ld-mem-pair': return `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`; case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${String(inst.dest).toUpperCase()},${idx(inst)}`; case 'ld-ixd-reg': return `LD ${idx(inst)},${String(inst.src).toUpperCase()}`; case 'ld-ixd-imm': return `LD ${idx(inst)},${h8(inst.value)}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit},${idx(inst)}`; case 'indexed-cb-set': return `SET ${inst.bit},${idx(inst)}`; case 'indexed-cb-res': return `RES ${inst.bit},${idx(inst)}`;
    case 'bit-test': return `BIT ${inst.bit},${String(inst.reg).toUpperCase()}`; case 'bit-test-ind': return `BIT ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'alu-reg': return alu(String(inst.op).toUpperCase(), String(inst.src).toUpperCase()); case 'alu-imm': return alu(String(inst.op).toUpperCase(), h8(inst.value));
    default: return fields(inst) ? `${inst.tag} ${fields(inst)}` : inst.tag;
  }
}
function dec(pc) { try { return decodeInstruction(ROM, pc, MODE); } catch { return null; } }
function safe(pc) { return dec(pc) ?? { pc, length: 1, nextPc: pc + 1, tag: 'db', value: ROM[pc] ?? 0 }; }
function hard(inst) { return ['ret','reti','retn','jp','jp-indirect','jr','halt','slp'].includes(inst?.tag); }
function pathTo(start, target, stopOnHard) {
  const rows = []; let pc = start;
  for (let i = 0; i < 256 && pc <= target; i++) { const inst = dec(pc); if (!inst?.length || inst.nextPc <= pc) return null; rows.push(inst); if (pc === target) return rows; if (stopOnHard && hard(inst)) return null; pc = inst.nextPc; }
  return null;
}
function findStart(target, lookback, stopOnHard) {
  const min = Math.max(0, target - lookback);
  for (let start = min; start <= target; start++) { const rows = pathTo(start, target, stopOnHard); if (rows) return { start, rows }; }
  return { start: target, rows: [safe(target)] };
}
function disasm(start, end, stopAfterTarget = false, target = start) {
  const rows = []; let pc = start, seenTarget = false;
  for (let i = 0; i < 256 && pc < ROM.length && (stopAfterTarget || pc < end); i++) { const inst = safe(pc); rows.push(inst); seenTarget ||= pc === target; pc = inst.nextPc ?? (pc + Math.max(inst.length || 1, 1)); if (stopAfterTarget && seenTarget && hard(inst)) break; }
  return rows;
}
function scanRefs(target) {
  const t0 = target & 0xFF, t1 = (target >> 8) & 0xFF, t2 = (target >> 16) & 0xFF, out = [];
  for (let pc = 0; pc <= ROM.length - 4; pc++) {
    if (CTRL.has(ROM[pc]) && ROM[pc + 1] === t0 && ROM[pc + 2] === t1 && ROM[pc + 3] === t2) out.push({ addr: pc, kind: CTRL.get(ROM[pc]), length: 4, bytes: bytes(pc, 4) });
    if (PREFIX.has(ROM[pc]) && CTRL.has(ROM[pc + 1]) && ROM[pc + 2] === t0 && ROM[pc + 3] === t1 && ROM[pc + 4] === t2) out.push({ addr: pc, kind: `${PREFIX.get(ROM[pc])} ${CTRL.get(ROM[pc + 1])}`, length: 5, bytes: bytes(pc, 5) });
  }
  return out;
}
function scanPtrs(target, refs) {
  const t0 = target & 0xFF, t1 = (target >> 8) & 0xFF, t2 = (target >> 16) & 0xFF, skip = new Set(refs.map(r => r.addr + (r.length - 3))), out = [];
  for (let pc = 0; pc <= ROM.length - 3; pc++) if (ROM[pc] === t0 && ROM[pc + 1] === t1 && ROM[pc + 2] === t2 && !skip.has(pc)) out.push(pc);
  return out;
}
function printRows(title, rows, marks = new Map()) {
  console.log(`\n=== ${title} ===`);
  for (const inst of rows) console.log(`${hex(inst.pc)}  ${bytes(inst.pc, inst.length).padEnd(18)} ${fmt(inst)}${marks.get(inst.pc) ? `  ; ${marks.get(inst.pc)}` : ''}`);
}
function printHexDump(title, start, end) {
  console.log(`\n=== ${title} ===`);
  for (let pc = start; pc < end; pc += 16) console.log(`${hex(pc)}: ${bytes(pc, Math.min(16, end - pc))}`);
}
function printRefs(title, refs, ptrs, target) {
  console.log(`\n=== ${title} ===`);
  console.log(`Target ${hex(target)}: ${refs.length} CALL/JP refs, ${ptrs.length} raw pointer refs`);
  if (!refs.length) console.log('  No CALL/JP references found.');
  for (const ref of refs) {
    console.log(`\n${hex(ref.addr)}  ${ref.bytes}  ${ref.kind} ${hex(target)}`);
    printRows(`Caller context for ${hex(ref.addr)}`, disasm(findStart(ref.addr, 0x20, false).start, ref.addr + 0x20), new Map([[ref.addr, 'reference']]));
  }
  if (ptrs.length) {
    console.log('\nRaw 3-byte pointer hits:');
    for (const ptr of ptrs) console.log(`  ${hex(ptr)}  ${bytes(Math.max(0, ptr - 1), 5)}`);
  }
}

if (ROM.length !== EXPECTED) throw new Error(`Expected ROM size ${hex(EXPECTED, 8)}, got ${hex(ROM.length, 8)}`);

const regionStart = findStart(TARGET, BEFORE, false).start;
const functionStart = findStart(TARGET, BEFORE, true).start;
const regionRows = disasm(regionStart, TARGET + AFTER);
const functionRows = disasm(functionStart, ROM.length, true, TARGET);
const directRefs = scanRefs(TARGET), directPtrs = scanPtrs(TARGET, directRefs);
const entryRefs = functionStart !== TARGET ? scanRefs(functionStart) : [], entryPtrs = functionStart !== TARGET ? scanPtrs(functionStart, entryRefs) : [];

console.log('Phase 400 - Investigate 0x0562D5 programmatic key injection');
console.log(`ROM size: ${ROM.length} bytes (${hex(ROM.length, 8)})`);
console.log(`Decoder mode: ${MODE.toUpperCase()}`);
console.log(`Target internal site: ${hex(TARGET)}`);
console.log(`Inferred containing function start: ${hex(functionStart)}`);
console.log(`Bytes at target: ${bytes(TARGET, 16)}`);
if (functionStart !== TARGET) console.log(`0x0562D5 is inside a larger function; scan the entrypoint ${hex(functionStart)} for the broader API surface.`);

printHexDump(`${hex(TARGET - BEFORE)}..${hex(TARGET + AFTER)} raw bytes around 0x0562D5`, Math.max(0, TARGET - BEFORE), Math.min(ROM.length, TARGET + AFTER));
printRows(`Aligned neighborhood disassembly ending at ${hex(TARGET)}`, regionRows, new Map([[functionStart, 'inferred function entry'], [TARGET, 'target call site']]));
printRows(`Containing function from ${hex(functionStart)} until first hard return/jump after target`, functionRows, new Map([[functionStart, 'entry'], [TARGET, 'target call 0x03F9FA']]));
printRefs('Direct references to 0x0562D5', directRefs, directPtrs, TARGET);
if (functionStart !== TARGET) printRefs(`Broader API references to inferred entry ${hex(functionStart)}`, entryRefs, entryPtrs, functionStart);

console.log('\n=== Summary ===');
console.log(`Direct CALL/JP references to ${hex(TARGET)}: ${directRefs.length}.`);
console.log(`Raw 3-byte pointer references to ${hex(TARGET)}: ${directPtrs.length}.`);
console.log(`Nearest aligned hard-boundary entry before ${hex(TARGET)}: ${hex(functionStart)}.`);
if (functionStart !== TARGET) console.log(`This indicates ${hex(TARGET)} is an internal call site inside the function that starts at ${hex(functionStart)}.`);
