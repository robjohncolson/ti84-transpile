import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x055280;
const MAX_END = 0x055300;
const CALL_PATTERN = [0xcd, 0x80, 0x52, 0x05];
const JP_PATTERN = [0xc3, 0x80, 0x52, 0x05];

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function addr(value) {
  return `0x${hex(value, 6)}`;
}

function read8(pc) {
  return rom[pc];
}

function read16(pc) {
  return read8(pc) | (read8(pc + 1) << 8);
}

function read24(pc) {
  return read8(pc) | (read8(pc + 1) << 8) | (read8(pc + 2) << 16);
}

function signed8(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function bytesAt(pc, length) {
  return [...rom.subarray(pc, pc + length)].map((b) => hex(b)).join(' ');
}

function formatHexDump(start, end) {
  const lines = [];
  for (let base = start; base < end; base += 16) {
    const chunkEnd = Math.min(base + 16, end);
    const bytes = [...rom.subarray(base, chunkEnd)].map((b) => hex(b)).join(' ');
    lines.push(`  ${addr(base)}: ${bytes}`);
  }
  return lines;
}

function bitMnemonic(bit, target) {
  return `BIT ${bit},${target}`;
}

function decodeCb(opcode, target = '(HL)') {
  const bitOps = new Map([
    [0x46, bitMnemonic(0, target)],
    [0x4e, bitMnemonic(1, target)],
    [0x56, bitMnemonic(2, target)],
    [0x5e, bitMnemonic(3, target)],
    [0x66, bitMnemonic(4, target)],
    [0x6e, bitMnemonic(5, target)],
    [0x76, bitMnemonic(6, target)],
    [0x7e, bitMnemonic(7, target)],
  ]);
  return bitOps.get(opcode) ?? `CB ${hex(opcode)}`;
}

function decodeInstruction(pc) {
  const op = read8(pc);

  if (op === 0x00) return { length: 1, text: 'NOP' };
  if (op === 0x06) return { length: 2, text: `LD B,0x${hex(read8(pc + 1))}` };
  if (op === 0x0e) return { length: 2, text: `LD C,0x${hex(read8(pc + 1))}` };
  if (op === 0x16) return { length: 2, text: `LD D,0x${hex(read8(pc + 1))}` };
  if (op === 0x1e) return { length: 2, text: `LD E,0x${hex(read8(pc + 1))}` };
  if (op === 0x21) return { length: 4, text: `LD HL,0x${hex(read24(pc + 1), 6)}` };
  if (op === 0x26) return { length: 2, text: `LD H,0x${hex(read8(pc + 1))}` };
  if (op === 0x2e) return { length: 2, text: `LD L,0x${hex(read8(pc + 1))}` };
  if (op === 0x31) return { length: 4, text: `LD SP,0x${hex(read24(pc + 1), 6)}` };
  if (op === 0x32) return { length: 4, text: `LD (0x${hex(read24(pc + 1), 6)}),A` };
  if (op === 0x3a) return { length: 4, text: `LD A,(0x${hex(read24(pc + 1), 6)})` };
  if (op === 0x3e) return { length: 2, text: `LD A,0x${hex(read8(pc + 1))}` };
  if (op === 0x36) return { length: 2, text: `LD (HL),0x${hex(read8(pc + 1))}` };
  if (op === 0x77) return { length: 1, text: 'LD (HL),A' };
  if (op === 0xaf) return { length: 1, text: 'XOR A' };
  if (op === 0xc3) return { length: 4, text: `JP ${addr(read24(pc + 1))}` };
  if (op === 0xc9) return { length: 1, text: 'RET', ret: true };
  if (op === 0xcd) return { length: 4, text: `CALL ${addr(read24(pc + 1))}` };

  if (op === 0x18 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const names = new Map([[0x18, 'JR'], [0x20, 'JR NZ'], [0x28, 'JR Z'], [0x30, 'JR NC'], [0x38, 'JR C']]);
    const offset = signed8(read8(pc + 1));
    return { length: 2, text: `${names.get(op)},${addr(pc + 2 + offset)} ; ${offset >= 0 ? '+' : ''}${offset}` };
  }

  if (op === 0xcb) {
    return { length: 2, text: decodeCb(read8(pc + 1)) };
  }

  if (op === 0xdd || op === 0xfd) {
    const prefix = op === 0xdd ? 'IX' : 'IY';
    const op2 = read8(pc + 1);
    if (op2 === 0x21) return { length: 5, text: `LD ${prefix},0x${hex(read24(pc + 2), 6)}` };
    if (op2 === 0x36) return { length: 4, text: `LD (${prefix}+0x${hex(read8(pc + 2))}),0x${hex(read8(pc + 3))}` };
    if (op2 === 0xcb) {
      const displacement = read8(pc + 2);
      const target = `(${prefix}${signed8(displacement) < 0 ? '' : '+'}${signed8(displacement)})`;
      return { length: 4, text: decodeCb(read8(pc + 3), target) };
    }
    return { length: 2, text: `${prefix} prefix 0x${hex(op2)}` };
  }

  if (op === 0xed) {
    const op2 = read8(pc + 1);
    if (op2 === 0x6f) return { length: 5, text: `LD (${addr(read24(pc + 2))}),HL`, write: { register: read24(pc + 2), source: 'HL' } };
    if (op2 === 0x73) return { length: 5, text: `LD (${addr(read24(pc + 2))}),SP`, write: { register: read24(pc + 2), source: 'SP' } };
    if (op2 === 0x7b) return { length: 5, text: `LD SP,(${addr(read24(pc + 2))})` };
    return { length: 2, text: `ED ${hex(op2)}` };
  }

  return { length: 1, text: `DB 0x${hex(op)}` };
}

function disassembleFunction(start, maxEnd) {
  const lines = [];
  const writes = [];
  const hlAssignments = [];
  let lastHl = 'unknown';
  let pc = start;
  let end = maxEnd;

  while (pc < maxEnd) {
    const decoded = decodeInstruction(pc);
    const raw = bytesAt(pc, decoded.length).padEnd(14, ' ');
    let note = '';

    if (decoded.text.startsWith('LD HL,0x')) {
      lastHl = decoded.text.slice('LD HL,'.length);
      hlAssignments.push({ pc, value: lastHl });
    }

    if (decoded.write) {
      const value = decoded.write.source === 'HL' ? lastHl : decoded.write.source;
      writes.push({ pc, register: decoded.write.register, source: decoded.write.source, value });
      note = ` ; ${hex(decoded.write.register, 6)} <= ${value}`;
    }

    lines.push(`  ${addr(pc)}: ${raw} ${decoded.text}${note}`);
    pc += decoded.length;

    if (decoded.ret) {
      end = pc;
      break;
    }
  }

  return { lines, writes, hlAssignments, end, size: end - start };
}

function searchPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let matched = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }
  return hits;
}

