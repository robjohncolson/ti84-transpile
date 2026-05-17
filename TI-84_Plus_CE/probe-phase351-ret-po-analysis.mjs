import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const TRANSPILER_PATH = path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs');

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function blockKey(pc, mode) {
  return `${pc.toString(16).padStart(6, '0')}:${mode}`;
}

function getBlock(blocks, pc, mode) {
  const key = blockKey(pc, mode);
  const block = blocks[key];
  if (!block) {
    throw new Error(`Missing block ${key}`);
  }
  return block;
}

function blockEndExclusive(block) {
  const last = block.instructions[block.instructions.length - 1];
  return last ? ((last.pc + last.length) & 0xffffff) : block.startPc;
}

function blockContainsPc(block, pc) {
  return block.instructions.some((instruction) => instruction.pc === pc);
}

function blockContainsDasm(block, dasm) {
  const needle = dasm.toLowerCase();
  return block.instructions.some((instruction) => instruction.dasm.toLowerCase() === needle);
}

function formatExit(exit) {
  const parts = [exit.type];
  if (exit.condition) parts.push(`cond=${exit.condition}`);
  if (exit.target !== undefined) parts.push(`target=${hex(exit.target)}`);
  if (exit.targetMode) parts.push(`mode=${exit.targetMode}`);
  if (exit.via) parts.push(`via=${exit.via}`);
  return parts.join(' ');
}

function formatBlockSummary(block) {
  const start = hex(block.startPc);
  const end = hex((blockEndExclusive(block) - 1) & 0xffffff);
  const exits = block.exits.map(formatExit).join(' | ');
  return `${block.id}  range=${start}..${end}  instructions=${block.instructionCount}  exits=${exits}`;
}

function formatInstructionList(block) {
  return block.instructions
    .map((instruction) => `  ${hex(instruction.pc)}  ${instruction.bytes.padEnd(15)}  ${instruction.dasm}`)
    .join('\n');
}

function numberedSnippet(lines, start, end) {
  return lines
    .slice(start, end)
    .map((line, index) => {
      const lineNo = String(start + index + 1).padStart(4, ' ');
      return `${lineNo}: ${line}`;
    })
    .join('\n');
}

function snippetFromSource(source, anchor, before = 2, after = 8) {
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(anchor));
  if (index === -1) {
    return `<< anchor not found: ${anchor} >>`;
  }
  const start = Math.max(0, index - before);
  const end = Math.min(lines.length, index + after + 1);
  return numberedSnippet(lines, start, end);
}

