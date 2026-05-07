#!/usr/bin/env node

// Phase 222 — Trace 0x0856C8 caller chain + 0xD00826 population
//
// Goals:
//   1. Find parent function of 0x0856C8, its entry point, and callers
//   2. Disassemble 0x0866E7 (loads A from 0xD00826)
//   3. Map all writers to 0xD00826 (key code storage)
//   4. Map all writers to 0xD00824 (key code checked vs 0x48/0x54/0x55/0x59)
//   5. Identify key codes 0x48/0x54/0x55/0x59

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

if (!existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');

const rom = readFileSync(ROM_PATH);
const ROM_SCAN_LIMIT = Math.min(rom.length, 0x400000);

// --- Constants ---
const CALL_SITE = 0x0856C8;         // CALL 0x04E9D8 inside home-screen key dispatch
const FUNC_0866E7 = 0x0866E7;       // Loads A from (0xD00826)
const ADDR_D00826 = 0xD00826;       // Key code storage variable
const ADDR_D00824 = 0xD00824;       // Key code checked vs 0x48/0x54/0x55/0x59
const MBASE = 0xD0;

// Known TI-84 CE OS key codes (from TI-OS SDK keypadc.h / ti84pce.inc)
// These are the "key codes" returned by _GetKey, NOT scan codes.
const KEY_CODE_NAMES = {
  0x09: 'kEnter',
  0x0A: 'kUp (reserved)',
  0x0B: 'kDown (reserved)',
  0x0C: 'kLeft (reserved)',
  0x0D: 'kRight (reserved)',
  0x21: 'kMath',
  0x22: 'kApps',
  0x23: 'kPrgm',
  0x24: 'kVars (custom menus)',
  0x31: 'kClear',
  0x35: 'kRecip (x^-1)',
  0x36: 'kSin',
  0x37: 'kCos',
  0x38: 'kTan',
  0x39: 'kPower (^)',
  0x3A: 'kSquare (x^2)',
  0x3B: 'kComma',
  0x3C: 'kLParen',
  0x3D: 'kRParen',
  0x3E: 'kDiv (/)',
  0x3F: 'kLog',
  0x40: 'k7',
  0x41: 'k8',
  0x42: 'k9',
  0x43: 'kMul (*)',
  0x44: 'kLn',
  0x45: 'k4',
  0x46: 'k5',
  0x47: 'k6',
  0x48: 'kSub (-)',
  0x49: 'kStore (STO>)',
  0x4A: 'k1',
  0x4B: 'k2',
  0x4C: 'k3',
  0x4D: 'kAdd (+)',
  0x4E: 'k0',
  0x4F: 'kDecPt (.)',
  0x50: 'kChs ((-) negate)',
  0x51: 'kEnter',
  0x52: 'kUp',
  0x53: 'kDown',
  0x54: 'kLeft',
  0x55: 'kRight',
  0x56: 'kXvar (X,T,theta,n)',
  0x57: 'kDel',
  0x58: 'kAlpha',
  0x59: 'kStat',
  0x5A: 'kYeq (Y=)',
  0x5B: 'kWindow',
  0x5C: 'kZoom',
  0x5D: 'kTrace',
  0x5E: 'kGraph',
  0x5F: 'k2nd',
  0x60: 'kMode',
  0x65: 'kDEL',
  0x69: 'kGraphVar',
  0x7E: 'kCatalog',
  0x9A: 'kCapA',
  0xFC: 'kLastEntry',
  0xFE: 'kAns',
};

// --- Transfer opcodes ---
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

// --- Utility functions ---
function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'null';
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
    return (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstructionText(inst) {
  if (!inst) return '(decode error)';
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  const d = (value) => (value >= 0 ? `+${value}` : `${value}`);

  switch (inst.tag) {
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${String(inst.indirectRegister ?? inst.reg ?? 'HL').toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti': return `${prefix}RETI`;
    case 'retn': return `${prefix}RETN`;
    case 'rst': return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(resolveAddr(inst))})`;
    case 'ld-mem-pair': return `${prefix}LD (${hex(resolveAddr(inst))}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(resolveAddr(inst))})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(resolveAddr(inst))}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm': return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ind': return `${prefix}${String(inst.op).toUpperCase()} (HL)`;
    case 'alu-ixd': return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'bit-test': return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `${prefix}BIT ${inst.bit}, (HL)`;
    case 'bit-set-ind': return `${prefix}SET ${inst.bit}, (HL)`;
    case 'bit-res-ind': return `${prefix}RES ${inst.bit}, (HL)`;
    case 'indexed-cb-bit': return `${prefix}BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${d(inst.displacement)})`;
    case 'rotate-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind': return `${prefix}${String(inst.op).toUpperCase()} (HL)`;
    case 'lea': return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${String(inst.base ?? inst.src).toUpperCase()}${d(inst.displacement)}`;
    case 'ex-af': return `${prefix}EX AF, AF'`;
    case 'exx': return `${prefix}EXX`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'scf': return `${prefix}SCF`;
    case 'ccf': return `${prefix}CCF`;
    case 'cpl': return `${prefix}CPL`;
    case 'neg': return `${prefix}NEG`;
    case 'rla': return `${prefix}RLA`;
    case 'rra': return `${prefix}RRA`;
    case 'rlca': return `${prefix}RLCA`;
    case 'rrca': return `${prefix}RRCA`;
    case 'daa': return `${prefix}DAA`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ldir': return `${prefix}LDIR`;
    case 'lddr': return `${prefix}LDDR`;
    case 'ldi': return `${prefix}LDI`;
    case 'ldd': return `${prefix}LDD`;
    case 'cpir': return `${prefix}CPIR`;
    case 'cpdr': return `${prefix}CPDR`;
    case 'cpi': return `${prefix}CPI`;
    case 'cpd': return `${prefix}CPD`;
    case 'nop': return `${prefix}NOP`;
    case 'halt': return `${prefix}HALT`;
    case 'slp': return `${prefix}SLP`;
    case 'im': return `${prefix}IM ${inst.value ?? inst.mode}`;
    case 'tst-imm': return `${prefix}TST A, ${hexByte(inst.value)}`;
    case 'ex-sp-ind': return `${prefix}EX (SP), ${String(inst.pair ?? 'HL').toUpperCase()}`;
    case 'in-reg': return `${prefix}IN ${String(inst.dest ?? inst.reg ?? 'A').toUpperCase()}, (C)`;
    case 'out-reg': return `${prefix}OUT (C), ${String(inst.src ?? inst.reg ?? 'A').toUpperCase()}`;
    case 'otir': return `${prefix}OTIR`;
    case 'otdr': return `${prefix}OTDR`;
    case 'inir': return `${prefix}INIR`;
    case 'indr': return `${prefix}INDR`;
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
  return `${hex(inst.pc)}: ${bytes.padEnd(18)} ${formatInstructionText(inst)}`;
}

