#!/usr/bin/env node

import { readFileSync } from 'node:fs';

process.emitWarning = () => {};

const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url).href);

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = readFileSync(ROM_PATH);

const MODE = 'adl';
const EXPECTED_ROM_SIZE = 0x400000;

const CALLER_SPECS = [
  {
    site: 0x02376D,
    label: '0x02376D',
    disasmStart: 0x023728,
    disasmBytes: 0x90,
    containingStart: 0x023728,
    highlights: [
      [0x023754, 'restore SP from onSP'],
      [0x02375F, 'write mode byte 0x40'],
      [0x02376B, 'action A=0x58'],
      [0x02376D, 'JP 0x08C5D7'],
    ],
    actionCodes: [
      '`0x58`',
    ],
    modeWrites: [
      '`0x02375F` writes `0x40` to `0xD007E0`.',
    ],
    extraSetup: [
      'Copies 8 bytes from `0xD0061A` to `0xD0065B` with `LDIR`.',
      'Restores `SP` from `0xD007FA`.',
      'Clears `IY+0x12` bit 2, `IY+0x01` bit 4, and `IY+0x25` bit 5.',
    ],
    interpretation: [
      'The path is gated by `LD A,(0xD005F8)` / `CP 0x24` and then performs a state reset before re-entering `0x08C5D7`.',
      'It looks like a home/context reinit path closely related to the known error-recovery route, not a leaf error handler.',
    ],
  },
  {
    site: 0x08AD52,
    label: '0x08AD52',
    disasmStart: 0x08AD20,
    disasmBytes: 0xD0,
    containingStart: 0x08AD20,
    sharedEpilogue: 0x08AD4E,
    highlights: [
      [0x08AD2E, 'path A loads A=0xBF'],
      [0x08AD30, 'path A enters shared unwind'],
      [0x08AD4E, 'shared 4x POP BC unwind'],
      [0x08AD52, 'JP 0x08C5D7'],
      [0x08AD61, 'path B requires existing mode 0xBF'],
      [0x08AD8D, 'path B loads A=0x45'],
      [0x08AD8F, 'path B enters shared unwind'],
    ],
    actionCodes: [
      '`0xBF` via `0x08AD2E` -> `0x08AD30`.',
      '`0x45` via `0x08AD8D` -> `0x08AD8F`.',
    ],
    modeWrites: [
      'No write to `0xD007E0` appears before the shared jump.',
      'The `0x45` path explicitly requires the pre-existing mode byte `0xD007E0 == 0xBF`.',
    ],
    extraSetup: [
      'Path A checks `CALL 0x08A7AE`, then inspects `0xD02500` and only dispatches when it equals `0x2A`.',
      'Path B checks `0xD024FF` and `0xD02500`, calls `0x05782A`, then sets up `A=0x45` on success.',
      'Both paths unwind four stacked `BC` values before the final jump.',
    ],
    interpretation: [
      'This is not error recovery. It is a non-local escape/unwind that re-enters `0x08C5D7` from an app-specific mode.',
      'The shared epilogue plus preserved `0xBF` mode byte strongly suggest a general context transition.',
    ],
  },
  {
    site: 0x08C497,
    label: '0x08C497',
    disasmStart: 0x08C44D,
    disasmBytes: 0x90,
    containingStart: 0x08C331,
    highlights: [
      [0x08C463, 'load kbdToken'],
      [0x08C470, 'candidate table 0x027272'],
      [0x08C47A, 'helper 0x027233'],
      [0x08C480, 'candidate table 0x027284'],
      [0x08C487, 'candidate table 0x02727B'],
      [0x08C48B, 'copy target 0xD0082E'],
      [0x08C493, 'copy 9 bytes with LDIR'],
      [0x08C495, 'action A=0x58'],
      [0x08C497, 'JP 0x08C5D7'],
    ],
    actionCodes: [
      '`0x58`',
    ],
    modeWrites: [
      'No write to `0xD007E0` appears in this caller block before the jump.',
    ],
    extraSetup: [
      'Reached from a local CoorMon block after `CP 0xFA` matches.',
      'Reads `kbdToken` from `0xD0058E` and rejects zero or large token values.',
      'Chooses one of the `0x027272` / `0x02727B` / `0x027284` tables and copies 9 bytes into `0xD0082E`.',
    ],
    interpretation: [
      'This is a staged submenu/context re-entry inside CoorMon, not an error path.',
      'The scratch copy into `0xD0082E` and then `A=0x58` make `0x08C5D7` look like a general re-entry dispatcher.',
    ],
  },
];

