#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = new Uint8Array(fs.readFileSync(ROM_PATH));

const RAM_MBASE = 0xD0;
const WINDOW_BYTES = 40;
const MAX_INSTRUCTIONS = 10;

const HANDLERS = [
  { addr: 0x058241, label: 'HOME_HANDLER' },
  { addr: 0x05CD71, label: 'UNKNOWN_05CD71' },
  { addr: 0x05FFEF, label: 'UNKNOWN_05FFEF' },
  { addr: 0x06B4E8, label: 'UNKNOWN_06B4E8' },
  { addr: 0x080FB7, label: 'UNKNOWN_080FB7' },
  { addr: 0x0810E8, label: 'UNKNOWN_0810E8' },
  { addr: 0x08149F, label: 'UNKNOWN_08149F' },
  { addr: 0x09D22C, label: 'UNKNOWN_09D22C' },
  { addr: 0x09D32D, label: 'UNKNOWN_09D32D' },
  { addr: 0x0AB83D, label: 'UNKNOWN_0AB83D' },
  { addr: 0x0ABA44, label: 'UNKNOWN_0ABA44' },
  { addr: 0x0AC035, label: 'UNKNOWN_0AC035' },
  { addr: 0x0ACCDD, label: 'UNKNOWN_0ACCDD' },
  { addr: 0x0B1D3B, label: 'UNKNOWN_0B1D3B' },
  { addr: 0x0B4DAE, label: 'UNKNOWN_0B4DAE' },
  { addr: 0x0B62D8, label: 'UNKNOWN_0B62D8' },
];

const CALL_LABELS = new Map([
  [0x020F38, 'PutC'],
  [0x0210AC, 'PutS'],
  [0x021A3C, 'ClrLCDFull'],
  [0x099914, 'ParseInp'],
]);

const MEMORY_LABELS = new Map([
  [0xD007CA, 'cxMain'],
  [0xD007E0, 'cxCurApp'],
  [0xD00824, 'mode/state byte'],
  [0xD02661, 'display-state byte'],
]);

const PRIOR_HINTS = new Map([
  [0x058241, {
    identity: 'HOME',
    reason: 'known HOME_HANDLER installed by the context-switch path',
  }],
  [0x09D22C, {
    identity: 'mode/display-state filter',
    reason: 'used as a forced cxMain target in the phase244 mode-subcall probe',
  }],
  [0x09D32D, {
    identity: 'mode/display-state filter',
    reason: 'used as a forced cxMain target in the phase244 mode-subcall probe',
  }],
  [0x0ACCDD, {
    identity: 'HOME/input follow-up',
    reason: 'written into cxMain immediately after a ParseInp path at 0x0ACC86',
  }],
]);

const KEYWORD_IDENTITIES = [
  { pattern: /\bGRAPH\b/i, identity: 'GRAPH' },
  { pattern: /\bTABLE\b/i, identity: 'TABLE' },
  { pattern: /\bMATRIX\b/i, identity: 'MATRIX' },
  { pattern: /\bLIST\b/i, identity: 'LIST' },
  { pattern: /\bSTAT\b/i, identity: 'STAT' },
  { pattern: /\bPRGM\b/i, identity: 'PRGM' },
  { pattern: /\bWINDOW\b/i, identity: 'WINDOW' },
  { pattern: /\bZOOM\b/i, identity: 'ZOOM' },
  { pattern: /\bFORMAT\b/i, identity: 'FORMAT' },
  { pattern: /\bDRAW\b/i, identity: 'DRAW' },
  { pattern: /\bDIST\b/i, identity: 'DIST' },
  { pattern: /\bTEST\b/i, identity: 'TEST' },
  { pattern: /\bCATALOG\b/i, identity: 'CATALOG' },
  { pattern: /\bMATH\b/i, identity: 'MATH' },
  { pattern: /\bMEM\b|\bMEMORY\b/i, identity: 'MEMORY' },
  { pattern: /\bAPPS?\b/i, identity: 'APPS' },
  { pattern: /\bLINK\b/i, identity: 'LINK' },
  { pattern: /\bFINANCE\b/i, identity: 'FINANCE' },
  { pattern: /\bCALC\b/i, identity: 'CALC' },
  { pattern: /\bY=/i, identity: 'Y=' },
];

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function readAsciiString(addr) {
  if (addr < 0 || addr >= rom.length) {
    return null;
  }

  const direct = [];
  for (let i = 0; i < 24 && addr + i < rom.length; i++) {
    const value = rom[addr + i];
    if (value === 0x00) {
      break;
    }
    if (value < 0x20 || value > 0x7E) {
      direct.length = 0;
      break;
    }
    direct.push(String.fromCharCode(value));
  }
  if (direct.length >= 3) {
    return direct.join('');
  }

  const declaredLength = rom[addr];
  if (declaredLength >= 3 && declaredLength <= 24 && addr + 1 + declaredLength <= rom.length) {
    const prefixed = [];
    for (let i = 0; i < declaredLength; i++) {
      const value = rom[addr + 1 + i];
      if (value < 0x20 || value > 0x7E) {
        prefixed.length = 0;
        break;
      }
      prefixed.push(String.fromCharCode(value));
    }
    if (prefixed.length === declaredLength) {
      return prefixed.join('');
    }
  }

  return null;
}

