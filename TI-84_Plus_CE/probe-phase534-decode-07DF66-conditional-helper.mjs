import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Phase 534 probe: decode ROM routine 0x07DF66, a conditional path helper
 * reached by the matrix 0x1C handler's Phase 1 rows conditional path.
 *
 * Findings this probe is designed to surface:
 * - The exact condition checks used by the helper:
 *   - IY flag bit probes encoded as FD CB disp op, such as BIT/RES/SET (IY+n)
 *   - CP n byte comparisons
 *   - conditional JR/JP/CALL/RET opcodes
 * - All CALL targets, decoded as ADL 24-bit ROM addresses.
 * - All return sites, including conditional returns and the first unconditional RET.
 *
 * eZ80 ADL reminder used here:
 * - Absolute CALL/JP/LD rr,nn operands are decoded as three immediate bytes
 *   following the opcode, producing a 24-bit address/value.
 * - Relative JR displacements are signed 8-bit offsets from the next PC.
 *
 * The probe performs linear disassembly only. It does not emulate CPU state.
 */

const ENTRY = 0x07df66;
const READ_LEN = 0x100;
const MIN_BYTES = 80;

const here = dirname(fileURLToPath(import.meta.url));
const romPath = resolve(here, 'ROM.rom');
const rom = readFileSync(romPath);

if (rom.length < ENTRY + MIN_BYTES) {
  throw new Error(`ROM is too small to read ${MIN_BYTES} bytes at ${hex24(ENTRY)}`);
}

const bytes = rom.subarray(ENTRY, ENTRY + READ_LEN);
const calls = [];
const conditions = [];
const returns = [];

const jrOps = {
  0x18: '',
  0x20: 'NZ',
  0x28: 'Z',
  0x30: 'NC',
  0x38: 'C'
};

const retOps = {
  0xc0: 'NZ',
  0xc8: 'Z',
  0xd0: 'NC',
  0xd8: 'C',
  0xe0: 'PO',
  0xe8: 'PE',
  0xf0: 'P',
  0xf8: 'M',
  0xc9: ''
};

const callCondOps = {
  0xc4: 'NZ',
  0xcc: 'Z',
  0xd4: 'NC',
  0xdc: 'C',
  0xe4: 'PO',
  0xec: 'PE',
  0xf4: 'P',
  0xfc: 'M'
};

const jpCondOps = {
  0xc2: 'NZ',
  0xca: 'Z',
  0xd2: 'NC',
  0xda: 'C',
  0xe2: 'PO',
  0xea: 'PE',
  0xf2: 'P',
  0xfa: 'M'
};

const ldImm24Ops = {
  0x01: 'BC',
  0x11: 'DE',
  0x21: 'HL',
  0x31: 'SP'
};

const ldImm8Ops = {
  0x06: 'B',
  0x0e: 'C',
  0x16: 'D',
  0x1e: 'E',
  0x26: 'H',
  0x2e: 'L',
  0x3e: 'A'
};

