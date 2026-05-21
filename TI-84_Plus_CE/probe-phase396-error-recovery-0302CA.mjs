#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};

const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url).href);

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = readFileSync(ROM_PATH);

const MODE = 'adl';
const EXPECTED_ROM_SIZE = 0x400000;

const RECOVERY_GATE_START = 0x03029F;
const RECOVERY_ENTRY = 0x0302CA;
const RECOVERY_WINDOW_END = RECOVERY_ENTRY + 0x60;
const RECOVERY_GATE_WINDOW_END = 0x0302EA;

const DISPATCH_ENTRY = 0x08C5D7;
const DISPATCH_WINDOW_END = 0x08C700;

const TAIL_TARGET = 0x08C519;
const TAIL_WINDOW_END = 0x08C560;

const RAM_NAMES = new Map([
  [0xD0058C, 'kbdKey'],
  [0xD0058E, 'kbdToken'],
  [0xD007CA, 'cxMain'],
  [0xD007CD, 'context slot @ D007CD'],
  [0xD007D0, 'context slot @ D007D0'],
  [0xD007E0, 'cxCurApp / context-mode byte'],
  [0xD007FA, 'onSP / saved stack pointer'],
  [0xD0082E, 'scratch block @ D0082E'],
  [0xD02FD6, 'state word @ D02FD6'],
]);

const TARGET_NAMES = new Map([
  [0x022331, 'helper 0x022331'],
  [0x024027, 'helper 0x024027'],
  [0x025354, 'helper 0x025354'],
  [0x025396, 'helper 0x025396'],
  [0x027204, 'helper 0x027204'],
  [0x03C33D, 'CoorMon re-entry'],
  [0x03FBFD, 'tail jump @ 0x03FBFD'],
  [0x04A52C, 'helper 0x04A52C'],
  [0x0551EF, 'helper 0x0551EF'],
  [0x0620E6, 'helper 0x0620E6'],
  [0x08C519, 'action tail / CLEAR dispatch cluster'],
  [0x08C593, 'post-dispatch branch'],
  [0x08C5D7, 'action dispatch entry'],
  [0x08C66D, 'SysErrHandler'],
  [0x08C72F, 'CallMain'],
  [0x08C79F, 'NewContext'],
  [0x08C7AD, 'NewContext0'],
]);

const REF_OPS = [
  { opcode: 0xC3, kind: 'JP' },
  { opcode: 0xC2, kind: 'JP NZ' },
  { opcode: 0xCA, kind: 'JP Z' },
  { opcode: 0xD2, kind: 'JP NC' },
  { opcode: 0xDA, kind: 'JP C' },
  { opcode: 0xE2, kind: 'JP PO' },
  { opcode: 0xEA, kind: 'JP PE' },
  { opcode: 0xF2, kind: 'JP P' },
  { opcode: 0xFA, kind: 'JP M' },
  { opcode: 0xCD, kind: 'CALL' },
  { opcode: 0xC4, kind: 'CALL NZ' },
  { opcode: 0xCC, kind: 'CALL Z' },
  { opcode: 0xD4, kind: 'CALL NC' },
  { opcode: 0xDC, kind: 'CALL C' },
  { opcode: 0xE4, kind: 'CALL PO' },
  { opcode: 0xEC, kind: 'CALL PE' },
  { opcode: 0xF4, kind: 'CALL P' },
  { opcode: 0xFC, kind: 'CALL M' },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function signedDisp(value) {
  const n = Number(value ?? 0);
  return `${n < 0 ? '-' : '+'}${hexByte(Math.abs(n))}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${upper(indexRegister)}${signedDisp(displacement)})`;
}

function formatValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return hex(value, 4);
  if (modePrefix === 'sil' || modePrefix === 'lil') return hex(value, 6);
  if (value <= 0xFF) return hex(value, 2);
  if (value <= 0xFFFF) return hex(value, 4);
  return hex(value, 6);
}

