#!/usr/bin/env node

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TARGET = 0x05D5C2;
const TABLE_PTR_RAM = 0xD1441D;
const ZERO_FLAG_RAM = 0xD14084;
const TARGET_WINDOW_BYTES = 0x20;
const CALLER_WINDOW_BEFORE = 0x20;
const MAX_CALLERS = 10;

const CALL_PATTERN = [0xCD, 0xC2, 0xD5, 0x05];
const JP_PATTERN = [0xC3, 0xC2, 0xD5, 0x05];
const TABLE_PTR_PATTERN = [0x1D, 0x44, 0xD1];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return hex(value & 0xFF, 2);
}

function read24(offset) {
  return (rom[offset] ?? 0) | ((rom[offset + 1] ?? 0) << 8) | ((rom[offset + 2] ?? 0) << 16);
}

function signed8(value) {
  const n = value & 0xFF;
  return n >= 0x80 ? n - 0x100 : n;
}

function formatDisp(value) {
  return `${value < 0 ? '-' : '+'}${hex(Math.abs(value), 2)}`;
}

function bytesHex(start, length) {
  const from = Math.max(0, start);
  const to = Math.min(rom.length, from + Math.max(0, length));
  const parts = [];
  for (let i = from; i < to; i++) {
    parts.push(rom[i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function groupedBytesHex(start, length, groupSize = 4) {
  const groups = [];
  for (let offset = 0; offset < length; offset += groupSize) {
    groups.push(bytesHex(start + offset, Math.min(groupSize, length - offset)));
  }
  return groups.join(' | ');
}

function findAll(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      hits.push(i);
    }
  }
  return hits;
}

function decode(pc) {
  if (pc < 0 || pc >= rom.length) {
    return { pc, length: 1, text: '<out-of-range>' };
  }

  const op = rom[pc];
  switch (op) {
    case 0x00:
      return { pc, length: 1, text: 'NOP' };
    case 0x01: {
      const value = read24(pc + 1);
      return { pc, length: 4, text: `LD BC,${hex(value)}`, kind: 'ld-imm', pair: 'BC', value };
    }
    case 0x06:
      return { pc, length: 2, text: `LD B,${byteHex(rom[pc + 1] ?? 0)}` };
    case 0x09:
      return { pc, length: 1, text: 'ADD HL,BC' };
    case 0x11: {
      const value = read24(pc + 1);
      return { pc, length: 4, text: `LD DE,${hex(value)}`, kind: 'ld-imm', pair: 'DE', value };
    }
    case 0x18: {
      const target = (pc + 2 + signed8(rom[pc + 1] ?? 0)) & 0xFFFFFF;
      return { pc, length: 2, text: `JR ${hex(target)}`, target };
    }
    case 0x21: {
      const value = read24(pc + 1);
      return { pc, length: 4, text: `LD HL,${hex(value)}`, kind: 'ld-imm', pair: 'HL', value };
    }
    case 0x22: {
      const addr = read24(pc + 1);
      return { pc, length: 4, text: `LD (${hex(addr)}),HL`, kind: 'ld-mem-pair', pair: 'HL', addr };
    }
    case 0x23:
      return { pc, length: 1, text: 'INC HL' };
    case 0x28: {
      const target = (pc + 2 + signed8(rom[pc + 1] ?? 0)) & 0xFFFFFF;
      return { pc, length: 2, text: `JR Z,${hex(target)}`, target };
    }
    case 0x29:
      return { pc, length: 1, text: 'ADD HL,HL' };
    case 0x2A: {
      const addr = read24(pc + 1);
      return { pc, length: 4, text: `LD HL,(${hex(addr)})`, kind: 'ld-pair-mem', pair: 'HL', addr };
    }
    case 0x30: {
      const target = (pc + 2 + signed8(rom[pc + 1] ?? 0)) & 0xFFFFFF;
      return { pc, length: 2, text: `JR NC,${hex(target)}`, target };
    }
    case 0x32: {
      const addr = read24(pc + 1);
      return { pc, length: 4, text: `LD (${hex(addr)}),A`, kind: 'ld-mem-reg', reg: 'A', addr };
    }
    case 0x36:
      return { pc, length: 2, text: `LD (HL),${byteHex(rom[pc + 1] ?? 0)}` };
    case 0x3A: {
      const addr = read24(pc + 1);
      return { pc, length: 4, text: `LD A,(${hex(addr)})`, kind: 'ld-reg-mem', reg: 'A', addr };
    }
    case 0x6F:
      return { pc, length: 1, text: 'LD L,A' };
    case 0x77:
      return { pc, length: 1, text: 'LD (HL),A' };
    case 0x97:
      return { pc, length: 1, text: 'SUB A' };
    case 0xAF:
      return { pc, length: 1, text: 'XOR A' };
    case 0xB7:
      return { pc, length: 1, text: 'OR A' };
    case 0xC1:
      return { pc, length: 1, text: 'POP BC' };
    case 0xC3: {
      const target = read24(pc + 1);
      return { pc, length: 4, text: `JP ${hex(target)}`, kind: 'jp', target };
    }
    case 0xC5:
      return { pc, length: 1, text: 'PUSH BC' };
    case 0xC9:
      return { pc, length: 1, text: 'RET' };
    case 0xCD: {
      const target = read24(pc + 1);
      return { pc, length: 4, text: `CALL ${hex(target)}`, kind: 'call', target };
    }
    case 0xD1:
      return { pc, length: 1, text: 'POP DE' };
    case 0xE1:
      return { pc, length: 1, text: 'POP HL' };
    case 0xE5:
      return { pc, length: 1, text: 'PUSH HL' };
    case 0xED: {
      const sub = rom[pc + 1] ?? 0;
      switch (sub) {
        case 0x43: {
          const addr = read24(pc + 2);
          return { pc, length: 5, text: `LD (${hex(addr)}),BC`, kind: 'ld-mem-pair', pair: 'BC', addr };
        }
        case 0x4B: {
          const addr = read24(pc + 2);
          return { pc, length: 5, text: `LD BC,(${hex(addr)})`, kind: 'ld-pair-mem', pair: 'BC', addr };
        }
        case 0x53: {
          const addr = read24(pc + 2);
          return { pc, length: 5, text: `LD (${hex(addr)}),DE`, kind: 'ld-mem-pair', pair: 'DE', addr };
        }
        case 0x5B: {
          const addr = read24(pc + 2);
          return { pc, length: 5, text: `LD DE,(${hex(addr)})`, kind: 'ld-pair-mem', pair: 'DE', addr };
        }
        case 0x62:
          return { pc, length: 2, text: 'SBC HL,HL' };
        default:
          return { pc, length: 2, text: `DB ${byteHex(op)} ${byteHex(sub)}` };
      }
    }
    case 0xF5:
      return { pc, length: 1, text: 'PUSH AF' };
    case 0xDD: {
      const sub = rom[pc + 1] ?? 0;
      switch (sub) {
        case 0x07: {
          const displacement = signed8(rom[pc + 2] ?? 0);
          return {
            pc,
            length: 3,
            text: `LD BC,(IX${formatDisp(displacement)})`,
            kind: 'ld-indexed-pair',
            pair: 'BC',
            displacement,
          };
        }
        case 0x0F: {
          const displacement = signed8(rom[pc + 2] ?? 0);
          return {
            pc,
            length: 3,
            text: `LD (IX${formatDisp(displacement)}),BC`,
            kind: 'ld-pair-indexed-store',
            pair: 'BC',
            displacement,
          };
        }
        case 0x27: {
          const displacement = signed8(rom[pc + 2] ?? 0);
          return {
            pc,
            length: 3,
            text: `LD HL,(IX${formatDisp(displacement)})`,
            kind: 'ld-indexed-pair',
            pair: 'HL',
            displacement,
          };
        }
        case 0x2F: {
          const displacement = signed8(rom[pc + 2] ?? 0);
          return {
            pc,
            length: 3,
            text: `LD (IX${formatDisp(displacement)}),HL`,
            kind: 'ld-pair-indexed-store',
            pair: 'HL',
            displacement,
          };
        }
        case 0x7E: {
          const displacement = signed8(rom[pc + 2] ?? 0);
          return { pc, length: 3, text: `LD A,(IX${formatDisp(displacement)})`, kind: 'ld-indexed-a', displacement };
        }
        case 0x77: {
          const displacement = signed8(rom[pc + 2] ?? 0);
          return { pc, length: 3, text: `LD (IX${formatDisp(displacement)}),A`, kind: 'ld-a-indexed-store', displacement };
        }
        case 0xE1:
          return { pc, length: 2, text: 'POP IX' };
        case 0xF9:
          return { pc, length: 2, text: 'LD SP,IX' };
        default:
          return { pc, length: 2, text: `DB ${byteHex(op)} ${byteHex(sub)}` };
      }
    }
    default:
      return { pc, length: 1, text: `DB ${byteHex(op)}` };
  }
}

function disassembleRange(start, byteCount, { stopOnRet = false } = {}) {
  const lines = [];
  const from = Math.max(0, start);
  const to = Math.min(rom.length, from + byteCount);
  let pc = from;

  while (pc < to) {
    const inst = decode(pc);
    lines.push(inst);
    pc += Math.max(inst.length, 1);
    if (stopOnRet && inst.text === 'RET') {
      break;
    }
  }

  return lines;
}

function printDisassembly(lines, highlightPc = null) {
  for (const inst of lines) {
    const marker = inst.pc === highlightPc ? '>' : ' ';
    console.log(`${marker} ${hex(inst.pc)}  ${bytesHex(inst.pc, inst.length).padEnd(20)} ${inst.text}`);
  }
}

function classifyTablePtrHit(patternStart) {
  const prev1 = rom[patternStart - 1];
  const prev2 = rom[patternStart - 2];

  if (prev2 === 0xED && [0x43, 0x4B, 0x53, 0x5B].includes(prev1)) {
    return { patternStart, instructionStart: patternStart - 2 };
  }

  if ([0x01, 0x11, 0x21, 0x22, 0x2A, 0x32, 0x3A, 0xC3, 0xCD].includes(prev1)) {
    return { patternStart, instructionStart: patternStart - 1 };
  }

  return { patternStart, instructionStart: patternStart };
}

function collectLiteralTableCandidates(lines) {
  const out = [];
  for (const inst of lines) {
    if (inst.kind === 'ld-imm' && ['HL', 'DE', 'BC'].includes(inst.pair)) {
      out.push(inst);
    }
  }
  return out;
}

console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 6)})`);

console.log('\n=== 0x05D5C2 TABLE INITIALIZER ===');
console.log(`Raw ${TARGET_WINDOW_BYTES} bytes from ${hex(TARGET)}:`);
console.log(`  ${bytesHex(TARGET, TARGET_WINDOW_BYTES)}`);

const initializer = disassembleRange(TARGET, TARGET_WINDOW_BYTES, { stopOnRet: true });
console.log('\nDecoded until RET:');
printDisassembly(initializer);

const storesTablePtr = initializer.find((inst) => inst.kind === 'ld-mem-pair' && inst.addr === TABLE_PTR_RAM);
const loadsBcFromIx6 = initializer.find(
  (inst) => inst.kind === 'ld-indexed-pair' && inst.pair === 'BC' && inst.displacement === 0x06,
);
const zeroesFlag = initializer.some((inst) => inst.text === 'XOR A')
  && initializer.some((inst) => inst.kind === 'ld-mem-reg' && inst.addr === ZERO_FLAG_RAM && inst.reg === 'A');

console.log('\nInitializer summary:');
console.log(`- Table pointer write: ${storesTablePtr ? storesTablePtr.text : 'not found in decoded window'}`);
console.log(`- Table pointer source: ${loadsBcFromIx6 ? 'BC loaded from (IX+0x06)' : 'not identified in decoded window'}`);
console.log(`- Zeroes ${hex(ZERO_FLAG_RAM)}: ${zeroesFlag ? 'yes (via XOR A / LD (nn),A)' : 'not confirmed'}`);
console.log('- Observation: this entry point does not take the table base directly in HL/DE; it pulls BC from the stack frame.');

const callers = [
  ...findAll(CALL_PATTERN).map((site) => ({ kind: 'CALL', site })),
  ...findAll(JP_PATTERN).map((site) => ({ kind: 'JP', site })),
].sort((a, b) => a.site - b.site);

console.log('\n=== DIRECT CALLERS OF 0x05D5C2 ===');
const callSites = callers.filter((entry) => entry.kind === 'CALL');
const jpSites = callers.filter((entry) => entry.kind === 'JP');
console.log(`CALL 0x05D5C2 matches (${callSites.length}): ${callSites.length ? callSites.map((entry) => hex(entry.site)).join(', ') : 'none'}`);
console.log(`JP   0x05D5C2 matches (${jpSites.length}): ${jpSites.length ? jpSites.map((entry) => hex(entry.site)).join(', ') : 'none'}`);

const callerTableCandidates = new Map();
const callerSubset = callers.slice(0, MAX_CALLERS);

for (const [index, caller] of callerSubset.entries()) {
  const windowStart = Math.max(0, caller.site - CALLER_WINDOW_BEFORE);
  const windowBytes = caller.site + 4 - windowStart;
  const lines = disassembleRange(windowStart, windowBytes);
  const literalLoads = collectLiteralTableCandidates(lines);
  const denseVector = lines.length >= 4 && lines.every((inst) => inst.text.startsWith('JP '));

  console.log(`\n--- Caller ${index + 1}/${callerSubset.length}: ${caller.kind} at ${hex(caller.site)} ---`);
  console.log(`Raw ${CALLER_WINDOW_BEFORE} bytes before site:`);
  console.log(`  ${bytesHex(caller.site - CALLER_WINDOW_BEFORE, CALLER_WINDOW_BEFORE)}`);
  console.log('Decoded caller window:');
  printDisassembly(lines, caller.site);

  if (literalLoads.length) {
    console.log('Literal pointer-load candidates in this window:');
    for (const inst of literalLoads) {
      console.log(`- ${hex(inst.pc)}: ${inst.text}`);
      if (inst.value < rom.length && !callerTableCandidates.has(inst.value)) {
        callerTableCandidates.set(inst.value, []);
      }
      if (inst.value < rom.length) {
        callerTableCandidates.get(inst.value).push({ site: caller.site, instructionPc: inst.pc, pair: inst.pair });
      }
    }
  } else {
    console.log('Literal pointer-load candidates in this window: none');
  }

  if (denseVector) {
    console.log('- Observation: the caller window is a dense JP vector table, so this direct site does not show local table-setup code.');
  }
}

console.log('\n=== TABLE ADDRESSES RECOVERED FROM DIRECT CALLER WINDOWS ===');
if (!callerTableCandidates.size) {
  console.log('No literal HL/DE/BC table-base loads were recovered from the direct CALL/JP windows.');
  console.log('Because 0x05D5C2 consumes BC from (IX+0x06), the real table base is likely prepared earlier in a higher-level dispatcher path.');
} else {
  for (const [addr, sources] of callerTableCandidates.entries()) {
    console.log(`\nTable candidate ${hex(addr)} from ${sources.length} window(s):`);
    for (const source of sources) {
      console.log(`- caller ${hex(source.site)} via ${source.pair} load at ${hex(source.instructionPc)}`);
    }
    console.log(`  First 16 bytes: ${groupedBytesHex(addr, 16)}`);
  }
}

const tablePtrHits = findAll(TABLE_PTR_PATTERN);
console.log(`\n=== REFERENCES TO ${hex(TABLE_PTR_RAM)} ===`);
console.log(`Raw 1D 44 D1 occurrences (${tablePtrHits.length}): ${tablePtrHits.map((hit) => hex(hit)).join(', ')}`);

const readSites = [];
const writeSites = [];

for (const [index, hit] of tablePtrHits.entries()) {
  const info = classifyTablePtrHit(hit);
  const inst = decode(info.instructionStart);
  const follow = disassembleRange(info.instructionStart, 0x14);

  if (inst.kind === 'ld-pair-mem' && inst.addr === TABLE_PTR_RAM) {
    readSites.push(info.instructionStart);
  } else if (inst.kind === 'ld-mem-pair' && inst.addr === TABLE_PTR_RAM) {
    writeSites.push(info.instructionStart);
  }

  console.log(`\n--- Ref ${index + 1}/${tablePtrHits.length}: pattern@${hex(hit)} inst@${hex(info.instructionStart)} ---`);
  console.log(`  Raw context: ${bytesHex(info.instructionStart - 4, 24)}`);
  printDisassembly(follow);
}

console.log('\n=== D1441D SUMMARY ===');
console.log(`Writer sites (${writeSites.length}): ${writeSites.length ? writeSites.map((site) => hex(site)).join(', ') : 'none'}`);
console.log(`Reader sites (${readSites.length}): ${readSites.length ? readSites.map((site) => hex(site)).join(', ') : 'none'}`);
console.log(`Direct caller sites (${callers.length}): ${callers.length ? callers.map((entry) => `${entry.kind}@${hex(entry.site)}`).join(', ') : 'none'}`);
