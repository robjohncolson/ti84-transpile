#!/usr/bin/env node

// Phase 245: Investigate D02A86 — pending-display-update counter
// Find all ROM references to D02A86, classify as READ/WRITE/POINTER,
// disassemble context around each site, check boot value, event-loop behavior.

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
const TARGET_ADDR = 0xD02A86;
const TARGET_LE = [0x86, 0x2A, 0xD0]; // little-endian bytes of D02A86

const BOOT_ENTRY = 0x000000;
const KERNEL_ENTRY = 0x08C331;
const POST_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x0002B8;
const EVENT_LOOP_ENTRY = 0x02FD99;
const BOOT_SP = 0xD1A87E;
const ENTRY_SP = 0xD1987E;
const RET_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IY = 0xD00080;
const IX = 0xD1A860;

const hx = (v, w = 6) => v === undefined || v === null || Number.isNaN(v)
  ? 'n/a'
  : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const hb = (v) => hx((v ?? 0) & 0xFF, 2);
const bhex = (bs) => Array.from(bs, (b) => hb(b)).join(' ');

const w24 = (m, a, v) => {
  const b = a & MASK;
  m[b] = v & 0xFF;
  m[(b + 1) & MASK] = (v >>> 8) & 0xFF;
  m[(b + 2) & MASK] = (v >>> 16) & 0xFF;
};

const r24mem = (m, a) => {
  const b = a & MASK;
  return m[b] | (m[(b + 1) & MASK] << 8) | (m[(b + 2) & MASK] << 16);
};

// ── Formatting helpers ──

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
      const s = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      const w = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      return inst.direction === 'to-mem'
        ? `LD${s} (${hx(inst.addr, w)}), ${String(inst.pair).toUpperCase()}`
        : `LD${s} ${String(inst.pair).toUpperCase()}, (${hx(inst.addr, w)})`;
    }
    case 'ld-mem-pair': {
      const s = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      const w = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
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
    default:
      return inst.tag
        + (inst.target !== undefined ? ` ${hx(inst.target)}` : '')
        + (inst.value !== undefined ? ` ${hx(inst.value)}` : '');
  }
}

function disasm(rom, start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      const len = inst.length || 1;
      rows.push({
        pc,
        bytes: bhex(rom.subarray(pc, Math.min(pc + len, end))),
        text: fmt(inst),
      });
      pc += len;
    } catch (e) {
      rows.push({
        pc,
        bytes: hb(rom[pc]),
        text: `DB ${hb(rom[pc])} ; ${e?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }
  return rows;
}

function printDisasm(rom, start, end) {
  for (const row of disasm(rom, start, end)) {
    console.log(`    ${hx(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}`);
  }
}

// ── Static ROM scan ──

function scanRomForD02A86(rom) {
  const hits = [];
  const romLen = Math.min(rom.length, 0x400000); // ROM region only

  for (let i = 0; i < romLen - 2; i++) {
    if (rom[i] === TARGET_LE[0] && rom[i + 1] === TARGET_LE[1] && rom[i + 2] === TARGET_LE[2]) {
      hits.push(i);
    }
  }
  return hits;
}

// Classify a reference based on the opcode context.
// We look backward from the address-byte position to find the instruction
// that contains D02A86 as an operand.
function classifyReference(rom, byteOffset) {
  // The 3 bytes at byteOffset are 86 2A D0.
  // We need to find the instruction that starts before byteOffset
  // and includes these bytes as an address operand.
  // Try decoding from several positions before the byte pattern.

  const contextStart = Math.max(0, byteOffset - 8);
  const contextEnd = Math.min(rom.length, byteOffset + 8);

  for (let tryPc = contextStart; tryPc <= byteOffset; tryPc++) {
    try {
      const inst = decodeInstruction(rom, tryPc, 'adl');
      const instEnd = tryPc + (inst.length || 1);

      // Check if this instruction spans over our byte pattern
      if (instEnd > byteOffset && tryPc <= byteOffset) {
        const addr = inst.addr ?? inst.target ?? inst.value;
        if (addr === TARGET_ADDR) {
          // Classify based on tag
          const tag = inst.tag;
          if (tag === 'ld-reg-mem' || (tag === 'ld-pair-mem' && inst.direction !== 'to-mem')) {
            return { type: 'READ', instPc: tryPc, inst, tag };
          }
          if (tag === 'ld-mem-reg' || tag === 'ld-mem-pair' || (tag === 'ld-pair-mem' && inst.direction === 'to-mem')) {
            return { type: 'WRITE', instPc: tryPc, inst, tag };
          }
          if (tag === 'ld-pair-imm') {
            return { type: 'POINTER', instPc: tryPc, inst, tag };
          }
          // call/jp to D02A86 would be odd but classify
          if (tag === 'call' || tag === 'call-conditional' || tag === 'jp' || tag === 'jp-conditional') {
            return { type: 'BRANCH', instPc: tryPc, inst, tag };
          }
          return { type: 'OTHER', instPc: tryPc, inst, tag };
        }
      }
    } catch {
      // decode error, try next position
    }
  }

  // Could not classify — might be data or pointer table
  return { type: 'POINTER/DATA', instPc: byteOffset, inst: null, tag: null };
}

// ── Asset loading (same pattern as phase 244) ──

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
  return Array.isArray(raw)
    ? Object.fromEntries(raw.filter((b) => b?.id).map((b) => [b.id, b]))
    : (raw ?? {});
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

const blockKey = (a, m) => `${(a >>> 0).toString(16).padStart(6, '0')}:${m}`;

function nextMode(executor, key, pc, mode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return mode;
  for (const ex of exits) {
    if (ex.target === pc && ex.targetMode) return ex.targetMode;
  }
  return mode;
}

function installStep(cpu, executor) {
  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks?.[key];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block ${hx(pc)} (${key})`);
    }
    const out = fn(this);
    if (typeof out !== 'number') {
      throw new Error(`Bad step result from ${hx(pc)}: ${String(out)}`);
    }
    if (out >= 0) {
      const nm = nextMode(executor, key, out, mode);
      this.pc = out & 0xFFFFFF;
      this.madl = nm === 'adl' ? 1 : 0;
    }
    return out;
  };
}

