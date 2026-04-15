#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const RAM_START = 0x400000;
const RAM_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE1_ENTRY = 0x0A2B72;
const STATUS_DOTS_ENTRY = 0x0A3301;
const STAGE3_ENTRY = 0x0A29EC;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const STAGE1_MAX_STEPS = 30000;
const STATUS_DOTS_MAX_STEPS = 30000;
const STAGE3_MAX_STEPS = 50000;

const BOOT_MAX_LOOPS = 32;
const KERNEL_INIT_MAX_LOOPS = 10000;
const STAGE_MAX_LOOPS = 500;

const STACK_RESET_TOP = 0xD1A87E;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;

const DISPLAY_BUF_START = 0xD006C0;
const DISPLAY_BUF_END = 0xD006FF;
const DISPLAY_BUF_LEN = DISPLAY_BUF_END - DISPLAY_BUF_START + 1;

const MODE_BUF_START = 0xD020A6;
const MODE_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = MODE_TEXT.length;

const STRIP_ROW_START = 37;
const STRIP_ROW_END = 52;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// --- Load ROM and transpiled blocks ---
const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// --- Utility functions ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24LE(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_LEN; index += 1) {
    mem[MODE_BUF_START + index] = MODE_TEXT.charCodeAt(index);
  }
}

function countForegroundPixels(mem, rowStart = STRIP_ROW_START, rowEnd = STRIP_ROW_END) {
  let count = 0;
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      const pixel = mem[offset] | (mem[offset + 1] << 8);
      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) {
        count++;
      }
    }
  }
  return count;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem, stackBytes = 12) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function dumpDisplayBuffer(mem) {
  const bytes = [];
  for (let addr = DISPLAY_BUF_START; addr <= DISPLAY_BUF_END; addr++) {
    bytes.push(mem[addr]);
  }
  return bytes;
}

function formatHexDump(bytes, baseAddr) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, Math.min(i + 16, bytes.length));
    const hexPart = chunk.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const asciiPart = chunk.map((b) => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('');
    lines.push(`  ${hex(baseAddr + i)}: ${hexPart.padEnd(47)}  ${asciiPart}`);
  }
  return lines.join('\n');
}

function diffBuffers(before, after) {
  const changed = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      changed.push({
        offset: i,
        addr: DISPLAY_BUF_START + i,
        before: before[i],
        after: after[i],
      });
    }
  }
  return changed;
}

// --- Part A: ROM Static Scan for Writers ---

