#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const ADL_MODE = 'adl';
const RAW_DUMP_BYTES = 32;
const MAX_DECODE_BYTES = 64;

const BLOCKS = [
  0x082BE2,
  0x084716,
  0x08471B,
  0x084723,
  0x084711,
];

const KNOWN_DIRECT_ADDRS = new Map([
  [0xD005F9, 'D005F9'],
  [0xD005FA, 'D005FA'],
  [0xD005FB, 'D005FB'],
  [0xD0259D, 'D0259D'],
  [0xD025A3, 'D025A3'],
]);

const UNCONDITIONAL_STOP_TAGS = new Set(['jp', 'jr', 'ret', 'reti', 'retn']);
const CONDITIONAL_CONTROL_TAGS = new Set(['jp-conditional', 'jr-conditional', 'ret-conditional']);
const COMPARISON_OPS = new Set(['cp', 'and', 'or', 'xor']);
const MEMORY_READ_TAGS = new Set([
  'ld-reg-mem',
  'ld-pair-mem',
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), hexByte).join(' ');
}

function formatRawDump(rom, start, length) {
  const lines = [];
  for (let offset = 0; offset < length; offset += 16) {
    const addr = start + offset;
    const chunkLength = Math.min(16, length - offset);
    lines.push(`  ${hex(addr)}: ${hexBytes(rom, addr, chunkLength)}`);
  }
  return lines;
}

function fmtDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function fmtIndexed(register, displacement) {
  return `(${register}${fmtDisp(displacement)})`;
}

