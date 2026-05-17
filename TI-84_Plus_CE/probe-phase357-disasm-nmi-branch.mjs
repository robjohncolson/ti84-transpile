#!/usr/bin/env node

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TEMP_SP_ADDR = 0xD0053F;
const STACK_LOW_BOUND = 0xD1987E;
const STACK_HIGH_BOUND = 0xD1A87E;

const REGIONS = [
  {
    title: 'Region A: 0x001B44..0x001B6B (branch block)',
    start: 0x001B44,
    end: 0x001B6B,
    analysis: [
      'This block does read port 0x28 and test the readback with `bit 2, a` at 0x001B4F.',
      'If the port read returns a value with bit 2 set (`A & 0x04 != 0`, for example `0x04`), `BIT 2,A` clears Z. If bit 2 is clear (`A & 0x04 == 0`, for example `0x00`), `BIT 2,A` sets Z.',
      'However, there is no immediate conditional branch on that BIT result in this block. `or a` at 0x001B65 overwrites the BIT flags before the first control transfer.',
      'The actual alternate edge out of this block is `jr c, 0x001B72` at 0x001B69. That branch is taken when the saved SP shadow (reloaded from 0xD0053F) is below 0xD1987E after `sbc hl, bc`.',
      'Falling through to 0x001B6B means the low-bound check passed; the upper-bound half of the same stack-window guard lives in the next region.',
    ],
  },
  {
    title: 'Region B: 0x001B6B..0x001B80 (fallthrough target)',
    start: 0x001B6B,
    end: 0x001B80,
    analysis: [
      'This is the upper-bound half of the same saved-SP range check.',
      'When the low-bound test passed, the code computes `0xD1A87E - savedSP` with `sbc hl, de`.',
      'The `ccf` at 0x001B72 flips carry so `jp nc, 0x000066` at 0x001B74 fires whenever the saved SP is outside the inclusive window `0xD1987E..0xD1A87E`.',
      'If the jump is not taken, the wrapper restores registers and calls 0x000DED.',
    ],
  },
  {
    title: 'Region C: 0x000DED..0x000E10 (RETN / RETI audit)',
    start: 0x000DED,
    end: 0x000E10,
    analysis: [
      'There is no `ED 45` (`retn`) and no `ED 4D` (`reti`) anywhere in this window.',
      'The decisive control transfer is `jp z, 0x0019B5` at 0x000DF2, immediately after `bit 3, a` on the `in0 a, (0x28)` result.',
      'So if port 0x28 bit 3 is clear (`A & 0x08 == 0`), this code jumps straight back to 0x0019B5.',
      'If bit 3 is set, the routine continues with `call 0x001EEB`, then uses plain `ret c` and `ret` instead of an interrupt-return opcode.',
      'The bytes starting at 0x000E01 are the beginning of the next routine; they are included only because the requested audit window extends past the final `ret`.',
    ],
  },
  {
    title: 'Region D: 0x0019B5..0x0019E9 (HALT region + post-HALT dispatch)',
    start: 0x0019B5,
    end: 0x0019E9,
    analysis: [
      'The entry sequence is `di ; ld a, 0x10 ; out0 (0x00), a ; nop ; nop ; halt`.',
      'The byte `0x40` at 0x0019BE is the eZ80 `sis` mode prefix, so `40 01 15 50` decodes as `sis ld bc, 0x5015`. It is not `ld b, b` followed by a malformed 24-bit immediate.',
      'The first post-HALT decision is `in a, (c)` at 0x0019C2 plus `jr z, 0x0019EF` at 0x0019C4. Zero means port 0x5015 returned 0x00; nonzero falls into the byte-1 dispatcher.',
      'The dispatcher rotates status bits through carry and branches to 0x001A4B / 0x001A77 / 0x001A8D / 0x001ABB. Later in this slice it loads `a = 0xFF` and acknowledges through `out (c), a` after changing C to 0x09.',
      'The `cp 0x50` plus `rst 0x08` sequence is a sanity-check path: if B is no longer 0x50, execution traps immediately.',
    ],
  },
];

