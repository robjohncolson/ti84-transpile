#!/usr/bin/env node

/**
 * Phase 362: investigate 0x4C7B21 boot terminator + extended flash trampoline
 *
 * Run summary:
 *   Not executed in subagent mode.
 *   Run:
 *     node TI-84_Plus_CE/probe-phase362-investigate-4C7B21.mjs
 *
 * Static pre-run notes:
 *   - 0x0021C2 ends in RET and has no indirect JP/CALL.
 *   - 0x006D5D calls 0x0021C2, then 0x006D68 does `ld sp, ix; pop ix; ret`.
 *   - 0x4C7B21 aliases to 0x0C7B21 under `pc & 0x3FFFFF`.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const ROM_SIZE = 0x400000;
const ROM_MASK = ROM_SIZE - 1;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 50000;
const LAST_BLOCK_WINDOW = 20;
const TARGET = 0x4C7B21;
const ALIAS = TARGET & ROM_MASK;
const BLOCK_21C2 = 0x0021C2;
const BLOCK_6D5D = 0x006D5D;
const BLOCK_6D68 = 0x006D68;
const WINDOW_BYTES = 0x20;
const WATCH_PORTS = new Set([0x0006, 0x0007, 0x001D, 0x001E, 0x001F, 0x1002, 0x1005]);
const MMIO_START = 0xE00000;
const MMIO_END = 0xE01000;
const STOP_TAGS = new Set(['jp', 'jp-conditional', 'jp-indirect', 'jr', 'jr-conditional', 'ret', 'ret-conditional', 'rst']);

function hex(v, w = 6) {
  if (v === undefined || v === null || Number.isNaN(v)) return 'n/a';
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function hb(v) { return hex((v ?? 0) & 0xFF, 2); }
function key(pc, mode = 'adl') { return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`; }

function read24(buf, addr) {
  const a = addr & 0xFFFFFF;
  return (buf[a] ?? 0) | ((buf[a + 1] ?? 0) << 8) | ((buf[a + 2] ?? 0) << 16);
}

function hexBytes(buf, start, len) {
  const a = start & 0xFFFFFF;
  return Array.from(buf.subarray(a, Math.min(buf.length, a + len)), (v) => hb(v)).join(' ');
}

function win(buf, start, len) {
  const a = start & 0xFFFFFF;
  return Array.from(buf.subarray(a, Math.min(buf.length, a + len)));
}

function classify(bytes) {
  if (bytes.every((v) => v === 0x00)) return 'all 0x00';
  if (bytes.every((v) => v === 0xFF)) return 'all 0xFF';
  return 'mixed / non-empty';
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) return false;
  const hint = fs.existsSync(TRANSPILED_GZ_PATH) ? `${path.basename(TRANSPILED_GZ_PATH)} is present; ` : '';
  console.log(`${hint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
  if (!fs.existsSync(TRANSPILED_PATH)) throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  return true;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) return Object.fromEntries(raw.filter((b) => b?.id).map((b) => [b.id, b]));
  return raw ?? {};
}

function createMemory(rom) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function fmt(inst) {
  if (!inst) return 'unknown';
  const p = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (v) => (v >= 0 ? `+${v}` : `${v}`);
  switch (inst.tag) {
    case 'alu-reg': return `${p}${inst.op} ${inst.src}`;
    case 'call': return `${p}call ${hex(inst.target)}`;
    case 'jp': return `${p}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}jp (${inst.indirectRegister})`;
    case 'jr': return `${p}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ld-pair-imm': return `${p}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-indexed': return `${p}ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-reg-ind': return `${p}ld ${inst.dest}, (${inst.src})`;
    case 'ld-sp-pair': return `${p}ld sp, ${inst.pair}`;
    case 'pop': return `${p}pop ${inst.pair}`;
    case 'push': return `${p}push ${inst.pair}`;
    case 'ret': return `${p}ret`;
    case 'ret-conditional': return `${p}ret ${inst.condition}`;
    case 'rst': return `${p}rst ${hex(inst.target, 2)}`;
    case 'sbc-pair': return `${p}sbc hl, ${inst.src}`;
    case 'di': case 'ei': case 'halt': case 'nop': return `${p}${inst.tag}`;
    default: return inst.dasm ?? inst.tag;
  }
}

function decodeBlock(rom, startPc, mode = 'adl', maxBytes = 64) {
  const rows = [];
  let pc = startPc;
  const end = Math.min(rom.length, startPc + maxBytes);
  while (pc < end) {
    let inst = null;
    try { inst = decodeInstruction(rom, pc, mode); } catch {}
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      rows.push({ pc, bytes: hexBytes(rom, pc, 1), text: `db ${hb(rom[pc])}`, tag: 'db' });
      pc += 1;
      continue;
    }
    rows.push({ pc, bytes: hexBytes(rom, pc, inst.length), text: fmt(inst), tag: inst.tag });
    pc += inst.length;
    if (STOP_TAGS.has(inst.tag)) break;
  }
  return rows;
}

function regs(cpu) {
  return {
    a: cpu.a & 0xFF, f: cpu.f & 0xFF, bc: cpu.bc & 0xFFFFFF, de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF, ix: cpu.ix & 0xFFFFFF, iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF, mbase: cpu.mbase & 0xFF, madl: cpu.madl ? 1 : 0,
  };
}

function stack(cpu, mem, count = 4) {
  const out = [];
  if (cpu.madl) {
    let addr = cpu.sp & 0xFFFFFF;
    for (let i = 0; i < count; i += 1) {
      out.push({ addr, value: read24(mem, addr), width: 6 });
      addr = (addr + 3) & 0xFFFFFF;
    }
    return out;
  }
  let sps = cpu.sp & 0xFFFF;
  for (let i = 0; i < count; i += 1) {
    const addr = ((cpu.mbase & 0xFF) << 16) | sps;
    out.push({ addr, value: (mem[addr] ?? 0) | ((mem[addr + 1] ?? 0) << 8), width: 4 });
    sps = (sps + 2) & 0xFFFF;
  }
  return out;
}

function frame(mem, base, count = 6) {
  const out = [];
  let addr = base & 0xFFFFFF;
  for (let i = 0; i < count; i += 1) {
    out.push({ addr, value: read24(mem, addr) });
    addr = (addr + 3) & 0xFFFFFF;
  }
  return out;
}

function lastInstText(meta) {
  const last = meta?.instructions?.[meta.instructions.length - 1];
  return last ? (last.dasm ?? fmt(last)) : 'n/a';
}

function summarize(events, addrField) {
  const grouped = new Map();
  for (const event of events) {
    const k = `${event.dir}:${event[addrField]}`;
    const got = grouped.get(k);
    if (got) {
      got.count += 1; got.first = Math.min(got.first, event.step); got.last = Math.max(got.last, event.step); got.values.add(event.value);
    } else {
      grouped.set(k, { ...event, count: 1, first: event.step, last: event.step, values: new Set([event.value]) });
    }
  }
  return [...grouped.values()].sort((a, b) => a[addrField] - b[addrField] || a.dir.localeCompare(b.dir));
}

function printRegs(label, r) {
  console.log(label);
  console.log(`  A=${hb(r.a)} F=${hb(r.f)} BC=${hex(r.bc)} DE=${hex(r.de)} HL=${hex(r.hl)} IX=${hex(r.ix)} IY=${hex(r.iy)} SP=${hex(r.sp)} MBASE=${hb(r.mbase)} MADL=${r.madl}`);
  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
  const regenerated = ensureTranspiledRom();
  const rom = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const BLOCKS = normalizeBlocks(transpiledModule.PRELIFTED_BLOCKS ?? transpiledModule.default?.PRELIFTED_BLOCKS ?? transpiledModule.default ?? transpiledModule);
  if (Object.keys(BLOCKS).length === 0) throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');

  const meta21c2 = BLOCKS[key(BLOCK_21C2, 'adl')];
  const meta6d5d = BLOCKS[key(BLOCK_6D5D, 'adl')];
  const metaAlias = BLOCKS[key(ALIAS, 'adl')];

  console.log('Phase 362: Investigate 0x4C7B21 Boot Terminator + Extended Flash Trampoline');
  console.log('===========================================================================');
  console.log(`ROM:            ${ROM_PATH}`);
  console.log(`Transpiled ROM: ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:    timerInterrupt=false, gpioValue=${hb(0xEF)}, maxSteps=${BOOT_MAX_STEPS}`);
  console.log(`Alias guess:    ${hex(TARGET)} -> ${hex(ALIAS)} via pc & ${hex(ROM_MASK)}`);
  console.log('');

  console.log('=== PART 1: STATIC DISASSEMBLY ===\n');
  for (const [label, pc, bytes] of [
    [`Block ${hex(BLOCK_21C2)}`, BLOCK_21C2, 64],
    [`Block ${hex(BLOCK_6D5D)}`, BLOCK_6D5D, 64],
    [`Epilogue ${hex(BLOCK_6D68)}`, BLOCK_6D68, 32],
    [`Alias ${hex(ALIAS)}`, ALIAS, 16],
  ]) {
    console.log(label);
    for (const row of decodeBlock(rom, pc, 'adl', bytes)) console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)}  ${row.text}`);
    console.log('');
  }

  console.log('=== PART 2: DYNAMIC BOOT TRACE ===\n');
  const mem = createMemory(rom);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: 0xEF });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  const cpu = executor.cpu;
  cpu.mem = mem; cpu.io = peripherals; cpu.pc = BOOT_ENTRY; cpu.madl = 0; cpu.adl = false; cpu.halted = false;

  let humanStep = 0;
  const ioEvents = [];
  const mmioEvents = [];
  cpu.onIoRead = (port, value) => { const p = port & 0xFFFF; if (WATCH_PORTS.has(p)) ioEvents.push({ dir: 'IN', port: p, value: value & 0xFF, step: humanStep }); };
  cpu.onIoWrite = (port, value) => { const p = port & 0xFFFF; if (WATCH_PORTS.has(p)) ioEvents.push({ dir: 'OUT', port: p, value: value & 0xFF, step: humanStep }); };
  cpu.onMmioRead = (addr, value) => { const a = addr & 0xFFFFFF; if (a >= MMIO_START && a < MMIO_END) mmioEvents.push({ dir: 'IN', addr: a, value: value & 0xFF, step: humanStep }); };
  cpu.onMmioWrite = (addr, value) => { const a = addr & 0xFFFFFF; if (a >= MMIO_START && a < MMIO_END) mmioEvents.push({ dir: 'OUT', addr: a, value: value & 0xFF, step: humanStep }); };

  const recent = [];
  const missing = [];
  const dyn = new Map();
  let snap6d5d = null;
  let snap21c2 = null;
  let snap6d68 = null;
  let termDyn = null;
  let term = null;

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, step) {
      const p = pc & 0xFFFFFF; const m = mode ?? 'adl'; humanStep = step + 1;
      recent.push({ step: humanStep, pc: p, mode: m, exit: lastInstText(meta) }); if (recent.length > LAST_BLOCK_WINDOW) recent.shift();
      if (p === BLOCK_6D5D && !snap6d5d) snap6d5d = { step: humanStep, mode: m, regs: regs(cpu), stack: stack(cpu, mem), ix: cpu.ix & 0xFFFFFF, ixBytes: hexBytes(mem, cpu.ix, 18), ixWords: frame(mem, cpu.ix, 6), ixPlus9: read24(mem, (cpu.ix + 9) & 0xFFFFFF) };
      if (p === BLOCK_21C2 && !snap21c2) snap21c2 = { step: humanStep, mode: m, regs: regs(cpu), stack: stack(cpu, mem) };
      if (p === BLOCK_6D68 && !snap6d68) snap6d68 = { step: humanStep, mode: m, regs: regs(cpu), stack: stack(cpu, mem), ix: cpu.ix & 0xFFFFFF, ixBytes: hexBytes(mem, cpu.ix, 18), ixWords: frame(mem, cpu.ix, 6) };
    },
    onDynamicTarget(target, mode, callerPc, step) {
      const t = target & 0xFFFFFF; const c = callerPc & 0xFFFFFF; const m = mode ?? 'adl'; const transfer = lastInstText(executor.blockMeta[key(c, m)]);
      if (c === BLOCK_21C2 || c === BLOCK_6D68 || t >= 0x400000) dyn.set(`${c}:${m}:${t}:${transfer}`, { step, callerPc: c, callerMode: m, target: t, transfer });
      if (t === TARGET && !termDyn) termDyn = { step, callerPc: c, callerMode: m, target: t, transfer, regs: regs(cpu), stack: stack(cpu, mem) };
    },
    onMissingBlock(pc, mode, step) {
      const p = pc & 0xFFFFFF; const m = mode ?? 'adl'; missing.push({ step: step + 1, pc: p, mode: m });
      if (p === TARGET && !term) term = { step: step + 1, pc: p, mode: m, regs: regs(cpu), stack: stack(cpu, mem), recent: [...recent] };
    },
  });

  console.log(`Boot summary: termination=${result.termination} steps=${result.steps} last=${hex(result.lastPc)}:${result.lastMode}\n`);

  console.log(`Last ${LAST_BLOCK_WINDOW} blocks before ${hex(TARGET)}`);
  if (!term) console.log('  target terminator not reached');
  else {
    console.log(`  missing_block at step ${term.step}: ${hex(term.pc)}:${term.mode}`);
    for (const e of term.recent) console.log(`  step=${String(e.step).padStart(6)}  ${hex(e.pc)}:${e.mode}  exit=${e.exit}`);
  }
  console.log('');

  console.log(`Instruction that produced ${hex(TARGET)}`);
  if (!termDyn) console.log('  no dynamic transfer captured');
  else console.log(`  step=${termDyn.step} caller=${hex(termDyn.callerPc)}:${termDyn.callerMode} ${termDyn.transfer} -> ${hex(termDyn.target)}`);
  console.log('');

  console.log('Interesting dynamic targets');
  if (dyn.size === 0) console.log('  none');
  else for (const e of [...dyn.values()].sort((a, b) => a.step - b.step)) console.log(`  step=${e.step} caller=${hex(e.callerPc)}:${e.callerMode} ${e.transfer} -> ${hex(e.target)}`);
  console.log('');

  for (const snap of [
    ['0x006D5D entry', snap6d5d],
    ['0x0021C2 entry', snap21c2],
    ['0x006D68 entry', snap6d68],
  ]) {
    if (!snap[1]) continue;
    const [label, s] = snap;
    console.log(label);
    console.log(`  step=${s.step} mode=${s.mode}`);
    if (s.ix !== undefined) console.log(`  IX=${hex(s.ix)} IX-bytes=${s.ixBytes}`);
    if (s.ixPlus9 !== undefined) console.log(`  (IX+9)=${hex(s.ixPlus9)}`);
    printRegs(`  Registers for ${label}`, s.regs);
    console.log(`  Stack: ${s.stack.map((x) => `[${hex(x.addr)}]=${hex(x.value, x.width)}`).join('  ')}`);
    if (s.ixWords) console.log(`  IX words: ${s.ixWords.map((x) => `[${hex(x.addr)}]=${hex(x.value)}`).join('  ')}`);
    console.log('');
  }

  if (term) {
    printRegs(`Registers after missing_block at ${hex(TARGET)}`, term.regs);
    console.log(`Top of stack after termination: ${term.stack.map((x) => `[${hex(x.addr)}]=${hex(x.value, x.width)}`).join('  ')}\n`);
  }

  if (missing.length > 0) {
    console.log(`All missing blocks (${missing.length})`);
    for (const e of missing) console.log(`  step=${String(e.step).padStart(6)}  ${hex(e.pc)}:${e.mode}`);
    console.log('');
  }

  console.log('=== PART 3: MEMORY WINDOWS ===\n');
  for (const [label, addr] of [[`Memory at ${hex(TARGET)}..${hex(TARGET + WINDOW_BYTES - 1)}`, TARGET], [`ROM alias at ${hex(ALIAS)}..${hex(ALIAS + WINDOW_BYTES - 1)}`, ALIAS]]) {
    console.log(label);
    for (let off = 0; off < WINDOW_BYTES; off += 16) console.log(`  ${hex(addr + off)}: ${hexBytes(mem, addr + off, Math.min(16, WINDOW_BYTES - off))}`);
    console.log('');
  }

  console.log('=== PART 4: FLASH / BANK SIGNALS ===\n');
  console.log('Watched I/O ports');
  const ioSummary = summarize(ioEvents, 'port');
  if (ioSummary.length === 0) console.log('  none');
  else for (const e of ioSummary) console.log(`  port=${hex(e.port, 4)} dir=${e.dir.padEnd(3)} count=${String(e.count).padStart(3)} steps=${e.first}..${e.last} values=[${[...e.values].sort((a, b) => a - b).map(hb).join(', ')}]`);
  console.log('');

  console.log(`Watched MMIO (${hex(MMIO_START)}..${hex(MMIO_END - 1)})`);
  const mmioSummary = summarize(mmioEvents, 'addr');
  if (mmioSummary.length === 0) console.log('  none');
  else for (const e of mmioSummary) console.log(`  addr=${hex(e.addr)} dir=${e.dir.padEnd(3)} count=${String(e.count).padStart(3)} steps=${e.first}..${e.last} values=[${[...e.values].sort((a, b) => a - b).map(hb).join(', ')}]`);
  console.log('');

  if (typeof peripherals.getState === 'function') {
    const state = peripherals.getState();
    console.log('Peripheral state');
    console.log(`  flash.lastWrite=${hb(state.flash.lastWrite)} pll.lastWrite=${hb(state.pll.lastWrite)} csBase[1D]=${hb(state.csBase[0x1D] ?? 0xFF)} csBase[1E]=${hb(state.csBase[0x1E] ?? 0xFF)} csBase[1F]=${hb(state.csBase[0x1F] ?? 0xFF)}\n`);
  }

  console.log('=== PART 5: FINDINGS / PROPOSED FIX ===\n');
  const ctrl21c2 = (meta21c2?.instructions ?? []).filter((inst) => STOP_TAGS.has(inst.tag)).map((inst) => inst.dasm ?? fmt(inst));
  const indirect21c2 = (meta21c2?.instructions ?? []).filter((inst) => inst.tag === 'jp-indirect' || inst.tag === 'call-indirect');
  const retFromFrame = snap6d68?.ixWords?.[1]?.value ?? null;
  const ixPop = snap6d68?.ixWords?.[0]?.value ?? null;

  console.log(`0x0021C2 control flow: ${ctrl21c2.length ? ctrl21c2.join('; ') : 'none'}`);
  console.log(indirect21c2.length === 0
    ? '0x0021C2 contains no JP (HL)/(IX)/(IY) or indirect CALL; its only exit is RET.'
    : `0x0021C2 contains indirect flow: ${indirect21c2.map((inst) => inst.dasm ?? fmt(inst)).join('; ')}`);
  if (meta6d5d) console.log(`0x006D5D instructions: ${meta6d5d.instructions.map((inst) => inst.dasm ?? fmt(inst)).join(' ; ')}`);
  if (snap6d5d) console.log(`At 0x006D5D entry: IX=${hex(snap6d5d.ix)} and (IX+9)=${hex(snap6d5d.ixPlus9)}; that value is loaded into HL before the call.`);
  if (snap6d68) console.log(`At 0x006D68 entry: IX=${hex(snap6d68.ix)} with [IX]=${hex(ixPop)}, [IX+3]=${hex(retFromFrame)}. Because the block executes "ld sp, ix; pop ix; ret", the final target comes from [IX+3], not HL.`);
  if (termDyn) console.log(`Dynamic jump into ${hex(TARGET)} came from ${hex(termDyn.callerPc)}:${termDyn.callerMode} via "${termDyn.transfer}".`);
  console.log(`Memory at ${hex(TARGET)} is ${classify(win(mem, TARGET, WINDOW_BYTES))}; alias window at ${hex(ALIAS)} is ${classify(win(mem, ALIAS, WINDOW_BYTES))}.`);
  console.log(`Alias math: ${hex(TARGET)} - 0x400000 = ${hex(ALIAS)} and ${hex(TARGET)} & 0x3FFFFF = ${hex(ALIAS)}.`);
  if (metaAlias) console.log(`Lifted block ${key(ALIAS, 'adl')} already exists and starts with "${metaAlias.instructions?.[0]?.dasm ?? 'unknown'}".`);
  if (ioSummary.length === 0 && mmioSummary.length === 0) console.log('No watched flash/bank activity was observed on ports 0x06/0x07/0x1D-0x1F/0x1002/0x1005 or MMIO 0xE00000+.');
  console.log('');
  console.log('Proposed fix');
  console.log(`  Add an extended-flash alias trampoline: when a missing block is in [${hex(ROM_SIZE)}, ${hex((ROM_SIZE * 2) - 1)}], retry at pc & ${hex(ROM_MASK)} before declaring missing_block.`);
  console.log(`  For this case that maps ${hex(TARGET)} -> ${hex(ALIAS)}, which already has lifted code (${metaAlias?.instructions?.[0]?.dasm ?? 'unknown'}).`);
  console.log('  If later traces show real bank-register writes that affect the mapping, replace the fixed mask with a bank-aware resolver.');
  console.log('\n--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
