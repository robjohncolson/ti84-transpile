#!/usr/bin/env node

/**
 * Phase 25AD: Static analysis of flash unlock routine usage
 *
 * Pure ROM byte analysis (no execution). Answers:
 *   1. Who calls 0x03E1B4 (flash unlock wrapper) and 0x03E187 (flash unlock core)?
 *   2. What context surrounds each call site?
 *   3. What does JError (0x061DB2) do after calling flash unlock?
 *   4. Where are error strings in ROM, and are they in flash-protected regions?
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ad-flash-unlock-purpose-report.md');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// --- Key addresses ---
const FLASH_UNLOCK_WRAPPER = 0x03E1B4;
const FLASH_UNLOCK_CORE    = 0x03E187;
const JERROR               = 0x061DB2;
const ERR_UNDEFINED        = 0x061D3A;
const ERR_MEMORY           = 0x061D3E;
const FLASH_BOUNDARY       = 0x400000; // RAM starts here

// --- Helpers ---

function hexAddr(addr) {
  return '0x' + addr.toString(16).padStart(6, '0').toUpperCase();
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

function readU24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

/**
 * Scan ROM for CALL <target> instructions.
 * eZ80 CALL = 0xCD + 3-byte LE address (4 bytes total).
 */
function findCallsTo(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const results = [];
  for (let i = 0; i < romBytes.length - 3; i++) {
    if (romBytes[i] === 0xCD &&
        romBytes[i + 1] === lo &&
        romBytes[i + 2] === mid &&
        romBytes[i + 3] === hi) {
      results.push(i);
    }
  }
  return results;
}

/**
 * Dump hex bytes around an address for context.
 */
function dumpContext(addr, before = 30, after = 30) {
  const start = Math.max(0, addr - before);
  const end = Math.min(romBytes.length, addr + after);
  const lines = [];
  for (let off = start; off < end; off += 16) {
    const lineEnd = Math.min(off + 16, end);
    const hex = [];
    const ascii = [];
    for (let j = off; j < lineEnd; j++) {
      const b = romBytes[j];
      hex.push(hexByte(b));
      ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
    }
    const marker = (off <= addr && addr < off + 16) ? ' <--' : '';
    lines.push(`  ${hexAddr(off)}: ${hex.join(' ').padEnd(48)} ${ascii.join('')}${marker}`);
  }
  return lines.join('\n');
}

/**
 * Simple eZ80 disassembly for common instructions.
 * Enough to understand call sites, not a full decoder.
 */