const simpleOps = {
  0x00: 'NOP',
  0x02: 'LD (BC),A',
  0x03: 'INC BC',
  0x04: 'INC B',
  0x05: 'DEC B',
  0x07: 'RLCA',
  0x08: 'EX AF,AF\'',
  0x09: 'ADD HL,BC',
  0x0a: 'LD A,(BC)',
  0x0b: 'DEC BC',
  0x0c: 'INC C',
  0x0d: 'DEC C',
  0x0f: 'RRCA',
  0x12: 'LD (DE),A',
  0x13: 'INC DE',
  0x14: 'INC D',
  0x15: 'DEC D',
  0x17: 'RLA',
  0x19: 'ADD HL,DE',
  0x1a: 'LD A,(DE)',
  0x1b: 'DEC DE',
  0x1c: 'INC E',
  0x1d: 'DEC E',
  0x1f: 'RRA',
  0x23: 'INC HL',
  0x24: 'INC H',
  0x25: 'DEC H',
  0x27: 'DAA',
  0x29: 'ADD HL,HL',
  0x2b: 'DEC HL',
  0x2c: 'INC L',
  0x2d: 'DEC L',
  0x2f: 'CPL',
  0x33: 'INC SP',
  0x34: 'INC (HL)',
  0x35: 'DEC (HL)',
  0x37: 'SCF',
  0x39: 'ADD HL,SP',
  0x3b: 'DEC SP',
  0x3c: 'INC A',
  0x3d: 'DEC A',
  0x3f: 'CCF',
  0x76: 'HALT',
  0x77: 'LD (HL),A',
  0x7e: 'LD A,(HL)',
  0x86: 'ADD A,(HL)',
  0x87: 'ADD A,A',
  0x90: 'SUB B',
  0x91: 'SUB C',
  0x92: 'SUB D',
  0x93: 'SUB E',
  0x94: 'SUB H',
  0x95: 'SUB L',
  0x96: 'SUB (HL)',
  0x97: 'SUB A',
  0xa0: 'AND B',
  0xa1: 'AND C',
  0xa2: 'AND D',
  0xa3: 'AND E',
  0xa4: 'AND H',
  0xa5: 'AND L',
  0xa6: 'AND (HL)',
  0xa7: 'AND A',
  0xaf: 'XOR A',
  0xb0: 'OR B',
  0xb1: 'OR C',
  0xb2: 'OR D',
  0xb3: 'OR E',
  0xb4: 'OR H',
  0xb5: 'OR L',
  0xb6: 'OR (HL)',
  0xb7: 'OR A',
  0xbe: 'CP (HL)',
  0xbf: 'CP A',
  0xc1: 'POP BC',
  0xc5: 'PUSH BC',
  0xd1: 'POP DE',
  0xd5: 'PUSH DE',
  0xe1: 'POP HL',
  0xe3: 'EX (SP),HL',
  0xe5: 'PUSH HL',
  0xe9: 'JP (HL)',
  0xeb: 'EX DE,HL',
  0xf1: 'POP AF',
  0xf3: 'DI',
  0xf5: 'PUSH AF',
  0xf9: 'LD SP,HL',
  0xfb: 'EI'
};

let pc = ENTRY;
let offset = 0;
let sawUnconditionalRet = false;

console.log(`Decode target: ${hex24(ENTRY)} conditional path helper`);
console.log(`ROM path: ${romPath}`);
console.log(`Read ${bytes.length} bytes from ${hex24(ENTRY)}; linear disassembly stops at first RET after at least ${MIN_BYTES} bytes.\n`);
console.log('address   bytes          instruction        annotation');
console.log('--------  -------------  -----------------  ------------------------------');

