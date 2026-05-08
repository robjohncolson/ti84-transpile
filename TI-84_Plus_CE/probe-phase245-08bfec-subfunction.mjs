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
const JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MASK = MEM_SIZE - 1;
const BOOT_ENTRY = 0x000000;
const KERNEL_ENTRY = 0x08C331;
const POST_ENTRY = 0x0802B2;
const BOOT_SP = 0xD1A87E;
const ENTRY_SP = 0xD1A860;
const RET = 0x7FFFFE;
const MBASE = 0xD0;
const IX = 0xD1A860;
const IY = 0xD00080;
const TARGET = 0x08BFEC;
const DUMP_START = 0x08BFEC;
const DUMP_END = 0x08C080;
const VRAM_LO = 0xD40000;
const VRAM_HI = 0xD65800;

const REGIONS = [
  { n: 'D003xx', s: 0xD00300, e: 0xD00400 },
  { n: 'D005xx', s: 0xD00500, e: 0xD00600 },
  { n: 'D007xx', s: 0xD00700, e: 0xD00800 },
];
const EXTRA = [
  { n: 'D007E0', a: 0xD007E0 },
  { n: 'D0008A', a: 0xD0008A },
  { n: 'D026AA', a: 0xD026AA },
  { n: 'D026AB', a: 0xD026AB },
  { n: 'D026AC', a: 0xD026AC },
  { n: 'D026AD', a: 0xD026AD },
  { n: 'D02ACC', a: 0xD02ACC },
  { n: 'D02ACD', a: 0xD02ACD },
  { n: 'D02A86', a: 0xD02A86 },
];
const SEEDS_BASE = [
  [0xD0058E, 0x8F], [0xD0058D, 0x00], [0xD0059F, 0x00], [0xD003E0, 0x00],
  [0xD00824, 0x00], [0xD003DA, 0x00], [0xD00000, 0x00],
];
const ETOP = 0xD02437;
const ECUR = 0xD0243A;
const ETAIL = 0xD0243D;
const EBTM = 0xD02440;
const EBUF = 0xD00A00;
const EEND = 0xD00B00;
const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];
const MILES_RUN1 = [
  [TARGET, '0x08BFEC entry'],
  [0x08C021, '0x08C021'], [0x08C031, '0x08C031'], [0x08C050, '0x08C050'],
  [0x08C102, '0x08C102'], [0x09EF44, '0x09EF44'], [0x09EFDE, '0x09EFDE'],
  [0x09F001, '0x09F001'], [0x09F736, '0x09F736'],
  [RET, 'sentinel'],
];
const MILES_RUN2 = [
  [TARGET, '0x08BFEC entry (D007E0=0x40)'],
  [0x08C021, '0x08C021'], [0x08C031, '0x08C031'], [0x08C050, '0x08C050'],
  [0x08C102, '0x08C102'], [0x09EF44, '0x09EF44'], [0x09EFDE, '0x09EFDE'],
  [0x09F001, '0x09F001'], [0x09F736, '0x09F736'],
  [RET, 'sentinel'],
];

const hx = (v, w = 6) => v === undefined || v === null || Number.isNaN(v) ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const hb = (v) => hx((v ?? 0) & 0xFF, 2);
const bhex = (bs) => Array.from(bs, (b) => hb(b)).join(' ');
const w24 = (m, a, v) => { const b = a & MASK; m[b] = v & 0xFF; m[(b + 1) & MASK] = (v >>> 8) & 0xFF; m[(b + 2) & MASK] = (v >>> 16) & 0xFF; };
const r24mem = (m, a) => { const b = a & MASK; return m[b] | (m[(b + 1) & MASK] << 8) | (m[(b + 2) & MASK] << 16); };
const snapCpu = (cpu) => Object.fromEntries(CPU_FIELDS.map((f) => [f, cpu[f]]));
const restoreCpu = (cpu, snap) => { for (const [k, v] of Object.entries(snap)) cpu[k] = v; };
const blockKey = (a, m) => `${(a >>> 0).toString(16).padStart(6, '0')}:${m}`;

function nextMode(executor, key, pc, mode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return mode;
  for (const ex of exits) if (ex.target === pc && ex.targetMode) return ex.targetMode;
  return mode;
}

