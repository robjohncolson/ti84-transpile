#!/usr/bin/env node
// Phase 307: Decode 0x07CFD0 recursive inner dispatch
//
// The graph/matrix handler at 0x07CFA7 calls into 0x07CFD0 for subtype-
// specific rendering. This probe:
//   1. Statically disassembles 0x07CFD0 and all branch targets
//   2. Maps each subtype (0x88, 0x89, 0x80, 0x08, 0x98) to its TI-OS type
//   3. Documents what each branch renders
//   4. Shows dispatch tree structure
//   5. Traces recursive calls at runtime
//
// ================================================================
// DISPATCH TABLE (from static analysis):
//
//   0x07CFD0  entry: LD B, A  (save subtype)
//     A == 0x88 -> RET Z       (GraphDB, already handled — early exit)
//     A == 0x89 -> JR Z, 0x07CFFC  (graph equation path)
//     A == 0x80 -> JR Z, 0x07D000  (real variable / temp real)
//     A == 0x08 -> JR Z, 0x07CFE7  (complex variable / GraphDB)
//     A == 0x98 -> RET NZ      (unknown -> bail)
//                  fallthrough: CALL 0x06868A (LCD refresh re-entry!)
//
// SUBTYPE MEANINGS (high-bit = temp/archived flag):
//   0x88 = 0x08 | 0x80 = GraphDB + temp     -> early return (already rendered)
//   0x89 = 0x09 | 0x80 = GraphDB eq + temp  -> equation rendering path
//   0x80 = 0x00 | 0x80 = Real + temp         -> real variable rendering
//   0x08 = GraphDB (raw)                     -> complex variable rendering
//   0x98 = 0x18 | 0x80 = ??? + temp          -> LCD refresh recursion
//
// RECURSIVE CALLS:
//   - 0x98 path: CALL 0x06868A (the main LCD type dispatcher!)
//   - 0x08 path: CALL 0x07CF1A (list handler) after 0x07D018 resolver
//   - 0x89 path: CALL 0x06867E -> 0x06868A (LCD dispatcher via equation setup)
//   - 0x80 path: CALL 0x07CF1A (list handler) after 0x07D018 resolver
// ================================================================

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

// Key addresses
const GRAPH_INNER_DISPATCH = 0x07CFD0;
const GRAPH_VAR_RESOLVER   = 0x07D018;
const LIST_HANDLER         = 0x07CF1A;
const LCD_REFRESH_REENTRY  = 0x06868A;
const EQUATION_SETUP       = 0x06867E;
const LCD_TYPE_DISPATCHER  = 0x0686A8;
const OP1_OP2_SWAP         = 0x07FD30;
const GRAPH_MATRIX_HANDLER = 0x07CFA7;

// Subtype table
const SUBTYPES = [
  { code: 0x88, name: 'GraphDB+temp',       tiType: 'GraphDB (0x08) | temp (0x80)', branch: 'RET Z (early exit)' },
  { code: 0x89, name: 'GraphEq+temp',       tiType: 'GraphDB eq (0x09) | temp (0x80)', branch: 'JR Z -> 0x07CFFC (equation path)' },
  { code: 0x80, name: 'Real+temp',           tiType: 'Real (0x00) | temp (0x80)', branch: 'JR Z -> 0x07D000 (real var path)' },
  { code: 0x08, name: 'GraphDB/Complex',     tiType: 'GraphDB (0x08) or Complex (0x08)', branch: 'JR Z -> 0x07CFE7 (complex var path)' },
  { code: 0x98, name: 'Unknown+temp',        tiType: '??? (0x18) | temp (0x80)', branch: 'RET NZ (bail) / fallthrough -> CALL 0x06868A (recursion!)' },
];

// ================================================================
// Utility functions
// ================================================================

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

// ================================================================
// Static disassembly helpers
// ================================================================

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