function isHardBoundary(tag) {
  return ['ret', 'reti', 'retn', 'jp', 'jr', 'jp-indirect', 'halt', 'slp'].includes(tag);
}

function decodeRange(startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  let guard = 0;
  const end = Math.min(ROM_SCAN_LIMIT, endPc);

  while (pc < end && guard < 1024) {
    const inst = decodeSafe(pc);
    rows.push({
      pc: inst.pc,
      text: formatDisassemblyRow(inst),
      tag: inst.tag,
      length: Math.max(1, inst.length ?? inst.size ?? 1),
      inst,
    });
    pc += Math.max(1, inst.length ?? inst.size ?? 1);
    guard += 1;
  }

  return rows;
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

// --- Part 1: Find parent function of 0x0856C8 ---
function findParentFunction() {
  console.log('=== Part 1: Find Parent Function of 0x0856C8 ===');
  console.log();

  // Scan backward from 0x0856C8 for a RET/JP/JR hard boundary
  let bestEntry = null;
  let bestBoundary = null;
  let bestBoundaryText = null;

  for (let addr = CALL_SITE - 1; addr >= Math.max(0, CALL_SITE - 0x200); addr--) {
    const inst = decodeSafe(addr);
    const len = Math.max(1, inst.length ?? inst.size ?? 1);
    const nextPc = (addr + len) & 0xFFFFFF;

    if (isHardBoundary(inst.tag) && nextPc <= CALL_SITE) {
      // Check if nextPc reaches CALL_SITE linearly
      if (reachesLinearly(nextPc, CALL_SITE)) {
        bestEntry = nextPc;
        bestBoundary = addr;
        bestBoundaryText = formatInstructionText(inst);
        break;
      }
    }
  }

  if (bestEntry === null) {
    console.log('No hard boundary found scanning backward from 0x0856C8 (0x200 range).');
    console.log('Trying wider scan...');

    for (let addr = CALL_SITE - 1; addr >= Math.max(0, CALL_SITE - 0x400); addr--) {
      const inst = decodeSafe(addr);
      const len = Math.max(1, inst.length ?? inst.size ?? 1);
      const nextPc = (addr + len) & 0xFFFFFF;

      if (isHardBoundary(inst.tag) && nextPc <= CALL_SITE) {
        bestEntry = nextPc;
        bestBoundary = addr;
        bestBoundaryText = formatInstructionText(inst);
        break;
      }
    }
  }

  console.log(`Inferred function entry: ${hex(bestEntry)}`);
  console.log(`Boundary instruction: ${bestBoundaryText} at ${hex(bestBoundary)}`);
  console.log();

  // Disassemble from entry to a bit past the CALL site
  const disasmEnd = Math.min(CALL_SITE + 0x40, ROM_SCAN_LIMIT);
  const disasmStart = bestEntry ?? (CALL_SITE - 0x40);

  console.log(`Disassembly ${hex(disasmStart)} - ${hex(disasmEnd)}:`);
  const rows = decodeRange(disasmStart, disasmEnd);
  for (const row of rows) {
    let marker = '';
    if (row.pc === bestEntry) marker = ' <<<< ENTRY';
    if (row.pc === CALL_SITE) marker += ' <<<< CALL 0x04E9D8';
    console.log(`  ${row.text}${marker}`);
  }
  console.log();

  // Find callers of the entry point
  if (bestEntry !== null) {
    console.log(`Scanning for CALL/JP to entry ${hex(bestEntry)}...`);
    const callers = scanTransferSites(bestEntry);
    if (callers.length === 0) {
      console.log('  No direct CALL/JP sites found.');
    } else {
      for (const site of callers) {
        console.log(`  ${hex(site.siteAddr)}  ${site.bytes}  ${site.opcode}  ${site.decoded}`);
      }
    }
    console.log();

    // Also scan for pointer table refs to entry
    const lo = bestEntry & 0xFF;
    const mid = (bestEntry >>> 8) & 0xFF;
    const hi = (bestEntry >>> 16) & 0xFF;
    const operandAddrs = new Set(callers.map((s) => s.operandAddr));
    const ptrHits = [];
    for (let i = 0; i <= ROM_SCAN_LIMIT - 3; i++) {
      if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
        if (!operandAddrs.has(i)) {
          ptrHits.push(i);
        }
      }
    }
    if (ptrHits.length > 0) {
      console.log(`Pointer table references to ${hex(bestEntry)}:`);
      for (const addr of ptrHits.slice(0, 20)) {
        console.log(`  ${hex(addr)}  context: ${bytesAt(rom, Math.max(0, addr - 4), 11)}`);
      }
      console.log();
    }
  }

  // Also scan for the wider containing function
  // Check what function contains 0x0856CE (post-call site with CP 0x4A/0x49)
  console.log('Post-call context (0x0856CE+)...');
  const postRows = decodeRange(CALL_SITE + 4, CALL_SITE + 0x60);
  for (const row of postRows) {
    console.log(`  ${row.text}`);
  }
  console.log();

  return bestEntry;
}

