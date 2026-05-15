#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const REGION_START = 0x02398E;
const REGION_END = 0x023A50;

const REG_STUB_START = 0x023B31;
const REG_STUB_END = 0x023BDC;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOPS = 32;

const IY_BASE = 0xD00080;
const TRACE_IX = 0xD1A860;
const TRACE_SP = 0xD1A87E - 3;
const SENTINEL_RET = 0x7FFFFE;

const D025CF = 0xD025CF;
const D025D2 = 0xD025D2;
const D02611 = 0xD02611;
const D025E1 = 0xD025E1;
const D025E4 = 0xD025E4;
const D025E7 = 0xD025E7;
const D025EA = 0xD025EA;
const D025ED = 0xD025ED;
const D025F6 = 0xD025F6;

const FLAG_IY52 = IY_BASE + 52; // 0xD000B4
const FLAG_IY53 = IY_BASE + 53; // 0xD000B5
const FLAG_IY54 = IY_BASE + 54; // 0xD000B6
const FLAG_IY58 = IY_BASE + 58; // 0xD000BA

const POINTER_SLOTS = [
  D02611,
  D025E1,
  D025E4,
  D025E7,
  D025EA,
  D025ED,
  D025F6,
];

const ROUTINE_SPECS = [
  { entry: 0x02398E, slot: D02611, label: 'slot bit1 wrapper' },
  { entry: 0x0239B3, slot: D025E1, label: 'slot bit4 wrapper' },
  { entry: 0x0239CD, slot: D025E4, label: 'slot bit2 wrapper' },
  { entry: 0x0239E3, slot: D025E7, label: 'slot bit3 wrapper' },
  { entry: 0x0239FE, slot: D025EA, label: 'slot bit4+IY58.1 wrapper' },
  { entry: 0x023A1C, slot: D025ED, label: 'font hook wrapper' },
  { entry: 0x023A35, slot: D025F6, label: 'slot IY54.0 wrapper' },
];

const HELPER_NOTES = new Map([
  [
    0x025758,
    'HL := *(slot), A := *(HL), IX := HL+1, CP A,0x83; Z path enters shared hook dispatcher at 0x025762.',
  ],
  [
    0x0238B2,
    'DE := *(slot), A := *(DE), D025D2 := DE+1, CP A,0x83; this variant also publishes the post-header pointer.',
  ],
]);

