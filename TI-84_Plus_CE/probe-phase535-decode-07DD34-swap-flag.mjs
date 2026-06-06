import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const START = 0x07dd34;
const LENGTH = 0x80;

const opRegisters = new Map([
  [0xd005f8, 'OP1'],
  [0xd00603, 'OP2'],
  [0xd0060e, 'OP3'],
  [0xd00619, 'OP4'],
  [0xd00624, 'OP5'],
  [0xd0062f, 'OP6'],
]);

const knownEntries = new Map([
  [0x07dd34, 'main entry'],
  [0x07dd5e, 'OP4/OP5 setup'],
  [0x07dd6a, 'type check'],
  [0x07dd74, 'double-call flag wrapper'],
  [0x07dd82, 'sub-function target'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u24(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function opName(address) {
  return opRegisters.get(address) ?? hex(address);
}

function readU24Operand(bytes, offset, shortOperand) {
  if (shortOperand) {
    return {
      value: bytes[offset] | (bytes[offset + 1] << 8),
      size: 2,
    };
  }

  return {
    value: u24(bytes, offset),
    size: 3,
  };
}

function decodeOne(bytes, pc, base) {
  const offset = pc - base;
  let prefix = '';
  let shortOperand = false;
  let opOffset = offset;

  if (bytes[opOffset] === 0x52) {
    prefix = '.SIL ';
    shortOperand = true;
    opOffset += 1;
  }

  const opcode = bytes[opOffset];
  const opPc = base + opOffset;
  const instStart = offset;

  const finish = (size, text, meta = {}) => ({
    pc,
    size: opOffset - offset + size,
    bytes: bytes.subarray(instStart, instStart + opOffset - offset + size),
    text: `${prefix}${text}`,
    ...meta,
  });

  if (opcode === 0xcd || opcode === 0xc3) {
    const { value, size } = readU24Operand(bytes, opOffset + 1, shortOperand);
    return finish(1 + size, `${opcode === 0xcd ? 'CALL' : 'JP'} ${hex(value)}`, {
      call: opcode === 0xcd ? value : undefined,
      jump: opcode === 0xc3 ? value : undefined,
      terminal: opcode === 0xc3,
    });
  }

  if (opcode === 0x21 || opcode === 0x11 || opcode === 0x01) {
    const reg = opcode === 0x21 ? 'HL' : opcode === 0x11 ? 'DE' : 'BC';
    const { value, size } = readU24Operand(bytes, opOffset + 1, shortOperand);
    return finish(1 + size, `LD ${reg},${opName(value)}`, {
      opRef: opRegisters.has(value) ? { reg, address: value, name: opRegisters.get(value) } : undefined,
    });
  }

  if (opcode === 0x18 || opcode === 0x20 || opcode === 0x28 || opcode === 0x30 || opcode === 0x38) {
    const cc = new Map([[0x18, ''], [0x20, ' NZ'], [0x28, ' Z'], [0x30, ' NC'], [0x38, ' C']]).get(opcode);
    const target = opPc + 2 + s8(bytes[opOffset + 1]);
    return finish(2, `JR${cc} ${hex(target)}`, {
      jump: target,
      terminal: opcode === 0x18,
    });
  }

  if (opcode === 0xc9) return finish(1, 'RET', { terminal: true });
  if (opcode === 0x3e) return finish(2, `LD A,${hex(bytes[opOffset + 1], 2)}`);
  if (opcode === 0xe6) return finish(2, `AND ${hex(bytes[opOffset + 1], 2)}`, { flagOp: 'AND' });
  if (opcode === 0xfe) return finish(2, `CP ${hex(bytes[opOffset + 1], 2)}`, { flagOp: 'CP' });
  if (opcode === 0xee) return finish(2, `XOR ${hex(bytes[opOffset + 1], 2)}`, { flagOp: 'XOR' });
  if (opcode === 0xf6) return finish(2, `OR ${hex(bytes[opOffset + 1], 2)}`, { flagOp: 'OR' });
  if (opcode === 0xaf) return finish(1, 'XOR A', { flagOp: 'XOR' });
  if (opcode === 0xb7) return finish(1, 'OR A', { flagOp: 'OR' });
  if (opcode === 0x37) return finish(1, 'SCF', { flagOp: 'SCF' });
  if (opcode === 0x3f) return finish(1, 'CCF', { flagOp: 'CCF' });

  if (opcode === 0xed) {
    const ed = bytes[opOffset + 1];
    const edNames = new Map([[0xb0, 'LDIR'], [0xa0, 'LDI'], [0xa1, 'CPI'], [0xb1, 'CPIR']]);
    if (edNames.has(ed)) return finish(2, edNames.get(ed));
  }

  return finish(1, `DB ${hex(opcode, 2)}`);
}

function decode(bytes, base) {
  const out = [];
  for (let pc = base; pc < base + bytes.length;) {
    const inst = decodeOne(bytes, pc, base);
    out.push(inst);
    pc += Math.max(inst.size, 1);
  }
  return out;
}

function functionBlocks(instructions) {
  const blocks = [];
  let current = null;

  for (const inst of instructions) {
    if (knownEntries.has(inst.pc) || current === null) {
      if (current && current.instructions.length) blocks.push(current);
      current = {
        start: inst.pc,
        label: knownEntries.get(inst.pc) ?? 'linear decode entry',
        instructions: [],
      };
    }

    current.instructions.push(inst);
    if (inst.terminal) {
      blocks.push(current);
      current = null;
    }
  }

  if (current && current.instructions.length) blocks.push(current);
  return blocks;
}

function summarizeBlock(block) {
  const calls = block.instructions.filter((inst) => inst.call !== undefined).map((inst) => inst.call);
  const opRefs = block.instructions.filter((inst) => inst.opRef).map((inst) => inst.opRef);
  const flagOps = block.instructions.filter((inst) => inst.flagOp).map((inst) => `${hex(inst.pc)} ${inst.text}`);
  const last = block.instructions.at(-1);
  const end = last.pc + last.size;

  return {
    range: `${hex(block.start)}-${hex(end)}`,
    label: block.label,
    calls,
    opRefs,
    flagOps,
  };
}

const rom = fs.readFileSync(ROM_PATH);
const slice = rom.subarray(START, START + LENGTH);
const instructions = decode(slice, START);
const blocks = functionBlocks(instructions);

console.log(`Phase 535 decode probe: ${hex(START)}..${hex(START + LENGTH)}`);
console.log('');
console.log('Disassembly:');
for (const inst of instructions) {
  const raw = [...inst.bytes].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  console.log(`${hex(inst.pc)}  ${raw.padEnd(14)} ${inst.text}`);
}

console.log('');
console.log('Function boundaries and findings:');
for (const block of blocks) {
  const summary = summarizeBlock(block);
  console.log(`${summary.range}  ${summary.label}`);
  console.log(`  calls: ${summary.calls.length ? summary.calls.map((target) => hex(target)).join(', ') : 'none'}`);
  console.log(`  OP refs: ${summary.opRefs.length ? summary.opRefs.map((ref) => `${ref.reg}->${ref.name}(${hex(ref.address)})`).join(', ') : 'none'}`);
  console.log(`  flag ops: ${summary.flagOps.length ? summary.flagOps.join('; ') : 'none'}`);
}

console.log('');
console.log('Known-purpose notes:');
console.log('- 0x07DD5E loads HL=OP4 and DE=OP5, then jumps into the shared OP copy/swap helper at 0x07FD38.');
console.log('- 0x07DD6A masks A with 0x3F before tail-calling 0x08021F, matching a type-code normalization/check helper.');
console.log('- 0x07DD74 is expected to call 0x07DD82 twice, then load A=0x83 and tail-jump into the next flag/status stage.');
console.log('- 0x07DD34 is the cluster entry that reaches the OP4/OP5 setup path and participates in the swap+flag pipeline.');
