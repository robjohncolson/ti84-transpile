import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function hex6(value) {
  return value.toString(16).padStart(6, '0');
}

function hex2(value) {
  return value.toString(16).padStart(2, '0');
}

function formatInstr(instr) {
  const tag = instr.tag || '???';
  const extras = [];

  if (instr.pair !== undefined) extras.push(instr.pair);
  if (instr.value !== undefined) extras.push(`0x${instr.value.toString(16)}`);
  if (instr.target !== undefined) extras.push(`0x${instr.target.toString(16).padStart(6, '0')}`);
  if (instr.reg !== undefined) extras.push(instr.reg);
  if (instr.dst !== undefined) extras.push(instr.dst);
  if (instr.src !== undefined) extras.push(instr.src);
  if (instr.cond !== undefined) extras.push(instr.cond);
  if (instr.offset !== undefined) extras.push(`${instr.offset >= 0 ? '+' : ''}${instr.offset}`);
  if (instr.bit !== undefined) extras.push(`bit${instr.bit}`);
  if (instr.imm !== undefined) extras.push(`0x${instr.imm.toString(16)}`);
  if (instr.addr !== undefined) extras.push(`(0x${instr.addr.toString(16).padStart(6, '0')})`);

  return extras.length > 0 ? `${tag} ${extras.join(', ')}` : tag;
}

function disassemble(startAddr, maxLen, label) {
  console.log(`\n=== ${label}: 0x${hex6(startAddr)} ===\n`);

  for (let base = 0; base < maxLen; base += 16) {
    const bytes = [];
    const count = Math.min(16, maxLen - base);

    for (let i = 0; i < count; i++) {
      bytes.push(hex2(rom[startAddr + base + i]));
    }

    console.log(`0x${hex6(startAddr + base)}: ${bytes.join(' ')}`);
  }

  console.log('\n--- Disassembly ---');

  let offset = 0;
  let retCount = 0;

  while (offset < maxLen) {
    const addr = startAddr + offset;

    try {
      const instr = decodeInstruction(rom, addr, 'adl');

      if (!instr || !instr.length || !instr.tag) {
        console.log(`0x${hex6(addr)}: ${hex2(rom[addr]).padEnd(20)} DB 0x${hex2(rom[addr])}`);
        offset++;
        continue;
      }

      const bytes = Array.from(rom.slice(addr, addr + instr.length))
        .map(hex2)
        .join(' ');

      console.log(
        `0x${hex6(addr)}: ${bytes.padEnd(20)} ${formatInstr(instr)}`,
      );

      offset += instr.length;

      if (instr.tag === 'ret' || instr.tag === 'reti' || instr.tag === 'retn') {
        retCount++;
        if (retCount >= 2) {
          break;
        }
      }
    } catch (error) {
      console.log(`0x${hex6(addr)}: ${hex2(rom[addr]).padEnd(20)} DB 0x${hex2(rom[addr])} (decode error: ${error.message})`);
      offset++;
    }
  }
}

disassemble(0x0017CE, 256, 'Event handler post-countdown processor');
disassemble(0x003A0F, 128, 'Event handler cleanup JP target');