const PREFIX_NAMES = new Map([
  [0x40, 'sis'],
  [0x49, 'lis'],
  [0x52, 'sil'],
  [0x5B, 'lil'],
]);

const REG8 = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
const REG16 = ['bc', 'de', 'hl', 'sp'];

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatAddr(value, widthBytes = 3) {
  return hex(value, widthBytes === 2 ? 4 : 6);
}

function formatImm(value, widthBytes) {
  if (widthBytes === 1) return hex(value, 2);
  return hex(value, widthBytes === 2 ? 4 : 6);
}

function readImm(offset, widthBytes) {
  let value = 0;
  for (let i = 0; i < widthBytes; i += 1) {
    value |= (rom[offset + i] ?? 0) << (i * 8);
  }
  return value >>> 0;
}

function signedByte(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function byteString(start, length) {
  return Array.from(rom.subarray(start, start + length), hexByte).join(' ');
}

function withPrefix(prefix, mnemonic) {
  return prefix ? `${prefix} ${mnemonic}` : mnemonic;
}

function decodeAt(startPc) {
  let pc = startPc;
  let prefix = null;
  const first = rom[pc] ?? 0;
  if (PREFIX_NAMES.has(first)) {
    prefix = PREFIX_NAMES.get(first);
    pc += 1;
  }
  const prefixLen = pc - startPc;
  const immWidth = prefix === 'sis' || prefix === 'lis' ? 2 : 3;
  const op = rom[pc] ?? 0;

  const emit = (bodyLength, mnemonic) => {
    const length = prefixLen + bodyLength;
    return {
      addr: startPc,
      length,
      bytes: byteString(startPc, length),
      mnemonic,
    };
  };

  if (op === 0xCB) {
    const cb = rom[pc + 1] ?? 0;
    if ((cb & 0xC0) === 0x40) {
      const bit = (cb >> 3) & 0x07;
      const reg = REG8[cb & 0x07];
      return emit(2, withPrefix(prefix, `bit ${bit}, ${reg}`));
    }
    return emit(2, withPrefix(prefix, `db ${hex(op, 2)}, ${hex(cb, 2)}`));
  }

  if (op === 0xED) {
    const ed = rom[pc + 1] ?? 0;
    const operand8 = rom[pc + 2] ?? 0;

    if (ed === 0x38) return emit(3, withPrefix(prefix, `in0 a, (${hex(operand8, 2)})`));
    if (ed === 0x39) return emit(3, withPrefix(prefix, `out0 (${hex(operand8, 2)}), a`));
    if ((ed & 0xC7) === 0x40) {
      const reg = REG8[(ed >> 3) & 0x07];
      return emit(2, withPrefix(prefix, `in ${reg}, (c)`));
    }
    if ((ed & 0xC7) === 0x41) {
      const reg = REG8[(ed >> 3) & 0x07];
      return emit(2, withPrefix(prefix, `out (c), ${reg}`));
    }
    if ((ed & 0xCF) === 0x42) {
      const pair = REG16[(ed >> 4) & 0x03];
      return emit(2, withPrefix(prefix, `sbc hl, ${pair}`));
    }
    if ((ed & 0xCF) === 0x43) {
      const pair = REG16[(ed >> 4) & 0x03];
      const addr = readImm(pc + 2, immWidth);
      return emit(2 + immWidth, withPrefix(prefix, `ld (${formatAddr(addr, immWidth)}), ${pair}`));
    }
    if ((ed & 0xCF) === 0x4B) {
      const pair = REG16[(ed >> 4) & 0x03];
      const addr = readImm(pc + 2, immWidth);
      return emit(2 + immWidth, withPrefix(prefix, `ld ${pair}, (${formatAddr(addr, immWidth)})`));
    }
    if (ed === 0x45) return emit(2, withPrefix(prefix, 'retn'));
    if (ed === 0x4D) return emit(2, withPrefix(prefix, 'reti'));
    if (ed === 0x56) return emit(2, withPrefix(prefix, 'im 1'));
    if (ed === 0x7D) return emit(2, withPrefix(prefix, 'ld mb, a'));
    if (ed === 0x7E) return emit(2, withPrefix(prefix, 'ld a, mb'));
    return emit(2, withPrefix(prefix, `db ${hex(op, 2)}, ${hex(ed, 2)}`));
  }

  switch (op) {
    case 0x00:
      return emit(1, withPrefix(prefix, 'nop'));
    case 0x01: {
      const value = readImm(pc + 1, immWidth);
      return emit(1 + immWidth, withPrefix(prefix, `ld bc, ${formatImm(value, immWidth)}`));
    }
    case 0x03:
      return emit(1, withPrefix(prefix, 'inc bc'));
    case 0x06:
      return emit(2, withPrefix(prefix, `ld b, ${hex(rom[pc + 1] ?? 0, 2)}`));
    case 0x0D:
      return emit(1, withPrefix(prefix, 'dec c'));
    case 0x0E:
      return emit(2, withPrefix(prefix, `ld c, ${hex(rom[pc + 1] ?? 0, 2)}`));
    case 0x11: {
      const value = readImm(pc + 1, immWidth);
      return emit(1 + immWidth, withPrefix(prefix, `ld de, ${formatImm(value, immWidth)}`));
    }
    case 0x17:
      return emit(1, withPrefix(prefix, 'rla'));
    case 0x1F:
      return emit(1, withPrefix(prefix, 'rra'));
    case 0x20: {
      const disp = signedByte(rom[pc + 1] ?? 0);
      const target = startPc + prefixLen + 2 + disp;
      return emit(2, withPrefix(prefix, `jr nz, ${formatAddr(target)}`));
    }
    case 0x28: {
      const disp = signedByte(rom[pc + 1] ?? 0);
      const target = startPc + prefixLen + 2 + disp;
      return emit(2, withPrefix(prefix, `jr z, ${formatAddr(target)}`));
    }
    case 0x2A: {
      const addr = readImm(pc + 1, immWidth);
      return emit(1 + immWidth, withPrefix(prefix, `ld hl, (${formatAddr(addr, immWidth)})`));
    }
    case 0x38: {
      const disp = signedByte(rom[pc + 1] ?? 0);
      const target = startPc + prefixLen + 2 + disp;
      return emit(2, withPrefix(prefix, `jr c, ${formatAddr(target)}`));
    }
    case 0x3E:
      return emit(2, withPrefix(prefix, `ld a, ${hex(rom[pc + 1] ?? 0, 2)}`));
    case 0x3F:
      return emit(1, withPrefix(prefix, 'ccf'));
    case 0x76:
      return emit(1, withPrefix(prefix, 'halt'));
    case 0xB7:
      return emit(1, withPrefix(prefix, 'or a'));
    case 0xC1:
      return emit(1, withPrefix(prefix, 'pop bc'));
    case 0xC3: {
      const target = readImm(pc + 1, immWidth);
      return emit(1 + immWidth, withPrefix(prefix, `jp ${formatAddr(target, immWidth)}`));
    }
    case 0xC5:
      return emit(1, withPrefix(prefix, 'push bc'));
    case 0xC9:
      return emit(1, withPrefix(prefix, 'ret'));
    case 0xCA: {
      const target = readImm(pc + 1, immWidth);
      return emit(1 + immWidth, withPrefix(prefix, `jp z, ${formatAddr(target, immWidth)}`));
    }
    case 0xCD: {
      const target = readImm(pc + 1, immWidth);
      return emit(1 + immWidth, withPrefix(prefix, `call ${formatAddr(target, immWidth)}`));
    }
    case 0xCF:
      return emit(1, withPrefix(prefix, 'rst 0x08'));
    case 0xD1:
      return emit(1, withPrefix(prefix, 'pop de'));
    case 0xD2: {
      const target = readImm(pc + 1, immWidth);
      return emit(1 + immWidth, withPrefix(prefix, `jp nc, ${formatAddr(target, immWidth)}`));
    }
    case 0xD5:
      return emit(1, withPrefix(prefix, 'push de'));
    case 0xD8:
      return emit(1, withPrefix(prefix, 'ret c'));
    case 0xDA: {
      const target = readImm(pc + 1, immWidth);
      return emit(1 + immWidth, withPrefix(prefix, `jp c, ${formatAddr(target, immWidth)}`));
    }
    case 0xE1:
      return emit(1, withPrefix(prefix, 'pop hl'));
    case 0xE5:
      return emit(1, withPrefix(prefix, 'push hl'));
    case 0xEB:
      return emit(1, withPrefix(prefix, 'ex de, hl'));
    case 0xF1:
      return emit(1, withPrefix(prefix, 'pop af'));
    case 0xF3:
      return emit(1, withPrefix(prefix, 'di'));
    case 0xF5:
      return emit(1, withPrefix(prefix, 'push af'));
    case 0xFE:
      return emit(2, withPrefix(prefix, `cp ${hex(rom[pc + 1] ?? 0, 2)}`));
    default:
      break;
  }

  if (op >= 0x40 && op <= 0x7F) {
    const dest = REG8[(op >> 3) & 0x07];
    const src = REG8[op & 0x07];
    return emit(1, withPrefix(prefix, `ld ${dest}, ${src}`));
  }

  return emit(1, withPrefix(prefix, `db ${hex(op, 2)}`));
}

function decodeRange(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    const row = decodeAt(pc);
    rows.push(row);
    pc += row.length;
  }
  return rows;
}

