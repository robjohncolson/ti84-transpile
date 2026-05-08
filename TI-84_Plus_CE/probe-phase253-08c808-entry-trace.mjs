#!/usr/bin/env node

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TARGET = 0x08C808;
const RANGE_START = 0x08C800;
const RANGE_END = 0x08C80F;
const JUMP_TABLE_START = 0x000000;
const JUMP_TABLE_END = 0x000800;
const VECTOR_ADDRESSES = [0x000000, 0x000008, 0x000010, 0x000018, 0x000020, 0x000028, 0x000030, 0x000038, 0x000066];
const DATA_CONTEXT_RADIUS = 32;

const ABSOLUTE_BRANCH_FORMS = new Map([
  [0xC3, 'jp'],
  [0xC2, 'jp nz'],
  [0xCA, 'jp z'],
  [0xD2, 'jp nc'],
  [0xDA, 'jp c'],
  [0xE2, 'jp po'],
  [0xEA, 'jp pe'],
  [0xF2, 'jp p'],
  [0xFA, 'jp m'],
  [0xCD, 'call'],
  [0xC4, 'call nz'],
  [0xCC, 'call z'],
  [0xD4, 'call nc'],
  [0xDC, 'call c'],
  [0xE4, 'call po'],
  [0xEC, 'call pe'],
  [0xF4, 'call p'],
  [0xFC, 'call m'],
]);

