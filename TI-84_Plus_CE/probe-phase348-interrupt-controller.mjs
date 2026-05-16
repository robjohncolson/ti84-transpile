#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ROM_SCAN_END = 0x400000;

const MAIN_START = 0x0019BE;
const MAIN_END = 0x001A50;

const POST_HALT_WINDOWS = [
  {
    label: 'Main dispatcher 0x0019BE..0x001A50',
    start: 0x0019BE,
    end: 0x001A50,
    seed: {},
  },
  {
    label: 'Byte1 bit6 service 0x001A4B..0x001A5B',
    start: 0x001A4B,
    end: 0x001A5C,
    seed: { b: 0x50, c: 0x09 },
  },
  {
    label: 'Byte2 bit3 service 0x001A5D..0x001A75',
    start: 0x001A5D,
    end: 0x001A76,
    seed: { b: 0x50, c: 0x0A },
  },
  {
    label: 'Byte1 bit5 service 0x001A77..0x001A8B',
    start: 0x001A77,
    end: 0x001A8C,
    seed: { b: 0x50, c: 0x09 },
  },
  {
    label: 'Byte1 bit4 service 0x001A8D..0x001AA1',
    start: 0x001A8D,
    end: 0x001AA2,
    seed: { b: 0x50, c: 0x09 },
  },
  {
    label: 'Byte0 bit3 service 0x001AA3..0x001AB7',
    start: 0x001AA3,
    end: 0x001AB8,
    seed: { b: 0x50, c: 0x08 },
  },
  {
    label: 'Byte1 bit2 service 0x001ABB..0x001ACB',
    start: 0x001ABB,
    end: 0x001ACC,
    seed: { b: 0x50, c: 0x09 },
  },
  {
    label: 'Byte0 bit4 service 0x001ACF..0x001AF6',
    start: 0x001ACF,
    end: 0x001AF7,
    seed: { b: 0x50, c: 0x08 },
  },
  {
    label: 'Byte1 bit5 callee 0x009B35..0x009B3D',
    start: 0x009B35,
    end: 0x009B3E,
    seed: {},
  },
];

const PORT_NOTES = new Map([
  [0x5000, 'raw status byte 0'],
  [0x5001, 'raw status byte 1'],
  [0x5002, 'raw status byte 2'],
  [0x5004, 'enable-mask byte 0'],
  [0x5005, 'enable-mask byte 1'],
  [0x5006, 'enable-mask byte 2'],
  [0x5008, 'acknowledge byte 0'],
  [0x5009, 'acknowledge byte 1'],
  [0x500A, 'acknowledge byte 2'],
  [0x500C, 'controller/latch control byte 0'],
  [0x500D, 'controller/latch control byte 1'],
  [0x5010, 'signal inversion byte 0'],
  [0x5011, 'signal inversion byte 1'],
  [0x5012, 'signal inversion byte 2'],
  [0x5014, 'masked status byte 0'],
  [0x5015, 'masked status byte 1'],
  [0x5016, 'masked status byte 2'],
]);

const STATUS_PORTS = new Set([0x5014, 0x5015, 0x5016]);
const ACK_PORTS = new Set([0x5008, 0x5009, 0x500A]);
const ENABLE_PORTS = new Set([0x5004, 0x5005, 0x5006]);

const SCAN_FIRST_BYTES = new Set([0x01, 0x40, 0x49, 0x52, 0x5B]);
const MAX_LINEAR_SCAN_INSTRUCTIONS = 48;

const rom = fs.readFileSync(ROM_PATH);
const scanEnd = Math.min(ROM_SCAN_END, rom.length);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function hexWord(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}`;
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function disp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function bytesFor(start, length) {
  return Array.from(
    rom.slice(start, start + length),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()}.${text}` : text;
}

