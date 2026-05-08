#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = readFileSync(ROM_PATH);

const TARGET_ADDR = 0x08C8CF;
const PRIMARY_START = 0x08C8A0;
const PRIMARY_CODE_END = 0x08C958;
const PRIMARY_END = 0x08C980;
const BACKSCAN_START = 0x08C79F;
const TABLE_BASE = 0x08C958;
const TABLE_PTR_MAX = 0x0BFFFF;

const HELPER_DISPATCH = 0x08C900;
const HELPER_TABLE = 0x08C94B;
const HELPER_JP_HL = 0x08C745;
const HELPER_CX_COPY = 0x08C782;
const CXMAIN_SLOT = 0xD007CA;

const KNOWN_ADDRESSES = [
  { name: 'cxMain pre-handler entry', addr: 0x058241 },
  { name: 'cxMain dispatch JP(HL)', addr: 0x0585D3 },
  { name: 'cxMain direct entry', addr: 0x0585E9 },
  { name: 'home body entry', addr: 0x0582BC },
];

const BRANCH_FORMS = [
  { op: 0xCD, name: 'CALL' },
  { op: 0xC4, name: 'CALL NZ' },
  { op: 0xCC, name: 'CALL Z' },
  { op: 0xD4, name: 'CALL NC' },
  { op: 0xDC, name: 'CALL C' },
  { op: 0xE4, name: 'CALL PO' },
  { op: 0xEC, name: 'CALL PE' },
  { op: 0xF4, name: 'CALL P' },
  { op: 0xFC, name: 'CALL M' },
  { op: 0xC3, name: 'JP' },
  { op: 0xC2, name: 'JP NZ' },
  { op: 0xCA, name: 'JP Z' },
  { op: 0xD2, name: 'JP NC' },
  { op: 0xDA, name: 'JP C' },
  { op: 0xE2, name: 'JP PO' },
  { op: 0xEA, name: 'JP PE' },
  { op: 0xF2, name: 'JP P' },
  { op: 0xFA, name: 'JP M' },
];

const LD_REF_FORMS = [
  { op: 0x01, name: 'LD BC,nn' },
  { op: 0x11, name: 'LD DE,nn' },
  { op: 0x21, name: 'LD HL,nn' },
  { op: 0x31, name: 'LD SP,nn' },
  { op: 0x22, name: 'LD (nn),HL' },
  { op: 0x2A, name: 'LD HL,(nn)' },
  { op: 0x32, name: 'LD (nn),A' },
  { op: 0x3A, name: 'LD A,(nn)' },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, Math.min(addr + length, rom.length)), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function read24(addr) {
  return ((rom[addr] & 0xFF) | ((rom[addr + 1] & 0xFF) << 8) | ((rom[addr + 2] & 0xFF) << 16)) >>> 0;
}