function installStep(cpu, executor) {
  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks?.[key];
    if (typeof fn !== 'function') throw new Error(`Missing block ${hx(pc)} (${key})`);
    const out = fn(this);
    if (typeof out !== 'number') throw new Error(`Bad step result from ${hx(pc)}: ${String(out)}`);
    if (out >= 0) {
      const nm = nextMode(executor, key, out, mode);
      this.pc = out & 0xFFFFFF;
      this.madl = nm === 'adl' ? 1 : 0;
    }
    return out;
  };
}

function ensureAssets() {
  if (fs.existsSync(JS_PATH)) return { modulePath: JS_PATH, temp: null, source: 'js' };
  if (!fs.existsSync(GZ_PATH)) throw new Error('Missing ROM.transpiled.js and ROM.transpiled.js.gz.');
  const temp = path.join(os.tmpdir(), `ti84-phase245-${process.pid}.mjs`);
  fs.writeFileSync(temp, gunzipSync(fs.readFileSync(GZ_PATH)));
  return { modulePath: temp, temp, source: 'gz' };
}

function cleanupAssets(assets) {
  if (!assets?.temp) return;
  try { fs.unlinkSync(assets.temp); } catch {}
}

function normalizeBlocks(raw) {
  return Array.isArray(raw) ? Object.fromEntries(raw.filter((b) => b?.id).map((b) => [b.id, b])) : (raw ?? {});
}

function makeRuntime(blocks, rom) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  installStep(cpu, executor);
  return { mem, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = BOOT_SP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const kernel = executor.runFrom(KERNEL_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu._iy = IY; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = BOOT_SP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const post = executor.runFrom(POST_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return { boot, kernel, post };
}

function seedEdit(mem) {
  w24(mem, ETOP, EBUF); w24(mem, ECUR, EBUF); w24(mem, ETAIL, EEND); w24(mem, EBTM, EEND); mem.fill(0x00, EBUF, EEND);
}

function seedEntry(cpu, mem, pc, extraSeeds) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = MBASE; cpu.pc = pc; cpu.sp = ENTRY_SP;
  cpu._iy = IY; cpu._ix = IX; cpu._hl = 0; cpu._de = 0; cpu._bc = 0; cpu.a = 0x1D; cpu.f = 0x00;
  for (let i = 0; i < 128; i++) mem[(IY + i) & MASK] = 0x00;
  for (const [a, v] of SEEDS_BASE) mem[a & MASK] = v & 0xFF;
  // Target-specific seeds
  mem[0xD007E0 & MASK] = 0x00;
  mem[0xD0008A & MASK] = 0x00;
  w24(mem, 0xD02ACC, 0x0000);
  w24(mem, 0xD026AA, 0x0000);
  w24(mem, 0xD026AC, 0x0000);
  // Apply extra seeds (overrides)
  if (extraSeeds) {
    for (const [a, v] of extraSeeds) mem[a & MASK] = v & 0xFF;
  }
  seedEdit(mem);
  w24(mem, ENTRY_SP, RET);
}

const r24cpu = (cpu, n) => ((cpu[`_${n}`] ?? cpu[n] ?? 0) & 0xFFFFFF);
function regs(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF, a: cpu.a & 0xFF, f: cpu.f & 0xFF, bc: r24cpu(cpu, 'bc'), de: r24cpu(cpu, 'de'),
    hl: r24cpu(cpu, 'hl'), ix: r24cpu(cpu, 'ix'), iy: r24cpu(cpu, 'iy'), sp: cpu.sp & 0xFFFFFF,
    iff1: cpu.iff1 ? 1 : 0, iff2: cpu.iff2 ? 1 : 0, madl: cpu.madl ? 1 : 0, mbase: (cpu.mbase ?? 0) & 0xFF,
  };
}
const regStr = (r) => `PC=${hx(r.pc)} A=${hb(r.a)} F=${hb(r.f)} BC=${hx(r.bc)} DE=${hx(r.de)} HL=${hx(r.hl)} IX=${hx(r.ix)} IY=${hx(r.iy)} SP=${hx(r.sp)} IFF1=${r.iff1} IFF2=${r.iff2} MADL=${r.madl} MBASE=${hb(r.mbase)}`;

