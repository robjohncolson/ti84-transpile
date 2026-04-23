#!/usr/bin/env node

/**
 * Phase 25AI: Find the TRUE cxCurApp zeroing site with SP + instruction bytes
 *
 * Goal:
 *   1. Cold boot + MEM_INIT (same as phase25af/25ag)
 *   2. Manual cx seed (cxMain=0x058241, cxCurApp=0x40) — NOT NewContext
 *   3. Seed keyboard ENTER
 *   4. Run CoorMon one executor step at a time, budget ~25,000 steps
 *   5. Maintain a rolling 3-step window of {step, pc, sp, instrBytes, mnemonic}
 *   6. When cxCurApp (0xD007E0) transitions 0x40 → 0x00:
 *      - Print and save the window (N-2, N-1, N)
 *      - Log SP-in-cx-range check
 *      - Dump mem[0xD007C0..0xD007F0] at step N-1 and step N
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ai-cxcurapp-sp-watchpoint-report.md');

// ── ROM / memory ──────────────────────────────────────────────────────────────
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const MEM_SIZE = 0x1000000;

// ── Known entry-point addresses ───────────────────────────────────────────────
const BOOT_ENTRY         = 0x000000;
const KERNEL_INIT_ENTRY  = 0x08c331;
const POST_INIT_ENTRY    = 0x0802b2;
const MEMINIT_ENTRY      = 0x09dee0;
const COORMON_ENTRY      = 0x08c331;
const GETCSC_ADDR        = 0x03fa09;

const STACK_RESET_TOP    = 0xd1a87e;
const IY_ADDR            = 0xd00080;

// ── RAM addresses ─────────────────────────────────────────────────────────────
const KBD_FLAGS_ADDR     = 0xd00080;
const KBD_SCAN_CODE_ADDR = 0xd00587;
const KBD_KEY_ADDR       = 0xd0058c;
const KBD_GETKY_ADDR     = 0xd0058d;

const CX_MAIN_ADDR       = 0xd007ca;
const CX_PPUTAWAY_ADDR   = 0xd007cd;
const CX_PUTAWAY_ADDR    = 0xd007d0;
const CX_REDISP_ADDR     = 0xd007d3;
const CX_ERROREP_ADDR    = 0xd007d6;
const CX_SIZEWIND_ADDR   = 0xd007d9;
const CX_PAGE_ADDR       = 0xd007dc;
const CX_CUR_APP_ADDR    = 0xd007e0;
const CX_TAIL_ADDR       = 0xd007e1;
const CX_CONTEXT_END_ADDR = 0xd007e1;

const CX_DUMP_START      = 0xd007c0;  // memory dump range around cx block
const CX_DUMP_END        = 0xd007f0;
const CX_DUMP_LEN        = CX_DUMP_END - CX_DUMP_START + 1;

const ERR_NO_ADDR        = 0xd008df;
const ERR_SP_ADDR        = 0xd008e0;
const OP1_ADDR           = 0xd005f8;

const TEMPMEM_ADDR       = 0xd02587;
const FPSBASE_ADDR       = 0xd0258a;
const FPS_ADDR           = 0xd0258d;
const OPBASE_ADDR        = 0xd02590;
const OPS_ADDR           = 0xd02593;

// ── Fake return sentinels ─────────────────────────────────────────────────────
const MEMINIT_RET        = 0x7ffff6;
const COORMON_RET        = 0x7ffffe;

// ── Run budgets ───────────────────────────────────────────────────────────────
const MEMINIT_BUDGET     = 100000;
const COORMON_BUDGET     = 25000;
const MAX_LOOP_ITER      = 8192;
const SK_ENTER           = 0x09;
const HOME_SCREEN_APP_ID = 0x40;
const HOME_SCREEN_MAIN   = 0x058241;

// ── Helpers ───────────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr]     = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

/**
 * Best-effort mnemonic from raw bytes.
 * Only covers patterns likely to zero a single RAM byte.
 */
