#!/usr/bin/env node

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const COMPARE_ADDR = 0x04c979;
const TRACE_BYTES = 0x40;
const DISPATCH_COMPARE_CHAIN_START = 0x030312;
const DISPATCH_COMPARE_CHAIN_END = 0x03032c;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function read16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function decodeAt(addr) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];

  if (b0 === 0x52 && b1 === 0xED && b2 === 0x52) {
    return {
      addr,
      length: 3,
      bytes: bytesAt(addr, 3),
      text: 'sil sbc hl, de',
      kind: 'sbc',
      rhs: 'de',
      prefix: 'sil',
    };
  }

  if (b0 === 0xED && b1 === 0x52) {
    return {
      addr,
      length: 2,
      bytes: bytesAt(addr, 2),
      text: 'sbc hl, de',
      kind: 'sbc',
      rhs: 'de',
    };
  }

  if (b0 === 0xED && b1 === 0x42) {
    return {
      addr,
      length: 2,
      bytes: bytesAt(addr, 2),
      text: 'sbc hl, bc',
      kind: 'sbc',
      rhs: 'bc',
    };
  }

  if (b0 === 0xCB && b1 === 0x3F) {
    return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'srl a', kind: 'shift' };
  }

  if (b0 === 0xCB && b1 === 0x1C) {
    return { addr, length: 2, bytes: bytesAt(addr, 2), text: 'rr h', kind: 'rotate' };
  }

  if (b0 === 0x40 && b1 === 0x2A) {
    const target = read16(addr + 2);
    return {
      addr,
      length: 4,
      bytes: bytesAt(addr, 4),
      text: `short ld hl, (${hex(target, 4)})`,
      kind: 'load',
      target,
    };
  }

  if (b0 === 0x22) {
    const target = read24(addr + 1);
    return {
      addr,
      length: 4,
      bytes: bytesAt(addr, 4),
      text: `ld (${hex(target)}), hl`,
      kind: 'load',
      target,
    };
  }

  if (b0 === 0x3A) {
    const target = read24(addr + 1);
    return {
      addr,
      length: 4,
      bytes: bytesAt(addr, 4),
      text: `ld a, (${hex(target)})`,
      kind: 'load',
      target,
    };
  }

  if (b0 === 0x32) {
    const target = read24(addr + 1);
    return {
      addr,
      length: 4,
      bytes: bytesAt(addr, 4),
      text: `ld (${hex(target)}), a`,
      kind: 'load',
      target,
    };
  }

  if (b0 === 0x21) {
    const value = read24(addr + 1);
    return {
      addr,
      length: 4,
      bytes: bytesAt(addr, 4),
      text: `ld hl, ${hex(value)}`,
      kind: 'load',
      value,
    };
  }

  if (b0 === 0x11) {
    const value = read24(addr + 1);
    return {
      addr,
      length: 4,
      bytes: bytesAt(addr, 4),
      text: `ld de, ${hex(value)}`,
      kind: 'load',
      value,
    };
  }

  if (b0 === 0xCD) {
    const target = read24(addr + 1);
    return {
      addr,
      length: 4,
      bytes: bytesAt(addr, 4),
      text: `call ${hex(target)}`,
      kind: 'call',
      target,
    };
  }

  if (b0 === 0xC3) {
    const target = read24(addr + 1);
    return {
      addr,
      length: 4,
      bytes: bytesAt(addr, 4),
      text: `jp ${hex(target)}`,
      kind: 'jp',
      target,
    };
  }

  if (b0 === 0xCA) {
    const target = read24(addr + 1);
    return {
      addr,
      length: 4,
      bytes: bytesAt(addr, 4),
      text: `jp z, ${hex(target)}`,
      kind: 'jp-conditional',
      condition: 'z',
      target,
    };
  }

  if (b0 === 0x28) {
    const target = (addr + 2 + signed8(b1)) & 0xffffff;
    return {
      addr,
      length: 2,
      bytes: bytesAt(addr, 2),
      text: `jr z, ${hex(target)}`,
      kind: 'jr-conditional',
      condition: 'z',
      target,
    };
  }

  if (b0 === 0x38) {
    const target = (addr + 2 + signed8(b1)) & 0xffffff;
    return {
      addr,
      length: 2,
      bytes: bytesAt(addr, 2),
      text: `jr c, ${hex(target)}`,
      kind: 'jr-conditional',
      condition: 'c',
      target,
    };
  }

  if (b0 === 0x18) {
    const target = (addr + 2 + signed8(b1)) & 0xffffff;
    return {
      addr,
      length: 2,
      bytes: bytesAt(addr, 2),
      text: `jr ${hex(target)}`,
      kind: 'jr',
      target,
    };
  }

  if (b0 === 0xE5) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'push hl', kind: 'push' };
  if (b0 === 0xE1) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'pop hl', kind: 'pop' };
  if (b0 === 0xD5) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'push de', kind: 'push' };
  if (b0 === 0xD1) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'pop de', kind: 'pop' };
  if (b0 === 0xF5) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'push af', kind: 'push' };
  if (b0 === 0xC1) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'pop bc', kind: 'pop' };
  if (b0 === 0xB7) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'or a', kind: 'or-a' };
  if (b0 === 0xAF) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'xor a', kind: 'xor-a' };
  if (b0 === 0xEB) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ex de, hl', kind: 'exchange' };
  if (b0 === 0x3F) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ccf', kind: 'flag' };
  if (b0 === 0x1B) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'dec de', kind: 'dec' };
  if (b0 === 0x23) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'inc hl', kind: 'inc' };
  if (b0 === 0x47) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ld b, a', kind: 'load' };
  if (b0 === 0x78) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ld a, b', kind: 'load' };
  if (b0 === 0xC9) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret', kind: 'ret' };
  if (b0 === 0xC8) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret z', kind: 'ret-conditional', condition: 'z' };
  if (b0 === 0xC0) return { addr, length: 1, bytes: bytesAt(addr, 1), text: 'ret nz', kind: 'ret-conditional', condition: 'nz' };

  return {
    addr,
    length: 1,
    bytes: bytesAt(addr, 1),
    text: `db ${hex(b0, 2)}`,
    kind: 'db',
  };
}

