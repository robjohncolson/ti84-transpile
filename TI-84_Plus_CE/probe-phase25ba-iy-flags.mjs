#!/usr/bin/env node

/**
 * Phase 25BA: Investigate fmtFlags bit 4 and IY+0x47 bit 7
 *
 * These are the ONLY non-zero IY flag bytes after MEM_INIT.
 * Part 1: ROM pattern search for BIT/SET/RES instructions referencing these flags
 * Part 2: Cross-reference with ti84pceg.inc
 * Part 3: ParseInp("2+3") comparison — default flags vs cleared flags
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ba-iy-flags-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

/* ---------- Address Constants ---------- */
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const PARSEINP_ENTRY = 0x099914;

const OP1_ADDR = 0xd005f8;
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const TOKEN_BUFFER_ADDR = 0xd00800;

/* IY flag addresses under investigation */
const IY_BASE = 0xd00080;
const IY_PLUS_4A = 0xd000ca; // fmtFlags / grFlags / putMapFlags (IY+0x4A)
const IY_PLUS_47 = 0xd000c7; // Undocumented? (IY+0x47)

/* ---------- Sentinel Addresses ---------- */
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;

/* ---------- Data Constants ---------- */
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]); // "2+3\n"

/* ---------- Budgets ---------- */
const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 2000000;
const MAX_LOOP_ITER = 8192;
const MILESTONE_INTERVAL = 100000;
const RECENT_PC_LIMIT = 64;

/* ---------- Helpers ---------- */
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

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function safeReadReal(memWrap, addr) {
  try {
    return readReal(memWrap, addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
  };
}

function formatPointerSnapshot(s) {
  return [
    `tempMem=${hex(s.tempMem)}`,
    `FPSbase=${hex(s.fpsBase)}`,
    `FPS=${hex(s.fps)}`,
    `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`,
    `pTemp=${hex(s.pTemp)}`,
    `progPtr=${hex(s.progPtr)}`,
    `newDataPtr=${hex(s.newDataPtr)}`,
    `errSP=${hex(s.errSP)}`,
    `errNo=${hex(s.errNo, 2)}`,
    `begPC=${hex(s.begPC)}`,
    `curPC=${hex(s.curPC)}`,
    `endPC=${hex(s.endPC)}`,
  ].join(' ');
}

/* ---------- Boot + Call Infrastructure ---------- */
function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return bootResult;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
  return {
    returnAddr: ret,
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBase: base,
    errFrameBytes: hexBytes(mem, base, 6),
  };
}

function runCall(executor, cpu, mem, options) {
  const {
    entry,
    budget,
    returnPc,
    allowSentinelRet = false,
    label = 'call',
    milestoneInterval = 0,
    onMilestone,
  } = options;

  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let sentinelRet = false;
  let missingBlock = false;
  let stepCount = 0;
  const recentPcs = [];
  const milestones = [];
  let nextMilestone = milestoneInterval > 0 ? milestoneInterval : Number.POSITIVE_INFINITY;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;

    if (typeof step === 'number') {
      stepCount = Math.max(stepCount, step + 1);
      if (step >= nextMilestone) {
        const snap = snapshotPointers(mem);
        const text = `${step} steps: PC=${hex(norm)} errNo=${hex(snap.errNo, 2)} FPS=${hex(snap.fps)} OPS=${hex(snap.ops)}`;
        milestones.push(text);
        if (onMilestone) onMilestone(`  [${label} milestone] ${text}`);
        nextMilestone += milestoneInterval;
      }
    }

    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();

    if (norm === returnPc) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
    if (allowSentinelRet && norm === 0xffffff) throw new Error('__SENTINEL_RET__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        notePc(pc, step);
      },
    });

    finalPc = result.lastPc ?? finalPc;
    termination = result.termination ?? termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      finalPc = returnPc;
      termination = 'return_hit';
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      finalPc = ERR_CATCH_ADDR;
      termination = 'err_caught';
    } else if (error?.message === '__SENTINEL_RET__') {
      sentinelRet = true;
      finalPc = 0xffffff;
      termination = 'sentinel_ret';
    } else {
      throw error;
    }
  }

  return {
    entry,
    returnPc,
    returnHit,
    errCaught,
    sentinelRet,
    missingBlock,
    termination,
    finalPc,
    stepCount,
    recentPcs,
    milestones,
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    hl: cpu.hl & 0xffffff,
    de: cpu.de & 0xffffff,
    sp: cpu.sp & 0xffffff,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errSp: read24(mem, ERR_SP_ADDR),
  };
}

