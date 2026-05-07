#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const transpiled = await import('./ROM.transpiled.js');
const BLOCKS = normalizeBlocks(
  transpiled.PRELIFTED_BLOCKS ??
  transpiled.default?.PRELIFTED_BLOCKS ??
  transpiled.default ??
  transpiled,
);
const rom = readFileSync(ROM_PATH);

/* ── Constants ── */
const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xd1a87e;
const MBASE = 0xd0;
const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const IY5 = IY_ADDR + 0x05;
const IY12 = IY_ADDR + 0x0c;
const IY14 = IY_ADDR + 0x0e;
const IY18 = IY_ADDR + 0x18;
const IY44 = IY_ADDR + 0x44;
const EDIT_TOP = 0xd02437;
const EDIT_CURSOR = 0xd0243a;
const EDIT_TAIL = 0xd0243d;
const EDIT_BOTTOM = 0xd02440;
const EDIT_BUF = 0xd00a00;
const EDIT_END = 0xd00b00;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEM_INIT_ENTRY = 0x09dee0;
const MEM_INIT_RET = 0x7ffff6;
const TRACE_RET = 0x7ffffe;
const TRACE_MAX_STEPS = 5000;

const JP_Z_1 = 0x04eb82;   // JP Z to 0x04EC1C
const JP_Z_2 = 0x04eb8d;   // JP Z to 0x04EC1C (when A == 0x0E)
const ENTER_EDIT = 0x04ec1c;

const LOOKBACK = 0x200;
const LOOKAHEAD = 0x200;
const STATIC_RADIUS = 0x80;

const DIRECT24 = new Map([
  [0xcd, 'CALL'], [0xc4, 'CALL NZ'], [0xcc, 'CALL Z'], [0xd4, 'CALL NC'], [0xdc, 'CALL C'],
  [0xe4, 'CALL PO'], [0xec, 'CALL PE'], [0xf4, 'CALL P'], [0xfc, 'CALL M'],
  [0xc3, 'JP'], [0xc2, 'JP NZ'], [0xca, 'JP Z'], [0xd2, 'JP NC'], [0xda, 'JP C'],
  [0xe2, 'JP PO'], [0xea, 'JP PE'], [0xf2, 'JP P'], [0xfa, 'JP M'],
]);
const REQUESTED = new Map([[0xcd, 'CALL'], [0xc3, 'JP']]);
const WATCHED = new Map([[IY5, 'IY+5'], [IY12, 'IY+12'], [IY14, 'IY+14'], [IY18, 'IY+0x18'], [IY44, 'IY+0x44']]);

