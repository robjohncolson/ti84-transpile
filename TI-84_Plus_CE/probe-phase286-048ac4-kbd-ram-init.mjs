#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const TARGET = 0x048AC4;
const DISASM_LEN = 100;
const TRACE_STEPS = 150;
const RETURN_SENTINEL = 0xFEFEFE;
const TRACE_SP = 0xD1A87E;
const TRACE_IX = 0xD1A860;
const TRACE_IY = 0xD00080;

// Known keyboard RAM locations
const D0058C = 0xD0058C;
const D0058E = 0xD0058E;

function hex(v, w = 6) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function hexByte(v) {
  return hex((v ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, addr, len) {
  return Array.from(buffer.subarray(addr, addr + len))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function write24(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(a + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';
  const idx = `(${inst.indexRegister ?? 'ix'}${(inst.displacement ?? 0) >= 0 ? '+' : ''}${inst.displacement ?? 0})`;
  switch (inst.tag) {
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${idx}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${idx}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${idx}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-mem': return `ld ${inst.dest ?? inst.dst}, (${hex(inst.addr)})`;
    case 'ld-reg-imm': return `ld ${inst.dest ?? inst.dst}, ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-ind': return `ld ${inst.dest ?? inst.dst}, (${inst.src ?? inst.ptr})`;
    case 'ld-ind-imm': return `ld (hl), ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'in-reg': return `in ${inst.reg ?? 'a'}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg ?? 'a'}`;
    case 'in0': return `in0 ${inst.reg ?? 'a'}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${inst.reg ?? 'a'}`;
    default: return inst.dasm ?? inst.tag;
  }
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) throw new Error('Missing ROM.transpiled.js and ROM.transpiled.js.gz.');
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase286-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

async function loadModules() {
  const assets = ensureTranspiledModule();
  const [{ decodeInstruction }, { createExecutor }, { createPeripheralBus }, romModule] = await Promise.all([
    import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href),
    import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href),
    import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href),
    import(pathToFileURL(assets.modulePath).href),
  ]);
  return {
    decodeInstruction,
    createExecutor,
    createPeripheralBus,
    preliftedBlocks: romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule,
    cleanup() { cleanupTranspiledModule(assets); },
  };
}

function scanPattern(buffer, pattern) {
  const hits = [];
  for (let i = 0; i <= buffer.length - pattern.length; i += 1) {
    let ok = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (buffer[i + j] !== pattern[j]) { ok = false; break; }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

// --- Task 1: Static disassembly ---

function disassemble(decodeInstruction, rom) {
  const rows = [];
  let pc = TARGET;
  const end = Math.min(rom.length, TARGET + DISASM_LEN);
  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = Math.max(1, inst?.length ?? 1);
    rows.push({ pc, bytes: bytesAt(rom, pc, len), text: inst?.dasm ?? formatInstruction(inst), inst });
    pc += len;
    if (inst?.tag === 'ret' || inst?.tag === 'reti' || inst?.tag === 'retn') break;
  }
  return rows;
}

// --- Task 2: Dynamic trace with memory write logging ---

function traceExecution(createExecutor, createPeripheralBus, preliftedBlocks, rom) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
  const bus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(preliftedBlocks, mem, { peripherals: bus, trackMemoryMapped: true });
  const cpu = executor.cpu;

  // Collect ALL memory writes
  const writeLog = [];
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0x400000) writeLog.push({ addr: a, value: value & 0xFF, width: 1 });
    return origWrite8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0x400000) {
      writeLog.push({ addr: a, value: value & 0xFFFF, width: 2 });
    }
    return origWrite16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0x400000) {
      writeLog.push({ addr: a, value: value & 0xFFFFFF, width: 3 });
    }
    return origWrite24(addr, value);
  };

  // Set up CPU state
  cpu.pc = TARGET;
  cpu.sp = TRACE_SP;
  cpu.ix = TRACE_IX;
  cpu.iy = TRACE_IY;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;
  cpu.i = 0;
  cpu.im = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const steps = [];
  const missing = [];
  const result = executor.runFrom(TARGET, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: 80,
    onBlock(pc, mode, meta, step) {
      const instructions = (meta?.instructions ?? []).map((inst) => ({ tag: inst.tag, dasm: inst.dasm ?? formatInstruction(inst) }));
      steps.push({
        step,
        pc: pc & 0xFFFFFF,
        text: instructions.map((inst) => inst.dasm).join(' | ') || '(no metadata)',
        a: cpu.a & 0xFF,
        f: cpu.f & 0xFF,
        hl: cpu.hl & 0xFFFFFF,
        de: cpu.de & 0xFFFFFF,
        bc: cpu.bc & 0xFFFFFF,
        sp: cpu.sp & 0xFFFFFF,
      });
    },
    onMissingBlock(pc, mode, step) { missing.push({ step, pc: pc & 0xFFFFFF, mode }); },
  });

  return { result, cpu, steps, missing, writeLog };
}

// --- Task 3: RAM write summary ---

function summarizeWrites(writeLog) {
  // Group by page (upper 3 nibbles, e.g. D005xx, D006xx)
  const pageMap = new Map();
  for (const entry of writeLog) {
    const page = (entry.addr >> 8) & 0xFFFF;
    const key = `${page.toString(16).toUpperCase().padStart(4, '0')}xx`;
    if (!pageMap.has(key)) pageMap.set(key, { count: 0, addrs: new Set() });
    const bucket = pageMap.get(key);
    bucket.count += 1;
    bucket.addrs.add(entry.addr);
  }
  return pageMap;
}

