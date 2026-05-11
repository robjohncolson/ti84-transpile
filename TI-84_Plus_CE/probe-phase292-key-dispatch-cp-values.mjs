/**
 * probe-phase292-key-dispatch-cp-values.mjs
 *
 * Statically disassemble ROM around 14 KEY_DISPATCH reader addresses
 * to extract CP (compare) values and their branch targets.
 * These sites read D0058C (scan code) and dispatch based on its value.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(resolve(__dirname, 'ROM.rom'));

const DISPATCH_ADDRS = [
  0x0258DA, 0x02659C, 0x0269DB, 0x06C83F, 0x074D65, 0x080E76,
  0x0859AA, 0x088657, 0x08B13F, 0x08C4E9, 0x0A584C, 0x0B3733,
  0x0B630D, 0x0B6ADB,
];

// LD A,(D0058C) = 3A 8C 05 D0
const LD_A_PATTERN = [0x3A, 0x8C, 0x05, 0xD0];

const JR_COND = { 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
const JP_COND = { 0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C' };

function toInt8(b) {
  return b > 127 ? b - 256 : b;
}

function addr24(rom, off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
}

function hex(v) {
  return '0x' + v.toString(16).toUpperCase().padStart(6, '0');
}

function hexByte(v) {
  return '0x' + v.toString(16).toUpperCase().padStart(2, '0');
}

function analyzeDispatcher(addr) {
  const start = Math.max(0, addr - 48);
  const end = Math.min(rom.length, addr + 128);

  // Verify LD A,(D0058C) exists in the window
  let ldFound = false;
  for (let i = start; i <= end - 4; i++) {
    if (rom[i] === LD_A_PATTERN[0] && rom[i+1] === LD_A_PATTERN[1] &&
        rom[i+2] === LD_A_PATTERN[2] && rom[i+3] === LD_A_PATTERN[3]) {
      ldFound = true;
      break;
    }
  }

  const cpCascade = [];

  // Scan for CP imm8 (0xFE xx) instructions in the window
  for (let i = start; i < end - 1; i++) {
    if (rom[i] !== 0xFE) continue;

    const cpVal = rom[i + 1];
    const afterCp = i + 2;

    // Look at the instruction right after CP for a branch
    if (afterCp >= end) continue;

    const nextByte = rom[afterCp];
    let branchType = null;
    let target = null;

    if (JR_COND[nextByte] !== undefined && afterCp + 1 < end) {
      branchType = JR_COND[nextByte];
      const offset = toInt8(rom[afterCp + 1]);
      target = afterCp + 2 + offset;
    } else if (JP_COND[nextByte] !== undefined && afterCp + 3 <= end) {
      branchType = JP_COND[nextByte];
      target = addr24(rom, afterCp + 1);
    } else if (nextByte === 0xC3 && afterCp + 3 <= end) {
      branchType = 'JP';
      target = addr24(rom, afterCp + 1);
    } else if (nextByte === 0xCD && afterCp + 3 <= end) {
      branchType = 'CALL';
      target = addr24(rom, afterCp + 1);
    } else if (nextByte === 0xC9) {
      branchType = 'RET';
      target = null;
    } else {
      // No recognized branch immediately after CP — record anyway
      branchType = 'NONE';
      target = null;
    }

    const entry = {
      cp_addr: hex(i),
      cp_value: hexByte(cpVal),
      branch_type: branchType,
    };
    if (target !== null) entry.target = hex(target);
    cpCascade.push(entry);
  }

  return {
    address: hex(addr),
    ld_a_found: ldFound,
    cp_cascade: cpCascade,
  };
}

const dispatchers = DISPATCH_ADDRS.map(analyzeDispatcher);
const result = { dispatchers };

console.log(JSON.stringify(result, null, 2));
