#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const START = 0x009087;
const LIMIT = 0x009118;
const DIRECT_CALL_PATTERN = [0xCD, 0x87, 0x90, 0x00];

const CALL_NOTES = new Map([
  [0x002197, 'stack-frame helper; builds a 1-byte IX local'],
  [0x00883C, 'status/event reporter; this call site pushes 0 then 1'],
  [0x014FA0, 'short delay helper; called here with 2 and then 7'],
  [0x008527, 'USB/controller follow-up helper entry; starts with usb_SelfPowered and controller-status side effects'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function readU24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function readS8(addr) {
  const value = rom[addr];
  return value >= 0x80 ? value - 0x100 : value;
}

function bytesFor(addr, length) {
  return Array.from(rom.slice(addr, addr + length))
    .map((byte) => hexByte(byte))
    .join(' ');
}

function formatDisp(disp) {
  return disp < 0 ? `-${Math.abs(disp)}` : `+${disp}`;
}

function decodeAt(addr) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];
  const b3 = rom[addr + 3];

  if (b0 === 0x21) {
    const imm = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `LD HL,${hex(imm)}`, type: 'ld-hl-imm', imm };
  }

  if (b0 === 0xCD) {
    const target = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `CALL ${hex(target)}`, type: 'call', target };
  }

  if (b0 === 0xDD && b1 === 0x36) {
    const disp = readS8(addr + 2);
    const imm = rom[addr + 3];
    return {
      addr,
      len: 4,
      bytes: bytesFor(addr, 4),
      text: `LD (IX${formatDisp(disp)}),${hex(imm, 2)}`,
      type: 'ld-ixd-imm',
      disp,
      imm,
    };
  }

  if (b0 === 0x3A) {
    const target = readU24(addr + 1);
    return {
      addr,
      len: 4,
      bytes: bytesFor(addr, 4),
      text: `LD A,(${hex(target)})`,
      type: 'ld-a-abs',
      target,
    };
  }

  if (b0 === 0xB7) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'OR A', type: 'or-a' };
  }

  if (b0 === 0xED && b1 === 0x62) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'SBC HL,HL', type: 'sbc-hl-hl' };
  }

  if (b0 === 0xED && b1 === 0x42) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'SBC HL,BC', type: 'sbc-hl-bc' };
  }

  if (b0 === 0x6F) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'LD L,A', type: 'ld-l-a' };
  }

  if (b0 === 0x01) {
    const imm = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `LD BC,${hex(imm)}`, type: 'ld-bc-imm', imm };
  }

  if (b0 === 0x40 && b1 === 0x01) {
    const port = rom[addr + 2] | (rom[addr + 3] << 8);
    return {
      addr,
      len: 4,
      bytes: bytesFor(addr, 4),
      text: `SIS LD BC,${hex(port, 4)}`,
      type: 'sis-ld-bc-port',
      port,
    };
  }

  if (b0 === 0x20) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFFFF;
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `JR NZ,${hex(target)}`, type: 'jr-nz', target };
  }

  if (b0 === 0x28) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFFFF;
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `JR Z,${hex(target)}`, type: 'jr-z', target };
  }

  if (b0 === 0x18) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFFFF;
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `JR ${hex(target)}`, type: 'jr', target };
  }

  if (b0 === 0xED && b1 === 0x78) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'IN A,(C)', type: 'in-a-c' };
  }

  if (b0 === 0xE6) {
    const imm = rom[addr + 1];
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `AND ${hex(imm, 2)}`, type: 'and-imm', imm };
  }

  if (b0 === 0xC5) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'PUSH BC', type: 'push-bc' };
  }

  if (b0 === 0xC1) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'POP BC', type: 'pop-bc' };
  }

  if (b0 === 0xCB && b1 === 0xD7) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'SET 2,A', type: 'set-2-a' };
  }

  if (b0 === 0xCB && b1 === 0x97) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'RES 2,A', type: 'res-2-a' };
  }

  if (b0 === 0xED && b1 === 0x79) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'OUT (C),A', type: 'out-c-a' };
  }

  if (b0 === 0x78) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'LD A,B', type: 'ld-a-b' };
  }

  if (b0 === 0xFE) {
    const imm = rom[addr + 1];
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `CP ${hex(imm, 2)}`, type: 'cp-imm', imm };
  }

  if (b0 === 0xCF) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'RST 0x08', type: 'rst-08' };
  }

  if (b0 === 0x79) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'LD A,C', type: 'ld-a-c' };
  }

  if (b0 === 0xDD && b1 === 0x7E) {
    const disp = readS8(addr + 2);
    return {
      addr,
      len: 3,
      bytes: bytesFor(addr, 3),
      text: `LD A,(IX${formatDisp(disp)})`,
      type: 'ld-a-ixd',
      disp,
    };
  }

  if (b0 === 0xDD && b1 === 0xF9) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'LD SP,IX', type: 'ld-sp-ix' };
  }

  if (b0 === 0xDD && b1 === 0xE1) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'POP IX', type: 'pop-ix' };
  }

  if (b0 === 0xC9) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'RET', type: 'ret' };
  }

  throw new Error(`Unsupported opcode at ${hex(addr)}: ${bytesFor(addr, 6)}`);
}