// --- Task 4: Caller analysis ---

function findCallers(rom) {
  // CALL 0x048AC4 encodes as CD C4 8A 04 (opcode CD, then 24-bit little-endian address)
  const callHits = scanPattern(rom, [0xCD, 0xC4, 0x8A, 0x04]);
  const jpHits = scanPattern(rom, [0xC3, 0xC4, 0x8A, 0x04]);
  return { callHits, jpHits };
}

// --- Main ---

async function main() {
  console.log('=== Phase 286: Trace 0x048AC4 — Keyboard RAM Initializer ===\n');
  const rom = fs.readFileSync(ROM_PATH);
  const { decodeInstruction, createExecutor, createPeripheralBus, preliftedBlocks, cleanup } = await loadModules();

  try {
    // Task 1: Static disassembly
    console.log('--- Task 1: Static disassembly of 0x048AC4 (100 bytes) ---');
    const rows = disassemble(decodeInstruction, rom);
    for (const row of rows) {
      console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}${row.inst?.tag === 'ret' ? '  <-- RET boundary' : ''}`);
    }

    // Task 2: Dynamic trace
    console.log('\n--- Task 2: Dynamic trace (PC=0x048AC4, 150 steps) ---');
    const trace = traceExecution(createExecutor, createPeripheralBus, preliftedBlocks, rom);
    console.log(`  Exit: ${trace.result.termination}, steps=${trace.result.steps}, final PC=${hex(trace.cpu.pc & 0xFFFFFF)}`);
    console.log(`  Final: A=${hexByte(trace.cpu.a)} F=${hexByte(trace.cpu.f)} SP=${hex(trace.cpu.sp & 0xFFFFFF)} HL=${hex(trace.cpu.hl & 0xFFFFFF)} DE=${hex(trace.cpu.de & 0xFFFFFF)} BC=${hex(trace.cpu.bc & 0xFFFFFF)}`);
    console.log(`  Total memory writes logged: ${trace.writeLog.length}`);
    if (trace.missing.length) {
      console.log(`  Missing blocks: ${trace.missing.length}`);
      for (const m of trace.missing.slice(0, 10)) console.log(`    step=${m.step} PC=${hex(m.pc)} mode=${m.mode}`);
    }
    console.log('\n  Step-by-step trace:');
    for (const step of trace.steps) {
      console.log(`    [${String(step.step).padStart(3, '0')}] ${hex(step.pc)} A=${hexByte(step.a)} F=${hexByte(step.f)} HL=${hex(step.hl)} DE=${hex(step.de)} BC=${hex(step.bc)} SP=${hex(step.sp)}`);
      console.log(`          ${step.text}`);
    }

    // Print all memory writes
    console.log('\n  All memory writes (addr = value):');
    for (const entry of trace.writeLog) {
      const valStr = entry.width === 1 ? hexByte(entry.value) : entry.width === 2 ? hex(entry.value, 4) : hex(entry.value);
      console.log(`    ${hex(entry.addr)} = ${valStr} (${entry.width * 8}-bit)`);
    }

    // Task 3: RAM write summary
    console.log('\n--- Task 3: RAM write summary (grouped by page) ---');
    const pageMap = summarizeWrites(trace.writeLog);
    const sortedPages = [...pageMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [page, info] of sortedPages) {
      console.log(`  ${page}: ${info.count} writes, ${info.addrs.size} unique addresses`);
      const addrs = [...info.addrs].sort((a, b) => a - b);
      if (addrs.length <= 20) {
        console.log(`    addresses: ${addrs.map((a) => hex(a)).join(', ')}`);
      } else {
        console.log(`    addresses (first 20): ${addrs.slice(0, 20).map((a) => hex(a)).join(', ')} ... +${addrs.length - 20} more`);
      }
    }

    // Check known keyboard RAM locations
    const allWrittenAddrs = new Set(trace.writeLog.map((e) => e.addr));
    console.log(`\n  Known keyboard RAM locations:`);
    console.log(`    D0058C (key scan result): ${allWrittenAddrs.has(D0058C) ? 'WRITTEN' : 'not written'}`);
    console.log(`    D0058E (pending key byte): ${allWrittenAddrs.has(D0058E) ? 'WRITTEN' : 'not written'}`);

    // Also check a range around D005xx for any hits
    const d005writes = trace.writeLog.filter((e) => (e.addr & 0xFFFF00) === 0xD00500);
    if (d005writes.length) {
      console.log(`    All writes in D005xx range:`);
      for (const w of d005writes) console.log(`      ${hex(w.addr)} = ${hexByte(w.value)}`);
    }

    // Task 4: Caller analysis
    console.log('\n--- Task 4: Caller analysis (CALL 0x048AC4 = CD C4 8A 04) ---');
    const callers = findCallers(rom);
    console.log(`  CALL hits: ${callers.callHits.length}`);
    for (const addr of callers.callHits) {
      console.log(`    ${hex(addr)} — context: ${bytesAt(rom, Math.max(0, addr - 4), 12)}`);
    }
    console.log(`  JP hits: ${callers.jpHits.length}`);
    for (const addr of callers.jpHits) {
      console.log(`    ${hex(addr)} — context: ${bytesAt(rom, Math.max(0, addr - 4), 12)}`);
    }

    console.log('\n=== Phase 286 complete ===');
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
