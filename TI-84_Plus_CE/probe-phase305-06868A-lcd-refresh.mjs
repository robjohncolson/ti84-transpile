#!/usr/bin/env node
// Phase 305: Trace 0x06868A — LCD refresh inner function
//
// Called via 0x05BF5C (thin wrapper: CALL 0x06868A + JP 0x07F7D6).
// Reads 0xD005F8 (OP1), checks bit 6, calls three sub-functions:
//   0x07F7A4, 0x07FE5A, 0x0686A8
// Then conditional JP 0x07FE28.
//
// This probe:
// 1. Static disassembly of 0x06868A and each sub-call
// 2. Runtime execution trace from warm boot (300-500 steps)
// 3. Individual sub-call traces (200 steps each)
// 4. Refresh pipeline documentation

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const IY_BASE = 0xD00080;
const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const VRAM_BASE = 0xD40000;

// Target functions
const TARGET_MAIN = 0x06868A;
const SUB_07F7A4 = 0x07F7A4;
const SUB_07FE5A = 0x07FE5A;
const SUB_0686A8 = 0x0686A8;
const SUB_07FE28 = 0x07FE28;
const WRAPPER_05BF5C = 0x05BF5C;
const TAIL_07F7D6 = 0x07F7D6;

// ══════════════════════════════════════════════════════════════
// Utility functions
// ══════════════════════════════════════════════════════════════