/* ── Utility functions (from phase 217) ── */
function normalizeBlocks(raw) {
  return Array.isArray(raw)
    ? Object.fromEntries(raw.filter((b) => b?.id).map((b) => [b.id, b]))
    : (raw ?? {});
}
function blockKey(addr, mode = 'adl') { return `${addr.toString(16).padStart(6, '0')}:${mode}`; }
function hasBlock(addr, mode = 'adl') { return Boolean(BLOCKS[blockKey(addr & 0xffffff, mode)]); }
function hex(v, w = 6) { return v === null || v === undefined || Number.isNaN(v) ? null : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`; }
function hexByte(v) { return hex((v ?? 0) & 0xff, 2); }
function bytesAt(buf, start, len) { return Array.from(buf.slice(Math.max(0, start), Math.max(0, start) + Math.max(0, len)), (x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' '); }
function read24(mem, addr) { const a = addr & 0xffffff; return ((mem[a] & 0xff) | ((mem[a + 1] & 0xff) << 8) | ((mem[a + 2] & 0xff) << 16)) >>> 0; }
function write24(mem, addr, value) { const a = addr & 0xffffff; mem[a] = value & 0xff; mem[a + 1] = (value >>> 8) & 0xff; mem[a + 2] = (value >>> 16) & 0xff; }
function push24(cpu, mem, value) { cpu.sp = (cpu.sp - 3) & 0xffffff; write24(mem, cpu.sp, value & 0xffffff); }
function signedOff(v) { return `${v >= 0 ? '+' : '-'}0x${Math.abs(v).toString(16).toUpperCase().padStart(Math.abs(v) <= 0xff ? 2 : 4, '0')}`; }

function decodeSafe(pc) {
  try { return decodeInstruction(rom, pc & 0xffffff, 'adl'); }
  catch (error) { return { pc: pc & 0xffffff, length: 1, tag: 'decode-error', errorMessage: error?.message ?? String(error) }; }
}
function resolveAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') return (((MBASE & 0xff) << 16) | (inst.addr & 0xffff)) >>> 0;
  return inst.addr >>> 0;
}
function fmt(inst) {
  if (!inst) return 'decode-error';
  const d = (v) => (v >= 0 ? `+${v}` : `${v}`);
  const p = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'call': return `${p}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${p}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${p}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${p}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${p}RET`;
    case 'ret-conditional': return `${p}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti': return `${p}RETI`;
    case 'retn': return `${p}RETN`;
    case 'ld-pair-imm': return `${p}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${p}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${p}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${p}LD ${String(inst.dest).toUpperCase()}, (${hex(resolveAddr(inst))})`;
    case 'ld-mem-reg': return `${p}LD (${hex(resolveAddr(inst))}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${p}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'ld-ixd-reg': return `${p}LD (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${p}LD (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'indexed-cb-bit': return `${p}BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'indexed-cb-set': return `${p}SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'indexed-cb-res': return `${p}RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'alu-imm': return `${p}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${p}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'cp-imm': return `${p}CP ${hexByte(inst.value)}`;
    case 'cp-reg': return `${p}CP ${String(inst.src).toUpperCase()}`;
    case 'inc-reg': return `${p}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${p}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${p}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${p}DEC ${String(inst.pair).toUpperCase()}`;
    case 'push': return `${p}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${p}POP ${String(inst.pair).toUpperCase()}`;
    case 'nop': return `${p}NOP`;
    case 'di': return `${p}DI`;
    case 'ei': return `${p}EI`;
    case 'halt': return `${p}HALT`;
    case 'ldir': return `${p}LDIR`;
    case 'lddr': return `${p}LDDR`;
    default: return `${p}${inst.tag}`;
  }
}
function row(inst) { return { pc: hex(inst.pc), pcValue: inst.pc >>> 0, bytes: bytesAt(rom, inst.pc, Math.max(1, inst.length ?? 1)), text: inst.tag === 'decode-error' ? `decode-error: ${inst.errorMessage}` : fmt(inst), tag: inst.tag, length: Math.max(1, inst.length ?? 1) }; }
function hardBoundary(tag) { return ['ret', 'reti', 'retn', 'jp', 'jr', 'jp-indirect', 'halt', 'slp'].includes(tag); }
function retLike(tag) { return ['ret', 'ret-conditional', 'reti', 'retn'].includes(tag); }

function reachesLinearly(startPc, targetPc, maxBytes = 0x200) {
  let pc = startPc & 0xffffff;
  const end = Math.min(rom.length, startPc + maxBytes);
  while (pc < targetPc && pc < end) {
    const inst = decodeSafe(pc);
    if (inst.tag === 'decode-error' || hardBoundary(inst.tag)) return false;
    pc += Math.max(1, inst.length ?? 1);
  }
  return pc === targetPc;
}
function inferEntry(targetPc) {
  for (let addr = targetPc - 1; addr >= Math.max(0, targetPc - LOOKBACK); addr--) {
    const inst = decodeSafe(addr);
    const nextPc = addr + Math.max(1, inst.length ?? 1);
    if (nextPc > targetPc || !hardBoundary(inst.tag)) continue;
    if (!reachesLinearly(nextPc, targetPc, LOOKBACK + STATIC_RADIUS)) continue;
    return { entry: nextPc & 0xffffff, boundaryPc: addr & 0xffffff, boundaryText: fmt(inst), heuristic: 'linear path after preceding hard boundary' };
  }
  return { entry: targetPc & 0xffffff, boundaryPc: null, boundaryText: null, heuristic: 'no preceding hard boundary found' };
}

function decodeRange(startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xffffff;
  const end = Math.min(rom.length, endPc);
  while (pc < end && rows.length < 1024) {
    const r = row(decodeSafe(pc));
    rows.push(r);
    pc += r.length;
    if (r.tag === 'decode-error') break;
  }
  return rows;
}

/* ── Caller scan helpers ── */
function hit(addr, len, label, target, kind) {
  const decoded = decodeSafe(addr);
  return {
    from: hex(addr),
    fromValue: addr >>> 0,
    bytes: bytesAt(rom, addr, len),
    label,
    target: hex(target),
    kind,
    decodedAdl: decoded.tag === 'decode-error' ? `decode-error: ${decoded.errorMessage}` : fmt(decoded),
  };
}
function scanAll24(targetPc) {
  const out = [];
  for (let addr = 0; addr <= rom.length - 4; addr++) {
    const label = DIRECT24.get(rom[addr]);
    if (!label) continue;
    const target = (rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16)) >>> 0;
    if (target === (targetPc >>> 0)) out.push(hit(addr, 4, label, target, 'adl24'));
  }
  return out;
}
function scanPointerRefs(targetPc) {
  const lo = targetPc & 0xff;
  const mid = (targetPc >>> 8) & 0xff;
  const hi = (targetPc >>> 16) & 0xff;
  const out = [];
  for (let addr = 0; addr <= rom.length - 3; addr++) {
    if (rom[addr] === lo && rom[addr + 1] === mid && rom[addr + 2] === hi) {
      // Skip if this is an instruction opcode match (CALL/JP we already found)
      if (addr > 0 && DIRECT24.has(rom[addr - 1])) continue;
      out.push({ addr: hex(addr), addrValue: addr, kind: 'pointer_ref', context: bytesAt(rom, Math.max(0, addr - 4), 11) });
    }
  }
  return out;
}

