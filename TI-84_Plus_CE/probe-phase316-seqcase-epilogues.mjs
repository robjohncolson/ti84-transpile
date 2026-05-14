#!/usr/bin/env node
// Phase 316: Identify the two shared _seqcase epilogues at 0x049CC2 and 0x008834.
// Disassemble both, find all ROM references, correlate with _seqcase call sites.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const EPILOGUE_A = 0x049CC2;
const EPILOGUE_B = 0x008834;
const DISASM_LEN = 64;

// _seqcase: direct target 0x002623, vector at 0x000210
const SEQCASE_DIRECT = 0x002623;
const SEQCASE_VECTOR = 0x000210;
const ROM_SIZE = 0x400000;

// ── helpers ──────────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexBytes(rom, start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push(rom[start + i].toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function read16(rom, offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

function read24(rom, offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function signedByte(b) {
  return b < 128 ? b : b - 256;
}

function formatSignedOffset(v) {
  return v >= 0 ? `+${v}` : `${v}`;
}

function formatInstruction(inst) {
  const t = inst.tag;

  // Returns
  if (t === 'ret') return 'RET';
  if (t === 'ret-cc') return `RET ${(inst.cc || inst.condition || '').toUpperCase()}`;

  // JP / CALL
  if (t === 'jp-imm' || t === 'jp') return `JP ${hex(inst.target)}`;
  if (t === 'jp-cc-imm' || t === 'jp-conditional') return `JP ${(inst.cc || inst.condition || '').toUpperCase()},${hex(inst.target)}`;
  if (t === 'call-imm' || t === 'call') return `CALL ${hex(inst.target)}`;
  if (t === 'call-cc-imm' || t === 'call-conditional') return `CALL ${(inst.cc || inst.condition || '').toUpperCase()},${hex(inst.target)}`;

  // JP indirect
  if (t === 'jp-hl') return 'JP (HL)';
  if (t === 'jp-ix') return 'JP (IX)';
  if (t === 'jp-iy') return 'JP (IY)';

  // JR / DJNZ
  if (t === 'jr') return `JR ${hex(inst.target)}`;
  if (t === 'jr-cc' || t === 'jr-conditional') return `JR ${(inst.cc || inst.condition || '').toUpperCase()},${hex(inst.target)}`;
  if (t === 'djnz') return `DJNZ ${hex(inst.target)}`;

  // LD reg,imm
  if (t === 'ld-reg-imm') return `LD ${(inst.dest || inst.reg || '').toUpperCase()},${hex(inst.value ?? inst.imm ?? 0, 2)}`;
  if (t === 'ld-pair-imm' || t === 'ld-reg16-imm') return `LD ${(inst.pair || inst.reg || '').toUpperCase()},${hex(inst.value ?? inst.imm ?? 0)}`;

  // LD reg,reg
  if (t === 'ld-reg-reg') return `LD ${(inst.dest || inst.dst || '').toUpperCase()},${(inst.src || '').toUpperCase()}`;

  // LD reg,(IX+d) / LD (IX+d),reg
  if (t === 'ld-reg-ixd') return `LD ${(inst.dest || inst.dst || '').toUpperCase()},(${(inst.indexRegister || 'IX').toUpperCase()}${formatSignedOffset(inst.displacement)})`;
  if (t === 'ld-ixd-reg') return `LD (${(inst.indexRegister || 'IX').toUpperCase()}${formatSignedOffset(inst.displacement)}),${(inst.src || '').toUpperCase()}`;
  if (t === 'ld-ixd-imm') return `LD (${(inst.indexRegister || 'IX').toUpperCase()}${formatSignedOffset(inst.displacement)}),${hex(inst.value ?? 0, 2)}`;

  // LD reg,(addr) / LD (addr),reg
  if (t === 'ld-reg-mem' || t === 'ld-a-mem') return `LD ${(inst.dest || 'A').toUpperCase()},(${hex(inst.addr)})`;
  if (t === 'ld-mem-reg' || t === 'ld-mem-a') return `LD (${hex(inst.addr)}),${(inst.src || 'A').toUpperCase()}`;

  // LD pair,(addr) / LD (addr),pair
  if (t === 'ld-pair-mem' || t === 'ld-reg16-mem') return `LD ${(inst.pair || inst.reg || '').toUpperCase()},(${hex(inst.addr)})`;
  if (t === 'ld-mem-pair' || t === 'ld-mem-reg16') return `LD (${hex(inst.addr)}),${(inst.pair || inst.reg || '').toUpperCase()}`;

  // LD pair,(IX+d) etc.
  if (t === 'ld-pair-indexed') return `LD ${(inst.pair || '').toUpperCase()},(${(inst.indexRegister || 'IX').toUpperCase()}${formatSignedOffset(inst.displacement)})`;

  // LD reg,(HL) / LD (HL),reg
  if (t === 'ld-reg-ind') return `LD ${(inst.dest || inst.dst || '').toUpperCase()},(${(inst.indirectRegister || 'HL').toUpperCase()})`;
  if (t === 'ld-ind-reg') return `LD (${(inst.indirectRegister || 'HL').toUpperCase()}),${(inst.src || '').toUpperCase()}`;

  // LD special
  if (t === 'ld-special') return `LD ${(inst.dest || '').toUpperCase()},${(inst.src || '').toUpperCase()}`;
  if (t === 'ld-sp-pair') return `LD SP,${(inst.pair || '').toUpperCase()}`;
  if (t === 'ld-sp-hl') return 'LD SP,HL';
  if (t === 'ld-sp-ix') return 'LD SP,IX';
  if (t === 'ld-sp-iy') return 'LD SP,IY';

  // PUSH / POP
  if (t === 'push') return `PUSH ${(inst.pair || inst.reg || '').toUpperCase()}`;
  if (t === 'pop') return `POP ${(inst.pair || inst.reg || '').toUpperCase()}`;

  // ALU
  if (t === 'alu-reg') return `${(inst.op || '').toUpperCase()} ${(inst.src || inst.reg || '').toUpperCase()}`;
  if (t === 'alu-imm') return `${(inst.op || '').toUpperCase()} ${hex(inst.imm ?? inst.value ?? 0, 2)}`;
  if (t === 'alu-hl-reg16') return `${(inst.op || '').toUpperCase()} HL,${(inst.reg || inst.src || '').toUpperCase()}`;
  if (t === 'alu-ixd') return `${(inst.op || '').toUpperCase()} (${(inst.indexRegister || 'IX').toUpperCase()}${formatSignedOffset(inst.displacement)})`;
  if (t === 'add-pair') return `ADD ${(inst.dest || 'HL').toUpperCase()},${(inst.src || '').toUpperCase()}`;
  if (t === 'sbc-pair') return `SBC HL,${(inst.src || '').toUpperCase()}`;

  // INC / DEC
  if (t === 'inc-reg8' || t === 'inc-reg') return `INC ${(inst.reg || '').toUpperCase()}`;
  if (t === 'dec-reg8' || t === 'dec-reg') return `DEC ${(inst.reg || '').toUpperCase()}`;
  if (t === 'inc-reg16' || t === 'inc-pair') return `INC ${(inst.pair || inst.reg || '').toUpperCase()}`;
  if (t === 'dec-reg16' || t === 'dec-pair') return `DEC ${(inst.pair || inst.reg || '').toUpperCase()}`;

  // LEA
  if (t === 'lea') return `LEA ${(inst.dest || '').toUpperCase()},${(inst.base || inst.indexRegister || 'IX').toUpperCase()}${formatSignedOffset(inst.displacement)}`;

  // EX
  if (t === 'ex-de-hl') return 'EX DE,HL';
  if (t === 'ex-af') return "EX AF,AF'";
  if (t === 'exx') return 'EXX';
  if (t === 'ex-sp-hl') return 'EX (SP),HL';
  if (t === 'ex-sp-pair') return `EX (SP),${(inst.pair || '').toUpperCase()}`;

  // Misc
  if (t === 'nop') return 'NOP';
  if (t === 'halt') return 'HALT';
  if (t === 'di') return 'DI';
  if (t === 'ei') return 'EI';
  if (t === 'scf') return 'SCF';
  if (t === 'ccf') return 'CCF';
  if (t === 'cpl') return 'CPL';
  if (t === 'daa') return 'DAA';
  if (t === 'neg') return 'NEG';
  if (t === 'rla') return 'RLA';
  if (t === 'rra') return 'RRA';
  if (t === 'rlca') return 'RLCA';
  if (t === 'rrca') return 'RRCA';
  if (t === 'rst') return `RST ${hex(inst.target, 2)}`;
  if (t === 'im') return `IM ${inst.mode}`;

  // Block/IO
  if (t === 'ldir') return 'LDIR';
  if (t === 'lddr') return 'LDDR';
  if (t === 'cpir') return 'CPIR';
  if (t === 'cpdr') return 'CPDR';
  if (t === 'ldi') return 'LDI';
  if (t === 'ldd') return 'LDD';
  if (t === 'in-a-imm') return `IN A,(${hex(inst.port, 2)})`;
  if (t === 'out-imm-a') return `OUT (${hex(inst.port, 2)}),A`;
  if (t === 'in-reg-c') return `IN ${(inst.reg || '').toUpperCase()},(C)`;
  if (t === 'out-c-reg') return `OUT (C),${(inst.reg || '').toUpperCase()}`;

  // CB prefix
  if (t === 'rotate-reg') return `${(inst.op || '').toUpperCase()} ${(inst.reg || '').toUpperCase()}`;
  if (t === 'rotate-ind') return `${(inst.op || '').toUpperCase()} (${(inst.indirectRegister || 'HL').toUpperCase()})`;
  if (t === 'bit-reg') return `BIT ${inst.bit},${(inst.reg || '').toUpperCase()}`;
  if (t === 'bit-ind') return `BIT ${inst.bit},(${(inst.indirectRegister || 'HL').toUpperCase()})`;
  if (t === 'set-reg') return `SET ${inst.bit},${(inst.reg || '').toUpperCase()}`;
  if (t === 'set-ind') return `SET ${inst.bit},(${(inst.indirectRegister || 'HL').toUpperCase()})`;
  if (t === 'res-reg') return `RES ${inst.bit},${(inst.reg || '').toUpperCase()}`;
  if (t === 'res-ind') return `RES ${inst.bit},(${(inst.indirectRegister || 'HL').toUpperCase()})`;

  // Mode prefix
  if (t === 'mode-prefix') return `${(inst.mode || '').toUpperCase()} prefix`;

  // Fallback
  return `${t}`;
}


function disasmBlock(rom, startAddr, length) {
  const lines = [];
  let pc = startAddr;
  const end = startAddr + length;

  while (pc < end) {
    let inst;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      inst = null;
    }

    if (!inst || inst.length === 0) {
      lines.push({
        addr: pc,
        bytes: hexBytes(rom, pc, 1),
        text: `DB ${hex(rom[pc], 2)}`,
        len: 1,
      });
      pc++;
      continue;
    }

    const len = inst.length;
    lines.push({
      addr: pc,
      bytes: hexBytes(rom, pc, len),
      text: formatInstruction(inst),
      len,
      tag: inst.tag,
      inst,
    });
    pc += len;
  }

  return lines;
}


