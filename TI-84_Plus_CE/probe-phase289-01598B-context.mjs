#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const rom = fs.readFileSync(ROM_PATH);

const CONTEXT_START = 0x015980;
const CONTEXT_END = 0x0159BF;
const WIDE_ENTRY_SCAN_START = 0x015930;
const LOCAL_ENTRY_SCAN_START = 0x015950;
const IX_LOAD_PC = 0x01598B;
const HELPER_PC = 0x000D7E;
const HELPER_MAX_INSTRUCTIONS = 50;
const HELPER_CALL_PATTERN = [0xCD, 0x7E, 0x0D, 0x00];
const INDIRECT_TARGET = 0x0159BD;
const SCANNER_ENTRY = 0x0159C0;

const RETURN_TAGS = new Set(['ret', 'reti', 'retn']);
const HARD_BOUNDARY_TAGS = new Set(['ret', 'reti', 'retn', 'jp', 'jp-indirect', 'rst', 'jr']);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function bytesAt(addr, length) {
  return formatBytes(rom.subarray(addr, addr + length));
}

function safeDecode(pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc, mode);
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  const idx = `(${inst.indexRegister ?? 'ix'}${(inst.displacement ?? 0) >= 0 ? '+' : ''}${inst.displacement ?? 0})`;

  switch (inst.tag) {
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${idx}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${idx}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${idx}`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${inst.indirectRegister})`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${inst.dest ?? inst.dst}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest ?? inst.dst}, (${inst.src ?? inst.ptr})`;
    case 'ld-ind-reg': return `ld (${inst.dest ?? inst.ptr}), ${inst.src}`;
    case 'ld-ind-imm': return `ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem': return `ld ${inst.dest ?? inst.dst}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `ld (${hex(inst.addr)}), ${inst.pair}`;
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-ixd-reg': return `ld ${idx}, ${inst.src}`;
    case 'ld-ixd-imm': return `ld ${idx}, ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, ${idx}`;
    case 'ld-indexed-pair': return `ld ${idx}, ${inst.pair ?? inst.src}`;
    case 'ld-pair-indexed': return `ld ${inst.pair ?? inst.dest}, ${idx}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-ixd': return `inc ${idx}`;
    case 'dec-ixd': return `dec ${idx}`;
    case 'add-pair': return `add ${inst.dest ?? 'hl'}, ${inst.src}`;
    case 'adc-pair': return `adc hl, ${inst.src}`;
    case 'sbc-pair': return `sbc hl, ${inst.src}`;
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') return 'xor a';
      return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'ldir': return 'ldir';
    case 'ldi': return 'ldi';
    case 'lddr': return 'lddr';
    case 'ldd': return 'ldd';
    case 'cpir': return 'cpir';
    case 'cpi': return 'cpi';
    case 'cpdr': return 'cpdr';
    case 'cpd': return 'cpd';
    case 'im': return `im ${inst.value}`;
    case 'rsmix': return 'rsmix';
    case 'stmix': return 'stmix';
    case 'ld-special': return `ld ${inst.dest}, ${inst.src}`;
    case 'in0': return `in0 ${inst.reg ?? 'a'}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${inst.reg ?? 'a'}`;
    case 'in-reg': return `in ${inst.reg ?? 'a'}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg ?? 'a'}`;
    case 'in-imm': return `in a, (${hexByte(inst.port)})`;
    case 'out-imm': return `out (${hexByte(inst.port)}), a`;
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'nop': return 'nop';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'halt': return 'halt';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'cpl': return 'cpl';
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'rst': return `rst ${hex(inst.target ?? 0, 2)}`;
    default: return inst.dasm ?? inst.tag ?? '??';
  }
}

function decodeLinear(start, options = {}) {
  const {
    endExclusive = rom.length,
    maxInstructions = Number.POSITIVE_INFINITY,
    mode = 'adl',
    stopOnReturn = false,
  } = options;

  const rows = [];
  let pc = start;

  while (pc < endExclusive && rows.length < maxInstructions) {
    const inst = safeDecode(pc, mode);
    const length = Math.max(1, inst?.length ?? 1);
    const row = {
      pc,
      length,
      endPc: pc + length,
      bytes: bytesAt(pc, length),
      inst,
      text: formatInstruction(inst),
    };
    rows.push(row);
    pc += length;
    if (stopOnReturn && RETURN_TAGS.has(inst?.tag)) {
      break;
    }
  }

  return rows;
}

function printRows(rows, notes = new Map()) {
  for (const row of rows) {
    const note = notes.get(row.pc);
    const suffix = note ? `  ${note}` : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}${suffix}`);
  }
}

function findBoundaryEntries(rows, minEntry, maxEntryInclusive) {
  const entries = [];

  for (let index = 0; index < rows.length - 1; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];
    if (!HARD_BOUNDARY_TAGS.has(current.inst?.tag)) {
      continue;
    }
    if (next.pc < minEntry || next.pc > maxEntryInclusive) {
      continue;
    }
    entries.push({
      boundaryPc: current.pc,
      boundaryText: current.text,
      entryPc: next.pc,
    });
  }

  return entries;
}

