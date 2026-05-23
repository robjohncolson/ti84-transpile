#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const START = 0x00C9A0;

const PORT_LABELS = new Map([
  [0x3124, 'helper mode port'],
  [0x314C, 'USB/link stage control'],
  [0x313D, 'USB/link control'],
  [0x313C, 'USB/link control'],
  [0x3138, 'USB/link mask/control'],
  [0x313A, 'link notification control'],
  [0x3100, 'USB/link controller core control'],
  [0x3108, 'USB notification control'],
  [0x3101, 'USB/link secondary control'],
]);

const RAM_LABELS = new Map([
  [0xD14040, 'app-context header byte 0'],
  [0xD14041, 'app-context header byte 1'],
  [0xD1407E, 'dispatch_key follow-up gate'],
  [0xD1408C, 'unnamed app-context state byte'],
  [0xD1408D, 'USB worker front-end gate byte'],
  [0xD1408E, 'unnamed app-context state byte'],
  [0xD1408F, 'unnamed app-context state byte'],
  [0xD14090, 'unnamed app-context state byte'],
  [0xD140AF, '24-bit pointer/handle slot'],
  [0xD140B2, 'notification/status byte'],
]);

const CALL_LABELS = new Map([
  [0x0075F7, 'helper that writes (stack_arg & 0x07) to port 0x3124; caller pushes 0x07 here'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(pc, length) {
  return Array.from(rom.slice(pc, pc + length), hexByte).join(' ');
}

function isRam(addr) {
  return addr >= 0xD00000 && addr <= 0xD3FFFF;
}

function ramLabel(addr) {
  return RAM_LABELS.get(addr) ?? 'unnamed RAM slot';
}

function portLabel(port) {
  return PORT_LABELS.get(port) ?? 'unlabeled 0x31xx control port';
}

function portSummaryTag(port, valueText) {
  if (port === 0x3100 && valueText.includes('& ~0x10')) return '[release reset bit 4]';
  if (port === 0x3100 && valueText.includes('| 0x10')) return '[assert reset bit 4]';
  if (port === 0x314C) return '[stage advance/reset sequencing]';
  if (
    port === 0x3124 ||
    port === 0x3138 ||
    port === 0x313A ||
    port === 0x313C ||
    port === 0x313D ||
    port === 0x3108 ||
    port === 0x3101
  ) {
    return '[control register init/reset]';
  }
  return '';
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: String(error),
    };
  }
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()},${hex(inst.value)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-pair-mem':
      return `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`;
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hex(inst.value, 2)}`;
    case 'ld-special':
      return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()},${hex(inst.value, 2)}`;
    case 'out-reg':
      return `OUT (C),${String(inst.reg).toUpperCase()}`;
    case 'in-reg':
      return `IN ${String(inst.reg).toUpperCase()},(C)`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'bit-set':
      return `SET ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-res':
      return `RES ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    case 'ret':
      return 'RET';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function makeState() {
  return {
    aExpr: null,
    aValue: null,
    bValue: null,
    cValue: null,
    bcValue: null,
    hlValue: null,
  };
}

function updateState(state, inst) {
  switch (inst.tag) {
    case 'ld-pair-imm':
      if (inst.pair === 'bc') {
        state.bcValue = inst.value >>> 0;
        state.bValue = (inst.value >>> 8) & 0xFF;
        state.cValue = inst.value & 0xFF;
      }
      if (inst.pair === 'hl') {
        state.hlValue = inst.value >>> 0;
      }
      break;
    case 'inc-pair':
      if (inst.pair === 'hl' && state.hlValue != null) {
        state.hlValue = (state.hlValue + 1) >>> 0;
      }
      break;
    case 'ld-reg-imm':
      if (inst.dest === 'a') {
        state.aValue = inst.value & 0xFF;
        state.aExpr = hex(inst.value, 2);
      }
      break;
    case 'ld-reg-reg':
      if (inst.dest === 'a') {
        if (inst.src === 'b' && state.bValue != null) {
          state.aValue = state.bValue;
          state.aExpr = hex(state.bValue, 2);
        } else if (inst.src === 'c' && state.cValue != null) {
          state.aValue = state.cValue;
          state.aExpr = hex(state.cValue, 2);
        } else {
          state.aValue = null;
          state.aExpr = String(inst.src).toUpperCase();
        }
      }
      break;
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') {
        state.aValue = 0;
        state.aExpr = hex(0, 2);
      }
      break;
    case 'ld-special':
      if (inst.dest === 'a' && inst.src === 'i') {
        state.aValue = null;
        state.aExpr = 'I';
      }
      break;
    case 'in-reg':
      if (inst.reg === 'a') {
        state.aValue = null;
        state.aExpr = state.bcValue != null ? `port[${hex(state.bcValue, 4)}]` : 'port[(BC)]';
      }
      break;
    case 'bit-set':
      if (inst.reg === 'a') {
        const mask = hex(1 << inst.bit, 2);
        state.aValue = state.aValue == null ? null : state.aValue | (1 << inst.bit);
        state.aExpr = `${state.aExpr ?? 'A'} | ${mask}`;
      }
      break;
    case 'bit-res':
      if (inst.reg === 'a') {
        const mask = hex(1 << inst.bit, 2);
        state.aValue = state.aValue == null ? null : state.aValue & ~(1 << inst.bit) & 0xFF;
        state.aExpr = `${state.aExpr ?? 'A'} & ~${mask}`;
      }
      break;
    case 'pop':
      if (inst.pair === 'af') {
        state.aValue = null;
        state.aExpr = 'restored A';
      }
      if (inst.pair === 'bc') {
        state.bcValue = null;
        state.bValue = null;
        state.cValue = null;
      }
      break;
    default:
      break;
  }
}

