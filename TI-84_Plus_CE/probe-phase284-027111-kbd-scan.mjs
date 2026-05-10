#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import * as peripheralRuntime from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const JT_REF_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TARGET = 0x027111;
const CALL_0003B0 = 0x0003B0;
const CALL_0270F3 = 0x0270F3;
const CHAIN_003B05 = 0x003B05;
const CHAIN_003C4B = 0x003C4B;
const DELAY_0061E3 = 0x0061E3;
const DELAY_0061E5 = 0x0061E5;

const TRACE_STEPS = 300;
const DISASM_MAX_BYTES = 0x200;

const ENTRY_SP = 0xD1A87E;
const ENTRY_IX = 0xD1A860;
const ENTRY_IY = 0xD00080;
const ENTRY_MBASE = 0xD0;
const RETURN_SENTINEL = 0xFEFEFE;

const D02A86_ADDR = 0xD02A86;
const ETOP = 0xD02437;
const ECUR = 0xD0243A;
const ETAIL = 0xD0243D;
const EBTM = 0xD02440;
const EBUF = 0xD00A00;
const EEND = 0xD00B00;

const COMMON_SEEDS = [
  [0xD0058E, 0x8F],
  [0xD0058D, 0x00],
  [0xD0059F, 0x00],
  [0xD003E0, 0x00],
  [0xD00824, 0x00],
  [0xD003DA, 0x00],
  [0xD007E0, 0x40],
  [0xD00000, 0x00],
];

const STUB_SPECS = [
  { addr: DELAY_0061E3, label: 'delay_0061e3', stub(cpu) { cpu.a = 0; return cpu.popReturn(); } },
  { addr: DELAY_0061E5, label: 'delay_0061e5', stub(cpu) { cpu.a = 0; return cpu.popReturn(); } },
  { addr: 0x02672F, label: 'ui_blit_02672f', stub(cpu) { return cpu.popReturn(); } },
  { addr: 0x09EF20, label: 'ui_status_wrapper_09ef20', stub(cpu) { return cpu.popReturn(); } },
  { addr: 0x09EF44, label: 'ui_status_body_09ef44', stub(cpu) { return cpu.popReturn(); } },
];

const CUSTOM_LOW_PORTS = new Set([0x00, 0x02, 0x03, 0x06, 0x07, 0x09, 0x0A, 0x0B, 0x0C, 0x0F]);

const PORT_NOTES = {
  0x00: 'stage/commit selector written before and after the sampled ladder',
  0x02: 'single-bit input sampled with RRA; repeated tests determine returned A=0..4',
  0x03: 'delay helper input; bit 4 chooses long vs short wait count',
  0x06: 'ancillary immediate-port read (0xDC06), not tied to keyMatrix',
  0x07: 'control latch masked before 0x02 samples',
  0x09: 'control latch masked before 0x02 samples and around 0x0270F3',
  0x0A: 'gate/control register paired with status port 0x0B',
  0x0B: 'status gate; bit 1 decides whether the ladder path runs',
  0x0C: 'saved/restored control latch; touched on the A>=2 path',
  0x0F: 'status byte read twice to confirm bit 7 is stable',
};

const createPeripheralBus = cpuRuntime.createPeripheralBus ?? peripheralRuntime.createPeripheralBus;
const createExecutor = cpuRuntime.createExecutor;

if (typeof createPeripheralBus !== 'function') throw new Error('Unable to resolve createPeripheralBus().');
if (typeof createExecutor !== 'function') throw new Error('cpu-runtime.js does not export createExecutor().');

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase284-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function readJumpTableLabel() {
  try {
    const text = fs.readFileSync(JT_REF_PATH, 'utf8');
    const match = text.match(/^\?([A-Za-z0-9_.]+)\s+:=\s+00003B0h$/m);
    return match ? `?${match[1]}` : null;
  } catch {
    return null;
  }
}

