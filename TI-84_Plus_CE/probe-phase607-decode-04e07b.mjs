import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const reportPath = path.join(__dirname, 'phase607-decode-04e07b.md');

const rom = fs.readFileSync(romPath);

const START_04E07B = 0x04e07b;
const START_000130 = 0x000130;

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len));
}

function rawBytes(addr, len) {
  return bytesAt(addr, len).map(hexByte).join(' ');
}

function u16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function u24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(addr, offset, size = 2) {
  return (addr + size + s8(offset)) & 0xffffff;
}

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function decodeCb(addr) {
  const op = rom[addr + 1];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (x === 0) return { len: 2, text: `${groups[y]} ${r[z]}` };
  if (x === 1) return { len: 2, text: `BIT ${y},${r[z]}` };
  if (x === 2) return { len: 2, text: `RES ${y},${r[z]}` };
  return { len: 2, text: `SET ${y},${r[z]}` };
}

function decodeEd(addr) {
  const op = rom[addr + 1];
  const b2 = rom[addr + 2];
  const b3 = rom[addr + 3];
  const block = {
    0x40: 'IN B,(C)', 0x41: 'OUT (C),B', 0x42: 'SBC HL,BC', 0x43: `LD (${hex(u24(addr + 2))}),BC`,
    0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A',
    0x48: 'IN C,(C)', 0x49: 'OUT (C),C', 0x4a: 'ADC HL,BC', 0x4b: `LD BC,(${hex(u24(addr + 2))})`,
    0x4d: 'RETI', 0x4f: 'LD R,A',
    0x50: 'IN D,(C)', 0x51: 'OUT (C),D', 0x52: 'SBC HL,DE', 0x53: `LD (${hex(u24(addr + 2))}),DE`,
    0x56: 'IM 1', 0x57: 'LD A,I',
    0x58: 'IN E,(C)', 0x59: 'OUT (C),E', 0x5a: 'ADC HL,DE', 0x5b: `LD DE,(${hex(u24(addr + 2))})`,
    0x5e: 'IM 2', 0x5f: 'LD A,R',
    0x60: 'IN H,(C)', 0x61: 'OUT (C),H', 0x62: 'SBC HL,HL', 0x63: `LD (${hex(u24(addr + 2))}),HL`,
    0x67: 'RRD',
    0x68: 'IN L,(C)', 0x69: 'OUT (C),L', 0x6a: 'ADC HL,HL', 0x6b: `LD HL,(${hex(u24(addr + 2))})`,
    0x6f: 'RLD',
    0x72: 'SBC HL,SP', 0x73: `LD (${hex(u24(addr + 2))}),SP`,
    0x78: 'IN A,(C)', 0x79: 'OUT (C),A', 0x7a: 'ADC HL,SP', 0x7b: `LD SP,(${hex(u24(addr + 2))})`,
    0xa0: 'LDI', 0xa1: 'CPI', 0xa2: 'INI', 0xa3: 'OUTI',
    0xa8: 'LDD', 0xa9: 'CPD', 0xaa: 'IND', 0xab: 'OUTD',
    0xb0: 'LDIR', 0xb1: 'CPIR', 0xb2: 'INIR', 0xb3: 'OTIR',
    0xb8: 'LDDR', 0xb9: 'CPDR', 0xba: 'INDR', 0xbb: 'OTDR',
  };
  if (op in block) {
    const len = [0x43, 0x4b, 0x53, 0x5b, 0x63, 0x6b, 0x73, 0x7b].includes(op) ? 5 : 2;
    const observations = [];
    if (len === 5) observations.push(`memory ${hex(u24(addr + 2))}`);
    return { len, text: block[op], observations };
  }
  if ((op & 0xc7) === 0x43) return { len: 5, text: `LD (${hex(u24(addr + 2))}),${rp[(op >> 4) & 3]}`, observations: [`memory ${hex(u24(addr + 2))}`] };
  if ((op & 0xc7) === 0x4b) return { len: 5, text: `LD ${rp[(op >> 4) & 3]},(${hex(u24(addr + 2))})`, observations: [`memory ${hex(u24(addr + 2))}`] };
  if (op === 0x39) return { len: 4, text: `LD (${hex((b2 | (b3 << 8)), 4)}),A`, observations: [`I/O or short memory ${hex((b2 | (b3 << 8)), 4)}`] };
  return { len: 2, text: `DB ED ${hexByte(op)}` };
}