function disassemble(start, limit) {
  const instructions = [];
  let addr = start;

  while (addr < limit) {
    const instruction = decodeAt(addr);
    instructions.push(instruction);
    addr += instruction.len;
    if (instruction.type === 'ret') {
      return instructions;
    }
  }

  throw new Error(`No RET found before ${hex(limit)}`);
}

function findPattern(pattern) {
  const hits = [];

  for (let addr = 0; addr <= rom.length - pattern.length; addr += 1) {
    let matched = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (rom[addr + i] !== pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(addr);
    }
  }

  return hits;
}

function annotate(inst) {
  if (inst.addr === START) {
    return 'function entry; reserve a 1-byte local via 0x002197';
  }

  if (inst.addr === 0x00908F) {
    return 'seed local return latch to 1';
  }

  if (inst.addr === 0x009093) {
    return 'read selector/event byte D177B8';
  }

  if (inst.addr === 0x00909C) {
    return 'compare selector against 0x21';
  }

  if (inst.addr === 0x0090A2) {
    return 'selector mismatch jumps to the only failure path';
  }

  if (inst.addr === 0x0090A4) {
    return 'load USB status port 0x3082 into BC';
  }

  if (inst.addr === 0x0090AC) {
    return 'if 0x3082 bit4 is already set, return success immediately';
  }

  if (inst.addr === 0x0090B8) {
    return 'status/event report path: pushed 0 then 1 before the call';
  }

  if (inst.addr === 0x0090C3) {
    return 'delay(2)';
  }

  if (inst.addr === 0x0090D0) {
    return 'if 0x3082 bit3 is set, skip the 0x3080 bit2 pulse';
  }

  if (inst.addr === 0x0090D2) {
    return 'load controller/control port 0x3080 into BC';
  }

  if (inst.addr === 0x0090D8) {
    return 'set bit2 in the 0x3080 sample';
  }

  if (inst.addr === 0x0090DA) {
    return 'write 0x3080 with bit2 raised';
  }

  if (inst.addr === 0x0090E1 || inst.addr === 0x009104) {
    return 'RST 0x08 if BC is no longer the expected fixed port constant';
  }

  if (inst.addr === 0x0090EC) {
    return 'delay(7)';
  }

  if (inst.addr === 0x0090F1) {
    return 'enter deeper USB/controller helper path';
  }

  if (inst.addr === 0x0090FB) {
    return 'clear bit2 in the 0x3080 sample';
  }

  if (inst.addr === 0x0090FD) {
    return 'write 0x3080 with bit2 lowered again';
  }

  if (inst.addr === 0x00910C) {
    return 'only failure path: selector was not 0x21';
  }

  if (inst.addr === 0x009110) {
    return 'return A is loaded from the local latch, not from any helper call';
  }

  if (inst.type === 'call') {
    return CALL_NOTES.get(inst.target) ?? '';
  }

  return '';
}

const instructions = disassemble(START, LIMIT);
const endAddr = instructions[instructions.length - 1].addr;
const size = endAddr - START + 1;
const calls = instructions.filter((instruction) => instruction.type === 'call');
const branches = instructions.filter((instruction) => instruction.target !== undefined && instruction.type.startsWith('jr'));
const directCallers = findPattern(DIRECT_CALL_PATTERN);

const out = [];

