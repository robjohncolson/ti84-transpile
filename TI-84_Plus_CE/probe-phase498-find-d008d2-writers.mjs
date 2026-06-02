import { readFileSync } from 'fs';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = readFileSync(ROM_PATH);

const patterns = [
  { name: 'LD (0xD008D2),A', address: 'D008D2', bytes: [0x32, 0xd2, 0x08, 0xd0] },
  { name: 'LD (0xD008D2),HL', address: 'D008D2', bytes: [0x22, 0xd2, 0x08, 0xd0] },
  { name: 'LD (0xD008D2),HL [ED 63]', address: 'D008D2', bytes: [0xed, 0x63, 0xd2, 0x08, 0xd0] },
  { name: 'LD (0xD008D3),A', address: 'D008D3', bytes: [0x32, 0xd3, 0x08, 0xd0] },
  { name: 'LD (0xD008D3),HL', address: 'D008D3', bytes: [0x22, 0xd3, 0x08, 0xd0] },
  { name: 'LD (0xD008D3),HL [ED 63]', address: 'D008D3', bytes: [0xed, 0x63, 0xd3, 0x08, 0xd0] },
  { name: 'LD (0xD008D4),A', address: 'D008D4', bytes: [0x32, 0xd4, 0x08, 0xd0] },
  { name: 'LD (0xD008D4),HL', address: 'D008D4', bytes: [0x22, 0xd4, 0x08, 0xd0] },
  { name: 'LD (0xD008D4),HL [ED 63]', address: 'D008D4', bytes: [0xed, 0x63, 0xd4, 0x08, 0xd0] },
  { name: 'LD (0xD008D5),A', address: 'D008D5', bytes: [0x32, 0xd5, 0x08, 0xd0] },
  { name: 'LD (0xD008D5),HL', address: 'D008D5', bytes: [0x22, 0xd5, 0x08, 0xd0] },
  { name: 'LD (0xD008D5),HL [ED 63]', address: 'D008D5', bytes: [0xed, 0x63, 0xd5, 0x08, 0xd0] },
  { name: 'LD (0xD008D6),A', address: 'D008D6', bytes: [0x32, 0xd6, 0x08, 0xd0] },
  { name: 'LD (0xD008D6),HL', address: 'D008D6', bytes: [0x22, 0xd6, 0x08, 0xd0] },
  { name: 'LD (0xD008D6),HL [ED 63]', address: 'D008D6', bytes: [0xed, 0x63, 0xd6, 0x08, 0xd0] },
];

const cursorPatterns = [
  { name: 'D00595 cursor row', bytes: [0x95, 0x05, 0xd0] },
  { name: 'D00596 cursor column', bytes: [0x96, 0x05, 0xd0] },
  { name: 'D02505 cursor column mirror', bytes: [0x05, 0x25, 0xd0] },
];