function decodeIndexed(addr, prefix, indexName) {
  const op = rom[addr + 1];
  if (op === 0xcb) {
    const disp = s8(rom[addr + 2]);
    const cb = rom[addr + 3];
    const y = (cb >> 3) & 7;
    const z = cb & 7;
    const x = cb >> 6;
    const mem = `(${indexName}${disp < 0 ? '' : '+'}${disp})`;
    const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    if (x === 0) return { len: 4, text: `${groups[y]} ${mem}${z === 6 ? '' : `,${r[z]}`}` };
    if (x === 1) return { len: 4, text: `BIT ${y},${mem}` };
    if (x === 2) return { len: 4, text: `RES ${y},${mem}${z === 6 ? '' : `,${r[z]}`}` };
    return { len: 4, text: `SET ${y},${mem}${z === 6 ? '' : `,${r[z]}`}` };
  }
  const d = s8(rom[addr + 2]);
  const n = rom[addr + 3];
  const name = indexName;
  const table = {
    0x09: `ADD ${name},BC`, 0x19: `ADD ${name},DE`, 0x21: `LD ${name},${hex(u24(addr + 2))}`,
    0x22: `LD (${hex(u24(addr + 2))}),${name}`, 0x23: `INC ${name}`, 0x29: `ADD ${name},${name}`,
    0x2a: `LD ${name},(${hex(u24(addr + 2))})`, 0x2b: `DEC ${name}`, 0x34: `INC (${name}${d < 0 ? '' : '+'}${d})`,
    0x35: `DEC (${name}${d < 0 ? '' : '+'}${d})`, 0x36: `LD (${name}${d < 0 ? '' : '+'}${d}),${hex(n, 2)}`,
    0x39: `ADD ${name},SP`, 0xe1: `POP ${name}`, 0xe3: `EX (SP),${name}`, 0xe5: `PUSH ${name}`,
    0xe9: `JP (${name})`, 0xf9: `LD SP,${name}`,
  };
  if (op in table) {
    const len = [0x21, 0x22, 0x2a].includes(op) ? 5 : [0x34, 0x35].includes(op) ? 3 : op === 0x36 ? 4 : 2;
    const observations = [0x22, 0x2a].includes(op) ? [`memory ${hex(u24(addr + 2))}`] : [];
    return { len, text: table[op], observations, terminal: op === 0xe9 };
  }
  if ([0x46, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x7e].includes(op)) return { len: 3, text: `LD ${r[(op >> 3) & 7]},(${name}${d < 0 ? '' : '+'}${d})` };
  if ([0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77].includes(op)) return { len: 3, text: `LD (${name}${d < 0 ? '' : '+'}${d}),${r[op & 7]}` };
  return { len: 2, text: `DB ${hexByte(prefix)} ${hexByte(op)}` };
}

