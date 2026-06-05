import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const TABLE_START = 0x061cfa;
const TABLE_END = 0x061db1;
const BASELINE = 0x061d1a;
const ENTRY_061D22 = 0x061d22;
const ENTRY_061D3E = 0x061d3e;
const RAM_START = 0xd00000;
const RAM_END = 0xd3ffff;
const IY_BASE = 0xd00080;

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
}

function u16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function u24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function inRam(addr) {
  return addr >= RAM_START && addr <= RAM_END;
}

function iyOffset(offset) {
  const signed = offset < 0x80 ? offset : offset - 0x100;
  return { signed, absolute: IY_BASE + signed };
}

function rel8(pc, size, offset) {
  const signed = offset < 0x80 ? offset : offset - 0x100;
  return (pc + size + signed) & 0xffffff;
}

function decodeAt(pc) {
  const op = rom[pc];
  const b1 = rom[pc + 1];
  const b2 = rom[pc + 2];
  const b3 = rom[pc + 3];
  const bytes = [];
  const refs = [];
  const tokenLoads = [];
  let size = 1;
  let text = `DB ${hex8(op)}`;

  const set = (nextSize, nextText) => {
    size = nextSize;
    text = nextText;
  };

  if (op === 0x00) set(1, 'NOP');
  else if (op === 0x01) set(4, `LD BC,${hex(u24(pc + 1))}`);
  else if (op === 0x06) set(2, `LD B,${hex8(b1)}`);
  else if (op === 0x0e) set(2, `LD C,${hex8(b1)}`);
  else if (op === 0x11) set(4, `LD DE,${hex(u24(pc + 1))}`);
  else if (op === 0x16) set(2, `LD D,${hex8(b1)}`);
  else if (op === 0x18) {
    const target = rel8(pc, 2, b1);
    refs.push({ kind: 'JR', target });
    set(2, `JR ${hex(target)}`);
  } else if (op === 0x1e) set(2, `LD E,${hex8(b1)}`);
  else if (op === 0x21) set(4, `LD HL,${hex(u24(pc + 1))}`);
  else if (op === 0x26) set(2, `LD H,${hex8(b1)}`);
  else if (op === 0x28 || op === 0x20 || op === 0x30 || op === 0x38) {
    const cc = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' }[op];
    const target = rel8(pc, 2, b1);
    refs.push({ kind: `JR ${cc}`, target });
    set(2, `JR ${cc},${hex(target)}`);
  } else if (op === 0x2e) set(2, `LD L,${hex8(b1)}`);
  else if (op === 0x31) set(4, `LD SP,${hex(u24(pc + 1))}`);
  else if (op === 0x32) {
    const target = u24(pc + 1);
    refs.push({ kind: inRam(target) ? 'RAM write' : 'write', target });
    set(4, `LD (${hex(target)}),A`);
  } else if (op === 0x36) set(2, `LD (HL),${hex8(b1)}`);
  else if (op === 0x3a) {
    const target = u24(pc + 1);
    refs.push({ kind: inRam(target) ? 'RAM read' : 'read', target });
    set(4, `LD A,(${hex(target)})`);
  } else if (op === 0x3e) {
    tokenLoads.push(b1);
    set(2, `LD A,${hex8(b1)}`);
  } else if (op >= 0x40 && op <= 0x7f) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    if (op === 0x76) set(1, 'HALT');
    else set(1, `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`);
  } else if (op === 0xc3) {
    const target = u24(pc + 1);
    refs.push({ kind: 'JP', target });
    set(4, `JP ${hex(target)}`);
  } else if (op === 0xc9) set(1, 'RET');
  else if (op === 0xcd) {
    const target = u24(pc + 1);
    refs.push({ kind: 'CALL', target });
    set(4, `CALL ${hex(target)}`);
  } else if (op >= 0xc7 && op <= 0xff && (op & 0x07) === 0x07) {
    const target = op & 0x38;
    refs.push({ kind: 'RST', target });
    set(1, `RST ${hex8(target)}`);
  } else if (op === 0xdd || op === 0xfd) {
    const index = op === 0xdd ? 'IX' : 'IY';
    const p1 = rom[pc + 1];
    const p2 = rom[pc + 2];
    const p3 = rom[pc + 3];
    if (p1 === 0x21) set(5, `LD ${index},${hex(u24(pc + 2))}`);
    else if (p1 === 0x22) {
      const target = u24(pc + 2);
      refs.push({ kind: inRam(target) ? 'RAM write' : 'write', target });
      set(5, `LD (${hex(target)}),${index}`);
    } else if (p1 === 0x2a) {
      const target = u24(pc + 2);
      refs.push({ kind: inRam(target) ? 'RAM read' : 'read', target });
      set(5, `LD ${index},(${hex(target)})`);
    } else if (p1 === 0x36) {
      const off = iyOffset(p2);
      if (index === 'IY') refs.push({ kind: 'RAM write', target: off.absolute, via: `IY${off.signed >= 0 ? '+' : ''}${off.signed}` });
      set(4, `LD (${index}${off.signed >= 0 ? '+' : ''}${off.signed}),${hex8(p3)}`);
    } else if (p1 === 0x77) {
      const off = iyOffset(p2);
      if (index === 'IY') refs.push({ kind: 'RAM write', target: off.absolute, via: `IY${off.signed >= 0 ? '+' : ''}${off.signed}` });
      set(3, `LD (${index}${off.signed >= 0 ? '+' : ''}${off.signed}),A`);
    } else if (p1 === 0x7e) {
      const off = iyOffset(p2);
      if (index === 'IY') refs.push({ kind: 'RAM read', target: off.absolute, via: `IY${off.signed >= 0 ? '+' : ''}${off.signed}` });
      set(3, `LD A,(${index}${off.signed >= 0 ? '+' : ''}${off.signed})`);
    } else {
      set(2, `DB ${hex8(op)},${hex8(p1)}`);
    }
  } else if (op === 0xed) {
    const p1 = rom[pc + 1];
    if (p1 === 0x43) {
      const target = u24(pc + 2);
      refs.push({ kind: inRam(target) ? 'RAM write' : 'write', target });
      set(5, `LD (${hex(target)}),BC`);
    } else if (p1 === 0x53) {
      const target = u24(pc + 2);
      refs.push({ kind: inRam(target) ? 'RAM write' : 'write', target });
      set(5, `LD (${hex(target)}),DE`);
    } else if (p1 === 0x5b) {
      const target = u24(pc + 2);
      refs.push({ kind: inRam(target) ? 'RAM read' : 'read', target });
      set(5, `LD DE,(${hex(target)})`);
    } else if (p1 === 0x73) {
      const target = u24(pc + 2);
      refs.push({ kind: inRam(target) ? 'RAM write' : 'write', target });
      set(5, `LD (${hex(target)}),SP`);
    } else if (p1 === 0x7b) {
      const target = u24(pc + 2);
      refs.push({ kind: inRam(target) ? 'RAM read' : 'read', target });
      set(5, `LD SP,(${hex(target)})`);
    } else {
      set(2, `DB ${hex8(op)},${hex8(p1)}`);
    }
  }

  for (let i = 0; i < size; i += 1) bytes.push(rom[pc + i]);
  return { pc, size, bytes, text, refs, tokenLoads };
}

