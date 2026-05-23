#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ENTRY = 0x002288;
const MAX_BYTES = 200;
const MAX_INSTRUCTIONS = 80;
const EXPECTED_ROM_SIZE = 4 * 1024 * 1024;

const CODE_LABELS = new Map([
  [0x00015C, '_indcall entry stub (JP 0x002288)'],
  [0x00218A, 'stack-frame helper'],
  [0x002197, 'stack-frame helper variant'],
  [0x0021C2, 'null-check helper'],
  [0x002288, '_indcall body (JP (IY))'],
  [0x0121EF, 'known D143EA callback target from phase 412/414'],
  [0x015185, 'Channel 2 completion callback'],
  [0x0151FE, 'Channel 2 staging helper'],
]);

const RAM_LABELS = new Map([
  [0xD143EA, 'descriptor callback slot / completion hook'],
  [0xD1440E, 'notification lock'],
  [0xD17779, 'Channel 2 active flag'],
  [0xD1777A, 'Channel 2 completion byte'],
  [0xD177B7, 'notification sentinel (0x55 = installed)'],
]);

function hex(value, width = 6) {
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function raw(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    byte => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement < 0 ? '-' : '+';
  return `(${String(indexRegister).toUpperCase()}${sign}${hex(Math.abs(displacement), 2)})`;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
    };
  }
}

