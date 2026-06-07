import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0A22B1;
const MAX_BYTES = 200;

const rom = readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function u8(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return u8(addr) | (u8(addr + 1) << 8);
}

function u24(addr) {
  return u8(addr) | (u8(addr + 1) << 8) | (u8(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(pc, size, disp) {
  return (pc + size + s8(disp)) & 0xFFFFFF;
}

function bytesAt(addr, len) {
  return Array.from({ length: len }, (_, i) => hex(u8(addr + i), 2)).join(' ');
}

function knownAddressComment(addr) {
  const known = new Map([
    [0xD00595, 'current column position'],
    [0xD00596, 'column counter'],
    [0xD008D5, 'primary Y coordinate'],
    [0xD0231A, 'cursor position'],
    [0xD0231D, 'cursor state'],
    [0x0A2032, 'line wrap handler'],
    [0x0A22DA, 'renderer dispatch by IY+0x4A bit 4'],
    [0x09EF20, 'immediate render path'],
    [0x09EF44, 'deferred render path'],
  ]);
  return known.get(addr) ?? null;
}

function commentFor(op, operand, pc, size) {
  const text = `${op} ${operand}`.trim();
  const comments = [];

  for (const match of text.matchAll(/\$([0-9A-F]{6})/g)) {
    const addr = Number.parseInt(match[1], 16);
    const known = knownAddressComment(addr);
    if (known) comments.push(`${hex(addr, 6)} = ${known}`);
    if (addr >= 0x05AD00 && addr <= 0x05ADFF) comments.push('possible scroll/display routine region');
  }

  if (/XOR A/.test(text)) comments.push('clear A, often used before zeroing state');
  if (/LD \(\$D00596\),A/.test(text)) comments.push('resets column counter to 0');
  if (/LD \(\$D00595\),A/.test(text)) comments.push('resets current column position to 0');
  if (/LD \(\$D008D5\),A/.test(text)) comments.push('writes primary Y coordinate');
  if (/INC A|ADD A,/.test(text)) comments.push('candidate row/Y advance arithmetic');
  if (/CALL \$05AD/.test(text)) comments.push('candidate scroll/display service call');
  if (/CALL \$0A22DA/.test(text)) comments.push('renders through immediate/deferred dispatcher');
  if (/LD \(IY\+\$4A\),|BIT [0-7],\(IY\+\$4A\)|SET [0-7],\(IY\+\$4A\)|RES [0-7],\(IY\+\$4A\)/.test(text)) {
    comments.push('touches text output guard/status flags');
  }
  if (/RET/.test(text)) comments.push('returns to 0x0A1B5B caller path before line-wrap check');

  return comments.join('; ');
}

function decode(addr) {
  const op = u8(addr);

  if (op === 0x00) return { size: 1, op: 'NOP', operand: '' };
  if (op === 0x04) return { size: 1, op: 'INC', operand: 'B' };
  if (op === 0x05) return { size: 1, op: 'DEC', operand: 'B' };
  if (op === 0x06) return { size: 2, op: 'LD', operand: `B,${hex(u8(addr + 1))}` };
  if (op === 0x0C) return { size: 1, op: 'INC', operand: 'C' };
  if (op === 0x0D) return { size: 1, op: 'DEC', operand: 'C' };
  if (op === 0x0E) return { size: 2, op: 'LD', operand: `C,${hex(u8(addr + 1))}` };
  if (op === 0x14) return { size: 1, op: 'INC', operand: 'D' };
  if (op === 0x15) return { size: 1, op: 'DEC', operand: 'D' };
  if (op === 0x16) return { size: 2, op: 'LD', operand: `D,${hex(u8(addr + 1))}` };
  if (op === 0x18) return { size: 2, op: 'JR', operand: `$${hex(relTarget(addr, 2, u8(addr + 1)), 6).slice(2)}` };
  if (op === 0x1C) return { size: 1, op: 'INC', operand: 'E' };
  if (op === 0x1D) return { size: 1, op: 'DEC', operand: 'E' };
  if (op === 0x1E) return { size: 2, op: 'LD', operand: `E,${hex(u8(addr + 1))}` };
  if (op === 0x20) return { size: 2, op: 'JR NZ', operand: `$${hex(relTarget(addr, 2, u8(addr + 1)), 6).slice(2)}` };
  if (op === 0x21) return { size: 4, op: 'LD', operand: `HL,$${hex(u24(addr + 1), 6).slice(2)}` };
  if (op === 0x22) return { size: 4, op: 'LD', operand: `($${hex(u24(addr + 1), 6).slice(2)}),HL` };
  if (op === 0x23) return { size: 1, op: 'INC', operand: 'HL' };
  if (op === 0x28) return { size: 2, op: 'JR Z', operand: `$${hex(relTarget(addr, 2, u8(addr + 1)), 6).slice(2)}` };
  if (op === 0x2A) return { size: 4, op: 'LD', operand: `HL,($${hex(u24(addr + 1), 6).slice(2)})` };
  if (op === 0x2B) return { size: 1, op: 'DEC', operand: 'HL' };
  if (op === 0x30) return { size: 2, op: 'JR NC', operand: `$${hex(relTarget(addr, 2, u8(addr + 1)), 6).slice(2)}` };
  if (op === 0x31) return { size: 4, op: 'LD', operand: `SP,$${hex(u24(addr + 1), 6).slice(2)}` };
  if (op === 0x32) return { size: 4, op: 'LD', operand: `($${hex(u24(addr + 1), 6).slice(2)}),A` };
  if (op === 0x38) return { size: 2, op: 'JR C', operand: `$${hex(relTarget(addr, 2, u8(addr + 1)), 6).slice(2)}` };
  if (op === 0x3A) return { size: 4, op: 'LD', operand: `A,($${hex(u24(addr + 1), 6).slice(2)})` };
  if (op === 0x3C) return { size: 1, op: 'INC', operand: 'A' };
  if (op === 0x3D) return { size: 1, op: 'DEC', operand: 'A' };
  if (op === 0x3E) return { size: 2, op: 'LD', operand: `A,${hex(u8(addr + 1))}` };
  if (op === 0x47) return { size: 1, op: 'LD', operand: 'B,A' };
  if (op === 0x4F) return { size: 1, op: 'LD', operand: 'C,A' };
  if (op === 0x57) return { size: 1, op: 'LD', operand: 'D,A' };
  if (op === 0x5F) return { size: 1, op: 'LD', operand: 'E,A' };
  if (op === 0x67) return { size: 1, op: 'LD', operand: 'H,A' };
  if (op === 0x6F) return { size: 1, op: 'LD', operand: 'L,A' };
  if (op === 0x77) return { size: 1, op: 'LD', operand: '(HL),A' };
  if (op === 0x7E) return { size: 1, op: 'LD', operand: 'A,(HL)' };
  if (op === 0xAF) return { size: 1, op: 'XOR', operand: 'A' };
  if (op === 0xB7) return { size: 1, op: 'OR', operand: 'A' };
  if (op === 0xC0) return { size: 1, op: 'RET NZ', operand: '' };
  if (op === 0xC2) return { size: 4, op: 'JP NZ', operand: `$${hex(u24(addr + 1), 6).slice(2)}` };
  if (op === 0xC3) return { size: 4, op: 'JP', operand: `$${hex(u24(addr + 1), 6).slice(2)}` };
  if (op === 0xC8) return { size: 1, op: 'RET Z', operand: '' };
  if (op === 0xC9) return { size: 1, op: 'RET', operand: '' };
  if (op === 0xCA) return { size: 4, op: 'JP Z', operand: `$${hex(u24(addr + 1), 6).slice(2)}` };
  if (op === 0xCD) return { size: 4, op: 'CALL', operand: `$${hex(u24(addr + 1), 6).slice(2)}` };
  if (op === 0xD0) return { size: 1, op: 'RET NC', operand: '' };
  if (op === 0xD2) return { size: 4, op: 'JP NC', operand: `$${hex(u24(addr + 1), 6).slice(2)}` };
  if (op === 0xD8) return { size: 1, op: 'RET C', operand: '' };
  if (op === 0xDA) return { size: 4, op: 'JP C', operand: `$${hex(u24(addr + 1), 6).slice(2)}` };
  if (op === 0xE6) return { size: 2, op: 'AND', operand: hex(u8(addr + 1)) };
  if (op === 0xF6) return { size: 2, op: 'OR', operand: hex(u8(addr + 1)) };
  if (op === 0xFE) return { size: 2, op: 'CP', operand: hex(u8(addr + 1)) };

  if (op === 0xED) {
    const ext = u8(addr + 1);
    if (ext === 0x4B) return { size: 5, op: 'LD', operand: `BC,($${hex(u24(addr + 2), 6).slice(2)})` };
    if (ext === 0x53) return { size: 5, op: 'LD', operand: `($${hex(u24(addr + 2), 6).slice(2)}),DE` };
    if (ext === 0x5B) return { size: 5, op: 'LD', operand: `DE,($${hex(u24(addr + 2), 6).slice(2)})` };
    if (ext === 0x73) return { size: 5, op: 'LD', operand: `($${hex(u24(addr + 2), 6).slice(2)}),SP` };
    if (ext === 0x7B) return { size: 5, op: 'LD', operand: `SP,($${hex(u24(addr + 2), 6).slice(2)})` };
    return { size: 2, op: 'ED', operand: hex(ext) };
  }

  if (op === 0xFD) {
    const ext = u8(addr + 1);
    const disp = u8(addr + 2);
    if (ext === 0x21) return { size: 5, op: 'LD', operand: `IY,$${hex(u24(addr + 2), 6).slice(2)}` };
    if (ext === 0x34) return { size: 3, op: 'INC', operand: `(IY+${hex(disp)})` };
    if (ext === 0x35) return { size: 3, op: 'DEC', operand: `(IY+${hex(disp)})` };
    if (ext === 0x36) return { size: 4, op: 'LD', operand: `(IY+${hex(disp)}),${hex(u8(addr + 3))}` };
    if (ext === 0x7E) return { size: 3, op: 'LD', operand: `A,(IY+${hex(disp)})` };
    if (ext === 0x77) return { size: 3, op: 'LD', operand: `(IY+${hex(disp)}),A` };
    if (ext === 0xCB) {
      const cbDisp = u8(addr + 2);
      const cb = u8(addr + 3);
      const bit = (cb >> 3) & 7;
      if (cb >= 0x40 && cb <= 0x7F) return { size: 4, op: 'BIT', operand: `${bit},(IY+${hex(cbDisp)})` };
      if (cb >= 0x80 && cb <= 0xBF) return { size: 4, op: 'RES', operand: `${bit},(IY+${hex(cbDisp)})` };
      if (cb >= 0xC0 && cb <= 0xFF) return { size: 4, op: 'SET', operand: `${bit},(IY+${hex(cbDisp)})` };
      return { size: 4, op: 'FD CB', operand: `${hex(cbDisp)} ${hex(cb)}` };
    }
    return { size: 2, op: 'FD', operand: hex(ext) };
  }

  return { size: 1, op: 'DB', operand: hex(op) };
}

const instructions = [];
let pc = START;
const end = Math.min(rom.length, START + MAX_BYTES);

while (pc < end) {
  const decoded = decode(pc);
  const comment = commentFor(decoded.op, decoded.operand, pc, decoded.size);
  instructions.push({
    address: pc,
    bytes: bytesAt(pc, decoded.size),
    text: `${decoded.op}${decoded.operand ? ` ${decoded.operand}` : ''}`,
    comment,
  });
  pc += decoded.size;
  if (/^RET/.test(decoded.op)) break;
}

const touches = {
  resetsColumnCounter: instructions.some((i) => /LD \(\$D00596\),A/.test(i.text)),
  resetsCurrentColumn: instructions.some((i) => /LD \(\$D00595\),A/.test(i.text)),
  touchesYCoordinate: instructions.some((i) => /\$D008D5/.test(i.text)),
  touchesCursorPosition: instructions.some((i) => /\$D0231A/.test(i.text)),
  touchesCursorState: instructions.some((i) => /\$D0231D/.test(i.text)),
  touchesIY4AFlags: instructions.some((i) => /\(IY\+\$4A\)/.test(i.text)),
  callsRendererDispatch: instructions.some((i) => /CALL \$0A22DA/.test(i.text)),
  callsPossibleScroll: instructions.some((i) => /CALL \$05AD/.test(i.text)),
};

console.log(`Probe: decode special character handler at ${hex(START, 6)} (token 0xD6)`);
console.log(`ROM: ${ROM_PATH}`);
console.log('');
console.log('Disassembly:');
for (const inst of instructions) {
  const line = `${hex(inst.address, 6)}  ${inst.bytes.padEnd(17)}  ${inst.text.padEnd(24)}`;
  console.log(inst.comment ? `${line} ; ${inst.comment}` : line);
}

console.log('');
console.log('Structured summary:');
console.log(JSON.stringify({
  target: hex(START, 6),
  bytesDecoded: pc - START,
  instructionCount: instructions.length,
  findings: touches,
  interpretation: [
    touches.resetsColumnCounter || touches.resetsCurrentColumn
      ? 'The handler resets at least one tracked column field, matching newline/special-token behavior.'
      : 'No direct write to the known column fields was decoded in this local body.',
    touches.touchesYCoordinate
      ? 'The handler directly touches the primary Y coordinate, so it likely advances or normalizes the row.'
      : 'No direct D008D5 Y-coordinate access was decoded; row advance may be delegated to a callee or line-wrap handler.',
    touches.callsPossibleScroll
      ? 'The handler calls a routine in the 0x05ADxx range, a candidate scroll/display service.'
      : 'No direct 0x05ADxx scroll/display call was decoded in this local body.',
    touches.callsRendererDispatch
      ? 'The handler invokes the renderer dispatch at 0x0A22DA.'
      : 'No direct renderer-dispatch call was decoded in this local body.',
    touches.touchesIY4AFlags
      ? 'The handler reads or mutates IY+0x4A text-output guard/status flags.'
      : 'No direct IY+0x4A flag access was decoded in this local body.',
  ],
}, null, 2));