function runPartA() {
  console.log('=== Part A: ROM Static Scan for Writers to 0xD006C0-0xD006FF ===');
  console.log(`ROM size: ${romBytes.length} bytes (${hex(romBytes.length)})`);

  const directWriters = [];   // LD (addr),A or LD (addr),rr with addr in range
  const directReaders = [];   // LD A,(addr) or LD rr,(addr) with addr in range (for context)
  const ldirLddr = [];        // LDIR/LDDR instructions (could write via DE)
  const immReferences = [];   // Any instruction referencing an address in the range as immediate

  let pc = 0;
  let decoded = 0;
  let errors = 0;

  while (pc < ROM_LIMIT) {
    if (pc % 0x100000 === 0) {
      console.log(`  Scanning progress: ${hex(pc)} (${Math.round(pc / ROM_LIMIT * 100)}%)`);
    }

    // Use Z80 mode for addresses < 0x080000, ADL mode for >= 0x080000
    const mode = pc >= 0x080000 ? 'adl' : 'z80';

    let instr;
    try {
      instr = decodeInstruction(romBytes, pc, mode);
    } catch (e) {
      errors++;
      pc++;
      continue;
    }

    if (!instr || !instr.length || instr.length <= 0) {
      errors++;
      pc++;
      continue;
    }

    decoded++;

    // Check for direct memory writes: LD (nn),A
    if (instr.tag === 'ld-mem-reg' && typeof instr.addr === 'number') {
      if (instr.addr >= DISPLAY_BUF_START && instr.addr <= DISPLAY_BUF_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        directWriters.push({
          pc,
          rawBytes,
          tag: instr.tag,
          addr: instr.addr,
          src: instr.src,
          description: `ld (${hex(instr.addr)}),${instr.src}`,
        });
      }
    }

    // Check for direct memory pair writes: LD (nn),rr (ED 43/53/63/73)
    if (instr.tag === 'ld-mem-pair' && typeof instr.addr === 'number') {
      if (instr.addr >= DISPLAY_BUF_START && instr.addr <= DISPLAY_BUF_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        directWriters.push({
          pc,
          rawBytes,
          tag: instr.tag,
          addr: instr.addr,
          pair: instr.pair,
          description: `ld (${hex(instr.addr)}),${instr.pair}`,
        });
      }
    }

    // Check for direct memory reads (for context): LD A,(nn), LD rr,(nn)
    if (instr.tag === 'ld-reg-mem' && typeof instr.addr === 'number') {
      if (instr.addr >= DISPLAY_BUF_START && instr.addr <= DISPLAY_BUF_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        directReaders.push({
          pc,
          rawBytes,
          tag: instr.tag,
          addr: instr.addr,
          dest: instr.dest,
          description: `ld ${instr.dest},(${hex(instr.addr)})`,
        });
      }
    }

    if (instr.tag === 'ld-pair-mem' && typeof instr.addr === 'number') {
      if (instr.addr >= DISPLAY_BUF_START && instr.addr <= DISPLAY_BUF_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        directReaders.push({
          pc,
          rawBytes,
          tag: instr.tag,
          addr: instr.addr,
          pair: instr.pair,
          description: `ld ${instr.pair},(${hex(instr.addr)})`,
        });
      }
    }

    // Check for LDIR/LDDR
    if (instr.tag === 'ldir' || instr.tag === 'lddr') {
      ldirLddr.push({ pc, tag: instr.tag });
    }

    // Check for any immediate value referencing the buffer range
    // (LD pair,imm where value is in range)
    if (instr.tag === 'ld-pair-imm' && typeof instr.value === 'number') {
      if (instr.value >= DISPLAY_BUF_START && instr.value <= DISPLAY_BUF_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        immReferences.push({
          pc,
          rawBytes,
          tag: instr.tag,
          value: instr.value,
          pair: instr.pair,
          description: `ld ${instr.pair},${hex(instr.value)}`,
        });
      }
    }

    // Also check CALL/JP targets — while they aren't writes, if an address
    // is loaded as an immediate it could be a pointer setup
    if (typeof instr.target === 'number') {
      if (instr.target >= DISPLAY_BUF_START && instr.target <= DISPLAY_BUF_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        immReferences.push({
          pc,
          rawBytes,
          tag: instr.tag,
          target: instr.target,
          description: `${instr.tag} ${hex(instr.target)}`,
        });
      }
    }

    pc = instr.nextPc;
  }

  console.log(`  Scanning complete: decoded=${decoded}, errors=${errors}`);

  console.log(`\n  Direct writers to 0xD006C0-0xD006FF: ${directWriters.length}`);
  for (const w of directWriters) {
    console.log(`    ${hex(w.pc)}: [${w.rawBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}] ${w.description}`);
  }

  console.log(`\n  Direct readers from 0xD006C0-0xD006FF: ${directReaders.length}`);
  for (const r of directReaders) {
    console.log(`    ${hex(r.pc)}: [${r.rawBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}] ${r.description}`);
  }

  console.log(`\n  LDIR/LDDR instructions (potential block copy writers): ${ldirLddr.length}`);
  if (ldirLddr.length <= 100) {
    for (const l of ldirLddr) {
      console.log(`    ${hex(l.pc)}: ${l.tag}`);
    }
  } else {
    console.log(`    (too many to list individually, showing first 50 and last 10)`);
    for (const l of ldirLddr.slice(0, 50)) {
      console.log(`    ${hex(l.pc)}: ${l.tag}`);
    }
    console.log(`    ...`);
    for (const l of ldirLddr.slice(-10)) {
      console.log(`    ${hex(l.pc)}: ${l.tag}`);
    }
  }

  console.log(`\n  Immediate references to 0xD006C0-0xD006FF: ${immReferences.length}`);
  for (const r of immReferences) {
    console.log(`    ${hex(r.pc)}: [${r.rawBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}] ${r.description}`);
  }

  return { directWriters, directReaders, ldirLddr, immReferences };
}

