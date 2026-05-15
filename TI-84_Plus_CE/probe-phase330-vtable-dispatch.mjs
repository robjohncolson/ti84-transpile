#!/usr/bin/env node

/**
 * Phase 330: Vtable Dispatch Trace
 *
 * Maps how callers of 0x055316 (the config selector) consume the function
 * pointers stored at D005E9. Session 329 found the config table at 0x0525D4
 * has 12-byte entries: [selector, fn1=draw, fn2=width, fn3=height].
 * The selector 0x055316 writes the active entry pointer to D005E9.
 *
 * This probe:
 *   1. Scans ROM for all reads of D005E9..D005F1
 *   2. Maps each read site to its indirect call (JP (HL), JP (IY), or trampoline)
 *   3. Identifies the dispatch chain: who calls fn1 (draw), fn2 (width), fn3 (height)
 *   4. Traces one level of callers for each dispatch site
 *   5. Boots to home screen and verifies the live dispatch by calling fn2/fn3
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Constants ──────────────────────────────────────────────────────────

const TABLE_BASE = 0x0525D4;
const TABLE_STRIDE = 12;
const SELECTOR_FUNC = 0x055316;
const DESCRIPTOR_PTR_RAM = 0xD005E9;

// Second descriptor pointer (font translation table at 0x05320F)
const FONT_TABLE_PTR_RAM = 0xD005F0;
const FONT_TABLE_BASE = 0x05320F;

const DISPATCH_TRAMPOLINE = 0x00015C;
const JP_IY_TRAMPOLINE = 0x002288;

// Config table entries (from session 329)
const ENTRY_0 = {
  selector: 0,
  draw: 0x054FC6,
  width: 0x055167,
  height: 0x05518C,
  label: 'variable-width small-font',
};
const ENTRY_1 = {
  selector: 1,
  draw: 0x054E21,
  width: 0x054FBC,
  height: 0x054FC1,
  label: 'fixed-width 12x15 font',
};

// Boot constants
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

// Known dispatch sites that read D005E9 and do indirect calls
const DISPATCH_SITES = [
  {
    addr: 0x05412B,
    role: 'draw hook dispatch',
    slot: '+3 (fn1 = draw)',
    mechanism: 'LD IY,(D005E9) -> LD BC,(IY+3) -> store -> LD IY,(IX-3) -> CALL 0x00015C -> JP (IY)',
    entryPoint: 0x05411A,
    entryLabel: 'PutC_draw_inner',
  },
  {
    addr: 0x054DE5,
    role: 'width/advance hook dispatch',
    slot: '+6 (fn2 = width)',
    mechanism: 'LD IY,(D005E9) -> LD BC,(IY+6) -> store -> LD IY,(IX-3) -> CALL 0x00015C -> JP (IY)',
    entryPoint: 0x054DD4,
    entryLabel: 'GetStringWidth',
  },
  {
    addr: 0x054DC9,
    role: 'height/line-advance hook dispatch',
    slot: '+9 (fn3 = height)',
    mechanism: 'LD IY,(D005E9) -> LD HL,(IY+9) -> POP IY -> JP (HL)',
    entryPoint: 0x054DC3,
    entryLabel: 'GetFontHeight',
  },
  {
    addr: 0x05530B,
    role: 'selector/id getter',
    slot: '+0 (selector)',
    mechanism: 'LD IY,(D005E9) -> LD HL,(IY+0) -> POP IY -> RET',
    entryPoint: 0x055305,
    entryLabel: 'GetConfigId',
  },
];

// Known callers of higher-level wrappers
const WRAPPER_CALLERS = {
  // 0x0540D0 = PutC with flag=1 (draw+advance)
  0x0540D0: {
    label: 'PutC_draw_advance',
    wraps: 0x05411A,
    callerSites: [],
  },
  // 0x0540F5 = PutC with flag=0 (draw only)
  0x0540F5: {
    label: 'PutC_draw_only',
    wraps: 0x05411A,
    callerSites: [],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), (b) => hexByte(b)).join(' ');
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

// ── CALL/JP opcode map for scanning ───────────────────────────────────

const CALL_OR_JP_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'], [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'], [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'], [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],  [0xFC, 'CALL M'],
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],   [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],   [0xDA, 'JP C'],
  [0xE2, 'JP PO'],   [0xEA, 'JP PE'],
  [0xF2, 'JP P'],    [0xFA, 'JP M'],
]);

// ── ROM scanning ──────────────────────────────────────────────────────

function findAllReadsOf24(targetAddr) {
  // Search for LD IY, (targetAddr) = FD 2A lo mid hi
  // and LD HL, (targetAddr) = 2A lo mid hi
  // and LD BC, (targetAddr) = ED 4B lo mid hi
  // and LD DE, (targetAddr) = ED 5B lo mid hi
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const hits = [];

  for (let pc = 0; pc < rom.length - 5; pc++) {
    let matched = false;
    let regName = '';

    // LD IY, (addr) = FD 2A lo mid hi
    if (rom[pc] === 0xFD && rom[pc + 1] === 0x2A &&
        rom[pc + 2] === lo && rom[pc + 3] === mid && rom[pc + 4] === hi) {
      matched = true;
      regName = 'IY';
    }
    // LD HL, (addr) = 2A lo mid hi
    else if (rom[pc] === 0x2A &&
             rom[pc + 1] === lo && rom[pc + 2] === mid && rom[pc + 3] === hi) {
      matched = true;
      regName = 'HL';
    }
    // LD BC, (addr) = ED 4B lo mid hi
    else if (rom[pc] === 0xED && rom[pc + 1] === 0x4B &&
             rom[pc + 2] === lo && rom[pc + 3] === mid && rom[pc + 4] === hi) {
      matched = true;
      regName = 'BC';
    }
    // LD DE, (addr) = ED 5B lo mid hi
    else if (rom[pc] === 0xED && rom[pc + 1] === 0x5B &&
             rom[pc + 2] === lo && rom[pc + 3] === mid && rom[pc + 4] === hi) {
      matched = true;
      regName = 'DE';
    }

    if (matched) {
      hits.push({ pc, register: regName, bytes: bytesAt(pc, 5) });
    }
  }

  return hits;
}

function findAllWritesOf24(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const hits = [];

  for (let pc = 0; pc < rom.length - 5; pc++) {
    let matched = false;
    let regName = '';

    // LD (addr), HL = 22 lo mid hi
    if (rom[pc] === 0x22 &&
        rom[pc + 1] === lo && rom[pc + 2] === mid && rom[pc + 3] === hi) {
      matched = true;
      regName = 'HL';
    }
    // LD (addr), DE = ED 53 lo mid hi
    else if (rom[pc] === 0xED && rom[pc + 1] === 0x53 &&
             rom[pc + 2] === lo && rom[pc + 3] === mid && rom[pc + 4] === hi) {
      matched = true;
      regName = 'DE';
    }
    // LD (addr), BC = ED 43 lo mid hi
    else if (rom[pc] === 0xED && rom[pc + 1] === 0x43 &&
             rom[pc + 2] === lo && rom[pc + 3] === mid && rom[pc + 4] === hi) {
      matched = true;
      regName = 'BC';
    }

    if (matched) {
      hits.push({ pc, register: regName, bytes: bytesAt(pc, 5) });
    }
  }

  return hits;
}

function findAllReadsOf8(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const hits = [];

  for (let pc = 0; pc < rom.length - 4; pc++) {
    // LD A, (addr) = 3A lo mid hi
    if (rom[pc] === 0x3A &&
        rom[pc + 1] === lo && rom[pc + 2] === mid && rom[pc + 3] === hi) {
      hits.push({ pc, register: 'A', bytes: bytesAt(pc, 4) });
    }
  }

  return hits;
}

function findCallersOf(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const hits = [];

  for (let pc = 0; pc < rom.length - 4; pc++) {
    const op = rom[pc];
    if (!CALL_OR_JP_OPS.has(op)) {
      continue;
    }
    if (rom[pc + 1] !== lo || rom[pc + 2] !== mid || rom[pc + 3] !== hi) {
      continue;
    }
    hits.push({ pc, type: CALL_OR_JP_OPS.get(op) });
  }

  return hits;
}

// ── Section 1: All reads of D005E9 ───────────────────────────────────

function printDescriptorReads() {
  console.log('=== Phase 330: Vtable Dispatch Trace ===\n');
  console.log('1) All ROM reads of D005E9 (config descriptor pointer)\n');

  const rawReads = findAllReadsOf24(DESCRIPTOR_PTR_RAM);
  // Filter phantom hits: LD HL at pc+1 of a LD IY (FD 2A) is the same instruction
  const reads = rawReads.filter((hit, i) => {
    if (hit.register === 'HL' && i > 0) {
      const prev = rawReads[i - 1];
      if (prev.register === 'IY' && prev.pc === hit.pc - 1) {
        return false; // phantom: 2A at offset+1 inside FD 2A sequence
      }
    }
    return true;
  });
  console.log(`   Found ${reads.length} true read site(s) (${rawReads.length} raw, ${rawReads.length - reads.length} phantom filtered):\n`);

  for (const hit of reads) {
    // Decode a few instructions after the read to see what happens
    const inst = decodeSafe(hit.pc);
    const instLen = inst?.length ?? 5;
    let nextAddr = hit.pc + instLen;
    const following = [];

    for (let i = 0; i < 4; i++) {
      const next = decodeSafe(nextAddr);
      if (!next || !next.length) break;
      following.push({ pc: nextAddr, bytes: bytesAt(nextAddr, next.length), inst: next });
      nextAddr = nextPc(next);
    }

    console.log(`   ${hex(hit.pc)}: LD ${hit.register}, (${hex(DESCRIPTOR_PTR_RAM)})   [${hit.bytes}]`);

    for (const f of following) {
      const tag = f.inst?.tag ?? '?';
      let desc = tag;

      if (tag === 'ld-pair-indexed' || tag === 'ld-reg-ixd') {
        const disp = f.inst.displacement ?? 0;
        desc = `LD ${(f.inst.pair ?? f.inst.dest ?? '?').toUpperCase()}, (${(f.inst.indexRegister ?? '?').toUpperCase()}+${disp})`;
      } else if (tag === 'jp-indirect') {
        desc = `JP (${(f.inst.indirectRegister ?? 'HL').toUpperCase()})`;
      } else if (tag === 'ret') {
        desc = 'RET';
      } else if (tag === 'pop') {
        desc = `POP ${(f.inst.pair ?? '?').toUpperCase()}`;
      }

      console.log(`     ${hex(f.pc)}: ${f.bytes.padEnd(20)} ${desc}`);
    }

    console.log('');
  }
}

// ── Section 2: Dispatch site analysis ─────────────────────────────────

function printDispatchSites() {
  console.log('2) Dispatch sites — how each vtable slot is called\n');

  for (const site of DISPATCH_SITES) {
    console.log(`   ${hex(site.addr)}: ${site.role}`);
    console.log(`     slot:       ${site.slot}`);
    console.log(`     mechanism:  ${site.mechanism}`);
    console.log(`     entry:      ${hex(site.entryPoint)} (${site.entryLabel})`);
    console.log('');
  }
}

// ── Section 3: One level of callers per dispatch entry point ──────────

function printCallerChains() {
  console.log('3) Callers of each dispatch entry point\n');

  for (const site of DISPATCH_SITES) {
    const callers = findCallersOf(site.entryPoint);
    console.log(`   ${hex(site.entryPoint)} (${site.entryLabel}): ${callers.length} caller(s)`);

    for (const caller of callers) {
      console.log(`     ${caller.type} at ${hex(caller.pc)}`);
    }
    console.log('');
  }

  // Also trace callers of the two PutC wrapper functions
  console.log('   Higher-level wrappers:\n');

  for (const [addr, info] of Object.entries(WRAPPER_CALLERS)) {
    const wrapAddr = Number(addr);
    const callers = findCallersOf(wrapAddr);
    console.log(`   ${hex(wrapAddr)} (${info.label}) wraps ${hex(info.wraps)}: ${callers.length} caller(s)`);

    for (const caller of callers.slice(0, 8)) {
      console.log(`     ${caller.type} at ${hex(caller.pc)}`);
    }

    if (callers.length > 8) {
      console.log(`     ... and ${callers.length - 8} more`);
    }

    console.log('');
  }
}

// ── Section 4: D005F0 second descriptor pointer ──────────────────────

function printSecondDescriptor() {
  console.log('4) D005F0 — second descriptor pointer (font translation table)\n');

  const reads = findAllReadsOf24(FONT_TABLE_PTR_RAM);
  console.log(`   Found ${reads.length} read site(s) for D005F0:\n`);

  for (const hit of reads) {
    console.log(`   ${hex(hit.pc)}: LD ${hit.register}, (${hex(FONT_TABLE_PTR_RAM)})   [${hit.bytes}]`);
  }

  const writes = findAllWritesOf24(FONT_TABLE_PTR_RAM);
  console.log(`\n   Found ${writes.length} write site(s) for D005F0:\n`);

  for (const hit of writes) {
    console.log(`   ${hex(hit.pc)}: LD (${hex(FONT_TABLE_PTR_RAM)}), ${hit.register}   [${hit.bytes}]`);
  }

  console.log('');
}

// ── Section 5: D005EC auxiliary state ────────────────────────────────

function printAuxState() {
  console.log('5) D005EC — auxiliary render state byte\n');

  const reads8 = findAllReadsOf8(0xD005EC);
  const reads24 = findAllReadsOf24(0xD005EC);
  const writes = findAllWritesOf24(0xD005EC);

  console.log(`   8-bit reads (LD A,(D005EC)): ${reads8.length}`);
  for (const hit of reads8.slice(0, 6)) {
    console.log(`     ${hex(hit.pc)}: [${hit.bytes}]`);
  }
  if (reads8.length > 6) console.log(`     ... and ${reads8.length - 6} more`);

  console.log(`   24-bit reads (LD xx,(D005EC)): ${reads24.length}`);
  for (const hit of reads24) {
    console.log(`     ${hex(hit.pc)}: LD ${hit.register}, (D005EC)   [${hit.bytes}]`);
  }

  console.log('');
}

// ── Section 6: Live execution — boot and verify dispatch ─────────────

async function runLiveDispatchTest() {
  console.log('6) Live execution: boot and verify vtable dispatch\n');

  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  // The full OS boot hits missing blocks before it reaches the config selector.
  // Instead, manually set D005E9 to entry 0 and verify the hooks directly.

  // Manually seed D005E9 to entry 0 and verify the hooks
  const entry0Base = TABLE_BASE;
  const entry1Base = TABLE_BASE + TABLE_STRIDE;

  // Test both entries
  for (const [entryIdx, entryBase, entryInfo] of [
    [0, entry0Base, ENTRY_0],
    [1, entry1Base, ENTRY_1],
  ]) {
    console.log(`   --- Entry ${entryIdx}: ${entryInfo.label} ---`);

    // Write the descriptor pointer to D005E9
    mem[DESCRIPTOR_PTR_RAM]     = entryBase & 0xFF;
    mem[DESCRIPTOR_PTR_RAM + 1] = (entryBase >> 8) & 0xFF;
    mem[DESCRIPTOR_PTR_RAM + 2] = (entryBase >> 16) & 0xFF;

    const descPtr = read24(mem, DESCRIPTOR_PTR_RAM);
    console.log(`   D005E9 = ${hex(descPtr)} (entry ${entryIdx} base = ${hex(entryBase)})`);

    // Read the function pointers from the ROM entry (D005E9 points into ROM)
    const selector = read24(mem, descPtr);
    const drawHook = read24(mem, descPtr + 3);
    const widthHook = read24(mem, descPtr + 6);
    const heightHook = read24(mem, descPtr + 9);

    console.log(`     +0 selector: ${selector}`);
    console.log(`     +3 draw:     ${hex(drawHook)}  expected ${hex(entryInfo.draw)}  ${drawHook === entryInfo.draw ? 'PASS' : 'FAIL'}`);
    console.log(`     +6 width:    ${hex(widthHook)}  expected ${hex(entryInfo.width)}  ${widthHook === entryInfo.width ? 'PASS' : 'FAIL'}`);
    console.log(`     +9 height:   ${hex(heightHook)} expected ${hex(entryInfo.height)} ${heightHook === entryInfo.height ? 'PASS' : 'FAIL'}`);

    // Call the height hook directly (these are LD HL, imm ; RET)
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_RESET_TOP - 3;
    mem.fill(0xFF, cpu.sp, cpu.sp + 3);

    const heightResult = executor.runFrom(heightHook, 'adl', {
      maxSteps: 20,
      maxLoopIterations: 5,
    });
    const heightHL = cpu.hl;
    console.log(`     height hook ${hex(heightHook)} -> HL = ${heightHL} (steps=${heightResult.steps}, term=${heightResult.termination})`);

    // Call the width hook directly
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_RESET_TOP - 3;
    mem.fill(0xFF, cpu.sp, cpu.sp + 3);

    const widthResult = executor.runFrom(widthHook, 'adl', {
      maxSteps: 50,
      maxLoopIterations: 10,
    });
    const widthHL = cpu.hl;
    console.log(`     width hook  ${hex(widthHook)} -> HL = ${widthHL} (steps=${widthResult.steps}, term=${widthResult.termination})`);

    console.log('');
  }

  // Also read D005F0 (font translation table pointer)
  const fontTablePtr = read24(mem, FONT_TABLE_PTR_RAM);
  console.log(`\n   D005F0 font table pointer = ${hex(fontTablePtr)}`);
  console.log(`   Expected base = ${hex(FONT_TABLE_BASE)}`);
  console.log(`   Offset from base = ${fontTablePtr - FONT_TABLE_BASE}`);

  // Read D005EC (auxiliary render state)
  const auxState = mem[0xD005EC];
  console.log(`\n   D005EC auxiliary state = ${hexByte(auxState)}`);
  console.log(`   D005ED = ${hex(read24(mem, 0xD005ED))}`);
  console.log(`   D005F4 = ${hexByte(mem[0xD005F4])}`);

  console.log('');
}

// ── Section 7: Dispatch architecture summary ─────────────────────────

function printSummary() {
  console.log('7) Dispatch Architecture Summary\n');
  console.log('   The config vtable at 0x0525D4 has two valid 12-byte entries.');
  console.log('   0x055316 (the selector) computes TABLE_BASE + index * 12 and');
  console.log('   stores the resulting ROM pointer at D005E9.\n');

  console.log('   Four consumer functions read D005E9 via LD IY, (D005E9):');
  console.log('');
  console.log('   ┌─────────────────────────────────────────────────────────────────┐');
  console.log('   │ Consumer     │ Slot  │ Dispatch Mechanism           │ Role       │');
  console.log('   ├─────────────────────────────────────────────────────────────────┤');
  console.log('   │ 0x05530B     │ +0    │ LD HL,(IY+0) -> RET         │ GetId      │');
  console.log('   │ 0x05412B     │ +3    │ LD BC,(IY+3) -> trampoline  │ DrawChar   │');
  console.log('   │ 0x054DE5     │ +6    │ LD BC,(IY+6) -> trampoline  │ GetWidth   │');
  console.log('   │ 0x054DC9     │ +9    │ LD HL,(IY+9) -> JP (HL)     │ GetHeight  │');
  console.log('   └─────────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('   The draw and width dispatches use the "trampoline" pattern:');
  console.log('     1. LD IY, (D005E9)         — load descriptor pointer');
  console.log('     2. LD BC, (IY+N)           — extract function pointer from slot');
  console.log('     3. LD (IX-3), BC            — stash on local stack frame');
  console.log('     4. [push args onto stack]');
  console.log('     5. LD IY, (IX-3)            — reload fn ptr into IY (DD 31 FD)');
  console.log('     6. CALL 0x00015C            — trampoline');
  console.log('     7. JP 0x002288              — which is JP (IY)');
  console.log('     → IY now holds the function pointer, so JP (IY) calls the hook\n');

  console.log('   The height dispatch is simpler: LD HL,(IY+9) -> JP (HL).\n');

  console.log('   Call tree:');
  console.log('     ROM callers');
  console.log('       └─ 0x0540D0 (PutC_draw_advance) / 0x0540F5 (PutC_draw_only)');
  console.log('            └─ 0x05411A (PutC_draw_inner)');
  console.log('                 └─ 0x055191 (lazy-init check)');
  console.log('                 └─ 0x05412B (LD IY,(D005E9) -> dispatch via +3)');
  console.log('');
  console.log('     ROM callers (0x023D9B, 0x023DD6, 0x04CA36, 0x09ED77, ...)');
  console.log('       └─ 0x054DD4 (GetStringWidth)');
  console.log('            └─ 0x055191 (lazy-init check)');
  console.log('            └─ 0x054DE5 (LD IY,(D005E9) -> dispatch via +6)');
  console.log('');
  console.log('     ROM callers');
  console.log('       └─ 0x054DC3 (GetFontHeight)');
  console.log('            └─ 0x055191 (lazy-init check)');
  console.log('            └─ 0x054DC9 (LD IY,(D005E9) -> LD HL,(IY+9) -> JP (HL))');
  console.log('');

  console.log('   D005F0 is a SEPARATE descriptor pointer for the font translation');
  console.log('   table at 0x05320F (12-byte entries, same stride). Read at 0x053573');
  console.log('   by the text layout engine. It is NOT part of the config vtable at');
  console.log('   0x0525D4, but lives in the same D005xx state block.\n');

  console.log('   D005EC is an auxiliary mode byte (0 = small font default). It is');
  console.log('   written by the init path at 0x0551B3 and by the font-switch code');
  console.log('   at 0x055566. Multiple ROM sites read it to branch on font mode.\n');
}

// ── Main ──────────────────────────────────────────────────────────────

console.log(`ROM size: ${hex(rom.length, 8)} bytes\n`);

printDescriptorReads();
printDispatchSites();
printCallerChains();
printSecondDescriptor();
printAuxState();
await runLiveDispatchTest();
printSummary();