/* ── Boot sequence (from phase 217) ── */
function createMemory() { const mem = new Uint8Array(MEM_SIZE); mem.set(rom.subarray(0, Math.min(mem.length, rom.length))); return mem; }
function createRuntime(mem) { const peripherals = createPeripheralBus({ timerInterrupt: false }); const executor = createExecutor(BLOCKS, mem, { peripherals }); return { executor, cpu: executor.cpu }; }
function resetOsState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = MBASE; cpu.iy = IY_ADDR; cpu.ix = IX_ADDR; cpu.hl = 0; cpu.de = 0; cpu.bc = 0; cpu.a = 0x00; cpu.f = 0x40; cpu.sp = STACK_TOP;
  mem.fill(0xff, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}
function stop(name, detail = null) { const error = new Error('__PHASE218_STOP__'); error.stopName = name; error.detail = detail; return error; }
function bootBaseline() {
  const mem = createMemory();
  const { executor, cpu } = createRuntime(mem);
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu.iy = IY_ADDR; cpu.hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  resetOsState(cpu, mem); cpu.sp -= 3; write24(mem, cpu.sp, MEM_INIT_RET);
  let memInit = { returned: false, steps: null, termination: null, lastPc: hex(MEM_INIT_RET) };
  try {
    const result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw stop('mem_init_return', hex(pc)); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw stop('mem_init_return', hex(pc)); },
    });
    memInit = { returned: false, steps: result.steps, termination: result.termination, lastPc: hex(result.lastPc ?? MEM_INIT_RET) };
  } catch (error) {
    if (error?.message === '__PHASE218_STOP__' && error.stopName === 'mem_init_return') memInit = { returned: true, steps: null, termination: 'sentinel', lastPc: error.detail };
    else throw error;
  }
  return {
    boot: {
      boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc ?? 0) },
      kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc ?? 0) },
      postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc ?? 0) },
    },
    memInit,
    memory: new Uint8Array(mem),
  };
}