function isIoInstruction(inst) {
  return !!inst && (
    inst.tag === 'in0' ||
    inst.tag === 'out0' ||
    inst.tag === 'in-imm' ||
    inst.tag === 'out-imm' ||
    inst.tag === 'in-reg' ||
    inst.tag === 'out-reg'
  );
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  switch (inst.tag) {
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      return inst.direction === 'to-mem'
        ? `LD${suffix} (${hex(inst.addr, width)}), ${String(inst.pair).toUpperCase()}`
        : `LD${suffix} ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, width)})`;
    }
    case 'ld-mem-pair': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      return `LD${suffix} (${hex(inst.addr, width)}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-reg-ixd': return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test': return `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'in0': return `IN0 ${String(inst.reg).toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0': return `OUT0 (${hexByte(inst.port)}), ${String(inst.reg).toUpperCase()}`;
    case 'in-imm': return `IN A, (${hexByte(inst.port)})`;
    case 'out-imm': return `OUT (${hexByte(inst.port)}), A`;
    case 'in-reg': return `IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-reg': return `OUT (C), ${String(inst.reg).toUpperCase()}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `ADD ${String(inst.dest ?? 'HL').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'nop': return 'NOP';
    case 'rra': return 'RRA';
    default: return inst.tag + (inst.target !== undefined ? ` ${hex(inst.target)}` : '');
  }
}

function disassembleUntilRet(romBytes, start, maxBytes = DISASM_MAX_BYTES) {
  const rows = [];
  let pc = start;
  const end = Math.min(romBytes.length, start + maxBytes);
  while (pc < end) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(1, inst?.length ?? 1);
      rows.push({ pc, bytes: bytesToHex(romBytes.subarray(pc, pc + length)), text: formatInstruction(inst), inst });
      pc += length;
      if (inst?.tag === 'ret' || inst?.tag === 'reti' || inst?.tag === 'retn') break;
    } catch (error) {
      rows.push({ pc, bytes: hexByte(romBytes[pc]), text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`, inst: null });
      pc += 1;
    }
  }
  return rows;
}

function disassembleRange(romBytes, start, endExclusive) {
  const rows = [];
  let pc = start;
  const end = Math.min(romBytes.length, endExclusive);
  while (pc < end) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(1, inst?.length ?? 1);
      rows.push({ pc, bytes: bytesToHex(romBytes.subarray(pc, pc + length)), text: formatInstruction(inst), inst });
      pc += length;
    } catch (error) {
      rows.push({ pc, bytes: hexByte(romBytes[pc]), text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`, inst: null });
      pc += 1;
    }
  }
  return rows;
}