function printHexDump(start, end) {
  for (let addr = start; addr < end; addr += 16) {
    const sliceEnd = Math.min(end, addr + 16);
    const bytes = Array.from(rom.subarray(addr, sliceEnd), hexByte).join(' ');
    console.log(`${formatAddr(addr)}: ${bytes}`);
  }
}

function printDisassembly(rows) {
  for (const row of rows) {
    console.log(`${formatAddr(row.addr)}: ${row.bytes.padEnd(18, ' ')} ${row.mnemonic}`);
  }
}

function printAnalysis(lines) {
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

function printRegion(region) {
  const rows = decodeRange(region.start, region.end);
  console.log(region.title);
  console.log(`Range: ${formatAddr(region.start)}..${formatAddr(region.end)}`);
  console.log('');
  console.log('Raw hex bytes');
  printHexDump(region.start, region.end);
  console.log('');
  console.log('ADL disassembly');
  printDisassembly(rows);
  console.log('');
  console.log('Analysis');
  printAnalysis(region.analysis);
  console.log('');
}

function printConclusions() {
  console.log('Overall conclusions');
  console.log(`- Port 0x28 is tested by \`bit 2, a\` at 0x001B4F. A readback like 0x04 keeps bit 2 set; a readback like 0x00 clears bit 2.`);
  console.log(`- That BIT is not the branch that chooses between 0x001B6B and the alternate edge. The BIT flags are overwritten before control branches.`);
  console.log(`- The real alternate edge is the stack-window guard around the shadowed SP stored at ${formatAddr(TEMP_SP_ADDR)}; it rejects values outside ${formatAddr(STACK_LOW_BOUND)}..${formatAddr(STACK_HIGH_BOUND)}.`);
  console.log('- The 0x000DED window contains no RETN and no RETI. The only direct transfer back to 0x0019B5 there is `jp z, 0x0019B5` after `bit 3, a` on port 0x28.');
}

console.log('Phase 357: NMI branch / RETN audit');
console.log(`ROM size: ${rom.length} bytes`);
console.log('');

for (const region of REGIONS) {
  printRegion(region);
}

printConclusions();
