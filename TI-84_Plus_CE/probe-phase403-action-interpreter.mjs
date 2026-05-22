#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase403-action-interpreter-report.md');

const rom = fs.readFileSync(ROM_PATH);

// Primary action byte interpreter entry
const INTERPRETER_START = 0x07FDC9;
const INTERPRETER_END = 0x07FEA0;

// Known special addresses from session 402
const ACTION_SLOT_0 = 0xD005F8;
const AND_MASK = 0x3F;
const BIT7_MASK = 0x80;

const CALL_OPS = new Set([0xC4, 0xCC, 0xCD, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);
const JP_OPS = new Set([0xC2, 0xC3, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]);
const CONTROL_TAGS = new Set(['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional']);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function formatSigned(value) {
  const n = Number(value ?? 0);
  return `${n >= 0 ? '+' : '-'}0x${Math.abs(n).toString(16).toUpperCase()}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister)}${formatSigned(displacement)})`;
}

function bytesToHex(start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rom.length, safeStart + Math.max(0, length));
  return Array.from(rom.subarray(safeStart, safeEnd), (v) => hexByte(v)).join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstruction(inst) {
  if (!inst) return '<null>';
  const tag = inst.tag ?? 'unknown';
  if (tag === 'db') return `db ${hexByte(inst.value)}`;

  switch (tag) {
    case 'nop': case 'halt': case 'di': case 'ei': case 'ret':
    case 'reti': case 'retn': case 'rlca': case 'rrca': case 'rla':
    case 'rra': case 'daa': case 'cpl': case 'scf': case 'ccf':
    case 'neg': case 'ldi': case 'ldd': case 'ldir': case 'lddr':
    case 'cpi': case 'cpd': case 'cpir': case 'cpdr': case 'exx':
      return tag;
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz':
      return `djnz ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister})`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'rst':
      return `rst ${hexByte(inst.target)}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm':
      return `ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-pair-ind':
      return `ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair':
      return `ld (${inst.dest}), ${inst.pair}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-pair':
      return `ld sp, ${inst.pair}`;
    case 'ld-pair-indexed':
      return `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-special':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-mb-a':
      return 'ld mb, a';
    case 'ld-a-mb':
      return 'ld a, mb';
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'inc-ixd':
      return `inc ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `dec ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'adc-pair':
      return `adc hl, ${inst.src}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ixd':
      return `${inst.op} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set':
      return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind':
      return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res':
      return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind':
      return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ex-af':
      return "ex af, af'";
    case 'ex-de-hl':
      return 'ex de, hl';
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    case 'ex-sp-pair':
      return `ex (sp), ${inst.pair}`;
    case 'im':
      return `im ${inst.value}`;
    case 'mlt':
      return `mlt ${inst.reg}`;
    case 'lea':
      return `lea ${inst.dest}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'pea':
      return `pea ${inst.base}${formatSigned(inst.displacement)}`;
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'decodeError', 'tag']);
      const extras = Object.entries(inst)
        .filter(([k, v]) => !ignored.has(k) && v !== undefined && v !== null)
        .map(([k, v]) => typeof v === 'number' ? `${k}=${hex(v, v > 0xFF ? 6 : 2)}` : `${k}=${v}`)
        .join(' ');
      return extras ? `${tag} ${extras}` : tag;
    }
  }
}

// ===== Disassemble a range =====
function disassembleRange(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end && rows.length < 1024) {
    const inst = safeDecode(pc);
    rows.push(inst);
    pc += Math.max(1, inst.length || 1);
  }
  return rows;
}

function formatRow(inst) {
  return `${hex(inst.pc)}  ${bytesToHex(inst.pc, inst.length).padEnd(20)} ${formatInstruction(inst)}`;
}

function printDisassembly(title, instructions) {
  console.log(`\n=== ${title} ===`);
  for (const inst of instructions) {
    console.log(`  ${formatRow(inst)}`);
  }
}

