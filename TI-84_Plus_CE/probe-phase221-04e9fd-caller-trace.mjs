#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const transpiled = await import('./ROM.transpiled.js');
const BLOCKS = normalizeBlocks(
  transpiled.PRELIFTED_BLOCKS ??
  transpiled.default?.PRELIFTED_BLOCKS ??
  transpiled.default ??
  transpiled,
);
const rom = readFileSync(ROM_PATH);

void BLOCKS;
void createExecutor;
void createPeripheralBus;

const ROM_SCAN_LIMIT = Math.min(rom.length, 0x400000);
const BACKWARD_SCAN_START = 0x04E9DF;
const KNOWN_BLOCK_START = 0x04E9E0;
const CALL_WITHIN_BLOCK = 0x04E9FD;
const BLOCK_WINDOW_END = 0x04EA20;
const CALL_CONTEXT_BEFORE = 32;
const CALL_CONTEXT_AFTER = 16;

const TRANSFER_OPCODES = new Map([
  [0xCD, 'CALL'],
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
]);

function normalizeBlocks(raw) {
  return Array.isArray(raw)
    ? Object.fromEntries(raw.filter((block) => block?.id).map((block) => [block.id, block]))
    : (raw ?? {});
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function decodeSafe(pc) {
  try {
    // The current local decoder expects the string mode name for ADL.
    return decodeInstruction(rom, pc & 0xFFFFFF, 'adl');
  } catch (error) {
    return {
      pc: pc & 0xFFFFFF,
      length: 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
    };
  }
}

function resolveAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((0xD0 & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstructionText(inst) {
  if (!inst) return '(decode error)';
  if (typeof inst.mnemonic === 'string') {
    return `${inst.mnemonic}${inst.operands ? ` ${inst.operands}` : ''}`.trim();
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  const d = (value) => (value >= 0 ? `+${value}` : `${value}`);

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
      return `${prefix}JP (${String(inst.indirectRegister ?? inst.reg ?? 'HL').toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(resolveAddr(inst))})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(resolveAddr(inst))}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(resolveAddr(inst))})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(resolveAddr(inst))}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (HL)`;
    case 'alu-ixd':
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (HL)`;
    case 'bit-set-ind':
      return `${prefix}SET ${inst.bit}, (HL)`;
    case 'bit-res-ind':
      return `${prefix}RES ${inst.bit}, (HL)`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'rotate-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (HL)`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${String(inst.base ?? inst.src).toUpperCase()}${d(inst.displacement)}`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'neg':
      return `${prefix}NEG`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'daa':
      return `${prefix}DAA`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
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
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'slp':
      return `${prefix}SLP`;
    case 'im':
      return `${prefix}IM ${inst.value ?? inst.mode}`;
    case 'tst-imm':
      return `${prefix}TST A, ${hexByte(inst.value)}`;
    default: {
      const extras = [];
      if (typeof inst.condition === 'string') extras.push(inst.condition.toUpperCase());
      if (Number.isInteger(inst.target)) extras.push(hex(inst.target));
      if (Number.isInteger(inst.addr)) extras.push(`(${hex(resolveAddr(inst))})`);
      if (typeof inst.reg === 'string') extras.push(String(inst.reg).toUpperCase());
      if (typeof inst.pair === 'string') extras.push(String(inst.pair).toUpperCase());
      return `${prefix}[${inst.tag}${extras.length ? ` ${extras.join(', ')}` : ''}]`;
    }
  }
}

function formatDisassemblyRow(inst) {
  const size = Math.max(1, inst?.length ?? inst?.size ?? 1);
  const bytes = bytesAt(rom, inst.pc ?? 0, size);
  return `${hex(inst.pc)}: ${bytes.padEnd(15)} ${formatInstructionText(inst)}`;
}

function isHardBoundary(tag) {
  return ['ret', 'reti', 'retn', 'jp', 'jr', 'jp-indirect', 'halt', 'slp'].includes(tag);
}

function boundarySignatureAt(addr) {
  if (addr < 0 || addr >= ROM_SCAN_LIMIT) return null;
  if (rom[addr] === 0xC9) return { raw: 'RET', expectedTag: 'ret', length: 1 };
  if (addr + 1 < ROM_SCAN_LIMIT && rom[addr] === 0xED && rom[addr + 1] === 0x45) {
    return { raw: 'RETN', expectedTag: 'retn', length: 2 };
  }
  if (addr + 1 < ROM_SCAN_LIMIT && rom[addr] === 0xED && rom[addr + 1] === 0x4D) {
    return { raw: 'RETI', expectedTag: 'reti', length: 2 };
  }
  if (addr + 3 < ROM_SCAN_LIMIT && rom[addr] === 0xC3) {
    return { raw: 'JP', expectedTag: 'jp', length: 4 };
  }
  if (addr + 1 < ROM_SCAN_LIMIT && rom[addr] === 0x18) {
    return { raw: 'JR', expectedTag: 'jr', length: 2 };
  }
  return null;
}

function reachesLinearly(startPc, targetPc) {
  if (startPc > targetPc) return false;
  if (startPc === targetPc) return true;

  let pc = startPc & 0xFFFFFF;
  let steps = 0;

  while (pc < targetPc && steps < 4096) {
    const inst = decodeSafe(pc);
    if (inst.tag === 'decode-error') return false;
    if (isHardBoundary(inst.tag)) return false;
    pc += Math.max(1, inst.length ?? inst.size ?? 1);
    steps += 1;
  }

  return pc === targetPc;
}

function scanForFunctionEntry() {
  const candidates = [];
  let chosen = null;

  for (let addr = BACKWARD_SCAN_START; addr >= 0; addr -= 1) {
    const signature = boundarySignatureAt(addr);
    if (!signature) continue;

    const inst = decodeSafe(addr);
    if (inst.tag === 'decode-error') continue;

    const size = Math.max(1, inst.length ?? inst.size ?? signature.length);
    const entryPc = (addr + size) & 0xFFFFFF;
    const exactTagMatch = inst.tag === signature.expectedTag;
    const linearToKnownBlock = exactTagMatch && reachesLinearly(entryPc, KNOWN_BLOCK_START);

    const candidate = {
      boundaryPc: addr,
      entryPc,
      raw: signature.raw,
      bytes: bytesAt(rom, addr, Math.max(signature.length, size)),
      decoded: formatInstructionText(inst),
      linearToKnownBlock,
    };

    candidates.push(candidate);

    if (!chosen && linearToKnownBlock) {
      chosen = candidate;
      break;
    }
  }

  if (!chosen && candidates.length > 0) chosen = candidates[0];

  return {
    chosen,
    candidates,
  };
}

function decodeRange(startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  let guard = 0;
  const end = Math.min(ROM_SCAN_LIMIT, endPc);

  while (pc < end && guard < 512) {
    const inst = decodeSafe(pc);
    rows.push({
      pc: inst.pc,
      text: formatDisassemblyRow(inst),
      length: Math.max(1, inst.length ?? inst.size ?? 1),
    });
    pc += Math.max(1, inst.length ?? inst.size ?? 1);
    guard += 1;
  }

  return rows;
}

function scanTransferSites(targetPc) {
  const lo = targetPc & 0xFF;
  const mid = (targetPc >>> 8) & 0xFF;
  const hi = (targetPc >>> 16) & 0xFF;
  const hits = [];

  for (let addr = 0; addr <= ROM_SCAN_LIMIT - 4; addr += 1) {
    const label = TRANSFER_OPCODES.get(rom[addr]);
    if (!label) continue;
    if (rom[addr + 1] !== lo || rom[addr + 2] !== mid || rom[addr + 3] !== hi) continue;

    const inst = decodeSafe(addr);
    hits.push({
      siteAddr: addr,
      opcode: label,
      bytes: bytesAt(rom, addr, 4),
      decoded: formatInstructionText(inst),
      operandAddr: addr + 1,
    });
  }

  return hits.sort((left, right) => left.siteAddr - right.siteAddr);
}

function disassembleContext(siteAddr, size = 4) {
  const start = Math.max(0, siteAddr - CALL_CONTEXT_BEFORE);
  const end = Math.min(ROM_SCAN_LIMIT, siteAddr + size + CALL_CONTEXT_AFTER);
  return decodeRange(start, end).map((row) => ({
    ...row,
    marker: row.pc === siteAddr ? '<<<< target site' : '',
  }));
}

function scanPointerTableHits(targetPc, operandStarts) {
  const lo = targetPc & 0xFF;
  const mid = (targetPc >>> 8) & 0xFF;
  const hi = (targetPc >>> 16) & 0xFF;
  const hits = [];

  for (let addr = 0; addr <= ROM_SCAN_LIMIT - 3; addr += 1) {
    if (rom[addr] !== lo || rom[addr + 1] !== mid || rom[addr + 2] !== hi) continue;
    if (operandStarts.has(addr)) continue;

    hits.push({
      addr,
      bytes: bytesAt(rom, addr, 3),
      context: bytesAt(rom, Math.max(0, addr - 4), 11),
    });
  }

  return hits;
}

function printEntryScan(entryScan) {
  console.log('=== Part 1: Function Entry Scan ===');
  console.log(`Known block start: ${hex(KNOWN_BLOCK_START)}`);
  console.log(`Known CALL inside block: ${hex(CALL_WITHIN_BLOCK)}`);
  console.log(`Backward scan start: ${hex(BACKWARD_SCAN_START)}`);
  console.log();

  if (entryScan.candidates.length === 0) {
    console.log('No RET/RETN/RETI/JP/JR boundary candidates were found.');
    console.log();
    return KNOWN_BLOCK_START;
  }

  console.log('Boundary candidates encountered while scanning backward:');
  for (const candidate of entryScan.candidates.slice(0, 16)) {
    console.log(
      `  boundary=${hex(candidate.boundaryPc)} entry=${hex(candidate.entryPc)} ` +
      `raw=${candidate.raw.padEnd(4)} bytes=${candidate.bytes.padEnd(15)} ` +
      `linearTo${hex(KNOWN_BLOCK_START)}=${candidate.linearToKnownBlock}  ${candidate.decoded}`,
    );
  }
  if (entryScan.candidates.length > 16) {
    console.log(`  ... ${entryScan.candidates.length - 16} more candidates omitted`);
  }
  console.log();

  const chosen = entryScan.chosen;
  console.log(`Inferred function entry: ${hex(chosen.entryPc)}`);
  console.log(`Chosen boundary: ${hex(chosen.boundaryPc)} (${chosen.raw})`);
  console.log(`Boundary bytes: ${chosen.bytes}`);
  console.log(`Boundary decode: ${chosen.decoded}`);
  console.log(`Linear decode reaches ${hex(KNOWN_BLOCK_START)}: ${chosen.linearToKnownBlock}`);
  console.log();

  console.log('Disassembly around the inferred entry and known caller block:');
  const previewStart = Math.max(chosen.entryPc, KNOWN_BLOCK_START - 0x20);
  const previewEnd = Math.max(BLOCK_WINDOW_END, Math.min(chosen.entryPc + 0x80, BLOCK_WINDOW_END));
  for (const row of decodeRange(previewStart, previewEnd)) {
    let marker = '';
    if (row.pc === chosen.entryPc) marker = '<<<< inferred entry';
    if (row.pc === KNOWN_BLOCK_START) marker = marker ? `${marker}, known block start` : '<<<< known block start';
    if (row.pc === CALL_WITHIN_BLOCK) marker = marker ? `${marker}, known CALL` : '<<<< known CALL';
    console.log(`  ${row.text}${marker ? `  ${marker}` : ''}`);
  }
  console.log();

  return chosen.entryPc;
}

function printTransferSites(entryPc, sites) {
  console.log('=== Part 2: Static Call-Site Scan ===');
  console.log(`Target entry point: ${hex(entryPc)}`);
  console.log();

  if (sites.length === 0) {
    console.log('No CALL/JP sites to the inferred entry point were found.');
    console.log();
    return;
  }

  for (const site of sites) {
    console.log(`  ${hex(site.siteAddr)}  ${site.bytes}  ${site.opcode}  decoded=${site.decoded}`);
  }
  console.log();
}

function printCallerContexts(sites) {
  console.log('=== Part 3: Caller Context Disassembly ===');
  console.log(`Window: ${CALL_CONTEXT_BEFORE} bytes before, ${CALL_CONTEXT_AFTER} bytes after each 4-byte transfer`);
  console.log();

  if (sites.length === 0) {
    console.log('No caller contexts to disassemble.');
    console.log();
    return;
  }

  for (const site of sites) {
    console.log(`--- ${site.opcode} site at ${hex(site.siteAddr)} (${site.bytes}) ---`);
    for (const row of disassembleContext(site.siteAddr, 4)) {
      console.log(`  ${row.text}${row.marker ? `  ${row.marker}` : ''}`);
    }
    console.log();
  }
}

function printPointerHits(entryPc, pointerHits) {
  console.log('=== Part 4: Raw 24-Bit Entry-Byte Hits ===');
  console.log(`Target entry encoding: ${bytesAt(Uint8Array.from([entryPc & 0xFF, (entryPc >>> 8) & 0xFF, (entryPc >>> 16) & 0xFF]), 0, 3)}`);
  console.log();

  if (pointerHits.length === 0) {
    console.log('No non-transfer 3-byte hits were found.');
    console.log();
    return;
  }

  for (const hit of pointerHits) {
    console.log(`  ${hex(hit.addr)}  bytes=${hit.bytes}  context=${hit.context}`);
  }
  console.log();
}

function main() {
  console.log('=== Phase 221: 0x04E9FD Caller Trace ===');
  console.log();

  const entryScan = scanForFunctionEntry();
  const entryPc = printEntryScan(entryScan);

  const transferSites = scanTransferSites(entryPc);
  printTransferSites(entryPc, transferSites);
  printCallerContexts(transferSites);

  const operandStarts = new Set(transferSites.map((site) => site.operandAddr));
  const pointerHits = scanPointerTableHits(entryPc, operandStarts);
  printPointerHits(entryPc, pointerHits);

  console.log('=== Summary ===');
  console.log(`Inferred entry point: ${hex(entryPc)}`);
  console.log(`Direct CALL/JP sites: ${transferSites.length}`);
  console.log(`Other 3-byte hits: ${pointerHits.length}`);
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase221-04e9fd-caller-trace.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
