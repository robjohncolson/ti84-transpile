import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const romPath = path.join(__dirname, 'ROM.rom');
const reportPath = path.join(__dirname, 'phase605-decode-0158bc.md');

const rom = fs.readFileSync(romPath);

const ranges = [
  { name: '0x0158B0-0x015920: 0x0158xx guard/intermediate chain', start: 0x0158b0, end: 0x015920 },
  { name: '0x0013B0-0x001400: alternate entry around 0x0013C3', start: 0x0013b0, end: 0x001400 },
  { name: '0x001980-0x0019C0: 0x001988 shared port guard function', start: 0x001980, end: 0x0019c0 },
];

const annotations = new Map([
  [0x0158bc, '0x0158BC = intermediate function under investigation'],
  [0x0158e0, '0x0158E0 = IY+0x42 guard'],
  [0x0158ee, '0x0158EE = conditional SET/RET'],
  [0x0018f8, '0x0018F8 = bulk wipe'],
  [0x001872, '0x001872 = port 0x03 guard'],
  [0x005bbc, '0x005BBC = known CALL target from 0x0158E8'],
]);

const op8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const rp = ['BC', 'DE', 'HL', 'SP'];

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function read8(addr) {
  return addr >= 0 && addr < rom.length ? rom[addr] : 0;
}

