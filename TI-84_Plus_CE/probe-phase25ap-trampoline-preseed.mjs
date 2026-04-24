#!/usr/bin/env node

/**
 * Phase 25AP: Investigate 0x07FF81 trampoline pre-setup purpose.
 *
 * Part A: Static disassembly of 0x07FF81 and helper 0x04C940
 * Part B: Cross-reference 0xD02AD7 (scrapMem) in the ROM
 * Part C: Cross-reference all callers of 0x07FF81
 * Part D: Analysis of pre-seed purpose
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const decoderSource = fs.readFileSync(path.join(__dirname, 'ez80-decoder.js'), 'utf8');
const { decodeInstruction } = await import(
  `data:text/javascript;base64,${Buffer.from(decoderSource).toString('base64')}`,
);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function formatInstruction(inst) {
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  switch (inst.tag) {
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-imm': return `ld ${inst.dest}, 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `ld (${inst.indexRegister}${disp(inst.displacement)}), 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'alu-ind': return `${inst.op} (${inst.indirectRegister})`;
    case 'indexed-cb-res': return `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind': return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    default: return inst.tag;
  }
}

function disassembleWindow(startAddr, maxBytes, stopAtRet = false) {
  const rows = [];
  let pc = startAddr;
  const end = Math.min(romBytes.length, startAddr + maxBytes);

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    if (!inst || inst.length <= 0) break;
    rows.push({
      pc: inst.pc,
      length: inst.length,
      bytes: hexBytes(romBytes, inst.pc, inst.length),
      text: formatInstruction(inst),
      tag: inst.tag,
    });
    pc += inst.length;
    if (stopAtRet && (inst.tag === 'ret' || inst.tag === 'jp')) break;
  }

  return rows;
}

function printDisassembly(log, title, rows) {
  log(title);
  for (const row of rows) {
    log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
  }
}

// Search ROM for a 3-byte little-endian address pattern
function searchRomForAddress(addr, label) {
  const b0 = addr & 0xff;
  const b1 = (addr >> 8) & 0xff;
  const b2 = (addr >> 16) & 0xff;
  const results = [];

  for (let i = 0; i < romBytes.length - 2; i++) {
    if (romBytes[i] === b0 && romBytes[i + 1] === b1 && romBytes[i + 2] === b2) {
      results.push(i);
    }
  }

  return results;
}

// Search ROM for CALL target (CD xx xx xx) or JP target (C3 xx xx xx)
function searchRomForCallOrJp(target) {
  const b0 = target & 0xff;
  const b1 = (target >> 8) & 0xff;
  const b2 = (target >> 16) & 0xff;
  const calls = [];
  const jps = [];

  for (let i = 0; i < romBytes.length - 3; i++) {
    if (romBytes[i + 1] === b0 && romBytes[i + 2] === b1 && romBytes[i + 3] === b2) {
      if (romBytes[i] === 0xcd) calls.push(i);
      if (romBytes[i] === 0xc3) jps.push(i);
    }
  }

  return { calls, jps };
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25AP: 0x07FF81 trampoline pre-setup investigation ===');
  log('');

  // -------------------------------------------------------
  // Part A: Static disassembly
  // -------------------------------------------------------
  log('--- Part A: Static disassembly ---');
  log('');

  // Disassemble 0x07FF81 (the pre-setup function)
  printDisassembly(log, 'Disassembly: 0x07FF81 (pre-setup before ParseInp)', disassembleWindow(0x07FF81, 0x40, false));
  log('');

  // Also show the trampoline entry at 0x099910 for context
  printDisassembly(log, 'Disassembly: 0x099910 (trampoline entry)', disassembleWindow(0x099910, 0x20, false));
  log('');

  // Disassemble 0x04C940 helper
  printDisassembly(log, 'Disassembly: 0x04C940 (helper — stores to scrapMem?)', disassembleWindow(0x04C940, 0x20, true));
  log('');

  // Check what lives around 0x07FF81 — disassemble a wider window before it
  printDisassembly(log, 'Disassembly: 0x07FF70..0x07FF81 (context before)', disassembleWindow(0x07FF70, 0x11, false));
  log('');

  // Show raw bytes at key addresses
  log('Raw bytes at 0x07FF81 (32 bytes):');
  log(`  ${hexBytes(romBytes, 0x07FF81, 32)}`);
  log('');
  log('Raw bytes at 0x04C940 (16 bytes):');
  log(`  ${hexBytes(romBytes, 0x04C940, 16)}`);
  log('');

  // -------------------------------------------------------
  // Part B: Cross-reference 0xD02AD7 (scrapMem)
  // -------------------------------------------------------
  log('--- Part B: Cross-reference 0xD02AD7 (scrapMem) in ROM ---');
  log('');
  log('ti84pceg.inc defines: scrapMem := 0xD02AD7 ; 3 byte scrap (unstable)');
  log('');

  const scrapMemRefs = searchRomForAddress(0xD02AD7, 'scrapMem');
  log(`Total references to 0xD02AD7 in ROM: ${scrapMemRefs.length}`);

  // For each reference, try to determine context (what instruction uses it)
  for (const addr of scrapMemRefs) {
    // Check if this is part of an instruction by looking 1-4 bytes before
    let context = '';

    // Try decoding instructions starting a few bytes before to find which instruction contains this address
    for (let lookback = 4; lookback >= 0; lookback--) {
      const testAddr = addr - lookback;
      if (testAddr < 0) continue;
      const inst = decodeInstruction(romBytes, testAddr, 'adl');
      if (inst && inst.pc === testAddr && inst.length > lookback) {
        // This instruction spans the reference
        context = `${formatInstruction(inst)}`;
        break;
      }
    }

    log(`  ${hex(addr)}: ${hexBytes(romBytes, Math.max(0, addr - 2), 8)}  ${context || '(raw data)'}`);
  }
  log('');

  // -------------------------------------------------------
  // Part C: Cross-reference callers of 0x07FF81
  // -------------------------------------------------------
  log('--- Part C: Cross-reference callers of 0x07FF81 ---');
  log('');

  const { calls: calls07FF81, jps: jps07FF81 } = searchRomForCallOrJp(0x07FF81);
  log(`CALL 0x07FF81 (CD 81 FF 07): ${calls07FF81.length} hits`);
  for (const addr of calls07FF81) {
    // Disassemble a few instructions around the caller
    const rows = disassembleWindow(addr, 0x10, false);
    log(`  ${hex(addr)}: ${rows.map(r => r.text).join(' ; ')}`);
  }

  log(`JP 0x07FF81 (C3 81 FF 07): ${jps07FF81.length} hits`);
  for (const addr of jps07FF81) {
    const rows = disassembleWindow(addr, 0x10, false);
    log(`  ${hex(addr)}: ${rows.map(r => r.text).join(' ; ')}`);
  }
  log('');

  // Also check for fall-through callers: who falls into 0x07FF81?
  // Check if 0x099910 references 0x07FF81 via CALL
  log('Checking if 0x099910 trampoline calls 0x07FF81:');
  const trampRows = disassembleWindow(0x099910, 0x08, false);
  for (const row of trampRows) {
    log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
  }
  log('');

  // -------------------------------------------------------
  // Part D: Wider context — what callers use the trampoline 0x099910?
  // -------------------------------------------------------
  log('--- Part D: Callers of trampoline 0x099910 ---');
  log('');

  const { calls: calls099910, jps: jps099910 } = searchRomForCallOrJp(0x099910);
  log(`CALL 0x099910: ${calls099910.length} hits`);
  for (const addr of calls099910) {
    // Show surrounding context
    const before = disassembleWindow(Math.max(0, addr - 12), 12 + 4, false);
    log(`  Caller at ${hex(addr)}:`);
    for (const row of before) {
      const marker = row.pc === addr ? ' >>>' : '    ';
      log(`  ${marker} ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
    }
  }

  log(`JP 0x099910: ${jps099910.length} hits`);
  for (const addr of jps099910) {
    const before = disassembleWindow(Math.max(0, addr - 12), 12 + 4, false);
    log(`  Jump at ${hex(addr)}:`);
    for (const row of before) {
      const marker = row.pc === addr ? ' >>>' : '    ';
      log(`  ${marker} ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
    }
  }
  log('');

  // -------------------------------------------------------
  // Part E: Callers of direct ParseInp 0x099914 for comparison
  // -------------------------------------------------------
  log('--- Part E: Callers of direct ParseInp 0x099914 (for comparison) ---');
  log('');

  const { calls: calls099914, jps: jps099914 } = searchRomForCallOrJp(0x099914);
  log(`CALL 0x099914: ${calls099914.length} hits`);
  for (const addr of calls099914) {
    log(`  ${hex(addr)}: ${hexBytes(romBytes, addr, 4)}`);
  }

  log(`JP 0x099914: ${jps099914.length} hits`);
  for (const addr of jps099914) {
    log(`  ${hex(addr)}: ${hexBytes(romBytes, addr, 4)}`);
  }
  log('');

  // -------------------------------------------------------
  // Summary
  // -------------------------------------------------------
  log('--- Summary ---');
  log(`0x07FF81 callers: ${calls07FF81.length} CALL + ${jps07FF81.length} JP = ${calls07FF81.length + jps07FF81.length} total`);
  log(`0x099910 (trampoline) callers: ${calls099910.length} CALL + ${jps099910.length} JP = ${calls099910.length + jps099910.length} total`);
  log(`0x099914 (direct ParseInp) callers: ${calls099914.length} CALL + ${jps099914.length} JP = ${calls099914.length + jps099914.length} total`);
  log(`0xD02AD7 (scrapMem) references: ${scrapMemRefs.length}`);
  log('');
  log('Done.');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