function labelMemoryAddress(addr) {
  if (!Number.isInteger(addr)) {
    return null;
  }
  if (MEMORY_LABELS.has(addr)) {
    return MEMORY_LABELS.get(addr);
  }
  if (addr >= 0xD40000 && addr <= 0xD7FFFF) {
    return 'LCD/VRAM';
  }
  return null;
}

function effectiveMemoryAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((RAM_MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0) & 0xFFFFFF;
  }
  return (inst.addr >>> 0) & 0xFFFFFF;
}

function formatInstruction(inst) {
  if (!inst) {
    return 'db ?';
  }

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'halt': text = 'halt'; break;
    case 'ret': text = 'ret'; break;
    case 'reti': text = 'reti'; break;
    case 'retn': text = 'retn'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'exx': text = 'exx'; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(effectiveMemoryAddress(inst))}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(effectiveMemoryAddress(inst))})`;
      break;
    case 'ld-mem-pair':
      text = `ld (${hex(effectiveMemoryAddress(inst))}), ${inst.pair}`;
      break;
    case 'ld-pair-ind':
      text = `ld ${inst.pair}, (${inst.src})`;
      break;
    case 'ld-ind-pair':
      text = `ld (${inst.dest}), ${inst.pair}`;
      break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(effectiveMemoryAddress(inst))})`; break;
    case 'ld-mem-reg': text = `ld (${hex(effectiveMemoryAddress(inst))}), ${inst.src}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${signedDisp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${hexByte(inst.value)}`; break;
    case 'ld-pair-indexed': text = `ld ${inst.pair}, (${inst.indexRegister}${signedDisp(inst.displacement)})`; break;
    case 'ld-indexed-pair': text = `ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${inst.pair}`; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ixd': text = `${inst.op} (${inst.indexRegister}${signedDisp(inst.displacement)})`; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`; break;
    case 'indexed-cb-rotate': text = `${inst.operation ?? inst.op ?? 'rotate'} (${inst.indexRegister}${signedDisp(inst.displacement)})`; break;
    case 'lea': text = `lea ${inst.dest}, ${inst.base}${signedDisp(inst.displacement)}`; break;
    case 'im': text = `im ${inst.value}`; break;
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
    case 'neg':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'rla':
    case 'rra':
    case 'rlca':
    case 'rrca':
    case 'slp':
    case 'stmix':
    case 'rsmix':
      text = inst.tag;
      break;
    case 'db':
      text = `db ${hexByte(inst.value ?? 0)}`;
      break;
    default: {
      const ignored = new Set([
        'pc',
        'length',
        'nextPc',
        'tag',
        'mode',
        'modePrefix',
        'fallthrough',
        'terminates',
        'direction',
        'nextMode',
      ]);
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (ignored.has(key) || value === undefined || value === null) {
          continue;
        }
        if (typeof value === 'number') {
          if (key === 'addr' || key === 'target' || key === 'value') {
            fields.push(`${key}=${hex(value)}`);
          } else {
            fields.push(`${key}=${value}`);
          }
        } else {
          fields.push(`${key}=${value}`);
        }
      }
      text = fields.length > 0 ? `${inst.tag} ${fields.join(' ')}` : inst.tag;
      break;
    }
  }

  return `${prefix}${text}`;
}

