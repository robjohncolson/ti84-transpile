import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROM_SIZE = 0x400000;
const DIRECT_FOCUS = [
  { label: 'descriptor cluster', start: 0x00cb00, end: 0x00ee00 },
  { label: 'slab allocator', start: 0x00e000, end: 0x00e9ff },
];

const REG_WRITES = new Map([
  [0x70, 'b'],
  [0x71, 'c'],
  [0x72, 'd'],
  [0x73, 'e'],
  [0x74, 'h'],
  [0x75, 'l'],
  [0x77, 'a'],
]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(scriptDir, 'ROM.rom');
const rom = fs.readFileSync(romPath);

if (rom.length !== ROM_SIZE) {
  throw new Error(`Expected ROM.rom to be ${ROM_SIZE} bytes, found ${rom.length}`);
}

function hex(value, width = 6) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function formatRange(range) {
  return `${hex(range.start)}-${hex(range.end)}`;
}

function decodeDirectCb(subOpcode, disp) {
  const group = subOpcode >> 6;
  if (group !== 2 && group !== 3) {
    return null;
  }
  const bit = (subOpcode >> 3) & 0x07;
  const op = group === 2 ? 'res' : 'set';
  return `${op} ${bit}, (iy+${disp})`;
}

function decodeRegisterCb(subOpcode) {
  const regIndex = subOpcode & 0x07;
  if (regIndex !== 0x07) {
    return null;
  }
  const group = subOpcode >> 6;
  const bit = (subOpcode >> 3) & 0x07;
  if (group === 1) {
    return `bit ${bit}, a`;
  }
  if (group === 2) {
    return `res ${bit}, a`;
  }
  if (group === 3) {
    return `set ${bit}, a`;
  }

  const ops = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];
  return `${ops[(subOpcode >> 3) & 0x07]} a`;
}

function scanDirectWrites(buffer) {
  const matches = [];
  for (let addr = 0; addr <= 0x3fffff; addr += 1) {
    if (buffer[addr] !== 0xfd) {
      continue;
    }

    const opcode = buffer[addr + 1];
    const disp = buffer[addr + 2];

    if ((disp === 0x08 || disp === 0x09) && REG_WRITES.has(opcode)) {
      matches.push({
        mode: 'direct',
        target: disp,
        addr,
        bytes: [buffer[addr], buffer[addr + 1], buffer[addr + 2]],
        decoded: `ld (iy+${disp}), ${REG_WRITES.get(opcode)}`,
        kind: 'ld-reg',
      });
      continue;
    }

    if ((disp === 0x08 || disp === 0x09) && opcode === 0x36) {
      matches.push({
        mode: 'direct',
        target: disp,
        addr,
        bytes: [buffer[addr], buffer[addr + 1], buffer[addr + 2], buffer[addr + 3]],
        decoded: `ld (iy+${disp}), 0x${buffer[addr + 3].toString(16).padStart(2, '0')}`,
        kind: 'ld-imm',
      });
      continue;
    }

    if ((disp === 0x08 || disp === 0x09) && opcode === 0xcb) {
      const subOpcode = buffer[addr + 3];
      const decoded = decodeDirectCb(subOpcode, disp);
      if (decoded) {
        matches.push({
          mode: 'direct',
          target: disp,
          addr,
          bytes: [buffer[addr], buffer[addr + 1], buffer[addr + 2], buffer[addr + 3]],
          decoded,
          kind: decoded.startsWith('set ') ? 'set' : 'res',
        });
      }
    }
  }
  return matches;
}

function scanHlCandidates(buffer) {
  const matches = [];

  for (let addr = 0; addr <= 0x3fffff; addr += 1) {
    if (buffer[addr] !== 0xed || buffer[addr + 1] !== 0x23) {
      continue;
    }

    const baseDisp = buffer[addr + 2];
    if (baseDisp !== 0x08 && baseDisp !== 0x09) {
      continue;
    }

    let effectiveDisp = baseDisp;
    let cursor = addr + 3;
    const steps = [`lea hl, iy+${baseDisp}`];
    let write = null;

    for (let step = 0; step < 10 && cursor <= 0x3fffff; step += 1) {
      const opcode = buffer[cursor];

      if (opcode === 0x23) {
        effectiveDisp += 1;
        steps.push('inc hl');
        cursor += 1;
        continue;
      }

      if (opcode === 0x2b) {
        effectiveDisp -= 1;
        steps.push('dec hl');
        cursor += 1;
        continue;
      }

      if (REG_WRITES.has(opcode)) {
        write = {
          bytes: [...buffer.slice(addr, cursor + 1)],
          decoded: `ld (hl), ${REG_WRITES.get(opcode)}`,
          end: cursor + 1,
        };
        break;
      }

      if (opcode === 0x36) {
        write = {
          bytes: [...buffer.slice(addr, cursor + 2)],
          decoded: `ld (hl), 0x${buffer[cursor + 1].toString(16).padStart(2, '0')}`,
          end: cursor + 2,
        };
        break;
      }

      if (opcode === 0x7e) {
        steps.push('ld a, (hl)');
        cursor += 1;
        continue;
      }

      if (opcode === 0xcb) {
        const decodedCb = decodeRegisterCb(buffer[cursor + 1]);
        if (!decodedCb) {
          break;
        }
        steps.push(decodedCb);
        cursor += 2;
        continue;
      }

      if (opcode === 0xe6 || opcode === 0xf6 || opcode === 0xee || opcode === 0xfe) {
        const mnemonics = new Map([
          [0xe6, 'and'],
          [0xf6, 'or'],
          [0xee, 'xor'],
          [0xfe, 'cp'],
        ]);
        steps.push(`${mnemonics.get(opcode)} 0x${buffer[cursor + 1].toString(16).padStart(2, '0')}`);
        cursor += 2;
        continue;
      }

      if (opcode === 0xaf) {
        steps.push('xor a');
        cursor += 1;
        continue;
      }

      if (opcode === 0xb7) {
        steps.push('or a');
        cursor += 1;
        continue;
      }

      if (opcode >= 0x47 && opcode <= 0x6f) {
        const copies = new Map([
          [0x47, 'ld b, a'],
          [0x4f, 'ld c, a'],
          [0x57, 'ld d, a'],
          [0x5f, 'ld e, a'],
          [0x67, 'ld h, a'],
          [0x6f, 'ld l, a'],
        ]);
        const decoded = copies.get(opcode);
        if (!decoded) {
          break;
        }
        steps.push(decoded);
        cursor += 1;
        continue;
      }

      break;
    }

    if (!write || (effectiveDisp !== 0x08 && effectiveDisp !== 0x09)) {
      continue;
    }

    matches.push({
      mode: 'hl-indirect',
      target: effectiveDisp,
      addr,
      bytes: write.bytes,
      decoded: `${steps.join(' ; ')} ; ${write.decoded}`,
      kind: write.decoded.startsWith('ld (hl), 0x') ? 'ld-imm' : 'ld-reg',
    });
  }

  return matches;
}