// ── Boot sequences ──

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = BOOT_SP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu._iy = IY; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = BOOT_SP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return { boot, kernel, post };
}

// ── Traced run with D02A86 monitoring ──

function tracedRun(cpu, mem, label, entry, mode, maxSteps) {
  const startVal = mem[TARGET_ADDR & MASK];
  const d02a86Reads = [];
  const d02a86Writes = [];
  let steps = 0;
  let stop = 'budget_exhausted';
  let err = null;

  // Shadow the target byte to detect writes
  let shadow = mem[TARGET_ADDR & MASK];

  while (steps < maxSteps) {
    const pc = cpu.pc & 0xFFFFFF;
    if (pc === RET_SENTINEL) { stop = 'returned_sentinel'; break; }

    let out;
    try {
      out = cpu.step();
    } catch (e) {
      stop = 'error';
      err = e instanceof Error ? e.message : String(e);
      break;
    }
    steps += 1;

    // Check if D02A86 was written
    const cur = mem[TARGET_ADDR & MASK];
    if (cur !== shadow) {
      d02a86Writes.push({ step: steps, afterBlock: pc, oldVal: shadow, newVal: cur });
      shadow = cur;
    }

    if (out === -1) { stop = 'halt'; break; }
    if (out === -2) { stop = 'sleep'; break; }
    if ((cpu.pc & 0xFFFFFF) === RET_SENTINEL) { stop = 'returned_sentinel'; break; }
  }

  const endVal = mem[TARGET_ADDR & MASK];
  return { label, steps, maxSteps, stop, err, startVal, endVal, d02a86Writes };
}

// ── Main ──