function bestEffortMnemonic(bytes) {
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];

  // LDIR: ED B0
  if (b0 === 0xed && b1 === 0xb0) return 'LDIR';
  // LDDR: ED B8
  if (b0 === 0xed && b1 === 0xb8) return 'LDDR';
  // CALL nn: CD lo hi
  if (b0 === 0xcd) return `CALL 0x${((b3 << 16) | (b2 << 8) | b1).toString(16).padStart(6, '0')}`;
  // JP nn: C3 lo hi
  if (b0 === 0xc3) return `JP 0x${((b3 << 16) | (b2 << 8) | b1).toString(16).padStart(6, '0')}`;
  // LD (nn),A — Z80: 32 lo hi  (2-byte address in Z80 mode, but eZ80 ADL uses 3-byte)
  if (b0 === 0x32) return `LD (0x${((b3 << 16) | (b2 << 8) | b1).toString(16).padStart(6, '0')}),A`;
  // XOR A: AF  (then probably LD (nn),A next)
  if (b0 === 0xaf) return 'XOR A';
  // LD A,r / LD A,n
  if (b0 === 0x3e) return `LD A,0x${b1.toString(16).padStart(2, '0')}`;
  // PUSH BC/DE/HL/AF
  if (b0 === 0xc5) return 'PUSH BC';
  if (b0 === 0xd5) return 'PUSH DE';
  if (b0 === 0xe5) return 'PUSH HL';
  if (b0 === 0xf5) return 'PUSH AF';
  // POP BC/DE/HL/AF
  if (b0 === 0xc1) return 'POP BC';
  if (b0 === 0xd1) return 'POP DE';
  if (b0 === 0xe1) return 'POP HL';
  if (b0 === 0xf1) return 'POP AF';
  // RET
  if (b0 === 0xc9) return 'RET';
  // LD (HL),n
  if (b0 === 0x36) return `LD (HL),0x${b1.toString(16).padStart(2, '0')}`;
  // LD (HL),r (B=0x70, C=0x71, D=0x72, E=0x73, H=0x74, L=0x75, A=0x77)
  if (b0 >= 0x70 && b0 <= 0x77 && b0 !== 0x76) {
    const reg = ['B','C','D','E','H','L','?','A'][b0 - 0x70];
    return `LD (HL),${reg}`;
  }
  // eZ80 prefix 0x40 = .SIS / 0x49 = .LIS / 0x52 = .SIL / 0x5B = .LIL (mode prefixes)
  if (b0 === 0x5b) return `.LIL + ${bestEffortMnemonic([b1, b2, b3, 0])}`;
  if (b0 === 0x49) return `.LIS + ${bestEffortMnemonic([b1, b2, b3, 0])}`;
  if (b0 === 0x40) return `.SIS + ${bestEffortMnemonic([b1, b2, b3, 0])}`;
  if (b0 === 0x52) return `.SIL + ${bestEffortMnemonic([b1, b2, b3, 0])}`;

  return `?? ${b0.toString(16).padStart(2,'0')} ${b1.toString(16).padStart(2,'0')} ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')}`;
}

// ── Boot / init helpers ───────────────────────────────────────────────────────

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
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

// ── cx write tracer (same pattern as phase25af) ───────────────────────────────

