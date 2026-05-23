#!/usr/bin/env node

import fs from 'node:fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x0123AD;
const TARGET_CALL = [0xCD, 0xAD, 0x23, 0x01];
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const CALL_LABELS = new Map([
  [0x00218A, 'stack-frame helper'],
  [0x0021C2, 'HL null-check helper'],
  [0x014E3F, 'notification state installer'],
]);

const RAM_LABELS = new Map([
  [0xD1440E, 'notification lock byte'],
  [0xD1440F, 'notification delivery status'],
  [0xD177B7, 'notification-installed sentinel (0x55 while armed)'],
]);

const PORT_LABELS = new Map([
  [0x3010, 'global USB/link control port'],
]);

const CALLER_LABELS = new Map([
  [0x009987, '0x0098D2 connect/recovery path'],
  [0x012502, '0x012456 host-to-device OTG transition'],
]);

const BRANCH_NOTES = new Map([
  [0x0123CD, 'arg == 0 skips the installer/poll path'],
  [0x0123E0, 'bit 1 clear drops to the success path that clears D1440E'],
  [0x0123E7, 'nonzero D1440F aborts the poll loop and returns A=0'],
  [0x0123EF, 'while D177B7 == 0x55, loop back and poll 0x3010 again'],
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
    case 0x07:
      return {
        pc: addr,
        length: 3,
        text: `LD BC,(IX${formatDisp(disp)})`,
        kind: 'ld-bc-ixd',
      };
    case 0x27:
      return {
        pc: addr,
        length: 3,
        text: `LD HL,(IX${formatDisp(disp)})`,
        kind: 'ld-hl-ixd',
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
    case 0xC5:
      return { pc: addr, length: prefixBytes + 1, text: 'PUSH BC', kind: 'push-bc' };
    case 0xC9:
      return { pc: addr, length: prefixBytes + 1, text: 'RET', kind: 'ret' };
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

  if (inst.kind === 'jr-cond') {
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

  if (pc === 0x0123B7) {
    comments.push('sets bit 1 before the optional installer path');
  }

  if (pc === 0x0123D3) {
    comments.push('only reached when the stacked argument is nonzero');
  }

  if (pc === 0x0123F5) {
    comments.push('clears the notification lock on the bit1-clear exit path');
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
    case 'ld-bc-ixd':
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
lines.push('# Phase 421 Probe: Static Trace of 0x0123AD', '');
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
lines.push('Direct caller sites to 0x0123AD:');
for (const caller of directCallers) {
  const argText = caller.immediateArg == null ? 'dynamic argument' : `pushes ${hex(caller.immediateArg)}`;
  lines.push(`- ${hex(caller.pc)} ${argText}${caller.label ? ` (${caller.label})` : ''}`);
}
lines.push('');
lines.push('Assessment:');
lines.push('- No direct 0x31xx writes appear in 0x0123AD. Every direct I/O access uses port 0x3010.');
lines.push('- Both session-420 callers (`0x009987` and `0x012502`) push `0x000000`, so they take the short path that skips `CALL 0x014E3F`.');
lines.push('- The nonzero callers in ROM all push `0x000032`, which reaches `CALL 0x014E3F` and then polls `0x3010 bit1`, `D1440F`, and `D177B7`.');
lines.push('- That makes 0x0123AD a two-mode controller/notification helper, not a direct USB endpoint register programmer.');

console.log(lines.join('\n'));
