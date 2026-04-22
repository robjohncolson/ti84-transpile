#!/usr/bin/env node

/**
 * Phase 25AD: Event loop (CoorMon) trace with simulated keypress
 *
 * Goal:
 *   1. Cold boot + MEM_INIT
 *   2. Seed keyboard matrix with ENTER key pressed
 *   3. Run CoorMon at 0x08C331 with 100K step budget
 *   4. Collect PC trace and analyze which known routines are visited:
 *      - GetCSC (0x03FA09)
 *      - ParseInp (0x099914)
 *      - Scancode table area (0x09F79B)
 *      - JT slots (0x020100-0x0210FF)
 *
 * Keyboard seeding:
 *   ENTER = keyMatrix[1] bit 0. Set keyMatrix[1] = 0xFE (bit 0 low = pressed).
 *   Also pre-set kbdScanCode (0xD00587) = 0x09 (skEnter) and
 *   kbdFlags bit 3 (kbdSCR = scan code ready) at IY+0 = 0xD00080.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ad-event-loop-trace-report.md');
const REPORT_TITLE = 'Phase 25AD - Event Loop (CoorMon) Trace with Simulated Keypress';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const COORMON_ENTRY = 0x08c331;
const GETCSC_ADDR = 0x03fa09;
const PARSEINP_ADDR = 0x099914;
const SCANCODE_TABLE_AREA_START = 0x09f700;
const SCANCODE_TABLE_AREA_END = 0x09f900;
const JT_SLOT_START = 0x020100;
const JT_SLOT_END = 0x0210ff;

const IY_ADDR = 0xd00080;
const KBD_FLAGS_ADDR = 0xd00080;  // IY+0 = kbdFlags
const KBD_SCAN_CODE_ADDR = 0xd00587;
const KBD_KEY_ADDR = 0xd0058c;
const KBD_GETKY_ADDR = 0xd0058d;
const CX_CUR_APP_ADDR = 0xd007e0;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;

const MEMINIT_RET = 0x7ffff6;
const COORMON_RET = 0x7ffffe;
const FAKE_RET = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const COORMON_BUDGET = 100000;
const MAX_LOOP_ITER = 2000;

// Key constants
const SK_ENTER = 0x09;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errSP: read24(mem, ERR_SP_ADDR),
  };
}

function formatPointerSnapshot(s) {
  return [
    `tempMem=${hex(s.tempMem)}`,
    `FPSbase=${hex(s.fpsBase)}`,
    `FPS=${hex(s.fps)}`,
    `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`,
    `errNo=${hex(s.errNo, 2)}`,
    `errSP=${hex(s.errSP)}`,
  ].join(' ');
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return bootResult;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

// Known routine ranges for classification
const KNOWN_ROUTINES = [
  { name: 'GetCSC', start: 0x03fa09, end: 0x03fb00 },
  { name: 'ParseInp', start: 0x099914, end: 0x099a00 },
  { name: 'ScancodeTable', start: SCANCODE_TABLE_AREA_START, end: SCANCODE_TABLE_AREA_END },
  { name: 'JT_Slots', start: JT_SLOT_START, end: JT_SLOT_END },
  { name: 'CoorMon', start: 0x08c331, end: 0x08c400 },
  { name: 'BootArea', start: 0x000000, end: 0x001000 },
  { name: 'ISR_area', start: 0x000700, end: 0x000800 },
];

function classifyPc(pc) {
  for (const r of KNOWN_ROUTINES) {
    if (pc >= r.start && pc <= r.end) return r.name;
  }
  return null;
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AD: CoorMon Event Loop Trace with Simulated Keypress ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Stage 0: Cold boot
  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  const postBootPointers = snapshotPointers(mem);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);

  // Stage 1: MEM_INIT
  log('\n=== STAGE 1: MEM_INIT ===');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let memInitTermination = 'unknown';
  let memInitSteps = 0;
  let memInitReturnHit = false;

  try {
    const result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xffffff;
        if (typeof step === 'number') memInitSteps = Math.max(memInitSteps, step + 1);
        if (norm === MEMINIT_RET) throw new Error('__RETURN__');
      },
      onMissingBlock(pc, _mode, step) {
        const norm = pc & 0xffffff;
        if (typeof step === 'number') memInitSteps = Math.max(memInitSteps, step + 1);
        if (norm === MEMINIT_RET) throw new Error('__RETURN__');
      },
    });
    memInitTermination = result.termination ?? 'unknown';
    memInitSteps = Math.max(memInitSteps, result.steps ?? 0);
  } catch (e) {
    if (e?.message === '__RETURN__') {
      memInitReturnHit = true;
      memInitTermination = 'return_hit';
    } else {
      throw e;
    }
  }

  const postMemInitPointers = snapshotPointers(mem);
  log(`MEM_INIT: returned=${memInitReturnHit} term=${memInitTermination} steps=${memInitSteps}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);

  if (!memInitReturnHit) {
    log('FATAL: MEM_INIT did not return. Cannot proceed.');
    writeReport(transcript, null);
    process.exitCode = 1;
    return;
  }

  // Stage 2: Seed keyboard with ENTER key
  log('\n=== STAGE 2: Seed Keyboard (ENTER) ===');

  // Set ENTER key in hardware matrix: keyMatrix[1] bit 0 = low (active low)
  peripherals.keyboard.keyMatrix[1] = 0xfe;  // bit 0 cleared = ENTER pressed
  log(`keyMatrix[1] set to 0xfe (ENTER pressed)`);

  // Pre-seed OS keyboard variables
  mem[KBD_SCAN_CODE_ADDR] = SK_ENTER;
  mem[KBD_FLAGS_ADDR] |= (1 << 3);  // kbdSCR bit = scan code ready
  mem[KBD_FLAGS_ADDR] |= (1 << 4);  // kbdKeyPress bit = key pressed
  mem[KBD_KEY_ADDR] = 0x05;  // kEnter = 0x05
  mem[KBD_GETKY_ADDR] = 0x05;

  log(`kbdScanCode (${hex(KBD_SCAN_CODE_ADDR)}) = ${hex(SK_ENTER, 2)}`);
  log(`kbdFlags (${hex(KBD_FLAGS_ADDR)}) = ${hex(mem[KBD_FLAGS_ADDR], 2)} (bits 3,4 set)`);
  log(`kbdKey (${hex(KBD_KEY_ADDR)}) = ${hex(mem[KBD_KEY_ADDR], 2)}`);
  log(`kbdGetKy (${hex(KBD_GETKY_ADDR)}) = ${hex(mem[KBD_GETKY_ADDR], 2)}`);
  log(`cxCurApp (${hex(CX_CUR_APP_ADDR)}) = ${hex(mem[CX_CUR_APP_ADDR], 2)}`);

  // Stage 3: Run CoorMon
  log('\n=== STAGE 3: CoorMon (Event Loop) ===');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, COORMON_RET);

  // Collect full PC trace
  const pcTrace = [];
  const pcCounts = new Map();
  const routineHits = new Map();
  let coormonSteps = 0;
  let coormonTermination = 'unknown';
  let coormonReturnHit = false;
  let coormonFinalPc = 0;
  let coormonMissingBlock = false;
  const uniquePcList = [];
  const seenPcs = new Set();

  const recordPc = (pc, step) => {
    const norm = pc & 0xffffff;
    if (typeof step === 'number') coormonSteps = Math.max(coormonSteps, step + 1);
    coormonFinalPc = norm;

    // Record trace (keep first 5000 entries for analysis)
    if (pcTrace.length < 5000) {
      pcTrace.push(norm);
    }

    // Count occurrences
    pcCounts.set(norm, (pcCounts.get(norm) || 0) + 1);

    // Track first-seen order
    if (!seenPcs.has(norm)) {
      seenPcs.add(norm);
      uniquePcList.push(norm);
    }

    // Classify into known routines
    const routine = classifyPc(norm);
    if (routine) {
      if (!routineHits.has(routine)) routineHits.set(routine, []);
      const hits = routineHits.get(routine);
      if (hits.length < 50) hits.push({ pc: norm, step });
    }

    if (norm === COORMON_RET) throw new Error('__RETURN__');
    if (norm === FAKE_RET || norm === 0xffffff) throw new Error('__MISSING_BLOCK__');
  };

  try {
    const result = executor.runFrom(COORMON_ENTRY, 'adl', {
      maxSteps: COORMON_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        recordPc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        coormonMissingBlock = true;
        recordPc(pc, step);
      },
    });
    coormonTermination = result.termination ?? 'unknown';
    coormonSteps = Math.max(coormonSteps, result.steps ?? 0);
  } catch (e) {
    if (e?.message === '__RETURN__') {
      coormonReturnHit = true;
      coormonTermination = 'return_hit';
    } else if (e?.message === '__MISSING_BLOCK__') {
      coormonTermination = 'missing_block';
    } else {
      throw e;
    }
  }

  const postCoormonPointers = snapshotPointers(mem);

  log(`CoorMon: term=${coormonTermination} steps=${coormonSteps} finalPc=${hex(coormonFinalPc)}`);
  log(`CoorMon: returned=${coormonReturnHit} missingBlock=${coormonMissingBlock}`);
  log(`CoorMon: unique PCs visited=${seenPcs.size} trace entries=${pcTrace.length}`);
  log(`post-CoorMon pointers: ${formatPointerSnapshot(postCoormonPointers)}`);

  // Post-CoorMon keyboard state
  log(`\nPost-CoorMon keyboard state:`);
  log(`  kbdScanCode = ${hex(mem[KBD_SCAN_CODE_ADDR], 2)}`);
  log(`  kbdFlags = ${hex(mem[KBD_FLAGS_ADDR], 2)}`);
  log(`  kbdKey = ${hex(mem[KBD_KEY_ADDR], 2)}`);
  log(`  kbdGetKy = ${hex(mem[KBD_GETKY_ADDR], 2)}`);
  log(`  cxCurApp = ${hex(mem[CX_CUR_APP_ADDR], 2)}`);

  // Analyze routine hits
  log('\n=== Routine Hit Analysis ===');
  for (const [name, hits] of routineHits.entries()) {
    const uniqueHitPcs = [...new Set(hits.map(h => h.pc))];
    log(`${name}: ${hits.length} hits, unique PCs: ${uniqueHitPcs.map(p => hex(p)).join(', ')}`);
  }

  // Check specific addresses
  log('\n=== Specific Address Checks ===');
  log(`GetCSC (${hex(GETCSC_ADDR)}): visited=${seenPcs.has(GETCSC_ADDR)} count=${pcCounts.get(GETCSC_ADDR) || 0}`);
  log(`ParseInp (${hex(PARSEINP_ADDR)}): visited=${seenPcs.has(PARSEINP_ADDR)} count=${pcCounts.get(PARSEINP_ADDR) || 0}`);
  log(`CoorMon entry (${hex(COORMON_ENTRY)}): count=${pcCounts.get(COORMON_ENTRY) || 0}`);

  // Top 20 most-visited PCs
  log('\n=== Top 20 Most-Visited PCs ===');
  const sortedPcs = [...pcCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < Math.min(20, sortedPcs.length); i++) {
    const [pc, count] = sortedPcs[i];
    const routine = classifyPc(pc) || 'unknown';
    log(`  ${hex(pc)}: ${count} hits (${routine})`);
  }

  // First 100 unique PCs in order (shows execution flow)
  log('\n=== First 100 Unique PCs (execution flow) ===');
  const first100 = uniquePcList.slice(0, 100);
  for (let i = 0; i < first100.length; i++) {
    const pc = first100[i];
    const routine = classifyPc(pc) || '';
    log(`  [${i}] ${hex(pc)} ${routine ? `(${routine})` : ''}`);
  }

  // Look for loop pattern: find most repeated short sequences
  log('\n=== Loop Pattern Analysis ===');
  if (pcTrace.length >= 10) {
    // Find the last 50 PCs to see the termination loop
    const tail = pcTrace.slice(-50);
    log(`Last 50 trace PCs: ${tail.map(p => hex(p)).join(' ')}`);
  }

  // Write report
  writeReport(transcript, {
    bootResult,
    postBootPointers,
    memInitReturnHit,
    memInitSteps,
    memInitTermination,
    postMemInitPointers,
    coormonTermination,
    coormonSteps,
    coormonReturnHit,
    coormonMissingBlock,
    coormonFinalPc,
    seenPcs,
    pcCounts,
    routineHits,
    uniquePcList,
    pcTrace,
    sortedPcs,
    postCoormonPointers,
  });

  log(`\nReport written to ${REPORT_PATH}`);
  process.exitCode = 0;
}

function writeReport(transcript, data) {
  const lines = [];
  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString().slice(0, 10));
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Trace the OS event loop (CoorMon at 0x08C331) with a simulated ENTER keypress to map how keystrokes flow from GetCSC through key dispatch.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Boot/init sequence from `probe-phase25z-full-pipeline.mjs`');
  lines.push('- Timer IRQ disabled with `createPeripheralBus({ timerInterrupt: false })`');
  lines.push(`- MEM_INIT entry: \`${hex(MEMINIT_ENTRY)}\``);
  lines.push(`- CoorMon entry: \`${hex(COORMON_ENTRY)}\``);
  lines.push('- Keyboard seeded: keyMatrix[1]=0xFE (ENTER pressed), kbdScanCode=0x09, kbdFlags bits 3+4 set');
  lines.push(`- CoorMon budget: ${COORMON_BUDGET} steps, maxLoopIterations=${MAX_LOOP_ITER}`);
  lines.push('');

  if (!data) {
    lines.push('## Result');
    lines.push('');
    lines.push('MEM_INIT did not return. CoorMon was not reached.');
    lines.push('');
    lines.push('## Console Output');
    lines.push('');
    lines.push('```text');
    lines.push(...transcript);
    lines.push('```');
    fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
    return;
  }

  lines.push('## Stage 1: MEM_INIT');
  lines.push('');
  lines.push(`- Returned: ${data.memInitReturnHit}`);
  lines.push(`- Termination: ${data.memInitTermination}`);
  lines.push(`- Steps: ${data.memInitSteps}`);
  lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(data.postMemInitPointers)}`);
  lines.push('');

  lines.push('## Stage 2: CoorMon Event Loop Trace');
  lines.push('');
  lines.push(`- Termination: ${data.coormonTermination}`);
  lines.push(`- Steps: ${data.coormonSteps}`);
  lines.push(`- Final PC: \`${hex(data.coormonFinalPc)}\``);
  lines.push(`- Returned to sentinel: ${data.coormonReturnHit}`);
  lines.push(`- Hit missing block: ${data.coormonMissingBlock}`);
  lines.push(`- Unique PCs visited: ${data.seenPcs.size}`);
  lines.push(`- Total trace entries: ${data.pcTrace.length}`);
  lines.push('');

  lines.push('### Known Routine Hits');
  lines.push('');
  lines.push(`| Routine | Hit Count | Unique PCs |`);
  lines.push(`|---------|-----------|------------|`);
  const checkRoutines = ['GetCSC', 'ParseInp', 'ScancodeTable', 'JT_Slots', 'CoorMon', 'BootArea', 'ISR_area'];
  for (const name of checkRoutines) {
    const hits = data.routineHits.get(name);
    if (hits) {
      const uniqueHitPcs = [...new Set(hits.map(h => h.pc))];
      lines.push(`| ${name} | ${hits.length} | ${uniqueHitPcs.map(p => hex(p)).join(', ')} |`);
    } else {
      lines.push(`| ${name} | 0 | - |`);
    }
  }
  lines.push('');

  lines.push('### Specific Address Checks');
  lines.push('');
  lines.push(`- GetCSC (\`${hex(GETCSC_ADDR)}\`): visited=${data.seenPcs.has(GETCSC_ADDR)}, count=${data.pcCounts.get(GETCSC_ADDR) || 0}`);
  lines.push(`- ParseInp (\`${hex(PARSEINP_ADDR)}\`): visited=${data.seenPcs.has(PARSEINP_ADDR)}, count=${data.pcCounts.get(PARSEINP_ADDR) || 0}`);
  lines.push(`- CoorMon entry (\`${hex(COORMON_ENTRY)}\`): count=${data.pcCounts.get(COORMON_ENTRY) || 0}`);
  lines.push('');

  lines.push('### Top 20 Most-Visited PCs');
  lines.push('');
  lines.push('| PC | Count | Routine |');
  lines.push('|----|-------|---------|');
  for (let i = 0; i < Math.min(20, data.sortedPcs.length); i++) {
    const [pc, count] = data.sortedPcs[i];
    const routine = classifyPc(pc) || '';
    lines.push(`| \`${hex(pc)}\` | ${count} | ${routine} |`);
  }
  lines.push('');

  lines.push('### First 100 Unique PCs (Execution Flow)');
  lines.push('');
  const first100 = data.uniquePcList.slice(0, 100);
  for (let i = 0; i < first100.length; i++) {
    const pc = first100[i];
    const routine = classifyPc(pc) || '';
    lines.push(`${i}. \`${hex(pc)}\`${routine ? ` (${routine})` : ''}`);
  }
  lines.push('');

  lines.push('### Loop Pattern (Last 50 Trace PCs)');
  lines.push('');
  if (data.pcTrace.length >= 10) {
    const tail = data.pcTrace.slice(-50);
    lines.push('```');
    // Format in rows of 10
    for (let i = 0; i < tail.length; i += 10) {
      lines.push(tail.slice(i, i + 10).map(p => hex(p)).join(' '));
    }
    lines.push('```');
  } else {
    lines.push('(trace too short)');
  }
  lines.push('');

  lines.push('## Analysis');
  lines.push('');
  const getCSCVisited = data.seenPcs.has(GETCSC_ADDR);
  const parseInpVisited = data.seenPcs.has(PARSEINP_ADDR);
  if (getCSCVisited && parseInpVisited) {
    lines.push('CoorMon reached both GetCSC and ParseInp. The keypress was dispatched through the normal event pipeline.');
  } else if (getCSCVisited) {
    lines.push('CoorMon reached GetCSC but NOT ParseInp. The key scan was performed but dispatch did not reach the parser.');
  } else if (data.coormonTermination === 'missing_block') {
    lines.push(`CoorMon hit a missing block at \`${hex(data.coormonFinalPc)}\`. This address needs to be lifted.`);
  } else if (data.coormonTermination === 'max_loop_iterations') {
    lines.push('CoorMon hit maxLoopIterations. It is likely spinning in a polling loop waiting for some condition.');
  } else {
    lines.push('CoorMon did not reach GetCSC or ParseInp within the step budget.');
  }
  lines.push('');

  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  writeReport(String(message).split(/\r?\n/), null);
  process.exitCode = 1;
}