const disp = (d) => d >= 0 ? `+${d}` : `${d}`;
function fmt(inst) {
  if (!inst) return '(decode error)';
  switch (inst.tag) {
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hb(inst.value)}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'call': return `CALL ${hx(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hx(inst.target)}`;
    case 'jp': return `JP ${hx(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hx(inst.target)}`;
    case 'jr': return `JR ${hx(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hx(inst.target)}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hx(inst.value)}`;
    case 'ld-pair-mem': {
      const s = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : ''; const w = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      return inst.direction === 'to-mem' ? `LD${s} (${hx(inst.addr, w)}), ${String(inst.pair).toUpperCase()}` : `LD${s} ${String(inst.pair).toUpperCase()}, (${hx(inst.addr, w)})`;
    }
    case 'ld-mem-pair': {
      const s = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : ''; const w = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      return `LD${s} (${hx(inst.addr, w)}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hb(inst.value)}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hx(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hx(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `LD (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `LD (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)}), ${hb(inst.value)}`;
    case 'push': return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'ei': return 'EI';
    case 'di': return 'DI';
    case 'or-reg': return `OR ${String(inst.src).toUpperCase()}`;
    case 'and-reg': return `AND ${String(inst.src).toUpperCase()}`;
    case 'xor-reg': return `XOR ${String(inst.src).toUpperCase()}`;
    case 'cp-reg': return `CP ${String(inst.src).toUpperCase()}`;
    case 'cp-imm': return `CP ${hb(inst.value)}`;
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'nop': return 'NOP';
    default: return inst.tag + (inst.target !== undefined ? ` ${hx(inst.target)}` : '') + (inst.value !== undefined ? ` ${hx(inst.value)}` : '');
  }
}

function disasm(rom, start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl'); const len = inst.length || 1;
      rows.push({ pc, bytes: bhex(rom.subarray(pc, Math.min(pc + len, end))), text: fmt(inst) }); pc += len;
    } catch (e) {
      rows.push({ pc, bytes: hb(rom[pc]), text: `DB ${hb(rom[pc])} ; ${e?.message ?? 'decode error'}` }); pc += 1;
    }
  }
  return rows;
}

function cf(inst, pc) {
  if (!inst) return null;
  switch (inst.tag) {
    case 'call':
    case 'call-conditional': return { k: 'CALL', c: inst.condition ?? null, t: inst.target ?? null, f: (pc + (inst.length || 0)) & 0xFFFFFF };
    case 'jp':
    case 'jp-conditional': return { k: 'JP', c: inst.condition ?? null, t: inst.target ?? null, f: (pc + (inst.length || 0)) & 0xFFFFFF };
    case 'jr':
    case 'jr-conditional': return { k: 'JR', c: inst.condition ?? null, t: inst.target ?? null, f: (pc + (inst.length || 0)) & 0xFFFFFF };
    default: return null;
  }
}

