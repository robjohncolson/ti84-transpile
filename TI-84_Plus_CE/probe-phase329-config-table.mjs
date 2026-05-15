#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TABLE_BASE = 0x0525D4;
const TABLE_STRIDE = 12;
const TABLE_SLOT_COUNT = 3;
const SELECTOR_FUNC = 0x055316;
const BOOT_SLOW_PATH = 0x05519F;
const BOOT_COPY_SOURCE = 0x05550C;
const BOOT_COPY_LEN = 13;
const RECORD_OVERLAP_CODE = 0x055167;

const DESCRIPTOR_PTR_RAM = 0xD005E9;

const STATE_LABELS = new Map([
  [0xD005E9, 'descriptor pointer'],
  [0xD005EC, 'shared render param A'],
  [0xD005ED, 'shared render param B'],
  [0xD005F0, 'shared render param C'],
  [0xD005F4, 'width/alpha mode'],
  [0xD008D2, 'pen column'],
  [0xD008D5, 'pen row'],
  [0xD026AA, 'draw BG color'],
  [0xD026AC, 'draw FG/state color'],
  [0xD02FD6, 'clip Y floor / gCurYLoc'],
  [0xD02FD9, 'display width'],
  [0xD02FDC, 'display height / clip max Y'],
  [0xD02FDF, 'display mode byte'],
  [0xD02FE0, 'row stride'],
  [0xD02FE3, 'VRAM base'],
]);

const HELPER_NAMES = new Map([
  [0x0A5424, 'Load_Sfont'],
  [0x07BF3E, 'FontLookup'],
  [0x00015C, 'dispatch trampoline'],
  [0x002288, 'jp (iy) trampoline'],
  [0x055305, 'record[+0] getter'],
  [0x05411C, 'record[+3] consumer'],
  [0x054DD4, 'record[+6] consumer'],
  [0x054DC3, 'record[+9] consumer'],
  [0x054FC6, 'record0 draw hook'],
  [0x055167, 'record0 width hook'],
  [0x05518C, 'record0 height hook'],
  [0x054E21, 'record1 draw hook'],
  [0x054FBC, 'record1 width hook'],
  [0x054FC1, 'record1 height hook'],
]);

const SLOT_CONSUMERS = [
  {
    offset: 0,
    consumer: 0x055305,
    role: 'getter for selector/id',
    evidence: 'Loads IY from D005E9, returns (IY+0) in HL.',
  },
  {
    offset: 3,
    consumer: 0x05411C,
    role: 'per-character draw hook',
    evidence: 'Loads BC from (IY+3) and dispatches through the trampoline.',
  },
  {
    offset: 6,
    consumer: 0x054DD4,
    role: 'advance/width hook',
    evidence: 'Loads BC from (IY+6) and uses it inside the width accumulator loop.',
  },
  {
    offset: 9,
    consumer: 0x054DC3,
    role: 'tail-jump metric hook',
    evidence: 'Loads HL from (IY+9) and immediately JP (HL).',
  },
];

const CALL_OR_JP_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function bytesAt(addr, len) {
  return bytesToHex(rom.subarray(addr, addr + len));
}

function read16(buffer, addr) {
  return ((buffer[addr] ?? 0) | ((buffer[addr + 1] ?? 0) << 8)) >>> 0;
}

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function formatIndexed(reg, disp) {
  const signed = disp >= 0 ? `+${disp}` : `${disp}`;
  return `(${String(reg).toUpperCase()}${signed})`;
}

function normalizeAddr(addr, modePrefix) {
  if (!Number.isInteger(addr)) {
    return null;
  }
  if (modePrefix === 'sis' && addr <= 0xFFFF) {
    return (0xD00000 | addr) >>> 0;
  }
  return addr >>> 0;
}

function isConditionalBranch(inst) {
  return ['jr-conditional', 'jp-conditional', 'ret-conditional', 'djnz'].includes(inst.tag);
}

function isUnconditionalBranch(inst) {
  return ['jr', 'jp', 'jp-indirect'].includes(inst.tag);
}