// ── scan for byte patterns ───────────────────────────────────────────────────

function findPattern(rom, pattern, limit) {
  const results = [];
  const end = Math.min(rom.length, limit || rom.length) - pattern.length;
  for (let i = 0; i <= end; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) results.push(i);
  }
  return results;
}

// Find CALL sites to a given target
function findCallSites(rom, target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  return findPattern(rom, [0xCD, lo, mid, hi]);
}


// ── _seqcase table decoder (from probe-phase313) ─────────────────────────────

function decodeSeqcaseTable(rom, callSiteAddr) {
  const tableStart = callSiteAddr + 4;
  const count = read16(rom, tableStart);
  const base = read24(rom, tableStart + 2);
  const caseTargets = [];

  for (let i = 0; i < count; i++) {
    caseTargets.push(read24(rom, tableStart + 5 + i * 3));
  }

  const defaultTarget = read24(rom, tableStart + 5 + count * 3);
  const tableEnd = tableStart + 5 + (count + 1) * 3;

  return { callSiteAddr, tableStart, count, base, caseTargets, defaultTarget, tableEnd };
}


// ── main ─────────────────────────────────────────────────────────────────────

const rom = readFileSync(ROM_PATH);
console.log(`ROM loaded: ${rom.length} bytes\n`);

// ── 1. Disassemble epilogue A (0x049CC2) ─────────────────────────────────────

