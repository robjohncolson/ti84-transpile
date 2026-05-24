#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const TARGET = 0x00CB14;
const BACKWARD_SCAN = 0xC8;
const RAM_LABELS = new Map([
  [0xD14017, 'master pool base'],
  [0xD1401A, 'selector-0 slab base'],
  [0xD1401D, 'selector-0 slab end/sentinel'],
  [0xD14020, 'selector-2 slab base'],
  [0xD14014, 'live context pointer'],
  [0xD13FED, 'connection table base'],
]);
const CONTROL_OPS = new Map([
  [0xC2, 'JP NZ'],
  [0xC3, 'JP'],
  [0xC4, 'CALL NZ'],
  [0xCA, 'JP Z'],
  [0xCC, 'CALL Z'],
  [0xCD, 'CALL'],
  [0xD2, 'JP NC'],
  [0xD4, 'CALL NC'],
  [0xDA, 'JP C'],
  [0xDC, 'CALL C'],
  [0xE2, 'JP PO'],
  [0xE4, 'CALL PO'],
  [0xEA, 'JP PE'],
  [0xEC, 'CALL PE'],
  [0xF2, 'JP P'],
  [0xF4, 'CALL P'],
  [0xFA, 'JP M'],
  [0xFC, 'CALL M'],
]);
const EPILOGUE = [0xDD, 0xF9, 0xDD, 0xE1, 0xC9];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
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
  return `(${upper(base)}${formatDisp(signedByte(displacement))})`;
}

function labelFor(addr) {
  return RAM_LABELS.get(addr) ?? null;
}

function formatAddrLabel(addr) {
  const label = labelFor(addr);
  return `${hex(addr)}${label ? ` (${label})` : ''}`;
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
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
      }
      return withPrefix(inst, `LD ${upper(inst.pair)},(${hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`);
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
    case 'lea': {
      const disp = signedByte(inst.displacement);
      return withPrefix(inst, `LEA ${upper(inst.dest)},${upper(inst.base)}${disp >= 0 ? `+${disp}` : disp}`);
    }
    case 'bit-set':
      return withPrefix(inst, `SET ${inst.bit},${upper(inst.reg)}`);
    case 'bit-test':
      return withPrefix(inst, `BIT ${inst.bit},${upper(inst.reg)}`);
    case 'rotate-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.reg)}`);
    case 'in-reg':
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'out-reg':
      return withPrefix(inst, `OUT (C),${upper(inst.reg)}`);
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'ei':
      return withPrefix(inst, 'EI');
    case 'di':
      return withPrefix(inst, 'DI');
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

function isFramesetPrologue(pc) {
  return (
    rom[pc] === 0x21 &&
    rom[pc + 4] === 0xCD &&
    rom[pc + 5] === 0x97 &&
    rom[pc + 6] === 0x21 &&
    rom[pc + 7] === 0x00
  );
}

function isFrameset0Prologue(pc) {
  return rom[pc] === 0xCD && rom[pc + 1] === 0x8A && rom[pc + 2] === 0x21 && rom[pc + 3] === 0x00;
}

function findFunctionEntry(target, maxBack = BACKWARD_SCAN) {
  const min = Math.max(0, target - maxBack);
  let fallback = null;

  for (let pc = target; pc >= min; pc--) {
    if (isFramesetPrologue(pc) || isFrameset0Prologue(pc)) {
      return pc;
    }
    if (pc > 0 && rom[pc - 1] === 0xC9 && fallback == null) {
      fallback = pc;
    }
  }

  return fallback;
}

function findFunctionEnd(entry, maxForward = 0x200) {
  const limit = Math.min(rom.length - EPILOGUE.length, entry + maxForward);
  for (let pc = entry; pc <= limit; pc++) {
    if (matchesAt(pc, EPILOGUE)) {
      return pc + EPILOGUE.length - 1;
    }
  }

  for (let pc = entry; pc < Math.min(rom.length, entry + maxForward); pc++) {
    if (rom[pc] === 0xC9) {
      return pc;
    }
  }

  return null;
}

function decodeRows(start, endExclusive) {
  const rows = [];
  for (let pc = start; pc < endExclusive; ) {
    const inst = safeDecode(pc);
    rows.push({
      pc,
      inst,
      bytes: formatBytes(pc, inst.length),
      text: formatInstruction(inst),
    });
    pc = inst.nextPc;
  }
  return rows;
}

function findControlRefs(target) {
  const refs = [];
  for (let pc = 0; pc < rom.length - 4; pc++) {
    const opcode = rom[pc];
    if (!CONTROL_OPS.has(opcode)) {
      continue;
    }
    if (read24(pc + 1) !== target) {
      continue;
    }
    const inst = safeDecode(pc);
    if (typeof inst.target === 'number' && inst.target === target) {
      refs.push({
        pc,
        opcode,
        kind: CONTROL_OPS.get(opcode),
        text: formatInstruction(inst),
      });
    }
  }
  return refs;
}

