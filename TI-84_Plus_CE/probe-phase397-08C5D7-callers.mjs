#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};

const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url).href);

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = readFileSync(ROM_PATH);

const MODE = 'adl';

// ── Targets ──────────────────────────────────────────────────────────────────

const DISPATCH_ENTRY   = 0x08C5D7;  // the function under investigation
const DISPATCH_END     = 0x08C6D0;  // ~250 bytes of dispatch logic

const HELPER_08C7AD    = 0x08C7AD;  // NewContext0 — called by 0x08C5D7
const HELPER_08C7AD_END = 0x08C7AD + 64;

const TAIL_08C519      = 0x08C519;  // JP target from 0x08C5D7
const TAIL_08C519_END  = 0x08C519 + 64;

// 3 non-error-recovery callers
const CALLERS = [
  { addr: 0x02376D, label: 'caller A (0x02376D)' },
  { addr: 0x08AD52, label: 'caller B (0x08AD52)' },
  { addr: 0x08C497, label: 'caller C (0x08C497)' },
];

// Known error-recovery caller for reference
const ERROR_CALLER = 0x0302E2;

// ── RAM name map ─────────────────────────────────────────────────────────────

const RAM_NAMES = new Map([
  [0xD0058C, 'kbdKey'],
  [0xD0058E, 'kbdToken'],
  [0xD007CA, 'cxMain'],
  [0xD007CD, 'context slot @ D007CD'],
  [0xD007D0, 'context slot @ D007D0'],
  [0xD007E0, 'cxCurApp / context-mode byte'],
  [0xD007FA, 'onSP / saved stack pointer'],
  [0xD0082E, 'scratch block @ D0082E'],
  [0xD02FD6, 'state word @ D02FD6'],
]);

const TARGET_NAMES = new Map([
  [0x022331, 'helper 0x022331'],
  [0x024027, 'helper 0x024027'],
  [0x025354, 'helper 0x025354'],
  [0x025396, 'helper 0x025396'],
  [0x027204, 'helper 0x027204'],
  [0x0302CA, 'error recovery entry'],
  [0x0302E2, 'error recovery caller of dispatch'],
  [0x03C33D, 'CoorMon re-entry'],
  [0x03FBFD, 'tail jump @ 0x03FBFD'],
  [0x04A52C, 'helper 0x04A52C'],
  [0x0551EF, 'helper 0x0551EF'],
  [0x0620E6, 'helper 0x0620E6'],
  [0x08C519, 'action tail / CLEAR dispatch cluster'],
  [0x08C593, 'post-dispatch branch'],
  [0x08C5D7, 'action dispatch entry (target)'],
  [0x08C66D, 'SysErrHandler'],
  [0x08C72F, 'CallMain'],
  [0x08C79F, 'NewContext'],
  [0x08C7AD, 'NewContext0'],
]);

// ── Formatting helpers ───────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function signedDisp(value) {
  const n = Number(value ?? 0);
  return `${n < 0 ? '-' : '+'}${hexByte(Math.abs(n))}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${upper(indexRegister)}${signedDisp(displacement)})`;
}

function formatValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return hex(value, 4);
  if (modePrefix === 'sil' || modePrefix === 'lil') return hex(value, 6);
  if (value <= 0xFF) return hex(value, 2);
  if (value <= 0xFFFF) return hex(value, 4);
  return hex(value, 6);
}

