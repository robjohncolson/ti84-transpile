#!/usr/bin/env node
import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));
const START = 0x03F9AD;
const END = 0x03FA10;
const COMMIT = 0x03F9FA;

const H = (n, w = 6) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const B = (n) => `0x${(n & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
const dump = (pc, len) => Array.from(rom.slice(pc, pc + len), (x) => x.toString(16).padStart(2, '0')).join(' ');
const disp = (n) => (n >= 0 ? `+${n}` : `${n}`);

function fmt(i) {
  switch (i.tag) {
    case 'ld-pair-imm': return `ld ${i.pair}, ${H(i.value)}`;
    case 'ld-reg-imm': return `ld ${i.dest}, ${B(i.value)}`;
    case 'ld-reg-ind': return `ld ${i.dest}, (${i.src})`;
    case 'ld-ind-reg': return `ld (${i.dest}), ${i.src}`;
    case 'ld-ind-imm': return `ld (hl), ${B(i.value)}`;
    case 'ld-mem-reg': return `ld (${H(i.addr)}), ${i.src}`;
    case 'alu-reg': return `${i.op} ${i.src}`;
    case 'alu-imm': return `${i.op} ${B(i.value)}`;
    case 'dec-reg': return `dec ${i.reg}`;
    case 'jr-conditional': return `jr ${i.condition}, ${H(i.target)}`;
    case 'jp': return `jp ${H(i.target)}`;
    case 'call': return `call ${H(i.target)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${i.condition}`;
    case 'indexed-cb-set': return `set ${i.bit}, (${i.indexRegister}${disp(i.displacement)})`;
    case 'indexed-cb-res': return `res ${i.bit}, (${i.indexRegister}${disp(i.displacement)})`;
    case 'indexed-cb-bit': return `bit ${i.bit}, (${i.indexRegister}${disp(i.displacement)})`;
    case 'di': return 'di';
    case 'ei': return 'ei';
    default: return i.tag;
  }
}

function row(pc) {
  const i = decodeInstruction(rom, pc, 'adl');
  console.log(`  ${H(pc)}: ${dump(pc, i.length).padEnd(12)} ${fmt(i)}`);
  return i.nextPc;
}

function linear(label, start, end) {
  console.log(`\n${label}`);
  for (let pc = start; pc < end;) pc = row(pc);
}

console.log(`Phase 400: key validation around ${H(START)}..${H(END)}`);
console.log('\nRaw bytes');
for (let pc = START; pc <= END; pc += 16) {
  console.log(`  ${H(pc)}: ${dump(pc, Math.min(16, END - pc + 1))}`);
}

console.log('\nAlignment note');
console.log(`  ${H(START)} is not an opcode start; it is the displacement byte for the branch at ${H(0x03F9AC)}.`);
console.log('  Real entry points inside this window are the fallthrough at 0x03F9AE and the branch target at 0x03F9B1.');

linear('Context just above the window (debounce state)', 0x03F99E, 0x03F9AE);
linear('Validation and repeat stage', 0x03F9AE, 0x03F9FA);
linear('Commit helper at 0x03F9FA', 0x03F9FA, 0x03FA09);

console.log('\n0x03FA09 clear entry (continued a few bytes past 0x03FA10 to finish the routine)');
for (let pc = 0x03FA09; pc < 0x03FA16;) pc = row(pc);

console.log('\nControl-flow summary');
console.log('  - 0x03F99E..0x03F9AC is the debounce stage: compare A with [0xD00589], reload [0xD0058B]=0x05 on change,');
console.log('    and only reach 0x03F9AE when the repeated zero-key debounce counter expires.');
console.log('  - 0x03F9B1 compares A against [0xD00588]. This byte is the last key accepted by the repeat gate.');
console.log(`  - A != [0xD00588] takes the new-key path at ${H(0x03F9D1)} -> call ${H(COMMIT)} immediately.`);
console.log('  - A == [0xD00588] and A == 0 returns immediately: repeated "no key" is ignored.');
console.log('  - Repeated-key filter: 0x01..0x04, 0x38, and 0xF3..0xFF are repeat-eligible;');
console.log('    repeated 0x05..0x37 and 0x39..0xF2 are suppressed by the cp/jr/ret chain.');
console.log('  - [0xD0058A] is the repeat countdown. New keys seed it to 0x34; the repeat-fire path reloads it to 0x0A.');
console.log(`  - ${H(0x03F9CD)} is only reached after [0xD0058A] decrements to zero, so JP ${H(COMMIT)} is the auto-repeat commit.`);
console.log(`  - ${H(0x03F9D1)} is the immediate-commit path for a changed key, and it also writes A back to [0xD00588].`);
console.log('  - 0x03F9E3..0x03F9EC is extra post-commit logic in this banked copy: if bit 0 of (IY+0x46) is set, call 0x000378.');
console.log('  - 0x03F9ED..0x03F9F9 is the carry/error path entered from just above this window; it seeds [0xD00589]=0xFF and [0xD0058B]=0x05.');
console.log('  - 0x03F9FA stores A to [0xD00587], sets IY bit 3, and mirrors nonzero A to [0xD0058D].');
console.log('  - 0x03FA09 starts the GetCSC clear path: DI, read [0xD00587], zero it, clear IY bit 3, then EI.');

console.log('\nFiltered vs committed');
console.log('  - Changed key values: committed immediately via CALL 0x03F9FA, including a transition to 0x00.');
console.log('  - Same-key repeat values: 0x01..0x04, 0x38, 0xF3..0xFF commit only when [0xD0058A] expires.');
console.log('  - Same-key repeated 0x00 is ignored.');
console.log('  - Same-key repeated 0x05..0x37 and 0x39..0xF2 are filtered out with no commit.');