const NAME_MAP = new Map([
  [D025CF, 'D025CF'],
  [D025D2, 'D025D2'],
  [D02611, 'D02611'],
  [D025E1, 'D025E1'],
  [D025E4, 'D025E4'],
  [D025E7, 'D025E7'],
  [D025EA, 'D025EA'],
  [D025ED, 'D025ED'],
  [D025F6, 'D025F6'],
  [FLAG_IY52, 'IY+52 (0xD000B4)'],
  [FLAG_IY53, 'IY+53 (0xD000B5)'],
  [FLAG_IY54, 'IY+54 (0xD000B6)'],
  [FLAG_IY58, 'IY+58 (0xD000BA)'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hb(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hb(b)).join(' ');
}

function r24(buf, addr) {
  return (buf[addr] | (buf[addr + 1] << 8) | (buf[addr + 2] << 16)) >>> 0;
}

function w16(buf, addr, value) {
  buf[addr] = value & 0xFF;
  buf[addr + 1] = (value >>> 8) & 0xFF;
}

function w24(buf, addr, value) {
  buf[addr] = value & 0xFF;
  buf[addr + 1] = (value >>> 8) & 0xFF;
  buf[addr + 2] = (value >>> 16) & 0xFF;
}

function iyAddr(displacement) {
  return (IY_BASE + displacement) >>> 0;
}

function indexText(registerName, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(registerName).toUpperCase()}${sign}${displacement})`;
}

function decodeSafe(pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc, mode);
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function effectiveAddr(inst) {
  if (inst.addr === undefined) return null;
  if ((inst.modePrefix === 'sis' || inst.modePrefix === 'lis') && inst.addr <= 0xFFFF) {
    return (0xD00000 | inst.addr) >>> 0;
  }
  return inst.addr >>> 0;
}

function mnemonic(inst) {
  const p = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'push': return `${p}PUSH ${String(inst.pair ?? inst.reg ?? '?').toUpperCase()}`;
    case 'pop': return `${p}POP ${String(inst.pair ?? inst.reg ?? '?').toUpperCase()}`;
    case 'ld-pair-imm': return `${p}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, inst.value <= 0xFFFF ? 4 : 6)}`;
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? `${p}LD ${String(inst.pair).toUpperCase()}, (${hex(effectiveAddr(inst))})`
        : `${p}LD (${hex(effectiveAddr(inst))}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-ind': return `${p}LD ${String(inst.pair).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-reg-imm': return `${p}LD ${String(inst.dest).toUpperCase()}, ${hb(inst.value)}`;
    case 'ld-reg-reg': return `${p}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${p}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${p}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-mem-reg': return `${p}LD (${hex(effectiveAddr(inst) ?? inst.addr)}), ${String(inst.src ?? inst.reg ?? '?').toUpperCase()}`;
    case 'call': return `${p}CALL ${hex(inst.target)}`;
    case 'jp': return `${p}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}JP (${String(inst.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'jr': return `${p}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${p}RET`;
    case 'ret-conditional': return `${p}RET ${String(inst.condition).toUpperCase()}`;
    case 'inc-pair': return `${p}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${p}DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${p}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${p}DEC ${String(inst.reg).toUpperCase()}`;
    case 'alu-imm': return `${p}${String(inst.op).toUpperCase()} ${hb(inst.value)}`;
    case 'alu-reg': return `${p}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
    case 'indexed-cb-bit': return `${p}BIT ${inst.bit}, ${indexText(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${p}SET ${inst.bit}, ${indexText(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${p}RES ${inst.bit}, ${indexText(inst.indexRegister, inst.displacement)}`;
    case 'ex-de-hl': return `${p}EX DE, HL`;
    case 'mlt': return `${p}MLT ${String(inst.reg ?? inst.pair).toUpperCase()}`;
    case 'nop': return `${p}NOP`;
    case 'di': return `${p}DI`;
    default: return `${p}[${inst.tag}]`;
  }
}

function formatLine(inst) {
  const bytes = bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length)).padEnd(18);
  return `${hex(inst.pc)}: ${bytes} ${mnemonic(inst)}`;
}

function decodeRange(start, end) {
  const lines = [];
  let pc = start;
  while (pc < end) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) {
      lines.push(`${hex(pc)}: ${hb(rom[pc])}                DB ${hb(rom[pc])}`);
      pc += 1;
      continue;
    }
    lines.push(formatLine(inst));
    pc = nextPc(inst);
  }
  return lines;
}

function decodeRoutine(entry, maxInstructions = 32) {
  const insts = [];
  let pc = entry;
  for (let i = 0; i < maxInstructions; i += 1) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) break;
    insts.push(inst);
    pc = nextPc(inst);
    if (inst.tag === 'ret') break;
  }
  return insts;
}

function buildStubMap() {
  const map = new Map();
  let pc = REG_STUB_START;
  while (pc < REG_STUB_END) {
    const first = decodeSafe(pc);
    if (!first || !first.length) {
      pc += 1;
      continue;
    }
    const second = decodeSafe(nextPc(first));
    const third = second ? decodeSafe(nextPc(second)) : null;
    if (
      first.tag === 'ld-pair-mem' &&
      first.pair === 'hl' &&
      first.direction === 'to-mem' &&
      second?.tag === 'indexed-cb-set' &&
      third?.tag === 'ret'
    ) {
      const slot = effectiveAddr(first);
      map.set(slot, {
        entry: first.pc,
        slot,
        displacement: second.displacement,
        bit: second.bit,
        flagAddr: iyAddr(second.displacement),
      });
      pc = nextPc(third);
      continue;
    }
    pc = nextPc(first);
  }
  return map;
}

function analyzeRoutine(spec, stubMap) {
  const insts = decodeRoutine(spec.entry);
  const helper = insts.find((inst) => inst.tag === 'call')?.target ?? null;
  const clearOps = insts
    .filter((inst) => inst.tag === 'indexed-cb-res')
    .map((inst) => ({
      displacement: inst.displacement,
      bit: inst.bit,
      flagAddr: iyAddr(inst.displacement),
    }));

  const writes = [];
  for (let i = 0; i < insts.length; i += 1) {
    const inst = insts[i];
    const addr = effectiveAddr(inst);
    if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') {
      const imm = i > 0 ? insts[i - 1] : null;
      writes.push({
        addr,
        width: 3,
        value: imm?.tag === 'ld-pair-imm' && imm.pair === 'hl' ? imm.value : null,
      });
    }
  }

  return {
    ...spec,
    insts,
    helper,
    clearOps,
    writes,
    stub: stubMap.get(spec.slot) ?? null,
  };
}

function classifyBranchOpcode(op) {
  if (op === 0xCD) return 'CALL';
  if (op === 0xC3) return 'JP';
  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(op)) return 'CALL cc';
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(op)) return 'JP cc';
  return `OP ${hb(op)}`;
}

function scanBranchRefs(target) {
  const refs = [];
  for (let pc = 0; pc < rom.length - 3; pc += 1) {
    const op = rom[pc];
    if (
      op === 0xCD || op === 0xC3 ||
      [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(op) ||
      [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(op)
    ) {
      const imm = r24(rom, pc + 1);
      if (imm === target) refs.push({ pc, op, kind: classifyBranchOpcode(op) });
    }
  }
  return refs;
}

function scanSlotRefs(slot) {
  const lo = slot & 0xFF;
  const hi = (slot >>> 8) & 0xFF;
  const page = (slot >>> 16) & 0xFF;
  const refs = [];

  for (let pc = 0; pc < rom.length - 4; pc += 1) {
    if (rom[pc] === 0x21 && rom[pc + 1] === lo && rom[pc + 2] === hi && rom[pc + 3] === page) {
      refs.push({ pc, kind: 'LD HL, slot', slot });
    }
    if (rom[pc] === 0x11 && rom[pc + 1] === lo && rom[pc + 2] === hi && rom[pc + 3] === page) {
      refs.push({ pc, kind: 'LD DE, slot', slot });
    }
    if (rom[pc] === 0x01 && rom[pc + 1] === lo && rom[pc + 2] === hi && rom[pc + 3] === page) {
      refs.push({ pc, kind: 'LD BC, slot', slot });
    }
    if (rom[pc] === 0x22 && rom[pc + 1] === lo && rom[pc + 2] === hi && rom[pc + 3] === page) {
      refs.push({ pc, kind: 'LD (slot), HL', slot });
    }
    if (rom[pc] === 0x2A && rom[pc + 1] === lo && rom[pc + 2] === hi && rom[pc + 3] === page) {
      refs.push({ pc, kind: 'LD HL, (slot)', slot });
    }
    if (rom[pc] === 0x32 && rom[pc + 1] === lo && rom[pc + 2] === hi && rom[pc + 3] === page) {
      refs.push({ pc, kind: 'LD (slot), A', slot });
    }
    if (rom[pc] === 0x3A && rom[pc + 1] === lo && rom[pc + 2] === hi && rom[pc + 3] === page) {
      refs.push({ pc, kind: 'LD A, (slot)', slot });
    }
    if (
      rom[pc] === 0xED &&
      rom[pc + 1] === 0x53 &&
      rom[pc + 2] === lo &&
      rom[pc + 3] === hi &&
      rom[pc + 4] === page
    ) {
      refs.push({ pc, kind: 'LD (slot), DE', slot });
    }
    if (
      rom[pc] === 0xED &&
      rom[pc + 1] === 0x5B &&
      rom[pc + 2] === lo &&
      rom[pc + 3] === hi &&
      rom[pc + 4] === page
    ) {
      refs.push({ pc, kind: 'LD DE, (slot)', slot });
    }
  }

  refs.sort((a, b) => a.pc - b.pc);
  return refs;
}

function stopTrace(name) {
  const error = new Error('__PHASE329_STOP__');
  error.stopName = name;
  return error;
}

function installWatchHooks(cpu, watchSet, output) {
  const original = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  const maybeRecord = (list, addr, value, width) => {
    const a = addr & 0xFFFFFF;
    if (!watchSet.has(a)) return;
    list.push({ addr: a, value, width });
  };

  cpu.read8 = (addr) => {
    const value = original.read8(addr);
    maybeRecord(output.reads, addr, value & 0xFF, 1);
    return value;
  };
  cpu.read16 = (addr) => {
    const value = original.read16(addr);
    maybeRecord(output.reads, addr, value & 0xFFFF, 2);
    return value;
  };
  cpu.read24 = (addr) => {
    const value = original.read24(addr);
    maybeRecord(output.reads, addr, value & 0xFFFFFF, 3);
    return value;
  };

  cpu.write8 = (addr, value) => {
    original.write8(addr, value);
    maybeRecord(output.writes, addr, value & 0xFF, 1);
  };
  cpu.write16 = (addr, value) => {
    original.write16(addr, value);
    maybeRecord(output.writes, addr, value & 0xFFFF, 2);
  };
  cpu.write24 = (addr, value) => {
    original.write24(addr, value);
    maybeRecord(output.writes, addr, value & 0xFFFFFF, 3);
  };

  return () => {
    cpu.read8 = original.read8;
    cpu.read16 = original.read16;
    cpu.read24 = original.read24;
    cpu.write8 = original.write8;
    cpu.write16 = original.write16;
    cpu.write24 = original.write24;
  };
}

function createBootSnapshot() {
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  return {
    mem,
    result,
    postCpu: {
      a: executor.cpu.a & 0xFF,
      f: executor.cpu.f & 0xFF,
      sp: executor.cpu.sp & 0xFFFFFF,
      iy: executor.cpu.iy & 0xFFFFFF,
      madl: executor.cpu.madl,
      mbase: executor.cpu.mbase & 0xFF,
    },
  };
}

function traceRoutine(bootSnapshot, options) {
  const {
    label,
    entry,
    slot,
    flagAddr,
    flagBit,
    initialA,
    initialF,
    initialHL,
    seedPtr = null,
    seedBytes = [0x10, 0xAA, 0xBB, 0xCC],
  } = options;

  const mem = new Uint8Array(bootSnapshot.mem);
  const slotBefore = r24(mem, slot);

  if (seedPtr !== null) {
    w24(mem, slot, seedPtr);
    for (let i = 0; i < seedBytes.length; i += 1) {
      mem[(seedPtr + i) & 0xFFFFFF] = seedBytes[i] & 0xFF;
    }
  }

  mem[flagAddr] |= (1 << flagBit);

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  const cpu = executor.cpu;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.ix = TRACE_IX;
  cpu.sp = TRACE_SP;
  cpu.a = initialA & 0xFF;
  cpu.f = initialF & 0xFF;
  cpu.hl = initialHL & 0xFFFFFF;
  cpu.de = 0;
  cpu.bc = 0;

  w24(mem, cpu.sp, SENTINEL_RET);

  const pointerValue = r24(mem, slot);
  const watchSet = new Set([
    slot,
    slot + 1,
    slot + 2,
    flagAddr,
    D025CF,
    D025CF + 1,
    D025D2,
    D025D2 + 1,
    D025D2 + 2,
    0x000000,
    0x000001,
    0x000002,
  ]);
  for (let i = 0; i < 4; i += 1) {
    watchSet.add((pointerValue + i) & 0xFFFFFF);
  }

  const io = { reads: [], writes: [] };
  const restore = installWatchHooks(cpu, watchSet, io);
  const path = [];
  let termination = 'unknown';

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 32,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        if (path[path.length - 1] !== addr) path.push(addr);
        if (addr === SENTINEL_RET) throw stopTrace('sentinel');
      },
      onMissingBlock(pc) {
        const addr = pc & 0xFFFFFF;
        if (addr === SENTINEL_RET) throw stopTrace('sentinel');
      },
    });
    termination = result?.termination ?? 'completed';
  } catch (error) {
    if (error?.message === '__PHASE329_STOP__' && error.stopName === 'sentinel') {
      termination = 'sentinel-return';
    } else {
      restore();
      throw error;
    }
  }

  restore();

  return {
    label,
    entry,
    slot,
    seedPtr,
    seedBytes,
    slotBefore,
    slotAfter: r24(mem, slot),
    flagAddr,
    flagBit,
    flagBefore: (1 << flagBit),
    flagAfterByte: mem[flagAddr] & 0xFF,
    before: {
      a: initialA & 0xFF,
      f: initialF & 0xFF,
      hl: initialHL & 0xFFFFFF,
    },
    after: {
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      hl: cpu.hl & 0xFFFFFF,
      de: cpu.de & 0xFFFFFF,
      bc: cpu.bc & 0xFFFFFF,
      sp: cpu.sp & 0xFFFFFF,
      iy: cpu.iy & 0xFFFFFF,
    },
    path,
    reads: io.reads,
    writes: io.writes,
    d025cf: r24(mem, D025CF),
    d025d2: r24(mem, D025D2),
    pointerValue,
    pointerBytes: bytesToHex(mem.subarray(pointerValue, pointerValue + 4)),
    termination,
  };
}

function addrName(addr) {
  return NAME_MAP.get(addr) ?? hex(addr);
}

function formatEvent(event) {
  const widthHex = event.width === 1 ? 2 : event.width === 2 ? 4 : 6;
  return `${addrName(event.addr)} <= ${hex(event.value, widthHex)}`;
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printColdBoot(snapshot) {
  printSection('Cold Boot Snapshot');
  console.log(`boot entry: ${hex(BOOT_ENTRY)} (${BOOT_MODE})`);
  console.log(`termination: ${snapshot.result.termination}`);
  console.log(`last PC: ${hex(snapshot.result.lastPc ?? snapshot.result.pc ?? 0)}`);
  console.log(
    `post-boot CPU: A=${hb(snapshot.postCpu.a)} F=${hb(snapshot.postCpu.f)} ` +
    `SP=${hex(snapshot.postCpu.sp)} IY=${hex(snapshot.postCpu.iy)} ` +
    `MADL=${snapshot.postCpu.madl} MBASE=${hb(snapshot.postCpu.mbase)}`,
  );
  console.log('cold-boot slot values:');
  for (const slot of POINTER_SLOTS) {
    console.log(`  ${addrName(slot)} = ${hex(r24(snapshot.mem, slot))}`);
  }
  console.log('note: the traces below keep this boot RAM image, then switch back to the normal ADL helper calling convention (MADL=1, IY=0xD00080).');
}

function printRegionDisassembly() {
  printSection(`Static Disassembly ${hex(REGION_START)}..${hex(REGION_END - 1)}`);
  for (const line of decodeRange(REGION_START, REGION_END)) {
    console.log(`  ${line}`);
  }
}

function printRoutineSummary(routines) {
  printSection('Sibling Routine Map');
  console.log(`found ${routines.length} wrappers in the family by ${hex(REGION_END - 1)}:`);
  for (const routine of routines) {
    const clearText = routine.clearOps
      .map((op) => `${hex(op.flagAddr)} bit ${op.bit}`)
      .join(', ');
    const writeText = routine.writes
      .map((w) => `${addrName(w.addr)}${w.value !== null ? `=${hex(w.value, w.value <= 0xFFFF ? 4 : 6)}` : ''}`)
      .join(', ');
    console.log(`  ${hex(routine.entry)}: slot ${addrName(routine.slot)} via ${hex(routine.helper)}; clears ${clearText || 'n/a'}`);
    if (routine.stub) {
      console.log(`    paired registration stub: ${hex(routine.stub.entry)} sets ${hex(routine.stub.flagAddr)} bit ${routine.stub.bit}`);
    }
    if (routine.helper && HELPER_NOTES.has(routine.helper)) {
      console.log(`    helper note: ${HELPER_NOTES.get(routine.helper)}`);
    }
    if (writeText) {
      console.log(`    extra writes: ${writeText}`);
    }
  }
}

function print023A1CBranchAnalysis(routines) {
  const hook = routines.find((routine) => routine.entry === 0x023A1C);
  const clearer = routines.find((routine) => routine.entry === 0x02398E);

  printSection('0x023A1C Branch Analysis');
  for (const inst of hook.insts) {
    console.log(`  ${formatLine(inst)}`);
  }

  console.log('\n  branch summary:');
  console.log(`    slot read: ${addrName(hook.slot)} -> helper ${hex(hook.helper)}`);
  console.log('    Z path: first byte at the slot target is 0x83, so JP Z goes to 0x025762 (shared hook dispatcher).');
  console.log('    NZ path: AF and HL are restored, IX is restored, bit 5 in IY+53 is cleared, then RET.');

  console.log('\n  compared with 0x02398E:');
  console.log(`    ${hex(clearer.entry)} uses ${addrName(clearer.slot)} instead of ${addrName(hook.slot)}.`);
  console.log(`    ${hex(clearer.entry)} clears bit 1 in IY+53, ORs A with 0x01, and stores 0x0109 to ${addrName(D025CF)}.`);
  console.log(`    ${hex(hook.entry)} clears bit 5 in IY+53 only; it does not touch ${addrName(D025CF)} and it restores AF exactly.`);
  console.log('    conclusion: 0x023A1C is not the character translation itself. It is another slot-driven hook wrapper that font code calls when the bit-5 font hook is armed.');
}

function printSlotRefs(snapshot) {
  printSection('Pointer Slot Trace');
  console.log('cold-boot values are all zero, so the slots are not persistent font tables loaded at reset.');
  console.log('each slot is paired with a registration stub that stores caller-supplied HL and sets a matching IY bit.');

  for (const slot of POINTER_SLOTS) {
    const refs = scanSlotRefs(slot);
    console.log(`\n  ${addrName(slot)} = ${hex(r24(snapshot.mem, slot))}`);
    for (const ref of refs) {
      console.log(`    ${hex(ref.pc)} ${ref.kind}`);
    }
  }

  console.log('\n  interpretation:');
  console.log('    the slot family behaves like registered hook/thunk pointers, not font descriptor records.');
  console.log('    the shared helper 0x025758 dereferences the slot, reads byte 0 at the target, and compares it against 0x83.');
  console.log('    when byte 0 equals 0x83, control diverts into the shared hook path at 0x025762, which eventually jumps via IX=target+1.');
  console.log('    that is callback/thunk behavior, so these slots look like mode-registered handlers used by the font/key pipelines.');
}

function print023A1CCallers() {
  const refs = scanBranchRefs(0x023A1C);

  printSection('Callers Of 0x023A1C');
  for (const ref of refs) {
    console.log(`  ${hex(ref.pc)} ${ref.kind} ${hex(0x023A1C)}`);
  }

  console.log('\n  fixed-width path:');
  for (const line of decodeRange(0x07BF3E, 0x07BF5C)) {
    console.log(`    ${line}`);
  }

  console.log('\n  variable-width width/metric path:');
  for (const line of decodeRange(0x0A53FA, 0x0A5424)) {
    console.log(`    ${line}`);
  }

  console.log('\n  path summary:');
  console.log('    0x07BF47: fixed-width lookup 0x07BF3E calls 0x023A1C when BIT 5,(IY+53) is set.');
  console.log('    0x0A5408: the variable-width width/metric helper at 0x0A53FA calls 0x023A1C when BIT 5,(IY+53) is set.');
  console.log('    0x0A5424 itself does not call 0x023A1C directly; it only uses the bit-1 path through 0x02398E.');
  console.log('    0x020130 is the OS jump-table alias (JP 0x023A1C), not a font routine by itself.');
}

function printTrace(trace) {
  console.log(`\n  ${trace.label}`);
  console.log(`    entry: ${hex(trace.entry)} slot: ${addrName(trace.slot)} initial-slot=${hex(trace.slotBefore)} active-flag=${addrName(trace.flagAddr)} bit ${trace.flagBit}`);
  if (trace.seedPtr !== null) {
    console.log(`    seeded slot target: ${hex(trace.seedPtr)} bytes=${trace.seedBytes.map(hb).join(' ')}`);
  }
  console.log(
    `    before: A=${hb(trace.before.a)} F=${hb(trace.before.f)} HL=${hex(trace.before.hl)} ` +
    `slotTarget=${hex(trace.pointerValue)} flagByte=${hb(trace.flagBefore)}`,
  );
  console.log(
    `    after:  A=${hb(trace.after.a)} F=${hb(trace.after.f)} HL=${hex(trace.after.hl)} ` +
    `SP=${hex(trace.after.sp)} flagByte=${hb(trace.flagAfterByte)} ` +
    `${addrName(D025CF)}=${hex(trace.d025cf)} ${addrName(D025D2)}=${hex(trace.d025d2)}`,
  );
  console.log(`    pointer bytes: ${trace.pointerBytes}`);
  console.log(`    path: ${trace.path.map((pc) => hex(pc)).join(' -> ') || '(none)'}`);
  console.log(`    reads: ${trace.reads.length ? trace.reads.map(formatEvent).join(' | ') : '(none)'}`);
  console.log(`    writes: ${trace.writes.length ? trace.writes.map(formatEvent).join(' | ') : '(none)'}`);
  console.log(`    termination: ${trace.termination}`);
}

function printDynamicTraces(snapshot) {
  printSection('Dynamic Traces');
  console.log('all traces reuse the cold-boot RAM image, then call the helpers directly with ADL/IY state restored.');
  console.log('cold traces show real boot contents (all slots zero); seeded traces inject a nonzero slot target so the dereference is visible.');

  const traces = [
    traceRoutine(snapshot, {
      label: '0x02398E / cold slot',
      entry: 0x02398E,
      slot: D02611,
      flagAddr: FLAG_IY53,
      flagBit: 1,
      initialA: 0x76,
      initialF: 0xA5,
      initialHL: 0x123456,
    }),
    traceRoutine(snapshot, {
      label: '0x02398E / seeded nonzero slot',
      entry: 0x02398E,
      slot: D02611,
      flagAddr: FLAG_IY53,
      flagBit: 1,
      initialA: 0x76,
      initialF: 0xA5,
      initialHL: 0x123456,
      seedPtr: 0xD20000,
      seedBytes: [0x10, 0xAA, 0xBB, 0xCC],
    }),
    traceRoutine(snapshot, {
      label: '0x023A1C / cold slot',
      entry: 0x023A1C,
      slot: D025ED,
      flagAddr: FLAG_IY53,
      flagBit: 5,
      initialA: 0x01,
      initialF: 0xA5,
      initialHL: 0x654321,
    }),
    traceRoutine(snapshot, {
      label: '0x023A1C / seeded nonzero slot',
      entry: 0x023A1C,
      slot: D025ED,
      flagAddr: FLAG_IY53,
      flagBit: 5,
      initialA: 0x01,
      initialF: 0xA5,
      initialHL: 0x654321,
      seedPtr: 0xD20020,
      seedBytes: [0x11, 0xDD, 0xEE, 0xFF],
    }),
  ];

  for (const trace of traces) {
    printTrace(trace);
  }

  console.log('\n  trace takeaways:');
  console.log('    0x02398E preserves HL but mutates A/F (0x76 -> 0x77 in the font-style scenario) and writes 0x0109 to D025CF.');
  console.log('    0x023A1C preserves A/F/HL exactly on the NZ path and only clears bit 5 in IY+53.');
  console.log('    both routines dereference their slot first, inspect byte 0 at the target, and clear the matching IY flag bit after the NZ return path.');
}

function main() {
  const stubMap = buildStubMap();
  const routines = ROUTINE_SPECS.map((spec) => analyzeRoutine(spec, stubMap));
  const snapshot = createBootSnapshot();

  console.log('Phase 329: Font translation hook family 0x02398E / 0x023A1C');
  console.log(`ROM size: ${hex(rom.length, 8)} bytes`);

  printColdBoot(snapshot);
  printRegionDisassembly();
  printRoutineSummary(routines);
  print023A1CBranchAnalysis(routines);
  printSlotRefs(snapshot);
  print023A1CCallers();
  printDynamicTraces(snapshot);

  console.log('\nPhase 329 complete.');
}

main();
