#!/usr/bin/env node

/**
 * Phase 348: Investigate the boot-side NMI path around page-zero ports 0x3D/0x3E.
 *
 * Read-only probe:
 * - disassembles the signature-check loop context at 0x000040-0x000060
 * - disassembles the NMI vector window at 0x000060-0x000080
 * - disassembles the post-JR-Z forward preview at 0x000071-0x000090
 * - disassembles the z80 continuation entered by JP 0x001AFA
 * - inspects peripherals.js for the current 0x3D/0x3E model
 * - summarizes what 0x3D likely represents and what AND 3 / JR Z means
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return `0x${(Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesFor(buffer, addr, len) {
  return Array.from(
    buffer.slice(addr, addr + len),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function upper(text) {
  return String(text ?? '').toUpperCase();
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `.${upper(inst.modePrefix)} ` : '';

  switch (inst.tag) {
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'im':
      return `IM ${inst.value}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${upper(inst.dest)},${hex8(inst.value)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${upper(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}),${upper(inst.src)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}),${upper(inst.pair)}`;
      }
      return `${prefix}LD ${upper(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}),${upper(inst.pair)}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'in0':
      return `${prefix}IN0 ${upper(inst.reg)},(${hex8(inst.port)})`;
    case 'out0':
      return `${prefix}OUT0 (${hex8(inst.port)}),${upper(inst.reg)}`;
    case 'in-reg':
      return `${prefix}IN ${upper(inst.reg)},(C)`;
    case 'out-reg':
      return `${prefix}OUT (C),${upper(inst.reg)}`;
    case 'alu-imm':
      return `${prefix}${upper(inst.op)} ${hex8(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${upper(inst.op)} ${upper(inst.src)}`;
    case 'inc-reg':
      return `${prefix}INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `${prefix}DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `${prefix}INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `${prefix}DEC ${upper(inst.pair)}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res':
      return `${prefix}RES ${inst.bit},${upper(inst.reg)}`;
    case 'indexed-cb-res': {
      const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}RES ${inst.bit},(${upper(inst.indexRegister)}${disp})`;
    }
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${upper(inst.condition)},${hex(inst.target)}`;
    case 'rst':
      return `${prefix}RST ${hex8(inst.target)}`;
    case 'rsmix':
      return 'RSMIX';
    case 'ex-af':
      return "EX AF,AF'";
    case 'exx':
      return 'EXX';
    case 'ex-de-hl':
      return 'EX DE,HL';
    case 'ccf':
      return 'CCF';
    case 'add-pair':
      return `${prefix}ADD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'sbc-pair':
      return `${prefix}SBC HL,${upper(inst.src)}`;
    case 'adc-pair':
      return `${prefix}ADC HL,${upper(inst.src)}`;
    default:
      return JSON.stringify(inst);
  }
}

function disassembleRange(rom, start, end, mode = 'z80') {
  const lines = [];
  let pc = start;

  while (pc < end) {
    const inst = decodeInstruction(rom, pc, mode);
    const len = Math.max(1, inst.length || 1);
    lines.push({
      addr: pc,
      raw: bytesFor(rom, pc, len),
      text: formatInstruction(inst),
    });
    pc += len;
  }

  return lines;
}

function printRange(title, lines) {
  console.log(title);
  console.log('-'.repeat(title.length));

  for (const line of lines) {
    console.log(`${hex(line.addr)}: ${line.raw.padEnd(14)} ${line.text}`);
  }

  console.log('');
}

function findLine(lines, pattern) {
  const index = lines.findIndex((line) => line.includes(pattern));
  return index === -1 ? null : index + 1;
}

function inspectPeripheralModel(source) {
  const lines = source.split(/\r?\n/);
  const port3dMatch = source.match(
    /register\(0x3d,\s*\{\s*read\(\)\s*\{\s*return\s*(0x[0-9a-fA-F]+|\d+);/s
  );
  const port3eMatch = source.match(
    /register\(0x3e,\s*\{\s*read\(\)\s*\{\s*return\s*(0x[0-9a-fA-F]+|\d+);/s
  );

  return {
    commentLine: findLine(lines, 'Interrupt status/acknowledge registers (ports 0x3D-0x3E)'),
    port3dLine: findLine(lines, 'register(0x3d, {'),
    port3eLine: findLine(lines, 'register(0x3e, {'),
    port3dReturnValue: port3dMatch ? port3dMatch[1] : 'not found',
    port3eReturnValue: port3eMatch ? port3eMatch[1] : 'not found',
    hasExplicitResetName:
      /reset identification|reset status|watchdog|external reset/i.test(source),
  };
}

function printSummary(peripheralInfo) {
  console.log('Interpretation');
  console.log('--------------');
  console.log('1. The NMI vector at 0x000066 only cares whether the low two bits read from port 0x3D are zero or non-zero.');
  console.log('2. The ROM sequence is: IN0 A,(0x3D) -> AND 0x03 -> OUT0 (0x3E),A -> JR Z,0x000047.');
  console.log('3. If (port3D & 3) == 0, the handler loops back into the boot signature-check path at 0x000047. That path CALLs 0x0008BB, and on failure it jumps to the HALT stub at 0x0019B5.');
  console.log('4. If (port3D & 3) != 0, the handler does not loop. It POPs AF and jumps forward to 0x001AFA, entering a longer z80-side recovery/reset path instead of retrying 0x000047 immediately.');
  console.log('5. Repo-local evidence is limited, but masking only bits 0-1 and then mirroring them to 0x3E makes port 0x3D look most like a reset-source / reset-status latch rather than general-purpose device data.');
  console.log('6. Because only bits 0-1 are tested, the exact vendor encoding matters less than the zero/non-zero split. A default of 0x01 is the safest emulator choice for the intended non-zero path.');
  console.log('7. Current model in peripherals.js:');
  console.log(`   - comment line: ${peripheralInfo.commentLine ?? 'n/a'}`);
  console.log(`   - port 0x3D registration line: ${peripheralInfo.port3dLine ?? 'n/a'} (returns ${peripheralInfo.port3dReturnValue})`);
  console.log(`   - port 0x3E registration line: ${peripheralInfo.port3eLine ?? 'n/a'} (returns ${peripheralInfo.port3eReturnValue})`);
  console.log(`   - explicit reset-source wording in peripherals.js: ${peripheralInfo.hasExplicitResetName ? 'yes' : 'no'}`);
  console.log('');
  console.log('Forward-path note');
  console.log('-----------------');
  console.log('The immediate forward path is 0x000071 -> JP 0x001AFA. The continuation beginning at 0x001AFA does not RETI directly from the vector; it enters a larger restart/recovery sequence whose first unconditional transfer after setup is RST 0x00. In other words, this NMI path looks like a recovery handoff, not a normal tiny ISR return.');
}

function main() {
  const rom = readFileSync(ROM_PATH);
  const peripheralsSource = readFileSync(PERIPHERALS_PATH, 'utf8');
  const peripheralInfo = inspectPeripheralModel(peripheralsSource);

  const signatureLines = disassembleRange(rom, 0x000040, 0x000060, 'z80');
  const nmiWindowLines = disassembleRange(rom, 0x000060, 0x000080, 'z80');
  const forwardPreviewLines = disassembleRange(rom, 0x000071, 0x000090, 'z80');
  const forwardEntryLines = disassembleRange(rom, 0x001AFA, 0x001B35, 'z80');
  const forwardTailLines = disassembleRange(rom, 0x001B35, 0x001B89, 'z80');
  const sharedEpilogueLines = disassembleRange(rom, 0x001A32, 0x001A4A, 'z80');

  console.log('Phase 348: NMI path / port 0x3D');
  console.log('================================');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Peripherals: ${PERIPHERALS_PATH}`);
  console.log('');

  printRange('Boot signature-check context (0x000040-0x000060)', signatureLines);
  printRange('NMI vector window (0x000060-0x000080)', nmiWindowLines);
  printRange('Post-JR-Z forward preview (0x000071-0x000090)', forwardPreviewLines);
  printRange('Forward-path continuation entry (0x001AFA-0x001B35)', forwardEntryLines);
  printRange('Forward-path continuation tail (0x001B35-0x001B89)', forwardTailLines);
  printRange('Nearby shared z80 epilogue (0x001A32-0x001A4A)', sharedEpilogueLines);

  printSummary(peripheralInfo);
}

main();
