#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MODE = 'adl';
const ENTRY = 0x03F994;
const MAX_INSTRUCTIONS = 200;
const MAX_BYTES = 0x200;
const DEFAULT_IY_BASE = 0xD00080;

const KEY_COMMIT_HELPER = 0x03F9FA;
const GETCSC_ENTRY = 0x03FA09;
const GETCSC_KEY_PATH = 0x03FB9A;
const KEY_BUFFER_WRITE = 0x03FBE1;

const RAM_START = 0xD00000;
const RAM_END = 0xD1FFFF;

const WATCHED_RAM = new Map([
  [0xD00587, 'kbdScanCode'],
  [0xD0058D, 'kbdLastKey'],
  [0xD141B5, 'keyBuffer'],
  [0xD14091, 'keyProcessingEnabled'],
  [0xD177B7, 'modeLatch'],
]);

const KNOWN_LABELS = new Map([
  [0x0003D4, 'KeypadScanFull vector'],
  [0x003CC2, 'matrix scanner core'],
  [KEY_COMMIT_HELPER, 'key commit helper'],
  [GETCSC_ENTRY, 'GetCSC / key processor entry'],
  [GETCSC_KEY_PATH, 'GetCSC key-present path'],
  [KEY_BUFFER_WRITE, 'keyBuffer writer'],
  [0xD00080, 'IY base flags'],
]);

const rom = readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesToHex(start, length) {
  const end = Math.min(rom.length, start + Math.max(length, 0));
  return Array.from(
    rom.subarray(start, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatSigned(value) {
  const normalized = Number(value ?? 0);
  const abs = Math.abs(normalized);
  return `${normalized >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toLowerCase()}${formatSigned(displacement)})`;
}

function withPrefix(inst, text) {
  if (!inst?.modePrefix) return text;
  return `.${String(inst.modePrefix).toUpperCase()} ${text}`;
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function safeDecode(pc) {
  try {
    const decoded = decodeInstruction(rom, pc, MODE);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      pc,
      nextPc: pc + 1,
      length: 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    case 'nop':
    case 'halt':
    case 'slp':
    case 'di':
    case 'ei':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
    case 'stmix':
    case 'rsmix':
    case 'exx':
      return upper(inst.tag);
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)},${hex(inst.target)}`;
    case 'rst':
      return `RST ${hexByte(inst.target ?? inst.vector ?? 0)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr ?? inst.address)}),${upper(inst.src)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr ?? inst.address)}),${upper(inst.pair)}`;
      }
      return `LD ${upper(inst.pair)},(${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr ?? inst.address)}),${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`;
    case 'ld-reg-ixd':
    case 'ld-reg-idx-disp':
      return `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
    case 'ld-idx-disp-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hexByte(inst.value)}`;
    case 'ld-ixiy-indexed':
      return `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}`;
    case 'ld-special':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-sp-hl':
      return 'LD SP,HL';
    case 'ld-sp-pair':
      return `LD SP,${upper(inst.pair)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-ixd':
      return `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'adc-pair':
      return `ADC HL,${upper(inst.src)}`;
    case 'sbc-pair':
      return `SBC HL,${upper(inst.src)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-ixd':
      return `${upper(inst.op)} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test':
      return `BIT ${inst.bit},${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit},(${upper(inst.indirectRegister)})`;
    case 'bit-set':
      return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set-ind':
      return `SET ${inst.bit},(${upper(inst.indirectRegister)})`;
    case 'bit-res':
      return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res-ind':
      return `RES ${inst.bit},(${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate':
      return `${upper(inst.operation ?? inst.op ?? 'rotate')} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg':
      return `${upper(inst.op)} ${upper(inst.reg)}`;
    case 'rotate-ind':
      return `${upper(inst.op)} (${upper(inst.indirectRegister)})`;
    case 'in-reg':
      return `IN ${upper(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${upper(inst.reg)}`;
    case 'in0':
      return `IN0 ${upper(inst.reg)},(${hexByte(inst.port)})`;
    case 'out0':
      return `OUT0 (${hexByte(inst.port)}),${upper(inst.reg)}`;
    case 'in-imm':
      return `IN A,(${hexByte(inst.port)})`;
    case 'out-imm':
      return `OUT (${hexByte(inst.port)}),A`;
    case 'ex-af':
      return "EX AF,AF'";
    case 'ex-de-hl':
      return 'EX DE,HL';
    case 'ex-sp-hl':
      return 'EX (SP),HL';
    case 'ex-sp-pair':
      return `EX (SP),${upper(inst.pair)}`;
    case 'im':
      return `IM ${inst.value}`;
    case 'mlt':
      return `MLT ${upper(inst.reg)}`;
    case 'tst-reg':
      return `TST A,${upper(inst.reg)}`;
    case 'tst-ind':
      return 'TST A,(HL)';
    case 'tst-imm':
      return `TST A,${hexByte(inst.value)}`;
    case 'tstio':
      return `TSTIO ${hexByte(inst.value)}`;
    case 'lea':
      return `LEA ${upper(inst.dest)},${formatIndexed(inst.base, inst.displacement)}`;
    case 'pea':
      return `PEA ${upper(inst.base)}${formatSigned(inst.displacement)}`;
    default:
      return upper(inst?.tag ?? '(decode failed)');
  }
}

