import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x097c8a;
const MAX_BYTES = 220;

const rom = readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

const calls = [];
const jumps = [];
const reads = [];
const writes = [];

function recordMemory(kind, addr, detail) {
  const row = { addr, detail };
  if (kind === 'read') reads.push(row);
  if (kind === 'write') writes.push(row);
}

function decode(addr) {
  const op = rom[addr];
  const op2 = rom[addr + 1];
  const nn = () => u24(addr + 1);
  const rel = () => addr + 2 + s8(op2);
  let len = 1;
  let asm = `DB ${hex(op)}`;
  let stop = false;
  let note = '';

  switch (op) {
    case 0x00:
      asm = 'NOP';
      break;
    case 0x01:
      len = 4;
      asm = `LD BC,${hex(nn(), 6)}`;
      break;
    case 0x06:
      len = 2;
      asm = `LD B,${hex(op2)}`;
      break;
    case 0x0e:
      len = 2;
      asm = `LD C,${hex(op2)}`;
      break;
    case 0x11:
      len = 4;
      asm = `LD DE,${hex(nn(), 6)}`;
      break;
    case 0x18:
      len = 2;
      asm = `JR ${hex(rel(), 6)}`;
      jumps.push({ addr, target: rel(), detail: 'JR' });
      break;
    case 0x20:
      len = 2;
      asm = `JR NZ,${hex(rel(), 6)}`;
      jumps.push({ addr, target: rel(), detail: 'JR NZ' });
      break;
    case 0x21:
      len = 4;
      asm = `LD HL,${hex(nn(), 6)}`;
      break;
    case 0x22:
      len = 4;
      asm = `LD (${hex(nn(), 6)}),HL`;
      recordMemory('write', nn(), 'LD (nn),HL');
      break;
    case 0x23:
      asm = 'INC HL';
      break;
    case 0x28:
      len = 2;
      asm = `JR Z,${hex(rel(), 6)}`;
      jumps.push({ addr, target: rel(), detail: 'JR Z' });
      break;
    case 0x2a:
      len = 4;
      asm = `LD HL,(${hex(nn(), 6)})`;
      recordMemory('read', nn(), 'LD HL,(nn)');
      break;
    case 0x2b:
      asm = 'DEC HL';
      break;
    case 0x30:
      len = 2;
      asm = `JR NC,${hex(rel(), 6)}`;
      jumps.push({ addr, target: rel(), detail: 'JR NC' });
      break;
    case 0x32:
      len = 4;
      asm = `LD (${hex(nn(), 6)}),A`;
      recordMemory('write', nn(), 'LD (nn),A');
      break;
    case 0x36:
      len = 2;
      asm = `LD (HL),${hex(op2)}`;
      recordMemory('write', null, `LD (HL),${hex(op2)}`);
      break;
    case 0x38:
      len = 2;
      asm = `JR C,${hex(rel(), 6)}`;
      jumps.push({ addr, target: rel(), detail: 'JR C' });
      break;
    case 0x3a:
      len = 4;
      asm = `LD A,(${hex(nn(), 6)})`;
      recordMemory('read', nn(), 'LD A,(nn)');
      break;
    case 0x3e:
      len = 2;
      asm = `LD A,${hex(op2)}`;
      break;
    case 0x77:
      asm = 'LD (HL),A';
      recordMemory('write', null, 'LD (HL),A');
      break;
    case 0x7e:
      asm = 'LD A,(HL)';
      recordMemory('read', null, 'LD A,(HL)');
      break;
    case 0xaf:
      asm = 'XOR A';
      break;
    case 0xb7:
      asm = 'OR A';
      break;
    case 0xc0:
      asm = 'RET NZ';
      stop = true;
      break;
    case 0xc3:
      len = 4;
      asm = `JP ${hex(nn(), 6)}`;
      jumps.push({ addr, target: nn(), detail: 'JP' });
      stop = true;
      break;
    case 0xc8:
      asm = 'RET Z';
      stop = true;
      break;
    case 0xc9:
      asm = 'RET';
      stop = true;
      break;
    case 0xcd:
      len = 4;
      asm = `CALL ${hex(nn(), 6)}`;
      calls.push({ addr, target: nn() });
      break;
    case 0xd0:
      asm = 'RET NC';
      stop = true;
      break;
    case 0xd8:
      asm = 'RET C';
      stop = true;
      break;
    case 0xe1:
      asm = 'POP HL';
      break;
    case 0xe5:
      asm = 'PUSH HL';
      break;
    case 0xe6:
      len = 2;
      asm = `AND ${hex(op2)}`;
      break;
    case 0xef:
      asm = 'RST 0x28';
      calls.push({ addr, target: 0x000028, bcall: true });
      note = 'bcall trampoline';
      break;
    case 0xf1:
      asm = 'POP AF';
      break;
    case 0xf5:
      asm = 'PUSH AF';
      break;
    case 0xfe:
      len = 2;
      asm = `CP ${hex(op2)}`;
      break;
    default:
      if (op >= 0x40 && op <= 0x7f) {
        const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        asm = `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`;
        if (((op >> 3) & 7) === 6) recordMemory('write', null, asm);
        if ((op & 7) === 6) recordMemory('read', null, asm);
      } else if (op >= 0x80 && op <= 0xbf) {
        const groups = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
        const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        asm = `${groups[(op >> 3) & 7]} ${regs[op & 7]}`;
        if ((op & 7) === 6) recordMemory('read', null, asm);
      }
      break;
  }

  return { addr, len, asm, bytes: bytesAt(addr, len), stop, note };
}