while (offset < bytes.length) {
  const address = pc;
  const op = u8(offset);
  const decoded = decode(offset, pc);
  const raw = Array.from(bytes.subarray(offset, offset + decoded.size), b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  console.log(`${hex24(address)}  ${raw.padEnd(13)}  ${decoded.text.padEnd(17)}  ${decoded.note ?? ''}`);

  if (decoded.kind === 'call') {
    calls.push({ address, target: decoded.target, condition: decoded.condition ?? null });
  }
  if (decoded.kind === 'condition') {
    conditions.push({ address, text: decoded.text, note: decoded.note ?? '' });
  }
  if (decoded.kind === 'ret') {
    returns.push({ address, text: decoded.text, condition: decoded.condition ?? null });
    if (!decoded.condition) sawUnconditionalRet = true;
  }

  offset += decoded.size;
  pc += decoded.size;

  if (sawUnconditionalRet && offset >= MIN_BYTES) break;

  if (decoded.size <= 0) {
    throw new Error(`Decoder made no progress at ${hex24(address)} opcode ${hex8(op)}`);
  }
}

console.log('\nFindings');
console.log('--------');
console.log(`Entry: ${hex24(ENTRY)}`);
console.log(`Decoded through: ${hex24(pc - 1)} (${offset} bytes)`);

console.log('\nConditions checked:');
if (conditions.length === 0) {
  console.log('- none found in decoded linear span');
} else {
  for (const condition of conditions) {
    console.log(`- ${hex24(condition.address)}: ${condition.text}${condition.note ? `; ${condition.note}` : ''}`);
  }
}

console.log('\nCALL targets:');
if (calls.length === 0) {
  console.log('- none found in decoded linear span');
} else {
  for (const call of calls) {
    const prefix = call.condition ? `CALL ${call.condition}` : 'CALL';
    console.log(`- ${hex24(call.address)}: ${prefix} ${hex24(call.target)}`);
  }
}

console.log('\nReturns:');
if (returns.length === 0) {
  console.log('- no RET found in decoded linear span');
} else {
  for (const ret of returns) {
    console.log(`- ${hex24(ret.address)}: ${ret.text}`);
  }
}

function decode(i, pcValue) {
  const op = u8(i);

  if (op === 0xfd && u8(i + 1) === 0xcb) {
    const disp = s8(u8(i + 2));
    const subop = u8(i + 3);
    const bit = (subop >> 3) & 0x07;
    const group = subop & 0xc0;
    const reg = subop & 0x07;
    const target = `(IY${dispText(disp)})`;
    const regSuffix = reg === 6 ? target : `${target},${regName(reg)}`;

    if (group === 0x40) {
      return {
        size: 4,
        text: `BIT ${bit},${target}`,
        kind: 'condition',
        note: `tests system flag bit ${bit} at IY${dispText(disp)}`
      };
    }
    if (group === 0x80) {
      return {
        size: 4,
        text: `RES ${bit},${regSuffix}`,
        note: `clears system flag bit ${bit} at IY${dispText(disp)}`
      };
    }
    if (group === 0xc0) {
      return {
        size: 4,
        text: `SET ${bit},${regSuffix}`,
        note: `sets system flag bit ${bit} at IY${dispText(disp)}`
      };
    }
    return { size: 4, text: `FD CB ${hex8(u8(i + 2))} ${hex8(subop)}`, note: `IY indexed rotate/shift on ${target}` };
  }

  if (op === 0xfe) {
    return { size: 2, text: `CP ${hex8(u8(i + 1))}`, kind: 'condition', note: 'sets flags from A comparison' };
  }

  if (op === 0xe6) {
    return { size: 2, text: `AND ${hex8(u8(i + 1))}`, note: 'mask A with immediate' };
  }

  if (op === 0xee) {
    return { size: 2, text: `XOR ${hex8(u8(i + 1))}`, note: 'XOR A with immediate' };
  }

  if (op === 0xf6) {
    return { size: 2, text: `OR ${hex8(u8(i + 1))}`, note: 'OR A with immediate' };
  }

  if (op === 0xc6) {
    return { size: 2, text: `ADD A,${hex8(u8(i + 1))}`, note: 'add immediate to A' };
  }

  if (op === 0xd6) {
    return { size: 2, text: `SUB ${hex8(u8(i + 1))}`, note: 'subtract immediate from A' };
  }

  if (op === 0x36) {
    return { size: 2, text: `LD (HL),${hex8(u8(i + 1))}`, note: 'load immediate into (HL)' };
  }

  if (op in jrOps) {
    const disp = s8(u8(i + 1));
    const target = (pcValue + 2 + disp) & 0xffffff;
    const condition = jrOps[op];
    const text = condition ? `JR ${condition},${hex24(target)}` : `JR ${hex24(target)}`;
    return {
      size: 2,
      text,
      kind: condition ? 'condition' : 'jump',
      condition,
      target,
      note: condition ? `conditional relative branch to ${hex24(target)}` : `relative branch to ${hex24(target)}`
    };
  }

  if (op in retOps) {
    const condition = retOps[op];
    return {
      size: 1,
      text: condition ? `RET ${condition}` : 'RET',
      kind: 'ret',
      condition,
      note: condition ? `returns when ${condition}` : 'unconditional return'
    };
  }

  if (op === 0xcd) {
    const target = u24(i + 1);
    return { size: 4, text: `CALL ${hex24(target)}`, kind: 'call', target, note: callNote(target) };
  }

  if (op in callCondOps) {
    const target = u24(i + 1);
    const condition = callCondOps[op];
    return { size: 4, text: `CALL ${condition},${hex24(target)}`, kind: 'call', condition, target, note: callNote(target) };
  }

  if (op === 0xc3) {
    const target = u24(i + 1);
    return { size: 4, text: `JP ${hex24(target)}`, kind: 'jump', target, note: `absolute branch to ${hex24(target)}` };
  }

  if (op in jpCondOps) {
    const target = u24(i + 1);
    const condition = jpCondOps[op];
    return {
      size: 4,
      text: `JP ${condition},${hex24(target)}`,
      kind: 'condition',
      condition,
      target,
      note: `conditional absolute branch to ${hex24(target)}`
    };
  }

  if (op in ldImm24Ops) {
    const value = u24(i + 1);
    return { size: 4, text: `LD ${ldImm24Ops[op]},${hex24(value)}` };
  }

  if (op in ldImm8Ops) {
    return { size: 2, text: `LD ${ldImm8Ops[op]},${hex8(u8(i + 1))}` };
  }

  // 4-byte memory ops with 24-bit address in ADL mode
  if (op === 0x32) {
    const addr = u24(i + 1);
    return { size: 4, text: `LD (${hex24(addr)}),A` };
  }
  if (op === 0x3a) {
    const addr = u24(i + 1);
    return { size: 4, text: `LD A,(${hex24(addr)})` };
  }
  if (op === 0x22) {
    const addr = u24(i + 1);
    return { size: 4, text: `LD (${hex24(addr)}),HL` };
  }
  if (op === 0x2a) {
    const addr = u24(i + 1);
    return { size: 4, text: `LD HL,(${hex24(addr)})` };
  }

  // DJNZ - relative branch, 2 bytes
  if (op === 0x10) {
    const disp = s8(u8(i + 1));
    const target = (pcValue + 2 + disp) & 0xffffff;
    return { size: 2, text: `DJNZ ${hex24(target)}`, note: `decrement B, jump if NZ to ${hex24(target)}` };
  }

  // Register-to-register LD and misc single-byte ops
  if (op >= 0x40 && op <= 0x7f && op !== 0x76) {
    const dst = (op >> 3) & 0x07;
    const src = op & 0x07;
    const dstName = regName(dst);
    const srcName = regName(src);
    return { size: 1, text: `LD ${dstName},${srcName}` };
  }

  // ALU reg ops: ADD/ADC/SUB/SBC/AND/XOR/OR/CP with register
  if (op >= 0x80 && op <= 0xbf) {
    const aluNames = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    const aluIdx = (op >> 3) & 0x07;
    const reg = op & 0x07;
    return { size: 1, text: `${aluNames[aluIdx]}${regName(reg)}` };
  }

  if (op in simpleOps) {
    return { size: 1, text: simpleOps[op] };
  }

  if (op === 0xed) {
    const sub = u8(i + 1);
    if (sub === 0xa0) return { size: 2, text: 'LDI', note: 'load and increment (DE)←(HL), HL++, DE++, BC--' };
    if (sub === 0xb0) return { size: 2, text: 'LDIR', note: 'block copy (DE)←(HL) repeated BC times' };
    if (sub === 0xa8) return { size: 2, text: 'LDD', note: 'load and decrement' };
    if (sub === 0xb8) return { size: 2, text: 'LDDR', note: 'block copy decrement' };
    if (sub === 0xa1) return { size: 2, text: 'CPI', note: 'compare and increment' };
    if (sub === 0xb1) return { size: 2, text: 'CPIR', note: 'compare repeated' };
    if (sub === 0x6f) return { size: 2, text: 'RLD', note: 'rotate left digit: (HL) nibbles rotate through A low nibble' };
    if (sub === 0x67) return { size: 2, text: 'RRD', note: 'rotate right digit' };
    return { size: 2, text: `ED ${hex8(sub)}`, note: 'extended opcode' };
  }

  if (op === 0xcb) {
    const sub = u8(i + 1);
    const bit = (sub >> 3) & 0x07;
    const reg = sub & 0x07;
    const group = sub & 0xc0;
    if (group === 0x40) return { size: 2, text: `BIT ${bit},${regName(reg)}`, kind: 'condition', note: `tests bit ${bit} of ${regName(reg)}` };
    if (group === 0x80) return { size: 2, text: `RES ${bit},${regName(reg)}`, note: `clears bit ${bit} of ${regName(reg)}` };
    if (group === 0xc0) return { size: 2, text: `SET ${bit},${regName(reg)}`, note: `sets bit ${bit} of ${regName(reg)}` };
    // Rotate/shift group (0x00-0x3F)
    const rotNames = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    const rotIdx = (sub >> 3) & 0x07;
    return { size: 2, text: `${rotNames[rotIdx]} ${regName(reg)}` };
  }

  if (op === 0xdd || op === 0xfd) {
    const sub = u8(i + 1);
    return { size: 2, text: `${hex8(op)} ${hex8(sub)}`, note: 'IX/IY prefixed opcode; add decoder detail if this appears in the target routine' };
  }

  return { size: 1, text: `DB ${hex8(op)}`, note: 'unknown/unimplemented opcode byte' };
}

function callNote(target) {
  if (target === 0x07c8b7) return 'known FP engine call: BCD multiply';
  if (target === 0x07cab9) return 'known FP engine call: BCD divide';
  if (target === 0x07fb48) return 'known FP engine call: BCD shift left';
  return `CALL target ${hex24(target)}`;
}

function u8(i) {
  if (i >= bytes.length) return 0;
  return bytes[i];
}

function u24(i) {
  return u8(i) | (u8(i + 1) << 8) | (u8(i + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function hex8(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function hex24(value) {
  return `0x${(value & 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`;
}

function dispText(value) {
  if (value < 0) return `${value}`;
  return `+${value}`;
}

function regName(index) {
  return ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][index] ?? `r${index}`;
}
