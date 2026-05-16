#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction as importedDecodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const CXMAIN_PTR = 0xD007CA;
const COORMON_ENTRY = 0x08BF22;
const RAM_MBASE = 0xD0;

const HOME_HANDLER_START = 0x058241;
const HOME_HANDLER_END = 0x0582E0;
const HOME_COORMON_CALL = 0x0582B8;

const COORMON_CALLER_WINDOWS = [
  {
    title: 'HOME_HANDLER window 0x058241..0x0582E0',
    start: HOME_HANDLER_START,
    end: HOME_HANDLER_END,
  },
  {
    title: 'CoorMon caller window 0x05CD50..0x05CD70',
    start: 0x05CD50,
    end: 0x05CD70,
  },
  {
    title: 'CoorMon caller window 0x040CA0..0x040CC0',
    start: 0x040CA0,
    end: 0x040CC0,
  },
];

const CONDITIONALS = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'];
const MODE_PREFIXES = new Set(['sis', 'lis', 'sil', 'lil']);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function hexWord(value) {
  return hex(value & 0xFFFF, 4);
}

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function disp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function hasShortPrefix(inst) {
  return inst?.modePrefix === 'sis' || inst?.modePrefix === 'lis';
}

function effectiveMemoryAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (hasShortPrefix(inst)) {
    return (((RAM_MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0) & 0xFFFFFF;
  }
  return (inst.addr >>> 0) & 0xFFFFFF;
}

function formatMemoryAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return 'n/a';
  }
  if (hasShortPrefix(inst)) {
    const raw = inst.addr & 0xFFFF;
    const effective = effectiveMemoryAddress(inst);
    if (effective === raw) {
      return hex(effective);
    }
    return `${hexWord(raw)} => ${hex(effective)}`;
  }
  return hex(inst.addr);
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatInstructionText(inst) {
  if (!inst) {
    return 'db ?';
  }

  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'nop');
    case 'ex-af': return withPrefix(inst, 'ex af, af\'');
    case 'exx': return withPrefix(inst, 'exx');
    case 'ex-de-hl': return withPrefix(inst, 'ex de, hl');
    case 'ex-sp-hl': return withPrefix(inst, 'ex (sp), hl');
    case 'rlca': return withPrefix(inst, 'rlca');
    case 'rrca': return withPrefix(inst, 'rrca');
    case 'rla': return withPrefix(inst, 'rla');
    case 'rra': return withPrefix(inst, 'rra');
    case 'daa': return withPrefix(inst, 'daa');
    case 'cpl': return withPrefix(inst, 'cpl');
    case 'scf': return withPrefix(inst, 'scf');
    case 'ccf': return withPrefix(inst, 'ccf');
    case 'halt': return withPrefix(inst, 'halt');
    case 'di': return withPrefix(inst, 'di');
    case 'ei': return withPrefix(inst, 'ei');
    case 'neg': return withPrefix(inst, 'neg');
    case 'reti': return withPrefix(inst, 'reti');
    case 'retn': return withPrefix(inst, 'retn');
    case 'ret': return withPrefix(inst, 'ret');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'rst': return withPrefix(inst, `rst ${hexByte(inst.target)}`);
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'inc-pair': return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair': return withPrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'inc-ixd': return withPrefix(inst, `inc (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'dec-ixd': return withPrefix(inst, `dec (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'add-pair': return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'adc-pair': return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'sbc-pair': return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'mlt': return withPrefix(inst, `mlt ${inst.reg}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withPrefix(inst, `ld (${formatMemoryAddress(inst)}), ${inst.pair}`)
        : withPrefix(inst, `ld ${inst.pair}, (${formatMemoryAddress(inst)})`);
    case 'ld-mem-pair': return withPrefix(inst, `ld (${formatMemoryAddress(inst)}), ${inst.pair}`);
    case 'ld-pair-indexed': return withPrefix(inst, `ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'ld-indexed-pair': return withPrefix(inst, `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.pair}`);
    case 'ld-pair-ind': return withPrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-ind-pair': return withPrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind': return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg': return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-ind-imm': return withPrefix(inst, `ld (hl), ${hexByte(inst.value)}`);
    case 'ld-reg-mem': return withPrefix(inst, `ld ${inst.dest}, (${formatMemoryAddress(inst)})`);
    case 'ld-mem-reg': return withPrefix(inst, `ld (${formatMemoryAddress(inst)}), ${inst.src}`);
    case 'ld-reg-ixd': return withPrefix(inst, `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'ld-ixd-reg': return withPrefix(inst, `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`);
    case 'ld-ixd-imm': return withPrefix(inst, `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`);
    case 'ld-ixiy-indexed': return withPrefix(inst, `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'ld-indexed-ixiy': return withPrefix(inst, `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`);
    case 'ld-sp-hl': return withPrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair': return withPrefix(inst, `ld sp, ${inst.pair}`);
    case 'ld-special': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-mb-a': return withPrefix(inst, 'ld mb, a');
    case 'ld-a-mb': return withPrefix(inst, 'ld a, mb');
    case 'alu-imm': return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-ixd': return withPrefix(inst, `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'rotate-reg': return withPrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rotate-ind': return withPrefix(inst, `${inst.op} (${inst.indirectRegister})`);
    case 'indexed-cb-rotate':
      return withPrefix(inst, `${inst.operation ?? inst.op ?? 'rotate'} (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'bit-test': return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind': return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res': return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind': return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set': return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind': return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'indexed-cb-bit': return withPrefix(inst, `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'indexed-cb-res': return withPrefix(inst, `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'indexed-cb-set': return withPrefix(inst, `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`);
    case 'im': return withPrefix(inst, `im ${inst.value}`);
    case 'out-imm': return withPrefix(inst, `out (${hexByte(inst.port)}), a`);
    case 'in-imm': return withPrefix(inst, `in a, (${hexByte(inst.port)})`);
    case 'out-reg': return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'in-reg': return withPrefix(inst, `in ${inst.reg}, (c)`);
    case 'out0': return withPrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);
    case 'in0': return withPrefix(inst, `in0 ${inst.reg}, (${hexByte(inst.port)})`);
    case 'tst-reg': return withPrefix(inst, `tst a, ${inst.reg}`);
    case 'tst-ind': return withPrefix(inst, 'tst a, (hl)');
    case 'tst-imm': return withPrefix(inst, `tst a, ${hexByte(inst.value)}`);
    case 'tstio': return withPrefix(inst, `tstio ${hexByte(inst.value)}`);
    case 'lea': return withPrefix(inst, `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`);
    case 'pea': return withPrefix(inst, `pea (${inst.base}${disp(inst.displacement)})`);
    case 'ldi': return withPrefix(inst, 'ldi');
    case 'ldd': return withPrefix(inst, 'ldd');
    case 'ldir': return withPrefix(inst, 'ldir');
    case 'lddr': return withPrefix(inst, 'lddr');
    case 'cpi': return withPrefix(inst, 'cpi');
    case 'cpd': return withPrefix(inst, 'cpd');
    case 'cpir': return withPrefix(inst, 'cpir');
    case 'cpdr': return withPrefix(inst, 'cpdr');
    case 'ini': return withPrefix(inst, 'ini');
    case 'ind': return withPrefix(inst, 'ind');
    case 'inir': return withPrefix(inst, 'inir');
    case 'indr': return withPrefix(inst, 'indr');
    case 'outi': return withPrefix(inst, 'outi');
    case 'outd': return withPrefix(inst, 'outd');
    case 'otir': return withPrefix(inst, 'otir');
    case 'otdr': return withPrefix(inst, 'otdr');
    case 'otimr': return withPrefix(inst, 'otimr');
    case 'slp': return withPrefix(inst, 'slp');
    case 'stmix': return withPrefix(inst, 'stmix');
    case 'rsmix': return withPrefix(inst, 'rsmix');
    case 'db': return withPrefix(inst, `db ${hexByte(inst.value ?? 0)}`);
    default: return withPrefix(inst, inst.tag ?? 'unknown');
  }
}

function splitInstructionText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return { mnemonic: '<unknown>', operands: '' };
  }

  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) {
    return { mnemonic: trimmed, operands: '' };
  }

  const firstToken = trimmed.slice(0, firstSpace);
  if (MODE_PREFIXES.has(firstToken)) {
    const rest = trimmed.slice(firstSpace + 1);
    const secondSpace = rest.indexOf(' ');
    if (secondSpace === -1) {
      return { mnemonic: trimmed, operands: '' };
    }
    return {
      mnemonic: `${firstToken} ${rest.slice(0, secondSpace)}`,
      operands: rest.slice(secondSpace + 1).trim(),
    };
  }

  return {
    mnemonic: firstToken,
    operands: trimmed.slice(firstSpace + 1).trim(),
  };
}

function manualDecodeInstruction(rom, pc) {
  const op = rom[pc] ?? 0;
  const conditionalIndex = (op >> 3) & 0x07;

  if ((op & 0xC7) === 0xC4) {
    return {
      pc,
      length: 4,
      tag: 'call-conditional',
      condition: CONDITIONALS[conditionalIndex],
      target: read24(rom, pc + 1),
    };
  }
  if (op === 0xCD) {
    return { pc, length: 4, tag: 'call', target: read24(rom, pc + 1) };
  }
  if ((op & 0xC7) === 0xC2) {
    return {
      pc,
      length: 4,
      tag: 'jp-conditional',
      condition: CONDITIONALS[conditionalIndex],
      target: read24(rom, pc + 1),
    };
  }
  if (op === 0xC3) {
    return { pc, length: 4, tag: 'jp', target: read24(rom, pc + 1) };
  }
  if ((op & 0xE7) === 0x20) {
    return {
      pc,
      length: 2,
      tag: 'jr-conditional',
      condition: CONDITIONALS[(op >> 3) & 0x03],
      target: (pc + 2 + signed8(rom[pc + 1] ?? 0)) & 0xFFFFFF,
    };
  }
  if (op === 0x18) {
    return {
      pc,
      length: 2,
      tag: 'jr',
      target: (pc + 2 + signed8(rom[pc + 1] ?? 0)) & 0xFFFFFF,
    };
  }
  if (op === 0x10) {
    return {
      pc,
      length: 2,
      tag: 'djnz',
      target: (pc + 2 + signed8(rom[pc + 1] ?? 0)) & 0xFFFFFF,
    };
  }
  if ((op & 0xC7) === 0xC0) {
    return {
      pc,
      length: 1,
      tag: 'ret-conditional',
      condition: CONDITIONALS[conditionalIndex],
    };
  }
  if (op === 0xC9) {
    return { pc, length: 1, tag: 'ret' };
  }
  if (op === 0x32) {
    return {
      pc,
      length: 4,
      tag: 'ld-mem-reg',
      addr: read24(rom, pc + 1),
      src: 'a',
    };
  }
  if (op === 0x3A) {
    return {
      pc,
      length: 4,
      tag: 'ld-reg-mem',
      addr: read24(rom, pc + 1),
      dest: 'a',
    };
  }
  if (op === 0x22) {
    return {
      pc,
      length: 4,
      tag: 'ld-pair-mem',
      pair: 'hl',
      addr: read24(rom, pc + 1),
      direction: 'to-mem',
    };
  }
  if (op === 0x2A) {
    return {
      pc,
      length: 4,
      tag: 'ld-pair-mem',
      pair: 'hl',
      addr: read24(rom, pc + 1),
      direction: 'from-mem',
    };
  }
  if (op === 0x21) {
    return {
      pc,
      length: 4,
      tag: 'ld-pair-imm',
      pair: 'hl',
      value: read24(rom, pc + 1),
    };
  }
  if (op === 0x01) {
    return {
      pc,
      length: 4,
      tag: 'ld-pair-imm',
      pair: 'bc',
      value: read24(rom, pc + 1),
    };
  }
  if (op === 0x11) {
    return {
      pc,
      length: 4,
      tag: 'ld-pair-imm',
      pair: 'de',
      value: read24(rom, pc + 1),
    };
  }
  if (op === 0x31) {
    return {
      pc,
      length: 4,
      tag: 'ld-pair-imm',
      pair: 'sp',
      value: read24(rom, pc + 1),
    };
  }
  if ((op & 0xC7) === 0x06) {
    const registerTable = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
    const dest = registerTable[(op >> 3) & 0x07];
    if (dest === '(hl)') {
      return { pc, length: 2, tag: 'ld-ind-imm', value: rom[pc + 1] ?? 0 };
    }
    return { pc, length: 2, tag: 'ld-reg-imm', dest, value: rom[pc + 1] ?? 0 };
  }

  return { pc, length: 1, tag: 'db', value: op };
}

function decodeAt(rom, pc) {
  if (typeof importedDecodeInstruction === 'function') {
    try {
      const inst = importedDecodeInstruction(rom, pc, 'adl');
      if (inst && Number.isInteger(inst.length) && inst.length > 0) {
        return inst;
      }
    } catch {
      try {
        const inst = importedDecodeInstruction(rom, pc, true);
        if (inst && Number.isInteger(inst.length) && inst.length > 0) {
          return inst;
        }
      } catch {
        // Fall through to manual decode.
      }
    }
  }
  return manualDecodeInstruction(rom, pc);
}

function instructionBytes(rom, pc, length) {
  return Array.from(
    rom.subarray(pc, Math.min(rom.length, pc + Math.max(1, length))),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function referencesCxMain(inst) {
  const effectiveAddr = effectiveMemoryAddress(inst);
  if (effectiveAddr === CXMAIN_PTR) {
    return true;
  }
  if (inst?.tag === 'ld-pair-imm' && ((inst.value ?? -1) & 0xFFFFFF) === CXMAIN_PTR) {
    return true;
  }
  return false;
}

function buildAnnotations(row) {
  const notes = [];
  const inst = row.inst;

  if (!inst) {
    return notes;
  }

  if (inst.tag === 'call') {
    notes.push(`CALL target=${hex(inst.target)}`);
  } else if (inst.tag === 'call-conditional') {
    notes.push(`CALL ${String(inst.condition).toUpperCase()} target=${hex(inst.target)}`);
  }

  if (inst.tag === 'jp') {
    notes.push(`JP target=${hex(inst.target)}`);
  } else if (inst.tag === 'jp-conditional') {
    notes.push(`JP ${String(inst.condition).toUpperCase()} target=${hex(inst.target)}`);
  } else if (inst.tag === 'jr') {
    notes.push(`JR target=${hex(inst.target)}`);
  } else if (inst.tag === 'jr-conditional') {
    notes.push(`JR ${String(inst.condition).toUpperCase()} target=${hex(inst.target)}`);
  } else if (inst.tag === 'djnz') {
    notes.push(`DJNZ target=${hex(inst.target)}`);
  }

  if (inst.tag === 'ret') {
    notes.push('RET');
  } else if (inst.tag === 'ret-conditional') {
    notes.push(`RET ${String(inst.condition).toUpperCase()}`);
  }

  if (referencesCxMain(inst)) {
    notes.push(`cxMain ref ${hex(CXMAIN_PTR)}`);
  }

  if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target === COORMON_ENTRY) {
    notes.push('CoorMon');
    if (row.pc === HOME_COORMON_CALL) {
      notes.push('HOME_HANDLER CoorMon call');
    }
  }

  return notes;
}

function disassembleRange(rom, start, end) {
  const rows = [];
  let pc = start >>> 0;

  while (pc <= (end >>> 0) && pc < rom.length) {
    let inst;
    try {
      inst = decodeAt(rom, pc);
    } catch (error) {
      inst = {
        pc,
        length: 1,
        tag: 'db',
        value: rom[pc] ?? 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const length = Math.max(1, inst?.length ?? 1);
    const text = formatInstructionText(inst);
    const parts = splitInstructionText(text);
    const row = {
      pc,
      inst,
      length,
      bytes: instructionBytes(rom, pc, length),
      mnemonic: parts.mnemonic,
      operands: parts.operands,
    };
    row.annotations = buildAnnotations(row);
    rows.push(row);
    pc = (pc + length) >>> 0;
  }

  return rows;
}

function printRange(title, rows) {
  console.log(`\n== ${title} ==`);
  for (const row of rows) {
    const operandPart = row.operands ? `  ${row.operands}` : '';
    const annotationPart = row.annotations.length ? `  [${row.annotations.join('; ')}]` : '';
    console.log(
      `${hex(row.pc)}: ${row.bytes.padEnd(20)}  ${row.mnemonic.padEnd(10)}${operandPart}${annotationPart}`,
    );
  }
}

function findHomeLoopSummary(rows) {
  const coorMonCallRows = rows.filter(
    (row) =>
      (row.inst?.tag === 'call' || row.inst?.tag === 'call-conditional') &&
      row.inst?.target === COORMON_ENTRY,
  );

  const exactLoopEdges = [];
  const backwardBranches = [];

  for (const row of rows) {
    const tag = row.inst?.tag;
    if (tag !== 'jr' && tag !== 'jr-conditional' && tag !== 'jp' && tag !== 'jp-conditional' && tag !== 'djnz') {
      continue;
    }
    const target = row.inst?.target;
    if (!Number.isInteger(target)) {
      continue;
    }
    if (target < row.pc) {
      backwardBranches.push(`${hex(row.pc)} -> ${hex(target)}`);
    }
    for (const callRow of coorMonCallRows) {
      if (target === callRow.pc) {
        exactLoopEdges.push(`${hex(row.pc)} -> ${hex(target)}`);
      }
    }
  }

  if (coorMonCallRows.length === 0) {
    return 'Does HOME_HANDLER contain a CoorMon loop? No CoorMon call was decoded in 0x058241..0x0582E0.';
  }

  if (exactLoopEdges.length > 0) {
    return `Does HOME_HANDLER contain a CoorMon loop? Yes, there is at least one direct JR/JP-style back-edge to the CoorMon call: ${exactLoopEdges.join(', ')}.`;
  }

  if (backwardBranches.length > 0) {
    return `Does HOME_HANDLER contain a CoorMon loop? No direct JR/JP back-edge to ${hex(HOME_COORMON_CALL)} was found in 0x058241..0x0582E0. Backward branches in the window: ${backwardBranches.join(', ')}.`;
  }

  return `Does HOME_HANDLER contain a CoorMon loop? No obvious static loop in 0x058241..0x0582E0: ${hex(HOME_COORMON_CALL)} calls ${hex(COORMON_ENTRY)}, but no JR/JP-style backward branch appears in the scanned window.`;
}

function main() {
  const rom = new Uint8Array(fs.readFileSync(ROM_PATH));

  console.log(`ROM: ${ROM_PATH}`);
  console.log(`CoorMon entry: ${hex(COORMON_ENTRY)}`);
  console.log(`cxMain pointer: ${hex(CXMAIN_PTR)}`);

  const homeRows = disassembleRange(rom, HOME_HANDLER_START, HOME_HANDLER_END);
  printRange(COORMON_CALLER_WINDOWS[0].title, homeRows);

  for (const window of COORMON_CALLER_WINDOWS.slice(1)) {
    printRange(window.title, disassembleRange(rom, window.start, window.end));
  }

  console.log(`\nSummary: ${findHomeLoopSummary(homeRows)}`);
}

main();