function extractImmediatePushArgs(callPc, backBytes = 0x20) {
  const rows = decodeRows(Math.max(0, callPc - backBytes), callPc);
  const args = [];
  let pendingBcImm = null;

  for (const row of rows) {
    if (row.inst.tag === 'ld-pair-imm' && row.inst.pair === 'bc') {
      pendingBcImm = row.inst.value;
      continue;
    }
    if (row.inst.tag === 'push' && row.inst.pair === 'bc' && pendingBcImm != null) {
      args.push(pendingBcImm);
      pendingBcImm = null;
      continue;
    }
    if (row.inst.tag !== 'nop') {
      pendingBcImm = null;
    }
  }

  return args;
}

function formatArgList(values) {
  return values.length === 0 ? 'none recovered' : values.map((value) => hex(value)).join(', ');
}

function formatRows(rows) {
  return rows.map((row) => `${hex(row.pc)}  ${row.bytes.padEnd(20, ' ')} ${row.text}`);
}

function hexDump(start, endExclusive) {
  const lines = [];
  for (let addr = start; addr < endExclusive; addr += 16) {
    const width = Math.min(16, endExclusive - addr);
    lines.push(`${hex(addr)}: ${formatBytes(addr, width)}`);
  }
  return lines;
}

const helperEntry = findFunctionEntry(TARGET);
if (helperEntry == null) {
  throw new Error(`Could not locate a function entry within ${BACKWARD_SCAN} bytes of ${hex(TARGET)}.`);
}

const helperEnd = findFunctionEnd(helperEntry);
if (helperEnd == null) {
  throw new Error(`Could not locate a function end after ${hex(helperEntry)}.`);
}

const helperRows = decodeRows(helperEntry, helperEnd + 1);
const helperRowMap = new Map(helperRows.map((row) => [row.pc, row]));
const directHelperCallers = findControlRefs(helperEntry);
const helperCaller = directHelperCallers[0] ?? null;
const wrapperEntry = helperCaller ? findFunctionEntry(helperCaller.pc) : null;
const wrapperEnd = wrapperEntry != null ? findFunctionEnd(wrapperEntry, 0x300) : null;
const wrapperCallers = wrapperEntry != null ? findControlRefs(wrapperEntry) : [];

const baseCandidate = read24(0x00CAFD);
const alignMask1 = read24(0x00CB04);
const baseAligned = (baseCandidate & alignMask1) >>> 0;
const pool0Base = (baseAligned + read24(0x00CB1D)) >>> 0;
const sentinelSeed = (pool0Base + read24(0x00CB30) + read24(0x00CB3B)) >>> 0;
const alignMask2 = read24(0x00CB43);
const pool0End = (sentinelSeed & alignMask2) >>> 0;
const pool2Base = (pool0End + read24(0x00CB5C)) >>> 0;
const workspaceEnd = (pool2Base + read24(0x00CB6C)) >>> 0;

const storeSites = [
  { pc: 0x00CB14, addr: 0xD14017 },
  { pc: 0x00CB27, addr: 0xD1401A },
  { pc: 0x00CB53, addr: 0xD1401D },
  { pc: 0x00CB66, addr: 0xD14020 },
];

const alignHelperRows = decodeRows(0x0021A7, 0x0021C2);
const sourceWindowRows = helperRows.filter((row) => row.pc >= 0x00CAFC && row.pc <= 0x00CB27);

const lines = [];
lines.push('Phase 427 - Trace BC Value at 0x00CB14');
lines.push(`ROM: ${romPath}`);
lines.push(`Target store: ${hex(TARGET)} = ${helperRowMap.get(TARGET)?.text ?? 'unknown'}`);
lines.push('');

lines.push('=== BACKWARD SCAN TO FIND FUNCTION ENTRY ===');
lines.push(`Scanned ${hex(Math.max(0, TARGET - BACKWARD_SCAN))}..${hex(TARGET)} for a frameset prologue or a post-RET boundary.`);
lines.push(`Detected function entry: ${hex(helperEntry)}`);
lines.push(`Detected function end:   ${hex(helperEnd)}`);
lines.push(`Function size:          ${helperEnd - helperEntry + 1} bytes`);
lines.push(`Boundary byte before entry: ${hexByte(rom[helperEntry - 1] ?? 0)} at ${hex(helperEntry - 1)}`);
lines.push('');
lines.push('Raw bytes around the boundary and target:');
lines.push(...hexDump(Math.max(helperEntry - 8, 0), Math.min(TARGET + 0x20, rom.length)));
lines.push('');