function registerMeaning(register, value) {
  const meanings = new Map([
    [0xe30010, 'VRAM base address register; expected value is 0xD40000 for CE LCD framebuffer'],
    [0xe30018, 'LCD control register in the E30000-E3FFFF LCD register space'],
    [0xe30020, 'LCD timing/config register in the E30000-E3FFFF LCD register space'],
    [0xe30028, 'LCD status/control register; BIT 2 is polled before return'],
  ]);
  return `${value} (${meanings.get(register) ?? 'LCD register write'})`;
}

const decoded = disassembleFunction(START, MAX_END);
const callHits = searchPattern(CALL_PATTERN);
const jpHits = searchPattern(JP_PATTERN);

console.log('=== 0x055280 LCD REGISTER SETUP ===');
console.log('Hex dump:');
console.log(formatHexDump(START, decoded.end).join('\n'));
console.log('Disassembly:');
console.log(decoded.lines.join('\n'));
console.log('LCD registers written:');
for (const write of decoded.writes) {
  console.log(`  ${hex(write.register, 6)} = ${registerMeaning(write.register, write.value)} ; at ${addr(write.pc)}`);
}
if (decoded.writes.length === 0) {
  console.log('  (no ED 6F/ED 73 direct LCD register writes decoded in this range)');
}
console.log('Callers:');
console.log(`  CALL 0x055280 (${CALL_PATTERN.map((b) => hex(b)).join(' ')}): ${callHits.length ? callHits.map(addr).join(', ') : 'none'}`);
console.log(`  JP   0x055280 (${JP_PATTERN.map((b) => hex(b)).join(' ')}): ${jpHits.length ? jpHits.map(addr).join(', ') : 'none'}`);
console.log(`Function size: ${decoded.size} bytes`);
