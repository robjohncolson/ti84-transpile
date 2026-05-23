#!/usr/bin/env node

import fs from 'node:fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x00E4E8;
const TARGET_CALL = [0xCD, 0xE8, 0xE4, 0x00];

const CALL_LABELS = new Map([
  [0x002197, 'stack-frame helper (-10-byte local frame)'],
  [0x0021C2, '24-bit zero-compare helper'],
  [0x0022F9, 'left-shift helper (HL <<= A)'],
]);

const RAM_LABELS = new Map([
  [0xD141EC, 'shared transfer/source byte-stream base'],
  [0xD141ED, 'shared transfer/source byte-stream first byte'],
]);

const IY_FIELD_LABELS = new Map([
  [0x18, 'IY+24 pending tag/status byte'],
  [0x19, 'IY+25 mode byte (low 2 bits tested)'],
  [0x1A, 'IY+26 low data byte'],
  [0x1B, 'IY+27 high data byte (bit 7 stripped)'],
]);

const CALLER_LABELS = new Map([
  [0x00E882, 'sibling staging helper at 0x00E87D'],
  [0x00FF75, '0x00FE10 common tail'],
]);

const BRANCH_NOTES = new Map([
  [0x00E517, 'if the staged word is nonzero, go straight to the 0x03FF-complement path'],
  [0x00E520, 'compiler-emitted second zero-check; in practice the zero path falls through to the mode test'],
  [0x00E537, 'mode != 1 skips the 0x03FF-complement path when the staged word is zero'],
  [0x00E56F, 'nonzero D141ED clears the byte and forces HL=0'],
]);

const MANUAL_COMMENTS = new Map([
  [0x00E4F3, ['read the high byte from IY+27 and strip its bit-7 flag']],
  [0x00E4FF, ['shift the masked high byte left by 8 bits']],
  [0x00E503, ['read the low byte from IY+26']],
  [0x00E50D, ['store the combined word into work[-3]']],
  [0x00E522, ['when the staged word is zero, (IY+25 & 3) decides whether 0 stays 0 or becomes 0x03FF']],
  [0x00E539, ['fieldWord = 0x03FF - fieldWord']],
  [0x00E546, ['follow work[+6] to the first nested output record']],
  [0x00E549, ['copy IY+24 into nested[-7]']],
  [0x00E552, ['clear IY+24 after exporting it']],
  [0x00E556, ['seed the second nested record with the shared D141EC stream base']],
  [0x00E560, ['mirror the D141EC pointer into a second slot']],
  [0x00E566, ['advance the working stream pointer to D141ED']],
  [0x00E571, ['if D141ED is already zero, return the staged field word']],
  [0x00E579, ['if D141ED is nonzero, clear it and return HL=0']],
]);

const RESOLVED_ACCESS_NOTES = [
  'work = *(frame+6) loaded by `LD IX,(IX+6)` at 0x00E4F0',
  'stagedWord lives at `work[-3]` (written at 0x00E50D; read again at 0x00E510, 0x00E519, 0x00E53C, and 0x00E571)',
  'first nested record = `*(work+6)` (loaded at 0x00E546); `nested[-7]` receives the old IY+24 byte at 0x00E54C',
  'second nested record = `*(firstNested+6)` (loaded at 0x00E54F); `secondNested[-6]` and `secondNested[-10]` are seeded with `0xD141EC`',
  'the pointer in `secondNested[-6]` is incremented to `0xD141ED` before the read at 0x00E56D',
  'if `D141ED` is nonzero, 0x00E579 clears `D141ED` and the function returns HL=0',
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
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
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const reg = regs[op & 7];
  const group = op >> 6;
  const bit = (op >> 3) & 7;

  if (group === 1) {
    return { pc: addr, length: 2, text: `BIT ${bit},${reg}`, kind: 'bit' };
  }

  if (group === 2) {
    return { pc: addr, length: 2, text: `RES ${bit},${reg}`, kind: 'res' };
  }

  if (group === 3) {
    return { pc: addr, length: 2, text: `SET ${bit},${reg}`, kind: 'set' };
  }

  return { pc: addr, length: 2, text: `CB ${hexByte(op)}`, kind: 'unknown' };
}