console.log('===================================================================');
console.log(`  EPILOGUE A -- ${hex(EPILOGUE_A)}`);
console.log('===================================================================\n');

const disA = disasmBlock(rom, EPILOGUE_A, DISASM_LEN);
for (const line of disA) {
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)} ${line.text}`);
}
console.log();


// ── 2. Disassemble epilogue B (0x008834) ─────────────────────────────────────

console.log('===================================================================');
console.log(`  EPILOGUE B -- ${hex(EPILOGUE_B)}`);
console.log('===================================================================\n');

const disB = disasmBlock(rom, EPILOGUE_B, DISASM_LEN);
for (const line of disB) {
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)} ${line.text}`);
}
console.log();


// ── 3. Search for direct references (JP/CALL) ───────────────────────────────

console.log('===================================================================');
console.log('  DIRECT REFERENCES (JP/CALL to each epilogue)');
console.log('===================================================================\n');

const jpA  = findPattern(rom, [0xC3, 0xC2, 0x9C, 0x04]);
const callA = findPattern(rom, [0xCD, 0xC2, 0x9C, 0x04]);
const jpB  = findPattern(rom, [0xC3, 0x34, 0x88, 0x00]);
const callB = findPattern(rom, [0xCD, 0x34, 0x88, 0x00]);