const RAM_NAMES = new Map([
  [0xD0058C, 'kbdKey'],
  [0xD0058E, 'kbdToken'],
  [0xD005F8, 'state byte @ D005F8'],
  [0xD005F9, 'buffer @ D005F9'],
  [0xD0061A, 'source block @ D0061A'],
  [0xD0065B, 'dest block @ D0065B'],
  [0xD00699, 'status byte @ D00699'],
  [0xD007CA, 'cxMain'],
  [0xD007CD, 'callback slot @ D007CD'],
  [0xD007D0, 'callback slot @ D007D0'],
  [0xD007D3, 'callback slot @ D007D3'],
  [0xD007E0, 'cxCurApp / mode byte'],
  [0xD007FA, 'onSP / saved SP'],
  [0xD00802, 'flags byte @ D00802'],
  [0xD0082E, 'scratch block @ D0082E'],
  [0xD008D6, 'pointer @ D008D6'],
  [0xD008D9, 'pointer @ D008D9'],
  [0xD0243A, 'pointer @ D0243A'],
  [0xD024FF, 'state byte @ D024FF'],
  [0xD02500, 'state byte @ D02500'],
  [0xD026AE, 'state byte @ D026AE'],
  [0xD02FD6, 'state word @ D02FD6'],
  [0x00268A, 'global slot @ 0x00268A'],
  [0x0026AA, 'global slot @ 0x0026AA'],
  [0x0026B5, 'global slot @ 0x0026B5'],
]);

const TARGET_NAMES = new Map([
  [0x0003A0, 'RST/system call 0x0003A0'],
  [0x022331, 'helper 0x022331'],
  [0x024027, 'helper 0x024027'],
  [0x025354, 'helper 0x025354'],
  [0x025396, 'helper 0x025396'],
  [0x027204, 'helper 0x027204'],
  [0x027233, 'helper 0x027233'],
  [0x03C33D, 'CoorMon re-entry'],
  [0x03FBFD, 'tail jump @ 0x03FBFD'],
  [0x04C973, 'helper 0x04C973'],
  [0x0551EF, 'helper 0x0551EF'],
  [0x055B8F, 'helper 0x055B8F'],
  [0x05782A, 'helper 0x05782A'],
  [0x05C5B3, 'helper 0x05C5B3'],
  [0x0620E6, 'helper 0x0620E6'],
  [0x06EDAC, 'helper 0x06EDAC'],
  [0x06FCD0, 'helper 0x06FCD0'],
  [0x08A7AE, 'helper 0x08A7AE'],
  [0x08AE11, 'branch target 0x08AE11'],
  [0x08B0A2, 'branch target 0x08B0A2'],
  [0x08C509, 'common dispatch pre-tail'],
  [0x08C519, 'common dispatch tail'],
  [0x08C593, 'CoorMon cleanup branch'],
  [0x08C72F, 'CoorMon dispatch sub'],
  [0x08C745, 'indirect jump helper'],
  [0x08C79F, 'NewContext'],
  [0x08C7AB, 'helper 0x08C7AB'],
  [0x08C7AD, 'NewContext0'],
  [0x0A2E05, 'helper 0x0A2E05'],
]);

