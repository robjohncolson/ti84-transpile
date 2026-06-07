import fs from 'node:fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x023955;
const RAW_LEN = 64;
const TARGET = [0x55, 0x39, 0x02];

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function byteList(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

function imm24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function rel8(base, offset) {
  const signed = offset & 0x80 ? offset - 0x100 : offset;
  return (base + signed) & 0xFFFFFF;
}

function decodeCb(op) {
  const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
  const bit = (op >> 3) & 7;
  if (op < 0x40) {
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][(op >> 3) & 7];
    return `${rot} ${reg}`;
  }
  if (op < 0x80) return `BIT ${bit},${reg}`;
  if (op < 0xC0) return `RES ${bit},${reg}`;
  return `SET ${bit},${reg}`;
}

function decodeIndexedCb(prefix, addr) {
  const base = prefix === 0xDD ? 'IX' : 'IY';
  const displacement = rom[addr + 2];
  const op = rom[addr + 3];
  const signed = displacement & 0x80 ? displacement - 0x100 : displacement;
  const target = `(${base}${signed < 0 ? '' : '+'}${signed})`;
  const bit = (op >> 3) & 7;
  let mnemonic;

  if (op < 0x40) {
    mnemonic = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][(op >> 3) & 7];
    return `${mnemonic} ${target}`;
  }
  if (op < 0x80) return `BIT ${bit},${target}`;
  if (op < 0xC0) return `RES ${bit},${target}`;
  return `SET ${bit},${target}`;
}