function decode(addr) {
  const op = rom[addr];
  if (op === 0xcb) return decodeCb(addr);
  if (op === 0xed) return decodeEd(addr);
  if (op === 0xdd) return decodeIndexed(addr, op, 'IX');
  if (op === 0xfd) return decodeIndexed(addr, op, 'IY');

  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x08) return { len: 1, text: 'EX AF,AF\'' };
  if (op === 0x10) return { len: 2, text: `DJNZ ${hex(relTarget(addr, rom[addr + 1]))}`, observations: [`branch ${hex(relTarget(addr, rom[addr + 1]))}`] };
  if (op === 0x18) return { len: 2, text: `JR ${hex(relTarget(addr, rom[addr + 1]))}`, observations: [`branch ${hex(relTarget(addr, rom[addr + 1]))}`], terminal: true };
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const cond = cc[(op >> 3) & 3];
    const target = relTarget(addr, rom[addr + 1]);
    return { len: 2, text: `JR ${cond},${hex(target)}`, observations: [`branch ${hex(target)}`] };
  }
  if ((op & 0xcf) === 0x01) return { len: 4, text: `LD ${rp[(op >> 4) & 3]},${hex(u24(addr + 1))}` };
  if ((op & 0xcf) === 0x09) return { len: 1, text: `ADD HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xc7) === 0x04) return { len: 1, text: `INC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { len: 1, text: `DEC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { len: 2, text: `LD ${r[(op >> 3) & 7]},${hex(rom[addr + 1], 2)}` };
  if ((op & 0xcf) === 0x03) return { len: 1, text: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x0b) return { len: 1, text: `DEC ${rp[(op >> 4) & 3]}` };
  if (op === 0x02) return { len: 1, text: 'LD (BC),A' };
  if (op === 0x0a) return { len: 1, text: 'LD A,(BC)' };
  if (op === 0x12) return { len: 1, text: 'LD (DE),A' };
  if (op === 0x1a) return { len: 1, text: 'LD A,(DE)' };
  if (op === 0x22) return { len: 4, text: `LD (${hex(u24(addr + 1))}),HL`, observations: [`memory ${hex(u24(addr + 1))}`] };
  if (op === 0x2a) return { len: 4, text: `LD HL,(${hex(u24(addr + 1))})`, observations: [`memory ${hex(u24(addr + 1))}`] };
  if (op === 0x32) return { len: 4, text: `LD (${hex(u24(addr + 1))}),A`, observations: [`memory ${hex(u24(addr + 1))}`] };
  if (op === 0x3a) return { len: 4, text: `LD A,(${hex(u24(addr + 1))})`, observations: [`memory ${hex(u24(addr + 1))}`] };
  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) return { len: 1, text: 'HALT' };
    return { len: 1, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  }
  if (op >= 0x80 && op <= 0xbf) return { len: 1, text: `${alu[(op >> 3) & 7]} ${r[op & 7]}`.replace(', ', ',') };
  if ((op & 0xc7) === 0xc0) return { len: 1, text: `RET ${cc[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0xc2) {
    const target = u24(addr + 1);
    return { len: 4, text: `JP ${cc[(op >> 3) & 7]},${hex(target)}`, observations: [`branch ${hex(target)}`] };
  }
  if ((op & 0xc7) === 0xc4) {
    const target = u24(addr + 1);
    return { len: 4, text: `CALL ${cc[(op >> 3) & 7]},${hex(target)}`, observations: [`CALL target ${hex(target)}`] };
  }
  if ((op & 0xc7) === 0xc7) return { len: 1, text: `RST ${hex(op & 0x38, 2)}` };
  if ((op & 0xcf) === 0xc1) return { len: 1, text: `POP ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0xc5) return { len: 1, text: `PUSH ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xc7) === 0xc6) return { len: 2, text: `${alu[(op >> 3) & 7]} ${hex(rom[addr + 1], 2)}`.replace(', ', ',') };
  if (op === 0xc3) {
    const target = u24(addr + 1);
    return { len: 4, text: `JP ${hex(target)}`, observations: [`JP target ${hex(target)}`], terminal: true };
  }
  if (op === 0xc9) return { len: 1, text: 'RET', terminal: true };
  if (op === 0xcd) {
    const target = u24(addr + 1);
    return { len: 4, text: `CALL ${hex(target)}`, observations: [`CALL target ${hex(target)}`] };
  }
  if (op === 0xd3) return { len: 2, text: `OUT (${hex(rom[addr + 1], 2)}),A`, observations: [`I/O port ${hex(rom[addr + 1], 2)}`] };
  if (op === 0xdb) return { len: 2, text: `IN A,(${hex(rom[addr + 1], 2)})`, observations: [`I/O port ${hex(rom[addr + 1], 2)}`] };
  if (op === 0xe3) return { len: 1, text: 'EX (SP),HL' };
  if (op === 0xe9) return { len: 1, text: 'JP (HL)', terminal: true };
  if (op === 0xeb) return { len: 1, text: 'EX DE,HL' };
  if (op === 0xf3) return { len: 1, text: 'DI' };
  if (op === 0xf9) return { len: 1, text: 'LD SP,HL' };
  if (op === 0xfb) return { len: 1, text: 'EI' };
  if (op === 0x27) return { len: 1, text: 'DAA' };
  if (op === 0x2f) return { len: 1, text: 'CPL' };
  if (op === 0x37) return { len: 1, text: 'SCF' };
  if (op === 0x3f) return { len: 1, text: 'CCF' };
  return { len: 1, text: `DB ${hexByte(op)}` };
}

function disassemble(start, limit) {
  const rows = [];
  let pc = start;
  const end = Math.min(rom.length, start + limit);
  while (pc < end) {
    const decoded = decode(pc);
    rows.push({
      addr: pc,
      bytes: rawBytes(pc, decoded.len),
      text: decoded.text,
      observations: decoded.observations ?? [],
    });
    pc += decoded.len;
    if (decoded.terminal) break;
  }
  return rows;
}

function scanCall(target) {
  const pattern = [0xcd, target & 0xff, (target >> 8) & 0xff, (target >> 16) & 0xff];
  const addresses = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    if (rom[i] === pattern[0] && rom[i + 1] === pattern[1] && rom[i + 2] === pattern[2] && rom[i + 3] === pattern[3]) {
      addresses.push(i);
    }
  }
  return addresses;
}

function formatRows(rows) {
  return rows.map((row) => {
    const obs = row.observations.length ? ` ; ${row.observations.join('; ')}` : '';
    return `${hex(row.addr)}  ${row.bytes.padEnd(14)}  ${row.text}${obs}`;
  }).join('\n');
}