function byteSnap(mem, addr) { const value = mem[addr & 0xffffff] & 0xff; return { addr: hex(addr), value, hex: hexByte(value) }; }
function ptrSnap(mem, addr) { const value = read24(mem, addr); return { addr: hex(addr), value, hex: hex(value) }; }
function state(cpu, mem) {
  return {
    registers: { a: hexByte(cpu.a), f: hexByte(cpu.f), bc: hex(cpu.bc), de: hex(cpu.de), hl: hex(cpu.hl), ix: hex(cpu.ix), iy: hex(cpu.iy), sp: hex(cpu.sp), mbase: hexByte(cpu.mbase) },
    watched: { iyPlus5: byteSnap(mem, IY5), iyPlus12: byteSnap(mem, IY12), iyPlus14: byteSnap(mem, IY14), iyPlus18: byteSnap(mem, IY18), iyPlus44: byteSnap(mem, IY44) },
    editPointers: { top: ptrSnap(mem, EDIT_TOP), cursor: ptrSnap(mem, EDIT_CURSOR), tail: ptrSnap(mem, EDIT_TAIL), bottom: ptrSnap(mem, EDIT_BOTTOM) },
  };
}
function iySpan(addr, size, iyBase) {
  const iyOffsets = []; const watchedLabels = [];
  for (let i = 0; i < size; i++) {
    const a = (addr + i) & 0xffffff;
    const off = a - iyBase;
    if (off >= -0x80 && off <= 0x80) iyOffsets.push(signedOff(off));
    if (WATCHED.has(a)) watchedLabels.push(WATCHED.get(a));
  }
  return { iyOffsets: [...new Set(iyOffsets)], watchedLabels: [...new Set(watchedLabels)] };
}
function installWriteTracer(cpu, writes) {
  const originals = { write8: cpu.write8.bind(cpu), write16: cpu.write16.bind(cpu), write24: cpu.write24.bind(cpu) };
  const wrap = (kind, size, fn) => (addr, value) => {
    const a = addr & 0xffffff; const span = iySpan(a, size, cpu.iy & 0xffffff);
    writes.push({ index: writes.length + 1, pc: hex(cpu._currentBlockPc ?? 0), kind, addr: hex(a), addrValue: a, size, value: size === 1 ? hexByte(value) : hex(value, size * 2), droppedRomWrite: a < 0x400000, iyBase: hex(cpu.iy & 0xffffff), iyOffsets: span.iyOffsets, touchedIyWindow: span.iyOffsets.length > 0, watchedLabels: span.watchedLabels });
    return fn(addr, value);
  };
  cpu.write8 = wrap('write8', 1, originals.write8); cpu.write16 = wrap('write16', 2, originals.write16); cpu.write24 = wrap('write24', 3, originals.write24);
  return () => { cpu.write8 = originals.write8; cpu.write16 = originals.write16; cpu.write24 = originals.write24; };
}

/* ══════════════════════════════════════════════════════════
   PART A: Static disassembly of 0x04EB60-0x04EC40
   ══════════════════════════════════════════════════════════ */
console.log('\n═══════════════════════════════════════════════════');
console.log('  PART A: Static Disassembly of Parent Function');
console.log('═══════════════════════════════════════════════════\n');

// Find the parent function entry by scanning back from JP_Z_1
const entryInfo = inferEntry(JP_Z_1);
console.log('Entry inference:', JSON.stringify(entryInfo, null, 2));

const parentEntry = entryInfo.entry;
console.log(`\nParent function entry: ${hex(parentEntry)}`);

// Disassemble from 0x04EB60 to 0x04EC40 (covers parent + enter-edit-mode)
const disasmStart = Math.min(parentEntry, 0x04eb60);
const disasmEnd = 0x04ec40;
const disasm = decodeRange(disasmStart, disasmEnd);