function snippetFromBlock(block, anchor, before = 2, after = 6) {
  return snippetFromSource(block.source, anchor, before, after);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

console.log('=== Phase 351 - RET PO Block Analysis ===');
console.log(`ROM module: ${ROM_TRANSPILED_PATH}`);
console.log(`Runtime:    ${CPU_RUNTIME_PATH}`);
console.log(`Transpiler: ${TRANSPILER_PATH}`);

const [runtimeSource, transpilerSource] = await Promise.all([
  fs.readFile(CPU_RUNTIME_PATH, 'utf8'),
  fs.readFile(TRANSPILER_PATH, 'utf8'),
]);

console.log('\nLoading PRELIFTED_BLOCKS from ROM.transpiled.js ...');
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const blocks = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;
if (!blocks) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

const block697Adl = getBlock(blocks, 0x000697, 'adl');
const block69aZ80 = getBlock(blocks, 0x00069a, 'z80');
const block6a9Z80 = getBlock(blocks, 0x0006a9, 'z80');
const block69aAdl = getBlock(blocks, 0x00069a, 'adl');
const block6a9Adl = getBlock(blocks, 0x0006a9, 'adl');

const z80ExpectedPcs = [0x00069c, 0x00069f, 0x0006a2, 0x0006a4, 0x0006a8];
const z80HasFullSequence = z80ExpectedPcs.every((pc) => blockContainsPc(block69aZ80, pc));
const z80HasRetPo = blockContainsDasm(block69aZ80, 'ret po');
const z80RetPoSplitIntoNextBlock = blockContainsPc(block6a9Z80, 0x0006a8);
const adlHasRetPo = blockContainsDasm(block69aAdl, 'ret po');
const predecessorFallsToZ80 = block697Adl.exits.some((exit) =>
  exit.type === 'fallthrough' && exit.target === 0x00069a && exit.targetMode === 'z80');

const bitIndex = block69aZ80.instructions.findIndex((instruction) => instruction.pc === 0x0006a2);
const retIndex = block69aZ80.instructions.findIndex((instruction) => instruction.pc === 0x0006a8);
const z80BetweenBitAndRet = bitIndex >= 0 && retIndex >= 0
  ? block69aZ80.instructions.slice(bitIndex + 1, retIndex)
  : [];
const z80OnlyLdIxBetween = z80BetweenBitAndRet.length === 1
  && z80BetweenBitAndRet[0].dasm === 'ld ix, 0x000800';

const bitUsesTestBit = block69aZ80.source.includes('cpu.testBit(cpu.a, 2);');
const ldIxIsPlainAssignment = block69aZ80.source.includes('cpu.ix = 0x000800;');
const retPoChecksPo = block69aZ80.source.includes("if (cpu.checkCondition('po')) return cpu.popReturn();");
const runtimePvMirrorsZero = runtimeSource.includes('this._setFlag(FLAG_PV, zero); // PV mirrors Z for bit test');
const runtimePoChecksNotPv = runtimeSource.includes("case 'po': return !this._getFlag(FLAG_PV);");

const diagnosis = z80HasFullSequence
  && z80HasRetPo
  && !z80RetPoSplitIntoNextBlock
  && bitUsesTestBit
  && ldIxIsPlainAssignment
  && retPoChecksPo
  && runtimePvMirrorsZero
  && runtimePoChecksNotPv
  ? (
      predecessorFallsToZ80
        ? 'NO BUG IN BLOCK — the executed Z80 block at 0x00069A keeps BIT 2,A and RET PO together, and the P/V handling is correct. The ADL twin at the same PC omits RET PO, but the preceding RSMIX block explicitly falls through to 0x00069A in Z80 mode.'
        : 'BUG FOUND: the Z80 block itself looks correct, but the predecessor does not prove a fallthrough into Z80 mode. Investigate mode dispatch around RSMIX.'
    )
  : 'BUG FOUND: the lifted 0x00069A Z80 block does not preserve the expected BIT 2,A -> LD IX -> RET PO sequence or flag semantics.';

section('Relevant Blocks');
console.log(formatBlockSummary(block697Adl));
console.log(formatBlockSummary(block69aZ80));
console.log(formatBlockSummary(block6a9Z80));
console.log(formatBlockSummary(block69aAdl));
console.log(formatBlockSummary(block6a9Adl));

section('Boundary Check');
console.log(`Z80 block at 0x00069A contains OUT/IN/BIT/LD IX/RET PO sequence: ${z80HasFullSequence}`);
console.log(`RET PO present in block_00069a_z80: ${z80HasRetPo}`);
console.log(`RET PO split into block_0006a9_z80: ${z80RetPoSplitIntoNextBlock}`);
console.log(`RET PO present in block_00069a_adl: ${adlHasRetPo}`);
console.log(`Predecessor block_000697_adl falls through to 0x00069A in Z80 mode: ${predecessorFallsToZ80}`);

console.log('\nblock_00069a_z80 instructions:');
console.log(formatInstructionList(block69aZ80));

console.log('\nblock_0006a9_z80 first instruction:');
console.log(`  ${hex(block6a9Z80.instructions[0].pc)}  ${block6a9Z80.instructions[0].bytes.padEnd(15)}  ${block6a9Z80.instructions[0].dasm}`);

console.log('\nblock_00069a_adl snippet around the split:');
console.log(snippetFromBlock(block69aAdl, 'bit 2, a', 2, 9));

console.log('\nblock_0006a9_adl first instruction:');
console.log(`  ${hex(block6a9Adl.instructions[0].pc)}  ${block6a9Adl.instructions[0].bytes.padEnd(15)}  ${block6a9Adl.instructions[0].dasm}`);

section('Flag Handling');
console.log(`BIT 2,A transpiles to cpu.testBit(cpu.a, 2): ${bitUsesTestBit}`);
console.log(`Only instruction between BIT and RET in Z80 block: ${z80OnlyLdIxBetween ? 'ld ix, 0x000800' : z80BetweenBitAndRet.map((instruction) => instruction.dasm).join(', ')}`);
console.log(`LD IX is a plain register assignment in block source: ${ldIxIsPlainAssignment}`);
console.log(`RET PO transpiles to cpu.checkCondition('po'): ${retPoChecksPo}`);
console.log(`Runtime testBit mirrors PV from Z for BIT: ${runtimePvMirrorsZero}`);
console.log(`Runtime checkCondition('po') checks !PV: ${runtimePoChecksNotPv}`);
console.log('Expected flag result for A=0x04 at BIT 2,A: zero=false, pv=false, so PO=true.');

console.log('\nblock_00069a_z80 source:');
console.log(block69aZ80.source);

console.log('\nruntime testBit snippet:');
console.log(snippetFromSource(runtimeSource, 'testBit(value, bit) {', 0, 8));

console.log('\nruntime checkCondition snippet:');
console.log(snippetFromSource(runtimeSource, "case 'pe':", 1, 4));

section('Mode-Switch Context');
console.log('transpiler mode-switch handling around RSMIX/STMIX:');
console.log(snippetFromSource(transpilerSource, "if (instruction.kind === 'mode-switch') {", 0, 11));

console.log('\npredecessor block_000697_adl source:');
console.log(block697Adl.source);

section('Diagnosis');
console.log(diagnosis);
if (diagnosis.startsWith('NO BUG IN BLOCK')) {
  console.log('Nearest plausible follow-up: inspect mode-specific block dispatch or runtime state corruption outside this block.');
}

section('JSON Summary');
console.log(JSON.stringify({
  diagnosis,
  z80_block: {
    id: block69aZ80.id,
    instruction_count: block69aZ80.instructionCount,
    contains_full_sequence: z80HasFullSequence,
    contains_ret_po: z80HasRetPo,
    ret_po_in_same_block_as_bit: z80HasFullSequence && z80HasRetPo,
    bit_to_ret_intermediate_instructions: z80BetweenBitAndRet.map((instruction) => instruction.dasm),
  },
  z80_next_block: {
    id: block6a9Z80.id,
    first_instruction: block6a9Z80.instructions[0].dasm,
    contains_ret_po: blockContainsDasm(block6a9Z80, 'ret po'),
  },
  adl_twin: {
    id: block69aAdl.id,
    contains_ret_po: adlHasRetPo,
  },
  predecessor: {
    id: block697Adl.id,
    falls_through_to_z80_69a: predecessorFallsToZ80,
  },
  flag_semantics: {
    bit_uses_testBit: bitUsesTestBit,
    ld_ix_preserves_flags_in_block_source: ldIxIsPlainAssignment,
    ret_po_uses_checkCondition_po: retPoChecksPo,
    runtime_testBit_sets_pv_from_zero: runtimePvMirrorsZero,
    runtime_po_checks_not_pv: runtimePoChecksNotPv,
  },
}, null, 2));
