import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const MAIN_ADDR = 0x0685DF;
const CALLER_ADDR = 0x07FD24;

function readROM(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function hex(b) {
  return b.toString(16).padStart(2, '0');
}

function hex6(a) {
  return '0x' + a.toString(16).padStart(6, '0').toUpperCase();
}

function addr24(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16);
}

function signed8(b) {
  return b > 127 ? b - 256 : b;
}

function bytesText(bytes) {
  return bytes.map(hex).join(' ');
}

function dumpBytes(addr, bytes) {
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    console.log(`${hex6(addr + i)}: ${bytesText(chunk)}`);
  }
}

function disassemble(addr, bytes, maxInstructions = 80) {
  const lines = [];
  const targets = [];

  for (let pc = 0, count = 0; pc < bytes.length && count < maxInstructions; count++) {
    const here = addr + pc;
    const op = bytes[pc];
    let len = 1;
    let text = `DB ${hex(op)}`;

    switch (op) {
      case 0x18:
      case 0x20:
      case 0x28:
      case 0x30:
      case 0x38: {
        if (pc + 1 >= bytes.length) break;
        const condition = {
          0x18: '',
          0x20: 'NZ,',
          0x28: 'Z,',
          0x30: 'NC,',
          0x38: 'C,',
        }[op];
        const target = here + 2 + signed8(bytes[pc + 1]);
        len = 2;
        text = `JR ${condition}${hex6(target)}`;
        targets.push({ from: here, target, type: condition ? `JR ${condition.slice(0, -1)}` : 'JR' });
        break;
      }
      case 0x21:
        if (pc + 3 >= bytes.length) break;
        len = 4;
        text = `LD HL,${hex6(addr24(bytes, pc + 1))}`;
        break;
      case 0x22:
        if (pc + 3 >= bytes.length) break;
        len = 4;
        text = `LD (${hex6(addr24(bytes, pc + 1))}),HL`;
        break;
      case 0x2A:
        if (pc + 3 >= bytes.length) break;
        len = 4;
        text = `LD HL,(${hex6(addr24(bytes, pc + 1))})`;
        break;
      case 0x31:
        if (pc + 3 >= bytes.length) break;
        len = 4;
        text = `LD SP,${hex6(addr24(bytes, pc + 1))}`;
        break;
      case 0x32:
        if (pc + 3 >= bytes.length) break;
        len = 4;
        text = `LD (${hex6(addr24(bytes, pc + 1))}),A`;
        break;
      case 0x3A:
        if (pc + 3 >= bytes.length) break;
        len = 4;
        text = `LD A,(${hex6(addr24(bytes, pc + 1))})`;
        break;
      case 0x3E:
        if (pc + 1 >= bytes.length) break;
        len = 2;
        text = `LD A,0x${hex(bytes[pc + 1])}`;
        break;
      case 0xC0:
        text = 'RET NZ';
        break;
      case 0xC3: {
        if (pc + 3 >= bytes.length) break;
        const target = addr24(bytes, pc + 1);
        len = 4;
        text = `JP ${hex6(target)}`;
        targets.push({ from: here, target, type: 'JP' });
        break;
      }
      case 0xC8:
        text = 'RET Z';
        break;
      case 0xC9:
        text = 'RET';
        break;
      case 0xCD: {
        if (pc + 3 >= bytes.length) break;
        const target = addr24(bytes, pc + 1);
        len = 4;
        text = `CALL ${hex6(target)}`;
        targets.push({ from: here, target, type: 'CALL' });
        break;
      }
      case 0xD0:
        text = 'RET NC';
        break;
      case 0xD8:
        text = 'RET C';
        break;
      case 0xE6:
        if (pc + 1 >= bytes.length) break;
        len = 2;
        text = `AND 0x${hex(bytes[pc + 1])}`;
        break;
      case 0xF1:
        text = 'POP AF';
        break;
      case 0xF5:
        text = 'PUSH AF';
        break;
      case 0xF6:
        if (pc + 1 >= bytes.length) break;
        len = 2;
        text = `OR 0x${hex(bytes[pc + 1])}`;
        break;
      case 0xFE:
        if (pc + 1 >= bytes.length) break;
        len = 2;
        text = `CP 0x${hex(bytes[pc + 1])}`;
        break;
      case 0x2F:
        text = 'CPL';
        break;
      case 0xAF:
        text = 'XOR A';
        break;
    }

    lines.push({
      addr: here,
      bytes: bytes.slice(pc, pc + len),
      text,
    });

    pc += len;
    if (op === 0xC9) break;
  }

  return { lines, targets };
}

function printDisassembly(title, addr, bytes) {
  const decoded = disassemble(addr, bytes);
  console.log(`\n=== ${title} disassembly ===`);
  for (const line of decoded.lines) {
    console.log(`${hex6(line.addr)}  ${bytesText(line.bytes).padEnd(14)} ${line.text}`);
  }
  return decoded;
}

const mainBytes = readROM(MAIN_ADDR, 60);
console.log('=== 0x0685DF ROM bytes (60) ===');
dumpBytes(MAIN_ADDR, mainBytes);

const main = printDisassembly('0x0685DF', MAIN_ADDR, mainBytes);

const callerBytes = readROM(CALLER_ADDR, 24);
console.log('\n=== 0x07FD24 calling context ROM bytes (24) ===');
dumpBytes(CALLER_ADDR, callerBytes);
printDisassembly('0x07FD24 calling context', CALLER_ADDR, callerBytes);

console.log('\n=== CALL/JP/JR targets from 0x0685DF ===');
if (main.targets.length === 0) {
  console.log('(none)');
} else {
  for (const t of main.targets) {
    console.log(`${hex6(t.from)}: ${t.type} -> ${hex6(t.target)}`);
  }
}

const uniqueTargets = [...new Set(main.targets.map((t) => t.target))];
for (const target of uniqueTargets) {
  if (target < 0 || target >= rom.length) {
    console.log(`\n=== ${hex6(target)} skipped: outside ROM ===`);
    continue;
  }

  const bytes = readROM(target, 24);
  console.log(`\n=== ${hex6(target)} sub-target ROM bytes (24) ===`);
  dumpBytes(target, bytes);
  printDisassembly(`${hex6(target)} sub-target`, target, bytes);
}

console.log('\n=== Structured findings ===');
console.log(JSON.stringify({
  target: hex6(MAIN_ADDR),
  purpose: 'Exponent save and normalize helper',
  expectedBehavior: [
    'Read OP1 exponent byte at 0xD005F9',
    'Save original exponent on stack',
    'Set OP1 exponent byte to 0x80',
    'Call FP normalization core at 0x07CBB5',
    'Restore saved AF/exponent state as encoded by the function',
  ],
  mainRead: { address: hex6(MAIN_ADDR), length: mainBytes.length },
  callerContextRead: { address: hex6(CALLER_ADDR), length: callerBytes.length },
  controlFlowTargets: main.targets.map((t) => ({
    from: hex6(t.from),
    type: t.type,
    target: hex6(t.target),
  })),
}, null, 2));