function withModePrefix(inst, text) {
  return inst.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function fallbackMnemonic(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'kind',
    'nextMode',
  ]);
  const parts = [];
  for (const [key, value] of Object.entries(inst)) {
    if (ignored.has(key) || value === undefined || value === null || key === 'tag') {
      continue;
    }
    if (typeof value === 'number') {
      parts.push(`${key}=${hex(value)}`);
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return withModePrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(', ')}` : inst.tag);
}

function formatMnemonic(inst) {
  switch (inst.tag) {
    case 'add-pair':
      return withModePrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'alu-imm':
      return withModePrefix(inst, `${inst.op} ${hex(inst.value, 2)}`);
    case 'alu-reg':
      return withModePrefix(inst, `${inst.op} ${inst.src}`);
    case 'call':
      return withModePrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'dec-pair':
      return withModePrefix(inst, `dec ${inst.pair}`);
    case 'inc-pair':
      return withModePrefix(inst, `inc ${inst.pair}`);
    case 'jp':
      return withModePrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jr':
      return withModePrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withModePrefix(inst, `ld ${inst.pair}, (${hex(inst.addr)})`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-mem':
      return withModePrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-mem-pair':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ret':
      return withModePrefix(inst, 'ret');
    case 'ret-conditional':
      return withModePrefix(inst, `ret ${inst.condition}`);
    case 'reti':
      return withModePrefix(inst, 'reti');
    case 'retn':
      return withModePrefix(inst, 'retn');
    case 'sbc-pair':
      return withModePrefix(inst, `sbc hl, ${inst.src}`);
    case 'bit-test':
      return withModePrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind':
      return withModePrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'indexed-cb-bit':
      return withModePrefix(inst, `bit ${inst.bit}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`);
    default:
      return fallbackMnemonic(inst);
  }
}

function collectFacts(instructions) {
  const directReads = [];
  const indirectReads = [];
  const comparisons = [];
  const conditionalJumps = [];
  const directRefs = new Map();

  for (const inst of instructions) {
    if (MEMORY_READ_TAGS.has(inst.tag) && Number.isInteger(inst.addr)) {
      const addr = inst.addr >>> 0;
      directReads.push({
        pc: inst.pc,
        addr,
        text: `${formatMnemonic(inst)} @ ${hex(inst.pc)}`,
      });
      if (!directRefs.has(addr)) {
        directRefs.set(addr, []);
      }
      directRefs.get(addr).push(inst.pc);
    }

    if (inst.tag === 'ld-reg-ind') {
      indirectReads.push({
        pc: inst.pc,
        text: `${formatMnemonic(inst)} @ ${hex(inst.pc)}`,
      });
    }

    if (inst.tag === 'alu-reg' && inst.src === '(hl)') {
      indirectReads.push({
        pc: inst.pc,
        text: `${formatMnemonic(inst)} @ ${hex(inst.pc)}`,
      });
    }

    if (inst.tag === 'bit-test-ind' || inst.tag === 'indexed-cb-bit') {
      indirectReads.push({
        pc: inst.pc,
        text: `${formatMnemonic(inst)} @ ${hex(inst.pc)}`,
      });
    }

    if (inst.tag === 'alu-imm' && COMPARISON_OPS.has(inst.op)) {
      comparisons.push({
        pc: inst.pc,
        text: `${formatMnemonic(inst)} @ ${hex(inst.pc)}`,
      });
    }

    if (inst.tag === 'alu-reg' && COMPARISON_OPS.has(inst.op)) {
      comparisons.push({
        pc: inst.pc,
        text: `${formatMnemonic(inst)} @ ${hex(inst.pc)}`,
      });
    }

    if (inst.tag === 'bit-test' || inst.tag === 'bit-test-ind' || inst.tag === 'indexed-cb-bit') {
      comparisons.push({
        pc: inst.pc,
        text: `${formatMnemonic(inst)} @ ${hex(inst.pc)}`,
      });
    }

    if (CONDITIONAL_CONTROL_TAGS.has(inst.tag)) {
      conditionalJumps.push({
        pc: inst.pc,
        text: `${formatMnemonic(inst)} @ ${hex(inst.pc)}`,
      });
    }
  }

  return {
    directReads,
    indirectReads,
    comparisons,
    conditionalJumps,
    directRefs,
  };
}

function decodeBlock(rom, start) {
  const instructions = [];
  let pc = start;
  let consumed = 0;

  while (consumed < MAX_DECODE_BYTES && pc < rom.length) {
    try {
      const inst = decodeInstruction(rom, pc, ADL_MODE);
      const length = Math.max(inst.length ?? 1, 1);
      const bytes = hexBytes(rom, pc, length);
      instructions.push({
        ...inst,
        bytes,
      });
      pc += length;
      consumed += length;
      if (UNCONDITIONAL_STOP_TAGS.has(inst.tag)) {
        break;
      }
    } catch (error) {
      instructions.push({
        pc,
        length: 1,
        tag: 'db',
        bytes: hexBytes(rom, pc, 1),
        error: error instanceof Error ? error.message : String(error),
      });
      pc += 1;
      consumed += 1;
      break;
    }
  }

  return instructions;
}

function formatAddressRef(addr) {
  const label = KNOWN_DIRECT_ADDRS.get(addr >>> 0);
  return label ? `${hex(addr)} (${label})` : hex(addr);
}

function printFactList(title, values) {
  console.log(`${title}:`);
  if (values.length === 0) {
    console.log('  none');
    return;
  }
  for (const value of values) {
    console.log(`  ${value}`);
  }
}

function printBlock(blockAddr, rom, instructions) {
  console.log(`=== Block ${hex(blockAddr)} ===`);
  console.log(`Raw first ${RAW_DUMP_BYTES} bytes:`);
  for (const line of formatRawDump(rom, blockAddr, RAW_DUMP_BYTES)) {
    console.log(line);
  }
  console.log('Disassembly:');
  for (const inst of instructions) {
    if (inst.tag === 'db') {
      console.log(`  ${hex(inst.pc)}: ${inst.bytes.padEnd(11)} db ${inst.bytes}  [decode error: ${inst.error}]`);
      continue;
    }
    console.log(`  ${hex(inst.pc)}: ${inst.bytes.padEnd(11)} ${formatMnemonic(inst)}`);
  }

  const facts = collectFacts(instructions);
  printFactList(
    'Direct memory reads',
    facts.directReads.map((entry) => `${formatAddressRef(entry.addr)} via ${entry.text}`),
  );
  printFactList(
    'Indirect memory reads',
    facts.indirectReads.map((entry) => entry.text),
  );
  printFactList(
    'Comparisons/tests',
    facts.comparisons.map((entry) => entry.text),
  );
  printFactList(
    'Conditional jumps',
    facts.conditionalJumps.map((entry) => entry.text),
  );
  console.log('');
}

function buildCombinedInstructionMap(blockResults) {
  const instructions = new Map();
  for (const block of blockResults) {
    for (const inst of block.instructions) {
      if (inst.tag === 'db') {
        continue;
      }
      if (!instructions.has(inst.pc)) {
        instructions.set(inst.pc, inst);
      }
    }
  }
  return instructions;
}

function printReferenceCheck(directRefs) {
  console.log('Reference check:');
  for (const [addr, label] of KNOWN_DIRECT_ADDRS.entries()) {
    const refs = directRefs.get(addr);
    if (!refs || refs.length === 0) {
      console.log(`  ${label}: no direct reference in these five blocks`);
      continue;
    }
    console.log(`  ${label}: yes (${refs.map((pc) => hex(pc)).join(', ')})`);
  }
  console.log('');
}

function deriveLoopSummary(uniqueInstructions) {
  const helperRewinds = [...uniqueInstructions.values()].filter(
    (inst) => inst.pc >= 0x082BE2 && inst.pc <= 0x082BE7 && inst.tag === 'dec-pair' && inst.pair === 'hl',
  ).length;
  const lowerBoundCheck = [...uniqueInstructions.values()].find(
    (inst) => inst.pc === 0x084718 && inst.tag === 'sbc-pair' && inst.src === 'de',
  );
  const lowerBoundExit = [...uniqueInstructions.values()].find(
    (inst) => inst.pc === 0x08471A && inst.tag === 'ret-conditional' && inst.condition === 'c',
  );
  const keyCompareLoad = [...uniqueInstructions.values()].find(
    (inst) => inst.pc === 0x08471C && inst.tag === 'ld-reg-mem' && inst.addr === 0xD005F9,
  );
  const keyCompare = [...uniqueInstructions.values()].find(
    (inst) => inst.pc === 0x084720 && inst.tag === 'alu-reg' && inst.op === 'cp' && inst.src === '(hl)',
  );
  const equalityJump = [...uniqueInstructions.values()].find(
    (inst) => inst.pc === 0x084721 && inst.tag === 'jr-conditional' && inst.condition === 'z',
  );
  const retryStride = [...uniqueInstructions.values()].find(
    (inst) => inst.pc === 0x084723 && inst.tag === 'ld-pair-imm' && inst.pair === 'bc',
  );
  const retrySubtract = [...uniqueInstructions.values()].find(
    (inst) => inst.pc === 0x084728 && inst.tag === 'sbc-pair' && inst.src === 'bc',
  );
  const retryJump = [...uniqueInstructions.values()].find(
    (inst) => inst.pc === 0x08472A && inst.tag === 'jr' && inst.target === 0x084711,
  );

  console.log('Derived loop behavior:');
  if (helperRewinds > 0) {
    console.log(`  ${hex(0x082BE2)} is an HL rewind helper: ${helperRewinds} consecutive \`dec hl\` instructions, then \`ret\`.`);
  }
  if (lowerBoundCheck && lowerBoundExit) {
    console.log(`  ${hex(0x084716)}..${hex(0x08471B)} uses \`sbc hl, de\` + \`ret c\` as the lower-bound exit test for the scan.`);
    console.log(`  The following \`add hl, de\` restores HL when the pointer is still in range.`);
  }
  if (keyCompareLoad && keyCompare && equalityJump) {
    console.log(`  The only direct key compare in these five blocks is \`ld a, (${hex(0xD005F9)})\` followed by \`cp (hl)\`.`);
    console.log(`  Equality takes \`${formatMnemonic(equalityJump)}\`, which exits this 5-block slice to ${hex(equalityJump.target)}.`);
  }
  if (retryStride && retrySubtract && retryJump) {
    const mismatchStride = retryStride.value >>> 0;
    const totalEntryStride = helperRewinds + mismatchStride;
    console.log(`  On mismatch, the code clears carry with \`or a\`, subtracts ${mismatchStride} more bytes from HL, then jumps back to ${hex(retryJump.target)}.`);
    console.log(`  Combined with the ${helperRewinds}-byte helper rewind, each failed pass moves backward ${totalEntryStride} bytes, matching a 9-byte descending table walk.`);
  }
  console.log(`  ${hex(0xD005FA)} and ${hex(0xD005FB)} are not directly referenced in these five blocks.`);
  console.log(`  ${hex(0xD0259D)} and ${hex(0xD025A3)} are also not directly referenced here.`);
  console.log('');
}