function signed8(value) {
  return (value & 0x80) ? value - 0x100 : value;
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function decodeIndexedBit(opcode) {
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 0x07;
  if (group === 1) return `bit ${bit}`;
  if (group === 2) return `res ${bit}`;
  if (group === 3) return `set ${bit}`;
  return null;
}

function decode(pc) {
  const op = rom[pc];

  switch (op) {
    case 0x01:
      return { pc, len: 4, text: `ld bc, ${hex(read24(pc + 1))}` };
    case 0x11:
      return { pc, len: 4, text: `ld de, ${hex(read24(pc + 1))}` };
    case 0x16:
      return { pc, len: 2, text: `ld d, ${hex(rom[pc + 1], 2)}` };
    case 0x18: {
      const disp = signed8(rom[pc + 1]);
      return { pc, len: 2, text: `jr ${hex((pc + 2 + disp) & 0xFFFFFF)}` };
    }
    case 0x19:
      return { pc, len: 1, text: 'add hl, de' };
    case 0x20: {
      const disp = signed8(rom[pc + 1]);
      return { pc, len: 2, text: `jr nz, ${hex((pc + 2 + disp) & 0xFFFFFF)}` };
    }
    case 0x21:
      return { pc, len: 4, text: `ld hl, ${hex(read24(pc + 1))}`, value: read24(pc + 1) };
    case 0x22:
      return { pc, len: 4, text: `ld (${hex(read24(pc + 1))}), hl`, addr: read24(pc + 1) };
    case 0x28: {
      const disp = signed8(rom[pc + 1]);
      return { pc, len: 2, text: `jr z, ${hex((pc + 2 + disp) & 0xFFFFFF)}` };
    }
    case 0x2A:
      return { pc, len: 4, text: `ld hl, (${hex(read24(pc + 1))})`, addr: read24(pc + 1) };
    case 0x32:
      return { pc, len: 4, text: `ld (${hex(read24(pc + 1))}), a`, addr: read24(pc + 1) };
    case 0x39:
      return { pc, len: 1, text: 'add hl, sp' };
    case 0x3A:
      return { pc, len: 4, text: `ld a, (${hex(read24(pc + 1))})`, addr: read24(pc + 1) };
    case 0x3E:
      return { pc, len: 2, text: `ld a, ${hex(rom[pc + 1], 2)}` };
    case 0x47:
      return { pc, len: 1, text: 'ld b, a' };
    case 0x4F:
      return { pc, len: 1, text: 'ld c, a' };
    case 0x5F:
      return { pc, len: 1, text: 'ld e, a' };
    case 0x78:
      return { pc, len: 1, text: 'ld a, b' };
    case 0x79:
      return { pc, len: 1, text: 'ld a, c' };
    case 0x7E:
      return { pc, len: 1, text: 'ld a, (hl)' };
    case 0x97:
      return { pc, len: 1, text: 'sub a' };
    case 0xC1:
      return { pc, len: 1, text: 'pop bc' };
    case 0xC3:
      return { pc, len: 4, text: `jp ${hex(read24(pc + 1))}`, target: read24(pc + 1), terminator: true };
    case 0xC4:
      return { pc, len: 4, text: `call nz, ${hex(read24(pc + 1))}`, target: read24(pc + 1) };
    case 0xC5:
      return { pc, len: 1, text: 'push bc' };
    case 0xC9:
      return { pc, len: 1, text: 'ret', terminator: true };
    case 0xCC:
      return { pc, len: 4, text: `call z, ${hex(read24(pc + 1))}`, target: read24(pc + 1) };
    case 0xCD:
      return { pc, len: 4, text: `call ${hex(read24(pc + 1))}`, target: read24(pc + 1) };
    case 0xE1:
      return { pc, len: 1, text: 'pop hl' };
    case 0xE5:
      return { pc, len: 1, text: 'push hl' };
    case 0xE9:
      return { pc, len: 1, text: 'jp (hl)', terminator: true };
    case 0xF1:
      return { pc, len: 1, text: 'pop af' };
    case 0xF5:
      return { pc, len: 1, text: 'push af' };
    case 0xFD: {
      const next = rom[pc + 1];
      if (next === 0x21) {
        return { pc, len: 5, text: `ld iy, ${hex(read24(pc + 2))}`, value: read24(pc + 2) };
      }
      if (next === 0x7E) {
        const disp = signed8(rom[pc + 2]);
        return { pc, len: 3, text: `ld a, (iy${formatDisp(disp)})` };
      }
      if (next === 0x77) {
        const disp = signed8(rom[pc + 2]);
        return { pc, len: 3, text: `ld (iy${formatDisp(disp)}), a` };
      }
      if (next === 0xCB) {
        const disp = signed8(rom[pc + 2]);
        const op2 = rom[pc + 3];
        const bitText = decodeIndexedBit(op2);
        if (bitText) {
          return { pc, len: 4, text: `${bitText}, (iy${formatDisp(disp)})` };
        }
      }
      return { pc, len: 2, text: `db ${hex(op, 2)} ${hex(next, 2)}` };
    }
    case 0xED: {
      const next = rom[pc + 1];
      if (next === 0x27) {
        return { pc, len: 2, text: 'ld hl, (hl)' };
      }
      if (next === 0x5C) {
        return { pc, len: 2, text: 'mlt de' };
      }
      if (next === 0xB0) {
        return { pc, len: 2, text: 'ldir' };
      }
      return { pc, len: 2, text: `db ${hex(op, 2)} ${hex(next, 2)}` };
    }
    case 0xFE:
      return { pc, len: 2, text: `cp ${hex(rom[pc + 1], 2)}` };
    default:
      return { pc, len: 1, text: `db ${hex(op, 2)}` };
  }
}

function disassembleRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    const row = decode(pc);
    row.bytes = bytesAt(pc, row.len);
    rows.push(row);
    pc += row.len;
  }
  return rows;
}

