#!/usr/bin/env node

/**
 * Phase 25AS: Static disassembly of common-tail pre-ParseInp calls + runtime trace.
 *
 * Part 1 — STATIC disassembly (ROM bytes, no execution):
 *   - 0x082961 (~200 bytes) — called from common tail ~0x0586A3
 *   - 0x09215E (~150 bytes) — called from common tail ~0x0586B3
 *   - 0x058693–0x058700 — entire common tail up to ParseInp and beyond
 *
 * Part 2 — RUNTIME trace of 0x058693 for 10K steps:
 *   - Standard setup: MEM_INIT, allocator pointers, tokenized "2+3", error frame
 *   - Log call/jump targets, check 0x0586CC JR NZ branch, check ParseInp reachability
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25as-common-tail-disasm-report.md');

const rom = readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0xfffff6;
const FAKE_RET = 0xfffffe;
const DEFAULT_MAX_LOOP_ITER = 8192;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const POP_ERROR_HANDLER = 0x061dd1;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const COMMON_TAIL_PC = 0x058693;
const PARSEINP_TRAMPOLINE = 0x099910;
const PARSEINP_PC = 0x099914;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

// ─── Helpers ───

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function write16(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push(hexByte(mem[addr + i]));
  }
  return parts.join(' ');
}

function signedByte(b) {
  return b < 128 ? b : b - 256;
}

// ─── Static Disassembler ───
// Decodes eZ80 instructions in ADL mode (24-bit default operand width).
// Returns array of { pc, bytes, mnemonic, length } objects.

function disassembleRange(romBuf, startAddr, maxBytes) {
  const instructions = [];
  let pc = startAddr;
  const endAddr = startAddr + maxBytes;

  while (pc < endAddr) {
    const instr = decodeOneInstruction(romBuf, pc);
    instructions.push(instr);
    if (instr.isRet) break; // stop at RET for function boundaries
    pc = instr.nextPc;
  }

  return instructions;
}

function disassembleRangeNoStop(romBuf, startAddr, maxBytes) {
  const instructions = [];
  let pc = startAddr;
  const endAddr = startAddr + maxBytes;

  while (pc < endAddr) {
    const instr = decodeOneInstruction(romBuf, pc);
    instructions.push(instr);
    pc = instr.nextPc;
  }

  return instructions;
}

function decodeOneInstruction(romBuf, pc) {
  const startPc = pc;
  let op = romBuf[pc];

  // Mode prefix check (SIS/SIL/LIS/LIL)
  let modePrefix = null;
  if (op === 0x40) { modePrefix = 'SIS'; op = romBuf[++pc]; }
  else if (op === 0x52) { modePrefix = 'SIL'; op = romBuf[++pc]; }
  else if (op === 0x49) { modePrefix = 'LIS'; op = romBuf[++pc]; }
  else if (op === 0x5B) { modePrefix = 'LIL'; op = romBuf[++pc]; }

  // Determine immediate width: ADL default = 3, SIS/LIS = 2, SIL/LIL = 3
  const immW = (modePrefix === 'SIS' || modePrefix === 'LIS') ? 2 : 3;

  const prefixStr = modePrefix ? `${modePrefix} ` : '';

  // NOP
  if (op === 0x00) {
    return mkInstr(startPc, pc + 1, `${prefixStr}NOP`, romBuf);
  }

  // RET variants
  if (op === 0xC9) return mkInstr(startPc, pc + 1, `${prefixStr}RET`, romBuf, true);
  if (op === 0xC0) return mkInstr(startPc, pc + 1, `${prefixStr}RET NZ`, romBuf, true);
  if (op === 0xC8) return mkInstr(startPc, pc + 1, `${prefixStr}RET Z`, romBuf, true);
  if (op === 0xD0) return mkInstr(startPc, pc + 1, `${prefixStr}RET NC`, romBuf, true);
  if (op === 0xD8) return mkInstr(startPc, pc + 1, `${prefixStr}RET C`, romBuf, true);
  if (op === 0xE0) return mkInstr(startPc, pc + 1, `${prefixStr}RET PO`, romBuf, true);
  if (op === 0xE8) return mkInstr(startPc, pc + 1, `${prefixStr}RET PE`, romBuf, true);
  if (op === 0xF0) return mkInstr(startPc, pc + 1, `${prefixStr}RET P`, romBuf, true);
  if (op === 0xF8) return mkInstr(startPc, pc + 1, `${prefixStr}RET M`, romBuf, true);

  // CALL nn
  if (op === 0xCD) {
    const addr = readLE(romBuf, pc + 1, immW);
    return mkInstr(startPc, pc + 1 + immW, `${prefixStr}CALL ${hex(addr)}`, romBuf);
  }

  // CALL cc, nn
  const callConds = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
  if (callConds[op]) {
    const addr = readLE(romBuf, pc + 1, immW);
    return mkInstr(startPc, pc + 1 + immW, `${prefixStr}CALL ${callConds[op]},${hex(addr)}`, romBuf);
  }

  // JP nn
  if (op === 0xC3) {
    const addr = readLE(romBuf, pc + 1, immW);
    return mkInstr(startPc, pc + 1 + immW, `${prefixStr}JP ${hex(addr)}`, romBuf);
  }

  // JP cc, nn
  const jpConds = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
  if (jpConds[op]) {
    const addr = readLE(romBuf, pc + 1, immW);
    return mkInstr(startPc, pc + 1 + immW, `${prefixStr}JP ${jpConds[op]},${hex(addr)}`, romBuf);
  }

  // JP (HL)
  if (op === 0xE9) return mkInstr(startPc, pc + 1, `${prefixStr}JP (HL)`, romBuf);

  // JR d
  if (op === 0x18) {
    const d = signedByte(romBuf[pc + 1]);
    const target = (pc + 2 + d) & 0xffffff;
    return mkInstr(startPc, pc + 2, `${prefixStr}JR ${hex(target)} (d=${d})`, romBuf);
  }

  // JR cc, d
  const jrConds = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' };
  if (jrConds[op]) {
    const d = signedByte(romBuf[pc + 1]);
    const target = (pc + 2 + d) & 0xffffff;
    return mkInstr(startPc, pc + 2, `${prefixStr}JR ${jrConds[op]},${hex(target)} (d=${d})`, romBuf);
  }

  // DJNZ d
  if (op === 0x10) {
    const d = signedByte(romBuf[pc + 1]);
    const target = (pc + 2 + d) & 0xffffff;
    return mkInstr(startPc, pc + 2, `${prefixStr}DJNZ ${hex(target)} (d=${d})`, romBuf);
  }

  // RST
  if ((op & 0xC7) === 0xC7) {
    const vec = op & 0x38;
    return mkInstr(startPc, pc + 1, `${prefixStr}RST ${hex(vec, 2)}`, romBuf);
  }

  // PUSH/POP
  const regs16push = ['BC', 'DE', 'HL', 'AF'];
  if ((op & 0xCF) === 0xC5) {
    const r = regs16push[(op >> 4) & 3];
    return mkInstr(startPc, pc + 1, `${prefixStr}PUSH ${r}`, romBuf);
  }
  if ((op & 0xCF) === 0xC1) {
    const r = regs16push[(op >> 4) & 3];
    return mkInstr(startPc, pc + 1, `${prefixStr}POP ${r}`, romBuf);
  }

  // LD r16, nn
  const ldRegs16 = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
  if (ldRegs16[op]) {
    const val = readLE(romBuf, pc + 1, immW);
    return mkInstr(startPc, pc + 1 + immW, `${prefixStr}LD ${ldRegs16[op]},${hex(val)}`, romBuf);
  }

  // LD A, (nn) / LD (nn), A
  if (op === 0x3A) {
    const addr = readLE(romBuf, pc + 1, immW);
    return mkInstr(startPc, pc + 1 + immW, `${prefixStr}LD A,(${hex(addr)})`, romBuf);
  }
  if (op === 0x32) {
    const addr = readLE(romBuf, pc + 1, immW);
    return mkInstr(startPc, pc + 1 + immW, `${prefixStr}LD (${hex(addr)}),A`, romBuf);
  }

  // LD (HL), n
  if (op === 0x36) {
    const val = romBuf[pc + 1];
    return mkInstr(startPc, pc + 2, `${prefixStr}LD (HL),${hex(val, 2)}`, romBuf);
  }

  // LD A, n
  if (op === 0x3E) {
    const val = romBuf[pc + 1];
    return mkInstr(startPc, pc + 2, `${prefixStr}LD A,${hex(val, 2)}`, romBuf);
  }

  // LD r, n (8-bit immediate)
  if ((op & 0xC7) === 0x06 && op !== 0x36) {
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7];
    const val = romBuf[pc + 1];
    return mkInstr(startPc, pc + 2, `${prefixStr}LD ${r},${hex(val, 2)}`, romBuf);
  }

  // LD r, r' (8-bit register to register)
  if ((op & 0xC0) === 0x40 && op !== 0x76) {
    const r1 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7];
    const r2 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
    return mkInstr(startPc, pc + 1, `${prefixStr}LD ${r1},${r2}`, romBuf);
  }

  // HALT
  if (op === 0x76) return mkInstr(startPc, pc + 1, `${prefixStr}HALT`, romBuf);

  // ALU A, r
  const aluOps = ['ADD', 'ADC', 'SUB', 'SBC', 'AND', 'XOR', 'OR', 'CP'];
  if ((op & 0xC0) === 0x80) {
    const aluOp = aluOps[(op >> 3) & 7];
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
    return mkInstr(startPc, pc + 1, `${prefixStr}${aluOp} A,${r}`, romBuf);
  }

  // ALU A, n (immediate)
  const aluImm = { 0xC6: 'ADD', 0xCE: 'ADC', 0xD6: 'SUB', 0xDE: 'SBC', 0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR', 0xFE: 'CP' };
  if (aluImm[op]) {
    const val = romBuf[pc + 1];
    return mkInstr(startPc, pc + 2, `${prefixStr}${aluImm[op]} A,${hex(val, 2)}`, romBuf);
  }

  // INC/DEC r8
  if ((op & 0xC7) === 0x04) {
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7];
    return mkInstr(startPc, pc + 1, `${prefixStr}INC ${r}`, romBuf);
  }
  if ((op & 0xC7) === 0x05) {
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op >> 3) & 7];
    return mkInstr(startPc, pc + 1, `${prefixStr}DEC ${r}`, romBuf);
  }

  // INC/DEC r16
  if ((op & 0xCF) === 0x03) {
    const r = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    return mkInstr(startPc, pc + 1, `${prefixStr}INC ${r}`, romBuf);
  }
  if ((op & 0xCF) === 0x0B) {
    const r = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    return mkInstr(startPc, pc + 1, `${prefixStr}DEC ${r}`, romBuf);
  }

  // ADD HL, r16
  if ((op & 0xCF) === 0x09) {
    const r = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    return mkInstr(startPc, pc + 1, `${prefixStr}ADD HL,${r}`, romBuf);
  }

  // LD (BC/DE), A and LD A, (BC/DE)
  if (op === 0x02) return mkInstr(startPc, pc + 1, `${prefixStr}LD (BC),A`, romBuf);
  if (op === 0x12) return mkInstr(startPc, pc + 1, `${prefixStr}LD (DE),A`, romBuf);
  if (op === 0x0A) return mkInstr(startPc, pc + 1, `${prefixStr}LD A,(BC)`, romBuf);
  if (op === 0x1A) return mkInstr(startPc, pc + 1, `${prefixStr}LD A,(DE)`, romBuf);

  // LD (nn), HL / LD HL, (nn)
  if (op === 0x22) {
    const addr = readLE(romBuf, pc + 1, immW);
    return mkInstr(startPc, pc + 1 + immW, `${prefixStr}LD (${hex(addr)}),HL`, romBuf);
  }
  if (op === 0x2A) {
    const addr = readLE(romBuf, pc + 1, immW);
    return mkInstr(startPc, pc + 1 + immW, `${prefixStr}LD HL,(${hex(addr)})`, romBuf);
  }

  // Rotates A
  if (op === 0x07) return mkInstr(startPc, pc + 1, `${prefixStr}RLCA`, romBuf);
  if (op === 0x0F) return mkInstr(startPc, pc + 1, `${prefixStr}RRCA`, romBuf);
  if (op === 0x17) return mkInstr(startPc, pc + 1, `${prefixStr}RLA`, romBuf);
  if (op === 0x1F) return mkInstr(startPc, pc + 1, `${prefixStr}RRA`, romBuf);

  // Misc single-byte
  if (op === 0x27) return mkInstr(startPc, pc + 1, `${prefixStr}DAA`, romBuf);
  if (op === 0x2F) return mkInstr(startPc, pc + 1, `${prefixStr}CPL`, romBuf);
  if (op === 0x37) return mkInstr(startPc, pc + 1, `${prefixStr}SCF`, romBuf);
  if (op === 0x3F) return mkInstr(startPc, pc + 1, `${prefixStr}CCF`, romBuf);
  if (op === 0xF3) return mkInstr(startPc, pc + 1, `${prefixStr}DI`, romBuf);
  if (op === 0xFB) return mkInstr(startPc, pc + 1, `${prefixStr}EI`, romBuf);

  // EX DE, HL
  if (op === 0xEB) return mkInstr(startPc, pc + 1, `${prefixStr}EX DE,HL`, romBuf);
  // EX AF, AF'
  if (op === 0x08) return mkInstr(startPc, pc + 1, `${prefixStr}EX AF,AF'`, romBuf);
  // EXX
  if (op === 0xD9) return mkInstr(startPc, pc + 1, `${prefixStr}EXX`, romBuf);
  // EX (SP), HL
  if (op === 0xE3) return mkInstr(startPc, pc + 1, `${prefixStr}EX (SP),HL`, romBuf);

  // LD SP, HL
  if (op === 0xF9) return mkInstr(startPc, pc + 1, `${prefixStr}LD SP,HL`, romBuf);

  // OUT (n), A / IN A, (n)
  if (op === 0xD3) {
    const port = romBuf[pc + 1];
    return mkInstr(startPc, pc + 2, `${prefixStr}OUT (${hex(port, 2)}),A`, romBuf);
  }
  if (op === 0xDB) {
    const port = romBuf[pc + 1];
    return mkInstr(startPc, pc + 2, `${prefixStr}IN A,(${hex(port, 2)})`, romBuf);
  }

  // CB prefix — bit ops
  if (op === 0xCB) {
    const cb = romBuf[pc + 1];
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][cb & 7];
    const bit = (cb >> 3) & 7;
    const group = (cb >> 6) & 3;
    const rotOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    if (group === 0) return mkInstr(startPc, pc + 2, `${prefixStr}${rotOps[bit]} ${r}`, romBuf);
    if (group === 1) return mkInstr(startPc, pc + 2, `${prefixStr}BIT ${bit},${r}`, romBuf);
    if (group === 2) return mkInstr(startPc, pc + 2, `${prefixStr}RES ${bit},${r}`, romBuf);
    return mkInstr(startPc, pc + 2, `${prefixStr}SET ${bit},${r}`, romBuf);
  }

  // DD prefix — IX ops
  if (op === 0xDD) {
    return decodeIndexed(romBuf, startPc, pc + 1, 'IX', prefixStr, immW);
  }

  // FD prefix — IY ops
  if (op === 0xFD) {
    return decodeIndexed(romBuf, startPc, pc + 1, 'IY', prefixStr, immW);
  }

  // ED prefix — extended ops
  if (op === 0xED) {
    return decodeED(romBuf, startPc, pc + 1, prefixStr, immW);
  }

  // Fallback: unknown
  return mkInstr(startPc, pc + 1, `${prefixStr}DB ${hex(op, 2)}`, romBuf);
}

function decodeIndexed(romBuf, startPc, edPc, reg, prefixStr, immW) {
  const op = romBuf[edPc];

  // IX/IY CB prefix: FD CB dd xx
  if (op === 0xCB) {
    const d = signedByte(romBuf[edPc + 1]);
    const cb = romBuf[edPc + 2];
    const bit = (cb >> 3) & 7;
    const group = (cb >> 6) & 3;
    if (group === 1) return mkInstr(startPc, edPc + 3, `${prefixStr}BIT ${bit},(${reg}+${d})`, romBuf);
    if (group === 2) return mkInstr(startPc, edPc + 3, `${prefixStr}RES ${bit},(${reg}+${d})`, romBuf);
    if (group === 3) return mkInstr(startPc, edPc + 3, `${prefixStr}SET ${bit},(${reg}+${d})`, romBuf);
    const rotOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return mkInstr(startPc, edPc + 3, `${prefixStr}${rotOps[bit]} (${reg}+${d})`, romBuf);
  }

  // LD IX/IY, nn
  if (op === 0x21) {
    const val = readLE(romBuf, edPc + 1, immW);
    return mkInstr(startPc, edPc + 1 + immW, `${prefixStr}LD ${reg},${hex(val)}`, romBuf);
  }

  // LD (nn), IX/IY
  if (op === 0x22) {
    const addr = readLE(romBuf, edPc + 1, immW);
    return mkInstr(startPc, edPc + 1 + immW, `${prefixStr}LD (${hex(addr)}),${reg}`, romBuf);
  }

  // LD IX/IY, (nn)
  if (op === 0x2A) {
    const addr = readLE(romBuf, edPc + 1, immW);
    return mkInstr(startPc, edPc + 1 + immW, `${prefixStr}LD ${reg},(${hex(addr)})`, romBuf);
  }

  // INC/DEC IX/IY
  if (op === 0x23) return mkInstr(startPc, edPc + 1, `${prefixStr}INC ${reg}`, romBuf);
  if (op === 0x2B) return mkInstr(startPc, edPc + 1, `${prefixStr}DEC ${reg}`, romBuf);

  // PUSH/POP IX/IY
  if (op === 0xE5) return mkInstr(startPc, edPc + 1, `${prefixStr}PUSH ${reg}`, romBuf);
  if (op === 0xE1) return mkInstr(startPc, edPc + 1, `${prefixStr}POP ${reg}`, romBuf);

  // ADD IX/IY, rr
  if ((op & 0xCF) === 0x09) {
    const r = ['BC', 'DE', reg, 'SP'][(op >> 4) & 3];
    return mkInstr(startPc, edPc + 1, `${prefixStr}ADD ${reg},${r}`, romBuf);
  }

  // LD (IX/IY+d), n
  if (op === 0x36) {
    const d = signedByte(romBuf[edPc + 1]);
    const val = romBuf[edPc + 2];
    return mkInstr(startPc, edPc + 3, `${prefixStr}LD (${reg}+${d}),${hex(val, 2)}`, romBuf);
  }

  // LD r, (IX/IY+d) — 01 rrr 110
  if ((op & 0xC7) === 0x46) {
    const d = signedByte(romBuf[edPc + 1]);
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '???', 'A'][(op >> 3) & 7];
    return mkInstr(startPc, edPc + 2, `${prefixStr}LD ${r},(${reg}+${d})`, romBuf);
  }

  // LD (IX/IY+d), r — 01 110 rrr
  if ((op & 0xF8) === 0x70) {
    const d = signedByte(romBuf[edPc + 1]);
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
    return mkInstr(startPc, edPc + 2, `${prefixStr}LD (${reg}+${d}),${r}`, romBuf);
  }

  // INC/DEC (IX/IY+d)
  if (op === 0x34) {
    const d = signedByte(romBuf[edPc + 1]);
    return mkInstr(startPc, edPc + 2, `${prefixStr}INC (${reg}+${d})`, romBuf);
  }
  if (op === 0x35) {
    const d = signedByte(romBuf[edPc + 1]);
    return mkInstr(startPc, edPc + 2, `${prefixStr}DEC (${reg}+${d})`, romBuf);
  }

  // ALU A, (IX/IY+d)
  if ((op & 0xC7) === 0x86) {
    const aluOps = ['ADD', 'ADC', 'SUB', 'SBC', 'AND', 'XOR', 'OR', 'CP'];
    const aluOp = aluOps[(op >> 3) & 7];
    const d = signedByte(romBuf[edPc + 1]);
    return mkInstr(startPc, edPc + 2, `${prefixStr}${aluOp} A,(${reg}+${d})`, romBuf);
  }

  // JP (IX/IY)
  if (op === 0xE9) return mkInstr(startPc, edPc + 1, `${prefixStr}JP (${reg})`, romBuf);

  // LD SP, IX/IY
  if (op === 0xF9) return mkInstr(startPc, edPc + 1, `${prefixStr}LD SP,${reg}`, romBuf);

  // EX (SP), IX/IY
  if (op === 0xE3) return mkInstr(startPc, edPc + 1, `${prefixStr}EX (SP),${reg}`, romBuf);

  // Fallback
  return mkInstr(startPc, edPc + 1, `${prefixStr}DB DD/FD,${hex(op, 2)}`, romBuf);
}

function decodeED(romBuf, startPc, edPc, prefixStr, immW) {
  const op = romBuf[edPc];

  // LD rr, (nn) — ED 4B/5B/6B/7B
  const edLdRegs = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
  if (edLdRegs[op]) {
    const addr = readLE(romBuf, edPc + 1, immW);
    return mkInstr(startPc, edPc + 1 + immW, `${prefixStr}LD ${edLdRegs[op]},(${hex(addr)})`, romBuf);
  }

  // LD (nn), rr — ED 43/53/63/73
  const edStRegs = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
  if (edStRegs[op]) {
    const addr = readLE(romBuf, edPc + 1, immW);
    return mkInstr(startPc, edPc + 1 + immW, `${prefixStr}LD (${hex(addr)}),${edStRegs[op]}`, romBuf);
  }

  // SBC HL, rr — ED 42/52/62/72
  if ((op & 0xCF) === 0x42) {
    const r = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    return mkInstr(startPc, edPc + 1, `${prefixStr}SBC HL,${r}`, romBuf);
  }

  // ADC HL, rr — ED 4A/5A/6A/7A
  if ((op & 0xCF) === 0x4A) {
    const r = ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
    return mkInstr(startPc, edPc + 1, `${prefixStr}ADC HL,${r}`, romBuf);
  }

  // NEG
  if (op === 0x44) return mkInstr(startPc, edPc + 1, `${prefixStr}NEG`, romBuf);

  // RETI / RETN
  if (op === 0x4D) return mkInstr(startPc, edPc + 1, `${prefixStr}RETI`, romBuf, true);
  if (op === 0x45) return mkInstr(startPc, edPc + 1, `${prefixStr}RETN`, romBuf, true);

  // IM 0/1/2
  if (op === 0x46) return mkInstr(startPc, edPc + 1, `${prefixStr}IM 0`, romBuf);
  if (op === 0x56) return mkInstr(startPc, edPc + 1, `${prefixStr}IM 1`, romBuf);
  if (op === 0x5E) return mkInstr(startPc, edPc + 1, `${prefixStr}IM 2`, romBuf);

  // LD I,A / LD A,I / LD R,A / LD A,R
  if (op === 0x47) return mkInstr(startPc, edPc + 1, `${prefixStr}LD I,A`, romBuf);
  if (op === 0x57) return mkInstr(startPc, edPc + 1, `${prefixStr}LD A,I`, romBuf);
  if (op === 0x4F) return mkInstr(startPc, edPc + 1, `${prefixStr}LD R,A`, romBuf);
  if (op === 0x5F) return mkInstr(startPc, edPc + 1, `${prefixStr}LD A,R`, romBuf);

  // Block ops
  if (op === 0xA0) return mkInstr(startPc, edPc + 1, `${prefixStr}LDI`, romBuf);
  if (op === 0xA1) return mkInstr(startPc, edPc + 1, `${prefixStr}CPI`, romBuf);
  if (op === 0xA8) return mkInstr(startPc, edPc + 1, `${prefixStr}LDD`, romBuf);
  if (op === 0xA9) return mkInstr(startPc, edPc + 1, `${prefixStr}CPD`, romBuf);
  if (op === 0xB0) return mkInstr(startPc, edPc + 1, `${prefixStr}LDIR`, romBuf);
  if (op === 0xB1) return mkInstr(startPc, edPc + 1, `${prefixStr}CPIR`, romBuf);
  if (op === 0xB8) return mkInstr(startPc, edPc + 1, `${prefixStr}LDDR`, romBuf);
  if (op === 0xB9) return mkInstr(startPc, edPc + 1, `${prefixStr}CPDR`, romBuf);

  // IN r, (C) / OUT (C), r
  if ((op & 0xC7) === 0x40) {
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '???', 'A'][(op >> 3) & 7];
    return mkInstr(startPc, edPc + 1, `${prefixStr}IN ${r},(C)`, romBuf);
  }
  if ((op & 0xC7) === 0x41) {
    const r = ['B', 'C', 'D', 'E', 'H', 'L', '???', 'A'][(op >> 3) & 7];
    return mkInstr(startPc, edPc + 1, `${prefixStr}OUT (C),${r}`, romBuf);
  }

  // RRD / RLD
  if (op === 0x67) return mkInstr(startPc, edPc + 1, `${prefixStr}RRD`, romBuf);
  if (op === 0x6F) return mkInstr(startPc, edPc + 1, `${prefixStr}RLD`, romBuf);

  // Fallback
  return mkInstr(startPc, edPc + 1, `${prefixStr}DB ED,${hex(op, 2)}`, romBuf);
}

function readLE(buf, offset, width) {
  if (width === 2) return (buf[offset] & 0xff) | ((buf[offset + 1] & 0xff) << 8);
  return ((buf[offset] & 0xff) | ((buf[offset + 1] & 0xff) << 8) | ((buf[offset + 2] & 0xff) << 16)) >>> 0;
}

function mkInstr(startPc, nextPc, mnemonic, romBuf, isRet = false) {
  const len = nextPc - startPc;
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(hexByte(romBuf[startPc + i]));
  return {
    pc: startPc,
    nextPc,
    length: len,
    bytes: bytes.join(' '),
    mnemonic,
    isRet,
  };
}

function formatDisasm(instructions) {
  const lines = [];
  for (const instr of instructions) {
    const pcStr = hex(instr.pc);
    const bytesStr = instr.bytes.padEnd(20);
    lines.push(`${pcStr}  ${bytesStr}  ${instr.mnemonic}`);
  }
  return lines;
}

// ─── Runtime helpers ───

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });
  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function makeSentinelError(termination, pc) {
  const error = new Error('__SENTINEL__');
  error.isSentinel = true;
  error.termination = termination;
  error.pc = pc & 0xffffff;
  return error;
}

function runDirect(executor, entry, options = {}) {
  const sentinelMap = options.sentinels ?? new Map();
  let steps = 0;
  let finalPc = entry & 0xffffff;
  let finalMode = 'adl';
  let termination = 'unknown';
  let loopsForced = 0;
  let missingBlockObserved = false;

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: options.maxSteps ?? 100000,
      maxLoopIterations: options.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITER,
      onLoopBreak(pc, mode, loopHitCount, fallthroughTarget) {
        loopsForced += 1;
        if (options.onLoopBreak) options.onLoopBreak(pc & 0xffffff, mode, loopHitCount, fallthroughTarget);
      },
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        if (options.onBlock) options.onBlock(norm, mode, meta, stepNumber);
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        missingBlockObserved = true;
        if (options.onMissingBlock) options.onMissingBlock(norm, mode, stepNumber);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    finalMode = result.lastMode ?? finalMode;
    termination = result.termination ?? 'unknown';
    loopsForced = Math.max(loopsForced, result.loopsForced ?? 0);
    if ((result.missingBlocks?.length ?? 0) > 0 || termination === 'missing_block') {
      missingBlockObserved = true;
    }
    return { steps, finalPc, finalMode, termination, loopsForced, missingBlockObserved };
  } catch (error) {
    if (error?.isSentinel) {
      return { steps, finalPc: error.pc, finalMode, termination: error.termination, loopsForced, missingBlockObserved };
    }
    throw error;
  }
}

function runMemInit(runtime) {
  const { mem, cpu, executor } = runtime;
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runDirect(executor, MEMINIT_ENTRY, {
    maxSteps: 100000,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });
}

function seedAllocatorPointers(mem) {
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem[PTEMPCNT_ADDR] = 0;
  mem[PTEMPCNT_ADDR + 1] = 0;
  mem[PTEMPCNT_ADDR + 2] = 0;
  mem[PTEMPCNT_ADDR + 3] = 0;
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedParserState(mem) {
  mem.fill(0x00, USERMEM_ADDR, USERMEM_ADDR + 0x20);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedErrorFrame(cpu, mem) {
  const frameBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, frameBase, FAKE_RET);
  write24(mem, frameBase + 3, POP_ERROR_HANDLER);
  write24(mem, ERR_SP_ADDR, frameBase);
  mem[ERR_NO_ADDR] = 0x00;
  cpu.sp = frameBase;
  return frameBase;
}

// ─── Main ───

async function main() {
  const output = [];
  const log = (line = '') => { output.push(String(line)); console.log(line); };

  log('=== Phase 25AS: Common-Tail Disassembly + Runtime Trace ===');
  log('');

  // ─── PART 1: Static Disassembly ───

  log('═══════════════════════════════════════════════════');
  log('PART 1: STATIC DISASSEMBLY (ROM bytes, no execution)');
  log('═══════════════════════════════════════════════════');
  log('');

  // 1a. Common tail 0x058693 — 0x058700
  log('─── 0x058693–0x058700: Common Tail ───');
  log('');
  const commonTail = disassembleRangeNoStop(rom, 0x058693, 0x058700 - 0x058693);
  for (const line of formatDisasm(commonTail)) log(line);
  log('');

  // Annotate key calls in common tail
  log('  Annotations:');
  for (const instr of commonTail) {
    if (instr.mnemonic.includes('CALL')) log(`    ${hex(instr.pc)}: ${instr.mnemonic}`);
    if (instr.mnemonic.includes('JR')) log(`    ${hex(instr.pc)}: ${instr.mnemonic}`);
    if (instr.mnemonic.includes('JP')) log(`    ${hex(instr.pc)}: ${instr.mnemonic}`);
    if (instr.mnemonic.includes('RET')) log(`    ${hex(instr.pc)}: ${instr.mnemonic}`);
    if (instr.mnemonic.includes('BIT')) log(`    ${hex(instr.pc)}: ${instr.mnemonic}`);
  }
  log('');

  // Check 0x0586CC specifically
  log('─── Check 0x0586CC: JR NZ that could skip ParseInp ───');
  const at0586CC = disassembleRangeNoStop(rom, 0x0586CC, 8);
  for (const line of formatDisasm(at0586CC)) log(line);
  log('');

  // Check what's before 0x0586CC — the BIT test
  log('─── Bytes around 0x0586C6–0x0586D0 (bit test + branch) ───');
  const aroundBranch = disassembleRangeNoStop(rom, 0x0586C6, 16);
  for (const line of formatDisasm(aroundBranch)) log(line);
  log('');

  // 1b. 0x082961 (~200 bytes)
  log('─── 0x082961: Function disassembly (~200 bytes) ───');
  log('');
  const fn082961 = disassembleRange(rom, 0x082961, 200);
  for (const line of formatDisasm(fn082961)) log(line);
  log('');
  log('  CALLs in 0x082961:');
  for (const instr of fn082961) {
    if (instr.mnemonic.includes('CALL')) log(`    ${hex(instr.pc)}: ${instr.mnemonic}`);
  }
  log('');

  // 1c. 0x09215E (~150 bytes)
  log('─── 0x09215E: Function disassembly (~150 bytes) ───');
  log('');
  const fn09215E = disassembleRange(rom, 0x09215E, 150);
  for (const line of formatDisasm(fn09215E)) log(line);
  log('');
  log('  CALLs in 0x09215E:');
  for (const instr of fn09215E) {
    if (instr.mnemonic.includes('CALL')) log(`    ${hex(instr.pc)}: ${instr.mnemonic}`);
  }
  log('');

  // Check ParseInp call site at 0x0586E3
  log('─── 0x0586E3: ParseInp call site ───');
  const parseInpSite = disassembleRangeNoStop(rom, 0x0586E0, 16);
  for (const line of formatDisasm(parseInpSite)) log(line);
  log('');

  // ─── PART 2: Runtime Trace ───

  log('═══════════════════════════════════════════════════');
  log('PART 2: RUNTIME TRACE of 0x058693 (10K steps)');
  log('═══════════════════════════════════════════════════');
  log('');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);

  seedAllocatorPointers(mem);
  log('Allocator pointers seeded (correct ti84pceg.inc addresses).');

  prepareCallState(cpu, mem);
  seedParserState(mem);
  const errFrameBase = seedErrorFrame(cpu, mem);
  log(`Error frame @ ${hex(errFrameBase)}`);

  // Check bit 4 of (IY+52) = mem[0xD000B4] BEFORE run
  const iy52before = mem[0xD000B4] & 0xff;
  const bit4before = (iy52before >> 4) & 1;
  log(`(IY+52) = mem[0xD000B4] BEFORE run: ${hex(iy52before, 2)} → bit 4 = ${bit4before}`);
  log(`  If bit 4 is SET → JR NZ at 0x0586CC will SKIP ParseInp`);
  log(`  If bit 4 is CLEAR → JR NZ falls through → ParseInp reached`);
  log('');

  // Track calls/jumps
  const callLog = [];
  let prevPc = COMMON_TAIL_PC;
  let parseInpReached = false;
  let parseInpStep = null;
  const uniquePcs = new Set();

  const RUNTIME_BUDGET = 10000;

  const run = runDirect(executor, COMMON_TAIL_PC, {
    maxSteps: RUNTIME_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, mode, meta, stepNumber) {
      void mode; void meta;
      uniquePcs.add(pc);

      // Detect large jumps as call/jump targets
      const delta = Math.abs(pc - prevPc);
      if (delta > 16 && callLog.length < 300) {
        callLog.push({ step: stepNumber, from: prevPc, to: pc });
      }

      if (pc === PARSEINP_TRAMPOLINE || pc === PARSEINP_PC) {
        if (!parseInpReached) {
          parseInpReached = true;
          parseInpStep = stepNumber;
          log(`  *** ParseInp reached at step ${stepNumber} (PC=${hex(pc)}) ***`);
        }
      }

      prevPc = pc;
    },
    onMissingBlock(pc, mode, stepNumber) {
      void mode;
      uniquePcs.add(pc);
      const delta = Math.abs(pc - prevPc);
      if (delta > 16 && callLog.length < 300) {
        callLog.push({ step: stepNumber, from: prevPc, to: pc, missing: true });
      }
      prevPc = pc;
    },
  });

  log(`Run result: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)}`);
  log(`Loops forced: ${run.loopsForced}`);
  log(`Missing blocks: ${run.missingBlockObserved}`);
  log(`Unique PCs visited: ${uniquePcs.size}`);
  log(`ParseInp reached: ${parseInpReached}${parseInpReached ? ` @ step ${parseInpStep}` : ''}`);
  log('');

  // Check bit 4 of (IY+52) AFTER run
  const iy52after = mem[0xD000B4] & 0xff;
  const bit4after = (iy52after >> 4) & 1;
  log(`(IY+52) = mem[0xD000B4] AFTER run: ${hex(iy52after, 2)} → bit 4 = ${bit4after}`);
  log('');

  // Print call/jump log
  log('─── Call/Jump Log (PC changes > 16 bytes) ───');
  for (const entry of callLog) {
    const tag = entry.missing ? ' [MISSING]' : '';
    log(`  step ${String(entry.step).padStart(6)}: ${hex(entry.from)} → ${hex(entry.to)}${tag}`);
  }
  log('');

  // Key address checks
  log('─── Key Address Presence in Trace ───');
  const keyAddrs = [
    [0x058693, 'common tail entry'],
    [0x058C76, 'flag helper'],
    [0x082961, 'fn 0x082961 (pre-ParseInp call 1)'],
    [0x09215E, 'fn 0x09215E (pre-ParseInp call 2)'],
    [0x082902, 'fn 0x082902'],
    [0x0A1FD1, 'fn 0x0A1FD1'],
    [0x0A27DD, 'fn 0x0A27DD'],
    [0x0586CC, 'JR NZ branch point'],
    [0x0586E3, 'ParseInp call site'],
    [0x0586F3, 'JR NZ target (skip ParseInp)'],
    [PARSEINP_TRAMPOLINE, 'ParseInp trampoline 0x099910'],
    [PARSEINP_PC, 'ParseInp entry 0x099914'],
    [0x0BD19F, 'LCD/display loop entry'],
    [0x0A2A45, 'display subroutine'],
    [0x083865, 'FindSym loop'],
  ];
  for (const [addr, label] of keyAddrs) {
    const present = uniquePcs.has(addr);
    log(`  ${present ? '[HIT] ' : '[MISS]'} ${hex(addr)} ${label}`);
  }
  log('');

  // ─── Write Report ───
  const reportLines = [];
  reportLines.push('# Phase 25AS - Common Tail Disassembly + Pre-ParseInp Analysis');
  reportLines.push('');
  reportLines.push('## Date');
  reportLines.push('');
  reportLines.push(new Date().toISOString());
  reportLines.push('');
  reportLines.push('## Overview');
  reportLines.push('');
  reportLines.push('Static disassembly of the three key code regions before ParseInp,');
  reportLines.push('plus a 10K-step runtime trace of the common tail at 0x058693.');
  reportLines.push('');
  reportLines.push('## Console Output');
  reportLines.push('');
  reportLines.push('```text');
  reportLines.push(...output);
  reportLines.push('```');
  reportLines.push('');

  writeFileSync(REPORT_PATH, reportLines.join('\n') + '\n');
  log(`Report written to ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFileSync(REPORT_PATH, `# Phase 25AS FAILED\n\n\`\`\`\n${message}\n\`\`\`\n`);
  process.exitCode = 1;
}
