#!/usr/bin/env node
// Phase 470: Disassemble main handler at 0x02FDD8
// Called after key processor (0x03FA09) returns A != 1 and A != 4.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// Known addresses of interest
const KNOWN_ADDRS = {
  0xD141B5: 'key_buffer',
  0xD00591: 'cursor_display_state',
  0xD40000: 'VRAM_start',
  0xD65800: 'VRAM_end',
  0x030078: 'port_LCD_setup',
  0x0059C6: 'display_output',
  0xD000C6: 'IY+0x46_flags',
  0x03FA09: 'key_processor',
  0x02FDD8: 'main_handler',
  0x030052: 'key_wait_loop',
  0xD00595: 'display_cursor',
  0x021AB8: 'mode_dispatcher_jump_table',
};

function hexAddr(v) {
  return '0x' + v.toString(16).toUpperCase().padStart(6, '0');
}

function hexByte(v) {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

function formatDisp(d) {
  return d >= 0 ? `+${d}` : `${d}`;
}

function formatInstruction(instr, romBytes) {
  const bytes = [];
  for (let i = 0; i < instr.length; i++) {
    bytes.push(hexByte(romBytes[instr.pc + i]));
  }
  const bytesStr = bytes.join(' ').padEnd(20);

  let asm = instr.tag;
  const notes = [];

  switch (instr.tag) {
    case 'call':
      asm = `CALL ${hexAddr(instr.target)}`;
      if (KNOWN_ADDRS[instr.target]) notes.push(KNOWN_ADDRS[instr.target]);
      break;
    case 'call-conditional':
      asm = `CALL ${instr.condition.toUpperCase()}, ${hexAddr(instr.target)}`;
      if (KNOWN_ADDRS[instr.target]) notes.push(KNOWN_ADDRS[instr.target]);
      break;
    case 'jp':
      asm = `JP ${hexAddr(instr.target)}`;
      if (KNOWN_ADDRS[instr.target]) notes.push(KNOWN_ADDRS[instr.target]);
      break;
    case 'jp-conditional':
      asm = `JP ${instr.condition.toUpperCase()}, ${hexAddr(instr.target)}`;
      if (KNOWN_ADDRS[instr.target]) notes.push(KNOWN_ADDRS[instr.target]);
      break;
    case 'jr':
      asm = `JR ${hexAddr(instr.target)}`;
      break;
    case 'jr-conditional':
      asm = `JR ${instr.condition.toUpperCase()}, ${hexAddr(instr.target)}`;
      break;
    case 'djnz':
      asm = `DJNZ ${hexAddr(instr.target)}`;
      break;
    case 'ret':
      asm = 'RET';
      break;
    case 'ret-conditional':
      asm = `RET ${instr.condition.toUpperCase()}`;
      break;
    case 'retn':
      asm = 'RETN';
      break;
    case 'reti':
      asm = 'RETI';
      break;
    case 'ld-reg-imm':
      asm = `LD ${instr.dest.toUpperCase()}, 0x${hexByte(instr.value)}`;
      break;
    case 'ld-pair-imm':
      asm = `LD ${instr.pair.toUpperCase()}, ${hexAddr(instr.value)}`;
      if (KNOWN_ADDRS[instr.value]) notes.push(KNOWN_ADDRS[instr.value]);
      break;
    case 'ld-reg-reg':
      asm = `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
      break;
    case 'ld-reg-mem':
      asm = `LD ${instr.dest.toUpperCase()}, (${hexAddr(instr.addr)})`;
      if (KNOWN_ADDRS[instr.addr]) notes.push(KNOWN_ADDRS[instr.addr]);
      break;
    case 'ld-mem-reg':
      asm = `LD (${hexAddr(instr.addr)}), ${instr.src.toUpperCase()}`;
      if (KNOWN_ADDRS[instr.addr]) notes.push(KNOWN_ADDRS[instr.addr]);
      break;
    case 'ld-reg-ind':
      asm = `LD ${instr.dest.toUpperCase()}, (${instr.src.toUpperCase()})`;
      break;
    case 'ld-ind-reg':
      asm = `LD (${instr.dest.toUpperCase()}), ${instr.src.toUpperCase()}`;
      break;
    case 'ld-pair-mem':
      if (instr.direction === 'to-mem') {
        asm = `LD (${hexAddr(instr.addr)}), ${instr.pair.toUpperCase()}`;
      } else {
        asm = `LD ${instr.pair.toUpperCase()}, (${hexAddr(instr.addr)})`;
      }
      if (KNOWN_ADDRS[instr.addr]) notes.push(KNOWN_ADDRS[instr.addr]);
      break;
    case 'ld-mem-pair':
      asm = `LD (${hexAddr(instr.addr)}), ${instr.pair.toUpperCase()}`;
      if (KNOWN_ADDRS[instr.addr]) notes.push(KNOWN_ADDRS[instr.addr]);
      break;
    case 'ld-ind-imm':
      asm = `LD (HL), 0x${hexByte(instr.value)}`;
      break;
    case 'ld-reg-ixd':
      asm = `LD ${instr.dest.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'ld-ixd-reg':
      asm = `LD (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)}), ${instr.src.toUpperCase()}`;
      break;
    case 'ld-ixd-imm':
      asm = `LD (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)}), 0x${hexByte(instr.value)}`;
      break;
    case 'alu-reg':
      asm = `${instr.op.toUpperCase()} A, ${instr.src.toUpperCase()}`;
      break;
    case 'alu-imm':
      asm = `${instr.op.toUpperCase()} A, 0x${hexByte(instr.value)}`;
      break;
    case 'alu-ixd':
      asm = `${instr.op.toUpperCase()} A, (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'inc-reg':
      asm = `INC ${instr.reg.toUpperCase()}`;
      break;
    case 'dec-reg':
      asm = `DEC ${instr.reg.toUpperCase()}`;
      break;
    case 'inc-pair':
      asm = `INC ${instr.pair.toUpperCase()}`;
      break;
    case 'dec-pair':
      asm = `DEC ${instr.pair.toUpperCase()}`;
      break;
    case 'push':
      asm = `PUSH ${instr.pair.toUpperCase()}`;
      break;
    case 'pop':
      asm = `POP ${instr.pair.toUpperCase()}`;
      break;
    case 'add-pair':
      asm = `ADD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
      break;
    case 'sbc-pair':
      asm = `SBC HL, ${instr.src.toUpperCase()}`;
      break;
    case 'adc-pair':
      asm = `ADC HL, ${instr.src.toUpperCase()}`;
      break;
    case 'rst':
      asm = `RST 0x${hexByte(instr.target)}`;
      break;
    case 'nop':
      asm = 'NOP';
      break;
    case 'halt':
      asm = 'HALT';
      break;
    case 'di':
      asm = 'DI';
      break;
    case 'ei':
      asm = 'EI';
      break;
    case 'ex-de-hl':
      asm = 'EX DE, HL';
      break;
    case 'ex-af':
      asm = "EX AF, AF'";
      break;
    case 'exx':
      asm = 'EXX';
      break;
    case 'ex-sp-hl':
      asm = 'EX (SP), HL';
      break;
    case 'ex-sp-pair':
      asm = `EX (SP), ${instr.pair.toUpperCase()}`;
      break;
    case 'ld-sp-hl':
      asm = 'LD SP, HL';
      break;
    case 'ld-sp-pair':
      asm = `LD SP, ${instr.pair.toUpperCase()}`;
      break;
    case 'jp-indirect':
      asm = `JP (${(instr.indirectRegister || 'hl').toUpperCase()})`;
      break;
    case 'bit-test':
      asm = `BIT ${instr.bit}, ${instr.reg.toUpperCase()}`;
      break;
    case 'bit-test-ind':
      asm = `BIT ${instr.bit}, (HL)`;
      break;
    case 'bit-set':
      asm = `SET ${instr.bit}, ${instr.reg.toUpperCase()}`;
      break;
    case 'bit-set-ind':
      asm = `SET ${instr.bit}, (HL)`;
      break;
    case 'bit-res':
      asm = `RES ${instr.bit}, ${instr.reg.toUpperCase()}`;
      break;
    case 'bit-res-ind':
      asm = `RES ${instr.bit}, (HL)`;
      break;
    case 'indexed-cb-bit':
      asm = `BIT ${instr.bit}, (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'indexed-cb-set':
      asm = `SET ${instr.bit}, (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'indexed-cb-res':
      asm = `RES ${instr.bit}, (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'indexed-cb-rotate':
      asm = `${instr.operation.toUpperCase()} (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'rotate-reg':
      asm = `${instr.op.toUpperCase()} ${instr.reg.toUpperCase()}`;
      break;
    case 'rotate-ind':
      asm = `${instr.op.toUpperCase()} (HL)`;
      break;
    case 'rlca': asm = 'RLCA'; break;
    case 'rrca': asm = 'RRCA'; break;
    case 'rla': asm = 'RLA'; break;
    case 'rra': asm = 'RRA'; break;
    case 'cpl': asm = 'CPL'; break;
    case 'scf': asm = 'SCF'; break;
    case 'ccf': asm = 'CCF'; break;
    case 'daa': asm = 'DAA'; break;
    case 'neg': asm = 'NEG'; break;
    case 'ldi': asm = 'LDI'; break;
    case 'ldir': asm = 'LDIR'; break;
    case 'ldd': asm = 'LDD'; break;
    case 'lddr': asm = 'LDDR'; break;
    case 'cpi': asm = 'CPI'; break;
    case 'cpir': asm = 'CPIR'; break;
    case 'cpd': asm = 'CPD'; break;
    case 'cpdr': asm = 'CPDR'; break;
    case 'in-imm':
      asm = `IN A, (0x${hexByte(instr.port)})`;
      break;
    case 'out-imm':
      asm = `OUT (0x${hexByte(instr.port)}), A`;
      break;
    case 'in-reg':
      asm = `IN ${instr.reg.toUpperCase()}, (C)`;
      break;
    case 'out-reg':
      asm = `OUT (C), ${instr.reg.toUpperCase()}`;
      break;
    case 'in0':
      asm = `IN0 ${instr.reg.toUpperCase()}, (0x${hexByte(instr.port)})`;
      break;
    case 'out0':
      asm = `OUT0 (0x${hexByte(instr.port)}), ${instr.reg.toUpperCase()}`;
      break;
    case 'im':
      asm = `IM ${instr.value}`;
      break;
    case 'ld-special':
      asm = `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
      break;
    case 'mlt':
      asm = `MLT ${instr.reg.toUpperCase()}`;
      break;
    case 'lea':
      asm = `LEA ${instr.dest.toUpperCase()}, ${instr.base.toUpperCase()}${formatDisp(instr.displacement)}`;
      break;
    case 'pea':
      asm = `PEA ${instr.base.toUpperCase()}${formatDisp(instr.displacement)}`;
      break;
    case 'inc-ixd':
      asm = `INC (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'dec-ixd':
      asm = `DEC (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'ld-pair-indexed':
      asm = `LD ${instr.pair.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'ld-indexed-pair':
      asm = `LD (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)}), ${instr.pair.toUpperCase()}`;
      break;
    case 'rrd': asm = 'RRD'; break;
    case 'rld': asm = 'RLD'; break;
    case 'tst-reg':
      asm = `TST A, ${instr.reg.toUpperCase()}`;
      break;
    case 'tst-ind':
      asm = 'TST A, (HL)';
      break;
    case 'tst-imm':
      asm = `TST A, 0x${hexByte(instr.value)}`;
      break;
    case 'ld-mb-a': asm = 'LD MB, A'; break;
    case 'ld-a-mb': asm = 'LD A, MB'; break;
    case 'stmix': asm = 'STMIX'; break;
    case 'rsmix': asm = 'RSMIX'; break;
    case 'ld-pair-ind':
      asm = `LD ${instr.pair.toUpperCase()}, (${instr.src.toUpperCase()})`;
      break;
    case 'ld-ind-pair':
      asm = `LD (${instr.dest.toUpperCase()}), ${instr.pair.toUpperCase()}`;
      break;
    case 'ld-ixiy-indexed':
      asm = `LD ${instr.dest.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)})`;
      break;
    case 'ld-indexed-ixiy':
      asm = `LD (${instr.indexRegister.toUpperCase()}${formatDisp(instr.displacement)}), ${instr.src.toUpperCase()}`;
      break;
    case 'slp': asm = 'SLP'; break;
    case 'otimr': asm = 'OTIMR'; break;
    default:
      asm = `${instr.tag} ${JSON.stringify(instr)}`;
      break;
  }

  // Check for IY+0x46 reference
  if (instr.indexRegister === 'iy' && instr.displacement === 0x46) {
    notes.push('IY+0x46 = D000C6 (flags)');
  }

  // Check numeric fields for known addresses and VRAM
  for (const [key, val] of Object.entries(instr)) {
    if (typeof val !== 'number') continue;
    if (key === 'pc' || key === 'length' || key === 'nextPc' || key === 'bit' ||
        key === 'displacement' || key === 'value' || key === 'port') continue;
    if (val >= 0xD40000 && val <= 0xD65800 && !KNOWN_ADDRS[val]) {
      notes.push(`VRAM offset ${hexAddr(val - 0xD40000)}`);
    }
  }
  // Also check addr/value fields for VRAM
  for (const key of ['addr', 'value']) {
    const val = instr[key];
    if (typeof val === 'number' && val >= 0xD40000 && val <= 0xD65800) {
      notes.push(`VRAM ref ${hexAddr(val)}`);
    }
  }

  const noteStr = notes.length > 0 ? ` ; ${notes.join(', ')}` : '';
  return `${bytesStr} ${asm}${noteStr}`;
}

function disassembleRange(startAddr, maxBytes, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label} @ ${hexAddr(startAddr)} (${maxBytes} bytes)`);
  console.log('='.repeat(70));

  const targets = [];
  let pc = startAddr;
  const endPc = startAddr + maxBytes;
  let instrCount = 0;

  while (pc < endPc && pc < rom.length) {
    try {
      const instr = decodeInstruction(rom, pc, 'adl');
      if (!instr || instr.length === 0) {
        console.log(`${hexAddr(pc)}: ?? (decode failed)`);
        break;
      }

      const prefix = instr.modePrefix ? `[${instr.modePrefix}] ` : '';
      console.log(`${hexAddr(pc)}: ${prefix}${formatInstruction(instr, rom)}`);

      // Collect branch targets
      if (instr.tag === 'call' || instr.tag === 'call-conditional' ||
          instr.tag === 'jp' || instr.tag === 'jp-conditional') {
        targets.push({ addr: instr.target, from: pc, type: instr.tag.startsWith('call') ? 'CALL' : 'JP' });
      }

      pc = instr.nextPc;
      instrCount++;

      if (instr.tag === 'ret' || instr.tag === 'retn' || instr.tag === 'reti') {
        console.log('  --- (return, end of linear flow)');
        if (pc >= endPc) break;
      }
      if (instr.tag === 'jp' || instr.tag === 'jp-indirect') {
        console.log('  --- (unconditional jump, end of linear flow)');
        if (pc >= endPc) break;
      }
    } catch (e) {
      console.log(`${hexAddr(pc)}: ERROR: ${e.message}`);
      pc++;
    }
  }

  console.log(`  [${instrCount} instructions decoded]`);
  return targets;
}

// ---- Main ----

console.log('Phase 470: Main Handler Disassembly');
console.log('===================================');
console.log('Target: 0x02FDD8 -- called after key processor (0x03FA09) returns A != 1, A != 4');
console.log(`ROM size: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);

const mainTargets = disassembleRange(0x02FDD8, 150, 'MAIN HANDLER');

// Deduplicate targets
const seen = new Set();
const uniqueTargets = [];
for (const t of mainTargets) {
  if (!seen.has(t.addr) && t.addr < rom.length && t.addr >= 0) {
    seen.add(t.addr);
    uniqueTargets.push(t);
  }
}

// Depth-1 recursive disassembly
console.log(`\n\n${'#'.repeat(70)}`);
console.log(`DEPTH-1 TARGETS: ${uniqueTargets.length} unique CALL/JP targets`);
console.log('#'.repeat(70));

for (const target of uniqueTargets) {
  const known = KNOWN_ADDRS[target.addr] ? ` (${KNOWN_ADDRS[target.addr]})` : '';
  disassembleRange(target.addr, 50, `${target.type} from ${hexAddr(target.from)}${known}`);
}

// Summary
console.log(`\n\n${'='.repeat(70)}`);
console.log('SUMMARY');
console.log('='.repeat(70));

console.log(`\nMain handler: ${hexAddr(0x02FDD8)}`);
console.log(`Branch targets found: ${mainTargets.length} (${uniqueTargets.length} unique)`);
console.log('\nAll branch targets:');
for (const t of uniqueTargets) {
  const known = KNOWN_ADDRS[t.addr] ? ` = ${KNOWN_ADDRS[t.addr]}` : '';
  console.log(`  ${t.type.padEnd(4)} ${hexAddr(t.addr)} (from ${hexAddr(t.from)})${known}`);
}

// Byte-level scan for known 24-bit address patterns in the range
console.log('\nByte-pattern scan for known addresses in 0x02FDD8..0x02FE6E:');
for (let p = 0x02FDD8; p < 0x02FDD8 + 150 - 2; p++) {
  const addr24 = rom[p] | (rom[p + 1] << 8) | (rom[p + 2] << 16);
  if (KNOWN_ADDRS[addr24]) {
    console.log(`  ${hexAddr(p)}: bytes encode ${hexAddr(addr24)} = ${KNOWN_ADDRS[addr24]}`);
  }
  if (addr24 >= 0xD40000 && addr24 <= 0xD65800) {
    console.log(`  ${hexAddr(p)}: bytes encode ${hexAddr(addr24)} (VRAM)`);
  }
}

console.log('\nDone.');
