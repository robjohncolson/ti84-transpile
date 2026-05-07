#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const TABLE_JSON_PATH = path.join(__dirname, 'phase230-09f79b-full-table.json');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_MAX_STEPS = 100000;
const KERNEL_MAX_LOOPS = 10000;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOPS = 32;
const MEM_INIT_MAX_STEPS = 100000;
const MEM_INIT_MAX_LOOPS = 8192;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const STACK_TOP = 0xD1A87E;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const MBASE = 0xD0;
const IY_PLUS_75 = IY_ADDR + 75;

const LOOKUP_ENTRY = 0x02FF09;
const LOOKUP_READY = 0x02FF1B;
const LOOKUP_CALL = 0x0302EB;
const LOOKUP_RETURN = 0x02FF1F;
const LOOKUP_SPECIAL_BRANCH = 0x02FFED;
const KEY_TABLE_ADDR = 0x09F79B;

const SECTION_BASES = {
  noMod: 0x00,
  second: 0x38,
  alpha: 0x70,
  alphaSecond: 0xA8,
};

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f',
  '_bc', '_de', '_hl',
  '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy',
  'i', 'r', 'im', 'iff1', 'iff2',
  'madl', 'mbase', 'halted', 'cycles',
];

const STAGES = [
  { label: 'stage 1 status bar background', entry: STAGE_1_ENTRY, maxSteps: 30000 },
  { label: 'stage 2 status dots', entry: STAGE_2_ENTRY, maxSteps: 30000 },
  { label: 'stage 3 home row strip', entry: STAGE_3_ENTRY, maxSteps: 50000 },
  { label: 'stage 4 history area', entry: STAGE_4_ENTRY, maxSteps: 50000 },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesFor(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read24(buffer, addr) {
  const a = addr & 0xFFFFFF;
  return (buffer[a] | (buffer[(a + 1) & 0xFFFFFF] << 8) | (buffer[(a + 2) & 0xFFFFFF] << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function makeStop(code, detail = null) {
  const error = new Error('__PHASE234_STOP__');
  error.phase234Stop = { code, detail };
  return error;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      source: 'js',
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase234-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    source: 'gz',
    modulePath: tempModulePath,
    tempModulePath,
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function formatIndexed(base, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${base.toUpperCase()}${sign}${Math.abs(displacement)})`;
}

function formatResolvedAddress(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'db ?';
  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'xor-a': return 'XOR A';
    case 'neg': return 'NEG';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${(inst.indirectRegister ?? 'hl').toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'rst': return `RST ${hexByte(inst.target ?? inst.vector ?? 0)}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(formatResolvedAddress(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(formatResolvedAddress(inst) ?? inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (HL), ${hexByte(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'from-mem') return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
      return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${inst.dest.toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-sp-pair': return `LD SP, ${inst.pair.toUpperCase()}`;
    case 'ld-pair-indexed': return `LD ${inst.pair.toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair.toUpperCase()}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'alu-reg':
      return `${inst.op.toUpperCase()} ${inst.src === '(hl)' ? '(HL)' : inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-res': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-set': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'lea': return `LEA ${inst.dest.toUpperCase()}, ${formatIndexed(inst.base ?? inst.indexReg, inst.displacement ?? inst.offset ?? 0)}`;
    default: return inst.tag;
  }
}

function decodeRange(rom, startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  while (pc < (endPc & 0xFFFFFF)) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      rows.push({
        pc: inst.pc >>> 0,
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        length: inst.length,
      });
      pc = inst.nextPc & 0xFFFFFF;
    } catch (error) {
      rows.push({
        pc,
        bytes: bytesFor(rom, pc, 1),
        text: `decode-error: ${error.message}`,
        tag: 'decode-error',
        length: 1,
      });
      pc = (pc + 1) & 0xFFFFFF;
    }
  }
  return rows;
}

function printRows(rows, markers = new Map()) {
  for (const row of rows) {
    const marker = markers.get(row.pc) ?? '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}${marker ? `  ${marker}` : ''}`);
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function createMemoryWithRom(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function createRuntime(blocks, mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu, peripherals };
}

function clearStackWindow(mem, sp = STACK_TOP) {
  mem.fill(0xFF, Math.max(0, sp - 0x80), Math.min(mem.length, sp + 0x20));
}

function resetCpuState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  clearStackWindow(mem, STACK_TOP);
}

function prepareStageEntry(cpu) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
}

function runStage(executor, cpu, label, entry, maxSteps) {
  prepareStageEntry(cpu);
  const result = executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });
  return {
    label,
    entry,
    maxSteps,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
  };
}

function bootHomescreenBaseline(romBytes, blocks) {
  const mem = createMemoryWithRom(romBytes);
  const { executor, cpu } = createRuntime(blocks, mem);

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_MAX_STEPS,
    maxLoopIterations: KERNEL_MAX_LOOPS,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOPS,
  });

  resetCpuState(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInit = null;
  let memInitReturned = false;
  try {
    memInit = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MEM_INIT_MAX_LOOPS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw makeStop('mem_init_return');
      },
    });
  } catch (error) {
    if (error?.phase234Stop?.code === 'mem_init_return') {
      memInitReturned = true;
      memInit = {
        steps: null,
        lastPc: MEM_INIT_RET,
        termination: 'sentinel',
      };
    } else {
      throw error;
    }
  }

  const stages = [];
  for (const stage of STAGES) {
    stages.push(runStage(executor, cpu, stage.label, stage.entry, stage.maxSteps));
  }

  return {
    mem: new Uint8Array(mem),
    cpu: snapshotCpu(cpu),
    boot,
    kernelInit,
    postInit,
    memInit,
    memInitReturned,
    stages,
    finalIy75: mem[IY_PLUS_75],
  };
}

function loadTableJson() {
  if (!fs.existsSync(TABLE_JSON_PATH)) return null;
  return JSON.parse(fs.readFileSync(TABLE_JSON_PATH, 'utf8'));
}

function parseHexText(text) {
  return Number.parseInt(String(text).replace(/^0x/i, ''), 16);
}

function buildCaseFromEntry(section, entry, label, required = true) {
  const sectionBase = SECTION_BASES[section];
  if (sectionBase === undefined) return null;
  const index = Number(entry.index) & 0xFF;
  const flatIndex = (sectionBase + index) & 0xFF;
  const keyCodeValue = parseHexText(entry.keyCode) & 0xFF;
  return {
    label,
    required,
    section,
    sectionBase,
    index,
    flatIndex,
    keyCodeValue,
    keyCodeHex: hexByte(keyCodeValue),
    name: entry.name ?? null,
  };
}

function findExactCase(tableJson, keyCodeHex, label, required = true) {
  if (!tableJson?.sections) return null;
  const wanted = keyCodeHex.toUpperCase();
  for (const [section, entries] of Object.entries(tableJson.sections)) {
    for (const entry of entries) {
      if (String(entry.keyCode).toUpperCase() === wanted) {
        return buildCaseFromEntry(section, entry, label, required);
      }
    }
  }
  return null;
}

function findFirstSpecialCase(tableJson, label) {
  if (!tableJson?.sections) return null;
  let best = null;
  for (const [section, entries] of Object.entries(tableJson.sections)) {
    for (const entry of entries) {
      const keyCodeValue = parseHexText(entry.keyCode) & 0xFF;
      if (keyCodeValue < 0xE2) continue;
      const candidate = buildCaseFromEntry(section, entry, label, true);
      if (!best || candidate.keyCodeValue < best.keyCodeValue) {
        best = candidate;
      }
    }
  }
  return best;
}

function buildTestCases(tableJson) {
  const cases = [];
  cases.push(
    findExactCase(tableJson, '0x8F', "requested case: 0x8F ('1')", true) ?? {
      label: "requested case: 0x8F ('1')",
      required: true,
      section: 'noMod',
      sectionBase: 0x00,
      index: 34,
      flatIndex: 0x22,
      keyCodeValue: 0x8F,
      keyCodeHex: '0x8F',
      name: '1',
    },
  );
  cases.push(
    findExactCase(tableJson, '0x80', "requested case: 0x80 ('+')", true) ?? {
      label: "requested case: 0x80 ('+')",
      required: true,
      section: 'noMod',
      sectionBase: 0x00,
      index: 10,
      flatIndex: 0x0A,
      keyCodeValue: 0x80,
      keyCodeHex: '0x80',
      name: '+',
    },
  );
  cases.push(
    findExactCase(tableJson, '0xE2', 'requested case: >=0xE2 special-path code', true) ??
      findFirstSpecialCase(tableJson, 'requested case: >=0xE2 special-path code') ?? {
        label: 'requested case: >=0xE2 special-path code',
        required: true,
        section: 'alphaSecond',
        sectionBase: 0xA8,
        index: 47,
        flatIndex: 0xD7,
        keyCodeValue: 0xE2,
        keyCodeHex: '0xE2',
        name: 'kInputDone',
      },
  );

  const control44 = findExactCase(tableJson, '0x44', 'control case: 0x44 special compare', false) ?? {
    label: 'control case: 0x44 special compare',
    required: false,
    section: 'noMod',
    sectionBase: 0x00,
    index: 49,
    flatIndex: 0x31,
    keyCodeValue: 0x44,
    keyCodeHex: '0x44',
    name: '0x44',
  };
  cases.push(control44);
  return cases;
}

function installWriteLogger(cpu, mem) {
  const ramWrites = [];
  const iyWrites = [];
  const originals = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function recordChangedBytes(addr, beforeBytes, afterBytes, via) {
    for (let i = 0; i < afterBytes.length; i += 1) {
      const resolved = (addr + i) & 0xFFFFFF;
      if (beforeBytes[i] === afterBytes[i]) continue;
      const event = {
        pc: cpu._currentBlockPc ?? 0,
        addr: resolved,
        before: beforeBytes[i],
        after: afterBytes[i],
        via,
      };
      ramWrites.push(event);
      if (resolved >= IY_ADDR && resolved < (IY_ADDR + 0x100)) {
        iyWrites.push(event);
      }
    }
  }

  cpu.write8 = (addr, value) => {
    const resolved = addr & 0xFFFFFF;
    const before = [mem[resolved] & 0xFF];
    originals.write8(addr, value);
    const after = [mem[resolved] & 0xFF];
    recordChangedBytes(resolved, before, after, 'write8');
  };

  cpu.write16 = (addr, value) => {
    const resolved = addr & 0xFFFFFF;
    const before = [mem[resolved] & 0xFF, mem[(resolved + 1) & 0xFFFFFF] & 0xFF];
    originals.write16(addr, value);
    const after = [mem[resolved] & 0xFF, mem[(resolved + 1) & 0xFFFFFF] & 0xFF];
    recordChangedBytes(resolved, before, after, 'write16');
  };

  cpu.write24 = (addr, value) => {
    const resolved = addr & 0xFFFFFF;
    const before = [
      mem[resolved] & 0xFF,
      mem[(resolved + 1) & 0xFFFFFF] & 0xFF,
      mem[(resolved + 2) & 0xFFFFFF] & 0xFF,
    ];
    originals.write24(addr, value);
    const after = [
      mem[resolved] & 0xFF,
      mem[(resolved + 1) & 0xFFFFFF] & 0xFF,
      mem[(resolved + 2) & 0xFFFFFF] & 0xFF,
    ];
    recordChangedBytes(resolved, before, after, 'write24');
  };

  return {
    ramWrites,
    iyWrites,
    restore() {
      cpu.write8 = originals.write8;
      cpu.write16 = originals.write16;
      cpu.write24 = originals.write24;
    },
  };
}