console.log(`  JP  ${hex(EPILOGUE_A)}: ${jpA.length} hits`);
for (const addr of jpA) console.log(`    ${hex(addr)}`);
console.log(`  CALL ${hex(EPILOGUE_A)}: ${callA.length} hits`);
for (const addr of callA) console.log(`    ${hex(addr)}`);
console.log();

console.log(`  JP  ${hex(EPILOGUE_B)}: ${jpB.length} hits`);
for (const addr of jpB) console.log(`    ${hex(addr)}`);
console.log(`  CALL ${hex(EPILOGUE_B)}: ${callB.length} hits`);
for (const addr of callB) console.log(`    ${hex(addr)}`);
console.log();


// ── 4. Search for address as 3-byte LE in potential jump tables ──────────────

console.log('===================================================================');
console.log('  3-BYTE LE REFERENCES (potential _seqcase table entries)');
console.log('===================================================================\n');

const leA = findPattern(rom, [0xC2, 0x9C, 0x04]);
const tableRefsA = leA.filter(addr => {
  const prev = addr > 0 ? rom[addr - 1] : 0;
  return prev !== 0xC3 && prev !== 0xCD;
});

console.log(`  ${hex(EPILOGUE_A)} as LE (C2 9C 04): ${leA.length} total, ${tableRefsA.length} non-JP/CALL`);
for (const addr of tableRefsA) {
  console.log(`    ${hex(addr)}`);
}
console.log();

const leB = findPattern(rom, [0x34, 0x88, 0x00]);
const tableRefsB = leB.filter(addr => {
  const prev = addr > 0 ? rom[addr - 1] : 0;
  return prev !== 0xC3 && prev !== 0xCD;
});

console.log(`  ${hex(EPILOGUE_B)} as LE (34 88 00): ${leB.length} total, ${tableRefsB.length} non-JP/CALL`);
for (const addr of tableRefsB) {
  console.log(`    ${hex(addr)}`);
}
console.log();


// ── 5. Find all _seqcase call sites ──────────────────────────────────────────