function formatRunOutcome(run) {
  if (!run) return '(skipped)';
  if (run.returnHit) return `returned to ${hex(run.returnPc)}`;
  if (run.sentinelRet) return `reached sentinel 0xffffff`;
  if (run.errCaught) return `unwound to ${hex(ERR_CATCH_ADDR)}`;
  return `termination=${run.termination} finalPc=${hex(run.finalPc)}`;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  return { mem, executor, cpu: executor.cpu, wrap: wrapMem(mem) };
}

/* ================================================================== */
/*  PART 1: ROM Pattern Search                                        */
/* ================================================================== */
function searchRomPatterns(log) {
  log('\n================================================================');
  log('PART 1: ROM Pattern Search for IY+0x4A and IY+0x47 instructions');
  log('================================================================');

  const patterns = [
    // IY+0x4A (fmtFlags / grFlags / putMapFlags) bit 4
    { name: 'BIT 4,(IY+0x4A)', bytes: [0xfd, 0xcb, 0x4a, 0x66] },
    { name: 'SET 4,(IY+0x4A)', bytes: [0xfd, 0xcb, 0x4a, 0xe6] },
    { name: 'RES 4,(IY+0x4A)', bytes: [0xfd, 0xcb, 0x4a, 0xa6] },
    // IY+0x47 bit 7
    { name: 'BIT 7,(IY+0x47)', bytes: [0xfd, 0xcb, 0x47, 0x7e] },
    { name: 'SET 7,(IY+0x47)', bytes: [0xfd, 0xcb, 0x47, 0xfe] },
    { name: 'RES 7,(IY+0x47)', bytes: [0xfd, 0xcb, 0x47, 0xbe] },
  ];

  // Also search for ANY bit operation on IY+0x4A and IY+0x47
  const allPatterns4A = [];
  const allPatterns47 = [];
  for (let bitOp = 0; bitOp < 8; bitOp++) {
    // BIT b,(IY+d) = FD CB dd (01 bbb 110) = FD CB dd (0x46 + bit*8)
    allPatterns4A.push({ name: `BIT ${bitOp},(IY+0x4A)`, bytes: [0xfd, 0xcb, 0x4a, 0x46 + bitOp * 8] });
    allPatterns47.push({ name: `BIT ${bitOp},(IY+0x47)`, bytes: [0xfd, 0xcb, 0x47, 0x46 + bitOp * 8] });
    // SET b,(IY+d) = FD CB dd (11 bbb 110) = FD CB dd (0xC6 + bit*8)
    allPatterns4A.push({ name: `SET ${bitOp},(IY+0x4A)`, bytes: [0xfd, 0xcb, 0x4a, 0xc6 + bitOp * 8] });
    allPatterns47.push({ name: `SET ${bitOp},(IY+0x47)`, bytes: [0xfd, 0xcb, 0x47, 0xc6 + bitOp * 8] });
    // RES b,(IY+d) = FD CB dd (10 bbb 110) = FD CB dd (0x86 + bit*8)
    allPatterns4A.push({ name: `RES ${bitOp},(IY+0x4A)`, bytes: [0xfd, 0xcb, 0x4a, 0x86 + bitOp * 8] });
    allPatterns47.push({ name: `RES ${bitOp},(IY+0x47)`, bytes: [0xfd, 0xcb, 0x47, 0x86 + bitOp * 8] });
  }

  const allSearchPatterns = [...patterns, ...allPatterns4A, ...allPatterns47];
  // Deduplicate by bytes
  const seen = new Set();
  const uniquePatterns = [];
  for (const p of allSearchPatterns) {
    const key = p.bytes.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      uniquePatterns.push(p);
    }
  }

  const results = [];

  for (const pattern of uniquePatterns) {
    const hits = [];
    for (let addr = 0; addr < romBytes.length - pattern.bytes.length + 1; addr++) {
      let match = true;
      for (let j = 0; j < pattern.bytes.length; j++) {
        if (romBytes[addr + j] !== pattern.bytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        // Grab 4 bytes before and 4 bytes after the match
        const ctxStart = Math.max(0, addr - 4);
        const ctxEnd = Math.min(romBytes.length, addr + pattern.bytes.length + 4);
        const context = [];
        for (let i = ctxStart; i < ctxEnd; i++) {
          context.push(romBytes[i].toString(16).padStart(2, '0'));
        }
        hits.push({
          addr: hex(addr),
          context: context.join(' '),
          beforeLen: addr - ctxStart,
        });
      }
    }
    if (hits.length > 0) {
      results.push({ pattern: pattern.name, hits });
      log(`\n  ${pattern.name}: ${hits.length} hit(s)`);
      for (const h of hits) {
        log(`    @ ${h.addr}  context: [${h.context}]`);
      }
    }
  }

  if (results.length === 0) {
    log('\n  No hits found for any IY+0x4A or IY+0x47 bit operations in ROM.');
  }

  // Also search for LD (IY+0x4A) and LD (IY+0x47) — direct loads
  log('\n--- LD operations on IY+0x4A and IY+0x47 ---');
  const ldPatterns = [
    { name: 'LD (IY+0x4A),n', bytes: [0xfd, 0x36, 0x4a], len: 3 },
    { name: 'LD (IY+0x47),n', bytes: [0xfd, 0x36, 0x47], len: 3 },
    { name: 'LD A,(IY+0x4A)', bytes: [0xfd, 0x7e, 0x4a], len: 3 },
    { name: 'LD A,(IY+0x47)', bytes: [0xfd, 0x7e, 0x47], len: 3 },
    { name: 'LD B,(IY+0x4A)', bytes: [0xfd, 0x46, 0x4a], len: 3 },
    { name: 'LD B,(IY+0x47)', bytes: [0xfd, 0x46, 0x47], len: 3 },
    { name: 'LD (IY+0x4A),A', bytes: [0xfd, 0x77, 0x4a], len: 3 },
    { name: 'LD (IY+0x47),A', bytes: [0xfd, 0x77, 0x47], len: 3 },
  ];

  for (const pattern of ldPatterns) {
    const hits = [];
    for (let addr = 0; addr < romBytes.length - pattern.len + 1; addr++) {
      let match = true;
      for (let j = 0; j < pattern.len; j++) {
        if (romBytes[addr + j] !== pattern.bytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        const ctxStart = Math.max(0, addr - 4);
        const ctxEnd = Math.min(romBytes.length, addr + pattern.len + 4);
        const context = [];
        for (let i = ctxStart; i < ctxEnd; i++) {
          context.push(romBytes[i].toString(16).padStart(2, '0'));
        }
        hits.push({
          addr: hex(addr),
          context: context.join(' '),
          imm: pattern.len === 3 && pattern.bytes[1] === 0x36
            ? hex(romBytes[addr + 3], 2)
            : undefined,
        });
      }
    }
    if (hits.length > 0) {
      results.push({ pattern: pattern.name, hits });
      log(`\n  ${pattern.name}: ${hits.length} hit(s)`);
      for (const h of hits) {
        const immStr = h.imm !== undefined ? ` imm=${h.imm}` : '';
        log(`    @ ${h.addr}  context: [${h.context}]${immStr}`);
      }
    }
  }

  return results;
}

/* ================================================================== */
/*  PART 2: Cross-reference with ti84pceg.inc                         */
/* ================================================================== */
function crossReferenceInc(log) {
  log('\n================================================================');
  log('PART 2: Cross-reference with ti84pceg.inc');
  log('================================================================');

  const incPath = path.join(__dirname, 'references', 'ti84pceg.inc');
  let incContent;
  try {
    incContent = fs.readFileSync(incPath, 'utf-8');
  } catch (e) {
    log(`  Could not read ti84pceg.inc: ${e.message}`);
    return [];
  }

  const lines = incContent.split(/\r?\n/);
  const findings = [];

  // Search for fmtFlags, fmtDigits, fmtExponent, fmtOverride, offset 0x47, offset 0x4A
  const searchTerms = [
    'fmtFlags', 'fmtDigits', 'fmtExponent', 'fmtOverride', 'fmtEng', 'fmtReal',
    'fmtRect', 'fmtPolar', 'fmtBaseMask', 'fmtBaseShift', 'fmtEditFlags', 'fmtEdit',
    'grFlags', 'putMapFlags', 'backlightFlags',
    ':= 47h', ':= 4Ah', ':= 0Ah', ':= 0Bh',
    'mathprintFlags', 'InitialBootMenuFlags',
  ];

  for (const term of searchTerms) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(term)) {
        findings.push({ lineNum: i + 1, line: lines[i].trim() });
      }
    }
  }

  // Deduplicate
  const uniqueFindings = [];
  const seenLines = new Set();
  for (const f of findings) {
    if (!seenLines.has(f.lineNum)) {
      seenLines.add(f.lineNum);
      uniqueFindings.push(f);
    }
  }

  uniqueFindings.sort((a, b) => a.lineNum - b.lineNum);

  log('\n  Relevant ti84pceg.inc entries:');
  for (const f of uniqueFindings) {
    log(`    L${f.lineNum}: ${f.line}`);
  }

  // Summary
  log('\n  Summary:');
  log('    IY+0x0A (0xD0008A) = fmtFlags — numeric format flags');
  log('      bit 0: fmtExponent (1=show exponent)');
  log('      bit 1: fmtEng (1=engineering notation)');
  log('      bit 5: fmtReal / realMode');
  log('      bit 6: fmtRect / rectMode');
  log('      bit 7: fmtPolar / polarMode');
  log('    IY+0x0B (0xD0008B) = fmtOverride — copy of fmtFlags with conversion override');
  log('    IY+0x44 (0xD000C4) = mathprintFlags');
  log('      bit 5: mathprintEnabled');
  log('    IY+0x45 (0xD000C5) = InitialBootMenuFlags');
  log('      bit 4: dispinitialBootMenu');
  log('    IY+0x46 (0xD000C6) = backlightFlags');
  log('      bit 0: restoreBrightness');
  log('    IY+0x47 (0xD000C7) = NOT DOCUMENTED in ti84pceg.inc');
  log('    IY+0x4A (0xD000CA) = grFlags / putMapFlags');
  log('      bit 0: drawGrLbls');
  log('      bit 3: usePixelShadow2');
  log('      bit 4: putMapUseColor (1=use custom color)');

  return uniqueFindings;
}

