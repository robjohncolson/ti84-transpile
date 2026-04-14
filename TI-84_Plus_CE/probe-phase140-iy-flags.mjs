#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const DIRECT_OPS = {
  BIT: [0x46, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x76, 0x7e],
  RES: [0x86, 0x8e, 0x96, 0x9e, 0xa6, 0xae, 0xb6, 0xbe],
  SET: [0xc6, 0xce, 0xd6, 0xde, 0xe6, 0xee, 0xf6, 0xfe],
};

const FLAG_NAMES = [
  'grfSplit',
  'vertSplit',
  'graphDraw',
  'grfSplitOverride',
  'write_on_graph',
  'g_style_active',
  'cmp_mod_box',
  'textWrite',
];

function hexAddr(address) {
  return `0x${address.toString(16).padStart(6, '0')}`;
}

function scanCalls(rom, target) {
  const pattern = [
    0xcd,
    target & 0xff,
    (target >> 8) & 0xff,
    (target >> 16) & 0xff,
  ];
  const hits = [];

  for (let address = 0; address <= rom.length - pattern.length; address += 1) {
    if (
      rom[address] === pattern[0] &&
      rom[address + 1] === pattern[1] &&
      rom[address + 2] === pattern[2] &&
      rom[address + 3] === pattern[3]
    ) {
      hits.push(address);
    }
  }

  return hits;
}

function scanDirectIy14(rom) {
  const rows = FLAG_NAMES.map((name, bit) => ({
    bit,
    name,
    BIT: [],
    RES: [],
    SET: [],
  }));

  for (let address = 0; address <= rom.length - 4; address += 1) {
    if (rom[address] !== 0xfd || rom[address + 1] !== 0xcb || rom[address + 2] !== 0x14) {
      continue;
    }

    const opcode = rom[address + 3];

    for (const [kind, opcodes] of Object.entries(DIRECT_OPS)) {
      const bit = opcodes.indexOf(opcode);
      if (bit !== -1) {
        rows[bit][kind].push(address);
        break;
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    bitCount: row.BIT.length,
    resCount: row.RES.length,
    setCount: row.SET.length,
    total: row.BIT.length + row.RES.length + row.SET.length,
  }));
}

function printTable(rows) {
  console.log('bit  name              BIT  SET  RES  total');
  console.log('---  ----------------  ---  ---  ---  -----');

  for (const row of rows) {
    const line = [
      String(row.bit).padStart(3, ' '),
      row.name.padEnd(16, ' '),
      String(row.bitCount).padStart(3, ' '),
      String(row.setCount).padStart(3, ' '),
      String(row.resCount).padStart(3, ' '),
      String(row.total).padStart(5, ' '),
    ].join('  ');

    console.log(line);
  }
}

function printSamples(rows) {
  for (const row of rows) {
    console.log(`\nbit ${row.bit} (${row.name})`);
    console.log(`  BIT: ${row.BIT.slice(0, 8).map(hexAddr).join(', ') || '-'}`);
    console.log(`  SET: ${row.SET.slice(0, 8).map(hexAddr).join(', ') || '-'}`);
    console.log(`  RES: ${row.RES.slice(0, 8).map(hexAddr).join(', ') || '-'}`);
  }
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const rows = scanDirectIy14(rom);
  const calls0800A0 = scanCalls(rom, 0x0800a0);
  const calls0800C2 = scanCalls(rom, 0x0800c2);
  const bit3 = rows[3];
  const directLeader = [...rows].sort((left, right) => right.total - left.total)[0];
  const bit3EffectiveTotal = bit3.total + calls0800A0.length + calls0800C2.length;

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      romPath: ROM_PATH,
      directCounts: rows.map((row) => ({
        bit: row.bit,
        name: row.name,
        BIT: row.bitCount,
        SET: row.setCount,
        RES: row.resCount,
        total: row.total,
      })),
      helpers: {
        call0800A0: calls0800A0.length,
        call0800C2: calls0800C2.length,
      },
      bit3EffectiveTotal,
    }, null, 2));
    return;
  }

  console.log('Phase 140 - IY+0x14 direct flag scan');
  console.log(`ROM: ${ROM_PATH}`);
  console.log('');
  printTable(rows);
  console.log('');
  console.log(`Direct opcode leader: bit ${directLeader.bit} (${directLeader.name}) with ${directLeader.total} hits.`);
  console.log(`CALL 0x0800A0 (shared BIT 3 helper): ${calls0800A0.length}`);
  console.log(`CALL 0x0800C2 (shared RES 3 helper): ${calls0800C2.length}`);
  console.log(`bit 3 direct total: ${bit3.total} (BIT ${bit3.bitCount}, SET ${bit3.setCount}, RES ${bit3.resCount})`);
  console.log(`bit 3 effective total when helper calls are included: ${bit3EffectiveTotal}`);
  printSamples(rows.filter((row) => row.total > 0));
}

main();