function disassemble(start, length) {
  const lines = [];
  const refs = [];
  const tokenLoads = [];
  let pc = start;
  const end = Math.min(start + length, rom.length);
  while (pc < end) {
    const insn = decodeAt(pc);
    lines.push(insn);
    refs.push(...insn.refs);
    tokenLoads.push(...insn.tokenLoads);
    pc += Math.max(insn.size, 1);
  }
  return { start, end, lines, refs, tokenLoads };
}

function formatInsn(insn) {
  const bytes = insn.bytes.map(hex8).join(' ').padEnd(18, ' ');
  const refText = insn.refs.length
    ? ` ; ${insn.refs.map((ref) => `${ref.kind} ${hex(ref.target)}${ref.via ? ` (${ref.via})` : ''}`).join(', ')}`
    : '';
  return `${hex(insn.pc)}: ${bytes} ${insn.text}${refText}`;
}

function printDisasm(title, start, length) {
  const result = disassemble(start, length);
  console.log(`\n=== ${title}: ${hex(start)}..${hex(start + length - 1)} ===`);
  for (const line of result.lines) console.log(formatInsn(line));
  printSummary(result);
  return result;
}

function uniq(values) {
  return [...new Set(values)];
}

function printSummary(result) {
  const calls = result.refs.filter((ref) => ref.kind === 'CALL').map((ref) => ref.target);
  const jumps = result.refs.filter((ref) => ref.kind.startsWith('JP') || ref.kind.startsWith('JR') || ref.kind === 'RST');
  const ramReads = result.refs.filter((ref) => ref.kind === 'RAM read');
  const ramWrites = result.refs.filter((ref) => ref.kind === 'RAM write');
  console.log('--- decoded facts ---');
  console.log(`token/immediate A loads: ${uniq(result.tokenLoads).map(hex8).join(', ') || '(none decoded)'}`);
  console.log(`CALL targets: ${uniq(calls).map((target) => hex(target)).join(', ') || '(none decoded)'}`);
  console.log(`branch/RST targets: ${jumps.map((ref) => `${ref.kind} ${hex(ref.target)}`).join(', ') || '(none decoded)'}`);
  console.log(`RAM reads: ${ramReads.map((ref) => `${hex(ref.target)}${ref.via ? ` (${ref.via})` : ''}`).join(', ') || '(none decoded)'}`);
  console.log(`RAM writes: ${ramWrites.map((ref) => `${hex(ref.target)}${ref.via ? ` (${ref.via})` : ''}`).join(', ') || '(none decoded)'}`);
}

