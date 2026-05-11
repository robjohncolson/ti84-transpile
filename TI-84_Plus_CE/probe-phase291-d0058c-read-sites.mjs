#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const rom = fs.readFileSync(ROM_PATH);

const D0058C = 0xD0058C;

const READ_SITES = [
  0x0258DA, 0x02659C, 0x0269DB, 0x02FE73,
  0x03033C,
  0x06C83F,
  0x074D65,
  0x080E76, 0x0859AA, 0x088657, 0x08B13F,
  0x08C34F, 0x08C384, 0x08C39C, 0x08C4E9,
  0x0A584C,
  0x0B3733, 0x0B630D, 0x0B6ADB,
];

// Number of instructions to decode before and after each read site
const CONTEXT_BEFORE = 10;
const CONTEXT_AFTER = 20;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), (value) => hexByte(value)).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function safeDecode(pc) {
  if (pc < 0 || pc >= rom.length) {
    return null;
  }
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length || inst.length <= 0) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) {
    return 'DB ?';
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'rotate-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indirectRegister).toUpperCase()})`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg).toUpperCase()}`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'daa':
      return `${prefix}DAA`;
    case 'neg':
      return `${prefix}NEG`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target)}`;
    case 'out-imm':
      return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-imm':
      return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'cpi':
      return `${prefix}CPI`;
    case 'cpd':
      return `${prefix}CPD`;
    case 'ex-sp-hl':
      return `${prefix}EX (SP), HL`;
    case 'ex-sp-ix':
      return `${prefix}EX (SP), IX`;
    case 'ex-sp-iy':
      return `${prefix}EX (SP), IY`;
    case 'set-bit':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'res-bit':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates']);
      const extra = Object.entries(inst)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      return `${prefix}${String(inst.tag).toUpperCase()}${extra ? ` ${extra}` : ''}`;
    }
  }
}

// Walk backwards from a target PC to find approximately N instructions before it.
// Since eZ80 has variable-length instructions, we start well before and decode forward.
function findInstructionsBefore(targetPc, count) {
  // Start scanning from ~80 bytes before (most eZ80 instructions are 1-5 bytes)
  const scanStart = Math.max(0, targetPc - 80);
  const instructions = [];
  let pc = scanStart;

  while (pc < targetPc) {
    const inst = safeDecode(pc);
    if (!inst) {
      pc += 1;
      continue;
    }
    instructions.push({ pc, inst });
    pc += inst.length;
  }

  // Return last `count` instructions before targetPc
  return instructions.slice(-count);
}

// Decode N instructions starting from a given PC
function decodeInstructionsFrom(startPc, count) {
  const instructions = [];
  let pc = startPc;

  for (let i = 0; i < count && pc < rom.length; i++) {
    const inst = safeDecode(pc);
    if (!inst) {
      instructions.push({ pc, inst: null, length: 1 });
      pc += 1;
      continue;
    }
    instructions.push({ pc, inst, length: inst.length });
    pc += inst.length;
  }

  return instructions;
}

// Check if an instruction reads D0058C
function isD0058CRead(inst) {
  if (!inst) return false;
  if (inst.tag === 'ld-reg-mem' && inst.addr === D0058C) return true;
  return false;
}

// Classify the read site based on what follows the LD A,(D0058C)
function classifySite(afterInstructions) {
  const evidence = [];
  let classification = 'UNKNOWN';

  // Track what happens to A after the load
  let aOverwritten = false;

  for (const entry of afterInstructions) {
    const inst = entry.inst;
    if (!inst) continue;

    // If A has been overwritten already, stop analyzing
    if (aOverwritten) break;

    // CP immediate - comparing scan code against a value
    if (inst.tag === 'alu-imm' && inst.op === 'cp') {
      evidence.push(`${hex(entry.pc)}: CP ${hexByte(inst.value)} - compares scan code against ${hexByte(inst.value)}`);
      classification = 'KEY_DISPATCH';
    }

    // CP register - comparing scan code against a register value
    if (inst.tag === 'alu-reg' && inst.op === 'cp') {
      evidence.push(`${hex(entry.pc)}: CP ${String(inst.src).toUpperCase()} - compares scan code against register`);
      classification = 'KEY_DISPATCH';
    }

    // OR A / AND A - testing if zero/nonzero
    if (inst.tag === 'alu-reg' && (inst.op === 'or' || inst.op === 'and') && inst.src === 'a') {
      evidence.push(`${hex(entry.pc)}: ${String(inst.op).toUpperCase()} A - tests zero/nonzero`);
      if (classification === 'UNKNOWN') {
        classification = 'KEY_TEST';
      }
    }

    // Store A to another memory address - copying the scan code
    if (inst.tag === 'ld-mem-reg' && inst.src === 'a' && inst.addr !== D0058C) {
      evidence.push(`${hex(entry.pc)}: LD (${hex(inst.addr)}), A - copies scan code to ${hex(inst.addr)}`);
      if (classification === 'UNKNOWN') {
        classification = 'KEY_COPY';
      }
    }

    // Store A via indirect - copying
    if (inst.tag === 'ld-ind-reg' && inst.src === 'a') {
      evidence.push(`${hex(entry.pc)}: LD (${String(inst.dest).toUpperCase()}), A - copies scan code via indirect`);
      if (classification === 'UNKNOWN') {
        classification = 'KEY_COPY';
      }
    }

    // Store A to indexed - copying
    if (inst.tag === 'ld-ixd-reg' && inst.src === 'a') {
      evidence.push(`${hex(entry.pc)}: LD ${formatIndexed(inst.indexRegister, inst.displacement)}, A - copies scan code via indexed`);
      if (classification === 'UNKNOWN') {
        classification = 'KEY_COPY';
      }
    }

    // CALL - forwarding the scan code (A is implicitly passed)
    if (inst.tag === 'call') {
      evidence.push(`${hex(entry.pc)}: CALL ${hex(inst.target)} - forwards scan code`);
      if (classification === 'UNKNOWN') {
        classification = 'KEY_FORWARD';
      }
    }

    // CALL conditional - conditional forward
    if (inst.tag === 'call-conditional') {
      evidence.push(`${hex(entry.pc)}: CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)} - conditionally forwards scan code`);
      if (classification === 'UNKNOWN') {
        classification = 'KEY_FORWARD';
      }
    }

    // SUB immediate - could be building a jump index
    if (inst.tag === 'alu-imm' && inst.op === 'sub') {
      evidence.push(`${hex(entry.pc)}: SUB ${hexByte(inst.value)} - adjusts scan code (table index?)`);
      if (classification === 'UNKNOWN') {
        classification = 'KEY_DISPATCH';
      }
    }

    // JP (HL) or JP (IX) - indirect jump, likely dispatch table
    if (inst.tag === 'jp-indirect') {
      evidence.push(`${hex(entry.pc)}: JP (${String(inst.indirectRegister).toUpperCase()}) - indirect dispatch`);
      if (classification !== 'KEY_DISPATCH') {
        classification = 'KEY_DISPATCH';
      }
    }

    // Conditional branches right after - dispatch behavior
    if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional') {
      const target = inst.target;
      evidence.push(`${hex(entry.pc)}: ${formatInstruction(inst)} - conditional branch`);
    }

    // RET - if we see RET right after load + test, it's a test pattern
    if (inst.tag === 'ret') {
      evidence.push(`${hex(entry.pc)}: RET`);
      break;
    }
    if (inst.tag === 'ret-conditional') {
      evidence.push(`${hex(entry.pc)}: RET ${String(inst.condition).toUpperCase()} - conditional return based on scan code`);
    }

    // Check if A gets overwritten by a new load
    if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') {
      aOverwritten = true;
    }
    if (inst.tag === 'ld-reg-mem' && inst.dest === 'a' && inst.addr !== D0058C) {
      aOverwritten = true;
    }
    if (inst.tag === 'ld-reg-reg' && inst.dest === 'a') {
      aOverwritten = true;
    }
    if (inst.tag === 'ld-reg-ind' && inst.dest === 'a') {
      aOverwritten = true;
    }
    if (inst.tag === 'ld-reg-ixd' && inst.dest === 'a') {
      aOverwritten = true;
    }
    if (inst.tag === 'pop' && inst.pair === 'af') {
      aOverwritten = true;
    }
  }

  return { classification, evidence };
}

function analyzeSite(readPc) {
  // Get the read instruction itself
  const readInst = safeDecode(readPc);
  if (!readInst) {
    return {
      pc: readPc,
      classification: 'UNKNOWN',
      evidence: ['Failed to decode instruction at read site'],
      before: [],
      after: [],
    };
  }

  // Decode context before
  const before = findInstructionsBefore(readPc, CONTEXT_BEFORE);

  // Decode context after (starting after the read instruction)
  const afterPc = readPc + readInst.length;
  const after = decodeInstructionsFrom(afterPc, CONTEXT_AFTER);

  // Classify
  const { classification, evidence } = classifySite(after);

  return {
    pc: readPc,
    readInst,
    classification,
    evidence,
    before,
    after,
  };
}

function printSiteAnalysis(site, index) {
  const separator = '─'.repeat(70);
  console.log(separator);
  console.log(`[${index + 1}/${READ_SITES.length}] Read site: ${hex(site.pc)}  Classification: ${site.classification}`);
  console.log(separator);

  // Print context before
  console.log('  --- context before ---');
  for (const entry of site.before) {
    const asm = formatInstruction(entry.inst);
    console.log(`  ${hex(entry.pc)}: ${asm}`);
  }

  // Print the read instruction itself
  const readAsm = formatInstruction(site.readInst);
  console.log(`  ${hex(site.pc)}: ${readAsm}  <<< LD A,(D0058C)`);

  // Print context after
  console.log('  --- context after ---');
  for (const entry of site.after) {
    const asm = entry.inst ? formatInstruction(entry.inst) : `DB ${hexByte(rom[entry.pc])}`;
    console.log(`  ${hex(entry.pc)}: ${asm}`);
  }

  // Print evidence
  console.log('');
  console.log('  Evidence:');
  if (site.evidence.length === 0) {
    console.log('    (none found in window)');
  } else {
    for (const ev of site.evidence) {
      console.log(`    ${ev}`);
    }
  }
  console.log('');
}

function printSummary(sites) {
  console.log('');
  console.log('='.repeat(70));
  console.log('SUMMARY: D0058C Read Site Classifications');
  console.log('='.repeat(70));

  const byClass = {};
  for (const site of sites) {
    if (!byClass[site.classification]) {
      byClass[site.classification] = [];
    }
    byClass[site.classification].push(site.pc);
  }

  const classOrder = ['KEY_DISPATCH', 'KEY_FORWARD', 'KEY_COPY', 'KEY_TEST', 'UNKNOWN'];
  for (const cls of classOrder) {
    if (!byClass[cls]) continue;
    console.log(`\n  ${cls} (${byClass[cls].length}):`);
    for (const pc of byClass[cls]) {
      console.log(`    ${hex(pc)}`);
    }
  }

  console.log('\n  Totals:');
  for (const cls of classOrder) {
    if (!byClass[cls]) continue;
    console.log(`    ${cls}: ${byClass[cls].length}`);
  }
  console.log(`    TOTAL: ${sites.length}`);
  console.log('');
}

function main() {
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Analyzing ${READ_SITES.length} D0058C read sites (LD A,(0xD0058C) = 3A 8C 05 D0)`);
  console.log('');

  const sites = READ_SITES.map((pc) => analyzeSite(pc));

  for (let i = 0; i < sites.length; i++) {
    printSiteAnalysis(sites[i], i);
  }

  printSummary(sites);
}

main();