function isReturn(inst) {
  return ['ret', 'reti', 'retn', 'ret-conditional'].includes(inst.tag);
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode error)';
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'push':
      return `${prefix}PUSH ${String(inst.pair ?? inst.reg ?? inst.src).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair ?? inst.reg ?? inst.dest).toUpperCase()}`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src ?? inst.indirectRegister).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest ?? inst.indirectRegister).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(normalizeAddr(inst.addr, inst.modePrefix))}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(normalizeAddr(inst.addr, inst.modePrefix))})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(normalizeAddr(inst.addr, inst.modePrefix))}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(normalizeAddr(inst.addr, inst.modePrefix))}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(normalizeAddr(inst.addr, inst.modePrefix))})`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg ?? inst.pair).toUpperCase()}`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${String(inst.base).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'nop':
      return `${prefix}NOP`;
    default: {
      let text = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) {
        text += ` ${hex(inst.target)}`;
      }
      if (inst.value !== undefined) {
        text += ` ${hex(inst.value)}`;
      }
      return text;
    }
  }
}

function collectFunction(start, maxSpan = 0x240) {
  const minPc = start;
  const maxPc = start + maxSpan;
  const queue = [start];
  const queued = new Set(queue);
  const instructions = new Map();

  while (queue.length > 0) {
    const blockStart = queue.shift();
    let pc = blockStart;

    while (pc >= minPc && pc < maxPc) {
      if (instructions.has(pc) && pc !== blockStart) {
        break;
      }

      const inst = decodeSafe(pc);
      if (!inst || !inst.length) {
        break;
      }
      instructions.set(pc, inst);

      const fallthrough = nextPc(inst);

      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        if (fallthrough < maxPc) {
          pc = fallthrough;
          continue;
        }
        break;
      }

      if (isConditionalBranch(inst)) {
        if (inst.target !== undefined && inst.target >= minPc && inst.target < maxPc && !queued.has(inst.target)) {
          queue.push(inst.target);
          queued.add(inst.target);
        }
        if (fallthrough < maxPc && !queued.has(fallthrough)) {
          queue.push(fallthrough);
          queued.add(fallthrough);
        }
        break;
      }

      if (inst.tag === 'jp-indirect') {
        break;
      }

      if (isUnconditionalBranch(inst)) {
        if (inst.target !== undefined && inst.target >= minPc && inst.target < maxPc && !queued.has(inst.target)) {
          queue.push(inst.target);
          queued.add(inst.target);
        }
        break;
      }

      if (isReturn(inst)) {
        break;
      }

      if (fallthrough >= maxPc) {
        break;
      }
      pc = fallthrough;
    }
  }

  return [...instructions.values()].sort((a, b) => a.pc - b.pc);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function analyzeHelper(addr) {
  const rows = collectFunction(addr);
  const calls = uniqueSorted(
    rows
      .filter((inst) => inst.tag === 'call' || inst.tag === 'call-conditional')
      .map((inst) => inst.target)
      .filter((target) => Number.isInteger(target)),
  );

  const reads = [];
  const writes = [];

  for (const inst of rows) {
    const addr24 = normalizeAddr(inst.addr, inst.modePrefix);
    if (!STATE_LABELS.has(addr24)) {
      continue;
    }
    if (inst.tag === 'ld-reg-mem' || (inst.tag === 'ld-pair-mem' && inst.direction !== 'to-mem')) {
      reads.push(addr24);
    }
    if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair' || (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem')) {
      writes.push(addr24);
    }
  }

  let constantHl = null;
  if (rows.length >= 2 && rows[0].tag === 'ld-pair-imm' && rows[0].pair === 'hl' && rows[1].tag === 'ret') {
    constantHl = rows[0].value >>> 0;
  }

  return {
    rows,
    calls,
    reads: uniqueSorted(reads),
    writes: uniqueSorted(writes),
    constantHl,
  };
}

function describeHelper(slotOffset, addr, analysis) {
  if (analysis.constantHl !== null) {
    if (slotOffset === 6) {
      return `constant width/advance = ${analysis.constantHl}`;
    }
    if (slotOffset === 9) {
      return `constant height/line advance = ${analysis.constantHl}`;
    }
    return `constant HL return = ${analysis.constantHl}`;
  }

  if (analysis.calls.includes(0x0A5424)) {
    if (slotOffset === 3) {
      return 'variable-width small-font draw hook';
    }
    if (slotOffset === 6) {
      return 'glyph-dependent width hook';
    }
  }

  if (analysis.calls.includes(0x07BF3E)) {
    if (slotOffset === 3) {
      return 'fixed-record font draw hook';
    }
  }

  if (addr === 0x054FC1 || addr === 0x05518C) {
    return 'constant line/cell metric hook';
  }

  return 'ROM code hook';
}