const RELATIVE_BRANCH_FORMS = new Map([
  [0x10, 'djnz'],
  [0x18, 'jr'],
  [0x20, 'jr nz'],
  [0x28, 'jr z'],
  [0x30, 'jr nc'],
  [0x38, 'jr c'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function read24(addr) {
  return ((rom[addr] & 0xff) | ((rom[addr + 1] & 0xff) << 8) | ((rom[addr + 2] & 0xff) << 16)) >>> 0;
}

function signed8(value) {
  return (value & 0x80) ? value - 0x100 : value;
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function bytesAt(addr, length) {
  const end = Math.min(addr + length, rom.length);
  return Array.from(rom.subarray(addr, end), hexByte).join(' ');
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function printContext(addr, length, radius = DATA_CONTEXT_RADIUS) {
  const start = Math.max(0, addr - radius);
  const end = Math.min(rom.length, addr + length + radius);
  const alignedStart = start - (start % 16);
  for (let lineAddr = alignedStart; lineAddr < end; lineAddr += 16) {
    const lineEnd = Math.min(lineAddr + 16, rom.length);
    const marker = overlaps(lineAddr, lineEnd, addr, addr + length) ? '>' : ' ';
    console.log(`  ${marker} ${hex(lineAddr)}: ${bytesAt(lineAddr, lineEnd - lineAddr)}`);
  }
}

function findExact24(target) {
  const low = target & 0xff;
  const mid = (target >>> 8) & 0xff;
  const high = (target >>> 16) & 0xff;
  const hits = [];
  for (let addr = 0; addr <= rom.length - 3; addr += 1) {
    if (rom[addr] === low && rom[addr + 1] === mid && rom[addr + 2] === high) {
      hits.push(addr);
    }
  }
  return hits;
}

function findRange24Hits(start, end) {
  const hits = [];
  for (let addr = 0; addr <= rom.length - 3; addr += 1) {
    if (rom[addr + 1] !== 0xC8 || rom[addr + 2] !== 0x08) {
      continue;
    }
    const target = 0x08C800 | rom[addr];
    if (target >= start && target <= end) {
      hits.push({ addr, target });
    }
  }
  return hits;
}

function findAbsoluteBranchesToRange(start, end) {
  const hits = [];
  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const mnemonic = ABSOLUTE_BRANCH_FORMS.get(rom[addr]);
    if (!mnemonic) {
      continue;
    }
    const target = read24(addr + 1);
    if (target >= start && target <= end) {
      hits.push({ addr, target, mnemonic, bytes: bytesAt(addr, 4) });
    }
  }
  return hits;
}

function findRelativeBranchesToRange(start, end) {
  const hits = [];
  for (let addr = 0; addr <= rom.length - 2; addr += 1) {
    const mnemonic = RELATIVE_BRANCH_FORMS.get(rom[addr]);
    if (!mnemonic) {
      continue;
    }
    const target = (addr + 2 + signed8(rom[addr + 1])) & 0xFFFFFF;
    if (target >= start && target <= end) {
      hits.push({ addr, target, mnemonic, bytes: bytesAt(addr, 2) });
    }
  }
  return hits;
}

function scanJumpTableWindow() {
  let jpCount = 0;
  const hits = [];
  for (let addr = JUMP_TABLE_START; addr <= JUMP_TABLE_END - 4; addr += 1) {
    if (rom[addr] !== 0xC3) {
      continue;
    }
    jpCount += 1;
    const target = read24(addr + 1);
    if (target >= RANGE_START && target <= RANGE_END) {
      hits.push({ addr, target, bytes: bytesAt(addr, 4) });
    }
  }
  return { jpCount, hits };
}

function inspectVectors() {
  return VECTOR_ADDRESSES.map((vectorAddr) => {
    let jp = null;
    for (let offset = 0; offset <= 8; offset += 1) {
      const addr = vectorAddr + offset;
      if (addr > rom.length - 4) {
        break;
      }
      if (rom[addr] === 0xC3) {
        const target = read24(addr + 1);
        jp = {
          addr,
          target,
          bytes: bytesAt(addr, 4),
          inRange: target >= RANGE_START && target <= RANGE_END,
        };
        break;
      }
    }
    return {
      vectorAddr,
      bytes: bytesAt(vectorAddr, 8),
      jp,
    };
  });
}

function decodeIndexedBit(opcode, baseReg, disp) {
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 0x07;
  if (group === 1) {
    return `bit ${bit}, (${baseReg}${formatDisp(disp)})`;
  }
  if (group === 2) {
    return `res ${bit}, (${baseReg}${formatDisp(disp)})`;
  }
  if (group === 3) {
    return `set ${bit}, (${baseReg}${formatDisp(disp)})`;
  }
  return `indexed-cb ${hexByte(opcode)}, (${baseReg}${formatDisp(disp)})`;
}

function decode(addr) {
  const op = rom[addr];
  switch (op) {
    case 0x06:
      return { len: 2, text: `ld b, ${hex(rom[addr + 1], 2)}` };
    case 0x16:
      return { len: 2, text: `ld d, ${hex(rom[addr + 1], 2)}` };
    case 0x18: {
      const target = (addr + 2 + signed8(rom[addr + 1])) & 0xFFFFFF;
      return { len: 2, text: `jr ${hex(target)}` };
    }
    case 0x19:
      return { len: 1, text: 'add hl, de' };
    case 0x20: {
      const target = (addr + 2 + signed8(rom[addr + 1])) & 0xFFFFFF;
      return { len: 2, text: `jr nz, ${hex(target)}` };
    }
    case 0x21:
      return { len: 4, text: `ld hl, ${hex(read24(addr + 1))}` };
    case 0x28: {
      const target = (addr + 2 + signed8(rom[addr + 1])) & 0xFFFFFF;
      return { len: 2, text: `jr z, ${hex(target)}` };
    }
    case 0x3A:
      return { len: 4, text: `ld a, (${hex(read24(addr + 1))})` };
    case 0x3E:
      return { len: 2, text: `ld a, ${hex(rom[addr + 1], 2)}` };
    case 0x47:
      return { len: 1, text: 'ld b, a' };
    case 0x5F:
      return { len: 1, text: 'ld e, a' };
    case 0x78:
      return { len: 1, text: 'ld a, b' };
    case 0xAF:
      return { len: 1, text: 'xor a' };
    case 0xBE:
      return { len: 1, text: 'cp (hl)' };
    case 0xC1:
      return { len: 1, text: 'pop bc' };
    case 0xC5:
      return { len: 1, text: 'push bc' };
    case 0xC6:
      return { len: 2, text: `add a, ${hex(rom[addr + 1], 2)}` };
    case 0xC9:
      return { len: 1, text: 'ret' };
    case 0xCD:
      return { len: 4, text: `call ${hex(read24(addr + 1))}` };
    case 0xD6:
      return { len: 2, text: `sub ${hex(rom[addr + 1], 2)}` };
    case 0xE5:
      return { len: 1, text: 'push hl' };
    case 0xF1:
      return { len: 1, text: 'pop af' };
    case 0xF5:
      return { len: 1, text: 'push af' };
    case 0xFD: {
      const next = rom[addr + 1];
      if (next === 0xCB) {
        const disp = signed8(rom[addr + 2]);
        const op2 = rom[addr + 3];
        return {
          len: 4,
          text: decodeIndexedBit(op2, 'iy', disp),
        };
      }
      return { len: 2, text: `db ${hexByte(op)} ${hexByte(next)}` };
    }
    case 0xED: {
      const next = rom[addr + 1];
      if (next === 0x27) {
        return { len: 2, text: 'ld hl, (hl)' };
      }
      if (next === 0x5C) {
        return { len: 2, text: 'mlt de' };
      }
      return { len: 2, text: `db ${hexByte(op)} ${hexByte(next)}` };
    }
    case 0xFE:
      return { len: 2, text: `cp ${hex(rom[addr + 1], 2)}` };
    default:
      return { len: 1, text: `db ${hexByte(op)}` };
  }
}

function disassembleRange(start, end) {
  const rows = [];
  for (let addr = start; addr < end;) {
    const decoded = decode(addr);
    rows.push({
      addr,
      bytes: bytesAt(addr, decoded.len),
      text: decoded.text,
    });
    addr += decoded.len;
  }
  return rows;
}

function printDisassembly(title, start, end) {
  console.log(title);
  for (const row of disassembleRange(start, end)) {
    console.log(`  ${hex(row.addr)}  ${row.bytes.padEnd(17)} ${row.text}`);
  }
  console.log('');
}

function printPatternHits(title, hits, formatter) {
  console.log(title);
  if (!hits.length) {
    console.log('  none');
    console.log('');
    return;
  }
  for (const hit of hits) {
    console.log(formatter(hit));
    printContext(hit.addr, 3);
    console.log('');
  }
}

function printBranchHits(title, hits) {
  console.log(title);
  if (!hits.length) {
    console.log('  none');
    console.log('');
    return;
  }
  for (const hit of hits) {
    console.log(`  ${hex(hit.addr)}  ${hit.bytes.padEnd(11)} ${hit.mnemonic} ${hex(hit.target)}`);
  }
  console.log('');
}

function printVectorReport(vectors) {
  console.log('=== 4. RST / Interrupt Vector Check ===');
  for (const vector of vectors) {
    console.log(`  ${hex(vector.vectorAddr)}: ${vector.bytes}`);
    if (!vector.jp) {
      console.log('    no JP opcode in the first 8 bytes');
      continue;
    }
    const suffix = vector.jp.inRange ? '  <-- target is in 0x08C800-0x08C80F' : '';
    console.log(`    JP at ${hex(vector.jp.addr)} -> ${hex(vector.jp.target)}${suffix}`);
  }
  console.log('');
}

function main() {
  const exactHits = findExact24(TARGET);
  const rangeHits = findRange24Hits(RANGE_START, RANGE_END);
  const jumpTableScan = scanJumpTableWindow();
  const vectorReport = inspectVectors();
  const absoluteBranchHits = findAbsoluteBranchesToRange(RANGE_START, RANGE_END);
  const relativeBranchHits = findRelativeBranchesToRange(RANGE_START, RANGE_END);
  const exactRelativeHits = relativeBranchHits.filter((hit) => hit.target === TARGET);

  console.log('Phase 253 - 0x08C808 Entry Trace');
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log('');

  console.log('=== 1. Exact 24-bit Data Search For 0x08C808 ===');
  console.log(`Pattern: 08 C8 08 (${hex(TARGET)})`);
  console.log(`Hit count: ${exactHits.length}`);
  console.log('Note: any absolute CALL/JP/LD immediate to 0x08C808 would also contain this byte pattern.');
  console.log('');
  if (exactHits.length) {
    for (const addr of exactHits) {
      console.log(`  hit @ ${hex(addr)}`);
      printContext(addr, 3);
      console.log('');
    }
  }

  printPatternHits(
    '=== 2. Nearby 24-bit Data Search For 0x08C800-0x08C80F ===',
    rangeHits,
    (hit) => `  hit @ ${hex(hit.addr)} -> ${hex(hit.target)}`
  );

  console.log('=== 3. OS Jump Table Window Check (0x000000-0x000800) ===');
  console.log(`JP opcodes found in window: ${jumpTableScan.jpCount}`);
  if (!jumpTableScan.hits.length) {
    console.log(`Targets in ${hex(RANGE_START)}-${hex(RANGE_END)}: none`);
  } else {
    for (const hit of jumpTableScan.hits) {
      console.log(`  ${hex(hit.addr)}  ${hit.bytes}  jp ${hex(hit.target)}`);
    }
  }
  console.log('');

  printVectorReport(vectorReport);

  console.log('=== 5. Control-Flow Reachability Scan (answers the entry question) ===');
  console.log(`Absolute CALL/JP targets into ${hex(RANGE_START)}-${hex(RANGE_END)}: ${absoluteBranchHits.length}`);
  console.log(`Relative branch targets into ${hex(RANGE_START)}-${hex(RANGE_END)}: ${relativeBranchHits.length}`);
  console.log(`Exact relative branch targets to ${hex(TARGET)}: ${exactRelativeHits.length}`);
  console.log('');
  printBranchHits('Absolute branches into the range:', absoluteBranchHits);
  printBranchHits('Relative branches into the range:', relativeBranchHits);

  printDisassembly('=== 6. Local Control-Flow Context Around 0x08C808 (0x08C7EE-0x08C80F) ===', 0x08C7EE, 0x08C80F);
  printDisassembly('=== 7. Dispatcher Slice 0x08C808-0x08C850 ===', 0x08C808, 0x08C850);
  printDisassembly('=== 8. Table Lookup Helper 0x08C94B-0x08C958 ===', 0x08C94B, 0x08C958);

  console.log('=== Conclusion ===');
  if (!exactHits.length && !rangeHits.length) {
    console.log(`- No raw 24-bit ROM data embeds ${hex(TARGET)} or any nearby pointer in ${hex(RANGE_START)}-${hex(RANGE_END)}.`);
  } else {
    console.log('- Raw 24-bit ROM data references were found above.');
  }
  if (!jumpTableScan.hits.length) {
    console.log(`- No JP entry in ${hex(JUMP_TABLE_START)}-${hex(JUMP_TABLE_END - 1)} points at ${hex(TARGET)} or its nearby window.`);
  }
  if (vectorReport.every((entry) => !entry.jp || !entry.jp.inRange)) {
    console.log('- None of the requested RST / interrupt vectors jump to this dispatcher window.');
  }
  if (exactRelativeHits.length === 1 && exactRelativeHits[0].addr === 0x08C7F7) {
    console.log(`- Execution reaches ${hex(TARGET)} via a local branch: ${hex(0x08C7F7)} = "jr nz, ${hex(TARGET)}".`);
    console.log(`- The surrounding logic first compares A against (0xD007E0); when that compare matches but A is not 0x44, control falls into ${hex(TARGET)}.`);
    console.log('- This is not a jump-table/vector/function-pointer entry path; it is an internal branch inside the same context-switch routine.');
  } else if (exactRelativeHits.length) {
    console.log(`- Execution reaches ${hex(TARGET)} through the relative branch hits listed above.`);
  } else {
    console.log(`- No direct static branch to ${hex(TARGET)} was found; if execution still arrives there, the pointer is being built at runtime.`);
  }
  console.log('- The handler selector register is A. Before the table lookup call, the dispatcher preserves/remaps A; helper 0x08C94B then copies A to E, multiplies by 3, and indexes the 24-bit pointer table at 0x08C958.');
}

main();