function annotate(pc, inst, state, callTargets, ramAccesses, portWrites) {
  const notes = [];

  if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc' && PORT_LABELS.has(inst.value)) {
    notes.push(`select port ${hex(inst.value, 4)} ${portLabel(inst.value)}`);
  }

  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl' && isRam(inst.value)) {
    notes.push(`point HL at ${hex(inst.value)} ${ramLabel(inst.value)}`);
  }

  if (inst.tag === 'ld-ind-imm' && state.hlValue != null && isRam(state.hlValue)) {
    notes.push(`RAM ${hex(state.hlValue)} ${ramLabel(state.hlValue)} <= ${hex(inst.value, 2)}`);
    ramAccesses.push(`- ${hex(state.hlValue)} ${ramLabel(state.hlValue)} <= ${hex(inst.value, 2)}`);
  }

  if (inst.tag === 'ld-mem-pair' && isRam(inst.addr)) {
    const valueText = inst.pair === 'bc' && state.bcValue != null ? hex(state.bcValue) : String(inst.pair).toUpperCase();
    notes.push(`RAM ${hex(inst.addr)} ${ramLabel(inst.addr)} <= ${valueText}`);
    ramAccesses.push(`- ${hex(inst.addr)} ${ramLabel(inst.addr)} <= ${valueText}`);
  }

  if (inst.tag === 'ld-mem-reg' && isRam(inst.addr)) {
    const valueText = inst.src === 'a' && state.aExpr ? state.aExpr : String(inst.src).toUpperCase();
    notes.push(`RAM ${hex(inst.addr)} ${ramLabel(inst.addr)} <= ${valueText}`);
    ramAccesses.push(`- ${hex(inst.addr)} ${ramLabel(inst.addr)} <= ${valueText}`);
  }

  if (inst.tag === 'ld-reg-mem' && isRam(inst.addr)) {
    notes.push(`RAM read ${hex(inst.addr)} ${ramLabel(inst.addr)}`);
  }

  if (inst.tag === 'ld-pair-mem' && isRam(inst.addr)) {
    notes.push(`RAM read ${hex(inst.addr)} ${ramLabel(inst.addr)} -> ${String(inst.pair).toUpperCase()}`);
  }

  if (inst.tag === 'call') {
    callTargets.add(inst.target >>> 0);
    const label = CALL_LABELS.get(inst.target);
    if (inst.target === 0x0075F7) {
      portWrites.push(`- 0x3124 ${portLabel(0x3124)}: 0x07 [via CALL 0x0075F7; control register init/reset]`);
      notes.push(`${label}; synthetic port effect 0x3124 <= 0x07`);
    } else {
      notes.push(label ?? 'direct subcall');
    }
  }

  if (inst.tag === 'in-reg') {
    const port = state.bcValue;
    if (port != null) {
      notes.push(`port read ${hex(port, 4)} ${portLabel(port)}`);
    }
  }

  if ((inst.tag === 'bit-set' || inst.tag === 'bit-res') && inst.reg === 'a' && state.bcValue != null) {
    const op = inst.tag === 'bit-set' ? 'set' : 'clear';
    notes.push(`prepare ${op} bit ${inst.bit} in ${hex(state.bcValue, 4)} value`);
  }

  if (inst.tag === 'out-reg') {
    const port = state.bcValue;
    const portName = port != null ? portLabel(port) : 'port in BC';
    const valueText = inst.reg === 'a' ? (state.aExpr ?? 'A') : String(inst.reg).toUpperCase();
    const summaryTag = port != null ? portSummaryTag(port, valueText) : '';
    let action = `port write ${port != null ? hex(port, 4) : '(BC)'} ${portName} <= ${valueText}`;
    if (summaryTag) {
      action += ` ${summaryTag}`;
    }
    notes.push(action);
    if (port != null) {
      portWrites.push(`- ${hex(port, 4)} ${portName}: ${valueText}${summaryTag ? ` ${summaryTag}` : ''}`);
    }
  }

  if (pc === 0x00C9D5) {
    notes.push('capture caller interrupt-enable state via LD A,I / P-V from IFF2');
  }

  if (pc === 0x00CAEE) {
    notes.push('skip EI when interrupts were already disabled on entry');
  }

  if (pc === 0x00CAF2) {
    notes.push('restore interrupts when caller entered with IFF2=1');
  }

  if (inst.tag === 'rst' && inst.target === 0x08) {
    notes.push('sanity trap if BC no longer matches the expected port address');
  }

  return notes.join('; ');
}

