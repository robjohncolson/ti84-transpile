#!/usr/bin/env node

/**
 * Phase 160 - Disassemble ROM bytes at 0x07C74B and 0x07CA48
 *
 * Part A: Verify CALL at 0x07C74B targets 0x07CA48 (OP1toOP2 internal call)
 * Part B: Full disassembly of 0x07CA48 function (entry to RET at 0x07CA9F)
 * Part C: Scan ROM for all callers of 0x07CA48
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

const romBytes = fs.readFileSync(ROM_BIN_PATH);

// --- Constants ---

const OP1TOOP2_CONTEXT_START = 0x07c740;
const OP1TOOP2_CONTEXT_END   = 0x07c760; // exclusive
const CALL_ADDR              = 0x07c74b;
const NORM_ENTRY             = 0x07ca48;
const NORM_END               = 0x07caa0; // exclusive (0x07CA9F inclusive)
const EXPECTED_TARGET        = 0x07ca48;

// --- Helpers ---

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

// Known address labels for annotation
const ADDR_LABELS = new Map([
  [NORM_ENTRY,  'Norm(0x07CA48)'],
  [0x07fb33,    'Shl14'],
  [0x07fdf1,    'DecExp'],
  [0x07fd4a,    'ValidityChk'],
  [0x07c9af,    'LoopExit'],
  [0x07cab9,    'FPDiv'],
  [0x07ca73,    'ExpCombo'],
  [0x07c747,    'OP1toOP2'],
  [CALL_ADDR,   'CALL-target?'],
]);

function addrLabel(addr) {
  const label = ADDR_LABELS.get(addr);
  return label ? ` [${label}]` : '';
}

// --- Instruction formatter ---

function formatInstruction(instr) {
  const prefix = instr.modePrefix ? `.${instr.modePrefix} ` : '';
  const tag = instr.tag;

  if (tag === 'call')             return `${prefix}call ${hex(instr.target)}`;
  if (tag === 'call-conditional') return `${prefix}call ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp')               return `${prefix}jp ${hex(instr.target)}`;
  if (tag === 'jp-conditional')   return `${prefix}jp ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp-indirect')      return `${prefix}jp (${instr.indirectRegister})`;
  if (tag === 'jr')               return `${prefix}jr ${hex(instr.target)}`;
  if (tag === 'jr-conditional')   return `${prefix}jr ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'ret')              return `${prefix}ret`;
  if (tag === 'ret-conditional')  return `${prefix}ret ${instr.condition}`;
  if (tag === 'ld-reg-mem')       return `${prefix}ld ${instr.dest}, (${hex(instr.addr)})`;
  if (tag === 'ld-mem-reg')       return `${prefix}ld (${hex(instr.addr)}), ${instr.src}`;
  if (tag === 'ld-reg-imm')       return `${prefix}ld ${instr.dest}, ${hexByte(instr.value)}`;
  if (tag === 'ld-reg-reg')       return `${prefix}ld ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-pair-imm')      return `${prefix}ld ${instr.pair}, ${hex(instr.value)}`;
  if (tag === 'ld-reg-ind')       return `${prefix}ld ${instr.dest}, (${instr.src})`;
  if (tag === 'ld-ind-reg')       return `${prefix}ld (${instr.dest}), ${instr.src}`;
  if (tag === 'alu-imm')          return `${prefix}${instr.op} ${hexByte(instr.value)}`;
  if (tag === 'alu-reg')          return `${prefix}${instr.op} ${instr.src}`;
  if (tag === 'push')             return `${prefix}push ${instr.pair}`;
  if (tag === 'pop')              return `${prefix}pop ${instr.pair}`;
  if (tag === 'inc-reg')          return `${prefix}inc ${instr.reg}`;
  if (tag === 'dec-reg')          return `${prefix}dec ${instr.reg}`;
  if (tag === 'inc-pair')         return `${prefix}inc ${instr.pair}`;
  if (tag === 'dec-pair')         return `${prefix}dec ${instr.pair}`;
  if (tag === 'add-pair')         return `${prefix}add ${instr.dest}, ${instr.src}`;
  if (tag === 'ex-de-hl')         return `${prefix}ex de, hl`;
  if (tag === 'ldir')             return `${prefix}ldir`;
  if (tag === 'ldi')              return `${prefix}ldi`;
  if (tag === 'nop')              return `${prefix}nop`;
  if (tag === 'djnz')             return `${prefix}djnz ${hex(instr.target)}`;
  if (tag === 'rst')              return `${prefix}rst ${hex(instr.target)}`;
  if (tag === 'scf')              return `${prefix}scf`;
  if (tag === 'ccf')              return `${prefix}ccf`;
  if (tag === 'cpl')              return `${prefix}cpl`;
  if (tag === 'rla')              return `${prefix}rla`;
  if (tag === 'rra')              return `${prefix}rra`;
  if (tag === 'rlca')             return `${prefix}rlca`;
  if (tag === 'rrca')             return `${prefix}rrca`;
  if (tag === 'halt')             return `${prefix}halt`;
  if (tag === 'di')               return `${prefix}di`;
  if (tag === 'ei')               return `${prefix}ei`;
  if (tag === 'neg')              return `${prefix}neg`;
  if (tag === 'bit')              return `${prefix}bit ${instr.bit}, ${instr.reg}`;
  if (tag === 'set')              return `${prefix}set ${instr.bit}, ${instr.reg}`;
  if (tag === 'res')              return `${prefix}res ${instr.bit}, ${instr.reg}`;
  if (tag === 'sla')              return `${prefix}sla ${instr.reg}`;
  if (tag === 'sra')              return `${prefix}sra ${instr.reg}`;
  if (tag === 'srl')              return `${prefix}srl ${instr.reg}`;
  if (tag === 'rl')               return `${prefix}rl ${instr.reg}`;
  if (tag === 'rr')               return `${prefix}rr ${instr.reg}`;
  if (tag === 'rlc')              return `${prefix}rlc ${instr.reg}`;
  if (tag === 'rrc')              return `${prefix}rrc ${instr.reg}`;
  if (tag === 'ex-sp-hl')        return `${prefix}ex (sp), hl`;
  if (tag === 'exx')              return `${prefix}exx`;
  if (tag === 'ex-af')            return `${prefix}ex af, af'`;
  if (tag === 'daa')              return `${prefix}daa`;
  if (tag === 'reti')             return `${prefix}reti`;
  if (tag === 'retn')             return `${prefix}retn`;
  if (tag === 'cpir')             return `${prefix}cpir`;
  if (tag === 'cpdr')             return `${prefix}cpdr`;
  if (tag === 'lddr')             return `${prefix}lddr`;
  if (tag === 'inir')             return `${prefix}inir`;
  if (tag === 'otir')             return `${prefix}otir`;
  if (tag === 'in')               return `${prefix}in ${instr.dest}, (${instr.port ?? instr.src})`;
  if (tag === 'out')              return `${prefix}out (${instr.port ?? instr.dest}), ${instr.src}`;
  if (tag === 'sbc-pair')         return `${prefix}sbc ${instr.dest}, ${instr.src}`;
  if (tag === 'adc-pair')         return `${prefix}adc ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-mem-pair')      return `${prefix}ld (${hex(instr.addr)}), ${instr.pair}`;
  if (tag === 'ld-pair-mem')      return `${prefix}ld ${instr.pair}, (${hex(instr.addr)})`;

  return `${prefix}${tag}`;
}

// --- Disassembly helper ---

function decodeRange(startAddr, endAddr) {
  const entries = [];
  let pc = startAddr;

  while (pc < endAddr) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      const bytes = [];
      for (let i = 0; i < length; i++) {
        bytes.push(hexByte(romBytes[pc + i] ?? 0));
      }
      entries.push({
        pc,
        bytes: bytes.join(' '),
        tag: instr.tag,
        text: formatInstruction(instr),
        length,
        instr,
      });
      pc += length;
    } catch (error) {
      entries.push({
        pc,
        bytes: hexByte(romBytes[pc] ?? 0),
        tag: 'error',
        text: `decode-error: ${error?.message ?? error}`,
        length: 1,
        instr: null,
      });
      pc += 1;
    }
  }

  return entries;
}

// Decode until we hit a RET (inclusive), stopping at a max byte limit
function decodeUntilRet(startAddr, maxBytes = 256) {
  const entries = [];
  let pc = startAddr;
  const endAddr = startAddr + maxBytes;

  while (pc < endAddr) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      const bytes = [];
      for (let i = 0; i < length; i++) {
        bytes.push(hexByte(romBytes[pc + i] ?? 0));
      }
      entries.push({
        pc,
        bytes: bytes.join(' '),
        tag: instr.tag,
        text: formatInstruction(instr),
        length,
        instr,
      });
      pc += length;

      // Stop after unconditional RET
      if (instr.tag === 'ret') break;
    } catch (error) {
      entries.push({
        pc,
        bytes: hexByte(romBytes[pc] ?? 0),
        tag: 'error',
        text: `decode-error: ${error?.message ?? error}`,
        length: 1,
        instr: null,
      });
      pc += 1;
    }
  }

  return entries;
}

// Manual 3-byte LE decode for CALL/JP verification
function read24LE(addr) {
  return (
    (romBytes[addr] & 0xff) |
    ((romBytes[addr + 1] & 0xff) << 8) |
    ((romBytes[addr + 2] & 0xff) << 16)
  );
}

// Annotate instruction in the context of eZ80 FP BCD math
function annotate(pc, instr) {
  if (!instr) return '';
  const tag = instr.tag;
  const text = instr.text ?? '';

  // CALL annotations
  if (tag === 'call' || tag === 'call-conditional') {
    const t = instr.target;
    if (t === 0x07fb33) return 'Shl14 — shift mantissa left 14 BCD digits';
    if (t === 0x07fdf1) return 'DecExp — decrement exponent byte in OP1';
    if (t === 0x07fd4a) return 'ValidityChk — check OP1 validity';
    if (t === 0x07ca48) return 'SELF or NormEntry — normalize OP1';
    return `call -> ${hex(t)}`;
  }

  // JP annotations
  if (tag === 'jp' || tag === 'jp-conditional') {
    const t = instr.target;
    if (t === 0x07c9af) return 'LoopExit';
    if (t === 0x07cab9) return 'FPDiv entry';
    if (t === 0x07ca48) return 'NormEntry (tail call)';
    const label = ADDR_LABELS.get(t);
    if (label) return label;
  }

  // JR annotations
  if (tag === 'jr' || tag === 'jr-conditional') {
    return `-> ${hex(instr.target)}`;
  }

  // Memory access to OP1 register (0xD005F8..0xD00602) or OP2 (0xD00603..0xD0060D)
  if (tag === 'ld-reg-mem' || tag === 'ld-mem-reg' || tag === 'ld-mem-pair' || tag === 'ld-pair-mem') {
    const addr = instr.addr;
    if (addr >= 0xd005f8 && addr <= 0xd00602) return `OP1[${addr - 0xd005f8}]`;
    if (addr >= 0xd00603 && addr <= 0xd0060d) return `OP2[${addr - 0xd00603}]`;
    if (addr >= 0xd00600 && addr <= 0xd00601) return `OP1 exponent`;
  }

  // ALU ops — note key comparisons
  if (tag === 'alu-imm' && instr.op === 'cp') {
    if (instr.value === 0x80) return 'cp 0x80 — test if exp < 0x80 (biased)';
    if (instr.value === 0x00) return 'cp 0 — test if zero';
    if (instr.value === 0x0f) return 'cp 0x0F — shift count limit?';
  }

  if (tag === 'alu-reg' && instr.op === 'xor' && instr.src === 'a') return 'A=0';

  // RET
  if (tag === 'ret') return 'return to caller';
  if (tag === 'ret-conditional') return `conditional return (${instr.condition})`;

  return '';
}

// ==========================================================================
// Part A: Disassemble 0x07C740-0x07C760 and verify CALL at 0x07C74B
// ==========================================================================

function partA_verifyCall() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('PART A: ROM bytes 0x07C740-0x07C760 — verify CALL at 0x07C74B');
  console.log(`${'='.repeat(70)}`);

  // Raw bytes dump
  const rawBytes = [];
  for (let i = 0; i < (OP1TOOP2_CONTEXT_END - OP1TOOP2_CONTEXT_START); i++) {
    rawBytes.push(hexByte(romBytes[OP1TOOP2_CONTEXT_START + i] ?? 0));
  }
  console.log(`  Raw bytes (0x07C740-0x07C75F):`);
  // Print in rows of 8
  for (let row = 0; row < rawBytes.length; row += 8) {
    const addr = OP1TOOP2_CONTEXT_START + row;
    const chunk = rawBytes.slice(row, row + 8).join(' ');
    console.log(`    ${hex(addr)}  ${chunk}`);
  }
  console.log('');

  // Manual decode of CALL at suspected 0x07C74B
  // eZ80 ADL CALL nn = 0xCD + 3-byte LE target
  const byteAtCall = romBytes[CALL_ADDR] & 0xff;
  console.log(`  Byte at ${hex(CALL_ADDR)}: 0x${hexByte(byteAtCall)} (expected 0xCD for CALL nn)`);

  if (byteAtCall === 0xcd) {
    const target = read24LE(CALL_ADDR + 1);
    console.log(`  CALL target (LE decode bytes +1..+3): ${hex(target)}`);
    const match = target === EXPECTED_TARGET;
    console.log(`  Expected target: ${hex(EXPECTED_TARGET)}`);
    console.log(`  CALL target matches 0x07CA48: ${match ? 'YES — CONFIRMED' : 'NO — MISMATCH'}`);
  } else if (byteAtCall === 0xc3) {
    const target = read24LE(CALL_ADDR + 1);
    console.log(`  JP target (LE decode): ${hex(target)}`);
    console.log(`  NOTE: This is a JP, not a CALL`);
  } else {
    console.log(`  Byte is NOT 0xCD or 0xC3 — may not be at instruction boundary`);
  }

  console.log('');
  console.log('  Full disassembly of 0x07C740-0x07C760:');
  const entries = decodeRange(OP1TOOP2_CONTEXT_START, OP1TOOP2_CONTEXT_END);
  for (const entry of entries) {
    const label = addrLabel(entry.pc);
    const note = entry.instr ? annotate(entry.pc, entry.instr) : '';
    const noteStr = note ? `  ; ${note}` : '';
    console.log(`    ${hex(entry.pc)}  ${entry.bytes.padEnd(18)}  ${entry.text}${label}${noteStr}`);
  }

  return entries;
}

// ==========================================================================
// Part B: Full disassembly of 0x07CA48 (entry through RET)
// ==========================================================================

function partB_disasmNormFunction() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('PART B: Full disassembly of 0x07CA48 (NormEntry through RET)');
  console.log(`${'='.repeat(70)}`);

  // Raw bytes
  const rawLen = NORM_END - NORM_ENTRY;
  const rawBytes = [];
  for (let i = 0; i < rawLen; i++) {
    rawBytes.push(hexByte(romBytes[NORM_ENTRY + i] ?? 0));
  }
  console.log(`  Raw bytes (0x07CA48-0x07CA9F, ${rawLen} bytes):`);
  for (let row = 0; row < rawBytes.length; row += 8) {
    const addr = NORM_ENTRY + row;
    const chunk = rawBytes.slice(row, row + 8).join(' ');
    console.log(`    ${hex(addr)}  ${chunk}`);
  }
  console.log('');

  // Decode until RET — use a generous max since we know the function is ~88 bytes
  const entries = decodeUntilRet(NORM_ENTRY, 256);

  console.log('  Instructions:');
  for (const entry of entries) {
    const label = addrLabel(entry.pc);

    // Build annotation
    let note = '';
    if (entry.instr) {
      note = annotate(entry.pc, entry.instr);
    }
    const noteStr = note ? `  ; ${note}` : '';
    console.log(`    ${hex(entry.pc)}  ${entry.bytes.padEnd(18)}  ${entry.text}${label}${noteStr}`);
  }

  // Structural analysis
  console.log('');
  console.log('  --- Structural analysis ---');
  let hasIntegerExtraction = false;
  let hasStoreAfterLoop = false;
  let loopTopAddr = null;
  let retAddr = null;
  let callCount = 0;

  for (const entry of entries) {
    if (!entry.instr) continue;
    const tag = entry.instr.tag;

    if (tag === 'ret') {
      retAddr = entry.pc;
    }

    if (tag === 'call' || tag === 'call-conditional') {
      callCount++;
    }

    // Check for store instructions after any loop pattern
    if (tag === 'jr' || tag === 'jr-conditional') {
      const target = entry.instr.target;
      if (target < entry.pc) {
        loopTopAddr = target;
        console.log(`  Loop detected: JR back to ${hex(target)} from ${hex(entry.pc)}`);
      }
    }

    // Check for stores to memory after potential loop exit
    if (loopTopAddr && entry.pc > loopTopAddr) {
      if (tag === 'ld-mem-reg' || tag === 'ld-mem-pair') {
        hasStoreAfterLoop = true;
        hasIntegerExtraction = true;
        console.log(`  Store-after-loop at ${hex(entry.pc)}: ${entry.text}`);
      }
    }
  }

  if (retAddr !== null) {
    console.log(`  RET at: ${hex(retAddr)}`);
  }
  console.log(`  CALL instructions: ${callCount}`);
  console.log(`  Has store-after-loop (integer extraction pattern): ${hasStoreAfterLoop}`);
  console.log(`  Loop back-branch address: ${loopTopAddr !== null ? hex(loopTopAddr) : 'none'}`);

  return entries;
}

// ==========================================================================
// Part C: Scan ROM for all callers of 0x07CA48
// ==========================================================================

function partC_scanCallers() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('PART C: Scan ROM for CALL/JP to 0x07CA48');
  console.log(`${'='.repeat(70)}`);

  // Pattern bytes for CALL 0x07CA48: CD 48 CA 07
  const callPattern = [0xcd, 0x48, 0xca, 0x07];
  // Pattern bytes for JP   0x07CA48: C3 48 CA 07
  const jpPattern   = [0xc3, 0x48, 0xca, 0x07];

  const callers = [];
  const romLen = romBytes.length;

  for (let i = 0; i < romLen - 4; i++) {
    const b0 = romBytes[i] & 0xff;

    let kind = null;
    if (b0 === 0xcd &&
        (romBytes[i + 1] & 0xff) === 0x48 &&
        (romBytes[i + 2] & 0xff) === 0xca &&
        (romBytes[i + 3] & 0xff) === 0x07) {
      kind = 'CALL';
    } else if (b0 === 0xc3 &&
               (romBytes[i + 1] & 0xff) === 0x48 &&
               (romBytes[i + 2] & 0xff) === 0xca &&
               (romBytes[i + 3] & 0xff) === 0x07) {
      kind = 'JP';
    }

    if (kind !== null) {
      callers.push({ pc: i, kind });
    }
  }

  console.log(`  Found ${callers.length} caller(s) of 0x07CA48:`);
  console.log('');

  for (const caller of callers) {
    const { pc, kind } = caller;
    const label = addrLabel(pc);

    // Context: 8 bytes before and 8 bytes after the instruction (instruction is 4 bytes)
    const ctxStart = Math.max(0, pc - 8);
    const ctxEnd   = Math.min(romLen, pc + 4 + 8);

    const ctxBytes = [];
    for (let j = ctxStart; j < ctxEnd; j++) {
      ctxBytes.push(hexByte(romBytes[j] ?? 0));
    }

    console.log(`  ${kind} at ${hex(pc)}${label}`);
    console.log(`    Context bytes (${hex(ctxStart)}-${hex(ctxEnd - 1)}):`);
    console.log(`      ${ctxBytes.join(' ')}`);

    // Disassemble context window for clarity
    console.log(`    Disassembly context:`);
    const ctxEntries = decodeRange(ctxStart, ctxEnd);
    for (const entry of ctxEntries) {
      const marker = (entry.pc === pc) ? ' <-- CALLER' : '';
      const note = entry.instr ? annotate(entry.pc, entry.instr) : '';
      const noteStr = note ? `  ; ${note}` : '';
      console.log(`      ${hex(entry.pc)}  ${entry.bytes.padEnd(16)}  ${entry.text}${marker}${noteStr}`);
    }
    console.log('');
  }

  if (callers.length === 0) {
    console.log('  (no callers found — double-check byte order)');
  }

  return callers;
}

// --- Main ---

function main() {
  console.log('=== Phase 160: Disassemble 0x07C74B and 0x07CA48 ===');
  console.log('');
  console.log(`  ROM size: ${romBytes.length} bytes (${hex(romBytes.length)})`);
  console.log('');

  // Part A: Verify CALL at 0x07C74B -> 0x07CA48
  const partAEntries = partA_verifyCall();

  // Part B: Full disassembly of 0x07CA48
  const partBEntries = partB_disasmNormFunction();

  // Part C: Scan for all callers
  const callers = partC_scanCallers();

  // --- CONCLUSIONS ---
  console.log(`\n${'='.repeat(70)}`);
  console.log('CONCLUSIONS');
  console.log(`${'='.repeat(70)}`);

  // CALL verification
  const byteAtCall = romBytes[CALL_ADDR] & 0xff;
  let callVerdict = 'UNKNOWN';
  if (byteAtCall === 0xcd) {
    const target = read24LE(CALL_ADDR + 1);
    callVerdict = (target === EXPECTED_TARGET)
      ? `CONFIRMED — CALL at ${hex(CALL_ADDR)} targets ${hex(EXPECTED_TARGET)}`
      : `DENIED    — CALL at ${hex(CALL_ADDR)} targets ${hex(target)}, NOT ${hex(EXPECTED_TARGET)}`;
  } else if (byteAtCall === 0xc3) {
    const target = read24LE(CALL_ADDR + 1);
    callVerdict = `JP (not CALL) at ${hex(CALL_ADDR)} targets ${hex(target)}`;
  } else {
    callVerdict = `Byte 0x${hexByte(byteAtCall)} at ${hex(CALL_ADDR)} is not CALL(0xCD) or JP(0xC3)`;
  }
  console.log(`  1. CALL target verification: ${callVerdict}`);

  // Function characterization
  const hasLoop = partBEntries.some((e) => e.instr?.tag === 'jr' && e.instr.target < e.pc);
  const callTargets = partBEntries
    .filter((e) => e.instr?.tag === 'call' || e.instr?.tag === 'call-conditional')
    .map((e) => hex(e.instr.target));
  const retEntries = partBEntries.filter((e) => e.instr?.tag === 'ret');

  console.log(`  2. 0x07CA48 characterization:`);
  console.log(`       Has loop (JR back): ${hasLoop}`);
  console.log(`       CALL targets: ${callTargets.length > 0 ? callTargets.join(', ') : 'none'}`);
  console.log(`       RET count: ${retEntries.length}`);
  console.log(`       Instruction count: ${partBEntries.length}`);

  // Store-after-loop check
  let loopTopSeen = null;
  let storesAfterLoop = 0;
  for (const entry of partBEntries) {
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if (tag === 'jr' || tag === 'jr-conditional') {
      if (entry.instr.target < entry.pc) loopTopSeen = entry.instr.target;
    }
    if (loopTopSeen && entry.pc > loopTopSeen) {
      if (tag === 'ld-mem-reg' || tag === 'ld-mem-pair') storesAfterLoop++;
    }
  }
  console.log(`       Store-to-memory instructions after loop: ${storesAfterLoop}`);
  const likelyPurpose = storesAfterLoop > 0
    ? 'Normalization WITH integer extraction (stores shifted digits — possible FP-to-int)'
    : 'Pure normalization loop (no integer extraction detected in static disassembly)';
  console.log(`       Likely purpose: ${likelyPurpose}`);

  console.log(`  3. Callers of 0x07CA48: ${callers.length} found`);
  for (const c of callers) {
    console.log(`       ${c.kind} at ${hex(c.pc)}`);
  }

  console.log('');
  console.log('Done.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