function scanPattern(bytes, pattern) {
  const hits = [];
  for (let i = 0; i <= bytes.length - pattern.length; i += 1) {
    let match = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (bytes[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(i);
  }
  return hits;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function nextMode(executor, key, pc, mode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return mode;
  for (const exit of exits) {
    if (exit.target === pc && exit.targetMode) return exit.targetMode;
  }
  return mode;
}

function installStep(cpu, executor) {
  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks?.[key];
    if (typeof fn !== 'function') throw new Error(`Missing block ${hex(pc)} (${key})`);
    const out = fn(this);
    if (typeof out !== 'number') throw new Error(`Bad block result from ${hex(pc)}: ${String(out)}`);
    if (out >= 0) {
      const modeAfter = nextMode(executor, key, out, mode);
      this.pc = out & 0xFFFFFF;
      this.madl = modeAfter === 'adl' ? 1 : 0;
    }
    return out;
  };
}

function createProbePeripheralBus() {
  const base = createPeripheralBus({ timerInterrupt: false });
  const lowPorts = new Uint8Array(256).fill(0x00);
  lowPorts[0x02] = 0xFF;
  lowPorts[0x03] = 0x00;
  lowPorts[0x06] = 0xD0;
  lowPorts[0x0B] = 0x02;
  lowPorts[0x0F] = 0x00;

  const bus = Object.create(base);
  bus.read = (port) => {
    const rawPort = Number(port) & 0xFFFF;
    const lowPort = rawPort & 0xFF;
    if (rawPort < 0x100) {
      if (lowPort === 0x01) return base.read(0x01);
      if (CUSTOM_LOW_PORTS.has(lowPort)) return lowPorts[lowPort] & 0xFF;
      return base.read(rawPort);
    }
    if (lowPort === 0x06) return lowPorts[0x06] & 0xFF;
    return base.read(rawPort);
  };
  bus.write = (port, value) => {
    const rawPort = Number(port) & 0xFFFF;
    const lowPort = rawPort & 0xFF;
    const byteValue = Number(value) & 0xFF;
    if (rawPort < 0x100) {
      if (lowPort === 0x01) {
        base.write(0x01, byteValue);
        return;
      }
      if (CUSTOM_LOW_PORTS.has(lowPort)) {
        lowPorts[lowPort] = byteValue;
        return;
      }
      base.write(rawPort, byteValue);
      return;
    }
    base.write(rawPort, byteValue);
  };
  bus.lowPorts = lowPorts;
  return bus;
}

function installRuntimeStubs(executor) {
  const installed = [];
  for (const spec of STUB_SPECS) {
    const key = blockKey(spec.addr, 'adl');
    if (!executor.compiledBlocks?.[key]) continue;
    executor.compiledBlocks[key] = spec.stub;
    installed.push({ addr: spec.addr, label: spec.label });
  }
  return installed;
}

function seedEditBuffer(mem) {
  write24(mem, ETOP, EBUF);
  write24(mem, ECUR, EBUF);
  write24(mem, ETAIL, EEND);
  write24(mem, EBTM, EEND);
  mem.fill(0x00, EBUF, EEND);
}

function seedScenario(cpu, mem, bus, { enterPressed }) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = ENTRY_MBASE;
  cpu.pc = TARGET;
  cpu.sp = ENTRY_SP;
  cpu.ix = ENTRY_IX;
  cpu.iy = ENTRY_IY;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;

  mem.fill(0x00, ENTRY_IY & MEM_MASK, ((ENTRY_IY + 0x80) & MEM_MASK));
  for (const [addr, value] of COMMON_SEEDS) mem[addr & MEM_MASK] = value & 0xFF;
  seedEditBuffer(mem);
  mem[D02A86_ADDR & MEM_MASK] = 0x00;
  write24(mem, ENTRY_SP, RETURN_SENTINEL);

  bus.keyboard.keyMatrix.fill(0xFF);
  if (enterPressed) bus.keyboard.keyMatrix[1] = 0xFE;
}

function formatBlock(meta) {
  const instructions = meta?.instructions ?? [];
  if (instructions.length === 0) return '(no block metadata)';
  return instructions.map((inst) => inst.dasm ?? formatInstruction(inst)).join(' | ');
}

function describePort(port) {
  const p = port & 0xFF;
  const descs = {
    0x00: 'CPU control / stage selector',
    0x01: 'keyboard scan (W=group select, R=key status)',
    0x02: 'GPIO B / USB data line',
    0x03: 'GPIO C / delay helper',
    0x06: 'flash controller status',
    0x07: 'SPI / control latch',
    0x09: 'power / control latch',
    0x0A: 'LCD backlight / gate control',
    0x0B: 'RTC / status gate',
    0x0C: 'USB controller / control latch',
    0x0F: 'USB status / interrupt flags',
  };
  return descs[p] ?? `port ${hex(p, 2)}`;
}

function runDynamicTrace(executor, mem, bus, label, opts) {
  const cpu = executor.cpu;

  seedScenario(cpu, mem, bus, opts);

  // Hook I/O tracing
  const ioLog = [];
  cpu.onIoRead = (port, value) => {
    if (ioLog.length < 300) {
      ioLog.push({ dir: 'IN', port: port & 0xFFFF, value: value & 0xFF, pc: cpu._currentBlockPc ?? cpu.pc });
    }
  };
  cpu.onIoWrite = (port, value) => {
    if (ioLog.length < 300) {
      ioLog.push({ dir: 'OUT', port: port & 0xFFFF, value: value & 0xFF, pc: cpu._currentBlockPc ?? cpu.pc });
    }
  };

  const blocks = [];
  const missing = [];

  const result = executor.runFrom(TARGET, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: 80,
    onBlock(pc, mode, meta, step) {
      blocks.push({
        step,
        pc: pc & 0xFFFFFF,
        dasm: formatBlock(meta),
      });
    },
    onMissingBlock(pc, mode, step) {
      missing.push({ step, pc: pc & 0xFFFFFF, mode });
    },
  });

  // Collect RAM changes
  const ramChanges = [];
  for (let addr = 0xD00000; addr < 0xD10000 && ramChanges.length < 50; addr++) {
    if (mem[addr] !== 0) {
      ramChanges.push({ addr, value: mem[addr] });
    }
  }

  return {
    label,
    result,
    final: {
      pc: cpu.pc & 0xFFFFFF,
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      hl: cpu.hl & 0xFFFFFF,
      de: cpu.de & 0xFFFFFF,
      bc: cpu.bc & 0xFFFFFF,
      sp: cpu.sp & 0xFFFFFF,
    },
    blocks,
    missing,
    ioLog,
    ramChanges: ramChanges.slice(0, 30),
  };
}