function decodeAt(addr) {
  const op = rom[addr];
  const next = rom[addr + 1];

  const simple = new Map([
    [0x00, ['NOP', 1]],
    [0x02, ['LD (BC),A', 1]],
    [0x03, ['INC BC', 1]],
    [0x04, ['INC B', 1]],
    [0x05, ['DEC B', 1]],
    [0x07, ['RLCA', 1]],
    [0x08, ["EX AF,AF'", 1]],
    [0x09, ['ADD HL,BC', 1]],
    [0x0A, ['LD A,(BC)', 1]],
    [0x0B, ['DEC BC', 1]],
    [0x0C, ['INC C', 1]],
    [0x0D, ['DEC C', 1]],
    [0x0F, ['RRCA', 1]],
    [0x12, ['LD (DE),A', 1]],
    [0x13, ['INC DE', 1]],
    [0x14, ['INC D', 1]],
    [0x15, ['DEC D', 1]],
    [0x17, ['RLA', 1]],
    [0x19, ['ADD HL,DE', 1]],
    [0x1A, ['LD A,(DE)', 1]],
    [0x1B, ['DEC DE', 1]],
    [0x1C, ['INC E', 1]],
    [0x1D, ['DEC E', 1]],
    [0x1F, ['RRA', 1]],
    [0x23, ['INC HL', 1]],
    [0x27, ['DAA', 1]],
    [0x29, ['ADD HL,HL', 1]],
    [0x2B, ['DEC HL', 1]],
    [0x2F, ['CPL', 1]],
    [0x33, ['INC SP', 1]],
    [0x37, ['SCF', 1]],
    [0x39, ['ADD HL,SP', 1]],
    [0x3B, ['DEC SP', 1]],
    [0x3F, ['CCF', 1]],
    [0x76, ['HALT', 1]],
    [0xC0, ['RET NZ', 1, true]],
    [0xC1, ['POP BC', 1]],
    [0xC5, ['PUSH BC', 1]],
    [0xC8, ['RET Z', 1, true]],
    [0xC9, ['RET', 1, true]],
    [0xD0, ['RET NC', 1, true]],
    [0xD1, ['POP DE', 1]],
    [0xD5, ['PUSH DE', 1]],
    [0xD8, ['RET C', 1, true]],
    [0xD9, ['EXX', 1]],
    [0xE1, ['POP HL', 1]],
    [0xE3, ['EX (SP),HL', 1]],
    [0xE5, ['PUSH HL', 1]],
    [0xE9, ['JP (HL)', 1, true]],
    [0xEB, ['EX DE,HL', 1]],
    [0xF1, ['POP AF', 1]],
    [0xF3, ['DI', 1]],
    [0xF5, ['PUSH AF', 1]],
    [0xF9, ['LD SP,HL', 1]],
    [0xFB, ['EI', 1]],
  ]);
  if (simple.has(op)) {
    const [mnemonic, len, stop] = simple.get(op);
    return { addr, bytes: bytesAt(addr, len), mnemonic, len, stop: Boolean(stop) };
  }

  if ((op & 0xC0) === 0x40) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const dst = regs[(op >> 3) & 7];
    const src = regs[op & 7];
    return { addr, bytes: bytesAt(addr, 1), mnemonic: `LD ${dst},${src}`, len: 1 };
  }

  const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
  if (op >= 0x80 && op <= 0xBF) {
    const opName = alu[(op >> 3) & 7];
    const src = reg8[op & 7];
    return { addr, bytes: bytesAt(addr, 1), mnemonic: `${opName},${src}`.replace('SUB,', 'SUB '), len: 1 };
  }

  const imm8Loads = { 0x06: 'B', 0x0E: 'C', 0x16: 'D', 0x1E: 'E', 0x26: 'H', 0x2E: 'L', 0x36: '(HL)', 0x3E: 'A' };
  if (op in imm8Loads) {
    return { addr, bytes: bytesAt(addr, 2), mnemonic: `LD ${imm8Loads[op]},${hex(next)}`, len: 2 };
  }

  const incDec = {
    0x24: 'INC H', 0x25: 'DEC H', 0x2C: 'INC L', 0x2D: 'DEC L',
    0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x3C: 'INC A', 0x3D: 'DEC A',
  };
  if (op in incDec) return { addr, bytes: bytesAt(addr, 1), mnemonic: incDec[op], len: 1 };

  const imm16Loads = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
  if (op in imm16Loads) {
    const value = rom[addr + 1] | (rom[addr + 2] << 8);
    return { addr, bytes: bytesAt(addr, 3), mnemonic: `LD ${imm16Loads[op]},${hex(value, 4)}`, len: 3 };
  }

  const absLoads = {
    0x22: 'LD ({addr}),HL',
    0x2A: 'LD HL,({addr})',
    0x32: 'LD ({addr}),A',
    0x3A: 'LD A,({addr})',
  };
  if (op in absLoads) {
    const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
    return { addr, bytes: bytesAt(addr, 4), mnemonic: absLoads[op].replace('{addr}', hex(target, 6)), len: 4 };
  }

  const relJumps = { 0x10: 'DJNZ', 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
  if (op in relJumps) {
    return { addr, bytes: bytesAt(addr, 2), mnemonic: `${relJumps[op]} ${hex(rel8(addr + 2, next), 6)}`, len: 2, stop: op === 0x18 };
  }

  const callJp = {
    0xC2: 'JP NZ', 0xC3: 'JP', 0xC4: 'CALL NZ', 0xCA: 'JP Z', 0xCC: 'CALL Z', 0xCD: 'CALL',
    0xD2: 'JP NC', 0xD4: 'CALL NC', 0xDA: 'JP C', 0xDC: 'CALL C',
    0xE2: 'JP PO', 0xE4: 'CALL PO', 0xEA: 'JP PE', 0xEC: 'CALL PE',
    0xF2: 'JP P', 0xF4: 'CALL P', 0xFA: 'JP M', 0xFC: 'CALL M',
  };
  if (op in callJp) {
    const target = imm24(addr + 1);
    return { addr, bytes: bytesAt(addr, 4), mnemonic: `${callJp[op]} ${hex(target, 6)}`, len: 4, stop: op === 0xC3 };
  }

  const immAlu = { 0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A', 0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP' };
  if (op in immAlu) {
    const sep = immAlu[op] === 'SUB' ? ' ' : ',';
    return { addr, bytes: bytesAt(addr, 2), mnemonic: `${immAlu[op]}${sep}${hex(next)}`, len: 2 };
  }

  if (op === 0xCB) {
    return { addr, bytes: bytesAt(addr, 2), mnemonic: decodeCb(next), len: 2 };
  }

  if (op === 0xED) {
    if (next === 0x38) return { addr, bytes: bytesAt(addr, 3), mnemonic: `IN A,(${hex(rom[addr + 2])})`, len: 3 };
    if (next === 0x39) return { addr, bytes: bytesAt(addr, 3), mnemonic: `OUT (${hex(rom[addr + 2])}),A`, len: 3 };
    return { addr, bytes: bytesAt(addr, 2), mnemonic: `ED ${hex(next)}`, len: 2 };
  }

  if (op === 0xDD || op === 0xFD) {
    const base = op === 0xDD ? 'IX' : 'IY';
    if (next === 0x21) {
      const value = rom[addr + 2] | (rom[addr + 3] << 8);
      return { addr, bytes: bytesAt(addr, 4), mnemonic: `LD ${base},${hex(value, 4)}`, len: 4 };
    }
    if (next === 0xE1) return { addr, bytes: bytesAt(addr, 2), mnemonic: `POP ${base}`, len: 2 };
    if (next === 0xE5) return { addr, bytes: bytesAt(addr, 2), mnemonic: `PUSH ${base}`, len: 2 };
    if (next === 0xF9) return { addr, bytes: bytesAt(addr, 2), mnemonic: `LD SP,${base}`, len: 2 };
    if (next === 0xCB) return { addr, bytes: bytesAt(addr, 4), mnemonic: decodeIndexedCb(op, addr), len: 4 };
    return { addr, bytes: bytesAt(addr, 2), mnemonic: `${base} prefix ${hex(next)}`, len: 2 };
  }

  return { addr, bytes: bytesAt(addr, 1), mnemonic: `DB ${hex(op)}`, len: 1 };
}