function decodeWindow(addr) {
  const lines = [];
  const end = Math.min(rom.length, addr + WINDOW_BYTES);
  let pc = addr;

  while (pc < end && lines.length < MAX_INSTRUCTIONS) {
    let inst = null;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {}

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      lines.push({
        pc,
        length: 1,
        text: `db ${hexByte(rom[pc] ?? 0)}`,
        inst: null,
      });
      pc += 1;
      continue;
    }

    lines.push({
      pc,
      length: inst.length,
      text: formatInstruction(inst),
      inst,
    });
    pc += inst.length;
  }

  return lines;
}

function annotateLine(line) {
  if (!line.inst) {
    return line.text;
  }

  const notes = [];
  const inst = line.inst;

  if (
    (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'jp' || inst.tag === 'jp-conditional') &&
    CALL_LABELS.has(inst.target)
  ) {
    notes.push(CALL_LABELS.get(inst.target));
  }

  if (inst.tag === 'ld-pair-imm' && Number.isInteger(inst.value)) {
    const stringValue = readAsciiString(inst.value);
    if (stringValue) {
      notes.push(`string "${stringValue}"`);
    }
  }

  const memAddr = effectiveMemoryAddress(inst);
  const memLabel = labelMemoryAddress(memAddr);
  if (memLabel) {
    notes.push(memLabel);
  }

  return notes.length > 0 ? `${line.text}  ; ${notes.join(' | ')}` : line.text;
}

function collectEvidence(handler, lines) {
  const callTargets = new Set();
  const immLoads = [];
  const memoryRefs = new Set();
  const stringRefs = [];
  const compareImmediates = [];

  for (const line of lines) {
    const inst = line.inst;
    if (!inst) {
      continue;
    }

    if (
      inst.tag === 'call' ||
      inst.tag === 'call-conditional' ||
      inst.tag === 'jp' ||
      inst.tag === 'jp-conditional'
    ) {
      if (Number.isInteger(inst.target)) {
        callTargets.add(inst.target >>> 0);
      }
    }

    if (inst.tag === 'ld-pair-imm' && Number.isInteger(inst.value)) {
      immLoads.push(inst.value >>> 0);
      const stringValue = readAsciiString(inst.value >>> 0);
      if (stringValue) {
        stringRefs.push({ addr: inst.value >>> 0, value: stringValue });
      }
    }

    if (inst.tag === 'alu-imm' && inst.op === 'cp' && Number.isInteger(inst.value)) {
      compareImmediates.push(inst.value & 0xFF);
    }

    const memAddr = effectiveMemoryAddress(inst);
    if (Number.isInteger(memAddr)) {
      memoryRefs.add(memAddr >>> 0);
    }
  }

  const lcdCalls = [];
  for (const target of callTargets) {
    if (CALL_LABELS.has(target)) {
      lcdCalls.push(CALL_LABELS.get(target));
    }
  }

  const uniqueStrings = [];
  const seenStrings = new Set();
  for (const ref of stringRefs) {
    const key = `${ref.addr}:${ref.value}`;
    if (!seenStrings.has(key)) {
      seenStrings.add(key);
      uniqueStrings.push(ref);
    }
  }

  return {
    handler,
    callTargets: [...callTargets].sort((a, b) => a - b),
    immLoads,
    memoryRefs: [...memoryRefs].sort((a, b) => a - b),
    stringRefs: uniqueStrings,
    compareImmediates,
    touchesVram: [...memoryRefs].some((addr) => addr >= 0xD40000 && addr <= 0xD7FFFF),
    touchesCxCurApp: memoryRefs.has(0xD007E0),
    touchesModeState: memoryRefs.has(0xD00824),
    touchesDisplayState: memoryRefs.has(0xD02661),
    callsClrLcd: callTargets.has(0x021A3C),
    callsPutS: callTargets.has(0x0210AC),
    callsPutC: callTargets.has(0x020F38),
    callsParseInp: callTargets.has(0x099914),
    lcdCalls,
  };
}

