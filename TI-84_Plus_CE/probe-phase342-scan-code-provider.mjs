#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');

const RAM_MBASE = 0xD0;
const IY_BASE = 0xD00080;

const CALLER_CONTEXT_START = 0x08C39C;
const ENTRY_START = 0x0A27DD;
const ENTRY_MAX_BYTES = 0x60;
const SHARED_EPILOGUE = 0x0A1A36;
const CALL_TARGET = 0x03D1C3;
const ADJACENT_ROUTINE = 0x0A2802;

const SHORT_PREFIXES = new Set(['sis', 'lis']);
const HARD_STOP_TAGS = new Set(['ret', 'jp', 'jp-conditional', 'jp-indirect', 'reti', 'retn']);

const NAMED_RAM = new Map([
  [0xD00092, 'IY+0x12 status flag'],
  [0xD0009B, 'IY+0x1B key-available gate'],
  [0xD0058C, 'CoorMon key/dispatch byte'],
  [0xD005F5, 'deferred callback countdown'],
  [0xD005F6, 'deferred callback pointer'],
  [0xD02504, 'adjacent routine input byte'],
  [0xD00795, 'scratch pointer slot'],
  [0xD007C4, 'scratch copy target'],
  [0xD007C7, 'adjacent routine latched byte 0'],
  [0xD007C8, 'adjacent routine latched byte 1'],
  [0xD007C9, 'adjacent routine masked flag byte'],
  [0xD02AD2, 'adjacent routine pointer copy'],
]);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function signed8(value) {
  const byte = value & 0xFF;
  return byte < 0x80 ? byte : byte - 0x100;
}