function countByTarget(matches) {
  const counts = new Map([
    [0x08, 0],
    [0x09, 0],
  ]);
  for (const match of matches) {
    counts.set(match.target, (counts.get(match.target) ?? 0) + 1);
  }
  return counts;
}

function groupByRange(matches, range) {
  return matches.filter((match) => match.addr >= range.start && match.addr <= range.end);
}

function clusterByGap(matches, gap = 0x100) {
  const clusters = [];
  let current = null;

  for (const match of matches) {
    if (!current || match.addr - current.end > gap) {
      current = {
        start: match.addr,
        end: match.addr,
        matches: [],
      };
      clusters.push(current);
    }
    current.end = match.addr;
    current.matches.push(match);
  }

  return clusters;
}

function printMatchList(label, matches) {
  console.log(label);
  if (matches.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const match of matches) {
    const suffix = match.mode === 'hl-indirect' ? ` [effective iy+${match.target}]` : '';
    console.log(`  ${hex(match.addr)}  ${bytesToHex(match.bytes)}  ${match.decoded}${suffix}`);
  }
}

const directMatches = scanDirectWrites(rom);
const hlCandidates = scanHlCandidates(rom);

console.log(`ROM: ${romPath}`);
console.log(`Size: ${rom.length} bytes (${hex(rom.length, 8)})`);
console.log('');

console.log('Summary');
const directCounts = countByTarget(directMatches);
const hlCounts = countByTarget(hlCandidates);
console.log(`  Direct IY-relative writes: ${directMatches.length}`);
console.log(`    +8: ${directCounts.get(0x08)}`);
console.log(`    +9: ${directCounts.get(0x09)}`);
console.log(`  HL-indirect candidates: ${hlCandidates.length}`);
console.log(`    +8: ${hlCounts.get(0x08)}`);
console.log(`    +9: ${hlCounts.get(0x09)}`);
console.log('');

console.log('Focus Ranges');
for (const range of DIRECT_FOCUS) {
  const directInRange = groupByRange(directMatches, range);
  const hlInRange = groupByRange(hlCandidates, range);
  console.log(`  ${range.label} ${formatRange(range)}`);
  console.log(`    direct: ${directInRange.length}`);
  console.log(`    hl-indirect: ${hlInRange.length}`);
}
console.log('');

console.log('Direct Cluster Summary (gap <= 0x100, clusters with >= 2 sites)');
for (const cluster of clusterByGap(directMatches).filter((entry) => entry.matches.length >= 2)) {
  const clusterCounts = countByTarget(entry.matches);
  console.log(`  ${hex(cluster.start)}-${hex(cluster.end)}  total=${entry.matches.length}  +8=${clusterCounts.get(0x08)}  +9=${clusterCounts.get(0x09)}`);
}
console.log('');

console.log('HL-Indirect Cluster Summary (gap <= 0x100, clusters with >= 2 sites)');
for (const cluster of clusterByGap(hlCandidates).filter((entry) => entry.matches.length >= 2)) {
  const clusterCounts = countByTarget(entry.matches);
  console.log(`  ${hex(cluster.start)}-${hex(cluster.end)}  total=${entry.matches.length}  +8=${clusterCounts.get(0x08)}  +9=${clusterCounts.get(0x09)}`);
}
console.log('');

for (const range of DIRECT_FOCUS) {
  console.log(`${range.label} direct matches`);
  printMatchList('', groupByRange(directMatches, range));
  console.log('');
  console.log(`${range.label} HL-indirect candidates`);
  printMatchList('', groupByRange(hlCandidates, range));
  console.log('');
}

printMatchList('All direct IY-relative matches', directMatches);
console.log('');
printMatchList('All HL-indirect candidates', hlCandidates);