// ===== Find all CALL/JP references to a target in the ROM =====
function findReferences(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const refs = [];

  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    const opcode = rom[pc];
    if (rom[pc + 1] !== lo || rom[pc + 2] !== mid || rom[pc + 3] !== hi) {
      continue;
    }
    if (!CALL_OPS.has(opcode) && !JP_OPS.has(opcode)) {
      continue;
    }
    const inst = safeDecode(pc);
    if (inst.target === target) {
      refs.push({ pc, inst });
    }
  }
  return refs;
}

// ===== Extract action code dispatch table =====
function extractDispatchTable(instructions) {
  const actionCodes = [];
  const transfers = [];
  const bit7Info = [];
  const specialCodes = { code1C: null, code1D: null };

  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];

    // Track AND mask operations
    if (inst.tag === 'alu-imm' && inst.op === 'and') {
      actionCodes.push({ type: 'and-mask', pc: inst.pc, value: inst.value });
    }

    // Track CP (compare) instructions — these define the dispatch points
    if (inst.tag === 'alu-imm' && inst.op === 'cp') {
      const compareValue = inst.value;
      // Look ahead for the conditional jump
      let handler = null;
      for (let j = i + 1; j < Math.min(instructions.length, i + 4); j++) {
        const next = instructions[j];
        if (next.tag === 'jr-conditional' || next.tag === 'jp-conditional' || next.tag === 'call-conditional') {
          handler = { condition: next.condition, target: next.target, pc: next.pc, type: next.tag };
          break;
        }
        if (next.tag === 'jp' || next.tag === 'call' || next.tag === 'jr') {
          handler = { condition: 'unconditional', target: next.target, pc: next.pc, type: next.tag };
          break;
        }
      }
      actionCodes.push({
        type: 'compare',
        pc: inst.pc,
        value: compareValue,
        handler,
      });

      // Identify special codes
      if (compareValue === 0x1C) {
        specialCodes.code1C = { cpPc: inst.pc, handler };
      }
      if (compareValue === 0x1D) {
        specialCodes.code1D = { cpPc: inst.pc, handler };
      }
    }

    // Track BIT 7,A tests (or AND 0x80 / BIT 7,reg)
    if (inst.tag === 'bit-test' && inst.bit === 7) {
      bit7Info.push({ pc: inst.pc, reg: inst.reg, inst });
      // Look ahead for the conditional branch
      for (let j = i + 1; j < Math.min(instructions.length, i + 3); j++) {
        const next = instructions[j];
        if (next.tag === 'jr-conditional' || next.tag === 'jp-conditional') {
          bit7Info.push({ pc: next.pc, type: 'branch', condition: next.condition, target: next.target });
          break;
        }
      }
    }

    // Track all control transfers
    if (CONTROL_TAGS.has(inst.tag) && typeof inst.target === 'number') {
      transfers.push(inst);
    }
    if (inst.tag === 'jp-indirect') {
      transfers.push(inst);
    }
  }

  return { actionCodes, transfers, bit7Info, specialCodes };
}

// ===== Trace a handler entry — disassemble a few instructions =====
function traceHandler(addr, maxInst = 12) {
  const rows = [];
  let pc = addr;
  for (let i = 0; i < maxInst && pc < rom.length; i++) {
    const inst = safeDecode(pc);
    rows.push(inst);
    if (inst.tag === 'ret' || inst.tag === 'jp') break;
    pc += Math.max(1, inst.length || 1);
  }
  return rows;
}