const rows = [];
let pc = START;
const limit = Math.min(START + MAX_BYTES, rom.length);
while (pc < limit) {
  const row = decode(pc);
  rows.push(row);
  pc += row.len;
  if (row.stop && pc > START) break;
}

function printTable(title, rowsToPrint, formatter) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  if (rowsToPrint.length === 0) {
    console.log('  none');
    return;
  }
  for (const row of rowsToPrint) console.log(`  ${formatter(row)}`);
}

console.log('Phase 523 decode: 0x097C8A list/complex-list setup helper');
console.log('================================================================');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Range decoded: ${hex(START, 6)}..${hex(pc - 1, 6)} (${pc - START} bytes)`);
console.log('');
console.log('Entry context');
console.log('-------------');
console.log('  Called by the type-dispatch cascade for type 0x01 real lists and type 0x0D complex lists.');
console.log('  Complex-list path loads A=0x0D immediately before entry; real-list path falls through with its current dispatch type state.');
console.log('  The following handler code writes type 0x01 or 0x0D through 0x097AB2 using D0033A, so this helper is the shared setup step before the edit pointer/type commit.');
console.log('');
console.log('Disassembly');
console.log('-----------');
for (const row of rows) {
  const note = row.note ? ` ; ${row.note}` : '';
  console.log(`${hex(row.addr, 6)}  ${row.bytes.padEnd(12)}  ${row.asm}${note}`);
}

printTable('CALL targets', calls, (row) => {
  const kind = row.bcall ? 'RST/bcall' : 'CALL';
  return `${hex(row.addr, 6)} -> ${hex(row.target, 6)} (${kind})`;
});

printTable('Jump targets', jumps, (row) =>
  `${hex(row.addr, 6)} -> ${hex(row.target, 6)} (${row.detail})`,
);

printTable('Absolute memory reads', reads.filter((row) => row.addr !== null), (row) =>
  `${hex(row.addr, 6)} ${row.detail}`,
);

printTable('Absolute memory writes', writes.filter((row) => row.addr !== null), (row) =>
  `${hex(row.addr, 6)} ${row.detail}`,
);

printTable('Indirect memory touches', [...reads, ...writes].filter((row) => row.addr === null), (row) =>
  row.detail,
);

const ramReads = reads.filter((row) => row.addr !== null && row.addr >= 0xd00000 && row.addr <= 0xd3ffff);
const ramWrites = writes.filter((row) => row.addr !== null && row.addr >= 0xd00000 && row.addr <= 0xd3ffff);

printTable('D0xxxx RAM reads', ramReads, (row) => `${hex(row.addr, 6)} ${row.detail}`);
printTable('D0xxxx RAM writes', ramWrites, (row) => `${hex(row.addr, 6)} ${row.detail}`);

console.log('\nStructured role summary');
console.log('-----------------------');
console.log('  1. Establishes shared list edit-buffer state used by both real-list and complex-list dispatch arms.');
console.log('  2. Uses A as the type-sensitive input on the complex-list arm; the real-list arm continues into the same helper before the caller writes the final list type/pointer state.');
console.log('  3. Any absolute D0xxxx references above are RAM globals touched directly by this helper.');
console.log('  4. Any indirect (HL) accesses above are buffer/header edits; resolve them by following nearby LD HL,nn loads and sub-call conventions.');
console.log('  5. CALL targets above are the helper subroutines that perform allocation, validation, or edit-buffer initialization for list setup.');