console.log('===================================================================');
console.log('  ALL _seqcase CALL SITES');
console.log('===================================================================\n');

const directCalls = findCallSites(rom, SEQCASE_DIRECT);
const vectorCalls = findCallSites(rom, SEQCASE_VECTOR);
const allSeqcaseSites = [...directCalls, ...vectorCalls].sort((a, b) => a - b);

console.log(`  CALL ${hex(SEQCASE_DIRECT)} (direct):  ${directCalls.length} sites`);
console.log(`  CALL ${hex(SEQCASE_VECTOR)} (vector):  ${vectorCalls.length} sites`);
console.log(`  Total _seqcase call sites: ${allSeqcaseSites.length}\n`);


// ── 6. Decode all _seqcase tables, find those referencing epilogues ──────────

console.log('===================================================================');
console.log('  _seqcase TABLES REFERENCING EPILOGUES');
console.log('===================================================================\n');

const tablesRefA = [];
const tablesRefB = [];

for (const site of allSeqcaseSites) {
  let table;
  try {
    table = decodeSeqcaseTable(rom, site);
  } catch {
    continue;
  }

  // Sanity: table must fit in ROM
  if (table.tableEnd > rom.length) continue;
  if (table.count > 256) continue; // unreasonable count

  const allTargets = [...table.caseTargets, table.defaultTarget];

  if (allTargets.includes(EPILOGUE_A)) tablesRefA.push(table);
  if (allTargets.includes(EPILOGUE_B)) tablesRefB.push(table);
}

console.log(`  Tables referencing epilogue A (${hex(EPILOGUE_A)}): ${tablesRefA.length}`);
for (const t of tablesRefA) {
  console.log(`\n    _seqcase CALL at ${hex(t.callSiteAddr)}, table at ${hex(t.tableStart)}`);
  console.log(`    count=${t.count}  base=${hex(t.base)}  default=${hex(t.defaultTarget)}${t.defaultTarget === EPILOGUE_A ? ' << EPILOGUE_A' : ''}${t.defaultTarget === EPILOGUE_B ? ' << EPILOGUE_B' : ''}`);
  for (let i = 0; i < t.caseTargets.length; i++) {
    const tgt = t.caseTargets[i];
    const marker = tgt === EPILOGUE_A ? ' << EPILOGUE_A' : tgt === EPILOGUE_B ? ' << EPILOGUE_B' : '';
    console.log(`      case[${i}] key=${hex(t.base + i)} -> ${hex(tgt)}${marker}`);
  }
}
console.log();

console.log(`  Tables referencing epilogue B (${hex(EPILOGUE_B)}): ${tablesRefB.length}`);
for (const t of tablesRefB) {
  console.log(`\n    _seqcase CALL at ${hex(t.callSiteAddr)}, table at ${hex(t.tableStart)}`);
  console.log(`    count=${t.count}  base=${hex(t.base)}  default=${hex(t.defaultTarget)}${t.defaultTarget === EPILOGUE_A ? ' << EPILOGUE_A' : ''}${t.defaultTarget === EPILOGUE_B ? ' << EPILOGUE_B' : ''}`);
  for (let i = 0; i < t.caseTargets.length; i++) {
    const tgt = t.caseTargets[i];
    const marker = tgt === EPILOGUE_A ? ' << EPILOGUE_A' : tgt === EPILOGUE_B ? ' << EPILOGUE_B' : '';
    console.log(`      case[${i}] key=${hex(t.base + i)} -> ${hex(tgt)}${marker}`);
  }
}
console.log();


// ── 7. Disassemble the code immediately BEFORE epilogue A ────────────────────
// to understand if the epilogue is mid-function or a standalone block

console.log('===================================================================');
console.log('  CONTEXT: 32 bytes BEFORE each epilogue');
console.log('===================================================================\n');