// --- Scan for CALL/JP transfer sites to a target ---
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

  return hits.sort((a, b) => a.siteAddr - b.siteAddr);
}

// --- Part 2: Disassemble 0x0866E7 ---
function disassemble0866E7() {
  console.log('=== Part 2: Disassemble 0x0866E7 (key code loader) ===');
  console.log();

  // Disassemble from 0x0866E7 until RET or 0x086740
  const rows = decodeRange(FUNC_0866E7, 0x086740);
  let foundRet = false;
  for (const row of rows) {
    console.log(`  ${row.text}`);
    if (row.tag === 'ret' || row.tag === 'reti' || row.tag === 'retn') {
      foundRet = true;
      break;
    }
  }

  if (!foundRet) {
    console.log('  (no RET found in range — may tail-call or loop)');
  }
  console.log();

  // Also check if there are any callers of 0x0866E7
  console.log('Callers of 0x0866E7:');
  const callers = scanTransferSites(FUNC_0866E7);
  if (callers.length === 0) {
    console.log('  None found.');
  } else {
    for (const site of callers) {
      console.log(`  ${hex(site.siteAddr)}  ${site.bytes}  ${site.opcode}`);
    }
  }
  console.log();
}

// --- Part 3: Map writers to 0xD00826 ---
function scanStoreToAddr(targetAddr, label) {
  console.log(`=== Part 3${label}: Map writers to ${hex(targetAddr)} ===`);
  console.log();

  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  const results = [];

  // Pattern 1: LD (addr24),A = 0x32 LL MM HH
  for (let i = 0; i <= ROM_SCAN_LIMIT - 4; i++) {
    if (rom[i] === 0x32 && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push({ addr: i, type: 'LD (nn),A', bytes: bytesAt(rom, i, 4) });
    }
  }

  // Pattern 2: LD (addr24),HL = 0x22 LL MM HH
  for (let i = 0; i <= ROM_SCAN_LIMIT - 4; i++) {
    if (rom[i] === 0x22 && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push({ addr: i, type: 'LD (nn),HL', bytes: bytesAt(rom, i, 4) });
    }
  }

  // Pattern 3: ED 43/53/63/73 = LD (addr24),BC/DE/HL/SP
  for (let i = 0; i <= ROM_SCAN_LIMIT - 5; i++) {
    if (rom[i] === 0xED) {
      const next = rom[i + 1];
      if ((next === 0x43 || next === 0x53 || next === 0x63 || next === 0x73) &&
          rom[i + 2] === lo && rom[i + 3] === mid && rom[i + 4] === hi) {
        const pairs = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
        results.push({ addr: i, type: `LD (nn),${pairs[next]}`, bytes: bytesAt(rom, i, 5) });
      }
    }
  }

  // Pattern 4: LD (HL),A or LD (HL),imm where HL might point to targetAddr
  // (can't statically determine — skip for now, note as limitation)

  // Pattern 5: LDIR/LDDR that cover the address range (can't statically determine)

  // Pattern 6: LD (addr24),N = 0x36 on (HL) won't match. Check for IY/IX indexed near addr.
  // If targetAddr = IY + offset, IY = 0xD00080, offset = targetAddr - 0xD00080
  const iyOffset = targetAddr - 0xD00080;
  if (iyOffset >= -128 && iyOffset <= 127) {
    console.log(`  Note: ${hex(targetAddr)} = IY${iyOffset >= 0 ? '+' : ''}${iyOffset} (IY=0xD00080)`);

    // Scan for LD (IY+offset),A = FD 77 offset
    // LD (IY+offset),N = FD 36 offset NN
    // SET/RES bit,(IY+offset) = FD CB offset XX
    const signedByte = iyOffset < 0 ? 256 + iyOffset : iyOffset;
    for (let i = 0; i <= ROM_SCAN_LIMIT - 3; i++) {
      if (rom[i] === 0xFD) {
        // LD (IY+d),A
        if (rom[i + 1] === 0x77 && rom[i + 2] === signedByte) {
          results.push({ addr: i, type: 'LD (IY+d),A', bytes: bytesAt(rom, i, 3) });
        }
        // LD (IY+d),r  (0x70-0x77 minus 0x76 which is HALT)
        if (rom[i + 1] >= 0x70 && rom[i + 1] <= 0x75 && rom[i + 2] === signedByte) {
          const regs = ['B', 'C', 'D', 'E', 'H', 'L'];
          const regName = regs[rom[i + 1] - 0x70];
          results.push({ addr: i, type: `LD (IY+d),${regName}`, bytes: bytesAt(rom, i, 3) });
        }
        // LD (IY+d),N
        if (rom[i + 1] === 0x36 && rom[i + 2] === signedByte) {
          results.push({ addr: i, type: `LD (IY+d),${hexByte(rom[i + 3])}`, bytes: bytesAt(rom, i, 4) });
        }
        // SET/RES via CB prefix
        if (rom[i + 1] === 0xCB && rom[i + 2] === signedByte) {
          const cbOp = rom[i + 3];
          if (cbOp >= 0xC0 && cbOp <= 0xFF) {
            const bit = (cbOp >> 3) & 7;
            results.push({ addr: i, type: `SET ${bit},(IY+d)`, bytes: bytesAt(rom, i, 4) });
          } else if (cbOp >= 0x80 && cbOp <= 0xBF) {
            const bit = (cbOp >> 3) & 7;
            results.push({ addr: i, type: `RES ${bit},(IY+d)`, bytes: bytesAt(rom, i, 4) });
          }
        }
      }
    }
  }

  // Also scan for reads (LD A,(addr24)) for completeness
  const readResults = [];
  for (let i = 0; i <= ROM_SCAN_LIMIT - 4; i++) {
    if (rom[i] === 0x3A && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      readResults.push({ addr: i, type: 'LD A,(nn)', bytes: bytesAt(rom, i, 4) });
    }
  }

  // Also scan for ED read patterns: LD rr,(nn)
  for (let i = 0; i <= ROM_SCAN_LIMIT - 5; i++) {
    if (rom[i] === 0xED) {
      const next = rom[i + 1];
      if ((next === 0x4B || next === 0x5B || next === 0x6B || next === 0x7B) &&
          rom[i + 2] === lo && rom[i + 3] === mid && rom[i + 4] === hi) {
        const pairs = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
        readResults.push({ addr: i, type: `LD ${pairs[next]},(nn)`, bytes: bytesAt(rom, i, 5) });
      }
    }
  }

  // LD HL,(nn) = 0x2A
  for (let i = 0; i <= ROM_SCAN_LIMIT - 4; i++) {
    if (rom[i] === 0x2A && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      readResults.push({ addr: i, type: 'LD HL,(nn)', bytes: bytesAt(rom, i, 4) });
    }
  }

  console.log(`WRITE sites (${results.length}):`);
  if (results.length === 0) {
    console.log('  None found via static pattern scan.');
  } else {
    for (const r of results) {
      const context = decodeRange(Math.max(0, r.addr - 16), r.addr + 8);
      console.log(`  ${hex(r.addr)}  ${r.type}  bytes=${r.bytes}`);
      console.log('    Context:');
      for (const row of context) {
        const marker = row.pc === r.addr ? ' <<<<' : '';
        console.log(`      ${row.text}${marker}`);
      }
      console.log();
    }
  }

  console.log(`READ sites (${readResults.length}):`);
  for (const r of readResults.slice(0, 20)) {
    console.log(`  ${hex(r.addr)}  ${r.type}  bytes=${r.bytes}`);
  }
  if (readResults.length > 20) {
    console.log(`  ... and ${readResults.length - 20} more`);
  }
  console.log();

  return { writes: results, reads: readResults };
}