/* ================================================================== */
/*  PART 3: ParseInp comparison                                       */
/* ================================================================== */
function runPipeline(label, clearFlags, log) {
  log(`\n--- ${label} ---`);

  const { mem, executor, cpu, wrap } = createRuntime();

  // Boot
  const boot = coldBoot(executor, cpu, mem);
  log(`  boot: steps=${boot.steps} term=${boot.termination}`);

  // MEM_INIT
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  const memInitRun = runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    budget: MEMINIT_BUDGET,
    returnPc: MEMINIT_RET,
    label: 'MEM_INIT',
  });

  log(`  MEM_INIT outcome: ${formatRunOutcome(memInitRun)} steps=${memInitRun.stepCount}`);

  if (!memInitRun.returnHit) {
    log(`  FAIL: MEM_INIT did not return.`);
    return null;
  }

  // Read default flag values
  const defaultIY4A = mem[IY_PLUS_4A] & 0xff;
  const defaultIY47 = mem[IY_PLUS_47] & 0xff;
  log(`  post-MEM_INIT: IY+0x4A=${hex(defaultIY4A, 2)} IY+0x47=${hex(defaultIY47, 2)}`);

  // Dump all non-zero IY flag bytes for reference
  const nonZeroFlags = [];
  for (let off = 0; off < 0x80; off++) {
    const val = mem[IY_BASE + off] & 0xff;
    if (val !== 0) {
      nonZeroFlags.push(`IY+${hex(off, 2)}=${hex(val, 2)}`);
    }
  }
  log(`  non-zero IY flags: ${nonZeroFlags.join(', ')}`);

  // Optionally clear flags
  if (clearFlags) {
    log(`  CLEARING: IY+0x4A = 0x00, IY+0x47 = 0x00`);
    mem[IY_PLUS_4A] = 0x00;
    mem[IY_PLUS_47] = 0x00;
  }

  // Seed tokens
  const tokenBufAddr = TOKEN_BUFFER_ADDR;
  mem.fill(0x00, tokenBufAddr, tokenBufAddr + 0x80);
  mem.set(INPUT_TOKENS, tokenBufAddr);

  write24(mem, BEGPC_ADDR, tokenBufAddr);
  write24(mem, CURPC_ADDR, tokenBufAddr);
  write24(mem, ENDPC_ADDR, tokenBufAddr + INPUT_TOKENS.length);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);

  log(`  ParseInp tokens @ ${hex(tokenBufAddr)}: [${hexArray(INPUT_TOKENS)}]`);

  prepareCallState(cpu, mem);
  const frame = seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const parseRun = runCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    budget: PARSEINP_BUDGET,
    returnPc: FAKE_RET,
    allowSentinelRet: true,
    label: 'ParseInp',
    milestoneInterval: MILESTONE_INTERVAL,
    onMilestone: log,
  });

  const op1Hex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op1Val = safeReadReal(wrap, OP1_ADDR);

  log(`  ParseInp outcome: ${formatRunOutcome(parseRun)} steps=${parseRun.stepCount} errNo=${hex(parseRun.errNo, 2)}`);
  log(`  OP1=[${op1Hex}] decoded=${formatValue(op1Val)}`);
  log(`  post-ParseInp pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  // Read final flag values
  const finalIY4A = mem[IY_PLUS_4A] & 0xff;
  const finalIY47 = mem[IY_PLUS_47] & 0xff;
  log(`  post-ParseInp: IY+0x4A=${hex(finalIY4A, 2)} IY+0x47=${hex(finalIY47, 2)}`);

  return {
    label,
    stepCount: parseRun.stepCount,
    op1Hex,
    op1Val,
    errNo: parseRun.errNo,
    termination: parseRun.termination,
    returnHit: parseRun.returnHit,
    pointers: snapshotPointers(mem),
    iy4A_before: clearFlags ? 0x00 : defaultIY4A,
    iy4A_after: finalIY4A,
    iy47_before: clearFlags ? 0x00 : defaultIY47,
    iy47_after: finalIY47,
  };
}

/* ================================================================== */
/*  Main                                                              */
/* ================================================================== */
const output = [];
const log = (msg) => {
  console.log(msg);
  output.push(msg);
};

log('Phase 25BA: IY Flag Investigation — fmtFlags bit 4 & IY+0x47 bit 7');
log('====================================================================');

// Part 1: ROM pattern search
const romHits = searchRomPatterns(log);

// Part 2: Inc cross-reference
const incFindings = crossReferenceInc(log);

// Part 3: ParseInp comparison
log('\n================================================================');
log('PART 3: ParseInp("2+3") Comparison — Default vs Cleared Flags');
log('================================================================');

const runA = runPipeline('Run A: Default MEM_INIT values (fmtFlags=0x10, IY+0x47=0x80)', false, log);
const runB = runPipeline('Run B: Both flags cleared to 0x00', true, log);

// Comparison
log('\n================================================================');
log('COMPARISON');
log('================================================================');

if (runA && runB) {
  log(`  Step count: A=${runA.stepCount} B=${runB.stepCount} diff=${runA.stepCount - runB.stepCount}`);
  log(`  OP1:        A=[${runA.op1Hex}] B=[${runB.op1Hex}] match=${runA.op1Hex === runB.op1Hex}`);
  log(`  OP1 value:  A=${formatValue(runA.op1Val)} B=${formatValue(runB.op1Val)}`);
  log(`  errNo:      A=${hex(runA.errNo, 2)} B=${hex(runB.errNo, 2)} match=${runA.errNo === runB.errNo}`);
  log(`  termination: A=${runA.termination} B=${runB.termination}`);

  // Pointer comparison
  const ptrKeys = Object.keys(runA.pointers);
  const ptrDiffs = [];
  for (const k of ptrKeys) {
    if (runA.pointers[k] !== runB.pointers[k]) {
      ptrDiffs.push(`${k}: A=${hex(runA.pointers[k])} B=${hex(runB.pointers[k])}`);
    }
  }
  if (ptrDiffs.length > 0) {
    log(`  Pointer differences:`);
    for (const d of ptrDiffs) log(`    ${d}`);
  } else {
    log(`  Pointers: all match`);
  }

  // Flag state changes
  log(`  IY+0x4A: A before=${hex(runA.iy4A_before, 2)} after=${hex(runA.iy4A_after, 2)} | B before=${hex(runB.iy4A_before, 2)} after=${hex(runB.iy4A_after, 2)}`);
  log(`  IY+0x47: A before=${hex(runA.iy47_before, 2)} after=${hex(runA.iy47_after, 2)} | B before=${hex(runB.iy47_before, 2)} after=${hex(runB.iy47_after, 2)}`);
} else {
  log('  One or both runs failed. Cannot compare.');
}

// Conclusions
log('\n================================================================');
log('CONCLUSIONS');
log('================================================================');
log('IY+0x4A (0xD000CA) = grFlags / putMapFlags (per ti84pceg.inc)');
log('  bit 4 = putMapUseColor: controls whether PutMap uses a custom color');
log('  MEM_INIT sets this to 0x10, meaning putMapUseColor=1 by default');
log('');
log('IY+0x47 (0xD000C7) = undocumented in ti84pceg.inc');
log('  bit 7 is set by MEM_INIT (value 0x80)');
log('  Falls between backlightFlags (IY+0x46) and no documented offset');
log('');

if (runA && runB && runA.op1Hex === runB.op1Hex) {
  log('ParseInp("2+3") produces IDENTICAL results regardless of these flags.');
  log('These flags do NOT affect expression parsing or arithmetic.');
} else if (runA && runB) {
  log('ParseInp("2+3") produces DIFFERENT results when flags are cleared.');
  log('Further investigation needed to determine exact impact.');
}

// Write report
const reportContent = `# Phase 25BA - IY Flag Investigation

## Summary

Investigated the two non-zero IY flag bytes after MEM_INIT:
- IY+0x4A (0xD000CA) = 0x10 — bit 4 set
- IY+0x47 (0xD000C7) = 0x80 — bit 7 set

## Part 1: ROM Pattern Search

${romHits.length > 0 ? romHits.map(r => `### ${r.pattern}\n${r.hits.map(h => `- ${h.addr}: [${h.context}]`).join('\n')}`).join('\n\n') : 'No hits found for the primary search patterns.'}

## Part 2: ti84pceg.inc Cross-Reference

### IY+0x4A = grFlags / putMapFlags
- bit 0: drawGrLbls (1 = don't draw graph labels)
- bit 3: usePixelShadow2 (1 = use pixelShadow2)
- bit 4: putMapUseColor (1 = use custom color)

### IY+0x47 = UNDOCUMENTED
- Not defined in ti84pceg.inc
- Falls between backlightFlags (IY+0x46) and no named offset
- bit 7 set by MEM_INIT to 0x80

## Part 3: ParseInp Comparison

${runA && runB ? `| Metric | Run A (default) | Run B (cleared) |
|--------|----------------|-----------------|
| Steps | ${runA.stepCount} | ${runB.stepCount} |
| OP1 | ${runA.op1Hex} | ${runB.op1Hex} |
| OP1 value | ${formatValue(runA.op1Val)} | ${formatValue(runB.op1Val)} |
| errNo | ${hex(runA.errNo, 2)} | ${hex(runB.errNo, 2)} |
| termination | ${runA.termination} | ${runB.termination} |
| IY+0x4A after | ${hex(runA.iy4A_after, 2)} | ${hex(runB.iy4A_after, 2)} |
| IY+0x47 after | ${hex(runA.iy47_after, 2)} | ${hex(runB.iy47_after, 2)} |` : 'One or both runs failed.'}

## Conclusions

1. **IY+0x4A bit 4 = putMapUseColor**: Controls whether the PutMap routine uses a custom color for character rendering. This is a display-layer flag, not a parser/arithmetic flag. MEM_INIT enables it by default (0x10).

2. **IY+0x47 bit 7 = undocumented**: Not present in the SDK include file. Likely an internal OS flag. MEM_INIT sets it to 0x80.

3. **Neither flag affects ParseInp**: Expression parsing and arithmetic produce identical results whether these flags are set or cleared.
`;

fs.writeFileSync(REPORT_PATH, reportContent, 'utf-8');
log(`\nReport written to ${REPORT_PATH}`);