function disp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function instructionBytes(rom, pc, length) {
  return Array.from(
    rom.subarray(pc, Math.min(rom.length, pc + Math.max(1, length))),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatAddressOperand(inst) {
  const addr = Number(inst?.addr ?? 0) >>> 0;
  if (SHORT_PREFIXES.has(inst?.modePrefix)) {
    const effective = effectiveMemoryAddress(inst);
    return `${hex(addr, 4)} => ${hex(effective)}`;
  }
  return hex(addr);
}

function effectiveMemoryAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (SHORT_PREFIXES.has(inst.modePrefix)) {
    return (((RAM_MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0) & 0xFFFFFF;
  }
  return (inst.addr >>> 0) & 0xFFFFFF;
}

function effectiveIYAddress(inst) {
  if (inst?.indexRegister !== 'iy') {
    return null;
  }
  return (IY_BASE + signed8(inst.displacement ?? 0)) & 0xFFFFFF;
}

function safeDecode(rom, pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {
    // Fall back to raw byte.
  }

  return {
    pc,
    length: 1,
    tag: 'db',
    value: rom[pc] ?? 0,
    mode: 'adl',
    modePrefix: null,
  };
}

function formatInstructionText(inst) {
  if (!inst) {
    return 'db ?';
  }

  switch (inst.tag) {
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'ei': return withPrefix(inst, 'ei');
    case 'di': return withPrefix(inst, 'di');
    case 'exx': return withPrefix(inst, 'exx');
    case 'ex-de-hl': return withPrefix(inst, 'ex de, hl');
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ret': return withPrefix(inst, 'ret');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withPrefix(inst, `ld (${formatAddressOperand(inst)}), ${inst.pair}`)
        : withPrefix(inst, `ld ${inst.pair}, (${formatAddressOperand(inst)})`);
    case 'ld-mem-pair': return withPrefix(inst, `ld (${formatAddressOperand(inst)}), ${inst.pair}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-mem': return withPrefix(inst, `ld ${inst.dest}, (${formatAddressOperand(inst)})`);
    case 'ld-mem-reg': return withPrefix(inst, `ld (${formatAddressOperand(inst)}), ${inst.src}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-imm': return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'ld-special': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, (${inst.indexRegister}${disp(signed8(inst.displacement ?? 0))})`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, (${inst.indexRegister}${disp(signed8(inst.displacement ?? 0))})`);
    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, (${inst.indexRegister}${disp(signed8(inst.displacement ?? 0))})`);
    case 'db': return withPrefix(inst, `db ${hexByte(inst.value ?? 0)}`);
    default: return withPrefix(inst, inst.tag ?? 'unknown');
  }
}

function disassembleSequential(rom, start, options = {}) {
  const {
    maxBytes = 0x40,
    maxInstructions = 64,
    stopTags = HARD_STOP_TAGS,
    stopOnConditionalRet = false,
  } = options;

  const instructions = [];
  const limit = start + maxBytes;
  let pc = start;

  for (let index = 0; index < maxInstructions && pc < limit; index += 1) {
    const inst = safeDecode(rom, pc);
    const entry = {
      ...inst,
      bytes: instructionBytes(rom, pc, inst.length),
      text: formatInstructionText(inst),
    };
    instructions.push(entry);

    pc += Math.max(1, inst.length);

    if (stopTags.has(inst.tag)) {
      break;
    }
    if (stopOnConditionalRet && inst.tag === 'ret-conditional') {
      break;
    }
  }

  return instructions;
}

function ramLabel(address) {
  return NAMED_RAM.get(address) ?? 'unnamed RAM byte';
}

function formatLine(inst, noteText = '') {
  const base = `${hex(inst.pc)}  ${inst.bytes.padEnd(15)}  ${inst.text.padEnd(30)}`;
  return noteText ? `${base} ; ${noteText}` : base;
}

function printSection(title, instructions, noteBuilder) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const inst of instructions) {
    const note = noteBuilder ? noteBuilder(inst) : '';
    console.log(formatLine(inst, note));
  }
  console.log('');
}

function entryNotes(inst) {
  switch (inst.pc) {
    case 0x0A27DD: return 'preserve incoming A/flags from CoorMon';
    case 0x0A27DE:
    case 0x0A27DF:
    case 0x0A27E0: return 'preserve caller registers';
    case 0x0A27E1: {
      const addr = effectiveIYAddress(inst);
      return `IY flag check: BIT 6 at ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A27E5: return 'if the gate flag is already set, skip the rearm path';
    case 0x0A27E7: return 'HL = 0 so the callback pointer can be cleared';
    case 0x0A27EB: {
      const addr = effectiveMemoryAddress(inst);
      return `clear ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A27EF: return 'A = 1 for the helper countdown';
    case 0x0A27F1: {
      const addr = effectiveMemoryAddress(inst);
      return `write ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A27F5: return 'tick deferred helper at 0x03D1C3';
    case 0x0A27F9: return 're-enable interrupts before exiting';
    case 0x0A27FA: {
      const addr = effectiveIYAddress(inst);
      return `IY flag set: SET 0 at ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A27FE: return 'tail-jump to shared epilogue';
    default: return '';
  }
}

function callerNotes(inst) {
  switch (inst.pc) {
    case 0x08C39C: {
      const addr = effectiveMemoryAddress(inst);
      return `A is loaded from ${hex(addr)} (${ramLabel(addr)}) before the 0x0A27DD call`;
    }
    case 0x08C3A0: {
      const addr = effectiveIYAddress(inst);
      return `IY bookkeeping flag at ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x08C3A4: return 'earlier helper call in the event loop';
    case 0x08C3A8: return 'CoorMon calls the stub at 0x0A27DD here';
    case 0x08C3AC: return 'OR A tests the same A value after the call returns';
    case 0x08C3AD: return 'if A != 0, continue into the key-dispatch cascade';
    default: return '';
  }
}

function helperNotes(inst) {
  switch (inst.pc) {
    case 0x03D1C3: return `HL points at ${hex(0xD005F5)} (${ramLabel(0xD005F5)})`;
    case 0x03D1C7: return `decrement the byte stored at ${hex(0xD005F5)}`;
    case 0x03D1C8: return 'return early while the countdown is still nonzero';
    case 0x03D1C9: {
      const addr = effectiveMemoryAddress(inst);
      return `load callback pointer from ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x03D1CD: return 'invoke secondary helper 0x0A32F9 after the countdown expires';
    case 0x03D1D1: return 'helper returns to 0x0A27F9';
    default: return '';
  }
}

function epilogueNotes(inst) {
  switch (inst.pc) {
    case 0x0A1A36:
    case 0x0A1A37:
    case 0x0A1A38: return 'restore saved caller register';
    case 0x0A1A39: return 'restore the original AF, including the incoming A byte';
    case 0x0A1A3A: return 'RET returns that restored A to CoorMon';
    default: return '';
  }
}

function adjacentNotes(inst) {
  switch (inst.pc) {
    case 0x0A2802: {
      const addr = effectiveMemoryAddress(inst);
      return `read pointer from ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A2806: {
      const addr = effectiveMemoryAddress(inst);
      return `copy pointer into ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A280A: {
      const addr = effectiveMemoryAddress(inst);
      return `this is the ${hex(addr)} (${ramLabel(addr)}) read from the raw bytes, but it is outside 0x0A27DD`;
    }
    case 0x0A280E:
    case 0x0A2816:
    case 0x0A2820: {
      const addr = effectiveMemoryAddress(inst);
      return `store to ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A2812:
    case 0x0A281A: {
      const addr = effectiveMemoryAddress(inst);
      return `read from ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A281E: return 'mask bit 4 before storing to D007C9';
    case 0x0A2824: {
      const addr = effectiveMemoryAddress(inst);
      return `read pointer from ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A2828: {
      const addr = effectiveMemoryAddress(inst);
      return `write pointer to ${hex(addr)} (${ramLabel(addr)})`;
    }
    case 0x0A282C: return 'this separate routine returns here';
    default: return '';
  }
}

function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM file not found: ${ROM_PATH}`);
  }

  const rom = fs.readFileSync(ROM_PATH);

  const callerContext = disassembleSequential(rom, CALLER_CONTEXT_START, {
    maxBytes: 0x18,
    maxInstructions: 8,
    stopTags: new Set(),
  });
  const entry = disassembleSequential(rom, ENTRY_START, {
    maxBytes: ENTRY_MAX_BYTES,
    maxInstructions: 24,
  });
  const helper = disassembleSequential(rom, CALL_TARGET, {
    maxBytes: 0x18,
    maxInstructions: 12,
    stopTags: new Set(['ret', 'jp', 'jp-conditional', 'jp-indirect', 'reti', 'retn']),
    stopOnConditionalRet: false,
  });
  const epilogue = disassembleSequential(rom, SHARED_EPILOGUE, {
    maxBytes: 0x10,
    maxInstructions: 8,
  });
  const adjacent = disassembleSequential(rom, ADJACENT_ROUTINE, {
    maxBytes: 0x40,
    maxInstructions: 20,
  });

  console.log('Phase 342: 0x0A27DD scan-code provider trace');
  console.log('='.repeat(47));
  console.log(`ROM: ${ROM_PATH}`);
  console.log('');

  printSection('Caller context (CoorMon around 0x08C3A8)', callerContext, callerNotes);
  printSection('Function entry stub at 0x0A27DD', entry, entryNotes);
  printSection('CALL target 0x03D1C3', helper, helperNotes);
  printSection('Shared epilogue at 0x0A1A36', epilogue, epilogueNotes);
  printSection('Adjacent routine after the unconditional JP (0x0A2802)', adjacent, adjacentNotes);

  console.log('Conclusions');
  console.log('-----------');
  console.log(`- 0x0A27DD does not load A from RAM. It saves AF immediately, updates ${hex(0xD005F5)} and ${hex(0xD005F6)}, then restores AF in the shared epilogue.`);
  console.log(`- The byte CoorMon tests after the call is loaded earlier at ${hex(0x08C39C)} from ${hex(0xD0058C)} (${ramLabel(0xD0058C)}).`);
  console.log(`- The first IY flag test is BIT 6,(IY+0x1B) at ${hex(0xD0009B)}. The stub later SETs bit 0 at ${hex(0xD00092)} before it exits.`);
  console.log(`- 0x03D1C3 is a countdown helper: it decrements ${hex(0xD005F5)}, returns early while nonzero, and when it reaches zero it loads a pointer from ${hex(0xD005F6)} before calling 0x0A32F9.`);
  console.log(`- The raw-byte sequence LD A,(${hex(0xD02504)}) belongs to the next routine at ${hex(0x0A2802)}, not to 0x0A27DD, because ${hex(0x0A27FE)} is an unconditional JP to ${hex(0x0A1A36)}.`);
  console.log(`- Return path: 0x0A27DD reaches RET via ${hex(0x0A1A36)}. POP AF restores the original incoming A, so the function preserves A instead of synthesizing a new scan code itself.`);
}

main();
