#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const LOOP_START = 0x082745;
const LOOP_END = 0x0827ca;
const HELPER_START = 0x04c876;
const HELPER_END = 0x04c894;

const USERMEM_ADDR = 0xd1a881;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const SCRAP_ADDR = 0xd02ad7;
const MEM_INIT_EMPTY_VAT = 0xd3ffff;

const romBytes = fs.readFileSync(ROM_PATH);
const incText = fs.readFileSync(INC_PATH, 'utf8');

const decoderModule = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);
const decoder = typeof decoderModule.createDecoder === 'function'
  ? decoderModule.createDecoder(romBytes)
  : {
      decode(address) {
        return decoderModule.decodeInstruction(romBytes, address, 'adl');
      },
    };

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function disp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function parseIncSymbols(text) {
  const map = new Map();

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(\?[A-Za-z0-9_+]+)\s*:=\s*0([0-9A-Fa-f]+)h/);
    if (!match) continue;
    const [, name, rawHex] = match;
    const address = parseInt(rawHex, 16) >>> 0;
    if (!map.has(address)) map.set(address, []);
    map.get(address).push(name);
  }

  return map;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}nop`;
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'ex-af': return `${prefix}ex af, af'`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`
        : `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hexByte(inst.value)}`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'alu-imm': return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ixd': return `${prefix}${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'bit-test': return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (hl)`;
    case 'bit-res': return `${prefix}res ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `${prefix}set ${inst.bit}, ${inst.reg}`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'djnz': return `${prefix}djnz ${hex(inst.target)}`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'ccf': return `${prefix}ccf`;
    case 'cpl': return `${prefix}cpl`;
    case 'scf': return `${prefix}scf`;
    case 'neg': return `${prefix}neg`;
    case 'rst': return `${prefix}rst ${hex(inst.target, 2)}`;
    case 'rlca': return `${prefix}rlca`;
    case 'rrca': return `${prefix}rrca`;
    case 'rla': return `${prefix}rla`;
    case 'rra': return `${prefix}rra`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'ldi': return `${prefix}ldi`;
    case 'ldd': return `${prefix}ldd`;
    case 'cpir': return `${prefix}cpir`;
    case 'cpdr': return `${prefix}cpdr`;
    case 'cpi': return `${prefix}cpi`;
    case 'cpd': return `${prefix}cpd`;
    case 'ld-sp-hl': return `${prefix}ld sp, hl`;
    case 'jp-hl': return `${prefix}jp (hl)`;
    case 'jp-ix': return `${prefix}jp (${inst.indexRegister || 'ix'})`;
    case 'im': return `${prefix}im ${inst.mode}`;
    case 'retn': return `${prefix}retn`;
    case 'reti': return `${prefix}reti`;
    case 'ld-special': return `${prefix}ld-special`;
    default: return `${prefix}${inst.tag}`;
  }
}

function disasmRangeInclusive(start, endInclusive) {
  const rows = [];
  let pc = start;

  while (pc <= endInclusive) {
    const inst = decoder.decode(pc);
    if (!inst || !inst.length) {
      throw new Error(`Decode failed at ${hex(pc)}`);
    }

    const bytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes,
      text: formatInstruction(inst),
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

function collectAbsoluteAddresses(rows) {
  const addresses = new Set();

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    if ('addr' in inst && typeof inst.addr === 'number') addresses.add(inst.addr >>> 0);
  }

  return [...addresses].sort((left, right) => left - right);
}

function symbolNames(symbolMap, address) {
  const direct = symbolMap.get(address) ?? [];
  if (direct.length) return direct;
  if (address === SCRAP_ADDR + 1) return ['?scrapMem+1'];
  if (address === SCRAP_ADDR + 2) return ['?scrapMem+2'];
  return [];
}

function printRows(title, rows) {
  console.log(title);
  for (const row of rows) {
    console.log(`${hex(row.pc)}: ${row.bytes.padEnd(15)} ${row.text}`);
  }
  console.log('');
}

const symbols = parseIncSymbols(incText);
const loopRows = disasmRangeInclusive(LOOP_START, LOOP_END);
const helperRows = disasmRangeInclusive(HELPER_START, HELPER_END);
const referencedAddresses = new Set([
  ...collectAbsoluteAddresses(loopRows),
  ...collectAbsoluteAddresses(helperRows),
  USERMEM_ADDR,
  OPBASE_ADDR,
  OPS_ADDR,
  PTEMP_ADDR,
  PROGPTR_ADDR,
]);

console.log('Phase 25AQ: VAT walker loop disassembly');
console.log('');

printRows(`VAT walker 0x${LOOP_START.toString(16)}..0x${LOOP_END.toString(16)}`, loopRows);
printRows(`Helper 0x${HELPER_START.toString(16)}..0x${HELPER_END.toString(16)}`, helperRows);

console.log('Cross-references from ti84pceg.inc');
for (const address of [...referencedAddresses].sort((left, right) => left - right)) {
  const names = symbolNames(symbols, address);
  console.log(`- ${hex(address)} -> ${names.length ? names.join(', ') : '(no ti84pceg.inc symbol)'}`);
}
console.log('');

console.log('Summary');
console.log(`- Loop backedge: ${hex(0x08279a)} jp ${hex(0x082745)}`);
console.log(`- Loop exit branch: ${hex(0x082798)} ret c`);
console.log(`- Exit predicate: after subtracting the current entry span from HL, the walker loads BC from ${hex(OPBASE_ADDR)} (?OPBase) and returns when the subtraction borrows, i.e. when HL < ?OPBase.`);
console.log(`- Compared RAM: current walker cursor in HL versus ?OPBase at ${hex(OPBASE_ADDR)}.`);
console.log('- Termination class: pointer lower bound, not a sentinel byte and not a counter.');
console.log(`- Helper ${hex(HELPER_START)} is not the terminating compare. It packs A:BC into a 24-bit BC value via ?scrapMem at ${hex(SCRAP_ADDR)}.`);
console.log('');

console.log('Suggested seeds');
console.log(`- Minimal immediate exit: ?OPBase = ?OPS = ?pTemp = ?progPtr = ${hex(MEM_INIT_EMPTY_VAT)}.`);
console.log(`- MEM_INIT-coherent family: ?tempMem = ?FPSbase = ?FPS = ?newDataPtr = ?userMem = ${hex(USERMEM_ADDR)}; ?OPBase = ?OPS = ?pTemp = ?progPtr = ${hex(MEM_INIT_EMPTY_VAT)}.`);
console.log('- If you want a real VAT walk instead of an immediate stop, the bytes near 0xD3FFFF still need to decode as valid VAT entries so HL keeps moving downward until it crosses ?OPBase.');
