#!/usr/bin/env node

/**
 * Phase 305 Probe: Hunt for the REAL scan-code-to-class translation function
 *
 * Session 304 proved 0x069A8D is a 6-instruction side-effect orchestrator (17 callers),
 * NOT the scan-code-to-class dispatch. This probe investigates:
 *
 * 1. Four deeper sub-call candidates:
 *    - 0x0917BE (called from 0x08CA64, which 0x069A8D calls)
 *    - 0x07FF8D
 *    - 0x0846EA
 *    - 0x08267D (called from 0x09747C)
 *
 * 2. Upstream callers of 0x069A8D — what happens BEFORE the call?
 *
 * For each candidate: disassemble, detect CP cascades, table lookups, A modification,
 * and classify the function's role.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Candidates ──────────────────────────────────────────────────────────
const CANDIDATES = [
  { addr: 0x0917BE, label: '0x0917BE (from 0x08CA64 chain)' },
  { addr: 0x07FF8D, label: '0x07FF8D' },
  { addr: 0x0846EA, label: '0x0846EA' },
  { addr: 0x08267D, label: '0x08267D (from 0x09747C chain)' },
];

const MAIN_TARGET = 0x069A8D;

const SCAN_CODE_NAMES = {
  0x00: 'DOWN', 0x01: 'LEFT', 0x02: 'RIGHT', 0x03: 'UP',
  0x10: 'ENTER', 0x11: '+', 0x12: '-', 0x13: 'x', 0x14: '/',
  0x15: '^', 0x16: 'CLEAR',
  0x20: '(-)', 0x21: '3', 0x22: '6', 0x23: '9', 0x24: ')',
  0x25: 'TAN', 0x26: 'VARS',
  0x30: '.', 0x31: '2', 0x32: '5', 0x33: '8', 0x34: '(',
  0x35: 'COS', 0x36: 'PRGM', 0x37: 'STAT',
  0x40: '0', 0x41: '1', 0x42: '4', 0x43: '7', 0x44: ',',
  0x45: 'SIN', 0x46: 'APPS', 0x47: 'X,T,0,n',
  0x51: 'STO>', 0x52: 'LN', 0x53: 'LOG', 0x54: 'x^2',
  0x55: 'x^-1', 0x56: 'MATH', 0x57: 'ALPHA',
  0x60: 'GRAPH', 0x61: 'TRACE', 0x62: 'ZOOM', 0x63: 'WINDOW',
  0x64: 'Y=', 0x65: '2ND', 0x66: 'MODE', 0x67: 'DEL',
};

// ── Helpers ─────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, Math.min(addr + length, rom.length)))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function disasmAt(addr) {
  if (addr < 0 || addr >= rom.length) return null;
  try {
    return decodeInstruction(rom, addr, 'adl');
  } catch {
    return null;
  }
}

function formatInst(inst) {
  if (!inst) return '<decode error>';
  if (inst.dasm) return inst.dasm;

  switch (inst.tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ldir': return 'LDIR';
    case 'ei': return 'EI';
    case 'di': return 'DI';
    case 'nop': return 'NOP';
    case 'daa': return 'DAA';
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'cpir': return 'CPIR';
    case 'cpi': return 'CPI';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'lddr': return 'LDDR';
    case 'ldi': return 'LDI';
    case 'ldd': return 'LDD';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'halt': return 'HALT';
    case 'neg': return 'NEG';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'im': return `IM ${inst.mode}`;
    case 'out-imm': return `OUT (${hex(inst.port, 2)}), A`;
    case 'in-imm': return `IN A, (${hex(inst.port, 2)})`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'jp-hl': return 'JP (HL)';
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ld-indexed-reg':
      return `LD (${inst.indexRegister?.toUpperCase() ?? 'IX'}${formatDisp(inst.displacement ?? 0)}), ${inst.src?.toUpperCase() ?? '?'}`;
    case 'ld-reg-indexed':
      return `LD ${inst.dest?.toUpperCase() ?? '?'}, (${inst.indexRegister?.toUpperCase() ?? 'IX'}${formatDisp(inst.displacement ?? 0)})`;
    case 'ld-indexed-imm':
      return `LD (${inst.indexRegister?.toUpperCase() ?? 'IX'}${formatDisp(inst.displacement ?? 0)}), ${hex(inst.value ?? 0, 2)}`;
    default: return `[${inst.tag}]`;
  }
}

function disasmLinear(start, maxInstructions, options = {}) {
  const {
    stopOnUnconditionalReturn = true,
    stopOnUnconditionalJump = true,
    maxBytes = 0x800,
    followJumps = false,
  } = options;

  const lines = [];
  let pc = start;
  const end = start + maxBytes;
  const visited = new Set();

  while (pc < end && pc < rom.length && lines.length < maxInstructions) {
    if (visited.has(pc)) break;
    visited.add(pc);

    const inst = disasmAt(pc);
    if (!inst || !inst.length) {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }

    const line = { addr: pc, bytes: bytesAt(pc, inst.length), text: formatInst(inst), inst };
    lines.push(line);
    pc += inst.length;

    if (stopOnUnconditionalReturn && inst.tag === 'ret') break;
    if (stopOnUnconditionalJump && inst.tag === 'jp') {
      if (followJumps && inst.target >= start && inst.target < end) {
        pc = inst.target;
        continue;
      }
      break;
    }
  }

  return lines;
}

function detectTableLoads(lines) {
  return lines
    .filter((line) => line.inst?.tag === 'ld-pair-imm' && line.inst.value >= 0 && line.inst.value < rom.length)
    .map((line) => ({ at: line.addr, pair: line.inst.pair.toUpperCase(), tableAddr: line.inst.value }));
}

function detectCpCascade(lines) {
  return lines
    .filter((line) => line.inst?.tag === 'alu-imm' && line.inst.op === 'cp')
    .map((line) => ({ at: line.addr, value: line.inst.value }));
}

function detectCalls(lines) {
  return lines
    .filter((line) => line.inst?.tag === 'call' || line.inst?.tag === 'call-conditional')
    .map((line) => ({
      at: line.addr,
      target: line.inst.target,
      conditional: line.inst.tag === 'call-conditional',
      condition: line.inst.condition || null,
    }));
}

function writesA(inst) {
  if (!inst) return false;
  switch (inst.tag) {
    case 'ld-reg-imm': case 'ld-reg-reg': case 'ld-reg-mem': case 'ld-reg-ind':
    case 'ld-reg-indexed':
      return (inst.dest || '').toLowerCase() === 'a';
    case 'inc-reg': case 'dec-reg':
      return (inst.reg || '').toLowerCase() === 'a';
    case 'alu-reg': case 'alu-imm':
      return inst.op !== 'cp';
    case 'rla': case 'rra': case 'rlca': case 'rrca':
    case 'cpl': case 'neg': case 'daa':
      return true;
    default:
      return false;
  }
}

function writesToRam(inst) {
  if (!inst) return false;
  switch (inst.tag) {
    case 'ld-mem-reg': case 'ld-mem-pair':
      return true;
    case 'ld-ind-reg':
      return true;
    case 'ld-indexed-reg': case 'ld-indexed-imm':
      return true;
    case 'ldir': case 'lddr': case 'ldi': case 'ldd':
      return true;
    default:
      return false;
  }
}

function findDirectCalls(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];
  for (let addr = 0; addr <= rom.length - 4; addr++) {
    // CALL nn = 0xCD nn; CALL cc, nn = 0xC4/0xCC/0xD4/0xDC/0xE4/0xEC/0xF4/0xFC nn
    if (rom[addr + 1] === lo && rom[addr + 2] === mid && rom[addr + 3] === hi) {
      const opcode = rom[addr];
      if (opcode === 0xCD ||
          opcode === 0xC4 || opcode === 0xCC ||
          opcode === 0xD4 || opcode === 0xDC ||
          opcode === 0xE4 || opcode === 0xEC ||
          opcode === 0xF4 || opcode === 0xFC) {
        hits.push(addr);
      }
    }
  }
  return hits;
}

function dumpTable(tableAddr, length = 256) {
  console.log(`  Dumping ${Math.min(length, rom.length - tableAddr)} bytes from ${hex(tableAddr)}:`);
  for (let row = 0; row < length && tableAddr + row < rom.length; row += 16) {
    const addr = tableAddr + row;
    const width = Math.min(16, length - row, rom.length - addr);
    console.log(`    ${hex(addr)}  ${bytesAt(addr, width)}`);
  }

  const nonZero = [];
  for (let scanCode = 0; scanCode < length && tableAddr + scanCode < rom.length; scanCode++) {
    const value = rom[tableAddr + scanCode];
    if (value !== 0) {
      nonZero.push({ scanCode, value, name: SCAN_CODE_NAMES[scanCode] || '???' });
    }
  }

  if (!nonZero.length) {
    console.log('  All scanned entries are zero.');
    return;
  }

  console.log(`  Non-zero entries (${nonZero.length} total):`);
  for (const entry of nonZero) {
    console.log(`    ${hex(entry.scanCode, 2)} -> ${hex(entry.value, 2)}  [${entry.name}]`);
  }
}

function printSection(title) {
  const line = '='.repeat(88);
  console.log(`\n${line}`);
  console.log(title);
  console.log(line);
}

function printSubSection(title) {
  console.log(`\n--- ${title} ---`);
}

function printDisasm(lines) {
  for (const line of lines) {
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}`);
  }
}

function classifyFunction(lines, label) {
  const cpCascade = detectCpCascade(lines);
  const tableLoads = detectTableLoads(lines);
  const calls = detectCalls(lines);
  const aWritten = lines.some((l) => writesA(l.inst));
  const ramWrites = lines.filter((l) => writesToRam(l.inst));
  const hasComputedJump = lines.some((l) => l.inst?.tag === 'jp-hl');
  const hasCpir = lines.some((l) => l.inst?.tag === 'cpir');
  const hasDjnz = lines.some((l) => l.inst?.tag === 'djnz');

  console.log(`\n  Analysis for ${label}:`);
  console.log(`    Instructions:        ${lines.length}`);
  console.log(`    Writes to A:         ${aWritten ? 'YES' : 'no'}`);
  console.log(`    RAM writes:          ${ramWrites.length}`);
  console.log(`    CP-imm comparisons:  ${cpCascade.length}`);
  console.log(`    Table loads (ROM):   ${tableLoads.length}`);
  console.log(`    CALL instructions:   ${calls.length}`);
  console.log(`    JP (HL):             ${hasComputedJump ? 'YES' : 'no'}`);
  console.log(`    CPIR:                ${hasCpir ? 'YES' : 'no'}`);
  console.log(`    DJNZ:                ${hasDjnz ? 'YES' : 'no'}`);

  if (cpCascade.length > 0) {
    console.log(`    CP values:`);
    for (const cp of cpCascade) {
      const name = SCAN_CODE_NAMES[cp.value] || '';
      console.log(`      ${hex(cp.at)}: CP ${hex(cp.value, 2)}${name ? '  (' + name + ')' : ''}`);
    }
  }

  if (tableLoads.length > 0) {
    console.log(`    Table addresses:`);
    for (const t of tableLoads) {
      console.log(`      ${hex(t.at)}: LD ${t.pair}, ${hex(t.tableAddr)}`);
    }
  }

  if (calls.length > 0) {
    console.log(`    Call targets:`);
    for (const c of calls) {
      const cond = c.conditional ? ` ${c.condition.toUpperCase()},` : '';
      console.log(`      ${hex(c.at)}: CALL${cond} ${hex(c.target)}`);
    }
  }

  // Classification
  let classification;
  if (cpCascade.length >= 3) {
    classification = 'HAS CP CASCADE';
  } else if (tableLoads.length > 0 && (hasComputedJump || aWritten)) {
    classification = 'HAS TABLE LOOKUP';
  } else if (tableLoads.length > 0) {
    classification = 'HAS TABLE LOOKUP';
  } else if (!aWritten && ramWrites.length <= 2 && calls.length <= 2) {
    classification = 'IDENTITY/PASSTHROUGH';
  } else if (ramWrites.length > 2 && cpCascade.length === 0 && tableLoads.length === 0) {
    classification = 'SIDE EFFECTS ONLY';
  } else {
    classification = 'UNCLEAR — needs deeper trace';
  }

  console.log(`\n    >>> CLASSIFICATION: ${classification}`);

  return { cpCascade, tableLoads, calls, aWritten, ramWrites: ramWrites.length, classification };
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 1: Disassemble and classify each candidate
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 1: Candidate function analysis');

const candidateResults = [];

for (const candidate of CANDIDATES) {
  printSubSection(candidate.label);

  // First pass: linear disasm up to 200 instructions or unconditional RET/JP
  const lines = disasmLinear(candidate.addr, 200, {
    stopOnUnconditionalReturn: true,
    stopOnUnconditionalJump: false,  // follow through to see more
    maxBytes: 0x400,
    followJumps: true,
  });

  console.log(`  Disassembly (${lines.length} instructions):\n`);
  printDisasm(lines);

  const result = classifyFunction(lines, candidate.label);
  candidateResults.push({ ...candidate, ...result });

  // If table loads found, dump the tables
  if (result.tableLoads.length > 0) {
    console.log('\n  Table contents:');
    for (const t of result.tableLoads) {
      dumpTable(t.tableAddr, 128);
    }
  }

  // If this function calls others, recursively disasm one level deep
  if (result.calls.length > 0 && result.calls.length <= 6) {
    console.log('\n  Sub-call disassembly (1 level deep):');
    for (const c of result.calls) {
      const subLines = disasmLinear(c.target, 80, {
        stopOnUnconditionalReturn: true,
        stopOnUnconditionalJump: true,
        maxBytes: 0x200,
      });
      printSubSection(`Sub-call ${hex(c.target)} (from ${hex(c.at)})`);
      console.log(`  ${subLines.length} instructions:\n`);
      printDisasm(subLines);

      const subResult = classifyFunction(subLines, `sub-call ${hex(c.target)}`);

      // If this sub-call has table loads, dump them
      if (subResult.tableLoads.length > 0) {
        console.log('\n  Sub-call table contents:');
        for (const t of subResult.tableLoads) {
          dumpTable(t.tableAddr, 128);
        }
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 2: Also trace the chain from 0x069A8D -> 0x08CA64
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 2: 0x08CA64 (first call from 0x069A8D) — full disassembly');

const chain08CA64 = disasmLinear(0x08CA64, 200, {
  stopOnUnconditionalReturn: true,
  stopOnUnconditionalJump: false,
  maxBytes: 0x400,
  followJumps: true,
});

console.log(`  Disassembly (${chain08CA64.length} instructions):\n`);
printDisasm(chain08CA64);
classifyFunction(chain08CA64, '0x08CA64');

// ════════════════════════════════════════════════════════════════════════
// SECTION 3: Upstream callers of 0x069A8D — what loads A before the call?
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 3: Upstream callers of 0x069A8D — context before the call');

const callers = findDirectCalls(MAIN_TARGET);
console.log(`Found ${callers.length} direct CALL sites for ${hex(MAIN_TARGET)}\n`);

// For each caller, look backwards to see what loads A or does CP before the call
const callerContexts = [];

for (const callAddr of callers) {
  // Disassemble ~20 instructions before the call site
  // We need to find the start of the basic block containing this call.
  // Heuristic: scan backwards to find a plausible function start.
  const lookbackStart = Math.max(0, callAddr - 40);
  const contextLines = disasmLinear(lookbackStart, 30, {
    stopOnUnconditionalReturn: false,
    stopOnUnconditionalJump: false,
    maxBytes: callAddr - lookbackStart + 4,
  });

  // Find what sets A just before the call
  let aSource = 'UNKNOWN';
  let cpBeforeCall = [];
  let tableLoadBeforeCall = [];

  for (const line of contextLines) {
    if (line.addr >= callAddr) break;

    if (writesA(line.inst)) {
      if (line.inst.tag === 'ld-reg-mem') {
        aSource = `LD A, (${hex(line.inst.addr)})  at ${hex(line.addr)}`;
      } else if (line.inst.tag === 'ld-reg-imm' && (line.inst.dest || '').toLowerCase() === 'a') {
        aSource = `LD A, ${hex(line.inst.value, 2)}  at ${hex(line.addr)}`;
      } else if (line.inst.tag === 'ld-reg-ind') {
        aSource = `LD A, (${line.inst.src?.toUpperCase()})  at ${hex(line.addr)}`;
      } else if (line.inst.tag === 'ld-reg-indexed') {
        aSource = `LD A, (${line.inst.indexRegister?.toUpperCase()}${formatDisp(line.inst.displacement ?? 0)})  at ${hex(line.addr)}`;
      } else if (line.inst.tag === 'alu-reg' || line.inst.tag === 'alu-imm') {
        aSource = `${line.inst.op?.toUpperCase()} ...  at ${hex(line.addr)}`;
      } else {
        aSource = `${line.text}  at ${hex(line.addr)}`;
      }
    }

    if (line.inst?.tag === 'alu-imm' && line.inst.op === 'cp') {
      cpBeforeCall.push({ at: line.addr, value: line.inst.value });
    }

    if (line.inst?.tag === 'ld-pair-imm' && line.inst.value >= 0 && line.inst.value < rom.length) {
      tableLoadBeforeCall.push({ at: line.addr, pair: line.inst.pair, tableAddr: line.inst.value });
    }
  }

  const opcode = rom[callAddr];
  const condFlag = opcode !== 0xCD;

  console.log(`  Caller at ${hex(callAddr)}${condFlag ? ' (conditional)' : ''}:`);
  console.log(`    A loaded from: ${aSource}`);
  if (cpBeforeCall.length > 0) {
    console.log(`    CP before call: ${cpBeforeCall.map((c) => hex(c.value, 2)).join(', ')}`);
  }
  if (tableLoadBeforeCall.length > 0) {
    console.log(`    Table loads before call: ${tableLoadBeforeCall.map((t) => `${t.pair} <- ${hex(t.tableAddr)}`).join(', ')}`);
  }

  // Print the context
  console.log(`    Context:`);
  for (const line of contextLines) {
    const mark = line.addr === callAddr ? '  <<<' : '';
    console.log(`      ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${mark}`);
  }
  console.log('');

  callerContexts.push({ callAddr, aSource, cpBeforeCall, tableLoadBeforeCall, condFlag });
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 4: Also check 0x09747C which calls 0x08267D
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 4: 0x09747C (calls 0x08267D) — full disassembly');

const chain09747C = disasmLinear(0x09747C, 200, {
  stopOnUnconditionalReturn: true,
  stopOnUnconditionalJump: false,
  maxBytes: 0x400,
  followJumps: true,
});

console.log(`  Disassembly (${chain09747C.length} instructions):\n`);
printDisasm(chain09747C);
classifyFunction(chain09747C, '0x09747C');

// ════════════════════════════════════════════════════════════════════════
// SECTION 5: Summary and verdict
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 5: Summary and verdict');

console.log('\nCandidate classifications:\n');
for (const r of candidateResults) {
  console.log(`  ${r.label.padEnd(45)} => ${r.classification}`);
  console.log(`    (${r.cpCascade.length} CPs, ${r.tableLoads.length} table loads, ${r.ramWrites} RAM writes, A written: ${r.aWritten})`);
}

console.log('\nCaller A-source patterns:\n');
const aSourceCounts = {};
for (const ctx of callerContexts) {
  const key = ctx.aSource.replace(/at 0x[0-9A-F]+/g, 'at ...');
  aSourceCounts[key] = (aSourceCounts[key] || 0) + 1;
}
for (const [pattern, count] of Object.entries(aSourceCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count}x  ${pattern}`);
}

// Identify the best candidate
const bestCp = candidateResults.filter((r) => r.classification === 'HAS CP CASCADE');
const bestTable = candidateResults.filter((r) => r.classification === 'HAS TABLE LOOKUP');

console.log('\n--- VERDICT ---');
if (bestCp.length > 0) {
  console.log(`\nBest CP-cascade candidate(s): ${bestCp.map((r) => r.label).join(', ')}`);
  for (const r of bestCp) {
    console.log(`  CP values: ${r.cpCascade.map((c) => hex(c.value, 2)).join(', ')}`);
  }
}
if (bestTable.length > 0) {
  console.log(`\nBest table-lookup candidate(s): ${bestTable.map((r) => r.label).join(', ')}`);
  for (const r of bestTable) {
    console.log(`  Table addresses: ${r.tableLoads.map((t) => hex(t.tableAddr)).join(', ')}`);
  }
}

if (bestCp.length === 0 && bestTable.length === 0) {
  console.log('\nNo clear CP-cascade or table-lookup found in the 4 candidates.');
  console.log('The scan-code-to-class translation may be:');
  console.log('  (a) deeper in the call chain (sub-sub-calls)');
  console.log('  (b) done by callers of 0x069A8D before the call');
  console.log('  (c) done via RAM lookup (IY-indexed) rather than ROM table');
}

printSection('END OF PROBE');

/*
=== OUTPUT (2026-05-12) ===

SECTION 1: Candidate function analysis

--- 0x0917BE (from 0x08CA64 chain) ---
  17 instructions. Loads HL=0xD01107, DE=0xD0231A, calls 0x07F97E (6x LDI = memcpy),
  then calls 0x091B13, 0x091D4D, 0x0918DD. No CP cascade. No A modification.
  LD DE, 0x000002 is a small constant, NOT a table base.
  >>> CLASSIFICATION: HAS TABLE LOOKUP (false positive — 0x000002 is a constant, not a table)
  CORRECTED: SIDE EFFECTS ONLY — memory copy / edit-line bookkeeping

--- 0x07FF8D ---
  7 instructions:
    LD HL, 0x000040    (small constant, NOT a scan-code table)
    LD A, 0x03
    JR 0x07FF87        (jumps backward — this is a shared tail)
    LD HL, 0x002A01    (also a small constant or RAM pointer)
    CALL 0x04C940
    LD (0xD005F9), HL  (stores result)
    RET
  >>> CLASSIFICATION: HAS TABLE LOOKUP (false positive — 0x000040 is a constant)
  CORRECTED: UNCLEAR — sets A=3 and jumps to shared code at 0x07FF87.
             Writes to D005F9 (cursor/token state). NOT a scan-code classifier.

--- 0x0846EA ---
  49 instructions. Complex function:
    CALL 0x08011F, JP Z to 0x083833
    LD DE, (0xD0259D), LD A, (0xD005F9)
    CP 0x24  — compares against ')' token
    Walks a linked list (HL pointer chain with stride 3): LD BC, 0x000003
    Compares bytes at D005F9/D005FA/D005FB against list entries
    When match found: reads 3 bytes from list, CALL 0x04C885, writes to D005F8
  >>> CLASSIFICATION: HAS TABLE LOOKUP (false positive — 0x000003 is stride, not table base)
  CORRECTED: LINKED LIST SEARCH — walks edit buffer structures looking for token matches.
             NOT a scan-code-to-class function. This is token/cursor position lookup.

--- 0x08267D (from 0x09747C chain) ---
  151 instructions. Very complex editor function:
    CALL 0x0821AE, CALL NZ 0x03D1E4, CALL 0x08279E, CALL 0x08012D
    Many CALLs (26 total), walks edit buffer, manipulates D025xx state
    CP cascade at end (0x0827B1-0x0827BF): CP 0x24, CP 0x72, CP 0x3A, CP 0x01
    These compare against token type bytes, NOT scan codes
  >>> CLASSIFICATION: HAS CP CASCADE
  BUT: The CP cascade is in a sub-function (0x08279E) checking token types (0x24=), 0x72, 0x3A)
       NOT scan codes. This is the edit-line recalculation/delete handler.

SECTION 2: 0x08CA64 (first call from 0x069A8D) — 3 instructions
  CALL 0x0917BE
  RES 0, (IY+45)   — clears a flag
  RET
  >>> CLASSIFICATION: IDENTITY/PASSTHROUGH

SECTION 3: Upstream callers of 0x069A8D — 18 direct CALL sites

  Caller A-source patterns:
    9x  OR ...  (OR A or OR L — flag-setting, not scan code)
    4x  UNKNOWN
    1x  XOR 0x40
    1x  LD A, (0xD02685)
    1x  LD A, (HL)
    1x  LD A, 0x2E
    1x  LD A, 0x20

  KEY FINDING: Most callers set A via OR A (flag check) or load unrelated values.
  0x069A8D is NOT called with a scan code in A — it's called as a "refresh/recalculate"
  side-effect after editor state changes. The A register is irrelevant to its function.

SECTION 4: 0x09747C — 4 instructions
  CALL 0x07FF8D
  CALL 0x0846EA
  CALL NC, 0x08267D
  RET
  This is a sequential pipeline: set cursor state, search token list, recalculate editor.

SECTION 5: VERDICT

  None of the 4 candidates is the scan-code-to-class translation function.

  - 0x0917BE: memory copy / edit-line bookkeeping
  - 0x07FF8D: sets A=3 and cursor state in D005F9
  - 0x0846EA: linked-list token search in edit buffer
  - 0x08267D: edit-line recalculation with token-type CP cascade (not scan codes)

  The "table loads" flagged by the probe are all FALSE POSITIVES: small constants
  (0x000002, 0x000003, 0x000040) misidentified as ROM table addresses because they
  fall within the ROM address range. They are actually loop counters and stride values.

  0x069A8D -> 0x08CA64 -> 0x0917BE is an EDITOR REFRESH chain, not scan-code dispatch.
  The 18 callers of 0x069A8D confirm this: they call it after editor state mutations
  (insert, delete, cursor move) to trigger a display/buffer refresh.

  The REAL scan-code-to-class function must be looked for ELSEWHERE:
  (a) In the keyboard ISR / GetCSC path (0x0159C0, 0x0800A8 area)
  (b) In the event loop key handler that converts raw scan codes to tokens
  (c) Via the token descriptor table mapped in session 304

========================================================================================
*/