const controlPatterns = [
  { name: 'CALL', bytes: [0xcd], size: 4 },
  { name: 'JP', bytes: [0xc3], size: 4 },
  { name: 'RET', bytes: [0xc9], size: 1 },
  { name: 'RET Z', bytes: [0xc8], size: 1 },
  { name: 'RET NZ', bytes: [0xc0], size: 1 },
  { name: 'RET C', bytes: [0xd8], size: 1 },
  { name: 'RET NC', bytes: [0xd0], size: 1 },
  { name: 'RET M', bytes: [0xf8], size: 1 },
  { name: 'RET P', bytes: [0xf0], size: 1 },
  { name: 'RET PE', bytes: [0xe8], size: 1 },
  { name: 'RET PO', bytes: [0xe0], size: 1 },
];

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function matchesAt(offset, bytes) {
  if (offset + bytes.length > rom.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (rom[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function findPattern(bytes, start = 0, end = rom.length) {
  const results = [];
  const max = Math.min(end, rom.length) - bytes.length;
  for (let offset = Math.max(0, start); offset <= max; offset += 1) {
    if (matchesAt(offset, bytes)) results.push(offset);
  }
  return results;
}

function read24(offset) {
  if (offset + 3 >= rom.length) return null;
  return rom[offset + 1] | (rom[offset + 2] << 8) | (rom[offset + 3] << 16);
}

function decodeControl(offset) {
  const opcode = rom[offset];
  if (opcode === 0xcd) return `CALL ${hex(read24(offset))}`;
  if (opcode === 0xc3) return `JP ${hex(read24(offset))}`;
  const match = controlPatterns.find((pattern) => pattern.bytes[0] === opcode && pattern.size === 1);
  return match?.name ?? null;
}

function scanCursorRefs(center, radius) {
  const start = Math.max(0, center - radius);
  const end = Math.min(rom.length, center + radius + 1);
  return cursorPatterns.flatMap((pattern) =>
    findPattern(pattern.bytes, start, end).map((offset) => ({
      offset,
      name: pattern.name,
      bytes: bytesToHex(rom.subarray(offset, offset + pattern.bytes.length)),
      distance: offset - center,
    })),
  );
}

function scanControlContext(center, radius) {
  const start = Math.max(0, center - radius);
  const end = Math.min(rom.length, center + radius + 1);
  const events = [];

  for (let offset = start; offset < end; offset += 1) {
    const decoded = decodeControl(offset);
    if (decoded) {
      events.push({
        offset,
        decoded,
        distance: offset - center,
      });
    }
  }

  return events;
}

function inferFunctionWindow(matchOffset) {
  const context = scanControlContext(matchOffset, 200);
  const previousRet = context
    .filter((event) => event.offset < matchOffset && event.decoded.startsWith('RET'))
    .at(-1);
  const nextRet = context.find((event) => event.offset > matchOffset && event.decoded.startsWith('RET'));
  const previousCallOrJump = context
    .filter((event) => event.offset < matchOffset && /^(CALL|JP)/.test(event.decoded))
    .at(-1);

  return {
    startGuess: previousRet ? previousRet.offset + 1 : Math.max(0, matchOffset - 200),
    endGuess: nextRet ? nextRet.offset : Math.min(rom.length - 1, matchOffset + 200),
    previousCallOrJump,
    nextRet,
    control: context,
  };
}

function collectMatches() {
  const matches = [];

  for (const pattern of patterns) {
    for (const offset of findPattern(pattern.bytes)) {
      matches.push({
        offset,
        instruction: pattern.name,
        target: pattern.address,
        bytes: bytesToHex(rom.subarray(offset, offset + pattern.bytes.length)),
        cursorNearby100: scanCursorRefs(offset, 100),
        cursorNearby200: scanCursorRefs(offset, 200),
        context: inferFunctionWindow(offset),
      });
    }
  }

  return matches.sort((a, b) => a.offset - b.offset);
}

function groupMatches(matches) {
  const groups = [];

  for (const match of matches) {
    const last = groups.at(-1);
    if (last && match.offset - last.end <= 256) {
      last.matches.push(match);
      last.end = match.offset;
      continue;
    }

    groups.push({
      start: match.offset,
      end: match.offset,
      matches: [match],
    });
  }

  for (const group of groups) {
    const cursorRefs = new Map();
    for (const match of group.matches) {
      for (const ref of match.cursorNearby200) {
        cursorRefs.set(`${ref.offset}:${ref.name}`, ref);
      }
    }
    group.cursorRefs = [...cursorRefs.values()].sort((a, b) => a.offset - b.offset);
    group.cursorScore = group.cursorRefs.length;
    group.contextStart = Math.min(...group.matches.map((match) => match.context.startGuess));
    group.contextEnd = Math.max(...group.matches.map((match) => match.context.endGuess));
  }

  return groups.sort((a, b) => b.cursorScore - a.cursorScore || a.start - b.start);
}

function printMatch(match) {
  console.log(`  - ${hex(match.offset)}: ${match.instruction}`);
  console.log(`    bytes: ${match.bytes}`);
  console.log(`    target: ${match.target}`);
  console.log(
    `    function window guess: ${hex(match.context.startGuess)}..${hex(match.context.endGuess)}`,
  );

  if (match.context.previousCallOrJump) {
    console.log(
      `    previous CALL/JP: ${hex(match.context.previousCallOrJump.offset)} ${match.context.previousCallOrJump.decoded} (${match.context.previousCallOrJump.distance})`,
    );
  }
  if (match.context.nextRet) {
    console.log(
      `    next RET: ${hex(match.context.nextRet.offset)} ${match.context.nextRet.decoded} (+${match.context.nextRet.distance})`,
    );
  }

  if (match.cursorNearby100.length > 0) {
    console.log('    cursor refs within +/-100 bytes:');
    for (const ref of match.cursorNearby100) {
      console.log(`      ${hex(ref.offset)} ${ref.name} ${ref.bytes} (${ref.distance})`);
    }
  } else {
    console.log('    cursor refs within +/-100 bytes: none');
  }
}

function main() {
  const matches = collectMatches();
  const groups = groupMatches(matches);

  console.log('Phase 498: Find writers for D008D2/D008D5 VRAM address registers');
  console.log(`ROM: ${ROM_PATH.pathname}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 6)} bytes)`);
  console.log(`Patterns searched: ${patterns.length}`);
  console.log(`Raw matches: ${matches.length}`);
  console.log(`Groups within 256 bytes: ${groups.length}`);
  console.log('');

  if (groups.length === 0) {
    console.log('No direct absolute stores found for D008D2-D008D6.');
    return;
  }

  groups.forEach((group, index) => {
    console.log(`Group ${index + 1}: ${hex(group.start)}..${hex(group.end)}`);
    console.log(`  matches: ${group.matches.length}`);
    console.log(`  cursor references within +/-200 bytes: ${group.cursorScore}`);
    console.log(`  combined function window guess: ${hex(group.contextStart)}..${hex(group.contextEnd)}`);

    if (group.cursorRefs.length > 0) {
      console.log('  cursor refs near group:');
      for (const ref of group.cursorRefs) {
        console.log(`    ${hex(ref.offset)} ${ref.name} ${ref.bytes}`);
      }
    }

    console.log('  writer instructions:');
    for (const match of group.matches) {
      printMatch(match);
    }
    console.log('');
  });
}

main();
