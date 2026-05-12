#!/usr/bin/env node

/**
 * probe-phase300-code-copy-users.mjs
 *
 * Scan the ROM for every CALL 0x000D7E site, recover the copied-code
 * parameter block, disassemble the copied routine, and print a brief
 * pattern-based identification.
 */

import { readFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const rom = readFileSync(ROM_PATH);
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const CALL_PATTERN = [0xCD, 0x7E, 0x0D, 0x00];
const EXPECTED_CALL_COUNT = 8;
const LD_IX_LOOKBACK = 64;
const DISPLAY_INSTRUCTION_COUNT = 18;
const FEATURE_INSTRUCTION_COUNT = 72;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read16LE(offset) {
  return ((rom[offset] ?? 0) | ((rom[offset + 1] ?? 0) << 8)) >>> 0;
}

function read24LE(offset) {
  return (
    (rom[offset] ?? 0) |
    ((rom[offset + 1] ?? 0) << 8) |
    ((rom[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function bytesAt(addr, length) {
  if (addr < 0 || addr >= rom.length || length <= 0) return '';
  return formatBytes(rom.subarray(addr, Math.min(rom.length, addr + length)));
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
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set-ind': return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res-ind': return `res ${inst.bit}, (${inst.indirectRegister})`;
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
    case 'ld-reg-imm': return `ld ${inst.dest ?? inst.dst}, ${hex(inst.value ?? 0, 2)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest ?? inst.dst}, (${inst.src ?? inst.ptr})`;
    case 'ld-ind-reg': return `ld (${inst.dest ?? inst.ptr}), ${inst.src}`;
    case 'ld-ind-imm': return `ld (hl), ${hex(inst.value ?? 0, 2)}`;
    case 'ld-reg-mem': return `ld ${inst.dest ?? inst.dst}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `ld (${hex(inst.addr)}), ${inst.pair}`;
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-ixd-reg': return `ld ${idx}, ${inst.src}`;
    case 'ld-ixd-imm': return `ld ${idx}, ${hex(inst.value ?? 0, 2)}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, ${idx}`;
    case 'ld-indexed-pair': return `ld ${idx}, ${inst.pair ?? inst.src}`;
    case 'ld-pair-indexed': return `ld ${inst.pair ?? inst.dest}, ${idx}`;
    case 'ld-sp-pair': return `ld sp, ${inst.pair}`;
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
    case 'alu-imm': return `${inst.op} ${hex(inst.value ?? 0, 2)}`;
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
    case 'in0': return `in0 ${inst.reg ?? 'a'}, (${hex(inst.port ?? 0, 2)})`;
    case 'out0': return `out0 (${hex(inst.port ?? 0, 2)}), ${inst.reg ?? 'a'}`;
    case 'in-reg': return `in ${inst.reg ?? 'a'}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg ?? 'a'}`;
    case 'in-imm': return `in a, (${hex(inst.port ?? 0, 2)})`;
    case 'out-imm': return `out (${hex(inst.port ?? 0, 2)}), a`;
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

function decodeRows(start, endExclusive, maxInstructions) {
  const rows = [];
  let pc = start;

  while (pc < endExclusive && rows.length < maxInstructions) {
    const inst = safeDecode(pc);
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      length,
      bytes: bytesAt(pc, length),
      inst,
      text: formatInstruction(inst),
    });
    pc += length;
  }

  return rows;
}

function hasPattern(bytes, pattern) {
  if (bytes.length < pattern.length) return false;

  for (let offset = 0; offset <= bytes.length - pattern.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < pattern.length; index += 1) {
      if (bytes[offset + index] !== pattern[index]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }

  return false;
}

function findCallSites() {
  const sites = [];

  for (let offset = 0; offset <= rom.length - CALL_PATTERN.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < CALL_PATTERN.length; index += 1) {
      if (rom[offset + index] !== CALL_PATTERN[index]) {
        matched = false;
        break;
      }
    }
    if (matched) sites.push(offset);
  }

  return sites;
}

function findPrecedingLdIx(callSite, maxLookback = LD_IX_LOOKBACK) {
  const start = Math.max(0, callSite - maxLookback);

  for (let pc = callSite - 5; pc >= start; pc -= 1) {
    if (rom[pc] === 0xDD && rom[pc + 1] === 0x21) {
      return {
        pc,
        value: read24LE(pc + 2),
      };
    }
  }

  return null;
}

function identifyRoutine(codeStart, codeBytes, featureRows) {
  const hasUnlockAddrs =
    hasPattern(codeBytes, [0x32, 0xAA, 0x0A, 0x00]) &&
    hasPattern(codeBytes, [0x32, 0x55, 0x05, 0x00]);
  const hasEraseCmd = hasPattern(codeBytes, [0x3E, 0x30, 0x77]);
  const hasProgramCmd = hasPattern(codeBytes, [0x3E, 0xA0, 0x32, 0xAA, 0x0A, 0x00]);
  const hasIdCmd = hasPattern(codeBytes, [0x3E, 0x90, 0x32, 0xAA, 0x0A, 0x00]);
  const hasResetCmd = hasPattern(codeBytes, [0x3E, 0xF0, 0x32, 0x00, 0x00, 0x00]);

  const loadsIyE008 = featureRows.some(
    (row) => row.inst?.tag === 'ld-pair-imm' && row.inst?.pair === 'iy' && row.inst?.value === 0xE00800
  );
  const readsE00900 = featureRows.some(
    (row) => row.inst?.tag === 'ld-reg-mem' && row.inst?.addr === 0xE00900
  );
  const writesE00900 = featureRows.some(
    (row) => row.inst?.tag === 'ld-mem-reg' && row.inst?.addr === 0xE00900
  );
  const touchesE00824 = featureRows.some(
    (row) =>
      (row.inst?.tag === 'ld-reg-mem' && row.inst?.addr === 0xE00824) ||
      (row.inst?.tag === 'ld-mem-reg' && row.inst?.addr === 0xE00824) ||
      (row.inst?.tag === 'ld-reg-ixd' && row.inst?.indexRegister === 'iy' && row.inst?.displacement === 36) ||
      (row.inst?.tag === 'ld-ixd-reg' && row.inst?.indexRegister === 'iy' && row.inst?.displacement === 36) ||
      (row.inst?.tag === 'indexed-cb-bit' && row.inst?.indexRegister === 'iy' && row.inst?.displacement === 36)
  );
  const touchesIyStatus = featureRows.some(
    (row) => row.inst?.tag === 'indexed-cb-bit' && row.inst?.indexRegister === 'iy' && row.inst?.displacement === 24
  );

  const clues = [];
  if (hasUnlockAddrs) clues.push('writes flash unlock addresses 0x000AAA / 0x000555');
  if (hasEraseCmd) clues.push('issues 0x30 erase command and polls status bits');
  if (hasProgramCmd) clues.push('issues 0xA0 program command and copies source bytes');
  if (hasIdCmd) clues.push('issues 0x90 autoselect/ID command');
  if (hasResetCmd) clues.push('writes 0xF0 reset-to-read command');
  if (loadsIyE008) clues.push('uses IY=0xE00800 MMIO window');
  if (readsE00900) clues.push('reads result byte from 0xE00900');
  if (writesE00900) clues.push('streams payload bytes into 0xE00900');
  if (touchesE00824 || touchesIyStatus) clues.push('polls/acks ready bits in the E008xx block');

  let summary = 'unknown copied routine';
  if (codeStart === 0x0159BF) {
    summary = 'foreground keyboard scanner (known Phase 299 path)';
  } else if (hasUnlockAddrs && hasIdCmd && hasResetCmd) {
    summary = 'flash autoselect / identifier reader';
  } else if (hasUnlockAddrs && hasEraseCmd) {
    summary = 'direct flash erase routine';
  } else if (hasUnlockAddrs && hasProgramCmd) {
    summary = 'direct flash program/copy routine';
  } else if (loadsIyE008 && readsE00900) {
    summary = 'MMIO scanner / command-response reader';
  } else if (loadsIyE008 && writesE00900) {
    summary = 'E008xx MMIO transfer routine';
  } else if (loadsIyE008) {
    summary = 'E008xx MMIO command routine';
  }

  return { summary, clues };
}

function analyzeCallSite(callSite) {
  const ixLoad = findPrecedingLdIx(callSite);
  if (!ixLoad) {
    return {
      callSite,
      ixLoad: null,
      paramAddr: null,
      length: null,
      codeStart: null,
      codeEndExclusive: null,
      firstBytes: '',
      displayRows: [],
      featureRows: [],
      role: 'no preceding LD IX,imm24 found',
      clues: [],
    };
  }

  const paramAddr = ixLoad.value;
  const length = read16LE(paramAddr);
  const codeStart = paramAddr + 2;
  const codeEndExclusive = Math.min(rom.length, codeStart + length);
  const codeBytes = rom.subarray(codeStart, codeEndExclusive);
  const displayRows = decodeRows(codeStart, codeEndExclusive, DISPLAY_INSTRUCTION_COUNT);
  const featureRows = decodeRows(codeStart, codeEndExclusive, FEATURE_INSTRUCTION_COUNT);
  const identification = identifyRoutine(codeStart, codeBytes, featureRows);

  return {
    callSite,
    ixLoad,
    paramAddr,
    length,
    codeStart,
    codeEndExclusive,
    firstBytes: formatBytes(codeBytes.subarray(0, Math.min(24, codeBytes.length))),
    displayRows,
    featureRows,
    role: identification.summary,
    clues: identification.clues,
  };
}

function printRows(rows) {
  for (const row of rows) {
    console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
  }
}

const callSites = findCallSites();
const analyses = callSites.map(analyzeCallSite).sort((left, right) => left.callSite - right.callSite);

const byParamBlock = new Map();
for (const entry of analyses) {
  if (entry.paramAddr == null) continue;
  const key = entry.paramAddr;
  if (!byParamBlock.has(key)) {
    byParamBlock.set(key, {
      paramAddr: entry.paramAddr,
      codeStart: entry.codeStart,
      length: entry.length,
      role: entry.role,
      callers: [],
    });
  }
  byParamBlock.get(key).callers.push(entry.callSite);
}

console.log('=== Phase 300: Code-Copy Framework Users (0x000D7E) ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Search pattern: ${CALL_PATTERN.map((value) => hexByte(value)).join(' ')}`);
console.log(`Found ${analyses.length} CALL site(s); expected ${EXPECTED_CALL_COUNT}.`);
console.log(`Distinct parameter blocks: ${byParamBlock.size}`);
if (analyses.length !== EXPECTED_CALL_COUNT) {
  console.log('WARNING: call count differs from the expected 8-site baseline.');
}
console.log('');

analyses.forEach((entry, index) => {
  console.log(`[${index + 1}/${analyses.length}] CALL 0x000D7E at ${hex(entry.callSite)}`);

  if (!entry.ixLoad) {
    console.log('  preceding LD IX,imm24: not found within lookback window');
    console.log('');
    return;
  }

  const duplicateGroup = byParamBlock.get(entry.paramAddr);
  const reused = duplicateGroup.callers.length > 1;

  console.log(`  LD IX site: ${hex(entry.ixLoad.pc)} -> IX = ${hex(entry.paramAddr)}`);
  console.log(`  parameter block length: ${hex(entry.length, 4)} (${entry.length}) byte(s)`);
  console.log(`  copied code range: ${hex(entry.codeStart)}..${hex(entry.codeEndExclusive - 1)}`);
  console.log(`  first bytes: ${entry.firstBytes}`);
  console.log(`  likely role: ${entry.role}`);
  if (entry.clues.length > 0) {
    console.log(`  clues: ${entry.clues.join('; ')}`);
  }
  if (reused) {
    console.log(`  reused by call sites: ${duplicateGroup.callers.map((value) => hex(value)).join(', ')}`);
  }
  console.log('  first instructions:');
  printRows(entry.displayRows);
  console.log('');
});

console.log('Distinct copied routines:');
for (const group of [...byParamBlock.values()].sort((left, right) => left.paramAddr - right.paramAddr)) {
  console.log(
    `  param=${hex(group.paramAddr)} code=${hex(group.codeStart)} len=${hex(group.length, 4)} callers=${group.callers.map((value) => hex(value)).join(', ')} role=${group.role}`
  );
}

if (analyses.length !== EXPECTED_CALL_COUNT) {
  process.exitCode = 1;
}