function disasmRange(start, endAddr) {
  const instrs = [];
  let pc = start;
  while (pc <= endAddr) {
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

function printInstr(inst, indent = '  ') {
  const rawBytes = [];
  for (let b = 0; b < inst.length; b++) rawBytes.push(hex2(rom[inst.pc + b]));
  const asm = inst.tag === 'db' ? `DB ${hex2(inst.raw)}` : fmtInst(inst);
  return `${indent}${hex(inst.pc)}: ${rawBytes.join(' ').padEnd(20)} ${asm}`;
}

function analyzeFunction(instrs) {
  const calls = [];
  const jumps = [];
  const ramReads = [];
  const ramWrites = [];

  for (const inst of instrs) {
    const t = inst.tag;
    if (t === 'call' || t === 'call-conditional') {
      calls.push({ pc: inst.pc, target: inst.target, cond: inst.condition || null, asm: fmtInst(inst) });
    }
    if (t === 'jp-conditional' || t === 'jr-conditional') {
      jumps.push({ pc: inst.pc, target: inst.target, cond: inst.condition, asm: fmtInst(inst) });
    }
    if (t === 'ld-reg-mem' || t === 'ld-pair-mem') {
      if (inst.addr >= 0xD00000) ramReads.push({ pc: inst.pc, addr: inst.addr, asm: fmtInst(inst) });
    }
    if (t === 'ld-mem-reg' || t === 'ld-mem-pair') {
      if (inst.addr >= 0xD00000) ramWrites.push({ pc: inst.pc, addr: inst.addr, asm: fmtInst(inst) });
    }
  }

  return { calls, jumps, ramReads, ramWrites };
}

// ================================================================
// Transpiled module loader
// ================================================================

function ensureTranspiledModule() {
  const jsPath = path.join(__dirname, 'ROM.transpiled.js');
  const gzPath = path.join(__dirname, 'ROM.transpiled.js.gz');

  if (fs.existsSync(jsPath)) {
    return { modulePath: jsPath, tempPath: null };
  }

  if (!fs.existsSync(gzPath)) {
    return null;
  }

  const tempPath = path.join(os.tmpdir(), `ti84-phase307-${process.pid}.mjs`);
  fs.writeFileSync(tempPath, gunzipSync(fs.readFileSync(gzPath)));
  return { modulePath: tempPath, tempPath };
}

function cleanupTemp(bundle) {
  if (!bundle?.tempPath) return;
  try { fs.unlinkSync(bundle.tempPath); } catch {}
}

// ================================================================
// Warm boot (matches phase 99d)
// ================================================================

function warmBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

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

// ================================================================
// Runtime trace
// ================================================================

function traceExecution(executor, cpu, mem, entryPoint, maxSteps, label) {
  const trace = [];
  const callStack = [];

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
      };

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

  return { trace, result };
}

// ================================================================
// MAIN
// ================================================================

async function main() {
  console.log('Phase 307: LCD subtype dispatch — 0x07CFD0 recursive inner dispatch');
  console.log('=' .repeat(76));

  // ──────────────────────────────────────────────────────────
  // SECTION 1: Dispatch tree overview
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(76));
  console.log('SECTION 1: Dispatch tree — 0x07CFD0 inner subtype dispatch');
  console.log('='.repeat(76));

  console.log(`
  Parent call chain:
    0x0686A8 (LCD type dispatcher)
      -> OP1 & 0x3F == 0x20 or 0x21 -> JP 0x07CFA7 (graph/matrix handler)
        -> [after normalize + render] calls into 0x07CFD0 indirectly via
           the variable resolver (0x07D018), which reads OP1+1 subtype

  Dispatch tree at 0x07CFD0:
  +---------+-------------------------------------------+---------------------------+
  | Subtype | TI-OS Meaning                             | Branch Action             |
  +---------+-------------------------------------------+---------------------------+
  | 0x88    | GraphDB (0x08) + temp flag (0x80)         | RET Z (early exit)        |
  | 0x89    | Graph equation (0x09) + temp flag (0x80)  | -> 0x07CFFC (eq path)     |
  | 0x80    | Real (0x00) + temp flag (0x80)            | -> 0x07D000 (real path)   |
  | 0x08    | GraphDB / Complex (raw, no temp)          | -> 0x07CFE7 (complex)     |
  | 0x98    | 0x18 + temp flag (0x80)                   | -> 0x06868A (LCD refresh) |
  | other   | (anything else)                           | RET NZ (bail out)         |
  +---------+-------------------------------------------+---------------------------+

  Recursion points:
    0x98 -> CALL 0x06868A  (full LCD refresh re-entry = top-level dispatcher!)
    0x89 -> CALL 0x06867E  (equation setup -> CALL 0x06868A -> 0x0686A8 dispatch)
    0x08 -> CALL 0x07CF1A  (list handler, if resolver says "not resolved")
    0x80 -> CALL 0x07CF1A  (list handler, if resolver says "not resolved")
`);

  // ──────────────────────────────────────────────────────────
  // SECTION 2: Full disassembly of 0x07CFD0 - 0x07D017
  // ──────────────────────────────────────────────────────────
  console.log('='.repeat(76));
  console.log('SECTION 2: Static disassembly — 0x07CFD0 (dispatch) through 0x07D017');
  console.log('='.repeat(76));

  const dispatchInstrs = disasmRange(GRAPH_INNER_DISPATCH, 0x07D017);
  for (const inst of dispatchInstrs) {
    let annotation = '';
    // Add inline annotations for key instructions
    if (inst.pc === 0x07CFD0) annotation = '  ; save subtype in B';
    if (inst.pc === 0x07CFD1) annotation = '  ; GraphDB+temp -> already handled';
    if (inst.pc === 0x07CFD3) annotation = '  ; early exit for 0x88';
    if (inst.pc === 0x07CFD4) annotation = '  ; graph equation+temp?';
    if (inst.pc === 0x07CFD6) annotation = '  ; -> equation path at 0x07CFFC';
    if (inst.pc === 0x07CFD8) annotation = '  ; real+temp?';
    if (inst.pc === 0x07CFDA) annotation = '  ; -> real var path at 0x07D000';
    if (inst.pc === 0x07CFDC) annotation = '  ; GraphDB/complex (raw)?';
    if (inst.pc === 0x07CFDE) annotation = '  ; -> complex path at 0x07CFE7';
    if (inst.pc === 0x07CFE0) annotation = '  ; 0x98 = last known subtype';
    if (inst.pc === 0x07CFE2) annotation = '  ; bail if unknown subtype';
    if (inst.pc === 0x07CFE3) annotation = '  ; RECURSION: 0x98 -> full LCD refresh!';
    if (inst.pc === 0x07CFE7) annotation = '  ; === COMPLEX/0x08 ENTRY ===';
    if (inst.pc === 0x07CFEB) annotation = '  ; if resolved (Z) -> return 0x88';
    if (inst.pc === 0x07CFEE) annotation = '  ; swap OP1<->OP2';
    if (inst.pc === 0x07CFF2) annotation = '  ; RECURSION: render as list!';
    if (inst.pc === 0x07CFF6) annotation = '  ; swap back';
    if (inst.pc === 0x07CFFA) annotation = '  ; -> success exit (LD A,0x00; RET)';
    if (inst.pc === 0x07CFFC) annotation = '  ; === EQUATION/0x89 ENTRY ===';
    if (inst.pc === 0x07D000) annotation = '  ; === REAL VAR/0x80 ENTRY (fallthrough from 0x89) ===';
    if (inst.pc === 0x07D004) annotation = '  ; resolve variable';
    if (inst.pc === 0x07D008) annotation = '  ; save flags from resolver';
    if (inst.pc === 0x07D009) annotation = '  ; swap OP1<->OP2 back';
    if (inst.pc === 0x07D00D) annotation = '  ; restore resolver flags';
    if (inst.pc === 0x07D00E) annotation = '  ; if resolved (Z) -> return 0x88';
    if (inst.pc === 0x07D010) annotation = '  ; early exit if resolved';
    if (inst.pc === 0x07D011) annotation = '  ; RECURSION: not resolved -> list handler';
    if (inst.pc === 0x07D015) annotation = '  ; === SUCCESS EXIT ===';
    if (inst.pc === 0x07D017) annotation = '  ; return 0x00 (done)';

    console.log(printInstr(inst) + annotation);
  }

  const dispatchAnalysis = analyzeFunction(dispatchInstrs);
  console.log(`\n  Total instructions: ${dispatchInstrs.length}`);
  console.log(`  Sub-calls: ${dispatchAnalysis.calls.length}`);
  for (const c of dispatchAnalysis.calls) {
    const isRecursive =
      c.target === LCD_REFRESH_REENTRY ? ' ** RECURSIVE (LCD refresh re-entry) **' :
      c.target === LIST_HANDLER ? ' ** RECURSIVE (list handler) **' :
      c.target === EQUATION_SETUP ? ' ** RECURSIVE (equation setup -> LCD refresh) **' :
      c.target === OP1_OP2_SWAP ? ' (OP1/OP2 swap)' :
      c.target === GRAPH_VAR_RESOLVER ? ' (variable resolver)' : '';
    console.log(`    ${hex(c.pc)}: ${c.asm}${isRecursive}`);
  }

  // ──────────────────────────────────────────────────────────
  // SECTION 3: Variable resolver 0x07D018
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(76));
  console.log('SECTION 3: Static disassembly — 0x07D018 (variable resolver)');
  console.log('='.repeat(76));

  const resolverInstrs = disasmRange(GRAPH_VAR_RESOLVER, 0x07D089);
  for (const inst of resolverInstrs) {
    let annotation = '';
    if (inst.pc === 0x07D018) annotation = '  ; save IX (frame pointer)';
    if (inst.pc === 0x07D01A) annotation = '  ; IX = 0';
    if (inst.pc === 0x07D01F) annotation = '  ; IX = SP (build stack frame)';
    if (inst.pc === 0x07D021) annotation = '  ; push HL (save caller context)';
    if (inst.pc === 0x07D022) annotation = '  ; allocate 27-byte local frame';
    if (inst.pc === 0x07D025) annotation = '  ; SP = HL (frame base)';
    if (inst.pc === 0x07D02C) annotation = '  ; copy name from OP1 to local';
    if (inst.pc === 0x07D030) annotation = '  ; classify token';
    if (inst.pc === 0x07D034) annotation = '  ; NZ -> multi-element path';
    if (inst.pc === 0x07D036) annotation = '  ; find variable in symbol table';
    if (inst.pc === 0x07D03A) annotation = '  ; NZ -> not found';
    if (inst.pc === 0x07D03C) annotation = '  ; check OP1+1 subtype';
    if (inst.pc === 0x07D040) annotation = '  ; >= 0x83 -> graph range';
    if (inst.pc === 0x07D042) annotation = '  ; graph range -> set NZ, exit';
    if (inst.pc === 0x07D044) annotation = '  ; format for display';
    if (inst.pc === 0x07D04C) annotation = '  ; copy result to output';
    if (inst.pc === 0x07D050) annotation = '  ; -> XOR A (set Z), exit';
    if (inst.pc === 0x07D07A) annotation = '  ; OR 1 -> force NZ';
    if (inst.pc === 0x07D07C) annotation = '  ; save result flags';
    if (inst.pc === 0x07D085) annotation = '  ; SP = IX (tear down frame)';
    if (inst.pc === 0x07D087) annotation = '  ; restore IX';
    if (inst.pc === 0x07D089) annotation = '  ; return (Z=resolved, NZ=not)';
    console.log(printInstr(inst) + annotation);
  }

  const resolverAnalysis = analyzeFunction(resolverInstrs);
  console.log(`\n  Total instructions: ${resolverInstrs.length}`);
  console.log(`  RAM reads:`);
  for (const r of resolverAnalysis.ramReads) {
    const known = r.addr === 0xD005F9 ? ' (OP1+1 = subtype)' :
                  r.addr === 0xD00604 ? ' (OP2+1)' : '';
    console.log(`    ${hex(r.pc)}: ${r.asm}${known}`);
  }
  console.log(`  Sub-calls: ${resolverAnalysis.calls.length}`);
  for (const c of resolverAnalysis.calls) {
    console.log(`    ${hex(c.pc)}: ${c.asm}`);
  }

  // ──────────────────────────────────────────────────────────
  // SECTION 4: LCD refresh re-entry points
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(76));
  console.log('SECTION 4: LCD refresh re-entry — 0x06868A and 0x06867E');
  console.log('='.repeat(76));

  console.log('\n  --- 0x06868A (LCD refresh re-entry, called by 0x98 path) ---');
  const lcdReentryInstrs = disasmRange(LCD_REFRESH_REENTRY, 0x0686A7);
  for (const inst of lcdReentryInstrs) {
    let annotation = '';
    if (inst.pc === 0x06868A) annotation = '  ; HL = &OP1';
    if (inst.pc === 0x06868E) annotation = '  ; test bit 6 of (HL) = OP1 byte';
    if (inst.pc === 0x068690) annotation = '  ; if bit 6 set -> bail (system var?)';
    if (inst.pc === 0x068691) annotation = '  ; classify token';
    if (inst.pc === 0x068696) annotation = '  ; forward-normalize OP1';
    if (inst.pc === 0x06869A) annotation = '  ; ** DISPATCH into type handler table! **';
    if (inst.pc === 0x06869F) annotation = '  ; post-dispatch: check OP1 again';
    if (inst.pc === 0x0686A3) annotation = '  ; if Z -> JP 0x07FE28 (reverse-normalize)';
    if (inst.pc === 0x0686A7) annotation = '  ; else -> done';
    console.log(printInstr(inst) + annotation);
  }

  console.log('\n  --- 0x06867E (equation setup, called by 0x89 path) ---');
  const eqSetupInstrs = disasmRange(EQUATION_SETUP, 0x068689);
  for (const inst of eqSetupInstrs) {
    let annotation = '';
    if (inst.pc === 0x06867E) annotation = '  ; swap OP1<->OP2';
    if (inst.pc === 0x068682) annotation = '  ; recurse into LCD refresh (with OP2 as OP1)';
    if (inst.pc === 0x068686) annotation = '  ; swap back, tail call (JP = tail RET)';
    console.log(printInstr(inst) + annotation);
  }

  // ──────────────────────────────────────────────────────────
  // SECTION 5: Per-subtype flow analysis
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(76));
  console.log('SECTION 5: Per-subtype flow analysis');
  console.log('='.repeat(76));

  for (const sub of SUBTYPES) {
    console.log(`\n  --- Subtype ${hex2(sub.code)} (${sub.name}) ---`);
    console.log(`  TI-OS type: ${sub.tiType}`);
    console.log(`  Branch:     ${sub.branch}`);

    if (sub.code === 0x88) {
      console.log('  Flow:');
      console.log('    0x07CFD0: LD B, A');
      console.log('    0x07CFD1: CP 0x88  -> Z set');
      console.log('    0x07CFD3: RET Z    -> immediate return');
      console.log('  Meaning: GraphDB+temp is already fully rendered by the parent');
      console.log('           handler (0x07CFA7). No further subtype work needed.');
      console.log('  Recursion: NONE');
    }

    if (sub.code === 0x89) {
      console.log('  Flow:');
      console.log('    0x07CFD0: LD B, A');
      console.log('    0x07CFD1: CP 0x88  -> NZ');
      console.log('    0x07CFD4: CP 0x89  -> Z set');
      console.log('    0x07CFD6: JR Z, 0x07CFFC');
      console.log('    0x07CFFC: CALL 0x06867E  (equation setup)');
      console.log('      0x06867E: CALL 0x07FD30  (swap OP1<->OP2)');
      console.log('      0x068682: CALL 0x06868A  (LCD refresh re-entry!)');
      console.log('        0x06868A: BIT 6,(HL) -> classify -> dispatch');
      console.log('        This re-enters the full LCD type dispatcher at 0x0686A8');
      console.log('        which can call back to 0x07CFA7 (graph/matrix handler)');
      console.log('      0x068686: JP 0x07FD30   (swap back, tail return)');
      console.log('    0x07D000: CALL 0x07FD30  (swap OP1<->OP2)');
      console.log('    0x07D004: CALL 0x07D018  (resolve variable)');
      console.log('    0x07D008-0D: PUSH AF; CALL swap; POP AF');
      console.log('    0x07D00E: LD A, 0x88');
      console.log('    0x07D010: RET Z          (if resolved -> return 0x88)');
      console.log('    0x07D011: CALL 0x07CF1A  (not resolved -> list handler)');
      console.log('    0x07D015: LD A, 0x00; RET');
      console.log('  Meaning: Graph equation with temp flag. First renders the');
      console.log('           equation via the LCD refresh dispatcher (which handles');
      console.log('           the equation part of the Y= variable). Then falls');
      console.log('           through to the real variable path to resolve the');
      console.log('           remaining variable name. If the resolver fails, it');
      console.log('           renders as a list instead.');
      console.log('  Recursion: CALL 0x06867E -> CALL 0x06868A -> 0x0686A8 (full dispatch)');
      console.log('             CALL 0x07CF1A (list handler, fallback)');
    }

    if (sub.code === 0x80) {
      console.log('  Flow:');
      console.log('    0x07CFD0: LD B, A');
      console.log('    0x07CFD1: CP 0x88  -> NZ');
      console.log('    0x07CFD4: CP 0x89  -> NZ');
      console.log('    0x07CFD8: CP 0x80  -> Z set');
      console.log('    0x07CFDA: JR Z, 0x07D000');
      console.log('    0x07D000: CALL 0x07FD30  (swap OP1<->OP2)');
      console.log('    0x07D004: CALL 0x07D018  (resolve variable)');
      console.log('    0x07D008-0D: PUSH AF; CALL swap; POP AF');
      console.log('    0x07D00E: LD A, 0x88');
      console.log('    0x07D010: RET Z          (if resolved -> return 0x88)');
      console.log('    0x07D011: CALL 0x07CF1A  (not resolved -> list handler)');
      console.log('    0x07D015: LD A, 0x00; RET');
      console.log('  Meaning: Real variable with temp flag. Swaps OP1/OP2, resolves');
      console.log('           the variable name. If found in symbol table (Z flag),');
      console.log('           returns 0x88 (handled). If not found, falls back to');
      console.log('           rendering via the list handler.');
      console.log('  Recursion: CALL 0x07CF1A (list handler, fallback)');
    }

    if (sub.code === 0x08) {
      console.log('  Flow:');
      console.log('    0x07CFD0: LD B, A');
      console.log('    0x07CFD1: CP 0x88  -> NZ');
      console.log('    0x07CFD4: CP 0x89  -> NZ');
      console.log('    0x07CFD8: CP 0x80  -> NZ');
      console.log('    0x07CFDC: CP 0x08  -> Z set');
      console.log('    0x07CFDE: JR Z, 0x07CFE7');
      console.log('    0x07CFE7: CALL 0x07D018  (resolve variable)');
      console.log('    0x07CFEB: LD A, 0x88');
      console.log('    0x07CFED: RET Z          (if resolved -> return 0x88)');
      console.log('    0x07CFEE: CALL 0x07FD30  (swap OP1<->OP2)');
      console.log('    0x07CFF2: CALL 0x07CF1A  (list handler)');
      console.log('    0x07CFF6: CALL 0x07FD30  (swap back)');
      console.log('    0x07CFFA: JR 0x07D015    (-> LD A,0x00; RET)');
      console.log('  Meaning: Raw GraphDB / complex variable (no temp flag). Goes');
      console.log('           directly to the resolver. If found, returns 0x88.');
      console.log('           If not found, wraps in OP1/OP2 swap and renders via');
      console.log('           the list handler. Note: does NOT call equation setup.');
      console.log('  Recursion: CALL 0x07CF1A (list handler, fallback)');
    }

    if (sub.code === 0x98) {
      console.log('  Flow:');
      console.log('    0x07CFD0: LD B, A');
      console.log('    0x07CFD1: CP 0x88  -> NZ');
      console.log('    0x07CFD4: CP 0x89  -> NZ');
      console.log('    0x07CFD8: CP 0x80  -> NZ');
      console.log('    0x07CFDC: CP 0x08  -> NZ');
      console.log('    0x07CFE0: CP 0x98  -> Z set');
      console.log('    0x07CFE2: RET NZ         (would bail if NZ, but Z is set)');
      console.log('    0x07CFE3: CALL 0x06868A  (LCD refresh re-entry!)');
      console.log('    0x07CFE7: CALL 0x07D018  (then falls through to resolver)');
      console.log('    ... continues as 0x08 path');
      console.log('  Meaning: Unknown temp variable type (0x18|0x80). First does a');
      console.log('           FULL re-entry into the LCD refresh dispatcher, which');
      console.log('           re-classifies OP1 and dispatches through the complete');
      console.log('           type handler table. This is the deepest recursion:');
      console.log('           0x07CFD0 -> 0x06868A -> 0x0686A8 -> possibly 0x07CFA7');
      console.log('           -> possibly 0x07CFD0 again. Then falls through to the');
      console.log('           resolver (0x07D018) and the standard resolve/list path.');
      console.log('  Recursion: CALL 0x06868A (full LCD refresh = top-level dispatch!)');
      console.log('             Then CALL 0x07D018 + possible CALL 0x07CF1A');
    }
  }

  // ──────────────────────────────────────────────────────────
  // SECTION 6: Runtime execution traces
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(76));
  console.log('SECTION 6: Runtime execution traces');
  console.log('='.repeat(76));

  const bundle = ensureTranspiledModule();
  if (!bundle) {
    console.log('ERROR: ROM.transpiled.js or .gz not found. Skipping runtime traces.');
    printSummary();
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

    // Snapshot post-boot state
    const ramSnap = new Uint8Array(mem.slice(0xD00000, 0xE00000));
    const cpuSnap = {};
    for (const f of ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
                      'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles']) {
      cpuSnap[f] = cpu[f];
    }

    // Run each subtype through the dispatch
    const subtypeTraces = {};

    for (const sub of SUBTYPES) {
      const label = `dispatch ${hex2(sub.code)} (${sub.name})`;
      console.log(`\n  ${'─'.repeat(64)}`);
      console.log(`  TRACE: ${hex2(sub.code)} — ${sub.name}`);
      console.log(`  ${'─'.repeat(64)}`);

      // Restore clean state
      for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
      resetForTrace(cpu, mem);
      mem.set(ramSnap, 0xD00000);

      // Set A = subtype, also set OP1 to something coherent
      cpu.a = sub.code;
      mem[0xD005F8] = sub.code & 0x3F; // low bits as type
      mem[0xD005F9] = sub.code;        // full subtype in OP1+1

      // Use shorter step limit for 0x88 (early exit), more for recursive ones
      const maxSteps = sub.code === 0x88 ? 50 : 500;

      const traceData = traceExecution(executor, cpu, mem, GRAPH_INNER_DISPATCH, maxSteps, label);
      subtypeTraces[sub.code] = traceData;

      const { trace, result } = traceData;
      console.log(`  Steps: ${result.steps}, Termination: ${result.termination}, LastPC: ${hex(result.lastPc)}`);
      console.log(`  Blocks visited: ${trace.length}`);

      // Show first N blocks
      const showCount = Math.min(trace.length, 40);
      console.log(`\n  Block execution log (first ${showCount}):`);
      for (const entry of trace.slice(0, showCount)) {
        const callInfo = entry.isCallSite ? ` -> CALL ${hex(entry.callTarget)}` : '';
        console.log(
          `    [${String(entry.step).padStart(4)}] PC=${hex(entry.pc)} ` +
          `A=${hex2(entry.a)} F=${hex2(entry.f)} SP=${hex(entry.sp)}${callInfo}`
        );
      }
      if (trace.length > showCount) {
        console.log(`    ... (${trace.length - showCount} more blocks)`);
      }

      // Identify key call targets visited
      const visitedPCs = new Set(trace.map(t => t.pc));
      const keyTargets = [
        { addr: GRAPH_INNER_DISPATCH, label: '0x07CFD0 (this dispatch)' },
        { addr: GRAPH_VAR_RESOLVER, label: '0x07D018 (variable resolver)' },
        { addr: LIST_HANDLER, label: '0x07CF1A (list handler)' },
        { addr: LCD_REFRESH_REENTRY, label: '0x06868A (LCD refresh re-entry)' },
        { addr: EQUATION_SETUP, label: '0x06867E (equation setup)' },
        { addr: LCD_TYPE_DISPATCHER, label: '0x0686A8 (LCD type dispatcher)' },
        { addr: OP1_OP2_SWAP, label: '0x07FD30 (OP1/OP2 swap)' },
        { addr: GRAPH_MATRIX_HANDLER, label: '0x07CFA7 (graph/matrix handler)' },
      ];

      console.log('\n  Key functions reached:');
      for (const kt of keyTargets) {
        const hit = visitedPCs.has(kt.addr);
        const count = trace.filter(t => t.pc === kt.addr).length;
        if (hit) {
          console.log(`    YES (${count}x): ${kt.label}`);
        }
      }
      const missedTargets = keyTargets.filter(kt => !visitedPCs.has(kt.addr));
      if (missedTargets.length > 0) {
        for (const kt of missedTargets) {
          console.log(`     no       : ${kt.label}`);
        }
      }

      // Check for recursion into self
      const selfVisits = trace.filter(t => t.pc === GRAPH_INNER_DISPATCH).length;
      if (selfVisits > 1) {
        console.log(`  ** RECURSION DETECTED: dispatch entered ${selfVisits} times! **`);
      }
    }

    // ──────────────────────────────────────────────────────────
    // SECTION 7: Comparison matrix
    // ──────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(76));
    console.log('SECTION 7: Subtype comparison matrix');
    console.log('='.repeat(76));

    console.log('\n  ' + 'Feature'.padEnd(32) + SUBTYPES.map(s => hex2(s.code).padEnd(8)).join(''));
    console.log('  ' + '─'.repeat(32 + SUBTYPES.length * 8));

    const features = [
      { label: 'Steps executed', fn: (t) => String(t.result.steps) },
      { label: 'Blocks visited', fn: (t) => String(t.trace.length) },
      { label: 'Reached resolver (D018)', fn: (t) => t.trace.some(e => e.pc === GRAPH_VAR_RESOLVER) ? 'YES' : 'no' },
      { label: 'Reached list handler (CF1A)', fn: (t) => t.trace.some(e => e.pc === LIST_HANDLER) ? 'YES' : 'no' },
      { label: 'Reached LCD refresh (868A)', fn: (t) => t.trace.some(e => e.pc === LCD_REFRESH_REENTRY) ? 'YES' : 'no' },
      { label: 'Reached eq setup (867E)', fn: (t) => t.trace.some(e => e.pc === EQUATION_SETUP) ? 'YES' : 'no' },
      { label: 'Reached type dispatch (86A8)', fn: (t) => t.trace.some(e => e.pc === LCD_TYPE_DISPATCHER) ? 'YES' : 'no' },
      { label: 'Reached OP1/OP2 swap (FD30)', fn: (t) => t.trace.some(e => e.pc === OP1_OP2_SWAP) ? 'YES' : 'no' },
      { label: 'Self-recursion (>1 entry)', fn: (t) => t.trace.filter(e => e.pc === GRAPH_INNER_DISPATCH).length > 1 ? 'YES' : 'no' },
      { label: 'Termination', fn: (t) => t.result.termination },
    ];

    for (const feat of features) {
      const row = feat.label.padEnd(32) + SUBTYPES.map(s => {
        const td = subtypeTraces[s.code];
        return td ? feat.fn(td).padEnd(8) : 'n/a     ';
      }).join('');
      console.log('  ' + row);
    }

  } finally {
    cleanupTemp(bundle);
  }

  printSummary();
}