function fixedRecordProbe() {
  console.log(`\n=== token table structure probe: ${hex(TABLE_START)}..${hex(TABLE_END)} ===`);
  for (let size = 4; size <= 8; size += 1) {
    const entries = Math.floor((TABLE_END - TABLE_START + 1) / size);
    const ldA = Array.from({ length: entries }, (_, index) => rom[TABLE_START + index * size] === 0x3e).filter(Boolean).length;
    const rst18 = Array.from({ length: entries }, (_, index) => rom[TABLE_START + index * size + 2] === 0xdf).filter(Boolean).length;
    const call = Array.from({ length: entries }, (_, index) => rom[TABLE_START + index * size + 3] === 0xcd).filter(Boolean).length;
    console.log(`candidate entry size ${size}: entries=${entries}, LD A at entry start=${ldA}, RST 0x18 at +2=${rst18}, CALL at +3=${call}`);
  }

  console.log('\n--- byte-aligned records at every LD A,imm8 in table range ---');
  let record = 0;
  for (let pc = TABLE_START; pc <= TABLE_END; pc += 1) {
    if (rom[pc] !== 0x3e) continue;
    const rst = rom[pc + 2] === 0xdf ? 'RST 0x18' : `+2=${hex8(rom[pc + 2])}`;
    const callTarget = rom[pc + 3] === 0xcd ? `CALL ${hex(u24(pc + 4))}` : '';
    console.log(`${String(record).padStart(2, '0')} ${hex(pc)} token=${hex8(rom[pc + 1])} ${rst} ${callTarget}`.trimEnd());
    record += 1;
  }
}

function roleFor(result) {
  const firstToken = result.tokenLoads[0];
  const hasRst18 = result.refs.some((ref) => ref.kind === 'RST' && ref.target === 0x18);
  const calls = uniq(result.refs.filter((ref) => ref.kind === 'CALL').map((ref) => ref.target)).map((target) => hex(target)).join(', ');
  const ramOps = result.refs.filter((ref) => ref.kind === 'RAM read' || ref.kind === 'RAM write');
  if (hasRst18 && firstToken !== undefined) {
    return `token-entry: loads ${hex8(firstToken)}, invokes RST 0x18${calls ? `, then calls ${calls}` : ''}`;
  }
  if (ramOps.length) {
    return `stateful handler: ${ramOps.map((ref) => `${ref.kind} ${hex(ref.target)}`).join('; ')}${calls ? `; calls ${calls}` : ''}`;
  }
  return `control/helper handler${calls ? `; calls ${calls}` : ''}`;
}

function comparison(results) {
  console.log('\n=== comparison table ===');
  console.log('entry      first LD A  RST 0x18  CALL targets              RAM refs  inferred role');
  for (const [name, result] of results) {
    const first = result.tokenLoads[0] === undefined ? '-' : hex8(result.tokenLoads[0]);
    const rst18 = result.refs.some((ref) => ref.kind === 'RST' && ref.target === 0x18) ? 'yes' : 'no';
    const calls = uniq(result.refs.filter((ref) => ref.kind === 'CALL').map((ref) => ref.target)).map((target) => hex(target)).join(', ') || '-';
    const ramRefs = result.refs.filter((ref) => ref.kind === 'RAM read' || ref.kind === 'RAM write').map((ref) => `${ref.kind}:${hex(ref.target)}`).join(', ') || '-';
    console.log(`${name.padEnd(10)} ${first.padEnd(10)} ${rst18.padEnd(9)} ${calls.padEnd(25)} ${ramRefs.padEnd(9)} ${roleFor(result)}`);
  }

  const role22 = roleFor(results.find(([name]) => name === '0x061D22')[1]);
  const role3e = roleFor(results.find(([name]) => name === '0x061D3E')[1]);
  console.log('\n=== hypothesis check ===');
  console.log(`0x061D22: ${role22}`);
  console.log(`0x061D3E: ${role3e}`);
  console.log('Interpretation note: confirm "push operand" or "execute operator" by inspecting decoded CALL targets and RAM stack/state references above. This probe intentionally reports static evidence instead of hard-coding session hypotheses.');
}

console.log(`ROM: ${romPath}`);
console.log(`size: ${rom.length} bytes`);

const baseline = printDisasm('baseline longjmp/key-to-token reference', BASELINE, 50);
const d22 = printDisasm('entry 0x061D22 candidate token-table offset +8', ENTRY_061D22, 200);
const d3e = printDisasm('entry 0x061D3E candidate token-table offset +36', ENTRY_061D3E, 200);
const table = printDisasm('broader token table region', TABLE_START, TABLE_END - TABLE_START + 1);

fixedRecordProbe();
comparison([
  ['0x061D1A', baseline],
  ['0x061D22', d22],
  ['0x061D3E', d3e],
]);

console.log('\n=== full-region aggregate facts ===');
printSummary(table);