function formatInstruction(inst) {
  if (!inst) {
    return 'DB ?';
  }

  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'NOP');
    case 'di': return withPrefix(inst, 'DI');
    case 'ei': return withPrefix(inst, 'EI');
    case 'halt': return withPrefix(inst, 'HALT');
    case 'reti': return withPrefix(inst, 'RETI');
    case 'retn': return withPrefix(inst, 'RETN');
    case 'ret': return withPrefix(inst, 'RET');
    case 'ret-conditional': return withPrefix(inst, `RET ${String(inst.condition).toUpperCase()}`);
    case 'im': return withPrefix(inst, `IM ${inst.value}`);
    case 'jp': return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `JP (${String(inst.indirectRegister).toUpperCase()})`);
    case 'jr': return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'call': return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'rst': return withPrefix(inst, `RST ${hexByte(inst.target)}`);
    case 'push': return withPrefix(inst, `PUSH ${String(inst.pair).toUpperCase()}`);
    case 'pop': return withPrefix(inst, `POP ${String(inst.pair).toUpperCase()}`);
    case 'exx': return withPrefix(inst, 'EXX');
    case 'ex-af': return withPrefix(inst, "EX AF, AF'");
    case 'ex-de-hl': return withPrefix(inst, 'EX DE, HL');
    case 'ex-sp-hl': return withPrefix(inst, 'EX (SP), HL');
    case 'rla': return withPrefix(inst, 'RLA');
    case 'rra': return withPrefix(inst, 'RRA');
    case 'rlca': return withPrefix(inst, 'RLCA');
    case 'rrca': return withPrefix(inst, 'RRCA');
    case 'cpl': return withPrefix(inst, 'CPL');
    case 'scf': return withPrefix(inst, 'SCF');
    case 'ccf': return withPrefix(inst, 'CCF');
    case 'neg': return withPrefix(inst, 'NEG');
    case 'ld-pair-imm':
      return withPrefix(
        inst,
        `LD ${String(inst.pair).toUpperCase()}, ${inst.value <= 0xFFFF ? hexWord(inst.value) : hex(inst.value)}`,
      );
    case 'ld-pair-mem':
      return withPrefix(inst, `LD ${String(inst.pair).toUpperCase()}, (${inst.addr <= 0xFFFF ? hexWord(inst.addr) : hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${inst.addr <= 0xFFFF ? hexWord(inst.addr) : hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()}, (${inst.addr <= 0xFFFF ? hexWord(inst.addr) : hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${inst.addr <= 0xFFFF ? hexWord(inst.addr) : hex(inst.addr)}), ${String(inst.src).toUpperCase()}`);
    case 'ld-sp-hl': return withPrefix(inst, 'LD SP, HL');
    case 'ld-sp-pair': return withPrefix(inst, `LD SP, ${String(inst.pair).toUpperCase()}`);
    case 'ld-special': return withPrefix(inst, `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`);
    case 'inc-pair': return withPrefix(inst, `INC ${String(inst.pair).toUpperCase()}`);
    case 'dec-pair': return withPrefix(inst, `DEC ${String(inst.pair).toUpperCase()}`);
    case 'inc-reg': return withPrefix(inst, `INC ${String(inst.reg).toUpperCase()}`);
    case 'dec-reg': return withPrefix(inst, `DEC ${String(inst.reg).toUpperCase()}`);
    case 'add-pair': return withPrefix(inst, `ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`);
    case 'adc-pair': return withPrefix(inst, `ADC HL, ${String(inst.src).toUpperCase()}`);
    case 'sbc-pair': return withPrefix(inst, `SBC HL, ${String(inst.src).toUpperCase()}`);
    case 'alu-imm': return withPrefix(inst, `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`);
    case 'rotate-reg': return withPrefix(inst, `${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`);
    case 'bit-test': return withPrefix(inst, `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`);
    case 'bit-res': return withPrefix(inst, `RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`);
    case 'bit-set': return withPrefix(inst, `SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`);
    case 'indexed-cb-res':
      return withPrefix(inst, `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`);
    case 'indexed-cb-set':
      return withPrefix(inst, `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`);
    case 'out-reg': return withPrefix(inst, `OUT (C), ${String(inst.reg).toUpperCase()}`);
    case 'in-reg': return withPrefix(inst, `IN ${String(inst.reg).toUpperCase()}, (C)`);
    case 'out0': return withPrefix(inst, `OUT0 (${hexByte(inst.port)}), ${String(inst.reg).toUpperCase()}`);
    case 'in0': return withPrefix(inst, `IN0 ${String(inst.reg).toUpperCase()}, (${hexByte(inst.port)})`);
    default:
      return withPrefix(inst, String(inst.tag ?? '???').toUpperCase());
  }
}