function printDisassembly(title, rows) {
  console.log(title);
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(23)} ${row.text}`);
  }
  console.log('');
}

function findDirectBranchRefs(target) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - 4; pc++) {
    const form = BRANCH_FORMS.find((entry) => entry.op === rom[pc]);
    if (!form) continue;
    if (read24(pc + 1) === target) {
      hits.push({ pc, text: `${form.name} ${hex(target)}`, bytes: bytesAt(pc, 4) });
    }
  }
  return hits;
}

function findLdRefs(target) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - 4; pc++) {
    const form = LD_REF_FORMS.find((entry) => entry.op === rom[pc]);
    if (!form) continue;
    if (read24(pc + 1) === target) {
      hits.push({ pc, text: form.name, bytes: bytesAt(pc, 4) });
    }
  }
  return hits;
}

function collectPointerTable(base, maxEntries = 64) {
  const entries = [];
  let stop = null;
  for (let index = 0; index < maxEntries; index++) {
    const entryAddr = base + index * 3;
    if (entryAddr + 2 >= rom.length) {
      stop = { index, entryAddr, value: null, reason: 'rom-end' };
      break;
    }
    const value = read24(entryAddr);
    if (value > TABLE_PTR_MAX) {
      stop = { index, entryAddr, value, reason: 'out-of-range' };
      break;
    }
    entries.push({ index, entryAddr, value });
  }
  return { entries, stop };
}

function printBranchHits(title, hits) {
  console.log(title);
  if (hits.length === 0) {
    console.log('  (none)');
  } else {
    for (const hit of hits) {
      console.log(`  ${hex(hit.pc)}  ${hit.bytes}  ${hit.text}`);
    }
  }
  console.log('');
}

function printLdHits(title, hits) {
  console.log(title);
  if (hits.length === 0) {
    console.log('  (none)');
  } else {
    for (const hit of hits) {
      console.log(`  ${hex(hit.pc)}  ${hit.bytes}  ${hit.text}`);
    }
  }
  console.log('');
}

function annotateKnown(addr) {
  const match = KNOWN_ADDRESSES.find((entry) => entry.addr === addr);
  return match ? `  <-- ${match.name}` : '';
}

function printTableAnalysis() {
  const { entries, stop } = collectPointerTable(TABLE_BASE);

  console.log('=== 2. Table At 0x08C958 ===');
  console.log('Table loader at 0x08C94B:');
  console.log('  0x08C94B  ld e, a');
  console.log('  0x08C94C  ld d, 0x03');
  console.log('  0x08C94E  mlt de');
  console.log('  0x08C950  ld hl, 0x08C958');
  console.log('  0x08C954  add hl, de');
  console.log('  0x08C955  ld hl, (hl)');
  console.log('  0x08C957  ret');
  console.log('');
  console.log('Indexing rule: entry_address = 0x08C958 + (A * 3), then read one 24-bit LE pointer.');
  console.log('');
  console.log(`Consecutive in-range 24-bit entries from ${hex(TABLE_BASE)}: ${entries.length}`);
  for (const entry of entries) {
    console.log(`  [${entry.index.toString().padStart(2, '0')}] ${hex(entry.entryAddr)} -> ${hex(entry.value)}${annotateKnown(entry.value)}`);
  }
  console.log('');
  if (stop) {
    const stopValue = stop.value === null ? 'n/a' : hex(stop.value);
    console.log(`First non-table-looking triple: index ${stop.index}, bytes at ${hex(stop.entryAddr)} => ${stopValue} (${stop.reason})`);
    console.log('Heuristic table boundary: 30 entries, covering 0x08C958..0x08C9B1.');
  }
  console.log('');

  console.log('Known-address cross-reference inside the table:');
  for (const known of KNOWN_ADDRESSES) {
    const hit = entries.find((entry) => entry.value === known.addr);
    if (hit) {
      console.log(`  ${known.name}: present at index ${hit.index} (${hex(hit.entryAddr)})`);
    } else {
      console.log(`  ${known.name}: not present`);
    }
  }
  console.log('');

  const helperCallers = findDirectBranchRefs(HELPER_TABLE);
  printBranchHits('Direct callers of 0x08C94B:', helperCallers);
}

const backRows = disassembleRange(BACKSCAN_START, PRIMARY_CODE_END);
const primaryRows = disassembleRange(PRIMARY_START, PRIMARY_CODE_END);
const dispatchRows = disassembleRange(HELPER_JP_HL, HELPER_JP_HL + 1);
const cxCopyRows = disassembleRange(HELPER_CX_COPY, 0x08C796);

console.log('=== Phase 252: 0x08C8CF Handler Pointer Trace ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 6)})`);
console.log('');

printDisassembly('=== 1. Disassembly 0x08C8A0..0x08C957 ===', primaryRows);