lines.push('=== FUNCTION DISASSEMBLY AROUND BC SOURCE ===');
lines.push(...formatRows(sourceWindowRows));
lines.push('');

lines.push('=== FORWARD CONFIRMATION OF THE FOUR BC STORES ===');
for (const site of storeSites) {
  const row = helperRowMap.get(site.pc);
  lines.push(`${hex(site.pc)}  ${row?.bytes ?? formatBytes(site.pc, 5)}  ${row?.text ?? 'unknown'} -> ${formatAddrLabel(site.addr)}`);
}
lines.push('');

lines.push('=== BC PROVENANCE ===');
lines.push(`Literal candidate loaded into BC: ${hex(baseCandidate)} at ${hex(0x00CAFC)}`);
lines.push(`First alignment mask loaded into BC: ${hex(alignMask1)} at ${hex(0x00CB03)}`);
lines.push(`0x0021A7 therefore receives HL=${hex(baseCandidate)} and BC=${hex(alignMask1)}.`);
lines.push(`Static evaluation: ${hex(baseCandidate)} & ${hex(alignMask1)} = ${hex(baseAligned)}`);
lines.push(`The helper stores that aligned HL into (IX-3), then ${hex(0x00CB11)} reloads BC from (IX-3).`);
lines.push(`So BC at ${hex(TARGET)} is ${hex(baseAligned)}.`);
lines.push('Conclusion: BC is not a malloc result and does not come from a callee return register.');
lines.push('It is a fixed RAM address literal that is aligned downward by a mask helper.');
lines.push('');

lines.push('=== ALIGN HELPER 0x0021A7 ===');
lines.push(...formatRows(alignHelperRows));
lines.push('Interpretation: this helper ANDs HL with BC across the full 24-bit value, so it is an align-down helper.');
lines.push('');

lines.push('=== DERIVED LAYOUT WRITTEN BY 0x00CAF4 ===');
lines.push(`${formatAddrLabel(0xD14017)} = ${hex(baseAligned)}`);
lines.push(`${formatAddrLabel(0xD1401A)} = ${hex(pool0Base)} (${hex(baseAligned)} + 0x000180)`);
lines.push(`${formatAddrLabel(0xD1401D)} = ${hex(pool0End)} (align-down of ${hex(sentinelSeed)} with ${hex(alignMask2)})`);
lines.push(`${formatAddrLabel(0xD14020)} = ${hex(pool2Base)} (${hex(pool0End)} + 0x000400)`);
lines.push(`Final local end marker (not stored globally) = ${hex(workspaceEnd)} (${hex(pool2Base)} + 0x001800)`);
lines.push('');

lines.push('=== CALL CHAIN ===');
if (directHelperCallers.length === 0) {
  lines.push(`No direct CALL/JP references found to ${hex(helperEntry)}.`);
} else {
  lines.push(`Direct references to ${hex(helperEntry)}:`);
  for (const ref of directHelperCallers) {
    lines.push(`- ${hex(ref.pc)}  ${ref.text}`);
  }
}

if (wrapperEntry != null) {
  lines.push('');
  lines.push(`Caller function containing ${hex(helperCaller.pc)}: ${hex(wrapperEntry)}..${hex(wrapperEnd ?? wrapperEntry)}${wrapperEnd != null ? ` (${wrapperEnd - wrapperEntry + 1} bytes)` : ''}`);
  lines.push('This wrapper calls 0x00CAF4 first, then clears state and later gates pool bootstrap with CALL 0x00E2EB.');
  if (wrapperCallers.length === 0) {
    lines.push(`No direct CALL/JP references found to wrapper ${hex(wrapperEntry)}.`);
  } else {
    lines.push(`Direct references to wrapper ${hex(wrapperEntry)}:`);
    for (const ref of wrapperCallers) {
      const args = extractImmediatePushArgs(ref.pc);
      lines.push(`- ${hex(ref.pc)}  ${ref.text}  ; pushed BC immediates before call: ${formatArgList(args)}`);
    }
  }
}

lines.push('');
lines.push('=== ANSWER ===');
lines.push(`BC at ${hex(TARGET)} is statically determinable as ${hex(baseAligned)}.`);
lines.push(`The value originates from a fixed literal ${hex(baseCandidate)}, aligned by helper ${hex(0x0021A7)} with mask ${hex(alignMask1)}.`);
lines.push(`The store belongs to helper ${hex(helperEntry)}..${hex(helperEnd)}, reached from wrapper ${wrapperEntry != null ? hex(wrapperEntry) : 'unknown'} and not from a malloc-style allocator call.`);

console.log(lines.join('\n'));
