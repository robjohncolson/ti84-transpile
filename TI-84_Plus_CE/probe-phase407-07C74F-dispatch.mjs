#!/usr/bin/env node

import fs from 'node:fs';

import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const ENTRY = 0x07c74f;
const MAIN_SCAN_BYTES = 0x180;
const TARGET_PREVIEW_BYTES = 30;
const PROMPT_TARGET_COUNT = 13;
const ACTION_COMPARE_SET = new Set([0x08, 0x09, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f]);

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesHex(buf) {
  return Array.from(buf, (value) => (value & 0xff).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatDisplacement(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatInstruction(inst) {
  const addrWidth = inst.modePrefix ? 4 : 6;

  switch (inst.tag) {
    case 'nop':
      return 'nop';
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value, addrWidth)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `ld (${hex(inst.addr, addrWidth)}), ${inst.pair}`;
      }
      return `ld ${inst.pair}, (${hex(inst.addr, addrWidth)})`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm':
      return `ld (hl), ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `ld (${inst.indexRegister}${formatDisplacement(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm':
      return `ld (${inst.indexRegister}${formatDisplacement(inst.displacement)}), ${hex(inst.value, 2)}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'inc-ixd':
      return `inc (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;
    case 'dec-ixd':
      return `dec (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'adc-pair':
      return `adc hl, ${inst.src}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hex(inst.value, 2)}`;
    case 'alu-ixd':
      return `${inst.op} (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;
    case 'rst':
      return `rst ${hex(inst.target, 2)}`;
    case 'di':
      return 'di';
    case 'ei':
      return 'ei';
    case 'halt':
      return 'halt';
    case 'djnz':
      return `djnz ${hex(inst.target)}`;
    case 'ldi':
      return 'ldi';
    case 'ldd':
      return 'ldd';
    case 'ldir':
      return 'ldir';
    case 'lddr':
      return 'lddr';
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (hl)`;
    case 'bit-res':
      return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind':
      return `res ${inst.bit}, (hl)`;
    case 'bit-set':
      return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind':
      return `set ${inst.bit}, (hl)`;
    case 'rotate-reg':
      return `${inst.op} ${inst.reg}`;
    case 'rotate-ind':
      return `${inst.op} (hl)`;
    case 'indexed-cb-rotate':
      return `${inst.operation} (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, (${inst.indexRegister}${formatDisplacement(inst.displacement)})`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-ix':
      return `ld sp, ${inst.indexRegister || 'ix'}`;
    case 'jp-hl':
      return 'jp (hl)';
    case 'jp-ix':
      return `jp (${inst.indexRegister || 'ix'})`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister})`;
    case 'ex-af':
      return "ex af, af'";
    case 'ex-de-hl':
      return 'ex de, hl';
    case 'exx':
      return 'exx';
    case 'ld-a-i':
      return 'ld a, i';
    case 'ld-i-a':
      return 'ld i, a';
    case 'neg':
      return 'neg';
    case 'rla':
      return 'rla';
    case 'rra':
      return 'rra';
    case 'rlca':
      return 'rlca';
    case 'rrca':
      return 'rrca';
    case 'cpl':
      return 'cpl';
    case 'scf':
      return 'scf';
    case 'ccf':
      return 'ccf';
    case 'daa':
      return 'daa';
    case 'reti':
      return 'reti';
    case 'retn':
      return 'retn';
    case 'im':
      return `im ${inst.mode ?? inst.value}`;
    case 'in':
      return `in ${inst.dest}, (${inst.port !== undefined ? hex(inst.port, 2) : 'c'})`;
    case 'out':
      return `out (${inst.port !== undefined ? hex(inst.port, 2) : 'c'}), ${inst.src}`;
    case 'in0':
      return `in0 ${inst.reg}, (${hex(inst.port, 2)})`;
    case 'out0':
      return `out0 (${hex(inst.port, 2)}), ${inst.reg}`;
    case 'rsmix':
      return 'rsmix';
    case 'stmix':
      return 'stmix';
    default:
      return inst.tag;
  }
}

function disassembleLinear(start, byteLimit) {
  const rows = [];
  const end = Math.min(start + byteLimit, rom.length);
  let pc = start;

  while (pc < end) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      if (!inst || !inst.length) break;

      rows.push({
        pc,
        bytes: bytesHex(rom.slice(pc, pc + inst.length)),
        text: formatInstruction(inst),
        inst,
      });
      pc = inst.nextPc;
    } catch (error) {
      rows.push({
        pc,
        bytes: bytesHex(rom.slice(pc, pc + 1)),
        text: `decode_error: ${error.message}`,
        inst: null,
      });
      pc += 1;
    }
  }

  return rows;
}

function collectBranchRows(rows) {
  return rows.filter((row) => {
    const tag = row.inst?.tag;
    return (
      tag === 'call' ||
      tag === 'call-conditional' ||
      tag === 'jp' ||
      tag === 'jp-conditional' ||
      tag === 'jr' ||
      tag === 'jr-conditional' ||
      tag === 'djnz'
    );
  });
}

function collectIndirectRows(rows) {
  return rows.filter((row) => {
    const tag = row.inst?.tag;
    return tag === 'jp-hl' || tag === 'jp-ix' || tag === 'jp-indirect';
  });
}

function collectCpRows(rows) {
  return rows.filter((row) => row.inst?.tag === 'alu-imm' && row.inst?.op === 'cp');
}

function collectUniqueDirectTargets(rows) {
  const targets = [];
  const seen = new Set();

  for (const row of rows) {
    const tag = row.inst?.tag;
    if (tag !== 'call' && tag !== 'call-conditional' && tag !== 'jp' && tag !== 'jp-conditional') {
      continue;
    }

    if (seen.has(row.inst.target)) continue;
    seen.add(row.inst.target);
    targets.push({
      target: row.inst.target,
      firstSeenPc: row.pc,
      via: tag,
      condition: row.inst.condition ?? null,
    });
  }

  return targets;
}

function previewTarget(targetInfo) {
  const rows = disassembleLinear(targetInfo.target, TARGET_PREVIEW_BYTES);
  const cpRows = collectCpRows(rows).map((row) => ({
    pc: row.pc,
    value: row.inst.value,
    matchesActionSet: ACTION_COMPARE_SET.has(row.inst.value),
  }));
  const indirectRows = collectIndirectRows(rows);

  return {
    ...targetInfo,
    rows,
    cpRows,
    indirectRows,
  };
}

function formatBranchRow(row) {
  const condition = row.inst.condition ? ` condition=${row.inst.condition}` : '';
  return `${hex(row.pc)}  ${row.text.padEnd(24)} target=${hex(row.inst.target)}${condition}`;
}

function renderRows(rows) {
  return rows.map((row) => `  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
}

function findRow(rows, pc) {
  return rows.find((row) => row.pc === pc) ?? null;
}

const mainRows = disassembleLinear(ENTRY, MAIN_SCAN_BYTES);
const branchRows = collectBranchRows(mainRows);
const indirectRows = collectIndirectRows(mainRows);
const cpRows = collectCpRows(mainRows);
const uniqueDirectTargets = collectUniqueDirectTargets(mainRows);
const promptTargets = uniqueDirectTargets.slice(0, PROMPT_TARGET_COUNT);
const promptTargetPreviews = promptTargets.map(previewTarget);

const helper07F7BDRows = disassembleLinear(0x07f7bd, 12);
const helper080037Rows = disassembleLinear(0x080037, 20);
const cp07C7ADRows = mainRows.filter((row) => row.pc >= 0x07c79e && row.pc <= 0x07c7b8);
const cp07C7EFRows = mainRows.filter((row) => row.pc >= 0x07c7ef && row.pc <= 0x07c7f9);

const actionCompareTargetHits = uniqueDirectTargets
  .map(previewTarget)
  .filter((preview) => preview.cpRows.some((row) => row.matchesActionSet));

const promptWindowEndPc = promptTargets.at(-1)?.firstSeenPc ?? ENTRY;

console.log('Phase 407: 0x07C74F dispatch deep trace');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Entry: ${hex(ENTRY)}`);
console.log(`Main linear scan: ${MAIN_SCAN_BYTES} bytes (${hex(ENTRY)}..${hex(ENTRY + MAIN_SCAN_BYTES - 1)})`);
console.log(`Prompt target preview set: first ${PROMPT_TARGET_COUNT} unique CALL/JP targets (through ${hex(promptWindowEndPc)})`);

console.log('\n== Main CP Immediates ==');
for (const row of cpRows) {
  const marker = ACTION_COMPARE_SET.has(row.inst.value) ? ' action-code-hit' : '';
  console.log(`- ${hex(row.pc)}  ${row.text}${marker}`);
}

console.log('\n== Indirect Dispatch Scan ==');
if (indirectRows.length === 0) {
  console.log('- No JP (HL) / JP (IX) / JP (IY)-style indirect jump in the main 0x07C74F window.');
} else {
  for (const row of indirectRows) {
    console.log(`- ${hex(row.pc)}  ${row.text}`);
  }
}

console.log('\n== CP 0x10 Upstream Trace ==');
console.log('0x080037 helper body:');
for (const line of renderRows(helper080037Rows)) {
  console.log(line);
}
console.log('Carry-set path to 0x07C7AD:');
for (const line of renderRows(cp07C7ADRows)) {
  console.log(line);
}
console.log('Carry-clear sibling path to 0x07C7F1:');
for (const line of renderRows(cp07C7EFRows)) {
  console.log(line);
}
console.log('Inference:');
console.log('- 0x080037 returns A = (0xD005F9) - (0xD00604).');
console.log('- JR NC at 0x07C7A2 keeps that non-negative delta and re-checks it at 0x07C7F1.');
console.log('- The carry-set path at 0x07C7A4..0x07C7AC converts the negative delta into an absolute difference by restoring the larger byte from (HL)=0xD00604 and subtracting the smaller original 0xD005F9 value.');
console.log('- Both paths move the post-CP value into B and loop through 0x07FB19 over 0xD005FA / 0xD00605, so CP 0x10 is acting as a BCD alignment-distance threshold, not an action-code compare.');

console.log('\n== Action-Byte Helper Behind 0x07CA06 ==');
for (const line of renderRows(helper07F7BDRows)) {
  console.log(line);
}
console.log('- 0x07F7BD returns (0xD005F8 & 0x3F), which is the action byte with top flag bits stripped.');

console.log('\n== All Main-Window Branch Targets ==');
for (const row of branchRows) {
  console.log(`- ${formatBranchRow(row)}`);
}

console.log('\n== Unique Direct CALL/JP Targets In Full 384-Byte Scan ==');
console.log(`count=${uniqueDirectTargets.length}`);
for (const target of uniqueDirectTargets) {
  const via = target.condition ? `${target.via}(${target.condition})` : target.via;
  console.log(`- ${hex(target.target)} firstSeen=${hex(target.firstSeenPc)} via=${via}`);
}

console.log('\n== Prompt 13 Target Previews ==');
for (const preview of promptTargetPreviews) {
  const via = preview.condition ? `${preview.via}(${preview.condition})` : preview.via;
  console.log(`\n-- target ${hex(preview.target)} firstSeen=${hex(preview.firstSeenPc)} via=${via} --`);
  for (const line of renderRows(preview.rows)) {
    console.log(line);
  }

  if (preview.cpRows.length === 0) {
    console.log('  cp-summary: none');
  } else {
    const summary = preview.cpRows
      .map((row) => `${hex(row.pc)}=${hex(row.value, 2)}${row.matchesActionSet ? ':action' : ''}`)
      .join(', ');
    console.log(`  cp-summary: ${summary}`);
  }

  if (preview.indirectRows.length === 0) {
    console.log('  indirect-summary: none');
  } else {
    const summary = preview.indirectRows.map((row) => `${hex(row.pc)} ${row.text}`).join(', ');
    console.log(`  indirect-summary: ${summary}`);
  }
}

console.log('\n== Action-Compare Hits Across Full Direct-Target Set ==');
if (actionCompareTargetHits.length === 0) {
  console.log('- No first-30-byte target preview compares against the requested action-code set.');
} else {
  for (const preview of actionCompareTargetHits) {
    const hits = preview.cpRows
      .filter((row) => row.matchesActionSet)
      .map((row) => `${hex(row.pc)}=${hex(row.value, 2)}`)
      .join(', ');
    console.log(`- ${hex(preview.target)} -> ${hits}`);
  }
}

console.log('\n== Main Linear Disassembly ==');
for (const line of renderRows(mainRows)) {
  console.log(line);
}
