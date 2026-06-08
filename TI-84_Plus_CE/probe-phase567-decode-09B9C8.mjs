#!/usr/bin/env node

// Decode 0x09B9C8 — Token Pre-Classifier
// Called by main token classifier at 0x09BAFF before the 15 CP/JR dispatch chain.
// Goal: determine what this function does to the token value in A.

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const ENTRY = 0x09B9C8;
const LIMIT = 0x09BAAB; // stop before next known function
const MODE = 'adl';
const IY_BASE = 0xD00080;

// Known addresses for annotation
const KNOWN = {
  0xD0058C: 'kbdKey',
  0xD0058E: 'kbdToken',
  0xD00080: 'IY base (flags)',
  0xD005F8: 'token class byte F8',
  0xD005F9: 'token class byte F9',
  0xD005FA: 'token class byte FA',
  0xD005FB: 'token class byte FB',
  0xD005FC: 'token class byte FC',
  0x09BAAF: 'readNextToken',
  0x09BAC9: 'inputCursorAdvance (8B)',
  0x09BAFF: 'mainTokenClassifier',
  0x09B9C8: 'tokenPreClassifier (this fn)',
};

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return hex(v & 0xFF, 2);
}

function bytesHex(buf) {
  return Array.from(buf, b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatSignedDisp(d) {
  const sign = d < 0 ? '-' : '+';
  return `${sign}${hex(Math.abs(d), Math.abs(d) <= 0xFF ? 2 : 4)}`;
}

function formatIndexed(reg, disp) {
  return `(${reg.toUpperCase()}${formatSignedDisp(disp)})`;
}

function wp(inst, text) {
  return inst.modePrefix ? `${inst.modePrefix.toUpperCase()} ${text}` : text;
}

function fmt(inst) {
  if (!inst || !inst.tag) return '???';
  const t = inst.tag;
  switch (t) {
    case 'nop': return wp(inst, 'NOP');
    case 'ret': return wp(inst, 'RET');
    case 'reti': return wp(inst, 'RETI');
    case 'retn': return wp(inst, 'RETN');
    case 'ret-conditional': return wp(inst, `RET ${inst.condition.toUpperCase()}`);
    case 'call': return wp(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional': return wp(inst, `CALL ${inst.condition.toUpperCase()},${hex(inst.target)}`);
    case 'jp': return wp(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional': return wp(inst, `JP ${inst.condition.toUpperCase()},${hex(inst.target)}`);
    case 'jp-indirect': return wp(inst, `JP (${(inst.indirectRegister ?? 'hl').toUpperCase()})`);
    case 'jr': return wp(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional': return wp(inst, `JR ${inst.condition.toUpperCase()},${hex(inst.target)}`);
    case 'djnz': return wp(inst, `DJNZ ${hex(inst.target)}`);
    case 'rst': return wp(inst, `RST ${hex(inst.target, 2)}`);
    case 'push': return wp(inst, `PUSH ${inst.pair.toUpperCase()}`);
    case 'pop': return wp(inst, `POP ${inst.pair.toUpperCase()}`);
    case 'inc-reg': return wp(inst, `INC ${inst.reg.toUpperCase()}`);
    case 'dec-reg': return wp(inst, `DEC ${inst.reg.toUpperCase()}`);
    case 'inc-pair': return wp(inst, `INC ${inst.pair.toUpperCase()}`);
    case 'dec-pair': return wp(inst, `DEC ${inst.pair.toUpperCase()}`);
    case 'ld-reg-imm': return wp(inst, `LD ${inst.dest.toUpperCase()},${hexByte(inst.value)}`);
    case 'ld-pair-imm': return wp(inst, `LD ${inst.pair.toUpperCase()},${hex(inst.value)}`);
    case 'ld-reg-reg': return wp(inst, `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`);
    case 'ld-reg-mem':
    case 'ld-a-mem': return wp(inst, `LD ${(inst.dest ?? 'a').toUpperCase()},(${hex(inst.addr ?? inst.address)})`);
    case 'ld-mem-reg':
    case 'ld-mem-a': return wp(inst, `LD (${hex(inst.addr ?? inst.address)}),${(inst.src ?? 'a').toUpperCase()}`);
    case 'ld-pair-mem': return wp(inst, `LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`);
    case 'ld-mem-pair': return wp(inst, `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`);
    case 'ld-reg-ind': return wp(inst, `LD ${inst.dest.toUpperCase()},(${inst.src.toUpperCase()})`);
    case 'ld-ind-reg': return wp(inst, `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`);
    case 'ld-reg-ixd': return wp(inst, `LD ${inst.dest.toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg': return wp(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${inst.src.toUpperCase()}`);
    case 'ld-ixd-imm': return wp(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hexByte(inst.value)}`);
    case 'ld-pair-indexed': return wp(inst, `LD ${inst.pair.toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair': return wp(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${inst.pair.toUpperCase()}`);
    case 'alu-imm': {
      const o = inst.op;
      if (['cp','sub','and','xor','or'].includes(o)) return wp(inst, `${o.toUpperCase()} ${hexByte(inst.value)}`);
      return wp(inst, `${o.toUpperCase()} A,${hexByte(inst.value)}`);
    }
    case 'alu-reg': {
      const o = inst.op;
      if (['cp','sub','and','xor','or'].includes(o)) return wp(inst, `${o.toUpperCase()} ${inst.src.toUpperCase()}`);
      return wp(inst, `${o.toUpperCase()} A,${inst.src.toUpperCase()}`);
    }
    case 'alu-ixd': {
      const o = inst.op;
      const idx = formatIndexed(inst.indexRegister, inst.displacement);
      if (['cp','sub','and','xor','or'].includes(o)) return wp(inst, `${o.toUpperCase()} ${idx}`);
      return wp(inst, `${o.toUpperCase()} A,${idx}`);
    }
    case 'alu-ind': {
      const o = inst.op;
      if (['cp','sub','and','xor','or'].includes(o)) return wp(inst, `${o.toUpperCase()} (HL)`);
      return wp(inst, `${o.toUpperCase()} A,(HL)`);
    }
    case 'bit-test': return wp(inst, `BIT ${inst.bit},${inst.reg.toUpperCase()}`);
    case 'bit-test-ind': return wp(inst, `BIT ${inst.bit},(${inst.indirectRegister.toUpperCase()})`);
    case 'set-bit': return wp(inst, `SET ${inst.bit},${inst.reg.toUpperCase()}`);
    case 'res-bit': return wp(inst, `RES ${inst.bit},${inst.reg.toUpperCase()}`);
    case 'set-bit-ind': return wp(inst, `SET ${inst.bit},(${inst.indirectRegister.toUpperCase()})`);
    case 'res-bit-ind': return wp(inst, `RES ${inst.bit},(${inst.indirectRegister.toUpperCase()})`);
    case 'indexed-cb-bit': return wp(inst, `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set': return wp(inst, `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res': return wp(inst, `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'inc-ixd': return wp(inst, `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'dec-ixd': return wp(inst, `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'rotate-reg': return wp(inst, `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`);
    case 'rotate-ind': return wp(inst, `${inst.op.toUpperCase()} (${inst.indirectRegister.toUpperCase()})`);
    case 'rlca': return wp(inst, 'RLCA');
    case 'rrca': return wp(inst, 'RRCA');
    case 'rla': return wp(inst, 'RLA');
    case 'rra': return wp(inst, 'RRA');
    case 'cpl': return wp(inst, 'CPL');
    case 'scf': return wp(inst, 'SCF');
    case 'ccf': return wp(inst, 'CCF');
    case 'daa': return wp(inst, 'DAA');
    case 'di': return wp(inst, 'DI');
    case 'ei': return wp(inst, 'EI');
    case 'exx': return wp(inst, 'EXX');
    case 'ex-af': return wp(inst, 'EX AF,AF');
    case 'ex-de-hl': return wp(inst, 'EX DE,HL');
    case 'ex-sp-hl': return wp(inst, 'EX (SP),HL');
    case 'ex-sp-ix': return wp(inst, 'EX (SP),IX');
    case 'ex-sp-iy': return wp(inst, 'EX (SP),IY');
    case 'halt': return wp(inst, 'HALT');
    case 'ldir': return wp(inst, 'LDIR');
    case 'lddr': return wp(inst, 'LDDR');
    case 'ldi': return wp(inst, 'LDI');
    case 'ldd': return wp(inst, 'LDD');
    case 'cpir': return wp(inst, 'CPIR');
    case 'cpdr': return wp(inst, 'CPDR');
    case 'cpi': return wp(inst, 'CPI');
    case 'cpd': return wp(inst, 'CPD');
    case 'add-pair': return wp(inst, `ADD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`);
    case 'adc-pair': return wp(inst, `ADC HL,${inst.src.toUpperCase()}`);
    case 'sbc-pair': return wp(inst, `SBC HL,${inst.src.toUpperCase()}`);
    case 'in-reg': return wp(inst, `IN ${(inst.reg ?? inst.dest).toUpperCase()},(C)`);
    case 'out-reg': return wp(inst, `OUT (C),${(inst.reg ?? inst.src).toUpperCase()}`);
    case 'in0': return wp(inst, `IN0 ${inst.reg.toUpperCase()},(${hexByte(inst.port)})`);
    case 'out0': return wp(inst, `OUT0 (${hexByte(inst.port)}),${inst.reg.toUpperCase()}`);
    case 'im': return wp(inst, `IM ${inst.mode_val ?? inst.value ?? '?'}`);
    case 'ld-sp-hl': return wp(inst, 'LD SP,HL');
    case 'ld-sp-ix': return wp(inst, 'LD SP,IX');
    case 'ld-sp-iy': return wp(inst, 'LD SP,IY');
    case 'ld-i-a': return wp(inst, 'LD I,A');
    case 'ld-a-i': return wp(inst, 'LD A,I');
    case 'ld-r-a': return wp(inst, 'LD R,A');
    case 'ld-a-r': return wp(inst, 'LD A,R');
    case 'neg': return wp(inst, 'NEG');
    case 'rrd': return wp(inst, 'RRD');
    case 'rld': return wp(inst, 'RLD');
    case 'slp': return wp(inst, 'SLP');
    case 'tst-imm': return wp(inst, `TST A,${hexByte(inst.value)}`);
    case 'tst-reg': return wp(inst, `TST A,${inst.reg.toUpperCase()}`);
    case 'lea': return wp(inst, `LEA ${inst.dest.toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'pea': return wp(inst, `PEA ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    default: {
      const skip = new Set(['pc','length','nextPc','mode','modePrefix','terminates','fallthrough','tag']);
      const parts = [];
      for (const [k, v] of Object.entries(inst)) {
        if (skip.has(k) || v === undefined || v === null) continue;
        if (typeof v === 'number') parts.push(`${k}=${hex(v, v <= 0xFF ? 2 : 6)}`);
        else parts.push(`${k}=${v}`);
      }
      return wp(inst, `${t} ${parts.join(' ')}`);
    }
  }
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, MODE);
  } catch {
    return { pc, length: 1, nextPc: pc + 1, tag: 'db', value: rom[pc] ?? 0, mode: MODE, modePrefix: null };
  }
}

function annotate(inst) {
  const notes = [];
  if (typeof inst.addr === 'number' && KNOWN[inst.addr]) notes.push(KNOWN[inst.addr]);
  if (typeof inst.address === 'number' && KNOWN[inst.address]) notes.push(KNOWN[inst.address]);
  if (inst.indexRegister === 'iy' && typeof inst.displacement === 'number') {
    const addr = (IY_BASE + inst.displacement) & 0xFFFFFF;
    const label = KNOWN[addr] || `IY+${hex(inst.displacement & 0xFF, 2)} = ${hex(addr)}`;
    notes.push(label);
  }
  if (typeof inst.target === 'number' && ['call','call-conditional','jp','jp-conditional','rst'].includes(inst.tag)) {
    if (KNOWN[inst.target]) notes.push(KNOWN[inst.target]);
  }
  return notes.join(' ; ');
}

// === Main: linear + branch-following decode ===

console.log('=== Decoding 0x09B9C8: Token Pre-Classifier ===');
console.log(`Range: ${hex(ENTRY)} to ${hex(LIMIT)}`);
console.log();

const visited = new Map();
const queue = [ENTRY];
let instrCount = 0;
const ramAddrs = new Set();
const externalCalls = [];
const branches = [];

while (queue.length > 0) {
  let pc = queue.shift();

  while (pc >= ENTRY && pc < LIMIT && !visited.has(pc) && instrCount < 200) {
    const inst = safeDecode(pc);
    const bytes = bytesHex(rom.subarray(pc, pc + inst.length));
    const text = fmt(inst);
    const note = annotate(inst);

    visited.set(pc, { inst, bytes, text, note, order: instrCount++ });

    // Track RAM addresses
    if (typeof inst.addr === 'number' && inst.addr >= 0xD00000) ramAddrs.add(inst.addr);
    if (typeof inst.address === 'number' && inst.address >= 0xD00000) ramAddrs.add(inst.address);
    if (inst.indexRegister === 'iy' && typeof inst.displacement === 'number') {
      ramAddrs.add((IY_BASE + inst.displacement) & 0xFFFFFF);
    }

    // Track external calls
    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && typeof inst.target === 'number') {
      if (inst.target < ENTRY || inst.target >= LIMIT) {
        externalCalls.push({ from: pc, target: inst.target, tag: inst.tag, condition: inst.condition });
      }
    }

    // Track branches
    if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz') {
      branches.push({ from: pc, target: inst.target, condition: inst.condition, tag: inst.tag });
      if (typeof inst.target === 'number' && inst.target >= ENTRY && inst.target < LIMIT && !visited.has(inst.target)) {
        queue.push(inst.target);
      }
      pc = inst.nextPc;
      continue;
    }

    if (inst.tag === 'ret-conditional') {
      pc = inst.nextPc;
      continue;
    }

    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') break;

    if (inst.tag === 'jp' || inst.tag === 'jr') {
      if (typeof inst.target === 'number' && inst.target >= ENTRY && inst.target < LIMIT && !visited.has(inst.target)) {
        queue.push(inst.target);
      }
      break;
    }

    if (inst.tag === 'jp-indirect' || inst.tag === 'halt' || inst.tag === 'slp') break;

    if (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'rst') {
      pc = inst.nextPc;
      continue;
    }

    pc = inst.nextPc;
  }
}

// Sort by address and print
const sorted = Array.from(visited.entries()).sort((a, b) => a[0] - b[0]);
let funcEnd = ENTRY;

console.log('ADDR       BYTES              INSTRUCTION                          NOTE');
console.log('---------- ------------------ ------------------------------------ ----');
for (const [addr, item] of sorted) {
  const addrStr = hex(addr).padEnd(10);
  const bytesStr = item.bytes.padEnd(18);
  const textStr = item.text.padEnd(36);
  console.log(`${addrStr} ${bytesStr} ${textStr} ${item.note}`);
  if (addr + item.inst.length > funcEnd) funcEnd = addr + item.inst.length;
}

const funcSize = funcEnd - ENTRY;

console.log();
console.log('=== SUMMARY ===');
console.log(`Function: ${hex(ENTRY)} - ${hex(funcEnd - 1)}`);
console.log(`Size: ${funcSize} bytes (${sorted.length} instructions)`);
console.log();

console.log('External calls:');
if (externalCalls.length === 0) {
  console.log('  (none)');
} else {
  for (const c of externalCalls) {
    const label = KNOWN[c.target] || '';
    const cond = c.condition ? ` ${c.condition.toUpperCase()}` : '';
    console.log(`  ${hex(c.from)}: CALL${cond} ${hex(c.target)} ${label}`);
  }
}

console.log();
console.log('RAM addresses referenced:');
if (ramAddrs.size === 0) {
  console.log('  (none)');
} else {
  for (const addr of [...ramAddrs].sort((a, b) => a - b)) {
    const label = KNOWN[addr] || '';
    console.log(`  ${hex(addr)} ${label}`);
  }
}

console.log();
console.log('Branch targets (internal):');
for (const b of branches) {
  const inRange = b.target >= ENTRY && b.target < LIMIT ? '(in-range)' : '(OUT OF RANGE)';
  console.log(`  ${hex(b.from)}: ${b.tag} ${b.condition ?? ''} -> ${hex(b.target)} ${inRange}`);
}

console.log();
console.log('=== RAW BYTES ===');
const rawSlice = rom.subarray(ENTRY, Math.min(funcEnd, ENTRY + 256));
const rows = [];
for (let i = 0; i < rawSlice.length; i += 16) {
  const chunk = rawSlice.subarray(i, Math.min(i + 16, rawSlice.length));
  rows.push(`${hex(ENTRY + i)}: ${bytesHex(chunk)}`);
}
console.log(rows.join('\n'));

// === Now decode the two callees to understand the full pre-classification ===

function linearDecode(entry, maxBytes, label) {
  console.log();
  console.log(`=== Decoding ${label}: ${hex(entry)} (up to ${maxBytes} bytes) ===`);
  console.log();

  const items = [];
  let pc = entry;
  const end = entry + maxBytes;
  const localVisited = new Set();
  const localQueue = [entry];
  const localMap = new Map();
  let idx = 0;

  while (localQueue.length > 0 && idx < 200) {
    pc = localQueue.shift();
    while (pc >= entry && pc < end && !localMap.has(pc) && idx < 200) {
      const inst = safeDecode(pc);
      const bytes = bytesHex(rom.subarray(pc, pc + inst.length));
      const text = fmt(inst);
      const note = annotate(inst);
      localMap.set(pc, { inst, bytes, text, note, order: idx++ });

      if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz') {
        if (typeof inst.target === 'number' && inst.target >= entry && inst.target < end && !localMap.has(inst.target)) {
          localQueue.push(inst.target);
        }
        pc = inst.nextPc;
        continue;
      }
      if (inst.tag === 'ret-conditional') { pc = inst.nextPc; continue; }
      if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') break;
      if (inst.tag === 'jp' || inst.tag === 'jr') {
        if (typeof inst.target === 'number' && inst.target >= entry && inst.target < end && !localMap.has(inst.target)) {
          localQueue.push(inst.target);
        }
        break;
      }
      if (inst.tag === 'jp-indirect' || inst.tag === 'halt' || inst.tag === 'slp') break;
      pc = inst.nextPc;
    }
  }

  const localSorted = Array.from(localMap.entries()).sort((a, b) => a[0] - b[0]);
  let localEnd = entry;

  console.log('ADDR       BYTES              INSTRUCTION                          NOTE');
  console.log('---------- ------------------ ------------------------------------ ----');
  for (const [addr, item] of localSorted) {
    const addrStr = hex(addr).padEnd(10);
    const bytesStr = item.bytes.padEnd(18);
    const textStr = item.text.padEnd(36);
    console.log(`${addrStr} ${bytesStr} ${textStr} ${item.note}`);
    if (addr + item.inst.length > localEnd) localEnd = addr + item.inst.length;
  }
  console.log();
  console.log(`Size: ${localEnd - entry} bytes (${localSorted.length} instructions)`);
}

// 0x09BBAA — the CALL target from 0x09B9C8
linearDecode(0x09BBAA, 256, 'CALLEE 0x09BBAA');

// 0x061D2C — the JP target (tail call) from 0x09B9CD
linearDecode(0x061D2C, 256, 'TAIL-CALL TARGET 0x061D2C');
