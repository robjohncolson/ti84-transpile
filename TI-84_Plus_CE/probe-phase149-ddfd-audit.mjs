import { readFileSync } from 'fs';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const CODE_REGION_END = 0x0c0000;

function hex(value, width = 2) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function buildExplicitHandledSet() {
  const handled = new Set([
    0x21,
    0x22,
    0x23,
    0x24,
    0x25,
    0x26,
    0x29,
    0x2a,
    0x2b,
    0x2c,
    0x2d,
    0x2e,
    0x34,
    0x35,
    0x36,
    0xcb,
    0xdd,
    0xe1,
    0xe3,
    0xe5,
    0xe9,
    0xed,
    0xf9,
    0xfd,
  ]);

  for (const op of [0x09, 0x19, 0x29, 0x39]) {
    handled.add(op);
  }

  for (let op = 0x40; op < 0x80; op++) {
    if (op === 0x76) {
      continue;
    }

    const dstIdx = (op >> 3) & 7;
    const srcIdx = op & 7;
    if (dstIdx !== 6 && srcIdx !== 6) {
      handled.add(op);
    }
  }

  for (const op of [0x46, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x7e]) {
    handled.add(op);
  }

  for (const op of [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77]) {
    handled.add(op);
  }

  for (let op = 0x80; op < 0xc0; op++) {
    handled.add(op);
  }

  return handled;
}

const handled = buildExplicitHandledSet();
const manualMissingSecondOpcodes = new Set([0x07, 0x0f, 0x17, 0x1f, 0x27, 0x2f, 0x31, 0x37, 0x3e, 0x3f]);

const manualConfirmedMissingPatterns = [
  { bytes: [0xdd, 0x07], name: 'LD BC,(IX+d)', fallback: 'RLCA' },
  { bytes: [0xfd, 0x07], name: 'LD BC,(IY+d)', fallback: 'RLCA' },
  { bytes: [0xdd, 0x0f], name: 'LD (IX+d),BC', fallback: 'RRCA' },
  { bytes: [0xfd, 0x0f], name: 'LD (IY+d),BC', fallback: 'RRCA' },
  { bytes: [0xdd, 0x17], name: 'LD DE,(IX+d)', fallback: 'RLA' },
  { bytes: [0xfd, 0x17], name: 'LD DE,(IY+d)', fallback: 'RLA' },
  { bytes: [0xdd, 0x1f], name: 'LD (IX+d),DE', fallback: 'RRA' },
  { bytes: [0xfd, 0x1f], name: 'LD (IY+d),DE', fallback: 'RRA' },
  { bytes: [0xdd, 0x27], name: 'LD HL,(IX+d)', fallback: 'DAA' },
  { bytes: [0xfd, 0x27], name: 'LD HL,(IY+d)', fallback: 'DAA' },
  { bytes: [0xdd, 0x2f], name: 'LD (IX+d),HL', fallback: 'CPL' },
  { bytes: [0xfd, 0x2f], name: 'LD (IY+d),HL', fallback: 'CPL' },
  { bytes: [0xdd, 0x31], name: 'LD IY,(IX+d)', fallback: 'LD SP,Mmn' },
  { bytes: [0xfd, 0x31], name: 'LD IX,(IY+d)', fallback: 'LD SP,Mmn' },
  { bytes: [0xdd, 0x37], name: 'LD IX,(IX+d)', fallback: 'SCF' },
  { bytes: [0xfd, 0x37], name: 'LD IY,(IY+d)', fallback: 'SCF' },
  { bytes: [0xdd, 0x3e], name: 'LD (IX+d),IY', fallback: 'LD A,n' },
  { bytes: [0xfd, 0x3e], name: 'LD (IY+d),IX', fallback: 'LD A,n' },
  { bytes: [0xdd, 0x3f], name: 'LD (IX+d),IX', fallback: 'CCF' },
  { bytes: [0xfd, 0x3f], name: 'LD (IY+d),IY', fallback: 'CCF' },
];