function recordFor(index) {
  const base = TABLE_BASE + index * TABLE_STRIDE;
  return {
    index,
    base,
    raw: rom.subarray(base, base + TABLE_STRIDE),
    selector: read24(rom, base),
    slot3: read24(rom, base + 3),
    slot6: read24(rom, base + 6),
    slot9: read24(rom, base + 9),
  };
}

function looksLikeCodePtr(addr) {
  if (!Number.isInteger(addr) || addr <= 0 || addr >= rom.length) {
    return false;
  }
  const inst = decodeSafe(addr);
  return Boolean(inst?.length);
}

function recordValidity(record) {
  return record.selector === record.index &&
    looksLikeCodePtr(record.slot3) &&
    looksLikeCodePtr(record.slot6) &&
    looksLikeCodePtr(record.slot9);
}

function labelForAddr(addr) {
  return HELPER_NAMES.get(addr) ?? STATE_LABELS.get(addr) ?? '';
}

function callerContext(targetPc, lookback = 40, after = 2) {
  for (let start = Math.max(0, targetPc - lookback); start <= targetPc; start += 1) {
    const rows = [];
    let pc = start;

    try {
      while (pc <= targetPc && rows.length < 24) {
        const inst = decodeSafe(pc);
        if (!inst || !inst.length) {
          break;
        }
        rows.push({ pc, inst });
        if (pc === targetPc) {
          let next = nextPc(inst);
          for (let i = 0; i < after && next < rom.length; i += 1) {
            const extra = decodeSafe(next);
            if (!extra || !extra.length) {
              break;
            }
            rows.push({ pc: next, inst: extra });
            next = nextPc(extra);
          }
          return rows;
        }
        pc = nextPc(inst);
      }
    } catch {}
  }

  return [];
}

function inferCallerArg(callSite, type, rows) {
  const before = rows.filter((row) => row.pc < callSite);
  const last = before.at(-1);
  const prev = before.at(-2);

  if (String(type).startsWith('JP')) {
    return 'exported vector; stack argument comes from upstream caller';
  }

  if (last?.inst.tag === 'push' && last.inst.pair === 'bc') {
    if (prev?.inst.tag === 'ld-pair-imm' && prev.inst.pair === 'bc') {
      return `immediate selector ${prev.inst.value}`;
    }
    if (prev?.inst.tag === 'ld-pair-indexed' && prev.inst.pair === 'bc') {
      return `runtime value from ${formatIndexed(prev.inst.indexRegister, prev.inst.displacement)} (selector 0/1 or raw pointer)`;
    }
  }

  return 'unable to recover simple BC argument pattern';
}

function findSelectorCallers() {
  const hits = [];
  const low = SELECTOR_FUNC & 0xFF;
  const mid = (SELECTOR_FUNC >> 8) & 0xFF;
  const high = (SELECTOR_FUNC >> 16) & 0xFF;

  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    const op = rom[pc];
    if (!CALL_OR_JP_OPS.has(op)) {
      continue;
    }
    if (rom[pc + 1] !== low || rom[pc + 2] !== mid || rom[pc + 3] !== high) {
      continue;
    }
    const inst = decodeSafe(pc);
    if (!inst || inst.target !== SELECTOR_FUNC) {
      continue;
    }
    hits.push({
      pc,
      type: CALL_OR_JP_OPS.get(op),
      rows: callerContext(pc),
    });
  }

  return hits;
}

function printHexDump() {
  console.log('=== Phase 329: 0x0525D4 Render-Config Table ===\n');
  console.log('1) Raw 36-byte dump with 12-byte entry boundaries');
  console.log(`   Table range: ${hex(TABLE_BASE)} .. ${hex(TABLE_BASE + TABLE_SLOT_COUNT * TABLE_STRIDE - 1)}\n`);

  const full = rom.subarray(TABLE_BASE, TABLE_BASE + TABLE_SLOT_COUNT * TABLE_STRIDE);
  console.log(`   full: ${bytesToHex(full)}\n`);

  for (let index = 0; index < TABLE_SLOT_COUNT; index += 1) {
    const record = recordFor(index);
    const chunks = [
      bytesToHex(record.raw.subarray(0, 3)),
      bytesToHex(record.raw.subarray(3, 6)),
      bytesToHex(record.raw.subarray(6, 9)),
      bytesToHex(record.raw.subarray(9, 12)),
    ];
    console.log(
      `   entry ${index} @ ${hex(record.base)}: ` +
      `[${chunks[0]}] [${chunks[1]}] [${chunks[2]}] [${chunks[3]}]`,
    );
    console.log(
      `     24-bit fields: +0=${hex(record.selector)} ` +
      `+3=${hex(record.slot3)} +6=${hex(record.slot6)} +9=${hex(record.slot9)}`,
    );
  }

  console.log('');
}

