import fs from 'fs';

const romPath = 'TI-84_Plus_CE/ROM.rom';
const targetAddr = 0x025774;
const previewLength = 32;
const rom = fs.readFileSync(romPath);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function formatBytes(bytes) {
  return Array.from(bytes, byteHex).join(' ');
}

function decodeAt(addr) {
  const decoded = [];
  let pc = addr;
  let terminal = false;

  while (pc < rom.length && pc < addr + previewLength && !terminal) {
    const start = pc;
    const op = rom[pc++];
    let mnemonic = `DB ${hex(op, 2)}`;

    if (op === 0xC9) {
      mnemonic = 'RET';
      terminal = true;
    } else if (op === 0xC3) {
      const dest = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      mnemonic = `JP ${hex(dest)}`;
      terminal = true;
    } else if (op === 0xCD) {
      const dest = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      mnemonic = `CALL ${hex(dest)}`;
    } else if (op === 0x18) {
      const rel = rom[pc++] << 24 >> 24;
      mnemonic = `JR ${hex(pc + rel)}`;
      terminal = true;
    } else if (op === 0xDD) {
      const op2 = rom[pc++];
      if (op2 === 0xE9) {
        mnemonic = 'JP (IX)';
        terminal = true;
      } else if (op2 === 0x21) {
        const imm = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        mnemonic = `LD IX,${hex(imm)}`;
      } else if (op2 === 0xE5) {
        mnemonic = 'PUSH IX';
      } else if (op2 === 0xE1) {
        mnemonic = 'POP IX';
      } else {
        mnemonic = `DB DD ${hex(op2, 2)}`;
      }
    } else if (op === 0xFD) {
      const op2 = rom[pc++];
      if (op2 === 0xE9) {
        mnemonic = 'JP (IY)';
        terminal = true;
      } else if (op2 === 0x21) {
        const imm = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        mnemonic = `LD IY,${hex(imm)}`;
      } else if (op2 === 0xE5) {
        mnemonic = 'PUSH IY';
      } else if (op2 === 0xE1) {
        mnemonic = 'POP IY';
      } else {
        mnemonic = `DB FD ${hex(op2, 2)}`;
      }
    }

    decoded.push({
      address: start,
      bytes: rom.slice(start, pc),
      mnemonic,
      terminal,
    });
  }

  return decoded;
}

function findXrefs(addr) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;
  const refs = [];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] !== lo || rom[i + 1] !== mid || rom[i + 2] !== hi) continue;

    const precedingAddr = i - 1;
    const precedingOpcode = precedingAddr >= 0 ? rom[precedingAddr] : undefined;
    const kind = precedingOpcode === 0xCD ? 'CALL'
      : precedingOpcode === 0xC3 ? 'JP'
      : 'data-or-unknown';

    refs.push({
      addressBytesAt: i,
      precedingAddr,
      precedingOpcode,
      kind,
    });
  }

  return refs;
}

const raw = rom.slice(targetAddr, targetAddr + previewLength);
const decoded = decodeAt(targetAddr);
const byteCount = decoded.reduce((total, insn) => total + insn.bytes.length, 0);
const xrefs = findXrefs(targetAddr);
const isIxThunk = decoded.length === 1 && decoded[0].mnemonic === 'JP (IX)';
const terminal = decoded.at(-1)?.terminal === true;
const purpose = isIxThunk
  ? 'IX dispatch thunk: transfers control to the address currently held in IX.'
  : terminal
    ? `Short cleanup/dispatch routine ending with ${decoded.at(-1).mnemonic}.`
    : `Decoded ${previewLength} bytes without reaching an unconditional RET or JP.`;

console.log('Probe phase 547: decode 0x025774');
console.log('');
console.log(`ROM: ${romPath}`);
console.log(`Target: ${hex(targetAddr)}`);
console.log('');
console.log(`Raw bytes at ${hex(targetAddr)} (${previewLength} bytes):`);
for (let i = 0; i < raw.length; i += 16) {
  console.log(`  ${hex(targetAddr + i)}: ${formatBytes(raw.slice(i, i + 16))}`);
}

console.log('');
console.log('Decoded instructions:');
for (const insn of decoded) {
  console.log(`  ${hex(insn.address)}  ${formatBytes(insn.bytes).padEnd(14)}  ${insn.mnemonic}`);
}

console.log('');
console.log('Structured summary:');
console.log(JSON.stringify({
  target: hex(targetAddr),
  byteCount,
  instructionCount: decoded.length,
  terminal,
  purpose,
  decoded: decoded.map((insn) => ({
    address: hex(insn.address),
    bytes: formatBytes(insn.bytes),
    mnemonic: insn.mnemonic,
  })),
  xrefs: xrefs.map((ref) => ({
    addressBytesAt: hex(ref.addressBytesAt),
    precedingAddr: ref.precedingAddr >= 0 ? hex(ref.precedingAddr) : null,
    precedingOpcode: ref.precedingOpcode === undefined ? null : hex(ref.precedingOpcode, 2),
    kind: ref.kind,
  })),
}, null, 2));

console.log('');
console.log('Cross-references:');
if (xrefs.length === 0) {
  console.log('  none found');
} else {
  for (const ref of xrefs) {
    const opcode = ref.precedingOpcode === undefined ? 'n/a' : hex(ref.precedingOpcode, 2);
    console.log(`  ref ${hex(ref.addressBytesAt)} preceding ${hex(ref.precedingAddr)} opcode ${opcode} (${ref.kind})`);
  }
}