// --- Part 5: Identify key codes ---
function identifyKeyCodes() {
  console.log('=== Part 5: Identify Key Codes 0x48/0x54/0x55/0x59 ===');
  console.log();

  const codes = [0x48, 0x54, 0x55, 0x59];
  console.log('Key codes SKIPPED by the caller at 0x0856C8 (JR Z → SCF → RET):');
  for (const code of codes) {
    const name = KEY_CODE_NAMES[code] ?? 'UNKNOWN';
    console.log(`  ${hexByte(code)} (${code}) = ${name}`);
  }
  console.log();

  // Also identify the codes checked AFTER the call (0x4A, 0x49)
  console.log('Key codes checked AFTER CALL 0x04E9D8 (at 0x0856CE):');
  const postCodes = [0x4A, 0x49];
  for (const code of postCodes) {
    const name = KEY_CODE_NAMES[code] ?? 'UNKNOWN';
    console.log(`  ${hexByte(code)} (${code}) = ${name}`);
  }
  console.log();

  console.log('Interpretation:');
  console.log('  The caller SKIPS 0x04E9D8 for: Subtract (-), Left arrow, Right arrow, STAT');
  console.log('  These keys have special handling elsewhere in the home-screen dispatch.');
  console.log('  After the call, key codes 0x4A (k1) and 0x49 (kStore/STO>) route to');
  console.log('  0x088805 and 0x0885FF respectively (separate handlers).');
  console.log();

  // Cross-reference: what range of key codes DOES reach 0x04E9D8?
  console.log('Key code flow summary:');
  console.log('  Keyboard hardware -> scan code (0x00-0x67)');
  console.log('  ISR chain (0x02F68A) -> key code (0x09-0xFE)');
  console.log('  Key code stored at 0xD00824 and 0xD00826');
  console.log('  0x0856C8 caller: LD A,(0xD00824), skip if 0x48/0x54/0x55/0x59');
  console.log('  Non-skipped codes -> CALL 0x04E9D8 -> loads A from (0xD00826)');
  console.log('  0x04E9D8: A = key code, clamped to 0xFE if 0xFF');
  console.log('  After: CP 0x4A -> JP Z 0x088805 (digit "1" handler)');
  console.log('  After: CP 0x49 -> JP Z 0x0885FF (STO> handler)');
  console.log();
}

