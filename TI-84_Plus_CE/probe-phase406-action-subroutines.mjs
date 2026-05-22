#!/usr/bin/env node

import fs from 'node:fs';

import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const WINDOW_BYTES = 120;
const ACTION_CODES = new Set([0x08, 0x09, 0x0c, 0x0d, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f]);

const TARGETS = [
  {
    address: 0x07FA74,
    name: 'OP2Set1',
    note: 'Constant/zero-fill helper rooted at OP2-like slots.',
  },
  {
    address: 0x07F954,
    name: 'OP1ToOP6',
    note: 'Pointer-setup wrapper around the shared LDI copy core.',
  },
  {
    address: 0x07F8CC,
    name: 'OP1ToOP3',
    note: 'Pointer-setup wrapper that tail-jumps into the shared copy helpers.',
  },
  {
    address: 0x07F8FA,
    name: 'OP1ToOP2',
    note: 'Pointer-setup wrapper that tail-jumps into the shared copy helpers.',
  },
  {
    address: 0x07C74F,
    name: 'InvSub',
    note: 'Arithmetic/subtraction-normalization chain with FP helper calls.',
  },
];

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

function isRamAddress(value) {
  return value >= 0xd00000 && value <= 0xffffff;
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

function pushUnique(list, key, value) {
  if (!list.some((entry) => entry[key] === value[key])) {
    list.push(value);
  }
}

function analyzeTarget(target) {
  const instructions = [];
  const cpInstructions = [];
  const callTargets = [];
  const jumpTargets = [];
  const ramPointerSeeds = [];
  const directRamReads = [];
  const directRamWrites = [];
  const computedJumpSites = [];

  let pc = target.address;
  const windowEnd = Math.min(target.address + WINDOW_BYTES, rom.length);

  while (pc < windowEnd) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      if (!inst || !inst.length) break;

      const rendered = formatInstruction(inst);
      instructions.push({
        pc,
        bytes: bytesHex(rom.slice(pc, pc + inst.length)),
        text: rendered,
        tag: inst.tag,
      });

      if (inst.tag === 'alu-imm' && inst.op === 'cp') {
        cpInstructions.push({
          pc: hex(pc),
          value: hex(inst.value, 2),
          matchesKnownActionCode: ACTION_CODES.has(inst.value),
        });
      }

      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        callTargets.push({
          pc: hex(pc),
          target: hex(inst.target),
          kind: inst.tag,
          condition: inst.condition ?? null,
        });
      }

      if (
        inst.tag === 'jp' ||
        inst.tag === 'jp-conditional' ||
        inst.tag === 'jr' ||
        inst.tag === 'jr-conditional' ||
        inst.tag === 'djnz'
      ) {
        jumpTargets.push({
          pc: hex(pc),
          target: hex(inst.target),
          kind: inst.tag,
          condition: inst.condition ?? null,
        });
      }

      if (inst.tag === 'jp-hl' || inst.tag === 'jp-ix' || inst.tag === 'jp-indirect') {
        computedJumpSites.push({
          pc: hex(pc),
          kind: inst.tag,
        });
      }

      if (inst.tag === 'ld-pair-imm' && isRamAddress(inst.value)) {
        pushUnique(ramPointerSeeds, 'pair', {
          pair: inst.pair,
          address: hex(inst.value),
        });
      }

      if (inst.tag === 'ld-reg-mem' && isRamAddress(inst.addr)) {
        pushUnique(directRamReads, 'address', {
          address: hex(inst.addr),
          kind: inst.tag,
        });
      }

      if (inst.tag === 'ld-pair-mem' && isRamAddress(inst.addr) && inst.direction !== 'to-mem') {
        pushUnique(directRamReads, 'address', {
          address: hex(inst.addr),
          kind: inst.tag,
        });
      }

      if (inst.tag === 'ld-mem-reg' && isRamAddress(inst.addr)) {
        pushUnique(directRamWrites, 'address', {
          address: hex(inst.addr),
          kind: inst.tag,
        });
      }

      if (inst.tag === 'ld-pair-mem' && isRamAddress(inst.addr) && inst.direction === 'to-mem') {
        pushUnique(directRamWrites, 'address', {
          address: hex(inst.addr),
          kind: inst.tag,
        });
      }

      pc = inst.nextPc;
    } catch (error) {
      instructions.push({
        pc,
        bytes: bytesHex(rom.slice(pc, pc + 1)),
        text: `decode_error: ${error.message}`,
        tag: 'decode-error',
      });
      pc += 1;
    }
  }

  const matchedActionCodes = cpInstructions
    .filter((entry) => entry.matchesKnownActionCode)
    .map((entry) => entry.value);

  const notes = [target.note];

  if (cpInstructions.length === 0) {
    notes.push('No CP immediate instructions in this 120-byte window.');
  } else if (matchedActionCodes.length === 0) {
    notes.push('CPs exist, but none match the expected action-code set from phases 403-405.');
  } else {
    notes.push(`Matched known action-code compares: ${matchedActionCodes.join(', ')}.`);
  }

  if (computedJumpSites.length === 0) {
    notes.push('No computed jump (`JP (HL)` / `JP (IX)` / similar) in the scanned window.');
  }

  if (
    (target.address === 0x07F954 || target.address === 0x07F8CC || target.address === 0x07F8FA) &&
    cpInstructions.length === 0
  ) {
    notes.push('This window is dominated by HL/DE pointer setup and tail-jumps into the shared copy core near `0x07F974` / `0x07F96C`.');
  }

  if (target.address === 0x07FA74) {
    notes.push('Primary entry seeds `HL=0xD00603`, stores `00 80 10`, then zero-fills the remaining bytes of the slot.');
  }

  if (target.address === 0x07C74F) {
    notes.push('The only CP in the top-five set is `cp 0x10` at `0x07C7AD`, inside an arithmetic helper chain that also flips bit 7 of `0xD00603` and updates `0xD005F9`.');
  }

  return {
    target: hex(target.address),
    name: target.name,
    windowBytes: WINDOW_BYTES,
    cpInstructions,
    matchedActionCodes,
    callTargets,
    jumpTargets,
    ramPointerSeeds,
    directRamReads,
    directRamWrites,
    computedJumpSites,
    containsDispatchTable: computedJumpSites.length > 0,
    notes,
    instructions,
  };
}

function printResult(result) {
  const summary = {
    target: result.target,
    name: result.name,
    windowBytes: result.windowBytes,
    cpInstructions: result.cpInstructions,
    matchedActionCodes: result.matchedActionCodes,
    callTargets: result.callTargets,
    jumpTargets: result.jumpTargets,
    ramPointerSeeds: result.ramPointerSeeds,
    directRamReads: result.directRamReads,
    directRamWrites: result.directRamWrites,
    containsDispatchTable: result.containsDispatchTable,
    computedJumpSites: result.computedJumpSites,
    notes: result.notes,
  };

  console.log(`\n=== ${result.target} ${result.name} ===`);
  console.log(JSON.stringify(summary, null, 2));
  console.log('disassembly:');

  for (const row of result.instructions) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
  }
}

console.log('Phase 406: top action-subroutine static trace');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window size: ${WINDOW_BYTES} bytes`);
console.log(`Known action-code CP set: ${Array.from(ACTION_CODES, (value) => hex(value, 2)).join(', ')}`);

for (const target of TARGETS) {
  printResult(analyzeTarget(target));
}