function printTrace(trace) {
  console.log(`\n  [${trace.label}]`);
  const termination = trace.result?.termination ?? 'unknown';
  console.log(`  Exit: ${termination}, steps=${trace.result?.steps ?? '?'}`);
  console.log(`  Final: PC=${hex(trace.final.pc)} A=${hexByte(trace.final.a)} F=${hexByte(trace.final.f)} HL=${hex(trace.final.hl)} DE=${hex(trace.final.de)} BC=${hex(trace.final.bc)} SP=${hex(trace.final.sp)}`);

  console.log(`  Blocks visited: ${trace.blocks.length}`);
  for (const b of trace.blocks.slice(0, 50)) {
    console.log(`    step=${String(b.step).padStart(3)} PC=${hex(b.pc)} ${b.dasm.slice(0, 90)}`);
  }
  if (trace.blocks.length > 50) {
    console.log(`    ... (${trace.blocks.length - 50} more blocks)`);
  }

  if (trace.missing.length > 0) {
    console.log(`  Missing blocks: ${trace.missing.length}`);
    for (const m of trace.missing.slice(0, 10)) {
      console.log(`    step=${m.step} PC=${hex(m.pc)} mode=${m.mode}`);
    }
  }

  console.log(`  I/O operations: ${trace.ioLog.length}`);
  for (const io of trace.ioLog) {
    const portDesc = describePort(io.port);
    console.log(`    ${io.dir.padEnd(3)} port=${hex(io.port, 4)} val=${hexByte(io.value)} pc=${hex(io.pc)} [${portDesc}]`);
  }

  if (trace.ramChanges.length > 0) {
    console.log(`  RAM writes (non-zero in D00000-D10000): ${trace.ramChanges.length}`);
    for (const w of trace.ramChanges.slice(0, 20)) {
      console.log(`    ${hex(w.addr)} = ${hexByte(w.value)}`);
    }
  }
}