function installCxWriteTracer(cpu, mem) {
  const writes = [];
  let currentStep = 0;
  let currentPc   = COORMON_ENTRY;

  const origWrite8  = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  const recordByte = (addr, value, kind) => {
    const norm = addr & 0xffffff;
    if (norm < CX_MAIN_ADDR || norm > CX_CONTEXT_END_ADDR) return;
    writes.push({ step: currentStep, pc: currentPc, kind, addr: norm, oldValue: mem[norm] & 0xff, newValue: value & 0xff });
  };

  cpu.write8  = (addr, value) => { recordByte(addr, value, 'write8');  return origWrite8(addr, value); };
  cpu.write16 = (addr, value) => { recordByte(addr, value, 'write16'); recordByte(addr + 1, value >>> 8, 'write16'); return origWrite16(addr, value); };
  cpu.write24 = (addr, value) => { recordByte(addr, value, 'write24'); recordByte(addr + 1, value >>> 8, 'write24'); recordByte(addr + 2, value >>> 16, 'write24'); return origWrite24(addr, value); };

  return {
    writes,
    setContext(step, pc) { currentStep = step; currentPc = pc & 0xffffff; },
    restore() { cpu.write8 = origWrite8; cpu.write16 = origWrite16; cpu.write24 = origWrite24; },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const transcript = [];
  const log = (line = '') => { transcript.push(String(line)); console.log(String(line)); };

  log('=== Phase 25AI: cxCurApp SP watchpoint ===');

  // ─ build runtime ─
  const mem         = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor    = createExecutor(BLOCKS, mem, { peripherals });
  const cpu         = executor.cpu;

  // ─ STAGE 0: cold boot ─
  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  // ─ STAGE 1: MEM_INIT ─
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let memInitReturned = false;
  let memInitSteps    = 0;

  try {
    const result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(_pc, _mode, _meta, step) {
        memInitSteps = Math.max(memInitSteps, (step ?? 0) + 1);
        if ((_pc & 0xffffff) === MEMINIT_RET) throw new Error('__MEMINIT_RETURN__');
      },
      onMissingBlock(_pc, _mode, step) {
        memInitSteps = Math.max(memInitSteps, (step ?? 0) + 1);
        if ((_pc & 0xffffff) === MEMINIT_RET) throw new Error('__MEMINIT_RETURN__');
      },
    });
    memInitSteps = Math.max(memInitSteps, result.steps ?? 0);
  } catch (err) {
    if (err?.message === '__MEMINIT_RETURN__') {
      memInitReturned = true;
    } else {
      throw err;
    }
  }

  log(`MEM_INIT: returned=${memInitReturned} steps=${memInitSteps}`);

  if (!memInitReturned) {
    writeFailureReport('MEM_INIT did not return', transcript);
    process.exitCode = 1;
    return;
  }

  // ─ STAGE 2: manual cx seed + keyboard ENTER ─
  // Seed cx context manually (NOT NewContext — avoids zeroing state)
  mem.fill(0x00, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR + 1);
  write24(mem, CX_MAIN_ADDR,    HOME_SCREEN_MAIN);
  write24(mem, CX_PPUTAWAY_ADDR, 0x000000);
  write24(mem, CX_PUTAWAY_ADDR,  0x000000);
  write24(mem, CX_REDISP_ADDR,   0x000000);
  write24(mem, CX_ERROREP_ADDR,  0x000000);
  write24(mem, CX_SIZEWIND_ADDR, 0x000000);
  write24(mem, CX_PAGE_ADDR,     0x000000);
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
  mem[CX_TAIL_ADDR]    = 0x00;

  // Seed keyboard ENTER
  peripherals.keyboard.keyMatrix[1] = 0xfe;
  mem[KBD_SCAN_CODE_ADDR] = SK_ENTER;
  mem[KBD_FLAGS_ADDR] |= (1 << 3) | (1 << 4);
  mem[KBD_KEY_ADDR]   = 0x05;
  mem[KBD_GETKY_ADDR] = 0x05;

  log(`Seeded cxCurApp=0x${mem[CX_CUR_APP_ADDR].toString(16).padStart(2,'0')} cxMain=${hex(read24(mem, CX_MAIN_ADDR))}`);
  log(`Seeded keyboard: keyMatrix[1]=0x${(peripherals.keyboard.keyMatrix[1] & 0xff).toString(16).padStart(2,'0')} kbdKey=${hex(mem[KBD_KEY_ADDR] & 0xff, 2)}`);

  // ─ STAGE 3: CoorMon per-step watchpoint ─
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, COORMON_RET);

  const cxWriteTracer = installCxWriteTracer(cpu, mem);

  // rolling 3-step window
  const window = [];   // up to 3 entries: {step, pc, sp, instrBytes, mnemonic}

  const addToWindow = (entry) => {
    window.push(entry);
    if (window.length > 3) window.shift();
  };

  let transitionStep   = null;    // step N where 0x40 → 0x00 occurs
  let windowAtTransition = null;  // snapshot of window at transition
  let memDumpBeforeTransition = null;
  let memDumpAtTransition     = null;
  let prevCxCurApp     = mem[CX_CUR_APP_ADDR] & 0xff;
  let prevMemSnapshot  = null;    // mem dump at previous step (for N-1)

  let coormonSteps    = 0;
  let coormonFinalPc  = COORMON_ENTRY;
  let coormonTerm     = 'unknown';
  let coormonReturned = false;
  let getcscHits      = [];

  // pendingStep: we record entry state before the block executes,
  // then check after the block whether cxCurApp changed.
  let pendingStep = null;

  const flushPending = () => {
    if (!pendingStep) return;

    const afterValue = mem[CX_CUR_APP_ADDR] & 0xff;

    // Only detect the FIRST 0x40 → 0x00 transition
    if (transitionStep === null && pendingStep.beforeValue === HOME_SCREEN_APP_ID && afterValue === 0x00) {
      transitionStep       = pendingStep.step;
      windowAtTransition   = [...window, pendingStep.windowEntry];
      memDumpBeforeTransition = pendingStep.prevMemDump;
      memDumpAtTransition     = Array.from(mem.slice(CX_DUMP_START, CX_DUMP_START + CX_DUMP_LEN));
    }

    pendingStep = null;
  };

  try {
    try {
      executor.runFrom(COORMON_ENTRY, 'adl', {
        maxSteps: COORMON_BUDGET,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _mode, _meta, step) {
          flushPending();

          const norm      = (pc & 0xffffff);
          const stepNum   = (step ?? 0) + 1;
          const sp        = cpu.sp;
          const rawBytes  = [mem[norm], mem[norm + 1], mem[norm + 2], mem[norm + 3]];
          const mnemonic  = bestEffortMnemonic(rawBytes);
          const instrBytesStr = rawBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');

          coormonSteps  = Math.max(coormonSteps, stepNum);
          coormonFinalPc = norm;
          cxWriteTracer.setContext(stepNum, norm);

          if (norm === GETCSC_ADDR) {
            getcscHits.push(stepNum);
            log(`  GetCSC hit step=${stepNum} pc=${hex(norm)}`);
          }

          if (norm === COORMON_RET) throw new Error('__COORMON_RETURN__');

          const entry = { step: stepNum, pc: norm, sp, instrBytes: instrBytesStr, mnemonic };
          addToWindow(entry);

          pendingStep = {
            step:        stepNum,
            pc:          norm,
            beforeValue: mem[CX_CUR_APP_ADDR] & 0xff,
            windowEntry: entry,
            prevMemDump: Array.from(mem.slice(CX_DUMP_START, CX_DUMP_START + CX_DUMP_LEN)),
          };
        },
        onMissingBlock(pc, _mode, step) {
          flushPending();
          const norm    = pc & 0xffffff;
          const stepNum = (step ?? 0) + 1;
          coormonFinalPc = norm;
          if (norm === COORMON_RET) throw new Error('__COORMON_RETURN__');
        },
      });
      coormonTerm = 'max_steps';
    } catch (err) {
      if (err?.message === '__COORMON_RETURN__') {
        coormonReturned = true;
        coormonTerm     = 'return_hit';
      } else {
        throw err;
      }
    }
  } finally {
    flushPending();
    cxWriteTracer.restore();
  }

  log(`CoorMon: term=${coormonTerm} steps=${coormonSteps} finalPc=${hex(coormonFinalPc)}`);
  log(`GetCSC hits: ${getcscHits.length > 0 ? getcscHits.join(', ') : '(none)'}`);
  log(`cx range writes: ${cxWriteTracer.writes.length}`);
  log(`cxCurApp transition found: ${transitionStep !== null ? `step=${transitionStep}` : 'no'}`);

  // ─ Write report ─
  writeReport({
    transcript,
    memInitSteps,
    transitionStep,
    windowAtTransition,
    memDumpBeforeTransition,
    memDumpAtTransition,
    cxWrites:     cxWriteTracer.writes,
    getcscHits,
    coormonSteps,
    coormonTerm,
    coormonFinalPc,
    coormonReturned,
    finalCxCurApp: mem[CX_CUR_APP_ADDR] & 0xff,
    finalErrNo:    mem[ERR_NO_ADDR] & 0xff,
    finalErrSp:    read24(mem, ERR_SP_ADDR),
    finalOp1Hex:   hexBytes(mem, OP1_ADDR, 9),
    postCoormonPointers: {
      tempMem: read24(mem, TEMPMEM_ADDR),
      fpsBase: read24(mem, FPSBASE_ADDR),
      fps:     read24(mem, FPS_ADDR),
      opBase:  read24(mem, OPBASE_ADDR),
      ops:     read24(mem, OPS_ADDR),
    },
  });

  log(`report: ${REPORT_PATH}`);
  process.exitCode = 0;
}

