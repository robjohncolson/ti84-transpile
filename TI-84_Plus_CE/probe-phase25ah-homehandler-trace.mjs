#!/usr/bin/env node

/**
 * Phase 25AH — Home-screen handler (0x058241) runtime trace
 *
 * Calls the home-screen handler directly after MEM_INIT seeding,
 * records the first 500 unique PCs visited, and checks whether
 * ParseInp or other known entry points appear in the call chain.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ah-homehandler-trace-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xd1a87e;
const FAKE_RET = 0x7ffffe;
const MEMINIT_RET = 0x7ffff6;

// Entry points
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEMINIT_ENTRY = 0x09dee0;
const HOME_HANDLER_ENTRY = 0x058241;

// Known entry points to detect
const KNOWN_ENTRY_POINTS = {
  0x099914: 'ParseInp',
  0x08238a: 'CreateReal',
  0x09ac77: 'RclVarSym',
  0x08383d: 'ChkFindSym',
  0x07c77f: 'FPAdd',
  0x061db2: 'JError',
  0x03fa09: 'GetCSC',
  0x0a1b5b: 'PutC',
  0x0a1799: 'PutMap',
};

// RAM addresses
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const CXMAIN_ADDR = 0xd007ca;
const CXCURAPP_ADDR = 0xd007e0;
const KBDKEY_ADDR = 0xd0052c;
const KBDGETKY_ADDR = 0xd0052d;
const KBDSCR_ADDR = 0xd00587;
const USERMEM_ADDR = 0xd1a881;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;

// Budgets
const MEMINIT_BUDGET = 100000;
const HOME_HANDLER_BUDGET = 50000;
const MAX_UNIQUE_PCS = 500;
const MAX_LOOP_ITER = 8192;

// ── Helpers ────────────────────────────────────────────────────────────

const hex = (v, w = 6) => v === undefined || v === null ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).padStart(w, '0')}`;
const read24 = (m, a) => ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;
function write24(m, a, v) { m[a] = v & 0xff; m[a + 1] = (v >>> 8) & 0xff; m[a + 2] = (v >>> 16) & 0xff; }
function hexBytes(m, a, n) { const out = []; for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).padStart(2, '0')); return out.join(' '); }

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const transcript = [];
  const log = (line = '') => { transcript.push(String(line)); console.log(String(line)); };

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  const cpu = executor.cpu;

  log('=== Phase 25AH: Home-Screen Handler (0x058241) Runtime Trace ===');
  log('');

  // ── Step 1: Cold boot ──
  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  // ── Step 2: MEM_INIT ──
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let memInitOk = false;
  let memInitTermination = 'unknown';
  const checkMemInitRet = (pc) => {
    if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
  };
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { checkMemInitRet(pc); },
      onMissingBlock(pc) { checkMemInitRet(pc); },
    });
    memInitTermination = 'budget_exhausted';
  } catch (e) {
    if (e?.message === '__RET__') { memInitOk = true; memInitTermination = 'return_hit'; }
    else throw e;
  }
  log(`MEM_INIT: ${memInitTermination}`);
  if (!memInitOk) {
    log('ERROR: MEM_INIT did not return. Aborting.');
    writeReport(transcript);
    return;
  }

  // ── Step 3: Seed OS state ──
  cpu._iy = 0xd00080;

  // cxMain = 0x058241
  write24(mem, CXMAIN_ADDR, HOME_HANDLER_ENTRY);
  log(`Seeded cxMain @ ${hex(CXMAIN_ADDR)} = ${hex(read24(mem, CXMAIN_ADDR))}`);

  // cxCurApp = 0x40
  mem[CXCURAPP_ADDR] = 0x40;
  log(`Seeded cxCurApp @ ${hex(CXCURAPP_ADDR)} = ${hex(mem[CXCURAPP_ADDR], 2)}`);

  // Keyboard: ENTER key
  // ENTER is group 6 bit 0 -> keyMatrix index = 7-6 = 1, bit 0
  // Write 0xFE (bit 0 low = pressed) to keyMatrix[1]
  // kbdKey = 0x05 (ENTER scan code), kbdGetKy = 0x05, kbdSCR = 0x09
  mem[KBDKEY_ADDR] = 0x05;
  mem[KBDGETKY_ADDR] = 0x05;
  mem[KBDSCR_ADDR] = 0x09;
  log(`Seeded keyboard: kbdKey=${hex(mem[KBDKEY_ADDR], 2)} kbdGetKy=${hex(mem[KBDGETKY_ADDR], 2)} kbdSCR=${hex(mem[KBDSCR_ADDR], 2)}`);

  // Tokenized "2+3" at userMem
  const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  log(`Seeded tokens at ${hex(USERMEM_ADDR)}: [${hexBytes(mem, USERMEM_ADDR, INPUT_TOKENS.length)}]`);

  // begPC/curPC/endPC
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  log(`Seeded begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);

  // Set up error frame
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, errFrameBase, 0x7ffffa);  // ERR_CATCH_ADDR
  write24(mem, errFrameBase + 3, 0);     // prev = 0
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
  log(`Seeded error frame at ${hex(errFrameBase)}`);

  // FPS/OPS pointers
  log(`FPSbase=${hex(read24(mem, FPSBASE_ADDR))} FPS=${hex(read24(mem, FPS_ADDR))} OPBase=${hex(read24(mem, OPBASE_ADDR))} OPS=${hex(read24(mem, OPS_ADDR))}`);
  log('');

  // ── Step 4: Call home-screen handler ──
  prepareCallState(cpu, mem);

  // Push FAKE_RET as return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu.a = 0x05;  // scan code for ENTER in A register (CoorMon passes key in A)

  log(`Calling home-screen handler at ${hex(HOME_HANDLER_ENTRY)}`);
  log(`  SP=${hex(cpu.sp)} return=${hex(read24(mem, cpu.sp))}`);
  log('');

  // Track PCs
  const uniquePcSet = new Set();
  const uniquePcOrder = [];
  const knownHits = new Map();  // entryPoint -> step#
  let totalSteps = 0;
  let termination = 'unknown';
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let missingBlock = false;

  try {
    const res = executor.runFrom(HOME_HANDLER_ENTRY, 'adl', {
      maxSteps: HOME_HANDLER_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        totalSteps = Math.max(totalSteps, (step || 0) + 1);

        if (!uniquePcSet.has(norm) && uniquePcSet.size < MAX_UNIQUE_PCS) {
          uniquePcSet.add(norm);
          uniquePcOrder.push({ pc: norm, step: step || 0 });
        }

        // Check known entry points
        if (KNOWN_ENTRY_POINTS[norm] && !knownHits.has(norm)) {
          knownHits.set(norm, step || 0);
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === 0x7ffffa) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        missingBlock = true;
        finalPc = norm;
        totalSteps = Math.max(totalSteps, (step || 0) + 1);

        if (!uniquePcSet.has(norm) && uniquePcSet.size < MAX_UNIQUE_PCS) {
          uniquePcSet.add(norm);
          uniquePcOrder.push({ pc: norm, step: step || 0 });
        }
      },
    });
    finalPc = res.lastPc ?? finalPc;
    termination = res.termination ?? termination;
    totalSteps = Math.max(totalSteps, res.steps ?? 0);
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; termination = 'return_hit'; finalPc = FAKE_RET; }
    else if (e?.message === '__ERR__') { errCaught = true; termination = 'err_caught'; finalPc = 0x7ffffa; }
    else throw e;
  }

  // ── Results ──
  log('=== Results ===');
  log('');
  log(`Total steps: ${totalSteps}`);
  log(`Unique PCs collected: ${uniquePcOrder.length}`);
  log(`Termination: ${termination}`);
  log(`Final PC: ${hex(finalPc)}`);
  log(`Return hit: ${returnHit}`);
  log(`Error caught: ${errCaught}`);
  log(`Missing block encountered: ${missingBlock}`);
  log(`errNo: ${hex(mem[ERR_NO_ADDR], 2)}`);
  log('');

  // Known entry point hits
  log('=== Known Entry Point Hits ===');
  if (knownHits.size === 0) {
    log('  (none detected in first 50,000 steps)');
  } else {
    for (const [addr, step] of [...knownHits.entries()].sort((a, b) => a[1] - b[1])) {
      log(`  ${hex(addr)} = ${KNOWN_ENTRY_POINTS[addr]} (first seen at step ${step})`);
    }
  }
  log('');

  // ParseInp specific
  const parseinpReached = knownHits.has(0x099914);
  log(`ParseInp (0x099914) reached: ${parseinpReached}`);
  if (parseinpReached) {
    log(`  First seen at step: ${knownHits.get(0x099914)}`);
  }
  log('');

  // First 100 unique PCs (annotated)
  log('=== First 100 Unique PCs (annotated) ===');
  const showCount = Math.min(100, uniquePcOrder.length);
  for (let i = 0; i < showCount; i++) {
    const entry = uniquePcOrder[i];
    const name = KNOWN_ENTRY_POINTS[entry.pc] || '';
    const annotation = name ? ` <-- ${name}` : '';
    log(`  [${String(i).padStart(3)}] ${hex(entry.pc)} (step ${entry.step})${annotation}`);
  }
  if (uniquePcOrder.length > 100) {
    log(`  ... (${uniquePcOrder.length - 100} more unique PCs)`);
  }
  log('');

  // Post-run state
  log('=== Post-Run State ===');
  log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  log(`  begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);
  log(`  errNo=${hex(mem[ERR_NO_ADDR], 2)} errSP=${hex(read24(mem, ERR_SP_ADDR))}`);
  log(`  FPSbase=${hex(read24(mem, FPSBASE_ADDR))} FPS=${hex(read24(mem, FPS_ADDR))}`);
  log(`  OPBase=${hex(read24(mem, OPBASE_ADDR))} OPS=${hex(read24(mem, OPS_ADDR))}`);
  log(`  SP=${hex(cpu.sp)} A=${hex(cpu.a, 2)} F=${hex(cpu.f, 2)} HL=${hex(cpu._hl)} DE=${hex(cpu._de)}`);

  writeReport(transcript);
}

function writeReport(transcript) {
  const lines = [
    '# Phase 25AH - Home-Screen Handler (0x058241) Runtime Trace',
    '',
    '## Date',
    '',
    new Date().toISOString().slice(0, 10),
    '',
    '## Purpose',
    '',
    'Trace the home-screen handler (cxMain=0x058241) to find the call chain',
    'from CoorMon keystroke dispatch down to ParseInp (0x099914) and other',
    'known OS routines. The handler is called directly after MEM_INIT with',
    'ENTER key seeded and tokenized "2+3" in userMem.',
    '',
    '## Console Output',
    '',
    '```text',
    ...transcript,
    '```',
  ];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  const lines = [
    '# Phase 25AH - Home-Screen Handler Trace FAILED',
    '',
    '```text',
    String(error?.stack || error),
    '```',
  ];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  process.exitCode = 1;
}