function trace(cpu, mem, rom, budget, miles, label) {
  const visit = new Map(), events = [], writes = [], xwrites = [], iy = [], tail = [], vramCount = { total: 0 };
  const rshadow = Object.fromEntries(REGIONS.map((r) => [r.n, new Uint8Array(mem.subarray(r.s, r.e))]));
  const xshadow = new Map(EXTRA.map((w) => [w.a, mem[w.a & MASK]]));
  const iyshadow = new Uint8Array(128); for (let i = 0; i < 128; i++) iyshadow[i] = mem[(IY + i) & MASK];
  // Snapshot VRAM to detect writes
  const vramShadow = new Uint8Array(256); // sample first 256 bytes of VRAM
  for (let i = 0; i < 256; i++) vramShadow[i] = mem[(VRAM_LO + i) & MASK];
  const entry = regs(cpu);
  const hit = new Map(miles.map(([pc, l]) => [pc, null]));
  let steps = 0, stop = 'budget_exhausted', err = null;
  while (steps < budget) {
    const pc = cpu.pc & 0xFFFFFF;
    visit.set(pc, (visit.get(pc) ?? 0) + 1);
    tail.push(pc); if (tail.length > 32) tail.shift();
    if (hit.has(pc) && hit.get(pc) === null) hit.set(pc, steps);
    if (pc === RET) { stop = 'returned_sentinel'; break; }
    let c = null; try { c = cf(decodeInstruction(rom, pc, cpu.madl ? 'adl' : 'z80'), pc); } catch {}
    let out;
    try { out = cpu.step(); } catch (e) { stop = 'error'; err = e instanceof Error ? e.message : String(e); break; }
    steps += 1;
    const after = cpu.pc & 0xFFFFFF;
    if (c) events.push({ ...c, step: steps, from: pc, after, taken: c.t !== null ? after === (c.t & 0xFFFFFF) : after !== c.f });
    for (const r of REGIONS) {
      const sh = rshadow[r.n];
      for (let a = r.s; a < r.e; a++) {
        const i = a - r.s, cur = mem[a & MASK];
        if (cur !== sh[i]) { writes.push({ step: steps, afterBlock: pc, region: r.n, addr: a, oldVal: sh[i], newVal: cur }); sh[i] = cur; }
      }
    }
    for (const w of EXTRA) {
      const cur = mem[w.a & MASK], prev = xshadow.get(w.a);
      if (cur !== prev) { xwrites.push({ step: steps, afterBlock: pc, name: w.n, addr: w.a, oldVal: prev, newVal: cur }); xshadow.set(w.a, cur); }
    }
    for (let i = 0; i < 128; i++) {
      const cur = mem[(IY + i) & MASK];
      if (cur !== iyshadow[i]) { iy.push({ step: steps, afterBlock: pc, offset: i, addr: IY + i, oldVal: iyshadow[i], newVal: cur }); iyshadow[i] = cur; }
    }
    // Sample VRAM writes (check first 256 bytes periodically)
    if (steps % 50 === 0) {
      for (let i = 0; i < 256; i++) {
        const cur = mem[(VRAM_LO + i) & MASK];
        if (cur !== vramShadow[i]) { vramCount.total++; vramShadow[i] = cur; }
      }
    }
    if (hit.has(after) && hit.get(after) === null) hit.set(after, steps);
    if (out === -1) { stop = 'halt'; break; }
    if (out === -2) { stop = 'sleep'; break; }
    if (after === RET) { stop = 'returned_sentinel'; break; }
  }
  // Final VRAM check
  for (let i = 0; i < 256; i++) {
    const cur = mem[(VRAM_LO + i) & MASK];
    if (cur !== vramShadow[i]) { vramCount.total++; vramShadow[i] = cur; }
  }
  return { label, budget, steps, stop, err, entry, exit: regs(cpu), finalPc: cpu.pc & 0xFFFFFF, visit: [...visit.entries()].sort((a, b) => a[0] - b[0]), events, writes, xwrites, iy, hit, miles, vramCount, tail };
}

function printMilestones(res) {
  console.log('  Milestones:');
  for (const [pc, label] of res.miles) console.log(`    ${hx(pc)} ${label}: ${res.hit.get(pc) === null ? 'not reached' : `step ${res.hit.get(pc)}`}`);
  console.log('');
}

function printWrites(title, rows) {
  console.log(title);
  if (!rows.length) { console.log('    (none)\n'); return; }
  for (const w of rows) console.log(`    step ${String(w.step).padStart(4, ' ')} after ${hx(w.afterBlock)}: ${hx(w.addr)} [${w.region ?? w.name}] ${hb(w.oldVal)} -> ${hb(w.newVal)}`);
  console.log('');
}