function normalize24(value) {
  return Number.isFinite(Number(value)) ? (Number(value) & 0xFFFFFF) : null;
}

function isRamAddress(value) {
  return Number.isInteger(value) && value >= RAM_START && value <= RAM_END;
}

function describeAddress(addr) {
  if (WATCHED_RAM.has(addr)) return `${WATCHED_RAM.get(addr)} ${hex(addr)}`;
  if (KNOWN_LABELS.has(addr)) return `${KNOWN_LABELS.get(addr)} ${hex(addr)}`;
  return hex(addr);
}

function createPointerState() {
  return {
    bc: null,
    de: null,
    hl: null,
    sp: null,
    ix: null,
    iy: DEFAULT_IY_BASE,
  };
}

function cloneState(state) {
  return { ...state };
}

function resolvePointer(state, registerName) {
  const key = String(registerName ?? '').toLowerCase();
  if (!key) return null;
  const value = normalize24(state[key]);
  return Number.isInteger(value) ? value : null;
}

function resolveIndexed(state, baseRegister, displacement) {
  const base = resolvePointer(state, baseRegister);
  if (!Number.isInteger(base)) return null;
  return normalize24(base + Number(displacement ?? 0));
}

function addReference(list, seen, addr, access, via, detail) {
  if (!isRamAddress(addr)) return;
  const key = `${addr}:${access}:${via}:${detail}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push({ addr, access, via, detail });
}

function extractMemoryRefs(inst, stateBefore) {
  const refs = [];
  const seen = new Set();
  const directAddr = normalize24(inst?.addr ?? inst?.address);
  const directValue = normalize24(inst?.value);

  switch (inst?.tag) {
    case 'ld-pair-imm':
      addReference(refs, seen, directValue, 'ptr-load', upper(inst.pair), 'immediate RAM pointer');
      break;
    case 'ld-reg-mem':
      addReference(refs, seen, directAddr, 'read', 'abs', 'direct load');
      break;
    case 'ld-mem-reg':
      addReference(refs, seen, directAddr, 'write', 'abs', 'direct store');
      break;
    case 'ld-pair-mem':
      addReference(
        refs,
        seen,
        directAddr,
        inst.direction === 'to-mem' ? 'write' : 'read',
        'abs',
        inst.direction === 'to-mem' ? 'pair store' : 'pair load',
      );
      break;
    case 'ld-mem-pair':
      addReference(refs, seen, directAddr, 'write', 'abs', 'pair store');
      break;
    case 'ld-reg-ind': {
      const addr = resolvePointer(stateBefore, inst.src);
      addReference(refs, seen, addr, 'read', upper(inst.src), 'indirect load');
      break;
    }
    case 'ld-ind-reg': {
      const addr = resolvePointer(stateBefore, inst.dest);
      addReference(refs, seen, addr, 'write', upper(inst.dest), 'indirect store');
      break;
    }
    case 'ld-ind-imm': {
      const addr = resolvePointer(stateBefore, 'hl');
      addReference(refs, seen, addr, 'write', 'HL', 'indirect immediate store');
      break;
    }
    case 'ld-pair-indexed':
    case 'ld-ixiy-indexed': {
      const addr = resolveIndexed(stateBefore, inst.indexRegister, inst.displacement);
      addReference(refs, seen, addr, 'read', `${upper(inst.indexRegister)}${formatSigned(inst.displacement)}`, 'indexed load');
      break;
    }
    case 'ld-indexed-pair':
    case 'ld-indexed-ixiy':
    case 'ld-ixd-reg':
    case 'ld-idx-disp-reg':
    case 'ld-ixd-imm': {
      const addr = resolveIndexed(stateBefore, inst.indexRegister, inst.displacement);
      addReference(refs, seen, addr, 'write', `${upper(inst.indexRegister)}${formatSigned(inst.displacement)}`, 'indexed store');
      break;
    }
    case 'ld-reg-ixd':
    case 'ld-reg-idx-disp':
    case 'alu-ixd':
    case 'inc-ixd':
    case 'dec-ixd': {
      const addr = resolveIndexed(stateBefore, inst.indexRegister, inst.displacement);
      const access = inst.tag === 'inc-ixd' || inst.tag === 'dec-ixd' ? 'read/write' : 'read';
      addReference(refs, seen, addr, access, `${upper(inst.indexRegister)}${formatSigned(inst.displacement)}`, 'indexed access');
      break;
    }
    case 'alu-reg':
      if (inst.src === '(hl)') {
        const addr = resolvePointer(stateBefore, 'hl');
        addReference(refs, seen, addr, 'read', 'HL', 'ALU read');
      }
      break;
    case 'inc-reg':
    case 'dec-reg':
      if (inst.reg === '(hl)') {
        const addr = resolvePointer(stateBefore, 'hl');
        addReference(refs, seen, addr, 'read/write', 'HL', 'memory increment/decrement');
      }
      break;
    case 'bit-test-ind':
    case 'rotate-ind': {
      const addr = resolvePointer(stateBefore, inst.indirectRegister);
      addReference(refs, seen, addr, 'read', upper(inst.indirectRegister), 'indirect bit/rotate');
      break;
    }
    case 'bit-set-ind':
    case 'bit-res-ind': {
      const addr = resolvePointer(stateBefore, inst.indirectRegister);
      addReference(refs, seen, addr, 'read/write', upper(inst.indirectRegister), 'indirect bit write');
      break;
    }
    case 'indexed-cb-bit':
    case 'indexed-cb-rotate': {
      const addr = resolveIndexed(stateBefore, inst.indexRegister, inst.displacement);
      addReference(refs, seen, addr, 'read', `${upper(inst.indexRegister)}${formatSigned(inst.displacement)}`, 'indexed bit/rotate');
      break;
    }
    case 'indexed-cb-set':
    case 'indexed-cb-res': {
      const addr = resolveIndexed(stateBefore, inst.indexRegister, inst.displacement);
      addReference(refs, seen, addr, 'read/write', `${upper(inst.indexRegister)}${formatSigned(inst.displacement)}`, 'indexed bit write');
      break;
    }
    default:
      break;
  }

  return refs;
}

function invalidateMutablePointers(state) {
  state.bc = null;
  state.de = null;
  state.hl = null;
  state.sp = null;
  state.ix = null;
}

function applyInstructionState(inst, state) {
  switch (inst?.tag) {
    case 'ld-pair-imm':
      if (Object.hasOwn(state, String(inst.pair).toLowerCase())) {
        state[String(inst.pair).toLowerCase()] = normalize24(inst.value);
      }
      break;
    case 'inc-pair':
      if (Object.hasOwn(state, String(inst.pair).toLowerCase()) && state[String(inst.pair).toLowerCase()] !== null) {
        state[String(inst.pair).toLowerCase()] = normalize24(state[String(inst.pair).toLowerCase()] + 1);
      }
      break;
    case 'dec-pair':
      if (Object.hasOwn(state, String(inst.pair).toLowerCase()) && state[String(inst.pair).toLowerCase()] !== null) {
        state[String(inst.pair).toLowerCase()] = normalize24(state[String(inst.pair).toLowerCase()] - 1);
      }
      break;
    case 'add-pair': {
      const dest = String(inst.dest).toLowerCase();
      const src = String(inst.src).toLowerCase();
      if (Object.hasOwn(state, dest)) {
        if (state[dest] !== null && Object.hasOwn(state, src) && state[src] !== null) {
          state[dest] = normalize24(state[dest] + state[src]);
        } else {
          state[dest] = null;
        }
      }
      break;
    }
    case 'adc-pair':
    case 'sbc-pair':
    case 'ld-pair-mem':
    case 'ld-pair-indexed':
    case 'ld-pair-ind':
    case 'pop':
    case 'mlt':
      if (Object.hasOwn(state, String(inst.pair ?? inst.reg ?? '').toLowerCase())) {
        state[String(inst.pair ?? inst.reg).toLowerCase()] = null;
      }
      break;
    case 'ld-ixiy-indexed':
      if (Object.hasOwn(state, String(inst.dest).toLowerCase())) {
        state[String(inst.dest).toLowerCase()] = null;
      }
      break;
    case 'lea': {
      const dest = String(inst.dest).toLowerCase();
      const base = resolvePointer(state, inst.base);
      if (Object.hasOwn(state, dest)) {
        state[dest] = Number.isInteger(base) ? normalize24(base + Number(inst.displacement ?? 0)) : null;
      }
      break;
    }
    case 'ex-de-hl': {
      const tmp = state.de;
      state.de = state.hl;
      state.hl = tmp;
      break;
    }
    case 'ex-sp-hl':
      state.hl = null;
      state.sp = null;
      break;
    case 'ex-sp-pair':
      if (Object.hasOwn(state, String(inst.pair).toLowerCase())) {
        state[String(inst.pair).toLowerCase()] = null;
      }
      state.sp = null;
      break;
    case 'ld-sp-hl':
      state.sp = state.hl;
      break;
    case 'ld-sp-pair':
      state.sp = resolvePointer(state, inst.pair);
      break;
    case 'call':
    case 'call-conditional':
    case 'rst':
      invalidateMutablePointers(state);
      break;
    default:
      break;
  }
}

function isHardStop(inst) {
  return inst && (
    inst.tag === 'ret' ||
    inst.tag === 'reti' ||
    inst.tag === 'retn' ||
    inst.tag === 'halt' ||
    inst.tag === 'slp' ||
    inst.tag === 'jp' ||
    inst.tag === 'jp-indirect' ||
    inst.tag === 'jr' ||
    inst.tag === 'rst'
  );
}

function walkLinear(start, options = {}) {
  const maxInstructions = options.maxInstructions ?? MAX_INSTRUCTIONS;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const stopWhen = options.stopWhen ?? null;
  const sectionName = options.sectionName ?? hex(start);

  const rows = [];
  const state = createPointerState();
  let pc = start;
  let stopReason = 'limit';

  while (rows.length < maxInstructions && pc < rom.length && (pc - start) < maxBytes) {
    const inst = safeDecode(pc);
    const stateBefore = cloneState(state);
    const row = {
      sectionName,
      pc,
      inst,
      bytes: bytesToHex(pc, inst.length),
      text: withPrefix(inst, formatInstruction(inst)),
      memRefs: extractMemoryRefs(inst, stateBefore),
    };
    rows.push(row);

    applyInstructionState(inst, state);

    const customStop = stopWhen ? stopWhen(row, rows) : null;
    if (customStop) {
      stopReason = customStop;
      break;
    }

    if (isHardStop(inst)) {
      stopReason = `hard-stop:${inst.tag}`;
      break;
    }

    pc = inst.nextPc & 0xFFFFFF;
  }

  const endPc = rows.length ? (rows.at(-1).pc + (rows.at(-1).inst?.length ?? 1)) : start;
  return {
    name: sectionName,
    start,
    rows,
    endPc,
    spanBytes: endPc - start,
    stopReason,
  };
}

function rowNotes(row) {
  const notes = [];
  const target = normalize24(row.inst?.target);
  if (Number.isInteger(target) && (row.inst.tag.startsWith('call') || row.inst.tag.startsWith('jp') || row.inst.tag.startsWith('jr') || row.inst.tag === 'djnz' || row.inst.tag === 'rst')) {
    const label = KNOWN_LABELS.get(target);
    notes.push(`${upper(row.inst.tag)} -> ${hex(target)}${label ? ` ${label}` : ''}`);
  }
  if (row.memRefs.length) {
    const refs = row.memRefs.map((ref) => `${ref.access} ${describeAddress(ref.addr)} via ${ref.via}`);
    notes.push(refs.join(', '));
  }
  if (row.inst?.decodeError) {
    notes.push(`decodeError=${row.inst.decodeError}`);
  }
  return notes.length ? ` ; ${notes.join(' | ')}` : '';
}

function printSection(title, section) {
  console.log(title);
  for (const row of section.rows) {
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${rowNotes(row)}`);
  }
  console.log(`  -> stop: ${section.stopReason}, span=${hex(section.start)}..${hex(section.endPc - 1)} (${section.spanBytes} bytes)`);
  console.log('');
}

