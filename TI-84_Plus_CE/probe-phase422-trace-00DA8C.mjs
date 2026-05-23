#!/usr/bin/env node

import fs from 'node:fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x00DA8C;
const TARGET_CALL = [0xCD, 0x8C, 0xDA, 0x00];
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const CALL_LABELS = new Map([
  [0x00218A, 'stack-frame helper'],
  [0x00DB66, 'bit5 helper: toggle 0x3010 bit5, poll 0x3015 bit7'],
  [0x00DC0E, 'bit4 helper: toggle 0x3010 bit4, poll 0x3015 bit6'],
  [0x014E3F, 'notification state installer'],
]);

const RAM_LABELS = new Map([
  [0xD1440E, 'notification lock byte'],
  [0xD1440F, 'notification delivery status'],
  [0xD177B7, 'USB/link initialized sentinel (0x55 while armed)'],
]);

const PORT_LABELS = new Map([
  [0x3010, 'global USB/link control port'],
]);

const CALLER_LABELS = new Map([
  [0x0095AA, '0x0094C0 bit2 RX-ready disconnect path'],
]);

const BRANCH_NOTES = new Map([
  [0x00DA95, 'arg 1 takes the assert/arm path; all other args fall into the zero-only disconnect path'],
  [0x00DA9F, 'if 0x3010 bit0 is already set, arg 1 returns without touching state'],
  [0x00DACA, 'after setting bit0, success is when the poll sees bit0 high'],
  [0x00DAD1, 'nonzero D1440F aborts the arg-1 wait loop'],
  [0x00DADB, 'while D177B7 == 0x55 and D1440F == 0, keep polling 0x3010 bit0'],
  [0x00DAEC, 'any nonzero arg other than 1 returns immediately'],
  [0x00DAF6, 'if 0x3010 bit0 is already clear, arg 0 returns without cleanup'],
  [0x00DB00, 'if bit5 is still set, clear it through 0x00DB66 before dropping bit0'],
  [0x00DB15, 'if bit4 is still set, clear it through 0x00DC0E before dropping bit0'],
  [0x00DB49, 'after clearing bit0, success is when the poll sees bit0 low'],
  [0x00DB50, 'nonzero D1440F aborts the arg-0 wait loop'],
  [0x00DB58, 'while D177B7 == 0x55 and D1440F == 0, keep polling 0x3010 bit0'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function isRam(addr) {
  return addr >= RAM_MIN && addr <= RAM_MAX;
}

function supportsSis(op) {
  return op === 0x01;
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function formatDisp(byte) {
  const value = signedByte(byte);
  const magnitude = hex(Math.abs(value), 2);
  return value >= 0 ? `+${magnitude}` : `-${magnitude}`;
}

function decodeCB(addr) {
  const op = rom[addr + 1] ?? 0;
  const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
  const group = op >> 6;
  const bit = (op >> 3) & 7;

  if (group === 1) {
    return { pc: addr, length: 2, text: `BIT ${bit},${reg}`, kind: 'bit' };
  }

  if (group === 2) {
    return { pc: addr, length: 2, text: `RES ${bit},${reg}`, kind: 'bit' };
  }

  if (group === 3) {
    return { pc: addr, length: 2, text: `SET ${bit},${reg}`, kind: 'bit' };
  }

  return { pc: addr, length: 2, text: `CB ${hexByte(op)}`, kind: 'unknown' };
}

function decodeDD(addr) {
  const op = rom[addr + 1] ?? 0;
  const disp = rom[addr + 2] ?? 0;

  switch (op) {
    case 0x4E:
      return {
        pc: addr,
        length: 3,
        text: `LD C,(IX${formatDisp(disp)})`,
        kind: 'ld-c-ixd',
      };
    case 0x7E:
      return {
        pc: addr,
        length: 3,
        text: `LD A,(IX${formatDisp(disp)})`,
        kind: 'ld-a-ixd',
      };
    case 0xE1:
      return { pc: addr, length: 2, text: 'POP IX', kind: 'pop-ix' };
    case 0xF9:
      return { pc: addr, length: 2, text: 'LD SP,IX', kind: 'ld-sp-ix' };
    default:
      return {
        pc: addr,
        length: 2,
        text: `DD ${hexByte(op)}`,
        kind: 'unknown',
      };
  }
}

function decodeED(addr) {
  const op = rom[addr + 1] ?? 0;

  switch (op) {
    case 0x78:
      return { pc: addr, length: 2, text: 'IN A,(C)', kind: 'in-a-c' };
    case 0x79:
      return { pc: addr, length: 2, text: 'OUT (C),A', kind: 'out-c-a' };
    default:
      return {
        pc: addr,
        length: 2,
        text: `ED ${hexByte(op)}`,
        kind: 'unknown',
      };
  }
}

function decode(addr) {
  let prefix = null;
  let pc = addr;

  if (rom[pc] === 0x40 && supportsSis(rom[pc + 1])) {
    prefix = 'sis';
    pc += 1;
  }

  const op = rom[pc] ?? 0;
  const prefixBytes = pc - addr;
  const immWidth = prefix === 'sis' ? 2 : 3;
  const prefixText = prefix === 'sis' ? '.SIS ' : '';

  switch (op) {
    case 0x01: {
      const value = immWidth === 2 ? read16(pc + 1) : read24(pc + 1);
      return {
        pc: addr,
        length: prefixBytes + 1 + immWidth,
        text: `${prefixText}LD BC,${hex(value, immWidth === 2 ? 4 : 6)}`,
        kind: 'ld-bc-imm',
        bcValue: value,
      };
    }
    case 0x06:
      return {
        pc: addr,
        length: prefixBytes + 2,
        text: `LD B,${hex(rom[pc + 1] ?? 0, 2)}`,
        kind: 'ld-b-imm',
      };
    case 0x18: {
      const length = prefixBytes + 2;
      const target = addr + length + signedByte(rom[pc + 1] ?? 0);
      return {
        pc: addr,
        length,
        text: `JR ${hex(target)}`,
        kind: 'jr',
        target,
      };
    }
    case 0x20:
    case 0x28:
    case 0x30:
    case 0x38: {
      const condition = new Map([
        [0x20, 'NZ'],
        [0x28, 'Z'],
        [0x30, 'NC'],
        [0x38, 'C'],
      ]).get(op);
      const length = prefixBytes + 2;
      const target = addr + length + signedByte(rom[pc + 1] ?? 0);
      return {
        pc: addr,
        length,
        text: `JR ${condition},${hex(target)}`,
        kind: 'jr-cond',
        condition,
        target,
      };
    }
    case 0x32: {
      const target = read24(pc + 1);
      return {
        pc: addr,
        length: prefixBytes + 4,
        text: `LD (${hex(target)}),A`,
        kind: 'ram-write-a',
        addr: target,
      };
    }
    case 0x3A: {
      const target = read24(pc + 1);
      return {
        pc: addr,
        length: prefixBytes + 4,
        text: `LD A,(${hex(target)})`,
        kind: 'ram-read-a',
        addr: target,
      };
    }
    case 0x3E:
      return {
        pc: addr,
        length: prefixBytes + 2,
        text: `LD A,${hex(rom[pc + 1] ?? 0, 2)}`,
        kind: 'ld-a-imm',
      };
    case 0x78:
      return { pc: addr, length: prefixBytes + 1, text: 'LD A,B', kind: 'ld-a-b' };
    case 0x79:
      return { pc: addr, length: prefixBytes + 1, text: 'LD A,C', kind: 'ld-a-c' };
    case 0xAF:
      return { pc: addr, length: prefixBytes + 1, text: 'XOR A', kind: 'xor-a' };
    case 0xB7:
      return { pc: addr, length: prefixBytes + 1, text: 'OR A', kind: 'or-a' };
    case 0xC1:
      return { pc: addr, length: prefixBytes + 1, text: 'POP BC', kind: 'pop-bc' };
    case 0xC2: {
      const target = read24(pc + 1);
      return {
        pc: addr,
        length: prefixBytes + 4,
        text: `JP NZ,${hex(target)}`,
        kind: 'jp-cond',
        condition: 'NZ',
        target,
      };
    }
    case 0xC3: {
      const target = read24(pc + 1);
      return {
        pc: addr,
        length: prefixBytes + 4,
        text: `JP ${hex(target)}`,
        kind: 'jp',
        target,
      };
    }
    case 0xC5:
      return { pc: addr, length: prefixBytes + 1, text: 'PUSH BC', kind: 'push-bc' };
    case 0xC9:
      return { pc: addr, length: prefixBytes + 1, text: 'RET', kind: 'ret' };
    case 0xCA: {
      const target = read24(pc + 1);
      return {
        pc: addr,
        length: prefixBytes + 4,
        text: `JP Z,${hex(target)}`,
        kind: 'jp-cond',
        condition: 'Z',
        target,
      };
    }
    case 0xCD: {
      const target = read24(pc + 1);
      return {
        pc: addr,
        length: prefixBytes + 4,
        text: `CALL ${hex(target)}`,
        kind: 'call',
        target,
      };
    }
    case 0xCF:
      return { pc: addr, length: prefixBytes + 1, text: 'RST 0x08', kind: 'rst' };
    case 0xDD:
      return decodeDD(addr);
    case 0xE6:
      return {
        pc: addr,
        length: prefixBytes + 2,
        text: `AND ${hex(rom[pc + 1] ?? 0, 2)}`,
        kind: 'and-imm',
      };
    case 0xED:
      return decodeED(addr);
    case 0xFE:
      return {
        pc: addr,
        length: prefixBytes + 2,
        text: `CP ${hex(rom[pc + 1] ?? 0, 2)}`,
        kind: 'cp-imm',
      };
    case 0xCB:
      return decodeCB(addr);
    default:
      return {
        pc: addr,
        length: prefixBytes + 1,
        text: `${prefixText}DB ${hexByte(op)}`,
        kind: 'unknown',
      };
  }
}

function scanDirectCallers() {
  const callers = [];

  for (let pc = 0; pc <= rom.length - TARGET_CALL.length; pc++) {
    let matched = true;

    for (let i = 0; i < TARGET_CALL.length; i++) {
      if (rom[pc + i] !== TARGET_CALL[i]) {
        matched = false;
        break;
      }
    }

    if (!matched) {
      continue;
    }

    let immediateArg = null;
    if (pc >= 5 && rom[pc - 5] === 0x01 && rom[pc - 1] === 0xC5) {
      immediateArg = read24(pc - 4);
    }

    callers.push({
      pc,
      immediateArg,
      label: CALLER_LABELS.get(pc) ?? null,
    });
  }

  return callers;
}

function describeArg(value) {
  if (value === 0x000000) {
    return 'disconnect/deassert mode';
  }

  if (value === 0x000001) {
    return 'assert/arm mode';
  }

  return 'unclassified mode';
}

const state = {
  bc: null,
  bcStack: [],
};

const disassembly = [];
const portAccesses = [];
const ramReads = [];
const ramWrites = [];
const branches = [];
const callSites = [];

let endPc = START;

for (let pc = START; ; ) {
  const inst = decode(pc);
  const comments = [];

  if (inst.kind === 'in-a-c' || inst.kind === 'out-c-a') {
    const port = typeof state.bc === 'number' ? (state.bc & 0xFFFF) : null;
    const direction = inst.kind === 'in-a-c' ? 'read' : 'write';
    const label = port == null ? '' : PORT_LABELS.get(port) ?? '';
    portAccesses.push({ pc, port, direction, text: inst.text });
    if (port != null) {
      comments.push(`port ${hex(port, 4)}${label ? ` (${label})` : ''} ${direction}`);
    } else {
      comments.push(`port ${direction} with BC unknown`);
    }
  }

  if (inst.kind === 'ram-read-a' && isRam(inst.addr)) {
    ramReads.push({ pc, addr: inst.addr, text: inst.text });
    const label = RAM_LABELS.get(inst.addr);
    comments.push(`RAM read ${hex(inst.addr)}${label ? ` (${label})` : ''}`);
  }

  if (inst.kind === 'ram-write-a' && isRam(inst.addr)) {
    ramWrites.push({ pc, addr: inst.addr, text: inst.text });
    const label = RAM_LABELS.get(inst.addr);
    comments.push(`RAM write ${hex(inst.addr)}${label ? ` (${label})` : ''}`);
  }

  if (inst.kind === 'call') {
    callSites.push({ pc, target: inst.target });
    const label = CALL_LABELS.get(inst.target);
    if (label) {
      comments.push(label);
    }
  }

  if (inst.kind === 'jr-cond' || inst.kind === 'jp-cond') {
    branches.push({
      pc,
      text: inst.text,
      target: inst.target,
      note: BRANCH_NOTES.get(pc) ?? null,
    });
    if (BRANCH_NOTES.has(pc)) {
      comments.push(BRANCH_NOTES.get(pc));
    }
  }

  if (pc === 0x00DAA9) {
    comments.push('arg 1 sets 0x3010 bit0 before installing notification state');
  }

  if (pc === 0x00DAE2 || pc === 0x00DB5D) {
    comments.push('success path clears the notification lock');
  }

  if (pc === 0x00DB07) {
    comments.push('arg 0 uses helper 0x00DB66 only when 0x3010 bit5 is still high');
  }

  if (pc === 0x00DB1C) {
    comments.push('arg 0 uses helper 0x00DC0E only when 0x3010 bit4 is still high');
  }

  if (pc === 0x00DB28) {
    comments.push('arg 0 clears the primary 0x3010 bit0 line before the final poll');
  }

  disassembly.push({
    pc,
    length: inst.length,
    bytes: formatBytes(pc, inst.length),
    text: inst.text,
    comments,
  });

  switch (inst.kind) {
    case 'ld-bc-imm':
      state.bc = inst.bcValue;
      break;
    case 'ld-b-imm':
    case 'ld-c-ixd':
    case 'ld-a-ixd':
      state.bc = null;
      break;
    case 'push-bc':
      state.bcStack.push(state.bc);
      break;
    case 'pop-bc':
      state.bc = state.bcStack.length ? state.bcStack.pop() : null;
      break;
    default:
      break;
  }

  endPc = pc + inst.length - 1;
  if (inst.kind === 'ret') {
    break;
  }

  pc += inst.length;
}

const directCallers = scanDirectCallers();
const uniqueCallTargets = [...new Set(callSites.map((site) => site.target))].sort((a, b) => a - b);

const lines = [];
lines.push('# Phase 422 Probe: Static Trace of 0x00DA8C', '');
lines.push(`Function span: ${hex(START)}..${hex(endPc)} (${endPc - START + 1} bytes, ${disassembly.length} decoded instructions)`);
lines.push('');
lines.push('Disassembly:');
for (const row of disassembly) {
  lines.push(
    `${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')} ${row.text.padEnd(26, ' ')}${row.comments.length ? ` ; ${row.comments.join(' | ')}` : ''}`
  );
}
lines.push('');
lines.push('Port accesses:');
if (!portAccesses.length) {
  lines.push('- none');
} else {
  for (const access of portAccesses) {
    const portText = access.port == null ? 'BC unknown' : `${hex(access.port, 4)}${PORT_LABELS.has(access.port) ? ` (${PORT_LABELS.get(access.port)})` : ''}`;
    lines.push(`- ${hex(access.pc)} ${access.text} -> ${portText} [${access.direction}]`);
  }
}
lines.push('');
lines.push('RAM reads (D00000-D1FFFF only):');
if (!ramReads.length) {
  lines.push('- none');
} else {
  for (const entry of ramReads) {
    lines.push(`- ${hex(entry.pc)} ${hex(entry.addr)}${RAM_LABELS.has(entry.addr) ? ` (${RAM_LABELS.get(entry.addr)})` : ''}`);
  }
}
lines.push('');
lines.push('RAM writes (D00000-D1FFFF only):');
if (!ramWrites.length) {
  lines.push('- none');
} else {
  for (const entry of ramWrites) {
    lines.push(`- ${hex(entry.pc)} ${hex(entry.addr)}${RAM_LABELS.has(entry.addr) ? ` (${RAM_LABELS.get(entry.addr)})` : ''}`);
  }
}
lines.push('');
lines.push('CALL targets:');
for (const target of uniqueCallTargets) {
  const sites = callSites.filter((site) => site.target === target).map((site) => hex(site.pc)).join(', ');
  lines.push(`- ${hex(target)}${CALL_LABELS.has(target) ? ` (${CALL_LABELS.get(target)})` : ''} <- ${sites}`);
}
lines.push('');
lines.push('Conditional branches:');
for (const branch of branches) {
  lines.push(`- ${hex(branch.pc)} ${branch.text}${branch.note ? ` — ${branch.note}` : ''}`);
}
lines.push('');
lines.push('Direct caller sites to 0x00DA8C:');
for (const caller of directCallers) {
  const argText = caller.immediateArg == null
    ? 'dynamic argument'
    : `pushes ${hex(caller.immediateArg)} (${describeArg(caller.immediateArg)})`;
  lines.push(`- ${hex(caller.pc)} ${argText}${caller.label ? ` (${caller.label})` : ''}`);
}
lines.push('');
lines.push('Assessment:');
lines.push('- Argument 0 is the session-420 disconnect path: it optionally clears 0x3010 bits 5 and 4 through 0x00DB66/0x00DC0E, then clears 0x3010 bit0 and waits for the hardware view to match.');
lines.push('- Argument 1 is the mirror assert/arm path: it sets 0x3010 bit0, calls the same notification installer, and waits for bit0 to read back high.');
lines.push('- Direct RAM effects are narrow: 0x00DA8C itself only polls D1440F/D177B7 and clears D1440E on success. The notification payload install lives in 0x014E3F.');
lines.push('- Every immediate caller found in ROM pushes only 0x000000 or 0x000001, so the routine is a strict two-mode USB/link control helper rather than a wider dispatcher.');

console.log(lines.join('\n'));
