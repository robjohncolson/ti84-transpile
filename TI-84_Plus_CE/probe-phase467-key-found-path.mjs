import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const romPath = join(scriptDir, 'ROM.rom');
const rom = readFileSync(romPath);

const MAIN_START = 0x003a0f;
const MAIN_END = 0x003a90;
const POLL_START = 0x003d5a;
const POLL_END = 0x003d90;
const TARGET_BYTES = 0x40;
const ADDR_MASK = 0xffffff;

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

const watchedCalls = new Map([
  [0x03fa09, 'possible key processor'],
  [0x0059c6, 'display function'],
  [0x005b96, 'display function'],
  [0x0059e9, 'display function'],
]);

function hex8(value) {
  return `$${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function hex24(value) {
  return `$${(value & ADDR_MASK).toString(16).toUpperCase().padStart(6, '0')}`;
}

function byteAt(address) {
  if (address < 0 || address >= rom.length) {
    throw new RangeError(`ROM address ${hex24(address)} is outside ${rom.length} bytes`);
  }
  return rom[address];
}

function hasBytes(address, count) {
  return address >= 0 && address + count <= rom.length;
}

function imm24(address) {
  return byteAt(address) | (byteAt(address + 1) << 8) | (byteAt(address + 2) << 16);
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function relTarget(address) {
  return (address + 2 + signedByte(byteAt(address + 1))) & ADDR_MASK;
}

function dispText(value) {
  const signed = signedByte(value);
  return signed < 0 ? `-${hex8(-signed)}` : `+${hex8(signed)}`;
}

function indexedMem(indexName, disp) {
  return `(${indexName}${dispText(disp)})`;
}

function makeInstruction(address, length, mnemonic, options = {}) {
  return {
    address,
    length,
    mnemonic,
    bytes: Array.from({ length }, (_, offset) => byteAt(address + offset)),
    ...options,
  };
}

function dbInstruction(address, length = 1) {
  return makeInstruction(
    address,
    length,
    Array.from({ length }, (_, offset) => hex8(byteAt(address + offset))).join(' '),
  );
}

function targetScope(target, windowStart, windowEnd) {
  const mainScope = target >= MAIN_START && target <= MAIN_END
    ? 'local to 003A0F-003A90'
    : 'external to 003A0F-003A90';
  const windowScope = target >= windowStart && target <= windowEnd
    ? ', local to this window'
    : '';
  return `${mainScope}${windowScope}`;
}

function decodeCB(address) {
  if (!hasBytes(address, 2)) return dbInstruction(address);

  const op = byteAt(address + 1);
  const x = op >> 6;
  const y = (op >> 3) & 0x07;
  const z = op & 0x07;
  const operand = r8[z];

  if (x === 0) return makeInstruction(address, 2, `${rot[y]} ${operand}`);
  if (x === 1) return makeInstruction(address, 2, `BIT ${y},${operand}`);
  if (x === 2) return makeInstruction(address, 2, `RES ${y},${operand}`);
  return makeInstruction(address, 2, `SET ${y},${operand}`);
}

function decodeIndexedCB(address, indexName) {
  if (!hasBytes(address, 4)) return dbInstruction(address);

  const disp = byteAt(address + 2);
  const op = byteAt(address + 3);
  const x = op >> 6;
  const y = (op >> 3) & 0x07;
  const z = op & 0x07;
  const mem = indexedMem(indexName, disp);
  const copyTo = z === 6 ? '' : `,${r8[z]}`;

  if (x === 0) return makeInstruction(address, 4, `${rot[y]} ${mem}${copyTo}`);
  if (x === 1) return makeInstruction(address, 4, `BIT ${y},${mem}`);
  if (x === 2) return makeInstruction(address, 4, `RES ${y},${mem}${copyTo}`);
  return makeInstruction(address, 4, `SET ${y},${mem}${copyTo}`);
}

function decodeED(address) {
  if (!hasBytes(address, 2)) return dbInstruction(address);

  const op = byteAt(address + 1);
  if (op === 0x38 && hasBytes(address, 3)) {
    return makeInstruction(address, 3, `IN0 A,(${hex8(byteAt(address + 2))})`);
  }
  if (op === 0x39 && hasBytes(address, 3)) {
    return makeInstruction(address, 3, `OUT0 (${hex8(byteAt(address + 2))}),A`);
  }
  if (op === 0x4d) return makeInstruction(address, 2, 'RETI');
  if (op === 0x45) return makeInstruction(address, 2, 'RETN');

  return dbInstruction(address, 2);
}

function indexedRegisterName(indexName, regCode) {
  if (regCode === 4) return `${indexName}H`;
  if (regCode === 5) return `${indexName}L`;
  return r8[regCode];
}

function decodeIndexPrefix(address, indexName) {
  if (!hasBytes(address, 2)) return dbInstruction(address);

  const op = byteAt(address + 1);
  const indexRps = ['BC', 'DE', indexName, 'SP'];
  const indexRps2 = ['BC', 'DE', indexName, 'AF'];

  if (op === 0xcb) return decodeIndexedCB(address, indexName);

  if ((op & 0xcf) === 0x09) {
    return makeInstruction(address, 2, `ADD ${indexName},${indexRps[(op >> 4) & 0x03]}`);
  }

  if ((op & 0xc7) === 0x04) {
    const reg = (op >> 3) & 0x07;
    if (reg === 4 || reg === 5) {
      return makeInstruction(address, 2, `INC ${indexedRegisterName(indexName, reg)}`);
    }
    if (reg === 6 && hasBytes(address, 3)) {
      return makeInstruction(address, 3, `INC ${indexedMem(indexName, byteAt(address + 2))}`);
    }
  }

  if ((op & 0xc7) === 0x05) {
    const reg = (op >> 3) & 0x07;
    if (reg === 4 || reg === 5) {
      return makeInstruction(address, 2, `DEC ${indexedRegisterName(indexName, reg)}`);
    }
    if (reg === 6 && hasBytes(address, 3)) {
      return makeInstruction(address, 3, `DEC ${indexedMem(indexName, byteAt(address + 2))}`);
    }
  }

  if ((op & 0xc7) === 0x06) {
    const reg = (op >> 3) & 0x07;
    if ((reg === 4 || reg === 5) && hasBytes(address, 3)) {
      return makeInstruction(address, 3, `LD ${indexedRegisterName(indexName, reg)},${hex8(byteAt(address + 2))}`);
    }
    if (reg === 6 && hasBytes(address, 4)) {
      return makeInstruction(address, 4, `LD ${indexedMem(indexName, byteAt(address + 2))},${hex8(byteAt(address + 3))}`);
    }
  }

  if (op >= 0x40 && op <= 0x7f && op !== 0x76) {
    const dst = (op >> 3) & 0x07;
    const src = op & 0x07;
    if (dst === 6 && hasBytes(address, 3)) {
      return makeInstruction(address, 3, `LD ${indexedMem(indexName, byteAt(address + 2))},${indexedRegisterName(indexName, src)}`);
    }
    if (src === 6 && hasBytes(address, 3)) {
      return makeInstruction(address, 3, `LD ${indexedRegisterName(indexName, dst)},${indexedMem(indexName, byteAt(address + 2))}`);
    }
    if (dst === 4 || dst === 5 || src === 4 || src === 5) {
      return makeInstruction(address, 2, `LD ${indexedRegisterName(indexName, dst)},${indexedRegisterName(indexName, src)}`);
    }
  }

  if (op >= 0x80 && op <= 0xbf) {
    const group = (op >> 3) & 0x07;
    const reg = op & 0x07;
    if (reg === 6 && hasBytes(address, 3)) {
      return makeInstruction(address, 3, `${alu[group]} ${indexedMem(indexName, byteAt(address + 2))}`);
    }
    if (reg === 4 || reg === 5) {
      return makeInstruction(address, 2, `${alu[group]} ${indexedRegisterName(indexName, reg)}`);
    }
  }

  switch (op) {
    case 0x21:
      if (hasBytes(address, 5)) return makeInstruction(address, 5, `LD ${indexName},${hex24(imm24(address + 2))}`);
      break;
    case 0x22:
      if (hasBytes(address, 5)) return makeInstruction(address, 5, `LD (${hex24(imm24(address + 2))}),${indexName}`);
      break;
    case 0x23:
      return makeInstruction(address, 2, `INC ${indexName}`);
    case 0x2a:
      if (hasBytes(address, 5)) return makeInstruction(address, 5, `LD ${indexName},(${hex24(imm24(address + 2))})`);
      break;
    case 0x2b:
      return makeInstruction(address, 2, `DEC ${indexName}`);
    case 0x34:
      if (hasBytes(address, 3)) return makeInstruction(address, 3, `INC ${indexedMem(indexName, byteAt(address + 2))}`);
      break;
    case 0x35:
      if (hasBytes(address, 3)) return makeInstruction(address, 3, `DEC ${indexedMem(indexName, byteAt(address + 2))}`);
      break;
    case 0x36:
      if (hasBytes(address, 4)) return makeInstruction(address, 4, `LD ${indexedMem(indexName, byteAt(address + 2))},${hex8(byteAt(address + 3))}`);
      break;
    case 0xe1:
      return makeInstruction(address, 2, `POP ${indexName}`);
    case 0xe3:
      return makeInstruction(address, 2, `EX (SP),${indexName}`);
    case 0xe5:
      return makeInstruction(address, 2, `PUSH ${indexName}`);
    case 0xe9:
      return makeInstruction(address, 2, `JP (${indexName})`);
    case 0xf9:
      return makeInstruction(address, 2, `LD SP,${indexName}`);
  }

  return dbInstruction(address, 2);
}

function decodeInstruction(address) {
  if (!hasBytes(address, 1)) {
    throw new RangeError(`ROM address ${hex24(address)} is outside ${rom.length} bytes`);
  }

  const op = byteAt(address);

  if (op === 0xcb) return decodeCB(address);
  if (op === 0xdd) return decodeIndexPrefix(address, 'IX');
  if (op === 0xed) return decodeED(address);
  if (op === 0xfd) return decodeIndexPrefix(address, 'IY');

  if ((op & 0xc7) === 0x06 && hasBytes(address, 2)) {
    return makeInstruction(address, 2, `LD ${r8[(op >> 3) & 0x07]},${hex8(byteAt(address + 1))}`);
  }

  if ((op & 0xcf) === 0x01 && hasBytes(address, 4)) {
    return makeInstruction(address, 4, `LD ${rp[(op >> 4) & 0x03]},${hex24(imm24(address + 1))}`);
  }

  if ((op & 0xc7) === 0x04) {
    return makeInstruction(address, 1, `INC ${r8[(op >> 3) & 0x07]}`);
  }

  if ((op & 0xc7) === 0x05) {
    return makeInstruction(address, 1, `DEC ${r8[(op >> 3) & 0x07]}`);
  }

  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) return makeInstruction(address, 1, 'HALT');
    return makeInstruction(address, 1, `LD ${r8[(op >> 3) & 0x07]},${r8[op & 0x07]}`);
  }

  if (op >= 0x80 && op <= 0xbf) {
    return makeInstruction(address, 1, `${alu[(op >> 3) & 0x07]} ${r8[op & 0x07]}`);
  }

  if ((op & 0xc7) === 0xc0) {
    return makeInstruction(address, 1, `RET ${cc[(op >> 3) & 0x07]}`, { flow: 'RET' });
  }

  if ((op & 0xc7) === 0xc2 && hasBytes(address, 4)) {
    const target = imm24(address + 1);
    return makeInstruction(address, 4, `JP ${cc[(op >> 3) & 0x07]},${hex24(target)}`, { flow: 'JP', target });
  }

  if ((op & 0xc7) === 0xc4 && hasBytes(address, 4)) {
    const target = imm24(address + 1);
    return makeInstruction(address, 4, `CALL ${cc[(op >> 3) & 0x07]},${hex24(target)}`, { flow: 'CALL', target });
  }

  if ((op & 0xcf) === 0xc1) {
    return makeInstruction(address, 1, `POP ${rp2[(op >> 4) & 0x03]}`);
  }

  if ((op & 0xcf) === 0xc5) {
    return makeInstruction(address, 1, `PUSH ${rp2[(op >> 4) & 0x03]}`);
  }

  if ((op & 0xc7) === 0xc7) {
    return makeInstruction(address, 1, `RST ${hex8(op & 0x38)}`);
  }

  switch (op) {
    case 0x00:
      return makeInstruction(address, 1, 'NOP');
    case 0x02:
      return makeInstruction(address, 1, 'LD (BC),A');
    case 0x03:
      return makeInstruction(address, 1, 'INC BC');
    case 0x07:
      return makeInstruction(address, 1, 'RLCA');
    case 0x08:
      return makeInstruction(address, 1, "EX AF,AF'");
    case 0x09:
      return makeInstruction(address, 1, 'ADD HL,BC');
    case 0x0a:
      return makeInstruction(address, 1, 'LD A,(BC)');
    case 0x0b:
      return makeInstruction(address, 1, 'DEC BC');
    case 0x0f:
      return makeInstruction(address, 1, 'RRCA');
    case 0x10: {
      if (!hasBytes(address, 2)) return dbInstruction(address);
      const target = relTarget(address);
      return makeInstruction(address, 2, `DJNZ ${hex24(target)}`, { flow: 'JR', target });
    }
    case 0x12:
      return makeInstruction(address, 1, 'LD (DE),A');
    case 0x13:
      return makeInstruction(address, 1, 'INC DE');
    case 0x17:
      return makeInstruction(address, 1, 'RLA');
    case 0x18: {
      if (!hasBytes(address, 2)) return dbInstruction(address);
      const target = relTarget(address);
      return makeInstruction(address, 2, `JR ${hex24(target)}`, { flow: 'JR', target });
    }
    case 0x19:
      return makeInstruction(address, 1, 'ADD HL,DE');
    case 0x1a:
      return makeInstruction(address, 1, 'LD A,(DE)');
    case 0x1b:
      return makeInstruction(address, 1, 'DEC DE');
    case 0x1f:
      return makeInstruction(address, 1, 'RRA');
    case 0x20:
    case 0x28:
    case 0x30:
    case 0x38: {
      if (!hasBytes(address, 2)) return dbInstruction(address);
      const cond = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' }[op];
      const target = relTarget(address);
      return makeInstruction(address, 2, `JR ${cond},${hex24(target)}`, { flow: 'JR', target, condition: cond });
    }
    case 0x22:
      if (hasBytes(address, 4)) return makeInstruction(address, 4, `LD (${hex24(imm24(address + 1))}),HL`);
      break;
    case 0x23:
      return makeInstruction(address, 1, 'INC HL');
    case 0x27:
      return makeInstruction(address, 1, 'DAA');
    case 0x29:
      return makeInstruction(address, 1, 'ADD HL,HL');
    case 0x2a:
      if (hasBytes(address, 4)) return makeInstruction(address, 4, `LD HL,(${hex24(imm24(address + 1))})`);
      break;
    case 0x2b:
      return makeInstruction(address, 1, 'DEC HL');
    case 0x2f:
      return makeInstruction(address, 1, 'CPL');
    case 0x32:
      if (hasBytes(address, 4)) return makeInstruction(address, 4, `LD (${hex24(imm24(address + 1))}),A`);
      break;
    case 0x33:
      return makeInstruction(address, 1, 'INC SP');
    case 0x34:
      return makeInstruction(address, 1, 'INC (HL)');
    case 0x35:
      return makeInstruction(address, 1, 'DEC (HL)');
    case 0x36:
      if (hasBytes(address, 2)) return makeInstruction(address, 2, `LD (HL),${hex8(byteAt(address + 1))}`);
      break;
    case 0x37:
      return makeInstruction(address, 1, 'SCF');
    case 0x39:
      return makeInstruction(address, 1, 'ADD HL,SP');
    case 0x3a:
      if (hasBytes(address, 4)) return makeInstruction(address, 4, `LD A,(${hex24(imm24(address + 1))})`);
      break;
    case 0x3b:
      return makeInstruction(address, 1, 'DEC SP');
    case 0x3f:
      return makeInstruction(address, 1, 'CCF');
    case 0xc3: {
      if (!hasBytes(address, 4)) return dbInstruction(address);
      const target = imm24(address + 1);
      return makeInstruction(address, 4, `JP ${hex24(target)}`, { flow: 'JP', target });
    }
    case 0xc6:
    case 0xce:
    case 0xd6:
    case 0xde:
    case 0xe6:
    case 0xee:
    case 0xf6:
    case 0xfe: {
      if (!hasBytes(address, 2)) return dbInstruction(address);
      const group = { 0xc6: 0, 0xce: 1, 0xd6: 2, 0xde: 3, 0xe6: 4, 0xee: 5, 0xf6: 6, 0xfe: 7 }[op];
      return makeInstruction(address, 2, `${alu[group]} ${hex8(byteAt(address + 1))}`);
    }
    case 0xc9:
      return makeInstruction(address, 1, 'RET', { flow: 'RET' });
    case 0xcd: {
      if (!hasBytes(address, 4)) return dbInstruction(address);
      const target = imm24(address + 1);
      return makeInstruction(address, 4, `CALL ${hex24(target)}`, { flow: 'CALL', target });
    }
    case 0xd3:
      if (hasBytes(address, 2)) return makeInstruction(address, 2, `OUT (${hex8(byteAt(address + 1))}),A`);
      break;
    case 0xdb:
      if (hasBytes(address, 2)) return makeInstruction(address, 2, `IN A,(${hex8(byteAt(address + 1))})`);
      break;
    case 0xe3:
      return makeInstruction(address, 1, 'EX (SP),HL');
    case 0xe9:
      return makeInstruction(address, 1, 'JP (HL)');
    case 0xeb:
      return makeInstruction(address, 1, 'EX DE,HL');
    case 0xf3:
      return makeInstruction(address, 1, 'DI');
    case 0xf9:
      return makeInstruction(address, 1, 'LD SP,HL');
    case 0xfb:
      return makeInstruction(address, 1, 'EI');
  }

  return dbInstruction(address);
}

function disassembleRange(start, end) {
  const instructions = [];
  let pc = start;
  while (pc <= end && pc < rom.length) {
    const instruction = decodeInstruction(pc);
    instructions.push(instruction);
    pc += instruction.length;
  }
  return instructions;
}

function formatInstruction(instruction, windowStart, windowEnd) {
  const bytes = instruction.bytes.map(hex8).join(' ').padEnd(18, ' ');
  const note = instruction.target !== undefined
    ? ` ; target ${hex24(instruction.target)} ${targetScope(instruction.target, windowStart, windowEnd)}`
    : '';
  return `${hex24(instruction.address)}: ${bytes} ${instruction.mnemonic}${note}`;
}

function printWindow(title, start, end) {
  console.log(`\n== ${title} ${hex24(start)}-${hex24(end)} ==`);
  const instructions = disassembleRange(start, end);
  for (const instruction of instructions) {
    console.log(formatInstruction(instruction, start, end));
  }
  return instructions;
}

function findOrJrNzPairs(instructions) {
  const pairs = [];
  for (let i = 0; i < instructions.length - 1; i += 1) {
    const current = instructions[i];
    const next = instructions[i + 1];
    if (current.bytes[0] === 0xb7 && next.bytes[0] === 0x20) {
      pairs.push({ orInstruction: current, jrInstruction: next });
    }
  }
  return pairs;
}

function choosePostLoopPair(instructions, pairs) {
  if (pairs.length === 0) return null;

  const djnzAddresses = instructions
    .filter((instruction) => instruction.bytes[0] === 0x10)
    .map((instruction) => instruction.address);

  return pairs.find((pair) => (
    djnzAddresses.some((address) => (
      address < pair.orInstruction.address && pair.orInstruction.address - address <= 0x20
    ))
  )) ?? pairs[0];
}

function printOrJrNzSummary(instructions) {
  const pairs = findOrJrNzPairs(instructions);
  const postLoopPair = choosePostLoopPair(instructions, pairs);

  console.log('\n== OR A -> JR NZ key-found branch ==');
  if (pairs.length === 0) {
    console.log('No OR A followed by JR NZ was found in the main disassembly window.');
    return null;
  }

  for (const pair of pairs) {
    console.log(
      `${hex24(pair.orInstruction.address)} OR A; ` +
      `${hex24(pair.jrInstruction.address)} JR NZ -> ${hex24(pair.jrInstruction.target)}`,
    );
  }

  if (postLoopPair) {
    console.log(`Selected post-loop target: ${hex24(postLoopPair.jrInstruction.target)}`);
  }

  return postLoopPair;
}

function collectCalls(...instructionSets) {
  return instructionSets
    .flat()
    .filter((instruction) => instruction.flow === 'CALL')
    .sort((a, b) => a.address - b.address);
}

function printWatchedCalls(calls) {
  console.log('\n== Watched CALL targets ==');

  for (const [target, label] of watchedCalls.entries()) {
    const matches = calls.filter((call) => call.target === target);
    if (matches.length === 0) {
      console.log(`${hex24(target)} (${label}): not seen in decoded windows`);
      continue;
    }

    const locations = matches.map((call) => hex24(call.address)).join(', ');
    console.log(`${hex24(target)} (${label}): called at ${locations}`);
  }

  const uniqueExternalCalls = [...new Set(calls.map((call) => call.target))]
    .filter((target) => target < MAIN_START || target > MAIN_END)
    .sort((a, b) => a - b);

  if (uniqueExternalCalls.length > 0) {
    console.log('\nExternal CALL targets observed:');
    for (const target of uniqueExternalCalls) {
      const labels = watchedCalls.has(target) ? ` (${watchedCalls.get(target)})` : '';
      console.log(`- ${hex24(target)}${labels}`);
    }
  }
}

console.log(`ROM: ${romPath}`);
console.log(`Size: ${rom.length} bytes`);

const mainInstructions = printWindow('0x003A0F caller window', MAIN_START, MAIN_END);
const pair = printOrJrNzSummary(mainInstructions);

let targetInstructions = [];
if (pair?.jrInstruction?.target !== undefined) {
  const target = pair.jrInstruction.target;
  if (target < rom.length) {
    targetInstructions = printWindow(
      'JR NZ target code',
      target,
      Math.min(target + TARGET_BYTES - 1, rom.length - 1),
    );
  } else {
    console.log(`\nJR NZ target ${hex24(target)} is outside the ROM image.`);
  }
}

const pollInstructions = printWindow('0x003D5A polling function cross-reference', POLL_START, POLL_END);
printWatchedCalls(collectCalls(mainInstructions, targetInstructions, pollInstructions));

