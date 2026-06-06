import fs from 'fs';

const rom = fs.readFileSync('./TI-84_Plus_CE/ROM.rom');

const START = 0x07F7FA;
const END = 0x07F920;

const opRegisters = new Map([
  [0xD005F8, 'OP1'],
  [0xD00603, 'OP2'],
  [0xD0060E, 'OP3'],
  [0xD00619, 'OP4'],
  [0xD00624, 'OP5'],
  [0xD0062F, 'OP6'],
]);

const knownTargets = new Map([
  [0x07F8C0, 'OP copy'],
  [0x07F914, 'OP copy dispatch entry'],
  [0x07F920, 'OP register copy dispatch table'],
  [0x07F968, 'shared copy target'],
  [0x07F96C, 'shared DE/copy target'],
  [0x07F974, 'shared LDI chain'],
  [0x07F97A, 'shared LDI chain'],
  [0x07FE28, 'type transform wrapper'],
  [0x07FE5A, 'forward type transform'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function targetLabel(addr) {
  const known = knownTargets.get(addr);
  const op = opRegisters.get(addr);
  if (known) return `${hex(addr)} ${known}`;
  if (op) return `${hex(addr)} ${op}`;
  return hex(addr);
}

function decodeAt(pc) {
  const op = rom[pc];
  switch (op) {
    case 0x00:
      return { size: 1, text: 'NOP' };
    case 0x11: {
      const imm = read24(pc + 1);
      return {
        size: 4,
        text: `LD DE,${targetLabel(imm)}`,
        opRef: opRegisters.get(imm),
      };
    }
    case 0x18: {
      const rel = signed8(rom[pc + 1]);
      const target = pc + 2 + rel;
      return {
        size: 2,
        text: `JR ${rel >= 0 ? '+' : ''}${rel} ; ${hex(target)}`,
        branchTarget: target,
        terminates: true,
      };
    }
    case 0x21: {
      const imm = read24(pc + 1);
      return {
        size: 4,
        text: `LD HL,${targetLabel(imm)}`,
        opRef: opRegisters.get(imm),
      };
    }
    case 0xC1:
      return { size: 1, text: 'POP BC' };
    case 0xC3: {
      const target = read24(pc + 1);
      return {
        size: 4,
        text: `JP ${targetLabel(target)}`,
        jumpTarget: target,
        terminates: true,
      };
    }
    case 0xC5:
      return { size: 1, text: 'PUSH BC' };
    case 0xC9:
      return { size: 1, text: 'RET', terminates: true };
    case 0xCD: {
      const target = read24(pc + 1);
      return {
        size: 4,
        text: `CALL ${targetLabel(target)}`,
        callTarget: target,
      };
    }
    case 0xD1:
      return { size: 1, text: 'POP DE' };
    case 0xD5:
      return { size: 1, text: 'PUSH DE' };
    case 0xE1:
      return { size: 1, text: 'POP HL' };
    case 0xE5:
      return { size: 1, text: 'PUSH HL' };
    case 0xF1:
      return { size: 1, text: 'POP AF' };
    case 0xF5:
      return { size: 1, text: 'PUSH AF' };
    default:
      return { size: 1, text: `DB $${byteHex(op)}`, unknown: true };
  }
}

function collectStub(entry) {
  const instructions = [];
  const calls = [];
  const opRefs = [];
  let pc = entry;

  while (pc < END) {
    const decoded = decodeAt(pc);
    instructions.push({ addr: pc, ...decoded });

    if (decoded.callTarget !== undefined) calls.push(decoded.callTarget);
    if (decoded.opRef) opRefs.push(decoded.opRef);

    pc += decoded.size;
    if (decoded.terminates) break;
  }

  return {
    entry,
    end: pc,
    size: pc - entry,
    instructions,
    calls: [...new Set(calls)],
    opRefs: [...new Set(opRefs)],
  };
}

function classifyStub(stub) {
  const callSet = new Set(stub.calls);
  const hasTypeTransform = callSet.has(0x07FE5A) || callSet.has(0x07FE28);
  const hasCopyDispatch =
    callSet.has(0x07F914) ||
    callSet.has(0x07F920) ||
    callSet.has(0x07F8C0) ||
    callSet.has(0x07F968) ||
    callSet.has(0x07F96C) ||
    callSet.has(0x07F974) ||
    callSet.has(0x07F97A);

  if (hasTypeTransform && hasCopyDispatch) return 'combined OP copy/type transform';
  if (hasTypeTransform) return 'type transform';
  if (hasCopyDispatch || stub.opRefs.length > 0) return 'OP copy/dispatch';
  return 'unknown/control stub';
}

function findEntries() {
  const entries = new Set([START]);

  for (let pc = START; pc < END; ) {
    const decoded = decodeAt(pc);

    if (decoded.terminates && pc + decoded.size < END) {
      entries.add(pc + decoded.size);
    }

    if (
      decoded.branchTarget !== undefined &&
      decoded.branchTarget >= START &&
      decoded.branchTarget < END
    ) {
      entries.add(decoded.branchTarget);
    }

    pc += decoded.size;
  }

  return [...entries].sort((a, b) => a - b);
}

function xrefScan(target, label) {
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;
  const refs = [];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === b0 && rom[i + 1] === b1 && rom[i + 2] === b2) {
      const opcode = i > 0 ? rom[i - 1] : undefined;
      if (opcode === 0xCD || opcode === 0xC3) {
        refs.push({ at: i - 1, opcode });
      }
    }
  }

  console.log(`${label}: ${refs.length} xrefs`);
  for (const ref of refs) {
    console.log(`  ${hex(ref.at)} ${ref.opcode === 0xCD ? 'CALL' : 'JP'}`);
  }
}

console.log('=== HEX DUMP 0x07F7FA-0x07F920 ===');
for (let addr = START; addr < END; addr += 16) {
  const bytes = [];
  for (let i = 0; i < 16 && addr + i < END; i++) {
    bytes.push(byteHex(rom[addr + i]));
  }
  console.log(`${addr.toString(16).padStart(6, '0')}: ${bytes.join(' ')}`);
}

console.log('\n=== LINEAR DISASSEMBLY ===');
for (let pc = START; pc < END; ) {
  const decoded = decodeAt(pc);
  const bytes = [];
  for (let i = 0; i < decoded.size; i++) bytes.push(byteHex(rom[pc + i]));
  console.log(
    `${hex(pc)}  ${bytes.join(' ').padEnd(11)} ${decoded.text}`,
  );
  pc += decoded.size;
}

const stubs = findEntries().map(collectStub);

console.log('\n=== STUB TABLE ===');
console.log('addr      size  purpose                         CALL targets                 OP refs');
for (const stub of stubs) {
  const purpose = classifyStub(stub);
  const calls = stub.calls.map((addr) => hex(addr)).join(', ') || '-';
  const opRefs = stub.opRefs.join(', ') || '-';
  console.log(
    `${hex(stub.entry).padEnd(9)} ${String(stub.size).padStart(4)}  ${purpose.padEnd(31)} ${calls.padEnd(28)} ${opRefs}`,
  );
}

console.log('\n=== STUB DETAILS ===');
for (const stub of stubs) {
  console.log(
    `${hex(stub.entry)}-${hex(stub.end)} (${stub.size} bytes): ${classifyStub(stub)}`,
  );
  for (const ins of stub.instructions) {
    console.log(`  ${hex(ins.addr)} ${ins.text}`);
  }
}

console.log('\n=== XREF COUNTS ===');
xrefScan(0x07F806, '0x07F806 shared transform');
xrefScan(0x07F813, '0x07F813');
xrefScan(0x07F7FA, '0x07F7FA OP1 entry');
xrefScan(0x07F802, '0x07F802 OP2 entry');

console.log('\n=== DISCOVERED TARGET XREFS ===');
for (const target of [...new Set(stubs.flatMap((stub) => stub.calls))].sort((a, b) => a - b)) {
  xrefScan(target, `${hex(target)} ${knownTargets.get(target) ?? ''}`.trim());
}
