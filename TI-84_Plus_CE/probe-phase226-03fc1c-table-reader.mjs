#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!existsSync(transpiledPath)) {
  throw new Error(
    existsSync(transpiledGzipPath)
      ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.'
      : 'ROM.transpiled.js is missing.',
  );
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const rom = readFileSync(romPath);

const MEM_SIZE = 0x1000000;

const D0058D_ADDR = 0xd0058d;
const IY_ADDR = 0xd00080;
const MBASE = 0xd0;
const DEFAULT_STACK_TOP = 0xd1a87e;
const IX_ADDR = 0xd1a860;

const FUNC_ADDR = 0x03fc1c;
const SETTER_ADDR = 0x03fc0f;
const TABLE_ADDR = 0x03fc41;
const FUNC_END = 0x03fca0;
const SENTINEL_RET = 0x7ffff6;

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks
        .filter((block) => block?.id)
        .map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xff, 2);
}

function read24(mem, addr) {
  const a = addr & 0xffffff;
  return ((mem[a] & 0xff) | ((mem[a + 1] & 0xff) << 8) | ((mem[a + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xffffff;
  mem[a] = value & 0xff;
  mem[a + 1] = (value >>> 8) & 0xff;
  mem[a + 2] = (value >>> 16) & 0xff;
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function makeStop(name, detail = null) {
  const error = new Error('__PHASE226_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

// ─── Part 1: Static disassembly of 0x03FC1C to 0x03FCA0 ───

function staticDisassembly() {
  console.log('--- Part 1: Static disassembly of 0x03FC1C..0x03FCA0 ---');
  console.log('Raw bytes with addresses:\n');

  const start = FUNC_ADDR;
  const end = FUNC_END;

  for (let row = start; row < end; row += 16) {
    const rowEnd = Math.min(row + 16, end);
    const addrStr = hex(row);
    const bytes = [];
    const ascii = [];
    for (let i = row; i < rowEnd; i++) {
      bytes.push(hexByte(rom[i]));
      const ch = rom[i];
      ascii.push(ch >= 0x20 && ch <= 0x7e ? String.fromCharCode(ch) : '.');
    }
    console.log(`  ${addrStr}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }

  console.log('\nManual eZ80 ADL-mode decode:');
  console.log('(Reading instruction stream from ROM bytes)\n');

  // Decode instructions manually
  let pc = start;
  while (pc < end) {
    const instrStart = pc;
    const b0 = rom[pc++];

    let instr = '';
    let comment = '';

    if (b0 === 0xc9) {
      instr = 'RET';
      comment = '<--- function boundary';
    } else if (b0 === 0x3a && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD A,(${hex(addr)})`;
      if (addr === D0058D_ADDR) comment = '<--- reads D0058D (real key code)';
    } else if (b0 === 0x32 && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD (${hex(addr)}),A`;
      if (addr === D0058D_ADDR) comment = '<--- writes D0058D';
    } else if (b0 === 0x21 && pc + 2 <= end) {
      const imm = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD HL,${hex(imm)}`;
      if (imm === TABLE_ADDR) comment = '<--- table base address';
    } else if (b0 === 0x11 && pc + 2 <= end) {
      const imm = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD DE,${hex(imm)}`;
    } else if (b0 === 0x01 && pc + 2 <= end) {
      const imm = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD BC,${hex(imm)}`;
    } else if (b0 === 0x3e && pc < end) {
      instr = `LD A,${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0x06 && pc < end) {
      instr = `LD B,${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0x0e && pc < end) {
      instr = `LD C,${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0x16 && pc < end) {
      instr = `LD D,${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0x1e && pc < end) {
      instr = `LD E,${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0x26 && pc < end) {
      instr = `LD H,${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0x2e && pc < end) {
      instr = `LD L,${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0x5f) {
      instr = 'LD E,A';
    } else if (b0 === 0x57) {
      instr = 'LD D,A';
    } else if (b0 === 0x47) {
      instr = 'LD B,A';
    } else if (b0 === 0x4f) {
      instr = 'LD C,A';
    } else if (b0 === 0x67) {
      instr = 'LD H,A';
    } else if (b0 === 0x6f) {
      instr = 'LD L,A';
    } else if (b0 === 0x7e) {
      instr = 'LD A,(HL)';
    } else if (b0 === 0x77) {
      instr = 'LD (HL),A';
    } else if (b0 === 0x23) {
      instr = 'INC HL';
    } else if (b0 === 0x2b) {
      instr = 'DEC HL';
    } else if (b0 === 0x3c) {
      instr = 'INC A';
    } else if (b0 === 0x3d) {
      instr = 'DEC A';
    } else if (b0 === 0x19) {
      instr = 'ADD HL,DE';
    } else if (b0 === 0x09) {
      instr = 'ADD HL,BC';
    } else if (b0 === 0x87) {
      instr = 'ADD A,A';
    } else if (b0 === 0x80) {
      instr = 'ADD A,B';
    } else if (b0 === 0x81) {
      instr = 'ADD A,C';
    } else if (b0 === 0x82) {
      instr = 'ADD A,D';
    } else if (b0 === 0x83) {
      instr = 'ADD A,E';
    } else if (b0 === 0x84) {
      instr = 'ADD A,H';
    } else if (b0 === 0x85) {
      instr = 'ADD A,L';
    } else if (b0 === 0xc6 && pc < end) {
      instr = `ADD A,${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0xd6 && pc < end) {
      instr = `SUB ${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0xe6 && pc < end) {
      instr = `AND ${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0xf6 && pc < end) {
      instr = `OR ${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0xee && pc < end) {
      instr = `XOR ${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0xfe && pc < end) {
      instr = `CP ${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0xaf) {
      instr = 'XOR A';
    } else if (b0 === 0xa7) {
      instr = 'AND A';
    } else if (b0 === 0xb7) {
      instr = 'OR A';
    } else if (b0 === 0xbf) {
      instr = 'CP A';
    } else if (b0 === 0xb8) {
      instr = 'CP B';
    } else if (b0 === 0xb9) {
      instr = 'CP C';
    } else if (b0 === 0xba) {
      instr = 'CP D';
    } else if (b0 === 0xbb) {
      instr = 'CP E';
    } else if (b0 === 0xbc) {
      instr = 'CP H';
    } else if (b0 === 0xbd) {
      instr = 'CP L';
    } else if (b0 === 0xbe) {
      instr = 'CP (HL)';
    } else if (b0 === 0xcd && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `CALL ${hex(addr)}`;
    } else if (b0 === 0xc3 && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `JP ${hex(addr)}`;
    } else if (b0 === 0xca && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `JP Z,${hex(addr)}`;
    } else if (b0 === 0xc2 && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `JP NZ,${hex(addr)}`;
    } else if (b0 === 0xda && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `JP C,${hex(addr)}`;
    } else if (b0 === 0xd2 && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `JP NC,${hex(addr)}`;
    } else if (b0 === 0x18 && pc < end) {
      const offset = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
      pc++;
      instr = `JR ${hex(pc + offset)}`;
      comment = `(offset ${offset})`;
    } else if (b0 === 0x20 && pc < end) {
      const offset = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
      pc++;
      instr = `JR NZ,${hex(pc + offset)}`;
      comment = `(offset ${offset})`;
    } else if (b0 === 0x28 && pc < end) {
      const offset = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
      pc++;
      instr = `JR Z,${hex(pc + offset)}`;
      comment = `(offset ${offset})`;
    } else if (b0 === 0x30 && pc < end) {
      const offset = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
      pc++;
      instr = `JR NC,${hex(pc + offset)}`;
      comment = `(offset ${offset})`;
    } else if (b0 === 0x38 && pc < end) {
      const offset = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
      pc++;
      instr = `JR C,${hex(pc + offset)}`;
      comment = `(offset ${offset})`;
    } else if (b0 === 0xc5) {
      instr = 'PUSH BC';
    } else if (b0 === 0xd5) {
      instr = 'PUSH DE';
    } else if (b0 === 0xe5) {
      instr = 'PUSH HL';
    } else if (b0 === 0xf5) {
      instr = 'PUSH AF';
    } else if (b0 === 0xc1) {
      instr = 'POP BC';
    } else if (b0 === 0xd1) {
      instr = 'POP DE';
    } else if (b0 === 0xe1) {
      instr = 'POP HL';
    } else if (b0 === 0xf1) {
      instr = 'POP AF';
    } else if (b0 === 0x00) {
      instr = 'NOP';
    } else if (b0 === 0x76) {
      instr = 'HALT';
    } else if (b0 === 0xc0) {
      instr = 'RET NZ';
    } else if (b0 === 0xc8) {
      instr = 'RET Z';
    } else if (b0 === 0xd0) {
      instr = 'RET NC';
    } else if (b0 === 0xd8) {
      instr = 'RET C';
    } else if (b0 === 0xe0) {
      instr = 'RET PO';
    } else if (b0 === 0xe8) {
      instr = 'RET PE';
    } else if (b0 === 0xf0) {
      instr = 'RET P';
    } else if (b0 === 0xf8) {
      instr = 'RET M';
    } else if (b0 === 0xe9) {
      instr = 'JP (HL)';
    } else if (b0 === 0xeb) {
      instr = 'EX DE,HL';
    } else if (b0 === 0xcb && pc < end) {
      const cb = rom[pc++];
      if ((cb & 0xc0) === 0x40) {
        const bit = (cb >> 3) & 7;
        const reg = cb & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        instr = `BIT ${bit},${regNames[reg]}`;
      } else if ((cb & 0xc0) === 0xc0) {
        const bit = (cb >> 3) & 7;
        const reg = cb & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        instr = `SET ${bit},${regNames[reg]}`;
      } else if ((cb & 0xc0) === 0x80) {
        const bit = (cb >> 3) & 7;
        const reg = cb & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        instr = `RES ${bit},${regNames[reg]}`;
      } else if (cb === 0x3f) {
        instr = 'SRL A';
      } else if (cb === 0x27) {
        instr = 'SLA A';
      } else if (cb === 0x07) {
        instr = 'RLC A';
      } else if (cb === 0x0f) {
        instr = 'RRC A';
      } else if (cb === 0x17) {
        instr = 'RL A';
      } else if (cb === 0x1f) {
        instr = 'RR A';
      } else {
        instr = `CB ${hexByte(cb)}`;
      }
    } else if (b0 === 0xed && pc < end) {
      const ed = rom[pc++];
      if (ed === 0x4b && pc + 2 <= end) {
        const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        instr = `LD BC,(${hex(addr)})`;
      } else if (ed === 0x5b && pc + 2 <= end) {
        const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        instr = `LD DE,(${hex(addr)})`;
      } else if (ed === 0x43 && pc + 2 <= end) {
        const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        instr = `LD (${hex(addr)}),BC`;
      } else if (ed === 0x53 && pc + 2 <= end) {
        const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        instr = `LD (${hex(addr)}),DE`;
      } else if (ed === 0x7b && pc + 2 <= end) {
        const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        instr = `LD SP,(${hex(addr)})`;
      } else if (ed === 0x73 && pc + 2 <= end) {
        const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        instr = `LD (${hex(addr)}),SP`;
      } else if (ed === 0xb0) {
        instr = 'LDIR';
      } else if (ed === 0xb8) {
        instr = 'LDDR';
      } else if (ed === 0xa0) {
        instr = 'LDI';
      } else if (ed === 0xa8) {
        instr = 'LDD';
      } else if (ed === 0xb1) {
        instr = 'CPIR';
      } else if (ed === 0xb9) {
        instr = 'CPDR';
      } else {
        instr = `ED ${hexByte(ed)}`;
      }
    } else if (b0 === 0xdd && pc < end) {
      const dd = rom[pc++];
      if (dd === 0xe9) {
        instr = 'JP (IX)';
      } else if (dd === 0x21 && pc + 2 <= end) {
        const imm = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        instr = `LD IX,${hex(imm)}`;
      } else if (dd === 0x7e && pc < end) {
        const d = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
        pc++;
        instr = `LD A,(IX+${d})`;
      } else if (dd === 0x77 && pc < end) {
        const d = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
        pc++;
        instr = `LD (IX+${d}),A`;
      } else if (dd === 0x46 && pc < end) {
        const d = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
        pc++;
        instr = `LD B,(IX+${d})`;
      } else if (dd === 0x4e && pc < end) {
        const d = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
        pc++;
        instr = `LD C,(IX+${d})`;
      } else if (dd === 0x56 && pc < end) {
        const d = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
        pc++;
        instr = `LD D,(IX+${d})`;
      } else if (dd === 0x5e && pc < end) {
        const d = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
        pc++;
        instr = `LD E,(IX+${d})`;
      } else if (dd === 0xe5) {
        instr = 'PUSH IX';
      } else if (dd === 0xe1) {
        instr = 'POP IX';
      } else {
        instr = `DD ${hexByte(dd)}`;
      }
    } else if (b0 === 0xfd && pc < end) {
      const fd = rom[pc++];
      if (fd === 0xe9) {
        instr = 'JP (IY)';
      } else if (fd === 0x7e && pc < end) {
        const d = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
        pc++;
        instr = `LD A,(IY+${d})`;
        const iyTarget = IY_ADDR + d;
        comment = `IY+${d} = ${hex(iyTarget)}`;
      } else if (fd === 0x77 && pc < end) {
        const d = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
        pc++;
        instr = `LD (IY+${d}),A`;
        const iyTarget = IY_ADDR + d;
        comment = `IY+${d} = ${hex(iyTarget)}`;
      } else if (fd === 0xcb && pc + 1 < end) {
        const d = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
        const cb2 = rom[pc + 1];
        pc += 2;
        if ((cb2 & 0xc0) === 0x40) {
          const bit = (cb2 >> 3) & 7;
          instr = `BIT ${bit},(IY+${d})`;
          const iyTarget = IY_ADDR + d;
          comment = `IY+${d} = ${hex(iyTarget)}`;
        } else if ((cb2 & 0xc0) === 0xc0) {
          const bit = (cb2 >> 3) & 7;
          instr = `SET ${bit},(IY+${d})`;
          const iyTarget = IY_ADDR + d;
          comment = `IY+${d} = ${hex(iyTarget)}`;
        } else if ((cb2 & 0xc0) === 0x80) {
          const bit = (cb2 >> 3) & 7;
          instr = `RES ${bit},(IY+${d})`;
          const iyTarget = IY_ADDR + d;
          comment = `IY+${d} = ${hex(iyTarget)}`;
        } else {
          instr = `FD CB ${hexByte(rom[pc - 2])} ${hexByte(cb2)}`;
        }
      } else if (fd === 0xe5) {
        instr = 'PUSH IY';
      } else if (fd === 0xe1) {
        instr = 'POP IY';
      } else if (fd === 0x21 && pc + 2 <= end) {
        const imm = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
        pc += 3;
        instr = `LD IY,${hex(imm)}`;
      } else {
        instr = `FD ${hexByte(fd)}`;
      }
    } else if (b0 === 0x78) {
      instr = 'LD A,B';
    } else if (b0 === 0x79) {
      instr = 'LD A,C';
    } else if (b0 === 0x7a) {
      instr = 'LD A,D';
    } else if (b0 === 0x7b) {
      instr = 'LD A,E';
    } else if (b0 === 0x7c) {
      instr = 'LD A,H';
    } else if (b0 === 0x7d) {
      instr = 'LD A,L';
    } else if (b0 === 0x7f) {
      instr = 'LD A,A';
    } else if (b0 === 0x90) {
      instr = 'SUB B';
    } else if (b0 === 0x91) {
      instr = 'SUB C';
    } else if (b0 === 0xa0) {
      instr = 'AND B';
    } else if (b0 === 0xa1) {
      instr = 'AND C';
    } else if (b0 === 0xa6) {
      instr = 'AND (HL)';
    } else if (b0 === 0xb0) {
      instr = 'OR B';
    } else if (b0 === 0xb1) {
      instr = 'OR C';
    } else if (b0 === 0xb6) {
      instr = 'OR (HL)';
    } else if (b0 === 0xa8) {
      instr = 'XOR B';
    } else if (b0 === 0xa9) {
      instr = 'XOR C';
    } else if (b0 === 0xae) {
      instr = 'XOR (HL)';
    } else if (b0 === 0x04) {
      instr = 'INC B';
    } else if (b0 === 0x05) {
      instr = 'DEC B';
    } else if (b0 === 0x0c) {
      instr = 'INC C';
    } else if (b0 === 0x0d) {
      instr = 'DEC C';
    } else if (b0 === 0x14) {
      instr = 'INC D';
    } else if (b0 === 0x15) {
      instr = 'DEC D';
    } else if (b0 === 0x1c) {
      instr = 'INC E';
    } else if (b0 === 0x1d) {
      instr = 'DEC E';
    } else if (b0 === 0x24) {
      instr = 'INC H';
    } else if (b0 === 0x25) {
      instr = 'DEC H';
    } else if (b0 === 0x2c) {
      instr = 'INC L';
    } else if (b0 === 0x2d) {
      instr = 'DEC L';
    } else if (b0 === 0x34) {
      instr = 'INC (HL)';
    } else if (b0 === 0x35) {
      instr = 'DEC (HL)';
    } else if (b0 === 0x36 && pc < end) {
      instr = `LD (HL),${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0x40) {
      instr = 'LD B,B';
    } else if (b0 === 0x41) {
      instr = 'LD B,C';
    } else if (b0 === 0x42) {
      instr = 'LD B,D';
    } else if (b0 === 0x43) {
      instr = 'LD B,E';
    } else if (b0 === 0x44) {
      instr = 'LD B,H';
    } else if (b0 === 0x45) {
      instr = 'LD B,L';
    } else if (b0 === 0x46) {
      instr = 'LD B,(HL)';
    } else if (b0 === 0x48) {
      instr = 'LD C,B';
    } else if (b0 === 0x49) {
      instr = 'LD C,C';
    } else if (b0 === 0x4a) {
      instr = 'LD C,D';
    } else if (b0 === 0x4b) {
      instr = 'LD C,E';
    } else if (b0 === 0x4c) {
      instr = 'LD C,H';
    } else if (b0 === 0x4d) {
      instr = 'LD C,L';
    } else if (b0 === 0x4e) {
      instr = 'LD C,(HL)';
    } else if (b0 === 0x50) {
      instr = 'LD D,B';
    } else if (b0 === 0x51) {
      instr = 'LD D,C';
    } else if (b0 === 0x52) {
      instr = 'LD D,D';
    } else if (b0 === 0x53) {
      instr = 'LD D,E';
    } else if (b0 === 0x54) {
      instr = 'LD D,H';
    } else if (b0 === 0x55) {
      instr = 'LD D,L';
    } else if (b0 === 0x56) {
      instr = 'LD D,(HL)';
    } else if (b0 === 0x58) {
      instr = 'LD E,B';
    } else if (b0 === 0x59) {
      instr = 'LD E,C';
    } else if (b0 === 0x5a) {
      instr = 'LD E,D';
    } else if (b0 === 0x5b) {
      instr = 'LD E,E';
    } else if (b0 === 0x5c) {
      instr = 'LD E,H';
    } else if (b0 === 0x5d) {
      instr = 'LD E,L';
    } else if (b0 === 0x5e) {
      instr = 'LD E,(HL)';
    } else if (b0 === 0x60) {
      instr = 'LD H,B';
    } else if (b0 === 0x61) {
      instr = 'LD H,C';
    } else if (b0 === 0x62) {
      instr = 'LD H,D';
    } else if (b0 === 0x63) {
      instr = 'LD H,E';
    } else if (b0 === 0x64) {
      instr = 'LD H,H';
    } else if (b0 === 0x65) {
      instr = 'LD H,L';
    } else if (b0 === 0x66) {
      instr = 'LD H,(HL)';
    } else if (b0 === 0x68) {
      instr = 'LD L,B';
    } else if (b0 === 0x69) {
      instr = 'LD L,C';
    } else if (b0 === 0x6a) {
      instr = 'LD L,D';
    } else if (b0 === 0x6b) {
      instr = 'LD L,E';
    } else if (b0 === 0x6c) {
      instr = 'LD L,H';
    } else if (b0 === 0x6d) {
      instr = 'LD L,L';
    } else if (b0 === 0x6e) {
      instr = 'LD L,(HL)';
    } else if (b0 === 0x03) {
      instr = 'INC BC';
    } else if (b0 === 0x0b) {
      instr = 'DEC BC';
    } else if (b0 === 0x13) {
      instr = 'INC DE';
    } else if (b0 === 0x1b) {
      instr = 'DEC DE';
    } else if (b0 === 0x33) {
      instr = 'INC SP';
    } else if (b0 === 0x3b) {
      instr = 'DEC SP';
    } else if (b0 === 0x37) {
      instr = 'SCF';
    } else if (b0 === 0x3f) {
      instr = 'CCF';
    } else if (b0 === 0x2f) {
      instr = 'CPL';
    } else if (b0 === 0x17) {
      instr = 'RLA';
    } else if (b0 === 0x1f) {
      instr = 'RRA';
    } else if (b0 === 0x07) {
      instr = 'RLCA';
    } else if (b0 === 0x0f) {
      instr = 'RRCA';
    } else if (b0 === 0x27) {
      instr = 'DAA';
    } else if (b0 === 0x10 && pc < end) {
      const offset = rom[pc] > 127 ? rom[pc] - 256 : rom[pc];
      pc++;
      instr = `DJNZ ${hex(pc + offset)}`;
      comment = `(offset ${offset})`;
    } else if (b0 === 0x08) {
      instr = 'EX AF,AF\'';
    } else if (b0 === 0xd9) {
      instr = 'EXX';
    } else if (b0 === 0xf3) {
      instr = 'DI';
    } else if (b0 === 0xfb) {
      instr = 'EI';
    } else if (b0 === 0x2a && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD HL,(${hex(addr)})`;
    } else if (b0 === 0x22 && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD (${hex(addr)}),HL`;
    } else if (b0 === 0x0a) {
      instr = 'LD A,(BC)';
    } else if (b0 === 0x1a) {
      instr = 'LD A,(DE)';
    } else if (b0 === 0x02) {
      instr = 'LD (BC),A';
    } else if (b0 === 0x12) {
      instr = 'LD (DE),A';
    } else if (b0 === 0xcc && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `CALL Z,${hex(addr)}`;
    } else if (b0 === 0xc4 && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `CALL NZ,${hex(addr)}`;
    } else if (b0 === 0xdc && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `CALL C,${hex(addr)}`;
    } else if (b0 === 0xd4 && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `CALL NC,${hex(addr)}`;
    } else if (b0 === 0xc7) {
      instr = 'RST 0x00';
    } else if (b0 === 0xcf) {
      instr = 'RST 0x08';
    } else if (b0 === 0xd7) {
      instr = 'RST 0x10';
    } else if (b0 === 0xdf) {
      instr = 'RST 0x18';
    } else if (b0 === 0xe7) {
      instr = 'RST 0x20';
    } else if (b0 === 0xef) {
      instr = 'RST 0x28';
    } else if (b0 === 0xf7) {
      instr = 'RST 0x30';
    } else if (b0 === 0xff) {
      instr = 'RST 0x38';
    } else {
      instr = `DB ${hexByte(b0)}`;
      comment = '(unknown opcode)';
    }

    const bytesUsed = pc - instrStart;
    const rawBytes = [];
    for (let i = instrStart; i < pc; i++) rawBytes.push(hexByte(rom[i]));

    console.log(`  ${hex(instrStart)}: ${rawBytes.join(' ').padEnd(20)} ${instr.padEnd(30)} ${comment}`);

    // Stop after two consecutive RETs or if we've clearly gone past the function
    if (b0 === 0xc9 && pc >= end) break;
  }
}

// ─── Part 2: Dump table at 0x03FC41 ───

function dumpTable() {
  console.log('\n--- Part 2: Table dump at 0x03FC41 (96 bytes) ---');

  const tableStart = TABLE_ADDR;
  const tableLen = 96;

  for (let row = 0; row < tableLen; row += 16) {
    const rowStart = tableStart + row;
    const bytes = [];
    for (let i = 0; i < 16 && row + i < tableLen; i++) {
      bytes.push(hexByte(rom[rowStart + i]));
    }
    console.log(`  ${hex(rowStart)}: ${bytes.join(' ')}`);
  }

  // Analyze structure: look for pairs or other patterns
  console.log('\nTable analysis:');

  // Check if it's pairs (key, value)
  console.log('  As byte pairs (index, value):');
  for (let i = 0; i < tableLen && tableStart + i < rom.length; i += 2) {
    if (i >= 64) {
      console.log('  ... (truncated at 32 pairs)');
      break;
    }
    const b1 = rom[tableStart + i];
    const b2 = rom[tableStart + i + 1];
    console.log(`    pair[${i / 2}]: ${hexByte(b1)}, ${hexByte(b2)}`);
  }

  // Also check for a terminator (0x00 or 0xFF)
  let tableEnd = tableLen;
  for (let i = 0; i < tableLen; i++) {
    if (rom[tableStart + i] === 0x00 && rom[tableStart + i + 1] === 0x00) {
      tableEnd = i;
      console.log(`\n  Possible table end (00 00) at offset ${i} (${hex(tableStart + i)})`);
      break;
    }
  }

  // Check if it's a simple lookup (A used as index)
  console.log('\n  As single-byte entries (indexed by value in A):');
  for (let i = 0; i < Math.min(32, tableLen); i++) {
    console.log(`    [${i}] = ${hexByte(rom[tableStart + i])}`);
  }
}

// ─── Part 3: Disassemble setter at 0x03FC0F ───

function disassembleSetter() {
  console.log('\n--- Part 3: Disassembly of setter at 0x03FC0F..0x03FC1B ---');
  console.log('Raw bytes:\n');

  const start = SETTER_ADDR;
  const end = FUNC_ADDR; // ends right before the reader

  const bytes = [];
  for (let i = start; i < end; i++) {
    bytes.push(hexByte(rom[i]));
  }
  console.log(`  ${hex(start)}: ${bytes.join(' ')}`);

  // Simple decode
  console.log('\nDecoded:');
  let pc = start;
  while (pc < end) {
    const instrStart = pc;
    const b0 = rom[pc++];
    let instr = '';
    let comment = '';

    if (b0 === 0xc9) {
      instr = 'RET';
    } else if (b0 === 0x32 && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD (${hex(addr)}),A`;
      if (addr === D0058D_ADDR) comment = '<--- writes D0058D';
    } else if (b0 === 0x3a && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD A,(${hex(addr)})`;
      if (addr === D0058D_ADDR) comment = '<--- reads D0058D';
    } else if (b0 === 0x3e && pc < end) {
      instr = `LD A,${hexByte(rom[pc])}`;
      pc++;
    } else if (b0 === 0x21 && pc + 2 <= end) {
      const imm = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `LD HL,${hex(imm)}`;
    } else if (b0 === 0x77) {
      instr = 'LD (HL),A';
    } else if (b0 === 0x7e) {
      instr = 'LD A,(HL)';
    } else if (b0 === 0xaf) {
      instr = 'XOR A';
    } else if (b0 === 0xcd && pc + 2 <= end) {
      const addr = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      pc += 3;
      instr = `CALL ${hex(addr)}`;
    } else {
      instr = `DB ${hexByte(b0)}`;
    }

    const rawBytes = [];
    for (let i = instrStart; i < pc; i++) rawBytes.push(hexByte(rom[i]));
    console.log(`  ${hex(instrStart)}: ${rawBytes.join(' ').padEnd(20)} ${instr.padEnd(30)} ${comment}`);
  }
}

// ─── Part 4: Find callers ───

function findCallers() {
  console.log('\n--- Part 4: Find callers of 0x03FC1C ---');

  // CALL 0x03FC1C = CD 1C FC 03
  const callPattern = [0xcd, 0x1c, 0xfc, 0x03];
  const jpPattern = [0xc3, 0x1c, 0xfc, 0x03];

  const callSites = [];
  const jpSites = [];

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === callPattern[0] && rom[i + 1] === callPattern[1] &&
        rom[i + 2] === callPattern[2] && rom[i + 3] === callPattern[3]) {
      callSites.push(hex(i));
    }
    if (rom[i] === jpPattern[0] && rom[i + 1] === jpPattern[1] &&
        rom[i + 2] === jpPattern[2] && rom[i + 3] === jpPattern[3]) {
      jpSites.push(hex(i));
    }
  }

  console.log(`  CALL 0x03FC1C sites (${callSites.length}):`);
  for (const site of callSites) {
    console.log(`    ${site}`);
  }

  console.log(`  JP 0x03FC1C sites (${jpSites.length}):`);
  for (const site of jpSites) {
    console.log(`    ${site}`);
  }

  // Also find callers of the setter at 0x03FC0F
  console.log('\n  Also finding callers of setter 0x03FC0F:');
  const callSetterPattern = [0xcd, 0x0f, 0xfc, 0x03];
  const jpSetterPattern = [0xc3, 0x0f, 0xfc, 0x03];

  const callSetterSites = [];
  const jpSetterSites = [];

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === callSetterPattern[0] && rom[i + 1] === callSetterPattern[1] &&
        rom[i + 2] === callSetterPattern[2] && rom[i + 3] === callSetterPattern[3]) {
      callSetterSites.push(hex(i));
    }
    if (rom[i] === jpSetterPattern[0] && rom[i + 1] === jpSetterPattern[1] &&
        rom[i + 2] === jpSetterPattern[2] && rom[i + 3] === jpSetterPattern[3]) {
      jpSetterSites.push(hex(i));
    }
  }

  console.log(`  CALL 0x03FC0F sites (${callSetterSites.length}):`);
  for (const site of callSetterSites) {
    console.log(`    ${site}`);
  }
  console.log(`  JP 0x03FC0F sites (${jpSetterSites.length}):`);
  for (const site of jpSetterSites) {
    console.log(`    ${site}`);
  }

  return { callSites, jpSites, callSetterSites, jpSetterSites };
}

// ─── Part 5: Dynamic trace ───

function dynamicTrace() {
  console.log('\n--- Part 5: Dynamic trace of 0x03FC1C with various D0058D values ---');

  const testValues = [
    { name: "digit '1'", value: 0x8f },
    { name: 'LOG', value: 0x76 },
    { name: '0x5B', value: 0x5b },
    { name: "letter 'A'", value: 0x9a },
    { name: "'+'", value: 0x80 },
    { name: '0x00 (no key)', value: 0x00 },
    { name: '0xFF', value: 0xff },
    { name: '0x01', value: 0x01 },
  ];

  for (const test of testValues) {
    const mem = createMemoryWithRom();
    const { executor, cpu } = createRuntime(mem);

    // Set up CPU state
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = 1;
    cpu.mbase = MBASE;
    cpu.iy = IY_ADDR;
    cpu.ix = IX_ADDR;
    cpu.sp = DEFAULT_STACK_TOP;

    // Set D0058D to the test value
    mem[D0058D_ADDR] = test.value & 0xff;

    // Push sentinel return address
    cpu.sp -= 3;
    write24(mem, cpu.sp, SENTINEL_RET);

    const blocksVisited = [];
    const ramReads = [];
    const ramWrites = [];

    let returned = false;
    let finalA = null;
    let finalHL = null;
    let result = null;

    // Intercept memory accesses by watching key areas
    const memBefore = new Uint8Array(32);
    // Snapshot D00580..D005BF area
    for (let i = 0; i < 32; i++) {
      memBefore[i] = mem[0xd00580 + i];
    }

    try {
      result = executor.runFrom(FUNC_ADDR, 'adl', {
        maxSteps: 100,
        maxLoopIterations: 50,
        onBlock(pc) {
          blocksVisited.push(hex(pc & 0xffffff));
          if ((pc & 0xffffff) === SENTINEL_RET) {
            finalA = cpu.a & 0xff;
            finalHL = ((cpu.h & 0xff) << 16) | ((cpu.l ?? 0) & 0xffff);
            // Try to read HL as a 24-bit value
            if (typeof cpu.hl === 'number') finalHL = cpu.hl & 0xffffff;
            throw makeStop('returned', hex(pc));
          }
        },
        onMissingBlock(pc) {
          if ((pc & 0xffffff) === SENTINEL_RET) {
            finalA = cpu.a & 0xff;
            if (typeof cpu.hl === 'number') finalHL = cpu.hl & 0xffffff;
            throw makeStop('returned', hex(pc));
          }
        },
      });
    } catch (error) {
      if (error?.message === '__PHASE226_STOP__' && error.stopName === 'returned') {
        returned = true;
      } else {
        console.log(`  [${test.name}] ERROR: ${error?.message ?? error}`);
        continue;
      }
    }

    // Check what changed in RAM
    const changes = [];
    for (let i = 0; i < 32; i++) {
      if (mem[0xd00580 + i] !== memBefore[i]) {
        changes.push({
          addr: hex(0xd00580 + i),
          old: hexByte(memBefore[i]),
          new: hexByte(mem[0xd00580 + i]),
        });
      }
    }

    console.log(`\n  [${test.name}] D0058D=${hexByte(test.value)}:`);
    console.log(`    Returned: ${returned}`);
    console.log(`    A after return: ${finalA !== null ? hexByte(finalA) : 'N/A'}`);
    console.log(`    HL after return: ${finalHL !== null ? hex(finalHL) : 'N/A'}`);
    console.log(`    Steps: ${result?.steps ?? 'N/A'}`);
    console.log(`    Blocks visited: ${blocksVisited.join(', ')}`);
    if (changes.length > 0) {
      console.log(`    RAM changes (D00580..D005AF):`);
      for (const ch of changes) {
        console.log(`      ${ch.addr}: ${ch.old} -> ${ch.new}`);
      }
    } else {
      console.log(`    No RAM changes in D00580..D005AF range.`);
    }
  }
}

// ─── Part 6: Cross-reference D0058D ───

function crossRefD0058D() {
  console.log('\n--- Part 6: Cross-reference D0058D (0xD0058D) in ROM ---');

  const target = [0x8d, 0x05, 0xd0]; // little-endian
  const hits = [];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] !== target[0] || rom[i + 1] !== target[1] || rom[i + 2] !== target[2]) continue;

    let type = 'UNKNOWN';
    let instruction = '';

    if (i >= 1) {
      const prev = rom[i - 1];
      if (prev === 0x3a) { type = 'READ'; instruction = 'LD A,(D0058D)'; }
      else if (prev === 0x32) { type = 'WRITE'; instruction = 'LD (D0058D),A'; }
      else if (prev === 0x2a) { type = 'READ'; instruction = 'LD HL,(D0058D)'; }
      else if (prev === 0x22) { type = 'WRITE'; instruction = 'LD (D0058D),HL'; }
      else if (prev === 0x21) { type = 'POINTER'; instruction = 'LD HL,D0058D'; }
    }

    if (type === 'UNKNOWN' && i >= 2) {
      const prev2 = rom[i - 2];
      const prev1 = rom[i - 1];
      if (prev2 === 0xed) {
        if (prev1 === 0x4b) { type = 'READ'; instruction = 'LD BC,(D0058D)'; }
        else if (prev1 === 0x5b) { type = 'READ'; instruction = 'LD DE,(D0058D)'; }
        else if (prev1 === 0x43) { type = 'WRITE'; instruction = 'LD (D0058D),BC'; }
        else if (prev1 === 0x53) { type = 'WRITE'; instruction = 'LD (D0058D),DE'; }
      }
    }

    hits.push({
      addr: hex(i - (type !== 'UNKNOWN' && i >= 2 && rom[i - 2] === 0xed ? 2 : 1)),
      patternOffset: hex(i),
      type,
      instruction: instruction || `(prev byte: ${hexByte(rom[i - 1] ?? 0)})`,
    });
  }

  const writeCount = hits.filter((h) => h.type === 'WRITE').length;
  const readCount = hits.filter((h) => h.type === 'READ').length;
  const pointerCount = hits.filter((h) => h.type === 'POINTER').length;
  const unknownCount = hits.filter((h) => h.type === 'UNKNOWN').length;

  console.log(`  Total references: ${hits.length}`);
  console.log(`  WRITE: ${writeCount}, READ: ${readCount}, POINTER: ${pointerCount}, UNKNOWN: ${unknownCount}\n`);

  for (const hit of hits) {
    console.log(`  ${hit.addr}: ${hit.instruction} [${hit.type}]`);
  }

  // Also check D0058E
  console.log('\n  Also checking D0058E (0xD0058E) references:');
  const target2 = [0x8e, 0x05, 0xd0];
  let d0058eCount = 0;
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === target2[0] && rom[i + 1] === target2[1] && rom[i + 2] === target2[2]) {
      d0058eCount++;
      let type = 'UNKNOWN';
      let instr = '';
      if (i >= 1) {
        const prev = rom[i - 1];
        if (prev === 0x3a) { type = 'READ'; instr = 'LD A,(D0058E)'; }
        else if (prev === 0x32) { type = 'WRITE'; instr = 'LD (D0058E),A'; }
        else if (prev === 0x2a) { type = 'READ'; instr = 'LD HL,(D0058E)'; }
        else if (prev === 0x22) { type = 'WRITE'; instr = 'LD (D0058E),HL'; }
        else if (prev === 0x21) { type = 'POINTER'; instr = 'LD HL,D0058E'; }
      }
      console.log(`  ${hex(i - 1)}: ${instr || `(prev: ${hexByte(rom[i - 1])})`} [${type}]`);
    }
  }
  console.log(`  D0058E total: ${d0058eCount}`);

  return { d0058dHits: hits, writeCount, readCount };
}

// ─── Main ───

function main() {
  console.log('=== Phase 226: 0x03FC1C (D0058D Table Reader) Investigation ===');
  console.log('Hypothesis: 0x03FC1C reads D0058D and uses it as index into table at 0x03FC41.\n');

  staticDisassembly();
  dumpTable();
  disassembleSetter();
  const callers = findCallers();
  dynamicTrace();
  const xrefs = crossRefD0058D();

  console.log('\n=== Phase 226 Summary ===');
  console.log(`  Callers of 0x03FC1C: ${callers.callSites.length} CALL + ${callers.jpSites.length} JP`);
  console.log(`  Callers of 0x03FC0F (setter): ${callers.callSetterSites.length} CALL + ${callers.jpSetterSites.length} JP`);
  console.log(`  D0058D references: ${xrefs.d0058dHits.length} total (${xrefs.writeCount} write, ${xrefs.readCount} read)`);
  console.log('\n=== Phase 226 Complete ===');
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase226-03fc1c-table-reader.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