function printSummary() {
  console.log('\n' + '='.repeat(76));
  console.log('DISPATCH ARCHITECTURE SUMMARY');
  console.log('='.repeat(76));
  console.log(`
  0x07CFD0 — Graph/Matrix Inner Subtype Dispatch
  ================================================

  Called from: 0x07CFA7 (graph/matrix handler) indirectly, when the
  parent handler encounters a variable that needs subtype-specific rendering.

  Entry: A = token subtype byte (from OP1+1 or resolver output)

  DISPATCH TREE:

  0x07CFD0: LD B, A
  |
  +-- A == 0x88 (GraphDB + temp)
  |   Action: RET Z (immediate return, already handled)
  |   Recursion: none
  |
  +-- A == 0x89 (graph equation + temp)
  |   Action: CALL 0x06867E (equation setup)
  |     0x06867E: swap OP1<->OP2
  |               CALL 0x06868A (LCD refresh re-entry)
  |                 -> 0x0686A8 (full type dispatch table)
  |                 -> can re-enter 0x07CFA7 -> 0x07CFD0 (RECURSIVE!)
  |               swap back
  |   Then falls through to real var path (0x07D000):
  |     swap -> resolve(0x07D018) -> swap back
  |     If resolved: return 0x88
  |     If not: CALL 0x07CF1A (list handler)
  |   Recursion: 0x06867E -> 0x06868A -> full dispatch (potentially deep)
  |              0x07CF1A (fallback)
  |
  +-- A == 0x80 (real + temp)
  |   Action: direct to 0x07D000 (real var path)
  |     swap -> resolve(0x07D018) -> swap back
  |     If resolved: return 0x88
  |     If not: CALL 0x07CF1A (list handler)
  |   Recursion: 0x07CF1A (fallback only)
  |
  +-- A == 0x08 (GraphDB / complex, raw)
  |   Action: direct to 0x07CFE7 (complex path)
  |     resolve(0x07D018) directly (no swap first)
  |     If resolved: return 0x88
  |     If not: swap -> CALL 0x07CF1A (list) -> swap back
  |   Recursion: 0x07CF1A (fallback only)
  |
  +-- A == 0x98 (0x18 + temp = unknown)
  |   Action: CALL 0x06868A (full LCD refresh re-entry!)
  |     -> 0x0686A8 (type dispatch table)
  |     -> can re-enter 0x07CFA7 -> 0x07CFD0 (DEEPEST RECURSION!)
  |   Then falls through to 0x07CFE7 (complex path):
  |     resolve(0x07D018) -> if resolved return 0x88
  |     else swap -> list handler -> swap back
  |   Recursion: 0x06868A -> full dispatch (potentially re-entrant!)
  |              0x07CF1A (fallback)
  |
  +-- A == other
      Action: RET NZ (bail out, unknown subtype)
      Recursion: none

  RETURN VALUES:
    A = 0x88 -> variable was resolved and handled
    A = 0x00 -> variable was rendered via list handler (fallback)
    (early RET for 0x88 and unknown subtypes preserve A)

  KEY OBSERVATIONS:
    1. Two subtypes (0x89 and 0x98) can trigger FULL re-entry into the
       LCD refresh dispatcher (0x06868A -> 0x0686A8), creating potential
       for recursive dispatch through 0x07CFA7 -> 0x07CFD0 again.
    2. Three subtypes (0x89, 0x80, 0x08) share the variable resolver
       (0x07D018) and the list handler fallback (0x07CF1A).
    3. The 0x89 (equation) path is the most complex: equation setup,
       then resolver, then possible list fallback.
    4. The 0x08 (complex/GraphDB) path is unique in that it calls the
       resolver WITHOUT swapping OP1/OP2 first.
    5. The 0x98 path is the most dangerous for stack depth: LCD refresh
       re-entry + resolver + possible list handler.
    6. The resolver (0x07D018) builds a 27-byte stack frame and returns
       Z if resolved, NZ if not. This is the decision point for whether
       to use the list handler as fallback rendering.
`);

  console.log('Done.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