out.push('Phase 431 - Trace 0x009087 Selector-0x21 USB Fallback');
out.push(`ROM: ${romPath}`);
out.push('');
out.push('=== FUNCTION BOUNDS ===');
out.push(`Start: ${hex(START)}`);
out.push(`End:   ${hex(endAddr)}  (RET)`);
out.push(`Size:  ${size} bytes (${hex(size, 4)})`);
out.push('');
out.push('=== HEX DUMP ===');
for (let addr = START; addr <= endAddr; addr += 16) {
  const slice = rom.slice(addr, Math.min(endAddr + 1, addr + 16));
  const bytes = Array.from(slice).map((byte) => hexByte(byte)).join(' ');
  out.push(`${hex(addr)}  ${bytes}`);
}
out.push('');
out.push('=== DISASSEMBLY ===');
for (const inst of instructions) {
  const comment = annotate(inst);
  out.push(
    `${hex(inst.addr)}  ${inst.bytes.padEnd(20)}  ${inst.text.padEnd(24)}${comment ? ` ; ${comment}` : ''}`
  );
}
out.push('');
out.push('=== DIRECT CALLERS OF 0x009087 ===');
for (const caller of directCallers) {
  out.push(`- ${hex(caller)}`);
}
out.push('');
out.push('=== DIRECT CALL TARGETS ===');
for (const call of calls) {
  const note = CALL_NOTES.get(call.target);
  out.push(`- ${hex(call.target)} at ${hex(call.addr)}${note ? ` - ${note}` : ''}`);
}
out.push('');
out.push('=== JP TARGETS ===');
out.push('- none; this routine only uses relative JR branches');
out.push('');
out.push('=== BRANCH TARGETS ===');
for (const branch of branches) {
  out.push(`- ${hex(branch.addr)} -> ${hex(branch.target)} (${branch.text})`);
}
out.push('');
out.push('=== DIRECT RAM REFERENCES ===');
out.push(`- ${hex(0xD177B8)} read at ${hex(0x009093)} (selector/event byte)`);
out.push(`- local (IX-1) written with 1 at ${hex(0x00908F)}`);
out.push(`- local (IX-1) written with 0 at ${hex(0x00910C)}`);
out.push(`- local (IX-1) read back into A at ${hex(0x009110)}`);
out.push('- no absolute RAM writes inside 0x009087');
out.push('');
out.push('=== DIRECT PORT I/O ===');
out.push(`- ${hex(0x3082, 4)} read at ${hex(0x0090A8)} and gated on bit4 by ${hex(0x0090AA)} / ${hex(0x0090AC)}`);
out.push(`- ${hex(0x3082, 4)} read again at ${hex(0x0090CC)} and gated on bit3 by ${hex(0x0090CE)} / ${hex(0x0090D0)}`);
out.push(`- ${hex(0x3080, 4)} read-modify-write at ${hex(0x0090D6)}..${hex(0x0090DA)} to set bit2`);
out.push(`- ${hex(0x3080, 4)} read-modify-write at ${hex(0x0090F9)}..${hex(0x0090FD)} to clear bit2`);
out.push('');
out.push('=== FINDINGS ===');
out.push('- The routine occupies the full gap before the next wrapper entry: 0x009087..0x009117 = 145 bytes.');
out.push('- It is the fallback only in scheduling. It is not an unconditional success path.');
out.push('- Success is selector-driven: the only direct failure path is D177B8 != 0x21, which forces the local latch to 0.');
out.push('- If D177B8 == 0x21 and port 0x3082 bit4 is already set, the function returns 1 immediately.');
out.push('- Otherwise it reports status via 0x00883C, waits 2 ticks, optionally pulses 0x3080 bit2 for 7 ticks when 0x3082 bit3 is clear, then calls 0x008527 and drops 0x3080 bit2 again.');
out.push('- The helper return values do not propagate. The final A always comes from (IX-1).');
out.push('- Best-fit interpretation: a selector-specific USB/controller power-or-arm fallback for event code 0x21, not a generic error handler or null-transport stub.');
out.push('');
out.push('=== RETURN VALUE ===');
out.push('- A = 1 when D177B8 == 0x21.');
out.push('- A = 0 when D177B8 != 0x21.');
out.push('- No later branch clears the latch on the 0x21 path, so the helper calls cannot turn success into failure.');

console.log(out.join('\n'));