function printRun(title, res) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
  console.log(`  Steps: ${res.steps}/${res.budget}`);
  console.log(`  Stop: ${res.stop}`);
  console.log(`  Final PC: ${hx(res.finalPc)}`);
  if (res.err) console.log(`  Error: ${res.err}`);
  console.log(`  Entry regs: ${regStr(res.entry)}`);
  console.log(`  Exit regs:  ${regStr(res.exit)}`);
  console.log('');
  printMilestones(res);
  console.log(`  Unique blocks visited (sorted, ${res.visit.length} total):`);
  for (const [pc, count] of res.visit) console.log(`    ${hx(pc)} x${count}`);
  console.log('');
  console.log(`  CALL/JP/JR events (${res.events.length} total):`);
  if (!res.events.length) console.log('    (none)');
  for (const e of res.events) console.log(`    step ${String(e.step).padStart(4, ' ')}: ${hx(e.from)} -> ${e.k}${e.c ? ` ${String(e.c).toUpperCase()}` : ''} ${hx(e.t)} (${e.taken ? 'taken' : 'not-taken'}, next ${hx(e.after)})`);
  console.log('');
  printWrites('  RAM writes in watched regions:', res.writes);
  printWrites('  Extra watched writes:', res.xwrites);
  console.log(`  IY flag changes (${res.iy.length} total):`);
  if (!res.iy.length) console.log('    (none)');
  for (const c of res.iy) console.log(`    step ${String(c.step).padStart(4, ' ')} after ${hx(c.afterBlock)}: IY+${hx(c.offset, 2)} (${hx(c.addr)}) ${hb(c.oldVal)} -> ${hb(c.newVal)}`);
  console.log('');
  console.log(`  VRAM write count (sampled): ${res.vramCount.total}`);
  console.log('');
  console.log(`  Tail (last 32 blocks): ${res.tail.map((pc) => hx(pc)).join(' -> ')}`);
  console.log('');
}

function comparePaths(run1, run2) {
  const blocks1 = new Set(run1.visit.map(([pc]) => pc));
  const blocks2 = new Set(run2.visit.map(([pc]) => pc));
  const onlyIn1 = [...blocks1].filter((pc) => !blocks2.has(pc)).sort((a, b) => a - b);
  const onlyIn2 = [...blocks2].filter((pc) => !blocks1.has(pc)).sort((a, b) => a - b);
  const common = [...blocks1].filter((pc) => blocks2.has(pc)).sort((a, b) => a - b);
  return { onlyIn1, onlyIn2, common };
}