function main() {
  const rom = readFileSync(ROM_PATH);
  const blockResults = BLOCKS.map((addr) => ({
    addr,
    instructions: decodeBlock(rom, addr),
  }));

  console.log('=== Phase 271 Polling Block Disassembly ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Decoder mode: ${ADL_MODE}`);
  console.log(`Blocks: ${BLOCKS.map((addr) => hex(addr)).join(', ')}`);
  console.log('');

  for (const block of blockResults) {
    printBlock(block.addr, rom, block.instructions);
  }

  const uniqueInstructions = buildCombinedInstructionMap(blockResults);
  const combinedFacts = collectFacts([...uniqueInstructions.values()]);

  console.log('=== Combined Summary ===');
  printFactList(
    'Direct memory reads',
    combinedFacts.directReads.map((entry) => `${formatAddressRef(entry.addr)} via ${entry.text}`),
  );
  printFactList(
    'Indirect memory reads',
    combinedFacts.indirectReads.map((entry) => entry.text),
  );
  printFactList(
    'Comparisons/tests',
    combinedFacts.comparisons.map((entry) => entry.text),
  );
  printFactList(
    'Conditional jumps',
    combinedFacts.conditionalJumps.map((entry) => entry.text),
  );
  console.log('');

  printReferenceCheck(combinedFacts.directRefs);
  deriveLoopSummary(uniqueInstructions);
}

main();