// --- Part B: Dynamic Write Monitoring ---

function initializeEnvironment() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, ROM_LIMIT)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  return {
    mem,
    cpu,
    executor,
    boot,
    kernelInit,
    postInit,
    ramSnapshot: new Uint8Array(mem.subarray(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
  };
}

function runPartB(env) {
  console.log('\n=== Part B: Dynamic Write Monitoring of 0xD006C0-0xD006FF ===');
  console.log(`Boot:        steps=${env.boot.steps} term=${env.boot.termination}`);
  console.log(`Kernel init: steps=${env.kernelInit.steps} term=${env.kernelInit.termination}`);
  console.log(`Post-init:   steps=${env.postInit.steps} term=${env.postInit.termination}`);

  console.log('\n  Display buffer after boot+init (before any stages):');
  const postInitBuf = dumpDisplayBuffer(env.mem);
  console.log(formatHexDump(postInitBuf, DISPLAY_BUF_START));

  const stages = [
    { name: 'Stage 1 (white bg)', entry: STAGE1_ENTRY, maxSteps: STAGE1_MAX_STEPS },
    { name: 'Status dots', entry: STATUS_DOTS_ENTRY, maxSteps: STATUS_DOTS_MAX_STEPS },
    { name: 'Stage 3 (mode text)', entry: STAGE3_ENTRY, maxSteps: STAGE3_MAX_STEPS },
  ];

  // Seed mode buffer before running stages (like phase167 does)
  seedModeBuffer(env.mem);

  let previousBuf = postInitBuf;

  for (const stage of stages) {
    console.log(`\n  --- ${stage.name} (entry=${hex(stage.entry)}) ---`);

    const beforeBuf = dumpDisplayBuffer(env.mem);
    console.log(`  Before ${stage.name}:`);
    console.log(formatHexDump(beforeBuf, DISPLAY_BUF_START));

    restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);

    const result = env.executor.runFrom(stage.entry, 'adl', {
      maxSteps: stage.maxSteps,
      maxLoopIterations: STAGE_MAX_LOOPS,
    });

    const afterBuf = dumpDisplayBuffer(env.mem);
    console.log(`  After ${stage.name} (steps=${result.steps}, term=${result.termination}):`);
    console.log(formatHexDump(afterBuf, DISPLAY_BUF_START));

    const changes = diffBuffers(beforeBuf, afterBuf);
    if (changes.length === 0) {
      console.log(`  NO CHANGES to display buffer during ${stage.name}`);
    } else {
      console.log(`  CHANGES detected (${changes.length} bytes modified):`);
      for (const c of changes) {
        const ch = (c.after >= 0x20 && c.after <= 0x7E) ? ` '${String.fromCharCode(c.after)}'` : '';
        console.log(`    ${hex(c.addr)}: ${hex(c.before, 2)} -> ${hex(c.after, 2)}${ch}`);
      }
    }

    previousBuf = afterBuf;
  }
}

// --- Part C: Display Buffer Seeding Experiment ---