function findPattern(pattern) {
  const hits = [];

  for (let offset = 0; offset <= rom.length - pattern.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < pattern.length; index += 1) {
      if (rom[offset + index] !== pattern[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(offset);
    }
  }

  return hits;
}

function findClosestIxLoad(callPc, lookback = 16) {
  let best = null;

  for (let pc = Math.max(0, callPc - lookback); pc < callPc; pc += 1) {
    const inst = safeDecode(pc, 'adl');
    if (!inst) continue;
    if (inst.nextPc > callPc) continue;
    if (inst.tag !== 'ld-pair-imm' || inst.pair !== 'ix') continue;
    if (!best || pc > best.pc) {
      best = { pc, inst };
    }
  }

  return best;
}

function mentionIx(inst) {
  if (!inst) return false;
  return (
    inst.pair === 'ix' ||
    inst.dest === 'ix' ||
    inst.src === 'ix' ||
    inst.indexRegister === 'ix' ||
    inst.indirectRegister === 'ix'
  );
}

function mentionTargetNear(inst, target, radius) {
  if (!inst || typeof inst.target !== 'number') return false;
  return Math.abs((inst.target >>> 0) - (target >>> 0)) <= radius;
}

console.log('=== Phase 289: 0x01598B / 0x000D7E Context Probe ===\n');
console.log(`ROM loaded: ${rom.length} bytes\n`);

console.log(`--- Part 1: Linear context ${hex(CONTEXT_START)}..${hex(CONTEXT_END)} ---\n`);

const contextRows = decodeLinear(CONTEXT_START, {
  endExclusive: CONTEXT_END + 1,
  stopOnReturn: true,
});

const contextNotes = new Map([
  [IX_LOAD_PC, '<-- LD IX,0x0159BD'],
  [0x015990, '<-- CALL 0x000D7E'],
  [0x0159BC, '<-- RET'],
]);

printRows(contextRows, contextNotes);

const contextEndPc = contextRows.length > 0 ? contextRows[contextRows.length - 1].endPc : CONTEXT_START;
if (contextEndPc <= CONTEXT_END) {
  console.log('\n  Post-RET bytes (not reached by linear fallthrough):');
  console.log(`  ${hex(contextEndPc)}..${hex(CONTEXT_END)}  ${bytesAt(contextEndPc, CONTEXT_END - contextEndPc + 1)}`);
}

console.log(`\n--- Part 2: Backward search for the containing function entry ---\n`);

const localRows = decodeLinear(LOCAL_ENTRY_SCAN_START, {
  endExclusive: IX_LOAD_PC + 5,
});
console.log(`Requested local scan ${hex(LOCAL_ENTRY_SCAN_START)}..${hex(IX_LOAD_PC)}:\n`);
printRows(localRows, new Map([[0x015953, '<-- follows JR at 0x015951'], [IX_LOAD_PC, '<-- target']]));

const localEntries = findBoundaryEntries(localRows, LOCAL_ENTRY_SCAN_START, IX_LOAD_PC);
console.log('\nLocal hard-boundary entry candidates:');
if (localEntries.length === 0) {
  console.log('  none');
} else {
  for (const entry of localEntries) {
    console.log(`  ${hex(entry.entryPc)}  after ${hex(entry.boundaryPc)}  ${entry.boundaryText}`);
  }
}

const wideRows = decodeLinear(WIDE_ENTRY_SCAN_START, {
  endExclusive: IX_LOAD_PC + 5,
});
const wideEntries = findBoundaryEntries(wideRows, WIDE_ENTRY_SCAN_START, IX_LOAD_PC);
console.log(`\nExpanded scan ${hex(WIDE_ENTRY_SCAN_START)}..${hex(IX_LOAD_PC)} entry candidates:`);
if (wideEntries.length === 0) {
  console.log('  none');
} else {
  for (const entry of wideEntries) {
    console.log(`  ${hex(entry.entryPc)}  after ${hex(entry.boundaryPc)}  ${entry.boundaryText}`);
  }
}

console.log('\nInterpretation:');
if (localEntries.length > 0) {
  console.log(`  Nearest local entry point before ${hex(IX_LOAD_PC)} is ${hex(localEntries[localEntries.length - 1].entryPc)}.`);
}
const earlierWideEntry = wideEntries.find((entry) => entry.entryPc < LOCAL_ENTRY_SCAN_START);
if (earlierWideEntry) {
  console.log(`  A wider enclosing entry appears at ${hex(earlierWideEntry.entryPc)} after ${hex(earlierWideEntry.boundaryPc)}.`);
}
console.log('  The bytes at 0x015950 are a tiny stub (`di ; jr 0x015953`) that feeds into the same body.');

console.log(`\n--- Part 3: Disassembly of helper ${hex(HELPER_PC)} (first ${HELPER_MAX_INSTRUCTIONS} instructions) ---\n`);

const helperRows = decodeLinear(HELPER_PC, {
  maxInstructions: HELPER_MAX_INSTRUCTIONS,
});

const helperNotes = new Map([
  [HELPER_PC, '<-- helper entry'],
  [0x000DB4, '<-- JP (IX)'],
  [0x000DC2, '<-- immediate callee from 0x000D7E'],
]);

printRows(helperRows, helperNotes);

const ixMentions = helperRows.filter((row) => mentionIx(row.inst));
const indirectJumps = helperRows.filter((row) => row.inst?.tag === 'jp-indirect');
const nearScannerBranches = helperRows.filter((row) => mentionTargetNear(row.inst, SCANNER_ENTRY, 0x10));

console.log('\nHelper observations:');
if (indirectJumps.length === 0) {
  console.log('  No indirect jumps/calls found.');
} else {
  for (const row of indirectJumps) {
    console.log(`  ${hex(row.pc)}  ${row.text}`);
  }
}
if (ixMentions.length > 0) {
  console.log(`  IX-related instructions in the first ${HELPER_MAX_INSTRUCTIONS} rows:`);
  for (const row of ixMentions) {
    console.log(`    ${hex(row.pc)}  ${row.text}`);
  }
}
if (nearScannerBranches.length === 0) {
  console.log(`  No direct CALL/JP targets near ${hex(SCANNER_ENTRY)} appear inside the helper.`);
} else {
  for (const row of nearScannerBranches) {
    console.log(`  Near-scanner branch: ${hex(row.pc)}  ${row.text}`);
  }
}
console.log('  Shape summary: the helper calls 0x000DC2, preserves registers, then tail-jumps through IX.');

console.log(`\n--- Part 4: CALL ${hex(HELPER_PC)} sites ---\n`);

const helperCallSites = findPattern(HELPER_CALL_PATTERN);
console.log(`CALL ${hex(HELPER_PC)} pattern ${HELPER_CALL_PATTERN.map((value) => hexByte(value)).join(' ')} found ${helperCallSites.length} time(s):\n`);

for (const callPc of helperCallSites) {
  const ixLoad = findClosestIxLoad(callPc);
  const prefix = ixLoad
    ? `${hex(ixLoad.pc)}  ${formatInstruction(ixLoad.inst)}  -> `
    : '(no nearby IX load found) -> ';
  console.log(`  ${prefix}${hex(callPc)}  call ${hex(HELPER_PC)}`);
}

console.log(`\n--- Part 5: Follow the indirect IX target ${hex(INDIRECT_TARGET)} ---\n`);

const indirectRows = decodeLinear(INDIRECT_TARGET, {
  endExclusive: SCANNER_ENTRY + 0x20,
  maxInstructions: 10,
});

const indirectNotes = new Map();
for (const row of indirectRows) {
  if (row.pc < SCANNER_ENTRY && row.endPc > SCANNER_ENTRY) {
    indirectNotes.set(row.pc, `<-- spans ${hex(SCANNER_ENTRY)}`);
  }
}
indirectNotes.set(INDIRECT_TARGET, '<-- IX target from 0x01598B');

printRows(indirectRows, indirectNotes);

const overlapRow = indirectRows.find((row) => row.pc < SCANNER_ENTRY && row.endPc > SCANNER_ENTRY);
const exactScannerRow = indirectRows.find((row) => row.pc === SCANNER_ENTRY);

console.log('\nIndirect-target interpretation:');
if (overlapRow) {
  console.log(
    `  Starting at ${hex(INDIRECT_TARGET)} does not land on ${hex(SCANNER_ENTRY)} as a standalone ADL instruction.`
  );
  console.log(
    `  The instruction at ${hex(overlapRow.pc)} (${overlapRow.text}) consumes bytes through ${hex(overlapRow.endPc - 1)} and skips directly to ${hex(overlapRow.endPc)}.`
  );
}
if (exactScannerRow) {
  console.log(`  ${hex(SCANNER_ENTRY)} is reached as part of the same decode stream.`);
} else {
  console.log(`  No instruction in the ADL stream begins exactly at ${hex(SCANNER_ENTRY)} when execution starts from ${hex(INDIRECT_TARGET)}.`);
}

console.log('\n--- Part 6: Summary ---\n');

if (localEntries.length > 0) {
  console.log(`  Local re-entry immediately before the IX load: ${hex(localEntries[localEntries.length - 1].entryPc)}.`);
}
if (earlierWideEntry) {
  console.log(`  Wider enclosing entry candidate: ${hex(earlierWideEntry.entryPc)}.`);
}
console.log(`  ${hex(HELPER_PC)} has ${helperCallSites.length} call site(s) in the ROM.`);
console.log('  The helper is a generic IX dispatch trampoline because it ends in `jp (ix)` after saving/restoring state.');
console.log(`  The ${hex(0x015990)} call site loads IX=${hex(INDIRECT_TARGET)} before entering the helper.`);
if (overlapRow) {
  console.log(`  That indirect jump explains a hidden path into the 0x0159BD blob, but it is not a clean jump to the scanner entry ${hex(SCANNER_ENTRY)} itself.`);
}
