#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const decoderPath = path.join(__dirname, 'ez80-decoder.js');
const romBytes = fs.readFileSync(romPath);
const decoderSource = fs.readFileSync(decoderPath, 'utf8');
const { decodeInstruction } = await import(
  `data:text/javascript;base64,${Buffer.from(decoderSource).toString('base64')}`
);

const FPUNPACK = 0x0034A7;
const FPUNPACK2 = 0x0034CC;
const SOFT_FLOAT_FUNCTIONS = withRanges([
  { name: '_fpunpack', start: 0x0034A7 },
  { name: '_fpunpack2', start: 0x0034CC },
  { name: '_fppack', start: 0x0034EE },
  { name: '_fadd', start: 0x003569 },
  { name: '_fcmp', start: 0x0035C8 },
  { name: '_fdiv', start: 0x0035E5 },
  { name: '_ftol', start: 0x003663 },
  { name: '_ltof', start: 0x003704 },
  { name: '_fmul', start: 0x00372B },
  { name: '_fneg', start: 0x0037EB },
  { name: '_fsub', start: 0x0037FC },
  { name: '_ultof', start: 0x00380D },
  { name: 'sqrtf', start: 0x003818 },
  { name: '_frbtof', start: 0x00388B },
  { name: '_frftob', start: 0x0038A9 },
  { name: '_frftoi', start: 0x0038BA },
  { name: '_frftos', start: 0x0038D8 },
  { name: '_frftoub', start: 0x0038ED },
  { name: '_frftoui', start: 0x003931 },
  { name: '_frftous', start: 0x00396D },
  { name: '_fritof', start: 0x00399C },
  { name: '_frstof', start: 0x0039BD },
  { name: '_frubtof', start: 0x0039C7 },
  { name: '_fruitof', start: 0x0039E1 },
  { name: '_frustof', start: 0x003A05 },
]);

function withRanges(functions) {
  const sorted = [...functions].sort((a, b) => a.start - b.start);
  return sorted.map((fn, index) => ({
    ...fn,
    endExclusive: index + 1 < sorted.length ? sorted[index + 1].start : romBytes.length,
  }));
}

function hexN(value, width = 6) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function bytesFor(addr, length) {
  const out = [];
  for (let i = 0; i < length; i++) out.push(hexN(romBytes[addr + i], 2).slice(2));
  return out.join(' ').padEnd(18);
}

function scanCallSites(target) {
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;
  const hits = [];
  for (let pc = 0; pc < romBytes.length - 3; pc++) {
    if (
      romBytes[pc] === 0xCD &&
      romBytes[pc + 1] === b0 &&
      romBytes[pc + 2] === b1 &&
      romBytes[pc + 3] === b2
    ) {
      hits.push(pc);
    }
  }
  return hits;
}

function decodeFunction(func) {
  const instructions = [];
  let pc = func.start;
  let guard = 0;
  while (pc < func.endExclusive && guard < 4096) {
    guard += 1;
    let instr;
    try {
      instr = decodeInstruction(romBytes, pc, 'adl');
    } catch (error) {
      instructions.push({
        addr: pc,
        length: 1,
        nextPc: pc + 1,
        bytes: bytesFor(pc, 1),
        mnemonic: `DB ${hexN(romBytes[pc], 2)}`,
        instr: { tag: 'db' },
      });
      pc += 1;
      continue;
    }

    instructions.push({
      addr: pc,
      length: instr.length,
      nextPc: instr.nextPc,
      bytes: bytesFor(pc, instr.length),
      mnemonic: formatInstruction(instr),
      instr,
    });
    pc = instr.nextPc;

    if (instr.tag === 'ret' || instr.tag === 'reti' || instr.tag === 'retn') {
      break;
    }
  }
  return instructions;
}

function findParentFunction(addr) {
  return SOFT_FLOAT_FUNCTIONS.find((fn) => addr >= fn.start && addr < fn.endExclusive) ?? null;
}