function inferIdentity(evidence) {
  const priorHint = PRIOR_HINTS.get(evidence.handler);
  if (priorHint) {
    return {
      identity: priorHint.identity,
      reason: priorHint.reason,
      confidence: 'high',
    };
  }

  for (const ref of evidence.stringRefs) {
    for (const keyword of KEYWORD_IDENTITIES) {
      if (keyword.pattern.test(ref.value)) {
        return {
          identity: keyword.identity,
          reason: `string ref ${hex(ref.addr)} -> "${ref.value}"`,
          confidence: 'high',
        };
      }
    }
  }

  if (evidence.callsParseInp) {
    return {
      identity: 'input/parser follow-up',
      reason: 'calls ParseInp directly in the handler prologue',
      confidence: 'medium',
    };
  }

  if (evidence.touchesCxCurApp || evidence.touchesModeState || evidence.touchesDisplayState) {
    return {
      identity: 'mode/display-state router',
      reason: 'touches cxCurApp / mode-state bytes near entry',
      confidence: 'medium',
    };
  }

  if (
    evidence.touchesVram ||
    evidence.callsClrLcd ||
    evidence.callsPutS ||
    evidence.callsPutC
  ) {
    return {
      identity: 'screen/menu renderer',
      reason: 'uses LCD/VRAM or text-output helpers near entry',
      confidence: 'medium',
    };
  }

  if (evidence.stringRefs.length > 0) {
    return {
      identity: 'string-driven menu/screen handler',
      reason: `loads string-like ROM data (${evidence.stringRefs.map((ref) => hex(ref.addr)).join(', ')})`,
      confidence: 'low',
    };
  }

  return {
    identity: 'unknown',
    reason: 'no strong string, LCD, or ParseInp pattern in the first 40 bytes',
    confidence: 'low',
  };
}

function printEvidence(evidence) {
  const notes = [];

  if (evidence.lcdCalls.length > 0) {
    notes.push(`known calls: ${evidence.lcdCalls.join(', ')}`);
  }
  if (evidence.callsParseInp && !notes.some((note) => note.includes('ParseInp'))) {
    notes.push('known calls: ParseInp');
  }
  if (evidence.stringRefs.length > 0) {
    notes.push(
      `string refs: ${evidence.stringRefs.map((ref) => `${hex(ref.addr)}="${ref.value}"`).join(', ')}`,
    );
  }
  if (evidence.memoryRefs.length > 0) {
    const namedRefs = evidence.memoryRefs
      .map((addr) => {
        const label = labelMemoryAddress(addr);
        return label ? `${hex(addr)} (${label})` : null;
      })
      .filter(Boolean);
    if (namedRefs.length > 0) {
      notes.push(`RAM refs: ${namedRefs.join(', ')}`);
    }
  }
  if (evidence.compareImmediates.length > 0) {
    notes.push(`cp immediates: ${evidence.compareImmediates.map((value) => hexByte(value)).join(', ')}`);
  }

  return notes;
}

function main() {
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Window: ${WINDOW_BYTES} bytes, decode limit: ${MAX_INSTRUCTIONS} instructions`);
  console.log('');

  for (const handler of HANDLERS) {
    const bytes = rom.subarray(handler.addr, Math.min(rom.length, handler.addr + WINDOW_BYTES));
    const lines = decodeWindow(handler.addr);
    const evidence = collectEvidence(handler.addr, lines);
    const guess = inferIdentity(evidence);
    const notes = printEvidence(evidence);

    console.log(`=== Handler ${hex(handler.addr)} ===`);
    console.log(`Hex: ${bytesToHex(bytes)}`);
    console.log('Disassembly:');
    for (const line of lines) {
      console.log(`  ${hex(line.pc)}: ${annotateLine(line)}`);
    }
    if (notes.length > 0) {
      console.log('Evidence:');
      for (const note of notes) {
        console.log(`  - ${note}`);
      }
    }
    console.log(`Likely identity: ${guess.identity} (${guess.confidence}; ${guess.reason})`);
    console.log('---');
  }
}

main();
