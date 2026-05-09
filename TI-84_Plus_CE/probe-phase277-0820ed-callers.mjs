#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_STEPS = 20000;
const BOOT_LOOP_LIMIT = 32;
const KERNEL_INIT_REQUEST_PC = 0x000280;
const KERNEL_INIT_FALLBACK_PC = 0x020028;
const KERNEL_INIT_STEPS = 50000;
const KERNEL_INIT_LOOP_LIMIT = 10000;

const TARGET_FUNC = 0x0820ED;
const OP1_BASE = 0xD005F8;
const OP1_END = 0xD005FF;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE_VAL = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const D02590 = 0xD02590;
const D02593 = 0xD02593;
const D0259A = 0xD0259A;
const D0259D = 0xD0259D;
const D025A0 = 0xD025A0;
const TABLE_TOP = 0xD3FFFF;

// ─── Utilities ───

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (v) => hexByte(v)).join(' ');
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0) |
    ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) |
    ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function readWidth(mem, addr, width) {
  if (width === 1) return mem[addr & MEM_MASK] ?? 0;
  if (width === 2) {
    const base = addr & MEM_MASK;
    return ((mem[base] ?? 0) | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8)) >>> 0;
  }
  return read24(mem, addr);
}

function bytesAt(mem, addr, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(mem[(addr + i) & MEM_MASK] ?? 0);
  return out;
}

// ─── ROM / Module Loading ───

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase277-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function resolveKernelInitEntry(blocks) {
  const candidates = [
    { key: '000280:adl', pc: KERNEL_INIT_REQUEST_PC, mode: 'adl' },
    { key: '000280:z80', pc: KERNEL_INIT_REQUEST_PC, mode: 'z80' },
    { key: '020028:adl', pc: KERNEL_INIT_FALLBACK_PC, mode: 'adl' },
  ];
  for (const c of candidates) {
    if (blocks[c.key]) return c;
  }
  throw new Error('Unable to locate a lifted kernel-init block at 0x000280 or 0x020028.');
}

function createCPU(blocks, memory) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  return { cpu: executor.cpu, executor, peripherals };
}

function createRuntime(romBytes, blocks) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const harness = createCPU(blocks, memory);
  return { mem: memory, ...harness };
}

function bootRuntime(runtime, kernelInfo) {
  const { executor, cpu } = runtime;
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_STEPS,
    maxLoopIterations: BOOT_LOOP_LIMIT,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE_VAL;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.sp = STACK_TOP - 3;

  const kernelInit = executor.runFrom(kernelInfo.pc, kernelInfo.mode, {
    maxSteps: KERNEL_INIT_STEPS,
    maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
  });

  return { boot, kernelInit };
}

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot) {
  for (const f of CPU_SNAPSHOT_FIELDS) cpu[f] = snapshot[f];
}

function snapshotRuntime(cpu, mem) {
  return { cpu: snapshotCpu(cpu), memory: new Uint8Array(mem) };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  restoreCpu(cpu, snapshot.cpu);
}

// ─── Part 1: Static CALL/JP search ───