function instructionWindow(instructions, callAddr, beforeBytes = 32, afterBytes = 36) {
  const start = Math.max(0, callAddr - beforeBytes);
  const end = callAddr + afterBytes;
  return instructions.filter((ins) => ins.addr >= start && ins.addr < end);
}

function buildSetupPattern(instructions, index) {
  let start = Math.max(0, index - 4);
  for (let i = index - 1; i >= 0; i--) {
    const target = instructions[i].instr?.target;
    if (instructions[i].instr?.tag === 'call' && target === FPUNPACK) {
      start = i;
      break;
    }
  }
  return instructions
    .slice(start, index)
    .map((ins) => ins.mnemonic)
    .join(' ; ');
}

function buildPostPattern(instructions, index) {
  return instructions
    .slice(index + 1, Math.min(instructions.length, index + 6))
    .map((ins) => ins.mnemonic)
    .join(' ; ');
}

function callSitesInFunction(target, func) {
  return scanCallSites(target).filter((site) => site >= func.start && site < func.endExclusive);
}

function functionPrologue(instructions, count = 5) {
  return instructions
    .slice(0, count)
    .map((ins) => `${hexN(ins.addr)} ${ins.mnemonic}`)
    .join(' | ');
}

function contextualNote(name) {
  switch (name) {
    case '_fadd':
      return 'lhs is unpacked first from A:BC, lhs sign/exponent are preserved through RR D + PUSH AF, then rhs is unpacked from E:HL before exponent comparison.';
    case '_fdiv':
      return 'lhs mantissa is saved with PUSH BC, lhs exponent/sign are copied into C/A, then rhs is unpacked and the function immediately XORs the signs and seeds the exponent as 0x96 + lhsExp - rhsExp.';
    case '_fmul':
      return 'lhs mantissa is saved with PUSH BC, lhs exponent/sign are copied into C/A, then rhs is unpacked and the function immediately XORs the signs and seeds the exponent as lhsExp + rhsExp - 0x80.';
    default:
      return 'no handwritten note for this function.';
  }
}

