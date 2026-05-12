#!/usr/bin/env node
// Phase 306: Trace 0x07CFA7 (graph/matrix handler) and 0x07CF1A (list handler)
//
// These are the two LCD refresh type-dispatch targets from 0x0686A8:
//   OP1 & 0x3F == 0x20 or 0x21 -> JP 0x07CFA7 (graph/matrix)
//   OP1 & 0x3F == 0x1C         -> JP 0x07CF1A (list)
//
// ================================================================
// STATIC DISASSEMBLY: 0x07CFA7 (graph/matrix handler)
// ================================================================
//
// 0x07CFA7: CALL 0x07CF9D     ; save OP1 area -> temp buffer (LDIR 55 bytes D00603->D02B39)
// 0x07CFAB: CALL 0x07FE9C     ; normalize OP1 type byte: if &0x3F==0x20 -> rewrite to 0x00|flags,
//                              ;   if &0x3F==0x21 -> rewrite to 0x18|flags (maps graph->real/matrix->list-like)
// 0x07CFAF: CALL 0x07F7A4     ; classify OP1 & 0x3F: returns Z if 0x0C, 0x1B, or >= 0x1D
// 0x07CFB3: PUSH AF           ; save classification result (Z flag)
// 0x07CFB4: CALL 0x07FE5A     ; forward-normalize OP1 via lookup table
// 0x07CFB8: LD A, 0x04        ; display mode = 4
// 0x07CFBA: CALL 0x07F16C     ; set display mode (builds 9-byte display descriptor at D00603)
// 0x07CFBE: CALL 0x07C8B7     ; render the variable name to LCD (core display routine)
// 0x07CFC2: CALL 0x07F7D6     ; cleanup: OP1 &= 0xC0 (strip token class, keep flags)
// 0x07CFC6: CALL 0x07CF8E     ; restore OP1 area from temp buffer (LDIR 55 bytes D02B39->D00603)
// 0x07CFCA: POP AF            ; restore classification result
// 0x07CFCB: RET NZ            ; if NOT special class -> done
// 0x07CFCC: JP 0x07FE24       ; if special class -> reverse-normalize OP1 (undo 0x07FE5A mapping)
//
// FUNCTION BOUNDARY: 0x07CFA7 - 0x07CFCF (inclusive of JP target exit)
// RET at 0x07CFCB (conditional NZ), tail JP at 0x07CFCC
//
// KEY INSIGHT: The graph/matrix handler:
//   1. Saves OP1 context (55 bytes) to a temp buffer at D02B39
//   2. Normalizes the type byte (0x20->0x00, 0x21->0x18) so downstream
//      routines can use a unified variable name format
//   3. Classifies whether the token needs reverse normalization after display
//   4. Renders the variable name with display mode 4 via 0x07C8B7
//   5. Restores the OP1 context from the temp buffer
//   6. Optionally reverse-normalizes if the token was a special class
//
// ================================================================
// STATIC DISASSEMBLY: 0x07CF1A (list handler)
// ================================================================
//
// 0x07CF1A: CALL 0x07CF9D     ; save OP1 area -> temp (same as graph handler)
// 0x07CF1E: CALL 0x07F95E     ; list-specific OP1 setup
// 0x07CF22: JR 0x07CF28       ; skip alternate entry point at 0x07CF24
//
// 0x07CF24: CALL 0x07CF9D     ; [alternate entry] save OP1 area
// 0x07CF28: CALL 0x07CD92     ; extract list name from OP1 -> build display token at D005F8
//                              ;   reads (D02B06+3), writes type=0x00 then 0x82 to OP1, formats subscript
// 0x07CF2C: CALL 0x07CE86     ; check list flag 1: test bit 4 of (D02B06+0), test (D02B06+1)&0x0F
// 0x07CF30: JR NZ, 0x07CF38   ; if flag set -> complex path
// 0x07CF32: CALL 0x07CD7F     ; simple list name format: load from (D02B08), write to OP1,
//                              ;   test bit 4 of (D00625), conditionally CALL 0x07CA06
// 0x07CF36: JR 0x07CF4E       ; -> continue to middle section
//
// 0x07CF38: CALL 0x07DF66     ; [complex path] additional formatting / subscript handling
// 0x07CF3C: CALL 0x07CE8C     ; check list flag 2: test bit 4 of (D00625)
// 0x07CF40: JR Z, 0x07CF4E    ; if clear -> skip
// 0x07CF42: CALL 0x07F8FA     ; additional list element setup
// 0x07CF46: CALL 0x07CD7F     ; format list name (same as simple path)
// 0x07CF4A: CALL 0x07C8B7     ; render to LCD (same core display routine as graph handler)
//
// 0x07CF4E: CALL 0x07F8A2     ; list middle handler: OP2/intermediate setup
// 0x07CF52: CALL 0x07CE34     ; extract second list name from OP1 (different offset: D02B0A)
//                              ;   calls 0x07CE47 (digit pair extraction via 0x07FAED/0x07FAF5)
// 0x07CF56: CALL 0x07CEA6     ; check list flag 3: test bit 5 of (D00625)
// 0x07CF5A: JR NZ, 0x07CF62   ; if set -> complex path 2
// 0x07CF5C: CALL 0x07CDD8     ; simple list name format 2: read from (D02B07),
//                              ;   test bit 5 of (D00625), conditionally CALL 0x07CA06
// 0x07CF60: JR 0x07CF78       ; -> continue to tail
//
// 0x07CF62: CALL 0x07DF66     ; [complex path 2] additional formatting
// 0x07CF66: CALL 0x07CE99     ; check list flag 4: test bit 5 of (D00625)
// 0x07CF6A: JR Z, 0x07CF78    ; if clear -> skip
// 0x07CF6C: CALL 0x07F8FA     ; additional element setup
// 0x07CF70: CALL 0x07CDD8     ; format second list name
// 0x07CF74: CALL 0x07C8B7     ; render to LCD
//
// 0x07CF78: CALL 0x07F8B6     ; list tail: final OP state cleanup
// 0x07CF7C: CALL 0x07C77F     ; list separator / delimiter rendering
// 0x07CF80: CALL 0x07CE79     ; final list check: test (D00625)&0x0F, compare (D00626) to 1
// 0x07CF84: JR Z, 0x07CF8E    ; if equal -> skip subscript display
// 0x07CF86: CALL 0x07CD57     ; format subscript (load from D00625, write to OP1)
// 0x07CF8A: CALL 0x07CAB9     ; render subscript to LCD
//
// 0x07CF8E: LD DE, 0xD00603   ; restore OP1 area:
// 0x07CF92: LD HL, 0xD02B39   ;   source = temp buffer
// 0x07CF96: LD BC, 55         ;   length = 55 bytes
// 0x07CF9A: LDIR              ;   block copy D02B39 -> D00603
// 0x07CF9C: RET
//
// FUNCTION BOUNDARY: 0x07CF1A - 0x07CF9C
// Single RET at 0x07CF9C
//
// ================================================================
// SHARED HELPER: 0x07CF9D (OP1 -> temp save)
// ================================================================
//
// 0x07CF9D: LD HL, 0xD00603   ; source = OP1+11 (OP2 area start)
// 0x07CFA1: LD DE, 0xD02B39   ; dest = temp buffer
// 0x07CFA5: JR 0x07CF96       ; -> LD BC,55; LDIR; RET
//
// REVERSE: 0x07CF8E
// 0x07CF8E: LD DE, 0xD00603   ; dest = OP1+11
// 0x07CF92: LD HL, 0xD02B39   ; source = temp buffer
// 0x07CF96: LD BC, 55; LDIR; RET
//
// ================================================================
// 0x07CFD0 — graph/matrix inner dispatch (called from 0x07CFA7 path only
//            when the graph handler itself recurses via 0x07D018)
// ================================================================
//
// This is the secondary type dispatch WITHIN the graph/matrix handler.
// It's entered with A = token subtype:
//
// 0x07CFD0: LD B, A           ; save subtype
// 0x07CFD1: CP 0x88           ; if subtype == 0x88 -> RET Z (graph DB token, already handled)
// 0x07CFD4: CP 0x89           ; if subtype == 0x89 -> JR Z, 0x07CFFC (graph equation, special)
// 0x07CFD8: CP 0x80           ; if subtype == 0x80 -> JR Z, 0x07D000 (real variable)
// 0x07CFDC: CP 0x08           ; if subtype == 0x08 -> JR Z, 0x07CFE7 (complex variable)
// 0x07CFE0: CP 0x98           ; if subtype == 0x98 -> RET NZ (unknown -> bail)
//                              ;   subtype == 0x98 -> CALL 0x06868A (recurse into LCD refresh!)
// 0x07CFE7: CALL 0x07D018     ; resolve the variable (stack frame, OP1 parse, name lookup)
// 0x07CFEB: LD A, 0x88; RET Z ; if resolver returned Z -> load 0x88, return
// 0x07CFEE: CALL 0x07FD30     ; OP1/OP2 swap
// 0x07CFF2: CALL 0x07CF1A     ; recurse into LIST handler (!)
// 0x07CFF6: CALL 0x07FD30     ; OP1/OP2 swap back
// 0x07CFFA: JR 0x07D015       ; -> LD A,0x00; RET
//
// 0x07CFFC: (equation path)
//   CALL 0x06867E             ; equation-specific setup
// 0x07D000: (real variable path)
//   CALL 0x07FD30             ; OP1/OP2 swap
//   CALL 0x07D018             ; resolve variable
//   PUSH AF; CALL 0x07FD30; POP AF  ; swap back, preserving flags
//   LD A, 0x88; RET Z         ; if resolved -> return 0x88
//   CALL 0x07CF1A             ; else -> render as list
// 0x07D015: LD A, 0x00; RET   ; return 0x00 (success, no special token)
//
// ================================================================
// COMPARISON: Graph/Matrix vs List handlers
// ================================================================
//
// SHARED:
//   - Both call 0x07CF9D to save 55 bytes of OP1 context to D02B39
//   - Both call 0x07CF8E / inline LDIR to restore from D02B39
//   - Both use 0x07C8B7 as the core LCD rendering routine
//   - Both call 0x07CA06 conditionally for name flag handling
//   - Both operate on the same RAM area: D005F8 (OP1), D00603 (OP2), D00625 (flags)
//
// DIFFERENT:
//   - Graph/matrix: normalizes type byte (0x20->0x00, 0x21->0x18) before rendering,
//     then denormalizes. Uses display mode 4. Single CALL to 0x07C8B7.
//   - List: does NOT normalize the type byte. Instead, extracts list name components
//     from packed fields at D02B06-D02B0B via 0x07CD92/0x07CE34. Renders up to
//     THREE components: list name 1 (0x07CD7F), list name 2 (0x07CDD8), and
//     optional subscript (0x07CD57+0x07CAB9). Has two-phase flag checks
//     (bit 4 and bit 5 of D00625).
//   - Graph/matrix has recursive dispatch (0x07CFD0) that can call back into
//     the list handler (0x07CF1A) or even the main LCD refresh (0x06868A).
//   - List handler is linear (no recursion), always ends with LDIR restore + RET.
//
// KEY ADDRESSES:
//   D005F8 = OP1 (9-byte floating-point/token register)
//   D005F9 = OP1+1 (token subtype byte, checked against 0x83 for graph range)
//   D00603 = OP2 (9-byte register, start of saved context)
//   D00625 = list/graph flags byte (bit 4 = list flag 1, bit 5 = list flag 2)
//   D02B39 = temp save buffer (55 bytes, shared by both handlers)
//   D02B06-D02B0B = list name packed fields (subscript digits, name index)

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
const GRAPH_MATRIX_HANDLER = 0x07CFA7;
const LIST_HANDLER = 0x07CF1A;
const OP1_SAVE = 0x07CF9D;
const OP1_RESTORE = 0x07CF8E;
const GRAPH_INNER_DISPATCH = 0x07CFD0;
const GRAPH_VAR_RESOLVER = 0x07D018;
const LIST_NAME_FMT1 = 0x07CD7F;
const LIST_NAME_FMT2 = 0x07CDD8;
const LIST_EXTRACT1 = 0x07CD92;
const LIST_EXTRACT2 = 0x07CE34;
const CORE_LCD_RENDER = 0x07C8B7;
const TYPE_NORMALIZER = 0x07FE9C;

