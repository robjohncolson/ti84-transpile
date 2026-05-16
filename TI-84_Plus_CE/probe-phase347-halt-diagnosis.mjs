#!/usr/bin/env node

/**
 * Phase 347: Diagnose the 0x0019B5 HALT path and post-HALT continuation.
 *
 * Read-only probe:
 * - disassembles 0x001980-0x001A00 from ROM.rom
 * - highlights 0x0019B5, the actual HALT opcode, and the post-HALT address
 * - inspects peripherals.js port 0x0000 / port 0x0028 handling
 * - summarizes whether this is a PLL wait or an interrupt/crash stub
 */

import { readFileSync } from 'fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// The repo exports decodeInstruction(); alias it to the requested decode name.
import { decodeInstruction as decode } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const HALT_STUB_ENTRY = 0x0019B5;
const HALT_REGION_START = 0x001980;
const HALT_REGION_END = 0x001A00;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return `0x${(Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesFor(buffer, addr, len) {
  return Array.from(buffer.slice(addr, addr + len), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function conditionName(condition) {
  return condition ? condition.toUpperCase() : '';
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `.${inst.modePrefix.toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'nop':
      return 'NOP';
    case 'reti':
      return 'RETI';
    case 'im':
      return `IM ${inst.value}`;
    case 'ex-af':
      return "EX AF,AF'";
    case 'exx':
      return 'EXX';
    case 'push':
      return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop':
      return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${inst.dest.toUpperCase()},${hex8(inst.value)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${inst.pair.toUpperCase()},${hex(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${inst.dest.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? `${prefix}LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`
        : `${prefix}LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-ind-reg':
      return `${prefix}LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${inst.dest.toUpperCase()},(${inst.src.toUpperCase()})`;
    case 'ld-pair-ind':
      return `${prefix}LD ${inst.pair.toUpperCase()},(${inst.src.toUpperCase()})`;
    case 'ld-indexed-pair': {
      const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}LD (${inst.indexRegister.toUpperCase()}${disp}),${inst.pair.toUpperCase()}`;
    }
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'out0':
      return `${prefix}OUT0 (0x${inst.port.toString(16).toUpperCase().padStart(2, '0')}),${inst.reg.toUpperCase()}`;
    case 'in0':
      return `${prefix}IN0 ${inst.reg.toUpperCase()},(0x${inst.port.toString(16).toUpperCase().padStart(2, '0')})`;
    case 'out-reg':
      return `${prefix}OUT (C),${inst.reg.toUpperCase()}`;
    case 'in-reg':
      return `${prefix}IN ${inst.reg.toUpperCase()},(C)`;
    case 'alu-imm':
      return `${prefix}${inst.op.toUpperCase()} ${hex8(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'bit-res':
      return `${prefix}RES ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'indexed-cb-res': {
      const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}RES ${inst.bit},(${inst.indexRegister.toUpperCase()}${disp})`;
    }
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${conditionName(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${conditionName(inst.condition)},${hex(inst.target)}`;
    case 'call':
      return `${prefix}${inst.cond ? `CALL ${conditionName(inst.cond)},` : 'CALL '}${hex(inst.target)}`;
    case 'ret':
      return inst.cond ? `${prefix}RET ${conditionName(inst.cond)}` : `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${conditionName(inst.condition)}`;
    case 'rst':
      return `${prefix}RST 0x${inst.target.toString(16).toUpperCase().padStart(2, '0')}`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'dec-reg':
      return `${prefix}DEC ${inst.reg.toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${inst.reg.toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${inst.pair.toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${inst.pair.toUpperCase()}`;
    case 'add-pair':
      return `${prefix}ADD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL,${inst.src.toUpperCase()}`;
    case 'adc-pair':
      return `${prefix}ADC HL,${inst.src.toUpperCase()}`;
    default:
      return JSON.stringify(inst);
  }
}

function decodeAt(rom, addr, mode = 'z80') {
  return decode(rom, addr, mode);
}

function printRange(title, rom, start, end, mode = 'z80') {
  console.log(title);
  console.log('-'.repeat(title.length));

  let pc = start;
  while (pc < end) {
    const inst = decodeAt(rom, pc, mode);
    const len = Math.max(1, inst.length || 1);
    const raw = bytesFor(rom, pc, len);
    console.log(`${hex(pc)}: ${raw.padEnd(14)} ${formatInstruction(inst)}`);
    pc += len;
  }

  console.log('');
}

function findFirstTag(rom, start, end, tag, mode = 'z80') {
  let pc = start;
  while (pc < end) {
    const inst = decodeAt(rom, pc, mode);
    if (inst.tag === tag) {
      return { addr: pc, inst };
    }
    pc += Math.max(1, inst.length || 1);
  }
  return null;
}

function findLine(lines, needle) {
  const index = lines.findIndex((line) => line.includes(needle));
  return index === -1 ? null : index + 1;
}

function inspectPeripheralModel(source) {
  const lines = source.split(/\r?\n/);

  return {
    cpuControlFunctionLine: findLine(lines, 'function createCpuControlHandler(state) {'),
    cpuControlReadLine: findLine(lines, 'return state.cpuControl.value;'),
    cpuControlWriteLine: findLine(lines, 'state.cpuControl.value = value;'),
    cpuControlRegisterLine: findLine(lines, 'register(0x00, createCpuControlHandler(state));'),
    pllFunctionLine: findLine(lines, 'function createPllHandler(state) {'),
    pllLockedReadLine: findLine(lines, 'return 0x04;'),
    pllRegisterLine: findLine(lines, 'register(0x28, createPllHandler(state));'),
  };
}

function summarize(rom, peripheralInfo) {
  const haltRecord = findFirstTag(rom, HALT_STUB_ENTRY, HALT_STUB_ENTRY + 0x20, 'halt', 'z80');
  if (!haltRecord) {
    throw new Error(`No HALT opcode found near ${hex(HALT_STUB_ENTRY)}.`);
  }

  const entryInst = decodeAt(rom, HALT_STUB_ENTRY, 'z80');
  const requestedInst = decodeAt(rom, 0x0019B6, 'z80');
  const postHaltAddr = haltRecord.addr + Math.max(1, haltRecord.inst.length || 1);
  const postHaltInst = decodeAt(rom, postHaltAddr, 'z80');
  const imInst = decodeAt(rom, 0x00069A, 'z80');
  const pllWriteInst = decodeAt(rom, 0x00069C, 'z80');
  const pllReadInst = decodeAt(rom, 0x00069F, 'z80');
  const pllBitInst = decodeAt(rom, 0x0006A2, 'z80');
  const branchIntoStub = decodeAt(rom, 0x00004F, 'z80');

  console.log('Summary');
  console.log('-------');
  console.log(`Stub entry at ${hex(HALT_STUB_ENTRY)}: ${formatInstruction(entryInst)}`);
  console.log(`Requested address ${hex(0x0019B6)}: ${formatInstruction(requestedInst)}`);
  console.log(`Actual HALT opcode: ${hex(haltRecord.addr)} = ${formatInstruction(haltRecord.inst)}`);
  console.log(`Actual post-HALT continuation: ${hex(postHaltAddr)} = ${formatInstruction(postHaltInst)}`);
  console.log('');
  console.log(`Interrupt mode setup: ${hex(0x00069A)} = ${formatInstruction(imInst)}.`);
  console.log(`PLL check already happens earlier via ${hex(0x00069C)} ${formatInstruction(pllWriteInst)}, ${hex(0x00069F)} ${formatInstruction(pllReadInst)}, ${hex(0x0006A2)} ${formatInstruction(pllBitInst)}.`);
  console.log(`Branch into the stub: ${hex(0x00004F)} = ${formatInstruction(branchIntoStub)} after CALL ${hex(0x0008BB)}.`);
  console.log('');
  console.log('Conclusions:');
  console.log(`1. This is not a normal "HALT at ${hex(HALT_STUB_ENTRY)} then resume at PC+1=${hex(0x0019B6)}" case. ${hex(HALT_STUB_ENTRY)} is the start of the stub, but the HALT byte is at ${hex(haltRecord.addr)}. ${hex(0x0019B6)} is only the second instruction in the stub: ${formatInstruction(requestedInst)}.`);
  console.log(`2. After a real wake from ${hex(haltRecord.addr)}, execution would continue at ${hex(postHaltAddr)}, where the code immediately loads BC with 0x5015 and starts scanning interrupt-controller masked-status bytes. The surrounding code reads 0x5015, 0x5014, and 0x5016, acknowledges bits via 0x5009/0x5008/0x500A, and exits with EI; RETI at 0x001A48-0x001A49.`);
  console.log(`3. Because the stub executes DI before HALT, maskable IRQs are disabled when the CPU halts. With IM 1 already set, a maskable IRQ would normally vector to 0x000038, but DI means the timer ISR cannot wake this halt. The only wake path left is NMI at 0x000066.`);
  console.log(`4. The port-0 model in peripherals.js is just a CPU-control latch: createCpuControlHandler() reads back state.cpuControl.value and writes state.cpuControl.value = value. Port 0x0000 is registered on line ${peripheralInfo.cpuControlRegisterLine ?? 'n/a'}. There is no modeled PLL-lock bit there.`);
  console.log(`5. The modeled PLL lock bit is on port 0x0028, not 0x0000. createPllHandler() returns 0x04 once locked and is registered on line ${peripheralInfo.pllRegisterLine ?? 'n/a'}. That matches the earlier boot-side BIT 2 test at 0x0006A2, which the boot trace already passes.`);
  console.log(`6. The bytes after HALT do not loop back to port 0x0000 and do not poll PLL lock. They implement interrupt-status scan/ack work. A port-0 "PLL locked" readback will not explain this stop. If you want to force execution past the halt artificially, you need an NMI-capable wake source; the more faithful fix is to avoid taking JP NZ,0x0019B5 in the first place.`);
  console.log('');
  console.log('peripherals.js evidence:');
  console.log(`- createCpuControlHandler(): line ${peripheralInfo.cpuControlFunctionLine ?? 'n/a'}`);
  console.log(`- port 0x0000 readback: line ${peripheralInfo.cpuControlReadLine ?? 'n/a'}`);
  console.log(`- port 0x0000 write latch: line ${peripheralInfo.cpuControlWriteLine ?? 'n/a'}`);
  console.log(`- createPllHandler(): line ${peripheralInfo.pllFunctionLine ?? 'n/a'}`);
  console.log(`- port 0x0028 returns 0x04 when locked: line ${peripheralInfo.pllLockedReadLine ?? 'n/a'}`);
}

function main() {
  const rom = readFileSync(ROM_PATH);
  const peripheralsSource = readFileSync(PERIPHERALS_PATH, 'utf8');
  const peripheralInfo = inspectPeripheralModel(peripheralsSource);

  console.log('Phase 347: 0x0019B5 HALT diagnosis');
  console.log('==================================');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Peripherals: ${PERIPHERALS_PATH}`);
  console.log('');

  printRange('HALT-region disassembly (0x001980-0x001A00)', rom, HALT_REGION_START, HALT_REGION_END, 'z80');
  printRange('Stub entry and immediate continuation', rom, HALT_STUB_ENTRY, 0x0019C8, 'z80');
  printRange('Branch into the stub (0x000047-0x000054)', rom, 0x000047, 0x000055, 'z80');
  printRange('Interrupt/PLL setup in boot (0x00069A-0x0006A4)', rom, 0x00069A, 0x0006A4, 'z80');

  summarize(rom, peripheralInfo);
}

main();
