#!/usr/bin/env node

/**
 * Phase 334 — Map all callers of the hook iterator at 0x023D14
 *
 * Scans the raw ROM for CALL/JP byte patterns targeting 0x023D14,
 * 0x023D00 (wrapper), and 0x023D4E (reloc wrapper). Also searches
 * PRELIFTED_BLOCKS for call/jp instructions to these targets.
 * Boots to home screen and dumps the hook table.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const IY_BASE = 0xD00080;

const HOOK_ITERATOR_ENTRY = 0x023D14;
const HOOK_WRAPPER_ENTRY = 0x023D00;
const HOOK_RELOC_WRAPPER_ENTRY = 0x023D4E;

const HOOK_TABLE_BASE = 0xD025D5;
const HOOK_SLOT_STRIDE = 3;
const HOOK_SLOT_COUNT = 0x18;

const HOOK_SLOTS = [
  { index: 0, addr: 0xD025D5, name: 'cursorHookPtr' },
  { index: 1, addr: 0xD025D8, name: 'libraryHookPtr' },
  { index: 2, addr: 0xD025DB, name: 'rawKeyHookPtr' },
  { index: 3, addr: 0xD025DE, name: 'getKeyHookPtr' },
  { index: 4, addr: 0xD025E1, name: 'homescreenHookPtr' },
  { index: 5, addr: 0xD025E4, name: 'windowHookPtr' },
  { index: 6, addr: 0xD025E7, name: 'graphHookPtr' },
  { index: 7, addr: 0xD025EA, name: 'yEqualsHookPtr' },
  { index: 8, addr: 0xD025ED, name: 'fontHookPtr' },
  { index: 9, addr: 0xD025F0, name: 'regraphHookPtr' },
  { index: 10, addr: 0xD025F3, name: 'graphicsHookPtr' },
  { index: 11, addr: 0xD025F6, name: 'traceHookPtr' },
  { index: 12, addr: 0xD025F9, name: 'parserHookPtr' },
  { index: 13, addr: 0xD025FC, name: 'appChangeHookPtr' },
  { index: 14, addr: 0xD025FF, name: 'catalog1HookPtr' },
  { index: 15, addr: 0xD02602, name: 'helpHookPtr' },
  { index: 16, addr: 0xD02605, name: 'cxRedispHookPtr' },
  { index: 17, addr: 0xD02608, name: 'menuHookPtr' },
  { index: 18, addr: 0xD0260B, name: 'catalog2HookPtr' },
  { index: 19, addr: 0xD0260E, name: 'tokenHookPtr' },
  { index: 20, addr: 0xD02611, name: 'localizeHookPtr' },
  { index: 21, addr: 0xD02614, name: 'silentLinkHookPtr' },
  { index: 22, addr: 0xD02617, name: 'unknownHookPtr_D02617' },
  { index: 23, addr: 0xD0261A, name: 'USBActivityHookPtr' },
];

const CALL_TAGS = new Set(['call', 'call-conditional', 'jp', 'jp-conditional']);

// ── Helpers ──

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(buffer, addr) {
  const a = addr >>> 0;
  return ((buffer[a] ?? 0) | ((buffer[a + 1] ?? 0) << 8) | ((buffer[a + 2] ?? 0) << 16)) >>> 0;
}

function classifyPointer(value) {
  if (value === 0) return 'NULL';
  if (value < 0x400000) return 'ROM';
  if ((value & 0xF00000) === 0xD00000) return 'RAM-D';
  if ((value & 0xF00000) === 0xE00000) return 'MMIO-E';
  if ((value & 0xF00000) === 0xF00000) return 'MMIO/VRAM-F';
  return 'OTHER';
}

function hexdumpRom(start, length) {
  const lines = [];
  for (let addr = start; addr < start + length; addr += 16) {
    const end = Math.min(addr + 16, start + length);
    const bytes = Array.from(romBytes.slice(addr, end), (b) => b.toString(16).padStart(2, '0')).join(' ');
    lines.push(`  ${hex(addr)}: ${bytes}`);
  }
  return lines;
}

function hexdumpMem(mem, start, length) {
  const lines = [];
  for (let addr = start; addr < start + length; addr += 16) {
    const end = Math.min(addr + 16, start + length);
    const bytes = [];
    for (let i = addr; i < end; i++) {
      bytes.push(mem[i].toString(16).padStart(2, '0'));
    }
    lines.push(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }
  return lines;
}

function disasmContext(addr, beforeBytes, afterBytes) {
  // Just dump raw bytes around the call site for manual analysis
  const before = Math.max(0, addr - beforeBytes);
  const after = Math.min(romBytes.length, addr + afterBytes);
  return {
    beforeHex: hexdumpRom(before, addr - before),
    afterHex: hexdumpRom(addr, Math.min(after - addr, afterBytes)),
  };
}

// ── Raw ROM byte-pattern scanner ──

function scanRomForPattern(pattern, label) {
  const hits = [];
  const limit = romBytes.length - pattern.length;
  for (let i = 0; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (romBytes[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      hits.push({ addr: i, label });
    }
  }
  return hits;
}

function scanAllPatterns(target, targetName) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;

  const results = [];

  // CALL nn (ADL) = 0xCD lo mid hi
  results.push(...scanRomForPattern([0xCD, lo, mid, hi], `CALL ${targetName}`));

  // JP nn (ADL) = 0xC3 lo mid hi
  results.push(...scanRomForPattern([0xC3, lo, mid, hi], `JP ${targetName}`));

  // CALL.IS nn = 0x49 0xCD lo mid (only 2-byte addr in Z80 mode)
  // But 0x023D14 > 0xFFFF, so CALL.IS can only reach 16-bit part -- skip unless target fits
  if (target <= 0xFFFF) {
    results.push(...scanRomForPattern([0x49, 0xCD, lo, mid], `CALL.IS ${targetName}`));
  }

  // JP.LIL nn = 0x5B 0xC3 lo mid hi
  results.push(...scanRomForPattern([0x5B, 0xC3, lo, mid, hi], `JP.LIL ${targetName}`));

  // CALL.IL nn = 0x5B 0xCD lo mid hi (Z80 mode calling ADL address)
  results.push(...scanRomForPattern([0x5B, 0xCD, lo, mid, hi], `CALL.IL ${targetName}`));

  // CALL cc,nn variants (conditional calls): C4, CC, D4, DC, E4, EC, F4, FC
  for (const opcode of [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]) {
    results.push(...scanRomForPattern([opcode, lo, mid, hi], `CALL cc,${targetName}`));
  }

  // JP cc,nn variants: C2, CA, D2, DA, E2, EA, F2, FA
  for (const opcode of [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]) {
    results.push(...scanRomForPattern([opcode, lo, mid, hi], `JP cc,${targetName}`));
  }

  results.sort((a, b) => a.addr - b.addr);
  return results;
}

// ── PRELIFTED_BLOCKS graph search ──

function findCallSitesInBlocks(target) {
  const rows = [];
  for (const [id, block] of Object.entries(BLOCKS)) {
    for (const inst of block.instructions ?? []) {
      if (!CALL_TAGS.has(inst.tag) || inst.target !== target) continue;
      rows.push({ blockId: id, pc: inst.pc, dasm: inst.dasm });
    }
  }
  rows.sort((a, b) => a.pc - b.pc);
  return rows;
}

// ── BCALL vector table scan ──

function scanBcallTable() {
  // BCALL vectors live at the start of ROM. Each is a 4-byte entry:
  // JP addr (0xC3 + 3 bytes). The table starts at offset 0x000000.
  // Check first 0x4000 bytes for JP instructions pointing to our targets.
  const targets = new Set([HOOK_ITERATOR_ENTRY, HOOK_WRAPPER_ENTRY, HOOK_RELOC_WRAPPER_ENTRY]);
  const hits = [];

  for (let addr = 0; addr < 0x4000; addr += 4) {
    if (romBytes[addr] === 0xC3) {
      const dest = read24(romBytes, addr + 1);
      if (targets.has(dest)) {
        hits.push({ vectorAddr: addr, dest, bcallId: addr / 4 });
      }
    }
  }

  // Also scan RST vectors (0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38)
  for (const rst of [0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38]) {
    if (romBytes[rst] === 0xC3) {
      const dest = read24(romBytes, rst + 1);
      if (targets.has(dest)) {
        hits.push({ vectorAddr: rst, dest, note: `RST ${hex(rst, 2)}` });
      }
    }
  }

  return hits;
}

// ── Boot environment ──

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function bootToHomeScreen(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.iy = IY_BASE;
    cpu.f = 0x40;
    cpu.ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  }
}

// ── Main ──

async function main() {
  console.log('=== Phase 334: Hook Iterator Caller Map ===');
  console.log(`ROM: ${ROM_PATH} (${romBytes.length} bytes)`);
  console.log();

  // ── 1. Raw byte-pattern scan for all three targets ──

  const targets = [
    { addr: HOOK_ITERATOR_ENTRY, name: '0x023D14 (iterator)' },
    { addr: HOOK_WRAPPER_ENTRY, name: '0x023D00 (wrapper)' },
    { addr: HOOK_RELOC_WRAPPER_ENTRY, name: '0x023D4E (reloc-wrapper)' },
  ];

  console.log('=== 1. Raw ROM byte-pattern scan ===');
  for (const target of targets) {
    const hits = scanAllPatterns(target.addr, target.name);
    console.log(`\nTarget ${target.name}: ${hits.length} hit(s)`);
    for (const hit of hits) {
      console.log(`  ${hex(hit.addr)}: ${hit.label}`);
    }
  }
  console.log();

  // ── 2. Context around each caller ──

  console.log('=== 2. Context around each caller (32 bytes before/after) ===');
  for (const target of targets) {
    const hits = scanAllPatterns(target.addr, target.name);
    if (hits.length === 0) continue;

    console.log(`\nCallers of ${target.name}:`);
    for (const hit of hits) {
      console.log(`\n  --- ${hex(hit.addr)}: ${hit.label} ---`);

      // Determine instruction length for the call opcode
      let instrLen = 4; // CALL/JP nn = 1 opcode + 3 addr
      if (hit.label.includes('.LIL') || hit.label.includes('.IL')) {
        instrLen = 5; // prefix + opcode + 3 addr
      }

      console.log('  Before (32 bytes leading up to the call):');
      const ctx = disasmContext(hit.addr, 32, instrLen + 32);
      for (const line of ctx.beforeHex) console.log(line);

      console.log('  Call + after (32 bytes following):');
      for (const line of ctx.afterHex) console.log(line);

      // Look for LD A,n pattern in the 16 bytes before the call
      // LD A,n = 0x3E nn
      const searchStart = Math.max(0, hit.addr - 16);
      const searchEnd = hit.addr;
      const ldAMatches = [];
      for (let i = searchStart; i < searchEnd; i++) {
        if (romBytes[i] === 0x3E) {
          ldAMatches.push({ addr: i, value: romBytes[i + 1] });
        }
      }
      if (ldAMatches.length > 0) {
        console.log('  LD A,n found before call:');
        for (const m of ldAMatches) {
          console.log(`    ${hex(m.addr)}: LD A,${hex(m.value, 2)} (${m.value})`);
        }
      }
    }
  }
  console.log();

  // ── 3. PRELIFTED_BLOCKS graph search ──

  console.log('=== 3. PRELIFTED_BLOCKS call-graph search ===');
  for (const target of targets) {
    const callers = findCallSitesInBlocks(target.addr);
    console.log(`\n${target.name}: ${callers.length} call site(s) in PRELIFTED_BLOCKS`);
    for (const row of callers) {
      console.log(`  ${hex(row.pc)} ${row.dasm}  (block ${row.blockId})`);
    }
  }
  console.log();

  // ── 4. BCALL vector table scan ──

  console.log('=== 4. BCALL vector table scan ===');
  const bcallHits = scanBcallTable();
  if (bcallHits.length === 0) {
    console.log('  No BCALL vectors point directly to hook iterator/wrapper/reloc-wrapper.');
  } else {
    for (const hit of bcallHits) {
      console.log(`  Vector ${hex(hit.vectorAddr)} -> ${hex(hit.dest)}` +
        (hit.bcallId !== undefined ? ` (BCALL ${hex(hit.bcallId, 4)})` : '') +
        (hit.note ? ` ${hit.note}` : ''));
    }
  }

  // Also look for indirect: any BCALL vector that JPs to an address near our targets
  console.log('\n  Checking for nearby BCALL vectors (0x023B00..0x023E00):');
  for (let addr = 0; addr < 0x4000; addr += 4) {
    if (romBytes[addr] === 0xC3) {
      const dest = read24(romBytes, addr + 1);
      if (dest >= 0x023B00 && dest < 0x023E00) {
        console.log(`  Vector ${hex(addr)} -> ${hex(dest)} (BCALL ${hex(addr / 4, 4)})`);
      }
    }
  }
  console.log();

  // ── 5. Boot and dump hook table ──

  console.log('=== 5. Post-boot hook table state ===');
  const env = createEnv();
  bootToHomeScreen(env.executor, env.cpu, env.mem);

  console.log('\nHook table dump (0xD025D5, 128 bytes):');
  for (const line of hexdumpMem(env.mem, HOOK_TABLE_BASE, 128)) {
    console.log(line);
  }

  console.log('\nPer-slot values:');
  for (const slot of HOOK_SLOTS) {
    const value = read24(env.mem, slot.addr);
    const cls = classifyPointer(value);
    console.log(`  [${String(slot.index).padStart(2, '0')}] ${slot.name.padEnd(24)} ${hex(slot.addr)} = ${hex(value)} ${cls}`);
  }
  console.log();

  // ── 6. Categorize callers by hook type ──

  console.log('=== 6. Caller categorization summary ===');
  const allRawHits = [];
  for (const target of targets) {
    const hits = scanAllPatterns(target.addr, target.name);
    allRawHits.push(...hits.map((h) => ({ ...h, target: target.name })));
  }

  // Group by the LD A,n value found before each call
  const byHookType = new Map();
  for (const hit of allRawHits) {
    const searchStart = Math.max(0, hit.addr - 16);
    let hookType = null;
    for (let i = hit.addr - 1; i >= searchStart; i--) {
      if (romBytes[i] === 0x3E && i + 1 < hit.addr) {
        hookType = romBytes[i + 1];
        break;
      }
    }
    const key = hookType !== null ? `A=${hex(hookType, 2)}` : 'no-LD-A-found';
    if (!byHookType.has(key)) byHookType.set(key, []);
    byHookType.get(key).push(hit);
  }

  console.log(`Total raw-byte call/jp sites: ${allRawHits.length}`);
  for (const [key, hits] of [...byHookType.entries()].sort()) {
    console.log(`\n  ${key} (${hits.length} site(s)):`);
    for (const hit of hits) {
      console.log(`    ${hex(hit.addr)}: ${hit.label} -> ${hit.target}`);
    }
  }
  console.log();

  console.log('=== Done ===');
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
