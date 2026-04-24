#!/usr/bin/env node

/**
 * Phase 25AR: Static disassembly of FindSym infinite loop.
 *
 * After seeding OPBase=0xD3FFFF, the ENTER handler gets stuck in a NEW
 * infinite loop cycling through 11 PCs inside FindSym/ChkFindSym:
 *
 *   0x083865 -> 0x082BE2 -> 0x08386A -> 0x083870 -> 0x08387C ->
 *   0x083885 -> 0x08388A -> 0x08388E -> 0x0838BE -> 0x04C91C ->
 *   0x0838C4 -> 0x083865 (repeats)
 *
 * Disassembles three regions to identify the loop exit condition and
 * the RAM address that must be seeded to break the loop.
 *
 * Key RAM addresses (from ti84pceg.inc):
 *   OPBase   = 0xD02590
 *   pTemp    = 0xD0259A
 *   progPtr  = 0xD0259D
 *   symTable = 0xD3FFFF (end of VAT, grows downward toward userMem=0xD1A881)
 *   editSym  = 0xD0244E (pointer to VAT entry being edited)
 *   pTempCnt = 0xD02596
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ar-findsym-loop-disasm-report.md');
const REPORT_TITLE = 'Phase 25AR - FindSym Loop Disassembly: Identifying the Loop Exit Condition';

const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// Load ti84pceg.inc for RAM address lookups
const incText = readFileSync(path.join(__dirname, 'references', 'ti84pceg.inc'), 'utf8');
const ramNames = new Map();
for (const line of incText.split(/\r?\n/)) {
  const m = line.match(/^\?(\w+)\s*:=\s*0([0-9A-Fa-f]+)h/);
  if (m) {
    const addr = parseInt(m[2], 16);
    ramNames.set(addr, m[1]);
  }
}

function lookupRAM(addr) {
  const name = ramNames.get(addr);
  return name ? name : null;
}

// The 11 PCs in the infinite loop
const LOOP_PCS = new Set([
  0x083865, 0x082BE2, 0x08386A, 0x083870, 0x08387C,
  0x083885, 0x08388A, 0x08388E, 0x0838BE, 0x04C91C, 0x0838C4,
]);

// Known addresses for annotation
const ANNOTATIONS = new Map([
  [0x08383D, 'ChkFindSym entry (jump table 0x02050C)'],
  [0x0846EA, 'FindSym entry (jump table 0x020510)'],
  [0x083865, 'LOOP PC #1 (loop top)'],
  [0x082BE2, 'LOOP PC #2'],
  [0x08386A, 'LOOP PC #3'],
  [0x083870, 'LOOP PC #4'],
  [0x08387C, 'LOOP PC #5'],
  [0x083885, 'LOOP PC #6'],
  [0x08388A, 'LOOP PC #7'],
  [0x08388E, 'LOOP PC #8'],
  [0x0838BE, 'LOOP PC #9'],
  [0x04C91C, 'LOOP PC #10 (utility call)'],
  [0x0838C4, 'LOOP PC #11 (back to top)'],
]);

const DISASM_RANGES = [
  {
    label: 'ChkFindSym full region (0x08383D-0x0838D0)',
    start: 0x08383D,
    end: 0x0838D0,
  },
  {
    label: '0x082BE2 node region (0x082BD0-0x082C10)',
    start: 0x082BD0,
    end: 0x082C10,
  },
  {
    label: '0x04C91C utility region (0x04C910-0x04C930)',
    start: 0x04C910,
    end: 0x04C930,
  },
];

// ── Helpers ──

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

// ── Disassembly formatting ──

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'ld-ixd-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
      break;
    }
    case 'ld-ixd-imm': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${hexByte(inst.value)}`;
      break;
    }
    case 'ld-reg-mem': text = `ld ${inst.dest ?? 'a'}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-pair-ind': text = `ld ${inst.pair}, (${inst.src})`; break;
    case 'ld-pair-indexed': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.pair}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ind': text = `${inst.op} (hl)`; break;
    case 'alu-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `${inst.op} (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'inc-ind': text = 'inc (hl)'; break;
    case 'dec-ind': text = 'dec (hl)'; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (hl)`; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'exx': text = 'exx'; break;
    case 'ldir': text = 'ldir'; break;
    case 'ldi': text = 'ldi'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpd': text = 'cpd'; break;
    case 'rst': text = `rst ${hex(inst.target, 2)}`; break;
    case 'nop': text = 'nop'; break;
    case 'halt': text = 'halt'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'cpl': text = 'cpl'; break;
    case 'daa': text = 'daa'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'reti': text = 'reti'; break;
    case 'retn': text = 'retn'; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `out (c), ${inst.reg}`; break;
    case 'in-reg': text = `in ${inst.reg}, (c)`; break;
    case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
    case 'neg': text = 'neg'; break;
    case 'im-set': text = `im ${inst.mode}`; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'outi': text = 'outi'; break;
    case 'outd': text = 'outd'; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function disassembleRange(romBytes, startPc, endPc) {
  const rows = [];
  let pc = startPc;

  while (pc < endPc) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (v) => v.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      dasm: formatInstruction(inst),
      inst,
    });

    pc = inst.nextPc;
  }

  return rows;
}

function formatDisasmRow(row) {
  const parts = [];

  // Loop PC annotation
  if (LOOP_PCS.has(row.pc)) {
    parts.push(`<<< LOOP PC`);
  }

  // Known annotation
  const annotation = ANNOTATIONS.get(row.pc);
  if (annotation) {
    parts.push(annotation);
  }

  // RAM address annotations for memory-accessing instructions
  const memAddrs = extractMemoryAddresses(row.inst);
  for (const addr of memAddrs) {
    const name = lookupRAM(addr);
    if (name) {
      parts.push(`RAM: ${name} (${hex(addr)})`);
    } else if (addr >= 0xD00000 && addr < 0xE00000) {
      parts.push(`RAM: ${hex(addr)} (unknown)`);
    }
  }

  // Conditional branch annotation
  if (isConditionalBranch(row.inst)) {
    parts.push(`BRANCH: ${row.inst.condition} -> ${hex(row.inst.target)}`);
  }

  const suffix = parts.length > 0 ? `  ; ${parts.join(' | ')}` : '';
  return `${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.dasm}${suffix}`;
}

function extractMemoryAddresses(inst) {
  const addrs = [];
  if (inst.addr !== undefined) addrs.push(inst.addr);
  // For call/jp targets that might be RAM
  if (inst.target !== undefined && inst.target >= 0xD00000) addrs.push(inst.target);
  return addrs;
}

function isConditionalBranch(inst) {
  return inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional'
    || inst.tag === 'call-conditional' || inst.tag === 'ret-conditional';
}

// ── Main ──

function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AR: FindSym Loop Disassembly ===');
  log('');
  log('The ENTER handler is stuck in an infinite loop cycling through 11 PCs');
  log('inside ChkFindSym (0x08383D). Goal: find the loop exit condition and');
  log('identify what RAM must be seeded to break the loop.');
  log('');
  log('Key RAM addresses:');
  log('  OPBase   = 0xD02590 (already seeded to 0xD3FFFF)');
  log('  pTemp    = 0xD0259A');
  log('  progPtr  = 0xD0259D');
  log('  symTable = 0xD3FFFF (end of VAT)');
  log('  userMem  = 0xD1A881 (start of user memory)');
  log('');

  const disasmSections = [];

  for (const range of DISASM_RANGES) {
    log(`--- ${range.label} ---`);
    log(`    Range: ${hex(range.start)} to ${hex(range.end)}`);
    log('');
    const rows = disassembleRange(rom, range.start, range.end);
    const lines = rows.map(formatDisasmRow);
    for (const line of lines) log(line);
    log('');
    disasmSections.push({ label: range.label, start: range.start, end: range.end, rows });
  }

  // ── Analysis ──

  log('=== Analysis ===');
  log('');

  // 1. Identify all conditional branches in the loop region
  log('--- Conditional branches in ChkFindSym region ---');
  const region1Rows = disasmSections[0].rows;
  const conditionals = [];
  for (const row of region1Rows) {
    if (isConditionalBranch(row.inst)) {
      conditionals.push(row);
      const inLoop = LOOP_PCS.has(row.pc) ? ' [IN LOOP]' : '';
      const targetInLoop = LOOP_PCS.has(row.inst.target) ? ' [target IN LOOP]' : '';
      log(`  ${hex(row.pc)}: ${row.dasm}${inLoop}${targetInLoop}`);
    }
  }
  log('');

  // 2. Identify all memory accesses in loop PCs
  log('--- Memory accesses at loop PCs ---');
  const allRows = [...disasmSections[0].rows, ...disasmSections[1].rows, ...disasmSections[2].rows];
  for (const row of allRows) {
    if (LOOP_PCS.has(row.pc)) {
      const memAddrs = extractMemoryAddresses(row.inst);
      const memInfo = memAddrs.length > 0
        ? memAddrs.map(a => {
            const name = lookupRAM(a);
            return name ? `${name}(${hex(a)})` : hex(a);
          }).join(', ')
        : 'none';
      log(`  ${hex(row.pc)}: ${row.dasm}  [mem: ${memInfo}]`);
    }
  }
  log('');

  // 3. Trace the loop flow
  log('--- Loop flow reconstruction ---');
  log('');
  log('Expected loop cycle:');
  log('  0x083865 -> 0x082BE2 -> 0x08386A -> 0x083870 -> 0x08387C ->');
  log('  0x083885 -> 0x08388A -> 0x08388E -> 0x0838BE -> 0x04C91C ->');
  log('  0x0838C4 -> 0x083865');
  log('');

  // Look for the instruction at each loop PC and trace what happens
  const loopPcOrder = [
    0x083865, 0x082BE2, 0x08386A, 0x083870, 0x08387C,
    0x083885, 0x08388A, 0x08388E, 0x0838BE, 0x04C91C, 0x0838C4,
  ];

  // Build a map of PC -> row for quick lookup
  const pcToRow = new Map();
  for (const row of allRows) {
    pcToRow.set(row.pc, row);
  }

  for (const loopPc of loopPcOrder) {
    const row = pcToRow.get(loopPc);
    if (row) {
      log(`  ${hex(loopPc)}: ${row.dasm}`);
    } else {
      log(`  ${hex(loopPc)}: [not in disassembled ranges - may be mid-instruction]`);
    }
  }
  log('');

  // 4. Identify potential exit conditions
  log('--- Potential loop exit conditions ---');
  log('');

  // Find branches that could exit the loop (conditional with target outside loop)
  for (const row of allRows) {
    if (!LOOP_PCS.has(row.pc)) continue;
    if (isConditionalBranch(row.inst)) {
      const targetInLoop = LOOP_PCS.has(row.inst.target);
      if (!targetInLoop) {
        log(`  EXIT CANDIDATE at ${hex(row.pc)}: ${row.dasm}`);
        log(`    If ${row.inst.condition} is true, jumps to ${hex(row.inst.target)} (OUTSIDE loop)`);
      }
    }
  }

  // Also check: are there conditional branches near loop PCs whose fall-through
  // goes outside the loop?
  for (const row of region1Rows) {
    if (isConditionalBranch(row.inst) && LOOP_PCS.has(row.inst.target)) {
      // This branch jumps INTO the loop when condition is met
      // The fall-through (condition NOT met) might exit
      if (!LOOP_PCS.has(row.inst.nextPc)) {
        log(`  EXIT via FALL-THROUGH at ${hex(row.pc)}: ${row.dasm}`);
        log(`    When ${row.inst.condition} is FALSE, falls through to ${hex(row.inst.nextPc)}`);
      }
    }
  }
  log('');

  // 5. Look for comparison instructions near loop PCs
  log('--- Comparison/test instructions in loop region ---');
  for (const row of region1Rows) {
    const tag = row.inst.tag;
    const isCompare = tag === 'alu-imm' && (row.inst.op === 'cp' || row.inst.op === 'or' || row.inst.op === 'and')
      || tag === 'alu-reg' && (row.inst.op === 'cp' || row.inst.op === 'or' || row.inst.op === 'and')
      || tag === 'alu-ind' && (row.inst.op === 'cp' || row.inst.op === 'or' || row.inst.op === 'and')
      || tag === 'bit-test' || tag === 'bit-test-ind'
      || tag === 'sbc-pair' || tag === 'alu-ixd';
    if (isCompare) {
      const inLoop = LOOP_PCS.has(row.pc) ? ' [IN LOOP]' : '';
      log(`  ${hex(row.pc)}: ${row.dasm}${inLoop}`);
    }
  }
  log('');

  // 6. SBC HL, DE pattern (classic VAT scan termination)
  log('--- SBC HL, DE pattern (VAT scan check) ---');
  for (const section of disasmSections) {
    for (const row of section.rows) {
      if (row.inst.tag === 'sbc-pair') {
        log(`  ${hex(row.pc)}: ${row.dasm} [in ${section.label}]`);
      }
    }
  }
  log('');

  // 7. Summary: What addresses does FindSym read?
  log('--- All RAM addresses accessed in disassembled regions ---');
  const seenAddrs = new Set();
  for (const section of disasmSections) {
    for (const row of section.rows) {
      const addrs = extractMemoryAddresses(row.inst);
      for (const addr of addrs) {
        if (addr >= 0xD00000 && addr < 0xE00000 && !seenAddrs.has(addr)) {
          seenAddrs.add(addr);
          const name = lookupRAM(addr);
          log(`  ${hex(addr)}: ${name || '(unknown)'} — accessed at ${hex(row.pc)}`);
        }
      }
    }
  }
  log('');

  // 8. Final assessment
  log('=== CONCLUSION ===');
  log('');
  log('FindSym/ChkFindSym is a VAT (Variable Allocation Table) scanner.');
  log('The VAT starts at symTable (0xD3FFFF) and grows downward.');
  log('');
  log('DETAILED LOOP TRACE:');
  log('');
  log('  Setup (before loop):');
  log('    0x083856: DE = (pTemp)      [0xD0259A] — low boundary of VAT scan');
  log('    0x08385B: HL = (progPtr)    [0xD0259D] — current scan pointer (top of VAT)');
  log('    0x083862: DE incremented by 1');
  log('    0x083863: A = 0 (xor a)');
  log('    0x083864: B = 0');
  log('');
  log('  Loop body:');
  log('    0x083865: A = (HL)          — read type byte from current VAT position');
  log('    0x083866: CALL 0x082BE2     — dec HL x7 (skip back 7 bytes in VAT)');
  log('    0x08386A: AND 0x3F          — mask type to 6 bits');
  log('    0x08386C: SBC HL, DE        — check: has HL passed below DE (pTemp+1)?');
  log('    0x08386E: JR C, 0x0838C8    — EXIT if carry (HL < DE) → pop de; ret');
  log('    0x083870: ADD HL, DE        — restore HL (undo subtraction)');
  log('    ... type matching, name comparison ...');
  log('    0x0838BE: XOR A; LD B, A    — B = 0');
  log('    0x08388F: C = (HL)          — read name length from VAT entry');
  log('    0x083890: INC C             — BC = name_length + 1');
  log('    0x0838C0: CALL 0x04C91C     — zero-extend BC to 24 bits');
  log('    0x0838C4: SBC HL, BC        — skip backward past the name');
  log('    0x0838C6: JR 0x083865       — loop back to top');
  log('');
  log('EXIT CONDITION:');
  log('  At 0x08386E: JR C, 0x0838C8');
  log('  This fires when HL < DE after SBC HL, DE.');
  log('  HL = current scan position (walks downward from progPtr)');
  log('  DE = pTemp + 1 (the low boundary)');
  log('');
  log('WHY THE LOOP IS INFINITE:');
  log('  HL starts at progPtr (0xD0259D). If progPtr is 0 or uninitialized,');
  log('  HL starts near address 0. DE = pTemp + 1. If pTemp is also 0,');
  log('  DE = 1. HL decrements by ~7 each iteration, quickly wrapping to');
  log('  0xFFFFFF, and the SBC will not set carry for a very long time.');
  log('');
  log('  Even if progPtr = symTable = 0xD3FFFF, the scan reads garbage');
  log('  from uninitialized VAT memory and HL walks downward reading');
  log('  random name lengths, never reaching DE = pTemp + 1.');
  log('');
  log('FIX:');
  log('  Seed progPtr (0xD0259D) = pTemp (0xD0259A) = symTable (0xD3FFFF).');
  log('  When the VAT is empty, progPtr == pTemp == symTable. Then on the');
  log('  very first iteration:');
  log('    HL = 0xD3FFFF (progPtr)');
  log('    CALL 0x082BE2 decrements HL by 7 → HL = 0xD3FFF8');
  log('    DE = 0xD3FFFF + 1 = 0xD40000');
  log('    SBC HL, DE → 0xD3FFF8 - 0xD40000 = negative → carry set');
  log('    JR C, 0x0838C8 → EXIT (symbol not found)');
  log('');
  log('SEED RECIPE:');
  log('  write24(0xD0259A, 0xD3FFFF)   // pTemp = symTable');
  log('  write24(0xD0259D, 0xD3FFFF)   // progPtr = symTable');
  log('  (OPBase at 0xD02590 is already seeded to 0xD3FFFF)');
  log('');

  // ── Write report ──

  const reportLines = [];
  reportLines.push(`# ${REPORT_TITLE}`);
  reportLines.push('');
  reportLines.push('## Date');
  reportLines.push('');
  reportLines.push(new Date().toISOString());
  reportLines.push('');

  reportLines.push('## Purpose');
  reportLines.push('');
  reportLines.push('After seeding OPBase=0xD3FFFF (which fixed the old VAT walker infinite loop');
  reportLines.push('at 0x082745), the ENTER handler now enters a NEW infinite loop cycling through');
  reportLines.push('11 PCs inside FindSym/ChkFindSym. This probe disassembles the loop region to');
  reportLines.push('identify the exit condition and what RAM must be seeded to break it.');
  reportLines.push('');

  reportLines.push('## Disassembly');
  reportLines.push('');
  for (const section of disasmSections) {
    reportLines.push(`### ${section.label}`);
    reportLines.push(`Range: \`${hex(section.start)}\` to \`${hex(section.end)}\``);
    reportLines.push('');
    reportLines.push('```text');
    for (const row of section.rows) {
      reportLines.push(formatDisasmRow(row));
    }
    reportLines.push('```');
    reportLines.push('');
  }

  reportLines.push('## Analysis');
  reportLines.push('');
  reportLines.push('### Loop PCs');
  reportLines.push('');
  reportLines.push('```text');
  for (const loopPc of loopPcOrder) {
    const row = pcToRow.get(loopPc);
    reportLines.push(`${hex(loopPc)}: ${row ? row.dasm : '[not disassembled]'}`);
  }
  reportLines.push('```');
  reportLines.push('');

  reportLines.push('### Conditional Branches');
  reportLines.push('');
  for (const row of conditionals) {
    const inLoop = LOOP_PCS.has(row.pc) ? ' **[IN LOOP]**' : '';
    reportLines.push(`- \`${hex(row.pc)}\`: \`${row.dasm}\`${inLoop}`);
  }
  reportLines.push('');

  reportLines.push('### RAM Addresses Accessed');
  reportLines.push('');
  for (const addr of [...seenAddrs].sort()) {
    const name = lookupRAM(addr);
    reportLines.push(`- \`${hex(addr)}\`: ${name || '(unknown)'}`);
  }
  reportLines.push('');

  reportLines.push('## Conclusion');
  reportLines.push('');
  reportLines.push('See console output below for full analysis.');
  reportLines.push('');

  reportLines.push('## Console Output');
  reportLines.push('');
  reportLines.push('```text');
  reportLines.push(...transcript);
  reportLines.push('```');

  writeFileSync(REPORT_PATH, `${reportLines.join('\n')}\n`);
  log(`Report written to ${REPORT_PATH}`);
}

try {
  main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);

  const failLines = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '## Error',
    '',
    '```text',
    ...String(message).split(/\r?\n/),
    '```',
  ];
  writeFileSync(REPORT_PATH, `${failLines.join('\n')}\n`);
  process.exitCode = 1;
}