const IY_FLAGS = new Map([
  [0x01, 'IY+0x01'],
  [0x02, 'IY+0x02'],
  [0x09, 'IY+0x09'],
  [0x0C, 'IY+0x0C'],
  [0x0E, 'IY+0x0E'],
  [0x11, 'IY+0x11'],
  [0x12, 'IY+0x12'],
  [0x16, 'IY+0x16'],
  [0x1D, 'IY+0x1D'],
  [0x25, 'IY+0x25'],
  [0x27, 'IY+0x27'],
  [0x28, 'IY+0x28'],
  [0x32, 'IY+0x32'],
  [0x33, 'IY+0x33'],
  [0x3F, 'IY+0x3F'],
  [0x40, 'IY+0x40'],
  [0x41, 'IY+0x41'],
  [0x42, 'IY+0x42'],
  [0x4B, 'IY+0x4B'],
  [0x51, 'IY+0x51'],
  [0x57, 'IY+0x57'],
  [0x5A, 'IY+0x5A'],
  [0x5B, 'IY+0x5B'],
  [0x5C, 'IY+0x5C'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function signedDisp(value) {
  const n = Number(value ?? 0);
  return `${n < 0 ? '-' : '+'}${hexByte(Math.abs(n))}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${upper(indexRegister)}${signedDisp(displacement)})`;
}

function formatValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return hex(value, 4);
  if (modePrefix === 'sil' || modePrefix === 'lil') return hex(value, 6);
  if (value <= 0xFF) return hex(value, 2);
  if (value <= 0xFFFF) return hex(value, 4);
  return hex(value, 6);
}

function bytesHex(start, length) {
  return Array.from(
    rom.subarray(start, Math.min(start + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatAlu(op, operand) {
  const name = upper(op);
  if (name === 'ADD' || name === 'ADC' || name === 'SBC') {
    return `${name} A, ${operand}`;
  }
  return `${name} ${operand}`;
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'decodeError',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${signedDisp(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  if (!inst?.tag) return '???';

  switch (inst.tag) {
    case 'db':
      return `DB ${hexByte(inst.value)}`;
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'ret':
      return 'RET';
    case 'ret-conditional':
    case 'ret-cond':
      return `RET ${upper(inst.condition)}`;
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
    case 'jp-cond':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jp-idx':
      return `JP (${upper(inst.indexRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
    case 'jr-cond':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
    case 'call-cond':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'rst':
      return `RST ${hexByte(inst.target ?? inst.vector)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ex-af':
      return 'EX AF, AF\'';
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ex-sp-hl':
      return 'EX (SP), HL';
    case 'cpl':
      return 'CPL';
    case 'ccf':
      return 'CCF';
    case 'scf':
      return 'SCF';
    case 'daa':
      return 'DAA';
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${formatValue(inst.value, inst.modePrefix)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
    case 'ld-a-mem':
      return `LD ${upper(inst.dest ?? inst.dst ?? 'a')}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
    case 'ld-mem-a':
      return `LD (${hex(inst.addr ?? inst.address)}), ${upper(inst.src ?? 'a')}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
      }
      return `LD ${upper(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(inst.value)}`;
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'ld-sp-pair':
      return `LD SP, ${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`;
    case 'ld-reg-ixd':
    case 'ld-reg-indexed':
    case 'ld-reg-idx':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
    case 'ld-indexed-reg':
    case 'ld-idx-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-idx-imm':
    case 'ld-ixd-imm':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'adc-pair':
      return `ADC ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'sbc-pair':
      return `SBC ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-ind':
      return 'INC (HL)';
    case 'dec-ind':
      return 'DEC (HL)';
    case 'bit-test':
      return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set':
      return `SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set-ind':
      return `SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res':
    case 'bit-reset':
      return `RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res-ind':
    case 'bit-reset-ind':
      return `RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'alu-reg':
      return formatAlu(inst.op, upper(inst.src));
    case 'alu-imm':
    case 'alu-immediate':
      return formatAlu(inst.op, hexByte(inst.value));
    case 'alu-ind':
      return formatAlu(inst.op, '(HL)');
    case 'alu-idx':
      return formatAlu(inst.op, formatIndexedOperand(inst.indexRegister, inst.displacement));
    case 'ld-special':
      return `LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'ldi':
      return 'LDI';
    case 'ldd':
      return 'LDD';
    case 'in-reg':
      return `IN ${upper(inst.reg ?? inst.dest)}, (C)`;
    case 'in-a-imm':
      return `IN A, (${hexByte(inst.port)})`;
    case 'out-reg':
      return `OUT (C), ${upper(inst.reg ?? inst.src)}`;
    case 'out-a-imm':
      return `OUT (${hexByte(inst.port)}), A`;
    case 'rotate-reg':
      return `${upper(inst.op)} ${upper(inst.reg)}`;
    case 'rotate-ind':
      return `${upper(inst.op)} (HL)`;
    case 'im':
      return `IM ${inst.mode !== undefined ? inst.mode : inst.interruptMode}`;
    case 'mlt':
      return `MLT ${upper(inst.pair ?? inst.reg)}`;
    case 'lea':
      return `LEA ${upper(inst.dest)}, ${upper(inst.base)}${signedDisp(inst.displacement)}`;
    case 'pea':
      return `PEA ${upper(inst.base ?? inst.src)}${signedDisp(inst.displacement)}`;
    default: {
      const extra = fallbackOperands(inst);
      return extra ? `${inst.tag} ${extra}` : inst.tag;
    }
  }
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, MODE);
  } catch {
    return null;
  }
}

function decodeRow(pc) {
  const inst = safeDecode(pc);
  const length = Math.max(1, inst?.length ?? 1);
  const nextPc = inst?.nextPc ?? (pc + length);
  return {
    pc,
    inst,
    bytes: bytesHex(pc, length),
    nextPc,
    text: renderInstruction(inst),
  };
}

function collectRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end && pc < rom.length;) {
    const row = decodeRow(pc);
    rows.push(row);
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) break;
    pc = row.nextPc;
  }
  return rows;
}

function isReturn(inst) {
  return inst?.tag === 'ret'
    || inst?.tag === 'reti'
    || inst?.tag === 'retn'
    || inst?.tag === 'ret-conditional'
    || inst?.tag === 'ret-cond';
}

function isHardBoundary(inst) {
  return isReturn(inst)
    || inst?.tag === 'jp'
    || inst?.tag === 'jp-indirect'
    || inst?.tag === 'jp-idx'
    || inst?.tag === 'jr';
}

function tryDecodePath(start, target, maxSteps = 256) {
  const rows = [];
  let pc = start;

  for (let step = 0; step < maxSteps && pc <= target; step += 1) {
    const row = decodeRow(pc);
    rows.push(row);
    if (pc === target) return rows;
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) return null;
    pc = row.nextPc;
  }

  return null;
}

function findAlignedRows(target, maxLookback = 0x240) {
  const minStart = Math.max(0, target - maxLookback);
  let best = null;

  for (let start = minStart; start <= target; start += 1) {
    const rows = tryDecodePath(start, target);
    if (!rows) continue;

    const beforeCount = rows.length - 1;
    const byteSpan = target - start;
    const score = beforeCount * 1000 - byteSpan;

    if (!best || score > best.score) {
      best = { score, rows };
    }
  }

  return best?.rows ?? [decodeRow(target)];
}

function analyzeBoundary(target) {
  const rows = findAlignedRows(target);
  const targetIndex = rows.findIndex((row) => row.pc === target);
  let localIndex = 0;

  for (let index = 1; index <= targetIndex; index += 1) {
    if (isHardBoundary(rows[index - 1].inst)) {
      localIndex = index;
    }
  }

  const previous = localIndex > 0 ? rows[localIndex - 1] : null;
  return {
    rows,
    targetIndex,
    containingStart: rows[0]?.pc ?? target,
    localStart: rows[localIndex]?.pc ?? target,
    localReason: previous ? `${renderInstruction(previous.inst)} at ${hex(previous.pc)}` : 'start of aligned decode path',
  };
}

function classifyMemoryDirection(inst) {
  if (inst?.tag === 'ld-reg-mem' || inst?.tag === 'ld-a-mem') return 'read';
  if (inst?.tag === 'ld-mem-reg' || inst?.tag === 'ld-mem-a' || inst?.tag === 'ld-mem-pair') return 'write';
  if (inst?.tag === 'ld-pair-mem') return inst.direction === 'to-mem' ? 'write' : 'read';
  return null;
}

function getAbsoluteAddress(inst) {
  return inst?.addr ?? inst?.address;
}

function noteIY(inst) {
  if (!inst?.indexRegister || upper(inst.indexRegister) !== 'IY') return null;
  const displacement = (inst.displacement ?? 0) & 0xFF;
  const label = IY_FLAGS.get(displacement) ?? `IY+${hex(displacement, 2)}`;

  if (inst.tag === 'indexed-cb-bit') return `test ${label} bit ${inst.bit}`;
  if (inst.tag === 'indexed-cb-set') return `set ${label} bit ${inst.bit}`;
  if (inst.tag === 'indexed-cb-res') return `clear ${label} bit ${inst.bit}`;
  return `touch ${label}`;
}

function formatBlockRange(start, count) {
  const end = start + Math.max(0, count - 1);
  return `${hex(start)}..${hex(end)}`;
}

function annotateBlockMove(rows, index) {
  const row = rows[index];
  if (!row?.inst || (row.inst.tag !== 'ldir' && row.inst.tag !== 'lddr')) return null;

  let hlValue = null;
  let deValue = null;
  let bcValue = null;

  for (let i = Math.max(0, index - 6); i < index; i += 1) {
    const inst = rows[i].inst;
    if (inst?.tag === 'ld-pair-imm' && inst.pair === 'hl') hlValue = inst.value;
    if (inst?.tag === 'ld-pair-imm' && inst.pair === 'de') deValue = inst.value;
    if (inst?.tag === 'ld-pair-imm' && inst.pair === 'bc') bcValue = inst.value;
  }

  if (deValue !== null && bcValue !== null) {
    const dst = `${RAM_NAMES.get(deValue) ?? hex(deValue)} (${formatBlockRange(deValue, bcValue)})`;
    const src = hlValue !== null
      ? `${RAM_NAMES.get(hlValue) ?? hex(hlValue)} (${formatBlockRange(hlValue, bcValue)})`
      : 'unknown source';
    return `${upper(row.inst.tag)} copies ${bcValue} byte(s) ${src} -> ${dst}`;
  }

  return null;
}

function buildRowNotes(rows, index, highlightNotes = new Map()) {
  const row = rows[index];
  const notes = [];
  const addr = getAbsoluteAddress(row.inst);
  const direction = classifyMemoryDirection(row.inst);
  const iy = noteIY(row.inst);
  const target = row.inst?.target;
  const blockMove = annotateBlockMove(rows, index);
  const highlight = highlightNotes.get(row.pc);

  if (direction && addr !== undefined) {
    notes.push(`${direction} ${RAM_NAMES.get(addr) ?? hex(addr)}`);
  }
  if (iy) notes.push(iy);
  if (target !== undefined) {
    notes.push(`target ${hex(target)}${TARGET_NAMES.has(target) ? ` (${TARGET_NAMES.get(target)})` : ''}`);
  }
  if (blockMove) notes.push(blockMove);
  if (highlight) notes.push(highlight);

  return notes;
}

function printSection(title) {
  console.log('='.repeat(96));
  console.log(title);
  console.log('='.repeat(96));
}

function printRows(title, rows, highlightNotes = new Map()) {
  printSection(title);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const notes = buildRowNotes(rows, index, highlightNotes);
    const prefix = highlightNotes.has(row.pc) ? '>' : ' ';
    const suffix = notes.length ? `  ; ${notes.join(' | ')}` : '';
    console.log(`${prefix} ${hex(row.pc)}  ${row.bytes.padEnd(18)} ${row.text}${suffix}`);
  }
  console.log('');
}

function collectIncomingRefs(rows, target) {
  return rows
    .filter((row) => row.inst?.target === target)
    .map((row) => `${hex(row.pc)}  ${row.text}`);
}

function printList(title, items) {
  console.log(title);
  console.log('-'.repeat(title.length));
  if (!items.length) {
    console.log('(none)');
  } else {
    for (const item of items) console.log(`- ${item}`);
  }
  console.log('');
}

function printCallerReport(spec) {
  const boundary = analyzeBoundary(spec.site);
  const rows = collectRange(spec.disasmStart, spec.disasmStart + spec.disasmBytes);
  const highlightNotes = new Map(spec.highlights);
  const incomingToLocal = collectIncomingRefs(boundary.rows, spec.disasmStart)
    .filter((line) => !line.startsWith(hex(spec.site)));

  printSection(`Caller ${hex(spec.site)} (${spec.label})`);
  console.log(`Detected local boundary before caller: ${hex(boundary.localStart)} (${boundary.localReason}).`);
  if (spec.disasmStart !== boundary.localStart) {
    console.log(`Chosen disassembly start: ${hex(spec.disasmStart)}.`);
  }
  if (spec.containingStart !== undefined) {
    console.log(`Containing function start used for interpretation: ${hex(spec.containingStart)}.`);
  }
  if (incomingToLocal.length) {
    console.log(`Incoming refs to the chosen local block:`);
    for (const line of incomingToLocal) console.log(`  ${line}`);
  }
  if (spec.sharedEpilogue !== undefined) {
    const sharedRefs = collectIncomingRefs(rows, spec.sharedEpilogue);
    if (sharedRefs.length) {
      console.log(`Incoming refs to shared epilogue ${hex(spec.sharedEpilogue)}:`);
      for (const line of sharedRefs) console.log(`  ${line}`);
    }
  }
  console.log('');

  printRows(
    `Disassembly ${hex(spec.disasmStart)}..${hex(spec.disasmStart + spec.disasmBytes)}`,
    rows,
    highlightNotes,
  );

  printList('Action code(s) before JP 0x08C5D7', spec.actionCodes);
  printList('Mode-byte writes before JP', spec.modeWrites);
  printList('Other setup before JP', spec.extraSetup);
  printList('Interpretation', spec.interpretation);
}

function printSupportReport(title, start, end, highlights, summaryLines) {
  const rows = collectRange(start, end);
  printRows(`${title} ${hex(start)}..${hex(end)}`, rows, new Map(highlights));
  printList(`${title} summary`, summaryLines);
}

function main() {
  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(`Expected ROM size ${EXPECTED_ROM_SIZE}, got ${rom.length}`);
  }

  console.log('Phase 397 - Investigate non-error callers of 0x08C5D7');
  console.log(`ROM: ${ROM_PATH.pathname}`);
  console.log(`ROM size: ${rom.length.toLocaleString('en-US')} bytes (${hex(rom.length, 8)})`);
  console.log(`Decode mode: ${MODE.toUpperCase()}`);
  console.log('');
  console.log('Known callers of 0x08C5D7 are 0x02376D, 0x0302E2, 0x08AD52, and 0x08C497.');
  console.log('This probe focuses on the three non-0x0302E2 callers and then re-dumps the shared dispatch helpers.');
  console.log('');

  for (const spec of CALLER_SPECS) {
    printCallerReport(spec);
  }

  printSupportReport(
    'Dispatch entry 0x08C5D7',
    0x08C5D7,
    0x08C700,
    [
      [0x08C5D8, 'special-case action 0x59'],
      [0x08C5E7, 'read mode byte'],
      [0x08C601, 'CALL 0x08C7AD'],
      [0x08C606, 'tail-JP 0x08C519'],
      [0x08C6B1, 'mode 0x58 cleanup path'],
      [0x08C6F6, 'tail-JP 0x03FBFD'],
    ],
    [
      'Entry copies `A` into `B`, then only special-cases `A == 0x59` by folding in `kbdToken` from `0xD0058E`.',
      'It reads `0xD007E0` and normalizes two special mode bytes: `0x50` and `0x52`.',
      'In the common case it calls `0x08C7AD`, restores `A=B`, and tail-jumps to `0x08C519`.',
      'The later body contains broader context cleanup, including a dedicated `mode == 0x58` path before tail-jumping to `0x03FBFD`.',
    ],
  );

  printSupportReport(
    'Helper 0x08C7AD',
    0x08C7AD,
    0x08C82D,
    [
      [0x08C7B3, 'mark global slot 0x0026B5 = 0xFFFFFF'],
      [0x08C7C5, 'clear global slot 0x0026B5'],
      [0x08C7D8, 'write D026AE = 0x03'],
      [0x08C7EE, 'compare against mode byte at D007E0'],
      [0x08C807, 'early return for mode 0x44'],
      [0x08C80E, 'sets B=0x27 and returns'],
    ],
    [
      '`0x08C7AD` is a context/setup helper, not a leaf no-op.',
      'It clears several IY flags, updates global bookkeeping slots, writes `0x03` to `0xD026AE`, and calls `0x0A2E05` with the original action code.',
      'It then compares against the current mode byte and has explicit follow-up cases for modes `0x44` and `0x40` before returning.',
    ],
  );

  printSupportReport(
    'Tail target 0x08C519',
    0x08C519,
    0x08C560,
    [
      [0x08C51E, 'special-case action 0x28 -> A=0xDA'],
      [0x08C52C, 'special-case action 0x29 -> A=0x7F'],
      [0x08C532, 'CALL 0x022331'],
      [0x08C536, 'CALL 0x08C72F'],
      [0x08C53F, '0x29 path jumps back to 0x08C41D'],
    ],
    [
      '`0x08C519` is the common dispatch tail that handles special action codes `0x28` and `0x29` first.',
      'It then runs `CALL 0x022331`, `CALL 0x08C72F`, clears `IY+0x09` bit 4, and resumes the broader CoorMon/menu dispatch flow.',
      'This is shared common dispatch machinery, which is why `0x08C5D7` tail-jumps here after context normalization.',
    ],
  );

  printSection('Verdict');
  console.log('0x08C5D7 is a general context/mode re-entry dispatcher, not an error-only sink.');
  console.log('');
  console.log('Evidence:');
  console.log('- `0x02376D` feeds it with `A=0x58` after restoring `SP`, clearing several IY flags, and forcing `0xD007E0=0x40`.');
  console.log('- `0x08C497` feeds it with `A=0x58` after staging a 9-byte block into `0xD0082E`, with no mode-byte write at all.');
  console.log('- `0x08AD52` reaches it through a shared unwind epilogue with non-error action codes `0xBF` or `0x45`, again with no local mode-byte write.');
  console.log('- The body of `0x08C5D7` itself reads `0xD007E0`, normalizes context, calls the setup helper `0x08C7AD`, and then tail-jumps into the common dispatch tail at `0x08C519`.');
  console.log('');
  console.log('So the best model is: `0x08C5D7` = context-sensitive re-entry / reinit front-end for the broader dispatch engine, used by error recovery as one caller among several.');
}

main();
