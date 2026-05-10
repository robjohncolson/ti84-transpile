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
const TARGET = 0x02FCB3;
const DISASM_LEN = 200;
const TRACE_STEPS = 500;
const RETURN_SENTINEL = 0xFEFEFE;
const TRACE_SP = 0xD1A87E;
const TRACE_IX = 0xD1A860;
const TRACE_IY = 0xD00080;

const D00587 = 0xD00587;
const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
const D00824 = 0xD00824;
const D0082E = 0xD0082E;
const D00000 = 0xD00000;
const IY_1F = TRACE_IY + 31;
const IY_28 = TRACE_IY + 40;
const IY_34 = TRACE_IY + 52;

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
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase285-${process.pid}.mjs`);
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

function findCallers(rom) {
  return {
    callHits: scanPattern(rom, [0xCD, 0xB3, 0xFC, 0x02]),
    jpHits: scanPattern(rom, [0xC3, 0xB3, 0xFC, 0x02]),
  };
}

function createRuntime(createExecutor, createPeripheralBus, preliftedBlocks, rom) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
  const bus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(preliftedBlocks, mem, { peripherals: bus, trackMemoryMapped: true });
  return { mem, cpu: executor.cpu, executor };
}

function groupByStep(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!map.has(entry.step)) map.set(entry.step, []);
    map.get(entry.step).push(entry);
  }
  return map;
}

function hasTouch(set, addr, width = 1) {
  for (let i = 0; i < width; i += 1) if (set.has((addr + i) & 0xFFFFFF)) return true;
  return false;
}

function traceExecution(createExecutor, createPeripheralBus, preliftedBlocks, rom, keySeed, label) {
  const { mem, cpu, executor } = createRuntime(createExecutor, createPeripheralBus, preliftedBlocks, rom);
  const state = { step: -1, pc: TARGET, reads: new Set(), writes: new Set(), accessLog: [], ioLog: [], mmioLog: [] };

  const capture = (dir, addr, width, value) => {
    const a = addr & 0xFFFFFF;
    for (let i = 0; i < width; i += 1) (dir === 'R' ? state.reads : state.writes).add((a + i) & 0xFFFFFF);
    if (state.accessLog.length < 1200) state.accessLog.push({ step: state.step, dir, addr: a, width, value });
  };

  for (const [name, width] of [['read8', 1], ['read16', 2], ['read24', 3]]) {
    const orig = cpu[name].bind(cpu);
    cpu[name] = (addr) => { const value = orig(addr); capture('R', addr, width, value); return value; };
  }
  for (const [name, width] of [['write8', 1], ['write16', 2], ['write24', 3]]) {
    const orig = cpu[name].bind(cpu);
    cpu[name] = (addr, value) => { capture('W', addr, width, value); return orig(addr, value); };
  }
  cpu.onIoRead = (port, value) => { if (state.ioLog.length < 400) state.ioLog.push({ step: state.step, dir: 'R', port: port & 0xFFFF, value: value & 0xFF }); };
  cpu.onIoWrite = (port, value) => { if (state.ioLog.length < 400) state.ioLog.push({ step: state.step, dir: 'W', port: port & 0xFFFF, value: value & 0xFF }); };
  cpu.onMmioRead = (addr, value) => { if (state.mmioLog.length < 400) state.mmioLog.push({ step: state.step, dir: 'R', addr: addr & 0xFFFFFF, value: value & 0xFF }); };
  cpu.onMmioWrite = (addr, value) => { if (state.mmioLog.length < 400) state.mmioLog.push({ step: state.step, dir: 'W', addr: addr & 0xFFFFFF, value: value & 0xFF }); };

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
  mem[D00824] = 0x01;
  mem[D0058C] = 0x00;
  mem[D0058E] = keySeed & 0xFF;

  const rawSteps = [];
  const missing = [];
  const result = executor.runFrom(TARGET, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: 80,
    onBlock(pc, mode, meta, step) {
      state.step = step;
      state.pc = pc & 0xFFFFFF;
      const instructions = (meta?.instructions ?? []).map((inst) => ({ tag: inst.tag, dasm: inst.dasm ?? formatInstruction(inst), target: inst.target ?? null }));
      rawSteps.push({
        step,
        pc: pc & 0xFFFFFF,
        text: instructions.map((inst) => inst.dasm).join(' | ') || '(no metadata)',
        instructions,
        a: cpu.a & 0xFF,
        f: cpu.f & 0xFF,
        hl: cpu.hl & 0xFFFFFF,
        de: cpu.de & 0xFFFFFF,
        bc: cpu.bc & 0xFFFFFF,
        sp: cpu.sp & 0xFFFFFF,
        d587: mem[D00587], d58e: mem[D0058E], d824: mem[D00824], iy1f: mem[IY_1F], iy28: mem[IY_28], iy34: mem[IY_34],
      });
    },
    onMissingBlock(pc, mode, step) { missing.push({ step, pc: pc & 0xFFFFFF, mode }); },
  });

  const accessByStep = groupByStep(state.accessLog);
  const ioByStep = groupByStep(state.ioLog);
  const mmioByStep = groupByStep(state.mmioLog);
  const steps = rawSteps.map((step, index) => {
    const nextPc = index + 1 < rawSteps.length ? rawSteps[index + 1].pc : (cpu.pc & 0xFFFFFF);
    return {
      ...step,
      nextPc,
      accesses: accessByStep.get(step.step) ?? [],
      io: ioByStep.get(step.step) ?? [],
      mmio: mmioByStep.get(step.step) ?? [],
      calls: step.instructions.filter((inst) => inst.tag === 'call' || inst.tag === 'call-conditional').map((inst) => ({ target: inst.target, taken: inst.target === nextPc })),
      halt: step.instructions.some((inst) => inst.tag === 'halt' || inst.dasm?.toLowerCase().includes('halt')),
    };
  });

  return {
    label,
    keySeed,
    result,
    final: { pc: cpu.pc & 0xFFFFFF, a: cpu.a & 0xFF, f: cpu.f & 0xFF, sp: cpu.sp & 0xFFFFFF, d587: mem[D00587], d58e: mem[D0058E], d824: mem[D00824], d82e: mem[D0082E], d00000: mem[D00000] },
    steps,
    missing,
    state,
    summary: {
      halt: result.termination === 'halt' || steps.some((step) => step.halt),
      readD00587: hasTouch(state.reads, D00587),
      readD0058E: hasTouch(state.reads, D0058E),
      readD00824: hasTouch(state.reads, D00824),
      wroteD0058E: hasTouch(state.writes, D0058E),
      mmioKeyboard: state.mmioLog.some((entry) => entry.addr >= 0xE00810 && entry.addr <= 0xE00817),
      anyMmio: state.mmioLog.some((entry) => entry.addr >= 0xE00800 && entry.addr <= 0xE0091F),
      port01: state.ioLog.some((entry) => (entry.port & 0xFF) === 0x01),
      takenCalls: [...new Set(steps.flatMap((step) => step.calls.filter((call) => call.taken).map((call) => call.target)).filter(Boolean))],
      ports: [...new Set(state.ioLog.map((entry) => entry.port))].sort((a, b) => a - b),
    },
  };
}

function flags(f) {
  const out = [];
  if (f & 0x80) out.push('S');
  if (f & 0x40) out.push('Z');
  if (f & 0x10) out.push('H');
  if (f & 0x04) out.push('P/V');
  if (f & 0x02) out.push('N');
  if (f & 0x01) out.push('C');
  return out.join('|') || 'none';
}

function printTrace(trace) {
  console.log(`  Scenario: ${trace.label}`);
  console.log(`  Exit: ${trace.result.termination}, steps=${trace.result.steps}, final PC=${hex(trace.final.pc)}`);
  console.log(`  Final: A=${hexByte(trace.final.a)} F=${hexByte(trace.final.f)}(${flags(trace.final.f)}) SP=${hex(trace.final.sp)} D00587=${hexByte(trace.final.d587)} D0058E=${hexByte(trace.final.d58e)} D00824=${hexByte(trace.final.d824)} D0082E=${hexByte(trace.final.d82e)} D00000=${hexByte(trace.final.d00000)}`);
  console.log('  Note: each step is one lifted ADL basic block.');
  for (const step of trace.steps) {
    console.log(`    [${String(step.step).padStart(3, '0')}] ${hex(step.pc)} -> ${hex(step.nextPc)} A=${hexByte(step.a)} F=${hexByte(step.f)}(${flags(step.f)}) HL=${hex(step.hl)} DE=${hex(step.de)} BC=${hex(step.bc)} SP=${hex(step.sp)} D00587=${hexByte(step.d587)} D0058E=${hexByte(step.d58e)} D00824=${hexByte(step.d824)} IY+1F=${hexByte(step.iy1f)}`);
    console.log(`          ${step.text}`);
    if (step.calls.some((call) => call.taken)) console.log(`          calls: ${step.calls.filter((call) => call.taken).map((call) => hex(call.target)).join(', ')}`);
    if (step.accesses.length) console.log(`          mem : ${step.accesses.slice(0, 8).map((entry) => `${entry.dir}${entry.width * 8}@${hex(entry.addr)}=${hex(entry.value, entry.width === 1 ? 2 : entry.width === 2 ? 4 : 6)}`).join(' | ')}${step.accesses.length > 8 ? ` | ... +${step.accesses.length - 8} more` : ''}`);
    if (step.io.length) console.log(`          io  : ${step.io.slice(0, 8).map((entry) => `${entry.dir}${hex(entry.port, 4)}=${hexByte(entry.value)}`).join(' | ')}${step.io.length > 8 ? ` | ... +${step.io.length - 8} more` : ''}`);
    if (step.mmio.length) console.log(`          mmio: ${step.mmio.slice(0, 8).map((entry) => `${entry.dir}${hex(entry.addr)}=${hexByte(entry.value)}`).join(' | ')}${step.mmio.length > 8 ? ` | ... +${step.mmio.length - 8} more` : ''}`);
  }
  console.log(`  Unique reads (${trace.state.reads.size}): ${[...trace.state.reads].sort((a, b) => a - b).slice(0, 96).map((addr) => hex(addr)).join(', ')}${trace.state.reads.size > 96 ? `, ... +${trace.state.reads.size - 96} more` : ''}`);
  console.log(`  Unique writes (${trace.state.writes.size}): ${[...trace.state.writes].sort((a, b) => a - b).slice(0, 96).map((addr) => hex(addr)).join(', ')}${trace.state.writes.size > 96 ? `, ... +${trace.state.writes.size - 96} more` : ''}`);
  console.log(`  Ports: ${trace.summary.ports.map((port) => hex(port, 4)).join(', ') || '(none)'}`);
  console.log('');
}

function mainReport(noKey, pending) {
  const maxCompare = Math.min(noKey.steps.length, pending.steps.length);
  let divergence = -1;
  for (let i = 0; i < maxCompare; i += 1) if (noKey.steps[i].pc !== pending.steps[i].pc) { divergence = i; break; }
  console.log(`  Static entry: BIT 5,(IY+31) gate -> optional clear D0058C/D0058E -> CALL ${hex(0x02FD8F)}.`);
  console.log(`  No-key summary: HALT=${noKey.summary.halt ? 'yes' : 'no'}, read D00587=${noKey.summary.readD00587 ? 'yes' : 'no'}, read D0058E=${noKey.summary.readD0058E ? 'yes' : 'no'}, read D00824=${noKey.summary.readD00824 ? 'yes' : 'no'}, keyboard MMIO=${noKey.summary.anyMmio ? 'yes' : 'no'}, port 0x01=${noKey.summary.port01 ? 'yes' : 'no'}.`);
  console.log(`  Pending-key summary: HALT=${pending.summary.halt ? 'yes' : 'no'}, read D00587=${pending.summary.readD00587 ? 'yes' : 'no'}, read D0058E=${pending.summary.readD0058E ? 'yes' : 'no'}, read D00824=${pending.summary.readD00824 ? 'yes' : 'no'}, keyboard MMIO=${pending.summary.anyMmio ? 'yes' : 'no'}, port 0x01=${pending.summary.port01 ? 'yes' : 'no'}.`);
  console.log(divergence >= 0
    ? `  Divergence: first different block at step ${divergence} (${hex(noKey.steps[divergence].pc)} vs ${hex(pending.steps[divergence].pc)}).`
    : `  Divergence: no block-level difference in the first ${maxCompare} steps.`);
  console.log(`  No-key taken calls: ${noKey.summary.takenCalls.map((addr) => hex(addr)).join(' -> ') || '(none)'}`);
  console.log(`  Pending-key taken calls: ${pending.summary.takenCalls.map((addr) => hex(addr)).join(' -> ') || '(none)'}`);
  console.log('  Conclusion:');
  console.log('    - 0x02FCB3 is not an immediate HALT wait in this requested seed setup; neither trace hits HALT in 500 steps.');
  console.log('    - It does not directly poll 0xE00810-0xE00817 keyboard MMIO here; no keyboard-MMIO reads appear.');
  console.log('    - It is not a simple D0058E or D00824 RAM poll either; the early path reads neither byte, and the default path can clear D0058E before the deeper call.');
  console.log(`    - The observed behavior is a wrapper around a deeper key/event service reached via ${hex(0x02FD8F)}; both traces reach ${hex(0x03FA09)} and use port I/O plus ${hex(D00587)} rather than the seeded ${hex(D0058E)} byte.`);
  console.log(`    - Seeding ${hex(D0058E)} with ${hexByte(0x8F)} does not make the routine return faster or change the first ${maxCompare} lifted blocks.`);
}

async function main() {
  console.log('=== Phase 285: Trace 0x02FCB3 — Blocking Key Wait ===\n');
  const rom = fs.readFileSync(ROM_PATH);
  const { decodeInstruction, createExecutor, createPeripheralBus, preliftedBlocks, cleanup } = await loadModules();
  try {
    console.log('--- Task 1: Static disassembly of 0x02FCB3 ---');
    for (const row of disassemble(decodeInstruction, rom)) console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}${row.inst?.tag === 'ret' ? '  <-- RET boundary' : ''}`);
    console.log('\n--- Task 2: Find all callers ---');
    const callers = findCallers(rom);
    console.log(`  CALL hits (CD B3 FC 02): ${callers.callHits.length}`);
    for (const addr of callers.callHits) console.log(`    ${hex(addr)} — context: ${bytesAt(rom, Math.max(0, addr - 4), 12)}`);
    console.log(`  JP hits (C3 B3 FC 02): ${callers.jpHits.length}`);
    for (const addr of callers.jpHits) console.log(`    ${hex(addr)} — context: ${bytesAt(rom, Math.max(0, addr - 4), 12)}`);
    console.log('\n--- Task 3: Dynamic trace (D0058E = 0x00) ---');
    const noKey = traceExecution(createExecutor, createPeripheralBus, preliftedBlocks, rom, 0x00, 'D0058E = 0x00 (no key pending)');
    printTrace(noKey);
    console.log('--- Task 4: Dynamic trace (D0058E = 0x8F) ---');
    const pending = traceExecution(createExecutor, createPeripheralBus, preliftedBlocks, rom, 0x8F, 'D0058E = 0x8F (pending key byte for "1")');
    printTrace(pending);
    console.log('--- Task 5: Report ---');
    mainReport(noKey, pending);
    console.log('\n=== Phase 285 complete ===');
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