function bytesHex(start, length) {
  return Array.from(
    rom.subarray(start, Math.min(start + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatAlu(op, operand) {
  const name = upper(op);
  if (name === 'ADD' || name === 'ADC' || name === 'SBC') {
    return `${name} A, ${operand}`;
  }
  return `${name} ${operand}`;
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'decodeError',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${signedDisp(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  if (!inst?.tag) return '???';

  switch (inst.tag) {
    case 'db':
      return `DB ${hexByte(inst.value)}`;
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'rst':
      return `RST ${hexByte(inst.target)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ex-af':
      return 'EX AF, AF\'';
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ex-sp-hl':
      return 'EX (SP), HL';
    case 'cpl':
      return 'CPL';
    case 'ccf':
      return 'CCF';
    case 'scf':
      return 'SCF';
    case 'daa':
      return 'DAA';
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${formatValue(inst.value, inst.modePrefix)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
      }
      return `LD ${upper(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(inst.value)}`;
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'ld-sp-pair':
      return `LD SP, ${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`;
    case 'ld-reg-ixd':
    case 'ld-reg-indexed':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
    case 'ld-indexed-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'adc-pair':
      return `ADC ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'sbc-pair':
      return `SBC ${upper(inst.dest ?? 'hl')}, ${upper(inst.src)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set':
      return `SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set-ind':
      return `SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res':
      return `RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res-ind':
      return `RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'alu-reg':
      return formatAlu(inst.op, upper(inst.src));
    case 'alu-imm':
    case 'alu-immediate':
      return formatAlu(inst.op, hexByte(inst.value));
    case 'alu-ind':
      return formatAlu(inst.op, '(HL)');
    case 'ld-special':
      return `LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'ldi':
      return 'LDI';
    case 'ldd':
      return 'LDD';
    default: {
      const extra = fallbackOperands(inst);
      return extra ? `${inst.tag} ${extra}` : inst.tag;
    }
  }
}

function decodeRow(pc) {
  const inst = decodeInstruction(rom, pc, MODE);
  const length = Math.max(1, inst?.length ?? 1);
  const nextPc = inst?.nextPc ?? (pc + length);
  return {
    pc,
    bytes: bytesHex(pc, length),
    inst,
    text: renderInstruction(inst),
    nextPc,
  };
}

function collectRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    const row = decodeRow(pc);
    rows.push(row);
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) break;
    pc = row.nextPc;
  }
  return rows;
}

function classifyMemoryDirection(inst) {
  if (inst?.tag === 'ld-reg-mem') return 'read';
  if (inst?.tag === 'ld-mem-reg' || inst?.tag === 'ld-mem-pair') return 'write';
  if (inst?.tag === 'ld-pair-mem') {
    return inst.direction === 'to-mem' ? 'write' : 'read';
  }
  return null;
}

function getAbsoluteAddress(inst) {
  return inst?.addr;
}

function noteIY(inst) {
  if (!inst?.indexRegister || upper(inst.indexRegister) !== 'IY') return null;
  const displacement = (inst.displacement ?? 0) & 0xFF;
  const offset = `IY+${hex(displacement, 2)}`;
  if (inst.tag === 'indexed-cb-bit') return `test ${offset} bit ${inst.bit}`;
  if (inst.tag === 'indexed-cb-set') return `set ${offset} bit ${inst.bit}`;
  if (inst.tag === 'indexed-cb-res') return `clear ${offset} bit ${inst.bit}`;
  return `touch ${offset}`;
}

function annotateBlockMove(rows, index) {
  const row = rows[index];
  if (!row?.inst || (row.inst.tag !== 'ldir' && row.inst.tag !== 'lddr')) return null;

  let deValue = null;
  let bcValue = null;

  for (let i = Math.max(0, index - 4); i < index; i += 1) {
    const inst = rows[i].inst;
    if (inst?.tag === 'ld-pair-imm' && inst.pair === 'de') {
      deValue = inst.value;
    }
    if (inst?.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      bcValue = inst.value;
    }
  }

  if (deValue !== null && bcValue !== null) {
    const end = deValue + Math.max(0, bcValue - 1);
    return `${upper(row.inst.tag)} copies ${bcValue} byte(s) to ${hex(deValue)}..${hex(end)}`;
  }

  return null;
}

function annotationForRow(rows, index) {
  const row = rows[index];
  const notes = [];
  const addr = getAbsoluteAddress(row.inst);
  const direction = classifyMemoryDirection(row.inst);
  const iyNote = noteIY(row.inst);
  const target = row.inst?.target;
  const blockMove = annotateBlockMove(rows, index);

  if (direction && addr !== undefined) {
    notes.push(`${direction} ${RAM_NAMES.get(addr) ?? hex(addr)}`);
  }
  if (iyNote) notes.push(iyNote);
  if (target !== undefined) {
    notes.push(`target ${hex(target)}${TARGET_NAMES.has(target) ? ` (${TARGET_NAMES.get(target)})` : ''}`);
  }
  if (blockMove) notes.push(blockMove);

  return notes;
}

function printRows(title, rows, highlights = new Set()) {
  console.log('='.repeat(96));
  console.log(title);
  console.log('='.repeat(96));
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const marker = highlights.has(row.pc) ? '>' : ' ';
    const notes = annotationForRow(rows, index);
    const suffix = notes.length ? `  ; ${notes.join(' | ')}` : '';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(18)} ${row.text}${suffix}`);
  }
  console.log('');
}

function printMemorySummary(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));

  const refs = [];
  for (const row of rows) {
    const addr = getAbsoluteAddress(row.inst);
    const direction = classifyMemoryDirection(row.inst);
    if (addr === undefined || !direction) continue;
    refs.push(`${hex(row.pc)}  ${direction.padEnd(5)} ${hex(addr)}  ${RAM_NAMES.get(addr) ?? ''}  ${row.text}`.trimEnd());
  }

  if (!refs.length) {
    console.log('none');
  } else {
    for (const ref of refs) console.log(ref);
  }
  console.log('');
}

function printIYSummary(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));

  const refs = rows
    .map((row) => ({
      pc: row.pc,
      note: noteIY(row.inst),
      text: row.text,
    }))
    .filter((item) => item.note);

  if (!refs.length) {
    console.log('none');
  } else {
    for (const ref of refs) {
      console.log(`${hex(ref.pc)}  ${ref.note}  ${ref.text}`);
    }
  }
  console.log('');
}

function printControlSummary(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));

  const refs = rows
    .filter((row) => row.inst?.target !== undefined)
    .map((row) => {
      const label = TARGET_NAMES.get(row.inst.target);
      return `${hex(row.pc)}  ${row.text} -> ${hex(row.inst.target)}${label ? ` (${label})` : ''}`;
    });

  if (!refs.length) {
    console.log('none');
  } else {
    for (const ref of refs) console.log(ref);
  }
  console.log('');
}

function tryDecodePath(start, target, maxSteps = 48) {
  const rows = [];
  let pc = start;

  for (let step = 0; step < maxSteps && pc <= target; step += 1) {
    const row = decodeRow(pc);
    rows.push(row);
    if (pc === target) return rows;
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) return null;
    pc = row.nextPc;
  }

  return null;
}

function findAlignedRows(target, maxLookback = 0x20) {
  const minStart = Math.max(0, target - maxLookback);
  let best = null;

  for (let start = minStart; start <= target; start += 1) {
    const rows = tryDecodePath(start, target);
    if (!rows) continue;

    const beforeCount = rows.length - 1;
    const byteSpan = target - start;
    const score = beforeCount * 1000 - byteSpan;

    if (!best || score > best.score) {
      best = { score, rows };
    }
  }

  return best?.rows ?? [decodeRow(target)];
}

function buildContext(target, before = 3, after = 3) {
  const rows = [...findAlignedRows(target)];
  let targetIndex = rows.findIndex((row) => row.pc === target);

  if (targetIndex === -1) return [decodeRow(target)];

  let pc = rows[rows.length - 1].nextPc;
  while (rows.length < targetIndex + 1 + after && pc < rom.length) {
    const row = decodeRow(pc);
    rows.push(row);
    if (!Number.isInteger(row.nextPc) || row.nextPc <= pc) break;
    pc = row.nextPc;
  }

  targetIndex = rows.findIndex((row) => row.pc === target);
  const startIndex = Math.max(0, targetIndex - before);
  const endIndex = Math.min(rows.length, targetIndex + after + 1);
  return rows.slice(startIndex, endIndex);
}

function searchAbsoluteReferences(target) {
  const targetBytes = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const hits = [];
  const seen = new Set();

  for (const refOp of REF_OPS) {
    for (let pc = 0; pc <= rom.length - 4; pc += 1) {
      if (
        rom[pc] === refOp.opcode &&
        rom[pc + 1] === targetBytes[0] &&
        rom[pc + 2] === targetBytes[1] &&
        rom[pc + 3] === targetBytes[2]
      ) {
        const key = `${pc}:${refOp.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let row = null;
        try {
          row = decodeRow(pc);
        } catch {
          row = null;
        }

        hits.push({
          pc,
          kind: refOp.kind,
          row,
        });
      }
    }
  }

  hits.sort((left, right) => left.pc - right.pc || left.kind.localeCompare(right.kind));
  return hits;
}

function printReferenceSearch(target, title) {
  const refs = searchAbsoluteReferences(target);

  console.log(title);
  console.log('-'.repeat(title.length));
  console.log(`Target: ${hex(target)}${TARGET_NAMES.has(target) ? ` (${TARGET_NAMES.get(target)})` : ''}`);

  if (!refs.length) {
    console.log('No JP/CALL opcode references found anywhere in the ROM.');
    console.log('');
    return refs;
  }

  console.log(`Found ${refs.length} JP/CALL reference(s):`);
  for (const ref of refs) {
    console.log(`  ${hex(ref.pc)}  ${ref.row?.text ?? ref.kind}`);
    const context = buildContext(ref.pc, 3, 3);
    for (const row of context) {
      const marker = row.pc === ref.pc ? '>' : ' ';
      console.log(`  ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(18)} ${row.text}`);
    }
    console.log('');
  }

  return refs;
}

function conditionString(value) {
  if (value === true) return 'taken';
  if (value === false) return 'not taken';
  return 'unknown';
}

function traceRecoveryPath() {
  const steps = [];
  const state = {
    a: null,
    b: null,
    c: null,
    z: null,
    mem: new Map(),
  };

  let pc = 0x0302A5;
  let stepCount = 0;

  while (stepCount < 48) {
    const row = decodeRow(pc);
    let note = '';

    switch (row.inst?.tag) {
      case 'ld-reg-imm':
        if (row.inst.dest === 'a') state.a = row.inst.value;
        if (row.inst.dest === 'b') state.b = row.inst.value;
        if (row.inst.dest === 'c') state.c = row.inst.value;
        break;
      case 'ld-reg-reg':
        if (row.inst.dest === 'a') state.a = state[row.inst.src] ?? null;
        if (row.inst.dest === 'b') state.b = state[row.inst.src] ?? null;
        if (row.inst.dest === 'c') state.c = state[row.inst.src] ?? null;
        break;
      case 'ld-reg-mem':
        if (row.inst.dest === 'a') state.a = state.mem.get(row.inst.addr) ?? null;
        break;
      case 'ld-mem-reg':
        if (row.inst.src === 'a') state.mem.set(row.inst.addr, state.a);
        break;
      case 'alu-imm':
        if (row.inst.op === 'cp' && state.a !== null) {
          state.z = state.a === row.inst.value;
          note = `A=${hexByte(state.a)} vs ${hexByte(row.inst.value)} -> Z=${state.z ? 1 : 0}`;
        }
        break;
      default:
        break;
    }

    steps.push({
      pc,
      text: row.text,
      note,
    });

    if (row.inst?.tag === 'jr-conditional' || row.inst?.tag === 'jp-conditional') {
      let decision = null;
      if (row.inst.condition === 'z') decision = state.z;
      if (row.inst.condition === 'nz') decision = state.z === null ? null : !state.z;

      steps[steps.length - 1].note = [
        steps[steps.length - 1].note,
        `${upper(row.inst.condition)} branch ${conditionString(decision)}`,
      ].filter(Boolean).join(' ; ');

      if (decision === null) break;
      pc = decision ? row.inst.target : row.inst.fallthrough;
      stepCount += 1;
      continue;
    }

    if (row.inst?.tag === 'jp') {
      if (row.inst.target === TAIL_TARGET) {
        steps[steps.length - 1].note = 'tail-jump into 0x08C519; tracing continues there';
      } else {
        steps[steps.length - 1].note = [steps[steps.length - 1].note, `tail-jump to ${hex(row.inst.target)}`]
          .filter(Boolean)
          .join(' ; ');
      }
      pc = row.inst.target;
      stepCount += 1;
      if (row.inst.target !== TAIL_TARGET) break;
      continue;
    }

    if (row.inst?.tag === 'ret' || row.inst?.tag === 'reti' || row.inst?.tag === 'retn') {
      break;
    }

    if (row.inst?.tag === 'call') {
      steps[steps.length - 1].note = [
        steps[steps.length - 1].note,
        `call ${hex(row.inst.target)}${TARGET_NAMES.has(row.inst.target) ? ` (${TARGET_NAMES.get(row.inst.target)})` : ''}`,
      ].filter(Boolean).join(' ; ');
    }

    if (row.inst?.tag === 'indexed-cb-bit') {
      break;
    }

    pc = row.nextPc;
    stepCount += 1;
  }

  console.log('Known-path trace from the recovery fallthrough');
  console.log('----------------------------------------------');
  console.log('Entry condition: the gate at 0x03029F only reaches this body when `BIT 0,(IX-0x0E)` is non-zero,');
  console.log('so `JR Z,0x0302E6` is not taken and execution falls through into the recovery body at 0x0302A5.');
  console.log('');

  for (const step of steps) {
    const suffix = step.note ? `  ; ${step.note}` : '';
    console.log(`${hex(step.pc)}  ${step.text}${suffix}`);
  }

  console.log('');
  console.log('Interpretation:');
  console.log('  - The recovery path itself does not RET.');
  console.log('  - It restores `SP` from `onSP` at 0xD007FA, clears `IY+0x12` bit 2, writes 0x40 to `cxCurApp` at 0xD007E0,');
  console.log('    clears three more IY flags, loads `A=0x58`, and jumps into `0x08C5D7`.');
  console.log('  - From that entry state (`A=0x58`, `cxCurApp=0x40`), `0x08C5D7` takes the NZ path, calls `0x08C7AD`, and tail-jumps to `0x08C519`.');
  console.log('  - At `0x08C519`, `A=0x58` skips the CLEAR (`0x28`) and special `0x29` cases, then enters the broader dispatch path;');
  console.log('    from `0x08C543` onward the path becomes state-dependent on `BIT 7,(IY+0x0E)` and no longer resolves from the recovery writes alone.');
  console.log('');
}

function printFinalSummary(recoveryRefs, dispatchRefs) {
  console.log('Summary');
  console.log('-------');
  console.log(`- Direct JP/CALL references to ${hex(RECOVERY_ENTRY)}: ${recoveryRefs.length}.`);
  console.log(`  The recovery clear site is not entered by a direct JP/CALL anywhere in ROM; it is the local fallthrough body of the gate at ${hex(RECOVERY_GATE_START)}.`);
  console.log(`- Direct JP/CALL references to ${hex(DISPATCH_ENTRY)}: ${dispatchRefs.length}.`);
  if (dispatchRefs.length) {
    console.log(`  Sites: ${dispatchRefs.map((ref) => hex(ref.pc)).join(', ')}.`);
  }
  console.log(`- ${hex(RECOVERY_ENTRY)} restores SP from ${hex(0xD007FA)}, clears IY bits at +0x12/+0x01/+0x25/+0x41, and writes 0x40 to ${hex(0xD007E0)}.`);
  console.log(`- ${hex(DISPATCH_ENTRY)} is a dispatcher, not a leaf. On the error-recovery entry state it does not RET; it tail-jumps to ${hex(TAIL_TARGET)} after calling ${hex(0x08C7AD)}.`);
  console.log(`- The first state-dependent branch after that tail is ${hex(0x08C543)}: \`BIT 7,(IY+0x0E)\`.`);
  console.log('');
}

function main() {
  console.log('Phase 396 - Trace Error Recovery Path 0x0302CA');
  console.log(`ROM: ${ROM_PATH.pathname}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  if (rom.length !== EXPECTED_ROM_SIZE) {
    console.log(`WARNING: expected ${EXPECTED_ROM_SIZE} bytes (${hex(EXPECTED_ROM_SIZE, 8)}).`);
  }
  console.log('');

  const recoveryGateRows = collectRange(RECOVERY_GATE_START, RECOVERY_GATE_WINDOW_END);
  const recoveryRequestedRows = collectRange(RECOVERY_ENTRY, RECOVERY_WINDOW_END);
  const dispatchRows = collectRange(DISPATCH_ENTRY, DISPATCH_WINDOW_END);
  const tailRows = collectRange(TAIL_TARGET, TAIL_WINDOW_END);

  printRows(
    `Recovery gate + body: ${hex(RECOVERY_GATE_START)}..${hex(RECOVERY_GATE_WINDOW_END)}`,
    recoveryGateRows,
    new Set([RECOVERY_ENTRY]),
  );
  printMemorySummary('Recovery gate/body RAM references', recoveryGateRows);
  printIYSummary('Recovery gate/body IY flag touches', recoveryGateRows);
  printControlSummary('Recovery gate/body control targets', recoveryGateRows);

  printRows(
    `Requested recovery window: ${hex(RECOVERY_ENTRY)}..${hex(RECOVERY_WINDOW_END)}`,
    recoveryRequestedRows,
    new Set([RECOVERY_ENTRY]),
  );
  printMemorySummary('Requested recovery-window RAM references', recoveryRequestedRows);
  printIYSummary('Requested recovery-window IY flag touches', recoveryRequestedRows);

  printRows(
    `Action dispatch extended window: ${hex(DISPATCH_ENTRY)}..${hex(DISPATCH_WINDOW_END)}`,
    dispatchRows,
    new Set([DISPATCH_ENTRY]),
  );
  printMemorySummary('Action-dispatch RAM references', dispatchRows);
  printIYSummary('Action-dispatch IY flag touches', dispatchRows);
  printControlSummary('Action-dispatch control targets', dispatchRows);

  printRows(
    `Tail target reached from the recovery path: ${hex(TAIL_TARGET)}..${hex(TAIL_WINDOW_END)}`,
    tailRows,
    new Set([TAIL_TARGET]),
  );
  printMemorySummary('Tail-target RAM references', tailRows);
  printIYSummary('Tail-target IY flag touches', tailRows);

  traceRecoveryPath();

  const recoveryRefs = printReferenceSearch(
    RECOVERY_ENTRY,
    'ROM-wide JP/CALL search for 0x0302CA',
  );
  const dispatchRefs = printReferenceSearch(
    DISPATCH_ENTRY,
    'ROM-wide JP/CALL search for 0x08C5D7',
  );

  printFinalSummary(recoveryRefs, dispatchRefs);
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        probe: 'probe-phase396-error-recovery-0302CA.mjs',
        error: {
          message: error?.message ?? String(error),
          stack: error?.stack ?? String(error),
        },
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