async function main() {
  const assets = ensureAssets();
  try {
    const rom = fs.readFileSync(ROM_PATH);
    const mod = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(mod.PRELIFTED_BLOCKS ?? mod.default?.PRELIFTED_BLOCKS ?? mod.default ?? mod);
    if (!blocks || typeof blocks !== 'object' || !Object.keys(blocks).length) throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    const rt = makeRuntime(blocks, rom);
    const boot = coldBoot(rt.executor, rt.cpu, rt.mem);
    const bootMem = new Uint8Array(rt.mem);
    const bootCpu = snapCpu(rt.cpu);

    console.log('Phase 245: 0x08BFEC sub-function full trace');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${rom.length} bytes)`);
    console.log(`Transpiled source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log('Peripheral seed: createPeripheralBus({ timerInterrupt: false })');
    console.log(`Entry state: PC=${hx(TARGET)} SP=${hx(ENTRY_SP)} IX=${hx(IX)} IY=${hx(IY)} MBASE=${hb(MBASE)} RET sentinel=${hx(RET)}`);
    console.log('');
    console.log('========================================================================');
    console.log('COLD BOOT');
    console.log('========================================================================');
    console.log(`  boot:   steps=${boot.boot.steps}/${boot.boot.termination}`);
    console.log(`  kernel: steps=${boot.kernel.steps}/${boot.kernel.termination}`);
    console.log(`  post:   steps=${boot.post.steps}/${boot.post.termination}`);
    console.log('');

    // ====================================================================
    // DISASSEMBLY
    // ====================================================================
    console.log('========================================================================');
    console.log(`HEX DUMP ${hx(DUMP_START)}..${hx(DUMP_END - 1)} (${DUMP_END - DUMP_START} bytes)`);
    console.log('========================================================================');
    for (let a = DUMP_START; a < DUMP_END; a += 16) console.log(`  ${hx(a)}: ${bhex(rom.subarray(a, Math.min(a + 16, DUMP_END)))}`);
    console.log('');
    console.log('========================================================================');
    console.log(`STATIC DISASSEMBLY ${hx(DUMP_START)}..${hx(DUMP_END - 1)}`);
    console.log('========================================================================');
    for (const row of disasm(rom, DUMP_START, DUMP_END)) console.log(`  ${hx(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}`);
    console.log('');

    // ====================================================================
    // RUN 1: D007E0=0x00 (home screen)
    // ====================================================================
    rt.mem.set(bootMem); restoreCpu(rt.cpu, bootCpu);
    seedEntry(rt.cpu, rt.mem, TARGET, []);
    const run1 = trace(rt.cpu, rt.mem, rom, 2000, MILES_RUN1, 'RUN1: D007E0=0x00 (home screen)');
    printRun('RUN 1: 0x08BFEC with D007E0=0x00 (home screen), D0008A=0x00 (2000 steps)', run1);

    // ====================================================================
    // RUN 2: D007E0=0x40 (compare path differences)
    // ====================================================================
    rt.mem.set(bootMem); restoreCpu(rt.cpu, bootCpu);
    seedEntry(rt.cpu, rt.mem, TARGET, [[0xD007E0, 0x40]]);
    const run2 = trace(rt.cpu, rt.mem, rom, 2000, MILES_RUN2, 'RUN2: D007E0=0x40');
    printRun('RUN 2: 0x08BFEC with D007E0=0x40, D0008A=0x00 (2000 steps)', run2);

    // ====================================================================
    // PATH COMPARISON
    // ====================================================================
    const cmp = comparePaths(run1, run2);
    console.log('========================================================================');
    console.log('PATH COMPARISON: RUN 1 (D007E0=0x00) vs RUN 2 (D007E0=0x40)');
    console.log('========================================================================');
    console.log(`  Common blocks (${cmp.common.length}): ${cmp.common.map((pc) => hx(pc)).join(', ')}`);
    console.log(`  Only in RUN 1 (${cmp.onlyIn1.length}): ${cmp.onlyIn1.length ? cmp.onlyIn1.map((pc) => hx(pc)).join(', ') : '(none)'}`);
    console.log(`  Only in RUN 2 (${cmp.onlyIn2.length}): ${cmp.onlyIn2.length ? cmp.onlyIn2.map((pc) => hx(pc)).join(', ') : '(none)'}`);
    console.log('');

    // ====================================================================
    // REPORT
    // ====================================================================
    console.log('========================================================================');
    console.log('REPORT');
    console.log('========================================================================');
    console.log('  0x08BFEC is the sub-function called by 0x08BFCD as its first action.');
    console.log('  Per session 244: restores IY=0xD00080, RES 2,(IY+50), copies D02ACC->D026AA,');
    console.log('  sets D026AC=0xFFFF, then branches on D007E0/D0008A into display-row rendering');
    console.log('  via 0x08C0xx -> 0x09EF44 -> 0x09EFDE VRAM fill.');
    console.log('');
    console.log(`  RUN 1 (home screen): ${run1.stop} after ${run1.steps} steps, final PC=${hx(run1.finalPc)}`);
    console.log(`    Unique blocks: ${run1.visit.length}, VRAM writes (sampled): ${run1.vramCount.total}`);
    console.log(`    IY flag changes: ${run1.iy.length}, extra watched writes: ${run1.xwrites.length}`);
    console.log('');
    console.log(`  RUN 2 (D007E0=0x40): ${run2.stop} after ${run2.steps} steps, final PC=${hx(run2.finalPc)}`);
    console.log(`    Unique blocks: ${run2.visit.length}, VRAM writes (sampled): ${run2.vramCount.total}`);
    console.log(`    IY flag changes: ${run2.iy.length}, extra watched writes: ${run2.xwrites.length}`);
    console.log('');
    console.log(`  Path divergence: ${cmp.onlyIn1.length} blocks unique to RUN 1, ${cmp.onlyIn2.length} blocks unique to RUN 2`);
    console.log('');
    console.log('  Key questions answered:');
    console.log('    1. Full function structure: see disassembly above');
    console.log(`    2. Return address: ${run1.stop === 'returned_sentinel' ? 'function returns normally (reached sentinel)' : `function stops at ${hx(run1.finalPc)} (${run1.stop})`}`);
    console.log(`    3. D007E0 branching effect: ${cmp.onlyIn1.length + cmp.onlyIn2.length > 0 ? 'paths diverge' : 'paths are identical'}`);
    console.log('');

  } finally {
    cleanupAssets(assets);
  }
}

main().catch((e) => { console.error(e?.stack || String(e)); process.exitCode = 1; });
