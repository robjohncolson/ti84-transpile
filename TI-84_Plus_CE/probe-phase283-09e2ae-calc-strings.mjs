#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const rom = readFileSync(new URL('ROM.rom', import.meta.url));

const TARGET = 0x09E11B;
const RANGE_STATIC_START = 0x09E280;
const RANGE_STATIC_END = 0x09E2AE;
const RANGE_CONTEXT_START = 0x09E296;
const RANGE_CONTEXT_END = 0x09E2B0;

const KNOWN_LABELS = new Map([
  [0x09DF35, 'prelude before nearby string path'],
  [0x09DFD8, 'direct CALL to 0x09E11B'],
  [0x09E013, 'direct JP to 0x09E11B'],
  [0x09E106, 'shared wrapper before renderer'],
  [0x09E140, 'string table used by 0x09E296'],
  [0x09E158, 'nearby alternate string table'],
  [0x09E19D, 'warning-text table used by 0x09DFD8'],
  [0x09E2AE, 'STAT CALC path JP to 0x09E11B'],
  [0x09EDC3, 'shared STAT UI init'],
  [0x02398E, 'conditional helper called from 0x09E29C/0x09E107'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function bytesHex(addr, len) {
  return Array.from(rom.slice(addr, addr + len), hexByte).join(' ');
}

function read24LE(addr) {
  return (rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16)) >>> 0;
}

function signed8(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function formatDisp(raw) {
  const value = signed8(raw);
  if (value === 0) return '+0x00';
  return value > 0
    ? `+0x${value.toString(16).toUpperCase().padStart(2, '0')}`
    : `-0x${(-value).toString(16).toUpperCase().padStart(2, '0')}`;
}

function relativeTarget(pc, displacement) {
  return (pc + 2 + signed8(displacement)) >>> 0;
}

function label(addr) {
  return KNOWN_LABELS.has(addr) ? ` [${KNOWN_LABELS.get(addr)}]` : '';
}

function decodeIndexedCb(addr, prefix) {
  const disp = rom[addr + 2];
  const opcode = rom[addr + 3];
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 7;
  const reg = prefix === 0xFD ? 'IY' : 'IX';

  if (group === 1) {
    return {
      length: 4,
      text: `BIT ${bit},(${reg}${formatDisp(disp)})`,
    };
  }

  if (group === 2) {
    return {
      length: 4,
      text: `RES ${bit},(${reg}${formatDisp(disp)})`,
    };
  }

  if (group === 3) {
    return {
      length: 4,
      text: `SET ${bit},(${reg}${formatDisp(disp)})`,
    };
  }

  const rotateOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  return {
    length: 4,
    text: `${rotateOps[bit]} (${reg}${formatDisp(disp)})`,
  };
}

function decodeInstruction(addr) {
  const opcode = rom[addr];

  if (opcode === 0xCD) {
    const target = read24LE(addr + 1);
    return { length: 4, text: `CALL ${hex(target)}${label(target)}` };
  }

  if (opcode === 0xC3) {
    const target = read24LE(addr + 1);
    return { length: 4, text: `JP ${hex(target)}${label(target)}` };
  }

  if (opcode === 0xC4) {
    const target = read24LE(addr + 1);
    return { length: 4, text: `CALL NZ,${hex(target)}${label(target)}` };
  }

  if (opcode === 0x20) {
    return { length: 2, text: `JR NZ,${hex(relativeTarget(addr, rom[addr + 1]))}` };
  }

  if (opcode === 0x28) {
    return { length: 2, text: `JR Z,${hex(relativeTarget(addr, rom[addr + 1]))}` };
  }

  if (opcode === 0x18) {
    return { length: 2, text: `JR ${hex(relativeTarget(addr, rom[addr + 1]))}` };
  }

  if (opcode === 0x21) {
    return { length: 4, text: `LD HL,${hex(read24LE(addr + 1))}` };
  }

  if (opcode === 0x11) {
    return { length: 4, text: `LD DE,${hex(read24LE(addr + 1))}` };
  }

  if (opcode === 0x3E) {
    return { length: 2, text: `LD A,${hex(rom[addr + 1], 2)}` };
  }

  if (opcode === 0x16) {
    return { length: 2, text: `LD D,${hex(rom[addr + 1], 2)}` };
  }

  if (opcode === 0x1C) {
    return { length: 1, text: 'INC E' };
  }

  if (opcode === 0x00) {
    return { length: 1, text: 'NOP' };
  }

  if (opcode === 0xED) {
    const ed = rom[addr + 1];
    if (ed === 0x5B) {
      return { length: 5, text: `LD DE,(${hex(read24LE(addr + 2))})` };
    }
    return { length: 2, text: `ED ${hex(ed, 2)}` };
  }

  if (opcode === 0xFD || opcode === 0xDD) {
    const next = rom[addr + 1];
    if (next === 0xCB) {
      return decodeIndexedCb(addr, opcode);
    }
    return { length: 2, text: `${opcode === 0xFD ? 'IY' : 'IX'} ${hex(next, 2)}` };
  }

  return { length: 1, text: `DB ${hex(opcode, 2)}` };
}

function disasm(start, end) {
  const rows = [];
  let addr = start;
  while (addr < end) {
    const decoded = decodeInstruction(addr);
    rows.push({
      addr,
      length: decoded.length,
      bytes: bytesHex(addr, decoded.length),
      text: decoded.text,
    });
    addr += decoded.length;
  }
  return rows;
}

function dumpAscii(addr, len) {
  const lines = [];
  for (let offset = 0; offset < len; offset += 16) {
    const slice = rom.slice(addr + offset, addr + offset + 16);
    const hexs = Array.from(slice, hexByte).join(' ');
    const ascii = Array.from(slice, (b) => (b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.')).join('');
    lines.push(`  ${hex(addr + offset)}: ${hexs.padEnd(47)} ${ascii}`);
  }
  return lines;
}

function readNullStrings(addr, len) {
  const out = [];
  let start = addr;
  let chars = [];
  for (let i = 0; i < len; i += 1) {
    const value = rom[addr + i];
    if (value === 0x00) {
      out.push({ addr: start, text: String.fromCharCode(...chars) });
      start = addr + i + 1;
      chars = [];
    } else {
      chars.push(value);
    }
  }
  if (chars.length > 0) {
    out.push({ addr: start, text: String.fromCharCode(...chars) });
  }
  return out;
}

function findPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let match = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(i);
  }
  return hits;
}

function findLocalHlImm(rows) {
  for (const row of rows) {
    if (row.text.startsWith('LD HL,')) {
      return Number.parseInt(row.text.slice('LD HL,'.length), 16);
    }
  }
  return null;
}

function printSection(title) {
  console.log(title);
}

function printDisasmRows(rows, indent = '  ') {
  for (const row of rows) {
    console.log(`${indent}${hex(row.addr)}: ${row.bytes.padEnd(17)} ${row.text}`);
  }
}

console.log('================================================================================');
console.log('Phase 283: Trace 0x09E2AE - where do STAT CALC strings come from?');
console.log('================================================================================');
console.log('');

printSection('PART 1: Static disassembly 0x09E280-0x09E2AE');
printDisasmRows(disasm(RANGE_STATIC_START, RANGE_STATIC_END));
console.log('');
console.log('  Key finding:');
console.log(`    0x09E296 loads HL with ${hex(0x09E140)} and A with 0x42 before the final JP ${hex(0x09E2AE)} -> ${hex(TARGET)}.`);
console.log(`    Nearby alternate path at 0x09E288 loads HL with ${hex(0x09E158)} and jumps to ${hex(0x09E106)} instead.`);
console.log('');

printSection(`PART 2: 128-byte ASCII dump at ${hex(0x09E140)}`);
for (const line of dumpAscii(0x09E140, 128)) {
  console.log(line);
}
console.log('');
console.log('  Null-terminated strings seen in that 128-byte window:');
for (const entry of readNullStrings(0x09E140, 128)) {
  console.log(`    ${hex(entry.addr)} ${JSON.stringify(entry.text)}`);
}
console.log('');

printSection('PART 3: Context disassembly 0x09E296-0x09E2B0');
printDisasmRows(disasm(RANGE_CONTEXT_START, RANGE_CONTEXT_END));
console.log('');
console.log('  Interpretation:');
console.log(`    This block is not loading a STAT CALC menu-label table. It points the renderer at ${hex(0x09E140)},`);
console.log('    which is a bank of status / warning strings starting with "MEM Cleared" and "RAM Cleared".');
console.log('');

printSection(`PART 4: Direct JP/CALL scan for ${hex(TARGET)}`);
const directHits = [
  ...findPattern([0xCD, 0x1B, 0xE1, 0x09]).map((addr) => ({ type: 'CALL', addr })),
  ...findPattern([0xC3, 0x1B, 0xE1, 0x09]).map((addr) => ({ type: 'JP', addr })),
].sort((a, b) => a.addr - b.addr);

console.log(`  Direct transfer sites found: ${directHits.length}`);
for (const hit of directHits) {
  console.log(`    ${hex(hit.addr)} ${hit.type} ${hex(TARGET)}${label(hit.addr)} | bytes ${bytesHex(hit.addr, 4)}`);
}
console.log('');

const callerContexts = [
  { site: 0x09DFD8, start: 0x09DFD0, end: 0x09DFDC },
  { site: 0x09E013, start: 0x09E00B, end: 0x09E017 },
  { site: 0x09E2AE, start: 0x09E296, end: 0x09E2B0 },
];

for (const ctx of callerContexts) {
  console.log(`  Caller context for ${hex(ctx.site)}:`);
  const rows = disasm(ctx.start, ctx.end);
  printDisasmRows(rows, '    ');
  const hlImm = findLocalHlImm(rows);
  if (hlImm !== null) {
    console.log(`    -> local HL immediate: ${hex(hlImm)}${label(hlImm)}`);
  } else {
    console.log('    -> no local LD HL,imm in this aligned pre-transfer window; HL is inherited from earlier flow.');
  }
  console.log('');
}

printSection('PART 5: ASCII dumps for discovered / referenced HL targets');
for (const addr of [0x09E140, 0x09E158, 0x09E19D]) {
  console.log(`  Dump at ${hex(addr)}${label(addr)}`);
  for (const line of dumpAscii(addr, 64)) {
    console.log(line);
  }
  console.log('');
}

printSection('SUMMARY');
console.log(`  - The ${hex(0x09E2AE)} STAT-path jump reaches ${hex(TARGET)} with HL=${hex(0x09E140)}, not a CALC menu-label table.`);
console.log('  - 0x09E140 contains status/warning strings: "MEM Cleared", "RAM Cleared", "Defaults Set",');
console.log('    "CHARGING THE BATTERY", "IS RECOMMENDED", "YOUR BATTERY IS LOW", etc.');
console.log(`  - Direct callers of ${hex(TARGET)}: ${directHits.length} total (${directHits.map((hit) => hex(hit.addr)).join(', ')}).`);
console.log(`  - Only ${hex(0x09DFD8)} has a fixed nearby LD HL,imm (${hex(0x09E19D)}), which is another warning-text table.`);
console.log(`  - ${hex(0x09E013)} inherits HL from surrounding flow rather than loading a fresh string-table pointer locally.`);
console.log('  - Conclusion: the strings reachable through 0x09E2AE are not the STAT CALC menu items; the real CALC menu labels live elsewhere in ROM.');

/*
================================================================================
Phase 283: Trace 0x09E2AE - where do STAT CALC strings come from?
================================================================================

PART 1: Static disassembly 0x09E280-0x09E2AE
  0x09E280: CD 35 DF 09       CALL 0x09DF35 [prelude before nearby string path]
  0x09E284: CD C3 ED 09       CALL 0x09EDC3 [shared STAT UI init]
  0x09E288: 21 58 E1 09       LD HL,0x09E158
  0x09E28C: 3E 44             LD A,0x44
  0x09E28E: 11 07 07 00       LD DE,0x000707
  0x09E292: C3 06 E1 09       JP 0x09E106 [shared wrapper before renderer]
  0x09E296: 21 40 E1 09       LD HL,0x09E140
  0x09E29A: 3E 42             LD A,0x42
  0x09E29C: FD CB 35 4E       BIT 1,(IY+0x35)
  0x09E2A0: C4 8E 39 02       CALL NZ,0x02398E [conditional helper called from 0x09E29C/0x09E107]
  0x09E2A4: 20 04             JR NZ,0x09E2AA
  0x09E2A6: 11 07 07 00       LD DE,0x000707
  0x09E2AA: FD CB 0D 8E       RES 1,(IY+0x0D)

  Key finding:
    0x09E296 loads HL with 0x09E140 and A with 0x42 before the final JP 0x09E2AE -> 0x09E11B.
    Nearby alternate path at 0x09E288 loads HL with 0x09E158 and jumps to 0x09E106 instead.

PART 2: 128-byte ASCII dump at 0x09E140
  0x09E140: 4D 45 4D 20 43 6C 65 61 72 65 64 00 52 41 4D 20 MEM Cleared.RAM
  0x09E150: 43 6C 65 61 72 65 64 00 44 65 66 61 75 6C 74 73 Cleared.Defaults
  0x09E160: 20 53 65 74 00 43 48 41 52 47 49 4E 47 20 54 48  Set.CHARGING TH
  0x09E170: 45 20 42 41 54 54 45 52 59 00 49 53 20 52 45 43 E BATTERY.IS REC
  0x09E180: 4F 4D 4D 45 4E 44 45 44 00 59 4F 55 52 20 42 41 OMMENDED.YOUR BA
  0x09E190: 54 54 45 52 59 20 49 53 20 4C 4F 57 00 52 41 4D TTERY IS LOW.RAM
  0x09E1A0: 20 6D 65 6D 6F 72 79 20 77 69 6C 6C 20 62 65 20  memory will be
  0x09E1B0: 6C 6F 73 74 20 69 66 00 20 63 68 61 72 67 65 20 lost if. charge

  Null-terminated strings seen in that 128-byte window:
    0x09E140 "MEM Cleared"
    0x09E14C "RAM Cleared"
    0x09E158 "Defaults Set"
    0x09E165 "CHARGING THE BATTERY"
    0x09E17A "IS RECOMMENDED"
    0x09E189 "YOUR BATTERY IS LOW"
    0x09E19D "RAM memory will be lost if"
    0x09E1B8 " charge "

PART 3: Context disassembly 0x09E296-0x09E2B0
  0x09E296: 21 40 E1 09       LD HL,0x09E140
  0x09E29A: 3E 42             LD A,0x42
  0x09E29C: FD CB 35 4E       BIT 1,(IY+0x35)
  0x09E2A0: C4 8E 39 02       CALL NZ,0x02398E [conditional helper called from 0x09E29C/0x09E107]
  0x09E2A4: 20 04             JR NZ,0x09E2AA
  0x09E2A6: 11 07 07 00       LD DE,0x000707
  0x09E2AA: FD CB 0D 8E       RES 1,(IY+0x0D)
  0x09E2AE: C3 1B E1 09       JP 0x09E11B

  Interpretation:
    This block is not loading a STAT CALC menu-label table. It points the renderer at 0x09E140,
    which is a bank of status / warning strings starting with "MEM Cleared" and "RAM Cleared".

PART 4: Direct JP/CALL scan for 0x09E11B
  Direct transfer sites found: 3
    0x09DFD8 CALL 0x09E11B [direct CALL to 0x09E11B] | bytes CD 1B E1 09
    0x09E013 JP 0x09E11B [direct JP to 0x09E11B] | bytes C3 1B E1 09
    0x09E2AE JP 0x09E11B [STAT CALC path JP to 0x09E11B] | bytes C3 1B E1 09

  Caller context for 0x09DFD8:
    0x09DFD0: 11 06 00 00       LD DE,0x000006
    0x09DFD4: 21 9D E1 09       LD HL,0x09E19D
    0x09DFD8: CD 1B E1 09       CALL 0x09E11B
    -> local HL immediate: 0x09E19D [warning-text table used by 0x09DFD8]

  Caller context for 0x09E013:
    0x09E00B: ED 5B 95 05 D0    LD DE,(0xD00595)
    0x09E010: 1C                INC E
    0x09E011: 16 00             LD D,0x00
    0x09E013: C3 1B E1 09       JP 0x09E11B
    -> no local LD HL,imm in this aligned pre-transfer window; HL is inherited from earlier flow.

  Caller context for 0x09E2AE:
    0x09E296: 21 40 E1 09       LD HL,0x09E140
    0x09E29A: 3E 42             LD A,0x42
    0x09E29C: FD CB 35 4E       BIT 1,(IY+0x35)
    0x09E2A0: C4 8E 39 02       CALL NZ,0x02398E [conditional helper called from 0x09E29C/0x09E107]
    0x09E2A4: 20 04             JR NZ,0x09E2AA
    0x09E2A6: 11 07 07 00       LD DE,0x000707
    0x09E2AA: FD CB 0D 8E       RES 1,(IY+0x0D)
    0x09E2AE: C3 1B E1 09       JP 0x09E11B
    -> local HL immediate: 0x09E140 [string table used by 0x09E296]

PART 5: ASCII dumps for discovered / referenced HL targets
  Dump at 0x09E140 [string table used by 0x09E296]
  0x09E140: 4D 45 4D 20 43 6C 65 61 72 65 64 00 52 41 4D 20 MEM Cleared.RAM
  0x09E150: 43 6C 65 61 72 65 64 00 44 65 66 61 75 6C 74 73 Cleared.Defaults
  0x09E160: 20 53 65 74 00 43 48 41 52 47 49 4E 47 20 54 48  Set.CHARGING TH
  0x09E170: 45 20 42 41 54 54 45 52 59 00 49 53 20 52 45 43 E BATTERY.IS REC

  Dump at 0x09E158 [nearby alternate string table]
  0x09E158: 44 65 66 61 75 6C 74 73 20 53 65 74 00 43 48 41 Defaults Set.CHA
  0x09E168: 52 47 49 4E 47 20 54 48 45 20 42 41 54 54 45 52 RGING THE BATTER
  0x09E178: 59 00 49 53 20 52 45 43 4F 4D 4D 45 4E 44 45 44 Y.IS RECOMMENDED
  0x09E188: 00 59 4F 55 52 20 42 41 54 54 45 52 59 20 49 53 .YOUR BATTERY IS

  Dump at 0x09E19D [warning-text table used by 0x09DFD8]
  0x09E19D: 52 41 4D 20 6D 65 6D 6F 72 79 20 77 69 6C 6C 20 RAM memory will
  0x09E1AD: 62 65 20 6C 6F 73 74 20 69 66 00 20 63 68 61 72 be lost if. char
  0x09E1BD: 67 65 20 69 73 20 6C 6F 73 74 2E 00 42 61 63 6B ge is lost..Back
  0x09E1CD: 75 70 20 6F 72 20 41 72 63 68 69 76 65 20 56 61 up or Archive Va

SUMMARY
  - The 0x09E2AE STAT-path jump reaches 0x09E11B with HL=0x09E140, not a CALC menu-label table.
  - 0x09E140 contains status/warning strings: "MEM Cleared", "RAM Cleared", "Defaults Set",
    "CHARGING THE BATTERY", "IS RECOMMENDED", "YOUR BATTERY IS LOW", etc.
  - Direct callers of 0x09E11B: 3 total (0x09DFD8, 0x09E013, 0x09E2AE).
  - Only 0x09DFD8 has a fixed nearby LD HL,imm (0x09E19D), which is another warning-text table.
  - 0x09E013 inherits HL from surrounding flow rather than loading a fresh string-table pointer locally.
  - Conclusion: the strings reachable through 0x09E2AE are not the STAT CALC menu items; the real CALC menu labels live elsewhere in ROM.
*/