function decodeSequence(start, maxBytes) {
  const instructions = [];
  let addr = start;
  const end = start + maxBytes;

  while (addr < end) {
    const instruction = decodeAt(addr);
    instructions.push(instruction);
    addr += instruction.len;
    if (instruction.stop) break;
  }

  return {
    instructions,
    byteCount: addr - start,
    endAddr: addr,
  };
}

function scanXrefs() {
  const refs = [];
  for (let i = 1; i < rom.length - 2; i++) {
    if (rom[i] !== TARGET[0] || rom[i + 1] !== TARGET[1] || rom[i + 2] !== TARGET[2]) continue;

    const opcodeAddr = i - 1;
    const opcode = rom[opcodeAddr];
    let type = 'data-or-unknown';
    if (opcode === 0xCD) type = 'CALL';
    else if (opcode === 0xC3) type = 'JP';
    else if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(opcode)) type = 'JPcc';
    else if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(opcode)) type = 'CALLcc';
    else if ([0x22, 0x2A, 0x32, 0x3A].includes(opcode)) type = 'absolute-load';

    refs.push({
      operandAddr: i,
      opcodeAddr,
      opcode,
      type,
      bytes: bytesAt(opcodeAddr, 4),
    });
  }
  return refs;
}

function analyzePurpose(instructions) {
  const pops = instructions.filter((ins) => /^POP /.test(ins.mnemonic)).map((ins) => ins.mnemonic.slice(4));
  const io = instructions.filter((ins) => /^(IN|OUT) /.test(ins.mnemonic)).map((ins) => ins.mnemonic);
  const stack = instructions.filter((ins) => /^LD SP,/.test(ins.mnemonic) || ins.mnemonic === 'EX (SP),HL').map((ins) => ins.mnemonic);
  const terminal = instructions[instructions.length - 1]?.mnemonic ?? 'none';
  const notes = [];

  if (pops.length) notes.push(`restores ${pops.join(', ')} from the stack`);
  if (stack.length) notes.push(`adjusts stack state via ${stack.join(', ')}`);
  if (io.length) notes.push(`touches hardware ports via ${io.join('; ')}`);
  if (/^RET/.test(terminal)) notes.push(`returns to caller with ${terminal}`);
  else if (/^JP /.test(terminal)) notes.push(`tail-jumps through ${terminal}`);
  if (!notes.length) notes.push('no obvious register-pop cleanup before the decoded terminator');

  return notes;
}

const rawBytes = bytesAt(START, RAW_LEN);
const decoded = decodeSequence(START, RAW_LEN);
const xrefs = scanXrefs();
const purpose = analyzePurpose(decoded.instructions);

console.log(`Probe: Decode common token-display return path at ${hex(START, 6)}`);
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log('');
console.log(`Raw bytes at ${hex(START, 6)} (${RAW_LEN} bytes):`);
for (let i = 0; i < rawBytes.length; i += 16) {
  console.log(`${hex(START + i, 6)}: ${byteList(rawBytes.slice(i, i + 16))}`);
}

console.log('');
console.log('Decoded instruction sequence:');
for (const ins of decoded.instructions) {
  console.log(`${hex(ins.addr, 6)}  ${byteList(ins.bytes).padEnd(14)}  ${ins.mnemonic}`);
}

console.log('');
console.log(`Decoded byte count: ${decoded.byteCount} (${hex(decoded.byteCount)})`);
console.log(`Stops before: ${hex(decoded.endAddr, 6)}`);
console.log('');
console.log('Purpose analysis:');
for (const note of purpose) console.log(`- ${note}`);

console.log('');
console.log(`Cross-references to ${hex(START, 6)} (LE bytes ${TARGET.map((b) => b.toString(16).padStart(2, '0')).join(' ')}):`);
if (xrefs.length === 0) {
  console.log('- none found');
} else {
  for (const ref of xrefs) {
    console.log(`- ${ref.type.padEnd(15)} opcode@${hex(ref.opcodeAddr, 6)} operand@${hex(ref.operandAddr, 6)} opcode=${hex(ref.opcode)} bytes=${byteList(ref.bytes)}`);
  }
}

console.log('');
console.log('Structured summary:');
console.log(JSON.stringify({
  start: hex(START, 6),
  decodedByteCount: decoded.byteCount,
  endAddr: hex(decoded.endAddr, 6),
  terminalInstruction: decoded.instructions.at(-1)?.mnemonic ?? null,
  instructionCount: decoded.instructions.length,
  purpose,
  xrefs: xrefs.map((ref) => ({
    type: ref.type,
    opcodeAddr: hex(ref.opcodeAddr, 6),
    operandAddr: hex(ref.operandAddr, 6),
    opcode: hex(ref.opcode),
    bytes: byteList(ref.bytes),
  })),
}, null, 2));