console.log(`\nFull disassembly ${hex(disasmStart)} - ${hex(disasmEnd)}:`);
console.log('─'.repeat(80));
for (const r of disasm) {
  const marker =
    r.pcValue === parentEntry ? ' ◄── ENTRY' :
    r.pcValue === JP_Z_1 ? ' ◄── JP Z #1 (→ enter-edit)' :
    r.pcValue === JP_Z_2 ? ' ◄── JP Z #2 (A==0x0E → enter-edit)' :
    r.pcValue === ENTER_EDIT ? ' ◄── ENTER EDIT MODE (0x04EC1C)' :
    '';
  console.log(`  ${r.pc}  ${r.bytes.padEnd(20)} ${r.text}${marker}`);
}
console.log('─'.repeat(80));

// Identify key control-flow instructions in the parent
console.log('\nKey control-flow instructions in parent:');
const controlFlow = disasm.filter(r =>
  r.pcValue >= parentEntry && r.pcValue < ENTER_EDIT &&
  ['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional',
   'cp-imm', 'cp-reg', 'indexed-cb-bit', 'indexed-cb-set', 'indexed-cb-res',
   'ret', 'ret-conditional'].includes(r.tag)
);
for (const r of controlFlow) {
  console.log(`  ${r.pc}  ${r.text}`);
}

/* ══════════════════════════════════════════════════════════
   PART B: Static Caller Scan
   ══════════════════════════════════════════════════════════ */
console.log('\n═══════════════════════════════════════════════════');
console.log('  PART B: Static Caller Scan for Parent Entry');
console.log('═══════════════════════════════════════════════════\n');

console.log(`Scanning entire ROM for references to parent entry ${hex(parentEntry)}...`);

const callers24 = scanAll24(parentEntry);
console.log(`\n24-bit CALL/JP references (${callers24.length} found):`);
for (const c of callers24) {
  console.log(`  ${c.from}  ${c.bytes}  ${c.label}  decoded: ${c.decodedAdl}`);
}

const ptrRefs = scanPointerRefs(parentEntry);
console.log(`\nPointer table references (${ptrRefs.length} found):`);
for (const p of ptrRefs) {
  console.log(`  ${p.addr}  context: ${p.context}`);
}

// Also scan for the entry if it differs from parentEntry (check a few candidates)
if (parentEntry !== 0x04eb60) {
  console.log(`\nAlso scanning for references to 0x04EB60 (region start)...`);
  const alt24 = scanAll24(0x04eb60);
  console.log(`  24-bit refs to 0x04EB60: ${alt24.length}`);
  for (const c of alt24) {
    console.log(`    ${c.from}  ${c.bytes}  ${c.label}  decoded: ${c.decodedAdl}`);
  }
}

/* ══════════════════════════════════════════════════════════
   PART C: Dynamic Trace
   ══════════════════════════════════════════════════════════ */
console.log('\n═══════════════════════════════════════════════════');
console.log('  PART C: Dynamic Trace');
console.log('═══════════════════════════════════════════════════\n');

console.log('Booting system (z80 boot → kernelInit → memInit)...');
const baseline = bootBaseline();
console.log('Boot:', JSON.stringify(baseline.boot, null, 2));
console.log('MemInit:', JSON.stringify(baseline.memInit, null, 2));