function collectReferences(sections) {
  const map = new Map();
  for (const section of sections) {
    for (const row of section.rows) {
      for (const ref of row.memRefs) {
        if (!map.has(ref.addr)) map.set(ref.addr, []);
        map.get(ref.addr).push({
          section: section.name,
          pc: row.pc,
          access: ref.access,
          via: ref.via,
        });
      }
    }
  }
  return map;
}

function printReferenceGroup(title, addresses, refsByAddr) {
  console.log(title);
  for (const addr of addresses) {
    const refs = refsByAddr.get(addr) ?? [];
    if (refs.length === 0) {
      console.log(`  ${describeAddress(addr)}: (not seen)`);
      continue;
    }

    const unique = [];
    const seen = new Set();
    for (const ref of refs) {
      const key = `${ref.section}:${ref.pc}:${ref.access}:${ref.via}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(`${hex(ref.pc)} ${ref.access} via ${ref.via} [${ref.section}]`);
    }
    console.log(`  ${describeAddress(addr)}: ${unique.join('; ')}`);
  }
  console.log('');
}

function printCallSummary(section) {
  const functionStart = section.start;
  const functionEnd = section.endPc;
  const calls = section.rows.filter((row) => row.inst?.tag === 'call' || row.inst?.tag === 'call-conditional');

  console.log('CALL targets inside 0x03F994 linear block');
  if (calls.length === 0) {
    console.log('  (none)');
  } else {
    for (const row of calls) {
      const target = normalize24(row.inst.target);
      const classification = Number.isInteger(target) && target >= functionStart && target < functionEnd
        ? 'inside range'
        : 'external';
      const label = KNOWN_LABELS.get(target);
      console.log(`  ${hex(row.pc)} -> ${hex(target)}  ${classification}${label ? `  ${label}` : ''}`);
    }
  }
  console.log('');
}

function printTailSummary(section) {
  const transfers = section.rows.filter((row) => (
    row.inst?.tag === 'jp' ||
    row.inst?.tag === 'jp-conditional' ||
    row.inst?.tag === 'jp-indirect' ||
    row.inst?.tag === 'jr' ||
    row.inst?.tag === 'jr-conditional' ||
    row.inst?.tag === 'djnz'
  ));

  console.log('Jump/branch targets in 0x03F994 linear block');
  if (transfers.length === 0) {
    console.log('  (none)');
  } else {
    for (const row of transfers) {
      const target = normalize24(row.inst.target);
      const label = Number.isInteger(target) ? KNOWN_LABELS.get(target) : null;
      if (Number.isInteger(target)) {
        console.log(`  ${hex(row.pc)} ${upper(row.inst.tag)} -> ${hex(target)}${label ? `  ${label}` : ''}`);
      } else {
        console.log(`  ${hex(row.pc)} ${upper(row.inst.tag)}`);
      }
    }
  }
  console.log('');
}

function firstPcWithAddress(section, addr) {
  for (const row of section.rows) {
    for (const ref of row.memRefs) {
      if (ref.addr === addr) return row.pc;
    }
  }
  return null;
}

function main() {
  const mainTrace = walkLinear(ENTRY, {
    maxInstructions: MAX_INSTRUCTIONS,
    maxBytes: MAX_BYTES,
    sectionName: '0x03F994 main',
  });

  const vectorPreview = walkLinear(0x0003D4, {
    maxInstructions: 4,
    maxBytes: 0x20,
    sectionName: '0x0003D4 vector',
  });

  const commitPreview = walkLinear(KEY_COMMIT_HELPER, {
    maxInstructions: 16,
    maxBytes: 0x20,
    sectionName: '0x03F9FA commit helper',
  });

  const getCSCPreview = walkLinear(GETCSC_ENTRY, {
    maxInstructions: 16,
    maxBytes: 0x30,
    sectionName: '0x03FA09 entry',
  });

  const keyPathPreview = walkLinear(GETCSC_KEY_PATH, {
    maxInstructions: 48,
    maxBytes: 0x80,
    sectionName: '0x03FB9A key path',
    stopWhen: (row) => (row.pc === KEY_BUFFER_WRITE ? 'reached D141B5 write' : null),
  });

  const refsMain = collectReferences([mainTrace]);
  const refsAll = collectReferences([mainTrace, commitPreview, getCSCPreview, keyPathPreview]);

  const d00587WritePc = firstPcWithAddress(commitPreview, 0xD00587);
  const d141b5WritePc = firstPcWithAddress(keyPathPreview, 0xD141B5);
  const tailJump = mainTrace.rows.find((row) => row.inst?.tag === 'jp');
  const getCSCJump = getCSCPreview.rows.find((row) => row.inst?.tag === 'jp-conditional' && normalize24(row.inst.target) === GETCSC_KEY_PATH);

  console.log('Phase 459 - 0x03F994 KbdScan / debounce helper trace');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Entry: ${hex(ENTRY)}`);
  console.log(`Mode: ${MODE}`);
  console.log(`Linear limit: ${MAX_INSTRUCTIONS} instructions / ${hex(MAX_BYTES)} bytes`);
  console.log(`Indexed-address note: (IY+d) previews assume the standard TI-OS IY base ${hex(DEFAULT_IY_BASE)}.`);
  console.log('');

  printSection('=== 0x03F994 Linear Trace ===', mainTrace);
  printSection('=== CALL Target Preview: 0x0003D4 ===', vectorPreview);
  printSection('=== Tail-JP Preview: 0x03F9FA ===', commitPreview);
  printSection('=== Adjacent GetCSC Entry: 0x03FA09 ===', getCSCPreview);
  printSection('=== GetCSC Key-Present Path: 0x03FB9A -> D141B5 ===', keyPathPreview);

  console.log('=== Summary ===');
  console.log(`Function size: ${mainTrace.spanBytes} bytes (${hex(mainTrace.start)}..${hex(mainTrace.endPc - 1)})`);
  console.log(`Instruction count: ${mainTrace.rows.length}`);
  console.log(`Linear stop reason: ${mainTrace.stopReason}`);
  console.log('');

  printCallSummary(mainTrace);
  printTailSummary(mainTrace);

  printReferenceGroup(
    'RAM references inside 0x03F994',
    [...refsMain.keys()].sort((a, b) => a - b),
    refsMain,
  );

  printReferenceGroup(
    'Requested watch addresses across traced slices',
    [...WATCHED_RAM.keys()],
    refsAll,
  );

  console.log('Relationship to 0x03FA09');
  console.log(`  - 0x03F994 does not CALL 0x03FA09 directly.`);
  console.log(`  - The only hard exit in the traced main block is ${hex(tailJump?.pc)}: JP ${hex(KEY_COMMIT_HELPER)} (${KNOWN_LABELS.get(KEY_COMMIT_HELPER)}).`);
  console.log(`  - ${hex(KEY_COMMIT_HELPER)} writes A to ${describeAddress(0xD00587)} at ${hex(d00587WritePc)} and mirrors nonzero A to ${describeAddress(0xD0058D)} before returning at 0x03FA08.`);
  console.log(`  - 0x03FA09 is the next entrypoint immediately after that RET. It drains ${describeAddress(0xD00587)} and at ${hex(getCSCJump?.pc)} conditionally jumps to ${hex(GETCSC_KEY_PATH)} when A != 0.`);
  console.log(`  - The traced key-to-buffer path is: 0x03F994 -> JP 0x03F9FA -> D00587/D0058D commit -> 0x03FA09 drains D00587 -> JP NZ 0x03FB9A -> ${hex(d141b5WritePc)} LD (${hex(0xD141B5)}),A.`);
  console.log('');

  console.log('Immediate behavior of 0x03F994');
  console.log('  - Calls the KeypadScanFull vector first, then compares / updates a small RAM cluster at D00588-D0058B.');
  console.log('  - Multiple conditional returns can stop before any key is committed.');
  console.log('  - Only the tail-JP path reaches the D00587 writer.');
}

main();
