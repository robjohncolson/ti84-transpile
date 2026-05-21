#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MODE = 'adl';

const rom = fs.readFileSync(ROM_PATH);

const LOOKUP_HELPER = 0x022346;
const SECONDARY_HELPER = 0x022359;
const EVENT_BUILDER = 0x0236F9;

const KBD_KEY = 0xD0058C;
const KEY_EXTEND = 0xD0058E;
const CX_CUR_APP = 0xD007E0;

const RAM_NAMES = new Map([
  [KBD_KEY, 'kbdKey'],
  [KEY_EXTEND, 'keyExtend'],
  [CX_CUR_APP, 'cxCurApp'],
  [0xD0082E, 'D0082E event block'],
  [0xD008D6, 'D008D6'],
  [0xD0243A, 'D0243A'],
]);

const TARGET_NAMES = new Map([
  [LOOKUP_HELPER, 'lookup helper'],
  [SECONDARY_HELPER, 'secondary helper'],
  [EVENT_BUILDER, '3-byte event builder'],
  [0x02FE73, 'post-commit dispatch entry'],
  [0x02FE84, 'shared translated-key return path'],
  [0x02FF09, 'normal lookup caller'],
  [0x0302EB, 'post-lookup classifier'],
  [0x030300, 'shared key-output helper'],
  [0x08C543, '0x08C5xx action path'],
  [0x08C5D7, '0x08C5xx cooked-key combiner'],
  [0x08C7AD, 'downstream key dispatcher'],
]);