function decodeSafe(pc) {
  if (pc < 0 || pc >= rom.length) {
    return null;
  }
  try {
    const inst = decodeInstruction(rom, pc, 'z80');
    if (!inst || !inst.length) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function portInRange(port) {
  return port >= 0x5000 && port <= 0x501F;
}

function currentPort(state) {
  if (!Number.isInteger(state.b) || !Number.isInteger(state.c)) {
    return null;
  }
  return (((state.b & 0xFF) << 8) | (state.c & 0xFF)) >>> 0;
}

function cloneSeed(seed) {
  return {
    b: Number.isInteger(seed?.b) ? (seed.b & 0xFF) : null,
    c: Number.isInteger(seed?.c) ? (seed.c & 0xFF) : null,
    a: Number.isInteger(seed?.a) ? (seed.a & 0xFF) : null,
  };
}

function isAWrite(inst) {
  if (!inst) return false;
  switch (inst.tag) {
    case 'ld-reg-imm':
    case 'ld-reg-reg':
    case 'ld-reg-ind':
    case 'ld-reg-mem':
    case 'ld-special':
      return String(inst.dest).toLowerCase() === 'a';
    case 'in-reg':
      return String(inst.reg).toLowerCase() === 'a';
    case 'in0':
      return String(inst.reg).toLowerCase() === 'a';
    case 'alu-imm':
      return String(inst.op).toLowerCase() !== 'cp';
    case 'alu-reg':
      return String(inst.op).toLowerCase() !== 'cp';
    case 'rla':
    case 'rra':
    case 'rlca':
    case 'rrca':
    case 'cpl':
    case 'neg':
      return true;
    case 'bit-set':
    case 'bit-res':
      return String(inst.reg).toLowerCase() === 'a';
    case 'inc-reg':
    case 'dec-reg':
      return String(inst.reg).toLowerCase() === 'a';
    default:
      return false;
  }
}

function detectABitMutation(inst) {
  if (!inst) return null;
  if (inst.tag === 'bit-set' && String(inst.reg).toLowerCase() === 'a') {
    return { op: 'set', bit: inst.bit };
  }
  if (inst.tag === 'bit-res' && String(inst.reg).toLowerCase() === 'a') {
    return { op: 'res', bit: inst.bit };
  }
  return null;
}

function updateTracker(state, inst) {
  if (!inst) {
    return;
  }

  if (inst.tag === 'ld-pair-imm' && String(inst.pair).toLowerCase() === 'bc') {
    const value = inst.value & 0xFFFF;
    state.b = (value >>> 8) & 0xFF;
    state.c = value & 0xFF;
  } else if (inst.tag === 'ld-reg-imm') {
    const dest = String(inst.dest).toLowerCase();
    if (dest === 'b') state.b = inst.value & 0xFF;
    if (dest === 'c') state.c = inst.value & 0xFF;
    if (dest === 'a') state.a = inst.value & 0xFF;
  } else if (inst.tag === 'ld-reg-reg') {
    const dest = String(inst.dest).toLowerCase();
    const src = String(inst.src).toLowerCase();
    if (dest === 'b') state.b = src === 'b' ? state.b : null;
    if (dest === 'c') state.c = src === 'c' ? state.c : null;
    if (dest === 'a') state.a = src === 'a' ? state.a : null;
  } else if (inst.tag === 'inc-reg' || inst.tag === 'dec-reg') {
    const reg = String(inst.reg).toLowerCase();
    const delta = inst.tag === 'inc-reg' ? 1 : -1;
    if (reg === 'b') state.b = Number.isInteger(state.b) ? ((state.b + delta) & 0xFF) : null;
    if (reg === 'c') state.c = Number.isInteger(state.c) ? ((state.c + delta) & 0xFF) : null;
    if (reg === 'a') state.a = Number.isInteger(state.a) ? ((state.a + delta) & 0xFF) : null;
  } else if (inst.tag === 'in-reg' && String(inst.reg).toLowerCase() === 'a') {
    state.a = null;
  } else if (inst.tag === 'in0' && String(inst.reg).toLowerCase() === 'a') {
    state.a = null;
  } else if (inst.tag === 'ld-special' && String(inst.dest).toLowerCase() === 'a') {
    state.a = null;
  } else if (inst.tag === 'bit-set' && String(inst.reg).toLowerCase() === 'a') {
    state.a = Number.isInteger(state.a) ? (state.a | (1 << inst.bit)) & 0xFF : null;
  } else if (inst.tag === 'bit-res' && String(inst.reg).toLowerCase() === 'a') {
    state.a = Number.isInteger(state.a) ? (state.a & ~(1 << inst.bit)) & 0xFF : null;
  } else if (inst.tag === 'alu-reg') {
    const op = String(inst.op).toLowerCase();
    const src = String(inst.src).toLowerCase();
    if (op === 'xor' && src === 'a') {
      state.a = 0x00;
    } else if (op === 'cp') {
      // No change to A.
    } else if (op === 'or' && src === 'a') {
      // No change to A.
    } else if (op === 'and' && src === 'a') {
      // No change to A.
    } else {
      state.a = null;
    }
  } else if (inst.tag === 'alu-imm') {
    const op = String(inst.op).toLowerCase();
    if (op === 'cp') {
      // No change to A.
    } else {
      state.a = null;
    }
  } else if (
    (inst.tag === 'ld-pair-mem' && String(inst.pair).toLowerCase() === 'bc')
    || (inst.tag === 'pop' && String(inst.pair).toLowerCase() === 'bc')
  ) {
    state.b = null;
    state.c = null;
  }
}

function stopLinearWalk(inst) {
  if (!inst) return true;
  return new Set([
    'ret',
    'ret-conditional',
    'reti',
    'retn',
    'rst',
    'jp',
    'jp-conditional',
    'jp-indirect',
    'jr',
    'jr-conditional',
    'djnz',
    'call',
    'call-conditional',
  ]).has(inst.tag);
}

function bitListFromValue(value) {
  const bits = [];
  for (let bit = 0; bit < 8; bit++) {
    if (((value >>> bit) & 1) !== 0) {
      bits.push(bit);
    }
  }
  return bits;
}

function formatBitList(bits) {
  const list = [...new Set(bits)].sort((a, b) => a - b);
  if (list.length === 0) return 'none';
  return list.map((bit) => `bit${bit}`).join(', ');
}

function formatMaskList(values) {
  const ordered = [...new Set(values)].sort((a, b) => a - b);
  if (ordered.length === 0) {
    return 'none';
  }
  return ordered.map((value) => `${hexByte(value)} [${formatBitList(bitListFromValue(value))}]`).join('; ');
}

function addToSetMap(map, key, value) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key).add(value);
}

