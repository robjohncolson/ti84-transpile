#!/usr/bin/env node

/**
 * Phase 175 — Display Buffer Backup at 0xD02EC7
 *
 * Phase 171 discovered a save/restore system:
 *   - Save:    0x0885A1 copies 260 bytes FROM 0xD006C0 TO 0xD02EC7 via LDIR
 *   - Restore: 0x088720 copies 260 bytes FROM 0xD02EC7 TO 0xD006C0 via LDIR
 *   - Secondary backup: 0x0A2000 copies TO 0xD0232D
 *
 * This probe checks:
 *   Part 1: Post-boot state of backup, secondary backup, and live display buffers
 *   Part 2: Dynamic write monitoring of 0xD02EC7-0xD02FCB during boot+init
 *   Part 3: Restore path test — call 0x088720 and check if display buffer is populated
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

// ── Constants ────────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOPS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOPS = 10000;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOPS = 32;

const STACK_RESET_TOP = 0xD1A87E;

// Backup buffer (260 bytes = 10 lines x 26 chars)
const BACKUP_BUF_START = 0xD02EC7;
const BACKUP_BUF_LEN = 260;
const BACKUP_BUF_END = BACKUP_BUF_START + BACKUP_BUF_LEN - 1; // 0xD02FCB

// Secondary backup buffer
const SECONDARY_BUF_START = 0xD0232D;
const SECONDARY_BUF_LEN = 260;
const SECONDARY_BUF_END = SECONDARY_BUF_START + SECONDARY_BUF_LEN - 1; // 0xD02431

// Live display buffer
const DISPLAY_BUF_START = 0xD006C0;
const DISPLAY_BUF_LEN = 260;
const DISPLAY_BUF_END = DISPLAY_BUF_START + DISPLAY_BUF_LEN - 1; // 0xD007C4

// Restore function entry
const RESTORE_ENTRY = 0x088720;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function safeChar(b) {
  return (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
}

function dumpBuffer(mem, start, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(mem[start + i]);
  }
  return bytes;
}

function analyzeBuffer(label, bytes) {
  const hexDump = bytes.map(hexByte).join(' ');
  const ascii = bytes.map(safeChar).join('');
  const nonZero = bytes.filter((b) => b !== 0x00).length;
  const spaces = bytes.filter((b) => b === 0x20).length;
  const printable = bytes.filter((b) => b >= 0x20 && b <= 0x7E).length;
  const allFF = bytes.every((b) => b === 0xFF);
  const allZero = bytes.every((b) => b === 0x00);

  return {
    label,
    hexDump,
    ascii,
    nonZero,
    spaces,
    printable,
    allFF,
    allZero,
    total: bytes.length,
  };
}

function printBufferAnalysis(analysis) {
  console.log(`\n  --- ${analysis.label} ---`);
  console.log(`  Length: ${analysis.total} bytes`);
  console.log(`  Non-zero bytes: ${analysis.nonZero} / ${analysis.total}`);
  console.log(`  Spaces (0x20): ${analysis.spaces}`);
  console.log(`  Printable ASCII: ${analysis.printable}`);
  console.log(`  All-0x00: ${analysis.allZero ? 'YES' : 'NO'}`);
  console.log(`  All-0xFF: ${analysis.allFF ? 'YES' : 'NO'}`);

  // Print hex dump in 26-byte rows (one display line per row)
  const bytes = analysis.hexDump.split(' ');
  const asciiChars = analysis.ascii;
  for (let row = 0; row < 10; row++) {
    const start = row * 26;
    const end = Math.min(start + 26, bytes.length);
    if (start >= bytes.length) break;
    const hexRow = bytes.slice(start, end).join(' ');
    const asciiRow = asciiChars.substring(start, end);
    console.log(`  Row ${row}: ${hexRow}`);
    console.log(`         ${asciiRow}`);
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
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

// ── Load ROM and transpiled blocks ───────────────────────────────────────────

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Part 1: Post-boot buffer state ──────────────────────────────────────────

function runBootSequence() {
  console.log('PART 1: Post-boot Buffer State');
  console.log('==============================');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Step 1: Cold boot
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });
  console.log(`Cold boot: steps=${boot.steps} term=${boot.termination} lastPc=${hex(boot.lastPc)}`);

  // Step 2: Kernel init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
  });
  console.log(`Kernel init: steps=${kernelInit.steps} term=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)}`);

  // Step 3: Post-init
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
    maxLoopIterations: POST_INIT_MAX_LOOPS,
  });
  console.log(`Post-init: steps=${postInit.steps} term=${postInit.termination} lastPc=${hex(postInit.lastPc)}`);

  // Dump all three buffers
  const backupBytes = dumpBuffer(mem, BACKUP_BUF_START, BACKUP_BUF_LEN);
  const secondaryBytes = dumpBuffer(mem, SECONDARY_BUF_START, SECONDARY_BUF_LEN);
  const displayBytes = dumpBuffer(mem, DISPLAY_BUF_START, DISPLAY_BUF_LEN);

  const backupAnalysis = analyzeBuffer(`Backup Buffer ${hex(BACKUP_BUF_START)}-${hex(BACKUP_BUF_END)}`, backupBytes);
  const secondaryAnalysis = analyzeBuffer(`Secondary Backup ${hex(SECONDARY_BUF_START)}-${hex(SECONDARY_BUF_END)}`, secondaryBytes);
  const displayAnalysis = analyzeBuffer(`Live Display Buffer ${hex(DISPLAY_BUF_START)}-${hex(DISPLAY_BUF_END)}`, displayBytes);

  printBufferAnalysis(backupAnalysis);
  printBufferAnalysis(secondaryAnalysis);
  printBufferAnalysis(displayAnalysis);

  return {
    mem,
    cpu,
    executor,
    cpuSnapshot: snapshotCpu(cpu),
    ramSnapshot: new Uint8Array(mem.slice(0x400000, 0xE00000)),
    backupAnalysis,
    secondaryAnalysis,
    displayAnalysis,
    backupBytes,
  };
}

// ── Part 2: Dynamic write monitoring during boot ────────────────────────────

function runWriteMonitoring() {
  console.log('\n\nPART 2: Dynamic Write Monitoring of Backup Buffer During Boot');
  console.log('=============================================================');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Install write trap on the backup buffer range
  const writeLog = [];
  const originalWrite8 = cpu.write8.bind(cpu);
  let stepCounter = 0;
  let phase = 'boot';

  cpu.write8 = function (addr, value) {
    if (addr >= BACKUP_BUF_START && addr <= BACKUP_BUF_END) {
      writeLog.push({
        step: stepCounter,
        phase,
        pc: cpu.pc !== undefined ? cpu.pc : null,
        addr,
        value,
      });
    }
    return originalWrite8(addr, value);
  };

  // Step 1: Cold boot
  phase = 'boot';
  stepCounter = 0;
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });
  console.log(`Cold boot: steps=${boot.steps} term=${boot.termination} (writes to backup: ${writeLog.length})`);

  const writesAfterBoot = writeLog.length;

  // Step 2: Kernel init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  phase = 'kernel-init';
  stepCounter = 0;
  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
  });
  const writesAfterKernel = writeLog.length;
  console.log(`Kernel init: steps=${kernelInit.steps} term=${kernelInit.termination} (new writes: ${writesAfterKernel - writesAfterBoot})`);

  // Step 3: Post-init
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  phase = 'post-init';
  stepCounter = 0;
  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOPS,
  });
  console.log(`Post-init: steps=${postInit.steps} term=${postInit.termination} (new writes: ${writeLog.length - writesAfterKernel})`);

  console.log(`\nTotal writes to backup buffer: ${writeLog.length}`);

  if (writeLog.length === 0) {
    console.log('  No writes to backup buffer during entire boot+init sequence.');
  } else {
    // Summarize by phase
    const byPhase = {};
    for (const entry of writeLog) {
      if (!byPhase[entry.phase]) byPhase[entry.phase] = [];
      byPhase[entry.phase].push(entry);
    }

    for (const [phaseName, entries] of Object.entries(byPhase)) {
      console.log(`\n  Phase "${phaseName}": ${entries.length} writes`);

      // Show unique PCs
      const uniquePCs = [...new Set(entries.map((e) => e.pc))].sort((a, b) => a - b);
      console.log(`  Unique PCs: ${uniquePCs.map((pc) => hex(pc)).join(', ')}`);

      // Show first 20 writes
      const show = entries.slice(0, 20);
      for (const entry of show) {
        console.log(`    step=${entry.step} PC=${hex(entry.pc)} addr=${hex(entry.addr)} val=${hexByte(entry.value)} (${safeChar(entry.value)})`);
      }
      if (entries.length > 20) {
        console.log(`    ... and ${entries.length - 20} more writes`);
      }
    }

    // Check if writes form meaningful text
    const finalBuf = dumpBuffer(mem, BACKUP_BUF_START, BACKUP_BUF_LEN);
    const finalAnalysis = analyzeBuffer('Backup after monitored boot', finalBuf);
    printBufferAnalysis(finalAnalysis);
  }

  return { writeLog };
}

// ── Part 3: Restore path test ───────────────────────────────────────────────

function runRestoreTest(env) {
  console.log('\n\nPART 3: Restore Path Test (0x088720)');
  console.log('====================================');

  const { backupBytes, backupAnalysis } = env;

  // Check if backup has meaningful text
  const hasText = backupAnalysis.printable > 10 && !backupAnalysis.allFF && !backupAnalysis.allZero;
  console.log(`Backup has meaningful text: ${hasText ? 'YES' : 'NO'} (printable=${backupAnalysis.printable}, nonZero=${backupAnalysis.nonZero})`);

  // Even if backup is empty, we can seed it with known text and test the restore path
  // Restore clean state
  env.mem.set(env.ramSnapshot, 0x400000);
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);

  // If backup doesn't have text, seed it with a recognizable pattern
  if (!hasText) {
    console.log('  Backup is empty/uninitialized; seeding with test pattern...');
    const testText = 'Phase175-TestPattern-ABCDE';
    for (let i = 0; i < BACKUP_BUF_LEN; i++) {
      env.mem[BACKUP_BUF_START + i] = i < testText.length
        ? testText.charCodeAt(i)
        : 0x20; // fill rest with spaces
    }
    console.log(`  Seeded backup: "${testText}" + spaces (${BACKUP_BUF_LEN} bytes)`);
  }

  // Clear the live display buffer so we can detect writes
  env.mem.fill(0x00, DISPLAY_BUF_START, DISPLAY_BUF_START + DISPLAY_BUF_LEN);

  // Dump pre-state
  const preDisplay = dumpBuffer(env.mem, DISPLAY_BUF_START, DISPLAY_BUF_LEN);
  const preBackup = dumpBuffer(env.mem, BACKUP_BUF_START, BACKUP_BUF_LEN);
  console.log(`\n  Pre-restore display buffer non-zero: ${preDisplay.filter((b) => b !== 0).length}`);
  console.log(`  Pre-restore backup buffer non-zero: ${preBackup.filter((b) => b !== 0).length}`);

  // Run the restore function at 0x088720
  let result;
  try {
    result = env.executor.runFrom(RESTORE_ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 500,
    });
  } catch (err) {
    console.log(`  ERROR running restore: ${err.message || err}`);
    return { restoreWorked: false, error: String(err) };
  }

  console.log(`  Restore run: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);

  // Check the display buffer after restore
  const postDisplay = dumpBuffer(env.mem, DISPLAY_BUF_START, DISPLAY_BUF_LEN);
  const postAnalysis = analyzeBuffer(`Display Buffer After Restore (${hex(DISPLAY_BUF_START)})`, postDisplay);
  printBufferAnalysis(postAnalysis);

  // Did the display buffer get populated?
  const restoreWorked = postAnalysis.nonZero > 0;
  console.log(`\n  Restore populated display buffer: ${restoreWorked ? 'YES' : 'NO'}`);

  // Check if display buffer now matches what was in the backup
  const postBackup = dumpBuffer(env.mem, BACKUP_BUF_START, BACKUP_BUF_LEN);
  let matchCount = 0;
  for (let i = 0; i < BACKUP_BUF_LEN; i++) {
    if (postDisplay[i] === preBackup[i]) matchCount++;
  }
  console.log(`  Display matches backup: ${matchCount}/${BACKUP_BUF_LEN} bytes`);

  return {
    restoreWorked,
    steps: result.steps,
    termination: result.termination,
    matchCount,
    postAnalysis,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 175 — Display Buffer Backup at 0xD02EC7 ===');
  console.log(`ROM bytes: ${romBytes.length}`);
  console.log(`PRELIFTED_BLOCKS: ${Object.keys(BLOCKS).length}`);
  console.log(`Backup buffer:    ${hex(BACKUP_BUF_START)}-${hex(BACKUP_BUF_END)} (${BACKUP_BUF_LEN} bytes)`);
  console.log(`Secondary backup: ${hex(SECONDARY_BUF_START)}-${hex(SECONDARY_BUF_END)} (${SECONDARY_BUF_LEN} bytes)`);
  console.log(`Display buffer:   ${hex(DISPLAY_BUF_START)}-${hex(DISPLAY_BUF_END)} (${DISPLAY_BUF_LEN} bytes)`);
  console.log(`Restore entry:    ${hex(RESTORE_ENTRY)}`);
  console.log('');

  // Part 1: Post-boot buffer state
  const env = runBootSequence();

  // Part 2: Write monitoring
  const monitoring = runWriteMonitoring();

  // Part 3: Restore path test
  const restore = runRestoreTest(env);

  // ── Verdict ───────────────────────────────────────────────────────────────

  console.log('\n\n========================================');
  console.log('SUMMARY');
  console.log('========================================');

  const backupNonZero = env.backupAnalysis.nonZero;
  const backupPrintable = env.backupAnalysis.printable;
  const backupAllFF = env.backupAnalysis.allFF;
  const backupAllZero = env.backupAnalysis.allZero;
  const writesDuringBoot = monitoring.writeLog.length;

  console.log(`Backup buffer (${hex(BACKUP_BUF_START)}): nonZero=${backupNonZero} printable=${backupPrintable} allFF=${backupAllFF} allZero=${backupAllZero}`);
  console.log(`Secondary backup (${hex(SECONDARY_BUF_START)}): nonZero=${env.secondaryAnalysis.nonZero} printable=${env.secondaryAnalysis.printable}`);
  console.log(`Display buffer (${hex(DISPLAY_BUF_START)}): nonZero=${env.displayAnalysis.nonZero} printable=${env.displayAnalysis.printable}`);
  console.log(`Writes to backup during boot: ${writesDuringBoot}`);
  console.log(`Restore path worked: ${restore.restoreWorked ? 'YES' : 'NO'}`);
  if (restore.restoreWorked) {
    console.log(`  Restore match: ${restore.matchCount}/${BACKUP_BUF_LEN} bytes matched backup`);
  }

  // Determine verdict
  let verdict;
  if (backupPrintable > 20 && !backupAllFF && !backupAllZero) {
    verdict = 'BACKUP_HAS_TEXT';
  } else if (backupAllZero) {
    verdict = 'BACKUP_EMPTY';
  } else {
    verdict = 'BACKUP_UNINITIALIZED';
  }

  console.log(`\nVERDICT: ${verdict}`);

  // JSON summary
  const summary = {
    verdict,
    backup: {
      start: hex(BACKUP_BUF_START),
      end: hex(BACKUP_BUF_END),
      length: BACKUP_BUF_LEN,
      nonZero: backupNonZero,
      spaces: env.backupAnalysis.spaces,
      printable: backupPrintable,
      allFF: backupAllFF,
      allZero: backupAllZero,
      ascii: env.backupAnalysis.ascii,
    },
    secondary: {
      start: hex(SECONDARY_BUF_START),
      end: hex(SECONDARY_BUF_END),
      length: SECONDARY_BUF_LEN,
      nonZero: env.secondaryAnalysis.nonZero,
      spaces: env.secondaryAnalysis.spaces,
      printable: env.secondaryAnalysis.printable,
      allFF: env.secondaryAnalysis.allFF,
      allZero: env.secondaryAnalysis.allZero,
      ascii: env.secondaryAnalysis.ascii,
    },
    display: {
      start: hex(DISPLAY_BUF_START),
      end: hex(DISPLAY_BUF_END),
      length: DISPLAY_BUF_LEN,
      nonZero: env.displayAnalysis.nonZero,
      spaces: env.displayAnalysis.spaces,
      printable: env.displayAnalysis.printable,
      allFF: env.displayAnalysis.allFF,
      allZero: env.displayAnalysis.allZero,
      ascii: env.displayAnalysis.ascii,
    },
    writesDuringBoot: writesDuringBoot,
    writePhases: monitoring.writeLog.length > 0
      ? Object.fromEntries(
          Object.entries(
            monitoring.writeLog.reduce((acc, w) => {
              acc[w.phase] = (acc[w.phase] || 0) + 1;
              return acc;
            }, {})
          )
        )
      : {},
    restore: {
      worked: restore.restoreWorked,
      steps: restore.steps,
      termination: restore.termination,
      matchCount: restore.matchCount,
    },
  };

  console.log('\nJSON_SUMMARY:');
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