async function main() {
  const assets = ensureAssets();
  try {
    const rom = fs.readFileSync(ROM_PATH);

    console.log('================================================================');
    console.log('Phase 245: D02A86 — pending-display-update counter investigation');
    console.log('================================================================');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${rom.length} bytes)`);
    console.log(`Target address: ${hx(TARGET_ADDR)} (little-endian: ${TARGET_LE.map(b => hb(b)).join(' ')})`);
    console.log('');

    // ── PART 1: Static ROM scan ──
    console.log('================================================================');
    console.log('PART 1: Static ROM scan for D02A86 references');
    console.log('================================================================');

    const byteHits = scanRomForD02A86(rom);
    console.log(`  Found ${byteHits.length} byte-pattern matches for 86 2A D0 in ROM (0x000000..0x3FFFFF):`);
    console.log('');

    const classified = [];
    for (const offset of byteHits) {
      const cls = classifyReference(rom, offset);
      classified.push({ offset, ...cls });
      console.log(`  Byte offset ${hx(offset)}: instruction at ${hx(cls.instPc)} — ${cls.type}${cls.tag ? ` [${cls.tag}]` : ''}`);
      if (cls.inst) {
        console.log(`    Decoded: ${fmt(cls.inst)}`);
      }
    }
    console.log('');

    // ── PART 2: Disassemble context around WRITE sites ──
    const writeSites = classified.filter(c => c.type === 'WRITE');
    console.log('================================================================');
    console.log(`PART 2: WRITE sites — disassembly context (${writeSites.length} found)`);
    console.log('================================================================');

    for (const site of writeSites) {
      const start = Math.max(0, site.instPc - 16);
      const end = Math.min(rom.length, site.instPc + 20);
      console.log(`\n  WRITE at ${hx(site.instPc)}: ${site.inst ? fmt(site.inst) : '(unknown)'}`);
      console.log('  Context (-16 to +20 bytes):');
      printDisasm(rom, start, end);
    }
    console.log('');

    // ── PART 3: Disassemble context around READ sites ──
    const readSites = classified.filter(c => c.type === 'READ');
    console.log('================================================================');
    console.log(`PART 3: READ sites — disassembly context (${readSites.length} found)`);
    console.log('================================================================');

    for (const site of readSites) {
      const start = Math.max(0, site.instPc - 16);
      const end = Math.min(rom.length, site.instPc + 20);
      console.log(`\n  READ at ${hx(site.instPc)}: ${site.inst ? fmt(site.inst) : '(unknown)'}`);
      console.log('  Context (-16 to +20 bytes):');
      printDisasm(rom, start, end);
    }
    console.log('');

    // ── PART 3b: Disassemble context around POINTER/OTHER sites ──
    const otherSites = classified.filter(c => c.type !== 'READ' && c.type !== 'WRITE');
    if (otherSites.length > 0) {
      console.log('================================================================');
      console.log(`PART 3b: POINTER/OTHER sites — disassembly context (${otherSites.length} found)`);
      console.log('================================================================');

      for (const site of otherSites) {
        const start = Math.max(0, site.instPc - 16);
        const end = Math.min(rom.length, site.instPc + 20);
        console.log(`\n  ${site.type} at ${hx(site.instPc)}: ${site.inst ? fmt(site.inst) : '(raw data)'}`);
        console.log('  Context (-16 to +20 bytes):');
        printDisasm(rom, start, end);
      }
      console.log('');
    }

    // ── PART 4: Boot value checks ──
    console.log('================================================================');
    console.log('PART 4: Boot value checks for D02A86');
    console.log('================================================================');

    const mod = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(mod.PRELIFTED_BLOCKS ?? mod.default?.PRELIFTED_BLOCKS ?? mod.default ?? mod);
    if (!blocks || typeof blocks !== 'object' || !Object.keys(blocks).length) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }

    // 4a: z80 boot (0x000000, 200 steps)
    {
      const rt = makeRuntime(blocks, rom);
      const result = rt.executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 200, maxLoopIterations: 32 });
      const val = rt.mem[TARGET_ADDR & MASK];
      console.log(`  After z80 boot (0x000000, 200 steps): D02A86 = ${hb(val)} (termination: ${result.termination})`);
    }

    // 4b: kernelInit (0x00020C, 200 steps)
    {
      const rt = makeRuntime(blocks, rom);
      // First do z80 boot
      rt.executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
      rt.cpu.halted = false; rt.cpu.iff1 = 0; rt.cpu.iff2 = 0;
      rt.cpu.sp = BOOT_SP - 3;
      rt.mem.fill(0xFF, rt.cpu.sp, rt.cpu.sp + 3);
      // Then kernelInit from 0x00020C
      const result = rt.executor.runFrom(0x00020C, 'adl', { maxSteps: 200, maxLoopIterations: 32 });
      const val = rt.mem[TARGET_ADDR & MASK];
      console.log(`  After kernelInit (0x00020C, 200 steps): D02A86 = ${hb(val)} (termination: ${result.termination})`);
    }

    // 4c: memInit (0x0002B8, 10000 steps)
    {
      const rt = makeRuntime(blocks, rom);
      rt.executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
      rt.cpu.halted = false; rt.cpu.iff1 = 0; rt.cpu.iff2 = 0;
      rt.cpu.sp = BOOT_SP - 3;
      rt.mem.fill(0xFF, rt.cpu.sp, rt.cpu.sp + 3);
      const result = rt.executor.runFrom(MEM_INIT_ENTRY, 'adl', { maxSteps: 10000, maxLoopIterations: 1000 });
      const val = rt.mem[TARGET_ADDR & MASK];
      console.log(`  After memInit (0x0002B8, 10000 steps): D02A86 = ${hb(val)} (termination: ${result.termination})`);
    }

    // 4d: Full cold boot
    {
      const rt = makeRuntime(blocks, rom);
      const boot = coldBoot(rt.executor, rt.cpu, rt.mem);
      const val = rt.mem[TARGET_ADDR & MASK];
      console.log(`  After full cold boot: D02A86 = ${hb(val)}`);
      console.log(`    boot: steps=${boot.boot.steps}/${boot.boot.termination}`);
      console.log(`    kernel: steps=${boot.kernel.steps}/${boot.kernel.termination}`);
      console.log(`    post: steps=${boot.post.steps}/${boot.post.termination}`);
    }
    console.log('');

    // ── PART 5: Event loop check ──
    console.log('================================================================');
    console.log('PART 5: Event loop check (0x02FD99, 1000 steps)');
    console.log('================================================================');

    {
      const rt = makeRuntime(blocks, rom);
      const boot = coldBoot(rt.executor, rt.cpu, rt.mem);

      // Set up for event loop entry
      rt.cpu.halted = false;
      rt.cpu.iff1 = 0;
      rt.cpu.iff2 = 0;
      rt.cpu.madl = 1;
      rt.cpu.mbase = MBASE;
      rt.cpu.pc = EVENT_LOOP_ENTRY;
      rt.cpu.sp = ENTRY_SP;
      rt.cpu._iy = IY;
      rt.cpu._ix = IX;
      w24(rt.mem, ENTRY_SP, RET_SENTINEL);

      const result = tracedRun(rt.cpu, rt.mem, 'event-loop', EVENT_LOOP_ENTRY, 'adl', 1000);
      console.log(`  Entry: ${hx(EVENT_LOOP_ENTRY)}, ${result.steps}/${result.maxSteps} steps, stop=${result.stop}`);
      if (result.err) console.log(`  Error: ${result.err}`);
      console.log(`  D02A86 at start: ${hb(result.startVal)}`);
      console.log(`  D02A86 at end:   ${hb(result.endVal)}`);
      console.log(`  D02A86 writes during run: ${result.d02a86Writes.length}`);
      for (const w of result.d02a86Writes) {
        console.log(`    step ${String(w.step).padStart(4)}: after block ${hx(w.afterBlock)} ${hb(w.oldVal)} -> ${hb(w.newVal)}`);
      }
    }
    console.log('');

    // ── PART 6: Summary ──
    console.log('================================================================');
    console.log('SUMMARY');
    console.log('================================================================');

    console.log(`  Total byte-pattern matches in ROM: ${byteHits.length}`);
    console.log('');
    console.log('  Reference sites:');
    for (const c of classified) {
      console.log(`    ${hx(c.instPc)}: ${c.type.padEnd(14)} ${c.inst ? fmt(c.inst) : '(data)'}`);
    }
    console.log('');
    console.log(`  WRITE sites: ${writeSites.length}`);
    console.log(`  READ sites:  ${readSites.length}`);
    console.log(`  OTHER sites: ${otherSites.length}`);
    console.log('');
    console.log('  Write site analysis:');
    for (const site of writeSites) {
      console.log(`    ${hx(site.instPc)}: ${site.inst ? fmt(site.inst) : '(unknown)'}`);
    }
    console.log('');

  } finally {
    cleanupAssets(assets);
  }
}

main().catch((e) => { console.error(e?.stack || String(e)); process.exitCode = 1; });
