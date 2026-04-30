#!/usr/bin/env node

/**
 * Phase 162 - Static disassembly of gcd algorithm body 0x068D82 through 0x068DEA
 *
 * Disassembles the core Euclidean algorithm body of the gcd handler,
 * annotates CALL/JP targets with known function names, and identifies
 * the loop structure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

const romBytes = fs.readFileSync(ROM_BIN_PATH);

// --- Constants ---

const DISASM_START = 0x068D82;
const DISASM_END   = 0x068DEB; // inclusive of 0x068DEA instruction, so go one past

// --- Known CALL/JP targets for labeling ---

const CALL_LABELS = new Map([
  [0x07F95E, 'Mov9_OP1toOP3'],
  [0x07F8B6, 'Mov9_OP4toOP2'],
  [0x07F8D8, 'Mov9_OP5toOP2'],
  [0x07F8FA, 'Mov9_OP1toOP2'],
  [0x07C747, 'OP1toOP2_with_norm (copy+normalize+negate+FPAdd)'],
  [0x07C755, 'OP1toOP2_no_norm (copy+FPAdd, NO normalize)'],
  [0x07CAB9, 'FPDiv_impl'],
  [0x07CA48, 'Normalize'],
  [0x080188, 'JmpThru'],
  [0x07CC36, 'FPAddSub_core'],
  [0x07F7BD, 'InvOP1S_impl (sign flip)'],
  [0x07CA06, 'InvOP1S'],
  [0x07FD4A, 'ValidityCheck (is OP1 zero?)'],
  [0x07FD69, 'ExponentCheck (SUB 0x80, SRL -> NZ if exp>0x80)'],
]);

// Known address labels within the gcd handler
const ADDR_LABELS = new Map([
  [0x068D3D, 'gcd_entry'],
  [0x068D61, 'gcd_sub1 (validator wrapper)'],
  [0x068D82, 'gcd_algo_body_start'],
  [0x068D8D, 'OP1->OP3 copy'],
  [0x068D91, 'OP1->OP5 backup'],
  [0x068D95, 'mystery_block (after OP1toOP5)'],
  [0x068DA1, 'E_Domain_check'],
  [0x068DEA, 'JP NC ErrDomain'],
]);

// --- Helpers ---

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

function addrLabel(addr) {
  const entry = ADDR_LABELS.get(addr);
  if (entry) return ` [${entry}]`;
  return '';
}

function targetLabel(addr) {
  const cl = CALL_LABELS.get(addr);
  if (cl) return cl;
  const al = ADDR_LABELS.get(addr);
  if (al) return al;
  return null;
}

// --- Instruction formatter (copied from phase 161) ---

function formatInstruction(instr) {
  const prefix = instr.modePrefix ? `.${instr.modePrefix} ` : '';
  const tag = instr.tag;

  if (tag === 'call')             return `${prefix}call ${hex(instr.target)}`;
  if (tag === 'call-conditional') return `${prefix}call ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp')               return `${prefix}jp ${hex(instr.target)}`;
  if (tag === 'jp-conditional')   return `${prefix}jp ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp-indirect')      return `${prefix}jp (${instr.indirectRegister})`;
  if (tag === 'jr')               return `${prefix}jr ${hex(instr.target)}`;
  if (tag === 'jr-conditional')   return `${prefix}jr ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'ret')              return `${prefix}ret`;
  if (tag === 'ret-conditional')  return `${prefix}ret ${instr.condition}`;
  if (tag === 'ld-reg-mem')       return `${prefix}ld ${instr.dest}, (${hex(instr.addr)})`;
  if (tag === 'ld-mem-reg')       return `${prefix}ld (${hex(instr.addr)}), ${instr.src}`;
  if (tag === 'ld-reg-imm')       return `${prefix}ld ${instr.dest}, ${hexByte(instr.value)}`;
  if (tag === 'ld-reg-reg')       return `${prefix}ld ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-pair-imm')      return `${prefix}ld ${instr.pair}, ${hex(instr.value)}`;
  if (tag === 'ld-reg-ind')       return `${prefix}ld ${instr.dest}, (${instr.src})`;
  if (tag === 'ld-ind-reg')       return `${prefix}ld (${instr.dest}), ${instr.src}`;
  if (tag === 'alu-imm')          return `${prefix}${instr.op} ${hexByte(instr.value)}`;
  if (tag === 'alu-reg')          return `${prefix}${instr.op} ${instr.src}`;
  if (tag === 'push')             return `${prefix}push ${instr.pair}`;
  if (tag === 'pop')              return `${prefix}pop ${instr.pair}`;
  if (tag === 'inc-reg')          return `${prefix}inc ${instr.reg}`;
  if (tag === 'dec-reg')          return `${prefix}dec ${instr.reg}`;
  if (tag === 'inc-pair')         return `${prefix}inc ${instr.pair}`;
  if (tag === 'dec-pair')         return `${prefix}dec ${instr.pair}`;
  if (tag === 'add-pair')         return `${prefix}add ${instr.dest}, ${instr.src}`;
  if (tag === 'ex-de-hl')         return `${prefix}ex de, hl`;
  if (tag === 'ldir')             return `${prefix}ldir`;
  if (tag === 'ldi')              return `${prefix}ldi`;
  if (tag === 'nop')              return `${prefix}nop`;
  if (tag === 'djnz')             return `${prefix}djnz ${hex(instr.target)}`;
  if (tag === 'rst')              return `${prefix}rst ${hex(instr.target)}`;
  if (tag === 'scf')              return `${prefix}scf`;
  if (tag === 'ccf')              return `${prefix}ccf`;
  if (tag === 'cpl')              return `${prefix}cpl`;
  if (tag === 'rla')              return `${prefix}rla`;
  if (tag === 'rra')              return `${prefix}rra`;
  if (tag === 'rlca')             return `${prefix}rlca`;
  if (tag === 'rrca')             return `${prefix}rrca`;
  if (tag === 'halt')             return `${prefix}halt`;
  if (tag === 'di')               return `${prefix}di`;
  if (tag === 'ei')               return `${prefix}ei`;
  if (tag === 'neg')              return `${prefix}neg`;
  if (tag === 'bit')              return `${prefix}bit ${instr.bit}, ${instr.reg}`;
  if (tag === 'set')              return `${prefix}set ${instr.bit}, ${instr.reg}`;
  if (tag === 'res')              return `${prefix}res ${instr.bit}, ${instr.reg}`;
  if (tag === 'sla')              return `${prefix}sla ${instr.reg}`;
  if (tag === 'sra')              return `${prefix}sra ${instr.reg}`;
  if (tag === 'srl')              return `${prefix}srl ${instr.reg}`;
  if (tag === 'rl')               return `${prefix}rl ${instr.reg}`;
  if (tag === 'rr')               return `${prefix}rr ${instr.reg}`;
  if (tag === 'rlc')              return `${prefix}rlc ${instr.reg}`;
  if (tag === 'rrc')              return `${prefix}rrc ${instr.reg}`;
  if (tag === 'ex-sp-hl')        return `${prefix}ex (sp), hl`;
  if (tag === 'exx')              return `${prefix}exx`;
  if (tag === 'ex-af')            return `${prefix}ex af, af'`;
  if (tag === 'daa')              return `${prefix}daa`;
  if (tag === 'reti')             return `${prefix}reti`;
  if (tag === 'retn')             return `${prefix}retn`;
  if (tag === 'cpir')             return `${prefix}cpir`;
  if (tag === 'cpdr')             return `${prefix}cpdr`;
  if (tag === 'lddr')             return `${prefix}lddr`;
  if (tag === 'inir')             return `${prefix}inir`;
  if (tag === 'otir')             return `${prefix}otir`;
  if (tag === 'in')               return `${prefix}in ${instr.dest}, (${instr.port ?? instr.src})`;
  if (tag === 'out')              return `${prefix}out (${instr.port ?? instr.dest}), ${instr.src}`;
  if (tag === 'sbc-pair')         return `${prefix}sbc ${instr.dest}, ${instr.src}`;
  if (tag === 'adc-pair')         return `${prefix}adc ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-mem-pair')      return `${prefix}ld (${hex(instr.addr)}), ${instr.pair}`;
  if (tag === 'ld-pair-mem')      return `${prefix}ld ${instr.pair}, (${hex(instr.addr)})`;

  return `${prefix}${tag}`;
}

// --- Disassembly helper ---

function decodeRange(startAddr, endAddr) {
  const entries = [];
  let pc = startAddr;

  while (pc < endAddr) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      const bytes = [];
      for (let i = 0; i < length; i++) {
        bytes.push(hexByte(romBytes[pc + i] ?? 0));
      }
      entries.push({
        pc,
        bytes: bytes.join(' '),
        tag: instr.tag,
        text: formatInstruction(instr),
        length,
        instr,
      });
      pc += length;
    } catch (error) {
      entries.push({
        pc,
        bytes: hexByte(romBytes[pc] ?? 0),
        tag: 'error',
        text: `decode-error: ${error?.message ?? error}`,
        length: 1,
        instr: null,
      });
      pc += 1;
    }
  }

  return entries;
}

// --- Annotation helper ---

function annotate(pc, instr) {
  if (!instr) return '';
  const tag = instr.tag;

  // CALL annotations
  if (tag === 'call' || tag === 'call-conditional') {
    const label = targetLabel(instr.target);
    if (label) return label;
    return `call -> ${hex(instr.target)}`;
  }

  // JP annotations
  if (tag === 'jp' || tag === 'jp-conditional') {
    const label = targetLabel(instr.target);
    if (label) return label;
    return `jp -> ${hex(instr.target)}`;
  }

  // JR annotations
  if (tag === 'jr' || tag === 'jr-conditional') {
    const label = targetLabel(instr.target);
    if (label) return `-> ${label}`;
    return `-> ${hex(instr.target)}`;
  }

  // Memory access to FP registers
  if (tag === 'ld-reg-mem' || tag === 'ld-mem-reg' || tag === 'ld-mem-pair' || tag === 'ld-pair-mem') {
    const addr = instr.addr;
    if (addr >= 0xD005F8 && addr <= 0xD00602) return `OP1[${addr - 0xD005F8}]`;
    if (addr >= 0xD00603 && addr <= 0xD0060D) return `OP2[${addr - 0xD00603}]`;
    if (addr >= 0xD0060E && addr <= 0xD00618) return `OP3[${addr - 0xD0060E}]`;
    if (addr >= 0xD00619 && addr <= 0xD00623) return `OP4[${addr - 0xD00619}]`;
    if (addr >= 0xD00624 && addr <= 0xD0062E) return `OP5[${addr - 0xD00624}]`;
    if (addr >= 0xD0062F && addr <= 0xD00639) return `OP6[${addr - 0xD0062F}]`;
  }

  // ALU ops
  if (tag === 'alu-imm' && instr.op === 'cp') {
    if (instr.value === 0x80) return 'cp 0x80 -- test if exp < 0x80 (biased)';
    if (instr.value === 0x00) return 'cp 0 -- test if zero';
  }

  if (tag === 'alu-imm' && instr.op === 'xor') {
    if (instr.value === 0x80) return 'flip sign bit';
  }

  if (tag === 'alu-reg' && instr.op === 'xor' && instr.src === 'a') return 'A=0';
  if (tag === 'alu-reg' && instr.op === 'or' && instr.src === 'a') return 'test A (set flags)';

  if (tag === 'ret') return 'return';
  if (tag === 'ret-conditional') return `conditional return (${instr.condition})`;

  return '';
}

// ==========================================================================
// Main disassembly
// ==========================================================================

function main() {
  console.log('=== Phase 162: gcd Algorithm Body Static Disassembly ===');
  console.log(`    Range: ${hex(DISASM_START)} - ${hex(0x068DEA)}`);
  console.log(`    ROM size: ${romBytes.length} bytes (${hex(romBytes.length)})`);

  // --- Raw bytes dump ---
  const rawLen = 0x068DEB - DISASM_START;
  console.log(`\n  Raw bytes (${rawLen} bytes):`);
  for (let row = 0; row < rawLen; row += 16) {
    const addr = DISASM_START + row;
    const chunks = [];
    for (let i = 0; i < 16 && (row + i) < rawLen; i++) {
      chunks.push(hexByte(romBytes[addr + i] ?? 0));
    }
    console.log(`    ${hex(addr)}  ${chunks.join(' ')}`);
  }

  // --- Full disassembly ---
  console.log(`\n${'='.repeat(80)}`);
  console.log('FULL DISASSEMBLY: 0x068D82 - 0x068DEA');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  const entries = decodeRange(DISASM_START, 0x068DF0); // decode a bit past to catch the JP at 0x068DEA

  for (const entry of entries) {
    if (entry.pc > 0x068DEF) break; // stop after we've shown the JP at 0x068DEA

    const label = addrLabel(entry.pc);
    const note = entry.instr ? annotate(entry.pc, entry.instr) : '';
    const noteStr = note ? `  ; ${note}` : '';

    // Print separator at known addresses
    if (ADDR_LABELS.has(entry.pc) && entry.pc !== DISASM_START) {
      console.log(`  ${'- '.repeat(40)}`);
    }

    console.log(`  ${hex(entry.pc)}  ${entry.bytes.padEnd(24)}  ${entry.text}${label}${noteStr}`);
  }

  // --- CALL/JP target summary ---
  console.log(`\n${'='.repeat(80)}`);
  console.log('CALL/JP TARGET SUMMARY');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  const callTargets = new Map();
  for (const entry of entries) {
    if (entry.pc > 0x068DEF) break;
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if (tag === 'call' || tag === 'call-conditional' || tag === 'jp' || tag === 'jp-conditional') {
      const target = entry.instr.target;
      const label = targetLabel(target);
      const type = tag.startsWith('call') ? 'CALL' : 'JP';
      const cond = tag.includes('conditional') ? ` ${entry.instr.condition}` : '';
      if (!callTargets.has(target)) {
        callTargets.set(target, []);
      }
      callTargets.get(target).push({ from: entry.pc, type, cond });
    }
  }

  // Sort by target address
  const sortedTargets = [...callTargets.entries()].sort((a, b) => a[0] - b[0]);
  for (const [target, refs] of sortedTargets) {
    const label = targetLabel(target) || '(unknown)';
    console.log(`  ${hex(target)}  ${label}`);
    for (const ref of refs) {
      console.log(`      from ${hex(ref.from)}  ${ref.type}${ref.cond}`);
    }
  }

  // --- JR target summary ---
  console.log(`\n${'='.repeat(80)}`);
  console.log('JR (RELATIVE JUMP) TARGET SUMMARY');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  for (const entry of entries) {
    if (entry.pc > 0x068DEF) break;
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if (tag === 'jr' || tag === 'jr-conditional') {
      const target = entry.instr.target;
      const label = targetLabel(target) || addrLabel(target).trim() || '';
      const cond = tag === 'jr-conditional' ? ` ${entry.instr.condition}` : '';
      const direction = target < entry.pc ? 'BACKWARD' : 'FORWARD';
      console.log(`  ${hex(entry.pc)}  jr${cond} -> ${hex(target)}  ${direction}  ${label}`);
    }
  }

  // --- Loop structure analysis ---
  console.log(`\n${'='.repeat(80)}`);
  console.log('EUCLIDEAN LOOP STRUCTURE ANALYSIS');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  // Find backward jumps (these indicate loop tops)
  const backwardJumps = [];
  for (const entry of entries) {
    if (entry.pc > 0x068DEF) break;
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if ((tag === 'jr' || tag === 'jr-conditional' || tag === 'jp' || tag === 'jp-conditional') && entry.instr.target < entry.pc) {
      backwardJumps.push({
        from: entry.pc,
        to: entry.instr.target,
        cond: tag.includes('conditional') ? entry.instr.condition : 'unconditional',
        type: tag.startsWith('jr') ? 'JR' : 'JP',
      });
    }
  }

  if (backwardJumps.length > 0) {
    console.log('  Backward jumps (loop candidates):');
    for (const bj of backwardJumps) {
      console.log(`    ${bj.type} at ${hex(bj.from)} -> ${hex(bj.to)}  (${bj.cond})`);
      console.log(`      Loop body: ${hex(bj.to)} to ${hex(bj.from)}`);
    }
  } else {
    console.log('  No backward jumps found in this range.');
    console.log('  The loop structure may use CALL-based iteration or be outside this range.');
  }

  // Print forward jumps too for context
  const forwardJumps = [];
  for (const entry of entries) {
    if (entry.pc > 0x068DEF) break;
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if ((tag === 'jr' || tag === 'jr-conditional') && entry.instr.target > entry.pc) {
      forwardJumps.push({
        from: entry.pc,
        to: entry.instr.target,
        cond: tag.includes('conditional') ? entry.instr.condition : 'unconditional',
      });
    }
  }

  if (forwardJumps.length > 0) {
    console.log('\n  Forward jumps (skip/exit candidates):');
    for (const fj of forwardJumps) {
      console.log(`    JR at ${hex(fj.from)} -> ${hex(fj.to)}  (${fj.cond})`);
    }
  }

  // Identify key blocks
  console.log('\n  Key address annotations from session 154/161:');
  console.log('    0x068D82 = algorithm body start (after validation)');
  console.log('    0x068D8D = CALL Mov9 OP1->OP3 (save dividend)');
  console.log('    0x068D91 = OP1->OP5 backup');
  console.log('    0x068D95 = mystery block (between OP1toOP5 and second OP1toOP2)');
  console.log('    0x068DA1 = E_Domain check path');
  console.log('    0x068DC7 = JmpThru indirect call site (per session 154)');
  console.log('    0x068DDB = JmpThru indirect call site (per session 154)');
  console.log('    0x068DEA = JP NC ErrDomain');

  console.log('\n\nDone.');
}

try {
  main();
  process.exitCode = 0;
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
