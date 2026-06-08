import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(romPath);

const opcodeNames = new Map([
  [0xCD, 'CALL nn'],
  [0xC3, 'JP nn'],
  [0xC4, 'CALL NZ,nn'],
  [0xCC, 'CALL Z,nn'],
  [0xD4, 'CALL NC,nn'],
  [0xDC, 'CALL C,nn'],
  [0xE4, 'CALL PO,nn'],
  [0xEC, 'CALL PE,nn'],
  [0xF4, 'CALL P,nn'],
  [0xFC, 'CALL M,nn'],
]);

const opcodes = [...opcodeNames.keys()];
const targets = [
  { label: '0x0A1FAB primary entry', bytes: [0xAB, 0x1F, 0x0A] },
  { label: '0x0A1FB5 secondary entry', bytes: [0xB5, 0x1F, 0x0A] },
  { label: '0x0A1FE4 wrapper', bytes: [0xE4, 0x1F, 0x0A] },
];

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function findCallJpSites(targetBytes) {
  const hits = [];

  for (let offset = 0; offset <= rom.length - 4; offset++) {
    const opcode = rom[offset];

    if (!opcodes.includes(opcode)) {
      continue;
    }

    if (
      rom[offset + 1] === targetBytes[0] &&
      rom[offset + 2] === targetBytes[1] &&
      rom[offset + 3] === targetBytes[2]
    ) {
      hits.push({ offset, opcode });
    }
  }

  return hits;
}

console.log(`ROM: ${romPath}`);
console.log(`Size: ${rom.length.toLocaleString()} bytes`);
console.log('');

for (const target of targets) {
  const hits = findCallJpSites(target.bytes);

  console.log(`${target.label}`);
  console.log(`Pattern: [CD/C3/C4/CC/D4/DC/E4/EC/F4/FC] ${target.bytes.map((b) => hex(b, 2).slice(2)).join(' ')}`);
  console.log(`Hits: ${hits.length}`);

  if (hits.length === 0) {
    console.log('  (none)');
  } else {
    for (const hit of hits) {
      const bytes = Array.from(rom.subarray(hit.offset, hit.offset + 4))
        .map((b) => hex(b, 2).slice(2))
        .join(' ');
      console.log(`  ${hex(hit.offset)}: ${opcodeNames.get(hit.opcode)}  bytes ${bytes}`);
    }
  }

  console.log('');
}
