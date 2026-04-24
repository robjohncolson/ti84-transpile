#!/usr/bin/env node

/**
 * Phase 25AP supplemental: Disassemble 0x092294-0x0922B0 and 0x092FDD-0x092FF0
 * to understand the exact instruction that produces the 0xFFF909 jump target.
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('./TI-84_Plus_CE/ROM.rom');

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesFor(buffer, pc, length) {
  return Array.from(buffer.slice(pc, pc + length), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function decodeRange(startAddr, byteCount) {
  const rows = [];
  let pc = startAddr;
  const endAddr = startAddr + byteCount;
  while (pc < endAddr) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length) {
      rows.push({ pc, bytes: bytesFor(rom, pc, 1), text: `db ${hex(rom[pc], 2)}` });
      pc += 1;
      continue;
    }
    rows.push({ pc, bytes: bytesFor(rom, pc, inst.length), inst });
    pc += inst.length;
  }
  return rows;
}

function formatInst(inst) {
  // Simple formatter for the key instruction types
  switch (inst.tag) {
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${inst.indirectRegister})`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-pair-mem': return inst.direction === 'to-mem' ? `ld (${hex(inst.addr)}), ${inst.pair}` : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-sp-pair': return `ld sp, ${inst.src}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hex(inst.value, 2)}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'sbc-pair': return `sbc hl, ${inst.src}`;
    case 'adc-pair': return `adc hl, ${inst.src}`;
    case 'ex-de-hl': return 'ex de, hl';
    case 'ldir': return 'ldir';
    case 'ldi': return 'ldi';
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'nop': return 'nop';
    case 'or': return `or ${inst.src}`;
    case 'ld-a-ind-de': return 'ld a, (de)';
    case 'ld-ind-de-a': return 'ld (de), a';
    case 'mlt': return `mlt ${inst.reg}`;
    case 'lea': return `lea ${inst.dest}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    default: {
      const parts = Object.entries(inst)
        .filter(([k]) => !['pc','length','nextPc','tag','mode','modePrefix','terminates','fallthrough'].includes(k))
        .map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v) : v}`);
      return `${inst.tag} ${parts.join(' ')}`;
    }
  }
}

function printRange(label, start, bytes) {
  console.log(`\n--- ${label} ---\n`);
  const rows = decodeRange(start, bytes);
  for (const row of rows) {
    const text = row.inst ? formatInst(row.inst) : row.text;
    const prefix = row.inst?.modePrefix ? `${row.inst.modePrefix} ` : '';
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(24)}  ${prefix}${text}`);
  }
}

// The key areas from the trace:
// Step 39: 0x092294 — entered after 0x04C973 returns
// Step 40: 0x0922A2 — continuation
// Step 41: 0x092297 — this is where HL=0x000000 and the dynamic target 0xFFF909 is generated
// Step 42: 0xFFF909 — MISSING BLOCK

printRange('0x092280-0x0922C0 (RclEntryToEdit area)', 0x092280, 0x40);
printRange('0x092294-0x0922B0 (source of 0xFFF909 jump)', 0x092294, 0x20);
printRange('0x0921CB-0x092210 (history manager entry)', 0x0921CB, 0x45);
printRange('0x092FDD-0x093000 (helper called from history manager)', 0x092FDD, 0x23);
printRange('0x04C973-0x04C990 (helper called at step 38)', 0x04C973, 0x20);
printRange('0x04C90D-0x04C920 (helper called at step 34)', 0x04C90D, 0x15);

// Also check what 0x0922A2 does — step 40 goes there, step 41 goes to 0x092297
printRange('0x0922A0-0x0922B0 (RclEntryToEdit/RclToQueue)', 0x0922A0, 0x30);

console.log('\n=== End of disassembly ===');