// ===== MAIN =====
function main() {
  const output = [];
  function log(line = '') {
    console.log(line);
    output.push(line);
  }

  log('# Phase 403: Primary Action Byte Interpreter at 0x07FDD6');
  log('');
  log(`ROM: ${ROM_PATH}`);
  log(`Focus window: ${hex(INTERPRETER_START)}..${hex(INTERPRETER_END - 1)}`);
  log('');

  // 1. Disassemble the full range
  const allInstructions = disassembleRange(INTERPRETER_START, INTERPRETER_END);

  log('## Full Disassembly: 0x07FDC9..0x07FE9F');
  log('');
  log('```');
  for (const inst of allInstructions) {
    log(`  ${formatRow(inst)}`);
  }
  log('```');
  log('');

  // 2. Extract dispatch table
  const { actionCodes, transfers, bit7Info, specialCodes } = extractDispatchTable(allInstructions);

  // 3. AND mask analysis
  log('## AND Mask Operations');
  log('');
  const andMasks = actionCodes.filter((a) => a.type === 'and-mask');
  if (andMasks.length === 0) {
    log('No AND mask instructions found in this range.');
  } else {
    for (const m of andMasks) {
      log(`  ${hex(m.pc)}: AND ${hexByte(m.value)} — masks action byte to ${m.value === 0x3F ? '6 low bits (0x00..0x3F)' : `${m.value} bits`}`);
    }
  }
  log('');

  // 4. Action code comparison cascade
  log('## Action Code Comparison Cascade');
  log('');
  const compares = actionCodes.filter((a) => a.type === 'compare');
  if (compares.length === 0) {
    log('No CP (compare) instructions found in this range.');
  } else {
    log('| CP Value | Hex  | Handler Condition | Handler Target | Handler Type |');
    log('|----------|------|-------------------|----------------|--------------|');
    for (const c of compares) {
      const h = c.handler;
      const handlerStr = h ? `${h.condition}` : 'none';
      const targetStr = h ? hex(h.target) : 'n/a';
      const typeStr = h ? h.type : 'n/a';
      log(`| ${c.value.toString().padStart(4)} (${hexByte(c.value)}) | ${hexByte(c.value)} | ${handlerStr.padEnd(17)} | ${targetStr.padEnd(14)} | ${typeStr.padEnd(12)} |`);
    }
  }
  log('');

  // 5. Bit 7 modifier
  log('## Bit 7 (0x80) Modifier Behavior');
  log('');
  if (bit7Info.length === 0) {
    // Also check for AND 0x80 or BIT 7 via raw scan
    let foundBit7 = false;
    for (const inst of allInstructions) {
      if (inst.tag === 'alu-imm' && inst.op === 'and' && inst.value === 0x80) {
        log(`  ${hex(inst.pc)}: AND 0x80 — tests bit 7 of A`);
        foundBit7 = true;
      }
      if (inst.tag === 'bit-test' && inst.bit === 7) {
        log(`  ${hex(inst.pc)}: BIT 7,${inst.reg} — tests bit 7`);
        foundBit7 = true;
      }
    }
    if (!foundBit7) {
      log('No explicit BIT 7 test found in this range. Checking for RES/SET bit 7...');
      for (const inst of allInstructions) {
        if ((inst.tag === 'bit-res' || inst.tag === 'bit-set') && inst.bit === 7) {
          log(`  ${hex(inst.pc)}: ${formatInstruction(inst)}`);
          foundBit7 = true;
        }
      }
      if (!foundBit7) {
        log('No bit 7 operations found in this range.');
      }
    }
  } else {
    for (const info of bit7Info) {
      if (info.type === 'branch') {
        log(`  ${hex(info.pc)}: branches ${info.condition} to ${hex(info.target)} based on bit 7`);
      } else {
        log(`  ${hex(info.pc)}: BIT 7,${info.reg}`);
      }
    }
  }
  log('');

  // 6. Special handling for 0x1C and 0x1D
  log('## Special Action Codes: 0x1C and 0x1D');
  log('');
  if (specialCodes.code1C) {
    const c = specialCodes.code1C;
    log(`### Action 0x1C`);
    log(`  CP at ${hex(c.cpPc)}`);
    if (c.handler) {
      log(`  Branches ${c.handler.condition} to ${hex(c.handler.target)} via ${c.handler.type}`);
      log('');
      log('  Handler disassembly:');
      const handlerInsts = traceHandler(c.handler.target);
      for (const inst of handlerInsts) {
        log(`    ${formatRow(inst)}`);
      }
    } else {
      log('  No conditional branch found after CP.');
    }
  } else {
    log('  No explicit CP 0x1C found in range.');
  }
  log('');

  if (specialCodes.code1D) {
    const c = specialCodes.code1D;
    log(`### Action 0x1D`);
    log(`  CP at ${hex(c.cpPc)}`);
    if (c.handler) {
      log(`  Branches ${c.handler.condition} to ${hex(c.handler.target)} via ${c.handler.type}`);
      log('');
      log('  Handler disassembly:');
      const handlerInsts = traceHandler(c.handler.target);
      for (const inst of handlerInsts) {
        log(`    ${formatRow(inst)}`);
      }
    } else {
      log('  No conditional branch found after CP.');
    }
  } else {
    log('  No explicit CP 0x1D found in range.');
  }
  log('');

  // 7. All CALL/JP targets from within the range
  log('## CALL/JP Targets Within 0x07FDC9..0x07FE9F');
  log('');
  const uniqueTargets = new Map();
  for (const inst of transfers) {
    if (typeof inst.target === 'number') {
      const key = inst.target;
      if (!uniqueTargets.has(key)) {
        uniqueTargets.set(key, []);
      }
      uniqueTargets.get(key).push(inst);
    } else if (inst.tag === 'jp-indirect') {
      log(`  ${hex(inst.pc)}: ${formatInstruction(inst)} (indirect — target determined at runtime)`);
    }
  }

  log('| Target Address | Called From | Instruction |');
  log('|---------------|-------------|-------------|');
  for (const [target, callers] of [...uniqueTargets.entries()].sort((a, b) => a[0] - b[0])) {
    for (const inst of callers) {
      log(`| ${hex(target)} | ${hex(inst.pc)} | ${formatInstruction(inst)} |`);
    }
  }
  log('');

  // 8. Trace unique handler targets (first few instructions)
  log('## Handler Entry Point Previews');
  log('');
  for (const [target] of [...uniqueTargets.entries()].sort((a, b) => a[0] - b[0])) {
    // Skip targets within our own range (internal branches)
    if (target >= INTERPRETER_START && target < INTERPRETER_END) {
      continue;
    }
    log(`### Handler at ${hex(target)}`);
    log('```');
    const preview = traceHandler(target, 8);
    for (const inst of preview) {
      log(`  ${formatRow(inst)}`);
    }
    log('```');
    log('');
  }

  // 9. Find all callers of 0x07FDD6
  log('## Callers of 0x07FDD6 (Primary Action Interpreter)');
  log('');
  const callers = findReferences(0x07FDD6);
  if (callers.length === 0) {
    log('No direct CALL/JP references to 0x07FDD6 found in ROM.');
    log('');
    // Try also finding refs to 0x07FDC9 (the bit 7 test entry)
    log('Checking for references to 0x07FDC9 (bit 7 entry point):');
    const callers2 = findReferences(0x07FDC9);
    if (callers2.length === 0) {
      log('  No direct CALL/JP references to 0x07FDC9 found either.');
    } else {
      for (const ref of callers2) {
        log(`  ${hex(ref.pc)}: ${formatInstruction(ref.inst)}`);
      }
    }
  } else {
    for (const ref of callers) {
      log(`  ${hex(ref.pc)}: ${formatInstruction(ref.inst)}`);
    }
  }
  log('');

  // Also check nearby entry points (the function might be entered at different offsets)
  log('## Additional Entry Point Scan');
  log('');
  const entryPoints = [0x07FDC9, 0x07FDCA, 0x07FDCB, 0x07FDCC, 0x07FDCD,
                        0x07FDCE, 0x07FDCF, 0x07FDD0, 0x07FDD1, 0x07FDD2,
                        0x07FDD3, 0x07FDD4, 0x07FDD5, 0x07FDD6, 0x07FDD7,
                        0x07FDD8, 0x07FDD9, 0x07FDDA];
  let anyFound = false;
  for (const ep of entryPoints) {
    const refs = findReferences(ep);
    if (refs.length > 0) {
      log(`  References to ${hex(ep)}: ${refs.length}`);
      for (const ref of refs) {
        log(`    ${hex(ref.pc)}: ${formatInstruction(ref.inst)}`);
      }
      anyFound = true;
    }
  }
  if (!anyFound) {
    log('  No direct CALL/JP references found to any address in 0x07FDC9..0x07FDDA.');
    log('  This function may be reached via indirect JP (HL) or JP (IX) dispatch,');
    log('  or via fallthrough from the preceding code.');
  }
  log('');

  // 10. Check what precedes 0x07FDC9 — fallthrough analysis
  log('## Fallthrough Analysis: Code Preceding 0x07FDC9');
  log('');
  const prefixStart = 0x07FD80;
  const prefixInsts = disassembleRange(prefixStart, INTERPRETER_START);
  log('```');
  for (const inst of prefixInsts) {
    log(`  ${formatRow(inst)}`);
  }
  log('```');
  log('');

  // Check if the preceding instruction is a RET or unconditional JP (function boundary)
  const lastPrefix = prefixInsts.length > 0 ? prefixInsts[prefixInsts.length - 1] : null;
  if (lastPrefix) {
    const lastEnd = lastPrefix.pc + lastPrefix.length;
    if (lastEnd === INTERPRETER_START) {
      if (lastPrefix.tag === 'ret' || (lastPrefix.tag === 'jp' && !lastPrefix.condition)) {
        log(`  ${hex(lastPrefix.pc)} is a ${formatInstruction(lastPrefix)} — hard boundary. 0x07FDC9 starts a new function.`);
      } else {
        log(`  ${hex(lastPrefix.pc)} is ${formatInstruction(lastPrefix)} — falls through into 0x07FDC9.`);
      }
    } else {
      log(`  Last decoded instruction ends at ${hex(lastEnd)}, not at 0x07FDC9.`);
    }
  }
  log('');

  // 11. Scan wider range to find references to this function via LD + JP (HL)
  log('## Wider Context: References to 0x07FDC9..0x07FDDA as Immediate Values');
  log('');
  const targetLo = 0xC9, targetMid = 0xFD, targetHi = 0x07;
  let immRefs = 0;
  for (let pc = 0; pc <= rom.length - 4; pc++) {
    if (rom[pc + 1] === targetLo && rom[pc + 2] === targetMid && rom[pc + 3] === targetHi) {
      const opcode = rom[pc];
      // LD HL, imm24 = 0x21; LD DE, imm24 = 0x11; LD BC, imm24 = 0x01
      if (opcode === 0x21 || opcode === 0x11 || opcode === 0x01) {
        const pair = opcode === 0x21 ? 'HL' : opcode === 0x11 ? 'DE' : 'BC';
        const addr = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
        if (addr >= 0x07FDC9 && addr <= 0x07FDDA) {
          log(`  ${hex(pc)}: LD ${pair}, ${hex(addr)}`);
          immRefs++;
        }
      }
    }
  }
  if (immRefs === 0) {
    log('  No LD pair,imm24 references to 0x07FDC9..0x07FDDA found.');
  }
  log('');

  // 12. Summary
  log('## Summary');
  log('');

  // Summarize the AND mask
  if (andMasks.length > 0) {
    log(`- AND mask: ${andMasks.map(m => `${hexByte(m.value)} at ${hex(m.pc)}`).join(', ')}`);
  }

  // Summarize compare cascade
  log(`- Comparison cascade: ${compares.length} CP instructions found`);
  for (const c of compares) {
    const h = c.handler;
    log(`  - CP ${hexByte(c.value)} (decimal ${c.value}) at ${hex(c.pc)}${h ? ` -> ${h.condition} to ${hex(h.target)}` : ''}`);
  }

  // Summarize bit 7
  if (bit7Info.length > 0) {
    log(`- Bit 7 modifier: ${bit7Info.length} bit 7 operations found`);
  }

  // Summarize handler targets
  log(`- Unique handler targets: ${uniqueTargets.size}`);
  for (const [target] of [...uniqueTargets.entries()].sort((a, b) => a[0] - b[0])) {
    if (target < INTERPRETER_START || target >= INTERPRETER_END) {
      log(`  - ${hex(target)}`);
    }
  }

  // Summarize callers
  log(`- Direct callers of 0x07FDD6: ${callers.length}`);

  log('');
  log('---');
  log('Generated by probe-phase403-action-interpreter.mjs');

  // Write report to file
  const reportContent = output.join('\n');
  fs.writeFileSync(REPORT_PATH, reportContent, 'utf8');
  console.log(`\nReport written to: ${REPORT_PATH}`);
}

main();
