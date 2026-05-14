#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET = 0x055316;
const TABLE = 0x0525D4;
const PTR_RAM = 0xD005E9;
const CALL_BYTES = [0xCD, 0x16, 0x53, 0x05];
const JP_BYTES = [0xC3, 0x16, 0x53, 0x05];

function hex(v, w = 6) {
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function hexByte(v) {
  return ((v ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function bytesHex(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), hexByte).join(' ');
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function fmtDisp(v) {
  return v >= 0 ? `+${v}` : `${v}`;
}

function fmtIdx(reg, disp) {
  return `(${String(reg).toUpperCase()}${fmtDisp(disp)})`;
}

function fmtInst(inst) {
  switch (inst.tag) {
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`
        : `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-indexed': return `LD ${String(inst.pair).toUpperCase()}, ${fmtIdx(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `LD ${fmtIdx(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${String(inst.dest).toUpperCase()}, ${fmtIdx(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-imm': return `LD ${fmtIdx(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
    case 'ld-sp-pair': return `LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'mlt': return `MLT ${String(inst.reg ?? inst.pair).toUpperCase()}`;
    default: return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function decodeAt(pc) {
  return decodeInstruction(rom, pc, 'adl');
}

function disasmToRet(start, maxInstructions = 64) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < maxInstructions && pc < rom.length; i++) {
    const inst = decodeAt(pc);
    rows.push({ pc, inst });
    pc += Math.max(1, inst.length ?? 1);
    if (inst.tag === 'ret') break;
  }
  return rows;
}

function printRows(rows, markPc = null) {
  for (const { pc, inst } of rows) {
    const mark = pc === markPc ? '>>' : '  ';
    console.log(`${mark} ${hex(pc)}  ${bytesHex(pc, inst.length).padEnd(16)}  ${fmtInst(inst)}`);
  }
}

function findPattern(bytes) {
  const hits = [];
  for (let i = 0; i <= rom.length - bytes.length; i++) {
    let ok = true;
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) { ok = false; break; }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

function looksLikeCodePtr(addr) {
  if (addr <= 0 || addr >= rom.length) return false;
  try {
    return (decodeAt(addr).length ?? 0) > 0;
  } catch {
    return false;
  }
}

function constHlReturn(addr) {
  try {
    const a = decodeAt(addr);
    const b = decodeAt(addr + a.length);
    return a.tag === 'ld-pair-imm' && a.pair === 'hl' && b.tag === 'ret' ? a.value : null;
  } catch {
    return null;
  }
}

function detectRecords() {
  const records = [];
  for (let index = 0; ; index++) {
    const base = TABLE + index * 12;
    if (base + 12 > rom.length) break;
    const record = {
      index,
      base,
      selector: read24(base),
      field3: read24(base + 3),
      field6: read24(base + 6),
      field9: read24(base + 9),
    };
    if (
      record.selector !== index ||
      !looksLikeCodePtr(record.field3) ||
      !looksLikeCodePtr(record.field6) ||
      !looksLikeCodePtr(record.field9)
    ) break;
    records.push(record);
  }
  return records;
}

function alignedContext(target, lookback = 16, after = 2) {
  for (let start = Math.max(0, target - lookback); start <= target; start++) {
    const rows = [];
    let pc = start;
    try {
      while (pc <= target && rows.length < 24) {
        const inst = decodeAt(pc);
        rows.push({ pc, inst });
        if (pc === target) {
          let next = pc + inst.length;
          for (let i = 0; i < after && next < rom.length; i++) {
            const extra = decodeAt(next);
            rows.push({ pc: next, inst: extra });
            next += extra.length;
          }
          return rows;
        }
        pc += Math.max(1, inst.length ?? 1);
      }
    } catch {}
  }
  return [{ pc: target, inst: decodeAt(target) }];
}

function callerArgNote(site) {
  const rows = alignedContext(site, 16, 1).filter((row) => row.pc <= site);
  const push = rows.at(-2);
  const src = rows.at(-3);
  if (push?.inst.tag === 'push' && push.inst.pair === 'bc') {
    if (src?.inst.tag === 'ld-pair-imm' && src.inst.pair === 'bc') {
      return `selector ${hex(src.inst.value)}`;
    }
    if (src?.inst.tag === 'ld-pair-indexed' && src.inst.pair === 'bc') {
      return `caller-supplied 24-bit value from ${fmtIdx(src.inst.indexRegister, src.inst.displacement)}`;
    }
  }
  return 'no simple BC push pattern';
}

console.log('=== Phase 325: Trace 0x055316 ===\n');

console.log('1) Disassembly of 0x055316 through RET');
const body = disasmToRet(TARGET);
printRows(body);
console.log('\nSummary:');
console.log(`- Calls 0x055191 first, then loads a 24-bit argument from (IX+6).`);
console.log(`- If the argument is greater than 0x000002, it stores that value directly to ${hex(PTR_RAM)}.`);
console.log(`- Otherwise it computes ${hex(TABLE)} + arg * 12 and stores that descriptor pointer to ${hex(PTR_RAM)}.`);

console.log('\n2) ROM dump of 0x0525D4 (first 128 bytes)');
for (let off = 0; off < 128; off += 16) {
  const line = bytesHex(TABLE + off, Math.min(16, 128 - off));
  console.log(`${hex(TABLE + off)}  ${line}`);
}

const records = detectRecords();
console.log('\nCandidate 12-byte records:');
for (const record of records) {
  const c6 = constHlReturn(record.field6);
  const c9 = constHlReturn(record.field9);
  console.log(
    `- record ${record.index} @ ${hex(record.base)}: ` +
    `selector=${hex(record.selector)} field+3=${hex(record.field3)} ` +
    `field+6=${hex(record.field6)}${c6 !== null ? ` (returns HL=${hex(c6)})` : ''} ` +
    `field+9=${hex(record.field9)}${c9 !== null ? ` (returns HL=${hex(c9)})` : ''}`,
  );
}
console.log(`- Detected record count before the bytes turn into code: ${records.length}`);
console.log(`- The next 12-byte slot starts at ${hex(TABLE + records.length * 12)} and begins ${bytesHex(TABLE + records.length * 12, 8)}.`);
console.log('  Those bytes decode as executable code, not an SPI/LCD command stream.');

console.log('\n3) Direct callers / jumpers to 0x055316');
for (const [kind, hits] of [['CALL', findPattern(CALL_BYTES)], ['JP', findPattern(JP_BYTES)]]) {
  for (const site of hits) {
    console.log(`- ${kind} at ${hex(site)} (${callerArgNote(site)})`);
    const context = alignedContext(site, 16, 1);
    const pivot = context.findIndex((row) => row.pc === site);
    printRows(context.slice(Math.max(0, pivot - 3), Math.min(context.length, pivot + 2)), site);
  }
}

console.log('\n4) LCD-family cross-reference check');
const directTargets = new Set(
  body
    .map(({ inst }) => (inst.tag === 'call' || inst.tag === 'jp' || inst.tag === 'jr' ? inst.target : null))
    .filter((target) => Number.isInteger(target)),
);
console.log(`- Direct body call/jump to 0x055191: ${directTargets.has(0x055191) ? 'yes' : 'no'}`);
console.log(`- Direct body call/jump to 0x055280: ${directTargets.has(0x055280) ? 'yes' : 'no'}`);
console.log(`- Direct body call/jump to 0x010A3C: ${directTargets.has(0x010A3C) ? 'yes' : 'no'}`);
console.log(`- Direct body call/jump into 0x055700..0x0557FF: ${[...directTargets].some((v) => v >= 0x055700 && v <= 0x0557FF) ? 'yes' : 'no'}`);
console.log(`- Caller at 0x0551AD exists: ${findPattern(CALL_BYTES).includes(0x0551AD) ? 'yes' : 'no'}`);
console.log(`- Caller in 0x0557xx range: ${findPattern(CALL_BYTES).some((v) => v >= 0x055700 && v <= 0x0557FF) ? 'yes' : 'no'}`);

console.log('\n5) Proposed structure for 0x0525D4');
console.log('struct ConfigRecord24 {');
console.log('  uint24 selector_or_id;');
console.log('  uint24 handler_at_plus3;');
console.log('  uint24 handler_at_plus6;');
console.log('  uint24 handler_at_plus9;');
console.log('};');
console.log('- Stride is 12 bytes because 0x055316 multiplies the selector by 12.');
console.log('- Offsets +3, +6, and +9 all look like 24-bit code pointers.');
console.log(`- ${hex(0x055305)} reads descriptor+0 and returns it.`);
console.log(`- ${hex(0x05411C)} reads descriptor+3 and uses it as an indirect callee.`);
console.log(`- ${hex(0x054DD4)} reads descriptor+6 and uses it in a per-byte accumulation loop.`);
console.log(`- ${hex(0x054DC3)} reads descriptor+9 and tail-jumps to it.`);
console.log('- Record 0 looks variable-width: field+6 points to 0x055167, which maps a byte through a table and returns HL=width.');
console.log('- Record 1 looks fixed-width: field+6 returns 12 and field+9 returns 15.');
console.log('- This does not look like LCD panel SPI init data. It looks like a small text/display descriptor table.');