function decodeIndexed(addr, indexReg) {
  const op = rom[addr + 1] ?? 0;
  const disp = rom[addr + 2] ?? 0;
  const indexedBase = indexReg.toUpperCase();

  switch (op) {
    case 0x07:
      return { pc: addr, length: 3, text: `LD BC,(${indexedBase}${formatDisp(disp)})`, kind: 'ld-pair-indexed', pair: 'BC', indexReg, disp };
    case 0x0F:
      return { pc: addr, length: 3, text: `LD (${indexedBase}${formatDisp(disp)}),BC`, kind: 'ld-indexed-pair', pair: 'BC', indexReg, disp };
    case 0x27:
      return { pc: addr, length: 3, text: `LD HL,(${indexedBase}${formatDisp(disp)})`, kind: 'ld-pair-indexed', pair: 'HL', indexReg, disp };
    case 0x31:
      return { pc: addr, length: 3, text: `LD ${indexedBase},(${indexedBase}${formatDisp(disp)})`, kind: 'ld-index-indexed', indexReg, disp };
    case 0x36:
      return {
        pc: addr,
        length: 4,
        text: `LD (${indexedBase}${formatDisp(disp)}),${hex(rom[addr + 3] ?? 0, 2)}`,
        kind: 'ld-indexed-imm',
        indexReg,
        disp,
        value: rom[addr + 3] ?? 0,
      };
    case 0x77:
      return { pc: addr, length: 3, text: `LD (${indexedBase}${formatDisp(disp)}),A`, kind: 'ld-indexed-a', indexReg, disp };
    case 0x7E:
      return { pc: addr, length: 3, text: `LD A,(${indexedBase}${formatDisp(disp)})`, kind: 'ld-a-indexed', indexReg, disp };
    case 0xE1:
      return { pc: addr, length: 2, text: `POP ${indexedBase}`, kind: `pop-${indexReg}` };
    case 0xF9:
      return { pc: addr, length: 2, text: `LD SP,${indexedBase}`, kind: `ld-sp-${indexReg}` };
    default:
      return { pc: addr, length: 2, text: `${indexedBase} ${hexByte(op)}`, kind: 'unknown' };
  }
}

function decodeED(addr) {
  const op = rom[addr + 1] ?? 0;

  switch (op) {
    case 0x23: {
      const disp = rom[addr + 2] ?? 0;
      return {
        pc: addr,
        length: 3,
        text: `LEA HL,IY${formatDisp(disp)}`,
        kind: 'lea-hl-iyd',
        disp,
      };
    }
    case 0x62:
      return { pc: addr, length: 2, text: 'SBC HL,HL', kind: 'sbc-hl-hl' };
    default:
      return { pc: addr, length: 2, text: `ED ${hexByte(op)}`, kind: 'unknown' };
  }
}

function decode(addr) {
  const op = rom[addr] ?? 0;

  switch (op) {
    case 0x01: {
      const value = read24(addr + 1);
      return { pc: addr, length: 4, text: `LD BC,${hex(value)}`, kind: 'ld-bc-imm', value };
    }
    case 0x03:
      return { pc: addr, length: 1, text: 'INC BC', kind: 'inc-bc' };
    case 0x09:
      return { pc: addr, length: 1, text: 'ADD HL,BC', kind: 'add-hl-bc' };
    case 0x18: {
      const target = addr + 2 + signedByte(rom[addr + 1] ?? 0);
      return { pc: addr, length: 2, text: `JR ${hex(target)}`, kind: 'jr', target };
    }
    case 0x20: {
      const target = addr + 2 + signedByte(rom[addr + 1] ?? 0);
      return { pc: addr, length: 2, text: `JR NZ,${hex(target)}`, kind: 'jr-cond', condition: 'NZ', target };
    }
    case 0x21: {
      const value = read24(addr + 1);
      return { pc: addr, length: 4, text: `LD HL,${hex(value)}`, kind: 'ld-hl-imm', value };
    }
    case 0x23:
      return { pc: addr, length: 1, text: 'INC HL', kind: 'inc-hl' };
    case 0x28: {
      const target = addr + 2 + signedByte(rom[addr + 1] ?? 0);
      return { pc: addr, length: 2, text: `JR Z,${hex(target)}`, kind: 'jr-cond', condition: 'Z', target };
    }
    case 0x36:
      return {
        pc: addr,
        length: 2,
        text: `LD (HL),${hex(rom[addr + 1] ?? 0, 2)}`,
        kind: 'ld-hl-imm',
        value: rom[addr + 1] ?? 0,
      };
    case 0x3E:
      return { pc: addr, length: 2, text: `LD A,${hex(rom[addr + 1] ?? 0, 2)}`, kind: 'ld-a-imm', value: rom[addr + 1] ?? 0 };
    case 0x6F:
      return { pc: addr, length: 1, text: 'LD L,A', kind: 'ld-l-a' };
    case 0x7E:
      return { pc: addr, length: 1, text: 'LD A,(HL)', kind: 'ld-a-hl' };
    case 0xB7:
      return { pc: addr, length: 1, text: 'OR A', kind: 'or-a' };
    case 0xC1:
      return { pc: addr, length: 1, text: 'POP BC', kind: 'pop-bc' };
    case 0xC9:
      return { pc: addr, length: 1, text: 'RET', kind: 'ret' };
    case 0xCB:
      return decodeCB(addr);
    case 0xCD: {
      const target = read24(addr + 1);
      return { pc: addr, length: 4, text: `CALL ${hex(target)}`, kind: 'call', target };
    }
    case 0xDD:
      return decodeIndexed(addr, 'ix');
    case 0xE5:
      return { pc: addr, length: 1, text: 'PUSH HL', kind: 'push-hl' };
    case 0xE6:
      return { pc: addr, length: 2, text: `AND ${hex(rom[addr + 1] ?? 0, 2)}`, kind: 'and-imm', value: rom[addr + 1] ?? 0 };
    case 0xED:
      return decodeED(addr);
    case 0xFD:
      return decodeIndexed(addr, 'iy');
    default:
      return { pc: addr, length: 1, text: `DB ${hexByte(op)}`, kind: 'unknown' };
  }
}