function formatInstruction(inst) {
  const u = value => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${u(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${u(inst.condition)},${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${u(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${u(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'push':
      return `PUSH ${u(inst.pair)}`;
    case 'pop':
      return `POP ${u(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${u(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr)}),${u(inst.pair)}`;
      }
      return `LD ${u(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${u(inst.pair)}`;
    case 'ld-reg-imm':
      return `LD ${u(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${u(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${u(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${u(inst.dest)},${u(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${u(inst.dest)},(${u(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${u(inst.dest)}),${u(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'ld-pair-indexed':
      return `LD ${u(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixiy-indexed':
      return `LD ${u(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-ixd':
      return `LD ${u(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${u(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ld-sp-pair':
      return `LD SP,${u(inst.pair)}`;
    case 'inc-pair':
      return `INC ${u(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${u(inst.pair)}`;
    case 'inc-reg':
      return `INC ${u(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${u(inst.reg)}`;
    case 'alu-reg':
      return `${u(inst.op)} ${u(inst.src)}`;
    case 'alu-imm':
      return `${u(inst.op)} ${hex(inst.value, 2)}`;
    case 'alu-ixd':
      return `${u(inst.op)} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `ADD ${u(inst.dest ?? 'hl')},${u(inst.src ?? inst.pair)}`;
    case 'adc-pair':
      return `ADC HL,${u(inst.src)}`;
    case 'sbc-pair':
      return `SBC HL,${u(inst.src)}`;
    case 'lea':
      return `LEA ${u(inst.dest)},${u(inst.base)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'in0':
      return `IN0 ${u(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${u(inst.reg)}`;
    case 'in-imm':
      return `IN A,(${hex(inst.port, 2)})`;
    case 'out-imm':
      return `OUT (${hex(inst.port, 2)}),A`;
    case 'in-reg':
      return `IN ${u(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${u(inst.reg)}`;
    case 'tst-reg':
      return `TST A,${u(inst.reg)}`;
    case 'tst-ind':
      return 'TST A,(HL)';
    case 'tst-imm':
      return `TST A,${hex(inst.value, 2)}`;
    case 'tstio':
      return `TSTIO ${hex(inst.value, 2)}`;
    case 'cpi':
      return 'CPI';
    case 'cpd':
      return 'CPD';
    case 'cpir':
      return 'CPIR';
    case 'cpdr':
      return 'CPDR';
    case 'halt':
      return 'HALT';
    case 'slp':
      return 'SLP';
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'nop':
      return 'NOP';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function getLinearNextPc(inst) {
  if (inst.tag === 'jp' || inst.tag === 'jr') {
    return inst.target;
  }

  if (inst.tag === 'jp-indirect') {
    return null;
  }

  return inst.nextPc;
}

function disassembleLinear(entry, maxBytes = MAX_BYTES, maxInstructions = MAX_INSTRUCTIONS) {
  const instructions = [];
  const visited = new Set();
  let pc = entry;
  let bytesConsumed = 0;
  let stopReason = 'instruction limit reached';

  while (instructions.length < maxInstructions && bytesConsumed < maxBytes) {
    if (pc < 0 || pc >= rom.length) {
      stopReason = `PC left ROM at ${hex(pc)}`;
      break;
    }

    if (visited.has(pc)) {
      stopReason = `revisited ${hex(pc)}`;
      break;
    }

    visited.add(pc);
    const inst = safeDecode(pc);
    instructions.push(inst);
    bytesConsumed += inst.length;

    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
      stopReason = inst.tag.toUpperCase();
      break;
    }

    if (inst.tag === 'halt' || inst.tag === 'slp') {
      stopReason = inst.tag.toUpperCase();
      break;
    }

    if (inst.tag === 'jp-indirect') {
      stopReason = `indirect jump via ${String(inst.indirectRegister).toUpperCase()}`;
      break;
    }

    if (bytesConsumed >= maxBytes) {
      stopReason = `${maxBytes}-byte budget exhausted`;
      break;
    }

    const nextPc = getLinearNextPc(inst);
    if (nextPc == null) {
      stopReason = 'control flow ended';
      break;
    }

    pc = nextPc;
  }

  return {
    instructions,
    bytesConsumed,
    stopReason,
  };
}

function ramAccessType(inst) {
  if (inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-reg') {
    return 'write';
  }

  if (inst.tag === 'ld-reg-mem') {
    return 'read';
  }

  if (inst.tag === 'ld-pair-mem') {
    return inst.direction === 'to-mem' ? 'write' : 'read';
  }

  return null;
}

function describeTarget(target) {
  return CODE_LABELS.get(target) ?? '';
}

function collectTrace(instructions) {
  const ramRefs = [];
  const portIo = [];
  const callTargets = [];
  const jumpTargets = [];

  for (const inst of instructions) {
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push({
        pc: hex(inst.pc),
        target: hex(inst.target),
        conditional: inst.tag === 'call-conditional' ? String(inst.condition).toUpperCase() : '',
        label: describeTarget(inst.target),
      });
    }

    if (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jr' || inst.tag === 'jr-conditional') {
      jumpTargets.push({
        pc: hex(inst.pc),
        target: hex(inst.target),
        conditional: inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional'
          ? String(inst.condition).toUpperCase()
          : '',
        followed: inst.tag === 'jp' || inst.tag === 'jr',
        label: describeTarget(inst.target),
      });
    }

    if (inst.tag === 'jp-indirect') {
      jumpTargets.push({
        pc: hex(inst.pc),
        target: `(${String(inst.indirectRegister).toUpperCase()})`,
        conditional: '',
        followed: false,
        label: 'dynamic indirect target',
      });
    }

    const access = ramAccessType(inst);
    if (access && typeof inst.addr === 'number' && inst.addr >= 0xD00000) {
      ramRefs.push({
        pc: hex(inst.pc),
        access,
        addr: hex(inst.addr),
        label: RAM_LABELS.get(inst.addr) ?? '',
        via: formatInstruction(inst),
      });
    }

    if (
      inst.tag === 'in0' ||
      inst.tag === 'out0' ||
      inst.tag === 'in-imm' ||
      inst.tag === 'out-imm' ||
      inst.tag === 'in-reg' ||
      inst.tag === 'out-reg' ||
      inst.tag === 'tstio'
    ) {
      portIo.push({
        pc: hex(inst.pc),
        via: formatInstruction(inst),
      });
    }
  }

  return {
    ramRefs,
    portIo,
    callTargets,
    jumpTargets,
  };
}

function hasChannelDispatchComparison(instructions) {
  for (const inst of instructions) {
    if (inst.tag === 'alu-reg' && inst.op === 'cp') return true;
    if (inst.tag === 'alu-imm' && inst.op === 'cp') return true;
    if (inst.tag === 'alu-ixd' && inst.op === 'cp') return true;
    if (inst.tag === 'cpi' || inst.tag === 'cpd' || inst.tag === 'cpir' || inst.tag === 'cpdr') return true;
  }

  return false;
}

function printTable(title, entries, renderEntry) {
  console.log(title);
  if (!entries.length) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const entry of entries) {
    console.log(renderEntry(entry));
  }
  console.log('');
}

if (!fs.existsSync(ROM_PATH)) {
  console.error(`ROM not found: ${ROM_PATH}`);
  process.exit(1);
}

const rom = fs.readFileSync(ROM_PATH);
if (rom.length !== EXPECTED_ROM_SIZE) {
  console.error(`Unexpected ROM size: ${rom.length} bytes (expected ${EXPECTED_ROM_SIZE})`);
  process.exit(1);
}

const trace = disassembleLinear(ENTRY);
const meta = collectTrace(trace.instructions);
const stackFrameCalls = meta.callTargets.filter(entry => entry.target === hex(0x00218A) || entry.target === hex(0x002197));
const writesToNotificationRam = meta.ramRefs.filter(entry => entry.access === 'write');
const trailingBytes = raw(ENTRY + (trace.instructions[0]?.length ?? 0), 8);

console.log('Phase 415 trace: 0x002288 completion-dispatch follow-up');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Entry: ${hex(ENTRY)} | Reachable bytes: ${trace.bytesConsumed} | Stop: ${trace.stopReason}`);
console.log('');

console.log('Instruction trace:');
for (const inst of trace.instructions) {
  const noteParts = [];

  if ((inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'jp' || inst.tag === 'jp-conditional') && CODE_LABELS.has(inst.target)) {
    noteParts.push(CODE_LABELS.get(inst.target));
  }

  if (inst.tag === 'jp-indirect') {
    noteParts.push('dynamic dispatch through IY');
  }

  if (typeof inst.addr === 'number' && RAM_LABELS.has(inst.addr)) {
    noteParts.push(RAM_LABELS.get(inst.addr));
  }

  const suffix = noteParts.length ? ` ; ${noteParts.join(' | ')}` : '';
  console.log(`${hex(inst.pc)}  ${raw(inst.pc, inst.length).padEnd(17, ' ')}  ${formatInstruction(inst)}${suffix}`);
}
console.log('');

printTable('RAM references (absolute >= 0xD00000):', meta.ramRefs, entry => {
  const label = entry.label ? ` ; ${entry.label}` : '';
  return `  ${entry.pc}  ${entry.access.toUpperCase()} ${entry.addr} via ${entry.via}${label}`;
});

printTable('Port I/O:', meta.portIo, entry => `  ${entry.pc}  ${entry.via}`);

printTable('CALL targets:', meta.callTargets, entry => {
  const cond = entry.conditional ? `${entry.conditional} ` : '';
  const label = entry.label ? ` ; ${entry.label}` : '';
  return `  ${entry.pc}  ${cond}${entry.target}${label}`;
});

printTable('JP/JR targets:', meta.jumpTargets, entry => {
  const cond = entry.conditional ? `${entry.conditional} ` : '';
  const followed = entry.followed ? 'followed' : 'not followed';
  const label = entry.label ? ` ; ${entry.label}` : '';
  return `  ${entry.pc}  ${cond}${entry.target} (${followed})${label}`;
});

console.log('Pattern checks:');
console.log(`  stack frame helper CALL 0x00218A/0x002197: ${stackFrameCalls.length ? 'present' : 'absent'}`);
console.log(`  CP-based channel dispatch comparisons: ${hasChannelDispatchComparison(trace.instructions) ? 'present' : 'absent'}`);
console.log(`  notification RAM writes (D177B7/D143EA/D1440E/etc.): ${writesToNotificationRam.length ? 'present' : 'absent'}`);
console.log(`  first unreachable bytes after the terminator: ${trailingBytes || '(none)'}`);
console.log('');

console.log('Interpretation:');
console.log('- The reachable body at 0x002288 is a single instruction: JP (IY).');
console.log('- This address does not read or write RAM, does not touch ports, and does not inspect a channel ID.');
console.log('- Any completion-specific cleanup must happen before the call at 0x015185 or inside the callback pointer already loaded into IY.');
