#!/usr/bin/env node

/**
 * probe-phase242-d010f8-investigation.mjs
 *
 * Comprehensive investigation of RAM address D010F8, newly discovered in
 * session 241. The BIT 4 guard at 0x051B84 uses D010F8 as a secondary
 * bail condition: when BIT 4,(D003E0) is SET and D010F8==0x01, the
 * function at 0x051B7C bails to 0x051BD7.
 *
 * This probe:
 *   1. Static ROM scan for all references to D010F8 (byte pattern F8 10 D0)
 *   2. Boot value: full warm boot, then read mem[0xD010F8]
 *   3. Event loop value: 10000 additional steps, read mem[0xD010F8]
 *   4. Post key press: set D0058E=0x8F, 5000 steps, read mem[0xD010F8]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;

// Boot chain
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const MEM_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;

// Home screen stages
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

// Event loop
const EVENT_LOOP_ENTRY = 0x02FD99;
const EVENT_LOOP_STEPS = 10000;
const POST_KEY_STEPS = 5000;

// Target address
const TARGET_ADDR = 0xD010F8;
const TARGET_LO  = TARGET_ADDR & 0xFF;          // 0xF8
const TARGET_MID = (TARGET_ADDR >>> 8) & 0xFF;  // 0x10
const TARGET_HI  = (TARGET_ADDR >>> 16) & 0xFF; // 0xD0

// Register seeds
const MBASE = 0xD0;
const IX_HOME = 0xD1A860;
const IY_HOME = 0xD00080;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function regionLabel(addr) {
  const page = (addr >>> 16) & 0xFF;
  if (page <= 0x03) return 'OS-low (00-03xxxx)';
  if (page === 0x04) return 'OS-core (04xxxx)';
  if (page === 0x05) return 'OS-mid (05xxxx)';
  if (page === 0x06) return 'Editor (06xxxx)';
  if (page === 0x07) return 'OS-07 (07xxxx)';
  if (page === 0x08) return 'UI/menu (08xxxx)';
  if (page === 0x09) return 'STAT (09xxxx)';
  if (page >= 0x0A) return `Apps (${hex(page, 2)}xxxx)`;
  return `Unknown (${hex(page, 2)}xxxx)`;
}

function formatBytes(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    const addr = start + i;
    if (addr >= 0 && addr < buf.length) {
      parts.push(buf[addr].toString(16).padStart(2, '0'));
    } else {
      parts.push('??');
    }
  }
  return parts.join(' ');
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase242-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

// ---------------------------------------------------------------------------
// Opcode classification tables (from phase 239)
// ---------------------------------------------------------------------------

const SET_HL_OPCODES = [0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE];
const RES_HL_OPCODES = [0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE];
const BIT_HL_OPCODES = [0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x76, 0x7E];

function bitNumber(opcode, base) {
  return (opcode - base) >>> 3;
}

// ---------------------------------------------------------------------------
// PART 1: Static ROM scan for F8 10 D0
// ---------------------------------------------------------------------------

function scanRomForD010F8(rom) {
  const ROM_SIZE = rom.length;

  console.log('========================================================================');
  console.log('PART 1: Static ROM Scan for D010F8 references');
  console.log('========================================================================');
  console.log('');
  console.log(`Scanning ${(ROM_SIZE / 1024 / 1024).toFixed(1)} MB ROM for byte pattern F8 10 D0 ...`);
  console.log('');

  const allHits = [];

  for (let i = 0; i < ROM_SIZE - 2; i++) {
    if (rom[i] === TARGET_LO && rom[i + 1] === TARGET_MID && rom[i + 2] === TARGET_HI) {
      allHits.push(i);
    }
  }

  console.log(`Found ${allHits.length} raw occurrences of F8 10 D0.`);
  console.log('');

  // Classify each hit
  const classified = [];

  for (const matchOffset of allHits) {
    let type = 'UNKNOWN';
    let detail = '';
    let instrStart = matchOffset;

    // --- Pattern: LD (nn),A  =>  32 F8 10 D0 ---
    if (matchOffset >= 1 && rom[matchOffset - 1] === 0x32) {
      type = 'WRITE';
      detail = 'LD (D010F8),A';
      instrStart = matchOffset - 1;
    }
    // --- Pattern: LD A,(nn)  =>  3A F8 10 D0 ---
    else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x3A) {
      type = 'READ';
      detail = 'LD A,(D010F8)';
      instrStart = matchOffset - 1;
    }
    // --- ED prefix patterns ---
    else if (matchOffset >= 2 && rom[matchOffset - 2] === 0xED) {
      const edOp = rom[matchOffset - 1];
      instrStart = matchOffset - 2;
      if (edOp === 0x32) { type = 'WRITE'; detail = 'ED LD (D010F8),A  [extended]'; }
      else if (edOp === 0x3A) { type = 'READ'; detail = 'ED LD A,(D010F8)  [extended]'; }
      else if (edOp === 0x43) { type = 'WRITE'; detail = 'LD (D010F8),BC  [extended]'; }
      else if (edOp === 0x4B) { type = 'READ'; detail = 'LD BC,(D010F8)  [extended]'; }
      else if (edOp === 0x53) { type = 'WRITE'; detail = 'LD (D010F8),DE  [extended]'; }
      else if (edOp === 0x5B) { type = 'READ'; detail = 'LD DE,(D010F8)  [extended]'; }
      else if (edOp === 0x73) { type = 'WRITE'; detail = 'LD (D010F8),SP  [extended]'; }
      else if (edOp === 0x7B) { type = 'READ'; detail = 'LD SP,(D010F8)  [extended]'; }
      else { type = 'UNKNOWN'; instrStart = matchOffset; }
    }
    // --- Pattern: LD HL,nn  =>  21 F8 10 D0 ---
    else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x21) {
      type = 'LD-HL';
      detail = 'LD HL,D010F8';
      instrStart = matchOffset - 1;

      // Look ahead up to 20 bytes for store/SET/RES/BIT instructions
      const lookAhead = Math.min(20, ROM_SIZE - (matchOffset + 3));
      const followOps = [];

      for (let j = 0; j < lookAhead; j++) {
        const off = matchOffset + 3 + j;
        const b = rom[off];

        if (b === 0x77) {
          followOps.push({ offset: off, op: 'LD (HL),A', type: 'WRITE-INDIRECT' });
        }
        if (b === 0x36 && off + 1 < ROM_SIZE) {
          followOps.push({ offset: off, op: `LD (HL),${hexByte(rom[off + 1])}`, type: 'WRITE-INDIRECT' });
        }
        if (b === 0xCB && off + 1 < ROM_SIZE) {
          const cb2 = rom[off + 1];
          if (SET_HL_OPCODES.includes(cb2)) {
            followOps.push({ offset: off, op: `SET ${bitNumber(cb2, 0xC6)},(HL)`, type: 'SET' });
          }
          if (RES_HL_OPCODES.includes(cb2)) {
            followOps.push({ offset: off, op: `RES ${bitNumber(cb2, 0x86)},(HL)`, type: 'RES' });
          }
          if (BIT_HL_OPCODES.includes(cb2)) {
            followOps.push({ offset: off, op: `BIT ${bitNumber(cb2, 0x46)},(HL)`, type: 'BIT-TEST' });
          }
        }
        // LD (HL),r for r != A: 70-75
        if (b >= 0x70 && b <= 0x75) {
          const regs = ['B', 'C', 'D', 'E', 'H', 'L'];
          followOps.push({ offset: off, op: `LD (HL),${regs[b - 0x70]}`, type: 'WRITE-INDIRECT' });
        }
        // INC (HL) = 0x34, DEC (HL) = 0x35
        if (b === 0x34) {
          followOps.push({ offset: off, op: 'INC (HL)', type: 'WRITE-INDIRECT' });
        }
        if (b === 0x35) {
          followOps.push({ offset: off, op: 'DEC (HL)', type: 'WRITE-INDIRECT' });
        }
        // Stop if we hit a jump/call/ret that would change HL semantics
        if (b === 0xC3 || b === 0xCD || b === 0xC9 || b === 0xC0 || b === 0xC8 ||
            b === 0xD0 || b === 0xD8 || b === 0xE0 || b === 0xE8 || b === 0xF0 || b === 0xF8 ||
            b === 0x18 || b === 0x20 || b === 0x28 || b === 0x30 || b === 0x38) {
          break;
        }
        // Also stop if HL is reloaded
        if (b === 0x21) break;
      }

      if (followOps.length > 0) {
        const writeOps = followOps.filter(o => o.type !== 'BIT-TEST');
        if (writeOps.length > 0) {
          type = 'WRITE-VIA-HL';
        } else {
          type = 'READ-VIA-HL';
        }
        detail += ' -> ' + followOps.map(o => `${o.op} @${hex(o.offset)}`).join(', ');
      }
    }
    // --- Pattern: LD (nn),HL  =>  22 F8 10 D0 ---
    else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x22) {
      type = 'WRITE';
      detail = 'LD (D010F8),HL  [16/24-bit write]';
      instrStart = matchOffset - 1;
    }
    // --- Pattern: LD HL,(nn)  =>  2A F8 10 D0 ---
    else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x2A) {
      type = 'READ';
      detail = 'LD HL,(D010F8)  [16/24-bit read]';
      instrStart = matchOffset - 1;
    }
    // --- Pattern: LD DE,nn  =>  11 F8 10 D0 ---
    else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x11) {
      type = 'LD-DE';
      detail = 'LD DE,D010F8  (pointer load)';
      instrStart = matchOffset - 1;
    }
    // --- Pattern: LD BC,nn  =>  01 F8 10 D0 ---
    else if (matchOffset >= 1 && rom[matchOffset - 1] === 0x01) {
      type = 'LD-BC';
      detail = 'LD BC,D010F8  (pointer load)';
      instrStart = matchOffset - 1;
    }
    // --- Pattern: CALL nn  =>  CD F8 10 D0 ---
    else if (matchOffset >= 1 && rom[matchOffset - 1] === 0xCD) {
      type = 'CALL';
      detail = 'CALL D010F8  (call to RAM address)';
      instrStart = matchOffset - 1;
    }
    // --- Pattern: JP nn  =>  C3 F8 10 D0 ---
    else if (matchOffset >= 1 && rom[matchOffset - 1] === 0xC3) {
      type = 'JUMP';
      detail = 'JP D010F8  (jump to RAM address)';
      instrStart = matchOffset - 1;
    }
    // --- Conditional JP / CALL ---
    else if (matchOffset >= 1) {
      const prev = rom[matchOffset - 1];
      const jpConditions = {
        0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C',
        0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M',
      };
      const callConditions = {
        0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C',
        0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M',
      };
      if (jpConditions[prev]) {
        type = 'JUMP';
        detail = `JP ${jpConditions[prev]},D010F8  (conditional jump to RAM)`;
        instrStart = matchOffset - 1;
      } else if (callConditions[prev]) {
        type = 'CALL';
        detail = `CALL ${callConditions[prev]},D010F8  (conditional call to RAM)`;
        instrStart = matchOffset - 1;
      }
    }

    // IX/IY prefix check
    if (type === 'UNKNOWN' && matchOffset >= 2 && (rom[matchOffset - 2] === 0xDD || rom[matchOffset - 2] === 0xFD)) {
      const prefix = rom[matchOffset - 2] === 0xDD ? 'IX' : 'IY';
      const op = rom[matchOffset - 1];
      instrStart = matchOffset - 2;
      if (op === 0x21) { type = `LD-${prefix}`; detail = `LD ${prefix},D010F8`; }
      else if (op === 0x22) { type = 'WRITE'; detail = `LD (D010F8),${prefix}`; }
      else if (op === 0x2A) { type = 'READ'; detail = `LD ${prefix},(D010F8)`; }
      else { type = 'UNKNOWN'; instrStart = matchOffset; }
    }

    // Fallback
    if (type === 'UNKNOWN') {
      type = 'POINTER/DATA';
      detail = 'Unclassified -- possibly data table or unrecognized instruction';
      instrStart = matchOffset;
    }

    // Surrounding bytes for context
    const ctxBefore = Math.max(0, matchOffset - 8);
    const ctxAfter = Math.min(ROM_SIZE, matchOffset + 3 + 8);

    classified.push({
      patternOffset: matchOffset,
      instrStart,
      type,
      detail,
      region: regionLabel(instrStart),
      beforeBytes: formatBytes(rom, ctxBefore, matchOffset - ctxBefore),
      matchBytes: formatBytes(rom, matchOffset, 3),
      afterBytes: formatBytes(rom, matchOffset + 3, ctxAfter - (matchOffset + 3)),
    });
  }

  // --- Output results ---

  // Summary by type
  const typeGroups = {};
  for (const hit of classified) {
    if (!typeGroups[hit.type]) typeGroups[hit.type] = [];
    typeGroups[hit.type].push(hit);
  }

  console.log('--- Summary by Type ---');
  console.log('');
  for (const [type, hits] of Object.entries(typeGroups).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${type.padEnd(20)} ${String(hits.length).padStart(3)} hit(s)`);
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${String(classified.length).padStart(3)} hit(s)`);

  // Detailed table
  console.log('');
  console.log('--- All D010F8 References ---');
  console.log('');
  console.log(
    'PatternOff'.padEnd(12) +
    'InstrAddr'.padEnd(12) +
    'Type'.padEnd(22) +
    'Region'.padEnd(25) +
    'Detail'
  );
  console.log('-'.repeat(120));

  for (const hit of classified) {
    console.log(
      hex(hit.patternOffset).padEnd(12) +
      hex(hit.instrStart).padEnd(12) +
      hit.type.padEnd(22) +
      hit.region.padEnd(25) +
      hit.detail
    );
  }

  // Group by region
  console.log('');
  console.log('--- Region Groups ---');
  console.log('');
  const regionGroups = {};
  for (const hit of classified) {
    if (!regionGroups[hit.region]) regionGroups[hit.region] = [];
    regionGroups[hit.region].push(hit);
  }
  for (const [region, hits] of Object.entries(regionGroups)) {
    console.log(`${region}: ${hits.length} hit(s)`);
    for (const h of hits) {
      console.log(`  ${hex(h.instrStart)}  ${h.type.padEnd(18)}  ${h.detail}`);
    }
    console.log('');
  }

  // WRITE-focused summary
  const writeHits = classified.filter(h =>
    h.type === 'WRITE' ||
    h.type === 'WRITE-VIA-HL' ||
    h.type === 'SET' ||
    h.type === 'RES'
  );

  console.log('--- WRITE Sites Only (direct + indirect) ---');
  console.log('');
  if (writeHits.length === 0) {
    console.log('  No direct WRITE sites found.');
  } else {
    for (const hit of writeHits) {
      console.log(`  ${hex(hit.instrStart)}  ${hit.type.padEnd(18)}  ${hit.detail}`);
    }
  }
  console.log('');

  // Indirect write via HL
  const indirectWriteHits = classified.filter(h =>
    h.type === 'WRITE-VIA-HL' || (h.type === 'LD-HL' && h.detail.includes('SET'))
  );
  if (indirectWriteHits.length > 0) {
    console.log('--- Indirect Write via HL Sites (LD HL,D010F8 + store/SET/RES) ---');
    console.log('');
    for (const hit of indirectWriteHits) {
      console.log(`  ${hex(hit.instrStart)}  ${hit.detail}`);
    }
    console.log('');
  }

  // Hex dump context
  console.log('--- Hex Dump Context (8 bytes before | match | 8 bytes after) ---');
  console.log('');
  for (const hit of classified) {
    const marker = (hit.type.includes('WRITE') || hit.type === 'SET' || hit.type === 'RES') ? '>>>' : '   ';
    console.log(
      `${marker} ${hex(hit.patternOffset)}  [${hit.beforeBytes}] {${hit.matchBytes}} [${hit.afterBytes}]  ${hit.type}  ${hit.detail}`
    );
  }
  console.log('');

  return classified;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const memInit = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernelInit, memInit };
}

function runHomeScreenStages(executor, cpu, mem) {
  const cpuSnap = snapshotCpu(cpu);

  const stages = [];

  // Stage 1: status bar background
  restoreCpu(cpu, cpuSnap);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  stages.push(executor.runFrom(STAGE_1_ENTRY, 'adl', { maxSteps: 30000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS }));

  // Stage 2: status dots
  restoreCpu(cpu, cpuSnap);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  mem[0xD0009B] &= ~0x40;
  stages.push(executor.runFrom(STAGE_2_ENTRY, 'adl', { maxSteps: 30000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS }));

  // Stage 3: home row strip
  restoreCpu(cpu, cpuSnap);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  stages.push(executor.runFrom(STAGE_3_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS }));

  // Stage 4: history area
  restoreCpu(cpu, cpuSnap);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  stages.push(executor.runFrom(STAGE_4_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS }));

  return stages;
}

// ---------------------------------------------------------------------------
// PART 2-4: Dynamic investigation
// ---------------------------------------------------------------------------

function runDynamicInvestigation(blocks, rom, mem) {
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('========================================================================');
  console.log('PART 2: Boot value of D010F8');
  console.log('========================================================================');
  console.log('');

  // Cold boot
  const bootSummary = coldBoot(executor, cpu, mem);
  console.log(`boot:        steps=${bootSummary.boot.steps} term=${bootSummary.boot.termination} lastPc=${hex(bootSummary.boot.lastPc)}`);
  console.log(`kernelInit:  steps=${bootSummary.kernelInit.steps} term=${bootSummary.kernelInit.termination} lastPc=${hex(bootSummary.kernelInit.lastPc)}`);
  console.log(`memInit:     steps=${bootSummary.memInit.steps} term=${bootSummary.memInit.termination} lastPc=${hex(bootSummary.memInit.lastPc)}`);
  console.log('');

  const afterBootValue = mem[TARGET_ADDR];
  console.log(`D010F8 after cold boot: ${hexByte(afterBootValue)}`);
  console.log('');

  // Run home screen stages
  console.log('Running home screen stages 1-4...');
  const stages = runHomeScreenStages(executor, cpu, mem);
  for (let i = 0; i < stages.length; i++) {
    console.log(`  Stage ${i + 1}: steps=${stages[i].steps} term=${stages[i].termination} lastPc=${hex(stages[i].lastPc)}`);
  }
  console.log('');

  const afterStagesValue = mem[TARGET_ADDR];
  console.log(`D010F8 after home screen stages: ${hexByte(afterStagesValue)}`);
  console.log('');

  // Snapshot the warm state for event loop and key press phases
  const warmSnap = snapshotCpu(cpu);
  const warmMem = new Uint8Array(mem);

  // --- PART 3: Event loop ---
  console.log('========================================================================');
  console.log('PART 3: Event loop value of D010F8');
  console.log('========================================================================');
  console.log('');

  // Restore to warm state
  mem.set(warmMem);
  restoreCpu(cpu, warmSnap);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  const beforeEventLoop = mem[TARGET_ADDR];
  console.log(`D010F8 before event loop: ${hexByte(beforeEventLoop)}`);

  const eventResult = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: EVENT_LOOP_STEPS,
    maxLoopIterations: 500,
  });
  console.log(`Event loop: steps=${eventResult.steps} term=${eventResult.termination} lastPc=${hex(eventResult.lastPc)}`);

  const afterEventLoop = mem[TARGET_ADDR];
  console.log(`D010F8 after ${EVENT_LOOP_STEPS} event loop steps: ${hexByte(afterEventLoop)}`);
  if (beforeEventLoop !== afterEventLoop) {
    console.log(`  --> CHANGED from ${hexByte(beforeEventLoop)} to ${hexByte(afterEventLoop)}`);
  } else {
    console.log('  --> unchanged');
  }
  console.log('');

  // Also dump nearby RAM for context (D010F0-D010FF)
  console.log('  Nearby RAM dump (D010F0-D010FF):');
  let dumpLine = '    ';
  for (let addr = 0xD010F0; addr <= 0xD010FF; addr++) {
    dumpLine += `${hex(addr, 6)}=${hexByte(mem[addr])} `;
  }
  console.log(dumpLine);
  console.log('');

  // --- PART 4: Post key press ---
  console.log('========================================================================');
  console.log('PART 4: Post key press value of D010F8');
  console.log('========================================================================');
  console.log('');

  // Restore to warm state
  mem.set(warmMem);
  restoreCpu(cpu, warmSnap);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  const beforeKeyPress = mem[TARGET_ADDR];
  console.log(`D010F8 before key press: ${hexByte(beforeKeyPress)}`);

  // Inject ENTER key (0x8F) into D0058E
  mem[0xD0058E] = 0x8F;
  console.log('Injected D0058E=0x8F (ENTER key scan code)');

  const keyResult = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: POST_KEY_STEPS,
    maxLoopIterations: 500,
  });
  console.log(`Post-key run: steps=${keyResult.steps} term=${keyResult.termination} lastPc=${hex(keyResult.lastPc)}`);

  const afterKeyPress = mem[TARGET_ADDR];
  console.log(`D010F8 after ${POST_KEY_STEPS} post-key steps: ${hexByte(afterKeyPress)}`);
  if (beforeKeyPress !== afterKeyPress) {
    console.log(`  --> CHANGED from ${hexByte(beforeKeyPress)} to ${hexByte(afterKeyPress)}`);
  } else {
    console.log('  --> unchanged');
  }
  console.log('');

  // Dump nearby RAM after key press
  console.log('  Nearby RAM dump after key press (D010F0-D010FF):');
  let dumpLine2 = '    ';
  for (let addr = 0xD010F0; addr <= 0xD010FF; addr++) {
    dumpLine2 += `${hex(addr, 6)}=${hexByte(mem[addr])} `;
  }
  console.log(dumpLine2);
  console.log('');

  // --- Summary ---
  console.log('========================================================================');
  console.log('SUMMARY');
  console.log('========================================================================');
  console.log('');
  console.log(`  D010F8 after cold boot:          ${hexByte(afterBootValue)}`);
  console.log(`  D010F8 after home screen stages:  ${hexByte(afterStagesValue)}`);
  console.log(`  D010F8 after event loop (10K):    ${hexByte(afterEventLoop)}`);
  console.log(`  D010F8 after key press (5K):      ${hexByte(afterKeyPress)}`);
  console.log('');

  return {
    afterBootValue,
    afterStagesValue,
    afterEventLoop,
    afterKeyPress,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Phase 242: D010F8 Investigation -- Map Write Sites and Boot Value');
  console.log('');

  const rom = fs.readFileSync(ROM_PATH);
  console.log(`ROM: ${path.basename(ROM_PATH)} (${rom.length} bytes)`);
  console.log('');

  // PART 1: Static scan
  const classified = scanRomForD010F8(rom);

  // PARTS 2-4: Dynamic investigation
  const assets = ensureTranspiledModule();
  try {
    console.log(`Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log('');

    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
        romModule.default?.PRELIFTED_BLOCKS ??
        romModule.default ??
        romModule,
    );

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const dynamicResults = runDynamicInvestigation(blocks, rom, mem);

    // Final interpretation
    console.log('========================================================================');
    console.log('INTERPRETATION');
    console.log('========================================================================');
    console.log('');
    console.log('  D010F8 is referenced by the BIT 4 guard at 0x051B84.');
    console.log('  When BIT 4,(D003E0) is SET and mem[D010F8]==0x01, function');
    console.log('  0x051B7C bails to 0x051BD7 (early exit).');
    console.log('');

    const writeHits = classified.filter(h =>
      h.type === 'WRITE' || h.type === 'WRITE-VIA-HL'
    );
    const readHits = classified.filter(h =>
      h.type === 'READ' || h.type === 'READ-VIA-HL'
    );
    console.log(`  Static scan: ${classified.length} total refs, ${writeHits.length} WRITE, ${readHits.length} READ`);
    console.log(`  Boot value: ${hexByte(dynamicResults.afterBootValue)} (${dynamicResults.afterBootValue === 0x00 ? 'guard inactive at boot' : dynamicResults.afterBootValue === 0x01 ? 'GUARD ACTIVE at boot' : 'unexpected value'})`);
    console.log('');

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