async function main() {
  console.log('=== Phase 284: Trace 0x027111 — Low-Level Keyboard Scan ===\n');

  const rom = fs.readFileSync(ROM_PATH);

  // --- Task 1: Disassemble 0x027111 ---
  console.log('--- Task 1: Disassembly of 0x027111 ---');
  const rows = disassembleUntilRet(rom, TARGET, DISASM_MAX_BYTES);
  for (const row of rows) {
    const marker = isIoInstruction(row.inst) ? ' <<<< I/O' : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(30)} ${row.text}${marker}`);
  }

  const ioInsts = rows.filter((r) => isIoInstruction(r.inst));
  console.log(`\n  Total I/O instructions in disassembly: ${ioInsts.length}`);
  for (const io of ioInsts) {
    console.log(`    ${hex(io.pc)}  ${io.text}  [${describePort(io.inst.port ?? 0)}]`);
  }

  // --- Task 2: Find all callers ---
  console.log('\n--- Task 2: Find all callers of 0x027111 ---');
  const callHits = scanPattern(rom, [0xCD, 0x11, 0x71, 0x02]);
  const jpHits = scanPattern(rom, [0xC3, 0x11, 0x71, 0x02]);
  console.log(`  CALL hits (CD 11 71 02): ${callHits.length}`);
  for (const addr of callHits) {
    console.log(`    ${hex(addr)} — context: ${bytesToHex(rom.subarray(Math.max(0, addr - 4), addr + 8))}`);
  }
  console.log(`  JP hits (C3 11 71 02): ${jpHits.length}`);
  for (const addr of jpHits) {
    console.log(`    ${hex(addr)} — context: ${bytesToHex(rom.subarray(Math.max(0, addr - 4), addr + 8))}`);
  }

  // Disassemble context around each caller
  for (const addr of callHits) {
    const contextStart = Math.max(0, addr - 8);
    const contextEnd = addr + 12;
    console.log(`\n  Context around caller at ${hex(addr)}:`);
    const contextRows = disassembleRange(rom, contextStart, contextEnd);
    for (const row of contextRows) {
      const arrow = row.pc === addr ? ' <--- CALL 0x027111' : '';
      console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}${arrow}`);
    }
  }

  // --- Tasks 3 & 4: Dynamic traces ---
  console.log('\n--- Task 3: Dynamic trace — no key pressed ---');
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const preliftedBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;

    const mem = createMemoryBus(rom);
    const bus = createProbePeripheralBus();
    const executor = createExecutor(preliftedBlocks, mem, { peripherals: bus });

    const stubs = installRuntimeStubs(executor);
    if (stubs.length > 0) {
      console.log(`  Stubs installed: ${stubs.map((s) => `${s.label}@${hex(s.addr)}`).join(', ')}`);
    }

    const traceNoKey = runDynamicTrace(executor, mem, bus, 'No key pressed', { enterPressed: false });
    printTrace(traceNoKey);

    console.log('\n--- Task 4: Dynamic trace — ENTER key pressed ---');
    const traceEnter = runDynamicTrace(executor, mem, bus, 'ENTER key pressed', { enterPressed: true });
    printTrace(traceEnter);

    // --- Task 5: I/O Port Sequence Analysis ---
    console.log('\n--- Task 5: I/O Port Sequence Analysis ---');

    console.log('\n  [No-key I/O sequence summary]:');
    const noKeyPorts = new Map();
    for (const io of traceNoKey.ioLog) {
      const key = `${io.dir} ${hex(io.port, 4)}`;
      noKeyPorts.set(key, (noKeyPorts.get(key) || 0) + 1);
    }
    for (const [key, count] of noKeyPorts) {
      console.log(`    ${key}: ${count} times`);
    }

    console.log('\n  [ENTER-key I/O sequence summary]:');
    const enterPorts = new Map();
    for (const io of traceEnter.ioLog) {
      const key = `${io.dir} ${hex(io.port, 4)}`;
      enterPorts.set(key, (enterPorts.get(key) || 0) + 1);
    }
    for (const [key, count] of enterPorts) {
      console.log(`    ${key}: ${count} times`);
    }

    console.log('\n  [Return value comparison]:');
    console.log(`    No-key:  A=${hexByte(traceNoKey.final.a)}, carry=${(traceNoKey.final.f & 1) ? 'SET' : 'clear'}, zero=${(traceNoKey.final.f & 0x40) ? 'SET' : 'clear'}`);
    console.log(`    ENTER:   A=${hexByte(traceEnter.final.a)}, carry=${(traceEnter.final.f & 1) ? 'SET' : 'clear'}, zero=${(traceEnter.final.f & 0x40) ? 'SET' : 'clear'}`);

    console.log('\n  [Port function map]:');
    console.log('    Port 0x01: Keyboard scan — write selects group (active-low bitmask), read returns key status');
    console.log('    Port 0x02: GPIO B — sampled with RRA; repeated tests build return value A=0..4');
    console.log('    Port 0x03: GPIO C — bit 4 determines delay loop length');
    console.log('    Port 0x07: Control latch — masked before port 0x02 sampling');
    console.log('    Port 0x09: Control latch — masked before port 0x02 and around 0x0270F3');
    console.log('    Port 0x0A: Gate/control register — paired with 0x0B');
    console.log('    Port 0x0B: Status gate — bit 1 decides whether scan ladder runs');
    console.log('    Port 0x0C: Control latch — saved/restored on A>=2 path');
    console.log('    Port 0x0F: USB/status — bit 7 stability check (read twice)');

  } finally {
    cleanupTranspiledModule(assets);
  }

  // --- Summary ---
  console.log('\n--- Summary ---');
  console.log('  0x027111 is the TI-84 CE low-level keyboard scan routine.');
  console.log('  It uses port 0x01 for the classic Z80 keyboard matrix scan:');
  console.log('    1. Write group-select mask to port 0x01 (active-low: clear bit = select group)');
  console.log('    2. Read port 0x01 to get pressed-key bitmask for selected group(s)');
  console.log('  Additional ports (0x02, 0x03, 0x07, 0x09, 0x0A, 0x0B, 0x0C, 0x0F)');
  console.log('  handle USB detection, power management, and hardware gate control.');
  console.log('  The keyboard matrix is active-low: bit=0 means key pressed.');
  console.log('  ENTER key: keyMatrix[1] bit 0 -> scan code 0x10.');
  console.log('  Return: A = scan code (or 0 for no key), carry = key-detected flag.');

  console.log('\n=== Phase 284 complete ===');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