function collectAnalysis(rows04, rows130, callers04, callers130) {
  const allRows = [...rows04, ...rows130];
  const calls = allRows.flatMap((row) => row.observations.filter((x) => x.startsWith('CALL target ')).map((x) => x.slice('CALL target '.length)));
  const memoryRefs = allRows.flatMap((row) => row.observations.filter((x) => x.startsWith('memory ')).map((x) => x.slice('memory '.length)));
  const ioRefs = allRows.flatMap((row) => row.observations.filter((x) => x.startsWith('I/O')).map((x) => x.replace(/^I\/O (port|or short memory) /, '')));
  const hasBlockCopy = rows04.concat(rows130).some((row) => /LDI|LDIR|LDD|LDDR/.test(row.text));
  const hasStackHeavy = rows04.filter((row) => /PUSH|POP/.test(row.text)).length >= 4;
  const hasDirectMem = memoryRefs.length > 0;
  const lines = [];
  lines.push(`- 0x04E07B has ${callers04.length} direct CALL-site(s): ${callers04.map((x) => hex(x)).join(', ') || 'none found'}.`);
  lines.push(`- 0x000130 has ${callers130.length} direct CALL-site(s): ${callers130.map((x) => hex(x)).join(', ') || 'none found'}.`);
  lines.push(`- Calls made inside the decoded ranges: ${[...new Set(calls)].join(', ') || 'none in decoded range'}.`);
  lines.push(`- Direct absolute memory references found: ${[...new Set(memoryRefs)].join(', ') || 'none in decoded range'}.`);
  lines.push(`- I/O or short-address references found: ${[...new Set(ioRefs)].join(', ') || 'none in decoded range'}.`);
  if (hasBlockCopy) {
    lines.push('- The decoded code includes eZ80 block-transfer instructions, so part of the routine appears to move or scan contiguous memory.');
  } else {
    lines.push('- No LDIR/LDDR-style block-transfer instruction appears in the decoded ranges, so this does not look like a bulk block-copy initializer by itself.');
  }
  if (hasDirectMem) {
    lines.push('- Because the routine uses direct absolute memory references, the touched RAM/ROM regions are the addresses listed above; classify RAM regions by comparing those addresses to the project memory map.');
  } else {
    lines.push('- The decoded range does not expose direct RAM-region operands; any RAM touched is likely through register-indirect pointers prepared by the caller or by 0x000130.');
  }
  if (hasStackHeavy) {
    lines.push('- The function saves/restores multiple registers, which is consistent with a small service/helper routine called from initialization rather than a leaf arithmetic helper.');
  }
  lines.push('- Static classification should be based on the actual disassembly above: allocator-like behavior would show free-list pointer manipulation and metadata writes; integrity checking would show compare/branch loops; block copy would show LDI/LDIR/LDD/LDDR and source/destination/count setup.');
  return lines.join('\n');
}

const rows04 = disassemble(START_04E07B, 256);
const rows130 = disassemble(START_000130, 128);
const callers04 = scanCall(START_04E07B);
const callers130 = scanCall(START_000130);

const report = `# Phase 607 Decode: 0x04E07B

Generated by \`probe-phase607-decode-04e07b.mjs\`.

## Disassembly: 0x04E07B

\`\`\`asm
${formatRows(rows04)}
\`\`\`

## Disassembly: 0x000130

\`\`\`asm
${formatRows(rows130)}
\`\`\`

## Caller Scan

### CALL 0x04E07B

- Pattern: \`CD 7B E0 04\`
- Count: ${callers04.length}
- Addresses: ${callers04.map((x) => hex(x)).join(', ') || 'none'}

### CALL 0x000130

- Pattern: \`CD 30 01 00\`
- Count: ${callers130.length}
- Addresses: ${callers130.map((x) => hex(x)).join(', ') || 'none'}

## Analysis

${collectAnalysis(rows04, rows130, callers04, callers130)}
`;

fs.writeFileSync(reportPath, report);

console.log(`Decoded 0x04E07B: ${rows04.length} instruction(s)`);
console.log(`Decoded 0x000130: ${rows130.length} instruction(s)`);
console.log(`CALL 0x04E07B count: ${callers04.length}`);
console.log(callers04.map((x) => hex(x)).join(', ') || '(none)');
console.log(`CALL 0x000130 count: ${callers130.length}`);
console.log(callers130.map((x) => hex(x)).join(', ') || '(none)');
console.log(`Wrote ${path.relative(process.cwd(), reportPath)}`);