// ── Report writers ────────────────────────────────────────────────────────────

function formatWindowTable(windowEntries) {
  if (!windowEntries || windowEntries.length === 0) return '(no window data)';

  const lines = [
    '| Step | PC | SP | Instr Bytes | Mnemonic |',
    '|------|----|----|-------------|----------|',
  ];
  for (const entry of windowEntries) {
    lines.push(`| ${entry.step} | ${hex(entry.pc)} | ${hex(entry.sp)} | ${entry.instrBytes} | ${entry.mnemonic} |`);
  }
  return lines.join('\n');
}

function formatMemDump(label, dumpArray) {
  if (!dumpArray) return `${label}: (no data)`;

  const lines = [`**${label}** (0x${CX_DUMP_START.toString(16)} – 0x${CX_DUMP_END.toString(16)}):`];
  for (let offset = 0; offset < dumpArray.length; offset += 16) {
    const addrStr   = (CX_DUMP_START + offset).toString(16).padStart(6, '0');
    const byteStr   = dumpArray.slice(offset, offset + 16).map(b => b.toString(16).padStart(2, '0')).join(' ');
    lines.push(`  0x${addrStr}: ${byteStr}`);
  }
  return lines.join('\n');
}

function writeReport(details) {
  const lines = [];

  lines.push('# Phase 25AI - cxCurApp True Zeroing Site (SP + Instruction Bytes)');
  lines.push('');
  lines.push(`**Date**: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');

  // ── Summary ──
  lines.push('## Summary');
  lines.push('');

  if (details.transitionStep === null) {
    lines.push(`cxCurApp (0xD007E0) did NOT transition from 0x40 to 0x00 within the ${COORMON_BUDGET}-step budget.`);
    lines.push(`CoorMon ran ${details.coormonSteps} steps, termination=${details.coormonTerm}, finalPc=${hex(details.coormonFinalPc)}.`);
    lines.push('No true zeroing site identified. Increase budget or check seed conditions.');
  } else {
    const windowEntries = details.windowAtTransition ?? [];
    const zeroEntry     = windowEntries[windowEntries.length - 1];
    const prevEntry     = windowEntries.length >= 2 ? windowEntries[windowEntries.length - 2] : null;

    const spInCxRange   = zeroEntry
      ? (zeroEntry.sp >= CX_DUMP_START && zeroEntry.sp <= CX_DUMP_END)
      : false;

    lines.push(`**TRUE ZEROING SITE**: step=${details.transitionStep} PC=${zeroEntry ? hex(zeroEntry.pc) : 'n/a'} SP=${zeroEntry ? hex(zeroEntry.sp) : 'n/a'}`);
    lines.push('');
    if (zeroEntry) {
      lines.push(`Instruction at zeroing PC: \`${zeroEntry.mnemonic}\` (bytes: \`${zeroEntry.instrBytes}\`)`);
    }
    if (prevEntry) {
      lines.push(`Caller step N-1: PC=${hex(prevEntry.pc)} mnemonic=\`${prevEntry.mnemonic}\``);
    }
    lines.push('');
    lines.push(`SP-in-cx-range [0x${CX_DUMP_START.toString(16)}..0x${CX_DUMP_END.toString(16)}]: **${spInCxRange ? 'YES — stack-into-cx corruption possible' : 'no'}**`);
  }
  lines.push('');

  // ── Method ──
  lines.push('## Method');
  lines.push('');
  lines.push('- Cold boot → MEM_INIT → manual cx seed (cxMain=0x058241, cxCurApp=0x40)');
  lines.push('- Timer IRQ disabled: `createPeripheralBus({ timerInterrupt: false })`');
  lines.push('- Keyboard ENTER seeded before CoorMon entry');
  lines.push(`- CoorMon ran with budget=${COORMON_BUDGET} steps, maxLoopIterations=${MAX_LOOP_ITER}`);
  lines.push('- Rolling 3-step window of {step, PC, SP, instrBytes, mnemonic} maintained at each onBlock');
  lines.push('- cxCurApp sampled before/after each block; transition 0x40→0x00 triggers full capture');
  lines.push('- cx-range writes trapped via write8/16/24 hooks (same pattern as phase25af)');
  lines.push('');

  // ── Rolling window at transition ──
  lines.push('## Rolling Window at Transition');
  lines.push('');
  if (details.transitionStep === null) {
    lines.push('(no transition detected)');
  } else {
    lines.push(formatWindowTable(details.windowAtTransition));
  }
  lines.push('');

  // ── Memory dump N-1 vs N ──
  lines.push('## cx-Range Memory Dump');
  lines.push('');
  if (details.transitionStep === null) {
    lines.push('(no transition detected)');
  } else {
    lines.push(formatMemDump('Step N-1 (before zeroing)', details.memDumpBeforeTransition));
    lines.push('');
    lines.push(formatMemDump('Step N (after zeroing)', details.memDumpAtTransition));
  }
  lines.push('');

  // ── cx-range writes ──
  lines.push('## cx-Range Write Log');
  lines.push('');
  if (details.cxWrites.length === 0) {
    lines.push('(none)');
  } else {
    lines.push('| # | Step | PC | Addr | Old | New | Via |');
    lines.push('|---|------|----|------|-----|-----|-----|');
    for (let i = 0; i < details.cxWrites.length; i++) {
      const w = details.cxWrites[i];
      lines.push(`| ${i + 1} | ${w.step} | ${hex(w.pc)} | ${hex(w.addr)} | ${hex(w.oldValue, 2)} | ${hex(w.newValue, 2)} | ${w.kind} |`);
    }
  }
  lines.push('');

  // ── Caller hypothesis ──
  lines.push('## Caller Hypothesis');
  lines.push('');
  if (details.transitionStep === null) {
    lines.push('No transition detected — cannot derive caller.');
  } else {
    const windowEntries = details.windowAtTransition ?? [];
    const zeroEntry     = windowEntries[windowEntries.length - 1];
    const prevEntry     = windowEntries.length >= 2 ? windowEntries[windowEntries.length - 2] : null;

    if (zeroEntry) {
      lines.push(`The instruction at PC=${hex(zeroEntry.pc)} (\`${zeroEntry.mnemonic}\`) performed the zeroing.`);
    }
    if (prevEntry) {
      lines.push(`The immediately preceding block was at PC=${hex(prevEntry.pc)} (\`${prevEntry.mnemonic}\`).`);
      lines.push('If that is a CALL instruction, the callee at the CALL target is the direct zeroing function.');
    }
    lines.push('');
    lines.push('To find the caller in ROM: search for `CALL <zeroingPC>` patterns in ROM.rom.');
    lines.push('e.g. `grep -c` or ROM byte scan for `0xCD <lo> <hi>` at the relevant address.');
  }
  lines.push('');

  // ── Run stats ──
  lines.push('## Run Statistics');
  lines.push('');
  lines.push(`- MEM_INIT steps: ${details.memInitSteps}`);
  lines.push(`- CoorMon steps: ${details.coormonSteps}`);
  lines.push(`- CoorMon termination: ${details.coormonTerm}`);
  lines.push(`- CoorMon finalPc: ${hex(details.coormonFinalPc)}`);
  lines.push(`- CoorMon returned: ${details.coormonReturned}`);
  lines.push(`- GetCSC hit steps: ${details.getcscHits.length > 0 ? details.getcscHits.join(', ') : '(none)'}`);
  lines.push(`- cx range writes total: ${details.cxWrites.length}`);
  lines.push(`- Final cxCurApp: ${hex(details.finalCxCurApp, 2)}`);
  lines.push(`- Final errNo: ${hex(details.finalErrNo, 2)}`);
  lines.push(`- Final errSP: ${hex(details.finalErrSp)}`);
  lines.push(`- Final OP1: ${details.finalOp1Hex}`);
  lines.push('');

  // ── Next steps ──
  lines.push('## Next-Step Recommendations');
  lines.push('');
  lines.push('1. If the zeroing PC is known: disassemble the full function containing that PC.');
  lines.push('2. Scan ROM bytes for `CD <lo> <hi>` (CALL) to the zeroing PC to find all callers.');
  lines.push('3. If the instruction is LDIR/LDDR: trace HL (source), DE (dest), BC (count) at step N-1.');
  lines.push('4. If the instruction is a direct store (LD (nn),A): confirm A=0 and where it was set.');
  lines.push('5. If SP-in-cx-range is YES: the zeroing is likely a stack push spilling into the cx block — find the function that pushed with SP pointing into cx memory.');
  lines.push('');

  // ── Console output ──
  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(reason, transcript) {
  const lines = [
    '# Phase 25AI - FAILED',
    '',
    `**Reason**: ${reason}`,
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
} catch (err) {
  const message = err?.stack || String(err);
  console.error(message);
  writeFailureReport(message, String(message).split(/\r?\n/));
  process.exitCode = 1;
}
