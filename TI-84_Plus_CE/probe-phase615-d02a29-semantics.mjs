import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const romPath = path.join(__dirname, 'ROM.rom');
const reportPath = path.join(__dirname, 'phase615-d02a29-semantics.md');

const rom = fs.readFileSync(romPath);

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function b(addr) {
  return addr >= 0 && addr < rom.length ? rom[addr] : 0;
}

function bytes(addr, len) {
  return Array.from({ length: len }, (_, i) => b(addr + i).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function u16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function rel(addr, len, disp) {
  return (addr + len + s8(disp)) & 0xffff;
}

function decode(addr) {
  const op = b(addr);
  const n = b(addr + 1);
  const nn = u16(addr + 1);

  if (op === 0x40) {
    const next = b(addr + 1);
    const nn2 = u16(addr + 2);
    if (next === 0x2a) return { len: 4, text: `.SIS LD HL,(${hex(0xd00000 | nn2)})`, mem: 0xd00000 | nn2, access: 'read16' };
    if (next === 0x22) return { len: 4, text: `.SIS LD (${hex(0xd00000 | nn2)}),HL`, mem: 0xd00000 | nn2, access: 'write16' };
  }
  if (op === 0x21) return { len: 3, text: `LD HL,${hex(nn, 4)}` };
  if (op === 0x22) return { len: 3, text: `LD (${hex(0xd00000 | nn)}),HL`, mem: 0xd00000 | nn, access: 'write16' };
  if (op === 0x2a) return { len: 3, text: `LD HL,(${hex(0xd00000 | nn)})`, mem: 0xd00000 | nn, access: 'read16' };
  if (op === 0x32) return { len: 3, text: `LD (${hex(0xd00000 | nn)}),A`, mem: 0xd00000 | nn, access: 'write8' };
  if (op === 0x3a) return { len: 3, text: `LD A,(${hex(0xd00000 | nn)})`, mem: 0xd00000 | nn, access: 'read8' };
  if (op === 0xcd) return { len: 4, text: `CALL ${hex(nn, 6)}`, target: nn, kind: 'call' };
  if (op === 0xc3) return { len: 4, text: `JP ${hex(nn, 6)}`, target: nn, kind: 'jump' };
  if (op === 0xc9) return { len: 1, text: 'RET' };
  if (op === 0xc1) return { len: 1, text: 'POP BC' };
  if (op === 0xd1) return { len: 1, text: 'POP DE' };
  if (op === 0xe1) return { len: 1, text: 'POP HL' };
  if (op === 0xc5) return { len: 1, text: 'PUSH BC' };
  if (op === 0xd5) return { len: 1, text: 'PUSH DE' };
  if (op === 0xe5) return { len: 1, text: 'PUSH HL' };
  if (op === 0x5f) return { len: 1, text: 'LD E,A' };
  if (op === 0x16) return { len: 2, text: `LD D,${hex(n, 2)}` };
  if (op === 0x19) return { len: 1, text: 'ADD HL,DE' };
  if (op === 0x23) return { len: 1, text: 'INC HL' };
  if (op === 0x2b) return { len: 1, text: 'DEC HL' };
  if (op === 0x13) return { len: 1, text: 'INC DE' };
  if (op === 0x1b) return { len: 1, text: 'DEC DE' };
  if (op === 0xeb) return { len: 1, text: 'EX DE,HL' };
  if (op === 0xaf) return { len: 1, text: 'XOR A' };
  if (op === 0xb7) return { len: 1, text: 'OR A' };
  if (op === 0x18) return { len: 2, text: `JR ${hex(rel(addr, 2, n), 4)}`, target: rel(addr, 2, n), kind: 'jump' };
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const cc = ['NZ', 'Z', 'NC', 'C'][(op >> 3) & 3];
    return { len: 2, text: `JR ${cc},${hex(rel(addr, 2, n), 4)}`, target: rel(addr, 2, n), kind: 'jump' };
  }
  return { len: 1, text: `DB ${hex(op, 2)}` };
}

function disassemble(start, end) {
  const out = [];
  for (let pc = start; pc < end;) {
    const inst = decode(pc);
    out.push({ addr: pc, bytes: bytes(pc, inst.len), ...inst });
    pc += inst.len;
  }
  return out;
}

const target = [0x29, 0x2a];
const rawHits = [];
for (let i = 0; i < rom.length - target.length; i++) {
  if (rom[i] === target[0] && rom[i + 1] === target[1]) {
    rawHits.push(i);
  }
}

function classify(hit) {
  if (b(hit - 2) === 0x40 && b(hit - 1) === 0x2a) return { pc: hit - 2, kind: 'read16', encoding: '.SIS LD HL,(D02A29)' };
  if (b(hit - 2) === 0x40 && b(hit - 1) === 0x22) return { pc: hit - 2, kind: 'write16', encoding: '.SIS LD (D02A29),HL' };
  if (b(hit - 1) === 0x3a) return { pc: hit - 1, kind: 'read8', encoding: 'LD A,(D02A29) low-word form' };
  if (b(hit - 1) === 0x32) return { pc: hit - 1, kind: 'write8', encoding: 'LD (D02A29),A low-word form' };
  if (b(hit - 1) === 0x2a) return { pc: hit - 1, kind: 'read16', encoding: 'LD HL,(D02A29) low-word form' };
  if (b(hit - 1) === 0x22) return { pc: hit - 1, kind: 'write16', encoding: 'LD (D02A29),HL low-word form' };
  return { pc: hit, kind: 'unknown', encoding: 'raw byte pattern only' };
}

const refs = rawHits.map((hit) => ({ hit, ...classify(hit) }));
const realRefs = refs.filter((r) => r.kind !== 'unknown');
const decodedWindows = realRefs.map((r) => {
  const start = Math.max(0, r.pc - 16);
  const end = Math.min(rom.length, r.pc + 40);
  return { ref: r, instructions: disassemble(start, end) };
});

function refRole(ref) {
  if (ref.pc === 0x08df54) return 'initializes cursorPos from HL before saving D02A2B/D02A1B state';
  if (ref.pc === 0x08dfdd) return 'alternate initializer for cursorPos before D02A2B setup';
  if (ref.pc === 0x08e151) return 'reads cursorPos for display cursor arithmetic with D02A2B';
  if (ref.pc === 0x08e355) return 'reads cursorPos, calls 0x0916E7, writes derived value to D0059A';
  if (ref.pc === 0x08e380) return 'reads cursorPos again for D01156/D02A2B position comparison';
  if (ref.pc === 0x08ed73) return 'writes cursorPos from computed HL in token output setup';
  if (ref.pc === 0x08ede3) return 'reads cursorPos for token/render position arithmetic';
  if (ref.pc === 0x08ee0d) return 'writes cursorPos after position adjustment';
  if (ref.pc === 0x08ee29 || ref.pc === 0x08ee2e) return 'reads cursorPos twice for compare/adjust sequence';
  if (ref.pc >= 0x08f006 && ref.pc <= 0x08f140) return 'cursorPos update/read in token output loop setup';
  if (ref.pc === 0x08f54b || ref.pc === 0x08f551 || ref.pc === 0x08f5a4) return 'normal exit path saves/restores or advances cursorPos before cleanup';
  if (ref.pc === 0x08f69c) return 'alternate-exit skip path reads cursorPos before adding token byte size';
  if (ref.pc === 0x08f6a5) return 'alternate-exit skip path writes advanced cursorPos';
  if (ref.pc >= 0x08f6fe && ref.pc <= 0x08f7c5) return 'cursor movement/helper path using cursorPos with D02A2B and token-size helpers';
  if (ref.kind === 'read16') return 'reads 16-bit cursor position';
  if (ref.kind === 'write16') return 'writes 16-bit cursor position';
  return ref.kind;
}

const countByKind = new Map();
for (const ref of refs) countByKind.set(ref.kind, (countByKind.get(ref.kind) || 0) + 1);

const report = [
  '# Phase 615: D02A29 Cursor Position Semantics',
  '',
  '## Summary',
  '',
  `- Raw ROM byte-pattern hits for little-endian low word 0x2A29: ${rawHits.length}.`,
  `- Real instruction references classified: ${realRefs.length}; false/unknown byte-pattern hits: ${refs.length - realRefs.length}.`,
  `- Access split: ${Array.from(countByKind.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}.`,
  '- All real references are clustered in `0x08DF54-0x08F7C5`, the token display/cursor engine. No direct references were found outside that subsystem.',
  '- D02A29 is a 16-bit token-stream cursor position accumulator, not a single-use scratch variable. It is repeatedly paired with D02A2B/D02A1B display-position state and D02A40/D0243D token-boundary state.',
  '- The session-614 alternate exit remains the clearest writer: `0x08F696` calls `0x0907DB`, receives the current token byte size in A, then does `D02A29 += A` before restarting the loop at `0x08F433`.',
  '- Relationship to nearby state: `D02A40` is the current token pointer used for boundary comparison; `D0243D` is editBtm. When `(IY+0x23) bit 3` is clear or `D0243D != D02A40`, D02A29 advances by the token size and the loop retries.',
  '',
  '## Classified References',
  '',
  '| PC | Access | Encoding | Role |',
  '|---|---|---|---|',
  ...refs.map((r) => `| ${hex(r.pc)} | ${r.kind} | ${r.encoding} | ${refRole(r)} |`),
  '',
  '## Decoded Reference Windows',
  '',
  ...decodedWindows.flatMap(({ ref, instructions }) => [
    `### ${hex(ref.pc)} ${ref.encoding}`,
    '',
    '```',
    ...instructions.map((i) => {
      const marker = i.addr === ref.pc ? ' <-- D02A29 ref' : '';
      return `${hex(i.addr).padEnd(10)} ${i.bytes.padEnd(13)} ${i.text}${marker}`;
    }),
    '```',
    '',
  ]),
  '## Interpretation',
  '',
  'D02A29 is not a global OS cursor with broad call-site spread; it is confined to the token display/parser engine. Within that engine it is a real 16-bit cursor-position accumulator with many local reads/writes. The `0x08F696` alternate-exit path proves the unit: D02A29 advances by token byte size, so the value is a byte offset/cursor through the token stream. The nearby references show it also seeds display-position calculations with D02A2B/D02A1B and feeds derived state such as D0059A.',
  '',
].join('\n');

fs.writeFileSync(reportPath, report);

console.log('phase615: D02A29 semantics scan complete');
console.log(`phase615: rawHits=${rawHits.length} realRefs=${realRefs.length} unknown=${refs.length - realRefs.length}`);
for (const ref of refs) {
  console.log(`phase615: ${hex(ref.pc)} ${ref.kind} ${ref.encoding}`);
}
console.log(`phase615: wrote ${path.relative(repoRoot, reportPath)}`);