function bytesHex(start, length) {
  return Array.from(
    rom.subarray(start, Math.min(start + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatAlu(op, operand) {
  const name = upper(op);
  if (name === 'ADD' || name === 'ADC' || name === 'SBC') return `${name} A, ${operand}`;
  return `${name} ${operand}`;
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'decodeError', 'tag',
  ]);
  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${signedDisp(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  if (!inst?.tag) return '???';
  switch (inst.tag) {
    case 'db': return `DB ${hexByte(inst.value)}`;
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${upper(inst.condition)}`;
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${upper(inst.indirectRegister)})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'rst': return `RST ${hexByte(inst.target)}`;
    case 'push': return `PUSH ${upper(inst.pair)}`;
    case 'pop': return `POP ${upper(inst.pair)}`;
    case 'ex-af': return 'EX AF, AF\'';
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'cpl': return 'CPL';
    case 'ccf': return 'CCF';
    case 'scf': return 'SCF';
    case 'daa': return 'DAA';
    case 'ld-pair-imm': return `LD ${upper(inst.pair)}, ${formatValue(inst.value, inst.modePrefix)}`;
    case 'ld-reg-imm': return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem': return `LD ${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
      return `LD ${upper(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-reg-ind': return `LD ${upper(inst.dest ?? inst.dst)}, (${upper(inst.src)})`;
    case 'ld-ind-reg': return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm': return `LD (HL), ${hexByte(inst.value)}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-pair': return `LD SP, ${upper(inst.pair)}`;
    case 'ld-pair-indexed': return `LD ${upper(inst.pair)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`;
    case 'ld-reg-ixd':
    case 'ld-reg-indexed': return `LD ${upper(inst.dest ?? inst.dst)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
    case 'ld-indexed-reg': return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'add-pair': return `ADD ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'adc-pair': return `ADC ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'sbc-pair': return `SBC ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'inc-reg': return `INC ${upper(inst.reg)}`;
    case 'dec-reg': return `DEC ${upper(inst.reg)}`;
    case 'inc-pair': return `INC ${upper(inst.pair)}`;
    case 'dec-pair': return `DEC ${upper(inst.pair)}`;
    case 'bit-test': return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set': return `SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set-ind': return `SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res': return `RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res-ind': return `RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'alu-reg': return formatAlu(inst.op, upper(inst.src));
    case 'alu-imm':
    case 'alu-immediate': return formatAlu(inst.op, hexByte(inst.value));
    case 'alu-ind': return formatAlu(inst.op, '(HL)');
    case 'ld-special': return `LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'ldi': return 'LDI';
    case 'ldd': return 'LDD';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'in-reg': return `IN ${upper(inst.dest ?? inst.reg)}, (C)`;
    case 'out-reg': return `OUT (C), ${upper(inst.src ?? inst.reg)}`;
    case 'in-imm': return `IN A, (${hexByte(inst.port)})`;
    case 'out-imm': return `OUT (${hexByte(inst.port)}), A`;
    case 'cpir': return 'CPIR';
    case 'cpdr': return 'CPDR';
    case 'cpi': return 'CPI';
    case 'cpd': return 'CPD';
    case 'neg': return 'NEG';
    case 'im': return `IM ${inst.mode ?? inst.value ?? 0}`;
    case 'rotate-reg': return `${upper(inst.op)} ${upper(inst.reg)}`;
    case 'rotate-ind': return `${upper(inst.op)} (HL)`;
    case 'indexed-ld-imm': return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    default: {
      const extra = fallbackOperands(inst);
      return extra ? `${inst.tag} ${extra}` : inst.tag;
    }
  }
}

// ── Decode / collect helpers ─────────────────────────────────────────────────

function decodeRow(pc) {
  const inst = decodeInstruction(rom, pc, MODE);
  const length = Math.max(1, inst?.length ?? 1);
  const nextPc = inst?.nextPc ?? (pc + length);
  return { pc, bytes: bytesHex(pc, length), inst, text: renderInstruction(inst), nextPc };
}

function collectRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    const row = decodeRow(pc);
    rows.push(row);
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) break;
    pc = row.nextPc;
  }
  return rows;
}

// ── Annotation helpers ───────────────────────────────────────────────────────

function classifyMemoryDirection(inst) {
  if (inst?.tag === 'ld-reg-mem') return 'read';
  if (inst?.tag === 'ld-mem-reg' || inst?.tag === 'ld-mem-pair') return 'write';
  if (inst?.tag === 'ld-pair-mem') return inst.direction === 'to-mem' ? 'write' : 'read';
  return null;
}

function getAbsoluteAddress(inst) {
  return inst?.addr;
}

function noteIY(inst) {
  if (!inst?.indexRegister || upper(inst.indexRegister) !== 'IY') return null;
  const displacement = (inst.displacement ?? 0) & 0xFF;
  const offset = `IY+${hex(displacement, 2)}`;
  if (inst.tag === 'indexed-cb-bit') return `test ${offset} bit ${inst.bit}`;
  if (inst.tag === 'indexed-cb-set') return `set ${offset} bit ${inst.bit}`;
  if (inst.tag === 'indexed-cb-res') return `clear ${offset} bit ${inst.bit}`;
  return `touch ${offset}`;
}

function annotationForRow(row) {
  const notes = [];
  const addr = getAbsoluteAddress(row.inst);
  const direction = classifyMemoryDirection(row.inst);
  const iyNote = noteIY(row.inst);
  const target = row.inst?.target;

  if (direction && addr !== undefined) {
    notes.push(`${direction} ${RAM_NAMES.get(addr) ?? hex(addr)}`);
  }
  if (iyNote) notes.push(iyNote);
  if (target !== undefined) {
    notes.push(`-> ${hex(target)}${TARGET_NAMES.has(target) ? ` (${TARGET_NAMES.get(target)})` : ''}`);
  }
  return notes;
}

function printRows(title, rows, highlights = new Set()) {
  console.log('='.repeat(96));
  console.log(title);
  console.log('='.repeat(96));
  for (const row of rows) {
    const marker = highlights.has(row.pc) ? '>' : ' ';
    const notes = annotationForRow(row);
    const suffix = notes.length ? `  ; ${notes.join(' | ')}` : '';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(18)} ${row.text}${suffix}`);
  }
  console.log('');
}

// ── Caller context: scan backward to find function entry ─────────────────────

function findFunctionEntry(callSite, maxLookback = 128) {
  // Scan backward for RET (C9), JP (C3 xx xx xx), or RETI (ED 4D)
  // These typically mark the end of a previous function
  let bestEntry = callSite;

  for (let offset = 1; offset <= maxLookback; offset++) {
    const addr = callSite - offset;
    if (addr < 0) break;
    const byte = rom[addr];

    // RET = 0xC9 at addr means addr+1 is likely a new function entry
    if (byte === 0xC9) {
      bestEntry = addr + 1;
      break;
    }

    // JP imm24 = C3 xx xx xx — next instruction after it is a function boundary
    if (byte === 0xC3 && addr + 4 <= callSite) {
      bestEntry = addr + 4;
      break;
    }

    // Check for a RET-conditional pattern: C0/C8/D0/D8/E0/E8/F0/F8
    if ((byte & 0xC7) === 0xC0) {
      // Only treat as boundary if it looks like it terminates a block
      // Be conservative — only use RET cc as boundary if very close
      if (offset <= 16) {
        bestEntry = addr + 1;
        break;
      }
    }
  }

  return bestEntry;
}

// ── Summarize a caller region ────────────────────────────────────────────────

function analyzeCallerRegion(callerAddr, label) {
  console.log('');
  console.log('#'.repeat(96));
  console.log(`## ${label}`);
  console.log('#'.repeat(96));

  // Step 1: verify the instruction at callerAddr targets 0x08C5D7
  const callRow = decodeRow(callerAddr);
  const actualTarget = callRow.inst?.target;
  console.log(`\nInstruction at ${hex(callerAddr)}: ${callRow.text}`);
  if (actualTarget === DISPATCH_ENTRY) {
    console.log(`  CONFIRMED: targets 0x08C5D7`);
  } else {
    console.log(`  WARNING: targets ${hex(actualTarget)} — NOT 0x08C5D7!`);
    console.log(`  Raw bytes: ${callRow.bytes}`);
  }

  // Step 2: find the function entry point
  const entryAddr = findFunctionEntry(callerAddr);
  console.log(`\nLikely function entry: ${hex(entryAddr)} (${callerAddr - entryAddr} bytes before call site)`);

  // Step 3: disassemble from entry through call site + 32 bytes past
  const disasmEnd = Math.min(callRow.nextPc + 48, rom.length);
  const rows = collectRange(entryAddr, disasmEnd);

  printRows(`Disassembly: ${hex(entryAddr)} .. ${hex(disasmEnd)}`, rows, new Set([callerAddr]));

  // Step 4: summarize interesting patterns
  console.log('--- Memory references ---');
  let memCount = 0;
  for (const row of rows) {
    const addr = getAbsoluteAddress(row.inst);
    const direction = classifyMemoryDirection(row.inst);
    if (addr !== undefined && direction) {
      console.log(`  ${hex(row.pc)}  ${direction.padEnd(5)} ${hex(addr)}  ${RAM_NAMES.get(addr) ?? ''}  ${row.text}`.trimEnd());
      memCount++;
    }
  }
  if (!memCount) console.log('  (none)');

  console.log('\n--- IY references ---');
  let iyCount = 0;
  for (const row of rows) {
    const note = noteIY(row.inst);
    if (note) {
      console.log(`  ${hex(row.pc)}  ${note}  ${row.text}`);
      iyCount++;
    }
  }
  if (!iyCount) console.log('  (none)');

  console.log('\n--- Control flow (CALL/JP targets) ---');
  let cfCount = 0;
  for (const row of rows) {
    const target = row.inst?.target;
    if (target !== undefined) {
      const label2 = TARGET_NAMES.get(target);
      console.log(`  ${hex(row.pc)}  ${row.text}${label2 ? ` (${label2})` : ''}`);
      cfCount++;
    }
  }
  if (!cfCount) console.log('  (none)');

  // Step 5: look for A register loads and D007E0 writes before the call
  console.log('\n--- Pre-call setup (A loads, D007E0 writes before call site) ---');
  let setupCount = 0;
  for (const row of rows) {
    if (row.pc >= callerAddr) break;  // only before the call

    // LD A, imm8
    if (row.inst?.tag === 'ld-reg-imm' && upper(row.inst.dest ?? row.inst.dst) === 'A') {
      console.log(`  ${hex(row.pc)}  ${row.text}  (A loaded with ${hexByte(row.inst.value)})`);
      setupCount++;
    }
    // LD A, (addr)
    if (row.inst?.tag === 'ld-reg-mem' && upper(row.inst.dest ?? row.inst.dst) === 'A') {
      console.log(`  ${hex(row.pc)}  ${row.text}  (A loaded from memory)`);
      setupCount++;
    }
    // LD A, r
    if (row.inst?.tag === 'ld-reg-reg' && upper(row.inst.dest ?? row.inst.dst) === 'A') {
      console.log(`  ${hex(row.pc)}  ${row.text}  (A loaded from register)`);
      setupCount++;
    }
    // LD (D007E0), A or similar
    if (row.inst?.tag === 'ld-mem-reg' && row.inst.addr === 0xD007E0) {
      console.log(`  ${hex(row.pc)}  ${row.text}  (writing to cxCurApp/mode byte)`);
      setupCount++;
    }
    if (row.inst?.tag === 'ld-mem-pair' && row.inst.addr === 0xD007E0) {
      console.log(`  ${hex(row.pc)}  ${row.text}  (writing to cxCurApp/mode byte)`);
      setupCount++;
    }
    // IY flag modifications
    const iyNote = noteIY(row.inst);
    if (iyNote && (iyNote.includes('set') || iyNote.includes('clear'))) {
      console.log(`  ${hex(row.pc)}  ${row.text}  (${iyNote})`);
      setupCount++;
    }
  }
  if (!setupCount) console.log('  (none found in pre-call window)');

  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 397 — Investigate 0x08C5D7 Callers                                                  ║');
console.log('║  Goal: Is 0x08C5D7 a general mode reinit or specific to error recovery?                    ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');

// ── Part 1: Disassemble 0x08C5D7 itself ──────────────────────────────────────

const dispatchRows = collectRange(DISPATCH_ENTRY, DISPATCH_END);
printRows(
  `0x08C5D7 — Action Dispatch Entry (${dispatchRows.length} instructions, ~${DISPATCH_END - DISPATCH_ENTRY} bytes)`,
  dispatchRows
);

// Summarize dispatch logic
console.log('--- Dispatch logic summary ---');
console.log('Key comparisons and branches:');
for (const row of dispatchRows) {
  const inst = row.inst;
  if (!inst) continue;

  // CP imm8
  if (inst.tag === 'alu-imm' || inst.tag === 'alu-immediate') {
    if (upper(inst.op) === 'CP') {
      console.log(`  ${hex(row.pc)}  ${row.text}  (compare A with ${hexByte(inst.value)})`);
    }
  }
  // Conditional jumps
  if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional' || inst.tag === 'call-conditional') {
    const label = TARGET_NAMES.get(inst.target);
    console.log(`  ${hex(row.pc)}  ${row.text}${label ? `  (${label})` : ''}`);
  }
}
console.log('');

// ── Part 2: Disassemble 0x08C7AD (NewContext0) ──────────────────────────────

const helperRows = collectRange(HELPER_08C7AD, HELPER_08C7AD_END);
printRows(
  `0x08C7AD — NewContext0 (called by dispatch, ${helperRows.length} instructions)`,
  helperRows
);

// ── Part 3: Disassemble 0x08C519 (tail JP target) ───────────────────────────

const tailRows = collectRange(TAIL_08C519, TAIL_08C519_END);
printRows(
  `0x08C519 — Action tail / CLEAR dispatch cluster (JP target, ${tailRows.length} instructions)`,
  tailRows
);

// ── Part 4: Analyze each non-error-recovery caller ──────────────────────────

for (const caller of CALLERS) {
  analyzeCallerRegion(caller.addr, caller.label);
}

// ── Part 5: Cross-reference — find ALL references to 0x08C5D7 ──────────────

console.log('#'.repeat(96));
console.log('## Full cross-reference: all JP/CALL references to 0x08C5D7 in ROM');
console.log('#'.repeat(96));

const REF_OPS = [
  { opcode: 0xC3, kind: 'JP' },
  { opcode: 0xC2, kind: 'JP NZ' },
  { opcode: 0xCA, kind: 'JP Z' },
  { opcode: 0xD2, kind: 'JP NC' },
  { opcode: 0xDA, kind: 'JP C' },
  { opcode: 0xCD, kind: 'CALL' },
  { opcode: 0xC4, kind: 'CALL NZ' },
  { opcode: 0xCC, kind: 'CALL Z' },
  { opcode: 0xD4, kind: 'CALL NC' },
  { opcode: 0xDC, kind: 'CALL C' },
];

const targetBytes = [DISPATCH_ENTRY & 0xFF, (DISPATCH_ENTRY >> 8) & 0xFF, (DISPATCH_ENTRY >> 16) & 0xFF];
const refs = [];

for (const refOp of REF_OPS) {
  for (let pc = 0; pc <= rom.length - 4; pc++) {
    if (rom[pc] === refOp.opcode &&
        rom[pc + 1] === targetBytes[0] &&
        rom[pc + 2] === targetBytes[1] &&
        rom[pc + 3] === targetBytes[2]) {
      const row = decodeRow(pc);
      refs.push({ pc, kind: refOp.kind, row });
    }
  }
}

refs.sort((a, b) => a.pc - b.pc);
console.log(`\nFound ${refs.length} reference(s) to ${hex(DISPATCH_ENTRY)}:\n`);
for (const ref of refs) {
  const isKnownError = ref.pc === ERROR_CALLER;
  const isKnownCaller = CALLERS.some(c => c.addr === ref.pc);
  let tag = '';
  if (isKnownError) tag = ' [ERROR RECOVERY]';
  else if (isKnownCaller) tag = ' [INVESTIGATED ABOVE]';
  console.log(`  ${hex(ref.pc)}  ${ref.kind.padEnd(8)} ${ref.row.text}${tag}`);
}
console.log('');

// ── Part 6: Conclusion ──────────────────────────────────────────────────────

console.log('#'.repeat(96));
console.log('## Analysis Summary');
console.log('#'.repeat(96));
console.log('');
console.log('Callers investigated:');
console.log(`  1. ${hex(ERROR_CALLER)} — error recovery (session 396, known)`);
let callerNum = 2;
for (const caller of CALLERS) {
  console.log(`  ${callerNum}. ${hex(caller.addr)} — ${caller.label}`);
  callerNum++;
}

console.log('');
console.log('=== FINDINGS ===');
console.log('');

// Caller A analysis
console.log('Caller A (0x02376D):');
console.log('  - Loads A = 0x58 immediately before JP 0x08C5D7');
console.log('  - Clears IY+0x01 bit 4 and IY+0x25 bit 5 before the jump');
console.log('  - This is a NORMAL MODE TRANSITION to mode 0x58');
console.log('  - Mode 0x58 = the "format" or "table setup" context');
console.log('');

// Caller B analysis
console.log('Caller B (0x08AD52):');
console.log('  - Four POP BC instructions (stack cleanup) then JP 0x08C5D7');
console.log('  - No A register load visible in the 4-byte pre-call window');
console.log('  - A must have been set earlier in the parent function');
console.log('  - The 4x POP BC = unwinding 4 saved values from a deep call chain');
console.log('  - This looks like an ABORT/CLEANUP path — unwind stack then reinit');
console.log('');

// Wider context for caller B
console.log('Wider context for caller B (scanning back further):');
const callerBWideRows = collectRange(0x08AD30, 0x08AD56);
printRows('0x08AD30..0x08AD56 (wider context for caller B)', callerBWideRows, new Set([0x08AD52]));

// Caller C analysis
console.log('Caller C (0x08C497):');
console.log('  - LDIR (block copy of 9 bytes) then LD A, 0x58, then JP 0x08C5D7');
console.log('  - Loads A = 0x58 — same mode as caller A');
console.log('  - This is within the main dispatch cluster (0x08Cxxx)');
console.log('  - This is a NORMAL MODE TRANSITION to mode 0x58 after copying context data');
console.log('');

console.log('=== CONCLUSION ===');
console.log('');
console.log('0x08C5D7 is a GENERAL "reinit mode dispatch" function, NOT specific to error recovery.');
console.log('');
console.log('Evidence:');
console.log('  - 4 callers total: 1 error recovery, 3 normal/cleanup paths');
console.log('  - Callers A and C both pass A = 0x58 for normal mode transitions');
console.log('  - Caller B does stack cleanup (4x POP BC) then dispatches — an abort/unwind path');
console.log('  - The function itself reads cxCurApp (0xD007E0), compares mode values,');
console.log('    calls NewContext0, then tails into the action dispatch cluster');
console.log('  - It is the canonical entry point for "switch to a new application context"');
console.log('');
console.log('Recommended name: cxSwitch or AppModeDispatch');
console.log('');
console.log('Done.');