function runPartC(env) {
  console.log('\n=== Part C: Display Buffer Seeding Experiment ===');

  const SEED_TEXT = 'Normal Float Radian       ';
  const SEED_LEN = SEED_TEXT.length;

  // -- Experiment A: Baseline (display buffer = zeros) --
  console.log('\n  --- Experiment A: Baseline (display buffer cleared to 0x00) ---');

  // Restore RAM and CPU to post-init state
  env.mem.set(env.ramSnapshot, RAM_START);
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);

  // Seed mode buffer (like phase167)
  seedModeBuffer(env.mem);

  // Explicitly zero the display buffer
  env.mem.fill(0x00, DISPLAY_BUF_START, DISPLAY_BUF_START + DISPLAY_BUF_LEN);

  // Clear VRAM to sentinel
  clearVram(env.mem);

  // Run stage 1 first (white bg)
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);
  const baselineStage1 = env.executor.runFrom(STAGE1_ENTRY, 'adl', {
    maxSteps: STAGE1_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
  });

  // Clear VRAM again to sentinel before stage 3
  clearVram(env.mem);

  // Run stage 3 (mode text render)
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);
  const baselineStage3 = env.executor.runFrom(STAGE3_ENTRY, 'adl', {
    maxSteps: STAGE3_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
  });

  const baselinePixels = countForegroundPixels(env.mem);
  const baselineDispBuf = dumpDisplayBuffer(env.mem);

  console.log(`  Stage 1: steps=${baselineStage1.steps}, term=${baselineStage1.termination}`);
  console.log(`  Stage 3: steps=${baselineStage3.steps}, term=${baselineStage3.termination}`);
  console.log(`  Foreground pixels in rows ${STRIP_ROW_START}-${STRIP_ROW_END}: ${baselinePixels}`);
  console.log(`  Display buffer after stage 3:`);
  console.log(formatHexDump(baselineDispBuf, DISPLAY_BUF_START));

  // -- Experiment B: Seeded display buffer --
  console.log('\n  --- Experiment B: Seeded display buffer ---');

  // Restore RAM and CPU to post-init state
  env.mem.set(env.ramSnapshot, RAM_START);
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);

  // Seed mode buffer
  seedModeBuffer(env.mem);

  // Seed the display buffer with ASCII text
  for (let i = 0; i < SEED_LEN && i < DISPLAY_BUF_LEN; i++) {
    env.mem[DISPLAY_BUF_START + i] = SEED_TEXT.charCodeAt(i);
  }
  // Fill rest with spaces
  for (let i = SEED_LEN; i < DISPLAY_BUF_LEN; i++) {
    env.mem[DISPLAY_BUF_START + i] = 0x20;
  }

  console.log(`  Seeded display buffer with: "${SEED_TEXT}" (${SEED_LEN} bytes)`);
  console.log(`  Display buffer before stages:`);
  console.log(formatHexDump(dumpDisplayBuffer(env.mem), DISPLAY_BUF_START));

  // Clear VRAM to sentinel
  clearVram(env.mem);

  // Run stage 1 first (white bg)
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);
  const seededStage1 = env.executor.runFrom(STAGE1_ENTRY, 'adl', {
    maxSteps: STAGE1_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
  });

  // Clear VRAM again to sentinel before stage 3
  clearVram(env.mem);

  // Run stage 3 (mode text render)
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);
  const seededStage3 = env.executor.runFrom(STAGE3_ENTRY, 'adl', {
    maxSteps: STAGE3_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOPS,
  });

  const seededPixels = countForegroundPixels(env.mem);
  const seededDispBuf = dumpDisplayBuffer(env.mem);

  console.log(`  Stage 1: steps=${seededStage1.steps}, term=${seededStage1.termination}`);
  console.log(`  Stage 3: steps=${seededStage3.steps}, term=${seededStage3.termination}`);
  console.log(`  Foreground pixels in rows ${STRIP_ROW_START}-${STRIP_ROW_END}: ${seededPixels}`);
  console.log(`  Display buffer after stage 3:`);
  console.log(formatHexDump(seededDispBuf, DISPLAY_BUF_START));

  // -- Comparison --
  console.log('\n  --- Comparison ---');
  console.log(`  Baseline foreground pixels: ${baselinePixels}`);
  console.log(`  Seeded foreground pixels:   ${seededPixels}`);
  console.log(`  Difference:                 ${seededPixels - baselinePixels}`);

  if (seededPixels !== baselinePixels) {
    console.log(`  RESULT: Seeding the display buffer CHANGES the rendered output.`);
    console.log(`  The display buffer at 0xD006C0 IS the source for home-screen text rendering.`);
  } else {
    console.log(`  RESULT: Seeding the display buffer did NOT change the rendered output.`);
    console.log(`  Either the rendering path ignores 0xD006C0, or the stage doesn't reach the affected rows.`);
  }

  // Check if display buffer itself was modified by the stages
  const bufChanges = diffBuffers(
    [...Array(DISPLAY_BUF_LEN)].map((_, i) => i < SEED_LEN ? SEED_TEXT.charCodeAt(i) : 0x20),
    seededDispBuf,
  );
  if (bufChanges.length > 0) {
    console.log(`\n  Display buffer was MODIFIED during stage execution (${bufChanges.length} bytes changed):`);
    for (const c of bufChanges) {
      console.log(`    ${hex(c.addr)}: ${hex(c.before, 2)} -> ${hex(c.after, 2)}`);
    }
  } else {
    console.log(`\n  Display buffer was NOT modified during stage execution (stays as seeded).`);
  }
}