function printTableDecode() {
  console.log('2) Entry-by-entry decode');

  for (let index = 0; index < TABLE_SLOT_COUNT; index += 1) {
    const record = recordFor(index);
    const valid = recordValidity(record);
    console.log(`\n   entry ${index} @ ${hex(record.base)}`);

    if (!valid) {
      const overlap = bytesAt(record.base, TABLE_STRIDE) === bytesAt(RECORD_OVERLAP_CODE, TABLE_STRIDE);
      console.log('     status: not a valid descriptor record');
      console.log(`     reason: selector=${hex(record.selector)}, slot pointers do not form sane ROM targets`);
      if (overlap) {
        console.log(`     note: these 12 bytes exactly match the prologue of ${hex(RECORD_OVERLAP_CODE)} (${labelForAddr(RECORD_OVERLAP_CODE)}).`);
      }
      console.log('     implication: selector 2 lands in code, not in a third LCD/text mode struct.');
      continue;
    }

    console.log(`     field +0 : selector/id = ${record.selector}`);
    console.log(`     field +3 : ${hex(record.slot3)} (${labelForAddr(record.slot3) || 'draw hook'})`);
    console.log(`     field +6 : ${hex(record.slot6)} (${labelForAddr(record.slot6) || 'metric hook'})`);
    console.log(`     field +9 : ${hex(record.slot9)} (${labelForAddr(record.slot9) || 'metric hook'})`);

    for (const [slotOffset, addr] of [[3, record.slot3], [6, record.slot6], [9, record.slot9]]) {
      const analysis = analyzeHelper(addr);
      const role = describeHelper(slotOffset, addr, analysis);
      const calls = analysis.calls.map((target) => `${hex(target)}${HELPER_NAMES.has(target) ? ` [${HELPER_NAMES.get(target)}]` : ''}`);
      const reads = analysis.reads.map((addr24) => `${hex(addr24)} [${STATE_LABELS.get(addr24)}]`);
      const writes = analysis.writes.map((addr24) => `${hex(addr24)} [${STATE_LABELS.get(addr24)}]`);

      console.log(`       slot +${slotOffset}: ${role}`);
      if (analysis.constantHl !== null) {
        console.log(`         evidence: body is effectively \`LD HL, ${hex(analysis.constantHl)} ; RET\``);
      }
      if (calls.length) {
        console.log(`         calls: ${calls.join(', ')}`);
      }
      if (reads.length) {
        console.log(`         direct LCD/global reads: ${reads.join(', ')}`);
      }
      if (writes.length) {
        console.log(`         direct LCD/global writes: ${writes.join(', ')}`);
      }
    }

    if (index === 0) {
      console.log('     hypothesis: variable-width small-font render descriptor.');
    } else if (index === 1) {
      console.log('     hypothesis: fixed-width 12x15-style render descriptor.');
    }
  }

  console.log('');
}

function printFieldConsumers() {
  console.log('3) How each 3-byte field is consumed');

  for (const slot of SLOT_CONSUMERS) {
    console.log(`\n   record[+${slot.offset}] -> ${hex(slot.consumer)} (${labelForAddr(slot.consumer)})`);
    console.log(`     role: ${slot.role}`);
    console.log(`     evidence: ${slot.evidence}`);

    let pc = slot.consumer;
    for (let i = 0; i < 5; i += 1) {
      const inst = decodeSafe(pc);
      if (!inst || !inst.length) {
        break;
      }
      console.log(`       ${hex(inst.pc)}: ${bytesAt(inst.pc, inst.length).padEnd(20)} ${formatInstruction(inst)}`);
      if (inst.tag === 'ret' || inst.tag === 'jp-indirect') {
        break;
      }
      pc = nextPc(inst);
    }
  }

  console.log('\n   takeaway: the table bytes are not raw geometry values. They are a selector/id plus three callable hooks.');
  console.log('');
}