function findCallersInRom(romBytes) {
  const romLen = romBytes.length;
  const targetLow = TARGET_FUNC & 0xFF;           // 0xED
  const targetMid = (TARGET_FUNC >>> 8) & 0xFF;   // 0x20
  const targetHigh = (TARGET_FUNC >>> 16) & 0xFF;  // 0x08

  // ADL-mode CALL nn: CD + 3-byte LE addr (4 bytes total)
  // ADL-mode JP nn:   C3 + 3-byte LE addr
  // Conditional CALL: C4/CC/D4/DC/E4/EC/F4/FC + 3-byte LE addr
  // Conditional JP:   C2/CA/D2/DA/E2/EA/F2/FA + 3-byte LE addr
  const callOpcodes = [0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const jpOpcodes = [0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
  const allOpcodes = new Set([...callOpcodes, ...jpOpcodes]);

  const results = [];

  for (let i = 0; i < romLen - 3; i++) {
    if (!allOpcodes.has(romBytes[i])) continue;
    if (romBytes[i + 1] !== targetLow) continue;
    if (romBytes[i + 2] !== targetMid) continue;
    if (romBytes[i + 3] !== targetHigh) continue;

    const opcode = romBytes[i];
    let instrType;
    if (callOpcodes.includes(opcode)) {
      instrType = opcode === 0xCD ? 'CALL' : `CALL ${conditionName(opcode, 'call')}`;
    } else {
      instrType = opcode === 0xC3 ? 'JP' : `JP ${conditionName(opcode, 'jp')}`;
    }

    const contextStart = Math.max(0, i - 12);
    const contextEnd = Math.min(romLen, i + 16);
    const context = romBytes.subarray(contextStart, contextEnd);

    results.push({
      address: i,
      opcode,
      instrType,
      contextStart,
      context: Array.from(context),
    });
  }

  return results;
}

function conditionName(opcode, type) {
  const condMap = type === 'call'
    ? { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' }
    : { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
  return condMap[opcode] ?? '??';
}

function classifyRegion(addr) {
  if (addr < 0x000100) return 'reset-vectors';
  if (addr < 0x000400) return 'boot/init';
  if (addr < 0x010000) return 'low-ROM';
  if (addr < 0x020000) return 'ROM-bank0';
  if (addr < 0x040000) return 'ROM-kernel';
  if (addr < 0x060000) return 'ROM-math/OS';
  if (addr < 0x080000) return 'ROM-mid';
  if (addr < 0x0A0000) return 'ROM-VAT/apps';
  if (addr < 0x100000) return 'ROM-upper';
  return 'extended';
}

// ─── Part 2: D005F8-D005FF writer search ───

function findD005FxWriters(romBytes) {
  const romLen = romBytes.length;
  const results = [];

  // Search for LD (nn),A => opcode 0x32, then 3-byte LE address in ADL mode
  // Also LD (nn),HL => ED 63 nn nn nn (ADL)
  // Also LD (nn),BC => ED 43 nn nn nn (ADL)
  // Also LD (nn),DE => ED 53 nn nn nn (ADL)

  for (let offset = 0; offset <= 7; offset++) {
    const targetAddr = OP1_BASE + offset;
    const addrLow = targetAddr & 0xFF;
    const addrMid = (targetAddr >>> 8) & 0xFF;
    const addrHigh = (targetAddr >>> 16) & 0xFF;

    // LD (nn),A: 32 LL MM HH
    for (let i = 0; i < romLen - 3; i++) {
      if (romBytes[i] === 0x32 &&
          romBytes[i + 1] === addrLow &&
          romBytes[i + 2] === addrMid &&
          romBytes[i + 3] === addrHigh) {
        results.push({
          address: i,
          target: targetAddr,
          instrType: `LD (${hex(targetAddr)}),A`,
          offsetInBuffer: offset,
        });
      }
    }

    // ED-prefixed stores: ED 43/53/63/73 LL MM HH
    const edPairs = [
      { second: 0x43, pair: 'BC' },
      { second: 0x53, pair: 'DE' },
      { second: 0x63, pair: 'HL' },
    ];
    for (let i = 0; i < romLen - 4; i++) {
      if (romBytes[i] !== 0xED) continue;
      for (const { second, pair } of edPairs) {
        if (romBytes[i + 1] === second &&
            romBytes[i + 2] === addrLow &&
            romBytes[i + 3] === addrMid &&
            romBytes[i + 4] === addrHigh) {
          results.push({
            address: i,
            target: targetAddr,
            instrType: `LD (${hex(targetAddr)}),${pair}`,
            offsetInBuffer: offset,
          });
        }
      }
    }
  }

  // Also search for LDIR that could target this range: harder to find statically,
  // so search for LD DE,D005F8 pattern (loading dest pointer)
  const deLow = OP1_BASE & 0xFF;
  const deMid = (OP1_BASE >>> 8) & 0xFF;
  const deHigh = (OP1_BASE >>> 16) & 0xFF;

  // LD DE,nn => 11 LL MM HH (ADL)
  for (let i = 0; i < romLen - 3; i++) {
    if (romBytes[i] === 0x11 &&
        romBytes[i + 1] === deLow &&
        romBytes[i + 2] === deMid &&
        romBytes[i + 3] === deHigh) {
      results.push({
        address: i,
        target: OP1_BASE,
        instrType: `LD DE,${hex(OP1_BASE)} (potential LDIR dest)`,
        offsetInBuffer: -1,
      });
    }
  }

  // LD HL,D005F8 => 21 LL MM HH — could be source for LD (HL),r or LDIR src
  for (let i = 0; i < romLen - 3; i++) {
    if (romBytes[i] === 0x21 &&
        romBytes[i + 1] === deLow &&
        romBytes[i + 2] === deMid &&
        romBytes[i + 3] === deHigh) {
      results.push({
        address: i,
        target: OP1_BASE,
        instrType: `LD HL,${hex(OP1_BASE)} (potential indirect write base)`,
        offsetInBuffer: -1,
      });
    }
  }

  results.sort((a, b) => a.address - b.address);
  return results;
}

// ─── Part 3: Dynamic trace ───

function seedTraceState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE_VAL;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.sp = STACK_TOP - 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Set up table pointers
  write24(mem, D02590, TABLE_TOP);
  write24(mem, D02593, TABLE_TOP);
  write24(mem, D0259A, TABLE_TOP);
  write24(mem, D0259D, TABLE_TOP);
  write24(mem, D025A0, 0x000000);
}

function installOP1WriteTracer(cpu, mem) {
  const writes = [];
  const originals = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function shouldTrace(addr, width) {
    const n = addr & MEM_MASK;
    // Watch D005F8-D005FF
    if (n >= OP1_BASE && n <= OP1_END) return true;
    if (width > 1 && n < OP1_END && (n + width - 1) >= OP1_BASE) return true;
    // Watch D02590 area
    if (n >= D02590 && n <= D025A0 + 2) return true;
    // Watch table top area
    if (n >= 0xD3FF00 && n <= 0xD3FFFF) return true;
    return false;
  }

  function capture(width, addr, value) {
    const n = addr & MEM_MASK;
    if (!shouldTrace(n, width)) return;
    const masked = width === 1 ? value & 0xFF : width === 2 ? value & 0xFFFF : value & 0xFFFFFF;
    writes.push({
      pc: cpu._currentBlockPc ?? 0,
      addr: n,
      width,
      before: readWidth(mem, n, width),
      after: masked,
    });
  }

  cpu.write8 = (addr, value) => { capture(1, addr, value); originals.write8(addr, value); };
  cpu.write16 = (addr, value) => { capture(2, addr, value); originals.write16(addr, value); };
  cpu.write24 = (addr, value) => { capture(3, addr, value); originals.write24(addr, value); };

  return {
    writes,
    restore() {
      cpu.write8 = originals.write8;
      cpu.write16 = originals.write16;
      cpu.write24 = originals.write24;
    },
  };
}

function runCallerTrace(runtime, baseline, callerAddr) {
  const { cpu, mem, executor } = runtime;

  restoreRuntime(cpu, mem, baseline);
  seedTraceState(cpu, mem);

  // Start 16 bytes before the CALL to capture setup instructions
  const startPc = Math.max(0, callerAddr - 16);

  const tracer = installOP1WriteTracer(cpu, mem);
  const traceSteps = [];
  const dynamicTargets = [];

  const beforeOP1 = bytesAt(mem, OP1_BASE, 8);
  let reached0820ED = false;

  try {
    const result = executor.runFrom(startPc, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 64,
      onBlock(pc, mode, _meta, step) {
        const pcVal = pc >>> 0;
        if (pcVal === TARGET_FUNC) reached0820ED = true;
        traceSteps.push({
          step,
          pc: pcVal,
          mode,
          a: cpu.a & 0xFF,
          bc: (cpu._bc ?? 0) & 0xFFFFFF,
          de: (cpu._de ?? 0) & 0xFFFFFF,
          hl: (cpu._hl ?? 0) & 0xFFFFFF,
          sp: cpu.sp & 0xFFFFFF,
          op1: bytesAt(mem, OP1_BASE, 8),
        });
      },
      onDynamicTarget(target, mode, pc, step) {
        dynamicTargets.push({ target, mode, pc, step });
      },
    });

    const afterOP1 = bytesAt(mem, OP1_BASE, 8);

    return {
      startPc,
      callerAddr,
      result,
      traceSteps,
      writes: tracer.writes,
      dynamicTargets,
      beforeOP1,
      afterOP1,
      reached0820ED,
    };
  } finally {
    tracer.restore();
  }
}

// ─── Reporting ───

function printCallerReport(callers, romBytes) {
  console.log('\n' + '='.repeat(72));
  console.log('PART 1: Static CALL/JP 0x0820ED search across 4MB ROM');
  console.log('='.repeat(72));
  console.log(`Found ${callers.length} call/jump sites targeting ${hex(TARGET_FUNC)}:\n`);

  for (const caller of callers) {
    console.log(`  ${hex(caller.address)}  ${caller.instrType}  [${classifyRegion(caller.address)}]`);

    // Show context bytes with the call site highlighted
    const offsetInContext = caller.address - caller.contextStart;
    const before = caller.context.slice(0, offsetInContext);
    const instr = caller.context.slice(offsetInContext, offsetInContext + 4);
    const after = caller.context.slice(offsetInContext + 4);

    console.log(`    context: ${formatBytes(before)} |${formatBytes(instr)}| ${formatBytes(after)}`);

    // Try to disassemble 24 bytes before the call
    const disasmStart = Math.max(0, caller.address - 24);
    const disasmEnd = caller.address + 4;
    console.log(`    disasm around call site (${hex(disasmStart)}..${hex(disasmEnd)}):`);

    let pc = disasmStart;
    while (pc < disasmEnd) {
      try {
        const ins = decodeInstruction(romBytes, pc, 'adl');
        const len = Math.max(1, ins?.length ?? 1);
        const instrBytes = romBytes.subarray(pc, pc + len);
        const marker = pc === caller.address ? ' <-- CALL' : '';
        console.log(`      ${hex(pc)}  ${formatBytes(instrBytes).padEnd(20)}  ${formatInstr(ins)}${marker}`);
        pc += len;
      } catch {
        console.log(`      ${hex(pc)}  ${hexByte(romBytes[pc])}                     DB`);
        pc += 1;
      }
    }
    console.log('');
  }
}

function formatInstr(ins) {
  if (!ins) return 'DB ??';
  const tag = ins.tag ?? '??';

  switch (tag) {
    case 'call': return `CALL ${hex(ins.target)}`;
    case 'call-conditional': return `CALL ${(ins.condition ?? '??').toUpperCase()}, ${hex(ins.target)}`;
    case 'jp': return `JP ${hex(ins.target)}`;
    case 'jp-conditional': return `JP ${(ins.condition ?? '??').toUpperCase()}, ${hex(ins.target)}`;
    case 'jr': return `JR ${hex(ins.target)}`;
    case 'jr-conditional': return `JR ${(ins.condition ?? '??').toUpperCase()}, ${hex(ins.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${(ins.condition ?? '??').toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${(ins.pair ?? '??').toUpperCase()}, ${hex(ins.value)}`;
    case 'ld-pair-mem':
      return ins.direction === 'to-mem'
        ? `LD (${hex(ins.addr)}), ${(ins.pair ?? '??').toUpperCase()}`
        : `LD ${(ins.pair ?? '??').toUpperCase()}, (${hex(ins.addr)})`;
    case 'ld-reg-mem': return `LD ${(ins.dest ?? '??').toUpperCase()}, (${hex(ins.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(ins.addr)}), ${(ins.src ?? '??').toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${(ins.dest ?? '??').toUpperCase()}, ${hexByte(ins.value)}`;
    case 'ld-reg-reg': return `LD ${(ins.dest ?? '??').toUpperCase()}, ${(ins.src ?? '??').toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${(ins.dest ?? '??').toUpperCase()}, (${(ins.src ?? '??').toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${(ins.dest ?? '??').toUpperCase()}), ${(ins.src ?? '??').toUpperCase()}`;
    case 'ld-ind-imm': return `LD (HL), ${hexByte(ins.value)}`;
    case 'push': return `PUSH ${(ins.pair ?? '??').toUpperCase()}`;
    case 'pop': return `POP ${(ins.pair ?? '??').toUpperCase()}`;
    case 'inc-reg': return `INC ${(ins.reg ?? '??').toUpperCase()}`;
    case 'dec-reg': return `DEC ${(ins.reg ?? '??').toUpperCase()}`;
    case 'inc-pair': return `INC ${(ins.pair ?? '??').toUpperCase()}`;
    case 'dec-pair': return `DEC ${(ins.pair ?? '??').toUpperCase()}`;
    case 'add-pair': return `ADD ${(ins.dest ?? '??').toUpperCase()}, ${(ins.src ?? '??').toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${(ins.src ?? '??').toUpperCase()}`;
    case 'alu-imm': return `${(ins.op ?? '??').toUpperCase()} ${hexByte(ins.value)}`;
    case 'alu-reg': return `${(ins.op ?? '??').toUpperCase()} ${(ins.src ?? '??').toUpperCase()}`;
    case 'djnz': return `DJNZ ${hex(ins.target)}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'bit': return `BIT ${ins.bit ?? '?'}, ${(ins.reg ?? '??').toUpperCase()}`;
    case 'set': return `SET ${ins.bit ?? '?'}, ${(ins.reg ?? '??').toUpperCase()}`;
    case 'res': return `RES ${ins.bit ?? '?'}, ${(ins.reg ?? '??').toUpperCase()}`;
    case 'rst': return `RST ${hexByte(ins.vector ?? ins.target ?? 0)}`;
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'or-a': return 'OR A';
    case 'xor-a': return 'XOR A';
    case 'cp-imm': return `CP ${hexByte(ins.value)}`;
    case 'cp-reg': return `CP ${(ins.src ?? '??').toUpperCase()}`;
    default: return `${tag.toUpperCase()} ${JSON.stringify(ins)}`;
  }
}

function printWriterReport(writers) {
  console.log('\n' + '='.repeat(72));
  console.log('PART 2: D005F8-D005FF writer search (who populates the entry buffer)');
  console.log('='.repeat(72));
  console.log(`Found ${writers.length} instruction sites writing to/referencing D005F8-D005FF:\n`);

  for (const w of writers) {
    const region = classifyRegion(w.address);
    const bufOffset = w.offsetInBuffer >= 0 ? `buf+${w.offsetInBuffer}` : 'ref';
    console.log(`  ${hex(w.address)}  ${w.instrType.padEnd(50)}  [${region}] ${bufOffset}`);
  }
}

function printDynamicReport(traces) {
  console.log('\n' + '='.repeat(72));
  console.log('PART 3: Dynamic traces from caller setup chains');
  console.log('='.repeat(72));

  for (const trace of traces) {
    console.log(`\n--- Caller at ${hex(trace.callerAddr)} (start tracing from ${hex(trace.startPc)}) ---`);
    console.log(`  result: termination=${trace.result.termination} steps=${trace.result.steps} lastPc=${hex(trace.result.lastPc)}`);
    console.log(`  reached 0x0820ED: ${trace.reached0820ED ? 'YES' : 'NO'}`);
    console.log(`  OP1 before: ${formatBytes(trace.beforeOP1)}`);
    console.log(`  OP1 after:  ${formatBytes(trace.afterOP1)}`);

    console.log('  block trace:');
    for (const step of trace.traceSteps.slice(0, 40)) {
      console.log(
        `    step=${String(step.step).padStart(3)} pc=${hex(step.pc)}`
        + ` A=${hexByte(step.a)} BC=${hex(step.bc)} DE=${hex(step.de)} HL=${hex(step.hl)} SP=${hex(step.sp)}`
        + ` OP1[0..3]=${formatBytes(step.op1.slice(0, 4))}`
      );
    }
    if (trace.traceSteps.length > 40) {
      console.log(`    ... (${trace.traceSteps.length - 40} more steps omitted)`);
    }

    if (trace.writes.length > 0) {
      console.log('  watched writes:');
      for (const w of trace.writes.slice(0, 30)) {
        const wd = w.width * 2;
        console.log(`    pc=${hex(w.pc)} write${w.width * 8} ${hex(w.addr)}: ${hex(w.before, wd)} -> ${hex(w.after, wd)}`);
      }
      if (trace.writes.length > 30) {
        console.log(`    ... (${trace.writes.length - 30} more writes omitted)`);
      }
    } else {
      console.log('  watched writes: (none)');
    }

    if (trace.dynamicTargets.length > 0) {
      console.log('  dynamic targets:');
      for (const dt of trace.dynamicTargets) {
        console.log(`    step=${dt.step} from=${hex(dt.pc)} -> ${hex(dt.target)}`);
      }
    }
  }
}

// ─── Main ───

async function main() {
  console.log('probe-phase277-0820ed-callers');
  console.log(`target function: ${hex(TARGET_FUNC)} (entry writer)`);
  console.log(`entry buffer: ${hex(OP1_BASE)}-${hex(OP1_END)}`);
  console.log('');

  // Load ROM
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  console.log(`ROM loaded: ${romBytes.length} bytes`);

  // Part 1: Static caller search
  const callers = findCallersInRom(romBytes);
  printCallerReport(callers, romBytes);

  // Part 2: D005F8 writer search
  const writers = findD005FxWriters(romBytes);
  printWriterReport(writers);

  // Part 3: Dynamic trace of first 3 callers
  if (callers.length === 0) {
    console.log('\nNo callers found — skipping dynamic trace.');
    return;
  }

  console.log('\nLoading transpiled blocks for dynamic tracing...');
  const { blocks, assets } = await loadBlocks();
  const kernelInfo = resolveKernelInitEntry(blocks);

  try {
    const runtime = createRuntime(romBytes, blocks);
    console.log('Booting OS (50K kernel init steps)...');
    const bootResult = bootRuntime(runtime, kernelInfo);
    console.log(`Boot: ${bootResult.boot.steps} steps, kernel: ${bootResult.kernelInit.steps} steps`);

    const baseline = snapshotRuntime(runtime.cpu, runtime.mem);

    const callersToTrace = callers
      .filter((c) => c.instrType.startsWith('CALL'))
      .slice(0, 3);

    console.log(`\nTracing ${callersToTrace.length} caller(s) dynamically...`);
    const traces = [];

    for (const caller of callersToTrace) {
      const trace = runCallerTrace(runtime, baseline, caller.address);
      traces.push(trace);
    }

    printDynamicReport(traces);
  } finally {
    cleanupTranspiledModule(assets);
  }

  // Summary
  console.log('\n' + '='.repeat(72));
  console.log('SUMMARY');
  console.log('='.repeat(72));
  console.log(`Total CALL/JP sites to ${hex(TARGET_FUNC)}: ${callers.length}`);
  console.log(`  CALL sites: ${callers.filter((c) => c.instrType.startsWith('CALL')).length}`);
  console.log(`  JP sites: ${callers.filter((c) => c.instrType.startsWith('JP')).length}`);
  console.log(`Regions:`);
  const regionCounts = {};
  for (const c of callers) {
    const r = classifyRegion(c.address);
    regionCounts[r] = (regionCounts[r] ?? 0) + 1;
  }
  for (const [region, count] of Object.entries(regionCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${region}: ${count}`);
  }
  console.log(`D005F8-D005FF writer/reference sites: ${writers.length}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
