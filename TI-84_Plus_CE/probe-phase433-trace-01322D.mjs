#!/usr/bin/env node

import { createRequire } from 'node:module';

process.emitWarning = () => {};

const require = createRequire(import.meta.url);
const fs = require('fs');
const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const START = 0x01322D;
const DUPLICATE = 0x041E95;
const CALLBACK_SLOT = 0xD14026;
const HELPER_FRAMESET = 0x00218A;
const HELPER_ICMPZERO = 0x0021C2;
const HELPER_INDCALL = 0x002288;
const VECTOR_ENTRY_49 = 0x00063C;
const EXACT_CALL = [0xCD, 0x2D, 0x32, 0x01];

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function signedDisp(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function formatDisp(value) {
  return signedDisp(value) >= 0 ? `+${signedDisp(value)}` : `${signedDisp(value)}`;
}

function formatBytes(pc, length) {
  return Array.from(rom.subarray(pc, pc + length), (byte) => hexByte(byte)).join(' ');
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${inst.indirectRegister.toUpperCase()})`;
    case 'jr-conditional':
      return `JR ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'push':
      return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop':
      return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem':
      return `LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-pair-indexed':
      return `LD ${inst.pair.toUpperCase()},(${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()},(${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ld-reg-mem':
      return `LD ${inst.dest.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${inst.pair.toUpperCase()},${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `LD ${inst.dest.toUpperCase()},${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-sp-pair':
      return `LD SP,${inst.pair.toUpperCase()}`;
    case 'ex-sp-pair':
      return `EX (SP),${inst.pair.toUpperCase()}`;
    case 'lea':
      return `LEA ${inst.dest.toUpperCase()},${inst.base.toUpperCase()}${formatDisp(inst.displacement)}`;
    case 'add-pair':
      return `ADD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL,${inst.src.toUpperCase()}`;
    case 'alu-imm':
      return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${inst.reg.toUpperCase()}`;
    case 'out-reg':
      return `OUT (C),${inst.reg.toUpperCase()}`;
    default:
      return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function decodeAt(pc) {
  return decodeInstruction(rom, pc, 'adl');
}

function disassembleFunction(start, maxInstructions = 64) {
  const instructions = [];
  let pc = start;
  for (let i = 0; i < maxInstructions; i += 1) {
    const inst = decodeAt(pc);
    instructions.push(inst);
    pc = inst.nextPc;
    if (inst.tag === 'ret') {
      break;
    }
  }
  return instructions;
}

function disassembleLinear(start, count = 8) {
  const instructions = [];
  let pc = start;
  for (let i = 0; i < count; i += 1) {
    const inst = decodeAt(pc);
    instructions.push(inst);
    pc = inst.nextPc;
    if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-indirect') {
      break;
    }
  }
  return instructions;
}

function printDisassembly(title, instructions) {
  console.log(title);
  for (const inst of instructions) {
    console.log(`  ${hex(inst.pc)}  ${formatBytes(inst.pc, inst.length).padEnd(17)}  ${formatInstruction(inst)}`);
  }
  console.log('');
}

function findExactCalls() {
  const hits = [];
  for (let i = 0; i <= rom.length - EXACT_CALL.length; i += 1) {
    let match = true;
    for (let j = 0; j < EXACT_CALL.length; j += 1) {
      if (rom[i + j] !== EXACT_CALL[j]) {
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

function extractForwardedArg(callSite) {
  for (let pc = Math.max(0, callSite - 8); pc <= callSite - 4; pc += 1) {
    if (rom[pc] === 0x01 && pc + 4 <= callSite) {
      return {
        site: pc,
        value: rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16),
      };
    }
  }
  return null;
}

function scanSlotRefs(addr) {
  const addrBytes = [addr & 0xFF, (addr >> 8) & 0xFF, (addr >> 16) & 0xFF];
  const refs = [];
  const seen = new Set();

  for (let i = 0; i <= rom.length - 3; i += 1) {
    if (rom[i] !== addrBytes[0] || rom[i + 1] !== addrBytes[1] || rom[i + 2] !== addrBytes[2]) {
      continue;
    }

    for (let start = Math.max(0, i - 2); start <= i; start += 1) {
      try {
        const inst = decodeAt(start);
        if (inst.addr !== addr || seen.has(inst.pc)) {
          continue;
        }
        seen.add(inst.pc);
        refs.push(inst);
        break;
      } catch {
        // Ignore undecodable overlap and continue searching.
      }
    }
  }

  refs.sort((a, b) => a.pc - b.pc);
  return refs;
}

function findPairValueBefore(site, pair) {
  for (let pc = Math.max(0, site - 8); pc <= site - 4; pc += 1) {
    try {
      const inst = decodeAt(pc);
      if (inst.tag === 'ld-pair-imm' && inst.pair === pair && inst.nextPc <= site) {
        return { site: inst.pc, value: inst.value };
      }
    } catch {
      // Ignore and keep scanning.
    }
  }
  return null;
}

function describeEffectiveCallback(value) {
  if (value === VECTOR_ENTRY_49) {
    const inst = decodeAt(value);
    if (inst.tag === 'jp') {
      return `vector entry 49 -> JP ${hex(inst.target)}`;
    }
  }
  return 'direct callback body';
}

const main = disassembleFunction(START);
const duplicate = disassembleFunction(DUPLICATE);
const helperFrameset = disassembleLinear(HELPER_FRAMESET);
const helperCmp = disassembleLinear(HELPER_ICMPZERO);
const helperIndcall = disassembleLinear(HELPER_INDCALL);
const vector49 = disassembleLinear(VECTOR_ENTRY_49, 2);
const exactCalls = findExactCalls();
const slotRefs = scanSlotRefs(CALLBACK_SLOT);
const writers = slotRefs.filter((inst) => inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg');

const endPc = main[main.length - 1].pc;
const size = main[main.length - 1].nextPc - START;

console.log('=== 0x01322D indirect callback dispatcher ===');
console.log(`Range: ${hex(START)}..${hex(endPc)} (${size} bytes)`);
console.log('Stack argument use: reads one 24-bit argument from (IX+6), pushes it unchanged, then discards it with POP BC after the callback returns.');
console.log('Direct 0x30xx port I/O in this wrapper: none.');
console.log('');

printDisassembly('Main function', main);
printDisassembly('Related duplicate wrapper 0x041E95', duplicate);
printDisassembly('Helper 0x00218A (__frameset0 body)', helperFrameset);
printDisassembly('Helper 0x0021C2 (_icmpzero body)', helperCmp);
printDisassembly('Helper 0x002288 (_indcall body)', helperIndcall);
printDisassembly('Vector entry 49 at 0x00063C', vector49);

console.log('=== Exact CALL-byte scan for 0x01322D (CD 2D 32 01) ===');
for (const site of exactCalls) {
  const arg = extractForwardedArg(site);
  const argText = arg ? `${hex(arg.value)} from ${hex(arg.site)}` : 'dynamic / not recovered';
  console.log(`  ${hex(site)}  forwarded arg ${argText}`);
}
console.log(`Total exact CALL hits: ${exactCalls.length}`);
console.log('');

console.log('=== Full-address 0xD14026 scan (26 40 D1) ===');
for (const inst of slotRefs) {
  const access =
    inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg'
      ? 'write'
      : inst.pair === 'iy'
        ? 'dispatch-load'
        : 'read';
  console.log(`  ${hex(inst.pc)}  ${formatBytes(inst.pc, inst.length).padEnd(17)}  ${formatInstruction(inst).padEnd(28)} ${access}`);
}
console.log(`Total real full-address references: ${slotRefs.length}`);
console.log('');

console.log('=== Writers to 0xD14026 ===');
for (const inst of writers) {
  const sourcePair = inst.pair ?? inst.src;
  const imm = inst.tag === 'ld-mem-pair' ? findPairValueBefore(inst.pc, inst.pair) : null;
  const stored = imm ? hex(imm.value) : 'dynamic';
  const note = imm ? describeEffectiveCallback(imm.value) : 'dynamic store';
  console.log(`  ${hex(inst.pc)}  ${formatInstruction(inst)}  ; ${sourcePair.toUpperCase()}=${stored} (${note})`);
}
console.log('');

console.log('=== Candidate callback targets ===');
for (const inst of writers) {
  const imm = inst.tag === 'ld-mem-pair' ? findPairValueBefore(inst.pc, inst.pair) : null;
  if (!imm) {
    continue;
  }
  console.log(`  ${hex(imm.value)}  installed at ${hex(inst.pc)}  ${describeEffectiveCallback(imm.value)}`);
}
console.log('');

console.log('Done.');