function formatInstruction(instr) {
  const tag = instr.tag;

  switch (tag) {
    case 'nop': return 'NOP';
    case 'ret': return 'RET';
    case 'retn': return 'RETN';
    case 'reti': return 'RETI';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-pair': return `EX (SP), ${instr.pair.toUpperCase()}`;
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'neg': return 'NEG';
    case 'daa': return 'DAA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rrd': return 'RRD';
    case 'rld': return 'RLD';
    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';

    case 'ld-reg-reg':
      return `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${instr.dest.toUpperCase()}, ${hexN(instr.value, 2)}`;
    case 'ld-reg-ind':
      return `LD ${instr.dest.toUpperCase()}, (${instr.src.toUpperCase()})`;
    case 'ld-ind-reg':
      return `LD (${instr.dest.toUpperCase()}), ${instr.src.toUpperCase()}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexN(instr.value, 2)}`;
    case 'ld-pair-imm':
      return `LD ${instr.pair.toUpperCase()}, ${hexN(instr.value, 6)}`;
    case 'ld-pair-mem':
      if (instr.direction === 'from-mem') {
        return `LD ${instr.pair.toUpperCase()}, (${hexN(instr.addr, 6)})`;
      }
      return `LD (${hexN(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;
    case 'ld-mem-reg':
      return `LD (${hexN(instr.addr, 6)}), ${instr.src.toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${instr.dest.toUpperCase()}, (${hexN(instr.addr, 6)})`;
    case 'ld-mem-pair':
      return `LD (${hexN(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;
    case 'ld-pair-ind':
      return `LD ${instr.pair.toUpperCase()}, (${instr.src.toUpperCase()})`;
    case 'ld-ind-pair':
      return `LD (${instr.dest.toUpperCase()}), ${instr.pair.toUpperCase()}`;
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'ld-sp-pair':
      return `LD SP, ${instr.pair.toUpperCase()}`;

    case 'ld-reg-ixd':
      return `LD ${instr.dest.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-ixd-reg':
      return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${instr.src.toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${hexN(instr.value, 2)}`;
    case 'ld-pair-indexed':
      return `LD ${instr.pair.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-indexed-pair':
      return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${instr.pair.toUpperCase()}`;

    case 'ld-special':
      return `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;

    case 'inc-reg': return `INC ${instr.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${instr.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${instr.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${instr.pair.toUpperCase()}`;
    case 'inc-ixd':
      return `INC (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'dec-ixd':
      return `DEC (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;

    case 'add-pair':
      return `ADD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
    case 'adc-pair':
      return `ADC HL, ${instr.src.toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL, ${instr.src.toUpperCase()}`;

    case 'alu-reg':
      return `${instr.op.toUpperCase()} A, ${instr.src.toUpperCase()}`;
    case 'alu-imm':
      return `${instr.op.toUpperCase()} A, ${hexN(instr.value, 2)}`;
    case 'alu-ixd':
      return `${instr.op.toUpperCase()} A, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;

    case 'push': return `PUSH ${instr.pair.toUpperCase()}`;
    case 'pop': return `POP ${instr.pair.toUpperCase()}`;

    case 'jp':
      return `JP ${hexN(instr.target, 6)}`;
    case 'jp-conditional':
      return `JP ${instr.condition.toUpperCase()}, ${hexN(instr.target, 6)}`;
    case 'jp-indirect':
      return `JP (${instr.indirectRegister.toUpperCase()})`;
    case 'jr':
      return `JR ${hexN(instr.target, 6)}`;
    case 'jr-conditional':
      return `JR ${instr.condition.toUpperCase()}, ${hexN(instr.target, 6)}`;
    case 'djnz':
      return `DJNZ ${hexN(instr.target, 6)}`;

    case 'call':
      return `CALL ${hexN(instr.target, 6)}`;
    case 'call-conditional':
      return `CALL ${instr.condition.toUpperCase()}, ${hexN(instr.target, 6)}`;

    case 'ret-conditional':
      return `RET ${instr.condition.toUpperCase()}`;
    case 'rst':
      return `RST ${hexN(instr.target, 2)}`;

    case 'rotate-reg':
      return `${instr.op.toUpperCase()} ${instr.reg.toUpperCase()}`;
    case 'rotate-ind':
      return `${instr.op.toUpperCase()} (${instr.indirectRegister.toUpperCase()})`;

    case 'bit-test':
      return `BIT ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-test-ind':
      return `BIT ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-set':
      return `SET ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-set-ind':
      return `SET ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-res':
      return `RES ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-res-ind':
      return `RES ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;

    case 'indexed-cb-rotate':
      return `${instr.operation.toUpperCase()} (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-bit':
      return `BIT ${instr.bit}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-set':
      return `SET ${instr.bit}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-res':
      return `RES ${instr.bit}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;

    case 'in0': return `IN0 ${instr.reg.toUpperCase()}, (${hexN(instr.port, 2)})`;
    case 'out0': return `OUT0 (${hexN(instr.port, 2)}), ${instr.reg.toUpperCase()}`;
    case 'in-reg': return `IN ${instr.reg.toUpperCase()}, (C)`;
    case 'in-imm': return `IN A, (${hexN(instr.port, 2)})`;
    case 'out-reg': return `OUT (C), ${instr.reg.toUpperCase()}`;
    case 'out-imm': return `OUT (${hexN(instr.port, 2)}), A`;

    case 'mlt': return `MLT ${instr.reg.toUpperCase()}`;
    case 'tst-reg': return `TST A, ${instr.reg.toUpperCase()}`;
    case 'tst-ind': return 'TST A, (HL)';
    case 'tst-imm': return `TST A, ${hexN(instr.value, 2)}`;

    case 'lea':
      return `LEA ${instr.dest.toUpperCase()}, ${instr.base.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}`;

    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'slp': return 'SLP';

    default:
      return `[${tag}] ${JSON.stringify(instr)}`;
  }
}

const fpunpackCallSites = scanCallSites(FPUNPACK);
const fpunpack2CallSites = scanCallSites(FPUNPACK2);
const decodeCache = new Map();

function getDecodedFunction(func) {
  if (!decodeCache.has(func.start)) {
    decodeCache.set(func.start, decodeFunction(func));
  }
  return decodeCache.get(func.start);
}

console.log('Phase 315 - _fpunpack2 caller trace');
console.log(`ROM: ${romPath}`);
console.log(`Direct CALL ${hexN(FPUNPACK2)} count: ${fpunpack2CallSites.length}`);
console.log(`Direct CALL ${hexN(FPUNPACK)} count: ${fpunpackCallSites.length}`);
console.log('');

for (const site of fpunpack2CallSites) {
  const parent = findParentFunction(site);
  const parentLabel = parent ? `${parent.name} ${hexN(parent.start)}..${hexN(parent.endExclusive - 1)}` : 'unknown';
  const instructions = parent ? getDecodedFunction(parent) : [];
  const index = instructions.findIndex((ins) => ins.addr === site);
  const siblingFpunpackCalls = parent ? callSitesInFunction(FPUNPACK, parent) : [];
  const siblingFpunpack2Calls = parent ? callSitesInFunction(FPUNPACK2, parent) : [];

  console.log('='.repeat(78));
  console.log(`CALL SITE ${hexN(site)} -> ${hexN(FPUNPACK2)}  parent=${parentLabel}`);
  if (parent) {
    console.log(`Function prologue: ${functionPrologue(instructions)}`);
  }
  console.log(`Same function also calls _fpunpack: ${siblingFpunpackCalls.length ? 'yes' : 'no'}`);
  if (siblingFpunpackCalls.length) {
    console.log(`  _fpunpack sites: ${siblingFpunpackCalls.map((addr) => hexN(addr)).join(', ')}`);
  }
  console.log(`  _fpunpack2 sites: ${siblingFpunpack2Calls.map((addr) => hexN(addr)).join(', ')}`);
  if (index >= 0) {
    console.log(`Register/setup pattern before call: ${buildSetupPattern(instructions, index)}`);
    console.log(`Immediate use after return: ${buildPostPattern(instructions, index)}`);
  }
  console.log(`Interpretation: ${parent ? contextualNote(parent.name) : 'no parent match.'}`);
  console.log('Context disassembly (~30 bytes around call):');
  for (const ins of instructionWindow(instructions, site)) {
    const marker = ins.addr === site ? '>>' : '  ';
    console.log(`${marker} ${hexN(ins.addr)}  ${ins.bytes}  ${ins.mnemonic}`);
  }
  console.log('');
}

console.log('-'.repeat(78));
console.log('Direct _fpunpack callers grouped by parent function:');
for (const site of fpunpackCallSites) {
  const parent = findParentFunction(site);
  console.log(`  ${hexN(site)}  ${parent ? parent.name : 'unknown'}`);
}

const fpunpack2Parents = new Set(
  fpunpack2CallSites
    .map((site) => findParentFunction(site))
    .filter(Boolean)
    .map((fn) => fn.name)
);
const originalOnly = fpunpackCallSites.filter((site) => {
  const parent = findParentFunction(site);
  return !parent || !fpunpack2Parents.has(parent.name);
});

console.log('');
console.log('Original-only _fpunpack direct callers (no _fpunpack2 in same function):');
for (const site of originalOnly) {
  const parent = findParentFunction(site);
  console.log(`  ${hexN(site)}  ${parent ? parent.name : 'unknown'}`);
}