function read16(addr) {
  return read8(addr) | (read8(addr + 1) << 8);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bytesAt(addr, len) {
  return Array.from({ length: len }, (_, i) => read8(addr + i).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function target(addr, len, disp) {
  return (addr + len + signed8(disp)) & 0xffff;
}

function decode(addr) {
  const b0 = read8(addr);
  const b1 = read8(addr + 1);
  const b2 = read8(addr + 2);
  const b3 = read8(addr + 3);
  const nn = read16(addr + 1);
  const n = b1;

  if (b0 === 0xfd && b1 === 0xcb) {
    const d = signed8(b2);
    const z = b3 & 7;
    const y = (b3 >> 3) & 7;
    const x = b3 >> 6;
    const loc = `(IY${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
    if (x === 1) return { len: 4, mnemonic: `BIT ${y},${loc}${z !== 6 ? ` -> ${op8[z]}` : ''}` };
    if (x === 2) return { len: 4, mnemonic: `RES ${y},${loc}${z !== 6 ? ` -> ${op8[z]}` : ''}` };
    if (x === 3) return { len: 4, mnemonic: `SET ${y},${loc}${z !== 6 ? ` -> ${op8[z]}` : ''}` };
  }

  if (b0 === 0xfd) {
    if (b1 === 0x21) return { len: 4, mnemonic: `LD IY,${hex(read16(addr + 2), 4)}` };
    if (b1 === 0x22) return { len: 4, mnemonic: `LD (${hex(read16(addr + 2), 4)}),IY`, target: read16(addr + 2), kind: 'mem' };
    if (b1 === 0x2a) return { len: 4, mnemonic: `LD IY,(${hex(read16(addr + 2), 4)})`, target: read16(addr + 2), kind: 'mem' };
    if (b1 === 0xe5) return { len: 2, mnemonic: 'PUSH IY' };
    if (b1 === 0xe1) return { len: 2, mnemonic: 'POP IY' };
    if (b1 === 0x36) return { len: 4, mnemonic: `LD (IY${signed8(b2) < 0 ? '-' : '+'}${hex(Math.abs(signed8(b2)), 2)}),${hex(b3)}` };
    if ((b1 & 0xc7) === 0x46) return { len: 3, mnemonic: `LD ${op8[(b1 >> 3) & 7]},(IY${signed8(b2) < 0 ? '-' : '+'}${hex(Math.abs(signed8(b2)), 2)})` };
    if ((b1 & 0xf8) === 0x70) return { len: 3, mnemonic: `LD (IY${signed8(b2) < 0 ? '-' : '+'}${hex(Math.abs(signed8(b2)), 2)}),${op8[b1 & 7]}` };
  }

  if (b0 === 0xed) {
    const ed = {
      0x44: 'NEG', 0x45: 'RETN', 0x47: 'LD I,A', 0x4d: 'RETI', 0x4f: 'LD R,A',
      0x57: 'LD A,I', 0x5f: 'LD A,R', 0x67: 'RRD', 0x6f: 'RLD', 0xa0: 'LDI',
      0xa1: 'CPI', 0xa2: 'INI', 0xa3: 'OUTI', 0xa8: 'LDD', 0xa9: 'CPD',
      0xaa: 'IND', 0xab: 'OUTD', 0xb0: 'LDIR', 0xb1: 'CPIR', 0xb2: 'INIR',
      0xb3: 'OTIR', 0xb8: 'LDDR', 0xb9: 'CPDR', 0xba: 'INDR', 0xbb: 'OTDR',
    };
    if (ed[b1]) return { len: 2, mnemonic: ed[b1] };
    if ((b1 & 0xc7) === 0x40) return { len: 2, mnemonic: `IN ${op8[(b1 >> 3) & 7]},(C)` };
    if ((b1 & 0xc7) === 0x41) return { len: 2, mnemonic: `OUT (C),${op8[(b1 >> 3) & 7]}` };
    if ((b1 & 0xcf) === 0x4b) return { len: 4, mnemonic: `LD ${rp[(b1 >> 4) & 3]},(${hex(read16(addr + 2), 4)})`, target: read16(addr + 2), kind: 'mem' };
    if ((b1 & 0xcf) === 0x43) return { len: 4, mnemonic: `LD (${hex(read16(addr + 2), 4)}),${rp[(b1 >> 4) & 3]}`, target: read16(addr + 2), kind: 'mem' };
  }

  if (b0 === 0xcb) {
    const y = (b1 >> 3) & 7;
    const z = b1 & 7;
    const x = b1 >> 6;
    if (x === 1) return { len: 2, mnemonic: `BIT ${y},${op8[z]}` };
    if (x === 2) return { len: 2, mnemonic: `RES ${y},${op8[z]}` };
    if (x === 3) return { len: 2, mnemonic: `SET ${y},${op8[z]}` };
    return { len: 2, mnemonic: `${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]} ${op8[z]}` };
  }

  const fixed = {
    0x00: 'NOP', 0x02: 'LD (BC),A', 0x07: 'RLCA', 0x08: "EX AF,AF'", 0x0a: 'LD A,(BC)',
    0x0f: 'RRCA', 0x12: 'LD (DE),A', 0x17: 'RLA', 0x1a: 'LD A,(DE)', 0x1f: 'RRA',
    0x27: 'DAA', 0x2f: 'CPL', 0x37: 'SCF', 0x3f: 'CCF', 0x76: 'HALT', 0xc9: 'RET',
    0xd9: 'EXX', 0xe3: 'EX (SP),HL', 0xe9: 'JP (HL)', 0xeb: 'EX DE,HL', 0xf3: 'DI',
    0xf9: 'LD SP,HL', 0xfb: 'EI',
  };
  if (fixed[b0]) return { len: 1, mnemonic: fixed[b0] };

  if ((b0 & 0xc0) === 0x40) return { len: 1, mnemonic: `LD ${op8[(b0 >> 3) & 7]},${op8[b0 & 7]}` };
  if ((b0 & 0xc0) === 0x80) return { len: 1, mnemonic: `${alu[(b0 >> 3) & 7]} ${op8[b0 & 7]}`.replace('  ', ' ') };
  if ((b0 & 0xc7) === 0x04) return { len: 1, mnemonic: `INC ${op8[(b0 >> 3) & 7]}` };
  if ((b0 & 0xc7) === 0x05) return { len: 1, mnemonic: `DEC ${op8[(b0 >> 3) & 7]}` };
  if ((b0 & 0xc7) === 0x06) return { len: 2, mnemonic: `LD ${op8[(b0 >> 3) & 7]},${hex(n)}` };
  if ((b0 & 0xcf) === 0x01) return { len: 3, mnemonic: `LD ${rp[(b0 >> 4) & 3]},${hex(nn, 4)}` };
  if ((b0 & 0xcf) === 0x03) return { len: 1, mnemonic: `INC ${rp[(b0 >> 4) & 3]}` };
  if ((b0 & 0xcf) === 0x09) return { len: 1, mnemonic: `ADD HL,${rp[(b0 >> 4) & 3]}` };
  if ((b0 & 0xcf) === 0x0b) return { len: 1, mnemonic: `DEC ${rp[(b0 >> 4) & 3]}` };
  if ((b0 & 0xc7) === 0xc0) return { len: 1, mnemonic: `RET ${cc[(b0 >> 3) & 7]}` };
  if ((b0 & 0xc7) === 0xc2) return { len: 3, mnemonic: `JP ${cc[(b0 >> 3) & 7]},${hex(nn, 4)}`, target: nn, kind: 'JP' };
  if ((b0 & 0xc7) === 0xc4) return { len: 3, mnemonic: `CALL ${cc[(b0 >> 3) & 7]},${hex(nn, 4)}`, target: nn, kind: 'CALL' };
  if ((b0 & 0xc7) === 0xc7) return { len: 1, mnemonic: `RST ${hex(b0 & 0x38)}` };

  if (b0 === 0x10) return { len: 2, mnemonic: `DJNZ ${hex(target(addr, 2, n), 4)}`, target: target(addr, 2, n), kind: 'JR' };
  if (b0 === 0x18) return { len: 2, mnemonic: `JR ${hex(target(addr, 2, n), 4)}`, target: target(addr, 2, n), kind: 'JR' };
  if ([0x20, 0x28, 0x30, 0x38].includes(b0)) return { len: 2, mnemonic: `JR ${cc[(b0 >> 3) & 3]},${hex(target(addr, 2, n), 4)}`, target: target(addr, 2, n), kind: 'JR' };
  if (b0 === 0x22) return { len: 3, mnemonic: `LD (${hex(nn, 4)}),HL`, target: nn, kind: 'mem' };
  if (b0 === 0x2a) return { len: 3, mnemonic: `LD HL,(${hex(nn, 4)})`, target: nn, kind: 'mem' };
  if (b0 === 0x32) return { len: 3, mnemonic: `LD (${hex(nn, 4)}),A`, target: nn, kind: 'mem' };
  if (b0 === 0x3a) return { len: 3, mnemonic: `LD A,(${hex(nn, 4)})`, target: nn, kind: 'mem' };
  if (b0 === 0xc3) return { len: 3, mnemonic: `JP ${hex(nn, 4)}`, target: nn, kind: 'JP' };
  if (b0 === 0xc6) return { len: 2, mnemonic: `ADD A,${hex(n)}` };
  if (b0 === 0xcd) return { len: 3, mnemonic: `CALL ${hex(nn, 4)}`, target: nn, kind: 'CALL' };
  if (b0 === 0xce) return { len: 2, mnemonic: `ADC A,${hex(n)}` };
  if (b0 === 0xd3) return { len: 2, mnemonic: `OUT (${hex(n)}),A` };
  if (b0 === 0xd6) return { len: 2, mnemonic: `SUB ${hex(n)}` };
  if (b0 === 0xdb) return { len: 2, mnemonic: `IN A,(${hex(n)})` };
  if (b0 === 0xde) return { len: 2, mnemonic: `SBC A,${hex(n)}` };
  if (b0 === 0xe6) return { len: 2, mnemonic: `AND ${hex(n)}` };
  if (b0 === 0xee) return { len: 2, mnemonic: `XOR ${hex(n)}` };
  if (b0 === 0xf6) return { len: 2, mnemonic: `OR ${hex(n)}` };
  if (b0 === 0xfe) return { len: 2, mnemonic: `CP ${hex(n)}` };

  return { len: 1, mnemonic: `DB ${hex(b0)}` };
}

function disassembleRange(range) {
  const out = [];
  for (let pc = range.start; pc < range.end;) {
    const inst = decode(pc);
    out.push({ addr: pc, ...inst, bytes: bytesAt(pc, inst.len), note: annotations.get(pc) || '' });
    pc += inst.len;
  }
  return out;
}

function scanCallers(targetAddr) {
  const lo = targetAddr & 0xff;
  const hi = targetAddr >> 8;
  const hits = [];
  for (let i = 0; i < rom.length - 2; i++) {
    const b = rom[i];
    if ((b === 0xcd || [0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc, 0xc3, 0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea, 0xf2, 0xfa].includes(b)) && rom[i + 1] === lo && rom[i + 2] === hi) {
      hits.push(i);
    }
  }
  return hits;
}

const decoded = ranges.map((range) => ({ range, instructions: disassembleRange(range) }));
const instructionByAddr = new Map(decoded.flatMap(({ instructions }) => instructions.map((i) => [i.addr, i])));

function callsFrom(start, end) {
  return decoded
    .flatMap(({ instructions }) => instructions)
    .filter((i) => i.addr >= start && i.addr < end && (i.kind === 'CALL' || i.kind === 'JP' || i.kind === 'JR'))
    .map((i) => ({ from: i.addr, kind: i.kind, to: i.target, mnemonic: i.mnemonic }));
}

function lineForInstruction(i) {
  const targetText = i.target == null ? '' : ` ; target=${hex(i.target, 4)}${annotations.has(i.target) ? ` (${annotations.get(i.target)})` : ''}`;
  const noteText = i.note ? ` ; ${i.note}` : '';
  return `${hex(i.addr, 6).padEnd(10)} ${i.bytes.padEnd(12)} ${i.mnemonic}${targetText}${noteText}`;
}

function summarize0158bc() {
  const body = decoded[0].instructions.filter((i) => i.addr >= 0x0158bc && i.addr < 0x0158e0);
  const exits = body.filter((i) => i.kind === 'CALL' || i.kind === 'JP' || i.kind === 'JR' || i.mnemonic.startsWith('RET'));
  const calls = body.filter((i) => i.kind === 'CALL');
  const jumps = body.filter((i) => i.kind === 'JP' || i.kind === 'JR');
  const hasLogic = body.some((i) => /^(BIT|SET|RES|CP|AND|OR|XOR|IN |OUT |JR |JP |RET [A-Z])/.test(i.mnemonic));
  const parts = [];
  if (calls.length) parts.push(`0x0158BC calls ${calls.map((i) => hex(i.target, 4)).join(', ')}.`);
  if (jumps.length) parts.push(`It branches/jumps to ${jumps.map((i) => `${hex(i.target, 4)} via ${i.mnemonic}`).join('; ')}.`);
  if (!calls.length && !jumps.length) parts.push('No CALL/JP/JR target was decoded inside the 0x0158BC..0x0158DF window.');
  parts.push(hasLogic ? 'It is not just an unconditional relay; the decoded body contains local tests or conditional control flow before exiting.' : 'The decoded body is relay-like in this window: no local conditional/data-test opcode was detected before the next known guard entry.');
  parts.push(`Decoded exits in this window: ${exits.map((i) => `${hex(i.addr, 6)} ${i.mnemonic}`).join(', ') || 'none'}.`);
  return parts.join(' ');
}

function summarizeAltPath() {
  const a13 = callsFrom(0x0013b0, 0x001400);
  const a19 = callsFrom(0x001980, 0x0019c0);
  const mentions0158de = a13.some((i) => i.to === 0x0158de) || a19.some((i) => i.to === 0x0158de);
  const mentions1988 = a13.some((i) => i.to === 0x001988);
  const mentions1872 = a19.some((i) => i.to === 0x001872);
  const mentions18f8 = a19.some((i) => i.to === 0x0018f8);
  if (mentions1988 && mentions0158de) {
    return `0x0013C3-area code reaches both 0x001988 and 0x0158DE in the decoded listing. 0x001988 ${mentions1872 ? 'branches/calls to 0x001872, so it shares the same downstream port-guard path' : mentions18f8 ? 'references 0x0018F8 directly' : 'does not directly reference 0x001872/0x0018F8 in this small window; inspect the target it calls next to confirm equivalence'}. This makes the 0x0013C3 -> 0x001988 -> 0x0158DE sequence look like an alternate entry into the same guarded operation when those targets line up in the listing, rather than an independent wipe implementation.`;
  }
  return 'The decoded windows do not show the complete 0x0013C3 -> 0x001988 -> 0x0158DE chain as direct calls in this byte range. Treat it as related guard plumbing, but use the listed branch targets below to decide whether it converges on 0x001872/0x0018F8 or only shares the same port-test idiom.';
}

const callers0158bc = scanCallers(0x0158bc);
const callers0158de = scanCallers(0x0158de);
const callers001988 = scanCallers(0x001988);
const calls0158bc = callsFrom(0x0158bc, 0x0158e0);
const calls0158xx = callsFrom(0x0158b0, 0x015920);
const calls0013 = callsFrom(0x0013b0, 0x001400);
const calls0019 = callsFrom(0x001980, 0x0019c0);

const report = [
  '# Phase 605 Decode: 0x0158BC',
  '',
  'Static decode probe for the intermediate 0x0158BC function between the 0x0158xx guard chain and the known wipe path.',
  '',
  '## Summary',
  '',
  `- ${summarize0158bc()}`,
  `- ${summarizeAltPath()}`,
  '- Guard relationship from prior sessions: 0x0158E0 tests bit 7 at IY+0x42 and returns if already set; 0x0158EE conditionally sets that same bit or returns 0; 0x001872 and 0x001988 both use the port 0x03 bit 4 style guard before the downstream destructive operation at 0x0018F8.',
  '',
  '## Complete Call Graph Observed by This Probe',
  '',
  `- Callers/branchers to 0x0158BC found by whole-ROM byte scan: ${callers0158bc.map((a) => hex(a, 6)).join(', ') || 'none found'}`,
  `- Callers/branchers to 0x0158DE found by whole-ROM byte scan: ${callers0158de.map((a) => hex(a, 6)).join(', ') || 'none found'}`,
  `- Callers/branchers to 0x001988 found by whole-ROM byte scan: ${callers001988.map((a) => hex(a, 6)).join(', ') || 'none found'}`,
  '- 0x0158BC local outgoing control transfers:',
  ...calls0158bc.map((i) => `  - ${hex(i.from, 6)} ${i.kind} ${hex(i.to, 4)} (${i.mnemonic})${annotations.has(i.to) ? ` - ${annotations.get(i.to)}` : ''}`),
  ...(calls0158bc.length ? [] : ['  - none decoded before 0x0158E0']),
  '- 0x0158xx range outgoing control transfers:',
  ...calls0158xx.map((i) => `  - ${hex(i.from, 6)} ${i.kind} ${hex(i.to, 4)} (${i.mnemonic})${annotations.has(i.to) ? ` - ${annotations.get(i.to)}` : ''}`),
  '- 0x0013B0-0x001400 outgoing control transfers:',
  ...calls0013.map((i) => `  - ${hex(i.from, 6)} ${i.kind} ${hex(i.to, 4)} (${i.mnemonic})${annotations.has(i.to) ? ` - ${annotations.get(i.to)}` : ''}`),
  '- 0x001980-0x0019C0 outgoing control transfers:',
  ...calls0019.map((i) => `  - ${hex(i.from, 6)} ${i.kind} ${hex(i.to, 4)} (${i.mnemonic})${annotations.has(i.to) ? ` - ${annotations.get(i.to)}` : ''}`),
  '',
  '## Known Address Annotations',
  '',
  ...Array.from(annotations.entries()).sort((a, b) => a[0] - b[0]).map(([addr, note]) => `- ${hex(addr, 6)}: ${note}`),
  '',
  '## Full Disassembly Listings',
  '',
  ...decoded.flatMap(({ range, instructions }) => [
    `### ${range.name}`,
    '',
    '```',
    ...instructions.map(lineForInstruction),
    '```',
    '',
  ]),
].join('\n');

fs.writeFileSync(reportPath, `${report}\n`);

console.log(`Wrote ${path.relative(repoRoot, reportPath)}`);
