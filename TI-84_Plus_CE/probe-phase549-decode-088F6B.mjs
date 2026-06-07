import fs from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const TARGET = 0x088f6b;
const READ_LEN = 192;

const rom = fs.readFileSync(ROM_PATH);

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function hexAddr(value) {
  return '0x' + value.toString(16).toUpperCase().padStart(6, '0');
}

function readU24(offset) {
  if (offset + 2 >= rom.length) return null;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function bytesAt(offset, len) {
  return Array.from(rom.slice(offset, offset + len), hexByte).join(' ');
}

function rel8Target(nextPc, displacement) {
  const signed = displacement & 0x80 ? displacement - 0x100 : displacement;
  return (nextPc + signed) & 0xffffff;
}

function decodeInstruction(pc) {
  const op = rom[pc];
  const op2 = rom[pc + 1];
  const op3 = rom[pc + 2];
  const imm24 = readU24(pc + 1);

  if (op === 0xcd && imm24 !== null) {
    return { len: 4, text: `CALL ${hexAddr(imm24)}`, call: imm24 };
  }
  if (op === 0xc3 && imm24 !== null) {
    return { len: 4, text: `JP ${hexAddr(imm24)}`, jump: imm24, terminal: true };
  }
  if (op === 0xc9) return { len: 1, text: 'RET', terminal: true };
  if (op === 0x21 && imm24 !== null) return { len: 4, text: `LD HL,${hexAddr(imm24)}` };
  if (op === 0x11 && imm24 !== null) return { len: 4, text: `LD DE,${hexAddr(imm24)}` };
  if (op === 0x01 && imm24 !== null) return { len: 4, text: `LD BC,${hexAddr(imm24)}` };
  if (op === 0x3e) return { len: 2, text: `LD A,0x${hexByte(op2)}` };
  if (op === 0x06) return { len: 2, text: `LD B,0x${hexByte(op2)}` };
  if (op === 0x0e) return { len: 2, text: `LD C,0x${hexByte(op2)}` };
  if (op === 0x16) return { len: 2, text: `LD D,0x${hexByte(op2)}` };
  if (op === 0x1e) return { len: 2, text: `LD E,0x${hexByte(op2)}` };
  if (op === 0x26) return { len: 2, text: `LD H,0x${hexByte(op2)}` };
  if (op === 0x2e) return { len: 2, text: `LD L,0x${hexByte(op2)}` };
  if (op === 0xfe) return { len: 2, text: `CP 0x${hexByte(op2)}` };
  if (op === 0xd6) return { len: 2, text: `SUB 0x${hexByte(op2)}` };
  if (op === 0xc6) return { len: 2, text: `ADD A,0x${hexByte(op2)}` };
  if (op === 0xe6) return { len: 2, text: `AND 0x${hexByte(op2)}` };
  if (op === 0xf6) return { len: 2, text: `OR 0x${hexByte(op2)}` };
  if (op === 0xee) return { len: 2, text: `XOR 0x${hexByte(op2)}` };
  if (op === 0x18) return { len: 2, text: `JR ${hexAddr(rel8Target(pc + 2, op2))}`, terminal: true };
  if (op === 0x20) return { len: 2, text: `JR NZ,${hexAddr(rel8Target(pc + 2, op2))}` };
  if (op === 0x28) return { len: 2, text: `JR Z,${hexAddr(rel8Target(pc + 2, op2))}` };
  if (op === 0x30) return { len: 2, text: `JR NC,${hexAddr(rel8Target(pc + 2, op2))}` };
  if (op === 0x38) return { len: 2, text: `JR C,${hexAddr(rel8Target(pc + 2, op2))}` };
  if (op === 0xc0) return { len: 1, text: 'RET NZ', terminal: true };
  if (op === 0xc8) return { len: 1, text: 'RET Z', terminal: true };
  if (op === 0xd0) return { len: 1, text: 'RET NC', terminal: true };
  if (op === 0xd8) return { len: 1, text: 'RET C', terminal: true };
  if (op === 0xc5) return { len: 1, text: 'PUSH BC' };
  if (op === 0xd5) return { len: 1, text: 'PUSH DE' };
  if (op === 0xe5) return { len: 1, text: 'PUSH HL' };
  if (op === 0xf5) return { len: 1, text: 'PUSH AF' };
  if (op === 0xc1) return { len: 1, text: 'POP BC' };
  if (op === 0xd1) return { len: 1, text: 'POP DE' };
  if (op === 0xe1) return { len: 1, text: 'POP HL' };
  if (op === 0xf1) return { len: 1, text: 'POP AF' };
  if (op === 0x7e) return { len: 1, text: 'LD A,(HL)' };
  if (op === 0x77) return { len: 1, text: 'LD (HL),A' };
  if (op === 0x23) return { len: 1, text: 'INC HL' };
  if (op === 0x2b) return { len: 1, text: 'DEC HL' };
  if (op === 0x13) return { len: 1, text: 'INC DE' };
  if (op === 0x1b) return { len: 1, text: 'DEC DE' };
  if (op === 0x03) return { len: 1, text: 'INC BC' };
  if (op === 0x0b) return { len: 1, text: 'DEC BC' };
  if (op === 0x32 && imm24 !== null) return { len: 4, text: `LD (${hexAddr(imm24)}),A` };
  if (op === 0x3a && imm24 !== null) return { len: 4, text: `LD A,(${hexAddr(imm24)})` };
  if (op === 0x22 && imm24 !== null) return { len: 4, text: `LD (${hexAddr(imm24)}),HL` };
  if (op === 0x2a && imm24 !== null) return { len: 4, text: `LD HL,(${hexAddr(imm24)})` };
  if (op === 0xed && op2 === 0x27) return { len: 2, text: 'LD HL,(HL)' };
  if (op === 0xed && op2 === 0x37) return { len: 2, text: 'LD (HL),HL' };
  if ((op === 0xdd || op === 0xfd) && op2 === 0x21) {
    const reg = op === 0xdd ? 'IX' : 'IY';
    const value = readU24(pc + 2);
    return { len: 5, text: `LD ${reg},${hexAddr(value)}` };
  }
  if ((op === 0xdd || op === 0xfd) && op2 === 0xcb) {
    const reg = op === 0xdd ? 'IX' : 'IY';
    return { len: 4, text: `${reg} CB disp=0x${hexByte(op3)} op=0x${hexByte(rom[pc + 3])}` };
  }
  if (op === 0xcb) return { len: 2, text: `CB 0x${hexByte(op2)}` };
  if (op === 0xed) return { len: 2, text: `ED 0x${hexByte(op2)}` };

  return { len: 1, text: `DB 0x${hexByte(op)}` };
}

function scanXrefs(target) {
  const callXrefs = [];
  const jpXrefs = [];
  for (let i = 0; i <= rom.length - 4; i++) {
    if (rom[i + 1] === (target & 0xff) && rom[i + 2] === ((target >> 8) & 0xff) && rom[i + 3] === ((target >> 16) & 0xff)) {
      if (rom[i] === 0xcd) callXrefs.push(i);
      if (rom[i] === 0xc3) jpXrefs.push(i);
    }
  }
  return { callXrefs, jpXrefs };
}

function disassemble(start, maxBytes) {
  const rows = [];
  const calls = [];
  let pc = start;
  const end = Math.min(start + maxBytes, rom.length);
  while (pc < end) {
    const ins = decodeInstruction(pc);
    rows.push({ pc, len: ins.len, raw: bytesAt(pc, ins.len), text: ins.text });
    if (ins.call !== undefined) calls.push({ from: pc, to: ins.call });
    pc += Math.max(ins.len, 1);
    if (ins.terminal && pc >= start + 80) break;
  }
  return { rows, calls };
}

const raw = rom.slice(TARGET, TARGET + READ_LEN);
const { callXrefs, jpXrefs } = scanXrefs(TARGET);
const disasm = disassemble(TARGET, READ_LEN);

console.log(`Probe phase 549: decode secondary token display output at ${hexAddr(TARGET)}`);
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log('');
console.log(`Raw bytes at ${hexAddr(TARGET)} (${READ_LEN} bytes):`);
console.log(Buffer.from(raw).toString('hex').match(/../g).join(' '));
console.log('');
console.log('Disassembly annotations (eZ80 ADL, focused subset decoder):');
for (const row of disasm.rows) {
  console.log(`${hexAddr(row.pc)}  ${row.raw.padEnd(14)}  ${row.text}`);
}
console.log('');
console.log(`CALL xrefs to ${hexAddr(TARGET)}: ${callXrefs.length}`);
for (const from of callXrefs) console.log(`  ${hexAddr(from)}: CALL ${hexAddr(TARGET)}`);
console.log(`JP xrefs to ${hexAddr(TARGET)}: ${jpXrefs.length}`);
for (const from of jpXrefs) console.log(`  ${hexAddr(from)}: JP ${hexAddr(TARGET)}`);
console.log('');
console.log(`Sub-calls made by ${hexAddr(TARGET)} in decoded window: ${disasm.calls.length}`);
for (const call of disasm.calls) console.log(`  ${hexAddr(call.from)} -> ${hexAddr(call.to)}`);
console.log('');
console.log('Summary:');
console.log('- This probe reads and annotates the function entry directly from ROM, then cross-references full-ROM CALL/JP sites.');
console.log('- Interpret the printed stores, loads, and sub-calls against the 0x0A2A68 primary output path and the 0x0BAB88 template renderer call site.');
console.log('- If the body contains memory writes without glyph-rendering calls, it is likely maintaining secondary state such as cursor position, token shadow text, or an auxiliary display buffer rather than drawing pixels directly.');