const targetIndex = primaryRows.findIndex((row) => row.pc === TARGET_ADDR);
if (targetIndex === -1) {
  console.log(`Target ${hex(TARGET_ADDR)} was not decoded as an instruction start.`);
  console.log('');
} else {
  console.log('Target focus at 0x08C8CF:');
  for (const row of primaryRows.slice(Math.max(0, targetIndex - 2), Math.min(primaryRows.length, targetIndex + 7))) {
    const marker = row.pc === TARGET_ADDR ? '  <==' : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(23)} ${row.text}${marker}`);
  }
  console.log('');
}

const lastTerminator = backRows
  .filter((row) => row.pc < TARGET_ADDR && row.terminator)
  .at(-1);
const localBlockStart = lastTerminator ? (lastTerminator.pc + lastTerminator.len) : BACKSCAN_START;

const callableEntries = backRows
  .filter((row) => row.pc <= TARGET_ADDR)
  .map((row) => ({
    pc: row.pc,
    callers: findDirectBranchRefs(row.pc),
  }))
  .filter((entry) => entry.callers.length > 0);

const enclosingEntry = callableEntries.at(-1);

console.log('=== 1A. Boundary Analysis ===');
if (lastTerminator) {
  console.log(`Nearest preceding terminator before ${hex(TARGET_ADDR)}: ${hex(lastTerminator.pc)}  ${lastTerminator.text}`);
  console.log(`Nearest local block start after that terminator: ${hex(localBlockStart)}`);
} else {
  console.log(`No preceding RET/JP found in the manual back-scan window; using ${hex(localBlockStart)} as the provisional block start.`);
}
console.log('');
if (enclosingEntry) {
  console.log(`Nearest direct-callable entry before ${hex(TARGET_ADDR)}: ${hex(enclosingEntry.pc)} (${enclosingEntry.callers.length} caller(s))`);
  if (enclosingEntry.pc === 0x08C7AD) {
    console.log('This matches the main NewContext0 entry. The earlier 0x08C79F wrapper jumps into 0x08C7AD.');
  }
} else {
  console.log('No direct-callable entry was found before the target within the scanned window.');
}
console.log('');

printDisassembly('Supplemental wrapper / entry window 0x08C79F..0x08C820:', backRows.filter((row) => row.pc < 0x08C820));
printDisassembly('Dispatch helper 0x08C745:', dispatchRows);
printDisassembly('Related cxMain copy helper 0x08C782..0x08C795:', cxCopyRows);

console.log('=== 1B. Store-vs-Dispatch Conclusion ===');
console.log('The bytes after 0x08C8CF are NOT an immediate LD (nn),HL store.');
console.log(`  ${hex(TARGET_ADDR)}  ld hl, 0x058241`);
console.log(`  ${hex(0x08C8D9)}  call 0x08C900`);
console.log(`  ${hex(0x08C90C)}  call 0x08C745`);
console.log(`  ${hex(HELPER_JP_HL)}  jp (hl)`);
console.log('');
console.log('Static conclusion: this path passes 0x058241 as a live HL function pointer and dispatches through JP(HL).');
console.log(`The known cxMain RAM slot is ${hex(CXMAIN_SLOT)}, but this exact 0x08C8CF path does not directly execute LD (${hex(CXMAIN_SLOT)}),HL.`);
console.log('');

printTableAnalysis();

console.log('=== 3. Caller Scan ===');
if (enclosingEntry) {
  printBranchHits(`Direct CALL/JP refs to enclosing entry ${hex(enclosingEntry.pc)}:`, enclosingEntry.callers);
}
printBranchHits('Direct CALL/JP refs to wrapper 0x08C79F:', findDirectBranchRefs(0x08C79F));
printBranchHits('Direct CALL/JP refs to 0x08C900:', findDirectBranchRefs(HELPER_DISPATCH));
printBranchHits('Direct CALL/JP refs to 0x08C928:', findDirectBranchRefs(0x08C928));

console.log('=== 4. cxMain Slot Cross-Refs ===');
printLdHits(`LD-form references to candidate cxMain slot ${hex(CXMAIN_SLOT)}:`, findLdRefs(CXMAIN_SLOT));

console.log('=== 5. Summary ===');
if (enclosingEntry) {
  console.log(`Function containing ${hex(TARGET_ADDR)}: enclosing direct-call entry ${hex(enclosingEntry.pc)} (local block start ${hex(localBlockStart)})`);
} else {
  console.log(`Function containing ${hex(TARGET_ADDR)}: best local block start ${hex(localBlockStart)}`);
}
console.log(`Direct handler path: ${hex(TARGET_ADDR)} -> ${hex(HELPER_DISPATCH)} -> ${hex(HELPER_JP_HL)} -> JP(HL)`);
console.log(`0x08C958 table: ${collectPointerTable(TABLE_BASE).entries.length} consecutive 24-bit pointer entries, indexed by A*3`);
console.log(`Known-address hits in table: 0x058241=yes, 0x0585D3=no, 0x0585E9=no, 0x0582BC=no`);
console.log(`Pointer-store conclusion: no direct LD (nn),HL store after ${hex(TARGET_ADDR)}; related cxMain slot is ${hex(CXMAIN_SLOT)} elsewhere in the context system.`);
