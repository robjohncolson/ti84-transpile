#!/usr/bin/env node

/**
 * Phase 310 Probe: utility-family map around 0x04C960..0x04CA40
 *
 * What this probe does:
 *   1. Decodes the literal inclusive ROM window 0x04C960..0x04CA40.
 *   2. Splits the window into RET/JP-delimited linear segments.
 *   3. Catalogs the true function entry points inside that window.
 *   4. Counts direct 24-bit CALL/JP xrefs, plus non-overlapping low-word
 *      16-bit CALL/JP byte matches that may represent bank-local callers.
 *   5. Prints an annotated per-function listing and a caller-count summary.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const WINDOW_START = 0x04C960;
const WINDOW_END = 0x04CA40; // inclusive
const WINDOW_BYTES = WINDOW_END - WINDOW_START + 1;

const CALL_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
]);

const JP_OPS = new Map([
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
]);

const TRUE_ENTRIES = [
  0x04C963,
  0x04C973,
  0x04C979,
  0x04C980,
  0x04C990,
  0x04C99C,
  0x04C9A8,
  0x04C9C5,
  0x04C9D9,
  0x04C9E1,
  0x04C9EA,
  0x04C9FD,
  0x04CA1B,
  0x04CA21,
  0x04CA28,
];

const ENTRY_META = new Map([
  [0x04C963, {
    name: 'divHLByA_24',
    purpose: '24-bit shift/subtract divider',
    inputs: 'HL = dividend, A = divisor',
    outputs: 'HL = quotient, A = remainder, BC preserved',
  }],
  [0x04C973, {
    name: 'cpHL_DE_modeDependent',
    purpose: 'non-destructive HL-vs-DE compare without forced ADL prefix',
    inputs: 'HL, DE',
    outputs: 'flags from HL-DE, HL preserved',
  }],
  [0x04C979, {
    name: 'cpHL_DE',
    purpose: 'non-destructive forced-ADL 24-bit HL-vs-DE compare',
    inputs: 'HL, DE',
    outputs: 'flags from HL-DE, HL preserved',
  }],
  [0x04C980, {
    name: 'cpHL_BC_range',
    purpose: 'inclusive range test, carry set only when BC <= HL <= DE',
    inputs: 'BC = low bound, HL = probe, DE = high bound',
    outputs: 'C=1 in range, C=0 out of range, HL/DE preserved',
  }],
  [0x04C990, {
    name: 'negBC',
    purpose: '24-bit two\'s-complement negate of BC',
    inputs: 'BC',
    outputs: 'BC = -BC, HL preserved',
  }],
  [0x04C99C, {
    name: 'negDE',
    purpose: '24-bit two\'s-complement negate of DE',
    inputs: 'DE',
    outputs: 'DE = -DE, HL preserved',
  }],
  [0x04C9A8, {
    name: 'signExtTempShiftRight1',
    purpose: 'store HL to signExtTemp scratch, shift the 24-bit value right once, reload HL',
    inputs: 'HL',
    outputs: 'HL = shifted value, AF preserved, scratch RAM updated',
  }],
  [0x04C9C5, {
    name: 'findNulTerminator_bc',
    purpose: 'scan for 0x00 and return the terminator address in BC',
    inputs: 'HL = string/data pointer',
    outputs: 'BC = address of first 0x00 byte, HL/AF restored',
  }],
  [0x04C9D9, {
    name: 'memcmpB',
    purpose: 'compare B bytes at DE and HL',
    inputs: 'B = count, DE = lhs, HL = rhs',
    outputs: 'Z on full match, NZ on first mismatch, DE/HL advanced',
  }],
  [0x04C9E1, {
    name: 'addAtoHL',
    purpose: 'add unsigned A into HL using a zero-extended BC scratch',
    inputs: 'HL, A',
    outputs: 'HL = HL + A, BC preserved',
  }],
  [0x04C9EA, {
    name: 'nextPageBaseFromHL',
    purpose: 'increment HL\'s top byte, cap it at 0x3A, return xx0000',
    inputs: 'HL',
    outputs: 'HL = min(topByte(HL)+1, 0x3A) << 16',
  }],
  [0x04C9FD, {
    name: 'pageCeilingFromInitState',
    purpose: 'run 0x09DF12, compare HL top byte against D025C7, return adjusted xxFFFF page ceiling',
    inputs: 'HL, DE, D025C7',
    outputs: 'HL = adjusted page << 16 | 0xFFFF, DE preserved',
  }],
  [0x04CA1B, {
    name: 'swapHLBytes16',
    purpose: 'swap H and L while preserving AF',
    inputs: 'HL',
    outputs: 'H/L exchanged, AF preserved',
  }],
  [0x04CA21, {
    name: 'zFlagToA',
    purpose: 'turn entry Z-state into an A result',
    inputs: 'entry Z flag, A',
    outputs: 'A = A|1 when Z was set, else A = 0',
  }],
  [0x04CA28, {
    name: 'measureStringDefaultFont',
    purpose: 'select font/style 0, measure string at HL, return width in BC',
    inputs: 'HL = string pointer',
    outputs: 'BC = extent from 0x054DD4, HL/DE/AF restored',
  }],
]);

const MANUAL_NOTES = new Map([
  [0x04C960, 'tail of the previous helper; the real entry is earlier (outside this window)'],
  [0x04C963, 'entry: 24-step divider'],
  [0x04C964, 'stash divisor in C'],
  [0x04C965, 'clear A so it can hold the running remainder'],
  [0x04C966, '24 quotient bits in ADL mode'],
  [0x04C968, 'shift the dividend / quotient workspace left'],
  [0x04C969, 'rotate the next dividend bit into A'],
  [0x04C96A, 'compare remainder against divisor'],
  [0x04C96B, 'if remainder < divisor, skip the subtract'],
  [0x04C96D, 'remainder -= divisor'],
  [0x04C96E, 'set the current quotient bit'],
  [0x04C96F, 'repeat until 24 bits have been emitted'],
  [0x04C973, 'entry: compare helper without forced ADL prefix'],
  [0x04C975, 'flags reflect HL-DE; HL will be restored before return'],
  [0x04C979, 'entry: forced-ADL compare helper'],
  [0x04C97B, 'SIL prefix forces the 24-bit SBC HL,DE form'],
  [0x04C980, 'entry: inclusive range test'],
  [0x04C982, 'test HL against the low bound BC'],
  [0x04C984, 'below the low bound jumps directly to carry fixup'],
  [0x04C989, 'swap so the next subtract computes DE-HL'],
  [0x04C98A, 'test the high bound via DE-HL'],
  [0x04C98D, 'flip carry so C=1 means "in range"'],
  [0x04C990, 'entry: negate BC'],
  [0x04C991, 'start from zero so SBC computes 0-BC'],
  [0x04C998, 'use the stack to move the result into BC'],
  [0x04C99C, 'entry: negate DE'],
  [0x04C9A4, 'use the stack to move the result into DE'],
  [0x04C9A8, 'entry: signExtTemp scratch / shift helper'],
  [0x04C9A9, 'save HL to signExtTemp (0xD02AD7..0xD02AD9)'],
  [0x04C9AD, 'load the high byte of the scratch value'],
  [0x04C9B1, 'shift the high byte right'],
  [0x04C9B3, 'store the shifted high byte back'],
  [0x04C9B7, 'rotate the carry from A into H'],
  [0x04C9B9, 'rotate the carry from H into L'],
  [0x04C9BB, 'rewrite the low 16 bits through the current MBASE'],
  [0x04C9BF, 'reload the final shifted 24-bit value into HL'],
  [0x04C9C5, 'entry: scan for a trailing 0x00'],
  [0x04C9C7, 'BC=0 gives CPIR an all-the-way-to-wrap scan budget'],
  [0x04C9CC, 'search for a zero byte'],
  [0x04C9CD, 'walk forward until A (0x00) matches (HL)'],
  [0x04C9D1, 'original HL - wrapped BC = address just past the terminator'],
  [0x04C9D3, 'back up to the actual 0x00 byte'],
  [0x04C9D4, 'return the terminator address in BC'],
  [0x04C9D9, 'entry: byte compare loop'],
  [0x04C9DB, 'early-out on the first mismatch'],
  [0x04C9DE, 'consume one byte pair and loop until B reaches zero'],
  [0x04C9E1, 'entry: HL += A'],
  [0x04C9E2, 'zero-extend A through BC'],
  [0x04C9E7, 'perform the 24-bit add'],
  [0x04C9EA, 'entry: promote HL to the next capped page base'],
  [0x04C9EA, 'entry: promote HL to the next capped page base'],
  [0x04C9EE, 'increment the top/page byte'],
  [0x04C9EF, '0x3B is one past the allowed ceiling'],
  [0x04C9F3, 'clamp back down to 0x3A'],
  [0x04C9F4, 'write the adjusted top byte back into HL'],
  [0x04C9F8, 'clear the middle byte so the return is xx0000'],
  [0x04C9FA, 'clear the low byte so the return is xx0000'],
  [0x04C9FD, 'entry: page-ceiling variant that consults MEM_INIT state'],
  [0x04C9FF, 'call 0x09DF12 to refresh the memory-init state used below'],
  [0x04CA04, 'load the current top-byte ceiling from D025C7'],
  [0x04CA08, 'keep that ceiling in E for the compare'],
  [0x04CA09, 'load HL\'s current top/page byte into A'],
  [0x04CA0D, 'is HL already at the ceiling page?'],
  [0x04CA10, 'if not, step down by one page'],
  [0x04CA11, 'store the adjusted top byte back into HL'],
  [0x04CA15, 'set the middle byte to 0xFF'],
  [0x04CA17, 'set the low byte to 0xFF'],
  [0x04CA1B, 'entry: swap the low 16-bit byte order of HL'],
  [0x04CA21, 'entry: return a Z-state-derived A result'],
  [0x04CA23, 'Z-set path returns a non-zero A by forcing bit 0'],
  [0x04CA26, 'NZ path returns A=0; this is a branch-only tail, not a true entry'],
  [0x04CA28, 'entry: default-font string-width wrapper'],
  [0x04CA2B, 'preserve the original string pointer for the width helper'],
  [0x04CA2C, 'pass selector/font argument 0 to 0x055316'],
  [0x04CA31, 'select default font/style 0'],
  [0x04CA36, 'measure the string width via 0x054DD4'],
  [0x04CA3B, 'move the returned width from HL into BC'],
  [0x04CA40, 'return; a new IX-framed routine begins immediately at 0x04CA41'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, addr + length))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function disasmAt(addr) {
  return decodeInstruction(rom, addr, 'adl');
}

function prefixText(inst) {
  return inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
}

function reg8(reg) {
  return String(reg).toUpperCase();
}

function pair(pairName) {
  return String(pairName).toUpperCase();
}

function formatInst(inst) {
  if (inst.dasm) return inst.dasm.toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `${prefixText(inst)}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefixText(inst)}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefixText(inst)}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefixText(inst)}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefixText(inst)}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefixText(inst)}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefixText(inst)}DJNZ ${hex(inst.target)}`;
    case 'ret':
      return `${prefixText(inst)}RET`;
    case 'ret-conditional':
      return `${prefixText(inst)}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefixText(inst)}PUSH ${pair(inst.pair)}`;
    case 'pop':
      return `${prefixText(inst)}POP ${pair(inst.pair)}`;
    case 'ld-reg-reg':
      return `${prefixText(inst)}LD ${reg8(inst.dest)}, ${reg8(inst.src)}`;
    case 'ld-reg-imm':
      return `${prefixText(inst)}LD ${reg8(inst.dest)}, ${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `${prefixText(inst)}LD ${reg8(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefixText(inst)}LD (${hex(inst.addr)}), ${reg8(inst.src)}`;
    case 'ld-pair-imm':
      return `${prefixText(inst)}LD ${pair(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `${prefixText(inst)}LD (${hex(inst.addr)}), ${pair(inst.pair)}`;
      return `${prefixText(inst)}LD ${pair(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefixText(inst)}LD (${hex(inst.addr)}), ${pair(inst.pair)}`;
    case 'add-pair':
      return `${prefixText(inst)}ADD ${pair(inst.dest)}, ${pair(inst.src)}`;
    case 'sbc-pair':
      return `${prefixText(inst)}SBC HL, ${pair(inst.src)}`;
    case 'alu-reg':
      return `${prefixText(inst)}${String(inst.op).toUpperCase()} ${reg8(inst.src)}`;
    case 'alu-imm':
      return `${prefixText(inst)}${String(inst.op).toUpperCase()} ${hex(inst.value, 2)}`;
    case 'inc-reg':
      return `${prefixText(inst)}INC ${reg8(inst.reg)}`;
    case 'dec-reg':
      return `${prefixText(inst)}DEC ${reg8(inst.reg)}`;
    case 'inc-pair':
      return `${prefixText(inst)}INC ${pair(inst.pair)}`;
    case 'dec-pair':
      return `${prefixText(inst)}DEC ${pair(inst.pair)}`;
    case 'ex-de-hl':
      return `${prefixText(inst)}EX DE, HL`;
    case 'ccf':
      return `${prefixText(inst)}CCF`;
    case 'cpir':
      return `${prefixText(inst)}CPIR`;
    case 'rotate-reg':
      return `${prefixText(inst)}${String(inst.op).toUpperCase()} ${reg8(inst.reg)}`;
    case 'mlt':
      return `${prefixText(inst)}MLT ${pair(inst.pair || inst.reg)}`;
    default:
      return `${prefixText(inst)}[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

function genericNote(inst) {
  switch (inst.tag) {
    case 'ret':
      return 'return to caller';
    case 'ret-conditional':
      return `return early if ${String(inst.condition).toUpperCase()} is true`;
    case 'push':
      return `save ${pair(inst.pair)}`;
    case 'pop':
      return `restore ${pair(inst.pair)}`;
    case 'ld-reg-reg':
      return `copy ${reg8(inst.src)} into ${reg8(inst.dest)}`;
    case 'ld-reg-imm':
      return `load immediate into ${reg8(inst.dest)}`;
    case 'ld-pair-imm':
      return `load immediate into ${pair(inst.pair)}`;
    case 'ld-reg-mem':
      return `load ${reg8(inst.dest)} from fixed memory`;
    case 'ld-mem-reg':
      return `store ${reg8(inst.src)} to fixed memory`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `store ${pair(inst.pair)} to fixed memory`
        : `load ${pair(inst.pair)} from fixed memory`;
    case 'ld-mem-pair':
      return `store ${pair(inst.pair)} to fixed memory`;
    case 'add-pair':
      return `${pair(inst.dest)} += ${pair(inst.src)}`;
    case 'sbc-pair':
      return `HL = HL - ${pair(inst.src)} - carry`;
    case 'alu-reg':
      if (inst.op === 'or' && inst.src === 'a') return 'clear carry without changing A';
      if (inst.op === 'sub' && inst.src === 'a') return 'clear A';
      return `${String(inst.op).toUpperCase()} against ${reg8(inst.src)}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} against immediate`;
    case 'inc-reg':
      return `increment ${reg8(inst.reg)}`;
    case 'dec-reg':
      return `decrement ${reg8(inst.reg)}`;
    case 'inc-pair':
      return `increment ${pair(inst.pair)}`;
    case 'dec-pair':
      return `decrement ${pair(inst.pair)}`;
    case 'jr':
      return `branch to ${hex(inst.target)}`;
    case 'jr-conditional':
      return `branch to ${hex(inst.target)} when ${String(inst.condition).toUpperCase()} is true`;
    case 'djnz':
      return `decrement B and loop while B != 0`;
    case 'ex-de-hl':
      return 'swap DE and HL';
    case 'ccf':
      return 'invert carry';
    case 'cpir':
      return 'compare A against (HL), advance HL, and repeat until match/BC=0';
    case 'rotate-reg':
      return `${String(inst.op).toUpperCase()} ${reg8(inst.reg)}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${hex(inst.target)} when ${String(inst.condition).toUpperCase()} is true`;
    case 'jp':
      return `jump to ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jump to ${hex(inst.target)} when ${String(inst.condition).toUpperCase()} is true`;
    default:
      return '';
  }
}

function noteFor(addr, inst) {
  return MANUAL_NOTES.get(addr) ?? genericNote(inst);
}

function decodeRange(start, endInclusive) {
  const lines = [];
  let pc = start;

  while (pc <= endInclusive) {
    const inst = disasmAt(pc);
    lines.push({
      addr: pc,
      inst,
      bytes: bytesAt(pc, inst.length),
      text: formatInst(inst),
      note: noteFor(pc, inst),
    });
    pc += inst.length;
  }

  return lines;
}

function splitSegments(lines) {
  const segments = [];
  let current = [];

  for (const line of lines) {
    current.push(line);
    if (line.inst.tag === 'ret' || line.inst.tag === 'jp' || line.inst.tag === 'jp-hl' || line.inst.tag === 'reti' || line.inst.tag === 'retn') {
      segments.push(current);
      current = [];
    }
  }

  if (current.length) segments.push(current);
  return segments;
}

function scanRefs(target) {
  const refs24 = [];
  const direct24Sites = new Set();

  for (let addr = 0; addr < rom.length - 3; addr += 1) {
    const op = rom[addr];
    const mnemonic = CALL_OPS.get(op) ?? JP_OPS.get(op);
    if (!mnemonic) continue;

    if (
      rom[addr + 1] === (target & 0xFF) &&
      rom[addr + 2] === ((target >>> 8) & 0xFF) &&
      rom[addr + 3] === ((target >>> 16) & 0xFF)
    ) {
      refs24.push({ addr, mnemonic });
      direct24Sites.add(addr);
    }
  }

  const refs16 = [];
  for (let addr = 0; addr < rom.length - 2; addr += 1) {
    const op = rom[addr];
    const mnemonic = CALL_OPS.get(op) ?? JP_OPS.get(op);
    if (!mnemonic || direct24Sites.has(addr)) continue;

    if (
      rom[addr + 1] === (target & 0xFF) &&
      rom[addr + 2] === ((target >>> 8) & 0xFF)
    ) {
      refs16.push({ addr, mnemonic });
    }
  }

  return {
    refs24,
    refs16,
    direct24: refs24.length,
    possible16: refs16.length,
    totalKnown: refs24.length + refs16.length,
  };
}

function entryEnd(entry) {
  if (entry === 0x04CA21) return 0x04CA27;
  const index = TRUE_ENTRIES.indexOf(entry);
  if (index === TRUE_ENTRIES.length - 1) return WINDOW_END;
  return TRUE_ENTRIES[index + 1] - 1;
}

function printRule(ch = '=', width = 96) {
  console.log(ch.repeat(width));
}

function printSection(title) {
  console.log('');
  printRule('=');
  console.log(title);
  printRule('=');
}

function formatRefsSummary(refs) {
  const extra = refs.possible16 ? ` + ${refs.possible16} extra short-form 16-bit matches` : '';
  return `${refs.totalKnown} total (${refs.direct24} direct 24-bit${extra})`;
}

function formatSegmentKind(segment, inboundBranches) {
  const start = segment[0].addr;
  if (start === WINDOW_START) return 'partial tail of earlier helper';
  if (ENTRY_META.has(start)) return 'true entry';
  if ((inboundBranches.get(start) ?? 0) > 0) return 'branch-only tail';
  return 'ret-delimited fragment';
}

function main() {
  const lines = decodeRange(WINDOW_START, WINDOW_END);
  const segments = splitSegments(lines);
  const inboundBranches = new Map();

  for (const line of lines) {
    const tag = line.inst.tag;
    if (!['jr', 'jr-conditional', 'jp', 'jp-conditional', 'djnz'].includes(tag)) continue;
    const target = line.inst.target;
    if (target >= WINDOW_START && target <= WINDOW_END) {
      inboundBranches.set(target, (inboundBranches.get(target) ?? 0) + 1);
    }
  }

  printRule('=');
  console.log('Phase 310 - Utility Family Map');
  printRule('=');
  console.log(`Window: ${hex(WINDOW_START)}..${hex(WINDOW_END)} inclusive (${WINDOW_BYTES} bytes)`);
  console.log('Note: the literal address span is wider than the "128 bytes" wording in the task.');
  console.log('The window opens on a helper tail at 0x04C960..0x04C962; the first full in-window entry is 0x04C963.');
  console.log('Caller counts below report direct 24-bit CALL/JP sites plus any non-overlapping low-word 16-bit byte matches.');

  printSection('RET/JP-delimited segments');
  for (const segment of segments) {
    const start = segment[0].addr;
    const end = segment[segment.length - 1].addr + segment[segment.length - 1].inst.length - 1;
    const kind = formatSegmentKind(segment, inboundBranches);
    console.log(`${hex(start)}..${hex(end)}  ${kind}`);
  }
  console.log(`${hex(0x04CA41)}..      next IX-framed routine begins immediately after the requested window`);

  const catalog = TRUE_ENTRIES.map((entry) => {
    const end = entryEnd(entry);
    const body = lines.filter((line) => line.addr >= entry && line.addr <= end);
    const refs = scanRefs(entry);
    return {
      entry,
      end,
      size: end - entry + 1,
      meta: ENTRY_META.get(entry),
      refs,
      body,
    };
  });

  printSection('Catalog');
  console.log(
    `${'Entry'.padEnd(10)} ${'End'.padEnd(10)} ${'Bytes'.padEnd(6)} ${'Callers'.padEnd(28)} ${'Name / purpose'}`
  );
  printRule('-');
  for (const item of catalog) {
    const callers = formatRefsSummary(item.refs).padEnd(28);
    console.log(
      `${hex(item.entry).padEnd(10)} ${hex(item.end).padEnd(10)} ${String(item.size).padEnd(6)} ${callers} ${item.meta.name} - ${item.meta.purpose}`
    );
  }

  printSection('Most-called helpers');
  const ranked = [...catalog].sort((a, b) => {
    if (b.refs.totalKnown !== a.refs.totalKnown) return b.refs.totalKnown - a.refs.totalKnown;
    if (b.refs.direct24 !== a.refs.direct24) return b.refs.direct24 - a.refs.direct24;
    return a.entry - b.entry;
  });
  ranked.slice(0, 8).forEach((item, index) => {
    console.log(
      `${String(index + 1).padStart(2, ' ')}. ${hex(item.entry)}  ${String(item.refs.totalKnown).padStart(3, ' ')} callers  ${item.meta.name}`
    );
  });
  console.log('');
  console.log(
    ranked[0].entry === 0x04C979
      ? `0x04C979 remains the most-called utility in this window with ${ranked[0].refs.totalKnown} callers.`
      : `${hex(ranked[0].entry)} overtook 0x04C979 in this window scan.`
  );
  if (ranked[0].entry === 0x04C979 && ranked[0].refs.totalKnown === 252) {
    console.log('No utility in this family exceeds cpHL_DE\'s previously known 252 direct callers.');
  }

  printSection('Annotated disassembly by true entry');
  for (const item of catalog) {
    console.log('');
    console.log(`${hex(item.entry)}..${hex(item.end)}  ${item.meta.name}`);
    console.log(`  Purpose: ${item.meta.purpose}`);
    console.log(`  Contract: ${item.meta.inputs} -> ${item.meta.outputs}`);
    console.log(`  Callers: ${formatRefsSummary(item.refs)}`);
    if (item.refs.direct24) {
      const preview = item.refs.refs24
        .slice(0, 10)
        .map((ref) => `${hex(ref.addr)} ${ref.mnemonic}`)
        .join(', ');
      const suffix = item.refs.direct24 > 10 ? `, ... +${item.refs.direct24 - 10} more` : '';
      console.log(`  Direct 24-bit sites: ${preview}${suffix}`);
    }
    if (item.refs.possible16) {
      console.log(
        `  Extra short-form 16-bit matches: ${item.refs.refs16.map((ref) => `${hex(ref.addr)} ${ref.mnemonic}`).join(', ')}`
      );
    }
    for (const line of item.body) {
      const note = line.note ? ` ; ${line.note}` : '';
      console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(14)}  ${line.text.padEnd(28)}${note}`);
    }
  }
}

main();
