#!/usr/bin/env node
// probe-phase432-trace-0079E5.mjs
// Static trace for 0x0079E5 plus the caller-side setup in 0x00D9EE.
// Run: node TI-84_Plus_CE/probe-phase432-trace-0079E5.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const TARGET = 0x0079E5;
const CALLER = 0x00D9EE;
const CALLER_ARG_START = 0x00DA3A;
const CALLER_ARG_END = 0x00DA6B;
const PACK_HELPER = 0x0026D2;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesFor(addr, length) {
  return Array.from(rom.slice(addr, addr + length))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function formatDisp(displacement) {
  return displacement >= 0 ? `+${displacement}` : `${displacement}`;
}

function isRam(addr) {
  return addr >= 0xD00000 && addr <= 0xD1FFFF;
}

function endpointRegisterName(port) {
  if (port < 0x3100 || port > 0x31FF) return null;
  if (port === 0x3100) return 'USB control';
  if (port === 0x3138) return 'interrupt flags';
  if (port === 0x313A) return 'interrupt enable';

  if (port >= 0x3108 && port <= 0x3137) {
    const offset = port - 0x3108;
    const endpoint = Math.floor(offset / 8);
    const register = offset % 8;
    return `endpoint ${endpoint} register ${register}`;
  }

  return 'USB 0x31xx register';
}

function describePort(port) {
  if (port === 0x3014) return 'USB speed/link register';
  if (port === 0x3015) return 'USB speed/link upper/status byte';
  if (port === 0x3018) return 'USB side-band/status register';
  if (port >= 0x3028 && port <= 0x302B) return `USB side-band window +${hex(port - 0x3028, 2)}`;
  return endpointRegisterName(port) ?? 'non-endpoint USB/global register';
}

function decodeLinearUntilRet(start, maxInstructions = 128) {
  const instructions = [];
  let pc = start;

  for (let count = 0; count < maxInstructions; count += 1) {
    const instruction = decodeInstruction(rom, pc, 'adl');
    instructions.push(instruction);
    pc = instruction.nextPc;

    if (instruction.tag === 'ret' || instruction.tag === 'retn' || instruction.tag === 'reti') {
      return instructions;
    }
  }

  throw new Error(`No RET reached from ${hex(start)} within ${maxInstructions} instructions`);
}

function decodeRange(start, endExclusive) {
  const instructions = [];
  let pc = start;

  while (pc < endExclusive) {
    const instruction = decodeInstruction(rom, pc, 'adl');
    instructions.push(instruction);
    pc = instruction.nextPc;
  }

  return instructions;
}

function formatInstruction(instr) {
  switch (instr.tag) {
    case 'push':
      return `PUSH ${instr.pair.toUpperCase()}`;
    case 'pop':
      return `POP ${instr.pair.toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'call':
      return `CALL ${hex(instr.target)}`;
    case 'rst':
      return `RST ${hex(instr.target, 2)}`;
    case 'jr':
      return `JR ${hex(instr.target)}`;
    case 'jr-conditional':
      return `JR ${instr.condition.toUpperCase()},${hex(instr.target)}`;
    case 'ld-pair-imm':
      return `LD ${instr.pair.toUpperCase()},${hex(instr.value)}`;
    case 'ld-reg-imm':
      return `LD ${instr.dest.toUpperCase()},${hex(instr.value, 2)}`;
    case 'add-pair':
      return `ADD ${instr.dest.toUpperCase()},${instr.src.toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${instr.dest.toUpperCase()},(${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
    case 'ld-ixd-reg':
      return `LD (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)}),${instr.src.toUpperCase()}`;
    case 'ld-reg-reg':
      return `LD ${instr.dest.toUpperCase()},${instr.src.toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${instr.dest.toUpperCase()},(${hex(instr.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(instr.addr)}),${instr.src.toUpperCase()}`;
    case 'in-reg':
      return `IN ${instr.reg.toUpperCase()},(C)`;
    case 'out-reg':
      return `OUT (C),${instr.reg.toUpperCase()}`;
    case 'alu-imm':
      return `${instr.op.toUpperCase()} ${hex(instr.value, 2)}`;
    case 'alu-reg':
      if (instr.op === 'or' && instr.src === 'a') return 'OR A';
      if (instr.op === 'xor' && instr.src === 'a') return 'XOR A';
      return `${instr.op.toUpperCase()} ${instr.src.toUpperCase()}`;
    default:
      return `[${instr.tag}]`;
  }
}

function tracePortOps(instructions) {
  const ops = [];
  let bcPort = null;

  for (const instruction of instructions) {
    if (instruction.tag === 'ld-pair-imm' && instruction.pair === 'bc') {
      bcPort = instruction.value & 0xFFFF;
      continue;
    }

    if (instruction.tag === 'inc-pair' && instruction.pair === 'bc' && bcPort != null) {
      bcPort = (bcPort + 1) & 0xFFFF;
      continue;
    }

    if (instruction.tag === 'inc-reg' && instruction.reg === 'c' && bcPort != null) {
      bcPort = (bcPort & 0xFF00) | ((bcPort + 1) & 0xFF);
      continue;
    }

    if (instruction.tag === 'out-reg') {
      ops.push({
        pc: instruction.pc,
        access: 'write',
        port: bcPort,
        reg: instruction.reg.toUpperCase(),
      });
      continue;
    }

    if (instruction.tag === 'in-reg') {
      ops.push({
        pc: instruction.pc,
        access: 'read',
        port: bcPort,
        reg: instruction.reg.toUpperCase(),
      });
      continue;
    }
  }

  return ops;
}

function collectCalls(instructions) {
  return [...new Set(
    instructions
      .filter((instruction) => instruction.tag === 'call' || instruction.tag === 'call-conditional')
      .map((instruction) => instruction.target),
  )];
}

function collectRamRefs(instructions) {
  const refs = [];

  for (const instruction of instructions) {
    if (typeof instruction.addr === 'number' && isRam(instruction.addr)) {
      refs.push({
        pc: instruction.pc,
        addr: instruction.addr,
        access: instruction.tag.includes('mem-reg') ? 'write' : 'read',
      });
    }
  }

  return refs;
}

function noteForTarget(instr) {
  switch (instr.pc) {
    case 0x0079EE:
      return 'load stacked byte argument from IX+6';
    case 0x0079F1:
      return 'select port 0x3014';
    case 0x0079F5:
      return 'write the argument byte directly to 0x3014';
    case 0x0079F7:
      return 'begin BC sanity-check loop';
    case 0x007A00:
      return 'loop until C still matches 0x14';
    default:
      return '';
  }
}

function noteForCaller(instr) {
  switch (instr.pc) {
    case 0x00DA3A:
      return 'select upper status byte port';
    case 0x00DA3E:
      return 'sample 0x3015';
    case 0x00DA45:
      return 'select lower status byte port';
    case 0x00DA49:
      return 'sample 0x3014';
    case 0x00DA51:
      return '0x0026D2 only repacks bytes into HL';
    case 0x00DA55:
      return 'use low byte only';
    case 0x00DA56:
      return 'mask to 6 bits';
    case 0x00DA67:
      return 'pass masked byte to 0x0079E5';
    default:
      return '';
  }
}

function printInstructionBlock(title, instructions, noteFn = () => '') {
  console.log(title);
  for (const instruction of instructions) {
    const bytes = bytesFor(instruction.pc, instruction.length).padEnd(16, ' ');
    const note = noteFn(instruction);
    console.log(
      `${hex(instruction.pc)}  ${bytes} ${formatInstruction(instruction)}${note ? `  ; ${note}` : ''}`,
    );
  }
  console.log('');
}

const targetInstructions = decodeLinearUntilRet(TARGET);
const targetStart = targetInstructions[0].pc;
const targetEnd = targetInstructions[targetInstructions.length - 1].nextPc - 1;
const targetSize = targetEnd - targetStart + 1;
const callTargets = collectCalls(targetInstructions);
const portOps = tracePortOps(targetInstructions);
const endpointWrites = portOps.filter((op) => op.access === 'write' && endpointRegisterName(op.port) != null);
const ramRefs = collectRamRefs(targetInstructions);
const callerArgInstructions = decodeRange(CALLER_ARG_START, CALLER_ARG_END);
const nextSibling = targetInstructions[targetInstructions.length - 1].nextPc;
const nextSiblingInstruction = decodeInstruction(rom, nextSibling, 'adl');

console.log('# Phase 432 Probe: Trace of 0x0079E5');
console.log('');
console.log(`Target span: ${hex(targetStart)}..${hex(targetEnd)} (${targetSize} bytes, ${targetInstructions.length} decoded instructions)`);
console.log(`RET boundary: ${hex(targetEnd)} (${formatInstruction(targetInstructions[targetInstructions.length - 1])})`);
console.log(`Sibling entry after RET: ${hex(nextSibling)} (${formatInstruction(nextSiblingInstruction)})`);
console.log(`Known caller under study: ${hex(CALLER)}`);
console.log('');

printInstructionBlock('Disassembly:', targetInstructions, noteForTarget);

console.log('Direct CALL targets inside 0x0079E5:');
if (callTargets.length === 0) {
  console.log('- none');
} else {
  for (const target of callTargets) console.log(`- ${hex(target)}`);
}
console.log('');

console.log('Port I/O inside 0x0079E5:');
for (const op of portOps) {
  const endpointName = endpointRegisterName(op.port);
  const endpointSuffix = endpointName ? ` | endpoint window: ${endpointName}` : '';
  console.log(`- ${hex(op.pc)} ${op.access.toUpperCase()} ${hex(op.port, 4)} (${describePort(op.port)}) via ${op.reg}${endpointSuffix}`);
}
if (portOps.length === 0) console.log('- none');
console.log('');

console.log('Absolute RAM references inside 0x0079E5 (0xD0xxxx range):');
if (ramRefs.length === 0) {
  console.log('- none');
} else {
  for (const ref of ramRefs) {
    console.log(`- ${hex(ref.pc)} ${ref.access.toUpperCase()} ${hex(ref.addr)}`);
  }
}
console.log('');

console.log('Endpoint-register assessment:');
if (endpointWrites.length === 0) {
  console.log('- no 0x31xx endpoint/window registers are written here');
  console.log('- the only direct write is OUT (0x3014),A at 0x0079F5');
} else {
  for (const op of endpointWrites) {
    console.log(`- ${hex(op.pc)} writes ${hex(op.port, 4)} (${endpointRegisterName(op.port)})`);
  }
}
console.log('');

printInstructionBlock('Caller-side argument setup in 0x00D9EE:', callerArgInstructions, noteForCaller);

console.log('Argument mapping summary:');
console.log('- 0x00DA3E reads port 0x3015, but that byte stays in H and is not passed to 0x0079E5.');
console.log('- 0x00DA49 reads port 0x3014.');
console.log('- 0x0026D2 is a 9-byte pack helper: `L |= C`, `H |= B`, `RET`.');
console.log('- After that helper, the caller executes `A = L`, `AND 0x3F`, then passes that byte to 0x0079E5.');
console.log('- Effective mapping: argument = (port 0x3014) & 0x3F; 0x0079E5 writes that byte unchanged to port 0x3014.');

