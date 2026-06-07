/**
 * probe-phase557-display-module.mjs
 * Decode the display module at 0x05AD00-0x05AE00 (~256 bytes).
 * This region contains 7 of the 9 callers of cursor Y conversion (0x06CBE5).
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const START = 0x05AD00;
const END = 0x05AE00;
const LENGTH = END - START;

// Known function labels
const knownFunctions = {
  0x06CBE5: 'cursor_Y_conversion',
  0x04C979: 'char_width_clipping',
  0x0A23E5: 'char_renderer',
  0x061986: 'char_output_wrapper',
  0x0A1CAC: 'text_output_function',
};

console.log(`=== Display Module 0x${START.toString(16).toUpperCase()}-0x${END.toString(16).toUpperCase()} (${LENGTH} bytes) ===\n`);

// 1. Raw hex dump
console.log('--- RAW HEX DUMP ---');
for (let i = 0; i < LENGTH; i += 16) {
  const addr = START + i;
  let hex = '';
  let ascii = '';
  for (let j = 0; j < 16 && (i + j) < LENGTH; j++) {
    const b = rom[addr + j];
    hex += b.toString(16).padStart(2, '0') + ' ';
    ascii += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.';
  }
  console.log(`  ${addr.toString(16).padStart(6, '0')}: ${hex.padEnd(48)} ${ascii}`);
}

// 2. Find CALL instructions (CD xx xx xx - 4 bytes in eZ80 ADL mode)
console.log('\n--- CALL INSTRUCTIONS ---');
const calls = [];
for (let i = 0; i < LENGTH - 3; i++) {
  if (rom[START + i] === 0xCD) {
    const target = rom[START + i + 1] | (rom[START + i + 2] << 8) | (rom[START + i + 3] << 16);
    const addr = START + i;
    const label = knownFunctions[target] || '';
    calls.push({ addr, target, label });
    console.log(`  0x${addr.toString(16).toUpperCase()}: CALL 0x${target.toString(16).padStart(6, '0').toUpperCase()}${label ? ' <- ' + label : ''}`);
    i += 3; // skip past the address bytes
  }
}

// 3. Find RET instructions (C9) - function boundaries
console.log('\n--- RET INSTRUCTIONS (function boundaries) ---');
const rets = [];
for (let i = 0; i < LENGTH; i++) {
  if (rom[START + i] === 0xC9) {
    const addr = START + i;
    rets.push(addr);
    console.log(`  0x${addr.toString(16).toUpperCase()}: RET`);
  }
}

// 4. For each CALL 0x06CBE5, look backwards for LD C,imm8 (0E xx) or LD C,reg
console.log('\n--- C REGISTER VALUE BEFORE CALL 0x06CBE5 ---');
for (const call of calls) {
  if (call.target === 0x06CBE5) {
    // Search backwards up to 20 bytes for LD C,imm8 (0E xx)
    let found = false;
    const searchStart = call.addr - START;
    for (let back = 1; back <= 20 && (searchStart - back) >= 0; back++) {
      const offset = searchStart - back;
      const b = rom[START + offset];
      if (b === 0x0E && (offset + 1) < LENGTH) {
        const imm = rom[START + offset + 1];
        console.log(`  Before CALL at 0x${call.addr.toString(16).toUpperCase()}: LD C,0x${imm.toString(16).padStart(2, '0')} (row offset = ${imm}) at 0x${(START + offset).toString(16).toUpperCase()}`);
        found = true;
        break;
      }
      // LD C,B = 0x48, LD C,D = 0x4A, LD C,E = 0x4B, LD C,H = 0x4C, LD C,L = 0x4D, LD C,A = 0x4F
      if (b >= 0x48 && b <= 0x4F && b !== 0x49) { // 0x49 = LD C,C (nop-like)
        const regNames = { 0x48: 'B', 0x4A: 'D', 0x4B: 'E', 0x4C: 'H', 0x4D: 'L', 0x4F: 'A' };
        if (regNames[b]) {
          console.log(`  Before CALL at 0x${call.addr.toString(16).toUpperCase()}: LD C,${regNames[b]} at 0x${(START + offset).toString(16).toUpperCase()}`);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      console.log(`  Before CALL at 0x${call.addr.toString(16).toUpperCase()}: C source NOT FOUND in preceding 20 bytes`);
    }
  }
}

// 5. Find RAM address references (D0xxxx)
console.log('\n--- RAM REFERENCES (D0xxxx) ---');
for (let i = 0; i < LENGTH - 2; i++) {
  // Look for 3-byte sequences where high byte is D0
  if (rom[START + i + 2] === 0xD0) {
    const addr24 = rom[START + i] | (rom[START + i + 1] << 8) | (rom[START + i + 2] << 16);
    // Check if preceded by a load/store opcode
    const prevByte = (i > 0) ? rom[START + i - 1] : 0;
    const opcodes = {
      0x3A: 'LD A,(addr)',
      0x32: 'LD (addr),A',
      0x2A: 'LD HL,(addr)',
      0x22: 'LD (addr),HL',
      0xED: 'ED-prefix load',
      0xCD: 'CALL',
      0xC3: 'JP',
    };
    const instrAddr = START + i - 1;
    const opLabel = opcodes[prevByte] || `opcode 0x${prevByte.toString(16).padStart(2, '0')}`;
    console.log(`  0x${instrAddr.toString(16).toUpperCase()}: ${opLabel} -> RAM 0x${addr24.toString(16).padStart(6, '0').toUpperCase()} at offset +${i}`);
  }
}

// 6. Find IY-relative operations (FD prefix)
console.log('\n--- IY-RELATIVE OPERATIONS ---');
for (let i = 0; i < LENGTH - 1; i++) {
  if (rom[START + i] === 0xFD) {
    const addr = START + i;
    const next = rom[START + i + 1];
    if (next === 0xCB && (i + 3) < LENGTH) {
      // FD CB offset op - bit operations on (IY+offset)
      const offset = rom[START + i + 2];
      const op = rom[START + i + 3];
      const bitOps = { 0x46: 'BIT 0', 0x4E: 'BIT 1', 0x56: 'BIT 2', 0x5E: 'BIT 3',
                       0x66: 'BIT 4', 0x6E: 'BIT 5', 0x76: 'BIT 6', 0x7E: 'BIT 7',
                       0xC6: 'SET 0', 0xCE: 'SET 1', 0xD6: 'SET 2', 0xDE: 'SET 3',
                       0xE6: 'SET 4', 0xEE: 'SET 5', 0xF6: 'SET 6', 0xFE: 'SET 7',
                       0x86: 'RES 0', 0x8E: 'RES 1', 0x96: 'RES 2', 0x9E: 'RES 3',
                       0xA6: 'RES 4', 0xAE: 'RES 5', 0xB6: 'RES 6', 0xBE: 'RES 7' };
      const opName = bitOps[op] || `op 0x${op.toString(16).padStart(2, '0')}`;
      const signedOfs = offset > 127 ? offset - 256 : offset;
      console.log(`  0x${addr.toString(16).toUpperCase()}: ${opName},(IY+0x${offset.toString(16).padStart(2, '0')}) [IY${signedOfs >= 0 ? '+' : ''}${signedOfs}]`);
      i += 3;
    } else {
      // Other IY operations
      let desc = `FD ${next.toString(16).padStart(2, '0')}`;
      if ((next & 0xF0) === 0x70 || (next & 0xC0) === 0x40) {
        // LD (IY+d),r or LD r,(IY+d)
        if ((i + 2) < LENGTH) {
          const d = rom[START + i + 2];
          const signedD = d > 127 ? d - 256 : d;
          desc = `IY+0x${d.toString(16).padStart(2, '0')} [IY${signedD >= 0 ? '+' : ''}${signedD}] operation (next=0x${next.toString(16).padStart(2, '0')})`;
          i += 2;
        }
      } else if (next === 0xE5) {
        desc = 'PUSH IY';
      } else if (next === 0xE1) {
        desc = 'POP IY';
      } else if (next === 0x36 && (i + 3) < LENGTH) {
        const d = rom[START + i + 2];
        const val = rom[START + i + 3];
        desc = `LD (IY+0x${d.toString(16).padStart(2, '0')}),0x${val.toString(16).padStart(2, '0')}`;
        i += 3;
      } else {
        i += 1;
      }
      console.log(`  0x${addr.toString(16).toUpperCase()}: ${desc}`);
    }
  }
}

// 7. Summary
console.log('\n--- SUMMARY ---');
console.log(`Total CALL instructions: ${calls.length}`);
console.log(`Total RET instructions: ${rets.length} (suggesting ~${rets.length} function endpoints)`);
console.log(`Calls to cursor_Y_conversion (0x06CBE5): ${calls.filter(c => c.target === 0x06CBE5).length}`);
console.log(`Calls to char_width_clipping (0x04C979): ${calls.filter(c => c.target === 0x04C979).length}`);
console.log(`Calls to char_renderer (0x0A23E5): ${calls.filter(c => c.target === 0x0A23E5).length}`);
console.log(`Calls to char_output_wrapper (0x061986): ${calls.filter(c => c.target === 0x061986).length}`);
console.log(`Calls to text_output_function (0x0A1CAC): ${calls.filter(c => c.target === 0x0A1CAC).length}`);

console.log('\n=== PROBE COMPLETE ===');