console.log('# Phase 420 Probe: Static Trace of 0x00C9A0');
console.log('');

const state = makeState();
const callTargets = new Set();
const ramAccesses = [];
const portWrites = [];
const lines = [];
let endPc = START;

for (let pc = START, count = 0; count < 200; count++) {
  const inst = safeDecode(pc);
  const note = annotate(pc, inst, state, callTargets, ramAccesses, portWrites);
  const bytes = rawBytes(pc, inst.length).padEnd(17, ' ');
  const mnemonic = formatInstruction(inst).padEnd(25, ' ');

  lines.push(`${hex(pc)}  ${bytes} ${mnemonic}${note ? ` ; ${note}` : ''}`);
  endPc = inst.nextPc;
  updateState(state, inst);
  pc = inst.nextPc;

  if (inst.tag === 'ret') {
    break;
  }
}

console.log(`Function window: ${hex(START)}..${hex(endPc - 1)} (${endPc - START} bytes)`);
console.log('');
console.log('Disassembly:');
for (const line of lines) {
  console.log(line);
}

console.log('');
console.log('Call targets:');
for (const target of Array.from(callTargets).sort((a, b) => a - b)) {
  console.log(`- ${hex(target)}${CALL_LABELS.has(target) ? ` - ${CALL_LABELS.get(target)}` : ''}`);
}

console.log('');
console.log('RAM writes / reinitializations:');
for (const entry of ramAccesses) {
  console.log(entry);
}

console.log('');
console.log('Port writes / reset actions:');
for (const entry of portWrites) {
  console.log(entry);
}

console.log('');
console.log('High-level behavior:');
console.log('- Clear the D14040 header bytes, zero a 24-bit slot at D140AF, and clear seven D1407E/D1408C-D14090/D140B2 state bytes.');
console.log('- Save the caller interrupt state, disable interrupts, and call 0x0075F7 with stacked arg 0x07 so the helper drives port 0x3124.');
console.log('- Advance 0x314C through 0x02 then 0x04, then program 0x313D, 0x313C, 0x3138, and 0x313A control registers.');
console.log('- Pulse bit 4 on 0x3100 high then low, then set bit 0 on 0x3108, bit 1 on 0x3101, and bits 2/5/7 on 0x3100.');
console.log('- Restore the caller interrupt-enable state and return.');