function printSharedStateInit() {
  console.log('4) Boot-path continuation at 0x05519F: shared LCD/text state init');
  console.log('   Boot uses selector 0, then initializes shared render state outside the table.\n');

  let pc = BOOT_SLOW_PATH;
  for (let i = 0; i < 26; i += 1) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) {
      break;
    }
    const addr24 = normalizeAddr(inst.addr, inst.modePrefix);
    const annotation = STATE_LABELS.has(addr24) ? ` ; ${STATE_LABELS.get(addr24)}` : '';
    console.log(`   ${hex(inst.pc)}: ${bytesAt(inst.pc, inst.length).padEnd(20)} ${formatInstruction(inst)}${annotation}`);
    if (inst.tag === 'ret') {
      break;
    }
    pc = nextPc(inst);
  }

  const geom = rom.subarray(BOOT_COPY_SOURCE, BOOT_COPY_SOURCE + BOOT_COPY_LEN);
  const width = read24(geom, 0);
  const height = read24(geom, 3);
  const modeByte = geom[6] ?? 0;
  const stride = read24(geom, 7);
  const vramBase = read24(geom, 10);

  console.log('\n   Shared geometry copied by `LDIR` from 0x05550C to D02FD9..D02FE5:');
  console.log(`     raw bytes: ${bytesToHex(geom)}`);
  console.log(`     D02FD9 = ${hex(width)} (${width}) -> width`);
  console.log(`     D02FDC = ${hex(height)} (${height}) -> height`);
  console.log(`     D02FDF = ${hexByte(modeByte)} -> mode/format byte`);
  console.log(`     D02FE0 = ${hex(stride)} (${stride}) -> stride`);
  console.log(`     D02FE3 = ${hex(vramBase)} -> VRAM base`);

  console.log('\n   Important mapping result:');
  console.log('     none of the 12-byte table entries directly encode 320, 240, 640, or 0xD40000.');
  console.log('     those LCD geometry values come from the separate 13-byte blob at 0x05550C,');
  console.log('     while the table at 0x0525D4 selects which render/metric hooks will consume that shared state.');
  console.log('');
}

function printCallers() {
  console.log('5) All ROM callers/jumpers to 0x055316');

  const callers = findSelectorCallers();

  for (const caller of callers) {
    const arg = inferCallerArg(caller.pc, caller.type, caller.rows);
    console.log(`\n   ${hex(caller.pc)}: ${caller.type} ${hex(SELECTOR_FUNC)} -> ${arg}`);
    const context = caller.rows.filter((row) => row.pc >= caller.pc - 12 && row.pc <= caller.pc + 4);
    for (const row of context) {
      const mark = row.pc === caller.pc ? '>>' : '  ';
      console.log(`${mark} ${hex(row.pc)}: ${bytesAt(row.pc, row.inst.length).padEnd(20)} ${formatInstruction(row.inst)}`);
    }
  }

  console.log('\n   direct immediate selectors observed in ROM callers: 0 and 1');
  console.log('   no caller in the ROM image pushes immediate selector 2.');
  console.log('   the only non-immediate path is 0x09ED5E, which forwards a runtime 24-bit value from (IX+12).');
  console.log('');
}

function printConclusions() {
  console.log('6) Conclusions');
  console.log('   - Entries 0 and 1 are valid 12-byte render descriptors: selector/id + draw hook + width hook + height hook.');
  console.log('   - Entry 0 selects a variable-width small-font path; entry 1 selects a fixed-width 12x15-style path.');
  console.log('   - The apparent "entry 2" at 0x0525EC is just code overlap and is not used by any direct ROM caller.');
  console.log('   - The shared LCD geometry is initialized separately at 0x05519F/0x0551FB from ROM blob 0x05550C: 320x240, mode 0x10, stride 640, VRAM 0xD40000.');
  console.log('   - So the bytes at 0x0525D4 do not describe full-screen vs split-screen LCD modes directly.');
  console.log('     They describe which text/render hooks run against one shared LCD state block.');
}

console.log(`ROM size: ${hex(rom.length, 8)} bytes\n`);
printHexDump();
printTableDecode();
printFieldConsumers();
printSharedStateInit();
printCallers();
printConclusions();