function scanDirectCallers() {
  const callers = [];

  for (let pc = 0; pc <= rom.length - TARGET_CALL.length; pc += 1) {
    let matched = true;

    for (let i = 0; i < TARGET_CALL.length; i += 1) {
      if (rom[pc + i] !== TARGET_CALL[i]) {
        matched = false;
        break;
      }
    }

    if (!matched) {
      continue;
    }

    const start = Math.max(0, pc - 10);
    callers.push({
      pc,
      label: CALLER_LABELS.get(pc) ?? null,
      prevBytes: formatBytes(start, pc - start),
    });
  }

  return callers;
}

const disassembly = [];
const callSites = [];
const branches = [];
let endPc = START;

for (let pc = START; ; ) {
  const inst = decode(pc);
  const comments = [];

  const manual = MANUAL_COMMENTS.get(pc);
  if (manual) {
    comments.push(...manual);
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

  if (inst.kind === 'lea-hl-iyd' || inst.kind === 'ld-a-indexed') {
    const label = IY_FIELD_LABELS.get(inst.disp);
    if (label) {
      comments.push(label);
    }
  }

  if (pc === 0x00E556) {
    comments.push(`${hex(0xD141EC)} (${RAM_LABELS.get(0xD141EC)})`);
  }

  if (pc === 0x00E56D || pc === 0x00E579) {
    comments.push(`${hex(0xD141ED)} (${RAM_LABELS.get(0xD141ED)})`);
  }

  disassembly.push({
    pc,
    length: inst.length,
    bytes: formatBytes(pc, inst.length),
    text: inst.text,
    comments,
  });

  endPc = pc + inst.length - 1;
  if (inst.kind === 'ret') {
    break;
  }

  pc += inst.length;
}

const directCallers = scanDirectCallers();
const uniqueCallTargets = [...new Set(callSites.map((site) => site.target))].sort((a, b) => a - b);

const lines = [];
lines.push('# Phase 422 Probe: Static Trace of 0x00E4E8', '');
lines.push(`Function span: ${hex(START)}..${hex(endPc)} (${endPc - START + 1} bytes, ${disassembly.length} decoded instructions)`);
lines.push('- The RET at `0x00E582` ends this function; `0x00E583` is the next helper.');
lines.push('');
lines.push('Disassembly:');
for (const row of disassembly) {
  lines.push(
    `${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')} ${row.text.padEnd(28, ' ')}${row.comments.length ? ` ; ${row.comments.join(' | ')}` : ''}`
  );
}
lines.push('');
lines.push('CALL targets:');
for (const target of uniqueCallTargets) {
  const sites = callSites.filter((site) => site.target === target).map((site) => hex(site.pc)).join(', ');
  lines.push(`- ${hex(target)}${CALL_LABELS.has(target) ? ` (${CALL_LABELS.get(target)})` : ''} <- ${sites}`);
}
lines.push('');
lines.push('Port I/O:');
lines.push('- none inside 0x00E4E8');
lines.push('');
lines.push('Conditional branches:');
for (const branch of branches) {
  lines.push(`- ${hex(branch.pc)} ${branch.text}${branch.note ? ` - ${branch.note}` : ''}`);
}
lines.push('');
lines.push('Resolved pointer/RAM access chain:');
for (const note of RESOLVED_ACCESS_NOTES) {
  lines.push(`- ${note}`);
}
lines.push('');
lines.push('Direct caller sites to 0x00E4E8:');
for (const caller of directCallers) {
  lines.push(`- ${hex(caller.pc)}${caller.label ? ` (${caller.label})` : ''} | previous 10 bytes: ${caller.prevBytes || '(none)'}`);
}
lines.push('');
lines.push('Derived behavior:');
lines.push('- `fieldWord = ((IY+27 & 0x7F) << 8) | IY+26`.');
lines.push('- If `fieldWord != 0` or `(IY+25 & 0x03) == 1`, the helper replaces it with `0x03FF - fieldWord`.');
lines.push('- It copies `IY+24` into a nested output slot, clears `IY+24`, and seeds downstream pointer slots with `0xD141EC` / `0xD141ED`.');
lines.push('- If `D141ED` is nonzero, the helper clears `D141ED` and returns `HL = 0`; otherwise it returns the staged/complemented `fieldWord` in `HL`.');
lines.push('- No checksum arithmetic or protocol-header signature scan appears here; the routine is a field normalizer/stager with a shared-byte-stream gate.');

console.log(lines.join('\n'));
