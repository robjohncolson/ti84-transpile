import fs from 'fs';
import path from 'path';

const romPath = path.join(import.meta.dirname, 'ROM.rom');
const rom = new Uint8Array(fs.readFileSync(romPath).buffer);

const STARTS = [0x09b9c8, 0x09baaf];
const KNOWN_RAM = new Map([
  [0xd0231a, 'curPC'],
  [0xd02593, 'OPS stack pointer'],
  [0xd005f8, 'descriptor type'],
  [0xd005f9, 'classifier byte 1'],
  [0xd005fa, 'classifier byte 2'],
]);

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function h8(value) {
  return `$${hex(value & 0xff, 2)}`;
}

function h16(value) {
  return `$${hex(value & 0xffff, 4)}`;
}

function h24(value) {
  return `$${hex(value & 0xffffff, 6)}`;
}

function read8(addr) {
  if (addr < 0 || addr >= rom.length) throw new RangeError(`ROM read out of range at ${h24(addr)}`);
  return rom[addr];
}

function read16(addr) {
  return read8(addr) | (read8(addr + 1) << 8);
}

function read24(addr) {
  return read8(addr) | (read8(addr + 1) << 8) | (read8(addr + 2) << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(addr, size, disp) {
  return (addr + size + signed8(disp)) & 0xffffff;
}

function bytesAt(addr, size) {
  return Array.from({ length: size }, (_, i) => hex(read8(addr + i), 2)).join(' ');
}

function ramName(addr) {
  return KNOWN_RAM.get(addr) ?? null;
}

function annotateOperand(text) {
  return text.replace(/\$[0-9A-F]{6}/g, (match) => {
    const addr = Number.parseInt(match.slice(1), 16);
    const name = ramName(addr);
    return name ? `${match} <${name}>` : match;
  });
}

function prefixedCB(addr) {
  const op = read8(addr + 1);
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (x === 0) return { size: 2, text: `${rot[y]} ${regs[z]}` };
  if (x === 1) return { size: 2, text: `BIT ${y},${regs[z]}` };
  if (x === 2) return { size: 2, text: `RES ${y},${regs[z]}` };
  return { size: 2, text: `SET ${y},${regs[z]}` };
}

function prefixedED(addr) {
  const op = read8(addr + 1);
  const table = new Map([
    [0x44, 'NEG'], [0x45, 'RETN'], [0x46, 'IM 0'], [0x47, 'LD I,A'],
    [0x4D, 'RETI'], [0x4F, 'LD R,A'], [0x56, 'IM 1'], [0x5E, 'IM 2'],
    [0x57, 'LD A,I'], [0x5F, 'LD A,R'], [0x67, 'RRD'], [0x6F, 'RLD'],
    [0xA0, 'LDI'], [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'],
    [0xA8, 'LDD'], [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'],
    [0xB0, 'LDIR'], [0xB1, 'CPIR'], [0xB2, 'INIR'], [0xB3, 'OTIR'],
    [0xB8, 'LDDR'], [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
  ]);
  if (table.has(op)) return { size: 2, text: table.get(op), stop: op === 0x45 || op === 0x4d };

  const rp = ['BC', 'DE', 'HL', 'SP'];
  const y = (op >> 4) & 3;
  const z = op & 0x0f;
  if (z === 0x2) return { size: 2, text: `SBC HL,${rp[y]}` };
  if (z === 0x3) return { size: 5, text: `LD (${h24(read24(addr + 2))}),${rp[y]}` };
  if (z === 0xA) return { size: 2, text: `ADC HL,${rp[y]}` };
  if (z === 0xB) return { size: 5, text: `LD ${rp[y]},(${h24(read24(addr + 2))})` };
  // IN r,(C) / OUT (C),r
  if ((op & 0xC7) === 0x40) return { size: 2, text: `IN ${['B','C','D','E','H','L','F','A'][(op >> 3) & 7]},(C)` };
  if ((op & 0xC7) === 0x41) return { size: 2, text: `OUT (C),${['B','C','D','E','H','L','0','A'][(op >> 3) & 7]}` };
  return { size: 2, text: `ED ${h8(op)}` };
}

function indexed(addr, prefix) {
  const ix = prefix === 0xdd ? 'IX' : 'IY';
  const op = read8(addr + 1);
  const rp = ['BC', 'DE', ix, 'SP'];
  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
  const regs = ['B', 'C', 'D', 'E', `${ix}H`, `${ix}L`, null, 'A'];
  const regOrDisp = (base) => {
    const r = base & 7;
    return r === 6 ? `(${ix}${signed8(read8(addr + 2)) >= 0 ? '+' : ''}${signed8(read8(addr + 2))})` : regs[r];
  };

  if (op === 0xcb) {
    const d = signed8(read8(addr + 2));
    const cb = read8(addr + 3);
    const x = cb >> 6;
    const y = (cb >> 3) & 7;
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    const operand = `(${ix}${d >= 0 ? '+' : ''}${d})`;
    if (x === 0) return { size: 4, text: `${rot[y]} ${operand}` };
    if (x === 1) return { size: 4, text: `BIT ${y},${operand}` };
    if (x === 2) return { size: 4, text: `RES ${y},${operand}` };
    return { size: 4, text: `SET ${y},${operand}` };
  }

  if (op === 0x21) return { size: 5, text: `LD ${ix},${h24(read24(addr + 2))}` };
  if (op === 0x22) return { size: 5, text: `LD (${h24(read24(addr + 2))}),${ix}` };
  if (op === 0x2A) return { size: 5, text: `LD ${ix},(${h24(read24(addr + 2))})` };
  if (op === 0x23) return { size: 2, text: `INC ${ix}` };
  if (op === 0x2B) return { size: 2, text: `DEC ${ix}` };
  if (op === 0x34) return { size: 3, text: `INC (${ix}${signed8(read8(addr + 2)) >= 0 ? '+' : ''}${signed8(read8(addr + 2))})` };
  if (op === 0x35) return { size: 3, text: `DEC (${ix}${signed8(read8(addr + 2)) >= 0 ? '+' : ''}${signed8(read8(addr + 2))})` };
  if (op === 0x36) return { size: 4, text: `LD (${ix}${signed8(read8(addr + 2)) >= 0 ? '+' : ''}${signed8(read8(addr + 2))}),${h8(read8(addr + 3))}` };
  if ((op & 0xcf) === 0x09) return { size: 2, text: `ADD ${ix},${rp[(op >> 4) & 3]}` };
  if ((op & 0xc7) === 0x46) return { size: 3, text: `LD ${regs[(op >> 3) & 7]},${regOrDisp(op)}` };
  if ((op & 0xf8) === 0x70) return { size: 3, text: `LD ${regOrDisp(0x46)},${regs[op & 7] ?? '(HL)'}` };
  if ((op & 0xc7) === 0x86) return { size: 3, text: `${alu[(op >> 3) & 7]} ${regOrDisp(op)}` };
  return { size: 2, text: `${ix} prefix ${h8(op)}` };
}

function decode(addr) {
  const op = read8(addr);
  if (op === 0xcb) return prefixedCB(addr);
  if (op === 0xed) return prefixedED(addr);
  if (op === 0xdd || op === 0xfd) return indexed(addr, op);

  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const rp2 = ['BC', 'DE', 'HL', 'AF'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0x00) return { size: 1, text: 'NOP' };
  if (op === 0x10) return { size: 2, text: `DJNZ ${h24(relTarget(addr, 2, read8(addr + 1)))}` };
  if (op === 0x18) return { size: 2, text: `JR ${h24(relTarget(addr, 2, read8(addr + 1)))}`, branch: relTarget(addr, 2, read8(addr + 1)) };
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) return { size: 2, text: `JR ${cc[y - 4]},${h24(relTarget(addr, 2, read8(addr + 1)))}`, branch: relTarget(addr, 2, read8(addr + 1)) };
  if (op === 0x76) return { size: 1, text: 'HALT' };
  if (op === 0xc3) return { size: 4, text: `JP ${h24(read24(addr + 1))}`, branch: read24(addr + 1), stop: true };
  if (op === 0xcd) return { size: 4, text: `CALL ${h24(read24(addr + 1))}`, call: read24(addr + 1) };
  if (op === 0xc9) return { size: 1, text: 'RET', stop: true };
  if (op === 0xd9) return { size: 1, text: "EXX" };
  if (op === 0xe3) return { size: 1, text: 'EX (SP),HL' };
  if (op === 0xe9) return { size: 1, text: 'JP (HL)', stop: true };
  if (op === 0xeb) return { size: 1, text: 'EX DE,HL' };
  if (op === 0xf3) return { size: 1, text: 'DI' };
  if (op === 0xfb) return { size: 1, text: 'EI' };

  if (x === 0) {
    if (z === 1) return q === 0 ? { size: 4, text: `LD ${rp[p]},${h24(read24(addr + 1))}` } : { size: 1, text: `ADD HL,${rp[p]}` };
    if (z === 2) {
      const loads = q === 0
        ? [`LD (BC),A`, `LD (DE),A`, `LD (${h24(read24(addr + 1))}),HL`, `LD (${h24(read24(addr + 1))}),A`]
        : [`LD A,(BC)`, `LD A,(DE)`, `LD HL,(${h24(read24(addr + 1))})`, `LD A,(${h24(read24(addr + 1))})`];
      return { size: p >= 2 ? 4 : 1, text: loads[p] };
    }
    if (z === 3) return { size: 1, text: `${q === 0 ? 'INC' : 'DEC'} ${rp[p]}` };
    if (z === 4) return { size: 1, text: `INC ${r[y]}` };
    if (z === 5) return { size: 1, text: `DEC ${r[y]}` };
    if (z === 6) return { size: 2, text: `LD ${r[y]},${h8(read8(addr + 1))}` };
    return { size: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }
  if (x === 1) return { size: 1, text: `LD ${r[y]},${r[z]}` };
  if (x === 2) return { size: 1, text: `${alu[y]} ${r[z]}` };

  if (z === 0) return { size: 1, text: `RET ${cc[y]}`, stopIfUnconditional: false };
  if (z === 1) return q === 0 ? { size: 1, text: `POP ${rp2[p]}` } : { size: 1, text: p === 0 ? 'RET' : ['EXX', 'JP (HL)', 'LD SP,HL'][p - 1], stop: p === 0 || p === 2 };
  if (z === 2) return { size: 4, text: `JP ${cc[y]},${h24(read24(addr + 1))}`, branch: read24(addr + 1) };
  if (z === 3) {
    const misc = ['JP', 'CB', 'OUT', 'IN', 'EX (SP),HL', 'EX DE,HL', 'DI', 'EI'];
    if (y === 0) return { size: 4, text: `JP ${h24(read24(addr + 1))}`, branch: read24(addr + 1), stop: true };
    if (y === 2) return { size: 2, text: `OUT (${h8(read8(addr + 1))}),A` };
    if (y === 3) return { size: 2, text: `IN A,(${h8(read8(addr + 1))})` };
    return { size: 1, text: misc[y] };
  }
  if (z === 4) return { size: 4, text: `CALL ${cc[y]},${h24(read24(addr + 1))}`, call: read24(addr + 1) };
  if (z === 5) return q === 0 ? { size: 1, text: `PUSH ${rp2[p]}` } : { size: 4, text: `CALL ${h24(read24(addr + 1))}`, call: read24(addr + 1) };
  if (z === 6) return { size: 2, text: `${alu[y]} ${h8(read8(addr + 1))}` };
  return { size: 1, text: `RST ${h8(y * 8)}` };
}

function interesting(text) {
  const notes = [];
  if (text.includes('$D0231A')) notes.push('curPC access');
  if (text.includes('$D02593')) notes.push('OPS stack pointer access');
  if (text.includes('$D005F8')) notes.push('B/type descriptor access');
  if (/\bLD A,\((HL|BC|DE|\$)/.test(text)) notes.push('A byte fetch candidate');
  if (/\bLD \((\$D0231A|\$D0231B|\$D0231C)/.test(text) || /\bINC HL\b/.test(text)) notes.push('pointer advance/update candidate');
  if (/\bCP\b|\bSUB\b|\bAND\b|\bOR\b|\bBIT\b/.test(text)) notes.push('validation/range-test candidate');
  return notes.length ? ` ; ${notes.join(', ')}` : '';
}

function disassembleLinear(start, label, maxInstructions = 220) {
  const lines = [];
  const calls = new Set();
  const seen = new Set();
  let pc = start;

  for (let count = 0; count < maxInstructions; count += 1) {
    if (seen.has(pc)) {
      lines.push(`; loop/revisit at ${h24(pc)}, stopping ${label}`);
      break;
    }
    seen.add(pc);
    const ins = decode(pc);
    const text = annotateOperand(ins.text);
    lines.push(`${h24(pc)}  ${bytesAt(pc, ins.size).padEnd(12)} ${text}${interesting(text)}`);
    if (ins.call !== undefined) calls.add(ins.call);
    pc = (pc + ins.size) & 0xffffff;
    if (ins.stop) break;
  }

  return { label, start, lines, calls: [...calls] };
}

function summarize(main, setup, callBlocks) {
  const allLines = [...setup.lines, ...main.lines, ...callBlocks.flatMap((block) => block.lines)];
  const joined = allLines.join('\n');
  const mentionsCurPC = joined.includes('$D0231A');
  const mentionsOps = joined.includes('$D02593');
  const byteFetches = allLines.filter((line) => /\bLD A,\((HL|BC|DE|\$)/.test(line));
  const comparisons = allLines.filter((line) => /\b(CP|BIT|AND|OR|SUB)\b/.test(line));
  const increments = allLines.filter((line) => /\bINC (HL|BC|DE)\b/.test(line) || /\$D0231A/.test(line));

  return [
    '=== Analysis summary ===',
    `Token source pointer seen: ${mentionsCurPC ? 'curPC ($D0231A)' : 'not seen directly'}${mentionsOps ? '; OPS stack pointer ($D02593) also referenced' : ''}`,
    `A-register byte fetch candidates: ${byteFetches.length ? '' : 'none found by simple pattern'}`,
    ...byteFetches.map((line) => `  ${line}`),
    `Pointer advance/update candidates: ${increments.length ? '' : 'none found by simple pattern'}`,
    ...increments.map((line) => `  ${line}`),
    `Validation/range-test candidates: ${comparisons.length ? '' : 'none found by simple pattern'}`,
    ...comparisons.map((line) => `  ${line}`),
    'Read the listing below for exact control flow. Conditional CALL/JP/JR targets are listed, and CALL targets are disassembled one level deep.',
  ];
}

const blocks = STARTS.map((addr) => disassembleLinear(addr, `entry ${h24(addr)}`));
const callTargets = new Set(blocks.flatMap((block) => block.calls));
const callBlocks = [...callTargets]
  .filter((addr) => addr >= 0 && addr < rom.length)
  .map((addr) => disassembleLinear(addr, `1-level CALL target ${h24(addr)}`, 160));

const setup = blocks.find((block) => block.start === 0x09baaf);
const main = blocks.find((block) => block.start === 0x09b9c8);

console.log(`ROM: ${romPath}`);
console.log(`ROM bytes: ${rom.length}`);
console.log('');
console.log(summarize(main, setup, callBlocks).join('\n'));
console.log('');

for (const block of blocks) {
  console.log(`=== ${block.label} ===`);
  console.log(block.lines.join('\n'));
  console.log('');
}

for (const block of callBlocks) {
  console.log(`=== ${block.label} ===`);
  console.log(block.lines.join('\n'));
  console.log('');
}
