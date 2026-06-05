import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 524 probe: decode ROM function 0x0997AE.
//
// Context from caller 0x0987B5/0x0987B7:
//   CALL 0x0997AE  ; this pre-setup
//   POP BC         ; consumes stack data intentionally prepared by this path
//   CALL 0x08021B  ; edit-buffer creation / main operation
//
// Working interpretation:
//   0x0997AE is the edit-buffer pre-setup routine used before the main buffer
//   creation call. This probe decodes it and records which state variables and
//   helper calls are involved so the stack/register contract can be documented
//   without touching runtime code.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const romPath = path.join(repoRoot, 'TI-84_Plus_CE', 'ROM.rom');
const rom = fs.readFileSync(romPath);

const TARGET = 0x0997ae;
const MAX_FUNCTION_BYTES = 512;
const CALL_PREVIEW_BYTES = 64;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bytesAt(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function bytesText(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

function u16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function u24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function branchTarget(pc, offset) {
  return (pc + 2 + signed8(offset)) & 0xffffff;
}

function iyBitOp(op) {
  if (op >= 0x46 && op <= 0x7e && (op & 0x07) === 0x06) {
    return `BIT ${(op - 0x46) >> 3},(IY+d)`;
  }
  if (op >= 0x86 && op <= 0xbe && (op & 0x07) === 0x06) {
    return `RES ${(op - 0x86) >> 3},(IY+d)`;
  }
  if (op >= 0xc6 && op <= 0xfe && (op & 0x07) === 0x06) {
    return `SET ${(op - 0xc6) >> 3},(IY+d)`;
  }
  return null;
}

function decode(pc) {
  const start = pc;
  let sis = false;
  let prefix = '';
  let op = rom[pc++];

  if (op === 0x40) {
    sis = true;
    op = rom[pc++];
  }

  if (op === 0xdd || op === 0xfd) {
    prefix = op === 0xdd ? 'IX' : 'IY';
    op = rom[pc++];
    if (op === 0xcb) {
      const disp = rom[pc++];
      const cb = rom[pc++];
      const bit = prefix === 'IY' ? iyBitOp(cb) : null;
      const mnemonic = bit
        ? bit.replace('(IY+d)', `(IY${signed8(disp) < 0 ? '' : '+'}${signed8(disp)})`)
        : `${prefix} CB ${hex8(disp)} ${hex8(cb)}`;
      return { addr: start, len: pc - start, bytes: bytesAt(start, pc - start), text: mnemonic };
    }
  }

  const addrWidth = sis ? 2 : 3;
  const readAddr = () => (sis ? u16(pc) : u24(pc));
  const indexed = (reg) => (prefix ? reg.replaceAll('HL', prefix).replaceAll('H', `${prefix}H`).replaceAll('L', `${prefix}L`) : reg);

  const ins = (len, text, extra = {}) => ({
    addr: start,
    len,
    bytes: bytesAt(start, len),
    text: `${sis ? '.SIS ' : ''}${text}`,
    ...extra,
  });

  switch (op) {
    case 0x00: return ins(pc - start, 'NOP');
    case 0x01: return ins(pc - start + addrWidth, `LD BC,${hex(readAddr(), sis ? 4 : 6)}`);
    case 0x06: return ins(pc - start + 1, `LD B,${hex8(rom[pc])}`);
    case 0x0e: return ins(pc - start + 1, `LD C,${hex8(rom[pc])}`);
    case 0x11: return ins(pc - start + addrWidth, `LD DE,${hex(readAddr(), sis ? 4 : 6)}`);
    case 0x16: return ins(pc - start + 1, `LD D,${hex8(rom[pc])}`);
    case 0x1e: return ins(pc - start + 1, `LD E,${hex8(rom[pc])}`);
    case 0x21: return ins(pc - start + addrWidth, `LD ${indexed('HL')},${hex(readAddr(), sis ? 4 : 6)}`);
    case 0x26: return ins(pc - start + 1, `LD ${indexed('H')},${hex8(rom[pc])}`);
    case 0x2a: {
      const addr = readAddr();
      return ins(pc - start + addrWidth, `LD ${indexed('HL')},(${hex(addr)})`, { memReads: [addr] });
    }
    case 0x2e: return ins(pc - start + 1, `LD ${indexed('L')},${hex8(rom[pc])}`);
    case 0x31: return ins(pc - start + addrWidth, `LD SP,${hex(readAddr(), sis ? 4 : 6)}`);
    case 0x32: {
      const addr = readAddr();
      return ins(pc - start + addrWidth, `LD (${hex(addr)}),A`, { memWrites: [addr] });
    }
    case 0x3a: {
      const addr = readAddr();
      return ins(pc - start + addrWidth, `LD A,(${hex(addr)})`, { memReads: [addr] });
    }
    case 0x3e: return ins(pc - start + 1, `LD A,${hex8(rom[pc])}`);
    case 0x04: return ins(pc - start, 'INC B');
    case 0x05: return ins(pc - start, 'DEC B');
    case 0x0c: return ins(pc - start, 'INC C');
    case 0x0d: return ins(pc - start, 'DEC C');
    case 0x13: return ins(pc - start, 'INC DE');
    case 0x1b: return ins(pc - start, 'DEC DE');
    case 0x23: return ins(pc - start, `INC ${indexed('HL')}`);
    case 0x2b: return ins(pc - start, `DEC ${indexed('HL')}`);
    case 0x3c: return ins(pc - start, 'INC A');
    case 0x3d: return ins(pc - start, 'DEC A');
    case 0x77: return ins(pc - start, `LD (${indexed('HL')}),A`);
    case 0x7e: return ins(pc - start, `LD A,(${indexed('HL')})`);
    case 0xaf: return ins(pc - start, 'XOR A');
    case 0xb7: return ins(pc - start, 'OR A');
    case 0xc0: return ins(pc - start, 'RET NZ', { conditionalReturn: true });
    case 0xc1: return ins(pc - start, 'POP BC');
    case 0xc2: {
      const target = readAddr();
      return ins(pc - start + addrWidth, `JP NZ,${hex(target)}`, { jumpTarget: target, conditionalJump: true });
    }
    case 0xc3: {
      const target = readAddr();
      return ins(pc - start + addrWidth, `JP ${hex(target)}`, { jumpTarget: target, terminal: true });
    }
    case 0xc5: return ins(pc - start, 'PUSH BC');
    case 0xc8: return ins(pc - start, 'RET Z', { conditionalReturn: true });
    case 0xc9: return ins(pc - start, 'RET', { terminal: true });
    case 0xca: {
      const target = readAddr();
      return ins(pc - start + addrWidth, `JP Z,${hex(target)}`, { jumpTarget: target, conditionalJump: true });
    }
    case 0xcd: {
      const target = readAddr();
      return ins(pc - start + addrWidth, `CALL ${hex(target)}`, { callTarget: target });
    }
    case 0xd0: return ins(pc - start, 'RET NC', { conditionalReturn: true });
    case 0xd1: return ins(pc - start, 'POP DE');
    case 0xd2: {
      const target = readAddr();
      return ins(pc - start + addrWidth, `JP NC,${hex(target)}`, { jumpTarget: target, conditionalJump: true });
    }
    case 0xd5: return ins(pc - start, 'PUSH DE');
    case 0xd8: return ins(pc - start, 'RET C', { conditionalReturn: true });
    case 0xda: {
      const target = readAddr();
      return ins(pc - start + addrWidth, `JP C,${hex(target)}`, { jumpTarget: target, conditionalJump: true });
    }
    case 0xe0: return ins(pc - start, 'RET PO', { conditionalReturn: true });
    case 0xe1: return ins(pc - start, `POP ${indexed('HL')}`);
    case 0xe5: return ins(pc - start, `PUSH ${indexed('HL')}`);
    case 0xe6: return ins(pc - start + 1, `AND ${hex8(rom[pc])}`);
    case 0xe8: return ins(pc - start, 'RET PE', { conditionalReturn: true });
    case 0xf0: return ins(pc - start, 'RET P', { conditionalReturn: true });
    case 0xf1: return ins(pc - start, 'POP AF');
    case 0xf5: return ins(pc - start, 'PUSH AF');
    case 0xf8: return ins(pc - start, 'RET M', { conditionalReturn: true });
    case 0xfe: return ins(pc - start + 1, `CP ${hex8(rom[pc])}`);
    case 0x18: {
      const target = branchTarget(start, rom[pc]);
      return ins(pc - start + 1, `JR ${hex(target)}`, { jumpTarget: target, terminal: true });
    }
    case 0x20: {
      const target = branchTarget(start, rom[pc]);
      return ins(pc - start + 1, `JR NZ,${hex(target)}`, { jumpTarget: target, conditionalJump: true });
    }
    case 0x28: {
      const target = branchTarget(start, rom[pc]);
      return ins(pc - start + 1, `JR Z,${hex(target)}`, { jumpTarget: target, conditionalJump: true });
    }
    case 0x30: {
      const target = branchTarget(start, rom[pc]);
      return ins(pc - start + 1, `JR NC,${hex(target)}`, { jumpTarget: target, conditionalJump: true });
    }
    case 0x38: {
      const target = branchTarget(start, rom[pc]);
      return ins(pc - start + 1, `JR C,${hex(target)}`, { jumpTarget: target, conditionalJump: true });
    }
    default:
      return ins(pc - start, `${prefix ? `${prefix} ` : ''}DB ${hex8(op)}`, { unknown: true });
  }
}

function decodeLinear(start, limitBytes) {
  const instructions = [];
  let pc = start;
  const end = Math.min(rom.length, start + limitBytes);
  while (pc < end) {
    const inst = decode(pc);
    instructions.push(inst);
    pc += inst.len;
    if (inst.terminal) break;
  }
  return instructions;
}

function collect(instructions, key) {
  return [...new Set(instructions.flatMap((inst) => inst[key] ?? []))].sort((a, b) => a - b);
}

function printInstructions(instructions) {
  for (const inst of instructions) {
    const raw = bytesText(inst.bytes).padEnd(14, ' ');
    console.log(`${hex(inst.addr)}  ${raw}  ${inst.text}`);
  }
}

const main = decodeLinear(TARGET, MAX_FUNCTION_BYTES);
const byteCount = main.reduce((sum, inst) => sum + inst.len, 0);
const callTargets = [...new Set(main.map((inst) => inst.callTarget).filter((target) => target !== undefined))].sort((a, b) => a - b);
const jumpTargets = [...new Set(main.map((inst) => inst.jumpTarget).filter((target) => target !== undefined))].sort((a, b) => a - b);
const ramReads = collect(main, 'memReads');
const ramWrites = collect(main, 'memWrites');

console.log('Decode 0x0997AE - Edit-Buffer Pre-Setup');
console.log('='.repeat(48));
console.log(`Purpose: pre-setup routine executed before edit-buffer creation; prepares state/stack/register context for the later 0x08021B operation.`);
console.log(`Target: ${hex(TARGET)}`);
console.log(`Decoded byte count: ${byteCount}`);
console.log(`Terminator: ${main.at(-1)?.text ?? 'none'}`);
console.log(`CALL targets: ${callTargets.length ? callTargets.map((target) => hex(target)).join(', ') : '(none)'}`);
console.log(`JP/JR targets: ${jumpTargets.length ? jumpTargets.map((target) => hex(target)).join(', ') : '(none)'}`);
console.log(`RAM reads: ${ramReads.length ? ramReads.map((addr) => hex(addr)).join(', ') : '(none via direct 24-bit LD forms)'}`);
console.log(`RAM writes: ${ramWrites.length ? ramWrites.map((addr) => hex(addr)).join(', ') : '(none via direct 24-bit LD forms)'}`);
console.log('');
console.log('Main disassembly:');
printInstructions(main);

for (const target of callTargets) {
  console.log('');
  console.log(`CALL target preview ${hex(target)} (${CALL_PREVIEW_BYTES} byte window):`);
  const preview = decodeLinear(target, CALL_PREVIEW_BYTES);
  printInstructions(preview);
}