// --- Additional scan: Look for LD HL,0xD006xx or LD DE,0xD006xx patterns ---

function runExtendedScan() {
  console.log('\n=== Extended Scan: LD pair,imm loading addresses near display buffer ===');

  // Widen search to include the entire 0xD006xx page for context
  const WIDE_START = 0xD00600;
  const WIDE_END = 0xD006FF;

  const results = [];
  let pc = 0;

  while (pc < ROM_LIMIT) {
    const mode = pc >= 0x080000 ? 'adl' : 'z80';

    let instr;
    try {
      instr = decodeInstruction(romBytes, pc, mode);
    } catch (e) {
      pc++;
      continue;
    }

    if (!instr || !instr.length || instr.length <= 0) {
      pc++;
      continue;
    }

    // LD pair,imm where imm is in the D006xx range
    if (instr.tag === 'ld-pair-imm' && typeof instr.value === 'number') {
      if (instr.value >= WIDE_START && instr.value <= WIDE_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        results.push({
          pc,
          rawBytes,
          description: `ld ${instr.pair},${hex(instr.value)}`,
        });
      }
    }

    // Also check LD (ix+d) and LD (iy+d) store patterns won't have immediate address
    // But check for CALL/JP to addresses that might set up the buffer
    if (instr.tag === 'ld-mem-reg' && typeof instr.addr === 'number') {
      if (instr.addr >= WIDE_START && instr.addr <= WIDE_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        results.push({
          pc,
          rawBytes,
          description: `ld (${hex(instr.addr)}),${instr.src}`,
        });
      }
    }

    if (instr.tag === 'ld-mem-pair' && typeof instr.addr === 'number') {
      if (instr.addr >= WIDE_START && instr.addr <= WIDE_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        results.push({
          pc,
          rawBytes,
          description: `ld (${hex(instr.addr)}),${instr.pair}`,
        });
      }
    }

    if (instr.tag === 'ld-reg-mem' && typeof instr.addr === 'number') {
      if (instr.addr >= WIDE_START && instr.addr <= WIDE_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        results.push({
          pc,
          rawBytes,
          description: `ld ${instr.dest},(${hex(instr.addr)})`,
        });
      }
    }

    if (instr.tag === 'ld-pair-mem' && typeof instr.addr === 'number') {
      if (instr.addr >= WIDE_START && instr.addr <= WIDE_END) {
        const rawBytes = Array.from(romBytes.subarray(pc, pc + instr.length));
        results.push({
          pc,
          rawBytes,
          description: `ld ${instr.pair},(${hex(instr.addr)})`,
        });
      }
    }

    pc = instr.nextPc;
  }

  console.log(`  Found ${results.length} instructions referencing 0xD006xx range:`);
  for (const r of results) {
    console.log(`    ${hex(r.pc)}: [${r.rawBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}] ${r.description}`);
  }

  return results;
}

// --- Main ---

async function main() {
  console.log('=== Phase 169 - Display Buffer 0xD006C0 Investigation ===');
  console.log(`ROM bytes: ${romBytes.length}`);
  console.log(`PRELIFTED_BLOCKS: ${Object.keys(BLOCKS).length}`);
  console.log(`Display buffer range: ${hex(DISPLAY_BUF_START)}-${hex(DISPLAY_BUF_END)} (${DISPLAY_BUF_LEN} bytes)`);

  // Part A: Static ROM scan
  const partAResults = runPartA();

  // Extended scan for the wider D006xx page
  const extendedResults = runExtendedScan();

  // Part B: Dynamic monitoring
  const env = initializeEnvironment();
  runPartB(env);

  // Part C: Seeding experiment
  runPartC(env);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Part A: ${partAResults.directWriters.length} direct writers, ${partAResults.directReaders.length} direct readers, ${partAResults.ldirLddr.length} LDIR/LDDR, ${partAResults.immReferences.length} immediate refs`);
  console.log(`Extended: ${extendedResults.length} instructions in wider 0xD006xx scan`);
  console.log('See Part B/C output above for dynamic results.');
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
