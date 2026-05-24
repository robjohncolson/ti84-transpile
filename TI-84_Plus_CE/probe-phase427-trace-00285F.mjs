#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET = 0x00285F;
const TARGET_END = 0x002889;
const PREV_SIBLING = 0x00283A;
const NEXT_FUNC = 0x00288A;
const TRAMPOLINE = 0x0000B0;
const MEMSET_TRAMPOLINE = 0x0000AC;
const MEMSET_SIBLING = 0x00283A;
const PARENT_FUNC = 0x00E2EB;
const CALLSITE = 0x00E2FE;
const LAYOUT_HELPER = 0x00CAF4;
const LAYOUT_ROOT_LOAD = 0x00CAFC;
const LAYOUT_MASK_LOAD = 0x00CB03;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function read24LE(buf, offset) {
  return (buf[offset] ?? 0) | ((buf[offset + 1] ?? 0) << 8) | ((buf[offset + 2] ?? 0) << 16);
}

function formatIndexed(base, displacement) {
  return `(${String(base).toUpperCase()}${displacement >= 0 ? '+' : '-'}${hex(Math.abs(displacement), 2)})`;
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
  const upper = (value) => String(value).toUpperCase();

  switch (inst.tag) {
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${upper(inst.pair)}`
        : `LD ${upper(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${upper(inst.src)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ldir':
      return 'LDIR';
    case 'ldi':
      return 'LDI';
    case 'lddr':
      return 'LDDR';
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'sbc-pair':
      return `SBC HL,${upper(inst.src)}`;
    case 'xor':
      return `XOR ${upper(inst.src || 'a')}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'ex-de-hl':
      return 'EX DE,HL';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function decodeRange(start, endExclusive) {
  const rows = [];
  let pc = start;
  while (pc < endExclusive && pc < rom.length) {
    const inst = safeDecode(pc);
    rows.push({
      pc,
      inst,
      bytes: Array.from(rom.subarray(pc, pc + inst.length), (byte) => hexByte(byte)).join(' '),
      text: formatInstruction(inst),
    });
    pc = inst.nextPc > pc ? inst.nextPc : pc + 1;
  }
  return rows;
}

function printRows(title, rows) {
  console.log(title);
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}`);
  }
  console.log('');
}

function loadExpr(inst) {
  switch (inst.tag) {
    case 'ld-pair-imm':
      return hex(inst.value);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem' ? null : `*(${hex(inst.addr)})`;
    case 'ld-pair-indexed':
      return `*${formatIndexed(inst.indexRegister, inst.displacement)}`;
    default:
      return null;
  }
}

function summarizeArgSetup(callPc) {
  const rows = decodeRange(Math.max(0, callPc - 0x20), callPc + 4).filter((row) => row.pc < callPc);
  const tail = rows.slice(-6);

  let countExpr = null;
  let destExpr = null;
  for (let index = 0; index + 1 < tail.length; index += 1) {
    const load = tail[index].inst;
    const push = tail[index + 1].inst;
    if (push.tag !== 'push') continue;
    const expr = loadExpr(load);
    if (!expr) continue;
    if (!countExpr) {
      countExpr = expr;
    } else if (!destExpr) {
      destExpr = expr;
    }
  }

  return {
    rows,
    countExpr,
    destExpr,
  };
}

function collectReferences(target) {
  const refs = [];
  let pc = 0;
  while (pc < rom.length) {
    const inst = safeDecode(pc);
    if (
      (inst.tag === 'call' ||
        inst.tag === 'call-conditional' ||
        inst.tag === 'jp' ||
        inst.tag === 'jp-conditional') &&
      inst.target === target
    ) {
      refs.push({ pc, inst });
    }
    pc = inst.nextPc > pc ? inst.nextPc : pc + 1;
  }
  return refs;
}

function renderCaller(ref) {
  const mode = ref.pc === TRAMPOLINE ? 'trampoline' : ref.inst.tag.startsWith('jp') ? 'jump' : 'call';
  const { countExpr, destExpr } = summarizeArgSetup(ref.pc);
  const pieces = [];
  if (destExpr) pieces.push(`dest=${destExpr}`);
  if (countExpr) pieces.push(`count=${countExpr}`);
  return `${hex(ref.pc)}  ${mode.padEnd(10)} ${pieces.join(', ') || 'argument setup not recognized'}`;
}

const backwardRows = decodeRange(PREV_SIBLING, TARGET);
const targetRows = decodeRange(TARGET, TARGET + 0x96);
const siblingRows = decodeRange(MEMSET_SIBLING, TARGET);
const callsite = summarizeArgSetup(CALLSITE);
const layoutRows = decodeRange(LAYOUT_HELPER, 0x00CB28);
const directRefs = collectReferences(TARGET);
const trampolineRefs = collectReferences(TRAMPOLINE);
const memsetRefs = collectReferences(MEMSET_SIBLING);

const prevRet = backwardRows.findLast((row) => row.inst.tag === 'ret');
const targetLength = TARGET_END - TARGET + 1;
const countValue = read24LE(rom, 0x00E2F4);
const d14017SeedCandidate = read24LE(rom, LAYOUT_ROOT_LOAD + 1);
const d14017Mask = read24LE(rom, LAYOUT_MASK_LOAD + 1);
const d14017Resolved = d14017SeedCandidate & d14017Mask;
const clearedStart = d14017Resolved;
const clearedEnd = d14017Resolved + countValue - 1;

console.log('# Phase 427 - Trace 0x00285F Zero-Fill Helper');
console.log('');
console.log('Static disassembly only. This probe reads raw ROM bytes plus the current eZ80 decoder.');
console.log('');

printRows('## Backward Context (preceding sibling + boundary check)', backwardRows);
printRows('## Target Decode Forward (~150 bytes from 0x00285F)', targetRows);

console.log('## Boundary Verdict');
console.log(`Target entry: ${hex(TARGET)}`);
console.log(`Previous RET: ${prevRet ? hex(prevRet.pc) : 'not found in scan window'}`);
console.log(`Target end:   ${hex(TARGET_END)}`);
console.log(`Next entry:   ${hex(NEXT_FUNC)} (first byte after RET)`);
console.log(`Byte count:   ${targetLength} bytes`);
console.log('');

printRows('## Adjacent Sibling at 0x00283A (generic 3-arg fill)', siblingRows);

console.log('## Classification');
console.log(`0x0000AC is a trampoline to ${hex(MEMSET_TRAMPOLINE)} and ${hex(MEMSET_SIBLING)} takes three stack arguments:`);
console.log('  (IY+3) = dest, (IY+6) = fill byte, (IY+9) = count.');
console.log(`0x0000B0 is a trampoline to ${hex(TRAMPOLINE)} and ${hex(TARGET)} takes two stack arguments:`);
console.log('  (IY+3) = dest, (IY+6) = count, fill value hardwired by XOR A.');
console.log('Verdict: 0x00285F is the zero-fill sibling, i.e. bzero-style helper / memset(dest, 0, count).');
console.log('');

printRows('## Parent Call Site Inside 0x00E2EB', callsite.rows);

console.log('## Call-Site Interpretation');
console.log(`Parent function entry: ${hex(PARENT_FUNC)}`);
console.log(`Actual call instruction: ${hex(CALLSITE)}`);
console.log(`Count pushed first: ${callsite.countExpr ?? 'unknown'} (${countValue} bytes)`);
console.log(`Destination pushed second: ${callsite.destExpr ?? 'unknown'}`);
console.log('Fill value: implicit 0x00 via XOR A inside 0x00285F.');
console.log('');

printRows('## Upstream D14017 Seed Helper Fragment', layoutRows);

console.log('## Resolved Zero-Fill Destination');
console.log(`0x00CB14 stores D14017 after masking ${hex(d14017SeedCandidate)} with ${hex(d14017Mask)}.`);
console.log(`Resolved D14017 value: ${hex(d14017Resolved)}`);
console.log(`0x00E2FE therefore zero-fills ${hex(clearedStart)}..${hex(clearedEnd)} (${countValue} bytes / 0x${countValue.toString(16).toUpperCase()}).`);
console.log('');

console.log('## Instruction-Level Behavior at 0x00285F');
console.log('1. PUSH IY / IY = SP + 3 to build an ADL stack frame.');
console.log('2. Load count from (IY+6) into HL and compare against 0.');
console.log('3. If count == 0, return immediately.');
console.log('4. Load dest from (IY+3) into DE, then XOR A and store one zero byte at (DE).');
console.log('5. Decrement HL and test whether original count was 1.');
console.log('6. Reload BC = count, decrement BC, increment DE, reload HL = dest.');
console.log('7. LDIR copies the seeded zero byte from dest[0] across dest[1..count-1].');
console.log('8. POP IY / RET.');
console.log('');

console.log('## Reference Inventory');
console.log(`Direct references to ${hex(TARGET)}: ${directRefs.length}`);
for (const ref of directRefs) {
  console.log(`  ${renderCaller(ref)}`);
}
console.log('');
console.log(`References to trampoline ${hex(TRAMPOLINE)}: ${trampolineRefs.length}`);
for (const ref of trampolineRefs) {
  console.log(`  ${renderCaller(ref)}`);
}
console.log('');
console.log(`Direct references to generic memset sibling ${hex(MEMSET_SIBLING)}: ${memsetRefs.length}`);
for (const ref of memsetRefs) {
  console.log(`  ${hex(ref.pc)}  ${ref.inst.tag.startsWith('jp') ? 'jump' : 'call'}`);
}
