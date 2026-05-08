#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const TARGETS = [
  { label: '0x062055', value: 0x062055, bytes: [0x55, 0x20, 0x06] },
  { label: '0x08C808', value: 0x08C808, bytes: [0x08, 0xC8, 0x08] },
];

const JP_HL_OPCODE = 0xE9;
const JP_SEARCH_RADIUS = 64;
const CONTEXT_RADIUS = 16;
const MAX_STORE_TRACE_INSTRUCTIONS = 12;

const LD_HL_062055 = [0x21, 0x55, 0x20, 0x06];
const REQUESTED_ED23 = [0xED, 0x23];
const CANONICAL_ED63 = [0xED, 0x63];

const RAM_BASE = 0xD00000;
const RAM_LIMIT = 0xD0FFFF;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read16(addr) {
  return ((rom[addr] ?? 0) | ((rom[addr + 1] ?? 0) << 8)) >>> 0;
}

function read24(addr) {
  return ((rom[addr] ?? 0) | ((rom[addr + 1] ?? 0) << 8) | ((rom[addr + 2] ?? 0) << 16)) >>> 0;
}

function signed8(value) {
  return (value & 0x80) ? value - 0x100 : value;
}

function formatSigned(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function bytesAt(start, length) {
  const end = Math.min(start + length, rom.length);
  return Array.from(rom.subarray(start, end), (value) => hexByte(value)).join(' ');
}

function findPattern(pattern) {
  const hits = [];
  outer: for (let pc = 0; pc <= rom.length - pattern.length; pc++) {
    for (let i = 0; i < pattern.length; i++) {
      if (rom[pc + i] !== pattern[i]) continue outer;
    }
    hits.push(pc);
  }
  return hits;
}

function inRam(addr) {
  return addr >= RAM_BASE && addr <= RAM_LIMIT;
}

function indexedBitText(opcode) {
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 0x07;
  if (group === 1) return `bit ${bit}`;
  if (group === 2) return `res ${bit}`;
  if (group === 3) return `set ${bit}`;
  return `rot ${hexByte(opcode)}`;
}

function makeInst(pc, len, text, extra = {}) {
  return {
    pc,
    len,
    text,
    known: true,
    bytes: bytesAt(pc, len),
    ...extra,
  };
}

function decodeOne(pc) {
  const op = rom[pc];
  if (op === undefined) {
    return {
      pc,
      len: 1,
      text: '<eof>',
      known: false,
      bytes: '',
    };
  }

  switch (op) {
    case 0x00:
      return makeInst(pc, 1, 'nop');
    case 0x01:
      return makeInst(pc, 4, `ld bc, ${hex(read24(pc + 1))}`);
    case 0x06:
      return makeInst(pc, 2, `ld b, ${hex(rom[pc + 1], 2)}`);
    case 0x0E:
      return makeInst(pc, 2, `ld c, ${hex(rom[pc + 1], 2)}`);
    case 0x11:
      return makeInst(pc, 4, `ld de, ${hex(read24(pc + 1))}`);
    case 0x16:
      return makeInst(pc, 2, `ld d, ${hex(rom[pc + 1], 2)}`);
    case 0x18: {
      const disp = signed8(rom[pc + 1] ?? 0);
      return makeInst(pc, 2, `jr ${hex((pc + 2 + disp) & 0xFFFFFF)}`, { terminator: true });
    }
    case 0x19:
      return makeInst(pc, 1, 'add hl, de', { writesHl: true });
    case 0x1E:
      return makeInst(pc, 2, `ld e, ${hex(rom[pc + 1], 2)}`);
    case 0x20: {
      const disp = signed8(rom[pc + 1] ?? 0);
      return makeInst(pc, 2, `jr nz, ${hex((pc + 2 + disp) & 0xFFFFFF)}`, { terminator: true });
    }
    case 0x21:
      return makeInst(pc, 4, `ld hl, ${hex(read24(pc + 1))}`, {
        writesHl: true,
        immValue: read24(pc + 1),
      });
    case 0x22:
      return makeInst(pc, 4, `ld (${hex(read24(pc + 1))}), hl [adl guess]`, {
        storeHl: true,
        storeKind: 'adl-22',
        storeAddr: read24(pc + 1),
      });
    case 0x23:
      return makeInst(pc, 1, 'inc hl', { writesHl: true });
    case 0x26:
      return makeInst(pc, 2, `ld h, ${hex(rom[pc + 1], 2)}`, { writesHl: true });
    case 0x28: {
      const disp = signed8(rom[pc + 1] ?? 0);
      return makeInst(pc, 2, `jr z, ${hex((pc + 2 + disp) & 0xFFFFFF)}`, { terminator: true });
    }
    case 0x29:
      return makeInst(pc, 1, 'add hl, hl', { writesHl: true });
    case 0x2A:
      return makeInst(pc, 4, `ld hl, (${hex(read24(pc + 1))})`, {
        writesHl: true,
      });
    case 0x2B:
      return makeInst(pc, 1, 'dec hl', { writesHl: true });
    case 0x2E:
      return makeInst(pc, 2, `ld l, ${hex(rom[pc + 1], 2)}`, { writesHl: true });
    case 0x31:
      return makeInst(pc, 4, `ld sp, ${hex(read24(pc + 1))}`);
    case 0x32:
      return makeInst(pc, 4, `ld (${hex(read24(pc + 1))}), a`);
    case 0x36:
      return makeInst(pc, 2, `ld (hl), ${hex(rom[pc + 1], 2)}`);
    case 0x39:
      return makeInst(pc, 1, 'add hl, sp', { writesHl: true });
    case 0x3A:
      return makeInst(pc, 4, `ld a, (${hex(read24(pc + 1))})`);
    case 0x3E:
      return makeInst(pc, 2, `ld a, ${hex(rom[pc + 1], 2)}`);
    case 0x47:
      return makeInst(pc, 1, 'ld b, a');
    case 0x4F:
      return makeInst(pc, 1, 'ld c, a');
    case 0x56:
      return makeInst(pc, 1, 'ld d, (hl)');
    case 0x5E:
      return makeInst(pc, 1, 'ld e, (hl)');
    case 0x70:
      return makeInst(pc, 1, 'ld (hl), b');
    case 0x71:
      return makeInst(pc, 1, 'ld (hl), c');
    case 0x72:
      return makeInst(pc, 1, 'ld (hl), d');
    case 0x73:
      return makeInst(pc, 1, 'ld (hl), e');
    case 0x74:
      return makeInst(pc, 1, 'ld (hl), h');
    case 0x75:
      return makeInst(pc, 1, 'ld (hl), l');
    case 0x77:
      return makeInst(pc, 1, 'ld (hl), a');
    case 0x78:
      return makeInst(pc, 1, 'ld a, b');
    case 0x79:
      return makeInst(pc, 1, 'ld a, c');
    case 0x7A:
      return makeInst(pc, 1, 'ld a, d');
    case 0x7B:
      return makeInst(pc, 1, 'ld a, e');
    case 0x7C:
      return makeInst(pc, 1, 'ld a, h');
    case 0x7D:
      return makeInst(pc, 1, 'ld a, l');
    case 0x7E:
      return makeInst(pc, 1, 'ld a, (hl)');
    case 0x87:
      return makeInst(pc, 1, 'add a');
    case 0x97:
      return makeInst(pc, 1, 'sub a');
    case 0xA7:
      return makeInst(pc, 1, 'and a');
    case 0xAF:
      return makeInst(pc, 1, 'xor a');
    case 0xB7:
      return makeInst(pc, 1, 'or a');
    case 0xBE:
      return makeInst(pc, 1, 'cp (hl)');
    case 0xC1:
      return makeInst(pc, 1, 'pop bc');
    case 0xC2:
      return makeInst(pc, 4, `jp nz, ${hex(read24(pc + 1))}`, { terminator: true });
    case 0xC3:
      return makeInst(pc, 4, `jp ${hex(read24(pc + 1))}`, { terminator: true });
    case 0xC4:
      return makeInst(pc, 4, `call nz, ${hex(read24(pc + 1))}`);
    case 0xC5:
      return makeInst(pc, 1, 'push bc');
    case 0xC8:
      return makeInst(pc, 1, 'ret z', { terminator: true });
    case 0xC9:
      return makeInst(pc, 1, 'ret', { terminator: true });
    case 0xCA:
      return makeInst(pc, 4, `jp z, ${hex(read24(pc + 1))}`, { terminator: true });
    case 0xCC:
      return makeInst(pc, 4, `call z, ${hex(read24(pc + 1))}`);
    case 0xCD:
      return makeInst(pc, 4, `call ${hex(read24(pc + 1))}`);
    case 0xD1:
      return makeInst(pc, 1, 'pop de');
    case 0xD2:
      return makeInst(pc, 4, `jp nc, ${hex(read24(pc + 1))}`, { terminator: true });
    case 0xD4:
      return makeInst(pc, 4, `call nc, ${hex(read24(pc + 1))}`);
    case 0xD5:
      return makeInst(pc, 1, 'push de');
    case 0xD8:
      return makeInst(pc, 1, 'ret c', { terminator: true });
    case 0xDA:
      return makeInst(pc, 4, `jp c, ${hex(read24(pc + 1))}`, { terminator: true });
    case 0xDC:
      return makeInst(pc, 4, `call c, ${hex(read24(pc + 1))}`);
    case 0xE1:
      return makeInst(pc, 1, 'pop hl', { writesHl: true });
    case 0xE2:
      return makeInst(pc, 4, `jp po, ${hex(read24(pc + 1))}`, { terminator: true });
    case 0xE4:
      return makeInst(pc, 4, `call po, ${hex(read24(pc + 1))}`);
    case 0xE5:
      return makeInst(pc, 1, 'push hl');
    case 0xE9:
      return makeInst(pc, 1, 'jp (hl)', { terminator: true });
    case 0xEA:
      return makeInst(pc, 4, `jp pe, ${hex(read24(pc + 1))}`, { terminator: true });
    case 0xEC:
      return makeInst(pc, 4, `call pe, ${hex(read24(pc + 1))}`);
    case 0xF1:
      return makeInst(pc, 1, 'pop af');
    case 0xF2:
      return makeInst(pc, 4, `jp p, ${hex(read24(pc + 1))}`, { terminator: true });
    case 0xF4:
      return makeInst(pc, 4, `call p, ${hex(read24(pc + 1))}`);
    case 0xF5:
      return makeInst(pc, 1, 'push af');
    case 0xFA:
      return makeInst(pc, 4, `jp m, ${hex(read24(pc + 1))}`, { terminator: true });
    case 0xFC:
      return makeInst(pc, 4, `call m, ${hex(read24(pc + 1))}`);
    case 0xFE:
      return makeInst(pc, 2, `cp ${hex(rom[pc + 1], 2)}`);
    case 0xCB:
      return {
        pc,
        len: 2,
        text: `db CB ${hexByte(rom[pc + 1])}`,
        known: false,
        bytes: bytesAt(pc, 2),
      };
    case 0xDD:
    case 0xFD: {
      const prefix = op === 0xDD ? 'ix' : 'iy';
      const next = rom[pc + 1];

      if (next === 0x21) {
        return makeInst(pc, 5, `ld ${prefix}, ${hex(read24(pc + 2))}`);
      }
      if (next === 0x23) {
        return makeInst(pc, 2, `inc ${prefix}`);
      }
      if (next === 0x2B) {
        return makeInst(pc, 2, `dec ${prefix}`);
      }
      if (next === 0x7E) {
        const disp = signed8(rom[pc + 2] ?? 0);
        return makeInst(pc, 3, `ld a, (${prefix}${formatSigned(disp)})`);
      }
      if (next === 0x77) {
        const disp = signed8(rom[pc + 2] ?? 0);
        return makeInst(pc, 3, `ld (${prefix}${formatSigned(disp)}), a`);
      }
      if (next === 0xE1) {
        return makeInst(pc, 2, `pop ${prefix}`);
      }
      if (next === 0xE5) {
        return makeInst(pc, 2, `push ${prefix}`);
      }
      if (next === 0xE9) {
        return makeInst(pc, 2, `jp (${prefix})`, { terminator: true });
      }
      if (next === 0xCB) {
        const disp = signed8(rom[pc + 2] ?? 0);
        const op2 = rom[pc + 3] ?? 0;
        return makeInst(pc, 4, `${indexedBitText(op2)}, (${prefix}${formatSigned(disp)})`);
      }

      return {
        pc,
        len: 2,
        text: `db ${hexByte(op)} ${hexByte(next)}`,
        known: false,
        bytes: bytesAt(pc, 2),
      };
    }
    case 0xED: {
      const next = rom[pc + 1];
      switch (next) {
        case 0x23:
          return makeInst(pc, 5, `ld (${hex(read24(pc + 2))}), hl [requested ED 23 form]`, {
            storeHl: true,
            storeKind: 'ed23',
            storeAddr: read24(pc + 2),
          });
        case 0x27:
          return makeInst(pc, 2, 'ld hl, (hl)', { writesHl: true });
        case 0x43:
          return makeInst(pc, 5, `ld (${hex(read24(pc + 2))}), bc`);
        case 0x4B:
          return makeInst(pc, 5, `ld bc, (${hex(read24(pc + 2))})`);
        case 0x53:
          return makeInst(pc, 5, `ld (${hex(read24(pc + 2))}), de`);
        case 0x5B:
          return makeInst(pc, 5, `ld de, (${hex(read24(pc + 2))})`);
        case 0x5C:
          return makeInst(pc, 2, 'mlt de');
        case 0x63:
          return makeInst(pc, 5, `ld (${hex(read24(pc + 2))}), hl`, {
            storeHl: true,
            storeKind: 'ed63',
            storeAddr: read24(pc + 2),
          });
        case 0x6B:
          return makeInst(pc, 5, `ld hl, (${hex(read24(pc + 2))})`, { writesHl: true });
        case 0x73:
          return makeInst(pc, 5, `ld (${hex(read24(pc + 2))}), sp`);
        case 0x7B:
          return makeInst(pc, 5, `ld sp, (${hex(read24(pc + 2))})`);
        case 0xB0:
          return makeInst(pc, 2, 'ldir');
        case 0xB8:
          return makeInst(pc, 2, 'lddr');
        default:
          return {
            pc,
            len: 2,
            text: `db ED ${hexByte(next)}`,
            known: false,
            bytes: bytesAt(pc, 2),
          };
      }
    }
    default:
      return {
        pc,
        len: 1,
        text: `db ${hexByte(op)}`,
        known: false,
        bytes: bytesAt(pc, 1),
      };
  }
}

function isBetterScore(nextScore, bestScore) {
  for (let i = 0; i < nextScore.length; i++) {
    if (nextScore[i] > bestScore[i]) return true;
    if (nextScore[i] < bestScore[i]) return false;
  }
  return false;
}

function chooseDisasmStart(targetPc, radius = CONTEXT_RADIUS) {
  const minimum = Math.max(0, targetPc - radius);
  let best = {
    start: targetPc,
    score: [-1, -Infinity, -Infinity],
  };

  for (let start = targetPc; start >= minimum; start--) {
    let pc = start;
    let knownBytes = 0;
    let unknownCount = 0;
    let steps = 0;

    while (pc < targetPc && steps < 64) {
      const row = decodeOne(pc);
      if (row.known) {
        knownBytes += row.len;
      } else {
        unknownCount += 1;
      }
      pc += row.len;
      steps += 1;
    }

    if (pc !== targetPc) continue;

    const score = [knownBytes, -unknownCount, targetPc - start];
    if (isBetterScore(score, best.score)) {
      best = { start, score };
    }
  }

  return best.start;
}

function disassembleAround(targetPc, radius = CONTEXT_RADIUS) {
  const start = chooseDisasmStart(targetPc, radius);
  const end = Math.min(rom.length, targetPc + radius + 1);
  const rows = [];

  for (let pc = start; pc < end;) {
    const row = decodeOne(pc);
    rows.push(row);
    pc += row.len;
  }

  return { start, end, rows };
}

function printRawHitSection(target, hits) {
  const bytePattern = target.bytes.map((value) => hexByte(value)).join(' ');
  console.log(`=== Raw LE Scan ${target.label} ===`);
  console.log(`Target bytes: ${bytePattern}`);
  console.log(`Hit count: ${hits.length}`);
  if (hits.length === 0) {
    console.log('  (none)');
  } else {
    for (const hit of hits) {
      console.log(`  ${hex(hit)}`);
    }
  }
  console.log('');
}

function collectNearbyJpCandidates(rawHits) {
  const map = new Map();

  for (const hit of rawHits) {
    const start = Math.max(0, hit.addr - JP_SEARCH_RADIUS);
    const end = Math.min(rom.length - 1, hit.addr + JP_SEARCH_RADIUS);

    for (let pc = start; pc <= end; pc++) {
      if (rom[pc] !== JP_HL_OPCODE) continue;

      let entry = map.get(pc);
      if (!entry) {
        entry = {
          pc,
          prevByte: pc > 0 ? rom[pc - 1] : null,
          associations: [],
        };
        map.set(pc, entry);
      }

      entry.associations.push({
        target: hit.target,
        hitAddr: hit.addr,
        distance: pc - hit.addr,
      });
    }
  }

  return Array.from(map.values()).sort((left, right) => left.pc - right.pc);
}

function printHexWindow(centerPc) {
  const start = Math.max(0, centerPc - CONTEXT_RADIUS);
  const end = Math.min(rom.length, centerPc + CONTEXT_RADIUS + 1);

  for (let line = start; line < end; line += 8) {
    const sliceEnd = Math.min(line + 8, end);
    const bytes = [];
    const markers = [];

    for (let pc = line; pc < sliceEnd; pc++) {
      bytes.push(hexByte(rom[pc]));
      markers.push(pc === centerPc ? '^^' : '  ');
    }

    console.log(`    ${hex(line)}: ${bytes.join(' ')}`);
    if (markers.some((marker) => marker.trim())) {
      console.log(`             ${markers.join(' ')}`);
    }
  }
}

function printNearbyJpSection(candidates) {
  console.log('=== Nearby JP(HL) Opcode Bytes (0xE9) ===');
  console.log(`Search radius: +/-${JP_SEARCH_RADIUS} bytes from every raw pointer hit`);
  if (candidates.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const candidate of candidates) {
    const ddFdNote = candidate.prevByte === 0xDD || candidate.prevByte === 0xFD
      ? `  immediate previous byte ${hex(candidate.prevByte, 2)} could also form JP(${candidate.prevByte === 0xDD ? 'IX' : 'IY'}) if aligned`
      : '';
    console.log(`  ${hex(candidate.pc)}  E9${ddFdNote}`);
    for (const association of candidate.associations.sort((left, right) => Math.abs(left.distance) - Math.abs(right.distance))) {
      const signedDistance = association.distance >= 0 ? `+${association.distance}` : `${association.distance}`;
      console.log(`    near ${association.target.label} hit ${hex(association.hitAddr)} (${signedDistance} bytes)`);
    }
    console.log('    Hex window (+/-16):');
    printHexWindow(candidate.pc);
    console.log('    Best-effort decode:');
    for (const row of disassembleAround(candidate.pc).rows) {
      const marker = row.pc === candidate.pc ? '  <== E9' : '';
      console.log(`      ${hex(row.pc)}  ${row.bytes.padEnd(23)} ${row.text}${marker}`);
    }
    console.log('');
  }
}

function summarizeImmediateStoreForms(loadHits) {
  const requestedEd23 = [];
  const canonicalEd63 = [];
  const ambiguous22 = [];

  for (const loadPc of loadHits) {
    const storePc = loadPc + LD_HL_062055.length;

    if (rom[storePc] === REQUESTED_ED23[0] && rom[storePc + 1] === REQUESTED_ED23[1]) {
      const addr = read24(storePc + 2);
      requestedEd23.push({
        loadPc,
        storePc,
        addr,
        ram: inRam(addr),
      });
    }

    if (rom[storePc] === CANONICAL_ED63[0] && rom[storePc + 1] === CANONICAL_ED63[1]) {
      const addr = read24(storePc + 2);
      canonicalEd63.push({
        loadPc,
        storePc,
        addr,
        ram: inRam(addr),
      });
    }

    if (rom[storePc] === 0x22) {
      const addr16 = read16(storePc + 1);
      const adlAddr = read24(storePc + 1);
      ambiguous22.push({
        loadPc,
        storePc,
        addr16,
        effectiveRamAddr: RAM_BASE | addr16,
        adlAddr,
        ramIfAdl: inRam(adlAddr),
      });
    }
  }

  return { requestedEd23, canonicalEd63, ambiguous22 };
}

function cloneTrace(trace) {
  return trace.map((row) => ({
    pc: row.pc,
    bytes: row.bytes,
    text: row.text,
  }));
}

function traceStoresFromLoad(loadPc) {
  const trace = [decodeOne(loadPc)];
  const matches = [];

  let pc = loadPc + LD_HL_062055.length;
  let stopReason = 'max-instructions';

  for (let steps = 0; steps < MAX_STORE_TRACE_INSTRUCTIONS && pc < rom.length; steps++) {
    const row = decodeOne(pc);
    trace.push(row);

    if (!row.known) {
      stopReason = 'unknown-opcode';
      break;
    }

    if (row.storeHl) {
      if (row.storeKind === 'ed23' || row.storeKind === 'ed63') {
        matches.push({
          loadPc,
          storePc: row.pc,
          storeKind: row.storeKind,
          storeAddr: row.storeAddr,
          ram: inRam(row.storeAddr),
          trace: cloneTrace(trace),
        });
      } else if (row.storeKind === 'adl-22') {
        const addr16 = read16(row.pc + 1);
        matches.push({
          loadPc,
          storePc: row.pc,
          storeKind: row.storeKind,
          adlAddr: row.storeAddr,
          ramIfAdl: inRam(row.storeAddr),
          z80Addr16: addr16,
          effectiveRamAddr: RAM_BASE | addr16,
          trace: cloneTrace(trace),
        });
      }
    }

    if (row.writesHl) {
      stopReason = 'hl-clobbered';
      break;
    }

    if (row.terminator) {
      stopReason = 'terminator';
      break;
    }

    pc += row.len;
  }

  return { loadPc, matches, stopReason, trace: cloneTrace(trace) };
}

function printImmediateStoreGroup(title, items, formatter) {
  console.log(title);
  if (items.length === 0) {
    console.log('  (none)');
  } else {
    for (const item of items) {
      console.log(`  ${formatter(item)}`);
    }
  }
  console.log('');
}

function printStoreTraceMatch(match) {
  if (match.storeKind === 'ed23' || match.storeKind === 'ed63') {
    console.log(
      `  load ${hex(match.loadPc)} -> store ${hex(match.storePc)} (${match.storeKind}) -> ${hex(match.storeAddr)}${match.ram ? '  [D0 RAM]' : '  [not D0 RAM]'}`
    );
  } else {
    console.log(
      `  load ${hex(match.loadPc)} -> store ${hex(match.storePc)} (22 form) -> Z80/MBASE=D0 => ${hex(match.effectiveRamAddr)}, ADL => ${hex(match.adlAddr)}${match.ramIfAdl ? '  [ADL D0 RAM]' : ''}`
    );
  }
  for (const row of match.trace) {
    console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(23)} ${row.text}`);
  }
  console.log('');
}

function main() {
  const hitSets = TARGETS.map((target) => ({
    target,
    hits: findPattern(target.bytes),
  }));

  const rawHits = hitSets.flatMap(({ target, hits }) => hits.map((addr) => ({ target, addr })));
  const nearbyJpCandidates = collectNearbyJpCandidates(rawHits);

  const loadHits = findPattern(LD_HL_062055);
  const immediateStoreSummary = summarizeImmediateStoreForms(loadHits);
  const tracedStoreCandidates = loadHits.map((loadPc) => traceStoresFromLoad(loadPc));
  const tracedMatches = tracedStoreCandidates.flatMap((entry) => entry.matches);
  const tracedRamMatches = tracedMatches.filter((match) =>
    match.storeKind === 'adl-22'
      ? true
      : match.ram
  );

  console.log('=== Phase 253: 0x062055 RAM Pointer Hunt ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length)})`);
  console.log('');

  for (const entry of hitSets) {
    printRawHitSection(entry.target, entry.hits);
  }

  printNearbyJpSection(nearbyJpCandidates);

  console.log('=== 0x062055 -> RAM Store Pattern Scan ===');
  console.log(`Raw ADL load sites for 0x062055 (21 55 20 06): ${loadHits.length}`);
  if (loadHits.length === 0) {
    console.log('  (none)');
  } else {
    for (const loadPc of loadHits) {
      console.log(`  ${hex(loadPc)}`);
    }
  }
  console.log('');

  printImmediateStoreGroup(
    'Immediate exact form: 21 55 20 06 ED 23 nn nn nn',
    immediateStoreSummary.requestedEd23,
    (item) => `load ${hex(item.loadPc)} -> store ${hex(item.storePc)} -> ${hex(item.addr)}${item.ram ? '  [D0 RAM]' : '  [not D0 RAM]'}`
  );

  printImmediateStoreGroup(
    'Immediate exact form: 21 55 20 06 ED 63 nn nn nn',
    immediateStoreSummary.canonicalEd63,
    (item) => `load ${hex(item.loadPc)} -> store ${hex(item.storePc)} -> ${hex(item.addr)}${item.ram ? '  [D0 RAM]' : '  [not D0 RAM]'}`
  );

  printImmediateStoreGroup(
    'Immediate ambiguous form: 21 55 20 06 22 nn nn [nn]',
    immediateStoreSummary.ambiguous22,
    (item) => `load ${hex(item.loadPc)} -> store ${hex(item.storePc)} -> Z80/MBASE=D0 => ${hex(item.effectiveRamAddr)}, ADL => ${hex(item.adlAddr)}${item.ramIfAdl ? '  [ADL D0 RAM]' : ''}`
  );

  console.log(`Flow-aware trace after LD HL,0x062055 (max ${MAX_STORE_TRACE_INSTRUCTIONS} instructions until HL clobber/unknown/terminator):`);
  if (tracedMatches.length === 0) {
    console.log('  (no LD (..),HL store found while HL remained 0x062055)');
    console.log('');
  } else {
    for (const match of tracedMatches) {
      printStoreTraceMatch(match);
    }
  }

  console.log('=== Summary ===');
  console.log(`0x062055 raw LE hits: ${hitSets[0].hits.length}`);
  console.log(`0x08C808 raw LE hits: ${hitSets[1].hits.length}`);
  console.log(`Nearby E9 opcode bytes within +/-${JP_SEARCH_RADIUS}: ${nearbyJpCandidates.length}`);
  console.log(`LD HL,0x062055 load sites: ${loadHits.length}`);
  console.log(`Flow-aware LD (..),HL matches after those loads: ${tracedMatches.length}`);

  const d0RelevantMatches = tracedRamMatches.filter((match) =>
    match.storeKind === 'adl-22'
      ? true
      : match.ram
  );

  if (hitSets[0].hits.length === 0) {
    console.log('No raw 24-bit LE data reference to 0x062055 was found in ROM. The dispatch pointer is likely constructed or copied at runtime.');
  } else if (d0RelevantMatches.length === 0) {
    console.log('Raw data references exist, but no static LD HL,0x062055 -> LD (D0xxxx),HL chain was found in this scan.');
  } else {
    console.log(`Potential D0-RAM store chains found: ${d0RelevantMatches.length}`);
  }
}

main();