const NO_OPERAND_TAGS = new Set([
  'nop',
  'halt',
  'ret',
  'reti',
  'retn',
  'scf',
  'ccf',
  'cpl',
  'di',
  'ei',
  'daa',
  'neg',
  'rlca',
  'rrca',
  'rla',
  'rra',
  'exx',
  'ldir',
  'lddr',
  'ldi',
  'ldd',
  'cpir',
  'cpdr',
  'cpi',
  'cpd',
  'rrd',
  'rld',
  'reti',
  'retn',
  'slp',
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return hex(value & 0xFF, 2);
}

function signedHex(value) {
  return `${value >= 0 ? '+' : '-'}${byteHex(Math.abs(value))}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${signedHex(displacement)})`;
}

function formatBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatMaybeNamedAddress(addr) {
  const name = RAM_NAMES.get(addr) ?? TARGET_NAMES.get(addr);
  return name ? `${hex(addr)} ${name}` : hex(addr);
}

function formatInstruction(inst) {
  if (!inst?.tag) return '???';
  if (NO_OPERAND_TAGS.has(inst.tag)) return inst.tag;

  switch (inst.tag) {
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
    case 'call-cond':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
    case 'jp-cond':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.reg ?? inst.indirectRegister ?? 'hl'})`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
    case 'jr-cond':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret-conditional':
    case 'ret-cond':
      return `ret ${inst.condition}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${byteHex(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem':
    case 'ld-a-mem':
      return `ld ${inst.dest ?? 'a'}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
    case 'ld-mem-a':
      return `ld (${hex(inst.addr ?? inst.address)}), ${inst.src ?? 'a'}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `ld (${hex(inst.addr)}), ${inst.pair}`;
      }
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-sp-pair':
      return `ld sp, ${inst.pair}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-reg-idx':
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-idx-reg':
    case 'ld-ixd-reg':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-idx-imm':
    case 'ld-ixd-imm':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${byteHex(inst.value)}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'inc-ind':
      return 'inc (hl)';
    case 'dec-ind':
      return 'dec (hl)';
    case 'add-pair':
      return `add ${inst.dest ?? 'hl'}, ${inst.src}`;
    case 'adc-pair':
      return `adc ${inst.dest ?? 'hl'}, ${inst.src}`;
    case 'sbc-pair':
      return `sbc ${inst.dest ?? 'hl'}, ${inst.src}`;
    case 'lea':
      return `lea ${inst.dest}, ${inst.base}${signedHex(inst.displacement)}`;
    case 'alu-imm':
    case 'alu-immediate':
      return `${inst.op} ${byteHex(inst.value)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-ind':
      return `${inst.op} (hl)`;
    case 'alu-idx':
      return `${inst.op} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'in-reg':
      return `in ${(inst.reg ?? inst.dest ?? 'a')}, (c)`;
    case 'db':
      return `db ${byteHex(inst.value)}`;
    default:
      return inst.tag;
  }
}

function decodeRange(start, end) {
  const lines = [];
  let pc = start;

  while (pc < end) {
    try {
      const inst = decodeInstruction(rom, pc, MODE);
      if (!inst || !inst.length) {
        lines.push({
          pc,
          length: 1,
          bytes: formatBytes(pc, 1),
          text: `db ${byteHex(rom[pc])}`,
          inst: null,
        });
        pc += 1;
        continue;
      }

      const noteParts = [];
      const directAddr = inst.addr ?? inst.address;
      if (RAM_NAMES.has(directAddr)) noteParts.push(RAM_NAMES.get(directAddr));
      if (TARGET_NAMES.has(inst.target)) noteParts.push(TARGET_NAMES.get(inst.target));

      lines.push({
        pc,
        length: inst.length,
        bytes: formatBytes(pc, inst.length),
        text: formatInstruction(inst),
        note: noteParts.join(' | '),
        inst,
      });
      pc += inst.length;
    } catch {
      lines.push({
        pc,
        length: 1,
        bytes: formatBytes(pc, 1),
        text: `db ${byteHex(rom[pc])}`,
        inst: null,
      });
      pc += 1;
    }
  }

  return lines;
}

function printDisassembly(title, start, end) {
  console.log(`\n=== ${title} (${hex(start)}..${hex(end - 1)}) ===`);
  for (const line of decodeRange(start, end)) {
    const note = line.note ? ` ; ${line.note}` : '';
    console.log(`${hex(line.pc)}  ${line.bytes.padEnd(20)} ${line.text}${note}`);
  }
}

function findPattern(pattern) {
  const hits = [];
  outer: for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

function callPattern(target) {
  return [0xCD, target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
}

function findCallSites(target) {
  return findPattern(callPattern(target));
}

function decodeContainingInstruction(patternOffset, patternLength, maxBacktrack = 6) {
  const candidates = [];
  for (let start = Math.max(0, patternOffset - maxBacktrack); start <= patternOffset; start += 1) {
    try {
      const inst = decodeInstruction(rom, start, MODE);
      if (!inst || !inst.length) continue;
      if (start <= patternOffset && start + inst.length >= patternOffset + patternLength) {
        candidates.push({ start, inst });
      }
    } catch {
      // ignore decode failures while backtracking
    }
  }
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function memoryAccessKind(inst, addr) {
  const directAddr = inst?.addr ?? inst?.address;
  if (directAddr !== addr) return 'OTHER';
  if (inst.tag === 'ld-reg-mem' || inst.tag === 'ld-a-mem') return 'READ';
  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-a') return 'WRITE';
  if (inst.tag === 'ld-pair-mem') return inst.direction === 'to-mem' ? 'WRITE' : 'READ';
  return 'OTHER';
}

function findDirectMemoryRefs(addr) {
  const pattern = [addr & 0xFF, (addr >> 8) & 0xFF, (addr >> 16) & 0xFF];
  const refs = [];
  const seen = new Set();

  for (const hit of findPattern(pattern)) {
    const containing = decodeContainingInstruction(hit, pattern.length, 7);
    if (!containing) continue;
    const { start, inst } = containing;
    const kind = memoryAccessKind(inst, addr);
    if (kind === 'OTHER') continue;
    if (seen.has(start)) continue;
    seen.add(start);
    refs.push({
      pc: start,
      kind,
      bytes: formatBytes(start, inst.length),
      text: formatInstruction(inst),
      inst,
    });
  }

  refs.sort((left, right) => left.pc - right.pc);
  return refs;
}

function writesA(inst) {
  if (!inst) return false;
  if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') return true;
  if (inst.tag === 'ld-reg-reg' && inst.dest === 'a') return true;
  if ((inst.tag === 'ld-reg-ind' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-a-mem') && inst.dest === 'a') return true;
  if (inst.tag === 'alu-imm' || inst.tag === 'alu-immediate' || inst.tag === 'alu-reg' || inst.tag === 'alu-ind' || inst.tag === 'alu-idx') return true;
  return inst.tag === 'neg' || inst.tag === 'cpl' || inst.tag === 'daa' || inst.tag === 'rla' || inst.tag === 'rra' || inst.tag === 'rlca' || inst.tag === 'rrca';
}

function analyze236f9CallSite(callPc) {
  const setupStart = Math.max(0, callPc - 24);
  const setupLines = decodeRange(setupStart, callPc);

  let bufferSetup = null;
  let tokenSetup = null;

  for (const line of setupLines) {
    const inst = line.inst;
    if (!inst) continue;
    if (inst.tag === 'lea' && inst.dest === 'hl' && inst.base === 'ix') {
      bufferSetup = `${line.text}`;
    } else if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
      bufferSetup = `${line.text}`;
    }

    if (writesA(inst)) {
      tokenSetup = line.text;
    }
  }

  const nextLines = [];
  let pc = callPc + 4;
  while (pc < rom.length && nextLines.length < 4) {
    try {
      const inst = decodeInstruction(rom, pc, MODE);
      if (!inst || !inst.length) break;
      const text = formatInstruction(inst);
      nextLines.push(`${hex(pc)} ${text}`);
      pc += inst.length;
      if (inst.tag === 'ret' || inst.tag === 'jp') break;
    } catch {
      break;
    }
  }

  return {
    callPc,
    bufferSetup: bufferSetup ?? '(buffer setup not recovered)',
    tokenSetup: tokenSetup ?? '(token source not recovered)',
    nextLines,
  };
}

function summarizeRefs(title, refs, limit = refs.length) {
  console.log(`\n=== ${title} (${refs.length}) ===`);
  for (const ref of refs.slice(0, limit)) {
    console.log(`${hex(ref.pc)}  ${ref.bytes.padEnd(20)} ${ref.text}`);
  }
}

function filterRegion(refs, start, end) {
  return refs.filter((ref) => ref.pc >= start && ref.pc < end);
}

function noteFromCallers(callSites) {
  console.log(`\n=== CALL ${hex(EVENT_BUILDER)} sites (${callSites.length}) ===`);
  for (const site of callSites.map(analyze236f9CallSite)) {
    console.log(`${hex(site.callPc)}  token=${site.tokenSetup}`);
    console.log(`           buffer=${site.bufferSetup}`);
    console.log(`           next=${site.nextLines.join(' | ')}`);
  }
}

function printEventBuilderSummary() {
  console.log('\n=== Builder summary ===');
  console.log(`- ${hex(EVENT_BUILDER)} writes a 3-byte record to caller-supplied HL.`);
  console.log(`- Byte 0: token from input A.`);
  console.log(`- Byte 1: ${formatMaybeNamedAddress(CX_CUR_APP)}.`);
  console.log(`- Byte 2: ${formatMaybeNamedAddress(KEY_EXTEND)} only when cxCurApp == 0x4E; otherwise 0x00.`);
  console.log(`- ${hex(EVENT_BUILDER)} then decrements HL twice, so HL returns pointing back to the start of the 3-byte record.`);
  console.log(`- BC is restored before RET. A is not a clean return value because the tail executes IN A,(C) with BC=0xDCA0.`);
  console.log(`- No fixed global event buffer is written inside ${hex(EVENT_BUILDER)}; the builder writes only through HL.`);
}

function printKeyConsumptionSummary() {
  console.log('\n=== Where the event is consumed ===');
  console.log(`- On the ${hex(LOOKUP_HELPER)} path, the 3-byte record is not consumed after return.`);
  console.log(`  ${hex(SECONDARY_HELPER)} allocates ix-6, calls ${hex(EVENT_BUILDER)}, then immediately restores SP/IX and returns.`);
  console.log(`  ${hex(LOOKUP_HELPER)} then POPs HL/AF and returns, so the transient ix-local record is discarded on this path.`);
  console.log(`- The durable dispatch handoff is the keyboard state block, not the transient ${hex(EVENT_BUILDER)} record.`);
  console.log(`  ${hex(0x030340)} stores the current key into ${formatMaybeNamedAddress(KEY_EXTEND)} and ${hex(0x030345)} updates ${formatMaybeNamedAddress(KBD_KEY)} before jumping to ${hex(0x02FE73)}.`);
  console.log(`- The 0x08C4xx / 0x08C5xx dispatcher cluster consumes ${formatMaybeNamedAddress(KEY_EXTEND)} and ${formatMaybeNamedAddress(CX_CUR_APP)} directly:`);
  console.log(`  ${hex(0x08C463)} branches on keyExtend for the 0xFA case and can copy a 9-byte block to D0082E before jumping to ${hex(0x08C5D7)}.`);
  console.log(`  ${hex(0x08C4A3)} branches on keyExtend for the 0xFB case and can fall straight into ${hex(0x08C543)}.`);
  console.log(`  ${hex(0x08C5DC)} re-reads keyExtend while combining the 0x59 family, then ${hex(0x08C5E7)} re-reads cxCurApp before calling ${hex(0x08C7AD)}.`);
  console.log(`- Static conclusion: no ROM code was found reading a fixed RAM copy of the ${hex(EVENT_BUILDER)} record, because the record lives in caller-local memory. The OS action dispatch path reads keyExtend/cxCurApp directly instead.`);
}

console.log('Phase 388: trace 0x022346 -> 0x022359 -> 0x0236F9 key event structure');
console.log(`ROM size: ${hex(rom.length)}`);

printDisassembly('0x022346 -> 0x022359 chain', 0x022346, 0x022390);
printDisassembly('normal lookup caller around CALL 0x022346', 0x02FEF7, 0x02FF50);
printDisassembly('post-lookup commit path', 0x0302EB, 0x030354);
printDisassembly('0x0236F9 builder and vicinity', 0x0236F9, 0x023780);

printEventBuilderSummary();

const call022346 = findCallSites(LOOKUP_HELPER);
const call022359 = findCallSites(SECONDARY_HELPER);
const call0236f9 = findCallSites(EVENT_BUILDER);

console.log(`\n=== CALL ${hex(LOOKUP_HELPER)} sites (${call022346.length}) ===`);
for (const site of call022346) {
  console.log(`${hex(site)}  ${formatBytes(site, 4)}  call ${hex(LOOKUP_HELPER)}`);
}

console.log(`\n=== CALL ${hex(SECONDARY_HELPER)} sites (${call022359.length}) ===`);
for (const site of call022359) {
  console.log(`${hex(site)}  ${formatBytes(site, 4)}  call ${hex(SECONDARY_HELPER)}`);
}

noteFromCallers(call0236f9);

const keyExtendRefs = findDirectMemoryRefs(KEY_EXTEND);
const cxCurAppRefs = findDirectMemoryRefs(CX_CUR_APP);

summarizeRefs('keyExtend direct READ refs in 0x08xxxx', filterRegion(keyExtendRefs.filter((ref) => ref.kind === 'READ'), 0x080000, 0x090000));
summarizeRefs('cxCurApp direct READ refs in 0x08C4xx/0x08C5xx', filterRegion(cxCurAppRefs.filter((ref) => ref.kind === 'READ'), 0x08C400, 0x08C620));

printDisassembly('0x08C463 consumer context', 0x08C453, 0x08C49B);
printDisassembly('0x08C4A3 consumer context', 0x08C493, 0x08C4E9);
printDisassembly('0x08C5DC consumer context', 0x08C5CD, 0x08C606);

printKeyConsumptionSummary();
