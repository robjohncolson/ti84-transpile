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
const ENTRY_SP = 0xD1987E;
const RET = 0x7FFFFE;
const MBASE = 0xD0;
const IX = 0xD1A860;
const IY = 0xD00080;
const DIRECT = 0x08BFCD;
const CALLER = 0x08BF22;
const RUN1 = 500;
const RUN2 = 2000;
const DUMP_START = 0x08BFCD;
const DUMP_END = 0x08C031;
const DISP_LO = 0x0A3200;
const DISP_HI = 0x0A3500;
const EV0 = 0x027111;
const EV1 = 0x027123;

const REGIONS = [
  { n: 'D003xx', s: 0xD00300, e: 0xD00400 },
  { n: 'D005xx', s: 0xD00500, e: 0xD00600 },
  { n: 'D007xx', s: 0xD00700, e: 0xD00800 },
];
const EXTRA = [
  { n: 'D008D2', a: 0xD008D2 },
  { n: 'D026AA', a: 0xD026AA },
  { n: 'D026AC', a: 0xD026AC },
  { n: 'D02A86', a: 0xD02A86 },
];
const SEEDS = [
  [0xD0058E, 0x8F], [0xD0058D, 0x00], [0xD0059F, 0x00], [0xD003E0, 0x00],
  [0xD00824, 0x00], [0xD003DA, 0x00], [0xD007E0, 0x40], [0xD00000, 0x00],
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
const M1 = [
  [DIRECT, '0x08BFCD'], [0x08BFEC, '0x08BFEC'], [0x08C021, '0x08C021'],
  [0x08C102, '0x08C102'], [EV0, '0x027111'], [EV1, '0x027123'], [RET, 'sentinel'],
];
const M2 = [
  [CALLER, '0x08BF22'], [0x09EF44, '0x09EF44'], [0x09EFDE, '0x09EFDE'],
  [0x09F001, '0x09F001'], [0x09F736, '0x09F736'], [0x08BFC5, '0x08BFC5'],
  [0x0A32F9, '0x0A32F9'], [0x0A33DA, '0x0A33DA'], [DIRECT, '0x08BFCD'],
  [EV0, '0x027111'], [EV1, '0x027123'], [RET, 'sentinel'],
];

const hx = (v, w = 6) => v === undefined || v === null || Number.isNaN(v) ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const hb = (v) => hx((v ?? 0) & 0xFF, 2);
const bhex = (bs) => Array.from(bs, (b) => hb(b)).join(' ');
const w24 = (m, a, v) => { const b = a & MASK; m[b] = v & 0xFF; m[(b + 1) & MASK] = (v >>> 8) & 0xFF; m[(b + 2) & MASK] = (v >>> 16) & 0xFF; };
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
  const temp = path.join(os.tmpdir(), `ti84-phase244-${process.pid}.mjs`);
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

function seedEntry(cpu, mem, pc) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = MBASE; cpu.pc = pc; cpu.sp = ENTRY_SP;
  cpu._iy = IY; cpu._ix = IX; cpu._hl = 0; cpu._de = 0; cpu._bc = 0; cpu.a = 0x1D; cpu.f = 0x00;
  for (let i = 0; i < 128; i++) mem[(IY + i) & MASK] = 0x00;
  for (const [a, v] of SEEDS) mem[a & MASK] = v & 0xFF;
  seedEdit(mem);
  w24(mem, ENTRY_SP, RET);
}

const r24 = (cpu, n) => ((cpu[`_${n}`] ?? cpu[n] ?? 0) & 0xFFFFFF);
function regs(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF, a: cpu.a & 0xFF, f: cpu.f & 0xFF, bc: r24(cpu, 'bc'), de: r24(cpu, 'de'),
    hl: r24(cpu, 'hl'), ix: r24(cpu, 'ix'), iy: r24(cpu, 'iy'), sp: cpu.sp & 0xFFFFFF,
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
    case 'push': return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'ei': return 'EI';
    case 'di': return 'DI';
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
    default: return null;
  }
}