function collectWindow(window) {
  const rows = [];
  const accesses = [];
  const statusTests = [];

  const state = cloneSeed(window.seed);
  let pendingStatusPort = null;
  let shiftKind = null;
  let shiftCount = 0;
  let lastABitMutation = null;

  for (let pc = window.start; pc < window.end;) {
    const inst = decodeSafe(pc);
    if (!inst) {
      break;
    }

    const raw = bytesFor(pc, inst.length);
    const text = formatInstruction(inst);
    const portBefore = currentPort(state);

    let access = null;
    if ((inst.tag === 'in-reg' || inst.tag === 'out-reg') && portInRange(portBefore ?? -1)) {
      access = {
        pc,
        port: portBefore,
        kind: inst.tag === 'in-reg' ? 'read' : 'write',
        reg: String(inst.reg).toLowerCase(),
        value: inst.tag === 'out-reg' && String(inst.reg).toLowerCase() === 'a' && Number.isInteger(state.a)
          ? (state.a & 0xFF)
          : null,
        bitMutation: null,
        source: window.label,
      };
      if (inst.tag === 'out-reg' && String(inst.reg).toLowerCase() === 'a' && lastABitMutation) {
        access.bitMutation = { ...lastABitMutation };
      }
    } else if ((inst.tag === 'in0' || inst.tag === 'out0') && (inst.port & 0xFF) <= 0x1F) {
      access = {
        pc,
        port: inst.port & 0xFF,
        kind: inst.tag === 'in0' ? 'read' : 'write',
        reg: String(inst.reg).toLowerCase(),
        value: inst.tag === 'out0' && String(inst.reg).toLowerCase() === 'a' && Number.isInteger(state.a)
          ? (state.a & 0xFF)
          : null,
        bitMutation: null,
        source: window.label,
        lowPort: true,
      };
      if (inst.tag === 'out0' && String(inst.reg).toLowerCase() === 'a' && lastABitMutation) {
        access.bitMutation = { ...lastABitMutation };
      }
    }

    if (access) {
      accesses.push(access);
    }

    if (access?.kind === 'read' && STATUS_PORTS.has(access.port) && access.lowPort !== true) {
      pendingStatusPort = access.port;
      shiftKind = null;
      shiftCount = 0;
    } else if (pendingStatusPort !== null) {
      if (inst.tag === 'rla' || inst.tag === 'rra') {
        const currentShiftKind = inst.tag === 'rla' ? 'left' : 'right';
        if (shiftKind === null) {
          shiftKind = currentShiftKind;
        }
        if (shiftKind === currentShiftKind) {
          shiftCount++;
        } else {
          pendingStatusPort = null;
          shiftKind = null;
          shiftCount = 0;
        }
      } else if (
        (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional')
        && String(inst.condition).toLowerCase() === 'c'
        && shiftKind
        && shiftCount > 0
      ) {
        const bit = shiftKind === 'left' ? (8 - shiftCount) : (shiftCount - 1);
        if (bit >= 0 && bit <= 7) {
          statusTests.push({
            pc,
            port: pendingStatusPort,
            bit,
            target: inst.target,
            source: window.label,
          });
        }
      } else if (isAWrite(inst)) {
        pendingStatusPort = null;
        shiftKind = null;
        shiftCount = 0;
      }
    }

    const bitMutation = detectABitMutation(inst);
    if (bitMutation) {
      lastABitMutation = bitMutation;
    } else if (isAWrite(inst)) {
      lastABitMutation = null;
    }

    rows.push({
      pc,
      raw,
      text,
      access,
    });

    updateTracker(state, inst);
    pc += inst.length;
  }

  return {
    window,
    rows,
    accesses,
    statusTests,
  };
}

function scanLinearBcSeeds() {
  const hits = [];

  for (let pc = 0; pc < scanEnd; pc++) {
    if (!SCAN_FIRST_BYTES.has(rom[pc])) {
      continue;
    }

    const seed = decodeSafe(pc);
    if (!seed || seed.tag !== 'ld-pair-imm' || String(seed.pair).toLowerCase() !== 'bc') {
      continue;
    }

    const value = seed.value & 0xFFFF;
    if (!portInRange(value)) {
      continue;
    }

    const state = { b: (value >>> 8) & 0xFF, c: value & 0xFF, a: null };
    let lastABitMutation = null;
    const localAccesses = [];
    let cursor = seed.nextPc;

    for (let step = 0; step < MAX_LINEAR_SCAN_INSTRUCTIONS && cursor < scanEnd; step++) {
      const inst = decodeSafe(cursor);
      if (!inst) {
        break;
      }

      const portBefore = currentPort(state);
      if ((inst.tag === 'in-reg' || inst.tag === 'out-reg') && portInRange(portBefore ?? -1)) {
        localAccesses.push({
          pc: cursor,
          port: portBefore,
          kind: inst.tag === 'in-reg' ? 'read' : 'write',
          reg: String(inst.reg).toLowerCase(),
          value: inst.tag === 'out-reg' && String(inst.reg).toLowerCase() === 'a' && Number.isInteger(state.a)
            ? (state.a & 0xFF)
            : null,
          bitMutation: inst.tag === 'out-reg' && String(inst.reg).toLowerCase() === 'a' && lastABitMutation
            ? { ...lastABitMutation }
            : null,
          source: `linear seed ${hex(pc)}`,
        });
      }

      const bitMutation = detectABitMutation(inst);
      if (bitMutation) {
        lastABitMutation = bitMutation;
      } else if (isAWrite(inst)) {
        lastABitMutation = null;
      }

      updateTracker(state, inst);
      cursor = inst.nextPc;

      if (stopLinearWalk(inst)) {
        break;
      }
    }

    if (localAccesses.length > 0) {
      hits.push({
        seedPc: pc,
        seedPort: value,
        accesses: localAccesses,
      });
    }
  }

  return hits;
}

function scanLowPortIn0Out0() {
  const hits = [];
  for (let pc = 0; pc + 2 < scanEnd; pc++) {
    if (rom[pc] !== 0xED) {
      continue;
    }
    const inst = decodeSafe(pc);
    if (!inst || (inst.tag !== 'in0' && inst.tag !== 'out0')) {
      continue;
    }
    const lowPort = inst.port & 0xFF;
    if (lowPort <= 0x1F) {
      hits.push({
        pc,
        port: lowPort,
        kind: inst.tag === 'in0' ? 'read' : 'write',
        reg: String(inst.reg).toLowerCase(),
      });
    }
  }
  return hits;
}

function summarizePortActivity(accesses, statusTests) {
  const ports = new Map();

  for (const access of accesses) {
    if (!ports.has(access.port)) {
      ports.set(access.port, {
        reads: [],
        writes: [],
        writeValues: new Set(),
        setBits: new Set(),
        clearedBits: new Set(),
        notes: new Set(),
      });
    }

    const entry = ports.get(access.port);
    if (access.kind === 'read') {
      entry.reads.push(access.pc);
    } else {
      entry.writes.push(access.pc);
      if (Number.isInteger(access.value)) {
        entry.writeValues.add(access.value & 0xFF);
      }
      if (access.bitMutation?.op === 'set') {
        entry.setBits.add(access.bitMutation.bit);
      }
      if (access.bitMutation?.op === 'res') {
        entry.clearedBits.add(access.bitMutation.bit);
      }
    }
    if (PORT_NOTES.has(access.port)) {
      entry.notes.add(PORT_NOTES.get(access.port));
    }
  }

  for (const test of statusTests) {
    if (!ports.has(test.port)) {
      ports.set(test.port, {
        reads: [],
        writes: [],
        writeValues: new Set(),
        setBits: new Set(),
        clearedBits: new Set(),
        notes: new Set(),
        testedBits: new Set(),
      });
    }
    const entry = ports.get(test.port);
    if (!entry.testedBits) {
      entry.testedBits = new Set();
    }
    entry.testedBits.add(test.bit);
  }

  return ports;
}

function formatPcList(pcs, limit = 6) {
  const ordered = [...new Set(pcs)].sort((a, b) => a - b);
  const shown = ordered.slice(0, limit).map((pc) => hex(pc));
  if (ordered.length > limit) {
    shown.push(`... +${ordered.length - limit} more`);
  }
  return shown.join(', ');
}

function buildRowComment(row) {
  if (!row.access) {
    return '';
  }

  if (row.access.lowPort) {
    const dir = row.access.kind === 'read' ? 'IN0' : 'OUT0';
    return ` ; ${dir} low port ${hexByte(row.access.port)}`;
  }

  const note = PORT_NOTES.get(row.access.port) ?? 'controller port';
  if (row.access.kind === 'read') {
    return ` ; read ${hexWord(row.access.port)} (${note})`;
  }

  const valuePart = Number.isInteger(row.access.value) ? ` <= ${hexByte(row.access.value)}` : '';
  return ` ; write ${hexWord(row.access.port)}${valuePart} (${note})`;
}

function printWindow(result) {
  console.log(`\n${result.window.label}`);
  console.log('-'.repeat(result.window.label.length));
  for (const row of result.rows) {
    const raw = row.raw.padEnd(14, ' ');
    console.log(`${hex(row.pc)}  ${raw}  ${row.text}${buildRowComment(row)}`);
  }
}

function printStatusSummary(statusTests) {
  const grouped = new Map();
  for (const test of statusTests) {
    addToSetMap(grouped, test.port, test.bit);
  }

  console.log('\nStatus-bit tests seen in the post-HALT handler');
  console.log('----------------------------------------------');
  for (const port of [...grouped.keys()].sort((a, b) => a - b)) {
    console.log(`  ${hexWord(port)} (${PORT_NOTES.get(port) ?? 'status'}): ${formatBitList([...grouped.get(port)])}`);
  }
}

function printControllerSummary(portSummary) {
  const ports = [...portSummary.keys()].sort((a, b) => a - b);

  console.log('\nInterrupt controller register map inferred from ROM use');
  console.log('------------------------------------------------------');

  console.log('Status (read):');
  for (const port of ports.filter((value) => STATUS_PORTS.has(value))) {
    const entry = portSummary.get(port);
    const testedBits = entry.testedBits ? [...entry.testedBits] : [];
    console.log(
      `  ${hexWord(port)} ${PORT_NOTES.get(port) ?? ''}: reads @ ${formatPcList(entry.reads)}`
      + `; tested ${formatBitList(testedBits)}`
    );
  }

  console.log('Acknowledge (write):');
  for (const port of ports.filter((value) => ACK_PORTS.has(value))) {
    const entry = portSummary.get(port);
    const masks = [...entry.writeValues];
    console.log(
      `  ${hexWord(port)} ${PORT_NOTES.get(port) ?? ''}: writes @ ${formatPcList(entry.writes)}`
      + `; observed masks ${formatMaskList(masks)}`
    );
  }

  console.log('Enable / Mask (read-write):');
  for (const port of ports.filter((value) => ENABLE_PORTS.has(value))) {
    const entry = portSummary.get(port);
    const setBits = [...entry.setBits];
    const clearedBits = [...entry.clearedBits];
    const details = [];
    if (entry.reads.length > 0) details.push(`reads @ ${formatPcList(entry.reads)}`);
    if (entry.writes.length > 0) details.push(`writes @ ${formatPcList(entry.writes)}`);
    if (setBits.length > 0) details.push(`set ${formatBitList(setBits)}`);
    if (clearedBits.length > 0) details.push(`clear ${formatBitList(clearedBits)}`);
    console.log(`  ${hexWord(port)} ${PORT_NOTES.get(port) ?? ''}: ${details.join('; ')}`);
  }

  const otherPorts = ports.filter((value) => !STATUS_PORTS.has(value) && !ACK_PORTS.has(value) && !ENABLE_PORTS.has(value));
  if (otherPorts.length > 0) {
    console.log('Other controller-range ports found by the ROM scan:');
    for (const port of otherPorts) {
      const entry = portSummary.get(port);
      const details = [];
      if (entry.reads.length > 0) details.push(`reads @ ${formatPcList(entry.reads)}`);
      if (entry.writes.length > 0) details.push(`writes @ ${formatPcList(entry.writes)}`);
      if (entry.setBits.size > 0) details.push(`set ${formatBitList([...entry.setBits])}`);
      if (entry.clearedBits.size > 0) details.push(`clear ${formatBitList([...entry.clearedBits])}`);
      console.log(`  ${hexWord(port)} ${PORT_NOTES.get(port) ?? 'controller-range port'}: ${details.join('; ')}`);
    }
  }
}

function printLinearCrossReference(seedHits) {
  console.log('\nROM-wide linear cross-reference from BC=0x50xx seeds');
  console.log('---------------------------------------------------');

  if (seedHits.length === 0) {
    console.log('  no controller-range IN/OUT(C) sites resolved from local BC seeds');
    return;
  }

  for (const hit of seedHits.slice(0, 32)) {
    console.log(`  seed ${hex(hit.seedPc)} -> ${hexWord(hit.seedPort)}`);
    for (const access of hit.accesses) {
      const portText = hexWord(access.port);
      const dir = access.kind === 'read' ? 'read' : 'write';
      const valueText = Number.isInteger(access.value) ? ` ${hexByte(access.value)}` : '';
      const bitText = access.bitMutation ? ` (${access.bitMutation.op} bit${access.bitMutation.bit})` : '';
      console.log(`    ${hex(access.pc)} ${dir} ${portText}${valueText}${bitText}`);
    }
  }

  if (seedHits.length > 32) {
    console.log(`  ... ${seedHits.length - 32} more seed windows`);
  }
}

function printLowPortSummary(lowPortHits) {
  console.log('\nDirect IN0/OUT0 low-port references (0x00..0x1F)');
  console.log('-----------------------------------------------');

  if (lowPortHits.length === 0) {
    console.log('  none');
    return;
  }

  const grouped = new Map();
  for (const hit of lowPortHits) {
    const key = hit.port & 0xFF;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(hit);
  }

  for (const port of [...grouped.keys()].sort((a, b) => a - b)) {
    const rows = grouped.get(port);
    const reads = rows.filter((row) => row.kind === 'read').map((row) => row.pc);
    const writes = rows.filter((row) => row.kind === 'write').map((row) => row.pc);
    const parts = [];
    if (reads.length > 0) parts.push(`reads @ ${formatPcList(reads)}`);
    if (writes.length > 0) parts.push(`writes @ ${formatPcList(writes)}`);
    console.log(`  ${hexByte(port)}: ${parts.join('; ')}`);
  }
}

const windowResults = POST_HALT_WINDOWS.map(collectWindow);
const windowAccesses = windowResults.flatMap((result) => result.accesses).filter((access) => access.lowPort !== true);
const statusTests = windowResults.flatMap((result) => result.statusTests);

const seedHits = scanLinearBcSeeds();
const seedAccesses = seedHits.flatMap((hit) => hit.accesses);
const lowPortHits = scanLowPortIn0Out0();

const combinedAccesses = [...windowAccesses, ...seedAccesses];
const portSummary = summarizePortActivity(combinedAccesses, statusTests);

console.log('Phase 348: interrupt-controller map');
console.log('===================================');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Main requested disassembly: ${hex(MAIN_START)}..${hex(MAIN_END)}`);
console.log(`ROM-wide scan limit: 0x000000..${hex(scanEnd - 1)}`);

for (const result of windowResults) {
  printWindow(result);
}

printStatusSummary(statusTests);
printControllerSummary(portSummary);
printLinearCrossReference(seedHits);
printLowPortSummary(lowPortHits);

console.log('\nAll controller-range ports found');
console.log('-------------------------------');
console.log(
  `  ${[...portSummary.keys()].sort((a, b) => a - b).map((port) => hexWord(port)).join(', ')}`
);