// --- Part 6: Wider context - scan area around 0x0856C8 for the dispatch table ---
function scanDispatchArea() {
  console.log('=== Part 6: Wider Home-Screen Key Dispatch Context ===');
  console.log();

  // Disassemble a wider region around the call site to understand dispatch structure
  const wideStart = Math.max(0, CALL_SITE - 0x80);
  const wideEnd = CALL_SITE + 0x80;

  console.log(`Wide disassembly ${hex(wideStart)} - ${hex(wideEnd)}:`);
  const rows = decodeRange(wideStart, wideEnd);
  for (const row of rows) {
    let marker = '';
    if (row.pc === CALL_SITE) marker = ' <<<< CALL 0x04E9D8';
    console.log(`  ${row.text}${marker}`);
  }
  console.log();

  // Find callers of 0x082BE2 (event loop) and trace how they reach 0x0856C8
  console.log('Callers of 0x082BE2 (OS event loop):');
  const eventLoopCallers = scanTransferSites(0x082BE2);
  for (const site of eventLoopCallers.slice(0, 10)) {
    console.log(`  ${hex(site.siteAddr)}  ${site.opcode}  ${site.decoded}`);
  }
  console.log();
}

// --- Main ---
function main() {
  console.log('=== Phase 222: 0x0856C8 Caller Chain + 0xD00826 Population ===');
  console.log();

  // Part 1: Find parent function
  const parentEntry = findParentFunction();

  // Part 2: Disassemble 0x0866E7
  disassemble0866E7();

  // Part 3a: Map writers to 0xD00826
  const d00826Info = scanStoreToAddr(ADDR_D00826, 'a');

  // Part 3b: Map writers to 0xD00824
  const d00824Info = scanStoreToAddr(ADDR_D00824, 'b');

  // Part 5: Identify key codes
  identifyKeyCodes();

  // Part 6: Wider dispatch context
  scanDispatchArea();

  // --- Summary ---
  console.log('=== SUMMARY ===');
  console.log();
  console.log(`Parent function of 0x0856C8: entry at ${hex(parentEntry)}`);
  console.log(`0x0866E7: key code loader (see disassembly above)`);
  console.log(`0xD00826 writers: ${d00826Info.writes.length} WRITE, ${d00826Info.reads.length} READ`);
  console.log(`0xD00824 writers: ${d00824Info.writes.length} WRITE, ${d00824Info.reads.length} READ`);
  console.log();
  console.log('Key codes SKIPPED by 0x0856C8 caller:');
  console.log('  0x48 = kSub (subtract/minus)');
  console.log('  0x54 = kLeft (left arrow)');
  console.log('  0x55 = kRight (right arrow)');
  console.log('  0x59 = kStat');
  console.log('These have dedicated handlers elsewhere in home-screen dispatch.');
  console.log();
  console.log('Post-call checks (at 0x0856CE):');
  console.log('  0x4A = k1 (digit 1) -> JP Z 0x088805');
  console.log('  0x49 = kStore (STO>) -> JP Z 0x0885FF');
  console.log();
  console.log('Key code flow:');
  console.log('  scan code -> ISR (0x02F68A) -> key code -> 0xD00824/0xD00826');
  console.log('  Home dispatch: LD A,(0xD00824), filter, CALL 0x04E9D8');
  console.log('  0x04E9D8: LD A,(0xD00826) via CALL 0x0866E7, clamp to 0xFE');
  console.log();

  console.log(JSON.stringify({
    probe: 'probe-phase222-0856c8-caller-chain.mjs',
    parentFunctionEntry: hex(parentEntry),
    func0866E7: 'key code loader from 0xD00826',
    d00826Writers: d00826Info.writes.length,
    d00826Reads: d00826Info.reads.length,
    d00824Writers: d00824Info.writes.length,
    d00824Reads: d00824Info.reads.length,
    skippedKeyCodes: {
      '0x48': 'kSub (subtract/minus)',
      '0x54': 'kLeft (left arrow)',
      '0x55': 'kRight (right arrow)',
      '0x59': 'kStat',
    },
    postCallChecks: {
      '0x4A': 'k1 (digit 1) -> JP Z 0x088805',
      '0x49': 'kStore (STO>) -> JP Z 0x0885FF',
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    probe: 'probe-phase222-0856c8-caller-chain.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