function miniDisasm(startAddr, count = 40) {
  const lines = [];
  let pc = startAddr;
  let n = 0;
  while (n < count && pc < romBytes.length - 3) {
    const op = romBytes[pc];
    let instr = '';
    let len = 1;

    if (op === 0xCD) { // CALL nn
      const target = readU24LE(romBytes, pc + 1);
      instr = `CALL ${hexAddr(target)}`;
      len = 4;
    } else if (op === 0xC3) { // JP nn
      const target = readU24LE(romBytes, pc + 1);
      instr = `JP ${hexAddr(target)}`;
      len = 4;
    } else if (op === 0xC9) { // RET
      instr = 'RET';
    } else if (op === 0xC0) { instr = 'RET NZ'; }
    else if (op === 0xC8) { instr = 'RET Z'; }
    else if (op === 0xD0) { instr = 'RET NC'; }
    else if (op === 0xD8) { instr = 'RET C'; }
    else if (op === 0xE0) { instr = 'RET PO'; }
    else if (op === 0xE8) { instr = 'RET PE'; }
    else if (op === 0xF0) { instr = 'RET P'; }
    else if (op === 0xF8) { instr = 'RET M'; }
    else if (op === 0x18) { // JR e
      const e = romBytes[pc + 1];
      const offset = e < 128 ? e : e - 256;
      const target = pc + 2 + offset;
      instr = `JR ${hexAddr(target)} (offset ${offset >= 0 ? '+' : ''}${offset})`;
      len = 2;
    } else if (op === 0x20) { // JR NZ,e
      const e = romBytes[pc + 1];
      const offset = e < 128 ? e : e - 256;
      instr = `JR NZ,${hexAddr(pc + 2 + offset)}`;
      len = 2;
    } else if (op === 0x28) { // JR Z,e
      const e = romBytes[pc + 1];
      const offset = e < 128 ? e : e - 256;
      instr = `JR Z,${hexAddr(pc + 2 + offset)}`;
      len = 2;
    } else if (op === 0x30) { // JR NC,e
      const e = romBytes[pc + 1];
      const offset = e < 128 ? e : e - 256;
      instr = `JR NC,${hexAddr(pc + 2 + offset)}`;
      len = 2;
    } else if (op === 0x38) { // JR C,e
      const e = romBytes[pc + 1];
      const offset = e < 128 ? e : e - 256;
      instr = `JR C,${hexAddr(pc + 2 + offset)}`;
      len = 2;
    } else if (op === 0x21) { // LD HL,nn
      const val = readU24LE(romBytes, pc + 1);
      instr = `LD HL,${hexAddr(val)}`;
      len = 4;
    } else if (op === 0x11) { // LD DE,nn
      const val = readU24LE(romBytes, pc + 1);
      instr = `LD DE,${hexAddr(val)}`;
      len = 4;
    } else if (op === 0x01) { // LD BC,nn
      const val = readU24LE(romBytes, pc + 1);
      instr = `LD BC,${hexAddr(val)}`;
      len = 4;
    } else if (op === 0x3E) { // LD A,n
      instr = `LD A,0x${hexByte(romBytes[pc + 1])}`;
      len = 2;
    } else if (op === 0x06) { // LD B,n
      instr = `LD B,0x${hexByte(romBytes[pc + 1])}`;
      len = 2;
    } else if (op === 0x0E) { // LD C,n
      instr = `LD C,0x${hexByte(romBytes[pc + 1])}`;
      len = 2;
    } else if (op === 0x16) { // LD D,n
      instr = `LD D,0x${hexByte(romBytes[pc + 1])}`;
      len = 2;
    } else if (op === 0x1E) { // LD E,n
      instr = `LD E,0x${hexByte(romBytes[pc + 1])}`;
      len = 2;
    } else if (op === 0x26) { // LD H,n
      instr = `LD H,0x${hexByte(romBytes[pc + 1])}`;
      len = 2;
    } else if (op === 0x2E) { // LD L,n
      instr = `LD L,0x${hexByte(romBytes[pc + 1])}`;
      len = 2;
    } else if (op === 0x36) { // LD (HL),n
      instr = `LD (HL),0x${hexByte(romBytes[pc + 1])}`;
      len = 2;
    } else if (op === 0xF5) { instr = 'PUSH AF'; }
    else if (op === 0xC5) { instr = 'PUSH BC'; }
    else if (op === 0xD5) { instr = 'PUSH DE'; }
    else if (op === 0xE5) { instr = 'PUSH HL'; }
    else if (op === 0xF1) { instr = 'POP AF'; }
    else if (op === 0xC1) { instr = 'POP BC'; }
    else if (op === 0xD1) { instr = 'POP DE'; }
    else if (op === 0xE1) { instr = 'POP HL'; }
    else if (op === 0xFE) { // CP n
      instr = `CP 0x${hexByte(romBytes[pc + 1])}`;
      len = 2;
    } else if (op === 0xB7) { instr = 'OR A'; }
    else if (op === 0xAF) { instr = 'XOR A'; }
    else if (op === 0xA7) { instr = 'AND A'; }
    else if (op === 0x00) { instr = 'NOP'; }
    else if (op === 0x76) { instr = 'HALT'; }
    else if (op === 0xFB) { instr = 'EI'; }
    else if (op === 0xF3) { instr = 'DI'; }
    else if (op === 0x32) { // LD (nn),A
      const addr = readU24LE(romBytes, pc + 1);
      instr = `LD (${hexAddr(addr)}),A`;
      len = 4;
    } else if (op === 0x3A) { // LD A,(nn)
      const addr = readU24LE(romBytes, pc + 1);
      instr = `LD A,(${hexAddr(addr)})`;
      len = 4;
    } else if (op === 0x22) { // LD (nn),HL
      const addr = readU24LE(romBytes, pc + 1);
      instr = `LD (${hexAddr(addr)}),HL`;
      len = 4;
    } else if (op === 0x2A) { // LD HL,(nn)
      const addr = readU24LE(romBytes, pc + 1);
      instr = `LD HL,(${hexAddr(addr)})`;
      len = 4;
    } else if (op === 0xED) { // ED-prefixed
      const op2 = romBytes[pc + 1];
      if (op2 === 0xB0) { instr = 'LDIR'; len = 2; }
      else if (op2 === 0xB8) { instr = 'LDDR'; len = 2; }
      else { instr = `DB 0xED,0x${hexByte(op2)}`; len = 2; }
    } else if (op === 0xDD || op === 0xFD) { // IX/IY prefix
      const prefix = op === 0xDD ? 'IX' : 'IY';
      const op2 = romBytes[pc + 1];
      if (op2 === 0x21) {
        const val = readU24LE(romBytes, pc + 2);
        instr = `LD ${prefix},${hexAddr(val)}`;
        len = 5;
      } else if (op2 === 0xE5) {
        instr = `PUSH ${prefix}`;
        len = 2;
      } else if (op2 === 0xE1) {
        instr = `POP ${prefix}`;
        len = 2;
      } else {
        instr = `DB 0x${hexByte(op)},0x${hexByte(op2)}`;
        len = 2;
      }
    } else if (op === 0xCA || op === 0xC2 || op === 0xDA || op === 0xD2 ||
               op === 0xE2 || op === 0xEA || op === 0xF2 || op === 0xFA) {
      // Conditional JP nn
      const conds = {0xC2:'NZ',0xCA:'Z',0xD2:'NC',0xDA:'C',0xE2:'PO',0xEA:'PE',0xF2:'P',0xFA:'M'};
      const target = readU24LE(romBytes, pc + 1);
      instr = `JP ${conds[op]},${hexAddr(target)}`;
      len = 4;
    } else if (op === 0xCC || op === 0xC4 || op === 0xDC || op === 0xD4 ||
               op === 0xE4 || op === 0xEC || op === 0xF4 || op === 0xFC) {
      // Conditional CALL nn
      const conds = {0xC4:'NZ',0xCC:'Z',0xD4:'NC',0xDC:'C',0xE4:'PO',0xEC:'PE',0xF4:'P',0xFC:'M'};
      const target = readU24LE(romBytes, pc + 1);
      instr = `CALL ${conds[op]},${hexAddr(target)}`;
      len = 4;
    } else if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
      // LD r,r'
      const regs = ['B','C','D','E','H','L','(HL)','A'];
      const dst = regs[(op >> 3) & 7];
      const src = regs[op & 7];
      instr = `LD ${dst},${src}`;
    } else if (op >= 0x80 && op <= 0x87) {
      const regs = ['B','C','D','E','H','L','(HL)','A'];
      instr = `ADD A,${regs[op & 7]}`;
    } else if (op >= 0xB8 && op <= 0xBF) {
      const regs = ['B','C','D','E','H','L','(HL)','A'];
      instr = `CP ${regs[op & 7]}`;
    } else if (op === 0x23) { instr = 'INC HL'; }
    else if (op === 0x2B) { instr = 'DEC HL'; }
    else if (op === 0x13) { instr = 'INC DE'; }
    else if (op === 0x1B) { instr = 'DEC DE'; }
    else if (op === 0x03) { instr = 'INC BC'; }
    else if (op === 0x0B) { instr = 'DEC BC'; }
    else if (op === 0x3C) { instr = 'INC A'; }
    else if (op === 0x3D) { instr = 'DEC A'; }
    else if (op === 0x04) { instr = 'INC B'; }
    else if (op === 0x05) { instr = 'DEC B'; }
    else if (op === 0x0C) { instr = 'INC C'; }
    else if (op === 0x0D) { instr = 'DEC C'; }
    else if (op === 0x14) { instr = 'INC D'; }
    else if (op === 0x15) { instr = 'DEC D'; }
    else if (op === 0x1C) { instr = 'INC E'; }
    else if (op === 0x1D) { instr = 'DEC E'; }
    else if (op === 0x24) { instr = 'INC H'; }
    else if (op === 0x25) { instr = 'DEC H'; }
    else if (op === 0x2C) { instr = 'INC L'; }
    else if (op === 0x2D) { instr = 'DEC L'; }
    else if (op === 0xC6) { instr = `ADD A,0x${hexByte(romBytes[pc+1])}`; len = 2; }
    else if (op === 0xD6) { instr = `SUB 0x${hexByte(romBytes[pc+1])}`; len = 2; }
    else if (op === 0xE6) { instr = `AND 0x${hexByte(romBytes[pc+1])}`; len = 2; }
    else if (op === 0xF6) { instr = `OR 0x${hexByte(romBytes[pc+1])}`; len = 2; }
    else if (op === 0xEE) { instr = `XOR 0x${hexByte(romBytes[pc+1])}`; len = 2; }
    else if (op === 0xCE) { instr = `ADC A,0x${hexByte(romBytes[pc+1])}`; len = 2; }
    else if (op === 0xDE) { instr = `SBC A,0x${hexByte(romBytes[pc+1])}`; len = 2; }
    else if (op === 0xC7 || op === 0xCF || op === 0xD7 || op === 0xDF ||
             op === 0xE7 || op === 0xEF || op === 0xF7 || op === 0xFF) {
      const rstAddr = op & 0x38;
      instr = `RST ${hexAddr(rstAddr)}`;
    } else {
      const rawBytes = [];
      rawBytes.push(hexByte(op));
      instr = `DB ${rawBytes.join(',')}`;
    }

    const rawHex = [];
    for (let j = 0; j < len; j++) {
      rawHex.push(hexByte(romBytes[pc + j]));
    }

    lines.push(`  ${hexAddr(pc)}: ${rawHex.join(' ').padEnd(16)} ${instr}`);
    pc += len;
    n++;

    // Stop after unconditional RET or JP
    if (op === 0xC9 || op === 0xC3) break;
  }
  return lines.join('\n');
}