function runExperiment(label, setupFn) {
  console.log(`\n── Experiment: ${label} ──`);
  const mem = new Uint8Array(baseline.memory);
  const { executor, cpu } = createRuntime(mem);
  resetOsState(cpu, mem);

  // Seed edit pointers
  write24(mem, EDIT_CURSOR, EDIT_BUF);
  write24(mem, EDIT_TAIL, EDIT_END);
  write24(mem, EDIT_TOP, EDIT_BUF);
  write24(mem, EDIT_BOTTOM, EDIT_END);

  // Let the setup function configure registers/memory
  setupFn(cpu, mem);

  const stateBefore = state(cpu, mem);
  console.log('State before:', JSON.stringify(stateBefore, null, 2));

  // Push return sentinel
  push24(cpu, mem, TRACE_RET);

  const writes = [];
  const removeTracer = installWriteTracer(cpu, writes);
  const blocksVisited = new Set();
  let reachedEnterEdit = false;
  let stepCount = 0;

  let result;
  try {
    result = executor.runFrom(cpu.pc, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: 512,
      onBlock(pc) {
        const addr = pc & 0xffffff;
        blocksVisited.add(addr);
        stepCount++;
        if (addr === ENTER_EDIT) reachedEnterEdit = true;
        if (addr === TRACE_RET) throw stop('trace_return', hex(pc));
      },
      onMissingBlock(pc) {
        const addr = pc & 0xffffff;
        blocksVisited.add(addr);
        if (addr === TRACE_RET) throw stop('trace_return', hex(pc));
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE218_STOP__' && error.stopName === 'trace_return') {
      result = { steps: stepCount, termination: 'sentinel_return', lastPc: TRACE_RET };
    } else {
      result = { steps: stepCount, termination: `error: ${error?.message ?? error}`, lastPc: cpu.pc };
    }
  }

  removeTracer();
  const stateAfter = state(cpu, mem);

  console.log('Result:', JSON.stringify({
    steps: result.steps,
    termination: result.termination,
    lastPc: hex(result.lastPc ?? cpu.pc),
    reachedEnterEdit,
    uniqueBlocks: blocksVisited.size,
  }, null, 2));
  console.log('State after:', JSON.stringify(stateAfter, null, 2));

  // Show IY-window writes
  const iyWrites = writes.filter(w => w.touchedIyWindow);
  console.log(`IY-window writes (${iyWrites.length} of ${writes.length} total):`);
  for (const w of iyWrites) {
    console.log(`  #${w.index} ${w.pc} ${w.kind} → ${w.addr} = ${w.value}  [${w.watchedLabels.join(', ')}]`);
  }

  // Show blocks visited (sorted)
  const sortedBlocks = [...blocksVisited].sort((a, b) => a - b);
  console.log(`Blocks visited (${sortedBlocks.length}): ${sortedBlocks.map(b => hex(b)).join(', ')}`);

  return { result, reachedEnterEdit, stateAfter, writes, blocksVisited: sortedBlocks };
}

// Experiment 1: Call parent function entry with A=0x0E
runExperiment('A=0x0E → should trigger JP Z at 0x04EB8D → enter-edit', (cpu, mem) => {
  cpu.a = 0x0e;
  cpu.f = 0x40; // Z flag clear initially
  cpu.pc = parentEntry;
});

// Experiment 2: Call parent function entry with A=0x00
runExperiment('A=0x00 → test what else happens', (cpu, mem) => {
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.pc = parentEntry;
});

// Experiment 3: Enter at the JP Z #1 predecessor with Z flag forced SET
// The JP Z at 0x04EB82 follows CALL 0x05E3E8 which follows RES 4/RES 2 on IY+5
// We enter just before JP Z #1 with Z flag set
runExperiment('Force Z=1 at JP Z #1 (0x04EB82) → should enter-edit via path 1', (cpu, mem) => {
  cpu.a = 0x00;
  cpu.f = 0x40 | 0x40; // Z flag SET (bit 6 of F)
  cpu.pc = JP_Z_1; // Start right at the JP Z instruction
});

// Experiment 4: Enter at JP Z #1 with Z flag CLEAR (should NOT enter edit)
runExperiment('Force Z=0 at JP Z #1 (0x04EB82) → should skip enter-edit', (cpu, mem) => {
  cpu.a = 0x00;
  cpu.f = 0x00; // Z flag CLEAR
  cpu.pc = JP_Z_1;
});

console.log('\n═══════════════════════════════════════════════════');
console.log('  DONE');
console.log('═══════════════════════════════════════════════════');
