#!/usr/bin/env node

/**
 * Phase 135 — STAT Key Dispatch and 1-Var Stats Pipeline
 *
 * 1. Catalog all stat-related JT entries (from phase25h-a JSON + extended ROM scan)
 * 2. Find kStat key code from ti84pceg.inc
 * 3. Trace STAT key dispatch: home handler → stat context switch
 * 4. Locate 1-Var Stats calculation routine (OneVar at 0x0A9325)
 * 5. Disassemble stat context handler and OneVar pipeline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction as decodeEz80 } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase135-stat-dispatch-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const FAKE_RET = 0x7FFFFE;

// Context structure
const CX_MAIN = 0xD007CA;
const CX_PPUTAWAY = 0xD007CD;
const CX_PUTAWAY = 0xD007D0;
const CX_REDISP = 0xD007D3;
const CX_ERROR_EP = 0xD007D6;
const CX_SIZEWIND = 0xD007D9;
const CX_PAGE = 0xD007DC;
const CX_CUR_APP = 0xD007E0;

// Key I/O
const KBD_KEY = 0xD0058C;
const KBD_SCAN_CODE = 0xD00587;

// Key codes from ti84pceg.inc
const K_STAT = 0x31;     // kStat := 031h
const SK_STAT = 0x20;    // skStat := 20h
const K_STAT_ED = 0x43;  // kStatEd := 043h (also cxStatEdit)
const K_STAT_P = 0x55;   // kStatP := 055h (also cxStatPlot)

// Home handler
const HOME_HANDLER = 0x058241;

// errSP / errNo
const ERR_SP_ADDR = 0xD008E0;
const ERR_NO_ADDR = 0xD008DF;

// Allocator pointers
const USERMEM_ADDR = 0xD1A881;
const EMPTY_VAT_ADDR = 0xD3FFFF;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const PTEMPCNT_ADDR = 0xD02596;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const NEWDATA_PTR_ADDR = 0xD025A0;

// ── Stat-related JT entries ────────────────────────────────────────────────

const NAMED_STAT_JT = [
  { name: 'Sto_StatVar',   slotAddr: 0x0204EC, impl: 0x09A3BD },
  { name: 'Rcl_StatVar',   slotAddr: 0x0204F0, impl: 0x08019F },
  { name: 'ErrStat',       slotAddr: 0x020894, impl: 0x061D5E },
  { name: 'ErrStatPlot',   slotAddr: 0x0208A8, impl: 0x061D76 },
  { name: 'ZmStats',       slotAddr: 0x020A98, impl: 0x0B007A },
  { name: 'PointStatHelp', slotAddr: 0x020B2C, impl: 0x0B056C },
  { name: 'StatShade',     slotAddr: 0x020C4C, impl: 0x05E062 },
  { name: 'GetStatPtr',    slotAddr: 0x020F20, impl: 0x09A39F },
  { name: 'CmpStatPtr',    slotAddr: 0x020F24, impl: 0x09A3A5 },
];

const EXTENDED_STAT_JT = [
  { name: 'OneVar',        slotAddr: 0x021068, impl: 0x0A9325 },
  { name: 'OneVars0',      slotAddr: 0x02106C, impl: 0x0AA978 },
  { name: 'TwoVars0',      slotAddr: 0x021070, impl: 0x0AAAB8 },
  { name: 'InitStatAns',   slotAddr: 0x021074, impl: 0x0AB21B },
];

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const write24 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
};

const write16 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
};

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

// ── Disassembler ───────────────────────────────────────────────────────────

function disassembleAt(addr) {
  if (addr >= 0x400000) return { mnemonic: '??? (outside ROM)', length: 1 };
  try {
    return decodeEz80(romBytes, addr, true);
  } catch (e) {
    return { mnemonic: `??? (decode error: ${e.message})`, length: 1 };
  }
}

function formatInstr(inst) {
  if (inst.mnemonic) return inst.mnemonic;
  if (inst.tag) return inst.tag;
  return '???';
}

function disassembleRange(startAddr, count) {
  let pc = startAddr;
  const lines = [];
  for (let i = 0; i < count && pc < 0x400000; i++) {
    const instr = disassembleAt(pc);
    const bytes = hexBytes(romBytes, pc, Math.min(instr.length, 6));
    lines.push(`  ${hex(pc)}: ${bytes.padEnd(20)} ${formatInstr(instr)}`);
    pc += instr.length;
  }
  return lines;
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xD0; cpu._iy = 0xD00080;
  cpu.f = 0x40; cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedMinimalErrFrame(cpu, mem, returnAddr) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, returnAddr);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedHomeContext(mem) {
  write24(mem, CX_MAIN, HOME_HANDLER);
  mem[CX_CUR_APP] = 0x40;
}

function readCxContext(mem) {
  return {
    cxMain: read24(mem, CX_MAIN),
    cxPPutAway: read24(mem, CX_PPUTAWAY),
    cxPutAway: read24(mem, CX_PUTAWAY),
    cxReDisp: read24(mem, CX_REDISP),
    cxErrorEP: read24(mem, CX_ERROR_EP),
    cxSizeWind: read24(mem, CX_SIZEWIND),
    cxPage: read24(mem, CX_PAGE),
    cxCurApp: mem[CX_CUR_APP],
  };
}

function formatCx(cx) {
  return `cxMain=${hex(cx.cxMain)} cxCurApp=${hex(cx.cxCurApp, 2)}`;
}

// ══════════════════════════════════════════════════════════════════════════
// PART A: Catalog all stat-related JT entries
// ══════════════════════════════════════════════════════════════════════════

function partA(report) {
  console.log('=== Part A: Stat-Related Jump Table Entries ===\n');
  report.push('## Part A: Stat-Related Jump Table Entries\n');

  console.log('Named JT entries (from phase25h-a-jump-table.json):');
  report.push('### Named JT entries\n');
  report.push('| Name | JT Slot Addr | Implementation |');
  report.push('|------|-------------|----------------|');

  for (const e of NAMED_STAT_JT) {
    console.log(`  ${e.name.padEnd(20)} JT=${hex(e.slotAddr)}  impl=${hex(e.impl)}`);
    report.push(`| ${e.name} | ${hex(e.slotAddr)} | ${hex(e.impl)} |`);
  }

  console.log('\nExtended stat JT entries (from ti84pceg.inc, beyond scanned JT range):');
  report.push('\n### Extended stat JT entries\n');
  report.push('| Name | JT Slot Addr | Implementation |');
  report.push('|------|-------------|----------------|');

  for (const e of EXTENDED_STAT_JT) {
    console.log(`  ${e.name.padEnd(20)} JT=${hex(e.slotAddr)}  impl=${hex(e.impl)}`);
    report.push(`| ${e.name} | ${hex(e.slotAddr)} | ${hex(e.impl)} |`);
  }

  // STATCMD token range
  console.log('\nSTATCMD token range (0xF2-0xFF):');
  report.push('\n### STATCMD Token Range (0xF2-0xFF)\n');
  const statCmds = [
    [0xF2, 'tOneVar'], [0xF3, 'tTwoVar'], [0xF4, 'tLR (LinR A+BX)'],
    [0xF5, 'tLRExp'], [0xF6, 'tLRLn'], [0xF7, 'tLRPwr'],
    [0xF8, 'tMedMed'], [0xF9, 'tQuad'], [0xFA, 'tClrLst'],
    [0xFB, 'tClrTbl'], [0xFC, 'tHist'], [0xFD, 'txyLine'],
    [0xFE, 'tScatter'], [0xFF, 'tLR1 (LinR AX+B)'],
  ];
  report.push('| Token | Name |');
  report.push('|-------|------|');
  for (const [tok, name] of statCmds) {
    console.log(`  0x${tok.toString(16).toUpperCase()} = ${name}`);
    report.push(`| 0x${tok.toString(16).toUpperCase()} | ${name} |`);
  }

  console.log('\nKey codes:');
  console.log(`  kStat    = 0x31`);
  console.log(`  skStat   = 0x20`);
  console.log(`  kStatEd  = 0x43 (cxStatEdit)`);
  console.log(`  kStatP   = 0x55 (cxStatPlot)`);

  report.push('\n### Key Codes\n');
  report.push('- kStat = 0x31 (key code for STAT button)');
  report.push('- skStat = 0x20 (scan code)');
  report.push('- kStatEd = 0x43 (cxStatEdit context code)');
  report.push('- kStatP = 0x55 (cxStatPlot context code)');

  console.log('');
}

// ══════════════════════════════════════════════════════════════════════════
// PART B: Disassemble home handler
// ══════════════════════════════════════════════════════════════════════════

function partB(report) {
  console.log('=== Part B: Static Disassembly of Home Handler (0x058241) ===\n');
  report.push('\n## Part B: Static Disassembly — Home Handler\n');

  const lines = disassembleRange(HOME_HANDLER, 80);
  report.push('```');
  for (const l of lines) {
    console.log(l);
    report.push(l);
  }
  report.push('```');
  console.log('');
}

// ══════════════════════════════════════════════════════════════════════════
// PART C: Dynamic trace — STAT key through home handler
// ══════════════════════════════════════════════════════════════════════════

function partC(report) {
  console.log('=== Part C: Dynamic Trace — STAT Key via Home Handler ===\n');
  report.push('\n## Part C: Dynamic Trace — STAT Key via Home Handler\n');

  const { mem, executor, cpu } = createRuntime();
  console.log('  Cold boot...');
  coldBoot(executor, cpu, mem);

  seedAllocator(mem);
  seedHomeContext(mem);
  prepareCallState(cpu, mem);
  seedMinimalErrFrame(cpu, mem, FAKE_RET);

  // Set kbdKey to kStat
  mem[KBD_KEY] = K_STAT;
  console.log(`  kbdKey = 0x${K_STAT.toString(16)} (kStat)`);
  console.log(`  cxCurApp = 0x${mem[CX_CUR_APP].toString(16)}`);
  console.log(`  cxMain = ${hex(read24(mem, CX_MAIN))}`);

  // Track block PCs and cx changes
  const blockPCs = [];
  let lastCxCurApp = mem[CX_CUR_APP];
  let lastCxMain = read24(mem, CX_MAIN);
  const cxChanges = [];

  // Push FAKE_RET as return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  const result = executor.runFrom(HOME_HANDLER, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 8192,
    onBlock: (pc, mode, meta, step) => {
      blockPCs.push({ step, pc });

      const curApp = mem[CX_CUR_APP];
      const curMain = read24(mem, CX_MAIN);
      if (curApp !== lastCxCurApp || curMain !== lastCxMain) {
        cxChanges.push({
          step, pc,
          oldApp: lastCxCurApp, newApp: curApp,
          oldMain: lastCxMain, newMain: curMain,
        });
        lastCxCurApp = curApp;
        lastCxMain = curMain;
      }
    },
  });

  console.log(`  Termination: ${result.termination}`);
  console.log(`  Steps: ${result.steps}`);
  console.log(`  Last PC: ${hex(result.lastPc)}`);
  console.log(`  Block PCs logged: ${blockPCs.length}`);

  report.push(`- Termination: ${result.termination}`);
  report.push(`- Steps: ${result.steps}`);
  report.push(`- Last PC: ${hex(result.lastPc)}`);

  // First 60 block PCs
  console.log('\n  First 60 block PCs:');
  report.push('\n### First 60 Block PCs\n```');
  for (let i = 0; i < Math.min(60, blockPCs.length); i++) {
    const e = blockPCs[i];
    const line = `  step ${String(e.step).padStart(5)} : PC=${hex(e.pc)}`;
    console.log('  ' + line);
    report.push(line);
  }
  report.push('```');

  // Last 30 block PCs
  if (blockPCs.length > 60) {
    console.log(`\n  Last 30 block PCs (of ${blockPCs.length}):`);
    report.push(`\n### Last 30 Block PCs (of ${blockPCs.length})\n\`\`\``);
    const start = Math.max(0, blockPCs.length - 30);
    for (let i = start; i < blockPCs.length; i++) {
      const e = blockPCs[i];
      const line = `  step ${String(e.step).padStart(5)} : PC=${hex(e.pc)}`;
      console.log('  ' + line);
      report.push(line);
    }
    report.push('```');
  }

  // CX changes
  if (cxChanges.length > 0) {
    console.log('\n  CX context changes:');
    report.push('\n### CX Context Changes\n```');
    for (const c of cxChanges) {
      const line = `  step ${c.step}: PC=${hex(c.pc)} cxCurApp: ${hex(c.oldApp, 2)}→${hex(c.newApp, 2)}  cxMain: ${hex(c.oldMain)}→${hex(c.newMain)}`;
      console.log('  ' + line);
      report.push(line);
    }
    report.push('```');
  } else {
    console.log('  No CX context changes detected.');
    report.push('\nNo CX context changes detected during trace.');
  }

  // Final state
  const finalCx = readCxContext(mem);
  console.log(`\n  Final: ${formatCx(finalCx)}`);
  console.log(`  Final kbdKey: 0x${mem[KBD_KEY].toString(16).padStart(2, '0')}`);
  report.push(`\n### Final State`);
  report.push(`- ${formatCx(finalCx)}`);
  report.push(`- kbdKey: 0x${mem[KBD_KEY].toString(16).padStart(2, '0')}`);

  // Missing blocks
  if (result.missingBlocks && result.missingBlocks.length > 0) {
    console.log(`\n  Missing blocks: ${result.missingBlocks.slice(0, 20).join(', ')}`);
    report.push(`\n### Missing Blocks`);
    report.push(`\`\`\`\n${result.missingBlocks.slice(0, 20).join('\n')}\n\`\`\``);
  }

  console.log('');
}

// ══════════════════════════════════════════════════════════════════════════
// PART D: Dynamic trace — STAT key through CoorMon
// ══════════════════════════════════════════════════════════════════════════

function partD(report) {
  console.log('=== Part D: Dynamic Trace — STAT Key via CoorMon ===\n');
  report.push('\n## Part D: Dynamic Trace — STAT Key via CoorMon\n');

  const { mem, executor, cpu } = createRuntime();
  console.log('  Cold boot...');
  coldBoot(executor, cpu, mem);

  seedAllocator(mem);
  seedHomeContext(mem);
  prepareCallState(cpu, mem);
  seedMinimalErrFrame(cpu, mem, FAKE_RET);

  mem[KBD_KEY] = K_STAT;
  console.log(`  kbdKey = 0x${K_STAT.toString(16)} (kStat)`);

  const blockPCs = [];
  let lastCxCurApp = mem[CX_CUR_APP];
  let lastCxMain = read24(mem, CX_MAIN);
  const cxChanges = [];

  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  const result = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 8192,
    onBlock: (pc, mode, meta, step) => {
      blockPCs.push({ step, pc });

      const curApp = mem[CX_CUR_APP];
      const curMain = read24(mem, CX_MAIN);
      if (curApp !== lastCxCurApp || curMain !== lastCxMain) {
        cxChanges.push({
          step, pc,
          oldApp: lastCxCurApp, newApp: curApp,
          oldMain: lastCxMain, newMain: curMain,
        });
        lastCxCurApp = curApp;
        lastCxMain = curMain;
      }
    },
  });

  console.log(`  Termination: ${result.termination}`);
  console.log(`  Steps: ${result.steps}`);
  console.log(`  Last PC: ${hex(result.lastPc)}`);

  report.push(`- Termination: ${result.termination}`);
  report.push(`- Steps: ${result.steps}`);
  report.push(`- Last PC: ${hex(result.lastPc)}`);

  // First 40 block PCs
  console.log('\n  First 40 block PCs:');
  report.push('\n### First 40 Block PCs\n```');
  for (let i = 0; i < Math.min(40, blockPCs.length); i++) {
    const e = blockPCs[i];
    const line = `  step ${String(e.step).padStart(5)} : PC=${hex(e.pc)}`;
    console.log('  ' + line);
    report.push(line);
  }
  report.push('```');

  // Last 30
  if (blockPCs.length > 40) {
    console.log(`\n  Last 30 block PCs (of ${blockPCs.length}):`);
    report.push(`\n### Last 30 Block PCs (of ${blockPCs.length})\n\`\`\``);
    const start = Math.max(0, blockPCs.length - 30);
    for (let i = start; i < blockPCs.length; i++) {
      const e = blockPCs[i];
      const line = `  step ${String(e.step).padStart(5)} : PC=${hex(e.pc)}`;
      console.log('  ' + line);
      report.push(line);
    }
    report.push('```');
  }

  // CX changes
  if (cxChanges.length > 0) {
    console.log('\n  CX context changes:');
    report.push('\n### CX Context Changes\n```');
    for (const c of cxChanges) {
      const line = `  step ${c.step}: PC=${hex(c.pc)} cxCurApp: ${hex(c.oldApp, 2)}→${hex(c.newApp, 2)}  cxMain: ${hex(c.oldMain)}→${hex(c.newMain)}`;
      console.log('  ' + line);
      report.push(line);
    }
    report.push('```');
  } else {
    console.log('  No CX context changes.');
    report.push('\nNo CX context changes detected.');
  }

  const finalCx = readCxContext(mem);
  console.log(`\n  Final: ${formatCx(finalCx)}`);
  report.push(`\n### Final State\n- ${formatCx(finalCx)}`);

  if (result.missingBlocks && result.missingBlocks.length > 0) {
    console.log(`\n  Missing blocks: ${result.missingBlocks.slice(0, 20).join(', ')}`);
    report.push(`\n### Missing Blocks\n\`\`\`\n${result.missingBlocks.slice(0, 20).join('\n')}\n\`\`\``);
  }

  console.log('');
}

// ══════════════════════════════════════════════════════════════════════════
// PART E: Disassemble 1-Var Stats (OneVar) implementation
// ══════════════════════════════════════════════════════════════════════════

function partE(report) {
  console.log('=== Part E: Disassembly of OneVar (1-Var Stats) at 0x0A9325 ===\n');
  report.push('\n## Part E: OneVar (1-Var Stats) Disassembly\n');

  const lines = disassembleRange(0x0A9325, 100);
  console.log('OneVar at 0x0A9325 (100 instructions):');
  report.push('### OneVar at 0x0A9325\n```');
  for (const l of lines) {
    console.log(l);
    report.push(l);
  }
  report.push('```');

  console.log('\nOneVars0 at 0x0AA978 (60 instructions):');
  report.push('\n### OneVars0 at 0x0AA978\n```');
  const lines2 = disassembleRange(0x0AA978, 60);
  for (const l of lines2) {
    console.log(l);
    report.push(l);
  }
  report.push('```');

  console.log('\nInitStatAns at 0x0AB21B (40 instructions):');
  report.push('\n### InitStatAns at 0x0AB21B\n```');
  const lines3 = disassembleRange(0x0AB21B, 40);
  for (const l of lines3) {
    console.log(l);
    report.push(l);
  }
  report.push('```');

  console.log('');
}

// ══════════════════════════════════════════════════════════════════════════
// PART F: ROM scan for callers of stat routines
// ══════════════════════════════════════════════════════════════════════════

function partF(report) {
  console.log('=== Part F: ROM Scan for Callers of Stat Routines ===\n');
  report.push('\n## Part F: ROM Callers of Stat Routines\n');

  const statAddrs = [
    { name: 'OneVar',       addr: 0x0A9325 },
    { name: 'OneVars0',     addr: 0x0AA978 },
    { name: 'InitStatAns',  addr: 0x0AB21B },
    { name: 'Sto_StatVar',  addr: 0x09A3BD },
    { name: 'Rcl_StatVar',  addr: 0x08019F },
    { name: 'GetStatPtr',   addr: 0x09A39F },
    { name: 'CmpStatPtr',   addr: 0x09A3A5 },
  ];

  report.push('```');
  for (const { name, addr: target } of statAddrs) {
    const callers = [];
    const lo = target & 0xFF;
    const mid = (target >> 8) & 0xFF;
    const hi = (target >> 16) & 0xFF;

    for (let a = 0; a < 0x400000 - 3; a++) {
      const op = romBytes[a];
      if ((op === 0xCD || op === 0xC3) &&
          romBytes[a + 1] === lo &&
          romBytes[a + 2] === mid &&
          romBytes[a + 3] === hi) {
        callers.push({ addr: a, type: op === 0xCD ? 'CALL' : 'JP' });
      }
    }

    const header = `  ${name} (${hex(target)}): ${callers.length} caller(s)`;
    console.log(header);
    report.push(header);
    for (const c of callers.slice(0, 15)) {
      const line = `    ${c.type} at ${hex(c.addr)}`;
      console.log(line);
      report.push(line);
    }
    if (callers.length > 15) {
      console.log(`    ... and ${callers.length - 15} more`);
      report.push(`    ... and ${callers.length - 15} more`);
    }
  }
  report.push('```');

  console.log('');
}

// ══════════════════════════════════════════════════════════════════════════
// PART G: Disassemble CoorMon key dispatch
// ══════════════════════════════════════════════════════════════════════════

function partG(report) {
  console.log('=== Part G: CoorMon Key Dispatch Disassembly ===\n');
  report.push('\n## Part G: CoorMon Key Dispatch Disassembly\n');

  const lines = disassembleRange(0x08C331, 60);
  console.log('CoorMon at 0x08C331 (60 instructions):');
  report.push('### CoorMon at 0x08C331\n```');
  for (const l of lines) {
    console.log(l);
    report.push(l);
  }
  report.push('```');

  console.log('\nKey processing core at 0x08C7AD (40 instructions):');
  report.push('\n### Key Processing Core at 0x08C7AD\n```');
  const lines2 = disassembleRange(0x08C7AD, 40);
  for (const l of lines2) {
    console.log(l);
    report.push(l);
  }
  report.push('```');

  // Also disassemble the key classifier at 0x08C4A3
  console.log('\nKey classifier at 0x08C4A3 (40 instructions):');
  report.push('\n### Key Classifier at 0x08C4A3\n```');
  const lines3 = disassembleRange(0x08C4A3, 40);
  for (const l of lines3) {
    console.log(l);
    report.push(l);
  }
  report.push('```');

  console.log('');
}

// ══════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════

const report = ['# Phase 135: STAT Key Dispatch and 1-Var Stats Pipeline\n'];
report.push(`Generated by \`probe-phase135-stat-dispatch.mjs\` on ${new Date().toISOString()}\n`);

partA(report);
partB(report);
partG(report);
partE(report);
partF(report);
partC(report);
partD(report);

fs.writeFileSync(REPORT_PATH, report.join('\n'), 'utf8');
console.log(`\nReport written to ${REPORT_PATH}`);