function hex(v, w = 6) {
  if (v === undefined || v === null || Number.isNaN(v)) return 'n/a';
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hex2(v) {
  return '0x' + ((v ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function fmtInst(inst) {
  const t = inst.tag;
  if (!t) return '??? (no tag)';

  const simple = ['nop','ret','halt','di','ei','exx','rlca','rrca','rla','rra',
    'daa','cpl','scf','ccf','neg','reti','retn','ldi','ldir','ldd','lddr',
    'cpi','cpir','cpd','cpdr','ini','outi','ind','outd','inir','otir','indr',
    'otdr','rrd','rld','slp','stmix','rsmix','otimr','ex-af','ex-de-hl'];
  if (simple.includes(t)) return t.replace(/-/g, ' ').toUpperCase();

  const ixd = (reg, disp) => `(${reg}${disp >= 0 ? '+' : ''}${disp})`.toUpperCase();

  switch (t) {
    case 'ld-reg-reg': return `LD ${inst.dest}, ${inst.src}`.toUpperCase();
    case 'ld-reg-imm': return `LD ${inst.dest}, ${hex2(inst.value)}`.toUpperCase();
    case 'ld-reg-ind': return `LD ${inst.dest}, (${inst.src})`.toUpperCase();
    case 'ld-ind-reg': return `LD (${inst.dest}), ${inst.src}`.toUpperCase();
    case 'ld-ind-imm': return `LD (HL), ${hex2(inst.value)}`;
    case 'ld-pair-imm': return `LD ${inst.pair}, ${hex(inst.value)}`.toUpperCase();
    case 'ld-pair-mem': return `LD ${inst.pair}, (${hex(inst.addr)})`.toUpperCase();
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair}`.toUpperCase();
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src || 'A'}`.toUpperCase();
    case 'ld-reg-mem': return `LD ${inst.dest || 'A'}, (${hex(inst.addr)})`.toUpperCase();
    case 'ld-pair-ind': return `LD ${inst.pair}, (${inst.src})`.toUpperCase();
    case 'ld-ind-pair': return `LD (${inst.dest}), ${inst.pair}`.toUpperCase();
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-pair': return `LD SP, ${inst.pair}`.toUpperCase();
    case 'ld-special': return `LD ${inst.dest}, ${inst.src}`.toUpperCase();
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-reg-ixd': return `LD ${inst.dest}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.src}`.toUpperCase();
    case 'ld-ixd-imm': return `LD ${ixd(inst.indexRegister, inst.displacement)}, ${hex2(inst.value)}`;
    case 'ld-pair-indexed': return `LD ${inst.pair}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.pair}`.toUpperCase();
    case 'ld-ixiy-indexed': return `LD ${inst.dest}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy': return `LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.src}`.toUpperCase();
    case 'inc-reg': return `INC ${inst.reg}`.toUpperCase();
    case 'dec-reg': return `DEC ${inst.reg}`.toUpperCase();
    case 'inc-pair': return `INC ${inst.pair}`.toUpperCase();
    case 'dec-pair': return `DEC ${inst.pair}`.toUpperCase();
    case 'inc-ixd': return `INC ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `DEC ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'add-pair': return `ADD ${inst.dest}, ${inst.src}`.toUpperCase();
    case 'adc-pair': return `ADC HL, ${inst.src}`.toUpperCase();
    case 'sbc-pair': return `SBC HL, ${inst.src}`.toUpperCase();
    case 'alu-reg': return `${inst.op} A, ${inst.src}`.toUpperCase();
    case 'alu-imm': return `${inst.op} A, ${hex2(inst.value)}`.toUpperCase();
    case 'alu-ixd': return `${inst.op} A, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'push': return `PUSH ${inst.pair}`.toUpperCase();
    case 'pop': return `POP ${inst.pair}`.toUpperCase();
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${(inst.indirectRegister || 'HL').toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'rst': return `RST ${hex2(inst.vector)}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg}`.toUpperCase();
    case 'bit-res': return `RES ${inst.bit}, ${inst.reg}`.toUpperCase();
    case 'bit-set': return `SET ${inst.bit}, ${inst.reg}`.toUpperCase();
    case 'bit-test-ind': return `BIT ${inst.bit}, (HL)`;
    case 'bit-res-ind': return `RES ${inst.bit}, (HL)`;
    case 'bit-set-ind': return `SET ${inst.bit}, (HL)`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `RES ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `SET ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate': return `${inst.operation} ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg': return `${inst.operation} ${inst.reg}`.toUpperCase();
    case 'rotate-ind': return `${inst.operation} (HL)`.toUpperCase();
    case 'in-imm': return `IN A, (${hex2(inst.port)})`;
    case 'out-imm': return `OUT (${hex2(inst.port)}), A`;
    case 'in-reg': return `IN ${inst.reg}, (C)`.toUpperCase();
    case 'out-reg': return `OUT (C), ${inst.reg}`.toUpperCase();
    case 'in0': return `IN0 ${inst.reg}, (${hex2(inst.port)})`.toUpperCase();
    case 'out0': return `OUT0 (${hex2(inst.port)}), ${inst.reg}`.toUpperCase();
    case 'im': return `IM ${inst.value}`;
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-pair': return `EX (SP), ${inst.pair}`.toUpperCase();
    case 'lea': return `LEA ${inst.dest}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`.toUpperCase();
    case 'mlt': return `MLT ${inst.reg}`.toUpperCase();
    case 'tst-reg': return `TST A, ${inst.reg}`.toUpperCase();
    case 'tst-ind': return 'TST A, (HL)';
    case 'tst-imm': return `TST A, ${hex2(inst.value)}`;
    case 'tstio': return `TSTIO ${hex2(inst.value)}`;
    default: return `${t} ${JSON.stringify(inst)}`;
  }
}

// ══════════════════════════════════════════════════════════════
// Static disassembly helpers
// ══════════════════════════════════════════════════════════════

function disasm(start, maxInstrs) {
  const instrs = [];
  let pc = start;
  for (let i = 0; i < maxInstrs; i++) {
    if (pc >= rom.length) break;
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.length === 0) {
      instrs.push({ pc, tag: 'db', length: 1, raw: rom[pc] });
      pc++;
    } else {
      instrs.push(inst);
      pc = inst.pc + inst.length;
    }
  }
  return instrs;
}

function isUnconditionalEnd(inst) {
  if (!inst.tag) return false;
  return ['ret', 'jp', 'jp-indirect', 'reti', 'retn'].includes(inst.tag);
}

function disasmFunc(start, maxInstrs) {
  const instrs = disasm(start, maxInstrs);
  const result = [];
  for (const inst of instrs) {
    result.push(inst);
    if (isUnconditionalEnd(inst)) break;
  }
  return result;
}

function printInstr(inst) {
  const rawBytes = [];
  for (let b = 0; b < inst.length; b++) rawBytes.push(hex2(rom[inst.pc + b]));
  const asm = inst.tag === 'db' ? `DB ${hex2(inst.raw)}` : fmtInst(inst);
  return `  ${hex(inst.pc)}: ${rawBytes.join(' ').padEnd(20)} ${asm}`;
}

function analyzeFunction(instrs) {
  const iyAccesses = [];
  const ramReads = [];
  const ramWrites = [];
  const calls = [];
  const jumps = [];
  const jpsUnconditional = [];

  for (const inst of instrs) {
    const t = inst.tag;

    if (inst.indexRegister === 'iy') {
      const offset = inst.displacement;
      const absAddr = IY_BASE + offset;
      iyAccesses.push({ pc: inst.pc, tag: t, offset, absAddr, asm: fmtInst(inst) });
    }

    if (t === 'ld-reg-mem' || t === 'ld-pair-mem') {
      if (inst.addr >= 0xD00000) {
        ramReads.push({ pc: inst.pc, addr: inst.addr, asm: fmtInst(inst) });
      }
    }

    if (t === 'ld-mem-reg' || t === 'ld-mem-pair') {
      if (inst.addr >= 0xD00000) {
        ramWrites.push({ pc: inst.pc, addr: inst.addr, asm: fmtInst(inst) });
      }
    }

    if (t === 'call' || t === 'call-conditional') {
      calls.push({ pc: inst.pc, target: inst.target, cond: inst.condition || null, asm: fmtInst(inst) });
    }

    if (t === 'jp-conditional' || t === 'jr-conditional') {
      jumps.push({ pc: inst.pc, target: inst.target, cond: inst.condition, asm: fmtInst(inst) });
    }

    if (t === 'jp') {
      jpsUnconditional.push({ pc: inst.pc, target: inst.target, asm: fmtInst(inst) });
    }
  }

  return { iyAccesses, ramReads, ramWrites, calls, jumps, jpsUnconditional };
}

function printAnalysis(label, analysis) {
  console.log(`\n--- Analysis: ${label} ---`);

  if (analysis.iyAccesses.length) {
    console.log('\n  IY offset accesses:');
    for (const a of analysis.iyAccesses) {
      console.log(`    ${hex(a.pc)}: ${a.asm}   [IY+${hex2(a.offset)} = ${hex(a.absAddr)}]`);
    }
  }

  if (analysis.ramReads.length) {
    console.log('\n  RAM reads (>= 0xD00000):');
    for (const r of analysis.ramReads) {
      console.log(`    ${hex(r.pc)}: ${r.asm}   [${hex(r.addr)}]`);
    }
  }

  if (analysis.ramWrites.length) {
    console.log('\n  RAM writes (>= 0xD00000):');
    for (const w of analysis.ramWrites) {
      console.log(`    ${hex(w.pc)}: ${w.asm}   [${hex(w.addr)}]`);
    }
  }

  if (analysis.calls.length) {
    console.log('\n  Sub-calls:');
    for (const c of analysis.calls) {
      console.log(`    ${hex(c.pc)}: ${c.asm}`);
    }
  }

  if (analysis.jumps.length) {
    console.log('\n  Conditional jumps:');
    for (const j of analysis.jumps) {
      console.log(`    ${hex(j.pc)}: ${j.asm}`);
    }
  }

  if (analysis.jpsUnconditional.length) {
    console.log('\n  Unconditional JP (tail calls):');
    for (const j of analysis.jpsUnconditional) {
      console.log(`    ${hex(j.pc)}: ${j.asm}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Transpiled module loader (supports .js or .js.gz)
// ══════════════════════════════════════════════════════════════

function ensureTranspiledModule() {
  const jsPath = path.join(__dirname, 'ROM.transpiled.js');
  const gzPath = path.join(__dirname, 'ROM.transpiled.js.gz');

  if (fs.existsSync(jsPath)) {
    return { modulePath: jsPath, tempPath: null };
  }

  if (!fs.existsSync(gzPath)) {
    return null;
  }

  const tempPath = path.join(os.tmpdir(), `ti84-phase305-${process.pid}.mjs`);
  fs.writeFileSync(tempPath, gunzipSync(fs.readFileSync(gzPath)));
  return { modulePath: tempPath, tempPath };
}

function cleanupTemp(bundle) {
  if (!bundle?.tempPath) return;
  try { fs.unlinkSync(bundle.tempPath); } catch {}
}

// ══════════════════════════════════════════════════════════════
// Warm boot sequence (matches phase 99d)
// ══════════════════════════════════════════════════════════════

function warmBoot(executor, cpu, mem) {
  // Stage 1: Z80-mode cold boot
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  // Reset CPU state for kernel init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Stage 2: kernel init
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  // Stabilize for post-init
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Stage 3: post-init
  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function resetForTrace(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;
  cpu.f = 0x40; // Z flag set
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

// ══════════════════════════════════════════════════════════════
// Runtime trace helpers
// ══════════════════════════════════════════════════════════════

function traceExecution(executor, cpu, mem, entryPoint, maxSteps, label) {
  const trace = [];
  const ramAccesses = [];
  const callStack = [];
  let depth = 0;

  // Intercept memory reads/writes for RAM tracking
  const origRead8 = cpu.read8.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);

  const trackRead = (addr) => {
    const val = origRead8(addr);
    if (addr >= 0xD00000 && addr < 0xE00000) {
      ramAccesses.push({ type: 'R', addr, val, step: trace.length });
    }
    return val;
  };

  const trackWrite = (addr, val) => {
    if (addr >= 0xD00000 && addr < 0xE00000) {
      ramAccesses.push({ type: 'W', addr, val: val & 0xFF, step: trace.length });
    }
    origWrite8(addr, val);
  };

  cpu.read8 = trackRead;
  cpu.write8 = trackWrite;

  const result = executor.runFrom(entryPoint, 'adl', {
    maxSteps,
    maxLoopIterations: 200,
    onBlock(pc, mode, meta, step) {
      const entry = {
        step,
        pc,
        a: cpu.a,
        f: cpu.f,
        bc: cpu._bc,
        de: cpu._de,
        hl: cpu._hl,
        sp: cpu.sp,
        depth,
      };

      // Detect CALL entries
      if (meta && meta.exits) {
        for (const exit of meta.exits) {
          if (exit.type === 'call') {
            entry.isCallSite = true;
            entry.callTarget = exit.target;
          }
        }
      }

      trace.push(entry);
    },
  });

  // Restore original accessors
  cpu.read8 = origRead8;
  cpu.write8 = origWrite8;

  return { trace, ramAccesses, result };
}

function printTrace(label, traceData) {
  const { trace, ramAccesses, result } = traceData;

  console.log(`\n  Trace: ${label}`);
  console.log(`  Steps: ${result.steps}, Termination: ${result.termination}, LastPC: ${hex(result.lastPc)}`);
  console.log(`  Blocks visited: ${trace.length}`);

  console.log('\n  Block execution log:');
  for (const entry of trace.slice(0, 80)) {
    const callInfo = entry.isCallSite ? ` -> CALL ${hex(entry.callTarget)}` : '';
    console.log(
      `    [${String(entry.step).padStart(4)}] PC=${hex(entry.pc)} ` +
      `A=${hex2(entry.a)} F=${hex2(entry.f)} ` +
      `BC=${hex(entry.bc)} DE=${hex(entry.de)} HL=${hex(entry.hl)} ` +
      `SP=${hex(entry.sp)}${callInfo}`
    );
  }
  if (trace.length > 80) {
    console.log(`    ... (${trace.length - 80} more blocks)`);
  }

  // Summarize unique RAM addresses accessed
  const readAddrs = new Map();
  const writeAddrs = new Map();
  for (const acc of ramAccesses) {
    if (acc.type === 'R') {
      if (!readAddrs.has(acc.addr)) readAddrs.set(acc.addr, []);
      readAddrs.get(acc.addr).push(acc.val);
    } else {
      if (!writeAddrs.has(acc.addr)) writeAddrs.set(acc.addr, []);
      writeAddrs.get(acc.addr).push(acc.val);
    }
  }

  if (readAddrs.size > 0) {
    console.log(`\n  RAM reads (${readAddrs.size} unique addrs, ${ramAccesses.filter(a => a.type === 'R').length} total):`);
    const sorted = [...readAddrs.entries()].sort((a, b) => a[0] - b[0]);
    for (const [addr, vals] of sorted.slice(0, 40)) {
      const uniqueVals = [...new Set(vals)].map(v => hex2(v)).join(', ');
      const known = addr === 0xD005F8 ? ' (OP1)' :
                    addr === 0xD00603 ? ' (OP2)' :
                    (addr >= 0xD40000 && addr < 0xD40000 + 320*240*2) ? ' (VRAM)' : '';
      console.log(`    ${hex(addr)}${known}: values=[${uniqueVals}] (${vals.length}x)`);
    }
    if (sorted.length > 40) console.log(`    ... (${sorted.length - 40} more)`);
  }

  if (writeAddrs.size > 0) {
    console.log(`\n  RAM writes (${writeAddrs.size} unique addrs, ${ramAccesses.filter(a => a.type === 'W').length} total):`);
    const sorted = [...writeAddrs.entries()].sort((a, b) => a[0] - b[0]);
    for (const [addr, vals] of sorted.slice(0, 40)) {
      const uniqueVals = [...new Set(vals)].map(v => hex2(v)).join(', ');
      const known = (addr >= 0xD40000 && addr < 0xD40000 + 320*240*2) ? ' (VRAM)' : '';
      console.log(`    ${hex(addr)}${known}: values=[${uniqueVals}] (${vals.length}x)`);
    }
    if (sorted.length > 40) console.log(`    ... (${sorted.length - 40} more)`);
  }
}

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log('Phase 305: LCD refresh inner function 0x06868A');
  console.log('=' .repeat(70));
  console.log('Target:    0x06868A (LCD refresh inner)');
  console.log('Wrapper:   0x05BF5C (CALL 0x06868A + JP 0x07F7D6)');
  console.log('Sub-calls: 0x07F7A4, 0x07FE5A, 0x0686A8');
  console.log('Tail JP:   0x07FE28 (conditional)');
  console.log('Key RAM:   0xD005F8=OP1, 0xD00603=OP2, 0xD40000=VRAM');
  console.log('IY base:   0xD00080');

  // ──────────────────────────────────────────────────────────
  // SECTION 1: Static disassembly of 0x06868A
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('SECTION 1: Static disassembly — 0x06868A (main target)');
  console.log('='.repeat(70));

  const mainInstrs = disasmFunc(TARGET_MAIN, 60);
  for (const inst of mainInstrs) console.log(printInstr(inst));
  console.log(`\n  ${mainInstrs.length} instructions`);

  const mainAnalysis = analyzeFunction(mainInstrs);
  printAnalysis('0x06868A — LCD refresh inner', mainAnalysis);

  // ──────────────────────────────────────────────────────────
  // SECTION 2: Static disassembly of wrapper 0x05BF5C
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('SECTION 2: Static disassembly — 0x05BF5C (wrapper)');
  console.log('='.repeat(70));

  const wrapperInstrs = disasmFunc(WRAPPER_05BF5C, 20);
  for (const inst of wrapperInstrs) console.log(printInstr(inst));
  console.log(`\n  ${wrapperInstrs.length} instructions`);

  const wrapperAnalysis = analyzeFunction(wrapperInstrs);
  printAnalysis('0x05BF5C — wrapper', wrapperAnalysis);

  // ──────────────────────────────────────────────────────────
  // SECTION 3: Static disassembly of each sub-call
  // ──────────────────────────────────────────────────────────
  const subTargets = [
    { addr: SUB_07F7A4, label: '0x07F7A4 — sub-call 1' },
    { addr: SUB_07FE5A, label: '0x07FE5A — sub-call 2' },
    { addr: SUB_0686A8, label: '0x0686A8 — sub-call 3' },
    { addr: SUB_07FE28, label: '0x07FE28 — conditional tail target' },
    { addr: TAIL_07F7D6, label: '0x07F7D6 — wrapper tail JP target' },
  ];

  for (const sub of subTargets) {
    console.log('\n' + '='.repeat(70));
    console.log(`SECTION 3: Static disassembly — ${sub.label}`);
    console.log('='.repeat(70));

    const instrs = disasmFunc(sub.addr, 60);
    for (const inst of instrs) console.log(printInstr(inst));
    console.log(`\n  ${instrs.length} instructions`);

    const analysis = analyzeFunction(instrs);
    printAnalysis(sub.label, analysis);

    // Expand sub-calls one level deep
    if (analysis.calls.length > 0) {
      console.log('\n  --- Nested sub-call expansion (first 15 instr each) ---');
      const seenNested = new Set();
      for (const c of analysis.calls) {
        if (seenNested.has(c.target)) continue;
        seenNested.add(c.target);
        console.log(`\n  CALL ${hex(c.target)} (from ${sub.label}${c.cond ? ', cond: ' + c.cond : ''}):`);
        const nestedInstrs = disasmFunc(c.target, 15);
        for (const ni of nestedInstrs) console.log('  ' + printInstr(ni));
      }
    }

    if (analysis.jpsUnconditional.length > 0) {
      for (const jp of analysis.jpsUnconditional) {
        if (subTargets.some(s => s.addr === jp.target)) continue;
        console.log(`\n  --- Tail JP target ${hex(jp.target)} ---`);
        const jpInstrs = disasmFunc(jp.target, 15);
        for (const ji of jpInstrs) console.log('  ' + printInstr(ji));
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // SECTION 4: Runtime execution traces
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('SECTION 4: Runtime execution traces');
  console.log('='.repeat(70));

  const bundle = ensureTranspiledModule();
  if (!bundle) {
    console.log('ERROR: ROM.transpiled.js or .gz not found. Skipping runtime traces.');
    return;
  }

  try {
    const { createExecutor } = await import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href);
    const { createPeripheralBus } = await import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href);
    const romModule = await import(pathToFileURL(bundle.modulePath).href);
    const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    console.log('\n  Performing warm boot...');
    warmBoot(executor, cpu, mem);
    console.log('  Warm boot complete.');

    // Snapshot post-boot state for reuse
    const ramSnap = new Uint8Array(mem.slice(0xD00000, 0xE00000));
    const cpuSnap = {};
    for (const f of ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
                      'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles']) {
      cpuSnap[f] = cpu[f];
    }

    // Show key RAM values before tracing
    console.log('\n  Pre-trace RAM state:');
    console.log(`    OP1 (0xD005F8): ${hex2(mem[0xD005F8])}`);
    console.log(`    OP2 (0xD00603): ${hex2(mem[0xD00603])}`);
    console.log(`    IY+0x53 (0xD000D3): ${hex2(mem[0xD000D3])}`);
    console.log(`    IY+0x49 (0xD000C9): ${hex2(mem[0xD000C9])}`);
    console.log(`    IY+0x44 (0xD000C4): ${hex2(mem[0xD000C4])}`);

    // ── Trace 4a: Main target 0x06868A (400 steps) ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4a: 0x06868A — main LCD refresh inner (400 steps)');
    console.log('-'.repeat(60));

    resetForTrace(cpu, mem);
    // Restore RAM snapshot
    mem.set(ramSnap, 0xD00000);

    const trace4a = traceExecution(executor, cpu, mem, TARGET_MAIN, 400, '0x06868A');
    printTrace('0x06868A — LCD refresh inner', trace4a);

    // ── Trace 4b: Sub-call 0x07F7A4 (200 steps) ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4b: 0x07F7A4 — sub-call 1 (200 steps)');
    console.log('-'.repeat(60));

    // Restore state
    for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
    resetForTrace(cpu, mem);
    mem.set(ramSnap, 0xD00000);

    const trace4b = traceExecution(executor, cpu, mem, SUB_07F7A4, 200, '0x07F7A4');
    printTrace('0x07F7A4 — sub-call 1', trace4b);

    // ── Trace 4c: Sub-call 0x07FE5A (200 steps) ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4c: 0x07FE5A — sub-call 2 (200 steps)');
    console.log('-'.repeat(60));

    for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
    resetForTrace(cpu, mem);
    mem.set(ramSnap, 0xD00000);

    const trace4c = traceExecution(executor, cpu, mem, SUB_07FE5A, 200, '0x07FE5A');
    printTrace('0x07FE5A — sub-call 2', trace4c);

    // ── Trace 4d: Sub-call 0x0686A8 (200 steps) ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4d: 0x0686A8 — sub-call 3 (200 steps)');
    console.log('-'.repeat(60));

    for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
    resetForTrace(cpu, mem);
    mem.set(ramSnap, 0xD00000);

    const trace4d = traceExecution(executor, cpu, mem, SUB_0686A8, 200, '0x0686A8');
    printTrace('0x0686A8 — sub-call 3', trace4d);

    // ── Trace 4e: Conditional tail target 0x07FE28 (200 steps) ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4e: 0x07FE28 — conditional tail target (200 steps)');
    console.log('-'.repeat(60));

    for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
    resetForTrace(cpu, mem);
    mem.set(ramSnap, 0xD00000);

    const trace4e = traceExecution(executor, cpu, mem, SUB_07FE28, 200, '0x07FE28');
    printTrace('0x07FE28 — conditional tail target', trace4e);

    // ──────────────────────────────────────────────────────────
    // SECTION 5: Refresh pipeline summary
    // ──────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(70));
    console.log('SECTION 5: Refresh pipeline summary');
    console.log('='.repeat(70));

    // Collect all unique PCs visited in the main trace
    const mainPCs = trace4a.trace.map(t => t.pc);
    const uniqueMainPCs = [...new Set(mainPCs)];

    console.log(`\n  Main trace (0x06868A) visited ${uniqueMainPCs.length} unique blocks:`);
    for (const pc of uniqueMainPCs.sort((a, b) => a - b)) {
      const visits = mainPCs.filter(p => p === pc).length;
      console.log(`    ${hex(pc)} (${visits}x)`);
    }

    // Check which sub-calls were actually reached
    const mainHitSubs = {
      '0x07F7A4': mainPCs.includes(SUB_07F7A4),
      '0x07FE5A': mainPCs.includes(SUB_07FE5A),
      '0x0686A8': mainPCs.includes(SUB_0686A8),
      '0x07FE28': mainPCs.includes(SUB_07FE28),
    };
    console.log('\n  Sub-calls reached from main trace:');
    for (const [label, hit] of Object.entries(mainHitSubs)) {
      console.log(`    ${label}: ${hit ? 'YES' : 'NO'}`);
    }

    // VRAM write summary
    const vramWrites4a = trace4a.ramAccesses.filter(a =>
      a.type === 'W' && a.addr >= 0xD40000 && a.addr < 0xD40000 + 320*240*2
    );
    const vramWrites4b = trace4b.ramAccesses.filter(a =>
      a.type === 'W' && a.addr >= 0xD40000 && a.addr < 0xD40000 + 320*240*2
    );
    const vramWrites4c = trace4c.ramAccesses.filter(a =>
      a.type === 'W' && a.addr >= 0xD40000 && a.addr < 0xD40000 + 320*240*2
    );
    const vramWrites4d = trace4d.ramAccesses.filter(a =>
      a.type === 'W' && a.addr >= 0xD40000 && a.addr < 0xD40000 + 320*240*2
    );
    const vramWrites4e = trace4e.ramAccesses.filter(a =>
      a.type === 'W' && a.addr >= 0xD40000 && a.addr < 0xD40000 + 320*240*2
    );

    console.log('\n  VRAM write counts per trace:');
    console.log(`    0x06868A (main):   ${vramWrites4a.length} writes`);
    console.log(`    0x07F7A4 (sub 1):  ${vramWrites4b.length} writes`);
    console.log(`    0x07FE5A (sub 2):  ${vramWrites4c.length} writes`);
    console.log(`    0x0686A8 (sub 3):  ${vramWrites4d.length} writes`);
    console.log(`    0x07FE28 (tail):   ${vramWrites4e.length} writes`);

    // RAM (non-VRAM) write summary for each
    for (const [label, trace] of [
      ['0x06868A', trace4a],
      ['0x07F7A4', trace4b],
      ['0x07FE5A', trace4c],
      ['0x0686A8', trace4d],
      ['0x07FE28', trace4e],
    ]) {
      const nonVramWrites = trace.ramAccesses.filter(a =>
        a.type === 'W' && !(a.addr >= 0xD40000 && a.addr < 0xD40000 + 320*240*2)
      );
      if (nonVramWrites.length > 0) {
        const uniqueAddrs = [...new Set(nonVramWrites.map(a => a.addr))].sort((a, b) => a - b);
        console.log(`\n  ${label} non-VRAM writes (${uniqueAddrs.length} unique addrs):`);
        for (const addr of uniqueAddrs.slice(0, 20)) {
          const vals = nonVramWrites.filter(a => a.addr === addr).map(a => hex2(a.val));
          const uniqueVals = [...new Set(vals)].join(', ');
          console.log(`    ${hex(addr)}: [${uniqueVals}] (${vals.length}x)`);
        }
      }
    }

    console.log('\n  Pipeline interpretation:');
    console.log('    0x06868A: Entry point — reads OP1 (0xD005F8), checks flags,');
    console.log('              dispatches to sub-functions for LCD refresh stages.');
    console.log('    0x07F7A4: Sub-call 1 — role determined by trace above.');
    console.log('    0x07FE5A: Sub-call 2 — role determined by trace above.');
    console.log('    0x0686A8: Sub-call 3 — role determined by trace above.');
    console.log('    0x07FE28: Conditional tail — reached when specific flag condition met.');
    console.log('    0x07F7D6: Wrapper tail (from 0x05BF5C) — post-refresh cleanup.');

  } finally {
    cleanupTemp(bundle);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

/*
═══════════════════════════════════════════════════════════════════
OUTPUT (node TI-84_Plus_CE/probe-phase305-06868A-lcd-refresh.mjs)
═══════════════════════════════════════════════════════════════════

Phase 305: LCD refresh inner function 0x06868A
======================================================================
Target:    0x06868A (LCD refresh inner)
Wrapper:   0x05BF5C (CALL 0x06868A + JP 0x07F7D6)
Sub-calls: 0x07F7A4, 0x07FE5A, 0x0686A8
Tail JP:   0x07FE28 (conditional)
Key RAM:   0xD005F8=OP1, 0xD00603=OP2, 0xD40000=VRAM
IY base:   0xD00080

======================================================================
SECTION 1: Static disassembly — 0x06868A (main target)
======================================================================
  0x06868A: 0x21 0xF8 0x05 0xD0  LD HL, 0XD005F8
  0x06868E: 0xCB 0x76            BIT 6, (HL)
  0x068690: 0xC0                 RET NZ
  0x068691: 0xCD 0xA4 0xF7 0x07  CALL 0x07F7A4
  0x068695: 0xF5                 PUSH AF
  0x068696: 0xCD 0x5A 0xFE 0x07  CALL 0x07FE5A
  0x06869A: 0xCD 0xA8 0x86 0x06  CALL 0x0686A8
  0x06869E: 0xF1                 POP AF
  0x06869F: 0x21 0xF8 0x05 0xD0  LD HL, 0XD005F8
  0x0686A3: 0xCA 0x28 0xFE 0x07  JP Z, 0x07FE28
  0x0686A7: 0xC9                 RET

  11 instructions

--- Analysis: 0x06868A — LCD refresh inner ---

  Sub-calls:
    0x068691: CALL 0x07F7A4
    0x068696: CALL 0x07FE5A
    0x06869A: CALL 0x0686A8

  Conditional jumps:
    0x0686A3: JP Z, 0x07FE28

======================================================================
SECTION 2: Static disassembly — 0x05BF5C (wrapper)
======================================================================
  0x05BF5C: 0xCD 0x8A 0x86 0x06  CALL 0x06868A
  0x05BF60: 0xC3 0xD6 0xF7 0x07  JP 0x07F7D6

  2 instructions

--- Analysis: 0x05BF5C — wrapper ---

  Sub-calls:
    0x05BF5C: CALL 0x06868A

  Unconditional JP (tail calls):
    0x05BF60: JP 0x07F7D6

======================================================================
SECTION 3: Static disassembly — 0x07F7A4 — sub-call 1
======================================================================
  0x07F7A4: 0x3A 0xF8 0x05 0xD0  LD A, (0XD005F8)
  0x07F7A8: 0xE6 0x3F            AND A, 0X3F
  0x07F7AA: 0xFE 0x0C            CP A, 0X0C
  0x07F7AC: 0xC8                 RET Z
  0x07F7AD: 0xFE 0x1B            CP A, 0X1B
  0x07F7AF: 0xC8                 RET Z
  0x07F7B0: 0xFE 0x1D            CP A, 0X1D
  0x07F7B2: 0x30 0x03            JR NC, 0x07F7B7
  0x07F7B4: 0xFE 0x0C            CP A, 0X0C
  0x07F7B6: 0xC9                 RET

  10 instructions

  ROLE: OP1 classifier. Reads (D005F8) & 0x3F, compares against token
  classes 0x0C, 0x1B, 0x1D. Returns Z if token matches special class,
  NZ otherwise. The Z flag result is preserved by PUSH AF / POP AF in
  the caller and used to decide whether JP Z,0x07FE28 is taken.

======================================================================
SECTION 3: Static disassembly — 0x07FE5A — sub-call 2
======================================================================
  0x07FE5A: 0x21 0xF8 0x05 0xD0  LD HL, 0XD005F8
  0x07FE5E: 0x7E                 LD A, (HL)
  0x07FE5F: 0xCD 0x65 0xFE 0x07  CALL 0x07FE65
  0x07FE63: 0x77                 LD (HL), A
  0x07FE64: 0xC9                 RET

  ROLE: OP1 token normalizer (forward). Reads OP1, passes to 0x07FE65
  (lookup table at 0x07FE91 with 5 entries, maps token class to
  replacement via table at 0x07FE8A). Writes result back to OP1.

======================================================================
SECTION 3: Static disassembly — 0x0686A8 — sub-call 3
======================================================================
  0x0686A8: 0xCD 0xBD 0xF7 0x07  CALL 0x07F7BD
  0x0686AC: 0xFE 0x20            CP A, 0X20
  0x0686AE: 0xCA 0xA7 0xCF 0x07  JP Z, 0x07CFA7
  0x0686B2: 0xFE 0x21            CP A, 0X21
  0x0686B4: 0xCA 0xA7 0xCF 0x07  JP Z, 0x07CFA7
  0x0686B8: 0xFE 0x1C            CP A, 0X1C
  0x0686BA: 0xCA 0x1A 0xCF 0x07  JP Z, 0x07CF1A
  0x0686BE: 0xC9                 RET

  ROLE: Token-type dispatcher. Calls 0x07F7BD (extracts OP1 & 0x3F),
  then dispatches:
    0x20, 0x21 -> JP 0x07CFA7 (likely graph/matrix token handler)
    0x1C       -> JP 0x07CF1A (likely list token handler)
    else       -> RET (no special handling)

======================================================================
SECTION 3: Static disassembly — 0x07FE28 — conditional tail target
======================================================================
  0x07FE28: 0x7E                 LD A, (HL)
  0x07FE29: 0xCD 0x2F 0xFE 0x07  CALL 0x07FE2F
  0x07FE2D: 0x77                 LD (HL), A
  0x07FE2E: 0xC9                 RET

  ROLE: OP1 token normalizer (reverse). Mirror of 0x07FE5A — reads
  (HL) [=OP1], calls 0x07FE2F (reverse lookup via table at 0x07FE8A/
  0x07FE90), writes result back. Reached when 0x07F7A4 returned Z
  (token was special class 0x0C/0x1B/0x1D).

======================================================================
SECTION 3: Static disassembly — 0x07F7D6 — wrapper tail JP target
======================================================================
  0x07F7D6: 0x21 0xF8 0x05 0xD0  LD HL, 0XD005F8
  0x07F7DA: 0x7E                 LD A, (HL)
  0x07F7DB: 0xE6 0xC0            AND A, 0XC0
  0x07F7DD: 0x77                 LD (HL), A
  0x07F7DE: 0xC9                 RET

  ROLE: OP1 high-bits mask. Strips low 6 bits from OP1, keeping only
  bits 7-6. This is the post-refresh cleanup: after the inner refresh
  function has processed the token, the wrapper clears the token class
  field, leaving only the flag bits.

======================================================================
SECTION 4: Runtime execution traces
======================================================================

  Performing warm boot...
  Warm boot complete.

  Pre-trace RAM state:
    OP1 (0xD005F8): 0x00
    OP2 (0xD00603): 0x00
    IY+0x53 (0xD000D3): 0x00
    IY+0x49 (0xD000C9): 0x00
    IY+0x44 (0xD000C4): 0x00

------------------------------------------------------------
TRACE 4a: 0x06868A — main LCD refresh inner (400 steps)
------------------------------------------------------------

  Steps: 32, Termination: halt, LastPC: 0x040D40
  Blocks visited: 32

  Key flow: OP1=0x00 at entry -> BIT 6,(HL) test CLEAR -> proceeds.
  0x07F7A4 reads OP1=0x00, AND 0x3F=0x00, CP 0x0C -> NZ, CP 0x1B -> NZ,
  CP 0x1D -> NC not taken, CP 0x0C again -> NZ. Returns with Z CLEAR (NZ).
  0x07FE5A normalizes OP1: 0x00 not in table -> unchanged, writes 0x00 back.
  0x0686A8 extracts OP1&0x3F=0x00: not 0x20/0x21/0x1C -> RET (no dispatch).
  POP AF restores NZ from 0x07F7A4 -> JP Z,0x07FE28 NOT TAKEN -> RET.

  Sub-calls reached from main trace:
    0x07F7A4: YES
    0x07FE5A: YES
    0x0686A8: YES
    0x07FE28: NO (Z flag was clear because OP1 token 0x00 was not special)

  VRAM write counts: 0 (no rendering in this path with OP1=0x00)

  Post-return flow fell through to 0x02FDC2 (CoorMon event loop).

------------------------------------------------------------
TRACE 4e: 0x07FE28 — conditional tail target (200 steps)
------------------------------------------------------------

  Steps: 200, Termination: max_steps
  72 VRAM writes observed.

  The tail path writes to VRAM addresses starting at 0xD4114E with
  alternating 0x0000 and 0xFFE0 pixel values — this is actual LCD
  rendering. The path flows through 0x08C366 (CoorMon key dispatch),
  0x0A331E/0x0A33FB (screen draw routines writing pixel data).

  Non-VRAM writes include 0xD0058C (kbdKey), 0xD005F5/F6 (OP1 area).

======================================================================
SECTION 5: Pipeline summary
======================================================================

  REFRESH PIPELINE (0x05BF5C -> 0x06868A -> 0x07F7D6):

  1. ENTRY GUARD: LD HL,D005F8; BIT 6,(HL); RET NZ
     If bit 6 of OP1 is set, skip refresh entirely.

  2. TOKEN CLASSIFIER (0x07F7A4): Read OP1 & 0x3F, test for special
     token classes 0x0C, 0x1B, >= 0x1D. Returns Z if special.
     Result saved on stack via PUSH AF.

  3. FORWARD NORMALIZER (0x07FE5A): Look up OP1 token in 5-entry
     table at 0x07FE91 -> replacement table at 0x07FE8A. If found,
     replace OP1's low bits with new token class. Write back to D005F8.

  4. TYPE DISPATCHER (0x0686A8): Extract OP1 & 0x3F via 0x07F7BD.
     Dispatch graph/matrix tokens (0x20/0x21) to 0x07CFA7,
     list tokens (0x1C) to 0x07CF1A, else return.

  5. CONDITIONAL REVERSE NORMALIZE: POP AF (from step 2).
     If Z was set (special token), JP to 0x07FE28 which reverses the
     normalization from step 3 (reverse lookup via 0x07FE2F).
     If NZ, just RET.

  6. CLEANUP (0x07F7D6 via wrapper): AND OP1 with 0xC0, stripping
     the token class bits and keeping only the high flag bits.
     This marks the refresh as complete.

  The pipeline is a normalize-dispatch-denormalize pattern:
  certain token types need their class byte remapped before the
  type dispatcher can route them, then remapped back afterward.
*/