const promptSuspectPatterns = [
  { bytes: [0xdd, 0x01], name: 'DD 01', manualStatus: 'Not a DD/FD-only eZ80 opcode; this is the prefixed form of LD BC,Mmn.' },
  { bytes: [0xdd, 0x02], name: 'DD 02', manualStatus: 'LEA is ED-prefixed in UM0077, not DD/FD-prefixed.' },
  { bytes: [0xdd, 0x07], name: 'DD 07', manualStatus: 'Real DD/FD indexed pair load; missing from decodeDDFD().' },
  { bytes: [0xdd, 0x11], name: 'DD 11', manualStatus: 'Not a DD/FD-only eZ80 opcode; this is the prefixed form of LD DE,Mmn.' },
  { bytes: [0xdd, 0x12], name: 'DD 12', manualStatus: 'LEA is ED-prefixed in UM0077, not DD/FD-prefixed.' },
  { bytes: [0xdd, 0x17], name: 'DD 17', manualStatus: 'Real DD/FD indexed pair load; missing from decodeDDFD().' },
  { bytes: [0xdd, 0x22], name: 'DD 22', manualStatus: 'Classic LD (Mmn),IX; already handled explicitly by decodeDDFD().' },
  { bytes: [0xdd, 0x27], name: 'DD 27', manualStatus: 'Real DD/FD indexed pair load; missing from decodeDDFD().' },
  { bytes: [0xdd, 0x31], name: 'DD 31', manualStatus: 'Real DD/FD indexed index-register load; missing from decodeDDFD().' },
  { bytes: [0xdd, 0x32], name: 'DD 32', manualStatus: 'LEA is ED-prefixed in UM0077, not DD/FD-prefixed.' },
  { bytes: [0xdd, 0x37], name: 'DD 37', manualStatus: 'Real DD/FD indexed index-register load; missing from decodeDDFD().' },
  { bytes: [0xfd, 0x01], name: 'FD 01', manualStatus: 'Not a DD/FD-only eZ80 opcode; this is the prefixed form of LD BC,Mmn.' },
  { bytes: [0xfd, 0x02], name: 'FD 02', manualStatus: 'LEA is ED-prefixed in UM0077, not DD/FD-prefixed.' },
  { bytes: [0xfd, 0x07], name: 'FD 07', manualStatus: 'Real DD/FD indexed pair load; missing from decodeDDFD().' },
  { bytes: [0xfd, 0x11], name: 'FD 11', manualStatus: 'Not a DD/FD-only eZ80 opcode; this is the prefixed form of LD DE,Mmn.' },
  { bytes: [0xfd, 0x12], name: 'FD 12', manualStatus: 'LEA is ED-prefixed in UM0077, not DD/FD-prefixed.' },
  { bytes: [0xfd, 0x17], name: 'FD 17', manualStatus: 'Real DD/FD indexed pair load; missing from decodeDDFD().' },
  { bytes: [0xfd, 0x22], name: 'FD 22', manualStatus: 'Classic LD (Mmn),IY; already handled explicitly by decodeDDFD().' },
  { bytes: [0xfd, 0x27], name: 'FD 27', manualStatus: 'Real DD/FD indexed pair load; missing from decodeDDFD().' },
  { bytes: [0xfd, 0x31], name: 'FD 31', manualStatus: 'Real DD/FD indexed index-register load; missing from decodeDDFD().' },
  { bytes: [0xfd, 0x32], name: 'FD 32', manualStatus: 'LEA is ED-prefixed in UM0077, not DD/FD-prefixed.' },
  { bytes: [0xfd, 0x37], name: 'FD 37', manualStatus: 'Real DD/FD indexed index-register load; missing from decodeDDFD().' },
];

function scanPattern(rom, bytes) {
  let count = 0;
  let codeCount = 0;
  const first = [];

  for (let i = 0; i < rom.length - bytes.length + 1; i++) {
    let match = true;
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) {
        match = false;
        break;
      }
    }

    if (!match) {
      continue;
    }

    count += 1;
    if (i < CODE_REGION_END) {
      codeCount += 1;
    }
    if (first.length < 8) {
      first.push(hex(i, 6));
    }
  }

  return { count, codeCount, first };
}

function buildOpcodeMatrix(handledSet, missingSet) {
  const lines = [];
  lines.push('| hi\\\\lo | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');

  for (let hi = 0; hi < 16; hi++) {
    const row = [`0x${hi.toString(16).toUpperCase()}x`];
    for (let lo = 0; lo < 16; lo++) {
      const op = (hi << 4) | lo;
      if (handledSet.has(op)) {
        row.push('H');
      } else if (missingSet.has(op)) {
        row.push('U*');
      } else {
        row.push('U');
      }
    }
    lines.push(`| ${row.join(' | ')} |`);
  }

  return lines.join('\n');
}

function printScanTable(title, patterns, rom) {
  console.log(title);
  console.log('| Pattern | Meaning | Raw hits | Hits in 0x000000-0x0BFFFF | First hits |');
  console.log('|---|---|---:|---:|---|');

  for (const pattern of patterns) {
    const result = scanPattern(rom, pattern.bytes);
    const opcodeText = pattern.bytes.map((byte) => hex(byte)).join(' ');
    const first = result.first.length ? result.first.join(', ') : '-';
    console.log(`| \`${opcodeText}\` | ${pattern.name} | ${result.count} | ${result.codeCount} | ${first} |`);
  }

  console.log();
}

const rom = readFileSync(ROM_PATH);

console.log('# Phase 149 DD/FD audit probe');
console.log();
console.log(`Explicitly handled second opcodes in decodeDDFD(): ${handled.size}/256`);
console.log();
console.log('Legend: H = explicit handler, U = falls through, U* = manual-confirmed eZ80 DD/FD opcode that currently falls through.');
console.log();
console.log(buildOpcodeMatrix(handled, manualMissingSecondOpcodes));
console.log();

console.log('## Handled groups');
console.log('- Fixed singles: 0x09, 0x19, 0x21-0x26, 0x29-0x2E, 0x34-0x36, 0x39, 0xCB, 0xDD, 0xE1, 0xE3, 0xE5, 0xE9, 0xED, 0xF9, 0xFD');
console.log('- All of 0x40-0x75 and 0x77-0xBF are handled explicitly.');
console.log();

printScanTable('## Manual-confirmed missing eZ80 DD/FD instructions', manualConfirmedMissingPatterns, rom);

console.log('## Prompt-listed suspects after manual cross-check');
console.log('| Pattern | Raw hits | Manual status |');
console.log('|---|---:|---|');
for (const pattern of promptSuspectPatterns) {
  const result = scanPattern(rom, pattern.bytes);
  const opcodeText = pattern.bytes.map((byte) => hex(byte)).join(' ');
  console.log(`| \`${opcodeText}\` (${pattern.name}) | ${result.count} | ${pattern.manualStatus} |`);
}
