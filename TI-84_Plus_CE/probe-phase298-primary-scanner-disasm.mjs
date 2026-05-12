#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const START = 0x0159C0;
const END = 0x015AD2;
const IY_BASE = 0xE00800;
const KBD_DATA = 0xE00900;

const rom = readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.subarray(start, start + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatDisp(displacement) {
  const magnitude = Math.abs(displacement);
  return `${displacement < 0 ? '-' : '+'}${hex(magnitude, 2)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatDisp(displacement)})`;
}

function formatRange(address, width = 1) {
  if (width <= 1) {
    return hex(address, 6);
  }
  return `${hex(address, 6)}..${hex(address + width - 1, 6)}`;
}

function formatMnemonic(inst) {
  switch (inst.tag) {
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value, 6)}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr, 6)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr, 6)}), ${inst.src}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hex(inst.value, 2)}`;
    case 'inc-ixd':
      return `inc ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target, 6)}`;
    case 'jr':
      return `jr ${hex(inst.target, 6)}`;
    case 'jp':
      return `jp ${hex(inst.target, 6)}`;
    default:
      return inst.dasm ?? inst.tag;
  }
}

const annotations = new Map([
  [0x0159C0, 'save caller IY before repointing it at the keyboard controller MMIO block'],
  [0x0159C2, 'zero A for controller-reset writes'],
  [0x0159C3, 'prepare a 24-bit zero in DE for bulk-clearing controller slots'],
  [0x0159C7, `IY = ${hex(IY_BASE, 6)} so all subsequent (IY+d) accesses hit keyboard MMIO`],
  [0x0159CC, `clear controller slot 0 at ${formatRange(IY_BASE + 0x00, 3)}`],
  [0x0159CF, `write 0 to ${hex(IY_BASE + 0x03, 6)} (controller mode byte)`],
  [0x0159D2, `clear controller slot 1 at ${formatRange(IY_BASE + 0x04, 3)}`],
  [0x0159D5, 'prepare enable value 1'],
  [0x0159D7, `write 1 to ${hex(IY_BASE + 0x07, 6)} (enable/start register)`],
  [0x0159DA, `clear controller slot 2 at ${formatRange(IY_BASE + 0x09, 3)}`],
  [0x0159DD, `write 1 to ${hex(IY_BASE + 0x08, 6)} (controller phase/select byte)`],
  [0x0159E0, `clear controller slot 3 at ${formatRange(IY_BASE + 0x0C, 3)}`],
  [0x0159E3, 'load scan-profile byte 0x05'],
  [0x0159E5, `write 0x05 to ${hex(IY_BASE + 0x0F, 6)} (scan profile / interval)`],
  [0x0159E8, `test bit 1 of ${hex(IY_BASE + 0x18, 6)}; Session 297 identifies this as scan-complete status`],
  [0x0159EC, 'poll loop: stay here until the scan-complete bit becomes 1'],
  [0x0159EE, `read the raw keyboard byte from ${hex(KBD_DATA, 6)}`],
  [0x0159F2, 'cache the raw scan byte in B while A is reused for the acknowledge handshake'],
  [0x0159F3, 'prepare acknowledge value 1'],
  [0x0159F5, `test bit 0 of ${hex(IY_BASE + 0x24, 6)}; Session 297 identifies this as the ready/result-available flag`],
  [0x0159F9, 'poll loop: wait until the ready/result latch is set'],
  [0x0159FB, `write 1 back to ${hex(IY_BASE + 0x24, 6)} to acknowledge/clear the ready latch`],
  [0x0159FE, 'restore the raw scan byte from B into A'],
  [0x0159FF, 'special-case check for raw code 0x28'],
  [0x015A01, 'fast path: any raw code other than 0x28 exits immediately with A still holding the raw byte'],
  [0x015A03, '0x28 special case: select second-stage profile byte 0x35'],
  [0x015A05, `write 0x35 to ${hex(IY_BASE + 0x0F, 6)} for the follow-up controller pass`],
  [0x015A08, `test bit 1 of ${hex(IY_BASE + 0x18, 6)} again for the second-stage sample`],
  [0x015A0C, 'poll loop: wait for the second-stage scan-complete indication'],
  [0x015A0E, `read the second-stage byte from ${hex(KBD_DATA, 6)}`],
  [0x015A12, 'cache the second-stage byte in B'],
  [0x015A13, 'prepare acknowledge value 1'],
  [0x015A15, `test bit 0 of ${hex(IY_BASE + 0x24, 6)} before acknowledging the second-stage read`],
  [0x015A19, 'poll loop: wait until the ready flag is set'],
  [0x015A1B, `acknowledge the second-stage read via ${hex(IY_BASE + 0x24, 6)}`],
  [0x015A1E, 'move the second-stage byte back into A'],
  [0x015A1F, 'keep only the low two subtype bits'],
  [0x015A21, 'compare the subtype against 0x03'],
  [0x015A23, 'if subtype == 3, exit now with A = 0x03'],
  [0x015A25, 'clear A for the longer controller reprogramming path'],
  [0x015A26, `write 0 to ${hex(IY_BASE + 0x08, 6)} (drop the current controller phase/select setting)`],
  [0x015A29, 'prepare low byte 0x02 in E'],
  [0x015A2B, `store 0x000002 into ${formatRange(IY_BASE + 0x0C, 3)} (controller slot 3)`],
  [0x015A2E, 'load follow-up profile byte 0x06'],
  [0x015A30, `write 0x06 to ${hex(IY_BASE + 0x0F, 6)}`],
  [0x015A33, 'prepare acknowledge value 1'],
  [0x015A35, `wait on bit 0 of ${hex(IY_BASE + 0x24, 6)} before advancing to the selector-write phase`],
  [0x015A39, 'poll loop: ready latch must go high before the acknowledge write'],
  [0x015A3B, `acknowledge this controller stage via ${hex(IY_BASE + 0x24, 6)}`],
  [0x015A3E, 'jump into the first synthetic selector-write stage'],
  [0x015A40, 'bridge to the in-range epilogue when the fast path or subtype==3 path is done'],
  [0x015A42, 'restore phase/select byte to 1 for the first command write'],
  [0x015A44, `write 1 to ${hex(IY_BASE + 0x08, 6)}`],
  [0x015A47, 'load profile byte 0x01'],
  [0x015A49, `write 0x01 to ${hex(IY_BASE + 0x0F, 6)}`],
  [0x015A4C, 'load synthetic command/group-select byte 0x28'],
  [0x015A4E, `write 0x28 to ${hex(KBD_DATA, 6)}; this is one of the explicit keyboard data-register command writes`],
  [0x015A52, 'prepare acknowledge value 1'],
  [0x015A54, `wait for bit 0 of ${hex(IY_BASE + 0x24, 6)} after the 0x28 command write`],
  [0x015A58, 'poll loop: the command-complete/ready latch must go high'],
  [0x015A5A, `acknowledge completion of the 0x28 command write via ${hex(IY_BASE + 0x24, 6)}`],
  [0x015A5D, 'clear A again'],
  [0x015A5E, `write 0 to ${hex(IY_BASE + 0x08, 6)}`],
  [0x015A61, 'load profile byte 0x06 again'],
  [0x015A63, `write 0x06 to ${hex(IY_BASE + 0x0F, 6)}`],
  [0x015A66, 'prepare acknowledge value 1'],
  [0x015A68, `wait for bit 0 of ${hex(IY_BASE + 0x24, 6)} before the next command stage`],
  [0x015A6C, 'poll loop: ready latch must go high'],
  [0x015A6E, `acknowledge via ${hex(IY_BASE + 0x24, 6)}`],
  [0x015A71, 'restore A = 1 for the next phase/select write'],
  [0x015A73, `write 1 to ${hex(IY_BASE + 0x08, 6)}`],
  [0x015A76, 'load profile byte 0x11'],
  [0x015A78, `write 0x11 to ${hex(IY_BASE + 0x0F, 6)}`],
  [0x015A7B, 'load synthetic command/group-select byte 0x60'],
  [0x015A7D, `write 0x60 to ${hex(KBD_DATA, 6)}`],
  [0x015A81, 'prepare acknowledge value 1'],
  [0x015A83, `wait for bit 0 of ${hex(IY_BASE + 0x24, 6)} after the 0x60 command write`],
  [0x015A87, 'poll loop: the ready latch must go high'],
  [0x015A89, `acknowledge completion of the 0x60 command write via ${hex(IY_BASE + 0x24, 6)}`],
  [0x015A8C, 'jump into the final controller stage'],
  [0x015A8E, 'bridge directly into the epilogue entry at 0x015AD2'],
  [0x015A90, 'clear A for the final reconfiguration sequence'],
  [0x015A91, `write 0 to ${hex(IY_BASE + 0x08, 6)}`],
  [0x015A94, 'prepare low byte 0x02 in E again'],
  [0x015A96, `store 0x000002 into ${formatRange(IY_BASE + 0x0C, 3)} again`],
  [0x015A99, 'load profile byte 0xAA'],
  [0x015A9B, `write 0xAA to ${hex(IY_BASE + 0x0F, 6)}`],
  [0x015A9E, 'prepare acknowledge value 1'],
  [0x015AA0, `wait for bit 0 of ${hex(IY_BASE + 0x24, 6)} after the 0xAA stage`],
  [0x015AA4, 'poll loop: ready latch must go high'],
  [0x015AA6, `acknowledge via ${hex(IY_BASE + 0x24, 6)}`],
  [0x015AA9, 'load profile byte 0x55'],
  [0x015AAB, `write 0x55 to ${hex(IY_BASE + 0x0F, 6)}`],
  [0x015AAE, 'prepare acknowledge value 1'],
  [0x015AB0, `wait for bit 0 of ${hex(IY_BASE + 0x24, 6)} after the 0x55 stage`],
  [0x015AB4, 'poll loop: ready latch must go high'],
  [0x015AB6, `acknowledge via ${hex(IY_BASE + 0x24, 6)}`],
  [0x015AB9, 'load final synthetic command/group-select byte 0x03'],
  [0x015ABB, 'prepare final profile low byte 0x31 in E'],
  [0x015ABD, `increment ${hex(IY_BASE + 0x08, 6)} from 0 back to 1`],
  [0x015AC0, `write E (= 0x31) to ${hex(IY_BASE + 0x0F, 6)}`],
  [0x015AC3, `write 0x03 to ${hex(KBD_DATA, 6)}`],
  [0x015AC7, 'prepare acknowledge value 1'],
  [0x015AC9, `wait for bit 0 of ${hex(IY_BASE + 0x24, 6)} after the final 0x03 command write`],
  [0x015ACD, 'poll loop: ready latch must go high'],
  [0x015ACF, `final acknowledge via ${hex(IY_BASE + 0x24, 6)}`],
  [0x015AD2, 'restore caller IY; the requested window ends here, just before pop de / jp 0x000DB6'],
]);

function decodeWindow() {
  const rows = [];
  let pc = START;

  while (pc <= END) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst.length ?? 1);
    rows.push({
      pc,
      length,
      bytes: hexBytes(rom, pc, length),
      mnemonic: formatMnemonic(inst),
      annotation: annotations.get(pc) ?? 'annotation missing',
    });
    pc += length;
  }

  return rows;
}

function printSummary() {
  console.log();
  console.log('Summary');
  console.log(`  Group-select / command writes to ${hex(KBD_DATA, 6)}:`);
  console.log(`    ${hex(0x015A4E, 6)} <= 0x28`);
  console.log(`    ${hex(0x015A7D, 6)} <= 0x60`);
  console.log(`    ${hex(0x015AC3, 6)} <= 0x03`);
  console.log('  Polling algorithm:');
  console.log(`    Scan-complete polling: BIT 1,(${hex(IY_BASE + 0x18, 6)}) at ${hex(0x0159E8, 6)} and ${hex(0x015A08, 6)}, each looped by JR Z back to the BIT test.`);
  console.log(`    Ready/ack polling: BIT 0,(${hex(IY_BASE + 0x24, 6)}) repeated at ${hex(0x0159F5, 6)}, ${hex(0x015A15, 6)}, ${hex(0x015A35, 6)}, ${hex(0x015A54, 6)}, ${hex(0x015A68, 6)}, ${hex(0x015A83, 6)}, ${hex(0x015AA0, 6)}, ${hex(0x015AB0, 6)}, and ${hex(0x015AC9, 6)}; every successful poll is followed by LD (${hex(IY_BASE + 0x24, 6)}),1.`);
  console.log('  Final scan-code assembly:');
  console.log(`    Fast path: the routine does not synthesize the code arithmetically. It reads one already-packed byte from ${hex(KBD_DATA, 6)}, copies it to B, restores it to A after the acknowledge handshake, and returns it unchanged unless the byte is 0x28.`);
  console.log('    Special 0x28 path: it performs a second read, masks that second-stage byte with AND 0x03, and exits immediately only when the subtype equals 0x03.');
  console.log('    Otherwise the 0x28 path falls into extra controller programming and writes 0x28, 0x60, and 0x03 back to the keyboard data register before leaving the requested window.');
  console.log(`    Requested window note: ${hex(0x015AD4, 6)} / ${hex(0x015AD5, 6)} (pop de; jp 0x000DB6) sit just beyond the requested end address ${hex(END, 6)}.`);
}

function main() {
  console.log('=== Phase 298: Primary Keyboard Scanner Disassembly ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Window: ${hex(START, 6)}..${hex(END, 6)} (instruction starts within range)`);
  console.log();

  const rows = decodeWindow();
  for (const row of rows) {
    const bytes = row.bytes.padEnd(17, ' ');
    const mnemonic = row.mnemonic.padEnd(28, ' ');
    console.log(`${hex(row.pc, 6)}: ${bytes} ${mnemonic} ; ${row.annotation}`);
  }

  printSummary();
}

main();