function trace(cpu, mem, rom, budget, miles, target) {
  const visit = new Map(), events = [], writes = [], xwrites = [], iy = [], tail = [], path = [], hit = new Map(miles.map(([pc, l]) => [pc, null]));
  const rshadow = Object.fromEntries(REGIONS.map((r) => [r.n, new Uint8Array(mem.subarray(r.s, r.e))]));
  const xshadow = new Map(EXTRA.map((w) => [w.a, mem[w.a & MASK]]));
  const iyshadow = new Uint8Array(128); for (let i = 0; i < 128; i++) iyshadow[i] = mem[(IY + i) & MASK];
  const entry = regs(cpu);
  let steps = 0, stop = 'budget_exhausted', err = null, targetStep = null;
  while (steps < budget) {
    const pc = cpu.pc & 0xFFFFFF;
    visit.set(pc, (visit.get(pc) ?? 0) + 1);
    tail.push(pc); if (tail.length > 32) tail.shift();
    if (hit.has(pc) && hit.get(pc) === null) hit.set(pc, steps);
    if (targetStep === null && pc === target) targetStep = steps;
    if (targetStep !== null && path.length < 96 && (path.length === 0 || path[path.length - 1] !== pc)) path.push(pc);
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
    if (hit.has(after) && hit.get(after) === null) hit.set(after, steps);
    if (out === -1) { stop = 'halt'; break; }
    if (out === -2) { stop = 'sleep'; break; }
    if (after === RET) { stop = 'returned_sentinel'; break; }
  }
  return { budget, steps, stop, err, entry, exit: regs(cpu), finalPc: cpu.pc & 0xFFFFFF, visit: [...visit.entries()].sort((a, b) => a[0] - b[0]), events, writes, xwrites, iy, hit, miles, target, targetStep, path, tail };
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
  console.log(`  CALL/JP events (${res.events.length} total):`);
  if (!res.events.length) console.log('    (none)');
  for (const e of res.events) console.log(`    step ${String(e.step).padStart(4, ' ')}: ${hx(e.from)} -> ${e.k}${e.c ? ` ${String(e.c).toUpperCase()}` : ''} ${hx(e.t)} (${e.taken ? 'taken' : 'not-taken'}, next ${hx(e.after)})`);
  console.log('');
  printWrites('  RAM writes in requested regions:', res.writes);
  printWrites('  Extra watched writes:', res.xwrites);
  console.log(`  IY flag changes (${res.iy.length} total):`);
  if (!res.iy.length) console.log('    (none)');
  for (const c of res.iy) console.log(`    step ${String(c.step).padStart(4, ' ')} after ${hx(c.afterBlock)}: IY+${hx(c.offset, 2)} (${hx(c.addr)}) ${hb(c.oldVal)} -> ${hb(c.newVal)}`);
  console.log('');
  console.log(`  Path from ${hx(res.target)}:`);
  console.log(`    ${res.targetStep === null ? 'target not reached' : res.path.map((pc) => hx(pc)).join(' -> ')}`);
  console.log('');
  console.log(`  Tail: ${res.tail.map((pc) => hx(pc)).join(' -> ')}`);
  console.log('');
}

function groupWrites(rows) {
  const map = new Map();
  for (const w of rows) {
    if (!map.has(w.addr)) map.set(w.addr, { addr: w.addr, name: w.region ?? w.name, oldVal: w.oldVal, newVal: w.newVal, count: 1 });
    else { const r = map.get(w.addr); r.newVal = w.newVal; r.count += 1; }
  }
  return [...map.values()].sort((a, b) => a.addr - b.addr);
}

const taken = (res, target) => res.events.some((e) => e.t === target && e.taken);