function disassembleRange(start, endExclusive) {
  const lines = [];
  let pc = start;

  while (pc < endExclusive) {
    const line = decodeAt(pc);
    lines.push(line);
    pc += line.length;
  }

  return lines;
}

function disassembleUntilRet(start, maxBytes) {
  const lines = [];
  let pc = start;
  const endExclusive = start + maxBytes;

  while (pc < endExclusive) {
    const line = decodeAt(pc);
    lines.push(line);
    pc += line.length;
    if (line.kind === 'ret') break;
  }

  return lines;
}

function printSection(title) {
  console.log('');
  console.log('='.repeat(88));
  console.log(title);
  console.log('='.repeat(88));
}

function printLines(lines) {
  for (const line of lines) {
    console.log(`${hex(line.addr)}  ${line.bytes.padEnd(14)}  ${line.text}`);
  }
}

function collectBranchTargets(lines) {
  return lines
    .filter((line) => line.kind && line.kind.startsWith('j') || line.kind === 'call')
    .map((line) => `${hex(line.addr)} -> ${line.text}`);
}

function summarizeCompare(functionLines, traceLines, callerLines) {
  const hasCp = traceLines.some((line) => line.bytes.startsWith('FE '));
  const compareLine = functionLines.find((line) => line.kind === 'sbc');
  const orALine = functionLines.find((line) => line.kind === 'or-a');
  const retLine = functionLines.find((line) => line.kind === 'ret');

  const matchDetections = [];
  for (let index = 0; index < callerLines.length; index += 1) {
    const line = callerLines[index];
    if (line.kind !== 'call' || line.target !== COMPARE_ADDR) continue;
    const next = callerLines[index + 1];
    if (next && (next.condition === 'z')) {
      matchDetections.push(`${hex(line.addr)} call -> ${hex(next.addr)} ${next.text}`);
    }
  }

  console.log(`CP opcodes in ${hex(COMPARE_ADDR)}..${hex(COMPARE_ADDR + TRACE_BYTES - 1)}: ${hasCp ? 'found' : 'none'}`);
  console.log(
    `Primary compare sequence: ${hex(functionLines[0].addr)} ${functionLines[0].text} ; ` +
      `${hex(orALine.addr)} ${orALine.text} ; ${hex(compareLine.addr)} ${compareLine.text} ; ` +
      `${hex(retLine.addr)} ${retLine.text}`,
  );
  console.log('How it compares:');
  console.log('  - `or a` is used as a flag setup step before subtraction; it leaves A unchanged and clears carry for the upcoming borrow-based compare.');
  console.log('  - The actual comparison is `sbc hl, de` (prefixed here as `sil sbc hl, de`), not a `cp` instruction.');
  console.log('  - `push hl` / `pop hl` preserve HL, so the subtraction is only for flags.');
  console.log('What returns:');
  console.log('  - No value is returned in A/HL/DE.');
  console.log('  - The useful result is in F: `Z=1` means HL matched DE, `C=1` means the subtraction borrowed, and the rest of the subtraction flags also come back unchanged through `ret`.');
  console.log('How the caller detects a match:');
  for (const detection of matchDetections) {
    console.log(`  - ${detection}`);
  }
}

function main() {
  const functionLines = disassembleUntilRet(COMPARE_ADDR, TRACE_BYTES);
  const traceLines = disassembleRange(COMPARE_ADDR, COMPARE_ADDR + TRACE_BYTES);
  const callerLines = disassembleRange(DISPATCH_COMPARE_CHAIN_START, DISPATCH_COMPARE_CHAIN_END);

  printSection('0x04C979 function body');
  printLines(functionLines);

  printSection(`64-byte trace window from ${hex(COMPARE_ADDR)}`);
  printLines(traceLines);

  printSection('Dispatcher compare chain at 0x030312');
  printLines(callerLines);

  printSection('Analysis');
  summarizeCompare(functionLines, traceLines, callerLines);

  const compareTargets = collectBranchTargets(traceLines);
  const callerTargets = collectBranchTargets(callerLines);

  printSection('CALL / JP / JR targets found');
  if (compareTargets.length === 0 && callerTargets.length === 0) {
    console.log('No CALL/JP/JR targets found in the analyzed windows.');
    return;
  }

  console.log('Within the 64-byte compare window:');
  if (compareTargets.length === 0) {
    console.log('  - none');
  } else {
    for (const target of compareTargets) {
      console.log(`  - ${target}`);
    }
  }

  console.log('Within the dispatcher compare chain:');
  if (callerTargets.length === 0) {
    console.log('  - none');
  } else {
    for (const target of callerTargets) {
      console.log(`  - ${target}`);
    }
  }
}

main();
