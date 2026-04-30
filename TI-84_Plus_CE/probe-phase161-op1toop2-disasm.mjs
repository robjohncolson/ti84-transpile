#!/usr/bin/env node

/**
 * Phase 161 - Static disassembly of OP1toOP2 compound function region
 *
 * Part A: Full byte-by-byte disassembly of 0x07C740 through 0x07C790
 * Part B: Disassemble 0x07CA00-0x07CA10 (InvOP1Sc/InvOP1S boundary)
 * Part C: Summary table of entry points and their mathematical intent
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

const PART_A_START = 0x07c740;
const PART_A_END   = 0x07c790; // exclusive

const PART_B_START = 0x07ca00;
const PART_B_END   = 0x07ca10; // exclusive

// --- Known CALL targets for labeling ---

const CALL_LABELS = new Map([
  [0x07f8fa, 'Mov9_OP1toOP2'],
  [0x07ca48, 'Normalize'],
  [0x07ca06, 'InvOP1S'],
  [0x07cc36, 'FPAddSub_core'],
  [0x07fa86, 'ConstLoader_1.0'],
  [0x07f7bd, 'InvOP1S_impl'],
  [0x07ca27, 'InvOP1Sc_conditioning'],
  [0x07c77f, 'FPAdd'],
  [0x07c771, 'FPSub'],
]);

// Known entry point labels within the compound function
const ENTRY_LABELS = new Map([
  [0x07c740, 'OP1toOP2_top'],
  [0x07c747, 'OP1toOP2_with_norm'],
  [0x07c755, 'OP1toOP2_no_norm'],
  [0x07c75b, 'Load1_FPAdd'],
  [0x07c767, 'Load1_FPSub(?)'],
  [0x07c76d, 'Load1_FPSub_alt(?)'],
  [0x07c771, 'FPSub'],
  [0x07c77f, 'FPAdd'],
  [0x07c783, 'FPAdd_plus4'],
  [0x07ca00, 'InvOP1Sc_region'],
  [0x07ca02, 'InvOP1Sc'],
  [0x07ca06, 'InvOP1S'],
]);

// --- Helpers ---

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

function addrLabel(addr) {
  const entry = ENTRY_LABELS.get(addr);
  if (entry) return ` [${entry}]`;
  const call = CALL_LABELS.get(addr);
  if (call) return ` [${call}]`;
  return '';
}

function targetLabel(addr) {
  const entry = ENTRY_LABELS.get(addr);
  if (entry) return entry;
  const call = CALL_LABELS.get(addr);
  if (call) return call;
  return null;
}

// --- Instruction formatter ---

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

// Manual 3-byte LE decode
function read24LE(addr) {
  return (
    (romBytes[addr] & 0xff) |
    ((romBytes[addr + 1] & 0xff) << 8) |
    ((romBytes[addr + 2] & 0xff) << 16)
  );
}

// Annotate instruction for FP math context
function annotate(pc, instr) {
  if (!instr) return '';
  const tag = instr.tag;

  // CALL annotations
  if (tag === 'call' || tag === 'call-conditional') {
    const t = instr.target;
    const label = targetLabel(t);
    if (label) return label;
    return `call -> ${hex(t)}`;
  }

  // JP annotations
  if (tag === 'jp' || tag === 'jp-conditional') {
    const t = instr.target;
    const label = targetLabel(t);
    if (label) return label;
    return `jp -> ${hex(t)}`;
  }

  // JR annotations
  if (tag === 'jr' || tag === 'jr-conditional') {
    const label = targetLabel(instr.target);
    if (label) return `-> ${label}`;
    return `-> ${hex(instr.target)}`;
  }

  // Memory access to OP1 (0xD005F8..0xD00602) or OP2 (0xD00603..0xD0060D)
  if (tag === 'ld-reg-mem' || tag === 'ld-mem-reg' || tag === 'ld-mem-pair' || tag === 'ld-pair-mem') {
    const addr = instr.addr;
    if (addr >= 0xd005f8 && addr <= 0xd00602) return `OP1[${addr - 0xd005f8}]`;
    if (addr >= 0xd00603 && addr <= 0xd0060d) return `OP2[${addr - 0xd00603}]`;
  }

  // ALU ops
  if (tag === 'alu-imm' && instr.op === 'cp') {
    if (instr.value === 0x80) return 'cp 0x80 — test if exp < 0x80 (biased)';
    if (instr.value === 0x00) return 'cp 0 — test if zero';
  }

  if (tag === 'alu-imm' && instr.op === 'xor') {
    if (instr.value === 0x80) return 'flip sign bit';
  }

  if (tag === 'alu-reg' && instr.op === 'xor' && instr.src === 'a') return 'A=0';

  if (tag === 'ret') return 'return';
  if (tag === 'ret-conditional') return `conditional return (${instr.condition})`;

  return '';
}

// ==========================================================================
// Part A: Full disassembly 0x07C740 through 0x07C790
// ==========================================================================

function partA() {
  console.log(`\n${'='.repeat(72)}`);
  console.log('PART A: Full disassembly 0x07C740 - 0x07C790 (80 bytes)');
  console.log('        OP1toOP2 compound function region');
  console.log(`${'='.repeat(72)}`);

  // Raw bytes dump
  const rawLen = PART_A_END - PART_A_START;
  console.log(`\n  Raw bytes (${rawLen} bytes):`);
  for (let row = 0; row < rawLen; row += 16) {
    const addr = PART_A_START + row;
    const chunks = [];
    for (let i = 0; i < 16 && (row + i) < rawLen; i++) {
      chunks.push(hexByte(romBytes[addr + i] ?? 0));
    }
    console.log(`    ${hex(addr)}  ${chunks.join(' ')}`);
  }

  // Full disassembly
  console.log('\n  Disassembly:');
  console.log(`  ${'─'.repeat(68)}`);

  const entries = decodeRange(PART_A_START, PART_A_END);

  for (const entry of entries) {
    const label = addrLabel(entry.pc);
    const note = entry.instr ? annotate(entry.pc, entry.instr) : '';
    const noteStr = note ? `  ; ${note}` : '';

    // If this is a known entry point, print a separator line before it
    if (ENTRY_LABELS.has(entry.pc) && entry.pc !== PART_A_START) {
      console.log(`  ${'─'.repeat(68)}`);
    }

    console.log(`    ${hex(entry.pc)}  ${entry.bytes.padEnd(20)}  ${entry.text}${label}${noteStr}`);
  }

  console.log(`  ${'─'.repeat(68)}`);

  return entries;
}

// ==========================================================================
// Part B: Disassemble 0x07CA00-0x07CA10 (InvOP1Sc/InvOP1S boundary)
// ==========================================================================

function partB() {
  console.log(`\n${'='.repeat(72)}`);
  console.log('PART B: Disassembly 0x07CA00 - 0x07CA10 (InvOP1Sc / InvOP1S)');
  console.log(`${'='.repeat(72)}`);

  // Raw bytes dump
  const rawLen = PART_B_END - PART_B_START;
  console.log(`\n  Raw bytes (${rawLen} bytes):`);
  for (let row = 0; row < rawLen; row += 16) {
    const addr = PART_B_START + row;
    const chunks = [];
    for (let i = 0; i < 16 && (row + i) < rawLen; i++) {
      chunks.push(hexByte(romBytes[addr + i] ?? 0));
    }
    console.log(`    ${hex(addr)}  ${chunks.join(' ')}`);
  }

  // Full disassembly
  console.log('\n  Disassembly:');
  console.log(`  ${'─'.repeat(68)}`);

  const entries = decodeRange(PART_B_START, PART_B_END);

  for (const entry of entries) {
    const label = addrLabel(entry.pc);
    const note = entry.instr ? annotate(entry.pc, entry.instr) : '';
    const noteStr = note ? `  ; ${note}` : '';

    if (ENTRY_LABELS.has(entry.pc) && entry.pc !== PART_B_START) {
      console.log(`  ${'─'.repeat(68)}`);
    }

    console.log(`    ${hex(entry.pc)}  ${entry.bytes.padEnd(20)}  ${entry.text}${label}${noteStr}`);
  }

  console.log(`  ${'─'.repeat(68)}`);

  // Session 76 validation
  console.log('\n  Session 76 validation:');
  console.log('    Expected: InvOP1Sc at 0x07CA02 calls 0x07CA27, falls into InvOP1S at 0x07CA06');
  console.log('    Expected: InvOP1S  at 0x07CA06 calls 0x07F7BD');

  let foundInvOP1ScCall = false;
  let foundInvOP1SCall = false;

  for (const entry of entries) {
    if (!entry.instr) continue;
    if ((entry.instr.tag === 'call' || entry.instr.tag === 'call-conditional') && entry.pc >= 0x07ca02 && entry.pc < 0x07ca06) {
      if (entry.instr.target === 0x07ca27) {
        foundInvOP1ScCall = true;
        console.log(`    CONFIRMED: InvOP1Sc at ${hex(entry.pc)} calls ${hex(entry.instr.target)} (InvOP1Sc_conditioning)`);
      }
    }
    if ((entry.instr.tag === 'call' || entry.instr.tag === 'call-conditional') && entry.pc >= 0x07ca06 && entry.pc < 0x07ca0a) {
      if (entry.instr.target === 0x07f7bd) {
        foundInvOP1SCall = true;
        console.log(`    CONFIRMED: InvOP1S  at ${hex(entry.pc)} calls ${hex(entry.instr.target)} (InvOP1S_impl)`);
      }
    }
  }

  if (!foundInvOP1ScCall) console.log('    NOT FOUND: InvOP1Sc call to 0x07CA27 in this range');
  if (!foundInvOP1SCall) console.log('    NOT FOUND: InvOP1S  call to 0x07F7BD in this range');

  return entries;
}

// ==========================================================================
// Part C: Summary table of entry points and their mathematical intent
// ==========================================================================

function partC(partAEntries) {
  console.log(`\n${'='.repeat(72)}`);
  console.log('PART C: Entry point summary table');
  console.log(`${'='.repeat(72)}`);

  // Build a map of pc -> instruction for quick lookup
  const instrMap = new Map();
  for (const entry of partAEntries) {
    instrMap.set(entry.pc, entry);
  }

  // For each known entry point in the Part A range, trace forward to
  // identify the sequence of operations before reaching FPAdd/FPSub
  const entryPoints = [
    0x07c747,
    0x07c755,
    0x07c75b,
    0x07c767,
    0x07c76d,
    0x07c771,
    0x07c77f,
    0x07c783,
  ];

  console.log('\n  Entry Point  | Label                  | Steps to FPAdd/FPSub         | Mathematical Intent');
  console.log(`  ${'─'.repeat(96)}`);

  for (const ep of entryPoints) {
    const label = ENTRY_LABELS.get(ep) || '???';

    // Trace forward from this entry point, collecting operations
    const ops = [];
    let pc = ep;
    let reachedEnd = false;
    let maxSteps = 20;

    while (!reachedEnd && maxSteps-- > 0) {
      const entry = instrMap.get(pc);
      if (!entry) break;

      const instr = entry.instr;
      if (!instr) break;

      const tag = instr.tag;

      // Collect the operation
      if (tag === 'call' || tag === 'call-conditional') {
        const tLabel = targetLabel(instr.target);
        ops.push(tLabel || `call ${hex(instr.target)}`);

        // If calling FPAddSub_core, we've reached the core
        if (instr.target === 0x07cc36) {
          reachedEnd = true;
          break;
        }
      } else if (tag === 'jp' || tag === 'jp-conditional') {
        const tLabel = targetLabel(instr.target);
        ops.push(tLabel ? `jp ${tLabel}` : `jp ${hex(instr.target)}`);

        // Follow unconditional jumps within our range
        if (tag === 'jp' && instr.target >= PART_A_START && instr.target < PART_A_END) {
          pc = instr.target;
          continue;
        }
        reachedEnd = true;
        break;
      } else if (tag === 'jr' || tag === 'jr-conditional') {
        const tLabel = targetLabel(instr.target);
        if (tag === 'jr' && instr.target >= PART_A_START && instr.target < PART_A_END) {
          ops.push(`jr -> ${tLabel || hex(instr.target)}`);
          pc = instr.target;
          continue;
        }
        ops.push(`jr -> ${tLabel || hex(instr.target)}`);
        reachedEnd = true;
        break;
      } else if (tag === 'ret') {
        ops.push('ret');
        reachedEnd = true;
        break;
      } else {
        // Non-control-flow: note interesting ones
        if (tag === 'alu-imm' && instr.op === 'xor') {
          ops.push(`xor ${hexByte(instr.value)}`);
        }
      }

      pc += entry.length;
    }

    const opsStr = ops.join(' -> ');

    // Derive mathematical intent
    let intent = '???';
    const opsJoined = ops.join(',');

    if (opsJoined.includes('Mov9_OP1toOP2') && opsJoined.includes('Normalize') && opsJoined.includes('InvOP1S')) {
      intent = 'OP2 - OP1 (copy, normalize, negate, add)';
    } else if (opsJoined.includes('Mov9_OP1toOP2') && opsJoined.includes('Normalize') && !opsJoined.includes('InvOP1S')) {
      intent = 'OP2 + normalize(OP1) (copy, normalize, add)';
    } else if (opsJoined.includes('Mov9_OP1toOP2') && !opsJoined.includes('Normalize')) {
      intent = 'OP1 + OP1 = 2*OP1 (copy OP1->OP2, add)';
    } else if (opsJoined.includes('ConstLoader_1.0') && opsJoined.includes('FPAdd')) {
      intent = 'OP1 + 1.0 (increment)';
    } else if (opsJoined.includes('ConstLoader_1.0') && opsJoined.includes('FPSub')) {
      intent = 'OP1 - 1.0 (decrement)';
    } else if (opsJoined.includes('FPSub') || opsJoined.includes('FPAddSub_core')) {
      if (ep === 0x07c771) intent = 'OP1 - OP2 (subtraction entry)';
    } else if (opsJoined.includes('FPAdd')) {
      if (ep === 0x07c77f) intent = 'OP1 + OP2 (addition entry)';
      if (ep === 0x07c783) intent = 'OP1 + OP2 (addition, skip setup)';
    }

    // If we have xor 80 it means sign flip (negate for subtraction)
    if (opsJoined.includes('xor 80') && intent === '???') {
      intent = 'sign-flip variant (subtract via negate+add)';
    }

    const paddedEP = hex(ep).padEnd(12);
    const paddedLabel = label.padEnd(22);
    console.log(`  ${paddedEP} | ${paddedLabel} | ${opsStr.substring(0, 28).padEnd(28)} | ${intent}`);
  }

  // Also print a flat instruction-by-instruction trace showing fall-through paths
  console.log('\n  Fall-through flow analysis:');
  console.log(`  ${'─'.repeat(68)}`);

  let prevWasControl = false;
  for (const entry of partAEntries) {
    const isEntry = ENTRY_LABELS.has(entry.pc);
    if (isEntry || prevWasControl) {
      const label = ENTRY_LABELS.get(entry.pc);
      if (label) {
        console.log(`    >> ${label} (${hex(entry.pc)}):`);
      }
    }

    const note = entry.instr ? annotate(entry.pc, entry.instr) : '';
    const noteStr = note ? `  ; ${note}` : '';
    console.log(`       ${hex(entry.pc)}  ${entry.text}${noteStr}`);

    const tag = entry.instr?.tag;
    prevWasControl = (tag === 'ret' || tag === 'jp' || tag === 'jr' ||
                      tag === 'call' && entry.instr?.target === 0x07cc36);
  }
}

// --- Main ---

function main() {
  console.log('=== Phase 161: OP1toOP2 Compound Function Static Disassembly ===');
  console.log('');
  console.log(`  ROM size: ${romBytes.length} bytes (${hex(romBytes.length)})`);

  // Part A
  const partAEntries = partA();

  // Part B
  partB();

  // Part C
  partC(partAEntries);

  console.log('\n\nDone.');
}

try {
  main();
  process.exitCode = 0;
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