function report(run1, run2) {
  const s1 = [...groupWrites(run1.writes), ...groupWrites(run1.xwrites)];
  const s2 = [...groupWrites(run2.writes), ...groupWrites(run2.xwrites)];
  const run1Event = taken(run1, EV0) || taken(run1, EV1);
  const run2Event = taken(run2, EV0) || taken(run2, EV1);
  const run2DispAfter = run2.targetStep === null ? 0 : run2.path.filter((pc) => pc >= DISP_LO && pc < DISP_HI && pc !== DIRECT).length;
  console.log('========================================================================');
  console.log('REPORT');
  console.log('========================================================================');
  console.log('  Static structure:');
  console.log('    0x08BFCD first CALLs 0x08BFEC, then tests BIT 3,(IY+9).');
  console.log('    If the bit is clear, it RETs. If set, it reads D02A86, executes EI,');
  console.log(`    then JP ${hx(EV0)} or ${hx(EV1)}.`);
  console.log('');
  console.log('  What 0x08BFCD does:');
  console.log('    It is a post-display cleanup/dispatch gate, not a new display-chain entry.');
  console.log('    0x08BFEC also updates D026AA/D026AC and branches into 0x08C0xx/0x08C1xx state logic.');
  console.log('');
  console.log('  RUN 1:');
  console.log(`    ${run1.stop === 'returned_sentinel' ? 'Returned to caller/sentinel under the direct baseline.' : run1Event ? 'Jumped into the 0x0271xx event-loop path under the direct baseline.' : `Did not resolve to RET or 0x0271xx within ${run1.steps} steps.`}`);
  console.log(`    Watched RAM changes: ${s1.length ? s1.map((r) => `${hx(r.addr)} ${hb(r.oldVal)}->${hb(r.newVal)} x${r.count}`).join('; ') : 'none'}`);
  console.log('');
  console.log('  RUN 2:');
  console.log(`    ${run2.targetStep === null ? `0x08BFCD was not reached within ${RUN2} steps from 0x08BF22.` : `0x08BFCD was first reached at step ${run2.targetStep}.`}`);
  if (run2.targetStep !== null) {
    console.log(`    ${run2Event ? 'After the display chain returns, execution hands off into 0x0271xx.' : run2.stop === 'returned_sentinel' ? 'After the display chain returns, execution falls back to the caller/sentinel.' : `After the display chain returns, execution continues at ${hx(run2.finalPc)} within budget.`}`);
    console.log(`    Additional 0x0A32xx-0x0A34xx display blocks after 0x08BFCD: ${run2DispAfter}`);
  }
  console.log(`    Watched RAM changes: ${s2.length ? s2.map((r) => `${hx(r.addr)} ${hb(r.oldVal)}->${hb(r.newVal)} x${r.count}`).join('; ') : 'none'}`);
  console.log('');
  console.log('  Answer:');
  console.log('    0x08BFCD is the post-display return target. It does not itself chain back');
  console.log('    into 0x0A32xx display work. Its visible choices are RET versus EI+JP into');
  console.log(`    ${hx(EV0)}/${hx(EV1)}, with D02A86 used on the jump path and D026AA/D026AC`);
  console.log('    updated by the 0x08BFEC sub-call.');
  console.log('');
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

    console.log('Phase 244: 0x08BFCD post-display-chain exit target');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${rom.length} bytes)`);
    console.log(`Transpiled source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log('Peripheral seed: createPeripheralBus({ timerInterrupt: false })');
    console.log(`Requested entry state: IX=${hx(IX)} IY=${hx(IY)} SP=${hx(ENTRY_SP)} MBASE=${hb(MBASE)} RET=${hx(RET)}`);
    console.log('');
    console.log('========================================================================');
    console.log('COLD BOOT');
    console.log('========================================================================');
    console.log(`  boot:   steps=${boot.boot.steps}/${boot.boot.termination}`);
    console.log(`  kernel: steps=${boot.kernel.steps}/${boot.kernel.termination}`);
    console.log(`  post:   steps=${boot.post.steps}/${boot.post.termination}`);
    console.log('');
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

    rt.mem.set(bootMem); restoreCpu(rt.cpu, bootCpu); seedEntry(rt.cpu, rt.mem, DIRECT);
    const run1 = trace(rt.cpu, rt.mem, rom, RUN1, M1, DIRECT);
    printRun(`RUN 1: Direct call to ${hx(DIRECT)} (${RUN1} steps)`, run1);

    rt.mem.set(bootMem); restoreCpu(rt.cpu, bootCpu); seedEntry(rt.cpu, rt.mem, CALLER);
    const run2 = trace(rt.cpu, rt.mem, rom, RUN2, M2, DIRECT);
    printRun(`RUN 2: Enter from ${hx(CALLER)} (${RUN2} steps)`, run2);

    report(run1, run2);
  } finally {
    cleanupAssets(assets);
  }
}

main().catch((e) => { console.error(e?.stack || String(e)); process.exitCode = 1; });