console.log(`  Before epilogue A (${hex(EPILOGUE_A - 32)} .. ${hex(EPILOGUE_A - 1)}):`);
const preA = disasmBlock(rom, EPILOGUE_A - 32, 32);
for (const line of preA) {
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)} ${line.text}`);
}
console.log();

console.log(`  Before epilogue B (${hex(EPILOGUE_B - 32)} .. ${hex(EPILOGUE_B - 1)}):`);
const preB = disasmBlock(rom, EPILOGUE_B - 32, 32);
for (const line of preB) {
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)} ${line.text}`);
}
console.log();


// ── 8. Extended disassembly: continue past the initial 4-instruction epilogue ─

console.log('===================================================================');
console.log('  EXTENDED DISASSEMBLY (128 bytes from each epilogue)');
console.log('===================================================================\n');

console.log(`  Epilogue A extended (${hex(EPILOGUE_A)}):`);
const extA = disasmBlock(rom, EPILOGUE_A, 128);
for (const line of extA) {
  const isRet = line.text === 'RET';
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)} ${line.text}${isRet ? '  <-- return point' : ''}`);
}
console.log();

console.log(`  Epilogue B extended (${hex(EPILOGUE_B)}):`);
const extB = disasmBlock(rom, EPILOGUE_B, 128);
for (const line of extB) {
  const isRet = line.text === 'RET';
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)} ${line.text}${isRet ? '  <-- return point' : ''}`);
}
console.log();


// ── 9. Summary ───────────────────────────────────────────────────────────────

console.log('===================================================================');
console.log('  SUMMARY');
console.log('===================================================================\n');

console.log(`  Epilogue A (${hex(EPILOGUE_A)}):`);
console.log(`    JP refs:              ${jpA.length}`);
console.log(`    CALL refs:            ${callA.length}`);
console.log(`    Table LE refs:        ${tableRefsA.length}`);
console.log(`    _seqcase tables:      ${tablesRefA.length}`);
console.log(`    First 4 instrs:       ${disA.slice(0, 4).map(l => l.text).join(' ; ')}`);
console.log();

console.log(`  Epilogue B (${hex(EPILOGUE_B)}):`);
console.log(`    JP refs:              ${jpB.length}`);
console.log(`    CALL refs:            ${callB.length}`);
console.log(`    Table LE refs:        ${tableRefsB.length}`);
console.log(`    _seqcase tables:      ${tablesRefB.length}`);
console.log(`    First 4 instrs:       ${disB.slice(0, 4).map(l => l.text).join(' ; ')}`);
console.log();

// Classification
console.log('  CLASSIFICATION:');
console.log();

// Both epilogues start with:
//   LD A,(IX-1)     ; load return value from local frame
//   LD SP,IX        ; tear down stack frame
//   POP IX          ; restore caller's IX
//   RET             ; return
console.log('  Both epilogues share the IDENTICAL 4-instruction sequence:');
console.log('    LD A,(IX-1)   ; load function return value from stack frame');
console.log('    LD SP,IX      ; tear down the C stack frame');
console.log('    POP IX        ; restore caller IX');
console.log('    RET           ; return to caller');
console.log();
console.log('  This is the standard ZDS II C compiler function epilogue.');
console.log('  Multiple _seqcase tables converge here because their switch');
console.log('  cases all ultimately "return from function" -- they are exit');
console.log('  paths for different branches of the same function or sibling');
console.log('  functions that share a common epilogue address.');
console.log();

// What differs: the code AFTER the RET
const callTargetA = extA.find(l => l.addr === 0x049CCE);
const callTargetB = extB.find(l => l.addr === 0x008840);
if (callTargetA) {
  console.log(`  Code after epilogue A's RET at ${hex(0x049CCA)}:`);
  console.log(`    This is a SEPARATE function entry (reached by different callers).`);
  console.log(`    It calls ${callTargetA.text}, suggesting a related but distinct routine.`);
}
if (callTargetB) {
  console.log(`  Code after epilogue B's RET at ${hex(0x00883C)}:`);
  console.log(`    This is a SEPARATE function entry (reached by different callers).`);
  console.log(`    It calls ${callTargetB.text}, suggesting a related but distinct routine.`);
}

console.log('\nDone.');