// ================================================================
// Utility functions (same pattern as phase 305)
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

  const tempPath = path.join(os.tmpdir(), `ti84-phase306-${process.pid}.mjs`);
  fs.writeFileSync(tempPath, gunzipSync(fs.readFileSync(gzPath)));
  return { modulePath: tempPath, tempPath };
}

function cleanupTemp(bundle) {
  if (!bundle?.tempPath) return;
  try { fs.unlinkSync(bundle.tempPath); } catch {}
}

// ================================================================
// Warm boot sequence (matches phase 99d)
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
// Runtime trace helpers
// ================================================================

function traceExecution(executor, cpu, mem, entryPoint, maxSteps, label) {
  const trace = [];
  const ramAccesses = [];

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

  // Summarize RAM accesses
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
                    addr === 0xD005F9 ? ' (OP1+1)' :
                    addr === 0xD005FA ? ' (OP1+2)' :
                    addr === 0xD00603 ? ' (OP2)' :
                    addr === 0xD00604 ? ' (OP2+1)' :
                    addr === 0xD00625 ? ' (flags)' :
                    (addr >= 0xD40000 && addr < 0xD40000 + 320*240*2) ? ' (VRAM)' :
                    (addr >= 0xD02B39 && addr < 0xD02B39 + 55) ? ' (temp buf)' : '';
      console.log(`    ${hex(addr)}${known}: values=[${uniqueVals}] (${vals.length}x)`);
    }
    if (sorted.length > 40) console.log(`    ... (${sorted.length - 40} more)`);
  }

  if (writeAddrs.size > 0) {
    console.log(`\n  RAM writes (${writeAddrs.size} unique addrs, ${ramAccesses.filter(a => a.type === 'W').length} total):`);
    const sorted = [...writeAddrs.entries()].sort((a, b) => a[0] - b[0]);
    for (const [addr, vals] of sorted.slice(0, 40)) {
      const uniqueVals = [...new Set(vals)].map(v => hex2(v)).join(', ');
      const known = addr === 0xD005F8 ? ' (OP1)' :
                    addr === 0xD005F9 ? ' (OP1+1)' :
                    addr === 0xD00603 ? ' (OP2)' :
                    addr === 0xD00625 ? ' (flags)' :
                    (addr >= 0xD40000 && addr < 0xD40000 + 320*240*2) ? ' (VRAM)' :
                    (addr >= 0xD02B39 && addr < 0xD02B39 + 55) ? ' (temp buf)' : '';
      console.log(`    ${hex(addr)}${known}: values=[${uniqueVals}] (${vals.length}x)`);
    }
    if (sorted.length > 40) console.log(`    ... (${sorted.length - 40} more)`);
  }
}

