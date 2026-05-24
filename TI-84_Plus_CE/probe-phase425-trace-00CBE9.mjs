#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x00CBE9;
const PRIMARY_START = 0x00CB7B;
const PRIMARY_END = 0x00CBE8; // last byte (C9 = RET) of 0x00CB7B
const SCAN_BYTES = 200;
const SCAN_END_EXCLUSIVE = START + SCAN_BYTES;
const RAM_MIN = 0xD10000;
const RAM_MAX = 0xD1FFFF;
const EPILOGUE_PATTERN = [0xDD, 0xF9, 0xDD, 0xE1, 0xC9];

const CALL_PATTERN = [0xCD, 0xE9, 0xCB, 0x00]; // CALL 0x00CBE9
const JP_PATTERN = [0xC3, 0xE9, 0xCB, 0x00];   // JP 0x00CBE9

const CALL_LABELS = new Map([
  [0x002197, '__frameset'],
  [0x00218A, '__frameset0'],
  [0x00276B, 'zero-extend BC -> HL helper'],
  [0x002330, 'shift-right helper'],
  [0x00230B, 'shift-left helper (HL <<= A)'],
]);

const RAM_LABELS = new Map([
  [0xD13FED, 'connection table base'],
  [0xD13FF0, 'connection table +3'],
  [0xD13FF3, 'connection table +6'],
  [0xD13FF6, 'connection table +9'],
  [0xD13FF9, 'connection table +12'],
  [0xD13FFC, 'descriptor pointer A'],
  [0xD13FFF, 'descriptor pointer B'],
  [0xD14002, 'descriptor pointer C'],
  [0xD14005, 'connection table +24'],
  [0xD14008, 'connection table +27'],
  [0xD1400B, 'selector-0 ref count?'],
  [0xD1400E, 'selector-0 field +33'],
  [0xD14011, 'selector-0 field +36'],
  [0xD14014, 'connection table field'],
  [0xD1401A, 'selector-0 slab base'],
  [0xD14020, 'selector-2 slab base'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatDisp(value) {
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function labelFor(map, value) {
  return map.get(value) ?? null;
}

function formatAddress(addr, width, labels) {
  const label = labelFor(labels, addr);
  return `${hex(addr, width)}${label ? ` (${label})` : ''}`;
}

function isRam(addr) {
  return addr >= RAM_MIN && addr <= RAM_MAX;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `CALL ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `JP ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${upper(inst.condition)},${hex(inst.target)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    case 'ret-conditional':
      return withPrefix(inst, `RET ${upper(inst.condition)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${hex(inst.value)}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`);
    case 'ld-ixiy-indexed':
      return withPrefix(inst, `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-ixiy':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}`);
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
      }
      return withPrefix(inst, `LD ${upper(inst.pair)},(${hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
    case 'ld-pair-ind':
      return withPrefix(inst, `LD ${upper(inst.pair)},(${upper(inst.src)})`);
    case 'ld-ind-pair':
      return withPrefix(inst, `LD (${upper(inst.dest)}),${upper(inst.pair)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${upper(inst.src)})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${upper(inst.dest)}),${upper(inst.src)}`);
    case 'ld-ind-imm':
      return withPrefix(inst, `LD (HL),${hex(inst.value, 2)}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
    case 'inc-pair':
      return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'inc-reg':
      return withPrefix(inst, `INC ${upper(inst.reg)}`);
    case 'dec-pair':
      return withPrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'dec-reg':
      return withPrefix(inst, `DEC ${upper(inst.reg)}`);
    case 'add-pair':
      return withPrefix(inst, `ADD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL,${upper(inst.src)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'alu-ind':
      return withPrefix(inst, `${upper(inst.op)} (HL)`);
    case 'lea': {
      const disp = signedByte(inst.displacement);
      return withPrefix(inst, `LEA ${upper(inst.dest)},${upper(inst.base)}${disp >= 0 ? `+${disp}` : disp}`);
    }
    case 'bit-set':
      return withPrefix(inst, `SET ${inst.bit},${upper(inst.reg)}`);
    case 'bit-res':
      return withPrefix(inst, `RES ${inst.bit},${upper(inst.reg)}`);
    case 'bit-test':
      return withPrefix(inst, `BIT ${inst.bit},${upper(inst.reg)}`);
    case 'rotate-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.reg)}`);
    case 'rotate-ind':
      return withPrefix(inst, `${upper(inst.op)} (${upper(inst.indirectRegister)})`);
    case 'indexed-cb-rotate':
      return withPrefix(
        inst,
        `${upper(inst.operation)} ${formatIndexed(inst.indexRegister, inst.displacement)}`
      );
    case 'indexed-cb-bit':
      return withPrefix(inst, `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'in-reg':
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'in-imm':
      return withPrefix(inst, `IN A,(${hex(inst.port, 2)})`);
    case 'out-reg':
      return withPrefix(inst, `OUT (C),${upper(inst.reg)}`);
    case 'out-imm':
      return withPrefix(inst, `OUT (${hex(inst.port, 2)}),A`);
    case 'ex-sp':
      return withPrefix(inst, `EX (SP),${upper(inst.pair)}`);
    case 'ex-de-hl':
      return withPrefix(inst, 'EX DE,HL');
    case 'pea':
      return withPrefix(inst, `PEA ${upper(inst.base)}${formatDisp(signedByte(inst.displacement))}`);
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'rrca':
      return withPrefix(inst, 'RRCA');
    case 'rra':
      return withPrefix(inst, 'RRA');
    case 'rlca':
      return withPrefix(inst, 'RLCA');
    case 'rla':
      return withPrefix(inst, 'RLA');
    case 'daa':
      return withPrefix(inst, 'DAA');
    case 'cpl':
      return withPrefix(inst, 'CPL');
    case 'scf':
      return withPrefix(inst, 'SCF');
    case 'ccf':
      return withPrefix(inst, 'CCF');
    case 'jp-indirect':
      return withPrefix(inst, `JP (${upper(inst.indirectRegister)})`);
    case 'di':
      return withPrefix(inst, 'DI');
    case 'ei':
      return withPrefix(inst, 'EI');
    case 'nop':
      return withPrefix(inst, 'NOP');
    case 'xor':
      return withPrefix(inst, `XOR ${upper(inst.src ?? 'A')}`);
    case 'db':
      return withPrefix(inst, `DB ${hex(inst.value, 2)}`);
    default:
      return withPrefix(inst, `[${inst.tag}]`);
  }
}

function matchesAt(offset, bytes) {
  for (let i = 0; i < bytes.length; i++) {
    if (rom[offset + i] !== bytes[i]) {
      return false;
    }
  }
  return true;
}

function findFunctionEnd() {
  for (let offset = START; offset <= SCAN_END_EXCLUSIVE - EPILOGUE_PATTERN.length; offset++) {
    if (matchesAt(offset, EPILOGUE_PATTERN)) {
      return offset + EPILOGUE_PATTERN.length - 1;
    }
  }
  // Fallback: look for plain RET
  for (let offset = START; offset < SCAN_END_EXCLUSIVE; offset++) {
    if (rom[offset] === 0xC9) {
      return offset;
    }
  }
  throw new Error('Could not locate function end within scan window.');
}

function analyzeInstruction(pc, inst, comments, summary) {
  if (inst.tag === 'call') {
    summary.callSites.push({ pc, target: inst.target });
    const label = CALL_LABELS.get(inst.target);
    if (label) {
      comments.push(`call ${hex(inst.target)} (${label})`);
    }
  }

  if (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jr' || inst.tag === 'jr-conditional') {
    summary.branches.push({
      pc,
      text: formatInstruction(inst),
    });
  }

  if (inst.tag === 'ld-pair-mem' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
    const addr = inst.addr;
    if (typeof addr === 'number' && isRam(addr)) {
      if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair' || inst.direction === 'to-mem') {
        summary.ramWrites.push({ pc, addr, text: formatInstruction(inst) });
        comments.push(`RAM write ${formatAddress(addr, 6, RAM_LABELS)}`);
      } else {
        summary.ramReads.push({ pc, addr, text: formatInstruction(inst) });
        comments.push(`RAM read ${formatAddress(addr, 6, RAM_LABELS)}`);
      }
    }
  }

  if (inst.tag === 'in-reg' || inst.tag === 'in-imm' || inst.tag === 'out-reg' || inst.tag === 'out-imm') {
    summary.portIo.push({ pc, text: formatInstruction(inst) });
  }
}

function disassembleRange(start, stopExclusive, rows, summary) {
  for (let pc = start; pc < stopExclusive; ) {
    const inst = safeDecode(pc);
    const comments = [];
    analyzeInstruction(pc, inst, comments, summary);
    rows.push({
      pc,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      text: formatInstruction(inst),
      comments,
    });
    pc = inst.nextPc;
  }
}

function scanDirectCallers(pattern) {
  const callers = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc++) {
    if (matchesAt(pc, pattern)) {
      callers.push(pc);
    }
  }
  return callers;
}

function pushUniqueAddress(list, addr) {
  if (!list.includes(addr)) {
    list.push(addr);
  }
}

// Also disassemble 0x00CB7B briefly to show the primary constructor
function disassemblePrimary() {
  const rows = [];
  const summary = { callSites: [], ramReads: [], ramWrites: [], portIo: [], branches: [] };
  disassembleRange(PRIMARY_START, PRIMARY_END + 1, rows, summary);
  return { rows, summary };
}

// ---- Main ----

const END = findFunctionEnd();
const BYTE_COUNT = END - START + 1;

const rows = [];
const summary = {
  callSites: [],
  ramReads: [],
  ramWrites: [],
  portIo: [],
  branches: [],
};

disassembleRange(START, END + 1, rows, summary);

const callers = scanDirectCallers(CALL_PATTERN);
const jumpThunks = scanDirectCallers(JP_PATTERN);

const uniqueCallTargets = [...new Set(summary.callSites.map((site) => site.target))].sort((a, b) => a - b);
const uniqueRamReads = [];
const uniqueRamWrites = [];
for (const entry of summary.ramReads) {
  pushUniqueAddress(uniqueRamReads, entry.addr);
}
for (const entry of summary.ramWrites) {
  pushUniqueAddress(uniqueRamWrites, entry.addr);
}

// Disassemble primary constructor for comparison
const primary = disassemblePrimary();

const lines = [];
lines.push('# Phase 425 Probe: Static Trace of 0x00CBE9 (Secondary Descriptor Constructor)');
lines.push('');
lines.push(`## Function Span`);
lines.push('');
lines.push(`Address range: ${hex(START)}..${hex(END)} (${BYTE_COUNT} bytes)`);
lines.push(`Primary constructor (0x00CB7B): ${hex(PRIMARY_START)}..${hex(PRIMARY_END)} (${PRIMARY_END - PRIMARY_START + 1} bytes)`);
lines.push(`Secondary constructor starts immediately after primary's RET at ${hex(PRIMARY_END)}.`);
lines.push(`They are adjacent but separate functions (no shared code paths).`);
lines.push('');

lines.push('## Relationship to 0x00CB7B');
lines.push('');
lines.push('The primary constructor at 0x00CB7B ends with the standard epilogue `DD F9 DD E1 C9` at');
lines.push(`${hex(0x00CBE4)}..${hex(0x00CBE8)}. The secondary constructor begins at ${hex(START)},`);
lines.push('immediately after. They do not share any code — no fall-through, no shared tail.');
lines.push('0x00CD7B calls 0x00CB7B first, then 0x00CBE9 for additional field setup.');
lines.push('');

lines.push('## Stack Frame');
lines.push('');
lines.push(`- Prologue ${hex(START)}..${hex(0x00CBED)}: \`LD HL,0xFFFFFA\` then \`CALL 0x002197\` reserves a 6-byte local frame.`);
lines.push(`- Epilogue ${hex(0x00CC6C)}..${hex(END)}: \`DD F9 ; DD E1 ; RET\`.`);
lines.push(`- Local 24-bit temporaries are written at ${hex(0x00CC4E)} (\`IX-3\`) and ${hex(0x00CC54)} (\`IX-6\`).`);
lines.push(`- The repeated ${hex(0x00CBF1)} / ${hex(0x00CC06)} / ${hex(0x00CC21)} / ${hex(0x00CC29)} / ${hex(0x00CC3B)} / ${hex(0x00CC48)} / ${hex(0x00CC57)} / ${hex(0x00CC64)} \`DD 31 xx\` forms are the key register-rebind points in this helper.`);
lines.push('');

lines.push('## Disassembly: 0x00CBE9 (Secondary Descriptor Constructor)');
lines.push('');
for (const row of rows) {
  lines.push(
    `${hex(row.pc)}  ${row.bytes.padEnd(20, ' ')} ${row.text.padEnd(38, ' ')}${row.comments.length ? ` ; ${row.comments.join(' | ')}` : ''}`
  );
}
lines.push('');

lines.push('## Disassembly: 0x00CB7B (Primary Constructor, for reference)');
lines.push('');
for (const row of primary.rows) {
  lines.push(
    `${hex(row.pc)}  ${row.bytes.padEnd(20, ' ')} ${row.text.padEnd(38, ' ')}${row.comments.length ? ` ; ${row.comments.join(' | ')}` : ''}`
  );
}
lines.push('');

lines.push('## CALL Targets');
lines.push('');
if (uniqueCallTargets.length === 0) {
  lines.push('- none');
} else {
  for (const target of uniqueCallTargets) {
    const sites = summary.callSites.filter((site) => site.target === target).map((site) => hex(site.pc)).join(', ');
    lines.push(`- ${hex(target)}${CALL_LABELS.has(target) ? ` (${CALL_LABELS.get(target)})` : ''} <- ${sites}`);
  }
}
lines.push('');

lines.push('## RAM Reads');
lines.push('');
if (uniqueRamReads.length === 0) {
  lines.push('- none (all field access is via IX-relative indexing)');
} else {
  for (const addr of uniqueRamReads) {
    lines.push(`- ${formatAddress(addr, 6, RAM_LABELS)}`);
  }
}
lines.push('');

lines.push('## RAM Writes');
lines.push('');
if (uniqueRamWrites.length === 0) {
  lines.push('- none (all field writes are via IX-relative or IY-relative indexing)');
} else {
  for (const addr of uniqueRamWrites) {
    lines.push(`- ${formatAddress(addr, 6, RAM_LABELS)}`);
  }
}
lines.push('');

lines.push('## Port I/O');
lines.push('');
if (summary.portIo.length === 0) {
  lines.push('- none');
} else {
  for (const access of summary.portIo) {
    lines.push(`- ${hex(access.pc)} ${access.text}`);
  }
}
lines.push('');

lines.push('## Branches');
lines.push('');
if (summary.branches.length === 0) {
  lines.push('- none');
} else {
  for (const branch of summary.branches) {
    lines.push(`- ${hex(branch.pc)} ${branch.text}`);
  }
}
lines.push('');

lines.push('## Direct Callers of 0x00CBE9');
lines.push('');
if (callers.length === 0) {
  lines.push('- none found');
} else {
  for (const caller of callers) {
    lines.push(`- ${hex(caller)}`);
  }
}
lines.push('');

lines.push('## JP Thunks to 0x00CBE9');
lines.push('');
if (jumpThunks.length === 0) {
  lines.push('- none');
} else {
  for (const thunk of jumpThunks) {
    lines.push(`- ${hex(thunk)}`);
  }
}

console.log(lines.join('\n'));