/**
 * Search for ASCII strings in ROM.
 */
function searchAscii(searchStr) {
  const results = [];
  const needle = Buffer.from(searchStr, 'ascii');
  for (let i = 0; i < romBytes.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (romBytes[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) {
      results.push(i);
    }
  }
  return results;
}

/**
 * Extract printable ASCII string starting at addr.
 */
function extractString(addr, maxLen = 60) {
  let s = '';
  for (let i = 0; i < maxLen && addr + i < romBytes.length; i++) {
    const b = romBytes[addr + i];
    if (b === 0) break;
    if (b >= 0x20 && b < 0x7F) {
      s += String.fromCharCode(b);
    } else {
      s += `[${hexByte(b)}]`;
    }
  }
  return s;
}

// === ANALYSIS ===

const report = [];
function log(s) { console.log(s); report.push(s); }

log('# Phase 25AD - Flash Unlock Purpose in JError');
log('');
log('Static ROM analysis of flash unlock routine usage during error dispatch.');
log('');

// --- 1. Find all callers ---

log('## 1. Callers of Flash Unlock Wrapper (0x03E1B4)');
log('');
const callersWrapper = findCallsTo(FLASH_UNLOCK_WRAPPER);
log(`Found ${callersWrapper.length} CALL sites targeting ${hexAddr(FLASH_UNLOCK_WRAPPER)}:`);
log('');
for (const caller of callersWrapper) {
  log(`### Call site at ${hexAddr(caller)}`);
  log('');
  log('Disassembly context (preceding + following instructions):');
  log('```');
  log(miniDisasm(Math.max(0, caller - 20), 20));
  log('```');
  log('');
  log('Hex dump:');
  log('```');
  log(dumpContext(caller, 30, 30));
  log('```');
  log('');
}

log('## 2. Callers of Flash Unlock Core (0x03E187)');
log('');
const callersCore = findCallsTo(FLASH_UNLOCK_CORE);
log(`Found ${callersCore.length} CALL sites targeting ${hexAddr(FLASH_UNLOCK_CORE)}:`);
log('');
for (const caller of callersCore) {
  log(`### Call site at ${hexAddr(caller)}`);
  log('');
  log('Disassembly context:');
  log('```');
  log(miniDisasm(Math.max(0, caller - 20), 20));
  log('```');
  log('');
  log('Hex dump:');
  log('```');
  log(dumpContext(caller, 30, 30));
  log('```');
  log('');
}

// --- 3. Trace JError ---

log('## 3. JError (0x061DB2) Disassembly');
log('');
log('Full disassembly of JError entry point:');
log('```');
log(miniDisasm(JERROR, 60));
log('```');
log('');

log('### JError hex dump (first 128 bytes):');
log('```');
log(dumpContext(JERROR, 0, 128));
log('```');
log('');

// Also disassemble the flash unlock wrapper itself
log('## 4. Flash Unlock Wrapper (0x03E1B4) Disassembly');
log('');
log('```');
log(miniDisasm(FLASH_UNLOCK_WRAPPER, 40));
log('```');
log('');

log('## 5. Flash Unlock Core (0x03E187) Disassembly');
log('');
log('```');
log(miniDisasm(FLASH_UNLOCK_CORE, 40));
log('```');
log('');

// --- 4. Error entry points ---

log('## 6. Error Entry Points');
log('');
for (const [name, addr] of [['ErrUndefined', ERR_UNDEFINED], ['ErrMemory', ERR_MEMORY]]) {
  log(`### ${name} (${hexAddr(addr)})`);
  log('```');
  log(miniDisasm(addr, 20));
  log('```');
  log('');
}

// --- 5. Search for error strings ---

log('## 7. Error String Search');
log('');

const searchTerms = ['ERR:', 'UNDEFINED', 'MEMORY', 'SYNTAX', 'DOMAIN', 'OVERFLOW', 'BREAK', 'ERROR'];
for (const term of searchTerms) {
  const hits = searchAscii(term);
  if (hits.length > 0) {
    log(`### "${term}" — ${hits.length} hit(s)`);
    for (const addr of hits.slice(0, 10)) { // Limit output
      const region = addr < FLASH_BOUNDARY ? 'FLASH' : 'RAM-init-image';
      const str = extractString(addr);
      log(`  ${hexAddr(addr)} [${region}]: "${str}"`);
    }
    log('');
  } else {
    log(`### "${term}" — no hits`);
    log('');
  }
}

// --- 6. Look for string table near error handlers ---

log('## 8. String Table Near Error Handlers');
log('');
log('Scanning for string references near ErrUndefined (0x061D3A)...');
log('');

// Check if error handlers load addresses that point to string data
// Look at a wider region around the error handlers
const errRegionStart = 0x061C00;
const errRegionEnd = 0x061F00;
log(`Hex dump of error handler region ${hexAddr(errRegionStart)}-${hexAddr(errRegionEnd)}:`);
log('```');
for (let off = errRegionStart; off < errRegionEnd; off += 16) {
  const lineEnd = Math.min(off + 16, errRegionEnd);
  const hex = [];
  const ascii = [];
  for (let j = off; j < lineEnd; j++) {
    const b = romBytes[j];
    hex.push(hexByte(b));
    ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
  }
  log(`  ${hexAddr(off)}: ${hex.join(' ').padEnd(48)} ${ascii.join('')}`);
}
log('```');
log('');

// --- 7. Look for LD A,<error_code> patterns before CALL/JP to JError ---

log('## 9. References to JError');
log('');
const callsToJError = findCallsTo(JERROR);
log(`CALL ${hexAddr(JERROR)}: ${callsToJError.length} sites`);
for (const c of callsToJError.slice(0, 15)) {
  log(`  ${hexAddr(c)}`);
}
log('');

// Also search for JP to JError
const jpsToJError = [];
for (let i = 0; i < romBytes.length - 3; i++) {
  if (romBytes[i] === 0xC3 &&
      romBytes[i + 1] === (JERROR & 0xFF) &&
      romBytes[i + 2] === ((JERROR >> 8) & 0xFF) &&
      romBytes[i + 3] === ((JERROR >> 16) & 0xFF)) {
    jpsToJError.push(i);
  }
}
log(`JP ${hexAddr(JERROR)}: ${jpsToJError.length} sites`);
for (const c of jpsToJError.slice(0, 15)) {
  log(`  ${hexAddr(c)}`);
}
log('');

// --- 8. Check what flash unlock wrapper actually unlocks ---

log('## 10. Flash Controller Register Analysis');
log('');
log('Looking for I/O port writes in flash unlock routines...');
log('');

// Check if the flash unlock references specific MMIO addresses
// TI-84 CE flash controller is at 0xFxxxxx range typically
// Let's check what addresses the routines reference
log('Disassembly of flash unlock core (extended, 80 instructions):');
log('```');
log(miniDisasm(FLASH_UNLOCK_CORE, 80));
log('```');
log('');

// --- Summary ---

log('## 11. Summary');
log('');
log(`- Flash unlock wrapper (${hexAddr(FLASH_UNLOCK_WRAPPER)}): ${callersWrapper.length} callers`);
log(`- Flash unlock core (${hexAddr(FLASH_UNLOCK_CORE)}): ${callersCore.length} callers`);
log(`- JError (${hexAddr(JERROR)}): ${callsToJError.length} CALL refs, ${jpsToJError.length} JP refs`);
log(`- Error strings found in ROM at addresses listed above`);
log(`- All error handler addresses are in FLASH region (< ${hexAddr(FLASH_BOUNDARY)})`);
log('');

// Write report
fs.writeFileSync(REPORT_PATH, report.join('\n'), 'utf8');
console.log(`\nReport written to ${REPORT_PATH}`);