// ================================================================
//  MAIN
// ================================================================

async function main() {
  console.log('Phase 306: LCD type handlers — 0x07CFA7 (graph/matrix) and 0x07CF1A (list)');
  console.log('=' .repeat(70));
  console.log('Targets:');
  console.log('  0x07CFA7 = graph/matrix handler (OP1 type 0x20 or 0x21)');
  console.log('  0x07CF1A = list handler (OP1 type 0x1C)');
  console.log('Dispatcher: 0x0686A8 extracts OP1 & 0x3F, dispatches by type');
  console.log('Key RAM:    D005F8=OP1, D00603=OP2, D00625=flags, D02B39=temp');

  // ──────────────────────────────────────────────────────────
  // SECTION 1: Static disassembly of 0x07CFA7 (graph/matrix)
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('SECTION 1: Static disassembly — 0x07CFA7 (graph/matrix handler)');
  console.log('='.repeat(70));

  const graphInstrs = disasm(GRAPH_MATRIX_HANDLER, 30);
  // Stop at the JP or RET that ends the function
  const graphFunc = [];
  for (const inst of graphInstrs) {
    graphFunc.push(inst);
    if (isUnconditionalEnd(inst)) break;
  }
  for (const inst of graphFunc) console.log(printInstr(inst));
  console.log(`\n  ${graphFunc.length} instructions, boundary: ${hex(GRAPH_MATRIX_HANDLER)} - ${hex(graphFunc[graphFunc.length - 1].pc)}`);

  const graphAnalysis = analyzeFunction(graphFunc);
  printAnalysis('0x07CFA7 — graph/matrix handler', graphAnalysis);

  // ──────────────────────────────────────────────────────────
  // SECTION 2: Static disassembly of 0x07CF1A (list handler)
  // ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('SECTION 2: Static disassembly — 0x07CF1A (list handler)');
  console.log('='.repeat(70));

  // List handler runs from 0x07CF1A to 0x07CF9C (RET)
  const listInstrs = disasm(LIST_HANDLER, 80);
  const listFunc = [];
  for (const inst of listInstrs) {
    listFunc.push(inst);
    if (inst.pc >= 0x07CF9C && inst.tag === 'ret') break;
  }
  for (const inst of listFunc) console.log(printInstr(inst));
  console.log(`\n  ${listFunc.length} instructions, boundary: ${hex(LIST_HANDLER)} - ${hex(listFunc[listFunc.length - 1].pc)}`);

  const listAnalysis = analyzeFunction(listFunc);
  printAnalysis('0x07CF1A — list handler', listAnalysis);

  // ──────────────────────────────────────────────────────────
  // SECTION 3: Key sub-functions
  // ──────────────────────────────────────────────────────────
  const subTargets = [
    { addr: OP1_SAVE, label: '0x07CF9D — OP1 save (HL=D00603, DE=D02B39)' },
    { addr: OP1_RESTORE, label: '0x07CF8E — OP1 restore (DE=D00603, HL=D02B39)' },
    { addr: TYPE_NORMALIZER, label: '0x07FE9C — type normalizer (0x20->0x00, 0x21->0x18)' },
    { addr: GRAPH_INNER_DISPATCH, label: '0x07CFD0 — graph inner dispatch (by subtype)' },
    { addr: GRAPH_VAR_RESOLVER, label: '0x07D018 — graph variable resolver (stack frame)' },
    { addr: LIST_EXTRACT1, label: '0x07CD92 — list name extract 1 (from D02B0B)' },
    { addr: LIST_NAME_FMT1, label: '0x07CD7F — list name format 1' },
    { addr: LIST_EXTRACT2, label: '0x07CE34 — list name extract 2 (from D02B0A)' },
    { addr: LIST_NAME_FMT2, label: '0x07CDD8 — list name format 2' },
    { addr: CORE_LCD_RENDER, label: '0x07C8B7 — core LCD render (shared)' },
  ];

  for (const sub of subTargets) {
    console.log('\n' + '='.repeat(70));
    console.log(`SECTION 3: Static disassembly — ${sub.label}`);
    console.log('='.repeat(70));

    const instrs = disasmFunc(sub.addr, 40);
    for (const inst of instrs) console.log(printInstr(inst));
    console.log(`\n  ${instrs.length} instructions`);

    const analysis = analyzeFunction(instrs);
    printAnalysis(sub.label, analysis);
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

    // Snapshot post-boot state
    const ramSnap = new Uint8Array(mem.slice(0xD00000, 0xE00000));
    const cpuSnap = {};
    for (const f of ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
                      'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles']) {
      cpuSnap[f] = cpu[f];
    }

    console.log('\n  Pre-trace RAM state:');
    console.log(`    OP1 (0xD005F8): ${hex2(mem[0xD005F8])}`);
    console.log(`    OP1+1 (0xD005F9): ${hex2(mem[0xD005F9])}`);
    console.log(`    OP2 (0xD00603): ${hex2(mem[0xD00603])}`);
    console.log(`    Flags (0xD00625): ${hex2(mem[0xD00625])}`);
    console.log(`    Temp buf start (0xD02B39): ${hex2(mem[0xD02B39])}`);

    // ── Trace 4a: Graph/matrix handler with OP1 type = 0x20 ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4a: 0x07CFA7 — graph/matrix handler (OP1=0x20, 500 steps)');
    console.log('-'.repeat(60));

    resetForTrace(cpu, mem);
    mem.set(ramSnap, 0xD00000);
    // Set OP1 type to 0x20 (graph variable)
    mem[0xD005F8] = 0x20;
    mem[0xD005F9] = 0x00;

    const trace4a = traceExecution(executor, cpu, mem, GRAPH_MATRIX_HANDLER, 500, 'graph 0x20');
    printTrace('0x07CFA7 — graph/matrix (OP1=0x20)', trace4a);

    // ── Trace 4b: Graph/matrix handler with OP1 type = 0x21 ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4b: 0x07CFA7 — graph/matrix handler (OP1=0x21, 500 steps)');
    console.log('-'.repeat(60));

    for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
    resetForTrace(cpu, mem);
    mem.set(ramSnap, 0xD00000);
    mem[0xD005F8] = 0x21;
    mem[0xD005F9] = 0x00;

    const trace4b = traceExecution(executor, cpu, mem, GRAPH_MATRIX_HANDLER, 500, 'matrix 0x21');
    printTrace('0x07CFA7 — graph/matrix (OP1=0x21)', trace4b);

    // ── Trace 4c: List handler with OP1 type = 0x1C ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4c: 0x07CF1A — list handler (OP1=0x1C, 500 steps)');
    console.log('-'.repeat(60));

    for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
    resetForTrace(cpu, mem);
    mem.set(ramSnap, 0xD00000);
    mem[0xD005F8] = 0x1C;
    mem[0xD005F9] = 0x00;

    const trace4c = traceExecution(executor, cpu, mem, LIST_HANDLER, 500, 'list 0x1C');
    printTrace('0x07CF1A — list (OP1=0x1C)', trace4c);

    // ── Trace 4d: Graph inner dispatch 0x07CFD0 ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4d: 0x07CFD0 — graph inner dispatch (A=0x88, 200 steps)');
    console.log('-'.repeat(60));

    for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
    resetForTrace(cpu, mem);
    mem.set(ramSnap, 0xD00000);
    cpu.a = 0x88; // graph DB token

    const trace4d = traceExecution(executor, cpu, mem, GRAPH_INNER_DISPATCH, 200, 'dispatch 0x88');
    printTrace('0x07CFD0 — dispatch (A=0x88)', trace4d);

    // ── Trace 4e: Graph inner dispatch with subtype 0x08 (complex var) ──
    console.log('\n' + '-'.repeat(60));
    console.log('TRACE 4e: 0x07CFD0 — graph inner dispatch (A=0x08, 300 steps)');
    console.log('-'.repeat(60));

    for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
    resetForTrace(cpu, mem);
    mem.set(ramSnap, 0xD00000);
    cpu.a = 0x08;
    mem[0xD005F8] = 0x08;

    const trace4e = traceExecution(executor, cpu, mem, GRAPH_INNER_DISPATCH, 300, 'dispatch 0x08');
    printTrace('0x07CFD0 — dispatch (A=0x08, complex)', trace4e);

    // ──────────────────────────────────────────────────────────
    // SECTION 5: Comparison summary
    // ──────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(70));
    console.log('SECTION 5: Handler comparison summary');
    console.log('='.repeat(70));

    // VRAM write counts
    const vramCount = (traceData) => traceData.ramAccesses.filter(a =>
      a.type === 'W' && a.addr >= 0xD40000 && a.addr < 0xD40000 + 320*240*2
    ).length;

    console.log('\n  VRAM write counts per trace:');
    console.log(`    Graph (0x20):     ${vramCount(trace4a)} writes`);
    console.log(`    Matrix (0x21):    ${vramCount(trace4b)} writes`);
    console.log(`    List (0x1C):      ${vramCount(trace4c)} writes`);
    console.log(`    Dispatch 0x88:    ${vramCount(trace4d)} writes`);
    console.log(`    Dispatch 0x08:    ${vramCount(trace4e)} writes`);

    // Unique PCs visited
    for (const [label, traceData] of [
      ['Graph (0x20)', trace4a],
      ['Matrix (0x21)', trace4b],
      ['List (0x1C)', trace4c],
    ]) {
      const pcs = traceData.trace.map(t => t.pc);
      const uniquePCs = [...new Set(pcs)].sort((a, b) => a - b);
      console.log(`\n  ${label} — ${uniquePCs.length} unique blocks visited:`);
      for (const pc of uniquePCs) {
        const visits = pcs.filter(p => p === pc).length;
        console.log(`    ${hex(pc)} (${visits}x)`);
      }
    }

    // Check which shared sub-calls were reached
    const sharedCalls = [
      { addr: 0x07CF9D, label: 'OP1 save' },
      { addr: 0x07CF8E, label: 'OP1 restore' },
      { addr: 0x07FE9C, label: 'type normalizer' },
      { addr: 0x07C8B7, label: 'core LCD render' },
      { addr: 0x07F7A4, label: 'token classifier' },
      { addr: 0x07FE5A, label: 'forward normalizer' },
      { addr: 0x07F7D6, label: 'OP1 cleanup' },
    ];

    console.log('\n  Shared sub-call reachability:');
    console.log('  ' + 'Sub-call'.padEnd(30) + 'Graph  Matrix  List');
    for (const sc of sharedCalls) {
      const gHit = trace4a.trace.some(t => t.pc === sc.addr) ? 'YES' : 'no';
      const mHit = trace4b.trace.some(t => t.pc === sc.addr) ? 'YES' : 'no';
      const lHit = trace4c.trace.some(t => t.pc === sc.addr) ? 'YES' : 'no';
      console.log(`  ${sc.label.padEnd(30)}${gHit.padEnd(7)}${mHit.padEnd(8)}${lHit}`);
    }

    console.log('\n  ════════════════════════════════════════════════════════');
    console.log('  HANDLER ARCHITECTURE SUMMARY');
    console.log('  ════════════════════════════════════════════════════════');
    console.log('');
    console.log('  0x07CFA7 (GRAPH/MATRIX HANDLER):');
    console.log('    Flow: save_OP1 -> normalize_type -> classify -> fwd_normalize');
    console.log('          -> set_display_mode(4) -> render_name -> cleanup -> restore_OP1');
    console.log('          -> [if special: reverse_normalize]');
    console.log('    - Type 0x20 (graph) remapped to 0x00 for unified name lookup');
    console.log('    - Type 0x21 (matrix) remapped to 0x18 for unified name lookup');
    console.log('    - Single render call to 0x07C8B7');
    console.log('    - Has recursive inner dispatch (0x07CFD0) that can call back');
    console.log('      into the list handler or even the main LCD refresh');
    console.log('');
    console.log('  0x07CF1A (LIST HANDLER):');
    console.log('    Flow: save_OP1 -> extract_name1 -> check_flag1 -> [simple|complex]');
    console.log('          -> extract_name2 -> check_flag2 -> [simple|complex]');
    console.log('          -> separator -> check_subscript -> [format_subscript] -> restore_OP1');
    console.log('    - Does NOT remap the type byte');
    console.log('    - Extracts TWO name components from packed fields at D02B06-D02B0B');
    console.log('    - Up to THREE render calls: name1, name2, subscript');
    console.log('    - Two-phase flag checking (bit 4 and bit 5 of D00625)');
    console.log('    - Linear flow, no recursion');
    console.log('');
    console.log('  SHARED INFRASTRUCTURE:');
    console.log('    - 0x07CF9D/0x07CF8E: 55-byte OP1 context save/restore to D02B39');
    console.log('    - 0x07C8B7: core LCD variable name renderer');
    console.log('    - 0x07CA06: conditional name flag handler');
    console.log('    - D005F8-D00602: OP1 register (9 bytes, token + value)');
    console.log('    - D00603-D0060D: OP2 register (display descriptor)');

  } finally {
    cleanupTemp(bundle);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
